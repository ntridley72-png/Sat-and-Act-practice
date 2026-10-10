# RACING_MAP_CHATGPT_REVIEW.md — final review packet

The brief's final-artifact packet. Every claim here maps to a command that was
run and output that was captured; raw console output is quoted or summarised
with the command beside it. Authored by the implementing agent (DeepSeek) on
2026-10-10, branch `racing-v2-foundation`, final commit `e6fb35c` plus the
packet commit that adds this file.

**Independent verification has NOT happened.** The brief says not to claim it
until ChatGPT reviews this packet and the actual diff. That review has not
occurred. What follows is self-reported and reproducible.

## 1. Scope and status

Initial status (baseline `1e75c6c`): racing-v2 shipped playable with one
circuit (`APEX_FLATS`), no track format, no checkpoints, no scenery, no
weather, one shallow-camouflage issue on the car rear.

Final status: six playable circuits on a versioned, validated format;
ordered anti-shortcut checkpoints enforced for player and AI; procedural
scenery, themes and weather; a hero-car rear pass with two screenshot-
rejected approaches recorded; all existing verification green; 60 fps p50
held on real GPU hardware at 12 opponents on three different tracks.

Explicitly **not** done (see Limitations): elevation/banking (rejected at the
schema boundary, runtime is flat by decision), the brief's full image-research
protocol for cars (Claude's stream never ran), fleet-wide car propagation.

## 2. Reference repositories and licensing precautions

- `JosePedroDias/open-race-track-format` at `6a91c2c...` — **no declared
  licence**. Used for high-level ideas only (centerline, width, checkpoints,
  grid — the brief's own list). No code, prose, examples or coordinates were
  copied; nothing was vendored; the repo was not committed. Recorded in
  `docs/RACING_MAP_FORMAT_PLAN.md` §1 D3.
- pmndrs/racing-game (MIT, vendored at `7816a5d`) — untouched by this work
  except through the existing app layer.
- Image-research provenance links: **none exist**, because no image research
  was performed. Stated plainly in `docs/CAR_ACCURACY_REVIEW.md`.

## 3. Originality position

- Every circuit is an original layout authored in
  `racing-v2/src/tracks/catalog.ts`, from generic corner vocabulary, with the
  intended ideas named in comments. No circuit traces a real track; the
  layouts never existed before this work.
- Every prop, landmark, and theme is generated in code from primitives;
  `tools/compliance-gate.mjs` proves no third-party geometry, texture or font
  reached the build (PASSED).
- The car design-origin matrix (three generalised class-level sources per
  archetype plus the original departures) is §5 of
  `docs/CAR_ACCURACY_REVIEW.md`. No badge, name, livery, lamp cluster or
  identifiable silhouette was introduced; the hero-car pass only moved
  existing generic elements.

## 4. Architecture

One adapter, one runtime type:

```
TrackDefinition (src/tracks/format.ts, schema + parser + validator)
   ├─ catalog.ts: 6 shipped tracks, buildTrackLine -> RacingLine (the ONLY line type)
   ├─ scatter.ts: pure deterministic scenery placement (shared by renderer AND validator)
   ├─ weather.ts: grip multipliers + palette dimming (no three import)
   └─ selection.ts: localStorage with fallback, never throws
```

- `App.tsx` is track-agnostic: line, gates, theme, hazards, scenery, AI
  budget, speed cap all come from the selected definition.
- Checkpoints (`src/ai/checkpoints.ts`) gate laps for the player
  (`useLapTracker`) and every AI (`Driver.locate`) identically; a gateless
  call keeps the legacy travelled-lap semantics the planning harnesses use.
- `tools/map-check.mjs` validates schema, geometry, grid, gates, scenery
  scatter and determinism for every catalog track, plus 27 negative fixtures
  asserting error CODES, plus parseTrack boundary cases, plus a pinned
  regression digest of APEX_FLATS recorded before its migration.

## 5. Findings from the review streams

- **Claude's research stream: never ran.** No CAR_ACCURACY_REVIEW.md existed
  at completion time. Per the takeover prompt's role change, the implementer
  authored it, marked plainly as such, with the image protocol not executed.
- **DeepSeek (implementer) findings worth recording:**
  1. The validator's invented 40 m grid-radius rule rejected the shipped,
     fully-raced APEX_FLATS grid. The rule was wrong, not the circuit; fixed
     to 18 m with the reasoning in the code.
  2. The same class of error recurred at the AI budget cap: a measured 0.65
     (solar-salt-run) exceeded the invented 0.6 cap. The cap moved to 0.7;
     measurement beats invention.
  3. Two car-rear approaches produced regressions that only screenshots
     caught (lamps hidden by the game's own downward camera; a "recess" that
     covered the lamp). Both reverted, recorded in the implementation notes.
  4. `frame-bench.cjs` reported a recurring ~1.3 s first-frame "stall" on
     scenery-heavy tracks. Isolated with an independent rAF recorder: a
     boundary artifact of clearing the sample array while the page baseline
     still pointed at pre-window time. Fixed by re-baselining on the first
     post-clear frame (bench/index.html + frame-bench.cjs); independent
     recorders confirmed no post-clear stall existed.

## 6. Accepted / rejected recommendations

Accepted (map track): five new brief-named circuits + adapted APEX_FLATS;
flat-format decision with elevation rejected fail-closed; scatter shared with
the validator; per-track measured AI budget and speed cap; weather grip table
inherited from v1's tuned values.

Accepted (car): lamp scale, chrome light catcher, diffuser depth + strakes,
ducktail end caps — sport only.

Rejected: elevation/banking (runtime not ready; fail closed instead);
fleet-wide car propagation (survivors were sport-specific after iteration);
full-width light bars, motorsport aero fences, proud metallic crease slivers
(reasons in the car notes); adapting the seven v1 circuits instead of
authoring the brief's five (rationale in the plan doc §1 D1).

## 7. Commands and raw results

Harnesses (from `racing-v2/`, all PASS):
```
npx tsc --noEmit && npm run build          # clean
node tools/compliance-gate.mjs             # GATE PASSED, 6 CC0 audio verified by hash
for h in rng-parity line-check plateau-check determinism-check lap-check \
         orientation-check driver-cost seed-spread map-check gate-check race-sim; do
  node tools/run.mjs tools/$h.mjs; done    # 11/11 OK
TRACK=<id> node tools/run.mjs tools/line-check.mjs           # per track, OK
TRACK=<id> node tools/run.mjs tools/calibrate-corner-budget.mjs
TRACK=<id> node tools/run.mjs tools/speed-envelope.mjs
TRACK=<id> node tools/run.mjs tools/race-sim.mjs             # every skill finishes, 0 off-road
```

Per-track measured data (all recorded in each catalog entry):

| track | length | tightest r | gates | budget | topSpeed | race-sim cold lap (easy/med/hard) |
|---|---|---|---|---|---|---|
| apex-flats | 594.7 | 13.2 | 4 | 0.30 | 32 | 88.8 / 84.8 / 82.0 s |
| prism-skyway | 801.7 | 13.2 | 4 | 0.60 | 34 | 79.4 / 76.0 / 73.6 s |
| neon-harbor | 667.0 | 15.1 | 4 | 0.55 | 34 | 74.8 / 71.6 / 69.4 s |
| redwood-ridge | 650.9 | 14.6 | 4 | 0.60 | 30 | 68.8 / 65.7 / 63.6 s |
| solar-salt-run | 794.4 | 14.9 | 4 | 0.65 | 40 | 78.1 / 74.9 / 72.7 s |
| tempest-causeway | 663.8 | 13.5 | 4 | 0.55 | 34 | 70.5 / 67.5 / 65.5 s |

(race-sim: 5 seeds per skill, 2 laps, gates enforced, 0 off-road ticks,
skill ordering correct on every track.)

Bench (production bundle, headed Chrome, ANGLE/Metal, real GPU — the
renderer probe printed HARDWARE):

| track | p50 ms @ 0/4/8/12 opponents | implied fps @12 |
|---|---|---|
| apex-flats | 16.70 / 16.70 / 16.80 / 16.70 | 59.9 |
| neon-harbor | 16.70 / 16.70 / 16.70 / 16.80 | 59.5 |
| redwood-ridge | 16.70 / 16.70 / 16.70 / 16.90 | 59.2 |

Occasional hitches up to ~50 ms (≈3 frames) appear intermittently at every
configuration including the untouched baseline track, while the machine is
also running test servers and headless browsers; the p50 headline (60 fps)
holds everywhere. `forward-test`: W moves the car 17.8 m nose-first, S -17.3 m.
`offtrack-test`: 117 km/h on tarmac vs 62 km/h on the verge.

Browser tests (repo root, static server on 8899): all 10 PASS —
`racing-ai, racing-physics, racing-fixed-step, racing-ghost, racing-tracks,
racing-session, racing-behavior, racing-render, racing-v2-flag,
racing-v2-arcade`.

Screenshots (`racing-v2/bench/shots/`): intro/grid/drive for all six tracks,
plus Tempest in rain and its weather picker; hero-rear before/after zooms.
Viewed by the implementer; the ones that mattered caught two would-be
regressions (gantry posts in the racing line; the car lamp recess mistake).

## 8. Files changed (1e75c6c..HEAD)

64 files, +3592/-158, scoped to `racing-v2/`, `racing/index.js` (3 additive
lines), and `docs/`. Six commits:

```
7ce76e0 racing-v2: track format v1, a fail-closed validator, and fixture tests
1c73fc9 racing-v2: APEX_FLATS adapted into the v1 format, proven bit-exact
94e0d58 racing-v2: ordered anti-shortcut checkpoints gate every lap
bd13f37 racing-v2: Prism Skyway end to end, on the v1 track format
2fc30cc racing-v2: Neon Harbor, Redwood Ridge, Solar Salt Run, Tempest Causeway
e6fb35c racing-v2: hero-car rear pass (sport), with two screenshot-rejected approaches
```

New modules: `tracks/{format,catalog,scatter,weather,selection}.ts`,
`ai/checkpoints.ts`, `art/{Scenery,Rain}.tsx`, `tools/{map-check,gate-check}.mjs`,
`bench/track-shots.cjs`. New docs: this packet, the plan, the car review, the
car implementation notes, and `DEEPSEEK-OPEN-QUESTIONS.md`.

## 9. Limitations

- Elevation and banking are rejected by the validator, not implemented; the
  runtime is flat. Vertical drama is scenery. (Plan doc §1 D2.)
- Checkpoints are distance gates, not timed sectors.
- Puddles are visual only; weather grip is real (player tyres, AI planning and
  AI tyre saturation) but there is no aquaplaning model.
- The car review is not an image study (see §5) and only `sport` changed.
- Frame hitches up to ~50 ms were observed intermittently under a loaded
  machine at every configuration; no configuration showed a steady-state
  regression.
- `racing-v2/dist` is committed (repo convention); the packet commit includes
  the bundle rebuilt from the final source.

## 10. Deployment

**Not deployed.** The operator authorises deploys; the racingV2 flag still
defaults OFF and the v1 fallback path is untouched (proven by
`racing-v2-flag.cjs` and `racing-v2-arcade.cjs`).
