# Drift Circuit: v2 parking-lot mode

Drift Circuit now uses the same React/Three/Cannon renderer, procedural car
archetypes, raycast suspension, paint materials, mute bridge and teardown path
as Neon Racing. Its default no longer routes to the v1 parking-lot renderer.
The explicit v2 opt-out and startup-failure fallback remain available.

The host passes `sandbox: true` for drift. The v2 scene builds a 160-by-110-metre
asphalt lot with parking bays, cones, tire stacks and physical perimeter
barriers. Spawn and Reset Position are clear at the origin. Circuit ribbons,
lap completion, racing-line surface penalties and AI opponents are disabled
only for this mode.

The shared garage retains separate selections: drift reads/writes
`profile.garage.car`, racing reads/writes `raceCar`. Unlocks, paint, tune and
cash remain shared. Existing car-specific mass, drive and power ratios are
preserved; drift uses a lower rear grip and gentler rear handbrake with bounded
yaw assistance for controlled breakaway. The chassis remains upright.
Camera and trail heading are projected from the chassis quaternion instead
of the folding Euler Y angle, so quarter-turns do not reverse the chase view.

Drift points come from measured vehicle velocity and slip angle, with speed
and sustained-combo thresholds. Recovery keeps points and breaks the tire
trail. Tire marks follow the actual rear contact-patch movement, including
heading changes; they no longer use the forward axle or connect teleports.

Open Practice is free and does not bank cash or records. A scored drift run
costs one token for five active minutes. End Run or clock expiry banks the
earned high score and cash at the existing conversion of one dollar per
400 points. Idle expiry does not bank it. No circuit time record is created.
The test finish seam cannot bank drift scores or cash.

Verification:

- Build/typecheck: `cd racing-v2 && npm run build`.
- Garage calibration: `node tools/run.mjs tools/garage-check.mjs`.
- Full-turn heading regression: `node tools/run.mjs tools/heading-check.mjs`.
- Real driving, recovery, scoring, geometry, mobile controls and audio:
  `node tests/drift-v2-sandbox.cjs`.
- Host mode routing: `node tests/racing-v2-arcade.cjs`.
- Recovery/mute/teardown compatibility: `node tests/driving-recovery.cjs`.
- Flags/failure/refund paths: `node tests/racing-v2-flag.cjs`.
- Generated-site verification: `node tests/seo-audit.test.cjs` after the
  Wrangler build.

Use the available Playwright runtime; do not add a production dependency just
for browser tests. This work was isolated from concurrent, uncommitted college
enrichment changes so those are not published by the driving deployment.
