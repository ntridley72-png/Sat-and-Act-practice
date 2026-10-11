/* Garage maths: calibration, per-car scaling, payouts.
 *
 * Run: node tools/run.mjs tools/garage-check.mjs
 *
 * The load-bearing assertions are the CALIBRATION ones: the free starter car
 * at the shipped default tune must resolve to exactly the vehicle numbers
 * this game ships today (mass 500, frictionSlip 1.5, force 1800). If that
 * ever drifts, every existing player's car silently changes under them.
 * The roster values below are the real ones from racing/data/cars.js; if the
 * launch records are edited, this file fails and the calibration gets
 * revisited deliberately.
 */
import { carPhysics, drivenWheels, peakTorque, racePayout, DEFAULT_TUNE, PAYOUT } from '../src/garage'
import Cars from '../../racing/data/cars.js'

let failures = 0
function check(name, cond, detail = '') {
  if (cond) console.log(`  PASS  ${name}`)
  else { failures++; console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`) }
}
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps

function spec(id) {
  const c = Cars.CARS[id]
  return {
    id, name: c.name, price: c.unlockPrice, archetype: 'sport', starter: !!c.starter,
    mass: c.mass, drive: c.drive, gripFront: c.gripFront, gripRear: c.gripRear,
    torqueCurve: c.torqueCurve, handbrakeRelease: c.handbrakeRelease,
  }
}

console.log('calibration (the shipped car must not move)')
{
  const sport = carPhysics(spec('sport'), DEFAULT_TUNE)
  check('sport mass is exactly the shipped 500', near(sport.mass, 500), String(sport.mass))
  check('sport frictionSlip is exactly the shipped 1.5', near(sport.frictionSlip, 1.5), String(sport.frictionSlip))
  check('sport engineForce is exactly the shipped 1800', near(sport.engineForce, 1800), String(sport.engineForce))
  check('sport drive stays rwd (rear wheels)', sport.drive === 'rwd' && drivenWheels('rwd').join() === '2,3')
  check('sport handbrake brake equals the maxBrake scale', near(sport.handbrakeBrake, 65), String(sport.handbrakeBrake))
  check('peak torque of the sport curve is the 245 reference', near(peakTorque(Cars.CARS.sport.torqueCurve), 245))
}

console.log('per-car scaling')
{
  const muscle = carPhysics(spec('muscle'), DEFAULT_TUNE)
  check('muscle is heavier by its real mass ratio', near(muscle.mass, 500 * (1620 / 1280), 1e-6), String(muscle.mass))
  check('muscle makes more force by its real torque ratio', muscle.engineForce > 2500, String(muscle.engineForce))

  const awd = carPhysics(spec('rally'), DEFAULT_TUNE)
  check('rally is awd and drives all four wheels', awd.drive === 'awd' && drivenWheels('awd').length === 4)
  check('rally grip is higher than sport', awd.frictionSlip > 1.5, String(awd.frictionSlip))

  const fwd = carPhysics(spec('hatch'), DEFAULT_TUNE)
  check('hatch is fwd and drives the front wheels', fwd.drive === 'fwd' && drivenWheels('fwd').join() === '0,1')

  const light = carPhysics(spec('hatch'), DEFAULT_TUNE)
  check('hatch is lighter than sport', light.mass < 500, String(light.mass))
}

console.log('tune sliders move the right things')
{
  const sport = spec('sport')
  const fast = carPhysics(sport, { ...DEFAULT_TUNE, power: 1.4 })
  check('max power doubles the force vs default', near(fast.engineForce, 3600), String(fast.engineForce))
  const grippy = carPhysics(sport, { ...DEFAULT_TUNE, grip: 1.4 })
  check('max grip raises frictionSlip', grippy.frictionSlip > 1.55, String(grippy.frictionSlip))
  const heavy = carPhysics(sport, { ...DEFAULT_TUNE, weight: 1.4 })
  check('max weight adds mass', heavy.mass > 580, String(heavy.mass))
  check('tune rails hold the reference defaults', DEFAULT_TUNE.power === 0.7 && DEFAULT_TUNE.grip === 1.35)
}

console.log('payouts')
{
  const win = racePayout({ seconds: 100, position: 1, finished: true, weather: 'dry' })
  const expected = PAYOUT.base + 20 * PAYOUT.perSecondUnder120 + 11 * PAYOUT.perPlace
  check('a 100 s win pays base + time + place', win === expected, `${win} vs ${expected}`)
  check('an unfinished run pays nothing', racePayout({ seconds: 30, position: 1, finished: false, weather: 'dry' }) === 0)
  check('the time credit caps at 90 s', racePayout({ seconds: 0, position: 12, finished: true, weather: 'dry' }) === PAYOUT.base + 90 * PAYOUT.perSecondUnder120)
  check('rain adds the wet bonus', racePayout({ seconds: 100, position: 1, finished: true, weather: 'rain' }) === win + PAYOUT.wetBonus)
  check('slower than 120 s pays base + place only', racePayout({ seconds: 150, position: 1, finished: true, weather: 'dry' }) === PAYOUT.base + 11 * PAYOUT.perPlace)
  check('last place still pays the base', racePayout({ seconds: 150, position: 12, finished: true, weather: 'dry' }) === PAYOUT.base)
}

console.log('whole roster resolves sanely')
{
  let bad = 0
  for (const id of Cars.ORDER) {
    const p = carPhysics(spec(id), DEFAULT_TUNE)
    if (!(p.mass > 200 && p.mass < 900) || !(p.frictionSlip > 0.8 && p.frictionSlip < 3) || !(p.engineForce > 800 && p.engineForce < 5000)) {
      bad++
      console.log(`        ${id}: mass ${p.mass.toFixed(0)} slip ${p.frictionSlip.toFixed(2)} force ${p.engineForce.toFixed(0)}`)
    }
  }
  check(`all ${Cars.ORDER.length} cars resolve into playable bounds`, bad === 0)
  check('the starter is free', Cars.CARS.sport.unlockPrice === 0 && Cars.CARS.sport.starter === true)
  check('every non-starter has a real price', Cars.ORDER.every((id) => Cars.CARS[id].starter || Cars.CARS[id].unlockPrice >= 800))
}

console.log('')
if (failures) {
  console.log(`GARAGE CHECK FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log('GARAGE CHECK PASSED')
