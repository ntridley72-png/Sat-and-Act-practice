# College matcher, recommendations and verified research — November 2026

Tags: **[built]** in the repository and tested (not deployed), **[not built]** with the reason. No search volume,
ranking, traffic or competitor claim here was measured by me unless a source is named.

## 1. What existed and what changed

| Existing piece | Before | Now |
|---|---|---|
| /college-match/ | Filter form; its "fit %" mixed admissions into personal fit; 280 KB of college data embedded in the HTML | **Rebuilt in place** (same URL): questionnaire, deterministic engine, separate fit / admissions / cost / evidence; page is 26 KB and loads data after it appears |
| college-data.js (Scorecard, 500 colleges) | Costs, outcomes, score ranges | Reused as is |
| Student profile `satPrepProfile_v1` | Scores, GPA, saved colleges | Reused: matcher pre-fills from it; Save writes `college.saved`; the list builder adds `college.list[id] = {status, note}` |
| College screen in the app | Chances, saved list | Links to the matcher; calculators link to it with scores pre-filled |
| /api/ai tutor | Groq, then Workers AI | Unchanged; the research endpoint reuses the same providers and rate-limit table |

Old `tests/college-match.cjs` tested the removed form and was replaced by `tests/college-matcher-ui.cjs`.

## 2. Data (new, verified)

`scripts/build-college-match-data.py` -> `college-match-data.js` (116 KB gzip, loaded only by the matcher), from NCES
IPEDS 2023: HD2023, IC2023 (revised), C2023_A (degrees conferred July 2022-June 2023). Per college: coordinates, locale,
official URLs (web, admissions, aid, net price calculator, veterans, disability), housing, meal plans, required on-campus
living, AP credit, Yellow Ribbon and other veteran services, ROTC by branch, study abroad, co-curricular undergraduate
research, online courses, counseling and employment services, child care, NCAA/football, religious affiliation, calendar,
application fee, bachelor's programs by CIP code, and professional doctorates on campus (PharmD, MD, DO, JD, DPT, DVM).
Also a place index (2,698 "City, ST" points from all IPEDS institutions) so students can name cities without a map
service, and 70 large-city points (IPEDS locale "City: Large", 250,000+ people). One coding trap found and fixed: IPEDS
meal-plan codes differ from the other yes/no fields. `worker/college-sources.json` is the research allowlist.

## 3. Questionnaire [built]

Quick (10 questions), Detailed (about 19-20), Advanced (about 24-25), sharing one set of answers; switching keeps you on the
same question. Branching: a professional-school question appears only for health and science majors; Yellow Ribbon only for
students using military benefits. Every preference has an importance (must have, very important, important, nice to have,
no preference). Back, Next, Skip / not sure, progress, majors filter, city autocomplete, keyboard and screen-reader labels.
"Describe your ideal college" reads free text locally (no AI needed), shows each interpreted preference with the words it
came from, asks which city when a name is ambiguous, lists wishes it cannot match (beach, skiing, climate, nightlife,
airports), and applies nothing until the student ticks and confirms. Answers stay in localStorage; "Clear my answers" deletes them.

## 4. Matching method [built] — `college-match-engine.js`, public page /college-match/how-it-works/

- 32 checks in 8 categories (default weights 20/20/15/15/10/10/5/5). Each check returns met, partly met, not met or not
  verified. Category score = importance-weighted average of verified checks; fit = weighted average of answered categories
  (weights rescaled to 100%; sliders on the results page; a weight of 0 drops a category).
- Evidence coverage = weighted share of checks that could be verified. Unknowns are never a pass or a fail. When coverage is
  under 60% the fit is shown as a range (every unknown fails .. every unknown passes). More data never raises a score by itself.
- Must have / dealbreaker: any verified shortfall removes the college to "Left out" with the reason; an unverifiable one goes
  to "Needs checking". "Workable without a car" is an estimate from campus setting and can never remove a college.
- Admissions is separate (Likely / Target / Reach / Uncertain) from score position and admit rate; under 15% admit is a reach
  for everyone; no score or test-optional is Uncertain; GPA is not used because colleges do not report GPA ranges federally.
  A high admit rate alone never makes a college Likely. Cost is separate (income-band net price vs budget).
- Deterministic and order-independent (tested); scoring version `match-2026-11-24` is shown on every breakdown.
- When many colleges tie, the page says the order is not meaningful instead of using prestige as a tie-breaker.

