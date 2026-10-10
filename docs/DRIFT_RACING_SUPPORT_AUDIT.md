# Drift & Racing — Support Audit (read-only)

Prepared by OpenCode/DeepSeek as support for the GPT-owned redesign. **No implementation changes were made.** VDrift was not consulted in code form; nothing was copied, translated, compiled, or imported from it. All findings come from reading the current repository only.

## 1. Executive summary

Funsat's racing suite is one large classic-script app (`app.js`) plus an optional Three.js layer (`racing3d.js`, vendored three.js) that is written but **not yet integrated into the two playable games**. Drift Circuit is a full 3D game built on the in-repo `RacingGL` engine; Neon Racing (traffic/circuit racer) uses a 2D projection of the same engine plus sprites. Garage, economy (tokens → cash → unlocks), and persistence live inside the app profile and sync coarsely through `/api/progress`.

Key facts for planning:

- 15 cars exist as data (`DriftCircuit.CARS`) with per-car power/grip/weight/handbrake/audio and an era tag; paint/wheels/spoilers are **profile-level, not per-car**. No drivetrain or wheelbase fields exist.
- The garage is a single long modal with ~11 sections, mostly text pills + 4 tuning sliders; car previews use a 2D top-down renderer (`drawCustomCar`), not the 3D car model.
- **No design mockups exist for cars or the garage.** All 57 `docs/racing-shots` files and 33 `tests/screenshots` files are implementation captures. The only design mockups in the repo (`mockups/`) cover the practice/scholarship/college screens.
- Economy (cash, tokens, unlocks) is fully client-authoritative — a GPT-level security concern for any future leaderboard or ghost work.
- `racing3d.js` (procedural car system) is the highest-value, most extractable asset for the redesign; car and garage rules below mark where OpenCode/DeepSeek can safely do bounded work.

## Recorded decisions (product owner, Oct 8 2026)

