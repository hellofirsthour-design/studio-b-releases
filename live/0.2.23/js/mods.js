/* ============ Modulators: LFO, Envelope Follower, Shaper ============
   They sit in a device chain (audio passes straight through) and move one parameter on the same track:
   a device knob (also inside racks), the track volume or pan, or a synth setting. The knob you set stays the centre
   of the movement; nothing is written into the song. */
const MOD_TYPES = new Set(['lfo', 'envf', 'shaper']);
const NO_MOD = { verb: ['decay', 'size', 'damp', 'width'], tune: ['key', 'scale'] };
const MOD_DIVS = [[1, '1/16'], [2, '1/8'], [4, '1/4'], [8, '1/2'], [16, '1 bar'], [32, '2 bars'], [64, '4 bars']];
class ModDev extends Base {
  constructor(d) { super(d); this.input.connect(this.output); if (d.type === 'envf') { this.an = ctx.createAnalyser(); this.an.fftSize = 1024; this.input.connect(this.an); this.buf = new Float32Array(1024); } this.env = 0; this.v = 0; this.lt = null; }
  set() { }
}
const modDef = { lfo: () => ({ target: '', shape: 'sine', sync: true, div: 16, rate: 1, depth: 0.5, offset: 0, phase: 0 }), envf: () => ({ target: '', gain: 0, attack: 10, release: 200, depth: 0.6 }), shaper: () => ({ target: '', div: 4, glide: false, depth: 0.6, ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map(i => ['s' + i, Math.sin(i * 0.8) * 0.8])) }) };
DEVICES.lfo = { name: 'LFO', blurb: 'Moves a parameter in a cycle', cls: ModDev, mod: true, def: modDef.lfo,
  params: [SEL('shape', 'Shape', ['sine', 'triangle', 'saw up', 'saw down', 'square', 'random']), TOG('sync', 'Sync'), SEL('div', 'Length', MOD_DIVS.map(d => d[0])), K('rate', 'Rate (Hz)', 0.02, 20, { scale: 'log', fmt: v => v.toFixed(2) + ' Hz' }), K('depth', 'Depth', -1, 1, { fmt: fPct }), K('offset', 'Offset', -1, 1, { fmt: fPct }), K('phase', 'Phase', 0, 1, { fmt: v => Math.round(v * 360) + '°' })] };
DEVICES.envf = { name: 'Envelope Follower', blurb: 'Follows the level', cls: ModDev, mod: true, def: modDef.envf,
  params: [K('gain', 'Gain', -24, 24, { fmt: fDb }), K('attack', 'Attack', 1, 500, { scale: 'log', fmt: v => Math.round(v) + ' ms' }), K('release', 'Release', 10, 2000, { scale: 'log', fmt: v => Math.round(v) + ' ms' }), K('depth', 'Depth', -1, 1, { fmt: fPct })] };
DEVICES.shaper = { name: 'Shaper', blurb: '8-step modulation', cls: ModDev, mod: true, def: modDef.shaper,
  params: [SEL('div', 'Step', MOD_DIVS.map(d => d[0])), TOG('glide', 'Glide'), K('depth', 'Depth', -1, 1, { fmt: fPct }), ...[1, 2, 3, 4, 5, 6, 7, 8].map(i => K('s' + i, 'Step ' + i, -1, 1, { fmt: v => Math.round(v * 100) + '' }))] };

