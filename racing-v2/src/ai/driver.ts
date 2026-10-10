/* Deterministic AI driver.
 *
 * PORTED DESIGN, NOT PORTED CODE. The controller in racing/game/ai.js cannot
 * run against cannon -- it mirrors a grip-limited steering rack that cannon
 * does not have -- but its design is what makes a field of cars race rather
 * than cheat, so that design is reproduced here deliberately:
 *
 *   1. The driver emits ONLY {throttle, brake, steer, handbrake}. It never
 *      writes position, velocity or heading. That is the whole guarantee: a
 *      car physically cannot teleport, cannot corner faster than its tyres
 *      allow, and shows up in a replay exactly the way a human does. This is
 *      also why opponents use a single DYNAMIC body rather than a kinematic
 *      one -- a kinematic body writes position directly and throws the
 *      guarantee away.
 *   2. All chance comes from a seeded stream, so a race replays identically on
 *      the same machine.
 *   3. Speed targets come from a BRAKING PLAN over a horizon as long as the
 *      car's own stopping distance, not from sampling curvature at a fixed
 *      lookahead. v1's comments are emphatic about why, and they are right:
 *      slowing from 200km/h to a 70km/h corner takes ~180m, so a 90m lookahead
 *      arrives at every fast corner already far too quick.
 *   4. Corrections are expressed as CURVATURE, not as angles, over a settling
 *      distance that grows with speed. Stated as angles the controller is
 *      effectively bang-bang.
 *   5. Finite hands: the steering command is slew-limited.
 *
 * WHAT WAS DELIBERATELY NOT PORTED. v1 computed the road-wheel angle a command
 * of 1.0 buys from its own rack limiter, which shrank with the square of speed.
 * cannon's vehicle has no such limiter -- steer input maps roughly linearly to
 * a steer angle, and speed sensitivity comes from the tyre model instead. So
 * `avail` here is simply maxSteer. Carrying v1's formula across would have been
 * cargo-culting a correction for a limiter that is not present.
 */
import { createStream, type Stream } from './random'
import type { RacingLine } from './racingLine'

export type SkillName = 'easy' | 'medium' | 'hard'

export interface SkillProfile {
  /** Fraction of the planned corner speed actually attempted. */
  speed: number
  /** Lookahead multiplier, in seconds of travel. */
  look: number
  /** How fast the chosen lateral offset is pursued, per second. */
  react: number
  /** Maximum lateral offset from the line, as a fraction of half-width. */
  offset: number
  /** Per-tick probability of a small seeded mistake. */
  mistake: number
}

/** Inherited from v1 unchanged: these ratios were tuned against a field of
 *  cars and they describe a DRIVER, not a physics engine, so they transfer. */
export const SKILL: Record<SkillName, SkillProfile> = {
  easy: { speed: 0.80, look: 1.5, react: 5.0, offset: 0.55, mistake: 0.010 },
  medium: { speed: 0.90, look: 1.8, react: 7.5, offset: 0.70, mistake: 0.004 },
  hard: { speed: 0.98, look: 2.1, react: 10.0, offset: 0.85, mistake: 0.001 },
}

export const G = 9.81

/** The vehicle properties the driver needs to plan. Deliberately minimal: the
 *  driver must not be able to reach into the simulation. */
export interface DriverCar {
  /** Axle separation, metres. */
  wheelbase: number
  /** Maximum road-wheel angle, radians, at steer command 1.0. */
  maxSteer: number
  /** Peak lateral grip, in g. The planning budget below is a fraction of this. */
  gripG: number
}

/** What the driver is allowed to observe. Ground plane is (x, y); see
 *  racingLine.ts on why the AI keeps v1's 2D convention. */
export interface DriverState {
  x: number
  y: number
  /** Where the car points, radians. */
  heading: number
  vx: number
  vy: number
  /** Body yaw rate, rad/s. */
  yawRate: number
  /** Rear-axle slip angle, radians. Signed. */
  slipR: number
}

