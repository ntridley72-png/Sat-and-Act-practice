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
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      const asset = await env.ASSETS.fetch(request);
      const headers = new Headers(asset.headers);
      // The app is updated in place; force browsers and Cloudflare edges to
      // revalidate so a deploy is visible on the next refresh.
      headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
      headers.set("Pragma", "no-cache");
      headers.set("Expires", "0");
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
