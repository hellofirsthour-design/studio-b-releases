/* ============ Studio B engine: project model, audio graph, timeline transport ============
   Time unit everywhere: steps (sixteenth notes). A bar of 4/4 = 16 steps. */
let S = null;               // project (saved)
const RT = new Map();       // bus id -> runtime nodes
const M = {};               // main bus runtime
const T = { playing: false, anchorTime: 0, anchorPos: 0, nextPos: 0, rec: false, srcs: [], started: new Set(), recording: null, stopPos: 0, countUntil: null };
const V = { insert: 0, pps: 6, scrollX: 0, scrollY: 0, selClips: new Set(), selTracks: new Set(), time: null, editClip: null, detail: 'clip', autoMode: false, follow: true, browser: true, grid: 0, snap: true, dirty: false };
const posAt = time => songPos(time - T.anchorTime + songSec(T.anchorPos));
const timeAt = pos => T.anchorTime + songSec(pos) - songSec(T.anchorPos);
const stepSec = () => 15 / bpmAt(nowPos());
const nowPos = () => (T.playing ? Math.max(0, posAt(ctx.currentTime)) : V.insert);
const inCountIn = () => T.playing && T.countUntil != null;

/* ---------- model factories ---------- */
const TRACK_NAMES = { audio: 'Audio', midi: 'MIDI' };
function newTrack(kind, instType = 'synth', name) {
  const n = S ? S.tracks.length : 0;
  const t = { id: uid(), kind, name: name || (kind === 'audio' ? 'Audio' : { drums: 'Drums', synth: 'Synth', sampler: 'Sampler' }[instType]) , color: COLORS[n % COLORS.length], vol: 0.79, pan: 0, mute: false, solo: false, arm: false, monitor: 'auto', input: 'default', sendA: 0, sendB: 0, h: 64, devices: [], clips: [], auto: {}, autoShow: 'vol' };
  if (kind === 'midi') t.inst = newInst(instType);
  return t;
}
function newInst(type) {
  if (type === 'drums') return { type, pads: ['Kick', 'Snare', 'Clap', 'Closed Hat', 'Open Hat', 'Tom', 'Rim', 'Shaker'].map(k => ({ kind: k, tune: 0, decay: 1, level: 0.85, pan: 0, sampleId: null })) };
  if (type === 'sampler') return { type, sampleId: null, cues: [], semis: 0, sync: true, stretch: true, srcBpm: 0, mode: 'pads', keyCue: 0, oneShot: 'cue', choke: true, gain: 0.8, attack: 0.002, release: 0.02, filter: 0 };
  return { type: 'synth', ...SYNTH_DEFAULT, ...SYNTH_PRESETS.Keys, preset: 'Keys' };
}
const newMidiClip = (start, len, name = 'MIDI') => ({ id: uid(), type: 'midi', start, len, offset: 0, name, muted: false, bars: Math.max(0.25, len / 16), notes: [] });
const newAudioClip = (sid, start, len) => { const s = SAMPLES.get(sid); return { id: uid(), type: 'audio', sampleId: sid, start, len, offset: 0, name: s ? s.name : 'Audio', muted: false, gain: 0, semis: 0, warp: true, srcBpm: s && s.bpm ? s.bpm : S.bpm, fadeIn: 0, fadeOut: 0 }; };
function newBusLike(name, devs) { return { id: uid(), name, color: '#a7a3b8', vol: 0.79, pan: 0, mute: false, devices: devs, auto: {}, autoShow: 'vol', h: 40 }; }
function emptyProject() {
  const keep = S;
  S = { v: 1, name: 'Untitled', path: null, bpm: 120, root: 0, scale: 'minor', metro: false, loop: { on: false, start: 0, end: 64 }, markers: [], tracks: [],
    returns: [newBusLike('Space', [newDevice('verb', { ...DEVICES.verb.def(), mix: 1 })]), newBusLike('Echo Pair', [newDevice('delay', { ...DEVICES.delay.def(), mix: 1 })])],
    master: { id: uid(), name: 'Main', vol: 0.79, pan: 0, devices: [newDevice('limit')], auto: {}, autoShow: 'vol', h: 40 }, length: 256, view: {} };
  S.tracks.push(newTrack('audio'), newTrack('audio'), newTrack('midi', 'drums'), newTrack('midi', 'synth'));
  S.tracks.forEach((t, i) => (t.name = ['Audio 1', 'Audio 2', 'Drums', 'Keys'][i]));
  const P = S; S = keep; return P;
}
const allBuses = () => [...S.tracks, ...S.returns, S.master];
const busById = id => allBuses().find(b => b.id === id);
const trackOf = clip => S.tracks.find(t => t.clips.includes(clip));
const clipById = id => { for (const t of S.tracks) { const c = t.clips.find(c => c.id === id); if (c) return c; } return null; };
const songEnd = () => Math.max(64, ...S.tracks.flatMap(t => t.clips.map(c => c.start + c.len)));

