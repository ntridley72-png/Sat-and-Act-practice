/* Keyboard input for the player car.
 *
 * Held in a ref rather than React state on purpose: a key press must not
 * re-render the scene tree, and the frame loop reads this every step.
 */
import { useEffect, useRef } from 'react'

export interface Controls {
  forward: boolean
  backward: boolean
  left: boolean
  right: boolean
  brake: boolean
  boost: boolean
  reset: boolean
}

const EMPTY: Controls = { forward: false, backward: false, left: false, right: false, brake: false, boost: false, reset: false }

/* Upstream's key map, plus WASD, because a study-site visitor should not have
 * to discover which of the two sets works. */
const KEYS: Record<string, keyof Controls> = {
  ArrowUp: 'forward',
  KeyW: 'forward',
  ArrowDown: 'backward',
  KeyS: 'backward',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Space: 'brake',
  ShiftLeft: 'boost',
  ShiftRight: 'boost',
  KeyR: 'reset',
}

export function useControls() {
  const controls = useRef<Controls>({ ...EMPTY })

  useEffect(() => {
    function set(code: string, value: boolean, event: KeyboardEvent) {
      const key = KEYS[code]
      if (!key) return
      /* Only swallow the event once the key is one the game uses. Calling
         preventDefault unconditionally would break Tab, Cmd-R and the page's
         own shortcuts while the game has focus -- on a study site that is
         worse than a stiff control. */
      event.preventDefault()
      controls.current[key] = value
    }
    const down = (e: KeyboardEvent) => set(e.code, true, e)
    const up = (e: KeyboardEvent) => set(e.code, false, e)
    /* Clear everything when focus leaves. Without this, tabbing away mid-
       corner leaves the key latched and the car drives itself into the
       scenery while the student is reading something else. */
    const clear = () => { controls.current = { ...EMPTY } }

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [])

  return controls
}
