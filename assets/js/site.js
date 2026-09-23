/* sheawilson.uk interactions. Everything pointer-driven eases through one rAF loop,
   uses transforms only, and stops when nothing is moving. */
(() => {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  let running = false;

  const pointer = { x: innerWidth / 2, y: innerHeight / 2, seen: false };
  addEventListener('pointermove', (e) => { pointer.x = e.clientX; pointer.y = e.clientY; pointer.seen = true; wake(); }, { passive: true });

  /* ── Theme: a soft umbra spreads from the toggle over a page that has already finished changing ── */
  const toggle = document.querySelector('.theme-toggle');
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  const syncToggle = () => {
    const dark = root.dataset.theme === 'dark';
    toggle.setAttribute('aria-pressed', String(dark));
    toggle.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    metaTheme.setAttribute('content', dark ? '#05070b' : '#ffffff');
  };
  syncToggle();
  toggle.addEventListener('click', (e) => {
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    const apply = () => {
      if (next === 'dark') root.dataset.theme = 'dark'; else delete root.dataset.theme;
      try { localStorage.setItem('theme', next); } catch (err) {}
      syncToggle();
    };
    const r = toggle.getBoundingClientRect();
    root.style.setProperty('--vx', `${e.clientX || r.left + r.width / 2}px`);
    root.style.setProperty('--vy', `${e.clientY || r.top + r.height / 2}px`);
    if (!document.startViewTransition || reduced) { apply(); return; }
    root.classList.add('theme-switching');
    const vt = document.startViewTransition(apply);
    vt.finished.finally(() => root.classList.remove('theme-switching'));
  });

  /* ── Hero scene: the hero stays put while the disc rises and covers it ── */
  const scene = document.querySelector('.scene');
  const hero = document.querySelector('.hero');
  const copy = hero.querySelector('.hero-copy');
  const eclipse = hero.querySelector('.eclipse');
  const disc = hero.querySelector('.disc');
  const corona = hero.querySelector('.corona');
  const hs = { px: 0, py: 0, p: 0, target: 0, inView: true };
  const geo = { ty: -900, scale: 1, sceneTop: 0, sceneLen: 1 };
  new IntersectionObserver((en) => { hs.inView = en[0].isIntersecting; if (hs.inView) wake(); }).observe(hero);

  // Hovering a recent project borrows that project's colours for the ring.
  hero.querySelectorAll('[data-palette]').forEach((a) => {
    const on = () => { hero.dataset.palette = a.dataset.palette; };
    const off = () => { delete hero.dataset.palette; };
    a.addEventListener('pointerenter', on); a.addEventListener('focus', on);
    a.addEventListener('pointerleave', off); a.addEventListener('blur', off);
  });

  const nav = document.querySelector('.nav');
  const navInner = nav.querySelector('.nav-inner');
  const measure = () => {
    const w = navInner.clientWidth, pillW = Math.min(460, w);
    nav.style.setProperty('--pill-w', `${pillW}px`);
    nav.style.setProperty('--logo-shift', `${(w - pillW) / 2 + 20}px`);
    nav.style.setProperty('--links-shift', `${(w - pillW) / 2 + 8}px`);
    // Where the disc has to end up: centred on the screen and big enough to cover every corner.
    const H = hero.offsetHeight, W = innerWidth, R = disc.offsetWidth / 2;
    const halfDiag = Math.hypot(W / 2, H / 2) * 1.03;
    geo.scale = Math.max(1, halfDiag / R);
    geo.ty = H / 2 - (eclipse.offsetTop + R);
    geo.sceneTop = scene.offsetTop;
    geo.sceneLen = Math.max(1, scene.offsetHeight - innerHeight);
  };
  measure(); addEventListener('resize', () => { measure(); onScroll(); });
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(measure);

  let pill = false;
  function onScroll() {
    hs.target = reduced ? 0 : clamp((scrollY - geo.sceneTop) / geo.sceneLen, 0, 1);
    wake();
  }
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  const setPill = (on) => { if (on !== pill) { pill = on; nav.classList.toggle('is-scrolled', on); } };

  function heroFrame() {
    let moving = false;
    const p = lerp(hs.p, hs.target, .22);
    if (Math.abs(p - hs.target) > .0005) moving = true;
    hs.p = Math.abs(p - hs.target) < .0005 ? hs.target : p;
    const e = hs.p * hs.p * (3 - 2 * hs.p);
    // The pill forms once the disc has covered the hero, and only lets go well before it uncovers.
    if (!pill && (hs.p > .9 || scrollY > geo.sceneTop + geo.sceneLen + 10)) setPill(true);
    else if (pill && hs.p < .78 && scrollY < geo.sceneTop + geo.sceneLen) setPill(false);
    if (!hs.inView) return moving;

    const nx = fine && pointer.seen ? clamp(pointer.x / innerWidth * 2 - 1, -1, 1) : 0;
    const ny = fine && pointer.seen ? clamp(pointer.y / innerHeight * 2 - 1, -1, 1) : 0;
    const px = lerp(hs.px, nx, .06), py = lerp(hs.py, ny, .06);
    if (Math.abs(px - hs.px) + Math.abs(py - hs.py) > .0005) moving = true;
    hs.px = px; hs.py = py;
    const drift = 1 - e;
    const y = geo.ty * e, sc = 1 + (geo.scale - 1) * e;
    // The disc drifts against the pointer, so the brighter side of the ring follows you.
    disc.style.translate = `${(-px * 12 * drift).toFixed(2)}px ${(y - py * 8 * drift).toFixed(2)}px`;
    disc.style.scale = sc.toFixed(4);
    corona.style.translate = `${(px * 6 * drift).toFixed(2)}px ${(y + py * 4 * drift).toFixed(2)}px`;
    corona.style.scale = sc.toFixed(4);
    // The words ease back as the disc arrives.
    copy.style.transform = `translate3d(0, ${(-40 * e).toFixed(1)}px, 0) scale(${(1 - .07 * e).toFixed(4)})`;
    copy.style.opacity = String(1 - .55 * e);
    return moving;
  }

  /* ── Reveal and count-up ── */
  const io = new IntersectionObserver((entries) => entries.forEach((en) => {
    if (!en.isIntersecting) return;
    en.target.classList.add('in'); io.unobserve(en.target);
    en.target.querySelectorAll('[data-count]').forEach(countUp);
  }), { rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  function countUp(el) {
    const end = +el.dataset.count, suffix = el.dataset.suffix || '';
    const fmt = (v) => Math.round(v).toLocaleString('en-GB') + suffix;
    if (reduced) { el.textContent = fmt(end); return; }
    el.style.minWidth = `${el.offsetWidth}px`;
    const t0 = performance.now(), dur = 1600;
    const step = (t) => {
      const p = clamp((t - t0) / dur, 0, 1);
      el.textContent = fmt(end * (1 - Math.pow(1 - p, 4)));
      if (p < 1) requestAnimationFrame(step);
    };
    el.textContent = fmt(0); requestAnimationFrame(step);
  }

  /* ── Project tip: rides above the cursor, says where a click goes ── */
  const tip = document.querySelector('.tip');
  const tipText = tip.querySelector('.tip-text');
  const tipPos = { x: pointer.x, y: pointer.y, on: false };
  if (fine && !reduced) {
    document.addEventListener('pointerover', (e) => {
      const item = e.target.closest('[data-cursor]');
      if (!item) { clearTimeout(tipPos.t); tip.classList.remove('is-on'); tipPos.on = false; return; }
      const link = item.matches('a') ? item : item.querySelector('a.card');
      const kind = !link ? 'soon' : link.target === '_blank' ? 'out' : 'in';
      tipText.textContent = item.dataset.cursor;
      tip.querySelector('i').style.display = kind === 'soon' ? '' : 'none';
      tip.querySelector('.tip-arrow').style.display = kind === 'soon' ? 'none' : '';
      tip.querySelector('.tip-arrow').style.rotate = kind === 'in' ? '45deg' : '0deg';
      if (!tipPos.on) { tipPos.x = pointer.x; tipPos.y = pointer.y; }
      tipPos.on = true; wake();
      clearTimeout(tipPos.t); tipPos.t = setTimeout(() => { if (tipPos.on) tip.classList.add('is-on'); }, 220);
    });
    document.addEventListener('pointerleave', () => { tip.classList.remove('is-on'); tipPos.on = false; });
  }

  /* ── Glass cards: tilt with depth between layers, light behind the glass, lit border ── */
  // The card paints an opaque base (so it can light its own border), so its colour layer lives inside it too.
  document.querySelectorAll('.item').forEach((el) => {
    const bleed = el.querySelector(':scope > .bleed'), card = el.querySelector('.card');
    if (bleed && card) card.prepend(bleed.cloneNode(true));
  });
  const items = [...document.querySelectorAll('.item')].map((el) => ({
    el, card: el.querySelector('.card'), media: el.querySelector('.media'),
    blobs: [...el.querySelectorAll('.blob, .blob-img')],
    layers: [...el.querySelectorAll('[data-depth]')].map((l) => ({ el: l, d: +l.dataset.depth })),
    tx: 0, ty: 0, x: 0, y: 0, hot: false,
  }));
  items.forEach((it) => {
    if (!fine || reduced) return;
    it.el.addEventListener('pointerenter', () => { it.hot = true; it.el.classList.add('is-hot'); wake(); });
    it.el.addEventListener('pointerleave', () => { it.hot = false; it.el.classList.remove('is-hot'); it.tx = 0; it.ty = 0; wake(); });
    it.el.addEventListener('pointermove', (e) => {
      const r = it.el.getBoundingClientRect();
      it.tx = clamp((e.clientX - r.left) / r.width - .5, -.5, .5);
      it.ty = clamp((e.clientY - r.top) / r.height - .5, -.5, .5);
      it.el.style.setProperty('--rx', `${(e.clientX - r.left).toFixed(0)}px`);
      it.el.style.setProperty('--ry', `${(e.clientY - r.top).toFixed(0)}px`);
    });
  });

  function cardsFrame() {
    let moving = false;
    items.forEach((it) => {
      const nx = lerp(it.x, it.tx, .08), ny = lerp(it.y, it.ty, .08);
      if (Math.abs(nx - it.x) + Math.abs(ny - it.y) < .0004 && !it.hot) { it.x = it.tx; it.y = it.ty; return; }
      it.x = nx; it.y = ny; moving = true;
      if (it.media) it.media.style.transform = `perspective(1300px) rotateX(${(-it.y * 6).toFixed(2)}deg) rotateY(${(it.x * 8).toFixed(2)}deg)`;
      // Layers slide by their depth: back layers against the pointer, front layers with it.
      it.layers.forEach((l) => { l.el.style.translate = `${(it.x * 60 * l.d).toFixed(1)}px ${(it.y * 42 * l.d).toFixed(1)}px`; });
      it.blobs.forEach((b, i) => { const k = 50 + i * 22; b.style.transform = `translate3d(${(it.x * k).toFixed(1)}px, ${(it.y * k * .8).toFixed(1)}px, 0)`; });
    });
    return moving;
  }

  /* ── One loop ── */
  function wake() { if (!running) { running = true; requestAnimationFrame(frame); } }
  function frame() {
    const a = heroFrame(), b = cardsFrame();
    let c = false;
    if (tipPos.on) {
      tipPos.x = lerp(tipPos.x, pointer.x, .16); tipPos.y = lerp(tipPos.y, pointer.y, .16);
      tip.style.transform = `translate3d(${(tipPos.x + 16).toFixed(1)}px, ${(tipPos.y - 46).toFixed(1)}px, 0)`;
      c = Math.abs(tipPos.x - pointer.x) + Math.abs(tipPos.y - pointer.y) > .1;
    }
    if (a || b || c) requestAnimationFrame(frame); else running = false;
  }
  wake();

  /* ── Brain Dump runs through the app while it is on screen ── */
  const brain = document.querySelector('.t-brain');
  if (brain) {
    const shots = [...brain.querySelectorAll('.shots img')];
    const steps = [...brain.querySelectorAll('.steps i')];
    let i = 0, timer = null;
    const show = (n) => {
      shots.forEach((s, k) => s.classList.toggle('is-on', k === n));
      steps.forEach((s, k) => s.classList.toggle('is-on', k === n));
      brain.classList.toggle('is-listening', shots[n].hasAttribute('data-listen'));
    };
    new IntersectionObserver((en) => {
      if (en[0].isIntersecting && !reduced) { if (!timer) timer = setInterval(() => { i = (i + 1) % shots.length; show(i); }, 2600); }
      else { clearInterval(timer); timer = null; }
    }, { threshold: .35 }).observe(brain);
  }

  /* ── Contact: email opens the mail app, copy copies, a gentle pull on hover ── */
  const copyBtn = document.querySelector('.copy');
  if (copyBtn) {
    const label = copyBtn.querySelector('.copy-label');
    copyBtn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(copyBtn.dataset.email); } catch (e) { return; }
      label.textContent = 'Copied'; copyBtn.classList.add('is-copied');
      setTimeout(() => { label.textContent = 'Copy'; copyBtn.classList.remove('is-copied'); }, 2200);
    });
  }
  const email = document.querySelector('.email');
  if (email && fine && !reduced) {
    email.addEventListener('pointermove', (e) => {
      const r = email.getBoundingClientRect();
      email.style.transform = `translate(${((e.clientX - r.left - r.width / 2) * .08).toFixed(1)}px, ${((e.clientY - r.top - r.height / 2) * .14).toFixed(1)}px)`;
    });
    email.addEventListener('pointerleave', () => {
      email.style.transition = 'transform .7s var(--ease), box-shadow .6s var(--ease)'; email.style.transform = '';
      setTimeout(() => { email.style.transition = ''; }, 700);
    });
  }
})();
