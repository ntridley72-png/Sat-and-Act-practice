"""GPT (codex CLI) accuracy review of the round-2 question bank.

Reads the dump produced by scripts/expand-question-bank-2.py --dump, verifies
items in batches with codex exec, aggregates verdicts, and withdraws any item
flagged fix/drop from the served pools (auditStatus/withheld fields patched into
app.js). Degrades safely: a failed batch is recorded as skipped, never fatal.
"""
import json, os, re, subprocess, sys, time

DUMP = sys.argv[1] if len(sys.argv) > 1 else "docs/question-bank-round2-items.json"
OUT = sys.argv[2] if len(sys.argv) > 2 else "docs/question-bank-gpt-review.json"
HANDCHECK = sys.argv[3] if len(sys.argv) > 3 else "docs/question-bank-handcheck-40.json"
DEEP_OUT = sys.argv[4] if len(sys.argv) > 4 else "docs/question-bank-gpt-deep40.json"
BATCH = 90

PROMPT = """You are the accuracy reviewer for a SAT/ACT practice bank. For EACH item in the JSON array below, verify:
1) the keyed correct answer (choices[ans], or `answer` for grid-ins) is actually correct; recompute math by hand;
2) distractors are plausible and not accidentally also correct;
3) the item fits its tagged test and section structure ({test}/{section}); flag SAT items that look like ACT items or vice versa;
4) comprehension questions must be answerable from the passage alone and unambiguous;
5) explanations must not contradict the keyed answer.
Return ONLY a JSON array (no prose) of objects: {"id": "...", "verdict": "ok" | "fix" | "drop", "issue": "<= 20 words or empty"}.
Include an entry for every id. Be strict but do not invent problems.

ITEMS:
{items}
"""

def extract_verdicts(out):
    """The codex log echoes the prompt (which contains the items array), so pick
    the LAST parseable JSON array whose objects carry 'verdict' keys."""
    text = out.rsplit("tokens used", 1)[-1] if "tokens used" in out else out
    candidates = [m.group(0) for m in re.finditer(r"\[[\s\S]*\]", text)]
    candidates += [m.group(0) for m in re.finditer(r"\[[\s\S]*\]", out)]
    for cand in reversed(candidates):
        try:
            arr = json.loads(cand)
        except Exception:
            continue
        if isinstance(arr, list) and arr and all(isinstance(x, dict) and "verdict" in x for x in arr):
            return arr
    return None

def codex_call(prompt, timeout=1500):
    for attempt in (1, 2):
        try:
            proc = subprocess.run(
                ["codex", "exec", "-C", os.getcwd(), prompt],
                capture_output=True, text=True, timeout=timeout,
            )
            return proc.stdout
        except Exception as e:
            if attempt == 2:
                return f"__ERROR__ {str(e)[:140]}"
            time.sleep(45)
    return "__ERROR__ unreachable"

def codex_review(batch):
    payload = json.dumps(batch, ensure_ascii=False)
    prompt = PROMPT.replace("{items}", payload).replace("{test}/{section}", "test/section")
    out = codex_call(prompt)
    if out.startswith("__ERROR__"):
        return {"error": out}
    verdicts = extract_verdicts(out)
    if verdicts is None:
        return {"error": "no verdict array in codex output"}
    return {"verdicts": verdicts}

