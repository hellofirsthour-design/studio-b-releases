/* ============ Studio B boot, commands, keyboard, animation loop ============ */
const VIS = new Set();
const METER = new Map();
let CLIPBOARD = null;

/* ---------- meters & lights ---------- */
const tbuf = new Float32Array(2048);
function readPeak(an) { const n = an.fftSize, b = n === 2048 ? tbuf : new Float32Array(n); an.getFloatTimeDomainData(b); let m = 0; for (let i = 0; i < n; i++) { const v = Math.abs(b[i]); if (v > m) m = v; } return m; }
function meter(id, el, an, now, horiz) {
  let st = METER.get(id); if (!st) METER.set(id, (st = { lvl: 0, pk: 0, pkT: 0, clip: false }));
  const p = readPeak(an), n = clamp((gainToDb(p) + 60) / 66, 0, 1); st.lastDb = gainToDb(p);
  st.lvl = n > st.lvl ? n : Math.max(n, st.lvl - 0.025);
  if (n >= st.pk) { st.pk = n; st.pkT = now; } else if (now - st.pkT > 1200) st.pk = Math.max(st.lvl, st.pk - 0.01);
  if (p >= 0.999) st.clip = true;
  if (!el) return st; const l = el.querySelector('.lvl'), k = el.querySelector('.pk');
  if (horiz) { l.style.transform = `scaleX(${st.lvl})`; k.style.left = st.pk * 100 + '%'; } else { l.style.transform = `scaleY(${st.lvl})`; k.style.bottom = st.pk * 100 + '%'; }
  k.style.opacity = st.pk > 0.02 ? 1 : 0; el.classList.toggle('clipped', st.clip);
  return st;
}
let lastFrame = 0;
function frame(now) {
  if (S) {
    allBuses().forEach(b => { const r = b === S.master ? { an: M.an } : RT.get(b.id); const an = b.arm && b.kind === 'audio' ? inputAnalyser(b) || (r && r.an) : r && r.an; if (an) meter(b.id, document.querySelector(`.hdr[data-id="${b.id}"]:not([data-lane]) .hmeter`), an, now); });
    const ms = meter('mainTop', $('#mmeter'), M.an, now, true);
    $('#mclip').classList.toggle('on', ms.clip);
    S.tracks.forEach(t => { const el = document.querySelector(`.hdr[data-id="${t.id}"] .hcol`); if (el) el.classList.toggle('on', now - (ACT.get(t.id) || 0) < 90); });
    const p = nowPos();
    const pp = T.playing ? posAt(ctx.currentTime) : p; $('#pos').textContent = inCountIn() ? 'Count ' + Math.ceil((T.countUntil - pp) / BEAT()) : barsBeats(p); $('#clock').textContent = fmtTimeMs(Math.max(0, songSec(p)));
    if (T.playing && hasTempoChanges() && document.activeElement !== $('#bpm')) $('#bpm').value = Math.round(bpmAt(p) * 100) / 100;
    const beat = Math.floor((((pp % SPB()) + SPB()) % SPB()) / BEAT()); if (T.playing && beat !== frame.lastBeat && !REDUCED) { const pb = $('#play'); pb.classList.remove('pulse'); void pb.offsetWidth; pb.classList.add('pulse'); } frame.lastBeat = beat; $$('#beats i').forEach((b, i) => b.classList.toggle('on', T.playing && i === beat));
    document.body.classList.toggle('blink', T.playing ? (p % 4) < 2 : (now % 1000) < 500);
    if (T.playing && V.follow && !arr.drag && !ZOOM.t) { const w = arr.lanes.clientWidth / V.pps, anchor = w * 0.45; // the playhead stays put and the grid glides past at playback speed
      if (p < V.scrollX || p > V.scrollX + w) V.scrollX = Math.max(0, p - anchor); else if (p > V.scrollX + anchor) V.scrollX = p - anchor; }
    // automated faders follow their envelopes
    if (T.playing && now - lastFrame > 60) { lastFrame = now; allBuses().forEach(b => { if (b.auto.vol && b.auto.vol.length) { const v = autoValue(b.auto.vol, p), el = document.querySelector(`.hdr[data-id="${b.id}"] .hvol`); if (el && document.activeElement !== el) el.value = v; const db = $(`[data-db="${b.id}"]`); if (db) db.textContent = faderDb(v); } }); }
    if (T.playing || arr.dirty || T.recording || now % 1000 < 20 || Math.abs((now % 1000) - 560) < 20) { arr.dirty = false; arr.render(); }
    if (T.playing && roll.clip && !$('#pane-clip').hidden) roll.draw_();
    mixer.frame(now);
    VIS.forEach(f => { if (f() === false) VIS.delete(f); });
  }
  requestAnimationFrame(frame);
}
const fmtTimeMs = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}.${String(Math.floor((s % 1) * 1000)).padStart(3, '0')}`;
function onWarpReady() { arr.draw(); }

/* ---------- commands (menus + shortcuts) ---------- */
function selectedClips() { return S.tracks.flatMap(t => t.clips.filter(c => V.selClips.has(c.id)).map(c => ({ t, c }))); }
function cmd(name) {
  if (T.busy) return;
  switch (name) {
    case 'new': return confirmLeave(() => newProject());
    case 'importMidi': return importMidiDialog();
    case 'capture': return captureMidi();
    case 'exportMidi': return exportMidiClip();
    case 'bounceSel': return bounceSelection();
    case 'open': return confirmLeave(openProjectDialog);
    case 'save': return saveProject(false);
    case 'saveAs': return saveProject(true);
    case 'collect': return collectAndSave();
    case 'importAudio': return importAudioDialog();
    case 'export': return showExport();
    case 'prefs': return showPrefs();
    case 'help': $('#help').hidden = false; return;
    case 'undo': return undo();
    case 'redo': return redo();
    case 'newAudio': return addTrack('audio');
    case 'newMidi': return addInstrumentTrack('synth', null);
    case 'newReturn': { if (S.returns.length >= 12) return toast('Studio B supports up to 12 returns'); pushUndo('Insert return'); S.returns.push(newBusLike('Return ' + RET_LETTERS[S.returns.length], [newDevice('verb', { ...DEVICES.verb.def(), mix: 1 })])); rebuildAll(); ui.all(); toast(`Added return ${RET_LETTERS[S.returns.length - 1]}. Every track has a send to it (Mixer view).`); return; }
    case 'addMarker': return addMarker(nowPos());
    case 'toggleDetailPane': setDetailShown($('#app').classList.contains('nodetail')); return;
    case 'toggleBrowser': V.browser = !V.browser; ui.transport(); arr.draw(); return;
    case 'toggleDetail': V.detail = V.detail === 'clip' ? 'devices' : V.detail === 'devices' ? 'clip' : 'clip'; ui.detail(); return;
    case 'crossfade': return createCrossfades();
    case 'freeze': case 'unfreeze': case 'flatten': case 'bounceInPlace': case 'bounceToNew': {
      const t = S.tracks.find(x => V.selTracks.has(x.id)); if (!t) return toast('Select a track first');
      return ({ freeze: freezeTrack, unfreeze: unfreezeTrack, flatten: flattenTrack, bounceInPlace, bounceToNew })[name](t);
    }
    case 'toggleMixer': setView(V.view === 'mix' ? 'arr' : 'mix'); return;
    case 'toggleAuto': V.autoMode = !V.autoMode; ui.all(); return;
    case 'toggleFollow': V.follow = !V.follow; ui.transport(); return;
    case 'zoomIn': zoomBy(1.25); return;
    case 'zoomOut': zoomBy(1 / 1.25); return;
    case 'zoomFit': V.pps = clamp(arr.lanes.clientWidth / (songEnd() + 8), 0.08, 120); V.scrollX = 0; arr.draw(); return;
    case 'loopSel': { const r = V.time || (V.selClips.size ? clipSpan() : null); if (!r) return toast('Select a time range or clips first'); S.loop = { on: true, start: r.a, end: r.b }; markDirty(); ui.transport(); arr.draw(); return; }
    case 'selectAll': V.selClips = new Set(S.tracks.flatMap(t => t.clips.map(c => c.id))); arr.draw(); return;
    case 'rename': { const sc = selectedClips(); if (sc.length) return renameClip(sc[0].c); const b = busById([...V.selTracks][0]); if (b) askText('Track name', b.name, v => { pushUndo(); b.name = v; ui.headers(); }); return; }
    case 'newClip': {
      const t = S.tracks.find(x => V.selTracks.has(x.id) && x.kind === 'midi') || S.tracks.find(x => x.kind === 'midi'); if (!t) return toast('Insert a MIDI track first (Ctrl+Shift+T)');
      pushUndo('Insert clip'); const a = V.time ? V.time.a : arr.snapFloor(V.insert), len = V.time ? V.time.b - V.time.a : SPB();
      const c = newMidiClip(a, len, t.name); c.bars = len / 16; clearRange(t, a, a + len); t.clips.push(c); openClip(c); return;
    }
    case 'copy': case 'cut': {
      const sc = selectedClips(); if (!sc.length) return; const a = Math.min(...sc.map(x => x.c.start));
      CLIPBOARD = sc.map(x => ({ track: x.t.id, kind: x.t.kind, c: { ...deep(x.c), start: x.c.start - a } })); toast(`${sc.length} clip${sc.length > 1 ? 's' : ''} ${name === 'cut' ? 'cut' : 'copied'}`);
      if (name === 'cut') { pushUndo('Cut'); sc.forEach(x => (x.t.clips = x.t.clips.filter(k => k !== x.c))); V.selClips.clear(); if (V.editClip && !clipById(V.editClip)) V.editClip = null; ui.detail(); arr.draw(); } return;
    }
    case 'paste': {
      if (!CLIPBOARD) return; pushUndo('Paste'); const at = V.insert, sel = S.tracks.find(t => V.selTracks.has(t.id)), firstTrack = CLIPBOARD[0].track, ids = [];
      CLIPBOARD.forEach(item => { let t = sel && item.track !== firstTrack ? S.tracks[S.tracks.indexOf(sel) + (S.tracks.findIndex(x => x.id === item.track) - S.tracks.findIndex(x => x.id === firstTrack))] : sel; if (!t || t.kind !== item.kind) t = S.tracks.find(x => x.id === item.track); if (!t) return; const c = deep(item.c); c.id = uid(); c.start += at; clearRange(t, c.start, c.start + c.len); t.clips.push(c); ids.push(c.id); });
      V.selClips = new Set(ids); const span = Math.max(...CLIPBOARD.map(x => x.c.start + x.c.len)); V.insert = at + span; arr.draw(); return;
    }
    case 'duplicate': {
      if (V.time && !V.selClips.size) { // duplicate a time range on its tracks
        pushUndo('Duplicate'); const { a, b } = V.time, len = b - a;
        S.tracks.filter(t => V.time.tracks.has(t.id)).forEach(t => { const copies = []; t.clips.forEach(c => { const s0 = Math.max(a, c.start), e0 = Math.min(b, c.start + c.len); if (e0 <= s0) return; const k = deep(c); k.id = uid(); k.offset = c.offset + (s0 - c.start); k.start = s0 + len; k.len = e0 - s0; copies.push(k); }); clearRange(t, b, b + len); t.clips.push(...copies); });
        V.time = { ...V.time, a: b, b: b + len }; V.insert = b; arr.draw(); return;
      }
      const sc = selectedClips(); if (!sc.length) return; pushUndo('Duplicate'); const { a, b } = clipSpan(), len = b - a, ids = [];
      sc.forEach(x => { const k = deep(x.c); k.id = uid(); k.start += len; clearRange(x.t, k.start, k.start + k.len); x.t.clips.push(k); ids.push(k.id); });
      V.selClips = new Set(ids); arr.draw(); return;
    }
    case 'delete': {
      if (V.selClips.size) { pushUndo('Delete'); S.tracks.forEach(t => (t.clips = t.clips.filter(c => !V.selClips.has(c.id)))); V.selClips.clear(); if (V.editClip && !clipById(V.editClip)) V.editClip = null; ui.detail(); arr.draw(); return; }
      if (V.time) { pushUndo('Delete'); S.tracks.filter(t => V.time.tracks.has(t.id)).forEach(t => clearRange(t, V.time.a, V.time.b)); allBuses().filter(b => V.time.tracks.has(b.id)).forEach(b => { const k = b.autoShow || 'vol'; if (V.autoMode && b.auto[k]) b.auto[k] = b.auto[k].filter(p => p.t < V.time.a || p.t > V.time.b); }); arr.draw(); }
      return;
    }
    case 'split': {
      const at = V.insert; let n = 0; pushUndo('Split');
      const cands = V.selClips.size ? selectedClips() : S.tracks.filter(t => V.selTracks.has(t.id)).flatMap(t => t.clips.map(c => ({ t, c })));
      if (V.time) cands.forEach(x => { if (splitClip(x.t, x.c, V.time.a)) n++; }), S.tracks.forEach(t => t.clips.forEach(c => { if (V.time.tracks.has(t.id) && splitClip(t, c, V.time.b)) n++; }));
      else cands.forEach(x => { if (splitClip(x.t, x.c, at)) n++; });
      if (!n) { UNDO.pop(); toast('Place the insert marker inside a clip to split it'); } arr.draw(); return;
    }
    case 'consolidate': {
      if (!V.selClips.size && V.time && V.time.b > V.time.a) { const t = S.tracks.find(x => V.time.tracks.has(x.id) && x.kind === 'audio'); if (t) return consolidateAudio(t, V.time.a, V.time.b); }
      const au = selectedClips().filter(x => x.c.type === 'audio'); if (au.length) { const t = au[0].t; if (au.some(x => x.t !== t)) return toast('Consolidate works on clips from one track'); const a = V.time && V.time.b > V.time.a ? V.time.a : Math.min(...au.map(x => x.c.start)), b = V.time && V.time.b > V.time.a ? V.time.b : Math.max(...au.map(x => x.c.start + x.c.len)); return consolidateAudio(t, a, b, au[0].c.name); }
      const sc = selectedClips().filter(x => x.c.type === 'midi'); if (sc.length < 1) return toast('Select clips on one track (or a time range) to consolidate');
      const t = sc[0].t; if (sc.some(x => x.t !== t)) return toast('Consolidate works on clips from one track');
      pushUndo('Consolidate'); const a = Math.min(...sc.map(x => x.c.start)), b = Math.max(...sc.map(x => x.c.start + x.c.len));
      const notes = sc.flatMap(x => flattenMidi(x.c).map(n => ({ ...n, s: n.s + x.c.start - a })));
      t.clips = t.clips.filter(c => !sc.some(x => x.c === c)); const c = newMidiClip(a, b - a, sc[0].c.name); c.bars = (b - a) / 16; c.len = b - a; c.notes = notes; t.clips.push(c); V.selClips = new Set([c.id]); openClip(c); return;
    }
    case 'quantize': { const sc = selectedClips().filter(x => x.c.type === 'midi'); if (!sc.length) { if (roll.clip) transform('quant'); return; } pushUndo('Quantize'); const g = arr.gridStep() >= 1 ? 1 : arr.gridStep(); sc.forEach(x => { const L = x.c.bars * 16; x.c.notes.forEach(n => { if (n.s < L) n.s = clamp(Math.round(n.s / g) * g, 0, L - g); }); }); arr.draw(); ui.detail(); toast('Quantized to 1/16'); return; }
    case 'deactivate': { const sc = selectedClips(); if (!sc.length) return; pushUndo('Deactivate'); const on = sc.some(x => !x.c.muted); sc.forEach(x => (x.c.muted = on)); arr.draw(); return; }
  }
}
const clipSpan = () => { const sc = selectedClips(); return { a: Math.min(...sc.map(x => x.c.start)), b: Math.max(...sc.map(x => x.c.start + x.c.len)) }; };
function zoomBy(k) { const cx = V.insert >= V.scrollX && V.insert <= arr.pos(arr.lanes.clientWidth) ? V.insert : arr.pos(arr.lanes.clientWidth / 2); const x = arr.x(cx); zoomSmooth((ZOOM.t ? ZOOM.t.pps : V.pps) * k, cx, x); }
// the clip and devices panel at the bottom can be hidden; a slim bar brings it back
function setDetailShown(on) { const app = $('#app'); app.classList.toggle('nodetail', !on); lsSet('sb-detailHidden', on ? '0' : '1'); $('#split').title = on ? 'Drag to resize' : 'Show clip and devices (Ctrl+Alt+L)'; arr.draw(); if (on) { ui.detail(); roll.draw_ && roll.draw_(); } }
function confirmLeave(fn) { if (!V.dirty) return fn(); const d = $('#leave'); d.hidden = false; d.onclick = async e => { const b = e.target.closest('[data-v]'); if (!b) return; d.hidden = true; if (b.dataset.v === 'save') { if (await saveProject()) fn(); } else if (b.dataset.v === 'discard') fn(); }; }

/* ---------- keyboard ---------- */
const KEYMAP = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ';': 16 };
const KB = { oct: 4, vel: 0.85, on: false };
function bindKeys() {
  document.addEventListener('keydown', e => {
    if (T.busy) { e.preventDefault(); return; }
    if (e.target.type === 'range') e.target.blur();
    const tag = (document.activeElement && document.activeElement.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (!$('#ask').hidden) return;
    if (rollKey(e)) { e.preventDefault(); return; }
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (KB.on && !mod && !e.altKey) {
      if (k === 'z' && !e.repeat) { KB.oct = clamp(KB.oct - 1, 0, 8); toast('Computer MIDI keyboard: C' + KB.oct); e.preventDefault(); return; }
      if (k === 'x' && !e.repeat) { KB.oct = clamp(KB.oct + 1, 0, 8); toast('Computer MIDI keyboard: C' + KB.oct); e.preventDefault(); return; }
      if (k === 'c' && !e.repeat) { KB.vel = clamp(KB.vel - 0.1, 0.1, 1); toast('Velocity ' + Math.round(KB.vel * 127)); return; }
      if (k === 'v' && !e.repeat) { KB.vel = clamp(KB.vel + 0.1, 0.1, 1); toast('Velocity ' + Math.round(KB.vel * 127)); return; }
      if (KEYMAP[k] != null) { e.preventDefault(); if (e.repeat) return; const ts = midiTargets('kb', 0); if (!ts.length) return; const off = KEYMAP[k]; ts.forEach(t => liveNoteOn(k + ':' + t.id, isPitched(t) ? KB.oct * 12 + 12 + off : off, KB.vel, t)); return; }
    }
    if (k === ' ') { e.preventDefault(); if (e.repeat) return; e.shiftKey ? (T.playing ? stop() : continuePlay()) : togglePlay(); return; }
    if (e.key === 'F9') { e.preventDefault(); recordButton(); return; }
    if (e.key === 'Home') { seek(0); V.scrollX = 0; return; }
    if (e.key === 'End') { seek(songEnd()); return; }
    if (e.key === 'Tab' && e.shiftKey) { e.preventDefault(); cmd('toggleDetail'); return; }
    if (e.key === 'Tab') { e.preventDefault(); cmd('toggleMixer'); return; }
    if (e.key === 'F1') { e.preventDefault(); cmd('help'); return; }
    if (mod) {
      if (e.shiftKey && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); return V.time ? deleteTime(V.time.a, V.time.b) : toast('Select a time range first'); }
      if (e.altKey && k === 'i') { e.preventDefault(); return V.time ? insertSilence(V.time.a, V.time.b) : toast('Select a time range first: its length is how much silence to insert'); }
      if (e.shiftKey && k === 'd') { e.preventDefault(); return V.time ? duplicateTime(V.time.a, V.time.b) : cmd('duplicate'); }
      if (e.shiftKey && k === 'j') { e.preventDefault(); return cropClips(); }
      if (e.altKey && k === 'z') { e.preventDefault(); return showUndoHistory(); }
      if (k === 'g') { e.preventDefault(); return e.shiftKey ? ungroupTrack() : groupTracks(); }
      if (k === '3') { e.preventDefault(); V.triplet = !V.triplet; arr.draw(); return toast(V.triplet ? 'Triplet grid' : 'Straight grid'); }
      if (e.shiftKey && k === 'c') { e.preventDefault(); return cmd('capture'); }
      if (!e.shiftKey && (k === 'm' || k === 'k')) { e.preventDefault(); return toggleMap(k === 'm' ? 'midi' : 'key'); }
      const map = { z: e.shiftKey ? 'redo' : 'undo', y: 'redo', s: e.shiftKey ? 'saveAs' : 'save', o: 'open', n: 'new', c: 'copy', x: 'cut', v: 'paste', d: 'duplicate', e: 'split', j: 'consolidate', u: 'quantize', l: 'loopSel', a: 'selectAll', r: 'rename', t: e.shiftKey ? 'newMidi' : 'newAudio', i: 'importAudio', m: e.shiftKey ? 'newClip' : null, '=': 'zoomIn', '+': 'zoomIn', '-': 'zoomOut', ',': 'prefs' };
      if (e.shiftKey && k === 'r') { e.preventDefault(); return cmd('export'); }
      if (e.shiftKey && k === 'f') { e.preventDefault(); return cmd('toggleFollow'); }
      if (e.altKey && k === 'b') { e.preventDefault(); return cmd('toggleBrowser'); }
      if (e.altKey && k === 'l') { e.preventDefault(); return cmd('toggleDetailPane'); }
      if (e.altKey && k === 'm') { e.preventDefault(); return cmd('toggleMixer'); }
      if (e.altKey && k === 'f') { e.preventDefault(); return cmd('crossfade'); }
      if (k === 'f' && !e.shiftKey) { e.preventDefault(); if (!V.browser) cmd('toggleBrowser'); $('#bsearch').focus(); return; }
      if (k === '1') { e.preventDefault(); V.fixedGrid = 0; $('#gridSel').value = '0'; lsSet('sb-grid', '0'); V.grid = Math.max(-2, V.grid - 1); arr.draw(); toast('Narrower grid'); return; }
      if (k === '2') { e.preventDefault(); V.fixedGrid = 0; $('#gridSel').value = '0'; lsSet('sb-grid', '0'); V.grid = Math.min(3, V.grid + 1); arr.draw(); toast('Wider grid'); return; }
      if (k === '4') { e.preventDefault(); V.snap = !V.snap; ui.transport(); toast(V.snap ? 'Snap to grid on' : 'Snap to grid off'); return; }
      if (map[k] && !IS_DESKTOP) { e.preventDefault(); return cmd(map[k]); }
      if (map[k] && IS_DESKTOP && ['=', '+', '-', '1', '2', '4'].includes(k)) { e.preventDefault(); return cmd(map[k]); }
      return; // the native menu handles the rest in the desktop app
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); return cmd('delete'); }
    if (k === 'a') { cmd('toggleAuto'); return; }
    if (k === 'm' && !e.repeat) { KB.on = !KB.on; $('#kbBtn').classList.toggle('on', KB.on); toast(KB.on ? 'Computer MIDI keyboard on: A W S E D F T G Y H U J K, Z/X octave' : 'Computer MIDI keyboard off'); return; }
    if (k === 'o' && !e.shiftKey) { S.metro = !S.metro; ui.transport(); return; }
    if (k === 'w' && e.shiftKey) { writerOpen(); return; }
    if (k === '0') return cmd('deactivate');
    if (k === 'r' && !e.shiftKey && selectedClips().some(x => x.c.type === 'audio')) return reverseClips();
    if (e.key === 'PageDown') { e.preventDefault(); return jumpLocator(1); }
    if (e.key === 'PageUp') { e.preventDefault(); return jumpLocator(-1); }
    if (k === 'x') return zoomBack();
    if (k === 'h') return fitHeights();
    if (k === 'w') { rememberZoom(); return cmd('zoomFit'); }
    if (k === 'l') { S.loop.on = !S.loop.on; ui.transport(); arr.draw(); return; }
    if (k === 'z') { const r = V.time || (V.selClips.size ? clipSpan() : null); if (r) { rememberZoom(); V.pps = clamp(arr.lanes.clientWidth / (r.b - r.a) * 0.9, 0.08, 120); V.scrollX = Math.max(0, r.a - (r.b - r.a) * 0.05); arr.draw(); } return; }
    if (k === '+' || k === '=') return zoomBy(1.25);
    if (k === '-') return zoomBy(1 / 1.25);
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { const g = arr.gridStep(), d = e.key === 'ArrowLeft' ? -g : g; const sc = selectedClips(); if (sc.length) { pushUndo('Nudge'); const lo = Math.min(...sc.map(x => x.c.start)); const dd = Math.max(d, -lo); sc.forEach(x => (x.c.start += dd)); settleClips(sc); } else seek(Math.max(0, V.insert + d)); arr.draw(); e.preventDefault(); return; }
    if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && (e.ctrlKey || e.metaKey) && e.altKey) { nudgeTrack(e.key === 'ArrowUp' ? -1 : 1); e.preventDefault(); return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { const i = S.tracks.findIndex(t => V.selTracks.has(t.id)), j = clamp(i + (e.key === 'ArrowUp' ? -1 : 1), 0, S.tracks.length - 1); if (S.tracks[j]) { V.selTracks = new Set([S.tracks[j].id]); ui.headers(); ui.detail(); } e.preventDefault(); return; }
  });
  document.addEventListener('keyup', e => { const k = e.key.toLowerCase(); [...held.keys()].filter(x => x === k || x.startsWith(k + ':')).forEach(x => liveNoteOff(x)); });
  window.addEventListener('blur', () => [...held.keys()].forEach(liveNoteOff));
  if (navigator.requestMIDIAccess) navigator.requestMIDIAccess().then(acc => {
    const hook = inp => (inp.onmidimessage = m => { if (GP.midiOff && GP.midiOff[inp.id]) return; if (midiMapIn(m.data)) return; const [st, n, v] = m.data, c = st & 0xf0; if (c === 0xe0) { liveBend(st & 15, ((v << 7) | n) / 8192 - 1); return; } if (c === 0x90 && v > 0) midiTargets(inp.id, st & 15).forEach(t => liveNoteOn('midi' + n + ':' + t.id, padNote(t, n), v / 127, t, st & 15)); else if (c === 0x80 || (c === 0x90 && v === 0)) [...held.keys()].filter(k => k.startsWith('midi' + n + ':')).forEach(k => liveNoteOff(k, c === 0x80 ? v / 127 : undefined)); });
    const list = () => { window.MIDI_INS = [...acc.inputs.values()].map(i => ({ id: i.id, name: i.name })); }; list();
    acc.inputs.forEach(hook); acc.onstatechange = () => { acc.inputs.forEach(hook); list(); if (V.showIO) ui.headers(); };
  }).catch(() => { });
}

/* ---------- transport bar ---------- */
const taps = [];
function bindBar() {
  $('#play').onclick = () => togglePlay();
  $('#stop').onclick = () => { if (T.playing) stop(); else seek(0); };
  $('#capture').onclick = () => captureMidi();
  $('#midiOd').onclick = () => { V.midiOd = !V.midiOd; ui.transport(); toast(V.midiOd ? 'MIDI overdub on: recording adds notes to the clips already there' : 'MIDI overdub off: recording replaces, and keeps takes'); };
  $('#rec').onclick = () => recordButton();
  $('#writerBtn').onclick = () => writerOpen();
  $('#metro').onclick = () => { S.metro = !S.metro; ui.transport(); };
  $('#loopBtn').onclick = () => { S.loop.on = !S.loop.on; ui.transport(); arr.draw(); };
  $('#follow').onclick = () => cmd('toggleFollow');
  $('#autoBtn').onclick = () => cmd('toggleAuto');
  $('#snapBtn').onclick = () => { V.snap = !V.snap; ui.transport(); };
  $('#autoArm').onclick = () => { V.autoArm = !V.autoArm; ui.transport(); toast(V.autoArm ? 'Automation Arm on: move controls while playing to record them' : 'Automation Arm off'); };
  $('#reAuto').onclick = () => reenableAutomation();
  V.fixedGrid = lsGet('sb-grid') && lsGet('sb-grid') !== '0' ? lsGet('sb-grid') : 0; $('#gridSel').value = String(V.fixedGrid || 0);
  $('#gridSel').onchange = e => { V.fixedGrid = e.target.value === '0' ? 0 : e.target.value; lsSet('sb-grid', e.target.value); arr.draw(); roll.draw_ && roll.draw_(); e.target.blur(); };
  $('#gridSel').onkeydown = e => e.stopPropagation();
  if (IS_DESKTOP) document.body.classList.add('desktop');
  setInterval(async () => { const el = $('#cpu'); if (!el) return; el.hidden = !NE.on; if (!NE.on) return; const st = await neStatus(); if (st) { el.textContent = Math.round(st.cpu * 100) + ' %'; el.classList.toggle('hot', st.cpu > 0.8); } }, 700);
  $$('[data-col]').forEach(x => (x.onclick = () => colToggle(x.dataset.col)));
  $('#mapMidi').onclick = () => toggleMap('midi'); $('#mapKey').onclick = () => toggleMap('key');
  $('#kbBtn').onclick = () => { KB.on = !KB.on; $('#kbBtn').classList.toggle('on', KB.on); };
  applyLook(); applyOutputMono(); if (GP.outId) applyOutputDevice();
  $('#bpm').onchange = e => setBpm(+e.target.value || S.bpm);
  $('#sig').onchange = e => { const m = String(e.target.value).match(/(\d+)\s*\/\s*(\d+)/); if (m) setSig(+m[1], +m[2]); else ui.transport(); };
  $('#sig').onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); };
  $('#countIn').onclick = e => countInMenu(e.currentTarget); $('#countIn').oncontextmenu = e => { e.preventDefault(); countInMenu(e.currentTarget); };
  $('#punchIn').onclick = () => { S.punch = S.punch || {}; S.punch.in = !S.punch.in; markDirty(); ui.transport(); if (S.punch.in) toast('Punch in: recording starts at the loop start. Set the range with the loop brace.'); };
  $('#punchOut').onclick = () => { S.punch = S.punch || {}; S.punch.out = !S.punch.out; markDirty(); ui.transport(); if (S.punch.out) toast('Punch out: recording stops at the loop end.'); };
  $('#bpm').onwheel = e => { e.preventDefault(); setBpm(S.bpm - Math.sign(e.deltaY) * (e.shiftKey ? 0.1 : 1)); };
  $('#tap').onclick = () => { const n = performance.now(); if (taps.length && n - taps[taps.length - 1] > 2000) taps.length = 0; taps.push(n); if (taps.length > 6) taps.shift(); if (taps.length >= 3) setBpm(60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1))); };
  $('#root').onchange = e => { S.root = +e.target.value; markDirty(); DEV_RT.forEach(d => d instanceof TuneDev && d.set()); ui.detail(); };
  $('#scale').onchange = e => { S.scale = e.target.value; markDirty(); DEV_RT.forEach(d => d instanceof TuneDev && d.set()); ui.detail(); };
  $('#mclip').onclick = () => METER.forEach(m => (m.clip = false));
  $('#saveBtn').onclick = () => cmd('save'); $('#openBtn').onclick = () => cmd('open'); $('#fileBtn').onclick = e => templateMenu(e); $('#exportBtn').onclick = () => cmd('export'); $('#helpBtn').onclick = () => cmd('help');
  $('#prefsBtn').onclick = () => cmd('prefs'); $('#browserBtn').onclick = () => cmd('toggleBrowser');
  $$('#dtabs [data-d]').forEach(b => (b.onclick = () => { V.detail = b.dataset.d; ui.detail(); }));
  $('#viewBtn').onclick = () => cmd('toggleMixer');
  $('#addAudio').onclick = () => cmd('newAudio'); $('#addMidi').onclick = () => cmd('newMidi');
  $$('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) m.hidden = true; }));
  // splitter between arrangement and detail
  const spl = $('#split'), app = $('#app'); const setH = h => { h = clamp(h, 160, innerHeight - 260); lsSet('sb-detailH', h); sizeDetail(); arr.draw(); roll.draw_(); };   // only the Clip view resizes
  sizeDetail(); addEventListener('resize', () => sizeDetail());
  setDetailShown(lsGet('sb-detailHidden') !== '1'); $('#dHide').onclick = () => setDetailShown(false);
  spl.onpointerdown = e => { if (app.classList.contains('nodetail')) { setDetailShown(true); return; } if (V.detail !== 'clip') return; spl.setPointerCapture(e.pointerId); const y0 = e.clientY, h0 = $('#detail').offsetHeight; spl.onpointermove = ev => setH(h0 - (ev.clientY - y0)); spl.onpointerup = () => (spl.onpointermove = null); };
  document.addEventListener('dragover', e => e.preventDefault());
  document.addEventListener('drop', e => { if (e.defaultPrevented) return; e.preventDefault(); const f = e.dataTransfer.files[0]; if (f && /\.(als|sbproj|json)$/i.test(f.name)) f.arrayBuffer().then(data => confirmLeave(() => openProjectFile({ name: f.name, path: IS_DESKTOP && f.path ? f.path : null, data }))); });
}

/* ---------- dialogs ---------- */
function showExport() {
  const d = $('#export'); d.hidden = false;
  $('#exRange').innerHTML = `<option value="song">Whole song (1.1.1 to ${barsBeats(songEnd())})</option><option value="loop" ${S.loop.on ? 'selected' : ''}>Loop brace (${barsBeats(S.loop.start)} to ${barsBeats(S.loop.end)})</option>${V.time ? `<option value="sel">Time selection</option>` : ''}`;
  try { const m = JSON.parse(localStorage.getItem('sb-export') || '{}'); if (m.format) $('#exFmt').value = m.format; if (m.kbps) $('#exKbps').value = m.kbps; if (m.dither != null) $('#exDither').checked = m.dither; if (m.bits) $('#exBits').value = m.bits; if (m.sr) $('#exSr').value = m.sr; } catch (e) { }
  const fmtUi = () => { const mp3 = $('#exFmt').value === 'mp3'; $('#exKbpsF').hidden = !mp3; $('#exBitsF').hidden = mp3; $('#exDitherF').hidden = mp3 || $('#exBits').value === '32'; }; $('#exFmt').onchange = fmtUi; $('#exBits').onchange = fmtUi; fmtUi();
  $('#exWhat').onchange = () => ($('#exStemOpts').hidden = $('#exWhat').value === 'mix'); $('#exStemOpts').hidden = $('#exWhat').value === 'mix'; $('#exProgText').textContent = '';
  $('#exGo').onclick = async () => {
    const o = { range: $('#exRange').value, sr: +$('#exSr').value, bits: +$('#exBits').value, normalize: $('#exNorm').checked, tail: +$('#exTail').value, format: $('#exFmt').value, kbps: +$('#exKbps').value, dither: $('#exDither').checked, loop: $('#exLoop').checked }, what = $('#exWhat').value;
    try { localStorage.setItem('sb-export', JSON.stringify({ format: o.format, kbps: o.kbps, dither: o.dither, bits: o.bits, sr: o.sr })); } catch (e) { }
    $('#exGo').disabled = true;
    try { if (what === 'mix') await exportAudio(o); else await exportStems({ ...o, onlySelected: what === 'stemsSel', returns: $('#exReturns').checked, main: $('#exReturns').checked }); d.hidden = true; }
    catch (e) { console.error(e); toast('Export failed: ' + e.message); } finally { showBusy(null); }
    $('#exGo').disabled = false;
  };
}
/* ---------- live updates (desktop) ---------- */
function showUpdate(u) {
  if (!u) return; const bar = $('#updbar'), go = $('#updGo');
  const set = (title, msg, btn, fn) => { $('#updTitle').textContent = title; $('#updMsg').textContent = msg; go.hidden = !btn; go.textContent = btn || ''; go.onclick = fn; bar.hidden = false; };
  $('#updLater').onclick = () => (bar.hidden = true);
  if (u.state === 'ready') set(`Studio B ${u.version} is ready`, u.notes ? u.notes : 'Restart to use it. If you wait, it applies the next time you open Studio B.', 'Restart now', () => confirmLeave(() => { V.dirty = false; NATIVE.restart(); }));
  else if (u.state === 'reinstall') set(`Studio B ${u.version} needs a fresh install`, 'This update changes the app itself, so it has to be downloaded once.', 'Download', () => NATIVE.openReleases());
  else if (u.state === 'downloading') set(`Downloading ${u.version}…`, 'You can keep working.', null);
  else if (u.state === 'current') { bar.hidden = true; toast(`You have the latest version (${u.version})`); }
  else if (u.state === 'error') { bar.hidden = true; toast('Update check: ' + u.message, 5000); }
}
/* ---------- starter song ---------- */
async function demoProject() {
  const P = emptyProject(); const keep = S; S = P;
  P.name = 'First Light'; P.bpm = 92; P.root = 9; P.scale = 'minor'; P.tracks = [];
  const N = (p, s, l, v = 0.85) => ({ p, s, l, v, c: 1 });
  const loopBuf = await demoLoop(); const sid = addSample(loopBuf, 'Rhodes loop 90', { path: null });
  const au = newTrack('audio'); au.name = 'Rhodes'; au.color = COLORS[3]; au.h = 72; au.devices = [newDevice('eq'), newDevice('tape', { ...DEVICES.tape.def(), mix: 0.18 })]; au.sendA = 0.2;
  const c1 = newAudioClip(sid, 0, 0); c1.warp = true; c1.srcBpm = 90; c1.len = clipNaturalLen(c1); c1.fadeIn = 2;
  const c2 = deep(c1); c2.id = uid(); c2.start = c1.len; c2.fadeIn = 0; const c3 = deep(c1); c3.id = uid(); c3.start = 64; c3.len = 64; c3.fadeIn = 0;
  au.clips = [c1, c2, c3];
  const dr = newTrack('midi', 'drums', 'Drums'); dr.color = COLORS[0]; dr.h = 64; dr.devices = [newDevice('comp', { thresh: -20, ratio: 4, attack: 12, release: 90, knee: 6, makeup: 4, mix: 0.6 }), newDevice('sat', { style: 'Tape', drive: 7, tone: 0.1, lowcut: 20, punish: false, mix: 0.7, out: 0 })];
  const beat = []; [0, 7, 10].forEach(s => beat.push(N(0, s, 1, 0.95))); [4, 12].forEach(s => beat.push(N(1, s, 1, 0.9))); for (let s = 0; s < 16; s += 2) beat.push(N(3, s, 1, s % 4 ? 0.45 : 0.7)); beat.push(N(2, 12, 1, 0.5));
  const dc = newMidiClip(32, 96, 'Pocket'); dc.bars = 1; dc.notes = beat; dr.clips = [dc];
  const bs = newTrack('midi', 'synth', 'Bass'); bs.color = COLORS[1]; Object.assign(bs.inst, SYNTH_PRESETS['Sub Bass'], { preset: 'Sub Bass' });
  const roots = [33, 26, 29, 28]; const bc = newMidiClip(32, 96, 'Roots'); bc.bars = 4; bc.notes = roots.flatMap((r, i) => [N(r, i * 16, 6, 0.9), N(r, i * 16 + 7, 3, 0.7), N(r + 12, i * 16 + 10, 2, 0.6), N(r, i * 16 + 12, 3, 0.75)]); bs.clips = [bc];
  const pd = newTrack('midi', 'synth', 'Pad'); pd.color = COLORS[4]; Object.assign(pd.inst, SYNTH_PRESETS['Warm Pad'], { preset: 'Warm Pad' }); pd.sendA = 0.45; pd.vol = 0.66;
  const ch = [[57, 60, 64, 67], [50, 53, 57, 60], [53, 57, 60, 64], [52, 55, 59, 62]];
  const pc = newMidiClip(0, 128, 'Air'); pc.bars = 4; pc.notes = ch.flatMap((c, i) => c.map(p => N(p, i * 16, 16, 0.5))); pd.clips = [pc];
  pd.auto = { 'inst:cutoff': [{ t: 0, v: 500 }, { t: 32, v: 1300 }, { t: 96, v: 2400 }, { t: 128, v: 700 }] }; pd.autoShow = 'inst:cutoff';
  au.auto = { vol: [{ t: 0, v: 0.55 }, { t: 16, v: 0.79 }] };
  P.tracks = [au, dr, bs, pd];
  P.markers = [{ id: uid(), t: 0, name: 'Intro' }, { id: uid(), t: 32, name: 'Verse' }, { id: uid(), t: 96, name: 'Outro' }];
  P.loop = { on: false, start: 32, end: 64 };
  S = keep; return P;
}

/* ---------- boot ---------- */
(async function boot() {
  await audioReady; PITCH_OK = PITCH_OK || false;
  ioInit(); S = emptyProject(); buildMaster(); rebuildAll();
  arr.init(); bindHeaders(); bindBar(); bindKeys(); await packsInit(); await browser.init();
  const pending = IS_DESKTOP ? await NATIVE.pendingOpen() : null;
  // every launch starts a fresh set (your default set if you saved one); the demo song is on the New menu. Tests ask for the demo with ?demo.
  if (pending) await openPath(pending); else if (!(await offerRecovery())) { if (/[?&]demo/.test(location.search)) await loadProjectObj(await demoProject()); else await newProject(); }
  V.selTracks = new Set(S.tracks[0] ? [S.tracks[0].id] : []); ui.all(); V.dirty = false; ui.title();
  if (IS_DESKTOP) { NATIVE.onMenu(c => { const a = document.activeElement, txt = a && (a.tagName === 'INPUT' && a.type !== 'range' || a.tagName === 'TEXTAREA'); const ed = { copy: 'copy', cut: 'cut', paste: 'paste', selectAll: 'selectAll', undo: 'undo', redo: 'redo', delete: 'delete' }[c]; if (txt && ed) { document.execCommand(ed); return; } cmd(c); }); NATIVE.onOpenPath(p => confirmLeave(() => openPath(p))); if (NATIVE.onUpdate) { NATIVE.onUpdate(showUpdate); NATIVE.appInfo().then(i => i.update && showUpdate(i.update)); } }
  requestAnimationFrame(frame);
  const resume = () => { if (ctx.state !== 'running') ctx.resume(); }; document.addEventListener('pointerdown', resume, { once: true }); document.addEventListener('keydown', resume, { once: true });
  window.SB_ready = true;
  neInit().then(on => { if (on) { ui.all(); toast(`Native audio: ${NE.dev.outputName} at ${NE.dev.sampleRate} Hz, ${NE.dev.buffer} samples`); } });
})();
