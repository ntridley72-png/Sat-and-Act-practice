# Private phone analytics app

Implemented locally; not deployed or connected to live Cloudflare accounts yet.
FunSAT and Pillcounted are separate projects, with separate source scopes and report
cards. This is not a promise of every Cloudflare product: initial sources are
Workers requests/errors/subrequests/CPU quantiles, zone HTTP requests/bytes/cache/
threats/daily unique estimates, and optional consented client events. Billing,
Cloudflare Web Analytics RUM, revenue and unique people are not inferred.

## Private HTTPS access from anywhere (recommended phone setup)

1. In Cloudflare Zero Trust → Access → Applications, add a **self-hosted** app
   for `analytics.funsat.bid`, covering the **entire hostname**, not just one path.
   Add an Allow policy limited to your email/identity; require your identity provider
   or email one-time PIN. Do not add an Everyone, Bypass or Service Auth policy.
   Configure this before deploying. The hostname uses the existing FunSAT zone;
   change `routes` in `wrangler.analytics.toml` if you prefer another hostname.
2. Create read-only Cloudflare API tokens for each project's account/zone scope:
   Account → Account Analytics → Read, and Zone → Analytics → Read. Limit resource
   access to the relevant accounts/zones. One shared account can use the same
   read-only token for both entries, while keeping distinct worker/zone scopes.
   Do not grant write/billing permissions. These tokens remain server-side.
3. Put a generated random owner token (at least 32 characters, recommended 64 hex)
   into `npx wrangler secret put ANALYTICS_OWNER_TOKEN --config wrangler.analytics.toml`.
   Store it in your password manager. It is **not** a Cloudflare API token.
   Use an interactive prompt; never paste credentials into chat or commit them.
4. Set secret `CLOUDFLARE_ANALYTICS_TOKENS` with the same command, changing the name.
   Its JSON format is `{"funsat":"READ_TOKEN","pillcounted":"READ_TOKEN"}`.
5. Set `ANALYTICS_PROJECTS` through `wrangler secret put` on this config. Format:

   ```json
   {"funsat":{"cloudflare":{"accountId":"32_HEX_ACCOUNT_ID","zoneId":"32_HEX_ZONE_ID","workerName":"sat-act-practice"}},"pillcounted":{"cloudflare":{"accountId":"32_HEX_ACCOUNT_ID","zoneId":"32_HEX_ZONE_ID","workerName":"YOUR_PILLCOUNTED_WORKER"}}}
   ```

   IDs are available in Cloudflare's account/zone overview. Use actual worker names;
   do not assume Pillcounted uses a Worker. If it is static Pages hosting, omit
   `workerName` and use its zone analytics. Zone metrics cover that whole zone,
   including other hostnames, not just the project. Prefer dedicated zones for
   meaningful isolation. Distinct projects sharing one zone share those zone totals.
6. Once, apply the additive schema to the existing FunSAT database:
   `npx wrangler d1 execute sat-act-practice-db --remote --config wrangler.analytics.toml --file worker/migrations/0001_analytics.sql`.
   This creates only analytics tables/indexes; it does not recreate account tables.
7. Deploy the dedicated owner app: `npx wrangler deploy --config wrangler.analytics.toml`.
   `workers_dev = false` and `preview_urls = false` prevent those alternate public URLs.
   The owner Worker exposes only dashboard assets and read-only report routes.
   It has no scheduled handler and does not accept events/account API requests.
8. In a signed-out/private browser, confirm **every dashboard/API path** requires
   Cloudflare Access login. An authorized Access session without the owner bearer
   must still receive 401 from report endpoints. If either check fails, correct the
   Access policy before using live reports.
9. On iPhone, open `https://analytics.funsat.bid/owner-analytics/` in Safari, log in,
   then Share → Add to Home Screen → Add. On Android Chrome, use Add to Home Screen
   or Install when offered. The manifest opens standalone on supported browsers.
   Cloudflare Access may require login again when the Home Screen app opens.
   Enter your owner token and tap Load reports. Tap Clear token and reports to lock.

The app has no ads, persistent token storage or offline report cache. No service
worker caches confidential responses. It requires internet access; browser install
UI varies. API fetches retain same-origin Access cookies and carry a separate owner
bearer. A home-screen shortcut is not a native App Store application.

## Local computer preview

Requires Node.js, npm/network for Wrangler, and a browser:

```
node scripts/start-analytics-local.mjs
```

