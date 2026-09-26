// The lab: switches for trying the walk different ways. Motion, the cards, the glass and sound, each with what's
// live marked. Choices are kept in this browser and in the address, so a link opens the same combination.
// It only shows with ?lab (and ?lab=0 hides it again in that browser).

// Rows still being decided come first; the rest are locked in and folded away under them.
export const LAB = {
  motion: {
    name: 'Motion', key: 'm', live: 'glide',
    options: [
      ['glide', 'Glide', 'What’s live: one swipe, one stop. A gentle arc at eye height that turns towards the next card the whole way, never away from it.'],
      ['swoop', 'Swoop', 'Lifts up over the way and swoops down into the next card.'],
      ['sweep', 'Sweep', 'Swings round the next card in a wide arc, keeping it in view.'],
      ['dive', 'Dive', 'Climbs high enough to see the route ahead, then dives down to the next card.'],
      ['spring', 'Spring', 'The first live version: the scroll drives it, and it rolls on to a stop when you let go.'],
    ],
  },
  pace: {
    name: 'Pace', key: 'p', live: 'brisk',
    options: [
      ['brisk', 'Brisk', 'What’s live: about a fifth quicker between stops.'],
      ['steady', 'Steady', 'About a second and a half from one card to the next.'],
      ['slow', 'Slow', 'About a third slower, with a longer landing.'],
    ],
  },
  info: {
    name: 'Info', key: 'i', live: 'close', wide: true,
    options: [
      ['close', 'Close', 'What’s live: the camera closer so the card fills more of the screen, the words in the corner. (Phones keep their own.)'],
      ['corner', 'Corner', 'The words in the bottom corner, the card a little further off.'],
      ['beside', 'Beside', 'The words right next to the card, moving with it.'],
    ],
  },
  hint: {
    name: 'Hint', key: 'h', live: 'next', done: true,
    options: [
      ['off', 'Off', 'Nothing beyond the dashes at the bottom.'],
      ['nudge', 'Nudge', 'After a few seconds still, the next arrow pulses.'],
      ['next', 'Next up', 'What’s live: after a few seconds still, the next arrow opens up to say where it goes.'],
    ],
  },
  card: {
    name: 'Cards', key: 'c', live: 'open', done: true,
    options: [
      ['layered', 'Layered', 'The screens stand off the glass at different depths.'],
      ['tall', 'Tall', 'The first build’s small cards, in taller frames.'],
      ['flat', 'Flat', 'Every screen lies on the glass, square to it.'],
      ['deep', 'Deep', 'The screens stand well off the glass.'],
      ['open', 'Open', 'What’s live: no glass at all. The screens hang in the air in front of their light.'],
    ],
  },
  glass: {
    name: 'Glass', key: 'g', live: 'smoked', done: true,
    options: [
      ['white', 'White', 'White frosted cards in daylight.'],
      ['smoked', 'Smoked', 'Smoked glass you can see the world through.'],
      ['clear', 'Clear', 'Barely tinted, with a bright edge.'],
      ['tinted', 'Tinted', 'Each project’s own colour.'],
      ['ink', 'Ink', 'Black glass in daylight too.'],
    ],
  },
  edge: {
    name: 'Edge', key: 'e', live: 'sharp', done: true,
    options: [
      ['lit', 'Lit', 'A line of the corona’s light just inside the disc’s edge, and a glow beyond it.'],
      ['sharp', 'Sharp', 'What’s live: the disc straight against its corona, one clean line, as on the homepage.'],
      ['plain', 'Plain', 'Sharp, and the eclipse isn’t reflected in the floor either.'],
    ],
  },
  shadow: {
    name: 'Shadows', key: 'd', live: 'soft', done: true,
    options: [
      ['line', 'Line', 'A line on the floor at the foot of each card.'],
      ['soft', 'Soft', 'What’s live: under what’s really there, softer and fainter the higher the pictures float.'],
      ['off', 'Off', 'No shadows.'],
    ],
  },
  opening: {
    name: 'Opening', key: 'o', live: 'sky', done: true,
    options: [
      ['face', 'On the disc', 'The headline on the disc’s face, under the corona.'],
      ['sky', 'Above it', 'What’s live: like the homepage, the eclipse low in the frame and the headline in the sky above it.'],
    ],
  },
  ending: {
    name: 'Ending', key: 'n', live: 'face', done: true,
    options: [
      ['face', 'On the disc', 'What’s live: “Let’s talk.” on the disc’s face.'],
      ['sky', 'Above it', '“Let’s talk.” in the sky above a low eclipse.'],
      ['overview', 'Overview', 'Looking back down the whole walk, “Let’s talk.” above.'],
    ],
  },
  sound: {
    name: 'Sound', key: 's', live: 'deep', done: true,
    options: [
      ['off', 'Off', 'Silent.'],
      ['air', 'Air', 'Wind that rises with your speed.'],
      ['glass', 'Glass', 'A chime at every stop.'],
      ['deep', 'Deep', 'What’s live: a low rumble under the speed, deep whooshes, and a soft boom as you land.'],
      ['tick', 'Tick', 'Detents like a dial.'],
      ['score', 'Score', 'A chord for each stop.'],
    ],
  },
};
const STORE = 'world-lab';
const VERSION = 3; // choices saved under an older set of rows are dropped, so what's locked in shows

