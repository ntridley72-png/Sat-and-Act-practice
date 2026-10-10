/* The racing line: a sampled, closed centreline the AI follows.
 *
 * COORDINATE CONVENTION, and it matters. The driver maths is ported from
 * racing/game/ai.js, which works in a 2D top-down space where the ground plane
 * is (x, y). three.js and cannon put the ground on (x, z) with y up. Rather
 * than rewrite the controller's trigonometry -- the single most error-prone
 * thing that could be done to it -- the AI keeps working in (x, y) and the
 * mapping y <-> z is confined to the boundary in Opponent.tsx. One conversion
 * site, not fifty.
 *
 * Supplying the line as an interface (rather than the driver reading a track
 * object) is inherited from ai.js on purpose: it keeps the controller testable
 * in Node with a synthetic circle, with no renderer and no physics engine.
 */

export interface LinePoint {
  x: number
  y: number
  /** Tangent direction, radians. */
  heading: number
  /** Signed 1/radius. Positive turns left. */
  curvature: number
  /** Half-width of drivable road here, metres. Bounds the AI's lateral offset. */
  half: number
}

export interface RacingLine {
  /** Total centreline length, metres. Distances wrap modulo this. */
  length: number
  at(distance: number): LinePoint
}

/** A control point: position plus the road half-width through it. */
export type ControlPoint = { x: number; y: number; half: number }

/* Catmull-Rom through the control points, closed. Chosen because it passes
 * THROUGH its controls, so a hand-authored layout comes out as drawn rather
 * than as an approximation of what was drawn. */
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t
  const t3 = t2 * t
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
}

/* Build a sampled line from control points.
 *
 * Sampling to a table rather than evaluating the spline on demand is a frame-
 * budget decision: the driver calls at() roughly 25 times per car per tick
 * (a 20-sample braking horizon plus lookahead and locate), so with a full grid
 * that is ~325 calls a tick. A table lookup with one lerp is the difference
 * between that being free and it being the profile. */
export function buildRacingLine(controls: readonly ControlPoint[], samplesPerSegment = 24): RacingLine {
  const n = controls.length
  if (n < 4) throw new Error('a closed racing line needs at least 4 control points')

  // Dense sample of position + half-width.
  const pts: { x: number; y: number; half: number }[] = []
  for (let i = 0; i < n; i++) {
    const p0 = controls[(i - 1 + n) % n]
    const p1 = controls[i]
    const p2 = controls[(i + 1) % n]
    const p3 = controls[(i + 2) % n]
    for (let s = 0; s < samplesPerSegment; s++) {
      const t = s / samplesPerSegment
      pts.push({
        x: catmullRom(p0.x, p1.x, p2.x, p3.x, t),
        y: catmullRom(p0.y, p1.y, p2.y, p3.y, t),
        half: catmullRom(p0.half, p1.half, p2.half, p3.half, t),
      })
    }
  }

  const m = pts.length

  // Cumulative arc length, so distance along the line is true metres. Without
  // this, "distance" would be spline parameter and the AI's braking distances
  // -- which are in metres -- would be wrong by a factor that varies with
  // corner radius, i.e. worst exactly where it matters.
  const cum: number[] = new Array(m)
  let total = 0
  for (let i = 0; i < m; i++) {
    cum[i] = total
    const a = pts[i]
    const b = pts[(i + 1) % m]
    total += Math.hypot(b.x - a.x, b.y - a.y)
  }

  // Heading from central differences, then curvature as d(heading)/ds. Central
  // rather than forward differences because a forward difference biases the
  // heading half a sample ahead, which reads as a constant steering offset.
  const heading: number[] = new Array(m)
  for (let i = 0; i < m; i++) {
    const a = pts[(i - 1 + m) % m]
    const b = pts[(i + 1) % m]
    heading[i] = Math.atan2(b.y - a.y, b.x - a.x)
  }

  const curvature: number[] = new Array(m)
  for (let i = 0; i < m; i++) {
    const hPrev = heading[(i - 1 + m) % m]
    const hNext = heading[(i + 1) % m]
    let dh = (hNext - hPrev) % (Math.PI * 2)
    if (dh > Math.PI) dh -= Math.PI * 2
    if (dh < -Math.PI) dh += Math.PI * 2
    const aPt = pts[(i - 1 + m) % m]
    const bPt = pts[(i + 1) % m]
    const ds = Math.hypot(bPt.x - aPt.x, bPt.y - aPt.y)
    curvature[i] = ds > 1e-6 ? dh / ds : 0
  }

  // Uniform-distance index so at() is O(1) rather than a search. The driver
  // calls it hundreds of times per tick; a binary search here would show up.
  const step = total / m
  const byDistance: number[] = new Array(m)
  {
    let j = 0
    for (let k = 0; k < m; k++) {
      const d = k * step
      while (j < m - 1 && cum[j + 1] <= d) j++
      byDistance[k] = j
    }
  }

  function at(distance: number): LinePoint {
    let d = distance % total
    if (d < 0) d += total

    /* The uniform bucket gives a CANDIDATE segment, not the right one.
     * Buckets are evenly spaced in distance while segments are not, so d can
     * lie past the candidate's end -- and clamping t to 1 then returned the
     * segment's END POINT for every d in the overshoot. The line froze for up
     * to ~2 m at a time, 245 times per lap, which corrupted the road ribbon,
     * nearest-point lookup, curvature feed-forward, braking samples and lap
     * progress all at once, and did so silently because every consumer shared
     * the same wrong implementation.
     *
     * So advance from the candidate until the segment really contains d. The
     * bucket makes this O(1) amortised rather than a search; the guard on
     * `steps` stops a malformed cumulative table spinning forever. */
    const k = Math.min(m - 1, Math.max(0, Math.floor(d / step)))
    let i = byDistance[k]
    for (let steps = 0; steps < m; steps++) {
      const next = (i + 1) % m
      const end = next === 0 ? total : cum[next]
      if (d < end || next === 0) break
      i = next
    }

    const iNext = (i + 1) % m
    const segEnd = iNext === 0 ? total : cum[iNext]
    const segLen = Math.max(1e-6, segEnd - cum[i])
    const t = Math.min(1, Math.max(0, (d - cum[i]) / segLen))

    const a = pts[i]
    const b = pts[iNext]

    // Headings are angles: lerping them naively through the +-pi wrap would
    // swing a car through 360 degrees at one point on every lap.
    let dh = (heading[iNext] - heading[i]) % (Math.PI * 2)
    if (dh > Math.PI) dh -= Math.PI * 2
    if (dh < -Math.PI) dh += Math.PI * 2

    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      heading: heading[i] + dh * t,
      curvature: curvature[i] + (curvature[iNext] - curvature[i]) * t,
      half: a.half + (b.half - a.half) * t,
    }
  }

  return { length: total, at }
}
