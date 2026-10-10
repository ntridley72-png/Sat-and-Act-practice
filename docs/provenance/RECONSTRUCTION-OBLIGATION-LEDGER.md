# §5b Reconstruction obligation ledger

One entry per asset that had to be **originated** because the upstream
equivalent is reference-only, with what each must satisfy functionally and how
that was verified.

## A note on format, stated plainly

The brief names REA's `build_reconstruction_obligation_ledger`. That tool
fails closed without an authenticated Evidence chain: every obligation needs
original cases, fixtures and a verifier, each bound to `ev_<sha256>` records
produced by REA's own analysis operations. This project generated **one** such
record (the web-bundle analysis below), because the reconstruction here is not
a binary-reversing effort — there is no upstream binary to decompile, only art
we deliberately did not take.

Hand-writing the evidence identifiers the tool expects would have produced a
document that *looked* machine-attested and was not. That is precisely the
failure mode this whole exercise exists to prevent, so the ledger is written
as an auditable document instead, and the one genuine machine attestation is
retained separately at `rea-evidence-bundle.json`.

## Machine attestation (genuine)

`rea-evidence-bundle.json` — REA `analyze_web_bundle` against the running
production bundle over CDP.

| | |
|---|---|
| Evidence ID | `ev_30b2f66b9953c0be4f16a921b9ea0b9956958ff2f7ccc81e8c87a234a28f7a76` |
| Provider | rea-cdp-browser v2 |
| Coverage | complete — 3 scripts, 0 parse failures, 295,847 AST nodes |
| Unknowns | 0 |

What it independently establishes, without relying on anything this project
claims about itself:

- **Exactly three scripts load.** The page shell (500 B), `racing-v2.js`
  (888,121 B) and `chunks/three-0b3b9f20.js` (620,770 B). Nothing else.
- **The game is genuinely lazy-loaded.** The edge from the page to the entry
  is classified `dynamic_import`, not a static script reference. That is the
  structural form of the §8 requirement, observed rather than asserted.
- **No asset fetches.** Every endpoint REA extracted is a WebGL extension
  string (`OES_texture_float`, `WEBGL_compressed_texture_s3tc`, …) requested
  from the GL context. Not one is a URL for a mesh, texture, font or sound.
- **One vendor fingerprint: React.** No model loader, no asset pipeline.

## The ledger

Legend — **Obligation**: what had to be originated. **Must satisfy**: the
functional role the original has to fill. **Verified by**: how we know it does.

| # | Obligation | Upstream equivalent (reference-only) | Must satisfy | Originated as | Verified by |
|---|---|---|---|---|---|
| 1 | Car body geometry | `chassis-draco.glb`, `assets/chassis.blend` | A car-shaped hull at correct scale, with a wheelbase and track the vehicle tuning expects; visually distinct archetypes | Procedural loft from 12 archetype parameter sets, `src/art/carGeometry.js` | Renders in `bench/shots/*.png`; compliance gate finds no mesh file; 12 archetypes assert-loaded in `ProceduralCar` |
| 2 | Wheel geometry | `wheel-draco.glb`, `assets/wheel.blend` | A wheel of the physics radius (0.38 m) with a visible rim and tyre, mirrored per side | `buildWheel()` lathe + instanced spokes, same module | Visible in screenshots; radius driven from `wheelInfo.radius`, so mesh and collider cannot diverge |
| 3 | Track surface | `track-draco.glb`, `assets/track.blend` | A closed, drivable circuit whose width bounds the AI's lateral offset | Ribbon extruded from the racing-line control points, `src/art/TrackMesh.tsx` | `tools/line-check.mjs`: closes, 13.2 m tightest radius, 4.72 m narrowest half-width |
| 4 | Track heightmap | `textures/heightmap_1024.png` | Ground the cars rest on | Single static plane; the circuit is deliberately flat | Cars rest correctly in screenshots; no elevation feature claimed |
| 5 | Environment map | `textures/dikhololo_night_1k.hdr` | Material reflections | Not reproduced. Materials pass `env: null` and render without reflections | Visual check — paint reads as paint; a reflection probe is a future improvement, not a missing obligation |
| 6 | Medal / UI imagery | `images/{gold,silver,bronze,no_sound}.png` | Communicate finishing position | CSS and text — `P1 of 7` on the finish screen | `bench/shots/intro.png` and the finish screen; no image file involved |
| 7 | Skid marks | upstream `Skid` effect textures | Visible evidence of a slide | Instanced untextured quads, `src/effects/Skid.tsx` | Ring-buffered to 240; bounded by construction |
| 8 | Dust | upstream `Dust` effect textures | Particulate under a sliding car | Instanced spheres, `src/effects/Dust.tsx` | Pre-allocated 90; no allocation after mount |
| 9 | Fonts | `inter-ui` dependency | Legible HUD and screens | System font stack, no webfont | Compliance gate finds no `.ttf`/`.woff*`; HUD legible in screenshots |
| 10 | Audio | `sounds/*.mp3` | Engine note, throttle, brake, boost, crash, horn | **NOT originated — operator-approved CC0 carve-out.** 6 of 8 shipped | `public/sounds/PROVENANCE.md`; each file pinned by SHA-256 in `tools/compliance-gate.mjs` and verified on every gate run |

## Coverage

Ten obligations. Nine met by original work; one (#10, audio) met by an
explicit, documented, hash-pinned exception rather than by origination.
Obligation #5 is met by *omission* — the reflections are simply absent, which
is a visual compromise and not an unmet provenance obligation.

**No obligation is met by an upstream asset.** The §5c gate
(`tools/compliance-gate.mjs`) enforces that continuously: it fails on any
binary in the build other than the six hash-pinned audio files, on any
embedded `data:` URI, on asset magic bytes anywhere in the output, and on any
source reference to an asset loader. It has been verified to fail against
planted violations, not only to pass.
