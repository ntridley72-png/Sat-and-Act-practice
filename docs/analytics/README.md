# Private phone analytics app

FunSAT and Pillcounted have separate owner report cards and encrypted saved
Cloudflare connections. The dedicated owner app opens with a PIN screen. Public
FunSAT does not expose the dashboard. Implementation is committed; Cloudflare
hosting and real provider credentials still require configuration.

## Deploy from your phone

1. In Cloudflare Zero Trust → Access → Applications, add a self-hosted app covering
   the entire `analytics.funsat.bid` hostname. Allow only your email/identity, using
   email one-time PIN or your identity provider. No Everyone/Bypass policies.
2. Import this GitHub repository into **Workers & Pages** as a Worker, selecting
   the `feat/adsense-private-analytics` branch. Build command:
   `node scripts/build-analytics-owner.mjs`. Deploy command:
   `npx wrangler deploy --config wrangler.analytics.toml`.
   Use that config, not the public website's `wrangler.toml`.
   The configured custom hostname is `analytics.funsat.bid`; change its route if
   necessary. workers.dev and preview URLs are disabled to avoid Access bypasses.
3. In the owner Worker's **Settings → Variables and Secrets**, add these as **secrets**:
   - `ANALYTICS_LOGIN_PIN`: the private PIN chosen by the owner. It is not in source.
   - `ANALYTICS_ENCRYPTION_KEY`: a securely generated random 64-character hex key
     (32 random bytes). Generate it with a trusted password manager/random generator;
     never use your PIN, account ID, an API token or a repeated/example key.
   Without both settings the app fails closed with a setup-required response.
4. In D1 → `sat-act-practice-db` → Console, apply the SQL from
   `worker/migrations/0001_analytics.sql` and then
   `worker/migrations/0002_analytics_connections.sql`.
   They add tables/indexes without modifying existing account/progress data.
   The owner Worker binds this existing database. Command-line alternative:
   `npx wrangler d1 execute sat-act-practice-db --remote --config wrangler.analytics.toml --file worker/migrations/0002_analytics_connections.sql`
   (repeat with 0001 first).
5. Verify signed-out visitors encounter Access login, then the app PIN screen.
   After PIN login, verify reports load; after Lock dashboard, verify APIs return
   401 and dashboard navigation redirects to the login screen. Do not enable live
   credentials before these checks. Deployment initially returns setup-required
   until its secrets/database are configured.
6. Open `https://analytics.funsat.bid/owner-analytics/` in Safari, sign in, then
   Share → Add to Home Screen. In Android Chrome use Add to Home Screen/Install
   when offered. Home Screen apps may require Access login again. Supported browsers
   display the manifest standalone; no offline report cache/service worker exists.

This does not change or deploy the public FunSAT website or edit Pillcounted's code.
It does not require a computer to remain running. A Home Screen shortcut is not a
native App Store app. Physical-device and live HTTPS checks happen after deployment.

## Save Cloudflare connections from the app

After entering your PIN, expand **Connect Cloudflare analytics from this phone**.
For each project enter:

- Read-only Cloudflare API token: Profile → API Tokens → Create Custom Token.
  Permissions: Account → Account Analytics → Read, Zone → Analytics → Read;
  restrict it to the relevant accounts/zones. Never use a deployment/service token.
- Account ID from the Cloudflare account overview and Worker name from Workers &
  Pages, if the project uses a Worker.
- Zone ID from the domain overview, for website HTTP metrics.

Provide a zone ID, or an account ID plus worker name; either or both reports can
be configured. If Pillcounted uses static Pages without a Worker, omit worker name
and use its zone. Click **Save connection** for each project, then **Load reports**.
The token field clears after saving; it is never filled with the saved token.
Reopening the app after PIN login uses saved credentials automatically.
**Remove saved connection** deletes that project's encrypted record. If legacy
server-secret configuration exists, it remains a fallback after deletion.

Tokens/scope configuration are AES-256-GCM encrypted with a random IV and project
binding in D1. Encryption key stays in a Worker secret, separately from the data.
Tokens are decrypted only on the server for the fixed Cloudflare GraphQL endpoint.
No tokens are echoed to the client, put in URLs, logged by the app, or saved in
browser local/session storage. Secrets are encrypted, not irreversibly hashed,
because the server needs them to contact Cloudflare. Protect Cloudflare account
access/backups and review platform logging settings. Never paste tokens into chat.

Changing the PIN invalidates current app sessions. Changing the encryption key
invalidates sessions **and makes saved credentials unreadable**; re-save both
connections afterwards. An API token's expiry/revocation also requires replacement.
Save validates format, not live permission entitlement; source errors remain clearly
identified when reports load. Zone reports cover the entire zone, including other
hostnames. Shared zones therefore share zone totals, not isolated project traffic.

## Authentication and API security

