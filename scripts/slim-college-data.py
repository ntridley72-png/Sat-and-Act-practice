#!/usr/bin/env python3
"""Write the browser copy of college-data.js without fields the app never reads.

The repository copy stays complete (static page builds, provenance tests and audits read it). The deployed copy drops:
per-metric provenance codes (shown only on static pages), the duplicate photo URL (`src` equals `u`), the build-only
photo fingerprint, the precomposed credit line (the app builds it from credit + license), the first-photo shortcut
fields when a gallery exists, and Wikimedia's tracking query string on photo and file-page URLs.
Usage: python3 scripts/slim-college-data.py college-data.js public/college-data.js
"""
import json, re, sys

UTM = re.compile(r"\?utm_[^\"]*$")


def clean(url):
    return UTM.sub("", url) if isinstance(url, str) else url


def slim(data):
    for c in data["colleges"]:
        c.pop("prov", None)
        imgs = c.get("imgs") or []
        if imgs:
            for k in ("img", "imgA", "imgL"):
                c.pop(k, None)
        for p in imgs:
            if p.get("src") == p.get("u"):
                p.pop("src", None)
            for k in ("fp", "a"):
                if k != "a" or p.get("credit"):
                    p.pop(k, None)
            for k in ("u", "l", "src"):
                if k in p:
                    p[k] = clean(p[k])
        for k in ("img", "imgL"):
            if k in c:
                c[k] = clean(c[k])
    return data


def main(src, dst):
    text = open(src, encoding="utf-8").read()
    head, body = text.split("window.COLLEGE_DATA = ", 1)
    data = slim(json.loads(body.rstrip().rstrip(";")))
    with open(dst, "w", encoding="utf-8") as f:
        f.write(head + "window.COLLEGE_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")


if __name__ == "__main__":
    main(*sys.argv[1:3])
