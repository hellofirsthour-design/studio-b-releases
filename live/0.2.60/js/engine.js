/* ============ Studio B engine: project model, audio graph, timeline transport ============
   Time unit everywhere: steps (sixteenth notes). A bar of 4/4 = 16 steps. */
let S = null;               // project (saved)
const RT = new Map();       // bus id -> runtime nodes
const M = {};               // main bus runtime
const T = { playing: false, anchorTime: 0, anchorPos: 0, nextPos: 0, rec: false, srcs: [], started: new Set(), recording: null, stopPos: 0, countUntil: null };
const V = { insert: 0, pps: 6, scrollX: 0, scrollY: 0, selClips: new Set(), selTracks: new Set(), time: null, editClip: null, detail: 'devices', autoMode: false, follow: true, browser: true, grid: 0, snap: true, dirty: false };
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
  if (typeof INST2_DEF !== 'undefined' && INST2_DEF[type]) return INST2_DEF[type]();
  if (type === 'drums') return { type, pads: ['Kick', 'Snare', 'Clap', 'Closed Hat', 'Open Hat', 'Tom', 'Rim', 'Shaker'].map(k => ({ kind: k, tune: 0, decay: 1, level: 0.85, pan: 0, sampleId: null })) };
  if (type === 'sampler') return { type, sampleId: null, cues: [], semis: 0, sync: true, stretch: true, srcBpm: 0, mode: 'pads', keyCue: 0, oneShot: 'cue', choke: true, gain: 0.8, attack: 0.002, release: 0.02, filter: 0 };
  return { type: 'synth', ...SYNTH_DEFAULT, ...SYNTH_PRESETS.Keys, preset: 'Keys' };
}
const newMidiClip = (start, len, name = 'MIDI') => ({ id: uid(), type: 'midi', start, len, offset: 0, name, muted: false, bars: Math.max(0.25, len / 16), notes: [] });
const newAudioClip = (sid, start, len) => { const s = SAMPLES.get(sid); return { id: uid(), type: 'audio', sampleId: sid, start, len, offset: 0, name: s ? s.name : 'Audio', muted: false, gain: 0, semis: 0, warp: true, srcBpm: s && s.bpm ? s.bpm : S.bpm, fadeIn: 0, fadeOut: 0 }; };
function newBusLike(name, devs) { return { id: uid(), name, color: '#a7a3b8', vol: 0.79, pan: 0, mute: false, devices: devs, auto: {}, autoShow: 'vol', h: 40 }; }
function emptyProject() {
  const keep = S;
  S = { v: 1, name: 'Untitled', path: null, bpm: (typeof GP !== 'undefined' && GP.bpm) || 120, root: 0, scale: 'minor', metro: false, loop: { on: false, start: 0, end: 64 }, markers: [], tracks: [],
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
  [M.out, M.click, M.cue, M.loud].forEach(n => { if (n) try { n.disconnect(); } catch (e) { } });
  M.in = ctx.createGain(); M.out = ctx.createGain(); M.an = ctx.createAnalyser(); M.an.fftSize = isOffline() ? 32 : 4096; M.direct = ctx.createDelay(2); M.direct.connect(M.in);
  M.rec = !isOffline() && ctx.createMediaStreamDestination ? ctx.createMediaStreamDestination() : null;
  M.out.connect(liveOut('main')); M.out.connect(M.an); if (M.rec) M.out.connect(M.rec);
  M.split = ctx.createChannelSplitter(2); M.anL = ctx.createAnalyser(); M.anR = ctx.createAnalyser(); M.anL.fftSize = M.anR.fftSize = isOffline() ? 32 : 4096; M.out.connect(M.split); M.split.connect(M.anL, 0); M.split.connect(M.anR, 1);
  if (!isOffline() && PITCH_OK) { try { M.loud = new AudioWorkletNode(ctx, 'gw-loud', { numberOfInputs: 1, numberOfOutputs: 0 }); M.out.connect(M.loud); M.loud.port.onmessage = e => (M.loudData = e.data); } catch (e) { M.loud = null; } }
  M.click = ctx.createGain(); M.click.gain.value = 0.35; if (!isOffline()) M.click.connect(GP.clickCue ? liveOut('cue') : liveOut('main'));
  M.cue = ctx.createGain(); M.cue.gain.value = 0.8; if (!isOffline()) M.cue.connect(liveOut('cue'));
}
function chain(src, devices, dest) {
  try { src.disconnect(); } catch (e) { }
  let prev = src;
  for (const d of devices) { const r = devRT(d); try { r.output.disconnect(); } catch (e) { } if (d.on) { prev.connect(r.input); prev = r.output; } }
  prev.connect(dest);
}
function rewireMaster() { chain(M.in, S.master.devices, M.out); M.out.gain.value = faderGain(S.master.vol); }
/* sends: any number of returns (up to 12). Sends A and B keep their old field names. */
const sendOf = (b, i) => (b.sends && b.sends[i] != null ? b.sends[i] : i === 0 ? b.sendA || 0 : i === 1 ? b.sendB || 0 : 0);
function setSend(b, i, v) { b.sends = b.sends || [b.sendA || 0, b.sendB || 0]; while (b.sends.length <= i) b.sends.push(0); b.sends[i] = v; if (i === 0) b.sendA = v; if (i === 1) b.sendB = v; }
// Pre/post fader per send (Pro Tools style); when a send has no setting of its own it follows its return's Pre switch.
const sendPre = (b, i) => (b.sendPre && b.sendPre[i] != null ? !!b.sendPre[i] : !!(S.returns[i] || {}).pre);
const sendKey = i => (i === 0 ? 'sendA' : i === 1 ? 'sendB' : 'send:' + i);
const sendIndex = k => (k === 'sendA' ? 0 : k === 'sendB' ? 1 : k.startsWith('send:') ? +k.slice(5) : -1);
const RET_LETTERS = 'ABCDEFGHIJKL';
/* groups */
const groupOf = b => (b && b.group ? S.tracks.find(t => t.id === b.group && t.kind === 'group') : null);
const ancestors = b => { const out = []; let g = groupOf(b); while (g && !out.includes(g)) { out.push(g); g = groupOf(g); } return out; };
const descendants = g => S.tracks.filter(t => ancestors(t).includes(g));
const depthOf = b => ancestors(b).length;
const hiddenByFold = b => ancestors(b).some(g => g.fold);
function routeOut(b) {
  const r = RT.get(b.id); if (!r || b === S.master) return; const g = groupOf(b), ext = extParse(b.out), isRet = S.returns.includes(b);
  const dest = b.out === 'none' ? null : ext ? (IO.native && !isOffline() ? extOutNode(b.out) : null) : g && RT.get(g.id) ? RT.get(g.id).in : isRet ? M.in : (M.direct || M.in);
  if (r.outDest === dest) return; if (r.outDest) try { r.mute.disconnect(r.outDest); } catch (e) { } if (dest) r.mute.connect(dest); r.outDest = dest;
}
function buildBus(b, kind) {
  const r = { fader: ctx.createGain(), pan: ctx.createStereoPanner(), dly: ctx.createDelay(2), mute: ctx.createGain(), an: ctx.createAnalyser(), pre: ctx.createGain(), preMute: ctx.createGain(), kind };
  r.an.fftSize = isOffline() ? 32 : 4096; r.pre.connect(r.fader); r.fader.connect(r.pan); r.pan.connect(r.dly); r.dly.connect(r.mute); r.mute.connect(r.an); r.pre.connect(r.preMute);
  RT.set(b.id, r); routeOut(b);
  r.split = ctx.createChannelSplitter(2); r.anL = ctx.createAnalyser(); r.anR = ctx.createAnalyser(); r.anL.fftSize = r.anR.fftSize = isOffline() ? 32 : 4096; r.mute.connect(r.split); r.split.connect(r.anL, 0); r.split.connect(r.anR, 1);
  if (kind === 'return' || b.kind === 'group') r.in = ctx.createGain();
  else if (b.kind === 'midi') { r.inst = makeInstrument(b); r.in = r.inst.out; }
  else { r.in = ctx.createGain(); r.mon = ctx.createGain(); r.mon.gain.value = 0; r.mon.connect(r.in); }
  if (kind !== 'return') {
    r.sends = S.returns.map((ret, i) => { const g = ctx.createGain(); g.gain.value = 0; (sendPre(b, i) ? r.preMute : r.mute).connect(g); const rr = RT.get(ret.id); if (rr) g.connect(rr.in); return g; });
    r.sA = r.sends[0]; r.sB = r.sends[1];
  }
  r.frz = ctx.createGain(); r.frz.connect(r.pre);
  RT.set(b.id, r); rewire(b); applyMix(b);
  return r;
}
// Feed each sidechained compressor from its source bus (post-fader).
function wireSidechains() {
  allBuses().forEach(b => b.devices.forEach(d => { if (d.type !== 'comp' && d.type !== 'iron') return; const r = DEV_RT.get(d.id); if (!r || !r.sc) return;
    if (r.scSrc) { try { r.scSrc.disconnect(r.sc); } catch (e) { } r.scSrc = null; }
    const src = d.p.sc && RT.get(d.p.sc); if (src) { src.mute.connect(r.sc, 0, 1); r.scSrc = src.mute; } }));
}
function rewire(b) { if (!isOffline()) schedulePDC(); if (NE.on && !isOffline()) setTimeout(neSyncProject, 0); if (b && b._rack) return rackRebuild(b._rack); if (b === S.master) return rewireMaster(); const r = RT.get(b.id); if (!r) return; if (b.frozen) { try { r.in.disconnect(); } catch (e) { } b.devices.forEach(d => { const x = DEV_RT.get(d.id); if (x) try { x.output.disconnect(); } catch (e) { } }); if (r.inst) r.inst.allOff(ctx.currentTime); return; } chain(r.in, b.devices, r.pre); }
const anySolo = () => S.tracks.some(t => t.solo) || (S.vcas || []).some(v => v.solo && vcaMembers(v).length);
/* VCAs, as in Pro Tools: a fader with no audio of its own. Its level scales every member's fader, and its mute and solo
   mute and solo the members. Mix groups link their members' faders (relative, in dB), mutes and solos. */
const vcaOf = b => (b && b.vca ? (S.vcas || []).find(v => v.id === b.vca) || null : null);
const vcaMembers = v => allBuses().filter(b => b.vca === v.id);
const vcaGain = b => { const v = vcaOf(b); return v ? faderGain(v.vol) / faderGain(0.79) : 1; };
const mixGroupOf = b => (b && b.mg ? (S.mixGroups || []).find(g => g.id === b.mg) || null : null);
let LINK_SUSPEND = false;   // hold Ctrl/Cmd while moving a control to move just that channel
document.addEventListener('pointerdown', e => { LINK_SUSPEND = !!(e.ctrlKey || e.metaKey); }, true);
const groupMates = b => { const g = mixGroupOf(b); return g && g.on !== false && !LINK_SUSPEND ? allBuses().filter(x => x !== b && x.mg === g.id) : []; };
// The other members follow a fader move by the same number of dB (a member at -inf stays there).
function linkVol(b, oldVol) {
  if (oldVol <= 0) return []; const d = gainToDb(faderGain(b.vol)) - gainToDb(faderGain(oldVol)); if (!isFinite(d) || Math.abs(d) < 1e-9) return [];
  const mates = groupMates(b); mates.forEach(m => { if (m.vol <= 0) return; m.vol = clamp(gainToFader(dbToGain(gainToDb(faderGain(m.vol)) + d)), 0, 1); applyMix(m); autoTouch(m, 'vol', m.vol); refreshVolUI(m); }); return mates;
}
function linkFlag(b, key) { groupMates(b).forEach(m => { m[key] = b[key]; }); }
function refreshVolUI(b) {
  const hv = document.querySelector(`.hdr[data-id="${b.id}"] .hvol`); if (hv) { hv.value = b.vol; if (typeof syncRange === 'function') syncRange(hv); }
  const hd = document.querySelector(`[data-db="${b.id}"]`); if (hd) hd.textContent = faderDb(b.vol);
  const mv = document.querySelector(`#mixer .mxs[data-id="${b.id}"] .mxvol`); if (mv) mv.value = b.vol;
  const md = document.querySelector(`#mixer .mxs[data-id="${b.id}"] .mxdb`); if (md) md.value = faderDb(b.vol);
}
// A bus is heard when nothing is soloed, or it, a group around it, or a track inside it is soloed.
const soloPath = b => b.solo || ancestors(b).some(g => g.solo || (vcaOf(g) || {}).solo) || (vcaOf(b) || {}).solo || (b.kind === 'group' && descendants(b).some(t => t.solo || (vcaOf(t) || {}).solo));
function applyMix(b) {
  if (b === S.master) { if (M.out) sm(M.out.gain, faderGain(b.vol)); return; }
  const r = RT.get(b.id); if (!r) return;
  if (!autoActive(b, 'vol')) sm(r.fader.gain, faderGain(b.vol) * vcaGain(b));
  if (!autoActive(b, 'pan')) sm(r.pan.pan, b.pan);
  if (r.sends) r.sends.forEach((g, i) => { const k = sendKey(i); if (!autoActive(b, k)) sm(g.gain, sendOf(b, i)); });
  const isTrack = S.tracks.includes(b), audible = !b.mute && !(vcaOf(b) || {}).mute && !ancestors(b).some(g => g.mute || (vcaOf(g) || {}).mute) && (!isTrack || !anySolo() || soloPath(b));
  sm(r.mute.gain, audible ? 1 : 0, 0.008); sm(r.preMute.gain, audible ? 1 : 0, 0.008);
  const off = Math.max(0, ...S.tracks.map(t => -(t.delayMs || 0))) / 1000; sm(r.dly.delayTime, clamp(((isTrack ? b.delayMs || 0 : 0) / 1000) + off + (b._pdc || 0), 0, 1.99), 0.02);
  if (r.mon) sm(r.mon.gain, monitorOn(b) ? 1 : 0, 0.01);
}
const applyAllMix = () => allBuses().forEach(applyMix);
const faderGain = v => (v <= 0 ? 0 : Math.pow(v, 2) * 1.6);   // 0.79 ≈ 0 dB, 1 = +4 dB
const gainToFader = g => Math.sqrt(Math.max(0, g) / 1.6);
const faderDb = v => (v <= 0 ? '-inf' : gainToDb(faderGain(v)).toFixed(1));
function rebuildAll() {
  stopSources(ctx.currentTime);
  for (const r of RT.values()) { try { r.mute.disconnect(); r.in.disconnect(); } catch (e) { } if (r.inst) { r.inst.allOff(ctx.currentTime); if (r.inst.dispose) r.inst.dispose(); } }
  RT.clear(); DEV_RT.forEach(d => d.dispose()); DEV_RT.clear();
  try { M.in.disconnect(); } catch (e) { }
  rewireMaster();
  S.returns.forEach(r => buildBus(r, 'return'));
  S.tracks.forEach(t => buildBus(t, 'track'));
  S.tracks.forEach(routeOut); connectInputs(); wireSidechains();
  if (!isOffline() && NE.on) { neSyncProject(); schedulePDC(); }
}
function removeBus(b) {
  const r = RT.get(b.id); if (!r) return; if (r.inst) { r.inst.allOff(ctx.currentTime); if (r.inst.dispose) r.inst.dispose(); }
  try { r.mute.disconnect(); } catch (e) { } METER.delete(b.id);
  b.devices.forEach(d => { const x = DEV_RT.get(d.id); if (x) { x.dispose(); DEV_RT.delete(d.id); } });
  RT.delete(b.id);
}

/* ---------- automation ---------- */
// Parameters a bus exposes for automation: [{key,label,min,max,scale,fmt}]
function autoParams(b) {
  const out = [{ key: 'vol', label: 'Volume', min: 0, max: 1, fmt: v => faderDb(v) + ' dB' }];
  if (b === S.master) out.push({ key: 'tempo', label: 'Song Tempo', min: 40, max: 220, steps: true, fmt: v => v.toFixed(1) + ' BPM' });
  if (b !== S.master) out.push({ key: 'pan', label: 'Pan', min: -1, max: 1, fmt: v => Math.abs(v) < 0.01 ? 'C' : Math.round(Math.abs(v) * 50) + (v < 0 ? 'L' : 'R') });
  if (S.tracks.includes(b)) S.returns.forEach((ret, i) => out.push({ key: sendKey(i), label: `Send ${RET_LETTERS[i]} (${ret.name})`, min: 0, max: 1, fmt: fPct }));
  if (b.kind === 'midi' && b.inst.type === 'synth') [['cutoff', 'Synth Cutoff', 40, 16000, 'log', fHz], ['res', 'Synth Reso', 0.3, 20, null, v => v.toFixed(1)], ['fenv', 'Synth Env', 0, 8000, null, fHz], ['gain', 'Synth Volume', 0, 1, null, fPct]].forEach(([k, l, a, z, sc, f]) => out.push({ key: 'inst:' + k, label: l, min: a, max: z, scale: sc, fmt: f }));
  if (b.kind === 'midi' && b.inst.type === 'sampler') out.push({ key: 'inst:filter', label: 'Sampler Filter', min: -1, max: 1, fmt: v => v.toFixed(2) });
  b.devices.forEach(d => devParamDefs(d).filter(p => p.min != null).forEach(p => out.push({ key: `dev:${d.id}:${p.k}`, label: `${DEVICES[d.type].name}: ${p.label}`, min: p.min, max: p.max, scale: p.scale, fmt: p.fmt })));
  b.devices.filter(d => d.type === 'eq').forEach(d => d.p.bands.forEach((band, i) => { out.push({ key: `eqf:${d.id}:${i}`, label: `Prism EQ ${i + 1} Freq`, min: 20, max: 20000, scale: 'log', fmt: fHz }); out.push({ key: `eqg:${d.id}:${i}`, label: `Prism EQ ${i + 1} Gain`, min: -18, max: 18, fmt: fDb }); }));
  return out;
}
// A point's `c` (-1..1) bends the segment that starts at it: 0 is straight, positive starts slow, negative starts fast.
const curveF = (f, c) => (!c ? f : Math.pow(f, Math.pow(4, c)));
function autoValue(pts, pos) {
  if (!pts || !pts.length) return null;
  if (pos <= pts[0].t) return pts[0].v; const last = pts[pts.length - 1]; if (pos >= last.t) return last.v;
  for (let i = 1; i < pts.length; i++) if (pos < pts[i].t) { const a = pts[i - 1], b = pts[i]; return a.v + (b.v - a.v) * curveF((pos - a.t) / (b.t - a.t || 1), a.c); }
  return last.v;
}
/* Overrides: touching an automated control holds your value until Re-enable Automation. */
const OVERRIDES = new Set();
const ovKey = (b, k) => b.id + '|' + k;
const autoActive = (b, k) => !!(b.auto[k] && b.auto[k].length && !OVERRIDES.has(ovKey(b, k)));
const AUTO_WRITE = new Map();
/* Automation modes per channel, as in Pro Tools:
   Read  - plays automation; with Automation Arm on, moving a control records it (the original behaviour, and the default)
   Off   - ignores the channel's automation
   Touch - records while you hold a control, then returns to what was written
   Latch - records from the first touch and keeps writing the last value until playback stops
   Write - records volume, pan and sends for the whole pass, then switches to Touch */
const AUTO_MODES = ['off', 'read', 'touch', 'latch', 'write'];
const amode = b => (b && AUTO_MODES.includes(b.amode) ? b.amode : 'read');
const WRITERS = new Map();   // ovKey -> { b, key, mode, held }
// Write v at the play position, replacing what was there since the last write; a held, unchanged value stays one flat line.
function writeAuto(b, key, v) {
  const now = nowPos(), w = AUTO_WRITE.get(ovKey(b, key)), pts = b.auto[key] || (b.auto[key] = []);
  if (!w || now < w.last - 0.01 || now - w.last > 2) { if (!w) pushUndo('Record automation'); const prev = pts.length ? autoValue(pts, now) : currentParam(b, key); b.auto[key] = pts.filter(p => Math.abs(p.t - now) > 0.05); b.auto[key].push({ t: Math.max(0, now - 0.01), v: prev }); }
  const arr0 = b.auto[key], from = w && now >= w.last ? w.last : now; const out = arr0.filter(p => p.t <= from + 1e-6 || p.t > now + 1e-6); out.push({ t: now, v }); out.sort((x, y) => x.t - y.t);
  const i = out.findIndex(p => p.t === now && p.v === v); if (i >= 2 && out[i - 1].v === v && out[i - 2].v === v) out.splice(i - 1, 1);
  b.auto[key] = out; AUTO_WRITE.set(ovKey(b, key), { last: now }); OVERRIDES.delete(ovKey(b, key)); markDirty();
}
// Called whenever a control changes. With Automation Arm on during playback it records; otherwise it overrides.
function autoTouch(b, key, v) {
  if (!b || b._rack || !autoParams(b).some(p => p.key === key)) return;
  const mode = amode(b);
  if (mode === 'off') return;
  if (mode !== 'read') {   // touch, latch, write: record during playback; when stopped the move is just a move
    if (T.playing && !T.busy) { writeAuto(b, key, v); const k = ovKey(b, key), w = WRITERS.get(k); WRITERS.set(k, { b, key, mode: w && w.mode === 'write' ? 'write' : mode, held: true }); arr.draw(); }
    return;
  }
  if (T.playing && V.autoArm && !T.busy) { writeAuto(b, key, v); arr.draw(); return; }
  if (b.auto[key] && b.auto[key].length && !OVERRIDES.has(ovKey(b, key))) { OVERRIDES.add(ovKey(b, key)); ui.transport(); arr.draw(); }
}
// While playing: latched, written and held controls keep writing their current value.
function writeTick() {
  if (!T.playing || T.busy || isOffline()) return;
  WRITERS.forEach(w => { if (w.mode === 'touch' && !w.held) return; if (amode(w.b) === 'off' || amode(w.b) === 'read') return; writeAuto(w.b, w.key, currentParam(w.b, w.key)); });
  if (WRITERS.size) arr.draw();
}
// Letting go of a control ends a Touch write: playback picks the written automation back up from here.
document.addEventListener('pointerup', () => { WRITERS.forEach((w, k) => { w.held = false; if (w.mode === 'touch') { WRITERS.delete(k); AUTO_WRITE.delete(k); } }); }, true);
function startWriters() {   // at play: Write-mode channels write volume, pan and every send for the whole pass
  WRITERS.clear(); AUTO_WRITE.clear();
  allBuses().forEach(b => { if (amode(b) !== 'write') return; ['vol', ...(b === S.master ? [] : ['pan']), ...(b.kind !== 'return' && b !== S.master && S.tracks.includes(b) ? S.returns.map((r, i) => sendKey(i)) : [])].forEach(key => WRITERS.set(ovKey(b, key), { b, key, mode: 'write', held: false })); });
}
function stopWriters() {   // after a Write pass the channel drops to Touch, so the next pass does not wipe it again
  const wrote = new Set(); WRITERS.forEach(w => { if (w.mode === 'write') wrote.add(w.b); }); WRITERS.clear(); AUTO_WRITE.clear();
  wrote.forEach(b => { b.amode = 'touch'; }); if (wrote.size) { toast(`Write pass done: ${[...wrote].map(b => b.name).join(', ')} switched to Touch.`, 3500); if (typeof mixer !== 'undefined' && V.view === 'mix') mixer.render(); ui.headers(); }
}
function setAutoMode(b, mode) { if (!AUTO_MODES.includes(mode)) return; pushUndo('Automation mode'); b.amode = mode; [...WRITERS.keys()].forEach(k => { if (k.startsWith(b.id + '|')) { WRITERS.delete(k); AUTO_WRITE.delete(k); } });
  if (T.playing) { if (mode === 'write') ['vol', 'pan'].forEach(key => WRITERS.set(ovKey(b, key), { b, key, mode: 'write', held: false })); if (mode === 'off') { const r = b === S.master ? { fader: M.out } : RT.get(b.id); if (r) { ['fader', 'pan'].forEach(k => r[k] && (r[k].gain || r[k].pan) && (r[k].gain || r[k].pan).cancelScheduledValues(0)); applyMix(b); } } }
  markDirty(); if (typeof mixer !== 'undefined' && V.view === 'mix') mixer.render(); ui.headers(); arr.draw(); }
function reenableAutomation() { if (!OVERRIDES.size) return; OVERRIDES.clear(); AUTO_WRITE.clear(); ui.transport(); arr.draw(); if (T.playing) play(nowPos()); else releaseAutomation(); }
function currentParam(b, key) {
  if (key === 'tempo') return bpmAt(nowPos());
  if (sendIndex(key) >= 0) return sendOf(b, sendIndex(key));
  if (key === 'vol' || key === 'pan') return b[key];
  const [kind, id, k] = key.split(':');
  if (kind === 'inst') return b.inst[id];
  const d = b.devices.find(x => x.id === id); if (!d) return 0;
  if (kind === 'dev') return d.p[k]; if (kind === 'eqf') return d.p.bands[+k] ? d.p.bands[+k].f : 1000; if (kind === 'eqg') return d.p.bands[+k] ? d.p.bands[+k].g : 0;
  return 0;
}
// Apply automation for one window. AudioParams ramp to the window end; device parameters are set at window start.
function applyAutomation(b, from, to, first) {
  if (amode(b) === 'off') return;
  for (const key in b.auto) {
    const pts = b.auto[key]; if (!pts || !pts.length || key === 'tempo' || OVERRIDES.has(ovKey(b, key)) || (V.autoArm && T.playing && AUTO_WRITE.has(ovKey(b, key))) || (T.playing && !T.render && WRITERS.has(ovKey(b, key)))) continue;
    if (T.render && T.render.only === b.id && (sendIndex(key) >= 0 || (T.render.prefader && (key === 'vol' || key === 'pan')))) continue;
    if (T.render && T.render.only && b === S.master && key === 'vol') continue;
    const r = b === S.master ? { fader: M.out } : RT.get(b.id); if (!r) continue;
    const vEnd = autoValue(pts, to), tEnd = timeAt(to);
    const ramp = (param, val) => { if (first) { param.cancelScheduledValues(0); param.setValueAtTime(val(autoValue(pts, from)), Math.max(0, timeAt(from))); } param.linearRampToValueAtTime(val(vEnd), Math.max(ctx.currentTime, tEnd)); };
    if (key === 'vol') { const vg = vcaGain(b); ramp(r.fader.gain, v => faderGain(v) * vg); }
    else if (key === 'pan' && r.pan) ramp(r.pan.pan, v => v);
    else if (sendIndex(key) >= 0) { const g = r.sends && r.sends[sendIndex(key)]; if (g) ramp(g.gain, v => v); }
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
  const P = clipPitch(c);
  if (c.warp && c.wmode === 'repitch') return { buf: s.buf, rate: P * bpm / c.srcBpm, secAt: x => x * 15 / c.srcBpm }; // speed and pitch together
  if (c.warp) {
    const ratio = (c.srcBpm / bpm) * P, w = getWarped(c.sampleId, ratio);
    if (w) return { buf: w, rate: P, secAt: x => x * 15 / bpm * P };
    return { buf: s.buf, rate: P * bpm / c.srcBpm, secAt: x => x * 15 / c.srcBpm };   // repitched until the stretch is ready
  }
  return { buf: s.buf, rate: P, secAt: x => x * 15 / bpm * P };
}
const clipPitch = c => Math.pow(2, ((c.semis || 0) + (c.cents || 0) / 100) / 12);
const srcSecAt = (c, x) => (hasWm(c) ? secOfX(c, x) : c.timebase === 'song' ? songSec(c.start - c.offset + x) - songSec(c.start - c.offset) : c.warp ? x * 15 / c.srcBpm : x * 15 / S.bpm * clipPitch(c)); // original-file seconds, for drawing
function clipNaturalLen(c) { const s = SAMPLES.get(c.sampleId); if (!s) return c.len; return c.warp ? s.buf.duration * c.srcBpm / 15 : s.buf.duration / clipPitch(c) * S.bpm / 15; }
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
function clipEffSpan(t, c) { const i = xfInfo(t, c), R = rightOf(t, c), o = R && !R.muted ? xfInfo(t, R) : null; return { a: c.start - (i ? i.ext : 0), b: c.start + c.len + (o ? o.ext : 0), hin: i ? i.ext : 0, hout: o ? o.ext : 0, fin: i ? i.fade : 0, fout: o ? o.fade : 0, outShape: o ? R.xfShape : null }; }
// Clip gain at song position p (piecewise linear in p): user fades, crossfades and clip gain.
const SHAPES = { linear: x => x, equal: x => Math.sin(x * Math.PI / 2), slow: x => x * x, fast: x => Math.sqrt(x) };
const shapeF = (name, x) => (SHAPES[name] || SHAPES.linear)(clamp(x, 0, 1));
function clipGainAt(c, p, sp) {
  const base = dbToGain(c.gain), end = c.start + c.len; let g = 1;
  if (GP.edgeFade !== false && !c.frozen) { const e4 = 0.004 * bpmAt(c.start) / 15; if (!sp.fin && !(c.fadeIn > 0)) g = Math.min(g, clamp((p - c.start) / e4, 0, 1)); if (!sp.fout && !(c.fadeOut > 0)) g = Math.min(g, clamp((end - p) / e4, 0, 1)); }
  if (sp.fin > 0) g = Math.min(g, shapeF(c.xfShape, (p - (c.start - sp.hin)) / sp.fin)); else if (c.fadeIn > 0) g = Math.min(g, shapeF(c.fadeShape, (p - c.start) / c.fadeIn));
  if (sp.fout > 0) g = Math.min(g, shapeF(sp.outShape, ((end + sp.hout) - p) / sp.fout)); else if (c.fadeOut > 0) g = Math.min(g, shapeF(c.fadeShape, (end - p) / c.fadeOut));
  return base * g;
}
function startAudio(t, c, pos, when) {
  if (c.muted || T.started.has(c.id)) return;
  const sp = c.frozen ? { a: c.start, b: c.start + c.len, hin: 0, hout: 0, fin: 0, fout: 0 } : clipEffSpan(t, c), { a, b, hin, hout } = sp;
  if (pos >= b - 1e-9) return; pos = Math.max(pos, a);
  const pb = clipPlayback(c, bpmAt(pos)); if (!pb) return;
  const segEnd = c.frozen ? b : Math.min(b, nextTempoChange(pos));      // tempo changes restart the source with the new stretch
  const local = pos - c.start, off = pb.secAt(c.loop && c.loopLen > 0.25 && local >= 0 ? c.offset + (local % c.loopLen) : local + c.offset); if (off >= pb.buf.duration || off < -1e-3) return;
  const r = RT.get(t.id); if (!r) return;
  const src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = pb.buf; src.playbackRate.value = pb.rate;
  const w0 = Math.max(ctx.currentTime, when), at = p => w0 + durSec(pos, p - pos), dur = durSec(pos, segEnd - pos);
  const startsClip = pos <= a + 1e-6, endsClip = segEnd >= b - 1e-6;
  g.gain.setValueAtTime(startsClip ? 0 : clipGainAt(c, pos, sp), w0);
  if (startsClip) g.gain.linearRampToValueAtTime(clipGainAt(c, Math.min(segEnd, pos + 0.01), sp), at(Math.min(segEnd, pos + 0.01)));
  const end = c.start + c.len;
  const e4 = 0.004 * bpmAt(c.start) / 15; // hold full level until just before the end, then the short edge fade (or the clip's own fade)
  const bps = [c.start - hin, sp.fin ? c.start - hin + sp.fin : c.start + c.fadeIn, sp.fout ? end + hout - sp.fout : end - c.fadeOut, end + hout, c.start - hin + e4, end + hout - e4];
  const regs = [[c.start - hin, bps[1]], [bps[2], end + hout]]; if ((c.xfShape && c.xfShape !== 'linear') || (c.fadeShape && c.fadeShape !== 'linear') || (sp.outShape && sp.outShape !== 'linear')) regs.forEach(([a0, b0]) => { for (let k = 1; k < 8; k++) bps.push(a0 + (b0 - a0) * k / 8); });
  bps.filter(p => p > pos + 0.01 && p < segEnd - 1e-6).sort((x, y) => x - y)
    .forEach(p => g.gain.linearRampToValueAtTime(clipGainAt(c, p, sp), at(p)));
  g.gain.linearRampToValueAtTime(endsClip ? 0 : clipGainAt(c, segEnd, sp), w0 + dur);
  let last = g;
  // clip envelopes: gain (dB) and pan drawn in the clip, relative to the clip start
  const env = c.env || {};
  if (env.gain && env.gain.length) { const eg = ctx.createGain(); const gv = x => dbToGain(autoValue(env.gain, x)); eg.gain.setValueAtTime(gv(pos - c.start), w0); env.gain.forEach(q => { const p = c.start + q.t; if (p > pos && p < segEnd) eg.gain.linearRampToValueAtTime(gv(q.t), at(p)); }); eg.gain.linearRampToValueAtTime(gv(segEnd - c.start), w0 + dur); last.connect(eg); last = eg; }
  if (env.pan && env.pan.length) { const ep = ctx.createStereoPanner(); ep.pan.setValueAtTime(autoValue(env.pan, pos - c.start), w0); env.pan.forEach(q => { const p = c.start + q.t; if (p > pos && p < segEnd) ep.pan.linearRampToValueAtTime(q.v, at(p)); }); ep.pan.linearRampToValueAtTime(autoValue(env.pan, segEnd - c.start), w0 + dur); last.connect(ep); last = ep; }
  src.connect(g); last.connect(c.frozen ? r.frz : r.in);
  if (c.loop && c.loopLen > 0.25 && !c.frozen) { src.loop = true; src.loopStart = Math.max(0, pb.secAt(c.offset)); src.loopEnd = Math.min(pb.buf.duration, pb.secAt(c.offset + c.loopLen)); }
  src.start(w0, Math.max(0, off), c.loop ? undefined : dur * pb.rate + 0.01); src.stop(w0 + dur + 0.02);
  const h = { src, g, clip: c }; T.srcs.push(h); src.onended = () => { T.srcs = T.srcs.filter(x => x !== h); };
  T.started.add(c.id);
}
// What a track plays from the timeline: its clips, or its frozen render.
const frozenClip = t => (t.frozen ? { id: 'frz-' + t.id, type: 'audio', frozen: true, sampleId: t.frozen.sid, start: 0, len: t.frozen.len, offset: 0, gain: 0, semis: 0, warp: false, srcBpm: S.bpm, fadeIn: 0, fadeOut: 0 } : null);
const audioClipsOf = t => (t.frozen ? [frozenClip(t)] : t.kind === 'audio' ? t.clips.flatMap(expandWarp) : []);
function startAudioAt(pos, when) {
  S.tracks.forEach(t => audioClipsOf(t).forEach(c => { const sp = c.frozen ? { a: c.start, b: c.start + c.len } : clipEffSpan(t, c); if (sp.a <= pos && pos < sp.b) startAudio(t, c, pos, when); }));
}
function stopSources(at) { T.srcs.forEach(h => { try { hold(h.g.gain, at); h.g.gain.setTargetAtTime(0, at, 0.004); h.src.stop(at + 0.03); } catch (e) { } }); T.srcs = []; }

/* ---------- scheduler ---------- */
function scheduleWindow(from, to) {
  const first = from === T.firstPos; runModulators(Math.max(ctx.currentTime, timeAt(from)), from);
  for (const t of S.tracks) {
    if (t.kind === 'midi' && !t.frozen) {
      const inst = RT.get(t.id) && RT.get(t.id).inst; if (!inst) continue;
      const fx = (t.midifx || []).some(f => f.on), win = fx ? [] : null;   // with MIDI effects, notes collect here and go through the chain
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
            const gv = c.groove ? grooveAt(grooveById(c.groove), p) : null; // groove: shift and accent from the groove pool
            const vel = clamp((n.vr ? n.v + (Math.random() * 2 - 1) * n.vr : n.v) * (gv ? gv.vel : 1), 0.01, 1); // velocity range: a random spread around the note's velocity
            if (win) { win.push({ p: n.p, pos: p + (gv ? gv.shift : 0), dur, vel, rv: n.rv, mpe: n.mpe }); continue; }
            inst.noteOn(n.p, Math.max(ctx.currentTime, timeAt(p + (gv ? gv.shift : 0))), vel, durSec(p, dur) * 0.98, n.rv, n.mpe);
          }
        }
      }
      if (win || (RT.get(t.id).mq && RT.get(t.id).mq.length)) midiFxQueue(t, inst, win || [], from, to);
    } else if (!(T.recording && t.arm && t.kind === 'audio' && T.recording.audio.some(r => r.t === t))) {
      for (const c of audioClipsOf(t)) { const sp = c.frozen ? { a: c.start } : clipEffSpan(t, c); if (sp.a >= from - 1e-9 && sp.a < to - 1e-9) startAudio(t, c, sp.a, timeAt(sp.a)); }
      // at a tempo change, clips that are already playing restart with the new stretch
      for (const p of tempoChangesIn(from - 1e-9, to)) for (const c of audioClipsOf(t)) { const sp = c.frozen ? { a: c.start, b: c.start + c.len } : clipEffSpan(t, c); if (sp.a < p && p < sp.b) { T.started.delete(c.id); startAudio(t, c, p, timeAt(p)); } }
    }
    applyAutomation(t, from, to, first);
  }
  S.returns.forEach(b => applyAutomation(b, from, to, first)); applyAutomation(S.master, from, to, first);
  if ((S.metro || T.countUntil != null) && !isOffline()) { for (const B of barLines(from, to)) for (let b = B.p; b < B.p + B.spb - 1e-6; b += B.bt) if (b >= from - 1e-9 && b < to - 1e-9) click(timeAt(b), b === B.p); }
}
function tick(lookahead = 0.12) {
  if (!T.playing) return;
  if (WRITERS.size) writeTick();
  if (T.autoStopAt != null && !isOffline() && posAt(ctx.currentTime) >= T.autoStopAt) { T.autoStopAt = null; setTimeout(() => { if (T.playing) stop(); }, 0); return; }   // punch out + post-roll
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
  const pr = S.prefs || {}, snd = pr.metroSound || 'click', vol = pr.metroVol != null ? pr.metroVol : 0.6;
  if (pr.metroRecOnly && !T.recording && T.countUntil == null) return;
  const o = ctx.createOscillator(), g = ctx.createGain(), f = { click: [1600, 1050], wood: [1250, 900], beep: [880, 660] }[snd] || [1600, 1050];
  o.type = snd === 'beep' ? 'square' : snd === 'wood' ? 'triangle' : 'sine'; o.frequency.value = accent ? f[0] : f[1];
  const dec = snd === 'beep' ? 0.07 : snd === 'wood' ? 0.025 : 0.04, amp = vol * (snd === 'beep' ? 0.25 : 1);
  g.gain.setValueAtTime(amp, time); g.gain.exponentialRampToValueAtTime(0.0005, time + dec);
  o.connect(g); g.connect(M.click); o.start(time); o.stop(time + dec + 0.01);
}

