/* ============ Native audio engine (desktop, Studio B 0.3+) and audio I/O routing ============
   The Web Audio graph still does the mixing. With the native engine on, its output (and any tracks routed to
   other outputs) streams through a SharedArrayBuffer to the main process, which plays it on the chosen driver and
   device, returns the device's inputs, and runs VST3 / Audio Unit plug-ins. Without it, everything plays through
   the browser's own output, as before. */

/* ---------- I/O: stable nodes that tracks connect to, rewired when the device changes ---------- */
const IO = { main: null, cue: null, native: false, outCh: 2, inCh: 0, merger: null, inSplit: null, ext: new Map(), extIn: new Map(), keep: [] };
function ioInit() { IO.main = LIVE_CTX.createGain(); IO.cue = LIVE_CTX.createGain(); ioWire(); }
const liveOut = which => (isOffline() ? ctx.destination : which === 'cue' ? IO.cue : IO.main);
// "ext:3" is the output (or input) pair 3/4, "extm:3" is channel 3 alone
const extParse = spec => { const m = /^ext(m?):(\d+)$/.exec(spec || ''); return m ? { mono: !!m[1], ch: +m[2] } : null; };
const extLabel = (spec, dir) => { const p = extParse(spec); if (!p) return ''; return `${dir === 'in' ? 'In' : 'Out'} ${p.mono ? p.ch : p.ch + '/' + (p.ch + 1)}`; };
function ioWire() {
  [IO.main, IO.cue, ...IO.ext.values()].forEach(n => { try { n.disconnect(); } catch (e) { } });
  IO.keep.forEach(n => { try { n.disconnect(); } catch (e) { } }); IO.keep = [];
  if (!IO.native) { IO.main.connect(LIVE_CTX.destination); IO.cue.connect(LIVE_CTX.destination); IO.outCh = 2; return; }
  IO.merger = LIVE_CTX.createChannelMerger(IO.outCh); IO.merger.connect(NE.outNode); IO.keep.push(IO.merger);
  const toPair = (node, spec) => { const p = extParse(spec); if (!p || p.ch > IO.outCh) return false;
    if (p.mono) { const g = LIVE_CTX.createGain(); g.channelCount = 1; g.channelCountMode = 'explicit'; node.connect(g); g.connect(IO.merger, 0, p.ch - 1); IO.keep.push(g); return true; }
    const sp = LIVE_CTX.createChannelSplitter(2); node.connect(sp); sp.connect(IO.merger, 0, p.ch - 1); if (p.ch < IO.outCh) sp.connect(IO.merger, 1, p.ch); IO.keep.push(sp); return true; };
  toPair(IO.main, GP.mainOut || 'ext:1'); toPair(IO.cue, GP.cueOut || GP.mainOut || 'ext:1');
  IO.ext.forEach((node, spec) => toPair(node, spec));
  // inputs
  IO.extIn.forEach(n => { try { n.disconnect(); } catch (e) { } });
  if (IO.inSplit) { try { IO.inSplit.disconnect(); } catch (e) { } IO.inSplit = null; }
  if (NE.inNode && IO.inCh) { IO.inSplit = LIVE_CTX.createChannelSplitter(IO.inCh); NE.inNode.connect(IO.inSplit); IO.extIn.forEach((n, spec) => feedIn(n, spec)); }
}
// a stable node for tracks routed to an external output (only meaningful with the native engine)
function extOutNode(spec) { if (isOffline()) return null; let n = IO.ext.get(spec); if (!n) { n = LIVE_CTX.createGain(); IO.ext.set(spec, n); ioWire(); } return n; }
function feedIn(node, spec) { const p = extParse(spec); if (!p || !IO.inSplit || p.ch > IO.inCh) return; const m = node._m; IO.inSplit.connect(m, p.ch - 1, 0); IO.inSplit.connect(m, p.mono || p.ch >= IO.inCh ? p.ch - 1 : p.ch, 1); }
function extInNode(spec) { let n = IO.extIn.get(spec); if (!n) { n = LIVE_CTX.createGain(); n._m = LIVE_CTX.createChannelMerger(2); n._m.connect(n); IO.extIn.set(spec, n); feedIn(n, spec); } return n; }
function outChoices() { const out = []; for (let c = 1; c <= IO.outCh; c += 2) out.push(['ext:' + c, `Out ${c}/${Math.min(c + 1, IO.outCh)}`]); for (let c = 1; c <= IO.outCh; c++) out.push(['extm:' + c, `Out ${c} (mono)`]); return out; }
function inChoices() { const out = []; for (let c = 1; c <= IO.inCh; c += 2) out.push(['ext:' + c, `In ${c}/${Math.min(c + 1, IO.inCh)}`]); for (let c = 1; c <= IO.inCh; c++) out.push(['extm:' + c, `In ${c} (mono)`]); return out; }

