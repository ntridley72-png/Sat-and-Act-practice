# Search visibility baseline — funsat.bid

Recorded 2026-10-07 03:48 EDT. Facts are labelled [measured] with their source; anything not
measurable from this environment is [UNKNOWN] with the exact export needed.
No search volume, traffic, or ranking figure below is estimated or invented.

## First-party data

| Source | Status |
|---|---|
| Google Search Console (clicks, impressions, queries, pages, indexing, Discover, CWV) | [UNKNOWN] — requires GSC login. Operator must export: Performance → Queries and Pages (3m + 12m), Indexing → Pages, Experience → Core Web Vitals |
| Bing Webmaster Tools (queries, pages, crawl errors, IndexNow status) | [UNKNOWN] — requires BWT login. Export the URL report and Performance report |
| Cloudflare analytics | [UNKNOWN] — requires Cloudflare login |

## Measured search-engine state

| Observation | Value | Source / date |
|---|---|---|
| Bing: URLs from site:funsat.bid | **1 (the homepage)** | bing.com/search via curl, 2026-10-06 ~17:25 EDT |
| DuckDuckGo: URLs from site:funsat.bid | 1 (the homepage) | DDG via webfetch, 2026-10-06 ~12:10 EDT; later attempts bot-blocked |
| Google: index state | [UNKNOWN] — cannot query without GSC | — |
| funsat.bid in Bing top 10 for 10 head queries tested | **no, for all 10** | Bing SERP via curl, 2026-10-06 |
| #1 results observed for those queries | test-guide.com, albert.io, en.wikipedia.org, act.org, hoodamath.com, scholarshipsandgrants.us, studentaid.gov | same |
| Production sitemap | 569 URLs, all lastmod 2026-10-06 at the time | https://funsat.bid/sitemap.xml, 2026-10-06 17:28 |
| Production clusters | colleges 405 · sat-scores 67 · scholarships 52 · act-scores 21 · guides 19 · home + 4 landings. Documented-but-absent at that time: /college-costs/, /unblocked-games/, /sat-act-conversion/ (404) | live fetches |
| Crawl signals | robots allows all and references the sitemap; canonicals correct on every sampled page; JSON-LD parses; HTML cache-control no-cache | live fetches |
| Core Web Vitals | [UNKNOWN] — PSI API returned no data unauthenticated; needs GSC CWV export or a PSI API key | — |

Limitations: SERP reads are from one machine/metro (US East), undated
personalisation cannot be fully excluded, and `site:` result counts are
approximations by the engines, not verified index counts.

## What the remediation changes (local, not yet deployed)

- 663 canonical pages now build locally (production has 569), including the three
  previously-404 clusters and 13 new trust/topic hubs.
- Segmented sitemaps with a sitemap index at the stable /sitemap.xml URL.
- lastmod is content-derived: it only moves when a page's HTML actually changes
  (seo-lastmod.json manifest), not on every rebuild.
- Reverse-completeness is enforced by tests: every indexable page appears in
  exactly one sitemap segment.
- IndexNow submission tool with dry-run, batching, retry/backoff and state.

Submission helps search engines discover changes but does not guarantee
crawling, indexing, ranking, or a particular processing time.
