/* ============ Editing details: time edits, reverse, crop, locators, zoom memory, autosave, undo history ============ */

/* ---------- time edits: they move everything after the range, on every track ---------- */
function shiftAfter(at, d) {
  const mv = c => { if (c.start >= at - 1e-9) c.start += d; };
  S.tracks.forEach(t => { t.clips.forEach(mv); (t.takes || []).forEach(l => l.clips.forEach(mv)); });
  allBuses().forEach(b => Object.values(b.auto).forEach(pts => pts.forEach(p => { if (p.t >= at - 1e-9) p.t += d; })));
  S.markers.forEach(m => { if (m.t >= at - 1e-9) m.t += d; });
  if (S.loop.start >= at - 1e-9) { S.loop.start += d; S.loop.end += d; } else if (S.loop.end > at) S.loop.end += d;
}
function splitAllAt(at) { S.tracks.forEach(t => { t.clips.slice().forEach(c => splitClip(t, c, at)); (t.takes || []).forEach(l => { const tmp = { clips: l.clips }; l.clips.slice().forEach(c => splitClip(tmp, c, at)); l.clips = tmp.clips; }); }); }
function deleteTime(a, b) {
  if (!(b > a)) return toast('Select a time range first'); pushUndo('Delete time'); const len = b - a;
  S.tracks.forEach(t => { clearRange(t, a, b); (t.takes || []).forEach(l => { const tmp = { clips: l.clips }; clearRange(tmp, a, b); l.clips = tmp.clips; }); });
  allBuses().forEach(b0 => Object.keys(b0.auto).forEach(k => { b0.auto[k] = b0.auto[k].filter(p => p.t < a || p.t >= b); }));
  S.markers = S.markers.filter(m => m.t < a || m.t >= b);
  shiftAfter(b, -len); V.time = null; V.insert = a; ui.all(); toast(`Deleted ${barsBeatsLen(len)} of time`);
}
function insertSilence(a, b) {
  if (!(b > a)) return toast('Select a time range first: its length is how much silence to insert'); pushUndo('Insert silence');
  splitAllAt(a); shiftAfter(a, b - a); V.time = null; ui.all(); toast(`Inserted ${barsBeatsLen(b - a)} of silence`);
}
function duplicateTime(a, b) {
  if (!(b > a)) return toast('Select a time range first'); pushUndo('Duplicate time'); const len = b - a;
  const copies = S.tracks.map(t => t.clips.map(c => cropClip(c, a, b)).filter(Boolean));
  const autos = allBuses().map(bb => Object.fromEntries(Object.entries(bb.auto).map(([k, pts]) => [k, pts.filter(p => p.t >= a && p.t < b).map(p => ({ ...p }))])));
  splitAllAt(b); shiftAfter(b, len);
  S.tracks.forEach((t, i) => copies[i].forEach(c => { c.id = uid(); c.start += len; t.clips.push(c); }));
  allBuses().forEach((bb, i) => Object.entries(autos[i]).forEach(([k, pts]) => { bb.auto[k].push(...pts.map(p => ({ t: p.t + len, v: p.v }))); bb.auto[k].sort((x, y) => x.t - y.t); }));
  V.time = { a: b, b: b + len, tracks: (V.time && V.time.tracks) || new Set(S.tracks.map(t => t.id)) }; ui.all();
}

