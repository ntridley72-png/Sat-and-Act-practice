# Drift car rear-end mockups

Three design directions generated with the built-in image-generation tool.
These are visual targets, not screenshots of implemented game assets. No game
code, physics, garage data or deployment was changed for this request.

| Option | Real-car inspiration | Main details | Relative modeling effort |
| --- | --- | --- | --- |
| 01 Box Coupe | Nissan Skyline R34 | Square shoulders, four round lamps, straight wing, paired exhaust | Low–moderate |
| 02 Round Coupe | Mazda RX-7 FD | Rounded shoulders, dark lamp panel, oval lamps, shallow trunk lip | Moderate |
| 03 Compact Classic | BMW E30 | Upright cabin, flat trunk, segmented rectangular lamps, black bumper | Lowest |

Use original fictional names and omit manufacturer badges. Inspiration is in
proportions and styling, not a claim of licensed car assets.

## Practical implementation boundary

The existing `ProceduralCar.tsx` and `carGeometry.js` already assemble lofted
bodies/canopies and primitive-mesh lights, wings, trim and exhausts. Reuse those
builders and the existing wheels/materials. Option 03 needs the least new
curvature; option 01's lamp/wing primitives are straightforward; option 02
needs more careful body-station and canopy adjustments.

Keep silhouettes, lamp placement, bumper separation and wheel proportions.
Do not promise these generated images' exact shadows, reflections, ground
texture or visible interior hints in-game. Interior detail should be omitted;
rim detail should reuse the existing wheel builder. Geometry budgets requested
in the image prompts are design constraints, not measured model counts.

Before implementation, select a direction. Start with one hero car and verify
it in the real rear chase camera. No physics or account-schema changes are
needed for a visual-only conversion.

## Prompt set

Common generation brief: landscape low-poly procedural browser-game car design
sheet; one large rear/chase view and one smaller rear three-quarter view of the
same car; plain parking lot in neutral daylight; simple body loft, opaque glass,
low-sided wheels, primitive-mesh details, restrained reflections and shadows.
No badges, decals, elaborate diffuser, photorealism or AAA-rendering promise.

1. **Box Coupe:** original blue R34-inspired squared coupe, four circular red
   lamps in black housings, black lower bumper inset, two exhausts on the left,
   straight wing on two supports. Text: `01 — BOX COUPE`; footer:
   `Simple body loft · circle lamps · box wing`.
2. **Round Coupe:** original red FD-inspired low coupe, gently faceted curved
   shoulders, dark rear lamp band, four oval red lamps with white reverse lamps,
   sloping canopy, shallow lip, simple bumper and exhausts. Text:
   `02 — ROUND COUPE`; footer: `Shallow body curves · oval lamps · lip spoiler`.
3. **Compact Classic:** original off-white E30-inspired two-door sedan, upright
   canopy and flat trunk, amber/red/white rectangular lamp clusters, black
   bumper band and shallow lip, left paired exhausts. Text:
   `03 — COMPACT CLASSIC`; footer: `Box body · segmented lamps · black bumper`.

Images were inspected for consistent rear/three-quarter silhouettes and
distinct light signatures. The generated lighting is illustrative. All three
PNG files are preserved alongside this brief, awaiting user selection.
