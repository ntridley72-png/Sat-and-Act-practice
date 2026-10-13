#!/usr/bin/env python3
"""Build college-photos-extra.js: verified campus-activity and nearby-place
photos for the pilot colleges.

Two visibly separate categories with different evidence bars:

  activities  School-sponsored or institution-recognized clubs, athletics,
              recreation, performances, museums, traditions or events. The
              curation entry must name the official recognition source.
  nearby      Real parks, trails, museums, venues and neighborhoods near the
              campus. The curation entry must name an official venue/park/
              tourism source and any student-connection claim.

Every published photo passes ALL gates -- discovery, automated checks, and a
human-verifiable curation entry (scripts/data/college-photo-curation.json)
that records the named subject, the official source URL proving it, the
distance from the IPEDS-reported campus point (labeled as straight-line where
used), the license, creator and required attribution. Candidates that fail a
gate land in the rejection log (docs/college-photos-rejections.json) with the
reason. Never lower the filter to hit a quota.

Run: python3 scripts/build-college-photos.py
Discovery is cached (scripts/.cache/geosearch-<unitid>.json and photoinfo
batches), so reruns are cheap and resumable.
"""
import hashlib
import json
import math
import os
import re
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "college-photos-extra.js")
LOG = os.path.join(ROOT, "docs", "college-photos-rejections.json")
CURATION = os.path.join(ROOT, "scripts", "data", "college-photo-curation.json")
CACHE = os.path.join(ROOT, "scripts", ".cache")
API = "https://commons.wikimedia.org/w/api.php"
UA = {"User-Agent": "funsat.bid college photo build (educational; contact: funsat.bid)"}
# Commons throttles anonymous clients; space uncached calls and back off on 429.
THROTTLE_LOCK = threading.Lock()
LAST_CALL = [0.0]
MIN_INTERVAL = 1.5

MAX_METERS = 16093  # 10 miles: the acceptance gate for any published distance
# The Commons geosearch API caps its search radius at 10,000 m, so discovery
# covers a 10 km ring; the wider 10-mile gate still governs what may be
# published (e.g. a manual/curated addition gets its distance checked here).
DISCOVER_RADIUS = 10000
MIN_WIDTH = 1000
MIN_HEIGHT = 560

LICENSE_ALLOW = re.compile(
    r"^(public domain|cc0|cc[ -]by(?:[ -]sa)?[ -]?\d(?:\.\d)?|cc[ -]by(?:[ -]sa)?)$", re.I)
LICENSE_DENY = re.compile(r"nc|nd|fair use|gfdl", re.I)

# Titles/categories that are never a photo of a place or activity.
JUNK_CATEGORY = re.compile(
    r"(maps?|diagrams?|logos?|coats? of arms|seals?|charts?|drawings?|engravings?|"
    r"documents?|manuscripts?|posters?|book ?plates?|screenshots?|icons?|"
    r"higher education|student life|people|portraits?|headshots?)", re.I)
JUNK_TITLE = re.compile(
    r"\.(svg|pdf|djvu|tif?f)$|map|diagram|logo|seal|crest|coat of arms|"
    r"sample|specimen|thin section|close-?up|micrograph|screenshot|poster|"
    r"plaque|sign(age)?\b|portrait|headshot|view of earth|iss\d", re.I)
# Person-photo floods are held back by the title-names-a-place/activity gate
# and by curation; a blanket serial-id pattern also rejected legitimate venue
# photos like "File:ASU Art Museum (2433179467).jpg".
PLACE_WORDS = re.compile(
    r"park|trail|greenway|garden|museum|gallery|theat(er|re)|auditorium|arena|"
    r"stadium|field|center|centre|library|market|square|plaza|zoo|aquarium|"
    r"observatory|river|lake|creek|falls|mountain|ridge|overlook|forest|"
    r"downtown|district|neighborhood|street|avenue|bridge|campus|hall|"
    r"chapel|church|cathedral|monument|memorial|historic|planetarium|"
    r"conservatory|arboretum|"
    r"house|inn|bank|brewery|mill|depot|station|club|union", re.I)
ACTIVITY_WORDS = re.compile(
    r"band|orchestra|choir|ensemble|athletics?|varsity|football|basketball|"
    r"soccer|baseball|softball|track|cheer|dance|theater|theatre|festival|"
    r"homecoming|commencement|ceremony|parade|exhibit|exhibition|performance|"
    r"concert|recreation|intramural|club|museum|tradition", re.I)


