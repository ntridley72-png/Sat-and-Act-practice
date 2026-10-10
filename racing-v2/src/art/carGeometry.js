/* Procedural car geometry - ported from racing3d.js (this repository).
 *
 * PORTED, NOT REWRITTEN. These builders were already parameterised on THREE
 * (e.g. bodyGeometry(THREE, car)), so moving them to the npm three package
 * only required swapping the injected module: window.THREE -> THREE. Retyping
 * ~400 lines of proven lofting maths into strict TS would risk introducing
 * bugs for no benefit, so this stays JS and is typed at its boundary in
 * carGeometry.d.ts.
 *
 * Why this file exists: this project ships NO third-party meshes. Every car is
 * generated in code from the archetype table at the bottom, which makes the art
 * original by construction rather than by assertion - there is no GLB for a
 * compliance scan to find. See vendor/pmndrs-racing-game/VENDORING.md.
 *
 * racing3d.js states at line 3 "All geometry is generated procedurally:
 * original body shapes, no third-party models" and at line 356 "twelve hero
 * cars, original designs on generational archetypes". This port preserves both
 * claims; do not introduce an imported mesh here.
 */
import * as THREE from 'three'

function loftGeometry(THREE, rings) {
    const pos = [], idx = [], uvs = [];
    const n = rings[0].length;
    rings.forEach((r, ri) => r.forEach((p, pi) => { pos.push(p[0], p[1], p[2]); uvs.push(pi / n, ri / (rings.length - 1)); }));
    for (let r = 0; r < rings.length - 1; r++) {
      for (let i = 0; i < n; i++) {
        const a = r * n + i, b = r * n + ((i + 1) % n), c = (r + 1) * n + ((i + 1) % n), d = (r + 1) * n + i;
        idx.push(a, b, d, b, c, d);
      }
    }
    const cap = (ri, flip) => {
      const r = rings[ri];
      let cx = 0, cy = 0, cz = 0;
      r.forEach((p) => { cx += p[0] / n; cy += p[1] / n; cz += p[2] / n; });
      const ci = pos.length / 3;
      pos.push(cx, cy, cz); uvs.push(.5, .5);
      for (let i = 0; i < n; i++) {
        const a = ri * n + i, b = ri * n + ((i + 1) % n);
        if (flip) idx.push(ci, b, a); else idx.push(ci, a, b);
      }
    };
    cap(0, true); cap(rings.length - 1, false);
    const g = new THREE.BufferGeometry();
    g.setIndex(idx);
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    return g;
  }

function ringShaped(w, y0, y1, sillW, shoulderW, deckW, creaseY) {
    const h = Math.max(.01, y1 - y0);
    const yC = y1 - Math.min(Math.max(creaseY == null ? .05 : creaseY, .02), h * .5);
    const sW = w * (sillW == null ? 1 : sillW);
    const hW = w * (shoulderW == null ? 1 : shoulderW);
    const dW = w * (deckW == null ? 1 : deckW);
    return [
      [0, y0],
      [sW * .82, y0 + .01],
      [sW, y0 + h * .1],
      [sW + (hW - sW) * .35, yC - h * .18],
      [hW, yC],
      [hW - (hW - dW) * .55, yC + (y1 - yC) * .45],
      [dW, y1 - h * .07],
      [dW * .8, y1 - h * .015],
      [0, y1],
      [-dW * .8, y1 - h * .015],
      [-dW, y1 - h * .07],
      [-hW + (hW - dW) * .55, yC + (y1 - yC) * .45],
      [-hW, yC],
      [-sW - (hW - sW) * .35, yC - h * .18],
      [-sW, y0 + h * .1],
      [-sW * .82, y0 + .01]
    ];
  }

function lerp(a, b, t) { return a + (b - a) * t; }

function C(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }

