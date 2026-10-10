# CAR_ACCURACY_IMPLEMENTATION_NOTES.md

What was actually built against `docs/CAR_ACCURACY_REVIEW.md`, what was
rejected, and how it was verified. Companion to the review; read that first
for the design grammar and the originality rules.

## Scope

One hero car: `sport` (the default player archetype and the most common
opponent). The brief's rule — "start with one hero car, verify it from
multiple gameplay angles, and only then propagate" — is followed literally:
nothing was propagated to the fleet in this pass, because after iteration the
surviving changes were judged sport-specific rather than fleet-wide
improvements. That decision is recorded here, not buried.

## Method

1. Captured the shipped rear from the game's own chase camera before any
   change (`bench/shots/hero-rear-before.png`, a 3x zoom of the sport car's
   tail from `apex-flats-grid.png`).
2. Implemented the review's accepted items in `src/art/carGeometry.js`
   (sport-guarded branches).
3. Rebuilt, re-captured, compared at the same zoom
   (`bench/shots/hero-rear-after.png`).
4. Rejected anything that looked worse. Two full approaches died here (below).
5. Ran the verification suite and re-captured all six tracks.

## Accepted and implemented (final state)

- **Lamp height/scale:** lens 0.10 → 0.11 tall, otherwise unchanged position.
  The review's proposal to raise the lamps to the deck crease was tried and
  rejected (see below); the surviving change is the conservative half.
- **Chrome light catcher** under each sport lamp (`carGeometry.js`, 'twin'
  branch): a 2 cm chrome sliver giving the tail a lit lower edge from the
  chase camera's downward view. New geometry; no silhouette change.
- **Diffuser depth (sport):** tray deepened (0.18 → 0.20) and two extra
  strakes added, plus a dark tray edge, so the car does not read as floating
  when the camera drops under braking.
- **Ducktail end caps (sport):** small paint caps at the ducktail's outer
  ends sharpen it into two planes instead of one soft lip.

## Rejected during verification (with the evidence)

These are the honest failures of this pass. All three looked plausible on
paper and were caught by the screenshot loop:

1. **Lamps raised to the deck crease (tailY−0.14).** The chase camera looks
   *down* at the car; at the crease the lamps hid under the rear glass. The
   gameplay camera, not a level product shot, is the judge here.
2. **"Recessed lens behind a proud bezel."** A box has no hole: the bezel's
   front face simply covered the lens and the lamps stopped glowing — a
   functional regression of the one element (lamp readability) the game most
   needs at distance.
3. **Proud paint creases across the tail.** Metallic paint slivers reflecting
   a dark environment rendered as black tape, not highlights.

Also rejected from the review's proposals, before implementation:
- Full-width connecting light bars for non-EV classes (single-manufacturer
  idiom; the review's avoid-list).
- Any fleet-wide crease treatment: it cannot be validated across eight
  silhouettes at chase-camera distance within this pass, and the rule is
  "verify one, then propagate" — not "propagate hopefully".

## What "verified from multiple gameplay angles" means here

- The zoomed before/after pair above (grid, camera high behind).
- `bench/shots/apex-flats-drive.png` (mid-drive, camera lagging at speed),
  and the other five tracks' `-grid`/`-drive` captures, all re-shot after the
  final build.
- Zero page errors in every capture run; the detail builder's try/catch in
  `ProceduralCar.tsx` means a failure would degrade to a plain body rather
  than break the game, and no capture shows that state.

## Limitations (stated, not hidden)

- The brief's full image-research protocol was not executed (no reference
  images; see the review's authorship note). This is a design-grammar pass,
  not an image-study pass.
- Only `sport` changed; the other archetypes keep their shipped geometry.
- Fleet-wide proportion checks (wheelbase/length, height/length bands from
  the review's table) are candidates for a machine-checkable harness; not
  built in this pass.
- Rear visibility of the diffuser changes depends on ride height and camera
  angle at speed; the driven captures are the evidence, and they are shipped
  as they were shot.
