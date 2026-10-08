VERSION = None
#!/usr/bin/env python3
"""Generate the static, indexable college and scholarship pages, rewrite the
guides to extensionless URLs, and regenerate sitemap.xml.

Run from the repo root (the wrangler build step does this automatically):
    python3 scripts/build-seo-pages.py            # writes into ./public
    python3 scripts/build-seo-pages.py --out DIR  # writes elsewhere

Every URL it emits is directory-form (no .html). The Worker 301s the legacy
.html paths onto these.
"""
import argparse
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from seo_common import (ORIGIN, ROOT, SITE_NAME, STATES, TODAY, breadcrumbs, e,
                        faq_schema, inject_ads, inject_fonts, load_colleges, load_scholarships,
                        money, num, page, pct, slugify, write)

HOME = ("Home", "/")


# ---------------------------------------------------------------- colleges

def sat_line(c):
    if c.get("sr25") and c.get("sr75"):
        return f"{c['sr25']}&ndash;{c['sr75']}"
    return "Not reported"


def act_line(c):
    if c.get("ar25") and c.get("ar75"):
        return f"{c['ar25']}&ndash;{c['ar75']}"
    return "Not reported"


def table(rows, head=("", "")):
    body = "".join(f"<tr><th scope=\"row\">{k}</th><td>{v}</td></tr>" for k, v in rows)
    return (f'<table class="gtable"><thead><tr><th scope="col">{head[0]}</th>'
            f'<th scope="col">{head[1]}</th></tr></thead><tbody>{body}</tbody></table>')


SOCIAL_GRADE_HEAD = {
    "A": "Busy, with plenty of people to meet",
    "B": "A steady social scene",
    "C": "A quieter social scene",
    "D": "A small, quiet social scene",
}
LOCALE_LINE = {
    "city": "in a city, so a lot of what students do happens off campus too",
    "suburb": "in a suburb, within reach of a bigger city but with its own centre of gravity",
    "town": "in a college town, where the campus largely is the social scene",
    "rural": "in a rural setting, where almost everything social happens on campus",
}


def size_word(enr):
    if not enr:
        return None
    if enr >= 25000:
        return "very large"
    if enr >= 12000:
        return "large"
    if enr >= 4000:
        return "mid-sized"
    if enr >= 1200:
        return "small"
    return "very small"


def social_life(c, name, state):
    """A social-life section assembled only from figures already in the bundle,
    each line credited to the collection it comes from. There is no student
    survey behind any of this and the copy says so: the letter grade is the
    app's own estimate, and every number under it is federal or BEA data the
    reader can check."""
    grade = c.get("sg")
    enr, loc = c.get("enr"), c.get("loc")
    ret, gr_, div = c.get("ret"), c.get("gr"), c.get("div")
    age25, rpp, rpph = c.get("age25"), c.get("rpp"), c.get("rpph")
    sfr = c.get("sfr")
    if not grade and not enr:
        return "", None

    # A reported 0 for a rate is a hole in the source, not a measurement. Saying
    # "0% finish within six years" about a 50,000-student university would be a
    # fabrication dressed as data.
    if not ret:
        ret = None
    if not gr_:
        gr_ = None

    # Where most students are older, the figures are not describing residential
    # campus life at all, whatever the letter grade works out to.
    commuter = age25 is not None and age25 >= 35
    size = size_word(enr)

    bits = []
    if size and commuter:
        article = "an" if str(loc or "").startswith(("u", "a", "e", "i", "o")) else "a"
        where = f", on {article} {str(loc).lower()} campus in {e(state)}" if loc else f" in {e(state)}"
        bits.append(f"{name} enrolls a {size} student body{where}")
    elif size and loc:
        bits.append(f"{name} is a {size} campus {LOCALE_LINE.get(loc, 'in ' + e(state))}")
    elif size:
        bits.append(f"{name} is a {size} campus")
    if age25 is not None:
        if commuter:
            bits.append(f"but {age25:.0f}% of students are 25 or older, so these figures describe "
                        f"a largely non-residential student body rather than campus social life")
        elif age25 < 5:
            bits.append("almost everyone is traditional college age")
        elif age25 < 15:
            bits.append("most students are traditional college age")
        else:
            bits.append(f"{age25:.0f}% of students are 25 or older, so a good share are "
                        f"working or commuting rather than living student life full time")
    if ret is not None:
        if ret >= 75:
            bits.append(f"and {ret:.0f}% come back after first year")
        else:
            bits.append(f"and only {ret:.0f}% come back after first year, which is worth asking about")
    lead = "; ".join(bits).replace("; and ", " and ").replace("; but ", " but ") + "."

    rows = []
    if enr:
        rows.append(("Undergraduates", f"{enr:,}",
                     "U.S. Dept. of Education, College Scorecard"))
    if loc:
        rows.append(("Setting", f"{str(loc).title()} &middot; {e(c.get('city') or '')}, {e(c.get('st') or '')}",
                     "IPEDS locale classification"))
    if ret is not None:
        rows.append(("Come back after first year", f"{ret:.0f}%",
                     "College Scorecard (RET_FT4)"))
    if gr_ is not None:
        rows.append(("Finish within six years", f"{gr_:.0f}%",
                     "College Scorecard (C150_4)"))
    if div is not None:
        rows.append(("Spread across reported groups", f"{div:.0f} out of 100",
                     "Computed from Scorecard enrollment shares"))
    if age25 is not None:
        rows.append(("Students 25 or older", f"{age25:.1f}%",
                     "College Scorecard"))
    if sfr:
        rows.append(("Students per faculty member", f"{sfr:.0f}:1",
                     "College Scorecard"))
    if rpp:
        rent = f" &middot; rent {rpph:.0f}" if rpph else ""
        rows.append(("Local prices (U.S. = 100)", f"{rpp:.0f}{rent}",
                     f"BEA Regional Price Parities, {e(state)}, 2024"))

    cells = "".join(
        f'<div class="sl-fact"><dt>{label}</dt>'
        f'<dd class="sl-val">{value}</dd>'
        f'<dd class="sl-src">{source}</dd></div>'
        for label, value, source in rows)

    if commuter:
        head = "Largely a non-residential student body"
        badge = ""
    else:
        head = SOCIAL_GRADE_HEAD.get(grade or "", "Campus social signals")
        badge = (f'<span class="sl-grade" data-grade="{e(grade)}" '
                 f'aria-label="Social life estimate: grade {e(grade)}">{e(grade)}</span>') if grade else ""

    # A low spread figure at a college that serves one community is a description
    # of who it serves, not a shortcoming, and the page should say which it is.
    served = ""
    if c.get("hbcu"):
        served = (" This is a historically Black college or university, so the spread figure "
                  "describes the community it was founded to serve.")
    elif str(c.get("st") or "") in ("PR", "GU", "VI"):
        served = (" Nearly all students here come from the island's own population, which is why "
                  "the spread figure is low.")

    html_out = (
        f'<h2 id="social-life">Social life at {e(name)}</h2>'
        f'<section class="sl">'
        f'<div class="sl-head">{badge}'
        f'<div><p class="sl-title">{head}</p>'
        f'<p class="sl-lead">{lead}</p></div></div>'
        f'<dl class="sl-facts">{cells}</dl>'
        f'<p class="sl-note"><strong>How to read this.</strong> There is no student survey behind '
        f'this section. The letter is {SITE_NAME}&rsquo;s own estimate from the figures above &mdash; '
        f'size, how many students return, the spread of backgrounds and the setting &mdash; and the '
        f'figures themselves come from the U.S. Department of Education&rsquo;s College Scorecard '
        f'and IPEDS collections and the Bureau of Economic Analysis. Retention is the closest thing '
        f'in public data to &ldquo;students are happy here&rdquo;, but it is a proxy, not a verdict. '
        f'The spread figure measures how evenly enrollment is divided across the groups the college '
        f'reports; a low number means a more homogeneous student body, not a worse one.{served} '
        f'For the things official data cannot measure &mdash; Greek life, clubs, whether weekends '
        f'empty out &mdash; read the student paper and ask on a visit.</p>'
        f'</section>')
    return html_out, (ret, grade, size, loc, commuter)