function buildStations(car) {
    const L = car.len, wb = car.wheelbase / 2, arch = car.archY;
    const nose = -L / 2, tail = L / 2;
    const wid = car.wid, widR = car.widR || car.wid;
    const fenderF = car.fenderF == null ? .03 : car.fenderF, fenderR = car.fenderR == null ? .04 : car.fenderR;
    const cabF = car.cabin[0], cabR = car.cabin[1];
    const dl = (car.deckLine && car.deckLine.length > 1) ? car.deckLine : [[nose, car.noseY, 1], [tail, car.tailY, 1]];
    const dlAt = (z) => {
      if (z <= dl[0][0]) return dl[0];
      for (let i = 0; i < dl.length - 1; i++) {
        const a = dl[i], b = dl[i + 1];
        if (z <= b[0]) { const t = (z - a[0]) / Math.max(.001, b[0] - a[0]); return [z, lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
      }
      return dl[dl.length - 1];
    };
    const top = (z) => Math.min(dlAt(z)[1], car.beltY + .001 === z ? car.beltY : dlAt(z)[1]);
    const wAt = (z) => {
      const t = (z - nose) / L;
      return lerp(wid, widR, Math.pow(Math.max(0, Math.min(1, t)), .9)) * dlAt(z)[2];
    };
    const base = (z) => Math.max(.1, car.baseY - .02) + .05 * Math.abs(z) / (L / 2);
    const st = [];
    const put = (z, yb, yt, w, r) => { const c = Math.min(yb, yt - .05); st.push([z, Math.max(.08, c), yt, w, r]); };
    const archRun = (wz, fender, front) => {
      const w = wAt(wz);
      put(wz - car.archW, base(wz - car.archW) + (front ? 0 : .01), top(wz - car.archW), w + fender * .45, .38);
      put(wz - car.archW * .45, arch, top(wz - car.archW * .45), w + fender * .95, .32);
      put(wz, arch, top(wz), w + fender, .32);
      put(wz + car.archW * .45, arch, top(wz + car.archW * .45), w + fender * .95, .32);
      put(wz + car.archW, base(wz + car.archW) + (front ? .01 : 0), top(wz + car.archW), w + fender * .45, .38);
    };
    put(nose, car.baseY + .1, car.noseY - .02, wAt(nose) * .92, .65);
    put(nose + .05, car.baseY + .12, car.noseY, wAt(nose + .05) * .96, .5);
    put(nose + .24, base(nose + .24), top(nose + .24), wAt(nose + .24) * .97, .4);
    archRun(-wb, fenderF, true);
    put(cabF - .28, base(cabF - .28), top(cabF - .28), wAt(cabF - .28), .34);
    put(cabF, base(cabF), top(cabF), wAt(cabF), .32);
    put(cabR, base(cabR), top(cabR), wAt(cabR), .32);
    archRun(wb, fenderR, false);
    put(tail - .55, base(tail - .55), top(tail - .55), wAt(tail - .55), .38);
    put(tail - .32, base(tail - .32) + .03, top(tail - .32) - .01, wAt(tail - .32) * .95, .4);
    put(tail - .14, car.baseY + .12, car.tailY - .03, wAt(tail - .14) * .82, .44);
    put(tail - .02, car.baseY + .16, car.tailY - .07, wAt(tail - .02) * .68, .5);
    put(tail, car.baseY + .2, car.tailY - .12, wAt(tail) * .58, .55);
    return st.sort((a, b) => a[0] - b[0]);
  }

function bodyGeometry(THREE, car) {
    const stations = buildStations(car);
    const rings = stations.map((s) => ringShaped(s[3], s[1], s[2], car.sillW, car.shoulderW, car.deckW, car.creaseY).map((p) => [p[0], p[1], s[0]]));
    return loftGeometry(THREE, rings);
  }

function canopyStations(car) {
    const belt = car.beltY - .02, roof = car.roofY, cabF = car.cabin[0], cabR = car.cabin[1];
    const wB = car.wid * car.cabinW * .94, wR = wB * .84, B = roof - belt;
    const t1 = cabF + (cabR - cabF) * .45, t2 = cabR - .25;
    return [
      [cabF - .18, belt, belt + .02, wB * .34],
      [cabF - .05, belt, belt + B * .34, wB * .72],
      [t1, belt, roof, wR * 1.18],
      [t2, belt, roof, wR * 1.16],
      [cabR - .06, belt, belt + B * .72, wB * .9],
      [cabR + .08, belt, belt + B * .3, wB * .6],
      [cabR + .26, belt, belt + .02, wB * .3]
    ];
  }

function canopySections(car) {
    const rings = canopyStations(car).map((s) => {
      const h = Math.max(.02, s[2] - s[1]);
      return ringShaped(s[3], s[1], s[2], 1, .97, .82, h * .3).map((p) => [p[0], p[1], s[0]]);
    });
    return rings;
  }

function canopyGeometry(THREE, car) {
    return loftGeometry(THREE, canopySections(car));
  }

function materials(THREE, paintHex, finish, env) {
        const P = { gloss: { clear: .5, rough: .3, metal: .35, envI: .55 }, metallic: { clear: 1, rough: .22, metal: .5, envI: .8 }, pearl: { clear: .9, rough: .26, metal: .4, envI: .6 }, matte: { clear: .05, rough: .72, metal: .2, envI: .3 }, chrome: { clear: 1, rough: .1, metal: .95, envI: 1 } }[finish || 'gloss'] || { clear: .5, rough: .3, metal: .35, envI: .55 };
    const paint = new THREE.MeshPhysicalMaterial({ color: C(paintHex), metalness: P.metal, roughness: P.rough, clearcoat: P.clear, clearcoatRoughness: .08, envMap: env, envMapIntensity: P.envI });
    const glass = new THREE.MeshPhysicalMaterial({ color: C('#0a0f16'), metalness: .05, roughness: .04, transparent: true, opacity: .45, envMap: env, envMapIntensity: .85, clearcoat: 1, clearcoatRoughness: .04, depthWrite: false, side: THREE.DoubleSide });
    const chrome = new THREE.MeshStandardMaterial({ color: C('#dfe4ea'), metalness: 1, roughness: .18, envMap: env, envMapIntensity: 1 });
    const dark = new THREE.MeshStandardMaterial({ color: C('#101318'), metalness: .35, roughness: .5 });
    const trim = new THREE.MeshStandardMaterial({ color: C('#1a1e25'), metalness: .6, roughness: .34, envMap: env, envMapIntensity: .7 });
    const tire = new THREE.MeshStandardMaterial({ color: C('#0b0c0f'), metalness: 0, roughness: .95 });
    const rim = new THREE.MeshStandardMaterial({ color: C('#b6bcc6'), metalness: .95, roughness: .3, envMap: env, envMapIntensity: .85 });
    const rimDark = new THREE.MeshStandardMaterial({ color: C('#33383f'), metalness: .9, roughness: .32, envMap: env, envMapIntensity: .7 });
    const disc = new THREE.MeshStandardMaterial({ color: C('#7e838c'), metalness: .92, roughness: .42 });
    const caliper = new THREE.MeshStandardMaterial({ color: C('#c1121f'), metalness: .45, roughness: .38 });
    const tail = new THREE.MeshStandardMaterial({ color: C('#170303'), emissive: C('#ff2416'), emissiveIntensity: .9, roughness: .35 });
    const head = new THREE.MeshStandardMaterial({ color: C('#131a22'), emissive: C('#dcecff'), emissiveIntensity: 1.0, roughness: .25 });
    const amber = new THREE.MeshStandardMaterial({ color: C('#40260a'), emissive: C('#ff9d1e'), emissiveIntensity: 1.5, roughness: .4 });
    const interior = new THREE.MeshStandardMaterial({ color: C('#15181e'), metalness: .15, roughness: .8 });
    const orange = new THREE.MeshStandardMaterial({ color: C('#e8641a'), metalness: .4, roughness: .45 });
    const seat = new THREE.MeshStandardMaterial({ color: C('#1d2129'), metalness: .1, roughness: .75 });
    return { paint, glass, chrome, dark, trim, tire, rim, rimDark, disc, caliper, tail, head, amber, interior, seat, orange };
  }

function buildWheel(THREE, M, spec, side, opts) {
    const g = new THREE.Group();
    const R = spec.radius, W = spec.width;
    const tirePts = [
      new THREE.Vector2(R * .68, -W / 2),
      new THREE.Vector2(R * .93, -W / 2),
      new THREE.Vector2(R, -W * .3),
      new THREE.Vector2(R, W * .3),
      new THREE.Vector2(R * .93, W / 2),
      new THREE.Vector2(R * .68, W / 2)
    ];
    const tire = new THREE.Mesh(new THREE.LatheGeometry(tirePts, 30), M.tire);
    tire.rotation.z = Math.PI / 2; tire.castShadow = true;
    g.add(tire);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(R * .68, R * .68, W * .96, 24, 1, true), M.rimDark);
    barrel.rotation.z = Math.PI / 2; g.add(barrel);
    const face = new THREE.Mesh(new THREE.CylinderGeometry(R * .66, R * .66, W * .06, 24), M.rimDark);
    face.rotation.z = Math.PI / 2; face.position.x = side * W * .44; g.add(face);
    const nSpokes = spec.spokes || 5;
    for (let i = 0; i < nSpokes; i++) {
      const a = i / nSpokes * Math.PI * 2;
      const len = R * .42;
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(W * .17, len, R * .12), M.rim);
      const midR = R * .36;
      spoke.position.set(side * W * .45, Math.sin(a) * midR, Math.cos(a) * midR);
      spoke.rotation.x = -a;
      g.add(spoke);
    }
    const lip = new THREE.Mesh(new THREE.TorusGeometry(R * .64, W * .05, 8, 28), M.rim);
    lip.rotation.y = Math.PI / 2; lip.position.x = side * W * .45; g.add(lip);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(R * .17, R * .17, W * .22, 16), M.chrome);
    hub.rotation.z = Math.PI / 2; hub.position.x = side * W * .48; g.add(hub);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(R * .56, R * .56, W * .07, 22), M.disc);
    disc.rotation.z = Math.PI / 2; g.add(disc);
    if (opts && opts.details !== false) {
      const caliper = new THREE.Mesh(new THREE.BoxGeometry(W * .26, R * .5, R * .18), M.caliper);
      caliper.position.set(-side * W * .08, R * .3, R * .18); caliper.rotation.y = .4;
      g.add(caliper);
    }
    return g;
  }

