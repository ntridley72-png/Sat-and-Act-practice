/* Registers the service worker (installable, works offline) and offers an "Install app" button when the
   browser says the app can be installed. Skipped on http origins other than localhost. */
(function () {
  "use strict";
  const secure = location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1";
  if ("serviceWorker" in navigator && secure && !/[?&]nosw\b/.test(location.search)) {
    window.addEventListener("load", () => { navigator.serviceWorker.register("/sw.js").catch(() => { /* the app works without it */ }); });
  }
  let deferred = null;
  function button() {
    let b = document.getElementById("pwaInstall");
    if (b) return b;
    const host = document.getElementById("bbMorePanel") || document.querySelector(".bb-more-panel");
    if (!host) return null;
    b = document.createElement("button");
    b.type = "button"; b.id = "pwaInstall"; b.className = "ghost"; b.hidden = true; b.textContent = "Install app";
    b.title = "Install FunSAT so it opens like an app and works offline";
    b.addEventListener("click", async () => {
      if (!deferred) return;
      deferred.prompt();
      try { await deferred.userChoice; } catch (e) { /* dismissed */ }
      deferred = null; b.hidden = true;
    });
    host.appendChild(b);
    return b;
  }
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; const b = button(); if (b) b.hidden = false; });
  window.addEventListener("appinstalled", () => { deferred = null; const b = document.getElementById("pwaInstall"); if (b) b.hidden = true; });
  window.FunSATInstall = { available: () => !!deferred };
})();
