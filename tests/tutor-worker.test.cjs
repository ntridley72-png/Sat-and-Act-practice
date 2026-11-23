/* The Worker's /api/ai route, run with mock bindings: the tutor instructions and the question survive a long chat
   (only the oldest chat turns are trimmed), the no-reveal guard still rejects a reply that names the key, and the
   new "whyOthers" field is part of the teaching schema. No network, no Cloudflare account needed. */
const assert = require("node:assert/strict");

(async () => {
  const worker = (await import("../worker/index.js")).default;
  const seen = [];
  const reply = { shortAnswer: "Choose the sentence that shows the unit.", detailedSteps: ["Read it.", "Check it."], simpleSteps: ["Read.", "Check."], memoryTip: "", equations: [], whyOthers: ["A) too small: forgot to square."], verification: "Checked.", nextPractice: "" };
  const env = {
    DB: { prepare: () => ({ bind: () => ({ first: async () => ({ n: 1 }), run: async () => ({}) }), run: async () => ({}) }) },
    AI: { run: async (model, params) => { seen.push({ model, params }); return { response: JSON.stringify(seen.revealOnce && seen.length === 1 ? Object.assign({}, reply, { shortAnswer: "The correct answer is C." }) : reply) }; } },
  };
  const post = (body) => worker.fetch(new Request("https://funsat.bid/api/ai", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://funsat.bid" }, body: JSON.stringify(body) }), env);

  // 1) A long chat: 2 system messages (instructions + question) then 20 chat turns.
  const turns = [];
  for (let i = 0; i < 10; i++) { turns.push({ role: "user", content: "question " + i }); turns.push({ role: "assistant", content: "answer " + i }); }
  const res = await post({ teaching: true, messages: [{ role: "system", content: "INSTRUCTIONS-MARKER" }, { role: "system", content: "QUESTION-MARKER" }, ...turns] });
  assert.equal(res.status, 200);
  const sent = seen[0].params.messages;
  assert.equal(sent[0].content, "INSTRUCTIONS-MARKER", "the instructions stay first");
  assert.equal(sent[1].content, "QUESTION-MARKER", "the question stays second");
  assert.equal(sent.filter((m) => m.role !== "system").length, 10, "only the newest 10 chat turns are kept");
  assert.equal(sent[sent.length - 1].content, "answer 9", "the newest turn is last");
  assert.ok(!sent.some((m) => m.content === "question 0"), "the oldest turns are the ones dropped");

  // 2) The teaching schema carries whyOthers so Workers AI keeps the field.
  const schema = seen[0].params.response_format.json_schema;
  assert.ok(schema.properties.whyOthers && schema.properties.whyOthers.type === "array", "TUTOR_SCHEMA includes whyOthers");

  // 3) Unanswered question: the no-reveal rule is appended and a reply that names the key is retried, not returned.
  seen.length = 0; seen.revealOnce = true;
  const guarded = await post({ teaching: true, noAnswer: true, correctLetter: "C", messages: [{ role: "system", content: "I" }, { role: "system", content: "Q" }, { role: "user", content: "help" }] });
  assert.equal(guarded.status, 200);
  assert.equal(seen.length, 2, "the first reply named the key, so a second attempt was made");
  assert.match(seen[0].params.messages.at(-1).content, /has NOT answered yet/, "the no-reveal rule is the last message");
  assert.match(seen[1].params.messages.at(-1).content, /previous reply revealed the answer/);
  const body = await guarded.json();
  assert.ok(!/correct answer is C/i.test(body.content), "the revealing reply was not returned");

  // 4) Other sites cannot borrow the tutor.
  const foreign = await worker.fetch(new Request("https://funsat.bid/api/ai", { method: "POST", headers: { "Content-Type": "application/json", Origin: "https://evil.example" }, body: JSON.stringify({ messages: [{ role: "user", content: "x" }] }) }), env);
  assert.equal(foreign.status, 403);

  console.log("PASS: the Worker keeps the tutor's instructions and question through a long chat, trims only old turns, guards unanswered questions, and the schema has whyOthers.");
})().catch((e) => { console.error(e); process.exit(1); });
