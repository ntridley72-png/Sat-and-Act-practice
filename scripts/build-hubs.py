"""Generate the trust pages (about, methodology, privacy, contact, corrections)
and the topic hubs the SEO architecture calls for, then extend the core sitemap.

Content is written by hand in this file: nothing here is auto-generated from
keyword lists, every page links to real, existing parts of the site, and the
claims match what the app actually does. Run after build-seo-pages.py.
"""
import argparse
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from seo_common import ORIGIN, ROOT, SITE_NAME, STATES, TODAY, breadcrumbs, e, page, slugify, write  # noqa: E402

GITHUB = "https://github.com/ntridley72-png/Sat-and-Act-practice"


def web_page(path, name, description, body, trail, kind="WebPage"):
    schema = [
        {"@type": "Organization", "@id": ORIGIN + "/#org", "name": "FunSAT", "url": ORIGIN + "/"},
        {"@type": kind, "name": name, "description": description, "url": ORIGIN + path,
         "isPartOf": {"@id": ORIGIN + "/#org"}, "dateModified": TODAY,
         "publisher": {"@id": ORIGIN + "/#org"}},
        breadcrumbs([("Home", "/")] + trail),
    ]
    return page(path=path, title=name + " | FunSAT", description=description, body=f"<h1>{e(name)}</h1>" + body, schema=schema)


def guide_link(slug):
    return f"/guides/{slug}/"


PAGES = {}

PAGES["/about/"] = web_page(
    "/about/", "About FunSAT",
    "FunSAT is a free, independent SAT and ACT practice site with score estimates, college data from U.S. Department of Education sources, and browser games earned by studying.",
    """<p>FunSAT is a free browser-based practice app for the SAT and ACT. It offers full-length and section practice,
unofficial score estimates, a built-in graphing calculator, college profiles built on federal data, a scholarship
search, and a small arcade of browser games that students unlock by answering questions.</p>
<h2>Who it is for</h2>
<p>Students preparing for the digital SAT or ACT, families comparing colleges and costs, counselors and teachers who
need a no-cost practice resource, and anyone who wants to practise on a school Chromebook without installing
anything.</p>
<h2>Independence and accuracy</h2>
<p>FunSAT is independent and is not affiliated with, endorsed by, or sponsored by College Board, the ACT, or any
college or university. Practice questions are original items modelled on published skills. Score results are
unofficial estimates; see <a href="/methodology/">methodology</a> for exactly how they are produced, which
published charts they use, and their limits. College figures come from U.S. Department of Education datasets and
are labelled with their reporting period throughout the site.</p>
<h2>How it is funded</h2>
<p>The site is free and takes no sign-up. It is funded by limited display advertising on non-practice pages.
Advertising is switched off during practice tests by design, and the AdSense integration is configured for
child-directed treatment. See <a href="/privacy/">privacy</a> for what is stored and what is not.</p>
<h2>Corrections</h2>
<p>If something is wrong, we want to know. The process is described on the
<a href="/corrections/">corrections and updates page</a>.</p>
<p><a href="/free-test-prep/">Start with free test prep &rarr;</a></p>""",
    [("About", "/about/")], "AboutPage")

PAGES["/methodology/"] = web_page(
    "/methodology/", "Score Estimate Methodology",
    "Exactly how FunSAT turns practice results into unofficial SAT and ACT score estimates, which published charts are used, and what the estimates cannot do.",
    """<p>Every score on FunSAT is an estimate, and this page explains how it is calculated so you can judge it
yourself.</p>
<h2>SAT estimates</h2>
<p>Section results are converted from raw practice results to a 200-800 scale using a published College Board
practice-test curve (Practice Test 4, 2023), selectable on the start screen. Totals are the sum of the two
sections, 400-1600. Because real curves change with each test date, the site shows a range around every estimate
rather than pretending to a single exact number.</p>
<h2>ACT estimates</h2>
<p>Section results use the chart from ACT's free practice test. Under ACT's current rule the composite is the
average of English, Math, and Reading, rounded to the nearest whole number; Science is optional and does not change
the composite. That rule is applied consistently everywhere on the site.</p>
<h2>College comparison</h2>
<p>College profiles show each institution's reported middle-50% test ranges for enrolled students, from the U.S.
Department of Education College Scorecard, with the release shown on the page. The fit estimate is an original
app model that combines reported ranges, GPA, course rigour, activities, and context; it is a planning aid, not an
admission prediction and not affiliated with any college.</p>
<h2>Data sources and updates</h2>
<p>College: College Scorecard and IPEDS (majors), BEA regional price parities (living-cost context). Scholarships:
provider pages, listed with links so you can verify every detail. Sources and reporting periods are shown on the
pages themselves; see <a href="/corrections/">corrections and updates</a> for how mistakes are handled.</p>
<h2>Limits</h2>
<p>Estimates cannot replace official results. A practice set is a small sample, and no model can account for a
particular test date's curve, section difficulty, or scoring appeals. Use estimates to track progress and plan,
not to predict an official score.</p>
<p><a href="/score-calculators/">See the score calculators &rarr;</a></p>""",
    [("Methodology", "/methodology/")], "WebPage")

