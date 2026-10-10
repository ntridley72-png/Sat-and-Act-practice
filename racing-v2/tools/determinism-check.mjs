/* Verify the determinism claim: same seed in, same control sequence out.
 *
 * The promise is same-machine session replay, not cross-machine bit-exactness.
 * This checks the part that is actually promised, and checks the thing that
 * would break it: that the driver's output depends only on (seed, state, dt)
 * and never on wall-clock timing or call order.
 *
 * It also checks the inverse -- that a DIFFERENT seed produces a different
 * race. A "deterministic" driver that ignores its seed would pass the first
 * test trivially and be useless for a grid.
 */
import { buildRacingLine, APEX_FLATS } from '../src/ai/racingLine'
import { createDriver } from '../src/ai/driver'

const line = buildRacingLine(APEX_FLATS)
const CAR = { wheelbase: 2.65, maxSteer: 0.5, gripG: 1.4 }
const FIXED_DT = 1 / 60

/* Drive the simple kinematic model for N steps and record every control the
 * driver emitted. The vehicle model does not need to be accurate here -- it
 * only has to be reproducible, so that any divergence is the driver's. */
function run(seed, skill, steps = 3000) {
  const start = line.at(0)
  let x = start.x, y = start.y, psi = start.heading, v = 14
  const d = createDriver({ line, car: CAR, skill, seed })
  const trace = []
  for (let i = 0; i < steps; i++) {
    const state = { x, y, heading: psi, vx: v, vy: 0, yawRate: 0, slipR: 0 }
    const c = d.control(state, null, FIXED_DT)
    trace.push(c.throttle, c.brake, c.steer)
    const delta = c.steer * CAR.maxSteer
    psi += (v * Math.tan(delta)) / CAR.wheelbase * FIXED_DT
    v = Math.max(2, v + (c.throttle * 6 - c.brake * 12) * FIXED_DT)
    x += Math.cos(psi) * v * FIXED_DT
    y += Math.sin(psi) * v * FIXED_DT
  }
  return trace
}

function identical(a, b) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

let failures = 0

for (const skill of ['easy', 'medium', 'hard']) {
  const a = run('race-7', skill)
  const b = run('race-7', skill)
  const same = identical(a, b)
  console.log(`  ${skill.padEnd(7)} same seed twice: ${same ? 'IDENTICAL' : 'DIVERGED'} (${a.length} control values)`)
  if (!same) failures++
}

// A different seed must actually change the race.
const s1 = run('race-7', 'medium')
const s2 = run('race-8', 'medium')
const differs = !identical(s1, s2)
console.log(`  different seed:  ${differs ? 'DIFFERS (good)' : 'IDENTICAL - seed is being ignored!'}`)
if (!differs) failures++

// And interleaving two drivers must not let them affect each other: a shared
// RNG or shared module state would show up here and nowhere else.
const solo = run('race-7', 'medium', 600)
const dA = createDriver({ line, car: CAR, skill: 'medium', seed: 'race-7' })
const dB = createDriver({ line, car: CAR, skill: 'medium', seed: 'other' })
{
  const start = line.at(0)
  let x = start.x, y = start.y, psi = start.heading, v = 14
  const trace = []
  for (let i = 0; i < 600; i++) {
    const state = { x, y, heading: psi, vx: v, vy: 0, yawRate: 0, slipR: 0 }
    const c = dA.control(state, null, FIXED_DT)
    dB.control({ ...state, x: state.x + 400 }, null, FIXED_DT) // decoy, far away
    trace.push(c.throttle, c.brake, c.steer)
    const delta = c.steer * CAR.maxSteer
    psi += (v * Math.tan(delta)) / CAR.wheelbase * FIXED_DT
    v = Math.max(2, v + (c.throttle * 6 - c.brake * 12) * FIXED_DT)
    x += Math.cos(psi) * v * FIXED_DT
    y += Math.sin(psi) * v * FIXED_DT
  }
  const isolated = identical(solo, trace)
  console.log(`  driver isolation: ${isolated ? 'ISOLATED (good)' : 'CONTAMINATED - drivers share state'}`)
  if (!isolated) failures++
}

console.log(failures ? `\n${failures} determinism failure(s)` : '\nAll determinism checks passed.')
process.exit(failures ? 1 : 0)
