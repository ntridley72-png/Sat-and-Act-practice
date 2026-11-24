#!/usr/bin/env python3
"""Verified facts the college matcher scores on, for the 500 colleges in college-data.js.

Source: NCES IPEDS final data files, 2023 collection (https://nces.ed.gov/ipeds/datacenter/DataFiles.aspx)
  HD2023   location (latitude/longitude, city, locale), official web addresses, hospital and medical school flags
  IC2023   housing, meal plans, required on-campus living, AP credit, Yellow Ribbon and other veteran services, ROTC,
           study abroad, undergraduate research, distance education, counseling and employment services, athletics
           association, religious affiliation, calendar, application fee (revised file used when published)
  C2023_A  degrees conferred July 2022-June 2023 by program (CIP 2020): a field "offered" means the college reported
           at least one bachelor's degree in it that year; professional doctorates (PharmD, MD, JD, DPT, DVM) the same

Also builds a small place index (city -> coordinates) from every IPEDS institution, so a student can name a city
("family in Denver") without the site needing a map service, and a list of large-city points (IPEDS locale 11,
"City: Large", a principal city of 250,000+ people) for "near a big city". Distances are straight-line miles.

Writes college-match-data.js. Usage: python3 scripts/build-college-match-data.py <dir with HD2023.csv IC2023[_RV].csv C2023_a[_RV].csv>
"""
import csv
import json
import math
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# Majors a student can choose -> CIP 2020 prefixes (bachelor's level). Names are plain-language; the CIP codes are listed
# on the methodology page so anyone can check them.
MAJORS = {
    "biology": ("Biology and life sciences", ["26."]),
    "biochem": ("Biochemistry and molecular biology", ["26.02"]),
    "neuro": ("Neuroscience", ["26.15"]),
    "marinebio": ("Marine biology", ["26.13"]),
    "chemistry": ("Chemistry", ["40.05"]),
    "physics": ("Physics", ["40.08"]),
    "earthsci": ("Geology and earth science", ["40.06"]),
    "envsci": ("Environmental science", ["03.01", "03.02", "03.01"]),
    "math": ("Mathematics and statistics", ["27."]),
    "datasci": ("Data science and analytics", ["30.70", "27.05", "11.04"]),
    "cs": ("Computer science", ["11.07", "11.01", "11.02"]),
    "it": ("Information technology and cybersecurity", ["11.10", "11.09", "11.08", "11.03", "43.04"]),
    "engineering": ("Engineering (any)", ["14."]),
    "mecheng": ("Mechanical engineering", ["14.19"]),
    "eleceng": ("Electrical and computer engineering", ["14.10", "14.09", "14.47"]),
    "civileng": ("Civil and environmental engineering", ["14.08", "14.14"]),
    "chemeng": ("Chemical engineering", ["14.07"]),
    "aeroeng": ("Aerospace engineering", ["14.02"]),
    "bioeng": ("Biomedical engineering", ["14.05"]),
    "nursing": ("Nursing", ["51.38"]),
    "pharmsci": ("Pharmaceutical sciences (bachelor's)", ["51.20"]),
    "health": ("Health sciences and health professions", ["51."]),
    "publichealth": ("Public health", ["51.22"]),
    "kines": ("Kinesiology and exercise science", ["31.05"]),
    "nutrition": ("Nutrition and dietetics", ["51.31", "30.19"]),
    "psych": ("Psychology", ["42."]),
    "business": ("Business (any)", ["52."]),
    "accounting": ("Accounting", ["52.03"]),
    "finance": ("Finance", ["52.08"]),
    "marketing": ("Marketing", ["52.14"]),
    "econ": ("Economics", ["45.06"]),
    "polisci": ("Political science and government", ["45.10"]),
    "intl": ("International relations", ["45.09"]),
    "sociology": ("Sociology", ["45.11"]),
    "history": ("History", ["54."]),
    "english": ("English and writing", ["23."]),
    "comm": ("Communication and journalism", ["09."]),
    "education": ("Education and teaching", ["13."]),
    "crimjustice": ("Criminal justice", ["43.01", "43.0"]),
    "socialwork": ("Social work", ["44.07"]),
    "art": ("Fine and studio art", ["50.07"]),
    "design": ("Graphic and digital design", ["50.04", "50.01"]),
    "music": ("Music", ["50.09"]),
    "film": ("Film and media production", ["50.06", "09.07"]),
    "theatre": ("Theatre and dance", ["50.05", "50.03"]),
    "architecture": ("Architecture", ["04."]),
    "agriculture": ("Agriculture and animal science", ["01."]),
    "languages": ("World languages", ["16."]),
    "philosophy": ("Philosophy and religious studies", ["38."]),
    "aviation": ("Aviation", ["49.01"]),
    "hospitality": ("Hospitality and tourism", ["52.09"]),
}
# Professional doctorates on campus (award level 18), useful for "pre-pharmacy", "pre-med" and similar pathways.
PROFESSIONAL = {"pharmd": ("PharmD (pharmacy school)", "51.2001"), "md": ("MD (medical school)", "51.1201"),
                "do": ("DO (osteopathic medical school)", "51.1901"), "jd": ("JD (law school)", "22.0101"),
                "dpt": ("DPT (physical therapy)", "51.2308"), "dvm": ("DVM (veterinary school)", "01.8001")}

