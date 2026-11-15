/* ============ MIDI effects: they sit before a MIDI track's instrument and change notes as they play ============
   t.midifx = [{ id, type, on, p }]. Notes from clips pass through the chain in the scheduler; notes you play live
   pass through it too. The Arpeggiator turns held chords into patterns, from clips and from the keyboard. */
const ARP_STYLES = ['up', 'down', 'up-down', 'down-up', 'converge', 'diverge', 'random', 'as played', 'chord'];
const ARP_RATES = [[0.5, '1/32'], [2 / 3, '1/16T'], [1, '1/16'], [4 / 3, '1/8T'], [2, '1/8'], [3, '1/8D'], [8 / 3, '1/4T'], [4, '1/4'], [8, '1/2']];
const MIDIFX = {
  arp: { name: 'Arpeggiator', blurb: 'Chords into patterns', def: () => ({ style: 'up', rate: 1, gate: 0.6, octaves: 1, transpose: 12, vel: 'as played', decay: 0, hold: false }),
    params: [SEL('style', 'Style', ARP_STYLES), SEL('rate', 'Rate', ARP_RATES), K('gate', 'Gate', 0.05, 2, { fmt: v => Math.round(v * 100) + '%' }), K('octaves', 'Octaves', 1, 4, { step: 1, fmt: v => v + '' }), K('transpose', 'Octave step', 1, 24, { step: 1, fmt: v => v + ' st' }), K('decay', 'Vel decay', 0, 1, { fmt: fPct }), TOG('hold', 'Hold')] },
  chord: { name: 'Chord', blurb: 'Adds up to six notes', def: () => ({ s1: 4, s2: 7, s3: 0, s4: 0, s5: 0, s6: 0, vel: 1 }),
    params: [1, 2, 3, 4, 5, 6].map(i => K('s' + i, 'Shift ' + i, -24, 24, { step: 1, fmt: v => (v > 0 ? '+' : '') + v })).concat([K('vel', 'Velocity', 0, 1.5, { fmt: fPct })]) },
  scale: { name: 'Scale', blurb: 'Keeps notes in key', def: () => ({ follow: true, root: 0, scale: 'minor', transpose: 0 }),
    params: [TOG('follow', 'Song key'), SEL('root', 'Root', PC.map((n, i) => [i, n])), SEL('scale', 'Scale', Object.keys(SCALES)), K('transpose', 'Transpose', -12, 12, { step: 1, fmt: v => (v > 0 ? '+' : '') + v + ' st' })] },
  length: { name: 'Note Length', blurb: 'Fixed or scaled lengths', def: () => ({ mode: 'gate', len: 1, gate: 1 }),
    params: [SEL('mode', 'Mode', ['gate', 'fixed']), K('len', 'Length', 0.25, 16, { scale: 'log', fmt: v => barsBeatsLen(v) }), K('gate', 'Gate', 0.05, 3, { fmt: v => Math.round(v * 100) + '%' })] },
  random: { name: 'Random', blurb: 'Random pitch changes', def: () => ({ chance: 0.5, choices: 2, step: 12, sign: 'add', scale: true }),
    params: [K('chance', 'Chance', 0, 1, { fmt: fPct }), K('choices', 'Choices', 1, 12, { step: 1, fmt: v => v + '' }), K('step', 'Scale', 1, 12, { step: 1, fmt: v => v + ' st' }), SEL('sign', 'Sign', ['add', 'sub', 'bi']), TOG('scale', 'In key')] },
  velocity: { name: 'Velocity', blurb: 'Shape velocities', def: () => ({ mode: 'scale', lo: 0, hi: 1, drive: 0, random: 0, fixed: 0.8 }),
    params: [SEL('mode', 'Mode', ['scale', 'fixed']), K('lo', 'Out low', 0, 1, { fmt: fPct }), K('hi', 'Out high', 0, 1, { fmt: fPct }), K('drive', 'Drive', -1, 1, { fmt: fPct }), K('random', 'Random', 0, 1, { fmt: fPct }), K('fixed', 'Fixed', 0.01, 1, { fmt: fPct })] },
  pitch: { name: 'Pitch', blurb: 'Transpose and range', def: () => ({ semis: 0, lo: 0, hi: 127 }),
    params: [K('semis', 'Pitch', -48, 48, { step: 1, fmt: v => (v > 0 ? '+' : '') + v + ' st' }), K('lo', 'Lowest', 0, 127, { step: 1, fmt: v => noteName(v) }), K('hi', 'Highest', 0, 127, { step: 1, fmt: v => noteName(v) })] },
};
const newMidiFx = type => ({ id: uid(), type, on: true, p: MIDIFX[type].def() });
const hasArp = t => (t.midifx || []).some(f => f.on && f.type === 'arp');

