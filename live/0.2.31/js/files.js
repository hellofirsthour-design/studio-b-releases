/* ============ Export formats, MIDI files, consolidate, bounce selection, templates ============ */

/* ---------- audio encoders ---------- */
// Applies normalize, dither (TPDF, for 16 and 24-bit) and loop folding to a rendered buffer. Returns a buffer-like object.
function prepRender(buf, { normalize, dither, bits, loopLen } = {}) {
  const C = buf.numberOfChannels, sr = buf.sampleRate, n = loopLen ? Math.min(buf.length, loopLen) : buf.length, chans = [];
  for (let c = 0; c < C; c++) {
    const src = buf.getChannelData(c), d = new Float32Array(n); d.set(src.subarray(0, n));
    if (loopLen) for (let i = n; i < src.length; i++) d[(i - n) % n] += src[i]; // the tail wraps round to the start, so the file loops seamlessly
    chans.push(d);
  }
  let peak = 0; if (normalize) chans.forEach(d => { for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i])); });
  const g = normalize && peak > 0 ? 0.989 / peak : 1;
  const lsb = dither && bits < 32 ? 1 / Math.pow(2, bits - 1) : 0;
  chans.forEach(d => { for (let i = 0; i < n; i++) d[i] = d[i] * g + (lsb ? (Math.random() - Math.random()) * lsb : 0); });
  return { numberOfChannels: C, sampleRate: sr, length: n, duration: n / sr, getChannelData: c => chans[c] };
}
const toInt = (x, bits) => { const m = Math.pow(2, bits - 1); return Math.max(-m, Math.min(m - 1, Math.round(clamp(x, -1, 1) * (m - 1)))); };

function encodeAiff(b, bits) {
  bits = bits === 16 ? 16 : 24; const C = b.numberOfChannels, n = b.length, bps = bits / 8, dataLen = n * C * bps;
  const out = new ArrayBuffer(54 + dataLen), v = new DataView(out), W = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  W(0, 'FORM'); v.setUint32(4, 46 + dataLen); W(8, 'AIFF'); W(12, 'COMM'); v.setUint32(16, 18); v.setUint16(20, C); v.setUint32(22, n); v.setUint16(26, bits);
  // sample rate as an 80-bit IEEE extended float
  const sr = b.sampleRate, e = Math.floor(Math.log2(sr)); v.setUint16(28, 16383 + e); const mant = sr / Math.pow(2, e - 63); v.setUint32(30, Math.floor(mant / 4294967296)); v.setUint32(34, mant % 4294967296);
  W(38, 'SSND'); v.setUint32(42, 8 + dataLen); v.setUint32(46, 0); v.setUint32(50, 0);
  const ch = [...Array(C)].map((_, c) => b.getChannelData(c)); let o = 54;
  for (let i = 0; i < n; i++) for (let c = 0; c < C; c++) { const s = toInt(ch[c][i], bits); if (bits === 16) { v.setInt16(o, s); o += 2; } else { v.setUint8(o, (s >> 16) & 255); v.setUint8(o + 1, (s >> 8) & 255); v.setUint8(o + 2, s & 255); o += 3; } }
  return out;
}