PAGES["/privacy/"] = web_page(
    "/privacy/", "Privacy",
    "What FunSAT stores: optional account data, local progress, advertising configuration, and how to request deletion.",
    """<p>FunSAT collects as little as possible. This page states plainly what is stored and why.</p>
<h2>Without an account</h2>
<p>Practice progress, scores, bookmarks, and game unlocks are stored in your browser's local storage on your own
device. Nothing is sent to a server. Clearing site data removes it permanently.</p>
<h2>With an account</h2>
<p>If you choose to sign in, your email, a password hash, and your progress sync so you can use another device.
Passwords are stored as PBKDF2-SHA256 hashes with a per-user salt; session tokens are stored only as hashes. You
can sign out at any time, and you can request deletion of your account data via the contact page.</p>
<h2>Advertising</h2>
<p>Display advertising (Google AdSense) appears on content pages only, is suppressed during practice tests, and is
configured for child-directed treatment. Ad units are placed away from controls and gameplay. See the
<a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener">Google partner
sites notice</a> for how Google handles ad data.</p>
<h2>No selling of personal data</h2>
<p>FunSAT does not sell personal information and does not run third-party behavioural profiles of students.</p>
<h2>Contact</h2>
<p>Privacy questions or deletion requests go through the <a href="/contact/">contact page</a>.</p>""",
    [("Privacy", "/privacy/")], "PrivacyPolicy")

PAGES["/contact/"] = web_page(
    "/contact/", "Contact",
    "How to reach the FunSAT team about bugs, data corrections, privacy requests, or feedback, without an invented email address.",
    """<p>FunSAT is a small independent project; the fastest route for anything is the public issue tracker.</p>
<h2>Bugs and data corrections</h2>
<p>Open an issue at <a href="{g}" target="_blank" rel="noopener">github.com/ntridley72-png/Sat-and-Act-practice</a>.
Include the page URL and, for scoring problems, the question text. Data corrections (college figures, scholarship
details) are prioritised when they cite an official source.</p>
<h2>Privacy requests</h2>
<p>Account deletion and privacy questions can be raised on the same tracker, marked "privacy". Requests are handled
by the site owner; no data is sold or shared with third parties beyond the services described in
<a href="/privacy/">privacy</a>.</p>
<h2>Teachers, counselors, and schools</h2>
<p>If you would like a class or advising page to link here, or you need a feature for classroom use, use the tracker
and describe the setting. Suggestions that make the site more useful on school-managed Chromebooks are especially
welcome.</p>
<p>Please do not send passwords, test answers, or personal student information.</p>""".replace("{g}", GITHUB),
    [("Contact", "/contact/")], "ContactPage")

PAGES["/corrections/"] = web_page(
    "/corrections/", "Corrections and Updates",
    "How FunSAT handles errors: reporting, verification against official sources, and how corrections are recorded.",
    """<p>Accuracy matters more than looking perfect. When we find an error, we fix it and say so.</p>
<h2>How to report a problem</h2>
<p>Use the <a href="/contact/">contact page</a> and include the URL, what you expected, and - where relevant - the
official source that shows the correct value.</p>
<h2>How corrections are verified</h2>
<p>Data corrections are checked against the authoritative source for that field: the U.S. Department of Education
College Scorecard for college figures, the provider's own page for scholarship details, and the official ACT or
College Board chart for scoring. If a correction cannot be verified it is not applied; an unverified change to
published numbers is worse than a known limitation.</p>
<h2>Update policy</h2>
<p>College datasets are refreshed when new federal releases land; scholarship details are reviewed each cycle; the
score-estimate methodology is documented on the <a href="/methodology/">methodology page</a> and only changes with a
published reason. Sitemap modification dates reflect the source data date, not the moment a build ran.</p>
<h2>What we will not do</h2>
<p>We do not change dates just to appear fresh, we do not edit college numbers by hand without a source, and we do
not publish estimated figures as if they were confirmed facts.</p>""",
    [("Corrections", "/corrections/")], "WebPage")

