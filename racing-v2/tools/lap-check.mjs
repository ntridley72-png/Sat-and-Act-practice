/* Lap counting semantics and the oscillation guard.
 *
 * `lap` is defined as full circuit LENGTHS of net travel, not line crossings.
 * For a staggered grid that is the fairer definition -- every car must cover
 * the same distance regardless of its grid slot -- and it is inherently immune
 * to the finish-line oscillation that broke the old wrap-detection, which
 * scored two laps for one net crossing.
 */
import { trackById, buildTrackLine, DEFAULT_TRACK_ID } from '../src/tracks/catalog'
import { createDriver } from '../src/ai/driver'

const line = buildTrackLine(trackById(process.env.TRACK))
const CAR = { wheelbase: 2.65, maxSteer: 0.5, gripG: 1.4 }
const st = (dist) => { const p = line.at(dist); return { x: p.x, y: p.y, heading: p.heading, vx: 20, vy: 0, yawRate: 0, slipR: 0 } }

let bad = 0

// 1. A full circuit of travel is exactly one lap.
{
  const d = createDriver({ line, car: CAR, skill: 'medium', seed: 'lap', startDistance: 0 })
  for (let dist = 0; dist <= line.length + 2; dist += 4) d.control(st(dist % line.length), null, 1 / 60)
  const ok = d.lap === 1
  console.log(`  full circuit  -> lap ${d.lap} ${ok ? '(ok)' : '(expected 1)'}`)
  if (!ok) bad++
}

// 2. Oscillating across the line must not mint laps. This is the regression.
{
  const d = createDriver({ line, car: CAR, skill: 'medium', seed: 'lap', startDistance: line.length - 8 })
  const seq = []
  for (let i = 0; i < 6; i++) seq.push(line.length - 4, 2, line.length - 4)
  for (const dist of seq) d.control(st(dist), null, 1 / 60)
  const ok = d.lap === 0
  console.log(`  18 oscillations across the line -> lap ${d.lap} ${ok ? '(ok, no laps minted)' : '(DEFECT)'}`)
  if (!ok) bad++
}

// 3. Two circuits is two laps, i.e. it keeps counting.
{
  const d = createDriver({ line, car: CAR, skill: 'medium', seed: 'lap', startDistance: 0 })
  for (let dist = 0; dist <= line.length * 2 + 12; dist += 4) d.control(st(dist % line.length), null, 1 / 60)
  const ok = d.lap === 2
  console.log(`  two circuits  -> lap ${d.lap} ${ok ? '(ok)' : '(expected 2)'}`)
  if (!ok) bad++
}

console.log(bad ? `\n${bad} lap-counting failure(s)` : '\nLap counting is correct and oscillation-proof.')
process.exit(bad ? 1 : 0)
