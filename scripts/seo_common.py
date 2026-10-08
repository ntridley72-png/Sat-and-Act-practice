"""Shared helpers for the static SEO page generator.

Everything that needs the public origin reads it from scripts/site.json, so a
domain move is a one-line edit there plus the route in wrangler.toml.
"""
import html
import json
import os
import re
import unicodedata
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_CFG = json.loads((ROOT / "scripts" / "site.json").read_text(encoding="utf8"))

ORIGIN = os.environ.get("SITE_ORIGIN", _CFG["origin"]).rstrip("/")
SITE_NAME = _CFG["name"]
TODAY = date.today().isoformat()

STATES = {
    "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California",
    "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "DC": "District of Columbia",
    "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois",
    "IN": "Indiana", "IA": "Iowa", "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana",
    "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota",
    "MS": "Mississippi", "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada",
    "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York",
    "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma",
    "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
    "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont",
    "VA": "Virginia", "WA": "Washington", "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
    "PR": "Puerto Rico", "GU": "Guam", "VI": "U.S. Virgin Islands",
}

e = html.escape

# ----------------------------------------------------------------------- ads
# One definition of the content-page ad setup, shared by page(), the guide
# rewriter and the landing-page copier so the three never drift apart.
#
# Slot ids come from the AdSense account. An empty id makes ads.js leave that
# slot hidden, so an unconfigured unit degrades silently rather than reserving
# blank space. Fill ARTICLE_MID and ANCHOR in once their units exist.
# The @font-face rules live in workspace.css, so a browser only discovers the
# font files after that stylesheet parses. Preloading the text face moves it onto
# the critical path and keeps LCP from waiting a round trip. Only the variable
# text face is preloaded: the mono cuts carry figures, which can swap in late.
FONT_PRELOAD = (
    '<link rel="preload" as="font" type="font/woff2" '
    'href="/fonts/archivo-400-700.woff2" crossorigin>'
)


# Adsterra units shared by every generated page. The native widget mounts into
# one container that migrates to the visible in-content slot (see ads.js), so
# article-top/mid/bottom all point at the same unit instead of stacking three.
AD_UNITS = (
    '{native:{script:"https://bauval.org/21/ba6d22b48d5d42c6cd1add3ad5e6c681",'
    'container:"container-ba6d22b48d5d42c6cd1add3ad5e6c681"},'
    'sky:{key:"4e48d9998406ce142c41865c66a4325",'
    'script:"https://bauval.org/22/4e48d9998406ce142c41865c66a4325",'
    'width:160,height:600},squares:[]}'
)
AD_SLOTS = {
    "article-top": '{kind:"native"}',
    "article-mid": '{kind:"native"}',
    "article-bottom": '{kind:"native"}',
    "article-grid": '{kind:"grid"}',
}
AD_CONFIG = (
    '<script>window.FUNSAT_ADS={provider:"adsterra",units:' + AD_UNITS + ',slots:{'
    + ",".join(f'"{k}":{v}' for k, v in AD_SLOTS.items())
    + '}};</script>\n<script defer src="/ads.js"></script>'
)


def ad_slot(name):
    return f'<div class="sponsor-slot" data-ad-slot="{name}" hidden></div>'


def inject_fonts(html_text):
    """Preload the self-hosted text face on a hand-written content page."""
    if "archivo-400-700.woff2" in html_text:
        return html_text
    return html_text.replace("</head>", FONT_PRELOAD + "\n</head>", 1)


def inject_ads(html_text):
    """Add the ad config and slots to a hand-written content page (a guide or a
    landing page). No-op if the page already declares FUNSAT_ADS, so the build
    stays idempotent. Mirrors page() so hand-written and generated pages carry
    the same units in the same places."""
    if "FUNSAT_ADS" in html_text:
        return html_text
    html_text = html_text.replace("</head>", AD_CONFIG + "\n</head>", 1)
    # Grid sits above the bottom unit: grid, then article-bottom, then gfoot.
    html_text = html_text.replace('<p class="gfoot">', ad_slot("article-grid") + '\n<p class="gfoot">', 1)
    # Bottom unit above the footer line, anchor last so it closes over the page.
    html_text = html_text.replace('<p class="gfoot">',
                                  ad_slot("article-bottom") + '\n<p class="gfoot">', 1)
    # No anchor unit ships with the current network config; the old sticky
    # slot markup is gone rather than left permanently unfilled.
    # In-content units go after the headline, never before it: a unit above the <h1>
    # pushes the content the reader came for below the fold and reads as an
    # interstitial. Everything is measured from the end of the <h1>.
    start = html_text.find("</h1>")
    if start == -1:
        return html_text
    start += len("</h1>")
    head, body = html_text[:start], html_text[start:]
    for marker in ("</table>", "</p>"):
        placed = _insert_after_nth(body, ad_slot("article-top"), marker, 1)
        if placed:
            body = placed
            break
    else:
        return html_text
    # A second unit only once there is real content below the first; the 8th
    # paragraph keeps the two from stacking on a short guide.
    body = _insert_after_nth(body, ad_slot("article-mid"), "</p>", 8) or body
    return head + body


def slugify(text):
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text).strip("-").lower()
    return re.sub(r"-{2,}", "-", text)


def money(n):
    return f"${n:,.0f}" if isinstance(n, (int, float)) and n else "Not reported"


def pct(n, digits=1):
    return f"{n:.{digits}f}%" if isinstance(n, (int, float)) and n is not None else "Not reported"


def num(n):
    return f"{n:,.0f}" if isinstance(n, (int, float)) and n is not None else "Not reported"


