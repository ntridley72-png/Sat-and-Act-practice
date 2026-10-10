/* Lap tracking for the player.
 *
 * Uses the SAME definition as the AI (see Driver.locate): laps are full
 * circuit lengths of unwrapped net travel, not line crossings. Two reasons to
 * keep them identical rather than writing something simpler here:
 *
 *   - the leaderboard compares player and AI progress directly, so a
 *     different definition on each side would produce a standings table that
 *     is subtly wrong and very hard to debug;
 *   - unwrapped travel is immune to finish-line oscillation, which is what
 *     broke the AI's first lap counter.
 */
import { useRef } from 'react'
import type { RacingLine } from '../ai/racingLine'

export interface LapTracker {
  /** Feed a world position. Returns the current lap count. */
  update(x: number, z: number): number
  progress: number
  lap: number
}

export function useLapTracker(line: RacingLine, startDistance = 0): LapTracker {
  const ref = useRef<LapTracker | null>(null)
  if (!ref.current) {
    let progress = startDistance
    let travelled = 0
    let lap = 0

    const tracker: LapTracker = {
      get progress() { return progress },
      get lap() { return lap },
      update(x: number, z: number) {
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
        let delta = best - progress
        if (delta > line.length * 0.5) delta -= line.length
        else if (delta < -line.length * 0.5) delta += line.length
        travelled += delta
        progress = best
        lap = Math.floor(travelled / line.length)
        return lap
      },
    }
    ref.current = tracker
  }
  return ref.current
}
