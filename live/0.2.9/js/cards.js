/* ============ knobs ============ */
function norm(v, min, max, scale) { return scale === 'log' ? Math.log(v / min) / Math.log(max / min) : (v - min) / (max - min); }
function denorm(n, min, max, scale) { return scale === 'log' ? min * Math.pow(max / min, n) : min + n * (max - min); }
let _kGest = 0;
function knob({ label, value, min, max, scale, fmt, step, def, onInput, small, onStart }) {
  const gesture = () => { const n = performance.now(); if (n - _kGest > 700 && !T.busy) (onStart || (() => pushUndo(label)))(); _kGest = n; };
  const el = document.createElement('div'); el.className = 'knob' + (small ? ' sm' : '');
  el.innerHTML = `<svg viewBox="0 0 40 40" aria-hidden="true"><path class="kt" d="M9.4 30.6 A15 15 0 1 1 30.6 30.6"/><path class="kv"/><line class="kp" x1="20" y1="20" x2="20" y2="7"/></svg><span class="kl">${esc(label)}</span><span class="kx"></span>`;
  el.tabIndex = 0; el.setAttribute('role', 'slider'); el.setAttribute('aria-label', label);
  let v = value; const f = fmt || (x => x.toFixed(2)); const d0 = def != null ? def : value;
  const draw = () => {
    const n = clamp(norm(v, min, max, scale), 0, 1), a = -135 + n * 270, r = 15, rad = x => (x - 90) * Math.PI / 180;
    const sx = 20 + r * Math.cos(rad(-135)), sy = 20 + r * Math.sin(rad(-135)), ex = 20 + r * Math.cos(rad(a)), ey = 20 + r * Math.sin(rad(a));
    $('.kv', el).setAttribute('d', n < 0.003 ? '' : `M${sx} ${sy} A${r} ${r} 0 ${n > 2 / 3 ? 1 : 0} 1 ${ex} ${ey}`);
    $('.kp', el).setAttribute('transform', `rotate(${a} 20 20)`); $('.kx', el).textContent = f(v);
    el.setAttribute('aria-valuetext', f(v));
  };
  const set = n => { let nv = denorm(clamp(n, 0, 1), min, max, scale); if (step) nv = Math.round(nv / step) * step; if (nv !== v) { v = nv; draw(); onInput(v); } };
  el.addEventListener('pointerdown', e => {
    if (e.button !== 0) return; e.preventDefault(); gesture(); el.setPointerCapture(e.pointerId); el.classList.add('drag');
    let y = e.clientY, n = norm(v, min, max, scale);
    const mv = ev => { n = clamp(n + (y - ev.clientY) / (ev.shiftKey ? 700 : 160), 0, 1); y = ev.clientY; set(n); };
    const up = () => { el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.classList.remove('drag'); markDirty(); };
    el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up);
  });
  el.addEventListener('dblclick', () => { gesture(); v = d0; draw(); onInput(v); });
  el.addEventListener('wheel', e => { e.preventDefault(); gesture(); set(norm(v, min, max, scale) - Math.sign(e.deltaY) * (e.shiftKey ? 0.005 : 0.03)); }, { passive: false });
  el.addEventListener('keydown', e => { const d = { ArrowUp: 0.02, ArrowRight: 0.02, ArrowDown: -0.02, ArrowLeft: -0.02 }[e.key]; if (d) { e.preventDefault(); e.stopPropagation(); set(norm(v, min, max, scale) + d); } });
  el.setValue = x => { v = x; draw(); };
  draw(); return el;
}
function selectEl(options, value, onChange, label) {
  const s = document.createElement('select'); s.className = 'dd'; if (label) s.setAttribute('aria-label', label);
  options.forEach(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; const op = document.createElement('option'); op.value = v; op.textContent = l; if (String(v) === String(value)) op.selected = true; s.appendChild(op); });
  s.onchange = () => onChange(typeof value === 'number' ? Number(s.value) : s.value); return s;
}
function toggleEl(label, on, onChange) {
  const b = document.createElement('button'); b.className = 'tog' + (on ? ' on' : ''); b.textContent = label; b.setAttribute('aria-pressed', on);
  b.onclick = () => { on = !on; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); onChange(on); }; return b;
}
function paramGrid(defs, obj, onChange) {
  const g = document.createElement('div'); g.className = 'pgrid';
  for (const d of defs) {
    if (d.group) { const h = document.createElement('div'); h.className = 'pgroup'; h.textContent = d.group; g.appendChild(h); continue; }
    let el;
    if (d.options) { el = document.createElement('label'); el.className = 'psel'; el.innerHTML = `<span>${esc(d.label)}</span>`; el.appendChild(selectEl(d.options, obj[d.k], v => { obj[d.k] = v; onChange(d.k, v); }, d.label)); }
    else if (d.toggle) el = toggleEl(d.label, !!obj[d.k], v => { obj[d.k] = v; onChange(d.k, v); });
    else el = knob({ label: d.label, value: obj[d.k], min: d.min, max: d.max, scale: d.scale, fmt: d.fmt, step: d.step, onInput: v => { obj[d.k] = v; onChange(d.k, v); } });
    g.appendChild(el);
  }
  return g;
}

