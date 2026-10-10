# Finish racing-v2

You are picking up a browser racing game that is built, integrated and
playable. Five specific things remain. Everything below is verified fact, not
assumption — where I measured something, the number is given.

**Repo:** `/Users/noahridley/Sat-and-Act-practice`
**Branch:** `racing-v2-foundation` (already checked out — do not switch)
**Last commit:** `9d86ebb`

---

## Use the skills

Your `~/.codex/AGENTS.md` already injects six coding skills on every request.
Read them; they are not decoration. Three matter especially here:

- **verification-loop** — the governing rule on this project is that a green
  build proves nothing. Three bugs already shipped past `tsc` and a clean
  build: a bundle that didn't execute, a React plugin that was never
  configured, and a compliance gate that passed having scanned zero files.
  **Measure the thing itself.**
- **error-handling** — this game is optional UI embedded in a study site. A
  failure in it must degrade to the old game, never throw into the page.
- **coding-standards** — match the surrounding code. It is heavily commented
  with *why*, not *what*. Keep that.

Also installed and relevant: **ui-ux-pro-max** (`--stack threejs`) for
rendering work. Note its data targets three 0.185 while this project is
pinned to **0.139** — take the principles, verify the APIs.

---

## Hard constraints — violating any of these fails the task

1. **Do not touch `app.js`, `worker/index.js`, `workspace.js`, `scripts/*.py`,
   `tests/screenshots/*`, or `docs/question-bank-*`.** They carry the
   operator's unrelated uncommitted work. `app.js` is 12k lines; the arcade is
   hooked from `racing/index.js` instead, deliberately.
2. **No new binary assets.** No mesh, texture, font or audio file. All art is
   generated in code. `racing-v2/tools/compliance-gate.mjs` enforces this and
   will fail your build. The only permitted binaries are six CC0 audio files,
   pinned by SHA-256.
3. **No modelling from photographs of real cars.** Industrial-design and
   trademark rights are separate from copyright, and `racing3d.js:3` and `:356`
   already claim publicly that the geometry is original. Generic proportions
   and automotive features are facts and are fine.
4. **Keep commits scoped to racing work.**

---

## The five remaining items

### 1. The wheels do not rotate — CONFIRMED, highest value

`racing-v2/src/player/Wheel.tsx`. The wheel group's rotation reads
`{x:0, y:0, z:0}` while the car is at 100+ km/h. Verify yourself:

```bash
cd racing-v2 && node bench/serve.cjs &      # serves dist at /racing-v2/ on 8901
# then drive and read window.__rv2wheel() — a probe is already wired in
```

The wheels are `useCompoundBody` kinematic cylinders whose refs are handed to
`useRaycastVehicle`'s `wheels` array. cannon's worker is supposed to write
their transforms. Suspect the ref identity: they are `createRef()` objects
inside a `useRef([...])`, so the array is stable but check that is actually
what `useRaycastVehicle` binds against in @react-three/cannon 6.3.
Compare with `vendor/pmndrs-racing-game/src/models/vehicle/Vehicle.tsx`,
which does this correctly.

A car whose wheels do not turn reads as broken immediately, so fix this first.

### 2. The car is hard to hold at the limit

The AI plan corner speeds from a braking horizon; the player gets no help at
all, so the skill floor is high for a game embedded in a study app.

Measured context: circuit 595 m, tightest radius 13.2 m, longest straight
111 m, slowest corner 48 km/h at full grip, straight-line peak 106 km/h.
`maxSpeed` is 32 m/s. Re-run `node tools/run.mjs tools/speed-envelope.mjs`
if you change the track.

