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
  // Pages without the hero scene (case studies) still get the nav, theme, tip and cards.
  const scene = document.querySelector('.scene');
  const hero = scene && scene.querySelector('.hero');
  const copy = hero && hero.querySelector('.hero-copy');
  const eclipse = hero && hero.querySelector('.eclipse');
  const disc = hero && hero.querySelector('.disc');
  const corona = hero && hero.querySelector('.corona');
  const hs = { px: 0, py: 0, p: 0, target: 0, inView: true };
  const geo = { ty: -900, scale: 1, sceneTop: 0, sceneLen: 1, stop: 0 };
  const firstCard = hero && document.querySelector('#snapshot');
  // Layout position, ignoring transforms, so the card's reveal offset can't move the resting place.
  const docTop = (el) => { let t = 0; for (; el; el = el.offsetParent) t += el.offsetTop; return t; };

  /* ── Scroll feel, for choosing. ?scroll=glide|quick|soft|page|free sets how the intro settles, and
     ?travel=short|long how far you scroll through it. Glide is the default. Remove the others once chosen. ── */
  const qs = new URLSearchParams(location.search);
  const ease = {
    inOut: (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    sine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
    out: (t) => 1 - Math.pow(1 - t, 3),
  };
  const feels = {
    glide: { follow: .3, mode: 'direction', dur: [600, 1000], perPx: .35, ease: ease.inOut },   // eases on the way you were going
    quick: { follow: .45, mode: 'direction', dur: [360, 560], perPx: .18, ease: ease.out },     // snaps into place, the scene tracks tightly
    soft: { follow: .16, mode: 'direction', dur: [900, 1400], perPx: .5, ease: ease.sine },     // slow and floaty
    page: { follow: .3, mode: 'page', dur: [560, 900], perPx: .3, ease: ease.inOut, threshold: .22 }, // a nudge springs back, past a fifth it goes
    free: { follow: .3, mode: 'free' },                                                         // no settling at all
  };
  const feelName = feels[qs.get('scroll')] ? qs.get('scroll') : 'glide';
  const feel = feels[feelName];
  const travel = { short: ['70svh', '50svh'], long: ['150svh', '110svh'] }[qs.get('travel')];
  if (hero && travel) { scene.style.setProperty('--travel', travel[0]); document.querySelector('.work').style.setProperty('--overlap', travel[1]); }
  if (hero && (qs.has('scroll') || qs.has('travel'))) {
    const tag = document.createElement('div');
    tag.className = 'feel-tag';
    tag.textContent = `Scroll: ${feelName}${travel ? `, travel: ${qs.get('travel')}` : ''}`;
    document.body.append(tag);
  }
  if (hero) new IntersectionObserver((en) => { hs.inView = en[0].isIntersecting; if (hs.inView) wake(); }).observe(hero);

  // Hovering a recent project borrows that project's colours for the ring.
  if (hero) hero.querySelectorAll('[data-palette]').forEach((a) => {
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
    if (!hero) return;
    // Where the disc has to end up: centred on the screen and big enough to cover every corner.
    const H = hero.offsetHeight, W = innerWidth, R = disc.offsetWidth / 2;
    const halfDiag = Math.hypot(W / 2, H / 2) * 1.03;
    geo.scale = Math.max(1, halfDiag / R);
    geo.ty = H / 2 - (eclipse.offsetTop + R);
    geo.sceneTop = scene.offsetTop;
    geo.sceneLen = Math.max(1, scene.offsetHeight - innerHeight);
    if (firstCard) geo.stop = Math.max(geo.sceneTop + geo.sceneLen, docTop(firstCard) - nav.offsetHeight - 36);
  };
  measure(); addEventListener('resize', () => { measure(); onScroll(); });
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(measure);

  let pill = false;
  function onScroll() {
    hs.target = !hero ? 0 : reduced ? 0 : clamp((scrollY - geo.sceneTop) / geo.sceneLen, 0, 1);
    wake();
  }
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  const setPill = (on) => { if (on !== pill) { pill = on; nav.classList.toggle('is-scrolled', on); } };

  function heroFrame() {
    let moving = false;
    if (!hero) { setPill(scrollY > 80); return false; }
    const p = lerp(hs.p, hs.target, feel.follow);
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
    // The words come towards you and fade, as if you were moving through them into the page.
    copy.style.transform = `translate3d(0, ${(-24 * e).toFixed(1)}px, 0) scale(${(1 + .22 * e).toFixed(4)})`;
    copy.style.opacity = String(clamp(1 - 1.15 * e, 0, 1));
    return moving;
  }

  /* ── Settle: the intro has two resting places, the top and the first card under the nav.
     Scrolling is never blocked or taken over. When a scroll comes to rest between the two, the page
     glides on to one of them, and any wheel, touch, key or click stops the glide. ── */
  if (!reduced && firstCard && (feel.mode === 'direction' || feel.mode === 'page')) {
    const st = { lastY: scrollY, dir: 1, at: 0, touching: false, timer: 0, glide: 0, rest: scrollY };
    const stopGlide = () => { if (st.glide) { cancelAnimationFrame(st.glide); st.glide = 0; } };
    const glide = (to) => {
      const from = scrollY, dist = to - from, t0 = performance.now();
      const dur = clamp(feel.dur[0] + Math.abs(dist) * feel.perPx, feel.dur[0], feel.dur[1]);
      const step = (t) => {
        const k = clamp((t - t0) / dur, 0, 1);
        window.scrollTo({ top: from + dist * feel.ease(k), behavior: 'instant' });
        st.glide = k < 1 ? requestAnimationFrame(step) : 0;
      };
      stopGlide(); st.glide = requestAnimationFrame(step);
    };
    const settle = () => {
      const s = geo.stop, y = scrollY;
      if (st.glide || st.touching) return;
      if (y <= 1 || y >= s - 1) { st.rest = y; return; }
      // Direction: carry on the way you were going. Page: go on only if you moved far enough from where you started.
      let to = st.dir < 0 ? 0 : s;
      if (feel.mode === 'page' && (st.rest <= 1 || Math.abs(st.rest - s) <= 1)) {
        const fromTop = st.rest <= 1, moved = fromTop ? y : s - y;
        to = moved > s * feel.threshold ? (fromTop ? s : 0) : (fromTop ? 0 : s);
      }
      glide(to);
    };
    const hasEnd = 'onscrollend' in window;
    addEventListener('scroll', () => {
      const y = scrollY;
      if (Math.abs(y - st.lastY) > .5) st.dir = Math.sign(y - st.lastY);
      st.lastY = y; st.at = performance.now();
      // Browsers without scrollend: treat a short quiet spell as the end of the scroll.
      if (!hasEnd) { clearTimeout(st.timer); st.timer = setTimeout(settle, 140); }
    }, { passive: true });
    if (hasEnd) addEventListener('scrollend', settle);
    ['wheel', 'keydown', 'mousedown'].forEach((ev) => addEventListener(ev, stopGlide, { passive: true }));
    addEventListener('touchstart', () => { st.touching = true; stopGlide(); }, { passive: true });
    addEventListener('touchend', () => {
      st.touching = false;
      // A lift with no fling produces no further scroll, so check once it has had a moment to start.
      setTimeout(() => { if (performance.now() - st.at > 120) settle(); }, 160);
    }, { passive: true });
  }
  /* ── Videos loop only while they are on screen; with reduced motion they wait for a press ── */
  document.querySelectorAll('video[data-inview]').forEach((v) => {
    // Decorative loops (data-inview="ambient") just stay on their first frame.
    if (reduced) { if (v.dataset.inview !== 'ambient') v.controls = true; return; }
    new IntersectionObserver(([en]) => {
      if (en.isIntersecting) v.play().catch(() => {}); else v.pause();
    }, { threshold: .2 }).observe(v);
  });

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
      const link = item.matches('a') ? item : item.querySelector('a.card, a.card-link');
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
})();
