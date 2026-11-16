/* ============ Tone: Console EQ, Low End, Strip ============
   Console is a character EQ with three voicings: British (a channel EQ with a broad mid and transformer colour),
   Vintage (a desk EQ with a presence peak) and Tube (a passive program EQ: boost and cut the same low band for the
   famous bump-and-dip, a bell on the top). Low End adds a sub octave and bass harmonics that small speakers can
   reproduce. Strip is a one-screen channel strip for vocals, guitars, drums or bass. */
const sat = (k, kind) => { const n = 1024, cv = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / 511.5 - 1, y = x * k; cv[i] = kind === 'tube' ? Math.tanh(y + 0.18 * y * y) / Math.tanh(k * 1.18) : kind === 'xfmr' ? Math.tanh(y) / Math.tanh(k) * (1 + 0.04 * Math.sign(x)) : Math.tanh(y) / Math.tanh(k); } return cv; };
const biquad = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };

/* --- Console EQ --- */
class ConsoleDev extends Base {
  constructor(d) {
    super(d);
    this.hp = biquad('highpass', 20); this.ls = biquad('lowshelf', 100); this.la = biquad('lowshelf', 100); this.mid = biquad('peaking', 1600, 1); this.hb = biquad('peaking', 10000, 1); this.hs = biquad('highshelf', 12000); this.ha = biquad('highshelf', 10000);
    this.pre = ctx.createGain(); this.sh = ctx.createWaveShaper(); this.sh.oversample = '2x'; this.post = ctx.createGain();
    [this.input, this.hp, this.ls, this.la, this.mid, this.hb, this.hs, this.ha, this.pre, this.sh, this.post, this.output].reduce((a, b) => (a.connect(b), b));
    this.set();
  }
  set() {
    const p = this.d.p, m = p.model, tube = m === 'tube';
    sm(this.hp.frequency, p.hpf < 21 ? 10 : p.hpf);
    sm(this.ls.frequency, p.lowF); sm(this.ls.gain, tube ? p.low * 1.4 : p.low); this.ls.Q.value = m === 'vintage' ? 0.9 : 0.6;
    sm(this.la.frequency, p.lowF * (tube ? 1.9 : 1)); sm(this.la.gain, tube ? -p.lowAtt * 1.2 : 0);                // the dip just above the boost
    sm(this.mid.frequency, p.midF); sm(this.mid.gain, tube ? 0 : p.mid); this.mid.Q.value = m === 'british' ? 0.7 : 1.3;
    sm(this.hb.frequency, p.highF); sm(this.hb.gain, tube ? p.high * 1.4 : 0); this.hb.Q.value = 0.3 + (1 - p.bw) * 2;
    sm(this.hs.frequency, tube ? 20000 : p.highF); sm(this.hs.gain, tube ? 0 : p.high);
    sm(this.ha.frequency, p.highAttF); sm(this.ha.gain, tube ? -p.highAtt * 1.6 : 0);
    const k = 1 + p.drive * 5, kind = m === 'british' ? 'xfmr' : m === 'tube' ? 'tube' : 'soft', key = kind + k.toFixed(2); if (key !== this._k) { this._k = key; this.sh.curve = sat(k, kind); }
    sm(this.pre.gain, 1); sm(this.post.gain, dbToGain(p.out) / (1 + p.drive * 0.35));
  }
}
const fHz2 = v => (v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1) + 'k' : Math.round(v)) + 'Hz';
DEVICES.console = { name: 'Console', blurb: 'Character EQ', cls: ConsoleDev, wide: true, cols: true,
  def: () => ({ model: 'british', hpf: 20, lowF: 110, low: 0, lowAtt: 0, midF: 1600, mid: 0, highF: 12000, high: 0, bw: 0.5, highAttF: 10000, highAtt: 0, drive: 0.25, out: 0 }),
  params: [SEL('model', 'Voicing', [['british', 'British channel'], ['vintage', 'Vintage desk'], ['tube', 'Tube program EQ']]), K('drive', 'Drive', 0, 1, { fmt: fPct }), K('out', 'Output', -18, 18, { fmt: fDb }),
    { group: 'Low' }, K('hpf', 'High-pass', 20, 400, { scale: 'log', fmt: v => v < 21 ? 'Off' : fHz2(v) }), K('lowF', 'Low freq', 20, 300, { scale: 'log', fmt: fHz2 }), K('low', 'Low', -15, 15, { fmt: fDb }), K('lowAtt', 'Low cut (tube)', 0, 10, { fmt: v => v.toFixed(1) }),
    { group: 'Mid' }, K('midF', 'Mid freq', 200, 8000, { scale: 'log', fmt: fHz2 }), K('mid', 'Mid', -15, 15, { fmt: fDb }),
    { group: 'High' }, K('highF', 'High freq', 3000, 16000, { scale: 'log', fmt: fHz2 }), K('high', 'High', -15, 15, { fmt: fDb }), K('bw', 'Width (tube)', 0, 1, { fmt: v => v < 0.35 ? 'Sharp' : v > 0.65 ? 'Broad' : 'Medium' }), K('highAttF', 'Air cut freq', 4000, 20000, { scale: 'log', fmt: fHz2 }), K('highAtt', 'Air cut (tube)', 0, 10, { fmt: v => v.toFixed(1) })],
  presets: {
    'British: vocal presence': { model: 'british', hpf: 80, low: -2, lowF: 220, mid: 3, midF: 3200, high: 4, highF: 12000, drive: 0.3 },
    'British: punchy kick': { model: 'british', low: 6, lowF: 60, mid: -4, midF: 360, high: 3, highF: 12000, drive: 0.45 },
    'Vintage: bright guitar': { model: 'vintage', hpf: 90, low: -2, mid: 4, midF: 2500, high: 3, highF: 10000, drive: 0.35 },
    'Tube: low-end trick': { model: 'tube', lowF: 60, low: 6, lowAtt: 5, high: 2, highF: 10000, bw: 0.6, drive: 0.3 },
    'Tube: silky air': { model: 'tube', high: 5, highF: 12000, bw: 0.8, highAtt: 1, highAttF: 20000, drive: 0.25 },
    'Mix bus warmth': { model: 'vintage', low: 1.5, lowF: 80, high: 1.5, highF: 12000, drive: 0.4 },
  } };

