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
   RESOLVED 2026-10-10: the workshop's tuning/cash upgrades now apply to v2
   cars — v2 has the full garage. See section 13.
3. **`/SAT%20%26%20ACT%20Practice.html` 301s to a 404.** The Worker's
   canonical redirect strips `.html` and adds a slash; the raw app filename
   then has no page. This is pre-existing (not from today's changes) and
   affects nobody using `/`; flagging it because it surfaced in a canary.


## 13. Garage complete: cars, cash, tuning, cosmetics — and the headless reviews

Operator instruction (2026-10-10): "make the upgrades and cash economy apply
to v2 cars aswell as track, mode and all the other things", with locked
decisions along the way: in-game cash only (no real money), Space = handbrake
exactly as v1, starter car free (the redesigned hero), every other car behind
a cash paywall, all six tracks unlocked from the jump, cosmetics paint +
finish + spoiler + neon, all three camera views with a selector, adjustable
engine volume, "chill" payout rates. And: "have codex headless and claude
look it over to help."

### What shipped (commits 0088592, 6fe1207, b7a62cc, 520d084, ea7a9a4 + this)
- The intro is the garage: roster from `racing/data/cars.js` (one canonical
  list both games read), starter free and selected, every other car priced
  and bought with in-game cash earned by finishing scored runs. Tokens
  convert to cash ($250) in the garage too.
- All six tracks free from the start (enabled chips at $0).
- Tuning (power/grip/weight/handbrake) resolves into the real Vehicle physics
  (`racing-v2/src/garage.ts` `carPhysics`). Calibration pinned in
  `racing-v2/tools/garage-check.mjs` (29 cases): the stock sport car at the
  default tune equals the shipped vehicle exactly (mass 500, slip 1.5,
  force 1800).
- Payouts on scored finishes: $500 base + $25/s under 120 s (90 s credit cap)
  + $75 per place better than 12th + $150 wet. Practice, time-up and idle pay
  nothing (idle end verified live: $0, 7/7, reason idle).
- Cameras chase/far/hood (selector + C cycles); engine volume slider;
  cosmetics paint/finish/spoiler/neon (neon is a generated canvas texture).
- v1-era garages migrate (legacy ids map forward, e.g. panda→hatch) and v1
  reads the same `profile.garage`, so both games share one garage.
- Space = handbrake, S/Down = brake/reverse, Shift = boost.

### Review findings and dispositions (codex exec + claude -p, read-only)
- codex: a pending scored request was consumed before the v2 bundle was
  confirmed, so a failed boot silently downgraded a paid run to practice.
  FIXED: consumed only after load; on any later failure the request is
  restored and a token v2 charged for that attempt is refunded, so v1 charges
  exactly once. Pinned by two new flag-test cases (sync mount throw;
  charged-then-post-mount-error — both end tokens 1→0 with a scored v1 run).
- codex: passive pointer movement counted as driving on the scored clock.
  FIXED to v1's exact rule (pointermove needs buttons held).
- codex: the college audit gate (aa75c7f) failed on 55 cached mis-filed
  photos inside the review range. FIXED in the builder: kind is re-derived
  from the URL and an athletics label without a venue file name downgrades to
  campus; cache-only rebake brings the gate from 55 failures to 0 (1260
  photos). Also aligned `content-integrations`' stale 3-image cap with the
  six-image gallery contract.
- claude (live exploit): the shipping test probe could finish a Scored run
  and bank a full payout from devtools. FIXED: probe finish is pay-gated
  (records, never mints cash); pinned in economy test section 9. The probe's
  "harmless in production" comment was corrected.
- claude: double-charge on post-mount error and the sync-throw restore — same
  seam as codex's finding; both covered by the new flag cases.
- claude: tune bounds — the bridge clamps writes to 0.7–1.4 and `carPhysics`
  clamps reads, so a hand-edited profile cannot reach the solver with 10×
  force; pinned live (hostile 99 → force 3600 = range max). `racePayout`
  guards junk positions.
- Residual (documented, not hidden): the real drive-to-finish payout cannot
  be automated headless — SwiftShader renders the host page at ~2 fps and a
  scripted driver wedges on track barriers. The exact payout block was
  measured live before the gate landed (P1 at 100 s = $1825 exactly, cash
  1825), the formula is unit-pinned, and lap completion calls that same
  block. Recommended manual close-out: one finished Scored run on real GPU.
- Also caught by re-running the operator's suite under v2-by-default: the v2
  hook skipped v1's select() teardown, so a running v1 engine kept playing
  over v2 and `arcade.game` went stale. FIXED (stopAudio + game=null before
  mounting v2) and arcade-logic now exercises the teardown itself. arcade-ui
  and drift-ui were adapted to the documented v1 opt-out for their v1
  contracts. New `scripts/serve-tests.cjs` serves the production layout on
  :8899 (/racing-v2/* → dist) — a plain http.server made every v2 request a
  404 that arcade-ui correctly flagged.

### Verification (all green, 2026-10-10)
`racing-v2-garage` (new: roster/paywall, buy persistence, v1 visibility,
tune→physics, hostile clamp, migration, Space handbrake) ·
`racing-v2-economy` (9 sections) · `racing-v2-flag` (incl. both failure
variants) · `racing-v2-arcade` · `racing-behavior` · `garage-check` 29/29 ·
`forward-test` (hardened to require a standstill) · v1 node:test suites
7+16+23+31+30+10 = 117 pass · `racing-session` · `racing-garage-conflicts`
(in real Worker, wrangler dev :8787) · `arcade-logic` · `arcade-ui` (28
games) · `drift-ui` · `college-images` / `college-ui` / `college-gallery` /
`college.test` · `content-integrations` · `contrast-audit` ·
`workspace-layout` · `workshop-tracks-bars` · `seo-audit` · `ads-filter`.
Screenshots: `racing-v2/bench/shots/garage-{intro,style,tuning,race}.png`.
