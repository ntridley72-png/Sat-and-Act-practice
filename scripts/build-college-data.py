#!/usr/bin/env python3
"""Build college-data.js from official sources.

Sources:
 1. U.S. Dept. of Education College Scorecard, Most-Recent-Cohorts-Institution
    (selection, admit rate, enrolled SAT/ACT ranges, costs, outcomes, diversity).
 2. College Scorecard API (program percentages -> top majors).
 3. BEA Regional Price Parities by state (all items + housing rents), 2024.
 4. Wikimedia Commons / Wikipedia (campus photo + attribution; CC/PD images only).

Run: python3 scripts/build-college-data.py [path-to-institution-csv]
Reruns reuse scripts/.cache for downloads and photos.
"""
import concurrent.futures
import csv
import io
import json
import os
import random
import re
import sys
import threading
import time
import urllib.parse
import urllib.request
import zipfile
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "college-data.js")
CACHE = os.path.join(ROOT, "scripts", ".cache")
DATA_PAGE = "https://collegescorecard.ed.gov/data/"
BEA_RPP_ZIP = "https://apps.bea.gov/regional/zip/SARPP.zip"
API = "https://api.data.gov/ed/collegescorecard/v1/schools?api_key=DEMO_KEY"
UA = {"User-Agent": "funsat.bid college data build script (educational; contact: funsat.bid)"}
# Wikimedia's anonymous limit for search queries is tight; pace every API call
# globally and honour Retry-After instead of blind exponential backoff.
THROTTLE_LOCK = threading.Lock()
THROTTLE = float(os.environ.get("WIKI_THROTTLE") or "1.8")
LAST_CALL = [0.0]

SELECTIVE_ADMIT = 0.55
LARGEST_N = 150
MIN_UG = 500

PROGRAMS = {
    "agriculture": "Agriculture", "resources": "Natural resources", "architecture": "Architecture",
    "ethnic_cultural_gender": "Ethnic & gender studies", "communication": "Communication",
    "communications_technology": "Communications technology", "computer": "Computer science",
    "personal_culinary": "Personal & culinary services", "education": "Education", "engineering": "Engineering",
    "engineering_technology": "Engineering technology", "language": "Languages",
    "family_consumer_science": "Family & consumer sciences", "legal": "Legal studies", "english": "English",
    "humanities": "Humanities", "library": "Library science", "biological": "Biology",
    "mathematics": "Mathematics", "military": "Military science", "multidiscipline": "Interdisciplinary studies",
    "parks_recreation_fitness": "Parks & recreation", "philosophy_religious": "Philosophy & religion",
    "theology_religious_vocation": "Theology", "physical_science": "Physical sciences",
    "science_technology": "Science technologies", "psychology": "Psychology",
    "security_law_enforcement": "Security & law enforcement", "public_administration_social_service": "Public admin & social work",
    "social_science": "Social sciences", "construction": "Construction trades",
    "mechanic_repair_technology": "Mechanic & repair tech", "precision_production": "Precision production",
    "transportation": "Transportation", "visual_performing": "Visual & performing arts",
    "health": "Health professions", "business_marketing": "Business & marketing", "history": "History",
    "other": "Other fields",
}
STATE_NAME_TO_ABBR = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR", "California": "CA", "Colorado": "CO",
    "Connecticut": "CT", "Delaware": "DE", "District of Columbia": "DC", "Florida": "FL", "Georgia": "GA",
    "Hawaii": "HI", "Idaho": "ID", "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS", "Kentucky": "KY",
    "Louisiana": "LA", "Maine": "ME", "Maryland": "MD", "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN",
    "Mississippi": "MS", "Missouri": "MO", "Montana": "MT", "Nebraska": "NE", "Nevada": "NV", "New Hampshire": "NH",
    "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND",
    "Ohio": "OH", "Oklahoma": "OK", "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI",
    "South Carolina": "SC", "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX", "Utah": "UT", "Vermont": "VT",
    "Virginia": "VA", "Washington": "WA", "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY",
}
LOCALE_TYPE = {11: "city", 12: "city", 13: "city", 21: "suburb", 22: "suburb", 23: "suburb", 31: "town", 32: "town", 33: "town", 41: "rural", 42: "rural", 43: "rural"}


def num(value):
    try:
        v = float(value)
        return v if v == v else None
    except (TypeError, ValueError):
        return None


def get(url, timeout=45):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()


