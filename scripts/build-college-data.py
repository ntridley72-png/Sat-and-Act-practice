#!/usr/bin/env python3
"""Build college-data.js from the U.S. Department of Education College Scorecard.

Source: College Scorecard "Most-Recent-Cohorts-Institution" bulk file
(https://collegescorecard.ed.gov/data/). Each displayed value is the most recent
data the college reported to the Department of Education. SAT/ACT ranges and
scores describe *enrolled* students, not admitted students.

Selection rule (documented in the generated meta.selection):
  * four-year, degree-granting (PREDDEG 3 or 4)
  * public or private nonprofit (CONTROL 1 or 2)
  * at least 500 undergraduates
  * either admits 55% or fewer applicants, or is one of the 150 largest
    four-year colleges by undergraduate enrollment

Colleges that no longer report SAT/ACT ranges (for example, University of
California campuses) are still included, with the missing values shown as
"not reported" in the app.

Usage:
  python3 scripts/build-college-data.py [path-to-institution-csv]

If no CSV path is given, the script downloads the current bulk file from
collegescorecard.ed.gov on first run and caches it in scripts/.cache/.
"""
import csv
import io
import json
import os
import re
import sys
import urllib.request
import zipfile
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "college-data.js")
CACHE = os.path.join(ROOT, "scripts", ".cache")
DATA_PAGE = "https://collegescorecard.ed.gov/data/"
PAGE_UA = {"User-Agent": "Mozilla/5.0 (funsat.bid college data build script)"}

SELECTIVE_ADMIT = 0.55
LARGEST_N = 150
MIN_UG = 500

