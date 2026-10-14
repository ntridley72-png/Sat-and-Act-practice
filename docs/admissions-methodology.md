# Admissions analysis: methodology, sources, and validation status

Model version: `exp-heuristic-0.1.0` (`admissions-model.js`). Status of the personal estimate: **experimental, not validated**.

## Three modes, never blended

| Mode | What it is | Status |
|---|---|---|
| A. Official statistics and comparisons | acceptance rate from raw counts; test policy; score vs the published enrolled range | shipped |
| B. Experimental heuristic estimate | a labeled, deterministic nudge of the official rate | shipped, **off by default**, abstains often |
| C. Outcome-validated prediction | needs representative real admission outcomes | **not available** (no such data) |

## Mode A: where the numbers come from

Acceptance rate = `100 x admitted / applicants`, calculated at read time from raw counts. Nothing is rounded before the calculation.

| Tier | Colleges | Cohort | Source |
|---|---|---|---|
| Verified, newest | UC Berkeley, Davis, Irvine, Riverside, San Diego, Santa Barbara, Santa Cruz | Fall 2026 admitted first-year class (snapshot) | each campus's page at `admission.universityofcalifornia.edu/campuses-majors/<campus>/first-year-admit-data.html`, read 2026-10-14 |
| Verified | UCLA | Fall 2025 first-year applications | `admission.ucla.edu/apply/first-year/first-year-profile/2025`, read 2026-10-14 |
| IPEDS bulk | 352 of 354 catalog colleges (the rest have no counts) | Fall 2023 entering class | NCES IPEDS Data Center `ADM2023.zip`, file dated 2024-12-03, retrieved 2026-10-14 |
| Rate only | any college with no counts | "Cohort year unverified" | College Scorecard `ADM_RATE`, May 2026 release |

Four dates are kept apart: **cohort** (the class the counts describe), **published** (the source's own date, `null` when the page shows none), **retrieved** (the day a person read it), **built** (the day the generator ran). A newer record replaces an older one for that college only and carries its own cohort label; old data is never relabeled as newer.

Why the newest data is not everywhere: NCES has not posted `ADM2024` at the Data Center (the URL returns 404 as of 2026-10-14), so the IPEDS tier is fall 2023. The UC pages show a "snapshot of the admitted first-year class" with no update date; those counts can change before final reporting. UC's residency scope is not stated on the page, and UCLA's page does not say whether all rounds are included. Both are recorded as such.

The College Scorecard rates in `college-data.js` do **not** equal 100 x admitted / applicants from IPEDS for fall 2021, 2022 or 2023 (median gap 1.9 points even against 2023), so the Scorecard cohort year is treated as **unverified**. The old label "Fall 2022" in `build-college-data.py` is a typed constant, not read from the file.

Rebuild: `python3 -I scripts/build-admissions-data.py --zip <ADM2023.zip> --published 2024-12-03 --retrieved <date> --built <date>`. The output is byte-identical on rerun. Verified overrides live in `scripts/data/admissions-verified.json`; add a record only after reading it from its source.

### Test policy

Only explicit data counts. A cited override (`policy` in `admissions-data.js`) comes first: all eight UC campuses are **test-blind**, sourced to UC's statement "UC does not consider SAT or ACT test scores when making admissions decisions or awarding scholarships." Otherwise the free-text `test` field is read ("Required", "Not considered", "Test optional"). The IPEDS `ADMCON7` code is carried but **not interpreted**: its dictionary lists five labels without confirming which number each belongs to, and the existing label "Considered" is ambiguous. Everything else is `unknown`. There is no rule that guesses from state or school type.

### Score comparison

The student's SAT or ACT is compared with the school's published 25th to 75th percentile of **enrolled** students and reported as below, within or above. That range describes who enrolled, not who was admitted, and is not a cutoff. No percentile is derived from the two endpoints. The range's year is not stated in the source file and is shown as such. Practice or concorded scores are labeled estimates. At a test-blind college the score is ignored. GPA is not compared because the catalog has no institutional GPA on a matching scale; it stays visibly unknown.

## Mode B: the experimental estimate

`p = sigmoid( logit(rate) + beta * step )`, rate = the official rate as a fraction, `step` = -1 / 0 / +1 for below / within / above the enrolled middle 50%.

| Parameter | Value | Kind |
|---|---|---|
| official rate | per college | sourced |
| `beta` | 0.5 | **assumed**, not fitted |
| minimum official rate | 10% | **assumed** |

It returns "estimate unavailable" when: the official rate is missing, 0, 100 or below 10%; the test policy is unknown or test-blind; the college is test-optional and the student has not said they would submit; or there is no score or no published range. It shows whole percents only ("<1%", ">99%" at the ends). The sensitivity range reruns the formula with beta 0 and 1 and is labeled "sensitivity to an assumed coefficient, not a confidence interval". There is no confidence score, calibrated probability, waitlist or deny percentage.

Not modeled, and explained in words only ("This may matter to admissions, but this estimate cannot quantify it."): GPA and rigor, Early Decision/Action, hooks, residency, major, essays, recommendations, activities, personal circumstances.

The required warning sits in the same element as every experimental percentage: "Experimental estimate—not validated against representative admission outcomes. Actual decisions can differ substantially."

Limits worth knowing: it applies a pool-wide rate to one person; the pool includes early, hooked and self-selected applicants; enrolled ranges are not admitted ranges. The previous formula (about 20 unsourced weights, invented waitlist/deny shares, made-up ranges, GPA benchmarks, essay and hardship boosts) was removed because it could not be explained or defended.

## One estimator for the UI and the AI

`AdmissionsModel.analyze()` is the single calculation. The cards, detail panel, comparison table and the tutor's context (`toAiContext`) all read it. The AI may restate its numbers but not create them: `guardAiReply` removes any percentage the estimator did not produce, and `validateExtraction` accepts only explicit, quoted facts (SAT, ACT, GPA, scale, test type, submit intent) and rejects sensitive characteristics and anything it infers. The guard runs when the reply is displayed; the Worker cannot enforce it because users with their own Groq key call Groq directly. What-if comparisons call the same estimator on a copy and are labeled hypothetical.

## Mode C and the evidence gap

Searches found no legally reusable, deidentified dataset pairing applicant profiles with actual decisions. Found and rejected as validation evidence: IPEDS and Scorecard (institution aggregates), a single-institution research dataset that is not public, a leaked and redacted private file (not licensed), public-records requests with no published dataset, and tiny teaching datasets. Synthetic applicants, AI-generated outcomes and anecdotes are not validation evidence. So the status stays **not validated**.

`calibration/` holds the offline pipeline for when real data exists (see `calibration/README.md`). It never runs on the site, never trains during chats, and never collects user outcomes. Collecting outcomes from minors would need consent, FERPA/COPPA review and storage outside the repo and D1.