/* ---------- audio graph ---------- */
function buildMaster() {
  M.in = ctx.createGain(); M.out = ctx.createGain(); M.an = ctx.createAnalyser(); M.an.fftSize = 2048;
  M.rec = !isOffline() && ctx.createMediaStreamDestination ? ctx.createMediaStreamDestination() : null;
  M.out.connect(ctx.destination); M.out.connect(M.an); if (M.rec) M.out.connect(M.rec);
  M.split = ctx.createChannelSplitter(2); M.anL = ctx.createAnalyser(); M.anR = ctx.createAnalyser(); M.anL.fftSize = M.anR.fftSize = 1024; M.out.connect(M.split); M.split.connect(M.anL, 0); M.split.connect(M.anR, 1);
  if (!isOffline() && PITCH_OK) { try { M.loud = new AudioWorkletNode(ctx, 'gw-loud', { numberOfInputs: 1, numberOfOutputs: 0 }); M.out.connect(M.loud); M.loud.port.onmessage = e => (M.loudData = e.data); } catch (e) { M.loud = null; } }
  M.click = ctx.createGain(); M.click.gain.value = 0.35; if (!isOffline()) M.click.connect(ctx.destination);
  M.cue = ctx.createGain(); M.cue.gain.value = 0.8; if (!isOffline()) M.cue.connect(ctx.destination);
}
function chain(src, devices, dest) {
  try { src.disconnect(); } catch (e) { }
  let prev = src;
  for (const d of devices) { const r = devRT(d); try { r.output.disconnect(); } catch (e) { } if (d.on) { prev.connect(r.input); prev = r.output; } }
  prev.connect(dest);
}
function rewireMaster() { chain(M.in, S.master.devices, M.out); M.out.gain.value = faderGain(S.master.vol); }
function buildBus(b, kind) {
  const r = { fader: ctx.createGain(), pan: ctx.createStereoPanner(), mute: ctx.createGain(), an: ctx.createAnalyser(), kind };
  r.an.fftSize = 1024; r.fader.connect(r.pan); r.pan.connect(r.mute); r.mute.connect(M.in); r.mute.connect(r.an);
  r.split = ctx.createChannelSplitter(2); r.anL = ctx.createAnalyser(); r.anR = ctx.createAnalyser(); r.anL.fftSize = r.anR.fftSize = 1024; r.mute.connect(r.split); r.split.connect(r.anL, 0); r.split.connect(r.anR, 1);
  if (kind === 'return') r.in = ctx.createGain();
  else {
    if (b.kind === 'midi') { r.inst = makeInstrument(b); r.in = r.inst.out; }
    else { r.in = ctx.createGain(); r.mon = ctx.createGain(); r.mon.gain.value = 0; r.mon.connect(r.in); }
    r.sA = ctx.createGain(); r.sB = ctx.createGain(); r.mute.connect(r.sA); r.mute.connect(r.sB);
    const ra = S.returns[0] && RT.get(S.returns[0].id), rb = S.returns[1] && RT.get(S.returns[1].id);
    if (ra) r.sA.connect(ra.in); if (rb) r.sB.connect(rb.in);
  }
  r.frz = ctx.createGain(); r.frz.connect(r.fader);
  RT.set(b.id, r); rewire(b); applyMix(b);
  return r;
}
function rewire(b) { if (b === S.master) return rewireMaster(); const r = RT.get(b.id); if (!r) return; if (b.frozen) { try { r.in.disconnect(); } catch (e) { } b.devices.forEach(d => { const x = DEV_RT.get(d.id); if (x) try { x.output.disconnect(); } catch (e) { } }); if (r.inst) r.inst.allOff(ctx.currentTime); return; } chain(r.in, b.devices, r.fader); }
const anySolo = () => S.tracks.some(t => t.solo);
function applyMix(b) {
  if (b === S.master) { if (M.out) sm(M.out.gain, faderGain(b.vol)); return; }
  const r = RT.get(b.id); if (!r) return;
  if (!b.auto.vol || !b.auto.vol.length) sm(r.fader.gain, faderGain(b.vol));
  if (!b.auto.pan || !b.auto.pan.length) sm(r.pan.pan, b.pan);
  if (r.sA) { sm(r.sA.gain, b.sendA); sm(r.sB.gain, b.sendB); }
  const isTrack = S.tracks.includes(b), audible = !b.mute && (!isTrack || !anySolo() || b.solo);
  sm(r.mute.gain, audible ? 1 : 0, 0.008);
  if (r.mon) sm(r.mon.gain, monitorOn(b) ? 1 : 0, 0.01);
}
const applyAllMix = () => allBuses().forEach(applyMix);
const faderGain = v => (v <= 0 ? 0 : Math.pow(v, 2) * 1.6);   // 0.79 ≈ 0 dB, 1 = +4 dB
const gainToFader = g => Math.sqrt(Math.max(0, g) / 1.6);
const faderDb = v => (v <= 0 ? '-inf' : gainToDb(faderGain(v)).toFixed(1));
function rebuildAll() {
  stopSources(ctx.currentTime);
  for (const r of RT.values()) { try { r.mute.disconnect(); r.in.disconnect(); } catch (e) { } if (r.inst) r.inst.allOff(ctx.currentTime); }
  RT.clear(); DEV_RT.forEach(d => d.dispose()); DEV_RT.clear();
  try { M.in.disconnect(); } catch (e) { }
  rewireMaster();
  S.returns.forEach(r => buildBus(r, 'return'));
  S.tracks.forEach(t => buildBus(t, 'track'));
  INPUTS.forEach(inp => connectInputs());
}
function removeBus(b) {
  const r = RT.get(b.id); if (!r) return; if (r.inst) r.inst.allOff(ctx.currentTime);
  try { r.mute.disconnect(); } catch (e) { }
  b.devices.forEach(d => { const x = DEV_RT.get(d.id); if (x) { x.dispose(); DEV_RT.delete(d.id); } });
  RT.delete(b.id);
}