Example (from the tests' data): a student who wants pharmacy, biology or chemistry, a PharmD school on campus preferred,
a $20,000 budget, family in Denver, work while studying, no car, SAT 1250:
1. University of Colorado Denver/Anschutz Medical Campus: fit 94, Likely, within budget, 100% verified; concern: no
   bachelor's in pharmaceutical sciences reported.
2. University of Colorado Colorado Springs, Boulder, Colorado State (admissions Uncertain: no comparable range), Metropolitan
   State University of Denver: fit 80; concern: no PharmD school on campus.
"Easy to overlook" for that student included UC Denver/Anschutz, UCCS and the University of Montana.

## 5. Results [built]

Sections: best overall, within budget, career, location and lifestyle, academics, reach worth a look, likely worth a look,
easy to overlook (fit 0.7+, admits 50%+, under 12,000 students), needs checking, left out, my list. Each card: photo (licensed),
location, personal fit, admissions, cost, evidence, why it fits, watch out, needs checking, Save, Compare, Full breakdown, Ask,
official net price calculator. Full breakdown: every check with importance, result and evidence; category weights and coverage;
admissions basis; official links from IPEDS. Compare: up to 4 side by side on the student's own categories, with trade-offs and
no declared winner. "Why wasn't X recommended?": unmet requirements, unverifiable requirements, rank and weak categories.
What-if SAT/ACT changes admissions labels only. List builder: statuses (Interested ... Declined), notes, and a list check
(no Likely schools, mostly Reach, nothing within budget, major missing, low-evidence colleges); suggestions only.

## 6. Verified research assistant [built] — `worker/college-research.js`

`POST /api/college-research {id, question, history}`. Only the college id, the question and the last few Q/A turns are
sent; never grades, scores or budget. Pipeline: college from IPEDS id -> candidate pages on its official domain only (IPEDS
URLs, verified official pages, its own sitemap filtered by the question) -> robots.txt respected -> manual redirects re-checked
against the domain, https only, no IPs, no ports, 6 s timeout, 1.5 MB cap -> text extraction, cached 7 days in D1
(`research_pages`) -> passage ranking -> if nothing relevant: an honest "couldn't find this" with official links and **no
model call** -> otherwise Groq (then Workers AI) answers only from fenced, numbered passages with [S#] citations; text inside
passages is declared data, and a passage cannot close its fence -> citations to passages that do not exist are stripped;
answers with uncited factual sentences are marked unverified -> sources return with URL, retrieval date and the quoted
passage. Per-visitor limit 12 questions per 10 minutes (shared `ai_usage` table). `POST /api/college-research/report`
stores reported answers in `research_reports` for review. The browser accepts only https source links.

Cost per answered question (not measured in production): up to 5 page fetches (free; cached a week), one model call of about
2,000 input and 300 output tokens. Multiply by your provider's current per-token price; unanswerable questions cost nothing.
Matching itself runs in the browser and costs nothing per student.

## 7. Tests (all passing in this environment)

`college-match-engine.test.cjs` (13 fictional students: high achiever, low GPA, test-optional, strict budget, military
dependent, pharmacy, engineering must-have, undecided, transfer-minded, no car, two important places, contradictory
requirements, skips everything; plus weights, reproducibility, coverage ranges, why-not, text parsing),
`college-matcher-ui.cjs` (full browser flow incl. phone), `college-research.test.cjs` (fake site with a hostile page, an
off-domain redirect, a robots Disallow, uncited and invented citations, caching, rate limit, reports). Regression: 14 browser
suites and the unit and SEO suites pass on the final build.

## 8. Not built, and why

- Beaches, ski areas, climate, airports, transit, nightlife, Greek life, local job postings and wages, rental markets:
  no verified source reachable here (installing third-party geodata packages was blocked by a safety check). The matcher
  lists these as unsupported instead of guessing; the research panel can answer them per college from official pages.
- Driving times: only straight-line miles, labeled as such.
- Personalized AI college reports: not generated automatically (cost control); students ask targeted questions instead.
- Major-specific internal admission rules (e.g. direct admit to nursing): no structured source; ask in the research panel.
- Two-year colleges and transfer pathways: the dataset covers 500 four-year colleges.
- AI extraction of written preferences: the local parser is used; an AI version was not added to avoid sending student text out.
- Keyword volumes and competitor hands-on reviews: no keyword tool or competitor access from this environment.
- Live verification: the research endpoint is tested with a fake website; it has not run against real college sites, and
  the Worker bundle with the JSON import was not dry-run because wrangler is not installed here. Run
  `npx wrangler deploy --dry-run --config wrangler.deploy.toml` before deploying, and apply `worker/schema.sql`
  (`npx wrangler d1 execute sat-act-practice-db --remote --file worker/schema.sql`) to create the two new tables.
