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
