/* ============ files: platform bridge, projects, audio import, WAV export, Live Set import ============ */
const NATIVE = window.native || null;   // present in the desktop app
const IS_DESKTOP = !!(NATIVE && NATIVE.isDesktop);
const basename = p => String(p).split(/[\\/]/).pop();
const dirname = p => String(p).replace(/[\\/][^\\/]*$/, '');
const joinPath = (a, b) => a.replace(/[\\/]$/, '') + (a.includes('\\') && !a.includes('/') ? '\\' : '/') + b;

async function pickFile(kind, accept, multi) { // -> [{name, path|null, data:ArrayBuffer}]
  if (IS_DESKTOP) { const ps = await NATIVE.openDialog(kind, multi); return Promise.all(ps.map(async p => ({ name: basename(p), path: p, data: await NATIVE.read(p) }))); }
  return new Promise(res => { const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.multiple = !!multi; i.onchange = async () => res(await Promise.all([...i.files].map(async f => ({ name: f.name, path: null, data: await f.arrayBuffer() })))); i.click(); });
}
async function saveBytes(kind, defaultName, data) { // -> saved path, or true in a browser
  if (IS_DESKTOP) { const p = await NATIVE.saveDialog(kind, defaultName); if (!p) return null; await NATIVE.write(p, data); return p; }
  const blob = data instanceof Blob ? data : new Blob([data]); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = basename(defaultName); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); return true;
}

/* ---------- audio files ---------- */
async function decodeAudio(data) { return LIVE_CTX.decodeAudioData(data.slice(0)); }
async function loadAudioFile({ name, path, data }) {
  try {
    const buf = await decodeAudio(data);
    const existing = path && [...SAMPLES.entries()].find(([, s]) => s.path === path); if (existing) return existing[0];
    return addSample(buf, name.replace(/\.[^.]+$/, ''), { path, bytes: IS_DESKTOP ? null : data });
  } catch (e) { toast(`${name} could not be decoded. Use WAV, AIFF, MP3, FLAC, OGG or M4A.`); return null; }
}
async function loadAudioPath(path) { try { return await loadAudioFile({ name: basename(path), path, data: await NATIVE.read(path) }); } catch (e) { return null; } }
// Drop/insert audio onto the timeline: on a given audio track (or a new one) at a position.
function placeAudio(sid, track, at) {
  const s = SAMPLES.get(sid); if (!s) return null;
  if (!track || track.kind !== 'audio') { track = newTrack('audio'); track.name = s.name.slice(0, 24); S.tracks.push(track); buildBus(track, 'track'); }
  const c = newAudioClip(sid, at, 0);
  const loopish = s.buf.duration < 32 && s.bpm && Math.abs(s.buf.duration * s.bpm / 60 - Math.round(s.buf.duration * s.bpm / 60)) < 0.08;
  c.warp = !!loopish; c.srcBpm = loopish ? s.bpm : S.bpm; c.len = clipNaturalLen(c);
  clearRange(track, c.start, c.start + c.len); track.clips.push(c);
  return { track, clip: c };
}
async function importAudioDialog() {
  const files = await pickFile('audio', 'audio/*', true); if (!files.length) return;
  pushUndo('Import audio'); let t = S.tracks.find(x => V.selTracks.has(x.id) && x.kind === 'audio'), at = V.insert;
  for (const f of files) { const sid = await loadAudioFile(f); if (!sid) continue; const r = placeAudio(sid, t, at); if (r) { t = null; V.selClips = new Set([r.clip.id]); } }
  ui.all();
}

/* ---------- WAV ---------- */
function encodeWav(buf, bits = 24, normalize = false) {
  const C = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate, bps = bits / 8, chans = [];
  for (let c = 0; c < C; c++) chans.push(buf.getChannelData(c));
  let peak = 0; if (normalize) chans.forEach(d => { for (let i = 0; i < n; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; } });
  const g = normalize && peak > 0 ? 0.989 / peak : 1;
  const out = new ArrayBuffer(44 + n * C * bps), v = new DataView(out);
  const W = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  W(0, 'RIFF'); v.setUint32(4, 36 + n * C * bps, true); W(8, 'WAVE'); W(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, bits === 32 ? 3 : 1, true);
  v.setUint16(22, C, true); v.setUint32(24, sr, true); v.setUint32(28, sr * C * bps, true); v.setUint16(32, C * bps, true); v.setUint16(34, bits, true); W(36, 'data'); v.setUint32(40, n * C * bps, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < C; c++) {
    let x = chans[c][i] * g;
    if (bits === 32) { v.setFloat32(o, x, true); o += 4; continue; }
    x = clamp(x, -1, 1);
    if (bits === 16) { v.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true); o += 2; }
    else { const s = Math.round(x < 0 ? x * 0x800000 : x * 0x7fffff); v.setUint8(o, s & 255); v.setUint8(o + 1, (s >> 8) & 255); v.setUint8(o + 2, (s >> 16) & 255); o += 3; }
  }
  return out;
}

