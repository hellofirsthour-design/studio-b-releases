/* ============ audio effects ============ */
const sm = (param, v, t = 0.015) => param.setTargetAtTime(v, ctx.currentTime, t);
class Base {
  constructor(d) { this.d = d; this.input = ctx.createGain(); this.output = ctx.createGain(); }
  wetDry() { this.dry = ctx.createGain(); this.wet = ctx.createGain(); this.input.connect(this.dry); this.dry.connect(this.output); this.wet.connect(this.output); }
  mix(m) { sm(this.dry.gain, Math.cos(m * Math.PI / 2)); sm(this.wet.gain, Math.sin(m * Math.PI / 2)); }
  onTempo() { } dispose() { try { this.input.disconnect(); this.output.disconnect(); } catch (e) { } }
}

/* --- Prism EQ: 8-band parametric with analyzer --- */
const EQ_TYPES = { bell: 'peaking', 'low shelf': 'lowshelf', 'high shelf': 'highshelf', 'low cut': 'highpass', 'high cut': 'lowpass', notch: 'notch', 'band pass': 'bandpass' };
class EQDev extends Base {
  constructor(d) {
    super(d); this.post = ctx.createGain(); this.post.connect(this.output);
    this.an = ctx.createAnalyser(); this.an.fftSize = 4096; this.an.smoothingTimeConstant = 0.8; this.post.connect(this.an);
    this.bandF = []; this.sig = ''; this.rebuild();
  }
  sigOf() { return this.d.p.bands.map(b => [b.on, b.type, b.slope].join()).join('|'); }
  rebuild() {
    try { this.input.disconnect(); } catch (e) { }
    this.bandF.flat().forEach(f => f.disconnect()); this.bandF = [];
    let prev = this.input;
    for (const b of this.d.p.bands) {
      const arr = [];
      if (b.on) {
        const cut = b.type === 'low cut' || b.type === 'high cut', n = cut ? b.slope / 12 : 1;
        for (let i = 0; i < n; i++) { const f = ctx.createBiquadFilter(); f.type = EQ_TYPES[b.type]; prev.connect(f); prev = f; arr.push(f); }
      }
      this.bandF.push(arr);
    }
    prev.connect(this.post); this.sig = this.sigOf(); this.apply(true);
  }
  apply(now) {
    this.d.p.bands.forEach((b, i) => (this.bandF[i] || []).forEach(f => {
      const cut = b.type === 'low cut' || b.type === 'high cut';
      const q = cut ? 20 * Math.log10(b.q) : b.q; // cut filters take Q in dB
      if (now) { f.frequency.value = b.f; f.gain.value = b.g; f.Q.value = q; } else { sm(f.frequency, b.f, 0.008); sm(f.gain, b.g, 0.008); sm(f.Q, q, 0.008); }
    }));
    sm(this.post.gain, dbToGain(this.d.p.out));
  }
  set() { if (this.sigOf() !== this.sig) this.rebuild(); else this.apply(); }
  response(freqs) {
    const mag = new Float32Array(freqs.length).fill(1), tmp = new Float32Array(freqs.length), ph = new Float32Array(freqs.length);
    this.bandF.flat().forEach(f => { f.getFrequencyResponse(freqs, tmp, ph); for (let i = 0; i < mag.length; i++) mag[i] *= tmp[i]; });
    return mag;
  }
  bandResponse(i, freqs) {
    const mag = new Float32Array(freqs.length).fill(1), tmp = new Float32Array(freqs.length), ph = new Float32Array(freqs.length);
    (this.bandF[i] || []).forEach(f => { f.getFrequencyResponse(freqs, tmp, ph); for (let k = 0; k < mag.length; k++) mag[k] *= tmp[k]; });
    return mag;
  }
}

/* --- Glue Comp --- */
class CompDev extends Base {
  constructor(d) { super(d); this.wetDry(); this.c = ctx.createDynamicsCompressor(); this.mk = ctx.createGain(); this.input.connect(this.c); this.c.connect(this.mk); this.mk.connect(this.wet); this.set(); }
  set() { const p = this.d.p, c = this.c; sm(c.threshold, p.thresh); sm(c.ratio, p.ratio); sm(c.attack, p.attack / 1000); sm(c.release, p.release / 1000); sm(c.knee, p.knee); sm(this.mk.gain, dbToGain(p.makeup)); this.mix(p.mix); }
}

