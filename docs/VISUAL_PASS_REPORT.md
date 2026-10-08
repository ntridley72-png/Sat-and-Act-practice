# Visual pass — practice workspace, redesigned screens, generated college pages

Design-only change set. The question bank and the data builders
(`scripts/build-college-data.py`, `scripts/expand-question-bank*.py`) were not
touched.

## 1. Colour and contrast

### The root problem

`--fx-*` was defined once, dark, on `:root`, while the three workspace layouts
("Exam", "Notebook", "Focus") carry their own `--ws-*` palettes. The redesigned
screens therefore painted a dark island inside a light page, and wherever a
`body[data-workspace]` rule out-specified a class-only `--fx-*` rule, light text
landed on a light surface. **97 of 139 distinct failures were at or under 2:1 —
text that was effectively invisible**, including every answer-choice key letter,
the whole feedback block after answering, and "Learning tools".

### The fix

`--fx-*` is now a semantic alias layer defined **per layout**, so the structural
slots follow the active theme and there is exactly one palette on screen at a
time. The dark mockup values remain the `:root` default for pages rendered
without a layout attribute.

```css
body[data-workspace]{ --fx-bg:var(--ws-bg); --fx-surface:var(--ws-surface); … }
body[data-workspace="exam"]{ --fx-good:#1D6B3F; --fx-on-accent:#FFFFFF; … }
body[data-workspace="notebook"]{ … }
body[data-workspace="focus"]{ … }
```

New tokens were added where a literal had been standing in for a missing one:
`--fx-on-accent`, `--fx-on-good`, `--fx-text-2`, `--fx-accent-line`,
`--fx-good-bg/-line`, `--fx-warn-bg/-line`, `--fx-gold-bg/-line`,
`--fx-info-bg/-line/-text`, `--fx-violet-bg`, `--fx-track`, `--fx-band`,
`--fx-overlay`, `--fx-border-hover`, `--fx-accept/-waitlist/-deny`, and
`--fx-cat-1…6` for the categorical data-viz fills.

Every hardcoded colour inside the redesigned screens is gone:

| Was | Now |
| --- | --- |
| `#1A0E08` ×12, `#0C1A10` ×3 | `--fx-on-accent`, `--fx-on-good` |
| `rgba(242,116,59,.45)`, `rgba(126,166,240,.5)`, `rgba(111,208,140,.4)`, `rgba(240,198,78,.4)`, `rgba(240,154,107,.4)` | the `*-line` tokens |
| `rgba(126,166,240,.14)`, `rgba(111,208,140,.14)`, `rgba(240,198,78,.12)`, `#1F2A1F`, `#2A2418`, `#2A1D18` | the `*-bg` tokens |
| `#1B1B21`, `#3A4A66`, `rgba(201,155,240,.35)`, `rgba(4,7,12,.6)` | `--fx-track`, `--fx-band`, `--fx-overlay` |
| `#DEDCD7`, `#BFD3FA`, `#3A3A44`, `#E5C46B` | `--fx-text-2`, `--fx-info-text`, `--fx-border-hover`, `--fx-gold` |
| `college.js` `OUTCOME_COLORS` `#22c55e/#3b82f6/#ef4444` | `--fx-accept/-waitlist/-deny` |
| `college.js` `raceColors` (6 tailwind hexes) | `--fx-cat-1…6` |
| `redesign.css` `.fit-*` chip fills, `.cr-track/.cr-band/.cr-you`, `.cg-cell`, `.chance-item`, `.context-card`, `.impact-*`, `.hsc-cta` | the matching tokens |
| `SAT & ACT Practice.html` `.explain{color:#1f2937}` | `color:inherit` |

Two structural fixes came out of the audit rather than a colour swap:

* **De-emphasis was opacity.** Disabled buttons (`opacity:.5/.7`), dimmed choices
  (`.dim{opacity:.55}`) and struck choices (`opacity:.45`) all dragged their
  labels under 4.5:1. Inside these screens those states now use the
  muted/surface token pair at full opacity; the strike-through and border still
  carry the meaning.
* **A blanket `color:inherit!important`** on every `h1,h2,p,span,b,…` inside the
  redesigned cards existed only to force the dark island's text light. It was
  also destroying semantic colour (verdict chips, the score marker). It is gone,
  along with most of the `!important` repaints — the remaining specificity bumps
  are expressed by qualifying the selector with its element
  (`body[data-workspace] button.cc-fitb`), not with `!important`.

### The script

