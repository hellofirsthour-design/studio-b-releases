/* ============ UI shell: transport, track headers, detail view, menus ============ */
const ui = {
  all() { ui.transport(); ui.headers(); ui.detail(); arr.draw(); ui.title(); browser.render(); if (V.view === 'mix') mixer.render(); },
  title() { const t = `${S.name}${V.dirty ? ' *' : ''} — Studio B`; document.title = t; if (IS_DESKTOP) NATIVE.setTitle(t); $('#projName').textContent = S.name + (V.dirty ? ' •' : ''); },
  transport() {
    if (document.activeElement !== $('#bpm')) $('#bpm').value = S.bpm;
    $('#play').classList.toggle('on', T.playing); $('#rec').classList.toggle('on', T.rec); $('#midiOd').classList.toggle('on', !!V.midiOd); $('#capture').classList.toggle('hot', CAPTURE.length > 0);
    $('#metro').classList.toggle('on', !!S.metro); $('#loopBtn').classList.toggle('on', S.loop.on);
    $('#follow').classList.toggle('on', V.follow); $('#autoBtn').classList.toggle('on', V.autoMode); $('#autoArm').classList.toggle('on', !!V.autoArm); $('#reAuto').classList.toggle('hot', OVERRIDES.size > 0); $('#reAuto').disabled = !OVERRIDES.size;
    $('#root').value = S.root; $('#scale').value = S.scale; $('#snapBtn').classList.toggle('on', V.snap);
    $('#sig').value = SIG().join('/'); { const ci = (S.prefs && S.prefs.countIn) || 0; $('#countIn').classList.toggle('on', !!ci); $('#countIn .badge').textContent = ci ? String(ci) : ''; $('#countIn').title = ci ? `Count-in: ${ci} bar${ci > 1 ? 's' : ''} before recording. Click to change.` : 'Count-in before recording: off. Click to turn on.'; } S.punch = S.punch || {}; $('#punchIn').classList.toggle('on', !!S.punch.in); $('#punchOut').classList.toggle('on', !!S.punch.out);
    const nb = SIG()[0], beats = $('#beats'); if (beats.children.length !== Math.min(nb, 12)) beats.innerHTML = '<i></i>'.repeat(Math.min(nb, 12));
    $('#loopStart').textContent = barsBeats(S.loop.start); $('#loopLen').textContent = barsBeatsLen(S.loop.end - S.loop.start);
    $('#app').classList.toggle('nobrowser', !V.browser);
  },
  headers() {
    arr.layout(); const box = $('#hdrInner'); let h = '';
    arr.rows.forEach(r => {
      if (r.kind === 'auto') { const ps = autoParams(r.b); h += `<div class="hdr autolane" data-id="${r.b.id}" data-li="${r.li}" style="top:${r.y}px;height:${r.h}px;--tc:${r.b.color || '#a7a3b8'};--depth:${S.tracks.includes(r.b) ? depthOf(r.b) : 0}"><i class="hcol dim"></i><div class="hmain"><div class="hrow"><select class="dd hauto" data-h="laneKey" aria-label="Automation lane parameter">${ps.map(p => `<option value="${p.key}" ${p.key === r.key ? 'selected' : ''}>${r.b.auto[p.key] && r.b.auto[p.key].length ? '● ' : ''}${esc(p.label)}</option>`).join('')}</select><button class="hb" data-h="delLane" title="Hide this lane (its automation stays)">✕</button></div></div></div>`; return; }
      if (r.kind === 'auto') { const ps = autoParams(r.b); h += `<div class="hdr autolane" data-id="${r.b.id}" data-li="${r.li}" style="top:${r.y}px;height:${r.h}px;--tc:${r.b.color || '#a7a3b8'};--depth:${S.tracks.includes(r.b) ? depthOf(r.b) : 0}"><i class="hcol dim"></i><div class="hmain"><div class="hrow"><select class="dd hauto" data-h="laneKey" aria-label="Automation lane parameter">${ps.map(p => `<option value="${p.key}" ${p.key === r.key ? 'selected' : ''}>${r.b.auto[p.key] && r.b.auto[p.key].length ? '● ' : ''}${esc(p.label)}</option>`).join('')}</select><button class="hb" data-h="delLane" title="Hide this lane (its automation stays)">✕</button></div></div></div>`; return; }
      if (r.kind === 'take') { h += `<div class="hdr take" data-id="${r.b.id}" data-lane="${r.lane.id}" style="top:${r.y}px;height:${r.h}px;--tc:${r.b.color}"><i class="hcol dim"></i><div class="hmain"><div class="hrow"><span class="hname tname" title="Drag across a take (or click it) to comp it onto the track">${esc(r.lane.name)}</span><button class="hb" data-h="compAll" title="Use this whole take">Use</button><button class="hb" data-h="delTake" title="Delete this take lane">✕</button></div></div></div>`; return; }
      const b = r.b, isT = r.kind === 'track', sel = V.selTracks.has(b.id), num = isT ? S.tracks.indexOf(b) + 1 : r.kind === 'return' ? RET_LETTERS[S.returns.indexOf(b)] || 'R' : 'M', grp = b.kind === 'group';
      const big = r.h >= 50 && !b.collapsed, params = V.autoMode ? autoParams(b) : null;
      h += `<div class="hdr ${sel ? 'sel' : ''} ${r.kind} ${grp ? 'group' : ''}" data-id="${b.id}" style="top:${r.y}px;height:${r.h}px;--tc:${b.color || '#a7a3b8'};--depth:${isT ? depthOf(b) : 0}">
        <i class="hcol"></i>
        <div class="hmain">
          <div class="hrow">${grp ? `<button class="hb fold" data-h="fold" title="Fold or unfold the group">${b.fold ? '▸' : '▾'}</button>` : `<button class="hb fold clp" data-h="collapse" title="Collapse or expand this track (Alt-click: all tracks)">${b.collapsed ? '▸' : '▾'}</button>`}<span class="hname" title="Double-click to rename">${esc(b.name)}</span>${r.kind === 'return' ? `<button class="hb ${b.pre ? 'on' : ''}" data-h="pre" title="Sends into this return are taken before the track faders (Pre) or after them (Post)">${b.pre ? 'Pre' : 'Post'}</button>` : ''}
            ${r.kind !== 'master' ? `<button class="hb act ${b.mute ? '' : 'on'}" data-h="mute" data-map="${b.id}|mute" title="Track activator">${num}</button>` : ''}
            ${isT ? `<button class="hb solo ${b.solo ? 'on' : ''}" data-h="solo" data-map="${b.id}|solo" title="Solo">S</button>${grp ? '' : `<button class="hb arm ${b.arm ? 'on' : ''}" data-h="arm" data-map="${b.id}|arm" title="Arm recording">●</button>`}` : ''}${isT && b.takes && b.takes.length ? `<button class="hb tk ${b.showTakes ? 'on' : ''}" data-h="takes" title="Show or hide take lanes">T${b.takes.length}</button>` : ''}${isT && b.frozen ? '<span class="frz" title="Frozen">❄</span>' : ''}
          </div>
          ${big ? (V.autoMode ? `<div class="hrow"><select class="dd hauto" data-h="autoShow" aria-label="Automation parameter">${params.map(p => `<option value="${p.key}" ${p.key === (b.autoShow || 'vol') ? 'selected' : ''}>${b.auto[p.key] && b.auto[p.key].length ? '● ' : ''}${esc(p.label)}</option>`).join('')}</select>${b.auto[b.autoShow || 'vol'] && b.auto[b.autoShow || 'vol'].length ? '<button class="hb" data-h="clearAuto" title="Delete this automation">✕</button>' : ''}</div>`
          : `<div class="hrow">${isT && b.kind === 'audio' ? `<span class="mon seg">${['in', 'auto', 'off'].map(m => `<button data-h="mon" data-m="${m}" class="${b.monitor === m ? 'on' : ''}">${m === 'in' ? 'In' : m === 'auto' ? 'Auto' : 'Off'}</button>`).join('')}</span>` : grp ? `<span class="itype">Group · ${descendants(b).length}</span>` : isT ? `<span class="itype">${{ synth: 'Contour', drums: 'Kit', sampler: 'Cutline' }[b.inst.type]}</span>` : ''}
              <input type="range" class="hvol" min="0" max="1" step="0.001" value="${b.vol}" data-h="vol" data-map="${b.id}|vol" aria-label="${esc(b.name)} volume"><span class="hdb" data-db="${b.id}">${faderDb(b.vol)}</span></div>`) : ''}
          ${r.h >= 86 && !V.autoMode ? `<div class="hrow hsm"><span class="lab">Pan</span><input type="range" class="hpan" min="-1" max="1" step="0.01" value="${b.pan || 0}" data-h="pan" aria-label="Pan">${isT ? `<span class="lab">A</span><input type="range" class="hsend" min="0" max="1" step="0.01" value="${b.sendA}" data-h="sendA" aria-label="Send A"><span class="lab">B</span><input type="range" class="hsend" min="0" max="1" step="0.01" value="${b.sendB}" data-h="sendB" aria-label="Send B">` : ''}</div>` : ''}
        </div>
        <div class="hmeter" data-meter="${b.id}"><i class="lvl"></i><i class="pk"></i></div>
        <div class="hresize" data-h="resize"></div>
      </div>`;
    });
    h += `<div class="hdradd" style="top:${S.tracks.length ? arr.rows.find(r => r.kind === 'return').y - 10 : 0}px"></div>`;
    box.innerHTML = h; box.style.height = arr.totalH + 'px'; arr.syncHeaders(); arr.draw();
  },
  detail() {
    $$('#dtabs [data-d]').forEach(b => b.classList.toggle('on', b.dataset.d === V.detail));
    const showClip = V.detail === 'clip' || V.detail === 'both', showDev = V.detail === 'devices' || V.detail === 'both';
    $('#pane-clip').hidden = !showClip; $('#pane-dev').hidden = !showDev; $('#detail').classList.toggle('both', V.detail === 'both');
    const c = V.editClip && clipById(V.editClip), selB = busById([...V.selTracks][0]), t = V.detail === 'devices' ? selB : (c ? trackOf(c) : selB);
    $('#dTitle').innerHTML = t ? `<i style="background:${t.color || '#a7a3b8'}"></i>${esc(t.name)}${c && V.detail !== 'devices' && trackOf(c) === t ? ' / ' + esc(c.name) : ''}` : '';
    if (showClip) { if (c && c.type === 'audio') audioEditor(c); else roll.mount(); }
    if (showDev) ui.devices();
  },
  devices() {
    const pane = $('#pane-dev'); const o = busById([...V.selTracks][0]) || (V.editClip && trackOf(clipById(V.editClip)));
    pane.innerHTML = ''; if (!o) { pane.innerHTML = '<div class="empty-state"><h3>No track selected</h3><p>Select a track to see its instrument and effects. Drag effects in from the browser.</p></div>'; return; }
    const rack = document.createElement('div'); rack.className = 'rack'; pane.appendChild(rack);
    if (o.kind === 'midi') rack.appendChild(instrumentCard(o));
    o.devices.forEach((d, i) => rack.appendChild(deviceCard(o, d, i)));
    const add = document.createElement('div'); add.className = 'card addcard';
    add.innerHTML = `<div class="ch"><span class="cname">Add effect</span></div><div class="addlist">${Object.entries(DEVICES).filter(([, v]) => !v.hidden).map(([k, v]) => `<button data-dev="${k}"><b>${v.name}</b><span>${v.blurb}</span></button>`).join('')}</div>`;
    add.onclick = e => { const b = e.target.closest('[data-dev]'); if (!b) return; pushUndo('Add device'); o.devices.push(newDevice(b.dataset.dev)); rewire(o); ui.devices(); rack.scrollLeft = rack.scrollWidth; };
    rack.appendChild(add);
    rack.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('sb/device')) e.preventDefault(); });
    rack.addEventListener('drop', e => { const d = e.dataTransfer.getData('sb/device'); if (!d) return; e.preventDefault(); pushUndo('Add device'); o.devices.push(newDevice(d)); rewire(o); ui.devices(); });
  },
};