// One note through one effect. Each note: { p, pos, dur, vel, rv, mpe }. Returns a list (empty drops the note).
function fxNote(f, n, t) {
  const p = f.p, out = x => [x];
  switch (f.type) {
    case 'pitch': { const q = n.p + Math.round(p.semis); return q >= p.lo && q <= p.hi && q >= 0 && q <= 127 ? out({ ...n, p: q }) : []; }
    case 'chord': return [n, ...[1, 2, 3, 4, 5, 6].map(i => Math.round(p['s' + i])).filter((s, i, a) => s && a.indexOf(s) === i).map(s => ({ ...n, p: clamp(n.p + s, 0, 127), vel: clamp(n.vel * p.vel, 0.01, 1) }))];
    case 'scale': { const root = p.follow ? S.root : +p.root, sc = p.follow ? S.scale : p.scale; return out({ ...n, p: clamp(snapToScale(n.p + Math.round(p.transpose), root, sc), 0, 127) }); }
    case 'length': return out({ ...n, dur: p.mode === 'fixed' ? p.len : Math.max(0.05, (n.dur || 1) * p.gate) });
    case 'random': {
      if (Math.random() >= p.chance) return out(n);
      const k = 1 + Math.floor(Math.random() * Math.max(1, Math.round(p.choices))), sg = p.sign === 'sub' ? -1 : p.sign === 'bi' ? (Math.random() < 0.5 ? -1 : 1) : 1;
      let q = clamp(n.p + sg * k * Math.round(p.step), 0, 127); if (p.scale) q = snapToScale(q); return out({ ...n, p: q });
    }
    case 'velocity': {
      let v = p.mode === 'fixed' ? p.fixed : n.vel; if (p.drive) v = p.drive > 0 ? Math.pow(v, 1 - p.drive * 0.8) : Math.pow(v, 1 - p.drive * 2);
      v = p.lo + (p.hi - p.lo) * v; if (p.random) v += (Math.random() * 2 - 1) * p.random * 0.5; return out({ ...n, vel: clamp(v, 0.01, 1) });
    }
  }
  return out(n);
}
// The order an arpeggio walks a chord, over several octaves.
function arpOrder(f, chord) {
  const p = f.p, base = p.style === 'as played' ? chord : [...chord].sort((a, b) => a.p - b.p), oct = Math.max(1, Math.round(p.octaves));
  let seq = []; for (let o = 0; o < oct; o++) base.forEach(n => seq.push({ ...n, p: clamp(n.p + o * Math.round(p.transpose), 0, 127) }));
  const up = seq, down = [...seq].reverse();
  switch (p.style) {
    case 'down': return down;
    case 'up-down': return up.length > 1 ? [...up, ...down.slice(1, -1)] : up;
    case 'down-up': return down.length > 1 ? [...down, ...up.slice(1, -1)] : down;
    case 'converge': { const o = []; let a = 0, b = up.length - 1; while (a <= b) { o.push(up[a++]); if (a <= b) o.push(up[b--]); } return o; }
    case 'diverge': { const m = Math.floor(up.length / 2), o = [up[m]]; for (let k = 1; o.length < up.length; k++) { if (m + k < up.length) o.push(up[m + k]); if (m - k >= 0) o.push(up[m - k]); } return o; }
    default: return up;
  }
}
function arpExpand(f, notes) { // chords (notes that start together) become steps across their length
  const p = f.p, rate = +p.rate || 1, groups = []; notes.forEach(n => { const g = groups.find(x => Math.abs(x.pos - n.pos) < 0.02); if (g) g.notes.push(n); else groups.push({ pos: n.pos, notes: [n] }); });
  const out = [];
  groups.forEach(g => {
    const len = Math.max(...g.notes.map(n => n.dur || rate)), seq = arpOrder(f, g.notes); if (!seq.length) return;
    const steps = Math.max(1, Math.round(len / rate));
    for (let i = 0; i < steps; i++) {
      const pos = g.pos + i * rate, d = Math.max(0.05, rate * p.gate), v0 = 1 - p.decay * (i / Math.max(1, steps - 1));
      if (p.style === 'chord') seq.slice(0, g.notes.length).forEach(n => out.push({ ...n, pos, dur: d, vel: clamp(n.vel * v0, 0.01, 1) }));
      else { const n = p.style === 'random' ? seq[Math.floor(Math.random() * seq.length)] : seq[i % seq.length]; out.push({ ...n, pos, dur: d, vel: clamp(n.vel * v0, 0.01, 1) }); }
    }
  });
  return out;
}
// All notes that start in a scheduler window, through the whole chain.
function runMidiFx(t, notes) {
  for (const f of t.midifx || []) { if (!f.on) continue; notes = f.type === 'arp' ? arpExpand(f, notes) : notes.flatMap(n => fxNote(f, n, t)); }
  return notes;
}
// Scheduler side: processed notes wait in a queue so arpeggios spread over later windows (and stop cleanly).
function midiFxQueue(t, inst, notes, from, to) {
  const r = RT.get(t.id); if (!r) return; r.mq = r.mq || [];
  if (notes.length) { r.mq.push(...runMidiFx(t, notes)); r.mq.sort((a, b) => a.pos - b.pos); }
  const end = S.loop.on && T.playing && !isOffline() ? S.loop.end : Infinity;
  while (r.mq.length && r.mq[0].pos < to - 1e-9) { const n = r.mq.shift(); if (n.pos < from - 0.5 || n.pos >= end) continue; inst.noteOn(n.p, Math.max(ctx.currentTime, timeAt(n.pos)), n.vel, durSec(n.pos, n.dur) * 0.98, n.rv, n.mpe); }
}
function clearMidiFxQueues() { RT.forEach(r => { if (r.mq) r.mq.length = 0; }); }