def download_csv():
    os.makedirs(CACHE, exist_ok=True)
    cached = os.path.join(CACHE, "Most-Recent-Cohorts-Institution.csv")
    if os.path.exists(cached) and os.path.getsize(cached) > 1_000_000:
        return cached
    page = get(DATA_PAGE).decode("utf-8", "replace")
    match = re.search(r'href="(https://[^"]*Most-Recent-Cohorts-Institution[^"]*\.zip)"', page)
    if not match:
        sys.exit("Could not find the College Scorecard bulk file link.")
    zip_path = os.path.join(CACHE, "scorecard.zip")
    urllib.request.urlretrieve(match.group(1), zip_path)
    with zipfile.ZipFile(zip_path) as z:
        name = next(n for n in z.namelist() if n.endswith("Most-Recent-Cohorts-Institution.csv"))
        z.extract(name, CACHE)
        return os.path.join(CACHE, name)


def load_rpp():
    """State RPP all-items and housing-rents index for the latest year (BEA)."""
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, "SARPP_STATE.csv")
    if not os.path.exists(path):
        zip_path = os.path.join(CACHE, "sarpp.zip")
        urllib.request.urlretrieve(BEA_RPP_ZIP, zip_path)
        with zipfile.ZipFile(zip_path) as z:
            name = next(n for n in z.namelist() if n.endswith("SARPP_STATE_2008_2024.csv"))
            z.extract(name, CACHE)
            os.rename(os.path.join(CACHE, name), path)
    rows = list(csv.DictReader(open(path, encoding="utf-8-sig")))
    year = "2024"
    out = {}
    for row in rows:
        desc = (row.get("Description") or "").strip().lower()
        name = (row.get("GeoName") or "").strip()
        abbr = STATE_NAME_TO_ABBR.get(name)
        if not abbr:
            continue
        if desc.startswith("rpps: all items"):
            out.setdefault(abbr, {})["all"] = round(float(row[year]), 1)
        elif desc.startswith("rpps: services: housing"):
            out.setdefault(abbr, {})["rents"] = round(float(row[year]), 1)
    return out, year


def clean_name(name):
    return re.sub(r"\s*[-–]\s*Main Campus$", "", name).strip()


ALIASES = json.load(open(os.path.join(ROOT, "scripts", "college-aliases.json"))) if os.path.exists(os.path.join(ROOT, "scripts", "college-aliases.json")) else {}


def build_selection(path):
    rows = []
    with open(path, newline="", encoding="utf-8", errors="replace") as handle:
        for row in csv.DictReader(handle):
            if row.get("PREDDEG") not in ("3", "4") or row.get("CONTROL") not in ("1", "2"):
                continue
            admit, ug = num(row.get("ADM_RATE")), num(row.get("UGDS"))
            if admit is None or ug is None or ug < MIN_UG:
                continue
            name = clean_name(row["INSTNM"])
            entry = {
                "id": int(row["UNITID"]), "n": name, "aka": ALIASES.get(name, []),
                "st": row.get("STABBR", ""), "city": row.get("CITY", ""),
                "ctrl": "public" if row.get("CONTROL") == "1" else "private",
                "adm": round(admit * 100, 1), "enr": int(ug),
                "url": (row.get("INSTURL") or "").replace("http://", "https://"),
            }
            sv25, sv75, sm25, sm75 = (num(row.get(k)) for k in ("SATVR25", "SATVR75", "SATMT25", "SATMT75"))
            sv50, sm50 = num(row.get("SATVR50")), num(row.get("SATMT50"))
            ac25, ac75, ac50 = num(row.get("ACTCM25")), num(row.get("ACTCM75")), num(row.get("ACTCM50"))
            if None not in (sv25, sv75, sm25, sm75):
                entry.update(sr25=int(sv25 + sm25), sr75=int(sv75 + sm75))
                if None not in (sv50, sm50):
                    entry["sr50"] = int(sv50 + sm50)
            if None not in (ac25, ac75):
                entry.update(ar25=int(ac25), ar75=int(ac75))
                if ac50 is not None:
                    entry["ar50"] = int(ac50)
            entry["_raw"] = row
            rows.append((admit, ug, entry))
    selective = [entry for admit, _, entry in rows if admit <= SELECTIVE_ADMIT]
    chosen = {(e["n"], e["st"]) for e in selective}
    for _, _, entry in sorted(rows, key=lambda x: -x[1])[:LARGEST_N]:
        if (entry["n"], entry["st"]) not in chosen:
            chosen.add((entry["n"], entry["st"]))
            selective.append(entry)
    return sorted(selective, key=lambda e: e["n"])


