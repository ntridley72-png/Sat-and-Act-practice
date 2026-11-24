#!/usr/bin/env node
/* Typed-answer ("grid-in") SAT math questions, beyond the nine whole-number formulas already in the bank.
 *
 * Nine families, six items each, from fixed parameter tables (no randomness, so the output is reproducible). Answers are
 * computed with exact fraction arithmetic and mix whole numbers, decimals, fractions (some that repeat) and negatives, like the
 * real test's student-produced responses. Every topic name is one the bank already uses, so these questions join existing skills.
 * The independent check is scripts/verify-question-logic.cjs, which re-solves each one from its stem text.
 *
 *   node scripts/gen-gridin.cjs          # rewrites the marked block in app.js
 *   node scripts/gen-gridin.cjs --print  # prints the questions without touching app.js
 */
const fs = require("node:fs");
const path = require("node:path");

const MINUS = "−";
const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b]; } return a || 1; };
// An exact rational number.
const Q = (n, d = 1) => { if (d < 0) { n = -n; d = -d; } const g = gcd(n, d); return { n: n / g, d: d / g }; };
const add = (a, b) => Q(a.n * b.d + b.n * a.d, a.d * b.d);
const sub = (a, b) => Q(a.n * b.d - b.n * a.d, a.d * b.d);
const mul = (a, b) => Q(a.n * b.n, a.d * b.d);
const div = (a, b) => Q(a.n * b.d, a.d * b.n);
const terminating = (q) => { let d = q.d; while (d % 2 === 0) d /= 2; while (d % 5 === 0) d /= 5; return d === 1; };
const num = (q) => q.n / q.d;
const neg = (s) => String(s).replace(/^-/, MINUS);
const signed = (n) => (n < 0 ? MINUS + Math.abs(n) : String(n));
const coef = (n, v) => (n === 1 ? v : n === -1 ? MINUS + v : signed(n) + v);
// "ax + by" written the way a textbook would: 2x + y, x − y, 4x − y
function lin(a, b, x = "x", y = "y") {
  const first = coef(a, x), sign = b < 0 ? " " + MINUS + " " : " + ", mag = Math.abs(b) === 1 ? y : Math.abs(b) + y;
  return first + sign + mag;
}
// The answer as the student would type it: whole number, a fraction (reduced), or a decimal; each family says which it prefers.
function typed(q, prefer) {
  if (q.d === 1) return String(q.n);
  const dec = String(num(q)), frac = q.n + "/" + q.d;
  const fits = (s) => s.replace(/^-/, "").length <= 5;
  if (prefer === "decimal" && terminating(q) && fits(dec)) return dec;
  if (fits(frac)) return frac;
  return fits(dec) ? dec : frac;
}
const also = (q, answer) => (q.d === 1 ? "" : terminating(q) ? " (The decimal " + String(num(q)) + " is accepted too.)" : " (A decimal is accepted too if it has at least 3 decimal places, such as " + Math.floor(num(q) * 1000) / 1000 + ".)");

const items = [];
const push = (o) => items.push(Object.assign({ bank: "math", test: "sat", section: "math", source: "Original practice modeled on published test skills", kind: "gridin" }, o));

// 1. Systems of two linear equations
[
  [2, 1, 1, -1, 4, 3, "x", "easy"], [3, 2, 1, -1, 4, 2, "y", "easy"], [1, 1, 2, -1, 5, -2, "x", "medium"],
  [4, -1, 1, 2, 3, -2, "x + y", "medium"], [5, 2, 3, -4, 2, -3, "y", "hard"], [2, 3, 5, -1, 1, 4, "x + y", "hard"],
].forEach(([a1, b1, a2, b2, x, y, ask, diff], i) => {
  const c1 = a1 * x + b1 * y, c2 = a2 * x + b2 * y;
  const val = ask === "x" ? x : ask === "y" ? y : x + y;
  push({ id: "m56" + String(i + 1).padStart(2, "0"), domain: "Algebra", skill: "Systems of two linear equations", diff, family: "gi-systems",
    q: `If ${lin(a1, b1)} = ${signed(c1)} and ${lin(a2, b2)} = ${signed(c2)}, what is the value of ${ask}? (Enter a number.)`,
    answer: String(val),
    exp: `Eliminate one variable. Solving the two equations together gives x = ${signed(x)} and y = ${signed(y)}. The question asks for ${ask}, which is ${signed(val)}. Check: ${a1}(${signed(x)}) + ${b1}(${signed(y)}) = ${signed(c1)} and ${a2}(${signed(x)}) + ${b2}(${signed(y)}) = ${signed(c2)}.` });
});

