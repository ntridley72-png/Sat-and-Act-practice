# §4 License audit — candidate reference games

Audited 2026-10-10. Read **only** LICENSE files, READMEs, credits, and file
*names* (via the GitHub trees API). No source and no asset bytes were read from
any repository below. Rejected repos were not read at all beyond their licence.

Method per repo: (1) code licence + the file it came from; (2) asset licence
verified **separately**; (3) asset class; (4) whether CREDITS/CONTRIBUTING/README
reveal third-party asset imports the top-level licence does not cover; (5) verdict.

Governing constraints: this repo's LICENSE is CC0 1.0, and the site is
ad-supported (`ads.js`, `ads.txt`) and therefore commercial. Copyleft code and
non-commercial assets are both disqualifying.

---

## 1. ryancampbell/kart-royale — REFERENCE-OK (highest value)

- **Code licence:** MIT — `LICENSE`, confirmed via `repos/.../license` API.
- **Asset licence:** n/a — **there are no assets.**
- **Asset class:** none. README claims "No art assets… every mesh, texture,
  sound and [font] procedural". **Verified independently:** 115 files in tree,
  2 binaries total, both `docs/hero-*.png` screenshots. Zero runtime art,
  audio, or font files.
- **Credits/third-party imports:** no CREDITS or CONTRIBUTING file; no
  third-party asset imports possible given the above.
- **Verdict: REFERENCE-OK.** Nothing to taint a CC0 commercial build.
- **Caveat:** README describes it as "Mario Kart-style". Game mechanics and
  ideas are not protectable, but Nintendo trade dress is. Study the technique;
  do not reproduce distinctive Nintendo visual identity (§1).
- **Relevance:** TypeScript, procedural art, `src/game/AI.ts` racing-line AI,
  raycast suspension with a slip-angle tyre model, WebAudio synthesis stack.
  Aligns with every decision taken for this task.

## 2. mrdoob/Starter-Kit-Racing — REFERENCE-OK

- **Code licence:** MIT — `LICENSE`, confirmed via API.
- **Asset licence:** CC0 — README `## Credits`: "Game assets by Kenney (CC0)".
  Kenney is a long-established, legitimate CC0 asset author.
- **Asset class:** CC0. 16 binaries (`.glb`, `.png`, `.ogg`).
- **Credits/third-party imports:** README credits Kenney and nothing else.
- **Verdict: REFERENCE-OK.** Assets would even be shippable under CC0, but §1
  keeps this project reference-only regardless.
- **Caveat:** the CC0 status is a README assertion, not a per-file licence. If
  any Kenney asset were ever to be shipped, verify it on kenney.nl first.

## 3. BKcore/HexGL — REFERENCE-OK for code; ASSETS NOT CLEARED

- **Code licence:** MIT — `LICENSE`, confirmed via API.
- **Asset licence:** ambiguous by design. README: "**Unless specified in the
  file**, HexGL's code and resources are now licensed under the MIT License."
- **Asset class:** nominally MIT, but the per-file carve-out means exceptions
  may exist. 100 binary assets in tree; all 100 have **not** been verified.
- **Credits/third-party imports:** not enumerated in the README.
- **Verdict: REFERENCE-OK for code and conventions only. Assets NOT cleared** —
  per-file verification of all 100 would be required before any asset use.
- **Note:** a futuristic hover racer, so of limited relevance to car feel.

## 4. Mati365/micro-racing — code reference-OK; ASSETS REJECTED

- **Code licence:** MIT — `LICENSE.md`, confirmed via API.
- **Asset licence:** **NOT covered by the top-level MIT.** The README enumerates
  third-party asset sources:
  - `free3d.com` models (x2) — free3d licences vary per model and are frequently
    "Personal Use Only", i.e. non-commercial.
  - Sketchfab models (x2) by named third parties — Sketchfab defaults are
    commonly CC-BY, sometimes CC-BY-NC.
  - Font Awesome icon — FA free icons are **CC-BY 4.0**; attribution required.
  - `kisscc0.com` clipart — an aggregator that relabels work as "CC0"
    unreliably; provenance cannot be established.
- **Asset class:** mixed CC-BY / probable NC / unverifiable.
- **Credits/third-party imports:** yes — the README is exactly the §4 case where
  credits reveal imports the top-level licence does not cover.
- **Verdict: ASSETS REJECTED.** Probable-NC and unverifiable-provenance assets
  are disqualifying for an ad-supported site. Code may be referenced;
  `src/public/res/` must not be read.

## 5. CodeArtemis/TriggerRally — REJECTED (both code and content)

- **Code licence:** **GPL v3** — `LICENSE.md` §2.1. (The GitHub API reports
  only `NOASSERTION`, which is why the file had to be read.)
- **Asset licence:** proprietary — `LICENSE.md` §3.1: "you may not modify or
  redistribute the Content for any purpose unless you have a separate licence
  from the owner(s) to do so." §3.2 adds Paid Content.
