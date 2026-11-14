/* ============ Timeline: meter and tempo map ============
   Positions are in steps (sixteenth notes). The meter sets how many steps make a bar.
   Tempo changes live on the Main track's "Song Tempo" automation lane as steps: each point holds its tempo
   until the next one. (Ramps would make warped audio drift on this engine, so changes are instant.) */
const SIG = () => (S && S.sig) || [4, 4];
const SPB = () => (SIG()[0] * 16) / SIG()[1];   // steps per bar
const BEAT = () => 16 / SIG()[1];                // steps per beat
let _tm = null, _tmKey = '';
function tempoPoints() { return (S && S.master && S.master.auto && S.master.auto.tempo) || []; }
function tempoMap() {
  const pts = tempoPoints(), key = S.bpm + '|' + BEAT() + '|' + pts.map(p => p.t + ':' + p.v + (p.ramp ? 'r' : '')).join(',');
  if (key === _tmKey && _tm) return _tm;
  const segs = [{ p: 0, bpm: S.bpm, t: 0 }];
  let prev = null;
  [...pts].sort((a, b) => a.t - b.t).forEach(q => {
    const bpm = clamp(q.v, 20, 300);
    if (q.t <= 1e-9) { segs[0].bpm = bpm; prev = { t: 0, v: bpm }; return; }
    if (q.ramp && prev && q.t - prev.t > BEAT()) { const st = BEAT(), b0 = clamp(prev.v, 20, 300); for (let p = prev.t; p < q.t - 1e-6; p += st) { const mid = Math.min(p + st / 2, (p + q.t) / 2), v = b0 + (bpm - b0) * (mid - prev.t) / (q.t - prev.t), last = segs[segs.length - 1]; if (p <= 1e-9) segs[0].bpm = v; else if (Math.abs(last.bpm - v) > 1e-6) segs.push({ p, bpm: v, t: 0 }); } }
    prev = q;
    const last = segs[segs.length - 1]; if (Math.abs(last.bpm - bpm) < 1e-6) return;
    segs.push({ p: q.t, bpm, t: 0 });
  });
  for (let i = 1; i < segs.length; i++) segs[i].t = segs[i - 1].t + (segs[i].p - segs[i - 1].p) * 15 / segs[i - 1].bpm;
  _tmKey = key; _tm = segs; return segs;
}
const segAtPos = p => { const s = tempoMap(); let i = s.length - 1; while (i > 0 && s[i].p > p) i--; return s[i]; };
function songSec(p) { const s = segAtPos(p); return s.t + (p - s.p) * 15 / s.bpm; }          // seconds from 1.1.1
function songPos(sec) { const s = tempoMap(); let i = s.length - 1; while (i > 0 && s[i].t > sec) i--; return s[i].p + (sec - s[i].t) * s[i].bpm / 15; }
const bpmAt = p => segAtPos(p).bpm;
const durSec = (p, len) => songSec(p + len) - songSec(p);
const tempoChangesIn = (a, b) => tempoMap().slice(1).map(s => s.p).filter(p => p > a + 1e-9 && p < b - 1e-9);
const nextTempoChange = p => { const c = tempoMap().find(s => s.p > p + 1e-9); return c ? c.p : Infinity; };
const hasTempoChanges = () => tempoMap().length > 1;
/* Meter changes: S.sigs = [{ bar, n, d }] (bar is 1-based). The meter at 1.1.1 is S.sig. */
let _mm = null, _mmKey = '';
function meterMap() {
  const key = JSON.stringify([SIG(), S.sigs || []]); if (key === _mmKey && _mm) return _mm;
  const mk = (p, bar, n, d) => ({ p, bar, n, d, spb: n * 16 / d, bt: 16 / d }), segs = [mk(0, 0, SIG()[0], SIG()[1])];
  [...(S.sigs || [])].sort((a, b) => a.bar - b.bar).forEach(c => { const l = segs[segs.length - 1], b0 = Math.max(1, Math.round(c.bar) - 1); if (b0 <= l.bar) { if (b0 === l.bar) Object.assign(l, mk(l.p, l.bar, c.n, c.d)); return; } segs.push(mk(l.p + (b0 - l.bar) * l.spb, b0, c.n, c.d)); });
  _mmKey = key; _mm = segs; return segs;
}
const meterAt = p => { const s = meterMap(); let i = s.length - 1; while (i > 0 && s[i].p > p + 1e-9) i--; return s[i]; };
// bar starts between a and b: [{ p, bar (0-based), spb, bt }]
function barLines(a, b) {
  const out = [], segs = meterMap();
  segs.forEach((s, i) => { const end = i + 1 < segs.length ? segs[i + 1].p : Infinity; let k = Math.max(0, Math.floor((a - s.p) / s.spb)); for (let p = s.p + k * s.spb; p < Math.min(end, b + s.spb) && out.length < 20000; p += s.spb, k++) if (p >= a - s.spb && p <= b) out.push({ p, bar: s.bar + k, spb: Math.min(s.spb, end - p), bt: s.bt }); });
  return out;
}
const barPos = p => { const s = meterAt(p), k = Math.floor((p - s.p) / s.spb + 1e-9); return { bar: s.bar + k, start: s.p + k * s.spb, s }; };
const isBarStart = p => Math.abs(barPos(p).start - p) < 1e-6;
function setMeterAt(bar, n, d) { pushUndo('Time signature change'); S.sigs = (S.sigs || []).filter(c => c.bar !== bar); if (n) S.sigs.push({ bar, n, d }); if (!S.sigs.length) delete S.sigs; markDirty(); ui.all(); }

function setSig(num, den) {
  num = clamp(Math.round(num) || 4, 1, 32); den = [1, 2, 4, 8, 16].includes(+den) ? +den : 4;
  if (S.sig && S.sig[0] === num && S.sig[1] === den) return; pushUndo('Time signature'); S.sig = [num, den]; markDirty(); ui.all();
}
// Grid sizes that line up with the meter: fine divisions that divide a bar, then whole bars.
function gridCandidates() { if (V.triplet) { const spb = SPB(), base = [1 / 3, 2 / 3, 4 / 3, 8 / 3].filter(v => v < spb); const out = [...base]; for (let k = spb; k <= spb * 128; k *= 2) out.push(k); return out; } const spb = SPB(), fine = [0.25, 0.5, 1, 2, 4, 8].filter(v => v < spb && Math.abs(spb / v - Math.round(spb / v)) < 1e-9); if (!fine.includes(BEAT()) && BEAT() < spb) fine.push(BEAT()); fine.sort((a, b) => a - b); const out = [...fine]; for (let k = spb; k <= spb * 128; k *= 2) out.push(k); return out; }