// 2. Percentages: original price after a discount (3), percent increase (3)
[[80, 35, "jacket"], [120, 25, "backpack"], [250, 40, "bicycle"]].forEach(([orig, d, thing], i) => {
  const sale = orig * (100 - d) / 100;
  push({ id: "m56" + String(7 + i).padStart(2, "0"), domain: "Problem-Solving & Data Analysis", skill: "Percentages", diff: i === 2 ? "medium" : "easy", family: "gi-percent-off",
    q: `After a ${d}% discount, a ${thing} sells for $${sale}. What was the original price of the ${thing}, in dollars? (Enter a number.)`,
    answer: String(orig),
    exp: `A ${d}% discount means the sale price is ${100 - d}% of the original. So ${(100 - d) / 100} × (original) = ${sale}. Divide: ${sale} ÷ ${(100 - d) / 100} = ${orig}.` });
});
[[400, 462, "A club's membership grew from {o} to {n}. By what percent did the membership increase?"],
 [250, 300, "A school's enrollment rose from {o} students to {n} students. By what percent did the enrollment increase?"],
 [60, 81, "A website had {o} visitors on Monday and {n} visitors on Friday. By what percent did the number of visitors increase?"]].forEach(([old, nu, tpl], i) => {
  const pct = Q((nu - old) * 100, old);
  push({ id: "m56" + String(10 + i).padStart(2, "0"), domain: "Problem-Solving & Data Analysis", skill: "Percentages", diff: i === 0 ? "hard" : "medium", family: "gi-percent-change",
    q: tpl.replace("{o}", old).replace("{n}", nu) + " (Enter the number only, without the percent sign.)",
    answer: typed(pct, "decimal"),
    exp: `Percent change = (new − old) ÷ old × 100 = (${nu} − ${old}) ÷ ${old} × 100 = ${nu - old} ÷ ${old} × 100 = ${num(pct)}.` });
});

// 3. Probability, answered as a fraction or decimal
[[4, 6, 5, "blue"], [3, 7, 2, "red"], [5, 5, 10, "green"], [8, 4, 3, "red"], [2, 3, 5, "red"], [7, 2, 6, "blue"]].forEach(([r, b, g, color], i) => {
  const total = r + b + g, k = color === "red" ? r : color === "blue" ? b : g, p = Q(k, total);
  push({ id: "m56" + String(13 + i).padStart(2, "0"), domain: "Problem-Solving & Data Analysis", skill: "Probability", diff: terminating(p) ? "easy" : "medium", family: "gi-probability",
    q: `A bag contains ${r} red marbles, ${b} blue marbles, and ${g} green marbles. One marble is chosen at random. What is the probability that the marble is ${color}? (Enter a fraction or a decimal.)`,
    answer: typed(p, "fraction"),
    exp: `Probability = favorable ÷ total. There are ${k} ${color} marbles out of ${r} + ${b} + ${g} = ${total}, so the probability is ${k}/${total}${p.d !== total ? " = " + p.n + "/" + p.d : ""}.${also(p)}` });
});

// 4. Slope of a line through two points
[[-2, 5, 4, -1], [1, 2, 5, 5], [0, -3, 6, 1], [-4, -2, 2, 7], [3, 8, 7, 2], [2, -5, 5, -6]].forEach(([x1, y1, x2, y2], i) => {
  const m = Q(y2 - y1, x2 - x1);
  push({ id: "m56" + String(19 + i).padStart(2, "0"), domain: "Algebra", skill: "Linear equations in two variables", diff: m.d === 1 ? "easy" : "medium", family: "gi-slope",
    q: `What is the slope of the line that passes through the points (${signed(x1)}, ${signed(y1)}) and (${signed(x2)}, ${signed(y2)}) in the xy-plane? (Enter a number.)`,
    answer: typed(m, "fraction"),
    exp: `Slope = (change in y) ÷ (change in x) = (${signed(y2)} − ${signed(y1)}) ÷ (${signed(x2)} − ${signed(x1)}) = ${signed(y2 - y1)}/${signed(x2 - x1)}${m.d === 1 || Math.abs(m.n) + "/" + m.d === Math.abs(y2 - y1) + "/" + Math.abs(x2 - x1) ? "" : " = " + neg(m.n + "/" + m.d)}${m.d === 1 ? " = " + signed(m.n) : ""}.${also(m)}` });
});

