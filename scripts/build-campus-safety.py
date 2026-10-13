#!/usr/bin/env python3
"""Build college-safety.js from the U.S. Department of Education Campus Safety
and Security Data Analysis Cutting Tool (Clery Act data).

Source: https://ope.ed.gov/campussafety/ -- the official ED tool. Its web API
(https://ope.ed.gov/campussafety/api/) is used directly: institution search
resolves a school to its federal UNITID and its campuses, and
api/institution/<UNITID> returns the reported tables for the three most recent
reporting years, with the four geography screens kept separate exactly as the
source publishes them:

  On campus / On-campus student housing facilities / Noncampus / Public property

Student housing counts are a SUBSET of on-campus counts in the source; this
bundle keeps them in separate screens and nothing here should ever sum them.

Run: python3 scripts/build-campus-safety.py
Reruns reuse scripts/.cache/clery/. One school failing never wipes others:
each school is fetched, parsed, and validated independently, and a school
whose parse fails is dropped with its error recorded in the bundle meta.
"""
import csv
import io
import json
import os
import re
import sys
import urllib.parse
import urllib.request
import zipfile
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "college-safety.js")
CACHE = os.path.join(ROOT, "scripts", ".cache", "clery")
API = "https://ope.ed.gov/campussafety/api/"
TOOL = "https://ope.ed.gov/campussafety/#/"
UA = {"User-Agent": "funsat.bid college safety build (educational; contact: funsat.bid)",
      "Accept": "application/json"}

# Pilot: public/private, urban/rural, residential/commuter, multi-campus.
# name matches are resolved through the official search endpoint and the
# returned state is validated, so a name match can never bind the wrong school.
PILOT = [
    {"name": "Appalachian State University", "state": "NC"},
    {"name": "Arizona State University", "state": "AZ"},
    {"name": "Williams College", "state": "MA"},
    {"name": "University of Houston", "state": "TX"},
    {"name": "Spelman College", "state": "GA"},
    # Direct UNITID: a bare name search matched the Bothell campus.
    {"name": "University of Washington", "state": "WA", "unitid": 236948},
    # Expansion set (2026-10-13): big multi-campus publics, urban privates,
    # an HBCU, and a small rural residential college; direct UNITIDs are
    # validated against the payload name/state before anything is published.
    {"name": "Ohio State University", "state": "OH", "unitid": 204796},
    {"name": "University of North Carolina at Chapel Hill", "state": "NC", "unitid": 199120},
    {"name": "New York University", "state": "NY", "unitid": 193900},
    {"name": "Howard University", "state": "DC", "unitid": 131520},
    {"name": "Oberlin College", "state": "OH", "unitid": 204501},
    {"name": "Michigan State University", "state": "MI", "unitid": 171100},
    {"name": "University of California-Berkeley", "state": "CA", "unitid": 110635},
    {"name": "Texas A&M University", "state": "TX", "unitid": 228723},
]

