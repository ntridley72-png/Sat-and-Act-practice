// Account API for SAT & ACT Practice: email/password sign-up and sign-in, and saved progress.
//   POST /api/signup   { email, password }  -> { token, email }
//   POST /api/login    { email, password }  -> { token, email }
//   POST /api/logout                        (Authorization: Bearer <token>)
//   GET  /api/me                            -> { email }
//   GET  /api/progress                      -> { data, updatedAt }
//   PUT  /api/progress { data, updatedAt }  -> { ok, updatedAt }
//   POST /api/forgot   { email }            -> { ok }  (emails a reset link through Resend)
//   POST /api/ai       { messages }         -> { content, provider, model, usage }
//   GET/POST/DELETE /api/help-history       -> account-owned tutor history
//   POST /api/reset    { token, password }  -> { token, email }
//   GET  /api/auth/providers                  -> { google: true|false }
//   GET  /api/auth/google                     -> redirect to Google OAuth (needs GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET)
//   GET  /api/auth/google/callback            -> creates a session and returns to /#google_token=...
// Password reset needs a Resend API key: npx wrangler secret put RESEND_API_KEY
// and optionally MAIL_FROM (a sender on a domain you verified in Resend).
// Passwords are hashed with PBKDF2-SHA256 and a per-user salt. Session tokens are random and only
// their SHA-256 hash is stored, so a database leak doesn't expose usable logins.

const SESSION_DAYS = 60;
const PBKDF2_ITERATIONS = 100000; // the most Workers' Web Crypto allows
const MAX_FAILS = 8, LOCK_MINUTES = 15;
const MAX_PROGRESS_BYTES = 900 * 1024;
const RESET_MINUTES = 60, MAX_RESETS_PER_HOUR = 3;

export default {
  async scheduled(_event, env) {
    const tables = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('analytics_events','analytics_budget')").all();
    const present = new Set((tables.results || []).map(row => row.name));
    if (present.has('analytics_events')) await env.DB.prepare("DELETE FROM analytics_events WHERE received_at < ?")
      .bind(Date.now() - 90 * 86400000).run();
    if (present.has('analytics_budget')) await env.DB.prepare("DELETE FROM analytics_budget WHERE day < ?")
      .bind(new Date(Date.now() - 90 * 86400000).toISOString().slice(0,10)).run();
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/analytics/")) return analyticsApi(request, env);
    if (url.pathname === "/owner-analytics" || url.pathname.startsWith("/owner-analytics/")) {
      if (env.ANALYTICS_OWNER_APP !== "true") return new Response("Use the private owner dashboard hostname.", {status:404,headers:{"Cache-Control":"no-store","X-Robots-Tag":"noindex"}});
      if (url.pathname === "/owner-analytics") return Response.redirect(url.origin + "/owner-analytics/", 302);
      const assetUrl = url.pathname === "/owner-analytics/" ? url.origin + "/owner-analytics/index.html" : request.url;
      const asset = await env.ASSETS.fetch(new Request(assetUrl, request));
      const headers = new Headers(asset.headers);
      headers.set("Cache-Control", "no-store");headers.set("X-Robots-Tag", "noindex, nofollow");
      headers.set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
      headers.set("Referrer-Policy", "no-referrer");headers.set("X-Content-Type-Options", "nosniff");
      return new Response(asset.body, {status:asset.status,headers});
    }
    if (url.pathname === "/ads-config.js") {
      return new Response("window.FUNSAT_ADS=" + JSON.stringify(adConfig(env)).replace(/</g, "\\u003c") + ";", {
        headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" }
      });
    }
    if (url.pathname === "/ads.txt" && /^ca-pub-\d{16}$/.test(env.ADSENSE_CLIENT || "")) {
      return new Response("google.com, " + env.ADSENSE_CLIENT.replace("ca-", "") + ", DIRECT, f08c47fec0942fa0\n", {
        headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" }
      });
    }
    if (!url.pathname.startsWith("/api/")) {
      const canonical = canonicalRedirect(url);
      if (canonical) return Response.redirect(canonical, 301);
      // Serve directory indexes explicitly (assets use html_handling = "none").
      let assetUrl = request.url;
      if (url.pathname === "/") assetUrl = url.origin + "/index.html";
      else if (url.pathname.endsWith("/")) assetUrl = url.origin + url.pathname + "index.html";
      const asset = await env.ASSETS.fetch(new Request(assetUrl, request));
      const headers = new Headers(asset.headers);
      const isDocument = request.headers.get("Accept")?.includes("text/html") || url.pathname === "/" || url.pathname.endsWith("/");
      if (isDocument) {
        // The app shell carries live state, so it always revalidates. The
        // generated content pages (guides, colleges, scholarships, score
        // lookups) only change on deploy, so they can be served from cache
        // and revalidated in the background.
        headers.set("Cache-Control", url.pathname === "/"
          ? "no-cache, must-revalidate"
          : "public, max-age=3600, stale-while-revalidate=86400");
      } else if (/\.(?:css|js|json|xml|txt)$/i.test(url.pathname)) {
        // Code and data are referenced WITHOUT a version string (/app.js, not
        // /app.js?v=3), so a long max-age pins returning visitors to whatever
        // they cached before the last deploy. Revalidate instead: Cloudflare
        // serves these with ETags, so an unchanged file costs a 304.
        headers.set("Cache-Control", "no-cache, must-revalidate");
      } else {
        // Images, fonts and other immutable media can be reused across visits.
        headers.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
      }
      headers.delete("Pragma");
      headers.delete("Expires");
      return new Response(asset.body, { status: asset.status, statusText: asset.statusText, headers });
    }
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request) });
    try {
      const res = await route(request, env, url.pathname.slice(5));
      Object.entries(cors(request)).forEach(([k, v]) => res.headers.set(k, v));
      return res;
    } catch (e) {
      return json({ error: "Something went wrong on the server. Try again." }, 500, request);
    }
  }
};

// One canonical URL per page: apex host (no www), no .html suffix, trailing
// slash on every document path. Returns the URL to 301 to, or null if the
// request is already canonical. All rules are applied in a single hop so a
// request like https://www.example.com/guides/psat-vs-sat.html redirects once.
function canonicalRedirect(url) {
  const target = new URL(url.toString());
  let changed = false;

  if (target.protocol === "http:") {
    // The canonical host is HTTPS; upgrade in the same single hop.
    target.protocol = "https:";
    changed = true;
  }

  if (target.hostname.startsWith("www.")) {
    target.hostname = target.hostname.slice(4);
    changed = true;
  }

  const path = target.pathname;
  if (path.endsWith("/index.html")) {
    target.pathname = path.slice(0, -"index.html".length);
    changed = true;
  } else if (path.endsWith(".html")) {
    target.pathname = path.slice(0, -".html".length) + "/";
    changed = true;
  } else if (!path.endsWith("/") && !path.slice(path.lastIndexOf("/") + 1).includes(".")) {
    // Extensionless document path without its trailing slash.
    target.pathname = path + "/";
    changed = true;
  }

  return changed ? target.toString() : null;
}

