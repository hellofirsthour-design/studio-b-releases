/* ============ Dynamics processors (audio worklets) ============
   Loaded with the other worklets by loadWorklets in core.js, so this file comes before core.js. Plain JS in a string:
   no backticks or template placeholders inside. */
const DYN_WORKLET = String.raw`
const dbg = g => 20 * Math.log10(Math.max(g, 1e-9)), gdb = d => Math.pow(10, d / 20);
const coef = ms => Math.exp(-1 / (Math.max(0.01, ms) * sampleRate / 1000));
// 2nd-order Butterworth sections (RBJ), used for detector filters and crossovers
function biq(type, f, q) {
  const w = 2 * Math.PI * Math.min(f, sampleRate * 0.45) / sampleRate, c = Math.cos(w), s = Math.sin(w), a = s / (2 * (q || 0.7071)); let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = b0; } else { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = b0; }
  const a0 = 1 + a; return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: -2 * c / a0, a2: (1 - a) / a0 };
}
function run(k, st, x) { const y = k.b0 * x + st[0]; st[0] = k.b1 * x - k.a1 * y + st[1]; st[1] = k.b2 * x - k.a2 * y; return y; }

// Character compressor: FET, Opto, Vari-Mu and VCA behaviour in one design.
class GWChar extends AudioWorkletProcessor {
  constructor() { super(); Object.assign(this, { model: 'fet', input: 0, thr: -18, ratio: 4, att: 5, rel: 120, knee: 6, out: 0, mix: 1, color: 0.5, hpf: 0, sc: false, env: 0, gr: 0, charge: 0, rep: 0, maxGr: 0, s1: [0, 0], s2: [0, 0], dc: [0, 0, 0, 0] }); this.port.onmessage = e => { Object.assign(this, e.data); this.hk = this.hpf > 20 ? biq('hp', this.hpf) : null; }; }
  process(inputs, outputs) {
    const inp = inputs[0], sc = inputs[1], out = outputs[0]; if (!out || !out[0]) return true;
    const n = out[0].length, L = inp && inp[0], R = inp && (inp[1] || inp[0]), ig = gdb(this.input), og = gdb(this.out), m = this.model;
    const rms = m === 'opto' || m === 'vari', aC = coef(m === 'opto' ? 10 : this.att), detC = coef(rms ? 8 : 0.05), col = this.color;
    for (let i = 0; i < n; i++) {
      const xl = L ? L[i] * ig : 0, xr = R ? R[i] * ig : 0;
      let dl = xl, dr = xr; if (this.sc && sc && sc[0]) { dl = sc[0][i]; dr = (sc[1] || sc[0])[i]; }
      let d = Math.max(Math.abs(dl), Math.abs(dr)); if (this.hk) d = Math.abs(run(this.hk, this.s1, (dl + dr) * 0.5));
      const lv = rms ? d * d : d; this.env = lv > this.env ? lv + (this.env - lv) * (rms ? detC : 0) : lv + (this.env - lv) * detC;
      const db = dbg(rms ? Math.sqrt(this.env) : this.env), over = db - this.thr, k = this.knee / 2;
      let ratio = this.ratio; if (m === 'vari') ratio = 1 + (this.ratio - 1) * Math.min(1, Math.max(0, over + k) / 12); // ratio grows the harder it is pushed
      let tgt = 0; if (over > k) tgt = over * (1 - 1 / ratio); else if (over > -k) tgt = (1 - 1 / ratio) * (over + k) * (over + k) / (4 * k || 1);
      if (tgt > this.gr) { this.gr = tgt + (this.gr - tgt) * aC; this.charge = Math.min(1, this.charge + 1 / (sampleRate * 2)); }
      else { const relMs = m === 'opto' ? 60 + this.charge * 1500 : m === 'vari' ? this.rel * (1 + this.gr / 10) : this.rel; this.gr = tgt + (this.gr - tgt) * coef(relMs); this.charge = Math.max(0, this.charge - 1 / (sampleRate * 4)); }
      if (this.gr > this.maxGr) this.maxGr = this.gr;
      const g = gdb(-this.gr);
      for (let c = 0; c < out.length; c++) {
        const x = c ? xr : xl; let y = x * g;
        if (m === 'fet') y = y + col * 0.25 * (Math.tanh(y * 2) / 2 - y);                           // odd harmonics, a bit of bite
        else if (m === 'opto' || m === 'vari') { const e = col * (m === 'vari' ? 0.18 : 0.08) * y * y; this.dc[c] = this.dc[c] * 0.9995 + e * 0.0005; y = y + e - this.dc[c]; } // even harmonics (tube)
        out[c][i] = (y * og) * this.mix + (c ? (R ? R[i] : 0) : (L ? L[i] : 0)) * (1 - this.mix);
      }
    }
    this.rep += n; if (this.rep > 2048) { this.rep = 0; this.port.postMessage({ gr: this.maxGr }); this.maxGr = 0; }
    return true;
  }
}
registerProcessor('gw-char', GWChar);

// Multiband (1 or 3 bands) upward and downward compression.
class GWBands extends AudioWorkletProcessor {
  constructor() {
    super(); Object.assign(this, { bands: 3, f1: 120, f2: 2500, amount: 1, input: 0, out: 0, mix: 1, b: [0, 1, 2].map(() => ({ dthr: -20, dr: 4, uthr: -40, ur: 2, gain: 0, att: 10, rel: 120, env: 0, gdb: 0, rep: 0 })), rep: 0 });
    this.st = Array.from({ length: 2 }, () => Array.from({ length: 12 }, () => [0, 0])); this.mk();
    this.port.onmessage = e => { const d = e.data; if (d.b) d.b.forEach((x, i) => Object.assign(this.b[i], x)); delete d.b; Object.assign(this, d); this.mk(); };
  }
  mk() { this.k = { lp1: biq('lp', this.f1), hp1: biq('hp', this.f1), lp2: biq('lp', this.f2), hp2: biq('hp', this.f2) }; }
  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0]; if (!out || !out[0]) return true;
    const n = out[0].length, C = out.length, ig = gdb(this.input), og = gdb(this.out), K = this.k, nb = this.bands === 1 ? 1 : 3, bb = this.b;
    const aC = bb.map(b => coef(b.att)), rC = bb.map(b => coef(b.rel));
    for (let i = 0; i < n; i++) {
      const xs = [], parts = [];
      for (let c = 0; c < C; c++) {
        const src = inp && (inp[c] || inp[0]); const x = src ? src[i] * ig : 0; xs.push(x);
        if (nb === 1) { parts.push([x]); continue; }
        const s = this.st[c];
        const lo = run(K.lp1, s[1], run(K.lp1, s[0], x)), rest = run(K.hp1, s[3], run(K.hp1, s[2], x));
        const mid = run(K.lp2, s[5], run(K.lp2, s[4], rest)), hi = run(K.hp2, s[7], run(K.hp2, s[6], rest));
        const loAp = run(K.lp2, s[9], run(K.lp2, s[8], lo)) + run(K.hp2, s[11], run(K.hp2, s[10], lo)); // keep the low band in phase with the others
        parts.push([loAp, mid, hi]);
      }
      for (let j = 0; j < nb; j++) {
        const b = bb[j]; let lv = 0; for (let c = 0; c < C; c++) lv = Math.max(lv, Math.abs(parts[c][j]));
        b.env = lv > b.env ? lv + (b.env - lv) * aC[j] : lv + (b.env - lv) * rC[j];
        const db = dbg(b.env); let g = 0;
        if (db > b.dthr) g -= (db - b.dthr) * (1 - 1 / b.dr);
        if (db < b.uthr && db > -75) g += Math.min(24, (b.uthr - db) * (1 - 1 / b.ur));
        b.gdb = g * this.amount + b.gain; b.rep = Math.min(b.rep, b.gdb); b.rmax = Math.max(b.rmax || -99, b.gdb);
      }
      for (let c = 0; c < C; c++) { let y = 0; for (let j = 0; j < nb; j++) y += parts[c][j] * gdb(bb[j].gdb); out[c][i] = y * og * this.mix + xs[c] / ig * (1 - this.mix); }
    }
    this.rep += n; if (this.rep > 2048) { this.rep = 0; this.port.postMessage({ g: bb.slice(0, nb).map(b => { const v = Math.abs(b.rep) > Math.abs(b.rmax) ? b.rep : b.rmax; b.rep = 0; b.rmax = -99; return v; }) }); }
    return true;
  }
}
registerProcessor('gw-bands', GWBands);

// Look-ahead brickwall maximizer: lowering the threshold drives the level up; nothing passes the ceiling.
class GWMax extends AudioWorkletProcessor {
  constructor() {
    super(); Object.assign(this, { thr: 0, ceil: -0.3, rel: 80, auto: true, la: Math.round(sampleRate * 0.0015), g: 1, rep: 0, minG: 1, slow: 1 });
    const N = this.la + 1; this.buf = [new Float32Array(N), new Float32Array(N)]; this.req = new Float32Array(N); this.box = new Float32Array(N); this.w = 0; this.boxSum = N; this.box.fill(1); this.req.fill(1);
    this.port.onmessage = e => Object.assign(this, e.data);
  }
  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0]; if (!out || !out[0]) return true;
    const n = out[0].length, N = this.la + 1, ig = gdb(-this.thr), ceil = gdb(this.ceil), C = out.length;
    for (let i = 0; i < n; i++) {
      let pk = 0; const w = this.w;
      for (let c = 0; c < 2; c++) { const src = inp && (inp[c] || inp[0]); const x = src ? src[i] * ig : 0; this.buf[c][w] = x; pk = Math.max(pk, Math.abs(x)); }
      this.req[w] = pk > ceil ? ceil / pk : 1;
      let mn = 1; for (let k = 0; k < N; k++) if (this.req[k] < mn) mn = this.req[k];      // the quietest gain any sample in the window needs
      this.boxSum += mn - this.box[w]; this.box[w] = mn; const tgt = Math.min(mn, this.boxSum / N);
      const relMs = this.auto ? this.rel * (0.4 + 2.5 * (1 - this.slow)) : this.rel; this.slow = this.slow * 0.99995 + tgt * 0.00005;
      this.g = tgt < this.g ? tgt : tgt + (this.g - tgt) * coef(relMs); if (this.g < this.minG) this.minG = this.g;
      const r = (w + 1) % N;                                                                       // the oldest sample comes out now
      for (let c = 0; c < C; c++) { const y = this.buf[c < 2 ? c : 0][r] * this.g; out[c][i] = Math.max(-ceil, Math.min(ceil, y)); }
      this.w = r;
    }
    this.rep += n; if (this.rep > 2048) { this.rep = 0; this.port.postMessage({ gr: -dbg(this.minG) }); this.minG = 1; }
    return true;
  }
}
registerProcessor('gw-max', GWMax);

// Level rider: moves the gain slowly toward a target loudness, within a range, and leaves quiet gaps alone.
class GWRide extends AudioWorkletProcessor {
  constructor() { super(); Object.assign(this, { target: -18, range: 9, speed: 300, floor: -50, ms: 0, gdb: 0, rep: 0 }); this.port.onmessage = e => Object.assign(this, e.data); }
  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0]; if (!out || !out[0]) return true;
    const n = out[0].length, mC = coef(this.speed * 0.5), gC = coef(this.speed);
    for (let i = 0; i < n; i++) {
      let s = 0, cs = 0; for (let c = 0; c < out.length; c++) { const src = inp && (inp[c] || inp[0]); const x = src ? src[i] : 0; s += x * x; cs++; }
      this.ms = s / cs + (this.ms - s / cs) * mC; const db = dbg(Math.sqrt(this.ms));
      if (db > this.floor) { const want = Math.max(-this.range, Math.min(this.range, this.target - db)); this.gdb = want + (this.gdb - want) * gC; }
      const g = gdb(this.gdb); for (let c = 0; c < out.length; c++) { const src = inp && (inp[c] || inp[0]); out[c][i] = (src ? src[i] : 0) * g; }
    }
    this.rep += n; if (this.rep > 2048) { this.rep = 0; this.port.postMessage({ g: this.gdb }); }
    return true;
  }
}
registerProcessor('gw-ride', GWRide);

// De-esser (split band or wideband) and breath control share one processor.
class GWVox extends AudioWorkletProcessor {
  constructor() { super(); Object.assign(this, { mode: 'deess', freq: 6000, thr: -30, range: 10, split: true, listen: false, bthr: -38, bred: 12, env: 0, g: 1, hpS: [[0, 0], [0, 0]], dS: [0, 0], ms: 0, zc: 0, prev: 0, rep: 0, maxR: 0 }); this.port.onmessage = e => { Object.assign(this, e.data); this.k = biq('hp', this.freq); }; this.k = biq('hp', this.freq); }
  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0]; if (!out || !out[0]) return true;
    const n = out[0].length, C = out.length, aC = coef(1), rC = coef(this.mode === 'deess' ? 60 : 120), mC = coef(15);
    for (let i = 0; i < n; i++) {
      const xs = []; for (let c = 0; c < C; c++) { const src = inp && (inp[c] || inp[0]); xs.push(src ? src[i] : 0); }
      if (this.mode === 'deess') {
        const his = xs.map((x, c) => run(this.k, this.hpS[c], x)); const lv = Math.max(...his.map(Math.abs));
        this.env = lv > this.env ? lv + (this.env - lv) * aC : lv + (this.env - lv) * rC;
        const over = dbg(this.env) - this.thr, red = over > 0 ? Math.min(this.range, over * 0.75) : 0, g = gdb(-red); if (red > this.maxR) this.maxR = red;
        for (let c = 0; c < C; c++) out[c][i] = this.listen ? his[c] : this.split ? xs[c] - his[c] + his[c] * g : xs[c] * g;
      } else {
        // breath: quiet and noisy (many zero crossings) between phrases
        const m = (xs[0] + (xs[1] || xs[0])) * 0.5; this.ms = m * m + (this.ms - m * m) * mC; const cross = (m >= 0) !== (this.prev >= 0) ? 1 : 0; this.prev = m; this.zc = cross + (this.zc - cross) * mC;
        const db = dbg(Math.sqrt(this.ms)), breath = db < this.bthr && db > -70 && this.zc > 0.08, tgt = breath ? gdb(-this.bred) : 1;
        this.g = tgt < this.g ? tgt + (this.g - tgt) * coef(8) : tgt + (this.g - tgt) * coef(40); if (-dbg(this.g) > this.maxR) this.maxR = -dbg(this.g);
        for (let c = 0; c < C; c++) out[c][i] = xs[c] * this.g;
      }
    }
    this.rep += n; if (this.rep > 2048) { this.rep = 0; this.port.postMessage({ gr: this.maxR }); this.maxR = 0; }
    return true;
  }
}
registerProcessor('gw-vox', GWVox);

// Drum enhancer, first stage: transient shaping (punch / sustain) and heat (four saturation styles).
class GWPunch extends AudioWorkletProcessor {
  constructor() { super(); Object.assign(this, { punch: 0, sustain: 0, heat: 0, style: 'warm', ef: 0, es: 0, dc: [0, 0], rep: 0, maxG: 0 }); this.port.onmessage = e => Object.assign(this, e.data); }
  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0]; if (!out || !out[0]) return true;
    const n = out[0].length, C = out.length, fa = coef(0.5), fr = coef(25), sa = coef(12), sr = coef(150), drive = gdb(this.heat * 24), st = this.style, comp = 1 / Math.sqrt(drive);
    for (let i = 0; i < n; i++) {
      let lv = 0; for (let c = 0; c < C; c++) { const src = inp && (inp[c] || inp[0]); lv = Math.max(lv, Math.abs(src ? src[i] : 0)); }
      this.ef = lv > this.ef ? lv + (this.ef - lv) * fa : lv + (this.ef - lv) * fr; this.es = lv > this.es ? lv + (this.es - lv) * sa : lv + (this.es - lv) * sr;
      const diff = dbg(this.ef) - dbg(this.es), gd = Math.max(-18, Math.min(18, diff > 0 ? this.punch * diff * 1.5 : this.sustain * -diff * 0.7)); if (Math.abs(gd) > Math.abs(this.maxG)) this.maxG = gd;
      const g = gdb(dbg(this.es) < -70 ? 0 : gd);
      for (let c = 0; c < C; c++) {
        const src = inp && (inp[c] || inp[0]); let y = (src ? src[i] : 0) * g;
        if (this.heat > 0) { const x = y * drive; let s;
          if (st === 'warm') s = Math.tanh(x);
          else if (st === 'tube') { s = Math.tanh(x + 0.25 * x * x); this.dc[c] = this.dc[c] * 0.999 + s * 0.001; s -= this.dc[c]; }
          else if (st === 'crunch') s = Math.max(-1, Math.min(1, 1.5 * x - 0.5 * x * x * x)) ;
          else s = Math.sin(Math.max(-3, Math.min(3, x)) * 1.2);                                      // fuzz: folds back
          y = (this.heat < 1 ? y * (1 - this.heat) + s * comp * this.heat * 1.4 : s * comp * 1.4); }
        out[c][i] = y;
      }
    }
    this.rep += n; if (this.rep > 2048) { this.rep = 0; this.port.postMessage({ g: this.maxG }); this.maxG = 0; }
    return true;
  }
}
registerProcessor('gw-punch', GWPunch);

// Drum enhancer, last stage: clipper (soft or hard) and stereo width above 200 Hz.
class GWClip extends AudioWorkletProcessor {
  constructor() { super(); Object.assign(this, { clip: 0, hard: false, width: 1, out: 0, mix: 1, s: [[0, 0], [0, 0]], rep: 0, hits: 0 }); this.k = biq('hp', 200); this.port.onmessage = e => Object.assign(this, e.data); }
  process(inputs, outputs) {
    const inp = inputs[0], dry = inputs[1], out = outputs[0]; if (!out || !out[0]) return true;
    const n = out[0].length, C = out.length, cg = gdb(this.clip), og = gdb(this.out);
    for (let i = 0; i < n; i++) {
      let l = inp && inp[0] ? inp[0][i] : 0, r = inp && (inp[1] || inp[0]) ? (inp[1] || inp[0])[i] : l;
      if (C > 1 && this.width !== 1) { const hl = run(this.k, this.s[0], l), hr = run(this.k, this.s[1], r), m = (hl + hr) / 2, sd = (hl - hr) / 2 * this.width; l = l - hl + m + sd; r = r - hr + m - sd; }
      const ys = [l, r].map(x => { x *= cg; if (Math.abs(x) > 1) this.hits++; return this.hard ? Math.max(-1, Math.min(1, x)) : Math.tanh(x * 1.1) / Math.tanh(1.1); });
      for (let c = 0; c < C; c++) { const d = dry && dry[0] ? (dry[c] || dry[0])[i] : 0; out[c][i] = ys[c ? 1 : 0] * og * this.mix + d * (1 - this.mix); }
    }
    this.rep += n; if (this.rep > 2048) { this.rep = 0; this.port.postMessage({ clipping: this.hits }); this.hits = 0; }
    return true;
  }
}
registerProcessor('gw-clip', GWClip);

// Pitch shifter (two crossfaded taps on a short delay line): shimmer reverb's octave.
class GWShift extends AudioWorkletProcessor {
  constructor() { super(); this.semis = 12; this.N = 1 << 14; this.buf = [new Float32Array(this.N), new Float32Array(this.N)]; this.w = 0; this.ph = 0; this.W = Math.round(sampleRate * 0.05); this.port.onmessage = e => Object.assign(this, e.data); }
  tap(b, d) { const p = this.w - d, i = Math.floor(p), f = p - i, m = this.N - 1; return b[i & m] * (1 - f) + b[(i + 1) & m] * f; }
  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0]; if (!out || !out[0]) return true;
    const n = out[0].length, r = Math.pow(2, this.semis / 12), step = (r - 1) / this.W, m = this.N - 1;
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 2; c++) { const src = inp && (inp[c] || inp[0]); this.buf[c][this.w & m] = src ? src[i] : 0; }
      this.ph -= step; this.ph -= Math.floor(this.ph); const p2 = (this.ph + 0.5) % 1, g1 = Math.sin(Math.PI * this.ph), g2 = Math.sin(Math.PI * p2);
      for (let c = 0; c < out.length; c++) { const b = this.buf[c < 2 ? c : 0]; out[c][i] = this.tap(b, 2 + this.ph * this.W) * g1 + this.tap(b, 2 + p2 * this.W) * g2; }
      this.w++;
    }
    return true;
  }
}
registerProcessor('gw-shift', GWShift);

// Granular delay: little pieces of the past ("grains") replayed at the delay time, scattered, sometimes an octave up or reversed.
class GWGrain extends AudioWorkletProcessor {
  constructor() {
    super(); Object.assign(this, { time: 0.375, size: 0.09, density: 18, scatter: 0.06, fb: 0.35, octave: 0.2, reverse: 0.15 });
    this.N = 1 << 18; this.buf = [new Float32Array(this.N), new Float32Array(this.N)]; this.w = 0; this.acc = 0; this.g = []; this.last = [0, 0];
    this.port.onmessage = e => Object.assign(this, e.data);
  }
  process(inputs, outputs) {
    const inp = inputs[0], out = outputs[0]; if (!out || !out[0]) return true;
    const n = out[0].length, m = this.N - 1, sr = sampleRate, norm = 1 / Math.sqrt(Math.max(1, this.density * this.size));
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 2; c++) { const src = inp && (inp[c] || inp[0]); this.buf[c][this.w & m] = (src ? src[i] : 0) + this.last[c] * this.fb; }
      this.acc += this.density / sr;
      while (this.acc >= 1 && this.g.length < 40) { this.acc -= 1;
        const len = Math.max(64, Math.round(this.size * sr * (0.7 + Math.random() * 0.6))), rev = Math.random() < this.reverse, rate = (Math.random() < this.octave ? 2 : 1) * (rev ? -1 : 1);
        const back = this.time * sr + Math.random() * this.scatter * sr + (rate > 1 ? len : 0) + (rev ? 0 : 0);
        this.g.push({ pos: this.w - back + (rev ? len : 0), rate, len, age: 0, pan: Math.random() * 2 - 1 }); }
      if (this.acc > 1) this.acc = 1;
      let l = 0, r = 0;
      for (let k = this.g.length - 1; k >= 0; k--) {
        const g = this.g[k], env = Math.sin(Math.PI * g.age / g.len), p = g.pos, j = Math.floor(p), f = p - j;
        const a = this.buf[0][j & m] * (1 - f) + this.buf[0][(j + 1) & m] * f, b = this.buf[1][j & m] * (1 - f) + this.buf[1][(j + 1) & m] * f;
        const pl = Math.min(1, 1 - g.pan), pr = Math.min(1, 1 + g.pan); l += a * env * pl; r += b * env * pr;
        g.pos += g.rate; g.age++; if (g.age >= g.len) this.g.splice(k, 1);
      }
      l *= norm; r *= norm; this.last[0] = l; this.last[1] = r;
      out[0][i] = l; if (out[1]) out[1][i] = r; this.w++;
    }
    return true;
  }
}
registerProcessor('gw-grain', GWGrain);
`;
