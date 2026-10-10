/* The opponent grid.
 *
 * Grid size is configurable and every car gets a distinct seed, so a race is
 * deterministic and replayable from (raceSeed, count) alone -- no hidden state
 * decides who does what.
 */
import { useMemo } from 'react'
import { Opponent } from './Opponent'
import { createStream } from './random'
import { ARCHETYPES } from '../art/ProceduralCar'
import type { RacingLine } from './racingLine'
import type { SkillName } from './driver'
import { MAX_OPPONENTS } from './mutation'
import { gridSlot } from './gridSlots'

/* Upstream's PickColor palette. Opponents must be indistinguishable from the
 * player at racing distance, so they differ by paint from this same set
 * rather than by shape. */
export const PALETTE = [
  '#c8102e', '#1f4fd8', '#e8e2d4', '#f5b700', '#15a34a',
  '#7b2d8b', '#e8641a', '#0d9bb5', '#b4bcc6', '#2b2f36',
  '#d94f8a', '#5b7f3a',
] as const

export interface GridProps {
  line: RacingLine
  /** Opponents, 0..MAX_OPPONENTS. */
  count: number
  /** One seed for the whole race; per-car seeds derive from it. */
  raceSeed: string
  /** Uniform skill, or a per-car list. */
  skill?: SkillName | readonly SkillName[]
  /** Ordered checkpoint distances shared with the player. */
  gates?: readonly number[]
}

export function Grid({ line, count, raceSeed, skill = 'medium', gates = [] }: GridProps) {
  const cars = useMemo(() => {
    const n = Math.max(0, Math.min(MAX_OPPONENTS, count))
    // All assignment draws come from ONE seeded stream, so the same raceSeed
    // always produces the same grid: same cars, same colours, same slots.
    const rng = createStream(`${raceSeed}:grid`)
    return Array.from({ length: n }, (_, i) => ({
      index: i,
      // Per-car seed includes the race seed and the slot, so two cars never
      // share a mistake sequence and a replay still matches.
      seed: `${raceSeed}:car${i}`,
      archetype: rng.pick(ARCHETYPES),
      paint: PALETTE[i % PALETTE.length],
      skill: Array.isArray(skill) ? (skill[i % skill.length] as SkillName) : (skill as SkillName),
      /* Slot i+1: the player holds pole (slot 0), so the field starts at 1.
         Both sides call gridSlot(), which is what makes the formation agree. */
      slot: gridSlot(line, i + 1),
    }))
  }, [line, count, raceSeed, skill])

  return (
    <>
      {cars.map((c) => (
        <Opponent
          key={c.seed}
          index={c.index}
          line={line}
          skill={c.skill}
          seed={c.seed}
          archetype={c.archetype}
          paint={c.paint}
          slot={c.slot}
          gates={gates}
        />
      ))}
    </>
  )
}
