# FunSAT Racing and Drifting Implementation Plan

Status: Phase B proposal. Phase C has begun; see "Shipped so far" below for what
is actually in the tree. Everything not listed there is still a proposal.

Selected visual direction: `mockups/racing-redesign-selected-modern-workshop-v2.png` (Modern Drift Workshop, simplified low-poly cars).

## Fixed product decisions

- Racing and drifting remain separate arcade categories on one shared foundation.
- Cars are stylized browser-game models. Clear silhouettes, wheel placement, glass, lights, stance, and visible customization matter; automotive accuracy does not.
- The existing giant solid floor/overhang element is removed. The player camera must never pass below an opaque horizontal slab.
- Open Practice is immediately available and free, but does not award cash, submit leaderboard scores, or publish ghosts.
- A scored racing/drifting run costs one practice token and includes up to five minutes of active driving. It never auto-renews. Pause, hidden-tab time, browser suspension, garage time, and inactivity do not consume the allowance. Three minutes of inactivity safely ends the run.
- The handbrake is the clearest drift initiator. Beginner and Standard remain forgiving; Expert is demanding but keyboard-playable.
- No real-time multiplayer, track editor, traffic in drifting, damage simulation, real cars, real tracks, or VDrift code/assets/branding.

## Architecture

`app.js` keeps ownership of the shared FunSAT shell, arcade navigation, tokens earned from practice, and thin game lifecycle adapters. Racing-specific code moves into browser modules loaded only when Racing or Drifting opens.

```text
FunSAT shell / account
        |
        v
Racing loader + session controller
        |
        +-- fixed-step vehicle simulation
        +-- procedural low-poly renderer + cameras + effects
        +-- racing/drifting modes, AI, ghosts, challenges
        +-- workshop garage, tuning, tracks, weather
        +-- versioned garage cache and cloud API
        +-- signed run evidence -> Worker validation -> leaderboard
```

The simulation is independent of rendering. It advances at 60 Hz with an accumulator, caps catch-up work after suspension, and produces immutable frame snapshots for rendering, AI observation, replay hashing, and tests. Low/medium/high graphics tiers change visual work only; they never change physics.

## Exact expected files

Existing files to change:

- `SAT & ACT Practice.html` — replace the old garage shell with an accessible workshop host and load the racing entry module.
- `app.js` — retain only shared arcade integration, legacy-profile handoff, token/session entry, and feature-flag fallback; remove old racing/drift classes only after parity.
- `workspace.css` — remove legacy `.dg-*` rules after the new stylesheet is active.
- `worker/index.js` — route garage transactions, challenges, ghosts, and leaderboard submissions to isolated handlers; add garage-aware progress reconciliation during transition.
- `worker/schema.sql` — add server-owned garage, transaction, challenge, run, ghost, and leaderboard tables plus indexes.
- `wrangler.toml` — copy the `racing/` directory and its licensed assets into `public/` during build.
- `tests/account.integration.cjs`, `tests/arcade-ui.cjs`, `tests/racing-behavior.cjs`, `tests/drift-ui.cjs`, `tests/visual-pass-shots.cjs`, `tests/workspace-layout.cjs` — update integration and regression coverage.

New production modules:

- `racing/index.js` — lazy loader and public integration API.
- `racing/data/cars.js` — approved ten-car fleet and legacy-car mapping.
- `racing/data/tracks.js` — mountain, dedicated circuit, and parking-lot definitions plus dry/wet/rain surfaces.
- `racing/core/fixed-step.js` — accumulator, pause/resume, suspension recovery, deterministic tick numbering.
- `racing/core/vehicle-physics.js` — original simcade equations and state transition.
- `racing/core/input.js` — stable keyboard input sampling and difficulty assists.
- `racing/core/random.js` — seeded deterministic random stream for AI and run evidence.
- `racing/render/renderer.js` — graphics-tier orchestration and context/resource lifecycle.
- `racing/render/car.js` — simplified low-poly procedural car geometry and materials.
- `racing/render/track.js` — road, barriers, open scenery, surface cues, and removal of the solid overhang.
- `racing/render/effects.js` — smoke, skid marks, sparks, rain, shadows, and wet-road highlights with tier budgets.
- `racing/render/camera.js` — chase and hood cameras with drift-aware damping.
- `racing/game/session.js` — allowance clock, pause rules, inactivity, rewards, and run finalization.
- `racing/game/modes.js` — Open Practice, Drift School, tandem, daily challenge, circuit, time trial, AI race, and ghost race rules.
- `racing/game/ai.js` — deterministic racing-line follower with passing/avoidance; tandem target behavior.
- `racing/game/ghost.js` — compact input replay, physics versioning, checkpoints, hashes, and playback.
- `racing/game/challenges.js` — daily seed, fixed car/track/weather/tuning rules, and completion state.
- `racing/profile/garage-schema.js` — schema v4 defaults, validation, legacy migration, and serialization.
- `racing/profile/garage-merge.js` — deterministic client/server cache reconciliation for non-economic preferences.
- `racing/ui/garage.js` — Modern Drift Workshop UI, ten-car browser, comparison, customization, tuning, tracks, settings, ghosts, and leaderboard.
- `racing/ui/racing.css` — workshop layout, HUD, Chromebook reflow, focus/contrast states, and reduced-motion rules.
- `worker/racing.js` — authenticated server-owned garage transactions, run validation, ghost storage, daily challenges, and leaderboard queries.

