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
}
