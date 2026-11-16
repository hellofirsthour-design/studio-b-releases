/* ============ Free sample packs ============
   Recorded instruments (pianos, organ, mallets, strings, brass, woodwinds, sax, guitars, bass) from public-domain (CC0)
   libraries by Versilian Studios, FreePats, Karoryfer and Jeff Learman, listed in packs-data.js. A pack downloads on request: only the first few seconds of each
   recording are fetched, trimmed, given a seamless loop if the instrument sustains, and saved as 16-bit WAV in
   Music/Studio B/Packs. Installed instruments show up in Sounds like any other sound and play through Zones. */
const PACK_STATE = { installed: new Map(), busy: new Map() }; // packId -> { insts: { instId: [zone] } }, packId -> progress 0..1
const packInfo = id => PACK_MANIFEST.packs.find(p => p.id === id);
const packUrl = (repo, file) => { const r = (PACK_MANIFEST.repos || {})[repo]; return `https://raw.githubusercontent.com/${r ? r.path : 'sgossner/' + repo}/${r ? r.sha : PACK_MANIFEST.sha[repo]}/` + file.split('/').map(encodeURIComponent).join('/'); };
async function packRoot() { const p = await NATIVE.paths(); return joinPath(joinPath(p.music, 'Studio B'), 'Packs'); }

