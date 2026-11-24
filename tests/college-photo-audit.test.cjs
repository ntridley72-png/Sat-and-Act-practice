/* Shipped college galleries obey the photo rules in scripts/college_photo_audit.py: nothing older than 15 years by its
   file name, no scanned book or yearbook pages, no off-topic images, every photo with a recorded license. */
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const out = JSON.parse(execFileSync("python3", [path.join(__dirname, "..", "scripts", "college_photo_audit.py"), "--check"], { encoding: "utf8" }));
assert.equal(out.removed, 0, "photos that break the rules are still shipped: " + JSON.stringify(out.byReason));
assert.ok(out.photosAfter > 900, "the galleries were not emptied by accident");
console.log("PASS: " + out.photosAfter + " college photos, none older than " + out.cutoffYear + ", scanned, off topic, or unlicensed.");
