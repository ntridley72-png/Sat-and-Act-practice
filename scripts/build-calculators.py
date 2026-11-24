"""Academic calculator pages: /calculators/ (hub) and one page per tool.

The tool comes first on every page; the text below it says how to use it, the exact formula, one worked example whose
numbers are checked in tests/academic-calc.test.cjs, its limits, and where to go next. All maths runs in the browser
from academic-calc.js; calculators.js renders the tools. Existing tools (the SAT/ACT raw-score calculator, SAT-ACT
conversion, college matcher) are linked from the hub rather than rebuilt. Run after build-hubs.py.
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from seo_common import ORIGIN, ROOT, TODAY, breadcrumbs, e, faq_schema, page, write  # noqa: E402

HUB = "/calculators/"
CATS = [("gpa", "GPA calculators"), ("grades", "Grade calculators"), ("tests", "SAT and ACT calculators"), ("college", "College tools")]

# id, category, h1, title, meta description, lead, how-to bullets, method (html), worked example (html), limits, related ids/paths, faqs
CALCS = [
    ("gpa", "gpa", "GPA Calculator", "GPA Calculator: Letter or Percent Grades, Any Credits",
     "Free GPA calculator: enter letter or percent grades and credits to get your GPA on a 4.0 scale, with plus/minus or whole-letter scales. No sign-up.",
     "Enter each class with a letter grade or a percent and its credits. Your GPA updates as you type.",
     ["Type grades as letters (B+) or percents (88).", "Leave credits at 1 for high school classes that meet all year; use credit hours for college.",
      "Pick the scale your school uses. Pass/fail and withdrawals are left out automatically."],
     "<p>Each grade becomes grade points (A = 4.0, A- = 3.7, B+ = 3.3 ... F = 0). GPA = sum of (grade points × credits) ÷ sum of credits. "
     "Percents use 93+ = A, 90-92 = A-, 87-89 = B+, and so on down to below 60 = F.</p>",
     "<p>A in a 3-credit class, B in a 4-credit class and C in a 1-credit class: (4.0×3 + 3.0×4 + 2.0×1) ÷ 8 = 26 ÷ 8 = <strong>3.25</strong>.</p>",
     "Schools convert percents to letters differently; if yours uses another cutoff (for example 94 for an A), enter letters instead.",
     ["weighted-gpa", "high-school-gpa", "cumulative-gpa", "/college-match/"],
     [("How do I calculate my GPA?", "Turn each grade into grade points, multiply by the class credits, add those up, and divide by the total credits."),
      ("Does a pass/fail class count in GPA?", "Usually not: a pass carries credit but no grade points, so it is left out of the average.")]),
    ("weighted-gpa", "gpa", "Weighted GPA Calculator", "Weighted GPA Calculator for AP, IB, Honors and Dual Enrollment",
     "Weighted GPA calculator with your school's own policy: set the bonus for honors, AP, IB and dual enrollment, see weighted and unweighted GPA side by side.",
     "Set your school's weighting policy, mark each class's level, and see your weighted and unweighted GPA together.",
     ["Open the policy panel and set what your school adds for honors, AP, IB and dual enrollment.", "Choose each class's level.",
      "Decide whether an F still gets the level bonus (most schools say no)."],
     "<p>Weighted grade points = unweighted grade points + the level bonus (default: honors +0.5, AP/IB/dual enrollment +1.0). "
     "Weighted GPA = sum of (weighted points × credits) ÷ sum of credits. The unweighted GPA ignores the bonus.</p>",
     "<p>A in a regular class (4.0), B+ in AP (3.3 + 1 = 4.3), C in honors (2.0 + 0.5 = 2.5), F in AP (0, no bonus): "
     "weighted (4.0 + 4.3 + 2.5 + 0) ÷ 4 = <strong>2.70</strong>; unweighted (4.0 + 3.3 + 2.0 + 0) ÷ 4 = <strong>2.33</strong>.</p>",
     "Colleges often recalculate GPA with their own rules, and many look at the unweighted number plus the rigor of your schedule.",
     ["high-school-gpa", "gpa", "gpa-improvement", "/college-match/"],
     [("Is a 4.3 weighted GPA good?", "It depends on your school's scale and how many advanced classes it offers; compare it with your unweighted GPA and your school's profile."),
      ("Do colleges use weighted or unweighted GPA?", "Many recalculate it themselves. The unweighted GPA is the more comparable number between schools.")]),
    ("high-school-gpa", "gpa", "High School GPA Calculator", "High School GPA Calculator: Weighted, Unweighted, Every Year",
     "High school GPA calculator for every semester or year: honors, AP, IB and dual enrollment, weighted and unweighted, with a cumulative GPA and a trend chart.",
     "Add each year or semester, then your classes. You get each term's GPA, the cumulative GPA and how it is trending.",
     ["Add a section for each year or semester.", "Enter classes with grade, credits and level.", "Adjust the weighting policy to match your school's handbook."],
     "<p>Each term's GPA is computed from its own classes. The cumulative GPA averages <em>every class</em> by credit, so a year with more classes "
     "counts more; it is not the average of the yearly GPAs.</p>",
     "<p>Fall: two A's at 3 credits (4.0 over 6). Spring: one C at 1 credit (2.0). Averaging the terms would give 3.0, but the cumulative GPA is "
     "(24 + 2) ÷ 7 = <strong>3.71</strong>.</p>",
     "Some schools leave out 9th grade, non-core classes or freshman-year PE; delete those rows if yours does.",
     ["weighted-gpa", "gpa-improvement", "cumulative-gpa", "/college-match/"],
     [("How do I calculate my cumulative high school GPA?", "Add the grade points times credits for every class you have taken and divide by the total credits."),
      ("Should I include 9th grade?", "Include it unless your school or the college you apply to says otherwise; many colleges use 9th to 11th grade.")]),
    ("college-gpa", "gpa", "College GPA Calculator", "College GPA Calculator: Semester and Cumulative GPA",
     "College GPA calculator: enter this semester's classes with credit hours and your current cumulative GPA to get your semester GPA and new cumulative GPA.",
     "Enter this semester's classes with credit hours. Add your cumulative GPA and hours so far to see the new cumulative GPA.",
     ["Use credit hours from your course schedule.", "Enter your current cumulative GPA and the hours that count toward it (from your transcript).", "Choose A+ = 4.3 if your college uses it."],
     "<p>Semester GPA = sum of (grade points × credit hours) ÷ hours this semester. New cumulative GPA = (current GPA × hours so far + this semester's grade points) ÷ all hours. "
     "College GPAs have no honors or AP bonus.</p>",
     "<p>3.2 over 60 hours, then A, A, B, B in four 3-hour classes (semester 3.5): (192 + 42) ÷ 72 = <strong>3.25</strong>.</p>",
     "Repeated courses, pass/no-pass and transfer credit follow your college's catalog; transfer grades often do not count in the GPA.",
     ["cumulative-gpa", "gpa-improvement", "gpa"],
     [("What is a good college GPA?", "Many scholarships and programs use 3.0 as a cutoff, and graduate programs often look for 3.3 to 3.5, but requirements vary by field."),
      ("Do transfer credits count in my GPA?", "At many colleges transfer credits count toward graduation but not toward the GPA. Check your college's catalog.")]),
    ("cumulative-gpa", "gpa", "Cumulative GPA Calculator", "Cumulative GPA Calculator with Your Current GPA",
     "Cumulative GPA calculator that starts from your current GPA and credits: add this term's grades to see your new cumulative GPA and how much it changes.",
     "Start from your current GPA and credits, add this term's classes, and see the new cumulative GPA.",
     ["Enter your cumulative GPA and the credits behind it.", "Add this term's classes and expected grades.", "Change grades to see best and worst cases."],
     "<p>New GPA = (current GPA × credits so far + new grade points) ÷ (credits so far + new credits). The more credits you already have, the less one term moves it.</p>",
     "<p>3.20 over 60 credits plus A, A-, B+, B at 3 credits each (grade points 12 + 11.1 + 9.9 + 9 = 42): (192 + 42) ÷ 72 = <strong>3.25</strong>.</p>",
     "Use the credits that count toward your GPA, not total credits earned, if your school has pass/fail or transfer credit.",
     ["gpa-improvement", "college-gpa", "high-school-gpa"],
     [("How do I calculate GPA with previous semesters?", "Multiply your current GPA by the credits it covers, add the new term's grade points, and divide by all the credits.")]),
    ("gpa-improvement", "gpa", "GPA Improvement Calculator", "Raise My GPA: What Grades Do I Need? (GPA Improvement Calculator)",
     "Find the average you need to reach a target GPA, see if it is possible, compare retake policies, and plan grade scenarios term by term.",
     "See the average you need to reach a target GPA, whether it is possible, what a retake would do, and how different semesters play out.",
     ["Enter your GPA, credits so far, credits still to take, and your target.", "Check the retake section if your school lets you repeat a class.",
      "Add scenarios (straight A's, realistic, rough semester) to compare the paths."],
     "<p>Needed average = (target × (credits so far + credits left) − current GPA × credits so far) ÷ credits left. If that is above the top grade, the target "
     "cannot be reached in that many credits. Retake with replacement: (GPA × credits − old points × course credits + new points × course credits) ÷ credits. "
     "Retake with averaging: both grades count, so the course's credits are added again.</p>",
     "<p>2.90 over 60 credits, 60 left, target 3.20: (3.20 × 120 − 174) ÷ 60 = <strong>3.50</strong> needed. With 30 credits left at 2.0 over 90, a 3.5 target "
     "would need 8.0, so it is out of reach: straight A's give 2.50. Retaking a 3-credit F as an A with replacement, from 3.0 over 30: (90 + 12) ÷ 30 = <strong>3.40</strong>.</p>",
     "These are arithmetic, not predictions. Retake rules vary a lot (some schools cap the replacement or keep both grades on the transcript).",
     ["cumulative-gpa", "high-school-gpa", "/college-match/"],
     [("What grades do I need to raise my GPA?", "The calculator shows the average you need across your remaining credits; that average is the target."),
      ("Does retaking a class raise my GPA?", "If your school replaces the old grade, the old points come out; if it averages them, both grades count.")]),
    ("grade", "grades", "Grade Calculator", "Grade Calculator: Points Earned and Possible",
     "Grade calculator for points-based classes: enter points earned and possible for each assignment to get your current percent and letter grade, with extra credit.",
     "List assignments with points earned and points possible. Leave a score blank if it is not graded yet.",
     ["Enter earned and possible points for each assignment.", "For extra credit, put the points earned and 0 possible.", "If your class weights categories, use the weighted grade calculator."],
     "<p>Grade = total points earned ÷ total points possible × 100. Extra credit adds earned points without adding possible points.</p>",
     "<p>18/20, 45/50 and 5 points of extra credit: (18 + 45 + 5) ÷ (20 + 50) = 68 ÷ 70 = <strong>97.1%</strong>.</p>",
     "Your teacher's gradebook may round or weight differently; the gradebook is the official grade.",
     ["weighted-grade", "final-grade", "gpa"],
     [("How do I calculate my grade from points?", "Add the points you earned, divide by the points possible, and multiply by 100.")]),
    ("weighted-grade", "grades", "Weighted Grade Calculator", "Weighted Grade Calculator: Categories, Missing Work, Drop Lowest",
     "Weighted grade calculator with your class's categories (homework, quizzes, tests, final), drop-lowest rules, missing work and extra credit. Free, no account.",
     "Use your syllabus categories and weights. Add scores to each category, and see your grade and how much of the class is graded so far.",
     ["Rename the categories and set the weights from your syllabus.", "Add each score as earned/possible. A missing assignment counts as 0; a blank one is not graded yet.",
      "Set \"drop lowest\" if your teacher drops scores."],
     "<p>Each category's percent = points earned ÷ points possible (after dropping the lowest scores if set). Course grade = sum of (category weight × category percent) ÷ "
     "the weight of the categories that have grades. Empty categories are left out until they have scores, which is how most online gradebooks show a grade mid-term.</p>",
     "<p>Homework 20% (9/10 and 8/10 = 85%), Tests 50% (80/100), Final 30% not taken yet: (20 × 85 + 50 × 80) ÷ 70 = <strong>81.4%</strong>.</p>",
     "If your teacher counts empty categories as 0, or uses total points instead of weights, the result will differ.",
     ["final-grade", "grade", "semester-grade"],
     [("How do weighted grades work?", "Each category counts for a set share of the grade, so a test category worth 50% moves your grade more than homework worth 20%."),
      ("How much will a missing assignment hurt my grade?", "Enter it as 0 in its category to see the change; the effect depends on the category's weight and how many points it holds.")]),
    ("final-grade", "grades", "Final Exam Grade Calculator", "Final Grade Calculator: What Do I Need on My Final?",
     "Final exam calculator: enter your current grade, the final's weight and the grade you want to see the score you need, or whether it is out of reach.",
     "Enter your current grade, how much the final is worth, and the grade you want.",
     ["Use your grade before the final as \"current grade\".", "Find the final's weight on the syllabus.", "Set the maximum above 100 only if the final has extra credit."],
     "<p>Needed = (target − current × (1 − weight)) ÷ weight, with the weight as a decimal. If the needed score is above the maximum, the target is impossible; "
     "if it is 0 or below, you already have it.</p>",
     "<p>Current 85%, final worth 20%: to finish with 80% you need (80 − 85 × 0.8) ÷ 0.2 = <strong>60%</strong>. To finish with 90% you would need 110%, which is not possible; the best you can finish with is 88%.</p>",
     "Assumes the final is the only thing left and your current grade already reflects everything else.",
     ["weighted-grade", "semester-grade", "grade"],
     [("What score do I need on my final exam?", "Subtract your current grade times the share of the course already done from your target, then divide by the final's share.")]),
    ("semester-grade", "grades", "Semester Grade Calculator", "Semester Grade Calculator: Quarters, Midterm and Final",
     "Semester grade calculator for any split of quarters, midterms and finals: enter your school's weights and grades, and see what you need on the part still to come.",
     "Enter how your school combines quarters, midterms and finals, and the grades you have so far.",
     ["Set the weights your school uses (for example 40/40/20).", "Leave a part blank until you have that grade.", "With one part left, the calculator shows what you need on it."],
     "<p>Semester grade = sum of (weight × grade) ÷ sum of the weights of the parts with grades.</p>",
     "<p>Quarter 1 90%, Quarter 2 80%, exam 70% with a 40/40/20 split: 0.4 × 90 + 0.4 × 80 + 0.2 × 70 = <strong>82%</strong>.</p>",
     "Some schools average letter grades or grade points instead of percents; this uses percents.",
     ["final-grade", "weighted-grade", "high-school-gpa"],
     []),
    ("sat-superscore", "tests", "SAT Superscore Calculator", "SAT Superscore Calculator: Best Sections Across Test Dates",
     "SAT superscore calculator: enter each SAT's Reading and Writing and Math scores to get your superscore and which date each section came from.",
     "Add each SAT you have taken. The superscore combines your best Reading and Writing with your best Math.",
     ["Enter section scores (200 to 800) for each date.", "If you saved official scores on your FunSAT Plan page, they are filled in for you.", "Check each college's superscore policy."],
     "<p>Superscore = highest Reading and Writing score + highest Math score, each from any test date.</p>",
     "<p>March 650 RW / 700 Math and May 700 RW / 680 Math: best RW 700 (May) + best Math 700 (March) = <strong>1400</strong>, 20 points above the best single test (1380).</p>",
     "Not every college superscores; some use the highest single sitting or ask for all scores.",
     ["/score-calculator/", "act-superscore", "/sat-act-conversion/", "/college-match/"],
     [("How do I calculate my SAT superscore?", "Take your highest Reading and Writing score and your highest Math score from any test dates and add them.")]),
    ("act-score", "tests", "ACT Composite Score Calculator", "ACT Composite Score Calculator (Enhanced ACT, Science Optional)",
     "ACT composite calculator for the enhanced ACT (English, Math, Reading; science optional) and the earlier four-section ACT, with ACT's rounding rule.",
     "Enter your section scores. Choose the enhanced ACT (from September 2025) or the earlier four-section test.",
     ["Pick the test version from your score report.", "Enter whole-number section scores from 1 to 36.", "Science is optional on the enhanced ACT and does not change the composite."],
     "<p>Enhanced ACT: composite = (English + Math + Reading) ÷ 3, rounded to the nearest whole number with .5 rounding up. Earlier ACT: the same with Science as a fourth section. "
     "Source: ACT, \"ACT Test Enhancements\".</p>",
     "<p>English 25, Math 26, Reading 26: 77 ÷ 3 = 25.67, rounded to <strong>26</strong>. Earlier ACT 25, 25, 26, 26: 25.5 rounds up to <strong>26</strong>.</p>",
     "To estimate section scores from a practice test's raw scores, use the score calculator.",
     ["act-superscore", "/score-calculator/", "/sat-act-conversion/", "/college-match/"],
     [("Does ACT science count in the composite?", "Not on the enhanced ACT (from September 2025, and April 2025 online tests): the composite uses English, Math and Reading.")]),
    ("act-superscore", "tests", "ACT Superscore Calculator", "ACT Superscore Calculator (Enhanced ACT Rules)",
     "ACT superscore calculator: your best English, Math and Reading from any test dates, averaged and rounded the way ACT does. Science shown separately.",
     "Add each ACT you have taken. The superscore averages your best English, Math and Reading.",
     ["Enter section scores for each test date.", "Scores saved on your FunSAT Plan page fill in automatically.", "Science is listed but not part of the enhanced composite."],
     "<p>Superscore = (best English + best Math + best Reading) ÷ 3, rounded to the nearest whole number (.5 up), following ACT's guidance for the enhanced test.</p>",
     "<p>February 24/28/25 and April 27/26/24: best 27 + 28 + 25 = 80 ÷ 3 = 26.67, so the superscore is <strong>27</strong>; each single test was 26.</p>",
     "Colleges set their own superscore rules, and a superscore that mixes older four-section composites can differ.",
     ["act-score", "sat-superscore", "/college-match/"],
     [("How is the ACT superscore calculated?", "ACT averages your best English, Math and Reading scores from any test dates and rounds to the nearest whole number.")]),
]
EXISTING = [  # tools that already exist elsewhere on the site
    ("tests", "/score-calculator/", "SAT and ACT score calculator", "Estimate section and total scores from raw practice-test results."),
    ("tests", "/sat-act-conversion/", "SAT to ACT conversion", "The official ACT and College Board concordance table."),
    ("college", "/college-match/", "College matcher", "Colleges whose middle-50% scores fit yours, with cost and setting filters."),
    ("college", "/college-costs/", "College costs by state", "Tuition and net price from federal data."),
    ("college", "/colleges/", "College profiles", "Admissions, cost and outcomes for 500 colleges, year by year."),
]
CALC_BY_ID = {c[0]: c for c in CALCS}
CAT_LABEL = dict(CATS)
ASSETS = '<link rel="stylesheet" href="/calculators.css">\n<script defer src="/academic-calc.js"></script>\n<script defer src="/calculators.js"></script>\n'


def link_for(ref):
    if ref.startswith("/"):
        for cat, path, name, desc in EXISTING:
            if path == ref:
                return path, name
        return ref, ref.strip("/").replace("-", " ").capitalize()
    c = CALC_BY_ID[ref]
    return f"{HUB}{ref}/", c[2]


def calc_page(c):
    cid, cat, h1, title, desc, lead, how, method, example, limits, related, faqs = c
    path = f"{HUB}{cid}/"
    rel = "".join(f'<li><a href="{p}">{e(n)}</a></li>' for p, n in (link_for(r) for r in related))
    faq_html = "".join(f"<h3>{e(q)}</h3><p>{e(a)}</p>" for q, a in faqs)
    body = (f'<nav class="gnav"><a href="/">&larr; FunSAT</a><a href="{HUB}">All calculators</a></nav>'
            f'<p class="gkicker">{e(CAT_LABEL[cat])}</p><h1>{e(h1)}</h1>'
            f'<div class="glead">{e(lead)}</div>'
            f'<div class="calc" data-calc="{cid}"><noscript><p>This calculator needs JavaScript. The formula below shows how to work it out by hand.</p></noscript></div>'
            f'<h2>How to use it</h2><ul>' + "".join(f"<li>{e(t)}</li>" for t in how) + "</ul>"
            f'<h2>How it is calculated</h2>{method}'
            f'<h2>Worked example</h2>{example}'
            f'<h2>Limits</h2><p>{e(limits)}</p>'
            + (f"<h2>Questions</h2>{faq_html}" if faqs else "") +
            f'<h2>Related tools</h2><ul>{rel}</ul>'
            f'<p class="muted small">Everything runs in your browser; FunSAT does not receive your grades. Formulas are tested against hand-worked '
            f'examples. Version {e(TODAY)}.</p>')
    schema = [breadcrumbs([("Home", "/"), ("Calculators", HUB), (h1, path)]),
              {"@type": "WebApplication", "name": h1, "url": ORIGIN + path, "applicationCategory": "EducationalApplication",
               "operatingSystem": "Any (runs in the browser)", "isAccessibleForFree": True, "description": desc,
               "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}}]
    if faqs:
        schema.append(faq_schema(faqs))
    return path, page(path=path, title=title, description=desc, body=body, schema=schema, extra_head=ASSETS)


def hub_page():
    groups = []
    for cat, label in CATS:
        items = [(f"{HUB}{c[0]}/", c[2], c[5]) for c in CALCS if c[1] == cat] + [(p, n, d) for k, p, n, d in EXISTING if k == cat]
        groups.append(f'<section class="chub-group" data-cat="{cat}"><h2>{e(label)}</h2><ul class="chub-list">' + "".join(
            f'<li data-name="{e((n + " " + d).lower())}"><a href="{p}">{e(n)}</a><p>{e(d)}</p></li>' for p, n, d in items) + "</ul></section>")
    filters = '<button type="button" data-filter="all" aria-pressed="true">All</button>' + "".join(
        f'<button type="button" data-filter="{k}" aria-pressed="false">{e(v)}</button>' for k, v in CATS)
    body = (f'<nav class="gnav"><a href="/">&larr; FunSAT</a><a href="/free-test-prep/">Free test prep</a></nav>'
            f'<p class="gkicker">Free tools</p><h1>Academic Calculators</h1>'
            f'<div class="glead">GPA, grade, SAT and ACT calculators that run in your browser with no account. Results can go straight into college matching.</div>'
            f'<div class="chub-search"><label class="sr" for="chubQ">Search calculators</label><input id="chubQ" type="search" placeholder="Search: weighted GPA, final exam, superscore..." autocomplete="off">'
            f'<div class="chub-filters" role="group" aria-label="Filter by type">{filters}</div></div>'
            f'<p class="chub-recent" id="chubRecent" hidden></p>' + "".join(groups) +
            f'<p id="chubNone" hidden>No calculator matches that search.</p>'
            f'<h2>Accurate by design</h2><p>Every calculator uses one shared, tested set of formulas, and each page shows its formula and a worked example. '
            f'Grading policies differ between schools, so scales, weights and retake rules can be changed to match yours.</p>')
    schema = [breadcrumbs([("Home", "/"), ("Calculators", HUB)]),
              {"@type": "CollectionPage", "name": "Academic Calculators", "url": ORIGIN + HUB, "dateModified": TODAY}]
    script = ('<script defer src="/calculators-hub.js"></script>\n')
    return HUB, page(path=HUB, title="Free GPA, Grade, SAT and ACT Calculators | FunSAT",
                     description="Free academic calculators: GPA (weighted, high school, college, cumulative), grade and final exam, SAT and ACT superscore. No sign-up.",
                     body=body, schema=schema, extra_head='<link rel="stylesheet" href="/calculators.css">\n' + script)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="public")
    out = (ROOT / ap.parse_args().out).resolve()
    for c in CALCS:
        path, html = calc_page(c)
        write(out / path.strip("/") / "index.html", html)
    path, html = hub_page()
    write(out / path.strip("/") / "index.html", html)
    print(f"  calculators: {len(CALCS)} + hub")


if __name__ == "__main__":
    main()