/* ---------- automation ---------- */
// Parameters a bus exposes for automation: [{key,label,min,max,scale,fmt}]
function autoParams(b) {
  const out = [{ key: 'vol', label: 'Volume', min: 0, max: 1, fmt: v => faderDb(v) + ' dB' }];
  if (b === S.master) out.push({ key: 'tempo', label: 'Song Tempo', min: 40, max: 220, steps: true, fmt: v => v.toFixed(1) + ' BPM' });
  if (b !== S.master) out.push({ key: 'pan', label: 'Pan', min: -1, max: 1, fmt: v => Math.abs(v) < 0.01 ? 'C' : Math.round(Math.abs(v) * 50) + (v < 0 ? 'L' : 'R') });
  if (S.tracks.includes(b)) out.push({ key: 'sendA', label: 'Send A', min: 0, max: 1, fmt: fPct }, { key: 'sendB', label: 'Send B', min: 0, max: 1, fmt: fPct });
  if (b.kind === 'midi' && b.inst.type === 'synth') [['cutoff', 'Synth Cutoff', 40, 16000, 'log', fHz], ['res', 'Synth Reso', 0.3, 20, null, v => v.toFixed(1)], ['fenv', 'Synth Env', 0, 8000, null, fHz], ['gain', 'Synth Volume', 0, 1, null, fPct]].forEach(([k, l, a, z, sc, f]) => out.push({ key: 'inst:' + k, label: l, min: a, max: z, scale: sc, fmt: f }));
  if (b.kind === 'midi' && b.inst.type === 'sampler') out.push({ key: 'inst:filter', label: 'Sampler Filter', min: -1, max: 1, fmt: v => v.toFixed(2) });
  b.devices.forEach(d => (DEVICES[d.type].params || []).filter(p => p.min != null).forEach(p => out.push({ key: `dev:${d.id}:${p.k}`, label: `${DEVICES[d.type].name}: ${p.label}`, min: p.min, max: p.max, scale: p.scale, fmt: p.fmt })));
  b.devices.filter(d => d.type === 'eq').forEach(d => d.p.bands.forEach((band, i) => { out.push({ key: `eqf:${d.id}:${i}`, label: `Prism EQ ${i + 1} Freq`, min: 20, max: 20000, scale: 'log', fmt: fHz }); out.push({ key: `eqg:${d.id}:${i}`, label: `Prism EQ ${i + 1} Gain`, min: -18, max: 18, fmt: fDb }); }));
  return out;
}
function autoValue(pts, pos) {
  if (!pts || !pts.length) return null;
  if (pos <= pts[0].t) return pts[0].v; const last = pts[pts.length - 1]; if (pos >= last.t) return last.v;
  for (let i = 1; i < pts.length; i++) if (pos < pts[i].t) { const a = pts[i - 1], b = pts[i]; return a.v + (b.v - a.v) * (pos - a.t) / (b.t - a.t || 1); }
  return last.v;
}
function currentParam(b, key) {
  if (key === 'tempo') return bpmAt(nowPos());
  if (key === 'vol' || key === 'pan' || key === 'sendA' || key === 'sendB') return b[key];
  const [kind, id, k] = key.split(':');
  if (kind === 'inst') return b.inst[id];
  const d = b.devices.find(x => x.id === id); if (!d) return 0;
  if (kind === 'dev') return d.p[k]; if (kind === 'eqf') return d.p.bands[+k] ? d.p.bands[+k].f : 1000; if (kind === 'eqg') return d.p.bands[+k] ? d.p.bands[+k].g : 0;
  return 0;
}
// Apply automation for one window. AudioParams ramp to the window end; device parameters are set at window start.
function applyAutomation(b, from, to, first) {
  for (const key in b.auto) {
    const pts = b.auto[key]; if (!pts || !pts.length || key === 'tempo') continue;
    if (T.render && T.render.only === b.id && (key === 'sendA' || key === 'sendB' || (T.render.prefader && (key === 'vol' || key === 'pan')))) continue;
    if (T.render && T.render.only && b === S.master && key === 'vol') continue;
    const r = b === S.master ? { fader: M.out } : RT.get(b.id); if (!r) continue;
    const vEnd = autoValue(pts, to), tEnd = timeAt(to);
    const ramp = (param, val) => { if (first) { param.cancelScheduledValues(0); param.setValueAtTime(val(autoValue(pts, from)), Math.max(0, timeAt(from))); } param.linearRampToValueAtTime(val(vEnd), Math.max(ctx.currentTime, tEnd)); };
    if (key === 'vol') ramp(r.fader.gain, faderGain);
    else if (key === 'pan' && r.pan) ramp(r.pan.pan, v => v);
    else if (key === 'sendA' && r.sA) ramp(r.sA.gain, v => v);
    else if (key === 'sendB' && r.sB) ramp(r.sB.gain, v => v);
    else {
      const v = autoValue(pts, from), [kind, id, k] = key.split(':');
      if (kind === 'inst') { if (b.inst[id] !== v) { b.inst[id] = v; r.inst.update(); } }
      else { const d = b.devices.find(x => x.id === id); if (!d) continue; const dr = devRT(d);
        if (kind === 'dev') { if (d.p[k] !== v) { d.p[k] = v; dr.set(); } }
        else if (d.p.bands[+k]) { const band = d.p.bands[+k]; const f = kind === 'eqf' ? 'f' : 'g'; if (band[f] !== v) { band[f] = v; dr.set(); } } }
    }
  }
}
function releaseAutomation() { allBuses().forEach(b => { const r = b === S.master ? { fader: M.out } : RT.get(b.id); if (!r) return; ['fader', 'pan', 'sA', 'sB'].forEach(k => r[k] && r[k].gain && r[k].gain.cancelScheduledValues(0)); if (r.pan) r.pan.pan.cancelScheduledValues(0); applyMix(b); }); }

