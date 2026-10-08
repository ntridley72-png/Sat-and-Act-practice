/* Photo gallery + lightbox for the generated /colleges/<slug>/ pages.
   The grid is plain markup and works with JavaScript off; this file adds the
   enlarged view: click or Enter opens it, Escape closes, left/right move
   between photos, and focus returns to the thumbnail that opened it. */
(function () {
  "use strict";

  var sections = document.querySelectorAll("[data-college-gallery]");
  if (!sections.length) return;

  var box = null, opener = null, shots = [], at = 0, lastFocus = null;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch];
    });
  }

  function build() {
    if (box) return box;
    box = document.createElement("div");
    box.className = "cg-lb";
    box.hidden = true;
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "Photo viewer");
    box.innerHTML =
      '<div class="cg-lb-backdrop" data-cg-close></div>' +
      '<div class="cg-lb-box">' +
        '<button type="button" class="cg-lb-btn cg-lb-prev" data-cg-step="-1" aria-label="Previous photo">‹</button>' +
        '<figure class="cg-lb-fig">' +
          '<button type="button" class="cg-lb-close" data-cg-close aria-label="Close photo viewer">✕</button>' +
          '<img class="cg-lb-img" alt="">' +
          '<figcaption class="cg-lb-cap"><span class="cg-lb-count"></span><span class="cg-lb-credit"></span></figcaption>' +
        '</figure>' +
        '<button type="button" class="cg-lb-btn cg-lb-next" data-cg-step="1" aria-label="Next photo">›</button>' +
      '</div>';
    document.body.appendChild(box);

    box.addEventListener("click", function (e) {
      if (e.target.closest("[data-cg-close]")) { close(); return; }
      var step = e.target.closest("[data-cg-step]");
      if (step) show(at + Number(step.dataset.cgStep));
    });
    return box;
  }

  function show(i) {
    if (!shots.length) return;
    at = (i + shots.length) % shots.length;
    var shot = shots[at];
    var img = box.querySelector(".cg-lb-img");
    img.src = shot.src;
    img.alt = shot.alt || "";
    box.querySelector(".cg-lb-count").textContent = shots.length > 1 ? (at + 1) + " of " + shots.length : "";
    box.querySelector(".cg-lb-credit").innerHTML = shot.license
      ? '<a href="' + esc(shot.license) + '" target="_blank" rel="noopener nofollow">' + esc(shot.credit) + "</a>"
      : esc(shot.credit);
    box.classList.toggle("cg-one", shots.length < 2);
  }

  function open(section, index) {
    build();
    var data = section.querySelector(".cg-data");
    try { shots = JSON.parse(data ? data.textContent : "[]"); } catch (e) { shots = []; }
    if (!shots.length) return;
    var alts = section.querySelectorAll(".cg-item img");
    shots.forEach(function (s, i) { s.alt = alts[i] ? alts[i].alt : ""; });
    lastFocus = document.activeElement;
    opener = section;
    box.hidden = false;
    document.documentElement.classList.add("cg-lb-open");
    show(index);
    box.querySelector(".cg-lb-close").focus();
  }

  function close() {
    if (!box || box.hidden) return;
    box.hidden = true;
    document.documentElement.classList.remove("cg-lb-open");
    // Focus goes back to the thumbnail that opened the viewer, not to the top.
    var back = opener && opener.querySelector('[data-cg="' + at + '"]');
    (back || lastFocus || document.body).focus();
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".cg-open");
    if (!btn) return;
    var section = btn.closest("[data-college-gallery]");
    if (section) open(section, Number(btn.dataset.cg) || 0);
  });

  document.addEventListener("keydown", function (e) {
    if (!box || box.hidden) return;
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); show(at + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); show(at - 1); }
    else if (e.key === "Tab") {
      // The viewer is modal, so Tab cycles inside it.
      var stops = Array.prototype.filter.call(box.querySelectorAll("button,a[href]"), function (el) { return el.offsetParent; });
      if (!stops.length) return;
      var i = stops.indexOf(document.activeElement);
      e.preventDefault();
      stops[(i + (e.shiftKey ? -1 : 1) + stops.length) % stops.length].focus();
    }
  });
}());