/* --- Scorch: multi-style saturation --- */
function satCurve(style, drive) {
  const n = 4096, c = new Float32Array(n), k = dbToGain(drive);
  const bits = Math.round(clamp(16 - drive / 2.6, 2, 16)), q = Math.pow(2, bits - 1);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1; let y;
    switch (style) {
      case 'Tube': y = Math.tanh(k * x + 0.2 * k * x * x) ; break;
      case 'Tape': y = Math.atan(k * x * 1.4) / Math.atan(Math.max(1.4, k * 1.4)); break;
      case 'Transistor': { const z = k * x; y = clamp(z / Math.pow(1 + Math.pow(Math.abs(z), 6), 1 / 6), -1, 1); break; }
      case 'Fold': y = Math.sin(k * x * Math.PI / 2); break;
      case 'Crush': y = Math.round(clamp(x * Math.min(k, 4), -1, 1) * q) / q; break;
      default: y = Math.tanh(k * x);
    }
    c[i] = y;
  }
  return c;
}
class SatDev extends Base {
  constructor(d) {
    super(d); this.wetDry();
    this.lc = ctx.createBiquadFilter(); this.lc.type = 'highpass';
    this.sh = ctx.createWaveShaper(); this.sh.oversample = '4x';
    this.dc = ctx.createBiquadFilter(); this.dc.type = 'highpass'; this.dc.frequency.value = 12;
    this.lo = ctx.createBiquadFilter(); this.lo.type = 'lowshelf'; this.lo.frequency.value = 300;
    this.hi = ctx.createBiquadFilter(); this.hi.type = 'highshelf'; this.hi.frequency.value = 3000;
    this.og = ctx.createGain();
    this.input.connect(this.lc); this.lc.connect(this.sh); this.sh.connect(this.dc); this.dc.connect(this.lo); this.lo.connect(this.hi); this.hi.connect(this.og); this.og.connect(this.wet);
    this.set();
  }
  set() {
    const p = this.d.p, drive = p.drive + (p.punish ? 20 : 0);
    const key = p.style + drive; if (key !== this._k) { this.sh.curve = satCurve(p.style, drive); this._k = key; }
    sm(this.lc.frequency, p.lowcut); sm(this.lo.gain, -p.tone * 9); sm(this.hi.gain, p.tone * 9);
    sm(this.og.gain, dbToGain(p.out - (p.style === 'Crush' ? 0 : Math.min(drive, 30) * 0.42))); this.mix(p.mix);
  }
}

/* --- Driftline: tape echo with wow, flutter and saturating feedback --- */
class TapeDev extends Base {
  constructor(d) {
    super(d); this.wetDry();
    this.dl = ctx.createDelay(4); this.hp = ctx.createBiquadFilter(); this.hp.type = 'highpass'; this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass';
    this.sat = ctx.createWaveShaper(); this.sat.curve = satCurve('Tape', 6); this.fb = ctx.createGain(); this.pre = ctx.createGain();
    this.pan = ctx.createStereoPanner();
    this.input.connect(this.pre); this.pre.connect(this.dl); this.dl.connect(this.hp); this.hp.connect(this.lp); this.lp.connect(this.sat);
    this.sat.connect(this.fb); this.fb.connect(this.dl); this.sat.connect(this.pan); this.pan.connect(this.wet);
    this.wow = ctx.createOscillator(); this.wow.frequency.value = 0.6; this.wowG = ctx.createGain(); this.wow.connect(this.wowG); this.wowG.connect(this.dl.delayTime); this.wow.start();
    this.flt = ctx.createOscillator(); this.flt.frequency.value = 7.3; this.fltG = ctx.createGain(); this.flt.connect(this.fltG); this.fltG.connect(this.dl.delayTime); this.flt.start();
    this.sp = ctx.createOscillator(); this.sp.frequency.value = 0.21; this.spG = ctx.createGain(); this.sp.connect(this.spG); this.spG.connect(this.pan.pan); this.sp.start();
    this.set();
  }
  time() { const p = this.d.p; return clamp(p.sync ? divSec(p.div) : p.ms / 1000, 0.01, 3.9); }
  set() {
    const p = this.d.p; sm(this.dl.delayTime, this.time(), 0.05); sm(this.fb.gain, p.fb); sm(this.hp.frequency, p.lowcut); sm(this.lp.frequency, p.highcut);
    const k = 'T' + p.sat; if (k !== this._k) { this.sat.curve = satCurve('Tape', p.sat); this._k = k; }
    sm(this.pre.gain, dbToGain(-p.sat * 0.4)); sm(this.wowG.gain, p.wow * 0.004); sm(this.fltG.gain, p.flutter * 0.0006); sm(this.spG.gain, p.spread);
    this.mix(p.mix);
  }
  onTempo() { if (this.d.p.sync) this.set(); }
}

