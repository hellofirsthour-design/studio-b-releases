/* ============ instruments ============ */
const DRUM_KINDS = ['Kick', 'Snare', 'Clap', 'Closed Hat', 'Open Hat', 'Tom', 'Rim', 'Shaker', 'Cowbell', 'Sub Kick'];
const DRUM_VOICE = {
  Kick(t, out, p) { const o = ctx.createOscillator(), g = ctx.createGain(); const f = 52 * p.tm; o.frequency.setValueAtTime(f * 3.2, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.06); g.gain.setValueAtTime(1, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.45 * p.dm); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.5 * p.dm + 0.05); clickN(t, out, 0.25, 3000); },
  'Sub Kick'(t, out, p) { const o = ctx.createOscillator(), g = ctx.createGain(); const f = 41 * p.tm; o.frequency.setValueAtTime(f * 2, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.09); g.gain.setValueAtTime(1, t); g.gain.setTargetAtTime(0, t + 0.15, 0.25 * p.dm); o.connect(g); g.connect(out); o.start(t); o.stop(t + 1.6 * p.dm); },
  Snare(t, out, p) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(220 * p.tm, t); o.frequency.exponentialRampToValueAtTime(170 * p.tm, t + 0.05); g.gain.setValueAtTime(0.55, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12 * p.dm); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.2 * p.dm + 0.05); noiseHit(t, out, 0.7, 'highpass', 1400 * p.tm, 0.2 * p.dm); },
  Clap(t, out, p) { for (let i = 0; i < 3; i++) noiseHit(t + i * 0.011, out, 0.55, 'bandpass', 1300 * p.tm, 0.012); noiseHit(t + 0.033, out, 0.6, 'bandpass', 1200 * p.tm, 0.2 * p.dm, 1.2); },
  'Closed Hat'(t, out, p) { metal(t, out, 0.35, 0.05 * p.dm, p.tm); },
  'Open Hat'(t, out, p) { metal(t, out, 0.3, 0.38 * p.dm, p.tm); },
  Tom(t, out, p) { const o = ctx.createOscillator(), g = ctx.createGain(); const f = 120 * p.tm; o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.08); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.4 * p.dm); o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.45 * p.dm + 0.05); },
  Rim(t, out, p) { const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = 1700 * p.tm; f.type = 'bandpass'; f.frequency.value = 1800 * p.tm; f.Q.value = 4; g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04 * p.dm); o.connect(f); f.connect(g); g.connect(out); o.start(t); o.stop(t + 0.08 * p.dm + 0.02); },
  Shaker(t, out, p) { const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noiseBuffer(); f.type = 'bandpass'; f.frequency.value = 6500 * p.tm; f.Q.value = 1.5; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.35, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09 * p.dm); s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random()); s.stop(t + 0.12 * p.dm + 0.02); },
  Cowbell(t, out, p) { const f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'bandpass'; f.frequency.value = 800 * p.tm; f.Q.value = 2; [540, 800].forEach(fr => { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = fr * p.tm; o.connect(f); o.start(t); o.stop(t + 0.4 * p.dm + 0.05); }); g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35 * p.dm); f.connect(g); g.connect(out); }
};
function noiseHit(t, out, amp, type, freq, dec, q = 0.8) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuffer(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(amp, t); g.gain.exponentialRampToValueAtTime(0.001, t + dec);
  s.connect(f); f.connect(g); g.connect(out); s.start(t, Math.random()); s.stop(t + dec + 0.03);
}
function clickN(t, out, amp, freq) { noiseHit(t, out, amp, 'highpass', freq, 0.008); }
function metal(t, out, amp, dec, tm) {
  const hp = ctx.createBiquadFilter(), g = ctx.createGain(); hp.type = 'highpass'; hp.frequency.value = 7000;
  [2, 3, 4.16, 5.43, 6.79, 8.21].forEach(r => { const o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 40 * r * tm * 1.0; o.connect(hp); o.start(t); o.stop(t + dec + 0.05); });
  g.gain.setValueAtTime(amp, t); g.gain.exponentialRampToValueAtTime(0.001, t + dec);
  hp.connect(g); g.connect(out); noiseHit(t, out, amp * 0.5, 'highpass', 9000, dec);
}

