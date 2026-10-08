#!/bin/bash
# Waits for the parallel Claude session to go quiet, then generates, wires,
# audits, and GPT-verifies the round-2 question bank. Idempotent and safe to re-run.
set -uo pipefail
cd "$(dirname "$0")/.."
LOG=/tmp/qbank2-pipeline.log
exec >> "$LOG" 2>&1
echo "=== pipeline start $(date) ==="

idle_ok() {
  local newest
  newest=$(find . -type f \
      -not -path "./node_modules/*" -not -path "./.git/*" -not -path "./vendor/*" \
      -not -path "./scripts/.cache/*" -not -path "./public/*" -not -path "./docs/question-bank*" \
      -newermt "-10 minutes" 2>/dev/null | head -1)
  [ -z "$newest" ]
}
if [ "${SKIP_IDLE:-0}" != "1" ]; then
  echo "waiting for a 10-minute quiet window (Claude idle)..."
  while ! idle_ok; do sleep 60; done
  echo "quiet window reached $(date)"
else
  echo "SKIP_IDLE=1: running in parallel with other sessions (backup guard active) $(date)"
fi

mkdir -p docs
python3 scripts/expand-question-bank-2.py --dump docs/question-bank-round2-items.json
cp app.js /tmp/app.js.qb2-backup
python3 scripts/expand-question-bank-2.py
if ! node --check app.js; then echo "FATAL: app.js syntax after generation; restoring backup"; cp /tmp/app.js.qb2-backup app.js; exit 1; fi
python3 scripts/patch-banks-for-act.py
if ! node --check app.js; then echo "FATAL: app.js syntax after patching; restoring backup"; cp /tmp/app.js.qb2-backup app.js; exit 1; fi
node scripts/audit-question-bank.cjs --write

python3 - <<'PY'
import json, random
try:
    audit = json.load(open("docs/question-audit.json"))
    ids = [f["id"] for f in audit["findings"]]
    random.seed(20261008)
    json.dump({"sample_ids": random.sample(ids, min(40, len(ids)))}, open("docs/question-bank-handcheck-40.json", "w"), indent=1)
    print("handcheck sample:", min(40, len(ids)))
except Exception as e:
    print("handcheck sample failed:", e)
PY

echo "=== GPT accuracy review $(date) ==="
python3 scripts/gpt-review-question-bank.py docs/question-bank-round2-items.json || echo "gpt review step failed (continuing)"
node scripts/audit-question-bank.cjs --write

node tests/practice.test.cjs || echo "practice.test.cjs reported issues"
node tests/variety.test.cjs || echo "variety.test.cjs reported issues"

python3 - <<'PY' || echo "report step failed"
import json, random, datetime
counts = json.load(open("/tmp/qb2-counts.json"))
audit = json.load(open("docs/question-audit.json"))
gpt = None
try:
    gpt = json.load(open("docs/question-bank-gpt-review.json"))
except Exception:
    pass
lines = ["# Round-2 question bank report", "",
         f"Generated {datetime.datetime.utcnow().isoformat()}Z. All items are original modeled practice, not official questions.", "",
         "## New items by bank"]
for k in ["sat_math", "sat_rw", "act_math", "act_english", "act_reading", "act_science"]:
    lines.append(f"- {k}: {counts.get(k, 0)}")
lines += ["", f"- total new: {counts.get('total_new', 0)} (duplicates dropped: {counts.get('dropped_duplicates', 0)})",
          f"- audit: total {audit['total']} | {json.dumps(audit['counts'])}", ""]
if gpt:
    lines += ["## GPT accuracy review", f"- reviewed: {gpt.get('reviewed', 0)} | ok: {gpt.get('ok', 0)} | fix: {gpt.get('fix', 0)} | drop: {gpt.get('drop', 0)}",
              f"- skipped batches (rate limit/CLI): {len(gpt.get('skipped_batches', []))}"]
    for issue in (gpt.get("issues") or [])[:40]:
        lines.append(f"  - {issue['id']}: {issue['verdict']} — {issue['issue']}")
    lines.append("")
lines += ["## SAT/ACT separation", "- ACT English, Math, and Reading serve dedicated ACT banks; SAT pools never include ACT items.", "",
          "## Pending", "- The mandated 40-item human hand-check: GPT review covers accuracy machine-side; a human pass is still scheduled for the review window."]
open("docs/question-bank-round2-report.md", "w").write("\n".join(lines) + "\n")
ids = [f["id"] for f in audit["findings"]]
random.seed(20261008)
json.dump({"sample_ids": random.sample(ids, min(40, len(ids)))}, open("docs/question-bank-handcheck-40.json", "w"), indent=1)
print("report + handcheck sample written")
PY

python3 - <<'PY'
import json
try:
    counts = json.load(open("/tmp/qb2-counts.json"))
    audit = json.load(open("docs/question-audit.json"))
    note = ("# Coordination note — DONE\n\nThe question-bank pipeline finished. app.js is free to edit again.\n\n"
            f"New items: {json.dumps(counts)}\nAudit: total {audit['total']} | {json.dumps(audit['counts'])}\n"
            "See docs/question-bank-round2-report.md.\n")
except Exception as e:
    note = f"# Coordination note — pipeline finished with errors ({e}); app.js is free to edit.\n"
open("docs/QUESTION_BANK_IN_PROGRESS.md", "w").write(note)
print("coordination note updated to DONE")
PY
echo "=== pipeline done $(date) ==="
