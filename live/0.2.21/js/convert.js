/* ============ Convert audio to MIDI, and stem separation ============ */
// song position of a source second in a clip (works for warped, unwarped and marked clips)
function clipPosOfSec(c, sec) { let lo = c.offset - 4096, hi = c.offset + c.len + 4096; for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (srcSecAt(c, m) < sec) lo = m; else hi = m; } return c.start + (lo + hi) / 2 - c.offset; }
function clipSecRange(c) { return [Math.max(0, srcSecAt(c, c.offset)), srcSecAt(c, c.offset + c.len)]; }
function newConvertedTrack(c, kind, notes, name) {
  const src = trackOf(c), t = newTrack('midi', kind, name); S.tracks.splice(S.tracks.indexOf(src) + 1, 0, t); buildBus(t, 'track'); routeOut(t);
  const len = Math.max(SPB(), Math.ceil(c.len / BEAT()) * BEAT()), mc = newMidiClip(c.start, len, name); mc.bars = len / 16;
  mc.notes = notes.filter(n => n.s >= -1e-6 && n.s < len).map(n => ({ c: 1, ...n, l: Math.max(0.25, Math.min(n.l, len - n.s)) })).sort((a, b) => a.s - b.s); t.clips.push(mc);
  V.selTracks = new Set([t.id]); V.selClips = new Set([mc.id]); V.editClip = mc.id; ui.all(); return mc;
}
// Drums: each transient becomes a kick, snare or hi-hat by where its energy sits.
function audioToDrums(c) {
  const s = SAMPLES.get(c.sampleId); if (!s) return; const x = monoOf(s.buf), sr = s.buf.sampleRate, [a, b] = clipSecRange(c), N = 2048, re = new Float32Array(N), im = new Float32Array(N), w = hann(N);
  const hits = transientsOf(c.sampleId).filter(t => t >= a && t < b); if (!hits.length) return toast('No hits found in that clip');
  let peakMax = 0; const info = hits.map(t => { const i0 = Math.floor(t * sr); let lo = 0, mid = 0, hiE = 0, pk = 0;
    for (let i = 0; i < N; i++) { const v = x[i0 + i] || 0; re[i] = v * w[i]; im[i] = 0; pk = Math.max(pk, Math.abs(v)); } fft(re, im);
    for (let k = 1; k < N / 2; k++) { const f = k * sr / N, e = re[k] * re[k] + im[k] * im[k]; if (f < 150) lo += e; else if (f < 5000) mid += e; else hiE += e; }
    peakMax = Math.max(peakMax, pk); const tot = lo + mid + hiE + 1e-12; return { t, pk, kind: lo / tot > 0.45 ? 'kick' : hiE / tot > 0.3 ? 'hat' : 'snare' }; });
  const pad = { kick: GM_PAD(36), snare: GM_PAD(38), hat: GM_PAD(42) };
  const notes = info.map(h => ({ p: pad[h.kind], s: Math.round((clipPosOfSec(c, h.t) - c.start) * 4) / 4, l: 1, v: clamp(0.35 + 0.65 * h.pk / (peakMax || 1), 0.1, 1) }));
  newConvertedTrack(c, 'drums', notes, c.name + ' drums'); toast(`Converted ${notes.length} hits to a drum track`);
}
// Melody: YIN pitch tracking at 11 kHz, then notes where the pitch holds steady.
function yinTrack(x, sr, a, b) {
  const ds = Math.max(1, Math.round(sr / 11025)), fs = sr / ds, W = 512, hop = 128, tauMax = Math.floor(fs / 60), tauMin = Math.floor(fs / 1200), out = [];
  const y = new Float32Array(Math.floor((b - a) * fs)); for (let i = 0; i < y.length; i++) { let s = 0; for (let k = 0; k < ds; k++) s += x[Math.floor(a * sr) + i * ds + k] || 0; y[i] = s / ds; }
  const d = new Float32Array(tauMax + 1);
  for (let f = 0; f + W + tauMax < y.length; f += hop) {
    let rms = 0; for (let i = 0; i < W; i++) rms += y[f + i] * y[f + i]; rms = Math.sqrt(rms / W);
    d[0] = 1; let run = 0, best = -1;
    for (let tau = 1; tau <= tauMax; tau++) { let s = 0; for (let i = 0; i < W; i++) { const q = y[f + i] - y[f + i + tau]; s += q * q; } run += s; d[tau] = run ? s * tau / run : 1; }
    for (let tau = tauMin; tau < tauMax; tau++) if (d[tau] < 0.15) { while (tau + 1 < tauMax && d[tau + 1] < d[tau]) tau++; best = tau; break; }
    let tf = best; if (best > 0 && best < tauMax) { const s0 = d[best - 1], s1 = d[best], s2 = d[best + 1]; tf = best + (s2 - s0) / (2 * (2 * s1 - s2 - s0) || 1); }
    out.push({ t: a + (f + W / 2) / fs, midi: best > 0 && rms > 0.01 ? 69 + 12 * Math.log2(fs / tf / 440) : null, rms });
  }
  return out;
}
function audioToMelody(c) {
  const s = SAMPLES.get(c.sampleId); if (!s) return; const [a, b] = clipSecRange(c), fr = yinTrack(monoOf(s.buf), s.buf.sampleRate, a, b); if (!fr.length) return toast('That clip is too short');
  const med = fr.map((f, i) => { const w = fr.slice(Math.max(0, i - 2), i + 3).map(q => q.midi).filter(v => v != null).sort((x, y) => x - y); return w.length >= 3 ? Math.round(w[w.length >> 1]) : null; });
  const notes = [], rmsMax = Math.max(...fr.map(f => f.rms)); let cur = null;
  const close = i => { if (cur && fr[i - 1].t - cur.t0 >= 0.07) { const s0 = clipPosOfSec(c, cur.t0) - c.start, s1 = clipPosOfSec(c, fr[i - 1].t) - c.start; notes.push({ p: cur.p, s: Math.round(s0 * 4) / 4, l: Math.max(0.25, Math.round((s1 - s0) * 4) / 4), v: clamp(0.3 + 0.7 * cur.r / (rmsMax || 1), 0.1, 1) }); } cur = null; };
  med.forEach((m, i) => { if (m == null) { close(i); return; } if (cur && cur.p === m) { cur.r = Math.max(cur.r, fr[i].rms); return; } close(i); cur = { p: m, t0: fr[i].t, r: fr[i].rms }; }); close(med.length);
  if (!notes.length) return toast('No clear melody found in that clip');
  newConvertedTrack(c, 'synth', notes, c.name + ' melody'); toast(`Converted to ${notes.length} melody notes`);
}
// Harmony: the strongest pitch classes in each beat become a chord, with the lowest strong note as the bass.
function audioToHarmony(c) {
  const s = SAMPLES.get(c.sampleId); if (!s) return; const x = monoOf(s.buf), sr = s.buf.sampleRate, N = 8192, w = hann(N), re = new Float32Array(N), im = new Float32Array(N), notes = [];
  let prev = '';
  for (let p = c.start; p < c.start + c.len - 0.01; p += BEAT()) {
    const sec = srcSecAt(c, p - c.start + c.offset), i0 = Math.floor(sec * sr); if (i0 < 0 || i0 >= x.length) continue;
    const chroma = new Float64Array(12), bass = new Float64Array(12);
    for (let i = 0; i < N; i++) { re[i] = (x[i0 + i] || 0) * w[i]; im[i] = 0; } fft(re, im);
    for (let k = 2; k < N / 2; k++) { const f = k * sr / N; if (f < 50 || f > 2500) continue; const m = Math.hypot(re[k], im[k]), pc = ((Math.round(69 + 12 * Math.log2(f / 440)) % 12) + 12) % 12; chroma[pc] += m; if (f < 260) bass[pc] += m; }
    const mx = Math.max(...chroma); if (mx < 1e-3) continue; const pcs = [...chroma.keys()].filter(k => chroma[k] > mx * 0.45).sort((a, b) => chroma[b] - chroma[a]).slice(0, 4).sort((a, b) => a - b);
    const bp = [...bass.keys()].sort((a, b) => bass[b] - bass[a])[0], key = pcs.join(',') + '|' + bp;
    if (key === prev && notes.length) { notes.filter(n => n.s === notes[notes.length - 1].s).forEach(n => (n.l += BEAT())); continue; } prev = key;
    const st = Math.round((p - c.start) * 4) / 4; pcs.forEach(pc => notes.push({ p: 60 + pc, s: st, l: BEAT(), v: 0.7 })); if (bass[bp] > 0) notes.push({ p: 36 + bp, s: st, l: BEAT(), v: 0.8 });
  }
  if (!notes.length) return toast('No chords found in that clip');
  newConvertedTrack(c, 'synth', notes, c.name + ' harmony'); toast('Converted to chords');
}