/* ---------- clips ---------- */
const REVERSED = new Map(); // sample id -> reversed sample id
function reverseClips() {
  const sc = selectedClips().filter(x => x.c.type === 'audio' && SAMPLES.get(x.c.sampleId)); if (!sc.length) return toast('Select audio clips to reverse');
  pushUndo('Reverse');
  sc.forEach(({ c }) => {
    const nat = clipNaturalLen(c);
    if (c.revOf && SAMPLES.has(c.revOf)) { const back = c.revOf; c.sampleId = back; delete c.revOf; }
    else {
      let rid = REVERSED.get(c.sampleId);
      if (!rid || !SAMPLES.has(rid)) { const s = SAMPLES.get(c.sampleId), b = LIVE_CTX.createBuffer(s.buf.numberOfChannels, s.buf.length, s.buf.sampleRate); for (let ch = 0; ch < b.numberOfChannels; ch++) { const d = s.buf.getChannelData(ch), o = b.getChannelData(ch); for (let i = 0, n = d.length; i < n; i++) o[i] = d[n - 1 - i]; } rid = addSample(b, s.name + ' (rev)', { recorded: true, path: null }); SAMPLES.get(rid).bpm = s.bpm; REVERSED.set(c.sampleId, rid); REVERSED.set(rid, c.sampleId); }
      c.revOf = c.sampleId; c.sampleId = rid;
    }
    c.offset = Math.max(0, nat - (c.offset + c.len)); [c.fadeIn, c.fadeOut] = [c.fadeOut, c.fadeIn];
  });
  arr.draw(); ui.detail(); toast(`Reversed ${sc.length} clip${sc.length > 1 ? 's' : ''}`);
}
function cropClips() {
  pushUndo('Crop'); let n = 0;
  if (V.time) S.tracks.filter(t => V.time.tracks.has(t.id)).forEach(t => { const keep = t.clips.map(c => cropClip(c, V.time.a, V.time.b)).filter(Boolean); n += keep.length; t.clips = keep; });
  selectedClips().forEach(({ c }) => { if (c.type === 'midi') { c.notes = flattenMidi(c); c.offset = 0; c.bars = c.len / 16; n++; } });
  if (!n) { UNDO.pop(); return toast('Select MIDI clips, or a time range, to crop'); }
  arr.draw(); ui.detail();
}
function selectTrackClips(t) { V.selClips = new Set(t.clips.map(c => c.id)); V.selTracks = new Set([t.id]); arr.draw(); }
function selectLoop() { const tr = S.tracks.filter(t => V.selTracks.has(t.id)); V.time = { a: S.loop.start, b: S.loop.end, tracks: new Set((tr.length ? tr : S.tracks).map(t => t.id)) }; V.selClips.clear(); arr.draw(); }

/* ---------- locators ---------- */
function jumpLocator(dir) {
  const p = nowPos(), ms = [...S.markers].sort((a, b) => a.t - b.t);
  const m = dir > 0 ? ms.find(x => x.t > p + 0.01) : [...ms].reverse().find(x => x.t < p - (T.playing ? 2 : 0.01));
  if (!m) return toast(dir > 0 ? 'No locator after this point' : 'No locator before this point'); seek(m.t);
  const w = arr.lanes.clientWidth / V.pps; if (m.t < V.scrollX || m.t > V.scrollX + w) V.scrollX = Math.max(0, m.t - w * 0.2);
}
function loopToNextLocator(m) { const ms = [...S.markers].sort((a, b) => a.t - b.t), nx = ms.find(x => x.t > m.t + 1e-6); S.loop = { on: true, start: m.t, end: nx ? nx.t : songEnd() }; markDirty(); ui.transport(); arr.draw(); }

/* ---------- zoom memory and fitting ---------- */
const ZOOMS = [];
function rememberZoom() { ZOOMS.push({ pps: V.pps, scrollX: V.scrollX }); if (ZOOMS.length > 20) ZOOMS.shift(); }
function zoomBack() { const z = ZOOMS.pop(); if (!z) return; V.pps = z.pps; V.scrollX = z.scrollX; arr.draw(); }
function fitHeights() {
  const avail = arr.lanes.clientHeight - S.returns.length * 41 - 51 - 20, n = S.tracks.length || 1;
  const h = clamp(Math.floor(avail / n) - 1, 26, 220); S.tracks.forEach(t => (t.h = h)); V.scrollY = 0; ui.headers();
}

