"""The college matcher page: a client-side tool over a compact copy of the profile data.

Everything runs in the browser from the JSON embedded in the page, so it works without a
server, is indexable as ordinary text around the tool, and adds no network requests.
"""
import json

from seo_common import SITE_NAME, STATES, breadcrumbs, e, faq_schema, page

STYLE = """<style>
.cm-form{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:14px 0}
.cm-form label{display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:700;color:var(--ws-ink)}
.cm-form input,.cm-form select{font:inherit;font-weight:400;padding:9px 10px;border:1px solid var(--ws-line);background:var(--ws-surface);color:var(--ws-ink);border-radius:2px;min-height:40px}
.cm-form .cm-check{flex-direction:row;align-items:center;gap:8px;font-weight:600}
.cm-form .cm-check input{min-height:0;width:auto}
.cm-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:6px 0 18px}
body[data-workspace] .cm-actions button{font:inherit;font-weight:700;cursor:pointer;border:1px solid var(--ws-line);background:var(--ws-surface);color:var(--ws-ink);padding:11px 16px;border-radius:2px}
body[data-workspace] .cm-actions button.cm-go{background:var(--ws-accent);color:#fff;border-color:var(--ws-accent)}
.cm-summary{margin:10px 0;color:var(--ws-ink)}
.cm-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0 12px}
.cm-tabs button,body[data-workspace] .cm-tabs button{font:inherit;font-size:13px;font-weight:700;cursor:pointer;border:1px solid var(--ws-line);background:var(--ws-surface);color:var(--ws-ink);padding:7px 12px;border-radius:2px}
body[data-workspace] .cm-tabs button[aria-pressed="false"]{background:var(--ws-surface);color:var(--ws-ink)}
.cm-tabs button[aria-pressed="true"],body[data-workspace] .cm-tabs button[aria-pressed="true"]{background:var(--ws-accent);color:#fff;border-color:var(--ws-accent)}
.cm-list{display:grid;gap:10px;margin:0;padding:0;list-style:none}
.cm-card{border:1px solid var(--ws-line);background:var(--ws-surface);padding:12px 14px;border-radius:2px;display:grid;gap:6px}
.cm-card h3{margin:0;font-size:17px}
.cm-card h3 a{color:var(--ws-ink);text-decoration:none}
.cm-card h3 a:hover{text-decoration:underline}
.cm-meta{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px;color:var(--ws-muted)}
.cm-chip{justify-self:start;display:inline-block;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:3px 8px;border-radius:2px;border:1px solid currentColor}
.cm-likely{color:#0a7a3b}.cm-match{color:#8a5a00}.cm-reach{color:#b3261e}.cm-unk{color:var(--ws-muted)}
.cm-fs{border:1px solid var(--ws-line);background:var(--ws-surface);padding:12px 14px 14px;margin:0 0 12px;border-radius:2px}
.cm-fs legend{font-weight:800;font-size:14px;padding:0 6px;color:var(--ws-ink)}
.cm-fs .cm-form{margin:6px 0 0}
.cm-fs summary{cursor:pointer;color:var(--ws-ink)}
.cm-fs[open] summary{margin-bottom:8px}
.cm-hint{font-size:12px;font-weight:400;color:var(--ws-muted)}
.cm-profile{border-left:4px solid var(--ws-accent);padding:8px 12px;margin:10px 0;background:var(--ws-surface);color:var(--ws-ink)}
.cm-top{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
.cm-fit{font-size:13px;font-weight:800;white-space:nowrap;color:var(--ws-accent)}
.cm-why{margin:2px 0 0;padding-left:18px;font-size:13px;color:var(--ws-ink)}
.cm-why li{line-height:1.5;margin:1px 0}
.cm-note{font-size:12px;color:var(--ws-muted)}
.cm-more{margin:14px 0}
body[data-workspace] .cm-more button{font:inherit;font-weight:700;cursor:pointer;border:1px solid var(--ws-line);background:var(--ws-surface);color:var(--ws-ink);padding:10px 16px;border-radius:2px}
@media (prefers-color-scheme:dark){.cm-likely{color:#5fd391}.cm-match{color:#f0b84a}.cm-reach{color:#ff8a80}}
</style>"""