def college_page(c, data):
    name, st = c["n"], c["st"]
    state = STATES.get(st, st)
    slug = c["slug"]
    path = f"/colleges/{slug}/"
    ctrl = "public" if c.get("ctrl") == "public" else "private nonprofit"
    adm = c.get("adm")
    has_sat, has_act = bool(c.get("sr25")), bool(c.get("ar25"))

    title = f"{name} SAT & ACT Scores, Acceptance Rate & Costs | {SITE_NAME}"
    if len(title) > 70:
        title = f"{name}: SAT Scores & Acceptance Rate | {SITE_NAME}"
    desc_bits = []
    if has_sat:
        desc_bits.append(f"middle-50% SAT {c['sr25']}–{c['sr75']}")
    if has_act:
        desc_bits.append(f"ACT {c['ar25']}–{c['ar75']}")
    if adm:
        desc_bits.append(f"{adm:.0f}% acceptance rate")
    description = (f"{name} admissions data: " + ", ".join(desc_bits or ["test scores"]) +
                   f", costs, graduation rate and earnings. Official federal data, "
                   f"updated {data['meta'].get('release', '')}.")[:300]

    # --- intro
    intro = (f"<p><strong>{e(name)}</strong> is a {ctrl} four-year university in "
             f"{e(c.get('city', ''))}, {e(state)}, enrolling about {num(c.get('enr'))} "
             f"undergraduates.")
    if adm:
        tone = ("highly selective" if adm < 15 else "selective" if adm < 40
                else "moderately selective" if adm < 70 else "largely open-access")
        intro += (f" It admits roughly {adm:.0f}% of applicants, which makes it "
                  f"{tone} relative to four-year colleges nationally.")
    intro += "</p>"

    # --- scores
    scores = "<h2>SAT and ACT scores at " + e(name) + "</h2>"
    if has_sat or has_act:
        rows = []
        if has_sat:
            rows += [("SAT 25th percentile", str(c["sr25"])),
                     ("SAT 75th percentile", str(c["sr75"]))]
            if c.get("sr50"):
                rows.append(("SAT midpoint (estimated)", str(c["sr50"])))
        if has_act:
            rows += [("ACT 25th percentile", str(c["ar25"])),
                     ("ACT 75th percentile", str(c["ar75"]))]
            if c.get("ar50"):
                rows.append(("ACT midpoint (estimated)", str(c["ar50"])))
        if c.get("satAvg"):
            rows.append(("Average SAT of enrolled students", str(c["satAvg"])))
        if c.get("test"):
            rows.append(("Test policy", e(str(c["test"]))))
        scores += table(rows, ("Measure", "Score"))
        if has_sat:
            scores += (f"<p>A quarter of enrolled students scored below {c['sr25']} and a "
                       f"quarter scored above {c['sr75']}. Treat <strong>{c['sr75']}</strong> as "
                       f"the target that makes your score a clear strength in this applicant "
                       f"pool, and {c['sr25']} as the point below which the rest of your "
                       f"application has to carry more weight.</p>")
        if has_sat and has_act:
            scores += (f"<p>The two ranges describe the same class, so submit whichever test "
                       f"places you higher in its own range &mdash; an ACT {c['ar75']} and an SAT "
                       f"{c['sr75']} are read as equivalent here.</p>")
    else:
        scores += (f"<p>{e(name)} does not report SAT or ACT score ranges in the most recent "
                   f"federal data, which usually means a test-optional or test-free policy with "
                   f"too few submitted scores to publish. Check the admissions office for the "
                   f"current cycle before deciding whether to send scores.</p>")

    # --- selectivity
    sel = "<h2>Admissions and selectivity</h2>" + table([
        ("Acceptance rate", pct(adm, 1) if adm else "Not reported"),
        ("Undergraduate enrollment", num(c.get("enr"))),
        ("Student&ndash;faculty ratio", f"{c['sfr']:.0f}:1" if c.get("sfr") else "Not reported"),
        ("Setting", e(str(c.get("loc", "Not reported")).title())),
        ("Control", ctrl.title()),
    ], ("Measure", "Value"))

    # --- cost
    in_state = money(c.get("ti"))
    out_state = money(c.get("to"))
    cost = "<h2>Cost and financial aid</h2>" + table([
        ("In-state tuition and fees", in_state),
        ("Out-of-state tuition and fees", out_state),
        ("Room and board", money(c.get("rb"))),
        ("Average net price (first-year students)", money(c.get("np"))),
        ("Students receiving Pell grants", pct(c.get("pell"))),
        ("Students taking federal loans", pct(c.get("loan"))),
        ("Median federal loan debt at graduation", money(c.get("debt"))),
        ("Median family income of students", money(c.get("fam"))),
        ("Federal loan default rate", pct(c.get("cdr"))),
    ], ("Measure", "Amount"))
    if c.get("np"):
        cost += (f"<p>Net price is the number that matters: {money(c['np'])} is what a typical "
                 f"first-year student actually pays after grants and scholarships, not the "
                 f"sticker price. Run the college's own net price calculator with your family's "
                 f"numbers before ruling it out on cost.</p>")

    # --- outcomes
    out = "<h2>Graduation and earnings outcomes</h2>" + table([
        ("Graduation rate (6-year)", pct(c.get("gr"))),
        ("First-year retention", pct(c.get("ret"))),
        ("Median earnings 10 years after entry", money(c.get("ern"))),
        ("Students who are first-generation", pct(c.get("fg"))),
        ("Graduation rate, Pell grant recipients", pct(c.get("gpell"))),
    ], ("Measure", "Value"))

    if c.get("gpell") and c.get("gr"):
        gap = c["gr"] - c["gpell"]
        if abs(gap) >= 1:
            worse = gap > 0
            out += (f"<p>Students on Pell grants graduate at {pct(c['gpell'])}, "
                    f"{abs(gap):.0f} points {'below' if worse else 'above'} the "
                    f"{pct(c['gr'])} rate for the class as a whole. That gap is a fair proxy for "
                    f"how well a college supports students who arrive with less money behind "
                    f"them, and few colleges publish it prominently.</p>")
        else:
            out += (f"<p>Students on Pell grants graduate at {pct(c['gpell'])}, essentially "
                    f"level with the {pct(c['gr'])} rate for the class as a whole &mdash; a sign "
                    f"the college supports lower-income students about as well as everyone else.</p>")

    # --- social life (from data already in the bundle; see social_life())
    social, social_facts = social_life(c, name, state)

    # --- majors
    majors = ""
    if c.get("maj"):
        items = "".join(f"<li>{e(m)} &mdash; {share}% of bachelor's degrees</li>"
                        for m, share in c["maj"])
        majors = (f"<h2>Most popular majors</h2><ul>{items}</ul>"
                  f"<p>Shares are of bachelor's degrees awarded, so a concentrated list usually "
                  f"signals a college known for those programs.</p>")

    # --- personalized block (filled client-side from the visitor's saved profile;
    #     stays hidden when there is no score on file or no reported range here)
    personal = ""
    if has_sat or has_act:
        payload = {"id": c["id"], "name": name}
        for k in ("sr25", "sr75", "ar25", "ar75"):
            if c.get(k):
                payload[k] = c[k]
        personal = (
            f'<section class="fxcp" id="fxCollegeProfile" hidden></section>'
            f'<script type="application/json" id="fxCollegeData">'
            f'{json.dumps(payload, separators=(",", ":"), ensure_ascii=False)}</script>')

    # --- how to get in with FunSAT
    cta = (f'<div class="gcard"><h2>How your score compares</h2>'
           f'<p>Take a free adaptive practice test on {SITE_NAME}, get an unofficial score '
           f'estimate, and see exactly where you land inside {e(name)}\'s reported range '
           f'alongside the rest of your college list.</p>'
           f'<a class="cta" href="/">Start a free practice test &rarr;</a></div>')

    # --- FAQ
    faqs = []
    if has_sat:
        faqs.append((f"What SAT score do you need for {name}?",
                     f"The middle 50% of enrolled students at {name} scored between "
                     f"{c['sr25']} and {c['sr75']} on the SAT. A score at or above {c['sr75']} "
                     f"puts you in the top quarter of admitted students; below {c['sr25']} the "
                     f"rest of your application carries more weight."))
    if has_act:
        faqs.append((f"What ACT score do you need for {name}?",
                     f"The middle 50% ACT range at {name} is {c['ar25']} to {c['ar75']}. "
                     f"Aim for {c['ar75']} to make the score a clear strength."))
    if adm:
        faqs.append((f"What is the acceptance rate at {name}?",
                     f"{name} admits about {adm:.1f}% of applicants according to the most "
                     f"recent U.S. Department of Education College Scorecard data."))
    if c.get("test"):
        faqs.append((f"Does {name} require SAT or ACT scores?",
                     f"The most recent federal data lists {name}'s testing policy as "
                     f"\"{c['test']}\". Policies change yearly, so confirm with the admissions "
                     f"office for your application cycle."))
    if social_facts:
        ret_v, grade_v, size_v, loc_v, commuter_v = social_facts
        parts = []
        if commuter_v:
            parts.append(f"{name} enrolls a {size_v or 'mixed'} student body, but most students "
                         f"here are 25 or older, so it is largely not a residential campus")
        elif size_v and loc_v:
            parts.append(f"{name} is a {size_v} campus {LOCALE_LINE.get(loc_v, '')}".rstrip())
        if ret_v is not None:
            parts.append(f"{ret_v:.0f}% of first-year students return for a second year")
        if parts:
            faqs.append((f"What is social life like at {name}?",
                         ". ".join(p[0].upper() + p[1:] for p in parts) +
                         ". Public data cannot measure Greek life, clubs or whether the campus "
                         "empties at weekends, so treat these figures as a starting point and "
                         "check the student newspaper and a campus visit for the rest."))
    if c.get("np"):
        faqs.append((f"How much does {name} cost?",
                     f"Published tuition and fees are {money(c.get('ti'))} in-state and "
                     f"{money(c.get('to'))} out-of-state, but the average first-year student "
                     f"pays a net price of {money(c['np'])} after grant aid."))

    faq_html = "<h2>Frequently asked questions</h2>" + "".join(
        f"<h3>{e(q)}</h3><p>{e(a)}</p>" for q, a in faqs)

    # --- photo gallery
    # Built from `imgs`, a list of curated Commons images. Accepts the stored
    # shape {u, a, l} and the {src, credit, license} shape, and falls back to the
    # single `img`/`imgA`/`imgL` fields. Each image carries its own credit
    # because the Commons licences require attribution per work, not per page.
    shots = []
    for item in (c.get("imgs") or []):
        src = item.get("src") or item.get("u")
        if not src:
            continue
        shots.append({"src": src,
                      "credit": item.get("credit") or item.get("a") or "Wikimedia Commons",
                      "license": item.get("license") or item.get("l") or ""})
    if not shots and c.get("img"):
        shots.append({"src": c["img"], "credit": c.get("imgA", "Wikimedia Commons"),
                      "license": c.get("imgL", "")})

    img = ""
    if shots:
        cells = []
        for i, shot in enumerate(shots):
            credit = (f'<a href="{e(shot["license"])}" target="_blank" rel="noopener nofollow">'
                      f'{e(shot["credit"])}</a>') if shot["license"] else e(shot["credit"])
            cells.append(
                f'<figure class="cg-item">'
                f'<button type="button" class="cg-open" data-cg="{i}" '
                f'aria-label="Open photo {i + 1} of {len(shots)} of {e(name)} larger">'
                f'<img src="{e(shot["src"])}" alt="{e(name)} campus, photo {i + 1}" '
                f'loading="lazy" decoding="async" width="960" height="540"></button>'
                f'<figcaption class="cg-credit">{credit}</figcaption></figure>')
        gallery_data = json.dumps(
            [{"src": x["src"], "credit": x["credit"], "license": x["license"]} for x in shots],
            separators=(",", ":"), ensure_ascii=False)
        img = (f'<section class="cg" data-college-gallery data-count="{len(shots)}" '
               f'aria-label="Photos of {e(name)}">'
               f'<div class="cg-grid">{"".join(cells)}</div>'
               f'<script type="application/json" class="cg-data">{gallery_data}</script>'
               f'</section>')

    related = "".join(
        f'<a href="/colleges/{o["slug"]}/">{e(o["n"])}</a>' for o in c.get("_related", []))
    links = (f'<div class="glinks">'
             f'<a href="/colleges/{slugify(state)}/">Colleges in {e(state)}</a>'
             f'<a href="/college-costs/{slugify(state)}/">What college costs in {e(state)}</a>'
             f'<a href="/colleges/">All colleges</a>'
             f'<a href="/guides/what-is-a-good-sat-score/">What is a good SAT score?</a>'
             f'<a href="/guides/college-admissions-chances/">Admissions chances</a>'
             f'{related}</div>')

    src = (f'<p class="muted"><small>Source: {e(data["meta"]["source"])}. '
           f'{e(data["meta"].get("release", ""))}. Score ranges and costs are reported by the '
           f'institution to the U.S. Department of Education and can lag the current admissions '
           f'cycle by a year or more.</small></p>')

    body = (f'<nav class="gnav"><a href="/">&larr; {SITE_NAME}</a>'
            f'<a href="/colleges/">All colleges</a></nav>'
            f'<p class="gkicker">{e(state)} &middot; College profile</p>'
            f'<h1>{e(name)}: SAT &amp; ACT Scores, Acceptance Rate and Costs</h1>'
            f'{intro}{personal}{img}{scores}{sel}{cost}{out}{social}{majors}{cta}{faq_html}{src}{links}')

    schema = [
        {"@type": "CollegeOrUniversity", "name": name,
         "url": f"https://{c['url']}" if c.get("url") and not str(c["url"]).startswith("http") else c.get("url"),
         "address": {"@type": "PostalAddress", "addressLocality": c.get("city"),
                     "addressRegion": st, "addressCountry": "US"},
         "mainEntityOfPage": ORIGIN + path},
        breadcrumbs([HOME, ("Colleges", "/colleges/"),
                     (state, f"/colleges/{slugify(state)}/"), (name, path)]),
    ]
    if faqs:
        schema.append(faq_schema(faqs))

    extra = '<script src="/college-profile.js" defer></script>' if personal else ""
    if img:
        extra += '<script src="/college-gallery.js" defer></script>'
    return path, page(path=path, title=title, description=description, body=body,
                      schema=schema, extra_head=extra)


