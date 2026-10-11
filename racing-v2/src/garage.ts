/* The garage, from the game's side: cars, cash, tuning, payouts.
 *
 * v2 is the complete replacement for v1, so the whole progression lives here:
 * all six tracks are open from the start, every car except the free starter
 * is bought with cash earned by racing (and by converting practice tokens at
 * $250, the v1 rate), and the tune sliders change what the car actually does
 * on track.
 *
 * WHAT LIVES WHERE. The authoritative state is profile.garage, owned by the
 * v1 app and shared with v1's workshop; this module holds only what the React
 * app needs to know -- the types, the display formatting, the payout table,
 * and the pure maths that turns (car, tune) into vehicle parameters. The
 * record-keeping (spend cash, push unlock, save) lives in the vanilla bridge
 * in racing/index.js, because that is where the profile lives; duplicating it
 * here to unit-test a copy would test the copy.
 *
 * DEFAULTS REPRODUCE THE CURRENT FEEL EXACTLY. carPhysics() is calibrated so
 * the free starter car at the default v1 tune returns today's shipped player
 * vehicle numbers (mass 500, frictionSlip 1.5, force 1800 per driven wheel).
 * Anything else would silently re-tune the game on upgrade day.
 */

export type Drive = 'rwd' | 'fwd' | 'awd'

export interface CarSpec {
  id: string
  name: string
  /** Cash price; 0 for the starter. */
  price: number
  /** v2 visual silhouette to render this car with. */
  archetype: string
  starter: boolean
  mass: number
  drive: Drive
  gripFront: number
  gripRear: number
  /** [rpm, torque] pairs from the v1 launch records. */
  torqueCurve: ReadonlyArray<readonly [number, number]>
  /** v1's rear-grip release factor for the handbrake (0..1). */
  handbrakeRelease: number
}

export interface TuneSpec {
  power: number
  grip: number
  weight: number
  handbrake: number
}

/** v1's shipped tune (session.js / DriftCircuit.garage defaults). */
export const DEFAULT_TUNE: TuneSpec = { power: 0.7, grip: 1.35, weight: 1.2, handbrake: 1.0 }
export const TUNE_RANGE = { min: 0.7, max: 1.4 } as const

export interface ResolvedCar {
  mass: number
  frictionSlip: number
  /** Engine force per DRIVEN wheel. */
  engineForce: number
  drive: Drive
  /** Rear brake value while the handbrake is held. */
  handbrakeBrake: number
}

/** Payout table for a scored, FINISHED race. One place to tune the pace. */
export const PAYOUT = {
  base: 500,
  /** Per whole second under 120 s, capped at 90 s of credit. */
  perSecondUnder120: 25,
  perSecondCap: 90,
  /** Per place better than 12th. */
  perPlace: 75,
  lastPlace: 12,
  wetBonus: 150,
} as const

export function racePayout(run: {
  seconds: number
  position: number
  finished: boolean
  weather: string
}): number {
  if (!run.finished) return 0
  const credit = Math.max(0, Math.min(PAYOUT.perSecondCap, 120 - run.seconds))
  const place = Math.max(0, PAYOUT.lastPlace - run.position) * PAYOUT.perPlace
  const wet = run.weather !== 'dry' ? PAYOUT.wetBonus : 0
  return Math.round(PAYOUT.base + credit * PAYOUT.perSecondUnder120 + place + wet)
}

/** Highest torque on the curve, the v1 comparison basis. */
export function peakTorque(curve: ReadonlyArray<readonly [number, number]>): number {
  let best = 0
  for (const [, t] of curve) if (t > best) best = t
  return best
}

/* The reference point: the shipped car at the shipped tune. Every mapping
 * below is expressed relative to these, so the default drive is unchanged. */
const REF_MASS = 1280 // sport coupe, racing/data/cars.js
const REF_GRIP = 1.0 // sport's average of gripFront/gripRear
const REF_FORCE = 1800 // player/config.ts force, per driven wheel
const REF_CHASSIS_MASS = 500 // player/config.ts chassis mass
const REF_SLIP = 1.5 // wheelInfo.frictionSlip
const REF_HANDBRAKE = 0.7 // sport's handbrakeRelease (BASE in the launch records)
const REF_HANDBRAKE_BRAKE = 65 // player/config.ts maxBrake, reused as the rear-handbrake scale

/** Resolve a car + tune into the vehicle parameters the game mounts with. */
export function carPhysics(car: CarSpec, tune: TuneSpec = DEFAULT_TUNE): ResolvedCar {
  const refTorque = 245 // sport's peak torque from the launch records
  const avgGrip = (car.gripFront + car.gripRear) / 2
  const powerRatio = car.torqueCurve.length ? peakTorque(car.torqueCurve) / refTorque : 1
  return {
    mass: REF_CHASSIS_MASS * (car.mass / REF_MASS) * (tune.weight / DEFAULT_TUNE.weight),
    frictionSlip: REF_SLIP * (avgGrip / REF_GRIP) * (tune.grip / DEFAULT_TUNE.grip),
    engineForce: REF_FORCE * powerRatio * (tune.power / DEFAULT_TUNE.power),
    drive: car.drive,
    handbrakeBrake:
      REF_HANDBRAKE_BRAKE * (car.handbrakeRelease / REF_HANDBRAKE) * (tune.handbrake / DEFAULT_TUNE.handbrake),
  }
}

/** Which wheels take engine force, by drivetrain. Indices match the raycast
 *  vehicle: 0,1 front; 2,3 rear (player/Vehicle.tsx). */
export function drivenWheels(drive: Drive): readonly number[] {
  if (drive === 'fwd') return [0, 1]
  if (drive === 'awd') return [0, 1, 2, 3]
  return [2, 3]
}

/** What racing/index.js hands to mount(). Every method is fallible on the
 *  host side; the game treats a refused call as a no-op, never an error. */
export interface GarageBridge {
  cash(): number
  tokens(): number
  /** v1's named paint palette (name -> hex), or null to fall back to v2's. */
  paintPalette(): Record<string, string> | null
  /** Currently selected car id (shared with v1's g.raceCar). */
  car(): string
  tune(): TuneSpec
  unlocked(): string[]
  /** Loads the canonical roster (racing/data/cars.js). Resolves [] on failure. */
  roster(): Promise<CarSpec[]>
  buy(id: string): boolean
  select(id: string): void
  setTune(patch: Partial<TuneSpec>): void
  addCash(amount: number): void
  /** Converts up to n tokens at $250; returns the cash gained. */
  convertTokens(n: number): number
  save(): void
}