/* FLAC: fixed linear predictors (orders 0-4, best per channel per block) with Rice-coded residuals. Lossless, about half the size of WAV. */
function encodeFlac(b, bits) {
  bits = bits === 16 ? 16 : 24; const C = b.numberOfChannels, n = b.length, sr = b.sampleRate, BS = 4096;
  const ch = [...Array(C)].map((_, c) => { const d = b.getChannelData(c), o = new Int32Array(n); for (let i = 0; i < n; i++) o[i] = toInt(d[i], bits); return o; });
  let bytes = new Uint8Array(1 << 20), len = 0, acc = 0, nacc = 0;
  const grow = need => { if (len + need <= bytes.length) return; let m = bytes.length * 2; while (m < len + need) m *= 2; const nb = new Uint8Array(m); nb.set(bytes); bytes = nb; };
  const put = (val, nb) => { // writes nb (<=32) bits of val, most significant first
    for (let k = nb - 1; k >= 0; k--) { acc = (acc << 1) | ((val >>> k) & 1); if (++nacc === 8) { grow(1); bytes[len++] = acc & 255; acc = 0; nacc = 0; } }
  };
  const zeros = q => { while (q > 0) { if (nacc === 0 && q >= 8) { grow(1); bytes[len++] = 0; q -= 8; } else { put(0, 1); q--; } } };
  const align = () => { if (nacc) put(0, 8 - nacc); };
  const crc8 = (a, z) => { let c = 0; for (let i = a; i < z; i++) { c ^= bytes[i]; for (let k = 0; k < 8; k++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 255 : (c << 1) & 255; } return c; };
  const crc16 = (a, z) => { let c = 0; for (let i = a; i < z; i++) { c ^= bytes[i] << 8; for (let k = 0; k < 8; k++) c = c & 0x8000 ? ((c << 1) ^ 0x8005) & 0xffff : (c << 1) & 0xffff; } return c; };
  // header + STREAMINFO
  [0x66, 0x4c, 0x61, 0x43].forEach(x => put(x, 8)); put(1, 1); put(0, 7); put(34, 24);
  put(BS, 16); put(BS, 16); put(0, 24); put(0, 24); put(sr, 20); put(C - 1, 3); put(bits - 1, 5); put(Math.floor(n / 4294967296), 4); put(n >>> 0, 32); for (let i = 0; i < 16; i++) put(0, 8);
  const res = new Int32Array(BS);
  for (let f = 0, start = 0; start < n; f++, start += BS) {
    const bs = Math.min(BS, n - start), f0 = len;
    put(0xfff8, 16); put(7, 4); put(0, 4); put(C - 1, 4); put(0, 3); put(0, 1);
    if (f < 0x80) put(f, 8); else if (f < 0x800) { put(0xc0 | (f >> 6), 8); put(0x80 | (f & 63), 8); } else if (f < 0x10000) { put(0xe0 | (f >> 12), 8); put(0x80 | ((f >> 6) & 63), 8); put(0x80 | (f & 63), 8); } else { put(0xf0 | (f >> 18), 8); put(0x80 | ((f >> 12) & 63), 8); put(0x80 | ((f >> 6) & 63), 8); put(0x80 | (f & 63), 8); }
    put(bs - 1, 16); put(crc8(f0, len), 8);
    for (let c = 0; c < C; c++) {
      const x = ch[c].subarray(start, start + bs); let best = 0, bestSum = Infinity;
      for (let o = 0; o <= Math.min(4, bs - 1); o++) { let s = 0; for (let i = o; i < bs; i++) s += Math.abs(pred(x, i, o)); if (s < bestSum) { bestSum = s; best = o; } }
      const o = best; put(0, 1); put(8 | o, 6); put(0, 1);
      for (let i = 0; i < o; i++) put(x[i] & ((1 << bits) - 1), bits);
      let sum = 0; for (let i = o; i < bs; i++) { const r = pred(x, i, o); res[i] = r; sum += r >= 0 ? 2 * r : -2 * r - 1; }
      const cnt = bs - o, mean = cnt ? sum / cnt : 0; let k = 0; while (k < 30 && Math.pow(2, k + 1) <= mean) k++;
      put(1, 2); put(0, 4); put(k, 5); // RICE2, one partition
      const mask = (1 << k) - 1; for (let i = o; i < bs; i++) { const r = res[i], u = r >= 0 ? 2 * r : -2 * r - 1; zeros(u >>> k); put(1, 1); if (k) put(u & mask, k); }
    }
    align(); const c16 = crc16(f0, len); put(c16, 16);
  }
  align(); return bytes.slice(0, len).buffer;
}
function pred(x, i, o) {
  if (o === 0) return x[i];
  if (o === 1) return x[i] - x[i - 1];
  if (o === 2) return x[i] - 2 * x[i - 1] + x[i - 2];
  if (o === 3) return x[i] - 3 * x[i - 1] + 3 * x[i - 2] - x[i - 3];
  return x[i] - 4 * x[i - 1] + 6 * x[i - 2] - 4 * x[i - 3] + x[i - 4];
}

let _lame = null;
function loadLame() {
  if (window.lamejs) return Promise.resolve(window.lamejs);
  return _lame || (_lame = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'vendor/lamejs/lame.min.js'; s.onload = () => res(window.lamejs); s.onerror = () => rej(new Error('The MP3 encoder could not be loaded')); document.head.appendChild(s); }));
}
async function encodeMp3(b, kbps = 320) {
  const L = await loadLame(), C = Math.min(2, b.numberOfChannels), enc = new L.Mp3Encoder(C, b.sampleRate, kbps), parts = [];
  const i16 = d => { const o = new Int16Array(d.length); for (let i = 0; i < d.length; i++) o[i] = toInt(d[i], 16); return o; };
  const l = i16(b.getChannelData(0)), r = C > 1 ? i16(b.getChannelData(1)) : null;
  for (let i = 0; i < l.length; i += 1152) { const m = r ? enc.encodeBuffer(l.subarray(i, i + 1152), r.subarray(i, i + 1152)) : enc.encodeBuffer(l.subarray(i, i + 1152)); if (m.length) parts.push(new Uint8Array(m)); }
  const end = enc.flush(); if (end.length) parts.push(new Uint8Array(end));
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0)); let o = 0; parts.forEach(p => { out.set(p, o); o += p.length; }); return out.buffer;
}
const EXPORT_FORMATS = { wav: 'WAV', aiff: 'AIFF', flac: 'FLAC', mp3: 'MP3' };
// opts: { format, bits, normalize, dither, kbps, loopLen (samples) } -> { ext, data }
async function encodeAudio(buf, o) {
  const fmt = o.format || 'wav', b = prepRender(buf, { normalize: o.normalize, dither: o.dither && fmt !== 'mp3', bits: fmt === 'mp3' ? 16 : o.bits, loopLen: o.loopLen });
  if (fmt === 'aiff') return { ext: 'aif', data: encodeAiff(b, o.bits) };
  if (fmt === 'flac') return { ext: 'flac', data: encodeFlac(b, o.bits) };
  if (fmt === 'mp3') return { ext: 'mp3', data: await encodeMp3(b, o.kbps || 320) };
  return { ext: 'wav', data: encodeWav(b, o.bits, false) };
}
// Render settings for a format: MP3 only takes 32, 44.1 or 48 kHz.
const exportSr = o => (o.format === 'mp3' && o.sr > 48000 ? 44100 : o.sr);
const loopSamples = (a, b, sr) => Math.round((songSec(b) - songSec(a)) * sr);