New tests and documentation:

- `tests/racing-fixed-step.cjs`
- `tests/racing-physics.cjs`
- `tests/racing-ai.cjs`
- `tests/racing-ghost.cjs`
- `tests/racing-garage.cjs`
- `tests/racing-profile-migration.cjs`
- `tests/racing-profile-conflicts.integration.cjs`
- `tests/racing-leaderboard.integration.cjs`
- `tests/racing-performance.cjs`
- `docs/RACING_PHYSICS.md`
- `docs/RACING_ASSET_LICENSES.md`
- `docs/third-party-licenses/` for verified, exact font/asset notices only.

## Vehicle schema

Every launch car uses a frozen definition with these groups:

- Identity: `id`, fictional `name`, `category`, `launchOrder`, `unlockPrice`, `starter`, `legacyIds`.
- Geometry: `length`, `width`, `height`, `wheelbase`, front/rear track, wheel radius/width, axle positions, cabin bounds, hood/deck heights, arch scale, spoiler anchor, and a small set of low-poly silhouette presets.
- Mass: kilograms, front weight fraction, yaw inertia scalar, center-of-mass height.
- Drivetrain: FWD/RWD/AWD, final drive, gear ratios, torque curve samples, idle/redline, shift delay, differential lock under power/coast.
- Tires: front/rear peak grip, slip-angle peak, falloff, recovery, longitudinal grip, wet multiplier, heat omitted for launch.
- Controls: maximum steer angle, steering rate, countersteer response, handbrake rear-grip multiplier.
- Suspension: front/rear stiffness and damping scalars, ride-height range, weight-transfer response.
- Turbo/weight: spool rate, boost threshold, maximum boost, base weight-reduction limit.
- Rendering: body preset, paint regions, glass shape, light shapes, wheel style, material tier, optional spoiler.
- Balance metadata: beginner rating, drift stability, grip-racing rating, plain-language strengths/weaknesses.

The hero car is converted first. The other nine launch cars are not authored until its appearance, handling, migration, and tests pass.

## Original physics schema

Simulation state includes position, heading, longitudinal/lateral velocity, yaw rate, engine speed, gear, wheelspin, front/rear normal load, front/rear slip angles, surface per axle, handbrake state, assist output, and deterministic tick.

At each fixed tick:

1. Transform world velocity into the car frame.
2. Compute front and rear slip angles from lateral velocity, yaw rate, axle distance, speed floor, and steered wheel angle.
3. Estimate static axle loads and longitudinal load transfer from acceleration/braking and center-of-mass height.
4. Convert slip angle to progressive lateral force with a smooth peak and falloff; multiply by surface, rain, tires, suspension, and difficulty recovery.
5. Compute engine/turbo/drivetrain/differential longitudinal force and cap it by available tire friction; excess becomes wheelspin.
6. Apply handbrake rear-grip reduction and rear wheel lock without removing front steering authority.
7. Sum forces and yaw moment, integrate velocity/yaw semi-implicitly, then apply rolling/aero drag.
8. Apply beginner/standard steering assistance as bounded input guidance, never a teleport or hidden physics branch.

All equations, units, clamps, assumptions, and tuning experiments are documented in `docs/RACING_PHYSICS.md`. No VDrift source, constants, class structure, or translated code enters the repository.

## Tuning schema

Per-car setup stores versioned normalized controls rather than raw physics constants:

- Engine package/swap ID
- Turbo boost (safe bounded range)
- Suspension balance and ride height
- Tire compound
- Weight reduction stage
- Differential/drift balance
- Steering response
- Handbrake strength

Each control has `min`, `max`, `step`, `default`, `safeRange`, `effectSummary`, and `warningSummary`. Validation clamps every value. Reset restores the car-specific safe default. Extreme combinations deliberately reduce stability or grip so bad tuning has visible consequences.

