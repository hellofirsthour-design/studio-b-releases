/* ============ sample analysis: onsets, tempo, key, time-stretch ============ */
function monoOf(buf) {
  const n = buf.length, out = new Float32Array(n), C = buf.numberOfChannels;
  for (let c = 0; c < C; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) out[i] += d[i] / C; }
  return out;
}
function onsetEnvelope(x, hop = 512, N = 1024) {
  const frames = Math.max(1, Math.floor((x.length - N) / hop));
  const env = new Float32Array(frames), w = hann(N);
  let prev = new Float32Array(N / 2);
  const re = new Float32Array(N), im = new Float32Array(N);
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < N; i++) { re[i] = x[f * hop + i] * w[i]; im[i] = 0; }
    fft(re, im);
    let flux = 0; const cur = new Float32Array(N / 2);
    for (let k = 1; k < N / 2; k++) { const m = Math.log1p(10 * Math.hypot(re[k], im[k])); cur[k] = m; const d = m - prev[k]; if (d > 0) flux += d; }
    env[f] = flux; prev = cur;
  }
  return env;
}
function detectTempo(env, sr, hop, durSec) {
  const fps = sr / hop; let best = 120, bestV = -1;
  for (let bpm = 70; bpm <= 180; bpm += 0.5) {
    const lag = 60 / bpm * fps; let s = 0;
    for (let i = 0; i + lag * 2 < env.length; i++) { const j = i + lag, j0 = Math.floor(j), fr = j - j0; s += env[i] * (env[j0] * (1 - fr) + (env[j0 + 1] || 0) * fr); }
    s *= 1 + 0.15 * Math.exp(-Math.pow((bpm - 110) / 40, 2));
    if (s > bestV) { bestV = s; best = bpm; }
  }
  // Loops usually hold a whole number of beats: prefer a tempo that fits the length exactly.
  let fit = best, fd = 1e9;
  for (const beats of [4, 8, 12, 16, 24, 32, 64]) {
    const b = beats * 60 / durSec; if (b < 65 || b > 185) continue;
    const d = Math.abs(b - best) / best; if (d < fd) { fd = d; fit = b; }
  }
  return Math.round((fd < 0.06 ? fit : best) * 10) / 10;
}
const KS_MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KS_MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
function detectKey(x, sr) {
  const N = 8192, chroma = new Float64Array(12), w = hann(N);
  const re = new Float32Array(N), im = new Float32Array(N);
  for (let s = 0; s + N < x.length; s += N / 2) {
    for (let i = 0; i < N; i++) { re[i] = x[s + i] * w[i]; im[i] = 0; }
    fft(re, im);
    for (let k = 1; k < N / 2; k++) {
      const f = k * sr / N; if (f < 55 || f > 2000) continue;
      const midi = 69 + 12 * Math.log2(f / 440), pc = ((Math.round(midi) % 12) + 12) % 12;
      chroma[pc] += Math.hypot(re[k], im[k]);
    }
  }
  const corr = (prof, r) => {
    let ma = 0, mb = 0; for (let i = 0; i < 12; i++) { ma += chroma[(i + r) % 12]; mb += prof[i]; } ma /= 12; mb /= 12;
    let n = 0, da = 0, db = 0; for (let i = 0; i < 12; i++) { const a = chroma[(i + r) % 12] - ma, b = prof[i] - mb; n += a * b; da += a * a; db += b * b; }
    return n / Math.sqrt(da * db || 1);
  };
  let best = { root: 0, mode: 'major', score: -2 };
  for (let r = 0; r < 12; r++) {
    const a = corr(KS_MAJ, r), b = corr(KS_MIN, r);
    if (a > best.score) best = { root: r, mode: 'major', score: a };
    if (b > best.score) best = { root: r, mode: 'minor', score: b };
  }
  return best;
}
const keyLabel = (root, mode) => PC[((root % 12) + 12) % 12] + (mode === 'minor' ? ' min' : ' maj');
function findCues(env, sr, hop, count, durSec) {
  const fps = sr / hop; let mean = 0; env.forEach(v => (mean += v)); mean /= env.length || 1;
  let sd = 0; env.forEach(v => (sd += (v - mean) ** 2)); sd = Math.sqrt(sd / (env.length || 1));
  const peaks = [];
  for (let i = 2; i < env.length - 2; i++) {
    const v = env[i]; if (v < mean + 0.4 * sd) continue;
    let ok = true; for (let j = -3; j <= 3; j++) if (j && env[i + j] > v) { ok = false; break; }
    if (ok) peaks.push({ t: Math.max(0, (i * hop) / sr - 0.005), v });
  }
  peaks.sort((a, b) => b.v - a.v);
  const chosen = [0];
  for (const p of peaks) { if (chosen.length >= count) break; if (chosen.every(c => Math.abs(c - p.t) > 0.09)) chosen.push(p.t); }
  chosen.sort((a, b) => a - b);
  while (chosen.length < count) { // split the widest gap
    let gi = 0, gw = 0; for (let i = 0; i < chosen.length; i++) { const e = i + 1 < chosen.length ? chosen[i + 1] : durSec; if (e - chosen[i] > gw) { gw = e - chosen[i]; gi = i; } }
    chosen.splice(gi + 1, 0, chosen[gi] + gw / 2);
  }
  return chosen;
}
/* WSOLA time-stretch: output length = ratio * input length, pitch unchanged. */
function stretchBuffer(buf, ratio) {
  if (Math.abs(ratio - 1) < 0.002) return buf;
  const sr = buf.sampleRate, N = 2048, H = N / 2, tol = Math.round(sr * 0.01);
  const C = buf.numberOfChannels, len = buf.length, outLen = Math.round(len * ratio);
  const ins = []; for (let c = 0; c < C; c++) ins.push(buf.getChannelData(c));
  const mono = monoOf(buf), w = hann(N);
  const outs = []; for (let c = 0; c < C; c++) outs.push(new Float32Array(outLen + N));
  const ws = new Float32Array(outLen + N);
  let prev = 0;
  for (let k = 0; ; k++) {
    const op = k * H; if (op >= outLen) break;
    const nominal = Math.round(op / ratio); if (nominal >= len) break;
    let best = nominal;
    if (k > 0) {
      const nat = prev + H; let bv = -Infinity;
      for (let d = -tol; d <= tol; d += 2) {
        const c = nominal + d; if (c < 0 || c + N > len) continue;
        let s = 0; for (let i = 0; i < H; i += 4) s += mono[nat + i] * mono[c + i];
        if (s > bv) { bv = s; best = c; }
      }
    }
    best = clamp(best, 0, Math.max(0, len - N));
    for (let c = 0; c < C; c++) { const o = outs[c], src = ins[c]; for (let i = 0; i < N; i++) o[op + i] += (src[best + i] || 0) * w[i]; }
    for (let i = 0; i < N; i++) ws[op + i] += w[i];
    prev = best;
  }
  const out = ctx.createBuffer(C, outLen, sr);
  for (let c = 0; c < C; c++) { const o = outs[c], d = out.getChannelData(c); for (let i = 0; i < outLen; i++) d[i] = ws[i] > 1e-3 ? o[i] / ws[i] : o[i]; }
  return out;
}
function peaksOf(buf, n = 900) {
  const x = monoOf(buf), out = new Float32Array(n), step = x.length / n;
  for (let i = 0; i < n; i++) { let m = 0; const a = Math.floor(i * step), b = Math.floor((i + 1) * step); for (let j = a; j < b; j++) { const v = Math.abs(x[j]); if (v > m) m = v; } out[i] = m; }
  return out;
}