def enrich_scorecard(colleges):
    """Costs, outcomes, academics, diversity, housing proxy, city type."""
    for e in colleges:
        r = e["_raw"]
        def pct(key, scale=100):
            v = num(r.get(key))
            return round(v * scale, 1) if v is not None else None
        e["ti"] = int(num(r.get("TUITIONFEE_IN"))) if num(r.get("TUITIONFEE_IN")) else None
        e["to"] = int(num(r.get("TUITIONFEE_OUT"))) if num(r.get("TUITIONFEE_OUT")) else None
        rb = num(r.get("ROOMBOARD_ON")) or num(r.get("ROOMBOARD_OFF"))
        e["rb"] = int(rb) if rb else None
        npv = num(r.get("NPT4_PUB")) or num(r.get("NPT4_PRIV"))
        e["np"] = int(npv) if npv else None
        e["gr"] = pct("C150_4")
        e["ret"] = pct("RET_FT4")
        e["ern"] = int(num(r.get("MD_EARN_WNE_P10"))) if num(r.get("MD_EARN_WNE_P10")) else None
        e["sfr"] = round(num(r.get("STUFACR")), 1) if num(r.get("STUFACR")) else None
        e["pell"] = pct("PCTPELL")
        e["fg"] = pct("PAR_ED_PCT_1STGEN")
        e["satAvg"] = int(num(r.get("SAT_AVG"))) if num(r.get("SAT_AVG")) else None
        fsal = num(r.get("AVGFACSAL"))
        e["fsal"] = int(fsal * 10) if fsal else None  # AVGFACSAL is reported in tens of dollars
        e["loan"] = pct("PCTFLOAN")
        debt = num(r.get("DEBT_MDN"))
        e["debt"] = int(debt) if debt else None
        fam = num(r.get("MD_FAMINC"))
        e["fam"] = int(fam) if fam else None
        cdr = num(r.get("CDR3"))
        e["cdr"] = round(cdr * 100, 1) if cdr is not None else None
        e["age25"] = pct("UG25ABV")
        e["gpell"] = pct("C150_4_PELL")
        test = num(r.get("ADMCON7"))
        e["test"] = {1: "Required", 2: "Recommended", 3: "Considered", 4: "Not considered"}.get(int(test)) if test else None
        loc = num(r.get("LOCALE"))
        e["loc"] = LOCALE_TYPE.get(int(loc)) if loc else None
        groups = {"w": "UGDS_WHITE", "b": "UGDS_BLACK", "h": "UGDS_HISP", "a": "UGDS_ASIAN", "n": "UGDS_NRA", "m": "UGDS_2MOR"}
        race, shares = {}, {}
        for short, key in groups.items():
            v = num(r.get(key))
            if v is not None and v >= 0.005:
                shares[short] = round(v * 100)
        e["race"] = shares
        e["div"] = round((1 - sum((v / 100) ** 2 for v in shares.values())) * 100) if shares else None
        if str(r.get("HBCU")) == "1":
            e["hbcu"] = True
        if str(r.get("TRIBAL")) == "1":
            e["tribal"] = True
        e.pop("_raw", None)


CIP_FAMILIES = {
    "01": "Agriculture", "03": "Natural resources", "04": "Architecture", "05": "Area, ethnic & gender studies",
    "09": "Communication", "10": "Communications technology", "11": "Computer & information sciences",
    "12": "Personal & culinary services", "13": "Education", "14": "Engineering", "15": "Engineering technologies",
    "16": "Foreign languages", "19": "Family & consumer sciences", "22": "Legal professions",
    "23": "English language & literature", "24": "Liberal arts & general studies", "25": "Library science",
    "26": "Biological & biomedical sciences", "27": "Mathematics & statistics", "28": "Military science",
    "29": "Military technologies", "30": "Multi/interdisciplinary studies", "31": "Parks, recreation & fitness",
    "38": "Philosophy & religious studies", "39": "Theology & religious vocations", "40": "Physical sciences",
    "41": "Science technologies", "42": "Psychology", "43": "Homeland security & law enforcement",
    "44": "Public administration & social service", "45": "Social sciences", "46": "Construction trades",
    "47": "Mechanic & repair technologies", "48": "Precision production", "49": "Transportation",
    "50": "Visual & performing arts", "51": "Health professions", "52": "Business & marketing",
    "54": "History", "60": "Residency programs", "61": "Medical residency",
}