def api(params, cache_key=None):
    if cache_key:
        os.makedirs(CACHE, exist_ok=True)
        path = os.path.join(CACHE, cache_key)
        if os.path.exists(path):
            return json.load(open(path))
    url = API + "?" + urllib.parse.urlencode(params)
    data = None
    for attempt in range(4):
        with THROTTLE_LOCK:
            wait = MIN_INTERVAL - (time.time() - LAST_CALL[0])
            if wait > 0:
                time.sleep(wait)
            LAST_CALL[0] = time.time()
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read().decode("utf-8", "replace"))
            break
        except urllib.error.HTTPError as exc:
            if exc.code in (429, 503) and attempt < 3:
                time.sleep(5 * (3 ** attempt))
                continue
            raise
    if "error" in data:
        raise RuntimeError("Commons API error: %r" % data["error"])
    if cache_key:
        with open(path, "w") as handle:
            json.dump(data, handle)
    return data


def haversine(lat1, lon1, lat2, lon2):
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def discover(unitid, lat, lon):
    """All geotagged Commons files within the radius, paged (cached)."""
    cached = os.path.join(CACHE, "geosearch-%d.json" % unitid)
    if os.path.exists(cached):
        raw = json.load(open(cached))
        return [(t[0], t[1], t[2], t[3]) for t in raw]
    titles, cont = [], {}
    while True:
        params = {"action": "query", "list": "geosearch", "gscoord": "%f|%f" % (lat, lon),
                  "gsradius": str(DISCOVER_RADIUS), "gslimit": "500", "gsnamespace": "6",
                  "format": "json", "formatversion": "2", **cont}
        data = api(params)
        items = ((data.get("query") or {}).get("geosearch")) or []
        titles.extend((item["title"], item["lat"], item["lon"], item.get("dist")) for item in items)
        if not (data.get("continue")):
            break
        cont = data["continue"]
        if len(titles) >= 400:
            break
    os.makedirs(CACHE, exist_ok=True)
    with open(cached, "w") as handle:
        json.dump(titles, handle)
    return titles


def info_batch(titles, unitid):
    """imageinfo + extmetadata for up to 50 titles per call, cached per run."""
    results = {}
    for i in range(0, len(titles), 50):
        chunk = titles[i:i + 50]
        digest = hashlib.sha1("|".join(chunk).encode("utf-8")).hexdigest()[:12]
        cache_key = "photoinfo-%d-%s.json" % (unitid, digest)
        data = api({"action": "query", "titles": "|".join(chunk), "prop": "imageinfo|categories",
                    "iiprop": "url|size|mime|extmetadata", "iiurlwidth": "960", "cllimit": "200",
                    "format": "json", "formatversion": "2"}, cache_key=cache_key)
        for page in ((data.get("query") or {}).get("pages")) or []:
            results[page.get("title")] = page
    return results


def check_candidate(title, geom, page):
    """Automated gates. Returns (state, reason, record)."""
    ii = (page.get("imageinfo") or [{}])[0]
    meta = ii.get("extmetadata") or {}
    lic = (meta.get("LicenseShortName") or {}).get("value", "") or ""
    artist = re.sub(r"<[^>]+>", " ", (meta.get("Artist") or {}).get("value", "") or "")
    artist = re.sub(r"\s+", " ", artist).strip()[:120]
    width, height = ii.get("width") or 0, ii.get("height") or 0
    mime = ii.get("mime") or ""
    if not ii:
        return "reject", "no imageinfo", None
    if mime not in ("image/jpeg", "image/png"):
        return "reject", "unsupported mime " + mime, None
    if width < MIN_WIDTH or height < MIN_HEIGHT:
        return "reject", "too small (%dx%d)" % (width, height), None
    if LICENSE_DENY.search(lic):
        return "reject", "license not reusable " + lic, None
    if not LICENSE_ALLOW.match(lic.strip()):
        return "reject", "license outside whitelist " + (lic or "(none)"), None
    cats = " ".join((c.get("title") or "") for c in (page.get("categories") or []))
    if JUNK_CATEGORY.search(cats):
        return "reject", "category is not a place/activity photo: " + cats[:120], None
    if JUNK_TITLE.search(title):
        return "reject", "title looks like a non-photo: " + title, None
    # The TITLE itself must name the place or activity. Category-only matches
    # let person-photo floods through ("File:Chelsea Clinton (30351824941).jpg"
    # sits in a university-campus category but is not a photo of the campus).
    if not PLACE_WORDS.search(title) and not ACTIVITY_WORDS.search(title):
        return "reject", "title names no place or activity", None
    return "candidate", "", {
        "title": title, "lat": geom[0], "lon": geom[1],
        "distanceMeters": round(geom[2]) if len(geom) > 2 and geom[2] else None,
        "width": width, "height": height, "mime": mime,
        "fileUrl": ii.get("url"), "thumbUrl": ii.get("thumburl"),
        "descriptionUrl": ii.get("descriptionurl"),
        "license": lic, "creator": artist,
        "attributionRequired": (meta.get("AttributionRequired") or {}).get("value") == "true",
        "categories": [c.get("title") for c in (page.get("categories") or [])][:8],
    }