def state_hub(state, cols):
    path = f"/colleges/{slugify(state)}/"
    cols = sorted(cols, key=lambda c: -(c.get("enr") or 0))
    rows = "".join(
        f'<tr><td><a href="/colleges/{c["slug"]}/">{e(c["n"])}</a></td>'
        f'<td>{sat_line(c)}</td><td>{act_line(c)}</td>'
        f'<td>{pct(c.get("adm"), 0) if c.get("adm") else "&mdash;"}</td></tr>'
        for c in cols)
    body = (f'<nav class="gnav"><a href="/">&larr; {SITE_NAME}</a>'
            f'<a href="/colleges/">All colleges</a></nav>'
            f'<p class="gkicker">By state</p>'
            f'<h1>{e(state)} Colleges: SAT Scores and Acceptance Rates</h1>'
            f'<p>SAT and ACT score ranges and acceptance rates for {len(cols)} four-year '
            f'colleges in {e(state)}, from the U.S. Department of Education College Scorecard. '
            f'Ranges are the middle 50% of enrolled students &mdash; a quarter scored below the '
            f'low number and a quarter above the high one.</p>'
            f'<table class="gtable"><thead><tr><th scope="col">College</th>'
            f'<th scope="col">SAT (mid 50%)</th><th scope="col">ACT (mid 50%)</th>'
            f'<th scope="col">Acceptance</th></tr></thead><tbody>{rows}</tbody></table>'
            f'<div class="gcard"><p>See how your own score compares against every school on '
            f'this list.</p><a class="cta" href="/">Take a free practice test &rarr;</a></div>'
            f'<div class="glinks"><a href="/colleges/">All colleges</a>'
            f'<a href="/college-costs/{slugify(state)}/">What college costs in {e(state)}</a>'
            f'<a href="/guides/what-is-a-good-sat-score/">What is a good SAT score?</a>'
            f'<a href="/guides/">Study guides</a></div>')
    return path, page(
        path=path,
        title=f"{state} Colleges: SAT Scores & Acceptance Rates | {SITE_NAME}",
        description=(f"SAT and ACT score ranges and acceptance rates for {len(cols)} four-year "
                     f"colleges in {state}, from official federal College Scorecard data."),
        body=body,
        schema=[breadcrumbs([HOME, ("Colleges", "/colleges/"), (state, path)])])


def colleges_hub(colleges, by_state):
    path = "/colleges/"
    state_links = "".join(
        f'<li><a href="/colleges/{slugify(s)}/">{e(s)}</a> ({len(v)})</li>'
        for s, v in sorted(by_state.items()))
    top = sorted([c for c in colleges if c.get("sr75")], key=lambda c: -c["sr75"])[:25]
    rows = "".join(
        f'<tr><td><a href="/colleges/{c["slug"]}/">{e(c["n"])}</a></td>'
        f'<td>{e(STATES.get(c["st"], c["st"]))}</td><td>{sat_line(c)}</td>'
        f'<td>{pct(c.get("adm"), 0) if c.get("adm") else "&mdash;"}</td></tr>' for c in top)
    body = (f'<nav class="gnav"><a href="/">&larr; {SITE_NAME}</a>'
            f'<a href="/guides/">Study guides</a></nav>'
            f'<p class="gkicker">College data</p>'
            f'<h1>College SAT Scores and Acceptance Rates</h1>'
            f'<p>Score ranges, acceptance rates, costs and outcomes for '
            f'{len(colleges)} four-year colleges, built from the U.S. Department of Education '
            f'College Scorecard. Every profile shows the middle-50% SAT and ACT range, net '
            f'price, graduation rate and median earnings in one place.</p>'
            f'<h2>Highest SAT ranges</h2>'
            f'<table class="gtable"><thead><tr><th scope="col">College</th>'
            f'<th scope="col">State</th><th scope="col">SAT (mid 50%)</th>'
            f'<th scope="col">Acceptance</th></tr></thead><tbody>{rows}</tbody></table>'
            f'<h2>Browse by state</h2><ul class="gcols">{state_links}</ul>'
            f'<div class="gcard"><p>Practice, get an unofficial score estimate, and see which '
            f'of these colleges your score already clears.</p>'
            f'<a class="cta" href="/">Start free practice &rarr;</a></div>')
    return path, page(
        path=path,
        title=f"College SAT Scores & Acceptance Rates ({len(colleges)} Colleges) | {SITE_NAME}",
        description=(f"SAT and ACT score ranges, acceptance rates, net price and graduation "
                     f"rates for {len(colleges)} four-year colleges, from official federal data."),
        body=body,
        schema=[breadcrumbs([HOME, ("Colleges", path)])])


# ------------------------------------------------------------ scholarships

def amount_text(s):
    lo, hi = s.get("lo"), s.get("hi")
    if s.get("amtNote"):
        return s["amtNote"]
    if lo and hi and lo != hi:
        return f"{money(lo)}–{money(hi)}"
    return money(lo or hi)


TAG_LABELS = {"need": "need-based", "merit": "merit-based", "firstgen": "first-generation",
              "identity": "identity-based", "stem": "STEM", "arts": "arts",
              "essay": "essay-based", "local": "local/regional", "military": "military-connected",
              "service": "community service", "nocollege": "no-essay / easy entry"}


def scholarship_page(s, related):
    slug = s["slug"]
    path = f"/scholarships/{slug}/"
    name, org = s["n"], s.get("org", "")
    amt = amount_text(s)
    tags = [TAG_LABELS.get(t, t) for t in s.get("tags", [])]
    grades = ", ".join(f"grade {g}" for g in s.get("grades", [])) or "varies"

    title = f"{name}: Amount, Deadline & Eligibility | {SITE_NAME}"
    description = (f"{name} from {org}: award {amt}, deadline {s.get('deadline', 'varies')}. "
                   f"Who qualifies and how to apply.")[:300]

    rows = [("Award", e(amt)), ("Provider", e(org)),
            ("Typical deadline", e(s.get("deadline", "Varies"))),
            ("Eligible grade levels", e(grades))]
    if tags:
        rows.append(("Category", e(", ".join(tags))))

    faqs = [
        (f"How much is the {name} worth?",
         f"The {name} awards {amt}. Amounts are set by {org} and change from cycle to cycle, "
         f"so confirm the current figure on the provider's official page before applying."),
        (f"When is the {name} deadline?",
         f"The typical deadline is {s.get('deadline', 'announced each cycle')}. Deadlines move "
         f"every year; set your own reminder at least three weeks earlier so you have time for "
         f"essays and recommendation letters."),
        (f"Who is eligible for the {name}?",
         s.get("elig", f"Eligibility is set by {org}; check the official page.")),
    ]

    body = (f'<nav class="gnav"><a href="/">&larr; {SITE_NAME}</a>'
            f'<a href="/scholarships/">All scholarships</a></nav>'
            f'<p class="gkicker">Scholarship</p>'
            f'<h1>{e(name)}</h1>'
            f'<p>{e(s.get("desc", ""))}</p>'
            f'{table(rows, ("Detail", "Information"))}'
            f'<h2>Who qualifies</h2><p>{e(s.get("elig", "See the provider\'s official page."))}</p>'
            f'<h2>How to apply</h2>'
            f'<ol><li>Open the official {e(org)} application page and confirm this cycle\'s '
            f'deadline and award amount &mdash; both change yearly.</li>'
            f'<li>Collect what almost every application asks for: transcript, a counselor or '
            f'teacher recommendation, and your FAFSA or household income details if the award '
            f'is need-based.</li>'
            f'<li>Draft the essay well ahead of the deadline and have one adult read it.</li>'
            f'<li>Submit several days early. Portals get overloaded on deadline day.</li></ol>'
            + (f'<p><a class="cta" href="{e(s["link"])}" rel="noopener" target="_blank">'
               f'Official application page &rarr;</a></p>' if s.get("link") else "")
            + f'<div class="gcard"><p>Scholarship money follows test scores for a lot of merit '
              f'awards. Practice free and track your unofficial score estimate as it moves.</p>'
              f'<a class="cta" href="/">Start free SAT/ACT practice &rarr;</a></div>'
            + '<h2>Frequently asked questions</h2>'
            + "".join(f"<h3>{e(q)}</h3><p>{e(a)}</p>" for q, a in faqs)
            + '<p class="muted"><small>Amounts, deadlines and eligibility are typical values '
              'that change every cycle. Always verify on the provider&rsquo;s official page '
              'before applying.</small></p>'
            + '<div class="glinks">'
            + "".join(f'<a href="/scholarships/{r["slug"]}/">{e(r["n"])}</a>' for r in related)
            + '<a href="/scholarships/">All scholarships</a>'
              '<a href="/guides/how-to-write-a-scholarship-essay/">Scholarship essay guide</a>'
              '<a href="/guides/fafsa-guide-for-beginners/">FAFSA guide</a></div>')

    return path, page(path=path, title=title, description=description, body=body, schema=[
        {"@type": "EducationalOccupationalCredential" if False else "Grant",
         "name": name, "description": s.get("desc", ""),
         "sponsor": {"@type": "Organization", "name": org},
         "mainEntityOfPage": ORIGIN + path},
        breadcrumbs([HOME, ("Scholarships", "/scholarships/"), (name, path)]),
        faq_schema(faqs),
    ])


