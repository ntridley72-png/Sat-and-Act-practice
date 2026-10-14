# FunSAT release 2026-10-14 (admissions accuracy + UI/data fixes)

Deployed: 2026-10-14 08:1x EDT to <https://funsat.bid/> and `www.funsat.bid`
(301 -> apex). Cloudflare Worker version: `76a782ad-a21c-4068-90ec-b58c5582c04f`.
Deploy command: cached official Wrangler 4.151.0 (`node .../wrangler.js deploy`).

Source state: branch `codex/admissions-accuracy`. Commits in this release:
`f38527f`, `6457949` (admissions model), `0a4205f` (tutor default),
`57c6ac8` (ads), `67e4cce` (avatars + Layout label), `2d02799` (school-life
sections + safety disclosure), `80f73ae` (middot + photo labels),
`2390e4c` (question families), plus the release commits that follow.

Important: the working tree also contained an in-flight long-tail SEO feature
from a concurrent pipeline (untracked `scripts/build-longtail.py`,
`scripts/longtail_*.py`, and edits to `scripts/seo_common.py` /
`scripts/build-sitemaps.py` / `wrangler.toml`'s build step). That pipeline's
build succeeded locally and its 54 pages passed the SEO audit, so they are part
of the deployed build. They are NOT committed by this release; commit `2390e4c`
alone does not reproduce those 54 pages. `wrangler.toml`'s build step was
adjusted so a missing optional `llms.txt` no longer fails the build.

## Pre-deploy verification (local)

All suites passed on the working tree that was deployed:
college-admissions-accuracy, admissions-model, college, college-verified-data,
college-images, college-ui, college-gallery, college-sections, redesign-ui,
practice, variety, tutor, content-integrations, seo-audit (717 pages),
ads-filter, avatar-ui, arcade-logic, arcade-ui, drift-v2-sandbox,
racing-v2-arcade, driving-recovery, racing (physics/tracks/fixed-step/ghost/ai),
workspace-layout, theme-routing, progress-desk-ui, subjects-ui, scholarship-ui,
scholarship-detail, contrast-audit, account.integration and
help-history.integration (local wrangler D1).

## Post-deploy verification (live)

- `https://funsat.bid/` 200; `<title>` correct; `admissions-model.js` present.
- SHA-256 byte match between the local build and live for:
  `admissions-model.js`, `college.js`, `college-data.js`, `app.js`,
  `progress-desk.css`, `racing-v2/racing-v2.js`.
- `https://www.funsat.bid/` -> 301 `https://funsat.bid/`; sitemap index 200.
- Pages 200: USD college profile (no literal `&middot;`), `/college-rankings/`,
  `/learn/`, `/tools/`, `/data/colleges.csv`, `/sat-practice/`,
  `/scholarships/`.
- `GET /api/ai` 401, `GET /api/me` 401 (no inference spend, no mutations).
- Headless production smoke: home renders the Progress Desk with a separate
  "Layout" control (Exam/Notebook/Focus) and the Saved Appearance control;
  `#college/100858/greek` opens the in-app Greek life section with the verified
  official page; exactly one `.sponsor-label` on the home screen; no console or
  page errors; no horizontal overflow at 390/768/1440 px; account modal shows
  the built-in tutor default with the personal-key section collapsed.

## Known gaps carried in this release

- Phase B4 (recent social-life quotes) and the grant finder/scholarship
  expansion (Phase G) were NOT implemented; see
  `docs/FUNSAT_IMPROVEMENT_LEDGER.md` for the next actions.
- Photo coverage: 30 colleges still have zero images; new images were not
  sourced this session (labeling/dedupe fixes only).
- No independent (Codex) review was run this session; no review is claimed.
- Screenshot comparisons S1/S2/S4/S5/S6/S7 were TCC-blocked; descriptions were
  used. S3 contains a private account email and is not committed.
- Live account-mutation journeys were not run against production; account sync
  was verified against a local D1 instance only.
