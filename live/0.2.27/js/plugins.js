/* ============ VST3 / Audio Unit plug-ins: device, instrument, cards, browser ============ */
// A plug-in's parameters, as knob definitions (pp<index>, 0..1) for automation, mapping, macros and modulation.
const plugParams = d => (d.p.params || []).filter(q => q.auto !== false).slice(0, 256).map(q => K('pp' + q.index, q.name || 'Param ' + q.index, 0, 1, { fmt: v => Math.round(v * 100) + '%' }));
const devParamDefs = d => (d.type === 'plugin' ? plugParams(d) : DEVICES[d.type].params || []);

// The effect device. While the native engine runs it streams through the plug-in; otherwise it passes audio through.
class PlugDev2 extends Base {
  constructor(d) {
    super(d); this.slot = null; this.node = null;
    const s = NE.on && d.p.ref && PITCH_OK ? (neSlotOf(d.id) || neLoad(d.id, d.p.ref, d.p.state, info => { plugAdopt(d.p, info); ui.detail(); })) : null;
    if (!s) { this.input.connect(this.output); return; }
    this.slot = s.slot;
    this.node = new AudioWorkletNode(ctx, 'gw-plug', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit', processorOptions: { ...NE.L, sab: NE.sab, slotBase: neSlotBase(s.slot), lag: NE.lag, offline: isOffline() } });
    this.input.connect(this.node); this.node.connect(this.output); this._last = {};
  }
  set() { if (this.slot == null || isOffline()) return; const p = this.d.p; for (const k in p) if (k.startsWith('pp') && this._last[k] !== p[k]) { this._last[k] = p[k]; neParam(this.slot, +k.slice(2), p[k]); } }
  dispose() { super.dispose(); if (this.node) try { this.node.disconnect(); } catch (e) { } }
}
DEVICES.plugin.cls = PlugDev2;
function plugAdopt(p, info) { p.name = info.name || p.name; p.vendor = info.vendor; p.params = (info.params || []).map(q => ({ index: q.index, name: q.name, auto: q.auto, def: q.def })); p.latency = info.latency; p.hasEditor = info.hasEditor; if (!p.shown) p.shown = p.params.filter(q => q.auto).slice(0, 8).map(q => q.index); }

// The instrument. Notes go into the slot's event ring with their exact sample position.
class PlugInst {
  constructor(t) {
    this.t = t; this.out = ctx.createGain(); this.slot = null; this.held = new Set();
    const id = 'inst:' + t.id, s = NE.on && t.inst.ref && PITCH_OK ? (neSlotOf(id) || neLoad(id, t.inst.ref, t.inst.state, info => { plugAdopt(t.inst, info); ui.detail(); })) : null;
    if (!s) return; this.slot = s.slot;
    this.node = new AudioWorkletNode(ctx, 'gw-plug', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { ...NE.L, sab: NE.sab, slotBase: neSlotBase(s.slot), lag: NE.lag, offline: isOffline() } });
    this.node.connect(this.out);
  }
  fr(time) { return Math.round(Math.max(time, ctx.currentTime) * ctx.sampleRate); }
  noteOn(note, time, vel, dur) {
    if (this.slot == null) return null; const f = this.fr(time); neEvent(this.slot, f, 0x90, note, clamp(Math.round(vel * 127), 1, 127));
    if (dur != null) neEvent(this.slot, f + Math.max(1, Math.round(dur * ctx.sampleRate)), 0x80, note, 64); else this.held.add(note);
    return { note };
  }
  noteOff(v, time) { if (this.slot == null || !v) return; neEvent(this.slot, this.fr(time), 0x80, v.note, 64); this.held.delete(v.note); }
  allOff(time) { if (this.slot == null) return; const f = this.fr(time); this.held.forEach(n => neEvent(this.slot, f, 0x80, n, 0)); this.held.clear(); neEvent(this.slot, f, 0xb0, 123, 0); neEvent(this.slot, f, 0xb0, 120, 0); }
  update() { }
  dispose() { if (this.node) try { this.node.disconnect(); } catch (e) { } }
}
INST2_CLS.plugin = PlugInst; INST_NAMES.plugin = 'Plug-in';

