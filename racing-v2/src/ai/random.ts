/* Seeded deterministic random stream.
 *
 * Ported from racing/core/random.js to keep the algorithm bit-identical, so a
 * given seed produces the SAME decision sequence in the v2 React game as in
 * the v1 vanilla one. That makes v1's behaviour a usable reference when the
 * new AI misbehaves: if both drivers disagree on the same seed, the difference
 * is in the controller, not in the dice.
 *
 * sfc32 with a splitmix32 seeding step. Math.random() must never be used
 * inside the simulation: determinism within a session is a requirement, and a
 * single unseeded call silently destroys replayability.
 */

/** Mixes an arbitrary integer into four well-distributed 32-bit words, so
 *  seeds 1 and 2 give unrelated streams rather than near-identical ones. */
function splitmix32(seed: number): [number, number, number, number] {
  let s = seed >>> 0
  const out: number[] = []
  for (let i = 0; i < 4; i++) {
    s = (s + 0x9e3779b9) >>> 0
    let z = s
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0
    out.push((z ^ (z >>> 15)) >>> 0)
  }
  return out as [number, number, number, number]
}

/** A string seed (a track id, a race name) hashes to an integer via FNV-1a. */
function hashSeed(value: string | number | null | undefined): number {
  if (typeof value === 'number' && isFinite(value)) return Math.floor(value) >>> 0
  const str = String(value ?? '')
  let h = 2166136261 >>> 0
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

export class Stream {
  readonly seed: string | number
  private a: number
  private b: number
  private c: number
  private d: number
  /** How many values have been drawn. Exposed so a test can assert two runs
   *  consumed the stream identically, which catches a controller that only
   *  looks deterministic because it stopped drawing. */
  count = 0

  constructor(seed: string | number) {
    this.seed = seed
    const w = splitmix32(hashSeed(seed))
    this.a = w[0]
    this.b = w[1]
    this.c = w[2]
    this.d = w[3]
  }

  /** sfc32. Returns a float in [0, 1). */
  next(): number {
    const a = this.a
    const b = this.b
    const c = this.c
    const d = this.d
    let t = (a + b) >>> 0
    this.a = (b ^ (b >>> 9)) >>> 0
    this.b = (c + (c << 3)) >>> 0
    this.c = ((c << 21) | (c >>> 11)) >>> 0
    this.c = (this.c + t) >>> 0
    this.d = (d + 1) >>> 0
    t = (t + this.d) >>> 0
    this.count++
    return t / 4294967296
  }

  float(min: number, max: number): number {
    return min + this.next() * (max - min)
  }

  int(min: number, max: number): number {
    return Math.floor(this.float(min, max + 1))
  }

  chance(p: number): boolean {
    return this.next() < p
  }

  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.next() * list.length)]
  }
}

export function createStream(seed: string | number): Stream {
  return new Stream(seed)
}
