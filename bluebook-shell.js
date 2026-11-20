/* Header "More" menu for the Bluebook-style shell. On a wide screen the top bar only has room for
   the tabs and the wallet, so the appearance and layout pickers and the autosave note move into a
   small popover. The nodes are moved, never copied, so every id and handler keeps working, and on a
   phone the same panel simply sits inside the Progress Desk's own collapsed menu. Fails open. */
(() => {
  'use strict';
  const bar = document.getElementById('deskNavigation');
  if (!bar || document.getElementById('bbMore')) return;
  const panel = document.createElement('div');
  panel.className = 'bb-more-panel';
  panel.id = 'bbMorePanel';
  const pieces = [document.querySelector('.pd-appearance'), document.querySelector('.workspace-theme-label'), document.getElementById('autosave')];
  pieces.forEach((node) => { if (node) panel.append(node); });
  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'bbMore';
  button.setAttribute('aria-haspopup', 'true');
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', 'bbMorePanel');
  button.title = 'More: appearance and layout';
  button.setAttribute('aria-label', 'More: appearance and layout');
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="19" r="1.3"/></svg><span>More</span>';
  const close = () => { document.body.classList.remove('bb-more-open'); button.setAttribute('aria-expanded', 'false'); };
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const open = document.body.classList.toggle('bb-more-open');
    button.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (event) => { if (!event.target.closest('#bbMorePanel') && !event.target.closest('#bbMore')) close(); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && document.body.classList.contains('bb-more-open')) { close(); button.focus(); } });
  bar.append(button, panel);
})();