class DrumKit {
  constructor(t) { this.t = t; this.out = ctx.createGain(); this.hits = []; }
  noteOn(p, time, vel) {
    const pad = this.t.inst.pads[p]; if (!pad) return null;
    if (pad.kind === 'Closed Hat') this.choke('Open Hat', time);
    const g = ctx.createGain(), pn = ctx.createStereoPanner(); g.gain.value = vel * pad.level; pn.pan.value = pad.pan || 0;
    g.connect(pn); pn.connect(this.out);
    const prm = { tm: Math.pow(2, pad.tune / 12), dm: pad.decay };
    const smp = pad.sampleId && SAMPLES.get(pad.sampleId);
    if (smp) { const s = ctx.createBufferSource(); s.buffer = smp.buf; s.playbackRate.value = prm.tm; s.connect(g); s.start(time); const len = smp.buf.duration / prm.tm * Math.min(1, pad.decay); g.gain.setValueAtTime(vel * pad.level, time); g.gain.setValueAtTime(vel * pad.level, time + Math.max(0.01, len - 0.012)); g.gain.linearRampToValueAtTime(0, time + len); s.stop(time + len + 0.01); }
    else (DRUM_VOICE[pad.kind] || DRUM_VOICE.Kick)(time, g, prm);
    this.hits.push({ kind: pad.kind, g, time });
    if (this.hits.length > 24) this.hits.shift();
    if (!isOffline()) flashPadAt(this.t.id, p, time);
    return null;
  }
  choke(kind, time) { for (const h of this.hits) if (h.kind === kind && h.time < time) { hold(h.g.gain, time); h.g.gain.setTargetAtTime(0, time, 0.01); } }
  noteOff() { }
  allOff(time) { for (const h of this.hits) { hold(h.g.gain, time); h.g.gain.setTargetAtTime(0, time, 0.02); } this.hits = []; }
}

