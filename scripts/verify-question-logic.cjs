#!/usr/bin/env node
/* Logic audit for the question bank.
 *
 * scripts/audit-question-bank.cjs checks structure (four choices, a valid key, a long enough
 * explanation). This script checks that the keyed answer is actually RIGHT, by solving the question
 * a second way:
 *   - math: an independent solver for every templated question family, run on the stem alone, then
 *     compared with the keyed choice (and checked that exactly one choice is correct);
 *   - science: the data table is parsed and the answer recomputed from it;
 *   - everything: answer-leak checks (the key being the only choice with a label or format),
 *     numerically identical choices ("31" and "31.0"), contradictions between questions with the
 *     same stem, key-versus-explanation consistency, and template outliers.
 * Questions with no solver are listed as "unverified" so coverage is explicit, never assumed.
 *
 *   node scripts/verify-question-logic.cjs            # summary + findings, exit 1 on any hard failure
 *   node scripts/verify-question-logic.cjs --json     # machine-readable
 *   node scripts/verify-question-logic.cjs --all      # include withheld questions
 */
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

function loadBank(root) {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  const start = app.indexOf("/*__DATA_START__*/");
  const end = app.indexOf("const STORAGE_KEY", start);
  if (start < 0 || end < 0) throw new Error("Question bank data region not found in app.js");
  const ctx = vm.createContext({ console });
  vm.runInContext(app.slice(start, end), ctx);
  const get = (expr) => vm.runInContext(expr, ctx);
  return {
    satMath: get("BANK.math"), satRw: get("BANK.rw"),
    actMath: get("ACT_MATH"), actScience: get("ACT_SCIENCE"),
    actEnglish: get("ACT_ENGLISH"), actReading: get("ACT_READING"),
  };
}

const N = (s) => Number(String(s).replace(/[−–]/g, "-"));
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// A numeric reading of a choice: "12", "-3", "$10", "20%", "1/3", "15 cm", "2.5".
function choiceNumber(c) {
  const s = String(c).trim().replace(/[−–]/g, "-").replace(/[$,]/g, "").replace(/\s*(?:cm|square|cubic|degrees?|°|%|units?|liters?|bottles|pages|cells|insects|dollars|hours?|minutes?|mph).*$/i, "").trim();
  let m = s.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (m) return Number(m[1]) / Number(m[2]);
  m = s.match(/^-?\d+(?:\.\d+)?$/);
  return m ? Number(s) : null;
}
const isReduced = (c) => { const m = String(c).trim().match(/^(\d+)\s*\/\s*(\d+)$/); return !m || gcd(+m[1], +m[2]) === 1; };

/* ----------------------------------------------------------------------------------------------
   Math solvers. Each takes the stem and returns the expected value (a number), or
   { text: [substrings the keyed choice must contain], notText: [substrings it must not] }, or null
   when the stem is not this family. They are written from the stem alone, never from the key.
   ---------------------------------------------------------------------------------------------- */
