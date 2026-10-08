# Verification evidence — 2026-10-07

No production deployment, live ad impressions, ad clicks or production account changes were made.

## Build and source checks

- Existing Python build pipeline: passed, generating 663 indexable HTML documents and segmented sitemaps.
- `npx wrangler deploy --dry-run --outdir /tmp/funsat-worker-build`: passed, assets included and Worker bundled; no publish. Worker bundle 33.46 KiB / gzip 9.87 KiB at verification.
- JavaScript syntax checks on application/advertising/metrics files: passed.
- Python compile checks on edited generators: passed.
- `git diff --check`: passed.

## Existing tests

| Test | Result |
|---|---|
| account.integration.cjs | PASS: local D1 signup/sync/conflicts/Google-auth configuration |
| help-history.integration.cjs | PASS: local D1 persistence/idempotency/account ownership/deletion |
| practice.test.cjs | PASS: original questions, scores, bank validity, adaptive selection, history and topic-score exclusion |
| variety.test.cjs | PASS: independent math/content checks and rotation |
| tutor.test.cjs | PASS: mocked tutor/provider failures and recovery |
| college.test.cjs | PASS: data/scoring/estimate invariants |
| content-integrations.cjs | PASS: SEO and centralized ads integration markers; no legacy network scripts |
| seo-audit.test.cjs | PASS: 663 URLs, titles/canonicals/H1/structured data/links/sitemaps |
| arcade-logic.cjs | PASS |
| arcade-ui.cjs | PASS: all 28 games draw and accept input without console errors |
| racing-behavior.cjs | PASS |
| dirtbike-ui.cjs | PASS |
| drift-ui.cjs | PASS |
| college-ui.cjs | PASS |
| redesign-ui.cjs | PASS, with policy-correct no-Google-DOM-modification assertion |
| scholarship-ui.cjs | PASS |
| subjects-ui.cjs | PASS |
| theme-routing.cjs | PASS: WCAG AA transition text in three themes |
| groq-models.live.cjs | Environment-limited: local endpoint returned 403 forbidden for every probe because Wrangler rewrote Origin to http://funsat.bid, rejected by the existing HTTPS-only production origin allowance; no production probe run |

The existing UI suites hard-code a macOS browser path. For this environment a temporary Node preload replaced only the executable path with `/usr/bin/chromium`; product code was not changed to bypass tests. Static testing used a local Python server on port 8899; integrations used Wrangler local port 8787 with the existing schema applied to local D1 only. Test-generated screenshots and last-modified manifest changes were restored, keeping the patch focused.

## New tests

`node tests/monetization.test.cjs`: PASS — validates malformed/missing public config, prevents secret leakage, verifies authorized ads.txt, checks analytics consent/privacy properties and excludes hidden-tab time from game milestones.

`node tests/monetization-ui.cjs`: PASS — checks 390×844, 768×1024, 1366×900, 1920×1080 and 2560×1440; independently safe two-rail spacing on large desktop; no rails on narrow screens; removal after resizing; no page ads visible behind gameplay; stable arcade-menu host across redraws; active questions ad-free; usable completed results and filtered answer review; missing IDs/CMP do not load Google; one mocked official loader and one unit push across repeated mounts/SPA returns; never alters delivered Google element attributes; blocked loader and no-fill retain a working product; simulated delayed app scripts do not create an ad dependency; no page errors.

Google/doubleclick/legacy-network traffic was blocked in product browser tests. Dedicated loader tests use mocked JavaScript and no real inventory. The original results flow had an h1 selector against h2 markup; correcting it allowed the results/review test to complete.

## Practical limits

Mock tests establish product resilience and request logic, not Google approval, live delivery, paid viewability or actual revenue. Current policy sources are listed in `policy-review.md`. Actual creative expansion, CMP UI, slow mobile devices/network throughput, field LCP/CLS/INP and real reporting require a staged live approved configuration. Local UI checks and explicit reservations do not establish measured Core Web Vitals improvement.
