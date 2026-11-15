/* ============ Writer: chords, melody, bass and beats that write MIDI clips ============
   The chord progression is the backbone: Melody and Bass follow the last progression written (or the one chosen).
   Everything lands as ordinary MIDI clips you can edit, so the tools suggest and you decide. */
const WR = { prog: null, last: {} };
const PROGS = {
  pop: { mode: 'major', list: [['I', 'V', 'vi', 'IV'], ['vi', 'IV', 'I', 'V'], ['I', 'vi', 'IV', 'V'], ['IV', 'I', 'V', 'vi'], ['I', 'IV', 'vi', 'V']] },
  trap: { mode: 'minor', list: [['i', 'bVI', 'bIII', 'bVII'], ['i', 'iv', 'bVI', 'V'], ['i', 'bVII', 'bVI', 'bVII'], ['i', 'v', 'bVI', 'iv'], ['i', 'bVI', 'iv', 'v']] },
  lofi: { mode: 'major', list: [['ii7', 'V7', 'Imaj7', 'vi7'], ['Imaj7', 'vi7', 'ii7', 'V7'], ['IVmaj7', 'iii7', 'ii7', 'Imaj7'], ['iii7', 'vi7', 'ii7', 'V7'], ['Imaj7', 'IVmaj7', 'iii7', 'VI7']] },
  gospel: { mode: 'major', list: [['IVmaj7', 'V7', 'iii7', 'vi7'], ['I', 'iii7', 'IV', 'iv'], ['ii9', 'V13', 'Imaj9', 'VI7'], ['Imaj9', 'I7', 'IVmaj9', 'iv7'], ['vi9', 'ii9', 'V7sus4', 'Imaj9']] },
  rnb: { mode: 'major', list: [['Imaj9', 'vi9', 'ii9', 'V9sus4'], ['ii9', 'V9', 'Imaj9', 'IVmaj9'], ['vi9', 'IVmaj9', 'Imaj9', 'V9'], ['IVmaj9', 'iii9', 'vi9', 'V7sus4']] },
  edm: { mode: 'minor', list: [['i', 'bVI', 'bVII', 'bIII'], ['i', 'bVII', 'bVI', 'bVI'], ['bVI', 'bVII', 'i', 'i'], ['i', 'bIII', 'bVII', 'bVI']] },
  worship: { mode: 'major', list: [['I', 'V', 'vi', 'IV'], ['IV', 'I', 'V', 'vi'], ['I', 'Isus2', 'IV', 'IV'], ['vi', 'IV', 'I', 'V']] },
};
const NUM = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 };
// "bVI", "ii9", "Imaj7", "V7sus4" -> { root: semitones above the key, tones: [semitones above the chord root] }
function parseChord(sym) {
  const m = /^([b#]?)(VII|VI|V|IV|III|II|I|vii|vi|v|iv|iii|ii|i)(°|dim)?(maj13|maj9|maj7|13|11|9|7)?(sus2|sus4|add9)?$/.exec(sym); if (!m) return { root: 0, tones: [0, 4, 7] };
  const up = m[2] === m[2].toUpperCase(), root = NUM[m[2].toUpperCase()] + (m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0), ext = m[4] || '', dim = !!m[3];
  let t = dim ? [0, 3, 6] : up ? [0, 4, 7] : [0, 3, 7];
  if (ext) t.push(ext.startsWith('maj') ? 11 : 10);
  if (/9|11|13/.test(ext)) t.push(14); if (/11|13/.test(ext) && !up) t.push(17); if (/13/.test(ext)) t.push(21);
  if (m[5] === 'sus2') t[1] = 2; if (m[5] === 'sus4') t[1] = 5; if (m[5] === 'add9') t.push(14);
  return { root: (root + 12) % 12, tones: t };
}
// fit the progression's mode to the key: a major progression in a minor key uses the relative major (and the other way round)
function progRoot(key, keyMode, progMode) { return keyMode === progMode ? key : keyMode === 'minor' ? key + 3 : key - 3; }
function complexity(tones, level) { // 'triads' | 'sevenths' | 'ninths'
  let t = tones.filter(x => x < 12 || level === 'ninths' ? true : false); if (level === 'triads') t = t.filter(x => x < 10 || x === 2 || x === 5);
  if (level !== 'triads' && !t.some(x => x === 10 || x === 11)) t.push(t.includes(4) ? 11 : 10); if (level === 'ninths' && !t.includes(14)) t.push(14);
  return [...new Set(t)].sort((a, b) => a - b);
}
// the inversion (and octave) of a chord closest to the previous one, so chords move smoothly
function voiceLead(pcs, prev, center) {
  let best = null, bestCost = Infinity;
  const base0 = Math.round(center / 12) * 12;   // whole octaves only, so pitch classes never shift
  for (let inv = 0; inv < pcs.length; inv++) for (let oct = -2; oct <= 1; oct++) {
    const v = pcs.map((p, i) => p + (i < inv ? 12 : 0) + base0 + oct * 12).sort((a, b) => a - b);
    const mid = v.reduce((a, b) => a + b, 0) / v.length;
    const cost = (prev ? v.reduce((s, p, i) => s + Math.abs(p - (prev[Math.min(i, prev.length - 1)] || p)), 0) : 0) + Math.abs(mid - center) * (prev ? 0.3 : 1);
    if (cost < bestCost) { bestCost = cost; best = v; }
  }
  return best;
}
const RHYTHMS = { // [start step, length] per bar (16 steps)
  sustain: [[0, 16]], halves: [[0, 8], [8, 8]], stabs: [[0, 3], [6, 2], [10, 3], [14, 2]], pulse: [0, 2, 4, 6, 8, 10, 12, 14].map(s => [s, 2]),
  push: [[0, 14], [14, 2]], // gospel push: the next chord arrives on the "and" of 4
  island: [[2, 2], [6, 2], [10, 2], [14, 2]],
};
function writeChords(o) { // { key, keyMode, genre, prog, level, voicing, rhythm, bars, perBar, bass, center }
  const g = PROGS[o.genre], prog = o.prog || g.list[0], r0 = progRoot(o.key, o.keyMode, g.mode), notes = [], chords = []; let prev = null;
  const n = o.bars * (o.perBar || 1), len = 16 / (o.perBar || 1);
  for (let k = 0; k < n; k++) {
    const sym = prog[k % prog.length], ch = parseChord(sym), pcs = complexity(ch.tones, o.level).map(t => (ch.root + r0 + t) % 12 + (t >= 12 ? 12 : 0));
    let v = voiceLead(pcs, prev, o.center || 60); if (o.voicing === 'spread') v = v.map((p, i) => p + (i % 2 ? 12 : 0)).sort((a, b) => a - b); if (o.voicing === 'drop2' && v.length >= 4) { v[v.length - 2] -= 12; v.sort((a, b) => a - b); }
    prev = v; const start = k * len, rootPitch = ((ch.root + r0) % 12 + 12) % 12;
    chords.push({ start, len, root: rootPitch, tones: v.map(p => ((p % 12) + 12) % 12), sym });
    const pat = o.rhythm === 'push' && k === n - 1 ? [[0, len]] : (RHYTHMS[o.rhythm] || RHYTHMS.sustain);
    pat.filter(([s]) => s < len).forEach(([s, l]) => {
      // the gospel push plays the NEXT chord early on the and-of-4
      const isPush = o.rhythm === 'push' && s === 14 && k < n - 1, use = isPush ? null : v;
      const vv = use || (() => { const nx = parseChord(prog[(k + 1) % prog.length]), np = complexity(nx.tones, o.level).map(t => (nx.root + r0 + t) % 12 + (t >= 12 ? 12 : 0)); return voiceLead(np, v, o.center || 60); })();
      vv.forEach(p => notes.push({ p, s: start + s, l: Math.min(l, len - s), v: s === 0 ? 0.85 : 0.72, c: 1 }));
      if (o.bass && s === 0) notes.push({ p: 36 + ((rootPitch - 36) % 12 + 12) % 12, s: start, l: len, v: 0.8, c: 1 });
    });
  }
  return { notes, chords };
}
function rng(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 100000) / 100000; }; }
function writeMelody(chords, o) { // { key, keyMode, density, low, high, style, seed }
  const R = rng(o.seed), sc = SCALES[o.keyMode === 'minor' ? 'minor' : 'major'], inKey = p => sc.includes((((p - o.key) % 12) + 12) % 12), notes = [];
  const total = chords.reduce((m, c) => Math.max(m, c.start + c.len), 0), grid = o.density > 0.65 ? 1 : 2;
  const motif = []; for (let s = 0; s < 16; s += grid) if (s === 0 || R() < o.density * (s % 4 === 0 ? 1 : 0.7)) motif.push(s);
  let p = Math.round((o.low + o.high) / 2); while (!inKey(p)) p++;
  for (let bar = 0; bar * 16 < total; bar++) {
    const rhythm = bar % 4 === 3 && R() < 0.5 ? motif.filter(() => R() < 0.8) : motif;   // vary the last bar of each phrase
    rhythm.forEach((s, i) => {
      const at = bar * 16 + s; if (at >= total) return; const ch = chords.find(c => at >= c.start && at < c.start + c.len) || chords[0];
      const strong = s % 8 === 0;
      if (strong) { let best = p, bd = 99; for (let q = o.low; q <= o.high; q++) if (ch.tones.includes(((q % 12) + 12) % 12) && Math.abs(q - p) < bd && (R() < 0.85 || q !== p)) { bd = Math.abs(q - p); best = q; } p = best; }
      else { const step = o.style === 'leaps' && R() < 0.35 ? (R() < 0.5 ? -1 : 1) * (3 + Math.floor(R() * 3)) : (R() < 0.5 ? -1 : 1) * (1 + (R() < 0.25 ? 1 : 0)); let q = p; for (let k = 0; k < Math.abs(step); k++) { q += Math.sign(step); while (!inKey(q)) q += Math.sign(step); } if (q < o.low || q > o.high) { q = p - (q - p); while (!inKey(q)) q--; } p = clamp(q, o.low, o.high); }
      const next = rhythm[i + 1] != null ? rhythm[i + 1] : 16, l = Math.max(1, Math.min(next - s, 4));
      notes.push({ p, s: at, l, v: strong ? 0.9 : 0.72 + R() * 0.1, c: 1 });
    });
  }
  return notes;
}
const BASS_PATTERNS = {
  roots: () => [[0, 16, 0]], eighths: () => [0, 2, 4, 6, 8, 10, 12, 14].map(s => [s, 2, 0]),
  '808': R => [[0, 6, 0], [6, 4, 0], [10, 3, R() < 0.5 ? 12 : 0], [13, 3, 0]],
  funk: () => [[0, 2, 0], [3, 1, 12], [6, 2, 0], [10, 1, 0], [11, 1, 12], [14, 2, 10]],
  walking: null,
};
function writeBass(chords, o) { // { pattern, octave, seed }
  const R = rng(o.seed), notes = [], base = 24 + (o.octave || 1) * 12;
  chords.forEach((c, i) => {
    const root = base + c.root;
    if (o.pattern === 'walking') { const next = chords[(i + 1) % chords.length], nr = base + next.root, steps = Math.max(1, Math.round(c.len / 4));
      for (let k = 0; k < steps; k++) { const p = k === 0 ? root : k === steps - 1 ? nr + (nr > root ? -1 : 1) : root + [0, 4, 7, 9][k % 4] - (c.tones.includes((c.root + 3) % 12) && k === 1 ? 1 : 0); notes.push({ p, s: c.start + k * 4, l: 4, v: 0.85, c: 1 }); } return; }
    const pat = (BASS_PATTERNS[o.pattern] || BASS_PATTERNS.roots)(R);
    for (let b = 0; b < c.len; b += 16) pat.forEach(([s, l, up]) => { if (b + s >= c.len) return; notes.push({ p: root + up, s: c.start + b + s, l: Math.min(l, c.len - b - s), v: s === 0 ? 0.95 : 0.8, c: 1 }); });
  });
  return notes;
}
const BEATS = { // pad kind -> steps (16 per bar); values over 1 mean "maybe"
  trap: { Kick: [0, 7, 10], Snare: [8], Clap: [8], 'Closed Hat': [0, 2, 4, 6, 8, 10, 12, 14], 'Open Hat': [] , rolls: true },
  'boom bap': { Kick: [0, 7, 10], Snare: [4, 12], 'Closed Hat': [0, 2, 4, 6, 8, 10, 12, 14], 'Open Hat': [14], swing: 0.58 },
  house: { Kick: [0, 4, 8, 12], Clap: [4, 12], 'Closed Hat': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], 'Open Hat': [2, 6, 10, 14] },
  afrobeats: { Kick: [0, 7, 10], Rim: [3, 6, 10, 13], Snare: [8], Shaker: [0, 2, 3, 4, 6, 7, 8, 10, 11, 12, 14, 15], 'Closed Hat': [2, 6, 10, 14] },
  lofi: { Kick: [0, 9, 10], Snare: [4, 12], 'Closed Hat': [0, 2, 4, 6, 8, 10, 12, 14], Shaker: [3, 7, 11, 15], swing: 0.6 },
  drill: { Kick: [0, 11], Snare: [6, 14], 'Closed Hat': [0, 3, 6, 8, 11, 14], 'Open Hat': [], rolls: true },
  reggaeton: { Kick: [0, 4, 8, 12], Snare: [3, 6, 11, 14], 'Closed Hat': [0, 2, 4, 6, 8, 10, 12, 14] },
};
function writeBeat(pads, o) { // { genre, bars, density, variation, seed }
  const R = rng(o.seed), g = BEATS[o.genre] || BEATS.trap, notes = [], idx = k => pads.findIndex(p => p.kind === k);
  for (let bar = 0; bar < o.bars; bar++) {
    Object.entries(g).forEach(([kind, steps]) => {
      if (!Array.isArray(steps)) return; let i = idx(kind); if (i < 0 && kind === 'Clap') return; if (i < 0 && kind === 'Rim') i = idx('Snare'); if (i < 0) return;
      steps.forEach(s => { if (kind.includes('Hat') && R() > 0.55 + o.density * 0.45) return; let at = bar * 16 + s; if (g.swing && s % 4 === 2) at += (g.swing - 0.5) * 4;
        notes.push({ p: i, s: at, l: 1, v: kind === 'Kick' || kind === 'Snare' || kind === 'Clap' ? 0.95 : s % 4 === 0 ? 0.8 : 0.6 + R() * 0.15, c: 1 }); });
      if (kind === 'Kick' && R() < o.variation) notes.push({ p: i, s: bar * 16 + [3, 6, 13, 14][Math.floor(R() * 4)], l: 1, v: 0.85, c: 1 });   // a ghost kick for movement
    });
    if (g.rolls) { const hat = idx('Closed Hat'); if (hat >= 0 && R() < 0.3 + o.variation * 0.6) { const at = bar * 16 + [6, 12, 14][Math.floor(R() * 3)], rate = R() < 0.5 ? 0.5 : 1 / 3; for (let x = 0; x < 2 - 1e-9; x += rate) notes.push({ p: hat, s: at + x, l: rate, v: 0.55 + x * 0.15, c: 1 }); } }
    if (g['Open Hat'] && !g['Open Hat'].length) { const oh = idx('Open Hat'); if (oh >= 0 && R() < o.variation) notes.push({ p: oh, s: bar * 16 + 14, l: 2, v: 0.7, c: 1 }); }
  }
  return notes.sort((a, b) => a.s - b.s);
}