/* ---------- audio clips ---------- */
// Playback source for a clip at a given song tempo: buffer, rate, and buffer-seconds for a clip-local step x.
function clipPlayback(c, bpm = S.bpm) {
  const s = SAMPLES.get(c.sampleId); if (!s) return null;
  if (c.frozen || c.timebase === 'song') return { buf: s.buf, rate: 1, secAt: x => songSec(c.start - c.offset + x) - songSec(c.start - c.offset) };
  const P = Math.pow(2, c.semis / 12);
  if (c.warp) {
    const ratio = (c.srcBpm / bpm) * P, w = getWarped(c.sampleId, ratio);
    if (w) return { buf: w, rate: P, secAt: x => x * 15 / bpm * P };
    return { buf: s.buf, rate: P * bpm / c.srcBpm, secAt: x => x * 15 / c.srcBpm };   // repitched until the stretch is ready
  }
  return { buf: s.buf, rate: P, secAt: x => x * 15 / bpm * P };
}
const srcSecAt = (c, x) => (c.timebase === 'song' ? songSec(c.start - c.offset + x) - songSec(c.start - c.offset) : c.warp ? x * 15 / c.srcBpm : x * 15 / S.bpm * Math.pow(2, c.semis / 12)); // original-file seconds, for drawing
function clipNaturalLen(c) { const s = SAMPLES.get(c.sampleId); if (!s) return c.len; return c.warp ? s.buf.duration * c.srcBpm / 15 : s.buf.duration / Math.pow(2, c.semis / 12) * S.bpm / 15; }
// Crossfades: a clip's `xf` is the crossfade length with the clip that ends exactly where it starts.
const leftOf = (t, c) => t.clips.find(k => k !== c && k.type === 'audio' && Math.abs(k.start + k.len - c.start) < 1e-4);
const rightOf = (t, c) => t.clips.find(k => k !== c && k.type === 'audio' && Math.abs(c.start + c.len - k.start) < 1e-4);
// Where audio exists past the edit, the clips overlap across it; otherwise the fades happen inside the clips.
function xfInfo(t, c) {
  if (!c || !c.xf || c.xf <= 0) return null; const L = leftOf(t, c); if (!L || L.muted) return null;
  const half = Math.min(c.xf / 2, c.len / 2, L.len / 2); if (half <= 0) return null;
  const avail = Math.min(c.offset, L.timebase === 'song' ? 0 : Math.max(0, clipNaturalLen(L) - (L.offset + L.len)));
  const ext = Math.max(0, Math.min(half, avail)); return { ext, fade: ext + half };
}
const xfHalf = (t, c) => { const i = xfInfo(t, c); return i ? i.fade / 2 : 0; };
function clipEffSpan(t, c) { const i = xfInfo(t, c), R = rightOf(t, c), o = R && !R.muted ? xfInfo(t, R) : null; return { a: c.start - (i ? i.ext : 0), b: c.start + c.len + (o ? o.ext : 0), hin: i ? i.ext : 0, hout: o ? o.ext : 0, fin: i ? i.fade : 0, fout: o ? o.fade : 0 }; }
// Clip gain at song position p (piecewise linear in p): user fades, crossfades and clip gain.
function clipGainAt(c, p, sp) {
  const base = dbToGain(c.gain), end = c.start + c.len; let g = 1;
  if (sp.fin > 0) g = Math.min(g, clamp((p - (c.start - sp.hin)) / sp.fin, 0, 1)); else if (c.fadeIn > 0) g = Math.min(g, clamp((p - c.start) / c.fadeIn, 0, 1));
  if (sp.fout > 0) g = Math.min(g, clamp(((end + sp.hout) - p) / sp.fout, 0, 1)); else if (c.fadeOut > 0) g = Math.min(g, clamp((end - p) / c.fadeOut, 0, 1));
  return base * g;
}
function startAudio(t, c, pos, when) {
  if (c.muted || T.started.has(c.id)) return;
  const sp = c.frozen ? { a: c.start, b: c.start + c.len, hin: 0, hout: 0, fin: 0, fout: 0 } : clipEffSpan(t, c), { a, b, hin, hout } = sp;
  if (pos >= b - 1e-9) return; pos = Math.max(pos, a);
  const pb = clipPlayback(c, bpmAt(pos)); if (!pb) return;
  const segEnd = c.frozen ? b : Math.min(b, nextTempoChange(pos));      // tempo changes restart the source with the new stretch
  const off = pb.secAt(pos - c.start + c.offset); if (off >= pb.buf.duration || off < -1e-3) return;
  const r = RT.get(t.id); if (!r) return;
  const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = pb.buf; src.playbackRate.value = pb.rate;
  const w0 = Math.max(ctx.currentTime, when), at = p => w0 + durSec(pos, p - pos), dur = durSec(pos, segEnd - pos);
  const startsClip = pos <= a + 1e-6, endsClip = segEnd >= b - 1e-6;
  g.gain.setValueAtTime(startsClip ? 0 : clipGainAt(c, pos, sp), w0);
  if (startsClip) g.gain.linearRampToValueAtTime(clipGainAt(c, Math.min(segEnd, pos + 0.01), sp), at(Math.min(segEnd, pos + 0.01)));
  const end = c.start + c.len;
  [c.start - hin, sp.fin ? c.start - hin + sp.fin : c.start + c.fadeIn, sp.fout ? end + hout - sp.fout : end - c.fadeOut, end + hout]
    .filter(p => p > pos + 0.01 && p < segEnd - 1e-6).sort((x, y) => x - y)
    .forEach(p => g.gain.linearRampToValueAtTime(clipGainAt(c, p, sp), at(p)));
  g.gain.linearRampToValueAtTime(endsClip ? 0 : clipGainAt(c, segEnd, sp), w0 + dur);
  src.connect(g); g.connect(c.frozen ? r.frz : r.in);
  src.start(w0, Math.max(0, off), dur * pb.rate + 0.01); src.stop(w0 + dur + 0.02);
  const h = { src, g, clip: c }; T.srcs.push(h); src.onended = () => { T.srcs = T.srcs.filter(x => x !== h); };
  T.started.add(c.id);
}
// What a track plays from the timeline: its clips, or its frozen render.
const frozenClip = t => (t.frozen ? { id: 'frz-' + t.id, type: 'audio', frozen: true, sampleId: t.frozen.sid, start: 0, len: t.frozen.len, offset: 0, gain: 0, semis: 0, warp: false, srcBpm: S.bpm, fadeIn: 0, fadeOut: 0 } : null);
const audioClipsOf = t => (t.frozen ? [frozenClip(t)] : t.kind === 'audio' ? t.clips : []);
function startAudioAt(pos, when) {
  S.tracks.forEach(t => audioClipsOf(t).forEach(c => { const sp = c.frozen ? { a: c.start, b: c.start + c.len } : clipEffSpan(t, c); if (sp.a <= pos && pos < sp.b) startAudio(t, c, pos, when); }));
}
function stopSources(at) { T.srcs.forEach(h => { try { hold(h.g.gain, at); h.g.gain.setTargetAtTime(0, at, 0.004); h.src.stop(at + 0.03); } catch (e) { } }); T.srcs = []; }