The app uses the configured PIN, five attempts per hashed client IP/15-minute UTC
bucket plus a Cloudflare five/minute limiter, and a signed one-hour cookie. Cookies
are HttpOnly, SameSite=Strict, and Secure on HTTPS. Rotating the PIN or server key
invalidates cookies. The dedicated app rejects account and event-collection APIs.
Use Cloudflare Access in front of the PIN screen; a short numeric PIN is not an
internet identity system. Client addresses are HMAC-hashed only for bounded login
attempt records, cleaned on subsequent login attempts. Login attempt records are
separate from anonymous product events. Logout clears the browser cookie; copied
cookies expire after an hour or can be invalidated by rotating the PIN/key.

The dashboard does not require entering a separate owner bearer. The wrapper
validates its signed cookie and provides internal backend authorization. The public
site's legacy owner report endpoints still require an explicitly configured owner
bearer and cannot accept credential uploads.

- `POST /api/analytics/login` accepts `{pin}` from the same origin.
- `POST /api/analytics/logout` clears the app cookie.
- `POST /api/analytics/connections?project=funsat` accepts
  `{token,accountId,zoneId,workerName}`, or `{action:"delete"}`, with owner session.
- `GET /api/analytics/summary?project=funsat&from=YYYY-MM-DD&to=YYYY-MM-DD`
  reports consented event/session aggregates.
- `GET /api/analytics/cloudflare?project=pillcounted&from=...&to=...`
  uses saved connection credentials, then optional legacy server configuration.
- `POST /api/analytics/cloudflare-report?...` supports request-scoped one-off
  credentials for compatible integrations; the dashboard uses persistent saves.
- `GET /api/analytics/projects` reports configured scope flags, not tokens.

All credential and login POSTs require same origin; non-loopback HTTP redirects to
HTTPS. Authenticated reporting uses no-store and bounded dates/rates/payloads.
Unknown fields/schemas reject. The app is an owner system, not a multi-tenant system;
its owner can choose any scope granted by their read-only Cloudflare token.

Legacy server configuration is optional: `ANALYTICS_PROJECTS` JSON with each
project's `cloudflare:{accountId,zoneId,workerName}`, and secret
`CLOUDFLARE_ANALYTICS_TOKENS` JSON `{funsat:"READ_TOKEN",pillcounted:"READ_TOKEN"}`.
Saved connections override these settings without modifying them.

## Local preview

```
node scripts/start-analytics-local.mjs
```

This initializes an isolated local D1 database and listens only on this computer at
`http://localhost:8790/owner-analytics/`. The local PIN and encryption key are in
ignored `.analytics-local/.dev.vars`; they are not deployed or committed. New local
setups generate random values. Keep that file private. Stop with Ctrl+C. Do not
expose Wrangler's local explorer/debug server through an internet tunnel.
On a phone, localhost refers to the phone; use the private HTTPS host from above.

## Optional consented product events

FunSAT's public Worker supports `POST /api/analytics/events?project=funsat` with
exact approved Origin, JSON <=16 KiB and <=20 events:

```json
{"consent":true,"sessionId":"UUID_V4","events":[{"id":"UUID_V4","name":"page_view","properties":{"view":"site"}}]}
```

Collection is off until `ANALYTICS_ENABLED=true` on that public Worker and a real
analytics consent callback calls `CloudProjectAnalytics.connectFunSat({consent:true})`.
Withdraw using `CloudProjectAnalytics.configure({consent:false})` and
`FunSatMetrics.configure({consent:false})`. Analytics and advertising are separate
consent purposes. The public Worker cleans events/budgets older than 90 days daily,
including after collection is disabled. Anonymous tab sessions expire after 30
minutes of inactivity; no persistent visitor identity exists. Client events can
be forged and consented traffic is incomplete. Idempotent UUIDs are project-scoped.
Rate/session/project limits and an atomic daily budget (default 100,000 attempted
events/project, configurable `ANALYTICS_DAILY_EVENT_LIMIT`) bound storage abuse.
Cloudflare rate limits are location-local, not billing quotas. Attempts including
duplicates count against the daily event budget.

Pillcounted's client repository was inaccessible during initial implementation and
was not edited. Its provider reports do not require client changes. If later added,
its consented client accepts only generic page_view normalized to view:site, with no
URLs, health/medication/diagnosis/patient/account/form data. Review its consent/privacy
notice before collection. Existing unrelated site analytics remain unchanged.

## Metric limitations

Initial provider reporting includes Workers requests/errors/subrequests/CPU p50/p99
(μs) and daily zone HTTP requests/bytes/cache/threats/unique estimates. It does not
include every Cloudflare product, billing, RUM or AdSense revenue. Requests include
assets/bots and are not pageviews; daily uniques cannot be summed into unique people.
Client sessions are not users or verified test completion. Dates are inclusive UTC,
max 31 days within 90 days. Provider plan, retention, permissions and sampling can
reduce availability. Source failures are unavailable, never fabricated estimates.

Official references:
- https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/
- https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/
- https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/

No remote deployment or database migration was performed in this implementation.
