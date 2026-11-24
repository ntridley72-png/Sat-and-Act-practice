/* Printable worksheets: pick skills, a length and a difficulty, preview the sheet, then print it
   (the print dialog's "Save as PDF" makes a PDF) or download it as an image. Questions come from the
   same bank as Subject practice. System fonts only, so the paper looks the same on every device. */
(function () {
  "use strict";
  const $id = (x) => document.getElementById(x);
  const esc = (s) => (typeof escapeHtml === "function" ? escapeHtml(s) : String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  const SECTION_LABEL = { rw: "Reading & Writing", math: "Math", english: "English", reading: "Reading", science: "Science" };
  const DIFFS = [["mixed", "Mixed"], ["easy", "Easier"], ["medium", "Medium"], ["hard", "Harder"]];
  const COUNTS = [5, 8, 10, 15, 20, 30];

  const ws = { test: "sat", keys: [], count: 10, diff: "mixed", key: true, explain: true, name: true, work: true, ids: [], open: false, opener: null };

  function inventory() { return window.FunSATSubjects ? window.FunSATSubjects.inventory() : {}; }
  function itemsFor(test) { return Object.values(inventory()).filter((x) => x.test === test); }

  // ---- choosing questions ----
  function shuffled(a) { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; }
  function pickIds() {
    const inv = inventory();
    const want = ws.keys.filter((k) => inv[k]);
    if (!want.length) return [];
    const ok = (id) => { const q = byId(id); return q && (ws.diff === "mixed" || q.diff === ws.diff); };
    // Least-seen first, so the sheet is mostly questions the student has not done recently.
    const pools = want.map((k) => shuffled(inv[k].ids.filter(ok)).sort((a, b) => ((profile.seen && profile.seen[a]) || 0) - ((profile.seen && profile.seen[b]) || 0)));
    const out = [];
    let i = 0;
    while (out.length < ws.count && pools.some((p) => p.length)) {
      const p = pools[i % pools.length];
      if (p.length) { const id = p.shift(); if (out.indexOf(id) < 0) out.push(id); }
      i++;
    }
    return out;
  }
  function regenerate() { ws.ids = pickIds(); }

  // ---- the sheet ----
  const letter = (i) => String.fromCharCode(65 + i);
  // A grid-in (typed answer) stores its answer as its only "choice"; it must print as a blank line and key as the answer itself.
  const hasChoices = (q) => q.kind !== "gridin" && Array.isArray(q.choices) && q.choices.length > 0;
  function sheetTitle() {
    const inv = inventory();
    const names = ws.keys.map((k) => inv[k] && inv[k].skill).filter(Boolean);
    if (!names.length) return "Practice worksheet";
    return names.length <= 3 ? names.join(", ") : names.slice(0, 3).join(", ") + " and " + (names.length - 3) + " more";
  }
  function sheetHtml() {
    const qs = ws.ids.map(byId).filter(Boolean);
    const date = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
    const seenPassage = new Map();
    const body = qs.map((q, i) => {
      const n = i + 1;
      let passage = "";
      if (q.passage) {
        const prev = seenPassage.get(q.passage);
        if (prev) passage = '<p class="ws-same">Use the passage from question ' + prev + ".</p>";
        else { seenPassage.set(q.passage, n); passage = '<div class="ws-passage">' + esc(q.passage) + "</div>"; }
      }
      const isMath = q.domain && /Algebra|Advanced Math|Problem-Solving|Geometry/.test(q.domain);
      const choices = hasChoices(q)
        ? '<ol class="ws-ch" type="A">' + q.choices.map((c, ci) => '<li><span class="ws-bub">' + letter(ci) + "</span><span>" + esc(c) + "</span></li>").join("") + "</ol>"
        : '<p class="ws-free">Answer: <span class="ws-line"></span></p>';
      return '<li class="ws-q"><div class="ws-qn">' + n + '</div><div class="ws-qb">' + passage + '<div class="ws-stem">' + esc(q.q) + "</div>" + choices +
        (ws.work && isMath ? '<div class="ws-work" aria-hidden="true"></div>' : "") + "</div></li>";
    }).join("");
    const key = ws.key ? '<section class="ws-keypage"><h2>Answer key</h2><p class="ws-sub">' + esc(sheetTitle()) + "</p>" +
      '<ol class="ws-keygrid">' + qs.map((q) => '<li><b>' + (hasChoices(q) ? letter(q.ans) : esc(q.answer == null ? "?" : q.answer)) + "</b></li>").join("") + "</ol>" +
      (ws.explain ? '<ol class="ws-exps">' + qs.map((q) => '<li><b>' + (hasChoices(q) ? letter(q.ans) + ".</b> " : "</b>") + esc(q.exp || "") + "</li>").join("") + "</ol>" : "") + "</section>" : "";
    return '<div class="ws-sheet"><header class="ws-head"><div><div class="ws-brand">FunSAT</div><h2 class="ws-title">' + esc(sheetTitle()) + '</h2><div class="ws-sub">' +
      esc(ws.test.toUpperCase()) + " practice · " + qs.length + " question" + (qs.length === 1 ? "" : "s") + " · " + esc(date) + "</div></div>" +
      (ws.name ? '<div class="ws-who"><div>Name <span class="ws-line"></span></div><div>Date <span class="ws-line"></span></div><div>Score <span class="ws-line short"></span> / ' + qs.length + "</div></div>" : "") +
      '</header><ol class="ws-qs">' + (body || '<li class="ws-empty">Pick at least one skill to build a worksheet.</li>') + "</ol>" + key + '<footer class="ws-foot">funsat.bid · free SAT and ACT practice</footer></div>';
  }

  // ---- dialog ----
  function modalHtml() {
    const items = itemsFor(ws.test);
    const bySection = {};
    items.forEach((x) => (bySection[x.section] = bySection[x.section] || []).push(x));
    const stats = profile.skillStats || {};
    const skillList = Object.keys(bySection).map((sec) =>
      '<fieldset class="ws-skills"><legend>' + esc(SECTION_LABEL[sec] || sec) + "</legend>" +
      bySection[sec].sort((a, b) => a.skill.localeCompare(b.skill)).map((x) => {
        const s = stats[x.key]; const acc = s && s.r + s.w ? Math.round((s.r / (s.r + s.w)) * 100) + "%" : "";
        return '<label class="ws-skill"><input type="checkbox" data-ws-key="' + esc(x.key) + '"' + (ws.keys.indexOf(x.key) >= 0 ? " checked" : "") + "><span>" + esc(x.skill) + (acc ? ' <i class="ws-acc">' + acc + "</i>" : "") + "</span></label>";
      }).join("") + "</fieldset>").join("");
    const opt = (id, label, val) => '<label class="ws-opt"><input type="checkbox" id="' + id + '"' + (val ? " checked" : "") + "> " + label + "</label>";
    return '<div class="ws-modal" role="dialog" aria-modal="true" aria-labelledby="wsTitle" id="wsDialog" tabindex="-1">' +
      '<div class="ws-bar"><h2 id="wsTitle">Make a worksheet</h2><button type="button" class="ghost" id="wsClose" aria-label="Close worksheet maker">Close</button></div>' +
      '<div class="ws-layout"><div class="ws-controls">' +
      '<div class="subject-tabs" role="tablist" aria-label="Test">' + ["sat", "act"].map((t) => '<button type="button" role="tab" aria-selected="' + (ws.test === t) + '" class="subject-tab' + (ws.test === t ? " active" : "") + '" data-ws-test="' + t + '">' + t.toUpperCase() + "</button>").join("") + "</div>" +
      '<div class="ws-fieldrow"><label>Questions<select id="wsCount">' + COUNTS.map((n) => '<option value="' + n + '"' + (ws.count === n ? " selected" : "") + ">" + n + "</option>").join("") + "</select></label>" +
      '<label>Difficulty<select id="wsDiff">' + DIFFS.map(([v, t]) => '<option value="' + v + '"' + (ws.diff === v ? " selected" : "") + ">" + t + "</option>").join("") + "</select></label></div>" +
      '<div class="ws-opts">' + opt("wsName", "Name and date lines", ws.name) + opt("wsWork", "Work space under math questions", ws.work) + opt("wsKey", "Answer key on its own page", ws.key) + opt("wsExp", "Explanations in the key", ws.explain) + "</div>" +
      '<p class="ws-help">Pick the skills to practise. Percentages are your accuracy so far.</p>' +
      '<div class="ws-skilllist" id="wsSkillList">' + skillList + "</div>" +
      '<p class="ws-count" id="wsNote" role="status"></p>' +
      '<div class="ws-actions"><button type="button" class="pl-primary" id="wsPrint">Print or save as PDF</button><button type="button" class="secondary" id="wsImage">Download as image</button><button type="button" class="ghost" id="wsShuffle">Different questions</button></div>' +
      '<p class="ws-help" id="wsMsg" role="status"></p></div>' +
      '<div class="ws-previewwrap"><div class="ws-preview" id="wsPreview" aria-label="Worksheet preview"></div></div></div></div>';
  }
  function updatePreview() {
    const pv = $id("wsPreview"); if (pv) pv.innerHTML = sheetHtml();
    const note = $id("wsNote");
    if (note) {
      const have = ws.ids.length;
      note.textContent = !ws.keys.length ? "Choose at least one skill." : have < ws.count ? "Only " + have + " question" + (have === 1 ? "" : "s") + " match these choices. Add another skill or set difficulty to Mixed for more." : have + " questions ready.";
    }
  }
  function bind() {
    const root = $id("wsRoot");
    root.querySelector("#wsClose").addEventListener("click", close);
    root.querySelectorAll("[data-ws-test]").forEach((b) => b.addEventListener("click", () => { ws.test = b.dataset.wsTest; ws.keys = []; regenerate(); render(); }));
    root.querySelectorAll("[data-ws-key]").forEach((c) => c.addEventListener("change", () => {
      ws.keys = Array.from(root.querySelectorAll("[data-ws-key]")).filter((x) => x.checked).map((x) => x.dataset.wsKey);
      regenerate(); updatePreview();
    }));
    const on = (id, f) => { const el = $id(id); if (el) el.addEventListener("change", () => { f(el); }); };
    on("wsCount", (el) => { ws.count = Number(el.value) || 10; regenerate(); updatePreview(); });
    on("wsDiff", (el) => { ws.diff = el.value; regenerate(); updatePreview(); });
    on("wsName", (el) => { ws.name = el.checked; updatePreview(); });
    on("wsWork", (el) => { ws.work = el.checked; updatePreview(); });
    on("wsKey", (el) => { ws.key = el.checked; $id("wsExp").disabled = !el.checked; updatePreview(); });
    on("wsExp", (el) => { ws.explain = el.checked; updatePreview(); });
    $id("wsShuffle").addEventListener("click", () => { regenerate(); updatePreview(); });
    $id("wsPrint").addEventListener("click", printSheet);
    $id("wsImage").addEventListener("click", downloadImage);
    $id("wsExp").disabled = !ws.key;
  }
  function render() {
    const root = $id("wsRoot"); if (!root) return;
    root.innerHTML = modalHtml(); bind(); updatePreview();
  }
  function onKey(e) { if (e.key === "Escape" && ws.open) { e.stopPropagation(); close(); } }
  function open(opts) {
    opts = opts || {};
    ws.test = opts.test === "act" ? "act" : "sat";
    const inv = inventory();
    ws.keys = (opts.keys || []).filter((k) => inv[k] && inv[k].test === ws.test);
    if (!ws.keys.length) {
      // Default to the student's weakest practised skills, else the first skills in the test.
      const stats = profile.skillStats || {};
      const ranked = itemsFor(ws.test).map((x) => { const s = stats[x.key]; return { x, acc: s && s.r + s.w >= 3 ? s.r / (s.r + s.w) : null }; }).filter((e) => e.acc != null).sort((a, b) => a.acc - b.acc).slice(0, 3);
      ws.keys = ranked.length ? ranked.map((e) => e.x.key) : itemsFor(ws.test).slice(0, 2).map((x) => x.key);
    }
    if (opts.count) ws.count = opts.count;
    ws.opener = document.activeElement;
    let root = $id("wsRoot");
    if (!root) { root = document.createElement("div"); root.id = "wsRoot"; root.className = "ws-root"; document.body.appendChild(root); }
    root.hidden = false; ws.open = true;
    document.body.classList.add("ws-open");
    regenerate(); render();
    document.addEventListener("keydown", onKey, true);
    const d = $id("wsDialog"); if (d) d.focus();
  }
  function close() {
    const root = $id("wsRoot"); if (root) { root.hidden = true; root.innerHTML = ""; }
    ws.open = false; document.body.classList.remove("ws-open");
    document.removeEventListener("keydown", onKey, true);
    if (ws.opener && ws.opener.focus) { try { ws.opener.focus(); } catch (e) { /* ignore */ } }
  }

  // ---- print and image ----
  function say(msg) { const m = $id("wsMsg"); if (m) m.textContent = msg; }
  function printSheet() {
    if (!ws.ids.length) { say("Choose at least one skill first."); return; }
    let root = $id("wsPrintRoot");
    if (!root) { root = document.createElement("div"); root.id = "wsPrintRoot"; root.setAttribute("aria-hidden", "true"); document.body.appendChild(root); }
    root.innerHTML = sheetHtml();
    const done = () => { root.innerHTML = ""; window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    say("In the print window, choose “Save as PDF” as the destination to get a PDF.");
    setTimeout(() => { try { window.print(); } catch (e) { say("Printing is not available in this browser."); } }, 50);
  }
  function sheetCss() {
    let css = "";
    Array.from(document.styleSheets).forEach((sheet) => {
      let rules; try { rules = sheet.cssRules; } catch (e) { return; }
      Array.from(rules || []).forEach((r) => { if (r.type === 1 && /(^|[\s,>])\.ws-(sheet|head|brand|title|sub|who|line|qs|q|qn|qb|passage|same|stem|ch|bub|free|work|keypage|keygrid|exps|foot|empty)/.test(r.selectorText) && !/#wsRoot|\.ws-modal|\.ws-preview\b/.test(r.selectorText)) css += r.cssText + "\n"; });
    });
    return css;
  }
  async function downloadImage() {
    if (!ws.ids.length) { say("Choose at least one skill first."); return; }
    say("Building the image…");
    try {
      const W = 816;
      const holder = document.createElement("div");
      holder.style.cssText = "position:fixed;left:-99999px;top:0;width:" + W + "px";
      holder.innerHTML = sheetHtml(); document.body.appendChild(holder);
      const H = Math.ceil(holder.scrollHeight);
      const inner = new XMLSerializer().serializeToString(holder.firstElementChild);
      document.body.removeChild(holder);
      const xml = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '"><foreignObject x="0" y="0" width="100%" height="100%">' +
        '<div xmlns="http://www.w3.org/1999/xhtml" style="width:' + W + 'px;background:#fff"><style>' + sheetCss() + "</style>" + inner + "</div></foreignObject></svg>";
      // A data: URL (not a blob: URL) keeps the canvas exportable in Chromium browsers.
      const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("render")); img.src = url; });
      const scale = H * 2 > 15000 ? 1 : 2;
      const canvas = document.createElement("canvas"); canvas.width = W * scale; canvas.height = H * scale;
      const c = canvas.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, canvas.width, canvas.height); c.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
      if (!blob) throw new Error("blob");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "funsat-worksheet.png"; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      say("Image saved. If you want a PDF instead, use Print and choose Save as PDF.");
    } catch (e) { say("This browser could not make the image. Use “Print or save as PDF” instead."); }
  }

  window.FunSATWorksheet = { open, close, state: ws, sheetHtml };
})();
