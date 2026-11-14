/* ============ Audio Effect Rack: parallel chains, 8 macros, variations ============
   d.p = { m1..m8 (0..1), names[8], chains[{ id, name, devices[], vol, pan, mute, solo }], map[{ m, dev, k, min, max }], vars[{ name, m[8] }], sel }
   Macros are ordinary device parameters, so they can be automated and recorded like any other knob. */
const MACROS = [1, 2, 3, 4, 5, 6, 7, 8];
const newChain = name => ({ id: uid(), name: name || 'Chain', devices: [], vol: 1, pan: 0, mute: false, solo: false });
const rackDef = () => ({ ...Object.fromEntries(MACROS.map(i => ['m' + i, 0])), names: MACROS.map(i => 'Macro ' + i), chains: [newChain('Chain 1')], map: [], vars: [], sel: 0 });
const rackDevices = d => d.p.chains.flatMap(ch => ch.devices);
function findDevice(id, list) { for (const d of list) { if (d.id === id) return d; if (d.type === 'rack') { const x = findDevice(id, rackDevices(d)); if (x) return x; } } return null; }
class RackDev extends Base {
  constructor(d) { super(d); this.nodes = []; this.build(); }
  build() {
    this.nodes.forEach(n => { try { n.inp.disconnect(); n.out.disconnect(); n.pan.disconnect(); } catch (e) { } }); this.nodes = [];
    try { this.input.disconnect(); } catch (e) { }
    for (const ch of this.d.p.chains) {
      const inp = ctx.createGain(), out = ctx.createGain(), pan = ctx.createStereoPanner(); this.input.connect(inp); chain(inp, ch.devices, out); out.connect(pan); pan.connect(this.output); this.nodes.push({ ch, inp, out, pan });
    }
    this.set();
  }
  set() {
    const p = this.d.p, solo = p.chains.some(c => c.solo);
    this.nodes.forEach(n => { const on = !n.ch.mute && (!solo || n.ch.solo); sm(n.out.gain, on ? n.ch.vol : 0); sm(n.pan.pan, n.ch.pan || 0); });
    (p.map || []).forEach(m => { const t = findDevice(m.dev, rackDevices(this.d)); if (!t) return; const v = m.min + (m.max - m.min) * (p['m' + m.m] || 0), def = (DEVICES[t.type].params || []).find(q => q.k === m.k);
      const val = def && def.step ? Math.round(v / def.step) * def.step : v; if (t.p[m.k] !== val) { t.p[m.k] = val; devRT(t).set(); } });
  }
  dispose() { super.dispose(); this.nodes.forEach(n => { try { n.inp.disconnect(); n.out.disconnect(); n.pan.disconnect(); } catch (e) { } }); rackDevices(this.d).forEach(x => { const r = DEV_RT.get(x.id); if (r) { r.dispose(); DEV_RT.delete(x.id); } }); }
}
DEVICES.rack = { name: 'Audio Effect Rack', blurb: 'Chains, macros, variations', cls: RackDev, wide: true, def: rackDef, params: MACROS.map(i => K('m' + i, 'Macro ' + i, 0, 1, { fmt: v => Math.round(v * 127) + '' })) };
function rackRebuild(d) { const r = DEV_RT.get(d.id); if (r && r.build) r.build(); markDirty(); }
// Put one device into a new rack in its place (Ctrl+G on a device, or its menu).
function groupIntoRack(owner, i) { pushUndo('Group into rack'); const d = owner.devices[i], rk = newDevice('rack'); rk.p.chains[0].devices = [d]; rk.p.chains[0].name = DEVICES[d.type].name; owner.devices[i] = rk; DEV_RT.delete(d.id); rewire(owner); ui.detail(); }
function ungroupRack(owner, i) { pushUndo('Ungroup rack'); const rk = owner.devices[i], ch = rk.p.chains[rk.p.sel || 0] || rk.p.chains[0]; const r = DEV_RT.get(rk.id); if (r) { r.dispose(); DEV_RT.delete(rk.id); } owner.devices.splice(i, 1, ...(ch ? ch.devices : [])); rewire(owner); ui.detail(); }