# Common abbreviations and shorthands students actually search for.
ALIASES = {
    "Massachusetts Institute of Technology": ["MIT"],
    "California Institute of Technology": ["Caltech"],
    "Georgia Institute of Technology-Main Campus": ["Georgia Tech", "GT"],
    "University of California-Berkeley": ["UC Berkeley", "Cal", "UCB"],
    "University of California-Los Angeles": ["UCLA"],
    "University of California-San Diego": ["UCSD"],
    "University of California-Santa Barbara": ["UCSB"],
    "University of California-Irvine": ["UCI"],
    "University of California-Davis": ["UC Davis", "UCD"],
    "University of California-Santa Cruz": ["UCSC"],
    "University of California-Riverside": ["UCR"],
    "University of Southern California": ["USC"],
    "New York University": ["NYU"],
    "University of Pennsylvania": ["UPenn", "Penn"],
    "Carnegie Mellon University": ["CMU"],
    "University of North Carolina at Chapel Hill": ["UNC", "UNC Chapel Hill"],
    "University of Virginia-Main Campus": ["UVA", "University of Virginia"],
    "University of Michigan-Ann Arbor": ["UMich", "Michigan"],
    "University of Texas at Austin": ["UT Austin", "UT"],
    "The University of Texas at Austin": ["UT Austin", "UT"],
    "Texas A&M University-College Station": ["Texas A&M", "TAMU"],
    "University of Illinois Urbana-Champaign": ["UIUC", "Illinois"],
    "University of Wisconsin-Madison": ["Wisconsin", "UW-Madison"],
    "University of Washington-Seattle Campus": ["UW", "UDub"],
    "Ohio State University-Main Campus": ["Ohio State", "OSU"],
    "Pennsylvania State University-Main Campus": ["Penn State", "PSU"],
    "University of Minnesota-Twin Cities": ["Minnesota", "UMN"],
    "Purdue University-Main Campus": ["Purdue"],
    "Rutgers University-New Brunswick": ["Rutgers"],
    "Michigan State University": ["MSU"],
    "University of Florida": ["UF"],
    "Florida State University": ["FSU"],
    "University of Georgia": ["UGA"],
    "University of Maryland-College Park": ["UMD", "Maryland"],
    "University of Massachusetts-Amherst": ["UMass", "UMass Amherst"],
    "University of Connecticut": ["UConn"],
    "University of Pittsburgh-Pittsburgh Campus": ["Pitt"],
    "University of Colorado Boulder": ["CU Boulder", "Colorado"],
    "Arizona State University Campus Immersion": ["ASU", "Arizona State"],
    "University of Arizona": ["Arizona", "UArizona"],
    "University of Alabama at Birmingham": ["UAB"],
    "The University of Alabama": ["Alabama", "Bama"],
    "Auburn University": ["Auburn"],
    "Clemson University": ["Clemson"],
    "University of South Carolina-Columbia": ["South Carolina", "USC Columbia"],
    "Louisiana State University and Agricultural & Mechanical College": ["LSU"],
    "University of Mississippi": ["Ole Miss"],
    "University of Tennessee-Knoxville": ["Tennessee", "UT Knoxville"],
    "University of Kentucky": ["Kentucky", "UK"],
    "University of Oklahoma-Norman Campus": ["Oklahoma", "OU"],
    "Oklahoma State University-Main Campus": ["Oklahoma State", "OSU"],
    "University of Arkansas": ["Arkansas"],
    "University of Missouri-Columbia": ["Mizzou", "Missouri"],
    "University of Iowa": ["Iowa"],
    "Iowa State University": ["Iowa State"],
    "University of Kansas": ["Kansas", "KU"],
    "University of Nebraska-Lincoln": ["Nebraska", "UNL"],
    "Indiana University-Bloomington": ["Indiana", "IU"],
    "University of Illinois Chicago": ["UIC"],
    "University of Cincinnati-Main Campus": ["Cincinnati", "UC"],
    "University of Delaware": ["Delaware", "UD"],
    "University of Vermont": ["UVM", "Vermont"],
    "University of New Hampshire-Main Campus": ["UNH"],
    "University of Maine": ["Maine", "UMaine"],
    "University of Rhode Island": ["URI"],
    "University of Utah": ["Utah", "U of U"],
    "University of Oregon": ["Oregon", "UO"],
    "Oregon State University": ["Oregon State", "OSU"],
    "Washington State University": ["WSU"],
    "University of Nevada-Reno": ["Nevada", "UNR"],
    "University of New Mexico-Main Campus": ["UNM", "New Mexico"],
    "University of Idaho": ["Idaho", "UI"],
    "Montana State University": ["Montana State", "MSU"],
    "University of Montana": ["Montana", "UM"],
    "University of Wyoming": ["Wyoming", "UW"],
    "North Dakota State University-Main Campus": ["NDSU"],
    "University of North Dakota": ["UND"],
    "South Dakota State University": ["SDSU"],
    "University of South Dakota": ["USD"],
    "The University of Tennessee-Knoxville": ["Tennessee", "UT Knoxville"],
    "College of William & Mary": ["William & Mary", "W&M"],
    "The College of William and Mary": ["William & Mary", "W&M"],
    "George Washington University": ["GWU", "GW"],
    "Georgetown University": ["Georgetown"],
    "Boston University": ["BU"],
    "Boston College": ["BC"],
    "Northeastern University": ["Northeastern", "NU"],
    "Tulane University of Louisiana": ["Tulane"],
    "Vanderbilt University": ["Vanderbilt", "Vandy"],
    "Washington University in St Louis": ["WashU", "Washington University"],
    "University of Notre Dame": ["Notre Dame", "ND"],
    "Syracuse University": ["Syracuse", "Cuse"],
    "Case Western Reserve University": ["Case Western", "CWRU"],
    "Rensselaer Polytechnic Institute": ["RPI"],
    "Worcester Polytechnic Institute": ["WPI"],
    "Stevens Institute of Technology": ["Stevens"],
    "University of Miami": ["Miami", "UMiami"],
    "Southern Methodist University": ["SMU"],
    "Texas Christian University": ["TCU"],
    "Baylor University": ["Baylor"],
    "Villanova University": ["Villanova", "Nova"],
    "Lehigh University": ["Lehigh"],
    "Bucknell University": ["Bucknell"],
    "Colgate University": ["Colgate"],
    "Fordham University": ["Fordham"],
    "Pepperdine University": ["Pepperdine"],
    "Santa Clara University": ["Santa Clara", "SCU"],
    "Loyola Marymount University": ["LMU"],
    "University of San Diego": ["USD"],
    "University of Denver": ["DU", "Denver"],
    "American University": ["American", "AU"],
    "Howard University": ["Howard"],
    "Rutgers University-Newark": ["Rutgers Newark"],
    "Rutgers University-Camden": ["Rutgers Camden"],
}

