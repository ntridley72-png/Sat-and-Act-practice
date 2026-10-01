// Account API for SAT & ACT Practice: email/password sign-up and sign-in, and saved progress.
//   POST /api/signup   { email, password }  -> { token, email }
//   POST /api/login    { email, password }  -> { token, email }
//   POST /api/logout                        (Authorization: Bearer <token>)
//   GET  /api/me                            -> { email }
//   GET  /api/progress                      -> { data, updatedAt }
//   PUT  /api/progress { data, updatedAt }  -> { ok, updatedAt }
//   POST /api/forgot   { email }            -> { ok }  (emails a reset link through Resend)
//   POST /api/reset    { token, password }  -> { token, email }
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
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
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

async function route(req, env, path) {
  if (path === "signup" && req.method === "POST") return signup(req, env);
  if (path === "login" && req.method === "POST") return login(req, env);
  if (path === "forgot" && req.method === "POST") return forgot(req, env);
  if (path === "reset" && req.method === "POST") return reset(req, env);
  const user = await authed(req, env);
  if (!user) return json({ error: "Please sign in again." }, 401, req);
  if (path === "logout" && req.method === "POST") {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(bearer(req))).run();
    return json({ ok: true }, 200, req);
  }
  if (path === "me" && req.method === "GET") return json({ email: user.email }, 200, req);
  if (path === "progress" && req.method === "GET") {
    const row = await env.DB.prepare("SELECT data, updated_at FROM progress WHERE user_id = ?").bind(user.id).first();
    return json(row ? { data: JSON.parse(row.data), updatedAt: row.updated_at } : { data: null, updatedAt: 0 }, 200, req);
  }
  if (path === "progress" && req.method === "PUT") {
    const text = await req.text();
    if (text.length > MAX_PROGRESS_BYTES) return json({ error: "Saved progress is too large." }, 413, req);
    let body; try { body = JSON.parse(text); } catch { return json({ error: "Bad request." }, 400, req); }
    const updatedAt = Number(body.updatedAt) || Date.now();
    await env.DB.prepare("INSERT INTO progress (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at")
      .bind(user.id, JSON.stringify(body.data ?? null), updatedAt).run();
    return json({ ok: true, updatedAt }, 200, req);
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
function cors() { return { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Max-Age": "86400" }; }
function json(obj, status, req) { return new Response(JSON.stringify(obj), { status, headers: Object.assign({ "Content-Type": "application/json" }, cors(req)) }); }