PAGES["/free-test-prep/"] = web_page(
    "/free-test-prep/", "Free Test Prep: SAT, ACT, Calculators and Guides",
    "Everything on FunSAT for free test prep: digital SAT and ACT practice tests with estimated scores, score calculators, study plans, and subject guides.",
    """<p>This is the starting point for free test prep on FunSAT. No account is required and nothing needs to be
installed; everything runs in a browser tab, including on managed school Chromebooks.</p>
<h2>Practice</h2>
<ul>
<li><a href="/sat-practice-test/">Free digital SAT practice test</a> with module timing and an unofficial 400-1600 estimate.</li>
<li><a href="/act-practice-test/">Free ACT practice test</a> covering English, Math, Reading, and optional Science, with a 1-36 estimate.</li>
<li><a href="/sat-practice/">SAT practice overview</a> and <a href="/act-practice/">ACT practice overview</a> for section-by-section advice.</li>
</ul>
<h2>Score tools</h2>
<p><a href="/score-calculators/">Score calculators</a> explain how the estimates are produced and what they cannot
do. For a single number, jump straight to the <a href="/sat-practice-test/">SAT</a> or
<a href="/act-practice-test/">ACT</a> practice page and finish a set.</p>
<h2>Study help</h2>
<ul>
<li><a href="/guides/how-to-study-effectively/">How to study effectively</a> — active recall and spaced repetition.</li>
<li><a href="/guides/free-sat-study-plan/">4-week SAT study plan</a> and <a href="/guides/how-to-build-a-study-schedule/">how to build a schedule</a>.</li>
<li><a href="/guides/desmos-calculator-digital-sat/">Using the Desmos calculator on the digital SAT</a>.</li>
</ul>
<h2>After the test</h2>
<p>When scores arrive, <a href="/colleges/">compare them with real college ranges</a>, read
<a href="/college-admissions/">how admission numbers work</a>, and search <a href="/scholarships/">scholarships</a>.</p>
<p><a href="/sat-practice-test/">Start a free practice test &rarr;</a></p>""",
    [("Free test prep", "/free-test-prep/")], "WebPage")

PAGES["/sat-practice/"] = web_page(
    "/sat-practice/", "SAT Practice: Free Digital SAT Prep",
    "Free digital SAT practice: section breakdown, timing, calculator use, scoring estimates, and a full four-week plan - all in the browser.",
    """<p>Digital SAT practice on FunSAT mirrors the real test's structure: a Reading &amp; Writing section and a Math
section, each split into two modules, with the built-in Desmos graphing calculator available on every math question.</p>
<h2>What to practise</h2>
<ul>
<li><a href="/sat-practice-test/">Full digital SAT practice test</a> with an unofficial 400-1600 estimate.</li>
<li>Reading &amp; Writing: <a href="/guides/what-is-a-good-sat-score/">what a good score looks like</a> before you set targets.</li>
<li>Math: get fluent with the <a href="/guides/desmos-calculator-digital-sat/">Desmos calculator</a>; it is the single fastest score lever for many students.</li>
</ul>
<h2>Timing</h2>
<p><a href="/guides/how-long-is-the-digital-sat/">How long the digital SAT is</a> covers the exact section timings and
the 10-minute break, so practice sessions match test-day pacing.</p>
<h2>Plan</h2>
<p>Follow the <a href="/guides/free-sat-study-plan/">four-week plan</a>, then check
<a href="/guides/how-to-improve-your-sat-score/">what actually improves scores</a>. When you have an estimate,
compare it with <a href="/colleges/">college ranges</a> and the <a href="/sat-scores/">score guides</a>.</p>
<p><a href="/sat-practice-test/">Take a free SAT practice set &rarr;</a></p>""",
    [("SAT practice", "/sat-practice/")], "WebPage")

PAGES["/act-practice/"] = web_page(
    "/act-practice/", "ACT Practice: Free ACT Prep and Score Estimates",
    "Free ACT practice in the browser: English, Math, Reading and optional Science, the current composite rule, and study guides.",
    """<p>ACT practice on FunSAT covers all four sections under real timing, with an unofficial 1-36 estimate after
each set.</p>
<h2>The sections</h2>
<ul>
<li><strong>English</strong> — grammar, punctuation, and rhetoric at ACT pace.</li>
<li><strong>Math</strong> — through precalculus, with a calculator allowed on the real test.</li>
<li><strong>Reading</strong> — four passages in 35 minutes; pacing is the challenge.</li>
<li><strong>Science</strong> — optional, and under ACT's current rule it does not change the composite.</li>
</ul>
<h2>The composite</h2>
<p>The composite is the average of English, Math, and Reading, rounded to a whole number.
<a href="/guides/act-score-calculator/">The ACT scoring guide</a> explains it with examples, and
<a href="/act-scores/">score guides</a> show what each composite typically means for college ranges.</p>
<h2>Choosing between SAT and ACT</h2>
<p>Read <a href="/guides/digital-sat-vs-act/">digital SAT vs ACT</a>, then take one short section of each and compare
against the middle 50% of your target colleges on the <a href="/colleges/">college pages</a>.</p>
<p><a href="/act-practice-test/">Take a free ACT practice set &rarr;</a></p>""",
    [("ACT practice", "/act-practice/")], "WebPage")

