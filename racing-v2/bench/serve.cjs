/* Serves bench/index.html at / and dist/ at /racing-v2/, which is the layout
 * the deployed site uses (wrangler copies dist to public/racing-v2). Measuring
 * against a different layout would not exercise the real chunk URLs. */
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const ROOT = __dirname
const DIST = path.join(__dirname, '..', 'dist')
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.map': 'application/json' }
http.createServer((req, res) => {
  const url = req.url.split('?')[0]
  // Answer /favicon.ico so the bench's page-error count reflects real
  // problems. A spurious 404 here previously showed up as "[1 page errors]"
  // on every run, which is exactly the kind of permanent noise that trains
  // you to ignore the error count.
  if (url === '/favicon.ico') { res.writeHead(204); res.end(); return }
  let file
  if (url.startsWith('/racing-v2/')) file = path.join(DIST, url.slice('/racing-v2/'.length))
  else file = path.join(ROOT, url === '/' ? 'index.html' : url)
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found: ' + url); return }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' })
    res.end(buf)
  })
}).listen(8901, '127.0.0.1', () => console.log('bench server on 8901'))
