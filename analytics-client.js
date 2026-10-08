/* Consent-only, generic usage collector. Never reads URLs, forms, medication,
   accounts, answers, scores or persistent visitor identity. */
(function () {
  'use strict';
  if (window.CloudProjectAnalytics) return;
  let consent = false, project = '', endpoint = '', session = null, queue = [], timer = null;
  let generation = 0;
  const allowed = new Set(['page_view','sat_test_started','sat_module_completed','sat_test_completed',
    'sat_results_viewed','sat_score_breakdown_viewed','sat_answer_review_started','sat_answer_review_completed',
    'practice_started','game_started','game_round_completed','game_session_10min','game_session_30min',
    'game_session_60min','game_session_ended','college_tool_used']);
  function getSession() {
    const now = Date.now(), key = 'cloud-analytics-session:' + project;
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || 'null');
      if (saved && /^[0-9a-f-]{36}$/i.test(saved.id) && now - saved.last < 30 * 60000 && saved.last <= now) session = saved;
    } catch (_) {}
    if (!session || now - session.last >= 30 * 60000) session = {id:crypto.randomUUID(),last:now};
    session.last = now;
    try { sessionStorage.setItem(key,JSON.stringify(session)); } catch (_) {}
    return session.id;
  }
  function flush() {
    clearTimeout(timer); timer = null;
    if (!consent || !queue.length) return;
    const events = queue.splice(0,20), sessionId = getSession(), version = generation;
    // No retries: analytics loss never blocks the product or amplifies traffic.
    try { fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({consent:true,sessionId,events}),keepalive:true,credentials:'omit',
      referrerPolicy:'no-referrer',signal:typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(5000) : undefined}).catch(()=>{}); } catch (_) {}
    if (queue.length && version === generation) timer = setTimeout(flush,2000);
  }
  function track(name, properties = {}) {
    if (!consent || !allowed.has(name) || (project === 'pillcounted' && name !== 'page_view')) return;
    if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return;
    // Fixed categorical/numeric fields only; server validates independently.
    const clean = {};
    if (project === 'pillcounted') clean.view = 'site';
    else for (const key of ['test_type','section','game','view','experiment','results_density','module',
      'questions_answered','duration_seconds','game_rails','vignette_frequency_label']) {
      const value = properties[key];
      if (typeof value === 'string' && /^[a-zA-Z0-9_-]{1,60}$/.test(value)) clean[key] = value;
      else if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 86400) clean[key] = value;
    }
    if (queue.length >= 100) return;
    queue.push({id:crypto.randomUUID(),name,properties:clean});
    if (queue.length >= 20) flush();
    else if (!timer) timer = setTimeout(flush,2000);
  }
  function configure(options = {}) {
    clearTimeout(timer);timer = null;queue = [];generation++;
    if (!options.consent && project) {
      try { sessionStorage.removeItem('cloud-analytics-session:' + project); } catch (_) {}
    }
    consent = false;session = null;
    if (options.consent !== true || !['funsat','pillcounted'].includes(options.project)) return;
    try {
      const url = new URL(options.endpoint || '/api/analytics/events',location.origin);
      if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname))) return;
      url.searchParams.set('project',options.project);endpoint = url.href;
    } catch (_) {return;}
    project = options.project;consent = true;
  }
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush();});
  window.CloudProjectAnalytics = {
    configure,track,flush,
    connectFunSat({consent: granted} = {}) {
      configure({consent:granted,project:'funsat'});
      window.FunSatMetrics?.configure({consent:granted === true,send:track});
    }
  };
})();
