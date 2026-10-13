# Task: implement three drift car designs + fix the loading UI flash

Branch: `task/drift-car-rears` (checkpoint from `racing-v2-foundation` @ ade9781).
References: `docs/mockups/drift-car-rears-2026-10-13/` (01 Box Coupe, 02 Round
Coupe, 03 Compact Classic).

## Ownership ledger

| File | Owner | Status |
|---|---|---|
| `racing-v2/src/art/carGeometry.js` | DeepSeek | in progress |
| `racing-v2/src/art/carGeometry.d.ts` | DeepSeek | in progress |
| `racing/index.js` (`V2_ARCHETYPES` only) | DeepSeek | in progress |
| `SAT & ACT Practice.html` (startup only) | Codex | delegated |
| `workspace.js` / `workspace.css` (startup only) | Codex | delegated |
| `redesign.js` / `redesign.css` (startup only) | Codex | delegated |
| `racing-v2/src/art/ProceduralCar.tsx` | untouched unless required | — |
| `racing-v2/src/player/*` | untouched | — |
| everything else | untouched | — |

Model mapping (no id/name/price/physics changes):
- `straight` (Longline Turbo) -> new `boxcoupe` archetype
- `rotary` (Vellum RX) -> new `roundcoupe` archetype
- `coupe90` (Meridian Six) -> new `compactclassic` archetype

## Deliverables

1. Three archetypes + light signatures (`quadround`, `ovalbar`, `segments`),
   a straight two-support wing, left-paired exhausts, black bumper/rub-strip
   options, per the mockup README's implementation boundary.
2. Startup-flash fix with early-frame regression evidence (Codex).
3. Real game renders per car (rear chase, front 3/4, rear 3/4, side, plus one
   gameplay shot), desktop/tablet/phone checks.
4. Verification: typecheck, build, garage-check, heading-check, drift sandbox,
   arcade, recovery, flags, garage, economy suites.
5. Handoff + expansion plan; NO deployment without separate authorization.

## Constraints

Fictional names only; no badges, no ripped assets. No physics or persistence
changes. Preserve paint/finish/spoiler customization. Keep render cost
proportionate (cached shared geometry per archetype).

## Outcomes (2026-10-13)

### Delivered

- Three original archetypes in `racing-v2/src/art/carGeometry.js`:
  `boxcoupe`, `roundcoupe`, `compactclassic`, with new rear-detail builders
  (`quadround` quad round lamps in dark housings; `ovalbar` full-width dark
  lamp panel with oval lenses and white reverse blocks; `segments` amber /
  red / white clusters), a `straight` two-support body-colour wing,
  left-paired exhausts (`leftx2`), and `blackBumper` / `rubStrip` / `tailFull`
  options used by the design targets. `V2_ARCHETYPES` maps the three saved
  garage ids (`straight`, `rotary`, `coupe90`) to them; ids, names, prices,
  tuning, physics, drivetrain and account data are untouched - a visual-only
  change with no persistence migration.
- Dev bench `racing-v2/bench/car-viewer.{html,tsx}` (not in the production
  build; vite builds only `src/main.tsx`) rendering any archetype from four
  fixed angles with renderer metrics.
- Real renders in `docs/racing-shots/car-rears-2026-10-13/`: 15 viewer-angle
  renders (4 angles x 3 cars + a `sport` baseline set) and 14 in-game
  screenshots (garage select card, straight-line chase, turning, handbrake
  drift, desktop; one phone pass) captured from the running game, not the
  bench. The in-game pass initially rendered the wrong car because the bridge
  rejects locked selections; the capture script grants the car the way a
  purchase would, and shows each design in its approved body colour.
- Startup-flash fix (headless Codex, verified here): root cause was
  `workspace.css`/`redesign.css` selectors gated on `body[data-workspace]`
  while the attribute was only set by the late deferred `workspace.js`.
  `SAT & ACT Practice.html` now ships `<body data-workspace="exam">` plus a
  first-child inline initializer that validates `funsatWorkspaceTheme` from
  storage under try/catch and applies the theme + colorScheme before visible
  markup parses. `workspace.js` semantics unchanged. `tests/theme-routing.cjs`
  gained early-frame sampling (7 timestamps from `commit`) across cold / warm
  / reload, all three saved themes, empty storage, throwing storage, 4x CPU
  throttling and a 600 ms delayed `app.js`.

### Measured render cost (renderer.info, same camera)

| Car | Draw calls | Triangles |
|---|---|---|
| sport (baseline) | 98 | 6 210 |
| boxcoupe | 98 | 6 418 |
| roundcoupe | 92 | 6 346 |
| compactclassic | 95 | 6 174 |

Within ~3% of the existing fleet; geometry is shared per archetype through
the existing cache.

### Verification

Passed: `npm run typecheck`, `npm run build`, `tools/garage-check.mjs`,
`tools/heading-check.mjs`, `tests/drift-v2-sandbox.cjs`,
`tests/racing-v2-arcade.cjs`, `tests/racing-v2-flag.cjs`,
`tests/racing-v2-economy.cjs`, `tests/practice.test.cjs`,
`tests/theme-routing.cjs` (incl. the new startup frames),
`tests/workspace-layout.cjs`, `tests/redesign-ui.cjs`.

Pre-existing failures (NOT caused by this task; reproduced on the untouched
base commit `ade9781` in a clean worktree):
- `tests/driving-recovery.cjs` fails an ART audio assertion in this headless
  environment (`MEDIA_ERR_SRC_NOT_SUPPORTED`, `error: 4`; engine voice stays
  paused) at base and here.
- `tests/racing-v2-garage.cjs` flakes on Playwright visibility waits for the
  racing intro under the software renderer (different wait step fails per
  run, including at base). Its assertions are about record/token bookkeeping,
  which the passing `racing-v2-economy.cjs` covers redundantly.
Both need a normal-audio, GPU-accelerated host to confirm; they are not
verification evidence against the car or startup changes.

### Expansion plan (front ends, profiles, polish, fleet)

1. Reusable detail builders first: the three new signatures already live in
   `addDetails`; add `frontQuadRound` (Box), a pop-up/slit headlight pair
   (Round) and rectangular twin headlamps + chrome kidney-less grille bars
   (Classic) as small box/cylinder compositions, then attach per key in the
   existing front-end block, mirroring the rear builders. No new geometry
   system is needed.
2. Profiles: the `deckLine` station table carries the side silhouette. Convert
   one car at a time by setting `deckLine`, `sillW/shoulderW/deckW`,
   `creaseY` and `cabin`, then re-render the four viewer angles and compare
   against that car's target sheet before touching the next.
3. Material polish: the fleet shares `materials()` finishes; per-car accent
   trim (e.g. the Classic's black rub strip already exists) should extend to
   bumpers/door handles only after silhouettes settle; do not add per-car
   material variants until then.
4. Optional LOD: `ProceduralCar` already takes `detailed`; a second
   lower-detail path for AI cars can be driven by that flag if the measured
   draw calls grow past ~15% of the baseline.
5. Fleet conversion order (one car per change, visual gate + the passing test
   set above): next candidates are `sport` (Horizon Coupe hero),
   `muscle` and `hatch`, each validated in the rear chase camera before the
   next starts. Keep one archetype = one saved garage id; never migrate
   storage for cosmetics.
6. Startup: keep the early inline theme application as the only pre-paint
   hook; any future theme must be added to BOTH the inline list and
   `workspace.js` validation (the regression test will fail otherwise).

### Deployment

Not deployed. Deployment of this branch is a separate authorization; the
brief for this task explicitly withheld it.
