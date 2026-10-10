/* The checkpoint gate: a mock car walked along the track line.
 *
 * Run: node tools/run.mjs tools/gate-check.mjs
 *
 * The gate is pure logic over (progress, x, y) -- no physics, no renderer --
 * so it can be driven exactly. Each scenario below is a behaviour the brief
 * requires and that no other harness covers:
 *
 *   1. a clean lap counts exactly once, at the right distance;
 *   2. cutting outside a gate's lateral window does NOT credit it, stalls the
 *      lap, and the car can recover by returning through the gate;
 *   3. reversing back over the finish line cannot mint a lap;
 *   4. with no gates configured, semantics are the legacy travelled-lap rule;
 *   5. the walk is deterministic.
 */
import { buildTrackLine, trackById, trackGates, DEFAULT_TRACK_ID } from '../src/tracks/catalog'
import { createLapGate, GATE_MARGIN } from '../src/ai/checkpoints'
import { gridSlot } from '../src/ai/gridSlots'

let failures = 0
function check(name, cond, detail = '') {
  if (cond) console.log(`  PASS  ${name}`)
  else { failures++; console.log(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`) }
}

const track = trackById(process.env.TRACK ?? DEFAULT_TRACK_ID)
const line = buildTrackLine(track)
const gates = trackGates(track, line)
const L = line.length
const pole = gridSlot(line, 0)
const SETBACK = (L - pole.distance) % L

/** A continuous walker: keeps its own travel distance so forward and reverse
 *  steps are exact. `override({ d, p })` may return an off-line position. */
function walker(gate, startTravel = 0) {
  let t = startTravel
  const STEP = 0.6
  return {
    gate,
    get travel() { return t },
    /** Advance `meters` (negative reverses) in fixed steps. */
    step(meters, override = null) {
      const end = t + meters
      while (Math.abs(end - t) > 1e-9) {
        t += Math.sign(end - t) * Math.min(STEP, Math.abs(end - t))
        const d = ((pole.distance + t) % L + L) % L
        const p = line.at(d)
        let x = p.x, y = p.y
        if (override) {
          const over = override({ d, p })
          if (over) { x = over.x; y = over.y }
        }
        gate.update(d, x, y)
      }
      return gate.lap
    },
  }
}

console.log(`checkpoint gate on ${track.name} (L=${L.toFixed(1)} m, ${gates.length} gates)`)

/* 1. clean laps: lap 1 completes at SETBACK + L of travel (the grid segment
 *    is free), lap 2 one lap later. */
{
  const w = walker(createLapGate(line, gates, pole.distance))
  const justBefore = w.step(SETBACK + L - 1)
  check('clean walk: no lap just before one full circuit', justBefore === 0, `lap=${justBefore}`)
  const after = w.step(2)
  check('clean walk: lap 1 counts at setback + L', after === 1, `lap=${after}`)
  const two = w.step(L)
  check('clean walk: lap 2 counts one lap later', two === 2, `lap=${two}`)
}

/* 2. cutting outside a gate window stalls the lap; returning credits it. */
{
  const cutGate = gates[1]
  const dGate = (((cutGate - pole.distance) % L) + L) % L
  const nearCut = (d) => {
    const rel = (((d - cutGate) % L) + L) % L
    return rel < 3 || rel > L - 6
  }
  const cut = ({ d, p }) =>
    nearCut(d)
      ? {
          x: p.x + -Math.sin(p.heading) * (p.half + GATE_MARGIN + 5),
          y: p.y + Math.cos(p.heading) * (p.half + GATE_MARGIN + 5),
        }
      : null

  const gate = createLapGate(line, gates, pole.distance)
  const w = walker(gate)
  w.step(dGate - 1, cut)
  check('cut: no lap before the gate', gate.lap === 0, `lap=${gate.lap}`)
  // Right through the gate's distance, out of the window.
  w.step(5, cut)
  check('cut: crossing out of the window does not credit', gate.next === 1, `next=${gate.next}`)
  check('cut: miss is reported', gate.missed === true)
  // All the way around, cutting the window on every pass: no lap.
  w.step(L + 200, cut)
  check('cut: no lap after a full out-of-window circuit', gate.lap === 0, `lap=${gate.lap}`)
  // Reverse back before the gate, then drive through it on the line.
  w.step(-(L + 214))
  w.step(20)
  check('cut: returning through the gate credits it', gate.next >= 2, `next=${gate.next}`)
  check('cut: miss clears after recovery', gate.missed === false)
  // Finish the current circuit: the finish line crossing now counts.
  const lapBefore = gate.lap
  w.step(SETBACK + 2 * L - w.travel + 2)
  check('cut: recovered lap completes later', gate.lap >= lapBefore + 1, `lap=${gate.lap}`)
}

/* 3. reverse over the line: forward, back across, forward again, then a clean
 *    circuit -> exactly one lap. */
{
  const gate = createLapGate(line, gates, pole.distance)
  const w = walker(gate)
  w.step(SETBACK + 30)
  w.step(-60)
  w.step(40)
  check('reverse: no lap minted by oscillation', gate.lap === 0, `lap=${gate.lap}`)
  // From SETBACK+10, the counting line crossing is a full circuit after the
  // arming crossing at SETBACK, i.e. L - 10 away.
  w.step(L - 10 + 2)
  check('reverse: exactly one lap after a clean circuit', gate.lap === 1, `lap=${gate.lap}`)
}

/* 4. no gates = legacy travelled-lap semantics: a lap is a full circuit
 *    LENGTH of net travel measured from the grid, exactly what the planning
 *    harnesses have always asserted (tools/lap-check.mjs). */
{
  const gate = createLapGate(line, [], pole.distance)
  const w = walker(gate)
  const justBefore = w.step(L - 1)
  check('legacy: no lap before a full circuit of travel', justBefore === 0, `lap=${justBefore}`)
  const after = w.step(2)
  check('legacy: lap 1 at one circuit of travel', after === 1, `lap=${after}`)
  const two = w.step(L)
  check('legacy: lap 2 one circuit later', two === 2, `lap=${two}`)
}

/* 5. determinism: two identical walks agree. */
{
  const wa = walker(createLapGate(line, gates, pole.distance))
  const wb = walker(createLapGate(line, gates, pole.distance))
  const ra = wa.step(3 * L + SETBACK + 2)
  const rb = wb.step(3 * L + SETBACK + 2)
  check('deterministic: identical walks agree', ra === rb && ra === 3, `${ra} vs ${rb}`)
}

console.log('')
if (failures) {
  console.log(`GATE CHECK FAILED: ${failures} case(s)`)
  process.exit(1)
}
console.log('GATE CHECK PASSED')
