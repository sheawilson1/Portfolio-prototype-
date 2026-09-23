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

  /* ── Theme: the umbra spreads out from the toggle ── */
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
    if (document.startViewTransition && !reduced) document.startViewTransition(apply); else apply();
  });

  /* ── Nav turns into a glass pill once you leave the top ── */
  const nav = document.querySelector('.nav');
  const onScroll = () => { nav.classList.toggle('is-scrolled', scrollY > 90); wake(); };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  /* ── Reveal ── */
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

  /* ── Cursor ── */
  const dot = document.querySelector('.cursor-dot');
  const ring = document.querySelector('.cursor-ring');
  const ringLabel = ring.querySelector('span');
  const cur = { x: pointer.x, y: pointer.y };
  if (fine && !reduced) {
    document.body.classList.add('has-cursor');
    document.addEventListener('pointerover', (e) => {
      const item = e.target.closest('[data-cursor]');
      const link = e.target.closest('a, button');
      document.body.classList.toggle('cursor-card', !!item);
      document.body.classList.toggle('cursor-link', !item && !!link);
      if (item) ringLabel.textContent = item.dataset.cursor;
    });
    document.addEventListener('pointerleave', () => { dot.style.opacity = ring.style.opacity = '0'; });
    document.addEventListener('pointerenter', () => { dot.style.opacity = ring.style.opacity = ''; });
  }

  /* ── Hero: letters, flare, parallax, palette ── */
  const hero = document.querySelector('.hero');
  const eclipse = hero.querySelector('.eclipse');
  const disc = hero.querySelector('.disc');
  const corona = hero.querySelector('.corona');
  const flare = hero.querySelector('.flare');
  const copy = hero.querySelector('.hero-copy');
  const h1 = hero.querySelector('[data-split]');

  // Split the headline into letters, keeping words together and the italic intact.
  const letters = [];
  (function split(node) {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === 3) {
        const frag = document.createDocumentFragment();
        child.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
          const w = document.createElement('span'); w.className = 'w';
          [...part].forEach((ch) => { const s = document.createElement('span'); s.className = 'ch'; s.textContent = ch; w.appendChild(s); letters.push({ el: s, x: 0, y: 0, cx: 0, cy: 0 }); });
          frag.appendChild(w);
        });
        child.replaceWith(frag);
      } else if (child.nodeType === 1) split(child);
    });
  })(h1);
  h1.setAttribute('aria-label', h1.textContent.replace(/\s+/g, ' ').trim());
  [...h1.children].forEach((c) => c.setAttribute('aria-hidden', 'true'));

  const measure = () => {
    letters.forEach((l) => { l.el.style.transform = 'none'; });
    letters.forEach((l) => { const r = l.el.getBoundingClientRect(); l.cx = r.left + r.width / 2; l.cy = r.top + r.height / 2 + scrollY; });
    const er = eclipse.getBoundingClientRect(); geo.r = er.width / 2; geo.cx = er.left + er.width / 2; geo.cy = er.top + er.height / 2 + scrollY;
  };
  const geo = { r: 400, cx: 0, cy: 0 };
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(measure);
  addEventListener('resize', () => { measure(); wake(); });

  const hs = { angle: -40, par: 0, parY: 0, exit: 0, inView: true, t: 0 };
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
    const h = hero.offsetHeight;
    const exitT = clamp(scrollY / (h * .9), 0, 1);
    hs.exit = lerp(hs.exit, exitT, .18);

    // Flare angle: follow the pointer around the rim, or orbit slowly when there is no pointer.
    const py = pointer.y + scrollY;
    let target;
    if (fine && pointer.seen) target = Math.atan2(py - geo.cy, pointer.x - geo.cx) * 180 / Math.PI;
    else { hs.t += .12; target = -40 + hs.t; }
    let d = ((target - hs.angle + 540) % 360) - 180;
    hs.angle += d * (reduced ? 1 : .07);
    if (Math.abs(d) > .05) moving = true;

    // Parallax: the moon drifts against the light, so the bright side follows you.
    const nx = fine ? clamp((pointer.x - geo.cx) / (innerWidth / 2), -1, 1) : 0;
    const ny = fine ? clamp((py - geo.cy) / (innerHeight / 2), -1, 1) : 0;
    const px = lerp(hs.par, nx, .06), pyy = lerp(hs.parY, ny, .06);
    if (Math.abs(px - hs.par) + Math.abs(pyy - hs.parY) > .0005) moving = true;
    hs.par = px; hs.parY = pyy;

    const rad = hs.angle * Math.PI / 180;
    flare.style.transform = `translate3d(${Math.cos(rad) * geo.r}px, ${Math.sin(rad) * geo.r}px, 0)`;
    disc.style.transform = `translate3d(${-px * 14}px, ${-pyy * 14}px, 0)`;
    corona.style.translate = `${px * 8}px ${pyy * 8}px`;
    eclipse.style.transform = `translate3d(0, ${hs.exit * 16}vh, 0) scale(${1 - hs.exit * .08})`;
    copy.style.transform = `translate3d(0, ${hs.exit * -70}px, 0)`;
    copy.style.opacity = String(1 - hs.exit * 1.3);
    if (Math.abs(hs.exit - exitT) > .001) moving = true;

    // Letters step aside from the cursor and drift back.
    if (fine && !reduced) {
      const R = 220, F = 40;
      letters.forEach((l) => {
        const dx = l.cx - pointer.x, dy = (l.cy - scrollY) - pointer.y;
        const dist = Math.hypot(dx, dy);
        let tx = 0, ty = 0;
        if (dist < R && dist > .01) { const f = (1 - dist / R) ** 2 * F; tx = dx / dist * f; ty = dy / dist * f; }
        l.x = lerp(l.x, tx, .14); l.y = lerp(l.y, ty, .14);
        if (Math.abs(l.x - tx) + Math.abs(l.y - ty) > .05) moving = true;
        l.el.style.transform = `translate3d(${l.x.toFixed(2)}px, ${l.y.toFixed(2)}px, 0)`;
      });
    }
    return moving || !fine;
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
  // Touch: light up whichever card sits in the middle of the screen.
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
    if (fine && !reduced) {
      cur.x = lerp(cur.x, pointer.x, .2); cur.y = lerp(cur.y, pointer.y, .2);
      dot.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0)`;
      ring.style.transform = `translate3d(${cur.x}px, ${cur.y}px, 0)`;
      c = Math.abs(cur.x - pointer.x) + Math.abs(cur.y - pointer.y) > .1;
    }
    if (a || b || c) requestAnimationFrame(frame); else running = false;
  }
  wake();

  /* ── Brain Dump runs through the app while it is on screen ── */
  const brain = document.querySelector('.t-brain');
  if (brain) {
    const shots = [...brain.querySelectorAll('.phone-screen img')];
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
})();
