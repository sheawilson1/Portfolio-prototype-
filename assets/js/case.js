/* Case study extras. site.js runs the nav, theme, tip, reveal and cards; this adds the pieces only these pages have. */
(() => {
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── Squircle clip for live media ──
     A WebGL canvas or a playing video gets its own compositor layer, and while scrolling the compositor
     clips it with plain rounded corners instead of a squircle, so the corners flicker. The media sits
     outside the card's clip and gets a squircle path of its own, which the compositor keeps exactly. */
  const squircle = (w, h, r) => {
    r = Math.min(r, w / 2, h / 2);
    const n = 12, pts = [];
    // One quarter of a superellipse with exponent 4, which is what corner-shape: squircle draws.
    const corner = (cx, cy, sx, sy, from) => {
      for (let i = 0; i <= n; i++) {
        const t = (from + i / n) * Math.PI / 2;
        const c = Math.abs(Math.cos(t)) ** .5, s = Math.abs(Math.sin(t)) ** .5;
        pts.push(`${(cx + sx * c * r).toFixed(1)} ${(cy + sy * s * r).toFixed(1)}`);
      }
    };
    corner(w - r, r, 1, -1, 0);      // top right
    corner(r, r, -1, -1, 1);         // top left
    corner(r, h - r, -1, 1, 2);      // bottom left
    corner(w - r, h - r, 1, 1, 3);   // bottom right
    return `path('M ${pts.join(' L ')} Z')`;
  };
  if (CSS.supports('corner-shape', 'squircle')) {
    document.querySelectorAll('.stage > .stage-media').forEach((el) => {
      const card = el.parentElement.querySelector('.card');
      const fit = () => {
        const cs = getComputedStyle(card);
        const r = parseFloat(cs.borderTopLeftRadius) - parseFloat(cs.borderTopWidth);
        el.style.clipPath = squircle(el.clientWidth, el.clientHeight, r);
        el.classList.add('is-clipped');
      };
      new ResizeObserver(fit).observe(el);
    });
  }

  /* ── Cipher: scrolling through the section scrolls the site inside the browser window ── */
  const browse = document.querySelector('.browse');
  if (browse) {
    const screen = browse.querySelector('.browser-screen');
    const page = browse.querySelector('.browser-page');
    let queued = false;
    const update = () => {
      queued = false;
      const r = browse.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, -r.top / Math.max(1, browse.offsetHeight - innerHeight)));
      const max = Math.max(0, page.offsetHeight - screen.offsetHeight);
      page.style.transform = `translate3d(0, ${(-p * max).toFixed(1)}px, 0)`;
    };
    const queue = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
    addEventListener('scroll', queue, { passive: true });
    addEventListener('resize', queue);
    if (page.complete) update(); else page.addEventListener('load', update);
  }

  /* ── Amp: the screens drift as you scroll past them, and the glow behind moves at its own pace ── */
  const shot = document.querySelector('.hero-shot[data-drift]');
  if (shot && !reduced) {
    const img = shot.querySelector('img');
    const blobs = [...shot.querySelectorAll('.blob')];
    let queued = false;
    const update = () => {
      queued = false;
      const off = root.dataset.labDrift === 'off';
      const r = shot.getBoundingClientRect();
      // -1 as it enters from below, 0 centred, 1 as it leaves at the top
      const p = Math.max(-1, Math.min(1, (innerHeight / 2 - (r.top + r.height / 2)) / ((r.height + innerHeight) / 2)));
      // Distances scale with the image, so the glow never wanders out of its own hero on a phone.
      const h = r.height;
      img.style.transform = off ? '' : `translate3d(0, ${(-p * h * .04).toFixed(1)}px, 0) rotate(${(-p * 3).toFixed(2)}deg)`;
      blobs.forEach((bl, i) => { bl.style.transform = off ? '' : `translate3d(0, ${(p * h * (.06 + i * .04)).toFixed(1)}px, 0)`; });
    };
    const queue = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
    addEventListener('scroll', queue, { passive: true });
    addEventListener('resize', queue);
    addEventListener('lab:change', queue);
    update();
  }

  /* ── Videos loop only while they are on screen ── */
  document.querySelectorAll('video[data-inview]').forEach((v) => {
    if (reduced) { v.controls = true; return; }
    new IntersectionObserver(([en]) => {
      if (en.isIntersecting) v.play().catch(() => {}); else v.pause();
    }, { threshold: .2 }).observe(v);
  });
})();
