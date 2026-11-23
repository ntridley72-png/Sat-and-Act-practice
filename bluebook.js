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
      if (!head || e.target.closest("button") || window.matchMedia("(max-width:820px)").matches || !isBB()) return;
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
    if (!dock || !dock.style.left || window.matchMedia("(max-width:820px)").matches) return;
    const r = dock.getBoundingClientRect();
    dock.style.left = Math.max(0, Math.min(r.left, window.innerWidth - 140)) + "px";
    dock.style.top = Math.max(60, Math.min(r.top, window.innerHeight - 100)) + "px";
  }
  window.addEventListener("resize", () => { try { clampDock(); if (calcTool.engine === "desmos" && calcTool.calc) calcTool.calc.resize(); } catch (e) {} });
  function restorePos() {
    const dock = $id("workspaceCalcDock");
    if (!dock || window.matchMedia("(max-width:820px)").matches) { if (dock) { dock.style.left = ""; dock.style.top = ""; dock.style.right = ""; } return; }
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
    if (window.matchMedia("(max-width:700px)").matches) { body.style.removeProperty("--fit"); return; }
    let id = ""; try { id = currentQids()[state.qi] || ""; } catch (e) {}
    if (body.querySelector(".feedback")) { if (fitMemo[id]) set(fitMemo[id]); return; }
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
      groupFoot(); placeDock(); ensureMore(); ensureBubble(); wireDrag(); restorePos(); shortLabels();
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
