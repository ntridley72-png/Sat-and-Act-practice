/* Do different seeds actually produce different races?
 * determinism-check proves the CONTROL stream differs by seed. This asks the
 * question that matters to a player: does the seed change the OUTCOME. */
import { buildRacingLine, APEX_FLATS } from '../src/ai/racingLine'
import { createDriver } from '../src/ai/driver'

const line = buildRacingLine(APEX_FLATS)
const CAR = { wheelbase: 2.65, maxSteer: 0.5, gripG: 1.4 }
const DT = 1 / 60

// Count how often the seeded mistake branch actually fires over a race.
for (const skill of ['easy', 'medium', 'hard']) {
  const counts = []
  for (const seed of ['a', 'b', 'c', 'd', 'e']) {
    const d = createDriver({ line, car: CAR, skill, seed })
    let x = line.at(0).x, y = line.at(0).y, psi = line.at(0).heading, v = 22
    let draws0 = 0
    // Drive a fixed number of ticks on a simple model; we only care about how
    // many stochastic events fire, not lap time.
    for (let i = 0; i < 3000; i++) {
      const c = d.control({ x, y, heading: psi, vx: v, vy: 0, yawRate: 0, slipR: 0 }, null, DT)
      const delta = c.steer * CAR.maxSteer
      psi += (v * Math.tan(delta)) / CAR.wheelbase * DT
      v = Math.max(5, v + (c.throttle * 6 - c.brake * 12) * DT)
      x += Math.cos(psi) * v * DT
      y += Math.sin(psi) * v * DT
      draws0++
    }
    counts.push(`${seed}:${x.toFixed(3)}`)
  }
  const unique = new Set(counts.map((c) => c.split(':')[1])).size
  console.log(`  ${skill.padEnd(7)} final-x per seed: ${counts.join('  ')}`)
  console.log(`  ${''.padEnd(7)} distinct outcomes: ${unique}/5 ${unique === 5 ? '(seeds matter)' : '(SEEDS NOT AFFECTING OUTCOME)'}`)
}
