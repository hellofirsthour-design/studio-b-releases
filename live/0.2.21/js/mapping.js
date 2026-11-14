/* ============ MIDI and key mapping (Ctrl+M / Ctrl+K) ============
   Any element with data-map="<owner>|<target>" can be mapped. Owner is a track/return/main id, or T for the transport.
   Mappings live in the project: S.maps = [{ src: 'cc:<ch>:<n>' | 'note:<ch>:<n>' | 'key:<k>', target, min, max }]. */
V.mapMode = null; V.mapSel = null;
function toggleMap(mode) {
  V.mapMode = V.mapMode === mode ? null : mode; V.mapSel = null;
  document.body.classList.toggle('map-midi', V.mapMode === 'midi'); document.body.classList.toggle('map-key', V.mapMode === 'key');
  $('#mapMidi') && $('#mapMidi').classList.toggle('on', V.mapMode === 'midi'); $('#mapKey') && $('#mapKey').classList.toggle('on', V.mapMode === 'key');
  markMapped(); showMapPanel();
  if (V.mapMode) toast(V.mapMode === 'midi' ? 'MIDI Map: click a control, then move a knob or press a pad on your controller' : 'Key Map: click a control, then press a key');
}
function mapLabel(src) { const [k, a, b] = src.split(':'); return k === 'key' ? a.toUpperCase() : k === 'cc' ? `CC${b}${+a ? ' ch' + (+a + 1) : ''}` : `${noteName(+b)}${+a ? ' ch' + (+a + 1) : ''}`; }
function markMapped() {
  $$('[data-map]').forEach(el => { const m = (S.maps || []).filter(x => x.target === el.dataset.map && (V.mapMode === 'key' ? x.src.startsWith('key:') : V.mapMode === 'midi' ? !x.src.startsWith('key:') : true)); if (m.length) el.dataset.mapped = m.map(x => mapLabel(x.src)).join(' '); else delete el.dataset.mapped; el.classList.toggle('mapsel', el.dataset.map === V.mapSel); });
}
function targetName(t) {
  const [owner, key] = t.split('|'); if (owner === 'T') return 'Transport: ' + key;
  const b = busById(owner); if (!b) return t; if (!key.startsWith('dev:')) return `${b.name}: ${key}`;
  const [, id, k] = key.split(':'), d = findDevice(id, b.devices); const def = d && (DEVICES[d.type].params || []).find(q => q.k === k);
  return `${b.name}: ${d ? (d.type === 'rack' && k.startsWith('m') ? d.p.names[+k.slice(1) - 1] : (DEVICES[d.type].name + ' ' + (def ? def.label : k))) : key}`;
}
function showMapPanel() {
  let pn = $('#mapPanel'); if (!V.mapMode) { if (pn) pn.hidden = true; return; }
  if (!pn) { pn = document.createElement('div'); pn.id = 'mapPanel'; pn.className = 'mappanel'; document.body.appendChild(pn); }
  const list = (S.maps || []).filter(m => V.mapMode === 'key' ? m.src.startsWith('key:') : !m.src.startsWith('key:'));
  pn.hidden = false; pn.innerHTML = `<div class="mphead"><b>${V.mapMode === 'midi' ? 'MIDI Map' : 'Key Map'}</b><button class="ic" data-mx aria-label="Close">✕</button></div>${list.length ? list.map((m, i) => `<div class="mprow"><span class="mpsrc">${esc(mapLabel(m.src))}</span><span class="mptgt">${esc(targetName(m.target))}</span><button class="hb" data-mdel="${S.maps.indexOf(m)}" title="Remove">✕</button></div>`).join('') : '<p class="muted small">Click a highlighted control, then ' + (V.mapMode === 'midi' ? 'move a controller knob or press a pad.' : 'press a key.') + '</p>'}`;
  pn.onclick = e => { if (e.target.closest('[data-mx]')) return toggleMap(V.mapMode); const d = e.target.closest('[data-mdel]'); if (d) { pushUndo('Remove mapping'); S.maps.splice(+d.dataset.mdel, 1); markMapped(); showMapPanel(); } };
}
function assignMap(src) {
  if (!V.mapSel) return false; pushUndo('Map'); S.maps = (S.maps || []).filter(m => m.src !== src && !(m.target === V.mapSel && m.src.split(':')[0] === src.split(':')[0]));
  S.maps.push({ src, target: V.mapSel, min: 0, max: 1 }); toast(`${mapLabel(src)} → ${targetName(V.mapSel)}`); markMapped(); showMapPanel(); return true;
}
// clicks on mappable controls select them instead of acting, while a map mode is on
document.addEventListener('pointerdown', e => {
  if (!V.mapMode) return; const el = e.target.closest('[data-map]'); if (!el || e.target.closest('#mapPanel')) return;
  e.preventDefault(); e.stopPropagation(); V.mapSel = el.dataset.map; markMapped();
}, true);
document.addEventListener('click', e => { if (V.mapMode && e.target.closest('[data-map]') && !e.target.closest('#mapPanel')) { e.preventDefault(); e.stopPropagation(); } }, true);
document.addEventListener('keydown', e => {
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName) && document.activeElement.type !== 'range';
  if (V.mapMode === 'key' && V.mapSel && !typing && !e.ctrlKey && !e.metaKey && e.key.length === 1) { e.preventDefault(); e.stopPropagation(); assignMap('key:' + e.key.toLowerCase()); return; }
  if (V.mapMode || typing || e.ctrlKey || e.metaKey || e.repeat || !S || !S.maps) return;
  const m = S.maps.filter(x => x.src === 'key:' + e.key.toLowerCase()); if (!m.length) return; e.preventDefault(); e.stopPropagation(); m.forEach(x => runMapped(x, null));
}, true);
// incoming MIDI: returns true when the message was used by a mapping (or for learning)
function midiMapIn(data) {
  const [st, n, v] = data, c = st & 0xf0, ch = st & 15; let src = null, val = null;
  if (c === 0xb0) { src = `cc:${ch}:${n}`; val = v / 127; } else if (c === 0x90 && v > 0) { src = `note:${ch}:${n}`; val = null; } else return false;
  if (V.mapMode === 'midi') { if (V.mapSel) assignMap(src); return true; }
  const m = (S.maps || []).filter(x => x.src === src); m.forEach(x => runMapped(x, val)); return m.length > 0;
}
const _mapState = new Map(); let _mapUi = 0;
function runMapped(m, val) { // val 0..1 for knobs and faders; null for a key press or pad (toggle / trigger)
  const [owner, key] = m.target.split('|');
  const el = $(`[data-map="${m.target.replace(/["\\]/g, "\\$&")}"]`);
  if (owner === 'T' || ['mute', 'solo', 'arm'].includes(key)) { // buttons: trigger on press, or when a CC crosses the middle
    if (val != null) { const was = _mapState.get(m.target) || 0; _mapState.set(m.target, val); if (!(was < 0.5 && val >= 0.5)) return; }
    if (el) el.click(); return;
  }
  const b = busById(owner); if (!b) return;
  if (val == null) { const cur = currentParam(b, key), r = mapRange(b, key); val = r && cur > (r.min + r.max) / 2 ? 0 : 1; } // keys toggle between ends
  val = m.min + (m.max - m.min) * val; const r = mapRange(b, key); if (!r) return;
  const x = r.scale === 'log' ? r.min * Math.pow(r.max / r.min, val) : r.min + (r.max - r.min) * val;
  if (key === 'vol' || key === 'pan') { b[key] = x; applyMix(b); }
  else if (sendIndex(key) >= 0) { setSend(b, sendIndex(key), x); applyMix(b); }
  else if (key.startsWith('dev:')) { const [, id, k] = key.split(':'), d = findDevice(id, b.devices); if (!d) return; d.p[k] = r.step ? Math.round(x / r.step) * r.step : x; devRT(d).set(); }
  autoTouch(b, key, x); markDirty(); clearTimeout(_mapUi); _mapUi = setTimeout(() => { if (V.view === 'mix') mixer.render(); ui.headers(); ui.detail(); }, 120);
}
function mapRange(b, key) {
  if (key === 'vol') return { min: 0, max: 1 }; if (key === 'pan') return { min: -1, max: 1 }; if (sendIndex(key) >= 0) return { min: 0, max: 1 };
  if (key.startsWith('dev:')) { const [, id, k] = key.split(':'), d = findDevice(id, b.devices); const def = d && (DEVICES[d.type].params || []).find(q => q.k === k); return def && def.min != null ? def : null; }
  return null;
}
