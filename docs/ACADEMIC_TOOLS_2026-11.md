# Academic tools phase — November 2026

What was audited, built, tested and deliberately left out. Tags: **[built]** shipped in the repository (not deployed),
**[existing]** already on the site, **[recommended]** not built. No search volume, ranking or traffic figure here was
measured by me; the keyword numbers you supplied are repeated only as "reported, unverified".

## 1. Feature inventory (before this phase)

| Feature | Status before | Action |
|---|---|---|
| SAT/ACT raw-to-scaled score calculator (/score-calculator/, guides) | 1. Working; ACT composite already uses English/Math/Reading | Kept, linked from the new hub |
| SAT-ACT concordance (/sat-act-conversion/) | 1. Working (official 2018 table) | Kept |
| College matcher, chance estimates with GPA and scale | 1. Working | Extended: takes GPA/SAT/ACT from calculators, what-if mode |
| Student profile (`satPrepProfile_v1`, account sync) | 1. Working | Reused: calculators write its `college` fields; no second profile |
| Official score reports (Plan screen) | 1. Working | Reused: superscore calculators pre-fill from them |
| GPA calculators (any kind) | 4. Missing | **Built** (6 tools) |
| Grade / final / semester calculators | 4. Missing | **Built** (4 tools) |
| SAT superscore, ACT composite, ACT superscore | 4. Missing | **Built** (3 tools) |
| AP score calculators | 4. Missing | **Not built** (see section 6) |
| Calculator hub | 4. Missing | **Built** (/calculators/, search, filters, recently used) |
| Dashboard (Progress desk) | 1. Working | Not duplicated; GPA links added to the College screen |

## 2. Keyword evidence

Keyword tools (Ahrefs, Semrush, Keyword Planner, DataForSEO) are not available here, and search engines' autocomplete
endpoints are blocked from this environment. The figures below are the ones you supplied; none were re-verified.

| Query | Reported US volume (unverified) | Page built | Notes |
|---|---|---|---|
| GPA calculator | 740,000 | /calculators/gpa/ | Dominated by large calculator sites; realistic only long-term |
| college GPA calculator | 50,000 | /calculators/college-gpa/ | |
| high school GPA calculator | 22,000 | /calculators/high-school-gpa/ | Differentiator: multiple years, school-specific weights |
| AP score calculator | 20,000 | none | No official cutoffs published |
| SAT score calculator | 18,100 | /score-calculator/ (existing) | |
| weighted GPA calculator | 11,000 | /calculators/weighted-gpa/ | A difficulty of 0 is not proof of no competition |
| AP World / AP Psychology score calculator | 8,900 / 5,400 | none | Same reason as above |
| GPA calculator with current GPA | 2,600 | /calculators/cumulative-gpa/ | |

Also built for distinct intents without reported volumes: final grade, weighted grade, grade (points), semester grade,
GPA improvement ("what grades do I need"), SAT superscore, ACT composite, ACT superscore. The full 150-query research the
brief asks for still needs a keyword tool; it is the first item in section 9.

## 3. Competitor and student-complaint findings used

From public search results only (the environment cannot open competitor sites):
- Calculator sites commonly assume one weighting policy; students' schools differ. **Built:** editable weights per level, bonus-on-F switch, three grading scales, percent cutoffs shown.
- Cumulative GPA is often computed as an average of term GPAs, which is wrong when terms have different credits. **Built:** credit-weighted cumulative, with the difference shown in the worked example.
- Grade calculators often cannot handle categories without grades. **Built:** empty categories are left out and the remaining weights rescaled, with a warning when weights do not add to 100.
- ACT changed its composite in 2025 (English, Math, Reading; Science optional). Confirmed on act.org. **Built:** enhanced and earlier versions, ACT's .5-rounds-up rule.
- Forced accounts and data collection are common complaints. **Built:** nothing leaves the browser; saving is opt-in and erasable.

## 4. What was built