/* ============ pad flash & activity lights ============ */
const FLASH = new Map(); // trackId -> {pad: time}
const ACT = new Map();   // trackId -> last note time
function flashPad(tid, pad) {
  const at = ctx.currentTime; // shown when the note actually sounds
  setTimeout(() => {
    ACT.set(tid, performance.now());
    const el = document.querySelector(`[data-pad="${tid}:${pad}"]`); if (el) { el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit'); }
  }, 0);
  return at;
}
function flashPadAt(tid, pad, time) { setTimeout(() => flashPad(tid, pad), Math.max(0, (time - ctx.currentTime) * 1000)); }

/* ============ device cards ============ */
function cardShell(title, sub, opts = {}) {
  const c = document.createElement('div'); c.className = 'card' + (opts.wide ? ' wide' : '') + (opts.off ? ' off' : '');
  c.innerHTML = `<div class="ch">${opts.power ? `<button class="pwr ${opts.off ? '' : 'on'}" aria-label="Turn ${esc(title)} on or off"></button>` : ''}<span class="cname">${esc(title)}</span><span class="csub">${esc(sub || '')}</span><span class="spacer"></span>${opts.tools || ''}</div><div class="cb"></div>`;
  return c;
}
function deviceCard(o, d, i) {
  const def = DEVICES[d.type];
  const c = cardShell(d.type === 'plugin' ? d.p.name : def.name, d.type === 'plugin' ? `${d.p.format} ${d.p.role === 'instrument' ? 'instrument' : 'effect'} · not loaded` : def.blurb, { power: true, off: !d.on, wide: def.wide, tools: `<button class="ic" data-mv="-1" aria-label="Move left">‹</button><button class="ic" data-mv="1" aria-label="Move right">›</button><button class="ic" data-rm aria-label="Remove device">✕</button>` });
  c.draggable = true; c.dataset.di = i;
  const r = devRT(d), body = $('.cb', c);
  const changed = () => { r.set(); markDirty(); };
  $('.pwr', c).onclick = () => { d.on = !d.on; c.classList.toggle('off', !d.on); $('.pwr', c).classList.toggle('on', d.on); rewire(o); markDirty(); };
  $('[data-rm]', c).onclick = () => { o.devices.splice(i, 1); r.dispose(); DEV_RT.delete(d.id); rewire(o); ui.detail(); markDirty(); };
  $$('[data-mv]', c).forEach(b => (b.onclick = () => { const j = i + +b.dataset.mv; if (j < 0 || j >= o.devices.length) return; [o.devices[i], o.devices[j]] = [o.devices[j], o.devices[i]]; rewire(o); ui.detail(); markDirty(); }));
  c.addEventListener('dragstart', e => { if (e.target !== c) return; e.dataTransfer.setData('gw/dev', String(i)); c.classList.add('dragging'); });
  c.addEventListener('dragend', () => c.classList.remove('dragging'));
  c.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('gw/dev')) { e.preventDefault(); c.classList.add('dropl'); } });
  c.addEventListener('dragleave', () => c.classList.remove('dropl'));
  c.addEventListener('drop', e => { const f = e.dataTransfer.getData('gw/dev'); if (f === '') return; e.preventDefault(); const [x] = o.devices.splice(+f, 1); o.devices.splice(i, 0, x); rewire(o); ui.detail(); markDirty(); });
  c.querySelector('.ch').addEventListener('contextmenu', e => { e.preventDefault(); popMenu(e, [{ label: 'Show automation for this device', run: () => { const p = autoParams(o).find(x => x.key.includes(d.id)); if (p) { o.autoShow = p.key; V.autoMode = true; ui.all(); } } }, { label: d.on ? 'Turn off' : 'Turn on', run: () => $('.pwr', c).click() }, { label: 'Delete', danger: true, run: () => $('[data-rm]', c).click() }]); });
  if (d.type === 'plugin') { body.innerHTML = `<p class="plugnote">Studio B can't run ${esc(d.p.format)} plug-ins yet, so this slot passes audio straight through.${d.p.role === 'instrument' ? ' The notes are playing on a built-in synth for now.' : ''}</p><p class="plugnote muted">To hear the real sound: in Ableton, right-click the track and choose <b>Freeze Track</b>, save, then open the set here again. Studio B brings frozen tracks in as audio.</p>`; return c; }
  if (d.type === 'eq') eqEditor(body, d, r, changed);
  else if (d.type === 'tune') { tuneView(body, d, r); body.appendChild(paramGrid(def.params, d.p, changed)); }
  else {
    if (d.type === 'comp' || d.type === 'limit' || d.type === 'gate') grMeter(body, r);
    if (d.type === 'comp') { const row = document.createElement('label'); row.className = 'psel scsel'; row.innerHTML = '<span>Sidechain from</span>'; const opts = [['', 'Off (its own input)'], ...S.tracks.filter(t => t !== o).map(t => [t.id, t.name]), ...S.returns.filter(t => t !== o).map(t => [t.id, t.name])]; row.appendChild(selectEl(opts, d.p.sc || '', v => { pushUndo('Sidechain'); d.p.sc = v || null; r.set(); wireSidechains(); markDirty(); }, 'Sidechain source')); body.appendChild(row); }
    body.appendChild(paramGrid(def.params, d.p, changed));
  }
  return c;
}
function grMeter(body, r) {
  const m = document.createElement('div'); m.className = 'gr'; m.innerHTML = '<span>Gain reduction</span><div class="grbar"><i></i></div><b>0.0 dB</b>'; body.appendChild(m);
  VIS.add(() => { if (!m.isConnected) return false; const g = r.reductionDb != null ? r.reductionDb : r.gr != null ? r.gr : -r.c.reduction; $('i', m).style.width = clamp(g / 24, 0, 1) * 100 + '%'; $('b', m).textContent = '-' + g.toFixed(1) + ' dB'; });
}
function tuneView(body, d, r) {
  const v = document.createElement('div'); v.className = 'tunev';
  v.innerHTML = PITCH_OK ? `<div class="tnote">--</div><div class="tscale"><i class="tneedle"></i><i class="tcorr"></i><span>-50</span><span>0</span><span>+50</span></div><div class="tinfo muted">Listening for a pitched sound</div>` : '<p class="muted">Pitch processing needs a browser with AudioWorklet support.</p>';
  body.appendChild(v); if (!PITCH_OK) return;
  VIS.add(() => {
    if (!v.isConnected) return false; const i = r.info || {};
    if (i.f > 0 && i.m) {
      const cents = (i.m - Math.round(i.m)) * 100, corr = (i.tm - i.m) * 100;
      $('.tnote', v).textContent = noteName(Math.round(i.tm || i.m)); $('.tneedle', v).style.left = 50 + clamp(cents, -50, 50) + '%';
      $('.tcorr', v).style.left = 50 + clamp(corr, -50, 50) / 1 + '%';
      $('.tinfo', v).textContent = `In ${i.f.toFixed(1)} Hz (${noteName(Math.round(i.m))} ${cents >= 0 ? '+' : ''}${cents.toFixed(0)}c) → out ${noteName(Math.round(i.tm))} · moving ${corr >= 0 ? '+' : ''}${corr.toFixed(0)} cents`;
      v.classList.add('lock');
    } else v.classList.remove('lock');
  });
}