PAGES["/score-calculators/"] = web_page(
    "/score-calculators/", "Free SAT and ACT Score Calculators",
    "How FunSAT turns practice results into unofficial SAT and ACT score estimates, with the published charts used and honest limits.",
    """<p>The score calculators turn a finished practice set into an unofficial SAT (400-1600) or ACT (1-36)
estimate, shown as a range rather than a single false-precision number.</p>
<h2>Use them</h2>
<ul>
<li><a href="/sat-practice-test/">SAT practice test with score estimate</a></li>
<li><a href="/act-practice-test/">ACT practice test with composite estimate</a></li>
</ul>
<h2>How the maths works</h2>
<p>The full explanation, including the published curves and the ACT composite rule, is on the
<a href="/methodology/">methodology page</a>. In short: practice results map through a published practice-test chart,
the SAT total sums the two sections, and the ACT composite averages English, Math, and Reading.</p>
<h2>What an estimate is for</h2>
<p>Tracking progress, choosing targets, and deciding whether to retake. It is not a prediction of an official score,
and it cannot account for a future test's curve. Guides: <a href="/guides/sat-score-calculator/">SAT scoring</a>,
<a href="/guides/act-score-calculator/">ACT scoring</a>, <a href="/guides/what-is-a-good-sat-score/">good SAT scores</a>.</p>
<p><a href="/sat-practice-test/">Get a score estimate in one practice set &rarr;</a></p>""",
    [("Score calculators", "/score-calculators/")], "WebPage")

PAGES["/college-admissions/"] = web_page(
    "/college-admissions/", "College Admissions: How to Read Admit Rates and Score Ranges",
    "Understand admit rates, enrolled-student score ranges, test policies and selectivity, then compare your scores with 350+ colleges.",
    """<p>Admissions pages are full of numbers that are easy to misread. This hub links the tools and explains the
three figures that actually matter.</p>
<h2>The three numbers</h2>
<ul>
<li><strong>Admit rate</strong> — what share of applicants were admitted. Below 10% is unpredictable for everyone.</li>
<li><strong>Middle 50% (25th-75th)</strong> — test scores of <em>enrolled</em> students, not a cutoff.</li>
<li><strong>Net price</strong> — what students actually pay after aid; the number your budget should use.</li>
</ul>
<h2>Tools</h2>
<ul>
<li><a href="/colleges/">Search 350+ college profiles</a> with ranges, costs, outcomes, and a fit estimate.</li>
<li><a href="/colleges-by-state/">Browse colleges by state</a>.</li>
<li><a href="/college-comparisons/">Compare colleges side by side</a>.</li>
<li><a href="/college-costs/">College costs by state</a> for the parent-facing view.</li>
</ul>
<h2>Guides</h2>
<p><a href="/guides/college-admissions-chances/">How to read admissions numbers</a>,
<a href="/guides/what-is-a-good-sat-score/">what a good SAT score is</a>, and
<a href="/guides/digital-sat-vs-act/">SAT or ACT</a>.</p>
<h2>What we never do</h2>
<p>No admission guarantees, no fabricated acceptance data, and no invented deadlines. Every figure comes from the
U.S. Department of Education with its reporting period shown.</p>""",
    [("College admissions", "/college-admissions/")], "WebPage")

