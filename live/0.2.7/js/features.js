/* ============ Track rendering (Freeze / Flatten / Bounce), stems, crossfades ============ */
function showBusy(text) { const b = $('#busybar'); if (!b) return; b.hidden = !text; if (text) $('#busyText').textContent = text; }
function trackEnd(t) { return Math.max(0, ...t.clips.map(c => c.start + c.len)); }
// Render one track's output after its devices, before its fader (what Freeze prints).
async function renderTrack(t, { prefader = true } = {}) {
  const end = trackEnd(t); if (end <= 0) { toast('This track has no clips to render'); return null; }
  return renderRange(0, end + SPB(), { only: t.id, prefader, tail: 2, sr: LIVE_CTX.sampleRate });
}
const songClip = (sid, len, name) => ({ id: uid(), type: 'audio', sampleId: sid, start: 0, len, offset: 0, name, muted: false, gain: 0, semis: 0, warp: false, timebase: 'song', srcBpm: S.bpm, fadeIn: 0, fadeOut: 0 });
async function freezeTrack(t) {
  if (t.frozen) return toast(`${t.name} is already frozen`);
  if (T.recording) return; showBusy(`Freezing ${t.name}…`);
  try {
    const buf = await renderTrack(t); if (!buf) return;
    pushUndo('Freeze'); const sid = addSample(buf, `${t.name} (frozen)`, { recorded: true, path: null });
    t.frozen = { sid, len: songPos(buf.duration) }; t.arm = false; rewire(t); applyMix(t); ui.all(); toast(`Froze ${t.name}. Its devices are off until you unfreeze it.`);
  } finally { showBusy(null); }
}
function unfreezeTrack(t) { if (!t.frozen) return; pushUndo('Unfreeze'); delete t.frozen; rewire(t); applyMix(t); ui.all(); }
function flattenTrack(t) {
  if (!t.frozen) return toast('Freeze the track first, or use Bounce Track in Place');
  pushUndo('Flatten'); removeBus(t);
  const c = songClip(t.frozen.sid, t.frozen.len, t.name); c.len = Math.min(c.len, trackEnd(t) + SPB());
  t.kind = 'audio'; delete t.inst; t.devices = []; t.clips = [c]; delete t.frozen; delete t.takes; t.auto = Object.fromEntries(Object.entries(t.auto).filter(([k]) => ['vol', 'pan', 'sendA', 'sendB'].includes(k)));
  t.monitor = 'auto'; buildBus(t, 'track'); ui.all(); toast(`${t.name} is now an audio track`);
}
async function bounceInPlace(t) { await freezeTrack(t); if (t.frozen) flattenTrack(t); }
async function bounceToNew(t) {
  showBusy(`Bouncing ${t.name}…`);
  try {
    const buf = await renderTrack(t); if (!buf) return;
    pushUndo('Bounce'); const sid = addSample(buf, `${t.name} (bounce)`, { recorded: true, path: null });
    const n = newTrack('audio'); n.name = `${t.name} (bounce)`; n.color = t.color; n.vol = t.vol; n.pan = t.pan; n.sendA = t.sendA; n.sendB = t.sendB;
    n.clips = [songClip(sid, Math.min(songPos(buf.duration), trackEnd(t) + SPB()), n.name)];
    S.tracks.splice(S.tracks.indexOf(t) + 1, 0, n); buildBus(n, 'track'); t.mute = true; applyMix(t);
    V.selTracks = new Set([n.id]); ui.all(); toast(`Bounced to a new audio track. ${t.name} is switched off.`);
  } finally { showBusy(null); }
}
function trackRenderMenu(t) {
  const items = [];
  if (t.frozen) items.push({ label: 'Unfreeze Track', run: () => unfreezeTrack(t) }, { label: 'Flatten', run: () => flattenTrack(t) });
  else items.push({ label: 'Freeze Track', run: () => freezeTrack(t) });
  items.push({ label: 'Bounce Track in Place', run: () => bounceInPlace(t) }, { label: 'Bounce to New Track', run: () => bounceToNew(t) });
  return items;
}

/* ---------- stems ---------- */
async function exportStems(opts) {
  const a = opts.range === 'loop' ? S.loop.start : opts.range === 'sel' && V.time ? V.time.a : 0;
  const b = opts.range === 'loop' ? S.loop.end : opts.range === 'sel' && V.time ? V.time.b : songEnd();
  const targets = [...S.tracks.filter(t => !opts.onlySelected || V.selTracks.has(t.id)), ...(opts.returns ? S.returns : [])];
  if (opts.main) targets.push(S.master);
  if (!targets.length) return toast('Nothing to export');
  let dir = null; if (IS_DESKTOP) { dir = await NATIVE.folderDialog(); if (!dir) return; }
  const pad = n => String(n).padStart(2, '0');
  for (let i = 0; i < targets.length; i++) {
    const tb = targets[i], name = tb === S.master ? 'Main' : tb.name;
    showBusy(`Rendering ${i + 1} of ${targets.length}: ${name}`); $('#exProgText') && ($('#exProgText').textContent = `${i + 1} of ${targets.length}: ${name}`);
    const buf = await renderRange(a, b, { sr: opts.sr, tail: opts.tail, only: tb === S.master ? null : tb.id, prefader: false });
    const file = `${slug(S.name)} - ${pad(i + 1)} ${slug(name)}.wav`, data = encodeWav(buf, opts.bits, opts.normalize);
    if (dir) await NATIVE.write(joinPath(dir, file), data); else await saveBytes('wav', file, data);
  }
  showBusy(null); toast(`Exported ${targets.length} stems${dir ? ' to ' + basename(dir) : ''}`);
  if (dir) NATIVE.reveal(joinPath(dir, `${slug(S.name)} - 01 ${slug(targets[0] === S.master ? 'Main' : targets[0].name)}.wav`));
}

/* ---------- crossfades ---------- */
function createCrossfades() {
  const sel = S.tracks.flatMap(t => t.clips.filter(c => c.type === 'audio' && V.selClips.has(c.id)).map(c => ({ t, c })));
  const targets = [];
  sel.forEach(({ t, c }) => { if (leftOf(t, c)) targets.push({ t, c }); const R = rightOf(t, c); if (R && !targets.some(x => x.c === R)) targets.push({ t, c: R }); });
  if (V.time) S.tracks.filter(t => V.time.tracks.has(t.id) && t.kind === 'audio').forEach(t => t.clips.forEach(c => { if (c.start > V.time.a && c.start < V.time.b && leftOf(t, c)) targets.push({ t, c, len: Math.min(c.start - V.time.a, V.time.b - c.start) * 2 }); }));
  if (!targets.length) return toast('Select audio clips that touch (or a range across where they meet) to crossfade them');
  pushUndo('Crossfade'); targets.forEach(x => { x.c.xf = x.len || Math.max(x.c.xf || 0, BEAT() / 2); }); arr.draw();
  toast(`Crossfaded ${targets.length} edit${targets.length > 1 ? 's' : ''}. Drag the handle at the bottom of the edit to change its length.`);
}
