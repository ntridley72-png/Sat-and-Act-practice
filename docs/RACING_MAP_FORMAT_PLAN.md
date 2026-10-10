# RACING_MAP_FORMAT_PLAN.md — the FunSAT track format (v1)

Status: implemented in `racing-v2/src/tracks/format.ts` and
`racing-v2/src/tracks/catalog.ts`, checked by `racing-v2/tools/map-check.mjs`.
This document is the requirement for that code; if they disagree, one of them
is a bug.

This phase follows `docs/CODEX_RACING_MAPS_AND_CAR_ACCURACY_PROMPT.md`
("the brief"). It defines a small versioned schema for original circuits and an
adapter into the running game. It does not create a second engine: every
track ends up as the same `RacingLine` (`racing-v2/src/ai/racingLine.ts`) the
AI, lap tracker, renderer and grid already consume.

## 1. Scope decisions (made deliberately, as the brief requires)

**D1 — five new brief-named tracks, plus APEX_FLATS adapted.**
The brief names five required layouts (Prism Skyway, Neon Harbor Circuit,
Redwood Ridge, Solar Salt Run, Tempest Causeway). The v1 game ships seven
other circuits (`racing/data/tracks.js`) laid out in screen pixels. Those
seven were considered as replacements and rejected: their shapes were authored
for a pixel canvas and a different physics model, none has ever been measured
against this runtime's AI constraints (11.1 m minimum radius, grid safety,
checkpoint orderability), and adapting them would trade the brief's five named
tracks for seven unvalidated ones. Instead: the five named tracks are authored
in the new format, and `APEX_FLATS` is adapted as the sixth entry and the
default. The adaptation is also the round-trip proof of the format (step 2 of
the execution order): if the existing circuit cannot be expressed in the
schema without changing one sample, the schema is wrong.

Where a v1 layout's *shape* suggested a better solution (the Harbor Sprint
return leg, the Mountain Ridge switchback), the new layout borrows the idea —
the repo's own original data, not a third-party source — and is re-measured
from scratch.

**D2 — the runtime is flat, and format v1 says so.**
Elevation and banking are declared in the schema as reserved fields, and the
validator **rejects** any non-zero value with an explicit
`unsupported-feature` error rather than silently flattening it. Reasons:

- the physics ground is a single infinite plane; the raycast vehicle, the
  opponent force model, the grid, the effects and the chase camera are all
  vertical-flat today, and the 60 fps verification baseline was measured on
  that world;
- making the road genuinely 3D means a heightfield collision surface, road
  skirts, camera pitch handling and a re-measurement of every harness — a
  separate, larger project;
- the brief itself scopes this as "elevation/banking **when supported**".

Vertical drama is delivered by terrain and scenery (cloud decks below a
skyway, rock faces above a ridge, bridge decks spanning terrain gaps) at
y = 0 road level. Format v2 will carry the real thing; the version field and
the validator's hard failure are the migration path.

**D3 — no reference-repo material.**
`open-race-track-format` has no declared licence, so nothing from it is used:
no code, prose, examples or coordinates. Only the level of idea that the brief
lists (centerline, width, checkpoints, grid) is shared, and those ideas are
not protectable expression. No file from it is vendored or committed.

**D4 — art stays procedural.**
Every prop in every theme is generated in code from primitives. The
compliance gate (`tools/compliance-gate.mjs`) continues to be the ship gate;
tracks add zero binary bytes.

## 2. The schema

TypeScript source of truth: `racing-v2/src/tracks/format.ts`. A track is pure
data — no `three` import, no React, no functions — so the same definitions run
in the browser, in Node harnesses, and in review.

```ts
interface TrackDefinition {
  format: 'funsat.track'          // frozen tag; parser rejects anything else
  version: 1                      // schema generation
  id: string                      // stable: /^[a-z][a-z0-9-]{2,31}$/, unique
  name: string                    // display name, 2..40 chars
  blurb: string                   // one line for the picker
  theme: ThemeId                  // must exist in THEMES (art is keyed by it)
  difficulty: 1 | 2 | 3           // 1 easy
  seed: string                    // deterministic scenery/grid stream
  direction: 'forward'            // v1 only; point order is the travel direction
  centerline: ControlPointDef[]   // closed implicitly; >= 8 points
  checkpoints: number[]           // ordered anti-shortcut gates, fractions
  grid: GridSpec                  // starting formation geometry
  surface: SurfaceSpec            // off-road model for this track
  hazards: HazardSpec[]           // local braking traps (may be empty)
  landmarks: LandmarkSpec[]       // named props, rendered by Scenery
  scenery: ScenerySpec            // prop kind + count budget
  weather: WeatherId[]            // supported variants, always includes 'dry'
  ai: AiSpec                      // measured planning numbers
  provenance: { origin: 'original'; license: 'CC0-1.0'; note: string }
}
```

