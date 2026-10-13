# Task: implement three drift car designs + fix the loading UI flash

Branch: `task/drift-car-rears` (checkpoint from `racing-v2-foundation` @ ade9781).
References: `docs/mockups/drift-car-rears-2026-10-13/` (01 Box Coupe, 02 Round
Coupe, 03 Compact Classic).

## Ownership ledger

| File | Owner | Status |
|---|---|---|
| `racing-v2/src/art/carGeometry.js` | DeepSeek | in progress |
| `racing-v2/src/art/carGeometry.d.ts` | DeepSeek | in progress |
| `racing/index.js` (`V2_ARCHETYPES` only) | DeepSeek | in progress |
| `SAT & ACT Practice.html` (startup only) | Codex | delegated |
| `workspace.js` / `workspace.css` (startup only) | Codex | delegated |
| `redesign.js` / `redesign.css` (startup only) | Codex | delegated |
| `racing-v2/src/art/ProceduralCar.tsx` | untouched unless required | — |
| `racing-v2/src/player/*` | untouched | — |
| everything else | untouched | — |

Model mapping (no id/name/price/physics changes):
- `straight` (Longline Turbo) -> new `boxcoupe` archetype
- `rotary` (Vellum RX) -> new `roundcoupe` archetype
- `coupe90` (Meridian Six) -> new `compactclassic` archetype

## Deliverables

1. Three archetypes + light signatures (`quadround`, `ovalbar`, `segments`),
   a straight two-support wing, left-paired exhausts, black bumper/rub-strip
   options, per the mockup README's implementation boundary.
2. Startup-flash fix with early-frame regression evidence (Codex).
3. Real game renders per car (rear chase, front 3/4, rear 3/4, side, plus one
   gameplay shot), desktop/tablet/phone checks.
4. Verification: typecheck, build, garage-check, heading-check, drift sandbox,
   arcade, recovery, flags, garage, economy suites.
5. Handoff + expansion plan; NO deployment without separate authorization.

## Constraints

Fictional names only; no badges, no ripped assets. No physics or persistence
changes. Preserve paint/finish/spoiler customization. Keep render cost
proportionate (cached shared geometry per archetype).
