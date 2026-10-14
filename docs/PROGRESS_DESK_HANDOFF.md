# Progress Desk implementation and release handoff

User selected mockup 2, `docs/mockups/practice-ui-2026-10-13/02-progress-desk.png`,
as the base for the whole website, retaining all working features. Default dark
appearance with light option is independent of Exam/Notebook/Focus study layouts.
No new production deployment has been authorized for this redesign.

Worktree: `/Users/noahridley/.codex/worktrees/progress-desk-ui/Sat-and-Act-practice`.
Branch: `codex/progress-desk-ui`. Initial source commit `4fe9606`; merge `61f6e91`
preserves primary `ae78c50` car release and first-paint workspace initialization.
Primary checkout is currently on `task/drift-car-rears`, not the older racing branch.
Do not edit app.js or overwrite unrelated untracked docs/prompts.

New shared assets progress-desk.css/js enhance existing controls, not replace the
app. HTML retains original IDs, study nodes, score calculations and account APIs.
subjects.js adds precise skill-picker navigation; seo_common.py applies the same
shell to public profiles/guides/calculators. wrangler.toml includes both assets.
college.js reads native disclosure state synchronously before replacing its DOM;
queued events from detached details must not change that state.

Verified so far: practice.test.cjs, college.test.cjs, subjects-ui.cjs,
scholarship-ui.cjs, college-ui.cjs, arcade-logic.cjs, workspace-layout.cjs
(63 cases at seven widths), theme-routing.cjs (both appearances, all layouts,
cold/warm/reload, throttling and blocked storage), progress-desk-ui.cjs,
SEO audit (663 pages). Latest smoke/build/contrast results belong in final QA report.
Existing old visual tests were updated for intentional 44px sidebar controls,
disclosed score details and mobile menu; no functional assertions removed.

Local servers: port 8903 uses scripts/serve-tests.cjs and encoded app filename;
port 8904 serves generated public/. Keep preview open, never imply it is deployed.
Browser IAB tab 1 has a local disposable unfinished Math session; no live credentials.
Use fullPage screenshot or explicit clipping: normal IAB screenshot can crop to
the visible desktop panel even when innerWidth is 1440.

Root has no npm manifest/type/lint/coverage configuration. Existing Playwright
library comes from primary node_modules via NODE_PATH, not a new dependency.
Disk is nearly full; npx tried installing latest Wrangler and failed ENOSPC.
Existing cached official Wrangler 4.150.0 succeeds at:
`node /Users/noahridley/.npm/_npx/32026684e21afda6/node_modules/wrangler/bin/wrangler.js deploy --dry-run`.
Do not delete user files to free space. Generated public/ may be rebuilt safely
by its existing scoped build command; old SEO-output stash is recoverable.

Remaining: finish contrast findings in both appearances, final combined-source
visual comparison/design-qa.md; capture mobile and public pages; rerun final build,
syntax/diff/security checks. Commit only task files and QA evidence, not unrelated
test screenshot churn. Safely integrate UI commits into primary and push verified
branch without deploying. Re-read git status first; another agent may have advanced it.

Optimizer and split free-helper calls already attempted once and timed out; do
not repeat them recursively. Read-only feature inventory agent finished. No further
cross-AI review requested. Live account sync, provider auth and real API requests
are outside local browser proof; report those verification limits accurately.
