/* Original side-scrolling dirt-bike game for the FunSAT arcade. */
(function () {
  "use strict";

  class DirtBike {
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
      const a = pts[i], b = pts[i + 1];
      const t = Math.max(0, Math.min(1, (x - a.x) / (b.x - a.x)));
      return a.y + (b.y - a.y) * t;
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
      const ground = this.terrainY(this.x);
      const slope = this.terrainAngle(this.x);
      const wheelY = this.y + 23;
      this.grounded = wheelY >= ground - 5 && this.vy >= -30;

      if (this.grounded) {
        this.y = ground - 23;
        this.vy = Math.min(0, this.vy) * -0.14;
        this.angle += (slope - this.angle) * Math.min(1, dt * 9);
        this.spin *= Math.max(0, 1 - dt * 8);
        this.vx += (gas ? 215 : 0) * dt;
        this.vx -= (brake ? 300 : 38) * dt;
        this.vx += Math.sin(slope) * 110 * dt;
        this.vx = Math.max(20, Math.min(300, this.vx));
        if (this.airTime > 0.45) {
          const landing = Math.max(0, 1 - Math.abs(this.angle - slope) / 1.1);
          this.score += Math.round(this.airTime * 140 * this.combo * landing);
          this.combo = landing > 0.55 ? Math.min(5, this.combo + 0.35) : 1;
        }
        this.airTime = 0;
      } else {
        this.vy += 570 * dt;
        this.angle += (lean * 4.2 + this.spin) * dt;
        this.spin *= Math.max(0, 1 - dt * 0.7);
        this.airTime += dt;
        if (gas) this.vx += 32 * dt;
        if (brake) this.vx -= 55 * dt;
      }

      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.distance = Math.max(this.distance, this.x);
      this.cameraX += ((this.x - 210) - this.cameraX) * Math.min(1, dt * 4.2);
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
    }

    drawBike(ctx, sx, sy) {
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(this.angle);
      const wheel = (x) => {
        ctx.fillStyle = "#111827";
        ctx.beginPath(); ctx.arc(x, 19, 15, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = "#d1d5db"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(x, 19, 8, 0, Math.PI * 2); ctx.stroke();
      };
      wheel(-24); wheel(25);
      ctx.strokeStyle = "#f97316"; ctx.lineWidth = 6; ctx.lineJoin = "round";
      ctx.beginPath(); ctx.moveTo(-24, 16); ctx.lineTo(-4, -5); ctx.lineTo(25, 16); ctx.lineTo(4, 16); ctx.lineTo(-24, 16); ctx.stroke();
      ctx.strokeStyle = "#e5e7eb"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-4, -5); ctx.lineTo(12, -18); ctx.lineTo(25, 16); ctx.stroke();
      ctx.fillStyle = "#22d3ee"; ctx.fillRect(-11, -12, 24, 9);
      ctx.strokeStyle = "#f8fafc"; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(-1, -13); ctx.lineTo(-8, -34); ctx.lineTo(10, -48); ctx.stroke();
      ctx.fillStyle = "#fde047"; ctx.beginPath(); ctx.arc(12, -51, 9, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    draw(ctx) {
      const W = this.W, H = this.H;
      const sky = ctx.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#38bdf8"); sky.addColorStop(0.65, "#dbeafe"); sky.addColorStop(1, "#fef3c7");
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,255,255,.75)";
      for (let i = 0; i < 6; i++) {
        const x = ((i * 173 - this.cameraX * 0.16) % (W + 180)) - 80;
        ctx.beginPath(); ctx.ellipse(x, 78 + (i % 3) * 30, 52, 16, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = "#86efac";
      ctx.beginPath(); ctx.moveTo(0, H);
      for (let x = 0; x <= W + 20; x += 20) ctx.lineTo(x, 250 + Math.sin((x + this.cameraX * .35) / 95) * 45);
      ctx.lineTo(W, H); ctx.fill();

      ctx.fillStyle = "#854d0e";
      ctx.beginPath(); ctx.moveTo(0, H);
      for (const p of this.terrain) {
        const sx = p.x - this.cameraX;
        if (sx >= -80 && sx <= W + 80) ctx.lineTo(sx, p.y);
      }
      ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#65a30d"; ctx.lineWidth = 9; ctx.lineCap = "round"; ctx.beginPath();
      let started = false;
      for (const p of this.terrain) {
        const sx = p.x - this.cameraX;
        if (sx < -80 || sx > W + 80) continue;
        if (!started) { ctx.moveTo(sx, p.y); started = true; } else ctx.lineTo(sx, p.y);
      }
      ctx.stroke();

      for (let cp = 1; cp < 10; cp++) {
        const x = cp * 1800 - this.cameraX;
        if (x < -30 || x > W + 30) continue;
        const y = this.terrainY(cp * 1800);
        ctx.fillStyle = "#f8fafc"; ctx.fillRect(x, y - 95, 5, 95);
        ctx.fillStyle = "#0f172a"; ctx.fillRect(x + 5, y - 95, 58, 26);
        ctx.fillStyle = "#fff"; ctx.font = "700 12px system-ui"; ctx.fillText("CHECK", x + 12, y - 77);
      }

      this.drawBike(ctx, this.x - this.cameraX, this.y);
      ctx.fillStyle = "rgba(15,23,42,.84)"; ctx.fillRect(14, 14, 260, 64);
      ctx.fillStyle = "#fff"; ctx.font = "800 18px system-ui";
      ctx.fillText(Math.max(0, Math.floor(this.distance / 10)) + " m", 26, 39);
      ctx.font = "700 13px system-ui";
      ctx.fillText("Score " + this.score + "  |  Lives " + "●".repeat(this.health) + "○".repeat(3 - this.health), 26, 62);
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