def fetch_majors(colleges):
    """Top bachelor's fields from the official IPEDS Completions survey (C2024_A)."""
    os.makedirs(CACHE, exist_ok=True)
    existing = os.path.join(CACHE, "C2024_A.csv")
    if not os.path.exists(existing):
        zip_path = os.path.join(CACHE, "C2024_A.zip")
        urllib.request.urlretrieve("https://nces.ed.gov/ipeds/datacenter/data/C2024_A.zip", zip_path)
        with zipfile.ZipFile(zip_path) as z:
            name = next(n for n in z.namelist() if n.upper().endswith(".CSV"))
            z.extract(name, CACHE)
            os.rename(os.path.join(CACHE, name), existing)
    wanted = {e["id"] for e in colleges}
    totals, by_field = {}, {}
    with open(existing, newline="", encoding="utf-8-sig", errors="replace") as handle:
        for row in csv.DictReader(handle):
            try:
                uid = int(row["UNITID"])
            except (TypeError, ValueError):
                continue
            if uid not in wanted or str(row.get("AWLEVEL")) != "5" or str(row.get("MAJORNUM")) != "1":
                continue
            count = num(row.get("CTOTALT")) or 0
            if count <= 0:
                continue
            cip = str(row.get("CIPCODE", ""))
            if cip.startswith("99"):
                continue
            family = CIP_FAMILIES.get(cip[:2], "Other fields")
            totals[uid] = totals.get(uid, 0) + count
            by_field.setdefault(uid, {})
            by_field[uid][family] = by_field[uid].get(family, 0) + count
    for e in colleges:
        total = totals.get(e["id"], 0)
        fields = sorted(by_field.get(e["id"], {}).items(), key=lambda x: -x[1])[:4]
        e["maj"] = [[label, round(count / total * 100)] for label, count in fields] if total else []


def wiki_get(url, tries=8):
    delay = 5
    for attempt in range(tries):
        with THROTTLE_LOCK:
            gap = LAST_CALL[0] + THROTTLE - time.time()
            if gap > 0:
                time.sleep(gap)
            LAST_CALL[0] = time.time()
        try:
            return json.loads(get(url, timeout=45))
        except urllib.error.HTTPError as exc:
            if exc.code != 429:
                raise
            retry = None
            try:
                retry = float(exc.headers.get("Retry-After")) if exc.headers else None
            except (TypeError, ValueError):
                retry = None
            wait = min(max(delay, (retry + 1) if retry else delay), 90)
            wait *= 1 + random.random() * 0.2
            print("commons rate limit: waiting %.0fs (attempt %d/%d)" % (wait, attempt + 1, tries), flush=True)
            time.sleep(wait)
            delay = min(delay * 1.6, 60)
    raise urllib.error.HTTPError(url, 429, "rate limited", None, None)


PHOTO_LABELS = {
    "athletics": "Stadium & athletics",
    "greek": "Greek life",
    "architecture": "Campus architecture",
    "surroundings": "Campus surroundings",
    "campus": "Campus life",
    "social": "Student life & traditions",
    "history": "School history",
}


def photo_kind(text):
    """Classify only subjects that help a prospective student picture campus life."""
    low = urllib.parse.unquote(str(text or "")).lower().replace("_", " ")
    if any(k in low for k in ("fraternity", "sorority", "greek row", "greek village", "chapter house")):
        return "greek"
    if any(k in low for k in ("stadium", "arena", "fieldhouse", "field house", "ballpark", "coliseum",
                              "athletic center", "athletics center", "football field", "basketball center",
                              "baseball", "basketball", "football", "soccer", "lacrosse")):
        return "athletics"
    if any(k in low for k in ("aerial", "skyline", "panorama", "downtown", "overview", "bird's-eye",
                              "mountain", "lake", "river", "beach", "arboretum", "botanical garden")):
        return "surroundings"
    if any(k in low for k in ("hall", "library", "chapel", "center", "building", "museum", "tower",
                              "laboratory", "institute", "auditorium", "theatre", "theater", "architecture")):
        return "architecture"
    if any(k in low for k in ("historic", "historical", "archives", "school history", "founding", "old main")):
        return "history"
    if any(k in low for k in ("student life", "students", "homecoming", "tradition", "festival", "club fair",
                              "orientation", "commencement", "graduation", "parade")):
        return "social"
    if any(k in low for k in ("campus", "quad", "quadrangle", "lawn", "mall", "gate", "entrance", "green")):
        return "campus"
    return None


