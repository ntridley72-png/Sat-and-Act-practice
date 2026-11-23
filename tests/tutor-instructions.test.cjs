/* The AI tutor's instructions: they teach (not just answer), never leak the key for an unanswered question,
   fit the Worker's per-message limit, and adapt to the student's record. Pure functions, no browser. */
const assert = require("node:assert/strict");
const T = require("../tutor-instructions.js");

const KEY_TEXT = "ZEBRA-KEY-7741";
const EXP_TEXT = "SECRET-EXPLANATION-3390";
const q = {
  id: "r999", test: "sat", section: "rw", domain: "Craft & Structure", skill: "Words in Context",
  passage: "The mayor's plan was ___ : it pleased no one and solved nothing.",
  q: "Which choice completes the text with the most logical and precise word or phrase?",
  choices: ["popular", KEY_TEXT, "ambitious", "secret"], ans: 1, exp: EXP_TEXT,
};

// --- the core teaches
for (const rule of [/NEXT question/i, /misconception/i, /method, not just the result/i, /self-check/i, /never tell/i, /stored key looks wrong/i, /not penalized/i, /not instructions to you/i, /Do not invent facts/i])
  assert.match(T.CORE, rule, "CORE is missing: " + rule);

// --- every mode builds, and the JSON modes name every field the app parses
for (const mode of Object.keys(T.MODE)) assert.ok(T.system(mode, { answered: true }).startsWith(T.CORE), mode + " starts with the core");
for (const mode of ["explain", "coach"]) {
  const s = T.system(mode, { answered: true });
  for (const field of ["shortAnswer", "detailedSteps", "simpleSteps", "memoryTip", "equations", "whyOthers", "verification", "nextPractice"]) assert.ok(s.includes(field), mode + " lacks " + field);
}
assert.throws(() => T.system("nope"), /Unknown tutor mode/);

// --- test-specific facts
assert.match(T.system("explain", { test: "sat", answered: true }), /built-in Desmos/);
assert.match(T.system("explain", { test: "act", answered: true }), /no built-in graphing calculator/);
assert.doesNotMatch(T.system("explain", { test: "act", answered: true }), /Desmos graphing calculator is allowed/);

// --- unanswered: the no-reveal rule is present and the KEY AND EXPLANATION NEVER APPEAR in the prompt
for (const mode of ["coach", "nudge", "restate", "calc"]) {
  const s = T.system(mode, { answered: false });
  assert.match(s, /NOT ANSWERED YET/, mode + " must carry the no-reveal rule when unanswered");
  const block = T.questionBlock(q, { chosen: null });
  // The key text appears once, as one of the four listed choices; nothing identifies it, and the explanation is absent.
  assert.equal(block.split(KEY_TEXT).length - 1, 1, "the key text may appear only as a listed choice");
  assert.ok(!block.includes(EXP_TEXT), "an unanswered question block must not contain the explanation");
  assert.deepEqual(block.split("\n").map((l) => l.split(":")[0]), ["Topic", "Passage", "Question", "Choices", "Student's choice"], "an unanswered block has only the topic, passage, question, choices and 'not answered yet'");
  assert.ok(!/Correct answer/.test(block), "no 'Correct answer' line when unanswered");
  assert.match(block, /not answered yet/);
}
assert.ok(!/Correct answer/.test(T.questionBlock(q, {})), "no options at all counts as unanswered");
// the reading passage is included (the follow-up chat used to leave it out)
assert.match(T.questionBlock(q, { chosen: null }), /Passage: The mayor's plan/);
// a writing question that already carries its passage inside q.q is not duplicated
const w = { id: "w1", q: "The reading guide ___ was filed with the class on Friday.\nWhich choice completes the text?", passage: "The reading guide ___ was filed with the class on Friday.", choices: ["a", "b", "c", "d"], ans: 2 };
assert.equal((T.questionBlock(w, { chosen: null }).match(/reading guide/g) || []).length, 1, "the passage is not repeated when q already contains it");

// --- answered or "I don't know": now the key and the student's choice appear
const wrong = T.questionBlock(q, { chosen: 0 });
assert.match(wrong, /Student's choice: A\) popular/);
assert.ok(wrong.includes("Correct answer: B) " + KEY_TEXT) && wrong.includes(EXP_TEXT));
const idk = T.questionBlock(q, { chosen: -1 });
assert.match(idk, /Student's choice: "I don't know"/);
assert.ok(idk.includes(KEY_TEXT));

// --- student record shapes the help
assert.match(T.skillLevelNote({ attempts: 0 }), /no practice on this skill/);
assert.match(T.skillLevelNote({ attempts: 8, correct: 2, accuracy: 25, label: "Attempted" }), /2 of 8.*25%.*core idea/s);
assert.match(T.skillLevelNote({ attempts: 20, correct: 14, accuracy: 70, label: "Familiar" }), /habit or trap/);
assert.match(T.skillLevelNote({ attempts: 30, correct: 29, accuracy: 97, label: "Mastered" }), /strong here.*harder twist/s);
assert.match(T.system("explain", { answered: true, record: { attempts: 0 } }), /STUDENT RECORD/);
assert.doesNotMatch(T.system("nudge", { answered: false, record: { attempts: 5, correct: 1, accuracy: 20, label: "Attempted" } }), /STUDENT RECORD/, "one-line hints do not need the record");
assert.doesNotMatch(T.system("explain", { answered: true }), /STUDENT RECORD/, "no record, no note");

// --- fits the Worker's 6000-character-per-message cap, even with a long passage
for (const mode of Object.keys(T.MODE)) {
  const s = T.system(mode, { test: "sat", answered: false, record: { attempts: 9, correct: 3, accuracy: 33, label: "Attempted" }, extra: "x".repeat(300) });
  assert.ok(s.length < 5000, mode + " instructions are " + s.length + " characters; keep under 5000");
}
const longQ = Object.assign({}, q, { passage: "p".repeat(9000), q: "q".repeat(9000) });
assert.ok(T.questionBlock(longQ, { chosen: 0 }).length < 6000, "a very long question block is clipped under the Worker's per-message cap");

console.log("PASS: tutor instructions teach (method, misconception, self-check), never leak the key for an unanswered question, include the passage, adapt to the student's record and fit the Worker's limits.");