SCRIPT = r"""
(function(){
  var data = JSON.parse(document.getElementById('cm-data').textContent);
  var form = document.getElementById('cm-form'), out = document.getElementById('cm-results');
  var tabs = document.getElementById('cm-tabs'), sum = document.getElementById('cm-summary'), more = document.getElementById('cm-more');
  var prof = document.getElementById('cm-profile');
  var KEY = 'funsatCollegeMatch2', PAGE = 12, shown = PAGE, filter = 'all', last = [];
  var LOC = {city:'City', suburb:'Suburb', town:'Town', rural:'Rural'};
  var FIELDS = ['sat','act','state','income','price','ctrl','size','loc','region','home','reach','major','ratio','gradMin','retMin','earnMin','debtMax','select','pCost','pGrad','pEarn','pSmall','pDiv','pFirst','pDebt','pRet','sort'];
  var NUMERIC = {sat:1, act:1, price:1, ratio:1, gradMin:1, retMin:1, earnMin:1, debtMax:1};
  var ADJ = JSON.parse(document.getElementById('cm-adj').textContent), REG = JSON.parse(document.getElementById('cm-reg').textContent);
  var BANDS = {'0':'$0–$30,000','1':'$30,001–$48,000','2':'$48,001–$75,000','3':'$75,001–$110,000','4':'$110,000+'};
  function num(v){ var n = parseFloat(v); return isFinite(n) ? n : null; }
  function money(n){ return '$' + Math.round(n).toLocaleString('en-US'); }
  function pick(sel){ return sel.options[sel.selectedIndex].text; }
  function read(){
    var v = {hbcu:form.hbcu.checked, major_only:form.majorOnly.checked, notest:form.notest.checked};
    FIELDS.forEach(function(k){ var el = form[k]; v[k] = NUMERIC[k] ? num(el.value) : el.value; });
    return v;
  }
  function save(v){ try{ localStorage.setItem(KEY, JSON.stringify(v)); }catch(e){} }
  function restore(){
    try{ var v = JSON.parse(localStorage.getItem(KEY)||'null'); if(!v) return;
      FIELDS.forEach(function(k){ if(v[k] != null) form[k].value = v[k]; });
      form.hbcu.checked = !!v.hbcu; form.majorOnly.checked = !!v.major_only; form.notest.checked = !!v.notest; }catch(e){}
  }
  // Percentile (0..1) of each college among all colleges for one measure; "low" means lower is better.
  function ranks(key, low){
    var vals = data.map(function(c){ return c[key]; }).filter(function(x){ return x != null; }).sort(function(a, b){ return a - b; });
    var n = vals.length;
    return function(x){
      if(x == null || !n) return null;
      var lo = 0, hi = n; while(lo < hi){ var m = (lo + hi) >> 1; if(vals[m] < x) lo = m + 1; else hi = m; }
      var p = lo / Math.max(1, n - 1); p = Math.min(1, p);
      return low ? 1 - p : p;
    };
  }
  var R = {np:ranks('np', true), gr:ranks('gr', false), er:ranks('er', false), sf:ranks('sf', true), dv:ranks('dv', false), fg:ranks('fg', false), db:ranks('db', true), rt:ranks('rt', false)};
  function price(c, v){
    if(v.income !== '' && c.bd && c.bd[+v.income] != null) return c.bd[+v.income];
    return c.np;
  }
  function position(c, v){
    var best = null;
    if(v.sat && c.s1 && c.s2) best = (v.sat - c.s1) / (c.s2 - c.s1);
    if(v.act && c.a1 && c.a2){ var t = (v.act - c.a1) / (c.a2 - c.a1); if(best === null || t > best) best = t; }
    return best;
  }
  function band(c, t){
    var adm = c.ad;
    if(t === null){ return adm >= 60 ? 'likely' : adm >= 25 ? 'match' : 'reach'; }
    if(adm < 15) return 'reach';
    if(t >= 1) return adm >= 40 ? 'likely' : 'match';
    if(t >= 0) return adm < 25 ? 'reach' : 'match';
    return 'reach';
  }
  function far(c, v){
    if(v.sat && c.s1 && v.sat < c.s1 - 200) return true;
    if(!v.sat && v.act && c.a1 && v.act < c.a1 - 5) return true;
    return false;
  }
  function size(c){ return c.en < 3000 ? 'small' : c.en <= 10000 ? 'medium' : 'large'; }
  function w(x){ return x === 'high' ? 2 : x === 'some' ? 1 : 0; }
  function personalize(c, v, t, bd){
    var pts = 0, max = 0, why = [];
    // Admission fit always counts: it is the part of "ideal" that a score can speak to.
    var base = bd === 'match' ? 40 : bd === 'likely' ? 34 : 22;
    if(t !== null && bd !== 'reach') base += Math.max(0, 6 - 12 * Math.abs(t - .55));
    // A college that reports no score range cannot be compared with the student's score, so
    // it is sorted by acceptance rate alone and ranks below colleges we can actually compare.
    if(t === null && (v.sat || v.act)){ base = Math.min(base, 26); why.push('It does not report a score range, so this match uses its ' + Math.round(c.ad) + '% acceptance rate only.'); }
    pts += base; max += 46;
    if(t !== null){
      var sc = v.sat && c.s1 ? 'Your ' + v.sat + ' SAT' : 'Your ' + v.act + ' ACT';
      var lo = v.sat && c.s1 ? c.s1 : c.a1, hi = v.sat && c.s1 ? c.s2 : c.a2;
      var sv = v.sat && c.s1 ? v.sat : v.act;
      if(t > 1) why.push(sc + ' is above its typical range (' + lo + '–' + hi + ').');
      else if(t >= 0) why.push(sc + ' sits inside its typical range (' + lo + '–' + hi + ').');
      else why.push(sc + ' is below its typical range (' + lo + '–' + hi + '), so treat it as a stretch.');
    }
    var pr = price(c, v);
    var wc = w(v.pCost);
    if(wc){ var r = R.np(pr); if(r != null){ pts += 8 * wc * r; max += 8 * wc; } }
    if(pr != null){
      var tag = (v.income !== '' && c.bd && c.bd[+v.income] != null) ? 'for a household earning ' + BANDS[v.income] : 'on average';
      if(v.price && pr <= v.price) why.push('Net price about ' + money(pr) + '/yr ' + tag + ', inside your ' + money(v.price) + ' budget.');
      else if(wc || v.income !== '') why.push('Net price about ' + money(pr) + '/yr ' + tag + '.');
    }
    var wg = w(v.pGrad); if(wg){ var rg = R.gr(c.gr); if(rg != null){ pts += 8 * wg * rg; max += 8 * wg; } if(c.gr && c.gr >= 70) why.push(Math.round(c.gr) + '% of students graduate within 6 years.'); }
    var we = w(v.pEarn); if(we){ var re = R.er(c.er); if(re != null){ pts += 8 * we * re; max += 8 * we; } if(c.er && re > .6) why.push('Graduates earn about ' + money(c.er) + ' a year ten years after entry.'); }
    var ws = w(v.pSmall); if(ws){ var rs = R.sf(c.sf); if(rs != null){ pts += 8 * ws * rs; max += 8 * ws; } if(c.sf && c.sf <= 14) why.push('Small classes: about ' + Math.round(c.sf) + ' students per faculty member.'); }
    var wd = w(v.pDiv); if(wd){ var rd = R.dv(c.dv); if(rd != null){ pts += 8 * wd * rd; max += 8 * wd; } if(c.dv && rd > .6) why.push('A more diverse student body than most colleges here.'); }
    var wf = w(v.pFirst); if(wf){ var rf = R.fg(c.fg); if(rf != null){ pts += 8 * wf * rf; max += 8 * wf; } if(c.fg && rf > .6) why.push(Math.round(c.fg) + '% of students are first-generation.'); }
    var wdb = w(v.pDebt); if(wdb){ var rdb = R.db(c.db); if(rdb != null){ pts += 8 * wdb * rdb; max += 8 * wdb; } if(c.db && c.db <= 17000) why.push('Typical federal loan debt is ' + money(c.db) + ', lower than at most colleges here.'); }
    var wr = w(v.pRet); if(wr){ var rr = R.rt(c.rt); if(rr != null){ pts += 8 * wr * rr; max += 8 * wr; } if(c.rt && c.rt >= 85) why.push(Math.round(c.rt) + '% of first-year students return for a second year.'); }
    if(v.ratio && c.sf != null) why.push('Student-to-faculty ratio of about ' + Math.round(c.sf) + ':1.');
    if(v.reach === 'near' && v.home && c.st !== v.home) why.push('In a state bordering ' + v.home + ', so home stays within reach.');
    if(v.reach === 'state' && v.home && c.st === v.home) why.push('In your home state.');
    if(v.region && c.rg === v.region) why.push('In the ' + v.region + ' region.');
    if(v.major){
      var share = c.mj && c.mj[v.major];
      if(share){ pts += 12 * Math.min(1, share / 20); why.push(share + '% of degrees are in ' + v.major + ', one of its biggest programs.'); }
      max += 12;
    }
    if(c.hb && v.hbcu) why.push('A historically Black college or university.');
    if(v.state && c.st === v.state) why.push('In ' + c.sn + ', where you want to study.');
    return {fit: Math.max(1, Math.min(99, Math.round(100 * pts / max))), why: why.slice(0, 5)};
  }
  function run(){
    var v = read(); save(v);
    var hidden = 0, rows = [];
    data.forEach(function(c){
      if(v.state && c.st !== v.state) return;
      if(v.ctrl && c.ct !== v.ctrl) return;
      if(v.size && size(c) !== v.size) return;
      if(v.loc && c.lc !== v.loc) return;
      if(v.hbcu && !c.hb) return;
      if(v.notest && c.tp === 'Required') return;
      if(v.region && c.rg !== v.region) return;
      if(v.home && v.reach){
        if(v.reach === 'state' && c.st !== v.home) return;
        if(v.reach === 'near' && c.st !== v.home && (ADJ[v.home] || []).indexOf(c.st) < 0) return;
        if(v.reach === 'region' && c.rg !== (REG[v.home] || '')) return;
      }
      if(v.ratio && (c.sf == null || c.sf > v.ratio)) return;
      if(v.gradMin && (c.gr == null || c.gr < v.gradMin)) return;
      if(v.retMin && (c.rt == null || c.rt < v.retMin)) return;
      if(v.earnMin && (c.er == null || c.er < v.earnMin)) return;
      if(v.debtMax && (c.db == null || c.db > v.debtMax)) return;
      if(v.select === 'hard' && c.ad >= 20) return;
      if(v.select === 'mid' && (c.ad < 20 || c.ad >= 50)) return;
      if(v.select === 'open' && c.ad < 50) return;
      if(v.major && v.major_only && !(c.mj && c.mj[v.major])) return;
      var pr = price(c, v);
      if(v.price && (pr === null || pr > v.price)) return;
      var hasScore = v.sat || v.act;
      if(hasScore && far(c, v)){ hidden++; return; }
      var t = position(c, v), bd = band(c, t), p = personalize(c, v, t, bd);
      rows.push({c:c, t:t, band:bd, unk: hasScore && t === null, fit:p.fit, why:p.why, pr:pr});
    });
    rows.sort(function(a, b){
      if(v.sort === 'price') return (a.pr === null) - (b.pr === null) || a.pr - b.pr;
      if(v.sort === 'grad') return (b.c.gr || 0) - (a.c.gr || 0);
      if(v.sort === 'earn') return (b.c.er || 0) - (a.c.er || 0);
      return b.fit - a.fit || (a.pr || 1e9) - (b.pr || 1e9);
    });
    last = rows; shown = PAGE; filter = 'all';
    render(v, hidden);
  }
  function profile(v){
    var bits = [];
    if(v.sat) bits.push('a ' + v.sat + ' SAT'); if(v.act) bits.push('a ' + v.act + ' ACT');
    var want = [];
    if(v.size) want.push(v.size + '-size'); if(v.ctrl) want.push(v.ctrl); if(v.loc) want.push(v.loc.replace('suburb','suburban') + (v.loc === 'suburb' ? '' : '-based'));
    var s = 'Matches built for ' + (bits.length ? bits.join(' and ') : 'you');
    if(v.income !== '') s += ', a household in the ' + BANDS[v.income] + ' band';
    if(v.price) s += ', a net price under ' + money(v.price);
    if(want.length) s += ', looking for a ' + want.join(' ') + ' college';
    if(v.state) s += ' in ' + pick(form.state);
    if(v.region) s += ' in the ' + v.region;
    if(v.home && v.reach === 'state') s += ', staying in ' + pick(form.home);
    if(v.home && v.reach === 'near') s += ', within reach of ' + pick(form.home);
    if(v.ratio) s += ', with at most ' + v.ratio + ' students per faculty member';
    if(v.gradMin) s += ', graduating at least ' + v.gradMin + '% of students';
    if(v.major) s += ', studying ' + v.major;
    var pri = [['pCost','low cost'],['pDebt','low student debt'],['pRet','students staying'],['pGrad','graduation rates'],['pEarn','earnings'],['pSmall','small classes'],['pDiv','diversity'],['pFirst','first-generation support']]
      .filter(function(p){ return v[p[0]] === 'high'; }).map(function(p){ return p[1]; });
    if(pri.length) s += ', putting ' + pri.join(' and ') + ' first';
    return s + '.';
  }
  function counts(){ var n = {likely:0, match:0, reach:0}; last.forEach(function(r){ n[r.band]++; }); return n; }
  function render(v, hidden){
    var n = counts(), total = last.length;
    prof.textContent = total ? profile(v) : '';
    prof.hidden = !total;
    sum.textContent = total ? ('We found ' + total + ' colleges: ' + n.match + ' match, ' + n.likely + ' likely and ' + n.reach + ' reach.' +
      (hidden ? ' ' + hidden + ' more were left out because your score is well below their range.' : '') +
      ((v.sat || v.act) ? '' : ' Add a score for sharper matches.')) :
      'No colleges fit all of those filters. Loosen the price, size, location or major and try again.';
    tabs.textContent = '';
    if(total){
      [['all','All (' + total + ')'],['match','Match (' + n.match + ')'],['likely','Likely (' + n.likely + ')'],['reach','Reach (' + n.reach + ')']].forEach(function(p){
        var b = document.createElement('button'); b.type = 'button'; b.textContent = p[1];
        b.setAttribute('aria-pressed', String(filter === p[0]));
        b.addEventListener('click', function(){ filter = p[0]; shown = PAGE; draw(); markTabs(); });
        b.dataset.k = p[0]; tabs.appendChild(b);
      });
    }
    draw();
  }
  function markTabs(){ Array.prototype.forEach.call(tabs.children, function(b){ b.setAttribute('aria-pressed', String(b.dataset.k === filter)); }); }
  function draw(){
    out.textContent = '';
    var list = last.filter(function(r){ return filter === 'all' || r.band === filter; });
    list.slice(0, shown).forEach(function(r){
      var c = r.c, li = document.createElement('li'); li.className = 'cm-card';
      var top = document.createElement('div'); top.className = 'cm-top';
      var h = document.createElement('h3'), a = document.createElement('a'); a.href = '/colleges/' + c.sl + '/'; a.textContent = c.n; h.appendChild(a);
      var fit = document.createElement('span'); fit.className = 'cm-fit'; fit.textContent = 'Your fit ' + r.fit + '%';
      top.appendChild(h); top.appendChild(fit);
      var chip = document.createElement('span'); chip.className = 'cm-chip cm-' + (r.unk ? 'unk' : r.band);
      chip.textContent = r.band === 'likely' ? 'Likely' : r.band === 'match' ? 'Match' : 'Reach';
      var meta = document.createElement('div'); meta.className = 'cm-meta';
      var bits = [c.sn + ' · ' + (c.ct === 'public' ? 'Public' : 'Private') + ' · ' + (LOC[c.lc] || ''),
        c.en.toLocaleString('en-US') + ' undergrads',
        c.s1 ? 'SAT ' + c.s1 + '–' + c.s2 : (c.a1 ? 'ACT ' + c.a1 + '–' + c.a2 : 'Score range not reported'),
        'Admits ' + Math.round(c.ad) + '%',
        r.pr === null ? 'Net price not reported' : 'Net price ' + money(r.pr) + '/yr',
        c.gr ? Math.round(c.gr) + '% graduate' : ''];
      bits.filter(Boolean).forEach(function(t){ var s = document.createElement('span'); s.textContent = t; meta.appendChild(s); });
      li.appendChild(top); li.appendChild(chip); li.appendChild(meta);
      if(r.why.length){
        var ul = document.createElement('ul'); ul.className = 'cm-why';
        r.why.forEach(function(t){ var x = document.createElement('li'); x.textContent = t; ul.appendChild(x); });
        li.appendChild(ul);
      }
      out.appendChild(li);
    });
    more.textContent = '';
    if(list.length > shown){
      var b = document.createElement('button'); b.type = 'button'; b.textContent = 'Show more (' + (list.length - shown) + ' left)';
      b.addEventListener('click', function(){ shown += PAGE; draw(); }); more.appendChild(b);
    }
  }
  form.addEventListener('submit', function(ev){ ev.preventDefault(); run(); });
  document.getElementById('cm-reset').addEventListener('click', function(){
    form.reset(); try{ localStorage.removeItem(KEY); }catch(e){} out.textContent=''; tabs.textContent=''; more.textContent=''; sum.textContent=''; prof.hidden = true;
  });
  restore();
  if(['ratio','gradMin','retMin','earnMin','debtMax','select'].some(function(k){ return form[k].value; })) document.querySelector('details.cm-fs').open = true;
  var v0 = read();
  if(v0.sat || v0.act || v0.state || v0.price || v0.major || v0.income !== '' || v0.home || v0.region || v0.ratio) run();
})();
"""