const SYNTH_DEFAULT = { wave1: 'sawtooth', wave2: 'square', oct2: 0, detune: 8, mix2: 0.4, sub: 0, noise: 0, ftype: 'lowpass', cutoff: 2200, res: 4, fenv: 2400, fA: 0.005, fD: 0.35, A: 0.005, D: 0.4, Sus: 0.6, R: 0.3, glide: 0, mono: false, lfoRate: 4, lfoAmt: 0, gain: 0.5 };
const SYNTH_PRESETS = {
  'Sub Bass': { wave1: 'sine', wave2: 'triangle', oct2: 1, detune: 0, mix2: 0.25, sub: 0, noise: 0, cutoff: 900, res: 1, fenv: 400, fA: 0.002, fD: 0.2, A: 0.004, D: 0.3, Sus: 0.85, R: 0.12, glide: 0.04, mono: true, lfoAmt: 0, gain: 0.7 },
  'Reese': { wave1: 'sawtooth', wave2: 'sawtooth', oct2: 0, detune: 22, mix2: 0.5, sub: 0.4, noise: 0, cutoff: 700, res: 3, fenv: 600, fA: 0.01, fD: 0.6, A: 0.01, D: 0.4, Sus: 0.9, R: 0.2, glide: 0.06, mono: true, lfoRate: 0.3, lfoAmt: 600, gain: 0.45 },
  'Keys': { wave1: 'triangle', wave2: 'sine', oct2: 1, detune: 3, mix2: 0.35, sub: 0, noise: 0, cutoff: 3200, res: 1, fenv: 1800, fA: 0.002, fD: 0.5, A: 0.003, D: 0.9, Sus: 0.25, R: 0.35, glide: 0, mono: false, lfoRate: 5, lfoAmt: 0, gain: 0.5 },
  'Warm Pad': { wave1: 'sawtooth', wave2: 'sawtooth', oct2: 0, detune: 14, mix2: 0.5, sub: 0, noise: 0.03, cutoff: 1300, res: 2, fenv: 500, fA: 1.2, fD: 1.5, A: 0.9, D: 1, Sus: 0.8, R: 1.6, glide: 0, mono: false, lfoRate: 0.25, lfoAmt: 350, gain: 0.32 },
  'Pluck': { wave1: 'square', wave2: 'sawtooth', oct2: 1, detune: 6, mix2: 0.3, sub: 0, noise: 0, cutoff: 600, res: 6, fenv: 5200, fA: 0.001, fD: 0.16, A: 0.001, D: 0.25, Sus: 0, R: 0.2, glide: 0, mono: false, lfoAmt: 0, gain: 0.45 },
  'Saw Lead': { wave1: 'sawtooth', wave2: 'square', oct2: 0, detune: 10, mix2: 0.5, sub: 0.2, noise: 0, cutoff: 2600, res: 5, fenv: 1800, fA: 0.005, fD: 0.3, A: 0.005, D: 0.2, Sus: 0.8, R: 0.2, glide: 0.05, mono: true, lfoRate: 5.5, lfoAmt: 0, gain: 0.38 },
};
class Synth {
  constructor(t) {
    this.t = t; this.out = ctx.createGain(); this.voices = []; this.lastF = 0;
    this.lfo = ctx.createOscillator(); this.lfoG = ctx.createGain(); this.lfo.connect(this.lfoG); this.lfo.start();
    this.update();
  }
  update() { const p = this.t.inst; this.lfo.frequency.value = p.lfoRate; this.lfoG.gain.value = p.lfoAmt; this.out.gain.value = p.gain; }
  noteOn(note, time, vel, dur, rv) {
    const p = this.t.inst, f = mtof(note);
    if (p.mono) { this.voices.forEach(v => this.release(v, time, 0.01)); }
    const v = { note, oscs: [] };
    const amp = ctx.createGain(), filt = ctx.createBiquadFilter(), mix = ctx.createGain();
    filt.type = p.ftype; filt.Q.value = p.res; this.lfoG.connect(filt.detune);
    const startF = p.mono && p.glide > 0 && this.lastF ? this.lastF : f;
    const mk = (type, mult, det, g) => {
      const o = ctx.createOscillator(), og = ctx.createGain(); o.type = type; o.detune.value = det; og.gain.value = g;
      o.frequency.setValueAtTime(startF * mult, time); if (startF !== f) o.frequency.exponentialRampToValueAtTime(f * mult, time + p.glide);
      o.connect(og); og.connect(mix); o.start(time); v.oscs.push(o);
    };
    mk(p.wave1, 1, -p.detune / 2, 1 - p.mix2 * 0.5);
    mk(p.wave2, Math.pow(2, p.oct2), p.detune / 2, p.mix2);
    if (p.sub > 0) mk('sine', 0.5, 0, p.sub);
    if (p.noise > 0) { const s = ctx.createBufferSource(), ng = ctx.createGain(); s.buffer = noiseBuffer(); s.loop = true; ng.gain.value = p.noise; s.connect(ng); ng.connect(mix); s.start(time, Math.random()); v.oscs.push(s); }
    mix.gain.value = 0.3;
    const top = clamp(p.cutoff + p.fenv * vel, 30, 18000);
    filt.frequency.setValueAtTime(p.cutoff, time); filt.frequency.linearRampToValueAtTime(top, time + p.fA); filt.frequency.setTargetAtTime(p.cutoff, time + p.fA, p.fD / 3 + 0.001);
    amp.gain.setValueAtTime(0, time); amp.gain.linearRampToValueAtTime(vel, time + p.A); amp.gain.setTargetAtTime(vel * p.Sus, time + p.A, p.D / 3 + 0.001);
    mix.connect(filt); filt.connect(amp); amp.connect(this.out);
    Object.assign(v, { amp, filt });
    this.voices.push(v); this.lastF = f; if (!isOffline()) flashPadAt(this.t.id, -1, time);
    if (dur != null) this.release(v, time + dur, null, rv);
    if (this.voices.length > 24) this.release(this.voices[0], time, 0.01);
    return v;
  }
  release(v, time, fast, rv) { // release velocity: harder releases (rv near 1) cut faster, soft ones ring longer
    if (v.done) return; v.done = true; const R = fast || this.t.inst.R * (rv == null ? 1 : 1.5 - clamp(rv, 0, 1));
    hold(v.amp.gain, time); v.amp.gain.setTargetAtTime(0, time, R / 4 + 0.001);
    v.oscs.forEach(o => { try { o.stop(time + R * 1.6 + 0.05); } catch (e) { } });
    setTimeout(() => { this.voices = this.voices.filter(x => x !== v); try { this.lfoG.disconnect(v.filt.detune); } catch (e) { } }, Math.max(0, (time - ctx.currentTime + R * 1.6 + 0.2) * 1000));
  }
  noteOff(v, time, rv) { if (v) this.release(v, time, null, rv); }
  modulate(k, val) { if (k === 'cutoff') this.voices.forEach(v => { if (!v.done && v.filt) v.filt.frequency.setTargetAtTime(val, ctx.currentTime, 0.015); }); }
  allOff(time) { this.voices.forEach(v => this.release(v, time, 0.03)); }
  dispose() { try { this.lfo.stop(); this.lfo.disconnect(); } catch (e) { } }
}