const sign = (s) => (s === "+" ? 1 : -1);
const SOLVERS = [
  ["least integer x for ax±b>c", (q) => { const m = q.match(/(?:least integer(?: value)?(?: of)? x(?: for which)?|least integer x for which)\s*(\d+)x\s*([+−-])\s*(\d+)\s*>\s*(-?\d+)/); if (!m) return null; const v = (N(m[4]) - sign(m[2]) * N(m[3])) / N(m[1]); return Math.floor(v) + 1; }],
  ["y = ax±b at x", (q) => { const m = q.match(/y\s*=\s*(\d+)x\s*([+−-])\s*(\d+)\.\s*What is (?:the value of )?y when x\s*=\s*(-?\d+)/); return m ? N(m[1]) * N(m[4]) + sign(m[2]) * N(m[3]) : null; }],
  ["system x+y=a, x-y=b", (q) => { const m = q.match(/x\s*\+\s*y\s*=\s*(-?\d+)\s*(?:and|\n)\s*x\s*[−-]\s*y\s*=\s*(-?\d+)[\s\S]*?(?:value of )?(x|y)\?/); if (!m) return null; return m[3] === "x" ? (N(m[1]) + N(m[2])) / 2 : (N(m[1]) - N(m[2])) / 2; }],
  ["(x-a)(x-b)=0 larger/sum", (q) => { const m = q.match(/\(x\s*[−-]\s*(\d+)\)\(x\s*[−-]\s*(\d+)\)\s*=\s*0[\s\S]*?(larger solution|smaller solution|sum)/); if (!m) return null; const a = N(m[1]), b = N(m[2]); return /larger/.test(m[3]) ? Math.max(a, b) : /smaller/.test(m[3]) ? Math.min(a, b) : a + b; }],
  ["larger solution of (x-a)(x-b)=0", (q) => { const m = q.match(/larger solution of \(x\s*[−-]\s*(\d+)\)\(x\s*[−-]\s*(\d+)\)\s*=\s*0/); return m ? Math.max(N(m[1]), N(m[2])) : null; }],
  ["price change by percent", (q) => { const m = q.match(/costs \$(\d+(?:\.\d+)?)\. Its price (increases|decreases) by (\d+)%/); return m ? N(m[1]) * (1 + (m[2] === "increases" ? 1 : -1) * N(m[3]) / 100) : null; }],
  ["right triangle area", (q) => { const m = q.match(/perpendicular sides of lengths (\d+) cm and (\d+) cm\. What is its area/); return m ? N(m[1]) * N(m[2]) / 2 : null; }],
  ["hypotenuse from legs", (q) => { const m = q.match(/right triangle has legs of lengths (\d+) and (\d+)\. What is the length of (?:its|the) hypotenuse/); return m ? Math.hypot(N(m[1]), N(m[2])) : null; }],
  ["other leg from leg+hyp", (q) => { const m = q.match(/one leg of (\d+) and a hypotenuse of (\d+)\. What is the length of the other leg/); return m ? Math.sqrt(N(m[2]) ** 2 - N(m[1]) ** 2) : null; }],
  ["sin(A)=opp/hyp", (q) => { const m = q.match(/(?:side opposite angle A (?:is|has length) (\d+) and the hypotenuse (?:is|has length) (\d+))[\s\S]*?sin\(A\)/); return m ? N(m[1]) / N(m[2]) : null; }],
  ["tan(B) => hypotenuse", (q) => { const m = q.match(/tan\(B\)\s*=\s*(\d+)\/(\d+)\. If the side opposite B is (\d+), what is the hypotenuse/); if (!m) return null; const adj = N(m[3]) * N(m[2]) / N(m[1]); return Math.hypot(N(m[3]), adj); }],
  ["a(x+b)-cx = dx+k", (q) => { const m = q.match(/(\d+)\(x\s*\+\s*(\d+)\)\s*[−-]\s*(\d+)x is equivalent to (-?\d+)x\s*\+\s*c/); if (!m) return null; if (N(m[1]) - N(m[3]) !== N(m[4])) return { bad: "stem coefficients do not match: " + (N(m[1]) - N(m[3])) + "x vs " + m[4] + "x" }; return N(m[1]) * N(m[2]); }],
  ["third triangle angle", (q) => { const m = q.match(/two angles measure (\d+)° and (\d+)°\. What is the measure of the third angle/); return m ? 180 - N(m[1]) - N(m[2]) : null; }],
  ["similar triangles", (q) => { const m = q.match(/AB = (\d+(?:\.\d+)?), DE = (\d+(?:\.\d+)?), and BC = (\d+(?:\.\d+)?)\. What is the length of EF/); return m ? { num: N(m[3]) * N(m[2]) / N(m[1]), tol: 0.006 } : null; }],
  ["sqrt(x+a)=b", (q) => { const m = q.match(/√\(x\s*\+\s*(\d+)\)\s*=\s*(\d+)/); return m ? N(m[2]) ** 2 - N(m[1]) : null; }],
  ["exponential growth", (q) => { const m = q.match(/(?:begins with|population of) (\d+) \w+ (?:and )?(doubles|triples)(?: every (?:hour|week))?[\s\S]*?(?:after|within) (\d+) (?:hours?|weeks?)/); if (!m) return null; return N(m[1]) * (m[2] === "doubles" ? 2 : 3) ** N(m[3]); }],
  ["probability n = total", (q) => { const m = q.match(/(\d+) red beads and (\d+) blue beads[\s\S]*?(?:equals|written as) (?:\d+\/n|2\/n)[\s\S]*?What is n|(\d+) red beads and (\d+) blue beads[\s\S]*?\d+\/n/); if (!m) return null; const r = N(m[1] || m[3]), b = N(m[2] || m[4]); return r + b; }],
  ["circumference c", (q) => { const m = q.match(/radius (\d+) (?:centimeters|cm)\. Its circumference is cπ/); return m ? 2 * N(m[1]) : null; }],
  ["slope through points", (q) => { const m = q.match(/\((-?\d+),\s*(-?\d+)\) and \((-?\d+),\s*(-?\d+)\)\. What is its slope/); return m ? (N(m[4]) - N(m[2])) / (N(m[3]) - N(m[1])) : null; }],
  ["cylinder volume c", (q) => { const m = q.match(/cylinder has radius (\d+) cm and height (\d+) cm\. Its volume is cπ/); return m ? N(m[1]) ** 2 * N(m[2]) : null; }],
  ["margin of error interval", (q) => { const m = q.match(/found that (\d+)% [\s\S]*?margin of error of (\d+) percentage points/); if (!m) return null; return { text: [(N(m[1]) - N(m[2])) + "%", (N(m[1]) + N(m[2])) + "%"] }; }],
  ["complementary", (q) => { const m = q.match(/complementary\. One angle measures (\d+)(?:°| degrees)/); return m ? 90 - N(m[1]) : null; }],
  ["probability red simplest", (q) => { const m = q.match(/(\d+) red marbles and (\d+) blue marbles[\s\S]*?probability it is red/); return m ? N(m[1]) / (N(m[1]) + N(m[2])) : null; }],
  ["probability not green", (q) => { const m = q.match(/(\d+) red, (\d+) blue, and (\d+) green tokens[\s\S]*?NOT green/); return m ? (N(m[1]) + N(m[2])) / (N(m[1]) + N(m[2]) + N(m[3])) : null; }],
  ["constant rate", (q) => { const m = q.match(/(?:fills|produces) (\d+) \w+ in (\d+) minutes at a constant rate\. How many \w+ does it (?:fill|produce) in (\d+) minutes/); return m ? N(m[1]) / N(m[2]) * N(m[3]) : null; }],
  ["ratio to white/sugar", (q) => { const m = q.match(/ratio (?:of )?(\d+) to (\d+)\. If (?:the mixture contains|it contains|it uses) (\d+) (?:liters|cups) of \w+(?: paint)?(?: [\w ]*)?, how many (?:liters|cups) of \w+(?: paint)? (?:does it contain|are needed)/); return m ? N(m[3]) * N(m[2]) / N(m[1]) : null; }],
  ["ax+b=c", (q) => { const m = q.match(/(?:What value of x satisfies|Solve for x:?|What is the value of x in)\s*(\d+)x\s*([+−-])\s*(\d+)\s*=\s*(-?\d+)/); return m ? (N(m[4]) - sign(m[2]) * N(m[3])) / N(m[1]) : null; }],
  ["mean of list", (q) => { const m = q.match(/(?:mean of|Four numbers are) ([\d,\s\.and-]+?)\.?(?:\s+What is their mean)?\?/); if (!m) return null; const nums = (m[1].match(/-?\d+(?:\.\d+)?/g) || []).map(Number); return nums.length >= 2 ? nums.reduce((a, b) => a + b, 0) / nums.length : null; }],
  ["median of list", (q) => { const m = q.match(/median of the values ([\d,\s\.-]+)\?/); if (!m) return null; const a = (m[1].match(/-?\d+(?:\.\d+)?/g) || []).map(Number).sort((x, y) => x - y); const k = a.length; return k % 2 ? a[(k - 1) / 2] : (a[k / 2 - 1] + a[k / 2]) / 2; }],
  ["range", (q) => { const m = q.match(/minimum of (\d+) and a maximum of (\d+)\. What is its range/); return m ? N(m[2]) - N(m[1]) : null; }],
  ["interquartile range of 4", (q) => { const m = q.match(/For the data set ([\d,\s\.]+), what is the interquartile range of the four ordered values/); if (!m) return null; const a = (m[1].match(/\d+(?:\.\d+)?/g) || []).map(Number).sort((x, y) => x - y); if (a.length !== 4) return null; return (a[2] + a[3]) / 2 - (a[0] + a[1]) / 2; }],
  ["rental hours", (q) => { const m = q.match(/fixed \$(\d+) plus \$(\d+) per hour\. A customer pays \$(\d+)/); return m ? (N(m[3]) - N(m[1])) / N(m[2]) : null; }],
  ["min of (x-h)^2+k", (q) => { const m = q.match(/f(?:\(x\))?(?: is defined by f\(x\))?\s*=\s*\(x\s*[−-]\s*(\d+)\)²\s*\+\s*(\d+)[\s\S]*?minimum value/); return m ? N(m[2]) : null; }],
  ["quadratic-linear system larger x", (q) => { const m = q.match(/system y = x² and y = (\d+)x\s*[−-]\s*(\d+) has two solutions\. What is the larger x-value/); if (!m) return null; const b = N(m[1]), c = N(m[2]); return (b + Math.sqrt(b * b - 4 * c)) / 2; }],
  ["(x+a)^2 - a^2 = x^2+bx", (q) => { const m = q.match(/\(x\s*\+\s*(\d+)\)²\s*[−-]\s*(\d+) simplifies to x²\s*\+\s*bx/); if (!m) return null; if (N(m[1]) ** 2 !== N(m[2])) return { bad: "constant term does not cancel" }; return 2 * N(m[1]); }],
  ["slope interpretation", (q) => { const m = q.match(/fits the line y = (\d+)x \+ (\d+)\. What does the slope predict/); return m ? { text: ["about " + m[1] + " more"] } : null; }],
  ["interest simple", (q) => { const m = q.match(/(\d+(?:\.\d+)?)% simple annual interest, how much interest does \$(\d+) earn in one year/); return m ? N(m[1]) * N(m[2]) / 100 : null; }],
  ["percent of", (q) => { const m = q.match(/^What is (\d+(?:\.\d+)?)% of (\d+(?:\.\d+)?)\?/); return m ? N(m[1]) * N(m[2]) / 100 : null; }],
  ["f(c)=ax-b", (q) => { const m = q.match(/f\(x\)\s*=\s*(\d+)x\s*([+−-])\s*(\d+), what is f\((-?\d+)\)/); return m ? N(m[1]) * N(m[4]) + sign(m[2]) * N(m[3]) : null; }],
  ["speed", (q) => { const m = q.match(/travels (\d+) miles in (\d+) hours[^.]*\. What is its speed/); return m ? N(m[1]) / N(m[2]) : null; }],
  ["x/a = b", (q) => { const m = q.match(/If x ÷ (\d+) = (\d+), what is the value of x/); return m ? N(m[1]) * N(m[2]) : null; }],
  ["ax+b=c (If form)", (q) => { const m = q.match(/^(\d+)x\s*([+−-])\s*(\d+)\s*=\s*(-?\d+)\.\s*What is the value of x/); return m ? (N(m[4]) - sign(m[2]) * N(m[3])) / N(m[1]) : null; }],
  ["slope origin points", (q) => { const m = q.match(/slope of the line through the points \((-?\d+),\s*(-?\d+)\) and \((-?\d+),\s*(-?\d+)\)/); return m ? (N(m[4]) - N(m[2])) / (N(m[3]) - N(m[1])) : null; }],
  ["inequality x+a>b", (q) => { const m = q.match(/Solve the inequality x\s*\+\s*(\d+)\s*>\s*(\d+)/); return m ? { text: ["x > " + (N(m[2]) - N(m[1]))] } : null; }],
  ["system solve x", (q) => { const m = q.match(/Solve the system:\s*x\s*\+\s*y\s*=\s*(-?\d+)\s*x\s*[−-]\s*y\s*=\s*(-?\d+)\s*What is the value of x/); return m ? (N(m[1]) + N(m[2])) / 2 : null; }],
  ["quadratic roots by factor", (q) => { const m = q.match(/solutions to x\u00b2\s*([\u2212-])\s*(\d+)x\s*\+\s*(\d+)\s*=\s*0/); if (!m) return null; const b = N(m[2]), c = N(m[3]); const d = Math.sqrt(b * b - 4 * c); return { roots: [Math.round((b - d) / 2), Math.round((b + d) / 2)] }; }],
  ["hypotenuse from legs (cm)", (q) => { const m = q.match(/legs of (\d+) cm and (\d+) cm\. What is the length of the hypotenuse/); return m ? Math.hypot(N(m[1]), N(m[2])) : null; }],
  ["sin = opposite/hypotenuse (cm)", (q) => { const m = q.match(/side opposite angle A measures (\d+) cm and the hypotenuse measures (\d+) cm\. What is sin\(A\)/); return m ? N(m[1]) / N(m[2]) : null; }],
  ["cos = adjacent/hypotenuse (cm)", (q) => { const m = q.match(/side adjacent to angle B is (\d+) cm and hypotenuse is (\d+) cm\. What is cos\(B\)/); return m ? N(m[1]) / N(m[2]) : null; }],
  ["tan = opposite/adjacent (cm)", (q) => { const m = q.match(/side opposite angle C of (\d+) cm and the adjacent side of (\d+) cm\. What is tan\(C\)/); return m ? N(m[1]) / N(m[2]) : null; }],
  ["scatterplot bends upward", (q) => (/bends upward: gains in y grow larger as x increases/.test(q) ? { text: ["positive association that is not linear"] } : null)],
  ["strong positive linear r", (q) => (/strong positive linear association between hours practiced \(x\) and score \(y\)[\s\S]*correlation coefficient r/.test(q) ? { pred: (n) => n >= 0.8 && n <= 1, label: "r between 0.8 and 1" } : null)],
  ["gridin ax+b=c", (q) => { const m = q.match(/What value of x satisfies (\d+)x\s*([+−-])\s*(\d+)\s*=\s*(-?\d+)\? \(Enter a number\.\)/); return m ? (N(m[4]) - sign(m[2]) * N(m[3])) / N(m[1]) : null; }],
];