/* --- EQ editor (curve, draggable nodes, analyzer) --- */
const EQ_COLORS = ['#ff8a5c', '#f2c14e', '#86cf86', '#56c2d6', '#9b8cff', '#e47cc8', '#d6a16a', '#79a6ff'];
function eqEditor(body, d, r, changed) {
  const wrap = document.createElement('div'); wrap.className = 'eqw';
  wrap.innerHTML = `<canvas class="eqc" aria-label="EQ curve. Double-click to add a band, drag points to shape, scroll to change width."></canvas><div class="eqbar"></div>`;
  body.appendChild(wrap);
  const cv = $('canvas', wrap), bar = $('.eqbar', wrap);
  let selB = 0, range = 18, drag = null, hover = -1;
  const F = new Float32Array(240); for (let i = 0; i < F.length; i++) F[i] = 20 * Math.pow(1000, i / (F.length - 1));
  const W = () => cv.clientWidth, H = () => cv.clientHeight;
  const fx = f => Math.log(f / 20) / Math.log(1000) * W(), xf = x => 20 * Math.pow(1000, clamp(x / W(), 0, 1));
  const gy = g => H() / 2 - g / range * (H() / 2 - 10), yg = y => clamp(-(y - H() / 2) / (H() / 2 - 10) * range, -range, range);
  const hasGain = b => ['bell', 'low shelf', 'high shelf'].includes(b.type);
  const nodeXY = b => [fx(b.f), hasGain(b) ? gy(b.g) : gy(0)];
  const bandBar = () => {
    const b = d.p.bands[selB]; bar.innerHTML = '';
    const tabs = document.createElement('div'); tabs.className = 'eqtabs';
    d.p.bands.forEach((x, i) => { const t = document.createElement('button'); t.className = 'eqt' + (i === selB ? ' on' : '') + (x.on ? '' : ' dim'); t.style.setProperty('--bc', EQ_COLORS[i % 8]); t.textContent = i + 1; t.onclick = () => { selB = i; bandBar(); }; tabs.appendChild(t); });
    const outK = knob({ label: 'Output', value: d.p.out, min: -18, max: 18, def: 0, small: true, fmt: fDb, onInput: v => { d.p.out = v; changed(); } });
    bar.appendChild(tabs);
    if (b) {
      const ctl = document.createElement('div'); ctl.className = 'eqctl';
      ctl.appendChild(toggleEl('On', b.on, v => { b.on = v; changed(); bandBar(); }));
      ctl.appendChild(selectEl(Object.keys(EQ_TYPES), b.type, v => { b.type = v; if (!hasGain(b)) b.g = 0; changed(); bandBar(); }, 'Band shape'));
      if (b.type === 'low cut' || b.type === 'high cut') ctl.appendChild(selectEl([[12, '12 dB/oct'], [24, '24 dB/oct'], [36, '36 dB/oct'], [48, '48 dB/oct']], b.slope, v => { b.slope = v; changed(); }, 'Slope'));
      const mk = (k, label, min, max, scale, fmt) => knob({ label, value: b[k], min, max, scale, fmt, small: true, onInput: v => { b[k] = v; changed(); } });
      ctl.appendChild(mk('f', 'Freq', 20, 20000, 'log', fHz)); if (hasGain(b)) ctl.appendChild(mk('g', 'Gain', -range, range, null, fDb)); ctl.appendChild(mk('q', 'Q', 0.1, 18, 'log', v => v.toFixed(2)));
      const del = document.createElement('button'); del.className = 'btn ghostb'; del.textContent = 'Remove band'; del.onclick = () => { d.p.bands.splice(selB, 1); selB = Math.max(0, selB - 1); changed(); bandBar(); }; ctl.appendChild(del);
      bar.appendChild(ctl);
    } else { const p = document.createElement('span'); p.className = 'muted'; p.textContent = 'Double-click the curve to add a band'; bar.appendChild(p); }
    const rs = selectEl([[12, '±12 dB'], [18, '±18 dB'], [30, '±30 dB']], range, v => { range = v; bandBar(); }, 'Display range'); bar.appendChild(rs); bar.appendChild(outK);
  };
  const hit = (x, y) => { let best = -1, bd = 14; d.p.bands.forEach((b, i) => { const [nx, ny] = nodeXY(b); const dd = Math.hypot(nx - x, ny - y); if (dd < bd) { bd = dd; best = i; } }); return best; };
  cv.addEventListener('pointerdown', e => {
    const rc = cv.getBoundingClientRect(), x = e.clientX - rc.left, y = e.clientY - rc.top, i = hit(x, y);
    if (i < 0) return; selB = i; bandBar(); cv.setPointerCapture(e.pointerId);
    if (e.altKey) { d.p.bands[i].on = !d.p.bands[i].on; changed(); bandBar(); return; }
    drag = { i };
  });
  cv.addEventListener('pointermove', e => {
    const rc = cv.getBoundingClientRect(), x = e.clientX - rc.left, y = e.clientY - rc.top;
    if (!drag) { hover = hit(x, y); cv.style.cursor = hover >= 0 ? 'grab' : 'crosshair'; return; }
    const b = d.p.bands[drag.i]; b.f = Math.round(xf(x)); if (hasGain(b) && !e.shiftKey) b.g = Math.round(yg(y) * 10) / 10; changed(); bandBarLive();
  });
  const bandBarLive = () => { clearTimeout(bandBarLive.t); bandBarLive.t = setTimeout(bandBar, 60); };
  cv.addEventListener('pointerup', () => { if (drag) { drag = null; bandBar(); } });
  cv.addEventListener('dblclick', e => {
    const rc = cv.getBoundingClientRect(), x = e.clientX - rc.left, y = e.clientY - rc.top, i = hit(x, y);
    if (i >= 0) { d.p.bands.splice(i, 1); selB = Math.max(0, Math.min(selB, d.p.bands.length - 1)); changed(); bandBar(); return; }
    if (d.p.bands.length >= 8) return toast('Prism EQ holds up to 8 bands');
    const f = xf(x), type = f < 40 ? 'low cut' : f > 14000 ? 'high cut' : 'bell';
    d.p.bands.push({ on: true, type, f: Math.round(f), g: type === 'bell' ? Math.round(yg(y) * 10) / 10 : 0, q: type === 'bell' ? 1 : 0.71, slope: 24 }); selB = d.p.bands.length - 1; changed(); bandBar();
  });
  cv.addEventListener('wheel', e => { const rc = cv.getBoundingClientRect(); let i = hit(e.clientX - rc.left, e.clientY - rc.top); if (i < 0) i = selB; const b = d.p.bands[i]; if (!b) return; e.preventDefault(); b.q = clamp(b.q * (e.deltaY < 0 ? 1.12 : 1 / 1.12), 0.1, 18); changed(); bandBarLive(); }, { passive: false });
  const spec = new Float32Array(r.an.frequencyBinCount); let smooth = null;
  VIS.add(() => {
    if (!cv.isConnected) return false;
    const dpr = devicePixelRatio || 1, w = W(), h = H(); if (!w) return;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const css = getComputedStyle(document.documentElement);
    g.strokeStyle = css.getPropertyValue('--line'); g.lineWidth = 1; g.font = '10px ' + css.getPropertyValue('--mono'); g.fillStyle = css.getPropertyValue('--dim');
    [50, 100, 200, 500, 1000, 2000, 5000, 10000].forEach(f => { const x = Math.round(fx(f)) + 0.5; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); g.fillText(f >= 1000 ? f / 1000 + 'k' : f, x + 3, h - 4); });
    [-12, -6, 0, 6, 12].filter(v => Math.abs(v) <= range).forEach(v => { const y = Math.round(gy(v)) + 0.5; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); g.fillText((v > 0 ? '+' : '') + v, 3, y - 3); });
    // analyzer
    r.an.getFloatFrequencyData(spec); const sr = ctx.sampleRate, N = r.an.fftSize;
    if (!smooth) smooth = new Float32Array(F.length).fill(-120);
    g.beginPath(); g.moveTo(0, h);
    for (let i = 0; i < F.length; i++) {
      const bin = clamp(Math.round(F[i] * N / sr), 1, spec.length - 1); const v = Math.max(spec[bin], spec[bin + 1] || -140);
      smooth[i] = Math.max(v + 4.5 * Math.log2(F[i] / 1000) * 0.5, smooth[i] - 1.6);
      const y = h - clamp((smooth[i] + 100) / 90, 0, 1) * h; g.lineTo(fx(F[i]), y);
    }
    g.lineTo(w, h); g.closePath(); g.fillStyle = css.getPropertyValue('--spec'); g.fill();
    // band fills
    d.p.bands.forEach((b, i) => {
      if (!b.on || i !== selB) return; const m = r.bandResponse(i, F); g.beginPath(); g.moveTo(0, gy(0));
      for (let k = 0; k < F.length; k++) g.lineTo(fx(F[k]), gy(clamp(gainToDb(m[k]), -range - 4, range + 4)));
      g.lineTo(w, gy(0)); g.closePath(); g.fillStyle = EQ_COLORS[i % 8] + '33'; g.fill();
    });
    // total curve
    const m = r.response(F); g.beginPath();
    for (let k = 0; k < F.length; k++) { const y = gy(clamp(gainToDb(m[k]) + d.p.out, -range - 4, range + 4)); k ? g.lineTo(fx(F[k]), y) : g.moveTo(0, y); }
    g.strokeStyle = css.getPropertyValue('--fg'); g.lineWidth = 2; g.stroke();
    d.p.bands.forEach((b, i) => {
      const [x, y] = nodeXY(b); g.beginPath(); g.arc(x, y, i === selB ? 7 : 5.5, 0, Math.PI * 2);
      g.fillStyle = b.on ? EQ_COLORS[i % 8] : css.getPropertyValue('--panel2'); g.fill(); g.lineWidth = i === hover || i === selB ? 2 : 1; g.strokeStyle = css.getPropertyValue('--fg'); g.stroke();
      g.fillStyle = '#16141a'; g.font = 'bold 9px ' + css.getPropertyValue('--mono'); g.fillText(i + 1, x - 2.6, y + 3.2);
    });
  });
  bandBar();
}

