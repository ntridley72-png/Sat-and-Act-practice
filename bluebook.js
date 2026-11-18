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
      head.setPointerCapture && head.setPointerCapture(e.pointerId);
      const move = (ev) => {
        const x = Math.min(Math.max(0, ev.clientX - dx), window.innerWidth - 120);
        const y = Math.min(Math.max(60, ev.clientY - dy), window.innerHeight - 80);
        dock.style.left = x + "px"; dock.style.top = y + "px"; dock.style.right = "auto";
      };
      const up = () => {
        dock.classList.remove("dragging");
        head.removeEventListener("pointermove", move); head.removeEventListener("pointerup", up);
        try { localStorage.setItem(POS_KEY, JSON.stringify({ l: dock.style.left, t: dock.style.top })); } catch (er) {}
        try { if (calcTool.engine === "desmos" && calcTool.calc) calcTool.calc.resize(); } catch (er) {}
      };
      head.addEventListener("pointermove", move); head.addEventListener("pointerup", up);
      e.preventDefault();
    });
  }
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

  const baseRender = renderQuestion;
  renderQuestion = function () {
    baseRender.apply(this, arguments);
    try {
      syncTestType();
      if (!isBB()) return;
      groupFoot(); placeDock(); ensureMore(); ensureBubble(); wireDrag(); restorePos(); shortLabels();
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