/* ---------- autosave and recovery (desktop) ---------- */
let AUTO_DIR = null;
async function autosaveDir() { if (!IS_DESKTOP) return null; if (!AUTO_DIR) { const p = await NATIVE.paths(); AUTO_DIR = joinPath(joinPath(p.music, 'Studio B'), 'Autosave'); } return AUTO_DIR; }
async function autosaveNow() {
  if (!V.dirty || T.recording) return; const dir = await autosaveDir(); if (!dir) return;
  try { const file = joinPath(dir, 'Recovered.sbproj'); await writeRecordings(file); const P = serialise(); P.autosave = { at: Date.now(), name: S.name, path: S.path || null }; await NATIVE.write(file, JSON.stringify(P)); } catch (e) { console.warn('autosave', e.message); }
}
async function clearAutosave() { const dir = await autosaveDir(); if (!dir) return; try { await NATIVE.write(joinPath(dir, 'Recovered.sbproj'), ''); } catch (e) { } }
async function offerRecovery() {
  const dir = await autosaveDir(); if (!dir) return false; const file = joinPath(dir, 'Recovered.sbproj');
  if (!(await NATIVE.exists(file))) return false; let P = null; try { const txt = await NATIVE.readText(file); if (!txt) return false; P = JSON.parse(txt); } catch (e) { return false; }
  if (!P || !P.tracks || !P.autosave) return false;
  return new Promise(res => {
    const d = $('#recover'); $('#recoverMsg').textContent = `“${P.autosave.name}” has unsaved changes from ${new Date(P.autosave.at).toLocaleString()}. Studio B may have closed before they were saved.`;
    d.hidden = false;
    d.onclick = async e => { const b = e.target.closest('[data-v]'); if (!b) return; d.hidden = true; if (b.dataset.v === 'yes') { await loadProjectObj(P, P.autosave.path); S.path = P.autosave.path; S.name = P.autosave.name; delete S.autosave; V.dirty = true; ui.title(); toast('Recovered your unsaved work. Save it to keep it.'); res(true); } else { await clearAutosave(); res(false); } };
  });
}
setInterval(() => autosaveNow(), 60000);

/* ---------- automation shapes, copy and paste, extra lanes ---------- */
let AUTO_CLIP = null;
function insertAutoShape(b, p, shape, a, z) {
  pushUndo('Automation shape'); const lo = p.min, hi = p.max, len = z - a, per = ['Sine', 'Triangle', 'Square'].includes(shape) ? Math.max(BEAT(), Math.round(len / Math.max(1, Math.round(len / SPB()))) ) : len;
  const pts = (b.auto[p.key] || []).filter(q => q.t < a - 1e-6 || q.t > z + 1e-6), out = [], val = f => lo + (hi - lo) * f;
  const n = Math.max(1, Math.round(len / per));
  for (let k = 0; k < n; k++) { const s = a + k * per, e = Math.min(z, s + per), m = (s + e) / 2;
    if (shape === 'Sine') for (let j = 0; j <= 8; j++) out.push({ t: s + (e - s) * j / 8, v: val(0.5 + 0.5 * Math.sin(j / 8 * 2 * Math.PI)) });
    if (shape === 'Triangle') out.push({ t: s, v: val(0) }, { t: m, v: val(1) }, { t: e - 0.01, v: val(0) });
    if (shape === 'Square') out.push({ t: s, v: val(1) }, { t: m - 0.01, v: val(1) }, { t: m, v: val(0) }, { t: e - 0.01, v: val(0) });
    if (shape === 'Saw up') out.push({ t: s, v: val(0) }, { t: e - 0.01, v: val(1) });
    if (shape === 'Saw down') out.push({ t: s, v: val(1) }, { t: e - 0.01, v: val(0) });
    if (shape === 'Ramp up' || shape === 'Ramp down') { out.push({ t: a, v: val(shape === 'Ramp up' ? 0 : 1) }, { t: z, v: val(shape === 'Ramp up' ? 1 : 0) }); break; }
  }
  b.auto[p.key] = [...pts, ...out].sort((x, y) => x.t - y.t); arr.draw();
}
function copyAuto(b, key) { if (!V.time) return; const pts = (b.auto[key] || []).filter(q => q.t >= V.time.a && q.t <= V.time.b); const v0 = autoValue(b.auto[key], V.time.a), v1 = autoValue(b.auto[key], V.time.b); AUTO_CLIP = { len: V.time.b - V.time.a, pts: [{ t: 0, v: v0 }, ...pts.map(q => ({ ...q, t: q.t - V.time.a })), { t: V.time.b - V.time.a, v: v1 }].filter(q => q.v != null) }; toast('Automation copied'); }
function pasteAuto(b, key) { if (!AUTO_CLIP) return; pushUndo('Paste automation'); const a = V.insert, z = a + AUTO_CLIP.len; b.auto[key] = [...(b.auto[key] || []).filter(q => q.t < a - 1e-6 || q.t > z + 1e-6), ...AUTO_CLIP.pts.map(q => ({ ...q, t: q.t + a }))].sort((x, y) => x.t - y.t); arr.draw(); }
function addAutoLane(b) { b.lanes = b.lanes || []; const used = new Set([b.autoShow, ...b.lanes]); const p = autoParams(b).find(q => !used.has(q.key)) || autoParams(b)[0]; b.lanes.push(p.key); ui.headers(); }