async function route(req, env, path) {
  if (path === "signup" && req.method === "POST") return signup(req, env);
  if (path === "login" && req.method === "POST") return login(req, env);
  if (path === "forgot" && req.method === "POST") return forgot(req, env);
  if (path === "reset" && req.method === "POST") return reset(req, env);
  if (path === "ai" && req.method === "POST") return aiTutor(req, env);
  if (path === "auth/providers" && req.method === "GET") return json({ google: !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) }, 200, req);
  if (path === "auth/google" && req.method === "GET") return googleStart(req, env);
  if (path === "auth/google/callback" && req.method === "GET") return googleCallback(req, env);
  const user = await authed(req, env);
  if (!user) return json({ error: "Please sign in again." }, 401, req);
  if (path === "logout" && req.method === "POST") {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(bearer(req))).run();
    return json({ ok: true }, 200, req);
  }
  if (path === "me" && req.method === "GET") return json({ email: user.email }, 200, req);
  if (path === "grade-stats" && req.method === "GET") {
    const params = new URL(req.url).searchParams;
    const grade = String(params.get("grade") || "").slice(0, 8);
    const score = Number(params.get("score"));
    if (!grade || !Number.isFinite(score)) return json({ hidden: true, count: 0 }, 200, req);
    const rows = await env.DB.prepare("SELECT json_extract(data, '$.profile.college.grade') AS grade, json_extract(data, '$.profile.college.homeAvg') AS avg FROM progress").all();
    const peers = (rows.results || [])
      .map((row) => ({ grade: row.grade == null ? "" : String(row.grade), avg: Number(row.avg) }))
      .filter((row) => row.grade === grade && Number.isFinite(row.avg) && row.avg >= 400 && row.avg <= 1600);
    if (peers.length < 10) return json({ hidden: true, count: peers.length }, 200, req);
    const below = peers.filter((row) => row.avg < score).length;
    const topPercent = Math.max(1, Math.min(99, Math.round((1 - below / peers.length) * 100)));
    return json({ hidden: false, count: peers.length, topPercent }, 200, req);
  }
  if (path === "help-history" && req.method === "GET") {
    const rows = await env.DB.prepare("SELECT id, created_at AS createdAt, question_id AS questionId, question_version AS questionVersion, question_snapshot AS questionSnapshot, test_type AS testType, section, domain, skill, attempt_id AS attemptId, category, request_text AS requestText, response_text AS responseText, provider, model, status, usage_json AS usageJson FROM help_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 250")
      .bind(user.id).all();
    return json({ items: (rows.results || []).map((row) => ({ ...row, usage: safeJson(row.usageJson), usageJson: undefined })) }, 200, req);
  }
  if (path === "help-history" && req.method === "POST") return saveHelpHistory(req, env, user);
  if (path.startsWith("help-history/") && req.method === "DELETE") {
    const id = decodeURIComponent(path.slice("help-history/".length)).slice(0, 100);
    if (!id) return json({ error: "Invalid history entry." }, 400, req);
    const result = await env.DB.prepare("DELETE FROM help_history WHERE user_id = ? AND id = ?").bind(user.id, id).run();
    return json({ ok: true, deleted: result.meta.changes || 0 }, 200, req);
  }
  if (path === "progress" && req.method === "GET") {
    const row = await env.DB.prepare("SELECT data, updated_at FROM progress WHERE user_id = ?").bind(user.id).first();
    return json(row ? { data: JSON.parse(row.data), updatedAt: row.updated_at } : { data: null, updatedAt: 0 }, 200, req);
  }
  if (path === "progress" && req.method === "PUT") {
    const text = await req.text();
    if (text.length > MAX_PROGRESS_BYTES) return json({ error: "Saved progress is too large." }, 413, req);
    let body; try { body = JSON.parse(text); } catch { return json({ error: "Bad request." }, 400, req); }
    if (!body.data || !Array.isArray(body.data.history)) return json({ error: "Invalid saved progress." }, 400, req);
    for (let attempt = 0; attempt < 5; attempt++) {
      const previous = await env.DB.prepare("SELECT data, updated_at FROM progress WHERE user_id = ?").bind(user.id).first();
      const old = previous ? JSON.parse(previous.data) : null;
      const incomingAt = Number(body.updatedAt) || Date.now();
      // A client that has seen the latest server version (baseAt) always wins; otherwise fall back to edit times.
      const baseAt = Number(body.baseAt) || 0;
      const stale = previous && previous.updated_at > incomingAt && !(baseAt && baseAt >= previous.updated_at);
      const data = stale ? { ...old } : { ...body.data };
      data.history = mergeAttemptHistory(old && old.history, body.data.history);
      const oldProf = (old && old.profile) || {};
      const incomingProf = (body.data && body.data.profile) || {};
      const mergedProf = Object.assign({}, data.profile || {});
      mergedProf.tokens = Math.max(Number(oldProf.tokens) || 0, Number(incomingProf.tokens) || 0, Number(mergedProf.tokens) || 0);
      const hs = Object.assign({}, oldProf.highScores || {}, mergedProf.highScores || {});
      Object.keys(incomingProf.highScores || {}).forEach((k) => { hs[k] = Math.max(Number(hs[k]) || 0, Number(incomingProf.highScores[k]) || 0); });
      if (Object.keys(hs).length) mergedProf.highScores = hs;
      const favs = [...new Set([...(oldProf.favorites || []), ...(incomingProf.favorites || []), ...(mergedProf.favorites || [])])];
      if (favs.length) mergedProf.favorites = favs;
      mergedProf.skillStats = Object.assign({}, oldProf.skillStats || {}, incomingProf.skillStats || {}, mergedProf.skillStats || {});
      data.profile = mergedProf;
      const updatedAt = Math.max(Date.now(), incomingAt, (previous && previous.updated_at || 0) + 1);
      const result = await env.DB.prepare("INSERT INTO progress (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at WHERE progress.updated_at = ?")
        .bind(user.id, JSON.stringify(data), updatedAt, previous ? previous.updated_at : -1).run();
      if (result.meta.changes) return json({ ok: true, updatedAt, history: data.history }, 200, req);
    }
    return json({ error: "Progress changed on another device. Please retry." }, 409, req);
  }
  return json({ error: "Not found." }, 404, req);
}

async function signup(req, env) {
  const { email, password } = await creds(req);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Enter a valid email address." }, 400, req);
  if (password.length < 8) return json({ error: "Use a password with at least 8 characters." }, 400, req);
  if (await env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(email).first())
    return json({ error: "That email already has an account. Choose Sign in." }, 409, req);
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO users (id, email, pass_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id, email, await hashPassword(password, salt), salt, Date.now()).run();
  return json({ token: await newSession(env, id), email }, 200, req);
}

