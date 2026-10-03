# College Score Goals: data, sources, and algorithm

## What ships

The College tab lets students search 354 four-year U.S. colleges, compare their
SAT/ACT score with each college's reported enrolled-student range, set a score
goal, and see an unofficial estimated chance range with the factors behind it.
The student profile and saved college list sync to the signed-in account.

## Data source

- **Source:** U.S. Department of Education, College Scorecard,
  `Most-Recent-Cohorts-Institution` (May 2026 release, file published 2026-05-26).
- **Rebuild:** `python3 scripts/build-college-data.py [csv]` regenerates
  `college-data.js` (downloads and caches the official bulk file when no CSV is
  given).
- **What the numbers are:** admit rate, undergraduate enrollment, and SAT
  (Evidence-Based Reading and Writing + Math) and ACT Composite 25th/75th
  percentiles for **enrolled** students. These are the most recent values each
  college reported to the Department of Education. They are not admitted-student
  statistics and not official admission targets.
- **Official college sites and source data** are linked on every detail panel
  (Scorecard school page by UNITID).

### Selection rule

Four-year, degree-granting, public or private nonprofit colleges with at least
500 undergraduates: every college admitting 55% or fewer applicants, plus the
150 largest by undergraduate enrollment. Colleges that no longer report test
ranges (for example, test-free University of California campuses) are included
with ranges labeled "not reported" so students still see the college and its
admit rate. Missing values are never inferred or invented.

### Coverage gaps

- The file contains federal data only. It does not include official
  admitted-student medians, average admitted GPA, or major-level admit rates,
  because those are not comparable across colleges.
- Testing policy changes yearly; every panel tells the student to verify the
  current policy with the college.
- Small colleges outside the selection rule, specialty conservatories, and
  for-profit institutions are out of scope for v1.

## Estimate algorithm

The displayed percentage is an original app estimate for planning. It is not an
admission probability and not a student percentile.

1. **Starting point:** the college's reported admit rate (clamped to 1–95%).
2. **Score position:** where the student's score falls across the college's
   enrolled 25th–75th range, mapped to log-odds. If the student took the other
   test, the official ACT/College Board concordance (2018, latest) converts it;
   the conversion is labeled.
3. **GPA:** the student's GPA on a 4.0 scale compared with a benchmark derived
   from the college's selectivity band (documented in the app).
4. **Rigor:** counts of AP, IB, honors, and dual-enrollment courses add a small
   readiness signal.
5. **Activities:** short entries with sustained involvement and leadership add a
   small holistic signal.
6. **Context:** first-generation status, financial hardship, working during
   school, and caregiving are treated as context, not score boosts.
7. **Intended major:** shown as context. No numeric adjustment is made because
   colleges do not publish comparable major-level admit rates.

The output is a point estimate plus a range that widens when score data, GPA
data, or both are missing, and for 9th/10th graders. The app lists every factor
and its direction, plus the formula, and explains that colleges review
applications holistically.

### Unanswered questions

Estimates use answered practice questions only. Skipped questions never lower a
predicted score or the college estimate, but the app reminds the student how many
questions they left blank. A blank and a wrong answer both score zero on test day.

## Official scoring references

- ACT Composite (current): average of English, Math, and Reading, rounded;
  Science is optional and reported separately —
  https://www.act.org/content/act/en/products-and-services/the-act/scores/understanding-your-scores.html
- ACT/College Board concordance (2018, latest) —
  https://www.act.org/content/act/en/products-and-services/the-act/scores/act-sat-concordance.html
- College Scorecard data —
  https://collegescorecard.ed.gov/data/
