#!/usr/bin/env python3
"""Offline calibration/evaluation for the FunSAT admissions heuristic. Standard library only.

    python3 -I calibration/fit.py --data <rows.csv> --meta <dataset.json> --out calibration/reports/<id>.json

Never runs in the browser, the Worker, or during chats. The site never reads its reports.

What it does (see calibration/README.md for the data contract):
  1. Validates the dataset metadata and rows.
  2. Splits TEMPORALLY (train < calibration < test cycle) and by APPLICANT (an applicant_id is
     kept in only the earliest cycle it appears in), then reports leakage counts.
  3. Fits an L2-regularized logistic regression (IRLS) on [logit(prior-cycle rate), score step].
  4. Compares predictors on the untouched test cycle: institution-rate baseline, uncalibrated
     model, sigmoid-calibrated model, and (only with >= 1000 calibration rows) isotonic.
  5. Writes log loss, Brier, ECE, reliability bins and support counts.

It can only ever say "not validated" or "evaluated; human review required". It will not say
"validated": that is a human decision about representativeness, which no script can make.
"""
import argparse, csv, json, math, sys
from datetime import datetime, timezone

REPORT_VERSION = 1
MODEL_VERSION = "exp-heuristic-0.1.0"
DISALLOWED_SOURCES = {"synthetic", "ai_generated", "aggregate", "anecdotal", "scraped_private"}
MIN_TEST_ROWS, MIN_CYCLES, MIN_INSTITUTIONS, ISOTONIC_MIN_ROWS = 1000, 3, 10, 1000
REQUIRED_COLS = ["applicant_id", "application_id", "unitid", "cycle_year", "outcome", "inst_rate_prev", "score_step",
                 "test_policy_at_cycle", "source_type", "is_synthetic"]
EPS = 1e-6


def clip(p):
    return min(1 - EPS, max(EPS, p))


def logit(p):
    p = clip(p)
    return math.log(p / (1 - p))


def sigmoid(x):
    return 1 / (1 + math.exp(-x)) if x >= 0 else math.exp(x) / (1 + math.exp(x))


def load_rows(path):
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        missing = [c for c in REQUIRED_COLS if c not in (reader.fieldnames or [])]
        if missing:
            sys.exit("data contract violation: missing columns " + ", ".join(missing))
        rows, bad = [], 0
        for r in reader:
            try:
                row = {"applicant_id": r["applicant_id"], "unitid": r["unitid"], "cycle": int(r["cycle_year"]), "y": int(r["outcome"]),
                       "rate": float(r["inst_rate_prev"]), "step": float(r["score_step"]), "source": r["source_type"].strip().lower(),
                       "synthetic": r["is_synthetic"].strip() in ("1", "true", "True")}
            except ValueError:
                bad += 1  # malformed rows are counted, never imputed
                continue
            if row["y"] in (0, 1) and 0 < row["rate"] < 100 and row["step"] in (-1.0, 0.0, 1.0) and row["applicant_id"]:
                rows.append(row)
            else:
                bad += 1
        return rows, bad


def features(r):
    return [1.0, logit(r["rate"] / 100), r["step"]]


def solve(a, b):
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for i in range(n):
        piv = max(range(i, n), key=lambda k: abs(m[k][i]))
        m[i], m[piv] = m[piv], m[i]
        d = m[i][i] or 1e-12
        m[i] = [v / d for v in m[i]]
        for k in range(n):
            if k != i:
                f = m[k][i]
                m[k] = [vk - f * vi for vk, vi in zip(m[k], m[i])]
    return [m[i][n] for i in range(n)]


def fit_logistic(rows, l2=1.0, iters=50):
    """IRLS with L2 on the rate and step coefficients (not the intercept), shrinking toward the baseline."""
    prior = [0.0, 1.0, 0.0]
    w = prior[:]
    for _ in range(iters):
        g = [0.0] * 3
        h = [[0.0] * 3 for _ in range(3)]
        for r in rows:
            x = features(r)
            p = sigmoid(sum(wi * xi for wi, xi in zip(w, x)))
            for i in range(3):
                g[i] += (r["y"] - p) * x[i]
                for j in range(3):
                    h[i][j] += p * (1 - p) * x[i] * x[j]
        for i in (1, 2):
            g[i] -= l2 * (w[i] - prior[i])
            h[i][i] += l2
        step = solve(h, g)
        w = [wi + si for wi, si in zip(w, step)]
        if max(abs(s) for s in step) < 1e-8:
            break
    return w