LOCALE = {"11": "City, large", "12": "City, midsize", "13": "City, small", "21": "Suburb, large", "22": "Suburb, midsize",
          "23": "Suburb, small", "31": "Town, fringe", "32": "Town, distant", "33": "Town, remote", "41": "Rural, fringe",
          "42": "Rural, distant", "43": "Rural, remote"}
CALSYS = {"1": "Semester", "2": "Quarter", "3": "Trimester", "4": "4-1-4", "5": "Other", "6": "Differs by program", "7": "Continuous"}


def rows(path):
    with open(path, encoding="latin-1", newline="") as f:
        for r in csv.DictReader(f):
            yield {k.replace("ï»¿", "").replace("﻿", "").strip(): (v or "").strip() for k, v in r.items() if k}


def pick(d, name):
    for cand in (name + "_RV.csv", name + "_rv.csv", name + ".csv", name.lower() + ".csv", name.lower() + "_rv.csv"):
        p = Path(d) / cand
        if p.exists():
            return p
    sys.exit(f"missing {name} in {d}")


def yn(v):
    """IPEDS 1 = yes, 0 or 2 = no (0 is 'implied no'), -1 / -2 / blank = not reported."""
    return True if v == "1" else False if v in ("0", "2") else None


def url(v):
    v = (v or "").strip()
    if not v:
        return None
    v = re.sub(r"^https?://", "", v, flags=re.I)
    return "https://" + v