function expectedFor(q) {
  const stem = String(q.q).replace(/\s+/g, " ").trim();
  const raw = String(q.q).trim();
  for (const [name, fn] of SOLVERS) {
    let r = null;
    try { r = fn(stem) ?? fn(raw); } catch (e) { r = null; }
    if (r != null) return { name, expected: r };
  }
  return null;
}

/* ---------------------------------------------------------------------------------------------- */
function verifyMath(q) {
  const out = [];
  const hit = expectedFor(q);
  if (!hit) return { verified: false, findings: out };
  const keyed = Array.isArray(q.choices) ? q.choices[q.ans] : null;
  const gridin = q.kind === "gridin";
  const e = hit.expected;
  if (e && e.bad) { out.push({ level: "fail", rule: "stem-inconsistent", msg: `${hit.name}: ${e.bad}` }); return { verified: true, findings: out }; }
  if (typeof e === "number" || (e && e.num != null)) {
    const val = typeof e === "number" ? e : e.num, tol = typeof e === "number" ? 1e-6 : e.tol;
    if (!Number.isFinite(val)) { out.push({ level: "fail", rule: "no-solution", msg: `${hit.name}: the stem has no finite answer` }); return { verified: true, findings: out }; }
    if (gridin) {
      const got = choiceNumber(q.answer);
      if (got == null || !near(got, val, tol)) out.push({ level: "fail", rule: "wrong-key", msg: `${hit.name}: solved ${val}, answer field says ${q.answer}` });
      return { verified: true, findings: out };
    }
    const nums = q.choices.map(choiceNumber);
    const matches = nums.map((n, i) => (n != null && near(n, val, tol) ? i : -1)).filter((i) => i >= 0);
    if (!matches.length) out.push({ level: "fail", rule: "key-missing", msg: `${hit.name}: solved ${val}, but no choice equals it (keyed ${JSON.stringify(keyed)})` });
    else if (matches.length > 1) out.push({ level: "fail", rule: "ambiguous", msg: `${hit.name}: solved ${val}; choices ${matches.map((i) => JSON.stringify(q.choices[i])).join(" and ")} are all equal to it` });
    else if (matches[0] !== q.ans) out.push({ level: "fail", rule: "wrong-key", msg: `${hit.name}: solved ${val}, which is choice ${String.fromCharCode(65 + matches[0])} (${JSON.stringify(q.choices[matches[0]])}), but the key is ${String.fromCharCode(65 + q.ans)} (${JSON.stringify(keyed)})` });
    if (/simplest form/.test(q.q) && matches.length === 1 && !isReduced(q.choices[matches[0]])) out.push({ level: "fail", rule: "not-simplified", msg: `asks for simplest form but the correct choice ${JSON.stringify(q.choices[matches[0]])} is reducible` });
  } else if (e && e.pred) {
    const matches = q.choices.map((c, i) => { const n = choiceNumber(c); return n != null && e.pred(n) ? i : -1; }).filter((i) => i >= 0);
    if (matches.length !== 1) out.push({ level: "fail", rule: matches.length ? "ambiguous" : "key-missing", msg: `${hit.name}: ${matches.length} choices satisfy "${e.label}"` });
    else if (matches[0] !== q.ans) out.push({ level: "fail", rule: "wrong-key", msg: `${hit.name}: correct choice is ${String.fromCharCode(65 + matches[0])}, key is ${String.fromCharCode(65 + q.ans)}` });
  } else if (e && e.roots) {
    const want = e.roots.slice().sort((a, b) => a - b).join(",");
    const got = (c) => (String(c).replace(/\u2212/g, "-").match(/-?\d+/g) || []).map(Number).sort((a, b) => a - b).join(",");
    const matches = q.choices.map((c, i) => (got(c) === want ? i : -1)).filter((i) => i >= 0);
    if (matches.length !== 1) out.push({ level: "fail", rule: matches.length ? "ambiguous" : "key-missing", msg: `${hit.name}: expected roots ${want}; ${matches.length} choices give them` });
    else if (matches[0] !== q.ans) out.push({ level: "fail", rule: "wrong-key", msg: `${hit.name}: correct choice is ${String.fromCharCode(65 + matches[0])}, key is ${String.fromCharCode(65 + q.ans)}` });
  } else if (e && e.text) {
    const has = (c) => e.text.every((t) => String(c).includes(t));
    const matches = q.choices.map((c, i) => (has(c) ? i : -1)).filter((i) => i >= 0);
    if (matches.length !== 1) out.push({ level: "fail", rule: matches.length ? "ambiguous" : "key-missing", msg: `${hit.name}: expected a choice containing ${JSON.stringify(e.text)}; ${matches.length} choices do` });
    else if (matches[0] !== q.ans) out.push({ level: "fail", rule: "wrong-key", msg: `${hit.name}: correct choice is ${String.fromCharCode(65 + matches[0])}, key is ${String.fromCharCode(65 + q.ans)}` });
  }
  return { verified: true, findings: out };
}