PRIORITY_NAMES = {"university of san diego", "university of california-san diego", "harvard university",
                  "the university of alabama", "university of alabama", "auburn university"}
LEGACY_REJECT = ("logo", "seal", "crest", "coat of arms", "coat_of_arms", "wordmark", "bookplate",
                 "contact sheet", "map", "flag", "strike", "protest", "rally", "demonstration",
                 "headshot", "portrait", "award ceremony", "commencement speaker", "lathe",
                 "machinery", "machine shop", "equipment", "usmc", "marine corps", "u.s. navy",
                 "us navy", "midshipman", "first pitch", "change of command", "swearing in",
                 "tractor", "aircraft", "weapons", "rifle", "magazine")


FILLER_WORDS = {"file", "the", "of", "and", "at", "a", "an", "is", "in", "on", "for", "to", "with", "by"}


def photo_fingerprint(p):
    """Near-duplicate key: the first six meaningful words of the file page name
    (filler dropped), so three scans of the same building collapse to the first
    one kept while different buildings at the same college stay distinct."""
    raw = str(p.get("l") or p.get("u") or "")
    name = urllib.parse.unquote(raw.split("/wiki/")[-1] if "/wiki/" in raw else raw.rsplit("/", 1)[-1])
    words = [w for w in re.findall(r"[a-z]+", name.lower()) if w not in FILLER_WORDS]
    return " ".join(words[:6]) or str(p.get("u"))


def photo_only_filter():
    raw = os.environ.get("PHOTO_ONLY", "").strip()
    if not raw:
        return None
    return {name.strip().lower() for name in raw.split(",") if name.strip()}


def normalize_photo(p):
    """Guarantee credit, license, source page and category label on every image."""
    u = str(p.get("u") or p.get("src") or "").strip()
    page = str(p.get("l") or "").strip()
    combined = str(p.get("a") or "")
    credit = str(p.get("credit") or "").strip()
    license_name = str(p.get("license") or "").strip()
    if not credit:
        credit = combined.rsplit(" · ", 1)[0].strip() if " · " in combined else (combined.strip() or "Wikimedia Commons")
    if not license_name:
        license_name = combined.rsplit(" · ", 1)[1].strip() if " · " in combined else "Wikimedia Commons"
    kind = p.get("kind") or photo_kind(page or u) or "campus"
    if re.match(r"^(public domain|cc[ -]|cc0|no restrictions|fair use|unknown)", credit.lower()):
        credit = "Wikimedia Commons"
    out = dict(p)
    out.update({"u": u, "src": u, "l": page, "credit": credit or "Wikimedia Commons",
                "license": license_name, "kind": kind, "label": PHOTO_LABELS.get(kind, PHOTO_LABELS["campus"])})
    return out


def legacy_ok(p):
    """A cached photo from an older pipeline may only be reused if it would pass
    today's reject filters and still points at a Commons-hosted file."""
    raw = str(p.get("l") or p.get("u") or "")
    text = urllib.parse.unquote(raw).lower().replace("_", " ")
    if not text.startswith("https") or "wikimedia.org" not in text:
        return False
    name = urllib.parse.unquote(raw.split("/wiki/")[-1] if "/wiki/" in raw else raw.rsplit("/", 1)[-1]).lower()
    if not re.search(r"\.(?:jpe?g|png|webp|tiff?)$", name):
        return False  # documents, audio, SVG diagrams are not gallery photos
    return not any(bad in text for bad in LEGACY_REJECT)


def photo_priority(e, cache):
    """Priority-first order: the four audited schools, then zero-image colleges,
    then entries whose cached photos fail the filters, then the rest."""
    info = cache.get(str(e["id"])) or {}
    imgs = info.get("imgs") or []
    named = 0 if e["n"].lower() in PRIORITY_NAMES else 1
    missing = 0 if not imgs else 1
    filtered = [p for p in imgs if legacy_ok(p)]
    if len(filtered) >= 6 and info.get("v") == 7:
        state = 2  # already good: crawl last
    elif imgs and len(filtered) == len(imgs):
        state = 1
    else:
        state = 0
    return (named, missing, state)