def load_colleges():
    src = (ROOT / "college-data.js").read_text(encoding="utf8")
    blob = src[src.index("{", src.index("window.COLLEGE_DATA")):].rstrip().rstrip(";")
    data = json.loads(blob)
    colleges = data["colleges"]
    # Slugs must be stable and unique: disambiguate collisions with the state.
    counts = {}
    for c in colleges:
        counts[slugify(c["n"])] = counts.get(slugify(c["n"]), 0) + 1
    seen = set()
    for c in colleges:
        base = slugify(c["n"])
        slug = base if counts[base] == 1 else f"{base}-{c['st'].lower()}"
        while slug in seen:
            slug = f"{slug}-{c['id']}"
        seen.add(slug)
        c["slug"] = slug
    return data, colleges


def load_scholarships():
    """The scholarship catalog is hand-authored JS, not JSON. Pull the object
    literal out with Node so we never drift from what the app actually loads."""
    import subprocess
    script = (
        "globalThis.window=globalThis;"
        f"require({json.dumps(str(ROOT / 'scholarships-data.js'))});"
        "process.stdout.write(JSON.stringify(window.SCHOLARSHIP_DATA));"
    )
    out = subprocess.run(["node", "-e", script], capture_output=True, text=True, check=True).stdout
    data = json.loads(out)
    seen = set()
    for s in data["scholarships"]:
        slug = slugify(s.get("id") or s["n"])
        while slug in seen:
            slug = f"{slug}-2"
        seen.add(slug)
        s["slug"] = slug
    return data


def breadcrumbs(trail):
    """trail: list of (name, path) — path is origin-relative, last item is the page."""
    return {
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": i + 1, "name": name, "item": ORIGIN + path}
            for i, (name, path) in enumerate(trail)
        ],
    }


def faq_schema(pairs):
    return {
        "@type": "FAQPage",
        "mainEntity": [
            {"@type": "Question", "name": q,
             "acceptedAnswer": {"@type": "Answer", "text": a}}
            for q, a in pairs
        ],
    }


def _insert_after_nth(body, slot, marker, n):
    """Insert `slot` after the nth occurrence of `marker`, or return None."""
    i = -1
    for _ in range(n):
        i = body.find(marker, i + 1)
        if i == -1:
            return None
    i += len(marker)
    return body[:i] + slot + body[i:]


def _insert_midroll(body):
    """Place the in-article units inside the content: the first after the opening
    table (falling back to the first paragraph), the second further down so the
    two never sit next to each other. Short pages keep a single unit.

    Everything is measured from the end of the <h1>, because some bodies open with
    breadcrumbs or a kicker paragraph and a unit above the headline pushes the
    content the reader came for below the fold."""
    start = body.find("</h1>")
    start = start + len("</h1>") if start != -1 else 0
    head, rest = body[:start], body[start:]
    for marker in ("</table>", "</p>"):
        placed = _insert_after_nth(rest, ad_slot("article-top"), marker, 1)
        if placed:
            rest = placed
            break
    else:
        return body + ad_slot("article-top")
    # A second unit only earns its place when there is real content below the
    # first one; the 6th paragraph keeps it clear of the top unit.
    return head + (_insert_after_nth(rest, ad_slot("article-mid"), "</p>", 6) or rest)


def page(*, path, title, description, body, schema, extra_head=""):
    """Render a complete document. `path` is origin-relative and ends with '/'."""
    canonical = ORIGIN + path
    midroll_body = _insert_midroll(body)
    graph = json.dumps({"@context": "https://schema.org", "@graph": schema},
                       separators=(",", ":"), ensure_ascii=False)
    return f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{e(title)}</title>
<meta name="description" content="{e(description)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="{canonical}">
<meta property="og:type" content="article">
<meta property="og:url" content="{canonical}">
<meta property="og:site_name" content="{SITE_NAME}">
<meta property="og:title" content="{e(title)}">
<meta property="og:description" content="{e(description)}">
<meta property="og:image" content="{ORIGIN}/social-card.png?v=2">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
{FONT_PRELOAD}
<link rel="stylesheet" href="/workspace.css">
<link rel="stylesheet" href="/guides/guide.css">
{AD_CONFIG}
{extra_head}<script type="application/ld+json">{graph}</script>
</head><body data-workspace="exam"><div class="gwrap">
{midroll_body}
<div class="sponsor-slot" data-ad-slot="article-bottom" hidden></div>
<p class="gfoot">{SITE_NAME} is a free browser-based SAT and ACT prep app: digital SAT and ACT practice tests, unofficial score calculators, a built-in graphing calculator, college admissions chances from official U.S. Department of Education data, and a scholarship search. <a href="/">Start free practice &rarr;</a></p>
<nav class="gfootnav" aria-label="Site sections">
<a href="/free-test-prep/">Free test prep</a><a href="/sat-practice/">SAT practice</a><a href="/act-practice/">ACT practice</a><a href="/score-calculators/">Score calculators</a><a href="/sat-scores/">SAT scores</a><a href="/act-scores/">ACT scores</a><a href="/college-admissions/">College admissions</a><a href="/colleges-by-state/">Colleges by state</a><a href="/college-costs/">College costs</a><a href="/college-comparisons/">Compare colleges</a><a href="/scholarships/">Scholarships</a><a href="/application-planning/">Application planning</a><a href="/unblocked-games/">Study-break games</a><a href="/about/">About</a><a href="/methodology/">Methodology</a><a href="/privacy/">Privacy</a><a href="/contact/">Contact</a><a href="/corrections/">Corrections</a>
</nav>
</div></body></html>
"""


def write(out_path, text):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(text, encoding="utf8")
