/* Regression guard for the at() plateau defect.
 * at() must advance monotonically; a bucket whose candidate segment does not
 * contain d used to clamp t to 1 and return the segment END, so metres of
 * distance mapped to one frozen point. */
import { buildRacingLine, APEX_FLATS } from '../src/ai/racingLine'
const L = buildRacingLine(APEX_FLATS)
let plateaus = 0, longest = 0, run = 0, example = null
let prev = L.at(0)
for (let d = 0.02; d < L.length; d += 0.02) {
  const p = L.at(d)
  if (Math.hypot(p.x - prev.x, p.y - prev.y) < 1e-9) {
    run += 0.02
    if (run > longest) { longest = run; example = d }
  } else {
    if (run > 0.1) plateaus++
    run = 0
  }
  prev = p
}
console.log('stationary intervals >0.1m:', plateaus)
console.log('longest plateau:', longest.toFixed(2), 'm', example ? `(near d=${example.toFixed(2)})` : '')
console.log(plateaus === 0 ? 'OK: at() advances monotonically' : 'DEFECT: at() freezes over distance')
process.exit(plateaus === 0 ? 0 : 1)
