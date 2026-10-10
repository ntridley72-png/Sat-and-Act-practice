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
