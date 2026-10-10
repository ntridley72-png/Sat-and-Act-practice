/* Ordered anti-shortcut checkpoints: the lap gate.
 *
 * The brief requires "ordered anti-shortcut checkpoints" and verification
 * requires that they are "non-skippable". This module is that rule, shared by
 * the player (useLapTracker) and every AI (Driver.locate) so both sides count
 * laps the same way -- the leaderboard compares them directly.
 *
 * THE MODEL. A track declares gate distances (metres along the line). A lap
 * counts only when the car crosses the start/finish line after visiting every
 * gate in order. Crossing is detected on FORWARD motion only, and a crossing
 * is credited only when the car is laterally within half + GATE_MARGIN of the
 * centreline at the gate -- that is the anti-shortcut property: cutting the
 * infield can skip a gate's window, and then the lap never completes until
 * the car comes back and passes through it.
 *
 * WHY NOT "travelled > lapLength". The existing counters (travel-based laps)
 * already stop reverse-over-the-line exploits, but they still credit a car
 * that cuts across the middle of the circuit if the chord jump fits the local
 * search window. Gates close that.
 *
 * FAILURE BEHAVIOUR. With no gates (gateDistances empty) the gate degenerates
 * to the old travelled-lap semantics exactly, so harnesses and code paths
 * that do not opt in are unchanged. The first line crossing only ARMS the
 * counter; it never counts, mirroring floor(travelled / length) semantics
 * where the grid sits behind the line and the first crossing is worth nothing.
 */
import type { RacingLine } from './racingLine'

/** Metres beyond the road edge a gate crossing may stray and still count. */
export const GATE_MARGIN = 4

export interface LapGate {
  /** Validated lap count. Only advances on a fully-correct lap. */
  readonly lap: number
  /** Index of the next gate to visit; == gates.length means "finish line next". */
  readonly next: number
  /** True while the next gate has been crossed out of its window. Cleared
   *  when the gate is finally credited. For HUD/telemetry, not physics. */
  readonly missed: boolean
  /** Feed the car's current progress and position. Returns the lap count. */
  update(progress: number, x: number, y: number): number
}

function shortestDelta(from: number, to: number, length: number): number {
  let d = (to - from) % length
  if (d > length * 0.5) d -= length
  else if (d < -length * 0.5) d += length
  return d
}

/** Did a forward step from `a` to `a + forward` (circular) pass distance `d`? */
function crossed(a: number, forward: number, d: number, length: number): boolean {
  if (forward <= 0) return false
  const rel = (d - a + length) % length
  return rel > 0 && rel <= forward
}

export function createLapGate(
  line: RacingLine,
  gateDistances: readonly number[],
  startProgress: number,
): LapGate {
  const L = line.length
  const gates = gateDistances.slice().sort((a, b) => a - b)
  let progress = ((startProgress % L) + L) % L
  let lap = 0
  let next = 0
  let armed = false
  let missed = false

  /* Legacy path: no gates means the planning-only harnesses, and their
   * semantics are the travelled-lap rule this replaces -- full circuit
   * LENGTHS of net travel, which is what "every car covers the same
   * distance" and the oscillation guard (tools/lap-check.mjs) assert. The
   * crossing machine below is for tracks that actually declare checkpoints. */
  if (gates.length === 0) {
    let travelled = 0
    return {
      get lap() { return lap },
      get next() { return next },
      get missed() { return missed },
      update(now: number): number {
        const p = ((now % L) + L) % L
        travelled += shortestDelta(progress, p, L)
        progress = p
        lap = Math.max(0, Math.floor(travelled / L))
        return lap
      },
    }
  }

  const gate = {
    get lap() { return lap },
    get next() { return next },
    get missed() { return missed },
    update(now: number, x: number, y: number): number {
      const p = ((now % L) + L) % L
      const delta = shortestDelta(progress, p, L)
      const forward = Math.max(0, delta)

      if (forward > 0) {
        // Finish line first: crossing it completes a lap when the state
        // machine is armed and every gate has been visited.
        if (crossed(progress, forward, 0, L)) {
          if (!armed) armed = true
          else if (next >= gates.length) {
            lap++
            next = 0
            missed = false
          }
        }
        // Gates: only the NEXT expected gate can be credited, in order.
        if (next < gates.length && crossed(progress, forward, gates[next], L)) {
          const d = gates[next]
          const at = line.at(d)
          const lateral = Math.abs(
            (x - at.x) * -Math.sin(at.heading) + (y - at.y) * Math.cos(at.heading),
          )
          if (lateral <= at.half + GATE_MARGIN) {
            next++
            missed = false
          } else {
            // Out of the window: the crossing does not count. The gate stays
            // expected, so the lap cannot complete until the car returns.
            missed = true
          }
        }
      }

      progress = p
      return lap
    },
  }
  return gate
}