Suggestion, not prescription: a light steering/braking assist that can be
turned off, or widen the tightest corners. If you widen the track, you MUST
re-run `tools/line-check.mjs` (it guards against corners tighter than the
AI's `KMAX_DEMAND` floor of 11.1 m) and `tools/calibrate-corner-budget.mjs`
(which re-measures `CORNER_BUDGET`; it is currently 0.30 and that number is
only valid for the current geometry).

### 3. Crash audio ships but never plays

`crash.mp3` is in the bundle and hash-pinned, but nothing triggers it. Wire it
to actual collision events on the player chassis. @react-three/cannon exposes
`onCollide`. Gate it on impact velocity so light kerb contact does not machine-gun
the sample, and respect the existing edge-trigger pattern in
`src/player/Vehicle.tsx` (one-shots fire on a transition, never per frame).

Note: `public/sounds/PROVENANCE.md` says "ship what is used". If you decide
crash audio is not worth wiring, **remove the file and its hash from the
allowlist in the same commit** — do not leave a shipped asset unused.

### 4. Leaderboard persistence

`racing-v2/vendor/pmndrs-racing-game/src/data.ts` has
`TODO(local-leaderboard)`: `getScores()` returns an empty array. Supabase was
stripped deliberately — **do not reintroduce a backend.** This is a
student-facing study app: local only.

`localStorage` is appropriate here, but read `src/ui/Hud.tsx` first — the live
HUD is updated imperatively from rAF on purpose, and the leaderboard is part
of it. Persisted best times belong with the finish screen, which is ordinary
React state.

### 5. Checkpoint and sector timing

Nothing exists yet. `src/ai/racingLine.ts` gives distance along the line, and
`src/player/useLapTracker.ts` already tracks unwrapped progress, so sectors
are a matter of splitting the circuit and timing the crossings.

Laps are defined as **full circuit lengths of net travel**, not line
crossings — that is deliberate (fair for a staggered grid, and immune to the
finish-line oscillation that broke the first implementation). Keep that
definition; `tools/lap-check.mjs` asserts it.

---

## Things that will bite you

These each cost real debugging. Do not undo them.

- `manualChunks` splits **only three.js**. Splitting React (CommonJS) breaks
  its interop init order: the bundle builds clean and dies on load with
  `Cannot read properties of undefined (reading 'exports')`.
  **Load the production bundle in a browser after touching chunking.**
- `@vitejs/plugin-react` is required. Without it Vite uses the classic JSX
  transform and the bundle throws `React is not defined` despite `tsc` passing.
- **`import.meta.url` does not work here** — Vite rewrites it to
  `self.location`, which is the page, not the module. Asset paths come from the
  host via the `assetBase` mount option. Every sound 404'd because of this.
- `import()` needs an **absolute** URL. A bare relative path is treated as a
  module specifier and rejected; this silently disabled the entire feature once.
- **Two yaw conventions.** AI opponents drive along local **+X**; the player's
  raycast vehicle along **+Z**. Both are named functions in
  `src/ai/gridSlots.ts` with the derivation written down. Mixing them put the
  player 90° across the track and was reported as "the controls are backwards".
- The player engine force is **negated** on purpose. The mesh faces +Z, cannon
  drives this chassis toward −Z. `bench/forward-test.cjs` proves it.
- Car meshes are offset down by half the collision box: `racing3d.js` builds
  cars with their origin at **ground level**, cannon boxes are centred.
- Root `.gitignore` must stay `/public/` (anchored). Unanchored it swallows
  `racing-v2/public/` and a fresh clone cannot build the game.

---

## Verification — required before you report done

Run all of it. Report real output, including failures.

```bash
cd racing-v2
npx tsc --noEmit && npm run build

for h in rng-parity line-check plateau-check determinism-check lap-check \
         orientation-check driver-cost race-sim seed-spread speed-envelope; do
  node tools/run.mjs tools/$h.mjs
done
node tools/compliance-gate.mjs            # must PASS — it is ship-blocking

node bench/serve.cjs &                     # :8901
node bench/forward-test.cjs                # W nose-first, S reverse
node bench/offtrack-test.cjs               # grass must be slower than tarmac
node bench/frame-bench.cjs                 # HEADED = real GPU. Must stay 60fps.

cd .. && python3 -m http.server 8899 &
for t in racing-ai racing-physics racing-fixed-step racing-ghost racing-tracks \
         racing-session racing-behavior racing-render racing-v2-flag \
         racing-v2-arcade; do
  BASE_URL=http://127.0.0.1:8899 node tests/$t.cjs
done
```

Baseline you must not regress: **11/11 harnesses, 10/10 racing tests, tsc
clean, compliance gate passes, 16.7 ms p50 (60 fps) at 12 opponents on real
GPU hardware.**

`bench/frame-bench.cjs` runs **headed** by default because headless Chromium
falls back to SwiftShader, where an empty grid already costs ~100 ms a frame.
Those numbers are meaningless in absolute terms. It prints the renderer string
— check it says HARDWARE before quoting any figure.

**Take a screenshot and look at it.** Three bugs in this project were invisible
to every automated check and obvious the moment someone looked at the running
game: cars cartwheeling off the grid, a car with eight wheels, and every car
floating half a box above its own wheels.

---

## Reporting

State what you fixed, what you measured, and what you did not finish. If
something is still broken, say so with the output. Do not claim done on
unmeasured work, and do not loosen an assertion to make a test pass.
