/* ============ Warp markers, transients and warp modes ============
   A warped clip maps its content (in steps, the same units as c.offset) to source seconds. Without markers that is one
   straight line at the clip's BPM. Warp markers c.wm = [{ x, s }] pin content step x to source second s; between them the
   audio is stretched to fit. Playback splits a marked clip into segments that each play as an ordinary warped clip.
   Warp modes: complex (stretch, keeps pitch), beats (slices at transients, each played at its own speed),
   repitch (speed and pitch change together, like a turntable). */
const WARP_MODES = [['complex', 'Complex'], ['beats', 'Beats'], ['repitch', 'Re-Pitch']];
const hasWm = c => c.type === 'audio' && c.warp && c.wm && c.wm.length > 0;
function secOfX(c, x) {
  const r = 15 / (c.srcBpm || S.bpm), m = hasWm(c) ? c.wm : null; if (!m) return x * r;
  if (x <= m[0].x) return m[0].s + (x - m[0].x) * r;
  for (let i = 1; i < m.length; i++) if (x <= m[i].x) { const a = m[i - 1], b = m[i]; return a.s + (b.s - a.s) * (x - a.x) / (b.x - a.x || 1); }
  const l = m[m.length - 1]; return l.s + (x - l.x) * r;
}
function xOfSec(c, s) {
  const r = (c.srcBpm || S.bpm) / 15, m = hasWm(c) ? c.wm : null; if (!m) return s * r;
  if (s <= m[0].s) return m[0].x + (s - m[0].s) * r;
  for (let i = 1; i < m.length; i++) if (s <= m[i].s) { const a = m[i - 1], b = m[i]; return a.x + (b.x - a.x) * (s - a.s) / (b.s - a.s || 1); }
  const l = m[m.length - 1]; return l.x + (s - l.s) * r;
}
// Transients: peaks of the onset envelope, at least 60 ms apart.
function transientsOf(sid) {
  const s = SAMPLES.get(sid); if (!s) return []; if (s.trans) return s.trans;
  const env = s.env || onsetEnvelope(monoOf(s.buf)), hop = 512 / s.buf.sampleRate; let mx = 0; for (const v of env) mx = Math.max(mx, v);
  const out = [], gap = Math.ceil(0.06 / hop), th = mx * 0.18;
  for (let i = 2; i < env.length - 2; i++) { const v = env[i]; if (v < th) continue; let peak = true; for (let k = -3; k <= 3; k++) if (k && env[i + k] > v) { peak = false; break; } if (peak && (!out.length || i - out[out.length - 1] >= gap)) out.push(i); }
  s.trans = out.map(i => Math.max(0, i * hop - hop * 0.5)); return s.trans;
}
// Split a clip into the pieces that actually play (one piece when nothing special is going on).
function expandWarp(c) {
  if (c.type !== 'audio' || !c.warp || c.frozen || c.timebase === 'song') return [c];
  const beats = c.wmode === 'beats'; if (!hasWm(c) && !beats) return [c];
  const x0 = c.offset, x1 = c.offset + c.len, cuts = new Set([x0, x1]);
  if (hasWm(c)) c.wm.forEach(m => { if (m.x > x0 && m.x < x1) cuts.add(m.x); });
  if (beats) transientsOf(c.sampleId).forEach(sec => { const x = xOfSec(c, sec); if (x > x0 + 0.05 && x < x1 - 0.05) cuts.add(x); });
  const xs = [...cuts].sort((a, b) => a - b), out = [];
  for (let i = 0; i < xs.length - 1; i++) {
    const xa = xs[i], xb = xs[i + 1]; if (xb - xa < 0.02) continue;
    const sa = secOfX(c, xa), sb = secOfX(c, xb); if (sb - sa < 1e-4) continue;
    const start = c.start + (xa - c.offset), d = start - c.start, first = !out.length, last = i === xs.length - 2;
    let bpm, len = xb - xa;
    if (beats) { bpm = bpmAt(start); len = Math.min(len, (sb - sa) * bpm / 15 + 0.01); } // each slice at its own speed; a gap when the beat is slower
    else bpm = (xb - xa) * 15 / (sb - sa);
    const env = c.env ? Object.fromEntries(Object.entries(c.env).map(([k, pts]) => [k, (pts || []).map(p => ({ ...p, t: p.t - d }))])) : undefined;
    out.push({ ...c, id: c.id + '#' + i, start, len, offset: sa * bpm / 15, srcBpm: bpm, wm: null, wmode: beats ? 'complex' : c.wmode, loop: false, fadeIn: first ? c.fadeIn : 0, fadeOut: last ? c.fadeOut : 0, xf: first ? c.xf : 0, env, _seg: c.id });
  }
  return out.length ? out : [c];
}
/* ---------- editing ---------- */
function addWarpMarker(c, pos) {
  if (c.type !== 'audio') return; if (!c.warp) { c.warp = true; c.srcBpm = c.srcBpm || S.bpm; }
  const x = pos - c.start + c.offset, s = secOfX(c, x); c.wm = (c.wm || []).filter(m => Math.abs(m.x - x) > 0.05); c.wm.push({ x, s }); c.wm.sort((a, b) => a.x - b.x);
}
function warpFromTransients(c) {
  if (!c.warp) { c.warp = true; c.srcBpm = c.srcBpm || S.bpm; }
  const tr = transientsOf(c.sampleId); c.wm = tr.map(s => ({ x: xOfSec(c, s), s })).filter((m, i, a) => !i || m.x - a[i - 1].x > 0.1); return c.wm.length;
}
function quantizeWarp(c, grid) { if (!hasWm(c)) return; const g = grid || 1; const base = c.start - c.offset; c.wm.forEach(m => { m.x = Math.round((base + m.x) / g) * g - base; }); c.wm = c.wm.filter((m, i, a) => !i || m.x - a[i - 1].x > 0.02); }
function warpMenu(c, pos) {
  const items = [{ label: 'Add warp marker here', run: () => { pushUndo('Warp marker'); addWarpMarker(c, pos); arr.draw(); ui.detail(); } },
    { label: 'Warp markers from transients', run: () => { pushUndo('Warp markers'); const n = warpFromTransients(c); arr.draw(); ui.detail(); toast(`${n} warp markers. Drag the yellow handles to move the audio.`); } }];
  if (hasWm(c)) items.push({ label: 'Quantize warp markers to the grid', run: () => { pushUndo('Quantize warp'); quantizeWarp(c, arr.gridStep()); arr.draw(); if (T.playing) play(nowPos()); } }, { label: 'Clear warp markers', run: () => { pushUndo('Clear warp'); c.wm = []; arr.draw(); ui.detail(); if (T.playing) play(nowPos()); } });
  items.push(...WARP_MODES.map(([k, l]) => ({ label: `Warp mode: ${l}${(c.wmode || 'complex') === k ? ' ✓' : ''}`, run: () => { pushUndo('Warp mode'); c.warp = true; c.srcBpm = c.srcBpm || S.bpm; c.wmode = k; arr.draw(); ui.detail(); if (T.playing) play(nowPos()); } })));
  return items;
}
