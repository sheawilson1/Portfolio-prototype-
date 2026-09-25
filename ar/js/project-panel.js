// The panel that opens when you tap a project: a bottom sheet on phones, a side panel on wider screens.
// One copy for every page in the lab. It builds its own markup; the page just calls open(id).
import { PROJECTS, asset } from './projects.js';

const icon = {
  close: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg>',
  prev: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 3.5L5.5 8l4.5 4.5"/></svg>',
  next: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5"/></svg>',
  go: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 6h7M6.5 3l3 3-3 3"/></svg>',
  out: '<svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.5l5-5M4.5 3.5h4v4"/></svg>',
};
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function projectPanel({ projects = PROJECTS, onChange = () => {} } = {}) {
  const el = document.createElement('aside');
  el.className = 'pp glass';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-labelledby', 'pp-name');
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `
    <div class="pp-grab" aria-hidden="true"></div>
    <div class="pp-head">
      <span class="pp-dot"></span><span class="label pp-label"></span>
      <button class="pp-icon" data-step="-1" type="button" aria-label="Previous project">${icon.prev}</button>
      <button class="pp-icon" data-step="1" type="button" aria-label="Next project">${icon.next}</button>
      <button class="pp-icon" data-close type="button" aria-label="Close">${icon.close}</button>
    </div>
    <div class="pp-scroll"><div class="pp-body"></div></div>
    <div class="pp-actions"></div>`;
  document.body.appendChild(el);
  const body = el.querySelector('.pp-body'), actions = el.querySelector('.pp-actions'), scroller = el.querySelector('.pp-scroll');
  let current = null;

  function render(p) {
    const d = p.details || {};
    el.style.setProperty('--tone', p.tone);
    el.querySelector('.pp-label').textContent = `${p.label} · ${p.status}`;
    const media = d.video
      ? `<div class="pp-media is-video"><video muted loop playsinline autoplay preload="auto" aria-hidden="true">${d.video.map(([src, type]) => `<source src="${asset(src)}" type="${type}">`).join('')}</video></div>`
      : d.media ? `<div class="pp-media">${d.media.map((src) => `<img src="${asset(src)}" alt="" decoding="async">`).join('')}</div>` : '';
    const stats = d.stats ? `<div class="pp-stats">${d.stats.map(([n, w]) => `<div><span class="pp-num">${esc(n)}</span><span class="pp-what">${esc(w)}</span></div>`).join('')}</div>` : '';
    const story = d.story ? `<div class="pp-story"><span class="label">${esc(d.story[0])}</span><p>${esc(d.story[1])}</p></div>` : '';
    const facts = d.facts ? `<dl class="pp-facts">${d.facts.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>` : '';
    body.innerHTML = `<h2 id="pp-name">${esc(p.name)}</h2><p class="pp-line">${esc(p.line)}</p>${media}${stats}${story}${facts}`;
    const main = p.external
      ? `<a class="btn is-primary" href="${p.href}" target="_blank" rel="noopener">Open live site${icon.out}</a>`
      : `<a class="btn is-primary" href="${p.href}">View case study${icon.go}</a>`;
    const live = d.live ? `<a class="btn" href="${d.live}" target="_blank" rel="noopener">Open live site${icon.out}</a>` : '';
    actions.innerHTML = main + live;
    scroller.scrollTop = 0;
    el.querySelector('.pp-media')?.scrollTo?.({ left: 0 });
  }

  function open(id) {
    const p = projects.find((x) => x.id === id);
    if (!p) return;
    const was = current;
    current = p;
    if (was !== p) render(p);
    el.classList.add('is-open');
    el.setAttribute('aria-hidden', 'false');
    el.querySelector('video')?.play().catch(() => {});
    onChange(p.id);
  }
  function close() {
    if (!current) return;
    el.querySelector('video')?.pause();
    current = null;
    el.classList.remove('is-open');
    el.setAttribute('aria-hidden', 'true');
    onChange(null);
  }
  function step(dir) {
    const i = projects.indexOf(current);
    open(projects[(i + dir + projects.length) % projects.length].id);
  }

  el.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-close')) close();
    else if (b.dataset.step) step(+b.dataset.step);
  });
  addEventListener('keydown', (e) => {
    if (!current) return;
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'ArrowLeft') step(-1);
  });

  // On a phone, pull the sheet down by its top edge to put it away
  let drag = null;
  el.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.pp-grab, .pp-head') || e.target.closest('button') || innerWidth >= 760) return;
    drag = { y: e.clientY, id: e.pointerId };
    el.setPointerCapture(e.pointerId);
    el.classList.add('is-dragging');
  });
  el.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    el.style.translate = `0 ${Math.max(0, e.clientY - drag.y)}px`;
  });
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y;
    drag = null;
    el.classList.remove('is-dragging');
    el.style.translate = '';
    if (dy > 70) close();
  };
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);

  return { el, open, close, step, get current() { return current?.id ?? null; }, get isOpen() { return !!current; } };
}
