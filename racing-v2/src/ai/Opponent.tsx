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
import { createDriver, type SkillName, type DriverCar } from './driver'
import type { RacingLine } from './racingLine'
import { mutation, rivalsFor } from './mutation'

/** Matches the planning model used to calibrate CORNER_BUDGET. Changing these
 *  invalidates that measurement -- re-run tools/calibrate-corner-budget.mjs. */
const DRIVER_CAR: DriverCar = { wheelbase: 2.65, maxSteer: 0.5, gripG: 1.4 }

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

export interface OpponentProps {
  index: number
  line: RacingLine
  skill: SkillName
  /** Distinct per car, so a grid is deterministic AND the cars differ. */
  seed: string
  archetype: string
  paint: string
  /** Metres along the line at the start, i.e. grid slot. */
  startDistance: number
  /** Distant cars update less often. §7.5: degrade before cutting grid size. */
  detailed?: boolean
}

export function Opponent({ index, line, skill, seed, archetype, paint, startDistance, detailed = true }: OpponentProps) {
  const start = line.at(startDistance)

  const [ref, api] = useBox(() => ({
    mass: MASS,
    // A box is a crude hull for a car, but opponent-vs-opponent contact is
    // explicitly approximate, and a convex hull per car would cost more in
    // broadphase than the fidelity is worth here.
    args: [1.8, 1.1, 4.3] as Triplet,
    position: [start.x, 0.6, start.y],
    rotation: [0, -start.heading, 0],
    angularDamping: 0.6,
    linearDamping: 0.02,
  }))

  const driver = useRef(createDriver({ line, car: DRIVER_CAR, skill, seed, startDistance, id: `ai-${index}` }))

  /* Body state is read through cannon's subscriptions into plain refs, never
     into React state: these change every frame and a setState here would
     re-render the whole grid 60 times a second. */
  const pos = useRef<Triplet>([start.x, 0.6, start.y])
  const vel = useRef<Triplet>([0, 0, 0])
  const rot = useRef<Triplet>([0, -start.heading, 0])
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

  // Distant cars are stepped at a lower rate. Accumulated rather than skipped
  // so the driver still sees a correct dt and its slew limit stays meaningful.
  const accum = useRef(0)

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30)
    const stride = detailed ? 1 : 3
    accum.current += dt
    if (accum.current < dt * stride) return
    const step = accum.current
    accum.current = 0

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

    const ctrl = driver.current.control(slot, rivalsFor(index), step)

    // Longitudinal: engine and brake along the body's forward axis. Brake is
    // applied against the direction of travel, not as reverse thrust, so a
    // stationary car does not get shoved backwards.
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
    const yawError = yawDemand - yawRate
    api.applyTorque([0, -yawError * 2600, 0])
  })

  return (
    <group ref={ref as never}>
      <ProceduralCar archetype={archetype} paint={paint} detailed={detailed} />
    </group>
  )
}
