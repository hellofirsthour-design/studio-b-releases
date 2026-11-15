/* ============ Dynamics: Iron, Bands, Lift, Apex, Rider, De-Ess, Breath, Punch ============
   Iron is a character compressor with four behaviours (FET, Opto, Vari-Mu, VCA). Bands is multiband upward and
   downward compression; Lift is the same idea on the whole signal. Apex is a look-ahead maximizer. Rider moves the
   level toward a target. De-Ess and Breath tame sibilance and breaths. Punch is a drum enhancer: transient shaping,
   heat, tone, clipper and width. The processors are audio worklets in worklets2.js. */
const dynNode = (name, ins = 1) => PITCH_OK ? new AudioWorkletNode(ctx, name, { numberOfInputs: ins, numberOfOutputs: 1, outputChannelCount: [2] }) : null;
const fMsec = v => (v >= 1000 ? (v / 1000).toFixed(2) + ' s' : (v < 1 ? v.toFixed(2) : v < 10 ? v.toFixed(1) : Math.round(v)) + ' ms');
// A worklet device: input -> node -> output, with a pass-through if worklets are unavailable.
class WkDev extends Base {
  constructor(d, name, ins = 1) {
    super(d); this.node = dynNode(name, ins);
    if (this.node) { this.input.connect(this.node, 0, 0); this.node.connect(this.output); this.node.port.onmessage = e => this.onMsg(e.data); } else this.input.connect(this.output);
    this.sc = ins > 1 ? this.node : null;
  }
  onMsg(m) { if (m.gr != null) this.gr = m.gr; }
  get reductionDb() { return this.gr || 0; }
  post(o) { if (this.node) this.node.port.postMessage(o); }
  dispose() { super.dispose(); if (this.node) this.node.disconnect(); }
}

/* --- Iron: character compressor --- */
class IronDev extends WkDev {
  constructor(d) { super(d, 'gw-char', 2); this.set(); }
  set() { const p = this.d.p; this.post({ model: p.model, input: p.input, thr: p.thresh, ratio: p.ratio, att: p.attack, rel: p.release, knee: p.knee, color: p.color, hpf: p.scHpf, sc: !!p.sc, out: p.out, mix: p.mix }); }
}
DEVICES.iron = { name: 'Iron', blurb: 'Character compressor', cls: IronDev,
  def: () => ({ model: 'fet', input: 0, thresh: -18, ratio: 4, attack: 3, release: 120, knee: 3, color: 0.5, scHpf: 0, sc: '', out: 0, mix: 1 }),
  params: [SEL('model', 'Model', [['fet', 'FET: fast, bold'], ['opto', 'Opto: smooth'], ['vari', 'Vari-Mu: glue'], ['vca', 'VCA: clean, punchy']]), K('input', 'Input', -12, 24, { fmt: fDb }), K('thresh', 'Threshold', -48, 0, { fmt: fDb }), K('ratio', 'Ratio', 1, 20, { scale: 'log', fmt: v => v.toFixed(1) + ':1' }),
    K('attack', 'Attack', 0.05, 100, { scale: 'log', fmt: fMsec }), K('release', 'Release', 20, 2000, { scale: 'log', fmt: fMsec }), K('knee', 'Knee', 0, 18, { fmt: fDb }), K('color', 'Color', 0, 1, { fmt: fPct }), K('scHpf', 'Detector HPF', 0, 300, { fmt: v => v < 21 ? 'Off' : Math.round(v) + ' Hz' }), K('out', 'Output', -12, 24, { fmt: fDb }), K('mix', 'Mix', 0, 1, { fmt: fPct })],
  presets: {
    'FET: vocal up front': { model: 'fet', input: 6, thresh: -20, ratio: 4, attack: 0.8, release: 80, color: 0.6, out: 2 },
    'FET: drum smash': { model: 'fet', input: 10, thresh: -30, ratio: 20, attack: 0.1, release: 60, color: 0.9, mix: 0.45, out: 2 },
    'Opto: smooth vocal': { model: 'opto', thresh: -22, ratio: 3, knee: 8, color: 0.4, out: 3 },
    'Opto: bass': { model: 'opto', thresh: -20, ratio: 4, knee: 6, scHpf: 0, color: 0.5, out: 2 },
    'Vari-Mu: bus glue': { model: 'vari', thresh: -16, ratio: 2.5, attack: 20, release: 300, knee: 10, color: 0.5, scHpf: 90 },
    'VCA: mix bus': { model: 'vca', thresh: -14, ratio: 2, attack: 10, release: 100, knee: 6, scHpf: 100, color: 0 },
    'VCA: punchy drums': { model: 'vca', thresh: -20, ratio: 4, attack: 15, release: 80, color: 0, out: 2 },
    'One-knob vocal': { model: 'opto', input: 0, thresh: -26, ratio: 4, knee: 10, color: 0.3, out: 4 },
  } };