/* ============ sample store ============ */
const SAMPLES = new Map(); // id -> {name, buf, bpm, key, peaks, bytes(base64)|null, demo}
function analyseSample(id) {
  const s = SAMPLES.get(id); const x = monoOf(s.buf), sr = s.buf.sampleRate;
  const env = onsetEnvelope(x);
  s.env = env; s.bpm = detectTempo(env, sr, 512, s.buf.duration); s.key = detectKey(x, sr); s.peaks = peaksOf(s.buf);
  return s;
}
async function demoLoop() {
  // A 2-bar electric-piano loop with soft percussion at 90 BPM, rendered on the spot.
  const sr = 44100, bpm = 90, beat = 60 / bpm, len = beat * 8;
  const oc = new OfflineAudioContext(2, Math.ceil(sr * len), sr);
  const bus = oc.createGain(); bus.gain.value = 0.55; bus.connect(oc.destination);
  const ep = (m, t, d, v) => {
    [1, 2, 3.01, 4.2].forEach((h, i) => {
      const o = oc.createOscillator(), g = oc.createGain(); o.frequency.value = mtof(m) * h; o.type = 'sine';
      const a = v * [0.5, 0.22, 0.08, 0.04][i];
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.006); g.gain.setTargetAtTime(a * 0.35, t + 0.01, 0.35 / (i + 1)); g.gain.setTargetAtTime(0, t + d, 0.12);
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + d + 1);
    });
  };
  const chords = [[57, 60, 64, 67, 71], [50, 53, 57, 60, 64], [53, 57, 60, 64, 67], [52, 55, 59, 62, 64]];
  chords.forEach((ch, i) => { const t = i * beat * 2; ch.forEach((m, j) => ep(m, t + j * 0.012, beat * 1.6, 0.18)); ep(ch[ch.length - 1] + 12, t + beat * 1.5, beat * 0.4, 0.1); ep(ch[0] - 12, t, beat * 1.8, 0.35); });
  const nb = oc.createBuffer(1, sr, sr); const nd = nb.getChannelData(0); for (let i = 0; i < sr; i++) nd[i] = Math.random() * 2 - 1;
  for (let b = 0; b < 8; b++) {
    const t = b * beat;
    if (b % 2 === 0) { const o = oc.createOscillator(), g = oc.createGain(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35); o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.4); }
    else { const s = oc.createBufferSource(), f = oc.createBiquadFilter(), g = oc.createGain(); s.buffer = nb; f.type = 'bandpass'; f.frequency.value = 1800; g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18); s.connect(f); f.connect(g); g.connect(bus); s.start(t); s.stop(t + 0.2); }
    for (const off of [0.5, 0.75]) { const s = oc.createBufferSource(), f = oc.createBiquadFilter(), g = oc.createGain(); s.buffer = nb; f.type = 'highpass'; f.frequency.value = 8000; const tt = t + off * beat; g.gain.setValueAtTime(0.12, tt); g.gain.exponentialRampToValueAtTime(0.001, tt + 0.05); s.connect(f); f.connect(g); g.connect(bus); s.start(tt); s.stop(tt + 0.06); }
  }
  const rendered = await oc.startRendering();
  const buf = ctx.createBuffer(2, rendered.length, sr);
  for (let c = 0; c < 2; c++) buf.copyToChannel(rendered.getChannelData(c), c);
  return buf;
}


