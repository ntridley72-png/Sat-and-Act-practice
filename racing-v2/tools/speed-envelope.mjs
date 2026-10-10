/* What top speed does this circuit actually support?
 *
 * Upstream's maxSpeed of 88 m/s (317 km/h) was tuned for their track. Ours is
 * 594 m with a 13.2 m hairpin, and a car doing 197 km/h physically cannot
 * take a corner that tight -- it leaves the road every lap, which is exactly
 * what happened. This derives the ceiling from the geometry instead of
 * guessing at it.
 */
import { buildRacingLine, APEX_FLATS } from '../src/ai/racingLine'

const line = buildRacingLine(APEX_FLATS)
const GRIP_G = 1.4
const G = 9.81
const aLat = GRIP_G * G

// Corner speeds the geometry allows at full grip.
let tightest = 0
let longestStraight = 0
let run = 0
for (let d = 0; d < line.length; d += 0.5) {
  const k = Math.abs(line.at(d).curvature)
  tightest = Math.max(tightest, k)
  if (k < 0.004) { run += 0.5 } else { longestStraight = Math.max(longestStraight, run); run = 0 }
}
longestStraight = Math.max(longestStraight, run)

const minRadius = 1 / tightest
const slowestCorner = Math.sqrt(aLat * minRadius)

/* Top speed reachable on the longest straight, if the car enters at the
 * slowest corner speed and must brake back down to it by the end. Classic
 * accelerate-then-brake: the straight splits between the two. */
const aAcc = 4.5   // m/s^2, roughly what 7200 N on 1500 kg gives
const aBrk = GRIP_G * G * 0.7
const s = longestStraight
// v^2 = u^2 + 2*a*d1 and v^2 = u^2 + 2*b*d2, d1 + d2 = s
const d1 = (s * aBrk) / (aAcc + aBrk)
const vPeak = Math.sqrt(slowestCorner * slowestCorner + 2 * aAcc * d1)

console.log('circuit            ', line.length.toFixed(0), 'm')
console.log('tightest radius    ', minRadius.toFixed(1), 'm')
console.log('longest straight   ', longestStraight.toFixed(0), 'm')
console.log('')
console.log('slowest corner     ', (slowestCorner * 3.6).toFixed(0), 'km/h  (at full 1.4g)')
console.log('peak on straight   ', (vPeak * 3.6).toFixed(0), 'km/h  (accelerate then brake)')
console.log('')
console.log('upstream maxSpeed   88 m/s =', (88 * 3.6).toFixed(0), 'km/h  <-- ' + (88 > vPeak ? 'UNREACHABLE, and far past what the corners allow' : 'ok'))
const suggest = Math.ceil((vPeak * 1.08) / 2) * 2
console.log('suggested maxSpeed ', suggest, 'm/s =', (suggest * 3.6).toFixed(0), 'km/h')
console.log('  (8% over the straight-line peak, so the limiter shapes the top')
console.log('   end without the player hitting it on every straight)')
