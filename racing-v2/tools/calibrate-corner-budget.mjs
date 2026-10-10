/* Measure CORNER_BUDGET, the way v1 describes measuring it: sweep the budget,
 * drive every skill level around the circuit, and take the largest value at
 * which every car completes without putting a wheel off the road.
 *
 * Run: node --experimental-strip-types tools/calibrate-corner-budget.mjs
 *
 * The vehicle here is a DYNAMIC single-track (bicycle) model with linear tyres
 * and friction-circle saturation, not cannon's raycast vehicle. That is a
 * stated limitation: the number this produces is a planning budget for a
 * driver chasing a centreline against a car with real slip angles and real
 * yaw lag, which is the behaviour the budget has to survive. It is a sound
 * starting value and an honest one; it is not a substitute for checking the
 * car on track once the raycast vehicle is wired in.
 */
import { buildRacingLine, APEX_FLATS } from '../src/ai/racingLine'
import { createDriver, G } from '../src/ai/driver'

const line = buildRacingLine(APEX_FLATS)

// Car: roughly upstream's vehicle, which is what the player will drive.
const CAR = { wheelbase: 2.65, maxSteer: 0.5, gripG: 1.4 }
const M = 1500          // kg
const IZ = 2200         // kg m^2
const A = 1.35          // front axle to CoG, m  (upstream vehicleConfig.front)
const B = 1.30          // rear axle to CoG, m   (upstream vehicleConfig.back)
const CF = 95000        // front cornering stiffness, N/rad
const CR = 110000       // rear, deliberately stiffer so the car understeers
const MU = CAR.gripG    // peak grip, g
const CAR_HALF_WIDTH = 0.9
const FORCE = 1800 * 4  // upstream force 1800 per wheel
const MAX_BRAKE = 65 * 4 * 90

function simulate(skill, budget, seed, { laps = 1, dt = 1 / 60, maxTime = 400 } = {}) {
  const start = line.at(0)
  let x = start.x
  let y = start.y
  let psi = start.heading
  let vx = 12
  let vy = 0
  let r = 0

  const driver = createDriver({ line, car: CAR, skill, seed, cornerBudget: budget, id: skill })

  let t = 0
  let worstOff = 0
  let offRoad = false
  let maxSpeed = 0

  while (t < maxTime) {
    const speed = Math.hypot(vx, vy)
    maxSpeed = Math.max(maxSpeed, speed)

    // Slip angles. Guard vx: at a standstill these are undefined, and the
    // atan2 would otherwise hand the driver a garbage slip angle on lap start.
    const vxs = Math.max(vx, 1)
    const af = Math.atan2(vy + A * r, vxs)
    const ar = Math.atan2(vy - B * r, vxs)

    const ctrl = driver.control(
      { x, y, heading: psi, vx: vx, vy: vy, yawRate: r, slipR: ar },
      null,
      dt,
    )

    const delta = ctrl.steer * CAR.maxSteer

    // Linear tyres, saturated at the friction circle. Saturation is what makes
    // this worth simulating: an unsaturated linear model will corner at any
    // speed you ask of it, so it would validate any budget at all.
    const FzF = (M * G * B) / (A + B)
    const FzR = (M * G * A) / (A + B)
    let FyF = -CF * (af - delta)
    let FyR = -CR * ar
    FyF = Math.max(-MU * FzF, Math.min(MU * FzF, FyF))
    FyR = Math.max(-MU * FzR, Math.min(MU * FzR, FyR))

    const Fx = ctrl.throttle * FORCE - ctrl.brake * MAX_BRAKE * Math.sign(vx || 1) - 0.45 * vx * Math.abs(vx)

    const ayBody = (FyF * Math.cos(delta) + FyR) / M - vx * r
    const axBody = Fx / M + vy * r
    const rdot = (A * FyF * Math.cos(delta) - B * FyR) / IZ

    vx = Math.max(0.5, vx + axBody * dt)
    vy += ayBody * dt
    r += rdot * dt

    psi += r * dt
    x += (vx * Math.cos(psi) - vy * Math.sin(psi)) * dt
    y += (vx * Math.sin(psi) + vy * Math.cos(psi)) * dt

    // Off-road test: lateral distance from the centreline against the road's
    // own half-width, minus half a car. This is the pass/fail criterion.
    const p = line.at(driver.progress)
    const cross = Math.abs((x - p.x) * -Math.sin(p.heading) + (y - p.y) * Math.cos(p.heading))
    const over = cross - (p.half - CAR_HALF_WIDTH)
    if (over > worstOff) worstOff = over
    if (over > 0) offRoad = true

    if (driver.lap >= laps) break
    t += dt
  }

  return { offRoad, worstOff, finished: driver.lap >= laps, laps: driver.lap, t, maxSpeed }
}

const SKILLS = ['easy', 'medium', 'hard']
const SEEDS = ['s1', 's2', 's3', 's4', 's5']

console.log('circuit:', line.length.toFixed(1), 'm   tightest radius: 13.2 m')
console.log('car: wheelbase', CAR.wheelbase, 'm  maxSteer', CAR.maxSteer, 'rad  grip', CAR.gripG, 'g')
console.log('criterion: every skill x every seed completes a lap with no wheel off the road\n')
console.log('budget   worst-overshoot   verdict')

let best = null
for (let budget = 0.10; budget <= 0.90001; budget += 0.05) {
  let ok = true
  let worst = 0
  let anyUnfinished = false
  for (const skill of SKILLS) {
    for (const seed of SEEDS) {
      const res = simulate(skill, budget, seed)
      worst = Math.max(worst, res.worstOff)
      if (res.offRoad) ok = false
      if (!res.finished) { ok = false; anyUnfinished = true }
    }
  }
  const verdict = ok ? 'PASS' : anyUnfinished ? 'FAIL (did not finish)' : 'FAIL (off road)'
  console.log(
    `  ${budget.toFixed(2)}   ${worst >= 0 ? '+' : ''}${worst.toFixed(2)} m`.padEnd(26) + verdict,
  )
  if (ok) best = budget
}

console.log('')
if (best === null) {
  console.log('NO budget passed. The driver cannot hold this circuit; investigate before shipping.')
  process.exit(1)
}
console.log('LARGEST PASSING BUDGET:', best.toFixed(2))
console.log('Set CORNER_BUDGET in src/ai/driver.ts to this value.')
