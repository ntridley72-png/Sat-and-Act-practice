# Growth, SEO and product plan — November 2026

What was measured, what changed in this pass, and what is only recommended. Nothing here is a traffic, ranking or
index-count claim: this environment cannot reach funsat.bid (the sandbox proxy blocks it) or Search Console, so no live
crawl, Lighthouse run or field data exists. Items are tagged **[measured locally]**, **[from public sources]** or **[recommended]**.

## 1. Baseline

| Item | Value | Tag |
|---|---|---|
| Built pages / sitemap URLs / unique titles | 841 / 841 / 841; no orphans; canonicals, H1s, JSON-LD, IndexNow dry run pass (`tests/seo-audit.test.cjs`) | measured locally |
| `app.js` | 3.06 MB raw, 404 KB gzip (holds all question banks) | measured locally |
| `college-data.js` | 1.84 MB raw, 233 KB gzip | measured locally |
| Scripts loaded by the app page | 26, all `defer` | measured locally |
| Previous index state | Bing `site:` showed 1 URL on 2026-10-06; Google unknown (docs/SEARCH_VISIBILITY_BASELINE.md) | prior measurement |
| Search Console, Bing Webmaster, Core Web Vitals field data | unavailable to me | unknown |

## 2. Changed in this pass

1. **Long-lived caching for build-stamped assets.** The build now hashes every local script and stylesheet (it hashed 9
   files before, so an `immutable` rule would have served stale files after a change to the other ones). The Worker serves
   `?v=<8 hex>` css/js as `max-age=31536000, immutable`; the app shell, content pages, unstamped code and `sw.js` still
   revalidate. Effect: repeat visits on a slow school network skip about 1 MB of gzip downloads when nothing changed.
   Test: `tests/cache-headers.test.cjs`. This is a lab/design effect, not a measured field improvement.
2. Verified, not changed: ads are child-directed treatment, suppressed in tests and gameplay, and the privacy page says so;
   `ads.txt` correctly declares no third-party sellers; copy audit found no banned filler phrases in site copy.

### Second pass (same day)

3. **College admissions by year.** Every college profile in the app has an "Admissions by year" card (Latest, Fall 2023,
   Fall 2022, Fall 2021) that shows one year at a time; the static college pages carry the same years in a crawlable
   table. Source: IPEDS final files ADM2021/2022 (revised) and ADM2023, prices from IC2023_AY. The data loads only when a
   profile opens. Test: `tests/college-years-ui.cjs`.
4. **Corrected period labels.** The Scorecard dictionary labels admissions "Fall 2022" and tuition "2022-23", but the
   shipped values match IPEDS Fall 2022 for only 27 of 500 colleges and match colleges' own Fall 2024 / 2024-25 figures
   (Harvard 3.6% and $61,676; MIT 4.5% and $62,396). Labels now say Fall 2024 / 2024-25 and explain the discrepancy.
5. **Photo audit.** 200 of 1,260 college photos removed by rules in `scripts/college_photo_audit.py` (run on every data
   build): 149 dated before 2011 or archival survey scans, 25 scanned book or yearbook pages, 10 off topic (a NASA Mars
   image for Caltech, Florida license plates, a FedEx jet, a weather sensor), 2 showing a different school (Fairleigh
   Dickinson filed under Dickinson College), 13 with no recorded license, 1 undescribed. 16 colleges now show no photo
   rather than a wrong one. Full list: `docs/college-photo-audit.json`. Test: `tests/college-photo-audit.test.cjs`.
6. **Smaller and better-cached JavaScript.** The deployed `college-data.js` drops fields the browser never reads
   (1.65 MB to 0.95 MB to parse, 214 KB to 175 KB gzip). `app.js` ships as `questions.js` (2.4 MB raw, 223 KB gzip) plus
   `app.js` (650 KB, 181 KB gzip) so a code fix no longer re-downloads the question bank. Every css/js URL now carries its
   own content hash, so a deploy invalidates only files that changed. The repository keeps single source files; the
   split happens in the build (`scripts/slim-college-data.py`, `scripts/split-app-data.py`, `scripts/stamp-assets.py`).
