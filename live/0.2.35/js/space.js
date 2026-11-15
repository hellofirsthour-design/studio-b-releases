/* ============ Space and movement: Taps, Motion, Spaces, Half, Stereo ============ */
const TAPS = [1, 2, 3, 4, 5, 6];

/* --- Taps: six-tap delay --- */
class TapsDev extends Base {
  constructor(d) {
    super(d); this.wetDry(); const c = ctx;
    this.sum = c.createGain(); this.hp = c.createBiquadFilter(); this.hp.type = 'highpass'; this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.fb = c.createGain(); this.fb.gain.value = 0; this.fbD = c.createDelay(4); this.out2 = c.createGain();
    this.taps = TAPS.map(() => { const dl = c.createDelay(4), g = c.createGain(), pn = c.createStereoPanner(); g.gain.value = 0; this.input.connect(dl); this.fbD.connect(dl); dl.connect(g); g.connect(pn); pn.connect(this.sum); return { dl, g, pn }; });
    this.sum.connect(this.hp); this.hp.connect(this.lp); this.lp.connect(this.out2); this.out2.connect(this.wet); this.lp.connect(this.fb); this.fb.connect(this.fbD);
    this.set();
  }
  set() {
    const p = this.d.p, t = i => clamp(p.sync ? (DIVS[p['t' + i]] || 1) * 15 / S.bpm : p['ms' + i] / 1000, 0.005, 3.9);
    this.taps.forEach((x, k) => { const i = k + 1; sm(x.dl.delayTime, t(i), 0.05); sm(x.g.gain, p['l' + i]); sm(x.pn.pan, p['p' + i]); });
    sm(this.fb.gain, p.feedback * 0.6); this.fbD.delayTime.value = 0.001; sm(this.hp.frequency, p.lowcut); sm(this.lp.frequency, p.highcut); sm(this.out2.gain, dbToGain(p.out)); this.mix(p.mix);
  }
  onTempo() { if (this.d.p.sync) this.set(); }
}
DEVICES.taps = { name: 'Taps', blurb: 'Six-tap delay', cls: TapsDev, wide: true, cols: true,
  def: () => ({ sync: true, feedback: 0.2, lowcut: 150, highcut: 7000, mix: 0.35, out: 0, t1: '1/8', l1: 0.8, p1: -0.6, ms1: 250, t2: '1/4', l2: 0.6, p2: 0.6, ms2: 500, t3: '1/4D', l3: 0.45, p3: -0.3, ms3: 750, t4: '1/2', l4: 0.3, p4: 0.3, ms4: 1000, t5: '1/8D', l5: 0, p5: 0, ms5: 375, t6: '1/16', l6: 0, p6: 0, ms6: 125 }),
  params: [TOG('sync', 'Sync'), K('feedback', 'Feedback', 0, 1, { fmt: fPct }), K('lowcut', 'Low cut', 20, 1000, { scale: 'log', fmt: fHz }), K('highcut', 'High cut', 1000, 20000, { scale: 'log', fmt: fHz }), K('mix', 'Mix', 0, 1, { fmt: fPct }), K('out', 'Output', -12, 12, { fmt: fDb }),
    ...TAPS.flatMap(i => [{ group: 'Tap ' + i }, SEL('t' + i, 'Time', DIV_OPTS), K('ms' + i, 'Time ms', 5, 2000, { scale: 'log', fmt: fMs }), K('l' + i, 'Level', 0, 1, { fmt: fPct }), K('p' + i, 'Pan', -1, 1, { fmt: v => Math.abs(v) < 0.02 ? 'C' : (v < 0 ? 'L' : 'R') + Math.round(Math.abs(v) * 50) })])],
  presets: {
    'Ping-pong rhythm': { t1: '1/8', l1: 0.8, p1: -1, t2: '1/4', l2: 0.6, p2: 1, t3: '1/4D', l3: 0.45, p3: -1, t4: '1/2', l4: 0.3, p4: 1, feedback: 0.25 },
    'Slap and spread': { t1: '1/32', l1: 0.7, p1: -0.8, t2: '1/16', l2: 0.6, p2: 0.8, t3: '1/16D', l3: 0, t4: '1/2', l4: 0, mix: 0.3, feedback: 0 },
    'Dotted cascade': { t1: '1/8D', l1: 0.8, p1: -0.4, t2: '1/4D', l2: 0.6, p2: 0.4, t3: '1/2', l3: 0.45, p3: -0.7, t4: '1/1', l4: 0.3, p4: 0.7, feedback: 0.35, highcut: 4500 },
  } };

