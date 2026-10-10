# Audio provenance

These files are the ONLY third-party assets in this project. Everything
visual is generated procedurally at runtime; see
`../../vendor/pmndrs-racing-game/VENDORING.md`.

| | |
|---|---|
| Source | https://github.com/pmndrs/racing-game.git |
| Commit | `7816a5d954b75e6ad853ae4e4f0cbbd628072643` |
| Path upstream | `public/sounds/` |
| Licence | **CC0 1.0** — upstream README: "CC0 assets only" |
| Approved by | the project operator, as an explicit carve-out, 2026-10-10 |

## Why a carve-out exists at all

The project policy is reference-only for third-party assets. Audio is the one
exception, granted because original engine audio is genuinely hard to author
and CC0 is the lowest-risk asset class there is: no attribution requirement,
no copyleft, and commercial use permitted — which matters, because this site
is ad-supported and a CC-BY-NC asset would be illegal here.

## What is shipped, and what is not

Shipped (6):

    engine.mp3  accelerate.mp3  tire-brake.mp3  boost.mp3  crash.mp3  honk.mp3

Deliberately NOT shipped, though equally approved: `train.mp3` and
`water.mp3`. Upstream's circuit has a level crossing and a water hazard; the
original circuit here has neither, so shipping their audio would be 648 KB of
sound that can never play. Ship what is used.

## Consequence for the compliance gate

`tools/compliance-gate.mjs` allowlists exactly these filenames. Any other
binary reaching the build is a gate failure, not a judgement call. If a future
change adds a train or a water hazard, add the file AND the allowlist entry in
the same commit so the two never drift.
