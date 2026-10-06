# funsat.bid — search performance audit

Audit date: **2026-10-06** (all times EDT). Auditor: OpenCode (Claude agent) with live web access from this machine.
Metrics are labelled **[measured]**, **[estimate]**, or **[UNKNOWN]**. Nothing here is a guessed volume or position.

---

## 1. Measured baseline

| Item | Value | Source (retrieved 2026-10-06) |
|---|---|---|
| Sitemap URLs | **569** [measured] | `https://funsat.bid/sitemap.xml`, 17:28 |
| Sitemap clusters | colleges 405 · sat-scores 67 · scholarships 52 · act-scores 21 · guides 19 · home + 4 landing pages [measured] | same |
| Sitemap `lastmod` | all `2026-10-06` [measured] | same |
| `robots.txt` | allows all; references sitemap; no host directive [measured] | `https://funsat.bid/robots.txt` |
| Cluster health sample | colleges (6 random profiles + 2 state hubs), sat-scores/1200, act-scores/28, scholarships/gates-scholar, guides/desmos, home, sat-practice-test — **all 200, correct canonical, `index,follow`, JSON-LD parses 1–2 blocks** [measured] | live fetches |
| College cluster size | **404** profile/state URLs in sitemap; 6/6 sampled have unique titles [measured] | sitemap + live fetches |
| Title/description uniqueness | sat-scores 3/3, scholarships 3/3 sampled unique [measured] | live fetches |
| HTML caching | `cache-control: no-cache, must-revalidate` [measured] | `curl -I /` |
| 404 page | bare 404 with empty body on unknown URLs [measured] | `/sat-scores/999/`, `/college-costs/texas/` |
| **Claimed clusters that do not exist** | `/college-costs/`, `/unblocked-games/`, `/sat-act-conversion/` return **404** [measured] | live fetches |
| **Bing indexation** | `site:funsat.bid` → **1 result (the homepage)** [measured] | `bing.com/search`, ~17:25 |
| **Bing SERP presence** | not in top 10 for any of 10 head queries tested; #1s observed: test-guide.com, albert.io, en.wikipedia.org, act.org, hoodamath.com, scholarshipsandgrants.us, studentaid.gov, act.org, studentaid.gov [measured] | Bing SERP via curl, 17:25–17:30 |
| Google indexation | **[UNKNOWN]** — no authenticated access; see exports needed below |
| DuckDuckGo | bot challenge now; earlier same-day observation (webfetch ~12:10) showed **1 result, the homepage** [measured earlier] | DDG |
| Core Web Vitals | **[UNKNOWN]** — PageSpeed Insights API returned no data unauthenticated | PSI v5 API |
| Search volumes / competitor traffic | **[UNKNOWN]** — no Ahrefs/Semrush access this session | — |

### Exports the operator must provide (no workaround)

- Google Search Console → Performance → **Queries** and **Pages** (3 months + 12 months, full CSV)
- GSC → **Indexing → Pages** report (indexed vs not, with reasons)
- GSC → **Experience → Core Web Vitals**
- Bing Webmaster Tools → **Index explorer** / URL report + Performance (queries/pages)

Those three GSC exports are the difference between guessing and planning. Nothing in this report substitutes for them.

---

## 2. Top actions, ranked by expected gain ÷ effort

Gain is a judgement about leverage, not a measured forecast — every one of these is a judgement call except where noted.

1. **Fix indexation before anything else.** 569 URLs submitted, 1 indexed in Bing [measured]. Diagnose from the GSC/BWT exports above; in Bing Webmaster check the URL report for "Discovered/Crawled/Excluded" and confirm no Cloudflare bot rule is challenging bingbot. Then request indexing (GSC) for home + the 4 landing pages + 10 college samples. *Check in 30 days:* indexed count in GSC Pages and BWT.
2. **Resolve the phantom clusters.** `/college-costs/`, `/unblocked-games/`, `/sat-act-conversion/` are documented as live in `docs/SEO_AUDIT_PROMPT.md` but 404 [measured]. Either ship them from the existing build script or delete the claims; anything linked to them today sends visitors to a 404. *Check:* 200s in sitemap or removed from docs.
3. **Make score pages decision tools, using data you already hold.** `/sat-scores/<n>/` already has unique copy; add a data-backed list "colleges where this score is above their 75th percentile" computed from `college-data.js`, plus links to those profiles. Same for ACT. This converts thin lookup pages into unique, internally linked pages — the class most likely to be indexed first. *Check:* GSC impressions on the cluster; internal link clicks.
4. **Add `/compare/<college-a>-vs-<college-b>/` pairs for your top ~20 colleges.** Full data exists for both sides (admit rate, ranges, costs, outcomes, debt, earnings). "X vs Y" is a high-intent query class with no page on the site. *Check:* indexation of the new template within 30 days; impressions.
5. **Major hubs from existing `maj` data**: `/majors/<field>/` listing the colleges with the largest share of that degree. Data is already in the dataset; no new source needed.
6. **Scholarship tag hubs** from existing tags (need/merit/first-gen/STEM/undocumented): `/scholarships/tag/<tag>/`. Unique, data-backed, and internally links all 51 records.
7. **Internal linking: hub → profile → sibling profiles.** Footer links alone leave 400 college pages weakly connected. Add "nearby / similar colleges" blocks (state + selectivity band) inside profile pages. *Check:* crawl stats in BWT (pages crawled per day) and indexation of previously uncrawled URLs.
8. **Link building, concretely:** submit to district **LibGuides / school library resource pages** (search `<district> libguides sat practice` and email the librarian), r/SAT and r/ACT **wiki resource lists**, study Discords, and any "free alternatives to PrepScholar/Khan" listicles you can email. Judgement: 3–5 real links beat 50 directory submissions. *Check:* referring domains in BWT/GSC links report.
9. **Unique meta discipline at scale.** Samples were unique [measured] — keep it that way when adding templates; add the current year or a data point to each title so future pages cannot collide.
10. **Get one real CWV reading** (GSC export or PSI with an API key), then fix what it shows. Until then, do not "optimise" performance blind.

---

## 3. What to stop doing

- **Stop expanding page count before indexation is fixed.** 568 of 569 submitted URLs are not indexed in Bing [measured]. More programmatic pages add crawl debt, not traffic.
- **Stop documenting clusters that are not built** (the three 404s above) — it caused this audit brief to describe a site that does not exist.
- **Do not chase DuckDuckGo** as a channel: it bot-blocked this machine twice today; it is not a meaningful lever.
- **Do not act on third-party volume estimates** — none were obtained, and acting on remembered ones is exactly what the brief forbids.

---

## 4. Open questions only the operator can answer

1. Are `/college-costs/`, `/unblocked-games/`, `/sat-act-conversion/` meant to be live? If so, why did the build not ship them?
2. Bing Webmaster: what does the URL report say about the 568 unindexed pages (Discovered vs Excluded vs Crawled-not-indexed)?
3. Has Cloudflare "Bot Fight Mode" or a WAF rule ever been enabled on this zone? If yes, has bingbot's status been checked?
4. Is there any existing backlink or social mention of funsat.bid? (GSC Links report settles this.)
5. Do you want the phantom clusters built, or removed from the docs and prompt?

Flagged judgement calls: action ranking order, the backlink targets in #8, and the "stop" list's relative emphasis. Everything in the measured table is directly verifiable with the sources named.