export interface Control {
  throttle: number
  brake: number
  steer: number
  handbrake: number
}

// ---- controller constants, inherited from v1 unless noted -----------------
const UNDERSTEER = 1.0      // road-wheel allowance for tyre slip
const SLEW = 2.6            // how fast the command may move, per second
const SLIDE_LIMIT = 0.26    // rear slip angle past which the driver catches it
const CROSS_GAIN = 1.0
const HEAD_GAIN = 1.0
const SETTLE_PER_SPEED = 2.2
const YAW_DAMP = 0.6
const CROSS_CLAMP = 12      // metres of offset the correction saturates at
const KMAX_DEMAND = 0.09    // never ask for a radius under ~11.1m
const BRAKE_FRACTION = 0.70 // share of grip budgeted for braking
const HORIZON_SAMPLES = 20

/* How much lateral acceleration the driver plans corner speeds around, as a
 * fraction of peak grip.
 *
 * MEASURED, NOT INHERITED. v1 uses 0.15, but that number is a property of v1's
 * physics model and its comment says so. This value was re-measured against
 * the bicycle model in tools/calibrate-corner-budget.mjs, which is the same
 * method v1 describes: sweep the budget, drive every skill level around the
 * circuit, and take the largest value at which every car completes without
 * putting a wheel off the road.
 *
 * MEASUREMENT, 2026-10-10, Apex Flats (594.7m, tightest radius 13.2m), car
 * wheelbase 2.65m / maxSteer 0.5rad / grip 1.4g, 3 skill levels x 5 seeds:
 *
 *     budget   worst overshoot   verdict
 *      0.25       +0.00 m        pass
 *      0.30       +0.00 m        pass   <-- largest passing
 *      0.35       +0.05 m        off road
 *      0.50       +0.49 m        off road
 *      0.90       +1.33 m        off road
 *
 * The failure curve is monotonic, which is the sign the harness is measuring
 * something real rather than returning noise.
 *
 * This is 0.30 where v1 uses 0.15. The difference is expected and is not a
 * contradiction: v1's figure was measured against v1's own physics across
 * seven circuits, this one against a dynamic single-track model on one. The
 * methodology transferred; the number did not, which is exactly what v1's
 * comment warned would happen.
 *
 * It is far below what the car can physically do, and that is correct: the
 * number describes a DRIVER chasing a centreline, not the tyres. Raising it
 * needs a better driver model -- a planned line with real apexes -- not a
 * bigger constant. Re-run tools/calibrate-corner-budget.mjs if the circuit,
 * the car or the grip changes.
 */
export const CORNER_BUDGET = 0.30

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

export interface DriverOptions {
  line: RacingLine
  car: DriverCar
  skill?: SkillName
  seed?: string | number
  startDistance?: number
  id?: string
  /** Grip the driver EXPECTS to find, 1 for a dry road. A driver who does not
   *  know it is raining plans dry corner speeds, arrives at every corner too
   *  fast, and goes straight on. */
  grip?: number
  /** Override the planning budget. Used by the calibration harness. */
  cornerBudget?: number
}

export interface DriverDebug {
  here: number
  headErr: number
  cross: number
  crossErr: number
  kDemand: number
  target: number
  horizon: number
  slide: number
}

export class Driver {
  readonly id: string
  private line: RacingLine
  private car: DriverCar
  private skill: SkillProfile
  private rng: Stream
  private budget: number
  private grip: number

  private offset = 0
  private targetOffset = 0
  private steerState = 0
  progress: number
  lap = 0
  debug: DriverDebug | null = null

  constructor(opts: DriverOptions) {
    this.line = opts.line
    this.car = opts.car
    this.skill = SKILL[opts.skill ?? 'medium']
    this.rng = createStream(opts.seed ?? 'ai')
    this.progress = opts.startDistance ?? 0
    this.id = opts.id ?? 'ai'
    this.grip = clamp(opts.grip ?? 1, 0.2, 1)
    this.budget = opts.cornerBudget ?? CORNER_BUDGET
  }