`tests/contrast-audit.cjs` walks every rendered text node, composites its colour
and its real painted background through every translucent ancestor and inherited
opacity, and fails anything under 4.5:1 (3:1 for large text, by the WCAG rule).
It runs every affected screen in all three layouts. Gradient-filled text
(`background-clip:text`, the "SAT" in the wordmark) is excluded rather than
scored against its own gradient.

**Before** — 1,897 nodes measured, **139 distinct failures**:

| band | count |
| --- | --- |
| 1.0–1.99 (invisible) | 97 |
| 2.0–2.99 | 6 |
| 3.0–3.99 | 34 |
| 4.0–4.49 | 2 |

Worst offenders: `.choice .key` 1.00, `.feedback .head` 1.00, `.bb-coin` 1.05,
`.workspace-learning h2` 1.05, `.cc-marker b` 1.00, `.cr-you b` 1.00,
`.cc-verdict.v-reach` 3.00, `.st-kicker` 3.28, `.idk-btn` 3.21.

**After** — run across 3 layouts × 7 screens × 3 widths including a generated
college page:

```
contrast audit — 2846 text nodes measured across 3 themes x 7 screens x 3 widths
2846 pass, 0 fail (0 distinct)

accent census (solid --fx-accent fills per screen; budget ~3):
  home                1      button#hscStartPractice.hsc-cta
  practice            1      button.workspace-question-number.current
  practice-answered   2      button.workspace-question-number.current, button#btnNext.qfx-check.next
  practice-calc       1      button.workspace-question-number.current
  college             2      button.cc-fitb.on, button#ccAdd.cc-add
  scholarships        1      a.schl-official

RESULT: pass
```

### Orange

The audit also counts solid accent fills per screen. Three things were stealing
the accent:

* **The "Next" button was green while the accent was orange, and it was the
  largest thing on screen.** It now uses the accent in both states — Check and
  Next are the same primary button — and it is sized by its label instead of
  `flex:1; min-width:170px`. Correctness is signalled by the choice rows and the
  feedback block, which is where `--fx-good` belongs.
* **`body[data-workspace] button` paints every unmarked button in the accent**,
  so the calculator's zoom controls, its "Show me" button and the tutor's "Send"
  all came out orange (6 accent fills on the practice screen with the calculator
  open). Inside the tool panes a button is now a surface control unless it opts
  in. That screen is down to 1.
* The scholarship pane had two orange blocks; "Back to results" is now a ghost.

## 2. The test workspace scales with the viewport

**The reason the question column was narrowest:** `@media (min-width:1024px){
#screen-test .card{max-width:720px} }` — the mockup's single-column reading cap.
The workspace grid lives inside that same card, so all three panes were being
squeezed into 720px at every width above 1024. At 1920 the question column was
322px and the tools pane 300px. The cap is now scoped off the card that hosts
the grid.

The rest is a system, in one commented block at the end of `workspace.css`:

* **Rank.** `--ws-rail` / `--ws-q` / `--ws-tools` drive all three layouts.
  The question column takes `minmax(0,1.7fr)`, capped at `68ch`; the tools pane
  is `minmax(300px,1fr)` and is what gives way; the rail is fixed and collapses
  to icons before anything else moves.
* **Type against the column, not the viewport.** `.workspace-canvas` is a
  `container-type:inline-size` container and the stem is
  `clamp(18px, 10px + 1.6cqi, 22px)`; the passage and choices follow the same
  ramp. Measured: 18px in a 340px column, 22px in a 950px one, never outside.
* **The sticky bar no longer sits over the question at all.** With the page as
  the only scroller, a sticky bar necessarily floats over what is behind it —
  that is exactly how it ended up covering answer choices. The column is now its
  own scroller (`max-height: max(360px, calc(100dvh - --ws-above - --ws-foot-h))`)
  and the bar is a sibling below it. `workspace.js` keeps `--ws-above` and
  `--ws-foot-h` in step with a `ResizeObserver`, so the reserve is the bar's real
  height as it wraps, at every width — not just under 760px tall.
* **No clipping.** Anything that cannot wrap (an equation, a wide table) gets its
  own horizontal scroller inside the column. `overflow-wrap:anywhere` on every
  workspace button — which is what broke "Back" mid-word — is now
  `break-word` + `word-break:normal`, and the nav buttons are `nowrap` and
  content-sized; under 768 the Back/Next pair takes a full row and under 420 it
  stacks.
* **Breakpoints.** ≥1280 three panes · 1024–1279 rail collapses to icons ·
  768–1023 learning tools move below the question · <768 single column with the
  rail as a horizontal toolbar and the tools as the tabbed panel under the
  question.