/* --- Bands: multiband upward/downward compression --- */
const BAND = ['low', 'mid', 'high'];
class BandsDev extends WkDev {
  constructor(d) { super(d, 'gw-bands'); this.gs = [0, 0, 0]; this.set(); }
  onMsg(m) { if (m.g) this.gs = m.g; }
  set() { const p = this.d.p; this.post({ bands: 3, f1: p.f1, f2: p.f2, amount: p.amount, input: p.input, out: p.out, mix: p.mix, b: BAND.map((b, i) => ({ dthr: p[b + 'DT'], dr: p[b + 'DR'], uthr: p[b + 'UT'], ur: p[b + 'UR'], gain: p[b + 'Gain'], att: p.attack * [2, 1, 0.6][i], rel: p.release * [1.6, 1, 0.7][i] })) }); }
}
const bandParams = (b, L) => [{ group: L }, K(b + 'DT', 'Thresh ↓', -60, 0, { fmt: fDb }), K(b + 'DR', 'Ratio ↓', 1, 20, { scale: 'log', fmt: v => v.toFixed(1) + ':1' }), K(b + 'UT', 'Thresh ↑', -70, 0, { fmt: fDb }), K(b + 'UR', 'Ratio ↑', 1, 8, { fmt: v => v.toFixed(1) + ':1' }), K(b + 'Gain', 'Gain', -12, 12, { fmt: fDb })];
DEVICES.bands = { name: 'Bands', blurb: 'Multiband dynamics', cls: BandsDev, wide: true, cols: true, meters: 'bands',
  def: () => ({ amount: 0.6, f1: 120, f2: 2500, attack: 10, release: 120, input: 0, out: 0, mix: 1, ...Object.fromEntries(BAND.flatMap(b => [[b + 'DT', -24], [b + 'DR', 4], [b + 'UT', -42], [b + 'UR', 2], [b + 'Gain', 0]])) }),
  params: [K('amount', 'Depth', 0, 1.5, { fmt: fPct }), K('f1', 'Low / mid', 40, 1000, { scale: 'log', fmt: fHz }), K('f2', 'Mid / high', 800, 12000, { scale: 'log', fmt: fHz }), K('attack', 'Attack', 0.5, 100, { scale: 'log', fmt: fMsec }), K('release', 'Release', 10, 1000, { scale: 'log', fmt: fMsec }), K('input', 'Input', -12, 12, { fmt: fDb }), K('out', 'Output', -12, 12, { fmt: fDb }), K('mix', 'Mix', 0, 1, { fmt: fPct }),
    ...bandParams('low', 'Low'), ...bandParams('mid', 'Mid'), ...bandParams('high', 'High')],
  presets: {
    'Upward squash (big and in your face)': { amount: 1, attack: 5, release: 80, lowDT: -30, lowDR: 8, lowUT: -36, lowUR: 4, midDT: -30, midDR: 8, midUT: -36, midUR: 4, highDT: -30, highDR: 8, highUT: -36, highUR: 4, mix: 0.5 },
    'Gentle master': { amount: 0.5, lowDT: -16, lowDR: 2, lowUT: -60, midDT: -16, midDR: 1.8, midUT: -60, highDT: -18, highDR: 2, highUT: -60 },
    'Tame low end': { amount: 1, lowDT: -24, lowDR: 4, lowUT: -70, midDT: 0, midUT: -70, highDT: 0, highUT: -70 },
    'Vocal presence': { amount: 0.8, f1: 200, f2: 3500, lowDT: -24, lowDR: 3, midDT: -20, midDR: 3, highUT: -40, highUR: 3, highGain: 1.5 },
  } };

