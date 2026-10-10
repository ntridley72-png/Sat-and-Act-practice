/* A graded sky dome.
 *
 * Generated in a shader, not from an HDR image: this project ships no
 * textures, and a two-stop vertical gradient with a warm band at the horizon
 * is all an arcade racer needs. It also gives the fog something to blend
 * into, which is what stops the world looking like it ends at the grass.
 *
 * BackSide on a large sphere, depthWrite off, and rendered first so it never
 * occludes anything.
 */
import { useMemo } from 'react'
import * as THREE from 'three'

export function Sky() {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          top: { value: new THREE.Color('#2d4straight'.replace('straight', '366')) },
          horizon: { value: new THREE.Color('#8fa4bd') },
          bottom: { value: new THREE.Color('#121820') },
        },
        vertexShader: `
          varying vec3 vPos;
          void main() {
            vPos = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 top;
          uniform vec3 horizon;
          uniform vec3 bottom;
          varying vec3 vPos;
          void main() {
            float h = normalize(vPos).y;
            // Two ramps meeting at the horizon, with the horizon band kept
            // tight so it reads as distance haze rather than a stripe.
            vec3 c = h > 0.0
              ? mix(horizon, top, pow(clamp(h, 0.0, 1.0), 0.55))
              : mix(horizon, bottom, pow(clamp(-h, 0.0, 1.0), 0.35));
            gl_FragColor = vec4(c, 1.0);
          }
        `,
      }),
    [],
  )

  return (
    <mesh material={material} renderOrder={-1} frustumCulled={false}>
      <sphereGeometry args={[800, 24, 16]} />
    </mesh>
  )
}