// 5. Rates and proportions
[[2.5, 6, 15, "A recipe uses {a} cups of flour for {b} servings. At the same rate, how many cups of flour are needed for {c} servings?"],
 [150, 2.5, 4, "A car travels {a} miles in {b} hours. At the same constant speed, how many miles does it travel in {c} hours?"],
 [1.5, 4, 10, "A recipe uses {a} cups of broth for {b} servings. At the same rate, how many cups of broth are needed for {c} servings?"],
 [84, 6, 15, "A printer prints {a} pages in {b} minutes. At the same rate, how many pages does it print in {c} minutes?"],
 [7.5, 3, 8, "A hose fills {a} gallons in {b} minutes. At the same rate, how many gallons does it fill in {c} minutes?"],
 [0.6, 4, 10, "A machine uses {a} liters of oil in {b} hours of running. At the same rate, how many liters of oil does it use in {c} hours?"],
].forEach(([a, b, c, tpl], i) => {
  const A = Q(Math.round(a * 10), 10), v = div(mul(A, Q(c)), Q(Math.round(b * 10), 10));
  push({ id: "m56" + String(25 + i).padStart(2, "0"), domain: "Problem-Solving & Data Analysis", skill: "Unit rates", diff: i < 2 ? "easy" : "medium", family: "gi-rates",
    q: tpl.replace("{a}", a).replace("{b}", b).replace("{c}", c) + " (Enter a number.)",
    answer: typed(v, "decimal"),
    exp: `Find the rate: ${a} ÷ ${b} = ${num(div(A, Q(Math.round(b * 10), 10)))} per unit. Multiply by ${c}: ${num(div(A, Q(Math.round(b * 10), 10)))} × ${c} = ${num(v)}.` });
});

// 6. Mean with a missing value
[[5, 18, [12, 20, 15, 25]], [5, 24, [10, 30, 22, 28]], [4, 15, [9, 12, 20]], [6, 12.5, [10, 14, 8, 16, 12]], [5, 9.2, [8, 11, 7, 10]], [4, 5, [12, -3, 4]]].forEach(([n, mean, known], i) => {
  const total = Math.round(mean * n * 10) / 10, rest = Math.round((total - known.reduce((s, v) => s + v, 0)) * 10) / 10;
  const list = known.slice(0, -1).map(signed).join(", ") + " and " + signed(known[known.length - 1]);
  const words = ["zero", "one", "two", "three", "four", "five", "six"];
  push({ id: "m56" + String(31 + i).padStart(2, "0"), domain: "Problem-Solving & Data Analysis", skill: "Measures of center", diff: i < 2 ? "easy" : "medium", family: "gi-mean",
    q: `The mean of ${words[n]} numbers is ${mean}. ${words[n - 1][0].toUpperCase() + words[n - 1].slice(1)} of the numbers are ${list}. What is the remaining number? (Enter a number.)`,
    answer: String(rest),
    exp: `The sum of all ${n} numbers is ${n} × ${mean} = ${total}. The known numbers add to ${Math.round(known.reduce((s, v) => s + v, 0) * 10) / 10}, so the remaining number is ${total} − ${Math.round(known.reduce((s, v) => s + v, 0) * 10) / 10} = ${signed(rest)}.` });
});

// 7. Exponential growth and decay
[[250, 2, 3, 12, "A bacteria culture starts with 250 bacteria and doubles every 3 hours. How many bacteria are in the culture after 12 hours?"],
 [40, 3, 2, 6, "The number of people who have seen a post is 40 now and triples every 2 hours. How many people have seen the post after 6 hours?"],
 [500, 0.5, 5, 15, "A sample of a radioactive substance has a mass of 500 grams. Its mass is cut in half every 5 days. What is the mass of the sample, in grams, after 15 days?"],
 [1200, 2, 4, 12, "An investment is worth $1200 now and doubles in value every 4 years. How much will it be worth, in dollars, after 12 years?"],
 [960, 0.5, 2, 6, "A patient takes 960 milligrams of a medicine. The amount of medicine in the body is cut in half every 2 hours. How many milligrams remain after 6 hours?"],
 [2000, 2, 6, 18, "A collector's item is worth $2000 and doubles in value every 6 years. How much will it be worth, in dollars, after 18 years?"],
].forEach(([start, f, period, span, text], i) => {
  const steps = span / period, factor = f >= 1 ? Q(f ** steps) : Q(1, Math.round(1 / f) ** steps), v = mul(Q(start), factor);
  push({ id: "m56" + String(37 + i).padStart(2, "0"), domain: "Advanced Math", skill: "Exponential functions", diff: "medium", family: "gi-exponential",
    q: text + " (Enter a number.)",
    answer: typed(v, "decimal"),
    exp: `${span} \u00f7 ${period} = ${steps} periods. ${f >= 1 ? `Each period multiplies by ${f}: ${start} \u00d7 ${f}^${steps} = ${num(v)}` : `Each period halves the amount: ${start} \u00d7 (1/2)^${steps} = ${num(v)}`}.` });
});

