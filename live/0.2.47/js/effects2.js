/* ============ Patina: one-knob vintage character, in the spirit of retro colour plug-ins ============
   Six modules, each with an on switch and an amount: Noise (vinyl crackle, tape hiss, mains hum), Wobble (wow and
   flutter), Distort, Digital (bit depth and sample rate), Space (a small room) and Magnetic (tape saturation, high
   loss and dropouts). Magnitude scales every module at once. */
const PATINA_BUF = {};
function patinaBuffer(kind) {
  const c = ctx, key = kind + c.sampleRate + (c === LIVE_CTX ? 'L' : 'O'); if (PATINA_BUF[key] && PATINA_BUF[key].ctx === c) return PATINA_BUF[key].b;
  const sr = c.sampleRate, n = Math.floor(sr * (kind === 'drop' ? 7 : 4)), b = c.createBuffer(kind === 'drop' ? 1 : 2, n, sr);
  for (let ch = 0; ch < b.numberOfChannels; ch++) {
    const d = b.getChannelData(ch);
    if (kind === 'vinyl') { let lp = 0; for (let i = 0; i < n; i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.02; d[i] = lp * 0.25; if (Math.random() < 0.00025) { const a = (Math.random() * 0.8 + 0.2) * (Math.random() < 0.5 ? -1 : 1); for (let k = 0; k < 40 && i + k < n; k++) d[i + k] += a * Math.exp(-k / 6); } if (Math.random() < 0.00001) { for (let k = 0; k < 300 && i + k < n; k++) d[i + k] += (Math.random() * 2 - 1) * 0.6 * Math.exp(-k / 90); } } }
    else if (kind === 'hiss') { let a = 0, bq = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; a = 0.6 * a + 0.4 * w; bq = w - a; d[i] = bq * 0.35; } }
    else if (kind === 'drop') { let g = 1, target = 1; for (let i = 0; i < n; i++) { if (Math.random() < 0.6 / sr) target = 0.15 + Math.random() * 0.5; else if (target < 1 && Math.random() < 6 / sr) target = 1; g += (target - g) * 0.0015; d[i] = g; } }
  }
  PATINA_BUF[key] = { ctx: c, b }; return b;
}
function roomIR(c, secs = 0.7) {
  const sr = c.sampleRate, n = Math.floor(sr * secs), b = c.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let lp = 0; for (let i = 0; i < n; i++) { lp += ((Math.random() * 2 - 1) - lp) * 0.35; d[i] = lp * Math.exp(-6 * i / n) * (i < sr * 0.004 ? i / (sr * 0.004) : 1); } }
  return b;
}
class PatinaDev extends Base {
  constructor(d) {
    super(d); this.wetDry(); const c = ctx;
    // wobble: a short delay whose time is moved by a slow and a fast oscillator
    this.wob = c.createDelay(0.05); this.wob.delayTime.value = 0.012;
    this.wow = c.createOscillator(); this.wowG = c.createGain(); this.wow.frequency.value = 0.55; this.wow.connect(this.wowG); this.wowG.connect(this.wob.delayTime); this.wow.start();
    this.flt = c.createOscillator(); this.fltG = c.createGain(); this.flt.frequency.value = 7.5; this.flt.connect(this.fltG); this.fltG.connect(this.wob.delayTime); this.flt.start();
    // distort
    this.dPre = c.createGain(); this.dSh = c.createWaveShaper(); this.dSh.oversample = '2x'; this.dPost = c.createGain();
    // digital
    this.crush = PITCH_OK ? new AudioWorkletNode(c, 'gw-crush', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] }) : c.createGain();
    // magnetic: tape curve, high loss and dropouts
    this.mSh = c.createWaveShaper(); this.mPost = c.createGain(); this.mLp = c.createBiquadFilter(); this.mLp.type = 'lowpass'; this.mDrop = c.createGain();
    this.dropSrc = c.createBufferSource(); this.dropSrc.buffer = patinaBuffer('drop'); this.dropSrc.loop = true; this.dropAmt = c.createGain(); this.dropSrc.connect(this.dropAmt); this.dropAmt.connect(this.mDrop.gain); this.dropSrc.start();
    // tone tilt
    this.tLo = c.createBiquadFilter(); this.tLo.type = 'lowshelf'; this.tLo.frequency.value = 400; this.tHi = c.createBiquadFilter(); this.tHi.type = 'highshelf'; this.tHi.frequency.value = 2500;
    // space: a small room in parallel
    this.room = c.createConvolver(); this.room.buffer = roomIR(c); this.roomG = c.createGain(); this.dryG = c.createGain(); this.sum = c.createGain();
    // noise beds
    this.nV = c.createBufferSource(); this.nV.buffer = patinaBuffer('vinyl'); this.nV.loop = true; this.nH = c.createBufferSource(); this.nH.buffer = patinaBuffer('hiss'); this.nH.loop = true;
    this.hum = c.createOscillator(); this.hum.type = 'sawtooth'; this.humLp = c.createBiquadFilter(); this.humLp.type = 'lowpass'; this.humLp.frequency.value = 400;
    this.gV = c.createGain(); this.gH = c.createGain(); this.gHum = c.createGain(); this.nTone = c.createBiquadFilter(); this.nTone.type = 'lowpass';
    this.nV.connect(this.gV); this.nH.connect(this.gH); this.hum.connect(this.humLp); this.humLp.connect(this.gHum); [this.gV, this.gH, this.gHum].forEach(g => g.connect(this.nTone)); this.nV.start(0, Math.random() * 3); this.nH.start(0, Math.random() * 3); this.hum.start();
    this.out2 = c.createGain();
    this.input.connect(this.wob); this.wob.connect(this.dPre); this.dPre.connect(this.dSh); this.dSh.connect(this.dPost); this.dPost.connect(this.crush); this.crush.connect(this.mSh);
    this.mSh.connect(this.mPost); this.mPost.connect(this.mLp); this.mLp.connect(this.mDrop); this.mDrop.connect(this.tLo); this.tLo.connect(this.tHi);
    this.tHi.connect(this.dryG); this.tHi.connect(this.room); this.room.connect(this.roomG); this.dryG.connect(this.sum); this.roomG.connect(this.sum); this.nTone.connect(this.sum);
    this.sum.connect(this.out2); this.out2.connect(this.wet);
    [this.gV, this.gH, this.gHum, this.roomG, this.wowG, this.fltG, this.dropAmt].forEach(g => (g.gain.value = 0)); // start silent, then ease to the settings
    this.set();
  }
  set() {
    const p = this.d.p, M = p.magnitude, on = k => (p[k + 'On'] ? p[k] * M : 0);
    // wobble: up to ±3 ms of slow wow and ±0.4 ms of fast flutter
    sm(this.wowG.gain, 0.003 * on('wobble') * (p.wobbleWow || 0.7)); sm(this.fltG.gain, 0.0004 * on('wobble') * (1 - (p.wobbleWow || 0.7) * 0.6)); this.wow.frequency.value = 0.35 + (p.wobbleRate || 0.5) * 0.8;
    // distort
    const dr = on('distort'); if (this._dk !== dr + p.distortType) { this._dk = dr + p.distortType; const k = 1 + dr * 25, cv = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; cv[i] = p.distortType === 'transistor' ? Math.max(-1, Math.min(1, x * k)) * 0.9 : p.distortType === 'tape' ? Math.tanh(k * x * 0.7) / Math.tanh(k * 0.7) : (x >= 0 ? Math.tanh(k * x) / Math.tanh(k) : Math.tanh(k * x * 0.8) / Math.tanh(k * 0.8)); } this.dSh.curve = cv; }
    { const k = 1 + dr * 25, g0 = p.distortType === 'transistor' ? k * 0.9 : p.distortType === 'tape' ? k * 0.7 / Math.tanh(k * 0.7) : k / Math.tanh(k); sm(this.dPost.gain, Math.pow(g0, -0.85)); } // keep the level about the same as it drives harder
    // digital
    if (this.crush.port) { const dg = on('digital'); this.crush.port.postMessage({ bits: dg > 0 ? 16 - dg * 12 : 32, rate: dg > 0 ? Math.max(2000, 44100 * Math.pow(1 - dg, 1.6)) : 0 }); }
    // magnetic
    const mg = on('magnetic'); if (this._mk !== mg) { this._mk = mg; const k = 1 + mg * 6, cv = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; cv[i] = Math.tanh(k * x) / Math.tanh(k); } this.mSh.curve = cv; } { const k = 1 + mg * 6; sm(this.mPost.gain, Math.pow(k / Math.tanh(k), -0.85)); }
    sm(this.mLp.frequency, 20000 * Math.pow(0.15, mg)); this.mDrop.gain.value = 1 - mg * (p.dropouts || 0.5); this.dropAmt.gain.value = mg * (p.dropouts || 0.5);
    // tone tilt and space
    sm(this.tLo.gain, -p.tone * 6); sm(this.tHi.gain, p.tone * 6);
    const sp = on('space'); sm(this.roomG.gain, sp * 0.6); sm(this.dryG.gain, 1 - sp * 0.25);
    // noise
    const nz = on('noise'); sm(this.gV.gain, p.noiseType === 'vinyl' ? nz * 0.25 : 0); sm(this.gH.gain, p.noiseType === 'tape hiss' ? nz * 0.12 : 0); sm(this.gHum.gain, p.noiseType === 'hum' ? nz * 0.06 : 0);
    this.hum.frequency.value = p.humHz || 60; sm(this.nTone.frequency, 1500 + (p.noiseTone || 0.5) * 12000);
    sm(this.out2.gain, dbToGain(p.out)); this.mix(p.mix);
  }
  dispose() { super.dispose(); [this.wow, this.flt, this.dropSrc, this.nV, this.nH, this.hum].forEach(s => { try { s.stop(); } catch (e) { } }); }
}
DEVICES.patina = { name: 'Patina', blurb: 'Vintage character', cls: PatinaDev, wide: true, cols: true,
  def: () => ({ magnitude: 0.7, noiseOn: true, noise: 0.35, noiseType: 'vinyl', noiseTone: 0.5, humHz: 60, wobbleOn: true, wobble: 0.4, wobbleWow: 0.7, wobbleRate: 0.5, distortOn: true, distort: 0.3, distortType: 'tube', digitalOn: false, digital: 0.3, spaceOn: false, space: 0.3, magneticOn: true, magnetic: 0.4, dropouts: 0.3, tone: -0.2, mix: 1, out: 0 }),
  params: [K('magnitude', 'Magnitude', 0, 1, { fmt: fPct }), K('tone', 'Tone', -1, 1, { fmt: v => (v < -0.02 ? 'Dark ' : v > 0.02 ? 'Bright ' : '') + Math.round(Math.abs(v) * 100) }), K('mix', 'Mix', 0, 1, { fmt: fPct }), K('out', 'Output', -12, 12, { fmt: fDb }),
    { group: 'Noise' }, TOG('noiseOn', 'On'), K('noise', 'Amount', 0, 1, { fmt: fPct }), SEL('noiseType', 'Type', ['vinyl', 'tape hiss', 'hum']), K('noiseTone', 'Tone', 0, 1, { fmt: fPct }), SEL('humHz', 'Hum', [[50, '50 Hz'], [60, '60 Hz']]),
    { group: 'Wobble' }, TOG('wobbleOn', 'On'), K('wobble', 'Amount', 0, 1, { fmt: fPct }), K('wobbleWow', 'Wow mix', 0, 1, { fmt: v => Math.round(v * 100) + '% wow' }), K('wobbleRate', 'Rate', 0, 1, { fmt: fPct }),
    { group: 'Distort' }, TOG('distortOn', 'On'), K('distort', 'Amount', 0, 1, { fmt: fPct }), SEL('distortType', 'Type', ['tube', 'tape', 'transistor']),
    { group: 'Digital' }, TOG('digitalOn', 'On'), K('digital', 'Amount', 0, 1, { fmt: fPct }),
    { group: 'Space' }, TOG('spaceOn', 'On'), K('space', 'Amount', 0, 1, { fmt: fPct }),
    { group: 'Magnetic' }, TOG('magneticOn', 'On'), K('magnetic', 'Amount', 0, 1, { fmt: fPct }), K('dropouts', 'Dropouts', 0, 1, { fmt: fPct })] };