/* ---------- cards ---------- */
function plugStatusLine(id, p) {
  if (!NE.avail) return IS_DESKTOP ? 'This copy of Studio B is older than the native engine. Download the newest installer once to run plug-ins.' : 'Plug-ins run in the desktop app.';
  if (!NE.avail.ok) return 'The native engine did not load on this computer: ' + (NE.avail.error || '');
  if (!NE.on) return 'Plug-ins need the native audio engine. Turn it on in Settings → Audio.';
  if (!p.ref) return 'Not linked to an installed plug-in yet.';
  const s = neSlotOf(id); if (!s) return 'Not loaded'; if (!s.info) return 'Loading…'; if (!s.info.ok) return s.info.error;
  const lat = (NE.lag * 128 + (s.info.latency || 0)) / LIVE_CTX.sampleRate * 1000; return `${p.ref.format}${p.vendor ? ' · ' + p.vendor : ''} · ${lat.toFixed(1)} ms latency (compensated)`;
}
function plugBody(body, owner, id, p, onKnob, mapPre) {
  const line = document.createElement('p'); line.className = 'plugnote muted'; line.textContent = plugStatusLine(id, p); body.appendChild(line);
  const row = document.createElement('div'); row.className = 'row tight';
  const s = neSlotOf(id);
  if (NE.on && p.ref) {
    const ed = document.createElement('button'); ed.className = 'btn prim tiny'; ed.textContent = 'Open plug-in window'; ed.disabled = !(s && s.info && s.info.ok);
    ed.onclick = async () => { const r = await NATIVE.engine.editor(s.slot, p.name); if (!r.ok) toast(r.error || 'No editor'); }; row.appendChild(ed);
    const pick = document.createElement('button'); pick.className = 'btn ghostb tiny'; pick.textContent = 'Parameters…';
    pick.onclick = e => popMenu(e, (p.params || []).slice(0, 400).map(q => ({ label: ((p.shown || []).includes(q.index) ? '✓ ' : '') + q.name, run: () => { p.shown = p.shown || []; const i = p.shown.indexOf(q.index); if (i >= 0) p.shown.splice(i, 1); else p.shown.push(q.index); ui.detail(); } }))); row.appendChild(pick);
  }
  if (NE.on) { const ch = document.createElement('button'); ch.className = 'btn ghostb tiny'; ch.textContent = p.ref ? 'Replace…' : 'Choose plug-in…'; ch.onclick = e => choosePlugin(e, p.role === 'instrument' || owner.inst === p, ref => { pushUndo('Plug-in'); neFree(id); p.ref = ref; p.name = ref.name; delete p.state; delete p.params; delete p.shown; rebuildAll(); ui.detail(); }, p.name); row.appendChild(ch); }
  body.appendChild(row);
  if (p.params && p.shown && p.shown.length) body.appendChild(paramGrid(p.shown.map(i => (p.params.find(q => q.index === i) || { index: i, name: 'Param ' + i })).map(q => K('pp' + q.index, q.name, 0, 1, { fmt: v => Math.round(v * 100) + '%' })), new Proxy(p, { get: (o, k) => (o[k] != null ? o[k] : (String(k).startsWith('pp') ? ((o.params || []).find(q => 'pp' + q.index === k) || {}).def || 0 : undefined)) }), onKnob, mapPre));
}
function choosePlugin(e, instrument, then, near) {
  const list = nePlugins().filter(x => !!x.instrument === !!instrument).sort((a, b) => (a.vendor || '').localeCompare(b.vendor || '') || a.name.localeCompare(b.name));
  if (!list.length) return popMenu(e, [{ label: 'No plug-ins found yet: scan now', run: () => neScan() }]);
  const best = near ? neFind(near, instrument ? 'instrument' : 'effect') : null;
  popMenu(e, [...(best ? [{ label: `Best match: ${best.name} (${best.format})`, run: () => then(refOf(best)) }, '-'] : []), ...list.slice(0, 300).map(x => ({ label: `${x.name}  ·  ${x.vendor || ''} ${x.format}`, run: () => then(refOf(x)) })), '-', { label: 'Rescan plug-ins', run: () => neScan() }]);
}
// add a plug-in from the browser: effects go on the selected track, instruments get a new MIDI track
function addPlugin(ref, instrument, onto) {
  if (instrument) { pushUndo('Add plug-in instrument'); const t = onto && onto.kind === 'midi' ? onto : addTrack('midi', 'synth'); if (t.inst && t.inst.type === 'plugin') neFree('inst:' + t.id); removeBus(t); t.inst = { type: 'plugin', ref, name: ref.name }; t.name = onto ? t.name : ref.name; buildBus(t, 'track'); routeOut(t); V.selTracks = new Set([t.id]); V.detail = 'devices'; ui.all(); return; }
  const b = onto || busById([...V.selTracks][0]); if (!b) return toast('Select a track first');
  pushUndo('Add plug-in'); b.devices.push(newDevice('plugin', { name: ref.name, format: ref.format, role: 'effect', ref })); rewire(b); V.detail = V.detail === 'clip' ? 'both' : V.detail; ui.detail();
}
// After opening an Ableton set: link plug-in placeholders to installed plug-ins with the same name.
function linkPlaceholders() {
  if (!NE.on) return 0; let n = 0;
  allBuses().forEach(b => {
    b.devices.forEach(d => { if (d.type !== 'plugin' || d.p.ref) return; const m = neFind(d.p.name, d.p.role); if (!m) return;
      if (d.p.role === 'instrument' && b.kind === 'midi') { b.inst = { type: 'plugin', ref: refOf(m), name: m.name, state: d.p.alsState || null }; d._drop = true; }
      else { d.p.ref = refOf(m); if (d.p.alsState) d.p.state = d.p.alsState; } n++; });
    b.devices = b.devices.filter(d => !d._drop);
  });
  if (n) { rebuildAll(); ui.all(); }
  return n;
}
