#!/usr/bin/env python3
"""Photo rules for college galleries, applied at build time and runnable on the shipped data.

A gallery photo is dropped when the file itself shows it is wrong for a student looking at the college today:
  * old: the newest year in the file name is before CUTOFF (15 years), or it is a Historic American Buildings Survey scan;
  * a scanned book, journal or yearbook page (Internet Archive Flickr scans look like "Title (1902) (14740142836).jpg");
  * off topic for a campus (space imagery filed under a university that built the instrument, for example);
  * no license recorded (only the site name was captured), so the attribution cannot be shown correctly.
Photos with no year in the name are kept: the name proves nothing either way, and the build's other gates already apply.

Run: python3 scripts/college_photo_audit.py            writes college-data.js in place and docs/college-photo-audit.json
     python3 scripts/college_photo_audit.py --check    only reports
"""
import json, re, sys, urllib.parse
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CUTOFF = date.today().year - 15
YEAR = re.compile(r"(?<![0-9])(1[89][0-9]{2}|20[0-9]{2})(?![0-9])")
BOOK_SCAN = re.compile(r"\((1[0-9]{3}|20[0-9]{2})\)[ _]?\(\d{9,12}\)")
BOOK_WORDS = ("yearbook", "transactions of", "best literature", "report of the", "annual report", "bulletin of", "catalogue of", "the kaldron")
OFF_TOPIC = ("mars odyssey", "mars reconnaissance", "hirise", "sulci", "crater", "nebula", "galaxy", "asteroid", "jupiter", "saturn")
NO_LICENSE = {"wikimedia commons", ""}


def file_name(p):
    raw = str(p.get("l") or p.get("source") or p.get("u") or "")
    name = raw.split("/wiki/")[-1] if "/wiki/" in raw else raw.rsplit("/", 1)[-1]
    return urllib.parse.unquote(urllib.parse.unquote(name)).replace("_", " ").split("?")[0]


def audit_photo(p):
    """(keep, reason). reason is empty when kept."""
    name = file_name(p)
    low = name.lower()
    years = [int(y) for y in YEAR.findall(name) if int(y) <= date.today().year]
    if BOOK_SCAN.search(name) or any(w in low for w in BOOK_WORDS):
        return False, "scanned book, journal or yearbook page"
    if any(w in low for w in OFF_TOPIC):
        return False, "not a campus photo"
    if " habs " in f" {low} " or re.search(r"\bhabs\b", low):
        return False, "historic survey scan (decades old)"
    if years and max(years) < CUTOFF:
        return False, f"photo dated {max(years)} (older than {CUTOFF})"
    if str(p.get("license") or "").strip().lower() in NO_LICENSE:
        return False, "license not recorded"
    return True, ""


def main(check=False):
    path = ROOT / "college-data.js"
    src = path.read_text()
    head, body = src.split("window.COLLEGE_DATA = ", 1)
    data = json.loads(body.rstrip().rstrip(";"))
    report, before, after, emptied = [], 0, 0, []
    for c in data["colleges"]:
        imgs = c.get("imgs") or []
        before += len(imgs)
        keep = []
        for p in imgs:
            ok, why = audit_photo(p)
            if ok:
                keep.append(p)
            else:
                report.append({"college": c["n"], "id": c["id"], "file": file_name(p), "reason": why})
        after += len(keep)
        if imgs and not keep:
            emptied.append(c["n"])
        if keep:
            c["imgs"] = keep
            c.update({"img": keep[0]["u"], "imgA": keep[0].get("a") or keep[0].get("credit"), "imgL": keep[0].get("l")})
        elif imgs:
            for k in ("imgs", "img", "imgA", "imgL"):
                c.pop(k, None)
    reasons = {}
    for r in report:
        key = re.sub(r"\d{4}", "YYYY", r["reason"])
        reasons[key] = reasons.get(key, 0) + 1
    summary = {"cutoffYear": CUTOFF, "photosBefore": before, "photosAfter": after, "removed": len(report),
               "byReason": reasons, "collegesLeftWithoutPhotos": emptied, "removedPhotos": report}
    print(json.dumps({k: v for k, v in summary.items() if k != "removedPhotos"}, indent=1))
    if not check:
        path.write_text(head + "window.COLLEGE_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
        (ROOT / "docs" / "college-photo-audit.json").write_text(json.dumps(summary, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main(check="--check" in sys.argv)
