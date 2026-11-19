# Progress Desk and SEO production release

Released 2026-10-14 to https://funsat.bid/ and its configured Cloudflare aliases.
Source commit: `3cf8d83`. Asset stamp: `c81d7346`.
Cloudflare version: `5eaa81ac-fecc-40be-bad0-a3cbd54a17c8`.

Deployment used existing official Wrangler 4.150.0 with the repository's build
command. It rebuilt 663 indexable pages and read 1406 static assets; uploaded
675 changed/new assets and successfully deployed the Worker and custom domains.
No database migrations, account writes or new secret/config changes were made.

## Live verification

- All 663 sitemap URLs returned HTTP 200, with one H1, the expected title,
  self-canonical URL, JSON-LD and the new Progress Desk assets. Pages carrying
  an asset stamp matched the current release stamp; no stale release detected.
- The live sitemap index and all six segments exactly matched generated output.
- progress-desk.css/js, subjects.js, college.js, racing-v2 bundle and robots.txt
  matched the deployed build byte-for-byte via SHA-256.
- www.funsat.bid redirected to the canonical apex with HTTP 301.
- Read-only provider endpoint returned 200; unauthenticated /api/me returned 401.
- IAB showed the published dashboard and new assets, with no JavaScript errors.
  The SAT landing page had no horizontal overflow at 375, 768 and 1440px.
- Local SEO, practice and college regression suites passed. Earlier full UI,
  contrast and game/audio verification is recorded in design-qa.md.

Evidence: tests/screenshots/progress-desk/live/sat-practice-desktop.png and
sat-practice-mobile.png. These show only public content, not account records.

## Existing issue found during production QA

The unchanged third-party ad network served dating and gambling promotions on
the SAT landing page. This was not introduced by the UI/SEO release, but it is
unsuitable for a student-focused site. Ad settings/placements were not changed
without separate authorization. Recommend reviewing or removing these placements.

Release publishing and technical SEO verification passed. Content/ad suitability
needs a separate fix; browser QA verdict: SHIP WITH FIXES (existing ad issue).
Exact visual regression for the landing page is INCONCLUSIVE because there is
no matched pre-release baseline for that route. Core Web Vitals, a full axe /
screen-reader audit, live login and account-sync write journeys were not tested.
Publishing does not establish search-engine indexing or ranking.