| Area | Delivered |
|---|---|
| Shared maths | `academic-calc.js`: one tested implementation for every tool (GPA, terms, cumulative, target, retake replace/average, projection, points grade, weighted categories with drop-lowest and extra credit, final needed and outcome table, semester grade, SAT superscore, ACT composite (both versions), ACT superscore). Full precision internally; rounding only for display. |
| Tools | 13 calculator pages under /calculators/ plus the hub. Each has: tool first, example data, live results, validation messages, undo, reset, copy result, opt-in device saving with delete, the formula, a worked example, limits, related tools. |
| Integration | "Find colleges that fit these results" opens the College screen with the GPA/score as a **what-if**: the saved profile is untouched, a banner says so, and "Keep" or "Back to my saved numbers" ends it. "Use ... in my college profile" writes the value (unweighted GPA for GPA tools). Superscore tools pre-fill from official scores saved on the Plan page. Superscore results link to the weaker section's skill pages. The College screen links back to the GPA tools. |
| Navigation | "Calculators" in the content-page main nav, the site footer, /free-test-prep/, /score-calculators/, /score-calculator/, and every college profile. |
| SEO | Canonical, title, description, H1, BreadcrumbList, WebApplication (no ratings), FAQPage only where the questions are visible. Hub at priority 0.9 in the core sitemap. 885 pages; all audit checks pass. |
| Ads | Calculator pages are built so the first in-content ad lands after the tool, never between the heading and inputs; tested on every page. |

## 5. Tests

- `tests/academic-calc.test.cjs`: every expected value hand-worked first (weighted/unweighted, credits, zero-credit and pass/fail, terms vs averaged terms, cumulative, needed GPA including impossible, retake replace vs average, projection, extra credit, drop lowest, missing work, final needed incl. impossible/guaranteed/extra credit, semester with a blank part, SAT/ACT validation and rounding, display rounding).
- `tests/calculators-ui.cjs` (built site, real browser): all 13 tools render without errors; no ad slot above or inside a tool; results equal the library; typing updates, focus stays, undo and reset; weights-not-100 warning; what-if keeps the saved GPA and clears the URL; explicit save writes the unweighted GPA; superscore pre-fill; opt-in storage and deletion; hub search and filters; four tools fit a 360px phone.
- Regression on the rest of the site: see the final report for the run.

Found and fixed during testing: screen-reader-only labels escaped the scrolling table and caused sideways scroll on phones; the final-grade example opened on an impossible target; the "needed average" letter label was imprecise (now "between a B+ and an A- average").

## 6. Deliberately not built

- **AP score calculators.** College Board publishes each exam's section weights but not the composite cutoffs that map to a 1-5 score, and they vary by administration. Building one would mean inventing a curve or showing only a percentage. Recommended path: build per subject only where a released scoring worksheet gives cutoffs, label the year, and show a range.
- SAT improvement calculator as a separate page (the College screen's what-if, the skill pages and the Plan screen's study plan already cover it), student loan and net price calculators (official net price calculators are linked on college pages), transfer GPA.
- Shareable result URLs: results are not put into URLs, by design. "Copy result" copies a one-line summary the student chooses to share.
- A new dashboard: the existing Progress desk remains the dashboard.

## 7. AllMyPrep name check (preliminary, not legal advice)

- Search found no company, product or trademark record for "AllMyPrep" or "All My Prep" (Justia trademark listings for test prep returned other marks: MASTERYPREP, SMART TEST PREP, POCKET PREP, MIGHTYPREP, PREPTAG). No "MyPrep" record surfaced either.
- Not checked (need tools or accounts not available here): USPTO exact and phonetic search in Classes 9 and 41, domain availability and history (WHOIS, Wayback Machine), backlink and spam history, social handles, app-store names.
- Concerns to weigh: "Prep" marks are crowded in Class 41, so a descriptive name may be weak to protect. Branding for static pages is already centralized in `scripts/site.json`; the app shell still has the name in several places, which a rebrand would need to update.
- Nothing was changed, bought or migrated.

## 8. Measurement (privacy-conscious)

No analytics events were added. Recommended, once the owner turns on Cloudflare Web Analytics or a similar cookieless tool:
calculator page views by tool, and three counts with no values attached: "result computed", "what-if opened", "saved to profile".
Never send grades, GPAs or scores.

## 9. Next, in priority order

1. Verify keyword demand with a real keyword tool and Search Console data for /calculators/ after four to six weeks.
2. AP calculators only for subjects with published scoring worksheets, starting with the highest-demand subjects you listed (Psychology, World History).
3. Colleges-by-GPA pages built from the same data as /sat-scores/ (only where enough colleges report data).
4. Printable GPA plan (the scenario table) and a counselor-friendly embed of the GPA calculator with plain attribution.
