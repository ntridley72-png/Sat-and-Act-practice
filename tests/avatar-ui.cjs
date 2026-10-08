/* Generated avatars: deterministic from the account id, mirrored 5x5, offered
   rather than assigned, 30px in the top bar and 76px in the picker, and a
   letter/glyph fallback when signed out. */
const { chromium } = require("playwright-core");
const path = require("node:path");
const os = require("node:os");

const EXEC = path.join(os.homedir(), "Library/Caches/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-mac-x64/chrome-headless-shell");
const BASE = process.env.BASE_URL || "http://localhost:8899";
const APP = "/" + encodeURIComponent("SAT & ACT Practice.html");
const fails = [];
const ok = (c, m) => { if (!c) fails.push(m); };

(async () => {
  const browser = await chromium.launch({ executablePath: EXEC, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/**", (r) => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await page.goto(BASE + APP, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("body[data-workspace]");
  await page.evaluate(() => { try { arcade.close(); } catch (e) {} });

  // ---- pure generator: deterministic, mirrored, 5x5
  const gen = await page.evaluate(() => {
    const A = window.FunSATAvatar;
    if (!A) return null;
    const parse = (markup) => {
      const d = document.createElement("div");
      d.innerHTML = markup;
      const svg = d.firstChild;
      const cells = Array.from(svg.querySelectorAll("g rect")).map((r) => [Number(r.getAttribute("x")), Number(r.getAttribute("y"))]);
      return { box: svg.getAttribute("viewBox"), w: svg.getAttribute("width"), cells, aria: svg.getAttribute("aria-label"), hidden: svg.getAttribute("aria-hidden"), role: svg.getAttribute("role") };
    };
    const a = parse(A.svg("learner@example.com", 3, 76));
    const b = parse(A.svg("learner@example.com", 3, 76));
    const other = parse(A.svg("someone-else@example.com", 3, 76));
    const dec = parse(A.svg("learner@example.com", 3, 30, { decorative: true }));
    const set = new Set(a.cells.map((c) => c.join(",")));
    const mirrored = a.cells.every(([x, y]) => set.has((4 - x) + "," + y));
    const inRange = a.cells.every(([x, y]) => x >= 0 && x < 5 && y >= 0 && y < 5);
    const variants = new Set();
    for (let i = 0; i < A.VARIANTS; i++) variants.add(parse(A.svg("learner@example.com", i, 76)).cells.map((c) => c.join(",")).join("|"));
    return { same: JSON.stringify(a.cells) === JSON.stringify(b.cells), differs: JSON.stringify(a.cells) !== JSON.stringify(other.cells),
      mirrored, inRange, box: a.box, aria: a.aria, role: a.role, decHidden: dec.hidden, decAria: dec.aria,
      distinct: variants.size, count: A.VARIANTS, cells: a.cells.length, signedOutSeed: A.seedFor(null) };
  });
  ok(gen, "FunSATAvatar did not load");
  if (gen) {
    ok(gen.box === "0 0 5 5", "the grid must be 5x5: " + gen.box);
    ok(gen.inRange, "cells must stay inside the 5x5 grid");
    ok(gen.mirrored, "the pattern must mirror down the vertical axis");
    ok(gen.same, "the same id and variant must always draw the same avatar");
    ok(gen.differs, "a different id must draw a different avatar");
    ok(gen.distinct >= gen.count - 1, `the ${gen.count} variants should be distinct, got ${gen.distinct}`);
    ok(gen.role === "img" && gen.aria === "Your avatar", 'a shown avatar needs role="img" and aria-label "Your avatar"');
    ok(gen.decHidden === "true" && !gen.decAria, "a decorative avatar must be aria-hidden with no label");
    ok(gen.signedOutSeed === null, "signed out there is no stable id to seed from");
  }

  // ---- signed out: the letter/glyph badge, never a generated avatar
  const out = await page.evaluate(() => {
    const av = document.querySelector("#btnAccount .av");
    return { svg: !!av.querySelector("svg"), text: av.textContent.trim(), cls: av.className };
  });
  ok(!out.svg, "signed out must not render a generated avatar");
  ok(out.text.length > 0 && !/has-avatar/.test(out.cls), "signed out must fall back to the badge");

  // ---- signed in: still nothing until a choice is made
  await page.evaluate(() => { cloud.user = { email: "Learner@Example.com" }; paintAccount(); document.getElementById("authModal").classList.add("show"); });
  const before = await page.evaluate(() => ({
    svg: !!document.querySelector("#btnAccount .av svg"),
    stored: profile.avatar === undefined ? "unset" : String(profile.avatar),
    pickerHidden: document.getElementById("avatarPicker").hidden,
    options: document.querySelectorAll("#avatarChoices [data-avatar]").length,
    noneOn: document.querySelector('[data-avatar="none"]').classList.contains("on"),
  }));
  ok(!before.svg, "an avatar must not be assigned silently on sign-in");
  ok(before.stored === "unset" || before.stored === "null", "nothing should be stored before a choice: " + before.stored);
  ok(!before.pickerHidden, "the picker should be available once signed in");
  ok(before.options === 9, "8 variants plus a no-avatar option: " + before.options);
  ok(before.noneOn, '"No avatar" is the state until something is picked');

  // ---- picking one: stored in the profile, 30px in the top bar, 76px in the picker
  await page.click('[data-avatar="4"]');
  const after = await page.evaluate(() => {
    const topbar = document.querySelector("#btnAccount .av svg");
    const opt = document.querySelector('[data-avatar="4"] svg');
    return {
      stored: profile.avatar,
      topbar: topbar ? Math.round(parseFloat(getComputedStyle(topbar).width)) : 0,
      picker: opt ? Math.round(parseFloat(getComputedStyle(opt).width)) : 0,
      topbarHidden: topbar && topbar.getAttribute("aria-hidden"),
      checked: document.querySelector('[data-avatar="4"]').getAttribute("aria-checked"),
      persisted: JSON.parse(localStorage.getItem("satPrepProfile_v1") || "{}").avatar,
    };
  });
  ok(after.stored === 4, "the pick must be stored in the profile object: " + after.stored);
  ok(after.persisted === 4, "the pick must persist: " + after.persisted);
  ok(after.topbar === 30, "30px in the top bar, got " + after.topbar);
  ok(after.picker === 76, "76px in the picker, got " + after.picker);
  ok(after.topbarHidden === "true", "the top-bar copy is decorative and must be aria-hidden");
  ok(after.checked === "true", "the chosen option must report aria-checked");

  // ---- deterministic across a reload (same id, no stored image)
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("body[data-workspace]");
  await page.evaluate(() => { try { arcade.close(); } catch (e) {} });
  const again = await page.evaluate(() => {
    cloud.user = { email: "learner@example.com" }; paintAccount();
    document.getElementById("authModal").classList.add("show");
    return { stored: profile.avatar, cells: document.querySelectorAll("#btnAccount .av svg g rect").length };
  });
  ok(again.stored === 4, "the stored pick survives a reload");
  ok(again.cells > 0, "the avatar redraws from the id after a reload");

  // ---- back to none
  await page.click('[data-avatar="none"]');
  const none = await page.evaluate(() => ({ stored: profile.avatar, svg: !!document.querySelector("#btnAccount .av svg") }));
  ok(none.stored === null, '"No avatar" must clear the choice');
  ok(!none.svg, '"No avatar" must return the badge');

  await browser.close();
  errors.filter((e) => !/api|404/.test(e)).forEach((e) => fails.push("pageerror: " + e));
  fails.forEach((f) => console.log("FAIL " + f));
  console.log(fails.length ? `\nRESULT: ${fails.length} failure(s)` : "PASS: avatars are deterministic, mirrored, offered not assigned, correctly sized and labelled, and fall back to the badge.");
  process.exit(fails.length ? 1 : 0);
})();
