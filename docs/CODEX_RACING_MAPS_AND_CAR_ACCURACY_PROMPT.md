# Codex execution prompt: original racing maps and accurate fictional cars

Work in `/Users/noahridley/Sat-and-Act-practice` on branch
`racing-v2-foundation`. The recoverable baseline is commit `e7ed013`, also
pushed as `origin/codex/pre-racing-maps-2026-10-10`.

## Objective

Extend the active FunSAT racing implementation with an original, validated,
GeoJSON-inspired map format and at least five distinctive playable tracks.
At the same time, coordinate with Claude's separate automotive-review stream
to improve the procedural fictional cars, especially their rear views, without
copying any identifiable production vehicle or protected game design.

Codex/GPT owns architecture, implementation, integration, tests, security,
performance, and final decisions. Claude is a concurrent research/review
partner. DeepSeek is a bounded secondary code/geometry reviewer. Do not use
Astra. Never let two agents edit the same file concurrently.

Apply the installed `search-first`, `coding-standards`, `error-handling`,
`security-review`, `make-interfaces-feel-better`, and `verification-loop`
skills. Load `git-workflow`, `browser-qa`, `accessibility`, and
`motion-patterns` when relevant. Do not claim completion without the full
verification loop.

## Preserve existing work

1. Record `git status --short`, the branch, and HEAD before every phase.
2. The working tree contains unrelated app/question-bank work. Do not edit,
   stage, format, revert, or commit it.
3. Restrict this task to `racing-v2/`, narrowly required racing integration
   files, new racing tests, and the new documentation named here.
4. If an intended file changes concurrently, stop editing it, inspect the new
   diff, and reconcile deliberately. Never overwrite another agent.
5. Do not deploy without separate operator authorization.

## Reference format and licensing boundary

Study `https://github.com/JosePedroDias/open-race-track-format` at inspected
commit `6a91c2c57a484a873b40aaf373a918b801446f14`. Clone it only into a temporary
directory created with `mktemp -d`.

GitHub currently reports no declared license. Use only high-level ideas such
as a centerline, width, direction, start/finish, grid, terrain, decorations,
buildings, and model placement. Do not copy its code, prose, examples,
coordinates, or assets, and do not vendor the repository.

## Phase 1: inspect and plan

Inspect the real active runtime before coding, including:

- `racing-v2/src/`
- `racing-v2/bench/`
- `racing/data/tracks.js`
- `racing/render/track.js`
- relevant racing tests and integration code

Write `docs/RACING_MAP_FORMAT_PLAN.md`. Define a small versioned FunSAT schema
with stable IDs, closed centerline, direction, default and optional local
width, elevation/banking when supported, start/finish, ordered anti-shortcut
checkpoints, grid, surfaces, terrain, hazards, decorations, landmarks,
weather compatibility, difficulty, deterministic seed, performance budget,
and provenance. Define an adapter into the active runtime rather than creating
a disconnected second system.

Validation must reject open or malformed loops, non-finite values, duplicate
IDs, illegal widths/surfaces, ambiguous self-intersections, discontinuous
headings/curvature, undriveable radii, invalid checkpoints/grid slots,
on-road scenery, unsupported themes, and excessive geometry/prop counts.

## Phase 2: original map collection

GPT must create at least five original layouts:

1. **Prism Skyway** — a floating luminous road in a celestial cloudscape with
   sweeping curves, a technical sequence, elevation changes, and original
   landmarks. It may evoke the broad fantasy of a colorful road in space, but
   may not use the name Rainbow Road or copy Nintendo layouts, color sequences,
   iconography, characters, item boxes, music, logos, textures, or assets.
2. **Neon Harbor Circuit** — docks, reflections, fast waterfront straight,
   container-yard technical sector, and clear braking landmarks.
3. **Redwood Ridge** — mountain forest, elevation, gravel runoff, rock faces,
   bridges, and no blind impossible corners.
4. **Solar Salt Run** — desert/salt-flat speed sections, a technical solar
   array or oasis sector, strong horizon landmarks, low-cost scenery.
5. **Tempest Causeway** — coastal road, cliffs, sea walls, spray, and fair dry,
   wet, and rain variants.

Every track needs a unique silhouette, deterministic data, safe grid, ordered
checkpoints, fleet-compatible curvature, readable edges, original scenery,
no camera obstruction, graphics-tier budgets, and AI drivability.

## Phase 3: Claude automotive accuracy stream

Claude writes only `docs/CAR_ACCURACY_REVIEW.md` during its research pass.
Codex must not edit that file while Claude is active. Read and evaluate the
report after Claude finishes; do not accept recommendations blindly.

Claude must use many lawful public web images as visual research, favoring
official manufacturer media, museums, reputable auction houses, and editorial
photography. Research at least 4 to 6 vehicles per broad class and multiple
angles per vehicle: front, side/profile, front three-quarter, rear
three-quarter, and true rear. Do not download or ship those images. Record page
URLs, publisher/owner, access date, angle, vehicle class, and the design lesson
learned. Image references are research evidence only, never game assets.