/* ---------- live notes (computer keyboard, MIDI controller) ---------- */
const LIVE_ARP = new Map();   // track id -> { held: [], next, i }
function liveFxOn(t, note, vel) {   // returns the voices to release on note-off
  const inst = RT.get(t.id) && RT.get(t.id).inst; if (!inst) return [];
  const f = (t.midifx || []).find(x => x.on && x.type === 'arp');
  if (f) { let a = LIVE_ARP.get(t.id); if (!a || (!f.p.hold && !a.held.length)) { a = { held: a && f.p.hold ? a.held : [], next: ctx.currentTime, i: 0, latched: false }; LIVE_ARP.set(t.id, a); }
    if (f.p.hold && a.latched) { a.held = []; a.latched = false; } a.held.push({ p: note, vel, pos: 0, dur: 1 }); return []; }
  let notes = [{ p: note, vel, pos: 0, dur: null }]; for (const x of t.midifx || []) if (x.on) notes = notes.flatMap(n => fxNote(x, n, t));
  return notes.map(n => { const v = inst.noteOn(n.p, ctx.currentTime, n.vel, n.dur != null && (t.midifx || []).some(x => x.on && x.type === 'length') ? durSec(nowPos(), n.dur) : null); return v; }).filter(Boolean);
}
function liveFxOff(t, note) { const a = LIVE_ARP.get(t.id); if (!a) return; const f = (t.midifx || []).find(x => x.on && x.type === 'arp'); if (f && f.p.hold) { a.latched = true; return; } a.held = a.held.filter(n => n.p !== note); }
setInterval(() => { // the live arpeggiator's clock
  if (typeof S === 'undefined' || !S || isOffline()) return; const now = ctx.currentTime;
  LIVE_ARP.forEach((a, id) => {
    const t = S.tracks.find(x => x.id === id), f = t && (t.midifx || []).find(x => x.on && x.type === 'arp'), inst = t && RT.get(t.id) && RT.get(t.id).inst;
    if (!f || !inst || !a.held.length) { a.next = Math.max(a.next, now); return; }
    const stepSec = (+f.p.rate || 1) * 15 / bpmAt(T.playing ? nowPos() : V.insert);
    if (a.next < now - 0.1) a.next = now;
    while (a.next < now + 0.06) {
      let seq = arpOrder(f, a.held); if (!seq.length) break;
      const rest = (t.midifx || []).filter(x => x.on && x.type !== 'arp'), at = a.next, d = stepSec * f.p.gate;
      const picks = f.p.style === 'chord' ? seq.slice(0, a.held.length) : [f.p.style === 'random' ? seq[Math.floor(Math.random() * seq.length)] : seq[a.i % seq.length]];
      picks.forEach(n => { let ns = [{ ...n }]; rest.forEach(x => (ns = ns.flatMap(m => fxNote(x, m, t)))); ns.forEach(m => inst.noteOn(m.p, at, m.vel, d)); });
      a.i++; a.next += stepSec;
    }
  });
}, 15);