/* ---------- the engine ---------- */
const NE = { avail: null, on: false, L: null, sab: null, I: null, worker: null, dev: null, outNode: null, inNode: null, keep: null, error: null,
  slots: new Map(), free: [...Array(64).keys()], catalog: { vst3: [], au: [], failed: [] }, lag: 3 };
const neSlotBase = slot => NE.L.header + 2 * NE.L.ring * NE.L.maxCh + slot * NE.L.slotWords;
async function neInit() {
  if (!IS_DESKTOP || !NATIVE.engine) return false;
  try { NE.avail = await NATIVE.engine.available(); } catch (e) { return false; }
  if (!NE.avail.ok) { console.warn('native engine unavailable:', NE.avail.error); return false; }
  NE.L = NE.avail.layout; NE.lag = GP.plugLag || 3;
  try { NE.catalog = await NATIVE.engine.plugins(); } catch (e) { }
  NATIVE.engine.onScan(p => showBusy(`Scanning plug-ins… ${p.done} of ${p.total}: ${p.name}`));
  if (GP.engine === 'web') return false;
  return neStart();
}
function neDefaultBackend() { const b = NE.avail.backends.filter(x => x.id !== 'null'); return (b.find(x => x.id === GP.driver) || b.find(x => x.id === 'coreaudio') || b.find(x => x.id === 'wasapi') || b.find(x => x.id === 'jack') || b[0] || NE.avail.backends[0]).id; }
async function neStart() {
  const backend = GP.driver && NE.avail.backends.some(b => b.id === GP.driver) ? GP.driver : neDefaultBackend();
  const r = await NATIVE.engine.open({ backend, output: GP.outName || '', input: GP.inId === 'none' ? 'none' : (GP.inName || ''), sampleRate: GP.sr || LIVE_CTX.sampleRate, buffer: GP.buffer || 256, rendererRate: LIVE_CTX.sampleRate });
  if (!r.ok) { NE.error = r.error; toast('Native audio: ' + r.error.replace(/\.?$/, '.') + ' Using the built-in engine for now.', 6000); return false; }
  NE.dev = { ...r, backend }; NE.error = null;
  if (!NE.sab) {
    NE.sab = new SharedArrayBuffer(NE.L.bytes); NE.I = new Int32Array(NE.sab);
    NE.worker = new Worker('js/engine-worker.js');
    const ok = await new Promise(res => { NE.worker.onmessage = e => { if (e.data.type === 'attached') res(e.data.ok); else if (e.data.type === 'error') console.warn('engine worker:', e.data.message); }; NE.worker.postMessage({ type: 'attach', shm: r.shm, sab: NE.sab, addon: NE.avail.addon }); setTimeout(() => res(false), 5000); });
    if (!ok) { toast('The native engine could not connect. Using the built-in engine.'); NATIVE.engine.close(); NE.sab = null; return false; }
  }
  NE.I[4] = r.outputs; NE.I[5] = Math.max(1, r.inputs);
  const opt = { sab: NE.sab, ring: NE.L.ring, header: NE.L.header, maxCh: NE.L.maxCh };
  neRetire();   // the previous device's nodes must stop writing into the shared buffer, or the device hears them all at once
  NE.outNode = new AudioWorkletNode(LIVE_CTX, 'gw-out', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1], channelCount: r.outputs, channelCountMode: 'explicit', channelInterpretation: 'discrete', processorOptions: opt });
  NE.keep = NE.keep || LIVE_CTX.createGain(); NE.keep.gain.value = 0; NE.outNode.connect(NE.keep); NE.keep.connect(LIVE_CTX.destination);   // keeps the worklet running
  NE.inNode = r.inputs ? new AudioWorkletNode(LIVE_CTX, 'gw-in', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [r.inputs], processorOptions: opt }) : null;
  if (NE.inNode) NE.inNode.connect(NE.keep);
  try { if (LIVE_CTX.setSinkId) await LIVE_CTX.setSinkId({ type: 'none' }); } catch (e) { }
  IO.native = true; IO.outCh = r.outputs; IO.inCh = r.inputs; ioWire();
  NE.on = true; S.tracks.forEach(routeOut); connectInputs(); neSyncProject(); neTransport();
  return true;
}
function neRetire() { [NE.outNode, NE.inNode].forEach(n => { if (!n) return; try { n.port.postMessage('stop'); } catch (e) { } try { n.disconnect(); } catch (e) { } }); NE.outNode = NE.inNode = null; }
async function neStop() {
  neRetire(); NE.on = false; IO.native = false; IO.outCh = 2; IO.inCh = 0; ioWire();
  try { if (LIVE_CTX.setSinkId) await LIVE_CTX.setSinkId(GP.outId || ''); } catch (e) { }
  await NATIVE.engine.close(); S.tracks.forEach(routeOut); connectInputs();
}
async function neRestart() { if (NE.on) { await NATIVE.engine.close(); NE.on = false; } return neStart(); }
function neStatus() { return NE.on ? NATIVE.engine.status() : Promise.resolve(null); }
// song position for tempo-synced plug-ins
function neTransport() {
  if (!NE.on || !NE.worker) return; const sr = LIVE_CTX.sampleRate, now = LIVE_CTX.currentTime, p = T.playing ? nowPos() : V.insert;
  NE.worker.postMessage({ type: 'tr', bpm: bpmAt(p), ppq: p / 4, frame: Math.round(now * sr), playing: !!T.playing, num: SIG()[0], den: SIG()[1] });
}
setInterval(() => { if (NE.on && T.playing) neTransport(); }, 250);

