#!/usr/bin/env python3
"""Find each college's official directory pages: student organizations, Greek
life, athletics, events, housing & dining, and the student newspaper.

Discovery order per college:
  1. the college's own sitemap.xml / sitemap index (robust against JS navs)
  2. a short list of common official paths and subdomains, each verified

Only URLs on the college's own domain (or a subdomain) are recorded, and a
probe is accepted only when it answers with a real page. Everything found is
cached in scripts/.cache/college-links.json and merged into college-data.js by
scripts/build-college-data.py at bundle-write time, so every refresh keeps it.
"""
import concurrent.futures
import json
import os
import re
import sys
import threading
import time
import urllib.parse
import urllib.request
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUNDLE = os.path.join(ROOT, "college-data.js")
CACHE = os.path.join(ROOT, "scripts", ".cache")
CACHE_PATH = os.path.join(CACHE, "college-links.json")
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36 funsat.bid college links"}

THROTTLE_LOCK = threading.Lock()
LAST_CALL = [0.0]
THROTTLE = float(os.environ.get("LINKS_THROTTLE") or "0.35")

CATS = ("clubs", "greek", "athletics", "events", "housing", "paper")

SITEMAP_PATTERNS = {
    "clubs": r"student-?(organizations?|activities|involvement)|/involvement|/clubs|get-?involved|student-life",
    "greek": r"greek-?life|fraternity|sorority|/fsl|greeklife",
    "athletics": r"athletics|/sports",
    "events": r"/events|/calendar|traditions|homecoming",
    "housing": r"housing|residence-?life|residential|/dining",
    "paper": r"student-?(newspaper|media)|/newspaper",
}

PROBES = {
    "clubs": ["/student-life", "/student-activities", "/student-involvement", "/involvement", "/student-organizations", "/clubs", "/campus-life", "/get-involved", "/student-affairs", "/studentaffairs"],
    "greek": ["/greek-life", "/fsl", "/fraternity-and-sorority-life", "/fraternity-sorority-life", "/greeklife", "/greek"],
    "athletics": ["/athletics", "/sports"],
    "events": ["/events", "/calendar", "/events-calendar", "/campus-events"],
    "housing": ["/housing", "/residence-life", "/housing-dining", "/residential-life", "/dining"],
    "paper": [],
}

SUBDOMAIN_PROBES = {
    "greek": ["greeklife", "fsl", "greek"],
    "athletics": ["athletics", "gohuskies", "gopack"],
    "clubs": ["involvement", "studentactivities", "osl", "studentlife"],
    "paper": ["newspaper", "studentmedia"],
}

# Paths that look like results/pages rather than a hub and should lose ranking.
BAD_HINTS = re.compile(r"(/news/|/article|/story|/20\d\d/|/jobs?/|/apply|\.pdf$|human[-_]?resources|fellowship|benefits|finaid|financial-?aid|tuition|cost)", re.I)


def throttle():
    with THROTTLE_LOCK:
        gap = LAST_CALL[0] + THROTTLE - time.time()
        if gap > 0:
            time.sleep(gap)
        LAST_CALL[0] = time.time()


