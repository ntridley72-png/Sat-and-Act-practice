# Design system: what exists, and where it is inconsistent

This documents the system the site actually ships (read from the CSS on 2026-11-24). It does not introduce a new one.

## Layers and which one wins

| Layer | File(s) | Prefix | Used by | Accent |
|---|---|---|---|---|
| **Bluebook skin (current visible brand)** | progress-desk.css, bluebook-site.css, bluebook.css | `--desk-*`, `--bb-*` | App shell, test screen, content pages | Blue `#0b5fff` (light), `#7fb0ff` (dark) |
| Workspace base | workspace.css | `--ws-*` | Layout, college cards (`.cf-*`), forms, tables | Orange `#c43b00` / `#a8420b` / `#ff7a3d` |
| Redesign layer | redesign.css | `--fx-*` | Home and results components, charts | Orange `#F2743B` and `var(--ws-accent)` |
| Content pages | guides/guide.css | uses `--ws-*` | Guides, college, score and skill pages | inherits |

`bluebook-site.css` maps `--bb-*` onto `--desk-*`, and the skin is applied on top of the others, so on screen the
**blue Bluebook palette is the brand**. The orange values are still defined underneath and leak through wherever a
component reads `--ws-accent` or `--fx-accent` directly.

## Tokens to use for new work

| Purpose | Token | Light | Dark |
|---|---|---|---|
| Page background | `--desk-bg` | #ffffff | #171b1d |
| Surface (cards, panels) | `--desk-surface` | #ffffff | #202629 |
| Soft fill (bars, chips) | `--desk-soft` | #eef0f5 | #293236 |
| Text | `--desk-ink` | #111111 | #eef2f3 |
| Secondary text | `--desk-muted` | #4b5563 | #b1bec4 |
| Rules and borders | `--desk-line` | #c9ced6 | #3b484e |
| Action and links | `--desk-accent` | #0b5fff | #7fb0ff |
| Text on accent | `--desk-on-accent` | #ffffff | #0b1a33 |
| Selected tint | `--desk-tint` | #eaf1ff | #1d2d4a |

Type: Archivo (UI and body, 400–700), IBM Plex Mono (numbers, code, timers), Space Grotesk (display). All self-hosted in
/fonts with `font-display` and a preload for Archivo.

Shape: square or 2px corners, 1px rules, no shadows except the floating calculator and dialogs. This is what makes the
site read as a test product rather than a template; keep it.

## Rules that are already true and should stay true

- Status colors are paired with text (Correct / Incorrect labels), never color alone.
- Tables use tabular numbers and right-aligned values (`.cf-line b`, `.gtable td`).
- Every interactive target is at least 32px tall, 44px on phones for primary actions.
- Phones get their own layout; desktop and tablet test screens scale to fit (see tests/fit-to-screen.cjs).
- Contrast is checked by tests/contrast-audit.cjs.

## Debt, in order of visible impact

1. **Two accents.** Orange `--ws-accent` / `--fx-accent` still render in some workspace and redesign components under
   the blue skin. Fix: point `--ws-accent` and `--fx-accent` at `var(--desk-accent)` inside the skin, then re-run
   tests/contrast-audit.cjs and the visual pass. Not done in this pass because it changes many screens at once and needs
   a full visual review before deploy.
2. Four prefixes for the same roles. Once the accent is unified, alias `--ws-*` and `--fx-*` to `--desk-*` and stop adding new `--ws-` or `--fx-` tokens.
3. workspace.css is 1,400 lines and redesign.css 600; several components are defined in both. Consolidate per component when touching it, not as a big-bang rewrite.