/* ---------------------------------------------------------------------------------------------- */
// Science tables: "Load (g): 100 · 200 · 300 · 400"
function parseTable(q) {
  const series = [];
  String(q.q).split("\n").forEach((line) => {
    const m = line.match(/^([^:()]+?)(?:\s*\(([^)]*)\))?:\s*(-?\d+(?:\.\d+)?(?:\s*·\s*-?\d+(?:\.\d+)?)+)\s*$/);
    if (m) series.push({ name: m[1].trim(), unit: m[2] || "", v: m[3].split("·").map((x) => Number(x.trim())) });
  });
  return series.length >= 2 ? series : null;
}
function verifyScience(q) {
  const out = [];
  const t = parseTable(q);
  const last = String(q.q).trim().split("\n").pop();
  const keyed = q.choices[q.ans];
  if (!t) { const ok = templateRule(q, out); return { verified: ok, findings: out }; }
  const [x, y] = [t[0], t[1]];
  if (x.v.length !== y.v.length) { out.push({ level: "fail", rule: "table", msg: "table rows have different lengths" }); return { verified: true, findings: out }; }
  let m;
  let verified = true;
  if ((m = last.match(/At which setting is the recorded .+ value (greatest|least|lowest|highest)\?/))) {
    const idx = /greatest|highest/.test(m[1]) ? y.v.indexOf(Math.max(...y.v)) : y.v.indexOf(Math.min(...y.v));
    const want = x.v[idx];
    const matches = q.choices.map((c, i) => (choiceNumber(String(c).replace(/^[A-Za-z ]+=\s*/, "")) === want ? i : -1)).filter((i) => i >= 0);
    if (matches.length !== 1 || matches[0] !== q.ans) out.push({ level: "fail", rule: "wrong-key", msg: `${m[1]} ${y.name} is at ${x.name} = ${want}; matching choices ${JSON.stringify(matches.map((i) => q.choices[i]))}, keyed ${JSON.stringify(keyed)}` });
  } else if ((m = last.match(/Between which two consecutive settings does .+ change the fastest\?/))) {
    let best = -1, bi = 0;
    for (let i = 0; i + 1 < y.v.length; i++) { const d = Math.abs(y.v[i + 1] - y.v[i]); if (d > best + 1e-9) { best = d; bi = i; } }
    const ties = y.v.slice(0, -1).filter((_, i) => near(Math.abs(y.v[i + 1] - y.v[i]), best)).length;
    const want = `${x.v[bi]} to ${x.v[bi + 1]}`;
    if (ties > 1) out.push({ level: "fail", rule: "ambiguous", msg: `${ties} consecutive pairs tie for the fastest change` });
    else if (keyed !== want) out.push({ level: "fail", rule: "wrong-key", msg: `fastest change is ${want}; keyed ${JSON.stringify(keyed)}` });
  } else if ((m = last.match(/Assuming the trend between adjacent settings is linear, what value should the table show at .+? = (-?\d+(?:\.\d+)?)\?/))) {
    const at = Number(m[1]);
    let val = null;
    for (let i = 0; i + 1 < x.v.length; i++) if (at >= Math.min(x.v[i], x.v[i + 1]) && at <= Math.max(x.v[i], x.v[i + 1])) { val = y.v[i] + (y.v[i + 1] - y.v[i]) * (at - x.v[i]) / (x.v[i + 1] - x.v[i]); break; }
    if (val == null) out.push({ level: "fail", rule: "no-solution", msg: `${at} is outside the table` });
    else {
      const matches = q.choices.map((c, i) => (near(choiceNumber(c), val, 1e-6) ? i : -1)).filter((i) => i >= 0);
      if (!matches.length) out.push({ level: "fail", rule: "key-missing", msg: `interpolated ${val}; no choice equals it (keyed ${JSON.stringify(keyed)})` });
      else if (matches.length > 1) out.push({ level: "fail", rule: "ambiguous", msg: `interpolated ${val}; choices ${matches.map((i) => JSON.stringify(q.choices[i])).join(" and ")} are equal` });
      else if (matches[0] !== q.ans) out.push({ level: "fail", rule: "wrong-key", msg: `interpolated ${val} is choice ${String.fromCharCode(65 + matches[0])}; key is ${String.fromCharCode(65 + q.ans)}` });
    }
  } else if (/Which statement best interprets the pattern in the data\?/.test(last)) {
    const up = y.v[y.v.length - 1] > y.v[0];
    const mono = y.v.every((v, i) => i === 0 || v >= y.v[i - 1]) || y.v.every((v, i) => i === 0 || v <= y.v[i - 1]);
    const claim = String(keyed);
    const hi = /higher at the highest .+ than at the lowest/.test(claim), lo = /lower at the highest .+ than at the lowest/.test(claim);
    if (hi && !up) out.push({ level: "fail", rule: "wrong-key", msg: `key says the value rises with the setting, but the data fall (${y.v.join(", ")})` });
    else if (lo && up) out.push({ level: "fail", rule: "wrong-key", msg: `key says the value falls with the setting, but the data rise (${y.v.join(", ")})` });
    else if (!hi && !lo) verified = false;
    if (!mono && (hi || lo)) out.push({ level: "warn", rule: "non-monotonic", msg: "the data are not monotonic, so the interpretation key is a simplification" });
  } else if ((m = last.match(/^What is the change in .+? between (-?\d+(?:\.\d+)?) and (-?\d+(?:\.\d+)?)\?$/))) {
    const a = x.v.indexOf(Number(m[1])), b = x.v.indexOf(Number(m[2]));
    if (a < 0 || b < 0) out.push({ level: "fail", rule: "no-solution", msg: `settings ${m[1]} and ${m[2]} are not both in the table` });
    else {
      const val = Math.round((y.v[b] - y.v[a]) * 1e6) / 1e6;
      const matches = q.choices.map((c, i) => (near(choiceNumber(c), val) ? i : -1)).filter((i) => i >= 0);
      if (matches.length !== 1) out.push({ level: "fail", rule: matches.length ? "ambiguous" : "key-missing", msg: `change is ${val}; ${matches.length} choices equal it` });
      else if (matches[0] !== q.ans) out.push({ level: "fail", rule: "wrong-key", msg: `change is ${val} (choice ${String.fromCharCode(65 + matches[0])}); key is ${String.fromCharCode(65 + q.ans)}` });
    }
  } else if (/Do the data support the claim\?$/.test(last) && /rises steadily/.test(q.q)) {
    const rising = y.v.every((v, i) => i === 0 || v > y.v[i - 1]);
    const want = rising ? /^Yes/ : /^No/;
    if (!want.test(String(keyed))) out.push({ level: "fail", rule: "wrong-key", msg: `data ${rising ? "rise at every step" : "do not rise at every step"} (${y.v.join(", ")}) but the key is ${JSON.stringify(keyed)}` });
    if (q.choices.filter((c) => want.test(String(c))).length !== 1) out.push({ level: "fail", rule: "ambiguous", msg: "more than one choice answers yes/no the same way" });
  } else verified = false;
  if (!verified) verified = templateRule(q, out);
  return { verified, findings: out };
}

