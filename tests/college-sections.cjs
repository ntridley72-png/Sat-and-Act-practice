/* Browser check of the verified-data sections on generated college pages:
   stats provenance lines, income-band net price table, the campus-safety
   tables (three labeled years, housing kept separate, unfounded separate),
   the two photo categories with working lightbox, and the non-pilot page
   state. Wikimedia images are stubbed so layout is measured, not the network. */
const { chromium } = require("playwright-core");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");

function resolveExecutable() {
  if (process.env.PLAYWRIGHT_EXEC) return process.env.PLAYWRIGHT_EXEC;
  try {
    const p = chromium.executablePath();
    if (p && fs.existsSync(p)) return p;
  } catch (e) { /* fall through */ }
  const cache = path.join(os.homedir(), "Library", "Caches", "ms-playwright");
  for (const d of fs.readdirSync(cache).filter((n) => n.startsWith("chromium-"))) {
    for (const shape of [
      ["chrome-mac-x64", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"],
      ["chrome-mac", "Google Chrome for Testing.app", "Contents", "MacOS", "Google Chrome for Testing"],
    ]) {
      const c = path.join(cache, d, ...shape);
      if (fs.existsSync(c)) return c;
    }
  }
  throw new Error("Could not locate Chromium.");
}

const ROOT = path.join(__dirname, "..");
const PORT = 8932;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".svg": "image/svg+xml" };
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axnLlcAAAAASUVORK5CYII=", "base64");

function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = decodeURIComponent(req.url.split("?")[0]);
      const rel = url.endsWith("/") ? url.slice(1) + "index.html" : url.slice(1);
      const file = path.join(ROOT, "public", rel);
      fs.readFile(file, (err, buf) => {
        if (err) { res.writeHead(404); res.end("not found"); return; }
        res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
        res.end(buf);
      });
    });
    server.listen(PORT, "127.0.0.1", () => resolve(server));
  });
}