/* --- Lift: upward and downward compression on the whole signal --- */
class LiftDev extends WkDev {
  constructor(d) { super(d, 'gw-bands'); this.gs = [0]; this.set(); }
  onMsg(m) { if (m.g) this.gs = m.g; }
  set() { const p = this.d.p; this.post({ bands: 1, amount: 1, input: p.input, out: p.out, mix: p.mix, b: [{ uthr: -18 - p.lift * 6, ur: 1 + p.lift * 4, dthr: -2 - p.squash * 22, dr: 1 + p.squash * 9, gain: 0, att: 2 + (1 - p.speed) * 30, rel: 40 + (1 - p.speed) * 400 }] }); }
}
DEVICES.lift = { name: 'Lift', blurb: 'Loudness: lift the quiet, squash the loud', cls: LiftDev, meters: 'bands',
  def: () => ({ lift: 0.4, squash: 0.3, speed: 0.6, input: 0, out: 0, mix: 1 }),
  params: [K('lift', 'Lift quiet', 0, 1, { fmt: fPct }), K('squash', 'Squash loud', 0, 1, { fmt: fPct }), K('speed', 'Speed', 0, 1, { fmt: fPct }), K('input', 'Input', -12, 12, { fmt: fDb }), K('out', 'Output', -12, 12, { fmt: fDb }), K('mix', 'Mix', 0, 1, { fmt: fPct })] };

/* --- Apex: look-ahead maximizer --- */
class ApexDev extends WkDev {
  constructor(d) { super(d, 'gw-max'); this.set(); }
  set() { const p = this.d.p; this.post({ thr: p.thresh, ceil: p.ceiling, rel: p.release, auto: !!p.auto }); }
}
DEVICES.apex = { name: 'Apex', blurb: 'Maximizer', cls: ApexDev,
  def: () => ({ thresh: -4, ceiling: -0.3, release: 80, auto: true }),
  params: [K('thresh', 'Threshold', -24, 0, { fmt: fDb }), K('ceiling', 'Ceiling', -6, 0, { fmt: fDb }), K('release', 'Release', 1, 1000, { scale: 'log', fmt: fMsec }), TOG('auto', 'Auto release')],
  presets: { 'Transparent': { thresh: -3, ceiling: -0.3, release: 120, auto: true }, 'Loud': { thresh: -9, ceiling: -0.3, release: 40, auto: true }, 'Streaming safe': { thresh: -5, ceiling: -1, release: 100, auto: true } } };

/* --- Rider: automatic level riding --- */
class RiderDev extends WkDev {
  constructor(d) { super(d, 'gw-ride'); this.g = 0; this.set(); }
  onMsg(m) { if (m.g != null) this.g = m.g; }
  set() { const p = this.d.p; this.post({ target: p.target, range: p.range, speed: p.speed, floor: p.floor }); }
}
DEVICES.rider = { name: 'Rider', blurb: 'Rides the level for you', cls: RiderDev, meters: 'ride',
  def: () => ({ target: -18, range: 8, speed: 250, floor: -50 }),
  params: [K('target', 'Target', -40, 0, { fmt: fDb }), K('range', 'Range', 0, 18, { fmt: v => '±' + v.toFixed(1) + ' dB' }), K('speed', 'Speed', 30, 3000, { scale: 'log', fmt: fMsec }), K('floor', 'Ignore below', -80, -20, { fmt: fDb })],
  presets: { 'Vocal': { target: -18, range: 8, speed: 200, floor: -48 }, 'Bass': { target: -16, range: 6, speed: 120, floor: -50 }, 'Slow and gentle': { target: -18, range: 4, speed: 1200, floor: -50 } } };

/* --- De-Ess and Breath --- */
class VoxDev extends WkDev {
  constructor(d) { super(d, 'gw-vox'); this.set(); }
  set() { const p = this.d.p; this.post(this.d.type === 'deess' ? { mode: 'deess', freq: p.freq, thr: p.thresh, range: p.range, split: !!p.split, listen: !!p.listen } : { mode: 'breath', bthr: p.thresh, bred: p.reduction }); }
}
DEVICES.deess = { name: 'De-Ess', blurb: 'Tames harsh S sounds', cls: VoxDev,
  def: () => ({ freq: 6000, thresh: -30, range: 10, split: true, listen: false }),
  params: [K('freq', 'Frequency', 2000, 12000, { scale: 'log', fmt: fHz }), K('thresh', 'Threshold', -60, 0, { fmt: fDb }), K('range', 'Range', 0, 24, { fmt: fDb }), TOG('split', 'Split band'), TOG('listen', 'Listen')],
  presets: { 'Male vocal': { freq: 5000, thresh: -32 }, 'Female vocal': { freq: 7000, thresh: -32 }, 'Gentle': { thresh: -26, range: 6 } } };
