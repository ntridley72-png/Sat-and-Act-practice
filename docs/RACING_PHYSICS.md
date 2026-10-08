# Racing physics

The vehicle model in `racing/core/vehicle-physics.js`. Original equations written
for this game: no VDrift source, constants, class structure or translated code.
Every figure in `racing/data/cars.js` is invented for gameplay and describes no
real vehicle.

Units are metres, seconds, kilograms and radians throughout. The renderer
applies its own display scale; the simulation never sees it.

## Shape of the model

A two-axle bicycle model. Front and rear axles each carry one effective tyre.
That is enough to produce slip angles, load transfer, countersteer, understeer,
power oversteer and a handbrake slide, while staying cheap enough to run at
60 Hz on a low-end Chromebook alongside the rest of the page.

State is position, heading, body-frame velocity, yaw rate, engine speed, gear,
wheelspin, axle loads, slip angles, steer angle, surface per axle and boost.
`step()` advances exactly one tick and reads nothing outside its arguments,
which is what makes a run reproducible from a seed and an input log.

## Tick order

1. Difficulty assists adjust the **input** only.
2. Steering moves toward its target at a finite rate.
3. Slip angles from lateral velocity, yaw rate, axle distances and steer angle.
4. Axle loads: static split plus longitudinal transfer from the last tick's
   acceleration.
5. Engine, gearbox, turbo and drivetrain produce a driving force, capped by the
   friction available at the driven axle; the excess becomes wheelspin.
6. Lateral forces from slip angle, scaled by load, surface, weather, tune and
   whatever grip the driven axle has left after accelerating.
7. Handbrake cuts rear grip without touching front steering authority.
8. Forces and the yaw moment integrate semi-implicitly; drag and rolling
   resistance apply last.

## Load sensitivity

Lateral force scales with `load^0.80`, normalised so an evenly balanced axle is
unchanged. Grip grows more slowly than the load carried, so a heavily loaded
axle is proportionally less effective than a light one.

This is not decoration. Without it a nose-heavy car generates more force at the
front than the rear at saturation, the yaw moment never reverses, and the car
spins and stays spinning. Load sensitivity is what turns a forward weight bias
into understeer instead of instability.

## The steering limiter

The most important single decision in the model, and the one that took longest
to find.

A steady turn of radius `L/d` at speed `v` demands `v²·d/L` of lateral
acceleration. Tyres supply roughly 1g. So the useful steering angle at speed is
set by grip, not by the rack:

```
gripLimited = steerAuthority · g · wheelbase / v²
target      = input · min(maxSteer, gripLimited · steerMargin)
```

`steerAuthority` (1.05) is the lateral g the limiter aims for. `steerMargin`
(1.45) is how far past it the driver may overdrive the front wheels, so a slide
can still be provoked deliberately.

The first version scaled lock by a flat `1/(1 + k·v)`. At 60 km/h that still
produced 11° of road-wheel angle, which demands about 2.1g. Every car therefore
slid in every situation, including a light throttle through a gentle corner. The
symptom looked like an instability and resisted several rounds of damping; the
cause was that the car was being asked for grip that does not exist.

## Yaw damping

The rear slip angle already carries a `-yawRate·rearAxle/speed` term that
opposes rotation, so the model damps its own yaw while the tyres are below their
peak. Past the peak that self-damping saturates and a fully sideways car has no
restoring moment left.

A small explicit term (`yawDamping`, 0.45 for most cars) stands in for the tyre
relaxation and suspension effects a two-tyre model omits. With the steering
limiter in place the cars are stable at any value in the swept range, so it is
set for feel: low enough to keep turn-in sharp and handbrake drifts long.

## The friction circle

A tyre has one grip budget and cannot spend it twice. Both directions are
enforced:

- Driving force above the driven axle's capacity becomes wheelspin, and a
  spinning tyre still transmits 18% of the excess.
- Lateral grip at the driven axle is multiplied by `sqrt(1 - used²)`, where
  `used` is the fraction of its capacity committed to acceleration.

This coupling is what makes front drive push wide on power and rear drive get
loose, with all-wheel drive between them. Capping only the longitudinal side
left a front-driver able to deploy full power mid-corner, so it oversteered,
which is exactly backwards.

