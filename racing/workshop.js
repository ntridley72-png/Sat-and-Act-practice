(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const paints = () => (typeof CAR_PAINTS !== "undefined" ? CAR_PAINTS : { teal: "#07869a" });
  const launch = ["sport", "hatch", "coupe90", "muscle", "rotary", "rally", "track", "straight", "hyper", "ev"];
  let tab = "cars", raf = 0, angle = -.25, panelOpen = false;
  const stillPreferred = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) { return false; } };

  function garage() { return window.DriftCircuit && window.DriftCircuit.garage(); }
  function save() { try { saveProfile(); } catch (_) {} }
  function carDef(id) {
    // The CARS map is keyed by id but the records carry no id of their own, so
    // restore it before anything reads def.id (the per-car VARIANTS lookup).
    const def = (window.DriftCircuit && window.DriftCircuit.CARS[id]) || { name: "Horizon Coupe", shape: { style: "coupe", len: 40, wid: 20 } };
    if (!def.id) def.id = id;
    return def;
  }
  function colorFor(g) { const m = paints(); return m[g.paint] || (String(g.paint || "").startsWith("#") ? g.paint : m.teal); }

  const PROFILES = {
    coupe:  { nose:.55, tail:-.54, belt:-.28, hood:.38, roofL:-.18, roofR:.23, roof:-1.18, wheelF:.33, wheelR:-.32, body:.98 },
    hatch:  { nose:.50, tail:-.50, belt:-.18, hood:.34, roofL:-.34, roofR:.18, roof:-1.16, wheelF:.31, wheelR:-.31, body:1.04 },
    muscle: { nose:.57, tail:-.55, belt:-.22, hood:.43, roofL:-.16, roofR:.18, roof:-1.02, wheelF:.35, wheelR:-.34, body:1.13 },
    sedan:  { nose:.53, tail:-.53, belt:-.25, hood:.34, roofL:-.25, roofR:.22, roof:-1.22, wheelF:.34, wheelR:-.33, body:1.08 },
    super:  { nose:.59, tail:-.56, belt:-.16, hood:.42, roofL:-.12, roofR:.18, roof:-.82, wheelF:.36, wheelR:-.34, body:.86 },
    ev:     { nose:.54, tail:-.53, belt:-.20, hood:.31, roofL:-.28, roofR:.25, roof:-1.30, wheelF:.35, wheelR:-.34, body:1.08 },
    boxy:   { nose:.47, tail:-.47, belt:-.10, hood:.30, roofL:-.42, roofR:.42, roof:-1.34, wheelF:.29, wheelR:-.29, body:1.14 },
    wedge:  { nose:.63, tail:-.50, belt:-.22, hood:.28, roofL:-.24, roofR:.10, roof:-.84, wheelF:.35, wheelR:-.34, body:.88 },
    curve:  { nose:.54, tail:-.52, belt:-.30, hood:.37, roofL:-.16, roofR:.21, roof:-1.20, wheelF:.33, wheelR:-.32, body:1.00 }
  };
  const VARIANTS = {
    sport:   { hood:.36, roofL:-.18, roofR:.22, roof:-1.14 },
    coupe90: { hood:.42, roofL:-.12, roofR:.19, roof:-1.02, nose:.58 },
    rotary:  { hood:.34, roofL:-.22, roofR:.17, roof:-1.28, nose:.52, body:.91 },
    straight:{ hood:.46, roofL:-.08, roofR:.18, roof:-1.04, nose:.60, tail:-.57, body:1.04 },
    track:   { hood:.47, roofL:-.08, roofR:.14, roof:-.72, body:.80 },
    hyper:   { hood:.49, roofL:-.04, roofR:.12, roof:-.66, nose:.61, body:.76 }
  };

  function drawCar(canvas, def, color, a, custom) {
    const dpr = Math.min(devicePixelRatio || 1, 2), w = Math.max(80, canvas.clientWidth), h = Math.max(45, canvas.clientHeight);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const c = canvas.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
    const hero = canvas.classList.contains("workshop-canvas"), scale = Math.min(w / (hero ? 620 : 150), h / (hero ? 330 : 72));
    const cx = w * .5, style = def.body || (def.shape && def.shape.style) || "coupe", p = Object.assign({}, PROFILES[style] || PROFILES.coupe, VARIANTS[def.id] || {});
    const kit = hero && custom ? custom.kit : "stock", stance = kit === "wide" ? 1.13 : kit === "street" ? 1.06 : 1;
    const wheelScale = hero && custom ? Math.max(.8, Math.min(1.3, Number(custom.wheelSize) || 1)) : 1;
    const cy = h * (hero ? .58 : .6) + (wheelScale - 1) * 8 * scale;
    // The style profile sets the family; the record's own length and roof
    // height keep same-family cars from rendering as identical twins.
    const shape = def.shape || {};
    const shapeLen = shape.len ? Math.max(.82, Math.min(1.16, shape.len / 41)) : 1;
    const shapeRoof = shape.roofH ? Math.max(.86, Math.min(1.14, shape.roofH / .9)) : 1;
    const len = (hero ? 270 : 86) * scale * (style === "muscle" ? 1.07 : style === "hatch" ? .91 : style === "super" ? 1.04 : 1) * shapeLen;
    const bodyH = (hero ? 64 : 24) * scale * p.body * shapeRoof;
    c.save(); c.translate(cx, cy); c.transform(1, 0, Math.sin(a || 0) * .2, 1, 0, 0);
    c.fillStyle = "rgba(0,0,0,.32)"; c.beginPath(); c.ellipse(0, bodyH * .62, len * .55, bodyH * .31, 0, 0, Math.PI * 2); c.fill();
    const finish = hero && custom ? custom.finish : "gloss", grad = c.createLinearGradient(0, -bodyH, 0, bodyH);
    if (finish === "matte") { grad.addColorStop(0, lighten(color, 8)); grad.addColorStop(1, shade(color, 22)); }
    else if (finish === "chrome") { grad.addColorStop(0,"#f4fbff");grad.addColorStop(.22,color);grad.addColorStop(.5,"#d8e4e9");grad.addColorStop(.72,shade(color,22));grad.addColorStop(1,"#111a1e"); }
    else { grad.addColorStop(0, lighten(color, finish === "pearl" ? 58 : 34)); grad.addColorStop(.48, color); grad.addColorStop(1, shade(color, 38)); }
    c.fillStyle = grad;
    polygon(c, [[len*p.tail,bodyH*.25],[-len*.48,-bodyH*.28],[-len*.24,-bodyH*.43],[len*p.hood,-bodyH*(style==="muscle"?.48:.34)],[len*p.nose,-bodyH*.02],[len*.5,bodyH*.38],[-len*.5,bodyH*.4]]); c.fill();
    c.fillStyle = shade(color, 8); polygon(c, [[len*p.roofL,-bodyH*.39],[len*(p.roofL+.15),bodyH*p.roof],[len*p.roofR,bodyH*(p.roof+.06)],[len*(p.roofR+.13),-bodyH*.35]]); c.fill();
    c.fillStyle = "#102a36"; polygon(c, [[len*(p.roofL+.05),-bodyH*.44],[len*(p.roofL+.18),bodyH*(p.roof+.13)],[len*(p.roofR-.04),bodyH*(p.roof+.17)],[len*(p.roofR+.07),-bodyH*.4]]); c.fill();
    c.strokeStyle = "rgba(255,255,255,.32)"; c.lineWidth = Math.max(1,scale*1.2); c.beginPath(); c.moveTo(len*(p.roofL+.2),bodyH*(p.roof+.12)); c.lineTo(len*(p.roofL+.2),-bodyH*.42); c.stroke();
    const wheelR = bodyH*.48*wheelScale;
    for (const x of [len*p.wheelR, len*p.wheelF]) wheel(c, x, bodyH*.35, wheelR, scale, hero&&custom?custom.wheels:def.wheelStyle, hero&&custom?custom.wheelColor:null);
    c.fillStyle = "#dffbff"; c.fillRect(len*.43,-bodyH*.22,len*.09,bodyH*.13); c.fillStyle="#ff554d"; c.fillRect(-len*.51,-bodyH*.18,len*.08,bodyH*.16);
    c.fillStyle="#061117"; c.fillRect(len*.31,bodyH*.13,len*.2,bodyH*.11); c.strokeStyle="rgba(255,255,255,.2)"; c.stroke();
    /* Strong family identifiers must survive the tiny collection-card preview. */
    if (style === "hatch") { c.fillStyle=shade(color,18);polygon(c,[[-len*.50,-bodyH*.28],[-len*.34,-bodyH*1.08],[-len*.28,-bodyH*.42],[-len*.48,-bodyH*.25]]);c.fill(); }
    if (style === "muscle") { c.fillStyle="#10181c";c.fillRect(len*.05,-bodyH*.55,len*.17,Math.max(3,bodyH*.10));c.fillRect(len*.45,-bodyH*.05,len*.12,bodyH*.23); }
    if (style === "sedan") { c.strokeStyle="rgba(8,18,23,.65)";c.lineWidth=Math.max(1,scale);for(const q of [-.08,.18]){c.beginPath();c.moveTo(len*q,-bodyH*.38);c.lineTo(len*q,bodyH*.28);c.stroke();} }
    if (style === "super") { c.fillStyle="#071015";polygon(c,[[len*.04,-bodyH*.05],[len*.28,-bodyH*.12],[len*.19,bodyH*.25],[-len*.01,bodyH*.22]]);c.fill(); }
    if (style === "ev") { c.fillStyle="rgba(116,197,220,.32)";polygon(c,[[-len*.25,-bodyH*.48],[-len*.12,-bodyH*1.18],[len*.21,-bodyH*1.16],[len*.35,-bodyH*.42]]);c.fill(); }
    if (def.id === "coupe90") { c.fillStyle="#dffbff";c.fillRect(len*.31,-bodyH*.46,len*.055,bodyH*.12);c.fillRect(len*.40,-bodyH*.43,len*.055,bodyH*.12); }
    if (def.id === "rotary") { c.strokeStyle=lighten(color,36);c.lineWidth=Math.max(1.5,scale*1.5);c.beginPath();c.moveTo(-len*.47,-bodyH*.18);c.quadraticCurveTo(0,-bodyH*.50,len*.50,-bodyH*.20);c.stroke(); }
    if (def.id === "straight") { c.fillStyle="#0a1216";c.fillRect(-len*.54,bodyH*.18,len*.25,bodyH*.12); }
    if (hero && custom) {
      if (kit !== "stock") { c.strokeStyle=lighten(color,28);c.lineWidth=Math.max(2,scale*(kit==="wide"?5:3));c.beginPath();c.moveTo(-len*.5,bodyH*.33);c.lineTo(len*.5,bodyH*.31);c.stroke(); }
      if (custom.bumper === "sport" || custom.bumper === "race") { c.fillStyle="#071015";polygon(c,[[len*.42,bodyH*.26],[len*(custom.bumper==="race"?.60:.55),bodyH*.31],[len*.53,bodyH*.47],[len*.34,bodyH*.43]]);c.fill(); }
      if (custom.hood === "carbon") { c.fillStyle="#11181c";polygon(c,[[len*.12,-bodyH*.43],[len*.39,-bodyH*.35],[len*.31,-bodyH*.13],[len*.08,-bodyH*.2]]);c.fill(); }
      if (custom.hood === "vented") { c.strokeStyle="#081217";c.lineWidth=Math.max(2,scale*2);for(let i=0;i<3;i++){c.beginPath();c.moveTo(len*(.18+i*.045),-bodyH*.34);c.lineTo(len*(.23+i*.045),-bodyH*.27);c.stroke();} }
      const wing = custom.spoiler;
      if (wing && wing !== "none") { const tall=wing==="gt", duck=wing==="duck";c.strokeStyle="#172126";c.lineWidth=Math.max(2,scale*2);c.beginPath();c.moveTo(-len*.42,-bodyH*.22);c.lineTo(-len*.42,-bodyH*(tall?.78:.5));c.stroke();c.fillStyle=shade(color,25);c.fillRect(-len*(tall?.53:.47),-bodyH*(tall?.82:.54),len*(tall?.26:.18),Math.max(3,scale*(duck?3:5))); }
      c.strokeStyle="rgba(91,225,236,.32)"; c.lineWidth=2; c.beginPath(); c.moveTo(-len*.48,bodyH*.08); c.lineTo(len*.48,bodyH*.03); c.stroke();
    }
    c.restore();
  }
  function polygon(c, pts) { c.beginPath(); pts.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1])); c.closePath(); }
  function wheel(c,x,y,r,s,style,color){ c.fillStyle="#070b0e";c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();c.fillStyle=color||"#9aa7ab";c.beginPath();c.arc(x,y,r*.62,0,Math.PI*2);c.fill();c.strokeStyle="#273138";c.lineWidth=Math.max(1.5,s*(style==="steel"?3:1.7));const spokes=style==="mesh"?10:style==="deep"?6:5;for(let i=0;i<spokes;i++){let a=i*Math.PI*2/spokes;c.beginPath();c.moveTo(x,y);c.lineTo(x+Math.cos(a)*r*.55,y+Math.sin(a)*r*.55);c.stroke()}c.fillStyle="#172027";c.beginPath();c.arc(x,y,r*(style==="deep"?.28:.18),0,Math.PI*2);c.fill()}
  function rgb(hex){const n=parseInt(String(hex).replace("#",""),16)||0;return[(n>>16)&255,(n>>8)&255,n&255]}
  function shade(hex,n){const v=rgb(hex);return`rgb(${Math.max(0,v[0]-n)},${Math.max(0,v[1]-n)},${Math.max(0,v[2]-n)})`}
  function lighten(hex,n){const v=rgb(hex);return`rgb(${Math.min(255,v[0]+n)},${Math.min(255,v[1]+n)},${Math.min(255,v[2]+n)})`}

  function carCards(g) {
    return launch.map((id) => { const d = carDef(id), owned = (g.unlocked || []).includes(id), drift = g.car === id, race = g.raceCar === id;
      const state = drift && race ? "DRIFT+RACE" : drift ? "DRIFT" : race ? "RACE" : owned ? "OWNED" : "LOCKED";
      const actions = owned
        ? `<span class="workshop-mini"><button data-car="${id}" class="${drift?"on":""}" aria-pressed="${drift}">Drift</button><button data-racecar="${id}" class="${race?"on":""}" aria-pressed="${race}">Race</button></span>`
        : `<span class="workshop-mini"><button data-buy="${id}" ${Number(g.cash||0) < Number(d.price||0) ? "disabled" : ""}>Unlock $${Number(d.price||0).toLocaleString()}</button></span>`;
      return `<div class="workshop-car dg-car ${drift||race?"on":""} ${owned?"":"locked"}"><span class="workshop-state ${owned?"":"lock"}">${state}</span><canvas data-preview="${id}"></canvas><strong>${d.name}</strong><small>${d.era||"Modern"} · ${(d.shape&&d.shape.style)||"coupe"}</small>${actions}</div>`;
    }).join("");
  }
  function pills(map, attr, current, labelFor) {
    return Object.keys(map).map((k) => `<button class="workshop-chip ${current===k?"on":""}" data-${attr}="${k}" aria-pressed="${current===k}">${labelFor(k, map[k])}</button>`).join("");
  }
  function swatches(map, attr, current) {
    return Object.keys(map).map((k) => `<button data-${attr}="${k}" class="${current===k?"on":""}" style="background:${map[k]}" aria-label="${k}" aria-pressed="${current===k}"></button>`).join("");
  }
  function priced(map, ownedList, attr, current) {
    return Object.keys(map).map((k) => { const item = map[k], owned = (ownedList||[]).includes(k);
      return `<button class="workshop-chip ${current===k?"on":""}" data-${attr}="${k}" data-price="${owned?0:item.price||0}" aria-pressed="${current===k}">${item.name}${item.price && !owned ? " · $" + item.price : ""}</button>`;
    }).join("");
  }
  function settings(g) {
    if (tab === "scores") {
      const highs = (typeof profile !== "undefined" && profile.highScores) || {};
      return `<div class="workshop-section"><h3>Your best runs</h3><div class="workshop-score"><span>Drift score</span><b>${Number(highs.drift||0).toLocaleString()}</b></div><div class="workshop-score"><span>Race score</span><b>${Number(highs.racing||0).toLocaleString()}</b></div><p class="workshop-note">Scores are saved to your FunSAT profile. Choose a track, then open practice to improve either record.</p></div><div class="workshop-section"><h3>Ghost challenge</h3><p class="workshop-note">Your personal best is the target. Use the same fictional car and setup for a fair comparison.</p><div class="workshop-actions"><button data-mode="drift">Use drift car</button><button data-mode="racing">Use race car</button></div></div>`;
    }
    if (tab === "tune") return `<div class="workshop-section"><h3>Simple tuning</h3>${slider("power","Power",g.tune.power,.7,1.4,"More acceleration; excess power increases wheelspin.")}${slider("grip","Grip",g.tune.grip,.7,1.4,"More traction; extreme grip makes transitions harder.")}${slider("weight","Weight",g.tune.weight,.7,1.4,"Lighter reacts faster but becomes less settled.")}${slider("handbrake","Handbrake",g.tune.handbrake,.7,1.4,"Stronger rear breakaway for drift initiation.")}<div class="workshop-actions"><button data-reset>Reset safe setup</button><button class="primary" data-close>Done</button></div></div><div class="workshop-section"><h3>Feel and sound</h3><label class="workshop-slider"><span>Handling</span><input data-handling type="range" min="0" max="1" step=".05" value="${Number(g.handling)||0}" aria-label="Handling model"><b>${(Number(g.handling)||0)<.34?"Arcade":(Number(g.handling)||0)<.67?"Mixed":"Sim"}</b></label><p class="workshop-note">Arcade feels planted and forgiving; Sim adds weight transfer and snap-back.</p><label class="workshop-slider"><span>Engine vol</span><input data-volume type="range" min="0" max="1" step=".05" value="${Number(g.engineVolume)}" aria-label="Engine volume"><b>${Math.round(Number(g.engineVolume)*100)}%</b></label></div>`;
    if (tab === "custom") return `<div class="workshop-section"><h3>Paint</h3><div class="workshop-row workshop-swatches">${swatches(paints(),"paint",g.paint)}</div><div class="workshop-row" style="margin-top:8px">${pills(DriftCircuit.FINISHES,"finish",g.finish,(k,v)=>v)}</div></div><div class="workshop-section"><h3>Wheels and stance</h3><div class="workshop-row">${pills(DriftCircuit.WHEEL_STYLES,"wheels",g.wheels,(k,v)=>v)}</div><div class="workshop-row workshop-swatches" style="margin-top:8px">${swatches(DriftCircuit.WHEEL_COLORS,"wheelcolor",g.wheelColor)}</div>${slider("wheelSize","Wheel size",g.wheelSize,.8,1.3,"Larger wheels fill the arches; grip is unchanged.","wheelize")}</div><div class="workshop-section"><h3>Body</h3><div class="workshop-row">${priced(DriftCircuit.BODY_KITS,g.ownedKits,"kit",g.kit)}</div><div class="workshop-row" style="margin-top:8px">${["stock","vented","carbon"].map(k=>`<button class="workshop-chip ${g.hood===k?"on":""}" data-hood="${k}" aria-pressed="${g.hood===k}">${k} hood</button>`).join("")}</div><div class="workshop-row" style="margin-top:8px">${["stock","sport","race"].map(k=>`<button class="workshop-chip ${g.bumper===k?"on":""}" data-bumper="${k}" aria-pressed="${g.bumper===k}">${k} bumper</button>`).join("")}</div><div class="workshop-row" style="margin-top:8px">${priced(DriftCircuit.WINGS,g.ownedWings,"wing",g.spoiler)}</div></div><div class="workshop-section"><h3>Decals and number</h3><div class="workshop-row">${pills(DriftCircuit.DECALS,"decal",g.decal,(k,v)=>v)}</div><label class="workshop-slider" style="grid-template-columns:120px 80px"><span>Racing number</span><input id="dgNumber" type="number" min="0" max="99" step="1" value="${Number(g.number)||0}"></label></div><div class="workshop-section"><h3>Underglow</h3><div class="workshop-row workshop-swatches">${swatches({none:"#1e293b","#a855f7":"#a855f7","#22d3ee":"#22d3ee","#5ef0b0":"#5ef0b0","#f472b6":"#f472b6"},"neon",g.neon)}</div><div class="workshop-row" style="margin-top:8px">${["solid","pulse"].map(k=>`<button class="workshop-chip ${g.neonMode===k?"on":""}" data-neonmode="${k}" aria-pressed="${g.neonMode===k}">${k}</button>`).join("")}</div></div>`;
    if (tab === "tracks") return `<div class="workshop-section"><h3>Track preview</h3>${trackPreview(g.track, DriftCircuit.TRACKS[g.track] || DriftCircuit.TRACKS.oval, (typeof Scene3D !== "undefined" && Scene3D.THEMES[g.theme]) || null)}</div><div class="workshop-section"><h3>Track</h3><div class="workshop-row">${Object.entries(DriftCircuit.TRACKS).map(([k,v])=>`<button class="workshop-chip ${g.track===k?"on":""}" data-track="${k}" aria-pressed="${g.track===k}">${v.name}</button>`).join("")}</div></div><div class="workshop-section"><h3>Racing mode</h3><div class="workshop-row">${[["traffic","Traffic dodge"],["circuit","Circuit race"]].map(([k,n])=>`<button class="workshop-chip ${g.raceMode===k?"on":""}" data-racemode="${k}" aria-pressed="${g.raceMode===k}">${n}</button>`).join("")}</div></div><div class="workshop-section"><h3>Camera</h3><div class="workshop-row">${["chase","far","hood"].map(k=>`<button class="workshop-chip ${g.cam===k?"on":""}" data-cam="${k}" aria-pressed="${g.cam===k}">${k==="hood"?"cockpit":k}</button>`).join("")}</div><p class="workshop-note">Press C while driving to cycle cameras.</p></div><div class="workshop-section"><h3>Time and place</h3><div class="workshop-row">${Object.entries(Scene3D.THEMES).map(([k,v])=>`<button class="workshop-chip ${g.theme===k?"on":""}" data-theme="${k}" aria-pressed="${g.theme===k}">${v.name}</button>`).join("")}</div><p class="workshop-note">Lighting and scenery only in this release; grip is the same in every setting. The road stays open above the camera with no solid overhead slab.</p></div>`;
    return `<div class="workshop-section"><h3>Garage cash</h3><div class="workshop-row"><button class="workshop-chip" id="dgConvert" ${profile.tokens<1?"disabled":""}>1 token → $250</button><button class="workshop-chip" id="dgConvertAll" ${profile.tokens<1?"disabled":""}>Convert all (${profile.tokens})</button></div><p class="workshop-note">Tokens: ${profile.tokens} · Cash: $${Number(g.cash||0).toLocaleString()}. Drift and racing also pay cash directly.</p></div><div class="workshop-section"><h3>Ten-car collection</h3><div class="workshop-cars">${carCards(g)}</div></div>`;
  }
  // Performance bars resolve the SAME figures the simulation consumes: base
  // values come from the shared racing stack (racing/data/cars.js) when it is
  // loaded, torque is read through the physics module's own torqueAt, and the
  // garage tune scales them exactly as vehicle-physics.js does. The handling
  // model factor mirrors DriftCircuit's drift dynamics (slide yaw gain and
  // slide alignment). Cosmetic parts never enter this function, so paint,
  // wheels, decals and neon cannot move the bars.
  // The ship-default setup (matches DriftCircuit.garage()), so a freshly opened
  // garage sits inside the rails and only an extreme tune pins a bar.
  const BASELINE_TUNE = { power: .7, grip: 1.35, weight: 1.2, handbrake: 1 };
  function racingCar(id) {
    const C = window.Racing && window.Racing.Cars && window.Racing.Cars.CARS;
    return C ? C[id] : null;
  }
  function peakTorque(car) {
    const P = window.Racing && window.Racing.Physics;
    if (!P || typeof P.torqueAt !== "function") return 0;
    let best = 0;
    const lo = Math.max(500, Number(car.idleRpm) || 800);
    const hi = Math.max(lo + 500, Number(car.redline) || 7000);
    for (let rpm = lo; rpm <= hi; rpm += 250) { const t = P.torqueAt(car, rpm); if (t > best) best = t; }
    return best;
  }
  function resolved(id, tune, handling) {
    const t = tune || {}, h = Math.max(0, Math.min(1, Number(handling) || 0));
    const car = racingCar(id);
    if (car) {
      const mass = Number(car.mass) * (t.weight || 1);
      return {
        speed: (peakTorque(car) || 1) * (t.power || 1) / mass,
        grip: ((Number(car.gripFront) + Number(car.gripRear)) / 2) * (t.grip || 1),
        weight: mass,
        // Rear grip released by the handbrake, spread by how willingly the car
        // rotates (driftStability), then the sim's slide-yaw gain for the
        // current handling model: 0.4 + handling * 0.9.
        drift: (Number(car.handbrakeRelease) || .7) * ((Number(car.driftStability) || 5) / 5) * (t.handbrake || 1) * (0.4 + h * 0.9)
      };
    }
    const d = carDef(id);
    return {
      speed: (Number(d.power) || 1) * (t.power || 1),
      grip: (Number(d.grip) || 1) * (t.grip || 1),
      weight: (Number(d.weight) || 1) * (t.weight || 1),
      drift: (Number(d.hb) || 1) * (t.handbrake || 1) * (0.4 + h * 0.9)
    };
  }
  // Bars rank against the fleet at the ship-default setup, so moving a tuning
  // slider visibly moves a bar instead of rescaling the whole scale around it.
  let baseline = null;
  function spans() {
    if (baseline) return baseline;
    const C = (window.Racing && window.Racing.Cars && window.Racing.Cars.CARS) || {};
    const fleet = Object.keys(C).length ? Object.keys(C) : launch;
    const seen = {};
    fleet.forEach((id) => { const r = resolved(id, BASELINE_TUNE, 0); Object.keys(r).forEach((k) => { (seen[k] = seen[k] || []).push(r[k]); }); });
    baseline = {};
    Object.keys(seen).forEach((k) => { baseline[k] = [Math.min.apply(null, seen[k]), Math.max.apply(null, seen[k])]; });
    return baseline;
  }
  function rating(v, key, invert) {
    const band = spans()[key] || [0, 1], lo = band[0], hi = band[1];
    let t = ((Number(v) || 0) - lo) / ((hi - lo) || 1);
    if (invert) t = 1 - t;
    return Math.max(.5, Math.min(10, .5 + t * 9.5));
  }
  function stats(g) {
    const h = Math.max(0, Math.min(1, Number(g.handling) || 0));
    const r = resolved(g.car, g.tune, h);
    const grip = rating(r.grip, "grip"), light = rating(r.weight, "weight", true);
    // Arcade straightens quickly; Sim holds slides. Same alignment factor the
    // drift dynamics apply, normalised so neutral handling leaves it at 1.
    const align = (0.9 + (1 - h) * 1.6) / 2.5;
    return [
      ["Speed", rating(r.speed, "speed")],
      ["Grip", grip],
      ["Drift", rating(r.drift, "drift")],
      ["Handling", Math.max(.5, Math.min(10, ((grip + light) / 2) * align))]
    ];
  }
  function bars(g) {
    return stats(g).map(([label, v]) => `<span>${label}</span><i role="meter" aria-label="${label}" aria-valuemin="0.5" aria-valuemax="10" aria-valuenow="${v.toFixed(1)}" style="--v:${Math.round(v * 10)}%"></i><b>${v.toFixed(1)}</b>`).join("");
  }
  function refreshBars(host, g) { const box = $(".workshop-bars", host); if (box) box.innerHTML = bars(g); }

  // Track preview: the same control points the circuit builder uses, sampled
  // with the same closed Catmull-Rom curve and drawn as a small map. It is a
  // layout reference, not a start line: clicking a chip only selects the track.
  function trackPreview(key, def, theme) {
    const pts = (def.points || []).map(([x, y]) => [22 + x * 256, 18 + y * 124]);
    const n = pts.length, out = [];
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      for (let t = 0; t < 1; t += 1 / 12) {
        const t2 = t * t, t3 = t2 * t;
        out.push([
          0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
        ]);
      }
    }
    const path = "M" + out.map(([x, y]) => x.toFixed(1) + " " + y.toFixed(1)).join(" L") + " Z";
    const open = !!def.sandbox;
    // Start arrow at the first sample, pointing the way the lap runs, so the
    // preview shows direction without pretending to be a start line.
    const head = out[0], next = out[Math.min(2, out.length - 1)];
    const deg = (Math.atan2(next[1] - head[1], next[0] - head[0]) * 180 / Math.PI).toFixed(1);
    const style = theme ? ` style="--tm-road:${theme.prop};--tm-accent:${theme.accent};--tm-arrow:${theme.curb}"` : "";
    return `<figure class="workshop-trackmap" data-trackmap="${key}" data-track-name="${def.name || key}"${style}>` +
      `<svg viewBox="0 0 300 160" role="img" aria-label="Layout preview of ${def.name || key}">` +
      `<path class="tm-road${open ? " tm-open" : ""}" d="${path}"${open ? ' stroke-dasharray="8 6"' : ""}></path>` +
      `<path class="tm-line" d="${path}"></path>` +
      `<path class="tm-arrow" d="M 0 -7 L 13 0 L 0 7 Z" transform="translate(${head[0].toFixed(1)} ${head[1].toFixed(1)}) rotate(${deg})"></path></svg>` +
      `<figcaption><b>${def.name || key}</b><span>${open ? "Open lot · no laps" : "Circuit"} · road width ${def.width || "—"}${theme && theme.name ? " · " + theme.name : ""}</span></figcaption>` +
      `<p class="workshop-note">Preview only. Drive it with Open Practice or a Scored Run.</p></figure>`;
  }
  function slider(key,label,val,min,max,note,attr){return `<label class="workshop-slider"><span>${label}</span><input data-${attr||"tune"}="${key}" type="range" min="${min}" max="${max}" step=".05" value="${Number(val)}" aria-label="${label}"><b>${Number(val).toFixed(2)}</b></label><p class="workshop-note">${note}</p>`}

  function render() {
    const host = $("#dgBody"), g = garage(); if (!host || !g) return;
    if (!g.paint || !(g.paint in paints())) g.paint = "teal";
    $("#dgCash").textContent = `$${Number(g.cash||0).toLocaleString()}`;
    host.innerHTML = `<div class="workshop${panelOpen ? " panel-open" : ""}"><nav class="workshop-nav" aria-label="Workshop sections"><button data-tab="cars" data-short="Cars" class="${tab==="cars"?"on":""}">Garage</button><button class="play" data-play data-short="Drive">Open Practice<small>Free · not scored</small></button><button class="play scored" data-scored data-short="Run">Scored Run<small>1 token · 5 min</small></button><button data-tab="custom" data-short="Style" class="${tab==="custom"?"on":""}">Customize</button><button data-tab="tune" data-short="Tune" class="${tab==="tune"?"on":""}">Tuning</button><button data-tab="tracks" data-short="Tracks" class="${tab==="tracks"?"on":""}">Tracks & weather</button><button data-tab="scores" data-short="Scores" class="${tab==="scores"?"on":""}">Leaderboard</button></nav><section class="workshop-stage" aria-label="Rotatable car preview"><canvas class="workshop-canvas" aria-label="${carDef(g.car).name} preview"></canvas><div class="workshop-hero"><div><p>MY CAR</p><h2>${carDef(g.car).name}</h2><p>Fictional simcade car · ${carDef(g.car).era||"Modern"} · ${(g.unlocked||[]).includes(g.car)?"Owned":"Locked"}</p></div><div class="workshop-bars">${bars(g)}</div></div></section><aside class="workshop-panel"><div class="workshop-tabs"><button class="workshop-back" data-panel-close aria-label="Back to car preview">✕</button>${[["cars","Cars"],["custom","Customize"],["tune","Tuning"],["tracks","Tracks"]].map(([k,n])=>`<button data-tab="${k}" class="${tab===k?"on":""}">${n}</button>`).join("")}</div>${settings(g)}</aside></div>`;
    bind(host, g); animate(host, g);
  }
  // Changing a part while a game sits on its ready screen must re-draw the car,
  // or the garage and the track disagree about what the player is driving.
  function refreshGame() {
    try { if (typeof arcade !== "undefined" && arcade.game && arcade.mode === "ready" && typeof arcade.game.reset === "function") { arcade.game.reset(); arcade.game.draw(arcade.ctx); } } catch (_) {}
  }
  function bind(host,g){
    const commit = () => { save(); refreshGame(); render(); };
    const pay = (price) => { price = Number(price) || 0; if (price > Number(g.cash || 0)) { toast("Need $" + price + " — earn cash in Drift or Racing"); return false; } g.cash -= price; return true; };
    const on = (attr, fn) => $$('[data-' + attr + ']', host).forEach((b) => { b.onclick = () => { if (b.disabled) return; if (fn(b) !== false) commit(); }; });
    const live = (attr, fn) => $$('[data-' + attr + ']', host).forEach((el) => { el.oninput = () => { fn(el); save(); } });

    $$('[data-tab]',host).forEach(b=>b.onclick=()=>{tab=b.dataset.tab;panelOpen=true;render()});
    $$('[data-panel-close]',host).forEach(b=>b.onclick=()=>{panelOpen=false;render()});
    $$('canvas[data-preview]',host).forEach(cv=>drawCar(cv,carDef(cv.dataset.preview),colorFor(g),0,null));

    on('car', (b) => { g.car = b.dataset.car; });
    on('racecar', (b) => { g.raceCar = b.dataset.racecar; });
    on('buy', (b) => { const id = b.dataset.buy, d = carDef(id);
      if ((g.unlocked || []).includes(id)) return;
      if (!pay(d.price || 0)) return false;
      g.unlocked.push(id); g.car = id; toast("Unlocked " + d.name + "!"); });
    on('paint', (b) => { g.paint = b.dataset.paint; });
    on('finish', (b) => { g.finish = b.dataset.finish; });
    on('wheels', (b) => { g.wheels = b.dataset.wheels; });
    on('wheelcolor', (b) => { g.wheelColor = b.dataset.wheelcolor; });
    on('kit', (b) => { const k = b.dataset.kit;
      if (!g.ownedKits.includes(k)) { if (!pay(b.dataset.price)) return false; g.ownedKits.push(k); }
      g.kit = k; });
    on('wing', (b) => { const k = b.dataset.wing;
      if (!g.ownedWings.includes(k)) { if (!pay(b.dataset.price)) return false; g.ownedWings.push(k); }
      g.spoiler = k; });
    on('hood', (b) => { g.hood = b.dataset.hood; });
    on('bumper', (b) => { g.bumper = b.dataset.bumper; });
    on('decal', (b) => { g.decal = b.dataset.decal; });
    on('neon', (b) => { g.neon = b.dataset.neon; });
    on('neonmode', (b) => { g.neonMode = b.dataset.neonmode; });
    on('track', (b) => { g.track = b.dataset.track; });
    on('theme', (b) => { g.theme = b.dataset.theme; });
    on('racemode', (b) => { g.raceMode = b.dataset.racemode; });
    on('cam', (b) => { g.cam = b.dataset.cam; });

    live('tune', (el) => { g.tune[el.dataset.tune] = +el.value;
      const out = $("b", el.parentElement); if (out) out.textContent = (+el.value).toFixed(2);
      refreshBars(host, g); });
    live('wheelize', (el) => { g.wheelSize = +el.value;
      const out = $("b", el.parentElement); if (out) out.textContent = (+el.value).toFixed(2); });
    live('handling', (el) => { g.handling = +el.value;
      const out = $("b", el.parentElement); if (out) out.textContent = g.handling < .34 ? "Arcade" : g.handling < .67 ? "Mixed" : "Sim";
      refreshBars(host, g); });
    live('volume', (el) => { g.engineVolume = +el.value;
      const out = $("b", el.parentElement); if (out) out.textContent = Math.round(g.engineVolume * 100) + "%"; });

    const num = $('#dgNumber', host);
    if (num) num.onchange = () => { g.number = Math.max(0, Math.min(99, Number(num.value) || 0)); num.value = g.number; save(); refreshGame(); };

    $$('#dgConvert, #dgConvertAll', host).forEach((b) => b.onclick = () => {
      if (b.disabled) return;
      const amount = b.id === 'dgConvertAll' ? profile.tokens : Math.min(1, profile.tokens);
      if (!amount) return;
      profile.tokens -= amount; g.cash += amount * 250;
      try { updateHUD(); } catch (_) {}
      toast("+$" + (amount * 250) + " garage cash");
      commit();
    });

    const reset = $('[data-reset]', host);
    if (reset) reset.onclick = () => { g.tune = { power: .7, grip: 1.35, weight: 1.2, handbrake: 1 }; g.handling = 0; commit(); };
    $$('[data-mode]',host).forEach(b=>b.onclick=()=>{const pick=g.car||'sport';if(b.dataset.mode==='drift')g.car=pick;else g.raceCar=pick;toast(`${carDef(pick).name} selected for ${b.dataset.mode==='drift'?'drift':'racing'}`);commit()});
    const drive=(mode)=>{panelOpen=false;close();
      if(typeof arcade==="undefined")return;
      if(window.RacingSession)return RacingSession.start(mode);
      arcade.select("drift");arcade.play();};
    const play=$('[data-play]',host);if(play)play.onclick=()=>drive("practice");
    const scored=$('[data-scored]',host);
    if(scored){
      const afford=!window.RacingSession||RacingSession.canAfford();
      scored.disabled=!afford;
      scored.title=afford?"Costs 1 token and gives five minutes of active driving":"Answer questions to earn a token";
      scored.onclick=()=>drive("scored");
    }
    $$('[data-close]',host).forEach(b=>b.onclick=close);
  }
  function animate(host,g){cancelAnimationFrame(raf);const canvas=$(".workshop-canvas",host);if(!canvas)return;if(stillPreferred()){drawCar(canvas,carDef(g.car),colorFor(g),-.25,g);return}const loop=()=>{angle+=.0025;drawCar(canvas,carDef(g.car),colorFor(g),angle,g);raf=requestAnimationFrame(loop)};loop()}
  function toast(s){try{showToast(s)}catch(_){}}
  function open(){const el=$("#driftGarage");if(!el)return;el.hidden=false;el.classList.add("show");render()}
  function close(){cancelAnimationFrame(raf);panelOpen=false;const el=$("#driftGarage");if(el){el.hidden=true;el.classList.remove("show")}}
  document.addEventListener("click",e=>{if(e.target.closest("#driftGarageBtn,#btnDriftGarage,#cabGarageBtn")){e.preventDefault();e.stopImmediatePropagation();open()}else if(e.target.closest("#dgClose")){e.preventDefault();e.stopImmediatePropagation();close()}},true);
  window.FunSATWorkshop={open,close,render,drawCar,performance:(g)=>{const gg=g||garage();return gg?resolved(gg.car,gg.tune,gg.handling):null}};
})();
