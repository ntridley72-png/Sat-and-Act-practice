/* One AI opponent: a single dynamic cannon body driven by forces.
 *
 * WHY NOT useRaycastVehicle. Four raycast vehicles with suspension and
 * per-wheel friction is where the frame budget dies -- that is twelve
 * suspension solves and twelve friction solves per opponent per step. This
 * uses ONE rigid body and a simplified tyre model, which is roughly an order
 * of magnitude cheaper.
 *
 * WHY NOT KINEMATIC. A kinematic body would be cheaper still, but it writes
 * position directly, and that discards the one guarantee the driver design is
 * built on: that a car cannot out-grip its tyres or teleport. Forces preserve
 * it, and they also make player-vs-opponent contact physically honest for
 * free, because both are real bodies in the same solver.
 *
 * COLLISION FIDELITY, as §7.4 asks to be stated: player-vs-opponent is solid,
 * because both are dynamic bodies and cannon resolves them properly.
 * Opponent-vs-opponent is approximate -- the bodies collide, but the drivers
 * only avoid each other through the lateral-offset term, so two AI cars
 * fighting for the same line will touch rather than negotiate. That is the
 * right trade: the player feels every contact they are involved in, and the
 * cost of a proper multi-car negotiation is paid nowhere the player can see.
 *
 * COORDINATE BOUNDARY. The driver works in v1's 2D (x, y) convention; cannon
 * and three use (x, z) with y up. The conversion happens HERE and nowhere
 * else: driver y maps to world z.
 */
import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useBox } from '@react-three/cannon'
import type { Triplet } from '@react-three/cannon'
import { ProceduralCar } from '../art/ProceduralCar'
import { useEnvironment } from '../art/useEnvironment'
import { createDriver, type SkillName, type DriverCar } from './driver'
import type { RacingLine } from './racingLine'
import { mutation, rivalsFor } from './mutation'
import { yawForXForward, type GridSlot } from './gridSlots'

/** Matches the planning model used to calibrate CORNER_BUDGET. Changing these
 *  invalidates that measurement -- re-run tools/calibrate-corner-budget.mjs. */
const DRIVER_CAR: DriverCar = { wheelbase: 2.65, maxSteer: 0.5, gripG: 1.4 }

/** Collision box height; the mesh is offset down by half of it. */
const BODY_HEIGHT = 1.1

const MASS = 1500
const ENGINE_FORCE = 7200       // N at full throttle, all wheels
const BRAKE_FORCE = 23400       // N at full brake
const DRAG = 0.45               // N per (m/s)^2
const ROLL_RESIST = 180         // N, constant
/* Lateral grip as a force per unit of sideways velocity, saturated at the
 * friction circle. This is the whole tyre model: it is what stops the car
 * sliding sideways through a corner, and the saturation is what makes
 * cornering look honest rather than rail-guided. */
const LATERAL_STIFFNESS = 9000
const MAX_LATERAL = MASS * 9.81 * 1.4

/** The driver's step. Matches <Physics step> so controller and solver agree. */
const FIXED_DT = 1 / 60
/** Most driver steps allowed in one frame, so a long stall cannot teleport a car. */
const MAX_CATCHUP_STEPS = 4
/** Distant cars run their driver every Nth step. */
const DISTANT_STRIDE = 3
/** Beyond this many metres from the camera a car counts as distant. Chosen so
 *  cars the player is racing (and can see mistakes in) always plan at full
 *  rate; the pack further round the circuit is what gets degraded. */
const DISTANT_RADIUS = 70

export interface OpponentProps {
  index: number
  line: RacingLine
  skill: SkillName
  /** Distinct per car, so a grid is deterministic AND the cars differ. */
  seed: string
  archetype: string
  paint: string
  /** This car's slot on the starting grid. */
  slot: GridSlot
  /** Distant cars update less often. §7.5: degrade before cutting grid size. */
  detailed?: boolean
  /** Ordered checkpoint distances; see ai/checkpoints.ts. */
  gates?: readonly number[]
  /** Per-track planning budget; see Grid. */
  cornerBudget?: number
}

