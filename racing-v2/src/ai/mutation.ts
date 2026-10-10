/* Per-frame opponent state, held OUTSIDE React.
 *
 * This follows upstream store.ts's split, which is kept deliberately: zustand
 * for UI state that should re-render, and a plain mutable object for values
 * that change every frame. Opponent positions change 60 times a second for up
 * to twelve cars; routing that through React state would re-render the tree
 * 720 times a second and the frame budget would go entirely on reconciliation.
 *
 * Rivals are read by every driver each tick for avoidance, so they live in one
 * pre-allocated array that is mutated in place rather than rebuilt -- a fresh
 * array per frame would hand the GC 60 allocations a second per car.
 */
import type { DriverState } from './driver'

export interface OpponentSlot extends DriverState {
  id: string
  /** Distance along the racing line, for position/lap ordering. */
  progress: number
  lap: number
  /** False while the slot is unused, so consumers can skip it without
   *  resizing the array. */
  active: boolean
}

function emptySlot(i: number): OpponentSlot {
  return { id: `ai-${i}`, x: 0, y: 0, heading: 0, vx: 0, vy: 0, yawRate: 0, slipR: 0, progress: 0, lap: 0, active: false }
}

/** Hard ceiling on grid size. Twelve opponents plus the player is the largest
 *  grid §7 asks to be measured, and a fixed cap keeps this array allocation
 *  one-time. */
export const MAX_OPPONENTS = 12

export const mutation = {
  opponents: Array.from({ length: MAX_OPPONENTS }, (_, i) => emptySlot(i)),
  /** The player, exposed to drivers so they will avoid and overtake it. */
  player: emptySlot(-1) as OpponentSlot,
  /** Live opponent count, so loops do not scan inactive slots. */
  count: 0,
}

/** Rivals visible to the driver at `index`, excluding itself. Reuses one
 *  scratch array per call site rather than allocating per frame. */
const scratch: DriverState[] = []
export function rivalsFor(index: number): readonly DriverState[] {
  scratch.length = 0
  if (mutation.player.active) scratch.push(mutation.player)
  for (let i = 0; i < mutation.count; i++) {
    if (i !== index && mutation.opponents[i].active) scratch.push(mutation.opponents[i])
  }
  return scratch
}

export function resetOpponents(): void {
  for (const slot of mutation.opponents) {
    slot.active = false
    slot.lap = 0
    slot.progress = 0
  }
  mutation.count = 0
}
