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

export type MountOptions = {
  /* Opponent count. Named rather than a bare number so the call site reads
     clearly at the boundary between vanilla JS and React. */
  opponents?: number
  /* Seed for the race. The same seed must replay identically on the same
     machine, so it is an explicit input rather than something generated
     inside the game. */
  seed?: string
}

let root: Root | null = null
let mountedOn: HTMLElement | null = null

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

  if (!root) {
    root = createRoot(container)
    mountedOn = container
  }

  root.render(
    <StrictMode>
      <App opponents={options.opponents ?? 0} seed={options.seed ?? 'default'} />
    </StrictMode>,
  )
}

/* Tear the game down and release the WebGL context. The host page calls this
   when the student leaves the game; without it, switching between the arcade
   and the racer would accumulate contexts until the browser dropped them. */
export function unmount(): void {
  if (!root) return
  root.unmount()
  root = null
  mountedOn = null
}

/* Whether the game is currently mounted, so the host page can decide between
   mount() and unmount() without tracking state itself. */
export function isMounted(): boolean {
  return root !== null
}
