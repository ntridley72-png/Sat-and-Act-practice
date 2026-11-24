/* Cache rules in the Worker: build-stamped scripts and styles are immutable (their URL changes on every change),
   but the app shell, content pages, unstamped code, and the service worker always revalidate. Mock ASSETS binding. */
const assert = require("node:assert/strict");
(async () => {
  const worker = (await import("../worker/index.js")).default;
  const env = { ASSETS: { fetch: async () => new Response("x", { status: 200, headers: { "Content-Type": "text/plain" } }) } };
  const cc = async (path, accept) => (await worker.fetch(new Request("https://funsat.bid" + path, { headers: accept ? { Accept: accept } : {} }), env)).headers.get("Cache-Control");
  assert.equal(await cc("/app.js?v=a2a16ffb"), "public, max-age=31536000, immutable");
  assert.equal(await cc("/bluebook.css?v=0123abcd"), "public, max-age=31536000, immutable");
  assert.match(await cc("/app.js"), /no-cache/, "unstamped code revalidates");
  assert.match(await cc("/app.js?v=3"), /no-cache/, "a hand-written version is not trusted as a content hash");
  assert.match(await cc("/sw.js?v=a2a16ffb"), /no-cache/, "the service worker is never cached long");
  assert.match(await cc("/", "text/html"), /no-cache/, "the app shell revalidates");
  assert.match(await cc("/guides/", "text/html"), /max-age=3600/, "content pages use a short cache");
  assert.match(await cc("/logo-512.png"), /max-age=86400/, "images use a day");
  console.log("PASS: stamped assets are immutable; shell, pages, sw and unstamped code are not.");
})().catch((e) => { console.error(e); process.exit(1); });