/* --- Motion: rotate, Doppler pass-by, stereo flange --- */
class MotionDev extends Base {
  constructor(d) {
    super(d); this.wetDry(); const c = ctx, osc = type => { const o = c.createOscillator(); o.type = type; o.start(); return o; };
    this.amL = osc('sine'); this.amG = c.createGain(); this.amG.gain.value = 0; this.vca = c.createGain(); this.amL.connect(this.amG); this.amG.connect(this.vca.gain);
    this.vib = c.createDelay(0.05); this.vib.delayTime.value = 0.008; this.fmL = osc('sine'); this.fmG = c.createGain(); this.fmG.gain.value = 0; this.fmL.connect(this.fmG); this.fmG.connect(this.vib.delayTime);
    this.pan = c.createStereoPanner(); this.panL = osc('sine'); this.panG = c.createGain(); this.panG.gain.value = 0; this.panL.connect(this.panG); this.panG.connect(this.pan.pan);
    // flange voices
    this.fA = c.createDelay(0.03); this.fB = c.createDelay(0.03); this.fA.delayTime.value = this.fB.delayTime.value = 0.004; this.fL = osc('triangle'); this.fG = c.createGain(); this.fG.gain.value = 0; this.fInv = c.createGain(); this.fInv.gain.value = -1; this.fL.connect(this.fG); this.fG.connect(this.fA.delayTime); this.fG.connect(this.fInv); this.fInv.connect(this.fB.delayTime);
    this.fFb = c.createGain(); this.fFb.gain.value = 0; this.pA = c.createStereoPanner(); this.pA.pan.value = -1; this.pB = c.createStereoPanner(); this.pB.pan.value = 1; this.flG = c.createGain(); this.flG.gain.value = 0;
    this.input.connect(this.fA); this.input.connect(this.fB); this.fA.connect(this.fFb); this.fFb.connect(this.fA); this.fA.connect(this.pA); this.fB.connect(this.pB); this.pA.connect(this.flG); this.pB.connect(this.flG);
    this.direct = c.createGain(); this.out2 = c.createGain();
    this.input.connect(this.vib); this.vib.connect(this.vca); this.vca.connect(this.pan); this.pan.connect(this.direct); this.direct.connect(this.out2); this.flG.connect(this.out2); this.out2.connect(this.wet);
    this.set();
  }
  set() {
    const p = this.d.p, hz = p.sync ? 1 / ((DIVS[p.div] || 4) * 15 / S.bpm) : p.rate, m = p.mode;
    [this.amL, this.fmL, this.panL, this.fL].forEach(o => (o.frequency.value = hz));
    if (m === 'doppler') { this.fmL.type = 'triangle'; this.panL.type = 'sawtooth'; } else { this.fmL.type = 'sine'; this.panL.type = 'sine'; }
    const rot = m === 'rotate', dop = m === 'doppler', fl = m === 'flange';
    sm(this.amG.gain, rot ? p.amp * 0.5 : dop ? p.depth * 0.45 : 0); this.vca.gain.value = 1 - (rot ? p.amp * 0.5 : dop ? p.depth * 0.45 : 0);
    sm(this.fmG.gain, rot ? p.pitch * 0.0025 : dop ? p.depth * 0.006 : 0); sm(this.panG.gain, rot ? p.pan : dop ? p.depth : 0);
    sm(this.fG.gain, fl ? 0.0035 * p.depth : 0); sm(this.fFb.gain, fl ? p.feedback * 0.9 : 0); sm(this.flG.gain, fl ? 0.8 : 0); sm(this.direct.gain, fl ? 0.7 : 1);
    sm(this.out2.gain, dbToGain(p.out)); this.mix(p.mix);
  }
  onTempo() { if (this.d.p.sync) this.set(); }
  dispose() { super.dispose(); [this.amL, this.fmL, this.panL, this.fL].forEach(o => { try { o.stop(); } catch (e) { } }); }
}
DEVICES.motion = { name: 'Motion', blurb: 'Rotate, Doppler, flange', cls: MotionDev,
  def: () => ({ mode: 'rotate', sync: true, div: '1/4', rate: 2, depth: 0.5, amp: 0.3, pitch: 0.2, pan: 0.6, feedback: 0.5, mix: 1, out: 0 }),
  params: [SEL('mode', 'Mode', [['rotate', 'Rotate (level, pitch, pan)'], ['doppler', 'Doppler pass-by'], ['flange', 'Stereo flange']]), TOG('sync', 'Sync'), SEL('div', 'Rate', DIV_OPTS), K('rate', 'Rate Hz', 0.05, 12, { scale: 'log', fmt: v => v.toFixed(2) + ' Hz' }),
    K('depth', 'Depth', 0, 1, { fmt: fPct }), K('amp', 'Level move', 0, 1, { fmt: fPct }), K('pitch', 'Pitch move', 0, 1, { fmt: fPct }), K('pan', 'Pan move', 0, 1, { fmt: fPct }), K('feedback', 'Feedback', 0, 1, { fmt: fPct }), K('mix', 'Mix', 0, 1, { fmt: fPct }), K('out', 'Output', -12, 12, { fmt: fDb })],
  presets: { 'Wobbly tremolo': { mode: 'rotate', div: '1/8', amp: 0.6, pitch: 0, pan: 0.2 }, 'Spinning speaker': { mode: 'rotate', sync: false, rate: 5.5, amp: 0.25, pitch: 0.35, pan: 0.7 }, 'Car passing': { mode: 'doppler', div: '1/1', depth: 0.8 }, 'Jet flange': { mode: 'flange', sync: false, rate: 0.12, depth: 0.9, feedback: 0.8 } } };