/* --- Echo Pair: stereo / ping-pong delay --- */
class DelayDev extends Base {
  constructor(d) {
    super(d); this.wetDry();
    this.sp = ctx.createChannelSplitter(2); this.mono = ctx.createGain(); this.mono.channelCount = 1; this.mono.channelCountMode = 'explicit';
    this.mg = ctx.createChannelMerger(2);
    this.L = ctx.createDelay(4); this.R = ctx.createDelay(4);
    this.fL = ctx.createBiquadFilter(); this.fR = ctx.createBiquadFilter(); this.fL.type = this.fR.type = 'bandpass';
    this.gL = ctx.createGain(); this.gR = ctx.createGain();
    this.L.connect(this.fL); this.R.connect(this.fR); this.fL.connect(this.gL); this.fR.connect(this.gR);
    this.fL.connect(this.mg, 0, 0); this.fR.connect(this.mg, 0, 1); this.mg.connect(this.wet);
    this.input.connect(this.sp); this.input.connect(this.mono);
    this.mode = null; this.set();
  }
  route(ping) {
    if (this.mode === ping) return; this.mode = ping;
    [this.sp, this.mono, this.gL, this.gR].forEach(n => { try { n.disconnect(); } catch (e) { } });
    if (ping) { this.mono.connect(this.L); this.gL.connect(this.R); this.gR.connect(this.L); }
    else { this.sp.connect(this.L, 0); this.sp.connect(this.R, 1); this.gL.connect(this.L); this.gR.connect(this.R); }
  }
  set() {
    const p = this.d.p; this.route(!!p.ping);
    const tL = p.sync ? divSec(p.divL) : p.msL / 1000, tR = p.sync ? divSec(p.divR) : p.msR / 1000;
    sm(this.L.delayTime, clamp(tL, 0.005, 3.9), 0.04); sm(this.R.delayTime, clamp(tR, 0.005, 3.9), 0.04);
    sm(this.gL.gain, p.fb); sm(this.gR.gain, p.fb);
    [this.fL, this.fR].forEach(f => { sm(f.frequency, p.freq); sm(f.Q, 0.25 + (1 - p.width) * 4); });
    this.mix(p.mix);
  }
  onTempo() { if (this.d.p.sync) this.set(); }
}

/* --- Space: algorithmic-IR convolution reverb --- */
class VerbDev extends Base {
  constructor(d) {
    super(d); this.c = ctx; this.wetDry();
    this.pd = ctx.createDelay(1); this.lc = ctx.createBiquadFilter(); this.lc.type = 'highpass'; this.cv = ctx.createConvolver();
    this.input.connect(this.pd); this.pd.connect(this.lc); this.lc.connect(this.cv); this.cv.connect(this.wet);
    this.set();
  }
  makeIR() {
    const c = this.c || ctx, p = this.d.p, sr = c.sampleRate, len = Math.floor(sr * clamp(p.decay * 1.3, 0.2, 14));
    const ir = c.createBuffer(2, len, sr), L = new Float32Array(len), R = new Float32Array(len);
    for (const arr of [L, R]) {
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr, env = Math.exp(-6.9 * t / p.decay);
        const fc = p.damp + (18000 - p.damp) * Math.exp(-t * 3 / p.decay);
        const a = Math.exp(-2 * Math.PI * fc / sr);
        lp = (1 - a) * (Math.random() * 2 - 1) + a * lp;
        arr[i] = lp * env * (t < 0.002 ? t / 0.002 : 1);
      }
      const er = Math.round(4 + p.size * 14);
      for (let e = 0; e < er; e++) { const at = Math.floor(sr * (0.004 + Math.random() * 0.07 * (0.3 + p.size))); if (at < len) arr[at] += (Math.random() - 0.5) * 0.9 * (1 - e / er); }
    }
    const w = p.width, ch0 = ir.getChannelData(0), ch1 = ir.getChannelData(1);
    for (let i = 0; i < len; i++) { const m = (L[i] + R[i]) / 2, s = (L[i] - R[i]) / 2 * w; ch0[i] = m + s; ch1[i] = m - s; }
    this.cv.buffer = ir;
  }
  set() {
    const p = this.d.p; sm(this.pd.delayTime, p.predelay / 1000); sm(this.lc.frequency, p.lowcut); this.mix(p.mix);
    const k = [p.decay, p.size, p.damp, p.width].join(); if (k !== this._k) { this._k = k; clearTimeout(this._t); if (isOffline() || !this.cv.buffer) this.makeIR(); else this._t = setTimeout(() => this.makeIR(), 120); }
  }
}