The lateral term has a floor of 0.40. Letting it reach zero meant a powerful
rear-drive car span the instant it used full throttle in a corner — not
recoverable, and not fun.

## Braking

Brake force is capped by the friction available across both axles. Brakes can
always lock a wheel; what stops the car is grip. Without the cap, braking was
equally effective on dry tarmac and in heavy rain.

## Difficulty

Assists are bounded input guidance plus rear-axle stability. They never edit the
force equations and never move the car directly.

| | steerAssist | counterAssist | recovery (rear grip) |
|---|---|---|---|
| beginner | 0.70 | 0.55 | 1.70 |
| standard | 0.35 | 0.28 | 1.25 |
| expert | 0.00 | 0.00 | 1.00 |

Two mistakes worth recording, because both produced a "beginner" that span more
readily than "expert":

- The countersteer term was negated, so the assist steered *into* the slide. The
  stabilising input follows the sign of the rear slip, not its opposite.
- `recovery` was first applied by stretching the slip-angle peak. A later peak
  means *less* force for the same slip below it, so forgiving cars had less grip.
  It was then applied to both axles, which made the car corner harder and
  therefore rotate harder. It now scales rear grip only: holding the rear is what
  actually prevents a spin, and it leaves a deliberate handbrake drift intact on
  every difficulty.

## Determinism

`racing/core/fixed-step.js` advances the simulation in whole ticks of 1/60 s.
Render time never reaches the physics; frames deposit elapsed time into an
accumulator that pays out in whole steps, and the remainder is handed to the
renderer as `alpha` for interpolation.

- Catch-up is capped at 4 ticks per frame; a longer backlog is dropped rather
  than replayed, so a tab hidden for ten minutes does not run 36,000 ticks.
- A single frame deposits at most 0.25 s.
- Pausing discards the accumulator: time spent paused is not owed.
- `Math.random()` must never appear inside the simulation. All chance comes from
  `racing/core/random.js`, an sfc32 stream with splitmix32 seeding, so a replay
  and a server re-simulation draw the same sequence.

`tests/racing-fixed-step.cjs` asserts that 30, 60 and 120 FPS, and a jittered
frame rate, all produce an identical snapshot at the same tick.

## Versioning

`Physics.VERSION` is 1. Any change to the equations, constants or tick order
alters recorded runs, so it must be incremented. Ghosts and ranked runs carry the
version they were produced under, and a mismatch means a run is replayed for
display only, never compared against a different version's times.

## Found in cross-review

GPT-5.6 reviewed this module and found three defects worth recording, all now
fixed and covered by tests:

- **All-wheel drive read only the rear surface.** `drivenSurf` picked
  `surfR.grip` for every non-front-drive car, so an AWD car with its front wheels
  on ice had full road traction, and one with only its rear on ice was reduced to
  ice traction at all four corners. It is now the load-weighted blend of both.
- **Braking carried the car through zero.** The integrator had no zero-crossing
  clamp, so a car braking to a standstill flipped direction about half of all
  ticks and jittered. Brake force now cannot reverse the car.
- **Ghost validation accepted `NaN` and friends.** Range comparisons alone are
  useless against `NaN` (every comparison is false) and JSON turns `NaN` and
  `Infinity` into `null`, which then coerced to 0. Values are now required to be
  finite numbers and tick counts to be integers, checked with `Number.isInteger`
  rather than `isFinite`, which coerces and accepted the string `"600"`.

A fourth finding — that `racing/session.js` and `racing/workshop.js` should sit
behind the flag — was not applied. Neither file references the v2 namespace; both
are live v1 features already serving users, and gating them would withdraw
working functionality. The comment in `racing/index.js` that invited the
confusion has been clarified instead.

## Known simplifications

Deliberate, and listed so they are not mistaken for bugs:

- One effective tyre per axle. No individual wheel loads, so there is no inside
  wheel lift and no per-wheel locking.
- No tyre temperature or wear.
- Suspension is a load-transfer scalar, not travelling geometry.
- Aerodynamic drag is a single coefficient; there is no modelled downforce.
- Automatic gearbox only.
- Wheelspin reduces drive force but does not model a spinning wheel's own speed.