/* ---------- cards ---------- */
function midiFxCard(t, f, i) {
  const def = MIDIFX[f.type], c = cardShell(def.name, 'MIDI effect · ' + def.blurb, { power: true, off: !f.on, tools: `<button class="ic" data-mv="-1" aria-label="Move left">‹</button><button class="ic" data-mv="1" aria-label="Move right">›</button><button class="ic" data-rm aria-label="Remove">✕</button>` });
  c.classList.add('midifx'); const body = $('.cb', c);
  $('.pwr', c).onclick = () => { f.on = !f.on; c.classList.toggle('off', !f.on); $('.pwr', c).classList.toggle('on', f.on); clearMidiFxQueues(); markDirty(); };
  $('[data-rm]', c).onclick = () => { pushUndo('Remove MIDI effect'); t.midifx.splice(i, 1); LIVE_ARP.delete(t.id); clearMidiFxQueues(); ui.detail(); };
  $$('[data-mv]', c).forEach(b => (b.onclick = () => { const j = i + +b.dataset.mv; if (j < 0 || j >= t.midifx.length) return; [t.midifx[i], t.midifx[j]] = [t.midifx[j], t.midifx[i]]; ui.detail(); markDirty(); }));
  body.appendChild(paramGrid(def.params, f.p, k => { if (k === 'rate' || k === 'root') f.p[k] = +f.p[k]; clearMidiFxQueues(); markDirty(); }));
  return c;
}
function addMidiFx(type, t) {
  t = t || S.tracks.find(x => V.selTracks.has(x.id) && x.kind === 'midi') || S.tracks.find(x => x.kind === 'midi'); if (!t) return toast('Insert a MIDI track first (Ctrl+Shift+T)');
  if (t.kind !== 'midi') return toast('MIDI effects go on MIDI tracks');
  pushUndo('Add MIDI effect'); t.midifx = t.midifx || []; t.midifx.push(newMidiFx(type)); V.selTracks = new Set([t.id]); V.detail = V.detail === 'clip' ? 'both' : V.detail; ui.all();
}