/* --- Spaces: plate, room, hall, chamber, spring, or your own impulse response --- */
function spaceIR(c, type, secs) {
  if (type === 'hall') return hallIR(c, secs, 0.55);
  const sr = c.sampleRate, n = Math.floor(sr * Math.min(10, secs * 1.2 + 0.05)), b = c.createBuffer(2, n, sr), k = Math.log(1000) / (secs * sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch); let lp = 0;
    const bright = type === 'plate' ? 0.85 : type === 'room' ? 0.5 : type === 'chamber' ? 0.35 : 0.6;
    for (let i = 0; i < n; i++) { lp += ((Math.random() * 2 - 1) - lp) * (bright - 0.3 * i / n); d[i] = lp * Math.exp(-k * i) * (type === 'plate' ? Math.min(1, i / (sr * 0.002)) : Math.min(1, i / (sr * 0.008))); }
    if (type === 'room' || type === 'chamber') { const er = type === 'room' ? [0.004, 0.007, 0.011, 0.016, 0.022, 0.029] : [0.009, 0.014, 0.021, 0.03, 0.041, 0.055]; er.forEach((t, j) => { const i = Math.floor((t + ch * 0.0017) * sr); if (i < n) d[i] += (0.7 - j * 0.09) * (j % 2 ? -1 : 1); }); }
    if (type === 'spring') { for (let e = 0; e * 0.033 < secs; e++) { const at = Math.floor((e * 0.033 + ch * 0.003) * sr), amp = Math.exp(-e * 0.033 / secs * 6.9) * 0.6; for (let i = 0; i < sr * 0.025 && at + i < n; i++) { const t = i / sr, f = 4200 * Math.exp(-t * 80) + 500; d[at + i] += Math.sin(2 * Math.PI * f * t) * amp * (1 - t / 0.025); } } }
  }
  return b;
}
const IR_CACHE = new Map();   // path -> decoded buffer; convolvers need it at their own context's rate
function irAtRate(path, c) {
  const src = IR_CACHE.get(path); if (!src) return null; if (src.sampleRate === c.sampleRate) return src;
  const k = path + '@' + c.sampleRate; if (IR_CACHE.has(k)) return IR_CACHE.get(k);
  const ratio = src.sampleRate / c.sampleRate, n = Math.max(1, Math.floor(src.length / ratio)), out = c.createBuffer(src.numberOfChannels, n, c.sampleRate);
  for (let ch = 0; ch < src.numberOfChannels; ch++) { const a = src.getChannelData(ch), b = out.getChannelData(ch); for (let i = 0; i < n; i++) { const x = i * ratio, j = Math.floor(x), f = x - j; if (ratio > 1) { let s = 0; const e = Math.min(a.length, Math.ceil(x + ratio)); for (let q = j; q < e; q++) s += a[q]; b[i] = s / Math.max(1, e - j) * Math.min(ratio, 2); } else b[i] = (a[j] || 0) * (1 - f) + (a[j + 1] || 0) * f; } }
  IR_CACHE.set(k, out); return out;
}
class SpacesDev extends Base {
  constructor(d) {
    super(d); this.wetDry(); const c = ctx;
    this.pre = c.createDelay(0.5); this.cv = c.createConvolver(); this.hp = c.createBiquadFilter(); this.hp.type = 'highpass'; this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.out2 = c.createGain();
    this.split = c.createChannelSplitter(2); this.merge = c.createChannelMerger(2); this.mid = c.createGain(); this.side = c.createGain(); this.inv = c.createGain(); this.inv.gain.value = -1;
    this.input.connect(this.pre); this.pre.connect(this.cv); this.cv.connect(this.hp); this.hp.connect(this.lp); this.lp.connect(this.out2); this.out2.connect(this.wet);
    this.set();
  }
  async loadIR() { const p = this.d.p; if (!p.irPath || !IS_DESKTOP) return false; try { const buf = IR_CACHE.get(p.irPath) || await decodeAudio(await NATIVE.read(p.irPath)); IR_CACHE.set(p.irPath, buf); if (this.d.p.irPath === p.irPath) { this.cv.buffer = irAtRate(p.irPath, this.cv.context); this._ir = 'file:' + p.irPath; } return true; } catch (e) { toast(`The impulse response ${p.irName || ''} could not be loaded. Using ${p.type}.`); return false; } }
  set() {
    const p = this.d.p, key = p.type === 'file' ? 'file:' + p.irPath : p.type + p.decay.toFixed(2);
    if (key !== this._ir && p.type === 'file' && IR_CACHE.has(p.irPath)) { this._ir = key; this.cv.buffer = irAtRate(p.irPath, this.cv.context); }   // already decoded (also lets exports include it)
    if (key !== this._ir) { if (p.type === 'file') { this._ir = key; this.loadIR().then(ok => { if (!ok) { this.cv.buffer = spaceIR(this.cv.context, 'hall', p.decay); } }); } else { clearTimeout(this._t); const mk = () => { this._ir = key; this.cv.buffer = spaceIR(this.cv.context, p.type, p.decay); }; if (!this._ir) mk(); else this._t = setTimeout(mk, 150); } }
    sm(this.pre.delayTime, p.predelay / 1000); sm(this.hp.frequency, p.lowcut); sm(this.lp.frequency, p.highcut); sm(this.out2.gain, dbToGain(p.out)); this.mix(p.mix);
  }
  dispose() { super.dispose(); clearTimeout(this._t); }
}
DEVICES.spaces = { name: 'Spaces', blurb: 'Plate, room, hall, chamber, spring, your own IRs', cls: SpacesDev,
  def: () => ({ type: 'plate', decay: 1.8, predelay: 10, lowcut: 200, highcut: 9000, mix: 0.3, out: 0, irPath: '', irName: '' }),
  params: [SEL('type', 'Space', [['plate', 'Plate'], ['room', 'Room'], ['hall', 'Hall'], ['chamber', 'Chamber'], ['spring', 'Spring'], ['file', 'Impulse response file']]), K('decay', 'Decay', 0.2, 8, { scale: 'log', fmt: v => v.toFixed(1) + ' s' }), K('predelay', 'Pre-delay', 0, 200, { fmt: v => Math.round(v) + ' ms' }), K('lowcut', 'Low cut', 20, 1000, { scale: 'log', fmt: fHz }), K('highcut', 'High cut', 1500, 20000, { scale: 'log', fmt: fHz }), K('mix', 'Mix', 0, 1, { fmt: fPct }), K('out', 'Output', -12, 12, { fmt: fDb })],
  presets: { 'Vocal plate': { type: 'plate', decay: 1.6, predelay: 25, lowcut: 250, mix: 0.25 }, 'Drum room': { type: 'room', decay: 0.6, predelay: 0, mix: 0.2, highcut: 7000 }, 'Big hall': { type: 'hall', decay: 3.5, predelay: 30, mix: 0.35 }, 'Dark chamber': { type: 'chamber', decay: 1.4, highcut: 5000, mix: 0.3 }, 'Surf spring': { type: 'spring', decay: 2, lowcut: 300, mix: 0.35 } } };
