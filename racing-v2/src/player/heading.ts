/** Heading of the chassis' forward (+Z) axis, without Euler quarter-turn folding. */
export function planarHeading(q: { x: number; y: number; z: number; w: number }): number {
  return Math.atan2(2 * (q.x * q.z + q.w * q.y), 1 - 2 * (q.x * q.x + q.y * q.y))
}

/** Heading of the chassis' forward (+Z) axis from its 4x4 matrix (column-major, as three.js stores it).
 *
 *  @react-three/cannon 6.6 writes a body's pose straight into `object.matrix` and switches
 *  `matrixAutoUpdate` off, so `object.quaternion` keeps its construction value forever. Reading
 *  the heading from the quaternion therefore returned the START heading for the whole race: the
 *  chase camera never turned with the car and every "which way am I pointing" calculation was
 *  stale. The matrix is the live pose. */
export function matrixHeading(e: ArrayLike<number>): number {
  return Math.atan2(e[8], e[10])
}

/** The chassis' up vector's Y component (1 = level), from the same live matrix. */
export function matrixUpright(e: ArrayLike<number>): number {
  return e[5]
}