function read(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
function write(key, v) { try { if (v === null) localStorage.removeItem(key); else localStorage.setItem(key, v); } catch (e) {} }

export function createLab({ onChange = () => {}, onTap = () => {} } = {}) {
  const q = new URLSearchParams(location.search);
  let on;
  if (q.has('lab')) { on = q.get('lab') !== '0'; write(STORE + '-on', on ? '1' : '0'); }
  else on = read(STORE + '-on') === '1'; // everything's decided, so it only comes back with ?lab

  // What's live, unless the lab is on and says otherwise
  const settings = Object.fromEntries(Object.entries(LAB).map(([k, row]) => [k, row.live]));
  const valid = (k, v) => LAB[k].options.some(([id]) => id === v);
  if (on) {
    let saved = {};
    try { saved = JSON.parse(read(STORE) || '{}'); } catch (e) {}
    if (saved.v !== VERSION) saved = {};
    for (const k of Object.keys(LAB)) {
      const v = q.get(k) ?? saved[k];
      if (v && valid(k, v)) settings[k] = v;
    }
  }
  const api = { on, settings, el: null, set, isOver: () => false, dodge: () => {}, lock: () => {}, unlock: () => {} };
  if (!on) return api;

  /* ───────── The panel ───────── */
  const $ = (s, r = document) => r.querySelector(s);
  const rows = (which) => Object.entries(LAB).filter(which).map(([k, row]) => `
        <div class="lab-row${row.wide ? ' is-wide' : ''}" data-k="${k}">
          <p class="lab-name">${row.name}<kbd>${row.key.toUpperCase()}</kbd></p>
          <div class="lab-opts" role="group" aria-label="${row.name}">
            ${row.options.map(([id, label]) => `<button type="button" data-v="${id}" aria-pressed="false">${label}${id === row.live ? '<i class="lab-live" title="Live now"></i>' : ''}</button>`).join('')}
          </div>
        </div>`).join('');
  const wrap = document.createElement('div');
  wrap.className = 'lab';
  wrap.innerHTML = `
    <button class="lab-chip" id="lab-chip" type="button" aria-expanded="false" aria-controls="lab-panel">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.25 2h3.5M6.75 2v4.1L3.2 12.4A1.1 1.1 0 0 0 4.16 14h7.68a1.1 1.1 0 0 0 .96-1.6L9.25 6.1V2"/><path d="M4.6 10h6.8"/></svg>
      <span>Lab</span>
    </button>
    <section class="lab-panel" id="lab-panel" aria-label="Lab" hidden>
      <header class="lab-top">
        <p class="lab-title">Lab</p>
        <button class="lab-reset" type="button">Back to live</button>
        <button class="lab-close" type="button" aria-label="Close the lab"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8"/></svg></button>
      </header>
      ${rows(([, r]) => !r.done)}
      <details class="lab-done">
        <summary>Locked in <span>${Object.values(LAB).filter((r) => r.done).map((r) => r.name).join(', ')}</span></summary>
        ${rows(([, r]) => r.done)}
      </details>
      <p class="lab-note" aria-live="polite"><b></b><span></span></p>
      <p class="lab-foot"><i class="lab-live"></i> live now · the letters flip through each row · L hides this</p>
    </section>
    <p class="lab-toast" aria-live="polite"></p>`;
  const panel = $('.lab-panel', wrap), chip = $('.lab-chip', wrap), toast = $('.lab-toast', wrap), note = $('.lab-note', wrap);

  // In the top bar, first of the switches on the right
  document.querySelector('.bar-end').prepend(chip);
  document.body.append(wrap);
  api.el = wrap;
  api.isOver = (el) => !!(el && el.closest && (el.closest('.lab') || el.closest('.lab-chip')));

  function paint(k) {
    $(`.lab-row[data-k="${k}"]`, panel).querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === settings[k])));
  }
  // One line under the switches says what the last one you touched (or are pointing at) does
  let told = 'motion';
  const locked = {};
  function tell(k, v = settings[k]) {
    if (locked[k]) { $('b', note).textContent = `${LAB[k].name}: `; $('span', note).textContent = locked[k]; return; }
    const opt = LAB[k].options.find(([id]) => id === v);
    $('b', note).textContent = `${LAB[k].name}: ${opt[1]}${v === LAB[k].live ? ' (live)' : ''}. `;
    $('span', note).textContent = opt[2];
  }
  function save() {
    write(STORE, JSON.stringify({ ...settings, v: VERSION }));
    const u = new URL(location.href);
    for (const k of Object.keys(LAB)) { if (settings[k] === LAB[k].live) u.searchParams.delete(k); else u.searchParams.set(k, settings[k]); }
    history.replaceState(history.state, '', u);
  }
  let toastTimer = 0;
  function say(k) {
    if (!panel.hidden) return;
    const opt = LAB[k].options.find(([id]) => id === settings[k]);
    toast.textContent = `${LAB[k].name}: ${opt[1]}${settings[k] === LAB[k].live ? ' (live)' : ''}`;
    toast.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-on'), 1500);
  }
  function set(k, v, { quiet = false } = {}) {
    if (!valid(k, v) || settings[k] === v) return;
    settings[k] = v;
    paint(k);
    told = k; tell(k);
    save();
    if (!quiet) say(k);
    onChange(k, v);
  }
  function cycle(k, d) {
    if (locked[k]) { told = k; tell(k); return; }
    const ids = LAB[k].options.map(([id]) => id);
    set(k, ids[(ids.indexOf(settings[k]) + d + ids.length) % ids.length]);
  }
  function open(want = panel.hidden) {
    panel.hidden = !want;
    chip.setAttribute('aria-expanded', String(want));
    write(STORE + '-open', want ? '1' : '0');
    document.documentElement.classList.toggle('lab-open', want);
    if (want) { toast.classList.remove('is-on'); dodge(side, true); }
  }
  // On a wide screen the panel keeps to the side the pane isn't on (it waits while it's being pointed at)
  let side = 0, hovering = false;
  function dodge(s, now = false) {
    side = s;
    if (hovering && !now) return;
    panel.classList.toggle('is-left', side > 0);
  }
  panel.addEventListener('pointerenter', () => { hovering = true; });
  panel.addEventListener('pointerleave', () => { hovering = false; dodge(side); tell(told); });
  panel.addEventListener('pointerover', (e) => {
    const b = e.target.closest('.lab-opts button');
    if (b) tell(b.closest('.lab-row').dataset.k, b.dataset.v);
  });
  api.dodge = dodge;
  // A row that can't change here (motion, with reduced motion on)
  api.lock = (k, why) => {
    locked[k] = why;
    $(`.lab-row[data-k="${k}"]`, panel).classList.add('is-locked');
    $(`.lab-row[data-k="${k}"]`, panel).querySelectorAll('button').forEach((b) => { b.disabled = true; });
    if (told === k) tell(k);
  };
  api.unlock = (k) => {
    if (!locked[k]) return;
    delete locked[k];
    $(`.lab-row[data-k="${k}"]`, panel).classList.remove('is-locked');
    $(`.lab-row[data-k="${k}"]`, panel).querySelectorAll('button').forEach((b) => { b.disabled = false; });
    if (told === k) tell(k);
  };

  Object.keys(LAB).forEach(paint);
  tell(told);
  if (read(STORE + '-open') === '1') open(true);
  // A tap anywhere else puts it away
  addEventListener('pointerdown', (e) => { if (!panel.hidden && !api.isOver(e.target)) open(false); }, { passive: true });
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    onTap();
    if (b.classList.contains('lab-close')) { open(false); return; }
    if (b.classList.contains('lab-reset')) { for (const k of Object.keys(LAB)) set(k, LAB[k].live, { quiet: true }); return; }
    const row = b.closest('.lab-row');
    if (row && b.dataset.v) set(row.dataset.k, b.dataset.v, { quiet: true });
  });
  chip.addEventListener('click', () => { onTap(); open(); });
  addEventListener('keydown', (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.target.closest && e.target.closest('input, textarea, [contenteditable]')) return;
    const key = e.key.toLowerCase();
    if (key === 'l') { open(); return; }
    if (key === 'escape' && !panel.hidden) { open(false); return; }
    const k = Object.keys(LAB).find((r) => LAB[r].key === key);
    if (k) { e.preventDefault(); cycle(k, e.shiftKey ? -1 : 1); }
  });
  return api;
}