## Garage/profile schema and migration

Profile garage v4 is split into:

- Server authority: cash balance, practice-token debits used for scored runs, owned cars/upgrades, achievement colors, track unlocks, purchase/award transaction IDs, daily completion, leaderboard identity.
- Merge-by-union: owned non-consumable unlock IDs and achievement IDs, after server validation.
- Last-writer-by-field timestamp: selected race/drift car, paint, wheels, cosmetics, tuning setup, difficulty, graphics tier, camera, audio.
- Local-only cache: preview rotation, open garage tab, transient renderer preferences.

Legacy v3 mapping preserves all currently unlocked cars. Old IDs map to the nearest approved launch archetype; duplicate mappings unlock only once. Existing selected cars map predictably. Existing cosmetics and valid tuning values are clamped into v4. Legacy cash is imported once through an idempotent server migration transaction; it is never repeatedly trusted from the client.

## Account synchronization and conflict policy

Currency cannot be safely merged with `max`, addition, or last-write-wins. The server therefore owns an append-only idempotent transaction ledger. Each purchase, reward, migration credit, and run debit has a unique operation ID. Replaying an operation is a no-op. The balance is derived/updated transactionally on the server.

Concurrent policy:

- Purchases: server transaction; succeeds once or returns insufficient funds/already owned.
- Currency: server balance wins; clients never add balances during merge.
- Unlocks/achievements: union only from server-validated ledger entries.
- Selected cosmetics/tuning: compare per-field `changedAt`; ties resolve by stable device ID, not request arrival order.
- Stale client: server returns the current garage revision and a conflict payload; client reapplies unsent preference edits only, never old economy state.
- Offline preferences: queued and reconciled by field timestamp.
- Offline purchases/scored runs: unavailable until authenticated server validation; Open Practice remains usable.
- Fresh device: pulls v4 state before enabling purchases or scored runs.

The existing `/api/progress` merge keeps SAT/ACT history behavior. During transition it treats the v4 garage as a cache and cannot overwrite server-owned economy fields.

## AI, ghosts, daily challenges, and leaderboard security

- AI consumes the same controls as the player. It follows sampled racing lines, targets a difficulty-dependent speed, brakes for curvature, and uses bounded avoidance/passing offsets. It cannot directly set position or velocity.
- Ghosts store seed, physics/content version, car/setup IDs, compact input changes, periodic checkpoints, finish metrics, and a hash chain. Playback re-simulates inputs; checkpoints detect drift/corruption.
- Daily challenges are server-seeded by date with fixed mode, car, setup, track, surface, weather, and physics version.
- Ranked submissions require authentication, a server-issued short-lived run nonce, monotonic tick count, version identifiers, checkpoint hashes, run summary, and replay evidence.
- The Worker re-simulates or validates checkpoint windows, rejects impossible acceleration/speed/position/score, expired/reused nonces, mismatched versions, oversized evidence, and rate-limit violations.
- Anomaly flags include impossible sector time, implausible input frequency, non-monotonic ticks, checkpoint divergence, repeated identical evidence, and statistically extreme score/time. Flagged runs are withheld rather than displayed.
- Public names use a moderated/generated leaderboard handle, never raw email.

## Performance budgets

- Lazy racing payload: <= 1.5 MB compressed JS/data on first open; optional audio loaded afterward and <= 2.5 MB compressed for the launch set.
- Main SAT/ACT initial load regression: <= 25 KB compressed before the arcade is opened.
- Low tier: 30 FPS floor at 1366x768 on a representative low-end Chromebook; <= 32 ms p95 frame time; <= 180 MB incremental memory.
- Medium tier: 45 FPS target; <= 22 ms p95; <= 230 MB incremental memory.
- High tier: 60 FPS target on ordinary recent laptops; <= 17 ms p95; <= 320 MB incremental memory.
- Simulation: <= 2 ms p95 per 60 Hz tick with six AI cars; no more than four catch-up ticks after a stall.
- First playable: <= 5 seconds on a warm cache and <= 10 seconds on ordinary school internet, with visible progress and a cancel/back action.
- Effects caps: tiered smoke particles, skid segments, rain streaks, shadowed cars, draw distance, resolution scale, reflections, and antialiasing.
- No giant floor/overhang geometry; open-road culling must not create an opaque near-camera plane.

## Test strategy

Unit tests cover fixed-timestep consistency across render rates, slip-angle force response, grip loss/recovery, countersteering, handbrake initiation, load transfer, wheelspin, wet friction, FWD/RWD/AWD behavior, difficulty assists, distinct fleet behavior, bad-tuning consequences, seeded randomness, and ghost determinism.

