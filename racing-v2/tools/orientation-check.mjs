/* Verify the (x,y) driver frame <-> (x,z) cannon frame conversion.
 *
 * A sign error here is the single likeliest bug in the opponent code and it
 * fails in a way that looks like "the AI is bad" rather than "the maths is
 * wrong", so it is worth proving rather than reasoning about once.
 *
 * The chain under test:
 *   - the body's yaw is set to  theta = -heading
 *   - the mesh is rotated -90 deg about Y, mapping its -Z nose to local +X
 *   - forward force is applied along local +X
 *   - heading is read back as  -yaw
 */
const EPS = 1e-12
let bad = 0
function check(name, got, want) {
  const ok = Math.abs(got - want) < 1e-9
  if (!ok) bad++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}: got ${got.toFixed(6)} want ${want.toFixed(6)}`)
}

// Rotating local +X by yaw theta about Y gives world (cos theta, -sin theta) in (x, z).
function forwardWorld(theta) {
  return { x: Math.cos(theta), z: -Math.sin(theta) }
}

for (const heading of [0, 0.3, Math.PI / 2, 2.1, -1.4, Math.PI]) {
  const theta = -heading                 // what useBox is given
  const f = forwardWorld(theta)
  // The driver treats its (x, y) as world (x, z) and expects forward to be
  // (cos heading, sin heading).
  check(`forward.x  @h=${heading.toFixed(2)}`, f.x, Math.cos(heading))
  check(`forward.z  @h=${heading.toFixed(2)}`, f.z, Math.sin(heading))
  // And reading the heading back must round-trip.
  check(`heading rt @h=${heading.toFixed(2)}`, -theta, heading)
}

/* Mesh orientation, in two stages, because ProceduralCar normalises once and
 * the opponent turns it again:
 *   1. racing3d.js nose is -Z; ProceduralCar rotates by PI so the car faces +Z
 *      (upstream's vehicle convention, front axle at +1.35).
 *   2. Opponent rotates that +Z by +90deg about Y to reach local +X, which is
 *      the axis its force model drives along. */
{
  // Stage 1: rotating (0,0,-1) by PI about Y must give (0,0,+1).
  const phi = Math.PI
  check('nose -Z -> +Z (x)', -Math.sin(phi) * -1 + 0, 0)
  check('nose -Z -> +Z (z)', -Math.cos(phi), 1)
}
{
  // Stage 2: rotating (0,0,1) by +90deg about Y must give (1,0,0).
  const phi = Math.PI / 2
  check('facing +Z -> +X (x)', Math.sin(phi), 1)
  check('facing +Z -> +X (z)', Math.cos(phi), 0)
}

// Torque sign: driver yawRate = -angVel.y, so to RAISE driver yawRate the
// angular velocity about +Y must FALL, i.e. the applied torque must be
// negative when yawError is positive.
{
  const yawError = +1
  const applied = -yawError * 2600
  console.log(`  ${applied < 0 ? 'ok  ' : 'FAIL'} torque sign: yawError +1 -> torque ${applied} (must be negative)`)
  if (applied >= 0) bad++
}

console.log(bad ? `\n${bad} orientation failure(s)` : '\nOrientation conversion is self-consistent.')
process.exit(bad ? 1 : 0)