// Fixed-logic science templates: the rule is checked once here, then applied to every instance.
function templateRule(q, out) {
  const stem = String(q.q), keyed = String(q.choices[q.ans]);
  const fail = (msg) => out.push({ level: "fail", rule: "wrong-key", msg });
  const countContaining = (t) => q.choices.filter((c) => String(c).includes(t)).length;
  let m;
  if ((m = stem.match(/Scientist (\d) predicts the recorded quantity will keep changing proportionally beyond the tested range\. Scientist (\d) predicts it will level off\. Which result at the next setting would support Scientist (\d)\?/))) {
    const asked = m[3], proportional = m[1];
    const want = asked === proportional ? "continues the same proportional step" : "changes much less than the previous step";
    if (!keyed.includes(want)) fail(`the asked scientist ${asked === proportional ? "predicts proportional change" : "predicts levelling off"}, so the key must say "${want}"; it says ${JSON.stringify(keyed)}`);
    if (countContaining(want) !== 1) out.push({ level: "fail", rule: "ambiguous", msg: `${countContaining(want)} choices say "${want}"` });
    return true;
  }
  if ((m = stem.match(/Scientist (\d) claims the pattern is caused by the apparatus warming up\. Scientist (\d) claims it reflects a property of the sample\. Which observation would most directly support Scientist (\d)\?/))) {
    const want = m[3] === m[1] ? "The apparatus warms steadily" : "pre-warmed apparatus reproduces the same pattern";
    if (!keyed.includes(want)) fail(`supporting the ${m[3] === m[1] ? "warm-up" : "sample-property"} claim needs "${want}"; key is ${JSON.stringify(keyed)}`);
    if (countContaining(want) !== 1) out.push({ level: "fail", rule: "ambiguous", msg: `${countContaining(want)} choices say "${want}"` });
    return true;
  }
  if ((m = stem.match(/Student (\d) claims its dark color comes from a surface coating\. Student (\d) claims the color is part of the material itself\. Which observation would most directly support Student (\d)\?/))) {
    const coating = "Removing a thin outer layer reveals lighter material underneath";
    if (m[3] === m[1]) { if (!keyed.includes(coating)) fail(`supporting the coating claim needs "${coating}"`); }
    else if (keyed.includes(coating)) fail("that observation supports the coating claim, not the claim being asked about");
    return true;
  }
  if (/Which additional procedure would most improve the reliability of these results\?/.test(stem)) {
    if (!keyed.includes("Repeat each setting multiple times and average")) fail("reliability is improved by repeating and averaging");
    return true;
  }
  if (/Which design best isolates that variable\?/.test(stem)) {
    if (!keyed.includes("holding every other condition constant")) fail("isolating a variable means changing only it");
    return true;
  }
  if (/Which weakness most limits that conclusion\?/.test(stem)) {
    if (!keyed.includes("Other conditions could be changing along with the tested variable")) fail("a table alone cannot rule out confounding");
    return true;
  }
  if (/Which procedure best tests their question\?/.test(stem) && (m = stem.match(/whether the (.+?) of a (.+?) affects/))) {
    if (!keyed.includes("Change only the cart\u2019s mass")) fail("the procedure must change only the tested variable");
    return true;
  }
  if ((m = stem.match(/traveled in equal time intervals on three surfaces\.\nSurface A: (\d+(?:\.\d+)?) m; Surface B: (\d+(?:\.\d+)?) m; Surface C: (\d+(?:\.\d+)?) m\.\nOn which surface did the cart travel farthest\?/))) {
    const d = [m[1], m[2], m[3]].map(Number), mx = Math.max(...d);
    if (d.filter((v) => v === mx).length > 1) out.push({ level: "fail", rule: "ambiguous", msg: "two surfaces tie for farthest" });
    else if (keyed !== "Surface " + "ABC"[d.indexOf(mx)]) fail(`the farthest distance is ${mx} m on Surface ${"ABC"[d.indexOf(mx)]}; key is ${JSON.stringify(keyed)}`);
    return true;
  }
  return false;
}


/* ----------------------------------------------------------------------------------------------
   Reading & Writing template families. Their keys follow one grammar or logic rule per family, so the
   rule is written here once, independently of the generator, and every instance is checked against it.
   ---------------------------------------------------------------------------------------------- */