/* --- Low End: sub octave and bass harmonics --- */
class LowEndDev extends Base {
  constructor(d) {
    super(d); const c = ctx;
    this.dryShelf = biquad('lowshelf', 100); this.sum = c.createGain(); this.input.connect(this.dryShelf); this.dryShelf.connect(this.sum);
    this.sub = PITCH_OK ? new AudioWorkletNode(c, 'gw-sub', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] }) : c.createGain(); this.subLp = biquad('lowpass', 80, 0.7); this.subLp2 = biquad('lowpass', 80, 0.7); this.subG = c.createGain(); this.subG.gain.value = 0;
    this.input.connect(this.sub); this.sub.connect(this.subLp); this.subLp.connect(this.subLp2); this.subLp2.connect(this.subG); this.subG.connect(this.sum);
    this.hLp = biquad('lowpass', 120, 0.7); this.hDrive = c.createGain(); this.hSh = c.createWaveShaper(); this.hSh.curve = (() => { const n = 1024, cv = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / 511.5 - 1; cv[i] = Math.tanh(3 * Math.abs(x)) * 0.6 + Math.tanh(3 * x) * 0.4; } return cv; })();
    this.hHp = biquad('highpass', 140, 0.7); this.hHp2 = biquad('highpass', 140, 0.7); this.hTop = biquad('lowpass', 900, 0.7); this.hG = c.createGain(); this.hG.gain.value = 0;
    [this.input, this.hLp, this.hDrive, this.hSh, this.hHp, this.hHp2, this.hTop, this.hG, this.sum].reduce((a, b) => (a.connect(b), b));
    this.sum.connect(this.output); this.set();
  }
  set() {
    const p = this.d.p; if (this.sub.port) this.sub.port.postMessage({ f: p.subFreq });
    sm(this.subLp.frequency, p.subFreq * 0.6); sm(this.subLp2.frequency, p.subFreq * 0.6); sm(this.subG.gain, p.sub * 1.6);
    sm(this.hLp.frequency, p.harmFreq); sm(this.hDrive.gain, 2 + p.harm * 4); sm(this.hHp.frequency, p.harmFreq * 1.4); sm(this.hHp2.frequency, p.harmFreq * 1.4); sm(this.hTop.frequency, p.harmFreq * 6); sm(this.hG.gain, p.harm * 0.9);
    sm(this.dryShelf.frequency, p.harmFreq); sm(this.dryShelf.gain, p.lows); sm(this.sum.gain, dbToGain(p.out));
  }
}
DEVICES.lowend = { name: 'Low End', blurb: 'Sub octave and bass harmonics', cls: LowEndDev,
  def: () => ({ sub: 0, subFreq: 110, harm: 0.4, harmFreq: 100, lows: 0, out: 0 }),
  params: [K('sub', 'Sub octave', 0, 1, { fmt: fPct }), K('subFreq', 'Sub from below', 40, 200, { scale: 'log', fmt: fHz2 }), K('harm', 'Harmonics', 0, 1, { fmt: fPct }), K('harmFreq', 'Bass up to', 40, 250, { scale: 'log', fmt: fHz2 }), K('lows', 'Original lows', -18, 6, { fmt: fDb }), K('out', 'Output', -12, 12, { fmt: fDb })],
  presets: { 'Hear the bass on phone speakers': { harm: 0.6, harmFreq: 110, lows: -3 }, 'Deeper 808': { sub: 0.5, subFreq: 120, harm: 0.25 }, 'Kick weight': { sub: 0.4, subFreq: 90, harm: 0.15 } } };

