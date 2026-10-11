# Open questions from the racing map + car work

Requested deliverable: rather than interrupting, every open question was
recorded here for review AFTER completion, so answers can adjust the work
where needed. Each entry states the decision that was taken, the
alternatives, and what changing it would cost.

## 1. Elevation and banking (biggest scope question)

**Taken:** format v1 rejects any non-zero elevation/banking with an explicit
error; the runtime stays flat; vertical drama comes from scenery (cloud decks,
rock faces, sea walls). Rationale in `docs/RACING_MAP_FORMAT_PLAN.md` §1 D2.
**Alternatives:** implement a heightfield physics surface + road skirts +
camera pitch handling, re-measure every harness and the 60 fps budget.
**Cost to change:** a separate project-sized effort; the schema is ready to
carry it (the version field and fail-closed validator are the migration path).

## 2. Track count and sourcing

**Taken:** six tracks: APEX_FLATS adapted + the five brief-named new layouts.
The seven v1 screen-space circuits were not adapted (rationale: plan doc §1
D1 — none had ever been validated against this runtime's constraints).
**Alternative:** also port the seven v1 circuits as additional entries.
**Cost to change:** per-track validation + calibration + screenshots (the
tooling is all built; ~1 hour per track).

## 3. AI aggression is now per-track and higher than before

**Taken:** each track records its own measured `cornerBudget` (0.55–0.65 on
the roomy new circuits, 0.30 on APEX_FLATS) and `topSpeed` (30–40 m/s).
The AI plans correspondingly faster corner speeds on roomier tracks.
**Alternative:** clamp every track to the old 0.30/32 values for uniformity.
**Cost to change:** a one-line edit per track; the measurements are recorded,
so reversing is trivial. The current values are what the calibration harness
measurably supports.

## 4. Weather scope

**Taken:** grip, palette, fog and rain particles are real; puddles are visual;
spray and aquaplaning are not modelled; weather is session-only (defaults dry,
not persisted).
**Alternatives:** persist weather per track; add spray/authored rain audio.
**Cost to change:** small (persistence) to medium (spray).

## 5. Car review authorship

**Taken:** the implementer authored `docs/CAR_ACCURACY_REVIEW.md` because
Claude's research stream never ran; the brief's image-research protocol was
NOT executed and the file says so plainly in its first section.
**Alternative:** commission the full image-study pass before treating the car
work as final.
**Cost to change:** the review can be extended in place; the implementation
notes list exactly what was built against it.

## 6. Fleet-wide car propagation

**Taken:** hero car (`sport`) only. After iteration, the surviving changes
were sport-specific taste, so nothing was propagated — with two rejected
approaches recorded in `docs/CAR_ACCURACY_IMPLEMENTATION_NOTES.md`.
**Alternative:** apply the lamp/catcher treatment to every archetype.
**Cost to change:** small mechanical change plus a screenshot pass per car.

## 7. Checkpoint miss feedback

**Taken:** missing a gate (cutting it off-road by more than ~4 m beyond the
road edge) silently stalls the lap until the car returns through the gate.
No HUD warning exists; the gate exposes a `missed` flag for one.
**Alternative:** show a "checkpoint missed" hint; or auto-recover after N
seconds; or relax the window.
**Cost to change:** small (HUD line reading the gate's `missed`).

## 8. Gantry styling

**Taken:** posts moved 3 m clear of the road edge after screenshots showed
the first placement visually clipped by cars running wide; posts remain
dark and prominent at the start line (a shadowed beam reads as a thin bar
from the chase camera).
**Alternative:** restyle/lower/recolour the gantry or remove it.
**Cost to change:** minutes; purely visual.

## 9. Frame-bench measurement fix

**Taken:** `bench/index.html` now re-baselines its frame recorder on the
first frame after a measurement window is cleared (`__skip`), because the
old first-sample delta spanned pre-window time and reported a fictitious
~1.3 s stall on scenery-heavy tracks. Verified with independent recorders
before changing anything.
**Alternative:** revert if you prefer the original (noisier) semantics.
**Cost to change:** one-line revert; the artifact would return.

## 10. Two new scenery kinds are minimal

**Taken:** `sea` is buoys plus a dark ground plane; `dunes` exists in the
schema but no shipped track uses it yet. `clouds` float below the road and
partially through the ground plane by design (they read as a cloud deck).
**Alternative:** invest in richer water/dune geometry.
**Cost to change:** contained to `art/Scenery.tsx` + `tracks/scatter.ts`.

## 11. Deployment note — what was run/changed inside your WIP tree

The deploy was authorised with the instruction to check your uncommitted work
first, then ship. Your work was not fully "chill": two of your own gates
failed because data steps had not been run. Actions taken, all recorded so
you can review or revert them:

- `python3 scripts/build-college-data.py` (with `SKIP_PHOTOS=1`, cache-only)
  — merged the fresh `scripts/.cache/college-links.json` (354 colleges) into
  `college-data.js`. Your `college-images` and `college-ui` tests now pass.
- `python3 scripts/expand-topic-banks.py` — three of its formula families had
  saturated below the 30-item floor (`Right triangles`, `Right triangle
  trigonometry`, `Right triangles and trigonometry` produced ≤24 distinct
  variants; the Text Structure family's passages only varied over the 20-entry
  TOPICS list). The families now use a Pythagorean-triple table × scale ×
  direction and TOPICS grew to 34; NEEDS entries were topped up. Your
  `topic-coverage` test now passes at 106/106 topics (min 30). These edits are
  inside your untracked script — review the diff before committing it.
- `wrangler.toml` — added `favicon-48/96/192.png` and `favicon.svg` to the
  build copy list; your SEO tooling stamps those links into every page, and
  without the copy the deployed icons 404'd. This change is committed.
- Deployed version `6472bb07`; canaries 200; IndexNow 663 URLs submitted
  (the post-deploy step from `scripts/deploy.sh`).
- Everything else of yours (bank content in app.js, guide/landing head
  stamps, favicon assets, SEO regeneration) is untouched in the working
  tree, uncommitted, as you left it.

## 12. New game flipped to default ON — follow-ups to be aware of

Operator instruction (2026-10-10): "change the game to the new version."
`racing/index.js` now defaults enabled. Deployed as version `f3dadba7`; the
live canary reads `enabled: true, source: "default"`.

What still holds, and is now pinned by tests: `?racingV2=0`, the
`RacingV2.setLocal(false)` device override and an account
`profile.flags.racingV2 === false` all return the v1 game; a v2 startup
failure still falls through to v1 in the same tick; nothing downloads until
a driving game is opened.

Follow-ups:

1. **RESOLVED (same day): v2 now carries the session economy.** Operator
   decision: "v2 should be the new v1". Built and shipped in version
   `f530f5df`:
   - Open Practice stays free, unlimited and unrecorded.
   - A Scored run costs one token, gets five minutes of ACTIVE driving (input
     grace or a car still moving; hidden tabs spend nothing; three idle
     minutes end the run), and banks records: best race and best lap per
     track per weather, stored in `profile.racingV2Records` so they sync with
     the rest of the profile. The intro shows tokens and the best here; the
     finish screen says recorded / new record / not recorded and why.
   - The workshop's "Scored run" button presets the v2 intro via
     `RacingSession.request()` / `takePending()`; the token is spent when the
     race starts, not on selection.
   - Covered by `tests/racing-v2-economy.cjs` (8 sections: free practice,
     spend-on-start, record/improve/no-overwrite, time-up unrecorded, broke
     fallback, workshop path).
2. **Two latent bugs surfaced and were fixed while wiring it.** Both were
   pre-existing and invisible to the old tests:
   - v2 mounted into a 0×0 hidden stage from the arcade (`.arcade-stage` was
     never given `active` because the v2 hook bypasses v1's select). The old
     arcade test checked `display` on the mount, which was "block" inside a
     hidden parent. Tests now measure layout rects.
   - racing/session.js wraps select OUTSIDE the v2 hook (script order), so it
     spent the token AND started a v1 session underneath v2. Fixed with a
     `RacingV2.willHandle()` deferral and a unified v1 fallback; a failed v2
     boot now re-dispatches through the full v1 chain, session rules included,
     which the updated flag test asserts.
   Still open from this area: the v1 workshop's tuning/cash upgrades do not
   apply to v2 cars (v2 has its own car, paint, track and mode selection).
   If the garage economy should also move into v2, that is the next feature.
3. **`/SAT%20%26%20ACT%20Practice.html` 301s to a 404.** The Worker's
   canonical redirect strips `.html` and adds a slash; the raw app filename
   then has no page. This is pre-existing (not from today's changes) and
   affects nobody using `/`; flagging it because it surfaced in a canary.