# Official student-safety resources, verified by HTTP status at build time.
# Only pages that answer 200 are published; dead links are dropped and logged.
RESOURCE_CANDIDATES = {
    "197869": [
        {"label": "App State Title IX Office", "url": "https://titleix.appstate.edu/"},
        {"label": "App State Police", "url": "https://police.appstate.edu/"},
        {"label": "App State Counseling Center", "url": "https://counseling.appstate.edu/"},
    ],
    "104151": [
        {"label": "ASU Title IX", "url": "https://www.asu.edu/titleix"},
        {"label": "ASU Sexual Violence Prevention", "url": "https://sexualviolenceprevention.asu.edu"},
        {"label": "ASU Police Department", "url": "https://cfo.asu.edu/police"},
        {"label": "ASU Counseling Services", "url": "https://eoss.asu.edu/counseling"},
    ],
    "168342": [
        {"label": "Williams Title IX", "url": "https://titleix.williams.edu/"},
        {"label": "Williams Campus Safety", "url": "https://campus-safety.williams.edu/"},
        {"label": "Williams Integrative Wellbeing", "url": "https://health.williams.edu/"},
    ],
    "225511": [
        {"label": "UH Equal Opportunity Services (Title IX)", "url": "https://uh.edu/equal-opportunity"},
        {"label": "UH Police Department", "url": "https://www.uh.edu/police/"},
        {"label": "UH Counseling and Psychological Services", "url": "https://www.uh.edu/caps/"},
    ],
    "141060": [
        {"label": "Spelman Title IX", "url": "https://www.spelman.edu/title-ix/index.html"},
        {"label": "Spelman Public Safety", "url": "https://www.spelman.edu/student-life/public-safety/index.html"},
        {"label": "Spelman Wellness Center", "url": "https://wellness.spelman.edu"},
        {"label": "Spelman Counseling Center", "url": "https://www.spelman.edu/student-life/counseling-center/index.html"},
    ],
    "236948": [
        {"label": "UW Title IX", "url": "https://www.washington.edu/titleix/"},
        {"label": "UW SafeCampus", "url": "https://www.washington.edu/safety/"},
        {"label": "UW Counseling Center", "url": "https://www.washington.edu/counseling/"},
    ],
    "204796": [
        {"label": "Ohio State Title IX", "url": "https://titleix.osu.edu/"},
        {"label": "Ohio State Department of Public Safety", "url": "https://dps.osu.edu/"},
        {"label": "Ohio State Counseling and Consultation Service", "url": "https://ccs.osu.edu/"},
    ],
    "199120": [
        {"label": "UNC Police", "url": "https://police.unc.edu/"},
        {"label": "UNC Counseling and Psychological Services", "url": "https://caps.unc.edu/"},
        {"label": "UNC Equal Opportunity and Compliance (Title IX)", "url": "https://eoc.unc.edu/"},
        {"label": "Carolina Safe", "url": "https://safe.unc.edu/"},
    ],
    # NYU's pages answer 202 (CDN bot challenge) to automated checks; the
    # candidates are listed so the rejection log records exactly what was
    # tried and why those links are not published.
    "193900": [
        {"label": "NYU Title IX", "url": "https://www.nyu.edu/about/policies-guidelines-compliance/equal-opportunity/title-ix.html"},
        {"label": "NYU Counseling Services", "url": "https://www.nyu.edu/students/health-and-wellness/counseling-services.html"},
        {"label": "NYU Campus Safety", "url": "https://www.nyu.edu/about/policies-guidelines-compliance/policies-and-guidelines/campus-safety.html"},
    ],
    "131520": [
        {"label": "Howard Title IX", "url": "https://www.howard.edu/title-ix/"},
        {"label": "Howard University Public Safety", "url": "https://publicsafety.howard.edu/"},
    ],
    "204501": [
        {"label": "Oberlin Campus Safety", "url": "https://www.oberlin.edu/campus-safety"},
        {"label": "Oberlin Counseling Center", "url": "https://www.oberlin.edu/counseling"},
    ],
    "171100": [
        {"label": "MSU Title IX", "url": "https://titleix.msu.edu/"},
        {"label": "MSU Police", "url": "https://police.msu.edu/"},
        {"label": "MSU Counseling and Psychiatric Services", "url": "https://caps.msu.edu/"},
    ],
    "110635": [
        {"label": "Berkeley Office for the Prevention of Harassment and Discrimination", "url": "https://ophd.berkeley.edu/"},
        {"label": "UC Berkeley Police", "url": "https://police.berkeley.edu/"},
        {"label": "Berkeley University Health Services Counseling", "url": "https://uhs.berkeley.edu/counseling"},
    ],
    # tamu.edu subdomains refused automated checks (403/000) during the
    # build; listed so the log records the attempt.
    "228723": [
        {"label": "Texas A&M Title IX", "url": "https://titleix.tamu.edu/"},
        {"label": "Texas A&M University Police", "url": "https://upd.tamu.edu/"},
    ],
}

