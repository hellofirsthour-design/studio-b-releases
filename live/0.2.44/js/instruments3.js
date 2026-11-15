/* ============ Ember (analog poly) and Vast (wavetable) ============ */
const PULSE_W = new Map();
function pulseWave(pw) { // a pulse of the given width as a band-limited periodic wave
  const k = Math.round(clamp(pw, 0.05, 0.95) * 20) / 20; if (PULSE_W.has(k)) return PULSE_W.get(k);
  const n = 128, re = new Float32Array(n), im = new Float32Array(n); for (let h = 1; h < n; h++) { re[h] = 2 / (h * Math.PI) * Math.sin(h * Math.PI * k) * Math.cos(h * Math.PI * k); im[h] = 2 / (h * Math.PI) * Math.sin(h * Math.PI * k) * Math.sin(h * Math.PI * k); }
  const w = ctx.createPeriodicWave(re, im); PULSE_W.set(k, w); return w;
}
const constSrc = (v, t) => { const c = ctx.createConstantSource(); c.offset.setValueAtTime(v, t); return c; };
function envOn(param, t, p, amt, base = 0) { param.setValueAtTime(base, t); param.linearRampToValueAtTime(base + amt, t + p.fA); param.setTargetAtTime(base + amt * p.fS, t + p.fA, Math.max(0.005, p.fD / 3)); }