`tests/workspace-layout.cjs` checks all of it at 320/390/768/1024/1280/1440/1920
× three layouts × short stem / long stem / calculator open: no sideways scroll,
nothing clipped in the question column, the question column wider than the tools
pane whenever they share a row, the bar never overlapping a choice or the stem at
either end of the scroll, no wrapped button labels, stem within 18–22px.

## 3. The ring

`data-cc-off` was written onto the arc and **nothing ever read it**, so the
dashoffset stayed at the full circumference and the arc was never drawn — hence
a grey circle with a number in it. The second ring (`redesign.js`) had a
malformed `<linearGradient>` with a duplicated closing tag.

There is now one ring component (`ringHtml`/`paintRings` in `redesign.js`,
`.fxring` in `redesign.css`): track in `--fx-border`, value arc in
`--fx-accent`, `stroke-dasharray`/`offset`, round linecap, `rotate(-90deg)` so
it starts at 12 o'clock and runs clockwise, animated from empty over 600ms with
a `prefers-reduced-motion` opt-out. Number and "PCTL" scale from the size
(22px / 9px at 76px). Verified: 76px with a 7px stroke in the college score
rail, 120px with a 10px stroke at the top of the progress card, sweep percentage
equal to the value, `role="img"` with `aria-label="54th percentile"`, legible at
320px.

It is used **once per screen**. The college screen carried a second 150px ring on
the profile card; that card now states the percentile in text.

## 4. College photo gallery

Responsive CSS grid of equal tracks — 1 column under 560px, 2 under 900, 3 above
— 16:9 with `object-fit:cover`, `--fx-r-md` rounding, lazy with `width`/`height`
set so nothing shifts. **Attribution is rendered per image**, linked to its
Commons file page, because these licences require credit per work.

Click or Enter opens a lightbox with the caption, the count and the credit;
Escape closes, left/right move and wrap, Tab is trapped inside it, and focus
returns to the thumbnail the viewer landed on.

Built against `imgs: [{src, credit, license}]` **and** the shape currently in
`college-data.js` (`{u, a, l}`), falling back to the single `img`/`imgA`/`imgL`.
Sourcing stays the other prompt's job.

`tests/college-gallery.cjs` covers 1 image (one column, not stretched, arrows
hidden), 6 images (three per row on equal tracks, all credited) and none (no
empty grid, no reserved space, the gallery script not even shipped).

## 5. Scholarship detail pane

* A 16:9 header image per program, lazy with dimensions set and the same
  rounding, with its credit beneath. When a program has no photo it gets a
  category-tinted panel carrying the sponsor's initials — never an empty box,
  never a stretched logo.
* "Official page" is sized to its label (133px of a 420px pane, was full width)
  and the star matches its 44px height.
* "Back to results" is a quiet ghost.
* The description moved out from under the numbered steps to directly under the
  sponsor name.
* The stat tiles lost 6px of padding and their 4px gap; they are now exactly as
  tall as their content.

## 6. Profile avatars

`avatar.js` draws a 5×5 grid mirrored down the vertical axis, filled from a
palette of `--fx-*` tokens, seeded from an FNV-1a hash of the account id — so the
same person gets the same avatar on every device with nothing uploaded, fetched
or hosted. A picker of 8 variants plus "No avatar" lives in the account panel and
opens after signup; **nothing is assigned until it is picked**. 30px in the top
bar (decorative, `aria-hidden`), 76px in the picker, `aria-label="Your avatar"`
on a shown instance. Signed out there is no stable id, so it falls back to the
existing badge.

## Files changed

| File | What |
| --- | --- |
| `workspace.css` | theme-aware `--fx-*`, de-emphasis without opacity, layout system, ring/gallery/scholarship/avatar CSS (+486 −…) |
| `redesign.css` | ring component, `#screen-college` token aliasing, fit chips, markers, tints |
| `redesign.js` | one `ringHtml`/`paintRings`; profile card percentile in text |
| `college.js` | score rail uses the shared ring; data-viz fills tokenised |
| `scholarships.js` | header image + tinted fallback; description placement |
| `workspace.js` | `--ws-foot-h` / `--ws-above` tracking |
| `SAT & ACT Practice.html` | avatar script + picker markup; `.explain` colour |
| `guides/guide.css` | gallery grid + lightbox |
| `scripts/build-seo-pages.py` | gallery markup from `imgs` |
| `wrangler.toml` | ship `avatar.js`, `college-gallery.js` |
| `avatar.js`, `college-gallery.js` | new |
| `tests/contrast-audit.cjs`, `tests/workspace-layout.cjs`, `tests/college-gallery.cjs`, `tests/scholarship-detail.cjs`, `tests/avatar-ui.cjs`, `tests/visual-pass-shots.cjs` | new |
| `tests/redesign-ui.cjs` | updated for the deliberate ring/number changes |