/* ---------- stem separation: harmonic/percussive split plus a centre and low-end split ----------
   Runs in a worker, chunk by chunk. It's signal processing, not a trained model: good for a quick drum or bass pull,
   not studio-clean vocals. */
const STEM_WORKER = `
function fft(re, im, inv) { const n = re.length; for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) { const a = (inv ? 2 : -2) * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a); for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let j = 0; j < len / 2; j++) { const ur = re[i + j], ui = im[i + j], vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci, vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr; re[i + j] = ur + vr; im[i + j] = ui + vi; re[i + j + len / 2] = ur - vr; im[i + j + len / 2] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } } }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; } }
const med = (a, n) => { for (let i = 1; i < n; i++) { const v = a[i]; let j = i - 1; while (j >= 0 && a[j] > v) { a[j + 1] = a[j]; j--; } a[j + 1] = v; } return a[n >> 1]; };
onmessage = e => {
  const { L, R, sr } = e.data, N = 2048, H = 512, B = N / 2 + 1, K = 4, len = L.length, F = Math.ceil(len / H) + 4, w = new Float32Array(N); for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  const outs = ['drums', 'bass', 'vocals', 'other'].map(() => [new Float32Array(len), new Float32Array(len)]), norm = new Float32Array(len);
  const CH = 256;
  for (let f0 = 0; f0 < F; f0 += CH) {
    const fa = Math.max(0, f0 - K), fb = Math.min(F, f0 + CH + K), n = fb - fa, spec = [L, R].map(x => { const r = new Float32Array(n * B), m = new Float32Array(n * B), re = new Float32Array(N), im = new Float32Array(N);
      for (let f = 0; f < n; f++) { const s = (fa + f) * H - N / 2; for (let i = 0; i < N; i++) { const j = s + i; re[i] = j >= 0 && j < len ? x[j] * w[i] : 0; im[i] = 0; } fft(re, im); for (let k = 0; k < B; k++) { r[f * B + k] = re[k]; m[f * B + k] = im[k]; } } return { r, m }; });
    const mag = new Float32Array(n * B), ml = new Float32Array(n * B), mr = new Float32Array(n * B); for (let i = 0; i < n * B; i++) { ml[i] = Math.hypot(spec[0].r[i], spec[0].m[i]); mr[i] = Math.hypot(spec[1].r[i], spec[1].m[i]); mag[i] = (ml[i] + mr[i]) / 2; }
    const tmp = new Float32Array(2 * K + 1), re = new Float32Array(N), im = new Float32Array(N);
    for (let f = Math.max(0, f0 - fa); f < Math.min(n, f0 + CH - fa); f++) {
      const masks = [new Float32Array(B), new Float32Array(B), new Float32Array(B), new Float32Array(B)];
      for (let k = 0; k < B; k++) {
        let c = 0; for (let d = -K; d <= K; d++) tmp[c++] = mag[clampI(f + d, 0, n - 1) * B + k]; const Hm = med(tmp, c);
        c = 0; for (let d = -K; d <= K; d++) tmp[c++] = mag[f * B + clampI(k + d, 0, B - 1)]; const Pm = med(tmp, c);
        const mp = Pm * Pm / (Hm * Hm + Pm * Pm + 1e-12), mh = 1 - mp, hz = k * sr / N, lowW = hz < 120 ? 1 : hz < 220 ? (220 - hz) / 100 : 0;
        const ctr = 1 - Math.abs(ml[f * B + k] - mr[f * B + k]) / (ml[f * B + k] + mr[f * B + k] + 1e-9), band = hz > 180 && hz < 8000 ? 1 : 0, vw = band * Math.pow(ctr, 6) * (1 - lowW);
        masks[0][k] = mp; masks[1][k] = mh * lowW; masks[2][k] = mh * vw; masks[3][k] = mh * (1 - lowW) * (1 - vw);
      }
      const s = (fa + f) * H - N / 2;
      masks.forEach((mk, si) => [0, 1].forEach(ch => { const sp = spec[ch]; for (let k = 0; k < B; k++) { re[k] = sp.r[f * B + k] * mk[k]; im[k] = sp.m[f * B + k] * mk[k]; if (k > 0 && k < N / 2) { re[N - k] = re[k]; im[N - k] = -im[k]; } } fft(re, im, true); const o = outs[si][ch]; for (let i = 0; i < N; i++) { const j = s + i; if (j >= 0 && j < len) o[j] += re[i] * w[i]; } }));
      for (let i = 0; i < N; i++) { const j = s + i; if (j >= 0 && j < len) norm[j] += w[i] * w[i]; }
    }
    postMessage({ progress: Math.min(1, (f0 + CH) / F) });
  }
  for (let i = 0; i < len; i++) { const g = norm[i] > 1e-6 ? 1 / norm[i] : 0; outs.forEach(o => { o[0][i] *= g; o[1][i] *= g; }); }
  postMessage({ done: true, outs }, outs.flat().map(a => a.buffer));
};
function clampI(v, a, b) { return v < a ? a : v > b ? b : v; }`;
async function separateStems(c) {
  const s = SAMPLES.get(c.sampleId); if (!s || T.busy) return; const buf = s.buf, L = buf.getChannelData(0).slice(), R = (buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0)).slice();
  showBusy('Separating stems… 0%'); T.busy = true;
  try {
    const outs = await new Promise((res, rej) => { const wk = new Worker(URL.createObjectURL(new Blob([STEM_WORKER], { type: 'application/javascript' }))); wk.onmessage = e => { if (e.data.progress != null) showBusy(`Separating stems… ${Math.round(e.data.progress * 100)}%`); if (e.data.done) { wk.terminate(); res(e.data.outs); } }; wk.onerror = err => { wk.terminate(); rej(err); }; wk.postMessage({ L, R, sr: buf.sampleRate }, [L.buffer, R.buffer]); });
    T.busy = false; pushUndo('Separate stems'); const src = trackOf(c), names = ['Drums', 'Bass', 'Vocals', 'Other'];
    let at = S.tracks.indexOf(src) + 1;
    outs.forEach(([l, r], i) => { const b = LIVE_CTX.createBuffer(2, l.length, buf.sampleRate); b.copyToChannel(l, 0); b.copyToChannel(r, 1); const sid = addSample(b, `${s.name} (${names[i]})`, { recorded: true, path: null });
      const t = newTrack('audio'); t.name = `${c.name} ${names[i]}`; t.color = src.color; t.group = src.group; const k = { ...deep(c), id: uid(), sampleId: sid, name: `${c.name} ${names[i]}` }; t.clips = [k]; S.tracks.splice(at++, 0, t); buildBus(t, 'track'); routeOut(t); });
    src.mute = true; applyMix(src); ui.all(); toast(`Split into 4 stems (drums, bass, vocals, other). ${src.name} is switched off.`, 6000);
  } catch (e) { console.error(e); toast('Stem separation failed: ' + (e.message || e)); } finally { T.busy = false; showBusy(null); }
}
function convertMenu(c) {
  return [{ label: 'Convert drums to new MIDI track', run: () => audioToDrums(c) }, { label: 'Convert melody to new MIDI track', run: () => audioToMelody(c) }, { label: 'Convert harmony to new MIDI track', run: () => audioToHarmony(c) }, { label: 'Separate into stems (drums, bass, vocals, other)', run: () => separateStems(c) }];
}