/* --- Ember: analog poly --- */
class Ember extends PolyBase {
  constructor(t) { super(t); this.drv = ctx.createWaveShaper(); this.drv.oversample = '2x'; this.drv.connect(this.out); this.update(); }
  update() { super.update(); if (!this.drv) return; const p = this.t.inst, k = 1 + (p.drive || 0) * 6; if (this._dk !== k) { this._dk = k; const cv = new Float32Array(512); for (let i = 0; i < 512; i++) { const x = i / 255.5 - 1; cv[i] = Math.tanh(k * x) / Math.tanh(k); } this.drv.curve = cv; } }
  relTime() { return this.t.inst.R; }
  noteOn(note, time, vel, dur, rv, mpe) {
    const p = this.t.inst, f = mtof(note), srcs = [], amp = ctx.createGain(), mixG = ctx.createGain(), lp1 = ctx.createBiquadFilter(), lp2 = ctx.createBiquadFilter(), n = Math.max(1, Math.round(p.unison));
    const g0 = this.lastF && p.glide > 0 ? this.lastF : f; this.lastF = f;
    lp1.type = lp2.type = 'lowpass'; const cut = clamp(p.cutoff * Math.pow(f / 261.6, p.keytrack), 30, 18000); lp1.frequency.value = lp2.frequency.value = cut; lp1.Q.value = 0.5; lp2.Q.value = p.res;
    // filter envelope (in cents) also drives poly-mod on oscillator 1
    const fenv = constSrc(0, time), fG1 = ctx.createGain(), fG2 = ctx.createGain(); fenv.connect(fG1); fenv.connect(fG2); fG1.connect(lp1.detune); fG2.connect(lp2.detune); envOn(fenv.offset, time, p, p.fenv * 1200 * (0.5 + vel * 0.5)); srcs.push(fenv);
    const pmG = ctx.createGain(); pmG.gain.value = p.polymod * 2; fenv.connect(pmG);
    const lfo = ctx.createOscillator(); lfo.frequency.value = p.lfoRate; const lfoG = ctx.createGain(); lfo.connect(lfoG); srcs.push(lfo);
    lfoG.gain.value = p.lfoDest === 'pitch' ? p.lfoAmt * 50 : p.lfoDest === 'cutoff' ? p.lfoAmt * 2400 : p.lfoAmt * 0.5;
    if (p.lfoDest === 'cutoff') { lfoG.connect(lp1.detune); lfoG.connect(lp2.detune); } else if (p.lfoDest === 'amp') lfoG.connect(mixG.gain);
    mixG.gain.value = p.lfoDest === 'amp' ? 1 - p.lfoAmt * 0.5 : 1;
    const osc = (wave, pw, semis, cents, level, pm) => { if (level <= 0) return;
      for (let k = 0; k < n; k++) { const o = ctx.createOscillator(), g = ctx.createGain(); if (wave === 'pulse') o.setPeriodicWave(pulseWave(pw)); else o.type = wave === 'tri' ? 'triangle' : 'sawtooth';
        const det = n > 1 ? (k / (n - 1) - 0.5) * p.spread : 0; o.frequency.setValueAtTime(g0 * Math.pow(2, semis / 12), time); if (g0 !== f) o.frequency.setTargetAtTime(f * Math.pow(2, semis / 12), time, p.glide / 3); o.detune.value = cents + det;
        if (pm) pmG.connect(o.detune); if (p.lfoDest === 'pitch') lfoG.connect(o.detune); mpeBend([o.frequency], time, dur, mpe, f * Math.pow(2, semis / 12));
        g.gain.value = level / Math.sqrt(n); o.connect(g); g.connect(mixG); srcs.push(o); } };
    osc(p.wave1, p.pw1, 0, 0, 1, true); osc(p.wave2, p.pw2, p.semis2, p.detune2, p.level2, false);
    if (p.sub > 0) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = f / 2; g.gain.value = p.sub * 0.5; o.connect(g); g.connect(mixG); srcs.push(o); }
    if (p.noise > 0) { const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = noiseBuffer(); s.loop = true; g.gain.value = p.noise * 0.4; s.connect(g); g.connect(mixG); srcs.push(s); }
    mixG.connect(lp1); lp1.connect(lp2); lp2.connect(amp); amp.connect(this.drv); adsr(amp, time, p, vel, 0.11);   // headroom for chords; Drive adds the grit
    srcs.forEach(s => s.start(time)); return this.finish({ amp, srcs }, time, dur, rv);
  }
}
const EMBER_W = ['saw', 'pulse', 'tri'];
INST2_DEF.analog = () => ({ type: 'analog', wave1: 'saw', pw1: 0.5, wave2: 'saw', pw2: 0.35, semis2: 0, detune2: 7, level2: 0.8, sub: 0.2, noise: 0, unison: 1, spread: 14, polymod: 0, cutoff: 1800, res: 2, keytrack: 0.5, fenv: 2.5, fA: 0.005, fD: 0.6, fS: 0.2, A: 0.005, D: 0.5, S: 0.7, R: 0.35, lfoRate: 5, lfoAmt: 0, lfoDest: 'pitch', glide: 0, drive: 0.1, gain: 0.55 });
INST2_PARAMS.analog = [{ group: 'Oscillators' }, SEL('wave1', 'Osc 1', EMBER_W), K('pw1', 'Width 1', 0.05, 0.95, { fmt: fPct }), SEL('wave2', 'Osc 2', EMBER_W), K('pw2', 'Width 2', 0.05, 0.95, { fmt: fPct }), K('semis2', 'Osc 2 semis', -24, 24, { step: 1, fmt: v => (v > 0 ? '+' : '') + v }), K('detune2', 'Osc 2 detune', -50, 50, { fmt: v => Math.round(v) + 'c' }), K('level2', 'Osc 2 level', 0, 1, { fmt: fPct }), K('sub', 'Sub', 0, 1, { fmt: fPct }), K('noise', 'Noise', 0, 1, { fmt: fPct }), K('unison', 'Unison', 1, 4, { step: 1, fmt: v => v + '' }), K('spread', 'Spread', 0, 50, { fmt: v => Math.round(v) + 'c' }), K('polymod', 'Poly-mod', 0, 1, { fmt: fPct }),
  { group: 'Filter (24 dB)' }, K('cutoff', 'Cutoff', 40, 16000, { scale: 'log', fmt: fHz }), K('res', 'Reso', 0.3, 20, { fmt: v => v.toFixed(1) }), K('keytrack', 'Key track', 0, 1, { fmt: fPct }), K('fenv', 'Env amount', -4, 6, { fmt: v => (v > 0 ? '+' : '') + v.toFixed(1) + ' oct' }), K('fA', 'F attack', 0.001, 3, { scale: 'log', fmt: SEC }), K('fD', 'F decay', 0.01, 4, { scale: 'log', fmt: SEC }), K('fS', 'F sustain', 0, 1, { fmt: fPct }),
  { group: 'Amp and motion' }, K('A', 'Attack', 0.001, 4, { scale: 'log', fmt: SEC }), K('D', 'Decay', 0.01, 4, { scale: 'log', fmt: SEC }), K('S', 'Sustain', 0, 1, { fmt: fPct }), K('R', 'Release', 0.01, 6, { scale: 'log', fmt: SEC }), SEL('lfoDest', 'LFO to', ['pitch', 'cutoff', 'amp']), K('lfoRate', 'LFO rate', 0.05, 20, { scale: 'log', fmt: v => v.toFixed(2) + ' Hz' }), K('lfoAmt', 'LFO amount', 0, 1, { fmt: fPct }), K('glide', 'Glide', 0, 0.5, { fmt: SEC }), K('drive', 'Drive', 0, 1, { fmt: fPct }), K('gain', 'Volume', 0, 1, { fmt: fPct })];
