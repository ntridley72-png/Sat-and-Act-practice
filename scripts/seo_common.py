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


def page(*, path, title, description, body, schema, extra_head=""):
    """Render a complete document. `path` is origin-relative and ends with '/'."""
    canonical = ORIGIN + path
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
<link rel="stylesheet" href="/workspace.css">
<link rel="stylesheet" href="/guides/guide.css">
{extra_head}<script type="application/ld+json">{graph}</script>
</head><body data-workspace="exam"><div class="gwrap">
{body}
<p class="gfoot">{SITE_NAME} is a free browser-based SAT and ACT prep app: digital SAT and ACT practice tests, unofficial score calculators, a built-in graphing calculator, college admissions chances from official U.S. Department of Education data, and a scholarship search. <a href="/">Start free practice &rarr;</a></p>
</div></body></html>
"""


def write(out_path, text):
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(text, encoding="utf8")
