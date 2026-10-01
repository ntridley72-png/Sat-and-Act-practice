# Deploying to Cloudflare

The app and the sign-in API run as one Cloudflare Worker. The database (`sat-act-practice-db`)
is already created in your Cloudflare account and its tables are set up, so deploying is the only step.

## Deploy (about 2 minutes)

You need Node.js installed (nodejs.org). Then, in this folder:

```sh
npx wrangler login     # opens a browser to sign in to Cloudflare (first time only)
npx wrangler deploy
```

When it finishes it prints the app's address, like `https://sat-act-practice.<your-name>.workers.dev`.
Open that address. Sign-in and progress saving work from there, on any device.

To publish later changes, run `npx wrangler deploy` again. It copies the latest `SAT & ACT Practice.html` automatically.

## Turn on "Forgot password" emails (optional, 5 minutes)

Reset emails are sent through Resend (free for 3,000 emails a month).

1. Sign up at resend.com and create an API key.
2. Give the key to the Worker (it's stored encrypted, not in the code):
   ```sh
   npx wrangler secret put RESEND_API_KEY
   ```
3. To email anyone, verify a domain you own in Resend (Domains → Add domain), then set the sender in `wrangler.toml`:
   ```toml
   [vars]
   MAIL_FROM = "SAT & ACT Practice <no-reply@yourdomain.com>"
   ```
   and run `npx wrangler deploy` again. Without a verified domain, Resend only delivers to the email address you signed up to Resend with, which is fine for testing.

Until the key is added, "Forgot password?" tells people that reset by email isn't set up yet.

## Good to know

- Sign-in only works when the app is opened from its web address. Opened as a saved file, the app still works but keeps progress on that device only.
- If you host the HTML somewhere else (GitHub Pages, say), set `API_URL` near the "ACCOUNTS + CLOUD SAVE" comment in the HTML to your Worker's address.
- Passwords are hashed (PBKDF2-SHA256 with a per-user salt) and never stored in plain text. After 8 wrong passwords an account is locked for 15 minutes.
- Reset links work once and expire after 60 minutes. Resetting signs the account out on every other device. At most 3 reset emails per account per hour.
- If the database is ever deleted, recreate the tables with:
  `npx wrangler d1 execute sat-act-practice-db --remote --file=worker/schema.sql`
