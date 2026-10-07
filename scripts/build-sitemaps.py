"""Build the segmented sitemaps from what was actually generated.

Runs last in the build, scans every indexable HTML document under public/,
and records a content hash + a genuine modification date per URL in
seo-lastmod.json (committed). A page's lastmod only moves when its rendered
content actually changes; unchanged pages keep their date across rebuilds.
Pages marked noindex are excluded. The sitemap index keeps the stable URL
/sitemap.xml.
"""
import argparse
import hashlib
import json
import re
from datetime import date
from pathlib import Path

ORIGIN = "https://funsat.bid"
MANIFEST = "seo-lastmod.json"
TODAY = date.today().isoformat()

SEGMENTS = {
    "colleges": (("colleges", "college-costs"), "0.7", "monthly"),
    "sat-act": (("sat-scores", "act-scores", "sat-act-conversion"), "0.7", "monthly"),
    "scholarships": (("scholarships",), "0.7", "monthly"),
    "guides": (("guides",), "0.7", "monthly"),
    "games": (("games", "unblocked-games"), "0.6", "monthly"),
}
CORE_PRIORITY = {"": "1.0"}


def segment_for(path):
    top = path.strip("/").split("/")[0]
    for name, (tops, _, _) in SEGMENTS.items():
        if top in tops:
            return name
    if path in ("/sat-practice-test/", "/act-practice-test/", "/score-calculator/"):
        return "sat-act"
    return "core"


def priority_for(path, seg):
    if path == "/":
        return "1.0"
    if path in ("/sat-practice-test/", "/act-practice-test/", "/score-calculator/", "/games/", "/unblocked-games/"):
        return "0.9"
    if path in ("/free-test-prep/", "/sat-practice/", "/act-practice/", "/score-calculators/", "/colleges-by-state/", "/college-admissions/"):
        return "0.8"
    return SEGMENTS.get(seg, (None, "0.6", None))[1]


def freq_for(seg):
    return {"core": "weekly", "guides": "monthly", "games": "monthly"}.get(seg, "monthly")


def indexable_pages(out):
    pages = []
    for f in sorted(out.rglob("index.html")):
        rel = f.relative_to(out)
        url = "/" + str(rel.parent).replace(".", "").strip("/") + "/" if str(rel.parent) != "." else "/"
        url = re.sub(r"/+", "/", url)
        html = f.read_bytes()
        text = html.decode("utf8", "replace")
        if re.search(r'<meta name="robots" content="[^"]*noindex', text):
            continue
        pages.append((url, html))
    return pages


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="public")
    args = ap.parse_args()
    out = Path(args.out)
    manifest_path = Path(MANIFEST)
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    pages = indexable_pages(out)
    segs = {}
    changed = 0
    for url, html in pages:
        digest = hashlib.sha256(html).hexdigest()[:16]
        record = manifest.get(url)
        if record and record.get("h") == digest:
            date_value = record.get("d", TODAY)
        else:
            date_value = TODAY  # content genuinely changed (or first sight) in this build
            changed += 1
        manifest[url] = {"h": digest, "d": date_value}
        seg = segment_for(url)
        segs.setdefault(seg, []).append((url, priority_for(url, seg), freq_for(seg), date_value))
    # Drop manifest entries whose pages no longer exist.
    for url in [u for u in manifest if u not in {p[0] for p in pages}]:
        manifest.pop(url)
    manifest_path.write_text(json.dumps(manifest, indent=1, sort_keys=True))

    (out / "sitemaps").mkdir(parents=True, exist_ok=True)
    index_lines = ['<?xml version="1.0" encoding="UTF-8"?>',
                   '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for name in sorted(segs):
        lines = ['<?xml version="1.0" encoding="UTF-8"?>',
                 '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
        for url, prio, freq, date_value in sorted(segs[name]):
            lines.append(f"  <url>\n    <loc>{ORIGIN}{url}</loc>\n    <lastmod>{date_value}</lastmod>\n"
                         f"    <changefreq>{freq}</changefreq>\n    <priority>{prio}</priority>\n  </url>")
        lines.append("</urlset>")
        xml = "\n".join(lines) + "\n"
        (out / "sitemaps" / f"{name}.xml").write_text(xml)
        newest = max(d for _, _, _, d in segs[name])
        index_lines.append(f"  <sitemap>\n    <loc>{ORIGIN}/sitemaps/{name}.xml</loc>\n    <lastmod>{newest}</lastmod>\n  </sitemap>")
    index_lines.append("</sitemapindex>")
    index_xml = "\n".join(index_lines) + "\n"
    (out / "sitemap.xml").write_text(index_xml)
    Path("sitemap.xml").write_text(index_xml)
    print(f"sitemaps: {len(pages)} indexable pages in {len(segs)} segments ({changed} changed since last build)")
    for name in sorted(segs):
        print(f"  {name}: {len(segs[name])}")


if __name__ == "__main__":
    main()
