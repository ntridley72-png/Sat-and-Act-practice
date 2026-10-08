(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const paints = () => (typeof CAR_PAINTS !== "undefined" ? CAR_PAINTS : { teal: "#07869a" });
  const launch = ["sport", "hatch", "coupe90", "muscle", "rotary", "rally", "track", "straight", "hyper", "panda"];
  let tab = "cars", raf = 0, angle = -.25, panelOpen = false;
  const stillPreferred = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (_) { return false; } };

  function garage() { return window.DriftCircuit && window.DriftCircuit.garage(); }
  function save() { try { saveProfile(); } catch (_) {} }
  function carDef(id) { return (window.DriftCircuit && window.DriftCircuit.CARS[id]) || { name: "Horizon Coupe", shape: { style: "coupe", len: 40, wid: 20 } }; }
  function colorFor(g) { const m = paints(); return m[g.paint] || (String(g.paint || "").startsWith("#") ? g.paint : m.teal); }

  function drawCar(canvas, def, color, a) {
    const dpr = Math.min(devicePixelRatio || 1, 2), w = Math.max(80, canvas.clientWidth), h = Math.max(45, canvas.clientHeight);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const c = canvas.getContext("2d"); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
    const hero = canvas.classList.contains("workshop-canvas"), scale = Math.min(w / (hero ? 620 : 150), h / (hero ? 330 : 72));
    const cx = w * .5, cy = h * (hero ? .58 : .6), len = (hero ? 270 : 86) * scale, bodyH = (hero ? 64 : 24) * scale;
    const style = (def.shape && def.shape.style) || "coupe";
    const hatch = style === "hatch" || style === "boxy" || style === "ev", supercar = style === "super" || style === "wedge";
    c.save(); c.translate(cx, cy); c.transform(1, 0, Math.sin(a || 0) * .2, 1, 0, 0);
    c.fillStyle = "rgba(0,0,0,.32)"; c.beginPath(); c.ellipse(0, bodyH * .62, len * .55, bodyH * .31, 0, 0, Math.PI * 2); c.fill();
    const grad = c.createLinearGradient(0, -bodyH, 0, bodyH); grad.addColorStop(0, lighten(color, 34)); grad.addColorStop(.55, color); grad.addColorStop(1, shade(color, 38));
    c.fillStyle = grad; polygon(c, [[-len*.54,bodyH*.25],[-len*.48,-bodyH*.28],[-len*.24,-bodyH*.43],[len*.43,-bodyH*.34],[len*.55,-bodyH*.02],[len*.5,bodyH*.38],[-len*.5,bodyH*.4]]); c.fill();
    const roofRear = hatch ? -.34 : -.22, roofTop = supercar ? -.95 : -1.18;
    c.fillStyle = shade(color, 8); polygon(c, [[len*roofRear,-bodyH*.39],[len*(roofRear+.18),bodyH*roofTop],[len*.2,bodyH*(roofTop+.06)],[len*.36,-bodyH*.35]]); c.fill();
    c.fillStyle = "#102a36"; polygon(c, [[len*(roofRear+.06),-bodyH*.44],[len*(roofRear+.21),bodyH*(roofTop+.12)],[len*.15,bodyH*(roofTop+.17)],[len*.28,-bodyH*.4]]); c.fill();
    c.strokeStyle = "rgba(255,255,255,.32)"; c.lineWidth = Math.max(1,scale*1.2); c.beginPath(); c.moveTo(-len*.05,bodyH*(roofTop+.12)); c.lineTo(-len*.02,-bodyH*.42); c.stroke();
    for (const x of [-len*.32, len*.33]) wheel(c, x, bodyH*.35, bodyH*.48, scale);
    c.fillStyle = "#dffbff"; c.fillRect(len*.43,-bodyH*.22,len*.09,bodyH*.13); c.fillStyle="#ff554d"; c.fillRect(-len*.51,-bodyH*.18,len*.08,bodyH*.16);
    c.fillStyle="#061117"; c.fillRect(len*.31,bodyH*.13,len*.2,bodyH*.11); c.strokeStyle="rgba(255,255,255,.2)"; c.stroke();
    if (hero) { c.strokeStyle="rgba(91,225,236,.32)"; c.lineWidth=2; c.beginPath(); c.moveTo(-len*.48,bodyH*.08); c.lineTo(len*.48,bodyH*.03); c.stroke(); }
    c.restore();
  }
  function polygon(c, pts) { c.beginPath(); pts.forEach((p,i)=>i?c.lineTo(p[0],p[1]):c.moveTo(p[0],p[1])); c.closePath(); }
  function wheel(c,x,y,r,s){ c.fillStyle="#070b0e";c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();c.fillStyle="#9aa7ab";c.beginPath();c.arc(x,y,r*.62,0,Math.PI*2);c.fill();c.strokeStyle="#273138";c.lineWidth=Math.max(2,s*2);for(let i=0;i<5;i++){let a=i*Math.PI*2/5;c.beginPath();c.moveTo(x,y);c.lineTo(x+Math.cos(a)*r*.55,y+Math.sin(a)*r*.55);c.stroke()}c.fillStyle="#172027";c.beginPath();c.arc(x,y,r*.18,0,Math.PI*2);c.fill()}
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
    if (tab === "tracks") return `<div class="workshop-section"><h3>Track</h3><div class="workshop-row">${Object.entries(DriftCircuit.TRACKS).map(([k,v])=>`<button class="workshop-chip ${g.track===k?"on":""}" data-track="${k}">${v.name}</button>`).join("")}</div></div><div class="workshop-section"><h3>Racing mode</h3><div class="workshop-row">${[["traffic","Traffic dodge"],["circuit","Circuit race"]].map(([k,n])=>`<button class="workshop-chip ${g.raceMode===k?"on":""}" data-racemode="${k}" aria-pressed="${g.raceMode===k}">${n}</button>`).join("")}</div></div><div class="workshop-section"><h3>Camera</h3><div class="workshop-row">${["chase","far","hood"].map(k=>`<button class="workshop-chip ${g.cam===k?"on":""}" data-cam="${k}" aria-pressed="${g.cam===k}">${k==="hood"?"cockpit":k}</button>`).join("")}</div><p class="workshop-note">Press C while driving to cycle cameras.</p></div><div class="workshop-section"><h3>Time and place</h3><div class="workshop-row">${Object.entries(Scene3D.THEMES).map(([k,v])=>`<button class="workshop-chip ${g.theme===k?"on":""}" data-theme="${k}" aria-pressed="${g.theme===k}">${v.name}</button>`).join("")}</div><p class="workshop-note">Lighting and scenery only in this release; grip is the same in every setting. The road stays open above the camera with no solid overhead slab.</p></div>`;
    return `<div class="workshop-section"><h3>Garage cash</h3><div class="workshop-row"><button class="workshop-chip" id="dgConvert" ${profile.tokens<1?"disabled":""}>1 token → $250</button><button class="workshop-chip" id="dgConvertAll" ${profile.tokens<1?"disabled":""}>Convert all (${profile.tokens})</button></div><p class="workshop-note">Tokens: ${profile.tokens} · Cash: $${Number(g.cash||0).toLocaleString()}. Drift and racing also pay cash directly.</p></div><div class="workshop-section"><h3>Ten-car collection</h3><div class="workshop-cars">${carCards(g)}</div></div>`;
  }
  // Scale each bar against the real spread of the fleet rather than a guessed
  // band, so the baseline Sport Coupe lands mid-scale and the bars actually rank
  // the cars the way the physics does. No claim of real units.
  const span = (key) => {
    const all = Object.values((window.DriftCircuit && DriftCircuit.CARS) || {}).map((c) => Number(c[key]) || 1);
    const lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
    return hi > lo ? [lo, hi] : [lo - .1, lo + .1];
  };
  function rating(v, key, invert) {
    const [lo, hi] = span(key);
    let t = ((Number(v) || 1) - lo) / (hi - lo);
    if (invert) t = 1 - t;
    return Math.max(.5, Math.min(10, .5 + t * 9.5));
  }
  function stats(def) {
    const grip = rating(def.grip, "grip"), light = rating(def.weight, "weight", true);
    return [
      ["Speed", rating(def.power, "power")],
      ["Grip", grip],
      ["Drift", rating(def.hb, "hb")],
      ["Handling", Math.max(.5, Math.min(10, (grip + light) / 2))]
    ];
  }
  function bars(def) {
    return stats(def).map(([label, v]) => `<span>${label}</span><i style="--v:${Math.round(v * 10)}%"></i><b>${v.toFixed(1)}</b>`).join("");
  }
  function slider(key,label,val,min,max,note,attr){return `<label class="workshop-slider"><span>${label}</span><input data-${attr||"tune"}="${key}" type="range" min="${min}" max="${max}" step=".05" value="${Number(val)}" aria-label="${label}"><b>${Number(val).toFixed(2)}</b></label><p class="workshop-note">${note}</p>`}

  function render() {
    const host = $("#dgBody"), g = garage(); if (!host || !g) return;
    if (!g.paint || !(g.paint in paints())) g.paint = "teal";
    $("#dgCash").textContent = `$${Number(g.cash||0).toLocaleString()}`;
    host.innerHTML = `<div class="workshop${panelOpen ? " panel-open" : ""}"><nav class="workshop-nav" aria-label="Workshop sections"><button data-tab="cars" data-short="Cars" class="${tab==="cars"?"on":""}">Garage</button><button class="play" data-play data-short="Drive">Open Practice<small>Free · not scored</small></button><button class="play scored" data-scored data-short="Run">Scored Run<small>1 token · 5 min</small></button><button data-tab="custom" data-short="Style" class="${tab==="custom"?"on":""}">Customize</button><button data-tab="tune" data-short="Tune" class="${tab==="tune"?"on":""}">Tuning</button><button data-tab="tracks" data-short="Tracks" class="${tab==="tracks"?"on":""}">Tracks & weather</button><button data-tab="scores" data-short="Scores" class="${tab==="scores"?"on":""}">Leaderboard</button></nav><section class="workshop-stage" aria-label="Rotatable car preview"><canvas class="workshop-canvas" aria-label="${carDef(g.car).name} preview"></canvas><div class="workshop-hero"><div><p>MY CAR</p><h2>${carDef(g.car).name}</h2><p>Fictional simcade car · ${carDef(g.car).era||"Modern"} · ${(g.unlocked||[]).includes(g.car)?"Owned":"Locked"}</p></div><div class="workshop-bars">${bars(carDef(g.car))}</div></div></section><aside class="workshop-panel"><div class="workshop-tabs"><button class="workshop-back" data-panel-close aria-label="Back to car preview">✕</button>${[["cars","Cars"],["custom","Customize"],["tune","Tuning"],["tracks","Tracks"]].map(([k,n])=>`<button data-tab="${k}" class="${tab===k?"on":""}">${n}</button>`).join("")}</div>${settings(g)}</aside></div>`;
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
    $$('canvas[data-preview]',host).forEach(cv=>drawCar(cv,carDef(cv.dataset.preview),colorFor(g),0));

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
      const out = $("b", el.parentElement); if (out) out.textContent = (+el.value).toFixed(2); });
    live('wheelize', (el) => { g.wheelSize = +el.value;
      const out = $("b", el.parentElement); if (out) out.textContent = (+el.value).toFixed(2); });
    live('handling', (el) => { g.handling = +el.value;
      const out = $("b", el.parentElement); if (out) out.textContent = g.handling < .34 ? "Arcade" : g.handling < .67 ? "Mixed" : "Sim"; });
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
  function animate(host,g){cancelAnimationFrame(raf);const canvas=$(".workshop-canvas",host);if(!canvas)return;if(stillPreferred()){drawCar(canvas,carDef(g.car),colorFor(g),-.25);return}const loop=()=>{angle+=.0025;drawCar(canvas,carDef(g.car),colorFor(g),angle);raf=requestAnimationFrame(loop)};loop()}
  function toast(s){try{showToast(s)}catch(_){}}
  function open(){const el=$("#driftGarage");if(!el)return;el.hidden=false;el.classList.add("show");render()}
  function close(){cancelAnimationFrame(raf);panelOpen=false;const el=$("#driftGarage");if(el){el.hidden=true;el.classList.remove("show")}}
  document.addEventListener("click",e=>{if(e.target.closest("#driftGarageBtn,#btnDriftGarage,#cabGarageBtn")){e.preventDefault();e.stopImmediatePropagation();open()}else if(e.target.closest("#dgClose")){e.preventDefault();e.stopImmediatePropagation();close()}},true);
  window.FunSATWorkshop={open,close,render,drawCar};
})();