def num(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None

def download_csv():
    os.makedirs(CACHE, exist_ok=True)
    cached = os.path.join(CACHE, "Most-Recent-Cohorts-Institution.csv")
    if os.path.exists(cached) and os.path.getsize(cached) > 1_000_000:
        return cached
    with urllib.request.urlopen(urllib.request.Request(DATA_PAGE, headers=PAGE_UA), timeout=60) as response:
        page = response.read().decode("utf-8", "replace")
    matches = re.findall(r'href="(https://[^"]*Most-Recent-Cohorts-Institution[^"]*\.zip)"', page)
    if not matches:
        sys.exit("Could not find the College Scorecard bulk file link on " + DATA_PAGE)
    zip_path = os.path.join(CACHE, "scorecard.zip")
    urllib.request.urlretrieve(matches[0], zip_path)
    with zipfile.ZipFile(zip_path) as archive:
        name = next(n for n in archive.namelist() if n.endswith("Most-Recent-Cohorts-Institution.csv"))
        archive.extract(name, CACHE)
        return os.path.join(CACHE, name)

def clean_name(name):
    name = re.sub(r"\s*[-–]\s*Main Campus$", "", name)
    return name.strip()

def alias_for(name):
    if name in ALIASES:
        return ALIASES[name]
    for key, values in ALIASES.items():
        if name.startswith(key + " ") or name == key:
            return values
    return []

def build(path):
    rows = []
    with open(path, newline="", encoding="utf-8", errors="replace") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            if row.get("PREDDEG") not in ("3", "4"):
                continue
            if row.get("CONTROL") not in ("1", "2"):
                continue
            admit = num(row.get("ADM_RATE"))
            ug = num(row.get("UGDS"))
            if admit is None or ug is None or ug < MIN_UG:
                continue
            sv25, sv75 = num(row.get("SATVR25")), num(row.get("SATVR75"))
            sm25, sm75 = num(row.get("SATMT25")), num(row.get("SATMT75"))
            sv50, sm50 = num(row.get("SATVR50")), num(row.get("SATMT50"))
            ac25, ac75, ac50 = num(row.get("ACTCM25")), num(row.get("ACTCM75")), num(row.get("ACTCM50"))
            sat_ok = None not in (sv25, sv75, sm25, sm75)
            act_ok = None not in (ac25, ac75)
            entry = {
                "id": int(row["UNITID"]),
                "n": clean_name(row["INSTNM"]),
                "aka": alias_for(clean_name(row["INSTNM"])),
                "st": row.get("STABBR", ""),
                "city": row.get("CITY", ""),
                "ctrl": "public" if row.get("CONTROL") == "1" else "private",
                "adm": round(admit * 100, 1),
                "enr": int(ug),
                "url": (row.get("INSTURL") or "").replace("http://", "https://"),
            }
            if sat_ok:
                entry["sr25"] = int(sv25 + sm25)
                entry["sr75"] = int(sv75 + sm75)
                if None not in (sv50, sm50):
                    entry["sr50"] = int(sv50 + sm50)
            if act_ok:
                entry["ar25"] = int(ac25)
                entry["ar75"] = int(ac75)
                if ac50 is not None:
                    entry["ar50"] = int(ac50)
            rows.append((admit, ug, entry))

    selective = [entry for admit, _, entry in rows if admit <= SELECTIVE_ADMIT]
    chosen = {(entry["n"], entry["st"]) for entry in selective}
    largest = sorted(rows, key=lambda item: -item[1])[:LARGEST_N]
    for _, _, entry in largest:
        key = (entry["n"], entry["st"])
        if key not in chosen:
            chosen.add(key)
            selective.append(entry)
    colleges = sorted(selective, key=lambda entry: entry["n"])
    return colleges

def main():
    csv_path = sys.argv[1] if len(sys.argv) > 1 else download_csv()
    colleges = build(csv_path)
    payload = {
        "meta": {
            "source": "U.S. Department of Education, College Scorecard, Most-Recent-Cohorts-Institution",
            "sourceUrl": "https://collegescorecard.ed.gov/data/",
            "release": "May 2026 release (file published 2026-05-26)",
            "fetched": date.today().isoformat(),
            "selection": ("Four-year public and private nonprofit colleges with at least 500 undergraduates: every "
                          "college admitting 55% or fewer applicants, plus the 150 largest by undergraduate enrollment. "
                          "Colleges that do not report test ranges (for example, test-free University of California "
                          "campuses) are included with ranges shown as not reported."),
            "note": ("SAT and ACT ranges describe enrolled students, not admitted students. Values are the most "
                     "recent each college reported to the U.S. Department of Education. Verify current testing "
                     "policies with each college."),
            "count": len(colleges),
        },
        "concordance": {
            "source": "ACT and College Board official concordance (2018, latest published version)",
            "sourceUrl": "https://www.act.org/content/act/en/products-and-services/the-act/scores/act-sat-concordance.html",
            "actToSat": {
                "36": 1590, "35": 1540, "34": 1500, "33": 1460, "32": 1430, "31": 1400, "30": 1370,
                "29": 1340, "28": 1310, "27": 1280, "26": 1240, "25": 1210, "24": 1180, "23": 1140,
                "22": 1110, "21": 1080, "20": 1040, "19": 1010, "18": 970, "17": 930, "16": 890,
                "15": 850, "14": 800, "13": 760, "12": 710, "11": 670, "10": 630, "9": 590,
            },
        },
        "colleges": colleges,
    }
    with open(OUT, "w", encoding="utf-8") as handle:
        handle.write("/* Generated by scripts/build-college-data.py. Do not edit by hand. */\n")
        handle.write("window.COLLEGE_DATA = ")
        json.dump(payload, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write(";\n")
    print("Wrote %s colleges to %s" % (len(colleges), OUT))

if __name__ == "__main__":
    main()
