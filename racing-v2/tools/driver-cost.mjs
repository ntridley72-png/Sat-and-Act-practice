/* CPU cost of the AI driver loop, measured in isolation.
 *
 * WHY THIS EXISTS. The browser frame bench (bench/frame-bench.cjs) runs on a
 * software rasteriser in headless Chromium, where even an EMPTY grid costs
 * ~116 ms/frame. The renderer swamps everything, so that harness cannot
 * answer the question that actually matters -- how much frame budget the
 * opponents consume -- and reporting its numbers as the answer would be
 * misleading.
 *
 * This measures the thing the AI is actually responsible for: the per-tick
 * cost of N drivers planning, which is pure CPU and independent of the GPU.
 * Against a 16.67 ms frame budget at 60 Hz, this says what share the AI takes.
 */
import { trackById, buildTrackLine, DEFAULT_TRACK_ID } from '../src/tracks/catalog'
import { createDriver } from '../src/ai/driver'

const line = buildTrackLine(trackById(process.env.TRACK))
const CAR = { wheelbase: 2.65, maxSteer: 0.5, gripG: 1.4 }
const DT = 1 / 60
const BUDGET_MS = 1000 / 60

function makeGrid(n) {
  return Array.from({ length: n }, (_, i) =>
    createDriver({ line, car: CAR, skill: 'medium', seed: `c${i}`, startDistance: (line.length / Math.max(n, 1)) * i }),
  )
}
function makeStates(n) {
  return Array.from({ length: n }, (_, i) => {
    const p = line.at((line.length / Math.max(n, 1)) * i)
    return { x: p.x, y: p.y, heading: p.heading, vx: 28, vy: 0.4, yawRate: 0.05, slipR: 0.03 }
  })
}

console.log('AI driver CPU cost per tick (no renderer, no physics engine)')
console.log('frame budget at 60 Hz = 16.67 ms\n')
console.log('cars   ms/tick   % of frame   ms per car')

for (const n of [0, 4, 8, 12]) {
  const drivers = makeGrid(n)
  const states = makeStates(n)
  // Warm up so JIT compilation is not counted as driver cost.
  for (let w = 0; w < 2000; w++) for (let i = 0; i < n; i++) drivers[i].control(states[i], states, DT)

  const ITER = 20000
  const t0 = process.hrtime.bigint()
  for (let k = 0; k < ITER; k++) {
    for (let i = 0; i < n; i++) drivers[i].control(states[i], states, DT)
  }
  const t1 = process.hrtime.bigint()
  const msPerTick = Number(t1 - t0) / 1e6 / ITER
  const pct = (msPerTick / BUDGET_MS) * 100
  const per = n ? msPerTick / n : 0
  console.log(
    `  ${String(n).padStart(2)}   ${msPerTick.toFixed(4).padStart(7)}   ${pct.toFixed(2).padStart(9)}%   ${per.toFixed(4).padStart(9)}`,
  )
}
console.log('\nNote: rivals array is passed in full, so avoidance is O(n^2) across the grid.')