def scholarships_hub(items):
    path = "/scholarships/"
    rows = "".join(
        f'<tr><td><a href="/scholarships/{s["slug"]}/">{e(s["n"])}</a></td>'
        f'<td>{e(s.get("org", ""))}</td><td>{e(amount_text(s))}</td>'
        f'<td>{e(s.get("deadline", "Varies"))}</td></tr>' for s in items)
    body = (f'<nav class="gnav"><a href="/">&larr; {SITE_NAME}</a>'
            f'<a href="/guides/">Study guides</a></nav>'
            f'<p class="gkicker">Scholarships</p>'
            f'<h1>Scholarships for High School Students</h1>'
            f'<p>{len(items)} scholarships with award amounts, deadlines and eligibility in one '
            f'table. Each profile explains who qualifies and what the application asks for. '
            f'Amounts and deadlines shift every cycle &mdash; always confirm on the provider\'s '
            f'own page before applying.</p>'
            f'<table class="gtable"><thead><tr><th scope="col">Scholarship</th>'
            f'<th scope="col">Provider</th><th scope="col">Award</th>'
            f'<th scope="col">Deadline</th></tr></thead><tbody>{rows}</tbody></table>'
            f'<div class="gcard"><p>Many of these weigh test scores. Practice free and watch '
            f'your estimate move.</p><a class="cta" href="/">Start practice &rarr;</a></div>'
            f'<div class="glinks">'
            f'<a href="/guides/how-to-write-a-scholarship-essay/">Scholarship essay guide</a>'
            f'<a href="/guides/scholarship-search-guide/">How to search</a>'
            f'<a href="/guides/fafsa-guide-for-beginners/">FAFSA guide</a></div>')
    return path, page(
        path=path,
        title=f"{len(items)} Scholarships for High School Students: Amounts & Deadlines | {SITE_NAME}",
        description=(f"{len(items)} scholarships for high school students with award amounts, "
                     f"deadlines and eligibility requirements, plus how to apply to each."),
        body=body,
        schema=[breadcrumbs([HOME, ("Scholarships", path)])])


# ------------------------------------------------------------------ guides


GUIDE_TITLES = {}


def rewrite_guides(out):
    """Copy guides/*.html to extensionless directories, rewrite internal links,
    canonicals and og:urls, and inject BreadcrumbList schema."""
    paths = []
    for src in sorted((ROOT / "guides").glob("*.html")):
        slug = src.stem
        html_text = src.read_text(encoding="utf8")
        path = "/guides/" if slug == "index" else f"/guides/{slug}/"

        # Internal .html guide links -> directory form (site-wide convention).
        html_text = re.sub(r'href="/guides/([a-z0-9-]+)\.html"', r'href="/guides/\1/"', html_text)
        html_text = html_text.replace('href="/guides/index/"', 'href="/guides/"')
        # Canonical + og:url must point at the extensionless URL.
        html_text = re.sub(r'(<link rel="canonical" href=")[^"]*(")', rf'\g<1>{ORIGIN}{path}\g<2>', html_text)
        html_text = re.sub(r'(<meta property="og:url" content=")[^"]*(")', rf'\g<1>{ORIGIN}{path}\g<2>', html_text)
        html_text = re.sub(r'("mainEntityOfPage":")[^"]*(")', rf'\g<1>{ORIGIN}{path}\g<2>', html_text)

        html_text = inject_fonts(inject_ads(html_text))

        m = re.search(r"<h1>(.*?)</h1>", html_text, re.S)
        h1 = re.sub(r"<[^>]+>", "", m.group(1)).strip() if m else slug
        GUIDE_TITLES[slug] = h1

        trail = [HOME, ("Study guides", "/guides/")]
        if slug != "index":
            trail.append((h1, path))
        crumbs = json.dumps({"@context": "https://schema.org", **breadcrumbs(trail)},
                            separators=(",", ":"), ensure_ascii=False)
        html_text = html_text.replace(
            "</head>", f'<script type="application/ld+json">{crumbs}</script>\n</head>', 1)

        write(out / path.lstrip("/") / "index.html", html_text)
        paths.append(path)
    # guide.css lives alongside the guides and is referenced absolutely.
    write(out / "guides" / "guide.css", (ROOT / "guides" / "guide.css").read_text(encoding="utf8"))
    return paths


# ------------------------------------------------------------ arcade games
# "<game> unblocked" is what students search from a school Chromebook. The games
# are real and already on the site, so these are genuine pages about genuine
# content rather than doorways: each one carries the actual controls and rules
# pulled straight from the app's own catalogue.

GAME_RE = re.compile(r'\{\s*key:\s*"([^"]+)",\s*name:\s*"([^"]+)"\s*\}')
KV_RE = re.compile(r'(?:"([a-z0-9]+)"|([a-z0-9]+)):\s*"([^"]+)"')
RULE_RE = re.compile(r'\n\s*(?:"([a-z0-9]+)"|([a-z0-9]+)):\s*"((?:[^"\\]|\\.)*)"')


def load_games():
    """Read the arcade catalogue out of app.js so these pages can never drift
    from the games the site actually ships."""
    src = (ROOT / "app.js").read_text(encoding="utf8")

    def block(name, close):
        i = src.find(f"const {name}")
        return src[i:src.find(close, i) + 1]

    genres, rules = {}, {}
    for a, b, c in KV_RE.findall(block("GAME_GENRES", "};")):
        genres[a or b] = c
    for a, b, c in RULE_RE.findall(block("GAME_RULES", "\n};")):
        rules[a or b] = c.replace('\\"', '"')
    out = []
    for key, name in GAME_RE.findall(block("GAME_LIST", "];")):
        out.append({"key": key, "name": name.title() if name.isupper() else name,
                    "raw": name, "slug": slugify(name),
                    "genre": genres.get(key, "Arcade"), "rule": rules.get(key, "")})
    return out


WHY_UNBLOCKED = (
    "<h2>Why these work at school</h2>"
    "<p>Every game here runs in the browser tab you already have open. There is nothing to "
    "install, no plugin, no Flash, and no separate games domain to reach &mdash; which is why they "
    "keep working on a managed school Chromebook where the usual gaming sites do not. They are "
    "part of a study site, so the arcade sits alongside the practice tests rather than replacing "
    "them.</p>"
    "<p>Game time is earned: answering SAT and ACT practice questions unlocks arcade credits. "
    "That is the trade &mdash; the break is free, but it is attached to the work.</p>")


def game_page(g, others):
    path = f"/unblocked-games/{g['slug']}/"
    name = g["name"]
    title = f"{name} Unblocked \u2014 Play Free in Your Browser | {SITE_NAME}"
    if len(title) > 75:
        title = f"{name} Unblocked \u2014 Free Browser Game | {SITE_NAME}"
    description = (f"Play {name} unblocked, free and in your browser \u2014 no download and no "
                   f"install. {g['rule'][:110]}").strip()[:300]

    siblings = [o for o in others if o["genre"] == g["genre"] and o["key"] != g["key"]][:6]
    sib_html = "".join(f'<li><a href="/unblocked-games/{o["slug"]}/">{e(o["name"])}</a></li>'
                       for o in siblings)

    faqs = [
        (f"Is {name} free to play?",
         f"Yes. {name} runs free in the browser on {SITE_NAME}. There is no download, no install "
         f"and no account needed to play."),
        (f"How do you play {name}?",
         g["rule"] or f"{name} runs in the browser; the controls are shown on the start screen."),
        (f"Does {name} work on a school Chromebook?",
         f"It runs in a normal browser tab with no plugin or download, so it works on a managed "
         f"Chromebook the same way any other web page does. Whether a particular network allows "
         f"this site is set by that school, not by us."),
    ]

    body = (f'<nav class="gnav"><a href="/">&larr; {SITE_NAME}</a>'
            f'<a href="/unblocked-games/">All games</a></nav>'
            f'<p class="gkicker">{e(g["genre"])} &middot; Unblocked games</p>'
            f'<h1>{e(name)} Unblocked</h1>'
            f'<p>{e(name)} is one of the {len(others) + 1} browser games in the {SITE_NAME} '
            f'arcade. It loads in the page, needs no download, and runs on a school Chromebook '
            f'as readily as on a laptop.</p>'
            f'<h2>How to play {e(name)}</h2>'
            f'<p>{e(g["rule"])}</p>'
            f'{table([("Genre", e(g["genre"])), ("Players", "One"), ("Download", "None"),
                      ("Cost", "Free"), ("Runs on", "Any modern browser")], ("Detail", "Value"))}'
            f'{WHY_UNBLOCKED}'
            f'<div class="gcard"><h2>Play {e(name)} now</h2>'
            f'<p>Open the arcade, pick {e(name)} from the cabinet, and earn credits by answering '
            f'practice questions between runs.</p>'
            f'<a class="cta" href="/?play={g["key"]}">Play {name} now &rarr;</a></div>'
            + (f'<h2>More {e(g["genre"].lower())} games</h2><ul>{sib_html}</ul>' if sib_html else "")
            + '<h2>Frequently asked questions</h2>'
            + "".join(f"<h3>{e(q)}</h3><p>{e(a)}</p>" for q, a in faqs)
            + '<div class="glinks">'
              '<a href="/unblocked-games/">All unblocked games</a>'
              '<a href="/">Free SAT practice</a>'
              '<a href="/guides/how-to-stop-procrastinating/">How to stop procrastinating</a>'
              '<a href="/guides/how-to-build-a-study-schedule/">Build a study schedule</a></div>')

    schema = [breadcrumbs([HOME, ("Unblocked games", "/unblocked-games/"), (name, path)]),
              faq_schema(faqs)]
    return path, page(path=path, title=title, description=description, body=body, schema=schema)