/* ---------- group tracks ---------- */
function groupTracks() {
  const sel = S.tracks.filter(t => V.selTracks.has(t.id)); if (!sel.length) return toast('Select the tracks to group (Shift-click headers)');
  pushUndo('Group'); const parent = sel.every(t => t.group === sel[0].group) ? sel[0].group || null : null;
  const g = { id: uid(), kind: 'group', name: 'Group', color: sel[0].color, vol: 0.79, pan: 0, mute: false, solo: false, arm: false, sendA: 0, sendB: 0, h: 44, devices: [], clips: [], auto: {}, autoShow: 'vol', group: parent };
  const at = Math.min(...sel.map(t => S.tracks.indexOf(t))); const members = [...sel, ...sel.flatMap(t => t.kind === 'group' ? descendants(t) : [])];
  S.tracks = S.tracks.filter(t => !members.includes(t)); S.tracks.splice(Math.min(at, S.tracks.length), 0, g, ...members.filter((t, i) => members.indexOf(t) === i));
  sel.forEach(t => (t.group = g.id)); V.selTracks = new Set([g.id]); rebuildAll(); ui.all(); toast(`Grouped ${sel.length} tracks. Double-click the name to rename it.`);
}
function ungroupTrack(g) {
  if (!g || g.kind !== 'group') { g = S.tracks.find(t => V.selTracks.has(t.id) && t.kind === 'group'); if (!g) return toast('Select a group track first'); }
  pushUndo('Ungroup'); S.tracks.forEach(t => { if (t.group === g.id) t.group = g.group || null; }); removeBus(g); S.tracks = S.tracks.filter(t => t !== g); rebuildAll(); ui.all();
}

/* ---------- undo history ---------- */
function showUndoHistory() {
  if (!UNDO.length) return toast('Nothing to undo yet');
  const items = UNDO.map((u, i) => ({ i, label: u.label || 'Edit' })).reverse().slice(0, 30);
  popMenu(lastPointer, items.map((it, k) => ({ label: `${k === 0 ? 'Undo' : 'Undo back to'}: ${it.label}`, run: () => { for (let n = 0; n <= k; n++) undo(); } })));
}

/* ---------- input metering for armed audio tracks ---------- */
const INPUT_AN = new Map();
function inputAnalyser(t) { const inp = INPUTS.get(t.input || 'default'); if (!inp) return null; let an = INPUT_AN.get(inp); if (!an) { an = LIVE_CTX.createAnalyser(); an.fftSize = 1024; inp.src.connect(an); INPUT_AN.set(inp, an); } return an; }
