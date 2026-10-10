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

/* PRISM SKYWAY.
 *
 * An original layout: a long launch straight, a long 180-degree prism sweep
 * that doubles back above it, a narrowing esse pair (the technical sequence)
 * and a wide left sweeper returning to the line. The "elevation" drama of a
 * skyway is delivered by the cloud deck BELOW the road and the sky palette,
 * not by a height channel: the runtime's physics is flat in v1 by explicit
 * decision (see the plan doc). Ideas borrowed: none that are protectable --
 * "a road in space with colourful light" is a setting, and the layout itself
 * is authored here from generic corner types (straight, hairpin, esses,
 * sweeper), the same vocabulary APEX_FLATS uses. */
export const PRISM_SKYWAY: TrackDefinition = {
  format: 'funsat.track',
  version: 1,
  id: 'prism-skyway',
  name: 'Prism Skyway',
  blurb: 'A floating road above a cloud sea: long sweeps into tight esses.',
  theme: 'skyway',
  difficulty: 2,
  seed: 'prism-skyway-v1',
  direction: 'forward',
  centerline: [
    { x: 0, y: 0, half: 9 },        // start/finish, wide
    { x: 130, y: 0, half: 9 },      // launch straight
    { x: 175, y: 20, half: 7 },     // sweep in
    { x: 190, y: 60, half: 6.5 },   // sweep apex
    { x: 175, y: 100, half: 6.5 },  // sweep out
    { x: 135, y: 115, half: 7 },    // upper straight
    { x: 100, y: 110, half: 5.5 },  // technical entry, narrows
    { x: 75, y: 92, half: 5 },      // esse left
    { x: 45, y: 100, half: 5 },     // esse right
    { x: 20, y: 125, half: 5.5 },   // esses exit
    { x: -20, y: 140, half: 7 },    // top left sweep
    { x: -75, y: 135, half: 8 },
    { x: -115, y: 105, half: 8 },   // long left sweeper
    { x: -125, y: 60, half: 8 },
    { x: -110, y: 20, half: 8 },
    { x: -75, y: 2, half: 8 },      // sweeper exit
    { x: -40, y: -6, half: 9 },     // return to the line
  ],
  checkpoints: [0.16, 0.42, 0.62, 0.84], // refined against map-check
  grid: { ...DEFAULT_GRID },
  surface: { offroad: 'cloud', brake: 18 },
  hazards: [],
  landmarks: [
    { name: 'The Prism Spire', kind: 'spire', atFraction: 0.5, side: 'left', offset: 26, scale: 1.4 },
  ],
  scenery: { kind: 'clouds', count: 220, tier: 'mid' },
  weather: ['dry'],
  /* Measured 2026-10-10 on this exact geometry:
   *   calibrate-corner-budget -> largest passing 0.60 (3 skills x 5 seeds,
   *     every car home, no wheel off; the roomier corners carry more
   *     planning grip than APEX_FLATS' 0.30)
   *   speed-envelope -> suggested top speed 34 m/s (122 km/h) */
  ai: { cornerBudget: 0.6, topSpeed: 34 },
  provenance: {
    origin: 'original',
    license: 'CC0-1.0',
    note: 'Layout authored for this project from generic corner types; no traced circuit.',
  },
}

/* NEON HARBOR CIRCUIT.
 *
 * Original layout: a waterfront straight along the docks, a hard left into a
 * container-yard technical sector of three tightening kinks, then a fast
 * sweep back along the water. The braking landmarks are the yard entry and
 * the two landmark cranes standing over it. Ideas borrowed: none that are
 * protectable -- "docks with containers" is a setting. */