# The tool varies capitalization between groups ("On campus" vs "On Campus"),
# so screens are matched case-insensitively on a normalized name.
# Second official artifact: the tool's own "custom data" export (the same
# backend the site's download page uses). Every published cell is checked
# against it before a school is written. Institution-level tables in the tool
# equal the SUM of the campus rows in this export -- verified here cell by
# cell, which is also how the aggregation rule is validated rather than
# assumed. Student housing stays a separate table on both sides.
EXPORT_CATEGORIES = [1, 2, 3, 4, 21, 22, 23, 24, 31, 32, 34, 36, 33, 40, 35, 37, 45]
CSV_FOR = {
    "criminal": {"onCampus": "Criminal_Offenses_On_campus.csv",
                 "housing": "Criminal_Offenses_On_campus_Student_Housing_Facilities.csv",
                 "noncampus": "Criminal_Offenses_Noncampus.csv",
                 "publicProperty": "Criminal_Offenses_Public_Property.csv"},
    "vawa": {"onCampus": "VAWA_Offenses_On_campus.csv",
             "housing": "VAWA_Offenses_On_campus_Student_Housing_Facilities.csv",
             "noncampus": "VAWA_Offenses_Noncampus.csv",
             "publicProperty": "VAWA_Offenses_Public_Property.csv"},
    "arrests": {"onCampus": "Arrests_On_campus.csv",
                "housing": "Arrests_On_campus_Student_Housing_Facilities.csv",
                "noncampus": "Arrests_Noncampus.csv",
                "publicProperty": "Arrests_Public_Property.csv"},
    "disciplinary": {"onCampus": "Disciplinary_Actions_On_campus.csv",
                     "housing": "Disciplinary_Actions_Student_Housing_Facilities.csv",
                     "noncampus": "Disciplinary_Actions_Noncampus.csv",
                     "publicProperty": "Disciplinary_Actions_Public_Property.csv"},
    "unfounded": {"unfounded": "Unfounded_Crimes.csv"},
}
# The tool prints some rows with slightly different spellings than the CSV
# export columns ("Murder/ Non-negligent manslaughter", "Weapons: carrying,
# possessing, etc.", "Drug abuse violations"), so mapping is normalized.
ROW_COLUMNS = {
    "murder/non-negligent manslaughter": "Murder/Non-negligent manslaughter",
    "negligent manslaughter": "Negligent manslaughter",
    "rape": "Rape",
    "fondling": "Fondling",
    "incest": "Incest",
    "statutory rape": "Statutory rape",
    "robbery": "Robbery",
    "aggravated assault": "Aggravated assault",
    "burglary": "Burglary",
    "motor vehicle theft": "Motor vehicle theft",
    "arson": "Arson",
    "domestic violence": "Domestic violence",
    "dating violence": "Dating violence",
    "stalking": "Stalking",
    "illegal weapons possession": "Illegal weapons possession",
    "weapons: carrying, possessing, etc.": "Illegal weapons possession",
    "drug law violations": "Drug law violations",
    "drug abuse violations": "Drug law violations",
    "liquor law violations": "Liquor law violations",
    "total unfounded crimes": "Total unfounded crimes",
}


def csv_column(label):
    return ROW_COLUMNS.get(re.sub(r"\s+", " ", (label or "").replace("/ ", "/")).strip().lower())


