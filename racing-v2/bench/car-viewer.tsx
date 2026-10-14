/* Dev-only bench page: renders one archetype from four fixed angles for
 * screenshot comparison against the approved design targets.
 *
 * This file is NOT part of the production bundle. vite.config.ts builds only
 * src/main.tsx, so bench pages never ship; they exist under `npm run dev`.
 *
 * Query params:
 *   car=boxcoupe|roundcoupe|compactclassic|sport|...
 *   angle=rear|rear34|front34|side
 *   paint=%23rrggbb (optional override)
 *   finish=gloss|metallic|pearl|matte|chrome (optional, defaults per car)
 *   spoiler=none|lip|duck|gt|straight (optional garage override)
 */
import { createRoot } from 'react-dom/client'
import { useLayoutEffect } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { ProceduralCar } from '../src/art/ProceduralCar'
import { useEnvironment } from '../src/art/useEnvironment'

const params = new URLSearchParams(location.search)
const car = params.get('car') || 'boxcoupe'
const angle = params.get('angle') || 'rear'
const paint = params.get('paint') || undefined
const finish = params.get('finish') || undefined
const spoiler = params.get('spoiler') || undefined

const CAMERAS: Record<string, { pos: [number, number, number]; look: [number, number, number] }> = {
  // Car forward is +Z (ProceduralCar normalises it), so the chase view of the
  // rear sits on the -Z side looking slightly down, like the in-game camera.
  rear: { pos: [0, 1.45, -5.8], look: [0, 0.62, 0] },
  rear34: { pos: [-3.6, 1.75, -4.6], look: [0, 0.6, 0] },
  front34: { pos: [3.6, 1.6, 5.2], look: [0, 0.6, 0] },
  side: { pos: [6.6, 1.15, 0], look: [0, 0.6, 0] },
}
const CAM = CAMERAS[angle] || CAMERAS.rear

function CameraRig() {
  const { camera } = useThree()
  useLayoutEffect(() => {
    camera.position.set(...CAM.pos)
    camera.lookAt(...CAM.look)
    camera.updateProjectionMatrix()
  }, [camera])
  return null
}

function Metrics() {
  const gl = useThree((s) => s.gl)
  useFrame(() => {
    ;(window as unknown as { __viewerInfo?: unknown }).__viewerInfo = {
      calls: gl.info.render.calls,
      triangles: gl.info.render.triangles,
      car,
      angle,
    }
  })
  return null
}

function Car() {
  const env = useEnvironment('#6f8bb8')
  return <ProceduralCar archetype={car} paint={paint} finish={finish} spoiler={spoiler} env={env} />
}

createRoot(document.getElementById('root')!).render(
  <Canvas
    shadows
    dpr={1}
    camera={{ fov: 40, near: 0.1, far: 200, position: CAM.pos }}
    style={{ width: 1280, height: 720 }}
  >
    <color attach="background" args={['#9fb3d4']} />
    <hemisphereLight args={['#9fb3d4', '#2a2e26', 0.5]} />
    <directionalLight
      position={[8, 12, 4]}
      intensity={1.35}
      color="#fff3e0"
      castShadow
      shadow-mapSize={[2048, 2048]}
      shadow-bias={-0.0004}
      shadow-camera-left={-10}
      shadow-camera-right={10}
      shadow-camera-top={10}
      shadow-camera-bottom={-10}
    />
    <directionalLight position={[-6, 4, -3]} intensity={0.35} color="#9db6e0" />
    <directionalLight position={[0, 2.5, -9]} intensity={0.5} color="#ffd9a8" />
    <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[60, 60]} />
      <meshStandardMaterial color="#565a5e" roughness={0.95} metalness={0} />
    </mesh>
    <CameraRig />
    <Metrics />
    <Car />
  </Canvas>,
)

// Screenshot sync: the bench script waits for this after N settled frames.
let frames = 0
function tick() {
  frames += 1
  if (frames === 6) (window as unknown as { __viewerReady?: boolean }).__viewerReady = true
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)