def platt(preds, ys, iters=100):
    a, b = 1.0, 0.0
    z = [logit(p) for p in preds]
    for _ in range(iters):
        g = [0.0, 0.0]
        h = [[1e-6, 0.0], [0.0, 1e-6]]
        for zi, y in zip(z, ys):
            p = sigmoid(a * zi + b)
            g[0] += (y - p) * zi; g[1] += (y - p)
            h[0][0] += p * (1 - p) * zi * zi; h[0][1] += p * (1 - p) * zi
            h[1][0] += p * (1 - p) * zi; h[1][1] += p * (1 - p)
        s = solve(h, g)
        a, b = a + s[0], b + s[1]
        if max(abs(v) for v in s) < 1e-8:
            break
    return (lambda p: sigmoid(a * logit(p) + b)), {"a": round(a, 5), "b": round(b, 5)}


def isotonic(preds, ys):
    """Pool-adjacent-violators on predictions sorted ascending."""
    out = []
    for p, y in sorted(zip(preds, ys)):
        out.append([y, 1, p])
        while len(out) > 1 and out[-2][0] / out[-2][1] > out[-1][0] / out[-1][1]:
            b2 = out.pop(); b1 = out.pop()
            out.append([b1[0] + b2[0], b1[1] + b2[1], b2[2]])
    table = [(blk[2], blk[0] / blk[1]) for blk in out]

    def f(p):
        for hi, v in table:
            if p <= hi:
                return v
        return table[-1][1]
    return f


def metrics(preds, ys, bins=10):
    n = len(ys)
    if n == 0:
        return {"n": 0, "logLoss": None, "brier": None, "ece": None, "reliability": []}
    ll = -sum(y * math.log(clip(p)) + (1 - y) * math.log(1 - clip(p)) for p, y in zip(preds, ys)) / n
    br = sum((p - y) ** 2 for p, y in zip(preds, ys)) / n
    rel, ece = [], 0.0
    for b in range(bins):
        lo, hi = b / bins, (b + 1) / bins
        idx = [i for i, p in enumerate(preds) if lo <= p < hi or (b == bins - 1 and p == 1.0)]
        if idx:
            mp = sum(preds[i] for i in idx) / len(idx)
            ob = sum(ys[i] for i in idx) / len(idx)
            ece += len(idx) / n * abs(mp - ob)
            rel.append({"bin": [round(lo, 2), round(hi, 2)], "n": len(idx), "meanPred": round(mp, 4), "observed": round(ob, 4)})
    return {"n": n, "logLoss": round(ll, 5), "brier": round(br, 5), "ece": round(ece, 5), "reliability": rel}


def split(rows):
    cycles = sorted({r["cycle"] for r in rows})
    if len(cycles) < 3:
        return None, cycles
    test_c, cal_c = cycles[-1], cycles[-2]
    first_seen = {}
    for r in sorted(rows, key=lambda r: r["cycle"]):
        first_seen.setdefault(r["applicant_id"], r["cycle"])
    kept = [r for r in rows if first_seen[r["applicant_id"]] == r["cycle"]]  # an applicant lives in exactly one cycle/fold
    return {"train": [r for r in kept if r["cycle"] < cal_c], "cal": [r for r in kept if r["cycle"] == cal_c], "test": [r for r in kept if r["cycle"] == test_c],
            "dropped": len(rows) - len(kept), "cycles": (cycles[0], cal_c, test_c)}, cycles