const ACTOR_NOUNS = ["committee", "squad", "panel", "orchestra", "team", "crew", "board", "faculty", "jury", "band", "staff", "class", "guild", "council", "bureau", "troupe", "league", "choir", "unit", "division"];
const TRANSITIONS = [  // [first sentence starts with, required transition]
  ["expected the safety manual to take a week", "However,"], ["expected the records index to take a week", "However,"], ["expected the", "However,"],
  ["The first draft contained a factual error", "Consequently,"], ["Some neighborhoods flood after storms", "Therefore,"],
  ["The prototype failed twice in testing", "By contrast,"], ["collects soil samples", "In addition,"], ["The new map shows main roads", "Moreover,"],
  ["Many cities phase in fees slowly", "For example,"], ["Several states fund tuition aid", "For instance,"],
  ["The instrument is accurate to a tenth", "Nevertheless,"], ["The archive lacked a catalog", "As a result,"],
];
function verifyText(q, out) {
  const stem = String(q.q), text = stem + " " + String(q.passage || ""), keyed = String(q.choices[q.ans]);
  const fail = (msg) => out.push({ level: "fail", rule: "wrong-key", msg });
  const only = (pred, what) => { const n = q.choices.filter(pred).length; if (n !== 1) out.push({ level: "fail", rule: n ? "ambiguous" : "key-missing", msg: `${n} choices ${what}` }); return n === 1; };
  let m;
  if (/collection of \d+ copies of the .+ ___ each year/.test(stem)) {
    if (!/^(?:grows|improves|expands|changes)$/.test(keyed)) fail(`the subject "collection" is singular, so the key must be a third-person singular verb; it is ${JSON.stringify(keyed)}`);
    only((c) => /^(?:grows|improves|expands|changes)$/.test(String(c)), "are third-person singular verbs");
    return true;
  }
  if (/submitted the .+ with a note attached to it\. When the reviewers replied, ___ thanked them/.test(stem)) {
    if (keyed !== "the members") fail(`only "the members" is a clear plural noun subject; key is ${JSON.stringify(keyed)}`);
    return true;
  }
  if ((m = stem.match(/After revising the (.+?) for clarity, ___ shared it with the other members/))) {
    const okKey = /^the \w+$/.test(keyed) && ACTOR_NOUNS.includes(keyed.slice(4)) && !keyed.includes(m[1]);
    if (!okKey) fail(`a modifier "After revising..." must be followed by whoever revised, a group that can act; key is ${JSON.stringify(keyed)}`);
    only((c) => !/\b(?:was|were)$/.test(String(c)), "name an actor instead of a passive construction");
    return true;
  }
  if ((m = stem.match(/required (\w+ing) each site, comparing the results, and ___ the findings/))) {
    if (!/ing$/.test(keyed) || /^(?:to|it) /.test(keyed)) fail(`a list of gerunds needs a gerund; key is ${JSON.stringify(keyed)}`);
    only((c) => /^\w+ing$/.test(String(c)), "are single gerunds");
    return true;
  }
  if (/Each ______ notebook held a separate/.test(stem)) {
    if (!/member's$/.test(keyed)) fail(`"Each" takes a singular possessive ("... member's"); key is ${JSON.stringify(keyed)}`);
    only((c) => /member's$/.test(String(c)), "are singular possessives");
    return true;
  }
  if (/By the time the reviewers assembled, the .+ ___ the .+ days earlier/.test(stem)) {
    if (!/^had \w+/.test(keyed)) fail(`an action completed before another past action takes the past perfect ("had ..."); key is ${JSON.stringify(keyed)}`);
    only((c) => /^had /.test(String(c)), "use the past perfect");
    return true;
  }
  if (/recorded the observation carefully ___ the notes were later verified/.test(stem)) {
    if (keyed !== ";") fail(`two complete sentences with no conjunction need a semicolon; key is ${JSON.stringify(keyed)}`);
    return true;
  }
  if (/filed the .+ on time ___ the office still marked the submission late/.test(stem)) {
    if (keyed !== ", yet") fail(`contrast between two clauses needs ", yet"; key is ${JSON.stringify(keyed)}`);
    return true;
  }
  if (/^The .+ ___ was filed with the .+ on Friday/.test(stem)) {
    // A removable describing phrase takes a comma on each side. Every choice has the same words and differs only in punctuation.
    const bothSides = (c) => /^, .+,$/.test(String(c));
    if (!bothSides(keyed)) fail(`a removable phrase needs a comma on each side; key is ${JSON.stringify(keyed)}`);
    only(bothSides, "set the phrase off with a comma on each side");
    return true;
  }
  if (/Which choice completes the text with the most logical transition\?/.test(stem) && /___/.test(stem)) {
    const first = stem.split("\n")[0].replace(/\s+/g, " ");
    const rule = TRANSITIONS.find(([start]) => first.includes(start));
    if (rule) {
      if (keyed !== rule[1]) fail(`the relationship here calls for ${JSON.stringify(rule[1])}; key is ${JSON.stringify(keyed)}`);
      return true;
    }
  }
  if (/While researching a topic, a student took these notes:/.test(stem) && (m = stem.match(/(?:received|drew) (\d+) visits per day[\s\S]*?(?:received|drew) (\d+) visits per day/))) {
    const a = Number(m[1]), b = Number(m[2]);
    if (/emphasize the (?:size of the )?change in daily visits/.test(stem)) {
      const claim = keyed.match(/from (\d+)(?: visits)? (?:before the sign )?to (\d+)/);
      if (!claim || Number(claim[1]) !== a || Number(claim[2]) !== b) fail(`the key must state the rise from ${a} to ${b}; it says ${JSON.stringify(keyed)}`);
      const by = keyed.match(/by (\d+)/); if (by && Number(by[1]) !== b - a) fail(`the key says "by ${by[1]}" but the change is ${b - a}`);
      only((c) => /rose|increase/i.test(String(c)), "describe the rise");
    } else if (/(?:describe a limitation|explain why the counts alone cannot prove)/.test(stem)) {
      if (!/do not (?:establish|show) whether/.test(keyed)) fail(`a limitation on causal claims is "the notes do not show whether other conditions changed"; key is ${JSON.stringify(keyed)}`);
      only((c) => /do not (?:establish|show) whether/.test(String(c)), "state a limitation");
    } else return false;
    return true;
  }
  if (/The two ______ reports were displayed side by side/.test(stem) || /The ___ notebooks\.”/.test(stem)) {
    if (!/(?:members|assistants)['’]$/.test(keyed)) fail(`two owners need a plural possessive (an apostrophe after the s); key is ${JSON.stringify(keyed)}`);
    only((c) => /(?:members|assistants)['’]$/.test(String(c)), "are plural possessives");
    return true;
  }
  if (/How would the author of Text 1 most likely respond to the argument in Text 2\?/.test(stem)) {
    if (!/^By noting that the argument overstates the finding/.test(keyed)) fail(`Text 1 treats yearly records as the building blocks of the trend, so it would say Text 2 overstates; key is ${JSON.stringify(keyed)}`);
    return true;
  }
  if ((m = stem.match(/As used in the text, “(\w+)” most nearly means/))) {
    const MEANING = { modest: "limited in scale", novel: "new to the situation", sound: "reliably reasoned", faint: "barely detectable", measured: "taken with deliberate care", sparse: "thin on the ground", stubborn: "resistant to change", deliberate: "intentionally chosen" };
    if (MEANING[m[1]]) { if (keyed !== MEANING[m[1]]) fail(`"${m[1]}" here means ${JSON.stringify(MEANING[m[1]])}; key is ${JSON.stringify(keyed)}`); return true; }
  }
  if ((m = text.match(/patched equipment lasted (\d+) months on average, while equipment left unrepaired until failure lasted (\d+) months/))) {
    if (keyed !== `Patched equipment lasted ${m[1]} months versus ${m[2]} months for equipment run to failure.`) fail(`the evidence is the ${m[1]} vs ${m[2]} months comparison; key is ${JSON.stringify(keyed)}`);
    return true;
  }
  if (/After storms, the crew at .+ checked .+ more often than the schedule required/.test(text) && /Which inference is most strongly supported/.test(stem)) {
    if (keyed !== "The crew increased its checks in response to storm conditions.") fail(`post-storm clustering of extra checks supports "increased its checks in response to storm conditions"; key is ${JSON.stringify(keyed)}`);
    return true;
  }
  if (/^A table from a .+ shows:/m.test(stem)) {
    const tb = parseTable({ q: stem.replace(/^A table from a .+ shows:\n?/m, "") });
    if (tb) {
      const [x, y] = [tb[0].v, tb[1].v];
      const dx = x[1] - x[0], dy = y[1] - y[0];
      const linear = x.every((v, i) => i === 0 || near(v - x[i - 1], dx)) && y.every((v, i) => i === 0 || near(v - y[i - 1], dy));
      const falling = y.every((v, i) => i === 0 || v < y[i - 1]);
      let k;
      if ((k = keyed.match(/^The times rise by ([\d.]+) h per ([\d.]+) km\.$/)) || (k = keyed.match(/^([\d.]+) h per ([\d.]+) km\.$/))) {
        if (!linear || !near(Number(k[1]), dy) || !near(Number(k[2]), dx)) fail(`the table rises ${dy} per ${dx}; key says ${k[1]} per ${k[2]}`);
        return true;
      }
      if (/falls as .+ rises\.$/.test(keyed)) { if (!falling) fail("the key says the values fall, but the table does not fall at every step"); return true; }
    }
  }
  if (/For decades, the crew that maintained .+ followed a fixed routine/.test(text) && /overall structure/.test(stem)) {
    if (!/^It describes a routine, then a change to it/.test(keyed)) fail(`the passage moves from routine to change to effect; key is ${JSON.stringify(keyed)}`);
    return true;
  }
  if ((m = text.match(/Interval A: (\d+) days of service; Interval B: (\d+) days; Interval C: (\d+) days/))) {
    const d = { A: +m[1], B: +m[2], C: +m[3] };
    const top = Object.keys(d).sort((x, y) => d[y] - d[x])[0];
    if (keyed !== `Interval ${top} provided the longest service before each repair.`) fail(`Interval ${top} has the most days (${d[top]}); key is ${JSON.stringify(keyed)}`);
    q.choices.forEach((c, i) => { const t = String(c).match(/^Interval (\w) had longer service before each repair than Interval (\w)\./); if (t && i === q.ans) fail("the keyed claim must be the true one"); if (t && d[t[1]] > d[t[2]]) out.push({ level: "fail", rule: "ambiguous", msg: `${JSON.stringify(c)} is also true (${d[t[1]]} > ${d[t[2]]})` }); });
    return true;
  }
  return false;
}

/* ---------------------------------------------------------------------------------------------- */
// Checks that apply to every question.
const norm = (s) => String(s == null ? "" : s).toLowerCase().replace(/\s+/g, " ").trim();
function generic(q, bank) {
  const out = [];
  const gridin = q.kind === "gridin";
  if (!gridin) {
    if (!Number.isInteger(q.ans) || q.ans < 0 || q.ans >= (q.choices || []).length) { out.push({ level: "fail", rule: "bad-key-index", msg: `key index ${q.ans} is outside the ${(q.choices || []).length} choices` }); return out; }
    const seen = new Map();
    q.choices.forEach((c, i) => { const k = norm(c); if (seen.has(k)) out.push({ level: "fail", rule: "duplicate-choices", msg: `choices ${String.fromCharCode(65 + seen.get(k))} and ${String.fromCharCode(65 + i)} are identical` }); seen.set(k, i); });
    const nums = q.choices.map(choiceNumber);
    if (nums.every((n) => n != null)) {
      for (let i = 0; i < nums.length; i++) for (let j = i + 1; j < nums.length; j++) if (near(nums[i], nums[j]) && norm(q.choices[i]) !== norm(q.choices[j])) out.push({ level: "fail", rule: "equal-values", msg: `choices ${JSON.stringify(q.choices[i])} and ${JSON.stringify(q.choices[j])} have the same value` });
    }
    // Answer leak: the key is the only choice with a label ("Load = 400") or a unit the others lack.
    const labelled = q.choices.map((c) => /^[A-Za-z][A-Za-z ]*\s=\s/.test(String(c)));
    if (labelled.filter(Boolean).length === 1 && labelled[q.ans]) out.push({ level: "fail", rule: "answer-leak", msg: `only the keyed choice is labelled: ${JSON.stringify(q.choices[q.ans])} among ${JSON.stringify(q.choices)}` });
    const first = q.choices.map((c) => String(c).trim().split(/\s+/)[0].toLowerCase());
    const others = first.filter((_, i) => i !== q.ans);
    if (q.choices.length >= 4 && others.every((w) => w === others[0]) && first[q.ans] !== others[0] && /^[a-z]{2,}$/.test(others[0]) && !/^(?:the|a|an|it|they|he|she|this|that|these|those|no|not)$/.test(others[0])) out.push({ level: "warn", rule: "first-word-leak", msg: `every distractor begins with "${others[0]}" but the keyed choice does not: ${JSON.stringify(q.choices[q.ans])}` });
    const withDecimal = q.choices.map((c) => /\.\d/.test(String(c)));
    if (nums.every((n) => n != null) && withDecimal.filter(Boolean).length === 1 && withDecimal[q.ans] && !q.choices.some((c, i) => i !== q.ans && /\.\d/.test(String(c)))) out.push({ level: "warn", rule: "format-leak", msg: `only the keyed choice has a decimal point: ${JSON.stringify(q.choices)}` });
  } else if (q.answer == null || choiceNumber(q.answer) == null && !/^[\d./\-−]+$/.test(String(q.answer))) out.push({ level: "fail", rule: "gridin-answer", msg: `grid-in answer ${JSON.stringify(q.answer)} is not a number` });
  if (!q.exp || String(q.exp).length < 20) out.push({ level: "warn", rule: "short-explanation", msg: "explanation is missing or very short" });
  return out;
}

// Wording defects a student would notice: template leaks, "1 copies", "a umbrella", non-words as distractors.
const VOWEL_SOUND_EXCEPT_A = /^(?:one|once|u(?:ni|ti|se|su|ro|ra|ber)|eu|ew)/i;   // "a one", "a university", "a European"
const SILENT_H = /^(?:hour|honest|honor|honour|heir)/i;                          // "an hour"
function hygiene(q) {
  const out = [];
  (q.choices || []).forEach((c, i) => { if (String(c).trim() === "") out.push({ level: "fail", rule: "blank-choice", msg: `choice ${String.fromCharCode(65 + i)} is empty` }); });
  const parts = [["question", String(q.q)], ["passage", String(q.passage || "")], ["explanation", String(q.exp || "")]].concat((q.choices || []).map((c, i) => ["choice " + String.fromCharCode(65 + i), String(c)])).concat((q.dw || []).map((d, i) => ["distractor note " + (i + 1), String(d)]));
  const LABELLED = /(?:Student|Scientist|Trial|Study|Sample|Experiment|Group|Model|Theory|Text|Passage|Option|Method|Figure|Table|Test|Plan|Machine|Container|Surface|Species|Site|Case|Part|Step|Line|Point|Week|Day|Year|Hour|Minute|Time|Run|Set|Phase|Unit|Level|Number|Quartile|Class|Type|Fund|Account|Team|Lab|Tank|Check)\s$|[=<>≤≥(−-]\s?$/;
  parts.forEach(([where, t]) => {
    let m;
    if ((m = t.match(/undefined|\bNaN\b|\[object|\$\{|\{\w+\}|\bnull\b/))) out.push({ level: "fail", rule: "template-leak", msg: `${where} contains "${m[0]}"` });
    // "a umbrella" / "an dog": lowercase article only, real words only (>= 4 letters), so "a and b" or variable names do not count
    for (const mm of t.matchAll(/\ba\s+([aeiou][a-z]{3,})\b/g)) if (!VOWEL_SOUND_EXCEPT_A.test(mm[1]) && !/^(?:and|also|else|each|even|only)$/.test(mm[1])) out.push({ level: "warn", rule: "article", msg: `${where}: "a ${mm[1]}" should be "an ${mm[1]}"` });
    for (const mm of t.matchAll(/\ban\s+([b-df-hj-np-tv-z][a-z]{3,})\b/g)) if (!SILENT_H.test(mm[1])) out.push({ level: "warn", rule: "article", msg: `${where}: "an ${mm[1]}" should be "a ${mm[1]}"` });
    for (const mm of t.matchAll(/\b1\s+(?!(?:cm|m|km|mm|g|kg|mL|L|N|V|mA|s|h|ft|in|inch|foot|percent|dollar|day|week|year|hour|minute|second)\b)([a-z]{3,}s)\b/g)) {
      const before = t.slice(Math.max(0, mm.index - 14), mm.index);
      if (!LABELLED.test(before) && !/^(?:is|was|means|has|does|gives|makes|represents|becomes|equals|always|plus|times|and)$/.test(mm[1])) out.push({ level: "fail", rule: "wording", msg: `${where}: "1 ${mm[1]}" should be singular` });
    }
    t.split("\n").forEach((line) => { if (/\S {2,}\S/.test(line) && !/·/.test(line)) out.push({ level: "warn", rule: "spacing", msg: `${where}: double space` }); });
    if (/\w [,.;:!?](?!\.)/.test(t) && !/___ ,|\s[?!]\s*$/.test(t)) out.push({ level: "warn", rule: "spacing", msg: `${where}: space before punctuation` });
    if ((t.match(/\(/g) || []).length !== (t.match(/\)/g) || []).length && where !== "explanation" && !/^\s*[A-Da-d1-9]\)/m.test(t)) out.push({ level: "warn", rule: "brackets", msg: `${where}: unbalanced parentheses` });
  });
  // A distractor built by inflecting an inflected word twice ("expandses" from "expands").
  const words = new Set((q.choices || []).flatMap((c) => String(c).toLowerCase().match(/[a-z]+/g) || []));
  (q.choices || []).forEach((c) => { (String(c).toLowerCase().match(/[a-z]{5,}es\b/g) || []).forEach((w) => { const base = w.slice(0, -2); if (base.endsWith("s") && words.has(base)) out.push({ level: "fail", rule: "non-word-distractor", msg: `choice "${c}" contains "${w}", a non-word made from "${base}"` }); }); });
  // "The league submitted rule book with a note": an article is missing before a singular count noun.
  if (/\bsubmitted\s+(?!the\b|a\b|an\b|its\b|their\b|his\b|her\b|our\b|one\b|two\b|three\b|\d)[a-z]+\s+[a-z]+\s+with a note/i.test(String(q.q) + " " + String(q.passage || ""))) out.push({ level: "fail", rule: "wording", msg: "missing article after \"submitted\" (e.g. \"submitted rule book\")" });
  return out;
}

// Does the explanation's reasoning end somewhere other than the keyed value? (numeric answers only)
function explanationCheck(q) {
  if (q.kind === "gridin" || !Array.isArray(q.choices)) return null;
  const keyedN = choiceNumber(q.choices[q.ans]);
  if (keyedN == null) return null;
  const nums = (String(q.exp).replace(/[−–]/g, "-").match(/-?\d+(?:\.\d+)?(?:\/\d+)?/g) || []).map((s) => (s.includes("/") ? Number(s.split("/")[0]) / Number(s.split("/")[1]) : Number(s)));
  if (!nums.length) return null;
  if (nums.some((n) => near(n, keyedN, 0.006))) return null;
  const frac = String(q.choices[q.ans]).match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac && nums.includes(Number(frac[1])) && nums.includes(Number(frac[2]))) return null;   // "7 of 11" for 7/11
  // a probability key such as 0.636 is reached when the explanation shows its numerator and denominator
  const asked = String(q.q).match(/(\d+) red marbles and (\d+) blue marbles/);
  if (asked && nums.includes(Number(asked[1])) && nums.includes(Number(asked[1]) + Number(asked[2]))) return null;
  return { level: "warn", rule: "explanation-misses-key", msg: `the explanation never reaches the keyed value ${keyedN} (it mentions ${nums.slice(-4).join(", ")})` };
}

/* ---------------------------------------------------------------------------------------------- */
function run(root, { all = false } = {}) {
  const bank = loadBank(root);
  let HAND = {};
  ["math", "science", "rw"].forEach((n) => { try { Object.assign(HAND, JSON.parse(fs.readFileSync(path.join(root, "scripts", "data", n + "-hand-solved.json"), "utf8")).expected || {}); } catch (e) { /* optional */ } });
  const sets = [["sat-math", bank.satMath, "math"], ["act-math", bank.actMath, "math"], ["act-science", bank.actScience, "science"], ["sat-rw", bank.satRw, "text"], ["act-english", bank.actEnglish, "text"], ["act-reading", bank.actReading, "text"]];
  const findings = [], coverage = {};
  const seenId = new Map();
  const stems = new Map();
  sets.forEach(([setName, qs, kind]) => {
    coverage[setName] = { total: 0, checked: 0, solved: 0, unverified: [], withheld: 0 };
    qs.forEach((q) => {
      if (q.withheld && !all) { coverage[setName].withheld++; return; }
      coverage[setName].total++;
      if (seenId.has(q.id)) findings.push({ id: q.id, set: setName, level: "fail", rule: "duplicate-id", msg: `id also used in ${seenId.get(q.id)}` });
      seenId.set(q.id, setName);
      const add = (f) => findings.push(Object.assign({ id: q.id, set: setName, q: String(q.q).slice(0, 110) }, f));
      generic(q, bank).forEach(add);
      hygiene(q).forEach(add);
      let v = { verified: false, findings: [] };
      if (kind === "math") v = verifyMath(q);
      else if (kind === "science") v = verifyScience(q);
      else if (kind === "text") { const f = []; const ok = verifyText(q, f); v = { verified: ok, findings: f }; }
      const hand = HAND[q.id];
      if (!v.verified && hand != null) {
        v = { verified: true, hand: true, findings: [] };
        const keyedText = q.kind === "gridin" ? String(q.answer) : String(q.choices[q.ans]);
        if (norm(keyedText) !== norm(hand)) v.findings.push({ level: "fail", rule: "wrong-key", msg: `hand-solved correct answer is ${JSON.stringify(hand)}, but the key is ${JSON.stringify(keyedText)}` });
        else if (q.kind !== "gridin" && q.choices.filter((c) => norm(c) === norm(hand)).length !== 1) v.findings.push({ level: "fail", rule: "ambiguous", msg: `the hand-solved answer ${JSON.stringify(hand)} appears more than once among the choices` });
        coverage[setName].hand = (coverage[setName].hand || 0) + 1;
      }
      v.findings.forEach(add);
      const ex = explanationCheck(q); if (ex) add(ex);
      if (v.verified) coverage[setName].solved++; else coverage[setName].unverified.push(q.id);
      coverage[setName].checked++;
      // stem contradictions: same stem + passage + choice set, different keyed text
      if (Array.isArray(q.choices) && q.kind !== "gridin") {
        const key = norm(q.q) + "|" + norm(q.passage) + "|" + q.choices.map(norm).sort().join("|");
        const keyed = norm(q.choices[q.ans]);
        const prev = stems.get(key);
        if (prev && prev.keyed !== keyed) add({ level: "fail", rule: "contradiction", msg: `identical question ${prev.id} keys ${JSON.stringify(prev.keyedText)} but this one keys ${JSON.stringify(q.choices[q.ans])}` });
        else if (prev) add({ level: "warn", rule: "duplicate-question", msg: `identical to ${prev.id}` });
        else stems.set(key, { id: q.id, keyed, keyedText: q.choices[q.ans] });
      }
    });
  });

  // Answer position and length bias per set.
  const bias = {};
  sets.forEach(([setName, qs]) => {
    const live = qs.filter((q) => (all || !q.withheld) && Array.isArray(q.choices) && q.kind !== "gridin");
    const pos = {}; let longest = 0, n = 0;
    live.forEach((q) => { pos[q.ans] = (pos[q.ans] || 0) + 1; const L = q.choices.map((c) => String(c).length); if (L[q.ans] === Math.max(...L) && L.filter((x) => x === Math.max(...L)).length === 1) longest++; n++; });
    bias[setName] = { n, position: pos, longestIsKey: n ? +(longest / n).toFixed(3) : 0 };
  });

  // Runs of the same keyed position in bank order (a student who notices "it's always A" gains for free).
  sets.forEach(([setName, qs]) => {
    const live = qs.filter((q) => (all || !q.withheld) && Array.isArray(q.choices) && q.kind !== "gridin");
    let run = 1;
    for (let i = 1; i <= live.length; i++) {
      if (i < live.length && live[i].ans === live[i - 1].ans) { run++; continue; }
      if (run >= 8) findings.push({ id: live[i - run].id + ".." + live[i - 1].id, set: setName, level: "warn", rule: "key-run", msg: `${run} consecutive questions are all keyed ${String.fromCharCode(65 + live[i - 1].ans)}` });
      run = 1;
    }
  });

  // Template outliers: among questions with the same stem skeleton and the same set of choices,
  // the keyed text should be the same one. A different key is either a corrupted key or a real variant.
  const groups = new Map();
  sets.forEach(([setName, qs]) => qs.forEach((q) => {
    if ((q.withheld && !all) || !Array.isArray(q.choices) || q.kind === "gridin") return;
    const skeleton = norm(String(q.q).split("\n").pop()).replace(/-?\d+(\.\d+)?/g, "#").replace(/(load|ramp|fertilizer|depth|voltage|temperature|pump|drain|rainfall|wind|stretch|speed|height|oxygen|brightness|rate|yield|hours|runoff) /g, "§ ");
    const key = setName + "|" + skeleton + "|" + q.choices.map(norm).sort().join("|");
    (groups.get(key) || groups.set(key, []).get(key)).push(q);
  }));
  groups.forEach((qs) => {
    if (qs.length < 4) return;
    const counts = {};
    qs.forEach((q) => { const k = norm(q.choices[q.ans]); counts[k] = (counts[k] || 0) + 1; });
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (top.length > 1 && top[0][1] >= qs.length * 0.8) qs.filter((q) => norm(q.choices[q.ans]) !== top[0][0]).forEach((q) => findings.push({ id: q.id, set: "template", level: "warn", rule: "template-outlier", msg: `${top[0][1]} of ${qs.length} identical-choice questions key ${JSON.stringify(top[0][0])}; this one keys ${JSON.stringify(q.choices[q.ans])}`, q: String(q.q).slice(-100) }));
  });

  return { coverage, bias, findings };
}

module.exports = { run, loadBank, choiceNumber, expectedFor };

if (require.main === module) {
  const root = path.join(__dirname, "..");
  const args = process.argv.slice(2);
  const rep = run(root, { all: args.includes("--all") });
  if (args.includes("--json")) { console.log(JSON.stringify(rep, null, 1)); }
  else {
    console.log("Question logic audit");
    Object.entries(rep.coverage).forEach(([k, c]) => console.log(`  ${k.padEnd(12)} ${String(c.total).padStart(5)} questions, ${String(c.solved).padStart(5)} independently re-solved, ${String(c.unverified.length).padStart(5)} not machine-verifiable${c.withheld ? `, ${c.withheld} withheld skipped` : ""}`));
    console.log("Answer-position and length bias:");
    Object.entries(rep.bias).forEach(([k, b]) => console.log(`  ${k.padEnd(12)} positions ${JSON.stringify(b.position)}  key-is-longest ${(b.longestIsKey * 100).toFixed(1)}%`));
    const fails = rep.findings.filter((f) => f.level === "fail"), warns = rep.findings.filter((f) => f.level === "warn");
    const byRule = (list) => list.reduce((o, f) => { o[f.rule] = (o[f.rule] || 0) + 1; return o; }, {});
    console.log(`Hard failures: ${fails.length} ${JSON.stringify(byRule(fails))}`);
    console.log(`Warnings: ${warns.length} ${JSON.stringify(byRule(warns))}`);
    fails.slice(0, 80).forEach((f) => console.log(`  FAIL ${f.id} [${f.rule}] ${f.msg}`));
    if (fails.length > 80) console.log(`  ... ${fails.length - 80} more (use --json)`);
  }
  process.exit(rep.findings.some((f) => f.level === "fail") ? 1 : 0);
}