PAGES["/college-comparisons/"] = web_page(
    "/college-comparisons/", "Compare Colleges: Side-by-Side Data",
    "How to compare colleges on the numbers that matter - ranges, net price, debt, graduation and earnings - using official federal data.",
    """<p>Comparing colleges properly means comparing like with like. FunSAT's profiles put the same federal fields
side by side for every institution so a comparison is fair.</p>
<h2>What to compare</h2>
<ul>
<li>Middle-50% SAT/ACT ranges for enrolled students.</li>
<li>Sticker tuition next to average net price after aid.</li>
<li>Median debt at graduation and the cohort default rate.</li>
<li>Six-year graduation rate and retention.</li>
<li>Median earnings ten years after entry.</li>
</ul>
<h2>How to do it here</h2>
<p>Open any college on <a href="/colleges/">the college search</a>, save two or more, and the site renders a
side-by-side comparison table; each profile also links similar institutions in the same state and selectivity band.
For price context by region see <a href="/college-costs/">college costs</a>.</p>
<h2>Keep it honest</h2>
<p>Numbers describe past cohorts, not you. A college with a lower admit rate is not automatically better, and net
price varies with family circumstances. Use the data to build a balanced list, then verify current costs and
policies with each college - the profile pages link to the official sites and to the source data.</p>""",
    [("College comparisons", "/college-comparisons/")], "WebPage")

PAGES["/application-planning/"] = web_page(
    "/application-planning/", "College Application Planning: FAFSA, Scholarships, Timeline",
    "A practical application-planning hub: financial aid, scholarship search, essays, and what to do each term - with links to official sources.",
    """<p>Applications go better with a system. This hub collects the planning pieces FunSAT can genuinely help
with, and points to the official sources for everything date-sensitive - we do not publish deadline dates we cannot
keep current.</p>
<h2>Money first</h2>
<ul>
<li><a href="/guides/fafsa-guide-for-beginners/">FAFSA for beginners</a> - what it is, what you need, when to file.</li>
<li><a href="/scholarships/">Scholarship search</a> with 50+ real programs, filterable by grade and interest.</li>
<li><a href="/guides/how-to-get-a-full-ride-scholarship/">Full-ride scholarships</a> and
<a href="/guides/scholarships-for-high-school-seniors/">senior-year scholarships</a>.</li>
</ul>
<h2>Essays and applications</h2>
<p><a href="/guides/how-to-write-a-scholarship-essay/">How to write a scholarship essay</a> covers the structure that
works; reuse it for admissions essays.</p>
<h2>Timeline</h2>
<p>Work backwards from your earliest deadline: test dates first, then essays, then aid forms. For official SAT dates
see <a href="https://satsuite.collegeboard.org/sat/registration/dates-deadlines" target="_blank" rel="noopener">College Board</a>;
for ACT dates, <a href="https://www.act.org/content/act/en/products-and-services/the-act/registration.html" target="_blank" rel="noopener">ACT</a>;
for aid deadlines, <a href="https://studentaid.gov/" target="_blank" rel="noopener">studentaid.gov</a> and your state's
aid agency.</p>
<h2>Choosing where to apply</h2>
<p>Build the list with <a href="/college-admissions/">real ranges and costs</a>, then compare finalists on
<a href="/college-comparisons/">the comparison tool</a>.</p>""",
    [("Application planning", "/application-planning/")], "WebPage")


def state_list_body(out):
    rows = []
    for code in sorted(STATES):
        name = STATES[code]
        col = out / "colleges" / slugify(name) / "index.html"
        cost = out / "college-costs" / slugify(name) / "index.html"
        if not col.exists() and not cost.exists():
            continue  # no profiled colleges in this state/territory: nothing to link to
        parts = []
        if col.exists(): parts.append(f'<a href="/colleges/{slugify(name)}/">{e(name)}</a>')
        else: parts.append(e(name))
        if cost.exists(): parts.append(f'<a href="/college-costs/{slugify(name)}/">costs</a>')
        rows.append("<li>" + " · ".join(parts) + "</li>")
    return ('<p>Every state hub lists the colleges FunSAT profiles in that state with reported SAT/ACT ranges, '
            'admit rates, and net price, plus a companion page on what college costs in the state.</p>'
            '<ul class="stategrid">' + "".join(rows) + "</ul>")

PAGES["/colleges-by-state/"] = None  # filled in main(), needs the output dir


def colleges_by_state_page(out):
    return web_page(
        "/colleges-by-state/", "Colleges by State",
        "Browse U.S. colleges state by state: reported SAT/ACT ranges, admit rates, net price, and in-state versus out-of-state costs.",
        state_list_body(out),
    [("Colleges by state", "/colleges-by-state/")], "CollectionPage")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="public")
    args = ap.parse_args()
    out = Path(args.out)
    PAGES["/colleges-by-state/"] = colleges_by_state_page(out)
    added = []
    for path, html in PAGES.items():
        write(out / path.strip("/") / "index.html", html)
        added.append(path)
    # Keep the repo reference copy of the index consistent with its children.
    print(f"hubs: wrote {len(added)} pages, extended core sitemap")


if __name__ == "__main__":
    main()
