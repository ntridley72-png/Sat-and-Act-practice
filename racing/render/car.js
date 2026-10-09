/* Low-poly cars, built from the car record rather than from a model file.
 *
 * Each car is a small set of convex quads in body space -- floor, flanks, roof,
 * nose, tail, glass, lights -- transformed into the world by the pose the
 * simulation produced, then projected and painted back to front. No meshes, no
 * textures, no external assets.
 *
 * The silhouette is what makes a car recognisable at the size it appears on
 * screen, so the proportions come from the physics record (wheelbase, track,
 * mass distribution) and the body preset only decides roofline, overhangs and
 * whether there is a bed or a hatch. A car that handles like a van looks like a
 * van, which is the point of having ten of them.
 *
 * Shading is flat per face from a fixed world light. Flat shading is not a
 * compromise here: it is what the approved low-poly direction asks for, and it
 * costs one dot product per face.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.Racing = root.Racing || {}).RenderCar = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // World-space light. Slightly off the nose and high, so the two flanks of a
  // car take visibly different light and the shape reads.
  var LIGHT = { x: -0.42, y: 0.30, z: 0.86 };

  var PAINTS = {
    teal: "#1aa6ad", red: "#cc3b34", blue: "#2e62c8", yellow: "#e8b53a",
    white: "#e9ecef", black: "#23262b", silver: "#aeb6bf", orange: "#e4722c",
    purple: "#7a4fc4", green: "#2e9b57", pink: "#d9579b", gold: "#d2a53c"
  };

  /* Bodies differ in roofline and overhang, which is nearly all of a
     silhouette. Lengths are fractions of the wheelbase. */
  var BODIES = {
    coupe:    { noseLen: 0.55, tailLen: 0.52, roofFront: 0.12, roofBack: -0.46, roofH: 0.56, beltH: 0.30, width: 1.00, rake: 0.30 },
    hatch:    { noseLen: 0.42, tailLen: 0.30, roofFront: 0.18, roofBack: -0.34, roofH: 0.66, beltH: 0.34, width: 0.94, rake: 0.16 },
    sedan:    { noseLen: 0.52, tailLen: 0.58, roofFront: 0.10, roofBack: -0.40, roofH: 0.62, beltH: 0.32, width: 0.98, rake: 0.20 },
    muscle:   { noseLen: 0.68, tailLen: 0.60, roofFront: 0.06, roofBack: -0.42, roofH: 0.58, beltH: 0.32, width: 1.06, rake: 0.14 },
    super:    { noseLen: 0.60, tailLen: 0.44, roofFront: -0.02, roofBack: -0.44, roofH: 0.46, beltH: 0.24, width: 1.10, rake: 0.40 },
    supercar: { noseLen: 0.60, tailLen: 0.44, roofFront: -0.02, roofBack: -0.44, roofH: 0.46, beltH: 0.24, width: 1.10, rake: 0.40 },
    hyper:    { noseLen: 0.62, tailLen: 0.40, roofFront: -0.06, roofBack: -0.46, roofH: 0.42, beltH: 0.22, width: 1.14, rake: 0.46 },
    roadster: { noseLen: 0.58, tailLen: 0.46, roofFront: -0.10, roofBack: -0.30, roofH: 0.38, beltH: 0.28, width: 0.96, rake: 0.34 },
    rally:    { noseLen: 0.46, tailLen: 0.36, roofFront: 0.18, roofBack: -0.36, roofH: 0.74, beltH: 0.38, width: 1.00, rake: 0.14 },
    pickup:   { noseLen: 0.56, tailLen: 0.82, roofFront: 0.16, roofBack: -0.10, roofH: 0.78, beltH: 0.38, width: 1.04, rake: 0.08 },
    van:      { noseLen: 0.34, tailLen: 0.56, roofFront: 0.30, roofBack: -0.52, roofH: 0.96, beltH: 0.42, width: 1.02, rake: 0.06 },
    ev:       { noseLen: 0.44, tailLen: 0.44, roofFront: 0.20, roofBack: -0.40, roofH: 0.60, beltH: 0.30, width: 1.00, rake: 0.22 }
  };

  /* The fleet shares six body presets between ten cars, so the preset alone
     cannot tell a classic saloon from a modern tuner. The category nudges the
     proportions that carry a silhouette -- how tall the cabin sits, how much
     overhang there is, how wide the car stands -- which is enough to make all
     ten recognisably different without authoring ten more presets. */
  var CATEGORY = {
    starter: {}, light: { roofH: 0.04, width: -0.04 },
    classic: { noseLen: 0.10, tailLen: 0.12, roofH: 0.06, rake: -0.08 },
    muscle:  { noseLen: 0.08, width: 0.04, roofH: -0.02 },
    tuner:   { roofH: -0.04, rake: 0.06, width: 0.03 },
    rally:   { roofH: 0.12, width: 0.05, rake: -0.06 },
    track:   { roofH: -0.05, rake: 0.05, tailLen: -0.04 },
    hyper:   { roofH: -0.06, width: 0.05, rake: 0.06 },
    ev:      { noseLen: -0.06, roofH: 0.03, rake: -0.04 }
  };

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function hexToRgb(hex) {
    var h = String(hex).replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (!isFinite(n)) return [160, 160, 160];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function lit(hex, amount) {
    var c = hexToRgb(hex);
    var k = clamp(amount, 0, 2);
    return "rgb(" + Math.min(255, Math.round(c[0] * k)) + "," + Math.min(255, Math.round(c[1] * k)) + "," + Math.min(255, Math.round(c[2] * k)) + ")";
  }

  function body(car) { return BODIES[car.body] || BODIES.coupe; }
  function paint(name) { return PAINTS[name] || PAINTS[String(name)] || (String(name).charAt(0) === "#" ? name : PAINTS.teal); }

  /* Body-space geometry for a car, in metres, with +x forward, +y left, +z up
     and the origin on the ground between the axles. Built once per car record
     and cached: it never changes, and rebuilding it per frame for six cars is
     pure waste. */
  var cache = {};
  function geometry(car) {
    if (cache[car.id]) return cache[car.id];
    var base = body(car);
    var tweak = CATEGORY[car.category] || {};
    var b = {};
    for (var key in base) b[key] = base[key] + (tweak[key] || 0);
    var wb = car.wheelbase;
    var fx = car.frontAxle, rx = -car.rearAxle;
    var w = (car.trackWidth || wb * 0.62) * 0.5 * b.width;
    var nose = fx + wb * b.noseLen;
    var tail = rx - wb * b.tailLen;
    var floor = 0.20;
    var belt = floor + wb * b.beltH;                  // top of the doors
    var roof = floor + wb * b.roofH;                  // top of the cabin
    var roofF = fx * 0.4 + wb * b.roofFront;
    var roofB = rx * 0.4 + wb * b.roofBack;
    var tuck = w * 0.82;                              // roof is narrower than the body
    var r = car.wheelRadius || 0.32;

    var faces = [];
    function face(pts, kind, tone) { faces.push({ pts: pts, kind: kind, tone: tone == null ? 1 : tone }); }
    var P = function (x, y, z) { return { x: x, y: y, z: z }; };

    // Lower body: a shallow tub.
    face([P(nose, w * 0.72, floor), P(nose, -w * 0.72, floor), P(tail, -w * 0.78, floor), P(tail, w * 0.78, floor)], "under", 0.42);
    // Flanks.
    face([P(nose, w * 0.72, floor), P(nose, w * 0.80, belt - wb * 0.06), P(tail, w * 0.80, belt - wb * 0.05), P(tail, w * 0.78, floor)], "paint", 1);
    face([P(nose, -w * 0.72, floor), P(tail, -w * 0.78, floor), P(tail, -w * 0.80, belt - wb * 0.05), P(nose, -w * 0.80, belt - wb * 0.06)], "paint", 1);
    // Bonnet, falling toward the nose by the body's rake.
    face([
      P(roofF, w * 0.80, belt), P(roofF, -w * 0.80, belt),
      P(nose, -w * 0.72, belt - wb * b.rake * 0.5), P(nose, w * 0.72, belt - wb * b.rake * 0.5)
    ], "paint", 1.0);
    // Deck.
    face([
      P(roofB, w * 0.80, belt), P(tail, w * 0.78, belt - wb * 0.06),
      P(tail, -w * 0.78, belt - wb * 0.06), P(roofB, -w * 0.80, belt)
    ], "paint", 0.96);
    // Cabin sides and roof.
    face([P(roofF, w * 0.80, belt), P(roofF - wb * 0.06, tuck, roof), P(roofB + wb * 0.06, tuck, roof), P(roofB, w * 0.80, belt)], "glass", 1);
    face([P(roofF, -w * 0.80, belt), P(roofB, -w * 0.80, belt), P(roofB + wb * 0.06, -tuck, roof), P(roofF - wb * 0.06, -tuck, roof)], "glass", 1);
    face([P(roofF - wb * 0.06, tuck, roof), P(roofF - wb * 0.06, -tuck, roof), P(roofB + wb * 0.06, -tuck, roof), P(roofB + wb * 0.06, tuck, roof)], "paint", 1.18);
    // Windscreen and rear glass.
    face([P(roofF, w * 0.80, belt), P(roofF, -w * 0.80, belt), P(roofF - wb * 0.06, -tuck, roof), P(roofF - wb * 0.06, tuck, roof)], "glass", 1.15);
    face([P(roofB, w * 0.80, belt), P(roofB + wb * 0.06, tuck, roof), P(roofB + wb * 0.06, -tuck, roof), P(roofB, -w * 0.80, belt)], "glass", 0.9);
    // Nose and tail panels.
    face([P(nose, w * 0.72, floor), P(nose, w * 0.72, belt - wb * b.rake * 0.5), P(nose, -w * 0.72, belt - wb * b.rake * 0.5), P(nose, -w * 0.72, floor)], "paint", 0.86);
    face([P(tail, w * 0.78, floor), P(tail, -w * 0.78, floor), P(tail, -w * 0.78, belt - wb * 0.06), P(tail, w * 0.78, belt - wb * 0.06)], "paint", 0.78);
    // Lights.
    var lz = floor + (belt - floor) * 0.55;
    face([P(nose + 0.01, w * 0.64, lz), P(nose + 0.01, w * 0.30, lz), P(nose + 0.01, w * 0.30, lz + 0.16), P(nose + 0.01, w * 0.64, lz + 0.16)], "head", 1);
    face([P(nose + 0.01, -w * 0.30, lz), P(nose + 0.01, -w * 0.64, lz), P(nose + 0.01, -w * 0.64, lz + 0.16), P(nose + 0.01, -w * 0.30, lz + 0.16)], "head", 1);
    face([P(tail - 0.01, w * 0.68, lz), P(tail - 0.01, w * 0.26, lz), P(tail - 0.01, w * 0.26, lz + 0.18), P(tail - 0.01, w * 0.68, lz + 0.18)], "tail", 1);
    face([P(tail - 0.01, -w * 0.26, lz), P(tail - 0.01, -w * 0.68, lz), P(tail - 0.01, -w * 0.68, lz + 0.18), P(tail - 0.01, -w * 0.26, lz + 0.18)], "tail", 1);

    var g = {
      faces: faces, w: w, nose: nose, tail: tail, floor: floor, belt: belt, roof: roof,
      fx: fx, rx: rx, r: r, wheelW: (car.wheelWidth || 0.22)
    };
    cache[car.id] = g;
    return g;
  }

  /* A wheel, as a flat disc in the plane of its own rotation. Spokes are a
     couple of lines that rotate with the wheel, which is what actually reads as
     speed at this scale; a round blur does not. */
  function drawWheel(ctx, view, pose, g, ax, ay, steerAngle, spin, pal, style) {
    var c = Math.cos(pose.heading), s = Math.sin(pose.heading);
    var wx = pose.x + ax * c - ay * s;
    var wy = pose.y + ax * s + ay * c;
    var a = pose.heading + steerAngle;
    var r = g.r;
    var pts = [], i;
    var N = 10;
    for (i = 0; i < N; i++) {
      var th = (i / N) * Math.PI * 2;
      pts.push({ x: wx + Math.cos(a) * Math.cos(th) * r, y: wy + Math.sin(a) * Math.cos(th) * r, z: r + Math.sin(th) * r });
    }
    var poly = view.polygon(pts);
    if (poly.length < 3) return;
    ctx.beginPath();
    ctx.moveTo(poly[0].x, poly[0].y);
    for (i = 1; i < poly.length; i++) ctx.lineTo(poly[i].x, poly[i].y);
    ctx.closePath();
    ctx.fillStyle = "#17181c";
    ctx.fill();

    // Rim face, inset.
    var rim = [];
    for (i = 0; i < N; i++) {
      var th2 = (i / N) * Math.PI * 2;
      rim.push({ x: wx + Math.cos(a) * Math.cos(th2) * r * 0.62, y: wy + Math.sin(a) * Math.cos(th2) * r * 0.62, z: r + Math.sin(th2) * r * 0.62 });
    }
    var rpoly = view.polygon(rim);
    if (rpoly.length >= 3) {
      ctx.beginPath();
      ctx.moveTo(rpoly[0].x, rpoly[0].y);
      for (i = 1; i < rpoly.length; i++) ctx.lineTo(rpoly[i].x, rpoly[i].y);
      ctx.closePath();
      ctx.fillStyle = style || "#c3cad3";
      ctx.fill();
    }
    // Spokes.
    var hub = view.point(wx, wy, r);
    if (hub && rpoly.length >= 3) {
      ctx.strokeStyle = "rgba(20,22,26,0.75)";
      ctx.lineWidth = Math.max(0.8, hub.k * 0.035);
      for (var k = 0; k < 5; k++) {
        var th3 = spin + (k / 5) * Math.PI * 2;
        var e = view.point(
          wx + Math.cos(a) * Math.cos(th3) * r * 0.58,
          wy + Math.sin(a) * Math.cos(th3) * r * 0.58,
          r + Math.sin(th3) * r * 0.58
        );
        if (!e) continue;
        ctx.beginPath();
        ctx.moveTo(hub.x, hub.y);
        ctx.lineTo(e.x, e.y);
        ctx.stroke();
      }
    }
    void pal;
  }

  /* A soft contact shadow. Not a projected mesh: an ellipse on the road under
     the car, which is both cheaper and, at this scale, indistinguishable. */
  function drawShadow(ctx, view, pose, g, ground, soft) {
    var c = view.point(pose.x, pose.y, (ground || 0) + 0.02);
    if (!c) return;
    var rx = (g.nose - g.tail) * 0.5 * c.k;
    var ry = g.w * 1.25 * c.k;
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(0);
    ctx.globalAlpha = soft ? 0.30 : 0.38;
    ctx.beginPath();
    ctx.ellipse(0, 0, Math.max(2, rx * 0.5), Math.max(1.2, ry * 0.32), 0, 0, Math.PI * 2);
    ctx.fillStyle = "#000";
    ctx.filter = soft ? "blur(3px)" : "none";
    ctx.fill();
    ctx.restore();
    ctx.filter = "none";
  }

  /* Draw one car.
   *
   * `pose` is the interpolated {x, y, heading} the camera module produced,
   * `look` is the player's cosmetic choices, and `state` is the physics state
   * it came from, read only for the things the body visibly does: the steered
   * wheels, the brake lights, the lean under load.
   */
  function draw(ctx, view, car, pose, state, look, opts) {
    opts = opts || {};
    var g = geometry(car);
    var colour = paint(look && look.paint);
    var c = Math.cos(pose.heading), s = Math.sin(pose.heading);
    var ground = opts.ground || 0;

    // Body roll and pitch, from the loads the simulation already computed. Two
    // or three degrees is plenty: it is the difference between a car and a
    // sprite sliding about on a plane.
    var roll = clamp((state ? state.yawRate : 0) * Math.hypot(state ? state.vx : 0, state ? state.vy : 0) * 0.004, -0.07, 0.07);
    var pitch = clamp(((state ? state.loadF : 0.5) - 0.5) * 0.5, -0.05, 0.05);

    function world(p) {
      // roll about the x axis, pitch about y, then into the world.
      var y = p.y * Math.cos(roll) - p.z * Math.sin(roll);
      var z = p.y * Math.sin(roll) + p.z * Math.cos(roll);
      var x = p.x * Math.cos(pitch) + z * Math.sin(pitch);
      z = -p.x * Math.sin(pitch) + z * Math.cos(pitch);
      return { x: pose.x + x * c - y * s, y: pose.y + x * s + y * c, z: ground + z };
    }

    drawShadow(ctx, view, pose, g, ground, opts.softShadow);

    // Wheels before the body: the body's flanks then overlap the tops of them,
    // which is what gives an arch without modelling one.
    var steer = state ? state.steer : 0;
    var spin = opts.wheelSpin || 0;
    var rimStyle = look && look.wheelColor;
    drawWheel(ctx, view, pose, g, g.fx, g.w * 0.98, steer, spin, null, rimStyle);
    drawWheel(ctx, view, pose, g, g.fx, -g.w * 0.98, steer, spin, null, rimStyle);
    drawWheel(ctx, view, pose, g, g.rx, g.w * 0.98, 0, spin, null, rimStyle);
    drawWheel(ctx, view, pose, g, g.rx, -g.w * 0.98, 0, spin, null, rimStyle);

    // Faces, back to front by their centroid depth.
    var drawn = [];
    for (var i = 0; i < g.faces.length; i++) {
      var f = g.faces[i];
      var wp = [], cx = 0, cy = 0, cz = 0;
      for (var j = 0; j < f.pts.length; j++) {
        var p = world(f.pts[j]);
        wp.push(p); cx += p.x; cy += p.y; cz += p.z;
      }
      var n = f.pts.length;
      var cam = view.toCamera(cx / n, cy / n, cz / n);
      if (cam.f <= 0.2) continue;

      // Face normal, for both backface culling and the light.
      var a = wp[0], b = wp[1], d = wp[2];
      var ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
      var vx = d.x - a.x, vy = d.y - a.y, vz = d.z - a.z;
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      var len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;
      // Toward the camera?
      var tox = view.camX - a.x, toy = view.camY - a.y, toz = view.camZ - a.z;
      if (nx * tox + ny * toy + nz * toz <= 0) continue;

      var lambert = clamp(nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z, 0, 1);
      drawn.push({ wp: wp, depth: cam.f, kind: f.kind, tone: f.tone, lambert: lambert });
    }
    drawn.sort(function (A, B) { return B.depth - A.depth; });

    var braking = state && state.brake > 0.05;
    for (var k = 0; k < drawn.length; k++) {
      var e = drawn[k];
      var style;
      if (e.kind === "paint") style = lit(colour, (0.46 + e.lambert * 0.70) * e.tone);
      else if (e.kind === "glass") style = lit("#17222c", (0.70 + e.lambert * 1.5) * e.tone);
      else if (e.kind === "under") style = "#101114";
      else if (e.kind === "head") style = opts.lightsOn ? "#fff6d8" : "#cfd6dd";
      else if (e.kind === "tail") style = braking ? "#ff3b2e" : "#8e2a26";
      else style = lit(colour, 0.6);
      var poly = view.polygon(e.wp);
      if (poly.length < 3) continue;
      ctx.beginPath();
      ctx.moveTo(poly[0].x, poly[0].y);
      for (var m = 1; m < poly.length; m++) ctx.lineTo(poly[m].x, poly[m].y);
      ctx.closePath();
      ctx.fillStyle = style;
      ctx.fill();
      // A hairline between faces, which is what stops a low-poly body from
      // reading as one flat blob when two adjacent faces catch similar light.
      ctx.strokeStyle = "rgba(0,0,0,0.22)";
      ctx.lineWidth = 0.7;
      ctx.stroke();
      // Tail lights glow when braking.
      if (e.kind === "tail" && braking) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.shadowColor = "#ff3b2e";
        ctx.shadowBlur = 14;
        ctx.fill();
        ctx.restore();
      }
    }
  }

  return {
    PAINTS: PAINTS,
    BODIES: BODIES,
    LIGHT: LIGHT,
    geometry: geometry,
    paint: paint,
    draw: draw,
    clearCache: function () { cache = {}; }
  };
});