export const NEON_HARBOR: TrackDefinition = {
  format: 'funsat.track',
  version: 1,
  id: 'neon-harbor',
  name: 'Neon Harbor Circuit',
  blurb: 'Dockland street fight: a long quay straight into a container-yard maze.',
  theme: 'harbor',
  difficulty: 2,
  seed: 'neon-harbor-v1',
  direction: 'forward',
  centerline: [
    { x: 0, y: 0, half: 9 },
    { x: 140, y: 0, half: 9 },      // quay straight
    { x: 175, y: 20, half: 7 },     // dock turn-in
    { x: 185, y: 55, half: 6 },     // corner
    { x: 160, y: 75, half: 6 },     // exit
    { x: 125, y: 72, half: 5.5 },   // yard entry, narrows
    { x: 90, y: 90, half: 5.5 },    // container kink L
    { x: 50, y: 78, half: 5.5 },    // kink R
    { x: 10, y: 94, half: 6 },      // kink L
    { x: -30, y: 92, half: 6.5 },   // yard exit
    { x: -80, y: 70, half: 7.5 },   // waterfront sweeper in
    { x: -95, y: 35, half: 8 },     // sweeper apex
    { x: -80, y: 5, half: 8 },      // sweeper out
    { x: -45, y: -8, half: 9 },     // return to the line
  ],
  checkpoints: [0.16, 0.4, 0.62, 0.85],
  grid: { ...DEFAULT_GRID },
  surface: { offroad: 'shoulder', brake: 24 },
  hazards: [],
  landmarks: [
    { name: 'Quay Cranes', kind: 'crane', atFraction: 0.12, side: 'right', offset: 30, scale: 1.6 },
    { name: 'Yard Gantry', kind: 'grandstand', atFraction: 0.42, side: 'left', offset: 24, scale: 1.2 },
  ],
  scenery: { kind: 'containers', count: 260, tier: 'mid' },
  weather: ['dry'],
  /* Measured: calibrate-corner-budget -> 0.55, speed-envelope -> 34 m/s. */
  ai: { cornerBudget: 0.55, topSpeed: 34 },
  provenance: {
    origin: 'original',
    license: 'CC0-1.0',
    note: 'Layout authored for this project from generic corner types; no traced circuit.',
  },
}

/* REDWOOD RIDGE.
 *
 * Original layout: a forest straight, a climbing esse pair through the trees,
 * a tight summit hairpin, then a long descending sweeper back to the start.
 * Gravel runoff is the declared off-road surface, and a gravel trap sits at
 * the exit of the summit hairpin where a wide line actually costs something. */
export const REDWOOD_RIDGE: TrackDefinition = {
  format: 'funsat.track',
  version: 1,
  id: 'redwood-ridge',
  name: 'Redwood Ridge',
  blurb: 'Forest switchbacks, a summit hairpin, and gravel whenever you miss.',
  theme: 'ridge',
  difficulty: 3,
  seed: 'redwood-ridge-v1',
  direction: 'forward',
  centerline: [
    { x: 0, y: 0, half: 8 },
    { x: 90, y: 0, half: 8 },       // forest straight
    { x: 130, y: 10, half: 6.5 },
    { x: 150, y: 40, half: 6 },     // lower climb
    { x: 140, y: 72, half: 5.5 },   // ridge esse 1
    { x: 108, y: 88, half: 5 },
    { x: 75, y: 74, half: 5 },      // ridge esse 2, tight through the trees
    { x: 42, y: 88, half: 5.5 },
    { x: 20, y: 115, half: 6 },     // climb
    { x: -10, y: 130, half: 7 },    // summit approach
    { x: -60, y: 120, half: 7.5 },  // summit hairpin
    { x: -95, y: 90, half: 7 },     // descent
    { x: -100, y: 50, half: 7 },
    { x: -85, y: 15, half: 7.5 },
    { x: -50, y: -5, half: 8 },     // return to the line
  ],
  checkpoints: [0.15, 0.38, 0.6, 0.84],
  grid: { ...DEFAULT_GRID },
  surface: { offroad: 'gravel', brake: 15 },
  hazards: [
    { kind: 'gravel-trap', atFraction: 0.64, lengthFraction: 0.06, side: 'left' },
  ],
  landmarks: [
    { name: 'Grandfather Arch', kind: 'arch', atFraction: 0.3, side: 'right', offset: 26, scale: 1.5 },
    { name: 'Fire Tower', kind: 'radiotower', atFraction: 0.72, side: 'left', offset: 30, scale: 1.2 },
  ],
  scenery: { kind: 'redwoods', count: 300, tier: 'mid' },
  weather: ['dry'],
  /* Measured: calibrate-corner-budget -> 0.60, speed-envelope -> 30 m/s. */
  ai: { cornerBudget: 0.6, topSpeed: 30 },
  provenance: {
    origin: 'original',
    license: 'CC0-1.0',
    note: 'Layout authored for this project from generic corner types; no traced circuit.',
  },
}

/* SOLAR SALT RUN.
 *
 * Original layout: two long salt-flat straights for top-speed racing, joined
 * by a slow technical sector that threads between solar arrays, with mesa
 * landmarks on the horizon for braking reference. */