/* ---------- offline render (faster than real time) ---------- */
// Offline render of the song (or one bus with `only`) between two positions. `prefader` leaves out that track's fader, pan and sends.
async function renderRange(from, to, { sr = 48000, tail = 2, onProgress, only = null, prefader = false } = {}) {
  if (T.busy) throw new Error('Another render is running');
  if (T.playing) stop(); if (T.recording) finishRecording(); T.busy = true; document.body.classList.add('busy');
  const secs = durSec(from, to - from) + tail;
  // stretched audio for every warped clip at every tempo it plays at
  const tempos = [...new Set(tempoMap().map(x => x.bpm))], jobs = [];
  S.tracks.forEach(t => [...t.clips, ...(t.takes || []).flatMap(l => l.clips)].forEach(c => { if (c.type === 'audio' && c.warp && !c.timebase && SAMPLES.get(c.sampleId)) tempos.forEach(bpm => { const r = (c.srcBpm / bpm) * clipPitch(c); if (Math.abs(r - 1) > 0.002) jobs.push(requestWarp(c.sampleId, r)); }); }));
  await Promise.all(jobs);
  const off = new OfflineAudioContext(2, Math.max(1, Math.ceil(secs * sr)), sr);
  const live = ctx; setCtx(off); await loadWorklets(off);
  const saved = { anchorTime: T.anchorTime, anchorPos: T.anchorPos }, loopWas = S.loop.on;
  try {
    buildMaster(); rebuildAll();
    T.render = only || prefader ? { only, prefader } : null;
    if (only) isolateForRender(only, prefader);
    T.anchorTime = 0.02; T.anchorPos = from; T.nextPos = from; T.firstPos = from; T.started.clear(); T.playing = true; T.countUntil = null; S.loop.on = false;
    startAudioAt(from, 0.02);
    const hop = 0.1;
    for (let t = 0; t < secs; t += hop) {
      off.suspend(Math.round(t * sr / 128) * 128 / sr).then(() => { if (T.nextPos < to) { const end = Math.min(to, posAt(off.currentTime + 0.25)); while (T.nextPos < end) { const a = T.nextPos, b = Math.min(end, Math.floor(a + 1e-9) + 1); scheduleWindow(a, b); T.nextPos = b; } } if (onProgress) onProgress(off.currentTime / secs); off.resume(); }).catch(() => { });
    }
    return await off.startRendering();
  } finally {
    S.loop.on = loopWas; T.render = null; T.playing = false; T.srcs = []; setCtx(live); Object.assign(T, saved); buildMaster(); rebuildAll(); applyAllMix(); T.busy = false; document.body.classList.remove('busy');
  }
}
// Silence everything except one bus. For a return, tracks still feed its send but not the main output.
function isolateForRender(id, prefader) {
  const ob = busById(id), isRet = S.returns.includes(ob), inside = ob && ob.kind === 'group' ? new Set(descendants(ob)) : new Set();
  [...S.tracks, ...S.returns].forEach(b => { const r = RT.get(b.id); if (!r || b === ob || inside.has(b)) return; if (isRet && S.tracks.includes(b)) { try { r.mute.disconnect(r.outDest || M.in); } catch (e) { } } else { r.mute.gain.value = 0; r.preMute.gain.value = 0; } });
  const r = RT.get(id);
  if (r) {
    r.mute.gain.value = 1; (r.sends || []).forEach(g => (g.gain.value = 0)); if (prefader) { r.fader.gain.value = 1; r.pan.pan.value = 0; }
    if (groupOf(ob)) { try { r.mute.disconnect(r.outDest); } catch (e) { } r.mute.connect(M.in); r.outDest = M.in; } // a track stem is taken before its group
  }
  chain(M.in, [], M.out); M.out.gain.value = 1;
}
async function exportAudio(opts) {
  const a = opts.range === 'loop' ? S.loop.start : opts.range === 'sel' && V.time ? V.time.a : 0;
  const b = opts.range === 'loop' ? S.loop.end : opts.range === 'sel' && V.time ? V.time.b : songEnd();
  const bar = $('#exportProg'); if (bar) bar.hidden = false;
  const sr = exportSr(opts), buf = await renderRange(a, b, { sr, tail: opts.loop ? Math.max(opts.tail, 2) : opts.tail, onProgress: p => { if (bar) bar.firstElementChild.style.width = Math.round(p * 100) + '%'; } });
  if (bar) bar.hidden = true; showBusy('Encoding…');
  const enc = await encodeAudio(buf, { ...opts, loopLen: opts.loop ? loopSamples(a, b, sr) : 0 }); showBusy(null);
  const p = await saveBytes(enc.ext, `${slug(S.name)}.${enc.ext}`, enc.data);
  if (p) toast(IS_DESKTOP ? `Exported ${basename(p)} (${fmtTime(buf.duration)})` : 'Export ready');
}
const slug = s => (s || 'studio-b').replace(/[^\w\- ]+/g, '').trim() || 'Studio B';
const fmtTime = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');

/* ---------- project save / open ---------- */
function usedSampleIds() {
  const used = new Set(); S.tracks.forEach(t => { t.clips.forEach(c => c.sampleId && used.add(c.sampleId)); (t.takes || []).forEach(l => l.clips.forEach(c => c.sampleId && used.add(c.sampleId))); if (t.frozen) used.add(t.frozen.sid); if (t.inst) { if (t.inst.sampleId) used.add(t.inst.sampleId); (t.inst.pads || []).forEach(p => p.sampleId && used.add(p.sampleId)); } });
  return used;
}
function serialise(forPath) {
  const P = deep({ ...S, view: { pps: V.pps, scrollX: V.scrollX, insert: V.insert } });
  const used = new Set(); S.tracks.forEach(t => { t.clips.forEach(c => c.sampleId && used.add(c.sampleId)); (t.takes || []).forEach(l => l.clips.forEach(c => c.sampleId && used.add(c.sampleId))); if (t.frozen) used.add(t.frozen.sid); if (t.inst) { if (t.inst.sampleId) used.add(t.inst.sampleId); (t.inst.pads || []).forEach(p => p.sampleId && used.add(p.sampleId)); } });
  P.samples = [...used].map(id => { const s = SAMPLES.get(id); if (!s) return null; const e = { id, name: s.name, bpm: s.bpm }; if (s.path) e.path = s.path; else if (s.bytes) e.b64 = b64(s.bytes); return e; }).filter(Boolean);
  return P;
}
const b64 = ab => { const u8 = new Uint8Array(ab); let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0)).buffer;
// Recorded takes have no file yet: write them next to the project as WAV before saving.
async function writeRecordings(projPath) {
  if (!IS_DESKTOP) { const used = usedSampleIds(); for (const [id, s] of SAMPLES) if (used.has(id) && !s.path && !s.bytes) s.bytes = encodeWav(s.buf, 24); return; }
  const dir = joinPath(dirname(projPath), 'Samples');
  const used = usedSampleIds();
  for (const [id, s] of SAMPLES) if (!s.path && used.has(id)) { const p = joinPath(joinPath(dir, 'Recorded'), `${slug(s.name)}-${id.slice(0, 5)}.wav`); await NATIVE.write(p, encodeWav(s.buf, 24)); s.path = p; s.recorded = false; }
}
async function saveProject(as) {
  try {
    let p = S.path;
    if (!IS_DESKTOP) { await writeRecordings(); await saveBytes('sbproj', `${slug(S.name)}.sbproj`, JSON.stringify(serialise())); V.dirty = false; ui.title(); return true; }
    if (as || !p || !/\.sbproj$/i.test(p)) { p = await NATIVE.saveDialog('sbproj', joinPath((await NATIVE.paths()).music, `${slug(S.name)}.sbproj`)); if (!p) return false; S.path = p; S.name = basename(p).replace(/\.sbproj$/i, ''); }
    await writeRecordings(p);
    await NATIVE.write(p, JSON.stringify(serialise(), null, 1));
    V.dirty = false; ui.title(); toast('Saved ' + basename(p)); clearAutosave(); return true;
  } catch (e) { console.error(e); toast('Saving failed: ' + e.message); return false; }
}
window.SB_save = () => saveProject(false);
async function collectAndSave() {
  if (!IS_DESKTOP) return saveProject();
  if (!S.path && !(await saveProject(true))) return;
  const dir = joinPath(joinPath(dirname(S.path), 'Samples'), 'Imported'); let n = 0;
  for (const s of SAMPLES.values()) if (s.path && !s.path.startsWith(dirname(S.path))) { const to = joinPath(dir, basename(s.path)); await NATIVE.copy(s.path, to); s.path = to; n++; }
  await saveProject(); toast(`Collected ${n} file${n === 1 ? '' : 's'} into the project folder`);
}
async function loadProjectObj(P, sourcePath) {
  stop(true);
  const missing = [];
  for (const e of P.samples || []) {
    if (SAMPLES.has(e.id)) continue;
    try {
      let data = null;
      if (e.path && IS_DESKTOP) { let p = e.path; if (!(await NATIVE.exists(p)) && sourcePath) { const alt = joinPath(joinPath(dirname(sourcePath), 'Samples'), basename(p)); const alt2 = joinPath(joinPath(joinPath(dirname(sourcePath), 'Samples'), 'Recorded'), basename(p)); p = (await NATIVE.exists(alt)) ? alt : (await NATIVE.exists(alt2)) ? alt2 : null; } if (p) data = await NATIVE.read(p); e.path = p; }
      else if (e.b64) data = unb64(e.b64);
      if (!data) { missing.push(e.name); continue; }
      addSample(await decodeAudio(data), e.name, { id: e.id, path: e.path || null, bytes: e.b64 ? data : null });
      if (e.bpm) SAMPLES.get(e.id).bpm = e.bpm;
    } catch (err) { missing.push(e.name); }
  }
  delete P.samples; const view = P.view || {}; S = P; if (sourcePath && /\.sbproj$/i.test(sourcePath)) S.path = sourcePath;
  S.prefs = S.prefs || {}; S.markers = S.markers || []; S.loop = S.loop || { on: false, start: 0, end: 64 };
  V.pps = view.pps || 6; V.scrollX = view.scrollX || 0; V.scrollY = 0; V.insert = view.insert || 0; V.selClips.clear(); V.selTracks = new Set(S.tracks[0] ? [S.tracks[0].id] : []); V.editClip = null; V.time = null;
  UNDO.length = REDO.length = 0; rebuildAll(); ui.all(); V.dirty = false; ui.title();
  if (missing.length) toast(`${missing.length} audio file${missing.length > 1 ? 's are' : ' is'} missing: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}`, 6000);
}
async function openProjectDialog() { const [f] = await pickFile('project', '.sbproj,.als,.json'); if (f) await openProjectFile(f); }
async function openProjectFile(f) {
  try {
    if (/\.als$/i.test(f.name)) { const P = await importALS(f); const rep = P._report; delete P._report; await loadProjectObj(P, null); S.name = f.name.replace(/\.als$/i, ''); ui.title(); V.dirty = true; toast(rep, 7000); return; }
    const P = JSON.parse(new TextDecoder().decode(f.data)); if (!P.tracks) throw new Error('This is not a Studio B project.');
    await loadProjectObj(P, f.path); toast('Opened ' + (P.name || f.name));
  } catch (err) { console.error(err); toast('That file could not be opened. ' + (err.message || '')); }
}
async function openPath(p) { await openProjectFile({ name: basename(p), path: p, data: await NATIVE.read(p) }); }


