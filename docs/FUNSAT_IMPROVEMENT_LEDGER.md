# FunSAT improvement ledger (2026-10-14)

Branch: `codex/admissions-accuracy` (checkpoint `f38527f` pushed before edits).
Baseline: all suites below were run on this machine against the local static
server (`scripts/serve-tests.cjs`) and local wrangler D1. Owner: DeepSeek
(primary). Codex headless assistance was NOT used this session (see limits).

## Phases and status

| Phase | Requirement | Status | Evidence |
|---|---|---|---|
| A | Inventory + ledger | done | this file |
| B1 | Published vs predicted admissions, test-blind, no unvalidated boosts | done | `admissions-model.js`, `college.js`, `tests/college-admissions-accuracy.test.cjs` (passes), `tests/admissions-model.test.cjs` (new, passes), `tests/college.test.cjs` (updated to the non-probability contract) |
| B2 | Campus-safety disclosure, 2025 handling, scopes | done (pilot scope) | in-app `<details class="safety-disclosure">` in `college.js`; 14-school cross-checked pilot (2022-2024); 2025 explicitly "not yet available"; `tests/college-ui.cjs` + `tests/college-sections.cjs` pass |
| B3 | School-life sections inside FunSAT | done | six sections with verified per-college links + checked date, honest gap states, `#college/<id>/<section>` deep links; `tests/college-ui.cjs` passes |
| B4 | Recent social-life quotes | NOT STARTED | requires verified <2y public quotes per college; no fabricated quotes added |
| C | College photos (S7) | partial | `&middot;` fixed in generator; 10 statue/monument photos relabeled; USD duplicate removed; 1260 -> 1245 photos; `tests/college-images.cjs`, `college-gallery.cjs` pass. No new images sourced (network research not completed) |
| D1 | Sidebar labels/spacing, first-load theme | partial | layout selector labeled "Layout" with tooltip + spacing; startup theme scripts already pre-paint (`theme-routing.cjs` passes). Screenshots S1/S5/S6/S7 were TCC-blocked; exact comparison unavailable |
| D2 | Silhouette avatars + upload | done | `avatar.js` silhouettes (8 combos), upload pipeline with canvas re-encode, size/type/dimension checks, tamper rejection; `tests/avatar-ui.cjs` rewritten and passes |
| D3 | Built-in tutor default, BYOK secondary | done | account pane defaults to built-in, BYOK in collapsed optional disclosure with fallback copy; `tests/tutor.test.cjs` passes |
| D4 | Ads: one SPONSORED label, suitability | done | label dedupe per host; gambling filter added; `tests/ads-filter.cjs` passes. Dashboard category blocks remain the primary defense inside third-party iframes (cannot be swept from our DOM) |
| E | Drift Circuit v2 + all-game input/audio | verified, no new work needed | `drift-v2-sandbox.cjs`, `racing-v2-arcade.cjs`, `driving-recovery.cjs`, `arcade-ui.cjs`, `arcade-logic.cjs` all pass on current HEAD; car geometry shipped earlier (d2be964) |
| G | Grant finder + >=50 verified opportunities | NOT STARTED | requires live provider verification; not fabricated |
| F | Verification, SEO, deploy | pending | see below |

## Bug found and fixed outside the named list

`tests/variety.test.cjs` failed at HEAD (pre-existing): 1720 bank items had no
`family`, so the sampler's near-duplicate guard could not group templates.
Backfilled `family = dedupe || id` for 2641 items; the suite now passes.

## Commits this session

- `0a4205f` account: built-in tutor default, BYOK demoted
- `57c6ac8` ads: one SPONSORED label per slot + gambling filter
- `67e4cce` account: silhouette avatars + validated photo upload; Layout label
- `admissions` + `college` + photos + variety commits (see `git log`)

## Verification actually run (2026-10-14)

Passing: college-admissions-accuracy, admissions-model, college, college-images,
college-verified-data, college-ui, college-gallery, college-sections,
redesign-ui, college.test, practice, variety, tutor, content-integrations,
seo-audit, ads-filter, avatar-ui, arcade-logic, arcade-ui, drift-v2-sandbox,
racing-v2-arcade, driving-recovery, racing (node suites), workspace-layout,
theme-routing, progress-desk-ui (<http://127.0.0.1:8903>), subjects-ui,
scholarship-ui, scholarship-detail, contrast-audit, account.integration,
help-history.integration (local wrangler D1 on 8787).

Not run / limitations:
- Exact screenshot comparisons for S1/S2/S4/S5/S6/S7: the temporary
  screenshot directories are TCC-protected ("Operation not permitted"); the
  descriptions were used instead. S3 (codex clipboard) exists but contains a
  private account email and is not committed.
- No Codex headless review was executed; no independent review is claimed.
- Live production account-sync and paid inference were not exercised.
- Grant finder and quote research were not completed; no data was invented.

## Next concrete actions (handoff)

1. Phase G: audit `scholarships-data.js` (51 records) for funding type,
   deadline status, and provenance; add a `data/grants` catalog with verified
   federal/state/institutional records (Pell/FSEOG/state grant agencies first),
   then the search/matching UI with match reasons and bookmark sync. Keep the
   Progress Desk UI. Target >=50 new verified records; report any shortfall.
2. Phase B4: collect 2-3 verified quotes per priority college (published within
   2 years, <=20 words, direct URL + date); label as student opinions.
3. Phase C: source additional Wikimedia Commons images for the weakest
   galleries (30 colleges still have zero images); reuse the existing
   `build-college-photos.py` gates.
4. Deploy: `wrangler deploy` (cached 4.150.0) after the full suite; verify
   `https://funsat.bid/`, sitemaps, tutor endpoint, and asset hashes.