1. **Garage sync (corrects this audit's first draft).** The cloud pull path applies the remote `garage` through the `DEFAULT_PROFILE` key loop; the client code is correct and must not change. The *actual* concurrency gap is server-side (`worker/index.js`, PUT `/api/progress` merge, ~170–176): concurrent updates merge `tokens` (max), `highScores` (per-key max), `favorites` (union), and `skillStats` (shallow merge), but **nested garage state** (`cash`, `unlocked`, `ownedKits`, `ownedWings`, `tune`) has no merge policy. GPT owns the garage conflict and migration policy.
2. **Vehicle policy.** Original fictional era/category archetypes only. Broad era/category inspiration is allowed; no manufacturer or model names, logos, badges, distinctive trade dress, exact body reproductions, protected liveries, or copied VDrift assets.
3. **Font licenses (queued).** Archivo, IBM Plex Mono, and Space Grotesk require verified official OFL copyright/license notices committed in a clear third-party-license location. No generic or guessed notices: record exact source, version, and copyright holder.
4. **Conversion order.** Do not transcribe all 15 cars. The trial package converts **one representative hero car** into GPT's schema; GPT validates it before authorizing the remaining mechanical conversions. The launch fleet is **ten cars**; legacy cars may need migration mappings but do not automatically belong to the launch fleet.

## 2. File map

| Path | Key symbols / sections (approx. lines) | Owns | Safe to extract later? | Important dependencies |
|---|---|---|---|---|
| `app.js` | `GAME_LIST` (~1900), profile keys (~1889–2195), `mergeAttemptHistory`/`cloud` (~4243–4350), `CAR_PAINTS` (~8999), `drawCustomCar` (~9048), `updateCarAudio` (~9198), `RacingGL` (~9242–9730), `NeonRacing` (~9731–10350), `DriftCircuit` (~10352–11140), garage UI (~11030–11160), arcade deep link (~11162), key routing (~11291) | Everything playable + economy + persistence | Medium — classes are cohesive but reference app globals (`$`, `saveProfile`, `showToast`, `cloud`, `profile`) | `workspace.js`, `redesign.js`, `racing3d.js` (not yet), worker API |
| `racing3d.js` | Loader (~1–40), renderer/tiers (~41–120), car builders/CARS data (~120–700), showroom (~700–800), `window.Racing3D` export (~803) | Standalone Three.js car system + showroom | High (self-contained, classic script) | vendored `vendor/three/*` |
| `vendor/three/three.min.js`, `postprocessing/*`, `shaders/*`, `objects/Sky.js`, `utils/BufferGeometryUtils.js` | — | Rendering library (r128, MIT) | N/A (vendored) | none |
| `SAT & ACT Practice.html` | Script tags, arcade overlay shell, garage modal hosts, canvas hosts | DOM shell | Low (shared by whole app) | app.js, redesign.js, workspace.js |
| `workspace.css` | `--fx-*` tokens, `#screen-test` styles, `.cc-*`, `.schl-*`, `.dg-*` garage styles | All app styling incl. garage | Medium (file is shared) | none |
| `redesign.css` | ring/home-card, college popup styles | Home/college visuals | Medium | none |
| `workspace.js` | Workspace glue (themes, zen, keyboard) | Practice shell | Low relevance | app.js |
| `redesign.js` | Home score card, profile hero, coin FX | Home/college UI | Not racing | app.js globals |
| `worker/index.js` | `/api/progress` (GET/PUT), `/api/ai`, `/api/auth/*`, `/api/help-history` | Account sync + tutor API | Handled by GPT (security) | D1, Google OAuth |
| `wrangler.toml` | Build chain + asset list | Deployment | GPT-owned | scripts/* |
| `tests/racing-behavior.cjs`, `tests/drift-ui.cjs` | see §7 | Racing regression gates | Yes (append-only style) | local server on :8899 |
| `scripts/expand-question-bank*.py`, `scripts/audit-question-bank.cjs` | Question bank pipelines | Practice data | Not racing | app.js data block |
| `docs/racing-shots/*` | 57 captures (see §6) | Visual evidence | N/A | — |

## 3. Existing car inventory (15)

Source: `DriftCircuit.CARS` (app.js ~10353) plus `CarPaints`, `WHEEL_STYLES`, garage defaults. All cars share the same paint palette (6 colors) and profile-level wheels/spoilers; **wheelbase and drivetrain fields are absent** (mark: absent).

| Key | Display | Era | Style (shape) | L×W | roofH | rear lights | Power | Grip | Weight | HB | Audio | Price | Default owned? | Weaknesses (from code/captures) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| sport | Sport Coupe | 2010s | curve | 40×20 | .90 | bar | 1.00 | 1.00 | 1.00 | 1.00 | six | 0 | yes | Generic silhouette; no per-car paint |
| hatch | 90s Hatch | 90s | hatch | 33×18 | 1.05 | dual | .92 | 1.02 | .86 | 1.05 | tiny | 800 | no | Boxy 2D sprite in racing path |
| gti | Hot Hatch GTI | 90s | hatch | 35×18 | .98 | tribar | 1.04 | 1.06 | .88 | 1.10 | tiny | 1800 | no | Almost identical to hatch |
| square | Square Sedan | Pre-90s | boxy | 42×20 | 1.08 | dual | .90 | .94 | 1.04 | .96 | six | 900 | no | Tall slab |
| muscle | Muscle V8 | Pre-90s | muscle | 46×24 | .86 | tribar | 1.28 | .90 | 1.16 | 1.05 | v8 | 1500 | no | Wide hips unmodeled in GL path |
| wedge | Wedge GT | Pre-90s | wedge | 45×20 | .68 | bar | 1.06 | 1.02 | .92 | 1.02 | six | 2600 | no | Pop-ups read only as boxes |
| panda | Panda Hatch | Pre-90s | boxy | 31×16 | 1.10 | dual | .98 | 1.00 | .84 | 1.18 | tiny | 3000 | no | Smallest; collisions clip visually |
| coupe90 | 90s Straight-Six | 90s | curve | 42×20 | .88 | quad | 1.16 | .96 | 1.02 | 1.12 | six | 2200 | no | Used as AI traffic in Neon |
| popup | Pop-Up Coupe | 90s | wedge | 40×19 | .80 | bar | 1.10 | .94 | .96 | 1.25 | turbo4 | 3600 | no | Turbo audio ↔ wedge mismatch per code comments? (audio tag only) |
| rotary | Rotary Coupe | 2000s | curve | 41×20 | .90 | quad | 1.22 | 1.06 | .92 | 1.14 | rotary | 5200 | no | No distinct rear |
| rally | Rally Sedan AWD | 2000s | sedan | 43×21 | .96 | dual | 1.24 | 1.14 | 1.08 | 1.08 | turbo4 | 4200 | no | “AWD” is a label — no drivetrain field |
| track | Track Coupe RS | 2010s | super | 43×23 | .84 | racetrack | 1.36 | 1.18 | .94 | 1.12 | exotic | 6200 | no | Duplicate rear with sport (racetrack vs bar) |
| straight | Turbo Straight-Six | 2010s | coupe | 43×21 | .88 | quad | 1.40 | 1.08 | 1.06 | 1.08 | turbo4 | 7200 | no | Overlaps coupe90 naming |
| ev | Volt Sedan EV | Modern/EV | ev | 45×21 | .94 | racetrack + lightBar | 1.44 | 1.16 | 1.12 | .94 | exotic | 8000 | no | EV uses “exotic” audio tag |
| hyper | Hypercar | Modern/EV | super | 47×24 | .70 | ylamp | 1.50 | 1.22 | .88 | 1.12 | exotic | 9000 | no | Identical style to `track` |

Notes: appearance in-game is profile-driven (paint/wheels/spoiler/decal/kit are the player's garage values applied to every car). Racing uses `raceCar`, drift uses `car` (`DriftCircuit.garage()`). Neon traffic uses three keys (`coupe90`, `rally`, `sport`).

## 4. Garage inventory

Single modal (`#driftGarage`, sections rendered in `renderGarage`, ~11030–11160).

| Section | Controls | Type | Immediate? | Evidence-based issues |
|---|---|---|---|---|
| Garage cash | Convert 1 token → $250; Convert all | Buttons | Yes (cash++ on click) | Cash amount also shown in top bar; conversion rate text-only |
| Cars (by era) | Grid of cars, price pills; buy via cash | Pills + 2D preview (`drawCustomCar`) | Purchase unlocks; selection instant | Preview is 2D top-down, not the 3D model; era grouping is the only filter |
| Paint | 6 swatches (`CAR_PAINTS`) | Color buttons | Yes | Swatch buttons rely on color alone (no label evidence in markup) |
| Wheels | 4 styles (`WHEEL_STYLES`), 5 colors (`WHEEL_COLORS`), size slider 0.8–1.3 | Pills + range | Yes | Range input has no aria-label in source |
| Body | 3 kits (`BODY_KITS`) incl. priced widebody | Priced pills | Yes | — |
| Decals | 5 (`DECALS`) incl. two-tone | Pills | Yes | — |
| Neon & sound | Neon color, neon mode, engine volume | Swatches/slider | Yes | Neon also toggles an in-render glow only in GL path |
| Driving | 4 sliders: power/grip/weight/handbrake (0.7–1.4 multipliers on tune baseline) | Range inputs | Yes (physics reads `g.tune`) | No explanation of what 1.00x baseline means; sliders unlabeled for screen readers |
| Tracks & camera | 6 tracks + sandbox lot; cameras chase/far (+ hood render path exists) | Pills | Yes | Camera pills list `['chase','far']` in UI code; `hood` accepted by migration but may not be offered |
| Theme / race mode | 5 themes; traffic vs circuit | Pills | Yes | Themes double as “weather” (see §9) |
| Save/account | `saveProfile()` + cloud queue; tokens/cash bank on exit | Text | Yes | Entire economy is client-side |

Purchase flow: `priced()` renders a pill with price; clicking with sufficient cash deducts and adds to `ownedKits`/`ownedWings`/`unlocked`. No confirmation dialog. Accessibility: many pills do carry `aria-pressed` (budget/theme/camera), sliders and swatches do not. Chromebook-sized screens: the modal stacks ~11 sections vertically; risk of long-scroll with keyboard-only navigation — not visually verified in this audit.

## 5. Mockup inventory

| Artifact | Path | Type | View / viewport | Defines car look? | Defines garage look? |
|---|---|---|---|---|---|
| Question screen export | `~/Downloads/Question screen-html.zip` (extracted during earlier work; not in repo) | Design mockup | Phone 390 | No | No |
| Scholarship lookup export | `~/Downloads/Scholarship lookup — desktop-html.zip` | Design mockup | Desktop 1440 | No | No |
| College comparison export | `~/Downloads/College comparison — desktop-html.zip` | Design mockup | Desktop 1440 | No | No |
| `mockups/college-merge.html`, `mockups/screens-pass-2.html` | repo `mockups/` | Design mockup | Desktop | No | No |
| `docs/VISUAL_PASS_REPORT.md` | repo | Visual-pass report (practice workspace + 3 screens; no racing) | Various | No | No |

**Conclusion:** earlier mockups did **not** give enough detail to build recognizable cars, and no garage mockup exists at all. The redesign's car/garage visual direction will be new ground; any future mockups need explicit car-sheet requirements (silhouette, lights, proportions) and a garage layout spec.

## 6. Screenshot inventory

| Location | Count | Contents | Type | Notes |
|---|---|---|---|---|
| `docs/racing-shots/` | 57 | `before-*`, `phaseA-*`, `phaseB-*` (chase/far/cockpit), `gen-<car>-{quarter,rear}` ×12 cars, `rear-<car>-{straight,quarter}` ×8, `three-*` showroom, `npc-lineup`, `dyn-wheelcheck`, `ads-layout-home` | Implementation captures | The `three-*` and `gen-*` files are the only place car appearance is documented; they are captures of procedural output, not mockups |
| `docs/screenshots/redesign/` | 15 | question/scholarships/college × 320–1440 | Implementation captures | Non-racing screens |
| `docs/screenshots/visual-pass/` | ~6 | workspace themes | Implementation captures | Non-racing |
| `tests/screenshots/` | 33 | arcade, college, routing, scholarships captures | Test artifacts | Non-racing |
| `~/Desktop/redesign-shots/` | 15 | Copies of redesign captures | Copies | Ephemeral |

Viewports: `gen-*`/`rear-*` are 1100×620; `three-*` 1240×700/1100×620; phase B shots 1280–1440 wide. None define garage appearance (garage screenshots exist only as old `before-garage.png`).

## 7. Test inventory

| Test | Proves | Does not prove | Redesign gaps |
|---|---|---|---|
| `tests/racing-behavior.cjs` (260 ln) | Neon: accelerate/brake/steer/score/traffic collisions; Drift: accel/steer/slip/score/grip/laps/touch; DPR, space contract, blur clearing, cash banking, stopAudio, all arcade games boot | Nothing about visual output, three.js path, ghost/leaderboard, mobile perf | Physics tweaks will need expectation updates; no GL pixel assertions |
| `tests/drift-ui.cjs` (174 ln) | 3D drift + racing boot, sandbox behaviors, garage v2 sections (finishes/kits/wheels/decals/themes/modes/handling/sounds), token conversion, spends, death/continue | Car shape/quality, cockpit camera rendering, purchase edge cases | Garage redesign will need a new UI test; counters here assert section counts (already updated to 3 cameras once) |
| `tests/arcade-logic.cjs` (218 ln) | Game registry and logic for all arcade games | Rendering | — |
| `tests/arcade-ui.cjs` (107 ln) | Menu routing, intro, HUD restart | Visual fidelity | Redesign of arcade cards will need selector updates |
| `tests/theme-routing.cjs` (76 ln) | Module transition card readability in 3 themes; drives practice to routing | Racing | — |
| `tests/redesign-ui.cjs` (200 ln) | Top tabs, ad-free practice, home card, Enter nav, arcade intro, HUD restart; clicks a practice choice then Check | Racing; car/garage visuals | Touch targets on garage not covered |
| `tests/workspace-layout.cjs`, `tests/visual-pass-shots.cjs` | Layout at widths; screenshot capture runs | Racing | Screenshot harness can be reused for car/garage captures |
| `tests/practice.test.cjs`, `variety`, `tutor`, `college*`, `scholarship*`, `subjects*`, `avatar-ui`, `college-gallery`, `contrast-audit` | Non-racing app behavior (profile/account-adjacent) | Racing | Garage schema changes must keep these green |

## 8. Profile and account inventory (read-only)

- Local keys: `satPrepProfile_v1` (~1889), attempts in `satPrepHistory_v1` (separate key, 120-entry cap).
- `DEFAULT_PROFILE` (~2195) contains `garage: null` plus the usual app fields; unknown keys from stored/remote profiles are preserved on load (~2200).
- Garage defaults (~10410): `v:3, cash:0, car:"sport", raceCar:"sport", unlocked:["sport"], paint, finish, wheels, wheelColor, wheelSize, neon, neonMode, spoiler, decal, number, kit, hood, bumper, handling, engineVolume, tune{power:.70,grip:1.35,weight:1.20,handbrake:1.00}, track:"oval", theme:"sunset", raceMode:"traffic", cam:"chase", ownedKits:["stock"], ownedWings:["none","lip"]`.
- Migrations present: v<3 legacy resets `tune`/`handling`; `spoiler` boolean → `"lip"/"none"`; `cam` whitelist (`chase/far/hood`). No other garage migrations.
- Cloud: `cloud` (~4252) GET/PUT `/api/progress`; server tracks `updatedAt`/`baseAt` to detect clobber; client tracks `dirty`/`syncedAt`. History is merged via `mergeAttemptHistory` (~4243) on both pull and post-push.
- **Correction (verified):** the pull path (~4299) applies every `DEFAULT_PROFILE` key from the remote profile, `garage` included, when the server copy is newer and the device has no unsaved edits. An earlier draft of this audit misread the second (custom-key) loop; that claim is withdrawn.
- **Flag for GPT review (actual gap):** the server-side concurrent-write merge (`worker/index.js` ~170–176) special-cases `tokens`, `highScores`, `favorites`, and `skillStats`, but nested `garage` state has no merge policy, so simultaneous devices can clobber garage progress. GPT owns the conflict and migration policy.
- **Security-sensitive:** cash, tokens, unlocks, and purchases are entirely client-side; future ghost/leaderboard work must not trust them.

## 9. Performance inventory

- Two render stacks: `RacingGL` (custom WebGL) with tiers `{0.72/240/cars 6/no shadows}`, `{0.92/320/cars 10/shadows}`, `{1.0/420/cars 16/shadows}` auto-selected by EMA frame time with cooldowns (~9242+); `racing3d.js` TIER `2/1/0` (pixelRatio ≤2/1.25/1, bloom & shadows tier-2 only, glass/interior/details degrade). Canvas-2D fallback exists when GL init fails.
- DPR: gameplay canvas caps devicePixelRatio at 2 (~4615); RacingGL scales by tier.
- Caps found: drift smoke 140, skids 360, racing smoke slice(-120); DriftCircuit PHYSICS `smokeMax:140, skidMax:360`.
- “Weather”: the five themes are visual settings (sky/ground palettes + fx); there is no weather simulation/particle system for rain/snow.
- Assets: no 3D models, no audio files, no textures — cars are procedural; engine sound is WebAudio oscillators (~9183–9198); fonts are 5 woff2 files (~65 KB). three.js is lazily injected by `racing3d.js` (~1–40) but is **not referenced by the games yet**; `app.js` is a single ~1.05 MB classic script (no code splitting).
- No measurement command exists that benchmarks without changing files, so none was run.

## 10. Asset and licensing inventory

| Asset | Path | License status |
|---|---|---|
| three.js + addons (r128) | `vendor/three/*` | MIT — LICENSE committed ✓ |
| Archivo (UI font) | `fonts/archivo-400-700.woff2` | OFL (Google) — **license text not committed** (uncertain) |
| IBM Plex Mono | `fonts/ibm-plex-mono-{400,500}.woff2` | OFL — **license text not committed** (uncertain) |
| Space Grotesk | `fonts/space-grotesk-{101,385,914}.woff2` | OFL — **license text not committed** (uncertain) |
| Engine/crash audio | none (WebAudio synthesis) | N/A ✓ |
| 3D models/textures/HDRIs | none | N/A ✓ |
| College/scholarship photos | `college-data.js`, `scholarships-data.js` | Wikimedia Commons with per-image `credit`/`license` recorded ✓ (vetted in data pipeline) |
| UI/render screenshots | `docs/**`, `tests/screenshots/**` | First-party captures ✓ |
| Emoji glyphs in UI | platform fonts | Rendered by OS; no asset shipped |

No racing assets are in a licensing gray zone except the three font families missing OFL notices.

## 11. Risks requiring GPT ownership

1. Client-authoritative economy (`cash`, `tokens`, `unlocked`) — blocks on any leaderboard/ghost design.
2. Concurrent-write garage merge gap (§8): server merges tokens/highScores/favorites/skillStats but not nested garage state — simultaneous devices can clobber cash/unlocks/kits/tune. GPT owns the policy.
3. Garage schema evolution (v4) — GPT must design migrations before OpenCode adds records.
4. Physics/tuning changes invalidate `racing-behavior.cjs` expectations — GPT owns the new baseline.
5. Three.js integration cost: `racing3d.js` + vendor is ~700 KB lazy payload; Chromebook perf policy needs GPU-tier decisions.
6. Copying risk vs real brands once cars become “recognizable” — needs an explicit silhouette/era policy (the repo already uses era archetypes; VDrift-style borrowing is prohibited).
7. Font licensing notices if fonts ship beyond OFL requirements.
8. Leaderboard/ghost security design (server-side validation, replay verification) — entirely GPT.

## 12. Suggested easy OpenCode work packages

All packages assume GPT has landed the referenced architecture first.

| # | Objective | Allowed files | Forbidden | Acceptance | Tests | Risk | Depends on |
|---|---|---|---|---|---|---|---|
| 1 | **Trial:** convert ONE representative hero car (GPT-selected) into GPT's approved schema, data-only | 1 new file GPT names (e.g., `car-data-v2.js`) | `app.js`, CSS, tests | Schema validates; values byte-identical to §3 for that car | Trial validation by GPT before any further conversion | Low | GPT schema + approved visual direction |
| 2 | **After GPT validates the trial:** mechanically convert the remaining launch-fleet cars (launch fleet = ten; legacy cars need migration mappings and are not automatically included) | Same data file only | Anything shared | GPT-validated template applied without deviation | Schema test | Low | Package 1 + GPT go-ahead |
| 3 | Add aria-labels/`aria-pressed` to existing garage sliders/swatches | `app.js` (garage render fn only) OR new small JS if GPT extracts | CSS, tests | Sliders announce name+value; swatches have color names | `drift-ui.cjs` stays green | Low | None |
| 4 | Implement repetitive garage cards from GPT's representative component | One component file GPT names | CSS unless GPT approves | Cards render in existing modal | Visual-pass shots at 390/1440 | Medium | GPT component |
| 5 | Add track metadata records (name, theme default, laps, sandbox flag) | Data file only | Physics code | All 7 tracks listed; sandbox flagged | `racing-behavior` green | Low | None |
| 6 | Maintain asset-license table (add rows as assets land) | This audit or a GPT-named doc | Everything else | Every asset has license+source | Manual review | Low | None |
| 7 | Run prescribed test subsets and report | none (executes) | File edits | Output pasted verbatim | `racing-behavior`, `drift-ui` | Low | Server on :8899 |
| 8 | Capture prescribed screenshots (chase/far/cockpit/garage at 390 & 1440) after GPT builds | none (writes only new PNGs to a GPT-named dir) | Existing screenshots | File set matches checklist | Visual-pass-shots harness pattern | Low | GPT build landed |
| 9 | Write tests from GPT's exact requirements (e.g., "purchase with insufficient cash shows no unlock") | `tests/` (new file only) | Existing tests | Test fails before fix, passes after | Self | Low | GPT spec |
| 10 | Update docs to reflect GPT's shipped behavior | `docs/` (GPT-named files) | Code | Docs match implementation | Manual | Low | GPT ship |
| 11 | Commit verified OFL notices for Archivo, IBM Plex Mono, Space Grotesk (exact source, version, copyright holder) into a clear third-party-license location | The license location GPT names + read-only checks of `fonts/` | Guessing license text; editing font binaries | Each font has its official notice with provenance recorded | Manual review against upstream OFL files | Low | Confirmation of exact upstream source/version |

## 13. Exact files inspected

Read (no modifications): `AGENTS.md`, `CLAUDE.md` (status only), `docs/QUESTION_BANK_IN_PROGRESS.md`, `app.js`, `racing3d.js`, `SAT & ACT Practice.html` (structure), `workspace.css`, `redesign.css`, `workspace.js` (symbols), `redesign.js` (symbols), `worker/index.js` (routes + `/api/progress` concurrent-merge block ~155–180), `wrangler.toml`, `college-data.js`/`scholarships-data.js` (field checks), `vendor/three/LICENSE`, `fonts/` (listing), `docs/VISUAL_PASS_REPORT.md` (head), `mockups/` (listing), `docs/racing-shots/` (listing), `docs/screenshots/**` (listing), `tests/screenshots/` (listing), `tests/{racing-behavior,drift-ui,arcade-logic,arcade-ui,theme-routing,redesign-ui,workspace-layout,visual-pass-shots}.cjs` (line counts), `git status --short`.

## 14. Exact files changed

- **Created and subsequently amended (same file):** `docs/DRIFT_RACING_SUPPORT_AUDIT.md` — amendments record the four product-owner decisions and correct the first draft's garage-sync claim (verified against `app.js` pull ~4293–4315 and `worker/index.js` ~155–180).

No existing file was modified, no test or build was run against the working tree, and no VDrift code or assets were copied, translated, compiled, or imported.