/* ---------- Ableton devices -> Studio B devices ----------
   Live stores each parameter as <Name><Manual Value=".."/></Name>. Unknown or missing values keep Studio B's defaults. */
const LIVE_FX = { Eq8: 'EQ Eight', Compressor2: 'Compressor', GlueCompressor: 'Glue Compressor', Reverb: 'Reverb', Delay: 'Delay', PingPongDelay: 'Ping Pong Delay', SimpleDelay: 'Simple Delay', Echo: 'Echo', Saturator: 'Saturator', AutoFilter: 'Auto Filter', AutoFilter2: 'Auto Filter', Limiter: 'Limiter' };
function mapLiveDevice(d) {
  const kid = name => [...d.children].find(c => c.tagName === name);
  const pv = (name, el = d) => { const e = [...el.children].find(c => c.tagName === name); if (!e) return null; const m = [...e.children].find(c => c.tagName === 'Manual'); const v = m ? m.getAttribute('Value') : e.getAttribute('Value'); return v == null ? null : v; };
  const num = (name, el) => { const v = pv(name, el); return v == null || v === '' || isNaN(+v) ? null : +v; };
  const bool = (name, el) => { const v = pv(name, el); return v == null ? null : v === 'true'; };
  const pct = v => (v == null ? null : v > 1.0001 ? v / 100 : v);   // some versions store 0-100, others 0-1
  const set = (p, k, v, lo, hi) => { if (v != null && isFinite(v)) p[k] = lo != null ? clamp(v, lo, hi) : v; };
  const on = bool('On'); let dev = null;
  switch (d.tagName) {
    case 'Eq8': {
      const modes = [['low cut', 48], ['low cut', 12], ['low shelf', 12], ['bell', 12], ['notch', 12], ['high shelf', 12], ['high cut', 12], ['high cut', 48]];
      const bands = [];
      for (let i = 0; i < 8; i++) {
        const be = kid('Bands.' + i); const pa = be && [...be.children].find(c => c.tagName === 'ParameterA'); if (!pa) continue;
        const m = modes[num('Mode', pa) != null ? num('Mode', pa) : 3] || modes[3];
        bands.push({ on: bool('IsOn', pa) !== false, type: m[0], slope: m[1], f: clamp(num('Freq', pa) || 1000, 20, 20000), g: clamp(num('Gain', pa) || 0, -18, 18), q: clamp(num('Q', pa) || 0.71, 0.1, 18) });
      }
      dev = newDevice('eq', { out: clamp(num('GlobalGain') || 0, -18, 18), bands: bands.length ? bands : DEVICES.eq.def().bands }); break;
    }
    case 'Compressor2': {
      const p = DEVICES.comp.def(); const th = num('Threshold');
      if (th != null) p.thresh = clamp(th > 0 && th <= 2 ? gainToDb(th) : th, -60, 0);
      set(p, 'ratio', num('Ratio'), 1, 20); set(p, 'attack', num('Attack'), 0.1, 100); set(p, 'release', num('Release'), 10, 1000); set(p, 'makeup', num('Gain'), 0, 24); set(p, 'knee', num('Knee'), 0, 30); set(p, 'mix', pct(num('DryWet')), 0, 1);
      dev = newDevice('comp', p); break;
    }
    case 'GlueCompressor': {
      const p = DEVICES.comp.def(); set(p, 'thresh', num('Threshold'), -60, 0);
      const r = num('Ratio'); if (r != null) p.ratio = r <= 2 ? [2, 4, 10][Math.round(r)] : r;
      const a = num('Attack'); if (a != null) p.attack = a <= 6 ? [0.01, 0.1, 0.3, 1, 3, 10, 30][Math.round(a)] : a;
      const rl = num('Release'); if (rl != null) p.release = rl <= 6 ? [100, 200, 400, 600, 800, 1200, 200][Math.round(rl)] : rl;
      set(p, 'makeup', num('Makeup'), 0, 24); set(p, 'mix', pct(num('DryWet')), 0, 1); p.knee = 3;
      dev = newDevice('comp', p); break;
    }
    case 'Reverb': {
      const p = DEVICES.verb.def(); const dt = num('DecayTime'); if (dt != null) p.decay = clamp(dt > 30 ? dt / 1000 : dt, 0.2, 12);
      set(p, 'predelay', num('PreDelay'), 0, 250); const rs = num('RoomSize'); if (rs != null) p.size = clamp(rs > 1 ? rs / 500 : rs, 0, 1);
      if (bool('HiFilterOn') !== false) set(p, 'damp', num('HiFilterFreq'), 800, 18000);
      if (bool('LowFilterOn')) set(p, 'lowcut', num('LowFilterFreq'), 20, 1500);
      const sw = num('StereoSeparation'); if (sw != null) p.width = clamp(sw > 1 ? sw / 100 : sw, 0, 1);
      set(p, 'mix', pct(num('DryWet')), 0, 1); dev = newDevice('verb', p); break;
    }
    case 'Delay': case 'PingPongDelay': case 'SimpleDelay': {
      const p = DEVICES.delay.def(); const steps = [1, 2, 3, 4, 5, 6, 8, 16];
      const div = n => { const k = Object.keys(DIVS).find(x => Math.abs(DIVS[x] - n) < 1e-6); return k || '1/8'; };
      const sync = bool('DelayLine_SyncL'); if (sync != null) p.sync = sync;
      const sl = num('DelayLine_SyncedSixteenthL'), sr = num('DelayLine_SyncedSixteenthR'); if (sl != null) p.divL = div(steps[Math.round(sl)] || sl); if (sr != null) p.divR = div(steps[Math.round(sr)] || sr);
      set(p, 'msL', num('DelayLine_TimeL'), 5, 2000); set(p, 'msR', num('DelayLine_TimeR'), 5, 2000);
      p.ping = d.tagName === 'PingPongDelay' || bool('DelayLine_PingPong') || false;
      set(p, 'fb', pct(num('Feedback')), 0, 1); set(p, 'freq', num('Filter_Frequency'), 100, 12000); set(p, 'mix', pct(num('DryWet')), 0, 1);
      dev = newDevice('delay', p); break;
    }
    case 'Echo': { const p = DEVICES.tape.def(); set(p, 'fb', pct(num('Feedback')), 0, 1.05); set(p, 'mix', pct(num('DryWet')), 0, 1); dev = newDevice('tape', p); break; }
    case 'Saturator': {
      const p = DEVICES.sat.def(); set(p, 'drive', num('PreDrive'), 0, 36); set(p, 'out', num('PostDrive'), -24, 12); set(p, 'mix', pct(num('DryWet')), 0, 1);
      const ty = num('Type'); if (ty != null) p.style = ['Tape', 'Tube', 'Tube', 'Transistor', 'Fold', 'Transistor', 'Tube'][Math.round(ty)] || 'Tube';
      dev = newDevice('sat', p); break;
    }
    case 'AutoFilter': case 'AutoFilter2': {
      const p = DEVICES.filter.def(); const ft = num('FilterType'); if (ft != null) p.type = ['lowpass', 'highpass', 'bandpass', 'notch'][Math.round(ft)] || 'lowpass';
      const fc = num('Cutoff') != null ? num('Cutoff') : num('Frequency'); if (fc != null) p.cutoff = clamp(fc <= 140 ? 440 * Math.pow(2, (fc - 69) / 12) : fc, 30, 18000);
      const rs = num('Resonance'); if (rs != null) p.res = clamp(0.5 + rs * 12, 0.3, 18);
      const la = num('LfoAmount'); if (la != null) p.depth = clamp(la * 4, 0, 4);
      dev = newDevice('filter', p); break;
    }
    case 'Limiter': { const p = DEVICES.limit.def(); set(p, 'ceiling', num('Ceiling'), -12, 0); set(p, 'gain', num('Gain'), 0, 18); set(p, 'release', num('Release'), 10, 600); dev = newDevice('limit', p); break; }
  }
  if (dev && on === false) dev.on = false;
  return dev;
}
// Ordered device chain of a track: mapped effects, plug-in placeholders, and a list of what could not come across.
function readLiveChain(devicesEl, skipFirstInstrument) {
  const out = { devices: [], mapped: [], unmapped: [], plugins: [], racks: 0 };
  if (!devicesEl) return out;
  const INSTR = new Set(['OriginalSimpler', 'MultiSampler', 'DrumGroupDevice', 'InstrumentGroupDevice', 'DrumCell', 'DrumSampler', 'UltraAnalog', 'InstrumentVector', 'Operator', 'Drift', 'Collision', 'StringStudio', 'LoungeLizard', 'InstrumentImpulse', 'InstrumentMeld', 'Tension', 'Electric']);
  const walk = (el, depth) => {
    for (const d of [...el.children]) {
      const tag = d.tagName;
      if (tag === 'PluginDevice' || tag === 'AuPluginDevice') { out.plugins.push(d); continue; }
      if (INSTR.has(tag)) continue;
      if (tag === 'AudioEffectGroupDevice' && depth < 3) { out.racks++; d.querySelectorAll(':scope > Branches > AudioEffectBranch > DeviceChain > AudioToAudioDeviceChain > Devices').forEach(inner => walk(inner, depth + 1)); continue; }
      const m = mapLiveDevice(d);
      if (m) { out.devices.push(m); out.mapped.push(LIVE_FX[tag] || tag); }
      else if (!/^(MidiArpeggiator|MidiChord|MidiScale|MidiPitcher|MidiRandom|MidiVelocity|MidiNoteLength|MxDeviceMidiEffect|MidiEffectGroupDevice)$/.test(tag)) out.unmapped.push(tag);
    }
  };
  walk(devicesEl, 0);
  return out;
}

