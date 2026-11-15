/* ============ Arrangement view ============ */
const arr = {
  rows: [], // [{b, kind:'track'|'return'|'master', y, h}]
  dirty: true,
  layout() {
    let y = 0; const rows = [];
    S.tracks.forEach(b => { if (hiddenByFold(b)) return; const bh = rowH(b); rows.push({ b, kind: 'track', y, h: bh }); y += bh + 1; if (b.collapsed) return; if (b.showTakes && b.takes && b.takes.length) b.takes.forEach(lane => { rows.push({ b, kind: 'take', lane, y, h: 30 }); y += 31; }); (b.lanes || []).forEach((key, li) => { rows.push({ b, kind: 'auto', key, li, y, h: 40 }); y += 41; }); });
    const lanesOf = b => (b.lanes || []).forEach((key, li) => { rows.push({ b, kind: 'auto', key, li, y, h: 40 }); y += 41; });
    y += 10; S.returns.forEach(b => { rows.push({ b, kind: 'return', y, h: rowH(b) }); y += rowH(b) + 1; if (!b.collapsed) lanesOf(b); });
    rows.push({ b: S.master, kind: 'master', y, h: rowH(S.master) }); y += rowH(S.master) + 1; if (!S.master.collapsed) lanesOf(S.master);
    this.rows = rows; this.totalH = y + 80; return rows;
  },
  rowAt(y) { y += V.scrollY; return this.rows.find(r => y >= r.y && y < r.y + r.h + 1) || null; },
  x(pos) { return (pos - V.scrollX) * V.pps; },
  pos(x) { return x / V.pps + V.scrollX; },
  gridStep() {
    if (V.fixedGrid) { const f = V.fixedGrid, b = SPB(), v = f === 'bar' ? b : f === 'bar2' ? 2 * b : f === 'bar4' ? 4 * b : +f; return V.triplet && v < b ? v * 2 / 3 : v; }   // a fixed size from the toolbar
    const c = gridCandidates(); const min = 11 * Math.pow(2, V.grid);
    return c.find(s => s * V.pps >= min) || c[c.length - 1];
  },
  snap(pos, force) { if (!V.snap && !force) return Math.max(0, pos); const g = this.gridStep(); return Math.max(0, Math.round(pos / g) * g); },
  snapFloor(pos) { const g = this.gridStep(); return V.snap ? Math.max(0, Math.floor(pos / g) * g) : Math.max(0, pos); },
  draw() { this.dirty = true; },
  init() {
    this.lanes = $('#lanes'); this.ruler = $('#ruler'); this.ov = $('#overview');
    this.bindRuler(); this.bindLanes(); this.bindOverview();
    new ResizeObserver(() => this.draw()).observe($('#lanesWrap'));
    $('#hdrs').addEventListener('wheel', e => { e.preventDefault(); V.scrollY = clamp(V.scrollY + e.deltaY, 0, Math.max(0, this.totalH - this.lanes.clientHeight)); this.syncHeaders(); this.draw(); }, { passive: false });
  },
  fit(canvas) {
    const dpr = devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
    const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); return { g, w, h };
  },
  syncHeaders() { $('#hdrInner').style.transform = `translateY(${-V.scrollY}px)`; },

  /* ---------- rendering ---------- */
  render() {
    if (!S) return;
    this.layout(); const { g, w, h } = this.fit(this.lanes); const css = CSS();
    V.scrollY = clamp(V.scrollY, 0, Math.max(0, this.totalH - h)); this.syncHeaders();
    g.fillStyle = css.lane; g.fillRect(0, 0, w, h);
    const gs = this.gridStep(), p0 = this.pos(0), p1 = this.pos(w);
    // row backgrounds
    this.rows.forEach(r => {
      const y = r.y - V.scrollY; if (y > h || y + r.h < 0) return;
      g.fillStyle = r.kind === 'take' || r.kind === 'auto' ? css.laneBus : V.selTracks.has(r.b.id) ? css.laneSel : r.kind === 'track' ? css.laneRow : css.laneBus; g.fillRect(0, y, w, r.h);
      g.fillStyle = css.line; g.fillRect(0, y + r.h, w, 1);
    });
    // grid
    for (const B of barLines(p0, p1)) { const spb = B.spb, bt = B.bt, gsb = gs >= SPB() ? gs : gs;
      if (B.bar % 2 === 1) { g.fillStyle = css.barAlt; g.fillRect(this.x(B.p), 0, spb * V.pps, h); }
      if (V.pps >= 7 && gs > 1) { g.fillStyle = css.gridHair; for (let s = B.p; s < B.p + spb - 1e-6; s += 1) if (Math.abs((s - B.p) % gs) > 1e-6) g.fillRect(px(this.x(s)), 0, 1, h); }
      if (gsb >= spb) { const every = Math.round(gsb / SPB()) || 1; if (B.bar % every === 0) { g.fillStyle = css.gridBar; g.fillRect(px(this.x(B.p)), 0, 1.25, h); } continue; }
      for (let s = B.p; s < B.p + spb - 1e-6; s += gsb) { const x = px(this.x(s)), isBar = s === B.p, isBeat = Math.abs((s - B.p) % bt) < 1e-6; g.fillStyle = isBar ? css.gridBar : isBeat ? css.gridBeat : css.gridFine; g.fillRect(x, 0, isBar ? 1.25 : 1, h); }
      if (gsb > bt) { g.fillStyle = css.gridFine; for (let s = B.p + bt; s < B.p + spb - 1e-6; s += bt) if (Math.abs((s - B.p) % gsb) > 1e-6 && bt * V.pps >= 6) g.fillRect(px(this.x(s)), 0, 1, h); }
    }
    // loop region and time selection
    if (S.loop.on) { g.fillStyle = css.loopShade; g.fillRect(this.x(S.loop.start), 0, (S.loop.end - S.loop.start) * V.pps, h); }
    S.markers.forEach(m => { g.fillStyle = css.marker; g.fillRect(Math.round(this.x(m.t)), 0, 1, h); });
    // clips
    this.rows.forEach(r => {
      const y = r.y - V.scrollY; if (y > h || y + r.h < 0) return;
      if (r.kind === 'take') {
        r.lane.clips.forEach(c => { const x = this.x(c.start), cw = c.len * V.pps; if (x > w || x + cw < 0) return; this.drawClip(g, r.b, c, x, y, cw, r.h, css);
          // dim the parts that are not on the main lane
          g.fillStyle = 'rgba(20,19,24,.62)'; const step = Math.max(0.25, 2 / V.pps);
          for (let p = c.start; p < c.start + c.len; p += step) if (!compActive(r.b, c, p + step / 2)) g.fillRect(this.x(p), y + 1, step * V.pps + 0.5, r.h - 2); });
        return;
      }
      if (r.kind !== 'track') return;
      if (r.b.kind === 'group') { const ms = descendants(r.b).filter(t => t.kind !== 'group'), lh = Math.max(2, (r.h - 6) / Math.max(1, ms.length)); ms.forEach((t, i) => t.clips.forEach(c => { const x0 = this.x(c.start), cw = c.len * V.pps; if (x0 > w || x0 + cw < 0) return; g.fillStyle = c.muted ? css.muted : t.color; g.globalAlpha = 0.7; g.fillRect(x0, y + 3 + i * lh, cw, Math.max(1.5, lh - 1)); g.globalAlpha = 1; })); return; }
      r.b.clips.forEach(c => { const x = this.x(c.start), cw = c.len * V.pps; if (x > w || x + cw < 0) return; this.drawClip(g, r.b, c, x, y, cw, r.h, css); this.drawWarp(g, c, y, r.h); });
      r.b.clips.forEach(c => { const xi = xfInfo(r.b, c); if (!xi) return; const x0 = this.x(c.start - xi.ext), x1 = this.x(c.start - xi.ext + xi.fade), yb = y + r.h - 2, yt = y + (r.h >= 34 ? 16 : 2);
        g.strokeStyle = css.fg; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, yt); g.lineTo(x1, yb); g.moveTo(x0, yb); g.lineTo(x1, yt); g.stroke(); g.fillStyle = css.fg; g.fillRect(this.x(c.start) - 3, yb - 5, 6, 6); });
      if (r.b.frozen) { g.fillStyle = 'rgba(150,200,255,.13)'; g.fillRect(0, y, w, r.h); g.fillStyle = 'rgba(190,220,255,.8)'; g.font = '600 10px ' + css.ui; g.fillText('Frozen', 6, y + r.h - 6); }
    });
    // live recording
    if (T.recording) {
      const pos = posAt(ctx.currentTime);
      T.recording.audio.forEach(rec => { const r = this.rows.find(q => q.b === rec.t); if (!r) return; const a = T.recording.from, x = this.x(a), cw = (pos - a) * V.pps, y = r.y - V.scrollY;
        g.fillStyle = css.recClip; g.fillRect(x, y + 1, cw, r.h - 2); g.fillStyle = 'rgba(255,255,255,.75)';
        const n = rec.peaks.length, per = cw / Math.max(1, n); rec.peaks.forEach((p, i) => { const a2 = Math.min(1, p * 1.4) * (r.h / 2 - 4); g.fillRect(x + i * per, y + r.h / 2 - a2, Math.max(1, per), a2 * 2 || 1); }); });
      T.recording.midi.forEach(m => { const r = this.rows.find(q => q.b === m.t); if (!r) return; const a = T.recording.from, y = r.y - V.scrollY; g.fillStyle = css.recClip; g.globalAlpha = 0.5; g.fillRect(this.x(a), y + 1, (pos - a) * V.pps, r.h - 2); g.globalAlpha = 1; g.fillStyle = '#fff'; m.notes.forEach(n => g.fillRect(this.x(n.abs), y + r.h - 6 - ((n.p % 24) / 24) * (r.h - 10), Math.max(2, n.l * V.pps), 2)); });
    }
    // selection highlight, drawn over the clips so you can see exactly what is selected
    const selBand = (x0, y0, x1, hh) => { g.fillStyle = css.timeSel; g.fillRect(x0, y0, x1 - x0, hh); g.fillStyle = css.timeSelEdge; g.fillRect(Math.round(x0), y0, 1.5, hh); g.fillRect(Math.round(x1) - 1, y0, 1.5, hh); };
    if (V.time && V.time.b > V.time.a) this.rows.forEach(r => { if (r.kind === 'take' || !V.time.tracks || !V.time.tracks.has(r.b.id)) return; selBand(this.x(V.time.a), r.y - V.scrollY + 1, this.x(V.time.b), r.h - 1); });
    if (this.compSel) { const r = this.compSel.r; selBand(this.x(this.compSel.a), r.y - V.scrollY + 1, this.x(this.compSel.b), r.h - 1); }
    // automation envelopes
    this.rows.forEach(r => { if (r.kind === 'auto' || (V.autoMode && r.kind !== 'take')) this.drawEnvelope(g, r, w, h, css); });
    // insert marker (blinks) and playhead
    if (!T.playing || V.insert !== Math.floor(nowPos())) {
      const blink = (performance.now() % 1000) < 560; if (blink) { g.fillStyle = css.insert; const x = Math.round(this.x(V.insert)); this.rows.forEach(r => { if (V.selTracks.has(r.b.id)) g.fillRect(x, r.y - V.scrollY, 1.5, r.h); }); }
    }
    if (T.playing) { const x = this.x(nowPos());
      if (!REDUCED) { const tr = g.createLinearGradient(x - 26, 0, x, 0); tr.addColorStop(0, 'rgba(127,215,150,0)'); tr.addColorStop(1, 'rgba(127,215,150,.10)'); g.fillStyle = tr; g.fillRect(x - 26, 0, 26, h); g.shadowColor = css.playhead; g.shadowBlur = 8; }
      g.fillStyle = css.playhead; g.fillRect(x - 0.5, 0, 2, h); g.shadowBlur = 0; }
    if (this.dropHint) { g.strokeStyle = css.accent; g.lineWidth = 2; g.setLineDash([4, 3]); g.strokeRect(this.dropHint.x, this.dropHint.y, this.dropHint.w, this.dropHint.h); g.setLineDash([]); }
    this.renderRuler(css); this.renderOverview(css);
  },
  drawClip(g, t, c, x, y, cw, rh, css) {
    const sel = V.selClips.has(c.id), col = c.muted ? css.muted : (c.color || t.color), th = rh >= 34 ? 14 : 0;
    g.save(); g.beginPath(); g.rect(Math.max(x, -2), y + 1, Math.min(cw, 1e5), rh - 2); g.clip();
    g.fillStyle = mix(col, css.lane, 0.55); g.fillRect(x, y + 1, cw, rh - 2);
    if (th) { g.fillStyle = col; g.fillRect(x, y + 1, cw, th); g.fillStyle = '#17151c'; g.font = '600 10px ' + css.ui; g.fillText((c.muted ? '◌ ' : '') + c.name, Math.max(x, 0) + 4, y + 11); }
    const by = y + 1 + th, bh = rh - 2 - th;
    if (c.type === 'midi' && bh > 6) {
      const ns = c.notes; if (ns.length) {
        let lo = 127, hi = 0; ns.forEach(n => { if (n.p < lo) lo = n.p; if (n.p > hi) hi = n.p; }); const span = Math.max(8, hi - lo + 1), nh = Math.max(1.5, Math.min(5, bh / span));
        const L = c.bars * 16, base = c.start - c.offset;
        g.fillStyle = c.muted ? css.dim : '#17151c';
        for (let k = Math.floor(c.offset / L); base + k * L < c.start + c.len; k++) {
          const lx = this.x(base + k * L); if (k > Math.floor(c.offset / L) && lx > x) { g.globalAlpha = 0.35; g.fillRect(lx, by, 1, bh); g.globalAlpha = 1; }
          for (const n of ns) { if (n.s >= L) continue; const s = base + k * L + n.s; g.fillStyle = T.playing && nowPos() >= s && nowPos() < s + n.l ? '#ffffff' : (c.muted ? css.dim : '#17151c'); if (s + n.l <= c.start || s >= c.start + c.len) continue; const nx = this.x(s); g.fillRect(nx, by + (hi - n.p) / span * (bh - nh) , Math.max(1.5, Math.min(n.l * V.pps, (c.start + c.len - s) * V.pps) - 1), nh); }
        }
      }
    } else if (c.type === 'audio' && bh > 4) {
      const s = SAMPLES.get(c.sampleId); if (s && s.wave) {
        const wv = s.wave, mid = by + bh / 2, amp = bh / 2 - 1, gain = dbToGain(c.gain); g.fillStyle = c.muted ? css.dim : '#17151c';
        const x0 = Math.max(0, Math.floor(x)), x1 = Math.min(this.lanes.clientWidth, Math.ceil(x + cw));
        for (let px = x0; px < x1; px++) {
          const lp = c.loop && c.loopLen > 0.25, la = this.pos(px) - c.start, a = (lp ? la % c.loopLen : la) + c.offset, b = a + 1 / V.pps;
          const i0 = Math.floor(srcSecAt(c, a) * wv.sr / PEAK_BLOCK), i1 = Math.max(i0 + 1, Math.floor(srcSecAt(c, b) * wv.sr / PEAK_BLOCK));
          if (i0 >= wv.mx.length || i0 < 0) continue;
          let lo = 0, hi = 0; for (let i = i0; i < i1 && i < wv.mx.length; i++) { if (wv.mn[i] < lo) lo = wv.mn[i]; if (wv.mx[i] > hi) hi = wv.mx[i]; }
          g.fillRect(px, mid - clamp(hi * gain, 0, 1) * amp, 1, Math.max(1, (clamp(hi * gain, 0, 1) - clamp(lo * gain, -1, 0)) * amp));
        }
        // fades
        g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1;
        if (c.fadeIn > 0) { g.beginPath(); g.moveTo(x, by + bh); g.lineTo(x + c.fadeIn * V.pps, by); g.stroke(); }
        if (c.fadeOut > 0) { g.beginPath(); g.moveTo(x + cw - c.fadeOut * V.pps, by); g.lineTo(x + cw, by + bh); g.stroke(); }
        if (c.warp && th && cw > 60) { g.fillStyle = 'rgba(23,21,28,.6)'; g.font = '9px ' + css.mono; g.fillText(c.semis ? (c.semis > 0 ? '+' : '') + c.semis + 'st' : '', x + cw - 26, y + 11); }
      } else if (th) { g.fillStyle = css.dim; g.font = '10px ' + css.ui; g.fillText('Media offline', x + 4, by + 12); }
    }
    g.restore();
    const now = T.playing ? nowPos() : -1, live = now >= c.start && now < c.start + c.len && !c.muted;
    if (live && !REDUCED) { g.save(); g.shadowColor = col; g.shadowBlur = 12; g.strokeStyle = col; g.lineWidth = 2; g.strokeRect(x + 1, y + 2, cw - 2, rh - 4); g.restore(); }
    if (this.hoverClip === c.id && !sel) { g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 1.5, cw - 1, rh - 3); }
    if (sel) { g.strokeStyle = css.fg; g.lineWidth = 1.5; g.strokeRect(x + 0.75, y + 1.75, cw - 1.5, rh - 3.5); }
    if (c.type === 'audio' && sel && th) { g.fillStyle = css.fg; g.fillRect(x + c.fadeIn * V.pps - 3, y + 1, 6, 6); g.fillRect(x + cw - c.fadeOut * V.pps - 3, y + 1, 6, 6); }
  },
  envParam(b, r) { const key = (r && r.key) || b.autoShow || 'vol'; return autoParams(b).find(p => p.key === key) || autoParams(b)[0]; },
  envY(r, p, v) { const n = p.scale === 'log' ? Math.log(v / p.min) / Math.log(p.max / p.min) : (v - p.min) / (p.max - p.min); return r.y - V.scrollY + 3 + (1 - clamp(n, 0, 1)) * (r.h - 6); },
  envV(r, p, y) { const n = 1 - clamp((y - (r.y - V.scrollY) - 3) / (r.h - 6), 0, 1); return p.scale === 'log' ? p.min * Math.pow(p.max / p.min, n) : p.min + n * (p.max - p.min); },
  drawEnvelope(g, r, w, h, css) {
    const y = r.y - V.scrollY; if (y > h || y + r.h < 0) return; const p = this.envParam(r.b, r); if (!p) return;
    const pts = r.b.auto[p.key], has = pts && pts.length; const cur = has ? null : currentParam(r.b, p.key);
    g.strokeStyle = has ? css.env : css.envIdle; g.lineWidth = 1.5; g.beginPath();
    if (!has) { const yy = this.envY(r, p, cur); g.moveTo(0, yy); g.lineTo(w, yy); g.stroke(); return; }
    if (OVERRIDES.has(ovKey(r.b, p.key))) { g.strokeStyle = css.dim; g.setLineDash([4, 3]); }
    g.moveTo(0, this.envY(r, p, pts[0].v)); pts.forEach((q, i) => { if (p.steps && i && !q.ramp) g.lineTo(this.x(q.t), this.envY(r, p, pts[i - 1].v)); else if (i && pts[i - 1].c) { const a0 = pts[i - 1]; for (let k = 1; k < 16; k++) { const tt = a0.t + (q.t - a0.t) * k / 16; g.lineTo(this.x(tt), this.envY(r, p, autoValue(pts, tt))); } } g.lineTo(this.x(q.t), this.envY(r, p, q.v)); }); g.lineTo(w, this.envY(r, p, pts[pts.length - 1].v)); g.stroke(); g.setLineDash([]);
    if (p.steps) { g.fillStyle = css.env; g.font = '10px ' + css.mono; pts.forEach(q => { const x = this.x(q.t); if (x > -40 && x < w) g.fillText(q.v.toFixed(1), x + 5, this.envY(r, p, q.v) - 5); }); }
    pts.forEach(q => { const x = this.x(q.t); if (x < -6 || x > w + 6) return; g.fillStyle = this.envSel && this.envSel.pt === q ? css.fg : css.env; g.beginPath(); g.arc(x, this.envY(r, p, q.v), 3.5, 0, 7); g.fill(); });
  },
  renderRuler(css) {
    const { g, w, h } = this.fit(this.ruler); g.fillStyle = css.panel; g.fillRect(0, 0, w, h);
    const LS = 13;
    // loop strip
    g.fillStyle = css.lane; g.fillRect(0, 0, w, LS);
    const lx = this.x(S.loop.start), lw = (S.loop.end - S.loop.start) * V.pps;
    g.fillStyle = S.loop.on ? css.loopOn : css.loopOff; g.fillRect(lx, 1, lw, LS - 2);
    // bars
    const spb = SPB(), gs = Math.max(BEAT(), this.gridStep()), barPx = spb * V.pps, every = barPx >= 40 ? 1 : barPx >= 20 ? 2 : barPx >= 10 ? 4 : barPx >= 5 ? 8 : 16;
    g.font = '10px ' + css.mono;
    meterMap().slice(1).forEach(m => { const x = this.x(m.p); if (x < -40 || x > w) return; g.fillStyle = css.accent; g.font = 'bold 9px ' + css.mono; g.fillText(`${m.n}/${m.d}`, x + 3, LS + 22); g.font = '10px ' + css.mono; });
    for (const B of barLines(this.pos(0), this.pos(w))) for (let s = B.p; s < B.p + B.spb - 1e-6; s += Math.min(gs, B.spb)) {
      const x = px(this.x(s)), bar = B.bar, spb = B.spb;
      if (s === B.p) { g.fillStyle = css.dim; g.fillRect(x, LS, 1, h - LS); if ((bar) % every === 0) { g.fillStyle = css.fg; g.fillText(String(bar + 1), x + 3, LS + 11); } }
      else { const bt = B.bt, isBeat = Math.abs((s - B.p) % bt) < 1e-6; g.fillStyle = isBeat ? css.dim : css.gridBeat; g.fillRect(x, h - (isBeat ? 8 : 5), 1, isBeat ? 8 : 5); if (isBeat && bt * V.pps >= 34) { g.fillStyle = css.dim; g.font = '9px ' + css.mono; g.fillText(`${bar + 1}.${Math.round((s - B.p) / bt) + 1}`, x + 3, LS + 11); g.font = '10px ' + css.mono; } }
    }
    S.markers.forEach(m => { const x = this.x(m.t); g.fillStyle = css.marker; g.beginPath(); g.moveTo(x, h); g.lineTo(x, h - 12); g.lineTo(x + 8, h - 9); g.lineTo(x, h - 6); g.fill(); g.fillStyle = css.dim; g.font = '9px ' + css.ui; g.fillText(m.name, x + 10, h - 4); });
    const rs = V.time && V.time.b > V.time.a ? V.time : this.compSel; if (rs) { const x0 = this.x(rs.a), x1 = this.x(rs.b); g.fillStyle = css.timeSel; g.fillRect(x0, LS, x1 - x0, h - LS); g.fillStyle = css.timeSelEdge; g.fillRect(x0, LS, 1.5, h - LS); g.fillRect(x1 - 1, LS, 1.5, h - LS); }
    tempoPoints().filter(q => q.t > 1e-9).forEach(q => { const x = this.x(q.t); if (x < -40 || x > w) return; g.fillStyle = css.env; g.fillRect(x, LS, 1, 8); g.font = '9px ' + css.mono; g.fillText((q.ramp ? '↗' : '') + Math.round(clamp(q.v, 20, 300) * 10) / 10, x + 3, LS + 22); });
    if (T.playing) { const x = this.x(nowPos()); g.fillStyle = css.playhead; g.beginPath(); g.moveTo(x - 5, LS); g.lineTo(x + 5, LS); g.lineTo(x, LS + 8); g.fill(); }
    const ix = this.x(V.insert); g.fillStyle = css.insert; g.beginPath(); g.moveTo(ix - 4, h); g.lineTo(ix + 4, h); g.lineTo(ix, h - 6); g.fill();
  },
  renderOverview(css) {
    const { g, w, h } = this.fit(this.ov); g.fillStyle = css.lane; g.fillRect(0, 0, w, h);
    const total = Math.max(songEnd() + 32, this.pos(this.lanes.clientWidth)), k = w / total;
    const n = S.tracks.length || 1, rh = Math.max(1, (h - 4) / n);
    S.tracks.forEach((t, i) => t.clips.forEach(c => { g.fillStyle = c.muted ? css.muted : t.color; g.fillRect(c.start * k, 2 + i * rh, Math.max(1, c.len * k), Math.max(1, rh - 0.5)); }));
    g.strokeStyle = css.fg; g.lineWidth = 1; g.strokeRect(V.scrollX * k + 0.5, 0.5, this.lanes.clientWidth / V.pps * k, h - 1);
    if (T.playing) { g.fillStyle = css.playhead; g.fillRect(nowPos() * k, 0, 1, h); }
    this.ovK = k;
  },

  /* ---------- ruler & overview interaction ---------- */
  bindOverview() {
    const ov = $('#overview');
    ov.onpointerdown = e => { ov.setPointerCapture(e.pointerId); const r = ov.getBoundingClientRect(), vis = this.lanes.clientWidth / V.pps, p = (e.clientX - r.left) / this.ovK; let grab = p - V.scrollX; if (grab < 0 || grab > vis) { grab = vis / 2; V.scrollX = Math.max(0, p - grab); this.draw(); } ov.onpointermove = ev => { V.scrollX = Math.max(0, (ev.clientX - r.left) / this.ovK - grab); this.draw(); }; ov.onpointerup = () => (ov.onpointermove = null); };
  },
  bindRuler() {
    const rc = $('#ruler');
    rc.addEventListener('pointerdown', e => {
      const b = rc.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top, pos = this.pos(x);
      rc.setPointerCapture(e.pointerId);
      if (y < 13) { // loop brace
        const L = S.loop, lx = this.x(L.start), rx = this.x(L.end); let mode = Math.abs(x - lx) < 6 ? 'a' : Math.abs(x - rx) < 6 ? 'b' : x > lx && x < rx ? 'move' : 'new';
        const before = deep(L), p0 = this.snap(pos, true); if (mode === 'new') { L.start = L.end = p0; mode = 'b'; }
        rc.onpointermove = ev => { const p = this.snap(this.pos(ev.clientX - b.left), true);
          if (mode === 'move') { const d = p - p0; L.start = Math.max(0, before.start + d); L.end = L.start + (before.end - before.start); }
          else if (mode === 'a') { L.start = Math.min(p, L.end - 1); } else { if (p < L.start) { L.end = L.start; L.start = p; mode = 'a'; } else L.end = Math.max(p, L.start + 1); }
          this.draw(); };
        rc.onpointerup = () => { rc.onpointermove = null; if (L.end - L.start < 1) { Object.assign(L, before); L.on = !L.on; } else if (mode !== 'move' || before.start !== L.start) L.on = true; markDirty(); ui.transport(); this.draw(); };
        return;
      }
      const mk = S.markers.find(m => Math.abs(this.x(m.t) - x) < 8 && y > rc.clientHeight - 14);
      if (mk && e.detail === 2) { renameMarker(mk); return; }
      const x0 = e.clientX, y0 = e.clientY, pps0 = V.pps, anchor = pos; let mode = null;
      rc.onpointermove = ev => {
        const dx = ev.clientX - x0, dy = ev.clientY - y0;
        if (!mode && Math.hypot(dx, dy) > 5) mode = Math.abs(dy) > Math.abs(dx) * 1.3 ? 'zoom' : 'scroll';
        if (mode === 'zoom') { zoomSmooth(pps0 * Math.exp(dy * 0.0095 * (GP.zoomSpeed || 1)), anchor, x); return; }
        if (mode === 'scroll') V.scrollX = Math.max(0, anchor - (ev.clientX - b.left) / V.pps);
        this.draw();
      };
      rc.onpointerup = () => { rc.onpointermove = null; if (!mode) seek(mk ? mk.t : this.snap(pos)); };
    });
    rc.addEventListener('contextmenu', e => { e.preventDefault(); const b = rc.getBoundingClientRect(), x = e.clientX - b.left, mk = S.markers.find(m => Math.abs(this.x(m.t) - x) < 8);
      popMenu(e, mk ? [{ label: 'Loop to next locator', run: () => loopToNextLocator(mk) }, { label: 'Rename locator', run: () => renameMarker(mk) }, { label: 'Delete locator', danger: true, run: () => { pushUndo(); S.markers = S.markers.filter(m => m !== mk); this.draw(); } }]
        : [{ label: 'Add locator here', run: () => addMarker(this.snap(this.pos(x))) }, (() => { const bp = barPos(this.pos(x)), ex = (S.sigs || []).find(c => c.bar === bp.bar + 1); return bp.bar < 1 ? { label: 'Change the song meter in the toolbar', run: () => $('#sig').focus() } : ex ? { label: `Remove ${ex.n}/${ex.d} at bar ${bp.bar + 1}`, run: () => setMeterAt(bp.bar + 1, 0, 0) } : { label: `Time signature change at bar ${bp.bar + 1}…`, run: () => askText('Time signature (for example 6/8)', `${bp.s.n}/${bp.s.d}`, v => { const m = String(v).match(/(\d+)\s*\/\s*(\d+)/); if (m && [1, 2, 4, 8, 16].includes(+m[2])) setMeterAt(bp.bar + 1, clamp(+m[1], 1, 32), +m[2]); }) }; })(), { label: 'Select loop range', run: () => selectLoop() }, { label: S.loop.on ? 'Turn loop off' : 'Turn loop on', run: () => { S.loop.on = !S.loop.on; ui.transport(); this.draw(); } }]); });
  },

  /* ---------- lane interaction ---------- */
  // warp markers: a yellow handle at the top of the clip body and a faint line down through it
  drawWarp(g, c, y, rh) {
    if (!hasWm(c) || rh < 34) return; const x0 = this.x(c.start), x1 = this.x(c.start + c.len); g.save();
    c.wm.forEach(m => { const X = px(this.x(c.start + m.x - c.offset)); if (X < x0 || X > x1) return; g.fillStyle = 'rgba(242,193,78,.45)'; g.fillRect(X, y + 14, 1, rh - 14); g.fillStyle = '#f2c14e'; g.beginPath(); g.moveTo(X - 4, y + 14); g.lineTo(X + 4, y + 14); g.lineTo(X, y + 20); g.fill(); });
    g.restore();
  },
  hitClip(r, x, y) {
    if (!r || r.kind !== 'track') return null; const yy = y + V.scrollY - r.y;
    for (let i = r.b.clips.length - 1; i >= 0; i--) {
      const c = r.b.clips[i], cx = this.x(c.start), cw = c.len * V.pps; if (x < cx - 1 || x > cx + cw + 1) continue;
      let zone = 'body'; const edge = Math.min(6, cw / 4);
      if (c.type === 'audio' && V.selClips.has(c.id) && yy < 10 && r.h >= 34) { if (Math.abs(x - (cx + c.fadeIn * V.pps)) < 6) zone = 'fadeIn'; else if (Math.abs(x - (cx + cw - c.fadeOut * V.pps)) < 6) zone = 'fadeOut'; }
      if (c.type === 'audio' && yy > r.h - 9 && leftOf(r.b, c) && Math.abs(x - cx) < Math.max(6, xfHalf(r.b, c) * V.pps)) zone = 'xf';
      if (hasWm(c) && r.h >= 34 && yy >= 13 && yy <= 24) { const m = c.wm.find(q => Math.abs(this.x(c.start + q.x - c.offset) - x) < 5); if (m) return { c, zone: 'wm', m }; }
      if (zone === 'body') { if (x < cx + edge) zone = 'left'; else if (x > cx + cw - edge) zone = 'right'; else if (yy > (r.h >= 34 ? 15 : r.h / 2)) zone = 'range'; }
      return { c, zone };
    }
    return null;
  },
  bindLanes() {
    const cv = this.lanes;
    cv.addEventListener('wheel', e => {
      e.preventDefault(); const b = cv.getBoundingClientRect(), x = e.clientX - b.left;
      if (e.ctrlKey || e.metaKey) { const z = ZOOM.t, p = z ? z.pos + (x - z.x) / z.pps : this.pos(x); zoomSmooth((z ? z.pps : V.pps) * zoomFactor(e), p, x); return; }
      else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) V.scrollX = Math.max(0, V.scrollX + (e.deltaX || e.deltaY) / V.pps);
      else if (e.altKey) { const r = this.rowAt(e.clientY - b.top); if (r) { r.b.h = clamp(r.b.h - Math.sign(e.deltaY) * 8, 22, 300); ui.headers(); } }
      else V.scrollY = Math.max(0, V.scrollY + e.deltaY);
      this.draw();
    }, { passive: false });
    cv.addEventListener('pointerdown', e => this.down(e));
    cv.addEventListener('pointerleave', () => { if (this.hoverClip) { this.hoverClip = null; this.draw(); } });
    cv.addEventListener('pointermove', e => { if (this.drag) return; { const bb = cv.getBoundingClientRect(), rr = this.rowAt(e.clientY - bb.top), hh = this.hitClip(rr, e.clientX - bb.left, e.clientY - bb.top), id = hh ? hh.c.id : null; if (id !== this.hoverClip) { this.hoverClip = id; this.draw(); } } const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top, r = this.rowAt(y);
      if (V.autoMode || (r && r.kind === 'auto')) { cv.style.cursor = this.envHit(r, x, y) ? 'grab' : e.altKey ? 'ns-resize' : 'crosshair'; return; }
      const h = this.hitClip(r, x, y); cv.style.cursor = h && h.zone === 'wm' ? 'col-resize' : !h || h.zone === 'range' ? 'text' : h.zone === 'left' || h.zone === 'right' || h.zone === 'xf' ? 'ew-resize' : h.zone.startsWith('fade') ? 'col-resize' : 'grab'; });
    cv.addEventListener('dblclick', e => {
      const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top, r = this.rowAt(y); if (!r || V.autoMode) return;
      const h = this.hitClip(r, x, y);
      if (h) { openClip(h.c); return; }
      if (r.kind === 'track' && r.b.kind === 'midi' && !r.b.frozen) { pushUndo('Insert clip'); const bar = SPB(), a = Math.floor(this.pos(x) / bar) * bar; const c = newMidiClip(a, bar, r.b.name); clearRange(r.b, a, a + bar); r.b.clips.push(c); V.selClips = new Set([c.id]); openClip(c); }
    });
    cv.addEventListener('contextmenu', e => { e.preventDefault(); this.context(e); });
    // drops from the browser and the desktop
    cv.addEventListener('dragover', e => { e.preventDefault(); const b = cv.getBoundingClientRect(), y = e.clientY - b.top, x = e.clientX - b.left, r = this.rowAt(y);
      const ry = r ? r.y - V.scrollY : this.totalH - V.scrollY - 80; this.dropHint = { x: this.x(this.snapFloor(this.pos(x))), y: ry, w: 80, h: r ? r.h : 40 }; this.draw(); });
    cv.addEventListener('dragleave', () => { this.dropHint = null; this.draw(); });
    cv.addEventListener('drop', e => { e.preventDefault(); this.dropHint = null; const b = cv.getBoundingClientRect(); dropOnTimeline(e, this.rowAt(e.clientY - b.top), this.snapFloor(this.pos(e.clientX - b.left))); });
  },
  envHit(r, x, y) { if (!r) return null; const p = this.envParam(r.b, r), pts = r.b.auto[p.key] || []; const pt = pts.find(q => Math.hypot(this.x(q.t) - x, this.envY(r, p, q.v) - y) < 7); return pt ? { r, p, pt } : null; },
  down(e) {
    const cv = this.lanes, b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top, r = this.rowAt(y);
    if (e.button === 2) return; cv.setPointerCapture(e.pointerId); cv.focus();
    if (!r) { V.selClips.clear(); V.time = null; this.draw(); return; }
    if (r.kind === 'track' || r.kind === 'return' || r.kind === 'master') { if (!e.shiftKey && !(e.ctrlKey || e.metaKey)) V.selTracks = new Set([r.b.id]); else V.selTracks.add(r.b.id); }
    if (r.kind === 'take') {
      const lane = r.lane, a0 = this.snap(this.pos(x)); this.drag = true; V.time = null;
      cv.onpointermove = ev => { const p = this.snap(this.pos(ev.clientX - b.left)); V.time = { a: Math.min(a0, p), b: Math.max(a0, p), tracks: new Set() }; this.compSel = { r, a: V.time.a, b: V.time.b }; this.draw(); };
      cv.onpointerup = () => { cv.onpointermove = null; this.drag = false; const cs = this.compSel; this.compSel = null; V.time = null;
        if (cs && cs.b - cs.a > 1e-3) compRange(r.b, lane, cs.a, cs.b);
        else { const k = lane.clips.find(c => this.pos(x) >= c.start && this.pos(x) < c.start + c.len); if (k) compRange(r.b, lane, k.start, k.start + k.len); }
        if (T.playing) play(nowPos()); this.draw(); };
      return;
    }
    // automation editing
    if (V.autoMode || r.kind === 'auto') {
      const p = this.envParam(r.b, r); if (!p) return; const hit = this.envHit(r, x, y);
      if (e.altKey && !hit && r.b.auto[p.key] && r.b.auto[p.key].length > 1) { // bend the segment under the pointer
        const pts = r.b.auto[p.key], pos0 = this.pos(x); let i = pts.findIndex((q, k) => k < pts.length - 1 && pos0 >= q.t && pos0 < pts[k + 1].t); if (i < 0) return;
        pushUndo('Curve'); const a0 = pts[i], c0 = a0.c || 0, y0 = e.clientY; this.drag = true;
        cv.onpointermove = ev => { a0.c = clamp(c0 + (ev.clientY - y0) / 80 * (pts[i + 1].v >= a0.v ? 1 : -1), -1, 1); this.draw(); showTip(ev, 'Curve ' + Math.round(a0.c * 100)); };
        cv.onpointerup = () => { cv.onpointermove = null; this.drag = false; hideTip(); this.draw(); }; return;
      }
      if (e.button === 0 && !hit && e.shiftKey && false) return;
      if (hit && e.detail === 2) { pushUndo('Delete point'); r.b.auto[p.key] = r.b.auto[p.key].filter(q => q !== hit.pt); this.draw(); return; }
      pushUndo('Automation'); let pts = r.b.auto[p.key] || (r.b.auto[p.key] = []); let pt = hit && hit.pt;
      if (!pt) { pt = { t: e.shiftKey ? this.pos(x) : this.snap(this.pos(x)), v: this.envV(r, p, y) }; if (!pts.length) pts.push({ t: 0, v: currentParam(r.b, p.key) }); pts.push(pt); pts.sort((a, c) => a.t - c.t); }
      this.envSel = { pt, r }; this.drag = true;
      cv.onpointermove = ev => { const xx = ev.clientX - b.left, yy = ev.clientY - b.top; const i = pts.indexOf(pt); const lo = i > 0 ? pts[i - 1].t : 0, hi = i < pts.length - 1 ? pts[i + 1].t : 1e9; pt.t = clamp(ev.shiftKey ? this.pos(xx) : this.snap(this.pos(xx)), lo, hi); pt.v = this.envV(r, p, yy); this.draw(); showTip(ev, p.fmt ? p.fmt(pt.v) : pt.v.toFixed(2)); };
      cv.onpointerup = () => { cv.onpointermove = null; this.drag = false; hideTip(); ui.headers(); if (p.key === 'tempo') { _tmKey = ''; unfreezeForTempo(); if (T.playing) play(nowPos()); } this.draw(); };
      this.draw(); return;
    }
    let hit = this.hitClip(r, x, y); const pos = this.pos(x);
    if (hit && r.b.frozen && hit.zone !== 'range') { toast(`${r.b.name} is frozen. Unfreeze it (right-click the track) to edit its clips.`); hit = { c: hit.c, zone: 'range' }; }
    if (hit && hit.zone === 'range') { V.editClip = hit.c.id; ui.detail(); hit = null; }
    if (hit) {
      const c = hit.c;
      if (e.shiftKey || e.ctrlKey || e.metaKey) { V.selClips.has(c.id) ? V.selClips.delete(c.id) : V.selClips.add(c.id); }
      else if (!V.selClips.has(c.id)) V.selClips = new Set([c.id]);
      V.time = null; V.insert = this.snap(pos); V.editClip = c.id; ui.detail();
      const sel = S.tracks.flatMap(t => t.clips.filter(k => V.selClips.has(k.id)).map(k => ({ t, c: k, o: deep(k) })));
      const x0 = e.clientX, row0 = this.rows.indexOf(r); let moved = false, undo = false, copied = false;
      this.drag = true;
      cv.onpointermove = ev => {
        const dx = (ev.clientX - x0) / V.pps; if (!moved && Math.abs(ev.clientX - x0) < 3 && Math.abs(ev.clientY - e.clientY) < 3) return;
        if (!undo) { pushUndo(hit.zone === 'body' ? 'Move' : 'Edit clip'); undo = true; } moved = true;
        const snapD = d => (V.snap && !ev.altKey ? Math.round(d / this.gridStep()) * this.gridStep() : d);
        if (hit.zone === 'body') {
          if ((ev.altKey || ev.ctrlKey || ev.metaKey) && !copied) { copied = true; sel.forEach(s => { const k = deep(s.o); k.id = uid(); s.t.clips.push(k); }); }
          const rr = this.rowAt(ev.clientY - b.top), dRow = rr && rr.kind === 'track' ? this.rows.indexOf(rr) - row0 : 0;
          let d = snapD(dx); const lo = Math.min(...sel.map(s => s.o.start)); d = Math.max(d, -lo);
          if (V.snap && !ev.altKey) { // magnetic edges: line up with other clips' starts and ends within a few pixels
            const tol = 6 / V.pps, moving = new Set(sel.map(s => s.c)), edges = []; S.tracks.forEach(t => t.clips.forEach(k => { if (!moving.has(k)) edges.push(k.start, k.start + k.len); }));
            let best = null; sel.forEach(s => [s.o.start + dx, s.o.start + s.o.len + dx].forEach((e, i) => edges.forEach(E => { const diff = E - e; if (Math.abs(diff) < tol && (!best || Math.abs(diff) < Math.abs(best))) best = diff; })));
            if (best != null) d = dx + best;
          }
          sel.forEach(s => {
            s.c.start = s.o.start + d;
            const ti = this.rows.findIndex(q => q.b === s.t); const target = this.rows[ti + dRow];
            if (dRow && target && target.kind === 'track' && target.b.kind === s.t.kind && target.b !== s.t) { s.t.clips = s.t.clips.filter(k => k !== s.c); target.b.clips.push(s.c); s.t = target.b; }
            else if (!dRow) { const home = this.rows.find(q => q.b.clips && q.b.clips.includes(s.c)); if (home && home.b !== s.t) s.t = home.b; }
          });
          showTip(ev, barsBeats(sel[0].c.start));
        } else if (hit.zone === 'right') {
          sel.forEach(s => { s.c.len = Math.max(0.25, s.o.len + snapD(dx)); });
          showTip(ev, 'Length ' + barsBeatsLen(sel[0].c.len));
        } else if (hit.zone === 'left') {
          sel.forEach(s => { let d = snapD(dx); d = Math.min(d, s.o.len - 0.25); if (s.c.type === 'audio') d = Math.max(d, -s.o.offset); s.c.start = Math.max(0, s.o.start + d); const real = s.c.start - s.o.start; s.c.len = s.o.len - real; s.c.offset = s.o.offset + real; if (s.c.type === 'midi' && s.c.offset < 0) s.c.offset = ((s.c.offset % (s.c.bars * 16)) + s.c.bars * 16) % (s.c.bars * 16); });
          showTip(ev, barsBeats(sel[0].c.start));
        } else if (hit.zone === 'xf') { c.xf = Math.max(0, Math.min(2 * Math.abs(this.pos(ev.clientX - b.left) - c.start), c.len, (leftOf(trackOf(c), c) || c).len)); showTip(ev, 'Crossfade ' + barsBeatsLen(c.xf)); }
        else if (hit.zone === 'wm') { const m = hit.m, i = c.wm.indexOf(m), lo = i > 0 ? c.wm[i - 1].x + 0.05 : -Infinity, hi = i < c.wm.length - 1 ? c.wm[i + 1].x - 0.05 : Infinity; m.x = clamp((ev.altKey ? this.pos(ev.clientX - b.left) : this.snap(this.pos(ev.clientX - b.left))) - c.start + c.offset, lo, hi); showTip(ev, 'Warp ' + barsBeats(c.start + m.x - c.offset)); }
        else if (hit.zone === 'fadeIn') { c.fadeIn = clamp((ev.clientX - b.left - this.x(c.start)) / V.pps, 0, c.len - c.fadeOut); }
        else if (hit.zone === 'fadeOut') { c.fadeOut = clamp((this.x(c.start + c.len) - (ev.clientX - b.left)) / V.pps, 0, c.len - c.fadeIn); }
        this.draw();
      };
      cv.onpointerup = () => {
        cv.onpointermove = null; this.drag = false; hideTip();
        if (moved && ['body', 'left', 'right'].includes(hit.zone)) settleClips(sel); // moved or resized clips overwrite what they land on
        if (moved) { markDirty(); if (T.playing) play(nowPos()); }
        ui.detail(); this.draw();
      };
      this.draw(); return;
    }
    // empty area: insert marker + time selection
    V.selClips.clear(); const a = this.snap(pos); V.insert = a; V.time = null;
    if (!T.playing) T.stopPos = a;
    const tracks0 = this.rows.indexOf(r); this.drag = true;
    cv.onpointermove = ev => {
      const p = this.snap(this.pos(ev.clientX - b.left)); const rr = this.rowAt(ev.clientY - b.top); const ti = rr ? this.rows.indexOf(rr) : tracks0;
      const lo = Math.min(tracks0, ti), hi = Math.max(tracks0, ti); V.time = { a: Math.min(a, p), b: Math.max(a, p), tracks: new Set(this.rows.slice(lo, hi + 1).map(q => q.b.id)) };
      if (V.time.b - V.time.a < 1e-6) V.time = null; else { V.selTracks = new Set(V.time.tracks); V.insert = V.time.a; }
      this.draw(); if (V.time) showTip(ev, `${barsBeats(V.time.a)} → ${barsBeats(V.time.b)}  ·  ${barsBeatsLen(V.time.b - V.time.a)}`);
    };
    cv.onpointerup = () => { cv.onpointermove = null; this.drag = false; hideTip(); ui.headers(); ui.detail(); this.draw(); };
    ui.headers(); this.draw();
  },
  context(e) {
    const b = this.lanes.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top, r = this.rowAt(y), hit = this.hitClip(r, x, y);
    const eh = r && (V.autoMode || r.kind === 'auto') ? this.envHit(r, x, y) : null;
    if (eh) { const pts = r.b.auto[eh.p.key], i = pts.indexOf(eh.pt); return popMenu(e, [
      ...(eh.p.key === 'tempo' && i > 0 ? [{ label: eh.pt.ramp ? 'Jump to this tempo (no ramp)' : 'Ramp into this tempo', run: () => { pushUndo('Tempo ramp'); eh.pt.ramp = !eh.pt.ramp; unfreezeForTempo && unfreezeForTempo(); this.draw(); if (T.playing) play(nowPos()); } }] : []),
      ...(eh.pt.c ? [{ label: 'Straighten the curve after this point', run: () => { pushUndo('Curve'); delete eh.pt.c; this.draw(); } }] : []),
      { label: 'Delete point', danger: true, run: () => { pushUndo('Delete point'); r.b.auto[eh.p.key] = pts.filter(q => q !== eh.pt); this.draw(); } }]); }
    if (hit) {
      if (!V.selClips.has(hit.c.id)) V.selClips = new Set([hit.c.id]); this.draw(); const c = hit.c;
      const items = [
        { label: 'Edit clip', run: () => openClip(c) }, { label: 'Rename', run: () => renameClip(c) },
        { label: 'Duplicate', key: 'Ctrl+D', run: () => cmd('duplicate') }, { label: 'Split at insert marker', key: 'Ctrl+E', run: () => cmd('split') },
        { label: c.muted ? 'Activate clip' : 'Deactivate clip', key: '0', run: () => cmd('deactivate') },
        { colors: col => { pushUndo(); V.selClips.forEach(id => (clipById(id).color = col)); this.draw(); } },
      ];
      items.push({ label: 'Crop', key: 'Ctrl+Shift+J', run: () => cropClips() });
      if (c.type === 'audio') items.push({ label: c.revOf ? 'Un-reverse' : 'Reverse', key: 'R', run: () => reverseClips() });
      if (c.type === 'midi') items.push({ label: 'Export as MIDI file…', run: () => exportMidiClip(c) }, ...(c.groove ? [{ label: 'Commit groove', run: () => commitGroove(c) }] : []));
      items.push({ label: 'Extract groove to the pool', run: () => extractGroove(c) });
      if (c.type === 'audio') items.push('-', ...convertMenu(c));
      items.push({ label: 'Consolidate', key: 'Ctrl+J', run: () => cmd('consolidate') });
      if (c.type === 'midi') items.push( { label: 'Quantize notes', key: 'Ctrl+U', run: () => cmd('quantize') });
      if (c.type === 'audio' && (leftOf(trackOf(c), c) || rightOf(trackOf(c), c))) items.push({ label: 'Crossfade with neighbor', key: 'Ctrl+Alt+F', run: () => createCrossfades() });
      if (c.type === 'audio' && c.xf) items.push({ label: 'Remove crossfade', run: () => { pushUndo(); c.xf = 0; this.draw(); } }, ...['linear', 'equal', 'slow', 'fast'].map(sh => ({ label: `Crossfade shape: ${{ linear: 'Linear', equal: 'Equal power', slow: 'Slow', fast: 'Fast' }[sh]}${(c.xfShape || 'linear') === sh ? ' ✓' : ''}`, run: () => { pushUndo(); c.xfShape = sh; this.draw(); } })));
      if (c.type === 'audio') items.push('-', ...(hit.zone === 'wm' ? [{ label: 'Delete this warp marker', danger: true, run: () => { pushUndo('Delete warp marker'); c.wm = c.wm.filter(m => m !== hit.m); this.draw(); if (T.playing) play(nowPos()); } }] : []), ...warpMenu(c, this.pos(x)), '-');
      if (c.type === 'audio') items.push({ label: c.loop ? 'Turn clip loop off' : 'Loop this clip', run: () => { pushUndo('Loop'); c.loop = !c.loop; if (c.loop && !c.loopLen) c.loopLen = Math.min(c.len, Math.max(1, clipNaturalLen(c) - c.offset)); this.draw(); ui.detail(); } });
      if (c.type === 'audio') items.push({ label: c.warp ? 'Turn warp off' : 'Turn warp on', run: () => { pushUndo(); c.warp = !c.warp; if (c.warp) c.srcBpm = c.srcBpm || S.bpm; this.draw(); ui.detail(); } }, { label: 'Slice to new MIDI track', run: () => sliceToMidi(c) }, { label: 'Crop to clip length', run: () => toast('The clip already plays only its region; the file stays untouched.') });
      items.push('-', { label: 'Delete', danger: true, run: () => cmd('delete') });
      popMenu(e, items); return;
    }
    const items = [];
    if (r && (V.autoMode || r.kind === 'auto') && V.time && V.time.b > V.time.a) { const p = this.envParam(r.b, r); items.push(...['Sine', 'Triangle', 'Saw up', 'Saw down', 'Square', 'Ramp up', 'Ramp down'].map(sh => ({ label: 'Insert ' + sh.toLowerCase() + ' shape', run: () => insertAutoShape(r.b, p, sh, V.time.a, V.time.b) })), { label: 'Copy automation', run: () => copyAuto(r.b, p.key) }, '-'); }
    if (r && (V.autoMode || r.kind === 'auto') && AUTO_CLIP) items.push({ label: 'Paste automation at insert marker', run: () => pasteAuto(r.b, this.envParam(r.b, r).key) }, '-');
    if (r && r.kind === 'track' && r.b.kind === 'midi') items.push({ label: 'Insert MIDI clip', key: 'Ctrl+Shift+M', run: () => cmd('newClip') });
    if (CLIPBOARD) items.push({ label: 'Paste', key: 'Ctrl+V', run: () => cmd('paste') });
    if (r && r.kind === 'track') items.push(...trackRenderMenu(r.b), '-');
    if (V.time) items.push({ label: 'Delete Time', key: 'Ctrl+Shift+Del', run: () => deleteTime(V.time.a, V.time.b) }, { label: 'Insert Silence', key: 'Ctrl+Alt+I', run: () => insertSilence(V.time.a, V.time.b) }, { label: 'Duplicate Time', key: 'Ctrl+Shift+D', run: () => duplicateTime(V.time.a, V.time.b) }, { label: 'Crop to selection', key: 'Ctrl+Shift+J', run: () => cropClips() }, '-');
    if (V.time) items.push({ label: 'Consolidate time to new clip', key: 'Ctrl+J', run: () => cmd('consolidate') }, { label: 'Bounce selection to new track', run: () => bounceSelection() });
    if (V.time) items.push({ label: 'Loop selection', key: 'Ctrl+L', run: () => cmd('loopSel') }, { label: 'Split at selection', key: 'Ctrl+E', run: () => cmd('split') }, { label: 'Delete time-range contents', run: () => cmd('delete') });
    items.push({ label: 'Add locator at insert marker', run: () => addMarker(V.insert) }, { label: 'Import audio file…', run: importAudioDialog });
    popMenu(e, items);
  },
};
// Smooth zoom: proportional to the scroll distance, capped per event (mouse wheel notch ≈ 12%).
// line positions rounded to physical pixels, so grid lines glide evenly on Retina screens as the view scrolls
const px = v => Math.round(v * (devicePixelRatio || 1)) / (devicePixelRatio || 1);
const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
// A collapsed track is a thin strip: its clips still show, with their names.
const rowH = b => (b.collapsed ? 22 : b.h || 40);
const zoomFactor = e => { const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY, sp = GP.zoomSpeed || 1, pinch = e.deltaMode === 0 && Math.abs(d) < 40; return clamp(Math.exp(-d * (pinch ? 0.011 : 0.0021) * sp), 0.7, 1.4); };
/* Smooth zoom: the view eases toward the target zoom over a few frames, keeping the point under the pointer fixed. */
const ZOOM = { t: null, raf: 0 };
function zoomSmooth(target, pos, x) {
  ZOOM.t = { pps: clamp(target, 0.08, 120), pos, x };
  if (REDUCED || GP.smooth === false) { V.pps = ZOOM.t.pps; V.scrollX = Math.max(0, pos - x / V.pps); ZOOM.t = null; arr.draw(); return; }
  if (!ZOOM.raf) ZOOM.raf = requestAnimationFrame(zoomStep);
}
function zoomStep() {
  ZOOM.raf = 0; const z = ZOOM.t; if (!z) return; const k = Math.log(z.pps / V.pps);
  V.pps = Math.abs(k) < 0.003 ? z.pps : V.pps * Math.exp(k * 0.32); V.scrollX = Math.max(0, z.pos - z.x / V.pps); arr.draw();
  if (V.pps !== z.pps) ZOOM.raf = requestAnimationFrame(zoomStep); else ZOOM.t = null;
}
// Clips that moved or changed length replace whatever they now overlap on their track.
function settleClips(list) { const moved = new Set(list.map(s => s.c)); new Set(list.map(s => s.t)).forEach(t => { const mine = t.clips.filter(k => moved.has(k)); t.clips = t.clips.filter(k => !moved.has(k)); mine.forEach(k => clearRange(t, k.start, k.start + k.len)); t.clips.push(...mine); }); }
const barsBeats = s => { if (s < 0) return '-' + barsBeatsLen(-s); const b = barPos(s), r = s - b.start, bt = b.s.bt; return `${b.bar + 1}.${Math.floor(r / bt + 1e-9) + 1}.${Math.floor(r % bt + 1e-9) + 1}`; };
const barsBeatsLen = s => { const spb = SPB(), bt = BEAT(); return `${Math.floor(s / spb)}.${Math.floor((s % spb) / bt)}.${+(s % bt).toFixed(2)}`; };
function mix(c1, c2, t) { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const a = p(c1.length === 7 ? c1 : '#888888'), b = p(c2.length === 7 ? c2 : '#222222'); return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, '0')).join(''); }
let _css = null, _cssT = 0;
function CSS() {
  if (_css && performance.now() - _cssT < 1000) return _css;
  const s = getComputedStyle(document.documentElement), v = k => s.getPropertyValue(k).trim();
  _cssT = performance.now();
  return (_css = { lane: v('--lane'), laneRow: v('--laneRow'), laneBus: v('--laneBus'), laneSel: v('--laneSel'), line: v('--line'), gridBar: v('--gridBar'), gridBeat: v('--gridBeat'), gridFine: v('--gridFine'), loopShade: v('--loopShade'), timeSel: v('--timeSel'), barAlt: v('--barAlt'), gridHair: v('--gridHair'), timeSelEdge: v('--timeSelEdge'), marker: v('--marker'), recClip: v('--rec'), env: v('--env'), envIdle: v('--envIdle'), insert: v('--insert'), playhead: v('--playhead'), accent: v('--accent'), fg: v('--fg'), dim: v('--dim'), muted: v('--muted'), panel: v('--panel'), loopOn: v('--loopOn'), loopOff: v('--loopOff'), ui: v('--ui'), mono: v('--mono') });
}
function addMarker(t) { pushUndo('Locator'); S.markers.push({ id: uid(), t, name: 'Locator ' + (S.markers.length + 1) }); S.markers.sort((a, b) => a.t - b.t); arr.draw(); }
function renameMarker(m) { askText('Locator name', m.name, v => { pushUndo(); m.name = v; arr.draw(); }); }
function renameClip(c) { askText('Clip name', c.name, v => { pushUndo(); c.name = v; arr.draw(); ui.detail(); }); }
function openClip(c) { if ($('#app').classList.contains('nodetail')) setDetailShown(true); V.editClip = c.id; V.selClips = new Set([c.id]); const t = trackOf(c); if (t) V.selTracks = new Set([t.id]); V.detail = 'clip'; ui.detail(); ui.headers(); arr.draw(); }
async function dropOnTimeline(e, r, at) {
  if (typeof browser !== 'undefined' && browser.stopPreview) browser.stopPreview();
  const dt = e.dataTransfer, track = r && r.kind === 'track' ? r.b : null;
  const sbs = dt.getData('sb/sample'), sbd = dt.getData('sb/device'), sbi = dt.getData('sb/inst'), sbp = dt.getData('sb/plugin');
  const sbm = dt.getData('sb/midifx'); if (sbm) return addMidiFx(sbm, track && track.kind === 'midi' ? track : null);
  if (sbp) { const o = JSON.parse(sbp); if (!NE.on) return toast('Turn on the native engine in Settings → Audio to use plug-ins'); return addPlugin(o.ref, o.instrument, track || (r ? r.b : null)); }
  if (sbd) { const b = r ? r.b : null; if (b) { pushUndo('Add device'); b.devices.push(newDevice(sbd)); rewire(b); V.selTracks = new Set([b.id]); V.detail = 'devices'; ui.all(); } return; }
  if (sbi) { addInstrumentTrack(sbi, track && track.kind === 'midi' ? track : null); return; }
  const files = sbs ? [JSON.parse(sbs)] : [...dt.files].map(f => ({ file: f }));
  if (!files.length) return; pushUndo('Add audio'); let t = track;
  for (const f of files) {
    let sid = null;
    if (f.sid) sid = f.sid; else if (f.path) sid = await loadAudioPath(f.path);
    else if (f.fileId) { const wf = WEB_FILES.get(f.fileId); if (wf) sid = await loadAudioFile({ name: wf.name, path: null, data: await wf.arrayBuffer() }); }
    else if (f.file) { if (/\.midi?$/i.test(f.file.name)) { await importMidiFile({ name: f.file.name, data: await f.file.arrayBuffer() }, at, track); return; } if (/\.(als|sbproj|json)$/i.test(f.file.name)) { openProjectFile({ name: f.file.name, path: IS_DESKTOP && f.file.path ? f.file.path : null, data: await f.file.arrayBuffer() }); return; } sid = await loadAudioFile({ name: f.file.name, path: IS_DESKTOP && f.file.path ? f.file.path : null, data: await f.file.arrayBuffer() }); }
    if (!sid) continue; const res = placeAudio(sid, t, at); if (res) { V.selClips = new Set([res.clip.id]); V.editClip = res.clip.id; t = null; }
  }
  ui.all();
}
function sliceToMidi(c) {
  const s = SAMPLES.get(c.sampleId); if (!s) return; pushUndo('Slice to MIDI');
  const t = newTrack('midi', 'sampler', c.name + ' slices'); Object.assign(t.inst, { sampleId: c.sampleId, srcBpm: c.warp ? c.srcBpm : S.bpm, sync: c.warp, cues: findCues(s.env, s.buf.sampleRate, 512, 16, s.buf.duration) });
  S.tracks.splice(S.tracks.indexOf(trackOf(c)) + 1, 0, t); buildBus(t, 'track');
  const mc = newMidiClip(c.start, c.len, 'Slices'); mc.bars = c.len / 16;
  t.inst.cues.forEach((cu, i) => { const st = cu * c.srcBpm / 15 - c.offset; if (st >= 0 && st < c.len) mc.notes.push({ p: i, s: Math.round(st * 4) / 4, l: 1, v: 0.85, c: 1 }); });
  t.clips.push(mc); V.selTracks = new Set([t.id]); openClip(mc); ui.all(); toast('Sliced into 16 pads on a new MIDI track');
}
