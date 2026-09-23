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

  /* ── Nav: full name at the top, folds to SW inside the glass pill ── */
  const nav = document.querySelector('.nav');
  const onScroll = () => { nav.classList.toggle('is-scrolled', scrollY > 90); wake(); };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

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
      if (!item) { tip.classList.remove('is-on'); tipPos.on = false; return; }
      const link = item.matches('a') ? item : item.querySelector('a.card');
      const kind = !link ? 'soon' : link.target === '_blank' ? 'out' : 'in';
      tipText.textContent = item.dataset.cursor;
      tip.dataset.kind = kind;
      tip.querySelector('i').style.display = kind === 'soon' ? '' : 'none';
      tip.querySelector('.tip-arrow').style.display = kind === 'soon' ? 'none' : '';
      tip.querySelector('.tip-arrow').style.rotate = kind === 'in' ? '45deg' : '0deg';
      if (!tipPos.on) { tipPos.x = pointer.x; tipPos.y = pointer.y; }
      tipPos.on = true; tip.classList.add('is-on'); wake();
    });
    document.addEventListener('pointerleave', () => { tip.classList.remove('is-on'); tipPos.on = false; });
  }

  /* ── Hero ── */
  const hero = document.querySelector('.hero');
  const copy = hero.querySelector('.hero-copy');
  const eclipse = hero.querySelector('.eclipse');
  const disc = hero.querySelector('.disc');
  const corona = hero.querySelector('.corona');
  const slab = hero.querySelector('.slab');
  const lights = hero.querySelector('.lights');
  const floaters = [...hero.querySelectorAll('.fv')].map((el) => ({ el, depth: +el.dataset.depth || .6, side: 1 }));
  const measureSides = () => floaters.forEach((f) => { const r = f.el.getBoundingClientRect(); f.side = r.width && (r.left + r.width / 2) < innerWidth / 2 ? -1 : 1; });
  addEventListener('resize', measureSides);
  const hs = { px: 0, py: 0, exit: 0, inView: true };
  new IntersectionObserver((en) => { hs.inView = en[0].isIntersecting; if (hs.inView) wake(); }).observe(hero);

  hero.querySelectorAll('[data-palette]').forEach((a) => {
    const on = () => { hero.dataset.palette = a.dataset.palette; };
    const off = () => { delete hero.dataset.palette; };
    a.addEventListener('pointerenter', on); a.addEventListener('focus', on);
    a.addEventListener('pointerleave', off); a.addEventListener('blur', off);
  });

  function heroFrame() {
    if (!hs.inView) return false;
    let moving = false;
    const mode = root.dataset.hero;
    const exitT = clamp(scrollY / (hero.offsetHeight * .9), 0, 1);
    hs.exit = lerp(hs.exit, exitT, .18);
    if (Math.abs(hs.exit - exitT) > .001) moving = true;

    const nx = fine && pointer.seen ? clamp(pointer.x / innerWidth * 2 - 1, -1, 1) : 0;
    const ny = fine && pointer.seen ? clamp(pointer.y / innerHeight * 2 - 1, -1, 1) : 0;
    const px = lerp(hs.px, nx, .06), py = lerp(hs.py, ny, .06);
    if (Math.abs(px - hs.px) + Math.abs(py - hs.py) > .0005) moving = true;
    hs.px = px; hs.py = py;
    const ex = hs.exit;

    copy.style.transform = `translate3d(0, ${ex * -70}px, 0)`;
    copy.style.opacity = String(1 - ex * 1.3);

    if (mode === 'eclipse') {
      // The disc drifts against the pointer, so the brighter side of the ring follows you.
      disc.style.transform = `translate3d(${-px * 12}px, ${-py * 12}px, 0)`;
      corona.style.translate = `${px * 6}px ${py * 6}px`;
      eclipse.style.transform = `translate3d(0, ${ex * 16}vh, 0) scale(${1 - ex * .08})`;
    } else if (mode === 'glass') {
      slab.style.transform = `perspective(1600px) rotateX(${(-py * 3).toFixed(2)}deg) rotateY(${(px * 4).toFixed(2)}deg) translate3d(0, ${ex * -8}vh, 0)`;
      slab.style.opacity = String(1 - ex * .9);
      slab.style.setProperty('--sx', `${(px * .5 + .5) * slab.offsetWidth}px`);
      slab.style.setProperty('--sy', `${(py * .5 + .5) * slab.offsetHeight}px`);
      lights.style.transform = `translate3d(${px * -40}px, ${py * -30 + ex * 60}px, 0)`;
    } else if (mode === 'work') {
      // Nearer pieces move more; on scroll they drift outward and away.
      if (!floaters.sided) { measureSides(); floaters.sided = true; }
      floaters.forEach((f) => {
        const side = f.side, d = f.depth;
        f.el.style.transform = `translate3d(${(px * -34 * d + side * ex * 160 * d).toFixed(1)}px, ${(py * -26 * d - ex * 120 * d).toFixed(1)}px, 0)`;
        f.el.style.opacity = String(1 - ex * 1.1);
      });
    }
    return moving;
  }

  /* ── Glass cards: tilt, light behind the glass, sheen, rim light ── */
  const items = [...document.querySelectorAll('.item')].map((el) => ({
    el, card: el.querySelector('.card'), media: el.querySelector('.media'),
    blobs: [...el.querySelectorAll('.blob, .blob-img')], sheen: el.querySelector('.sheen'),
    tx: 0, ty: 0, x: 0, y: 0, sx: 0, sy: 0, hot: false,
  }));
  items.forEach((it) => {
    if (!fine || reduced) return;
    it.el.addEventListener('pointerenter', () => { it.hot = true; it.el.classList.add('is-hot'); wake(); });
    it.el.addEventListener('pointerleave', () => { it.hot = false; it.el.classList.remove('is-hot'); it.tx = 0; it.ty = 0; wake(); });
    it.el.addEventListener('pointermove', (e) => {
      const r = it.card.getBoundingClientRect();
      it.tx = clamp((e.clientX - r.left) / r.width - .5, -.5, .5);
      it.ty = clamp((e.clientY - r.top) / r.height - .5, -.5, .5);
      it.sx = e.clientX - r.left; it.sy = e.clientY - r.top;
      it.card.style.setProperty('--rx', `${it.sx}px`); it.card.style.setProperty('--ry', `${it.sy}px`);
    });
  });
  if (!fine) {
    const mid = new IntersectionObserver((en) => en.forEach((e) => e.target.classList.toggle('is-hot', e.isIntersecting)), { rootMargin: '-40% 0px -40% 0px' });
    items.forEach((it) => mid.observe(it.el));
  }

  function cardsFrame() {
    let moving = false;
    items.forEach((it) => {
      const nx = lerp(it.x, it.tx, .08), ny = lerp(it.y, it.ty, .08);
      if (Math.abs(nx - it.x) + Math.abs(ny - it.y) < .0004 && !it.hot) { it.x = it.tx; it.y = it.ty; return; }
      it.x = nx; it.y = ny; moving = true;
      if (it.media) it.media.style.transform = `perspective(1300px) rotateX(${(-it.y * 7).toFixed(2)}deg) rotateY(${(it.x * 9).toFixed(2)}deg)`;
      it.blobs.forEach((b, i) => { const k = 50 + i * 22; b.style.transform = `translate3d(${(it.x * k).toFixed(1)}px, ${(it.y * k * .8).toFixed(1)}px, 0)`; });
      if (it.sheen) it.sheen.style.transform = `translate3d(${it.sx}px, ${it.sy}px, 0)`;
    });
    return moving;
  }

  /* ── One loop ── */
  function wake() { if (!running) { running = true; requestAnimationFrame(frame); } }
  function frame() {
    const a = heroFrame(), b = cardsFrame();
    let c = false;
    if (tipPos.on) {
      tipPos.x = lerp(tipPos.x, pointer.x, .22); tipPos.y = lerp(tipPos.y, pointer.y, .22);
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

  /* ── Email: copy on click, magnetic on hover ── */
  const email = document.querySelector('.email');
  if (email) {
    const act = email.querySelector('.act');
    email.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(email.dataset.email); act.textContent = 'Copied'; email.classList.add('is-copied'); }
      catch (e) { location.href = `mailto:${email.dataset.email}`; return; }
      setTimeout(() => { act.textContent = 'Copy'; email.classList.remove('is-copied'); }, 2200);
    });
    if (fine && !reduced) {
      email.addEventListener('pointermove', (e) => {
        const r = email.getBoundingClientRect();
        email.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * .18}px, ${(e.clientY - r.top - r.height / 2) * .3}px)`;
      });
      email.addEventListener('pointerleave', () => { email.style.transition = 'transform .8s var(--ease), box-shadow .8s var(--ease)'; email.style.transform = ''; setTimeout(() => { email.style.transition = ''; }, 800); });
    }
  }

  /* ── Preview options (only shown with ?lab) ── */
  document.querySelectorAll('.lab-set').forEach((set) => {
    const key = set.dataset.set;
    const buttons = [...set.querySelectorAll('button')];
    const sync = () => buttons.forEach((b) => b.setAttribute('aria-pressed', String(root.dataset[key] === b.dataset.v)));
    buttons.forEach((b) => b.addEventListener('click', () => {
      root.dataset[key] = b.dataset.v; floaters.sided = false;
      try { localStorage.setItem(key, b.dataset.v); } catch (e) {}
      sync(); wake();
    }));
    sync();
  });
})();