/* ---------- plug-in slots ---------- */
const neSlotOf = id => NE.slots.get(id);
function neAlloc(id) { let s = NE.slots.get(id); if (!s) { const slot = NE.free.shift(); if (slot == null) return null; s = { id, slot, info: null, ready: false, loading: null }; NE.slots.set(id, s); } return s; }
// Load a plug-in for a device (or a track's instrument). ref: { format, uid, path, name }. state: base64 or null.
function neLoad(id, ref, state, onReady) {
  const s = neAlloc(id); if (!s) { toast('Studio B can run up to 64 plug-ins at once'); return null; }
  if (s.loading && s.refKey === ref.format + ref.uid) return s;
  s.refKey = ref.format + ref.uid; s.ready = false; Atomics.store(NE.I, neSlotBase(s.slot) + 4, 0);
  s.loading = NATIVE.engine.load(s.slot, ref, state || null, LIVE_CTX.sampleRate).then(r => {
    s.info = r; if (!r.ok) { toast(`${ref.name || 'Plug-in'}: ${r.error}`, 6000); return; }
    NE.worker.postMessage({ type: 'reset', slot: s.slot }); Atomics.store(NE.I, neSlotBase(s.slot) + 4, 1); s.ready = true;
    onReady && onReady(r); schedulePDC();
  });
  return s;
}
function neFree(id) { const s = NE.slots.get(id); if (!s) return; Atomics.store(NE.I, neSlotBase(s.slot) + 4, 0); NATIVE.engine.unload(s.slot); NE.slots.delete(id); NE.free.push(s.slot); }
function neEvent(slot, frame, st, d1, d2) { // into the slot's event ring; its worklet places it in the right block
  const b = neSlotBase(slot), I = NE.I, cap = NE.L.evCap, w = Atomics.load(I, b + 8) >>> 0, r = Atomics.load(I, b + 9) >>> 0; if (((w - r) >>> 0) >= cap) return;
  const e = b + NE.L.slotHeader + (w & (cap - 1)) * 4; frame = Math.max(0, Math.round(frame)); I[e] = frame % 4294967296 | 0; I[e + 1] = Math.floor(frame / 4294967296); I[e + 2] = (st & 255) | ((d1 & 255) << 8) | ((d2 & 255) << 16);
  Atomics.store(I, b + 8, (w + 1) | 0);
}
function neParam(slot, index, value) { if (NE.worker) NE.worker.postMessage({ type: 'par', slot, frame: 0, index, value: clamp(value, 0, 1) }); }
async function neSaveStates() { // plug-in settings go into the project when you save
  if (!NE.on) return; const all = neProjectPlugins();
  for (const x of all) { const s = NE.slots.get(x.id); if (!s || !s.ready) continue; try { const st = await NATIVE.engine.getState(s.slot); if (st) x.holder.state = st; } catch (e) { } }
}
// every plug-in in the project: devices (inside racks too) and plug-in instruments
function neProjectPlugins() {
  const out = []; const walk = list => list.forEach(d => { if (d.type === 'plugin' && d.p.ref) out.push({ id: d.id, holder: d.p, ref: d.p.ref }); if (d.type === 'rack') d.p.chains.forEach(c => walk(c.devices)); });
  allBuses().forEach(b => { walk(b.devices); if (b.inst && b.inst.type === 'plugin' && b.inst.ref) out.push({ id: 'inst:' + b.id, holder: b.inst, ref: b.inst.ref }); });
  return out;
}
function neSyncProject() { if (!NE.on) return; const want = neProjectPlugins(), ids = new Set(want.map(x => x.id)); [...NE.slots.keys()].forEach(id => { if (!ids.has(id)) neFree(id); }); want.forEach(x => { const s = NE.slots.get(x.id); if (!s) neLoad(x.id, x.ref, x.holder.state, () => { rebuildAll(); ui.detail(); }); }); }
async function neRenderBegin() { if (!NE.on) return; for (const s of NE.slots.values()) { const b = neSlotBase(s.slot); Atomics.store(NE.I, b + 9, Atomics.load(NE.I, b + 8)); NE.worker.postMessage({ type: 'reset', slot: s.slot }); await NATIVE.engine.reset(s.slot); } }
async function neRenderEnd() { return neRenderBegin(); }