/* Sampler: Serato-style cue chopping, key shift and tempo sync on one loaded sample. */
class Sampler {
  constructor(t) {
    this.t = t; this.out = ctx.createGain(); this.lp = ctx.createBiquadFilter(); this.hp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass'; this.hp.type = 'highpass'; this.lp.connect(this.hp); this.hp.connect(this.out);
    this.voices = []; this.proc = null; this.stretchR = 1; this.rate = 1; this.procKey = '';
    this.update();
  }
  update() {
    const p = this.t.inst; this.out.gain.value = p.gain;
    const f = p.filter; this.lp.frequency.value = f < 0 ? 20000 * Math.pow(0.006, -f) : 20000; this.hp.frequency.value = f > 0 ? 10 * Math.pow(800, f) : 10;
    this.lp.Q.value = this.hp.Q.value = 1 + Math.abs(f) * 4;
    this.prepare();
  }
  prepare(force) {
    const p = this.t.inst, s = SAMPLES.get(p.sampleId); if (!s) { this.proc = null; return; }
    const tempoR = p.sync && p.srcBpm ? p.srcBpm / S.bpm : 1;     // output duration factor
    const P = Math.pow(2, p.semis / 12);
    const key = [p.sampleId, p.semis, p.sync ? S.bpm : 0, p.stretch, p.srcBpm].join('|');
    if (key === this.procKey && !force) return;
    this.procKey = key;
    if (p.stretch) { this.stretchR = tempoR * P; this.rate = P; this.proc = this.stretchR === 1 ? s.buf : null; }
    else { this.stretchR = 1; this.rate = P / tempoR; this.proc = s.buf; }
    if (!this.proc && isOffline()) { this.proc = stretchBuffer(s.buf, this.stretchR); return; }
    if (!this.proc) {
      clearTimeout(this._job); const want = key; const bz = document.getElementById('busy'); if (bz) bz.hidden = false;
      this._job = setTimeout(() => { if (this.procKey !== want) return; this.proc = stretchBuffer(s.buf, this.stretchR); const bz2 = document.getElementById('busy'); if (bz2) bz2.hidden = true; }, 30);
    }
  }
  cueRange(i) {
    const p = this.t.inst, s = SAMPLES.get(p.sampleId); if (!s) return null;
    const cues = p.cues, a = cues[i]; if (a == null) return null;
    const next = cues.filter(c => c > a).sort((x, y) => x - y)[0];
    return [a, next != null ? next : s.buf.duration];
  }
  noteOn(note, time, vel, dur) {
    const p = this.t.inst; if (!this.proc) return null;
    let cue = note, rate = this.rate;
    if (p.mode === 'keys') { cue = p.keyCue; rate *= Math.pow(2, (note - (p.root != null ? p.root : 60)) / 12); }
    const r = this.cueRange(cue); if (!r) return null;
    const start = r[0] * this.stretchR, end = p.oneShot === 'full' ? this.proc.duration : r[1] * this.stretchR;
    let len = (end - start) / rate; if (p.oneShot === 'gate' && dur != null) len = Math.min(len, dur);
    if (p.choke) this.voices.filter(v => v.cue === cue).forEach(v => this.stopV(v, time));
    const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = this.proc; src.playbackRate.value = rate;
    g.gain.setValueAtTime(0, time); g.gain.linearRampToValueAtTime(vel, time + p.attack + 0.002);
    const relAt = time + Math.max(0.01, len - p.release);
    g.gain.setValueAtTime(vel, relAt); g.gain.linearRampToValueAtTime(0, relAt + p.release + 0.003);
    src.connect(g); g.connect(this.lp); src.start(time, start); src.stop(relAt + p.release + 0.02);
    const v = { src, g, cue, end: relAt + p.release, t0: time };
    this.voices.push(v); src.onended = () => (this.voices = this.voices.filter(x => x !== v));
    if (!isOffline()) flashPadAt(this.t.id, cue, time);
    return v;
  }
  stopV(v, time) { hold(v.g.gain, time); v.g.gain.setTargetAtTime(0, time, 0.008); try { v.src.stop(time + 0.06); } catch (e) { } }
  noteOff(v, time) { if (v && this.t.inst.oneShot === 'gate') this.stopV(v, time); }
  allOff(time) { this.voices.forEach(v => this.stopV(v, time)); }
}
function makeInstrument(t) { const k = t.inst.type; return k === 'drums' ? new DrumKit(t) : k === 'synth' ? new Synth(t) : new Sampler(t); }