def fetch_photos(colleges):
    cache_path = os.path.join(CACHE, "photos.json")
    os.makedirs(CACHE, exist_ok=True)
    cache = json.load(open(cache_path)) if os.path.exists(cache_path) else {}
    cache = {k: v for k, v in cache.items() if v.get("img") or v.get("imgs")}
    lock = threading.Lock()
    only = photo_only_filter()
    todo = [e for e in colleges if not only or e["n"].lower() in only]
    todo.sort(key=lambda e: photo_priority(e, cache))
    progress = {"done": 0, "total": len(todo)}
    failures = {"n": 0}

    def note_failure():
        with lock:
            failures["n"] += 1
            if failures["n"] >= 8:
                raise RuntimeError("Commons appears unreachable (%d colleges failed in a row); stopping so the cached legacy photos carry the site" % failures["n"])

    def note_success():
        with lock:
            failures["n"] = 0

    def tick():
        # A modest pool talks to Commons one request at a time per worker, and
        # wiki_get backs off on 429, so the pace stays polite without the old
        # one-college-per-90-seconds crawl.
        with lock:
            progress["done"] += 1
            if progress["done"] % 20 == 0:
                print("photos: %d/%d colleges processed" % (progress["done"], progress["total"]), flush=True)
                json.dump(cache, open(cache_path, "w"))

    def crawl(e):
        key = str(e["id"])
        cached = cache.get(key, {})
        # v7 is the strict, branch-aware subject cache (v6 predates the duplicate
        # fingerprint and object-photo filters). Older generic results
        # only survive if they pass today's reject filters, and they never
        # crowd out a fresh crawl.
        legacy = [normalize_photo(p) for p in (cached.get("imgs") or []) if legacy_ok(p)][:6]
        photos = [normalize_photo(p) for p in (cached.get("imgs") or [])] if cached.get("v") == 7 else []
        if len(photos) >= 6:
            e["imgs"] = photos
            if cached.get("img"):
                e.update({k: cached[k] for k in ("img", "imgA", "imgL") if cached.get(k)})
            note_success()
            tick()
            return
        prior = len(photos)
        fetch_failed = False
        try:
            searches = ['"' + e["n"] + '" ' + term for term in
                        ("stadium", "fraternity sorority", "student life history", "campus", "hall library", "aerial")]
            pages = {}
            for search in searches:
                params = {
                    "action": "query", "generator": "search", "gsrsearch": search,
                    "gsrnamespace": 6, "gsrlimit": 16, "prop": "imageinfo", "iiprop": "url|extmetadata",
                    "iiurlwidth": 960, "format": "json", "origin": "*",
                }
                data = wiki_get("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(params))
                pages.update(data.get("query", {}).get("pages", {}))
            candidates = []
            for page in pages.values():
                title = page.get("title", "")
                low = title.lower()
                if not re.search(r"\.(?:jpe?g|png|webp|tiff?)$", low) or any(bad in low for bad in
                    ("logo", "seal", "crest", "coat_of_arms", "wordmark", "map", "flag", "bookplate", "contact sheet")):
                    continue
                ii = (page.get("imageinfo") or [{}])[0]
                meta = ii.get("extmetadata", {})
                license_name = (meta.get("LicenseShortName", {}) or {}).get("value", "")
                if any(x in license_name.lower() for x in ("fair use", "non-free", "all rights")):
                    continue
                url = ii.get("thumburl") or ii.get("url")
                if not url:
                    continue
                w = num(ii.get("width")) or 0
                h = num(ii.get("height")) or 0
                if w and w < 800:
                    continue  # small/thumbnail-quality only
                artist = re.sub(r"<[^>]+>", "", (meta.get("Artist", {}) or {}).get("value", "") or "").strip()[:120]
                description = re.sub(r"<[^>]+>", " ", (meta.get("ImageDescription", {}) or {}).get("value", "") or "")
                subject = title + " " + description
                normalized_subject = " ".join(re.findall(r"[a-z0-9]+", subject.lower()))
                normalized_name = " ".join(re.findall(r"[a-z0-9]+", e["n"].lower()))
                identity = [token for token in re.findall(r"[a-z0-9]+", e["n"].lower())
                            if len(token) > 2 and token not in ("university", "college", "institute", "school", "the", "of")]
                acronym = "".join(token[0] for token in re.findall(r"[a-z0-9]+", e["n"].lower())
                                  if token not in ("the", "of", "and", "at"))
                strict_name = e["n"].lower().startswith(("university of ", "college of ")) and len(identity) <= 2
                exact_name = bool(re.search(r"\b" + re.escape(normalized_name) + r"\b(?!\s+at\b)", normalized_subject))
                identified = exact_name or (len(acronym) >= 3 and acronym in normalized_subject.replace(" ", ""))
                if not identified and not strict_name:
                    identified = bool(identity) and all(token in normalized_subject for token in identity)
                if not identified:
                    continue
                bucket = photo_kind(subject)
                if not bucket:
                    continue
                score = 3 * sum(2 if good in subject.lower() else 0 for good in
                                ("campus", "stadium", "fraternity", "sorority", "hall", "library", "quad", "aerial"))
                score += 2 * sum(1 for token in re.findall(r"[a-z0-9]+", e["n"].lower()) if len(token) > 3 and token in low)
                if w and h:
                    score += min(w * h, 4_000_000) / 4_000_000 * 3  # larger originals look better
                    if w / h >= 1.25:
                        score += 1.2  # landscape reads better in the gallery
                    elif w / h < 0.75:
                        score -= 1.5
                if "logo" in low or "map" in low or "flag" in low:
                    score -= 6
                if any(bad in subject.lower() for bad in ("strike", "protest", "rally", "demonstration", "headshot",
                                                          "portrait", "award ceremony", "commencement speaker",
                                                          "contact sheet", "bookplate", "lathe", "machinery",
                                                          "machine shop", "equipment", "usmc", "marine corps",
                                                          "u.s. navy", "us navy", "midshipman", "first pitch",
                                                          "change of command", "swearing in", "tractor", "aircraft",
                                                          "weapons", "rifle")):
                    continue
                # Three scans of the same building (the Highsmith collection
                # alone has several) must not fill the gallery. The selection
                # step keeps only the best-scoring variant per fingerprint.
                fingerprint = photo_fingerprint({"l": title})
                candidates.append((score, bucket, {
                    "u": url,
                    "a": ((artist + " · ") if artist else "") + (license_name or "Wikimedia Commons"),
                    "l": "https://commons.wikimedia.org/wiki/" + urllib.parse.quote(title.replace(" ", "_")),
                    "src": url,
                    "credit": artist or "Wikimedia Commons",
                    "license": license_name or "Wikimedia Commons",
                    "kind": bucket,
                    "label": PHOTO_LABELS[bucket],
                    "fp": fingerprint,
                }))
            known = {p.get("u") for p in photos}
            ranked = sorted(candidates, key=lambda item: -item[0])
            # Socially useful variety first; unavailable subjects are simply omitted.
            chosen, chosen_fp = set(), set()
            for want in ("athletics", "greek", "social", "history", "architecture", "surroundings", "campus"):
                for score, bucket, photo in ranked:
                    if bucket == want and photo["u"] not in known and photo["u"] not in chosen and photo.get("fp") not in chosen_fp:
                        photos.append(photo); known.add(photo["u"]); chosen.add(photo["u"]); chosen_fp.add(photo.get("fp")); break
                if len(photos) >= 6: break
            for score, bucket, photo in ranked:
                if len(photos) >= 6: break
                if photo["u"] in known or photo.get("fp") in chosen_fp: continue
                photos.append(photo); known.add(photo["u"]); chosen_fp.add(photo.get("fp"))
        except Exception:
            fetch_failed = True
            photos = []
        if fetch_failed:
            note_failure()
        else:
            note_success()
        if len(photos) > prior:
            photos = photos[:6]
            info = {"imgs": photos, "v": 7}
            info.update({"img": photos[0]["u"], "imgA": photos[0]["a"], "imgL": photos[0]["l"]})
            with lock:
                cache[key] = info
            e.update(info)
            e["imgs"] = photos
        else:
            # Commons gave nothing usable for this college. Keep whatever fresh
            # partials exist, otherwise the filtered legacy set, and do not
            # cache the fallback as a successful crawl so a later run retries.
            keep = photos or legacy
            e["imgs"] = keep
            for k in ("img", "imgA", "imgL"):
                e.pop(k, None)
            if keep:
                e.update({"img": keep[0]["u"], "imgA": keep[0].get("a") or keep[0]["credit"], "imgL": keep[0]["l"]})
        tick()

    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        list(pool.map(crawl, todo))
    with lock:
        json.dump(cache, open(cache_path, "w"))


def main():
    csv_path = sys.argv[1] if len(sys.argv) > 1 else download_csv()
    colleges = build_selection(csv_path)
    enrich_scorecard(colleges)
    try:
        fetch_majors(colleges)
    except Exception as exc:
        print('Majors fetch failed:', exc)
    if os.environ.get("SKIP_PHOTOS") == "1":
        photos_ok = True  # a cache-only rebake still ships the cached photos
        print("Photos skipped (SKIP_PHOTOS=1); using cached images only.")
    else:
        try:
            photos_ok = True
            fetch_photos(colleges)
        except Exception as exc:
            photos_ok = False
            print("Photo fetch failed:", exc)
    try:
        cached_photos = json.load(open(os.path.join(CACHE, "photos.json")))
        for e in colleges:
            info = cached_photos.get(str(e["id"]))
            if not info:
                continue
            seen_fp = set()
            imgs = []
            for p in (info.get("imgs") or []):
                if not legacy_ok(p):
                    continue
                fp = photo_fingerprint(p)
                if fp in seen_fp:
                    continue
                seen_fp.add(fp)
                imgs.append(normalize_photo(p))
            imgs = imgs[:6]
            if imgs:
                e["imgs"] = imgs
                e.update({"img": imgs[0]["u"], "imgA": imgs[0].get("a") or imgs[0]["credit"], "imgL": imgs[0]["l"]})
    except Exception:
        pass
    rpp, rpp_year = load_rpp()
    for e in colleges:
        state = rpp.get(e["st"], {})
        e["rpp"] = state.get("all")
        e["rpph"] = state.get("rents")
        e["net"] = e.get("np")
        e["tuIn"] = e.get("ti")
        e["tuOut"] = e.get("to")
    payload = {
        "meta": {
            "source": "U.S. Department of Education, College Scorecard, Most-Recent-Cohorts-Institution",
            "sourceUrl": "https://collegescorecard.ed.gov/data/",
            "release": "May 2026 release (file published 2026-05-26)",
            "fetched": date.today().isoformat(),
            "selection": ("Four-year public and private nonprofit colleges with at least 500 undergraduates: every college "
                          "admitting 55% or fewer applicants, plus the 150 largest by undergraduate enrollment. Colleges that "
                          "do not report test ranges are included with ranges shown as not reported."),
            "extras": [
                "Top majors: IPEDS Completions 2024, bachelor's degrees by field (NCES).",
                "Costs: Scorecard tuition, room & board, and net price for first-year students.",
                "Outcomes: Scorecard graduation rate (C150_4), first-year retention (RET_FT4), median earnings 10 years after entry (MD_EARN_WNE_P10).",
                "Diversity/first-gen: Scorecard enrollment race shares and parent-education percentages.",
                "Living costs: BEA Regional Price Parities by state (" + rpp_year + "), all items and housing rents, U.S. = 100.",
                "Photos: up to six curated Wikimedia Commons images per college, prioritizing athletics, Greek life, architecture, campus life, and surroundings; free-license images only, with per-image attribution.",
                "Campus context: enrollment size and locale classification from IPEDS, described as context — not a student survey or a social-life rating.",
            ],
            "note": ("SAT and ACT ranges describe enrolled students, not admitted students. Values are the most recent each "
                     "college reported to the U.S. Department of Education. Verify current testing policies and costs with each college."),
            "count": len(colleges),
            "photos": photos_ok,
        },
        "concordance": {
            "source": "ACT and College Board official concordance (2018, latest published version)",
            "sourceUrl": "https://www.act.org/content/act/en/products-and-services/the-act/scores/act-sat-concordance.html",
            "actToSat": {"36": 1590, "35": 1540, "34": 1500, "33": 1460, "32": 1430, "31": 1400, "30": 1370, "29": 1340,
                         "28": 1310, "27": 1280, "26": 1240, "25": 1210, "24": 1180, "23": 1140, "22": 1110, "21": 1080,
                         "20": 1040, "19": 1010, "18": 970, "17": 930, "16": 890, "15": 850, "14": 800, "13": 760,
                         "12": 710, "11": 670, "10": 630, "9": 590},
        },
        "colleges": colleges,
    }
    with open(OUT, "w", encoding="utf-8") as handle:
        handle.write("/* Generated by scripts/build-college-data.py. Do not edit by hand. */\n")
        handle.write("window.COLLEGE_DATA = ")
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write(";\n")
    print("Wrote %d colleges to %s" % (len(colleges), OUT))


if __name__ == "__main__":
    main()