/* ---------- the catalog of scanned plug-ins ---------- */
const nePlugins = () => [...(NE.catalog.vst3 || []), ...(NE.catalog.au || [])];
async function neScan() {
  if (!NE.avail || !NE.avail.ok) return toast('Plug-in scanning needs the desktop app with the native engine');
  showBusy('Scanning plug-ins…');
  try { NE.catalog = await NATIVE.engine.scan({ folders: GP.vst3Folders || [], au: GP.useAU !== false, vst3: GP.useVST3 !== false }); toast(`Found ${nePlugins().length} plug-ins${NE.catalog.failed.length ? `, ${NE.catalog.failed.length} could not load` : ''}`); }
  finally { showBusy(null); }
  browser.render && browser.render();
}
// best match for a plug-in name from an Ableton set
function neFind(name, role) {
  const n = String(name || '').toLowerCase().replace(/\s*\((vst3?|au)\)$/, '').trim(); if (!n) return null;
  const all = nePlugins().filter(p => role === 'instrument' ? p.instrument : true), pref = p => (p.format === 'VST3' ? 0 : 1);
  return all.filter(p => p.name.toLowerCase() === n).sort((a, b) => pref(a) - pref(b))[0] || all.filter(p => p.name.toLowerCase().startsWith(n) || n.startsWith(p.name.toLowerCase())).sort((a, b) => pref(a) - pref(b))[0] || null;
}
const refOf = p => ({ format: p.format, uid: p.uid, path: p.path || '', name: p.name, vendor: p.vendor });

