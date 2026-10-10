/* Search the final corner's geometry for a layout whose tightest radius clears
 * the driver's KMAX_DEMAND floor. Authoring a circuit by eye and then
 * discovering the AI cannot take one corner is the slow way round. */
import { buildRacingLine } from '../src/ai/racingLine'

const MIN_RADIUS = 1 / 0.09
const base = [
  { x: 0, y: 0, half: 9 }, { x: 120, y: 0, half: 9 }, { x: 160, y: 18, half: 7 },
  { x: 168, y: 56, half: 5.5 }, { x: 140, y: 78, half: 6 }, { x: 96, y: 72, half: 7.5 },
  { x: 62, y: 96, half: 5 }, { x: 28, y: 86, half: 5 }, { x: -14, y: 104, half: 7 },
  { x: -58, y: 78, half: 8 }, { x: -62, y: 34, half: 8 },
]

function tightest(controls) {
  const L = buildRacingLine(controls)
  let maxK = 0, at = 0
  for (let d = 0; d < L.length; d += 0.5) {
    const k = Math.abs(L.at(d).curvature)
    if (k > maxK) { maxK = k; at = d }
  }
  return { r: 1 / maxK, at, len: L.length }
}

let best = null
// Sweep the final corner outward (more room to turn) and add an intermediate
// point so the spline is not forced through one sharp vertex.
for (let fx = -46; fx <= -20; fx += 2) {
  for (let fy = 0; fy <= 22; fy += 2) {
    for (const extra of [null, { x: -8, y: -6 }, { x: -12, y: -4 }, { x: -16, y: -2 }]) {
      const c = [...base, { x: fx, y: fy, half: 9 }]
      if (extra) c.push({ ...extra, half: 9 })
      const t = tightest(c)
      if (t.r >= MIN_RADIUS && (!best || t.len > best.t.len)) best = { c, t, fx, fy, extra }
    }
  }
}

if (!best) { console.log('no layout cleared', MIN_RADIUS.toFixed(1), 'm'); process.exit(1) }
console.log('floor:', MIN_RADIUS.toFixed(1), 'm')
console.log('chosen final corner: x=' + best.fx, 'y=' + best.fy, 'extra=' + JSON.stringify(best.extra))
console.log('tightest radius:', best.t.r.toFixed(1), 'm at', best.t.at.toFixed(0), 'm')
console.log('circuit length:', best.t.len.toFixed(1), 'm')
console.log('\ncontrol points:')
console.log(best.c.map((p) => `  { x: ${p.x}, y: ${p.y}, half: ${p.half} },`).join('\n'))
