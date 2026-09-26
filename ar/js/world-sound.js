// Sound for the walk, picked in the lab. Everything is made with Web Audio as it plays, so there's nothing to
// download. Each frame the walk says how fast the camera's moving, how far it went and which way it's turning;
// it also says when it's about to pass a pane, passes a stop, arrives at one, and when something's pointed at,
// pressed or the theme changes. Each pack answers those in its own way.

// Five-note scales and chords for the stops, start to "Let's talk." (MIDI note numbers)
const BELLS = [81, 84, 86, 88, 91, 93, 96, 98, 100];
const CHORDS = [
  [48, 55, 59, 62, 64], // start: C maj9
  [45, 52, 55, 59, 60], // Smoking Snapshot: A min9
  [41, 48, 52, 55, 57], // JumpStart: F maj9
  [43, 50, 52, 57, 59], // Heart Health: G 6/9
  [40, 47, 50, 54, 55], // Brain Dump: E min9
  [38, 50, 53, 57, 64], // Cipher: D min9
  [46, 53, 57, 60, 62], // Amp: B♭ maj9
  [41, 52, 55, 59, 60], // Captr: F maj7♯11
  [36, 52, 59, 62, 67], // Let's talk: C maj9, open
];
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

export function createSound() {
  let ctx = null, master = null, verb = null, voice = null, pack = 'off', meter = null, comp = null, muted = false;
  // 'ambient' mixes with whatever else is playing and keeps to the ringer switch; 'playback' plays through it
  let session = 'ambient';
  const buffers = {};

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain();
    master.gain.value = .9;
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = .004; comp.release.value = .25;
    master.connect(comp).connect(ctx.destination);
    // one shared room: a soft, dark tail
    verb = ctx.createConvolver();
    verb.buffer = impulse(3, 2.4);
    verb.connect(master);
    return ctx;
  }

  /* ───────── Materials ───────── */
  function noiseBuffer(kind) {
    if (buffers[kind]) return buffers[kind];
    const n = ctx.sampleRate * 3, buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w * .5;
      else if (kind === 'brown') { last = (last + .02 * w) / 1.02; d[i] = last * 3.5; }
      else {
        b0 = .99886 * b0 + w * .0555179; b1 = .99332 * b1 + w * .0750759; b2 = .969 * b2 + w * .153852;
        b3 = .8665 * b3 + w * .3104856; b4 = .55 * b4 + w * .5329522; b5 = -.7616 * b5 - w * .016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * .5362) * .11; b6 = w * .115926;
      }
    }
    return (buffers[kind] = buf);
  }
  function impulse(seconds, decay) {
    const rate = ctx.sampleRate, n = Math.floor(seconds * rate), buf = ctx.createBuffer(2, n, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = Math.floor(rate * .012); i < n; i++) {
        const t = i / n;
        lp += (Math.random() * 2 - 1 - lp) * (.18 + .5 * (1 - t)); // darker as it dies away
        d[i] = lp * (1 - t) ** decay;
      }
    }
    return buf;
  }
  // gain -> pan -> (dry, and some to the room)
  function outlet(pan = 0, send = 0, into = master) {
    const g = ctx.createGain();
    let head = g;
    if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); g.connect(p); head = p; }
    head.connect(into);
    if (send > 0) { const s = ctx.createGain(); s.gain.value = send; head.connect(s); s.connect(verb); }
    return g;
  }

  /* ───────── One-shots ───────── */
  // A tone with a quick attack and an exponential tail, optionally sliding in pitch
  function tone({ f, f2, type = 'sine', at = 0, a = .004, d = .4, gain = .1, pan = 0, send = 0, glide = null }) {
    const t = ctx.currentTime + at, o = ctx.createOscillator(), g = outlet(pan, send);
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + (glide ?? d * .6));
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + a);
    g.gain.exponentialRampToValueAtTime(.0001, t + a + d);
    o.connect(g);
    o.start(t); o.stop(t + a + d + .05);
  }
  // Filtered noise, its filter sweeping from f0 up to f1 at the peak and on to f2 as it fades
  function air({ kind = 'pink', type = 'bandpass', f0, f1, f2 = f0, q = .8, at = 0, peak = .1, d = .5, gain = .1, pan = 0, send = 0 }) {
    const t = ctx.currentTime + at, src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = outlet(pan, send);
    src.buffer = noiseBuffer(kind);
    flt.type = type; flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t);
    flt.frequency.exponentialRampToValueAtTime(f1, t + peak);
    flt.frequency.exponentialRampToValueAtTime(f2, t + peak + d);
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(gain, .0002), t + peak);
    g.gain.exponentialRampToValueAtTime(.0001, t + peak + d);
    src.connect(flt).connect(g);
    src.start(t, Math.random() * 2); src.stop(t + peak + d + .05);
  }
  // A struck piece of glass: partials that aren't whole multiples, the high ones dying first
  function chime(f, { at = 0, gain = .06, pan = 0, send = .6, d = 2 } = {}) {
    [[1, 1, 1], [2.756, .42, .55], [5.404, .2, .3], [8.933, .08, .18]].forEach(([k, g, dd]) =>
      tone({ f: f * k, at, a: .002, d: d * dd, gain: gain * g, pan, send }));
  }
  function click({ f = 2200, at = 0, gain = .06, pan = 0, body = 0 } = {}) {
    const j = 1 + (Math.random() - .5) * .12;
    tone({ f: f * j, type: 'triangle', at, a: .0008, d: .014, gain, pan });
    air({ kind: 'white', type: 'highpass', f0: 3200, f1: 3400, at, peak: .0015, d: .01, gain: gain * .9, pan });
    if (body) tone({ f: body * j, at, a: .002, d: .07, gain: gain * .9, pan });
  }

  /* ───────── A bed of sound that follows the speed ───────── */
  function bed({ kind = 'pink', type = 'bandpass', q = .7, send = .15 }) {
    const src = ctx.createBufferSource(), flt = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuffer(kind); src.loop = true;
    flt.type = type; flt.Q.value = q;
    g.gain.value = 0;
    let pan = null;
    src.connect(flt).connect(g);
    if (ctx.createStereoPanner) { pan = ctx.createStereoPanner(); g.connect(pan); pan.connect(master); } else g.connect(master);
    const s = ctx.createGain(); s.gain.value = send; (pan || g).connect(s); s.connect(verb);
    src.start();
    return {
      set(gain, freq, p = 0) {
        const t = ctx.currentTime;
        g.gain.setTargetAtTime(gain, t, .08);
        flt.frequency.setTargetAtTime(freq, t, .1);
        if (pan) pan.pan.setTargetAtTime(clamp(p, -.8, .8), t, .25);
      },
      stop() { const t = ctx.currentTime; g.gain.setTargetAtTime(0, t, .12); src.stop(t + .8); },
    };
  }
  function sub() {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 38; g.gain.value = 0;
    o.connect(g).connect(master); o.start();
    return {
      set(gain, f) { const t = ctx.currentTime; g.gain.setTargetAtTime(gain, t, .12); o.frequency.setTargetAtTime(f, t, .2); },
      stop() { const t = ctx.currentTime; g.gain.setTargetAtTime(0, t, .15); o.stop(t + 1); },
    };
  }
  // A soft chord, every voice gliding to its note in the next one
  function pad() {
    const flt = ctx.createBiquadFilter(), g = ctx.createGain();
    flt.type = 'lowpass'; flt.frequency.value = 900; flt.Q.value = .4;
    g.gain.value = 0;
    flt.connect(g).connect(master);
    const s = ctx.createGain(); s.gain.value = .55; g.connect(s); s.connect(verb);
    const voices = CHORDS[0].map((m) => {
      const pair = [['triangle', 0], ['sine', 7]].map(([type, cents]) => {
        const o = ctx.createOscillator(), og = ctx.createGain();
        o.type = type; o.frequency.value = hz(m); o.detune.value = cents; og.gain.value = type === 'sine' ? .008 : .006;
        o.connect(og).connect(flt); o.start();
        return o;
      });
      return pair;
    });
    g.gain.setTargetAtTime(1, ctx.currentTime, .9);
    let at = 0;
    return {
      chord(i) {
        if (i === at) return;
        at = i;
        const t = ctx.currentTime;
        CHORDS[i].forEach((m, k) => voices[k].forEach((o) => o.frequency.setTargetAtTime(hz(m), t, .28)));
      },
      set(x) { const t = ctx.currentTime; flt.frequency.setTargetAtTime(700 + 2200 * x, t, .2); g.gain.setTargetAtTime(.8 + .5 * x, t, .3); },
      top() { return CHORDS[at][4]; },
      stop() {
        const t = ctx.currentTime;
        g.gain.setTargetAtTime(0, t, .25);
        voices.flat().forEach((o) => o.stop(t + 1.6));
      },
    };
  }

  /* ───────── The packs ───────── */
  // x: how fast, 0 to 1. pan: which way it's turning.
  const PACKS = {
    // Wind past you, a breath as you arrive
    air: () => {
      const b = bed({ kind: 'pink', type: 'bandpass', q: .6, send: .18 });
      const hiss = bed({ kind: 'pink', type: 'highpass', q: .5, send: 0 });
      return {
        frame(x, pan) { b.set(.62 * x ** 1.35, 180 + 1500 * x, pan); hiss.set(.08 * x ** 1.6, 3200, pan); },
        flyby(k, pan, at) { air({ kind: 'pink', f0: 380, f1: 1900, f2: 520, q: .9, peak: Math.max(.08, at), d: .75, gain: .75 * k, pan, send: .25 }); },
        arrive() {
          air({ kind: 'pink', type: 'lowpass', f0: 900, f1: 600, f2: 300, q: .3, peak: .06, d: .5, gain: .16 });
          tone({ f: 1318.5, at: .04, a: .02, d: 1.5, gain: .03, send: .7 });
          tone({ f: 1975.5, at: .09, a: .02, d: 1.2, gain: .02, send: .7 });
        },
        hover() { air({ kind: 'white', type: 'highpass', f0: 5000, f1: 6000, peak: .004, d: .06, gain: .02 }); },
        tap() { air({ kind: 'white', f0: 2400, f1: 2600, q: 1.2, peak: .002, d: .035, gain: .06 }); },
        theme(on) { air({ kind: 'pink', f0: on ? 2400 : 300, f1: 1100, f2: on ? 280 : 2600, q: .8, peak: .35, d: .8, gain: .12, send: .4 }); },
        stop() { b.stop(); hiss.stop(); },
      };
    },
    // Glassy air, and each stop rings its own note
    glass: () => {
      const b = bed({ kind: 'white', type: 'bandpass', q: 1.1, send: .3 });
      return {
        frame(x, pan) { b.set(.11 * x ** 1.2, 3000 + 3400 * x, pan); },
        flyby(k, pan, at) { air({ kind: 'white', f0: 1800, f1: 6500, f2: 2600, q: 1.4, peak: Math.max(.06, at), d: .4, gain: .25 * k, pan, send: .35 }); },
        pass(i) { tone({ f: hz(BELLS[i]) * 2, a: .002, d: .3, gain: .02, send: .6 }); },
        arrive(i) { chime(hz(BELLS[i]), { gain: .09, send: .65, d: 2.2 }); },
        hover() { tone({ f: 4186, a: .001, d: .09, gain: .02, send: .3 }); },
        tap() { tone({ f: 3136, a: .001, d: .06, gain: .026, send: .2 }); },
        theme(on) { chime(hz(on ? 76 : 88), { gain: .04 }); chime(hz(on ? 88 : 76), { at: .14, gain: .035 }); },
        stop() { b.stop(); },
      };
    },
    // Low and cinematic: a rumble under the speed, a soft boom as you land
    deep: () => {
      const b = bed({ kind: 'brown', type: 'lowpass', q: .7, send: .12 });
      const s = sub();
      return {
        frame(x, pan) { b.set(.2 * x ** 1.2, 90 + 700 * x, pan * .6); s.set(.06 * x ** 1.5, 36 + 24 * x); },
        flyby(k, pan, at) { air({ kind: 'brown', type: 'lowpass', f0: 160, f1: 1200, f2: 220, q: 1, peak: Math.max(.1, at), d: .95, gain: .21 * k, pan, send: .3 }); },
        pass() { tone({ f: 72, f2: 50, a: .01, d: .45, gain: .05 }); },
        arrive() {
          tone({ f: 118, f2: 44, a: .006, d: 1.1, gain: .11, send: .4, glide: .45 });
          air({ kind: 'brown', type: 'lowpass', f0: 500, f1: 320, f2: 120, q: .5, peak: .01, d: .35, gain: .08, send: .3 });
        },
        hover() { tone({ f: 220, a: .004, d: .09, gain: .025 }); },
        tap() { tone({ f: 170, f2: 120, a: .002, d: .08, gain: .06 }); },
        theme(on) { tone({ f: on ? 60 : 90, f2: on ? 90 : 60, a: .2, d: 1, gain: .1, send: .5, glide: .8 }); },
        stop() { b.stop(); s.stop(); },
      };
    },
    // Detents, like a dial: a tick every metre or so, a heavier one at each stop, a clunk as you land
    tick: () => {
      let travelled = 0, last = 0;
      return {
        frame(x, pan, metres) {
          travelled += metres;
          const now = ctx.currentTime;
          if (travelled > 1.15 && now - last > .03) {
            travelled %= 1.15; last = now;
            click({ gain: .038 + .022 * x, pan: pan * .4 });
          }
        },
        pass() { click({ f: 950, gain: .07, body: 170 }); },
        arrive() { click({ f: 720, gain: .055 }); click({ f: 520, at: .038, gain: .05, body: 110 }); },
        hover() { click({ f: 2600, gain: .025 }); },
        tap() { click({ f: 1500, gain: .06 }); },
        theme() { click({ f: 900, gain: .07 }); click({ f: 1300, at: .06, gain: .06 }); },
        stop() {},
      };
    },
    // A soundtrack: each stop has its own chord, and the pad glides between them as you walk
    score: () => {
      const p = pad();
      const b = bed({ kind: 'pink', type: 'bandpass', q: .7, send: .3 });
      const pluck = (m, opts = {}) => tone({ f: hz(m), type: 'triangle', a: .003, d: 1.6, gain: .045, send: .7, ...opts });
      return {
        frame(x, pan) { p.set(x); b.set(.07 * x ** 1.4, 300 + 1200 * x, pan); },
        flyby(k, pan, at) { air({ kind: 'pink', f0: 500, f1: 1700, f2: 600, q: 1, peak: Math.max(.08, at), d: .6, gain: .1 * k, pan, send: .4 }); },
        pass(i) { p.chord(i); },
        arrive(i) { p.chord(i); pluck(p.top() + 12); pluck(p.top() + 19, { at: .11, gain: .03 }); },
        hover() { pluck(p.top() + 24, { gain: .016, d: .7 }); },
        tap() { pluck(p.top() + 12, { gain: .022, d: .5 }); },
        theme(on) { pluck(p.top() + (on ? 7 : 12), { gain: .03 }); },
        stop() { p.stop(); b.stop(); },
      };
    },
  };

  /* ───────── The switch ───────── */
  function start() {
    if (muted || !ensure()) return;
    try { if (navigator.audioSession) navigator.audioSession.type = session; } catch (e) {}
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    if (!voice && PACKS[pack]) voice = PACKS[pack]();
  }
  const live = () => !!(voice && ctx && ctx.state === 'running' && !muted);
  // (a sound that can't be made is skipped, never allowed to stop the walk)
  const call = (name, ...args) => { if (!live() || !voice[name] || !args.every((a) => a === undefined || Number.isFinite(a) || typeof a === 'boolean')) return; try { voice[name](...args); } catch (e) {} };

  return {
    get pack() { return pack; },
    get state() { return ctx ? ctx.state : 'none'; },
    get muted() { return muted; },
    // Someone who's switched it off here; the pack stays chosen for when they switch it back
    mute(on) {
      muted = on;
      if (!ctx) { if (!on) start(); return; }
      master.gain.setTargetAtTime(on ? 0 : .9, ctx.currentTime, .06);
      if (!on) start();
    },
    // iPhones: 'playback' plays even with the ringer switched off (for the lab, where someone chose to hear it)
    session(type) { session = type; },
    // For testing: the level coming out, in dB below full scale
    level() {
      if (!ctx) return null;
      if (!meter) { meter = ctx.createAnalyser(); meter.fftSize = 2048; comp.connect(meter); }
      const d = new Float32Array(meter.fftSize);
      meter.getFloatTimeDomainData(d);
      let peak = 0, sum = 0;
      for (const x of d) { peak = Math.max(peak, Math.abs(x)); sum += x * x; }
      const db = (v) => (v > 0 ? +(20 * Math.log10(v)).toFixed(1) : -120);
      return { peak: db(peak), rms: db(Math.sqrt(sum / d.length)) };
    },
    get on() { return pack !== 'off' && !muted; },
    // A new pack. Called from a tap on the lab, which is what lets the browser start the sound.
    set(name) {
      if (voice) { voice.stop(); voice = null; }
      pack = PACKS[name] ? name : 'off';
      if (pack !== 'off') start();
      else if (ctx && ctx.state === 'running') setTimeout(() => { if (pack === 'off') ctx.suspend(); }, 900);
    },
    // Any tap or key press: browsers only start sound after one
    wake() { if (pack !== 'off' && !muted && (!ctx || ctx.state !== 'running' || !voice)) start(); },
    pause() { if (ctx && ctx.state === 'running') ctx.suspend(); },
    resume() { if (pack !== 'off' && !muted && ctx) ctx.resume().catch(() => {}); },
    frame(speed, turn, metres) {
      if (!live() || !voice.frame || !Number.isFinite(speed + turn + metres)) return;
      const x = 1 - Math.exp(-Math.max(speed, 0) / 20);
      voice.frame(x, clamp(turn * .9, -1, 1), metres);
    },
    flyby: (k, pan, at) => call('flyby', clamp(k, 0, 1), pan, at),
    pass: (i) => call('pass', i),
    arrive: (i) => call('arrive', i),
    hover: () => call('hover'),
    tap: () => call('tap'),
    theme: (on) => call('theme', on),
  };
}
