/* Progressive enhancement over existing routes and saved results.
   No new account schema, score calculation or cloned live study tools. */
(() => {
  'use strict';
  const root = document.documentElement;
  const isApp = !!document.getElementById('screen-start');
  const validAppearance = (value) => value === 'light' || value === 'dark';
  function appearance(value) {
    const chosen = validAppearance(value) ? value : 'dark';
    root.dataset.deskAppearance = chosen;
    root.style.colorScheme = chosen;
    try { localStorage.setItem('funsatDeskAppearance', chosen); } catch (_) { /* Browsing works without persistent storage. */ }
    document.querySelectorAll('[data-desk-appearance-control]').forEach((select) => { select.value = chosen; });
  }
  document.querySelectorAll('[data-desk-appearance-control]').forEach((select) => {
    select.value = root.dataset.deskAppearance || 'dark';
    select.addEventListener('change', () => appearance(select.value));
  });
  if (!isApp) return;

  const menu = document.getElementById('deskMenu');
  function closeMenu() {
    document.body.classList.remove('pd-menu-open');
    menu.setAttribute('aria-expanded', 'false');
  }
  menu.addEventListener('click', () => {
    const open = document.body.classList.toggle('pd-menu-open');
    menu.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.body.classList.contains('pd-menu-open')) {
      closeMenu(); menu.focus();
    }
  });
  document.querySelectorAll('.topbar .arcade-btn').forEach((button) => button.addEventListener('click', closeMenu));

  function review() {
    document.getElementById('btnHome').click();
    closeMenu();
    const history = document.getElementById('historyStart');
    if (history.style.display !== 'none') {
      history.setAttribute('tabindex', '-1'); history.focus(); history.scrollIntoView({ block: 'start' });
    } else {
      const skills = document.getElementById('deskSkills');
      skills.setAttribute('tabindex', '-1'); skills.focus();
      const status = document.getElementById('deskStatus');
      status.textContent = 'No saved attempts yet. Finish a practice session to review your answers here.';
    }
  }
  document.getElementById('deskReview').addEventListener('click', review);
  document.getElementById('deskReviewAnswers').addEventListener('click', review);

  function updateDesk() {
    if (typeof profile === 'undefined' || typeof state === 'undefined') return;
    document.body.classList.toggle('pd-testing', state.view === 'test' || state.view === 'routing');
    const avg = window.FunSATRedesign?.homeAverage();
    document.getElementById('deskEstimate').textContent = avg?.score ? String(avg.score) : 'Not yet';
    const customTarget = profile.college?.customTarget;
    const target = Number.isFinite(customTarget) && customTarget >= 400 && customTarget <= 1600 ? String(customTarget) : 'Not set';
    document.getElementById('deskTarget').textContent = target;
    const finished = (profile.history || []).filter((rec) => rec.done && rec.scoreEligible !== false && rec.practiceKind !== 'topic' && rec.totalAnswered > 0);
    document.getElementById('deskTests').textContent = String(finished.length);
    document.getElementById('deskEstimateNote').textContent = avg?.source === 'act'
      ? 'SAT-equivalent estimate from ACT practice. Not an official score.'
      : 'Practice estimates are unofficial. Subject drills do not change them.';
    document.querySelector('#btnPractice span').textContent = 'Practice';
    document.querySelector('#btnSubjectPractice span').textContent = 'Subjects';
    document.querySelector('.st-head h1').textContent = 'Your practice desk';
    document.querySelector('.st-kicker').textContent = 'SAT & ACT preparation';
    document.getElementById('btnResume').textContent = 'Resume practice';

    const catalog = window.FunSATSubjects?.inventory() || {};
    const rows = Object.entries(profile.skillStats || {}).map(([key, stat]) => {
      const item = catalog[key]; const total = Number(stat.r) + Number(stat.w);
      return item && Number.isFinite(total) && total >= 4
        ? { key, label: item.skill, accuracy: Math.round(Number(stat.r) / total * 100), test: item.test }
        : null;
    }).filter(Boolean).filter((row) => row.test === state.cfg.testType).sort((a, b) => a.accuracy - b.accuracy).slice(0, 3);
    const body = document.getElementById('deskSkillRows'); body.replaceChildren();
    rows.forEach((row) => {
      const tr = document.createElement('tr');
      const skill = document.createElement('td'); skill.textContent = row.label;
      const score = document.createElement('td'); score.textContent = row.accuracy + '%';
      const action = document.createElement('td'); const button = document.createElement('button');
      button.type = 'button'; button.textContent = 'Practice'; button.setAttribute('aria-label', 'Practice ' + row.label);
      // Use the subject picker so starting a drill cannot silently replace an unfinished exam.
      button.addEventListener('click', () => window.FunSATSubjects.choose(row.key));
      action.append(button); tr.append(skill, score, action); body.append(tr);
    });
    document.getElementById('deskSkillEmpty').hidden = rows.length > 0;
  }
  const baseRenderStart = renderStart;
  renderStart = function () { baseRenderStart.apply(this, arguments); updateDesk(); };
  const baseShowScreen = showScreen;
  showScreen = function (id) {
    const result = baseShowScreen.apply(this, arguments);
    document.body.classList.toggle('pd-testing', id === 'screen-test');
    closeMenu(); return result;
  };
  document.getElementById('deskSetTarget').addEventListener('click', () => document.getElementById('btnCollege').click());
  updateDesk();
  window.FunSATDesk = { appearance, update: updateDesk };

  // Public-page navigation enters existing app routes after all deferred modules attach.
  const views = { subjects: 'btnSubjectPractice', college: 'btnCollege', scholarships: 'btnScholarships', review: 'deskReview', arcade: 'btnArcade' };
  const view = new URLSearchParams(location.search).get('view');
  if (views[view]) {
    const open = () => setTimeout(() => document.getElementById(views[view]).click(), 0);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', open, { once: true });
    else open();
  }
})();
