/* Starting-grid geometry.
 *
 * ONE function owns the layout and both the player and the AI call it. That
 * is the point: when the player computed its own start position and the
 * opponents computed theirs, the two formations did not agree -- the player
 * sat on the centreline while the field lined up either side of it, so it
 * never read as a grid. A single source means the player is simply slot 0.
 *
 * The layout is the conventional staggered two-by-two: pairs abreast, the
 * right-hand car of each pair set back half a row so the field reads as a
 * diagonal rather than a wall, and each row a car-length-plus behind the one
 * in front.
 */
import type { RacingLine } from './racingLine'

/** Metres between rows. A car is 4.3 m, so this leaves a clear gap. */
const ROW_GAP = 7.5
/** Half-stagger applied to the right-hand car of each pair. */
const STAGGER = 2.6
/** Lateral offset from the centreline, metres. */
const LATERAL = 2.3
/** How far back from the start line the front row sits. */
const FRONT_ROW_SETBACK = 6

export interface GridSlot {
  /** Distance along the racing line, already wrapped. */
  distance: number
  /** Lateral offset; positive is left of travel. */
  lateral: number
  /** World position and heading, ready for a physics body. */
  x: number
  z: number
  heading: number
  /** 1-based grid position, for the UI. */
  position: number
}

/* TWO yaw conventions exist in this project and mixing them is a real bug,
 * not a nitpick, so both are provided here rather than recomputed per caller.
 *
 *   yawForXForward: the AI opponents, whose force model drives along local +X.
 *     Rotating local +X by yaw maps it to world (cos yaw, -sin yaw), so
 *     yaw = -heading points it along the line.
 *
 *   yawForZForward: the player's raycast vehicle, which follows upstream's
 *     convention of the front axle at +Z (vehicleConfig.front = +1.35).
 *     Rotating local +Z by yaw maps it to world (sin yaw, cos yaw), so
 *     yaw = pi/2 - heading points it along the line.
 *
 * Using the +X form for the player started it ninety degrees across the
 * track, which read as "the controls are backwards" rather than as a bad
 * spawn rotation. */
export function yawForXForward(heading: number): number {
  return -heading
}

export function yawForZForward(heading: number): number {
  return Math.PI / 2 - heading
}

/** Slot `index` on the grid. 0 is pole. */
export function gridSlot(line: RacingLine, index: number): GridSlot {
  const row = Math.floor(index / 2)
  const onRight = index % 2 === 1

  // Measured BACKWARDS from the start line, then wrapped, so the grid sits
  // behind the line rather than on top of the first corner.
  const back = FRONT_ROW_SETBACK + row * ROW_GAP + (onRight ? STAGGER : 0)
  const distance = (line.length - back + line.length) % line.length

  const p = line.at(distance)
  const lateral = onRight ? -LATERAL : LATERAL
  // Offset along the line's left normal.
  const nx = -Math.sin(p.heading)
  const nz = Math.cos(p.heading)

  return {
    distance,
    lateral,
    x: p.x + nx * lateral,
    z: p.y + nz * lateral,
    heading: p.heading,
    position: index + 1,
  }
}