def miles(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 3958.8 * 2 * math.asin(math.sqrt(h))


def main():
    d = sys.argv[1]
    data = json.loads(re.sub(r"^[^{]*", "", (ROOT / "college-data.js").read_text(), count=1).rstrip().rstrip(";"))
    ids = {str(c["id"]) for c in data["colleges"]}
    hd = {r["UNITID"]: r for r in rows(pick(d, "HD2023"))}
    ic = {r["UNITID"]: r for r in rows(pick(d, "IC2023"))}

    programs, prof = defaultdict(set), defaultdict(set)
    prof_codes = {v[1]: k for k, v in PROFESSIONAL.items()}
    for r in rows(pick(d, "C2023_a")):
        uid = r["UNITID"]
        if uid not in ids or r.get("MAJORNUM") != "1":
            continue
        try:
            n = int(r.get("CTOTALT") or 0)
        except ValueError:
            n = 0
        if n <= 0:
            continue
        cip = r["CIPCODE"]
        if r["AWLEVEL"] == "5" and re.fullmatch(r"\d\d\.\d{4}", cip):
            programs[uid].add(cip[:5])
        if r["AWLEVEL"] == "18" and cip in prof_codes:
            prof[uid].add(prof_codes[cip])

    # Place index from all institutions: "City, ST" -> mean coordinates of institutions there.
    acc = defaultdict(list)
    big = defaultdict(list)
    for r in hd.values():
        try:
            pt = (float(r["LATITUDE"]), float(r["LONGITUD"]))
        except (ValueError, KeyError):
            continue
        if r.get("CITY") and r.get("STABBR"):
            acc[(r["CITY"].strip(), r["STABBR"])].append(pt)
        if r.get("LOCALE") == "11" and r.get("CBSA") and r["CBSA"] not in ("-2", ""):
            big[r["CBSA"]].append((pt, r["CITY"], r["STABBR"]))
    places = {f"{c}, {s}": [round(sum(p[0] for p in v) / len(v), 4), round(sum(p[1] for p in v) / len(v), 4)] for (c, s), v in acc.items()}
    # One point per large-city metro: the most common large-city name in that CBSA, at its institutions' mean point.
    big_cities = []
    for cbsa, v in big.items():
        names = defaultdict(list)
        for pt, city, st in v:
            names[(city, st)].append(pt)
        (city, st), pts = max(names.items(), key=lambda kv: len(kv[1]))
        big_cities.append([f"{city}, {st}", round(sum(p[0] for p in pts) / len(pts), 4), round(sum(p[1] for p in pts) / len(pts), 4)])

    out = {}
    for uid in sorted(ids):
        h, i = hd.get(uid), ic.get(uid, {})
        if not h:
            continue
        try:
            pt = [round(float(h["LATITUDE"]), 5), round(float(h["LONGITUD"]), 5)]
        except ValueError:
            pt = None
        near = min(((miles(pt, (c[1], c[2])), c[0]) for c in big_cities), default=(None, None)) if pt else (None, None)
        rel = i.get("RELAFFIL")
        e = {
            "pt": pt,
            "city": h.get("CITY"), "st": h.get("STABBR"),
            "loc": h.get("LOCALE"),
            "bigMi": round(near[0]) if near[0] is not None else None, "bigCity": near[1],
            "hospital": yn(h.get("HOSPITAL")), "medical": yn(h.get("MEDICAL")),
            "urls": {k: url(h.get(v)) for k, v in (("web", "WEBADDR"), ("admissions", "ADMINURL"), ("aid", "FAIDURL"),
                                                    ("netprice", "NPRICURL"), ("veterans", "VETURL"), ("disability", "DISAURL"))},
            "housing": yn(i.get("ROOM")), "mustLiveOn": yn(i.get("ALLONCAM")), "meals": True if i.get("BOARD") in ("1", "2") else False if i.get("BOARD") == "3" else None,
            "roomCap": int(i["ROOMCAP"]) if (i.get("ROOMCAP") or "").isdigit() else None,
            "apCredit": yn(i.get("CREDITS3")), "dualCreditAny": False if i.get("CREDITS4") == "1" else None,
            "yellowRibbon": yn(i.get("VET1")), "milCredit": yn(i.get("VET2")), "vetContact": yn(i.get("VET3")), "vetOrg": yn(i.get("VET4")),
            "rotc": yn(i.get("SLO5")), "rotcArmy": yn(i.get("SLO51")), "rotcNavy": yn(i.get("SLO52")), "rotcAF": yn(i.get("SLO53")),
            "abroad": yn(i.get("SLO6")), "ugResearch": yn(i.get("SLOA")), "online": yn(i.get("DSTNUGC")),
            "counseling": yn(i.get("STUSRV2")), "jobServices": yn(i.get("STUSRV3")), "childCare": yn(i.get("STUSRV8")),
            "ncaa": yn(i.get("ASSOC1")), "naia": yn(i.get("ASSOC2")), "football": yn(i.get("SPORT1")),
            "religious": (rel not in (None, "", "-1", "-2")), "relCode": rel if rel not in (None, "", "-1", "-2") else None,
            "calendar": CALSYS.get(i.get("CALSYS")),
            "appFee": int(i["APPLFEEU"]) if (i.get("APPLFEEU") or "").isdigit() else None,
            "cip": sorted(programs.get(uid, ())), "prof": sorted(prof.get(uid, ())),
        }
        out[uid] = e

    meta = {
        "source": "U.S. Department of Education, NCES, IPEDS 2023 collection: HD2023, IC2023, C2023_A (degrees conferred 2022-23)",
        "sourceUrl": "https://nces.ed.gov/ipeds/datacenter/DataFiles.aspx",
        "majors": {k: {"label": v[0], "cip": v[1]} for k, v in MAJORS.items()},
        "professional": {k: v[0] for k, v in PROFESSIONAL.items()},
        "locale": LOCALE,
        "notes": ("A program counts as offered when the college reported at least one bachelor's degree in it for July 2022 to "
                  "June 2023; a brand-new or very small program can be missing. Yes/no services are what each college reported "
                  "to IPEDS for 2023-24. Distances are straight-line miles between coordinates, not driving distance or time. "
                  "A large city is a principal city of 250,000+ people (IPEDS locale 'City: Large')."),
    }
    payload = {"meta": meta, "colleges": out, "places": places, "bigCities": big_cities}
    (ROOT / "college-match-data.js").write_text("/* Generated by scripts/build-college-match-data.py. Do not edit by hand. */\nwindow.COLLEGE_MATCH_DATA = "
                                                + json.dumps(payload, separators=(",", ":")) + ";\n")
    # Allowlist for the research endpoint (worker/college-sources.json): each college's official domain and starting pages,
    # from IPEDS web addresses and the official pages verified for college-data.js. The worker fetches nothing else.
    from urllib.parse import urlparse
    names = {str(c["id"]): c for c in data["colleges"]}
    sources = {}
    for uid, e in out.items():
        web = e["urls"].get("web")
        if not web:
            continue
        host = urlparse(web).hostname or ""
        labels = host.lower().split(".")
        if len(labels) < 2:
            continue
        domain = ".".join(labels[-2:])
        seeds = [u for u in e["urls"].values() if u]
        seeds += [u for u in (names[uid].get("links") or {}).values() if isinstance(u, str) and u.startswith("https://")]
        seeds = [u for u in dict.fromkeys(seeds) if (urlparse(u).hostname or "").lower().endswith(domain)]
        sources[uid] = {"name": names[uid]["n"], "domain": domain, "seeds": seeds[:14]}
    (ROOT / "worker" / "college-sources.json").write_text(json.dumps(sources, separators=(",", ":")))
    print(f"{len(out)} colleges, {sum(1 for v in out.values() if v['cip'])} with programs, {len(places)} places, {len(big_cities)} large-city points, {len(sources)} research allowlists")


if __name__ == "__main__":
    main()