Open `http://localhost:8790/owner-analytics/`. The first run generates a private
owner token in `.analytics-local/.dev.vars`, uses a separate local D1 database,
and binds only to this computer. Copy the owner token from that ignored file into
the form. Local usage summaries start empty. For live Cloudflare reads during a
local preview, add `ANALYTICS_PROJECTS` and `CLOUDFLARE_ANALYTICS_TOKENS` JSON values
as quoted variables in that file. Stop with Ctrl+C. Never expose Wrangler's local
explorer/debug server to the internet or a public tunnel.

On a phone, `localhost` means the phone itself. Use the private HTTPS deployment
above for access from anywhere. It does not require leaving a computer running.

## Optional product-event collection

The existing FunSAT Worker serves `/api/analytics/events`. Collection is OFF until
`ANALYTICS_ENABLED=true` is explicitly configured on the public site's Worker and
the consent implementation explicitly calls
`CloudProjectAnalytics.connectFunSat({consent:true})`. Withdraw consent using
`CloudProjectAnalytics.configure({consent:false})` and
`FunSatMetrics.configure({consent:false})`. Advertising consent and analytics consent must be handled as
separate purposes. Do not assume one grants the other.

Apply the additive schema before enabling collection. The main Worker has a daily
90-day cleanup job. Wire the CMP's analytics grant/withdraw callbacks; no fabricated
consent or automatic activation is present. Owner reports can read the public
Worker's event tables because the dedicated owner Worker binds the same database.
The public Worker may have its own owner token only if owner reporting there is
wanted; it is not needed for public event collection.

Pillcounted's repository was inaccessible in this session, so no client code there
was changed. Its Cloudflare reporting can be connected without editing that site.
If you later add the generic `analytics-client.js` to Pillcounted, initialize only
on affirmative analytics consent with
`CloudProjectAnalytics.configure({consent:true,project:'pillcounted',endpoint:'https://funsat.bid/api/analytics/events'})`.
Only `CloudProjectAnalytics.track('page_view',{})` is supported there, normalized to
`view:site`; never include page paths, queries, medication, diagnosis, patient,
account, form or other health data. Review/update Pillcounted's privacy notice
before enabling any collection. Existing unrelated site analytics are unaffected.

## API contract and limitations

- `GET /api/analytics/projects`: configured scope/collection flags, owner-only.
- `GET /api/analytics/summary?project=funsat&from=YYYY-MM-DD&to=YYYY-MM-DD`:
  project-filtered event/session aggregates and daily counts, owner-only.
- `GET /api/analytics/cloudflare?project=pillcounted&from=...&to=...`:
  project-scoped official Cloudflare GraphQL reports, owner-only.
- Public Worker only: `POST /api/analytics/events?project=funsat` with exact
  allowed Origin and `Content-Type: application/json`, up to 16 KiB/20 events:

  ```json
  {"consent":true,"sessionId":"UUID_V4","events":[{"id":"UUID_V4","name":"page_view","properties":{"view":"site"}}]}
  ```

Unknown fields/events are rejected. Event UUIDs deduplicate within a project;
projects do not share identifiers or counts. CORS permits only configured origins
(apex/www FunSAT and Pillcounted by default), but is not proof of legitimate traffic.
Client events can be forged; they must never be used for billing/verified earnings.
Bounded session/project request rates plus an atomic daily per-project event budget
(default 100,000 attempted events, configurable `ANALYTICS_DAILY_EVENT_LIMIT`) limit
storage abuse. Rate limits are Cloudflare location-local, not global billing quotas.
Daily budget counts duplicates/failed insert attempts too. Events older than 90 days
are cleaned daily by the public Worker, including after collection is disabled. There is no persistent person ID;
consented sessionStorage tab identifiers expire after 30 minutes of inactivity.
Do not add session counts across days to obtain unique users.

Dates are UTC/inclusive, max 31 days, within the previous 90 days. Provider retention,
plan entitlements and sampling can reduce availability. CPU quantiles are μs.
Workers/HTTP requests include assets, retries and bots, **not pageviews**. Daily zone
uniques are provider estimates, not deduplicated period users. AdSense earnings are
not part of Cloudflare and are not invented. Source failures return unavailable
status without tokens/upstream raw error bodies. Owner responses use no-store.
An owner bearer grants both projects' reports; this is not a multi-tenant customer
permission system. Rotate secrets if leaked. Cloudflare Access adds owner identity
protection but must be configured and verified externally.

Official sources used:
- https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/
- https://developers.cloudflare.com/analytics/graphql-api/getting-started/authentication/api-token-auth/
- https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/

Live provider queries cannot be verified until read credentials and scopes exist.
No deployments, external migrations or changes to Cloudflare accounts were made.
