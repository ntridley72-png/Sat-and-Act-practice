/* Product analytics are independent of ad delivery. No scores, answers, email or IDs. */
(function () {
  "use strict";
  if (window.FunSatMetrics) return;
  const names = new Set(['sat_test_started','sat_module_completed','sat_test_completed','sat_results_viewed',
    'sat_score_breakdown_viewed','sat_answer_review_started','sat_answer_review_completed','practice_started',
    'game_started','game_round_completed','game_session_10min','game_session_30min','game_session_60min',
    'game_session_ended','college_tool_used','page_view']);
  let granted = false, sink = null, gameSeconds = 0;
  const milestones = new Set();
  function track(name, values = {}) {
    if (!granted || typeof sink !== 'function' || !names.has(name)) return;
    const properties = {};
    for (const key of ['test_type','section','module','questions_answered','duration_seconds','game','view']) {
      if (typeof values[key] === 'number' && Number.isFinite(values[key])) properties[key] = Math.max(0, values[key]);
      else if (typeof values[key] === 'string' && /^[a-zA-Z0-9_-]{1,40}$/.test(values[key])) properties[key] = values[key];
    }
    const cfg = window.FUNSAT_ADS || {};
    properties.experiment = String(cfg.experiment || 'baseline').slice(0,60);
    properties.game_rails = cfg.gameRails ?? 1;
    properties.results_density = cfg.resultsDensity || 'conservative';
    // This is a reporting label, not a browser-controlled Google frequency setting.
    properties.vignette_frequency_label = cfg.vignetteFrequencyMinutes || 3;
    try { sink(name, properties); } catch (_) { /* Analytics never blocks the product. */ }
  }
  function gameTick(dt) {
    // Called by the existing game loop only while playing in a visible tab.
    if (document.visibilityState !== 'visible' || !granted) return;
    gameSeconds += Math.min(Math.max(Number(dt) || 0, 0), 0.05);
    for (const minutes of [10,30,60]) if (gameSeconds >= minutes * 60 && !milestones.has(minutes)) {
      milestones.add(minutes); track('game_session_' + minutes + 'min');
    }
  }
  function endGameSession() {
    if (gameSeconds > 0) track('game_session_ended', {duration_seconds: Math.round(gameSeconds)});
    gameSeconds = 0; milestones.clear();
  }
  window.FunSatMetrics = {
    track, gameTick, endGameSession,
    configure({consent, send} = {}) { granted = consent === true; sink = typeof send === 'function' ? send : null;
      if (!granted) { gameSeconds = 0; milestones.clear(); }
    }
  };
})();
