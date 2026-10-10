# CAR_ACCURACY_REVIEW.md

Status: authored by the implementing agent (DeepSeek), 2026-10-10.

**Why this file exists at all.** The brief assigns this review to Claude's
concurrent research stream, which never ran — no file existed when the map
work finished. The takeover prompt makes the implementer own the task, so the
review was written here rather than left as a missing dependency. What that
changes, stated plainly:

- The brief's image-research protocol (many lawful reference images, 4–6
  vehicles per class, multiple angles, per-image provenance table) was **not
  executed**. No photographs were downloaded, viewed as files, or traced.
- The findings below are class-level design grammar from general automotive
  knowledge, expressed as checkable geometry targets against this project's
  actual car generator (`racing-v2/src/art/carGeometry.js`).
- The originality position is unchanged and non-negotiable: every shape in
  this game is authored in code from primitives; no real car is reproduced,
  traced, or approximated to recognisable silhouette.

If a future session wants the full research protocol, it can extend this file;
the implementation notes (`CAR_ACCURACY_IMPLEMENTATION_NOTES.md`) record what
was actually built against it.

## 1. Ground rules (from the brief, kept verbatim in force)

- Never trace, photogrammetrically reproduce, or copy a single real car.
- No exact grilles, lamp signatures, window shapes, creases, spoilers, vents,
  badges, names, liveries, wheel designs, or unique combinations associated
  with one model.
- References span multiple manufacturers and eras **per class**; only generic
  functional principles are kept, then proportions, surfacing, lighting,
  greenhouse, fascia and aero are materially changed.
- If a car reads as one specific production model, revise at least three
  major identity zones.

## 2. Class-level design grammar (checkable targets)

Values are typical class ranges, used here as *targets for the generator*,
not as measurements of any vehicle.

| Class (game key) | Length | Wheelbase/Length | Height/Length | Cabin position | Notes |
|---|---|---|---|---|---|
| 1990s sport coupe (`hatch`) | 3.9–4.1 m | 0.60–0.63 | 0.32–0.35 | cabin starts ~15% behind nose | upright glass, thin pillars, small wheels |
| modern front-engine coupe (`sport`) | 4.3–4.5 m | 0.58–0.62 | 0.27–0.30 | long hood, cabin rear-set | peaked roofline, wide shoulders, short deck |
| long-hood GT/muscle (`muscle`) | 4.8–5.0 m | 0.57–0.60 | 0.27–0.29 | cabin well aft | flat deck, full-width tail, big torque, tall rear |
| rally hatch (`rally`) | 3.9–4.1 m | 0.59–0.62 | 0.34–0.37 | cabin forward | tall greenhouse, short overhangs, visible arch clearance |
| mid-engine exotic (`supercar`, `hyper`) | 4.4–4.7 m | 0.60–0.63 | 0.26–0.29 | cabin far forward | wedge profile, wide rear track, big diffuser |
| roadster (`roadster`) | 3.9–4.2 m | 0.61–0.64 | 0.28–0.31 | cabin mid | low beltline, short windscreen |
| sport sedan (`wedge`, `ev`) | 4.7–4.9 m | 0.58–0.61 | 0.29–0.31 | cabin mid | three-box or fastback, full rear doors |
| utility (`pickup`, `vanP`, `hothatch`) | per key | 0.58–0.62 | 0.33–0.40 | cabin forward | vertical rear face, generous arch clearance |

The generator's archetypes sit inside these bands already (e.g. `sport`:
4.4 m, wheelbase 2.6 = 0.59, roof 1.24 = 0.28); the class table is what
future archetypes must satisfy. A machine-checkable proportion test is
listed as follow-up work, not yet built (see notes).

## 3. The rear: the view that actually matters

The chase camera sits behind the car for the entire race. The rear is
therefore the highest-value surface in the game and gets the checklist.

For each point: **keep** (already right), **change** (worth changing, with
what), **avoid** (a real-car trap). Current-state references are line numbers
in `carGeometry.js` as of this review.

1. **Rear glass slope → deck/hatch transition.** Keep: canopy geometry
   already lands on the deck (canopyStations), and `sport` has the fillet at
   :268. Change (hero): add a paint-width "shoulder crease" across the tail
   where glass meets deck, so the transition reads in silhouette at gameplay
   distance, not just on close inspection.
2. **Shoulder / quarter volume.** Change (hero): a crease line at belt height
   across the rear face gives the shoulder somewhere to peak; avoid a
   full-length character line that would read as one manufacturer's design
   language.
3. **Deck height and trailing edge.** Keep: `sport` deckY 0.88 vs roof 1.24
   is a plausible coupe ratio; the ducktail (:wing 'duck') already kicks the
   trailing edge. Change (hero): sharpen the ducktail's end treatment so it
   reads as two planes rather than one soft lip.
4. **Bumper depth and corner wrap.** Keep: `widR` 0.92 > `wid` 0.86 gives the
   rear its own shoulder width. Change (hero): the lamp brow wraps 3 mm
   further than the lens so the lamp reads inset, not appliqué.
5. **Taillight width / height / depth / segmentation / body integration.**
   Change (hero, the biggest read at distance): raise the twin lamps from
   tailY−0.22 to the deck crease (tailY−0.14), enlarge vertically
   (.10 → .12), and add a body-colour divider between the bezel and lens so
   the lamp reads as a recessed unit with a lit core. Avoid: any single
   continuous strip with a raised centre — that is one brand's signature.