def get(url, timeout=20, method="GET", limit=2_000_000):
    throttle()
    req = urllib.request.Request(url, headers=UA, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        if method == "HEAD":
            return resp.status, ""
        return resp.status, resp.read(limit).decode("utf-8", "replace")


def registrable(host):
    parts = host.split(".")
    return ".".join(parts[-2:]) if len(parts) >= 2 else host


def base_of(college):
    raw = str(college.get("url") or "").strip()
    if not raw:
        return None, None
    if not raw.startswith(("http://", "https://")):
        raw = "https://" + raw.lstrip("/")
    parsed = urllib.parse.urlparse(raw)
    host = (parsed.hostname or "").lower()
    if host.startswith("www."):
        host = host[4:]
    if not host:
        return None, None
    return "https://" + host, registrable(host)


def sitemap_urls(base):
    urls, seen = [], set()

    def pull(sm, depth=0):
        if sm in seen or depth > 2 or len(urls) > 8000:
            return
        seen.add(sm)
        try:
            status, xml = get(sm)
        except Exception:
            return
        locs = re.findall(r"<loc>\s*([^<\s]+)\s*</loc>", xml)
        children = [l for l in locs if re.search(r"sitemap.*\.xml", l, re.I)]
        if children and not re.search(r"<urlset", xml, re.I):
            for child in children[:40]:
                pull(child, depth + 1)
        else:
            urls.extend(locs)

    pull(base + "/sitemap.xml")
    if not urls:
        pull(base + "/sitemap_index.xml")
    if not urls:
        # Many sites only declare their sitemaps in robots.txt.
        try:
            _, robots = get(base + "/robots.txt", limit=50000)
            for line in robots.splitlines():
                if line.lower().startswith("sitemap:"):
                    pull(line.split(":", 1)[1].strip())
        except Exception:
            pass
    return urls


def verify(url):
    for method in ("HEAD", "GET"):
        try:
            status, _ = get(url, timeout=15, method=method, limit=8000)
            if 200 <= status < 400:
                return True
            if status in (404, 410):
                return False
        except urllib.error.HTTPError as exc:
            if exc.code in (404, 410):
                return False
            if exc.code in (403, 405) and method == "HEAD":
                continue
            return False
        except Exception:
            continue
    return False


def same_official(url, host, reg):
    try:
        lh = urllib.parse.urlparse(url).hostname.lower().replace("^www\\.", "")
    except Exception:
        return False
    return lh == host or lh == reg or lh.endswith("." + reg) or lh.endswith("." + host)


def rank(urls, cat, host, reg):
    pat = re.compile(SITEMAP_PATTERNS[cat], re.I)
    hits = [u for u in urls if pat.search(u) and not BAD_HINTS.search(u) and same_official(u, host, reg)]
    hits.sort(key=lambda u: (u.count("/"), len(u)))
    return hits


def probe_candidates(base, reg, cat):
    out = []
    for path in PROBES.get(cat, []):
        out.append((base + path, "path"))
    for sub in SUBDOMAIN_PROBES.get(cat, []):
        out.append(("https://" + sub + "." + reg + "/", "sub"))
    return out


def discover(college):
    base, reg = base_of(college)
    if not base:
        return {"checked": date.today().isoformat(), "links": {}}
    links = {}
    # ---- sitemap pass
    try:
        urls = sitemap_urls(base)
    except Exception:
        urls = []
    for cat in CATS:
        for cand in rank(urls, cat, host, reg)[:3]:
            cand = cand.replace("http://", "https://", 1)
            if verify(cand):
                links[cat] = cand
                break
    # ---- probes for what is still missing
    todo = [(cat, url, kind) for cat in CATS if cat not in links
            for url, kind in probe_candidates(base, reg, cat)]
    for cat, url, kind in todo:
        if cat in links:
            continue
        try:
            status, body = get(url, timeout=15, limit=20000)
        except Exception:
            continue
        if not (200 <= status < 400):
            continue
        # A probe must look like a real page of that topic, not a soft 404.
        text = re.sub(r"<[^>]+>", " ", body).lower()
        keyword = {"clubs": "student", "greek": "greek", "athletics": "athlet",
                   "events": "event", "housing": "hous", "paper": "news"}[cat]
        if keyword in text:
            links[cat] = url.replace("http://", "https://", 1)
    return {"checked": date.today().isoformat(), "links": links}


def load_bundle():
    src = open(BUNDLE, encoding="utf8").read()
    m = re.search(r"window\.COLLEGE_DATA\s*=\s*(\{.*\})\s*;?\s*$", src, re.S)
    data = json.loads(m.group(1))
    return data["colleges"]


def main():
    os.makedirs(CACHE, exist_ok=True)
    cache = json.load(open(CACHE_PATH)) if os.path.exists(CACHE_PATH) else {}
    colleges = load_bundle()

    only = {n.strip().lower() for n in (os.environ.get("LINKS_ONLY") or "").split(",") if n.strip()}
    force = os.environ.get("LINKS_FORCE") == "1"
    todo = []
    for c in colleges:
        if only and c["n"].lower() not in only:
            continue
        entry = cache.get(str(c["id"]))
        if entry and not force:
            continue
        todo.append(c)

    print("colleges: %d total, %d to discover, %d cached" % (len(colleges), len(todo), len(cache)), flush=True)
    lock = threading.Lock()
    done = [0]

    def work(c):
        try:
            info = discover(c)
        except Exception as exc:
            info = {"checked": date.today().isoformat(), "links": {}, "error": str(exc)[:120]}
        with lock:
            cache[str(c["id"])] = info
            done[0] += 1
            if done[0] % 25 == 0:
                print("links: %d/%d colleges processed" % (done[0], len(todo)), flush=True)
                json.dump(cache, open(CACHE_PATH, "w"))

    with concurrent.futures.ThreadPoolExecutor(max_workers=int(os.environ.get("LINKS_WORKERS") or 6)) as pool:
        list(pool.map(work, todo))
    json.dump(cache, open(CACHE_PATH, "w"))

    counts = {cat: 0 for cat in CATS}
    any_link = 0
    for c in colleges:
        info = cache.get(str(c["id"])) or {}
        found = info.get("links") or {}
        if found:
            any_link += 1
        for cat in CATS:
            if found.get(cat):
                counts[cat] += 1
    print("colleges with at least one direct link: %d/%d" % (any_link, len(colleges)))
    print("per category:", json.dumps(counts))


if __name__ == "__main__":
    main()
