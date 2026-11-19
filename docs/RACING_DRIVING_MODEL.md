# Racing v2: how the player car drives

What changed in the player car, and why. Numbers come from `racing-v2/bench/handling.cjs`
(measured through the page's `__rv2probe`) and are pinned loosely by `tests/racing-v2-handling.cjs`.

## A bug that hid everything else

`@react-three/cannon` 6.6 writes a body's pose into `object.matrix` and turns `matrixAutoUpdate`
off; `object.quaternion` keeps its construction value forever. `Vehicle.tsx` read the heading from
the quaternion, so the heading was the *start* heading for the whole race. The chase camera never
turned with the car, the drift detector used a fixed heading, and any calculation that needed
"which way am I pointing" was stale. The heading is now read from the matrix (`matrixHeading` in
`src/player/heading.ts`).

## Keyboard driving (racing, not the drift playground)

* Throttle and brake are pedals: they ramp (`driving.throttleRise/Fall`, `brakeRise/Fall`), they do
  not snap.
* **S brakes while the car moves forward and only reverses once it has stopped.** Reverse is a
  crawl (`reversePower`, `reverseMax`). Brake force is split front-heavy (`brakeFront/Rear`).
* Power is full torque up to a knee at 55% of top speed, then a power-limited fade to the top
  speed, with a short torque dip at each upshift. Gear and engine speed are simulated for the
  read-outs and the engine note (the pitch climbs through each gear and drops at every shift).
* The steering lock is limited by grip: `atan(mu * g * wheelbase / v^2)`, so asking for more lock
  than the tyres can hold at speed does nothing. Measured: about 0.8-0.9 g of cornering at 13, 17
  and 23 m/s with the lock that produces. Lock changes at a speed-dependent rate and self-centres
  quickly.
* A slide helper nudges the front wheels toward the velocity only when the car slides much more
  than a normal turn explains. It fades out under the handbrake.
* Lifting off sheds a little speed (rolling resistance plus a light engine brake).
* The body leans out of corners and dips under braking (visual only).
* The camera drops back and the lens widens with speed (46 to 58 degrees).

## Laptops

* **X is a second handbrake key.** Many laptop keyboards cannot report W + A + Space together.
* `QualityGovernor` (in `App.tsx`) watches the real frame rate and, when it stays under about 40
  fps, steps the pixel ratio down, then turns shadow maps off; it steps back up only after a long
  stretch of headroom. Physics is untouched.

## Measured on the bench

| Measure | Value |
| --- | --- |
| 0 to 10 / 20 / 30 m/s | 1.9 s / 3.4 s / 7.2 s |
| Top speed | 30.8 m/s (limit 32) |
| Braking from 30.8 m/s | 3.0 s, 51 m, peak 1.2 g |
| Reverse top speed | about 10 m/s |

The bench renders in software at a few frames per second, which stretches time but not the physics.
The drift playground (`sandbox`) keeps its original controls because its scoring was tuned on them.
