/* Renderer: owns the frame, the graphics tier and the HUD.
 *
 * The contract with the simulation is one way. The renderer is handed the
 * states the simulation produced and must not write to them, must not advance
 * them, and must not consult the clock for anything the simulation uses. The
 * only value that crosses the other way is `alpha`, the fraction of a tick the
 * frame falls between, and that is read, never set.
 *
 * That is what makes the graphics tiers safe. Low, medium and high change draw
 * distance, particle counts, how much scenery is kept, the segment length of
 * the road and whether certain treatments run at all -- and nothing else. There
 * is no branch anywhere below that feeds a tier back into the simulation, so a
 * run recorded on a Chromebook at the low tier replays bit for bit on a desktop
 * at high. `tests/racing-render.cjs` drives all three tiers against the same
 * input log and asserts the resulting physics snapshots are identical.
 *
 * Canvas 2D, not WebGL, deliberately: the arcade hands every game a single
 * shared canvas that already has a 2D context, a canvas cannot have both, and a
 * software projection is more than fast enough for a few hundred flat polygons.
 */
(function (root, factory) {
  var api = factory(
    typeof require === "function" ? require("./camera.js") : (root.Racing || {}).Camera,
    typeof require === "function" ? require("./track.js") : (root.Racing || {}).RenderTrack,
    typeof require === "function" ? require("./car.js") : (root.Racing || {}).RenderCar,
    typeof require === "function" ? require("./effects.js") : (root.Racing || {}).Effects,
    typeof require === "function" ? require("../core/random.js") : (root.Racing || {}).Random,
    typeof require === "function" ? require("../core/vehicle-physics.js") : (root.Racing || {}).Physics
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.Racing = root.Racing || {}).Renderer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (Camera, RenderTrack, RenderCar, EffectsMod, Random, Physics) {
  "use strict";

  var TIER_ORDER = ["low", "medium", "high"];

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function Renderer(opts) {
    opts = opts || {};
    this.tier = TIER_ORDER.indexOf(opts.tier) >= 0 ? opts.tier : "medium";
    this.camera = Camera.create({ mode: opts.camera || "chase" });
    this.rng = Random.create(opts.seed == null ? "render" : opts.seed);
    this.effects = EffectsMod.create({ rng: this.rng.fork("fx"), tier: this.tier });
    this.wheelSpin = 0;
    this.prev = null;          // previous tick's player state, for interpolation
    this.prevRivals = [];
    this.reducedMotion = !!opts.reducedMotion;
    this.frames = 0;
    this.lastFrameMs = 0;
  }

  Renderer.prototype.setTier = function (tier) {
    if (TIER_ORDER.indexOf(tier) < 0) return this;
    this.tier = tier;
    this.effects.setTier(tier);
    return this;
  };
  Renderer.prototype.cycleTier = function () {
    return this.setTier(TIER_ORDER[(TIER_ORDER.indexOf(this.tier) + 1) % TIER_ORDER.length]);
  };
  Renderer.prototype.setCamera = function (mode) { this.camera.setMode(mode); return this; };
  Renderer.prototype.reset = function () {
    this.effects.reset();
    this.camera.ready = false;
    this.prev = null;
    this.prevRivals = [];
    this.wheelSpin = 0;
    return this;
  };

  /* Remember where everything was at the end of a tick, so the next frame can
     draw between that and the tick after it. Called by the game loop once per
     simulation tick, never per frame. */
  Renderer.prototype.recordTick = function (state, rivals) {
    this.prev = { x: state.x, y: state.y, heading: state.heading, vx: state.vx, vy: state.vy, yawRate: state.yawRate };
    this.prevRivals = (rivals || []).map(function (r) {
      return { x: r.x, y: r.y, heading: r.heading, vx: r.vx, vy: r.vy, yawRate: r.yawRate };
    });
    return this;
  };

  /* One frame.
   *
   * `frame` carries everything the renderer is allowed to see:
   *   ctx, width, height   the target
   *   track, car, state    the world and the player's car
   *   rivals               [{state, car, look}]
   *   alpha                0..1 from the fixed-step clock
   *   dt                   render seconds since the last frame
   *   look                 paint and wheels
   *   env                  { weather, difficulty }
   *   hud                  whatever the game wants written over the top
   */
  Renderer.prototype.render = function (frame) {
    var started = (typeof performance !== "undefined" && performance.now) ? performance.now() : 0;
    var ctx = frame.ctx;
    var w = frame.width, h = frame.height;
    var track = frame.track, car = frame.car, state = frame.state;
    var T = RenderTrack.tier(this.tier);
    var pal = RenderTrack.theme(frame.theme || (track && track.theme) || "sunset");
    var dt = clamp(frame.dt || 0, 0, 0.1);

    var pose = Camera.blend(this.prev, state, frame.alpha);
    var speed = Math.hypot(state.vx, state.vy);

    // Where the car is on the road, which the road drawing needs as its origin.
    var near = track.nearest(pose.x, pose.y, this._hint);
    this._hint = near.distance;
    var ground = track.at(near.distance).elev || 0;

    // Camera and effects run on render time. Reduced motion holds the camera
    // rigid and skips the speed treatments; it does not change the simulation.
    this.camera.follow(pose, this.reducedMotion ? Math.min(dt, 1 / 30) : dt, ground);
    this.effects.update(dt);
    this.effects.advanceWeather(dt, speed);
    if (!this.reducedMotion) this.effects.emit(pose, state, car, dt, frame.env);
    this.wheelSpin += speed / Math.max(0.1, car.wheelRadius) * dt;

    var view = this.camera.view(w, h, this.reducedMotion ? null : this.rng.fork("shake"));

    // ---- the frame, far to near ------------------------------------------
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();

    RenderTrack.drawSky(ctx, view, pal, 0, { skyBands: T.skyBands });
    RenderTrack.drawGround(ctx, view, pal);
    RenderTrack.drawDistance(ctx, view, pal, track);
    RenderTrack.drawRoad(ctx, view, track, pal, T, near.distance, frame);
    RenderTrack.drawStartLine(ctx, view, track, pal, near.distance, T);
    this.effects.drawSkids(ctx, view);
    if (T.rail) RenderTrack.drawBarrier(ctx, view, track, pal, near.distance, T);
    RenderTrack.drawScenery(ctx, view, track, pal, near.distance, T);

    // Cars, far to near, the player among them rather than always on top.
    var list = [];
    var rivals = frame.rivals || [];
    for (var i = 0; i < rivals.length; i++) {
      var rp = Camera.blend(this.prevRivals[i], rivals[i].state, frame.alpha);
      var rc = view.toCamera(rp.x, rp.y, 0);
      if (rc.f <= 0.4 || rc.f > T.draw) continue;
      list.push({ d: rc.f, pose: rp, car: rivals[i].car, state: rivals[i].state, look: rivals[i].look });
    }
    var selfCam = view.toCamera(pose.x, pose.y, 0);
    list.push({ d: selfCam.f, pose: pose, car: car, state: state, look: frame.look, self: true });
    list.sort(function (a, b) { return b.d - a.d; });
    for (var k = 0; k < list.length; k++) {
      var e = list[k];
      // The hood camera sits inside the player's own car, so drawing it would
      // fill the screen with the inside of a door.
      if (e.self && this.camera.mode === "hood") continue;
      RenderCar.draw(ctx, view, e.car, e.pose, e.state, e.look, {
        ground: ground,
        wheelSpin: this.wheelSpin,
        softShadow: T.shadow === "soft",
        lightsOn: pal === RenderTrack.THEMES.night || (frame.env && frame.env.weather === "rain")
      });
    }

    this.effects.drawParticles(ctx, view);
    if (this.camera.mode === "hood") this.drawCockpit(ctx, w, h, view, frame.look);
    this.effects.drawWeather(ctx, view, frame.env, speed);
    if (!this.reducedMotion) this.effects.drawSpeed(ctx, view, speed);
    ctx.restore();

    if (frame.hud !== false) this.drawHud(ctx, w, h, state, car, frame);

    this.frames++;
    if (started) this.lastFrameMs = performance.now() - started;
    return this;
  };

  /* A suggestion of the car around the player in the hood view: the top of the
     bonnet and the pillars. Drawn in screen space because it does not move
     relative to the camera. Deliberately shallow -- it must not become an
     opaque band across the picture. */
  Renderer.prototype.drawCockpit = function (ctx, w, h, view, look) {
    var colour = RenderCar.paint(look && look.paint);
    var hz = view.horizon();
    var top = clamp(hz + h * 0.20, h * 0.42, h * 0.80);
    ctx.save();
    var g = ctx.createLinearGradient(0, top, 0, h);
    g.addColorStop(0, colour);
    g.addColorStop(1, "rgba(0,0,0,0.85)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-w * 0.1, h + 2);
    ctx.lineTo(w * 0.16, top + h * 0.05);
    ctx.quadraticCurveTo(w * 0.5, top - h * 0.03, w * 0.84, top + h * 0.05);
    ctx.lineTo(w * 1.1, h + 2);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  };

  // --------------------------------------------------------------------------
  // HUD
  // --------------------------------------------------------------------------

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* Speed dial, drift angle, and whatever the game put in `frame.hud`.
     Laid out from the short edge so it survives 1366x768 as well as 1440x900. */
  Renderer.prototype.drawHud = function (ctx, w, h, state, car, frame) {
    var hud = frame.hud || {};
    var unit = Math.min(w, h * 1.6);
    var pad = Math.round(unit * 0.022);
    var kph = Physics.kph(state);
    var accent = "#2fd4d9";

    ctx.save();
    ctx.textBaseline = "alphabetic";

    // ---- speed dial, bottom left ----
    var r = Math.round(unit * 0.062);
    var cx = pad + r + 6, cy = h - pad - r - 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 7, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(10,14,20,0.62)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 0.78, Math.PI * 0.78 + Math.PI * 1.44);
    ctx.strokeStyle = "rgba(255,255,255,0.20)";
    ctx.lineWidth = Math.max(3, r * 0.14);
    ctx.stroke();
    var frac = clamp(kph / 260, 0, 1);
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 0.78, Math.PI * 0.78 + Math.PI * 1.44 * frac);
    ctx.strokeStyle = accent;
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = "700 " + Math.round(r * 0.72) + "px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(String(Math.round(kph)), cx, cy + r * 0.16);
    ctx.font = "600 " + Math.round(r * 0.26) + "px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.fillText("KM/H", cx, cy + r * 0.48);

    // Gear, in its own pill beside the dial.
    var gx = cx + r + 14, gy = cy + r * 0.2;
    roundRect(ctx, gx - 2, gy - r * 0.58, r * 0.82, r * 0.82, 6);
    ctx.fillStyle = "rgba(10,14,20,0.62)";
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 " + Math.round(r * 0.46) + "px system-ui, -apple-system, Segoe UI, sans-serif";
    ctx.fillText(String(state.gear), gx - 2 + r * 0.41, gy);

    // ---- drift angle, bottom left above the dial ----
    var drift = Math.abs(Physics.driftAngle(state)) * 180 / Math.PI;
    if (drift > 4 && Math.hypot(state.vx, state.vy) > 4) {
      ctx.textAlign = "left";
      ctx.fillStyle = accent;
      ctx.font = "700 " + Math.round(unit * 0.030) + "px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(Math.round(drift) + "°", pad + 2, cy - r - 16);
      ctx.fillStyle = "rgba(255,255,255,0.66)";
      ctx.font = "600 " + Math.round(unit * 0.013) + "px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText("DRIFT ANGLE", pad + 2, cy - r - 4);
    }

    // ---- top left: the run's own numbers ----
    if (hud.title || hud.score != null) {
      ctx.textAlign = "left";
      if (hud.title) {
        ctx.fillStyle = "rgba(255,255,255,0.70)";
        ctx.font = "700 " + Math.round(unit * 0.013) + "px system-ui, -apple-system, Segoe UI, sans-serif";
        ctx.fillText(String(hud.title).toUpperCase(), pad, pad + unit * 0.016);
      }
      if (hud.score != null) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "800 " + Math.round(unit * 0.042) + "px system-ui, -apple-system, Segoe UI, sans-serif";
        ctx.fillText(String(hud.score), pad, pad + unit * 0.062);
      }
      if (hud.sub) {
        ctx.fillStyle = accent;
        ctx.font = "700 " + Math.round(unit * 0.018) + "px system-ui, -apple-system, Segoe UI, sans-serif";
        ctx.fillText(String(hud.sub), pad, pad + unit * 0.085);
      }
    }

    // ---- top right: lap and clock ----
    ctx.textAlign = "right";
    if (hud.right) {
      ctx.fillStyle = "rgba(255,255,255,0.70)";
      ctx.font = "700 " + Math.round(unit * 0.013) + "px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(String(hud.right).toUpperCase(), w - pad, pad + unit * 0.016);
    }
    if (hud.rightBig) {
      ctx.fillStyle = "#ffffff";
      ctx.font = "800 " + Math.round(unit * 0.030) + "px system-ui, -apple-system, Segoe UI, sans-serif";
      ctx.fillText(String(hud.rightBig), w - pad, pad + unit * 0.050);
    }

    ctx.restore();
    void car;
  };

  return {
    TIER_ORDER: TIER_ORDER,
    Renderer: Renderer,
    create: function (opts) { return new Renderer(opts); }
  };
});