- **Asset class:** all rights reserved.
- **Verdict: REJECTED, both halves.** GPL v3 would force copyleft onto a CC0
  codebase (§1); the content licence forbids redistribution outright.

## 6. onaluf/RacerJS — REJECTED (unlicensed)

- **Code licence:** **none.** License API returns 404; the only root metadata
  file is `readme.textile`. No LICENSE, COPYING, or NOTICE.
- **Asset licence:** none stated.
- **Verdict: REJECTED.** Per §4, unstated licence = no rights granted. Absence
  of a licence file is not permission.

## Rejected from search results without further audit

- `KilledByAPixel/HueJumper2k` — GPL-3.0 (copyleft, incompatible with CC0).
- `stuntrally/stuntrally`, `stuntrally3`, `SpeedBreakerProject/speedbreaker`,
  `ZgzInfinity/OutRun`, `juzzlin/DustRacing2D` — GPL-3.0, and none are browser
  games.

---

# Second round — audited 2026-10-10 (operator asked for more candidates)

## 7. lo-th/phy — code reference-OK; ASSETS REJECTED

- **Code licence:** MIT — `LICENSE`, confirmed via API.
- **Asset licence:** **none stated anywhere.** No CREDITS, no NOTICE, no
  per-directory licence, and the README makes no asset claim.
- **Asset class:** unstated. 439 binaries across 2830 files, including
  `assets/animation/AnimationLibrary3.fbx` and `assets/animation/t_pose.fbx`.
  A bundled FBX animation library is a known third-party-import red flag
  (Mixamo and similar carry their own terms); a repo-wide MIT on the author's
  own code does not credibly extend to it.
- **Credits/third-party imports:** no credits file to check against — which is
  itself the problem, given 439 binaries.
- **Verdict: code reference-OK (high value), ASSETS REJECTED.** 743 stars, MIT,
  and the author is well known for physics-engine work with vehicle support, so
  the vehicle-physics *technique* is worth studying. `assets/` must not be read.

## 8. ssusnic/Pseudo-3d-Racer — code reference-OK; assets NOT cleared

- **Code licence:** MIT — `LICENSE`, confirmed via API.
- **Asset licence:** not stated. README mentions `\assets` only as a directory.
- **Asset class:** unstated. 10 binaries in 29 files, all sprites
  (`img_cars.png`, `img_back.png`, `img_billboards.png`, `img_city.png`).
- **Credits/third-party imports:** no credits file.
- **Verdict: code reference-OK; assets NOT cleared.** Two reasons to stay off
  the sprites: there is no provenance statement at all, and sprite-scaling
  racers in this specific genre have a high historical base rate of art traced
  or ripped from arcade originals, which would be both copyright and trade-dress
  exposure. Technique value is low anyway — pseudo-3D sprite scaling does not
  transfer to an R3F/cannon 3D game.

## 9. 19WAS85/old-school-racing — reference-OK, low value

- **Code licence:** Apache-2.0 — `LICENSE`, confirmed via API. Permissive, not
  copyleft, so compatible with CC0 redistribution.
- **Asset licence:** covered by the repo-wide Apache-2.0 by default; no carve-out
  and no third-party credits.
- **Asset class:** 2 binaries only (`assets/sidewinder.png`, `assets/tree.png`).
- **Verdict: reference-OK.** But low value: another pseudo-3D sprite racer, and
  two PNGs are of no use under a reference-only, procedural-art policy.

## Rejected — unstated licence (no rights granted, §4)

Each returns 404 from the licence API and has no LICENSE/COPYING/NOTICE file.
None were read beyond that check.

- `vorshen/simpleCar` (81 stars)
- `Code-Bullet/Hill-Climb-Racing-AI` (111)
- `johnatas-henrique/fake-racer` (66)
- `iaruso/circuit-rush` (24)
- `Swiderki/Badlands` (37)

---

# Cleared list and what is taken from each

Operator granted go-ahead on 2026-10-10 for kart-royale, Starter-Kit-Racing and
HexGL, and asked that cleared parts actually be used.

| Repo | Cleared for | Taken |
|---|---|---|
| ryancampbell/kart-royale | everything (no assets exist) | procedural-art technique; racing-line AI structure (`src/game/AI.ts`); WebAudio synthesis approach |
| mrdoob/Starter-Kit-Racing | code + CC0 assets (reference-only by policy) | three.js/R3F project structure conventions |
| BKcore/HexGL | **code only** | code conventions; assets not cleared (per-file MIT carve-out unverified across 100 binaries) |
| lo-th/phy | **code only** | vehicle-physics technique |
| 19WAS85/old-school-racing | code (low value) | nothing expected |
| ssusnic/Pseudo-3d-Racer | **code only** | nothing expected |

Nothing from `Mati365/micro-racing` assets, `CodeArtemis/TriggerRally`,
`onaluf/RacerJS`, or any unlicensed repo above enters the build. The §5c
compliance gate should treat any binary other than the 8 approved CC0 audio
files as a failure.
