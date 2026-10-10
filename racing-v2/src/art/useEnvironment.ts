/* Shared reflection environment for every car on track.
 *
 * WHY THIS MATTERS MORE THAN IT SOUNDS. The paint materials are
 * MeshPhysicalMaterial with metalness up to 0.5 and a full clearcoat layer.
 * Metal and clearcoat are almost entirely REFLECTION -- with envMap null
 * there is nothing for them to reflect, so a metallic red reads as flat
 * plastic red and the clearcoat does nothing at all. Giving them an
 * environment is the single largest visual change available here, and it
 * costs one 512x256 canvas.
 *
 * Built once per renderer and shared by every car: PMREM convolution is not
 * cheap, and thirteen identical environments would be thirteen times the cost
 * for an identical result.
 */
import { useMemo } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { makeEnvTexture } from './carGeometry'

export function useEnvironment(accent: string | null = null): THREE.Texture | null {
  const gl = useThree((s) => s.gl)

  return useMemo(() => {
    try {
      const pmrem = new THREE.PMREMGenerator(gl)
      pmrem.compileEquirectangularShader()
      const tex = makeEnvTexture(THREE, gl, accent, pmrem)
      // The generator holds GPU resources; the texture it produced does not
      // depend on it afterwards.
      pmrem.dispose()
      return tex
    } catch {
      // Reflections are a quality improvement, not a requirement. A device
      // that cannot run PMREM still gets a drivable car.
      return null
    }
  }, [gl, accent])
}