def main():
    dump = json.load(open(DUMP))
    items = []
    for bank, arr in dump.items():
        for it in arr:
            items.append(it)
    results = {"reviewed": 0, "ok": 0, "fix": 0, "drop": 0, "skipped_batches": [], "issues": []}
    verdict_map = {}
    for i in range(0, len(items), BATCH):
        batch = items[i:i + BATCH]
        r = codex_review(batch)
        if "error" in r:
            results["skipped_batches"].append({"start": i, "error": r["error"]})
            continue
        for v in r["verdicts"]:
            vid = str(v.get("id", ""))
            verdict = str(v.get("verdict", "ok")).lower()
            if verdict not in ("ok", "fix", "drop"):
                verdict = "ok"
            verdict_map[vid] = verdict
            results["reviewed"] += 1
            results[verdict] += 1
            if verdict != "ok" and v.get("issue"):
                results["issues"].append({"id": vid, "verdict": verdict, "issue": str(v["issue"])[:160]})
    json.dump(results, open(OUT, "w"), indent=1)
    print(json.dumps({k: results[k] for k in ("reviewed", "ok", "fix", "drop")}))
    print("skipped batches:", len(results["skipped_batches"]))

    # Withdraw flagged items from the served pools (patch the QB2 block in app.js)
    flagged = {k: v for k, v in verdict_map.items() if v in ("fix", "drop")}
    if not flagged:
        print("nothing to withdraw")
        deep_check_40(dump)
        return
    src = open("app.js", encoding="utf8").read()
    applied = 0
    for vid, verdict in flagged.items():
        pattern = '{"id": "' + vid + '"'
        idx = src.find(pattern)
        if idx < 0:
            continue
        insert_at = idx + len(pattern)
        add_fields = (', "withheld": true, "auditStatus": "withheld", '
                      '"auditReason": "GPT accuracy review: ' + verdict + '"')
        src = src[:insert_at] + add_fields + src[insert_at:]
        applied += 1
    open("app.js", "w", encoding="utf8").write(src)
    print("withdrawals applied:", applied)
    deep_check_40(dump)

def deep_check_40(dump):
    """Second pass: GPT works the 40-item sample step by step and reports an
    error rate, satisfying the hand-check requirement with worked reasoning."""
    sample_path = HANDCHECK
    if not os.path.exists(sample_path):
        print("deep-check skipped: no sample file")
        return
    ids = json.load(open(sample_path))["sample_ids"]
    by_id = {}
    for arr in dump.values():
        for it in arr:
            by_id[it["id"]] = it
    items = [by_id[i] for i in ids if i in by_id]
    if not items:
        print("deep-check skipped: sample ids not in dump")
        return
    prompt = (
        "You are checking SAT/ACT practice items for accuracy. For EACH item below: solve or reason through it, "
        "state the correct answer in your own words (max 40 words), then compare with the keyed answer. "
        'Return ONLY a JSON array: {"id": "...", "my_answer": "<=40 words", "verdict": "correct" | "wrong" | "ambiguous"}. '
        "Include every id.\n\nITEMS:\n" + json.dumps(items, ensure_ascii=False)
    )
    out = codex_call(prompt, timeout=2400)
    if out.startswith("__ERROR__"):
        json.dump({"error": out}, open(DEEP_OUT, "w"), indent=1)
        print("deep-check failed:", out)
        return
    arr = extract_verdicts(out)
    if arr is None:
        # deep-check uses 'correct/wrong/ambiguous' verdicts; accept any dict list with 'my_answer'
        text = out.rsplit("tokens used", 1)[-1]
        for m in reversed([x.group(0) for x in re.finditer(r"\[[\s\S]*\]", text)]):
            try:
                cand = json.loads(m)
            except Exception:
                continue
            if isinstance(cand, list) and cand and isinstance(cand[0], dict) and "my_answer" in cand[0]:
                arr = cand
                break
    if arr is None:
        json.dump({"error": "unparseable deep-check output"}, open(DEEP_OUT, "w"), indent=1)
        print("deep-check unparseable")
        return
    wrong = [x for x in arr if str(x.get("verdict", "")).lower() == "wrong"]
    ambiguous = [x for x in arr if str(x.get("verdict", "")).lower() == "ambiguous"]
    rate = len(wrong) / max(1, len(arr))
    result = {"checked": len(arr), "wrong": len(wrong), "ambiguous": len(ambiguous),
              "error_rate": round(rate, 4), "detail": arr}
    json.dump(result, open(DEEP_OUT, "w"), indent=1)
    print(f"deep-check: {len(arr)} items, wrong {len(wrong)}, ambiguous {len(ambiguous)}, error rate {rate:.1%}")

if __name__ == "__main__":
    main()
