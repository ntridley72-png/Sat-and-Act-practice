# Progress Desk visual and functional QA

final result: passed

## Scope and visual truth

Selected source: `docs/mockups/practice-ui-2026-10-13/02-progress-desk.png`
(1774 × 887 pixels, combined desktop/mobile concept board). The user selected
this direction as the base for the entire existing website, with every feature
retained; this is an implementation of that direction, not a replacement app.

Actual desktop: `tests/screenshots/progress-desk/home-final-dark.png`,
1440 × 960 CSS/pixel viewport, 1× density. Actual mobile:
`tests/screenshots/progress-desk/home-mobile-dark.png`, 390 CSS px wide,
844px viewport, full-page capture with a matched 844px crop in the board.
Combined comparison: `tests/screenshots/progress-desk/comparison.png` and
the accompanying comparison.html. Source and actual were rendered together in
one IAB comparison input; the source board was scaled proportionally to 1440px,
not stretched. Its native device frame is not reproduced in responsive web.

State: dark dashboard, unfinished local Math session with one answer. Source
demo numbers (1500/1540/5) intentionally differ from genuine empty score/target
and zero completed tests. The saved unfinished attempt remains in history.
Functional test fixtures independently verify real 1340 average, 1540 target,
one eligible completed test and exclusion of a completed subject drill.

## Findings and comparison history

Initial combined comparison found actionable P2 issues: an inherited 1140px
home wrapper left excess desktop inset; optional module controls and setup
notes pushed Start unnecessarily far down; Review was missing its aligned
icon; the public sidebar had content-box width drift. Fixes override the old
home cap, disclose optional module settings using native details, keep the
question-rotation explanation inside scoring/question options, reuse the
existing app chart icon, and use border-box for public navigation.

Post-fix combined capture was reopened and inspected with both source and
actual visible. Start fits in the 1440 × 960 desktop viewport (bottom 958.5px);
Resume remains the first action. Mobile navigation exposes every original
control including Home and supports Escape. No actionable P0/P1/P2 remains.

The contrast audit found dark Stop-button text on a secondary dark surface
and a hard-coded Focus question-number foreground in light appearance. Both
were corrected with semantic foreground tokens and rerun successfully.

## Required fidelity surfaces

- Typography: self-hosted Archivo matches the restrained sans-serif direction;
  clear 32px desktop/26px mobile heading hierarchy, tabular estimates, readable
  supporting labels. No headline gradients or added display font. No clipped
  labels in responsive tests; long question stems remain 18–22px.
- Spacing/layout: left 216px navigation, resume-first full-width row, three
  compact metrics, skill table beside setup, history and supporting features.
  Mobile stacks those regions under a compact Menu header. Six shell widths
  and seven practice widths show no horizontal page overflow. The setup keeps
  more controls than the image because SAT module/ACT section/custom length/
  score-curve choices must remain reachable, rather than being removed to
  copy a sparse mock. Existing history cards and extra lower-page tools are
  intentional feature-preservation deviations.
- Colors/tokens: charcoal surfaces, restrained teal accent, muted labels and
  flat 4–6px radii. Matching light appearance uses dark teal with appropriate
  on-accent white. Measured text contrast passes in both appearances across
  six app states, three study layouts and mobile/desktop widths.
- Assets: original app icons, original logo text, existing wallet/avatar,
  gallery photos/attribution and game-owned art preserved. Review reuses the
  existing supplied chart icon; no new handcrafted icon or decorative asset.
  Public galleries retain 16:9 crops, layout reserves, lazy loading, source
  credit and lightbox keyboard controls. No car geometry/assets changed here.
- Copy/content: real saved data, no demo scores, unofficial-score disclaimers,
  precise skill drill links, explicit no-history state. All college metrics,
  sources/reporting periods, public safety tables, scholarship filters and
  study controls remain. No new admission-probability or safety claims added.

Focused review used desktop/mobile captures for navigation, metrics, skill
table and setup; original-size screenshots keep their small labels readable.
Generated college Light evidence: public-college-light.png. App practice and
scholarship evidence are in the same screenshot directory. IAB console checks
on the app/public page found no JavaScript errors; regression suites also
collect page errors. Actual local answer/check/save-and-exit preserved Resume.

## Verification loop

Build passed: cached official Wrangler 4.150.0 `deploy --dry-run`, 663 public
pages and 1406 asset files, version c81d7346. This was not a deployment.
Syntax checks passed for all changed JS, Python compile checks passed, and
`git diff --check` passed. No root TypeScript/lint/coverage setup exists;
static type-checking and measured coverage are unavailable, not claimed.
Diff/security review: no account/worker/API/database changes, no new secrets,
no evaluation of user strings; new dynamic UI uses textContent/DOM creation.

Passing suites: practice.test.cjs, college.test.cjs, tutor.test.cjs,
subjects-ui.cjs, scholarship-ui.cjs, college-ui.cjs, avatar-ui.cjs,
arcade-logic.cjs, driving-recovery.cjs, redesign-ui.cjs,
progress-desk-ui.cjs, workspace-layout.cjs (63 cases), theme-routing.cjs
(saved appearance/layout, early frames, cold/warm/reload/slow/blocked storage),
contrast-audit.cjs in dark and light, college-sections.cjs,
college-gallery.cjs, content-integrations.cjs and seo-audit.test.cjs.
Old visual assertions were updated for intentional sidebar sizing/disclosures/
tokens, retaining the behavior checks and all gallery assertions.

Limits: no live credential sign-in, provider authorization, production account
sync, production deploy or hardware/audio-device audition. Driving/audio tests
use local browser/WebGL and assert mute/recovery/voice cleanup; these are not
a substitute for every device or subjective game feel. Full WCAG certification
is not claimed. P3 follow-up: a dedicated history-table restyle may bring old
attempt cards closer to the mock without changing review behavior.

## Self-evaluation

Accuracy 4/5: tests/build/captures support local claims; no live-release proof.
Completeness 4/5: existing feature inventory preserved and major paths covered;
live provider/account-sync verification remains outside this local run.
Clarity 4/5: preview and deploy status are explicit; detailed evidence lives here.
Actionability 4/5: runnable preview and committed sources; deployment is a separate step.
Conciseness 4/5: short user handoff, longer evidence reserved for this report.
Overall 4.0/5. Improvements: authorize a live release and smoke-test account sync
after deployment; optionally refine history-table fidelity. Deliver local build.
