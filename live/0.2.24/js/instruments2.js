/* ============ More instruments: Facet (FM), Morph (wavetable), Tine (electric piano), String (physical model), Zones (multisampler) ============
   Each follows the instrument contract: out node, noteOn(note, time, vel, dur, rv, mpe) -> voice, noteOff(voice, time, rv), allOff(time). */
const INST_NAMES = { synth: 'Contour', drums: 'Kit', sampler: 'Cutline', fm: 'Facet', wave: 'Morph', epiano: 'Tine', pluck: 'String', multi: 'Zones' };
const INST_BLURB = { fm: 'FM synth', wave: 'Wavetable synth', epiano: 'Electric piano', pluck: 'Plucked string model', multi: 'Multisampler' };
const isPitched = t => t.inst.type !== 'drums' && !(t.inst.type === 'sampler' && t.inst.mode !== 'keys');
const INST2_DEF = {
  fm: () => ({ type: 'fm', ratio: 2, index: 4, modDecay: 0.6, modSustain: 0.2, ratio2: 7, index2: 0, fine: 0, A: 0.003, D: 0.5, S: 0.6, R: 0.35, cutoff: 12000, gain: 0.5 }),
  wave: () => ({ type: 'wave', table: 'basic', pos: 0.3, posEnv: 0.3, posDecay: 0.6, voices: 2, spread: 12, cutoff: 6000, res: 1.5, A: 0.01, D: 0.4, S: 0.7, R: 0.4, gain: 0.45 }),
  epiano: () => ({ type: 'epiano', tone: 0.5, tine: 0.4, decay: 2.2, release: 0.25, trem: 0.3, tremRate: 4.5, drive: 0.15, gain: 0.55 }),
  pluck: () => ({ type: 'pluck', decay: 2.5, bright: 0.6, damp: 0.5, body: 3500, pick: 0.15, gain: 0.7 }),
  multi: () => ({ type: 'multi', zones: [], A: 0.003, R: 0.25, gain: 0.8, glide: 0 }),
};
const SEC = v => (v < 1 ? Math.round(v * 1000) + ' ms' : v.toFixed(2) + ' s');
const INST2_PARAMS = {
  fm: [{ group: 'Modulator' }, K('ratio', 'Ratio', 0.5, 12, { step: 0.5, fmt: v => v.toFixed(1) }), K('index', 'Amount', 0, 20, { fmt: v => v.toFixed(1) }), K('modDecay', 'Decay', 0.02, 4, { scale: 'log', fmt: SEC }), K('modSustain', 'Sustain', 0, 1, { fmt: fPct }), K('ratio2', 'Ratio 2', 1, 16, { step: 0.5, fmt: v => v.toFixed(1) }), K('index2', 'Amount 2', 0, 10, { fmt: v => v.toFixed(1) }),
    { group: 'Carrier' }, K('fine', 'Fine', -50, 50, { step: 1, fmt: v => v + 'c' }), K('A', 'Attack', 0.001, 2, { scale: 'log', fmt: SEC }), K('D', 'Decay', 0.01, 4, { scale: 'log', fmt: SEC }), K('S', 'Sustain', 0, 1, { fmt: fPct }), K('R', 'Release', 0.01, 4, { scale: 'log', fmt: SEC }), K('cutoff', 'Tone', 300, 18000, { scale: 'log', fmt: fHz }), K('gain', 'Volume', 0, 1, { fmt: fPct })],
  wave: [{ group: 'Wavetable' }, SEL('table', 'Table', ['basic', 'vocal', 'digital']), K('pos', 'Position', 0, 1, { fmt: fPct }), K('posEnv', 'Env > pos', -1, 1, { fmt: fPct }), K('posDecay', 'Env decay', 0.02, 4, { scale: 'log', fmt: SEC }), K('voices', 'Unison', 1, 4, { step: 1, fmt: v => v + '' }), K('spread', 'Detune', 0, 40, { fmt: v => Math.round(v) + 'c' }),
    { group: 'Filter and amp' }, K('cutoff', 'Cutoff', 60, 18000, { scale: 'log', fmt: fHz }), K('res', 'Reso', 0.3, 15, { fmt: v => v.toFixed(1) }), K('A', 'Attack', 0.001, 2, { scale: 'log', fmt: SEC }), K('D', 'Decay', 0.01, 4, { scale: 'log', fmt: SEC }), K('S', 'Sustain', 0, 1, { fmt: fPct }), K('R', 'Release', 0.01, 4, { scale: 'log', fmt: SEC }), K('gain', 'Volume', 0, 1, { fmt: fPct })],
  epiano: [K('tone', 'Tone', 0, 1, { fmt: fPct }), K('tine', 'Tine', 0, 1, { fmt: fPct }), K('decay', 'Decay', 0.3, 6, { scale: 'log', fmt: SEC }), K('release', 'Release', 0.02, 1.5, { scale: 'log', fmt: SEC }), K('trem', 'Tremolo', 0, 1, { fmt: fPct }), K('tremRate', 'Rate', 0.5, 10, { fmt: v => v.toFixed(1) + ' Hz' }), K('drive', 'Drive', 0, 1, { fmt: fPct }), K('gain', 'Volume', 0, 1, { fmt: fPct })],
  pluck: [K('decay', 'Decay', 0.3, 8, { scale: 'log', fmt: SEC }), K('bright', 'Brightness', 0, 1, { fmt: fPct }), K('damp', 'Damping', 0, 1, { fmt: fPct }), K('pick', 'Pick pos', 0.02, 0.5, { fmt: fPct }), K('body', 'Body', 400, 12000, { scale: 'log', fmt: fHz }), K('gain', 'Volume', 0, 1, { fmt: fPct })],
  multi: [K('A', 'Attack', 0.001, 2, { scale: 'log', fmt: SEC }), K('R', 'Release', 0.01, 4, { scale: 'log', fmt: SEC }), K('gain', 'Volume', 0, 1, { fmt: fPct })],
};
const adsr = (g, t, p, vel, peak = 1) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel * peak, t + p.A); g.gain.setTargetAtTime(vel * peak * p.S, t + p.A, Math.max(0.005, p.D / 3)); };
const relEnv = (g, t, R) => { hold(g.gain, t); g.gain.setTargetAtTime(0, t, Math.max(0.005, R / 4)); };
// pitch bend from MPE data: a curve of semitones over the note's length
function mpeBend(params, time, dur, mpe, f0) { if (!mpe || !mpe.pb || !mpe.pb.length || !dur) return; params.forEach(pr => { pr.setValueAtTime(f0 * Math.pow(2, mpe.pb[0].v / 12), time); mpe.pb.forEach(q => pr.linearRampToValueAtTime(f0 * Math.pow(2, q.v / 12), time + q.t * dur)); }); }
class PolyBase {
  constructor(t) { this.t = t; this.out = ctx.createGain(); this.voices = []; this.update(); }
  update() { this.out.gain.value = this.t.inst.gain != null ? this.t.inst.gain : 0.7; }
  track(v, end) { this.voices.push(v); if (this.voices.length > 32) this.kill(this.voices[0], ctx.currentTime); }
  kill(v, time) { if (v.done) return; v.done = true; relEnv(v.amp, time, 0.01); (v.srcs || []).forEach(s => { try { s.stop(time + 0.05); } catch (e) { } }); this.voices = this.voices.filter(x => x !== v); }
  noteOff(v, time) { if (!v || v.done) return; v.done = true; const R = this.relTime(); relEnv(v.amp, time, R); (v.srcs || []).forEach(s => { try { s.stop(time + R * 1.5 + 0.05); } catch (e) { } }); setTimeout(() => (this.voices = this.voices.filter(x => x !== v)), Math.max(0, (time - ctx.currentTime + R * 1.6) * 1000 + 100)); }
  relTime() { return this.t.inst.R || 0.3; }
  allOff(time) { [...this.voices].forEach(v => this.kill(v, time)); }
  finish(v, time, dur, rv) { this.track(v); if (dur != null) this.noteOff(v, time + dur, rv); return v; }
}
class FMSynth extends PolyBase {
  noteOn(note, time, vel, dur, rv, mpe) {
    const p = this.t.inst, f = mtof(note) * Math.pow(2, (p.fine || 0) / 1200), car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), amp = ctx.createGain(), lp = ctx.createBiquadFilter();
    car.frequency.value = f; mod.frequency.value = f * p.ratio; lp.type = 'lowpass'; lp.frequency.value = p.cutoff;
    const depth = p.index * f * p.ratio * (0.5 + vel * 0.5); mg.gain.setValueAtTime(depth, time); mg.gain.setTargetAtTime(depth * p.modSustain, time + 0.002, Math.max(0.005, p.modDecay / 3));
    mod.connect(mg); mg.connect(car.frequency); const srcs = [car, mod];
    if (p.index2 > 0) { const m2 = ctx.createOscillator(), g2 = ctx.createGain(); m2.frequency.value = f * p.ratio2; const d2 = p.index2 * f * p.ratio2; g2.gain.setValueAtTime(d2, time); g2.gain.setTargetAtTime(0, time + 0.002, 0.03); m2.connect(g2); g2.connect(car.frequency); m2.start(time); srcs.push(m2); }
    mpeBend([car.frequency], time, dur, mpe, f);
    car.connect(lp); lp.connect(amp); amp.connect(this.out); adsr(amp, time, p, vel, 0.6); srcs.forEach(s => s.start(time));
    return this.finish({ amp, srcs }, time, dur, rv);
  }
}
const WT_CACHE = new Map();
function wavetable(name, i) { // 5 frames per table, built from harmonics
  const key = name + i; if (WT_CACHE.has(key)) return WT_CACHE.get(key); const n = 64, re = new Float32Array(n), im = new Float32Array(n);
  for (let h = 1; h < n; h++) {
    let a = 0; const x = i / 4;
    if (name === 'basic') a = h === 1 ? 1 : (1 - x) * (h % 2 ? 1 / (h * h) : 0) * (x < 0.5 ? 1 : 0) + x * (1 / h) * (x <= 0.75 ? 1 : h % 2 ? 1.2 : 0);
    else if (name === 'vocal') { const fm = [3 + x * 4, 9 + x * 6, 14 + x * 3]; a = fm.reduce((s, c, k) => s + Math.exp(-Math.pow(h - c, 2) / (2 + k)) / (k + 1), 0) + (h === 1 ? 0.4 : 0); }
    else a = (h % (2 + Math.floor(x * 4)) === 1 ? 1 : 0.15) / Math.pow(h, 0.6 + (1 - x) * 0.8);
    im[h] = a;
  }
  const w = ctx.createPeriodicWave(re, im); WT_CACHE.set(key, w); return w;
}
class WaveSynth extends PolyBase {
  noteOn(note, time, vel, dur, rv, mpe) {
    const p = this.t.inst, f = mtof(note), amp = ctx.createGain(), lp = ctx.createBiquadFilter(), srcs = [], n = Math.max(1, Math.round(p.voices)); lp.type = 'lowpass'; lp.frequency.value = p.cutoff; lp.Q.value = p.res;
    const pos0 = clamp(p.pos, 0, 1), pos1 = clamp(p.pos + p.posEnv, 0, 1), fr0 = pos0 * 4, i0 = Math.min(3, Math.floor(fr0));
    const ga = ctx.createGain(), gb = ctx.createGain(); ga.connect(lp); gb.connect(lp);
    const mix = pos => { const fr = pos * 4 - i0; return clamp(fr, 0, 1); };
    ga.gain.setValueAtTime(1 - mix(pos0), time); gb.gain.setValueAtTime(mix(pos0), time); ga.gain.setTargetAtTime(1 - mix(pos1), time + 0.001, p.posDecay / 3); gb.gain.setTargetAtTime(mix(pos1), time + 0.001, p.posDecay / 3);
    for (let k = 0; k < n; k++) { const det = n > 1 ? (k / (n - 1) - 0.5) * p.spread : 0; [[i0, ga], [Math.min(4, i0 + 1), gb]].forEach(([fi, g]) => { const o = ctx.createOscillator(); o.setPeriodicWave(wavetable(p.table, fi)); o.frequency.value = f; o.detune.value = det; o.connect(g); srcs.push(o); mpeBend([o.frequency], time, dur, mpe, f); }); }
    lp.connect(amp); amp.connect(this.out); adsr(amp, time, p, vel, 0.5 / Math.sqrt(n)); srcs.forEach(s => s.start(time));
    return this.finish({ amp, srcs }, time, dur, rv);
  }
}
class EPiano extends PolyBase {
  constructor(t) { super(t); this.trem = ctx.createGain(); this.lfo = ctx.createOscillator(); this.lfoG = ctx.createGain(); this.ws = ctx.createWaveShaper(); this.lfo.connect(this.lfoG); this.lfoG.connect(this.trem.gain); this.lfo.start(); this.ws.connect(this.trem); this.trem.connect(this.out); this.update(); }
  update() { super.update(); if (!this.lfo) return; const p = this.t.inst; this.lfo.frequency.value = p.tremRate; this.lfoG.gain.value = p.trem * 0.45; this.trem.gain.value = 1 - p.trem * 0.45; const c = new Float32Array(256), k = 1 + p.drive * 8; for (let i = 0; i < 256; i++) { const x = i / 127.5 - 1; c[i] = Math.tanh(k * x) / Math.tanh(k); } this.ws.curve = c; }
  relTime() { return this.t.inst.release; }
  noteOn(note, time, vel, dur, rv, mpe) {
    const p = this.t.inst, f = mtof(note), car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain(), tn = ctx.createOscillator(), tg = ctx.createGain(), amp = ctx.createGain();
    car.frequency.value = f; mod.frequency.value = f; const idx = (0.3 + p.tone * 3) * f * (0.4 + vel); mg.gain.setValueAtTime(idx, time); mg.gain.setTargetAtTime(idx * 0.15, time, 0.25 + p.decay * 0.1); mod.connect(mg); mg.connect(car.frequency);
    tn.frequency.value = f * 14; tg.gain.setValueAtTime(p.tine * f * 4 * vel, time); tg.gain.setTargetAtTime(0, time, 0.012); tn.connect(tg); tg.connect(car.frequency);
    const dk = p.decay * (note < 60 ? 1.4 : 1 - (note - 60) / 120); amp.gain.setValueAtTime(0, time); amp.gain.linearRampToValueAtTime(vel * 0.7, time + 0.003); amp.gain.setTargetAtTime(0, time + 0.003, dk / 3);
    mpeBend([car.frequency, mod.frequency], time, dur, mpe, f);
    car.connect(amp); amp.connect(this.ws); [car, mod, tn].forEach(s => s.start(time)); return this.finish({ amp, srcs: [car, mod, tn] }, time, dur, rv);
  }
  dispose() { try { this.lfo.stop(); } catch (e) { } }
}
class PluckString extends PolyBase {
  relTime() { return 0.08; }
  noteOn(note, time, vel, dur, rv) {
    const p = this.t.inst, sr = ctx.sampleRate, f = mtof(note), N = Math.max(2, Math.round(sr / f)), len = Math.floor(sr * Math.min(8, p.decay * (note < 48 ? 1.3 : 1))), buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    const line = new Float32Array(N); let lp = 0; for (let i = 0; i < N; i++) { const w = Math.random() * 2 - 1; lp = lp + (w - lp) * (0.15 + p.bright * 0.85); line[i] = lp * vel; }
    const pk = Math.max(1, Math.round(N * p.pick)); for (let i = N - 1; i >= pk; i--) line[i] -= line[i - pk]; // pick position comb
    const loss = Math.pow(0.001, 1 / (p.decay * f)), a = 0.5 - p.damp * 0.45; let idx = 0, prev = 0;
    for (let i = 0; i < len; i++) { const cur = line[idx], nx = line[(idx + 1) % N], y = loss * ((1 - a) * cur + a * nx); d[i] = cur; line[idx] = y * 0.5 + prev * 0.5 * (p.damp) + y * 0.5 * (1 - p.damp); prev = y; idx = (idx + 1) % N; }
    const s = ctx.createBufferSource(), amp = ctx.createGain(), body = ctx.createBiquadFilter(); body.type = 'lowpass'; body.frequency.value = p.body; s.buffer = buf; s.connect(body); body.connect(amp); amp.connect(this.out); amp.gain.value = 0.9; s.start(time);
    return this.finish({ amp, srcs: [s] }, time, dur, rv);
  }
}
class MultiSampler extends PolyBase {
  relTime() { return this.t.inst.R; }
  noteOn(note, time, vel, dur, rv, mpe) {
    const p = this.t.inst, zs = (p.zones || []).filter(z => note >= z.lo && note <= z.hi && vel * 127 >= (z.vlo || 0) && vel * 127 <= (z.vhi == null ? 127 : z.vhi) && SAMPLES.get(z.sampleId)); if (!zs.length) return null;
    const amp = ctx.createGain(), srcs = []; amp.connect(this.out); amp.gain.setValueAtTime(0, time); amp.gain.linearRampToValueAtTime(vel, time + p.A);
    zs.forEach(z => { const s = ctx.createBufferSource(), g = ctx.createGain(); s.buffer = SAMPLES.get(z.sampleId).buf; const r0 = Math.pow(2, (note - z.root) / 12); s.playbackRate.value = r0; g.gain.value = dbToGain(z.gain || 0); s.connect(g); g.connect(amp); s.start(time); srcs.push(s);
      if (mpe && mpe.pb && mpe.pb.length && dur) { s.playbackRate.setValueAtTime(r0 * Math.pow(2, mpe.pb[0].v / 12), time); mpe.pb.forEach(q => s.playbackRate.linearRampToValueAtTime(r0 * Math.pow(2, q.v / 12), time + q.t * dur)); } });
    return this.finish({ amp, srcs }, time, dur, rv);
  }
}
const INST2_CLS = { fm: FMSynth, wave: WaveSynth, epiano: EPiano, pluck: PluckString, multi: MultiSampler };
// a key name in a file name ("Piano C3.wav", "Bass_F#2") sets the zone's root note
function rootFromName(name) { const m = String(name).match(/(?:^|[^A-Za-z])([A-G])(#|b)?(-?\d)(?![\d])/); if (!m) return 60; const pc = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); return clamp((+m[3] + 2) * 12 + pc, 0, 127); }
function spreadZones(inst) { const zs = [...inst.zones].sort((a, b) => a.root - b.root); zs.forEach((z, i) => { z.lo = i ? Math.floor((zs[i - 1].root + z.root) / 2) + 1 : 0; z.hi = i < zs.length - 1 ? Math.floor((z.root + zs[i + 1].root) / 2) : 127; }); inst.zones = zs; }
function inst2Card(t) {
  const type = t.inst.type, c = cardShell(INST_NAMES[type], INST_BLURB[type], { wide: true, tools: '<button class="ic dtool" data-ipre title="Instrument presets" aria-label="Instrument presets">☰</button>' }), body = $('.cb', c), inst = RT.get(t.id).inst;
  const tip = document.createElement('p'); tip.className = 'muted small'; tip.textContent = 'Play it from your computer keyboard (M turns it on) or a MIDI controller.'; body.appendChild(tip);
  if (type === 'multi') {
    const zl = document.createElement('div'); zl.className = 'zones';
    zl.innerHTML = (t.inst.zones.length ? t.inst.zones.map((z, i) => `<div class="zone"><b>${esc((SAMPLES.get(z.sampleId) || {}).name || 'Missing sample')}</b><label>Root <input type="number" min="0" max="127" value="${z.root}" data-zk="root" data-zi="${i}"></label><span class="muted">${noteName(z.lo)}–${noteName(z.hi)}</span><label>Vel <input type="number" min="0" max="127" value="${z.vlo || 0}" data-zk="vlo" data-zi="${i}">–<input type="number" min="0" max="127" value="${z.vhi == null ? 127 : z.vhi}" data-zk="vhi" data-zi="${i}"></label><button class="hb" data-zdel="${i}" title="Remove zone">✕</button></div>`).join('') : '<p class="muted">Drop samples here from the browser or your desktop. Each one becomes a zone; a note name in the file name (like "Piano C3") sets its root.</p>') +
      '<div class="row tight"><button class="btn ghostb tiny" data-zadd>Add samples…</button><button class="btn ghostb tiny" data-zspread>Spread zones across the keyboard</button></div>';
    zl.onclick = async e => { const d = e.target.closest('[data-zdel]'); if (d) { pushUndo('Remove zone'); t.inst.zones.splice(+d.dataset.zdel, 1); ui.detail(); return; }
      if (e.target.closest('[data-zspread]')) { pushUndo('Spread zones'); spreadZones(t.inst); ui.detail(); return; }
      if (e.target.closest('[data-zadd]')) { const fs = await pickFile('audio', 'audio/*', true); if (!fs.length) return; pushUndo('Add zones'); for (const f of fs) { const sid = await loadAudioFile(f); if (sid) t.inst.zones.push({ sampleId: sid, root: rootFromName(f.name), lo: 0, hi: 127 }); } spreadZones(t.inst); ui.detail(); } };
    zl.onchange = e => { const x = e.target.closest('[data-zk]'); if (!x) return; pushUndo('Zone'); const z = t.inst.zones[+x.dataset.zi]; z[x.dataset.zk] = clamp(+x.value, 0, 127); if (x.dataset.zk === 'root') spreadZones(t.inst); ui.detail(); };
    zl.querySelectorAll('input').forEach(x => x.addEventListener('keydown', e => e.stopPropagation()));
    zl.addEventListener('dragover', e => e.preventDefault());
    zl.addEventListener('drop', async e => { e.preventDefault(); e.stopPropagation(); const sbs = e.dataTransfer.getData('sb/sample'); const items = sbs ? [JSON.parse(sbs)] : [...e.dataTransfer.files].map(f => ({ file: f })); pushUndo('Add zones');
      for (const f of items) { let sid = f.sid || null, name = ''; if (!sid && f.path) { sid = await loadAudioPath(f.path); name = basename(f.path); } else if (!sid && f.fileId) { const wf = WEB_FILES.get(f.fileId); if (wf) { sid = await loadAudioFile({ name: wf.name, path: null, data: await wf.arrayBuffer() }); name = wf.name; } } else if (!sid && f.file) { sid = await loadAudioFile({ name: f.file.name, path: null, data: await f.file.arrayBuffer() }); name = f.file.name; }
        if (sid) t.inst.zones.push({ sampleId: sid, root: rootFromName(name || (SAMPLES.get(sid) || {}).name), lo: 0, hi: 127 }); }
      spreadZones(t.inst); ui.detail(); });
    body.appendChild(zl);
  }
  body.appendChild(paramGrid(INST2_PARAMS[type], t.inst, () => { inst.update && inst.update(); markDirty(); }));
  return c;
}