/* ---------- MIDI files (Standard MIDI File, type 1, 96 ticks per quarter) ---------- */
const PPQ = 96, TPS = PPQ / 4; // ticks per step
function vlq(n) { const out = [n & 127]; while ((n >>= 7)) out.unshift((n & 127) | 128); return out; }
function smfTrack(events) { // events: [{t, d:[bytes]}]
  events.sort((a, b) => a.t - b.t || (a.o || 0) - (b.o || 0)); const out = []; let last = 0;
  events.forEach(e => { out.push(...vlq(Math.max(0, Math.round(e.t - last))), ...e.d); last = Math.max(last, Math.round(e.t)); });
  out.push(0, 0xff, 0x2f, 0); const L = out.length; return [0x4d, 0x54, 0x72, 0x6b, (L >>> 24) & 255, (L >> 16) & 255, (L >> 8) & 255, L & 255, ...out];
}
const metaText = (type, s) => { const b = [...new TextEncoder().encode(s || '')]; return [0xff, type, ...vlq(b.length), ...b]; };
// tracks: [{ name, notes:[{p,s,l,v}], channel }] with s in steps from `from`
function writeMidi(tracks, from = 0) {
  const tempo = [{ t: 0, d: metaText(3, S.name || 'Studio B') }, { t: 0, d: [0xff, 0x58, 4, SIG()[0], Math.round(Math.log2(SIG()[1])), 24, 8] }];
  tempoMap().forEach(s => { if (s.p + 1e-9 < from && s !== tempoMap()[0]) return; const us = Math.round(60e6 / s.bpm); tempo.push({ t: Math.max(0, s.p - from) * TPS, d: [0xff, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255] }); });
  const chunks = [smfTrack(tempo)];
  tracks.forEach(tr => {
    const ch = (tr.channel || 0) & 15, ev = [{ t: 0, d: metaText(3, tr.name) }];
    tr.notes.forEach(n => { const p = clamp(Math.round(n.p), 0, 127); ev.push({ t: n.s * TPS, o: 1, d: [0x90 | ch, p, clamp(Math.round((n.v == null ? 0.8 : n.v) * 127), 1, 127)] }, { t: (n.s + Math.max(0.05, n.l)) * TPS, o: 0, d: [0x80 | ch, p, clamp(Math.round((n.rv == null ? 0.5 : n.rv) * 127), 0, 127)] }); });
    chunks.push(smfTrack(ev));
  });
  const hdr = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, chunks.length, (PPQ >> 8) & 255, PPQ & 255];
  return new Uint8Array([...hdr, ...chunks.flat()]).buffer;
}
function readMidi(data) {
  const u = new Uint8Array(data); let i = 0; const s4 = () => String.fromCharCode(u[i], u[i + 1], u[i + 2], u[i + 3]), r32 = () => ((u[i++] << 24) | (u[i++] << 16) | (u[i++] << 8) | u[i++]) >>> 0, r16 = () => (u[i++] << 8) | u[i++];
  const rv = () => { let n = 0, b; do { b = u[i++]; n = (n << 7) | (b & 127); } while (b & 128 && i < u.length); return n; };
  if (s4() !== 'MThd') throw new Error('This is not a MIDI file.'); i += 4; const hl = r32(), fmt = r16(), ntr = r16(), div = r16(); i = 8 + hl;
  if (div & 0x8000) throw new Error('SMPTE-timed MIDI files are not supported.');
  const out = { ppq: div, tracks: [], tempos: [], sig: null, fmt };
  for (let k = 0; k < ntr && i < u.length; k++) {
    while (i < u.length && s4() !== 'MTrk') { i += 4; const l = r32(); i += l; }
    if (i >= u.length) break; i += 4; const L = r32(), end = i + L; let t = 0, run = 0; const tr = { name: '', notes: [], channel: null }, on = new Map();
    while (i < end) {
      t += rv(); let st = u[i]; if (st & 0x80) i++; else st = run;
      if (st === 0xff) { const type = u[i++], l = rv(), d = u.subarray(i, i + l); i += l;
        if (type === 3 && !tr.name) tr.name = new TextDecoder().decode(d); if (type === 0x51) out.tempos.push({ t, bpm: 60e6 / ((d[0] << 16) | (d[1] << 8) | d[2]) }); if (type === 0x58 && !out.sig) out.sig = [d[0], Math.pow(2, d[1])]; if (type === 0x2f) { i = end; break; } continue; }
      if (st === 0xf0 || st === 0xf7) { i += rv(); continue; }
      run = st; const hi = st & 0xf0, ch = st & 15, a = u[i++], b = hi === 0xc0 || hi === 0xd0 ? 0 : u[i++];
      if (hi === 0x90 && b > 0) { const key = ch * 128 + a; if (!on.has(key)) on.set(key, []); on.get(key).push({ t, v: b }); if (tr.channel == null) tr.channel = ch; }
      else if (hi === 0x80 || (hi === 0x90 && b === 0)) { const q = on.get(ch * 128 + a); if (q && q.length) { const n = q.shift(); tr.notes.push({ p: a, t0: n.t, t1: t, v: n.v / 127, rv: hi === 0x80 ? b / 127 : 0.5 }); } }
    }
    i = end; on.forEach((q, key) => q.forEach(n => tr.notes.push({ p: key % 128, t0: n.t, t1: t, v: n.v / 127 })));
    tr.notes.forEach(n => { n.s = n.t0 * 4 / div; n.l = Math.max(0.05, (n.t1 - n.t0) * 4 / div); delete n.t0; delete n.t1; });
    out.tracks.push(tr);
  }
  return out;
}
// Import a .mid file: one track with notes onto a selected MIDI track becomes a clip there; otherwise each part gets its own MIDI track.
async function importMidiFile(f, at = V.insert, onto = null) {
  let m; try { m = readMidi(f.data); } catch (e) { return toast(e.message); }
  const parts = m.tracks.filter(t => t.notes.length); if (!parts.length) return toast('That MIDI file has no notes');
  pushUndo('Import MIDI'); const made = [], base = (f.name || 'MIDI').replace(/\.midi?$/i, '');
  const empty = !S.tracks.some(t => t.clips.length);
  if (empty && m.tempos.length) { const bpm = Math.round(m.tempos[0].bpm * 100) / 100; S.bpm = bpm; setBpm(bpm); }
  if (empty && m.sig && m.sig[0] && m.sig[1]) S.sig = m.sig;
  parts.forEach((p, k) => {
    const end = Math.max(...p.notes.map(n => n.s + n.l)), len = Math.max(SPB(), Math.ceil(end / SPB()) * SPB());
    let t = parts.length === 1 && onto && onto.kind === 'midi' ? onto : null;
    if (!t) { t = newTrack('midi', p.channel === 9 ? 'drums' : 'synth', p.name || (parts.length > 1 ? `${base} ${k + 1}` : base)); S.tracks.push(t); buildBus(t, 'track'); }
    const c = newMidiClip(at, len, p.name || base); c.bars = len / 16; c.notes = p.notes.map(n => ({ p: n.p, s: n.s, l: n.l, v: clamp(n.v, 0.01, 1), rv: n.rv, c: 1 }));
    clearRange(t, at, at + len); t.clips.push(c); made.push(c);
  });
  V.selClips = new Set(made.map(c => c.id)); if (made.length === 1) openClip(made[0]); ui.all();
  toast(`Imported ${made.reduce((s, c) => s + c.notes.length, 0)} notes on ${made.length} track${made.length > 1 ? 's' : ''}`);
}
async function importMidiDialog() { const [f] = await pickFile('midi', '.mid,.midi'); if (f) importMidiFile(f, V.insert, S.tracks.find(t => V.selTracks.has(t.id))); }
async function exportMidiClip(c) {
  c = c || selectedClips().map(x => x.c).find(x => x.type === 'midi') || (V.editClip && S.tracks.flatMap(t => t.clips).find(x => x.id === V.editClip && x.type === 'midi'));
  if (!c) return toast('Select a MIDI clip first');
  const data = writeMidi([{ name: c.name, notes: flattenMidi(c) }], c.start);
  const p = await saveBytes('midi', `${slug(c.name)}.mid`, data); if (p) toast('Exported ' + (typeof p === 'string' ? basename(p) : c.name + '.mid'));
}
async function exportMidiSong() {
  const tracks = S.tracks.filter(t => t.kind === 'midi' && t.clips.length).map(t => ({ name: t.name, channel: t.inst && t.inst.type === 'drums' ? 9 : 0, notes: t.clips.filter(c => c.type === 'midi' && !c.muted).flatMap(c => flattenMidi(c).map(n => ({ ...n, s: n.s + c.start }))) }));
  if (!tracks.length) return toast('There are no MIDI clips to export');
  const p = await saveBytes('midi', `${slug(S.name)}.mid`, writeMidi(tracks, 0)); if (p) toast(`Exported ${tracks.length} MIDI track${tracks.length > 1 ? 's' : ''}`);
}

