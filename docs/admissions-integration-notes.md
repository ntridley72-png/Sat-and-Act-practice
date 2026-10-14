# Integration and conflict notes (admissions-experimental-preview)

Branch `codex/admissions-experimental-preview`, baseline `f38527f` (tag `checkpoint/admissions-experimental-baseline`). Not merged. Built from the **committed** baseline only.

## Another task is working in the same area

The original checkout was on `codex/admissions-accuracy` with **uncommitted** edits to `college.js`, `tests/college.test.cjs`, `tests/redesign-ui.cjs`, `wrangler.toml`, `SAT & ACT Practice.html`, `docs/AI_USAGE_LOG.md`, and an untracked `admissions-model.js`. None of it was read, copied or modified. Expect textual conflicts in those files, and a **name clash**: both branches add `admissions-model.js` with `reportedRate`. Compare before merging and keep one. `tests/college-admissions-accuracy.test.cjs` (baseline file) passes against this branch's `admissions-model.js`.

## Files changed

| File | Change | Conflict risk |
|---|---|---|
| `college.js` | estimator replaced by an adapter over `AdmissionsModel`; chance cards, detail panel, compare table, comparison cards, AI context rewritten; invented outputs removed | high |
| `admissions-model.js` (new) | the single estimator | clash with other task's file |
| `admissions-data.js` (new, generated) | IPEDS ADM2023 counts, verified overrides, test-policy overrides | none |
| `scripts/build-admissions-data.py`, `scripts/data/admissions-verified.json` (new) | generator and hand-verified records | none |
| `redesign.js` | removed the normal-curve percentile and the waitlist/deny bar | medium |
| `college-profile.js` | Above/Within/Below-range wording; hides on test-blind pages | low |
| `SAT & ACT Practice.html` | two `<script defer>` tags before `college.js` | medium |
| `wrangler.toml` | **only** the two new filenames in the build copy list (production routes, D1 and AI binding untouched) | medium |
| `worker/index.js` | `fetch` now calls `handle`; `PREVIEW_MODE` adds noindex; `AI_MODE=mock`; `EXTRA_AI_ORIGIN`. All no-ops unless those vars are set | medium |
| `workspace.css` | `.adm-*`, `.cc-exp`, `.fit-unknown` rules appended | low |
| `wrangler.preview.toml` (new) | isolated preview config | none |
| `calibration/` (new) | offline pipeline, synthetic fixture | none |
| `docs/admissions-methodology.md`, this file (new) | documentation | none |
| tests | rewrote `tests/college.test.cjs`, `tests/college-ui.cjs`, `tests/redesign-ui.cjs` where they asserted removed behavior; added `admissions-model`, `admissions-calibration`, `preview-config` tests | medium |

## Behavior changes a reviewer should know

- The personal estimate is **off by default** and abstains for unknown/blind policy, no score, or an official rate under 10%. Most colleges have an unconfirmed policy, so most show "estimate unavailable".
- Removed: waitlist/deny percentages, the "likely range", low/medium/high confidence, GPA "typical" benchmarks, boosts for essays, activities, hardship, early application and athletes, the pie chart, Reach/Target/Likely/Safety buckets by number, sorting by the estimate, and the 0.3 fallback.
- The AI-reviewed "life context" note no longer changes any number.
- Production publishes `admissions-model.js` and `admissions-data.js` after merge because the build list now includes them; nothing else about production deploys changes.

## Open decisions

1. Should any personal number ship to production at all? Recommend keeping the toggle off by default.
2. `beta = 0.5` and the 10% cutoff are unsourced assumptions.
3. Confirm the IPEDS `ADMCON7` code meanings, then more colleges can have a known test policy.
4. Refresh counts when NCES posts `ADM2024`; add verified records for more schools from their Common Data Sets (2025-26 versions report fall 2025).
5. Pre-existing failing tests unrelated to this work (also failing on the baseline): `account.integration`, `help-history.integration` (need a running API), `seo-audit.test` (needs a built `public/`), `college-gallery`, `college-sections`, `driving-recovery`, `scholarship-detail`, `variety.test`.