DEVICES.breath = { name: 'Breath', blurb: 'Turns breaths down', cls: VoxDev,
  def: () => ({ thresh: -38, reduction: 12 }),
  params: [K('thresh', 'Threshold', -70, -10, { fmt: fDb }), K('reduction', 'Reduction', 0, 40, { fmt: fDb })] };

/* --- Punch: drum enhancer --- */
class PunchDev extends Base {
  constructor(d) {
    super(d); const c = ctx; this.a = dynNode('gw-punch'); this.b = dynNode('gw-clip', 2);
    this.lc = c.createBiquadFilter(); this.lc.type = 'highpass'; this.hc = c.createBiquadFilter(); this.hc.type = 'lowpass'; this.body = c.createBiquadFilter(); this.body.type = 'lowshelf'; this.body.frequency.value = 110; this.snap = c.createBiquadFilter(); this.snap.type = 'highshelf'; this.snap.frequency.value = 5000;
    if (this.a && this.b) { this.input.connect(this.a); this.a.connect(this.lc); this.lc.connect(this.hc); this.hc.connect(this.body); this.body.connect(this.snap); this.snap.connect(this.b, 0, 0); this.input.connect(this.b, 0, 1); this.b.connect(this.output); this.a.port.onmessage = e => (this.tg = e.data.g); this.b.port.onmessage = e => (this.clipping = e.data.clipping); }
    else this.input.connect(this.output);
    this.set();
  }
  set() {
    const p = this.d.p; sm(this.lc.frequency, p.lowcut); sm(this.hc.frequency, p.highcut); sm(this.body.gain, p.body); sm(this.snap.gain, p.snap);
    if (this.a) this.a.port.postMessage({ punch: p.punch, sustain: p.sustain, heat: p.heat, style: p.style }); if (this.b) this.b.port.postMessage({ clip: p.clip, hard: !!p.hard, width: p.width, out: p.out, mix: p.mix });
  }
  dispose() { super.dispose(); [this.a, this.b].forEach(n => n && n.disconnect()); }
}
DEVICES.punch = { name: 'Punch', blurb: 'Drum enhancer: punch, heat, clip', cls: PunchDev, wide: true, cols: true,
  def: () => ({ punch: 0.4, sustain: 0, style: 'warm', heat: 0.2, lowcut: 20, highcut: 20000, body: 0, snap: 0, clip: 3, hard: false, width: 1, out: 0, mix: 1 }),
  params: [K('out', 'Output', -18, 12, { fmt: fDb }), K('mix', 'Mix', 0, 1, { fmt: fPct }),
    { group: 'Shape' }, K('punch', 'Punch', -1, 1, { fmt: fPct }), K('sustain', 'Sustain', -1, 1, { fmt: fPct }),
    { group: 'Heat' }, SEL('style', 'Style', ['warm', 'tube', 'crunch', 'fuzz']), K('heat', 'Heat', 0, 1, { fmt: fPct }),
    { group: 'Tone' }, K('lowcut', 'Low cut', 20, 400, { scale: 'log', fmt: fHz }), K('highcut', 'High cut', 2000, 20000, { scale: 'log', fmt: fHz }), K('body', 'Body', -12, 12, { fmt: fDb }), K('snap', 'Snap', -12, 12, { fmt: fDb }),
    { group: 'Clip' }, K('clip', 'Drive', 0, 18, { fmt: fDb }), TOG('hard', 'Hard clip'),
    { group: 'Width' }, K('width', 'Width', 0, 2, { fmt: fPct })],
  presets: {
    'Kick: knock': { punch: 0.6, sustain: -0.2, style: 'warm', heat: 0.3, body: 3, snap: 2, clip: 4 },
    '808: hard and loud': { punch: 0.3, sustain: 0.3, style: 'tube', heat: 0.5, body: 2, clip: 8, width: 1 },
    'Snare: crack': { punch: 0.7, sustain: 0.1, style: 'crunch', heat: 0.3, snap: 4, clip: 5 },
    'Drum bus: slam': { punch: 0.4, sustain: 0.2, style: 'tube', heat: 0.35, clip: 6, width: 1.2, mix: 0.8 },
    'Hats: wide and crisp': { punch: 0.5, sustain: -0.4, lowcut: 300, snap: 3, width: 1.6, clip: 2 },
    'Lo-fi crunch': { punch: 0.2, style: 'fuzz', heat: 0.6, highcut: 6000, clip: 6, mix: 0.7 },
  } };