async function login(req, env) {
  const { email, password } = await creds(req);
  const u = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first();
  const wrong = () => json({ error: "That email and password don't match." }, 401, req);
  if (!u) { await hashPassword(password, "00"); return wrong(); } // same timing whether or not the email exists
  if (u.locked_until > Date.now()) return json({ error: "Too many tries. Wait 15 minutes and try again." }, 429, req);
  if (!timingSafeEqual(await hashPassword(password, u.salt), u.pass_hash)) {
    const fails = u.failed_logins + 1;
    await env.DB.prepare("UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?")
      .bind(fails >= MAX_FAILS ? 0 : fails, fails >= MAX_FAILS ? Date.now() + LOCK_MINUTES * 60000 : 0, u.id).run();
    return wrong();
  }
  await env.DB.prepare("UPDATE users SET failed_logins = 0, locked_until = 0 WHERE id = ?").bind(u.id).run();
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at < ?").bind(u.id, Date.now()).run();
  return json({ token: await newSession(env, u.id), email: u.email }, 200, req);
}

// Always answers the same way, so it can't be used to find out which emails have accounts.
async function forgot(req, env) {
  if (!env.RESEND_API_KEY) return json({ error: "Password reset by email isn't set up yet. Ask the app owner." }, 503, req);
  const { email } = await creds(req);
  const done = json({ ok: true }, 200, req);
  const u = await env.DB.prepare("SELECT id, email FROM users WHERE email = ?").bind(email).first();
  if (!u) return done;
  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM password_resets WHERE user_id = ? AND created_at > ?").bind(u.id, Date.now() - 3600000).first();
  if (recent.n >= MAX_RESETS_PER_HOUR) return done;
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare("INSERT INTO password_resets (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256(token), u.id, Date.now(), Date.now() + RESET_MINUTES * 60000).run();
  const link = new URL(req.url).origin + "/#reset=" + token;
  const r = await fetch(env.RESEND_URL || "https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.MAIL_FROM || "SAT & ACT Practice <onboarding@resend.dev>", to: [u.email],
      subject: "Reset your SAT & ACT Practice password",
      text: "Someone asked to reset the password for this account.\n\nReset it here (the link works for " + RESET_MINUTES + " minutes, once):\n" + link + "\n\nIf this wasn't you, ignore this email. Your password stays the same.",
      html: '<p>Someone asked to reset the password for this account.</p><p><a href="' + link + '">Choose a new password</a></p><p>The link works for ' + RESET_MINUTES + " minutes, once. If this wasn't you, ignore this email.</p>"
    })
  });
  if (!r.ok) return json({ error: "Couldn't send the email. Try again in a few minutes." }, 502, req);
  return done;
}

async function reset(req, env) {
  let b = {}; try { b = await req.json(); } catch {}
  const token = String(b.token || ""), password = String(b.password || "").slice(0, 200);
  if (!/^[0-9a-f]{64}$/.test(token)) return json({ error: "This reset link isn't valid. Request a new one." }, 400, req);
  if (password.length < 8) return json({ error: "Use a password with at least 8 characters." }, 400, req);
  const row = await env.DB.prepare("SELECT r.user_id, u.email FROM password_resets r JOIN users u ON u.id = r.user_id WHERE r.token_hash = ? AND r.used = 0 AND r.expires_at > ?")
    .bind(await sha256(token), Date.now()).first();
  if (!row) return json({ error: "This reset link has expired or was already used. Request a new one." }, 400, req);
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET pass_hash = ?, salt = ?, failed_logins = 0, locked_until = 0 WHERE id = ?").bind(await hashPassword(password, salt), salt, row.user_id),
    env.DB.prepare("UPDATE password_resets SET used = 1 WHERE user_id = ?").bind(row.user_id),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(row.user_id) // signs out every other device
  ]);
  return json({ token: await newSession(env, row.user_id), email: row.email }, 200, req);
}

