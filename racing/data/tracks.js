/* Track geometry.
 *
 * A track is a closed centre line plus the width around it. The control points
 * are ported from `DriftCircuit.TRACKS` in app.js so the circuits a player
 * already knows keep their shape, but everything downstream is rebuilt: v1 laid
 * its path out in screen pixels, and the v2 simulation works in metres.
 *
 * The object this module produces is deliberately the narrow interface the AI
 * in `racing/game/ai.js` already expects:
 *
 *     { length, half, at(distance) -> { x, y, heading, curvature, half } }
 *
 * so the AI, the renderer and the lap timer all read the same geometry without
 * any of them knowing how it was built.
 *
 * Even arc-length spacing is the load-bearing property. `at()` is called a few
 * hundred times per tick (the AI walks the line to locate itself), so it has to
 * be an index lookup rather than a search, and that is only correct if sample
 * `i` really does sit `i * ds` metres along the path. The resampler below
 * guarantees it; `tests/racing-tracks.cjs` asserts it.
 *
 * Nothing here calls Math.random(). Scenery, puddles and props are placed from
 * a seeded stream so two clients, a replay and a server re-simulation all see
 * the same world.
 */
(function (root, factory) {
  var api = factory(
    typeof require === "function" ? require("../core/random.js") : (root.Racing || {}).Random
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.Racing = root.Racing || {}).Tracks = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Random) {
  "use strict";

  var DS = 1.0;             // metres between resampled centre-line points
  var SUB = 120;            // Catmull-Rom subdivisions per control segment


  /* Normalised control points map onto these spans, in metres. The v1 layout
     was 760x460 pixels at a 2.5 world scale; these spans keep that aspect ratio
     and land every circuit between roughly 1.3 and 2.1 km a lap, which at the
     fleet's real speeds is a 25-45 second lap. */
  var SPAN_X = 700;
  var SPAN_Y = 430;
  // v1 stored a pixel road width; 0.040 turns its 144-210 range into a 5.8-8.4 m
  // half-width, so the narrow mountain road is genuinely narrow.
  var WIDTH_TO_HALF = 0.040;

  /* Control points and widths are the v1 circuits unchanged. The comment v1
     carried about Harbor and Ridge is still true and still the reason those two
     ease their return leg out. */
  var TRACKS = {
    oval: {
      name: "Sunset Ring", theme: "sunset", kind: "circuit",
      points: [[0.50, 0.12], [0.80, 0.18], [0.92, 0.42], [0.86, 0.72], [0.62, 0.88], [0.34, 0.86], [0.12, 0.68], [0.08, 0.38]],
      width: 210
    },
    club: {
      name: "Club Circuit", theme: "day", kind: "circuit",
      points: [[0.48, 0.08], [0.78, 0.14], [0.94, 0.36], [0.90, 0.62], [0.70, 0.82], [0.44, 0.90], [0.20, 0.78], [0.06, 0.52], [0.14, 0.24]],
      width: 194
    },
    tech: {
      name: "Technical Park", theme: "day", kind: "circuit",
      points: [[0.50, 0.08], [0.76, 0.10], [0.92, 0.28], [0.88, 0.50], [0.96, 0.70], [0.74, 0.90], [0.46, 0.88], [0.26, 0.94], [0.08, 0.74], [0.12, 0.46], [0.06, 0.26]],
      width: 180
    },
    canyon: {
      name: "Canyon Switchbacks", theme: "dusk", kind: "mountain",
      points: [[0.18, 0.16], [0.48, 0.08], [0.80, 0.14], [0.92, 0.34], [0.72, 0.46], [0.94, 0.66], [0.74, 0.90], [0.43, 0.82], [0.18, 0.92], [0.07, 0.66], [0.28, 0.50], [0.08, 0.30]],
      width: 170
    },
    harbor: {
      name: "Harbor Sprint", theme: "night", kind: "circuit",
      points: [[0.10, 0.24], [0.52, 0.12], [0.91, 0.22], [0.93, 0.46], [0.90, 0.68], [0.76, 0.88], [0.34, 0.86], [0.08, 0.68]],
      width: 166
    },
    ridge: {
      name: "Mountain Ridge", theme: "dawn", kind: "mountain",
      points: [[0.40, 0.06], [0.72, 0.14], [0.92, 0.34], [0.80, 0.48], [0.94, 0.64], [0.70, 0.91], [0.38, 0.78], [0.12, 0.92], [0.06, 0.58], [0.24, 0.36], [0.10, 0.18]],
      width: 144
    },
    lot: {
      name: "Parking Lot Sandbox", theme: "day", kind: "lot", sandbox: true,
      points: [[0.5, 0.12], [0.86, 0.12], [0.86, 0.86], [0.14, 0.86], [0.14, 0.12]],
      width: 210, spanX: 430, spanY: 300
    }
  };

  var ORDER = ["oval", "club", "tech", "canyon", "harbor", "ridge", "lot"];

  /* Weather is a surface variant, not a separate track. Each one carries the
     multiplier the physics applies globally plus how much standing water the
     road picks up, because rain is only interesting if it is uneven. */
  var WEATHER = {
    dry:  { grip: 1.00, puddles: 0,  spray: 0,    skyDim: 0.00, label: "Dry" },
    wet:  { grip: 0.80, puddles: 10, spray: 0.45, skyDim: 0.28, label: "Wet" },
    rain: { grip: 0.68, puddles: 18, spray: 1.00, skyDim: 0.46, label: "Rain" }
  };

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function wrapAngle(a) {
    a = (a + Math.PI) % (Math.PI * 2);
    if (a < 0) a += Math.PI * 2;
    return a - Math.PI;
  }

  /* Catmull-Rom, uniform parameterisation: the same spline v1 drew, so the
     circuits keep their familiar shape. */
  function spline(p0, p1, p2, p3, t, axis) {
    var a = p0[axis], b = p1[axis], c = p2[axis], d = p3[axis];
    var t2 = t * t, t3 = t2 * t;
    return 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  }

  /* Discrete curvature at a point from the circle through it and its
     neighbours. Signed: positive turns left. */
  function triCurvature(a, b, c) {
    var abx = b.x - a.x, aby = b.y - a.y;
    var bcx = c.x - b.x, bcy = c.y - b.y;
    var cross = abx * bcy - aby * bcx;
    var l1 = Math.hypot(abx, aby), l2 = Math.hypot(bcx, bcy), l3 = Math.hypot(c.x - a.x, c.y - a.y);
    var denom = l1 * l2 * l3;
    return denom < 1e-9 ? 0 : (2 * cross) / denom;
  }

  /* Relax corners that no car could take.
   *
   * The control points come from v1, where they were a shape drawn on a 760x460
   * canvas. Read as metres they contain direction reversals with an 8-14 metre
   * radius -- a hairpin nothing in the fleet can negotiate, and a visible kink
   * in the road. v1 never noticed because its physics had a flat steering model
   * and no grip limit, so its car simply pivoted.
   *
   * Rather than redraw every circuit by hand, the dense polyline is relaxed
   * where, and only where, its curvature exceeds `KMAX`: the offending point
   * moves toward the midpoint of its neighbours, which locally opens the radius
   * and leaves the rest of the shape alone. Repeating this converges on the
   * tightest layout that is actually drivable, and `tests/racing-tracks.cjs`
   * asserts the result against the fleet's real cornering capability.
   */
  var KMAX = 1 / 34;        // 34 m is a hairpin: about 65 km/h at 1g
  var RELAX_DS = 3;         // metres between points while relaxing
  var RELAX_PASSES = 8;     // relax, re-space, repeat
  var RELAX_ITERS = 600;

  function relax(dense, kmax) {
    var m = dense.length;
    for (var it = 0; it < RELAX_ITERS; it++) {
      var worst = 0, moved = false;
      var next = new Array(m);
      for (var i = 0; i < m; i++) {
        var a = dense[(i - 1 + m) % m], b = dense[i], c = dense[(i + 1) % m];
        var k = Math.abs(triCurvature(a, b, c));
        if (k > worst) worst = k;
        if (k > kmax) {
          // How far over the limit decides how hard the point is pulled, so a
          // mild bend is barely touched and a cusp is opened quickly.
          var w = Math.min(0.5, 0.5 * (1 - kmax / k));
          next[i] = { x: b.x + ((a.x + c.x) / 2 - b.x) * w, y: b.y + ((a.y + c.y) / 2 - b.y) * w };
          moved = true;
        } else {
          next[i] = { x: b.x, y: b.y };
        }
      }
      for (var j = 0; j < m; j++) { dense[j] = next[j]; }
      if (!moved) break;
    }
    return dense;
  }

  /* Resample a closed polyline onto an even arc-length grid of spacing `step`.
     `ds` comes back slightly adjusted so a whole number of samples closes the
     loop exactly: without that the seam carries a short segment and `at()`
     reports the wrong position either side of the start line. */
  function evenly(poly, step) {
    var m = poly.length, acc = [0], total = 0, i, k;
    for (i = 0; i < m; i++) {
      var a = poly[i], b = poly[(i + 1) % m];
      total += Math.hypot(b.x - a.x, b.y - a.y);
      acc.push(total);
    }
    var count = Math.max(16, Math.round(total / step));
    var ds = total / count;
    var pts = [], seg = 0;
    for (k = 0; k < count; k++) {
      var want = k * ds;
      while (seg < m && acc[seg + 1] < want) seg++;
      var segLen = acc[seg + 1] - acc[seg];
      var f = segLen > 1e-9 ? (want - acc[seg]) / segLen : 0;
      var s0 = poly[seg % m], s1 = poly[(seg + 1) % m];
      pts.push({ x: s0.x + (s1.x - s0.x) * f, y: s0.y + (s1.y - s0.y) * f });
    }
    return { pts: pts, ds: ds, length: count * ds };
  }

  /* Dense spline samples, relaxed into something drivable, then resampled onto
     the even grid `at()` indexes. Returns { pts, ds, length }.
     Relaxation runs on an even grid rather than on the raw spline samples: the
     spline's own spacing varies by an order of magnitude between a long straight
     and a tight bend, and a Laplacian step on uneven spacing both mis-measures
     the curvature and bunches the points instead of opening the corner. */
  function resample(control) {
    var n = control.length, dense = [], i, k;
    for (i = 0; i < n; i++) {
      var p0 = control[(i - 1 + n) % n], p1 = control[i],
          p2 = control[(i + 1) % n], p3 = control[(i + 2) % n];
      for (k = 0; k < SUB; k++) {
        var t = k / SUB;
        dense.push({ x: spline(p0, p1, p2, p3, t, "x"), y: spline(p0, p1, p2, p3, t, "y") });
      }
    }
    // Relax at a coarse spacing, where the discrete curvature is a measurement
    // rather than rounding noise, then refine.
    var r = evenly(dense, RELAX_DS);
    for (var pass = 0; pass < RELAX_PASSES; pass++) {
      relax(r.pts, KMAX);
      r = evenly(r.pts, RELAX_DS);
    }
    return evenly(r.pts, DS);
  }

  /* Heading from a central difference, curvature from the rate of change of
     heading with distance. Central differences rather than forward ones so the
     curvature of a sample is symmetric about it and the sign is stable through
     an inflection. Curvature is then box-filtered: raw per-metre heading deltas
     on a 1 m grid are dominated by resampling noise, and the AI squares the
     value when it picks a corner speed, so noise there shows up as a car that
     brakes for nothing. */
  function annotate(pts, ds) {
    var n = pts.length, i;
    for (i = 0; i < n; i++) {
      var prev = pts[(i - 1 + n) % n], next = pts[(i + 1) % n];
      pts[i].heading = Math.atan2(next.y - prev.y, next.x - prev.x);
    }
    var raw = new Array(n);
    for (i = 0; i < n; i++) {
      var h0 = pts[(i - 1 + n) % n].heading, h1 = pts[(i + 1) % n].heading;
      raw[i] = wrapAngle(h1 - h0) / (2 * ds);
    }
    var WIN = 10;           // +/- 10 m of smoothing: shorter than any real corner
    for (i = 0; i < n; i++) {
      var sum = 0, c = 0;
      for (var j = -WIN; j <= WIN; j++) { sum += raw[(i + j + n * 2) % n]; c++; }
      pts[i].curvature = sum / c;
    }
    for (i = 0; i < n; i++) {
      pts[i].s = i * ds;
      pts[i].tx = Math.cos(pts[i].heading);
      pts[i].ty = Math.sin(pts[i].heading);
      // Left normal, so a positive lateral offset is to the left of travel and
      // matches the physics' body frame (vy positive is left).
      pts[i].nx = -pts[i].ty;
      pts[i].ny = pts[i].tx;
    }
    return pts;
  }

  /* Elevation is cosmetic: the simulation is flat. It is a sum of two slow
     sines keyed to distance round the lap, forced to close on itself so the
     start line does not have a step in it. Mountain tracks get more of it. */
  function elevation(track) {
    var n = track.pts.length, amp = track.kind === "mountain" ? 9 : track.kind === "lot" ? 0 : 3.5;
    for (var i = 0; i < n; i++) {
      var u = i / n;
      track.pts[i].elev = amp * (Math.sin(u * Math.PI * 2 * 2) * 0.65 + Math.sin(u * Math.PI * 2 * 3 + 1.1) * 0.35);
    }
  }

  /* Scenery. Seeded, side-alternating, and pushed clear of the road so nothing
     can be placed on the racing surface. Purely a renderer input. */
  function scenery(track, rng) {
    var props = [], n = track.pts.length;
    if (track.sandbox) {
      // The sandbox is a skid pad: cones and tyre stacks, no roadside furniture.
      var R = Math.min(track.spanX, track.spanY) * 0.30;
      for (var c = 0; c < 12; c++) {
        var a = (c / 12) * Math.PI * 2;
        props.push({ x: Math.cos(a) * R, y: Math.sin(a) * R, kind: "cone", seed: rng.int(0, 9999) });
      }
      props.push({ x: -R * 0.5, y: -R * 0.5, kind: "stack", seed: rng.int(0, 9999) });
      props.push({ x: R * 0.5, y: R * 0.5, kind: "stack", seed: rng.int(0, 9999) });
      props.push({ x: 0, y: 0, kind: "stack", seed: rng.int(0, 9999) });
      track.props = props;
      return;
    }
    var step = 9; // one prop every ~9 m of road, alternating sides
    for (var i = 0; i < n; i += step) {
      var p = track.pts[i];
      for (var side = -1; side <= 1; side += 2) {
        if (rng.chance(0.35)) continue;
        var off = (track.half + 3.2 + rng.float(0.5, 9)) * side;
        var kind = rng.chance(0.08) ? "sign" : rng.chance(0.14) ? "stack" : rng.chance(0.3) ? "rock" : "tree";
        props.push({
          x: p.x + p.nx * off, y: p.y + p.ny * off, s: p.s, side: side,
          kind: kind, elev: p.elev, seed: rng.int(0, 9999),
          scale: rng.float(0.75, 1.45)
        });
      }
    }
    // Marker posts at the edge of the road, which is what actually reads as
    // speed from inside the car.
    for (var m = 0; m < n; m += 14) {
      var q = track.pts[m];
      props.push({ x: q.x + q.nx * (track.half + 1.1), y: q.y + q.ny * (track.half + 1.1), s: q.s, side: -1, kind: "post", elev: q.elev, seed: m, scale: 1 });
      props.push({ x: q.x - q.nx * (track.half + 1.1), y: q.y - q.ny * (track.half + 1.1), s: q.s, side: 1, kind: "post", elev: q.elev, seed: m + 1, scale: 1 });
    }
    track.props = props;
  }

  /* Standing water, for wet and rain only. Each patch is a span of the lap and
     a lateral band, so a line through a corner can be wetter than the apex and
     the player has somewhere dry to aim for. */
  function puddles(track, rng, weather) {
    var w = WEATHER[weather] || WEATHER.dry, out = [];
    for (var i = 0; i < w.puddles; i++) {
      var s = rng.float(0, track.length);
      out.push({
        s: s,
        len: rng.float(8, 26),
        lat: rng.float(-0.75, 0.75),
        width: rng.float(0.25, 0.6)
      });
    }
    out.sort(function (a, b) { return a.s - b.s; });
    track.puddles = out;
  }

  function Track(id, def, opts) {
    opts = opts || {};
    var weather = WEATHER[opts.weather] ? opts.weather : "dry";
    var spanX = def.spanX || SPAN_X, spanY = def.spanY || SPAN_Y;
    var control = def.points.map(function (p) {
      return { x: (p[0] - 0.5) * spanX, y: (p[1] - 0.5) * spanY };
    });
    var r = resample(control);

    this.id = id;
    this.name = def.name;
    this.theme = def.theme;
    this.kind = def.kind;
    this.sandbox = !!def.sandbox;
    this.spanX = spanX;
    this.spanY = spanY;
    this.weather = weather;
    this.weatherGrip = WEATHER[weather].grip;
    this.pts = annotate(r.pts, r.ds);
    this.ds = r.ds;
    this.length = r.length;
    this.half = def.width * WIDTH_TO_HALF;
    // Beyond the kerb is run-off, and beyond that is scenery. Both are
    // multiples of the road so a wide circuit forgives a wide mistake. The kerb
    // band is a real two to three metres wide: at half * 1.12 it was under a
    // metre, so a car a wheel's width off the road was already on grass.
    this.kerb = this.half * 1.35;
    this.runoff = this.half * 2.6;

    /* The grip a driver should plan corner speeds around, as opposed to the
       weather multiplier the physics applies.
     
       In the wet the two are not the same. Standing water drops the surface
       under a car from `road` to `kerb` -- another 18% -- and the driver cannot
       see which part of which corner is flooded, so planning for the dry-line
       figure means arriving at the one wet apex on the lap too fast. Measured
       by driving every circuit in every condition: 0.70 of the weather figure is
       the largest allowance at which all seven stay on the road in rain, and
       without it the AI put a wheel off on four of them. */
    this.plannedGrip = this.weatherGrip * (WEATHER[weather].puddles ? 0.70 : 1);

    elevation(this);

    var rng = Random.create(opts.seed == null ? "track:" + id : opts.seed);
    scenery(this, rng.fork("scenery"));
    puddles(this, rng.fork("water"), weather);

    // Quarter-lap checkpoints: enough to catch a cut lap without being fussy.
    var n = this.pts.length;
    this.checkpoints = this.sandbox ? [0] : [0, Math.floor(n * 0.25) * this.ds, Math.floor(n * 0.5) * this.ds, Math.floor(n * 0.75) * this.ds];

    var start = this.pts[0];
    var self = this;
    this.start = {
      x: start.x, y: start.y, heading: start.heading,
      /* Grid slots run back down the road, staggered either side. They follow
         the centre line rather than the start-line tangent: on a circuit whose
         start sits in a bend, a straight-line grid walks off the road. */
      slot: function (i) {
        var back = 8 + i * 8, side = (i % 2 === 0 ? 1 : -1) * Math.min(2.6, self.half * 0.42);
        var p = self.at(-back);
        return {
          x: p.x - Math.sin(p.heading) * side,
          y: p.y + Math.cos(p.heading) * side,
          heading: p.heading
        };
      }
    };
  }

  /* The interface the AI, renderer and lap timer share. O(1): even spacing is
     what makes the index arithmetic legal. */
  Track.prototype.at = function (distance) {
    var n = this.pts.length, len = this.length;
    var d = distance % len;
    if (d < 0) d += len;
    var fi = d / this.ds;
    var i = Math.floor(fi), f = fi - i;
    var a = this.pts[i % n], b = this.pts[(i + 1) % n];
    return {
      x: a.x + (b.x - a.x) * f,
      y: a.y + (b.y - a.y) * f,
      heading: a.heading + wrapAngle(b.heading - a.heading) * f,
      curvature: a.curvature + (b.curvature - a.curvature) * f,
      elev: a.elev + (b.elev - a.elev) * f,
      half: this.half,
      s: d
    };
  };

  /* Nearest sample index to a world point, searched from a hint so it stays
     cheap for something that moves a little each tick. */
  Track.prototype.nearest = function (x, y, hintDistance) {
    var n = this.pts.length;
    var start = 0, span = n;
    if (hintDistance != null) {
      start = Math.round(hintDistance / this.ds);
      span = Math.max(8, Math.ceil(40 / this.ds));   // +/- 40 m is plenty at 60 Hz
    }
    var best = 0, bestD = Infinity;
    for (var k = -span; k <= span; k++) {
      var i = ((start + k) % n + n) % n;
      var p = this.pts[i];
      var d2 = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
      if (d2 < bestD) { bestD = d2; best = i; }
    }
    var bp = this.pts[best];
    var dx = x - bp.x, dy = y - bp.y;
    return {
      index: best,
      distance: best * this.ds,
      lateral: dx * bp.nx + dy * bp.ny,     // + is left of travel
      along: dx * bp.tx + dy * bp.ty,
      gap: Math.sqrt(bestD)
    };
  };

  /* Which physics surface a world point sits on. Returns a key from
     `Physics.SURFACES`. The sandbox is tarmac everywhere: it is a car park, and
     driving off the painted area should not punish the player. */
  Track.prototype.surfaceAt = function (x, y, hintDistance) {
    var near = this.nearest(x, y, hintDistance);
    var lat = Math.abs(near.lateral);
    if (this.sandbox) return lat > this.runoff * 2.2 ? "grass" : "road";
    if (lat > this.runoff) return "grass";
    if (lat > this.kerb) return this.kind === "mountain" ? "gravel" : "grass";
    if (lat > this.half) return "kerb";
    if (this.puddles.length && this.standingWater(near.distance, near.lateral / this.half) > 0.5) return "kerb";
    return "road";
  };

  /* 0..1 depth of standing water at a point on the road, which the renderer
     draws and the surface test uses. */
  Track.prototype.standingWater = function (distance, latNorm) {
    var out = 0, len = this.length;
    for (var i = 0; i < this.puddles.length; i++) {
      var p = this.puddles[i];
      var ds = Math.abs(wrapDistance(distance - p.s, len));
      if (ds > p.len) continue;
      var dl = Math.abs(latNorm - p.lat);
      if (dl > p.width) continue;
      var v = (1 - ds / p.len) * (1 - dl / p.width);
      if (v > out) out = v;
    }
    return out;
  };

  function wrapDistance(d, len) {
    d = d % len;
    if (d > len / 2) d -= len;
    if (d < -len / 2) d += len;
    return d;
  }

  /* The env object `Physics.step` wants, for a car at a given place. */
  Track.prototype.envFor = function (state, difficulty, hintDistance) {
    return {
      difficulty: difficulty || "standard",
      weather: this.weather,
      surface: this.surfaceAt(state.x, state.y, hintDistance)
    };
  };

  /* Built tracks are cached. Building one is not cheap -- the curvature
     relaxation is iterative -- and the renderer, the AI and the lap timer all
     ask for the same track. A fresh build per caller would cost about a second
     of the five the whole game is allowed to take to become playable. The
     objects are treated as immutable by every consumer, so sharing is safe. */
  var cache = {};

  function get(id, opts) {
    opts = opts || {};
    var key = (TRACKS[id] ? id : "oval") + "|" + (opts.weather || "dry") + "|" + (opts.seed == null ? "" : opts.seed);
    if (cache[key]) return cache[key];
    var def = TRACKS[id] || TRACKS.oval;
    var built = new Track(TRACKS[id] ? id : "oval", def, opts);
    cache[key] = built;
    return built;
  }

  /* Build without consulting or populating the cache. For tests that want to
     prove two builds of the same seed agree. */
  function build(id, opts) {
    var def = TRACKS[id] || TRACKS.oval;
    return new Track(TRACKS[id] ? id : "oval", def, opts);
  }

  return {
    DS: DS,
    KMAX: KMAX,
    SPAN_X: SPAN_X,
    SPAN_Y: SPAN_Y,
    WIDTH_TO_HALF: WIDTH_TO_HALF,
    TRACKS: TRACKS,
    ORDER: ORDER,
    WEATHER: WEATHER,
    Track: Track,
    get: get,
    build: build,
    clearCache: function () { cache = {}; },
    wrapDistance: wrapDistance,
    list: function () {
      return ORDER.map(function (id) {
        return { id: id, name: TRACKS[id].name, kind: TRACKS[id].kind, sandbox: !!TRACKS[id].sandbox };
      });
    }
  };
});