def overlap(a, b):
    return len({r["applicant_id"] for r in a} & {r["applicant_id"] for r in b})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True)
    ap.add_argument("--meta", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--l2", type=float, default=1.0)
    a = ap.parse_args()
    with open(a.meta, encoding="utf-8") as mf:
        meta = json.load(mf)
    for key in ("datasetId", "license", "collectionMethod", "samplingFrame", "selectionMechanism", "isSynthetic", "sourceType"):
        if key not in meta:
            sys.exit("dataset metadata missing: " + key)
    rows, malformed = load_rows(a.data)
    reasons = []
    if meta["isSynthetic"] or any(r["synthetic"] for r in rows):
        reasons.append("dataset contains synthetic rows; synthetic data is never validation evidence")
    if str(meta["sourceType"]).lower() in DISALLOWED_SOURCES or any(r["source"] in DISALLOWED_SOURCES for r in rows):
        reasons.append("source type is not representative real outcome data")
    sp, cycles = split(rows)
    report = {"reportVersion": REPORT_VERSION, "modelVersion": MODEL_VERSION, "generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
              "dataset": {"id": meta["datasetId"], "license": meta["license"], "isSynthetic": bool(meta["isSynthetic"]), "sourceType": meta["sourceType"],
                          "samplingFrame": meta["samplingFrame"], "selectionMechanism": meta["selectionMechanism"], "collectionMethod": meta["collectionMethod"],
                          "rows": len(rows), "malformedRowsSkipped": malformed, "applicants": len({r["applicant_id"] for r in rows}),
                          "institutions": len({r["unitid"] for r in rows}), "cycles": cycles},
              "limitations": ["Selection bias: only applicants who appear in this dataset are represented.",
                              "Evaluated only on the schools and cycles above; no claim outside them."]}
    if sp is None:
        reasons.append("fewer than 3 cycles: no temporal train/calibration/test split is possible")
        report.update({"splits": None, "metrics": None, "status": "not validated", "statusReasons": reasons})
    else:
        tr, ca, te = sp["train"], sp["cal"], sp["test"]
        w = fit_logistic(tr, a.l2) if tr else [0.0, 1.0, 0.0]

        def raw(r):
            return sigmoid(sum(wi * xi for wi, xi in zip(w, features(r))))
        cal_preds, cal_y = [raw(r) for r in ca], [r["y"] for r in ca]
        variants = {"uncalibrated": raw}
        sig_info = None
        if len(ca) >= 20 and 0 < sum(cal_y) < len(cal_y):
            f, sig_info = platt(cal_preds, cal_y)
            variants["sigmoid"] = lambda r, f=f: f(raw(r))
        if len(ca) >= ISOTONIC_MIN_ROWS:
            g = isotonic(cal_preds, cal_y)
            variants["isotonic"] = lambda r, g=g: g(raw(r))
        ys_te = [r["y"] for r in te]
        result = {"baselineRateOnly": metrics([clip(r["rate"] / 100) for r in te], ys_te)}
        for name, fn in variants.items():
            result[name] = metrics([fn(r) for r in te], ys_te)
        chosen = min(variants, key=lambda n: metrics([variants[n](r) for r in ca], cal_y)["logLoss"] if ca else 0)
        if len(te) < MIN_TEST_ROWS:
            reasons.append("test cycle has %d rows (< %d)" % (len(te), MIN_TEST_ROWS))
        if len(cycles) < MIN_CYCLES:
            reasons.append("fewer than %d cycles" % MIN_CYCLES)
        if report["dataset"]["institutions"] < MIN_INSTITUTIONS:
            reasons.append("fewer than %d institutions" % MIN_INSTITUTIONS)
        report.update({
            "splits": {"method": "temporal + applicant-grouped", "trainCycles": [c for c in cycles if c < sp["cycles"][1]], "calibrationCycle": sp["cycles"][1],
                       "testCycle": sp["cycles"][2], "groupKey": "applicant_id", "rowsDroppedForApplicantLeakage": sp["dropped"],
                       "sizes": {"train": len(tr), "calibration": len(ca), "test": len(te)},
                       "leakage": {"applicantOverlapTrainCal": overlap(tr, ca), "applicantOverlapTrainTest": overlap(tr, te), "applicantOverlapCalTest": overlap(ca, te),
                                   "cycleOverlap": 0, "featureCutoff": "inst_rate_prev and score_step must come from cycles earlier than the application's cycle (asserted by the data contract, not checkable here)"}},
            "model": {"type": "logistic regression, L2 toward the official-rate baseline", "l2": a.l2, "features": ["intercept", "logit(inst_rate_prev)", "score_step"],
                      "coefficients": [round(v, 5) for v in w]},
            "calibration": {"methodsCompared": sorted(variants), "chosenOnCalibrationFold": chosen, "sigmoid": sig_info, "isotonicEligible": len(ca) >= ISOTONIC_MIN_ROWS},
            "metrics": {"test": result},
            "interpretation": "A lower Brier score alone does not prove better calibration; read the reliability bins and support counts.",
            "status": "not validated" if reasons else "evaluated; human review required", "statusReasons": reasons})
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, sort_keys=True)
        f.write("\n")
    print("wrote %s: status=%s" % (a.out, report["status"]))


if __name__ == "__main__":
    main()