INST2_CLS.analog = Ember; INST_NAMES.analog = 'Ember'; INST_BLURB.analog = 'Analog poly synth';

/* --- Vast: two-oscillator wavetable synth --- */
const VAST_TABLES = ['basic', 'vocal', 'digital', 'harmonic', 'pwm', 'growl', 'metal', 'glass', 'formant'];
const WT2_CACHE = new Map();
function wavetable2(name, i) { // 5 frames per table
  if (['basic', 'vocal', 'digital'].includes(name)) return wavetable(name, i);
  const key = name + i; if (WT2_CACHE.has(key)) return WT2_CACHE.get(key); const n = 96, re = new Float32Array(n), im = new Float32Array(n), x = i / 4;
  for (let h = 1; h < n; h++) {
    let a = 0;
    if (name === 'harmonic') a = (h <= 1 + Math.round(x * 14) ? 1 : 0) / Math.pow(h, 0.7);                                         // harmonics fade in one by one
    else if (name === 'pwm') { const w = 0.5 - x * 0.45; a = Math.abs(Math.sin(h * Math.PI * w)) * 2 / (h * Math.PI); }          // pulse narrowing
    else if (name === 'growl') a = (1 / h) * (1 + 3 * Math.exp(-Math.pow(h - (3 + x * 12), 2) / 3)) * (h % 2 ? 1 : 0.5 + x);       // a moving resonance
    else if (name === 'metal') a = ((h * 7 + 3) % 11 < 3 + x * 6 ? 1 : 0.05) / Math.pow(h, 0.5 - x * 0.2);                         // clangy partials
    else if (name === 'glass') a = [1, 2, 4, 8, 16, 32].includes(h) || (x > 0.5 && [3, 6, 12, 24].includes(h)) ? 1 / Math.sqrt(h) : 0; // octaves, bell-like
    else if (name === 'formant') { const F = [[3, 9, 13], [4, 10, 15], [6, 12, 18], [9, 14, 20], [12, 18, 24]][i]; a = F.reduce((s, c, k) => s + Math.exp(-Math.pow(h - c, 2) / 2.5) / (k + 1), 0) + (h === 1 ? 0.3 : 0); }
    im[h] = a;
  }
  const w = ctx.createPeriodicWave(re, im); WT2_CACHE.set(key, w); return w;
}
// position (0..1) is a signal; each of the five frames gets a triangular slice of it, so envelopes and LFOs sweep smoothly through the table
const FRAME_CURVES = [0, 1, 2, 3, 4].map(i => { const n = 1024, c = new Float32Array(n); for (let k = 0; k < n; k++) { const pos = (k / (n - 1)) * 2 - 1, fr = clamp(pos, 0, 1) * 4; c[k] = Math.max(0, 1 - Math.abs(fr - i)); } return c; });
class Vast extends PolyBase {
  relTime() { return this.t.inst.R; }
  noteOn(note, time, vel, dur, rv, mpe) {
    const p = this.t.inst, f = mtof(note), srcs = [], amp = ctx.createGain(), filt = ctx.createBiquadFilter(), drv = ctx.createWaveShaper(), mix = ctx.createGain();
    filt.type = p.ftype; filt.frequency.value = p.cutoff; filt.Q.value = p.res;
    const k = 1 + p.drive * 5, cv = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 127.5 - 1; cv[i] = Math.tanh(k * x) / Math.tanh(k); } drv.curve = cv;
    const menv = constSrc(0, time); { const e = { fA: p.mA, fD: p.mD, fS: p.mS }; envOn(menv.offset, time, e, 1); } srcs.push(menv);
    const lfo = ctx.createOscillator(); lfo.frequency.value = p.lfoRate; srcs.push(lfo);
    const fEnvG = ctx.createGain(); fEnvG.gain.value = p.envCut * 4800; menv.connect(fEnvG); fEnvG.connect(filt.detune);
    const fLfoG = ctx.createGain(); fLfoG.gain.value = p.lfoCut * 2400; lfo.connect(fLfoG); fLfoG.connect(filt.detune);
    const n = Math.max(1, Math.round(p.unison));
    [1, 2].forEach(o => {
      const lvl = p['level' + o]; if (lvl <= 0) return;
      const pos = constSrc(p['pos' + o], time), eG = ctx.createGain(), lG = ctx.createGain(); eG.gain.value = p['env' + o]; lG.gain.value = p['lfo' + o] * 0.5; menv.connect(eG); eG.connect(pos.offset); lfo.connect(lG); lG.connect(pos.offset); srcs.push(pos);
      const fr = [0, 1, 2, 3, 4].map(i => { const sh = ctx.createWaveShaper(), g = ctx.createGain(); sh.curve = FRAME_CURVES[i]; g.gain.value = 0; pos.connect(sh); sh.connect(g.gain); g.connect(mix); return g; });
      const ff = f * Math.pow(2, p['semis' + o] / 12);
      for (let u = 0; u < n; u++) { const det = n > 1 ? (u / (n - 1) - 0.5) * p.spread : 0;
        fr.forEach((g, i) => { const os = ctx.createOscillator(), og = ctx.createGain(); os.setPeriodicWave(wavetable2(p['table' + o], i)); os.frequency.value = ff; os.detune.value = det + (o === 2 ? p.fine2 : 0); og.gain.value = lvl / Math.sqrt(n); mpeBend([os.frequency], time, dur, mpe, ff); os.connect(og); og.connect(g); srcs.push(os); }); }
    });
    mix.connect(drv); drv.connect(filt); filt.connect(amp); amp.connect(this.out); adsr(amp, time, p, vel, 0.3);
    srcs.forEach(s => s.start(time)); return this.finish({ amp, srcs }, time, dur, rv);
  }
}
INST2_DEF.vast = () => ({ type: 'vast', table1: 'basic', pos1: 0.2, env1: 0.4, lfo1: 0, semis1: 0, level1: 1, table2: 'harmonic', pos2: 0.5, env2: 0, lfo2: 0.3, semis2: 12, fine2: 6, level2: 0.5, unison: 2, spread: 16, ftype: 'lowpass', cutoff: 5000, res: 1.5, drive: 0.15, envCut: 0.3, lfoCut: 0, mA: 0.01, mD: 0.8, mS: 0.3, lfoRate: 0.4, A: 0.01, D: 0.4, S: 0.8, R: 0.4, gain: 0.5 });
const vastOsc = o => [{ group: 'Oscillator ' + o }, SEL('table' + o, 'Table', VAST_TABLES), K('pos' + o, 'Position', 0, 1, { fmt: fPct }), K('env' + o, 'Env > pos', -1, 1, { fmt: fPct }), K('lfo' + o, 'LFO > pos', 0, 1, { fmt: fPct }), K('semis' + o, 'Semis', -24, 24, { step: 1, fmt: v => (v > 0 ? '+' : '') + v }), ...(o === 2 ? [K('fine2', 'Fine', -50, 50, { fmt: v => Math.round(v) + 'c' })] : []), K('level' + o, 'Level', 0, 1, { fmt: fPct })];
INST2_PARAMS.vast = [...vastOsc(1), ...vastOsc(2), { group: 'Voice and filter' }, K('unison', 'Unison', 1, 4, { step: 1, fmt: v => v + '' }), K('spread', 'Spread', 0, 50, { fmt: v => Math.round(v) + 'c' }), SEL('ftype', 'Filter', ['lowpass', 'bandpass', 'highpass']), K('cutoff', 'Cutoff', 40, 18000, { scale: 'log', fmt: fHz }), K('res', 'Reso', 0.3, 15, { fmt: v => v.toFixed(1) }), K('drive', 'Drive', 0, 1, { fmt: fPct }), K('envCut', 'Env > cutoff', -1, 1, { fmt: fPct }), K('lfoCut', 'LFO > cutoff', 0, 1, { fmt: fPct }),
  { group: 'Envelopes and LFO' }, K('mA', 'Mod attack', 0.001, 4, { scale: 'log', fmt: SEC }), K('mD', 'Mod decay', 0.01, 6, { scale: 'log', fmt: SEC }), K('mS', 'Mod sustain', 0, 1, { fmt: fPct }), K('lfoRate', 'LFO rate', 0.02, 20, { scale: 'log', fmt: v => v.toFixed(2) + ' Hz' }), K('A', 'Attack', 0.001, 4, { scale: 'log', fmt: SEC }), K('D', 'Decay', 0.01, 4, { scale: 'log', fmt: SEC }), K('S', 'Sustain', 0, 1, { fmt: fPct }), K('R', 'Release', 0.01, 8, { scale: 'log', fmt: SEC }), K('gain', 'Volume', 0, 1, { fmt: fPct })];