/* ---------- scheduler ---------- */
function scheduleWindow(from, to) {
  const first = from === T.firstPos;
  for (const t of S.tracks) {
    if (t.kind === 'midi' && !t.frozen) {
      const inst = RT.get(t.id) && RT.get(t.id).inst; if (!inst) continue;
      for (const c of t.clips) {
        if (c.muted || c.start + c.len <= from || c.start >= to) continue;
        const L = c.bars * 16, base = c.start - c.offset, end = c.start + c.len;
        for (const n of c.notes) {
          if (n.s >= L) continue;
          const k0 = Math.ceil((Math.max(from, c.start) - base - n.s) / L - 1e-9);
          for (let k = k0; ; k++) {
            const p = base + n.s + k * L; if (p >= to - 1e-9 || p >= end - 1e-9) break; if (p < from - 1e-9 || p < c.start - 1e-9) continue;
            if (n.c != null && n.c < 1 && Math.random() > n.c) continue;
            const dur = Math.min(n.l, end - p, L - n.s);
            inst.noteOn(n.p, Math.max(ctx.currentTime, timeAt(p)), n.v, durSec(p, dur) * 0.98);
          }
        }
      }
    } else if (!(T.recording && t.arm && t.kind === 'audio' && T.recording.audio.some(r => r.t === t))) {
      for (const c of audioClipsOf(t)) { const sp = c.frozen ? { a: c.start } : clipEffSpan(t, c); if (sp.a >= from - 1e-9 && sp.a < to - 1e-9) startAudio(t, c, sp.a, timeAt(sp.a)); }
      // at a tempo change, clips that are already playing restart with the new stretch
      for (const p of tempoChangesIn(from - 1e-9, to)) for (const c of audioClipsOf(t)) { const sp = c.frozen ? { a: c.start, b: c.start + c.len } : clipEffSpan(t, c); if (sp.a < p && p < sp.b) { T.started.delete(c.id); startAudio(t, c, p, timeAt(p)); } }
    }
    applyAutomation(t, from, to, first);
  }
  S.returns.forEach(b => applyAutomation(b, from, to, first)); applyAutomation(S.master, from, to, first);
  if ((S.metro || T.countUntil != null) && !isOffline()) { const bt = BEAT(), bar = SPB(); for (let b = Math.ceil(from / bt - 1e-9) * bt; b < to - 1e-9; b += bt) click(timeAt(b), Math.abs(((b % bar) + bar) % bar) < 1e-6); }
}
function tick(lookahead = 0.12) {
  if (!T.playing) return;
  let end = posAt(ctx.currentTime + lookahead), guard = 0;
  while (T.nextPos < end && guard++ < 4096) {
    const from = T.nextPos; let to = Math.min(end, Math.floor(from + 1e-9) + 1);
    if (T.countUntil != null) { // count-in: clicks only, then start the song at the record position
      if (from < T.countUntil - 1e-9) { to = Math.min(to, T.countUntil); if (!isOffline()) { const bt = BEAT(), bar = SPB(); for (let b = Math.ceil(from / bt - 1e-9) * bt; b < to - 1e-9; b += bt) click(timeAt(b), Math.abs(((b - T.countUntil) % bar + bar) % bar) < 1e-6); } T.nextPos = to; continue; }
      const p0 = T.countUntil; T.countUntil = null; T.firstPos = p0; T.started.clear(); startAudioAt(p0, timeAt(p0));
    }
    const L = S.loop, looping = L.on && L.end > L.start && from < L.end - 1e-9;
    if (looping && to > L.end) to = L.end;
    scheduleWindow(from, to); T.nextPos = to;
    if (looping && Math.abs(to - L.end) < 1e-9) {
      const wrapT = timeAt(L.end);
      stopSources(wrapT); S.tracks.forEach(t => { const r = RT.get(t.id); if (r && r.inst) r.inst.allOff(wrapT); });
      T.anchorTime = wrapT; T.anchorPos = L.start; T.nextPos = L.start; T.firstPos = L.start; T.started.clear();
      startAudioAt(L.start, wrapT); end = posAt(ctx.currentTime + lookahead);
      if (T.recording) { T.recording.passes++; T.recording.wraps.push(wrapT); }
    }
  }
}
setInterval(() => { if (!isOffline()) tick(); }, 25);
function click(time, accent) {
  const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = accent ? 1600 : 1050;
  g.gain.setValueAtTime(0.6, time); g.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
  o.connect(g); g.connect(M.click); o.start(time); o.stop(time + 0.05);
}

