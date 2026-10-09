/* Cameras, and the projection everything else draws through.
 *
 * Two cameras: a chase camera behind the car and a hood camera on its cowl.
 * Both are drift aware, which is the whole point. A camera rigidly bolted to
 * the car's heading hides a slide: the world rotates with the car, so the
 * player sees a straight road and no sense that the back end has stepped out. A
 * camera rigidly bolted to the direction of travel is worse, because the car
 * then appears to crab across a static scene. What reads correctly is a camera
 * that lags the heading and leans toward the direction the car is actually
 * moving, by an amount that grows with the drift angle.
 *
 * Nothing here is part of the simulation. The camera reads a physics state and
 * never writes to one, and it is advanced with render time, not tick time, so
 * it is free to be smooth between ticks.
 *
 * Interpolation: the simulation only knows where the car was at tick N. The
 * renderer is asked to draw somewhere between tick N-1 and tick N, which is
 * what `alpha` from racing/core/fixed-step.js is for. `blend()` produces the
 * in-between pose, so a 144 Hz display shows smooth motion from a 60 Hz
 * simulation.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else (root.Racing = root.Racing || {}).Camera = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var NEAR = 0.35;          // metres; nearer than this is clipped away

  var MODES = {
    chase: {
      back: 7.2, height: 2.95, lookAhead: 10, pitch: -0.105, fov: 1.18,
      yawLag: 5.6, driftLean: 0.62, posLag: 11.0, heightLag: 6.0, name: "Chase"
    },
    far: {
      back: 12.5, height: 5.1, lookAhead: 14, pitch: -0.155, fov: 1.26,
      yawLag: 4.0, driftLean: 0.70, posLag: 8.0, heightLag: 5.0, name: "Wide"
    },
    hood: {
      back: -0.15, height: 1.14, lookAhead: 24, pitch: -0.028, fov: 1.30,
      yawLag: 22.0, driftLean: 0.14, posLag: 40.0, heightLag: 22.0, name: "Hood"
    }
  };

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function wrap(a) {
    a = (a + Math.PI) % (Math.PI * 2);
    if (a < 0) a += Math.PI * 2;
    return a - Math.PI;
  }
  // Exponential smoothing written so the result does not depend on frame rate.
  function smooth(cur, target, rate, dt) {
    return cur + (target - cur) * (1 - Math.exp(-rate * dt));
  }
  function smoothAngle(cur, target, rate, dt) {
    return wrap(cur + wrap(target - cur) * (1 - Math.exp(-rate * dt)));
  }

  /* The pose to draw this frame: the tick-N state nudged `alpha` of the way on
     from tick N-1. Heading is interpolated the short way round. */
  function blend(prev, now, alpha) {
    if (!prev) {
      return { x: now.x, y: now.y, heading: now.heading, vx: now.vx, vy: now.vy, yawRate: now.yawRate };
    }
    var a = clamp(alpha || 0, 0, 1);
    return {
      x: prev.x + (now.x - prev.x) * a,
      y: prev.y + (now.y - prev.y) * a,
      heading: wrap(prev.heading + wrap(now.heading - prev.heading) * a),
      vx: prev.vx + (now.vx - prev.vx) * a,
      vy: prev.vy + (now.vy - prev.vy) * a,
      yawRate: prev.yawRate + (now.yawRate - prev.yawRate) * a
    };
  }

  function Camera(opts) {
    opts = opts || {};
    this.mode = MODES[opts.mode] ? opts.mode : "chase";
    this.x = 0; this.y = 0; this.z = 2;
    this.yaw = 0; this.pitch = MODES[this.mode].pitch;
    this.fov = MODES[this.mode].fov;
    this.shake = 0;
    this.speedFov = 0;
    this.ready = false;
  }

  Camera.prototype.setMode = function (mode) {
    if (!MODES[mode] || mode === this.mode) return this;
    this.mode = mode;
    this.ready = false;         // snap rather than sweep across the car
    return this;
  };

  Camera.prototype.cycle = function () {
    var order = ["chase", "far", "hood"];
    return this.setMode(order[(order.indexOf(this.mode) + 1) % order.length]);
  };

  /* Add a kick, in metres of apparent displacement. Called for kerb strikes and
     contact; decays on its own. */
  Camera.prototype.kick = function (amount) {
    this.shake = Math.min(1.6, this.shake + (amount || 0.3));
    return this;
  };

  /* Follow a car pose. `dt` is render seconds. `ground` is the road height
     under the car, if the track has elevation. */
  Camera.prototype.follow = function (pose, dt, ground) {
    var m = MODES[this.mode];
    var z0 = ground || 0;
    var speed = Math.hypot(pose.vx, pose.vy);

    // Drift angle: where the car is pointing against where it is going. Zero at
    // a standstill, where the arctangent is noise.
    var drift = speed > 1.2 ? Math.atan2(pose.vy, Math.abs(pose.vx) + 0.001) : 0;
    // A reversing car should not swing the camera round to look at its own boot.
    if (pose.vx < -0.5) drift = 0;
    var lean = clamp(drift, -0.9, 0.9) * m.driftLean;
    var targetYaw = pose.heading + lean;

    // The anchor is behind the car along the camera's own yaw, not the car's.
    // Hung off the car's heading instead, the camera whips round during a slide
    // and the player loses the road.
    if (!this.ready) {
      this.yaw = targetYaw;
      this.ready = true;
      this.x = pose.x - Math.cos(this.yaw) * m.back;
      this.y = pose.y - Math.sin(this.yaw) * m.back;
      this.z = z0 + m.height;
      this.shake = 0;
      this.speedFov = 0;
    } else {
      this.yaw = smoothAngle(this.yaw, targetYaw, m.yawLag, dt);
    }

    var wantX = pose.x - Math.cos(this.yaw) * m.back;
    var wantY = pose.y - Math.sin(this.yaw) * m.back;
    this.x = smooth(this.x, wantX, m.posLag, dt);
    this.y = smooth(this.y, wantY, m.posLag, dt);
    this.z = smooth(this.z, z0 + m.height, m.heightLag, dt);

    // Speed widens the field of view a little and drops the nose. Both are
    // cheap, and together they do most of the work of making 200 km/h feel
    // different from 80.
    var norm = clamp(speed / 72, 0, 1);
    this.speedFov = smooth(this.speedFov, norm, 3.2, dt);
    this.fov = m.fov + this.speedFov * 0.14;
    this.pitch = m.pitch - this.speedFov * 0.022;

    this.shake = Math.max(0, this.shake - dt * 2.6);
    this.look = { x: pose.x + Math.cos(pose.heading) * m.lookAhead, y: pose.y + Math.sin(pose.heading) * m.lookAhead };
    this.drift = drift;
    return this;
  };

  /* A projection bound to this camera and a viewport.
   *
   * Returned as its own small object rather than methods on the camera, so a
   * frame's worth of trigonometry is computed once instead of per vertex, and
   * so the drawing code cannot accidentally move the camera mid-frame.
   */
  Camera.prototype.view = function (width, height, rng) {
    var sx = 0, sy = 0;
    if (this.shake > 0.001 && rng) {
      sx = rng.float(-1, 1) * this.shake * 9;
      sy = rng.float(-1, 1) * this.shake * 9;
    }
    var cy = Math.cos(this.yaw), sinY = Math.sin(this.yaw);
    var cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    var focal = (height * 0.5) / Math.tan(this.fov * 0.5);
    var ox = width * 0.5 + sx, oy = height * 0.5 + sy;
    var camX = this.x, camY = this.y, camZ = this.z;

    return {
      width: width, height: height, focal: focal, near: NEAR,
      camX: camX, camY: camY, camZ: camZ, yaw: this.yaw, pitch: this.pitch,
      ox: ox, oy: oy,

      /* World point to camera space: forward (depth), right, up. */
      toCamera: function (x, y, z) {
        var dx = x - camX, dy = y - camY, dz = (z || 0) - camZ;
        var f = dx * cy + dy * sinY;
        var r = dx * sinY - dy * cy;
        return { f: f * cp + dz * sp, r: r, u: -f * sp + dz * cp };
      },

      /* Camera space to screen. Caller must have ensured c.f > near. */
      toScreen: function (c) {
        var k = focal / c.f;
        return { x: ox + c.r * k, y: oy - c.u * k, d: c.f, k: k };
      },

      /* World straight to screen, or null if behind the near plane. */
      point: function (x, y, z) {
        var c = this.toCamera(x, y, z);
        if (c.f <= NEAR) return null;
        return this.toScreen(c);
      },

      /* The screen y of the horizon: where the ground plane vanishes. Drawn
         rather than derived from geometry, so there is no need for a huge
         ground polygon -- and therefore no opaque slab for the camera to pass
         under. */
      horizon: function () {
        // A point infinitely far along the view direction has u/f -> -sp/cp.
        return oy + focal * (sp / cp);
      },

      /* Clip a convex polygon of {x,y,z} world points against the near plane and
         project what survives. Returns an array of screen points, possibly
         empty. Without this, a road quad straddling the camera plane projects
         to infinity and smears across the screen. */
      polygon: function (pts) {
        var cam = [], i;
        for (i = 0; i < pts.length; i++) cam.push(this.toCamera(pts[i].x, pts[i].y, pts[i].z || 0));
        var out = [];
        for (i = 0; i < cam.length; i++) {
          var a = cam[i], b = cam[(i + 1) % cam.length];
          var aIn = a.f > NEAR, bIn = b.f > NEAR;
          if (aIn) out.push(a);
          if (aIn !== bIn) {
            var t = (NEAR - a.f) / (b.f - a.f);
            out.push({ f: NEAR, r: a.r + (b.r - a.r) * t, u: a.u + (b.u - a.u) * t });
          }
        }
        var screen = [];
        for (i = 0; i < out.length; i++) screen.push(this.toScreen(out[i]));
        return screen;
      }
    };
  };

  return {
    NEAR: NEAR,
    MODES: MODES,
    Camera: Camera,
    blend: blend,
    create: function (opts) { return new Camera(opts); }
  };
});
