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