INST2_CLS.vast = Vast; INST_NAMES.vast = 'Vast'; INST_BLURB.vast = 'Wavetable synth, two oscillators';

/* --- Spectra: two sample layers, each split by its spectrum (tonal partials, noise, or a band), played across the keys --- */
const SPEC_CACHE = new Map();
function spectralBuffer(sid, mode, lo, hi) {
  const s = SAMPLES.get(sid); if (!s) return null; if (mode === 'full') return s.buf;
  const key = sid + '|' + mode + '|' + (mode === 'band' ? Math.round(lo) + '-' + Math.round(hi) : ''); if (SPEC_CACHE.has(key)) return SPEC_CACHE.get(key);
  const src = s.buf, sr = src.sampleRate, len = Math.min(src.length, sr * 12), N = 2048, H = N / 4, win = new Float32Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  const out = new AudioBuffer({ length: len, numberOfChannels: src.numberOfChannels, sampleRate: sr }), re = new Float64Array(N), im = new Float64Array(N), mag = new Float64Array(N / 2 + 1), peaks = new Uint8Array(N / 2 + 1);
  for (let ch = 0; ch < src.numberOfChannels; ch++) {
    const x = src.getChannelData(ch), y = new Float32Array(len), norm = new Float32Array(len);
    for (let f0 = -N + H; f0 < len; f0 += H) {
      for (let i = 0; i < N; i++) { const j = f0 + i; re[i] = j >= 0 && j < len ? x[j] * win[i] : 0; im[i] = 0; }
      fft(re, im, false); for (let k = 0; k <= N / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
      if (mode !== 'band') { let mx = 0, acc = 0; const W = 12, half = N / 2; for (let k = 0; k <= half; k++) mx = Math.max(mx, mag[k]); for (let k = 0; k <= Math.min(half, W); k++) acc += mag[k];
        for (let k = 0; k <= half; k++) { if (k + W + 1 <= half) acc += mag[k + W + 1]; if (k - W - 1 >= 0) acc -= mag[k - W - 1]; const avg = acc / (Math.min(half, k + W) - Math.max(0, k - W) + 1); let pk = mag[k] > mx * 0.003 && mag[k] > avg * 4; /* a real partial stands well above its neighbourhood */ for (let d = -3; d <= 3 && pk; d++) if (d && k + d >= 0 && k + d <= N / 2 && mag[k + d] > mag[k]) pk = false; peaks[k] = pk ? 1 : 0; } }
      for (let k = 0; k <= N / 2; k++) {
        const hz = k * sr / N; let keep;
        if (mode === 'band') keep = hz >= lo && hz <= hi;
        else { const near = peaks[k] || (k > 0 && peaks[k - 1]) || (k < N / 2 && peaks[k + 1]); keep = mode === 'tonal' ? !!near : !near; }
        if (!keep) { re[k] = im[k] = 0; if (k && k < N / 2) { re[N - k] = im[N - k] = 0; } }
      }
      fft(re, im, true); for (let i = 0; i < N; i++) { const j = f0 + i; if (j >= 0 && j < len) { y[j] += re[i] / N * win[i]; norm[j] += win[i] * win[i]; } }
    }
    for (let i = 0; i < len; i++) y[i] /= norm[i] > 1e-3 ? norm[i] : 1; out.copyToChannel(y, ch);
  }
  SPEC_CACHE.set(key, out); return out;
}
class Spectra extends PolyBase {
  relTime() { return this.t.inst.R; }
  noteOn(note, time, vel, dur, rv, mpe) {
    const p = this.t.inst, amp = ctx.createGain(), lp = ctx.createBiquadFilter(), srcs = []; lp.type = 'lowpass'; lp.frequency.value = p.cutoff; lp.Q.value = 0.7;
    ['A', 'B'].forEach(L => { const sid = p['sid' + L], lvl = p['level' + L]; if (!sid || lvl <= 0) return; const buf = spectralBuffer(sid, p['mode' + L], p['lo' + L], p['hi' + L]); if (!buf) return;
      const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = buf; s.loop = !!p.loop; const r0 = Math.pow(2, (note - p.root + (p['tune' + L] || 0)) / 12); s.playbackRate.value = r0; mpeBend([s.playbackRate], time, dur, mpe, r0); g.gain.value = lvl; s.connect(g); g.connect(lp); srcs.push(s); });
    if (!srcs.length) return null;
    lp.connect(amp); amp.connect(this.out); adsr(amp, time, p, vel, 0.8); srcs.forEach(s => s.start(time)); return this.finish({ amp, srcs }, time, dur, rv);
  }
}
const SPEC_MODES = [['full', 'Full'], ['tonal', 'Tonal (partials)'], ['noise', 'Noise (air, breath)'], ['band', 'Band']];
INST2_DEF.spectra = () => ({ type: 'spectra', sidA: null, sidB: null, modeA: 'tonal', modeB: 'noise', loA: 200, hiA: 4000, loB: 2000, hiB: 16000, levelA: 1, levelB: 0.6, tuneA: 0, tuneB: 0, root: 60, loop: false, cutoff: 14000, A: 0.005, D: 0.6, S: 0.8, R: 0.6, gain: 0.7 });
const specLayer = L => [{ group: 'Layer ' + L }, SEL('mode' + L, 'Keep', SPEC_MODES), K('lo' + L, 'Band low', 20, 20000, { scale: 'log', fmt: fHz }), K('hi' + L, 'Band high', 20, 20000, { scale: 'log', fmt: fHz }), K('level' + L, 'Level', 0, 1, { fmt: fPct }), K('tune' + L, 'Tune', -24, 24, { step: 1, fmt: v => (v > 0 ? '+' : '') + v + ' st' })];
INST2_PARAMS.spectra = [...specLayer('A'), ...specLayer('B'), { group: 'Voice' }, K('root', 'Root note', 24, 96, { step: 1, fmt: v => noteName(v) }), TOG('loop', 'Loop'), K('cutoff', 'Cutoff', 60, 18000, { scale: 'log', fmt: fHz }), K('A', 'Attack', 0.001, 4, { scale: 'log', fmt: SEC }), K('D', 'Decay', 0.01, 4, { scale: 'log', fmt: SEC }), K('S', 'Sustain', 0, 1, { fmt: fPct }), K('R', 'Release', 0.01, 8, { scale: 'log', fmt: SEC }), K('gain', 'Volume', 0, 1, { fmt: fPct })];
INST2_CLS.spectra = Spectra; INST_NAMES.spectra = 'Spectra'; INST_BLURB.spectra = 'Spectral sampler';
