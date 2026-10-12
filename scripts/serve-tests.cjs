/* The static server the browser tests expect at localhost:8899.
 *
 * It mirrors the deployed layout: the site files at /, and the built racing-v2
 * bundle at /racing-v2/* (wrangler copies racing-v2/dist there; serving the
 * source tree instead made every v2 request a 404, which the arcade smoke
 * test correctly reported as a console error).
 *
 *   node scripts/serve-tests.cjs            # listens on 8899
 *   PORT=9000 node scripts/serve-tests.cjs
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const DIST = path.join(ROOT, "racing-v2", "dist");
const PORT = Number(process.env.PORT || 8899);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".map": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
};

http
  .createServer((req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); res.end(); return; }
    const url = decodeURIComponent(String(req.url || "/").split("?")[0]);
    if (url === "/favicon.ico") { res.writeHead(204); res.end(); return; }
    const file = url.startsWith("/racing-v2/")
      ? path.join(DIST, url.slice("/racing-v2/".length))
      : path.join(ROOT, url === "/" ? "index.html" : url.slice(1));
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); res.end("not found: " + url); return; }
      res.writeHead(200, {
        "Content-Type": TYPES[path.extname(file)] || "application/octet-stream",
        "Cache-Control": "no-store",
      });
      res.end(req.method === "HEAD" ? undefined : buf);
    });
  })
  .listen(PORT, "127.0.0.1", () => console.log("test server on http://127.0.0.1:" + PORT));
