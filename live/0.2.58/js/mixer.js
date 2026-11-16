/* ============ Mixer view: full channel strips for mixing and mastering ============ */
const DB_MARKS = [4, 0, -6, -12, -18, -24, -36, -48, -60];
const faderForDb = db => gainToFader(dbToGain(db));
const mixer = {
  peaks: new Map(), // id -> {max dB since reset}
  render() {
    const box = $('#mixer'); if (!box || box.hidden) return;
    const strips = [...S.tracks.map(b => [b, 'track']), ['gap'], ...S.returns.map(b => [b, 'return']), ...((S.vcas || []).length ? [['gap'], ...S.vcas.map(v => [v, 'vca'])] : []), ['gap'], [S.master, 'master']];
    const v = this.view(), tg = (k, l, t) => `<button class="mxvt ${v[k] ? 'on' : ''}" data-vt="${k}" title="${t}">${l}</button>`;
    box.innerHTML = `<div class="mxbar"><span class="lab">View</span>${tg('ins', 'Inserts', 'Show the insert slots (effects on each channel)')}${tg('snd', 'Sends', 'Show the send slots, one per return')}${tg('io', 'I/O', 'Show input, output, monitoring and track delay')}${tg('narrow', 'Narrow', 'Narrow channel strips, to see more at once')}${(S.mixGroups || []).length ? `<span class="lab mgl">Groups</span>${S.mixGroups.map(g => `<button class="mgpill ${g.on === false ? '' : 'on'}" data-mgp="${g.id}" style="--gc:${g.color}" title="Mix group ${esc(g.name)}: click to ${g.on === false ? 'resume' : 'suspend'} it, right-click for more">${esc(g.name)}</button>`).join('')}` : ''}<span class="faint">Tab: Arrangement / Mixer · Ctrl-click strips to select several · hold Ctrl to move one grouped fader alone</span></div>`
      + `<div class="mxstrips ${v.narrow ? 'narrow' : ''}">${strips.map(([b, kind]) => b === 'gap' ? '<div class="mxgap"></div>' : (kind === 'vca' ? this.vcaStrip(b) : this.strip(b, kind))).join('')}</div>`;
    $$('[data-vt]', box).forEach(x => x.onclick = () => { const vv = this.view(); vv[x.dataset.vt] = !vv[x.dataset.vt]; lsSet('sb-mxview', JSON.stringify(vv)); this.render(); });
    $$('.mxs', box).forEach(el => (el.dataset.vca ? this.bindVca(el) : this.bindStrip(el)));
    this.fit(); requestAnimationFrame(() => this.fit());
    $$('[data-mgp]', box).forEach(x => { const g = (S.mixGroups || []).find(q => q.id === x.dataset.mgp); if (!g) return;
      x.onclick = () => { g.on = g.on === false; markDirty(); this.render(); };
      x.oncontextmenu = e => { e.preventDefault(); popMenu(e, [{ label: g.on === false ? 'Resume group' : 'Suspend group', run: () => { g.on = g.on === false; markDirty(); this.render(); } }, { label: 'Rename…', run: () => askText('Mix group name', g.name, n => { pushUndo('Rename'); g.name = n; markDirty(); this.render(); }) }, { colors: c => { pushUndo(); g.color = c; markDirty(); this.render(); } }, '-',
        { label: 'Delete group (channels stay as they are)', danger: true, run: () => { pushUndo('Delete mix group'); allBuses().forEach(b => { if (b.mg === g.id) delete b.mg; }); S.mixGroups = S.mixGroups.filter(q => q !== g); markDirty(); this.render(); } }]); }; });
  },
  view() { let v = null; try { v = JSON.parse(lsGet('sb-mxview') || 'null'); } catch (e) { } return Object.assign({ ins: true, snd: true, io: true, narrow: false }, v || {}); },
  // Pro Tools-style slots: inserts A-J (the track's effects in order, empty slots to add one) and sends A-J (one per return,
  // each with its own small fader and pre/post-fader switch)
  slots(b, kind) {
    const v = this.view(), L = 'ABCDEFGHIJ', isT = kind === 'track'; let h = '';
    if (v.ins) {
      const n = clamp(Math.max(5, b.devices.length + 1), 5, 10);
      const inst = isT && b.kind === 'midi' ? `<button class="mxins inst" data-inst="1" title="Instrument: click to open"><i></i>${esc(b.inst.type === 'plugin' ? b.inst.name || 'Plug-in' : (soundOf(b) || {}).name || INST_NAMES[b.inst.type] || 'Instrument')}</button>` : '';
      h += `<div class="mxsec"><div class="mxsl">Inserts</div>${inst}${[...Array(n)].map((_, i) => { const d = b.devices[i];
        return d ? `<button class="mxins ${d.on ? '' : 'off'}" data-slot="${i}" title="${L[i]}: click to open, Alt-click to bypass, right-click for more"><b>${L[i]}</b><i></i>${esc(d.type === 'plugin' ? d.p.name : DEVICES[d.type].name)}</button>`
          : `<button class="mxins empty" data-slot="${i}" title="${L[i]}: click to add an effect"><b>${L[i]}</b></button>`; }).join('')}</div>`;
    }
    if (v.snd && isT) {
      h += `<div class="mxsec"><div class="mxsl">Sends</div>${S.returns.slice(0, 10).map((r, i) => { const g = sendOf(b, i), pre = sendPre(b, i);
        return `<div class="mxsnd" data-si="${i}" title="Send ${L[i]} to ${esc(r.name)}: drag the bar, double-click for 0 dB. P = before the fader."><b>${L[i]}</b><span class="sn">${esc(r.name)}</span><span class="sbr" data-map="${b.id}|${sendKey(i)}"><i style="width:${Math.round(g * 100)}%"></i></span><button class="pp ${pre ? 'on' : ''}" data-pre="${i}" aria-label="Pre-fader">P</button></div>`; }).join('')}${S.returns.length < 10 ? '<button class="mxins empty" data-act="newret" title="Add a return track to send to"><b>+</b>Return</button>' : ''}</div>`;
    }
    return h;
  },
  strip(b, kind) {
    const isT = kind === 'track', num = isT ? S.tracks.indexOf(b) + 1 : kind === 'return' ? RET_LETTERS[S.returns.indexOf(b)] || 'R' : 'M', sel = V.selTracks.has(b.id);
    const devs = b.devices.map((d, i) => `<button class="mxdev ${d.on ? '' : 'off'}" data-dev="${i}" title="Click to open. Alt-click turns it on or off."><i></i>${esc(d.type === 'plugin' ? d.p.name : DEVICES[d.type].name)}</button>`).join('');
    const io = isT && b.kind === 'group' ? `<div class="mxio muted">Group · ${descendants(b).length} tracks</div>` : isT ? (b.kind === 'audio' ? `<div class="mxio"><span class="seg mon">${['in', 'auto', 'off'].map(m => `<button data-mon="${m}" class="${b.monitor === m ? 'on' : ''}">${m === 'in' ? 'In' : m === 'auto' ? 'Auto' : 'Off'}</button>`).join('')}</span></div>` : `<div class="mxio muted">${{ synth: 'Contour', drums: 'Kit', sampler: 'Cutline' }[b.inst.type]}</div>`) : `<div class="mxio muted">${kind === 'master' ? 'Main output' : 'Return'}</div>`;
    const scale = DB_MARKS.map(d => `<span style="bottom:calc(var(--cap, 0px) / 2 + ${faderForDb(d).toFixed(4)} * (100% - var(--cap, 0px)))">${d > 0 ? '+' + d : d}</span>`).join('');
    const loud = kind === 'master' ? `<div class="mxloud" title="Loudness (ITU-R BS.1770)"><div><span>Momentary</span><b data-l="m">–</b></div><div><span>Short-term</span><b data-l="s">–</b></div><div><span>Integrated</span><b data-l="i">–</b></div><div><span>Peak</span><b data-l="p">–</b></div><button class="btn ghostb tiny" data-act="lreset">Reset</button></div>` : '';
    return `<div class="mxs ${kind} ${sel ? 'sel' : ''}" data-id="${b.id}" style="--tc:${b.color || '#a7a3b8'}">
      <div class="mxnum"><i></i>${num}</div>
      ${this.slots(b, kind)}
      ${this.view().io ? io : ''}
      ${this.view().io && isT ? `<div class="mxrow">${b.kind === 'audio' ? `<button class="btn ghostb tiny" data-act="input" title="Where this track records from">${b.input === 'resample' ? 'In: Main' : String(b.input || '').startsWith('track:') ? 'In: ' + esc((busById(b.input.slice(6)) || {}).name || 'track') : 'In: ' + esc(inLabel(b))}</button>` : ''}<button class="btn ghostb tiny" data-act="output" title="Where this track plays to">Out: ${esc(outLabel(b))}</button><label class="mxdly" title="Track delay in milliseconds (negative plays earlier)"><span>Delay</span><input type="number" step="1" min="-500" max="500" value="${b.delayMs || 0}" data-act="delay"></label></div>` : kind === 'return' ? `<div class="mxrow"><button class="btn ghostb tiny ${b.pre ? 'on' : ''}" data-act="pre">${b.pre ? 'Pre fader' : 'Post fader'}</button><button class="btn ghostb tiny" data-act="output" title="Where this return plays to">Out: ${esc(outLabel(b))}</button></div>` : ''}
      <div class="mxauto">${autoModeBtn(b)}</div>
      ${kind !== 'master' ? '<div class="mxknobs"><span data-k="pan"></span></div>' : ''}
      ${loud}
      <div class="mxfader">
        <div class="mxscale">${scale}</div>
        <input type="range" class="mxvol" min="0" max="1" step="0.001" value="${b.vol}" aria-label="${esc(b.name)} volume">
        <div class="mxmeter" data-mm="${b.id}"><div class="mxch"><i class="lvl"></i><i class="pk"></i></div><div class="mxch"><i class="lvl"></i><i class="pk"></i></div><b class="mxclip"></b></div>
      </div>
      <div class="mxread"><input class="mxdb" value="${faderDb(b.vol)}" aria-label="Volume in dB"><button class="mxpeak" data-pk="${b.id}" title="Highest peak since you last clicked. Red means it went over 0 dB (clipping). Click to reset all clip lights.">-inf</button></div>
      <div class="mxbtns">${kind !== 'master' ? `<button class="hb act ${b.mute ? '' : 'on'}" data-act="mute">${num}</button>` : ''}${isT ? `<button class="hb solo ${b.solo ? 'on' : ''}" data-act="solo">S</button><button class="hb arm ${b.arm ? 'on' : ''}" data-act="arm">●</button>` : ''}</div>
      ${kind !== 'master' ? this.groupChips(b, kind) : ''}
      <div class="mxname" title="Double-click to rename"><i></i><span>${esc(b.name)}</span></div>
    </div>`;
  },
  groupChips(b, kind) {
    const g = mixGroupOf(b), v = vcaOf(b);
    return `<div class="mxgv"><button class="mgchip ${g ? 'on' : ''}" data-act="mg" style="${g ? '--gc:' + g.color : ''}" title="${g ? 'Mix group: ' + esc(g.name) + (g.on === false ? ' (suspended)' : '') : 'Mix group: none'}. Click to change.">${g ? esc(g.name) : 'Group'}</button>${kind === 'track' ? `<button class="mgchip ${v ? 'on' : ''}" data-act="vcaa" style="${v ? '--gc:' + v.color : ''}" title="${v ? 'VCA: ' + esc(v.name) : 'VCA: none'}. Click to change.">${v ? esc(v.name) : 'VCA'}</button>` : ''}</div>`;
  },
  // members for a new group or VCA: the selected channels, plus the one clicked
  pickMembers(b) { const ids = new Set([...V.selTracks, b.id]); return allBuses().filter(x => ids.has(x.id) && x !== S.master); },
  groupMenu(e, b) {
    const gs = S.mixGroups || [], cur = b.mg;
    popMenu(e, [{ label: (cur ? '    ' : '✓  ') + 'No group', run: () => { pushUndo('Mix group'); delete b.mg; markDirty(); this.render(); } },
      ...gs.map(g => ({ label: (cur === g.id ? '✓  ' : '    ') + g.name, run: () => { pushUndo('Mix group'); b.mg = g.id; markDirty(); this.render(); } })), '-',
      { label: `New mix group from ${this.pickMembers(b).length > 1 ? this.pickMembers(b).length + ' selected channels' : 'this channel'}…`, run: () => askText('Mix group name', 'Group ' + (gs.length + 1), name => {
        pushUndo('New mix group'); S.mixGroups = S.mixGroups || []; const g = { id: uid(), name, color: COLORS[(S.mixGroups.length * 3 + 1) % COLORS.length], on: true }; S.mixGroups.push(g); this.pickMembers(b).forEach(x => (x.mg = g.id)); markDirty(); this.render(); ui.headers(); }) }]);
  },
  vcaMenu(e, b) {
    const vs = S.vcas || [], cur = b.vca, re = () => { allBuses().forEach(applyMix); markDirty(); this.render(); ui.headers(); };
    popMenu(e, [{ label: (cur ? '    ' : '✓  ') + 'No VCA', run: () => { pushUndo('VCA'); delete b.vca; re(); } },
      ...vs.map(v => ({ label: (cur === v.id ? '✓  ' : '    ') + v.name, run: () => { pushUndo('VCA'); b.vca = v.id; re(); } })), '-',
      { label: `New VCA from ${this.pickMembers(b).length > 1 ? this.pickMembers(b).length + ' selected tracks' : 'this track'}…`, run: () => askText('VCA name', 'VCA ' + (vs.length + 1), name => {
        pushUndo('New VCA'); S.vcas = S.vcas || []; const v = { id: uid(), name, color: COLORS[(S.vcas.length * 3 + 5) % COLORS.length], vol: 0.79, mute: false, solo: false }; S.vcas.push(v); this.pickMembers(b).filter(x => S.tracks.includes(x)).forEach(x => (x.vca = v.id)); re(); }) }]);
  },
  // a VCA strip: fader, mute, solo and how many tracks it controls; no audio of its own
  vcaStrip(v) {
    const n = vcaMembers(v).length, scale = DB_MARKS.map(d => `<span style="bottom:calc(var(--cap, 0px) / 2 + ${faderForDb(d).toFixed(4)} * (100% - var(--cap, 0px)))">${d > 0 ? '+' + d : d}</span>`).join('');
    return `<div class="mxs vca" data-vca="${v.id}" style="--tc:${v.color}">
      <div class="mxnum"><i></i>VCA</div>
      <div class="mxio muted">${n} track${n === 1 ? '' : 's'}</div>
      <div class="mxfader vcaf"><div class="mxscale">${scale}</div><input type="range" class="mxvol" min="0" max="1" step="0.001" value="${v.vol}" aria-label="${esc(v.name)} VCA level"><div></div></div>
      <div class="mxread"><input class="mxdb" value="${faderDb(v.vol)}" aria-label="VCA level in dB"><span></span></div>
      <div class="mxbtns"><button class="hb act ${v.mute ? '' : 'on'}" data-act="mute" title="Mute every track on this VCA">V</button><button class="hb solo ${v.solo ? 'on' : ''}" data-act="solo" title="Solo every track on this VCA">S</button></div>
      <div class="mxname" title="Double-click to rename. Right-click for more."><i></i><span>${esc(v.name)}</span></div>
    </div>`;
  },
  bindVca(el) {
    const v = (S.vcas || []).find(x => x.id === el.dataset.vca); if (!v) return; const vol = $('.mxvol', el), dbIn = $('.mxdb', el);
    const apply = () => { vcaMembers(v).forEach(applyMix); dbIn.value = faderDb(v.vol); markDirty(); };
    vol.onpointerdown = () => pushUndo('VCA level'); vol.oninput = () => { v.vol = +vol.value; apply(); }; vol.ondblclick = () => { v.vol = 0.79; vol.value = v.vol; apply(); };
    dbIn.onkeydown = e => e.stopPropagation(); dbIn.onchange = () => { const d = parseFloat(dbIn.value); v.vol = isFinite(d) ? clamp(faderForDb(clamp(d, -70, 4)), 0, 1) : 0; vol.value = v.vol; apply(); };
    el.addEventListener('click', e => { const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'mute') v.mute = !v.mute;
      if (a.dataset.act === 'solo') { if (!(e.ctrlKey || e.metaKey) && !v.solo) { S.tracks.forEach(t => (t.solo = false)); (S.vcas || []).forEach(x => (x.solo = false)); } v.solo = !v.solo; }
      applyAllMix(); markDirty(); this.render(); ui.headers(); });
    $('.mxname', el).ondblclick = () => askText('VCA name', v.name, n => { pushUndo('Rename'); v.name = n; this.render(); });
    el.addEventListener('contextmenu', e => { e.preventDefault(); popMenu(e, [{ label: 'Rename…', run: () => askText('VCA name', v.name, n => { pushUndo('Rename'); v.name = n; this.render(); }) }, { colors: c => { pushUndo(); v.color = c; this.render(); } }, '-',
      { label: 'Delete VCA (tracks keep their own levels)', danger: true, run: () => { pushUndo('Delete VCA'); vcaMembers(v).forEach(b => delete b.vca); S.vcas = S.vcas.filter(x => x !== v); applyAllMix(); markDirty(); this.render(); ui.headers(); } }]); });
  },
  bindStrip(el) {
    const b = busById(el.dataset.id);
    $$('[data-k]', el).forEach(slot => { const k = slot.dataset.k, si = sendIndex(k); slot.appendChild(knob({ label: k === 'pan' ? 'Pan' : 'Send ' + RET_LETTERS[si], value: si >= 0 ? sendOf(b, si) : b[k], min: k === 'pan' ? -1 : 0, max: 1, def: 0, small: true, fmt: k === 'pan' ? v => Math.abs(v) < 0.01 ? 'C' : Math.round(Math.abs(v) * 50) + (v < 0 ? 'L' : 'R') : v => v < 0.005 ? '-inf' : gainToDb(v).toFixed(1), onInput: v => { if (si >= 0) setSend(b, si, v); else b[k] = v; applyMix(b); markDirty(); autoTouch(b, k, v); } })); slot.lastChild.dataset.map = b.id + '|' + k; });
    const dl = el.querySelector('[data-act=delay]'); if (dl) { dl.onkeydown = e => e.stopPropagation(); dl.onchange = () => { pushUndo('Track delay'); b.delayMs = clamp(+dl.value || 0, -500, 500); applyAllMix(); markDirty(); }; }
    const vol = $('.mxvol', el), dbIn = $('.mxdb', el); vol.dataset.map = b.id + '|vol'; $$('[data-act=mute],[data-act=solo],[data-act=arm]', el).forEach(x => (x.dataset.map = b.id + '|' + x.dataset.act)); vol.dataset.map = b.id + '|vol'; $$('[data-act=mute],[data-act=solo],[data-act=arm]', el).forEach(x => (x.dataset.map = b.id + '|' + x.dataset.act));
    vol.onpointerdown = () => pushUndo('Volume');
    vol.oninput = () => { const old = b.vol; b.vol = +vol.value; autoTouch(b, 'vol', b.vol); applyMix(b); linkVol(b, old); dbIn.value = faderDb(b.vol); markDirty(); };
    vol.ondblclick = () => { b.vol = 0.79; vol.value = b.vol; applyMix(b); dbIn.value = faderDb(b.vol); };
    vol.onchange = () => ui.headers();
    dbIn.onchange = () => { const old = b.vol, d = parseFloat(dbIn.value); b.vol = isFinite(d) ? clamp(faderForDb(clamp(d, -70, 4)), 0, 1) : 0; vol.value = b.vol; applyMix(b); linkVol(b, old); dbIn.value = faderDb(b.vol); ui.headers(); markDirty(); };
    dbIn.onkeydown = e => e.stopPropagation();
    el.addEventListener('click', async e => {
      const a = e.target.closest('[data-act],[data-mon],[data-dev],[data-pk],[data-slot],[data-inst],[data-pre]');
      if (!a && (e.ctrlKey || e.metaKey || e.shiftKey)) { const s2 = new Set(V.selTracks); s2.has(b.id) ? s2.delete(b.id) : s2.add(b.id); V.selTracks = s2; $$('.mxs').forEach(x => x.classList.toggle('sel', s2.has(x.dataset.id))); return; }
      if (!a) { V.selTracks = new Set([b.id]); $$('.mxs').forEach(x => x.classList.toggle('sel', x === el)); ui.detail(); return; }
      if (a.dataset.inst) { V.selTracks = new Set([b.id]); setDetailShown(true); V.detail = 'devices'; ui.detail(); this.render(); return; }
      if (a.dataset.slot != null) { const i = +a.dataset.slot, d = b.devices[i];
        if (!d) return popMenu(e, FX_FOLDERS.map(([f, ks]) => ({ label: f + '  ›', run: () => popMenu(e, ks.filter(k => DEVICES[k]).map(k => ({ label: DEVICES[k].name, run: () => { pushUndo('Add device'); b.devices.push(newDevice(k)); rewire(b); markDirty(); this.render(); if (V.selTracks.has(b.id)) ui.detail(); } }))) })));
        if (e.altKey) { pushUndo('Bypass'); d.on = !d.on; rewire(b); markDirty(); this.render(); return; }
        V.selTracks = new Set([b.id]); setDetailShown(true); V.detail = 'devices'; ui.detail(); this.render(); return; }
      if (a.dataset.pre != null) { const i = +a.dataset.pre; pushUndo('Send position'); b.sendPre = b.sendPre || []; b.sendPre[i] = !sendPre(b, i); rebuildAll(); markDirty(); this.render(); return; }
      if (a.dataset.pk) { clearClips(); return; }
      if (a.dataset.mon) { b.monitor = a.dataset.mon; applyMix(b); this.render(); ui.headers(); return; }
      if (a.dataset.dev) { const d = b.devices[+a.dataset.dev]; if (e.altKey) { d.on = !d.on; rewire(b); this.render(); markDirty(); return; } V.selTracks = new Set([b.id]); V.detail = 'devices'; ui.detail(); this.render(); return; }
      const act = a.dataset.act;
      if (act === 'mute') { b.mute = !b.mute; linkFlag(b, 'mute'); }
      if (act === 'solo') { if (!(e.ctrlKey || e.metaKey) && !b.solo) { S.tracks.forEach(t => (t.solo = false)); (S.vcas || []).forEach(v => (v.solo = false)); } b.solo = !b.solo; linkFlag(b, 'solo'); }
      if (act === 'mg') return this.groupMenu(e, b);
      if (act === 'vcaa') return this.vcaMenu(e, b);
      if (act === 'arm') { const on = !b.arm; if (!(e.ctrlKey || e.metaKey)) S.tracks.forEach(t => { if (t !== b && t.arm) { t.arm = false; applyMix(t); } }); await armTrack(b, on); }
      if (act === 'input') { V.selTracks = new Set([b.id]); return chooseInput(b); }
      if (act === 'output') return chooseOutput(b, e);
      if (act === 'pre') { pushUndo('Send position'); b.pre = !b.pre; rebuildAll(); this.render(); ui.headers(); return; }
      if (act === 'delay') return;
      if (act === 'lreset') { if (M.loud) M.loud.port.postMessage({ reset: true }); M.loudData = null; this.peaks.clear(); return; }
      if (act === 'amode') return autoModeMenu(e, b);
      if (act === 'newret') { cmd('newReturn'); this.render(); return; }
      if (act === 'adddev') return popMenu(e, Object.entries(DEVICES).filter(([, v]) => !v.hidden).map(([k, v]) => ({ label: `${v.name}  ·  ${v.blurb}`, run: () => { pushUndo('Add device'); b.devices.push(newDevice(k)); rewire(b); V.selTracks = new Set([b.id]); V.detail = 'devices'; ui.detail(); this.render(); } })));
      applyAllMix(); markDirty(); this.render(); ui.headers();
    });
    $$('.mxsnd', el).forEach(row => { const i = +row.dataset.si, bar = $('.sbr', row), fill = $('i', bar);
      const set = v => { v = clamp(v, 0, 1); setSend(b, i, v); applyMix(b); autoTouch(b, sendKey(i), v); fill.style.width = Math.round(v * 100) + '%'; bar.title = v < 0.005 ? '-inf dB' : gainToDb(v).toFixed(1) + ' dB'; markDirty(); };
      bar.onpointerdown = e => { e.preventDefault(); pushUndo('Send'); bar.setPointerCapture(e.pointerId); const r = bar.getBoundingClientRect(); set((e.clientX - r.left) / r.width); bar.onpointermove = ev => set((ev.clientX - r.left) / r.width); bar.onpointerup = () => { bar.onpointermove = null; ui.headers(); }; };
      bar.ondblclick = () => set(1); });
    $$('.mxins[data-slot]', el).forEach(x => x.addEventListener('contextmenu', e => { const i = +x.dataset.slot, d = b.devices[i]; if (!d) return; e.preventDefault(); e.stopPropagation();
      const move = k => { pushUndo('Move device'); const [m] = b.devices.splice(i, 1); b.devices.splice(i + k, 0, m); rewire(b); markDirty(); this.render(); if (V.selTracks.has(b.id)) ui.detail(); };
      popMenu(e, [{ label: d.on ? 'Bypass' : 'Turn on', run: () => { pushUndo('Bypass'); d.on = !d.on; rewire(b); markDirty(); this.render(); } }, ...(i > 0 ? [{ label: 'Move up', run: () => move(-1) }] : []), ...(i < b.devices.length - 1 ? [{ label: 'Move down', run: () => move(1) }] : []), '-',
        { label: 'Remove', danger: true, run: () => { pushUndo('Remove device'); const r = DEV_RT.get(d.id); b.devices.splice(i, 1); if (r && r.dispose) { r.dispose(); DEV_RT.delete(d.id); } rewire(b); markDirty(); this.render(); if (V.selTracks.has(b.id)) ui.detail(); } }]); }));
    $('.mxname', el).ondblclick = () => askText('Name', b.name, v => { pushUndo('Rename'); b.name = v; this.render(); ui.headers(); });
    el.addEventListener('contextmenu', e => { if (!S.tracks.includes(b)) return; e.preventDefault(); popMenu(e, [{ label: 'Duplicate track', run: () => { duplicateTrack(b); this.render(); } }, { colors: c => { pushUndo(); b.color = c; ui.all(); this.render(); } }, '-', { label: 'Delete track', danger: true, run: () => { deleteTrack(b); this.render(); } }]); });
  },
  // The mixer fits the window's height (it only scrolls sideways): the fader takes what is left, and if a strip still does not
  // fit, it tightens step by step - smaller slots, then only the used insert slots plus one, then no section titles or delay box.
  fit() {
    const box = $('#mixer .mxstrips'); if (!box || $('#mixer').hidden) return;
    const over = () => [...box.querySelectorAll('.mxs')].some(x => x.scrollHeight > x.clientHeight + 1 || (x.querySelector('.mxfader') || { clientHeight: 999 }).clientHeight < 150);   // tighten before the fader gets short
    box.classList.remove('c1', 'c2', 'c3'); for (const c of ['c1', 'c2', 'c3']) { if (!over()) break; box.classList.add(c); }
  },
  // called every animation frame while the mixer is visible
  frame(now) {
    const box = $('#mixer'); if (!box || box.hidden) return;
    allBuses().forEach(b => {
      const r = b === S.master ? M : RT.get(b.id); const el = box.querySelector(`[data-mm="${b.id}"]`); if (!r || !el || !r.anL) return;
      const chans = el.querySelectorAll('.mxch'), pid = b === S.master ? 'master' : b.id, inp = b.arm && b.kind === 'audio' ? inputAnalyser(b) : null; const L = meter(b.id + ':L', chans[0], inp || r.anL, now), R = meter(b.id + ':R', chans[1], inp || r.anR, now);
      el.querySelector('.mxclip').classList.toggle('on', L.clip || R.clip);
      const peakDb = Math.max(L.lastDb, R.lastDb), cur = this.peaks.get(b.id); L.lastDb = R.lastDb = -120; if (peakDb > -90 && (cur == null || peakDb > cur)) this.peaks.set(b.id, peakDb);
      const pk = box.querySelector(`[data-pk="${b.id}"]`), v = this.peaks.get(b.id); if (pk) { pk.textContent = v == null ? '-inf' : v.toFixed(1); pk.classList.toggle('hot', v != null && v > 0); }
      if (T.playing && b.auto.vol && b.auto.vol.length) { const f = box.querySelector(`.mxs[data-id="${b.id}"] .mxvol`); if (f && document.activeElement !== f) f.value = autoValue(b.auto.vol, nowPos()); }
    });
    const ld = M.loudData; if (ld) { const f = v => (isFinite(v) ? v.toFixed(1) : '–'); const q = k => box.querySelector(`[data-l="${k}"]`); if (q('m')) { q('m').textContent = f(ld.m); q('s').textContent = f(ld.s); q('i').textContent = f(ld.i); q('p').textContent = ld.peak > 0 ? gainToDb(ld.peak).toFixed(1) : '–'; q('p').classList.toggle('hot', ld.peak >= 0.989); } }
  },
};
function setView(v) {
  V.view = v; $('#mixer').hidden = v !== 'mix'; $('#arr').hidden = v === 'mix'; $('#viewBtn').classList.toggle('on', v === 'mix'); $('#viewBtn').title = v === 'mix' ? 'Back to Arrangement (Tab)' : 'Mixer (Tab)'; $('#viewBtn').setAttribute('aria-label', v === 'mix' ? 'Switch to the Arrangement' : 'Switch to the Mixer');
  // like Pro Tools' Mix window, the mixer gets the full height: the device panel steps aside and comes back on the way out
  const app = $('#app'), shown = !app.classList.contains('nodetail');
  if (v === 'mix' && shown) { V.detailBeforeMix = true; setDetailShown(false); }
  else if (v !== 'mix' && V.detailBeforeMix) { V.detailBeforeMix = false; setDetailShown(true); }
  if (v === 'mix') mixer.render(); else { ui.headers(); arr.draw(); }
}
