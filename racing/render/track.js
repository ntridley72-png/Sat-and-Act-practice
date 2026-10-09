/* The world: sky, horizon, terrain, road, kerbs, markings, barriers, scenery.
 *
 * Everything is procedural. There are no image assets, no models and no fonts
 * to download: the whole environment is polygons generated from the track's own
 * geometry and a palette, which is what keeps the lazy racing payload small
 * enough to open on school internet.
 *
 * THE RULE ABOUT SLABS. The approved design forbids large opaque floor or
 * overhang geometry, and specifically forbids the camera ever passing beneath a
 * solid horizontal plane. The old full-width start/finish crossbar was deleted
 * for exactly that reason and must not come back. So:
 *
 *   - Nothing in this file draws a polygon above road level that spans the
 *     road. The start line is paint. The gantry is two separate posts with a
 *     gap between them, and `startGate()` will not draw anything joining them.
 *   - The ground is not geometry. It is a screen-space fill below the drawn
 *     horizon, so there is no ground polygon with an underside for the camera
 *     to end up below, however the camera is moved.
 *   - The barrier is a waist-high rail with a gap under it, drawn as two thin
 *     bands, not a wall.
 *
 * Painter's algorithm throughout: far to near, no depth buffer. That is what
 * decides the order of everything below, and why the road is emitted as whole
 * segments rather than as separate passes for tarmac and paint.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.Racing = root.Racing || {}).RenderTrack = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* Palettes. Each one is a complete environment: the sunset of the approved
     mockup, plus the themes the existing garage already lets a player pick. */
  var THEMES = {
    sunset: {
      skyTop: "#1c2b52", skyMid: "#7b4a74", skyLow: "#e8734a", skyHaze: "#f6b26b",
      sun: "#ffd9a0", sunY: 0.52, sunGlow: "rgba(255,176,94,0.55)",
      mountainFar: "#3c3f66", mountainNear: "#2f3152", ridgeLight: "#565a86",
      forest: "#1f3a33", forestLight: "#2c4f43",
      ground: "#2b3a2f", groundFar: "#43513f", groundLight: "#394a37",
      road: "#2a2b31", roadFar: "#3a3b43", roadWear: "#34353d",
      line: "#e9e2cf", kerbA: "#cf4a3c", kerbB: "#ece6d8",
      rail: "#9aa3ad", railPost: "#5d646d", fog: "#f2a765", fogAmount: 0.62
    },
    day: {
      skyTop: "#2f6fb5", skyMid: "#6aa6da", skyLow: "#aacdea", skyHaze: "#d8e8f3",
      sun: "#ffffff", sunY: 0.22, sunGlow: "rgba(255,255,255,0.35)",
      mountainFar: "#7d93ab", mountainNear: "#5d7791", ridgeLight: "#93a7bb",
      forest: "#24523c", forestLight: "#346b4b",
      ground: "#3f6b40", groundFar: "#5c8752", groundLight: "#4d7a46",
      road: "#3a3c42", roadFar: "#4c4e55", roadWear: "#45474e",
      line: "#f5f2e8", kerbA: "#d2493a", kerbB: "#f2ece0",
      rail: "#c3cbd4", railPost: "#78818b", fog: "#cfe2ef", fogAmount: 0.5
    },
    dawn: {
      skyTop: "#243a63", skyMid: "#8f6a8e", skyLow: "#f0a07a", skyHaze: "#ffd2a6",
      sun: "#fff0cf", sunY: 0.46, sunGlow: "rgba(255,206,150,0.5)",
      mountainFar: "#4a4f7a", mountainNear: "#383c61", ridgeLight: "#6a6f9c",
      forest: "#22403a", forestLight: "#31574a",
      ground: "#35443a", groundFar: "#4d5c49", groundLight: "#41523f",
      road: "#2e3036", roadFar: "#3f4149", roadWear: "#383a42",
      line: "#ece5d2", kerbA: "#cf4a3c", kerbB: "#ece6d8",
      rail: "#a6aeb8", railPost: "#636a73", fog: "#f3bb90", fogAmount: 0.6
    },
    dusk: {
      skyTop: "#141c38", skyMid: "#3c3161", skyLow: "#8a4a63", skyHaze: "#c97a63",
      sun: "#ffc08a", sunY: 0.58, sunGlow: "rgba(220,130,100,0.45)",
      mountainFar: "#2e3254", mountainNear: "#232640", ridgeLight: "#434872",
      forest: "#162b28", forestLight: "#1f3c34",
      ground: "#222e27", groundFar: "#33402f", groundLight: "#2b3a2d",
      road: "#232429", roadFar: "#303138", roadWear: "#2b2c33",
      line: "#ddd6c4", kerbA: "#b9423a", kerbB: "#ddd7ca",
      rail: "#848d98", railPost: "#4d545d", fog: "#b06a5c", fogAmount: 0.58
    },
    night: {
      skyTop: "#060a18", skyMid: "#0d1430", skyLow: "#1b2347", skyHaze: "#2b3560",
      sun: "#cfd8ff", sunY: 0.2, sunGlow: "rgba(130,150,220,0.25)",
      mountainFar: "#141a33", mountainNear: "#0e1226", ridgeLight: "#232a4b",
      forest: "#0c1a1c", forestLight: "#132a28",
      ground: "#121a18", groundFar: "#1a2420", groundLight: "#17201d",
      road: "#1a1b20", roadFar: "#23242b", roadWear: "#1f2025",
      line: "#c8c3b4", kerbA: "#8e3630", kerbB: "#b8b3a6",
      rail: "#6a727c", railPost: "#3b4149", fog: "#1d2544", fogAmount: 0.45
    }
  };
  /* Per-tier budgets. These change how much is drawn and nothing else: no tier
     may read or write a single value the simulation owns. */
  var TIERS = {
    low:    { draw: 190, nearStep: 4.0, farStep: 14, scenery: 95,  trees: 0.45, rail: true, dashes: true, water: false, shadow: "blob", bands: 2, skyBands: 10 },
    medium: { draw: 320, nearStep: 2.0, farStep: 10, scenery: 190, trees: 0.75, rail: true, dashes: true, water: true,  shadow: "blob", bands: 3, skyBands: 24 },
    high:   { draw: 460, nearStep: 1.0, farStep: 7,  scenery: 320, trees: 1.00, rail: true, dashes: true, water: true,  shadow: "soft", bands: 4, skyBands: 48 }
  };

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }

  function hexToRgb(hex) {
    var h = hex.replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(a, b, t) {
    var A = hexToRgb(a), B = hexToRgb(b);
    return "rgb(" + Math.round(lerp(A[0], B[0], t)) + "," + Math.round(lerp(A[1], B[1], t)) + "," + Math.round(lerp(A[2], B[2], t)) + ")";
  }
  function shade(hex, amount) {
    var c = hexToRgb(hex), t = amount < 0 ? 0 : 255, a = Math.abs(amount);
    return "rgb(" + Math.round(lerp(c[0], t, a)) + "," + Math.round(lerp(c[1], t, a)) + "," + Math.round(lerp(c[2], t, a)) + ")";
  }

  function theme(name) { return THEMES[name] || THEMES.sunset; }
  function tier(name) { return TIERS[name] || TIERS.medium; }

  function fill(ctx, pts, style) {
    if (pts.length < 3) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    ctx.fillStyle = style;
    ctx.fill();
  }

  // --------------------------------------------------------------------------
  // Sky and distance
  // --------------------------------------------------------------------------

  /* Sky, sun and haze. Drawn in screen space down to the horizon the projection
     reports, so the sky always meets the ground exactly where the ground plane
     vanishes however the camera is pitched. */
  function drawSky(ctx, view, pal, t, opts) {
    var w = view.width, h = view.height;
    var hz = clamp(view.horizon(), -h, h * 2);
    var top = Math.min(0, hz - h);

    var g = ctx.createLinearGradient(0, top, 0, hz);
    g.addColorStop(0, pal.skyTop);
    g.addColorStop(0.45, pal.skyMid);
    g.addColorStop(0.82, pal.skyLow);
    g.addColorStop(1, pal.skyHaze);
    ctx.fillStyle = g;
    ctx.fillRect(0, top, w, hz - top);

    // The sun sits at a fixed bearing in the world, so turning the car moves it
    // across the sky. Without that it reads as a sticker on the lens.
    var bearing = 0.8;
    var rel = bearing - view.yaw;
    while (rel > Math.PI) rel -= Math.PI * 2;
    while (rel < -Math.PI) rel += Math.PI * 2;
    if (Math.abs(rel) < 1.5) {
      var sunX = w * 0.5 + Math.tan(rel) * view.focal;
      var sunY = hz - h * (1 - pal.sunY) * 0.42;
      var r = h * 0.055;
      var glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, r * 7);
      glow.addColorStop(0, pal.sunGlow);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(sunX - r * 7, sunY - r * 7, r * 14, r * 14);
      ctx.beginPath();
      ctx.arc(sunX, sunY, r, 0, Math.PI * 2);
      ctx.fillStyle = pal.sun;
      ctx.fill();
    }

    // Cloud bands: a handful of flattened ellipses on the horizon, parallaxed by
    // yaw. Cheap, and they stop the gradient reading as a backdrop.
    if (opts && opts.skyBands) {
      ctx.save();
      ctx.globalAlpha = 0.22;
      for (var i = 0; i < opts.skyBands; i++) {
        var a = (i / opts.skyBands) * Math.PI * 2;
        var d = a - view.yaw * 0.9;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        if (Math.abs(d) > 1.3) continue;
        var cx = w * 0.5 + Math.tan(d) * view.focal;
        var band = (i * 37 % 11) / 11;
        var cy = hz - h * (0.06 + band * 0.26);
        var cw = w * (0.08 + band * 0.12);
        ctx.beginPath();
        ctx.ellipse(cx, cy, cw, h * 0.012 + band * h * 0.008, 0, 0, Math.PI * 2);
        ctx.fillStyle = i % 3 === 0 ? pal.skyHaze : pal.sun;
        ctx.fill();
      }
      ctx.restore();
    }
  }

  /* The ground, as a screen-space fill rather than geometry.
   *
   * This is the deliberate answer to the no-slab rule. A huge ground quad would
   * be the exact thing the design forbids -- a solid horizontal plane the camera
   * can get under, at which point the player is looking at the underside of the
   * world. A fill below the horizon cannot be got under, because it is not in
   * the world at all. */
  function drawGround(ctx, view, pal) {
    var w = view.width, h = view.height;
    var hz = clamp(view.horizon(), -h, h * 2);
    if (hz >= h) { ctx.fillStyle = pal.groundFar; ctx.fillRect(0, 0, w, h); return; }
    var top = Math.max(0, hz);
    var g = ctx.createLinearGradient(0, top, 0, h);
    g.addColorStop(0, pal.groundFar);
    g.addColorStop(0.35, pal.groundLight);
    g.addColorStop(1, pal.ground);
    ctx.fillStyle = g;
    ctx.fillRect(0, top, w, h - top);
  }

  /* Mountain and forest silhouettes on the horizon. Two parallax layers plus a
     tree line, generated from a fixed sine sum so they are the same every frame
     and on every machine, and offset by the camera's yaw so they swing past as
     the car turns. */
  function drawDistance(ctx, view, pal, track) {
    var w = view.width, h = view.height;
    var hz = clamp(view.horizon(), -h * 0.5, h * 1.5);
    if (hz < -h * 0.4 || hz > h * 1.4) return;
    var mountains = track && track.kind === "lot" ? 0.35 : 1;

    var layers = [
      { amp: h * 0.17 * mountains, colour: pal.mountainFar, speed: 0.26, freq: 2.1, seedOff: 0.0, light: 0.0 },
      { amp: h * 0.11 * mountains, colour: pal.mountainNear, speed: 0.40, freq: 3.3, seedOff: 1.7, light: 0.0 },
      { amp: h * 0.045, colour: pal.forest, speed: 0.62, freq: 7.9, seedOff: 3.1, light: 0.0 }
    ];
    for (var L = 0; L < layers.length; L++) {
      var lay = layers[L];
      var pts = [{ x: 0, y: h + 10 }];
      var steps = 46;
      for (var i = 0; i <= steps; i++) {
        var x = (i / steps) * w;
        var u = (x / w - 0.5) * 1.8 + view.yaw * lay.speed + lay.seedOff;
        var ridge =
          Math.sin(u * lay.freq) * 0.55 +
          Math.sin(u * lay.freq * 2.17 + 1.3) * 0.28 +
          Math.sin(u * lay.freq * 4.41 + 2.6) * 0.17;
        pts.push({ x: x, y: hz - lay.amp * (0.45 + ridge * 0.55) });
      }
      pts.push({ x: w, y: h + 10 });
      fill(ctx, pts, lay.colour);
      // A lit edge along the top of each ridge, which is most of what makes a
      // flat silhouette read as a mountain.
      if (L < 2) {
        ctx.beginPath();
        ctx.moveTo(pts[1].x, pts[1].y);
        for (var j = 2; j < pts.length - 1; j++) ctx.lineTo(pts[j].x, pts[j].y);
        ctx.strokeStyle = L === 0 ? pal.ridgeLight : shade(pal.mountainNear, 0.22);
        ctx.lineWidth = L === 0 ? 2 : 1.5;
        ctx.stroke();
      }
    }
  }

  // --------------------------------------------------------------------------
  // Road
  // --------------------------------------------------------------------------

  /* Lateral point on the road surface, `n` metres left of the centre line. */
  function side(p, n) {
    return { x: p.x - Math.sin(p.heading) * n, y: p.y + Math.cos(p.heading) * n, z: p.elev || 0 };
  }

  /* Distance fog: far geometry fades into the sky colour. Without it the draw
     distance is a visible wall of road ending in mid-air. */
  function fogged(colour, pal, d, draw) {
    var t = clamp((d / draw) * pal.fogAmount, 0, 0.92);
    return t < 0.01 ? colour : mix(colour, pal.fog, t);
  }

  /* The road, drawn far to near in segments whose length grows with distance.
     Each segment emits its tarmac, its wear, its kerbs and its paint together,
     because painter's algorithm gives no other way to keep them in order. */
  function drawRoad(ctx, view, track, pal, T, carDistance, opts) {
    var half = track.half;
    var draw = T.draw;
    var segs = [];
    var d = -22;                     // start a little behind, so the car has road under it
    while (d < draw) {
      var t = clamp(d / draw, 0, 1);
      var step = lerp(T.nearStep, T.farStep, t * t);
      segs.push({ a: d, b: d + step, t: t });
      d += step;
    }

    // Far to near.
    for (var i = segs.length - 1; i >= 0; i--) {
      var s = segs[i];
      var p0 = track.at(carDistance + s.a);
      var p1 = track.at(carDistance + s.b);
      var mid = (s.a + s.b) * 0.5;
      var fade = clamp(mid / draw, 0, 1);

      var l0 = side(p0, half), r0 = side(p0, -half);
      var l1 = side(p1, half), r1 = side(p1, -half);

      // Verge: a band of lighter ground each side, so the road is not a strip
      // floating on a flat fill.
      var vl0 = side(p0, half * 2.1), vl1 = side(p1, half * 2.1);
      var vr0 = side(p0, -half * 2.1), vr1 = side(p1, -half * 2.1);
      var verge = fogged(pal.groundLight, pal, mid, draw);
      fill(ctx, view.polygon([vl0, l0, l1, vl1]), verge);
      fill(ctx, view.polygon([r0, vr0, vr1, r1]), verge);

      // Tarmac, darkening toward the car so the near road does not look washed
      // out by the fog.
      var tar = fogged(mix(pal.road, pal.roadFar, fade * 0.5), pal, mid, draw);
      fill(ctx, view.polygon([l0, r0, r1, l1]), tar);

      // Two wheel-track wear bands. Nearly free, and they do more for the sense
      // of a used road surface than any amount of texture would.
      if (T.bands >= 3 && fade < 0.5) {
        var wear = fogged(pal.roadWear, pal, mid, draw);
        for (var k = -1; k <= 1; k += 2) {
          var c = half * 0.42 * k;
          fill(ctx, view.polygon([side(p0, c + half * 0.16), side(p0, c - half * 0.16), side(p1, c - half * 0.16), side(p1, c + half * 0.16)]), wear);
        }
      }

      // Standing water, where the weather put it.
      if (T.water && track.puddles && track.puddles.length && fade < 0.65) {
        var depth = track.standingWater(p0.s, 0);
        for (var lat = -0.8; lat <= 0.8; lat += 0.4) {
          var dw = track.standingWater(p0.s, lat);
          if (dw < 0.12) continue;
          ctx.save();
          ctx.globalAlpha = clamp(dw * 0.5, 0, 0.5);
          fill(ctx, view.polygon([side(p0, lat * half + half * 0.2), side(p0, lat * half - half * 0.2), side(p1, lat * half - half * 0.2), side(p1, lat * half + half * 0.2)]), "#8fb7cf");
          ctx.restore();
        }
        void depth;
      }

      // Kerbs, but only where the road is actually turning: a painted kerb down
      // a straight looks like a runway.
      var curve = Math.abs(p0.curvature || 0);
      if (curve > 0.004 && fade < 0.8) {
        var inside = (p0.curvature > 0) ? 1 : -1;
        var stripe = (Math.floor((p0.s || 0) / 2.4) % 2) === 0;
        var kc = fogged(stripe ? pal.kerbA : pal.kerbB, pal, mid, draw);
        var kw = half * 0.14;
        for (var sgn = -1; sgn <= 1; sgn += 2) {
          var base = half * sgn;
          fill(ctx, view.polygon([side(p0, base), side(p0, base - kw * sgn), side(p1, base - kw * sgn), side(p1, base)]), kc);
        }
        void inside;
      }

      // Edge lines and the dashed centre.
      if (fade < 0.75) {
        var line = fogged(pal.line, pal, mid, draw);
        var lw = Math.max(0.12, half * 0.035);
        fill(ctx, view.polygon([side(p0, half - half * 0.14), side(p0, half - half * 0.14 - lw), side(p1, half - half * 0.14 - lw), side(p1, half - half * 0.14)]), line);
        fill(ctx, view.polygon([side(p0, -half + half * 0.14 + lw), side(p0, -half + half * 0.14), side(p1, -half + half * 0.14), side(p1, -half + half * 0.14 + lw)]), line);
        if (T.dashes && !track.sandbox && (Math.floor((p0.s || 0) / 9) % 2) === 0) {
          fill(ctx, view.polygon([side(p0, lw), side(p0, -lw), side(p1, -lw), side(p1, lw)]), line);
        }
      }
    }
  }

  /* The start/finish line: paint on the road and two posts beside it.
   *
   * There is deliberately no beam, banner or gantry joining the posts. That is
   * the element the approved design had removed, because the chase camera passed
   * underneath it and the player spent a frame inside an opaque slab. */
  function drawStartLine(ctx, view, track, pal, carDistance, T) {
    var rel = track.length - (carDistance % track.length);
    if (rel > T.draw) rel -= track.length;
    if (rel < -30 || rel > T.draw) return;
    var p0 = track.at(carDistance + rel - 0.9);
    var p1 = track.at(carDistance + rel + 0.9);
    var half = track.half;

    // Chequer, as paint.
    var cells = 12;
    for (var i = 0; i < cells; i++) {
      var a = -half + (2 * half) * (i / cells);
      var b = -half + (2 * half) * ((i + 1) / cells);
      fill(ctx, view.polygon([side(p0, a), side(p0, b), side(p1, b), side(p1, a)]), i % 2 ? "#1b1c20" : "#efe9dc");
    }
    // Two posts. Thin, separate, and nothing above the road between them.
    for (var sgn = -1; sgn <= 1; sgn += 2) {
      var base = side(p0, sgn * (half + 0.9));
      var poly = view.polygon([
        { x: base.x, y: base.y, z: base.z },
        { x: base.x, y: base.y, z: base.z + 4.2 },
        { x: base.x + Math.cos(p0.heading) * 0.28, y: base.y + Math.sin(p0.heading) * 0.28, z: base.z + 4.2 },
        { x: base.x + Math.cos(p0.heading) * 0.28, y: base.y + Math.sin(p0.heading) * 0.28, z: base.z }
      ]);
      fill(ctx, poly, pal.railPost);
    }
  }

  // --------------------------------------------------------------------------
  // Barrier and scenery
  // --------------------------------------------------------------------------

  /* Armco: a waist-high rail on posts, with daylight under it. Two thin bands
     rather than a wall, both so it reads correctly and so there is nothing an
     errant camera can be swallowed by. */
  function drawBarrier(ctx, view, track, pal, carDistance, T) {
    if (track.sandbox) return;
    var half = track.half, draw = Math.min(T.draw, 260);
    var step = 7;
    for (var d = draw; d > -12; d -= step) {
      var p0 = track.at(carDistance + d);
      var p1 = track.at(carDistance + d - step);
      var fade = clamp(d / draw, 0, 1);
      var rail = fogged(pal.rail, pal, d, draw);
      var post = fogged(pal.railPost, pal, d, draw);
      for (var sgn = -1; sgn <= 1; sgn += 2) {
        var off = sgn * (half + 1.6);
        var a = side(p0, off), b = side(p1, off);
        // Post, every other segment.
        if ((Math.floor(d / step) % 2) === 0) {
          fill(ctx, view.polygon([
            { x: a.x, y: a.y, z: a.z }, { x: a.x, y: a.y, z: a.z + 0.95 },
            { x: a.x + 0.16, y: a.y + 0.16, z: a.z + 0.95 }, { x: a.x + 0.16, y: a.y + 0.16, z: a.z }
          ]), post);
        }
        // Rail: a band from 0.55 m to 0.95 m. The gap beneath it is the point.
        fill(ctx, view.polygon([
          { x: a.x, y: a.y, z: a.z + 0.55 }, { x: b.x, y: b.y, z: b.z + 0.55 },
          { x: b.x, y: b.y, z: b.z + 0.95 }, { x: a.x, y: a.y, z: a.z + 0.95 }
        ]), rail);
        if (fade < 0.4) {
          fill(ctx, view.polygon([
            { x: a.x, y: a.y, z: a.z + 0.80 }, { x: b.x, y: b.y, z: b.z + 0.80 },
            { x: b.x, y: b.y, z: b.z + 0.88 }, { x: a.x, y: a.y, z: a.z + 0.88 }
          ]), shade(pal.rail, 0.28));
        }
      }
    }
  }

  /* One piece of scenery. Everything is a handful of polygons: a pine is two
     stacked triangles on a trunk, a rock is a single shaded wedge. */
  function drawProp(ctx, view, p, pal, dist, draw) {
    var z = p.elev || 0;
    var s = p.scale || 1;
    var h, w, pts;
    if (p.kind === "tree") {
      h = 7.5 * s; w = 2.2 * s;
      var trunk = view.polygon([
        { x: p.x - 0.18, y: p.y, z: z }, { x: p.x + 0.18, y: p.y, z: z },
        { x: p.x + 0.18, y: p.y, z: z + h * 0.3 }, { x: p.x - 0.18, y: p.y, z: z + h * 0.3 }
      ]);
      fill(ctx, trunk, fogged("#3b2d22", pal, dist, draw));
      for (var tierN = 0; tierN < 3; tierN++) {
        var base = z + h * (0.25 + tierN * 0.22);
        var top = base + h * 0.36;
        var wid = w * (1 - tierN * 0.22);
        pts = view.polygon([
          { x: p.x - wid, y: p.y, z: base }, { x: p.x + wid, y: p.y, z: base }, { x: p.x, y: p.y, z: top }
        ]);
        fill(ctx, pts, fogged(tierN % 2 ? pal.forestLight : pal.forest, pal, dist, draw));
      }
      return;
    }
    if (p.kind === "rock") {
      h = 1.3 * s; w = 1.5 * s;
      fill(ctx, view.polygon([
        { x: p.x - w, y: p.y, z: z }, { x: p.x + w, y: p.y, z: z },
        { x: p.x + w * 0.45, y: p.y, z: z + h }, { x: p.x - w * 0.6, y: p.y, z: z + h * 0.8 }
      ]), fogged("#6b6a63", pal, dist, draw));
      return;
    }
    if (p.kind === "stack") {
      for (var t2 = 0; t2 < 3; t2++) {
        fill(ctx, view.polygon([
          { x: p.x - 0.7, y: p.y, z: z + t2 * 0.42 }, { x: p.x + 0.7, y: p.y, z: z + t2 * 0.42 },
          { x: p.x + 0.7, y: p.y, z: z + t2 * 0.42 + 0.36 }, { x: p.x - 0.7, y: p.y, z: z + t2 * 0.42 + 0.36 }
        ]), fogged(t2 % 2 ? "#2a2a2e" : "#1d1d21", pal, dist, draw));
      }
      return;
    }
    if (p.kind === "cone") {
      fill(ctx, view.polygon([
        { x: p.x - 0.28, y: p.y, z: z }, { x: p.x + 0.28, y: p.y, z: z }, { x: p.x, y: p.y, z: z + 0.7 }
      ]), fogged("#e2622c", pal, dist, draw));
      return;
    }
    if (p.kind === "post") {
      fill(ctx, view.polygon([
        { x: p.x - 0.07, y: p.y, z: z }, { x: p.x + 0.07, y: p.y, z: z },
        { x: p.x + 0.07, y: p.y, z: z + 1.05 }, { x: p.x - 0.07, y: p.y, z: z + 1.05 }
      ]), fogged("#e8e2d4", pal, dist, draw));
      fill(ctx, view.polygon([
        { x: p.x - 0.07, y: p.y, z: z + 0.78 }, { x: p.x + 0.07, y: p.y, z: z + 0.78 },
        { x: p.x + 0.07, y: p.y, z: z + 0.92 }, { x: p.x - 0.07, y: p.y, z: z + 0.92 }
      ]), fogged("#cf4a3c", pal, dist, draw));
      return;
    }
    // sign
    fill(ctx, view.polygon([
      { x: p.x - 0.06, y: p.y, z: z }, { x: p.x + 0.06, y: p.y, z: z },
      { x: p.x + 0.06, y: p.y, z: z + 2.0 }, { x: p.x - 0.06, y: p.y, z: z + 2.0 }
    ]), fogged(pal.railPost, pal, dist, draw));
    fill(ctx, view.polygon([
      { x: p.x - 1.0, y: p.y, z: z + 2.0 }, { x: p.x + 1.0, y: p.y, z: z + 2.0 },
      { x: p.x + 1.0, y: p.y, z: z + 3.1 }, { x: p.x - 1.0, y: p.y, z: z + 3.1 }
    ]), fogged("#2b6ea8", pal, dist, draw));
  }

  /* Scenery within the draw distance, painted far to near.
   *
   * Culled in three steps that get more expensive in turn, so the cheap ones
   * throw most of it away first: the tier's own share of the trees, then a
   * single camera-space transform for depth, then a horizontal frustum test.
   * Only what survives is sorted and built into polygons. A circuit carries a
   * few thousand props and building them all would be most of a low-end
   * machine's frame budget. */
  function drawScenery(ctx, view, track, pal, carDistance, T) {
    var draw = Math.min(T.draw, T.scenery);
    var list = track.props, out = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      // Thin the forest by tier. Deterministic in the prop's index, so the same
      // trees are present every frame and a tree does not flicker in and out.
      if (p.kind === "tree" && T.trees < 1 && (i % 20) / 20 >= T.trees) continue;
      var c = view.toCamera(p.x, p.y, p.elev || 0);
      if (c.f <= 0.4 || c.f > draw) continue;
      if (Math.abs(c.r) > c.f * 1.4) continue;
      out.push({ p: p, d: c.f });
    }
    out.sort(function (a, b) { return b.d - a.d; });
    for (var k = 0; k < out.length; k++) drawProp(ctx, view, out[k].p, pal, out[k].d, draw);
    void carDistance;
  }

  return {
    THEMES: THEMES,
    TIERS: TIERS,
    theme: theme,
    tier: tier,
    mix: mix,
    shade: shade,
    fill: fill,
    side: side,
    fogged: fogged,
    drawSky: drawSky,
    drawGround: drawGround,
    drawDistance: drawDistance,
    drawRoad: drawRoad,
    drawStartLine: drawStartLine,
    drawBarrier: drawBarrier,
    drawScenery: drawScenery
  };
});
