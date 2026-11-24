/* Bluebook-style practice screen (Exam theme). Runs after workspace.js and only rearranges what
   the existing renderers produced, so every id and handler keeps working: it moves the bottom-bar
   controls into three groups, adds a "More" menu for the less-used actions, turns the calculator
   into a draggable window (a sheet on phones) with the same Desmos instance, and tucks the
   learning tools behind a tutor bubble. Fails open: if anything is missing the stock layout stays. */
(() => {
  "use strict";
  if (typeof renderQuestion !== "function" || typeof state === "undefined") return;
  const $id = (id) => document.getElementById(id);
  const POS_KEY = "funsat.calcPos";
  const isBB = () => document.body.dataset.workspace === "exam" && document.body.classList.contains("workspace-practicing");

  function syncTestType() {
    try { document.body.dataset.test = state.cfg && state.cfg.testType === "act" ? "act" : "sat"; } catch (e) {}
  }

  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }

  function groupFoot() {
    const foot = document.querySelector("#questionCard .bb-foot");
    if (!foot || foot.dataset.bbx) return;
    foot.dataset.bbx = "1";
    const left = el("div", "bbx-left"), mid = el("div", "bbx-mid"), right = el("div", "bbx-right");
    const elim = $id("btnElim"), flag = $id("btnFlag"), check = $id("btnCheck");
    const nav = foot.querySelector(".bb-navwrap"), btns = foot.querySelector(".bb-btns");
    if (elim) left.append(elim);
    if (flag) left.append(flag);
    if (nav) mid.append(nav);
    if (btns) { right.append(btns); if (check) btns.append(check); }
    else if (check) right.append(check);
    foot.prepend(left, mid, right);
  }

  function placeDock() {
    const dock = $id("workspaceCalcDock"), learn = document.querySelector("#questionCard .workspace-learning");
    if (dock && learn && dock.parentNode === learn) learn.before(dock);
  }

  function ensureMore() {
    const home = document.querySelector(".workspace-tools-home");
    if (!home || $id("btnMore")) return;
    const b = el("button", "tool-btn", "");
    b.type = "button"; b.id = "btnMore"; b.setAttribute("aria-haspopup", "true"); b.setAttribute("aria-expanded", "false");
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/></svg><span>More</span>';
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = document.body.classList.toggle("bb-more-open");
      b.setAttribute("aria-expanded", String(open));
    });
    const bar = $id("toolsBar");
    (bar || home).append(b);
  }

  function ensureBubble() {
    if ($id("bbxBubble")) return;
    const b = el("button", "bbx-bubble", "?");
    b.type = "button"; b.id = "bbxBubble"; b.setAttribute("aria-label", "Ask the tutor for help"); b.setAttribute("aria-expanded", "false");
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = document.body.classList.toggle("bb-ai-open");
      b.setAttribute("aria-expanded", String(open));
      b.textContent = open ? "×" : "?";
      b.setAttribute("aria-label", open ? "Close the tutor" : "Ask the tutor for help");
    });
    document.body.append(b);
  }

  // Drag the calculator window by its header; the spot is remembered per device.
  let dragWired = false;
  function wireDrag() {
    if (dragWired) return;
    dragWired = true;
    document.addEventListener("pointerdown", (e) => {
      const head = e.target.closest && e.target.closest(".workspace-calculator-dock .calc-head");
      if (!head || e.target.closest("button") || window.matchMedia("(max-width:820px)").matches || !isBB() || document.body.classList.contains("bb-calc-docked")) return;
      const dock = head.closest(".workspace-calculator-dock");
      const r = dock.getBoundingClientRect();
      const dx = e.clientX - r.left, dy = e.clientY - r.top;
      dock.classList.add("dragging");
      try { head.setPointerCapture && head.setPointerCapture(e.pointerId); } catch (er) { /* the pointer is already gone; the drag still works from move events */ }
      const move = (ev) => {
        const x = Math.min(Math.max(0, ev.clientX - dx), window.innerWidth - 120);
        const y = Math.min(Math.max(60, ev.clientY - dy), window.innerHeight - 80);
        dock.style.left = x + "px"; dock.style.top = y + "px"; dock.style.right = "auto";
      };
      const up = () => {
        dock.classList.remove("dragging");
        head.removeEventListener("pointermove", move); head.removeEventListener("pointerup", up); head.removeEventListener("pointercancel", up);
        try { localStorage.setItem(POS_KEY, JSON.stringify({ l: dock.style.left, t: dock.style.top })); } catch (er) {}
        try { if (calcTool.engine === "desmos" && calcTool.calc) calcTool.calc.resize(); } catch (er) {}
      };
      head.addEventListener("pointermove", move); head.addEventListener("pointerup", up); head.addEventListener("pointercancel", up);   // a cancelled touch must not leave it stuck mid-drag
      e.preventDefault();
    });
  }
  // If the window shrinks (or the device rotates) after the calculator was moved, bring it back on screen.
  function clampDock() {
    const dock = $id("workspaceCalcDock");
    if (!dock || !dock.style.left || window.matchMedia("(max-width:820px)").matches || document.body.classList.contains("bb-calc-docked")) return;
    const r = dock.getBoundingClientRect();
    dock.style.left = Math.max(0, Math.min(r.left, window.innerWidth - 140)) + "px";
    dock.style.top = Math.max(60, Math.min(r.top, window.innerHeight - 100)) + "px";
  }
  window.addEventListener("resize", () => { try { clampDock(); if (calcTool.engine === "desmos" && calcTool.calc) calcTool.calc.resize(); } catch (e) {} });
  function restorePos() {
    const dock = $id("workspaceCalcDock");
    if (!dock || window.matchMedia("(max-width:820px)").matches) { if (dock) { dock.style.left = ""; dock.style.top = ""; dock.style.right = ""; } return; }
    if (document.body.classList.contains("bb-calc-docked")) return;
    try {
      const p = JSON.parse(localStorage.getItem(POS_KEY) || "null");
      if (p && p.l && p.t) {
        const l = Math.min(parseFloat(p.l), window.innerWidth - 140), t = Math.min(parseFloat(p.t), window.innerHeight - 100);
        dock.style.left = Math.max(0, l) + "px"; dock.style.top = Math.max(60, t) + "px"; dock.style.right = "auto";
      }
    } catch (e) {}
  }

  // On a phone the bottom bar has to fit one row, so the longer labels are shortened.
  function shortLabels() {
    const narrow = window.matchMedia("(max-width:820px)").matches;
    const nav = $id("btnNavOpen"), chk = $id("btnCheck");
    if (nav) { const m = /Question (\d+) of (\d+)/.exec(nav.textContent); if (m && narrow) nav.textContent = m[1] + " of " + m[2] + " \u25b4"; }
    if (chk && narrow && /^Check answer$/.test(chk.textContent)) chk.textContent = "Check";
  }

  // ---- Calculator docked on the left, like the Digital SAT ----------------------------------------------------------
  // On a computer or tablet the calculator gets its own full-height section on the left, between the test header and the
  // footer; the question moves right to make room. Drag the right edge to resize (remembered per device); the expand button
  // switches between standard and wide. Phones keep the bottom sheet.
  const DOCK_W_KEY = "funsat.calcDockW";
  const dockWidthLimits = () => ({ min: 300, max: Math.max(320, window.innerWidth - 420) });
  function dockWidth() {
    const L = dockWidthLimits(), wide = document.body.classList.contains("calc-wide");
    let w = 0; try { w = parseInt(localStorage.getItem(DOCK_W_KEY), 10) || 0; } catch (e) {}
    if (!w) w = wide ? Math.round(window.innerWidth * 0.58) : Math.round(Math.min(640, Math.max(360, window.innerWidth * 0.38)));
    else if (wide) w = Math.max(w, Math.round(window.innerWidth * 0.58));
    return Math.max(L.min, Math.min(L.max, w));
  }
  function layoutDock() {
    const dock = $id("workspaceCalcDock"), grid = document.querySelector("#screen-test .workspace-grid");
    const want = isBB() && document.body.classList.contains("calc-open") && !window.matchMedia("(max-width:820px)").matches;
    if (!dock || !grid || !want) {
      if (document.body.classList.contains("bb-calc-docked")) {
        document.body.classList.remove("bb-calc-docked");
        if (grid) grid.style.marginLeft = "";
        if (dock) { dock.style.top = ""; dock.style.bottom = ""; dock.style.width = ""; dock.style.left = ""; restorePos(); }
        refit();
      }
      return;
    }
    document.body.classList.add("bb-calc-docked");
    const head = document.querySelector("#screen-test .module-head"), foot = document.querySelector("#screen-test .bb-foot");
    const top = head ? Math.max(0, Math.round(head.getBoundingClientRect().bottom)) : 64;
    const bottom = foot ? Math.max(0, Math.round(window.innerHeight - foot.getBoundingClientRect().top)) : 64;
    const w = dockWidth();
    Object.assign(dock.style, { left: "0px", right: "auto", top: top + "px", bottom: bottom + "px", width: w + "px" });
    grid.style.marginLeft = w + "px";
    if (!dock.querySelector(".bb-dock-edge")) {
      const edge = el("div", "bb-dock-edge", "");
      edge.setAttribute("role", "separator"); edge.setAttribute("aria-orientation", "vertical"); edge.tabIndex = 0;
      edge.setAttribute("aria-label", "Resize the calculator. Left and right arrow keys resize.");
      const setW = (px, save) => {
        const L = dockWidthLimits(), v = Math.max(L.min, Math.min(L.max, Math.round(px)));
        dock.style.width = v + "px"; grid.style.marginLeft = v + "px";
        if (save) { try { localStorage.setItem(DOCK_W_KEY, String(v)); } catch (e) {} }
        try { if (calcTool.engine === "desmos" && calcTool.calc) calcTool.calc.resize(); } catch (e) {}
      };
      edge.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        try { edge.setPointerCapture(e.pointerId); } catch (er) {}
        document.body.classList.add("calc-resizing");
        const move = (ev) => setW(ev.clientX, false);
        const up = (ev) => {
          document.body.classList.remove("calc-resizing");
          edge.removeEventListener("pointermove", move); edge.removeEventListener("pointerup", up); edge.removeEventListener("pointercancel", up);
          setW(parseFloat(dock.style.width), true); refit();
        };
        edge.addEventListener("pointermove", move); edge.addEventListener("pointerup", up); edge.addEventListener("pointercancel", up);
      });
      edge.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault(); setW(parseFloat(dock.style.width) + (e.key === "ArrowRight" ? 40 : -40), true); refit();
      });
      dock.append(edge);
    }
    try { if (calcTool.engine === "desmos" && calcTool.calc) calcTool.calc.resize(); } catch (e) {}
    refit();
  }
  function refit() {
    try { const b = document.querySelector("#screen-test .workspace-question-body"); if (b && !b.querySelector(".feedback")) delete fitMemo[(currentQids()[state.qi]) || ""]; fitQuestion(); } catch (e) {}
  }
  // The calculator opens and closes outside this file (and the expand button toggles calc-wide), so watch the body class.
  let lastDockState = "";
  new MutationObserver(() => {
    const k = ["calc-open", "calc-wide", "workspace-practicing"].map((c) => document.body.classList.contains(c) ? 1 : 0).join("");
    if (k !== lastDockState) { lastDockState = k; layoutDock(); }
  }).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  window.addEventListener("resize", () => { try { layoutDock(); } catch (e) {} });

  // ---- Zoom ---------------------------------------------------------------------------------------------------------
  // Text size on the test screen, on top of fit-to-screen: 80% to 200%, remembered per device. Above 100% the question
  // scrolls instead of shrinking back. Ctrl/Cmd and + / - / 0 use it while a test is open (instead of browser zoom, which
  // fit-to-screen would undo).
  const ZOOM_KEY = "funsat.testZoom", ZOOMS = [0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];
  let zoom = 1; try { const z = parseFloat(localStorage.getItem(ZOOM_KEY)); if (ZOOMS.includes(z)) zoom = z; } catch (e) {}
  function setZoom(z) {
    zoom = z; try { localStorage.setItem(ZOOM_KEY, String(z)); } catch (e) {}
    document.body.classList.toggle("bb-zoomed", zoom > 1);
    const label = $id("bbZoomVal"); if (label) label.textContent = Math.round(zoom * 100) + "%";
    const out = $id("bbZoomOut"), inn = $id("bbZoomIn");
    if (out) out.disabled = zoom <= ZOOMS[0]; if (inn) inn.disabled = zoom >= ZOOMS[ZOOMS.length - 1];
    refit();
  }
  const stepZoom = (d) => { const i = ZOOMS.indexOf(zoom); setZoom(ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (i < 0 ? 2 : i) + d))]); };
  function ensureZoom() {
    const bar = $id("toolsBar"); if (!bar || $id("bbZoom")) return;
    const box = el("div", "bb-zoom", "");
    box.id = "bbZoom"; box.setAttribute("role", "group"); box.setAttribute("aria-label", "Zoom");
    box.innerHTML = '<button type="button" id="bbZoomOut" aria-label="Zoom out">−</button><button type="button" id="bbZoomVal" aria-label="Reset zoom to 100%">100%</button><button type="button" id="bbZoomIn" aria-label="Zoom in">+</button><span>Zoom</span>';
    box.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; e.stopPropagation(); if (b.id === "bbZoomOut") stepZoom(-1); else if (b.id === "bbZoomIn") stepZoom(1); else setZoom(1); });
    const more = $id("btnMore"); if (more && more.parentNode === bar) bar.insertBefore(box, more); else bar.append(box);
    setZoom(zoom);
  }
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || !isBB() || state.view !== "test") return;
    if (e.key === "=" || e.key === "+") { e.preventDefault(); stepZoom(1); }
    else if (e.key === "-" || e.key === "_") { e.preventDefault(); stepZoom(-1); }
    else if (e.key === "0") { e.preventDefault(); setZoom(1); }
  });

  // ---- Fit the question to the screen ------------------------------------------------------------------------------
  // The question, its choices and the controls should fit the window without scrolling. The panes already fill the screen;
  // this scales the question's contents (see --fit in bluebook.css) to the space they have: smaller on a short or small window,
  // a little larger on a big monitor. A long passage scrolls in its own pane instead. Phones keep their own layout and scroll.
  // Once an answer is checked the explanation appears; the scale used before the answer is kept so the text does not jump.
  const FIT_MIN = 0.68, FIT_MAX = 1.3;
  const fitMemo = {};
  function fitQuestion() {
    const body = document.querySelector("#screen-test .workspace-question-body");
    if (!body) return;
    const set = (z) => body.style.setProperty("--fit", String(Math.round(z * 1000) / 1000));
    if (window.matchMedia("(max-width:700px)").matches) { if (zoom === 1) body.style.removeProperty("--fit"); else set(zoom); return; }
    let id = ""; try { id = currentQids()[state.qi] || ""; } catch (e) {}
    if (body.querySelector(".feedback")) { if (fitMemo[id]) set(fitMemo[id] * zoom); return; }
    const split = body.querySelector(".split"), right = split && body.querySelector(".split-r");
    const cs = getComputedStyle(body);
    const room = body.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
    if (room < 120) return;
    if (split) {
      // The passage/question grid takes whatever is left under anything above it (the topic-practice notice).
      const above = split.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - (parseFloat(cs.paddingTop) || 0);
      split.style.height = Math.max(120, room - above) + "px";
    }
    const need = () => split ? right.scrollHeight : body.scrollHeight - (parseFloat(cs.paddingBottom) || 0) - (parseFloat(cs.paddingTop) || 0);
    const have = () => split ? right.clientHeight : room;
    const solve = () => {
      let z = 1; set(z);
      for (let i = 0; i < 5; i++) {
        const n = need(), h = have();
        if (n > h + 1) { const next = Math.max(FIT_MIN, z * (h / n) - 0.01); if (next >= z - 0.004) break; z = next; set(z); }
        else if (n < h * 0.9 && z < FIT_MAX && window.innerWidth >= 1500) { const next = Math.min(FIT_MAX, z * (h / n) * 0.97); if (next <= z + 0.01) break; z = next; set(z); }
        else break;
      }
      if (need() > have() + 1 && z > FIT_MIN) { z = Math.max(FIT_MIN, z - 0.03); set(z); }   // rounding: one last nudge
      return z;
    };
    // First try the normal layout. If that would make the text small, compact the "Stuck?" helper (its title row) and scale again.
    body.classList.remove("fit-tight");
    let z = solve();
    const normalFits = need() <= have() + 1;
    if (z < 0.84 || !normalFits) {
      body.classList.add("fit-tight");
      const tightZ = solve();
      const tightFits = need() <= have() + 1;
      // Keep the compact layout only if it genuinely does better: it fits where the normal one did not, or it allows bigger text.
      if (tightFits && (!normalFits || tightZ > z)) z = tightZ;
      else { body.classList.remove("fit-tight"); z = solve(); }
    }
    fitMemo[id] = z;
    if (zoom !== 1) set(z * zoom);
  }
  let fitTimer = 0;
  window.addEventListener("resize", () => { clearTimeout(fitTimer); fitTimer = setTimeout(() => { if (isBB()) { const b = document.querySelector("#screen-test .workspace-question-body"); if (b && !b.querySelector(".feedback")) { delete fitMemo[(currentQids()[state.qi]) || ""]; } fitQuestion(); } }, 150); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { try { if (isBB()) fitQuestion(); } catch (e) {} });

  const baseRender = renderQuestion;
  renderQuestion = function () {
    baseRender.apply(this, arguments);
    try {
      syncTestType();
      if (!isBB()) return;
      groupFoot(); placeDock(); ensureMore(); ensureZoom(); ensureBubble(); wireDrag(); restorePos(); shortLabels(); layoutDock();
      fitQuestion();
    } catch (e) { /* keep the stock layout */ }
  };

  // Close the More menu and the tutor panel when the student clicks elsewhere or presses Escape.
  document.addEventListener("click", (e) => {
    if (document.body.classList.contains("bb-more-open") && !e.target.closest(".module-actions") && !e.target.closest("#btnMore")) {
      document.body.classList.remove("bb-more-open"); const m = $id("btnMore"); if (m) m.setAttribute("aria-expanded", "false");
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (document.body.classList.contains("bb-more-open")) { document.body.classList.remove("bb-more-open"); const m = $id("btnMore"); if (m) m.focus(); }
    else if (document.body.classList.contains("bb-ai-open")) { $id("bbxBubble") && $id("bbxBubble").click(); }
  });
  // Leaving the test drops the floating bits so they never appear on other screens.
  const baseShow = showScreen;
  showScreen = function (id) {
    baseShow.apply(this, arguments);
    if (id !== "screen-test") { document.body.classList.remove("bb-more-open", "bb-ai-open"); const b = $id("bbxBubble"); if (b) b.textContent = "?"; }
    syncTestType();
  };
  syncTestType();
  if (state.view === "test") renderQuestion();
})();