/* ============ Orbit: atmosphere for melodies, in the spirit of one-screen multi-effects ============
   Four modules in a row, each with an on switch, a type and an amount: Wow (tape pitch wobble), Modulation (chorus,
   phaser or flanger), Delay (tape or granular) and Reverb (hall or shimmer, an octave-up reverb that keeps rising). */
function hallIR(c, secs, tone) {
  const sr = c.sampleRate, n = Math.floor(sr * Math.min(12, secs * 1.15 + 0.1)), b = c.createBuffer(2, n, sr), k = Math.log(1000) / (secs * sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch); let lp = 0;
    for (let i = 0; i < n; i++) { const a = 0.55 - 0.45 * Math.min(1, i / n * 2) * (1 - tone); lp += ((Math.random() * 2 - 1) - lp) * a; d[i] = lp * Math.exp(-k * i) * Math.min(1, i / (sr * 0.012)); }
    [0.011, 0.017, 0.023, 0.031, 0.043].forEach((t, j) => { const i = Math.floor((t + ch * 0.0023) * sr); if (i < n) d[i] += (0.5 - j * 0.08) * (j % 2 ? -1 : 1); });   // a few early reflections
  }
  return b;
}
class OrbitDev extends Base {
  constructor(d) {
    super(d); this.wetDry(); const c = ctx, G = () => c.createGain(), osc = (f, type = 'sine') => { const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; };
    const section = () => { const i = G(), dry = G(), fx = G(), o = G(); i.connect(dry); dry.connect(o); fx.connect(o); return { i, dry, fx, o }; };
    // wow and flutter
    this.wob = c.createDelay(0.05); this.wob.delayTime.value = 0.01; this.wowL = osc(0.6); this.wowG = G(); this.fltL = osc(6.8); this.fltG = G(); this.wowL.connect(this.wowG); this.wowG.connect(this.wob.delayTime); this.fltL.connect(this.fltG); this.fltG.connect(this.wob.delayTime);
    // modulation: chorus (two voices panned apart), flanger (short delay with feedback), phaser (six all-passes with feedback)
    this.M = section(); this.modL = osc(0.5); this.modDepth = G(); this.modL.connect(this.modDepth); this.modInv = G(); this.modInv.gain.value = -1; this.modDepth.connect(this.modInv);
    this.cA = c.createDelay(0.05); this.cB = c.createDelay(0.05); this.cA.delayTime.value = 0.012; this.cB.delayTime.value = 0.015; this.modDepth.connect(this.cA.delayTime); this.modInv.connect(this.cB.delayTime);
    this.pA = c.createStereoPanner(); this.pA.pan.value = -0.8; this.pB = c.createStereoPanner(); this.pB.pan.value = 0.8; this.chG = G();
    this.M.i.connect(this.cA); this.M.i.connect(this.cB); this.cA.connect(this.pA); this.cB.connect(this.pB); this.pA.connect(this.chG); this.pB.connect(this.chG); this.chG.connect(this.M.fx);
    this.fl = c.createDelay(0.02); this.fl.delayTime.value = 0.003; this.flFb = G(); this.flFb.gain.value = 0.65; this.flDepth = G(); this.modL.connect(this.flDepth); this.flDepth.connect(this.fl.delayTime); this.flG = G();
    this.M.i.connect(this.fl); this.fl.connect(this.flFb); this.flFb.connect(this.fl); this.fl.connect(this.flG); this.flG.connect(this.M.fx);
    this.aps = [0, 1, 2, 3, 4, 5].map(() => { const f = c.createBiquadFilter(); f.type = 'allpass'; f.frequency.value = 800; f.Q.value = 0.6; return f; }); this.phDepth = G(); this.modL.connect(this.phDepth); this.aps.forEach(f => this.phDepth.connect(f.frequency));
    this.phFb = G(); this.phFb.gain.value = 0.35; this.phG = G(); this.M.i.connect(this.aps[0]); this.aps.reduce((a, b) => (a.connect(b), b)); this.phD = c.createDelay(0.01); this.phD.delayTime.value = 0.003; this.aps[5].connect(this.phFb); this.phFb.connect(this.phD); this.phD.connect(this.aps[0]); this.aps[5].connect(this.phG); this.phG.connect(this.M.fx);
    // delay: tape (feedback, darkening, a little wow) or granular
    this.D = section(); this.td = c.createDelay(4); this.tdFb = G(); this.tdLp = c.createBiquadFilter(); this.tdLp.type = 'lowpass'; this.tdLp.frequency.value = 3800; this.tdW = G(); this.tdWow = osc(0.45); this.tdWowG = G(); this.tdWowG.gain.value = 0.0012; this.tdWow.connect(this.tdWowG); this.tdWowG.connect(this.td.delayTime); this.tdG = G();
    this.D.i.connect(this.td); this.td.connect(this.tdLp); this.tdLp.connect(this.tdFb); this.tdFb.connect(this.td); this.tdLp.connect(this.tdG); this.tdG.connect(this.D.fx);
    this.gr = PITCH_OK ? new AudioWorkletNode(c, 'gw-grain', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] }) : G(); this.grG = G(); this.D.i.connect(this.gr); this.gr.connect(this.grG); this.grG.connect(this.D.fx);
    // reverb: hall, with an optional octave-up feedback loop for shimmer
    this.R = section(); this.pre = c.createDelay(0.2); this.pre.delayTime.value = 0.02; this.verb = c.createConvolver(); this.shift = PITCH_OK ? new AudioWorkletNode(c, 'gw-shift', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] }) : G();
    this.shLp = c.createBiquadFilter(); this.shLp.type = 'lowpass'; this.shLp.frequency.value = 7000; this.shHp = c.createBiquadFilter(); this.shHp.type = 'highpass'; this.shHp.frequency.value = 300; this.shG = G(); this.shG.gain.value = 0;
    this.R.i.connect(this.pre); this.pre.connect(this.verb); this.verb.connect(this.R.fx); this.verb.connect(this.shift); this.shift.connect(this.shHp); this.shHp.connect(this.shLp); this.shD = c.createDelay(0.2); this.shD.delayTime.value = 0.03; this.shLp.connect(this.shG); this.shG.connect(this.shD); this.shD.connect(this.verb);
    this.out2 = G();
    [this.wowG, this.fltG, this.modDepth, this.flDepth, this.phDepth, this.chG, this.flG, this.phG, this.M.fx, this.D.fx, this.R.fx, this.tdG, this.grG, this.tdFb].forEach(g => (g.gain.value = 0)); // start still, then ease to the settings
    this.input.connect(this.wob); this.wob.connect(this.M.i); this.M.o.connect(this.D.i); this.D.o.connect(this.R.i); this.R.o.connect(this.out2); this.out2.connect(this.wet);
    this.set();
  }
  set() {
    const p = this.d.p, on = k => (p[k + 'On'] ? p[k] : 0), A = 0.0025;
    // wow
    const w = on('wow'); sm(this.wowG.gain, 0.0035 * w); sm(this.fltG.gain, 0.00035 * w); this.wowL.frequency.value = 0.3 + p.wowRate * 1.4;
    // modulation
    const m = on('mod'), t = p.modType; this.modL.frequency.value = 0.05 + Math.pow(p.modRate, 2) * 6;
    sm(this.modDepth.gain, t === 'chorus' ? 0.004 : 0); sm(this.flDepth.gain, t === 'flanger' ? 0.0022 : 0); sm(this.phDepth.gain, t === 'phaser' ? 650 : 0);
    sm(this.chG.gain, t === 'chorus' ? 1 : 0); sm(this.flG.gain, t === 'flanger' ? 1 : 0); sm(this.phG.gain, t === 'phaser' ? 1 : 0);
    sm(this.M.fx.gain, m); sm(this.M.dry.gain, t === 'chorus' ? 1 - m * 0.3 : 1 - m * 0.5);
    // delay
    const dl = on('delay'), secs = clamp(p.delaySync ? divSec(p.delayDiv) : p.delayMs / 1000, 0.02, 3.9); sm(this.td.delayTime, secs, 0.05); sm(this.tdFb.gain, p.delayType === 'tape' ? p.feedback : 0);
    if (this.gr.port) this.gr.port.postMessage({ time: secs, fb: Math.min(0.85, p.feedback * 0.85), size: 0.04 + p.grain * 0.16, density: 8 + p.grain * 20, scatter: 0.02 + p.grain * 0.12, octave: p.grain * 0.35, reverse: p.grain * 0.3 });
    sm(this.tdG.gain, p.delayType === 'tape' ? 1 : 0); sm(this.grG.gain, p.delayType === 'granular' ? 1.2 : 0); sm(this.D.fx.gain, dl * 0.8);
    // reverb
    const rv = on('verb'), key = (p.verbSize).toFixed(2) + p.verbTone.toFixed(2); if (key !== this._ir) { clearTimeout(this._irT); const first = !this._ir; this._ir = key; const mk = () => { this.verb.buffer = hallIR(this.verb.context, 0.8 + p.verbSize * 9, p.verbTone); }; if (first) mk(); else this._irT = setTimeout(mk, 180); }
    sm(this.shG.gain, p.verbType === 'shimmer' ? 0.45 : 0); if (this.shift.port) this.shift.port.postMessage({ semis: 12 }); sm(this.shLp.frequency, 3000 + p.verbTone * 9000);
    sm(this.R.fx.gain, rv * 0.9); sm(this.R.dry.gain, 1 - rv * 0.2); sm(this.pre.delayTime, 0.005 + p.verbSize * 0.06);
    sm(this.out2.gain, dbToGain(p.out)); this.mix(p.mix);
  }
  onTempo() { if (this.d.p.delaySync) this.set(); }
  dispose() { super.dispose(); clearTimeout(this._irT); [this.wowL, this.fltL, this.modL, this.tdWow].forEach(o => { try { o.stop(); } catch (e) { } }); [this.gr, this.shift].forEach(n => { try { n.disconnect(); } catch (e) { } }); }
}
DEVICES.orbit = { name: 'Orbit', blurb: 'Reverb, delay, modulation, wobble', cls: OrbitDev, wide: true, cols: true,
  def: () => ({ mix: 1, out: 0, verbOn: true, verbType: 'hall', verb: 0.35, verbSize: 0.45, verbTone: 0.5, delayOn: false, delayType: 'tape', delay: 0.3, delaySync: true, delayDiv: '1/4D', delayMs: 375, feedback: 0.35, grain: 0.5, modOn: false, modType: 'chorus', mod: 0.4, modRate: 0.35, wowOn: false, wow: 0.3, wowRate: 0.3 }),
  params: [K('mix', 'Mix', 0, 1, { fmt: fPct }), K('out', 'Output', -12, 12, { fmt: fDb }),
    { group: 'Wow' }, TOG('wowOn', 'On'), K('wow', 'Amount', 0, 1, { fmt: fPct }), K('wowRate', 'Speed', 0, 1, { fmt: fPct }),
    { group: 'Modulation' }, TOG('modOn', 'On'), SEL('modType', 'Type', ['chorus', 'phaser', 'flanger']), K('mod', 'Amount', 0, 1, { fmt: fPct }), K('modRate', 'Rate', 0, 1, { fmt: fPct }),
    { group: 'Delay' }, TOG('delayOn', 'On'), SEL('delayType', 'Type', ['tape', 'granular']), K('delay', 'Amount', 0, 1, { fmt: fPct }), TOG('delaySync', 'Sync'), SEL('delayDiv', 'Time', DIV_OPTS), K('delayMs', 'Time ms', 20, 2000, { scale: 'log', fmt: fMs }), K('feedback', 'Feedback', 0, 0.95, { fmt: fPct }), K('grain', 'Grain', 0, 1, { fmt: fPct }),
    { group: 'Reverb' }, TOG('verbOn', 'On'), SEL('verbType', 'Type', ['hall', 'shimmer']), K('verb', 'Amount', 0, 1, { fmt: fPct }), K('verbSize', 'Size', 0, 1, { fmt: fPct }), K('verbTone', 'Tone', 0, 1, { fmt: v => v < 0.35 ? 'Dark' : v > 0.65 ? 'Bright' : 'Neutral' })],
  presets: {
    'Dreamy keys': { modOn: true, modType: 'chorus', mod: 0.45, verb: 0.45, verbSize: 0.6, delayOn: true, delay: 0.2, wowOn: true, wow: 0.2 },
    'Shimmer pad': { verbType: 'shimmer', verb: 0.6, verbSize: 0.85, verbTone: 0.7, modOn: true, modType: 'chorus', mod: 0.3 },
    'Granular wash': { delayOn: true, delayType: 'granular', delay: 0.55, grain: 0.7, feedback: 0.5, verb: 0.5, verbSize: 0.75 },
    'Lo-fi tape echo': { wowOn: true, wow: 0.55, wowRate: 0.25, delayOn: true, delayType: 'tape', delay: 0.35, feedback: 0.45, verb: 0.2, verbTone: 0.25 },
    'Phased lead': { modOn: true, modType: 'phaser', mod: 0.7, modRate: 0.3, verb: 0.25, delayOn: true, delay: 0.2, delayDiv: '1/8D' },
    'Flanged and wide': { modOn: true, modType: 'flanger', mod: 0.6, modRate: 0.2, verb: 0.3 },
  } };