The start/finish is the line origin at control point 0; a gantry is rendered
there on every track, so it is convention rather than data.

### 2.1 Field semantics

- **centerline** — ordered control points, Catmull-Rom, closed. `half` is the
  road half-width in metres *at that control point*; the spline interpolates
  it, so a track can narrow through a chicane the way APEX_FLATS does. Point 0
  is the start/finish control; the line's arc-length origin sits there.
- **checkpoints** — fractions of total length in (0,1), strictly ascending.
  The start/finish line at distance 0 is the implicit final gate. A lap only
  counts if the gates were crossed in order, on the road (runtime rule; see
  §5). Gates are *data*, not decorations: `tools/map-check.mjs` re-derives the
  line and validates each gate's geometry.
- **grid** — `setback`, `rowGap`, `stagger`, `lateral`, all metres, plus
  `rows` (must cover the maximum grid: 12 opponents). Defaults reproduce the
  constants `gridSlots.ts` shipped with.
- **surface.offroad** — one of `grass | gravel | salt | shoulder | cloud |
  water`. `surface.brake` (0..65) is the brake force applied to all four
  wheels off the road, validated against a per-surface band.
- **hazards** — `{ kind: 'gravel-trap' | 'puddle', atFraction, lengthFraction,
  side }`. Gravel traps are real (they raise the off-road brake inside the
  zone); puddles are visual only in v1 and are declared as such.
- **scenery** — `{ kind: 'pines' | 'redwoods' | 'containers' | 'clouds' |
  'rocks' | 'solar' | 'sea' | 'dunes' | 'none', count, tier }`. `count` is the
  *maximum* instance budget; the generator must not exceed it, and validation
  caps it per tier (low 160 / mid 320 / high 560) so a bad track cannot cost
  the frame.
- **weather** — subset of `dry | wet | rain`, always containing `dry`. `wet`
  and `rain` scale grip and sky, nothing else.
