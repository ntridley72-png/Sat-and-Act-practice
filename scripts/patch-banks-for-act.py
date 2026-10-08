"""Wire the round-2 bank into pools: SAT/ACT separation, 5-choice ACT math,
grid-in handling in the quality gate, audit/test compatibility. Idempotent."""
import re, sys

def patch(path, replacements, marker=None):
    src = open(path, encoding="utf8").read()
    if marker and marker in src:
        print(f"{path}: already patched ({marker})")
        return
    for old, new, label in replacements:
        if src.count(old) != 1:
            print(f"{path}: SKIP {label} (found {src.count(old)} matches)")
            continue
        src = src.replace(old, new)
        print(f"{path}: applied {label}")
    if marker:
        src = src.replace("/*__QB2_END__*/", "/*__QB2_END__*/ " + marker, 1) if "/*__QB2_END__*/" in src else src + "\n" + marker + "\n"
    open(path, "w", encoding="utf8").write(src)

# 1) app.js — real ACT banks replace the SAT-derived pools; ACT math gets its own pool
patch("app.js", [
    ('BANK.english = BANK.rw.filter((q) => q.kind === "writing");',
     'BANK.english = ACT_ENGLISH; // SAT items are never served as ACT English\nBANK.actmath = ACT_MATH;', "english+actmath pool"),
    ('BANK.reading = BANK.rw.filter((q) => q.kind === "reading");',
     'BANK.reading = ACT_READING; // SAT items are never served as ACT Reading', "reading pool"),
    ('{key:"math", label:"Math", bank:"math", adaptive:false}',
     '{key:"math", label:"Math", bank:"actmath", adaptive:false}', "ACT math section bank key"),
    ('  if (!Array.isArray(q.choices) || q.choices.length !== 4 || new Set(q.choices.map(String)).size !== 4 || q.ans < 0 || q.ans > 3 || !q.exp) {\n    q.auditStatus = "withheld"; q.withheld = true; q.auditReason = "Incomplete or ambiguous answer structure."; return q;\n  }',
     '''  if (q.kind === "gridin") {
    q.auditStatus = "passed"; q.withheld = true;
    q.auditReason = "Student-produced response: valid grid-in, excluded from new sets until the engine renders free-response input.";
    return q;
  }
  const wantChoices = /^am/.test(q.id) ? 5 : 4;
  if (!Array.isArray(q.choices) || q.choices.length !== wantChoices || new Set(q.choices.map(String)).size !== wantChoices || q.ans < 0 || q.ans > wantChoices - 1 || !q.exp) {
    q.auditStatus = "withheld"; q.withheld = true; q.auditReason = "Incomplete or ambiguous answer structure."; return q;
  }''', "quality gate 5-choice + gridin"),
], marker="/*__QB2_WIRED__*/")

# 2) audit script — accept 5-choice ACT math and grid-ins, validate dw when present
patch("scripts/audit-question-bank.cjs", [
    ("""  if (Array.isArray(q.choices) && new Set(q.choices.map(String)).size !== q.choices.length) issues.push('Duplicate answer choices.');
  if (!Number.isInteger(q.ans) || q.ans < 0 || q.ans > 3) issues.push('Answer index is invalid.');""",
     """  const gridin = q.kind === 'gridin';
  const wantFive = /^am/.test(q.id);
  if (gridin) {
    if (!q.answer) issues.push('Grid-in missing its numeric answer string.');
  } else {
    if (Array.isArray(q.choices) && new Set(q.choices.map(String)).size !== q.choices.length) issues.push('Duplicate answer choices.');
    if (Array.isArray(q.choices) && q.choices.length !== (wantFive ? 5 : 4)) issues.push('Wrong number of choices.');
    if (!Number.isInteger(q.ans) || q.ans < 0 || q.ans > (wantFive ? 4 : 3)) issues.push('Answer index is invalid.');
  }
  if (Array.isArray(q.dw) && !gridin) {
    const want = (q.choices || []).length - 1;
    if (q.dw.length !== want || q.dw.some((w) => !w || String(w).trim().length < 8)) issues.push('Distractor explanations missing or too short.');
  }""", "audit 5-choice/gridin/dw"),
], marker="/*__QB2_AUDIT__*/")

# 3) practice test — one question per bank entry had a strict 4-choice assert
src = open("tests/practice.test.cjs", encoding="utf8").read()
if "q.kind === \"gridin\"" not in src:
    old = 'assert.equal(q.choices.length,4);'
    if src.count(old) == 1:
        src = src.replace(old, 'if(q.kind==="gridin"){assert.ok(q.answer,"grid-in needs an answer");}else{assert.equal(q.choices.length, q.id.startsWith("am")?5:4);}')
        open("tests/practice.test.cjs", "w", encoding="utf8").write(src)
        print("tests/practice.test.cjs: applied choice-count relax")
    else:
        print(f"tests/practice.test.cjs: SKIP (found {src.count(old)})")
else:
    print("tests/practice.test.cjs: already patched")
print("patcher done")