// 8. Linear equation with a fractional or negative solution
[[4, 2, 3, 3, 11], [3, 1, 2, 5, 4], [2, 3, 1, 4, 7], [5, 2, 4, 6, 1], [6, 1, 3, 2, 5], [3, 4, 5, 7, 2]].forEach(([a, b, c, d, e], i) => {
  const x = Q(e + a * c, a * b - d);
  const inner = (b === 1 ? "x" : b + "x") + " " + MINUS + " " + c;
  push({ id: "m56" + String(43 + i).padStart(2, "0"), domain: "Algebra", skill: "Linear equations in one variable", diff: x.d === 1 ? "medium" : "hard", family: "gi-linear-eq",
    q: `If ${a}(${inner}) = ${d}x + ${e}, what is the value of x? (Enter a number.)`,
    answer: typed(x, "decimal"),
    exp: `Distribute: ${a * b}x ${MINUS} ${a * c} = ${d}x + ${e}. Subtract ${d}x from both sides: ${a * b - d}x ${MINUS} ${a * c} = ${e}. Add ${a * c}: ${a * b - d}x = ${e + a * c}. Divide by ${a * b - d}: x = ${x.d === 1 ? signed(x.n) : signed(e + a * c) + "/" + (a * b - d)}${x.d !== 1 ? " = " + neg(num(x)) : ""}.${also(x)}` });
});

// 9. Where a parabola reaches its minimum
[[1, -10, 7], [2, -12, 5], [1, 6, -4], [3, -18, 2], [2, 10, 1], [4, -12, 9]].forEach(([a, b, c], i) => {
  const k = Q(-b, 2 * a);
  const poly = (a === 1 ? "x²" : a + "x²") + " " + (b < 0 ? MINUS : "+") + " " + Math.abs(b) + "x " + (c < 0 ? MINUS : "+") + " " + Math.abs(c);
  push({ id: "m56" + String(49 + i).padStart(2, "0"), domain: "Advanced Math", skill: "Quadratic equations", diff: k.d === 1 ? "medium" : "hard", family: "gi-vertex",
    q: `The function f(x) = ${poly} has its minimum value at x = k. What is the value of k? (Enter a number.)`,
    answer: typed(k, "decimal"),
    exp: `A parabola y = ax² + bx + c opens upward when a > 0 and reaches its minimum at x = ${MINUS}b/(2a). Here a = ${a} and b = ${signed(b)}, so k = ${MINUS}(${signed(b)})/(2·${a}) = ${signed(-b)}/${2 * a}${k.d === 1 ? " = " + signed(k.n) : " = " + neg(num(k))}.${also(k)}` });
});

// ---- self-check: unique ids, valid typed answers, nothing the grid cannot take
const G = require(path.join(__dirname, "..", "gridin.js"));
const ids = new Set();
for (const q of items) {
  if (ids.has(q.id)) throw new Error("duplicate id " + q.id);
  ids.add(q.id);
  const p = G.parse(q.answer);
  if (!p.ok) throw new Error(`${q.id}: answer ${q.answer} is not typeable (${p.error})`);
  q.choices = [q.answer]; q.ans = 0;
  if (!G.matches(q, q.answer)) throw new Error(q.id + ": its own answer does not match");
}

if (process.argv.includes("--print")) { items.forEach((q) => console.log(q.id, q.skill.padEnd(34), q.q.slice(0, 96), "=>", q.answer)); console.log(items.length, "questions"); process.exit(0); }

const file = path.join(__dirname, "..", "app.js");
let src = fs.readFileSync(file, "utf8");
const START = "/*__GRIDIN2_START__*/", END = "/*__GRIDIN2_END__*/";
const block = START + "\n// Typed-answer (grid-in) practice beyond the nine whole-number formulas: scripts/gen-gridin.cjs. Re-solved from the stem by scripts/verify-question-logic.cjs.\nconst GRIDIN_MATH = [\n" +
  items.map((q) => JSON.stringify(q)).join(",\n") + "\n];\nBANK.math.push(...GRIDIN_MATH);\n" + END;
if (src.includes(START)) src = src.slice(0, src.indexOf(START)) + block + src.slice(src.indexOf(END) + END.length);
else {
  const anchor = "const ALL_UNIQUE_QUESTIONS = BANK.math.concat(BANK.rw, ACT_SCIENCE);";
  if (!src.includes(anchor)) throw new Error("anchor not found in app.js");
  src = src.replace(anchor, block + "\n" + anchor);
}
fs.writeFileSync(file, src);
console.log("wrote", items.length, "typed-answer questions into app.js");