  /* Where along the line this car is. Walks forward from the last known point
     rather than searching, which keeps it O(1) and stops a car latching onto
     the wrong lap of a closed circuit. */
  private locate(state: DriverState): number {
    const line = this.line
    let best = this.progress
    let bestD = Infinity
    const span = 60
    const stepSize = line.length / 600
    for (let i = -span; i <= span; i++) {
      const d = (this.progress + i * stepSize + line.length) % line.length
      const p = line.at(d)
      const dist = (p.x - state.x) ** 2 + (p.y - state.y) ** 2
      if (dist < bestD) {
        bestD = dist
        best = d
      }
    }
    if (best < this.progress - line.length * 0.5) this.lap++
    this.progress = best
    return best
  }

  /** The control this driver wants. Pure: same state in, same control out. */
  control(state: DriverState, rivals: readonly DriverState[] | null, dt: number): Control {
    const line = this.line
    const sk = this.skill
    const here = this.locate(state)
    const speed = Math.hypot(state.vx, state.vy)

    // ---- avoidance: a lateral offset, bounded by the road -----------------
    this.targetOffset = 0
    if (rivals && rivals.length) {
      for (const r of rivals) {
        if (r === state) continue
        const dx = r.x - state.x
        const dy = r.y - state.y
        const gap = Math.hypot(dx, dy)
        if (gap > 22 || gap < 0.001) continue
        // Only react to something actually in front.
        const bearing = angleDiff(Math.atan2(dy, dx), state.heading)
        if (Math.abs(bearing) > 0.9) continue
        const side = bearing >= 0 ? -1 : 1
        this.targetOffset += side * sk.offset * (1 - gap / 22)
      }
    }
    this.targetOffset = clamp(this.targetOffset, -sk.offset, sk.offset)
    // A seeded wobble, so identical cars do not drive in a perfect column.
    if (this.rng.chance(0.02)) this.targetOffset += this.rng.float(-0.12, 0.12)
    this.offset += (this.targetOffset - this.offset) * clamp(sk.react * dt, 0, 1)
    this.offset = clamp(this.offset, -0.92, 0.92)

    // ---- steering: front-axle path tracking -------------------------------
    const hereP = line.at(here)

    // COURSE, not heading: the direction the car is actually travelling. In a
    // corner the body runs a slip angle, so where it points and where it goes
    // differ, and a heading-only controller never sees that -- it crabs to the
    // inside of every bend and reaches the kerb while heading error is still
    // two hundredths of a radian.
    const course = speed > 2 ? state.heading + Math.atan2(state.vy, Math.abs(state.vx) + 0.001) : state.heading
    const headErr = angleDiff(hereP.heading, course)

    // Signed offset from the line the car is trying to be on; + is left of travel.
    const cross = (state.x - hereP.x) * -Math.sin(hereP.heading) + (state.y - hereP.y) * Math.cos(hereP.heading)
    const half = hereP.half
    const crossErr = clamp(this.offset * half - cross, -CROSS_CLAMP, CROSS_CLAMP)

    // Curvature of the road the car is ON, not the corner it is braking for:
    // feeding the distant corner forward turns in far too early.
    const near = line.at((here + clamp(speed * 0.45, 3, 25)) % line.length)

    // Both corrections as CURVATURE over a settling distance that grows with
    // speed. That scaling is the point: useful road-wheel angle at 120km/h is
    // about two degrees, so a correction stated in radians is either inaudible
    // or full lock with nothing in between.
    const settle = clamp(speed * SETTLE_PER_SPEED, 28, 95)
    const kHead = (HEAD_GAIN * 2 * Math.sin(headErr)) / settle
    const kCross = (CROSS_GAIN * 2 * crossErr) / (settle * settle)
    const kDemand = clamp(near.curvature + kHead + kCross, -KMAX_DEMAND, KMAX_DEMAND)

    const ff = kDemand * this.car.wheelbase * UNDERSTEER

    // Derivative feedback, and not optional. Purely proportional tracking
    // against a vehicle with this much yaw lag oscillates: the correction
    // lands after the car has already come back, so the next one is bigger and
    // opposite, and within three swings the command is going lock to lock.
    const yawErr = speed > 3 ? kDemand * speed - state.yawRate : 0
    const delta = ff + (YAW_DAMP * yawErr * this.car.wheelbase) / Math.max(speed, 4)

    // cannon's rack is not grip-limited, so the available angle is simply the
    // mechanical maximum. See the header note.
    const avail = this.car.maxSteer
    let raw = avail > 1e-6 ? clamp(delta / avail, -1, 1) : 0

    // A rear axle past its peak needs catching, not more lock.
    const slide = clamp((Math.abs(state.slipR) - SLIDE_LIMIT) / 0.22, 0, 1)
    if (slide > 0) raw = raw * (1 - slide) + clamp(state.slipR * 2.4, -1, 1) * slide

    // Rare, small, seeded mistakes keep a field from driving in lockstep.
    // This MUST happen before the slew limit consumes `raw`: an earlier
    // version perturbed `raw` after `steer` had already been computed from it,
    // so the steering half of every mistake was silently discarded and only
    // the throttle lift survived. The cars still wobbled slightly via the
    // offset jitter, which is exactly why the bug was not obvious.
    let mistakeLift = 1
    if (this.rng.chance(sk.mistake)) {
      raw = clamp(raw + this.rng.float(-0.2, 0.2), -1, 1)
      mistakeLift = 0.75
    }

    // Finite hands: lock to lock in about half a second.
    const hop = SLEW * dt
    const steer = clamp(this.steerState + clamp(raw - this.steerState, -hop, hop), -1, 1)

    // ---- speed: a braking plan over the stopping-distance horizon ---------
    const capable = this.car.gripG * G * this.budget * sk.speed * this.grip
    const aBrake = this.car.gripG * G * BRAKE_FRACTION * this.grip
    const horizon = clamp((speed * speed) / (2 * aBrake) + 15, 25, 400)
    let target = 999
    for (let h = 1; h <= HORIZON_SAMPLES; h++) {
      const d = (horizon * h) / HORIZON_SAMPLES
      const kk = Math.abs(line.at((here + d) % line.length).curvature)
      const corner = kk > 1e-5 ? Math.sqrt(capable / kk) : 999
      // v_allowed = sqrt(v_corner^2 + 2*a*d): the speed HERE that still leaves
      // the car slow enough THERE. The minimum over the horizon finds the
      // braking-critical corner, however far away it is.
      const allow = Math.sqrt(corner * corner + 2 * aBrake * d)
      if (allow < target) target = allow
    }
    // And the corner the car is in, which no lookahead point covers.
    const kNow = Math.abs(near.curvature)
    if (kNow > 1e-5) target = Math.min(target, Math.sqrt(capable / kNow))
    target = clamp(target, 4, 150)

    let throttle = 0
    let brake = 0
    if (speed < target * 0.96) throttle = clamp((target - speed) / 6, 0, 1)
    else if (speed > target * 1.04) brake = clamp((speed - target) / 8, 0, 1)

    // Tightening the wheel costs grip, so ease off while cornering hard, and
    // come off it entirely once the rear is away: throttle keeps a slide going.
    throttle *= 1 - clamp(Math.abs(steer) * 0.45, 0, 0.55)
    throttle *= 1 - slide * 0.85

    throttle *= mistakeLift

    this.steerState = steer
    this.debug = { here, headErr, cross, crossErr, kDemand, target, horizon, slide }

    return {
      throttle: clamp(throttle, 0, 1),
      brake: clamp(brake, 0, 1),
      steer: clamp(steer, -1, 1),
      handbrake: 0,
    }
  }
}

export function createDriver(opts: DriverOptions): Driver {
  return new Driver(opts)
}
