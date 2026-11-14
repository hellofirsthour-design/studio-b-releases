/* ============ UI shell: transport, track headers, detail view, menus ============ */
const ui = {
  all() { ui.transport(); ui.headers(); ui.detail(); arr.draw(); ui.title(); browser.render(); if (V.view === 'mix') mixer.render(); },
  title() { const t = `${S.name}${V.dirty ? ' *' : ''} — Studio B`; document.title = t; if (IS_DESKTOP) NATIVE.setTitle(t); $('#projName').textContent = S.name + (V.dirty ? ' •' : ''); },
  transport() {
    if (document.activeElement !== $('#bpm')) $('#bpm').value = S.bpm;
    $('#play').classList.toggle('on', T.playing); $('#rec').classList.toggle('on', T.rec);
    $('#metro').classList.toggle('on', !!S.metro); $('#loopBtn').classList.toggle('on', S.loop.on);
    $('#follow').classList.toggle('on', V.follow); $('#autoBtn').classList.toggle('on', V.autoMode);
    $('#root').value = S.root; $('#scale').value = S.scale; $('#snapBtn').classList.toggle('on', V.snap);
    $('#sig').value = SIG().join('/'); { const ci = (S.prefs && S.prefs.countIn) || 0; $('#countIn').classList.toggle('on', !!ci); $('#countIn .badge').textContent = ci ? String(ci) : ''; $('#countIn').title = ci ? `Count-in: ${ci} bar${ci > 1 ? 's' : ''} before recording. Click to change.` : 'Count-in before recording: off. Click to turn on.'; } S.punch = S.punch || {}; $('#punchIn').classList.toggle('on', !!S.punch.in); $('#punchOut').classList.toggle('on', !!S.punch.out);
    const nb = SIG()[0], beats = $('#beats'); if (beats.children.length !== Math.min(nb, 12)) beats.innerHTML = '<i></i>'.repeat(Math.min(nb, 12));
    $('#loopStart').textContent = barsBeats(S.loop.start); $('#loopLen').textContent = barsBeatsLen(S.loop.end - S.loop.start);
    $('#app').classList.toggle('nobrowser', !V.browser);
  },
  headers() {
    arr.layout(); const box = $('#hdrInner'); let h = '';
    arr.rows.forEach(r => {
      if (r.kind === 'take') { h += `<div class="hdr take" data-id="${r.b.id}" data-lane="${r.lane.id}" style="top:${r.y}px;height:${r.h}px;--tc:${r.b.color}"><i class="hcol dim"></i><div class="hmain"><div class="hrow"><span class="hname tname" title="Drag across a take (or click it) to comp it onto the track">${esc(r.lane.name)}</span><button class="hb" data-h="compAll" title="Use this whole take">Use</button><button class="hb" data-h="delTake" title="Delete this take lane">✕</button></div></div></div>`; return; }
      const b = r.b, isT = r.kind === 'track', sel = V.selTracks.has(b.id), num = isT ? S.tracks.indexOf(b) + 1 : r.kind === 'return' ? 'AB'[S.returns.indexOf(b)] || 'R' : 'M';
      const big = r.h >= 50, params = V.autoMode ? autoParams(b) : null;
      h += `<div class="hdr ${sel ? 'sel' : ''} ${r.kind}" data-id="${b.id}" style="top:${r.y}px;height:${r.h}px;--tc:${b.color || '#a7a3b8'}">
        <i class="hcol"></i>
        <div class="hmain">
          <div class="hrow"><span class="hname" title="Double-click to rename">${esc(b.name)}</span>
            ${r.kind !== 'master' ? `<button class="hb act ${b.mute ? '' : 'on'}" data-h="mute" title="Track activator">${num}</button>` : ''}
            ${isT ? `<button class="hb solo ${b.solo ? 'on' : ''}" data-h="solo" title="Solo">S</button><button class="hb arm ${b.arm ? 'on' : ''}" data-h="arm" title="Arm recording">●</button>` : ''}${isT && b.takes && b.takes.length ? `<button class="hb tk ${b.showTakes ? 'on' : ''}" data-h="takes" title="Show or hide take lanes">T${b.takes.length}</button>` : ''}${isT && b.frozen ? '<span class="frz" title="Frozen">❄</span>' : ''}
          </div>
          ${big ? (V.autoMode ? `<div class="hrow"><select class="dd hauto" data-h="autoShow" aria-label="Automation parameter">${params.map(p => `<option value="${p.key}" ${p.key === (b.autoShow || 'vol') ? 'selected' : ''}>${b.auto[p.key] && b.auto[p.key].length ? '● ' : ''}${esc(p.label)}</option>`).join('')}</select>${b.auto[b.autoShow || 'vol'] && b.auto[b.autoShow || 'vol'].length ? '<button class="hb" data-h="clearAuto" title="Delete this automation">✕</button>' : ''}</div>`
          : `<div class="hrow">${isT && b.kind === 'audio' ? `<span class="mon seg">${['in', 'auto', 'off'].map(m => `<button data-h="mon" data-m="${m}" class="${b.monitor === m ? 'on' : ''}">${m === 'in' ? 'In' : m === 'auto' ? 'Auto' : 'Off'}</button>`).join('')}</span>` : isT ? `<span class="itype">${{ synth: 'Contour', drums: 'Kit', sampler: 'Cutline' }[b.inst.type]}</span>` : ''}
              <input type="range" class="hvol" min="0" max="1" step="0.001" value="${b.vol}" data-h="vol" aria-label="${esc(b.name)} volume"><span class="hdb" data-db="${b.id}">${faderDb(b.vol)}</span></div>`) : ''}
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
      h.onpointermove = ev => { b.h = clamp(h0 + ev.clientY - y0, 22, 320); arr.layout(); $$('.hdr', box).forEach(el => { const r = arr.rows.find(q => q.b.id === el.dataset.id); el.style.top = r.y + 'px'; el.style.height = r.h + 'px'; }); arr.draw(); };
      h.onpointerup = () => { h.onpointermove = null; ui.headers(); }; return;
    }
    if (h && h.tagName !== 'DIV') return;
    if (e.shiftKey || e.ctrlKey || e.metaKey) V.selTracks.add(b.id); else V.selTracks = new Set([b.id]);
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
      case 'clearAuto': pushUndo('Clear automation'); delete b.auto[b.autoShow || 'vol']; releaseAutomation(); _tmKey = ''; break;
      case 'takes': b.showTakes = !b.showTakes; break;
      case 'compAll': { const lane = b.takes.find(l => l.id === hd.dataset.lane); const a = Math.min(...lane.clips.map(c => c.start)), z = Math.max(...lane.clips.map(c => c.start + c.len)); compRange(b, lane, a, z); break; }
      case 'delTake': pushUndo('Delete take'); b.takes = b.takes.filter(l => l.id !== hd.dataset.lane); if (!b.takes.length) b.showTakes = false; break;
      default: return;
    }
    applyAllMix(); markDirty(); ui.headers();
  });
  box.addEventListener('input', e => {
    const h = e.target.closest('[data-h]'), hd = e.target.closest('.hdr'); if (!h || !hd) return; const b = busById(hd.dataset.id), k = h.dataset.h;
    if (['vol', 'pan', 'sendA', 'sendB'].includes(k)) { b[k] = +h.value; applyMix(b); if (b === S.master) rewireMaster(); const db = $(`[data-db="${b.id}"]`); if (db) db.textContent = faderDb(b.vol); markDirty(); showTip(e, k === 'vol' ? faderDb(b.vol) + ' dB' : k === 'pan' ? (Math.abs(b.pan) < 0.01 ? 'C' : Math.round(Math.abs(b.pan) * 50) + (b.pan < 0 ? 'L' : 'R')) : Math.round(b[k] * 100) + '%'); }
  });
  box.addEventListener('change', e => { hideTip(); const h = e.target.closest('[data-h]'), hd = e.target.closest('.hdr'); if (h && h.dataset.h === 'autoShow') { busById(hd.dataset.id).autoShow = h.value; ui.headers(); } });
  box.addEventListener('dblclick', e => {
    const hd = e.target.closest('.hdr'); if (!hd) return; const b = busById(hd.dataset.id);
    if (hd.dataset.lane && e.target.closest('.hname')) { const lane = b.takes.find(l => l.id === hd.dataset.lane); return askText('Take name', lane.name, v => { pushUndo('Rename take'); lane.name = v; ui.headers(); }); }
    if (e.target.closest('.hname')) askText('Track name', b.name, v => { pushUndo('Rename'); b.name = v; ui.headers(); ui.detail(); });
    if (e.target.closest('.hvol')) { b.vol = 0.79; applyMix(b); ui.headers(); }
  });
  box.addEventListener('contextmenu', e => {
    const hd = e.target.closest('.hdr'); if (!hd) return; e.preventDefault(); const b = busById(hd.dataset.id); const isT = S.tracks.includes(b);
    if (hd.dataset.lane) return;
    const items = [{ label: 'Rename', key: 'Ctrl+R', run: () => askText('Track name', b.name, v => { pushUndo(); b.name = v; ui.headers(); }) }];
    if (isT) items.push({ label: 'Select all clips on track', run: () => selectTrackClips(b) });
    if (isT) items.push({ label: 'Duplicate track', run: () => duplicateTrack(b) }, { label: 'Delete track', danger: true, run: () => deleteTrack(b) }, { colors: c => { pushUndo(); b.color = c; ui.all(); } });
    if (isT) items.push('-', ...trackRenderMenu(b));
    if (isT && b.takes && b.takes.length) items.push({ label: b.showTakes ? 'Hide take lanes' : 'Show take lanes', run: () => { b.showTakes = !b.showTakes; ui.headers(); } });
    if (isT && b.kind === 'audio') items.push('-', { label: 'Choose input…', run: () => chooseInput(b) });
    if (S.returns.includes(b)) items.push({ label: 'Delete return', danger: true, run: () => { if (S.returns.length <= 1) return toast('Keep at least one return'); pushUndo(); S.returns = S.returns.filter(r => r !== b); rebuildAll(); ui.all(); } });
    items.push('-', { label: 'Show automation', run: () => { V.autoMode = true; ui.all(); } }, { label: 'Fold to small height', run: () => { b.h = 26; ui.headers(); } }, { label: 'Make tall', run: () => { b.h = 110; ui.headers(); } });
    popMenu(e, items);
  });
  box.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('sb/device') || e.dataTransfer.types.includes('sb/inst')) e.preventDefault(); });
  box.addEventListener('drop', e => { const hd = e.target.closest('.hdr'); if (!hd) return; e.preventDefault(); const b = busById(hd.dataset.id); const d = e.dataTransfer.getData('sb/device'), i = e.dataTransfer.getData('sb/inst');
    if (d) { pushUndo('Add device'); b.devices.push(newDevice(d)); rewire(b); V.selTracks = new Set([b.id]); V.detail = 'devices'; ui.all(); }
    if (i && b.kind === 'midi') addInstrumentTrack(i, b); });
}
function duplicateTrack(t) { pushUndo('Duplicate track'); const c = deep(t); c.id = uid(); c.name = t.name + ' copy'; c.arm = false; c.devices.forEach(d => (d.id = uid())); c.clips.forEach(k => (k.id = uid())); S.tracks.splice(S.tracks.indexOf(t) + 1, 0, c); buildBus(c, 'track'); V.selTracks = new Set([c.id]); ui.all(); }
function deleteTrack(t) { pushUndo('Delete track'); removeBus(t); S.tracks = S.tracks.filter(x => x !== t); if (V.editClip && !clipById(V.editClip)) V.editClip = null; applyAllMix(); ui.all(); }
function addTrack(kind, instType) { pushUndo('Insert track'); const t = newTrack(kind, instType); const after = S.tracks.findIndex(x => V.selTracks.has(x.id)); S.tracks.splice(after >= 0 ? after + 1 : S.tracks.length, 0, t); buildBus(t, 'track'); V.selTracks = new Set([t.id]); ui.all(); return t; }
function addInstrumentTrack(spec, onto) { // spec: "synth", "drums", "sampler" or "synth:Preset"
  const [type, preset] = spec.split(':');
  if (onto) { pushUndo('Replace instrument'); removeBus(onto); onto.inst = newInst(type); if (preset) Object.assign(onto.inst, SYNTH_PRESETS[preset], { preset }); buildBus(onto, 'track'); V.selTracks = new Set([onto.id]); V.detail = 'devices'; ui.all(); return; }
  const t = addTrack('midi', type); if (preset) { Object.assign(t.inst, SYNTH_DEFAULT, SYNTH_PRESETS[preset], { preset }); t.name = preset; RT.get(t.id).inst.update(); }
  V.detail = 'devices'; ui.all();
}
async function chooseInput(t) {
  let devs = []; try { await getInput(t.input); devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput'); } catch (e) { return toast('No audio input is available. Check microphone permission.'); }
  popMenu(lastPointer, devs.map(d => ({ label: (d.deviceId === t.input ? '✓ ' : '') + (d.label || 'Input ' + d.deviceId.slice(0, 5)), run: async () => { t.input = d.deviceId; try { await getInput(d.deviceId); connectInputs(); toast('Input: ' + d.label); } catch (e) { toast('That input could not be opened'); } } })));
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
  const ctl = $('.aedctl', pane), changed = () => { markDirty(); arr.draw(); drawW(); if (T.playing) play(nowPos()); };
  const wrapK = (o, lbl) => { const d = document.createElement('div'); d.className = 'kgroup'; d.innerHTML = `<span class="lab">${lbl}</span>`; d.appendChild(o); return d; };
  ctl.appendChild(toggleEl('Warp', c.warp, v => { pushUndo('Warp'); c.warp = v; if (v) { c.srcBpm = c.srcBpm || (s && s.bpm) || S.bpm; } changed(); audioEditor(c); }));
  if (c.warp) {
    const bpmIn = document.createElement('label'); bpmIn.className = 'chip'; bpmIn.innerHTML = `<span>Clip BPM</span><input type="number" min="20" max="400" step="0.01" value="${+c.srcBpm.toFixed(2)}" aria-label="Clip tempo">`;
    bpmIn.querySelector('input').onchange = e => { pushUndo('Clip BPM'); c.srcBpm = clamp(+e.target.value || c.srcBpm, 20, 400); changed(); }; ctl.appendChild(bpmIn);
    const half = document.createElement('button'); half.className = 'btn ghostb tiny'; half.textContent = '÷2'; half.onclick = () => { pushUndo(); c.srcBpm /= 2; changed(); audioEditor(c); };
    const dbl = document.createElement('button'); dbl.className = 'btn ghostb tiny'; dbl.textContent = '×2'; dbl.onclick = () => { pushUndo(); c.srcBpm *= 2; changed(); audioEditor(c); };
    ctl.append(half, dbl);
  }
  ctl.appendChild(knob({ label: 'Gain', value: c.gain, min: -36, max: 24, def: 0, fmt: fDb, onInput: v => { c.gain = v; changed(); } }));
  ctl.appendChild(knob({ label: 'Transpose', value: c.semis, min: -24, max: 24, step: 1, def: 0, fmt: v => (v > 0 ? '+' : '') + v + ' st', onInput: v => { c.semis = v; changed(); } }));
  ctl.appendChild(knob({ label: 'Detune', value: c.cents || 0, min: -50, max: 50, step: 1, def: 0, fmt: v => (v > 0 ? '+' : '') + v + ' ct', onInput: v => { c.cents = v; changed(); } }));
  const rv = document.createElement('button'); rv.className = 'btn ghostb'; rv.textContent = c.revOf ? 'Un-reverse' : 'Reverse'; rv.onclick = () => { V.selClips = new Set([c.id]); reverseClips(); }; ctl.appendChild(rv);
  ctl.appendChild(knob({ label: 'Fade in', value: c.fadeIn, min: 0, max: Math.max(0.25, c.len / 2), def: 0, fmt: v => barsBeatsLen(v), onInput: v => { c.fadeIn = v; changed(); } }));
  ctl.appendChild(knob({ label: 'Fade out', value: c.fadeOut, min: 0, max: Math.max(0.25, c.len / 2), def: 0, fmt: v => barsBeatsLen(v), onInput: v => { c.fadeOut = v; changed(); } }));
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
    if (T.playing) { const p = nowPos(); if (p >= c.start && p < c.start + c.len) { g.fillStyle = css.playhead; g.fillRect(srcSecAt(c, p - c.start + c.offset) * k, 0, 1.5, h); } }
  };
  // drag start/end markers to change the region
  cv.onpointerdown = e => {
    const r = cv.getBoundingClientRect(), k = r.width / s.buf.duration, x = e.clientX - r.left, a = srcSecAt(c, c.offset) * k, b = srcSecAt(c, c.offset + c.len) * k;
    const which = Math.abs(x - a) < 8 ? 'a' : Math.abs(x - b) < 8 ? 'b' : null; if (!which) return; pushUndo('Clip region'); cv.setPointerCapture(e.pointerId);
    const secToStep = sec => (c.warp ? sec * c.srcBpm / 15 : sec / clipPitch(c) * S.bpm / 15);
    cv.onpointermove = ev => { const st = secToStep(clamp((ev.clientX - r.left) / k, 0, s.buf.duration)); if (which === 'a') { const end = c.offset + c.len; const d = clamp(st, 0, end - 0.25) - c.offset; c.offset += d; c.start = Math.max(0, c.start + d); c.len = end - c.offset; } else c.len = Math.max(0.25, st - c.offset); changed(); };
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
function showTip(e, text) { const t = $('#tip'); t.hidden = false; t.textContent = text; t.style.left = (e.clientX + 14) + 'px'; t.style.top = (e.clientY - 26) + 'px'; }
function hideTip() { $('#tip').hidden = true; }
