/* Upstream's vehicle tuning, copied VERBATIM and deliberately not retuned.
 *
 * These numbers are the good feel. They come from
 * vendor/pmndrs-racing-game/src/store.ts lines 20-60 at the pinned commit and
 * are reproduced here unchanged so the player car behaves as upstream's did
 * before anything about this project is blamed for how it drives.
 *
 * Expect to revisit them once the cars are original: mass and wheelbase have
 * shifted (procedural archetypes are not upstream's chassis), so the values
 * that were right for their car are only a starting point for ours. Retune
 * ONLY after it runs, and change one number at a time.
 */
export const vehicleConfig = {
  width: 1.7,
  height: -0.3,
  front: 1.35,
  back: -1.3,
  steer: 0.3,
  force: 1800,
  maxBrake: 65,
  /* RETUNED, and this is the one upstream value deliberately changed.
   *
   * Upstream's 88 m/s is 317 km/h, tuned for their much larger circuit. Apex
   * Flats is 595 m with a 13.2 m hairpin and a 111 m longest straight.
   * tools/speed-envelope.mjs derives what the geometry actually supports:
   *   slowest corner   48 km/h at full 1.4g
   *   peak on straight 106 km/h accelerating then braking back down
   * At 317 km/h the car cannot take any corner on the circuit -- it simply
   * left the road every lap, which is precisely what it did. 32 m/s is 8%
   * over the straight-line peak, so the limiter shapes the top end without
   * the player hitting it constantly, and it sits right where the AI already
   * tops out (120-123 km/h), which keeps the field competitive.
   *
   * §6 anticipated this: keep the tuning intact INITIALLY, revisit once the
   * cars and track are original. They are. Re-run speed-envelope.mjs if the
   * circuit changes. */
  maxSpeed: 32,
} as const

export const wheelInfo = {
  axleLocal: [-1, 0, 0] as [number, number, number],
  customSlidingRotationalSpeed: -0.01,
  directionLocal: [0, -1, 0] as [number, number, number],
  frictionSlip: 1.5,
  radius: 0.38,
  rollInfluence: 0,
  sideAcceleration: 3,
  suspensionRestLength: 0.35,
  suspensionStiffness: 30,
  useCustomSlidingRotationalSpeed: true,
}

/** Per-frame values that must not go through React state. Mirrors upstream's
 *  store.ts split: zustand for UI, a plain mutable object for the frame loop.
 *  This is why the render loop does not thrash React. */
export const playerMutation = {
  speed: 0,
  sliding: false,
  boost: 100,
  resetRequest: 0,
  driftScore: 0,
  driftCombo: 1,
  driftAngle: 0,
  /** Drivetrain read-outs for the HUD and the engine note: current gear (1-6) and engine speed 0..1. */
  gear: 1,
  rpm: 0.25,
}

/* The driving model. Everything here is about how the car feels to a keyboard driver:
 * throttle and brake ramp instead of snapping, the steering lock shrinks with speed so the
 * car can never be asked for more than the tyres can give, and power fades toward the top end.
 * The circuit data was built around ~1.4 g of cornering grip (tools/speed-envelope.mjs), so
 * that is the dry peak used here. */
export const driving = {
  gravity: 9.81,
  /** Dry-tarmac peak lateral grip, in g. Measured: the raycast tyres saturate near 0.9 g, so the
   *  steering lock is limited to what they can actually hold (bench/handling.cjs). */
  gripG: 1.3,
  /** Fraction of the grip-limited steering angle the car is allowed to use. */
  gripUse: 0.97,
  /** Throttle and brake ramp rates, per second. Pedals have travel; keys do not. */
  throttleRise: 6, throttleFall: 9, brakeRise: 8, brakeFall: 14,
  /** Peak brake force per wheel (front, rear): about 64/36 bias. */
  brakeFront: 26, brakeRear: 15,
  /** Reverse is a crawl, not a second accelerator. */
  reversePower: 0.5, reverseMax: 9,
  /** Gear tops as a fraction of top speed, for the read-outs. */
  gearTops: [0.17, 0.31, 0.46, 0.62, 0.8, 1],
  /** Torque dip while the gearbox changes, seconds and remaining fraction. */
  shiftTime: 0.12, shiftTorque: 0.55,
  /** Idle engine speed as a fraction of the redline. */
  idle: 0.22,
} as const