async function spacesPickIR(d) {
  if (!IS_DESKTOP) return toast('Loading impulse responses needs the desktop app.');
  const fs = await pickFile('audio', 'audio/*', false); if (!fs.length || !fs[0].path) return; pushUndo('Impulse response'); d.p.type = 'file'; d.p.irPath = fs[0].path; d.p.irName = fs[0].name; const r = DEV_RT.get(d.id); if (r) r.set(); markDirty(); ui.detail();
}

/* --- Half: half-time, locked to the song --- */
class HalfDev extends Base {
  constructor(d) { super(d); this.node = PITCH_OK ? new AudioWorkletNode(ctx, 'gw-half', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] }) : null; if (this.node) { this.input.connect(this.node); this.node.connect(this.output); } else this.input.connect(this.output); this.set(); }
  set() { const p = this.d.p; if (this.node) this.node.port.postMessage({ win: +p.length, mode: p.mode, mix: p.mix }); }
  transport(time, pos) { if (!this.node) return; if (time == null) return this.node.port.postMessage({ on: false }); this.node.port.postMessage({ on: true, t0: timeAt(pos), p0: pos, bpm: bpmAt(pos) }); }
  dispose() { super.dispose(); if (this.node) this.node.disconnect(); }
}
DEVICES.half = { name: 'Half', blurb: 'Half-time, in time with the song', cls: HalfDev,
  def: () => ({ length: 8, mode: 'tape', mix: 1 }),
  params: [SEL('length', 'Window', [[4, '1 beat'], [8, '2 beats'], [16, '1 bar'], [32, '2 bars']]), SEL('mode', 'Sound', [['tape', 'Tape (an octave down)'], ['keep', 'Keep the pitch']]), K('mix', 'Mix', 0, 1, { fmt: fPct })] };

