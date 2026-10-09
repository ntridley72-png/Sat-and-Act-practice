/* Tyre smoke, skid marks, spray, rain and the screen treatments that sell speed.
 *
 * All of it is decoration. Nothing in this file is read by the simulation, and
 * nothing in it writes to a physics state, so a tier that draws fewer particles
 * produces exactly the same car in exactly the same place as a tier that draws
 * more. `tests/racing-render.cjs` asserts that.
 *
 * Particles still come from a seeded stream rather than Math.random(). They do
 * not have to -- they are not simulation -- but a screenshot that differs run to
 * run cannot be compared against a reference, and a bug reproduced from a seed
 * should reproduce the picture too.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.Racing = root.Racing || {}).Effects = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /* Per-tier particle budgets. The only thing a tier changes. */
  var BUDGETS = {
    low:    { smoke: 26,  skid: 70,  rain: 0,   streaks: false, spray: 0,  glow: false },
    medium: { smoke: 70,  skid: 180, rain: 90,  streaks: true,  spray: 26, glow: false },
    high:   { smoke: 150, skid: 340, rain: 220, streaks: true,  spray: 64, glow: true }
  };

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function Effects(opts) {
    opts = opts || {};
    this.rng = opts.rng;
    this.budget = BUDGETS[opts.tier] || BUDGETS.medium;
    this.smoke = [];
    this.skids = [];
    this.spray = [];
    this.rain = [];
    this.flash = 0;
  }

  Effects.prototype.setTier = function (tier) {
    this.budget = BUDGETS[tier] || BUDGETS.medium;
    // Trim rather than clear: changing tier mid-run should not wipe the marks
    // already on the road.
    if (this.smoke.length > this.budget.smoke) this.smoke.length = this.budget.smoke;
    if (this.skids.length > this.budget.skid) this.skids.splice(0, this.skids.length - this.budget.skid);
    return this;
  };

  Effects.prototype.reset = function () {
    this.smoke.length = 0; this.skids.length = 0; this.spray.length = 0; this.rain.length = 0;
    this.flash = 0;
    return this;
  };

  /* Feed one car's state in each frame. `slip` is how sideways it is, 0..1. */
  Effects.prototype.emit = function (pose, state, car, dt, env) {
    var speed = Math.hypot(state.vx, state.vy);
    var slipR = Math.abs(state.slipR || 0);
    var spinning = clamp((state.wheelspin || 0), 0, 1);
    var sliding = clamp((slipR - 0.14) / 0.5, 0, 1);
    var smoking = Math.max(sliding, spinning * 0.7);
    var wet = env && env.weather && env.weather !== "dry";

    // Rear contact patches, where the smoke and the marks come from.
    var c = Math.cos(pose.heading), s = Math.sin(pose.heading);
    var halfTrack = (car.trackWidth || car.wheelbase * 0.62) * 0.49;
    var rx = -car.rearAxle;

    if (smoking > 0.04 && speed > 3) {
      var want = Math.ceil(smoking * 3);
      for (var i = 0; i < want && this.smoke.length < this.budget.smoke; i++) {
        var sgn = (i % 2) ? 1 : -1;
        var px = pose.x + rx * c - sgn * halfTrack * s;
        var py = pose.y + rx * s + sgn * halfTrack * c;
        this.smoke.push({
          x: px + this.rng.float(-0.3, 0.3), y: py + this.rng.float(-0.3, 0.3), z: 0.12,
          vx: this.rng.float(-1.1, 1.1) - state.vx * 0.06 * c,
          vy: this.rng.float(-1.1, 1.1) - state.vx * 0.06 * s,
          vz: this.rng.float(0.5, 1.5),
          life: 1, decay: this.rng.float(0.42, 0.72),
          r: this.rng.float(0.5, 1.1), dark: wet ? 0.45 : 1
        });
      }
      // Skid marks, laid as short segments so the road keeps a trail.
      if (this.skids.length < this.budget.skid && sliding > 0.1) {
        for (var w = -1; w <= 1; w += 2) {
          this.skids.push({
            x: pose.x + rx * c - w * halfTrack * s,
            y: pose.y + rx * s + w * halfTrack * c,
            h: pose.heading, a: clamp(sliding, 0, 1) * 0.55, life: 1
          });
        }
        while (this.skids.length > this.budget.skid) this.skids.shift();
      }
    }

    // Spray: wet weather, from all four wheels, proportional to speed.
    if (wet && this.budget.spray && speed > 6) {
      for (var k = 0; k < 2 && this.spray.length < this.budget.spray; k++) {
        var sg = k ? 1 : -1;
        this.spray.push({
          x: pose.x + rx * c - sg * halfTrack * s, y: pose.y + rx * s + sg * halfTrack * c, z: 0.1,
          vx: -state.vx * 0.12 * c + this.rng.float(-1, 1),
          vy: -state.vx * 0.12 * s + this.rng.float(-1, 1),
          vz: this.rng.float(0.8, 2.2),
          life: 1, decay: this.rng.float(1.6, 2.6), r: this.rng.float(0.12, 0.30)
        });
      }
    }
    void dt;
    return this;
  };

  /* Age everything. Render time, not tick time: these are not simulation. */
  Effects.prototype.update = function (dt) {
    var i, p;
    for (i = this.smoke.length - 1; i >= 0; i--) {
      p = this.smoke[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vz *= 1 - 1.2 * dt;
      p.r += dt * 2.6;
      p.life -= p.decay * dt;
      if (p.life <= 0) this.smoke.splice(i, 1);
    }
    for (i = this.spray.length - 1; i >= 0; i--) {
      p = this.spray[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vz -= 7 * dt;
      p.life -= p.decay * dt;
      if (p.life <= 0 || p.z < 0) this.spray.splice(i, 1);
    }
    for (i = this.skids.length - 1; i >= 0; i--) {
      this.skids[i].life -= dt * 0.045;
      if (this.skids[i].life <= 0) this.skids.splice(i, 1);
    }
    this.flash = Math.max(0, this.flash - dt * 3);
    return this;
  };

  /* Skid marks go on the road, under the cars. */
  Effects.prototype.drawSkids = function (ctx, view) {
    for (var i = 0; i < this.skids.length; i++) {
      var s = this.skids[i];
      var c = Math.cos(s.h), sn = Math.sin(s.h);
      var L = 0.9, W = 0.16;
      var pts = view.polygon([
        { x: s.x + c * L - sn * W, y: s.y + sn * L + c * W, z: 0.01 },
        { x: s.x + c * L + sn * W, y: s.y + sn * L - c * W, z: 0.01 },
        { x: s.x - c * L + sn * W, y: s.y - sn * L - c * W, z: 0.01 },
        { x: s.x - c * L - sn * W, y: s.y - sn * L + c * W, z: 0.01 }
      ]);
      if (pts.length < 3) continue;
      ctx.save();
      ctx.globalAlpha = clamp(s.a * s.life, 0, 0.55);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (var j = 1; j < pts.length; j++) ctx.lineTo(pts[j].x, pts[j].y);
      ctx.closePath();
      ctx.fillStyle = "#0d0e11";
      ctx.fill();
      ctx.restore();
    }
    return this;
  };

  /* Smoke and spray go over the cars, far to near. */
  Effects.prototype.drawParticles = function (ctx, view) {
    var all = [], i, p, c;
    for (i = 0; i < this.smoke.length; i++) {
      p = this.smoke[i];
      c = view.point(p.x, p.y, p.z);
      if (c) all.push({ s: c, p: p, kind: "smoke" });
    }
    for (i = 0; i < this.spray.length; i++) {
      p = this.spray[i];
      c = view.point(p.x, p.y, p.z);
      if (c) all.push({ s: c, p: p, kind: "spray" });
    }
    all.sort(function (a, b) { return b.s.d - a.s.d; });
    for (i = 0; i < all.length; i++) {
      var e = all[i], r = Math.max(1, e.p.r * e.s.k);
      ctx.save();
      if (e.kind === "smoke") {
        ctx.globalAlpha = clamp(e.p.life * 0.5, 0, 0.5);
        var g = ctx.createRadialGradient(e.s.x, e.s.y, 0, e.s.x, e.s.y, r);
        var tone = Math.round(210 * e.p.dark + 40);
        g.addColorStop(0, "rgba(" + tone + "," + tone + "," + (tone + 6) + ",0.95)");
        g.addColorStop(1, "rgba(" + tone + "," + tone + "," + (tone + 6) + ",0)");
        ctx.fillStyle = g;
      } else {
        ctx.globalAlpha = clamp(e.p.life * 0.32, 0, 0.32);
        ctx.fillStyle = "#cfe0ea";
      }
      ctx.beginPath();
      ctx.arc(e.s.x, e.s.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    return this;
  };

  /* Rain, as screen-space streaks leaning with the car's motion. Drawn last,
     over everything, because that is where a windscreen is. */
  Effects.prototype.drawWeather = function (ctx, view, env, speed) {
    if (!env || env.weather === "dry" || !this.budget.rain) return this;
    var n = env.weather === "rain" ? this.budget.rain : Math.round(this.budget.rain * 0.4);
    var w = view.width, h = view.height;
    var lean = clamp(speed / 60, 0, 1);
    ctx.save();
    ctx.strokeStyle = "rgba(200,222,236,0.40)";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (var i = 0; i < n; i++) {
      // A fixed lattice scrolled by time: cheap, and it never needs a particle
      // array for something that is only ever on screen for a frame.
      var x = ((i * 2654435761) % 10007) / 10007 * w;
      var phase = (this.rainPhase || 0) + i * 0.137;
      var y = ((phase % 1) + ((i * 97) % 13) / 13) % 1 * h;
      var len = h * (0.03 + lean * 0.10);
      ctx.moveTo(x, y);
      ctx.lineTo(x - len * 0.22, y + len);
    }
    ctx.stroke();
    ctx.restore();
    return this;
  };

  Effects.prototype.advanceWeather = function (dt, speed) {
    this.rainPhase = ((this.rainPhase || 0) + dt * (1.4 + speed * 0.03)) % 1000;
    return this;
  };

  /* Speed treatments: a vignette that tightens with speed and a few radial
     streaks at the edge of the frame. Nothing in the middle of the screen,
     because the player is trying to see the road. */
  Effects.prototype.drawSpeed = function (ctx, view, speed) {
    var w = view.width, h = view.height;
    var t = clamp((speed - 22) / 58, 0, 1);
    if (t <= 0.001) return this;
    var g = ctx.createRadialGradient(w * 0.5, h * 0.55, h * (0.52 - t * 0.14), w * 0.5, h * 0.55, h * 0.95);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, "rgba(0,0,0," + (0.18 + t * 0.34).toFixed(3) + ")");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    if (!this.budget.streaks || t < 0.3) return this;
    ctx.save();
    ctx.globalAlpha = (t - 0.3) * 0.5;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (var i = 0; i < 16; i++) {
      var a = (i / 16) * Math.PI * 2 + 0.2;
      var r0 = h * (0.52 + ((i * 53) % 17) / 17 * 0.16);
      var r1 = r0 + h * (0.08 + t * 0.14);
      ctx.moveTo(w * 0.5 + Math.cos(a) * r0 * 1.3, h * 0.55 + Math.sin(a) * r0);
      ctx.lineTo(w * 0.5 + Math.cos(a) * r1 * 1.3, h * 0.55 + Math.sin(a) * r1);
    }
    ctx.stroke();
    ctx.restore();
    return this;
  };

  return {
    BUDGETS: BUDGETS,
    Effects: Effects,
    create: function (opts) { return new Effects(opts); }
  };
});