function redirectTo(url, req) {
  const headers = new Headers({ Location: url, "Cache-Control": "no-store" });
  Object.entries(cors(req)).forEach(([k, v]) => headers.set(k, v));
  return new Response(null, { status: 302, headers });
}
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
async function googleState(env, ts) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.GOOGLE_CLIENT_SECRET || ""), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(ts)))));
  return ts + "." + sig;
}
async function googleStart(req, env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return json({ error: "Google sign-in isn't set up yet." }, 501, req);
  const origin = new URL(req.url).origin;
  const u = new URL(GOOGLE_AUTH_URL);
  u.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  u.searchParams.set("redirect_uri", origin + "/api/auth/google/callback");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", await googleState(env, Date.now()));
  u.searchParams.set("prompt", "select_account");
  return redirectTo(u.toString(), req);
}
async function googleCallback(req, env) {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return json({ error: "Google sign-in isn't set up yet." }, 501, req);
  const url = new URL(req.url), origin = url.origin;
  const fail = (msg) => redirectTo(origin + "/#google_error=" + encodeURIComponent(msg), req);
  const code = url.searchParams.get("code") || "", state = url.searchParams.get("state") || "";
  const [ts, sig] = state.split(".");
  if (!code || !ts || !sig || Date.now() - Number(ts) > 10 * 60000) return fail("That sign-in link expired. Please try again.");
  if (!timingSafeEqual(await googleState(env, ts), state)) return fail("Sign-in check failed. Please try again.");
  const tokenRes = await fetch(GOOGLE_TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: origin + "/api/auth/google/callback", grant_type: "authorization_code" }) });
  if (!tokenRes.ok) return fail("Google rejected the sign-in. Please try again.");
  const tok = await tokenRes.json();
  const claims = decodeJwt(tok.id_token || "");
  const email = String(claims.email || "").trim().toLowerCase();
  const verified = claims.email_verified === true || claims.email_verified === "true";
  if (!email || !verified) return fail("Your Google email isn't verified.");
  let user = await env.DB.prepare("SELECT id, email FROM users WHERE email = ?").bind(email).first();
  if (!user) {
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    const id = crypto.randomUUID();
    await env.DB.prepare("INSERT INTO users (id, email, pass_hash, salt, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(id, email, await hashPassword(hex(crypto.getRandomValues(new Uint8Array(32))), salt), salt, Date.now()).run();
    user = { id, email };
  }
  const token = await newSession(env, user.id);
  return redirectTo(origin + "/#google_token=" + token + "&email=" + encodeURIComponent(email), req);
}
function decodeJwt(t) {
  try { const p = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"); return JSON.parse(atob(p)); } catch (e) { return {}; }
}

async function authed(req, env) {
  const t = bearer(req); if (!t) return null;
  return env.DB.prepare("SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?")
    .bind(await sha256(t), Date.now()).first();
}
async function newSession(env, userId) {
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await sha256(token), userId, Date.now() + SESSION_DAYS * 86400000).run();
  return token;
}
async function creds(req) {
  let b = {}; try { b = await req.json(); } catch {}
  return { email: String(b.email || "").trim().toLowerCase().slice(0, 200), password: String(b.password || "").slice(0, 200) };
}
async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unhex(saltHex), iterations: PBKDF2_ITERATIONS }, key, 256);
  return hex(new Uint8Array(bits));
}
async function sha256(s) { return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))); }
function bearer(req) { const m = (req.headers.get("Authorization") || "").match(/^Bearer ([0-9a-f]{64})$/); return m ? m[1] : null; }
function timingSafeEqual(a, b) { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; }
function hex(u8) { return [...u8].map((b) => b.toString(16).padStart(2, "0")).join(""); }
function unhex(h) { return new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16))); }
// Logins use a bearer token (not cookies), so allowing any origin is safe and lets the app work from anywhere.
function cors() { return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Max-Age": "86400" }; }
function json(obj, status, req) { return new Response(JSON.stringify(obj), { status, headers: Object.assign({ "Content-Type": "application/json" }, cors(req)) }); }

// ---- AI tutor: forwards chat to Groq with the server's key, so students don't need their own. ----
// funsat.bid (with or without www), the workers.dev address and its preview links, and local testing.
const AI_ORIGINS = /^(https:\/\/((www\.)?funsat\.bid|([a-z0-9-]+-)?sat-act-practice\.[a-z0-9-]+\.workers\.dev)|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/;
const GROQ_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile", "meta-llama/llama-4-scout-17b-16e-instruct", "qwen/qwen3-32b", "llama-3.1-8b-instant"];
const AI_PER_WINDOW = 45, AI_WINDOW_MIN = 10;
// Reasoning models (gpt-oss, qwen3) spend output tokens "thinking" before they answer. With a small
// cap that thinking used up the budget and the explanation came back cut off, so give them low
// reasoning effort, hide the reasoning text, and a bigger cap.
function groqParams(model, teaching) {
  const p = { temperature: 0.3, max_tokens: teaching ? 1000 : 700 };
  if (model.startsWith("openai/gpt-oss")) Object.assign(p, { reasoning_effort: "low", include_reasoning: false, max_tokens: 3000 });
  else if (model.startsWith("qwen/")) Object.assign(p, { reasoning_format: "hidden", max_tokens: 3000 });
  if (teaching) p.response_format = { type: "json_object" };
  return p;
}
// Cloudflare Workers AI: runs in this Cloudflare account through the AI binding, free daily allowance, no key.
const CF_MODELS = ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/meta/llama-3.1-8b-instruct-fast"];
const TUTOR_SCHEMA = { type: "object", properties: {
  shortAnswer: { type: "string" }, detailedSteps: { type: "array", items: { type: "string" } }, simpleSteps: { type: "array", items: { type: "string" } },
  memoryTip: { type: "string" }, equations: { type: "array", items: { type: "string" } }, verification: { type: "string" }, nextPractice: { type: "string" } },
  required: ["detailedSteps", "simpleSteps"] };
const CONTEXT_SCHEMA = { type: "object", properties: {
  category: { type: "string" }, summary: { type: "string" }, affectedYears: { type: "string" },
  likelyGradeImpact: { type: "string" }, howCollegesView: { type: "string" },
  limitations: { type: "array", items: { type: "string" } }, howToShare: { type: "array", items: { type: "string" } } },
  required: ["category", "summary", "likelyGradeImpact", "limitations", "howToShare"] };
const NO_REVEAL_RULE = "Rule for this reply: the student has NOT answered yet. Help them work it out: explain the method, give a first step, hints, and what to check. Do not state, confirm, or hint at which choice or value is correct, do not name a choice letter as right, and leave shortAnswer empty.";
// True if a reply gives away the answer to an unanswered question (names the correct letter as the answer).
function revealsAnswer(text, letter) {
  if (!letter) return false;
  const L = letter.toUpperCase();
  return new RegExp("(answer|choice|option|correct)[^.\\n]{0,25}\\(?\\b" + L + "\\b\\)?|\\b" + L + "\\)?\\s*(is|would be)\\s*(the\\s*)?(correct|right|answer)", "i").test(text);
}
async function workersAi(env, messages, teaching, schema) {
  const attempts = {};
  for (const model of CF_MODELS) {
    try {
      const out = await env.AI.run(model, Object.assign({ messages, max_tokens: teaching ? 1400 : 900, temperature: 0.3 },
        teaching ? { response_format: { type: "json_schema", json_schema: schema || TUTOR_SCHEMA } } : {}));
      let content = out && out.response;
      if (content && typeof content === "object") content = JSON.stringify(content);
      content = String(content || "").trim();
      if (teaching) { const m = content.match(/\{[\s\S]*\}/); try { JSON.parse(m ? m[0] : content); content = m ? m[0] : content; } catch { attempts[model] = "bad_json"; continue; } }
      if (content) return { content, model, usage: out.usage, attempts };
      attempts[model] = "empty";
    } catch (e) { attempts[model] = String(e && e.message || e).slice(0, 120); }
  }
  return { attempts };
}
async function aiTutor(req, env) {
  if (!env.AI && !env.GROQ_API_KEY) return json({ code: "no_key" }, 503, req);
  // Only the app's own pages may use the tutor, so the key can't be borrowed by other sites.
  if (!AI_ORIGINS.test(req.headers.get("Origin") || "")) { console.log("AI tutor refused origin", req.headers.get("Origin")); return json({ code: "forbidden" }, 403, req); }
  let body; try { body = await req.json(); } catch { return json({ error: "Bad request." }, 400, req); }
  const messages = Array.isArray(body.messages) ? body.messages.slice(-12)
    .filter((m) => m && ["system", "user", "assistant"].includes(m.role) && typeof m.content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, 6000) })) : [];
  if (!messages.length) return json({ error: "Bad request." }, 400, req);
  const noAnswer = !!body.noAnswer, correctLetter = /^[A-E]$/i.test(String(body.correctLetter || "")) ? String(body.correctLetter) : "";
  if (noAnswer) messages.push({ role: "system", content: NO_REVEAL_RULE });
  // Per-IP limit so one visitor can't use up the shared Groq quota.
  const ip = req.headers.get("CF-Connecting-IP") || "?";
  const win = Math.floor(Date.now() / (AI_WINDOW_MIN * 60000));
  const row = await env.DB.prepare("INSERT INTO ai_usage (ip, win, n) VALUES (?, ?, 1) ON CONFLICT(ip, win) DO UPDATE SET n = n + 1 RETURNING n").bind(ip, win).first();
  if (row && row.n > AI_PER_WINDOW) return json({ code: "app_rate_limited", retryAfter: Math.ceil(((win + 1) * AI_WINDOW_MIN * 60000 - Date.now()) / 1000) }, 429, req);
  if (Math.random() < 0.02) await env.DB.prepare("DELETE FROM ai_usage WHERE win < ?").bind(win - 1).run();
  // Try every Groq model so a retired model or a per-model quota still resolves. A caller may
  // pass a model hint (used by diagnostics) to try one model first, or onlyModel to prove it works.
  // 1) Cloudflare Workers AI (primary). A reply that gives away an unanswered question's answer is
  //    retried once with the rule repeated, then rejected.
  if (env.AI) {
    for (let tryNo = 0; tryNo < 2; tryNo++) {
      const r = await workersAi(env, tryNo ? messages.concat({ role: "system", content: "Your previous reply revealed the answer. " + NO_REVEAL_RULE }) : messages, !!body.teaching, body.kind === "context" ? CONTEXT_SCHEMA : null);
      if (r.content && noAnswer && revealsAnswer(r.content, correctLetter)) { console.log("AI tutor reply revealed the answer; retrying"); continue; }
      if (r.content) return json({ content: r.content, provider: "cloudflare", model: r.model, usage: normalizeUsage(r.usage), requestId: makeRequestId() }, 200, req);
      console.log("Workers AI failed", JSON.stringify(r.attempts));
      break;
    }
    if (!env.GROQ_API_KEY) return json({ code: "upstream", retryAfter: 10 }, 502, req);
  }
  // 2) Groq, only if a key is still configured.
  const hint = typeof body.model === "string" && GROQ_MODELS.includes(body.model) ? body.model : null;
  const order = hint ? [hint, ...GROQ_MODELS.filter((m) => m !== hint)] : GROQ_MODELS;
  const attempts = {};
  let lastStatus = 503, retryAfter = 60;
  const deadline = Date.now() + 40000;
  for (const model of order) {
    if (Date.now() > deadline) { attempts[model] = "deadline"; break; }
    try {
      const r = await fetch(env.GROQ_URL || "https://api.groq.com/openai/v1/chat/completions", {
        method: "POST", signal: AbortSignal.timeout(15000),
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + env.GROQ_API_KEY },
        body: JSON.stringify({ model, messages, ...groqParams(model, !!body.teaching) })
      });
      lastStatus = r.status; attempts[model] = r.status;
      if (r.status === 401) return json({ code: "server_key_invalid" }, 503, req);
      if (!r.ok) { retryAfter = Math.max(1, Number(r.headers.get("retry-after")) || 60); continue; }
      const j = await r.json();
      const choice = j.choices && j.choices[0] || {};
      const content = String(choice.message && choice.message.content || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
      // A reply that hit the token cap is cut off mid-sentence; try the next model instead of returning it.
      if (choice.finish_reason === "length") { attempts[model] = "cut_off"; continue; }
      if (body.teaching && content) { try { JSON.parse(content); } catch { attempts[model] = "bad_json"; continue; } }
      if (content && noAnswer && revealsAnswer(content, correctLetter)) { attempts[model] = "revealed_answer"; continue; }
      if (content) return json({ content, provider: "groq", model, usage: normalizeUsage(j.usage), requestId: makeRequestId() }, 200, req);
      attempts[model] = "empty";
    } catch (e) { lastStatus = 503; attempts[model] = "timeout"; }
    if (body.onlyModel) break;
  }
  console.log("AI tutor failed", JSON.stringify(attempts)); // visible in `npx wrangler tail`
  return json({ code: lastStatus === 429 ? "rate_limited" : "upstream", retryAfter, status: lastStatus, attempts }, lastStatus === 429 ? 429 : 502, req);
}