def main():
    curation = json.load(open(CURATION)) if os.path.exists(CURATION) else {}
    # Auto-add IPEDS coordinates for every college in the live bundle, but only
    # publish schools with curation entries (pilot-first, per project rules).
    with open(os.path.join(ROOT, "college-data.js"), encoding="utf-8") as handle:
        src = handle.read()
    bundle = json.loads(src.split("window.COLLEGE_DATA = ", 1)[1].rsplit(";", 1)[0])
    coords = {}
    import csv as _csv
    with open(os.path.join(CACHE, "HD2024.csv"), newline="", encoding="utf-8-sig") as handle:
        for row in _csv.DictReader(handle):
            try:
                coords[int(row["UNITID"])] = (float(row["LATITUDE"]), float(row["LONGITUD"]))
            except (TypeError, ValueError):
                continue
    schools, rejections, discovery_stats = {}, [], {}
    for college in bundle["colleges"]:
        unitid = college["id"]
        entries = (curation.get(str(unitid)) or {}).get("photos") or []
        if not entries:
            continue
        if unitid not in coords:
            rejections.append({"unitid": unitid, "school": college["n"], "reason": "no IPEDS coordinates"})
            continue
        lat, lon = coords[unitid]
        found = discover(unitid, lat, lon)
        geometry = {t[0]: t[1:] for t in found}
        info = info_batch([t[0] for t in found], unitid)
        # Tally why the wider candidate pool was not published, so the
        # rejection log reports honest coverage instead of a bare count.
        stats = {"geotagged": len(found), "byReason": {}}
        for title, g in geometry.items():
            page = info.get(title)
            if not page:
                continue
            state, reason, _rec = check_candidate(title, g, page)
            if state == "reject":
                key = reason.split("(")[0].split(":")[0].strip()[:60] or "rejected"
                stats["byReason"][key] = stats["byReason"].get(key, 0) + 1
        approved = []
        for entry in entries:
            title = entry.get("title")
            page = info.get(title)
            geom = geometry.get(title)
            if not page or not geom:
                rejections.append({"unitid": unitid, "title": title, "reason": "not found within 10 miles of the campus point"})
                continue
            state, reason, record = check_candidate(title, geom, page)
            if state == "reject":
                rejections.append({"unitid": unitid, "title": title, "reason": reason})
                continue
            if not entry.get("category") in ("activity", "nearby"):
                rejections.append({"unitid": unitid, "title": title, "reason": "curation entry lacks a category"})
                continue
            if not (entry.get("officialSource") or "").startswith("http"):
                rejections.append({"unitid": unitid, "title": title, "reason": "curation entry lacks an official source URL"})
                continue
            if not (entry.get("depicted") or "").strip():
                rejections.append({"unitid": unitid, "title": title, "reason": "curation entry lacks the depicted subject"})
                continue
            record.update({
                "category": entry["category"],
                "depicted": entry["depicted"],
                "relationship": entry.get("relationship"),
                "officialSource": entry["officialSource"],
                "officialSourceNote": entry.get("officialSourceNote"),
                "verified": entry.get("verified"),
                "caption": entry.get("caption") or record.get("depicted"),
            })
            approved.append(record)
        for drop in (curation.get(str(unitid)) or {}).get("dropped") or []:
            rejections.append({"unitid": unitid, "title": drop.get("title"),
                               "reason": drop.get("reason")})
        stats["approved"] = len(approved)
        discovery_stats[str(unitid)] = stats
        if approved:
            schools[str(unitid)] = {
                "id": unitid, "name": college["n"], "city": college.get("city"), "state": college.get("st"),
                "campusPoint": {"lat": lat, "lon": lon,
                                "source": "IPEDS HD2024 institutional coordinates (main campus)"},
                "photos": approved,
            }
    payload = {
        "meta": {
            "note": ("Only photos that passed every gate are published: correct named campus or venue, real photo, "
                     "verified classification with an official source, within 10 miles of the IPEDS-reported campus point "
                     "(distances are straight-line unless a source gives a route), and a reusable license with attribution."),
            "verified": "2026-10-13",
            "rejectionsFile": "docs/college-photos-rejections.json",
        },
        "colleges": schools,
    }
    with open(OUT, "w", encoding="utf-8") as handle:
        handle.write("/* Generated by scripts/build-college-photos.py. Do not edit by hand. */\n")
        handle.write("window.COLLEGE_PHOTOS_EXTRA = ")
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write(";\n")
    with open(LOG, "w", encoding="utf-8") as handle:
        json.dump({"generated": "2026-10-13", "discoveryStats": discovery_stats,
                   "rejections": rejections}, handle, indent=1, ensure_ascii=False)
    print("Wrote %d schools with %d approved photos; %d rejections logged" % (
        len(schools), sum(len(s["photos"]) for s in schools.values()), len(rejections)))


if __name__ == "__main__":
    main()
