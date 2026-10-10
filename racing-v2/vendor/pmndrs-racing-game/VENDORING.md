<!-- ===================================================================
     VENDORED THIRD-PARTY SOURCE
     Upstream: https://github.com/pmndrs/racing-game.git
     Commit:   7816a5d954b75e6ad853ae4e4f0cbbd628072643
     Branch:   main
     Date:     2023-02-01 11:40:41 +0100
     Subject:  "fixes #202; Fixing sound bug happening after used editor."
     Licence:  MIT — see LICENSE.md in this directory
     Vendored: 2026-10-10, code only. No upstream assets. See below.
     =================================================================== -->

# Vendored: pmndrs/racing-game

Upstream source, pinned and vendored (not a submodule) so this build stays
reproducible if upstream moves or disappears.

| | |
|---|---|
| Upstream | https://github.com/pmndrs/racing-game.git |
| Commit | `7816a5d954b75e6ad853ae4e4f0cbbd628072643` |
| Commit date | 2023-02-01 11:40:41 +0100 |
| Commit subject | fixes #202; Fixing sound bug happening after used editor. |
| Upstream history at pin | 515 commits |
| Code licence | MIT (`LICENSE.md`, "Copyright 2021 pmdrs, contributors") |
| Upstream asset licence | CC0, per upstream README: "CC0 assets only" |

To re-derive this directory:

```bash
git clone https://github.com/pmndrs/racing-game.git
cd racing-game
git checkout 7816a5d954b75e6ad853ae4e4f0cbbd628072643
```

## Why the licensing here is mixed, and what that means

Three different licences apply to different things in this project, and
conflating them would be a real problem rather than a pedantic one.

**1. Upstream code — MIT.** MIT permits use, modification and redistribution,
including commercially, on one condition: the copyright notice and permission
notice must be retained. That is why `LICENSE.md` sits in this directory
unmodified, and why this file records the URL and commit. That obligation is
satisfied here even though the surrounding repository is CC0, because MIT's
notice requirement attaches to this code regardless of what licence the host
project uses.

**2. This repository — CC0 1.0.** The project that contains this directory is
dedicated to the public domain. CC0 and MIT coexist without conflict: MIT is
permissive, not copyleft, so vendoring it imposes no copyleft obligation on the
rest of the repository. A GPL or AGPL dependency *would* have conflicted, and
for that reason GPL-licensed reference projects were rejected during the
licence audit (see `docs/provenance/LICENSE-AUDIT-reference-games.md`).

**3. Upstream assets — CC0, and deliberately almost entirely NOT USED.**

This is the part most likely to be misread by a future reader, so it is stated
plainly: **MIT grants the code. We chose not to take the art.**

Upstream's assets are CC0 and could lawfully have been shipped. They were
excluded anyway, as a project policy decision, for reasons that are about
product and risk rather than about the licence:

- Cars and tracks in this project are generic archetypes with no badges, no
  real marque, no real track name and no distinctive real-car trade dress.
  Trademark and industrial-design rights are **separate from copyright**: a CC0
  model of a real car grants no rights in that car's brand or design. Authoring
  original geometry avoids the question entirely.
- `racing3d.js` already states publicly, at lines 3 and 356, that its geometry
  is procedurally generated with "original body shapes, no third-party models"
  and "original designs on generational archetypes". Shipping imported meshes
  would falsify a claim this project already makes.
- Procedural geometry keeps the lazily-loaded bundle small, which is a hard
  requirement: a student who never opens the game must download neither
  three.js nor any asset.

### What was excluded from this directory

Not vendored, and not committed anywhere in this repository:

| Excluded | Why |
|---|---|
| `public/models/*-draco.glb` (chassis, track, wheel) | third-party geometry — reference-only |
| `assets/*.blend` (chassis, track, wheel) | third-party geometry source — reference-only |
| `public/textures/heightmap_1024.png` | track geometry data — reference-only |
| `public/textures/dikhololo_night_1k.hdr` | environment map — replaced procedurally |
| `public/images/{gold,silver,bronze}.png`, `no_sound.png` | UI art — replaced with original |
| `thumbnail.webp` | upstream marketing image, not needed |
| `.github/`, `.husky/` | upstream CI and git hooks, would fight this repo's tooling |

Those files may be **measured** for conventions — scale, wheelbase and track
ratios, pivot placement, axis orientation, unit scale, material slot naming,
spline control-point spacing, corner radii, elevation change, sector pacing and
width — because facts and measurements are not copyrightable. Measurements are
recorded separately. Geometry is never exported, decimated, remeshed or traced.

### The one carve-out: audio

Eight upstream sound files **are** used, as an explicit, operator-approved
exception, recorded here so it is auditable rather than silent:

```
accelerate.mp3  boost.mp3  crash.mp3  engine.mp3
honk.mp3        tire-brake.mp3  train.mp3  water.mp3
```

They are CC0 — the lowest-risk asset class there is: no attribution
requirement, no copyleft, and commercial use permitted, which matters because
this site is ad-supported. Original engine audio is genuinely hard to author,
and the carve-out was granted on that basis.

**Consequence for the compliance gate:** these eight files are the *only*
third-party binaries expected in the production bundle. Any other binary asset
reaching the build is a gate failure, not a judgement call.

(Note: the operator's brief listed this set as "brake"; the actual upstream
filename is `tire-brake.mp3`. Same file, eight total.)

## Modifications from upstream

Changes made to this vendored code are recorded in `MODIFICATIONS.md` in this
directory, so the diff against the pinned commit stays legible. Summary of
intended removals, per project policy:

- **Supabase** (`@supabase/supabase-js`) and `src/ui/Auth.tsx` — removed
  entirely. This is a student-facing study app; no third-party backend and no
  auth. The leaderboard is local-only.
- **leva** and `src/ui/Editor.ts` — kept out of the production bundle
  (dev-only flag at most).
