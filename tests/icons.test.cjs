/* The icon set and the app icons. Pure file checks, no browser.
 *   - every icon is well-formed (24px grid, drawn with strokes, no hard-coded colours, so it follows the text colour);
 *   - every ico("name") the interface asks for exists (a typo would silently draw nothing);
 *   - the interface no longer uses emoji where an icon belongs (the arcade cabinet keeps its own pixel style);
 *   - the app icons (favicon, PWA, home-screen) exist at the sizes the manifest and page head promise. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const I = require("../icons.js");

// ---- the set
assert.ok(I.names.length >= 25, "the set has " + I.names.length + " icons");
for (const name of I.names) {
  const svg = I.html(name);
  assert.match(svg, /^<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false">.+<\/svg>$/, name + " is a 24px-grid svg");
  assert.ok(!/(fill|stroke)="(?!none|currentColor)[^"]+"/.test(svg) && !/#[0-9a-f]{3,6}/i.test(svg), name + " hard-codes a colour");
  assert.match(svg, /<(path|circle|rect)/, name + " draws something");
}
assert.equal(I.html("no-such-icon"), "", "an unknown icon draws nothing rather than breaking the page");
assert.match(I.html("check", "big"), /class="ic big"/, "extra classes are added");

// ---- every request names a real icon
const used = new Set();
for (const f of ["app.js", "redesign.js", "subjects.js", "plan.js", "college.js", "SAT & ACT Practice.html"]) {
  const src = fs.readFileSync(f, "utf8");
  for (const m of src.matchAll(/\bico\((["'])([a-z0-9-]+)\1/g)) used.add(m[2]);
}
assert.ok(used.size >= 10, "the interface asks for " + used.size + " icons");
for (const name of used) assert.ok(I.has(name), 'ico("' + name + '") is not in the icon set');

// ---- no emoji standing in for icons in the interface chrome
const html = fs.readFileSync("SAT & ACT Practice.html", "utf8");
const banned = ["⏸", "▶ Resume", "🤷", "📖", "🎮", "🏛", "📈", "💡", "🧮", "✅", "🟡", "❌", "⛶"];
const uiLines = (src) => src.split("\n").filter((l) => !/^\s*\{\s*"?id"?\s*:/.test(l) && l.length < 1800 && !/arcade|Arcade|cab-|showOverlay|PAUSED/.test(l));
for (const [file, src] of [["SAT & ACT Practice.html", html], ["app.js", fs.readFileSync("app.js", "utf8")], ["redesign.js", fs.readFileSync("redesign.js", "utf8")]]) {
  for (const line of uiLines(src)) for (const e of banned) assert.ok(!line.includes(e), `${file} still uses "${e}" as an icon: ${line.trim().slice(0, 110)}`);
}

// ---- app icons
const png = (f) => { const b = fs.readFileSync(f); assert.equal(b.subarray(1, 4).toString(), "PNG", f + " is a PNG"); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
for (const [f, size] of [["favicon-48.png", 48], ["favicon-96.png", 96], ["favicon-192.png", 192], ["logo-512.png", 512], ["apple-touch-icon.png", 180], ["favicon.png", 32]]) {
  assert.deepEqual(png(f), [size, size], f + " is " + size + "px square");
}
const ico = fs.readFileSync("favicon.ico");
assert.equal(ico.readUInt16LE(2), 1, "favicon.ico is an icon file");
const entries = ico.readUInt16LE(4), dims = [];
for (let i = 0; i < entries; i++) dims.push(ico[6 + i * 16] || 256);
for (const d of [16, 32, 48]) assert.ok(dims.includes(d), "favicon.ico has a " + d + "px image (has " + dims.join(", ") + ")");
const fav = fs.readFileSync("favicon.svg", "utf8");
assert.match(fav, /fill="#0B5FFF"/, "the app icon uses the interface blue");
assert.match(fav, /<title>FunSAT<\/title>/);
const manifest = JSON.parse(fs.readFileSync("manifest.webmanifest", "utf8"));
for (const icon of manifest.icons) assert.ok(fs.existsSync(icon.src.replace(/^\//, "")), "manifest icon " + icon.src + " exists");

console.log("PASS: " + I.names.length + " icons are well-formed, every ico() call resolves, the interface carries no emoji icons, and the app icons exist at the promised sizes.");
