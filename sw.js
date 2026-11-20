/* FunSAT service worker: makes the app installable and usable offline.
   Network first, so a student who is online always gets the current version; the cache is only the fallback.
   Never touches /api/ (accounts, sync and the AI tutor always go to the network) or other origins. */
const VERSION = "funsat-v1";
const SHELL = VERSION + "-shell";
const RUNTIME = VERSION + "-runtime";
const SLOW_MS = 4000;

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    try {
      // Cache the app page, then every same-origin script, style and image it names.
      const page = await fetch("/", { cache: "reload" });
      const html = await page.clone().text();
      await cache.put("/", page);
      const urls = new Set();
      for (const m of html.matchAll(/(?:src|href)="([^"#]+?\.(?:js|css|png|svg|ico|webmanifest|mjs)(?:\?[^"#]*)?)"/g)) {
        try { const u = new URL(m[1], self.location.origin); if (u.origin === self.location.origin) urls.add(u.pathname + u.search); } catch (e) { /* skip */ }
      }
      await Promise.allSettled([...urls].map((u) => cache.add(u))); // one missing file must not abort the install
    } catch (e) { /* offline at install time: the runtime cache fills as the app is used */ }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL, RUNTIME]);
    for (const k of await caches.keys()) if (k.startsWith("funsat-") && !keep.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const store = (req, res) => { if (res && res.ok && res.type === "basic") caches.open(RUNTIME).then((c) => c.put(req, res.clone())).catch(() => {}); return res; };
const lookup = (req) => caches.match(req, { ignoreSearch: req.mode === "navigate" }).then((hit) => hit || (req.mode === "navigate" ? caches.match("/", { ignoreSearch: true }) : undefined));

async function networkFirst(req) {
  const cached = await lookup(req);
  const network = fetch(req).then((res) => store(req, res));
  if (!cached) return network.catch(() => new Response("You are offline and this page has not been saved yet.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }));
  // Something is cached: use the network if it answers promptly, otherwise the saved copy.
  return Promise.race([network, new Promise((resolve) => setTimeout(() => resolve(cached), SLOW_MS))]).catch(() => cached);
}

self.addEventListener("fetch", (event) => {
  const req = event.request, url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/") || req.headers.has("range")) return;
  event.respondWith(networkFirst(req));
});