/* ---------- consolidate audio, bounce a selection ---------- */
// Renders just the clips of an audio track (no devices, no fader) between a and b.
async function renderClipsOnly(t, a, b) {
  const devs = t.devices; t.devices = []; rewire(t);
  try { return await renderRange(a, b, { only: t.id, prefader: true, tail: 0, sr: LIVE_CTX.sampleRate }); }
  finally { t.devices = devs; rewire(t); }
}
async function consolidateAudio(t, a, b, name) {
  if (b - a < 0.25) return; showBusy('Consolidating…');
  try {
    const buf = await renderClipsOnly(t, a, b); pushUndo('Consolidate');
    const sid = addSample(buf, `${name || t.name} (consolidated)`, { recorded: true, path: null });
    const c = songClip(sid, b - a, name || t.name); c.start = a; clearRange(t, a, b); t.clips.push(c); t.clips.sort((x, y) => x.start - y.start);
    V.selClips = new Set([c.id]); V.editClip = c.id; ui.all(); toast('Consolidated into one clip');
  } finally { showBusy(null); }
}
async function bounceSelection() {
  const r = V.time; if (!r || r.b <= r.a) return toast('Select a time range first');
  const ts = S.tracks.filter(t => r.tracks.has(t.id) && t.kind !== 'group' && t.clips.length); if (!ts.length) return toast('Select a range on a track with clips');
  showBusy('Bouncing selection…');
  try {
    const made = [];
    for (const t of ts) {
      const buf = await renderRange(r.a, r.b, { only: t.id, prefader: true, tail: 0, sr: LIVE_CTX.sampleRate });
      if (!made.length) pushUndo('Bounce selection');
      const sid = addSample(buf, `${t.name} (bounce)`, { recorded: true, path: null }), n = newTrack('audio'); n.name = `${t.name} (bounce)`; n.color = t.color; n.group = t.group;
      const c = songClip(sid, r.b - r.a, n.name); c.start = r.a; n.clips = [c]; S.tracks.splice(S.tracks.indexOf(t) + 1, 0, n); buildBus(n, 'track'); routeOut(n); made.push(n);
    }
    V.selTracks = new Set(made.map(t => t.id)); ui.all(); toast(`Bounced the selection to ${made.length} new track${made.length > 1 ? 's' : ''}`);
  } finally { showBusy(null); }
}

