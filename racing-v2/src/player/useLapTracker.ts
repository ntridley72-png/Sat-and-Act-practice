/* Lap tracking for the player.
 *
 * Uses the SAME definition as the AI (see Driver.locate): laps are full,
 * ordered, on-road passages of the circuit's checkpoints, not line crossings
 * and not mere distance. Two reasons to keep them identical rather than
 * writing something simpler here:
 *
 *   - the leaderboard compares player and AI progress directly, so a
 *     different definition on each side would produce a standings table that
 *     is subtly wrong and very hard to debug;
 *   - the ordered gate is immune to finish-line oscillation AND to corner
 *     cuts that gain distance in the local search window (checkpoints.ts).
 */
import { useRef } from 'react'
import type { RacingLine } from '../ai/racingLine'
import { createLapGate } from '../ai/checkpoints'

export interface LapTracker {
  /** Feed a world position. Returns the current lap count. */
  update(x: number, z: number): number
  progress: number
  lap: number
}

export function useLapTracker(line: RacingLine, startDistance = 0, gates: readonly number[] = []): LapTracker {
  const ref = useRef<LapTracker | null>(null)
  if (!ref.current) {
    let progress = startDistance
    let lap = 0
    // The same ordered-checkpoint rule the AI uses. The tracker feeds the
    // gate its position, not just progress, so the lateral window can be
    // checked at the crossing.
    const gate = createLapGate(line, gates, startDistance)

    const tracker: LapTracker = {
      get progress() { return progress },
      get lap() { return lap },
      update(x, z) {
        // Local search around the last known point, as the driver does: O(1)
        // and it cannot latch onto the wrong part of a closed circuit.
        const span = 60
        const step = line.length / 600
        let best = progress
        let bestD = Infinity
        for (let i = -span; i <= span; i++) {
          const d = (progress + i * step + line.length) % line.length
          const p = line.at(d)
          const dist = (p.x - x) ** 2 + (p.y - z) ** 2
          if (dist < bestD) { bestD = dist; best = d }
        }
        progress = best
        lap = gate.update(best, x, z)
        return lap
      },
    }
    ref.current = tracker
  }
  return ref.current
}