export function Opponent({ index, line, skill, seed, archetype, paint, slot, gates = [], cornerBudget }: OpponentProps) {
  const env = useEnvironment()
  const startX = slot.x
  const startZ = slot.z
  const startDistance = slot.distance

  const [ref, api] = useBox(() => ({
    mass: MASS,
    // A box is a crude hull for a car, but opponent-vs-opponent contact is
    // explicitly approximate, and a convex hull per car would cost more in
    // broadphase than the fidelity is worth here.
    // [length, height, width]: the LONG axis is X, matching the mesh
    // orientation set below. Sized to the car's long axis, not its width --
    // swapping these gives every opponent a hull turned 90 degrees to its
    // bodywork, which reads as cars bouncing off thin air.
    args: [4.3, BODY_HEIGHT, 1.8] as Triplet,
    position: [startX, 0.8, startZ],
    rotation: [0, yawForXForward(slot.heading), 0],
    angularDamping: 0.6,
    linearDamping: 0.02,
  }))

  const driver = useRef(createDriver({ line, car: DRIVER_CAR, skill, seed, startDistance, id: `ai-${index}`, gates, cornerBudget }))

  /* Body state is read through cannon's subscriptions into plain refs, never
     into React state: these change every frame and a setState here would
     re-render the whole grid 60 times a second. */
  const pos = useRef<Triplet>([startX, 0.8, startZ])
  const vel = useRef<Triplet>([0, 0, 0])
  const rot = useRef<Triplet>([0, yawForXForward(slot.heading), 0])
  const angVel = useRef<Triplet>([0, 0, 0])

  useEffect(() => {
    const subs = [
      api.position.subscribe((v) => (pos.current = v)),
      api.velocity.subscribe((v) => (vel.current = v)),
      api.rotation.subscribe((v) => (rot.current = v)),
      api.angularVelocity.subscribe((v) => (angVel.current = v)),
    ]
    const slot = mutation.opponents[index]
    slot.active = true
    mutation.count = Math.max(mutation.count, index + 1)
    return () => {
      subs.forEach((unsub) => unsub())
      slot.active = false
    }
  }, [api, index])

  /* FIXED TIMESTEP, and this is what makes replay possible at all.
   *
   * Feeding useFrame's wall-clock `delta` straight into the driver would make
   * the control sequence depend on frame timing, so the same seed would
   * produce a different race on every run -- even on the same machine, which
   * is the determinism level this project actually promises. The driver's slew
   * limit and offset pursuit are both per-second rates, so a jittery dt moves
   * the car differently every time.
   *
   * So the driver is stepped at exactly FIXED_DT regardless of frame rate, and
   * leftover real time accumulates. cannon is already fixed-step via
   * <Physics step>, so the two now agree instead of drifting apart.
   */
  const accum = useRef(0)
  const tick = useRef(0)
  /** Last control the driver produced. Forces are applied from this every
   *  step, so a distant car still gets pushed on the steps it does not plan. */
  const ctrlRef = useRef({ throttle: 0, brake: 0, steer: 0, handbrake: 0 })
  /** Whether this car is far enough away to plan at a reduced rate. */
  const farFromCamera = useRef(false)

  useFrame((state, delta) => {
    /* Which cars are "distant" is decided HERE, per frame, from the camera.
     *
     * Previously this read a `detailed` prop that Grid never passed, so every
     * car was always near and the whole degradation path was unreachable dead
     * code -- §7.5 was satisfied on paper only. Measuring against the live
     * camera makes it real, and it is recomputed rather than memoised because
     * a car's distance is exactly the thing that changes during a race. */
    const [cx, , cz] = pos.current
    const cam = state.camera.position
    const dx = cam.x - cx
    const dz = cam.z - cz
    farFromCamera.current = dx * dx + dz * dz > DISTANT_RADIUS * DISTANT_RADIUS

    // Cap the catch-up. After a tab switch delta can be seconds, and without
    // this the car would take a hundred steps in one frame and teleport.
    accum.current += Math.min(delta, 0.25)

    let steps = 0
    while (accum.current >= FIXED_DT && steps < MAX_CATCHUP_STEPS) {
      accum.current -= FIXED_DT
      steps++
      tick.current++

      /* §7.5: degrade distant cars BEFORE cutting grid size -- but degrade the
       * PLANNING only, never the physics.
       *
       * An earlier version skipped the whole step for a distant car, which
       * also skipped applyLocalForce/applyTorque. cannon clears accumulated
       * forces after every step, so the car received roughly one frame of
       * propulsion, grip and steering torque in three: not the same car
       * thinking less often, but a materially weaker car that could not keep
       * up or hold a corner. Distant cars would quietly fall off the back of
       * the field.
       *
       * So the driver is consulted every STRIDE-th step and its control is
       * CACHED, while forces are applied on every single step from that cache.
       */
      const stride = farFromCamera.current ? DISTANT_STRIDE : 1
      if (tick.current % stride === 0) plan(FIXED_DT * stride)
      applyForces()
    }
  })

  /** Read body state, update the shared slot, and ask the driver for a control.
   *  Called every step for a near car, every STRIDE-th for a distant one. */
  function plan(step: number) {
    const [px, , pz] = pos.current
    const [vxw, , vzw] = vel.current
    // Cannon yaw is about +Y; the driver's 2D heading runs the other way
    // because its y axis maps to world z. Negating here is the whole of that
    // conversion, and getting it wrong makes every car steer the wrong way.
    const heading = -rot.current[1]
    const yawRate = -angVel.current[1]

    const cos = Math.cos(heading)
    const sin = Math.sin(heading)
    // World velocity into the body frame: forward and sideways.
    const vForward = vxw * cos + vzw * sin
    const vLateral = -vxw * sin + vzw * cos

    const speed = Math.hypot(vForward, vLateral)
    const slipR = speed > 1 ? Math.atan2(vLateral, Math.max(Math.abs(vForward), 1)) : 0

    const slot = mutation.opponents[index]
    slot.x = px
    slot.y = pz
    slot.heading = heading
    slot.vx = vForward
    slot.vy = vLateral
    slot.yawRate = yawRate
    slot.slipR = slipR
    slot.progress = driver.current.progress
    slot.lap = driver.current.lap

    ctrlRef.current = driver.current.control(slot, rivalsFor(index), step)
  }

  /** Apply the cached control as forces. Called EVERY step, because cannon
   *  clears forces between steps and a car that is not pushed is not driven. */
  function applyForces() {
    const ctrl = ctrlRef.current
    const slot = mutation.opponents[index]
    const vForward = slot.vx
    const vLateral = slot.vy
    const speed = Math.hypot(vForward, vLateral)

    // Longitudinal: engine and brake along the body's forward axis. Brake acts
    // against the direction of travel rather than as reverse thrust, so a
    // stationary car is not shoved backwards.
    const drive = ctrl.throttle * ENGINE_FORCE
    const braking = ctrl.brake * BRAKE_FORCE * (vForward > 0.5 ? 1 : 0)
    const resist = DRAG * vForward * Math.abs(vForward) + (speed > 0.2 ? ROLL_RESIST : 0)
    const fForward = drive - braking - resist

    // Lateral: resist sideways motion, saturated at the friction circle. Past
    // saturation the car slides, which is what makes a corner taken too fast
    // actually go wrong instead of being quietly corrected.
    const fLateral = Math.max(-MAX_LATERAL, Math.min(MAX_LATERAL, -LATERAL_STIFFNESS * vLateral))

    api.applyLocalForce([fForward, 0, 0], [0, 0, 0])
    api.applyLocalForce([0, 0, fLateral], [0, 0, 0])

    // Steering as a yaw torque scaled by speed: a stationary car cannot turn,
    // which is both correct and stops the AI pirouetting on the grid.
    const steerAngle = ctrl.steer * DRIVER_CAR.maxSteer
    const yawDemand = (vForward * Math.tan(steerAngle)) / DRIVER_CAR.wheelbase
    const yawError = yawDemand - mutation.opponents[index].yawRate
    api.applyTorque([0, -yawError * 2600, 0])
  }

  return (
    <group ref={ref as never}>
      {/* ORIENTATION, and it is load-bearing. ProceduralCar hands back a car
          facing +Z (see its comment). The force model here works in local +X
          -- applyLocalForce([fForward,0,0]) with heading = -yaw -- so the mesh
          is turned 90 degrees to put its nose on +X. Rotation about Y by +90
          maps (0,0,1) to (1,0,0). Without this the cars accelerate
          perpendicular to their own bodywork. */}
      {/* y offset for the same reason as the player car: racing3d.js builds
          a car whose origin is GROUND LEVEL, while a cannon box is centred on
          its origin, so without this the bodywork floats half a box up. */}
      <group rotation={[0, Math.PI / 2, 0]} position={[0, -BODY_HEIGHT / 2, 0]}>
        <ProceduralCar archetype={archetype} paint={paint} env={env} />
      </group>
    </group>
  )
}
