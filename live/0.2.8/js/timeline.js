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
  const pts = tempoPoints(), key = S.bpm + '|' + pts.map(p => p.t + ':' + p.v).join(',');
  if (key === _tmKey && _tm) return _tm;
  const segs = [{ p: 0, bpm: S.bpm, t: 0 }];
  [...pts].sort((a, b) => a.t - b.t).forEach(q => {
    const bpm = clamp(q.v, 20, 300);
    if (q.t <= 1e-9) { segs[0].bpm = bpm; return; }
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
function setSig(num, den) {
  num = clamp(Math.round(num) || 4, 1, 32); den = [1, 2, 4, 8, 16].includes(+den) ? +den : 4;
  S.sig = [num, den]; markDirty(); ui.all();
}
// Grid sizes that line up with the meter: fine divisions that divide a bar, then whole bars.
function gridCandidates() { if (V.triplet) { const spb = SPB(), base = [1 / 3, 2 / 3, 4 / 3, 8 / 3].filter(v => v < spb); const out = [...base]; for (let k = spb; k <= spb * 128; k *= 2) out.push(k); return out; } const spb = SPB(), fine = [0.25, 0.5, 1, 2, 4, 8].filter(v => v < spb && Math.abs(spb / v - Math.round(spb / v)) < 1e-9); if (!fine.includes(BEAT()) && BEAT() < spb) fine.push(BEAT()); fine.sort((a, b) => a - b); const out = [...fine]; for (let k = spb; k <= spb * 128; k *= 2) out.push(k); return out; }