def compact(colleges):
    """Only the fields the matcher reads, keyed short so the page stays small."""
    rows = []
    for c in colleges:
        if not c.get("adm") or not c.get("enr"):
            continue
        bands = c.get("bands") or []
        bd = [(b[1] if len(b) > 2 and b[2] == "ok" else None) for b in bands][:5]
        rows.append({
            "n": c["n"], "sl": c["slug"], "st": c["st"], "sn": STATES.get(c["st"], c["st"]),
            "ct": c.get("ctrl") or "", "lc": c.get("loc") or "", "en": int(c["enr"]),
            "ad": round(c["adm"], 1),
            "s1": c.get("sr25"), "s2": c.get("sr75"), "a1": c.get("ar25"), "a2": c.get("ar75"),
            "np": c.get("np"), "gr": c.get("gr"), "er": c.get("ern"), "hb": 1 if c.get("hbcu") else 0,
            "sf": c.get("sfr"), "dv": c.get("div"), "fg": c.get("fg"), "tp": c.get("test"),
            "rt": c.get("ret"), "db": c.get("debt"), "rg": REGION_OF.get(c["st"], "Territories"),
            "bd": bd if any(x is not None for x in bd) else None,
            "mj": {m[0]: m[1] for m in (c.get("maj") or [])},
        })
    rows.sort(key=lambda r: r["n"])
    return rows