/* Fine waveform overview for the arrangement: min/max per 256-sample block, per channel mix. */
const PEAK_BLOCK = 256;
function wavePeaks(buf) {
  const n = Math.ceil(buf.length / PEAK_BLOCK), mn = new Float32Array(n), mx = new Float32Array(n), C = buf.numberOfChannels;
  const chans = []; for (let c = 0; c < C; c++) chans.push(buf.getChannelData(c));
  for (let b = 0; b < n; b++) {
    let lo = 0, hi = 0; const a = b * PEAK_BLOCK, e = Math.min(buf.length, a + PEAK_BLOCK);
    for (let i = a; i < e; i++) { let v = 0; for (let c = 0; c < C; c++) v += chans[c][i]; v /= C; if (v < lo) lo = v; if (v > hi) hi = v; }
    mn[b] = lo; mx[b] = hi;
  }
  return { mn, mx, sr: buf.sampleRate };
}
/* Register a decoded buffer as a project sample and analyse it. */
function addSample(buf, name, extra = {}) {
  const id = extra.id || uid();
  SAMPLES.set(id, { name, buf, ...extra });
  analyseSample(id); SAMPLES.get(id).wave = wavePeaks(buf);
  return id;
}

/* Time-stretch off the main thread. Warped audio clips use this; until it lands they play repitched. */
const STRETCH_SRC = `
const hann=n=>{const w=new Float32Array(n);for(let i=0;i<n;i++)w[i]=0.5-0.5*Math.cos(2*Math.PI*i/(n-1));return w;};
onmessage=e=>{ const {id,chans,sr,ratio}=e.data; const N=2048,H=N/2,tol=Math.round(sr*0.01),len=chans[0].length,outLen=Math.round(len*ratio),C=chans.length;
  const mono=new Float32Array(len); for(const ch of chans) for(let i=0;i<len;i++) mono[i]+=ch[i]/C;
  const w=hann(N), outs=chans.map(()=>new Float32Array(outLen+N)), ws=new Float32Array(outLen+N); let prev=0;
  for(let k=0;;k++){ const op=k*H; if(op>=outLen) break; const nominal=Math.round(op/ratio); if(nominal>=len) break; let best=nominal;
    if(k>0){ const nat=prev+H; let bv=-Infinity; for(let d=-tol;d<=tol;d+=2){ const c=nominal+d; if(c<0||c+N>len) continue; let s=0; for(let i=0;i<H;i+=4) s+=mono[nat+i]*mono[c+i]; if(s>bv){bv=s;best=c;} } }
    best=Math.max(0,Math.min(best,Math.max(0,len-N)));
    for(let c=0;c<C;c++){ const o=outs[c],src=chans[c]; for(let i=0;i<N;i++) o[op+i]+=(src[best+i]||0)*w[i]; }
    for(let i=0;i<N;i++) ws[op+i]+=w[i]; prev=best; }
  const res=outs.map(o=>{ const d=new Float32Array(outLen); for(let i=0;i<outLen;i++) d[i]=ws[i]>1e-3?o[i]/ws[i]:o[i]; return d; });
  postMessage({id,res},res.map(r=>r.buffer)); };`;
