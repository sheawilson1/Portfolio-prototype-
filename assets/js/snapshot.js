/* Smoking Snapshot case study: the chapter rail, the phone that follows the steps, and the day by day chart.
   site.js runs the nav, theme, tip, reveal, count-up and cards. */
(() => {
  const queue = (fn) => { let q = false; return () => { if (!q) { q = true; requestAnimationFrame(() => { q = false; fn(); }); } }; };

  /* ── Rail: the chapter you're reading is the one lit ── */
  const links = [...document.querySelectorAll('.sn-rail a')];
  const chapters = links.map((a) => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  if (chapters.length) {
    const pick = () => {
      let on = chapters[0];
      chapters.forEach((ch) => { if (ch.getBoundingClientRect().top < innerHeight * .34) on = ch; });
      links.forEach((a) => {
        const is = a.getAttribute('href') === `#${on.id}`;
        a.classList.toggle('is-on', is);
        if (is) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      });
    };
    addEventListener('scroll', queue(pick), { passive: true });
    addEventListener('resize', pick);
    pick();
  }

  /* ── How it works: the step nearest the middle of the screen picks the phone's screen ── */
  const steps = [...document.querySelectorAll('.sn-step')];
  const screens = [...document.querySelectorAll('.sn-phone img')];
  if (steps.length && screens.length) {
    let current = -1;
    const pick = () => {
      const mid = innerHeight / 2;
      let best = 0, dist = Infinity;
      steps.forEach((s, i) => {
        const r = s.getBoundingClientRect();
        const d = Math.abs(r.top + r.height / 2 - mid);
        if (d < dist) { dist = d; best = i; }
      });
      if (best === current) return;
      current = best;
      steps.forEach((s, i) => s.classList.toggle('is-on', i === best));
      screens.forEach((img, i) => img.classList.toggle('is-on', i === best));
    };
    addEventListener('scroll', queue(pick), { passive: true });
    addEventListener('resize', pick);
    pick();
  }

  /* ── Snapshots per day, 25 July to 29 August, from the final campaign report ── */
  const plot = document.querySelector('.sn-days-plot');
  if (!plot) return;
  const counts = [88, 13, 8, 10, 6, 6, 9, 8, 5, 9, 4, 3, 15, 8, 8, 10, 10, 18, 22, 26, 28, 22, 18, 21, 42, 33, 115, 61, 58, 83, 3, 42, 39, 19, 27, 25];
  const start = new Date(2026, 6, 25);
  const marks = {
    0: { name: 'Liverpool Pride', short: 'Pride', edge: 'start' },
    26: { name: 'Busiest day', short: 'Busiest' },
    29: { name: 'Warrington Wolves', short: 'Wolves' },
  };
  const events = { 0: 'Liverpool Pride', 1: 'Wirral Food Festival', 29: 'Warrington Wolves' };
  const max = 140, n = counts.length, gap = 3;
  const dayOf = (i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
  const short = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const long = (d) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  // The centre of bar i, as a CSS length along the plot
  const at = (i, edge = .5) => `calc((100% - ${(n - 1) * gap}px) / ${n} * ${i + edge} + ${i * gap}px)`;

  const root = plot.closest('.sn-days');
  root.style.setProperty('--max', max);
  plot.querySelectorAll('.sn-days-grid span').forEach((s) => { s.dataset.y = s.style.getPropertyValue('--y'); });

  const bars = plot.querySelector('.sn-days-bars');
  bars.innerHTML = counts.map((v, i) => {
    const m = marks[i];
    const label = m ? `<span class="sn-day-label${m.edge ? ` is-${m.edge}` : ''}"><b>${v}</b><span class="sn-l">${m.name}</span><span class="sn-s">${m.short}</span></span>` : '';
    return `<span class="sn-day${m ? ' is-mark' : ''}" style="--v:${v}; --i:${i}"><i></i>${label}</span>`;
  }).join('');

  // 6 August: the save moved up to the reactions
  const marker = document.createElement('span');
  marker.className = 'sn-days-marker';
  marker.style.left = at(12, 0);
  marker.innerHTML = '<span>Earlier saves from 6 Aug</span>';
  marker.setAttribute('aria-hidden', 'true');
  plot.append(marker);

  const axis = root.querySelector('.sn-days-axis');
  axis.innerHTML = [0, 7, 14, 21, 28, 35].map((i) => {
    const pos = i === 0 ? `left:0` : i === n - 1 ? `right:0; translate:0 0` : `left:${at(i)}`;
    return `<span style="${pos}">${short(dayOf(i))}</span>`;
  }).join('');

  root.querySelector('tbody').innerHTML = counts.map((v, i) =>
    `<tr><td>${long(dayOf(i))}${events[i] ? `, ${events[i]}` : ''}</td><td>${v}</td></tr>`).join('');

  // Hover or tap a day for its date, count and event
  const tip = plot.querySelector('.sn-days-tip');
  const days = [...bars.children];
  let hot = null;
  const show = (e) => {
    const r = bars.getBoundingClientRect();
    const i = Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left) / (r.width / n))));
    if (hot !== days[i]) {
      hot?.classList.remove('is-hover');
      hot = days[i];
      hot.classList.add('is-hover');
      const v = counts[i];
      tip.innerHTML = `<b>${long(dayOf(i))}</b>${v} snapshot${v === 1 ? '' : 's'}${events[i] ? `, ${events[i]}` : ''}`;
    }
    const b = hot.firstElementChild.getBoundingClientRect(), p = plot.getBoundingClientRect();
    const half = tip.offsetWidth / 2;
    const x = Math.max(half, Math.min(p.width - half, b.left - p.left + b.width / 2));
    tip.style.left = `${x}px`;
    tip.style.top = `${Math.max(tip.offsetHeight, b.top - p.top - 12)}px`;
    tip.classList.add('is-on');
  };
  const hide = () => { hot?.classList.remove('is-hover'); hot = null; tip.classList.remove('is-on'); };
  bars.addEventListener('pointermove', show);
  bars.addEventListener('pointerdown', show);
  bars.addEventListener('pointerleave', hide);
})();
