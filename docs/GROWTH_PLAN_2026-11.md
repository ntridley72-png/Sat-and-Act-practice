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

Not done: hands-on competitor visits, live crawl and Lighthouse, field Core Web Vitals, keyword volumes (none are
invented), submissions to any directory, the college year selector, JS splitting, a design-system rewrite.
