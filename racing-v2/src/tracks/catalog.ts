/* The shipped track catalog, and the adapter into the running game.
 *
 * One code path into the runtime: every track, however authored, becomes the
 * same RacingLine the AI, lap tracker, renderer and grid already consume.
 * There is no second engine and no parallel geometry.
 *
 * APEX FLATS was originally a bare ControlPoint[] in src/ai/racingLine.ts.
 * It was moved here into the v1 format as the migration proof: the control
 * points below are verbatim the ones it shipped with, and tools/map-check.mjs
 * pins the resulting line (length, tightest radius, sampled digest) against a
 * baseline recorded before the move. If the format could not carry the
 * existing circuit unchanged, the format would be wrong.
 */
import { buildRacingLine, type RacingLine } from '../ai/racingLine'
import { DEFAULT_GRID } from '../ai/gridSlots'
import type { TrackDefinition } from './format'

/* ORIGINAL CIRCUIT: "Apex Flats".
 *
 * The original layout, authored for this project rather than traced from
 * anything. The sequencing follows ideas that make a circuit fun -- which are
 * ideas, not protectable expression: a long straight to set up overtakes, a
 * hairpin that rewards late braking, a fast sweeper that punishes an early
 * lift, and a narrowing chicane where the road tightens so the AI's lateral-
 * offset avoidance actually has to commit.
 *
 * half-width varies deliberately: wide on the straight (easy side-by-side),
 * tight through the chicane (forces single file). */
export const APEX_FLATS: TrackDefinition = {
  format: 'funsat.track',
  version: 1,
  id: 'apex-flats',
  name: 'Apex Flats',
  blurb: 'The original circuit: a long straight, a tight hairpin, a chicane.',
  theme: 'flats',
  difficulty: 1,
  seed: 'apex-flats-v1',
  direction: 'forward',
  centerline: [
    { x: 0, y: 0, half: 9 },        // start/finish, wide
    { x: 120, y: 0, half: 9 },      // end of the long straight
    { x: 160, y: 18, half: 7 },     // turn-in
    { x: 168, y: 56, half: 5.5 },   // hairpin apex, tight
    { x: 140, y: 78, half: 6 },     // hairpin exit
    { x: 96, y: 72, half: 7.5 },    // short link
    { x: 62, y: 96, half: 5 },      // chicane left, narrow
    { x: 28, y: 86, half: 5 },      // chicane right, narrow
    { x: -14, y: 104, half: 7 },    // fast sweeper entry
    { x: -58, y: 78, half: 8 },     // sweeper apex
    { x: -62, y: 34, half: 8 },     // sweeper exit onto the straight
    // Final corner sits at x=-46 rather than a tighter -30 for a measured
    // reason: at -30 the spline's tightest radius came out at 8.6m, inside the
    // driver's KMAX_DEMAND floor of 1/0.09 = 11.1m, so the AI could not take it
    // on the line at any speed and understeered wide every single lap. Widening
    // it moves the tightest point to the chicane at 13.2m, which is drivable.
    // tools/tune-corner.mjs found this; tools/line-check.mjs guards it.
    { x: -46, y: 0, half: 9 },      // final corner back to the line
  ],
  /* Gates sit where the road is straight or nearly so, so the runtime
   * on-road gate test (lateral window) is honest. Chosen against
   * tools/map-check.mjs, which validates radius and spacing. */
  checkpoints: [0.18, 0.45, 0.68, 0.88],
  grid: { ...DEFAULT_GRID },
  surface: { offroad: 'grass', brake: 22 },
  hazards: [],
  landmarks: [],
  scenery: { kind: 'none', count: 0, tier: 'low' },
  weather: ['dry'],
  ai: { cornerBudget: 0.3, topSpeed: 32 },
  provenance: {
    origin: 'original',
    license: 'CC0-1.0',
    note: 'Authored for this project; moved verbatim from racingLine.ts into the v1 format.',
  },
}

export const TRACKS: TrackDefinition[] = [APEX_FLATS]

export const DEFAULT_TRACK_ID = APEX_FLATS.id

/** Look a track up by id, falling back to the default.
 *
 * The fallback is the error-handling contract for this whole subsystem: ids
 * arrive from localStorage, from host mount options, and from URLs, and none
 * of those is trusted. A missing or corrupt id must land the player on a
 * working circuit, never on a blank screen. */
export function trackById(id: string | null | undefined): TrackDefinition {
  if (id) {
    const found = TRACKS.find((t) => t.id === id)
    if (found) return found
  }
  return APEX_FLATS
}

/** The adapter: a definition becomes the one line type the runtime accepts. */
export function buildTrackLine(def: TrackDefinition = APEX_FLATS): RacingLine {
  return buildRacingLine(def.centerline)
}

/** Gate distances in metres, derived from the fraction data. Sorted ascending
 *  by validation, and safe to hand straight to the lap gate. */
export function trackGates(def: TrackDefinition, line: RacingLine): number[] {
  return def.checkpoints.map((f) => f * line.length)
}
