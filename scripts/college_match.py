"""The college matcher page (/college-match/): the questionnaire and results run in the browser from college-matcher.js
and college-match-engine.js over college-data.js and college-match-data.js (loaded after the page appears). The page text
around the tool (score tables, FAQs) is generated here from the same data so it is crawlable.
"""


import json

from seo_common import SITE_NAME, STATES, breadcrumbs, e, faq_schema, page

def compact(colleges):
    """Only the fields the matcher reads, keyed short so the page stays small."""
    rows = []
    for c in colleges:
        if not c.get("adm") or not c.get("enr"):
            continue
        bands = c.get("bands") or []
        bd = [(b[1] if len(b) > 2 and b[2] == "ok" else None) for b in bands][:5]
        rows.append({
            "n": c["n"], "sl": c["slug"], "st": c["st"], "sn": STATES.get(c["st"], c["st"]),
            "ct": c.get("ctrl") or "", "lc": c.get("loc") or "", "en": int(c["enr"]),
            "ad": round(c["adm"], 1),
            "s1": c.get("sr25"), "s2": c.get("sr75"), "a1": c.get("ar25"), "a2": c.get("ar75"),
            "np": c.get("np"), "gr": c.get("gr"), "er": c.get("ern"), "hb": 1 if c.get("hbcu") else 0,
            "sf": c.get("sfr"), "dv": c.get("div"), "fg": c.get("fg"), "tp": c.get("test"),
            "rt": c.get("ret"), "db": c.get("debt"), "rg": REGION_OF.get(c["st"], "Territories"),
            "bd": bd if any(x is not None for x in bd) else None,
            "mj": {m[0]: m[1] for m in (c.get("maj") or [])},
        })
    rows.sort(key=lambda r: r["n"])
    return rows


REGIONS = {
    "Northeast": "CT ME MA NH RI VT NJ NY PA",
    "Midwest": "IL IN MI OH WI IA KS MN MO NE ND SD",
    "South": "DE FL GA MD NC SC VA DC WV AL KY MS TN AR LA OK TX",
    "West": "AZ CO ID MT NV NM UT WY AK CA HI OR WA",
}
REGION_OF = {st: name for name, sts in REGIONS.items() for st in sts.split()}
_ADJ_SRC = """AL:FL GA MS TN|AZ:CA CO NV NM UT|AR:LA MO MS OK TN TX|CA:AZ NV OR|CO:AZ KS NE NM OK UT WY|CT:MA NY RI|DE:MD NJ PA|DC:MD VA|FL:AL GA|GA:AL FL NC SC TN|ID:MT NV OR UT WA WY|IL:IN IA KY MO WI|IN:IL KY MI OH|IA:IL MN MO NE SD WI|KS:CO MO NE OK|KY:IL IN MO OH TN VA WV|LA:AR MS TX|ME:NH|MD:DE PA VA WV DC|MA:CT NH NY RI VT|MI:IN OH WI|MN:IA ND SD WI|MS:AL AR LA TN|MO:AR IL IA KS KY NE OK TN|MT:ID ND SD WY|NE:CO IA KS MO SD WY|NV:AZ CA ID OR UT|NH:ME MA VT|NJ:DE NY PA|NM:AZ CO OK TX UT|NY:CT MA NJ PA VT|NC:GA SC TN VA|ND:MN MT SD|OH:IN KY MI PA WV|OK:AR CO KS MO NM TX|OR:CA ID NV WA|PA:DE MD NJ NY OH WV|RI:CT MA|SC:GA NC|SD:IA MN MT NE ND WY|TN:AL AR GA KY MS MO NC VA|TX:AR LA NM OK|UT:AZ CO ID NV NM WY|VT:MA NH NY|VA:DC KY MD NC TN WV|WA:ID OR|WV:KY MD OH PA VA|WI:IL IA MI MN|WY:CO ID MT NE SD UT"""
ADJ = {}
for _row in _ADJ_SRC.split("|"):
    _a, _b = _row.split(":")
    for _n in _b.split():
        ADJ.setdefault(_a, set()).add(_n)
        ADJ.setdefault(_n, set()).add(_a)
