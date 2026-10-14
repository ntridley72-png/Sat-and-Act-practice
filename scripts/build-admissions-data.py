#!/usr/bin/env python3
"""Build admissions-data.js: official applicant/admit COUNTS per catalog college.

Source: U.S. Dept. of Education, NCES IPEDS Data Center, ADM2023 file
(fall 2023 entering first-time degree/certificate-seeking cohort).
Input : the ADM zip downloaded by the operator (never fetched implicitly).
Output: admissions-data.js (window.ADMISSIONS_DATA), deterministic: the same
        inputs always give the same bytes. The build date is passed in with
        --built so reruns are reproducible.

Four dates are kept apart and never merged:
  cohort     the entering class the counts describe (2023)
  published  the source file's Last-Modified date from nces.ed.gov
  retrieved  the day the operator downloaded the file (--retrieved)
  built      the day this generator ran (--built)

Rate = 100 * admitted / applicants, computed from raw counts at read time.
"""
import argparse, csv, io, json, re, sys, zipfile
from pathlib import Path

SOURCE_URL = "https://nces.ed.gov/ipeds/datacenter/data/ADM2023.zip"
SOURCE_NAME = "NCES IPEDS Data Center, ADM2023 (Admissions)"
POPULATION = "First-time, degree/certificate-seeking undergraduate applicants for the fall 2023 entering class"
# ADMCON7 (SAT/ACT use) code labels in the ADM2023 dictionary could not be tied
# to code numbers with certainty, so the raw code is carried and never interpreted.


def int_or_none(text):
    text = (text or "").strip()
    return int(text) if re.fullmatch(r"\d+", text) else None


def load_ipeds(zip_path):
    with zipfile.ZipFile(zip_path) as z:
        name = next(n for n in z.namelist() if n.lower().endswith(".csv") and "_rv" not in n.lower())
        rows = csv.DictReader(io.TextIOWrapper(z.open(name), encoding="latin-1"))
        return {int(r["UNITID"]): r for r in rows}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--zip", required=True)
    ap.add_argument("--catalog", default="college-data.js")
    ap.add_argument("--out", default="admissions-data.js")
    ap.add_argument("--published", required=True, help="source Last-Modified date, YYYY-MM-DD")
    ap.add_argument("--retrieved", required=True, help="day the file was downloaded, YYYY-MM-DD")
    ap.add_argument("--built", required=True, help="build date, YYYY-MM-DD")
    a = ap.parse_args()
    for v in (a.published, a.retrieved, a.built):
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
            sys.exit("dates must be YYYY-MM-DD")

    text = Path(a.catalog).read_text(encoding="utf-8")
    catalog = json.loads(text[text.index("{"):text.rindex("}") + 1])["colleges"]
    ipeds = load_ipeds(a.zip)

    records, skipped = {}, []
    for c in sorted(catalog, key=lambda c: c["id"]):
        row = ipeds.get(c["id"])
        applicants = int_or_none(row and row.get("APPLCN"))
        admitted = int_or_none(row and row.get("ADMSSN"))
        if applicants is None or admitted is None or applicants <= 0 or admitted > applicants:
            skipped.append(c["id"])
            continue
        code = int_or_none(row.get("ADMCON7"))
        records[str(c["id"])] = {"applicants": applicants, "admitted": admitted, "testCode": code}

    # Newer hand-verified institution figures replace the IPEDS counts for that college only,
    # and carry their own cohort, source, population and dates so nothing is relabeled.
    verified_path = Path(__file__).with_name("data") / "admissions-verified.json"
    policy = {}
    if verified_path.exists():
        v = json.loads(verified_path.read_text(encoding="utf-8"))
        retrieved = v["retrievedDate"]
        catalog_ids = {c["id"] for c in catalog}
        entries = list(v.get("records", []))
        uc = v.get("ucSnapshot")
        for camp in (uc or {}).get("campuses", []):
            entries.append({**{k: uc[k] for k in ("year", "cohortLabel", "sourceName", "population", "publishedDate", "releaseStatus")},
                            "id": camp["id"], "applicants": camp["applicants"], "admitted": camp["admitted"],
                            "sourceUrl": uc["urlPattern"].replace("{slug}", camp["slug"])})
        for e in entries:
            if e["id"] not in catalog_ids or not (0 < e["applicants"] and 0 <= e["admitted"] <= e["applicants"]) or not e["sourceUrl"].startswith("https://"):
                sys.exit("invalid verified record for %s" % e.get("id"))
            records[str(e["id"])] = {"applicants": e["applicants"], "admitted": e["admitted"], "testCode": records.get(str(e["id"]), {}).get("testCode"),
                                     "year": e["year"], "cohortLabel": e["cohortLabel"], "sourceName": e["sourceName"], "sourceUrl": e["sourceUrl"],
                                     "population": e["population"], "publishedDate": e["publishedDate"], "retrievedDate": retrieved,
                                     "releaseStatus": e["releaseStatus"], "verified": True}
        for p in v.get("testPolicy", []):
            for cid in p["ids"]:
                if cid in catalog_ids:
                    policy[str(cid)] = {"policy": p["policy"], "sourceUrl": p["sourceUrl"], "retrievedDate": p["retrievedDate"]}

    out = {
        "policy": policy,
        "meta": {
            "schema": 1,
            "sourceName": SOURCE_NAME,
            "sourceUrl": SOURCE_URL,
            "cohortYear": 2023,
            "cohortLabel": "Fall 2023 entering class",
            "population": POPULATION,
            "releaseStatus": "IPEDS Data Center file as published; provisional/final flag not stated in the file",
            "publishedDate": a.published,
            "retrievedDate": a.retrieved,
            "builtDate": a.built,
            "rateFormula": "100 * admitted / applicants",
            "testCodeNote": "Raw IPEDS ADMCON7 code, not interpreted: the mapping from code number to policy label is not confirmed.",
            "count": len(records),
            "notReportedIds": skipped,
        },
        "byId": records,
    }
    body = json.dumps(out, sort_keys=True, separators=(",", ":"))
    Path(a.out).write_text(
        "/* Generated by scripts/build-admissions-data.py. Do not edit by hand. */\n"
        "window.ADMISSIONS_DATA = " + body + ";\n", encoding="utf-8")
    print(f"wrote {a.out}: {len(records)} colleges with counts, {len(skipped)} without")


if __name__ == "__main__":
    main()
