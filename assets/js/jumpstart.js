/* JumpStart case study: the chapter rail and the version strip. site.js runs the nav, theme, tip, reveal and cards. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ── Rail: the chapter you're reading is the one lit, like the product's "This report" rail ── */
  const links = [...document.querySelectorAll('.js-rail a')];
  const chapters = links.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  if (chapters.length) {
    const pick = () => {
      // The last chapter whose top has passed the upper third of the screen
      let on = chapters[0];
      chapters.forEach((ch) => { if (ch.getBoundingClientRect().top < innerHeight * .34) on = ch; });
      links.forEach((a) => {
        const is = a.getAttribute('href') === `#${on.id}`;
        a.classList.toggle('is-on', is);
        if (is) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      });
    };
    let queued = false;
    addEventListener('scroll', () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; pick(); }); } }, { passive: true });
    addEventListener('resize', pick);
    pick();
  }

  /* ── Version strip: arrows step a card at a time, and on desktop you can drag it ── */
  const strip = document.querySelector('.js-strip');
  if (!strip) return;
  const arrows = [...document.querySelectorAll('.js-arrow')];
  const step = () => {
    const card = strip.querySelector('.js-v');
    return card ? card.getBoundingClientRect().width + parseFloat(getComputedStyle(strip).columnGap || 22) : 400;
  };
  const sync = () => {
    const max = strip.scrollWidth - strip.clientWidth - 2;
    arrows.forEach((b) => { b.disabled = +b.dataset.dir < 0 ? strip.scrollLeft <= 2 : strip.scrollLeft >= max; });
  };
  arrows.forEach((b) => b.addEventListener('click', () => {
    strip.scrollBy({ left: +b.dataset.dir * step(), behavior: reduced ? 'auto' : 'smooth' });
  }));
  strip.addEventListener('scroll', sync, { passive: true });
  addEventListener('resize', sync);
  sync();

  strip.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    strip.scrollBy({ left: (e.key === 'ArrowRight' ? 1 : -1) * step(), behavior: reduced ? 'auto' : 'smooth' });
  });

  if (!fine) return;
  let drag = null;
  strip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { x: e.clientX, left: strip.scrollLeft, moved: false, id: e.pointerId };
  });
  strip.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) > 5) { drag.moved = true; strip.classList.add('is-dragging'); strip.setPointerCapture(drag.id); }
    if (drag.moved) strip.scrollLeft = drag.left - dx;
  });
  const end = () => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    if (!moved) return;
    // Let go, then settle on the nearest card
    const s = step(), to = Math.round(strip.scrollLeft / s) * s;
    strip.classList.remove('is-dragging');
    strip.scrollTo({ left: to, behavior: reduced ? 'auto' : 'smooth' });
  };
  strip.addEventListener('pointerup', end);
  strip.addEventListener('pointercancel', end);
})();
