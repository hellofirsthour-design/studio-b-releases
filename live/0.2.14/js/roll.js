/* ============ piano roll / clip editor ============ */
const LANE_KEY = { vel: 'v', chance: 'c', vr: 'vr', rel: 'rv' };
const laneVal = (n, lane) => (lane === 'vel' ? n.v : lane === 'chance' ? (n.c == null ? 1 : n.c) : lane === 'vr' ? n.vr || 0 : n.rv == null ? 0.5 : n.rv);
const roll = {
  det: { tf: true, gn: false }, sel: new Set(), grid: 1, snap: true, draw: false, fold: false, lane: 'vel', zoom: 1, scrollX: 0, scrollY: null, lastLen: 1, clip: null, track: null, clipboard: null,
  ctx() { const c = V.editClip && clipById(V.editClip); if (!c || c.type !== 'midi') return null; const t = trackOf(c); return t ? { t, c } : null; },
  multiInfo() { const cs = S.tracks.flatMap(t => t.clips).filter(k => k.type === 'midi' && V.selClips.has(k.id)); if (cs.length < 2 || !cs.includes(this.clip)) return null; return { clips: cs, a: Math.min(...cs.map(k => k.start)), b: Math.max(...cs.map(k => k.start + k.len)) }; },
  ph() { if (!T.playing || !this.clip) return null; const c = this.clip, p = nowPos(); if (this.M) return p >= this.M.a && p < this.M.b ? p - c.start + c.offset : null; if (p < c.start || p >= c.start + c.len) return null; const L = c.bars * 16; return ((p - c.start + c.offset) % L + L) % L; },
  rows(t) {
    if (t.inst.type === 'drums') return t.inst.pads.map((_, i) => i).reverse();
    if (t.inst.type === 'sampler' && t.inst.mode !== 'keys') { const n = Math.min(64, Math.max(16, t.inst.cues.length)); return Array.from({ length: n }, (_, i) => n - 1 - i); }
    let r = []; for (let p = 108; p >= 21; p--) r.push(p);
    if (this.fold) { const used = new Set(this.clip ? this.clip.notes.map(n => n.p) : []); r = r.filter(p => inScale(p) || used.has(p)); }
    return r;
  },
  rowLabel(t, p) { if (t.inst.type === 'drums') return t.inst.pads[p] ? t.inst.pads[p].kind : '-'; if (t.inst.type === 'sampler' && t.inst.mode !== 'keys') return 'Cue ' + (p + 1); return noteName(p); },
  mount() {
    const pane = $('#pane-clip'), cc = this.ctx();
    if (!cc) {
      const t = S.tracks.find(x => V.selTracks.has(x.id) && x.kind === 'midi');
      pane.innerHTML = `<div class="empty-state"><h3>No MIDI clip selected</h3><p>${t ? `Double-click the <b>${esc(t.name)}</b> lane to create a clip, or press Ctrl+Shift+M to insert one at the insert marker.` : 'Click a MIDI clip in the arrangement to edit its notes. Audio clips open their own editor here.'}</p>${t ? `<button class="btn" id="mkclip">Insert a 1-bar clip at ${barsBeats(V.insert)}</button>` : ''}</div>`;
      const b = $('#mkclip'); if (b) b.onclick = () => cmd('newClip');
      this.clip = null; return;
    }
    const { t, c } = cc; if (this.clip !== c) { this.sel.clear(); if (!(this.clip && V.selClips.has(this.clip.id) && V.selClips.has(c.id))) { this.scrollY = null; this.scrollX = 0; this.zoom = 1; } }
    this.clip = c; this.track = t; if (t.inst.type === 'drums' && this._lastKind !== 'drums') this.draw = true; this._lastKind = t.inst.type;
    pane.innerHTML = `<div class="clipwrap">
      <aside class="clipside">
        <label class="fld"><span>Clip name</span><input id="cName" value="${esc(c.name)}"></label>
        <div class="fld"><span>Loop length (bars)</span><div class="seg" id="cLen">${[1, 2, 4, 8, 16].map(b => `<button data-len="${b}" class="${Math.abs(c.bars * 16 - b * SPB()) < 1e-6 ? 'on' : ''}">${b}</button>`).join('')}</div></div>
        <div class="row tight"><button class="btn ghostb" data-ct="dup">Duplicate loop</button><button class="btn ghostb" data-ct="half">Halve</button></div>
        <div class="fld"><span>Notes · ${this.sel.size ? this.sel.size + ' selected' : 'all ' + c.notes.length}</span></div>
        <details data-det="tf" ${this.det.tf ? 'open' : ''}><summary>Transform</summary><div class="tools">
          <button data-tf="quant">Quantize</button><button data-tf="human">Humanize</button><button data-tf="legato">Legato</button><button data-tf="reverse">Reverse</button>
          <button data-tf="up1">+1 st</button><button data-tf="dn1">−1 st</button><button data-tf="up12">+Oct</button><button data-tf="dn12">−Oct</button>
          <button data-tf="x2">×2 time</button><button data-tf="half2">÷2 time</button><button data-tf="chop">Chop at grid</button><button data-tf="join">Join</button>
          <button data-tf="fit">Fit to scale</button><button data-tf="invert">Invert</button><button data-tf="vramp">Vel ramp</button><button data-tf="strum">Strum</button>
          <label class="fld sm"><span>Chord</span><select id="chordType">${['triad', 'seventh', 'sus2', 'sus4', 'power', 'add9', 'stack 4ths'].map(x => `<option>${x}</option>`).join('')}</select></label><button data-tf="chord">Make chords</button>
          <label class="fld sm"><span>Arp</span><select id="arpStyle">${['up', 'down', 'up-down', 'random', 'converge'].map(x => `<option>${x}</option>`).join('')}</select></label><label class="fld sm"><span>Rate</span><select id="arpRate">${GRIDS.map(([l, v]) => `<option value="${v}" ${v === 1 ? 'selected' : ''}>${l}</option>`).join('')}</select></label><button data-tf="arp">Arpeggiate</button>
        </div></details>
        <details data-det="gn" ${this.det.gn ? 'open' : ''}><summary>Generate</summary><div class="tools">
          <label class="fld sm"><span>Density</span><input id="gDen" type="range" min="0.1" max="1" step="0.05" value="0.5"></label><button data-gn="seed">Seed melody</button>
          <label class="fld sm"><span>Pulses / steps</span><span class="pair"><input id="gPul" type="number" min="1" max="32" value="5"><input id="gSteps" type="number" min="2" max="32" value="16"></span></label><button data-gn="rhythm">Euclidean rhythm</button>
          <label class="fld sm"><span>Degrees</span><input id="gProg" value="1 6 4 5"></label><button data-gn="stacks">Chord progression</button>
        </div></details>
        <button class="btn ghostb danger" data-ct="clear">Clear notes</button>
      </aside>
      <div class="rollmain">
        <div class="rolltools">
          <div class="seg"><button data-mode="ptr" class="${this.draw ? '' : 'on'}" title="Select tool (B toggles)">Select</button><button data-mode="draw" class="${this.draw ? 'on' : ''}" title="Draw tool (B toggles)">Draw</button></div>
          <label class="fld inl"><span>Grid</span><select id="rGrid">${GRIDS.map(([l, v]) => `<option value="${v}" ${v === this.grid ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
          <button class="tog ${this.snap ? 'on' : ''}" id="rSnap">Snap</button>
          ${t.inst.type === 'synth' || (t.inst.type === 'sampler' && t.inst.mode === 'keys') ? `<button class="tog ${this.fold ? 'on' : ''}" id="rFold">Fold to scale</button>` : ''}
          <div class="seg"><button data-lane="vel" class="${this.lane === 'vel' ? 'on' : ''}">Velocity</button><button data-lane="chance" class="${this.lane === 'chance' ? 'on' : ''}">Chance</button><button data-lane="vr" class="${this.lane === 'vr' ? 'on' : ''}" title="Velocity range: a random spread each time the note plays">Vel range</button><button data-lane="rel" class="${this.lane === 'rel' ? 'on' : ''}" title="Release velocity">Release</button></div>
          <button class="tog ${this.preview !== false ? 'on' : ''}" id="rPrev" title="Play notes as you add or move them">Preview</button>
          <span class="spacer"></span><span class="muted hint">Double-click to add · drag edges to resize · Alt-drag copies · Del removes · Ctrl+wheel zooms</span>
        </div>
        <div class="rollcv"><canvas id="roll" tabindex="0" aria-label="Piano roll"></canvas></div>
      </div></div>`;
    this.cv = $('#roll'); this.bind(); this.draw_();
  },
  // geometry
  geo() {
    const w = this.cv.clientWidth, h = this.cv.clientHeight, t = this.track, rows = this.rows(t);
    const keysW = 64, rulerH = 20, laneH = 64, gridW = Math.max(50, w - keysW), M = this.multiInfo(), len = M ? M.b - M.a : this.clip.bars * 16; this.off = M ? this.clip.start - this.clip.offset - M.a : 0; this.M = M;
    const pps = gridW / len * this.zoom, rowH = t.inst.type === 'drums' ? clamp((h - rulerH - laneH) / rows.length, 16, 30) : t.inst.type === 'sampler' && t.inst.mode !== 'keys' ? clamp((h - rulerH - laneH) / 16, 11, 22) : 13;
    const gridH = h - rulerH - laneH, maxY = Math.max(0, rows.length * rowH - gridH);
    if (this.scrollY == null) { const ps = this.clip.notes.map(n => rows.indexOf(n.p)).filter(i => i >= 0); const mid = ps.length ? (Math.min(...ps) + Math.max(...ps)) / 2 : rows.indexOf(60); this.scrollY = mid >= 0 ? mid * rowH - gridH / 2 : 0; }
    this.scrollY = clamp(this.scrollY, 0, maxY); this.scrollX = clamp(this.scrollX, 0, Math.max(0, len * pps - gridW));
    return { w, h, keysW, rulerH, laneH, gridW, gridH, len, pps, rowH, rows };
  },
  sx(g, s) { return g.keysW + (s + (this.off || 0)) * g.pps - this.scrollX; },
  xs(g, x) { return (x - g.keysW + this.scrollX) / g.pps - (this.off || 0); },
  ry(g, i) { return g.rulerH + i * g.rowH - this.scrollY; },
  yr(g, y) { return Math.floor((y - g.rulerH + this.scrollY) / g.rowH); },
  snapS(s, force) { if (!this.snap && !force) return Math.max(0, s); return Math.max(0, Math.floor(s / this.grid + 1e-6) * this.grid); },
  noteAt(g, x, y) {
    const ri = this.yr(g, y), p = g.rows[ri]; if (p == null) return null;
    for (let i = this.clip.notes.length - 1; i >= 0; i--) { const n = this.clip.notes[i]; if (n.p !== p) continue; const a = this.sx(g, n.s), b = this.sx(g, n.s + n.l); if (x >= a - 1 && x <= b + 1) return { n, edge: x > b - Math.min(7, (b - a) / 3), left: x < a + Math.min(5, (b - a) / 4) }; }
    return null;
  },
  bind() {
    const cv = this.cv, pane = $('#pane-clip');
    cv.addEventListener('pointerdown', e => { // multi-clip: clicking another selected clip's note focuses that clip
      if (!this.M) return; const g = this.geo(), r = cv.getBoundingClientRect(), X = e.clientX - r.left, Y = e.clientY - r.top; if (Y < g.rulerH || Y > g.h - g.laneH || this.noteAt(g, X, Y)) return;
      const ri = this.yr(g, Y), p = g.rows[ri];
      const hit = this.M.clips.find(k => k !== this.clip && flattenMidi(k).some(n => { if (n.p !== p) return false; const a = this.sx(g, k.start - this.clip.start + this.clip.offset + n.s); return X >= a && X <= a + Math.max(3, n.l * g.pps); }));
      if (!hit) return; e.stopImmediatePropagation(); e.preventDefault(); const ox = this.scrollX; V.editClip = hit.id; this.mount(); this.scrollX = ox; this.draw_(); arr.draw();
    }, true);
    pane.querySelectorAll('details[data-det]').forEach(d => d.addEventListener('toggle', () => (this.det[d.dataset.det] = d.open)));
    pane.querySelector('#cName').onchange = e => { pushUndo(); this.clip.name = e.target.value || 'Clip'; arr.draw(); markDirty(); };
    pane.querySelector('#cLen').onclick = e => { const b = e.target.closest('[data-len]'); if (!b) return; pushUndo(); this.clip.bars = +b.dataset.len * SPB() / 16; arr.draw(); this.mount(); };
    pane.querySelectorAll('[data-mode]').forEach(b => (b.onclick = () => { this.draw = b.dataset.mode === 'draw'; this.mount(); }));
    pane.querySelectorAll('[data-lane]').forEach(b => (b.onclick = () => { this.lane = b.dataset.lane; this.mount(); }));
    pane.querySelector('#rGrid').onchange = e => { this.grid = +e.target.value; this.draw_(); };
    pane.querySelector('#rSnap').onclick = () => { this.snap = !this.snap; this.mount(); };
    pane.querySelector('#rPrev').onclick = () => { this.preview = this.preview === false; this.mount(); };
    const fold = pane.querySelector('#rFold'); if (fold) fold.onclick = () => { this.fold = !this.fold; this.scrollY = null; this.mount(); };
    pane.querySelector('.clipside').onclick = e => {
      const ct = e.target.closest('[data-ct]'), tf = e.target.closest('[data-tf]'), gn = e.target.closest('[data-gn]');
      if (ct) clipCmd(ct.dataset.ct); if (tf) transform(tf.dataset.tf); if (gn) generate(gn.dataset.gn);
    };
    let drag = null;
    cv.onpointerdown = e => {
      cv.focus(); const g = this.geo(), rc = cv.getBoundingClientRect(), x = e.clientX - rc.left, y = e.clientY - rc.top;
      if (y < g.rulerH) { this.scrubbing = true; return; }
      if (x < g.keysW && y < g.h - g.laneH) { const p = g.rows[this.yr(g, y)]; if (p != null) audition(this.track, p); return; }
      if (y > g.h - g.laneH) { pushUndo(); drag = { lane: true }; this.laneSet(g, x, y); cv.setPointerCapture(e.pointerId); return; }
      const hit = this.noteAt(g, x, y), s = this.xs(g, x), p = g.rows[this.yr(g, y)];
      if (this.draw) {
        if (hit) { pushUndo(); this.clip.notes.splice(this.clip.notes.indexOf(hit.n), 1); this.sel.delete(hit.n); this.draw_(); drag = { erase: true }; cv.setPointerCapture(e.pointerId); return; }
        if (p == null) return; pushUndo();
        const n = { p, s: this.snapS(s, true), l: this.track.inst.type === 'drums' ? this.grid : Math.max(this.grid, this.lastLen), v: 0.8, c: 1 };
        if (n.s >= g.len) return; this.clip.notes.push(n); this.sel.clear(); this.sel.add(n); audition(this.track, p, n.l);
        drag = { resize: true, notes: [n], orig: [{ ...n }], x0: x, paint: this.track.inst.type === 'drums' }; cv.setPointerCapture(e.pointerId); this.draw_(); return;
      }
      if (hit) {
        if (e.detail === 2) { pushUndo(); this.clip.notes.splice(this.clip.notes.indexOf(hit.n), 1); this.sel.delete(hit.n); this.draw_(); return; }
        if (e.shiftKey || e.ctrlKey || e.metaKey) { this.sel.has(hit.n) ? this.sel.delete(hit.n) : this.sel.add(hit.n); this.draw_(); return; }
        if (!this.sel.has(hit.n)) { this.sel.clear(); this.sel.add(hit.n); }
        pushUndo();
        let notes = [...this.sel];
        if (e.altKey) { const copies = notes.map(n => ({ ...n })); this.clip.notes.push(...copies); this.sel = new Set(copies); notes = copies; }
        drag = { move: !hit.edge, resize: hit.edge, notes, orig: notes.map(n => ({ ...n })), x0: x, y0: y, r0: this.yr(g, y), anchor: hit.n, moved: false };
        if (!hit.edge) audition(this.track, hit.n.p, hit.n.l);
        cv.setPointerCapture(e.pointerId); this.draw_(); return;
      }
      if (e.detail === 2 && p != null) { pushUndo(); const n = { p, s: this.snapS(s, true), l: this.lastLen || this.grid, v: 0.8, c: 1 }; if (n.s < g.len) { this.clip.notes.push(n); this.sel.clear(); this.sel.add(n); audition(this.track, p, n.l); } this.draw_(); return; }
      if (!e.shiftKey) this.sel.clear();
      drag = { box: true, x0: x, y0: y, x1: x, y1: y, base: new Set(this.sel) }; this.box = drag; cv.setPointerCapture(e.pointerId); this.draw_();
    };
    cv.onpointermove = e => {
      const g = this.geo(), rc = cv.getBoundingClientRect(), x = e.clientX - rc.left, y = e.clientY - rc.top;
      if (!drag) { const h = y > g.rulerH && y < g.h - g.laneH && x > g.keysW ? this.noteAt(g, x, y) : null; cv.style.cursor = this.draw ? 'crosshair' : h ? (h.edge ? 'ew-resize' : 'move') : 'default'; return; }
      if (drag.lane) { this.laneSet(g, x, y); return; }
      if (drag.erase) { const h = this.noteAt(g, x, y); if (h) { this.clip.notes.splice(this.clip.notes.indexOf(h.n), 1); this.draw_(); } return; }
      if (drag.box) { drag.x1 = x; drag.y1 = y; const s0 = this.xs(g, Math.min(drag.x0, x)), s1 = this.xs(g, Math.max(drag.x0, x)), r0 = this.yr(g, Math.min(drag.y0, y)), r1 = this.yr(g, Math.max(drag.y0, y)); this.sel = new Set(drag.base); this.clip.notes.forEach(n => { const ri = g.rows.indexOf(n.p); if (ri >= r0 && ri <= r1 && n.s + n.l > s0 && n.s < s1) this.sel.add(n); }); this.draw_(); return; }
      const ds = (x - drag.x0) / g.pps;
      if (drag.resize) {
        if (drag.paint && this.draw) { // drum paint: drag across steps to add hits
          const s = this.snapS(this.xs(g, x), true), p = drag.notes[0].p; if (s < g.len && !this.clip.notes.some(n => n.p === p && Math.abs(n.s - s) < 1e-6)) { this.clip.notes.push({ p, s, l: this.grid, v: 0.8, c: 1 }); this.draw_(); } return;
        }
        drag.notes.forEach((n, i) => { const o = drag.orig[i]; const end = this.snap && !e.altKey ? Math.round((o.s + o.l + ds) / this.grid) * this.grid : o.s + o.l + ds; n.l = Math.max(this.snap ? this.grid / 2 : 0.1, end - o.s); this.lastLen = n.l; });
      } else if (drag.move) {
        let dsn = this.snap ? Math.round(ds / this.grid) * this.grid : ds; const dr = this.yr(g, y) - drag.r0;
        drag.notes.forEach((n, i) => { const o = drag.orig[i]; n.s = clamp(o.s + dsn, 0, g.len - 0.01); const ri = g.rows.indexOf(o.p); n.p = g.rows[clamp(ri + dr, 0, g.rows.length - 1)]; });
        if (drag.anchor && drag.lastP !== drag.anchor.p) { drag.lastP = drag.anchor.p; if (drag.moved) audition(this.track, drag.anchor.p, 0.5); } drag.moved = true;
      }
      this.draw_();
    };
    cv.onpointerup = () => { this.scrubbing = false; arr.draw(); if (drag) { drag = null; this.box = null; this.clip.notes.sort((a, b) => a.s - b.s || a.p - b.p); markDirty(); this.draw_(); this.sideCount(); } };
    cv.onwheel = e => {
      e.preventDefault(); const g = this.geo();
      if (e.ctrlKey || e.metaKey) { const rc = cv.getBoundingClientRect(), x = e.clientX - rc.left, s = this.xs(g, x); this.zoom = clamp(this.zoom * zoomFactor(e), 1, 16); const g2 = this.geo(); this.scrollX = s * g2.pps - (x - g2.keysW); }
      else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) this.scrollX += (e.deltaX || e.deltaY);
      else this.scrollY += e.deltaY;
      this.draw_();
    };
    if (!this._ro) { this._ro = new ResizeObserver(() => this.cv && this.cv.isConnected && this.draw_()); }
    this._ro.disconnect(); this._ro.observe(cv);
  },
  sideCount() { const f = $$('.clipside .fld > span').find(x => x.textContent.startsWith('Notes')); if (f) f.textContent = 'Notes · ' + (this.sel.size ? this.sel.size + ' selected' : 'all ' + this.clip.notes.length); },
  laneSet(g, x, y) {
    const v = clamp(1 - (y - (g.h - g.laneH) - 4) / (g.laneH - 8), this.lane === 'vr' ? 0 : 0.02, 1), s = this.xs(g, x), key = LANE_KEY[this.lane];
    const pool = this.sel.size ? [...this.sel] : this.clip.notes;
    pool.forEach(n => { const a = this.sx(g, n.s); if (Math.abs(a - x) < Math.max(5, g.pps * this.grid / 2)) n[key] = Math.round(v * 100) / 100; });
    this.draw_();
  },
  draw_() { if (this._raf) return; this._raf = requestAnimationFrame(() => { this._raf = 0; this.render(); }); },
  render() {
    const cv = this.cv; if (!cv || !cv.isConnected || !this.clip) return;
    const g = this.geo(), dpr = devicePixelRatio || 1; if (!g.w) return;
    if (cv.width !== Math.round(g.w * dpr) || cv.height !== Math.round(g.h * dpr)) { cv.width = Math.round(g.w * dpr); cv.height = Math.round(g.h * dpr); }
    const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement), V = k => css.getPropertyValue(k).trim();
    const t = this.track, col = t.color, pitched = t.inst.type === 'synth' || (t.inst.type === 'sampler' && t.inst.mode === 'keys');
    x.fillStyle = V('--roll'); x.fillRect(0, 0, g.w, g.h);
    // rows
    x.save(); x.beginPath(); x.rect(g.keysW, g.rulerH, g.gridW, g.gridH); x.clip();
    g.rows.forEach((p, i) => {
      const y = this.ry(g, i); if (y > g.h || y + g.rowH < g.rulerH) return;
      const black = pitched && [1, 3, 6, 8, 10].includes(p % 12);
      x.fillStyle = pitched && inScale(p) && !black ? V('--rowscale') : black ? V('--rowblack') : V('--roll');
      if (pitched && inScale(p) && black) x.fillStyle = V('--rowscaleb');
      x.fillRect(g.keysW, y, g.gridW, g.rowH);
      x.fillStyle = V('--gridf'); x.fillRect(g.keysW, y + g.rowH - 1, g.gridW, pitched && p % 12 === 0 ? 1.5 : 0.6);
    });
    // alternate bar shading, then grid lines
    const o0 = -(this.off || 0);
    { const spb = SPB(); x.fillStyle = 'rgba(255,255,255,.022)'; for (let bs = o0; bs < g.len + o0; bs += spb) if (Math.round(bs / spb) % 2 === 1) x.fillRect(this.sx(g, bs), g.rulerH, spb * g.pps, g.gridH); }
    for (let s = o0; s <= g.len + o0 + 1e-6; s += this.grid) {
      const X = Math.round(this.sx(g, s)) + 0.5; if (X < g.keysW || X > g.w) continue;
      x.fillStyle = Math.abs(s % SPB()) < 1e-6 ? V('--gridb') : Math.abs(s % BEAT()) < 1e-6 ? V('--gridm') : V('--gridf'); x.fillRect(X, g.rulerH, 1, g.gridH);
    }
    // multi-clip editing: the other selected clips show as outlined notes; click one to edit that clip
    if (this.M) { this.M.clips.forEach(k => { const d = k.start - this.clip.start + this.clip.offset, kx0 = this.sx(g, k.start - this.clip.start + this.clip.offset - 0) ; x.fillStyle = k === this.clip ? 'rgba(255,255,255,.04)' : 'rgba(0,0,0,.18)'; x.fillRect(this.sx(g, d), g.rulerH, k.len * g.pps, g.gridH); if (k === this.clip) return;
      const kt = trackOf(k); flattenMidi(k).forEach(n => { const ri = g.rows.indexOf(n.p); if (ri < 0) return; const a = this.sx(g, d + n.s), y = this.ry(g, ri); x.strokeStyle = kt ? kt.color : col; x.globalAlpha = 0.75; x.lineWidth = 1; x.strokeRect(a + 1, y + 1.5, Math.max(3, n.l * g.pps - 2), g.rowH - 3); x.globalAlpha = 1; }); }); }
    // notes
    this.clip.notes.forEach(n => {
      const ri = g.rows.indexOf(n.p); if (ri < 0) return; const a = this.sx(g, n.s), y = this.ry(g, ri), w = Math.max(3, n.l * g.pps - 1);
      const sel = this.sel.has(n); x.globalAlpha = 0.45 + 0.55 * n.v;
      x.fillStyle = n.c != null && n.c < 1 ? V('--chance') : col; x.fillRect(a + 0.5, y + 1, w, g.rowH - 2);
      x.globalAlpha = 1; if (sel) { x.strokeStyle = V('--fg'); x.lineWidth = 1.5; x.strokeRect(a + 1, y + 1.5, w - 1, g.rowH - 3); }
      x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(a + w - 2, y + 2, 1.5, g.rowH - 4);
      if (g.rowH >= 14 && w > 26 && pitched) { x.fillStyle = 'rgba(16,14,20,.8)'; x.font = '9px ' + V('--mono'); x.fillText(noteName(n.p), a + 3, y + g.rowH - 4); }
    });
    // box select
    if (this.box) { x.fillStyle = V('--selbox'); x.strokeStyle = V('--accent'); const b = this.box; x.fillRect(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1), Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0)); x.strokeRect(Math.min(b.x0, b.x1) + 0.5, Math.min(b.y0, b.y1) + 0.5, Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0)); }
    // playhead
    const PH = this.ph(), playing = PH != null;
    if (playing) { const ph = PH; const X = this.sx(g, ph); x.fillStyle = V('--accent'); x.fillRect(X, g.rulerH, 1.5, g.gridH); }
    x.restore();
    // keys column
    x.save(); x.beginPath(); x.rect(0, g.rulerH, g.keysW, g.gridH); x.clip();
    const lit = new Set(); if (playing) { const ph = PH; this.clip.notes.forEach(n => { if (ph >= n.s && ph < n.s + n.l) lit.add(n.p); }); }
    g.rows.forEach((p, i) => {
      const y = this.ry(g, i); if (y > g.h || y + g.rowH < g.rulerH) return;
      const black = pitched && [1, 3, 6, 8, 10].includes(p % 12);
      x.fillStyle = lit.has(p) ? col : black ? V('--keyb') : V('--keyw'); x.fillRect(0, y, g.keysW - 1, g.rowH - 1);
      if (!pitched || p % 12 === 0 || g.rowH >= 14) { x.fillStyle = lit.has(p) ? '#16141a' : black ? V('--keyw') : V('--keyb'); x.font = (pitched ? '9px ' : '10px ') + V('--mono'); x.fillText(this.rowLabel(t, p).slice(0, 10), 4, y + g.rowH / 2 + 3.5); }
    });
    x.restore();
    // ruler
    x.fillStyle = V('--panel'); x.fillRect(0, 0, g.w, g.rulerH); x.fillStyle = V('--dim'); x.font = '10px ' + V('--mono');
    { const spb = SPB(), bt = BEAT(), L = this.M ? g.len + o0 : this.clip.bars * 16, base = this.M ? this.M.a : 0; for (let st = this.M ? o0 : 0; st < L - 1e-6; st += bt) { const sg = this.M ? st - o0 : st, b = Math.floor(((this.M ? base : 0) + sg) / spb), q = Math.round((((this.M ? base : 0) + sg) % spb) / bt); const X = this.sx(g, st); if (X < g.keysW - 1 || X > g.w) continue; x.fillRect(X, q ? 14 : 6, 1, q ? 6 : 14); if (!q) x.fillText(String(b + 1), X + 4, 13); else if (g.pps * bt > 34) x.fillText(`${b + 1}.${q + 1}`, X + 3, 13); } }
    if (playing) { const X = this.sx(g, PH); x.fillStyle = V('--accent'); x.beginPath(); x.moveTo(X - 5, 0); x.lineTo(X + 5, 0); x.lineTo(X, 8); x.fill(); }
    // lane
    const ly = g.h - g.laneH; x.fillStyle = V('--panel'); x.fillRect(0, ly, g.w, g.laneH); x.fillStyle = V('--line'); x.fillRect(0, ly, g.w, 1);
    x.fillStyle = V('--dim'); x.fillText({ vel: 'Velocity', chance: 'Chance', vr: 'Vel range', rel: 'Release' }[this.lane], 6, ly + 14);
    x.save(); x.beginPath(); x.rect(g.keysW, ly, g.gridW, g.laneH); x.clip();
    this.clip.notes.forEach(n => { const a = this.sx(g, n.s), val = laneVal(n, this.lane), hh = (g.laneH - 10) * val; if (this.lane === 'vr' && n.vr) { x.fillStyle = col; x.globalAlpha = 0.3; const vh = (g.laneH - 10); x.fillRect(a - 2, ly + g.laneH - 4 - vh * Math.min(1, n.v + n.vr), 6, vh * (Math.min(1, n.v + n.vr) - Math.max(0, n.v - n.vr))); x.globalAlpha = 1; } x.fillStyle = this.sel.has(n) ? V('--fg') : this.lane === 'vel' ? col : V('--chance'); x.fillRect(a, ly + g.laneH - 4 - hh, 2, hh); x.beginPath(); x.arc(a + 1, ly + g.laneH - 4 - hh, 3, 0, 7); x.fill(); });
    x.restore();
  },
};
function audition(t, p, l = 0.5) { if (roll.preview === false) return; if (ctx.state !== 'running') ctx.resume(); RT.get(t.id).inst.noteOn(p, ctx.currentTime, 0.8, Math.min(1, l * 15 / S.bpm)); }
function targetNotes() { return roll.sel.size ? [...roll.sel] : roll.clip.notes; }
function clipCmd(k) {
  const c = roll.clip; pushUndo();
  if (k === 'dup') { if (c.bars >= 16) { UNDO.pop(); return toast('Clips go up to 16 bars'); } const L = c.bars * 16; c.notes = c.notes.concat(c.notes.map(n => ({ ...n, s: n.s + L }))); c.bars *= 2; }
  if (k === 'half') { if (c.bars <= 1) { UNDO.pop(); return; } c.bars /= 2; c.notes = c.notes.filter(n => n.s < c.bars * 16); }
  if (k === 'clear') { c.notes = []; roll.sel.clear(); }
  arr.draw(); roll.mount();
}
function transform(k) {
  if (!roll.clip) return; const ns = targetNotes(); if (!ns.length && !['seed'].includes(k)) return toast('This clip has no notes yet');
  pushUndo(); const c = roll.clip, L = c.bars * 16, g = roll.grid;
  const pitched = roll.track.inst.type === 'synth' || (roll.track.inst.type === 'sampler' && roll.track.inst.mode === 'keys');
  const groups = () => { const m = new Map(); ns.forEach(n => { const k = Math.round(n.s * 100); if (!m.has(k)) m.set(k, []); m.get(k).push(n); }); return [...m.values()]; };
  switch (k) {
    case 'x2': { const s0 = Math.min(...ns.map(n => n.s)); ns.forEach(n => { n.s = s0 + (n.s - s0) * 2; n.l *= 2; }); const need = Math.max(...ns.map(n => n.s + n.l)); if (need > L) c.bars = Math.min(64, Math.ceil(need / SPB()) * SPB() / 16); break; }
    case 'half2': { const s0 = Math.min(...ns.map(n => n.s)); ns.forEach(n => { n.s = s0 + (n.s - s0) / 2; n.l = Math.max(0.1, n.l / 2); }); break; }
    case 'chop': { const add = []; ns.forEach(n => { const parts = Math.floor(n.l / g - 1e-6); if (parts < 1) return; const l0 = n.l; n.l = g; for (let i = 1; i <= parts; i++) { const s = n.s + i * g; if (s < n.s + l0 - 1e-6) add.push({ ...n, s, l: Math.min(g, n.s + l0 - s) }); } }); c.notes.push(...add); add.forEach(n => roll.sel.add(n)); break; }
    case 'join': { const byP = new Map(); [...ns].sort((a, b) => a.s - b.s).forEach(n => { const prev = byP.get(n.p); if (prev && n.s <= prev.s + prev.l + 1e-6) { prev.l = Math.max(prev.l, n.s + n.l - prev.s); c.notes = c.notes.filter(x => x !== n); roll.sel.delete(n); } else byP.set(n.p, n); }); break; }
    case 'quant': ns.forEach(n => { if (n.s < L) n.s = clamp(Math.round(n.s / g) * g, 0, L - g); }); break;
    case 'human': ns.forEach(n => { n.s = clamp(n.s + (Math.random() - 0.5) * 0.18, 0, L - 0.05); n.v = clamp(n.v + (Math.random() - 0.5) * 0.2, 0.1, 1); }); break;
    case 'legato': { const st = [...new Set(c.notes.map(n => n.s))].sort((a, b) => a - b); ns.forEach(n => { const nx = st.find(s => s > n.s + 1e-6); n.l = (nx != null ? nx : L) - n.s; }); break; }
    case 'reverse': ns.forEach(n => (n.s = clamp(L - n.s - n.l, 0, L - 0.05))); break;
    case 'up1': case 'dn1': case 'up12': case 'dn12': { const d = { up1: 1, dn1: -1, up12: 12, dn12: -12 }[k]; if (!pitched) { UNDO.pop(); return toast('Transpose works on pitched clips'); } ns.forEach(n => (n.p = clamp(n.p + d, 0, 127))); break; }
    case 'fit': if (pitched) ns.forEach(n => (n.p = snapToScale(n.p))); break;
    case 'invert': { if (!pitched) break; const ps = ns.map(n => n.p), hi = Math.max(...ps), lo = Math.min(...ps); ns.forEach(n => (n.p = snapToScale(hi + lo - n.p))); break; }
    case 'vramp': { const s = [...ns].sort((a, b) => a.s - b.s); s.forEach((n, i) => (n.v = 0.3 + 0.7 * (i + 1) / s.length)); break; }
    case 'strum': groups().forEach(gr => gr.sort((a, b) => a.p - b.p).forEach((n, i) => { n.s += i * 0.18; n.l = Math.max(0.2, n.l - i * 0.18); })); break;
    case 'chord': {
      if (!pitched) { UNDO.pop(); return toast('Chords need a pitched clip'); }
      const type = $('#chordType').value, add = [];
      const iv = { triad: [2, 4], seventh: [2, 4, 6], 'add9': [2, 4, 8], 'stack 4ths': [3, 6] };
      ns.forEach(n => {
        const extra = type === 'power' ? [7, 12].map(d => n.p + d) : type === 'sus2' ? [scaleStep(n.p, 1), scaleStep(n.p, 4)] : type === 'sus4' ? [scaleStep(n.p, 3), scaleStep(n.p, 4)] : iv[type].map(d => scaleStep(n.p, d));
        extra.forEach(p => add.push({ ...n, p }));
      });
      c.notes.push(...add); add.forEach(n => roll.sel.add(n)); break;
    }
    case 'arp': {
      const style = $('#arpStyle').value, rate = +$('#arpRate').value, out = [];
      groups().forEach(gr => {
        const ps = gr.map(n => n.p).sort((a, b) => a - b), start = gr[0].s, dur = Math.max(...gr.map(n => n.l)), v = gr[0].v;
        let seq = style === 'down' ? [...ps].reverse() : style === 'up-down' ? ps.concat(ps.slice(1, -1).reverse()) : style === 'converge' ? ps.map((_, i) => (i % 2 ? ps[ps.length - 1 - (i >> 1)] : ps[i >> 1])) : ps;
        for (let s = 0, i = 0; s < dur - 1e-6; s += rate, i++) out.push({ p: style === 'random' ? ps[Math.floor(Math.random() * ps.length)] : seq[i % seq.length], s: start + s, l: rate * 0.9, v, c: 1 });
      });
      c.notes = c.notes.filter(n => !ns.includes(n)).concat(out); roll.sel = new Set(out); break;
    }
  }
  c.notes.sort((a, b) => a.s - b.s); roll.mount(); markDirty();
}
function generate(k) {
  if (!roll.clip) return; pushUndo(); const c = roll.clip, L = c.bars * 16, t = roll.track, g = roll.grid;
  const pitched = t.inst.type === 'synth' || (t.inst.type === 'sampler' && t.inst.mode === 'keys');
  const base = pitched ? snapToScale(t.inst.type === 'synth' && t.inst.mono ? 45 : 60) : 0;
  const out = [];
  if (k === 'seed') {
    const den = +$('#gDen').value; let p = base;
    for (let s = 0; s < L; s += g) { if (Math.random() > den) continue; if (pitched) p = clamp(scaleStep(p, Math.round((Math.random() - 0.5) * 5)), base - 7, base + 14); else p = Math.floor(Math.random() * (t.inst.type === 'drums' ? 8 : Math.max(1, t.inst.cues.length))); out.push({ p, s, l: g * (Math.random() < 0.3 ? 2 : 1), v: 0.55 + Math.random() * 0.4, c: 1 }); }
  }
  if (k === 'rhythm') {
    const pulses = clamp(+$('#gPul').value, 1, 32), steps = clamp(+$('#gSteps').value, 2, 32);
    const p = roll.sel.size ? [...roll.sel][0].p : pitched ? base : (t.inst.type === 'drums' ? 0 : 0);
    const pat = Array.from({ length: steps }, (_, i) => Math.floor((i * pulses) / steps) !== Math.floor(((i - 1) * pulses) / steps) || i === 0);
    for (let s = 0, i = 0; s < L; s += g, i++) if (pat[i % steps]) out.push({ p, s, l: g, v: i % steps === 0 ? 1 : 0.75, c: 1 });
  }
  if (k === 'stacks') {
    if (!pitched) { UNDO.pop(); return toast('Chord progressions need a pitched clip'); }
    const degs = $('#gProg').value.split(/[\s,]+/).map(Number).filter(n => n >= 1 && n <= 7); if (!degs.length) { UNDO.pop(); return toast('Type scale degrees, for example 1 6 4 5'); }
    const each = L / degs.length, root0 = S.root + (S.root > 6 ? 36 : 48);
    degs.forEach((d, i) => { const r = scaleStep(root0, d - 1); [0, 2, 4].map(x => scaleStep(r, x)).forEach(p => out.push({ p, s: i * each, l: each, v: 0.75, c: 1 })); });
  }
  if (k === 'stacks') c.notes = []; else if (roll.sel.size) c.notes = c.notes.filter(n => !roll.sel.has(n));
  c.notes.push(...out);
  roll.sel = new Set(out); roll.scrollY = null; roll.mount(); markDirty();
}
function rollKey(e) {
  if (!roll.clip || !roll.cv || document.activeElement !== roll.cv) return false;
  { const live = clipById(V.editClip); if (live && live !== roll.clip) { roll.mount(); return true; } }
  if (!roll.sel.size && ['Delete', 'Backspace', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return true;
  const c = roll.clip, mod = e.ctrlKey || e.metaKey, ns = [...roll.sel];
  if ((e.key === 'Delete' || e.key === 'Backspace') && ns.length) { pushUndo(); c.notes = c.notes.filter(n => !roll.sel.has(n)); roll.sel.clear(); roll.draw_(); return true; }
  if (mod && e.key.toLowerCase() === 'a') { roll.sel = new Set(c.notes); roll.draw_(); return true; }
  if (mod && e.key.toLowerCase() === 'c' && ns.length) { const s0 = Math.min(...ns.map(n => n.s)); roll.clipboard = { notes: ns.map(n => ({ ...n, s: n.s - s0 })), span: Math.max(...ns.map(n => n.s + n.l)) - s0 }; toast(ns.length + ' notes copied'); return true; }
  if (mod && e.key.toLowerCase() === 'v' && roll.clipboard) { pushUndo(); const at = ns.length ? Math.max(...ns.map(n => n.s + n.l)) : 0; const add = roll.clipboard.notes.map(n => ({ ...n, s: n.s + at })).filter(n => n.s < c.bars * 16); c.notes.push(...add); roll.sel = new Set(add); roll.draw_(); return true; }
  if (mod && e.key.toLowerCase() === 'd' && ns.length) { pushUndo(); const s0 = Math.min(...ns.map(n => n.s)), span = Math.ceil((Math.max(...ns.map(n => n.s + n.l)) - s0) / roll.grid) * roll.grid; const add = ns.map(n => ({ ...n, s: n.s + span })).filter(n => n.s < c.bars * 16); c.notes.push(...add); roll.sel = new Set(add); roll.draw_(); return true; }
  if (e.key.startsWith('Arrow') && ns.length && !mod) {
    pushUndo(); const g = roll.geo();
    ns.forEach(n => {
      if (e.key === 'ArrowLeft') n.s = Math.max(0, n.s - roll.grid); if (e.key === 'ArrowRight') n.s = Math.min(c.bars * 16 - roll.grid, n.s + roll.grid);
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { const d = e.key === 'ArrowUp' ? -1 : 1; if (e.shiftKey && g.rows.length > 20) n.p = clamp(n.p - d * 12, 0, 127); else { const ri = g.rows.indexOf(n.p); n.p = g.rows[clamp(ri + d, 0, g.rows.length - 1)]; } }
    });
    if (ns.length === 1) audition(roll.track, ns[0].p, 0.5); roll.draw_(); return true;
  }
  if (!mod && e.key.toLowerCase() === 'q') { transform('quant'); return true; }
  if (!mod && e.key.toLowerCase() === 'b') { roll.draw = !roll.draw; roll.mount(); $('#roll').focus(); return true; }
  return false;
}