/* ---------- transport ---------- */
function play(from = V.insert) {
  if (ctx.state !== 'running') ctx.resume();
  if (T.playing) stop(true);
  const count = T.rec && S.prefs && S.prefs.countIn ? S.prefs.countIn * SPB() : 0;
  T.playing = true; T.anchorTime = ctx.currentTime + 0.06; T.anchorPos = from - count; T.nextPos = from - count; T.firstPos = from; T.started.clear();
  T.countUntil = count ? from : null;
  if (!count) startAudioAt(from, T.anchorTime);
  if (T.rec) startRecording(from);
  tick(); ui.transport();
}
function stop(silent) {
  const now = ctx.currentTime; T.stopPos = posAt(now);
  if (T.recording) finishRecording();
  T.playing = false; stopSources(now);
  S.tracks.forEach(t => { const r = RT.get(t.id); if (r && r.inst) r.inst.allOff(now); });
  releaseAutomation();
  if (!silent) { ui.transport(); arr.draw(); }
}
function togglePlay() { T.playing ? stop() : play(); }
function continuePlay() { play(T.playing ? nowPos() : T.stopPos || V.insert); }
function seek(pos) { pos = Math.max(0, pos); V.insert = pos; if (T.playing) play(pos); else arr.draw(); }
function setBpm(b) {
  b = clamp(Math.round(b * 100) / 100, 20, 300); if (b === S.bpm) return;
  const was = T.playing, p = nowPos(); if (was) stop(true);
  S.tracks.forEach(t => t.clips.forEach(c => { if (c.type === 'audio' && !c.warp) { const k = b / S.bpm; c.start = c.start; c.len *= k; c.offset *= k; c.fadeIn *= k; c.fadeOut *= k; } }));
  S.bpm = b; DEV_RT.forEach(d => d.onTempo());
  S.tracks.forEach(t => { const r = RT.get(t.id); if (r && r.inst && r.inst.prepare) r.inst.prepare(); });
  if (was) play(p);
  markDirty(); ui.transport(); arr.draw();
}

