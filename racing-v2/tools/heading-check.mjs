import assert from 'node:assert/strict'
import { planarHeading } from '../src/player/heading'

// Real input can hit a cone before turning 90 degrees. Check the exact
// production heading function over complete turns independently of obstacles.
for (let i = -720; i <= 720; i++) {
  const yaw = i * Math.PI / 180
  const q = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }
  const heading = planarHeading(q)
  assert(Math.abs(Math.sin(heading) - Math.sin(yaw)) < 1e-10)
  assert(Math.abs(Math.cos(heading) - Math.cos(yaw)) < 1e-10)
}
assert(planarHeading({ x: 0, y: Math.sin(1), z: 0, w: Math.cos(1) }) > Math.PI / 2)
console.log('PASS: production chassis heading remains correct through quarter-turns and full donuts.')

// The live pose is the object's matrix (cannon 6.6 never touches .quaternion): the matrix heading
// must agree with the quaternion heading for the same rotation, through a full turn.
import { matrixHeading, matrixUpright } from '../src/player/heading'
for (let a = -3; a <= 3; a += 0.25) {
  const c = Math.cos(a), s = Math.sin(a)
  // column-major rotation about Y by `a`
  const e = [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]
  const h = matrixHeading(e)
  assert(Math.abs(Math.atan2(Math.sin(h - a), Math.cos(h - a))) < 1e-9, `matrix heading wrong at ${a}`)
  assert(matrixUpright(e) === 1, 'a level chassis reports upright 1')
}
console.log('PASS: matrix heading tracks the live pose through a full turn.')