/* ---------- Ableton Live Set import ---------- */
async function importALS(file) {
  let bytes = new Uint8Array(file.data), xml;
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) { const ds = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')); xml = await new Response(ds).text(); }
  else xml = new TextDecoder().decode(bytes);
  const doc = new DOMParser().parseFromString(xml, 'text/xml'); const live = doc.querySelector('LiveSet'); if (!live) throw new Error('No Live Set found inside.');
  const val = (el, sel) => { const n = el && el.querySelector(sel); return n ? n.getAttribute('Value') : null; };
  const num = (el, sel, d = 0) => { const v = val(el, sel); return v == null ? d : +v; };
  const P = emptyProject(); P.tracks = []; P.name = file.name.replace(/\.als$/i, '');
  const mt = live.querySelector(':scope > MasterTrack, :scope > MainTrack');
  const tempo = mt && mt.querySelector('Tempo > Manual'); if (tempo) P.bpm = clamp(+tempo.getAttribute('Value'), 20, 300);
  const tsig = mt && mt.querySelector('TimeSignature > Manual'); if (tsig) { const v = +tsig.getAttribute('Value'); const num = (v % 99) + 1, den = Math.pow(2, Math.floor(v / 99)); if (num >= 1 && num <= 32 && [1, 2, 4, 8, 16].includes(den)) P.sig = [num, den]; }
  // tempo changes: the Main track's tempo envelope, kept as steps
  if (mt) { const tid = (mt.querySelector('Tempo > AutomationTarget') || { getAttribute: () => null }).getAttribute('Id'); if (tid) mt.querySelectorAll(':scope > AutomationEnvelopes > Envelopes > AutomationEnvelope').forEach(env => { if (val(env, 'EnvelopeTarget > PointeeId') !== tid) return; const pts = [...env.querySelectorAll('Automation > Events > FloatEvent')].map(e => ({ t: Math.max(0, +e.getAttribute('Time') * 4), v: clamp(+e.getAttribute('Value'), 20, 300) })).sort((a, b) => a.t - b.t); const steps = pts.filter((p, i) => i === 0 || Math.abs(p.v - pts[i - 1].v) > 0.01); if (steps.length > 1 || (steps[0] && Math.abs(steps[0].v - P.bpm) > 0.01)) { P.master.auto.tempo = steps; } }); }
  const B = 4; // steps per beat
  // locators & loop
  live.querySelectorAll(':scope > Locators > Locators > Locator').forEach(l => P.markers.push({ id: uid(), t: num(l, ':scope > Time') * B, name: val(l, ':scope > Name') || 'Locator' }));
  const tr = live.querySelector(':scope > Transport'); if (tr) { P.loop = { on: val(tr, ':scope > LoopOn') === 'true', start: num(tr, ':scope > LoopStart') * B, end: (num(tr, ':scope > LoopStart') + num(tr, ':scope > LoopLength', 16)) * B }; }
  const report = { tracks: 0, midi: 0, audio: 0, missing: new Set(), plugins: [], auto: 0, samplers: 0, drumSamples: 0, frozen: 0, unfrozenPlugins: [], fx: [], fxMissing: new Set(), returns: 0, racks: 0 };
  const alsDir = file.path ? dirname(file.path) : null;
  const tracksEl = live.querySelector(':scope > Tracks');
  const resolvePath = async fr => {
    if (!fr || !IS_DESKTOP) return null;
    const abs = val(fr, 'Path'); if (abs && await NATIVE.exists(abs)) return abs;
    const rel = val(fr, 'RelativePath');
    if (rel && alsDir) { const p = joinPath(alsDir, rel.replace(/\//g, NATIVE.platform === 'win32' ? '\\' : '/')); if (await NATIVE.exists(p)) return p; }
    // Live 10 style: RelativePath elements
    const parts = [...fr.querySelectorAll('RelativePath > RelativePathElement')].map(e => e.getAttribute('Dir')); const nm = val(fr, 'Name');
    if (alsDir && nm) { const p = [alsDir, ...parts.filter(x => x && x !== '..'), nm].reduce(joinPath); if (await NATIVE.exists(p)) return p; const q = joinPath(joinPath(joinPath(alsDir, 'Samples'), 'Imported'), nm); if (await NATIVE.exists(q)) return q; }
    return null;
  };
  const midiNotes = (mc, kind) => {
    const notes = [];
    mc.querySelectorAll('KeyTracks > KeyTrack').forEach(kt => {
      const key = num(kt, 'MidiKey');
      kt.querySelectorAll('MidiNoteEvent').forEach(ev => {
        if (ev.getAttribute('IsEnabled') === 'false') return;
        const p = key; // raw MIDI note; instrument-specific mapping happens per track
        notes.push({ p, s: +ev.getAttribute('Time') * B, l: Math.max(0.1, +ev.getAttribute('Duration') * B), v: clamp(+ev.getAttribute('Velocity') / 127, 0.05, 1), c: ev.getAttribute('Probability') != null ? clamp(+ev.getAttribute('Probability'), 0, 1) : 1 });
      });
    });
    return notes;
  };
  const autoFor = (trEl, idToKey) => { // track mixer automation: volume and pan
    const out = {};
    trEl.querySelectorAll(':scope > AutomationEnvelopes > Envelopes > AutomationEnvelope').forEach(env => {
      const pid = val(env, 'EnvelopeTarget > PointeeId'); const key = idToKey[pid]; if (!key) return;
      const pts = [...env.querySelectorAll('Automation > Events > FloatEvent')].map(e => ({ t: Math.max(0, +e.getAttribute('Time') * B), v: +e.getAttribute('Value') }));
      if (!pts.length) return; report.auto++;
      out[key] = pts.map(p => ({ t: p.t, v: key === 'vol' ? clamp(gainToFader(p.v), 0, 1) : clamp(p.v, -1, 1) })).sort((a, b) => a.t - b.t);
    });
    return out;
  };
  const plugInfo = d => ({ name: val(d, 'PluginDesc PlugName') || val(d, 'PluginDesc Vst3PluginInfo Name') || val(d, 'PluginDesc AuPluginInfo Name') || val(d, 'PluginDesc VstPluginInfo PlugName') || val(d, 'PlugName') || 'Plug-in', format: d.tagName === 'AuPluginDevice' ? 'AU' : d.querySelector('Vst3PluginInfo') ? 'VST3' : 'VST' });
  const warpBpm = scope => { const wm = [...scope.querySelectorAll('WarpMarkers > WarpMarker')].map(w => ({ sec: +w.getAttribute('SecTime'), beat: +w.getAttribute('BeatTime') })).sort((a, b) => a.beat - b.beat); if (wm.length < 2) return null; const a = wm[0], z = wm[wm.length - 1]; const spb = (z.sec - a.sec) / ((z.beat - a.beat) || 1); return spb > 0 ? clamp(60 / spb, 20, 400) : null; };
  // Simpler / Sampler / Drum Sampler: the loaded file, its region, slices, playback mode and root key.
  const readSampler = async dev => {
    const part = dev.querySelector('MultiSamplePart'), fr = (part || dev).querySelector('SampleRef FileRef'); if (!fr) return null;
    const nm = val(fr, 'Name') || basename(val(fr, 'Path') || '') || 'sample';
    const p = await resolvePath(fr); const sid = p ? await loadAudioPath(p) : null;
    if (!sid) { report.missing.add(nm); return { missing: nm }; }
    const s = SAMPLES.get(sid), fsr = num(fr.parentElement, 'DefaultSampleRate', s.buf.sampleRate) || s.buf.sampleRate;
    const start = part ? num(part, ':scope > SampleStart') / fsr : 0; let end = part ? num(part, ':scope > SampleEnd', 0) / fsr : 0; if (!(end > start)) end = s.buf.duration;
    const pm = num(dev, 'PlaybackMode', 0), mode = pm === 2 ? 'slice' : pm === 1 ? 'oneshot' : 'classic';
    let cues = [];
    if (mode === 'slice' && part) {
      const style = num(part, ':scope > SlicingStyle', 0), list = ['SlicePoints', 'BeatSlicePoints', 'RegionSlicePoints', 'ManualSlicePoints'][style] || 'SlicePoints';
      let pts = [...part.querySelectorAll(`:scope > ${list} > SlicePoint`)].map(e => ({ t: +e.getAttribute('TimeInSeconds'), r: +(e.getAttribute('Rank') || 0) })).filter(x => x.t >= start - 1e-4 && x.t < end - 0.01);
      if (style === 0 && pts.length) { const sens = clamp(num(part, ':scope > SlicingThreshold', 100), 1, 100); pts = pts.sort((a, b) => a.r - b.r).slice(0, Math.max(1, Math.ceil(pts.length * sens / 100))); }
      cues = pts.map(x => x.t).sort((a, b) => a - b);
      if (!cues.length || cues[0] - start > 0.01) cues.unshift(start);
      if (cues.length < 2) cues = findCues(s.env, s.buf.sampleRate, 512, 16, s.buf.duration).filter(c => c >= start && c < end);
    } else cues = end < s.buf.duration - 0.01 ? [start, end] : [start];
    const warped = part ? val(part, 'SampleWarpProperties > IsWarped') === 'true' : false;
    const transpose = num(dev, 'TransposeKey > Manual', 0);
    return { sid, name: s.name, mode, cues: cues.slice(0, 64), start, end, root: (part ? num(part, ':scope > RootKey', 60) : 60) - transpose, warped, srcBpm: warped ? (warpBpm(part) || s.bpm || P.bpm) : 0 };
  };
  // Audio clip from an Arrangement AudioClip element (also used for frozen tracks).
  const audioClipFrom = async ce => {
    const cs = num(ce, ':scope > CurrentStart', +ce.getAttribute('Time') || 0) * B, cend = num(ce, ':scope > CurrentEnd', cs / B + 4) * B;
    const ls = num(ce, ':scope > Loop > LoopStart') * B, sr = num(ce, ':scope > Loop > StartRelative') * B;
    const fr = ce.querySelector('SampleRef FileRef'); const nm = val(fr, 'Name') || (val(fr, 'Path') || '').split(/[\\/]/).pop() || 'Audio';
    const p = await resolvePath(fr); const sid = p ? await loadAudioPath(p) : null;
    if (!sid) { report.missing.add(nm); return null; }
    const s = SAMPLES.get(sid), warped = val(ce, ':scope > IsWarped') !== 'false';
    const c = newAudioClip(sid, cs, cend - cs); c.name = val(ce, ':scope > Name') || nm; c.muted = val(ce, ':scope > Disabled') === 'true'; c.warp = warped;
    c.semis = clamp(Math.round(num(ce, ':scope > PitchCoarse')), -24, 24); c.gain = gainToDb(num(ce, ':scope > SampleVolume', 1));
    if (warped) {
      const wm = [...ce.querySelectorAll('WarpMarkers > WarpMarker')].map(w => ({ sec: +w.getAttribute('SecTime'), beat: +w.getAttribute('BeatTime') })).sort((a, b) => a.beat - b.beat);
      if (wm.length >= 2) { const a = wm[0], z = wm[wm.length - 1]; const spb = (z.sec - a.sec) / ((z.beat - a.beat) || 1); c.srcBpm = clamp(60 / spb, 20, 400); c.offset = (a.sec + ((ls + sr) / B - a.beat) * spb) * c.srcBpm / 15; }
      else { c.srcBpm = s.bpm || P.bpm; c.offset = ls + sr; }
    } else { c.srcBpm = P.bpm; c.offset = (num(ce, ':scope > Loop > LoopStart') + num(ce, ':scope > Loop > StartRelative')) * P.bpm / 15; }
    c.fadeIn = num(ce, 'Fades > FadeInLength') * B; c.fadeOut = num(ce, 'Fades > FadeOutLength') * B;
    return c;
  };
  const GIDS = {};
  for (const el of tracksEl ? Array.from(tracksEl.children) : []) {
    const tag = el.tagName; if (tag !== 'MidiTrack' && tag !== 'AudioTrack' && tag !== 'GroupTrack') continue;
    if (tag === 'GroupTrack') {
      const nameEl = el.querySelector(':scope > Name'); const g = { id: uid(), kind: 'group', name: (nameEl && (val(nameEl, 'UserName') || val(nameEl, 'EffectiveName'))) || 'Group', color: COLORS[num(el, ':scope > Color', 0) % COLORS.length], vol: 0.79, pan: 0, mute: false, solo: false, arm: false, sendA: 0, sendB: 0, h: 44, devices: [], clips: [], auto: {}, autoShow: 'vol' };
      const gm = el.querySelector(':scope > DeviceChain > Mixer'); if (gm) { const v = gm.querySelector(':scope > Volume'); if (v) g.vol = clamp(gainToFader(num(v, 'Manual', 1)), 0, 1); const sp = gm.querySelector(':scope > Speaker'); if (sp) g.mute = val(sp, 'Manual') === 'false'; }
      const ch = readLiveChain(el.querySelector(':scope > DeviceChain > DeviceChain > Devices')); g.devices = ch.devices; report.fx.push(...ch.mapped);
      g.group = GIDS[num(el, ':scope > TrackGroupId', -1)] || null; GIDS[el.getAttribute('Id')] = g.id; P.tracks.push(g); continue;
    }
    const nameEl = el.querySelector(':scope > Name'); const name = (nameEl && (val(nameEl, 'UserName') || val(nameEl, 'EffectiveName'))) || (tag === 'MidiTrack' ? 'MIDI' : 'Audio');
    const kind = tag === 'AudioTrack' ? 'audio' : 'midi';
    const topDevs = el.querySelector(':scope > DeviceChain > DeviceChain > Devices');
    const drumEl = kind === 'midi' ? el.querySelector('DrumGroupDevice') : null;
    const smpEl = kind === 'midi' && !drumEl ? el.querySelector('OriginalSimpler, MultiSampler, DrumCell, DrumSampler') : null;
    const plugEls = [...el.querySelectorAll('PluginDevice, AuPluginDevice')].filter(d => !d.closest('FreezeSequencer'));
    const frozen = val(el, ':scope > Freeze') === 'true';
    const t = newTrack(kind, drumEl ? 'drums' : 'synth', name);
    const mix = el.querySelector(':scope > DeviceChain > Mixer');
    // effects in chain order: Ableton devices mapped to Studio B ones, plug-ins kept as named placeholders
    const firstTop = topDevs ? [...topDevs.children][0] : null;
    t.devices = [];
    if (firstTop && (firstTop.tagName === 'PluginDevice' || firstTop.tagName === 'AuPluginDevice') && kind === 'midi' && !drumEl && !smpEl) { const info = plugInfo(firstTop); t.devices.push(newDevice('plugin', { ...info, role: 'instrument' })); report.plugins.push({ ...info, track: name, frozen }); }
    [...(topDevs ? topDevs.children : [])].forEach(d => {
      if (d === firstTop && t.devices.length) return;
      if (d.tagName === 'PluginDevice' || d.tagName === 'AuPluginDevice') { const info = plugInfo(d); t.devices.push(newDevice('plugin', { ...info, role: 'effect' })); report.plugins.push({ ...info, track: name, frozen }); return; }
      const one = readLiveChain({ children: [d] }); one.devices.forEach(x => t.devices.push(x)); report.fx.push(...one.mapped); one.unmapped.forEach(u => report.fxMissing.add(u)); report.racks += one.racks;
    });
    // sends A and B
    const sends = mix ? [...mix.querySelectorAll(':scope > Sends > TrackSendHolder')] : [];
    sends.slice(0, 12).forEach((sh, i) => setSend(t, i, clamp(num(sh, 'Send > Manual', 0), 0, 1)));
    t.group = GIDS[num(el, ':scope > TrackGroupId', -1)] || null;
    let noteMap = null; // raw MIDI note -> instrument note
    if (smpEl) {
      const sm = await readSampler(smpEl);
      if (sm && sm.sid) {
        t.inst = newInst('sampler'); Object.assign(t.inst, { sampleId: sm.sid, cues: sm.cues, sync: sm.warped, stretch: true, srcBpm: sm.srcBpm || 0, root: sm.root, gain: 0.85 });
        if (sm.mode === 'slice') { t.inst.mode = 'pads'; t.inst.oneShot = 'cue'; noteMap = k => (k - 36 >= 0 && k - 36 < sm.cues.length ? k - 36 : null); }
        else { t.inst.mode = 'keys'; t.inst.keyCue = 0; t.inst.oneShot = sm.mode === 'oneshot' ? 'cue' : 'gate'; }
        t.name = name; report.samplers++;
      }
    }
    if (drumEl) {
      const branches = [...drumEl.querySelectorAll(':scope > Branches > DrumBranch')];
      const pads = [];
      for (const br of branches) {
        const dev = br.querySelector('OriginalSimpler, MultiSampler, DrumCell, DrumSampler'); const rv = num(br, 'ReceivingNote', -1); if (rv < 0) continue;
        const sm = dev ? await readSampler(dev) : null; if (!sm || !sm.sid) continue;
        const bname = val(br, ':scope > Name > UserName') || val(br, ':scope > Name > EffectiveName') || sm.name;
        pads.push({ rv, pad: { kind: 'Kick', tune: clamp(sm.root != null ? 60 - sm.root : 0, -24, 24), decay: 3, level: 0.85, pan: 0, sampleId: sm.sid, label: bname } });
      }
      if (pads.length) {
        // Ableton stores a pad's note either directly or as 128 minus the note; pick whichever matches the clips.
        const used = new Set([...el.querySelectorAll('KeyTracks > KeyTrack')].map(kt => num(kt, 'MidiKey')));
        const score = fn => pads.filter(x => used.has(fn(x.rv))).length;
        const toNote = score(v => 128 - v) >= score(v => v) ? v => 128 - v : v => v;
        pads.sort((a, b) => toNote(a.rv) - toNote(b.rv));
        t.inst.pads = pads.map(x => x.pad); const map = new Map(pads.map((x, i) => [toNote(x.rv), i]));
        noteMap = k => (map.has(k) ? map.get(k) : null); report.drumSamples += pads.length;
      } else noteMap = GM_PAD;
    }
    t.color = COLORS[num(el, ':scope > Color', num(el, ':scope > ColorIndex', P.tracks.length)) % COLORS.length];
    const volEl = mix && mix.querySelector(':scope > Volume'), panEl = mix && mix.querySelector(':scope > Pan');
    if (volEl) t.vol = clamp(gainToFader(num(volEl, 'Manual', 1)), 0, 1);
    if (panEl) t.pan = clamp(num(panEl, 'Manual'), -1, 1);
    const sp = mix && mix.querySelector(':scope > Speaker'); if (sp) t.mute = val(sp, 'Manual') === 'false';
    const ids = {}; const atId = e => { const a = e && e.querySelector(':scope > AutomationTarget'); return a ? a.getAttribute('Id') : null; };
    if (atId(volEl)) ids[atId(volEl)] = 'vol'; if (atId(panEl)) ids[atId(panEl)] = 'pan';
    t.auto = autoFor(el, ids);
    // arrangement clips
    const evs = el.querySelectorAll('ArrangerAutomation > Events > MidiClip, ArrangerAutomation > Events > AudioClip');
    for (const ce of evs) {
      if (ce.closest('FreezeSequencer')) continue;
      const isMidi = ce.tagName === 'MidiClip';
      const cs = num(ce, ':scope > CurrentStart', +ce.getAttribute('Time') || 0) * B, cend = num(ce, ':scope > CurrentEnd', cs / B + 4) * B;
      const ls = num(ce, ':scope > Loop > LoopStart') * B, le = num(ce, ':scope > Loop > LoopEnd', 4) * B, sr = num(ce, ':scope > Loop > StartRelative') * B, loopOn = val(ce, ':scope > Loop > LoopOn') === 'true';
      const cname = val(ce, ':scope > Name') || (isMidi ? 'MIDI' : 'Audio'); const disabled = val(ce, ':scope > Disabled') === 'true';
      if (isMidi && kind === 'midi') {
        const notes = midiNotes(ce, t.inst.type); const L = Math.max(1, le - ls);
        const c = newMidiClip(cs, Math.max(0.25, cend - cs), cname); c.muted = disabled;
        if (loopOn) { c.bars = L / 16; c.notes = notes.filter(n => n.s >= ls - 1e-6 && n.s < le).map(n => ({ ...n, s: n.s - ls })); c.offset = sr; }
        else { c.bars = Math.max(1 / 16, (cend - cs) / 16); c.notes = notes.filter(n => n.s >= ls + sr - 1e-6).map(n => ({ ...n, s: n.s - ls - sr })); c.offset = 0; c.bars = Math.ceil(Math.max(c.len, ...c.notes.map(n => n.s + n.l)) / 16 * 4) / 4; }
        if (!Number.isInteger(c.bars * 16)) c.bars = Math.ceil(c.bars * 16) / 16;
        t.clips.push(c); report.midi++;
      } else if (!isMidi && kind === 'audio') {
        const c = await audioClipFrom(ce); if (!c) continue;
        t.clips.push(c); report.audio++;
      }
    }
    if (noteMap) t.clips.forEach(c => { c.notes = c.notes.map(n => ({ ...n, p: noteMap(n.p) })).filter(n => n.p != null); });
    if (kind === 'midi' && t.inst.type === 'synth') { const ns = t.clips.flatMap(c => c.notes); if (ns.length && ns.reduce((a, n) => a + n.p, 0) / ns.length < 48) Object.assign(t.inst, SYNTH_PRESETS['Sub Bass'], { preset: 'Sub Bass' }); }
    P.tracks.push(t); report.tracks++;
    // Frozen in Ableton: the rendered audio (plug-ins included) comes in on its own track, and the original is switched off.
    if (frozen) {
      const fz = [...el.querySelectorAll('FreezeSequencer ArrangerAutomation > Events > AudioClip')];
      const ft = newTrack('audio', 'synth', name + ' (frozen)'); Object.assign(ft, { color: t.color, vol: t.vol, pan: t.pan, auto: deep(t.auto), h: t.h });
      for (const ce of fz) { const c = await audioClipFrom(ce); if (c) ft.clips.push(c); }
      if (ft.clips.length) { P.tracks.push(ft); t.mute = true; report.frozen++; report.audio += ft.clips.length; }
    }
    if (!frozen) report.plugins.filter(x => x.track === name && !x.frozen).forEach(x => report.unfrozenPlugins.push(`${x.name} on ${name}`));
  }
  if (!P.tracks.length) throw new Error('No MIDI or audio tracks were found.');
  // return tracks become Studio B returns (sends A and B are wired to the first two)
  const rets = tracksEl ? [...tracksEl.children].filter(e => e.tagName === 'ReturnTrack') : [];
  if (rets.length) {
    P.returns = rets.map(el => { const nameEl = el.querySelector(':scope > Name'); const nm = (nameEl && (val(nameEl, 'UserName') || val(nameEl, 'EffectiveName'))) || 'Return';
      const ch = readLiveChain(el.querySelector(':scope > DeviceChain > DeviceChain > Devices')); report.fx.push(...ch.mapped); ch.unmapped.forEach(u => report.fxMissing.add(u));
      ch.plugins.forEach(d => { const info = plugInfo(d); ch.devices.push(newDevice('plugin', { ...info, role: 'effect' })); report.unfrozenPlugins.push(`${info.name} on ${nm}`); });
      const r = newBusLike(nm, ch.devices); const vm = el.querySelector(':scope > DeviceChain > Mixer > Volume'); if (vm) r.vol = clamp(gainToFader(num(vm, 'Manual', 1)), 0, 1); return r; });
    report.returns = rets.length; P.returns = P.returns.slice(0, 12);
  }
  if (mt) { const ch = readLiveChain(mt.querySelector(':scope > DeviceChain > DeviceChain > Devices')); P.master.devices = ch.devices; report.fx.push(...ch.mapped); ch.unmapped.forEach(u => report.fxMissing.add(u)); }
  // master volume automation
  if (mt) { const mv = mt.querySelector(':scope > DeviceChain > Mixer > Volume'); if (mv) P.master.vol = clamp(gainToFader(num(mv, 'Manual', 1)), 0, 1); }
  const lines = [`Imported ${report.tracks} tracks, ${report.midi} MIDI clips and ${report.audio} audio clips at ${Math.round(P.bpm * 100) / 100} BPM.`];
  if (report.auto) lines.push(`${report.auto} volume/pan automation lanes came across.`);
  if (report.missing.size) lines.push(`${report.missing.size} audio file${report.missing.size > 1 ? 's' : ''} could not be found${IS_DESKTOP ? '' : ' (open .als files in the desktop app to load audio)'}.`);
  if (report.samplers) lines.push(`${report.samplers} sampler track${report.samplers > 1 ? 's' : ''} loaded with ${report.samplers > 1 ? 'their samples' : 'its sample'}.`);
  if (report.drumSamples) lines.push(`${report.drumSamples} drum pad samples loaded.`);
  if (report.fx.length) { const n = {}; report.fx.forEach(x => (n[x] = (n[x] || 0) + 1)); lines.push('Effects carried over with their settings: ' + Object.entries(n).map(([k, v]) => v > 1 ? `${k} ×${v}` : k).join(', ') + '.'); }
  if (report.returns) lines.push(`${report.returns} return track${report.returns > 1 ? 's' : ''} came in${report.returns > 2 ? ' (sends A and B feed the first two)' : ''}.`);
  if (report.fxMissing.size) lines.push(`Not mapped yet: ${[...report.fxMissing].slice(0, 5).join(', ')}${report.fxMissing.size > 5 ? '…' : ''}.`);
  if (report.racks) lines.push('Effect racks were flattened into a single chain.');
  if (P.master.auto.tempo) lines.push('Tempo changes came across.');
  if (report.frozen) lines.push(`${report.frozen} frozen track${report.frozen > 1 ? 's' : ''} came in as audio with the plug-in sound.`);
  if (report.unfrozenPlugins.length) lines.push(`Not loaded: ${report.unfrozenPlugins.slice(0, 3).join(', ')}${report.unfrozenPlugins.length > 3 ? '…' : ''}. Freeze those tracks in Ableton and reopen the set to hear them.`);
  P._report = lines.join(' ');
  return P;
}
function GM_PAD(k) { return ({ 35: 0, 36: 0, 38: 1, 40: 1, 39: 2, 42: 3, 44: 3, 46: 4, 41: 5, 43: 5, 45: 5, 47: 5, 48: 5, 50: 5, 37: 6, 56: 6, 70: 7, 69: 7, 82: 7, 49: 4, 51: 4 })[k] ?? clamp(k - 36, 0, 7); }