Browser tests cover keyboard controls, chase/hood cameras, free Open Practice, token debit exactly once, explicit non-renewal, pause/resume, hidden tabs, suspension recovery, three-minute inactivity, garage opening, all graphics tiers, lazy loading, AI completion/avoidance, daily challenge state, and visible removal of the solid overhang.

Account/integration tests cover legacy migration, same-record concurrent updates, two-device purchases, replayed operation IDs, insufficient funds, fresh-device restore, offline preference reconciliation, stale-client rejection, unlock unions, currency non-duplication/non-loss, ghost ownership, nonce reuse, impossible-score rejection, rate limiting, and physics-version separation.

Visual tests capture the selected mockup states at 1440x1024 and 1366x768, compare hero-car consistency, confirm readable locked/owned/selected/achievement states, and ensure no opaque slab crosses the chase camera. Existing SAT/ACT, account, college, scholarship, theme, question rotation, tutor, arcade, responsive-navigation, accessibility, and SEO suites remain required gates.

## Milestones and acceptance criteria

1. Foundation/hero vertical slice: hero car, fixed-step physics, chase/hood cameras, one dry open track, Open Practice, deterministic test harness. Accepted only if 30/60/120 FPS renders produce matching simulation results and the selected simplified visual target is recognizable.
2. Workshop/garage: selected Modern Drift Workshop, hero customization/tuning, accessible ten-slot browser shell, v3-to-v4 local migration. Accepted at both target viewports with keyboard navigation and no lost legacy ownership.
3. Ten-car fleet: nine additional distinct cars after hero sign-off. Accepted when silhouette, drivetrain, handling, and migration tests distinguish every launch car.
4. Tracks/weather/modes: three environments, dry/wet/rain, drift/race modes, pause/session rules. Accepted when surface and weather measurably change grip and the solid overhang is absent.
5. AI/ghosts/challenges: deterministic AI, ghost playback, daily seeds. Accepted when replay hashes match and AI finishes without teleporting.
6. Cloud/economy/leaderboard: ledger, migrations, secure submissions, conflict handling. Accepted only after concurrent/offline/fresh-device and adversarial submission tests pass.
7. Performance/accessibility/regression: budgets met on representative hardware; no SAT/ACT regression; contrast, focus, reduced motion, and responsive checks pass.
8. Deployment: production build, Wrangler deploy, public/API smoke tests, account persistence verification, and exact deployment URL recorded.

## Rollback strategy

- Put the new stack behind a server-readable `racingV2` feature flag.
- Keep the old Drift Circuit/Neon Racing integration callable until v2 migration, account sync, and public smoke tests pass.
- Never delete v3 garage data during migration; store a one-time v3 snapshot and migration ID.
- New database changes are additive. Disabling `racingV2` returns users to the old client while preserving v4 server records.
- Ranked runs carry a physics version; rollback hides an affected version without deleting evidence.
- If deployment smoke tests fail, redeploy the last known-good Worker build and leave migrations/ledger rows intact.

## Deployment steps

1. Run focused racing, migration, account, security, accessibility, and performance tests.
2. Run the full `node --test tests/*.cjs` regression suite and the production build.
3. Apply additive D1 schema changes remotely with the reviewed migration file.
4. Deploy from the repository with `npx wrangler deploy`.
5. Record the exact Worker/custom-domain URLs and deployment version.
6. Smoke-test `/`, racing/drifting lazy assets, authenticated garage APIs, fresh-device restore, one purchase, one free practice, one scored run, ghost retrieval, leaderboard rejection/acceptance paths, and SAT/ACT practice.
7. Confirm account persistence from a second clean browser profile.
8. Enable `racingV2` gradually; monitor error rate, rejected submissions, frame telemetry (aggregate only), and rollback signals.

Local tests and `wrangler dev` are not deployment evidence.

## Bounded OpenCode work packages

OpenCode remains on DeepSeek and never owns architecture, physics, garage design, migrations, account synchronization, economy, AI/ghost architecture, leaderboard security, integration, deployment, or final review.

After GPT establishes each representative pattern, OpenCode may receive exactly bounded packages:

1. Inventory exact current racing files/tests/assets; read-only, no edits.
2. Transcribe the approved hero-car record into `racing/data/cars.js` only; no schema changes.
3. After hero validation, transcribe the remaining nine approved car records in the same file only.
4. Add exact track metadata records to `racing/data/tracks.js` from a supplied template; no renderer/physics edits.
5. Add repetitive ARIA labels/test cases to named garage component/test files after GPT builds the representative control.
6. Populate verified external asset/license inventory entries from supplied authoritative URLs; never guess a license.
7. Capture the prescribed screenshot matrix into a named new directory after GPT integration.
8. Run prescribed test commands and report raw failures without editing files.