/* ---------- plug-in delay compensation ---------- */
let _pdcT = 0; function schedulePDC() { clearTimeout(_pdcT); _pdcT = setTimeout(applyPDC, 30); }
const sr0 = () => LIVE_CTX.sampleRate;
function devLatency(d) { // seconds this device delays its signal
  if (!d.on) return 0;
  if (d.type === 'plugin') { const s = NE.on && NE.slots.get(d.id); if (!s) return 0; return (NE.lag * 128 + (s.ready ? (NE.I[neSlotBase(s.slot) + 6] | 0) : 0)) / sr0(); }
  if (d.type === 'rack') return Math.max(0, ...d.p.chains.map(c => c.devices.reduce((a, x) => a + devLatency(x), 0)));
  return 0;
}
function busLatency(b) { let l = b.devices.reduce((a, d) => a + devLatency(d), 0); if (b.inst && b.inst.type === 'plugin' && NE.on) { const s = NE.slots.get('inst:' + b.id); if (s) l += (NE.lag * 128 + (s.ready ? NE.I[neSlotBase(s.slot) + 6] | 0 : 0)) / sr0(); } return l; }
// Tracks are delayed so every path reaches the main output at the same moment; returns are lined up the same way.
function applyPDC() {
  const on = GP.pdc !== false; const path = t => busLatency(t) + ancestors(t).reduce((a, g) => a + busLatency(g), 0);
  const leaves = S.tracks.filter(t => t.kind !== 'group'), maxT = on ? Math.max(0, ...leaves.map(path)) : 0, maxR = on ? Math.max(0, ...S.returns.map(busLatency)) : 0;
  S.tracks.forEach(t => (t._pdc = on && t.kind !== 'group' ? maxT - path(t) : 0));
  S.returns.forEach(r => (r._pdc = on ? maxR - busLatency(r) : 0));
  if (M.direct) M.direct.delayTime.value = Math.min(1.9, on ? maxR : 0);
  NE.pdcTotal = maxT + maxR; applyAllMix();
}

/* ---------- Audio From / Audio To ---------- */
const outLabel = b => (b.out === 'none' ? 'No Output' : extParse(b.out) ? extLabel(b.out, 'out') : groupOf(b) ? groupOf(b).name : 'Main');
const inLabel = t => (t.input === 'none' ? 'No Input' : t.input === 'resample' ? 'Main' : String(t.input || '').startsWith('track:') ? ((busById(t.input.slice(6)) || {}).name || 'track') : extParse(t.input) ? extLabel(t.input, 'in') : IO.native ? 'In 1/2' : 'Mic');
function chooseOutput(b, e) {
  const set = v => { pushUndo('Output'); if (v) b.out = v; else delete b.out; routeOut(b); ui.all(); if (V.view === 'mix') mixer.render(); };
  const items = [{ label: (!b.out ? '✓ ' : '') + (groupOf(b) ? 'Group: ' + groupOf(b).name : 'Main'), run: () => set(null) }];
  if (IO.native) items.push('-', ...outChoices().map(([v, l]) => ({ label: (b.out === v ? '✓ ' : '') + 'Ext. ' + l, run: () => set(v) })));
  else items.push('-', { label: NE.avail && NE.avail.ok ? 'Other outputs: turn on the native engine (Settings → Audio)' : 'Other outputs need the native engine', run: () => showPrefs() });
  popMenu(e || lastPointer, items);
}