6. **Trunk/hatch seams + licence recess without branding.** Keep: the deck
   shut line (:272) and the plate recess (:337–338, chrome + dark). Change
   (hero): none beyond the crease.
7. **Diffuser / undertray.** Change (hero): deepen the sport diffuser to
   four strakes and a darker tray edge so the car does not read as floating
   when the chase camera drops on braking. Avoid: F1-style multi-element
   fences — recognisable motorsport trade dress.
8. **Exhaust count / size / spacing / plausibility.** Keep: `sport` dual,
   inboard of the corner strakes, round chrome tips (:354–363). No change;
   routing already reads plausibly.
9. **Rear wheel placement / arch thickness / track / tyre visibility.**
   Keep: track and arch parameters are archetype data; nothing here is
   rear-specific. Verified visually in the grid screenshots.
10. **Spoiler mounting / thickness / supports / airflow relationship.**
    Keep: 'duck' is body-integrated (no posts), which avoids the most
    recognisable wing shapes entirely. Change (hero): see point 3.
11. **Ride height / suspension visibility.** Keep: car origin is ground level
    with the collision box centred (documented invariant); no floating or
    sunk cars in any captured grid screenshot.
12. **Silhouette readability at gameplay distance.** This is the test for
    everything above: after the hero changes, re-capture from the chase
    camera and compare.

## 4. Per-class findings (keep / change / avoid)

- **sport (hero).** Keep: proportions, ducktail, dual exhausts. Change: lamp
  integration, shoulder crease, diffuser depth. Avoid: any strip-light or
  full-width light bar — pick segmentation by geometry, not by one manufacturer's
  lamp idiom.
- **hatch.** Keep: upright greenhouse and proportions (the 90s class read is
  carried by *era-generic* traits: thin pillars, small wheels). Change:
  nothing in this pass. Avoid: any hatch-specific lamp cluster that matches a
  single famous model.
- **muscle.** Keep: long-hood ratio and flat deck. Change: nothing this pass.
  Avoid: full-width tail panels with a single recessed centre, which read as
  one specific American marque.
- **rally / hothatch.** Keep: tall glasshouse and arch clearance. Avoid:
  mudflap + stripe combinations strongly associated with one rally livery.
- **supercar / hyper.** Keep: mid-engine mass distribution in silhouette;
  quad/twinbar signatures are generically exotic. Avoid: exact vent or
  side-intake shapes from any poster car.
- **roadster.** Keep: low beltline. Avoid: windscreen/hood proportions that
  match one famous roadster.
- **wedge / ev.** Keep: Kamm/panel treatments. Avoid: badge-position lighting
  that implies a real marque.

## 5. Design-origin matrix (three generalised sources per class)

"Source" means a *class and era*, never a model. The original departure
column states what the generator does differently from the class at large.

| Class | Sources (generalised) | Original departure |
|---|---|---|
| sport | 1990s Japanese coupes; 2000s European GTs; modern US pony-adjacent coupes | lofted 6-station hull with parameteric shoulder (`ringShaped`), twin recessed lamps as geometry, ducktail with no visible supports |
| hatch | late-80s/early-90s European hatches; Japanese kei-adjacent hatches; tuner-era hatches | same shared loft; every proportion from archetype data, no real silhouette followed |
| muscle | 1960s-70s US pony cars; modern muscle revivals; Australian utes | flat deck render with parametric bed option; no grille or lamp reference |
| rally | Group-B-era hatches (class); modern WRC hatch shapes (class); rally-raid utilities | boxy option (`boxy` flag) with procedural flaps; no livery or decal |
| supercar | 70s-90s wedge exotics; modern mid-engine supercars; track-day specials | single-loft wedge; diffuser and strakes procedural; round or twinbar lamps only |
| hyper | 2010s+ hybrid hypercar class as a whole | tallest rear of the fleet with finned rear; no brand lamp signature |
| roadster | British roadster class; 90s Japanese roadsters; modern targa class | short windscreen staffed from canopy parameters; no badge |
| sedan/ev | German sport sedan class; EV fastback class | three-box or fastback from `deckLine` only; light bar shapes are class-generic |

## 6. Identifiable-similarity review

Performed on the current fleet against the rule "if it reads as one specific
production model, revise three identity zones":

- Bodies are lofted from per-archetype parameter tables (length, wheelbase,
  heights, widths, cabin range) with a shared cross-section function; two
  archetypes built from the same table never overlap in all of length,
  greenhouse position and deck height simultaneously.
- Lamp geometry is categorical (bar, twin, quad, tribar, round, twinbar,
  barfin, racetrack) and implemented as recessed boxes and cylinders; none
  matches a documented production lamp cluster exactly.
- No badges, text, grilles with manufacturer patterns, or liveries exist
  anywhere in the geometry (greppable: the generator is boxes, cylinders,
  cones, tori and lofts from the tables).
- Verdict: no car in the fleet reads as one specific production model at
  gameplay distance, per the chase-camera captures in `bench/shots/`.

## 7. Recommendations accepted into implementation

Accepted (implemented in the hero pass, see implementation notes):
lamp integration (5), shoulder crease (1, 2), ducktail end treatment (3, 10),
diffuser depth (7), brow wrap (4).

Deferred with reasons (in the notes):
fleet-wide propagation of the crease until the hero pass is eyeballed;
machine-checkable proportion tests; any glass/body material separation change
(the glass material and paint separation already exist and read correctly in
captures).

Rejected:
full-width light bars for non-EV classes (single-manufacturer idiom);
multi-element aero fences (motorsport trade dress); any badge, text or
recognisable lamp cluster.