Screenshots: `docs/screenshots/visual-pass/` — every affected screen at
320/390/768/1024/1280/1440 in each of the three layouts, plus the generated
college page and its lightbox.

## Cold-eyes review and what it changed

A fresh agent that had not seen the work reviewed 27 of the screenshots against
the six stated intents. Two of its top findings were capture artifacts; nine
were real and are fixed.

**Not real (verified against in-viewport captures, not full-page ones):**

* "The action bar sits on top of the question and slices text mid-glyph, in every
  theme at every width" and "the calculator panel overlays the answer choices".
  `fullPage:true` paints a clipping scroller's content at its scroll offset, so
  the question column's clip edge looks like the bar cutting through text. In the
  viewport the bar is always below the column and the dock always below that.
  The reviewer was right about one thing underneath this, though: a flat clip
  edge reads as "cut off", so the column now fades its bottom edge while it can
  still scroll.
* "Answer choices render empty / `: and`" — that is question-bank content for a
  punctuation item, not a layout fault, and the bank is out of scope here.

**Real, and fixed:**

| Finding | Fix |
| --- | --- |
| The generated college page forced 84px of horizontal scroll at 320 and 14px at 390, and its footer nav was one run-on string ("Free test prepSAT practiceACT practice…") | `.gfootnav` is a wrapping row with dot separators; both the overflow and the legibility problem came from the same unstyled element |
| The college screen pushed the document 6px wide at 320 in all three themes | the score-marker label and nested wide content are now contained: the panels clip horizontally at their own edge and `.cc-summary` reserves room for the label |
| The lightbox collapsed to a ~60px strip, its close button overhung the dialog, and the three controls were orange | the figure reserves a 16:9 box so a broken or slow image cannot collapse it; the close button moved inside the figure's corner; the controls are neutral surface circles (the app's base `button` rule had been filling them with the accent) |
| The calculator could push the action bar off screen entirely (notebook at 1024) | the canvas is a bounded flex column, so the question body takes what is left and the dock and bar keep their own height; the dock is capped at `min(460px, 42dvh)` |
| Starting a practice set left the page scrolled down where the Start button was — at 320 the student landed 1,147px down, on the learning-tools pane | the screen change resets the scroll (pre-existing; it made every narrow viewport open below the question) |
| 51 of the 51 scholarship amounts were orange, so the accent marked "a row exists" rather than the action | amounts are strong text; the accent stays on the single primary action. Scholarships: 3 orange elements, 1 of them a fill |
| Every college name was orange (the comparison card is wrapped in an `<a>`, so the base link colour took it), as were the three profile chip values | card links and chip values take the text colour; the card title turns accent on hover. College: 2 orange UI elements (selected filter, "Add a college") plus 2 inline links in the source disclaimer |
| The scholarship detail pane rendered as a static block *after* ~50 result rows between 768 and 1023 — tapping a card looked like nothing happened | the slide-in overlay that already existed below 768 now covers the whole range where the pane cannot sit beside the list |
| With no score yet the ring was an unfilled circle that read as broken | the empty state draws a dashed track; the captures now seed a finished practice record so the real 86% arc is visible |
| The scholarship hero's alt text overflowed its 16:9 box when the image failed | the hero clips and renders alt text at caption size |

**Accepted as out of scope, not fixed:** the reviewer counted ~20 orange elements
on the home screen (two competing orange primary buttons on one card, orange step
badges, orange footer links). Home is not one of the three redesigned screens and
is not in this brief's file list, so it was left alone — but the count is real and
worth its own pass.

## Left failing

* **Mobile chrome above the question.** At 320–390 the top bar, module header,
  tool bar and progress strip stack to ~586px before the question starts, so the
  action bar needs a scroll. The question column never gets covered and nothing
  clips, but the chrome itself wants tightening and that is a different brief
  than this one.
* **Home screen accent discipline**, as above.
* **Pre-existing test failures unrelated to this change set**, from the
  concurrent question-bank work in the same tree: `tests/variety.test.cjs`
  (a family-variety count, 24 vs 25) and `tests/content-integrations.cjs`
  ("gallery exceeds three images" — that assertion now contradicts the expanded
  image set; the gallery built here is verified against 1, 6 and 0 images).
  `tests/seo-audit.test.cjs` needs a full `wrangler` build output in `public/`
  and fails on a partial one, before and after this change.
