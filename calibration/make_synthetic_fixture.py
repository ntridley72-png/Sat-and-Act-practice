#!/usr/bin/env python3
"""Writes calibration/fixtures/synthetic-v1.csv: a deterministic, obviously fake dataset for TESTING THE PIPELINE ONLY.

Every row has is_synthetic=1 and source_type=synthetic, applicant ids start with SYN-, and the file name says synthetic.
fit.py forces status "not validated" for it. It is never validation evidence and nothing in the site reads it.
Includes reapplicants repeated across cycles on purpose, so the leakage guard has something to catch.
"""
import csv, math, os, random

random.seed(20261014)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures", "synthetic-v1.csv")
COLS = ["applicant_id", "application_id", "unitid", "cycle_year", "outcome", "inst_rate_prev", "score_step", "test_policy_at_cycle", "source_type", "is_synthetic"]
rows, n = [], 0
for cycle in (2021, 2022, 2023, 2024):
    for school in range(12):
        rate = 12 + 6 * school  # fake institution rates 12..78 percent
        for _ in range(25):
            n += 1
            step = random.choice((-1, 0, 0, 1))
            p = 1 / (1 + math.exp(-(math.log(rate / (100 - rate)) + 0.4 * step)))
            # every 25th row re-uses an applicant from the previous cycle (a reapplicant), so the leakage guard has something to drop
            applicant = "SYN-%05d" % (n - 300 if n % 25 == 0 and cycle > 2021 else n)
            rows.append([applicant, "SYN-APP-%05d" % n, "9%05d" % school, cycle, 1 if random.random() < p else 0, rate, step, "required", "synthetic", 1])
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f, lineterminator="\n")
    w.writerow(COLS)
    w.writerows(rows)
print("wrote %s (%d synthetic rows)" % (OUT, len(rows)))