REGIONS = {
    "Northeast": "CT ME MA NH RI VT NJ NY PA",
    "Midwest": "IL IN MI OH WI IA KS MN MO NE ND SD",
    "South": "DE FL GA MD NC SC VA DC WV AL KY MS TN AR LA OK TX",
    "West": "AZ CO ID MT NV NM UT WY AK CA HI OR WA",
}
REGION_OF = {st: name for name, sts in REGIONS.items() for st in sts.split()}
_ADJ_SRC = """AL:FL GA MS TN|AZ:CA CO NV NM UT|AR:LA MO MS OK TN TX|CA:AZ NV OR|CO:AZ KS NE NM OK UT WY|CT:MA NY RI|DE:MD NJ PA|DC:MD VA|FL:AL GA|GA:AL FL NC SC TN|ID:MT NV OR UT WA WY|IL:IN IA KY MO WI|IN:IL KY MI OH|IA:IL MN MO NE SD WI|KS:CO MO NE OK|KY:IL IN MO OH TN VA WV|LA:AR MS TX|ME:NH|MD:DE PA VA WV DC|MA:CT NH NY RI VT|MI:IN OH WI|MN:IA ND SD WI|MS:AL AR LA TN|MO:AR IL IA KS KY NE OK TN|MT:ID ND SD WY|NE:CO IA KS MO SD WY|NV:AZ CA ID OR UT|NH:ME MA VT|NJ:DE NY PA|NM:AZ CO OK TX UT|NY:CT MA NJ PA VT|NC:GA SC TN VA|ND:MN MT SD|OH:IN KY MI PA WV|OK:AR CO KS MO NM TX|OR:CA ID NV WA|PA:DE MD NJ NY OH WV|RI:CT MA|SC:GA NC|SD:IA MN MT NE ND WY|TN:AL AR GA KY MS MO NC VA|TX:AR LA NM OK|UT:AZ CO ID NV NM WY|VT:MA NH NY|VA:DC KY MD NC TN WV|WA:ID OR|WV:KY MD OH PA VA|WI:IL IA MI MN|WY:CO ID MT NE SD UT"""
ADJ = {}
for _row in _ADJ_SRC.split("|"):
    _a, _b = _row.split(":")
    for _n in _b.split():
        ADJ.setdefault(_a, set()).add(_n)
        ADJ.setdefault(_n, set()).add(_a)