function unfreezeForTempo() { const fz = S.tracks.filter(t => t.frozen); if (!fz.length) return; fz.forEach(t => { delete t.frozen; rewire(t); applyMix(t); }); toast(`Unfroze ${fz.map(t => t.name).join(', ')} because the tempo changed. Freeze again to re-render.`, 5000); }
/* ---------- transport ---------- */
// Record: press it and the song starts recording (after the count-in, if one is set). Press it again to stop recording and keep playing.
async function recordButton() {
  if (T.rec) { T.rec = false; if (T.recording) finishRecording(); ui.transport(); return; }
  if (!S.tracks.some(t => t.arm)) { const t = S.tracks.find(x => V.selTracks.has(x.id) && (x.kind === 'audio' || x.kind === 'midi')); if (t) await armTrack(t, true); }
  T.rec = true; if (T.playing) startRecording(nowPos()); else play(V.insert);
  ui.transport();
}
// Record options: count-in (clicks only), pre-roll (the song plays before the record point) and post-roll (it keeps playing after punch-out)
function countInMenu(at) {
  const P = S.prefs || {}, opt = (key, v, l) => ({ label: (((P[key] || 0) === v) ? '✓  ' : '    ') + l, run: () => { S.prefs = S.prefs || {}; S.prefs[key] = v; markDirty(); ui.transport(); } });
  popMenu(at, [opt('countIn', 0, 'No count-in'), opt('countIn', 1, 'Count-in 1 bar'), opt('countIn', 2, 'Count-in 2 bars'), opt('countIn', 4, 'Count-in 4 bars'), '-',
    opt('preRoll', 0, 'No pre-roll'), opt('preRoll', 1, 'Pre-roll 1 bar'), opt('preRoll', 2, 'Pre-roll 2 bars'), '-',
    opt('postRoll', 0, 'No post-roll'), opt('postRoll', 1, 'Post-roll 1 bar'), opt('postRoll', 2, 'Post-roll 2 bars')]);
}
function play(from = V.insert) {
  if (isOffline() || T.busy) return;
  if (ctx.state !== 'running') ctx.resume();
  if (T.playing) stop(true);
  // Recording, as in Pro Tools: with Punch In on, recording starts at the punch point; pre-roll plays the song for a bar or two
  // before it so you can get into the take; with Punch Out on (and the loop off) the song stops after the post-roll.
  const P = S.prefs || {}, punchIn = T.rec && S.punch && S.punch.in && S.loop.end > S.loop.start;
  const recFrom = punchIn ? S.loop.start : from, pre = T.rec ? Math.min(recFrom, (P.preRoll || 0) * SPB()) : 0, start = recFrom - pre;
  const count = T.rec && P.countIn ? P.countIn * SPB() : 0;
  T.playing = true; T.anchorTime = ctx.currentTime + 0.06; T.anchorPos = start - count; T.nextPos = start - count; T.firstPos = start; T.started.clear();
  T.countUntil = count ? start : null;
  T.autoStopAt = T.rec && S.punch && S.punch.out && !S.loop.on && S.loop.end > recFrom ? S.loop.end + (P.postRoll || 0) * SPB() : null;
  if (!count) startAudioAt(start, T.anchorTime);
  if (T.rec) startRecording(recFrom);
  if (!isOffline()) startWriters();
  tick(); ui.transport();
}
function stop(silent) {
  if (isOffline()) return;
  T.autoStopAt = null; if (!silent) { T.rec = false; stopWriters(); }   // Stop ends recording; the record button goes out (tracks stay armed)
  const now = ctx.currentTime; T.stopPos = T.countUntil != null ? T.countUntil : posAt(now); T.countUntil = null;
  if (T.recording) finishRecording();
  clearMidiFxQueues(); T.playing = false; stopSources(now); DEV_RT.forEach(r => r.transport && r.transport(null));
  S.tracks.forEach(t => { const r = RT.get(t.id); if (r && r.inst) r.inst.allOff(now); });
  releaseAutomation();
  if (!silent) { ui.transport(); arr.draw(); }
}
function togglePlay() { T.playing ? stop() : play(); }
function continuePlay() { play(T.playing ? nowPos() : T.stopPos || V.insert); }
function seek(pos) { if (T.busy) return; pos = Math.max(0, pos); V.insert = pos; if (T.playing) play(pos); else arr.draw(); }
function setBpm(b) {
  b = clamp(Math.round(b * 100) / 100, 20, 300); const pts = tempoPoints(), first = pts.length && pts[0].t <= 1e-9 ? pts[0] : null, old = first ? first.v : S.bpm; if (b === old) return;
  if (!T.busy) pushUndo('Tempo');
  const was = T.playing, p = nowPos(); if (was) stop(true);
  const k = b / old; S.tracks.forEach(t => t.clips.forEach(c => { if (c.type === 'audio' && !c.warp && c.timebase !== 'song') { c.len *= k; c.offset *= k; c.fadeIn *= k; c.fadeOut *= k; } }));
  if (first) first.v = b; S.bpm = b; unfreezeForTempo(); DEV_RT.forEach(d => d.onTempo());
  S.tracks.forEach(t => { const r = RT.get(t.id); if (r && r.inst && r.inst.prepare) r.inst.prepare(); });
  if (was) play(p);
  markDirty(); ui.transport(); arr.draw();
}