/* ============ instrument cards ============ */
function instrumentCard(t) {
  const inst = RT.get(t.id).inst;
  if (t.inst.type === 'synth') {
    const c = cardShell('Contour', 'Synth', { wide: true }); const body = $('.cb', c);
    const top = document.createElement('div'); top.className = 'row';
    top.appendChild(selectEl(['Init', ...Object.keys(SYNTH_PRESETS)], t.inst.preset, v => { Object.assign(t.inst, SYNTH_DEFAULT, SYNTH_PRESETS[v] || {}, { preset: v }); inst.update(); ui.detail(); markDirty(); }, 'Preset'));
    const tip = document.createElement('span'); tip.className = 'muted'; tip.textContent = 'Play it from your computer keyboard: A W S E D F T G Y H U J K. Z and X change octave.'; top.appendChild(tip);
    body.appendChild(top);
    const W = ['sine', 'triangle', 'sawtooth', 'square'];
    const defs = [{ group: 'Oscillators' }, SEL('wave1', 'Osc 1', W), SEL('wave2', 'Osc 2', W), K('oct2', 'Osc 2 oct', -2, 2, { step: 1, fmt: v => (v > 0 ? '+' : '') + v }), K('detune', 'Detune', 0, 50, { fmt: v => v.toFixed(0) + 'c' }), K('mix2', 'Osc 2 level', 0, 1, { fmt: fPct }), K('sub', 'Sub', 0, 1, { fmt: fPct }), K('noise', 'Noise', 0, 0.5, { fmt: fPct }),
      { group: 'Filter' }, SEL('ftype', 'Type', ['lowpass', 'highpass', 'bandpass']), K('cutoff', 'Cutoff', 40, 16000, { scale: 'log', fmt: fHz }), K('res', 'Reso', 0.3, 20, { fmt: v => v.toFixed(1) }), K('fenv', 'Env amt', 0, 8000, { fmt: fHz }), K('fA', 'F attack', 0.001, 3, { scale: 'log', fmt: fS }), K('fD', 'F decay', 0.01, 4, { scale: 'log', fmt: fS }),
      { group: 'Amp' }, K('A', 'Attack', 0.001, 4, { scale: 'log', fmt: fS }), K('D', 'Decay', 0.01, 4, { scale: 'log', fmt: fS }), K('Sus', 'Sustain', 0, 1, { fmt: fPct }), K('R', 'Release', 0.01, 6, { scale: 'log', fmt: fS }), K('gain', 'Volume', 0, 1, { fmt: fPct }),
      { group: 'Motion' }, TOG('mono', 'Mono'), K('glide', 'Glide', 0, 0.5, { fmt: fS }), K('lfoRate', 'LFO rate', 0.05, 20, { scale: 'log', fmt: v => v.toFixed(2) + 'Hz' }), K('lfoAmt', 'LFO > cutoff', 0, 2400, { fmt: v => Math.round(v) + 'c' })];
    body.appendChild(paramGrid(defs, t.inst, () => { t.inst.preset = t.inst.preset; inst.update(); markDirty(); }));
    return c;
  }
  if (t.inst.type === 'drums') {
    const c = cardShell('Kit', 'Drum rack', { wide: true }); const body = $('.cb', c);
    const grid = document.createElement('div'); grid.className = 'kit';
    t.inst.pads.forEach((pad, pi) => {
      const cell = document.createElement('div'); cell.className = 'kpad'; cell.style.setProperty('--tc', t.color);
      cell.innerHTML = `<button class="padhit" data-pad="${t.id}:${pi}" aria-label="Play ${esc(pad.kind)}"><b>${pi + 1}</b><span>${esc(pad.sampleId ? (SAMPLES.get(pad.sampleId) || {}).name || 'Sample' : pad.kind)}</span></button><div class="kctl"></div>`;
      $('.padhit', cell).onpointerdown = () => { if (ctx.state !== 'running') ctx.resume(); inst.noteOn(pi, ctx.currentTime, 0.9); };
      const ctl = $('.kctl', cell);
      ctl.appendChild(selectEl(DRUM_KINDS, pad.kind, v => { pad.kind = v; pad.sampleId = null; ui.detail(); markDirty(); }, 'Sound'));
      [['tune', 'Tune', -24, 24, v => (v > 0 ? '+' : '') + v.toFixed(1)], ['decay', 'Decay', 0.2, 3, v => v.toFixed(2) + 'x'], ['level', 'Level', 0, 1.2, fPct], ['pan', 'Pan', -1, 1, v => Math.abs(v) < 0.01 ? 'C' : Math.round(Math.abs(v) * 50) + (v < 0 ? 'L' : 'R')]].forEach(([k, l, a, b, f]) => ctl.appendChild(knob({ label: l, value: pad[k], min: a, max: b, fmt: f, small: true, onInput: v => (pad[k] = v) })));
      const ld = document.createElement('button'); ld.className = 'btn ghostb tiny'; ld.textContent = 'Load sample'; ld.onclick = () => pickSample(async id => { pad.sampleId = id; ui.detail(); markDirty(); }); ctl.appendChild(ld);
      cell.addEventListener('dragover', e => e.preventDefault()); cell.addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) loadSampleFile(f).then(id => { if (id) { pad.sampleId = id; ui.detail(); } }); });
      grid.appendChild(cell);
    });
    body.appendChild(grid); return c;
  }
  return samplerCard(t, inst);
}

