/* Activities shell out to the repository's own scripts. Commands are fixed in
   this file (no workflow input is ever interpolated), so a workflow cannot run
   an arbitrary command. cwd is the repository root. */
const { execFile } = require("node:child_process");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const MAX = 20000;

function run(args, timeout = 240000) {
  return new Promise((resolve) => {
    execFile("node", args, { cwd: ROOT, timeout, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      const out = String(stdout || "");
      const err = String(stderr || "");
      resolve({ ok: !error, code: error && error.code ? error.code : 0, output: (out + (err ? "\n" + err : "")).slice(-MAX) });
    });
  });
}

async function seoAuditActivity() {
  const result = await run(["tests/seo-audit.test.cjs"]);
  return { ok: result.ok, summary: result.output.split("\n").slice(-3).join(" ").slice(0, 300) };
}

async function indexNowActivity() {
  const result = await run(["scripts/indexnow.mjs"]);
  return { ok: result.ok, summary: result.output.split("\n").slice(0, 6).join(" | ").slice(0, 300) };
}

module.exports = { seoAuditActivity, indexNowActivity };
