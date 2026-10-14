/* Avatars: head-and-shoulders silhouettes in eight accessible color
   combinations, offered rather than assigned, correctly sized and labelled,
   falling back to the badge, plus the custom photo path (canvas re-encode,
   allowlisted types, decoded-size validation, remove, and tamper rejection). */
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

  // ---- pure art: silhouette inside a circular disc, distinct color combos
  const gen = await page.evaluate(() => {
    const A = window.FunSATAvatar;
    if (!A) return null;
    const parse = (markup) => {
      const d = document.createElement("div");
      d.innerHTML = markup;
      const svg = d.firstChild;
      const head = svg.querySelector("g > circle:not([r='24'])");
      const badge = svg.querySelector("g > circle[r='24']");
      const shoulders = svg.querySelector("g > path");
      return {
        box: svg.getAttribute("viewBox"), w: svg.getAttribute("width"),
        role: svg.getAttribute("role"), aria: svg.getAttribute("aria-label"),
        hidden: svg.getAttribute("aria-hidden"),
        head: head ? { cx: head.getAttribute("cx"), cy: head.getAttribute("cy"), r: head.getAttribute("r") } : null,
        badge: badge ? badge.getAttribute("fill") : null,
        shoulders: !!shoulders,
      };
    };
    const a = parse(A.svg("learner@example.com", 3, 76));
    const b = parse(A.svg("someone-else@example.com", 3, 76));
    const dec = parse(A.svg("learner@example.com", 3, 30, { decorative: true }));
    const fills = new Set(), ids = new Set();
    for (let i = 0; i < A.VARIANTS; i++) { const p = parse(A.svg("learner@example.com", i, 76)); fills.add(p.badge); }
    const invalid = A.svg("learner@example.com", "not-a-number", 76);
    return {
      box: a.box, w: a.w, role: a.role, aria: a.aria, decHidden: dec.hidden, decAria: dec.aria,
      head: a.head, shoulders: a.shoulders, sameForDifferentSeeds: JSON.stringify(a) === JSON.stringify(b),
      fills: fills.size, count: A.VARIANTS, invalidRenders: /<svg/.test(invalid),
      signedOutSeed: A.seedFor(null), safeSvg: A.validPhoto("data:image/svg+xml;base64,PHN2Zy8+"),
      safeHtml: A.validPhoto("data:text/html;base64,PHNjcmlwdD4="),
      safeJpeg: A.validPhoto("data:image/jpeg;base64,AAAA"),
      safePng: A.validPhoto("data:image/png;base64,AAAA"),
    };
  });
  ok(gen, "FunSATAvatar did not load");
  if (gen) {
    ok(gen.box === "0 0 48 48", "silhouette viewBox should be 48x48, got " + gen.box);
    ok(gen.head && gen.head.r && gen.shoulders, "art must contain a head circle and shoulders");
    ok(gen.sameForDifferentSeeds, "silhouettes are chosen by variant, not seeded per account");
    ok(gen.fills >= gen.count, `each variant needs its own color combination, got ${gen.fills} fills for ${gen.count} variants`);
    ok(gen.invalidRenders, "an invalid variant falls back to the first combo instead of crashing");
    ok(gen.role === "img" && gen.aria === "Your avatar", 'a shown avatar needs role="img" and aria-label "Your avatar"');
    ok(gen.decHidden === "true" && !gen.decAria, "a decorative avatar must be aria-hidden with no label");
    ok(gen.signedOutSeed === null, "signed out there is no stable id to seed from");
    ok(gen.safeSvg === false, "SVG data URLs must never validate as a photo");
    ok(gen.safeHtml === false, "HTML data URLs must never validate as a photo");
    ok(gen.safeJpeg === true && gen.safePng === true, "canvas-produced PNG/JPEG data URLs are accepted");
  }

  // ---- signed out: the letter/glyph badge, never an avatar
  const out = await page.evaluate(() => {
    const av = document.querySelector("#btnAccount .av");
    return { svg: !!av.querySelector("svg"), img: !!av.querySelector("img"), text: av.textContent.trim(), cls: av.className };
  });
  ok(!out.svg && !out.img, "signed out must not render an avatar");
  ok(out.text.length > 0 && !/has-avatar/.test(out.cls), "signed out must fall back to the badge");

  // ---- signed in: nothing until a choice is made
  await page.evaluate(() => { cloud.user = { email: "Learner@Example.com" }; paintAccount(); document.getElementById("authModal").classList.add("show"); });
  const before = await page.evaluate(() => ({
    svg: !!document.querySelector("#btnAccount .av svg"),
    stored: profile.avatar === undefined ? "unset" : String(profile.avatar),
    image: profile.avatarImage || null,
    pickerHidden: document.getElementById("avatarPicker").hidden,
    options: document.querySelectorAll("#avatarChoices [data-avatar]").length,
    noneOn: document.querySelector('[data-avatar="none"]').classList.contains("on"),
  }));
  ok(!before.svg, "an avatar must not be assigned silently on sign-in");
  ok(before.stored === "unset" || before.stored === "null", "nothing should be stored before a choice: " + before.stored);
  ok(!before.image, "no photo is set before a choice");
  ok(!before.pickerHidden, "the picker should be available once signed in");
  ok(before.options === 9, "8 variants plus a no-avatar option: " + before.options);
  ok(before.noneOn, '"No avatar" is the state until something is picked');

  // ---- picking one: stored in the profile, sized in the top bar and picker
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

  // ---- custom photo: valid upload is cropped, re-encoded, previewed, removable
  const uploaded = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 600; canvas.height = 400;
    const c = canvas.getContext("2d");
    c.fillStyle = "#3366cc"; c.fillRect(0, 0, 600, 400);
    c.fillStyle = "#ffcc00"; c.fillRect(250, 150, 100, 100);
    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    const file = new File([blob], "photo.png", { type: "image/png" });
    await handleAvatarUpload(file);
    return {
      stored: profile.avatarImage || "",
      topbarImg: !!document.querySelector("#btnAccount .av img"),
      tile: !!document.querySelector(".fxav-photo-tile"),
      removeVisible: !document.getElementById("avatarRemovePhoto").hidden,
      status: document.getElementById("avatarUploadStatus").textContent,
      variantOn: document.querySelector('[data-avatar="4"]').classList.contains("on"),
    };
  });
  ok(/^data:image\/jpeg;base64,/.test(uploaded.stored), "the upload must be stored as a re-encoded JPEG data URL");
  ok(uploaded.topbarImg, "the top-bar avatar must show the uploaded photo");
  ok(uploaded.tile, "the picker must preview the uploaded photo");
  ok(uploaded.removeVisible, "Remove photo must be available once a photo is set");
  ok(!uploaded.variantOn, "the photo takes precedence over the silhouette selection");
  ok(/saved/i.test(uploaded.status), "the status line should confirm the save: " + uploaded.status);

  // ---- unsafe and invalid uploads are rejected without changing the photo
  const rejected = await page.evaluate(async () => {
    const before = profile.avatarImage;
    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"></svg>'], "x.svg", { type: "image/svg+xml" });
    await handleAvatarUpload(svg);
    const afterSvg = { same: profile.avatarImage === before, status: document.getElementById("avatarUploadStatus").textContent };
    const html = new File(["<script>alert(1)</script>"], "x.html", { type: "text/html" });
    await handleAvatarUpload(html);
    const afterHtml = { same: profile.avatarImage === before, status: document.getElementById("avatarUploadStatus").textContent };
    const big = new File([new Uint8Array(6 * 1024 * 1024)], "big.png", { type: "image/png" });
    await handleAvatarUpload(big);
    const afterBig = { same: profile.avatarImage === before, status: document.getElementById("avatarUploadStatus").textContent };
    const tiny = document.createElement("canvas"); tiny.width = 8; tiny.height = 8;
    const tinyBlob = await new Promise((r) => tiny.toBlob(r, "image/png"));
    await handleAvatarUpload(new File([tinyBlob], "tiny.png", { type: "image/png" }));
    const afterTiny = { same: profile.avatarImage === before, status: document.getElementById("avatarUploadStatus").textContent };
    return { afterSvg, afterHtml, afterBig, afterTiny };
  });
  ok(rejected.afterSvg.same && /type/i.test(rejected.afterSvg.status), "SVG uploads must be rejected: " + rejected.afterSvg.status);
  ok(rejected.afterHtml.same && /type/i.test(rejected.afterHtml.status), "HTML uploads must be rejected");
  ok(rejected.afterBig.same && /5 MB/i.test(rejected.afterBig.status), "oversized uploads must be rejected: " + rejected.afterBig.status);
  ok(rejected.afterTiny.same && /64/.test(rejected.afterTiny.status), "tiny images must be rejected: " + rejected.afterTiny.status);

  // ---- a tampered profile image is treated as absent
  const tampered = await page.evaluate(() => {
    profile.avatarImage = "data:image/svg+xml;base64,PHN2Zy8+";
    paintAvatar();
    const slot = document.querySelector("#btnAccount .av");
    return { img: !!slot.querySelector("img"), svg: !!slot.querySelector("svg") };
  });
  ok(!tampered.img, "a tampered avatarImage must never render as an image");
  ok(tampered.svg, "a tampered avatarImage quietly falls back to the chosen silhouette");

  // ---- remove photo and pick no avatar
  await page.evaluate(() => { profile.avatarImage = null; paintAvatar(); });
  await page.click('[data-avatar="none"]');
  const none = await page.evaluate(() => ({ stored: profile.avatar, image: profile.avatarImage, svg: !!document.querySelector("#btnAccount .av svg"), img: !!document.querySelector("#btnAccount .av img") }));
  ok(none.stored === null, '"No avatar" must clear the silhouette choice');
  ok(!none.image, "the photo must be clearable");
  ok(!none.svg && !none.img, '"No avatar" must return the badge');

  // ---- deterministic across a reload (same stored variant)
  await page.evaluate(() => { profile.avatar = 4; saveProfile(); });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("body[data-workspace]");
  await page.evaluate(() => { try { arcade.close(); } catch (e) {} });
  const again = await page.evaluate(() => {
    cloud.user = { email: "learner@example.com" }; paintAccount();
    document.getElementById("authModal").classList.add("show");
    return { stored: profile.avatar, hasArt: !!document.querySelector("#btnAccount .av svg") };
  });
  ok(again.stored === 4, "the stored pick survives a reload");
  ok(again.hasArt, "the avatar redraws after a reload");

  await browser.close();
  errors.filter((e) => !/api|404/.test(e)).forEach((e) => fails.push("pageerror: " + e));
  fails.forEach((f) => console.log("FAIL " + f));
  console.log(fails.length ? `\nRESULT: ${fails.length} failure(s)` : "PASS: silhouettes are distinct, offered not assigned, correctly sized and labelled, custom photos are cropped/re-encoded/validated and tamper-proof, and everything falls back to the badge.");
  process.exit(fails.length ? 1 : 0);
})();
