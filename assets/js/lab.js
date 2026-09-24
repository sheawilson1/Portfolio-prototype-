/* Temporary options switcher for reviewing design choices. Open any page with ?lab and it follows you
   between pages for the session; ?lab=off closes it. Choices only apply while it's open. Delete this
   file and its script tags once the choices are made. */
(() => {
  const root = document.documentElement;
  const q = new URLSearchParams(location.search);
  try {
    if (q.get('lab') === 'off') sessionStorage.removeItem('lab');
    else if (q.has('lab')) sessionStorage.setItem('lab', '1');
    if (!sessionStorage.getItem('lab')) return;
  } catch (e) { return; }

  const opts = [
    { key: 'track', label: 'Headline spacing', choices: [['tight', 'Tighter'], ['loose', 'Looser']] },
    { key: 'italic', label: 'Italic in headlines', choices: [['on', 'On'], ['off', 'Off']] },
    { key: 'labels', label: 'Section labels', choices: [['off', 'Off'], ['on', 'On']] },
    { key: 'panel', label: 'Panel behind phones', choices: [['off', 'Off'], ['on', 'On']] },
    { key: 'overview', label: 'Overview', choices: [['side', 'Side'], ['centre', 'Centred'], ['wide', 'Wide']] },
    { key: 'drift', label: 'Amp hero motion', choices: [['on', 'On'], ['off', 'Off']] },
  ];
  let state = {};
  try { state = JSON.parse(localStorage.getItem('lab') || '{}'); } catch (e) {}
  const attr = (k) => 'lab' + k[0].toUpperCase() + k.slice(1);
  const apply = () => opts.forEach((o) => { root.dataset[attr(o.key)] = state[o.key] || o.choices[0][0]; });
  apply();

  const css = `
  html[data-lab-track="loose"] { --track-display: -.016em; --track-heading: -.016em; --track-title: -.016em; --word-display: 0em; }
  html[data-lab-italic="off"] :is(h1, h2) em { font-style: normal; }
  html[data-lab-labels="on"] .cs-text .eyebrow { display: block; }
  html[data-lab-panel="on"] .shot.is-phone { overflow: hidden; padding: clamp(36px, 6vw, 80px) 24px;
    background: radial-gradient(64% 58% at 50% 64%, color-mix(in srgb, var(--tone) 24%, transparent), transparent 72%), var(--surface); }
  html[data-lab-panel="on"] .shot.is-phone::before { display: none; }
  html[data-lab-overview="centre"] .cs-intro { display: block; text-align: center; }
  html[data-lab-overview="centre"] .cs-intro .label { padding: 0 0 18px; }
  html[data-lab-overview="centre"] .cs-intro p:not(.label) { margin: 0 auto; max-width: 36ch; }
  html[data-lab-overview="wide"] .cs-intro .label { grid-column: 1 / -1; padding: 0; }
  html[data-lab-overview="wide"] .cs-intro p:not(.label) { grid-column: 1 / span 11; max-width: none; font-size: clamp(30px, 3.6vw, 54px); line-height: 1.2; letter-spacing: var(--track-heading); }

  .lab-panel { position: fixed; left: 16px; bottom: 16px; z-index: 200; width: 290px; padding: 12px 14px 14px; border-radius: 18px;
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
  .lab-seg button { padding: 4px 9px; border-radius: 999px; color: var(--ink-2); }
  .lab-seg button[aria-pressed="true"] { color: var(--bg); background: var(--ink); }`;

  const build = () => {
    const style = document.createElement('style'); style.textContent = css; document.head.append(style);
    const panel = document.createElement('div');
    panel.className = 'lab-panel'; panel.setAttribute('role', 'region'); panel.setAttribute('aria-label', 'Design options');
    panel.innerHTML = '<div class="lab-head"><b>Options</b><span><button type="button" data-act="min">Hide</button><button type="button" data-act="exit">Close</button></span></div>'
      + opts.map((o) => `<div class="lab-row"><span>${o.label}</span><div class="lab-seg">${o.choices.map(([v, t]) =>
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
  if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
})();
