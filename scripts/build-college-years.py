#!/usr/bin/env python3
"""Three admissions years per college from IPEDS final files, so profiles can show one year at a time.

Source: NCES IPEDS Data Center complete data files (https://nces.ed.gov/ipeds/datacenter/DataFiles.aspx)
  ADM2021, ADM2022, ADM2023  admissions: applicants, admits, enrollees, test submission, SAT/ACT 25th-75th, test policy
  IC2023_AY                   published tuition and fees and on-campus food and housing for 2021-22, 2022-23, 2023-24
Revised (_rv) files are used when NCES publishes them. Nothing is inferred: a value a college did not report stays null.

Writes college-years.js (loaded by the app when a college profile opens) and scripts/data/college-years.json (static
college pages). Usage: python3 scripts/build-college-years.py [dir with the downloaded zips]  (downloads if missing)
"""
import csv, io, json, re, sys, urllib.request, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = "https://nces.ed.gov/ipeds/datacenter/data/"
YEARS = [  # (fall admissions year, ADM file, price column suffix in IC2023_AY, price academic year)
    ("2023", "ADM2023", "AY3", "2023-24"),
    ("2022", "ADM2022", "AY2", "2022-23"),
    ("2021", "ADM2021", "AY1", "2021-22"),
]
# ADMCON7 codes. 2023 relabelled 3 from "neither required nor recommended" to "test blind", so labels are per year.
POLICY = {
    "2023": {"1": "Required", "2": "Recommended", "5": "Test optional", "3": "Test blind"},
    "2022": {"1": "Required", "2": "Recommended", "5": "Considered but not required", "3": "Neither required nor recommended"},
    "2021": {"1": "Required", "2": "Recommended", "5": "Considered but not required", "3": "Neither required nor recommended"},
}


def table(zdir, name):
    path = Path(zdir) / (name + ".zip")
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(BASE + name + ".zip", path)
    with zipfile.ZipFile(path) as z:
        names = z.namelist()
        pick = next((n for n in names if n.lower().endswith("_rv.csv")), None) or next(n for n in names if n.lower().endswith(".csv"))
        text = z.read(pick).decode("utf-8-sig", errors="replace")
    return {row["UNITID"].strip(): {k.strip(): (v or "").strip() for k, v in row.items() if k} for row in csv.DictReader(io.StringIO(text))}, pick


def num(v):
    return int(float(v)) if v not in ("", ".") and re.fullmatch(r"-?\d+(\.\d+)?", v) else None


def main():
    zdir = sys.argv[1] if len(sys.argv) > 1 else str(ROOT / ".cache" / "ipeds")
    data = json.loads(re.sub(r"^[^{]*", "", (ROOT / "college-data.js").read_text(), count=1).rstrip().rstrip(";"))
    ids = [str(c["id"]) for c in data["colleges"]]
    ic, ic_file = table(zdir, "IC2023_AY")
    files = {"IC2023_AY": ic_file}
    out = {}
    for fall, adm_name, ay, _ in YEARS:
        adm, files[adm_name] = table(zdir, adm_name)
        for uid in ids:
            a, p = adm.get(uid, {}), ic.get(uid, {})
            apps, admits = num(a.get("APPLCN", "")), num(a.get("ADMSSN", ""))
            sv25, sv75, sm25, sm75 = (num(a.get(k, "")) for k in ("SATVR25", "SATVR75", "SATMT25", "SATMT75"))
            row = {
                "apps": apps, "admits": admits, "enrolled": num(a.get("ENRLT", "")),
                "adm": round(admits * 100 / apps, 1) if apps and admits is not None else None,
                "satPct": num(a.get("SATPCT", "")), "actPct": num(a.get("ACTPCT", "")),
                "sr25": sv25 + sm25 if sv25 and sm25 else None, "sr75": sv75 + sm75 if sv75 and sm75 else None,
                "ar25": num(a.get("ACTCM25", "")), "ar75": num(a.get("ACTCM75", "")),
                "test": POLICY[fall].get(a.get("ADMCON7", "")),
                "ti": num(p.get("CHG2" + ay, "")), "to": num(p.get("CHG3" + ay, "")), "rb": num(p.get("CHG5" + ay, "")),
            }
            if any(v is not None for v in row.values()):
                out.setdefault(uid, {})[fall] = row
    meta = {
        "source": "U.S. Department of Education, NCES, IPEDS final data files",
        "sourceUrl": "https://nces.ed.gov/ipeds/datacenter/DataFiles.aspx",
        "files": files,
        "years": [{"key": f, "admissions": "Fall " + f, "price": py} for f, _, _, py in YEARS],
        "notes": "Admit rate = admitted / applied (first-time, degree-seeking). SAT is the sum of the reading-writing and math "
                 "25th (or 75th) percentiles, the same combination the app uses elsewhere, which only approximates a combined "
                 "percentile. Test ranges describe enrolled students who submitted scores. Prices are published tuition and "
                 "fees (in-state, out-of-state) and on-campus food and housing, before aid.",
    }
    payload = {"meta": meta, "colleges": out}
    (ROOT / "scripts" / "data").mkdir(parents=True, exist_ok=True)
    (ROOT / "scripts" / "data" / "college-years.json").write_text(json.dumps(payload, separators=(",", ":")))
    (ROOT / "college-years.js").write_text("/* Generated by scripts/build-college-years.py. Do not edit by hand. */\nwindow.COLLEGE_YEARS = "
                                           + json.dumps(payload, separators=(",", ":")) + ";\n")
    print(f"{len(out)} of {len(ids)} colleges have at least one IPEDS year; files: {files}")


if __name__ == "__main__":
    main()
