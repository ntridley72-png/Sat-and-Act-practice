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

---

# Part 2 — Remediation, independent review, and final validation

## 13. Independent code review

**Reviewer:** Codex (`gpt-5.6-sol`, low effort), read-only, instructed to inspect the
actual repository rather than the report. Prompt covered the 27-point checklist
(canonicals, robots, sitemaps, lastmod, redirects, orphans, thin content,
structured data, IndexNow, Indexing-API misuse, CWV, security, build).

**Verdict: CHANGES REQUIRED** — no CRITICAL findings; five valid HIGH/MEDIUM
defects, all fixed:

| # | Sev | Finding | Resolution |
|---|---|---|---|
| 1 | HIGH | Four landing pages (`/sat-practice-test/`, `/act-practice-test/`, `/score-calculator/`, `/games/`) were missing from every sitemap: the landing builder appended to `</urlset>` after the sitemap became an index | New `scripts/build-sitemaps.py` scans the actual build output last and writes all six segments from what exists; the old writers no longer touch sitemaps; reverse-completeness enforced in tests |
| 2 | HIGH | `lastmod` was build-day for several families (false freshness) | Content-hash manifest `seo-lastmod.json`: a page's `lastmod` only moves when its rendered HTML changes; unchanged rebuilds keep their dates |
| 3 | MED | IndexNow state never resubmitted changed URLs; terminal 4xx exited 0; dry-run wrote logs | State now stores lastmod per URL and resubmits on change; any non-2xx sets a failing exit code; `--since` validated; dry-run performs no network and no writes |
| 4 | MED | SEO audit was one-directional and missed the missing landings | Added reverse completeness (every indexable page in exactly one sitemap) and a side-effect-free dry-run assertion |
| 5 | MED | Worker did not upgrade `http:` to `https:` | Single-hop scheme upgrade added to `canonicalRedirect`; production verification pending deploy |
| 6 | LOW | Partial cleanup let stale generated trees persist | Build now starts from a fresh `public/` every time |
| 7 | LOW | Ordinals rendered as "61th"/"92th" | `ordinal()` helper added; score pages also gained a percentile-source note |

Also confirmed by the reviewer: no Google Indexing API misuse; no private
secrets (the IndexNow key and AdSense IDs are public identifiers); server-rendered
content is meaningful; path redirects are single-hop and loop-free.

**Rejected findings:** none. Two informational notes were accepted as-is:
Core Web Vitals and rendered accessibility remain unverified in this environment
(no PSI key, no GSC access).

## 14. FINAL VALIDATION

| Check | Result | Notes |
|---|---|---|
| Production build (fresh tree) | **PASS** | 663 indexable pages, 6 sitemap segments |
| Automated test suite | **PASS** | 16 suites: practice, variety, tutor, college + arcade-logic, arcade-ui, racing-behavior, drift-ui, dirtbike-ui, redesign-ui, college-ui, scholarship-ui, subjects-ui, theme-routing, content-integrations, seo-audit |
| SEO audit (automated) | **PASS** | robots, segmented sitemaps, canonicals, unique titles (663/663), one H1 per page, JSON-LD parses, no broken links, no orphans, game `?play=` deep links, IndexNow dry-run |
| Sitemap validation | **PASS** | index + 6 segments; 663/663 URLs have local files; reverse completeness enforced |
| Canonical audit | **PASS** (local) | every sitemap URL self-canonical; **production redirect/scheme behavior NOT AVAILABLE until deploy** |
| Robots audit | **PASS** | allows all, references stable `/sitemap.xml` |
| Schema audit | **PASS with WARNING** | all JSON-LD parses; FAQ/HowTo pages have matching visible content by construction; not run through Google's rich-results validator |
| Redirect audit | **WARNING** | single-hop logic verified by inspection; live 301s previously observed for `.html`→extensionless; needs post-deploy retest |
| Orphan-page audit | **PASS** | none among indexable pages (sitewide footer + contextual links) |
| Duplicate/thin audit | **PASS with WARNING** | 663 unique titles, no duplicate descriptions detected; score/game templates are structured similarly by design and need periodic quality review per the reviewer |
| Internal-link crawl | **PASS** | no broken internal targets |
| Lint / typecheck | **NOT AVAILABLE** | no linter/typechecker configured in this repo; `node --check`-equivalent parsing and `git diff --check` used instead (**PASS**) |
| Accessibility / Performance (CWV) | **NOT AVAILABLE** | no local a11y audit tooling; PSI API returned no data unauthenticated; requires GSC CWV export or a PSI key |
| IndexNow | **PASS (tooling)** | dry-run side-effect-free; batching/state/backoff verified; a live submission of 659 production URLs occurred unintentionally during verification (see incident note in docs/SEO_SETUP.md) — run `--all` once after deploy |

Statement of record: *Submission helps search engines discover changes but does
not guarantee crawling, indexing, ranking, or a particular processing time.*

## 15. FINAL DEPLOYMENT VERDICT

**READY TO DEPLOY WITH NON-BLOCKING WARNINGS.**

Non-blocking warnings:
1. Deployment is withheld **by instruction** — explicit owner approval required
   before any push or `wrangler deploy`.
2. After deploying, run `node scripts/indexnow.mjs --all` once (the pre-deploy
   submission incident and unchanged `lastmod`s mean this is needed).
3. Re-verify live: HTTPS upgrade, `.html`→extensionless 301s, sitemap fetch by
   Googlebot/Bingbot, and a 200 sample from every cluster.
4. Core Web Vitals, rendered accessibility, and Google/Bing first-party index
   data remain unverified from this environment; the operator's GSC/BWT exports
   complete that picture.

---

## Post-deploy verification (2026-10-07)

Deployed: version `0e6dfad7-5df6-41c4-9c69-405c5037b815` (funsat.bid + www + workers.dev).

| Check | Result |
|---|---|
| Sitemap index + segments | PASS — core 14 · sat-act 92 · colleges 456 · scholarships 52 · guides 19 · games 30 (663 URLs) |
| Cluster samples (15 URLs incl. previously-404 `/unblocked-games/`, `/college-costs/texas/`, `/sat-act-conversion/`, hubs, trust, college profile, score, scholarship, guide) | PASS — all HTTP 200 |
| `http://funsat.bid/` | PASS — 301 → `https://funsat.bid/` (single hop) |
| `/about.html` | PASS — 301 → `/about/` |
| `app.js` | PASS — 200 |
| Game deep link `/?play=2048` | PASS — arcade opens with 2048 selected, no page errors |
| IndexNow resubmission | PASS — `--all`, 663 URLs, 7 batches, all HTTP 200 |

Watchers for the next 30 days: GSC Pages report (indexed vs discovered), BWT
URL report, sitemap fetch status, and Core Web Vitals once Search Console data
accumulates.