Study broad classes rather than cloning named models:

- compact 1990s-style sports coupe
- modern front-engine sports coupe
- long-hood muscle/GT
- rally-derived hatchback
- mid-engine exotic
- lightweight roadster
- practical sport sedan
- off-road/rally utility shape if present in the fleet

Extract class-level design grammar:

- wheelbase-to-length and cabin-to-body proportions
- hood, cowl, roof, greenhouse, beltline, overhangs, and shoulder volume
- wheel diameter, tire sidewall, track width, arch clearance, and stance
- glass thickness and rake
- panel breaks, bumper mass, aero surfaces, and underbody visibility
- lighting volume and depth rather than flat decals
- material separation among paint, glass, rubber, metal, lights, and trim

Rear accuracy is the priority. For every fictional car, inspect:

- rear glass slope and its transition into roof/deck or hatch
- rear shoulder and quarter-panel volume
- deck/hatch height and trailing edge
- bumper depth and corner wrap
- taillight width, height, depth, segmentation, and body integration
- trunk/hatch seams and license recess without real branding
- diffuser/undertray geometry
- exhaust count, size, spacing, and plausible routing
- rear wheel placement, arch thickness, track width, and tire visibility
- spoiler mounting, thickness, supports, and relationship to body airflow
- rear ride height and the amount of suspension/underbody visible
- silhouette readability at gameplay distance and from the chase camera

## Originality and copyright/trade-dress safeguards

The game cars must remain original fictional designs.

- Never trace, photogrammetrically reproduce, or copy a single real car.
- Never copy exact grilles, lamp signatures, window shapes, body creases,
  spoilers, vents, badges, logos, names, liveries, wheel designs, or unique
  combinations strongly associated with a particular model.
- Use references from multiple manufacturers and eras for every class.
- Combine only generic functional principles, then materially change the
  proportions, surfacing, lighting, greenhouse, fascia, and aero treatment.
- No real badges, trademarks, model names, racing liveries, or manufacturer
  color-and-graphic identities.
- No copied mesh, CAD, blueprint, texture, photograph, or game asset.
- Maintain a design-origin matrix showing at least three generalized sources
  of inspiration per fictional class and explaining the original departures.
- Run an identifiable-similarity review. If a car reads immediately as one
  specific production model, revise at least three major identity zones.

Claude should provide per-car findings with `keep`, `change`, and `avoid`
recommendations. Codex decides what to implement. Start with one hero-car rear
improvement, verify it from multiple gameplay angles, and only then propagate
shared improvements carefully across the fleet.

## Phase 4: implementation and bounded DeepSeek review

Implement the smallest compatible map adapter, validators, map data, renderer
support, and selection integration. Preserve old IDs or provide tested safe
migration/fallback behavior. Use deterministic randomness only. Do not use
remote runtime assets, `eval`, dynamic code execution, or unbounded geometry.

Give DeepSeek one narrow task at a time:

1. Read-only schema/validator edge-case review.
2. Read-only geometry review for closure, spacing, curvature, grid,
   checkpoints, determinism, and scenery placement.
3. Test-gap review limited to specified racing test files.

Record each DeepSeek prompt, model, files, findings, and GPT's acceptance or
rejection. DeepSeek may edit tests only after explicit file authorization and
must never edit the implementation concurrently with GPT.

## Verification

Run at minimum:

```sh
cd /Users/noahridley/Sat-and-Act-practice/racing-v2
npm run typecheck
npm run build
```

Also run all applicable existing racing tests plus new schema, validator, map,
AI-drive, grid, checkpoint, fallback, deterministic-build, saved-selection,
ghost/replay, and malformed-input tests.

For every new track verify smooth closure, even spacing, finite values,
drivable curvature, safe grid slots, non-skippable ordered checkpoints,
scenery off the roadway, deterministic rebuilding, and an AI-completed lap.
Exercise relevant wet/rain variants and the supported vehicle fleet.

Use browser QA at 1366x768, 1440x900, and a smaller Chromebook viewport.
Capture consistent track-selection, grid, driving, landmark, weather, and
front/side/rear car views. Check console/network errors, camera obstruction,
HUD readability, missing assets, visual distinctness, rear-body coherence,
and low-tier performance. Screenshots alone do not prove drivability.

Run security grep and full diff review. State skipped checks honestly.

## Final artifacts

Create:

- `docs/RACING_MAP_FORMAT_PLAN.md`
- `docs/CAR_ACCURACY_IMPLEMENTATION_NOTES.md`
- `docs/RACING_MAP_CHATGPT_REVIEW.md`

The final review packet must include reference repositories/commits, licensing
precautions, image-research provenance links, originality matrix, initial and
final status, files changed, architecture, Claude and DeepSeek findings,
accepted/rejected recommendations, exact commands, raw results, screenshots,
performance measurements, limitations, deployment status, and final commit.

Do not say the work is independently verified until ChatGPT reviews this
packet and the actual diff.