7. **SAT skill pages.** 28 pages (one per official Digital SAT skill) plus `/sat-math/` and `/sat-reading-writing/` hubs:
   what the skill tests, how to approach it, 2 to 4 sample questions from the corrected bank with answers and per-choice
   explanations in plain HTML, and drill links that open the app's skill picker on that skill (`/?practice=`). Linked from
   the site-wide footer, /sat-practice/ and /free-test-prep/. Test: `tests/skill-pages.cjs`.
8. **Test fixes.** Twelve browser tests assumed the first math question has choices; a module can now open on a typed
   answer. They share `tests/helpers/to-choice.cjs`.
9. Docs: `docs/KEYWORD_MAP.md`, `docs/DISTRIBUTION_KIT.md`, `docs/DESIGN_SYSTEM.md`.

Found, not fixed: some templated Boundaries writing items pair the sentence being edited with an unrelated passage (the
skill pages skip them; the app still serves them). The orange `--ws-accent` still exists under the blue skin (see
DESIGN_SYSTEM.md).

## 3. Why pages may not be indexed (what is known)

- Bing indexed one URL as of Oct 6; the site was new and mostly generated pages. Public guidance (Ahrefs, SE Roundtable)
  says "Discovered, not indexed" usually means low perceived quality or crawl budget, and sometimes just time.
- **IndexNow reaches Bing, Yandex, Seznam and Naver only, not Google.** Google needs Search Console: verify the domain by DNS
  TXT and submit `sitemap.xml`, then use URL Inspection on the 10 most important pages. This is the largest gap and needs
  the owner's account.
- Generated programmatic pages (405 colleges, 66 score pages, etc.) are the main thin-content risk. Mitigation already in
  place: no pages without real data. **[recommended]** Review Search Console's "Pages" report after two to four weeks and
  noindex or merge any cluster Google marks "Crawled, not indexed".

## 4. Competitor and complaint research (limited)

The sandbox allows search results only, not visiting sites, so this is **[from public sources]** and shallow. It is not
the 20-site hands-on review asked for; that still needs to be done with a normal browser.

| Source | What the public record says | Opportunity for FunSAT |
|---|---|---|
| College Board Bluebook | Only a few official adaptive full tests | Unlimited untimed topic practice in the Bluebook style (done earlier) |
| Khan Academy | Free; users on its forum ask for more full practice tests | Full-length tests plus topic sets with no account |
| OnePrep | Free tier is limited (a listing says 500 questions, 1 full test); paid ~ $148 per third-party listings; sources conflict | Stay free without an account; do not copy their pricing claims |
| UWorld | Paid, reported $99–$200 (third-party roundup, unverified) | Free explanations and tutor |
| College Scorecard | Federal aid students only (about 40% of students excluded); reliability criticism | Show source and year on every number; never invent missing data (already the rule) |
| Niche | Criticized for mixing government, school and student-reported data without labels | Label each statistic's source |
| BigFuture and others | Dated UI, ads throughout, sign-in walls (a 2025 roundup) | No sign-in, limited ads (already true) |

## 5. Recommended next steps, scored with the 100-point framework

| Rank | Work | Score | Notes |
|---|---|---|---|
| 1 | Verify Search Console + Bing Webmaster; submit sitemap | ~85 | Owner action; unblocks all measurement |
| 2 | Split `app.js` so question banks load by section (404 KB gzip today) | ~75 | Biggest Chromebook speed win; needs care with tests |
| 3 | College year selector and per-stat source/year labels | ~72 | Needs three verified years of data; do not mix years |
| 4 | Privacy-light event counts (practice started/finished, college compare) using existing Cloudflare Web Analytics | ~70 | Owner must enable it |
| 5 | Hands-on competitor review in a real browser, then a one-page brand/design brief | ~65 | Cannot be done from this sandbox |
| 6 | Distribution: free-resource lists, school counselor lists, teacher directories | ~60 | Each needs verification of current submission rules before anyone submits; none were submitted |

Still not done: hands-on competitor visits, live crawl and Lighthouse, field Core Web Vitals, keyword volumes (none are
invented), submissions to any directory (copy is ready in DISTRIBUTION_KIT.md), a full visual design overhaul (the
system is documented and the accent debt named), and lazy-loading the question bank on demand.