// WAV reader that copes with a file cut short (we only fetch its beginning)
function parseWavPartial(ab) {
  const v = new DataView(ab), tag = o => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  if (ab.byteLength < 44 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a WAV file');
  let o = 12, fmt = null;
  while (o + 8 <= ab.byteLength) {
    const id = tag(o), sz = v.getUint32(o + 4, true);
    if (id === 'fmt ') { let f = v.getUint16(o + 8, true); if (f === 0xfffe) f = v.getUint16(o + 32, true); fmt = { f, ch: v.getUint16(o + 10, true), sr: v.getUint32(o + 12, true), bits: v.getUint16(o + 22, true) }; }
    if (id === 'data') {
      if (!fmt) throw new Error('WAV has no format');
      const bps = fmt.bits / 8, start = o + 8, n = Math.floor(Math.min(sz, ab.byteLength - start) / (bps * fmt.ch)), chans = [];
      for (let c = 0; c < fmt.ch; c++) chans.push(new Float32Array(n));
      for (let i = 0; i < n; i++) for (let c = 0; c < fmt.ch; c++) {
        const p = start + (i * fmt.ch + c) * bps; let x;
        if (fmt.f === 3) x = bps === 8 ? v.getFloat64(p, true) : v.getFloat32(p, true);
        else if (bps === 2) x = v.getInt16(p, true) / 32768;
        else if (bps === 3) { let s = v.getUint8(p) | (v.getUint8(p + 1) << 8) | (v.getUint8(p + 2) << 16); if (s & 0x800000) s -= 0x1000000; x = s / 8388608; }
        else if (bps === 4) x = v.getInt32(p, true) / 2147483648;
        else x = (v.getUint8(p) - 128) / 128;
        chans[c][i] = x;
      }
      return { sr: fmt.sr, chans, cut: sz > ab.byteLength - start };
    }
    o += 8 + sz + (sz & 1);
  }
  throw new Error('WAV has no audio');
}
// Trim the silence before the note, keep `secs`, and either fade the end or bake a seamless loop into it.
function shapeRecording(w, secs, loop) {
  const sr = w.sr, C = Math.min(2, w.chans.length), src = w.chans.slice(0, C); let peak = 0;
  for (const d of src) for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  const thr = Math.max(peak * 0.02, 0.0004); let on = 0; outer: for (let i = 0; i < src[0].length; i++) for (const d of src) if (Math.abs(d[i]) > thr) { on = i; break outer; }
  on = Math.max(0, on - Math.round(sr * 0.003));
  const n = Math.min(src[0].length - on, Math.round(secs * sr)), cut = w.cut || src[0].length - on > n, out = src.map(d => d.slice(on, on + n));
  let ls = 0, le = 0;
  if (loop && n > sr * 0.6) {
    ls = Math.floor(n * 0.45); le = n - Math.round(sr * 0.02); const xf = Math.min(Math.round(sr * 0.25), Math.floor((le - ls) / 2), ls);
    for (const d of out) for (let i = 0; i < xf; i++) { const t = i / xf, a = le - xf + i, b = ls - xf + i; d[a] = d[a] * Math.cos(t * Math.PI / 2) + d[b] * Math.sin(t * Math.PI / 2); }
  } else if (cut) { const f = Math.min(n, Math.round(sr * 0.3)); for (const d of out) for (let i = 0; i < f; i++) d[n - f + i] *= 1 - i / f; }
  const buf = new AudioBuffer({ length: Math.max(1, n), numberOfChannels: C, sampleRate: sr }); out.forEach((d, c) => buf.copyToChannel(d, c));
  return { buf, ls: ls / sr, le: le / sr };
}

async function packsInit() {
  if (!IS_DESKTOP) return; let root; try { root = await packRoot(); } catch (e) { return; }
  for (const p of PACK_MANIFEST.packs) {
    const f = joinPath(joinPath(root, p.name), 'pack.json');
    try { if (await NATIVE.exists(f)) { const d = JSON.parse(await NATIVE.readText(f)); if (d.complete) registerPack(p.id, d, joinPath(root, p.name)); } } catch (e) { console.warn('pack', p.id, e); }
  }
}
function registerPack(id, data, dir) {
  const p = packInfo(id); PACK_STATE.installed.set(id, { ...data, dir });
  for (const i of p.insts) {
    if (!data.insts[i.id] || SOUNDS.some(s => s.pack === id && s.packInst === i.id)) continue;
    // a synth sound may already use this name (Vibraphone, Marimba…): the recorded one gets its own, or it could never be loaded
    const name = SOUNDS.some(s => !s.pack && s.name === i.name) ? i.name + ' (Recorded)' : i.name;
    const before = SOUNDS.length; snd(i.cat, name, { type: 'multi', A: i.A, R: i.R, gain: i.gain, glide: 0 }, i.fx, i.tags + ' sampled recorded acoustic pack', i.chars);
    SOUNDS.slice(before).forEach(s => { s.pack = id; s.packInst = i.id; });
  }
}
// Velocity layers each get their own key ranges, split halfway between neighbouring recordings.
function packZones(s) {
  const st = PACK_STATE.installed.get(s.pack); if (!st) return []; const zs = (st.insts[s.packInst] || []).map(z => ({ ...z, sampleId: PACK_SID.get(joinPath(st.dir, z.file)) || null }));
  const layers = new Map(); zs.forEach(z => { const k = z.vlo + ':' + z.vhi; if (!layers.has(k)) layers.set(k, []); layers.get(k).push(z); });
  layers.forEach(L => { L.sort((a, b) => a.root - b.root); L.forEach((z, i) => { z.lo = i ? Math.floor((L[i - 1].root + z.root) / 2) + 1 : 0; z.hi = i < L.length - 1 ? Math.floor((z.root + L[i + 1].root) / 2) : 127; }); });
  const boost = (packInfo(s.pack).insts.find(i => i.id === s.packInst) || {}).boost || 0;
  return zs.map(z => ({ sampleId: z.sampleId, root: z.root, lo: z.lo, hi: z.hi, vlo: z.vlo, vhi: z.vhi, ls: z.ls || 0, le: z.le || 0, gain: boost }));
}
const PACK_SID = new Map(); // file path -> sample id
const packReady = s => { const st = PACK_STATE.installed.get(s.pack); return !!st && (st.insts[s.packInst] || []).every(z => PACK_SID.has(joinPath(st.dir, z.file)) && SAMPLES.has(PACK_SID.get(joinPath(st.dir, z.file)))); };
async function packLoad(s) {
  const st = PACK_STATE.installed.get(s.pack); if (!st) { toast('Download this pack first.'); return false; }
  const todo = (st.insts[s.packInst] || []).map(z => joinPath(st.dir, z.file)).filter(f => !(PACK_SID.has(f) && SAMPLES.has(PACK_SID.get(f))));
  let missing = 0; await Promise.all(todo.map(async f => { const sid = await loadAudioPath(f); if (sid) PACK_SID.set(f, sid); else missing++; }));
  if (missing) toast(`${missing} recordings of ${s.name} are missing. Download the pack again to repair it.`, 5000);
  return true;
}

async function downloadPack(id) {
  const p = packInfo(id); if (!p || PACK_STATE.busy.has(id)) return;
  if (!IS_DESKTOP) return toast('Sample packs need the desktop app.');
  const dir = joinPath(await packRoot(), p.name), meta = joinPath(dir, 'pack.json');
  let data = { v: 1, complete: false, insts: {} }; try { if (await NATIVE.exists(meta)) data = JSON.parse(await NATIVE.readText(meta)); } catch (e) { }
  const jobs = []; p.insts.forEach(i => i.zones.forEach((z, k) => { const file = `${i.id}/${String(k).padStart(2, '0')}_${z.root}_${z.vlo}.wav`; if (!(data.insts[i.id] || []).some(x => x.file === file)) jobs.push({ i, z, file }); }));
  const total = p.insts.reduce((s, i) => s + i.zones.length, 0); let done = total - jobs.length, failed = null, lastSave = 0;
  PACK_STATE.busy.set(id, done / total); browser.render(); toast(`Downloading ${p.name}, about ${p.mb} MB…`);
  const save = () => NATIVE.write(meta, JSON.stringify(data));
  const one = async ({ i, z, file }) => {
    // WAV: fetch only the first few seconds. FLAC is compressed, so it comes whole and the browser decodes it.
    let ab = null; const flac = /\.flac$/i.test(z.file), bytes = Math.ceil(i.secs * 48000 * 2 * 3) + 65536;
    for (let a = 0; a < 3 && !ab; a++) { try { const r = await fetch(packUrl(z.repo, z.file), flac ? {} : { headers: { Range: `bytes=0-${bytes}` } }); if (!r.ok) throw new Error('HTTP ' + r.status); ab = await r.arrayBuffer(); } catch (e) { if (a === 2) throw e; await new Promise(r => setTimeout(r, 800 * (a + 1))); } }
    let w; if (flac) { const b = await LIVE_CTX.decodeAudioData(ab); w = { sr: b.sampleRate, chans: Array.from({ length: b.numberOfChannels }, (_, c) => b.getChannelData(c)), cut: false }; } else w = parseWavPartial(ab);
    const sh = shapeRecording(w, i.secs, i.loop);
    await NATIVE.write(joinPath(dir, file), encodeWav(sh.buf, 16));
    (data.insts[i.id] = data.insts[i.id] || []).push({ file, root: z.root, vlo: z.vlo, vhi: z.vhi, ...(i.loop && sh.le ? { ls: +sh.ls.toFixed(5), le: +sh.le.toFixed(5) } : {}) });
    done++; PACK_STATE.busy.set(id, done / total); if (Date.now() - lastSave > 1500) { lastSave = Date.now(); await save(); browser.render(); }
  };
  const queue = jobs.slice(); await Promise.all([0, 1, 2, 3].map(async () => { while (queue.length && !failed) { const j = queue.shift(); try { await one(j); } catch (e) { failed = e; } } }));
  if (failed) { await save(); PACK_STATE.busy.delete(id); browser.render(); return toast(`${p.name} stopped: ${failed.message}. Click it again to carry on from where it stopped.`, 6000); }
  data.complete = true; await save(); PACK_STATE.busy.delete(id); registerPack(id, data, dir); browser.render();
  toast(`${p.name} installed: ${p.insts.length} instruments are now in Sounds.`, 5000);
}
function packItem(p) {
  const st = PACK_STATE.installed.get(p.id), busy = PACK_STATE.busy.get(p.id);
  const meta = busy != null ? `Downloading ${Math.round(busy * 100)}%` : st ? `Installed · ${p.insts.length} instruments` : `Download · ${p.mb} MB`;
  return { name: p.name, meta, act: 'pack', key: 'pack:' + p.id, icon: 'sounds', title: `${p.blurb}. ${st ? 'Installed: its instruments are in the folders below.' : 'Click to download. Free and public domain (CC0), from Versilian Studios.'}` };
}