/* ---------- placing clips ---------- */
const GENRE_SOUND = { pop: 'Grand Piano', trap: 'Felt Piano', lofi: 'Suitcase EP (Lo-fi)', gospel: 'Gospel B3 (888)', rnb: 'Suitcase EP', edm: 'Supersaw Lead', worship: 'Warm Pad' };
const GENRE_KIT = { trap: 'Trap Kit', 'boom bap': 'Boom Bap Kit', house: '909 House Kit', afrobeats: 'Afro Kit', lofi: 'Lo-fi Kit', drill: 'Trap Kit', reggaeton: 'Pop Kit' };
async function writerTrack(kind, wantSound) {
  const sel = S.tracks.find(t => V.selTracks.has(t.id) && t.kind === 'midi' && (kind === 'beat' ? t.inst.type === 'drums' : isPitched(t)));
  if (sel) return sel;
  const name = soundByName(wantSound) ? wantSound : SOUNDS.find(s => kind === 'beat' ? s.cat === 'Drum Kits' : s.cat === (kind === 'bass' ? 'Bass & 808' : kind === 'melody' ? 'Leads' : 'Keys & Piano')).name;
  const before = new Set(S.tracks.map(t => t.id)); await addSound(name, null); return S.tracks.find(t => !before.has(t.id)) || S.tracks.find(t => t.name === name);
}
function placeClip(t, notes, bars, name, key) {
  const at = Math.floor((V.insert || 0) / SPB()) * SPB(), old = WR.last[key];
  if (old && old.t === t) { const i = t.clips.findIndex(c => c.id === old.id); if (i >= 0) t.clips.splice(i, 1); }   // "write again" replaces the last one
  const c = newMidiClip(at, bars * 16, name); c.bars = bars; c.notes = notes; clearRange(t, at, at + bars * 16); t.clips.push(c); WR.last[key] = { t, id: c.id };
  V.selTracks = new Set([t.id]); V.selClips = new Set([c.id]); markDirty(); ui.all(); return c;
}

