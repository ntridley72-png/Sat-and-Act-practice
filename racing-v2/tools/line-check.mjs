/* Geometry sanity for the racing line. Run: node --experimental-strip-types tools/line-check.mjs
 * Catches a circuit that does not close, a corner tighter than the cars can
 * physically take, or a half-width that went negative through a spline
 * overshoot -- all of which look fine on a map and ruin a race. */
import { buildRacingLine, APEX_FLATS } from '../src/ai/racingLine'

const L = buildRacingLine(APEX_FLATS)
console.log('circuit length:      ', L.length.toFixed(1), 'm')

let maxK = 0
let minHalf = Infinity
let kAt = 0
for (let d = 0; d < L.length; d += 0.5) {
  const p = L.at(d)
  if (Math.abs(p.curvature) > maxK) { maxK = Math.abs(p.curvature); kAt = d }
  minHalf = Math.min(minHalf, p.half)
}
console.log('tightest radius:     ', (1 / maxK).toFixed(1), 'm  at', kAt.toFixed(0), 'm')
console.log('narrowest half-width:', minHalf.toFixed(2), 'm')

const a = L.at(0)
const b = L.at(L.length)
const gap = Math.hypot(a.x - b.x, a.y - b.y)
console.log('loop closes:         ', gap < 0.5 ? 'YES' : `NO (gap ${gap.toFixed(2)}m)`)

const problems = []
if (minHalf <= 1.0) problems.push(`half-width ${minHalf.toFixed(2)}m is narrower than a car`)
// KMAX_DEMAND = 0.09 in the driver, i.e. it will never ask for a radius
// under 1/0.09 = 11.1m. A corner tighter than that cannot be taken on the
// line no matter how slowly the car approaches: it understeers wide every lap.
const MIN_RADIUS = 1 / 0.09
if (1 / maxK < MIN_RADIUS) problems.push(`radius ${(1 / maxK).toFixed(1)}m is tighter than the driver's floor of ${MIN_RADIUS.toFixed(1)}m (KMAX_DEMAND)`)
if (gap >= 0.5) problems.push('circuit does not close')
console.log(problems.length ? 'PROBLEMS:\n  - ' + problems.join('\n  - ') : 'OK: circuit is drivable')
process.exit(problems.length ? 1 : 0)