(async () => {
  const server = await serve();
  const browser = await chromium.launch({
    executablePath: resolveExecutable(),
    args: ["--no-sandbox", "--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"],
  });
  const fails = [];
  const ok = (cond, msg) => { if (!cond) fails.push(msg); };
  const base = `http://127.0.0.1:${PORT}`;

  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route("**://*.wikimedia.org/**", (r) => r.fulfill({ status: 200, contentType: "image/png", body: PIXEL }));
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));

  // --- pilot page ----------------------------------------------------------
  await page.goto(base + "/colleges/appalachian-state-university/", { waitUntil: "load" });
  const h2s = await page.evaluate(() => Array.from(document.querySelectorAll("h2")).map((h) => h.textContent.trim()));
  ok(h2s.includes("Campus safety: reported incidents"), "safety heading missing");
  ok(h2s.includes("About these numbers"), "about-the-numbers heading missing");

  const safety = await page.evaluate(() => {
    const sect = document.querySelector(".gsafety");
    if (!sect) return null;
    const tables = Array.from(sect.querySelectorAll("table"));
    const headers = tables.map((t) => Array.from(t.querySelectorAll("thead th")).map((th) => th.textContent.trim()));
    const rape = Array.from(sect.querySelectorAll("tr")).filter((tr) => tr.querySelector("th") && tr.querySelector("th").textContent.trim() === "Rape")
      .map((tr) => Array.from(tr.querySelectorAll("td")).map((td) => td.textContent.trim()));
    const subsetRows = Array.from(sect.querySelectorAll("tr.gsub th")).map((th) => th.textContent.trim());
    const unfounded = /Unfounded crimes/.test(sect.textContent);
    const disclosure = /do not measure the true prevalence/i.test(sect.textContent) && /not the same as zero/i.test(sect.textContent) && /not comparable as a safety ranking/i.test(sect.textContent);
    const nationalLinks = Array.from(sect.querySelectorAll("a")).map((a) => a.href).filter((h) => /thehotline\.org|loveisrespect\.org|justice\.gov/.test(h));
    return { tableCount: tables.length, headers, rape, subsetRows, unfounded, disclosure,
             hasNational: /National confidential services/.test(sect.textContent), nationalLinks };
  });
  ok(safety, "safety section not found");
  if (safety) {
    ok(safety.tableCount >= 5, "expected at least 5 safety tables, saw " + safety.tableCount);
    ok(safety.headers.every((h) => h.slice(1).join(",") === "2022,2023,2024"), "year columns must be labeled 2022/2023/2024");
    ok(safety.rape.length >= 2 && safety.rape[0].join(",") === "15,8,12", "on-campus Rape row must show 15/8/12, saw " + JSON.stringify(safety.rape[0]));
    ok(safety.subsetRows.some((t) => /subset of the on-campus counts/.test(t)), "housing rows must be labeled as a subset");
    ok(safety.unfounded, "unfounded table missing");
    ok(safety.disclosure, "prevalence / blank-not-zero / ranking disclosure missing");
    ok(safety.hasNational, "national resources missing");
    ok(safety.nationalLinks && safety.nationalLinks.length >= 2, "national resource links missing: " + JSON.stringify(safety.nationalLinks));
  }

  const stats = await page.evaluate(() => ({
    periods: Array.from(document.querySelectorAll(".gsrc")).length,
    bands: Array.from(document.querySelectorAll("table")).some((t) => /Family income/.test(t.textContent)),
    defs: Array.from(document.querySelectorAll(".gdefs li")).length,
  }));
  ok(stats.periods >= 4, "expected reporting-period lines under each stats table, saw " + stats.periods);
  ok(stats.bands, "income-band net price table missing");
  ok(stats.defs >= 15, "definitions list too short: " + stats.defs);

  const galleries = await page.evaluate(() => Array.from(document.querySelectorAll("[data-college-gallery]")).map((s) => ({
    label: s.getAttribute("aria-label"), count: Number(s.getAttribute("data-count")), cells: s.querySelectorAll(".cg-item").length,
  })));
  const activities = galleries.find((g) => g.label === "Campus activities");
  const nearby = galleries.find((g) => g.label === "Nearby places");
  ok(activities && activities.count >= 1 && activities.cells === activities.count, "activities gallery wrong: " + JSON.stringify(activities));
  ok(nearby && nearby.count >= 1 && nearby.cells === nearby.count, "nearby gallery wrong: " + JSON.stringify(nearby));

  // Lazy image loads once in view, dimensions reserved, credit + venue link rendered.
  await page.evaluate(() => { const s = Array.from(document.querySelectorAll("[data-college-gallery]")).find((x) => x.getAttribute("aria-label") === "Nearby places"); s.querySelector("img").scrollIntoView({ block: "center" }) });
  const imgOk = await page.waitForFunction(() => {
    const s = Array.from(document.querySelectorAll("[data-college-gallery]")).find((x) => x.getAttribute("aria-label") === "Nearby places");
    const img = s.querySelector("img");
    return img.complete && img.naturalWidth > 0 && img.getAttribute("loading") === "lazy" && img.getAttribute("width") && img.getAttribute("height");
  }, { timeout: 15000 }).then(() => true).catch(() => false);
  ok(imgOk, "nearby image must lazy-load with reserved dimensions");
  const credit = await page.evaluate(() => {
    const s = Array.from(document.querySelectorAll("[data-college-gallery]")).find((x) => x.getAttribute("aria-label") === "Nearby places");
    const cap = s.querySelector("figcaption");
    return { text: cap.textContent, links: Array.from(cap.querySelectorAll("a")).map((a) => a.href) };
  });
  ok(/Thomas/.test(credit.text) && /Public domain/.test(credit.text) && !/&(amp;)?middot/.test(credit.text), "credit text wrong: " + credit.text.slice(0, 80));
  ok(credit.links.some((h) => h.includes("commons.wikimedia.org")), "Commons file link missing");
  ok(credit.links.some((h) => h.includes("vallecrucispark.org")), "venue source link missing");

  // Lightbox keyboard contract on the new gallery.
  await page.click('[aria-label="Nearby places"] .cg-open');
  const lb = await page.waitForSelector('.cg-lb:not([hidden])', { timeout: 5000 }).then(() => true).catch(() => false);
  ok(lb, "lightbox did not open from the nearby gallery");
  await page.keyboard.press("Escape");
  const closed = await page.evaluate(() => document.querySelector(".cg-lb").hidden);
  ok(closed, "Escape must close the lightbox");

  // --- mobile: no horizontal overflow, section still readable --------------
  const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await m.goto(base + "/colleges/appalachian-state-university/", { waitUntil: "load" });
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok(overflow <= 2, "mobile horizontal overflow: " + overflow + "px");
  await m.close();

  // --- non-pilot page: stats yes, safety no ---------------------------------
  const np = await browser.newPage();
  await np.goto(base + "/colleges/auburn-university/", { waitUntil: "load" });
  const npState = await np.evaluate(() => ({
    safety: !!document.querySelector(".gsafety"),
    about: Array.from(document.querySelectorAll("h2")).some((h) => h.textContent.includes("About these numbers")),
    periods: document.querySelectorAll(".gsrc").length,
    galleries: document.querySelectorAll("[data-college-gallery]").length,
  }));
  ok(!npState.safety, "non-pilot page must not show a safety section");
  ok(npState.about && npState.periods >= 4, "non-pilot page must still carry stats provenance");
  ok(npState.galleries === 1, "non-pilot page keeps its single existing gallery, saw " + npState.galleries);
  await np.close();

  ok(errs.length === 0, "page errors: " + errs.slice(0, 2).join(" | "));
  await browser.close();
  server.close();
  if (fails.length) {
    console.error("FAIL (" + fails.length + "):");
    for (const f of fails) console.error(" -", f);
    process.exit(1);
  }
  console.log("PASS: pilot pages carry provenance lines, income bands, three-year cross-checked safety tables with housing separate, two labeled photo galleries with a working lightbox, and non-pilot pages stay clean.");
})().catch((e) => { console.error(e); process.exit(1); });
