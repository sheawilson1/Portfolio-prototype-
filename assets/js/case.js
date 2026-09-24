/* Case study extras. site.js runs the nav, theme, tip, reveal and cards; this adds the pieces only these pages have. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

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

  /* ── Videos loop only while they are on screen ── */
  document.querySelectorAll('video[data-inview]').forEach((v) => {
    if (reduced) { v.controls = true; return; }
    new IntersectionObserver(([en]) => {
      if (en.isIntersecting) v.play().catch(() => {}); else v.pause();
    }, { threshold: .2 }).observe(v);
  });
})();