- **ai** — `cornerBudget` (the driver's planning fraction of grip) and
  `topSpeed` (m/s). Both are **measured**, not invented:
  `tools/calibrate-corner-budget.mjs` and `tools/speed-envelope.mjs` run per
  track id and their outputs are recorded here. The validator range-checks
  them; it cannot prove them, so the harnesses are the enforcement.
- **banner** — where the start/finish gantry stands, in line space. Validated
  on-road and clear of the grid.
- **provenance** — origin must be `original` for every shipped track. This is
  the machine-checkable half of the originality policy in the brief; the human
  half is the layout comment in the catalog, which names the ideas borrowed
  and states they are ideas only.

### 2.2 Explicit unknowns in v1

Named here rather than hidden:

- elevation/banking: rejected (D2);
- checkpoints are distance gates, not polygonal sectors (sector *timing* is
  future work; gates only gate laps today);
- `dunes`/`sea` scenery kinds exist as data; whether they earn real geometry
  is decided per track and recorded in the catalog comment.

## 3. Validation rules (fail closed)

`validateTrack(def, ctx)` returns a list of errors; `parseTrack` additionally
handles shape/type garbage. All of the brief's rejection cases map to rules:

| Brief case | Rule |
|---|---|
| open / malformed loop | 8..48 control points; no non-finite values; no zero-length segments; bounding box ≥ 30×30 m; no multi-point gaps; resampled length 400..1100 m |
| non-finite values | every number finite; `parseTrack` rejects NaN/Infinity at the boundary |
| duplicate IDs | registry-level: ids unique; format tag exact; version known |
| illegal widths/surfaces | `half` in [4, 14] m; spline-interpolated half never below 3.5; surface id known; brake within the surface's band |
| ambiguous self-intersections | no two centreline samples (4 m apart along the road, farther apart than `half_i + half_j + 6` of arc) closer in space than `half_i + half_j + 2` — a legitimate hairpin clears this; a fold that overlaps the road does not |
| discontinuous headings/curvature | heading changes are bounded by the radius rule below; every sampled curvature is finite |
| undriveable radii | tightest radius ≥ 12.5 m (driver floor is 11.1 m; margin covers spline interpolation) |
| invalid checkpoints | 2..8 gates, strictly ascending; after the grid zone; ≥ 25 m and ≥ 5% of length apart; ≥ 25 m before the finish; gate curvature radius ≥ 18 m (keeps the runtime on-road gate test honest) |
| invalid grid slots | all 13 slots on-road with 0.6 m margin, pairwise separation ≥ 4.6 m, corner radius ≥ 40 m at every slot, grid ≤ min(80 m, 22% of length) behind the line |
| on-road scenery | landmark offset ≥ 14 m beyond the road edge; the scenery generator places props at `half + clearance` by construction and `tools/map-check.mjs` asserts the generated placements off-road |
| unsupported themes | theme id exists in the registry |
| excessive geometry/prop counts | scenery count ≤ tier cap (low 160 / mid 320 / high 560); ≤ 6 landmarks; ≤ 12 hazards |
| elevation/banking | any non-zero `ele`/`bank` → explicit unsupported-feature error |

The validator is pure and runs in Node (`tools/map-check.mjs`), so a track
that fails cannot be committed past the harness.

## 4. Adapter into the runtime

One module, `racing-v2/src/tracks/catalog.ts` + `racing-v2/src/tracks/line.ts`:

```
TrackDefinition --buildTrackLine--> RacingLine        (same type every consumer already takes)
TrackDefinition --gridSpec--------> GridSpec          (defaults reproduce current constants)
TrackDefinition.checkpoints ------→ LapGate distances (metres, derived from fractions)
```

- `buildTrackLine(def)` = `buildRacingLine(def.centerline)` — one code path.
  The round-trip test asserts `buildTrackLine(APEX_FLATS_DEF)` reproduces the
  existing `APEX_FLATS` line to floating-point sameness at 4096 stations.
- `gridSlot(line, index, grid?)` gains an optional spec parameter defaulting
  to today's constants, so no existing call site changes behaviour.
- The App selects a track by id from the catalog; unknown/missing ids fall
  back to the default track. The selection persists in `localStorage` under
  `funsat.racing.track`, and a corrupt value falls back to the default without
  throwing (the game is optional UI inside a study site — §1 of the takeover
  prompt).
- The host's mount options gain an optional `track` id, passed through
  `racing/index.js` additively; the flag/v1 fallback path is untouched.

Nothing in the adapter is allowed to throw into the page: the catalog returns
a validated default when anything is wrong, and the App's ErrorBoundary stays
the last resort.

## 5. Checkpoints at runtime

`racing-v2/src/ai/checkpoints.ts` implements a state machine over
*circular progress* (the same value the lap tracker already maintains):

- gates are crossed when forward progress passes the gate's distance within
  the tolerance window (slowest car, 60 Hz, worst frame gap ⇒ well under the
  minimum gate separation);
- a crossing only counts when the car is laterally within
  `half + GATE_MARGIN` (4 m) of the centreline at the gate — that is the
  anti-shortcut property: cutting the infield can skip the gate's window and
  the lap will not complete;
- laps increment only when the line is crossed after every gate was visited;
- reversal cannot mint laps: crossings are only credited on forward motion,
  and the visit state machine does not reset on reverse crossings.

The player (`useLapTracker`), and each AI (`Driver`), feed their existing
progress through a `LapGate`. `driver.lap` semantics change from
"travel-based" to "travel-based **and** gated", which is the point: an AI that
somehow cut a corner would not be credited a lap either. The AI-drive harness
(`tools/race-sim.mjs`) now also proves, per track, that a full field completes
laps under gate rules.

## 6. Verification per track

Required, per the brief, all of it automated except the played lap:

1. `node tools/run.mjs tools/line-check.mjs <id>` — closure ≤ 0.5 m, radius
   floor, half-width floor.
2. `node tools/run.mjs tools/calibrate-corner-budget.mjs <id>` — largest
   passing budget recorded into the schema's `ai.cornerBudget`.
3. `node tools/run.mjs tools/speed-envelope.mjs <id>` — recorded into
   `ai.topSpeed`.
4. `node tools/run.mjs tools/race-sim.mjs <id>` — every skill completes; off-
   road time reported; gates enforced.
5. `node tools/run.mjs tools/map-check.mjs` — schema + geometry + grid + gates
   for the whole catalog.
6. A screenshot of the track in play, eyes on it.
7. The shared harness suite and browser tests, unchanged, still green.

The grid test deserves a note: "safe grid slots" is verified twice — once
statically in `map-check` (no overlap, on-road, behind the line) and once in
the game by the existing formation code, which is the same function.