/* --- Sampler card --- */
function samplerCard(t, inst) {
  const p = t.inst, s = SAMPLES.get(p.sampleId);
  const c = cardShell('Cutline', 'Sampler', { wide: true }); c.classList.add('smp'); const body = $('.cb', c);
  const songKey = keyLabel(S.root, S.scale === 'major' ? 'major' : 'minor');
  const shifted = s ? keyLabel(s.key.root + p.semis, s.key.mode) : '-';
  body.innerHTML = `<div class="smptop">
      <div class="smpname"><b>${s ? esc(s.name) : 'No sample loaded'}</b><span class="muted">${s ? `${s.buf.duration.toFixed(2)} s · ${s.buf.numberOfChannels === 2 ? 'stereo' : 'mono'} · ${Math.round(s.buf.sampleRate / 100) / 10} kHz` : 'Load a file or drop audio here'}</span></div>
      <button class="btn" data-sa="load">Load sample</button>
      <div class="chip"><span>Detected key</span><b>${s ? keyLabel(s.key.root, s.key.mode) : '-'}</b></div>
      <div class="chip"><span>Playing in</span><b class="acc">${shifted}</b></div>
      <div class="keyshift"><button data-sa="k-">−</button><span>${p.semis > 0 ? '+' : ''}${p.semis} st</span><button data-sa="k+">+</button><button class="btn ghostb tiny" data-sa="match" title="Shift to the song key (${songKey})">Match ${songKey}</button></div>
      <div class="chip"><span>Sample BPM</span><input id="srcBpm" type="number" min="40" max="240" step="0.1" value="${p.srcBpm || ''}" aria-label="Sample tempo"></div>
    </div>
    <div class="wave"><canvas aria-label="Waveform with cue points. Drag a cue to move it."></canvas><div id="busy" class="busy" hidden>Processing…</div></div>
    <div class="smpbot"><div class="pads"></div><div class="smpctl"></div></div>`;
  const ctl = $('.smpctl', body);
  const row1 = document.createElement('div'); row1.className = 'row';
  row1.appendChild(toggleEl('Sync to song tempo', p.sync, v => { p.sync = v; inst.prepare(); markDirty(); }));
  row1.appendChild(selectEl([[1, 'Stretch: keep pitch'], [0, 'Speed: vinyl style']], p.stretch ? 1 : 0, v => { p.stretch = !!v; inst.prepare(); markDirty(); }, 'Time mode'));
  [['find', 'Find 16 cues'], ['even8', 'Even 8'], ['even16', 'Even 16'], ['pclip', 'Make clip from cues']].forEach(([k, l]) => { const b = document.createElement('button'); b.className = 'btn ghostb'; b.dataset.sa = k; b.textContent = l; row1.appendChild(b); });
  ctl.appendChild(row1);
  const row2 = document.createElement('div'); row2.className = 'row';
  row2.appendChild(selectEl([['pads', 'Pads: one cue per pad'], ['keys', 'Keys: play a cue chromatically']], p.mode, v => { p.mode = v; ui.detail(); markDirty(); }, 'Play mode'));
  if (p.mode === 'keys') row2.appendChild(selectEl(p.cues.map((_, i) => [i, 'Cue ' + (i + 1)]), p.keyCue, v => { p.keyCue = v; markDirty(); }, 'Cue for keys'));
  row2.appendChild(selectEl([['cue', 'Play to next cue'], ['gate', 'Play while held'], ['full', 'Play to end']], p.oneShot, v => { p.oneShot = v; markDirty(); }, 'Playback'));
  row2.appendChild(toggleEl('Choke', p.choke, v => { p.choke = v; }));
  ctl.appendChild(row2);
  ctl.appendChild(paramGrid([K('gain', 'Volume', 0, 1.5, { fmt: fPct }), K('attack', 'Attack', 0.001, 0.5, { scale: 'log', fmt: fMs }), K('release', 'Release', 0.002, 1, { scale: 'log', fmt: fMs }), K('filter', 'Filter', -1, 1, { fmt: v => Math.abs(v) < 0.02 ? 'Off' : v < 0 ? 'LP ' + Math.round(-v * 100) : 'HP ' + Math.round(v * 100) })], p, () => { inst.update(); markDirty(); }));
  // pads
  const pads = $('.pads', body);
  for (let i = 0; i < Math.min(64, Math.max(16, p.cues.length)); i++) {
    const b = document.createElement('button'); b.className = 'spad' + (p.cues[i] == null ? ' none' : ''); b.dataset.pad = t.id + ':' + i; b.style.setProperty('--pc', EQ_COLORS[i % 8]);
    b.innerHTML = `<b>${i + 1}</b><span>${p.cues[i] != null ? p.cues[i].toFixed(2) + 's' : ''}</span>`; b.setAttribute('aria-label', 'Cue ' + (i + 1));
    b.onpointerdown = () => { if (ctx.state !== 'running') ctx.resume(); const v = inst.noteOn(p.mode === 'keys' ? 60 : i, ctx.currentTime, 0.9, null); const up = () => { inst.noteOff(v, ctx.currentTime); window.removeEventListener('pointerup', up); }; window.addEventListener('pointerup', up); };
    pads.appendChild(b);
  }
  // actions
  body.addEventListener('click', e => {
    const a = e.target.closest('[data-sa]'); if (!a) return; const k = a.dataset.sa;
    if (k === 'load') return pickSample(id => setSamplerSample(t, id));
    if (!s) return toast('Load a sample first');
    if (k === 'k-' || k === 'k+') { p.semis = clamp(p.semis + (k === 'k+' ? 1 : -1), -12, 12); inst.prepare(); ui.detail(); markDirty(); }
    if (k === 'match') { let d = ((S.root - s.key.root) % 12 + 12) % 12; if (d > 6) d -= 12; if (S.scale !== s.key.mode && !(S.scale !== 'major' && s.key.mode === 'minor')) { const rel = s.key.mode === 'minor' ? 3 : -3; d = (((S.root - s.key.root - rel) % 12) + 12) % 12; if (d > 6) d -= 12; } p.semis = d; inst.prepare(); ui.detail(); markDirty(); toast('Shifted ' + (d > 0 ? '+' : '') + d + ' semitones to sit in ' + songKey); }
    if (k === 'find') { p.cues = findCues(s.env, s.buf.sampleRate, 512, 16, s.buf.duration); ui.detail(); markDirty(); }
    if (k === 'even8' || k === 'even16') { const n = k === 'even8' ? 8 : 16; p.cues = Array.from({ length: n }, (_, i) => i * s.buf.duration / n); ui.detail(); markDirty(); }
    if (k === 'pclip') makeCueClip(t);
  });
  $('#srcBpm', body).onchange = e => { p.srcBpm = clamp(+e.target.value || s.bpm, 40, 240); inst.prepare(); markDirty(); };
  c.addEventListener('dragover', e => e.preventDefault());
  c.addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) loadSampleFile(f).then(id => id && setSamplerSample(t, id)); });
  // waveform
  const cv = $('.wave canvas', body); let dragCue = -1;
  const cx = (x, w) => s ? x / w * s.buf.duration : 0;
  cv.addEventListener('pointerdown', e => {
    if (!s) return; const rc = cv.getBoundingClientRect(), x = e.clientX - rc.left, w = rc.width;
    dragCue = p.cues.findIndex(c => Math.abs(c / s.buf.duration * w - x) < 7);
    if (dragCue >= 0) { cv.setPointerCapture(e.pointerId); return; }
    if (e.detail === 2 && p.cues.length < 16) { p.cues.push(cx(x, w)); p.cues.sort((a, b) => a - b); ui.detail(); markDirty(); return; }
    // audition from this point
    if (ctx.state !== 'running') ctx.resume(); const src = ctx.createBufferSource(); src.buffer = s.buf; src.connect(inst.lp); src.start(0, cx(x, w)); src.stop(ctx.currentTime + 1.2);
  });
  cv.addEventListener('pointermove', e => { if (dragCue < 0) return; const rc = cv.getBoundingClientRect(); p.cues[dragCue] = clamp(cx(e.clientX - rc.left, rc.width), 0, s.buf.duration - 0.01); });
  cv.addEventListener('pointerup', () => { if (dragCue >= 0) { dragCue = -1; ui.detail(); markDirty(); } });
  VIS.add(() => {
    if (!cv.isConnected) return false; const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight; if (!w) return;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const css = getComputedStyle(document.documentElement);
    if (!s) { g.fillStyle = css.getPropertyValue('--dim'); g.font = '12px ' + css.getPropertyValue('--ui'); g.fillText('Drop an audio file here', 12, h / 2); return; }
    const pk = s.peaks, n = pk.length;
    p.cues.forEach((cu, i) => { const r = inst.cueRange(i); if (!r) return; g.fillStyle = EQ_COLORS[i % 8] + '1f'; g.fillRect(r[0] / s.buf.duration * w, 0, (r[1] - r[0]) / s.buf.duration * w, h); });
    g.fillStyle = t.color; for (let i = 0; i < n; i++) { const x = i / n * w, a = pk[i] * (h / 2 - 6); g.fillRect(x, h / 2 - a, Math.max(1, w / n), a * 2 || 1); }
    p.cues.forEach((cu, i) => { const x = cu / s.buf.duration * w; g.fillStyle = EQ_COLORS[i % 8]; g.fillRect(x - 1, 0, 2, h); g.fillRect(x - 1, 0, 16, 13); g.fillStyle = '#16141a'; g.font = 'bold 9px ' + css.getPropertyValue('--mono'); g.fillText(i + 1, x + 2, 10); });
    // playheads of sounding voices
    g.fillStyle = css.getPropertyValue('--fg');
    inst.voices.forEach(v => { if (!v.src.buffer || !inst.proc) return; const r = inst.cueRange(v.cue); if (!r) return; const el = ctx.currentTime - v.t0; if (el < 0) return; const pos = r[0] + el * v.src.playbackRate.value / inst.stretchR; if (pos < r[1]) g.fillRect(pos / s.buf.duration * w, 0, 1.5, h); });
  });
  return c;
}
function makeCueClip(t) {
  pushUndo('Clip from cues'); const n = Math.min(16, t.inst.cues.length), a = Math.floor(V.insert / SPB()) * SPB();
  const c = newMidiClip(a, 32, 'Cue run'); c.bars = 2; c.notes = Array.from({ length: n }, (_, i) => ({ p: i, s: i * 2, l: 2, v: 0.85, c: 1 }));
  clearRange(t, a, a + 32); t.clips.push(c); openClip(c); toast('Made a 2-bar clip at the insert marker that walks through the cues');
}
function setSamplerSample(t, id) {
  pushUndo('Load sample'); const s = SAMPLES.get(id); t.inst.sampleId = id; t.inst.srcBpm = s.bpm; t.inst.semis = 0;
  t.inst.cues = findCues(s.env, s.buf.sampleRate, 512, 16, s.buf.duration);
  RT.get(t.id).inst.prepare(true); ui.detail(); markDirty();
  toast(`${s.name}: ${keyLabel(s.key.root, s.key.mode)}, ${s.bpm} BPM, 16 cues found`);
}
async function pickSample(cb) { const fs = await pickFile('audio', 'audio/*'); if (!fs.length) return; const id = await loadAudioFile(fs[0]); if (id) cb(id); }
async function loadSampleFile(file) { return loadAudioFile({ name: file.name, path: IS_DESKTOP && file.path ? file.path : null, data: await file.arrayBuffer() }); }