async function saveHelpHistory(req, env, user) {
  const text = await req.text();
  if (text.length > 30000) return json({ error: "Tutor history entry is too large." }, 413, req);
  let b; try { b = JSON.parse(text); } catch { return json({ error: "Bad request." }, 400, req); }
  const allowedStatus = ["complete", "failed", "retried"];
  const id = String(b.id || "").slice(0, 100);
  const category = String(b.category || "question").slice(0, 60);
  const requestText = String(b.requestText || "").slice(0, 1200);
  const responseText = String(b.responseText || "").slice(0, 12000);
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(id) || !requestText || !responseText) return json({ error: "Invalid tutor history entry." }, 400, req);
  const values = [
    id, user.id, Math.max(1, Number(b.createdAt) || Date.now()), String(b.questionId || "").slice(0, 100),
    String(b.questionVersion || "1").slice(0, 40), String(b.questionSnapshot || "").slice(0, 8000),
    String(b.testType || "").slice(0, 20), String(b.section || "").slice(0, 60), String(b.domain || "").slice(0, 100),
    String(b.skill || "").slice(0, 100), String(b.attemptId || "").slice(0, 100), category, requestText, responseText,
    String(b.provider || "groq").slice(0, 30), String(b.model || "").slice(0, 100),
    allowedStatus.includes(b.status) ? b.status : "complete", JSON.stringify(normalizeUsage(b.usage))
  ];
  await env.DB.prepare("INSERT INTO help_history (id, user_id, created_at, question_id, question_version, question_snapshot, test_type, section, domain, skill, attempt_id, category, request_text, response_text, provider, model, status, usage_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, id) DO UPDATE SET response_text = excluded.response_text, provider = excluded.provider, model = excluded.model, status = excluded.status, usage_json = excluded.usage_json")
    .bind(...values).run();
  return json({ ok: true, id }, 200, req);
}

function normalizeUsage(value) {
  const u = value && typeof value === "object" ? value : {};
  const num = (v) => Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : null;
  return { promptTokens: num(u.prompt_tokens ?? u.promptTokens), completionTokens: num(u.completion_tokens ?? u.completionTokens), totalTokens: num(u.total_tokens ?? u.totalTokens) };
}
function safeJson(text) { try { return JSON.parse(text || "null"); } catch { return null; } }
function makeRequestId() { return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : "help_" + Date.now() + "_" + Math.random().toString(36).slice(2, 10); }

function mergeAttemptHistory(local, remote) {
  const records = new Map();
  [...(Array.isArray(local) ? local : []), ...(Array.isArray(remote) ? remote : [])].forEach((rec) => {
    if (!rec || !rec.id) return;
    const old = records.get(rec.id);
    if (!old || (rec.done && !old.done) || (!!rec.done === !!old.done && (rec.finishedAt || 0) >= (old.finishedAt || 0))) records.set(rec.id, rec);
  });
  return [...records.values()].sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0)).slice(0, 120);
}

// Public IDs only. Never expose other Worker secrets in the configuration.
function adConfig(env) {
  let slots = {};
  try { slots = JSON.parse(env.ADSENSE_SLOTS || "{}"); } catch (_) {}
  const clean = {};
  for (const [name, spec] of Object.entries(slots && typeof slots === "object" ? slots : {})) {
    const id = typeof spec === "string" ? spec : spec?.id;
    if (/^\d+$/.test(id || "")) clean[name] = String(id);
  }
  return {
    enabled: env.ADSENSE_ENABLED === "true", client: /^ca-pub-\d{16}$/.test(env.ADSENSE_CLIENT || "") ? env.ADSENSE_CLIENT : "",
    slots: clean, productionHosts: ["funsat.bid"],
    autoAdsExclusionsConfirmed: env.ADSENSE_APP_EXCLUDED === "true",
    audienceReviewed: env.ADSENSE_AUDIENCE_REVIEWED === "true",
    gameRails: [0, 1, 2].includes(Number(env.ADSENSE_GAME_RAILS ?? 1)) ? Number(env.ADSENSE_GAME_RAILS ?? 1) : 1,
    resultsDensity: env.ADSENSE_RESULTS_DENSITY === "moderate" ? "moderate" : "conservative",
    vignetteFrequencyMinutes: [3, 5, 10].includes(Number(env.ADSENSE_VIGNETTE_MINUTES)) ? Number(env.ADSENSE_VIGNETTE_MINUTES) : 3,
    experiment: String(env.ADSENSE_EXPERIMENT || "baseline").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60)
  };
}

