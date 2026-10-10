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
    const k = Math.min(m - 1, Math.max(0, Math.floor(d / step)))
    const i = byDistance[k]
    const iNext = (i + 1) % m
    const segLen = Math.max(1e-6, (cum[iNext] || total) - cum[i])
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

/* ORIGINAL CIRCUIT: "Apex Flats".
 *
 * An original layout, authored here rather than traced from anything. The
 * sequencing follows ideas that make a circuit fun -- which are ideas, not
 * protectable expression: a long straight to set up overtakes, a hairpin that
 * rewards late braking, a fast sweeper that punishes an early lift, and a
 * narrowing chicane where the road tightens so the AI's lateral-offset
 * avoidance actually has to commit.
 *
 * half-width varies deliberately: wide on the straight (easy side-by-side),
 * tight through the chicane (forces single file). */
export const APEX_FLATS: readonly ControlPoint[] = [
  { x: 0, y: 0, half: 9 },        // start/finish, wide
  { x: 120, y: 0, half: 9 },      // end of the long straight
  { x: 160, y: 18, half: 7 },     // turn-in
  { x: 168, y: 56, half: 5.5 },   // hairpin apex, tight
  { x: 140, y: 78, half: 6 },     // hairpin exit
  { x: 96, y: 72, half: 7.5 },    // short link
  { x: 62, y: 96, half: 5 },      // chicane left, narrow
  { x: 28, y: 86, half: 5 },      // chicane right, narrow
  { x: -14, y: 104, half: 7 },    // fast sweeper entry
  { x: -58, y: 78, half: 8 },     // sweeper apex
  { x: -62, y: 34, half: 8 },     // sweeper exit onto the straight
  // Final corner sits at x=-46 rather than a tighter -30 for a measured
  // reason: at -30 the spline's tightest radius came out at 8.6m, inside the
  // driver's KMAX_DEMAND floor of 1/0.09 = 11.1m, so the AI could not take it
  // on the line at any speed and understeered wide every single lap. Widening
  // it moves the tightest point to the chicane at 13.2m, which is drivable.
  // tools/tune-corner.mjs found this; tools/line-check.mjs guards it.
  { x: -46, y: 0, half: 9 },      // final corner back to the line
]