/* ---------- audio input & recording ---------- */
const INPUTS = new Map(); // deviceId -> {stream, src}
async function getInput(deviceId = 'default') {
  if (INPUTS.has(deviceId)) return INPUTS.get(deviceId);
  if (deviceId === 'default' && GP.inId === 'none') throw new Error('Audio input is off in Settings');
  const dev = deviceId === 'default' ? GP.inId : deviceId;
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: !dev || dev === 'default' ? undefined : { exact: dev }, echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 } });
  let src = LIVE_CTX.createMediaStreamSource(stream);
  if (deviceId === 'default' && (GP.inCh === 'l' || GP.inCh === 'r')) { const sp = LIVE_CTX.createChannelSplitter(2), mg = LIVE_CTX.createChannelMerger(2), ch = GP.inCh === 'l' ? 0 : 1; src.connect(sp); sp.connect(mg, ch, 0); sp.connect(mg, ch, 1); const raw = src; src = mg; src._raw = raw; }
  const inp = { stream, src }; INPUTS.set(deviceId, inp); connectInputs(); return inp;
}
const monitorOn = t => t.kind === 'audio' && (t.monitor === 'in' || (t.monitor === 'auto' && t.arm));
const internalInput = t => t.input === 'resample' || t.input === 'none' || String(t.input || '').startsWith('track:') || !!extParse(t.input) || (IO.native && (t.input || 'default') === 'default');
function inputNode(t) {
  if (t.input === 'resample') return M.out;
  if (String(t.input || '').startsWith('track:')) { const r = RT.get(t.input.slice(6)); return r ? r.mute : null; }
  if (IO.native) { const spec = extParse(t.input) ? t.input : (t.input || 'default') === 'default' ? 'ext:1' : null; return spec && IO.inCh ? extInNode(spec) : null; }
  if (extParse(t.input)) return null;
  const inp = INPUTS.get(t.input || 'default'); return inp ? inp.src : null;
}
function connectInputs() {
  if (isOffline()) return;
  S.tracks.forEach(t => { const r = RT.get(t.id); if (!r || !r.mon) return; if (r.monSrc) { try { r.monSrc.disconnect(r.mon); } catch (e) { } r.monSrc = null; }
    if (t.kind !== 'audio' || (internalInput(t) && !(IO.native && !String(t.input || '').startsWith('track:') && t.input !== 'resample'))) return; // internal sources are recorded, not monitored (that would feed back)
    const src = inputNode(t); if (src) { src.connect(r.mon); r.monSrc = src; } });
}
async function armTrack(t, on) {
  t.arm = on;
  if (on && t.kind === 'audio' && IO.native && ((t.input || 'default') === 'default' || extParse(t.input))) { await neWantInput(); connectInputs(); }
  else if (on && t.kind === 'audio' && !internalInput(t)) { try { await getInput(t.input); } catch (e) { t.arm = false; toast('Studio B could not open the audio input. Check the microphone permission and input device in Settings.'); } }
  applyMix(t); ui.headers();
}
function startRecording(from) {
  const R = { from, startTime: timeAt(from), audio: [], midi: [], passes: 0, wraps: [], held: new Map(), loop: { ...S.loop }, punch: { ...(S.punch || {}) } };
  S.tracks.filter(t => t.arm && t.kind === 'audio' && !t.frozen).forEach(t => {
    const srcNode = inputNode(t); if (!srcNode || !PITCH_OK) return; const inp = { src: srcNode };
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
    m.notes.forEach(x => { if (x.abs < R.from && x.abs > R.from - BEAT()) { x.l -= R.from - x.abs; x.abs = R.from; } });
    const notes = m.notes.filter(x => x.abs >= Math.max(pa, R.from) - 1e-6 && x.abs < pb && x.l > 0); if (!notes.length) continue;
    const bar = SPB(), q = (S.prefs && S.prefs.recQuant) || 0.0625, t = m.t, n = (t.takeCount = (t.takeCount || 0) + 1);
    const mk = (list, name) => { const a = Math.floor(Math.min(...list.map(x => x.abs)) / bar) * bar, b = Math.ceil(Math.max(...list.map(x => x.abs + x.l)) / bar) * bar;
      const c = newMidiClip(a, Math.max(bar, b - a), name); c.bars = Math.max(bar, b - a) / 16; c.src = uid();
      c.notes = list.map(x => ({ p: x.p, s: Math.round((x.abs - a) / q) * q, l: Math.max(0.25, Math.round(x.l * 4) / 4), v: x.vel != null ? x.vel : x.v, rv: x.rv, c: 1 })).sort((x, y) => x.s - y.s); return c; };
    if (V.midiOd) { const c = mk(notes, 'Recorded'); mergeMidiInto(t, c); markDirty(); continue; } // overdub: add to what is there
    // which loop pass each note was played in
    const passOf = x => (x.at == null ? 0 : R.wraps.filter(w => w <= x.at + 1e-4).length), np = Math.max(...notes.map(passOf)) + 1;
    const groups = [...Array(np)].map((_, k) => notes.filter(x => passOf(x) === k)).filter(g => g.length);
    const clips = groups.map((g, k) => mk(g, groups.length > 1 ? `${t.name} ${n}.${k + 1}` : `${t.name} take ${n}`));
    if (np > 1 && R.loop.on !== false) clips.forEach((c, k) => { if (k || groups.length > 1) { const L = R.loop.end - R.loop.start; if (c.start >= R.loop.start - 1e-6 && c.start + c.len <= R.loop.end + 1e-6) { c.notes.forEach(x => (x.s += c.start - R.loop.start)); c.start = R.loop.start; c.len = L; c.bars = L / 16; } } });
    const a = Math.min(...clips.map(c => c.start)), b = Math.max(...clips.map(c => c.start + c.len)), before = t.clips.map(c => cropClip(c, a, b)).filter(Boolean);
    if (clips.length > 1 || before.length) { // MIDI takes, like audio: every pass (and what was there) on a take lane
      t.takes = t.takes || [];
      if (before.length) t.takes.push({ id: uid(), name: 'Before take ' + n, clips: before.map(c => ({ ...deep(c), id: uid() })) });
      clips.forEach((c, k) => t.takes.push({ id: uid(), name: clips.length > 1 ? `Take ${n}.${k + 1}` : `Take ${n}`, clips: [{ ...deep(c), id: uid() }] }));
      t.showTakes = true;
    }
    const main = clips[clips.length - 1]; clearRange(t, main.start, main.start + main.len); t.clips.push(main); markDirty();
  }
  arr.draw(); ui.detail();
}
// Comping: copy the part of a take lane inside [a,b) onto the track's main lane.
function compRange(t, lane, a, b) {
  const parts = lane.clips.map(c => cropClip(c, a, b)).filter(Boolean); if (!parts.length) return false;
  pushUndo('Comp'); clearRange(t, a, b); parts.forEach(p => t.clips.push(p)); markDirty(); return true;
}
// Is this part of a take lane what the main lane is playing? (same file, same alignment)
function compActive(t, k, p) { if (k.type === 'midi') return t.clips.some(m => m.type === 'midi' && m.src && m.src === k.src && p >= m.start - 1e-6 && p < m.start + m.len); return t.clips.some(m => m.sampleId === k.sampleId && p >= m.start - 1e-6 && p < m.start + m.len && Math.abs((m.offset - m.start) - (k.offset - k.start)) < 1e-3); }
// Recording replaces what was underneath it on the track.
function punchIn(t, c) { clearRange(t, c.start, c.start + c.len); }

/* ---------- live notes (computer keyboard / MIDI) ---------- */
const held = new Map();
// MIDI tracks that hear a source: their MIDI From and channel match, and they are armed, monitoring In, or selected on Auto.
function midiTargets(src, ch) {
  const takes = t => t.kind === 'midi' && !t.frozen && (t.midiIn || 'all') !== 'none' && ((t.midiIn || 'all') === 'all' || t.midiIn === src) && (!t.midiCh || src === 'kb' || +t.midiCh === ch + 1);
  const hears = t => t.arm || t.monitor === 'in' || ((t.monitor || 'auto') === 'auto' && V.selTracks.has(t.id));
  const list = S.tracks.filter(t => takes(t) && hears(t));
  return list;
}
const padNote = (t, n) => (t.inst.type === 'drums' ? GM_PAD(n) : t.inst.type === 'sampler' && t.inst.mode !== 'keys' ? clamp(n - 36, 0, 15) : n);
function liveTarget() { const t = S.tracks.find(x => x.arm && x.kind === 'midi') || S.tracks.find(x => V.selTracks.has(x.id) && x.kind === 'midi'); return t; }
function liveNoteOn(key, note, vel = 0.85, t = liveTarget(), ch = 0) {
  if (!t || t.kind !== 'midi') return; if (ctx.state !== 'running') ctx.resume();
  const fx = (t.midifx || []).some(f => f.on), vs = fx ? liveFxOn(t, note, vel) : null;
  const v = fx ? null : RT.get(t.id).inst.noteOn(note, ctx.currentTime, vel, null);
  const h = { v, vs, t, note, vel, ch, pos: T.playing ? posAt(ctx.currentTime) : null, at: ctx.currentTime }; held.set(key, h);
  if (T.recording) T.recording.held.set(key, h);
}
function liveNoteOff(key, rv) {
  const h = held.get(key); if (!h) return; held.delete(key);
  if (h.vs) { h.vs.forEach(v => RT.get(h.t.id) && RT.get(h.t.id).inst.noteOff(v, ctx.currentTime, rv)); liveFxOff(h.t, h.note); }
  else RT.get(h.t.id) && RT.get(h.t.id).inst.noteOff(h.v, ctx.currentTime, rv);
  const R = T.recording; if (R && h.pos != null) { R.held.delete(key); const m = R.midi.find(x => x.t === h.t); const dur = Math.max(0.01, ctx.currentTime - h.at); if (m) m.notes.push({ p: h.note, abs: h.pos, l: Math.max(0.25, posAt(ctx.currentTime) - h.pos), vel: h.vel, rv, at: h.at, mpe: h.pb && h.pb.length ? { pb: [{ t: 0, v: h.pb0 || 0 }, ...h.pb.map(q => ({ t: clamp((q.at - h.at) / dur, 0, 1), v: q.v }))] } : undefined }); }
  if (!R) { CAPTURE.push({ t: h.t.id, p: h.note, t0: h.at, t1: ctx.currentTime, vel: h.vel, rv, pos: h.pos, end: T.playing && h.pos != null ? posAt(ctx.currentTime) : null }); if (CAPTURE.length > 4000) CAPTURE.splice(0, 1000); }
}
// Pitch bend: on a member channel (MPE) it bends only that note; on channel 1 it bends everything held.
function liveBend(ch, x) {
  const semis = x * (ch === 0 ? (GP.pbRange || 2) : (GP.mpeRange || 48));
  held.forEach(h => { if (ch !== 0 && h.ch !== ch) return; h.pb = h.pb || []; if (!h.pb.length) h.pb0 = 0; h.pb.push({ at: ctx.currentTime, v: semis });
    const nodes = (h.v && (h.v.oscs || h.v.srcs)) || []; nodes.forEach(o => { if (!o.detune) return; if (o._b0 == null) o._b0 = o.detune.value; o.detune.setTargetAtTime(o._b0 + semis * 100, ctx.currentTime, 0.005); }); });
}
/* Capture MIDI: everything you play while not recording is remembered, so you can turn it into a clip afterwards. */
const CAPTURE = [];
function captureMidi() {
  const now = ctx.currentTime; let list = CAPTURE.filter(n => now - n.t1 < 600); if (!list.length) return toast('Play something first, then Capture turns it into a clip');
  list.sort((a, b) => a.t0 - b.t0); let i = list.length - 1; while (i > 0 && list[i].t0 - list[i - 1].t1 < 4) i--; list = list.slice(i); // the last phrase: back to the first 4-second gap
  const t = S.tracks.find(x => x.id === list[list.length - 1].t) || liveTarget(); if (!t) return;
  const bar = SPB(), timed = list.every(n => n.pos != null && n.end != null && n.end > n.pos);
  let notes;
  if (timed) notes = list.map(n => ({ p: n.p, abs: n.pos, l: Math.max(0.25, n.end - n.pos), v: n.vel, rv: n.rv }));
  else { const sps = bpmAt(V.insert) / 15, a0 = list[0].t0, at = Math.floor(V.insert / BEAT()) * BEAT(); notes = list.map(n => ({ p: n.p, abs: at + Math.round((n.t0 - a0) * sps * 4) / 4, l: Math.max(0.25, Math.round((n.t1 - n.t0) * sps * 4) / 4), v: n.vel, rv: n.rv })); }
  const a = Math.floor(Math.min(...notes.map(n => n.abs)) / bar) * bar, b = Math.max(a + bar, Math.ceil(Math.max(...notes.map(n => n.abs + n.l)) / bar) * bar);
  pushUndo('Capture MIDI'); const c = newMidiClip(a, b - a, 'Captured'); c.bars = (b - a) / 16; c.notes = notes.map(n => ({ p: n.p, s: n.abs - a, l: n.l, v: n.v, rv: n.rv, c: 1 })).sort((x, y) => x.s - y.s);
  if (V.midiOd) mergeMidiInto(t, c); else { clearRange(t, a, b); t.clips.push(c); }
  CAPTURE.length = 0; V.selClips = new Set([c.id]); openClip(c); ui.all(); toast(`Captured ${c.notes.length} notes on ${t.name}`);
}
// Overdub: merge a new clip's notes with whatever MIDI already sits under it, into one clip.
function mergeMidiInto(t, c) {
  const under = t.clips.filter(k => k.type === 'midi' && k.start < c.start + c.len && k.start + k.len > c.start);
  if (!under.length) { t.clips.push(c); return c; }
  const a = Math.min(c.start, ...under.map(k => k.start)), b = Math.max(c.start + c.len, ...under.map(k => k.start + k.len));
  const old = under.flatMap(k => flattenMidi(k).map(n => ({ ...n, s: n.s + k.start - a })));
  clearRange(t, a, b); c.notes = [...old, ...c.notes.map(n => ({ ...n, s: n.s + c.start - a }))].sort((x, y) => x.s - y.s); c.start = a; c.len = b - a; c.bars = (b - a) / 16; c.offset = 0; c.name = under[0].name;
  t.clips.push(c); return c;
}

/* ---------- editing primitives ---------- */
// Remove everything in [a,b) on a track, splitting clips that cross the edges.
function clearRange(t, a, b) {
  const out = [];
  for (const c of t.clips) {
    const e = c.start + c.len;
    if (e <= a || c.start >= b) { out.push(c); continue; }
    let right = null; if (e > b) { right = deep(c); right.id = uid(); right.offset = c.offset + (b - c.start); right.start = b; right.len = e - b; if (right.type === 'audio') right.xf = 0; }
    if (c.start < a) { c.len = a - c.start; if (c.type === 'audio') c.fadeOut = Math.min(c.fadeOut, c.len); out.push(c); }
    if (right) out.push(right);
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
  for (let k = Math.floor(c.offset / L) - 1; k * L - c.offset < c.len; k++) c.notes.forEach(n => { if (n.s >= L) return; const s = n.s + k * L - c.offset; if (s >= -1e-9 && s < c.len - 1e-9) out.push({ ...n, s, l: Math.min(n.l, c.len - s) }); });
  return out;
}

/* ---------- undo ---------- */
const UNDO = [], REDO = [];
const snapProject = () => JSON.stringify({ ...S, view: undefined, path: undefined, name: undefined, _report: undefined });
function pushUndo(label) { UNDO.push({ json: snapProject(), label: label || 'Edit' }); if (UNDO.length > 200) UNDO.shift(); REDO.length = 0; markDirty(); }
function restore(json) {
  const was = T.playing, p = nowPos(); if (was) stop(true);
  const keep = { view: S.view, path: S.path, name: S.name }; S = JSON.parse(json); Object.assign(S, keep);
  rebuildAll(); V.selClips.clear(); if (V.editClip && !clipById(V.editClip)) V.editClip = null;
  ui.all(); if (was) play(p);
}
function undo() { if (T.busy || isOffline()) return; if (T.recording) return toast('Stop recording before undoing'); if (!UNDO.length) return toast('Nothing to undo'); const e = UNDO.pop(); REDO.push({ json: snapProject(), label: e.label }); restore(e.json); markDirty(); toast('Undo: ' + e.label, 1400); }
function redo() { if (T.busy || isOffline() || T.recording) return; if (!REDO.length) return; const e = REDO.pop(); UNDO.push({ json: snapProject(), label: e.label }); restore(e.json); markDirty(); toast('Redo: ' + e.label, 1400); }
function markDirty() { V.dirty = true; ui.title && ui.title(); }
window.SB_isDirty = () => V.dirty;
