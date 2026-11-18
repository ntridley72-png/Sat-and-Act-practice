#!/usr/bin/env python3
"""Grow college-data.js to the N largest four-year colleges without touching existing entries.

The full build (build-college-data.py) rewrites every college from one Scorecard release. This
script instead appends the largest colleges that are not in the file yet, building each new entry
with the same functions (selection fields, scorecard enrichment, statistic provenance, majors),
and records on every new entry which release it came from. Existing entries, their photos, links
and verified fields are left exactly as they are.

Run: python3 scripts/add-colleges.py [target_count]   (default 500)
"""
import importlib.util
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("bcd", os.path.join(HERE, "build-college-data.py"))
bcd = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bcd)

TARGET = int(sys.argv[1]) if len(sys.argv) > 1 else 500


def main():
    src = open(bcd.OUT, encoding="utf-8").read()
    head = src[: src.index("window.COLLEGE_DATA")]
    data = json.loads(re.search(r"=\s*(\{[\s\S]*\})\s*;?\s*$", src).group(1))
    have = {c["id"] for c in data["colleges"]}

    csv_path = bcd.download_csv()
    # Every eligible college, not just the selective ones.
    bcd.SELECTIVE_ADMIT = 1.01
    pool = bcd.build_selection(csv_path)
    new = sorted((e for e in pool if e["id"] not in have), key=lambda e: -e["enr"])[: max(0, TARGET - len(have))]
    print("existing %d, adding %d (largest not yet included)" % (len(have), len(new)))
    if not new:
        return

    bcd.enrich_scorecard(new)
    bcd.enrich_stats(new)
    bcd.fetch_majors(new)

    by_state = {}
    for c in data["colleges"]:
        if c.get("rpp") is not None:
            by_state.setdefault(c["st"], {"rpp": c["rpp"], "rpph": c.get("rpph")})
    release = re.search(r"Most-Recent-Cohorts-Institution_(\d{2})(\d{2})(\d{4})", " ".join(os.listdir(bcd.CACHE)) + " scorecard")
    rel_label = "Scorecard release of " + (f"{release.group(3)}-{release.group(2)}-{release.group(1)}" if release else "November 2026")
    for e in new:
        e.pop("_raw", None)
        st = by_state.get(e["st"], {})
        e["rpp"] = st.get("rpp")
        e["rpph"] = st.get("rpph")
        e["net"] = e.get("np")
        e["tuIn"] = e.get("ti")
        e["tuOut"] = e.get("to")
        e["rel"] = rel_label
    for c in data["colleges"]:
        c.pop("_raw", None)

    data["colleges"] = sorted(data["colleges"] + new, key=lambda c: c["n"])
    meta = data["meta"]
    meta["count"] = len(data["colleges"])
    meta["selection"] = ("Four-year public and private nonprofit colleges with at least 500 undergraduates: every college "
                         "admitting 55%% or fewer applicants, plus the largest colleges by undergraduate enrollment until the "
                         "list reaches %d. Colleges that do not report test ranges are included with ranges shown as not reported." % len(data["colleges"]))
    meta["addedColleges"] = {"count": len(new), "release": rel_label,
                             "note": "Added after the main build from a newer Scorecard file; each added college carries its own release label and has no curated photos or verified links yet."}
    with open(bcd.OUT, "w", encoding="utf-8") as handle:
        handle.write(head)
        handle.write("window.COLLEGE_DATA = ")
        json.dump(data, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write(";\n")
    print("Wrote %d colleges (%d new)" % (len(data["colleges"]), len(new)))


if __name__ == "__main__":
    main()