/* ---------- templates and the default set ---------- */
let TPL_DIR = null, TPL_CLEARED = null;
async function templateDir() { if (!IS_DESKTOP) return null; if (!TPL_DIR) { const p = await NATIVE.paths(); TPL_DIR = joinPath(joinPath(joinPath(p.music, 'Studio B'), 'User Library'), 'Templates'); } return TPL_DIR; }
const webTemplates = () => { try { return JSON.parse(localStorage.getItem('sb-templates') || '{}'); } catch (e) { return {}; } };
async function saveTemplate(name) {
  const P = serialise(); delete P.path; P.name = name === 'Default' ? 'Untitled' : name; P.markers = P.markers || [];
  const dir = await templateDir();
  if (dir) { const file = joinPath(dir, `${slug(name)}.sbproj`); await writeRecordings(file); const P2 = serialise(); delete P2.path; P2.name = P.name; await NATIVE.write(file, JSON.stringify(P2)); }
  else { const all = webTemplates(); all[name] = P; try { localStorage.setItem('sb-templates', JSON.stringify(all)); } catch (e) { return toast('Not enough browser storage for this template'); } }
  toast(name === 'Default' ? 'Saved as the default set. New projects start from it.' : `Saved template "${name}"`);
}
async function listTemplates() {
  const dir = await templateDir();
  if (!dir) return Object.keys(webTemplates()).map(name => ({ name, load: async () => deep(webTemplates()[name]) }));
  if (!(await NATIVE.exists(dir))) return [];
  const files = await NATIVE.list(dir), d = files.find(f => f.name === 'Default.sbproj');
  // the desktop bridge cannot delete files, so a cleared default set is a tiny marker file
  const cleared = d ? (await NATIVE.read(d.path)).byteLength < 64 : false;
  return files.filter(f => !(cleared && f === d)).filter(f => /\.sbproj$/i.test(f.name)).map(f => ({ name: f.name.replace(/\.sbproj$/i, ''), path: f.path, load: async () => JSON.parse(new TextDecoder().decode(await NATIVE.read(f.path))) }));
}
async function newFromTemplate(tpl) { const P = await tpl.load(); P.name = tpl.name === 'Default' ? 'Untitled' : tpl.name; delete P.path; await loadProjectObj(P, tpl.path || null); delete S.path; S.name = 'Untitled'; ui.title(); }
async function newProject() {
  const d = (await listTemplates()).find(t => t.name === 'Default');
  if (d) { try { return await newFromTemplate(d); } catch (e) { console.warn(e); } }
  loadProjectObj(emptyProject());
}
async function templateMenu(e) {
  const ts = await listTemplates();
  popMenu(e, [
    { label: 'New project', key: 'Ctrl+N', run: () => cmd('new') },
    { label: 'Open the demo song', run: () => confirmLeave(async () => { await loadProjectObj(await demoProject()); V.dirty = false; ui.title(); }) },
    ...ts.map(t => ({ label: `New from template: ${t.name}`, run: () => confirmLeave(() => newFromTemplate(t)) })),
    '-',
    { label: 'Save as template…', run: () => askText('Template name', S.name || 'My template', v => v && saveTemplate(v)) },
    { label: 'Save as default set', run: () => saveTemplate('Default') },
    ...(ts.some(t => t.name === 'Default') ? [{ label: 'Clear the default set', run: async () => { const dir = await templateDir(); if (dir) await NATIVE.write(joinPath(dir, 'Default.sbproj'), JSON.stringify({ cleared: true })); else { const all = webTemplates(); delete all.Default; try { localStorage.setItem('sb-templates', JSON.stringify(all)); } catch (er) { } } TPL_CLEARED = null; toast('New projects start empty again'); } }] : []),
    '-',
    { label: 'Import MIDI file…', run: () => importMidiDialog() },
    { label: 'Export selected MIDI clip…', run: () => exportMidiClip() },
    { label: 'Export all MIDI tracks…', run: () => exportMidiSong() },
  ]);
}