def fetch_export():
    """Download (once, cached) the official all-category CSV export."""
    os.makedirs(CACHE, exist_ok=True)
    zip_path = os.path.join(CACHE, "campus-safety-export.zip")
    out_dir = os.path.join(CACHE, "export")
    if not os.path.exists(os.path.join(out_dir, "Criminal_Offenses_On_campus.csv")):
        if not os.path.exists(zip_path):
            body = json.dumps({
                "name": "", "city": "", "state": [], "country": [], "countryNames": [],
                "institutionType": [], "institutionProgram": [], "campusLocation": "-1",
                "onlyResidentialCampuses": False, "enrollmentRange": [], "sort": "name",
                "sortDirection": "asc", "pageNumber": 0, "pageSize": 10, "all": False,
                "years": [2022, 2023, 2024], "categories": EXPORT_CATEGORIES, "unitIDs": [],
            }).encode("utf-8")
            req = urllib.request.Request(API + "customData/filesByFilter", data=body,
                                         headers={**UA, "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=300) as resp:
                blob = resp.read()
            with open(zip_path, "wb") as handle:
                handle.write(blob)
        os.makedirs(out_dir, exist_ok=True)
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(out_dir)
    return out_dir


def norm_cell(value):
    v = "" if value is None else str(value).strip()
    if v == "":
        return None
    if re.fullmatch(r"\d+", v):
        return int(v)
    return v


def crosscheck(school, export_dir):
    """Compare every published cell against the official CSV export."""
    mismatches = []
    checked = 0
    for group in school["groups"]:
        for skey, screen in group["screens"].items():
            csv_name = CSV_FOR[group["key"]][skey]
            with open(os.path.join(export_dir, csv_name), newline="", encoding="utf-8-sig") as handle:
                rows = [r for r in csv.DictReader(handle) if r.get("Unitid") == str(school["id"])]
            for row in screen["rows"]:
                column = csv_column(row["label"])
                if not column:
                    mismatches.append({"why": "label has no CSV column mapping", "label": row["label"]})
                    continue
                for i, year in enumerate(screen["years"]):
                    total = 0
                    seen = False
                    for r in rows:
                        if r.get("Survey year") != year:
                            continue
                        seen = True
                        cell = norm_cell(r.get(column))
                        total += cell or 0
                    if not seen:
                        mismatches.append({"why": "no CSV rows for year", "label": row["label"], "year": year})
                        continue
                    checked += 1
                    if (row["values"][i] or 0) != total:
                        mismatches.append({"label": row["label"], "year": year,
                                           "tool": row["values"][i], "csv_sum": total})
    return checked, mismatches


SCREEN_KEYS = {
    "on campus": "onCampus",
    "on-campus student housing facilities": "housing",
    "noncampus": "noncampus",
    "public property": "publicProperty",
    "unfounded crimes": "unfounded",
}
GROUP_KEYS = {
    "Criminal Offenses": "criminal",
    "VAWA Offenses": "vawa",
    "Arrests": "arrests",
    "Disciplinary Actions": "disciplinary",
    "Unfounded Crimes": "unfounded",
}


def get(url, tries=3):
    last = None
    for _ in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.read().decode("utf-8", "replace")
        except Exception as exc:  # noqa: BLE001 - retry any transport error
            last = exc
    raise last


def raw_get(url, tries=3):
    for _ in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as exc:
            return exc.code, b""
        except Exception:  # noqa: BLE001
            continue
    return 0, b""


def search_institution(name, state):
    body = json.dumps({
        "name": name, "city": "", "state": [], "country": [], "countryNames": [],
        "institutionType": [], "institutionProgram": [], "campusLocation": "-1",
        "onlyResidentialCampuses": False, "enrollmentRange": [], "sort": "name",
        "sortDirection": "asc", "pageNumber": 0, "pageSize": 10, "all": False,
    }).encode("utf-8")
    req = urllib.request.Request(API + "institution/search", data=body,
                                 headers={**UA, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        payload = json.loads(resp.read().decode("utf-8", "replace"))
    for row in payload.get("Results") or []:
        if (row.get("State") or "").upper() == state and name.lower() in (row.get("Name") or "").lower():
            return row
    return None


def fetch_institution(unitid):
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, "institution-%d.json" % unitid)
    if os.path.exists(path):
        return json.load(open(path))
    data = json.loads(get(API + "institution/%d" % unitid))
    if not data.get("Groups"):
        raise RuntimeError("no Groups in institution payload")
    with open(path, "w") as handle:
        json.dump(data, handle)
    return data


def clean_label(html):
    text = re.sub(r"<[^>]+>", " ", html or "")
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"^[a-z]\.\s*", "", text)  # drop the "a. " bullet the source draws
    return text


def parse_screen(screen):
    years, rows = [], []
    header_seen = False
    for row in screen.get("Rows") or []:
        cells = row.get("Cells") or []
        texts = [clean_label(c.get("Html")) for c in cells]
        if not texts:
            continue
        if row.get("IsTableHeaderRow") or (row.get("Data") or {}).get("HeaderLevel") == "H2":
            yrs = [t for t in texts[1:] if re.fullmatch(r"(19|20)\d{2}", t or "")]
            if yrs:
                years = yrs
                header_seen = True
            continue
        if not header_seen:
            continue
        label = texts[0]
        values = texts[1:1 + len(years)]
        if not label or not values:
            continue
        # Keep non-numeric cells exactly as the source prints them (PS = privacy
        # suppression; blank cells stay None, never zero).
        parsed = []
        for v in values:
            v = (v or "").strip()
            if re.fullmatch(r"\d+", v):
                parsed.append(int(v))
            elif v == "":
                parsed.append(None)
            else:
                parsed.append(v)
        rows.append({"label": label, "values": parsed})
    return {"years": years, "rows": rows}


# Verified, fetchable national confidential-support resources. Appended to
# every school so a page whose campus pages are behind bot walls still offers
# working routes to help; they are labeled national, never passed off as
# campus services.
NATIONAL_RESOURCES = [
    {"label": "National Domestic Violence Hotline (24/7)", "url": "https://www.thehotline.org/", "kind": "national"},
    {"label": "love is respect (dating abuse support)", "url": "https://www.loveisrespect.org/", "kind": "national"},
    {"label": "U.S. DOJ Office on Violence Against Women", "url": "https://www.justice.gov/ovw", "kind": "national"},
]


def verify_resources(unitid, log):
    kept = []
    for res in RESOURCE_CANDIDATES.get(str(unitid), []):
        status, _ = raw_get(res["url"])
        if status == 200:
            kept.append({**res, "kind": "campus"})
        else:
            log.append({"url": res["url"], "status": status, "reason": "resource link failed verification"})
    for res in NATIONAL_RESOURCES:
        status, _ = raw_get(res["url"])
        if status == 200:
            kept.append(res)
        else:
            log.append({"url": res["url"], "status": status, "reason": "national resource link failed verification"})
    return kept


def build_school(pilot, errors, log, export_dir):
    if pilot.get("unitid"):
        # Explicit federal UNITID (recorded in the coverage report). Still
        # validated against the payload before anything is published.
        unitid = int(pilot["unitid"])
        data = fetch_institution(unitid)
        header = data.get("Header") or {}
        inst = header.get("Institution") or {}
        if (inst.get("StateCode") or "").upper() != pilot["state"] or \
                pilot["name"].lower() not in (inst.get("Name") or "").lower():
            errors.append({"school": pilot["name"],
                           "error": "direct UNITID %d resolved to %r (%s), not the expected school"
                                    % (unitid, inst.get("Name"), inst.get("StateCode"))})
            return None
    else:
        row = search_institution(pilot["name"], pilot["state"])
        if not row:
            errors.append({"school": pilot["name"], "error": "no search match in the official tool"})
            return None
        unitid = int(row["UnitID"])
        data = fetch_institution(unitid)
        header = data.get("Header") or {}
        inst = header.get("Institution") or {}
    groups = []
    notes = []
    for group in data.get("Groups") or []:
        gkey = GROUP_KEYS.get(group.get("Description") or "")
        if not gkey:
            continue
        screens = {}
        for screen in group.get("Screens") or []:
            skey = SCREEN_KEYS.get((screen.get("ScreenName") or "").strip().lower())
            if not skey:
                continue
            parsed = parse_screen(screen)
            if parsed["rows"]:
                screens[skey] = parsed
        if not screens:
            continue
        hdr = group.get("Header") or {}
        if hdr.get("Title"):
            notes.append({"group": gkey, "text": hdr["Title"].strip()})
        groups.append({"key": gkey, "description": group.get("Description"), "screens": screens})
    campuses = [{"unitid": int(c.get("UnitID")), "name": c.get("Name")} for c in (header.get("Campuses") or [])]
    # The reporting years should agree across every screen; if they do not,
    # the school's parse is suspect and the school is dropped rather than
    # publishing misaligned columns.
    year_sets = set()
    for g in groups:
        for s in g["screens"].values():
            year_sets.add(tuple(s["years"]))
    if len(year_sets) > 1:
        errors.append({"school": inst.get("Name") or pilot["name"],
                       "error": "inconsistent year columns across screens: %s" % sorted(year_sets)})
        return None
    years = list(next(iter(year_sets))) if year_sets else []
    if len(years) != 3:
        errors.append({"school": inst.get("Name") or pilot["name"],
                       "error": "expected three reporting years, saw %s" % years})
        return None
    # A source-level consistency check the Department does not perform for us:
    # on-campus counts INCLUDE student-housing counts, so housing can never
    # exceed on-campus for the same category and year. Where the filing says
    # otherwise (both ED artifacts agree), the anomaly is recorded and shown,
    # never silently reconciled.
    subset_anomalies = []
    for g in groups:
        on = (g.get("screens") or {}).get("onCampus")
        ho = (g.get("screens") or {}).get("housing")
        if not on or not ho:
            continue
        by_label = {r["label"]: r["values"] for r in ho["rows"]}
        for row in on["rows"]:
            hv = by_label.get(row["label"])
            if not hv:
                continue
            for i, year in enumerate(on["years"]):
                a, b = row["values"][i], hv[i]
                if isinstance(a, int) and isinstance(b, int) and b > a:
                    subset_anomalies.append({
                        "group": g["key"], "category": row["label"], "year": year,
                        "onCampus": a, "housing": b,
                        "note": ("as filed by the institution; the Department's tool data and CSV export agree, "
                                 "and the values are published as filed rather than reconciled"),
                    })
    if export_dir is None:
        errors.append({"school": inst.get("Name") or pilot["name"],
                       "error": "official CSV export unavailable; refusing to publish an unverified school"})
        return None
    checked, mismatches = crosscheck({
        "id": unitid,
        "years": years, "groups": groups,
    }, export_dir)
    if checked < 150:
        errors.append({"school": inst.get("Name") or pilot["name"],
                       "error": "only %d cells cross-checked; refusing to publish" % checked})
        return None
    if mismatches:
        errors.append({"school": inst.get("Name") or pilot["name"],
                       "error": "cross-check against the official CSV export failed",
                       "mismatches": mismatches[:8]})
        return None
    return {
        "id": unitid,
        "name": inst.get("Name"),
        "subsetAnomalies": subset_anomalies,
        "crossCheck": {
            "status": "verified",
            "cellsChecked": checked,
            "artifact": ("ED Campus Safety and Security custom export (filesByFilter), calendar years 2022-2024, "
                         "all criminal/VAWA/arrests/disciplinary/unfounded categories"),
            "rule": "institution-level table cells equal the sum of campus rows in the export; housing is a separate table",
        },
        "city": inst.get("City"),
        "state": inst.get("StateCode"),
        "surveyYear": inst.get("SurveyYear"),
        "enrollment": inst.get("Enrollment"),
        "campuses": campuses,
        "years": years,
        "groups": groups,
        "notes": notes,
        "resources": verify_resources(unitid, log),
        "sourceUrl": TOOL,
    }


# Independent spot-check against original documents, performed 2026-10-13.
# The institution's own published ASR was read by hand (text-extracted from
# the PDF) and its Main Campus tables compared with the ED bundle. Other
# pilot schools' ASRs could not serve this check from the build environment:
# UH's tables are image-based, App State's/Wiliams' ASR pages are bot-walled.
ASR_CHECKS = [
    {
        "school": "Spelman College",
        "unitid": 141060,
        "document": "https://www.spelman.edu/_1_Docs-and-Files/public-safety/2026-annual-security-and-fire-report.pdf",
        "scope": "Published ASR (2026 edition, updated 2026-08-26), Main Campus crime tables, pp. 42-47",
        "checked": [
            "Rape 2023 = 0, 2024 = 0",
            "Fondling 2023 = 1, 2024 = 2",
            "Stalking 2023 = 3, 2024 = 2",
            "Dating violence 2023 = 0, 2024 = 1",
            "Burglary 2024 = 4 total (residential 1 + campus 3)",
        ],
        "result": "matches the Department of Education bundle for every overlapping cell",
        "verified": "2026-10-13",
    }
]


def main():
    errors, log = [], []
    schools = {}
    export_dir = None
    try:
        export_dir = fetch_export()
    except Exception as exc:  # noqa: BLE001
        # Fail closed: with no export to check against, no school may publish.
        print("cross-check export unavailable (%r); every school will be dropped" % exc, file=sys.stderr)
    for pilot in PILOT:
        try:
            entry = build_school(pilot, errors, log, export_dir)
        except Exception as exc:  # noqa: BLE001 - one school must not break the build
            errors.append({"school": pilot["name"], "error": repr(exc)})
            continue
        if entry:
            schools[str(entry["id"])] = entry
            print("ok  %-38s years=%s groups=%d campuses=%d" % (
                entry["name"], entry["years"], len(entry["groups"]), len(entry["campuses"])))
    payload = {
        "meta": {
            "source": "U.S. Department of Education, Campus Safety and Security Data Analysis Cutting Tool (Clery Act data collected under 20 U.S.C. 1092(f))",
            "sourceUrl": TOOL,
            "apiBase": API,
            "cleryAppendix": "https://www.ed.gov/sites/ed/files/admins/lead/safety/cleryappendixfinal.pdf",
            "retrieved": date.today().isoformat(),
            "reportingYears": "the three most recent calendar years reported in the tool when this file was built",
            "geographyNote": ("On-campus counts include the student-housing counts; the two are published as separate screens and are never "
                              "added together here. Noncampus and public-property counts cover different geography. The source's own "
                              "definitions govern every table."),
            "limitations": ("These are reported incidents within the Clery Act's defined geography, as filed by each institution. They do "
                            "not measure the true prevalence of sexual assault or any other crime, and they do not establish personal "
                            "safety. Reporting practices and geographic coverage differ between campuses. A blank cell means the "
                            "institution's filing shows no value for that cell; it is not assumed to be zero unless the source shows 0."),
            "asrChecks": ASR_CHECKS,
            "errors": errors,
            "rejected": log,
        },
        "colleges": schools,
    }
    with open(OUT, "w", encoding="utf-8") as handle:
        handle.write("/* Generated by scripts/build-campus-safety.py. Do not edit by hand. */\n")
        handle.write("window.COLLEGE_SAFETY = ")
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write(";\n")
    print("Wrote %d pilot schools to %s (%d errors)" % (len(schools), OUT, len(errors)))


if __name__ == "__main__":
    main()