ADJ = {k: sorted(v) for k, v in sorted(ADJ.items())}

MAJORS = ["Business & marketing", "Biological & biomedical sciences", "Social sciences", "Psychology",
          "Health professions", "Engineering", "Computer & information sciences", "Visual & performing arts",
          "Communication", "Education", "Physical sciences", "Mathematics & statistics",
          "English language & literature", "Agriculture", "Parks, recreation & fitness"]

PRIORITY = '<option value="">Not important</option><option value="some">Somewhat important</option><option value="high">Very important</option>'


def _links(rows, n=6):
    return ", ".join(f'<a href="/colleges/{r["sl"]}/">{e(r["n"])}</a>' for r in rows[:n])


def seo_sections(rows):
    """Data-derived text around the tool: crawlable lists that answer the searches people make."""
    out = []
    # Colleges for common SAT scores, from the same middle-50% ranges the tool uses.
    sat_rows = []
    for score in (1000, 1100, 1200, 1300, 1400, 1500):
        fits = sorted((r for r in rows if r["s1"] and r["s2"] and r["s1"] <= score <= r["s2"]), key=lambda r: -r["en"])
        above = sum(1 for r in rows if r["s2"] and score >= r["s2"])
        sat_rows.append(
            f'<tr><td><a href="/sat-scores/{score}/">{score} SAT</a></td><td>{len(fits)}</td><td>{above}</td>'
            f'<td>{_links(fits, 4) or "&mdash;"}</td></tr>')
    out.append(
        '<h2>Colleges that fit common SAT scores</h2>'
        '<p>These counts use the same middle-50% score ranges as the matcher above. '
        '&ldquo;In range&rdquo; means the score falls between a college&rsquo;s 25th and 75th percentile; '
        '&ldquo;above range&rdquo; means it is over the 75th percentile.</p>'
        '<table class="gtable"><thead><tr><th scope="col">Score</th><th scope="col">Colleges in range</th>'
        '<th scope="col">Colleges above range</th><th scope="col">Examples in range</th></tr></thead><tbody>'
        + "".join(sat_rows) + '</tbody></table>')
    cheap = sorted((r for r in rows if r["np"]), key=lambda r: r["np"])
    grad = sorted((r for r in rows if r["gr"]), key=lambda r: -r["gr"])
    earn = sorted((r for r in rows if r["er"]), key=lambda r: -r["er"])
    small = sorted((r for r in rows if r["sf"]), key=lambda r: r["sf"])
    out.append(
        f'<h2>Colleges that stand out on what students ask about most</h2>'
        f'<p>Among the {len(rows)} colleges we profile (federal College Scorecard data):</p><ul>'
        f'<li><strong>Lowest average net price:</strong> {_links(cheap, 6)}.</li>'
        f'<li><strong>Highest six-year graduation rates:</strong> {_links(grad, 6)}.</li>'
        f'<li><strong>Highest median earnings ten years after entry:</strong> {_links(earn, 6)}.</li>'
        f'<li><strong>Smallest student-to-faculty ratios:</strong> {_links(small, 6)}.</li></ul>')
    settings = []
    for loc, label in (("city", "city campuses"), ("suburb", "suburban campuses"), ("town", "college-town campuses"), ("rural", "rural campuses")):
        sel = sorted((r for r in rows if r["lc"] == loc), key=lambda r: -r["en"])
        if sel:
            settings.append(f'<li><strong>{label.capitalize()}:</strong> {len(sel)} colleges, including {_links(sel, 4)}.</li>')
    out.append('<h2>Colleges by setting and size</h2><ul>' + "".join(settings) + '</ul>'
               '<p>Use the setting, size and type filters above to narrow any of these lists to your own '
               'preferences, then compare the finalists on the <a href="/college-comparisons/">comparison page</a>.</p>')
    region_items = []
    for reg in list(REGIONS) + ["Territories"]:
        sel_ = sorted((r for r in rows if r["rg"] == reg), key=lambda r: -r["en"])
        if sel_:
            region_items.append(f'<li><strong>{reg}:</strong> {len(sel_)} colleges, including {_links(sel_, 4)}.</li>')
    out.append('<h2>Colleges by region and distance from home</h2><ul>' + "".join(region_items) + '</ul>'
               '<p>Set your home state and choose to stay in state, stay near home (your state and the states that border it) or '
               'search a whole region. Staying in state often lowers the price at public colleges.</p>')
    ratio_rows = sorted((r for r in rows if r["sf"]), key=lambda r: r["sf"])
    if ratio_rows:
        mid = ratio_rows[len(ratio_rows) // 2]["sf"]
        out.append(
            f'<h2>What is a good student-to-faculty ratio?</h2><p>The student-to-faculty ratio is the number of students for each '
            f'faculty member. Across the {len(ratio_rows)} colleges we profile the middle value is about {mid:.0f} to 1. Ratios under '
            f'12 to 1 usually mean smaller classes and more contact with professors, while ratios above 20 to 1 are common at large '
            f'public universities. It is an average for the whole college, so check class sizes in your own major. Use the ratio limit '
            f'above to keep only colleges at or under the ratio you want, for example '
            f'{_links([r for r in ratio_rows if r["sf"] <= 10], 4) or "the smallest on the list"}.</p>')
    out.append(
        '<h2>How to choose the right college, beyond a score</h2>'
        '<p>A score places a college on a reach, match or likely list. These questions decide whether a college is '
        'right for you.</p><ol>'
        '<li><strong>Can your family afford it?</strong> Set your household income band above. Net price falls sharply with income '
        'at many colleges, and the income band changes the ranking.</li>'
        '<li><strong>Will you finish?</strong> Graduation and first-year retention rates show how many students stay and complete.</li>'
        '<li><strong>Does it offer your major?</strong> Pick a major area above. A college where that field is a top program usually has more courses, faculty and advising in it.</li>'
        '<li><strong>Where do you learn best?</strong> Class size, campus size and setting shape daily life more than rankings do.</li>'
        '<li><strong>Do you feel supported?</strong> Look at first-generation support, diversity and campus safety. See '
        '<a href="/guides/is-a-college-campus-safe/">how to check campus safety</a>.</li></ol>')
    return "".join(out)


def college_match_page(colleges):
    rows = compact(colleges)
    states = sorted({(r["st"], r["sn"]) for r in rows}, key=lambda x: x[1])
    state_opts = '<option value="">Anywhere</option>' + "".join(
        f'<option value="{e(s)}">{e(n)}</option>' for s, n in states)
    state_opts_home = '<option value="">Not specified</option>' + "".join(f'<option value="{e(s)}">{e(n)}</option>' for s, n in states)
    major_opts = '<option value="">No preference</option>' + "".join(f'<option value="{e(m)}">{e(m)}</option>' for m in MAJORS)
    path = "/college-match/"
    faqs = [
        ("How does the college matcher find colleges that fit me?",
         "It uses your SAT or ACT score, your family's income band, your budget, where you want to study, the size, "
         "setting and type of college you prefer, the major you are interested in and the priorities you rank. Each "
         "college gets a personal fit percentage, and the card lists the specific reasons behind it."),
        ("How does it decide reach, match and likely?",
         "It compares your score with each college's reported middle-50% range and its acceptance rate. At or above the "
         "75th percentile at a college that admits most applicants is likely. Inside the range is a match, unless the "
         "college admits under about a quarter of applicants, which makes it a reach. Below the 25th percentile is a reach."),
        ("What does the personal fit percentage mean?",
         "It blends how well your score fits the college with the priorities you marked as important, such as cost, "
         "graduation rate, earnings, class size, diversity and first-generation support, plus a bonus when your major is "
         "one of the college's largest programs. A higher percentage means the college lines up better with what you told us."),
        ("Why does my family income matter?",
         "Net price is what students pay after grants and scholarships, and it varies a lot by income. When you choose "
         "an income band, the matcher uses each college's reported net price for that band instead of the average, "
         "so the price you see is closer to what a family like yours has paid."),
        ("Is the matcher a prediction that I will be admitted?",
         "No. It is a way to sort a long list. Admissions decisions also weigh grades, course rigor, essays, "
         "recommendations and what a college needs that year, none of which the matcher sees."),
        ("Do I need a test score to use it?",
         "No. Without a score it sorts by acceptance rate and your other answers. Add an SAT or ACT score for sharper "
         "matches, or take a free practice test to get an estimate first."),
        ("Where does the college data come from?",
         "From the U.S. Department of Education's College Scorecard (IPEDS and related federal sources). Each college "
         "profile lists the reporting period and source for every number."),
        ("Why is a college I expected missing from my results?",
         "It failed a filter you set, such as price, size or location, its net price was not reported and you set a "
         "price cap, or your score is well below its range. Loosen a filter and run it again."),
        ("Can I search by location or distance from home?",
         "Yes. Choose a home state and then stay in that state, search that state and the states bordering it, or stay in "
         "the same region of the U.S. You can also pick a region such as the Northeast, Midwest, South or West on its own, "
         "and combine either with a city, suburb, town or rural setting."),
        ("What is a good student-to-faculty ratio?",
         "Lower is generally better for access to professors. Ratios of about 12 to 1 or less are typical of small colleges, "
         "and 18 to 1 or more is common at large public universities. It is a college-wide average, so also ask about class sizes in your major."),
        ("What other filters can I use?",
         "You can set minimums for graduation rate, first-year retention and median earnings, a maximum for typical federal "
         "student debt, a student-to-faculty ratio limit and how selective the college is. You can also rank low debt and "
         "student retention as priorities."),
        ("Does it consider weather or climate?",
         "No. The federal data we use does not include climate. Use the region and state filters as a rough guide, and check "
         "each college's own page for campus life details."),
        ("What if I am undecided about a major?",
         "Leave the major on no preference. The matcher then ranks on score, cost, outcomes and the priorities you chose. "
         "You can try a few majors and see how the list changes."),
        ("Is anything I enter stored or shared?",
         "No. The matcher runs entirely in your browser. Your answers are saved only on your own device so the form is "
         "filled in next time, and Reset clears them."),
    ]

    def sel(name, label, options):
        return f'<label>{label}<select name="{name}">{options}</select></label>'

    body = (
        f'<nav class="gnav"><a href="/">&larr; {SITE_NAME}</a><a href="/colleges/">All colleges</a></nav>'
        '<p class="gkicker">College matcher</p>'
        '<h1>College Matcher: Find Colleges That Fit Your Scores, Budget and Goals</h1>'
        f'<p>Tell us about your scores, your budget, the campus you picture and what matters most, and we will rank '
        f'{len(rows)} four-year colleges for <em>you</em>. Every college gets a personal fit percentage and a short list of '
        'the exact reasons it fits, and is sorted into <strong>reach</strong>, <strong>match</strong> or <strong>likely</strong> '
        'from its reported score range and acceptance rate. It runs in your browser; nothing you type is sent anywhere.</p>'
        '<form id="cm-form" aria-label="College matcher">'
        '<fieldset class="cm-fs"><legend>1. Your scores</legend><div class="cm-form">'
        '<label>SAT score (400&ndash;1600)<input name="sat" type="number" inputmode="numeric" min="400" max="1600" step="10" placeholder="e.g. 1200"></label>'
        '<label>ACT score (1&ndash;36)<input name="act" type="number" inputmode="numeric" min="1" max="36" step="1" placeholder="e.g. 26"></label>'
        '<p class="cm-hint">Have both? Enter both and we use the one that fits each college better. No score yet? '
        '<a href="/">Take a free practice test</a>.</p></div></fieldset>'
        '<fieldset class="cm-fs"><legend>2. Your budget</legend><div class="cm-form">'
        + sel("income", 'Household income <span class="cm-hint">(sets the net price we show)</span>',
              '<option value="">Prefer not to say</option><option value="0">Under $30,000</option>'
              '<option value="1">$30,001&ndash;$48,000</option><option value="2">$48,001&ndash;$75,000</option>'
              '<option value="3">$75,001&ndash;$110,000</option><option value="4">Over $110,000</option>')
        + sel("price", "Most you can pay per year (net price)",
              '<option value="">No limit</option><option value="10000">Up to $10,000</option><option value="15000">Up to $15,000</option>'
              '<option value="20000">Up to $20,000</option><option value="30000">Up to $30,000</option><option value="40000">Up to $40,000</option>')
        + '</div></fieldset>'
        '<fieldset class="cm-fs"><legend>3. Your campus</legend><div class="cm-form">'
        + sel("state", "Where you want to study", state_opts)
        + sel("ctrl", "Type", '<option value="">Public or private</option><option value="public">Public</option><option value="private">Private</option>')
        + sel("size", "Size", '<option value="">Any size</option><option value="small">Small (under 3,000)</option>'
              '<option value="medium">Medium (3,000&ndash;10,000)</option><option value="large">Large (over 10,000)</option>')
        + sel("loc", "Setting", '<option value="">Any setting</option><option value="city">City</option><option value="suburb">Suburb</option>'
              '<option value="town">Town</option><option value="rural">Rural</option>')
        + '<label class="cm-check"><input name="hbcu" type="checkbox"> Historically Black colleges only</label>'
        '<label class="cm-check"><input name="notest" type="checkbox"> Skip colleges that require test scores</label>'
        '</div></fieldset>'
        '<fieldset class="cm-fs"><legend>4. Home and distance</legend><div class="cm-form">'
        + sel("home", "Your home state", state_opts_home)
        + sel("reach", "How far would you go?", '<option value="">No limit</option><option value="state">Stay in my home state</option>'
              '<option value="near">My state or a bordering state</option><option value="region">Same region of the U.S.</option>')
        + sel("region", "Or pick a region", '<option value="">Anywhere in the U.S.</option>'
              + "".join(f'<option value="{r}">{r}</option>' for r in REGIONS) + '<option value="Territories">U.S. territories</option>')
        + '</div></fieldset>'
        '<fieldset class="cm-fs"><legend>5. Your interests</legend><div class="cm-form">'
        + sel("major", "A major you are considering", major_opts)
        + '<label class="cm-check"><input name="majorOnly" type="checkbox"> Only colleges where it is a top program</label>'
        '</div></fieldset>'
        '<fieldset class="cm-fs"><legend>6. What matters most to you</legend><div class="cm-form">'
        + sel("pCost", "Low cost", PRIORITY) + sel("pGrad", "Students who graduate", PRIORITY)
        + sel("pEarn", "Earnings after college", PRIORITY) + sel("pSmall", "Small classes", PRIORITY)
        + sel("pDiv", "A diverse campus", PRIORITY) + sel("pFirst", "Support for first-generation students", PRIORITY)
        + sel("pDebt", "Low student debt", PRIORITY) + sel("pRet", "Students who stay (first-year retention)", PRIORITY)
        + sel("sort", "Sort results by", '<option value="fit">Best overall fit for me</option><option value="price">Lowest net price</option>'
              '<option value="grad">Highest graduation rate</option><option value="earn">Highest earnings</option>')
        + '</div></fieldset>'
        '<details class="cm-fs"><summary><strong>7. Fine-tune with hard limits (optional)</strong></summary><div class="cm-form">'
        + sel("ratio", "Student-to-faculty ratio (smaller means more attention)", '<option value="">Any</option><option value="10">10 to 1 or smaller</option>'
              '<option value="14">14 to 1 or smaller</option><option value="18">18 to 1 or smaller</option>')
        + sel("gradMin", "Graduation rate at least", '<option value="">Any</option><option value="50">50%</option><option value="60">60%</option>'
              '<option value="70">70%</option><option value="80">80%</option><option value="90">90%</option>')
        + sel("retMin", "First-year retention at least", '<option value="">Any</option><option value="75">75%</option><option value="85">85%</option><option value="90">90%</option>')
        + sel("earnMin", "Median earnings after 10 years at least", '<option value="">Any</option><option value="40000">$40,000</option>'
              '<option value="50000">$50,000</option><option value="60000">$60,000</option><option value="75000">$75,000</option>')
        + sel("debtMax", "Typical federal debt at most", '<option value="">Any</option><option value="15000">$15,000</option>'
              '<option value="20000">$20,000</option><option value="25000">$25,000</option>')
        + sel("select", "How selective", '<option value="">Any</option><option value="hard">Most selective (admits under 20%)</option>'
              '<option value="mid">Selective (20% to 50%)</option><option value="open">Less selective (admits 50% or more)</option>')
        + '</div></details></form>'
        '<div class="cm-actions"><button type="submit" form="cm-form" class="cm-go">Find my colleges</button>'
        '<button type="button" id="cm-reset">Reset</button></div>'
        '<p id="cm-profile" class="cm-profile" hidden></p>'
        '<p id="cm-summary" class="cm-summary" role="status" aria-live="polite"></p>'
        '<div id="cm-tabs" class="cm-tabs" role="group" aria-label="Filter results by match type"></div>'
        '<ul id="cm-results" class="cm-list"></ul><div id="cm-more" class="cm-more"></div>'
        '<p class="cm-note">Fit percentages compare colleges on the answers you gave and on College Scorecard data. They are not '
        'admission odds, and the matcher does not see your grades, essays or activities.</p>'
        '<noscript><p>The matcher needs JavaScript. You can still browse every college by '
        '<a href="/colleges-by-state/">state</a> or look up your <a href="/sat-scores/">SAT score</a> '
        'or <a href="/act-scores/">ACT score</a>.</p></noscript>'
        '<h2>How the matcher works</h2>'
        '<ul><li><strong>Likely:</strong> your score is at or above the college\'s 75th percentile and it admits at least 40% of applicants.</li>'
        '<li><strong>Match:</strong> your score is inside the middle-50% range and the college admits at least a quarter of applicants, or your score is above the range at a more selective college.</li>'
        '<li><strong>Reach:</strong> your score is below the 25th percentile, or the college admits fewer than about a quarter (or 15%) of applicants.</li>'
        '<li><strong>Your fit %:</strong> your score\'s fit plus the priorities you marked, and a bonus when your major is one of the college\'s biggest programs.</li>'
        '<li><strong>Left out:</strong> colleges where your score is more than 200 SAT points (5 ACT points) below the range.</li></ul>'
        + seo_sections(rows)
        + '<p>Next steps: <a href="/guides/how-to-build-a-college-list/">how to build a college list</a>, '
        '<a href="/guides/how-much-does-college-really-cost/">what college really costs</a>, '
        '<a href="/guides/college-graduation-rates-and-earnings/">graduation rates and earnings</a>, and '
        '<a href="/guides/test-optional-colleges-explained/">test-optional colleges</a>.</p>'
        '<h2>Frequently asked questions</h2>'
        + "".join(f"<h3>{e(q)}</h3><p>{e(a)}</p>" for q, a in faqs)
        + '<div class="glinks"><a href="/colleges/">All colleges</a><a href="/colleges-by-state/">Colleges by state</a>'
          '<a href="/college-comparisons/">Compare colleges</a><a href="/college-costs/">College costs</a>'
          '<a href="/scholarships/">Scholarships</a><a href="/sat-scores/">SAT score lookup</a><a href="/act-scores/">ACT score lookup</a></div>'
        f'<script type="application/json" id="cm-adj">{json.dumps(ADJ, separators=(",", ":"))}</script>'
        f'<script type="application/json" id="cm-reg">{json.dumps(REGION_OF, separators=(",", ":"))}</script>'
        f'<script type="application/json" id="cm-data">{json.dumps(rows, separators=(",", ":"), ensure_ascii=False).replace("</", "<\\/")}</script>'
        f'<script>{SCRIPT}</script>'
    )
    howto = {"@type": "HowTo", "name": "How to find colleges that fit you",
             "step": [{"@type": "HowToStep", "name": n, "text": t} for n, t in [
                 ("Enter your scores", "Add your SAT or ACT score, or take a practice test to get an estimate."),
                 ("Set your budget", "Choose your household income band and the most you can pay per year."),
                 ("Describe your campus", "Pick a state, size, setting and type of college."),
                 ("Add your interests", "Choose a major area you are considering."),
                 ("Rank what matters", "Mark cost, graduation, earnings, class size, diversity and first-generation support."),
                 ("Compare your matches", "Read each college's personal fit and reasons, then open the profiles of your favorites.")]]}
    return path, page(
        path=path,
        title=f"College Matcher: Find Colleges That Fit You | {SITE_NAME}",
        description=(f"Free college matcher: enter your SAT or ACT score, budget, major and priorities to get a personal fit "
                     f"for {len(rows)} colleges, sorted into reach, match and likely."),
        body=body,
        extra_head=STYLE,
        schema=[
            breadcrumbs([("Home", "/"), ("Colleges", "/colleges/"), ("College matcher", path)]),
            faq_schema(faqs), howto,
            {"@type": "WebApplication", "name": "FunSAT College Matcher", "url": "https://funsat.bid" + path,
             "applicationCategory": "EducationalApplication", "operatingSystem": "Any",
             "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}},
        ])