/* --- Sweep: auto filter with tempo-synced LFO --- */
class FilterDev extends Base {
  constructor(d) {
    super(d); this.f = ctx.createBiquadFilter(); this.f2 = ctx.createBiquadFilter(); this.input.connect(this.f); this.f.connect(this.f2); this.f2.connect(this.output);
    this.lfo = ctx.createOscillator(); this.lg = ctx.createGain(); this.lfo.connect(this.lg); this.lg.connect(this.f.detune); this.lg.connect(this.f2.detune); this.lfo.start(); this.set();
  }
  set() {
    const p = this.d.p; this.f.type = this.f2.type = p.type; sm(this.f.frequency, p.cutoff); sm(this.f2.frequency, p.cutoff); sm(this.f.Q, p.res); this.f2.Q.value = p.steep ? p.res * 0.5 : 0.0001;
    if (!p.steep) { this.f2.type = 'allpass'; }
    this.lfo.type = p.shape; sm(this.lfo.frequency, p.sync ? 1 / divSec(p.div) : p.rate); sm(this.lg.gain, p.depth * 1200);
  }
  onTempo() { if (this.d.p.sync) this.set(); }
}

/* --- Ceiling: brickwall-style limiter --- */
/* --- Plug-in placeholder: keeps an imported VST/AU in the chain by name; passes audio through. --- */
class PlugDev extends Base { constructor(d) { super(d); this.input.connect(this.output); } set() { } }
class LimitDev extends Base {
  // Compressor does the musical gain reduction; a final soft-knee clipper guarantees nothing passes the ceiling.
  constructor(d) { super(d); this.g = ctx.createGain(); this.c = ctx.createDynamicsCompressor(); this.clip = ctx.createWaveShaper(); this.clip.oversample = 'none'; this.input.connect(this.g); this.g.connect(this.c); this.c.connect(this.clip); this.clip.connect(this.output); this.c.knee.value = 0; this.c.ratio.value = 20; this.c.attack.value = 0.001; this.set(); }
  set() {
    const p = this.d.p; sm(this.g.gain, dbToGain(p.gain)); sm(this.c.threshold, p.ceiling - 1); sm(this.c.release, p.release / 1000);
    if (this._ceil !== p.ceiling) { this._ceil = p.ceiling; const C = dbToGain(p.ceiling) * 0.985, k = C * 0.8, n = 8192, cv = new Float32Array(n); for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1, a = Math.abs(x); cv[i] = Math.sign(x) * (a <= k ? a : k + (C - k) * Math.tanh((a - k) / (C - k))); } this.clip.curve = cv; }
  }
}