let STRETCH_W = null; const STRETCH_JOBS = new Map(); const WARP_CACHE = new Map();
function stretchWorker() {
  if (STRETCH_W) return STRETCH_W;
  try { STRETCH_W = new Worker(URL.createObjectURL(new Blob([STRETCH_SRC], { type: 'application/javascript' }))); }
  catch (e) { STRETCH_W = { postMessage(m) { const b = SAMPLES.get(m.sid).buf; const r = stretchBuffer(b, m.ratio); setTimeout(() => STRETCH_W.onmessage({ data: { id: m.id, res: Array.from({ length: r.numberOfChannels }, (_, c) => r.getChannelData(c)) } }), 0); } }; }
  STRETCH_W.onmessage = e => { const j = STRETCH_JOBS.get(e.data.id); if (!j) return; STRETCH_JOBS.delete(e.data.id); const r = e.data.res; const b = LIVE_CTX.createBuffer(r.length, r[0].length, j.sr); r.forEach((d, c) => b.copyToChannel(d, c)); WARP_CACHE.set(j.key, b); j.resolve(b); if (typeof onWarpReady === 'function') onWarpReady(); };
  return STRETCH_W;
}
function warpKey(sid, ratio) { return sid + '|' + ratio.toFixed(4); }
function getWarped(sid, ratio) { // returns buffer or null (and starts a job)
  if (Math.abs(ratio - 1) < 0.002) return SAMPLES.get(sid).buf;
  const k = warpKey(sid, ratio); const hit = WARP_CACHE.get(k); if (hit) return hit;
  if (![...STRETCH_JOBS.values()].some(j => j.key === k)) requestWarp(sid, ratio);
  return null;
}
function requestWarp(sid, ratio) {
  const k = warpKey(sid, ratio); if (WARP_CACHE.has(k)) return Promise.resolve(WARP_CACHE.get(k));
  for (const j of STRETCH_JOBS.values()) if (j.key === k) return j.p;
  const s = SAMPLES.get(sid); const id = uid(); let resolve; const p = new Promise(r => (resolve = r));
  STRETCH_JOBS.set(id, { key: k, sr: s.buf.sampleRate, resolve, p });
  const chans = Array.from({ length: s.buf.numberOfChannels }, (_, c) => s.buf.getChannelData(c).slice());
  stretchWorker().postMessage({ id, sid, chans, sr: s.buf.sampleRate, ratio }, chans.map(c => c.buffer));
  return p;
}