def games_hub(games):
    path = "/unblocked-games/"
    title = f"Unblocked Games \u2014 {len(games)} Free Browser Games, No Download | {SITE_NAME}"
    description = (f"{len(games)} free unblocked browser games that run on a school Chromebook "
                   f"with no download: puzzle, racing, action, word and classic arcade. Earn "
                   f"game time by answering SAT and ACT practice questions.")

    by_genre = {}
    for g in games:
        by_genre.setdefault(g["genre"], []).append(g)
    sections = ""
    for genre in sorted(by_genre):
        items = "".join(
            f'<li><a href="/unblocked-games/{g["slug"]}/">{e(g["name"])}</a> '
            f'&mdash; {e(g["rule"].split(".")[0])}.</li>'
            for g in sorted(by_genre[genre], key=lambda x: x["name"]))
        sections += f'<h2>{e(genre)}</h2><ul>{items}</ul>'

    faqs = [
        ("What are unblocked games?",
         "Unblocked games are browser games that load as an ordinary web page, with no download, "
         "plugin or separate games site to reach. That is why they keep working on managed school "
         "devices where dedicated gaming domains are filtered."),
        (f"How many games are there on {SITE_NAME}?",
         f"There are {len(games)} browser games in the arcade, across puzzle, racing, action, "
         f"word and classic arcade categories."),
        ("Do the games cost anything?",
         "No. Every game is free. Arcade credits are earned by answering SAT and ACT practice "
         "questions rather than bought."),
    ]

    body = (f'<nav class="gnav"><a href="/">&larr; {SITE_NAME}</a>'
            f'<a href="/guides/">Study guides</a></nav>'
            f'<p class="gkicker">Unblocked games</p>'
            f'<h1>Unblocked Games: {len(games)} Free Browser Games</h1>'
            f'<p>Every game below runs in a browser tab. Nothing to download, nothing to install, '
            f'and no separate gaming domain to reach &mdash; which is what keeps them working on a '
            f'school Chromebook. They sit inside a free SAT and ACT practice site, and game time '
            f'is unlocked by answering practice questions.</p>'
            f'{sections}'
            f'{WHY_UNBLOCKED}'
            f'<div class="gcard"><h2>Earn your game time</h2>'
            f'<p>Answer three practice questions, get an arcade credit. It is a reasonable trade '
            f'and the practice is genuinely useful.</p>'
            f'<a class="cta" href="/">Start practising &rarr;</a></div>'
            + '<h2>Frequently asked questions</h2>'
            + "".join(f"<h3>{e(q)}</h3><p>{e(a)}</p>" for q, a in faqs)
            + '<div class="glinks">'
              '<a href="/">Free SAT practice test</a>'
              '<a href="/guides/">Study guides</a>'
              '<a href="/sat-act-conversion/">SAT to ACT conversion</a></div>')

    return path, page(path=path, title=title, description=description, body=body,
                      schema=[breadcrumbs([HOME, ("Unblocked games", path)]), faq_schema(faqs)])


# ------------------------------------------------------ college cost pages
# Written for the parent rather than the applicant: what it costs, what comes
# out the other end, and who actually graduates. Every figure is already in the
# College Scorecard extract, so nothing here is invented or estimated.

def _median(vals):
    vals = sorted(v for v in vals if v)
    if not vals:
        return None
    n = len(vals)
    return vals[n // 2] if n % 2 else (vals[n // 2 - 1] + vals[n // 2]) / 2


def cost_row(c):
    return (f'<tr><th><a href="/colleges/{c["slug"]}/">{e(c["n"])}</a></th>'
            f'<td>{money(c.get("np"))}</td><td>{pct(c.get("gr"))}</td>'
            f'<td>{money(c.get("ern"))}</td></tr>')


def cost_table(rows):
    return ('<table class="gtable"><thead><tr><th>College</th><th>Avg. net price</th>'
            '<th>Grad rate</th><th>Median earnings</th></tr></thead><tbody>'
            + "".join(cost_row(c) for c in rows) + '</tbody></table>')


def state_cost_page(state_name, cols, national):
    slug = slugify(state_name)
    path = f"/college-costs/{slug}/"
    priced = [c for c in cols if c.get("np")]
    med_np = _median([c.get("np") for c in priced])
    med_in = _median([c.get("ti") for c in cols])
    med_out = _median([c.get("to") for c in cols])
    med_debt = _median([c.get("debt") for c in cols])
    med_ern = _median([c.get("ern") for c in cols])
    cheapest = sorted(priced, key=lambda c: c["np"])[:10]
    best_earn = sorted([c for c in cols if c.get("ern")], key=lambda c: -c["ern"])[:8]

    title = f"What College Costs in {state_name}: Net Price & Debt | {SITE_NAME}"
    description = (f"The real cost of college in {state_name}: average net price "
                   f"{money(med_np)}, median graduate debt {money(med_debt)}, and earnings ten "
                   f"years on. Federal data for {len(cols)} four-year colleges.")[:300]

    cmp_line = ""
    if med_np and national.get("np"):
        diff = med_np - national["np"]
        cmp_line = (f" That is {money(abs(diff))} {'above' if diff > 0 else 'below'} the "
                    f"{money(national['np'])} median across every college we track.")

    faqs = [
        (f"How much does college cost in {state_name}?",
         f"Across the {len(cols)} four-year colleges we track in {state_name}, the median net "
         f"price \u2014 what a typical first-year family actually pays after grant aid \u2014 is "
         f"{money(med_np)}. Published tuition is {money(med_in)} in-state and {money(med_out)} "
         f"out-of-state, but very few families pay the sticker price."),
        (f"What is the cheapest college in {state_name}?",
         f"By average net price, {cheapest[0]['n']} at {money(cheapest[0]['np'])} per year, "
         f"according to the most recent federal data." if cheapest else
         f"Net price is not reported for colleges in {state_name} in the current data."),
        (f"How much debt do students leave {state_name} colleges with?",
         f"The median federal loan debt at graduation is {money(med_debt)}. That covers federal "
         f"loans only, so private and parent borrowing sits on top of it."),
    ]

    body = (f'<nav class="gnav"><a href="/">&larr; {SITE_NAME}</a>'
            f'<a href="/college-costs/">All states</a></nav>'
            f'<p class="gkicker">{e(state_name)} &middot; College costs</p>'
            f'<h1>What College Actually Costs in {e(state_name)}</h1>'
            f'<p>Sticker price is close to meaningless. The number that matters is <strong>net '
            f'price</strong>: what a typical first-year family pays after grants and scholarships '
            f'come off. Across the {len(cols)} four-year colleges we track in {e(state_name)}, '
            f'the median net price is <strong>{money(med_np)}</strong>.{cmp_line}</p>'
            f'<h2>The headline numbers</h2>'
            f'{table([("Median net price (what families pay)", money(med_np)),
                      ("Median published in-state tuition", money(med_in)),
                      ("Median published out-of-state tuition", money(med_out)),
                      ("Median federal loan debt at graduation", money(med_debt)),
                      ("Median earnings 10 years after entry", money(med_ern)),
                      ("Four-year colleges covered", str(len(cols)))], ("Measure", "Value"))}'
            f'<h2>Lowest net price in {e(state_name)}</h2>'
            f'<p>Ranked by what families actually pay, not by published tuition. Graduation rate '
            f'and earnings are shown beside it, because a cheap college you do not finish is not '
            f'a saving.</p>'
            f'{cost_table(cheapest)}'
            + (f'<h2>Strongest earnings ten years on</h2>'
               f'<p>Median earnings of former students a decade after they first enrolled. It '
               f'reflects the subjects a college teaches and who it admits as much as the '
               f'teaching itself, so read it alongside cost rather than on its own.</p>'
               f'{cost_table(best_earn)}' if best_earn else "")
            + f'<h2>Questions worth asking before you pay</h2>'
              f'<p>Ask every college on the list for its net price calculator and run it with your '
              f'real numbers &mdash; the published average hides enormous variation by income. Ask '
              f'what share of need it meets, whether aid is renewable for four years, and what the '
              f'graduation rate is for students receiving Pell grants specifically. That last figure '
              f'is on each of our college profiles and is the one most likely to be missing from a '
              f'glossy brochure.</p>'
            + f'<div class="gcard"><h2>Where does your child\'s score land?</h2>'
              f'<p>Free adaptive SAT and ACT practice with an unofficial score estimate, then see '
              f'how that score sits against the reported range at every college on your list.</p>'
              f'<a class="cta" href="/">Start free practice &rarr;</a></div>'
            + '<h2>Frequently asked questions</h2>'
            + "".join(f"<h3>{e(q)}</h3><p>{e(a)}</p>" for q, a in faqs)
            + f'<p class="muted"><small>Source: U.S. Department of Education College Scorecard. '
              f'Net price is the average for first-year students receiving federal aid and varies '
              f'sharply by family income. Figures can lag the current admissions cycle.</small></p>'
            + f'<div class="glinks">'
              f'<a href="/college-costs/">College costs by state</a>'
              f'<a href="/colleges/{slug}/">Colleges in {e(state_name)}</a>'
              f'<a href="/guides/fafsa-guide-for-beginners/">FAFSA guide</a>'
              f'<a href="/scholarships/">Scholarship search</a>'
              f'<a href="/guides/how-to-get-a-full-ride-scholarship/">Full-ride scholarships</a></div>')

    return path, page(path=path, title=title, description=description, body=body, schema=[
        breadcrumbs([HOME, ("College costs", "/college-costs/"), (state_name, path)]),
        faq_schema(faqs)])


