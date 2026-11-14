/* ============ Groove pool ============
   A groove is a timing and velocity template over a short cycle: { id, name, cycle (steps), pts: [{ at, shift, vel }] }.
   MIDI clips play with their groove (c.groove) live, at the global amount S.grooveAmt; Commit writes it into the notes.
   Audio clips get the groove committed straight away, as warp markers on their transients. */
const SWINGS = [54, 58, 62, 66, 71, 75];
const GROOVE_LIB = [
  ...SWINGS.map(p => ({ id: 'sw8-' + p, name: `Swing 8ths ${p}%`, cycle: 4, pts: [{ at: 0, shift: 0, vel: 1 }, { at: 2, shift: 4 * p / 100 - 2, vel: 0.9 }] })),
  ...SWINGS.map(p => ({ id: 'sw16-' + p, name: `Swing 16ths ${p}%`, cycle: 2, pts: [{ at: 0, shift: 0, vel: 1 }, { at: 1, shift: 2 * p / 100 - 1, vel: 0.88 }] })),
  { id: 'push16', name: 'Pushed 16ths', cycle: 4, pts: [{ at: 0, shift: 0, vel: 1 }, { at: 1, shift: -0.08, vel: 0.85 }, { at: 2, shift: -0.05, vel: 0.95 }, { at: 3, shift: -0.1, vel: 0.8 }] },
  { id: 'lazy16', name: 'Laid back 16ths', cycle: 4, pts: [{ at: 0, shift: 0.04, vel: 1 }, { at: 1, shift: 0.16, vel: 0.82 }, { at: 2, shift: 0.08, vel: 0.95 }, { at: 3, shift: 0.18, vel: 0.8 }] },
  { id: 'dilla', name: 'Drunk 16ths', cycle: 16, pts: [...Array(16)].map((_, i) => ({ at: i, shift: [0, 0.22, 0.05, 0.3, -0.04, 0.2, 0.1, 0.28, 0, 0.25, 0.06, 0.32, -0.06, 0.18, 0.12, 0.3][i], vel: [1, 0.7, 0.85, 0.65, 0.95, 0.72, 0.84, 0.6, 1, 0.68, 0.86, 0.62, 0.93, 0.7, 0.8, 0.64][i] })) },
];
const grooveById = id => (S.grooves || []).find(g => g.id === id) || GROOVE_LIB.find(g => g.id === id) || null;
// timing shift (steps) and velocity factor for a note at song position p
function grooveAt(g, p, amt = (S.grooveAmt != null ? S.grooveAmt : 1)) {
  if (!g || !g.pts.length) return { shift: 0, vel: 1 }; const a = amt * (g.amount != null ? g.amount : 1), L = ((p % g.cycle) + g.cycle) % g.cycle, tol = Math.max(0.26, g.cycle / g.pts.length / 2);
  let best = null, bd = Infinity; g.pts.forEach(q => { const d = Math.min(Math.abs(L - q.at), g.cycle - Math.abs(L - q.at)); if (d < bd) { bd = d; best = q; } });
  if (!best || bd > tol) return { shift: 0, vel: 1 }; return { shift: best.shift * a, vel: 1 + (best.vel - 1) * a };
}
function applyGroove(id, clips) {
  const g = grooveById(id); if (!g) return; const list = clips || selectedClips().map(x => x.c); if (!list.length) return toast('Select clips to groove');
  pushUndo('Groove'); let audio = 0;
  list.forEach(c => { if (c.type === 'midi') c.groove = id; else if (c.type === 'audio') { audio++; warpFromTransients(c); c.wm.forEach(m => { const pos = c.start + m.x - c.offset, gg = grooveAt(g, Math.round(pos * 4) / 4); m.x += gg.shift; }); c.wm.sort((a, b) => a.x - b.x); } });
  if (!(S.grooves || []).some(x => x.id === id)) { S.grooves = S.grooves || []; S.grooves.push(deep(g)); }
  arr.draw(); ui.detail(); if (T.playing) play(nowPos()); toast(`${g.name} on ${list.length} clip${list.length > 1 ? 's' : ''}${audio ? ' (audio is grooved with warp markers)' : ''}`);
}
function commitGroove(c) {
  const g = grooveById(c.groove); if (!g) return; pushUndo('Commit groove'); const base = c.start - c.offset;
  c.notes.forEach(n => { const gg = grooveAt(g, base + n.s); n.s = Math.max(0, n.s + gg.shift); n.v = clamp(n.v * gg.vel, 0.01, 1); }); delete c.groove; ui.detail(); arr.draw();
}
// Extract a one-bar groove from a clip: the average timing offset and accent of each 16th.
function extractGroove(c) {
  let hits = [];
  if (c.type === 'midi') hits = flattenMidi(c).map(n => ({ pos: c.start + n.s, v: n.v }));
  else { const tr = transientsOf(c.sampleId), s = SAMPLES.get(c.sampleId); hits = tr.map(sec => ({ pos: c.start + xOfSec(c, sec) - c.offset, v: 0.8 })).filter(h => h.pos >= c.start && h.pos < c.start + c.len); }
  if (hits.length < 4) return toast('Not enough notes or hits in that clip to make a groove');
  const cyc = SPB(), slots = [...Array(Math.round(cyc))].map(() => ({ off: [], v: [] })), meanV = hits.reduce((a, h) => a + h.v, 0) / hits.length;
  hits.forEach(h => { const r = Math.round(h.pos), k = ((r % cyc) + cyc) % cyc; if (Math.abs(h.pos - r) > 0.45) return; slots[k].off.push(h.pos - r); slots[k].v.push(h.v / (meanV || 1)); });
  const pts = slots.map((s, k) => s.off.length ? { at: k, shift: s.off.reduce((a, b) => a + b, 0) / s.off.length, vel: clamp(s.v.reduce((a, b) => a + b, 0) / s.v.length, 0.3, 1.5) } : null).filter(Boolean);
  pushUndo('Extract groove'); S.grooves = S.grooves || []; const g = { id: uid(), name: c.name + ' groove', cycle: cyc, pts }; S.grooves.push(g); browser.sel = 'grooves'; browser.render(); toast(`Extracted "${g.name}" into the groove pool`); return g;
}
