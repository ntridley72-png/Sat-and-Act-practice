/* Entry point for the lazily-loaded racing game.
 *
 * This module is import()ed by racing/index.js (ensureApp) and must obey one
 * rule above all others: IMPORTING IT MUST HAVE NO SIDE EFFECTS. It does not
 * mount React, does not touch the DOM, does not start an animation frame and
 * does not construct a WebGL context. The host page decides when the game
 * boots by calling mount().
 *
 * That matters because the page this loads into is 12k lines of vanilla JS
 * running an existing game. A module that grabbed the canvas on import could
 * take over the page the moment a browser decided to speculatively prefetch
 * it, and the student would lose the game they were already playing.
 */
import { StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from './ErrorBoundary'
// ?inline keeps the CSS as a string INSIDE this chunk instead of emitting a
// separate .css file. The host is a vanilla page that imports only this
// module by URL; it never parses an HTML document that could <link> a
// stylesheet, so an emitted file would simply never load and the game would
// mount unstyled.
import hudCss from './ui/hud.css?inline'

export type MountOptions = {
  /* Opponent count. Named rather than a bare number so the call site reads
     clearly at the boundary between vanilla JS and React. */
  opponents?: number
  /* Seed for the race. The same seed must replay identically on the same
     machine, so it is an explicit input rather than something generated
     inside the game. */
  seed?: string
  /* Called when the player chooses to leave the game, so the host can restore
     whatever was on screen before. */
  onQuit?: () => void
  /* Called if the game fails AFTER mounting. The host uses it to restore the
     v1 game, which is why a post-mount failure must be reported rather than
     merely logged. */
  onError?: (error: Error) => void
}

let root: Root | null = null
let mountedOn: HTMLElement | null = null
let styleEl: HTMLStyleElement | null = null

/* Inject the stylesheet once. Every rule is scoped under .rv2-*, because this
   loads into a 12k-line site with its own stylesheet and a bare `button` rule
   would restyle the study app the moment a student opened the racer. */
function ensureStyles(): void {
  if (styleEl || typeof document === 'undefined') return
  try {
    styleEl = document.createElement('style')
    styleEl.dataset.racingV2 = ''
    styleEl.textContent = hudCss
    document.head.appendChild(styleEl)
  } catch {
    // An unstyled game is worse than a styled one but far better than no
    // game, so a failure here must not stop the mount.
    styleEl = null
  }
}

/* Boot the game into `container`. Idempotent: calling it twice on the same
   container re-renders rather than leaking a second React root, because the
   host page's own navigation can plausibly call this more than once. */
export function mount(container: HTMLElement, options: MountOptions = {}): void {
  if (!container) throw new Error('racing-v2 mount() requires a container element')

  if (root && mountedOn !== container) {
    // A different container means the old tree is orphaned; tear it down
    // rather than stranding a live WebGL context on a detached node.
    unmount()
  }

  ensureStyles()

  if (!root) {
    root = createRoot(container)
    mountedOn = container
  }

  /* Both createRoot and render are inside the try: createRoot can throw on a
     detached container, and render can throw synchronously before the
     boundary is live. mount() must never throw into the host page -- its
     caller is a vanilla study site with a working game to protect. */
  try {
    root.render(
      <StrictMode>
        <ErrorBoundary onError={options.onError}>
          <App opponents={options.opponents ?? 0} seed={options.seed ?? 'default'} onQuit={options.onQuit} />
        </ErrorBoundary>
      </StrictMode>,
    )
  } catch (error) {
    try {
      unmount()
    } catch {
      /* a failed teardown must not mask the original failure */
    }
    throw error instanceof Error ? error : new Error(String(error))
  }
}

/* Tear the game down and release the WebGL context. The host page calls this
   when the student leaves the game; without it, switching between the arcade
   and the racer would accumulate contexts until the browser dropped them. */
export function unmount(): void {
  if (!root) return
  root.unmount()
  root = null
  mountedOn = null
  // Leave the <style> in place: re-mounting is common (the student goes back
  // to the arcade and returns) and re-injecting identical CSS each time would
  // churn the stylesheet for no benefit.
}

/* Whether the game is currently mounted, so the host page can decide between
   mount() and unmount() without tracking state itself. */
export function isMounted(): boolean {
  return root !== null
}
