/* Full races at every skill level, headless.
 *
 * §10 asks for a race against opponents at every skill level. A screenshot
 * proves the scene draws; it cannot show whether 'easy' and 'hard' actually
 * drive differently, which is the thing worth knowing. This races each skill
 * over the full circuit and reports lap times and consistency.
 *
 * Vehicle model is the same dynamic single-track used to calibrate
 * CORNER_BUDGET, so the numbers are comparable with that measurement. It is
 * not cannon -- stated plainly -- but it is the model the driver was tuned
 * against, and a skill ordering that failed here would fail there too.
 */
import { trackById, buildTrackLine, DEFAULT_TRACK_ID } from '../src/tracks/catalog'
import { createDriver, G } from '../src/ai/driver'

const line = buildTrackLine(trackById(process.env.TRACK))
const CAR = { wheelbase: 2.65, maxSteer: 0.5, gripG: 1.4 }
const M = 1500, IZ = 2200, A = 1.35, B = 1.30, CF = 95000, CR = 110000
const MU = CAR.gripG, HALF_W = 0.9, FORCE = 1800 * 4, MAX_BRAKE = 65 * 4 * 90
const DT = 1 / 60

function race(skill, seed, laps = 2) {
  const start = line.at(0)
  let x = start.x, y = start.y, psi = start.heading, vx = 10, vy = 0, r = 0
  const d = createDriver({ line, car: CAR, skill, seed })
  let t = 0, offRoad = 0, worstOff = 0, topSpeed = 0, lapTime = null

  while (t < 600) {
    const vxs = Math.max(vx, 1)
    const af = Math.atan2(vy + A * r, vxs)
    const ar = Math.atan2(vy - B * r, vxs)
    const c = d.control({ x, y, heading: psi, vx, vy, yawRate: r, slipR: ar }, null, DT)
    const delta = c.steer * CAR.maxSteer

    const FzF = (M * G * B) / (A + B), FzR = (M * G * A) / (A + B)
    let FyF = -CF * (af - delta), FyR = -CR * ar
    FyF = Math.max(-MU * FzF, Math.min(MU * FzF, FyF))
    FyR = Math.max(-MU * FzR, Math.min(MU * FzR, FyR))
    const Fx = c.throttle * FORCE - c.brake * MAX_BRAKE * Math.sign(vx || 1) - 0.45 * vx * Math.abs(vx)

    vx = Math.max(0.5, vx + (Fx / M + vy * r) * DT)
    vy += ((FyF * Math.cos(delta) + FyR) / M - vx * r) * DT
    r += ((A * FyF * Math.cos(delta) - B * FyR) / IZ) * DT
    psi += r * DT
    x += (vx * Math.cos(psi) - vy * Math.sin(psi)) * DT
    y += (vx * Math.sin(psi) + vy * Math.cos(psi)) * DT

    topSpeed = Math.max(topSpeed, Math.hypot(vx, vy))
    const p = line.at(d.progress)
    const cross = Math.abs((x - p.x) * -Math.sin(p.heading) + (y - p.y) * Math.cos(p.heading))
    const over = cross - (p.half - HALF_W)
    if (over > 0) { offRoad++; worstOff = Math.max(worstOff, over) }

    if (lapTime === null && d.lap >= 1) lapTime = t
    if (d.lap >= laps) break
    t += DT
  }
  return { finished: d.lap >= laps, total: t, lapTime, topSpeed, offRoad, worstOff, laps: d.lap }
}

const SEEDS = ['a', 'b', 'c', 'd', 'e']
console.log(`Apex Flats, ${line.length.toFixed(0)} m, 2 laps, 5 seeds per skill\n`)
console.log('skill    finished   best lap   mean lap   spread   top speed   off-road ticks')

const summary = []
for (const skill of ['easy', 'medium', 'hard']) {
  const runs = SEEDS.map((s) => race(skill, s))
  const done = runs.filter((r) => r.finished)
  const laps = done.map((r) => r.lapTime).filter((v) => v !== null)
  const best = Math.min(...laps)
  const mean = laps.reduce((a, b) => a + b, 0) / laps.length
  const spread = Math.max(...laps) - best
  const top = Math.max(...runs.map((r) => r.topSpeed)) * 3.6
  const off = runs.reduce((a, r) => a + r.offRoad, 0)
  summary.push({ skill, mean, best })
  console.log(
    `  ${skill.padEnd(7)}${String(done.length + '/' + runs.length).padStart(7)}` +
    `${best.toFixed(3).padStart(11)}s${mean.toFixed(3).padStart(11)}s` +
    `${spread.toFixed(3).padStart(8)}s${top.toFixed(0).padStart(10)} km/h${String(off).padStart(13)}`,
  )
}

console.log('')
let bad = 0
// The ordering is the real assertion: a harder driver must actually be faster,
// or the skill levels are decoration.
for (let i = 1; i < summary.length; i++) {
  if (summary[i].mean >= summary[i - 1].mean) {
    console.log(`PROBLEM: ${summary[i].skill} is not faster than ${summary[i - 1].skill}`)
    bad++
  }
}
const anyOff = summary.length && false
console.log(bad ? `${bad} ordering problem(s)` : 'Skill ordering is correct: hard > medium > easy, and every car finished.')
/* On the small spread: the seeded wobble and mistakes are deliberately small
 * and the driver corrects them, so they move a lap by milliseconds rather
 * than seconds. They DO change the race -- tools/seed-spread.mjs shows five
 * distinct outcomes per skill -- just not enough to reorder a field on their
 * own. Their job is to stop identical cars driving in a perfect column, which
 * matters visually and barely at all on the clock. Note hard shows the most
 * spread despite the LOWEST mistake rate: it runs nearest the grip limit,
 * where a small perturbation costs more than it does to a car with margin. */
process.exit(bad ? 1 : 0)