// ---- Owner-only multi-project analytics. Provider credentials never reach clients. ----
const ANALYTICS_NAMES = new Set(['page_view','sat_test_started','sat_module_completed','sat_test_completed',
  'sat_results_viewed','sat_score_breakdown_viewed','sat_answer_review_started','sat_answer_review_completed',
  'practice_started','game_started','game_round_completed','game_session_10min','game_session_30min',
  'game_session_60min','game_session_ended','college_tool_used']);
const ANALYTICS_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function analyticsProjects(env) {
  let supplied = {};
  try { supplied = JSON.parse(env.ANALYTICS_PROJECTS || '{}'); } catch (_) {}
  return ['funsat','pillcounted'].map(id => {
    const p = supplied?.[id] || {};
    const origins = p.origins ?? (id === 'funsat' ? ['https://funsat.bid','https://www.funsat.bid'] : ['https://pillcounted.com','https://www.pillcounted.com']);
    return {
      id, name: id === 'funsat' ? 'FunSAT' : 'Pillcounted',
      origins: (Array.isArray(origins) ? origins : []).filter(o => {
        if (typeof o !== 'string') return false;
        try { const u = new URL(o); return u.origin === o && (u.protocol === 'https:' ||
          (u.protocol === 'http:' && ['localhost','127.0.0.1'].includes(u.hostname))); } catch (_) { return false; }
      }).slice(0,8),
      accountId: /^[a-f0-9]{32}$/i.test(p.cloudflare?.accountId || '') ? p.cloudflare.accountId : '',
      zoneId: /^[a-f0-9]{32}$/i.test(p.cloudflare?.zoneId || '') ? p.cloudflare.zoneId : '',
      workerName: /^[a-zA-Z0-9_-]{1,64}$/.test(p.cloudflare?.workerName || '') ? p.cloudflare.workerName : ''
    };
  });
}
function analyticsResponse(data, status = 200, origin = '') {
  const headers = {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',
    'X-Content-Type-Options':'nosniff','Vary':'Origin'};
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
  }
  return new Response(JSON.stringify(data), {status, headers});
}
async function analyticsOwner(req, env) {
  const secret = env.ANALYTICS_OWNER_TOKEN;
  if (typeof secret !== 'string' || secret.length < 32) return false;
  const token = (req.headers.get('Authorization') || '').match(/^Bearer (\S+)$/)?.[1] || '';
  if (token.length > 256) return false;
  return timingSafeEqual(await sha256(token), await sha256(secret));
}
function analyticsDates(url) {
  const today = new Date().toISOString().slice(0,10);
  const from = url.searchParams.get('from') || new Date(Date.now() - 6 * 86400000).toISOString().slice(0,10);
  const to = url.searchParams.get('to') || today;
  for (const date of [from,to]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) return null;
  }
  const start = Date.parse(from), end = Date.parse(to) + 86400000;
  if (end <= start || end - start > 31 * 86400000 || to > today || start < Date.now() - 90 * 86400000 - 86400000) return null;
  return {from,to,start,end};
}
async function analyticsReadBody(req) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers.get('Content-Type') || '')) return {status:415};
  if (Number(req.headers.get('Content-Length')) > 16384) return {status:413};
  const reader = req.body?.getReader();
  if (!reader) return {status:400};
  let size = 0; const chunks = [];
  for (;;) {
    const {value,done} = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > 16384) { await reader.cancel(); return {status:413}; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
  try { return {body:JSON.parse(new TextDecoder().decode(bytes))}; } catch (_) { return {status:400}; }
}
function analyticsProperties(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const categorical = new Set(['test_type','section','game','view','experiment','results_density']);
  const numeric = new Set(['module','questions_answered','duration_seconds','game_rails','vignette_frequency_label']);
  const clean = {};
  for (const [key,value] of Object.entries(raw)) {
    if (categorical.has(key) && typeof value === 'string' && /^[a-zA-Z0-9_-]{1,60}$/.test(value)) clean[key] = value;
    else if (numeric.has(key) && typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 86400) clean[key] = value;
    else return null; // Reject, do not silently store unknown/personal fields.
  }
  return clean;
}
async function analyticsIngest(req, env, projects) {
  const url = new URL(req.url), project = projects.find(p => p.id === url.searchParams.get('project'));
  const origin = req.headers.get('Origin') || '';
  if (!project || !project.origins.includes(origin)) return analyticsResponse({error:'Origin or project is not permitted.'},403);
  if (req.method === 'OPTIONS') return new Response(null,{status:204,headers:{
    'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST, OPTIONS',
    'Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600','Vary':'Origin'}});
  if (req.method !== 'POST') return analyticsResponse({error:'Method not allowed.'},405,origin);
  if (env.ANALYTICS_ENABLED !== 'true') return analyticsResponse({error:'Analytics collection is disabled.'},503,origin);
  const result = await analyticsReadBody(req);
  if (result.status) return analyticsResponse({error:'Invalid or oversized JSON request.'},result.status,origin);
  const b = result.body;
  if (!b || b.consent !== true || !ANALYTICS_UUID.test(b.sessionId || '') || !Array.isArray(b.events) || b.events.length < 1 || b.events.length > 20 ||
      Object.keys(b).some(k => !['consent','sessionId','events'].includes(k))) return analyticsResponse({error:'Invalid consented event batch.'},400,origin);
  const events = [];
  for (const e of b.events) {
    const properties = analyticsProperties(e?.properties);
    if (!e || !ANALYTICS_UUID.test(e.id || '') || !ANALYTICS_NAMES.has(e.name) || !properties ||
        (project.id === 'pillcounted' && (e.name !== 'page_view' || Object.keys(properties).some(k => k !== 'view') || properties.view !== 'site')) ||
        Object.keys(e).some(k => !['id','name','properties'].includes(k))) return analyticsResponse({error:'Event schema is not permitted.'},400,origin);
    events.push({id:e.id,name:e.name,properties});
  }
  if (!env.ANALYTICS_EVENT_LIMITER || !env.ANALYTICS_PROJECT_LIMITER) return analyticsResponse({error:'Collection limits are not configured.'},503,origin);
  // No IP/account IDs persisted. Limits protect storage but cannot make public client events trusted.
  const [session,global] = await Promise.all([
    env.ANALYTICS_EVENT_LIMITER.limit({key:project.id + ':' + b.sessionId}),
    env.ANALYTICS_PROJECT_LIMITER.limit({key:project.id})
  ]);
  if (!session.success || !global.success) {
    const response = analyticsResponse({error:'Rate limit exceeded.'},429,origin);response.headers.set('Retry-After','60');return response;
  }
  const now = Date.now();
  const configuredLimit = Number(env.ANALYTICS_DAILY_EVENT_LIMIT || 100000);
  const limit = Number.isInteger(configuredLimit) && configuredLimit >= 100 && configuredLimit <= 1000000 ? configuredLimit : 100000;
  const budget = await env.DB.prepare(
    'INSERT INTO analytics_budget (project,day,n) VALUES (?,?,?) ON CONFLICT(project,day) DO UPDATE SET n = n + excluded.n WHERE n + excluded.n <= ? RETURNING n'
  ).bind(project.id,new Date(now).toISOString().slice(0,10),events.length,limit).first();
  if (!budget) return analyticsResponse({error:'Daily event collection budget exceeded.'},429,origin);
  const results = await env.DB.batch(events.map(e => env.DB.prepare(
    'INSERT OR IGNORE INTO analytics_events (project,id,session_id,name,received_at,properties) VALUES (?,?,?,?,?,?)'
  ).bind(project.id,e.id,b.sessionId,e.name,now,JSON.stringify(e.properties))));
  return analyticsResponse({accepted:results.reduce((n,r)=>n+(r.meta?.changes || 0),0)},202,origin);
}
async function analyticsSummary(env, project, range) {
  const bindings = [project.id,range.start,range.end];
  const rows = await env.DB.prepare(
    'SELECT name, COUNT(*) AS events, COUNT(DISTINCT session_id) AS sessions, SUM(CASE WHEN name = \'game_session_ended\' THEN CAST(json_extract(properties, \'$.duration_seconds\') AS REAL) ELSE 0 END) AS visible_game_seconds FROM analytics_events WHERE project = ? AND received_at >= ? AND received_at < ? GROUP BY name ORDER BY name'
  ).bind(...bindings).all();
  const total = await env.DB.prepare('SELECT COUNT(*) AS events, COUNT(DISTINCT session_id) AS sessions FROM analytics_events WHERE project = ? AND received_at >= ? AND received_at < ?').bind(...bindings).first();
  const daily = await env.DB.prepare("SELECT strftime('%Y-%m-%d',received_at/1000,'unixepoch') AS day, COUNT(*) AS events, COUNT(DISTINCT session_id) AS sessions FROM analytics_events WHERE project = ? AND received_at >= ? AND received_at < ? GROUP BY day ORDER BY day").bind(...bindings).all();
  return {project:project.id,source:'consented_client_events',range:{from:range.from,to:range.to},
    totals:{events:total?.events || 0,observed_sessions:total?.sessions || 0},events:rows.results || [],daily:daily.results || [],
    active_users:null,revenue:null,
    limitations:['Client events can be spoofed; consented traffic is incomplete.','Sessions are anonymous, tab-scoped, and expire after 30 minutes of inactivity; they are not unique people.','SAT submission events include early submissions; they are not a verified full-test completion rate.','No AdSense earnings or pageviews are inferred from these events.']};
}
async function analyticsCloudflare(env, project, range, suppliedToken) {
  if (suppliedToken === undefined && env.ANALYTICS_OWNER_APP === 'true') {
    const row = await env.DB.prepare('SELECT ciphertext,iv FROM analytics_connections WHERE project = ?').bind(project.id).first();
    if (row) {
      const saved = await analyticsConnectionCrypt(env,project.id,row,false);
      project = {...project,accountId:saved.accountId || '',zoneId:saved.zoneId || '',workerName:saved.workerName || ''};
      suppliedToken = saved.token;
    }
  }
  let tokens = {};try { tokens = JSON.parse(env.CLOUDFLARE_ANALYTICS_TOKENS || '{}'); } catch (_) {}
  const token = suppliedToken ?? tokens?.[project.id];
  const base = {project:project.id,source:'cloudflare_graphql',range:{from:range.from,to:range.to}};
  if (typeof token !== 'string' || !token || (!project.accountId && !project.zoneId)) return {...base,status:'not_configured',workers:null,zone:null};
  const reports = await Promise.all([
    project.accountId && project.workerName ? analyticsGraphql(token,
      'query WorkerMetrics($accountTag: string, $start: string, $end: string, $scriptName: string) { viewer { accounts(filter: {accountTag: $accountTag}) { workersInvocationsAdaptive(limit: 1, filter: {scriptName: $scriptName, datetime_geq: $start, datetime_leq: $end}) { sum {requests errors subrequests} quantiles {cpuTimeP50 cpuTimeP99} } } } }',
      {accountTag:project.accountId,start:new Date(range.start).toISOString(),end:new Date(range.end-1).toISOString(),scriptName:project.workerName},'workers') : Promise.resolve({status:'not_configured',data:null}),
    project.zoneId ? analyticsGraphql(token,
      'query ZoneMetrics($zoneTag: string, $start: Date, $end: Date) { viewer { zones(filter: {zoneTag: $zoneTag}) { httpRequests1dGroups(limit: 31, filter: {date_geq: $start, date_leq: $end}, orderBy: [date_ASC]) { dimensions {date} sum {requests bytes cachedRequests cachedBytes threats} uniq {uniques} } } } }',
      {zoneTag:project.zoneId,start:range.from,end:range.to},'zone') : Promise.resolve({status:'not_configured',data:null})
  ]);
  return {...base,status:reports.every(r=>r.status==='ok')?'ok':'partial',workers:reports[0],zone:reports[1],
    limitations:['Cloudflare datasets depend on plan, retention, permissions and adaptive sampling.','HTTP requests include assets and bots, not just human pageviews.','Daily unique counts must not be added to estimate distinct users over the whole interval.','Worker CPU quantiles are not browser Core Web Vitals.','Revenue, billing, Web Analytics RUM and every Cloudflare product are not included in these two datasets.']};
}
async function analyticsGraphql(token, query, variables, kind) {
  try {
    const r = await fetch('https://api.cloudflare.com/client/v4/graphql',{method:'POST',headers:{
      'Authorization':'Bearer '+token,'Content-Type':'application/json','Accept':'application/json'},
      body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(8000)});
    if (!r.ok) return {status:r.status===401||r.status===403?'access_denied':'upstream_error',data:null};
    const body = await r.json();
    if (body.errors?.length) return {status:'query_unavailable',data:null};
    const scope = kind==='workers'?body.data?.viewer?.accounts:body.data?.viewer?.zones;
    if (!Array.isArray(scope) || scope.length !== 1) return {status:'scope_unavailable',data:null};
    const rows = kind==='workers'?scope[0].workersInvocationsAdaptive:scope[0].httpRequests1dGroups;
    if (!Array.isArray(rows)) return {status:'invalid_response',data:null};
    // Whitelist provider output; never return raw errors, credentials or unrelated accounts.
    const clean = rows.map(row => {
      const sum = {}, quantiles = {}, uniq = {};
      for (const k of kind==='workers'?['requests','errors','subrequests']:['requests','bytes','cachedRequests','cachedBytes','threats']) {
        const v=row.sum?.[k];if(typeof v==='number'&&Number.isFinite(v)&&v>=0)sum[k]=v;
      }
      if (kind==='workers') {
        for (const k of ['cpuTimeP50','cpuTimeP99']) {const v=row.quantiles?.[k];if(typeof v==='number'&&Number.isFinite(v)&&v>=0)quantiles[k]=v;}
        return {sum,quantiles};
      }
      const v=row.uniq?.uniques;if(typeof v==='number'&&Number.isFinite(v)&&v>=0)uniq.uniques=v;
      return {date:/^\d{4}-\d{2}-\d{2}$/.test(row.dimensions?.date || '')?row.dimensions.date:null,sum,uniq};
    });
    return {status:'ok',data:clean};
  } catch (_) {return {status:'upstream_unavailable',data:null};}
}
async function analyticsApi(req, env) {
  const url = new URL(req.url), path=url.pathname, projects=analyticsProjects(env);
  try {
    if (path === '/api/analytics/events') return await analyticsIngest(req,env,projects);
    const saveConnection = path === '/api/analytics/connections' && env.ANALYTICS_OWNER_APP === 'true';
    const suppliedReport = (path === '/api/analytics/cloudflare-report' || saveConnection) && env.ANALYTICS_OWNER_APP === 'true';
    if (req.method !== 'GET' && !(suppliedReport && req.method === 'POST')) return analyticsResponse({error:'Method not allowed.'},405);
    if (!await analyticsOwner(req,env)) return analyticsResponse({error:'Owner authorization required.'},401);
    if (!env.ANALYTICS_READ_LIMITER) return analyticsResponse({error:'Owner read limits are not configured.'},503);
    if (!(await env.ANALYTICS_READ_LIMITER.limit({key:'owner'})).success) {
      const response=analyticsResponse({error:'Rate limit exceeded.'},429);response.headers.set('Retry-After','60');return response;
    }
    if (path === '/api/analytics/projects') return analyticsResponse({projects:projects.map(p=>({
      id:p.id,name:p.name,event_collection_configured:p.origins.length>0&&env.ANALYTICS_ENABLED==='true',
      workers_scope_configured:!!(p.accountId&&p.workerName),zone_scope_configured:!!p.zoneId
    }))});
    const project=projects.find(p=>p.id===url.searchParams.get('project'));
    if(!project)return analyticsResponse({error:'Select a configured project.'},400);
    const range=analyticsDates(url);if(!range)return analyticsResponse({error:'Use valid UTC YYYY-MM-DD dates, at most 31 days, within the past 90 days.'},400);
    if (suppliedReport) {
      if (req.method !== 'POST') return analyticsResponse({error:'Method not allowed.'},405);
      const local = url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname);
      if ((!local && url.protocol !== 'https:') || req.headers.get('Origin') !== url.origin) {
        return analyticsResponse({error:'Use the secure owner dashboard.'},403);
      }
      const result = await analyticsReadBody(req);
      if (result.status) return analyticsResponse({error:'Invalid or oversized JSON request.'},result.status);
      const b = result.body;
      if (saveConnection && b?.action === 'delete' && Object.keys(b).length === 1) {
        await env.DB.prepare('DELETE FROM analytics_connections WHERE project = ?').bind(project.id).run();
        return analyticsResponse({project:project.id,saved:false});
      }
      if (!b || typeof b !== 'object' || Array.isArray(b) ||
          Object.keys(b).some(k=>!['token','accountId','zoneId','workerName'].includes(k)) ||
          typeof b.token !== 'string' || !/^[a-zA-Z0-9_-]{20,256}$/.test(b.token) ||
          (b.accountId !== undefined && b.accountId !== '' && !/^[a-f0-9]{32}$/i.test(b.accountId)) ||
          (b.zoneId !== undefined && b.zoneId !== '' && !/^[a-f0-9]{32}$/i.test(b.zoneId)) ||
          (b.workerName !== undefined && b.workerName !== '' && !/^[a-zA-Z0-9_-]{1,64}$/.test(b.workerName)) ||
          !(b.zoneId || (b.accountId && b.workerName))) {
        return analyticsResponse({error:'Enter a read-only token and a zone ID, or an account ID plus worker name.'},400);
      }
      if (saveConnection) {
        const sealed = await analyticsConnectionCrypt(env,project.id,b,true);
        await env.DB.prepare('INSERT INTO analytics_connections (project,ciphertext,iv,updated_at) VALUES (?,?,?,?) ON CONFLICT(project) DO UPDATE SET ciphertext=excluded.ciphertext,iv=excluded.iv,updated_at=excluded.updated_at')
          .bind(project.id,sealed.ciphertext,sealed.iv,Date.now()).run();
        return analyticsResponse({project:project.id,saved:true});
      }
      // One-off reporting also remains supported; never echo credentials.
      return analyticsResponse(await analyticsCloudflare(env,{...project,
        accountId:b.accountId || '',zoneId:b.zoneId || '',workerName:b.workerName || ''},range,b.token));
    }
    if(path==='/api/analytics/summary')return analyticsResponse(await analyticsSummary(env,project,range));
    if(path==='/api/analytics/cloudflare')return analyticsResponse(await analyticsCloudflare(env,project,range));
    return analyticsResponse({error:'Not found.'},404);
  } catch (_) {return analyticsResponse({error:'Analytics service is unavailable.'},503);}
}

async function analyticsConnectionCrypt(env,project,value,encrypt) {
  if (!/^[a-f0-9]{64}$/i.test(env.ANALYTICS_ENCRYPTION_KEY || '')) throw new Error('Encryption is not configured');
  const bytes = hex => Uint8Array.from(hex.match(/../g) || [],x=>parseInt(x,16));
  const hex = raw => Array.from(new Uint8Array(raw),x=>x.toString(16).padStart(2,'0')).join('');
  const key = await crypto.subtle.importKey('raw',bytes(env.ANALYTICS_ENCRYPTION_KEY),'AES-GCM',false,[encrypt?'encrypt':'decrypt']);
  const iv = encrypt ? crypto.getRandomValues(new Uint8Array(12)) : bytes(value.iv);
  const algorithm = {name:'AES-GCM',iv,additionalData:new TextEncoder().encode('analytics-connection:'+project)};
  if (encrypt) return {iv:hex(iv),ciphertext:hex(await crypto.subtle.encrypt(algorithm,key,new TextEncoder().encode(JSON.stringify(value))))};
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt(algorithm,key,bytes(value.ciphertext))));
}
