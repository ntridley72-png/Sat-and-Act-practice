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

## Good to know

- Sign-in only works when the app is opened from its web address. Opened as a saved file, the app still works but keeps progress on that device only.
- If you host the HTML somewhere else (GitHub Pages, say), set `API_URL` near the "ACCOUNTS + CLOUD SAVE" comment in the HTML to your Worker's address.
- Passwords are hashed (PBKDF2-SHA256 with a per-user salt) and never stored in plain text. After 8 wrong passwords an account is locked for 15 minutes.
- There's no "forgot password" yet, because Cloudflare doesn't send email by itself. It can be added with a free email service such as Resend.
- If the database is ever deleted, recreate the tables with:
  `npx wrangler d1 execute sat-act-practice-db --remote --file=worker/schema.sql`
