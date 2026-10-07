# FunSAT Temporal workflows

Local Temporal dev setup for FunSAT operations. The dev server and worker run
on this machine; nothing here is required for the website itself.

## What is installed

- **Temporal CLI 1.9.1** (Homebrew): server 1.32.0 + UI 2.54.1
- **Node SDK 1.24.0**: `@temporalio/client`, `@temporalio/worker`

## Run it

```bash
# 1. Dev server (gRPC localhost:7233, UI http://localhost:8233)
temporal server start-dev

# 2. Worker (in another terminal, from this folder)
npm run worker

# 3. Run the SEO indexing workflow once
npm run run

# 4. Create / inspect the weekly schedule
npm run schedule
npm run schedules
```

## Workflows

- `seoIndexingWorkflow` — runs `tests/seo-audit.test.cjs`; if it passes, runs
  `scripts/indexnow.mjs` to submit any new or changed canonical URLs. Weekly
  schedule `funsat-weekly-indexing` (every 7 days, overlapping runs skipped).
  A failed audit blocks submission by design.

Activities only execute the two fixed commands above (no workflow input is
interpolated into a command), with a 4-minute timeout each.

## Notes

- Dev server persistence is in-memory: schedules disappear when the server
  stops. For durable scheduling run it with `--db-filename` or use Temporal
  Cloud.
- The UI at http://localhost:8233 shows workflow history for `seo-indexing-*`.
