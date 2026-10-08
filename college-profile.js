/* Personalized score block for the generated /colleges/<slug>/ pages.
   Reads the same profile localStorage key the app writes (satPrepProfile_v1),
   renders this college's reported middle-50% range with the visitor's score
   marked against it, and lets them save/remove the college from the same list
   the comparison screen uses. Renders nothing when there is no score on file. */
(function () {
  "use strict";
  var KEY = "satPrepProfile_v1";
  var host = document.getElementById("fxCollegeProfile");
  var dataEl = document.getElementById("fxCollegeData");
  if (!host || !dataEl) return;

  var D;
  try { D = JSON.parse(dataEl.textContent || "{}"); } catch (e) { return; }
  if (!D || !D.id) return;

  function loadProfile() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function saveProfile(p) {
    try { localStorage.setItem(KEY, JSON.stringify(p)); return true; } catch (e) { return false; }
  }

  var profile = loadProfile();
  var col = (profile && profile.college) || {};
  var sat = Number(col.sat) || null;
  var act = Number(col.act) || null;

  // Which test to draw against: whichever the visitor has AND this college reports.
  var mode = null;
  if (sat && D.sr25 && D.sr75) mode = "sat";
  else if (act && D.ar25 && D.ar75) mode = "act";

  // No score on file, or no reported range to compare against: show nothing at all
  // rather than an empty bar.
  if (!mode) return;

  var score = mode === "sat" ? sat : act;
  var lo = mode === "sat" ? D.sr25 : D.ar25;
  var hi = mode === "sat" ? D.sr75 : D.ar75;
  var min = mode === "sat" ? 400 : 1;
  var max = mode === "sat" ? 1600 : 36;
  var label = mode === "sat" ? "SAT" : "ACT";

  function pos(v) {
    var t = (Number(v) - min) / (max - min);
    return Math.max(0, Math.min(1, t)) * 100;
  }

  var verdict, verdictClass, note;
  if (score >= hi) {
    verdict = "Likely";
    verdictClass = "good";
    note = "Above their typical range.";
  } else if (score >= lo) {
    verdict = "Target";
    verdictClass = "mid";
    note = "Right inside their middle 50%.";
  } else {
    verdict = "Reach";
    verdictClass = "warn";
    var gap = hi - score;
    if (mode === "sat") {
      var perSection = Math.max(1, Math.round(gap / 2 / 10));
      note = gap + " points to their 75th · about " + perSection +
        " more right per section.";
    } else {
      note = gap + " ACT points to their 75th.";
    }
  }

  var saved = Array.isArray(col.saved) && col.saved.map(Number).indexOf(Number(D.id)) >= 0;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch];
    });
  }

  function render() {
    host.innerHTML =
      '<div class="fxcp-head">' +
        '<div>' +
          '<p class="fxcp-kicker">Your ' + label + ' vs ' + esc(D.name) + '</p>' +
          '<p class="fxcp-score"><b>' + score + '</b> <span>your ' + label.toLowerCase() +
            (mode === "sat" ? " total" : " composite") + '</span></p>' +
        '</div>' +
        '<span class="fxcp-verdict ' + verdictClass + '">' + verdict + '</span>' +
      '</div>' +
      '<div class="fxcp-bar" role="img" aria-label="Your ' + label + ' of ' + score +
        ' against a reported middle 50% of ' + lo + ' to ' + hi + '. ' + verdict + '. ' +
        esc(note) + '">' +
        '<span class="fxcp-range" style="left:' + pos(lo) + '%;width:' +
          (pos(hi) - pos(lo)) + '%"></span>' +
        '<span class="fxcp-mark" style="left:' + pos(score) + '%"></span>' +
      '</div>' +
      '<p class="fxcp-scale"><span>' + min + '</span><span>middle 50%: ' + lo +
        "–" + hi + '</span><span>' + max + '</span></p>' +
      '<p class="fxcp-note">' + esc(note) + '</p>' +
      '<div class="fxcp-actions">' +
        '<button type="button" class="fxcp-save' + (saved ? " on" : "") +
          '" aria-pressed="' + saved + '">' +
          (saved ? "★ Saved to your list" : "☆ Save to your list") + '</button>' +
        '<a class="fxcp-back" href="/colleges/">← All colleges</a>' +
      '</div>';

    var btn = host.querySelector(".fxcp-save");
    if (btn) btn.addEventListener("click", function () {
      var p = loadProfile();
      if (!p.college || typeof p.college !== "object" || Array.isArray(p.college)) p.college = {};
      if (!Array.isArray(p.college.saved)) p.college.saved = [];
      var list = p.college.saved.map(Number);
      var i = list.indexOf(Number(D.id));
      if (i >= 0) list.splice(i, 1); else list.push(Number(D.id));
      p.college.saved = list;
      if (saveProfile(p)) { saved = !saved; render(); }
    });
  }

  host.hidden = false;
  render();
}());