/* --- Truepitch: real-time pitch correction & shifting --- */
class TuneDev extends Base {
  constructor(d) {
    super(d); this.wetDry(); this.info = { f: 0 };
    if (PITCH_OK) {
      this.node = new AudioWorkletNode(ctx, 'gw-pitch', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
      this.node.port.onmessage = e => (this.info = e.data);
      this.input.connect(this.node); this.node.connect(this.wet);
    } else this.input.connect(this.wet);
    this.set();
  }
  set() {
    const p = this.d.p; this.mix(p.mix);
    const root = p.follow ? S.root : p.root, scale = p.follow ? S.scale : p.scale;
    if (this.node) this.node.port.postMessage({ mode: p.mode, root, scale: SCALES[scale], speed: p.speed, semis: p.semis, fine: p.fine });
  }
  dispose() { super.dispose(); if (this.node) this.node.disconnect(); }
}

/* Device catalogue: names, defaults and editable parameters. */
const K = (k, label, min, max, o = {}) => ({ k, label, min, max, ...o });
const SEL = (k, label, options) => ({ k, label, options });
const TOG = (k, label) => ({ k, label, toggle: true });
const fHz = v => (v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 1 : 2) + 'k' : Math.round(v)) + 'Hz';
const fDb = v => (v > 0 ? '+' : '') + v.toFixed(1) + 'dB';
const fPct = v => Math.round(v * 100) + '%';
const fMs = v => (v >= 1000 ? (v / 1000).toFixed(2) + 's' : Math.round(v) + 'ms');
const fS = v => v.toFixed(v < 10 ? 2 : 1) + 's';
const DIV_OPTS = ['1/32', '1/16T', '1/16', '1/16D', '1/8T', '1/8', '1/8D', '1/4T', '1/4', '1/4D', '1/2', '1/1'];
const DEVICES = {
  eq: { name: 'Prism EQ', blurb: 'Parametric EQ', cls: EQDev, wide: true,
    def: () => ({ out: 0, bands: [{ on: true, type: 'low cut', f: 30, g: 0, q: 0.71, slope: 24 }, { on: true, type: 'bell', f: 250, g: 0, q: 1, slope: 12 }, { on: true, type: 'bell', f: 2500, g: 0, q: 1, slope: 12 }, { on: true, type: 'high shelf', f: 9000, g: 0, q: 0.71, slope: 12 }] }) },
  comp: { name: 'Glue Comp', blurb: 'Compressor', cls: CompDev,
    def: () => ({ thresh: -18, ratio: 4, attack: 10, release: 120, knee: 6, makeup: 3, mix: 1 }),
    params: [K('thresh', 'Thresh', -60, 0, { fmt: fDb }), K('ratio', 'Ratio', 1, 20, { fmt: v => v.toFixed(1) + ':1' }), K('attack', 'Attack', 0.1, 100, { scale: 'log', fmt: fMs }), K('release', 'Release', 10, 1000, { scale: 'log', fmt: fMs }), K('knee', 'Knee', 0, 30, { fmt: fDb }), K('makeup', 'Makeup', 0, 24, { fmt: fDb }), K('mix', 'Mix', 0, 1, { fmt: fPct })] },
  sat: { name: 'Scorch', blurb: 'Saturation', cls: SatDev,
    def: () => ({ style: 'Tube', drive: 8, tone: 0, lowcut: 20, punish: false, mix: 1, out: 0 }),
    params: [SEL('style', 'Style', ['Tube', 'Tape', 'Transistor', 'Fold', 'Crush']), K('drive', 'Drive', 0, 36, { fmt: fDb }), K('tone', 'Tone', -1, 1, { fmt: v => v < -0.02 ? 'Dark ' + Math.round(-v * 100) : v > 0.02 ? 'Bright ' + Math.round(v * 100) : 'Flat' }), K('lowcut', 'Low cut', 20, 800, { scale: 'log', fmt: fHz }), TOG('punish', 'Punish +20'), K('mix', 'Mix', 0, 1, { fmt: fPct }), K('out', 'Output', -24, 12, { fmt: fDb })] },
  tape: { name: 'Driftline', blurb: 'Tape echo', cls: TapeDev,
    def: () => ({ sync: true, div: '1/8D', ms: 350, fb: 0.45, sat: 8, wow: 0.3, flutter: 0.3, lowcut: 150, highcut: 4500, spread: 0.4, mix: 0.3 }),
    params: [TOG('sync', 'Sync'), SEL('div', 'Time', DIV_OPTS), K('ms', 'Time ms', 10, 2000, { scale: 'log', fmt: fMs }), K('fb', 'Feedback', 0, 1.05, { fmt: fPct }), K('sat', 'Saturate', 0, 24, { fmt: fDb }), K('wow', 'Wow', 0, 1, { fmt: fPct }), K('flutter', 'Flutter', 0, 1, { fmt: fPct }), K('lowcut', 'Low cut', 20, 2000, { scale: 'log', fmt: fHz }), K('highcut', 'High cut', 800, 18000, { scale: 'log', fmt: fHz }), K('spread', 'Spread', 0, 1, { fmt: fPct }), K('mix', 'Mix', 0, 1, { fmt: fPct })] },
  delay: { name: 'Echo Pair', blurb: 'Stereo delay', cls: DelayDev,
    def: () => ({ sync: true, divL: '1/8', divR: '1/4', msL: 250, msR: 375, ping: true, fb: 0.4, freq: 1500, width: 0.6, mix: 0.3 }),
    params: [TOG('sync', 'Sync'), SEL('divL', 'Left', DIV_OPTS), SEL('divR', 'Right', DIV_OPTS), K('msL', 'Left ms', 5, 2000, { scale: 'log', fmt: fMs }), K('msR', 'Right ms', 5, 2000, { scale: 'log', fmt: fMs }), TOG('ping', 'Ping-pong'), K('fb', 'Feedback', 0, 1, { fmt: fPct }), K('freq', 'Filter', 100, 12000, { scale: 'log', fmt: fHz }), K('width', 'Width', 0, 1, { fmt: fPct }), K('mix', 'Mix', 0, 1, { fmt: fPct })] },
  verb: { name: 'Space', blurb: 'Reverb', cls: VerbDev,
    def: () => ({ decay: 2.4, predelay: 18, size: 0.6, damp: 5000, lowcut: 180, width: 1, mix: 0.3 }),
    params: [K('decay', 'Decay', 0.2, 12, { scale: 'log', fmt: fS }), K('predelay', 'Pre-delay', 0, 250, { fmt: fMs }), K('size', 'Size', 0, 1, { fmt: fPct }), K('damp', 'Damping', 800, 18000, { scale: 'log', fmt: fHz }), K('lowcut', 'Low cut', 20, 1500, { scale: 'log', fmt: fHz }), K('width', 'Width', 0, 1, { fmt: fPct }), K('mix', 'Mix', 0, 1, { fmt: fPct })] },
  filter: { name: 'Sweep', blurb: 'Auto filter', cls: FilterDev,
    def: () => ({ type: 'lowpass', cutoff: 2000, res: 2, steep: false, shape: 'sine', sync: true, div: '1/2', rate: 1, depth: 0 }),
    params: [SEL('type', 'Type', ['lowpass', 'highpass', 'bandpass', 'notch']), K('cutoff', 'Cutoff', 30, 18000, { scale: 'log', fmt: fHz }), K('res', 'Reso', 0.3, 18, { fmt: v => v.toFixed(1) }), TOG('steep', '24 dB'), SEL('shape', 'LFO', ['sine', 'triangle', 'square', 'sawtooth']), TOG('sync', 'Sync'), SEL('div', 'Rate', DIV_OPTS), K('rate', 'Rate Hz', 0.05, 20, { scale: 'log', fmt: v => v.toFixed(2) + 'Hz' }), K('depth', 'Depth', 0, 4, { fmt: v => v.toFixed(1) + ' oct' })] },
  tune: { name: 'Truepitch', blurb: 'Pitch correction', cls: TuneDev, wide: true,
    def: () => ({ mode: 'correct', follow: true, root: 9, scale: 'minor', speed: 20, semis: 0, fine: 0, mix: 1 }),
    params: [SEL('mode', 'Mode', ['correct', 'robot', 'shift']), TOG('follow', 'Use song key'), SEL('root', 'Key', PC.map((n, i) => [i, n])), SEL('scale', 'Scale', Object.keys(SCALES)), K('speed', 'Retune', 0, 400, { fmt: v => Math.round(v) + 'ms' }), K('semis', 'Shift', -12, 12, { step: 1, fmt: v => (v > 0 ? '+' : '') + Math.round(v) + ' st' }), K('fine', 'Fine', -100, 100, { fmt: v => Math.round(v) + 'c' }), K('mix', 'Mix', 0, 1, { fmt: fPct })] },
  plugin: { name: 'Plug-in', blurb: 'Not loaded', cls: PlugDev, hidden: true, def: () => ({ name: 'Plug-in', format: 'VST', role: 'effect' }), params: [] },
  limit: { name: 'Ceiling', blurb: 'Limiter', cls: LimitDev,
    def: () => ({ gain: 0, ceiling: -0.5, release: 80 }),
    params: [K('gain', 'Gain', 0, 18, { fmt: fDb }), K('ceiling', 'Ceiling', -12, 0, { fmt: fDb }), K('release', 'Release', 10, 600, { scale: 'log', fmt: fMs })] },
};
const DEV_RT = new Map();
function newDevice(type, p) { return { id: uid(), type, on: true, p: p || DEVICES[type].def() }; }
function devRT(d) { let r = DEV_RT.get(d.id); if (!r) { r = new DEVICES[d.type].cls(d); DEV_RT.set(d.id, r); } return r; }
