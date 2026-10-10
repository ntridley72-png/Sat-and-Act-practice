/* Audio rig for the player car.
 *
 * Uses the six approved CC0 files (see public/sounds/PROVENANCE.md). They are
 * the only third-party assets in this project and they are fetched at runtime
 * by URL, so a student who never opens the game never downloads them --
 * the same lazy-load rule the bundle itself obeys.
 *
 * TWO THINGS DRIVE THE DESIGN.
 *
 * 1. Browsers refuse to start audio before a user gesture, and a refused
 *    play() rejects a promise. Every call here is therefore guarded: audio is
 *    a nice-to-have on a study site, and a rejected promise must never surface
 *    as an unhandled rejection in a student's console, let alone break the
 *    game. The rig arms itself on the first gesture and is silent until then.
 *
 * 2. Engine note comes from playbackRate on a looping sample, not from a
 *    synth. It is one 38 KB file doing the work of an oscillator stack, and it
 *    is what upstream does.
 */

const BASE = 'sounds/'

/** Files the rig may load. Keys are the only names the rest of the code uses,
 *  so a typo is a type error rather than a silent 404. */
const FILES = {
  engine: 'engine.mp3',
  accelerate: 'accelerate.mp3',
  brake: 'tire-brake.mp3',
  boost: 'boost.mp3',
  crash: 'crash.mp3',
  honk: 'honk.mp3',
} as const

export type SoundName = keyof typeof FILES

interface Voice {
  el: HTMLAudioElement
  ready: boolean
}

export class AudioRig {
  private voices = new Map<SoundName, Voice>()
  private armed = false
  private disposed = false
  private muted = false
  /** Resolved against the page, so the rig works from any mount path. */
  private base: string

  constructor(baseUrl = BASE) {
    this.base = baseUrl
  }

  /** Create the elements. Cheap: no network until play() or preload kicks in,
   *  and failures here are swallowed because audio is optional. */
  init(): void {
    if (this.disposed) return
    for (const name of Object.keys(FILES) as SoundName[]) {
      if (this.voices.has(name)) continue
      try {
        const el = new Audio(this.base + FILES[name])
        el.preload = 'auto'
        if (name === 'engine') {
          el.loop = true
          el.volume = 0.35
        } else {
          el.volume = name === 'boost' ? 0.5 : 0.45
        }
        const voice: Voice = { el, ready: false }
        el.addEventListener('canplaythrough', () => { voice.ready = true }, { once: true })
        // A missing or undecodable file must not take the game down. The rig
        // simply stays silent for that one sound.
        el.addEventListener('error', () => { voice.ready = false }, { once: true })
        this.voices.set(name, voice)
      } catch {
        /* Audio constructor can throw in exotic embeddings; stay silent. */
      }
    }
  }

  /** Call from a real user gesture. Until this runs the rig makes no sound,
   *  because the browser would reject it anyway. */
  arm(): void {
    if (this.disposed) return
    this.armed = true
  }

  setMuted(muted: boolean): void {
    this.muted = muted
    if (muted) this.stopAll()
  }

  /** Fire a one-shot. Restarts from zero so rapid repeats are audible. */
  play(name: SoundName): void {
    if (!this.armed || this.muted || this.disposed) return
    const voice = this.voices.get(name)
    if (!voice) return
    try {
      voice.el.currentTime = 0
      // play() returns a promise that REJECTS when the browser blocks it.
      // Unhandled, that is a console error on every blocked sound.
      void voice.el.play().catch(() => {})
    } catch {
      /* currentTime can throw before metadata loads; skip this one */
    }
  }

  /** Start the looping engine note. Idempotent. */
  startEngine(): void {
    if (!this.armed || this.muted || this.disposed) return
    const voice = this.voices.get('engine')
    if (!voice || !voice.el.paused) return
    void voice.el.play().catch(() => {})
  }

  /** Engine pitch from speed. `speed` in m/s, `maxSpeed` the car's ceiling.
   *  Clamped to a range that still sounds like an engine: below ~0.6 the
   *  sample turns into a drone, above ~2.4 it is a mosquito. */
  setEngineSpeed(speed: number, maxSpeed: number): void {
    const voice = this.voices.get('engine')
    if (!voice || this.disposed) return
    const t = Math.max(0, Math.min(1, Math.abs(speed) / Math.max(1, maxSpeed)))
    const rate = 0.6 + t * 1.8
    try {
      voice.el.playbackRate = rate
      voice.el.volume = this.muted ? 0 : 0.18 + t * 0.3
    } catch {
      /* playbackRate out of range on some engines; ignore */
    }
  }

  stopAll(): void {
    for (const { el } of this.voices.values()) {
      try {
        el.pause()
        el.currentTime = 0
      } catch {
        /* nothing useful to do */
      }
    }
  }

  dispose(): void {
    this.disposed = true
    this.stopAll()
    for (const { el } of this.voices.values()) el.src = ''
    this.voices.clear()
  }
}
