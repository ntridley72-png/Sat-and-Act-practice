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
                        faq_schema, load_colleges, load_scholarships, money,
                        num, page, pct, slugify, write)

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
    ], ("Measure", "Value"))

    # --- majors
    majors = ""
    if c.get("maj"):
        items = "".join(f"<li>{e(m)} &mdash; {share}% of bachelor's degrees</li>"
                        for m, share in c["maj"])
        majors = (f"<h2>Most popular majors</h2><ul>{items}</ul>"
                  f"<p>Shares are of bachelor's degrees awarded, so a concentrated list usually "
                  f"signals a college known for those programs.</p>")

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
    if c.get("np"):
        faqs.append((f"How much does {name} cost?",
                     f"Published tuition and fees are {money(c.get('ti'))} in-state and "
                     f"{money(c.get('to'))} out-of-state, but the average first-year student "
                     f"pays a net price of {money(c['np'])} after grant aid."))

    faq_html = "<h2>Frequently asked questions</h2>" + "".join(
        f"<h3>{e(q)}</h3><p>{e(a)}</p>" for q, a in faqs)

    # --- image
    img = ""
    if c.get("img"):
        img = (f'<figure class="gfig"><img src="{e(c["img"])}" alt="{e(name)} campus" '
               f'loading="lazy" decoding="async" width="960" height="540">'
               f'<figcaption class="muted">Photo: {e(c.get("imgA", "Wikimedia Commons"))}</figcaption></figure>')

    related = "".join(
        f'<a href="/colleges/{o["slug"]}/">{e(o["n"])}</a>' for o in c.get("_related", []))
    links = (f'<div class="glinks">'
             f'<a href="/colleges/{slugify(state)}/">Colleges in {e(state)}</a>'
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
            f'{intro}{img}{scores}{sel}{cost}{out}{majors}{cta}{faq_html}{src}{links}')

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

    return path, page(path=path, title=title, description=description, body=body, schema=schema)


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

        if "FUNSAT_ADS" not in html_text:
            html_text = html_text.replace("</head>",
                '<script>window.FUNSAT_ADS={provider:"adsense",client:"ca-pub-7330416749956065",'
                'childDirected:true,slots:{"article-top":"","article-bottom":""}};</script>\n'
                '<script defer src="/ads.js"></script>\n</head>', 1)
            html_text = html_text.replace('<p class="gfoot">',
                '<div class="sponsor-slot" data-ad-slot="article-bottom" hidden></div>\n<p class="gfoot">', 1)

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


# ----------------------------------------------------------------- sitemap

def sitemap(entries):
    parts = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for path, priority, freq in entries:
        parts.append(f"  <url>\n    <loc>{ORIGIN}{path}</loc>\n"
                     f"    <lastmod>{TODAY}</lastmod>\n"
                     f"    <changefreq>{freq}</changefreq>\n"
                     f"    <priority>{priority}</priority>\n  </url>")
    parts.append("</urlset>")
    return "\n".join(parts) + "\n"


# -------------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="public")
    args = ap.parse_args()
    out = (ROOT / args.out).resolve()

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

    write(out / "sitemap.xml", sitemap(entries))
    write(ROOT / "sitemap.xml", sitemap(entries))

    print(f"Generated {len(entries)} URLs into {out}")
    print(f"  colleges: {len(colleges)} profiles + {len(by_state)} state hubs + 1 hub")
    print(f"  scholarships: {len(items)} profiles + 1 hub")
    print(f"  guides: {len(GUIDE_TITLES)}")
    print(f"  score lookups: {len(sat_scores)} SAT + {len(act_scores)} ACT + 2 hubs")



# ------------------------------------------------------- score lookup pages
# "is a 1350 SAT score good", "what colleges can I get into with a 28 ACT" —
# high-volume long-tail that we can answer from the 354-college dataset rather
# than with filler.

# Approximate national percentile anchors; interpolated between. Labelled as an
# estimate on every page because the official table shifts each cohort.
SAT_PCTL = [(400, 1), (600, 3), (800, 9), (900, 19), (1000, 33), (1050, 41),
            (1100, 51), (1200, 68), (1300, 84), (1400, 93), (1500, 98), (1600, 99)]


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
            f'official concordance.</p>'
            f'<h2>What a {score} means for your college list</h2>'
            f'{table([("Approximate national percentile", f"{p}th"),
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
            + (f'<a href="{crumb_path}{score - 10 if test == "sat" else score - 1}/">'
               f'{score - 10 if test == "sat" else score - 1} {label}</a>')
            + (f'<a href="{crumb_path}{score + 10 if test == "sat" else score + 1}/">'
               f'{score + 10 if test == "sat" else score + 1} {label}</a>')
            + '<a href="/guides/what-is-a-good-sat-score/">What is a good SAT score?</a>'
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