/* ---------- track header interactions ---------- */
function bindHeaders() {
  const box = $('#hdrInner');
  box.addEventListener('pointerdown', e => {
    const hd = e.target.closest('.hdr'); if (!hd) return; const b = busById(hd.dataset.id); const h = e.target.closest('[data-h]');
    if (hd.dataset.lane) return;
    if (h && h.dataset.h === 'resize') {
      e.preventDefault(); const y0 = e.clientY, h0 = b.h || 40; h.setPointerCapture(e.pointerId);
      h.onpointermove = ev => { b.h = clamp(h0 + ev.clientY - y0, 22, 320); arr.layout(); $$('.hdr', box).forEach(el => { const r = arr.rows.find(q => q.b.id === el.dataset.id && (el.dataset.lane ? q.lane && q.lane.id === el.dataset.lane : q.kind !== 'take')); if (r) { el.style.top = r.y + 'px'; el.style.height = r.h + 'px'; } }); arr.draw(); };
      h.onpointerup = () => { h.onpointermove = null; ui.headers(); }; return;
    }
    if (h && h.tagName !== 'DIV') return;
    if (e.shiftKey || e.ctrlKey || e.metaKey) V.selTracks.add(b.id); else if (!V.selTracks.has(b.id)) V.selTracks = new Set([b.id]);
    // drag a header up or down to reorder; drop on the middle of a group to put it inside
    if (S.tracks.includes(b) && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const y0 = e.clientY; let drag = false, drop = null; const line = document.createElement('div'); line.className = 'hdrdrop';
      const move = ev => {
        if (!drag && Math.abs(ev.clientY - y0) < 6) return; if (!drag) { drag = true; hd.classList.add('dragging'); box.appendChild(line); }
        const el = document.elementFromPoint(e.clientX, ev.clientY), th = el && el.closest('.hdr'), tb = th && !th.dataset.lane && th.dataset.li == null ? busById(th.dataset.id) : null;
        if (!tb || !S.tracks.includes(tb) || V.selTracks.has(tb.id)) { drop = null; line.hidden = true; return; }
        const r = th.getBoundingClientRect(), f = (ev.clientY - r.top) / r.height, into = tb.kind === 'group' && f > 0.3 && f < 0.7;
        drop = { t: tb, where: into ? 'into' : f < 0.5 ? 'before' : 'after' }; line.hidden = false; line.classList.toggle('into', into);
        const top = th.offsetTop + (into ? 0 : f < 0.5 ? 0 : th.offsetHeight); line.style.top = top + 'px'; line.style.height = into ? th.offsetHeight + 'px' : '';
      };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); line.remove(); hd.classList.remove('dragging');
        if (drag && drop) moveTracks(V.selTracks, drop.t, drop.where); else if (!drag) { V.selTracks = new Set([b.id]); ui.headers(); } };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    }
    V.editClip = null; $$('.hdr', box).forEach(el => el.classList.toggle('sel', V.selTracks.has(el.dataset.id)));
    if (V.detail === 'clip') V.detail = 'devices'; ui.detail(); arr.draw();
  });
  box.addEventListener('click', async e => {
    const h = e.target.closest('[data-h]'), hd = e.target.closest('.hdr'); if (!h || !hd) return; const b = busById(hd.dataset.id);
    switch (h.dataset.h) {
      case 'mute': b.mute = !b.mute; break;
      case 'solo': if (!(e.ctrlKey || e.metaKey) && !b.solo) S.tracks.forEach(t => (t.solo = false)); b.solo = !b.solo; break;
      case 'arm': { const on = !b.arm; if (!(e.ctrlKey || e.metaKey)) S.tracks.forEach(t => { if (t !== b && t.arm) { t.arm = false; applyMix(t); } }); await armTrack(b, on); break; }
      case 'mon': b.monitor = h.dataset.m; break;
      case 'fold': b.fold = !b.fold; break;
      case 'pre': pushUndo('Send position'); b.pre = !b.pre; rebuildAll(); break;
      case 'clearAuto': pushUndo('Clear automation'); delete b.auto[b.autoShow || 'vol']; releaseAutomation(); _tmKey = ''; break;
      case 'takes': b.showTakes = !b.showTakes; break;
      case 'compAll': { const lane = b.takes.find(l => l.id === hd.dataset.lane); const a = Math.min(...lane.clips.map(c => c.start)), z = Math.max(...lane.clips.map(c => c.start + c.len)); compRange(b, lane, a, z); break; }
      case 'collapse': { const to = !b.collapsed; (e.altKey ? [...S.tracks.filter(x => x.kind !== 'group'), ...S.returns, S.master] : [b]).forEach(x => (x.collapsed = to)); break; }
      case 'delLane': b.lanes.splice(+hd.dataset.li, 1); break;
      case 'delLane': b.lanes.splice(+hd.dataset.li, 1); break;
      case 'delTake': pushUndo('Delete take'); b.takes = b.takes.filter(l => l.id !== hd.dataset.lane); if (!b.takes.length) b.showTakes = false; break;
      default: return;
    }
    applyAllMix(); markDirty(); ui.headers();
  });
  box.addEventListener('pointerdown', e => { if (e.target.matches && e.target.matches('input[type=range]')) pushUndo('Mixer'); }, true);
  box.addEventListener('input', e => {
    const h = e.target.closest('[data-h]'), hd = e.target.closest('.hdr'); if (!h || !hd) return; const b = busById(hd.dataset.id), k = h.dataset.h;
    if (['vol', 'pan', 'sendA', 'sendB'].includes(k)) { if (k === 'sendA' || k === 'sendB') setSend(b, sendIndex(k), +h.value); else b[k] = +h.value; autoTouch(b, k, +h.value); autoTouch(b, k, +h.value); applyMix(b); if (b === S.master) rewireMaster(); const db = $(`[data-db="${b.id}"]`); if (db) db.textContent = faderDb(b.vol); markDirty(); showTip(e, k === 'vol' ? faderDb(b.vol) + ' dB' : k === 'pan' ? (Math.abs(b.pan) < 0.01 ? 'C' : Math.round(Math.abs(b.pan) * 50) + (b.pan < 0 ? 'L' : 'R')) : Math.round(b[k] * 100) + '%'); }
  });
  box.addEventListener('change', e => { hideTip(); const h = e.target.closest('[data-h]'), hd = e.target.closest('.hdr'); if (h && h.dataset.h === 'autoShow') { busById(hd.dataset.id).autoShow = h.value; ui.headers(); } if (h && h.dataset.h === 'laneKey') { busById(hd.dataset.id).lanes[+hd.dataset.li] = h.value; ui.headers(); } });
  box.addEventListener('dblclick', e => {
    const hd = e.target.closest('.hdr'); if (!hd) return; const b = busById(hd.dataset.id);
    if (hd.dataset.lane && e.target.closest('.hname')) { const lane = b.takes.find(l => l.id === hd.dataset.lane); return askText('Take name', lane.name, v => { pushUndo('Rename take'); lane.name = v; ui.headers(); }); }
    if (e.target.closest('.hname')) askText('Track name', b.name, v => { pushUndo('Rename'); b.name = v; ui.headers(); ui.detail(); });
    if (e.target.closest('.hvol')) { b.vol = 0.79; applyMix(b); ui.headers(); }
  });
  box.addEventListener('contextmenu', e => {
    const hd = e.target.closest('.hdr'); if (!hd) return; e.preventDefault(); const b = busById(hd.dataset.id); const isT = S.tracks.includes(b);
    if (hd.dataset.lane || hd.dataset.li != null) return;
    const items = [{ label: 'Rename', key: 'Ctrl+R', run: () => askText('Track name', b.name, v => { pushUndo(); b.name = v; ui.headers(); }) }];
    if (isT) items.push({ label: 'Select all clips on track', run: () => selectTrackClips(b) });
    if (isT) items.push({ label: 'Duplicate track', run: () => duplicateTrack(b) }, { label: 'Delete track', danger: true, run: () => deleteTrack(b) }, { colors: c => { pushUndo(); b.color = c; ui.all(); } });
    if (isT && b.kind !== 'group') items.push('-', ...trackRenderMenu(b));
    if (isT) items.push({ label: 'Move up', key: 'Ctrl+Alt+↑', run: () => { V.selTracks = new Set([b.id]); nudgeTrack(-1); } }, { label: 'Move down', key: 'Ctrl+Alt+↓', run: () => { V.selTracks = new Set([b.id]); nudgeTrack(1); } });
    if (isT) items.push(b.kind === 'group' ? { label: 'Ungroup', key: 'Ctrl+Shift+G', run: () => ungroupTrack(b) } : { label: 'Group selected tracks', key: 'Ctrl+G', run: () => { V.selTracks.add(b.id); groupTracks(); } });
    if (isT && b.takes && b.takes.length) items.push({ label: b.showTakes ? 'Hide take lanes' : 'Show take lanes', run: () => { b.showTakes = !b.showTakes; ui.headers(); } });
    if (isT && b.kind === 'audio') items.push('-', { label: 'Choose input…', run: () => chooseInput(b) });
    if (S.returns.includes(b)) items.push({ label: 'Delete return', danger: true, run: () => { if (S.returns.length <= 1) return toast('Keep at least one return'); pushUndo(); S.returns = S.returns.filter(r => r !== b); rebuildAll(); ui.all(); } });
    items.push('-', { label: 'Show automation', run: () => { V.autoMode = true; ui.all(); } }, { label: 'Show automation in new lane', run: () => addAutoLane(b) }, { label: 'Show automation in new lane', run: () => addAutoLane(b) }, { label: b.collapsed ? 'Expand track' : 'Collapse track', run: () => { b.collapsed = !b.collapsed; ui.all(); } }, { label: 'Collapse all tracks', run: () => { [...S.tracks.filter(x => x.kind !== 'group'), ...S.returns, S.master].forEach(x => (x.collapsed = true)); ui.all(); } }, { label: 'Expand all tracks', run: () => { [...S.tracks, ...S.returns, S.master].forEach(x => (x.collapsed = false)); ui.all(); } }, { label: 'Make tall', run: () => { b.h = 110; ui.headers(); } });
    popMenu(e, items);
  });
  box.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('sb/device') || e.dataTransfer.types.includes('sb/inst')) e.preventDefault(); });
  box.addEventListener('drop', e => { const hd = e.target.closest('.hdr'); if (!hd) return; e.preventDefault(); const b = busById(hd.dataset.id); const d = e.dataTransfer.getData('sb/device'), i = e.dataTransfer.getData('sb/inst');
    if (d) { pushUndo('Add device'); b.devices.push(newDevice(d)); rewire(b); V.selTracks = new Set([b.id]); V.detail = 'devices'; ui.all(); }
    if (i && b.kind === 'midi') addInstrumentTrack(i, b); });
}
function duplicateTrack(t) { if (t.kind === 'group') return toast('Duplicate the tracks inside the group instead'); pushUndo('Duplicate track'); const c = deep(t); c.id = uid(); c.name = t.name + ' copy'; c.arm = false; const idMap = {}; c.devices.forEach(d => { const n = uid(); idMap[d.id] = n; d.id = n; }); const remap = k => k.replace(/^(dev|eqf|eqg):([^:]+)/, (m, kind, id) => `${kind}:${idMap[id] || id}`); c.auto = Object.fromEntries(Object.entries(c.auto).map(([k, v]) => [remap(k), v])); if (c.autoShow) c.autoShow = remap(c.autoShow); delete c.frozen; c.clips.forEach(k => (k.id = uid())); S.tracks.splice(S.tracks.indexOf(t) + 1, 0, c); buildBus(c, 'track'); V.selTracks = new Set([c.id]); ui.all(); }
function deleteTrack(t) { pushUndo('Delete track'); if (t.kind === 'group') S.tracks.forEach(x => { if (x.group === t.id) x.group = t.group || null; }); removeBus(t); S.tracks = S.tracks.filter(x => x !== t); if (V.editClip && !clipById(V.editClip)) V.editClip = null; if (t.kind === 'group') rebuildAll(); applyAllMix(); ui.all(); }
function addTrack(kind, instType) { pushUndo('Insert track'); const t = newTrack(kind, instType); const after = S.tracks.findIndex(x => V.selTracks.has(x.id)); S.tracks.splice(after >= 0 ? after + 1 : S.tracks.length, 0, t); buildBus(t, 'track'); V.selTracks = new Set([t.id]); ui.all(); return t; }
function addInstrumentTrack(spec, onto) { // spec: "synth", "drums", "sampler" or "synth:Preset"
  const [type, preset] = spec.split(':');
  if (onto) { pushUndo('Replace instrument'); removeBus(onto); onto.inst = newInst(type); if (preset) Object.assign(onto.inst, SYNTH_PRESETS[preset], { preset }); buildBus(onto, 'track'); V.selTracks = new Set([onto.id]); V.detail = 'devices'; ui.all(); return; }
  const t = addTrack('midi', type); if (preset) { Object.assign(t.inst, SYNTH_DEFAULT, SYNTH_PRESETS[preset], { preset }); t.name = preset; RT.get(t.id).inst.update(); }
  V.detail = 'devices'; ui.all();
}
async function chooseInput(t) {
  let devs = []; try { if (!internalInput(t)) await getInput(t.input); devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput'); } catch (e) { return toast('No audio input is available. Check microphone permission.'); }
  const others = S.tracks.filter(x => x !== t && x.kind !== 'group').map(x => ({ label: (t.input === 'track:' + x.id ? '✓ ' : '') + 'Track: ' + x.name, run: () => { pushUndo('Input'); t.input = 'track:' + x.id; connectInputs(); ui.headers(); toast(`Records ${x.name}'s output`); } }));
  popMenu(lastPointer, [...devs.map(d => ({ label: (d.deviceId === t.input ? '✓ ' : '') + (d.label || 'Input ' + d.deviceId.slice(0, 5)), run: async () => { t.input = d.deviceId; try { await getInput(d.deviceId); connectInputs(); toast('Input: ' + d.label); } catch (e) { toast('That input could not be opened'); } } })), '-', { label: (t.input === 'resample' ? '✓ ' : '') + 'Resampling (the main output)', run: () => { pushUndo('Input'); t.input = 'resample'; connectInputs(); ui.headers(); toast('Records the main output'); } }, ...others]);
}

/* ---------- audio clip editor (Clip View for audio) ---------- */
function audioEditor(c) {
  const pane = $('#pane-clip'), s = SAMPLES.get(c.sampleId), t = trackOf(c);
  pane.innerHTML = `<div class="aed">
    <aside class="clipside">
      <label class="fld"><span>Clip name</span><input id="acName" value="${esc(c.name)}"></label>
      <div class="fld"><span>Source</span><div class="muted small">${s ? `${esc(s.name)} · ${s.buf.duration.toFixed(2)} s · ${Math.round(s.buf.sampleRate / 100) / 10} kHz${s.path ? `<br><span class="path">${esc(s.path)}</span>` : s.recorded !== false && !s.path ? '<br>Recorded take (saved with the project)' : ''}` : 'Media offline'}</div></div>
      <div class="row"><div class="chip"><span>Detected key</span><b>${s && s.key ? keyLabel(s.key.root, s.key.mode) : '-'}</b></div><div class="chip"><span>Detected tempo</span><b>${s && s.bpm ? s.bpm : '-'}</b></div></div>
      <div class="row"><button class="btn ghostb" id="acSlice">Slice to new MIDI track</button><button class="btn ghostb" id="acFit">Set song tempo from clip</button></div>
      ${s && s.path && IS_DESKTOP ? '<button class="btn ghostb" id="acReveal">Show file</button>' : ''}
    </aside>
    <div class="aedmain">
      <div class="aedctl"></div>
      <canvas id="aedWave" aria-label="Audio clip waveform"></canvas>
    </div></div>`;
  let rt = 0; const ctl = $('.aedctl', pane), changed = () => { markDirty(); arr.draw(); drawW(); clearTimeout(rt); rt = setTimeout(() => { if (T.playing) play(nowPos()); }, 350); };
  const wrapK = (o, lbl) => { const d = document.createElement('div'); d.className = 'kgroup'; d.innerHTML = `<span class="lab">${lbl}</span>`; d.appendChild(o); return d; };
  ctl.appendChild(toggleEl('Warp', c.warp, v => { pushUndo('Warp'); c.warp = v; if (v) { c.srcBpm = c.srcBpm || (s && s.bpm) || S.bpm; } changed(); audioEditor(c); }));
  if (c.warp) {
    const bpmIn = document.createElement('label'); bpmIn.className = 'chip'; bpmIn.innerHTML = `<span>Clip BPM</span><input type="number" min="20" max="400" step="0.01" value="${+c.srcBpm.toFixed(2)}" aria-label="Clip tempo">`;
    bpmIn.querySelector('input').onchange = e => { pushUndo('Clip BPM'); c.srcBpm = clamp(+e.target.value || c.srcBpm, 20, 400); changed(); }; ctl.appendChild(bpmIn);
    const half = document.createElement('button'); half.className = 'btn ghostb tiny'; half.textContent = '÷2'; half.onclick = () => { pushUndo(); c.srcBpm /= 2; changed(); audioEditor(c); };
    const dbl = document.createElement('button'); dbl.className = 'btn ghostb tiny'; dbl.textContent = '×2'; dbl.onclick = () => { pushUndo(); c.srcBpm *= 2; changed(); audioEditor(c); };
    ctl.append(half, dbl);
    ctl.appendChild(selectEl(WARP_MODES, c.wmode || 'complex', v => { pushUndo('Warp mode'); c.wmode = v; changed(); }, 'Warp mode'));
    const wt = document.createElement('button'); wt.className = 'btn ghostb'; wt.textContent = hasWm(c) ? `Warp markers: ${c.wm.length}` : 'Warp from transients'; wt.title = 'Put a warp marker on each transient. Drag the yellow handles in the arrangement to move the audio; right-click a clip for more.';
    wt.onclick = e => popMenu(e, warpMenu(c, V.insert >= c.start && V.insert < c.start + c.len ? V.insert : c.start)); ctl.appendChild(wt);
  }
  ctl.appendChild(knob({ label: 'Gain', value: c.gain, min: -36, max: 24, def: 0, fmt: fDb, onInput: v => { c.gain = v; changed(); } }));
  ctl.appendChild(knob({ label: 'Transpose', value: c.semis, min: -24, max: 24, step: 1, def: 0, fmt: v => (v > 0 ? '+' : '') + v + ' st', onInput: v => { c.semis = v; changed(); } }));
  ctl.appendChild(knob({ label: 'Detune', value: c.cents || 0, min: -50, max: 50, step: 1, def: 0, fmt: v => (v > 0 ? '+' : '') + v + ' ct', onInput: v => { c.cents = v; changed(); } }));
  const rv = document.createElement('button'); rv.className = 'btn ghostb'; rv.textContent = c.revOf ? 'Un-reverse' : 'Reverse'; rv.onclick = () => { V.selClips = new Set([c.id]); reverseClips(); }; ctl.appendChild(rv);
  ctl.appendChild(knob({ label: 'Fade in', value: c.fadeIn, min: 0, max: Math.max(0.25, c.len / 2), def: 0, fmt: v => barsBeatsLen(v), onInput: v => { c.fadeIn = v; changed(); } }));
  ctl.appendChild(knob({ label: 'Fade out', value: c.fadeOut, min: 0, max: Math.max(0.25, c.len / 2), def: 0, fmt: v => barsBeatsLen(v), onInput: v => { c.fadeOut = v; changed(); } }));
  ctl.appendChild(toggleEl('Loop', !!c.loop, v => { pushUndo('Loop'); c.loop = v; if (v && !c.loopLen) c.loopLen = Math.min(c.len, Math.max(1, clipNaturalLen(c) - c.offset)); changed(); audioEditor(c); }));
  if (c.loop) { const ll = document.createElement('label'); ll.className = 'chip'; ll.innerHTML = `<span>Loop length (beats)</span><input type="number" min="0.25" step="0.25" value="${+(c.loopLen / BEAT()).toFixed(2)}" aria-label="Loop length in beats">`; ll.querySelector('input').onkeydown = e => e.stopPropagation(); ll.querySelector('input').onchange = e => { pushUndo('Loop length'); c.loopLen = Math.max(0.25, +e.target.value * BEAT()); changed(); }; ctl.appendChild(ll); }
  ctl.appendChild(selectEl([['linear', 'Fades: linear'], ['equal', 'Fades: equal power'], ['slow', 'Fades: slow'], ['fast', 'Fades: fast']], c.fadeShape || 'linear', v => { pushUndo('Fade shape'); c.fadeShape = v; changed(); }, 'Fade shape'));
  ctl.appendChild(selectEl([['', 'Clip envelope: off'], ['gain', 'Clip envelope: gain'], ['pan', 'Clip envelope: pan']], V.clipEnv || '', v => { V.clipEnv = v || null; drawW(); }, 'Clip envelope'));
  ctl.appendChild(toggleEl(c.muted ? 'Clip off' : 'Clip on', !c.muted, v => { pushUndo(); c.muted = !v; changed(); }));
  $('#acName').onchange = e => { pushUndo(); c.name = e.target.value || c.name; arr.draw(); ui.detail(); };
  $('#acSlice').onclick = () => sliceToMidi(c);
  $('#acFit').onclick = () => { if (!c.warp) return toast('Turn warp on and set the clip BPM first'); setBpm(c.srcBpm); };
  if ($('#acReveal')) $('#acReveal').onclick = () => NATIVE.reveal(s.path);
  const cv = $('#aedWave');
  const drawW = () => {
    if (!cv.isConnected) return; const { g, w, h } = arr.fit(cv); const css = CSS(); g.fillStyle = css.lane; g.fillRect(0, 0, w, h);
    if (!s) return; const total = s.buf.duration, wv = s.wave, k = w / total;
    const a = srcSecAt(c, c.offset), b = srcSecAt(c, c.offset + c.len);
    g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(a * k, 0, (b - a) * k, h);
    const mid = h / 2, amp = h / 2 - 6, gain = dbToGain(c.gain);
    for (let px = 0; px < w; px++) { const i0 = Math.floor(px / k * wv.sr / PEAK_BLOCK), i1 = Math.max(i0 + 1, Math.floor((px + 1) / k * wv.sr / PEAK_BLOCK)); let lo = 0, hi = 0; for (let i = i0; i < i1 && i < wv.mx.length; i++) { lo = Math.min(lo, wv.mn[i]); hi = Math.max(hi, wv.mx[i]); } const sec = px / k; g.fillStyle = sec >= a && sec <= b ? (t ? t.color : css.fg) : css.dim; g.fillRect(px, mid - clamp(hi * gain, 0, 1) * amp, 1, Math.max(1, (clamp(hi * gain, 0, 1) - clamp(lo * gain, -1, 0)) * amp)); }
    g.fillStyle = css.accent; g.fillRect(a * k, 0, 2, h); g.fillRect(b * k - 2, 0, 2, h); g.font = '10px ' + css.mono; g.fillText('Start', a * k + 4, 12); g.fillText('End', b * k - 26, 12);
    if (c.warp && c.srcBpm) { g.fillStyle = css.gridBeat; for (let beat = 0; beat * 60 / c.srcBpm < total; beat++) { const x = beat * 60 / c.srcBpm * k; g.fillRect(x, h - (beat % 4 ? 5 : 10), 1, beat % 4 ? 5 : 10); } }
    if (c.warp) { g.fillStyle = 'rgba(255,255,255,.28)'; transientsOf(c.sampleId).forEach(sec => g.fillRect(Math.round(sec * k) + 0.5, h - 7, 1, 7)); if (hasWm(c)) { g.fillStyle = '#f2c14e'; c.wm.forEach(m => { const X = Math.round(m.s * k) + 0.5; g.globalAlpha = 0.55; g.fillRect(X, 0, 1, h); g.globalAlpha = 1; g.beginPath(); g.moveTo(X - 4, 0); g.lineTo(X + 4, 0); g.lineTo(X, 6); g.fill(); }); } }
    if (T.playing) { const p = nowPos(); if (p >= c.start && p < c.start + c.len) { g.fillStyle = css.playhead; g.fillRect(srcSecAt(c, p - c.start + c.offset) * k, 0, 1.5, h); } }
    if (V.clipEnv) { const ev = envGeo(), pts = (c.env && c.env[V.clipEnv]) || []; g.strokeStyle = css.env; g.lineWidth = 1.5; g.beginPath(); if (!pts.length) { g.moveTo(ev.xAt(0), ev.yAt(ev.def)); g.lineTo(ev.xAt(c.len), ev.yAt(ev.def)); } else { g.moveTo(ev.xAt(0), ev.yAt(pts[0].v)); pts.forEach(q => g.lineTo(ev.xAt(q.t), ev.yAt(q.v))); g.lineTo(ev.xAt(c.len), ev.yAt(pts[pts.length - 1].v)); } g.stroke(); g.fillStyle = css.env; pts.forEach(q => { g.beginPath(); g.arc(ev.xAt(q.t), ev.yAt(q.v), 3.5, 0, 7); g.fill(); }); g.font = '10px ' + css.mono; g.fillText(V.clipEnv === 'gain' ? 'Clip gain (dB)' : 'Clip pan', ev.xAt(0) + 4, 26); }
  };
  // clip envelope geometry over the clip region of the waveform
  const envGeo = () => { const r = cv.getBoundingClientRect(), total = s.buf.duration, k = r.width / total, a = srcSecAt(c, c.offset) * k, b = srcSecAt(c, c.offset + c.len) * k, h = r.height, gain = V.clipEnv === 'gain';
    const lo = gain ? -36 : -1, hi = gain ? 6 : 1; return { def: 0, xAt: t => a + (b - a) * (t / c.len), tAt: x => clamp((x - a) / (b - a || 1) * c.len, 0, c.len), yAt: v => 8 + (1 - (clamp(v, lo, hi) - lo) / (hi - lo)) * (h - 16), vAt: y => lo + (1 - clamp((y - 8) / (h - 16), 0, 1)) * (hi - lo) }; };
  // drag start/end markers to change the region
  cv.onpointerdown = e => {
    if (!s) return;
    if (V.clipEnv) { const ev = envGeo(), r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; c.env = c.env || {}; const pts = c.env[V.clipEnv] || (c.env[V.clipEnv] = []);
      let pt = pts.find(q => Math.hypot(ev.xAt(q.t) - x, ev.yAt(q.v) - y) < 7); pushUndo('Clip envelope');
      if (pt && e.detail === 2) { c.env[V.clipEnv] = pts.filter(q => q !== pt); changed(); return; }
      if (!pt) { pt = { t: ev.tAt(x), v: ev.vAt(y) }; pts.push(pt); pts.sort((a, b) => a.t - b.t); }
      cv.setPointerCapture(e.pointerId); cv.onpointermove = m => { pt.t = ev.tAt(m.clientX - r.left); pt.v = ev.vAt(m.clientY - r.top); pts.sort((a, b) => a.t - b.t); drawW(); showTip(m, V.clipEnv === 'gain' ? pt.v.toFixed(1) + ' dB' : (Math.abs(pt.v) < 0.01 ? 'C' : Math.round(Math.abs(pt.v) * 50) + (pt.v < 0 ? 'L' : 'R'))); }; cv.onpointerup = () => { cv.onpointermove = null; hideTip(); changed(); }; drawW(); return; }
    if (V.clipEnv) { const ev = envGeo(), r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; c.env = c.env || {}; const pts = c.env[V.clipEnv] || (c.env[V.clipEnv] = []);
      let pt = pts.find(q => Math.hypot(ev.xAt(q.t) - x, ev.yAt(q.v) - y) < 7); pushUndo('Clip envelope');
      if (pt && e.detail === 2) { c.env[V.clipEnv] = pts.filter(q => q !== pt); changed(); return; }
      if (!pt) { pt = { t: ev.tAt(x), v: ev.vAt(y) }; pts.push(pt); pts.sort((a, b) => a.t - b.t); }
      cv.setPointerCapture(e.pointerId); cv.onpointermove = m => { pt.t = ev.tAt(m.clientX - r.left); pt.v = ev.vAt(m.clientY - r.top); pts.sort((a, b) => a.t - b.t); drawW(); showTip(m, V.clipEnv === 'gain' ? pt.v.toFixed(1) + ' dB' : (Math.abs(pt.v) < 0.01 ? 'C' : Math.round(Math.abs(pt.v) * 50) + (pt.v < 0 ? 'L' : 'R'))); }; cv.onpointerup = () => { cv.onpointermove = null; hideTip(); changed(); }; drawW(); return; }
    const r = cv.getBoundingClientRect(), k = r.width / s.buf.duration, x = e.clientX - r.left, a = srcSecAt(c, c.offset) * k, b = srcSecAt(c, c.offset + c.len) * k;
    const which = Math.abs(x - a) < 8 ? 'a' : Math.abs(x - b) < 8 ? 'b' : null; if (!which) return; pushUndo('Clip region'); cv.setPointerCapture(e.pointerId);
    const secToStep = sec => (c.warp ? sec * c.srcBpm / 15 : sec / clipPitch(c) * S.bpm / 15);
    cv.onpointermove = ev => { const st = secToStep(clamp((ev.clientX - r.left) / k, 0, s.buf.duration)); if (which === 'a') { const end = c.offset + c.len; const d = Math.max(clamp(st, 0, end - 0.25) - c.offset, -c.start); c.offset += d; c.start = Math.max(0, c.start + d); c.len = end - c.offset; } else c.len = Math.max(0.25, st - c.offset); changed(); };
    cv.onpointerup = () => (cv.onpointermove = null);
  };
  VIS.add(() => { if (!cv.isConnected) return false; if (T.playing) drawW(); });
  requestAnimationFrame(drawW);
}

/* ---------- small shared widgets ---------- */
let lastPointer = { clientX: 200, clientY: 200 };
document.addEventListener('pointerdown', e => (lastPointer = e), true);
function popMenu(at, items) {
  const m = $('#menu');
  m.innerHTML = items.map((it, i) => it === '-' ? '<hr>' : it.colors ? `<div class="swatches">${COLORS.map(c => `<button style="background:${c}" data-col="${c}" aria-label="Colour"></button>`).join('')}</div>` : `<button data-mi="${i}" class="${it.danger ? 'danger' : ''}"><span>${esc(it.label)}</span>${it.key ? `<kbd>${it.key}</kbd>` : ''}</button>`).join('');
  m.hidden = false; let x, y;
  if (at && at.clientX != null) { x = at.clientX; y = at.clientY; } else { const r = at.getBoundingClientRect(); x = r.left; y = r.bottom + 4; }
  m.style.left = clamp(x, 8, innerWidth - m.offsetWidth - 8) + 'px'; m.style.top = clamp(y, 8, innerHeight - m.offsetHeight - 8) + 'px';
  m.onclick = e => { const b = e.target.closest('[data-mi]'), c = e.target.closest('[data-col]'); if (b) { m.hidden = true; items[+b.dataset.mi].run(); } if (c) { m.hidden = true; items.find(x => x.colors).colors(c.dataset.col); } };
  setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (!m.contains(e.target)) { m.hidden = true; document.removeEventListener('pointerdown', off, true); } }, true), 0);
}
function askText(title, value, done) {
  const d = $('#ask'); d.hidden = false; $('#askTitle').textContent = title; const i = $('#askInput'); i.value = value; i.focus(); i.select();
  const fin = ok => { d.hidden = true; i.onkeydown = null; $('#askOk').onclick = null; if (ok && i.value.trim()) done(i.value.trim()); };
  i.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') fin(true); if (e.key === 'Escape') fin(false); };
  $('#askOk').onclick = () => fin(true); $('#askCancel').onclick = () => fin(false);
}
function showTip(e, text) { if (GP.tips === false && !(e && e.buttons)) return; const t = $('#tip'); t.hidden = false; t.textContent = text; t.style.left = (e.clientX + 14) + 'px'; t.style.top = (e.clientY - 26) + 'px'; }
function hideTip() { $('#tip').hidden = true; }