def costs_hub(by_state, colleges):
    path = "/college-costs/"
    national = {"np": _median([c.get("np") for c in colleges]),
                "debt": _median([c.get("debt") for c in colleges]),
                "ern": _median([c.get("ern") for c in colleges]),
                "gr": _median([c.get("gr") for c in colleges])}
    title = f"What College Costs by State: Net Price, Debt & Earnings | {SITE_NAME}"
    description = (f"Median net price, graduate debt and earnings for {len(colleges)} four-year "
                   f"colleges, broken down by state. Federal data, written for parents working "
                   f"out what a degree will actually cost.")

    rows = []
    for st_name in sorted(by_state):
        cols = by_state[st_name]
        rows.append(f'<tr><th><a href="/college-costs/{slugify(st_name)}/">{e(st_name)}</a></th>'
                    f'<td>{money(_median([c.get("np") for c in cols]))}</td>'
                    f'<td>{money(_median([c.get("debt") for c in cols]))}</td>'
                    f'<td>{len(cols)}</td></tr>')
    table_html = ('<table class="gtable"><thead><tr><th>State</th><th>Median net price</th>'
                  '<th>Median debt</th><th>Colleges</th></tr></thead><tbody>'
                  + "".join(rows) + '</tbody></table>')

    faqs = [
        ("What is net price and why does it matter more than tuition?",
         "Net price is what a family actually pays after grants and scholarships are deducted. "
         "Published tuition is a list price that a majority of students never pay, so comparing "
         "colleges on tuition alone will mislead you."),
        ("How much debt is normal for a college graduate?",
         f"The median federal loan debt at graduation across the colleges we track is "
         f"{money(national['debt'])}. This counts federal loans only; private and parent loans "
         f"are additional and are not captured in federal reporting."),
        ("Is an expensive college worth it?",
         "Sometimes. Compare net price against graduation rate and median earnings ten years on, "
         "all three of which are on every college profile here. A cheaper college with a much "
         "lower graduation rate is often the worse financial decision."),
    ]

    body = (f'<nav class="gnav"><a href="/">&larr; {SITE_NAME}</a>'
            f'<a href="/colleges/">All colleges</a></nav>'
            f'<p class="gkicker">For parents &middot; College costs</p>'
            f'<h1>What College Actually Costs, by State</h1>'
            f'<p>If you are working out what a degree will cost your family, published tuition is '
            f'the wrong number to start from. Most students do not pay it. The figure below is '
            f'<strong>net price</strong> &mdash; the average a first-year family pays after grant '
            f'aid &mdash; for {len(colleges)} four-year colleges, grouped by state.</p>'
            f'<h2>The national picture</h2>'
            f'{table([("Median net price", money(national["np"])),
                      ("Median federal loan debt at graduation", money(national["debt"])),
                      ("Median earnings 10 years after entry", money(national["ern"])),
                      ("Median six-year graduation rate", pct(national["gr"]))],
                     ("Measure", "Value"))}'
            f'<p>Read those four together. Net price tells you the outlay, debt tells you what is '
            f'borrowed to cover it, earnings tell you what tends to come back, and the graduation '
            f'rate tells you how often the whole thing completes at all. A college that scores '
            f'well on cost and badly on completion is not a bargain.</p>'
            f'<h2>Cost by state</h2>'
            f'{table_html}'
            f'<div class="gcard"><h2>Start with the score</h2>'
            f'<p>Aid and admission both move with test scores. Free adaptive SAT and ACT practice, '
            f'an unofficial estimate, and a view of how it lands against each college\'s range.</p>'
            f'<a class="cta" href="/">Start free practice &rarr;</a></div>'
            + '<h2>Frequently asked questions</h2>'
            + "".join(f"<h3>{e(q)}</h3><p>{e(a)}</p>" for q, a in faqs)
            + '<p class="muted"><small>Source: U.S. Department of Education College Scorecard. '
              'Medians are across the four-year colleges in our dataset, which covers larger and '
              'better-known institutions rather than every college in the country.</small></p>'
            + '<div class="glinks">'
              '<a href="/colleges/">All college profiles</a>'
              '<a href="/scholarships/">Scholarship search</a>'
              '<a href="/guides/fafsa-guide-for-beginners/">FAFSA guide</a>'
              '<a href="/guides/college-admissions-chances/">Admissions chances</a></div>')

    return path, page(path=path, title=title, description=description, body=body,
                      schema=[breadcrumbs([HOME, ("College costs", path)]), faq_schema(faqs)]), national


# -------------------------------------------------------------------- main

# Local css/js refs, relative or root-absolute; never protocol-relative or remote.
ASSET_RE = re.compile(r'(href|src)="(?!https?:|//)([^":?#]+\.(?:css|js))"')


def asset_version():
    """Short content hash over the files that actually change, so a deploy
    invalidates every cached copy without waiting for max-age to expire."""
    import hashlib
    h = hashlib.sha1()
    for name in ("app.js", "redesign.css", "workspace.css", "ads.js",
                 "guides/guide.css", "subjects.css", "college.js"):
        f = ROOT / name
        if f.exists():
            h.update(f.read_bytes())
    return h.hexdigest()[:8]


def stamp_assets(html, version):
    """Append ?v=<hash> to local css/js references."""
    return ASSET_RE.sub(lambda m: f'{m.group(1)}="{m.group(2)}?v={version}"', html)


def stamp_tree(out, version):
    """Stamp every emitted document in one pass, so nothing depends on which
    code path wrote it. A cached copy of app.js or redesign.css can no longer
    outlive a deploy, regardless of the Cache-Control it was stored under."""
    n = 0
    for f in out.rglob("*.html"):
        text = f.read_text(encoding="utf8")
        stamped = stamp_assets(text, version)
        if stamped != text:
            f.write_text(stamped, encoding="utf8")
            n += 1
    return n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="public")
    args = ap.parse_args()
    out = (ROOT / args.out).resolve()
    global VERSION
    VERSION = asset_version()
    print(f"asset version {VERSION}")


    data, colleges = load_colleges()
    by_state = {}
    for c in colleges:
        by_state.setdefault(STATES.get(c["st"], c["st"]), []).append(c)
    # Three in-state peers per profile, for crawl depth and genuine usefulness.
    for c in colleges:
        peers = [o for o in by_state[STATES.get(c["st"], c["st"])] if o is not c]
        peers.sort(key=lambda o: abs((o.get("sr50") or 0) - (c.get("sr50") or 0)))
        c["_related"] = peers[:3]

    entries = [("/", "1.0", "weekly")]

    p, h = colleges_hub(colleges, by_state)
    write(out / "colleges" / "index.html", h)
    entries.append((p, "0.9", "weekly"))

    for state, cols in sorted(by_state.items()):
        p, h = state_hub(state, cols)
        write(out / p.lstrip("/") / "index.html", h)
        entries.append((p, "0.7", "monthly"))

    for c in colleges:
        p, h = college_page(c, data)
        write(out / p.lstrip("/") / "index.html", h)
        entries.append((p, "0.6", "monthly"))

    sdata = load_scholarships()
    items = sdata["scholarships"]
    p, h = scholarships_hub(items)
    write(out / "scholarships" / "index.html", h)
    entries.append((p, "0.9", "weekly"))
    for i, s in enumerate(items):
        related = [items[(i + k) % len(items)] for k in (1, 2, 3)]
        p, h = scholarship_page(s, related)
        write(out / p.lstrip("/") / "index.html", h)
        entries.append((p, "0.6", "monthly"))

    p, h = conversion_page(colleges, data["concordance"], data)
    write(out / p.lstrip("/") / "index.html", h)
    entries.append((p, "0.9", "monthly"))

    games = load_games()
    p, h = games_hub(games)
    write(out / p.lstrip("/") / "index.html", h)
    entries.append((p, "0.8", "weekly"))
    for g in games:
        p, h = game_page(g, [o for o in games if o["key"] != g["key"]])
        write(out / p.lstrip("/") / "index.html", h)
        entries.append((p, "0.6", "monthly"))

    p, h, national = costs_hub(by_state, colleges)
    write(out / p.lstrip("/") / "index.html", h)
    entries.append((p, "0.9", "monthly"))
    for st_name, cols in sorted(by_state.items()):
        p, h = state_cost_page(st_name, cols, national)
        write(out / p.lstrip("/") / "index.html", h)
        entries.append((p, "0.7", "monthly"))

    sat_scores = list(range(900, 1560, 10))
    act_scores = list(range(17, 37))
    for scores, test in ((sat_scores, "sat"), (act_scores, "act")):
        p, h = score_hub(scores, test)
        write(out / p.lstrip("/") / "index.html", h)
        entries.append((p, "0.8", "monthly"))
        for sc in scores:
            p, h = score_page(colleges, data["concordance"], sc, test)
            write(out / p.lstrip("/") / "index.html", h)
            entries.append((p, "0.6", "monthly"))

    for p in rewrite_guides(out):
        entries.append((p, "0.8" if p == "/guides/" else "0.7",
                        "weekly" if p == "/guides/" else "monthly"))


    stamped = stamp_tree(out, VERSION)
    print(f"Generated {len(entries)} URLs into {out}")
    print(f"  asset version {VERSION} stamped into {stamped} documents")
    print(f"  colleges: {len(colleges)} profiles + {len(by_state)} state hubs + 1 hub")
    print(f"  scholarships: {len(items)} profiles + 1 hub")
    print(f"  guides: {len(GUIDE_TITLES)}")
    print(f"  score lookups: {len(sat_scores)} SAT + {len(act_scores)} ACT + 2 hubs")
    print(f"  unblocked games: {len(games)} + 1 hub")
    print(f"  college costs: {len(by_state)} states + 1 hub")