Every package must list one objective, exact allowed files, forbidden files, acceptance checks, tests, and the current dirty-tree warning. GPT reviews every returned diff and claim before integration.

## Approval gate

Approval of this plan authorizes Phase C foundation work only. It does not authorize deployment or skipping the hero-car validation gate.


## Shipped so far

This section records what is implemented in the repository, as distinct from
what the plan above proposes. It is deliberately a narrow slice of milestone 2.

Delivered:

- The full-width start/finish crossbar is gone from `renderWorld3D`. The two side
  posts remain, so nothing opaque spans the road and the chase camera can no
  longer pass beneath a slab. `tests/drift-ui.cjs` asserts the crossbar does not
  return.
- `racing/workshop.js` and `racing/racing.css` replace the old `DriftGarage`
  presentation with the Modern Drift Workshop layout: a left nav, a rotating
  low-poly hero preview, and a tabbed panel for cars, customization, tuning,
  tracks, and scores. A capture-phase click handler takes the garage buttons over
  from the `app.js` implementation, which is still present as the fallback.
- Every control the old garage had is still reachable: per-car drift/race
  assignment and priced unlocks, token-to-cash conversion, paint, finish, wheels,
  wheel colour and size, body kit, hood, bumper, wing, decal, racing number,
  underglow, the four tuning sliders, the handling model, engine volume, track,
  theme, race mode, and camera. Parity is checked by `tests/drift-ui.cjs`.
- `teal` is a real entry in `CAR_PAINTS` and the default paint for a new garage,
  so the approved hero colour is the colour the simulation paints the car.
- Hero stat bars are derived from the `CARS` table and scaled against the real
  spread of the fleet, so they rank the cars rather than displaying fixed values.
- Below 760px the settings panel parks off-screen and opens from the nav, with a
  dismiss control. Previously the class that reveals it was never set, so the
  panel was unreachable on a phone.
- `prefers-reduced-motion` draws the hero preview once instead of rotating it.
- `worker/index.js` reconciles the garage during `/api/progress` merges: unlock,
  kit, and wing lists union, cash takes the higher balance, and the winning edit
  still decides selections and tuning. `tests/racing-garage-conflicts.integration.cjs`
  covers unions, the cash floor, per-field wins, garage-less saves, and id
  sanitization.
- `wrangler.toml` copies `racing/` into the build output.

Also delivered (simulation foundation, milestone 1):

- `racing/core/fixed-step.js` — the 1/60 s accumulator. Render time never reaches
  the physics; catch-up is capped at four ticks and a long stall is dropped
  rather than replayed. `tests/racing-fixed-step.cjs` asserts that 30, 60 and
  120 FPS and a jittered frame rate produce an identical car at the same tick.
- `racing/core/random.js` — seeded sfc32 stream with fork, save and restore, so
  nothing in the simulation needs `Math.random()`.
- `racing/core/vehicle-physics.js` — the original simcade model: slip angles,
  load transfer with tyre load sensitivity, a two-way friction circle, a
  grip-aware steering limiter, handbrake rear-grip cut, and difficulty as bounded
  input guidance plus rear-axle stability. Documented in `docs/RACING_PHYSICS.md`,
  including the three bugs that made every car spin and the two that made
  "beginner" harder than "expert".
- `racing/data/cars.js` — the ten fictional launch cars with legacy-id migration
  that preserves every previously unlocked car.
- `tests/racing-physics.cjs` — 21 behaviour tests covering acceleration, braking
  under weather, steering response and saturation, tyre falloff, handbrake
  initiation, slide recovery, load transfer, wheelspin, surfaces, drivetrain
  character, fleet distinctness, difficulty assists, bad tuning, numerical
  robustness and migration.

These modules are not yet wired into the page: the browser still runs the
existing `DriftCircuit`/`NeonRacing` classes. They are the foundation the
renderer, AI, ghosts and anti-cheat are to be built on, and they are tested in
isolation under `node --test`.

Not started. Everything else in this plan, including: the rest of the `racing/`
module tree (`render/`, `game/`, `profile/`), wiring the new core into the game, the server-owned transaction ledger and garage schema v4, AI,
ghosts, daily challenges, the leaderboard and its submission security, the
five-minute token-metered scored run with its inactivity rules, the `racingV2`
feature flag, the performance budgets, and deployment. The simulation still runs
the existing `DriftCircuit` and `NeonRacing` classes in `app.js`.

Nothing has been deployed.
