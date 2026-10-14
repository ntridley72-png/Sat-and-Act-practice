/* Guards that the preview deployment cannot touch production, and that no secret or private data is committed. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

const prod = fs.readFileSync("wrangler.toml", "utf8");
const prev = fs.readFileSync("wrangler.preview.toml", "utf8");
const code = (t) => t.split("\n").filter((l) => !l.trim().startsWith("#")).join("\n");
const get = (t, re) => (code(t).match(re) || [])[1];

assert.notEqual(get(prev, /^name = "([^"]+)"/m), get(prod, /^name = "([^"]+)"/m), "preview Worker name differs from production");
assert.notEqual(get(prev, /database_id = "([^"]+)"/), get(prod, /database_id = "([^"]+)"/), "preview D1 id differs from production");
assert.notEqual(get(prev, /database_name = "([^"]+)"/), get(prod, /database_name = "([^"]+)"/), "preview D1 name differs from production");
assert.ok(!/funsat\.bid/.test(code(prev)), "preview config never names the production domain");
assert.ok(!/^\s*routes\s*=/m.test(code(prev)) && !/\[\[routes\]\]/.test(code(prev)) && !/custom_domain/.test(code(prev)), "preview has no routes or custom domains");
assert.ok(!/^\s*\[ai\]/m.test(code(prev)), "preview has no Workers AI binding");
for (const binding of ["kv_namespaces", "r2_buckets", "queues", "analytics_engine", "services", "hyperdrive", "vectorize", "triggers", "crons", "send_email", "durable_objects", "workflows"]) {
  assert.ok(!new RegExp("\\b" + binding + "\\b").test(code(prev)), "preview config has no " + binding);
}
assert.match(code(prev), /PREVIEW_MODE = "1"/, "preview is marked noindex");
assert.match(code(prev), /AI_MODE = "mock"/, "preview uses the mock AI");
assert.ok(!/(GROQ|RESEND|GOOGLE)[A-Z_]*\s*=/.test(code(prev)), "no secret-like variables are set in the preview config");
assert.ok(/Disallow: \//.test(prev), "preview build overwrites robots.txt with Disallow");
for (const f of ["admissions-model.js", "admissions-data.js"]) {
  assert.ok(prod.includes(f) && prev.includes(f), f + " is published by both build commands");
}
const dbCount = (code(prev).match(/\[\[d1_databases\]\]/g) || []).length;
assert.equal(dbCount, 1, "exactly one D1 binding");

// The Worker only changes behavior when the preview flags are set.
const worker = fs.readFileSync("worker/index.js", "utf8");
assert.ok(worker.includes('env.PREVIEW_MODE !== "1"') && worker.includes('env.AI_MODE === "mock"'), "worker flags are opt-in");
assert.ok(!/AI_MODE|PREVIEW_MODE/.test(code(prod)), "production config does not enable preview flags");

// No secrets, tokens or private data in tracked or new files.
const files = execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { encoding: "utf8" }).split("\n").filter(Boolean)
  .filter((f) => /\.(js|cjs|mjs|py|toml|json|md|html|css|txt|yml|yaml|sh)$/.test(f) && !f.startsWith("node_modules/") && !f.startsWith("racing-v2/") && !f.startsWith("vendor/") && !f.startsWith("tests/screenshots/"));
const patterns = [/gsk_[A-Za-z0-9]{20,}/, /\bre_[A-Za-z0-9]{20,}/, /\bsk-[A-Za-z0-9]{20,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /AKIA[0-9A-Z]{16}/, /ghp_[A-Za-z0-9]{30,}/, /cfut_[A-Za-z0-9]{20,}/];
const hits = [];
for (const f of files) {
  let text; try { text = fs.readFileSync(f, "utf8"); } catch (e) { continue; }
  for (const p of patterns) if (p.test(text)) hits.push(f + " matches " + p);
}
assert.deepEqual(hits, [], "no credential-shaped strings in the repo");
const csvs = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "calibration"], { encoding: "utf8" }).split("\n").filter((f) => /\.csv$/.test(f));
assert.ok(csvs.every((f) => /^calibration\/fixtures\/synthetic-/.test(f)), "only clearly-named synthetic CSVs live in calibration/: " + csvs.join(", "));

console.log("PASS: preview config is isolated (own Worker and D1, no routes/AI/secrets/cron), noindex and mock-AI flags are opt-in, no credential-shaped strings.");