# ------------------------------------------------------- score lookup pages
# "is a 1350 SAT score good", "what colleges can I get into with a 28 ACT" —
# high-volume long-tail that we can answer from the 354-college dataset rather
# than with filler.

# Approximate national percentile anchors; interpolated between. Labelled as an
# estimate on every page because the official table shifts each cohort.
SAT_PCTL = [(400, 1), (600, 3), (800, 9), (900, 19), (1000, 33), (1050, 41),
            (1100, 51), (1200, 68), (1300, 84), (1400, 93), (1500, 98), (1600, 99)]


def ordinal(n):
    if 10 <= n % 100 <= 20:
        return f"{n}th"
    return f"{n}" + {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")


def percentile_for(score):
    pts = SAT_PCTL
    if score <= pts[0][0]:
        return pts[0][1]
    for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
        if score <= x1:
            return round(y0 + (y1 - y0) * (score - x0) / (x1 - x0))
    return 99


def sat_to_act(concordance, sat):
    best, bestd = None, 1e9
    for a, s in concordance["actToSat"].items():
        if abs(s - sat) < bestd:
            best, bestd = int(a), abs(s - sat)
    return best


def score_buckets(colleges, score, key25, key75):
    above, within, below = [], [], []
    for c in colleges:
        lo, hi = c.get(key25), c.get(key75)
        if not lo or not hi:
            continue
        (above if score >= hi else within if score >= lo else below).append(c)
    return above, within, below


def score_page(colleges, concordance, score, test):
    """test is 'sat' or 'act'."""
    if test == "sat":
        path = f"/sat-scores/{score}/"
        above, within, below = score_buckets(colleges, score, "sr25", "sr75")
        p = percentile_for(score)
        act_eq = sat_to_act(concordance, score)
        equiv = f"an ACT score of about {act_eq}"
        label, maxs = "SAT", 1600
        crumb_name, crumb_path = "SAT scores", "/sat-scores/"
        title = f"Is a {score} SAT Score Good? Colleges & Percentile | {SITE_NAME}"
    else:
        path = f"/act-scores/{score}/"
        above, within, below = score_buckets(colleges, score, "ar25", "ar75")
        sat_eq = concordance["actToSat"].get(str(score))
        p = percentile_for(sat_eq) if sat_eq else None
        equiv = f"an SAT score of about {sat_eq}" if sat_eq else "a comparable SAT score"
        label, maxs = "ACT", 36
        crumb_name, crumb_path = "ACT scores", "/act-scores/"
        title = f"Is a {score} ACT Score Good? Colleges & Percentile | {SITE_NAME}"

    verdict = ("well above average" if p and p >= 85 else "above average" if p and p >= 60
               else "around average" if p and p >= 40 else "below average")
    total = len(above) + len(within) + len(below)

    def lst(items, n=12):
        items = sorted(items, key=lambda c: -(c.get("enr") or 0))[:n]
        return "".join(f'<li><a href="/colleges/{c["slug"]}/">{e(c["n"])}</a> '
                       f'({e(STATES.get(c["st"], c["st"]))}, mid-50% '
                       f'{sat_line(c) if test == "sat" else act_line(c)})</li>' for c in items)

    description = (f"A {score} {label} score is {verdict} — roughly the {p}th percentile. "
                   f"See which of {total} colleges it clears, its {'ACT' if test == 'sat' else 'SAT'} "
                   f"equivalent, and how to raise it.")[:300]

    body = (f'<nav class="gnav"><a href="/">&larr; {SITE_NAME}</a>'
            f'<a href="{crumb_path}">All {label} scores</a></nav>'
            f'<p class="gkicker">{label} score lookup</p>'
            f'<h1>Is a {score} {label} Score Good?</h1>'
            f'<p>A <strong>{score}</strong> out of {maxs} is {verdict} for test takers '
            f'nationally &mdash; approximately the <strong>{p}th percentile</strong>, meaning you '
            f'scored at or above roughly {p}% of students. It converts to {equiv} on the '
            f'<a href="/sat-act-conversion/">official concordance</a>.</p>'
            f'<h2>What a {score} means for your college list</h2>'
            f'{table([("Approximate national percentile", ordinal(p)),
                      (f"Equivalent {'ACT' if test == 'sat' else 'SAT'} score",
                       str(act_eq) if test == "sat" else str(sat_eq)),
                      ("Colleges where this is at or above the 75th percentile", str(len(above))),
                      ("Colleges where this falls inside the middle 50%", str(len(within))),
                      ("Colleges where this is below the 25th percentile", str(len(below)))],
                     ("Measure", "Value"))}'
            f'<p>Those counts are drawn from the {total} four-year colleges in our dataset that '
            f'report {label} ranges. A score above a college&rsquo;s 75th percentile makes '
            f'testing a strength in that applicant pool; inside the range it is neutral; below '
            f'the 25th percentile the rest of the application has to do the work.</p>'
            + (f'<h2>Colleges where a {score} is a strength</h2><ul>{lst(above)}</ul>' if above else "")
            + (f'<h2>Colleges where a {score} is right in range</h2><ul>{lst(within)}</ul>' if within else "")
            + (f'<h2>Reach colleges with a {score}</h2><ul>{lst(below, 8)}</ul>' if below else "")
            + f'<div class="gcard"><h2>Want to move this number?</h2>'
              f'<p>Take a free adaptive practice test, get an unofficial estimate, and see the '
              f'college list shift as your score does.</p>'
              f'<a class="cta" href="/">Start free practice &rarr;</a></div>'
            + '<h2>Frequently asked questions</h2>'
            + "".join(f"<h3>{e(q)}</h3><p>{e(a)}</p>" for q, a in [
                (f"Is {score} a good {label} score?",
                 f"A {score} is {verdict}, around the {p}th percentile nationally. Whether it is "
                 f"good enough depends on your list: it sits at or above the 75th percentile at "
                 f"{len(above)} of the {total} colleges we track and inside the middle 50% at "
                 f"{len(within)} more."),
                (f"What {'ACT' if test == 'sat' else 'SAT'} score is equivalent to a {score} {label}?",
                 f"Using the official ACT/College Board concordance, a {score} {label} is "
                 f"comparable to {equiv}."),
                (f"What colleges can I get into with a {score} {label}?",
                 f"A {score} is in range or above at {len(above) + len(within)} of the {total} "
                 f"four-year colleges in our dataset. Test scores are one factor among grades, "
                 f"coursework rigour, essays and extracurriculars."),
            ])
            + '<p class="muted"><small>Percentiles are approximate and shift with each testing '
              'cohort; college ranges come from the U.S. Department of Education College '
              'Scorecard and can lag the current cycle.</small></p>'
            + f'<div class="glinks">'
            + (f'<a href="{crumb_path}{score - 10}/">{score - 10} {label}</a>' if test == "sat" and score - 10 >= 900
               else f'<a href="{crumb_path}{score - 1}/">{score - 1} {label}</a>' if test == "act" and score - 1 >= 17
               else "")
            + (f'<a href="{crumb_path}{score + 10}/">{score + 10} {label}</a>' if test == "sat" and score + 10 <= 1550
               else f'<a href="{crumb_path}{score + 1}/">{score + 1} {label}</a>' if test == "act" and score + 1 <= 36
               else "")
            + '<a href="/sat-act-conversion/">SAT to ACT conversion</a>'
              '<a href="/guides/what-is-a-good-sat-score/">What is a good SAT score?</a>'
              '<a href="/guides/how-to-improve-your-sat-score/">How to improve your score</a>'
              '<a href="/colleges/">All colleges</a></div>')

    return path, page(path=path, title=title, description=description, body=body, schema=[
        breadcrumbs([HOME, (crumb_name, crumb_path), (f"{score} {label}", path)]),
        faq_schema([
            (f"Is {score} a good {label} score?",
             f"A {score} is {verdict}, around the {p}th percentile nationally."),
            (f"What colleges can I get into with a {score} {label}?",
             f"A {score} is in range or above at {len(above) + len(within)} of the {total} "
             f"four-year colleges we track."),
        ]),
    ])


CONVERTER_JS = """
(function(){
  var MAP = window.FUNSAT_CONCORDANCE || {};
  var acts = Object.keys(MAP).map(Number).sort(function(a,b){return a-b});
  function satForAct(a){
    var best = acts[0];
    for (var i=0;i<acts.length;i++){ if (Math.abs(acts[i]-a) < Math.abs(best-a)) best = acts[i]; }
    return MAP[String(best)];
  }
  function actForSat(s){
    var best = acts[0], bd = Infinity;
    for (var i=0;i<acts.length;i++){
      var d = Math.abs(MAP[String(acts[i])] - s);
      if (d < bd){ bd = d; best = acts[i]; }
    }
    return best;
  }
  function start(){
    var sat = document.getElementById('convSat');
    var act = document.getElementById('convAct');
    var out = document.getElementById('convOut');
    if (!sat || !act || !out) return;
    var lock = false;
    function say(msg){ out.textContent = msg; }
    // An out-of-range entry is clamped in the field as well as in the maths, so
    // the box never shows a number the answer below is not actually using.
    function clamp(el, lo, hi){
      if (el.value.trim() === '') return null;
      var n = Number(el.value);
      if (!isFinite(n)) return null;
      var c = Math.max(lo, Math.min(hi, Math.round(n)));
      if (c !== n) el.value = c;
      return c;
    }
    function fromSat(){
      if (lock) return; lock = true;
      var v = clamp(sat, 400, 1600);
      if (v === null) { act.value = ''; say('Enter an SAT total to see its ACT equivalent.'); }
      else {
        var a = actForSat(v);
        act.value = a;
        say('An SAT total of ' + v + ' is comparable to an ACT composite of ' + a + '.');
      }
      lock = false;
    }
    function fromAct(){
      if (lock) return; lock = true;
      var v = clamp(act, 1, 36);
      if (v === null) { sat.value = ''; say('Enter an ACT composite to see its SAT equivalent.'); }
      else {
        var sv = satForAct(v);
        sat.value = sv;
        say('An ACT composite of ' + v + ' is comparable to an SAT total of ' + sv + '.');
      }
      lock = false;
    }
    sat.addEventListener('input', fromSat);
    act.addEventListener('input', fromAct);
    fromSat();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
"""