export const SOLAR_SALT_RUN: TrackDefinition = {
  format: 'funsat.track',
  version: 1,
  id: 'solar-salt-run',
  name: 'Solar Salt Run',
  blurb: 'Bleached salt flats, two long straights, and an array-field technical.',
  theme: 'salt',
  difficulty: 1,
  seed: 'solar-salt-run-v1',
  direction: 'forward',
  centerline: [
    { x: 0, y: 0, half: 10 },
    { x: 160, y: 0, half: 10 },     // salt straight
    { x: 210, y: 15, half: 8 },
    { x: 235, y: 50, half: 7 },     // desert sweeper
    { x: 220, y: 90, half: 6.5 },
    { x: 180, y: 100, half: 6 },    // array sector entry
    { x: 148, y: 86, half: 5.5 },   // technical L
    { x: 112, y: 100, half: 5.5 },  // technical R
    { x: 74, y: 86, half: 5.5 },    // technical L
    { x: 40, y: 104, half: 6 },     // array exit
    { x: 10, y: 115, half: 6.5 },
    { x: -30, y: 110, half: 8 },    // second straight
    { x: -75, y: 90, half: 8 },
    { x: -95, y: 55, half: 8 },
    { x: -90, y: 20, half: 8 },
    { x: -60, y: 0, half: 9 },      // return to the line
  ],
  checkpoints: [0.15, 0.42, 0.6, 0.85],
  grid: { ...DEFAULT_GRID },
  surface: { offroad: 'salt', brake: 20 },
  hazards: [],
  landmarks: [
    { name: 'Copper Mesa', kind: 'mesa', atFraction: 0.45, side: 'right', offset: 40, scale: 1.6 },
    { name: 'Oasis Stand', kind: 'grandstand', atFraction: 0.78, side: 'left', offset: 22, scale: 1.1 },
  ],
  scenery: { kind: 'solar', count: 220, tier: 'mid' },
  weather: ['dry'],
  /* Measured: calibrate-corner-budget -> 0.65, speed-envelope -> 40 m/s. */
  ai: { cornerBudget: 0.65, topSpeed: 40 },
  provenance: {
    origin: 'original',
    license: 'CC0-1.0',
    note: 'Layout authored for this project from generic corner types; no traced circuit.',
  },
}

/* TEMPEST CAUSEWAY.
 *
 * Original layout: a sea-wall causeway loop. Long water straights, a cliff
 * esse pair on the headland, then a sweeping run home along the wall. The
 * only track that supports all three weather variants; puddles pool on the
 * causeway when it is wet. */
export const TEMPEST_CAUSEWAY: TrackDefinition = {
  format: 'funsat.track',
  version: 1,
  id: 'tempest-causeway',
  name: 'Tempest Causeway',
  blurb: 'North Atlantic sea walls, cliff esses, and weather that changes grip.',
  theme: 'causeway',
  difficulty: 2,
  seed: 'tempest-causeway-v1',
  direction: 'forward',
  centerline: [
    { x: 0, y: 0, half: 9 },
    { x: 120, y: 0, half: 9 },      // causeway straight
    { x: 160, y: 10, half: 7.5 },
    { x: 180, y: 40, half: 6.5 },   // cliff sweep
    { x: 165, y: 75, half: 6 },
    { x: 130, y: 85, half: 5.5 },   // coastal esse L
    { x: 100, y: 70, half: 5 },     // esse R
    { x: 70, y: 82, half: 5 },
    { x: 40, y: 100, half: 5.5 },   // headland
    { x: 0, y: 105, half: 6 },
    { x: -40, y: 95, half: 7 },
    { x: -80, y: 70, half: 7.5 },   // sea-wall sweep in
    { x: -95, y: 35, half: 8 },     // sweep apex
    { x: -80, y: 5, half: 8 },      // sweep out
    { x: -45, y: -8, half: 9 },     // return to the line
  ],
  checkpoints: [0.16, 0.4, 0.62, 0.86],
  grid: { ...DEFAULT_GRID },
  surface: { offroad: 'water', brake: 26 },
  hazards: [
    { kind: 'puddle', atFraction: 0.2, lengthFraction: 0.05, side: 'both' },
    { kind: 'puddle', atFraction: 0.56, lengthFraction: 0.05, side: 'both' },
  ],
  landmarks: [
    { name: 'Cape Beacon', kind: 'lighthouse', atFraction: 0.35, side: 'right', offset: 28, scale: 1.3 },
    { name: 'Sea Wall Lookout', kind: 'radiotower', atFraction: 0.8, side: 'left', offset: 26, scale: 1 },
  ],
  scenery: { kind: 'sea', count: 160, tier: 'low' },
  weather: ['dry', 'wet', 'rain'],
  /* Measured: calibrate-corner-budget -> 0.55, speed-envelope -> 34 m/s. */
  ai: { cornerBudget: 0.55, topSpeed: 34 },
  provenance: {
    origin: 'original',
    license: 'CC0-1.0',
    note: 'Layout authored for this project from generic corner types; no traced circuit.',
  },
}

export const TRACKS: TrackDefinition[] = [APEX_FLATS, PRISM_SKYWAY, NEON_HARBOR, REDWOOD_RIDGE, SOLAR_SALT_RUN, TEMPEST_CAUSEWAY]

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