// Every parameter a modulator on this track can move.
function modTargets(b, self) {
  const out = [{ key: 'vol', label: 'Track volume' }, { key: 'pan', label: 'Track pan' }];
  if (b.inst && b.inst.type === 'synth') ['cutoff', 'res', 'detune', 'mix2', 'noise'].forEach(k => out.push({ key: 'inst:' + k, label: 'Contour: ' + k }));
  const walk = (list, pre) => list.forEach(d => { if (d === self || MOD_TYPES.has(d.type) || d.type === 'plugin') return; const def = DEVICES[d.type];
    if (d.type === 'rack') { MACROS.forEach(i => out.push({ key: `dev:${d.id}:m${i}`, label: `${pre}${def.name}: ${d.p.names[i - 1]}` })); d.p.chains.forEach(ch => walk(ch.devices, `${pre}${ch.name} › `)); return; }
    (def.params || []).filter(q => q.min != null && !(NO_MOD[d.type] || []).includes(q.k)).forEach(q => out.push({ key: `dev:${d.id}:${q.k}`, label: `${pre}${def.name}: ${q.label}` })); });
  walk(b.devices, ''); return out;
}
function modValue(d, r, time, pos) {
  const p = d.p;
  if (d.type === 'lfo') {
    const cyc = p.sync ? (pos != null ? pos : (time * bpmAt(0) / 15)) / (+p.div || 16) : time * p.rate, ph = ((cyc + (p.phase || 0)) % 1 + 1) % 1;
    const raw = { sine: Math.sin(ph * 2 * Math.PI), triangle: 1 - 4 * Math.abs(ph - 0.5), 'saw up': ph * 2 - 1, 'saw down': 1 - ph * 2, square: ph < 0.5 ? 1 : -1, random: (Math.sin(Math.floor(cyc) * 12.9898 + 78.233) * 43758.5453 % 1) * 2 - 1 }[p.shape] ?? 0;
    return clamp(raw * p.depth + (p.offset || 0), -1, 1);
  }
  if (d.type === 'shaper') {
    const st = (pos != null ? pos : time * bpmAt(0) / 15) / (+p.div || 4), i = ((Math.floor(st) % 8) + 8) % 8, f = st - Math.floor(st), a = p['s' + (i + 1)], b = p['s' + (((i + 1) % 8) + 1)];
    return clamp((p.glide ? a + (b - a) * f : a) * p.depth, -1, 1);
  }
  if (d.type === 'envf' && r.an) {
    r.an.getFloatTimeDomainData(r.buf); let s = 0; for (const v of r.buf) s += v * v; const db = 20 * Math.log10(Math.sqrt(s / r.buf.length) + 1e-9) + (p.gain || 0), lvl = clamp((db + 48) / 48, 0, 1);
    const dt = r.lt == null ? 0.03 : Math.max(0.001, time - r.lt); r.lt = time; const tc = (lvl > r.env ? p.attack : p.release) / 1000; r.env += (lvl - r.env) * (1 - Math.exp(-dt / Math.max(0.001, tc)));
    return clamp(r.env * p.depth, -1, 1);
  }
  return 0;
}
// Apply one modulation value to its target without changing the stored knob value.
function applyMod(b, key, v) {
  const rt = RT.get(b.id);
  if (key === 'vol' && rt) { sm(rt.fader.gain, faderGain(clamp(b.vol + v * 0.5, 0, 1))); return; }
  if (key === 'pan' && rt) { sm(rt.pan.pan, clamp((b.pan || 0) + v, -1, 1)); return; }
  if (key.startsWith('inst:') && rt && rt.inst) { const k = key.slice(5), base = b.inst[k], rng = { cutoff: [40, 16000, 'log'], res: [0.3, 20], detune: [0, 50], mix2: [0, 1], noise: [0, 1] }[k]; if (!rng || base == null) return;
    const val = rng[2] === 'log' ? clamp(base * Math.pow(rng[1] / rng[0], v * 0.5), rng[0], rng[1]) : clamp(base + v * (rng[1] - rng[0]) / 2, rng[0], rng[1]); (rt.inst.modulate || (() => { }))(k, val); return; }
  const [, id, k] = key.split(':'), t = findDevice(id, b.devices); if (!t) return; const def = (DEVICES[t.type].params || []).find(q => q.k === k); if (!def) return;
  const base = t.p[k], val = def.scale === 'log' ? clamp(base * Math.pow(def.max / def.min, v * 0.5), def.min, def.max) : clamp(base + v * (def.max - def.min) / 2, def.min, def.max);
  const r = devRT(t); t.p[k] = val; r.set(); t.p[k] = base;
}
function runModulators(time, pos) {
  if (!S) return;
  allBuses().forEach(b => { const walk = list => list.forEach(d => { if (d.type === 'rack') return d.p.chains.forEach(ch => walk(ch.devices)); if (!MOD_TYPES.has(d.type) || !d.on) return;
    const r = DEV_RT.get(d.id); if (!r) return; const v = modValue(d, r, time, pos); r.v = v; if (d.p.target) applyMod(b, d.p.target, v); }); walk(b.devices); });
}
// keep modulating while the transport is stopped (playback drives it from the scheduler)
setInterval(() => { if (!S || T.playing || T.busy || isOffline()) return; runModulators(LIVE_CTX.currentTime, null); }, 40);

/* ---------- card ---------- */
function modView(body, o, d, r, changed) {
  const row = document.createElement('label'); row.className = 'psel scsel'; row.innerHTML = '<span>Modulates</span>';
  const ts = modTargets(o._rack ? busById(o.id) || o : o, d);
  row.appendChild(selectEl([['', 'Choose a parameter…'], ...ts.map(t => [t.key, t.label])], d.p.target || '', v => { pushUndo('Modulation target'); const old = d.p.target; d.p.target = v; if (old) restoreTarget(o, old); markDirty(); }, 'Modulation target'));
  body.appendChild(row);
  const meter = document.createElement('div'); meter.className = 'modmeter'; meter.innerHTML = '<i></i>'; body.appendChild(meter);
  const tickM = () => { if (!meter.isConnected) return; const v = r.v || 0; const i = meter.firstChild; i.style.left = (v < 0 ? 50 + v * 50 : 50) + '%'; i.style.width = Math.abs(v) * 50 + '%'; requestAnimationFrame(tickM); }; tickM();
  body.appendChild(paramGrid(DEVICES[d.type].params.map(q => q.k === 'div' ? { ...q, options: MOD_DIVS.map(x => [x[0], x[1]]) } : q), d.p, (k, v) => { if (k === 'div') d.p.div = +v; changed(); autoTouch(o, `dev:${d.id}:${k}`, v); }, `${o.id}|dev:${d.id}:`));
}
function restoreTarget(b, key) { // put a parameter back to its knob value when a modulator lets go of it
  const rt = RT.get(b.id); if (!rt) return; if (key === 'vol' || key === 'pan') return applyMix(b);
  if (key.startsWith('dev:')) { const t = findDevice(key.split(':')[1], b.devices); if (t) devRT(t).set(); }
}
