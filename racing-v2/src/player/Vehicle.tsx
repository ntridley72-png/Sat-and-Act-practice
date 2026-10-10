/* The player car: upstream's raycast vehicle with its tuning intact.
 *
 * Structure follows vendor/pmndrs-racing-game/src/models/vehicle/Vehicle.tsx,
 * including the per-frame camera sway, because a lot of what makes that game
 * feel good is the sway rather than the physics. The chassis mesh and wheels
 * are procedural; everything else is upstream's approach.
 */
import { useLayoutEffect, useRef } from 'react'
import { MathUtils, Vector3 } from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { useBox, useRaycastVehicle } from '@react-three/cannon'
import type { Group } from 'three'
import type { WheelInfoOptions } from '@react-three/cannon'
import { createRef } from 'react'
import { ProceduralCar } from '../art/ProceduralCar'
import { Wheel } from './Wheel'
import { vehicleConfig, wheelInfo, playerMutation } from './config'
import { useControls } from './useControls'
import { mutation } from '../ai/mutation'

const { lerp } = MathUtils
const v = new Vector3()

/** Collision box height. The body mesh is offset down by half of this so the
 *  car's ground-level origin lines up with the bottom of the box. */
const CHASSIS_HEIGHT = 1.2

export interface VehicleProps {
  position?: [number, number, number]
  rotation?: [number, number, number]
  archetype?: string
  paint?: string
}

export function Vehicle({ position = [0, 1, 0], rotation = [0, 0, 0], archetype = 'sport', paint }: VehicleProps) {
  const defaultCamera = useThree((state) => state.camera)
  const controls = useControls()

  const [chassisBody] = useBox(() => ({
    mass: 500,
    args: [vehicleConfig.width, CHASSIS_HEIGHT, 4.4],
    position,
    rotation,
    allowSleep: false,
  }))

  const wheelRefs = useRef([createRef<Group>(), createRef<Group>(), createRef<Group>(), createRef<Group>()] as const)

  const { back, force, front, height, maxBrake, steer, maxSpeed, width } = vehicleConfig

  /* Wheel placement follows upstream exactly: indices 0,1 are the front axle
     (z = front), 2,3 the rear (z = back), and the side alternates. Keeping
     upstream's indexing means its tuning constants still mean what they meant. */
  const wheelInfos = wheelRefs.current.map((_, index): WheelInfoOptions => {
    const length = index < 2 ? front : back
    const sideMulti = index % 2 ? 0.5 : -0.5
    return {
      ...wheelInfo,
      chassisConnectionPointLocal: [width * sideMulti, height, length],
      isFrontWheel: index < 2,
    }
  })

  const [, api] = useRaycastVehicle(() => ({
    chassisBody,
    wheels: wheelRefs.current as unknown as React.RefObject<Group>[],
    wheelInfos,
  }))

  useLayoutEffect(() => api.sliding.subscribe((sliding) => (playerMutation.sliding = sliding)), [api])

  // Per-frame scratch, kept outside the callback so it is not reallocated 60
  // times a second.
  const state = useRef({ engineValue: 0, steeringValue: 0, speed: 0, swayValue: 0, swayTarget: 0, swaySpeed: 0 })

  useFrame((_, delta) => {
    const s = state.current
    const c = controls.current

    const speed = playerMutation.speed
    const engine = c.forward ? force : c.backward ? -force : 0
    // Cut drive above maxSpeed rather than clamping velocity: clamping would
    // fight the solver and make the car feel like it hit a wall.
    s.engineValue = lerp(s.engineValue, Math.abs(speed) > maxSpeed ? 0 : engine, delta * 12)

    const steerTarget = c.left ? steer : c.right ? -steer : 0
    s.steeringValue = lerp(s.steeringValue, steerTarget, delta * 14)

    for (const i of [2, 3]) api.applyEngineForce(s.engineValue, i)
    for (const i of [0, 1]) api.setSteeringValue(s.steeringValue, i)
    for (const i of [0, 1, 2, 3]) api.setBrake(c.brake ? maxBrake : 0, i)

    /* The camera sway. Upstream computes a target from steering and speed and
       lerps toward it; this is a large part of why their game feels quick even
       at modest speeds, so it is reproduced rather than reinvented. */
    s.swayTarget = -s.steeringValue * Math.min(1, Math.abs(speed) / 30) * 0.6
    s.swaySpeed = lerp(s.swaySpeed, s.swayTarget, delta * 4)
    s.swayValue = lerp(s.swayValue, s.swaySpeed, delta * 6)

    if (chassisBody.current) {
      chassisBody.current.getWorldPosition(v)
      // Publish the player into the shared slot so AI drivers avoid and
      // overtake it rather than treating it as scenery.
      mutation.player.x = v.x
      mutation.player.y = v.z
      mutation.player.active = true

      defaultCamera.position.lerp(
        v.clone().add(new Vector3(Math.sin(s.swayValue) * 10, 5.5, Math.cos(s.swayValue) * -12)),
        Math.min(1, delta * 3),
      )
      defaultCamera.lookAt(v)
    }
  })

  return (
    <group>
      <group ref={chassisBody as never}>
        {/* Two things going on here.
            wheels={false}: the raycast vehicle owns the wheels, positioning
            them from the suspension every frame; the body must not draw its
            own or the car has eight.
            position y = -CHASSIS_HEIGHT/2: racing3d.js builds a car whose
            ORIGIN IS GROUND LEVEL (wheel centres sit at y = radius), but a
            cannon box is centred on its origin. Without this offset the
            bodywork floats half a box above its own wheels. */}
        <group position={[0, -CHASSIS_HEIGHT / 2, 0]}>
          <ProceduralCar archetype={archetype} paint={paint} wheels={false} />
        </group>
      </group>
      {wheelRefs.current.map((ref, i) => (
        <Wheel key={i} ref={ref} leftSide={i % 2 === 0} paint={paint} />
      ))}
    </group>
  )
}