/* ---------- audio input & recording ---------- */
const INPUTS = new Map(); // deviceId -> {stream, src}
async function getInput(deviceId = 'default') {
  if (INPUTS.has(deviceId)) return INPUTS.get(deviceId);
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: deviceId === 'default' ? undefined : { exact: deviceId }, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 } });
  const inp = { stream, src: LIVE_CTX.createMediaStreamSource(stream) }; INPUTS.set(deviceId, inp); connectInputs(); return inp;
}
const monitorOn = t => t.kind === 'audio' && (t.monitor === 'in' || (t.monitor === 'auto' && t.arm));
function connectInputs() {
  if (isOffline()) return;
  INPUTS.forEach(inp => { try { inp.src.disconnect(); } catch (e) { } });
  S.tracks.forEach(t => { if (t.kind !== 'audio') return; const inp = INPUTS.get(t.input || 'default'); const r = RT.get(t.id); if (inp && r && r.mon) inp.src.connect(r.mon); });
}
async function armTrack(t, on) {
  t.arm = on;
  if (on && t.kind === 'audio') { try { await getInput(t.input); } catch (e) { t.arm = false; toast('Studio B could not open the audio input. Check the microphone permission and input device in Settings.'); } }
  applyMix(t); ui.headers();
}
function startRecording(from) {
  const R = { from, startTime: timeAt(from), audio: [], midi: [], passes: 0, wraps: [], held: new Map(), loop: { ...S.loop }, punch: { ...(S.punch || {}) } };
  S.tracks.filter(t => t.arm && t.kind === 'audio' && !t.frozen).forEach(t => {
    const inp = INPUTS.get(t.input || 'default'); if (!inp || !PITCH_OK) return;
    const node = new AudioWorkletNode(LIVE_CTX, 'gw-rec', { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2, channelCountMode: 'explicit' });
    const sink = LIVE_CTX.createGain(); sink.gain.value = 0; node.connect(sink); sink.connect(LIVE_CTX.destination);
    inp.src.connect(node);
    const rec = { t, node, sink, inp, L: [], R: [], n: 0, peaks: [], startAt: null };
    node.port.onmessage = e => { if (rec.startAt == null) rec.startAt = ctx.currentTime - e.data.L.length / ctx.sampleRate; rec.L.push(e.data.L); rec.R.push(e.data.R); rec.n += e.data.L.length; let m = 0; for (let i = 0; i < e.data.L.length; i += 64) { const v = Math.abs(e.data.L[i]); if (v > m) m = v; } rec.peaks.push(m); };
    setTimeout(() => node.port.postMessage({ on: true }), Math.max(0, R.startTime - ctx.currentTime) * 1000);
    R.audio.push(rec);
  });
  S.tracks.filter(t => t.arm && t.kind === 'midi' && !t.frozen).forEach(t => R.midi.push({ t, notes: [] }));
  if (!R.audio.length && !R.midi.length) { toast('Arm a track to record into it. Use the ● button in the track header.'); T.rec = false; ui.transport(); return; }
  T.recording = R;
}
// Trim a clip to [a,b); returns null when nothing is left.
function cropClip(c, a, b) {
  const s = Math.max(c.start, a), e = Math.min(c.start + c.len, b); if (e - s < 1e-3) return null;
  const k = deep(c); k.id = uid(); k.offset = c.offset + (s - c.start); k.start = s; k.len = e - s; if (s > c.start) k.fadeIn = 0; if (e < c.start + c.len) k.fadeOut = 0; return k;
}
function finishRecording() {
  const R = T.recording; T.recording = null; if (!R) return;
  const stopTime = ctx.currentTime, endPos = posAt(stopTime); pushUndo('Record');
  const pa = R.punch.in ? R.loop.start : -Infinity, pb = R.punch.out ? R.loop.end : Infinity;
  // song span covered by each recording pass: the first runs from the record position, later ones are loop passes
  const passes = []; const times = [R.startTime, ...R.wraps, stopTime];
  for (let k = 0; k < times.length - 1; k++) { const p0 = k === 0 ? R.from : R.loop.start; passes.push({ t0: times[k], t1: times[k + 1], p0, p1: songPos(songSec(p0) + (times[k + 1] - times[k])) }); }
  for (const rec of R.audio) {
    rec.node.port.postMessage({ on: false });
    setTimeout(() => {
      try { rec.inp.src.disconnect(rec.node); } catch (e) { } rec.node.disconnect(); rec.sink.disconnect();
      if (!rec.n) return;
      const lat = (S.prefs && S.prefs.latencyMs != null ? S.prefs.latencyMs : Math.round(((LIVE_CTX.baseLatency || 0) + (LIVE_CTX.outputLatency || 0)) * 1000)) / 1000;
      const sr = LIVE_CTX.sampleRate, skip = Math.max(0, Math.round(lat * sr)), len = Math.max(1, rec.n - skip);
      const buf = LIVE_CTX.createBuffer(2, len, sr);
      [rec.L, rec.R].forEach((chunks, ch) => { const d = buf.getChannelData(ch); let o = -skip; for (const c of chunks) { for (let i = 0; i < c.length; i++, o++) if (o >= 0 && o < len) d[o] = c[i]; } });
      const t = rec.t, n = (t.takeCount = (t.takeCount || 0) + 1), bpm = bpmAt(R.from);
      const sid = addSample(buf, `${t.name} rec ${n}`, { recorded: true, path: null }); SAMPLES.get(sid).bpm = bpm;
      const t0 = rec.startAt != null ? rec.startAt : R.startTime;
      const clips = passes.map((ps, k) => {
        const offSec = ps.t0 - t0; const c = newAudioClip(sid, ps.p0, ps.p1 - ps.p0); c.srcBpm = bpm; c.warp = true;
        c.offset = Math.max(0, offSec) * bpm / 15; if (offSec < 0) { const sh = -offSec * bpm / 15; c.start += sh; c.len -= sh; }
        c.name = passes.length > 1 ? `${t.name} ${n}.${k + 1}` : `${t.name} take ${n}`; return cropClip(c, pa, pb);
      }).filter(c => c && c.len > 0.05);
      if (!clips.length) return;
      const a = Math.min(...clips.map(c => c.start)), b = Math.max(...clips.map(c => c.start + c.len));
      const before = t.clips.map(c => cropClip(c, a, b)).filter(Boolean);
      // take lanes keep every pass (and what was there before) so you can comp later
      if (clips.length > 1 || before.length) {
        t.takes = t.takes || [];
        if (before.length && !t.takes.some(l => l.name === 'Before take ' + n)) t.takes.push({ id: uid(), name: 'Before take ' + n, clips: before.map(c => ({ ...deep(c), id: uid() })) });
        clips.forEach((c, k) => t.takes.push({ id: uid(), name: clips.length > 1 ? `Take ${n}.${k + 1}` : `Take ${n}`, clips: [{ ...deep(c), id: uid() }] }));
        t.showTakes = true;
      }
      // main lane: the first pass, then the last complete loop pass on top
      const full = clips.filter((c, k) => k > 0 && c.len >= (R.loop.end - R.loop.start) * 0.9);
      const main = [clips[0], ...(full.length ? [full[full.length - 1]] : clips.length > 1 ? [clips[clips.length - 1]] : [])];
      main.forEach(c => { const k = { ...deep(c), id: uid() }; clearRange(t, k.start, k.start + k.len); t.clips.push(k); });
      markDirty(); ui.all();
    }, 140);
  }
  for (const m of R.midi) {
    R.held.forEach(h => { if (h.t === m.t) m.notes.push({ p: h.note, abs: h.pos, l: Math.max(0.25, endPos - h.pos), vel: h.vel }); });
    const notes = m.notes.filter(x => x.abs >= pa - 1e-6 && x.abs < pb); if (!notes.length) continue;
    const bar = SPB(), a = Math.floor(Math.min(...notes.map(x => x.abs)) / bar) * bar, b = Math.ceil(Math.max(...notes.map(x => x.abs + x.l)) / bar) * bar;
    const c = newMidiClip(a, Math.max(bar, b - a), 'Recorded'); c.bars = Math.max(bar, b - a) / 16;
    c.notes = notes.map(x => ({ p: x.p, s: Math.round((x.abs - a) * 4) / 4, l: Math.max(0.25, Math.round(x.l * 4) / 4), v: x.vel != null ? x.vel : x.v, c: 1 })).sort((x, y) => x.s - y.s);
    clearRange(m.t, c.start, c.start + c.len); m.t.clips.push(c); markDirty();
  }
  arr.draw(); ui.detail();
}
// Comping: copy the part of a take lane inside [a,b) onto the track's main lane.
function compRange(t, lane, a, b) {
  const parts = lane.clips.map(c => cropClip(c, a, b)).filter(Boolean); if (!parts.length) return false;
  pushUndo('Comp'); clearRange(t, a, b); parts.forEach(p => t.clips.push(p)); markDirty(); return true;
}
// Is this part of a take lane what the main lane is playing? (same file, same alignment)
function compActive(t, k, p) { return t.clips.some(m => m.sampleId === k.sampleId && p >= m.start - 1e-6 && p < m.start + m.len && Math.abs((m.offset - m.start) - (k.offset - k.start)) < 1e-3); }
// Recording replaces what was underneath it on the track.
function punchIn(t, c) { clearRange(t, c.start, c.start + c.len); }

