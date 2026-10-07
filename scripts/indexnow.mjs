#!/usr/bin/env node
/**
 * IndexNow submission for FunSAT.
 *
 * Only production canonical URLs from the generated sitemap files are ever sent.
 * Dry-run by default is NOT the default: pass --dry-run to inspect without
 * transmitting. State is kept in logs/indexnow-state.json so unchanged URLs are
 * not resubmitted; use --all to force a full resubmission.
 *
 * Usage:
 *   node scripts/indexnow.mjs --dry-run
 *   node scripts/indexnow.mjs                 # submit new/changed URLs
 *   node scripts/indexnow.mjs --all           # resubmit everything
 *   node scripts/indexnow.mjs --since <file>  # custom state file
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HOST = "https://funsat.bid";
const ENDPOINT = "https://api.indexnow.org/indexnow";
const LOG = join(ROOT, "logs", "indexnow.log");
const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
const ALL = argv.includes("--all");
const STATE = (() => {
  const i = argv.indexOf("--since");
  if (i >= 0) {
    if (!argv[i + 1]) { console.error("indexnow: --since requires a file path"); process.exit(2); }
    return argv[i + 1];
  }
  return join(ROOT, "logs", "indexnow-state.json");
})();

function keyFile() {
  if (process.env.INDEXNOW_KEY) return process.env.INDEXNOW_KEY;
  const dir = [ROOT];
  for (const d of dir) {
    for (const f of readdirSync(d)) {
      if (/^[0-9a-f]{32}\.txt$/.test(f)) return f.slice(0, 32);
    }
  }
  return null;
}

function sitemapUrls() {
  const index = readFileSync(join(ROOT, "public", "sitemap.xml"), "utf8");
  const children = [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const urls = [];
  for (const child of children) {
    const rel = child.replace(HOST, join(ROOT, "public"));
    const file = rel.endsWith(".xml") ? rel : rel + ".xml";
    if (!existsSync(file)) continue;
    for (const m of readFileSync(file, "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)) urls.push(m[1]);
  }
  return [...new Set(urls)];
}

function productionOnly(url) {
  if (!url.startsWith(HOST + "/")) return false;
  return !/localhost|127\.0\.0\.1|staging|preview|workers\.dev/.test(url);
}

function loadState() {
  try {
    const raw = JSON.parse(readFileSync(STATE, "utf8"));
    return raw && raw.submitted ? raw : { submitted: {} };
  } catch { return { submitted: {} }; }
}
function urlLastmods() {
  const index = readFileSync(join(ROOT, "public", "sitemap.xml"), "utf8");
  const out = new Map();
  for (const child of [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])) {
    const f = join(ROOT, "public", child.replace(HOST, ""));
    if (!existsSync(f)) continue;
    for (const block of readFileSync(f, "utf8").split("<url>").slice(1)) {
      const loc = (block.match(/<loc>([^<]+)<\/loc>/) || [])[1];
      const lm = (block.match(/<lastmod>([^<]+)<\/lastmod>/) || [])[1];
      if (loc && lm) out.set(loc, lm);
    }
  }
  return out;
}
function saveState(s) { mkdirSync(dirname(STATE), { recursive: true }); writeFileSync(STATE, JSON.stringify(s, null, 2)); }
function log(entry) { mkdirSync(join(ROOT, "logs"), { recursive: true }); appendFileSync(LOG, JSON.stringify(entry) + "\n"); }

async function submit(urls, key) {
  const body = JSON.stringify({ host: "funsat.bid", key, keyLocation: `${HOST}/${key}.txt`, urlList: urls });
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body });
      if (res.status >= 200 && res.status < 300) return res.status;
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      return res.status; // 4xx that retrying cannot fix
    } catch (err) {
      if (attempt === 3) throw err;
      const wait = 2000 * Math.pow(4, attempt - 1);
      console.error(`retry ${attempt} after ${wait}ms: ${err.message}`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

async function main() {
  const key = keyFile();
  if (!key) { console.error("indexnow: no 32-hex key file found in repo root and INDEXNOW_KEY unset"); process.exit(2); }
  const all = sitemapUrls().filter(productionOnly);
  const rejected = sitemapUrls().filter((u) => !productionOnly(u));
  if (rejected.length) { console.error(`indexnow: refusing ${rejected.length} non-production urls (e.g. ${rejected[0]})`); process.exit(3); }
  const state = loadState();
  const lastmods = urlLastmods();
  const todo = ALL ? all : all.filter((u) => {
    const prev = state.submitted[u];
    if (!prev) return true;
    const lm = lastmods.get(u);
    return !!lm && lm > (prev.lastmod || "");
  });
  const batches = [];
  for (let i = 0; i < todo.length; i += 100) batches.push(todo.slice(i, i + 100));
  console.log(`indexnow: ${all.length} sitemap urls, ${todo.length} to submit, ${batches.length} batch(es)${DRY ? " [DRY RUN]" : ""}`);
  for (const batch of batches) {
    if (DRY) { console.log(`  dry-run batch of ${batch.length}: ${batch[0]} ...`); continue; }
    try {
      const status = await submit(batch, key);
      log({ time: new Date().toISOString(), endpoint: ENDPOINT, urls: batch.length, status });
      if (status >= 200 && status < 300) {
        for (const u of batch) state.submitted[u] = { at: new Date().toISOString(), lastmod: lastmods.get(u) || "" };
        saveState(state);
        console.log(`  batch of ${batch.length}: HTTP ${status}`);
      } else {
        console.error(`  batch of ${batch.length}: terminal HTTP ${status} (not retryable) - treating as failure`);
        process.exitCode = 1;
      }
    } catch (err) {
      log({ time: new Date().toISOString(), endpoint: ENDPOINT, urls: batch.length, status: "failed", error: String(err) });
      console.error(`  batch failed after retries: ${err}`);
      process.exitCode = 1; // visible, but never corrupts a deployment
    }
  }
}

import { pathToFileURL } from "node:url";
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
