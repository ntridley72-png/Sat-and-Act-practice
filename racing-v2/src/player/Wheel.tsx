/* One wheel of the player car: a kinematic cylinder collider plus procedural
 * geometry. Upstream loaded wheel-draco.glb here; this project ships no
 * meshes, so the wheel is built by the same generator the bodies use.
 */
import { forwardRef, useMemo } from 'react'
import * as THREE from 'three'
import { useCompoundBody } from '@react-three/cannon'
import type { CylinderProps } from '@react-three/cannon'
import type { Group } from 'three'
import { buildWheel, materials, CARS } from '../art/carGeometry'
import { wheelInfo } from './config'
import { useEnvironment } from '../art/useEnvironment'

interface WheelProps extends CylinderProps {
  leftSide?: boolean
  paint?: string
}

export const Wheel = forwardRef<Group, WheelProps>(({ leftSide, paint, ...props }, ref) => {
  const { radius } = wheelInfo
  const env = useEnvironment()

  useCompoundBody(
    () => ({
      mass: 50,
      type: 'Kinematic',
      material: 'wheel',
      // collisionFilterGroup 0: the wheels must not collide with anything
      // themselves. The raycast vehicle resolves ground contact by raycast;
      // a wheel that also collided would fight its own suspension.
      collisionFilterGroup: 0,
      shapes: [{ args: [radius, radius, 0.5, 16], rotation: [0, 0, -Math.PI / 2], type: 'Cylinder' }],
      ...props,
    }),
    ref,
    [radius],
  )

  const mesh = useMemo(() => {
    const car = CARS.sport
    const mats = materials(THREE, paint ?? car.paint, car.finish, env)
    // Scale the archetype's wheel to the physics radius, so the mesh and the
    // collider agree however the archetype was authored.
    const spec = { ...car.wheel, radius: wheelInfo.radius }
    return buildWheel(THREE, mats, spec, leftSide ? -1 : 1, { details: true })
  }, [leftSide, paint, env])

  return (
    <group ref={ref} dispose={null}>
      <primitive object={mesh} />
    </group>
  )
})
Wheel.displayName = 'Wheel'