/* ---------- live notes (computer keyboard / MIDI) ---------- */
const held = new Map();
function liveTarget() { const t = S.tracks.find(x => x.arm && x.kind === 'midi') || S.tracks.find(x => V.selTracks.has(x.id) && x.kind === 'midi'); return t; }
function liveNoteOn(key, note, vel = 0.85, t = liveTarget()) {
  if (!t || t.kind !== 'midi') return; if (ctx.state !== 'running') ctx.resume();
  const v = RT.get(t.id).inst.noteOn(note, ctx.currentTime, vel, null);
  const h = { v, t, note, vel, pos: T.playing ? posAt(ctx.currentTime) : null }; held.set(key, h);
  if (T.recording) T.recording.held.set(key, h);
}
function liveNoteOff(key) {
  const h = held.get(key); if (!h) return; held.delete(key);
  RT.get(h.t.id) && RT.get(h.t.id).inst.noteOff(h.v, ctx.currentTime);
  const R = T.recording; if (R && h.pos != null) { R.held.delete(key); const m = R.midi.find(x => x.t === h.t); if (m) m.notes.push({ p: h.note, abs: h.pos, l: Math.max(0.25, posAt(ctx.currentTime) - h.pos), vel: h.vel }); }
}

/* ---------- editing primitives ---------- */
// Remove everything in [a,b) on a track, splitting clips that cross the edges.
function clearRange(t, a, b) {
  const out = [];
  for (const c of t.clips) {
    const e = c.start + c.len;
    if (e <= a || c.start >= b) { out.push(c); continue; }
    if (c.start < a) { const l = deep(c); l.id = c.id; l.len = a - c.start; out.push(l); }
    if (e > b) { const r = deep(c); r.id = uid(); r.offset = c.offset + (b - c.start); r.start = b; r.len = e - b; out.push(r); }
  }
  t.clips = out;
}
function splitClip(t, c, at) {
  if (at <= c.start + 1e-6 || at >= c.start + c.len - 1e-6) return null;
  const r = deep(c); r.id = uid(); r.offset = c.offset + (at - c.start); r.start = at; r.len = c.start + c.len - at;
  if (c.type === 'audio') { r.fadeIn = 0; c.fadeOut = 0; }
  c.len = at - c.start; t.clips.push(r); return r;
}
// Turn a MIDI clip's loop + offset into plain notes covering its whole length (used by consolidate and crop).
function flattenMidi(c) {
  const L = c.bars * 16, out = [];
  for (let k = Math.floor(c.offset / L) - 1; k * L - c.offset < c.len; k++) c.notes.forEach(n => { const s = n.s + k * L - c.offset; if (s >= -1e-9 && s < c.len - 1e-9) out.push({ ...n, s, l: Math.min(n.l, c.len - s) }); });
  return out;
}

/* ---------- undo ---------- */
const UNDO = [], REDO = [];
const snapProject = () => JSON.stringify({ ...S, view: undefined });
function pushUndo(label) { UNDO.push(snapProject()); if (UNDO.length > 200) UNDO.shift(); REDO.length = 0; markDirty(); }
function restore(json) {
  const was = T.playing, p = nowPos(); if (was) stop(true);
  const keepView = S.view; S = JSON.parse(json); S.view = keepView;
  rebuildAll(); V.selClips.clear(); if (V.editClip && !clipById(V.editClip)) V.editClip = null;
  ui.all(); if (was) play(p);
}
function undo() { if (!UNDO.length) return toast('Nothing to undo'); REDO.push(snapProject()); restore(UNDO.pop()); markDirty(); }
function redo() { if (!REDO.length) return; UNDO.push(snapProject()); restore(REDO.pop()); markDirty(); }
function markDirty() { V.dirty = true; ui.title && ui.title(); }
window.SB_isDirty = () => V.dirty;