/* ---------- the rack card ---------- */
function rackView(body, o, d, r) {
  const p = d.p; p.sel = clamp(p.sel || 0, 0, p.chains.length - 1);
  const changed = () => { r.set(); markDirty(); };
  // macros
  const mac = document.createElement('div'); mac.className = 'rackmac';
  MACROS.forEach(i => {
    const k = knob({ label: p.names[i - 1], value: p['m' + i], min: 0, max: 1, def: 0, fmt: v => Math.round(v * 127) + '', onInput: v => { p['m' + i] = v; changed(); autoTouch(o, `dev:${d.id}:m${i}`, v); } });
    const n = (p.map || []).filter(m => m.m === i).length; k.title = n ? `${n} mapped parameter${n > 1 ? 's' : ''}. Right-click to map more, double-click the name to rename.` : 'Right-click to map a parameter inside the rack. Double-click the name to rename.';
    if (n) k.classList.add('mapped');
    k.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); macroMenu(e, o, d, i); });
    const lab = k.querySelector('.klabel, .lab, span'); if (lab) lab.ondblclick = () => askText('Macro name', p.names[i - 1], v => { p.names[i - 1] = v || p.names[i - 1]; markDirty(); ui.detail(); });
    mac.appendChild(k);
  });
  body.appendChild(mac);
  // variations
  const vr = document.createElement('div'); vr.className = 'rackvar';
  vr.innerHTML = `<span class="lab">Variations</span>${(p.vars || []).map((v, i) => `<button class="chipb" data-var="${i}" title="Recall. Right-click to overwrite or delete.">${esc(v.name)}</button>`).join('')}<button class="chipb ghost" data-var="new" title="Store the macro settings as a variation">+ Store</button><button class="chipb ghost" data-rand title="Randomize the macros">Rand</button>`;
  vr.onclick = e => { const b = e.target.closest('[data-var]');
    if (e.target.closest('[data-rand]')) { pushUndo('Randomize macros'); MACROS.forEach(i => (p['m' + i] = Math.round(Math.random() * 127) / 127)); changed(); ui.detail(); return; }
    if (!b) return; if (b.dataset.var === 'new') { p.vars = p.vars || []; p.vars.push({ name: 'Var ' + (p.vars.length + 1), m: MACROS.map(i => p['m' + i]) }); markDirty(); ui.detail(); return; }
    const v = p.vars[+b.dataset.var]; pushUndo('Recall variation'); MACROS.forEach(i => (p['m' + i] = v.m[i - 1])); changed(); ui.detail(); };
  vr.oncontextmenu = e => { const b = e.target.closest('[data-var]'); if (!b || b.dataset.var === 'new') return; e.preventDefault(); const i = +b.dataset.var;
    popMenu(e, [{ label: 'Overwrite with current macros', run: () => { p.vars[i].m = MACROS.map(k => p['m' + k]); markDirty(); } }, { label: 'Rename', run: () => askText('Variation name', p.vars[i].name, v => { p.vars[i].name = v || p.vars[i].name; ui.detail(); }) }, { label: 'Delete', danger: true, run: () => { p.vars.splice(i, 1); ui.detail(); } }]); };
  body.appendChild(vr);
  // chains
  const cl = document.createElement('div'); cl.className = 'rackchains';
  cl.innerHTML = p.chains.map((ch, i) => `<div class="rchain ${i === p.sel ? 'on' : ''}" data-ch="${i}"><span class="rcname" title="Double-click to rename">${esc(ch.name)}</span><button class="hb act ${ch.mute ? '' : 'on'}" data-cm="mute" title="Chain on/off">●</button><button class="hb solo ${ch.solo ? 'on' : ''}" data-cm="solo" title="Solo chain">S</button><input type="range" min="0" max="1.4" step="0.01" value="${ch.vol}" data-cm="vol" aria-label="Chain volume"><input type="range" min="-1" max="1" step="0.01" value="${ch.pan || 0}" data-cm="pan" class="rcpan" aria-label="Chain pan"><button class="hb" data-cm="del" title="Delete chain">✕</button></div>`).join('') +
    `<div class="row tight"><button class="btn ghostb tiny" data-cm="add">+ Chain</button><select class="dd tiny" data-cm="addfx" aria-label="Add a device to the selected chain"><option value="">Add device to ${esc((p.chains[p.sel] || {}).name || 'chain')}…</option>${Object.keys(DEVICES).filter(k => !DEVICES[k].hidden && k !== 'rack').map(k => `<option value="${k}">${esc(DEVICES[k].name)}</option>`).join('')}</select></div>`;
  cl.addEventListener('click', e => { const row = e.target.closest('[data-ch]'), b = e.target.closest('[data-cm]'); const i = row ? +row.dataset.ch : -1, ch = p.chains[i];
    if (b && b.dataset.cm === 'add') { pushUndo('Add chain'); p.chains.push(newChain('Chain ' + (p.chains.length + 1))); p.sel = p.chains.length - 1; rackRebuild(d); ui.detail(); return; }
    if (!ch) return; if (!b) { p.sel = i; ui.detail(); return; }
    if (b.dataset.cm === 'mute') { ch.mute = !ch.mute; changed(); ui.detail(); }
    if (b.dataset.cm === 'solo') { ch.solo = !ch.solo; changed(); ui.detail(); }
    if (b.dataset.cm === 'del') { if (p.chains.length < 2) return toast('A rack keeps at least one chain'); pushUndo('Delete chain'); ch.devices.forEach(x => { const rr = DEV_RT.get(x.id); if (rr) { rr.dispose(); DEV_RT.delete(x.id); } }); p.chains.splice(i, 1); p.map = (p.map || []).filter(m => findDevice(m.dev, rackDevices(d))); rackRebuild(d); ui.detail(); } });
  cl.addEventListener('input', e => { const row = e.target.closest('[data-ch]'), b = e.target.closest('[data-cm]'); if (!row || !b) return; const ch = p.chains[+row.dataset.ch]; if (b.dataset.cm === 'vol') ch.vol = +b.value; if (b.dataset.cm === 'pan') ch.pan = +b.value; changed(); });
  cl.addEventListener('change', e => { const b = e.target.closest('[data-cm="addfx"]'); if (!b || !b.value) return; pushUndo('Add device'); p.chains[p.sel].devices.push(newDevice(b.value)); rackRebuild(d); ui.detail(); });
  cl.addEventListener('dblclick', e => { const n = e.target.closest('.rcname'), row = e.target.closest('[data-ch]'); if (!n || !row) return; const ch = p.chains[+row.dataset.ch]; askText('Chain name', ch.name, v => { ch.name = v || ch.name; ui.detail(); }); });
  cl.querySelectorAll('input,select').forEach(x => x.addEventListener('keydown', e => e.stopPropagation()));
  body.appendChild(cl);
  // the selected chain's devices
  const ch = p.chains[p.sel]; if (!ch) return;
  const inner = document.createElement('div'); inner.className = 'rackinner';
  const owner = { id: o.id, devices: ch.devices, auto: {}, _rack: d, name: ch.name };
  if (!ch.devices.length) inner.innerHTML = '<p class="muted small">This chain is empty: add a device above, or drag one here from the browser.</p>';
  ch.devices.forEach((x, i) => inner.appendChild(deviceCard(owner, x, i)));
  inner.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('sb/device')) e.preventDefault(); });
  inner.addEventListener('drop', e => { const k = e.dataTransfer.getData('sb/device'); if (!k) return; e.preventDefault(); e.stopPropagation(); pushUndo('Add device'); ch.devices.push(newDevice(k)); rackRebuild(d); ui.detail(); });
  body.appendChild(inner);
}
function macroMenu(e, o, d, i) {
  const p = d.p, items = [];
  rackDevices(d).forEach(x => (DEVICES[x.type].params || []).filter(q => q.min != null).forEach(q => {
    const on = (p.map || []).some(m => m.m === i && m.dev === x.id && m.k === q.k);
    items.push({ label: `${on ? '✓ ' : ''}${DEVICES[x.type].name}: ${q.label}`, run: () => { pushUndo('Macro mapping'); p.map = p.map || []; if (on) p.map = p.map.filter(m => !(m.m === i && m.dev === x.id && m.k === q.k)); else { p.map = p.map.filter(m => !(m.dev === x.id && m.k === q.k)); p.map.push({ m: i, dev: x.id, k: q.k, min: q.min, max: q.max }); p['m' + i] = clamp((x.p[q.k] - q.min) / (q.max - q.min || 1), 0, 1); } DEV_RT.get(d.id) && DEV_RT.get(d.id).set(); markDirty(); ui.detail(); } });
  }));
  if (!items.length) items.push({ label: 'Add a device to a chain first', run: () => { } });
  const mapped = (p.map || []).filter(m => m.m === i);
  if (mapped.length) items.push('-', ...mapped.map(m => ({ label: `Range for ${DEVICES[(findDevice(m.dev, rackDevices(d)) || {}).type || 'utility'].name}: ${m.k}…`, run: () => askText('Range (min to max)', `${m.min} to ${m.max}`, v => { const n = String(v).match(/(-?[\d.]+)\D+(-?[\d.]+)/); if (n) { m.min = +n[1]; m.max = +n[2]; DEV_RT.get(d.id) && DEV_RT.get(d.id).set(); markDirty(); } }) })));
  popMenu(e, items);
}
