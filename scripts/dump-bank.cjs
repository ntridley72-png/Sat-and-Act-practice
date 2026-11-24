/* Print the corrected SAT question bank (after the app's own quality and logic-audit passes) as JSON for page builds. */
const path = require("node:path");
const { loadBank } = require("./verify-question-logic.cjs");
const b = loadBank(path.join(__dirname, ".."));
const keep = ["id", "section", "kind", "domain", "skill", "diff", "q", "passage", "choices", "ans", "answer", "exp", "dw", "withheld", "templateVariant", "family"];
const pick = (q, section) => Object.fromEntries(keep.map((k) => [k, k === "section" ? section : q[k]]).filter(([, v]) => v !== undefined));
process.stdout.write(JSON.stringify([...b.satMath.map((q) => pick(q, "math")), ...b.satRw.map((q) => pick(q, "rw"))]));
