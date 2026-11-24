/* /calculators/ hub: filter by type, search as you type, and "recently used" from this browser (no server). */
(function () {
  "use strict";
  const q = document.getElementById("chubQ");
  const groups = Array.from(document.querySelectorAll(".chub-group"));
  const buttons = Array.from(document.querySelectorAll("[data-filter]"));
  const none = document.getElementById("chubNone");
  if (!q || !groups.length) return;
  let cat = "all";
  function apply() {
    const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    groups.forEach((g) => {
      let any = 0;
      g.querySelectorAll("li").forEach((li) => {
        const ok = (cat === "all" || g.dataset.cat === cat) && words.every((w) => li.dataset.name.includes(w));
        li.hidden = !ok; if (ok) any++;
      });
      g.hidden = !any; shown += any;
    });
    if (none) none.hidden = shown > 0;
  }
  q.addEventListener("input", apply);
  buttons.forEach((b) => b.addEventListener("click", () => {
    cat = b.dataset.filter;
    buttons.forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    apply();
  }));
  try {
    const recent = JSON.parse(localStorage.getItem("funsatCalcRecent_v1")) || [];
    const links = recent.map((id) => document.querySelector('.chub-list a[href="/calculators/' + id + '/"]')).filter(Boolean).slice(0, 4);
    const box = document.getElementById("chubRecent");
    if (links.length && box) {
      box.textContent = "Recently used: ";
      links.forEach((a, i) => { const c = a.cloneNode(true); box.appendChild(c); if (i < links.length - 1) box.appendChild(document.createTextNode(" · ")); });
      box.hidden = false;
    }
  } catch (e) { /* storage blocked: nothing to show */ }
})();
