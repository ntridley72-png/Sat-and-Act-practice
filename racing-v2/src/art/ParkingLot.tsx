import { useBox, usePlane } from '@react-three/cannon'
import type { ThemeSpec } from '../tracks/format'

export const LOT_HALF_WIDTH = 80
export const LOT_HALF_DEPTH = 55

function Barrier({ position, size }: { position: [number, number, number]; size: [number, number, number] }) {
  const [ref] = useBox(() => ({ type: 'Static', args: size, position }))
  return <mesh ref={ref as never} receiveShadow castShadow><boxGeometry args={size} /><meshStandardMaterial color="#d0cbc0" roughness={.85} /></mesh>
}

function TireStack({ x, z }: { x: number; z: number }) {
  const [ref] = useBox(() => ({ type: 'Static', args: [1.4, .95, 1.4], position: [x, .475, z] }))
  return (
    <group ref={ref as never}>
      {[0, 1, 2].map((i) => <mesh key={i} position={[0, -.3 + i * .3, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[.48, .15, 8, 16]} /><meshStandardMaterial color="#202126" roughness={.96} />
      </mesh>)}
    </group>
  )
}

function Cone({ x, z }: { x: number; z: number }) {
  const [ref] = useBox(() => ({ type: 'Static', args: [.55, .7, .55], position: [x, .35, z] }))
  return (
    <group ref={ref as never}>
      <mesh position={[0, -.3, 0]} castShadow><boxGeometry args={[.6, .1, .6]} /><meshStandardMaterial color="#22242a" /></mesh>
      <mesh castShadow><coneGeometry args={[.25, .65, 12]} /><meshStandardMaterial color="#f87925" roughness={.75} /></mesh>
      <mesh position={[0, .08, 0]}><cylinderGeometry args={[.09, .14, .13, 12]} /><meshStandardMaterial color="#fff3dc" roughness={.85} /></mesh>
    </group>
  )
}

/** Actual open asphalt: no circuit ribbon, gantry or lap geometry. */
export function ParkingLot({ theme }: { theme: ThemeSpec }) {
  usePlane(() => ({ type: 'Static', rotation: [-Math.PI / 2, 0, 0] }))
  const W = LOT_HALF_WIDTH, D = LOT_HALF_DEPTH
  return (
    <group name="drift-parking-lot">
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -.04, 0]} receiveShadow>
        <planeGeometry args={[600, 600]} /><meshStandardMaterial color={theme.ground} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[W * 2, D * 2]} /><meshStandardMaterial color="#45494d" roughness={.93} metalness={.02} />
      </mesh>
      {[-1, 1].map((side) => <group key={side}>
        {Array.from({ length: 24 }, (_, i) => <mesh key={i} position={[-69 + i * 6, .016, side * (D - 7)]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[.12, 9]} /><meshBasicMaterial color="#e3dfc9" toneMapped={false} />
        </mesh>)}
        <mesh position={[0, .017, side * (D - 12)]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[140, .12]} /><meshBasicMaterial color="#e3dfc9" toneMapped={false} />
        </mesh>
        <Barrier position={[0, .35, side * D]} size={[W * 2, .7, .8]} />
        <Barrier position={[side * W, .35, 0]} size={[.8, .7, D * 2]} />
      </group>)}
      {Array.from({ length: 12 }, (_, i) => {
        const angle = i * Math.PI / 6
        return <Cone key={i} x={Math.cos(angle) * 24} z={Math.sin(angle) * 24} />
      })}
      {[[-38, -22], [38, 22], [-38, 22], [38, -22]].map(([x, z]) => <TireStack key={x + ':' + z} x={x} z={z} />)}
      {[-1, 1].flatMap((x) => [-1, 1].map((z) => <group key={x + ':' + z} position={[x * (W + 4), 0, z * (D - 10)]}>
        <mesh position={[0, 4, 0]} castShadow><cylinderGeometry args={[.08, .14, 8, 8]} /><meshStandardMaterial color="#78818a" metalness={.6} roughness={.5} /></mesh>
        <mesh position={[0, 8, 0]}><boxGeometry args={[1.5, .18, .7]} /><meshStandardMaterial color="#fff2cd" emissive="#ffdca0" emissiveIntensity={.35} /></mesh>
      </group>))}
    </group>
  )
}
