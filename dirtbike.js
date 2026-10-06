/* Original side-scrolling dirt-bike game for the FunSAT arcade. */
(function () {
  "use strict";

  class DirtBike {
    static MAX_SPEED = 470;
    static AIR_SPIN_RATE = 9.5; // radians/sec of lean-driven rotation while airborne

    constructor(canvas, arcade) {
      this.canvas = canvas;
      this.arcade = arcade;
      this.ctx = canvas.getContext("2d");
      this.name = "Dirt Bike Trails";
      this.key = "dirtbike";
      this.W = 760;
      this.H = 460;
      this.smooth = true;
      this.reset();
    }

    reset() {
      this.started = false;
      this.over = false;
      this.score = 0;
      this.distance = 0;
      this.bestDistance = 0;
      this.x = 150;
      this.y = 230;
      this.vx = 0;
      this.vy = 0;
      this.angle = 0;
      this.spin = 0;
      this.airTime = 0;
      this.combo = 1;
      this.health = 3;
      this.cameraX = 0;
      this.cameraLean = 0;
      this.cameraPitch = 0;
      this.speedFx = 0;
      this.suspension = 0;
      this.wheelSpin = 0;
      this.throttleInput = 0;
      this.brakeInput = 0;
      this.leanInput = 0;
      this.renderX = this.x;
      this.renderY = this.y;
      this.renderAngle = this.angle;
      this.dust = [];
      this.checkpoint = 0;
      this.checkpointX = 0;
      this.touch = {};
      this.grounded = false;
      this.crashFlash = 0;
      this.seed = 4817;
      this.terrain = [];
      this.buildTerrain();
    }

    random() {
      this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
      return this.seed / 4294967296;
    }

    buildTerrain() {
      let x = -300;
      let y = 340;
      this.terrain.push({ x, y });
      for (let i = 1; i < 420; i++) {
        x += 42;
        const zone = Math.floor(i / 28) % 4;
        const wave = zone === 0 ? 18 : zone === 1 ? 42 : zone === 2 ? 70 : 30;
        const slope = Math.sin(i * (zone === 2 ? 0.42 : 0.24)) * wave;
        const bump = (this.random() - 0.5) * (zone === 2 ? 24 : 12);
        y = 330 + slope + Math.sin(i * 0.073) * 35 + bump;
        if (i % 46 === 0) y -= 82;
        if (i % 46 === 1) y += 66;
        this.terrain.push({ x, y: Math.max(185, Math.min(395, y)) });
      }
    }

    terrainY(x) {
      const pts = this.terrain;
      let i = Math.max(0, Math.min(pts.length - 2, Math.floor((x + 300) / 42)));
      while (i < pts.length - 2 && pts[i + 1].x < x) i++;
      while (i > 0 && pts[i].x > x) i--;
      const p0 = pts[Math.max(0, i - 1)], a = pts[i], b = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      const t = Math.max(0, Math.min(1, (x - a.x) / (b.x - a.x)));
      const t2 = t * t, t3 = t2 * t;
      return 0.5 * ((2 * a.y) + (-p0.y + b.y) * t + (2 * p0.y - 5 * a.y + 4 * b.y - p3.y) * t2 + (-p0.y + 3 * a.y - 3 * b.y + p3.y) * t3);
    }

    terrainAngle(x) {
      return Math.atan2(this.terrainY(x + 12) - this.terrainY(x - 12), 24);
    }

    held(dir) {
      const k = this.arcade._heldKeys || {};
      return !!(this.touch[dir] > 0 ||
        (dir === "up" && (k.ArrowUp || k.w || k.W)) ||
        (dir === "down" && (k.ArrowDown || k.s || k.S)) ||
        (dir === "left" && (k.ArrowLeft || k.a || k.A)) ||
        (dir === "right" && (k.ArrowRight || k.d || k.D)));
    }

    input(dir) {
      this.touch[dir] = 0.7;
    }

    tap() {
      this.touch.up = 0.35;
    }

    update(dt) {
      Object.keys(this.touch).forEach((key) => { this.touch[key] = Math.max(0, this.touch[key] - dt); });
      this.crashFlash = Math.max(0, this.crashFlash - dt * 2.5);
      if (!this.started || this.over) return;

      const gas = this.held("up");
      const brake = this.held("down");
      const lean = (this.held("right") ? 1 : 0) - (this.held("left") ? 1 : 0);
      const inputBlend = 1 - Math.exp(-dt * 12);
      this.throttleInput += ((gas ? 1 : 0) - this.throttleInput) * inputBlend;
      this.brakeInput += ((brake ? 1 : 0) - this.brakeInput) * inputBlend;
      // Lean reacts faster than throttle/brake so A/D and the arrows feel immediate.
      this.leanInput += (lean - this.leanInput) * (1 - Math.exp(-dt * 26));
      const ground = this.terrainY(this.x);
      const slope = this.terrainAngle(this.x);
      const wheelY = this.y + 23;
      const wasGrounded = this.grounded;
      this.grounded = wheelY >= ground - 5 && this.vy >= -30;

      // Launch off a ramp: carry the slope's upward component into vertical speed,
      // scaled by how fast the lip was taken. Without this the bike just walks off
      // the edge and drops, so every jump felt the same height regardless of speed.
      if (wasGrounded && !this.grounded) {
        const upSlope = Math.max(0, -Math.sin(slope));
        const speedFactor = Math.min(1, this.vx / DirtBike.MAX_SPEED);
        this.vy -= upSlope * this.vx * (0.85 + speedFactor * 1.15);
      }

      if (this.grounded) {
        this.y = ground - 23;
        this.vy = Math.min(0, this.vy) * -0.14;
        this.angle += ((slope + this.leanInput * 0.22) - this.angle) * (1 - Math.exp(-dt * 14));
        this.spin *= Math.max(0, 1 - dt * 8);
        this.vx += this.throttleInput * 390 * dt;
        this.vx -= (this.brakeInput * 460 + 38) * dt;
        this.vx += Math.sin(slope) * 110 * dt;
        this.vx = Math.max(20, Math.min(DirtBike.MAX_SPEED, this.vx));
        if (gas && this.vx > 80 && Math.random() < dt * 18) this.dust.push({ x: this.x - 28, y: ground - 4, life: 1, size: 4 + Math.random() * 7 });
        if (this.airTime > 0.45) {
          const landing = Math.max(0, 1 - Math.abs(this.angle - slope) / 1.1);
          this.score += Math.round(this.airTime * 140 * this.combo * landing);
          this.combo = landing > 0.55 ? Math.min(5, this.combo + 0.35) : 1;
          this.suspension = Math.min(9, this.airTime * 7);
        }
        this.airTime = 0;
      } else {
        this.vy += 570 * dt;
        this.angle += (this.leanInput * DirtBike.AIR_SPIN_RATE + this.spin) * dt;
        this.spin *= Math.max(0, 1 - dt * 0.7);
        this.airTime += dt;
        this.vx += this.throttleInput * 58 * dt;
        this.vx -= this.brakeInput * 82 * dt;
      }

      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.distance = Math.max(this.distance, this.x);
      this.cameraX += ((this.x - 210) - this.cameraX) * Math.min(1, dt * 4.2);
      this.cameraLean += ((this.leanInput * -0.045) - this.cameraLean) * (1 - Math.exp(-dt * 8));
      this.cameraPitch += ((this.throttleInput * -1 + this.brakeInput * 1.35) - this.cameraPitch) * (1 - Math.exp(-dt * 7));
      this.speedFx += ((this.vx / 470) - this.speedFx) * Math.min(1, dt * 4);
      this.suspension *= Math.max(0, 1 - dt * 7);
      this.wheelSpin = (this.wheelSpin + this.vx * dt / 15) % (Math.PI * 2);
      const renderBlend = 1 - Math.exp(-dt * 20);
      this.renderX += (this.x - this.renderX) * renderBlend;
      this.renderY += (this.y - this.renderY) * renderBlend;
      this.renderAngle += Math.atan2(Math.sin(this.angle - this.renderAngle), Math.cos(this.angle - this.renderAngle)) * renderBlend;
      this.dust.forEach((p) => { p.life -= dt; p.y -= dt * 13; p.size += dt * 10; });
      this.dust = this.dust.filter((p) => p.life > 0).slice(-80);
      this.score = Math.max(this.score, Math.floor(this.distance / 4));

      const nextCheckpoint = Math.floor(this.x / 1800);
      if (nextCheckpoint > this.checkpoint) {
        this.checkpoint = nextCheckpoint;
        this.checkpointX = nextCheckpoint * 1800;
        this.score += 500;
        this.health = Math.min(3, this.health + 1);
      }

      const upsideDown = Math.cos(this.angle) < -0.25;
      if ((this.grounded && upsideDown) || this.y > this.H + 180) this.crash();
      if (this.x >= this.terrain[this.terrain.length - 3].x) {
        this.score += 3000;
        this.over = true;
      }
    }

    crash() {
      this.health--;
      this.crashFlash = 1;
      this.combo = 1;
      if (this.health <= 0) {
        this.over = true;
        return;
      }
      this.x = Math.max(150, this.checkpointX + 120);
      this.y = this.terrainY(this.x) - 40;
      this.vx = 55;
      this.vy = 0;
      this.angle = this.terrainAngle(this.x);
      this.spin = 0;
      this.renderX = this.x;
      this.renderY = this.y;
      this.renderAngle = this.angle;
    }

    drawBike(ctx, sx, sy) {
      ctx.save();
      ctx.translate(sx, sy + this.suspension);
      ctx.rotate(this.renderAngle);
      const wheel = (x) => {
        ctx.fillStyle = "#111827";
        ctx.beginPath(); ctx.arc(x, 19, 16, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#94a3b8"; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, 19, 9, 0, Math.PI * 2); ctx.stroke();
        ctx.save(); ctx.translate(x, 19); ctx.rotate(this.wheelSpin); ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 1;
        for (let i = 0; i < 6; i++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(9, 0); ctx.stroke(); }
        ctx.restore();
      };
      wheel(-24); wheel(25);
      ctx.strokeStyle = "#fb4b23"; ctx.lineWidth = 7; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(-24, 16); ctx.lineTo(-4, -5); ctx.lineTo(25, 16); ctx.lineTo(4, 16); ctx.lineTo(-24, 16); ctx.stroke();
      ctx.strokeStyle = "#dbeafe"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-4, -5); ctx.lineTo(12, -18); ctx.lineTo(25, 16); ctx.stroke();
      ctx.fillStyle = "#0f172a"; ctx.beginPath(); ctx.roundRect(-8, -3, 17, 15, 4); ctx.fill();
      ctx.fillStyle = "#22d3ee"; ctx.beginPath(); ctx.roundRect(-13, -14, 29, 11, 4); ctx.fill();
      ctx.fillStyle = "#f8fafc"; ctx.fillRect(-11, -16, 21, 4);
      ctx.strokeStyle = "#64748b"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-10, 4); ctx.lineTo(-30, 8); ctx.stroke();
      ctx.strokeStyle = "#cbd5e1"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(14, -15); ctx.lineTo(30, 6); ctx.stroke();
      ctx.fillStyle = "#fb4b23"; ctx.beginPath(); ctx.moveTo(10, -12); ctx.lineTo(31, -9); ctx.lineTo(27, -4); ctx.lineTo(8, -5); ctx.fill();
      ctx.fillStyle = "#fb4b23"; ctx.beginPath(); ctx.moveTo(-10, -10); ctx.lineTo(-31, -4); ctx.lineTo(-29, 1); ctx.lineTo(-7, -3); ctx.fill();
      const riderLean = this.cameraPitch * 2.2 + this.leanInput * 3.2;
      ctx.strokeStyle = "#f8fafc"; ctx.lineWidth = 8; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(-1, -14); ctx.lineTo(-7 + riderLean, -35); ctx.lineTo(10 + riderLean, -47); ctx.stroke();
      ctx.strokeStyle = "#1e293b"; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(-5, -31); ctx.lineTo(12, -17); ctx.moveTo(-5, -31); ctx.lineTo(-19, -15); ctx.stroke();
      ctx.fillStyle = "#fde047"; ctx.beginPath(); ctx.arc(12 + riderLean, -51, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#0f172a"; ctx.beginPath(); ctx.arc(15 + riderLean, -52, 8, -.8, .7); ctx.fill();
      ctx.restore();
    }

    draw(ctx) {
      const W = this.W, H = this.H;
      const shake = this.suspension * .45;
      ctx.save();
      ctx.translate(W / 2 + (Math.random() - .5) * shake, H / 2 + this.cameraPitch * 5 + (Math.random() - .5) * shake);
      ctx.rotate(this.cameraLean);
      ctx.translate(-W / 2, -H / 2);
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#38bdf8"); sky.addColorStop(0.65, "#dbeafe"); sky.addColorStop(1, "#fef3c7");
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,255,255,.75)";
      for (let i = 0; i < 6; i++) {
        const x = ((i * 173 - this.cameraX * (0.16 + this.speedFx * .08)) % (W + 180)) - 80;
        ctx.beginPath(); ctx.ellipse(x, 78 + (i % 3) * 30 + this.cameraPitch * 5, 52, 16, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = "#94a3b8";
      ctx.beginPath(); ctx.moveTo(0, H);
      for (let x = 0; x <= W + 20; x += 20) ctx.lineTo(x, 205 + this.cameraPitch * 9 + Math.sin((x + this.cameraX * .16) / 120) * 38);
      ctx.lineTo(W, H); ctx.fill();
      ctx.fillStyle = "#4ade80";
      ctx.beginPath(); ctx.moveTo(0, H);
      for (let x = 0; x <= W + 20; x += 20) ctx.lineTo(x, 255 + this.cameraPitch * 6 + Math.sin((x + this.cameraX * (.35 + this.speedFx * .1)) / 95) * 45);
      ctx.lineTo(W, H); ctx.fill();

      ctx.fillStyle = "#854d0e";
      ctx.beginPath(); ctx.moveTo(0, H);
      for (let sx = -80; sx <= W + 80; sx += 10) ctx.lineTo(sx, this.terrainY(sx + this.cameraX));
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#65a30d"; ctx.lineWidth = 9; ctx.lineCap = "round"; ctx.beginPath();
      let started = false;
      for (let sx = -80; sx <= W + 80; sx += 8) {
        const sy = this.terrainY(sx + this.cameraX);
        if (!started) { ctx.moveTo(sx, sy); started = true; } else ctx.lineTo(sx, sy);
      }
      ctx.stroke();

      // Trail-side pines and speed streaks create scale and make acceleration visible.
      for (let i = 0; i < 24; i++) {
        const wx = 420 + i * 680, sx = wx - this.cameraX * .84;
        if (sx < -70 || sx > W + 70) continue;
        const gy = this.terrainY(wx);
        ctx.fillStyle = "#4b2e1f"; ctx.fillRect(sx - 3, gy - 62, 6, 62);
        ctx.fillStyle = i % 2 ? "#166534" : "#14532d"; ctx.beginPath(); ctx.moveTo(sx, gy - 118); ctx.lineTo(sx - 30, gy - 42); ctx.lineTo(sx + 30, gy - 42); ctx.closePath(); ctx.fill();
      }
      this.dust.forEach((p) => { ctx.globalAlpha = p.life * .45; ctx.fillStyle = "#fde68a"; ctx.beginPath(); ctx.arc(p.x - this.cameraX, p.y, p.size, 0, Math.PI * 2); ctx.fill(); }); ctx.globalAlpha = 1;
      if (this.speedFx > .62) {
        ctx.strokeStyle = "rgba(255,255,255,.28)"; ctx.lineWidth = 2;
        for (let i = 0; i < 10; i++) { const y = 110 + i * 28; ctx.beginPath(); ctx.moveTo(W - 90 - (i % 3) * 35, y); ctx.lineTo(W - 15, y - this.cameraLean * 180); ctx.stroke(); }
      }

      for (let cp = 1; cp < 10; cp++) {
        const x = cp * 1800 - this.cameraX;
        if (x < -30 || x > W + 30) continue;
        const y = this.terrainY(cp * 1800);
        ctx.fillStyle = "#f8fafc"; ctx.fillRect(x, y - 95, 5, 95);
        ctx.fillStyle = "#0f172a"; ctx.fillRect(x + 5, y - 95, 58, 26);
        ctx.fillStyle = "#fff"; ctx.font = "700 12px system-ui"; ctx.fillText("CHECK", x + 12, y - 77);
      }

      this.drawBike(ctx, this.renderX - this.cameraX, this.renderY);
      ctx.restore();
      ctx.fillStyle = "rgba(15,23,42,.84)"; ctx.fillRect(14, 14, 260, 64);
      ctx.fillStyle = "#fff"; ctx.font = "800 18px system-ui";
      ctx.fillText(Math.max(0, Math.floor(this.distance / 10)) + " m", 26, 39);
      ctx.font = "700 13px system-ui";
      ctx.fillText("Score " + this.score + "  |  " + Math.round(this.vx * .261) + " mph  |  Lives " + "●".repeat(this.health) + "○".repeat(3 - this.health), 26, 62);
      if (this.airTime > .4) {
        ctx.fillStyle = "#0f172a"; ctx.font = "800 16px system-ui";
        ctx.fillText("AIR " + this.airTime.toFixed(1) + "s  x" + this.combo.toFixed(1), W - 190, 38);
      }
      if (!this.started) {
        ctx.fillStyle = "rgba(15,23,42,.64)"; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = "900 30px system-ui";
        ctx.fillText("DIRT BIKE TRAILS", W / 2, H / 2 - 28);
        ctx.font = "700 15px system-ui";
        ctx.fillText("UP gas  DOWN brake  LEFT / RIGHT lean", W / 2, H / 2 + 10);
        ctx.fillText("Land smoothly and reach each checkpoint", W / 2, H / 2 + 36);
        ctx.textAlign = "start";
      }
      if (this.crashFlash) {
        ctx.fillStyle = "rgba(239,68,68," + (this.crashFlash * .28) + ")"; ctx.fillRect(0, 0, W, H);
      }
    }
  }

  window.DirtBike = DirtBike;
})();