/* ---------- the Writer window ---------- */
function writerOpen(tab = 'chords') {
  let m = $('#writer'); if (!m) { m = document.createElement('div'); m.id = 'writer'; m.className = 'modal'; document.body.appendChild(m); }
  const keyOpts = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'].map((n, i) => `<option value="${i}" ${i === S.root ? 'selected' : ''}>${n}</option>`).join('');
  const st = WR.ui = WR.ui || { genre: 'trap', prog: 0, level: 'sevenths', voicing: 'close', rhythm: 'sustain', bars: 4, perBar: 1, density: 0.5, style: 'smooth', range: 'mid', bassPat: '808', beat: 'trap', beatDensity: 0.6, variation: 0.4 };
  const sel = (id, opts, cur) => `<select id="${id}">${opts.map(([v, l]) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  const progOpts = () => PROGS[st.genre].list.map((p, i) => [i, p.join(' – ')]);
  m.hidden = false;
  m.innerHTML = `<div class="sheet writer"><h2>Writer</h2>
    <div class="wtabs">${['chords', 'melody', 'bass', 'beat'].map(k => `<button class="tab ${k === tab ? 'on' : ''}" data-wt="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
    <div class="wbody">
      ${tab === 'chords' ? `<label>Key <select id="wKey">${keyOpts}</select> ${sel('wMode', [['major', 'Major'], ['minor', 'Minor']], S.scale === 'major' ? 'major' : 'minor')}</label>
        <label>Style ${sel('wGenre', Object.keys(PROGS).map(g => [g, g === 'rnb' ? 'R&B' : g === 'edm' ? 'EDM' : g[0].toUpperCase() + g.slice(1)]), st.genre)}</label>
        <label>Progression ${sel('wProg', progOpts(), st.prog)}</label>
        <label>Chords ${sel('wLevel', [['triads', 'Simple (triads)'], ['sevenths', 'Rich (7ths)'], ['ninths', 'Lush (9ths)']], st.level)}</label>
        <label>Voicing ${sel('wVoicing', [['close', 'Close'], ['spread', 'Spread'], ['drop2', 'Drop 2']], st.voicing)}</label>
        <label>Rhythm ${sel('wRhythm', [['sustain', 'Held'], ['halves', 'Half notes'], ['stabs', 'Stabs'], ['pulse', 'Eighths'], ['push', 'Gospel push'], ['island', 'Offbeat skank']], st.rhythm)}</label>
        <label>Length ${sel('wBars', [[2, '2 bars'], [4, '4 bars'], [8, '8 bars']], st.bars)} ${sel('wPer', [[1, 'One chord a bar'], [2, 'Two chords a bar']], st.perBar)}</label>` : ''}
      ${tab === 'melody' ? `<p class="muted small">${WR.prog ? 'Follows your last chords: ' + esc(WR.prog.map(c => c.sym).join(' – ')) : 'Write chords first, or this follows the Chords tab settings.'}</p>
        <label>Busy ${sel('wDen', [[0.3, 'Sparse'], [0.5, 'Medium'], [0.75, 'Busy']], st.density)}</label>
        <label>Moves ${sel('wStyle', [['smooth', 'Mostly steps'], ['leaps', 'Some leaps']], st.style)}</label>
        <label>Range ${sel('wRange', [['low', 'Low'], ['mid', 'Middle'], ['high', 'High']], st.range)}</label>` : ''}
      ${tab === 'bass' ? `<p class="muted small">${WR.prog ? 'Follows your last chords: ' + esc(WR.prog.map(c => c.sym).join(' – ')) : 'Write chords first, or this follows the Chords tab settings.'}</p>
        <label>Pattern ${sel('wBassPat', [['808', '808 (trap)'], ['roots', 'Roots'], ['eighths', 'Eighths'], ['funk', 'Funk'], ['walking', 'Walking (jazz)']], st.bassPat)}</label>` : ''}
      ${tab === 'beat' ? `<label>Style ${sel('wBeat', Object.keys(BEATS).map(g => [g, g[0].toUpperCase() + g.slice(1)]), st.beat)}</label>
        <label>Hats ${sel('wBeatDen', [[0.3, 'Sparse'], [0.6, 'Normal'], [1, 'Full']], st.beatDensity)}</label>
        <label>Variation ${sel('wVar', [[0.15, 'Steady'], [0.4, 'Some'], [0.8, 'Lots']], st.variation)}</label>
        <label>Length ${sel('wBars', [[1, '1 bar'], [2, '2 bars'], [4, '4 bars']], Math.min(st.bars, 4))}</label>` : ''}
    </div>
    <p class="muted small">Writes a clip at the insert marker on the selected track (or a new one). Press Write again for another take; it replaces the last one.</p>
    <div class="btns"><button class="btn big prim" id="wGo">Write</button><button class="btn big" id="wClose">Close</button></div></div>`;
  const val = id => { const e = $('#' + id, m); return e ? e.value : null; };
  const save = () => { const g = val('wGenre'); if (g && g !== st.genre) { st.genre = g; st.prog = 0; } else if (val('wProg') != null) st.prog = +val('wProg');
    ['level:wLevel', 'voicing:wVoicing', 'rhythm:wRhythm', 'style:wStyle', 'range:wRange', 'bassPat:wBassPat', 'beat:wBeat'].forEach(x => { const [k, id] = x.split(':'); if (val(id) != null) st[k] = val(id); });
    ['bars:wBars', 'perBar:wPer', 'density:wDen', 'beatDensity:wBeatDen', 'variation:wVar'].forEach(x => { const [k, id] = x.split(':'); if (val(id) != null) st[k] = +val(id); });
    if (val('wKey') != null) { st.key = +val('wKey'); st.mode = val('wMode'); } };
  m.onchange = e => { save(); if (e.target.id === 'wGenre') writerOpen(tab); };
  m.onclick = e => { const t = e.target.closest('[data-wt]'); if (t) { save(); writerOpen(t.dataset.wt); } if (e.target.id === 'wClose' || e.target === m) m.hidden = true; if (e.target.id === 'wGo') { save(); writerWrite(tab); } };
}
function writerChordOpts() { const st = WR.ui; return { key: st.key != null ? st.key : S.root, keyMode: st.mode || (S.scale === 'major' ? 'major' : 'minor'), genre: st.genre, prog: PROGS[st.genre].list[st.prog || 0], level: st.level, voicing: st.voicing, rhythm: st.rhythm, bars: st.bars, perBar: st.perBar, center: 62 }; }
async function writerWrite(tab) {
  const st = WR.ui; pushUndo('Writer'); const seed = Math.floor(Math.random() * 1e9);
  if (tab === 'chords') { const o = writerChordOpts(), r = writeChords(o); WR.prog = r.chords; WR.progOpts = o; const t = await writerTrack('chords', GENRE_SOUND[o.genre]); return placeClip(t, r.notes, o.bars, 'Chords', 'chords'); }
  const chords = WR.prog || writeChords(writerChordOpts()).chords, o = WR.progOpts || writerChordOpts(), bars = Math.ceil(chords.reduce((m, c) => Math.max(m, c.start + c.len), 0) / 16);
  if (tab === 'melody') { const rg = { low: [55, 72], mid: [62, 79], high: [69, 86] }[st.range]; const t = await writerTrack('melody', 'Trap Bell'); return placeClip(t, writeMelody(chords, { key: o.key, keyMode: o.keyMode, density: st.density, low: rg[0], high: rg[1], style: st.style, seed }), bars, 'Melody', 'melody'); }
  if (tab === 'bass') { const t = await writerTrack('bass', st.bassPat === '808' ? '808 Clean' : 'Analog Bass'); return placeClip(t, writeBass(chords, { pattern: st.bassPat, octave: 1, seed }), bars, 'Bass', 'bass'); }
  if (tab === 'beat') { const t = await writerTrack('beat', GENRE_KIT[st.beat] || 'Trap Kit'); const b = Math.min(st.bars, 4); return placeClip(t, writeBeat(t.inst.pads, { genre: st.beat, bars: b, density: st.beatDensity, variation: st.variation, seed }), b, 'Beat', 'beat'); }
}