/* --- Strip: a one-screen channel strip --- */
const STRIP_VOICE = {
  vocals: { lowF: 150, highF: 6000, comp: 'opto', verb: 1.8, slap: '1/8D', hp: 90 },
  guitars: { lowF: 120, highF: 5000, comp: 'fet', verb: 1.2, slap: 0.11, hp: 80 },
  drums: { lowF: 80, highF: 7000, comp: 'vca', verb: 0.9, slap: 0.07, hp: 25 },
  bass: { lowF: 70, highF: 2500, comp: 'opto', verb: 0.7, slap: 0.09, hp: 30 },
  keys: { lowF: 120, highF: 8000, comp: 'vari', verb: 2.2, slap: '1/4', hp: 60 },
};
class StripDev extends Base {
  constructor(d) {
    super(d); const c = ctx;
    this.hp = biquad('highpass', 80); this.lo = biquad('lowshelf', 120); this.hi = biquad('highshelf', 8000); this.comp = PITCH_OK ? new AudioWorkletNode(c, 'gw-char', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] }) : c.createGain();
    this.bus = c.createGain(); this.outG = c.createGain();
    [this.input, this.hp, this.lo, this.hi, this.comp, this.bus, this.outG, this.output].reduce((a, b) => (a.connect(b), b));
    this.dA = c.createDelay(0.05); this.dB = c.createDelay(0.05); this.dA.delayTime.value = 0.011; this.dB.delayTime.value = 0.017; this.pA = c.createStereoPanner(); this.pA.pan.value = -1; this.pB = c.createStereoPanner(); this.pB.pan.value = 1; this.dblG = c.createGain(); this.dblG.gain.value = 0;
    this.lfo = c.createOscillator(); this.lfo.frequency.value = 0.4; this.lfoG = c.createGain(); this.lfoG.gain.value = 0.0012; this.lfo.connect(this.lfoG); this.lfoG.connect(this.dA.delayTime); this.lfo.start();
    this.comp.connect(this.dA); this.comp.connect(this.dB); this.dA.connect(this.pA); this.dB.connect(this.pB); this.pA.connect(this.dblG); this.pB.connect(this.dblG); this.dblG.connect(this.bus);
    this.echo = c.createDelay(2); this.echoFb = c.createGain(); this.echoLp = biquad('lowpass', 4000); this.echoHp = biquad('highpass', 250); this.echoG = c.createGain(); this.echoG.gain.value = 0;
    this.comp.connect(this.echoHp); this.echoHp.connect(this.echo); this.echo.connect(this.echoLp); this.echoLp.connect(this.echoFb); this.echoFb.connect(this.echo); this.echoLp.connect(this.echoG); this.echoG.connect(this.bus);
    this.verb = c.createConvolver(); this.verbG = c.createGain(); this.verbG.gain.value = 0; this.verbHp = biquad('highpass', 300); this.comp.connect(this.verbHp); this.verbHp.connect(this.verb); this.verb.connect(this.verbG); this.verbG.connect(this.bus);
    this.set();
  }
  set() {
    const p = this.d.p, v = STRIP_VOICE[p.type] || STRIP_VOICE.vocals;
    sm(this.hp.frequency, v.hp); sm(this.lo.frequency, v.lowF); sm(this.lo.gain, p.bass * 9); sm(this.hi.frequency, v.highF); sm(this.hi.gain, p.treble * 9);
    if (this.comp.port) this.comp.port.postMessage({ model: v.comp, input: p.compress * 10, thr: -14 - p.compress * 16, ratio: 2 + p.compress * 4, att: v.comp === 'fet' ? 1 : 8, rel: 120, knee: 6, color: 0.4 + p.compress * 0.3, hpf: 80, out: p.compress * 4, mix: 1 });
    if (this._vk !== p.type) { this._vk = p.type; this.verb.buffer = hallIR(this.verb.context, v.verb, 0.6); }
    sm(this.verbG.gain, p.reverb * 0.7); sm(this.echo.delayTime, typeof v.slap === 'string' ? divSec(v.slap) : v.slap); sm(this.echoFb.gain, typeof v.slap === 'string' ? 0.3 : 0.1); sm(this.echoG.gain, p.delay * 0.6);
    sm(this.dblG.gain, p.double * 0.5); sm(this.outG.gain, dbToGain(p.out));
  }
  onTempo() { this.set(); }
  dispose() { super.dispose(); try { this.lfo.stop(); } catch (e) { } try { this.comp.disconnect(); } catch (e) { } }
}
DEVICES.strip = { name: 'Strip', blurb: 'One-screen channel strip', cls: StripDev,
  def: () => ({ type: 'vocals', bass: 0, treble: 0.2, compress: 0.4, reverb: 0.15, delay: 0.1, double: 0, out: 0 }),
  params: [SEL('type', 'For', ['vocals', 'guitars', 'drums', 'bass', 'keys']), K('bass', 'Bass', -1, 1, { fmt: v => (v > 0 ? '+' : '') + Math.round(v * 100) }), K('treble', 'Treble', -1, 1, { fmt: v => (v > 0 ? '+' : '') + Math.round(v * 100) }), K('compress', 'Compress', 0, 1, { fmt: fPct }), K('reverb', 'Reverb', 0, 1, { fmt: fPct }), K('delay', 'Echo', 0, 1, { fmt: fPct }), K('double', 'Double', 0, 1, { fmt: fPct }), K('out', 'Output', -12, 12, { fmt: fDb })],
  presets: {
    'Lead vocal: up front': { type: 'vocals', bass: -0.1, treble: 0.35, compress: 0.65, reverb: 0.2, delay: 0.15 },
    'Lead vocal: big and wide': { type: 'vocals', treble: 0.3, compress: 0.55, reverb: 0.35, delay: 0.25, double: 0.4 },
    'Background vocals': { type: 'vocals', bass: -0.4, treble: 0.25, compress: 0.6, reverb: 0.4, double: 0.6 },
    'Rap vocal: tight': { type: 'vocals', bass: 0, treble: 0.3, compress: 0.75, reverb: 0.05, delay: 0.08 },
    'Guitar: crunch': { type: 'guitars', bass: -0.2, treble: 0.2, compress: 0.5, reverb: 0.15, delay: 0.1, double: 0.3 },
    'Drums: room': { type: 'drums', bass: 0.25, treble: 0.25, compress: 0.6, reverb: 0.25 },
    'Bass: solid': { type: 'bass', bass: 0.2, treble: -0.1, compress: 0.6 },
    'Keys: soft': { type: 'keys', treble: -0.1, compress: 0.35, reverb: 0.3, delay: 0.1 },
  } };