ADJ = {k: sorted(v) for k, v in sorted(ADJ.items())}

MAJORS = ["Business & marketing", "Biological & biomedical sciences", "Social sciences", "Psychology",
          "Health professions", "Engineering", "Computer & information sciences", "Visual & performing arts",
          "Communication", "Education", "Physical sciences", "Mathematics & statistics",
          "English language & literature", "Agriculture", "Parks, recreation & fitness"]

PRIORITY = '<option value="">Not important</option><option value="some">Somewhat important</option><option value="high">Very important</option>'


def _links(rows, n=6):
    return ", ".join(f'<a href="/colleges/{r["sl"]}/">{e(r["n"])}</a>' for r in rows[:n])


def seo_sections(rows):
    """Data-derived text around the tool: crawlable lists that answer the searches people make."""
    out = []
    # Colleges for common SAT scores, from the same middle-50% ranges the tool uses.
    sat_rows = []
    for score in (1000, 1100, 1200, 1300, 1400, 1500):
        fits = sorted((r for r in rows if r["s1"] and r["s2"] and r["s1"] <= score <= r["s2"]), key=lambda r: -r["en"])
        above = sum(1 for r in rows if r["s2"] and score >= r["s2"])
        sat_rows.append(
            f'<tr><td><a href="/sat-scores/{score}/">{score} SAT</a></td><td>{len(fits)}</td><td>{above}</td>'
            f'<td>{_links(fits, 4) or "&mdash;"}</td></tr>')
    out.append(
        '<h2>Colleges that fit common SAT scores</h2>'
        '<p>These counts use the same middle-50% score ranges as the matcher above. '
        '&ldquo;In range&rdquo; means the score falls between a college&rsquo;s 25th and 75th percentile; '
        '&ldquo;above range&rdquo; means it is over the 75th percentile.</p>'
        '<table class="gtable"><thead><tr><th scope="col">Score</th><th scope="col">Colleges in range</th>'
        '<th scope="col">Colleges above range</th><th scope="col">Examples in range</th></tr></thead><tbody>'
        + "".join(sat_rows) + '</tbody></table>')
    cheap = sorted((r for r in rows if r["np"]), key=lambda r: r["np"])
    grad = sorted((r for r in rows if r["gr"]), key=lambda r: -r["gr"])
    earn = sorted((r for r in rows if r["er"]), key=lambda r: -r["er"])
    small = sorted((r for r in rows if r["sf"]), key=lambda r: r["sf"])
    out.append(
        f'<h2>Colleges that stand out on what students ask about most</h2>'
        f'<p>Among the {len(rows)} colleges we profile (federal College Scorecard data):</p><ul>'
        f'<li><strong>Lowest average net price:</strong> {_links(cheap, 6)}.</li>'
        f'<li><strong>Highest six-year graduation rates:</strong> {_links(grad, 6)}.</li>'
        f'<li><strong>Highest median earnings ten years after entry:</strong> {_links(earn, 6)}.</li>'
        f'<li><strong>Smallest student-to-faculty ratios:</strong> {_links(small, 6)}.</li></ul>')
    settings = []
    for loc, label in (("city", "city campuses"), ("suburb", "suburban campuses"), ("town", "college-town campuses"), ("rural", "rural campuses")):
        sel = sorted((r for r in rows if r["lc"] == loc), key=lambda r: -r["en"])
        if sel:
            settings.append(f'<li><strong>{label.capitalize()}:</strong> {len(sel)} colleges, including {_links(sel, 4)}.</li>')
    out.append('<h2>Colleges by setting and size</h2><ul>' + "".join(settings) + '</ul>'
               '<p>Use the setting, size and type filters above to narrow any of these lists to your own '
               'preferences, then compare the finalists on the <a href="/college-comparisons/">comparison page</a>.</p>')
    region_items = []
    for reg in list(REGIONS) + ["Territories"]:
        sel_ = sorted((r for r in rows if r["rg"] == reg), key=lambda r: -r["en"])
        if sel_:
            region_items.append(f'<li><strong>{reg}:</strong> {len(sel_)} colleges, including {_links(sel_, 4)}.</li>')
    out.append('<h2>Colleges by region and distance from home</h2><ul>' + "".join(region_items) + '</ul>'
               '<p>Set your home state and choose to stay in state, stay near home (your state and the states that border it) or '
               'search a whole region. Staying in state often lowers the price at public colleges.</p>')
    ratio_rows = sorted((r for r in rows if r["sf"]), key=lambda r: r["sf"])
    if ratio_rows:
        mid = ratio_rows[len(ratio_rows) // 2]["sf"]
        out.append(
            f'<h2>What is a good student-to-faculty ratio?</h2><p>The student-to-faculty ratio is the number of students for each '
            f'faculty member. Across the {len(ratio_rows)} colleges we profile the middle value is about {mid:.0f} to 1. Ratios under '
            f'12 to 1 usually mean smaller classes and more contact with professors, while ratios above 20 to 1 are common at large '
            f'public universities. It is an average for the whole college, so check class sizes in your own major. Use the ratio limit '
            f'above to keep only colleges at or under the ratio you want, for example '
            f'{_links([r for r in ratio_rows if r["sf"] <= 10], 4) or "the smallest on the list"}.</p>')
    out.append(
        '<h2>How to choose the right college, beyond a score</h2>'
        '<p>A score places a college on a reach, match or likely list. These questions decide whether a college is '
        'right for you.</p><ol>'
        '<li><strong>Can your family afford it?</strong> Set your household income band above. Net price falls sharply with income '
        'at many colleges, and the income band changes the ranking.</li>'
        '<li><strong>Will you finish?</strong> Graduation and first-year retention rates show how many students stay and complete.</li>'
        '<li><strong>Does it offer your major?</strong> Pick a major area above. A college where that field is a top program usually has more courses, faculty and advising in it.</li>'
        '<li><strong>Where do you learn best?</strong> Class size, campus size and setting shape daily life more than rankings do.</li>'
        '<li><strong>Do you feel supported?</strong> Look at first-generation support, diversity and campus safety. See '
        '<a href="/guides/is-a-college-campus-safe/">how to check campus safety</a>.</li></ol>')
    return "".join(out)


def college_match_page(colleges):
    rows = compact(colleges)
    states = sorted({(r["st"], r["sn"]) for r in rows}, key=lambda x: x[1])
    state_opts = '<option value="">Anywhere</option>' + "".join(
        f'<option value="{e(s)}">{e(n)}</option>' for s, n in states)
    state_opts_home = '<option value="">Not specified</option>' + "".join(f'<option value="{e(s)}">{e(n)}</option>' for s, n in states)
    major_opts = '<option value="">No preference</option>' + "".join(f'<option value="{e(m)}">{e(m)}</option>' for m in MAJORS)
    path = "/college-match/"
    faqs = [
        ("How does the college match quiz work?",
         "You answer questions about what you want to study, cost, location, campus life, career and support, and mark how "
         "much each matters. Each college gets a personal fit score from 0 to 100 built only from those answers, with the "
         "reasons and the concerns listed. Admissions chances and cost are shown separately."),
        ("Is my fit score affected by how selective a college is?",
         "No. Fit uses your preferences only. A college can be a great fit and a reach, or easy to get into and a poor fit; "
         "you see both."),
        ("How does it decide Likely, Target and Reach?",
         "From your SAT or ACT score against the college's reported middle-50% range for enrolled students, and its "
         "acceptance rate. Colleges admitting under 15% are a reach for everyone. Without a score, or applying test-optional, "
         "the label is Uncertain. It is guidance, not a prediction."),
        ("What happens when a college is missing data?",
         "Missing facts never count as a pass or a fail. The evidence percentage drops, the fit becomes a range, and if the "
         "missing fact is a must-have the college is listed under Needs checking instead of being removed."),
        ("Can I describe what I want in my own words?",
         "Yes. The matcher reads your description and shows the preferences it found. Nothing is applied until you tick it, "
         "and it tells you which wishes it cannot match on yet, such as beaches, skiing or climate."),
        ("Where does the data come from?",
         "Costs, outcomes and score ranges from the U.S. Department of Education's College Scorecard; programs, services, "
         "housing rules, military benefits and locations from IPEDS 2023. Every result lists the source."),
        ("Can I ask questions about a specific college?",
         "Yes. The research panel answers from pages on that college's official website and links to them. If those pages "
         "do not answer it, it says so instead of guessing."),
        ("Is anything I enter stored or shared?",
         "Your answers stay in your browser, and Clear my answers deletes them. Saved colleges go into your FunSAT profile on "
         "this device. The research panel sends only the college and your question, never your grades, scores or budget."),
    ]

    def sel(name, label, options):
        return f'<label>{label}<select name="{name}">{options}</select></label>'

    body = (
        f'<nav class="gnav"><a href="/">&larr; {SITE_NAME}</a><a href="/colleges/">All colleges</a></nav>'
        '<p class="gkicker">College matcher</p>'
        '<h1>College Match Quiz: Find Colleges That Fit Your Life</h1>'
        f'<div class="glead">Answer 11 to 25 questions, or describe your ideal college in your own words, and get {len(rows)} '
        'four-year colleges ranked on <em>your</em> priorities. Each one shows why it fits, what could go wrong, how hard it is to '
        'get into, what it would cost you, and how much of that we could verify. No account; answers stay in your browser.</div>'
        '<div id="cmx" class="cmx" aria-live="polite"><p class="cmx-small">Loading the matcher…</p></div>'
        '<noscript><p>The matcher needs JavaScript. You can still browse every college by '
        '<a href="/colleges-by-state/">state</a> or look up your <a href="/sat-scores/">SAT score</a> '
        'or <a href="/act-scores/">ACT score</a>.</p></noscript>'
        '<h2>How the matcher works</h2>'
        '<ul><li><strong>Personal fit (0-100)</strong> scores only your own preferences, grouped into academics, cost, location, '
        'career, campus life, flexibility, getting around and support. You set how much each matters.</li>'
        '<li><strong>Admissions</strong> (Likely, Target, Reach, Uncertain) comes separately from the college\'s reported score '
        'range and admit rate. It never changes your fit score, and it is not a prediction.</li>'
        '<li><strong>Evidence</strong> shows how much of your preferences we could check with verified federal data. Unknowns '
        'are never counted as a pass or a fail; when evidence is thin you see a range instead of one number.</li>'
        '<li><strong>Must-haves</strong> remove a college only when the data shows it fails. If we cannot check it, the college '
        'goes under "Needs checking".</li></ul>'
        '<p><a href="/college-match/how-it-works/">Full method, data sources and what we cannot match on yet &rarr;</a></p>'
        + seo_sections(rows)
        + '<p>Next steps: <a href="/guides/how-to-build-a-college-list/">how to build a college list</a>, '
        '<a href="/guides/how-much-does-college-really-cost/">what college really costs</a>, '
        '<a href="/guides/college-graduation-rates-and-earnings/">graduation rates and earnings</a>, and '
        '<a href="/guides/test-optional-colleges-explained/">test-optional colleges</a>.</p>'
        '<h2>Frequently asked questions</h2>'
        + "".join(f"<h3>{e(q)}</h3><p>{e(a)}</p>" for q, a in faqs)
        + '<div class="glinks"><a href="/colleges/">All colleges</a><a href="/colleges-by-state/">Colleges by state</a>'
          '<a href="/college-comparisons/">Compare colleges</a><a href="/college-costs/">College costs</a>'
          '<a href="/scholarships/">Scholarships</a><a href="/sat-scores/">SAT score lookup</a><a href="/act-scores/">ACT score lookup</a></div>'

    )
    howto = {"@type": "HowTo", "name": "How to find colleges that fit you",
             "step": [{"@type": "HowToStep", "name": n, "text": t} for n, t in [
                 ("Choose a depth", "Pick Quick, Detailed or Advanced; you can switch at any time without losing answers."),
                 ("Answer or describe", "Answer the questions, or describe your ideal college in your own words and confirm what was understood."),
                 ("Mark what matters", "Set each preference from nice to have to must have, and adjust category weights."),
                 ("Read your matches", "Each college shows personal fit, admissions, cost and how much was verified."),
                 ("Research and list", "Ask questions answered from official college pages, compare, and save colleges to your list.")]]}
    return path, page(
        path=path,
        title=f"Free College Match Quiz: Find Colleges That Fit Your Life | {SITE_NAME}",
        description=(f"Free college match quiz: rank {len(rows)} colleges on your major, budget, location and priorities. See why each fits, "
                     "what could go wrong, admissions odds and cost, with sources. No account."),
        body=body,
        extra_head=('<link rel="stylesheet" href="/college-matcher.css">\n<script defer src="/college-match-engine.js"></script>\n'
                    '<script defer src="/college-matcher.js"></script>\n'),
        schema=[
            breadcrumbs([("Home", "/"), ("Colleges", "/colleges/"), ("College matcher", path)]),
            faq_schema(faqs), howto,
            {"@type": "WebApplication", "name": "FunSAT College Matcher", "url": "https://funsat.bid" + path,
             "applicationCategory": "EducationalApplication", "operatingSystem": "Any",
             "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}},
        ])


def how_it_works_page():
    """/college-match/how-it-works/: the scoring method, read from the engine and the data file so it cannot drift."""
    import subprocess
    from seo_common import ROOT
    info = json.loads(subprocess.run(["node", "-e", """
      global.window = {}; require('./college-match-data.js'); const M = require('./college-match-engine.js');
      const D = window.COLLEGE_MATCH_DATA.meta;
      process.stdout.write(JSON.stringify({ version: M.VERSION, cats: M.CATEGORIES, imp: M.IMPORTANCE,
        crit: M.CRITERIA.map((c) => ({ id: c.id, cat: c.cat, label: c.label })), majors: D.majors, prof: D.professional, source: D.source, notes: D.notes }));
    """], cwd=ROOT, capture_output=True, text=True, check=True).stdout)
    path = "/college-match/how-it-works/"
    cats = "".join(f"<tr><td>{e(v['label'])}</td><td>{v['weight']}%</td><td>{e(', '.join(c['label'] for c in info['crit'] if c['cat'] == k))}</td></tr>"
                   for k, v in info["cats"].items())
    imps = "".join(f"<tr><td>{e(v['label'])}</td><td>{v['w']}</td><td>{'Yes' if v.get('hard') else 'No'}</td></tr>" for v in info["imp"].values())
    majors = "".join(f"<tr><td>{e(v['label'])}</td><td>{e(', '.join(v['cip']))}</td></tr>" for v in info["majors"].values())
    body = (
        f'<nav class="gnav"><a href="/">&larr; {SITE_NAME}</a><a href="/college-match/">College match quiz</a></nav>'
        '<p class="gkicker">Method</p><h1>How the College Matcher Works</h1>'
        '<p>The matcher is a fixed set of rules, not an AI judgment: the same answers and data always give the same results. '
        f'Scoring version <code>{e(info["version"])}</code>.</p>'
        '<h2>Three measures that are never mixed</h2>'
        '<ul><li><strong>Personal fit</strong>: how well a college meets your preferences.</li>'
        '<li><strong>Admissions</strong>: Likely, Target, Reach or Uncertain, from the college\'s reported score range and admit rate.</li>'
        '<li><strong>Cost</strong>: net price (for your income band when you give one) against your budget.</li></ul>'
        '<h2>Personal fit</h2>'
        '<p>Each preference you answer becomes a check that returns met (1), partly met (between 0 and 1), not met (0) or '
        '<em>not verified</em>. A category score is the importance-weighted average of its verified checks. Fit is the weighted '
        'average of category scores; categories you did not answer drop out and the remaining weights are rescaled to 100%.</p>'
        f'<table class="gtable"><thead><tr><th>Category</th><th>Default weight</th><th>Checks</th></tr></thead><tbody>{cats}</tbody></table>'
        f'<table class="gtable"><thead><tr><th>Importance</th><th>Weight</th><th>Requirement</th></tr></thead><tbody>{imps}</tbody></table>'
        '<h2>Evidence and missing data</h2>'
        '<p>Evidence coverage is the weighted share of your checks we could verify. Unverified checks are left out of the fit, '
        'never counted as a pass or a fail. The fit range runs from "every unknown fails" to "every unknown passes"; when '
        'coverage is under 60% the range is shown instead of a single number. A college does not score higher for having more data.</p>'
        '<h2>Requirements</h2>'
        '<p>A "must have" or "dealbreaker" that the data shows a college fails, even partly, removes it from the main list (you '
        'can still see it under Left out, with the reason). If the data cannot check it, the college moves to Needs checking. '
        '"Workable without a car" is only an estimate from the campus setting, so it can never remove a college.</p>'
        '<h2>Admissions labels</h2>'
        '<ul><li>Admit rate under 15%: Reach for everyone.</li>'
        '<li>Score at or above the 75th percentile: Likely if the college admits 50%+, Target if 25-50%, otherwise Reach.</li>'
        '<li>Score inside the middle 50%: Likely if it admits 70%+, Target if 25-70%, otherwise Reach.</li>'
        '<li>Score below the 25th percentile: Target if it admits 80%+, otherwise Reach.</li>'
        '<li>No score, or applying test-optional: Uncertain.</li></ul>'
        '<p>Score ranges describe enrolled students, not cutoffs. Colleges do not report GPA ranges to the federal government, so '
        'GPA is not used. A high admit rate alone never makes a college Likely.</p>'
        '<h2>Data</h2>'
        f'<p>{e(info["source"])}; costs, outcomes and score ranges from the College Scorecard. {e(info["notes"])}</p>'
        '<h3>Majors and the program codes behind them</h3>'
        f'<table class="gtable"><thead><tr><th>Major</th><th>CIP 2020 codes</th></tr></thead><tbody>{majors}</tbody></table>'
        '<h2>What we cannot match on yet</h2>'
        '<p>Beaches, ski areas, climate, airports, nightlife, Greek life, transit service, local job listings and wages have no '
        'verified source in our data yet, so the matcher lists them as unsupported instead of guessing. Ask about them in the '
        'research panel for a specific college, which answers from that college\'s official website with links.</p>'
        '<h2>Research answers</h2>'
        '<p>The research panel reads only pages on the college\'s own website (the address the college reports to IPEDS), '
        'respects robots.txt, quotes the passages it used and links to them. An answer that cites nothing is marked unverified. '
        'Nothing about you is sent except the question.</p>'
        '<p><a href="/college-match/">Back to the college match quiz &rarr;</a></p>'
    )
    schema = [breadcrumbs([("Home", "/"), ("College match quiz", "/college-match/"), ("How it works", path)])]
    return path, page(path=path, title=f"How the College Matcher Works: Method and Data | {SITE_NAME}",
                      description="How FunSAT's college match quiz scores personal fit, admissions and cost separately, handles missing data and must-haves, and which federal data it uses.",
                      body=body, schema=schema)
