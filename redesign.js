/* FunSAT redesign: score rings, home college comparison, coin spend, arcade enter zoom, restart. */
(function () {
  "use strict";
  const COLLEGE_BY_ID = new Map(((window.COLLEGE_DATA || {}).colleges || []).map((c) => [c.id, c]));
  const reducedMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const esc = (s) => (typeof escapeHtml === "function" ? escapeHtml(s) : String(s == null ? "" : s));

  function ensureCollege() {
    if (!profile.college || typeof profile.college !== "object" || Array.isArray(profile.college)) profile.college = {};
    if (!Array.isArray(profile.college.saved)) profile.college.saved = [];
    return profile.college;
  }

  // ---- SAT percentile estimate (College Board user percentiles, approximated) ----
  const SAT_PCT = [[400, 1], [480, 1], [560, 2], [600, 2], [640, 3], [680, 5], [720, 7], [760, 10], [800, 14], [840, 19], [880, 25], [920, 31], [960, 38], [1000, 45], [1040, 52], [1080, 59], [1120, 66], [1160, 72], [1200, 77], [1240, 82], [1280, 86], [1320, 89], [1360, 92], [1400, 94], [1440, 96], [1480, 97], [1520, 98], [1560, 99], [1600, 99]];
  function satPercentile(score) {
    if (!Number.isFinite(Number(score))) return null;
    const s = Math.max(400, Math.min(1600, Number(score)));
    for (let i = 0; i < SAT_PCT.length - 1; i++) {
      const [a, pa] = SAT_PCT[i], [b, pb] = SAT_PCT[i + 1];
      if (s >= a && s <= b) return Math.round(pa + ((s - a) / (b - a)) * (pb - pa));
    }
    return 99;
  }
  const ACT_TO_SAT = (() => {
    const table = ((window.COLLEGE_DATA || {}).concordance || {}).actToSat || {};
    return Object.keys(table).map((k) => [Number(k), table[k]]).sort((a, b) => a[0] - b[0]);
  })();
  function actToSat(act) {
    if (!Number.isFinite(Number(act))) return null;
    let best = 400;
    ACT_TO_SAT.forEach(([a, s]) => { if (a <= Number(act)) best = Math.max(best, s); });
    return best;
  }
  function profileSatScore(c) { return c.sat != null && c.sat >= 400 ? c.sat : c.act != null ? actToSat(c.act) : null; }

  // ---- Recent practice average ----
  function homeAverage() {
    const recs = (profile.history || []).filter((r) => r.done && r.scoreEligible !== false && r.practiceKind !== "topic" && r.totalAnswered > 0);
    const sats = [];
    recs.slice(0, 10).forEach((r) => {
      if (r.testType !== "sat" || !r.secScores) return;
      const rw = r.secScores.rw && r.secScores.rw.score, m = r.secScores.math && r.secScores.math.score;
      if (rw != null && m != null) sats.push(rw + m);
      else if (rw != null) sats.push(rw * 2);
      else if (m != null) sats.push(m * 2);
    });
    if (sats.length) return { score: Math.round(sats.reduce((a, b) => a + b, 0) / sats.length / 10) * 10, count: sats.length, source: "sat" };
    const acts = [];
    recs.slice(0, 10).forEach((r) => {
      if (r.testType !== "act" || !r.secScores) return;
      const core = ["english", "math", "reading"].map((k) => r.secScores[k] && r.secScores[k].actScale).filter((v) => v != null);
      if (core.length) acts.push(Math.round(core.reduce((a, b) => a + b, 0) / core.length));
    });
    if (acts.length) {
      const avgAct = Math.round(acts.reduce((a, b) => a + b, 0) / acts.length);
      return { score: actToSat(avgAct), count: acts.length, source: "act", act: avgAct };
    }
    try { const p = predictScores(); if (p.sat && p.sat.total) return { score: p.sat.total.point, count: 1, source: "predicted" }; } catch (e) {}
    return { score: null, count: 0, source: "none" };
  }

  // ---- Ring ----
  function ringHtml(percent, label, size) {
    size = size || 150;
    const stroke = 12, r = (size - stroke) / 2, c = 2 * Math.PI * r;
    const pct = percent == null ? null : Math.max(0, Math.min(100, Math.round(percent)));
    return '<div class="ring" style="width:' + size + "px;height:" + size + 'px"><svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + " " + size + '" role="img" aria-label="' + (pct == null ? "No score yet" : pct + " percent") + '">' +
      '<circle class="ring-track" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" stroke-width="' + stroke + '"></circle>' +
      '<circle class="ring-progress" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" stroke-width="' + stroke + '" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + c.toFixed(1) + '" data-ring-offset="' + (c * (1 - (pct == null ? 0 : pct) / 100)).toFixed(1) + '"></circle></svg>' +
      '<div class="ring-val"><span class="ring-num" style="font-size:' + Math.round(size * 0.25) + 'px">' + (pct == null ? "—" : pct + "%") + '</span><span class="ring-lbl">' + esc(label) + "</span></div></div>";
  }
  function paintRings(scope) {
    (scope || document).querySelectorAll(".ring-progress").forEach((el) => {
      const target = el.dataset.ringOffset;
      requestAnimationFrame(() => requestAnimationFrame(() => { el.style.strokeDashoffset = target; }));
    });
  }

  function normCdf(z) {
    const t = 1 / (1 + 0.2316419 * Math.abs(z));
    const d = 0.3989423 * Math.exp(-z * z / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return z > 0 ? 1 - p : p;
  }
  function admittedPercentile(score, lo, hi) {
    if (score == null || lo == null || hi == null) return null;
    const mid = (lo + hi) / 2, sigma = Math.max(20, (hi - lo) / 1.349);
    return Math.max(1, Math.min(99, Math.round(normCdf((score - mid) / sigma) * 100)));
  }

  // ---- Home score card + college comparison ----
  const hsc = { open: false, selected: null, stats: null, statsKey: "", loading: false, avgKey: "" };
  function tile(val, label) { return '<div class="hsc-tile"><div class="t-val">' + val + '</div><div class="t-lbl">' + label + "</div></div>"; }
  function renderHomeScoreCard() {
    const host = document.getElementById("homeScoreCard");
    if (!host) return;
    const c = ensureCollege();
    const avg = homeAverage();
    if (avg.score && c.homeAvg !== avg.score) { c.homeAvg = avg.score; try { saveProfile(); } catch (e) {} }
    const pct = avg.score ? satPercentile(avg.score) : null;
    const saved = (c.saved || []).map((id) => COLLEGE_BY_ID.get(Number(id))).filter(Boolean);
    if (!saved.some((x) => x.id === hsc.selected)) hsc.selected = saved.length ? saved[0].id : null;
    const college = hsc.selected ? COLLEGE_BY_ID.get(hsc.selected) : null;
    const grade = c.grade || "";

    let expand = "";
    if (hsc.open) {
      if (!avg.score) {
        expand = '<div class="hsc-expand" style="display:block"><p class="hsc-sub">Finish a practice test to see how your average compares with each college\'s admitted class.</p><button type="button" class="hsc-cta" id="hscStartPractice">Start a practice test</button></div>';
      } else if (!college) {
        expand = '<div class="hsc-expand" style="display:block"><p class="hsc-sub">Save colleges in the College tab and they will appear here as comparison tabs.</p><button type="button" class="hsc-cta" id="hscOpenCollege">Open College Score Goals</button></div>';
      } else {
        const lo = college.sr25, hi = college.sr75;
        const bandL = lo != null ? Math.max(0, Math.min(100, ((lo - 1000) / 600) * 100)) : 0;
        const bandW = lo != null ? Math.max(0, Math.min(100 - bandL, ((hi - lo) / 600) * 100)) : 0;
        const youX = Math.max(0, Math.min(100, ((avg.score - 1000) / 600) * 100));
        const inClass = admittedPercentile(avg.score, lo, hi);
        const gradeTile = (() => {
          if (!grade) return tile("—", "Set your grade in College to compare with your class");
          if (hsc.stats && hsc.stats.topPercent != null) return tile("Top " + hsc.stats.topPercent + "%", "Among FunSAT users in grade " + esc(grade) + " (n=" + hsc.stats.count + ")");
          // Until enough FunSAT users share a grade, compare with College Board's national average for that grade.
          const nat = window.collegeFeature && collegeFeature.NATIONAL_BY_GRADE && collegeFeature.NATIONAL_BY_GRADE[grade];
          if (nat) { const d = avg.score - nat.mean; return tile((d >= 0 ? "+" : "−") + Math.abs(d) + " pts", (d >= 0 ? "Above" : "Below") + " the national grade " + esc(grade === "gap" ? "12" : grade) + " average (" + nat.test + " " + nat.mean + ")"); }
          return tile("—", "Set your grade in College to compare with your class");
        })();
        const blind = window.collegeFeature && collegeFeature.isTestBlind && collegeFeature.isTestBlind(college);
        const pointsTile = hi == null ? (blind ? tile("Test-blind", "This university doesn't consider SAT/ACT; GPA and coursework matter most") : tile("—", "No admitted range reported")) : (avg.score >= hi ? tile("At/above", "You are at or above their 75th percentile") : tile((hi - avg.score) + " pts", "To reach their 75th percentile"));
        expand =
          '<div class="hsc-expand" style="display:block">' +
          '<div class="hsc-college-head"><strong>' + esc(college.n) + "</strong><span class=\"hsc-note\">Estimates, not admission predictions</span></div>" +
          '<div class="hsc-scale"><div class="hsc-scale-track">' +
          (lo != null ? '<span class="hsc-band" style="left:' + bandL.toFixed(1) + "%;width:" + bandW.toFixed(1) + '%"></span>' : "") +
          '<span class="hsc-you" style="left:' + youX.toFixed(1) + '%" title="Your average: ' + avg.score + '"></span></div>' +
          '<div class="hsc-scale-labels"><span>1000</span><span>1200</span><span>1400</span><span>1600</span></div></div>' +
          '<div class="hsc-tiles">' +
          tile(lo != null ? lo + "–" + hi : blind ? "Test-blind" : "Not reported", lo != null ? "Admitted middle 50% (SAT, enrolled)" : blind ? "SAT/ACT not considered for admission" : "College didn't report an SAT range") +
          tile(inClass != null ? "~" + inClass + "%" : "—", "Your estimated percentile within their admitted class") +
          gradeTile +
          pointsTile +
          "</div>" +
          (window.collegeFeature && collegeFeature.estimateCollege ? (() => { const e2 = collegeFeature.estimateCollege(college); return '<div class="college-split" aria-label="Estimated accept, waitlist, deny"><span style="width:' + Math.round(e2.estimate * 100) + '%;background:#22c55e"></span><span style="width:' + Math.round(e2.waitlist * 100) + '%;background:#3b82f6"></span><span style="width:' + Math.round(e2.deny * 100) + '%;background:#ef4444"></span></div><div class="hsc-scale-labels"><span>Accept ' + Math.round(e2.estimate * 100) + '%</span><span>Waitlist ' + Math.round(e2.waitlist * 100) + '%</span><span>Deny ' + Math.round(e2.deny * 100) + "%</span></div>"; })() : "") +
          '<div class="hsc-tabs" role="tablist" aria-label="Saved colleges">' + saved.map((x) => '<button type="button" role="tab" aria-selected="' + (x.id === hsc.selected) + '" class="hsc-tab' + (x.id === hsc.selected ? " active" : "") + '" data-college-tab="' + x.id + '">' + esc(x.n) + "</button>").join("") + "</div>" +
          '<p class="hsc-note">Percentiles use an estimate from the college\'s reported enrolled range. Same-grade comparison is computed on FunSAT\'s server and hidden until enough users share your grade.</p>' +
          "</div>";
      }
    }

    host.style.display = "block";
    host.classList.toggle("open", hsc.open);
    host.innerHTML =
      '<div class="hsc-top">' + ringHtml(pct, "average percentile") +
      '<div><div class="hsc-title">Your average score</div>' +
      (avg.score
        ? '<div class="hsc-average">' + avg.score + (avg.source === "act" ? " SAT-equivalent (ACT " + avg.act + ")" : "") + "<small>About the " + pct + "th percentile nationally · based on your last " + avg.count + " test" + (avg.count === 1 ? "" : "s") + (hsc.open ? "" : " · tap for college comparison") + "</small></div>"
        : '<div class="hsc-sub">Finish a practice test to unlock your average, percentile, and college comparison.</div>') +
      "</div></div>" + expand;
    paintRings(host);
    if (hsc.open && avg.score && grade && !hsc.loading && hsc.statsKey !== grade + ":" + avg.score) {
      hsc.loading = true;
      loadGradeStats(grade, avg.score).then(() => { hsc.loading = false; if (hsc.open) renderHomeScoreCard(); });
    }
  }
  async function loadGradeStats(grade, score) {
    const key = grade + ":" + score;
    hsc.statsKey = key;
    if (!cloud.user) { hsc.stats = { hidden: true, reason: "signin" }; return; }
    try { hsc.stats = await cloud.api("grade-stats?grade=" + encodeURIComponent(grade) + "&score=" + encodeURIComponent(score)); }
    catch (e) { hsc.stats = { hidden: true, reason: "error" }; }
  }
  function wireHomeScoreCard() {
    const host = document.getElementById("homeScoreCard");
    if (!host || host.dataset.wired) return;
    host.dataset.wired = "1";
    host.addEventListener("click", (e) => {
      const tab = e.target.closest("[data-college-tab]");
      if (tab) {
        hsc.selected = Number(tab.dataset.collegeTab); renderHomeScoreCard();
        if (window.collegeFeature && collegeFeature.openDetail) collegeFeature.openDetail(hsc.selected);
        return;
      }
      if (e.target.closest("#hscOpenCollege")) { if (window.collegeFeature && collegeFeature.open) collegeFeature.open(); return; }
      if (e.target.closest("#hscStartPractice")) { document.getElementById("btnStart").click(); return; }
      if (e.target.closest(".hsc-tab") || e.target.closest(".hsc-tiles") || e.target.closest(".hsc-scale")) return;
      hsc.open = !hsc.open;
      renderHomeScoreCard();
    });
  }

  // ---- Profile hero (college screen) ----
  function renderProfileHero() {
    const host = document.getElementById("collegeProfileHero");
    if (!host) return;
    const c = ensureCollege();
    const sat = profileSatScore(c);
    const pct = sat ? satPercentile(sat) : null;
    const target = c.targetMode === "custom" && c.customTarget ? "Custom " + c.customTarget : c.targetMode === "mid" ? "Above midrange" : "75th percentile";
    const scale = { "4uw": "4.0 uw", "4w": "4.0 w", "5w": "5.0 w", "100": "100-pt" }[c.gpaScale] || c.gpaScale;
    host.innerHTML = ringHtml(pct, "SAT percentile", 150) +
      '<div><h3>Your profile</h3><p class="hero-line">' + (sat ? "SAT " + sat + " puts you ahead of about " + pct + "% of test takers." : "Add an SAT or ACT score to see your percentile.") + "</p>" +
      '<div class="hero-chips">' + "<span class=\"hero-chip\">Grade <b>" + esc(c.grade || "—") + "</b></span>" +
      "<span class=\"hero-chip\">GPA <b>" + (c.gpa != null ? esc(c.gpa) + " (" + esc(scale) + ")" : "—") + "</b></span>" +
      "<span class=\"hero-chip\">Target <b>" + esc(target) + "</b></span></div></div>";
    paintRings(host);
  }

  // ---- Coin-in-cabinet effects ----
  function cabinetHtml() {
    return '<div class="cab3d"><div class="cab-body"></div><div class="marquee">FunSAT</div>' +
      '<div class="scr"><div class="scr-text insert">INSERT COIN</div><div class="scanlines"></div></div>' +
      '<div class="panel"><div class="stick"></div><div class="btn-row"><i></i><i></i><i></i></div></div>' +
      '<div class="door"><div class="led">1 TOKEN</div><div class="slot"></div><div class="return"></div></div>' +
      '<div class="fx-coin"></div></div>';
  }
  function ensureFx() {
    let el = document.getElementById("fxOverlay");
    if (!el) { el = document.createElement("div"); el.id = "fxOverlay"; el.className = "fx-overlay"; el.setAttribute("aria-hidden", "true"); el.innerHTML = cabinetHtml(); document.body.append(el); }
    return el;
  }
  function bounceWallet() {
    const w = document.getElementById("tokenBadge");
    if (!w) return;
    w.classList.remove("wallet-bounce"); void w.offsetWidth; w.classList.add("wallet-bounce");
    setTimeout(() => w.classList.remove("wallet-bounce"), 500);
  }
  function playCoinFx() {
    const el = ensureFx();
    const coin = el.querySelector(".fx-coin");
    const slot = el.querySelector(".slot");
    const text = el.querySelector(".scr-text");
    el.querySelector(".cab3d").style.transform = "";
    slot.classList.remove("glowing");
    text.classList.remove("insert"); text.textContent = "INSERT COIN"; text.classList.add("insert");
    coin.style.display = ""; coin.classList.remove("drop");
    el.classList.add("show");
    if (reducedMotion()) { bounceWallet(); text.textContent = "PLAYER 1 READY"; setTimeout(() => el.classList.remove("show"), 700); return Promise.resolve(); }
    void coin.offsetWidth; coin.classList.add("drop");
    return new Promise((resolve) => {
      setTimeout(() => { slot.classList.add("glowing"); bounceWallet(); text.classList.remove("insert"); text.textContent = "PLAYER 1 READY"; }, 750);
      setTimeout(() => { slot.classList.remove("glowing"); el.classList.remove("show"); resolve(); }, 1250);
    });
  }

  // ---- Arcade enter: coin, PLAYER 1 READY, zoom into the screen ----
  let introBusy = false;
  function playArcadeIntro(gameKey) {
    if (introBusy || !arcade || typeof arcade.select !== "function") return;
    introBusy = true;
    // Start the game only when the zoom ends, so the animation isn't competing with the game loop.
    // A credit is spent up front only for full-run games when you have one.
    const cost = typeof ARCDE_TOKEN_COST === "number" ? ARCDE_TOKEN_COST : 1;
    const spent = (typeof RUN_GAMES !== "undefined" && RUN_GAMES.includes(gameKey)) && profile.tokens >= cost;
    let started = false;
    const startGame = () => { if (!started) { started = true; arcade.select(gameKey); } };
    const overlay = ensureFx();
    const cab = overlay.querySelector(".cab3d");
    const coin = overlay.querySelector(".fx-coin");
    const slot = overlay.querySelector(".slot");
    const text = overlay.querySelector(".scr-text");
    const game = (typeof GAME_LIST !== "undefined" ? GAME_LIST : []).find((g) => g.key === gameKey);
    cab.style.transform = ""; overlay.classList.remove("zooming"); overlay.style.opacity = ""; overlay.style.transition = "";
    slot.classList.remove("glowing");
    text.classList.remove("insert"); text.textContent = spent ? "INSERT COIN" : "FREE PLAY";
    if (spent) text.classList.add("insert");
    coin.style.display = spent ? "" : "none";
    coin.classList.remove("drop");
    overlay.classList.add("show");
    const reduced = reducedMotion();
    const finish = () => {
      startGame();
      overlay.style.transition = "opacity .3s ease";
      overlay.style.opacity = "0";
      setTimeout(() => { overlay.classList.remove("show", "zooming"); overlay.style.opacity = ""; overlay.style.transition = ""; cab.style.transform = ""; coin.style.display = ""; introBusy = false; }, reduced ? 30 : 360);
    };
    if (reduced) { text.classList.remove("insert"); text.textContent = "PLAYER 1 READY"; bounceWallet(); setTimeout(() => { text.textContent = (game ? game.name : "GAME").toUpperCase(); finish(); }, 450); return; }
    if (spent) { void coin.offsetWidth; coin.classList.add("drop"); }
    setTimeout(() => { if (spent) { slot.classList.add("glowing"); bounceWallet(); } text.classList.remove("insert"); text.textContent = "PLAYER 1 READY"; }, spent ? 700 : 200);
    setTimeout(() => { slot.classList.remove("glowing"); text.textContent = (game ? game.name : "GAME").toUpperCase(); }, spent ? 1150 : 650);
    setTimeout(() => {
      const cb = cab.getBoundingClientRect(), scr = overlay.querySelector(".scr").getBoundingClientRect();
      const ox = ((scr.left + scr.width / 2) - cb.left) / cb.width * 100, oy = ((scr.top + scr.height / 2) - cb.top) / cb.height * 100;
      cab.style.transformOrigin = ox.toFixed(1) + "% " + oy.toFixed(1) + "%";
      overlay.classList.add("zooming");
      // Let the browser apply the transition first, then change the transform on the next frame.
      requestAnimationFrame(() => requestAnimationFrame(() => { cab.style.transform = "scale(9)"; }));
      setTimeout(finish, 760);
    }, spent ? 1550 : 1000);
  }

  // ---- Restart current game ----
  function resetCurrentGame() {
    if (!arcade || !arcade.game || typeof arcade.game.reset !== "function") return false;
    if (arcade.runMode === "credit") { arcade.playAgain(); return true; }
    if (arcade.mode === "menu") return false;
    arcade.game.reset(); arcade.game.over = false;
    arcade.mode = "playing"; arcade.showMsg(false);
    if (arcade.statusEl) arcade.statusEl.textContent = arcade.game.name + " — 🕐 " + Math.ceil(arcade.remaining) + "s";
    arcade.restartLoop(); updateHUD();
    return true;
  }

  // ---- Wiring ----
  function init() {
    // Masked text inputs avoid the browser "save password?" prompt; Firefox needs real password inputs.
    try { if (!(window.CSS && CSS.supports && CSS.supports("-webkit-text-security", "disc"))) document.querySelectorAll(".pw-mask").forEach((el) => { el.type = "password"; }); } catch (e) {}
    // Full screen practice mode: hide everything but the test; Esc (or F) toggles.
    function setZen(on) {
      document.body.classList.toggle("zen-mode", !!on);
      if (!on) document.body.classList.remove("zen-study");
      const exit = document.getElementById("zenExit");
      if (exit) exit.classList.toggle("show", !!on);
      const study = document.getElementById("zenStudy");
      if (study) { study.classList.toggle("show", !!on); study.setAttribute("aria-pressed", String(document.body.classList.contains("zen-study"))); study.textContent = document.body.classList.contains("zen-study") ? "✕ Close tools" : "📖 Study tools"; }
      try {
        if (on && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
        if (!on && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
      } catch (e) {}
    }
    const zenBtn = document.getElementById("btnZen");
    if (zenBtn) zenBtn.addEventListener("click", () => setZen(true));
    const zenExit = document.getElementById("zenExit");
    if (zenExit) zenExit.addEventListener("click", () => setZen(false));
    function setStudyDrawer(on) {
      document.body.classList.toggle("zen-study", !!on);
      const btn = document.getElementById("zenStudy");
      if (btn) { btn.setAttribute("aria-pressed", String(!!on)); btn.textContent = (on ? "✕ Close tools" : "📖 Study tools"); }
    }
    const zenStudy = document.getElementById("zenStudy");
    if (zenStudy) zenStudy.addEventListener("click", () => setStudyDrawer(!document.body.classList.contains("zen-study")));
    document.addEventListener("click", (e) => {
      if (document.body.classList.contains("zen-mode") && !document.body.classList.contains("zen-study") && e.target.closest && e.target.closest("#btnNotes")) setStudyDrawer(true);
    }, true);
    document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && document.body.classList.contains("zen-mode")) setZen(false); });
    addEventListener("keydown", (e) => {
      if (e.target && (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable)) return;
      if (state.view !== "test" && state.view !== "routing") return;
      if (e.key === "Escape" && document.body.classList.contains("zen-mode")) {
        e.preventDefault();
        if (document.body.classList.contains("zen-study")) { setStudyDrawer(false); return; }
        setZen(false); return;
      }
      if ((e.key === "t" || e.key === "T") && document.body.classList.contains("zen-mode") && !e.metaKey && !e.ctrlKey) { e.preventDefault(); setStudyDrawer(!document.body.classList.contains("zen-study")); return; }
      if ((e.key === "f" || e.key === "F") && !e.metaKey && !e.ctrlKey && !document.body.classList.contains("zen-mode")) { e.preventDefault(); setZen(true); }
    });
    const baseRenderZen = render;
    render = function () {
      baseRenderZen();
      if (state.view !== "test" && state.view !== "routing" && document.body.classList.contains("zen-mode")) setZen(false);
    };
    const home = document.getElementById("btnHome");
    if (home) home.addEventListener("click", () => {
      try { if (arcdeOpen) arcade.backToMenu(); } catch (e) {}
      if (state.view === "college") state.view = "start";
      if (state.view !== "start") state.view = "start";
      render();
      try { scrollTo(0, 0); } catch (e) {}
    });
    const restart = document.getElementById("btnArcadeRestart");
    if (restart) restart.addEventListener("click", resetCurrentGame);
    addEventListener("keydown", (e) => {
      if (!arcade || !arcade.overlay || !arcade.overlay.classList.contains("show")) return;
      if ((e.key === "r" || e.key === "R") && !e.metaKey && !e.ctrlKey) { e.preventDefault(); resetCurrentGame(); }
    });
    if (typeof arcade !== "undefined" && arcade) {
      arcade.enter = function (key) { playArcadeIntro(key); };
      ["addTime", "autoRefill", "playAgain"].forEach((name) => {
        if (typeof arcade[name] !== "function") return;
        const orig = arcade[name].bind(arcade);
        arcade[name] = function () {
          const before = profile.tokens;
          const result = orig.apply(arcade, arguments);
          if (profile.tokens < before) setTimeout(() => playCoinFx(), 40);
          return result;
        };
      });
    }
    const baseRenderStart = renderStart;
    renderStart = function () { baseRenderStart(); try { renderHomeScoreCard(); } catch (e) {} };
    wireHomeScoreCard();
    renderHomeScoreCard();
  }

  window.renderProfileHero = renderProfileHero;
  window.renderHomeScoreCard = renderHomeScoreCard;
  window.FunSATRedesign = { satPercentile, homeAverage, renderHomeScoreCard, renderProfileHero, playCoinFx, resetCurrentGame };
  init();
})();
