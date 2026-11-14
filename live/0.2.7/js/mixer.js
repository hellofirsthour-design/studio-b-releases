/* ============ Mixer view: full channel strips for mixing and mastering ============ */
const DB_MARKS = [6, 0, -6, -12, -18, -24, -36, -48, -60];
const faderForDb = db => gainToFader(dbToGain(db));
const mixer = {
  peaks: new Map(), // id -> {max dB since reset}
  render() {
    const box = $('#mixer'); if (!box || box.hidden) return;
    const strips = [...S.tracks.map(b => [b, 'track']), ['gap'], ...S.returns.map(b => [b, 'return']), ['gap'], [S.master, 'master']];
    box.innerHTML = `<div class="mxstrips">${strips.map(([b, kind]) => b === 'gap' ? '<div class="mxgap"></div>' : this.strip(b, kind)).join('')}</div>`;
    $$('.mxs', box).forEach(el => this.bindStrip(el));
  },
  strip(b, kind) {
    const isT = kind === 'track', num = isT ? S.tracks.indexOf(b) + 1 : kind === 'return' ? 'AB'[S.returns.indexOf(b)] || 'R' : 'M', sel = V.selTracks.has(b.id);
    const devs = b.devices.map((d, i) => `<button class="mxdev ${d.on ? '' : 'off'}" data-dev="${i}" title="Click to open. Alt-click turns it on or off."><i></i>${esc(d.type === 'plugin' ? d.p.name : DEVICES[d.type].name)}</button>`).join('');
    const io = isT ? (b.kind === 'audio' ? `<div class="mxio"><span class="seg mon">${['in', 'auto', 'off'].map(m => `<button data-mon="${m}" class="${b.monitor === m ? 'on' : ''}">${m === 'in' ? 'In' : m === 'auto' ? 'Auto' : 'Off'}</button>`).join('')}</span></div>` : `<div class="mxio muted">${{ synth: 'Contour', drums: 'Kit', sampler: 'Cutline' }[b.inst.type]}</div>`) : `<div class="mxio muted">${kind === 'master' ? 'Main output' : 'Return'}</div>`;
    const scale = DB_MARKS.map(d => `<span style="bottom:${faderForDb(d) * 100}%">${d > 0 ? '+' + d : d}</span>`).join('');
    const loud = kind === 'master' ? `<div class="mxloud" title="Loudness (ITU-R BS.1770)"><div><span>Momentary</span><b data-l="m">–</b></div><div><span>Short-term</span><b data-l="s">–</b></div><div><span>Integrated</span><b data-l="i">–</b></div><div><span>Peak</span><b data-l="p">–</b></div><button class="btn ghostb tiny" data-act="lreset">Reset</button></div>` : '';
    return `<div class="mxs ${kind} ${sel ? 'sel' : ''}" data-id="${b.id}" style="--tc:${b.color || '#a7a3b8'}">
      <div class="mxname" title="Double-click to rename"><i></i><span>${esc(b.name)}</span></div>
      ${io}
      <div class="mxdevs">${devs}<button class="mxdev add" data-act="adddev">+ Effect</button></div>
      <div class="mxknobs">${isT ? '<span data-k="sendA"></span><span data-k="sendB"></span>' : ''}${kind !== 'master' ? '<span data-k="pan"></span>' : ''}</div>
      ${loud}
      <div class="mxfader">
        <div class="mxscale">${scale}</div>
        <input type="range" class="mxvol" min="0" max="1" step="0.001" value="${b.vol}" aria-label="${esc(b.name)} volume">
        <div class="mxmeter" data-mm="${b.id}"><div class="mxch"><i class="lvl"></i><i class="pk"></i></div><div class="mxch"><i class="lvl"></i><i class="pk"></i></div><b class="mxclip"></b></div>
      </div>
      <div class="mxread"><input class="mxdb" value="${faderDb(b.vol)}" aria-label="Volume in dB"><button class="mxpeak" data-pk="${b.id}" title="Highest peak. Click to reset.">-inf</button></div>
      <div class="mxbtns">${kind !== 'master' ? `<button class="hb act ${b.mute ? '' : 'on'}" data-act="mute">${num}</button>` : ''}${isT ? `<button class="hb solo ${b.solo ? 'on' : ''}" data-act="solo">S</button><button class="hb arm ${b.arm ? 'on' : ''}" data-act="arm">●</button>` : ''}</div>
    </div>`;
  },
  bindStrip(el) {
    const b = busById(el.dataset.id);
    $$('[data-k]', el).forEach(slot => { const k = slot.dataset.k; slot.appendChild(knob({ label: k === 'pan' ? 'Pan' : k === 'sendA' ? 'Send A' : 'Send B', value: b[k], min: k === 'pan' ? -1 : 0, max: 1, def: 0, small: true, fmt: k === 'pan' ? v => Math.abs(v) < 0.01 ? 'C' : Math.round(Math.abs(v) * 50) + (v < 0 ? 'L' : 'R') : v => v < 0.005 ? '-inf' : gainToDb(v).toFixed(1), onInput: v => { b[k] = v; applyMix(b); markDirty(); } })); });
    const vol = $('.mxvol', el), dbIn = $('.mxdb', el);
    vol.oninput = () => { b.vol = +vol.value; applyMix(b); dbIn.value = faderDb(b.vol); markDirty(); };
    vol.ondblclick = () => { b.vol = 0.79; vol.value = b.vol; applyMix(b); dbIn.value = faderDb(b.vol); };
    vol.onchange = () => ui.headers();
    dbIn.onchange = () => { const d = parseFloat(dbIn.value); b.vol = isFinite(d) ? clamp(faderForDb(clamp(d, -70, 4)), 0, 1) : 0; vol.value = b.vol; applyMix(b); dbIn.value = faderDb(b.vol); ui.headers(); markDirty(); };
    dbIn.onkeydown = e => e.stopPropagation();
    el.addEventListener('click', async e => {
      const a = e.target.closest('[data-act],[data-mon],[data-dev],[data-pk]');
      if (!a) { V.selTracks = new Set([b.id]); $$('.mxs').forEach(x => x.classList.toggle('sel', x === el)); ui.detail(); return; }
      if (a.dataset.pk) { this.peaks.delete(b.id); METER.forEach(m => (m.clip = false)); return; }
      if (a.dataset.mon) { b.monitor = a.dataset.mon; applyMix(b); this.render(); ui.headers(); return; }
      if (a.dataset.dev) { const d = b.devices[+a.dataset.dev]; if (e.altKey) { d.on = !d.on; rewire(b); this.render(); markDirty(); return; } V.selTracks = new Set([b.id]); V.detail = 'devices'; ui.detail(); this.render(); return; }
      const act = a.dataset.act;
      if (act === 'mute') b.mute = !b.mute;
      if (act === 'solo') { if (!(e.ctrlKey || e.metaKey) && !b.solo) S.tracks.forEach(t => (t.solo = false)); b.solo = !b.solo; }
      if (act === 'arm') { const on = !b.arm; if (!(e.ctrlKey || e.metaKey)) S.tracks.forEach(t => { if (t !== b && t.arm) { t.arm = false; applyMix(t); } }); await armTrack(b, on); }
      if (act === 'lreset') { if (M.loud) M.loud.port.postMessage({ reset: true }); M.loudData = null; this.peaks.clear(); return; }
      if (act === 'adddev') return popMenu(e, Object.entries(DEVICES).filter(([, v]) => !v.hidden).map(([k, v]) => ({ label: `${v.name}  ·  ${v.blurb}`, run: () => { pushUndo('Add device'); b.devices.push(newDevice(k)); rewire(b); V.selTracks = new Set([b.id]); V.detail = 'devices'; ui.detail(); this.render(); } })));
      applyAllMix(); markDirty(); this.render(); ui.headers();
    });
    $('.mxname', el).ondblclick = () => askText('Name', b.name, v => { pushUndo('Rename'); b.name = v; this.render(); ui.headers(); });
    el.addEventListener('contextmenu', e => { if (!S.tracks.includes(b)) return; e.preventDefault(); popMenu(e, [{ label: 'Duplicate track', run: () => { duplicateTrack(b); this.render(); } }, { colors: c => { pushUndo(); b.color = c; ui.all(); this.render(); } }, '-', { label: 'Delete track', danger: true, run: () => { deleteTrack(b); this.render(); } }]); });
  },
  // called every animation frame while the mixer is visible
  frame(now) {
    const box = $('#mixer'); if (!box || box.hidden) return;
    allBuses().forEach(b => {
      const r = b === S.master ? M : RT.get(b.id); const el = box.querySelector(`[data-mm="${b.id}"]`); if (!r || !el || !r.anL) return;
      const chans = el.querySelectorAll('.mxch'); const L = meter(b.id + ':L', chans[0], r.anL, now), R = meter(b.id + ':R', chans[1], r.anR, now);
      el.querySelector('.mxclip').classList.toggle('on', L.clip || R.clip);
      const peakDb = Math.max(L.lastDb, R.lastDb), cur = this.peaks.get(b.id); if (peakDb > -90 && (cur == null || peakDb > cur)) this.peaks.set(b.id, peakDb);
      const pk = box.querySelector(`[data-pk="${b.id}"]`), v = this.peaks.get(b.id); if (pk) { pk.textContent = v == null ? '-inf' : v.toFixed(1); pk.classList.toggle('hot', v != null && v > -0.3); }
      if (T.playing && b.auto.vol && b.auto.vol.length) { const f = box.querySelector(`.mxs[data-id="${b.id}"] .mxvol`); if (f && document.activeElement !== f) f.value = autoValue(b.auto.vol, nowPos()); }
    });
    const ld = M.loudData; if (ld) { const f = v => (isFinite(v) ? v.toFixed(1) : '–'); const q = k => box.querySelector(`[data-l="${k}"]`); if (q('m')) { q('m').textContent = f(ld.m); q('s').textContent = f(ld.s); q('i').textContent = f(ld.i); q('p').textContent = ld.peak > 0 ? gainToDb(ld.peak).toFixed(1) : '–'; q('p').classList.toggle('hot', ld.peak >= 0.989); } }
  },
};
function setView(v) {
  V.view = v; $('#mixer').hidden = v !== 'mix'; $('#arr').hidden = v === 'mix'; $('#viewBtn').classList.toggle('on', v === 'mix'); $('#viewBtn').textContent = v === 'mix' ? 'Arrangement' : 'Mixer';
  if (v === 'mix') mixer.render(); else { ui.headers(); arr.draw(); }
}