const CARS = {
    sport: {
      name: 'Sport Coupe', paint: '#c8102e', finish: 'metallic',
      len: 4.4, wid: .86, widR: .92, wheelbase: 2.6, baseY: .16, archY: .74, archW: .32,
      noseY: .46, hoodY: .70, hoodT: .32, hoodF: 1.05, cowlT: .48, beltY: .92, deckT: .76, deckY: .88, tailY: .82,
      cabin: [-.55, .45], cabinW: .80, roofY: 1.24,
      sillW: .90, shoulderW: 1.06, deckW: .97, creaseY: .08,
      deckLine: [[-2.2, .46, .86], [-1.3, .72, 1.0], [-.55, .90, 1.0], [.45, .92, 1.02], [1.3, .86, .95], [2.2, .82, .86]],
      wheel: { radius: .345, width: .26, spokes: 5, track: .83, y: .345 },
      signature: 'twin', wing: 'duck', exhaust: 'dual'
    },
    hatch: {
      name: '90s Hatch', paint: '#e8e2d4', finish: 'pearl',
      len: 3.9, wid: .78, widR: .78, wheelbase: 2.4, baseY: .19, archY: .68, archW: .28,
      noseY: .52, hoodY: .78, hoodT: .28, hoodF: .9, cowlT: .42, beltY: .96, deckT: .82, deckY: .95, tailY: .92,
      cabin: [-.82, .95], cabinW: .86, roofY: 1.42,
      sillW: .94, shoulderW: 1.02, deckW: .96, creaseY: .05,
      deckLine: [[-1.95, .52, .9], [-1.2, .76, 1.0], [-.5, .90, 1.0], [.6, .93, 1.0], [1.3, .93, .97], [1.95, .88, .88]],
      wheel: { radius: .30, width: .20, spokes: 6, track: .73, y: .30 },
      signature: 'dual', wing: 'none', exhaust: 'single', hatch: true
    },
    muscle: {
      name: 'Muscle V8', paint: '#1f4fd8', finish: 'metallic',
      len: 4.9, wid: .93, widR: .95, wheelbase: 2.95, baseY: .21, archY: .77, archW: .36,
      noseY: .56, hoodY: .80, hoodT: .40, hoodF: 1.25, cowlT: .58, beltY: .92, deckT: .80, deckY: .88, tailY: .84,
      cabin: [-.55, 1.00], cabinW: .82, roofY: 1.38,
      sillW: .92, shoulderW: 1.05, deckW: .98, creaseY: .07,
      deckLine: [[-2.45, .56, .86], [-1.5, .78, 1.0], [-.5, .90, 1.0], [.4, .90, 1.03], [1.3, .88, 1.0], [2.45, .82, .9]],
      wheel: { radius: .35, width: .27, spokes: 5, track: .86, y: .35 },
      signature: 'twinbar', wing: 'duck', exhaust: 'quad', vents: true
    },
    wedge: {
      name: 'Wedge GT', paint: '#c2182b', finish: 'metallic',
      len: 4.45, wid: .90, widR: .94, wheelbase: 2.6, baseY: .16, archY: .72, archW: .32,
      noseY: .38, hoodY: .60, hoodT: .42, hoodF: 1.15, cowlT: .60, beltY: .80, deckT: .82, deckY: .82, tailY: .78,
      cabin: [-.6, .68], cabinW: .86, roofY: 1.10,
      sillW: .88, shoulderW: 1.0, deckW: 1.0, creaseY: .04,
      deckLine: [[-2.2, .38, .84], [-1.3, .56, .98], [-.5, .80, 1.0], [.5, .82, 1.0], [1.5, .82, .96], [2.2, .78, .88]],
      wheel: { radius: .33, width: .26, spokes: 5, track: .83, y: .33 },
      signature: 'bar', wing: 'lip', exhaust: 'dual', popups: true
    },
    rally: {
      name: 'Rally Turbo', paint: '#e2001a', finish: 'gloss',
      len: 4.15, wid: .84, widR: .86, wheelbase: 2.5, baseY: .26, archY: .76, archW: .33,
      noseY: .54, hoodY: .80, hoodT: .30, hoodF: .95, cowlT: .46, beltY: .96, deckT: .80, deckY: .94, tailY: .90,
      cabin: [-.78, .80], cabinW: .84, roofY: 1.38,
      sillW: .98, shoulderW: 1.0, deckW: .95, creaseY: .05,
      deckLine: [[-2.1, .54, .92], [-1.25, .76, 1.0], [-.5, .90, 1.0], [.5, .92, 1.0], [1.3, .90, .96], [2.1, .86, .9]],
      wheel: { radius: .34, width: .23, spokes: 8, track: .78, y: .34 },
      signature: 'quad', wing: 'gt', exhaust: 'single', mud: true
    },
    supercar: {
      name: 'Apex GT', paint: '#ffd23f', finish: 'pearl',
      len: 4.6, wid: .94, widR: .96, wheelbase: 2.72, baseY: .17, archY: .77, archW: .36,
      noseY: .50, hoodY: .66, hoodT: .42, hoodF: 1.2, cowlT: .60, beltY: .84, deckT: .78, deckY: .86, tailY: .80,
      cabin: [-.95, .85], cabinW: .86, roofY: 1.20,
      sillW: .90, shoulderW: 1.04, deckW: .98, creaseY: .07,
      deckLine: [[-2.30, .50, .85], [-1.36, .86, 1.02], [-.65, .86, .98], [.65, .88, 1.0], [1.36, .90, 1.03], [2.30, .82, .92]],
      wheel: { radius: .35, width: .30, spokes: 5, track: .85, y: .35 },
      signature: 'quad', wing: 'duck', exhaust: 'quad', vents: true, splitter: true
    },
    ev: {
      name: 'Volt Sedan EV', paint: '#2fbf8f', finish: 'pearl',
      len: 4.95, wid: .90, widR: .90, wheelbase: 2.95, baseY: .21, archY: .75, archW: .33,
      noseY: .54, hoodY: .78, hoodT: .26, hoodF: .95, cowlT: .40, beltY: .98, deckT: .76, deckY: .97, tailY: .94,
      cabin: [-1.3, 1.35], cabinW: .88, roofY: 1.44,
      sillW: .95, shoulderW: 1.0, deckW: .97, creaseY: .04,
      deckLine: [[-2.47, .54, .9], [-1.5, .74, 1.0], [-.4, .94, 1.0], [.8, .96, 1.0], [1.8, .93, .95], [2.47, .86, .85]],
      wheel: { radius: .34, width: .21, spokes: 6, track: .80, y: .34 },
      signature: 'racetrack', wing: 'none', exhaust: 'none', lightBar: true
    },
    hyper: {
      name: 'Hyper X', paint: '#6d28d9', finish: 'metallic',
      len: 4.75, wid: .98, widR: 1.0, wheelbase: 2.82, baseY: .14, archY: .78, archW: .38,
      noseY: .42, hoodY: .58, hoodT: .44, hoodF: 1.25, cowlT: .62, beltY: .78, deckT: .81, deckY: .84, tailY: .78,
      cabin: [-1.05, .75], cabinW: .88, roofY: 1.16,
      sillW: .88, shoulderW: 1.06, deckW: 1.0, creaseY: .08,
      deckLine: [[-2.38, .42, .86], [-1.4, .72, 1.04], [-.6, .84, 1.0], [.6, .86, 1.0], [1.4, .88, 1.04], [2.38, .80, .94]],
      wheel: { radius: .36, width: .33, spokes: 5, track: .90, y: .36 },
      signature: 'barfin', wing: 'gt', exhaust: 'quad', vents: true, splitter: true
    },
    pickup: {
      name: 'Work Pickup', paint: '#8f4a2f', finish: 'gloss',
      len: 5.1, wid: .86, widR: .90, wheelbase: 3.1, baseY: .26, archY: .82, archW: .34,
      noseY: .60, hoodY: .86, hoodT: .22, hoodF: .9, cowlT: .34, beltY: 1.02, deckT: .88, deckY: 1.02, tailY: .98,
      cabin: [-1.35, -.3], cabinW: .90, roofY: 1.56,
      sillW: 1.0, shoulderW: 1.0, deckW: 1.0, creaseY: .03,
      deckLine: [[-2.55, .60, .9], [-1.6, .88, 1.0], [-.6, 1.0, 1.0], [.4, 1.02, 1.0], [1.6, 1.02, 1.0], [2.55, .94, .9]],
      wheel: { radius: .37, width: .23, spokes: 5, track: .80, y: .37 },
      signature: 'dual', wing: 'none', exhaust: 'single', bed: true
    },
    vanP: {
      name: 'Panel Van', paint: '#d8d2c4', finish: 'gloss',
      len: 4.6, wid: .92, widR: .94, wheelbase: 2.7, baseY: .22, archY: .70, archW: .30,
      noseY: .56, hoodY: .80, hoodT: .14, hoodF: .5, cowlT: .20, beltY: 1.08, deckT: .9, deckY: 1.08, tailY: 1.06,
      cabin: [-.9, 1.3], cabinW: .92, roofY: 1.78,
      sillW: 1.0, shoulderW: 1.0, deckW: 1.0, creaseY: .0,
      deckLine: [[-2.3, .56, .9], [-1.4, .9, 1.0], [-.4, 1.06, 1.0], [.6, 1.08, 1.0], [1.6, 1.08, 1.0], [2.3, 1.06, .95]],
      wheel: { radius: .32, width: .21, spokes: 5, track: .84, y: .32 },
      signature: 'round', wing: 'none', exhaust: 'single', boxy: true
    },
    roadster: {
      name: 'Classic Roadster', paint: '#1e6f5c', finish: 'gloss',
      len: 4.1, wid: .80, widR: .82, wheelbase: 2.35, baseY: .17, archY: .68, archW: .30,
      noseY: .48, hoodY: .68, hoodT: .48, hoodF: 1.3, cowlT: .66, beltY: .78, deckT: .82, deckY: .80, tailY: .76,
      cabin: [-.25, .55], cabinW: .78, roofY: 1.08,
      sillW: .92, shoulderW: .98, deckW: .98, creaseY: .03,
      deckLine: [[-2.05, .48, .9], [-1.2, .64, 1.0], [-.3, .76, 1.0], [.4, .80, 1.0], [1.2, .78, .9], [2.05, .74, .8]],
      wheel: { radius: .31, width: .19, spokes: 12, track: .72, y: .31 },
      signature: 'round', wing: 'none', exhaust: 'dual', openTop: true, chromeBumper: true
    },
    hothatch: {
      name: 'Hot Hatch', paint: '#f45b1e', finish: 'gloss',
      len: 4.1, wid: .84, widR: .86, wheelbase: 2.5, baseY: .17, archY: .70, archW: .30,
      noseY: .44, hoodY: .72, hoodT: .30, hoodF: 1.0, cowlT: .44, beltY: .96, deckT: .80, deckY: .94, tailY: .90,
      cabin: [-.75, .88], cabinW: .86, roofY: 1.38,
      sillW: .90, shoulderW: 1.08, deckW: 1.0, creaseY: .06,
      deckLine: [[-2.05, .44, .9], [-1.2, .70, 1.0], [-.4, .92, 1.0], [.6, .94, 1.02], [1.3, .92, .98], [2.05, .86, .88]],
      wheel: { radius: .33, width: .25, spokes: 5, track: .82, y: .33 },
      signature: 'dual', wing: 'lip', exhaust: 'dual', splitter: true
    }
  }

export { bodyGeometry, canopyGeometry, materials, buildWheel, buildStations, ringShaped, loftGeometry, CARS }