/* --- Stereo: mid/side and width --- */
class StereoDev extends Base {
  constructor(d) {
    super(d); const c = ctx;
    this.sp = c.createChannelSplitter(2); this.mg = c.createChannelMerger(2);
    this.mL = c.createGain(); this.mR = c.createGain(); this.sL = c.createGain(); this.sR = c.createGain(); this.mL.gain.value = this.mR.gain.value = 0.5; this.sL.gain.value = 0.5; this.sR.gain.value = -0.5;
    this.mid = c.createGain(); this.side = c.createGain(); this.sideHp = c.createBiquadFilter(); this.sideHp.type = 'highpass'; this.sideHp.frequency.value = 10;
    this.sideInv = c.createGain(); this.sideInv.gain.value = -1; this.bal = c.createStereoPanner();
    this.input.connect(this.sp); this.sp.connect(this.mL, 0); this.sp.connect(this.mR, 1); this.sp.connect(this.sL, 0); this.sp.connect(this.sR, 1);
    this.mL.connect(this.mid); this.mR.connect(this.mid); this.sL.connect(this.sideHp); this.sR.connect(this.sideHp); this.sideHp.connect(this.side);
    this.mid.connect(this.mg, 0, 0); this.mid.connect(this.mg, 0, 1); this.side.connect(this.mg, 0, 0); this.side.connect(this.sideInv); this.sideInv.connect(this.mg, 0, 1);
    this.mg.connect(this.bal); this.bal.connect(this.output); this.set();
  }
  set() {
    const p = this.d.p, lis = p.listen;
    sm(this.mid.gain, lis === 'side' ? 0 : dbToGain(p.mid)); sm(this.side.gain, lis === 'mid' ? 0 : dbToGain(p.side) * p.width); sm(this.sideHp.frequency, p.monoBass > 21 ? p.monoBass : 10); sm(this.bal.pan, p.balance);
  }
}
DEVICES.stereo = { name: 'Stereo', blurb: 'Mid/side, width, mono bass', cls: StereoDev,
  def: () => ({ width: 1, mid: 0, side: 0, monoBass: 20, balance: 0, listen: 'stereo' }),
  params: [K('width', 'Width', 0, 2, { fmt: fPct }), K('mid', 'Mid', -12, 12, { fmt: fDb }), K('side', 'Side', -12, 12, { fmt: fDb }), K('monoBass', 'Mono below', 20, 400, { scale: 'log', fmt: v => v < 21 ? 'Off' : fHz(v) }), K('balance', 'Balance', -1, 1, { fmt: v => Math.abs(v) < 0.02 ? 'C' : (v < 0 ? 'L' : 'R') + Math.round(Math.abs(v) * 50) }), SEL('listen', 'Listen', [['stereo', 'Stereo'], ['mid', 'Mid only'], ['side', 'Side only']])],
  presets: { 'Wider': { width: 1.4, monoBass: 120 }, 'Mono check': { width: 0 }, 'Tighten the low end': { monoBass: 150 }, 'Focus the centre': { mid: 2, side: -2 } } };