# ------------------------------------------------- SAT/ACT concordance page
# "sat to act conversion" is a high-volume evergreen head term and a tool-shaped
# intent, which is the kind a small site can win: the page answers the query
# outright instead of competing on domain authority. The table is the official
# ACT/College Board concordance we already carry for the score lookups.

def conversion_page(colleges, concordance, data):
    path = "/sat-act-conversion/"
    title = f"SAT to ACT Conversion: Official Concordance Table | {SITE_NAME}"
    description = ("Convert any SAT score to its ACT equivalent and back, using the official "
                   "ACT/College Board concordance. Full table, instant converter, and which "
                   "score to actually send to colleges.")

    pairs = sorted(((int(a), sv) for a, sv in concordance["actToSat"].items()), reverse=True)
    act_hi, act_lo = pairs[0][0], pairs[-1][0]

    # Each row links out to the score lookup pages, which turns a flat reference
    # table into the hub of the score cluster.
    rows = []
    for act, sat in pairs:
        pc = percentile_for(sat)
        sat_link = f'<a href="/sat-scores/{int(round(sat / 10) * 10)}/">{sat}</a>' if 900 <= sat <= 1550 else str(sat)
        act_link = f'<a href="/act-scores/{act}/">{act}</a>' if 17 <= act <= 36 else str(act)
        rows.append(f"<tr><th>{act_link}</th><td>{sat_link}</td><td>{pc}th</td></tr>")
    table_html = ('<table class="gtable"><thead><tr><th>ACT composite</th>'
                  '<th>SAT total</th><th>Approx. percentile</th></tr></thead>'
                  '<tbody>' + "".join(rows) + '</tbody></table>')

    # The converter is progressive enhancement: the table above answers the
    # question with JavaScript off, and this just makes it instant.
    converter = (
        '<div class="gcard conv">'
        '<h2>Convert a score</h2>'
        '<div class="conv-row">'
        '<label for="convSat">SAT total (400&ndash;1600)</label>'
        '<input id="convSat" type="number" min="400" max="1600" step="10" value="1200" '
        'inputmode="numeric" autocomplete="off">'
        '</div>'
        '<div class="conv-row">'
        '<label for="convAct">ACT composite (1&ndash;36)</label>'
        '<input id="convAct" type="number" min="1" max="36" step="1" value="25" '
        'inputmode="numeric" autocomplete="off">'
        '</div>'
        '<p class="conv-out" id="convOut" role="status" aria-live="polite"></p>'
        '</div>')

    body = (f'<nav class="gnav"><a href="/">&larr; {SITE_NAME}</a>'
            f'<a href="/sat-scores/">SAT score lookup</a></nav>'
            f'<p class="gkicker">Score conversion</p>'
            f'<h1>SAT to ACT Conversion</h1>'
            f'<p>Colleges treat the SAT and the ACT as interchangeable, and they compare the two '
            f'using a published <strong>concordance</strong> &mdash; a lookup table built by ACT '
            f'and the College Board from students who sat both tests. It is not a prediction of '
            f'what you would score on the other test. It answers one question only: what ACT '
            f'score carries the same weight as this SAT score, and the reverse.</p>'
            f'{converter}'
            f'<h2>Official SAT to ACT concordance table</h2>'
            f'<p>ACT composites from {act_hi} down to {act_lo}, with the SAT total each one '
            f'corresponds to. Percentiles are approximate and shift each cohort.</p>'
            f'{table_html}'
            f'<h2>Which score should you actually send?</h2>'
            f'<p>Convert both of your scores and send whichever sits higher against a college&rsquo;s '
            f'own reported range &mdash; not whichever number looks bigger. A 1300 SAT and a 28 ACT '
            f'are read as the same result, so the one that clears more of your list is the one worth '
            f'submitting. Our {len(colleges)} college profiles print both ranges side by side.</p>'
            f'<p>Two things the table will not tell you. Superscoring is set by each college, not by '
            f'the concordance, so a college that superscores the SAT may not superscore the ACT. And '
            f'converting a score never changes it: if you are near a cutoff, retaking the test you '
            f'are stronger at beats hunting for a favourable conversion.</p>'
            f'<div class="gcard"><h2>Not sure which test suits you?</h2>'
            f'<p>Take a free adaptive practice test in both formats, get an unofficial score '
            f'estimate for each, and compare them on the same scale.</p>'
            f'<a class="cta" href="/">Start free practice &rarr;</a></div>'
            f'<h2>Frequently asked questions</h2>'
            + "".join(f"<h3>{e(q)}</h3><p>{e(a)}</p>" for q, a in CONVERSION_FAQS(concordance))
            + f'<p class="muted"><small>Source: {e(concordance.get("source", "ACT and College Board official concordance"))}. '
              f'Percentile estimates are our own and are labelled as estimates throughout. '
              f'Concordance tables are updated rarely; confirm against '
              f'<a href="{e(concordance.get("sourceUrl", "https://www.act.org/"))}" target="_blank" rel="noopener">'
              f'the official ACT page</a> before relying on a borderline figure.</small></p>'
            + '<div class="glinks">'
              '<a href="/sat-scores/">SAT score lookup</a>'
              '<a href="/act-scores/">ACT score lookup</a>'
              '<a href="/guides/digital-sat-vs-act/">Digital SAT vs ACT</a>'
              '<a href="/guides/what-is-a-good-sat-score/">What is a good SAT score?</a>'
              '<a href="/colleges/">All colleges</a></div>')

    extra = ('<style>'
             '.conv-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:10px 0}'
             '.conv-row label{flex:1 1 220px;min-width:0}'
             '.conv-row input{width:120px;padding:9px 10px;font:inherit;'
             'border:1px solid var(--ws-line);background:var(--ws-surface);color:var(--ws-ink)}'
             '.conv-out{margin:14px 0 0;padding-top:12px;border-top:1px solid var(--ws-line);'
             'font-size:17px;line-height:1.5}'
             '</style>\n'
             '<script>window.FUNSAT_CONCORDANCE=' +
             json.dumps({str(a): s for a, s in pairs}, separators=(",", ":")) + ';</script>\n'
             '<script>' + CONVERTER_JS + '</script>\n')

    schema = [
        breadcrumbs([HOME, ("SAT to ACT conversion", path)]),
        faq_schema(CONVERSION_FAQS(concordance)),
    ]
    return path, page(path=path, title=title, description=description, body=body,
                      schema=schema, extra_head=extra)


def CONVERSION_FAQS(concordance):
    a2s = {int(a): sv for a, sv in concordance["actToSat"].items()}
    return [
        ("What ACT score is equivalent to a 1200 SAT?",
         f"A 1200 SAT converts to roughly a {sat_to_act(concordance, 1200)} ACT composite on the "
         f"official concordance. Colleges treat the two as equivalent."),
        ("What SAT score is equivalent to a 30 ACT?",
         f"A 30 ACT corresponds to about a {a2s.get(30)} SAT total."),
        ("Is the SAT to ACT conversion exact?",
         "No. The concordance is a statistical relationship drawn from students who took both "
         "tests, so it tells you how colleges compare the two scores. It does not predict what "
         "you would actually score on the other test."),
        ("Should I send my SAT or my ACT score?",
         "Convert both, then compare each against the reported range of the colleges on your "
         "list. Send the one that sits higher within those ranges rather than the one with the "
         "larger raw number."),
        ("Do colleges prefer the SAT or the ACT?",
         "Neither. U.S. colleges that consider test scores accept both and use the concordance "
         "to compare them, so the choice is about which format suits you."),
    ]


def score_hub(scores, test):
    label = "SAT" if test == "sat" else "ACT"
    path = f"/{test}-scores/"
    links = "".join(f'<li><a href="{path}{s}/">Is a {s} {label} score good?</a></li>'
                    for s in scores)
    body = (f'<nav class="gnav"><a href="/">&larr; {SITE_NAME}</a>'
            f'<a href="/colleges/">Colleges</a></nav>'
            f'<p class="gkicker">{label} score lookup</p>'
            f'<h1>{label} Score Lookup: What Every Score Is Worth</h1>'
            f'<p>Pick a score to see its approximate national percentile, its '
            f'{"ACT" if test == "sat" else "SAT"} equivalent, and exactly which four-year '
            f'colleges it clears, sits inside, or falls short of &mdash; built from official '
            f'federal College Scorecard ranges.</p><ul class="gcols">{links}</ul>'
            f'<div class="gcard"><a class="cta" href="/">Take a free practice test &rarr;</a></div>')
    return path, page(
        path=path,
        title=f"{label} Score Lookup: Percentiles, Colleges & Conversions | {SITE_NAME}",
        description=(f"Look up any {label} score: approximate percentile, "
                     f"{'ACT' if test == 'sat' else 'SAT'} equivalent, and the colleges where "
                     f"it is a strength, in range, or a reach."),
        body=body,
        schema=[breadcrumbs([HOME, (f"{label} scores", path)])])


if __name__ == "__main__":
    main()
