/* Live Groq model probe: proves each fallback model actually loads on production.
   Run: node tests/groq-models.live.cjs   (spends a few tiny Groq requests) */
const BASE = process.env.BASE_URL || "https://funsat.bid";
const MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile", "meta-llama/llama-4-scout-17b-16e-instruct", "qwen/qwen3-32b", "llama-3.1-8b-instant"];

async function probe(model, teaching) {
  const messages = teaching
    ? [{ role: "user", content: "Return JSON with shortAnswer only: 1+1?" }]
    : [{ role: "user", content: "Reply with the single word ready." }];
  const started = Date.now();
  const response = await fetch(BASE + "/api/ai", {
    method: "POST",
    headers: { "Origin": BASE, "Content-Type": "application/json" },
    body: JSON.stringify({ messages, model, onlyModel: true, teaching: !!teaching }),
  });
  const json = await response.json().catch(() => ({}));
  return { status: response.status, model: json.model || "", code: json.code || "", ms: Date.now() - started, content: (json.content || "").slice(0, 40) };
}

(async () => {
  const rows = [];
  let working = 0;
  for (const model of MODELS) {
    const plain = await probe(model, false);
    const teaching = await probe(model, true);
    const ok = plain.status === 200;
    if (ok) working++;
    rows.push({ model, plain, teaching });
    console.log(
      model.padEnd(46),
      "plain:", (ok ? "OK " + plain.ms + "ms" : "FAIL " + plain.status + " " + (plain.code || "")).padEnd(18),
      "teaching:", teaching.status === 200 ? "OK " + teaching.ms + "ms" : "FAIL " + teaching.status + " " + (teaching.code || "")
    );
  }
  console.log("");
  if (working < 2) { console.error("Only " + working + " model(s) responded — backups are not loading."); process.exit(1); }
  console.log("PASS: " + working + "/" + MODELS.length + " Groq models respond; the fallback chain has real backups.");
})().catch((error) => { console.error(error); process.exit(1); });
