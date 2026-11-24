/* Academic calculators: every expected value below was worked out by hand (shown in the comment) before the code ran. */
const assert = require("node:assert/strict");
const C = require("../academic-calc.js");
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: got ${a}, expected ${b}`);

// ---- grade points
assert.equal(C.gradePoints("A"), 4); assert.equal(C.gradePoints("b+"), 3.3); assert.equal(C.gradePoints("C-"), 1.7); assert.equal(C.gradePoints("F"), 0);
assert.equal(C.gradePoints("92"), 3.7, "92% is an A-"); assert.equal(C.gradePoints("89.9"), 3.3, "89.9% is a B+ (no rounding up)");
assert.equal(C.gradePoints(97), 4.0, "A+ is 4.0 on the standard scale"); assert.equal(C.gradePoints(97, { scale: "aplus43" }), 4.3, "A+ is 4.3 where the school says so");
assert.equal(C.gradePoints("B-", { scale: "whole" }), 3, "whole-letter scales ignore minus"); assert.equal(C.gradePoints(59), 0);
assert.equal(C.gradePoints("P"), null, "pass/fail is left out"); assert.equal(C.gradePoints("W"), null); assert.equal(C.gradePoints(""), null);
assert.ok(Number.isNaN(C.gradePoints("Q")) && Number.isNaN(C.gradePoints("-5")) && Number.isNaN(C.gradePoints("200")));
assert.equal(C.gradePoints("A", { customScale: { A: 4.5 } }), 4.5, "a school's own scale wins");
assert.equal(C.percentToLetter(93), "A"); assert.equal(C.percentToLetter(92.99), "A-");

// ---- high school GPA, weighted and unweighted
// A regular 4, B+ AP 3.3(+1), C honors 2.0(+0.5), F AP 0 (no bonus on F)
// unweighted (4+3.3+2+0)/4 = 2.325; weighted (4+4.3+2.5+0)/4 = 2.7
let g = C.gpa([{ grade: "A", type: "regular" }, { grade: "B+", type: "ap" }, { grade: "C", type: "honors" }, { grade: "F", type: "ap" }]);
close(g.unweighted, 2.325, "unweighted"); close(g.weighted, 2.7, "weighted, no bonus on F");
close(C.gpa([{ grade: "F", type: "ap" }], { bonusOnFailing: true }).weighted, 1, "bonus on F when the school gives it");
close(C.gpa([{ grade: "A", type: "honors" }], { weights: { honors: 1 } }).weighted, 5, "custom honors weight");
// credits: A 3cr, B 4cr, C 1cr -> (12+12+2)/8 = 3.25
close(C.gpa([{ grade: "A", credits: 3 }, { grade: "B", credits: 4 }, { grade: "C", credits: 1 }]).unweighted, 3.25, "credit-weighted");
// zero-credit and pass/fail courses do not change the GPA
close(C.gpa([{ grade: "A", credits: 3 }, { grade: "F", credits: 0 }, { grade: "P", credits: 3 }]).unweighted, 4, "zero credit and P ignored");
assert.equal(C.gpa([]).unweighted, null, "no courses, no GPA");
assert.ok(C.gpa([{ grade: "A", credits: -1 }]).rows[0].error, "negative credits are refused");

// ---- several terms: cumulative is credit-weighted, not the average of term GPAs
// term 1: A(3) A(3) -> 4.0 over 6; term 2: C(1) -> 2.0 over 1. Average of terms would be 3.0; real cumulative 26/7.
const t = C.termsGpa([{ name: "Fall", courses: [{ grade: "A", credits: 3 }, { grade: "A", credits: 3 }] }, { name: "Spring", courses: [{ grade: "C", credits: 1 }] }]);
close(t.terms[0].unweighted, 4, "term 1"); close(t.terms[1].unweighted, 2, "term 2"); close(t.cumulative.unweighted, 26 / 7, "cumulative 26/7");

// ---- cumulative with a current GPA: prior 3.2 over 60; new A A B B at 3 credits -> term 3.5; (192+42)/72 = 3.25
const cu = C.cumulativeGpa({ gpa: 3.2, credits: 60 }, [{ grade: "A", credits: 3 }, { grade: "A", credits: 3 }, { grade: "B", credits: 3 }, { grade: "B", credits: 3 }]);
close(cu.term, 3.5, "term"); close(cu.gpa, 3.25, "new cumulative"); close(cu.change, 0.05, "change"); assert.equal(cu.credits, 72);
close(C.cumulativeGpa(null, [{ grade: "B", credits: 3 }]).gpa, 3, "no history");

// ---- what you need: 2.9 over 60, 60 to go, target 3.2 -> (3.2*120 - 174)/60 = 3.5; best (174+240)/120 = 3.45
let n = C.gpaNeeded(2.9, 60, 60, 3.2, 4);
close(n.needed, 3.5, "needed"); assert.equal(n.feasible, true); close(n.best, 3.45, "best reachable");
// 2.0 over 90, 30 to go, target 3.5 -> needs (420-180)/30 = 8: impossible; best (180+120)/120 = 2.5
n = C.gpaNeeded(2.0, 90, 30, 3.5, 4);
assert.equal(n.feasible, false); close(n.needed, 8, "impossible needs 8"); close(n.best, 2.5, "best"); assert.match(n.reason, /short of 3\.50/);
n = C.gpaNeeded(3.9, 100, 10, 3.0); assert.equal(n.needed, 0); assert.equal(n.feasible, true);
assert.ok(C.gpaNeeded(3, 10, 0, 3.5).error, "no remaining credits");

// ---- retakes: 3.0 over 30, a 3-credit F retaken as an A
close(C.retakeGpa(3.0, 30, { credits: 3, oldPoints: 0, newPoints: 4 }, "replace").gpa, 3.4, "replace: (90-0+12)/30");
close(C.retakeGpa(3.0, 30, { credits: 3, oldPoints: 0, newPoints: 4 }, "average").gpa, 102 / 33, "average: (90+12)/33");
assert.equal(C.retakeGpa(3.0, 30, { credits: 3, oldPoints: 0, newPoints: 4 }, "average").credits, 33);

// ---- projection: 3.0 over 30, then 15 at 4.0, then 15 at 3.0 -> 3.333..., then 3.25
const pr = C.projectGpa(3.0, 30, [{ credits: 15, gpa: 4 }, { credits: 15, gpa: 3 }]);
close(pr[0].gpa, 150 / 45, "after term 1"); close(pr[1].gpa, 195 / 60, "after term 2");

// ---- points grade with extra credit and ungraded work: 18/20 + 45/50 + 5 extra -> 68/70; blank skipped
const pg = C.pointsGrade([{ earned: 18, possible: 20 }, { earned: 45, possible: 50 }, { earned: 5, possible: 0 }, { earned: "", possible: 30 }]);
close(pg.percent, 68 / 70 * 100, "points with extra credit"); assert.equal(pg.graded, 3);

// ---- weighted categories: HW 20% (9/10, 8/10 = 85), Tests 50% (80/100), Final 30% not graded
// (20*85 + 50*80)/70 = 81.4285...
let wg = C.weightedGrade([
  { name: "Homework", weight: 20, items: [{ earned: 9, possible: 10 }, { earned: 8, possible: 10 }] },
  { name: "Tests", weight: 50, items: [{ earned: 80, possible: 100 }] },
  { name: "Final", weight: 30, items: [] },
]);
close(wg.percent, 5700 / 70, "renormalized over graded weight"); assert.equal(wg.gradedWeight, 70); assert.equal(wg.weightsAddTo100, true);
// drop lowest: 5/10, 9/10, 10/10 drop one -> 19/20 = 95
close(C.weightedGrade([{ name: "HW", weight: 100, items: [{ earned: 5, possible: 10 }, { earned: 9, possible: 10 }, { earned: 10, possible: 10 }], dropLowest: 1 }]).percent, 95, "drop lowest");
// a missing assignment entered as 0 counts: 0/10 and 10/10 -> 50
close(C.weightedGrade([{ name: "HW", weight: 100, items: [{ earned: 0, possible: 10 }, { earned: 10, possible: 10 }] }]).percent, 50, "zero counts");
// category given as a percent
close(C.weightedGrade([{ name: "Q1", weight: 40, score: 90 }, { name: "Q2", weight: 40, score: 80 }, { name: "Exam", weight: 20, score: 70 }]).percent, 82, "quarters + exam");
assert.equal(C.weightedGrade([{ name: "A", weight: 30, score: 90 }, { name: "B", weight: 30, score: 90 }]).weightsAddTo100, false, "flags weights that do not add to 100");

// ---- final exam: current 85, final 20%
let f = C.finalNeeded(85, 20, 90); assert.equal(f.status, "impossible"); close(f.needed, 110, "needs 110"); close(f.best, 88, "best 88");
f = C.finalNeeded(85, 20, 80); assert.equal(f.status, "ok"); close(f.needed, 60, "needs 60");
f = C.finalNeeded(95, 20, 70); assert.equal(f.status, "guaranteed");
f = C.finalNeeded(85, 20, 90, 110); assert.equal(f.status, "ok", "with extra credit on the final, 110 is possible");
assert.ok(C.finalNeeded(85, 0, 90).error && C.finalNeeded(85, 120, 90).error);
close(C.finalOutcomes(85, 20, [100])[0].course, 88, "outcome table");
close(C.semesterGrade([{ name: "Q1", weight: 40, grade: 90 }, { name: "Q2", weight: 40, grade: "" }, { name: "Exam", weight: 20, grade: 80 }]).percent, (3600 + 1600) / 60, "semester with Q2 not in yet");

// ---- SAT superscore: Mar 650/700, May 700/680 -> 700 + 700 = 1400; best single 1380
const s = C.satSuperscore([{ label: "Mar", rw: 650, math: 700 }, { label: "May", rw: 700, math: 680 }]);
assert.equal(s.superscore, 1400); assert.equal(s.bestSingle, 1380); assert.equal(s.gain, 20); assert.equal(s.rwFrom, "May"); assert.equal(s.mathFrom, "Mar");
assert.ok(C.satSuperscore([{ rw: 655, math: 700 }]).error, "SAT sections are multiples of 10");

// ---- ACT composite: enhanced = E, M, R; legacy adds Science; .5 rounds up
assert.equal(C.actComposite({ english: 25, math: 26, reading: 26 }).composite, 26, "25.67 -> 26");
assert.equal(C.actComposite({ english: 24, math: 25, reading: 25 }).composite, 25, "24.67 -> 25");
assert.equal(C.actComposite({ english: 24, math: 24, reading: 25 }).composite, 24, "24.33 -> 24");
assert.equal(C.actComposite({ english: 25, math: 25, reading: 26, science: 26 }, "legacy").composite, 26, "25.5 -> 26");
assert.equal(C.actComposite({ english: 30, math: 30, reading: 30, science: 10 }).composite, 30, "science does not count on the enhanced ACT");
assert.ok(C.actComposite({ english: 37, math: 30, reading: 30 }).error && C.actComposite({ english: 25.5, math: 30, reading: 30 }).error);

// ---- ACT superscore: (E24 M28 R25), (E27 M26 R24) -> 27, 28, 25 = 26.67 -> 27; best single 77/3 -> 26
const a = C.actSuperscore([{ label: "Feb", english: 24, math: 28, reading: 25 }, { label: "Apr", english: 27, math: 26, reading: 24, science: 30 }]);
assert.equal(a.superscore, 27); assert.equal(a.bestSingle, 26); assert.equal(a.science, 30); assert.equal(a.from.english, "Apr"); assert.equal(a.from.math, "Feb");

// ---- display rounding is separate and exact for halves
assert.equal(C.round2(3.245), 3.25); assert.equal(C.round2(2.325), 2.33); assert.equal(C.round2(1.005), 1.01);

console.log("PASS: GPA (weighted, unweighted, credits, terms, cumulative, targets, retakes), grades (points, categories, drops, finals) and SAT/ACT score rules match hand-worked answers.");
