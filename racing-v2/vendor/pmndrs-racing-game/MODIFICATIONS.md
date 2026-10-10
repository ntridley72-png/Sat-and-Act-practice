# Modifications from upstream

Dated record of changes made to this vendored copy of `pmndrs/racing-game` so
the diff against the pinned commit stays legible. See `VENDORING.md` for the
upstream pin, licence, and the reasoning behind these removals.

## 2026-10-10

- `src/ui/Auth.tsx` — deleted. Supabase sign-in UI; this is a student-facing
  study app with no third-party backend and no auth.
- `src/ui/index.ts` — removed `export * from './Auth'` (file deleted) and
  `export * from './Editor'` (leva editor is now dev-only, see App.tsx).
- `src/data.ts` — removed the Supabase client (`createClient`), the
  `setupSession` / `authenticateUser` / `unAuthenticateUser` auth helpers, and
  the `insertScore` backend call. Kept the `SavedScore` type and a stub
  `getScores()` that returns an empty list; it carries a
  `TODO(local-leaderboard)` to read from the local store (`src/store.ts`) once
  local persistence exists, rather than inventing a new persistence layer.
- `src/store.ts` — removed the `@supabase/supabase-js` `Session` type import
  and the `session` field from `IState` and the store initial state.
- `src/ui/Intro.tsx` — removed the auth import, the `setupSession` effect, and
  the sign-in / "Hello {name}" / logout block; the intro now just shows the
  start link and keys.
- `src/ui/Finished.tsx` — removed the auth import, the `session`-driven name /
  thumbnail / "Add my score" flow, and the `insertScore` call. The finished
  screen keeps the time and the (local) leaderboard plus the restart button.
- `src/App.tsx` — the `Editor` (leva) component is no longer imported
  statically. It is loaded through a dynamic `import('./ui/Editor')` behind an
  `import.meta.env.DEV` guard inside `DevEditor`, so a production build never
  pulls `leva` into the bundle.
- `package.json` — removed `@supabase/supabase-js` from `dependencies`; moved
  `leva` from `dependencies` to `devDependencies` (dev-only editor).

`yarn.lock` was intentionally left untouched: it cannot be regenerated without
running a package manager in this directory, which is out of scope here.
