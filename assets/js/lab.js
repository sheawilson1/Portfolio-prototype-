/* Temporary options switcher for reviewing design choices. Open any page with ?lab and it follows you
   between pages for the session; ?lab=off closes it. Choices only apply while it's open, and the panel
   only shows on pages that have something to choose. Delete this file and its script tags once decided. */
(() => {
  const root = document.documentElement;
  const q = new URLSearchParams(location.search);
  try {
    if (q.get('lab') === 'off') sessionStorage.removeItem('lab');
    else if (q.has('lab')) sessionStorage.setItem('lab', '1');
    if (!sessionStorage.getItem('lab')) return;
  } catch (e) { return; }

  const headlines = {
    use: 'Design people <em>actually use.</em>',
    figma: 'Design that <em>leaves Figma.</em>',
    making: 'Always making <em>something.</em>',
  };
  const opts = [
    { key: 'headline', label: 'Headline', where: '.hero h1', choices: [['use', 'Actually use'], ['figma', 'Leaves Figma'], ['making', 'Always making']] },
    { key: 'hero', label: 'Hero scroll effect', where: '.scene', choices: [['cover', 'Cover'], ['depth', 'Depth'], ['push', 'Push']] },
  ];
  let state = {};
  try { state = JSON.parse(localStorage.getItem('lab') || '{}'); } catch (e) {}
  const attr = (k) => 'lab' + k[0].toUpperCase() + k.slice(1);
  const value = (o) => state[o.key] || o.choices[0][0];
  const apply = () => {
    opts.forEach((o) => { root.dataset[attr(o.key)] = value(o); });
    const h = document.querySelector('.hero h1');
    if (h) h.innerHTML = headlines[root.dataset.labHeadline];
  };
  apply();

  const css = `
  .lab-panel { position: fixed; left: 16px; bottom: 16px; z-index: 200; width: 320px; padding: 12px 14px 14px; border-radius: 18px;
    font: 400 12px/1.3 var(--sans); color: var(--ink); background: var(--glass-strong); border: 1px solid var(--glass-line);
    box-shadow: 0 16px 40px rgba(0, 0, 0, .14); -webkit-backdrop-filter: blur(20px) saturate(1.6); backdrop-filter: blur(20px) saturate(1.6); }
  .lab-panel.is-min { width: auto; padding: 8px 12px; }
  .lab-panel.is-min .lab-row { display: none; }
  .lab-head { display: flex; justify-content: space-between; align-items: center; gap: 14px; }
  .lab-panel:not(.is-min) .lab-head { margin-bottom: 8px; }
  .lab-head b { font-weight: 500; }
  .lab-head span { display: flex; gap: 10px; }
  .lab-head button { color: var(--whisper); }
  .lab-head button:hover { color: var(--ink); }
  .lab-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 5px 0; border-top: 1px solid var(--hair); }
  .lab-row > span { color: var(--ink-2); }
  .lab-seg { display: flex; padding: 2px; border-radius: 999px; background: var(--surface, rgba(10, 10, 10, .04)); }
  .lab-seg button { padding: 4px 9px; border-radius: 999px; color: var(--ink-2); white-space: nowrap; }
  .lab-seg button[aria-pressed="true"] { color: var(--bg); background: var(--ink); }`;

  const build = () => {
    apply();
    const here = opts.filter((o) => document.querySelector(o.where));
    if (!here.length) return;
    const style = document.createElement('style'); style.textContent = css; document.head.append(style);
    const panel = document.createElement('div');
    panel.className = 'lab-panel'; panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', 'Design options');
    panel.innerHTML = '<div class="lab-head"><b>Options</b><span><button type="button" data-act="min">Hide</button><button type="button" data-act="exit">Close</button></span></div>'
      + here.map((o) => `<div class="lab-row"><span>${o.label}</span><div class="lab-seg">${o.choices.map(([v, t]) =>
        `<button type="button" data-key="${o.key}" data-val="${v}">${t}</button>`).join('')}</div></div>`).join('');
    const sync = () => panel.querySelectorAll('[data-key]').forEach((b) =>
      b.setAttribute('aria-pressed', String(root.dataset[attr(b.dataset.key)] === b.dataset.val)));
    panel.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.act === 'min') { panel.classList.toggle('is-min'); b.textContent = panel.classList.contains('is-min') ? 'Show' : 'Hide'; return; }
      if (b.dataset.act === 'exit') { try { sessionStorage.removeItem('lab'); } catch (err) {} location.search = ''; return; }
      state[b.dataset.key] = b.dataset.val;
      try { localStorage.setItem('lab', JSON.stringify(state)); } catch (err) {}
      apply(); sync(); dispatchEvent(new Event('lab:change'));
    });
    sync(); document.body.append(panel);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build); else build();
})();
