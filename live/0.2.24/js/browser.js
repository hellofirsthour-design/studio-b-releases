/* ============ Browser: Collections / Categories / Places on the left, contents on the right ============ */
const WEB_FILES = new Map(); // id -> File (browser build: files picked from a folder)
const ICON = {
  sounds: '<path d="M6 12V4l7-1.5v8"/><circle cx="4.5" cy="12" r="1.8"/><circle cx="11.5" cy="10.5" r="1.8"/>',
  drums: '<rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="9" y="2.5" width="4.5" height="4.5" rx="1"/><rect x="2.5" y="9" width="4.5" height="4.5" rx="1"/><rect x="9" y="9" width="4.5" height="4.5" rx="1"/>',
  instruments: '<circle cx="8" cy="8" r="5.5"/><path d="M8 8V4.5"/>',
  fx: '<path d="M2 8h1.5M4.5 5v6M7 3v10M9.5 5.5v5M12 7v2M14 8h0"/>',
  midifx: '<path d="M2.5 4.5h11M2.5 8h7M2.5 11.5h9"/><circle cx="12" cy="8" r="1"/>',
  plugins: '<path d="M6 3.5v3M10 3.5v3M4.5 6.5h7v2.5a3.5 3.5 0 0 1-7 0zM8 12.5V14"/>',
  clips: '<rect x="2.5" y="3.5" width="11" height="9" rx="1"/><path d="M6.5 6l3.5 2-3.5 2z"/>',
  samples: '<rect x="2" y="3.5" width="12" height="9" rx="1"/><path d="M4.5 8h1M6.5 6.5v3M8.5 5.5v5M10.5 7v2"/>',
  grooves: '<path d="M2 6c2-2 4 2 6 0s4 2 6 0M2 10.5c2-2 4 2 6 0s4 2 6 0"/>',
  templates: '<rect x="2.5" y="3" width="11" height="10" rx="1"/><path d="M2.5 6.5h11M6.5 6.5V13"/>',
  user: '<circle cx="8" cy="5.5" r="2.5"/><path d="M3 13.5c.8-3 2.6-4 5-4s4.2 1 5 4"/>',
  project: '<rect x="2.5" y="3" width="11" height="10" rx="1"/><path d="M5 6.5h6M5 9h3.5"/>',
  folder: '<path d="M2 4.5h4.2l1.3 1.4H14V13H2z"/>',
  add: '<path d="M8 3.5v9M3.5 8h9"/>',
  file: '<path d="M4 2.5h5.5l2.5 2.5v8.5H4z"/><path d="M5.8 9.5v1M7.5 8v3.5M9.2 9v2"/>',
  set: '<rect x="3" y="2.5" width="10" height="11" rx="1"/><path d="M5.5 6h5M5.5 8.5h5M5.5 11h3"/>',
  phones: '<path d="M3 10V8a5 5 0 0 1 10 0v2"/><rect x="2.5" y="9.5" width="2.5" height="4" rx=".8"/><rect x="11" y="9.5" width="2.5" height="4" rx=".8"/>',
};
const ico = (k, cls = '') => `<svg class="bico ${cls}" viewBox="0 0 16 16" aria-hidden="true">${ICON[k] || ICON.file}</svg>`;
const FX_FOLDERS = [['Delay & Loop', ['tape', 'delay']], ['Drive & Color', ['sat']], ['Dynamics', ['comp', 'gate', 'limit']], ['EQ & Filters', ['eq', 'filter']], ['Pitch & Modulation', ['tune', 'chorus', 'phaser', 'autopan']], ['Reverb & Resonance', ['verb']], ['Utilities', ['utility', 'rack']], ['Modulators', ['lfo', 'envf', 'shaper']]];
const SOUND_FOLDERS = [['Bass', ['Sub Bass', 'Reese']], ['Keys', ['Keys']], ['Lead', ['Saw Lead']], ['Pad', ['Warm Pad']], ['Pluck', ['Pluck']]];
const DEFAULT_COLLECTIONS = [['Favorites', '#ff5d5d'], ['Orange', '#ff9a3c'], ['Yellow', '#f2d544'], ['Green', '#6fdc8c'], ['Blue', '#4ea3ff'], ['Purple', '#b18cff'], ['Gray', '#a7a3b8']];
const DRUM_WORDS = /kick|snare|clap|hat|hh|perc|tom|rim|cymbal|crash|ride|808|shaker|snap|drum|bd|sd/i;

const browser = {
  sel: 'fx', q: '', pInfo: new Map(), pVol: 0.8, sync: false, expanded: new Set(), listing: new Map(), places: [], userLib: null, preview: null, previewOn: true, sortDesc: false,
  index: new Map(), indexing: new Set(), cols: null,
  async init() {
    try { this.places = JSON.parse(lsGet('sb-places') || '[]'); } catch (e) { this.places = []; }
    try { this.cols = JSON.parse(lsGet('sb-collections') || 'null'); } catch (e) { this.cols = null; }
    if (!this.cols) this.cols = { list: DEFAULT_COLLECTIONS.map(([name, color], i) => ({ id: 'c' + i, name, color })), items: {} };
    this.previewOn = lsGet('sb-preview') !== '0'; this.pVol = lsGet('sb-pvol') != null ? +lsGet('sb-pvol') : 0.8; this.sync = lsGet('sb-psync') === '1'; this.sel = lsGet('sb-bsel') || 'fx';
    if (IS_DESKTOP) {
      const p = await NATIVE.paths(); this.userLib = joinPath(joinPath(p.music, 'Studio B'), 'User Library');
      if (!(await NATIVE.exists(this.userLib))) { try { await NATIVE.write(joinPath(this.userLib, 'Read me.txt'), 'Put samples and presets you want close at hand in this folder. Studio B lists it under Places > User Library.\n'); } catch (e) { } }
      if (!this.places.length) this.places = [{ name: 'Music', path: p.music }, { name: 'Desktop', path: p.desktop }, { name: 'Downloads', path: p.downloads }];
    }
    const el = $('#browser');
    el.addEventListener('click', e => this.click(e));
    el.addEventListener('dblclick', e => { const c = e.target.closest('[data-side^="col:"]'); if (c) { const col = this.cols.list.find(x => 'col:' + x.id === c.dataset.side); askText('Collection name', col.name, v => { col.name = v; this.saveCols(); this.render(); }); } });
    el.addEventListener('contextmenu', e => this.context(e));
    el.addEventListener('dragstart', e => { this.stopPreview(); const it = e.target.closest('[data-drag]'); if (!it) return; e.dataTransfer.setData(it.dataset.drag, it.dataset.val); e.dataTransfer.effectAllowed = 'copy'; });
    $('#bsearch').addEventListener('input', e => { this.q = e.target.value.trim().toLowerCase(); this.renderList(); });
    $('#bprev').onclick = () => { this.previewOn = !this.previewOn; lsSet('sb-preview', this.previewOn ? '1' : '0'); if (!this.previewOn) this.stopPreview(); this.renderFoot(); };
    $('#bsync').onclick = () => { this.sync = !this.sync; lsSet('sb-psync', this.sync ? '1' : '0'); this.renderFoot(); };
    $('#bvol').value = this.pVol; $('#bvol').oninput = e => { this.pVol = +e.target.value; lsSet('sb-pvol', String(this.pVol)); if (this.pGain) this.pGain.gain.value = this.pVol; };
    $('#bvol').onkeydown = e => e.stopPropagation();
    const rz = $('#bresize'); rz.onpointerdown = e => { rz.setPointerCapture(e.pointerId); const x0 = e.clientX, w0 = $('#browser').offsetWidth; rz.onpointermove = ev => { const w = clamp(w0 + ev.clientX - x0, 260, 720); $('#app').style.setProperty('--browserW', w + 'px'); lsSet('sb-browserW', w); arr.draw(); }; rz.onpointerup = () => (rz.onpointermove = null); };
    const bw = +lsGet('sb-browserW'); if (bw) $('#app').style.setProperty('--browserW', bw + 'px');
    this.render();
  },
  saveCols() { lsSet('sb-collections', JSON.stringify(this.cols)); },
  savePlaces() { lsSet('sb-places', JSON.stringify(this.places)); },
  render() { if (!S) return; this.renderSide(); this.renderList(); this.renderFoot(); },
  renderSide() {
    const item = (key, icon, label, extra = '') => `<button class="bside ${this.sel === key ? 'on' : ''}" data-side="${esc(key)}">${icon}<span>${esc(label)}</span>${extra}</button>`;
    let h = '<div class="bhead">Collections</div>' + this.cols.list.map(c => item('col:' + c.id, `<i class="cdot" style="background:${c.color}"></i>`, c.name)).join('');
    h += '<div class="bhead">Categories</div>' + [['sounds', 'Sounds'], ['drums', 'Drums'], ['instruments', 'Instruments'], ['fx', 'Audio Effects'], ['midifx', 'MIDI Effects'], ['plugins', 'Plug-Ins'], ['clips', 'Clips'], ['samples', 'Samples'], ['grooves', 'Grooves'], ['templates', 'Templates']].map(([k, l]) => item(k, ico(k), l)).join('');
    h += '<div class="bhead">Places</div>' + (IS_DESKTOP ? item('userlib', ico('user'), 'User Library') : '') + item('project', ico('project'), 'Current Project');
    h += this.places.map((p, i) => item('place:' + i, ico('folder'), p.name)).join('') + `<button class="bside dim" data-act="addPlace">${ico('add')}<span>Add Folder…</span></button>`;
    $('#bside').innerHTML = h;
  },
  renderFoot() { $('#bsync').classList.toggle('on', this.sync); $('#bprev').classList.toggle('on', this.previewOn); $('#bprev').setAttribute('aria-pressed', this.previewOn); },
  // ---------- content rows ----------
  row(o, depth = 0) {
    const pad = 8 + depth * 14, tagDots = o.key ? this.tagsOf(o.key).map(c => `<i class="cdot sm" style="background:${c.color}"></i>`).join('') : '';
    if (o.dir) { const open = this.expanded.has(o.id); return `<div class="brow dir" style="padding-left:${pad}px" data-act="dir" data-id="${esc(o.id)}" ${o.path ? `data-path="${esc(o.path)}"` : ''}><i class="tri">${open ? '▾' : '▸'}</i>${ico('folder')}<b>${esc(o.name)}</b>${o.count != null ? `<span class="bcount">${o.count}</span>` : ''}</div>`; }
    return `<div class="brow ${o.cls || ''}" style="padding-left:${pad + 14}px" draggable="${o.drag ? 'true' : 'false'}" ${o.drag ? `data-drag="${o.drag}" data-val='${esc(o.val)}'` : ''} data-act="${o.act || ''}" data-key="${esc(o.key || '')}" ${o.path ? `data-path="${esc(o.path)}"` : ''} ${o.sid ? `data-sid="${o.sid}"` : ''} ${o.file ? `data-file="${o.file}"` : ''} title="${esc(o.title || '')}">${ico(o.icon || 'file')}<b>${esc(o.name)}</b>${tagDots}${o.meta ? `<span class="bmeta">${esc(o.meta)}</span>` : ''}</div>`;
  },
  // building blocks for each category
  fxItem(k) { const v = DEVICES[k]; return { name: v.name, meta: v.blurb, drag: 'sb/device', val: k, act: 'fx', key: 'fx:' + k, icon: 'fx', title: 'Click to add to the selected track, or drag onto a track' }; },
  instItem(v, name, meta) { return { name, meta, drag: 'sb/inst', val: v, act: 'inst', key: 'inst:' + v, icon: v.startsWith('drums') ? 'drums' : 'instruments', title: 'Click to add a track, or drag onto a MIDI track' }; },
  fileItem(f) { const isSet = /\.(als|sbproj)$/i.test(f.name); return isSet ? { name: f.name, path: f.path, act: 'openSet', key: 'file:' + f.path, icon: 'set', meta: /\.als$/i.test(f.name) ? 'Live Set' : 'Project', title: 'Double-click to open' } : { name: f.name, path: f.path, file: f.fileId, drag: 'sb/sample', val: JSON.stringify(f.fileId ? { fileId: f.fileId } : { path: f.path }), act: 'prev', key: 'file:' + (f.path || f.fileId), icon: 'file' }; },
  folderRows(id, name, path, depth, filter) {
    const out = [this.row({ dir: true, id, name, path }, depth)];
    if (!this.expanded.has(id)) return out.join('');
    const items = this.listing.get(id); if (!items) return out.join('') + `<div class="brow dim" style="padding-left:${22 + depth * 14}px">Loading…</div>`;
    const sorted = [...items].sort((a, b) => (b.dir - a.dir) || (this.sortDesc ? -1 : 1) * a.name.localeCompare(b.name, undefined, { numeric: true }));
    for (const it of sorted) {
      if (it.dir) out.push(this.folderRows(it.path, it.name, it.path, depth + 1, filter));
      else if (!filter || filter(it)) out.push(this.row(this.fileItem(it), depth + 1));
    }
    return out.join('');
  },
  staticFolder(id, name, items, depth = 0) { const out = [this.row({ dir: true, id, name, count: items.length }, depth)]; if (this.expanded.has(id)) items.forEach(o => out.push(this.row(o, depth + 1))); return out.join(''); },
  empty(title, text) { return `<div class="bempty"><b>${esc(title)}</b><p>${text}</p></div>`; },
  projectSamples() { const used = new Set(); S.tracks.forEach(t => { t.clips.forEach(c => c.sampleId && used.add(c.sampleId)); if (t.inst) { if (t.inst.sampleId) used.add(t.inst.sampleId); (t.inst.pads || []).forEach(p => p.sampleId && used.add(p.sampleId)); } }); return [...used].filter(id => SAMPLES.has(id)).map(id => { const s = SAMPLES.get(id); return { name: s.name, sid: id, drag: 'sb/sample', val: JSON.stringify({ sid: id }), act: 'prev', key: 'sid:' + id, icon: 'file', meta: [s.bpm ? s.bpm + ' bpm' : '', s.key ? keyLabel(s.key.root, s.key.mode) : ''].join(' ') }; }); },
  roots() { const r = this.places.map((p, i) => ({ id: p.path, name: p.name, path: p.path })); if (this.userLib) r.unshift({ id: this.userLib, name: 'User Library', path: this.userLib }); return r; },
  searchHits(filter) { // flat results from the file index of every place
    const out = []; const q = this.q;
    for (const r of this.roots()) { this.ensureIndex(r.path); for (const f of this.index.get(r.path) || []) { if (!f.dir && f.name.toLowerCase().includes(q) && (!filter || filter(f))) { out.push(f); if (out.length > 400) return out; } } }
    return out;
  },
  renderList() {
    if (!S) return; const sel = this.sel, q = this.q, m = s => !q || s.toLowerCase().includes(q); let h = '', title = '';
    const audio = f => !f.dir && f.audio !== false && !/\.(als|sbproj)$/i.test(f.name);
    if (sel.startsWith('col:')) {
      const col = this.cols.list.find(c => 'col:' + c.id === sel); title = col ? col.name : '';
      const items = Object.entries(this.cols.items).filter(([, ids]) => ids.includes(col.id)).map(([k, ids]) => this.fromKey(k)).filter(o => o && m(o.name));
      h = items.length ? items.map(o => this.row(o)).join('') : this.empty('Nothing tagged yet', `Right-click anything in the browser and choose <b>${esc(col.name)}</b> to collect it here.`);
    } else if (sel === 'sounds') {
      title = 'Sounds';
      h = q ? SOUND_FOLDERS.flatMap(([, ps]) => ps).filter(m).map(p => this.row(this.instItem('synth:' + p, p, 'Contour'))).join('') : SOUND_FOLDERS.map(([f, ps]) => this.staticFolder('snd:' + f, f, ps.map(p => this.instItem('synth:' + p, p, 'Contour')))).join('');
    } else if (sel === 'drums') {
      title = 'Drums';
      const kits = [this.instItem('drums', 'Kit', 'Drum rack'), this.instItem('sampler', 'Cutline', 'Chopping sampler')].filter(o => m(o.name));
      h = kits.map(o => this.row(o)).join('');
      if (IS_DESKTOP) { const hits = this.q ? this.searchHits(f => DRUM_WORDS.test(f.path)) : this.roots().flatMap(r => (this.index.get(r.path) || []).filter(f => DRUM_WORDS.test(f.name))).slice(0, 300); this.roots().forEach(r => this.ensureIndex(r.path)); h += this.staticFolderOpen('Drum samples in your folders', hits.map(f => this.fileItem(f))); }
    } else if (sel === 'instruments') {
      title = 'Instruments';
      h = [this.instItem('synth', 'Contour', 'Synth'), this.instItem('fm', 'Facet', 'FM synth'), this.instItem('wave', 'Morph', 'Wavetable synth'), this.instItem('epiano', 'Tine', 'Electric piano'), this.instItem('pluck', 'String', 'Plucked string model'), this.instItem('drums', 'Kit', 'Drum rack'), this.instItem('sampler', 'Cutline', 'Sampler'), this.instItem('multi', 'Zones', 'Multisampler')].filter(o => m(o.name)).map(o => this.row(o)).join('');
    } else if (sel === 'fx') {
      title = 'Audio Effects';
      h = q ? Object.keys(DEVICES).filter(k => !DEVICES[k].hidden && m(DEVICES[k].name + ' ' + DEVICES[k].blurb)).map(k => this.row(this.fxItem(k))).join('')
        : FX_FOLDERS.map(([f, ks]) => this.staticFolder('fx:' + f, f, ks.map(k => this.fxItem(k)))).join('');
    } else if (sel === 'midifx') {
      title = 'MIDI Effects'; h = this.empty('MIDI effects are next', 'Arpeggiator, Chord, Scale, Note Length, Random and Velocity are on the roadmap. Until then, the piano roll’s <b>Transform</b> tools arpeggiate, strum, build chords and fit notes to the scale.');
    } else if (sel === 'plugins') {
      title = 'Plug-Ins';
      const pi = x => ({ name: x.name, meta: `${x.vendor ? x.vendor + ' · ' : ''}${x.format}`, drag: 'sb/plugin', val: JSON.stringify({ ref: refOf(x), instrument: !!x.instrument }), act: 'plugin', key: 'plug:' + x.format + x.uid, icon: x.instrument ? 'instruments' : 'plugins', title: x.instrument ? 'Click for a new MIDI track with this instrument, or drag onto a MIDI track' : 'Click to add to the selected track, or drag onto a track' });
      if (!NE.avail || !NE.avail.ok) h = this.empty('Plug-ins need the native engine', !IS_DESKTOP ? 'VST3 and Audio Unit plug-ins run in the desktop app.' : !NE.avail ? 'This copy of Studio B is older than the native engine. Download the newest installer once; after that, updates arrive on their own.' : 'The native engine did not load on this computer: ' + esc(NE.avail.error || '') + '.');
      else {
        const all = nePlugins().filter(x => m(x.name) || m(x.vendor || '')), ins = all.filter(x => x.instrument), fx = all.filter(x => !x.instrument);
        h = `<div class="row tight bscan"><button class="btn ghostb tiny" data-act="scan">${nePlugins().length ? 'Rescan plug-ins' : 'Scan for plug-ins'}</button><span class="muted small">${nePlugins().length} found${NE.on ? '' : ' · turn on the native engine in Settings → Audio to use them'}</span></div>`
          + this.staticFolderOpen('Instruments', ins.map(pi)) + this.staticFolderOpen('Audio Effects', fx.map(pi)) + ((NE.catalog.failed || []).length ? this.staticFolder('failed', `Could not load (${NE.catalog.failed.length})`, NE.catalog.failed.map(f => ({ name: basename(f.path), meta: f.error, icon: 'file' }))) : '');
      }
    } else if (sel === 'clips') {
      title = 'Clips';
      const inProj = S.tracks.flatMap(t => t.clips.filter(c => c.type === 'midi').map(c => ({ name: c.name, meta: t.name, icon: 'clips', act: 'showClip', key: '', val: c.id, path: c.id }))).filter(o => m(o.name));
      h = `<div class="bsub">MIDI clips in this project</div>` + (inProj.length ? inProj.map(o => this.row(o)).join('') : '<div class="brow dim">None yet</div>');
      if (IS_DESKTOP) { this.roots().forEach(r => this.ensureIndex(r.path)); const sets = this.roots().flatMap(r => (this.index.get(r.path) || []).filter(f => /\.(als|sbproj)$/i.test(f.name) && m(f.name))).slice(0, 300); h += `<div class="bsub">Sets and projects in your folders</div>` + (sets.length ? sets.map(f => this.row(this.fileItem(f))).join('') : '<div class="brow dim">None found</div>'); }
    } else if (sel === 'samples') {
      title = 'Samples';
      const ps = this.projectSamples().filter(o => m(o.name));
      h = this.staticFolderOpen('In this project', ps);
      if (q && IS_DESKTOP) h += this.roots().map(r => { const id = 'sqroot:' + r.path, t = this.searchTree(r.path, audio, r.name); if (/No matches/.test(t)) return ''; if (!this.expanded.has('closed:' + id)) this.expanded.add(id); return this.row({ dir: true, id, name: r.name }, 0) + (this.expanded.has(id) ? t.replace(/padding-left:(\d+)px/g, (m, v) => `padding-left:${+v + 14}px`) : ''); }).join('') || '<div class="brow dim">No matches in your folders</div>';
      else h += this.roots().map(r => this.folderRows(r.path, r.name, r.path, 0, audio)).join('') + (!IS_DESKTOP ? this.webPlaces(audio) : '');
    } else if (sel === 'grooves') { title = 'Grooves'; const gi = g => ({ name: g.name, meta: g.cycle >= 16 ? '1 bar' : g.cycle + ' steps', act: 'groove', val: g.id, key: 'groove:' + g.id, icon: 'grooves', title: 'Click to apply to the selected clips' });
      h = `<div class="grvamt"><span>Global amount</span><input type="range" min="0" max="1.3" step="0.01" value="${S.grooveAmt != null ? S.grooveAmt : 1}" id="grvAmt" aria-label="Global groove amount"><b>${Math.round((S.grooveAmt != null ? S.grooveAmt : 1) * 100)}%</b></div>` + this.staticFolderOpen('Groove pool (this project)', (S.grooves || []).filter(g => m(g.name)).map(gi)) + this.staticFolderOpen('Swing and feel', GROOVE_LIB.filter(g => m(g.name)).map(gi)); }
    else if (sel === 'templates') { title = 'Templates'; h = (this.tpls || []).filter(t => m(t.name)).map(t => `<div class="brow" data-act="tpl" data-name="${esc(t.name)}" title="Click to start a new project from this template">${ico('set')}<b>${esc(t.name)}</b></div>`).join('') || this.empty('No templates yet', 'Set up a project the way you like, then use the ☰ menu in the toolbar: <b>Save as template</b> or <b>Save as default set</b>.'); listTemplates().then(ts => { const n = ts.map(t => t.name).join(); if (n !== (this.tpls || []).map(t => t.name).join()) { this.tpls = ts; this.renderList(); } }); }
    else if (sel === 'project') {
      title = 'Current Project'; const ps = this.projectSamples().filter(o => m(o.name));
      h = this.staticFolderOpen('Samples', ps);
      if (S.path && IS_DESKTOP) h += this.folderRows(dirname(S.path), basename(dirname(S.path)), dirname(S.path), 0, null);
      else h += `<div class="brow dim">Save the project to see its folder here.</div>`;
    } else if (sel === 'userlib') {
      title = 'User Library'; h = q ? this.searchTree(this.userLib, null) : this.folderRows(this.userLib, 'User Library', this.userLib, 0, null);
    } else if (sel.startsWith('place:')) {
      const p = this.places[+sel.slice(6)]; title = p ? p.name : '';
      if (p) h = q && IS_DESKTOP ? this.searchTree(p.path, null) : p.path.startsWith('web:') ? this.webPlace(p) : this.folderRows(p.path, p.name, p.path, 0, null);
    }
    $('#bcolhead').innerHTML = `<span>${esc(title || 'Name')}</span><button class="bsort" data-act="sort" aria-label="Sort">${this.sortDesc ? '▼' : '▲'}</button>`;
    $('#blist').innerHTML = h;
    if ($('#grvAmt')) { $('#grvAmt').oninput = e => { S.grooveAmt = +e.target.value; e.target.nextElementSibling.textContent = Math.round(S.grooveAmt * 100) + '%'; markDirty(); }; $('#grvAmt').onkeydown = e => e.stopPropagation(); }
  },
  staticFolderOpen(name, items) { const id = 'open:' + name; if (!this.expanded.has('closed:' + id)) this.expanded.add(id); return this.staticFolder(id, name, items); },
  /* Search results as a tree: folders whose name matches show closed (open them to browse everything inside),
     and matching files sit inside their folders, which show how many matches they hold. */
  searchTree(root, filter, rootName) {
    this.ensureIndex(root); const idx = this.index.get(root);
    if (!idx) return '<div class="brow dim">Searching…</div>';
    const q = this.q, sep = /[\\/]/, rel = p => p.slice(root.length).split(sep).filter(Boolean);
    const hitDirs = idx.filter(e => e.dir && e.name.toLowerCase().includes(q)), inHit = p => hitDirs.some(d => p !== d.path && p.startsWith(d.path) && sep.test(p.charAt(d.path.length)));
    const topDirs = hitDirs.filter(d => !inHit(d.path)), files = idx.filter(e => !e.dir && e.name.toLowerCase().includes(q) && (!filter || filter(e)) && !inHit(e.path));
    if (!topDirs.length && !files.length) return this.indexing.has(root) ? '<div class="brow dim">Searching…</div>' : '<div class="brow dim">No matches</div>';
    const mk = (name, path) => ({ name, path, dirs: new Map(), files: [], hits: [], n: 0 }), top = mk(rootName || '', root);
    const nodeFor = p => { const parts = rel(p).slice(0, -1); let n = top, cur = root; for (const part of parts) { cur = cur + (cur.endsWith('/') || cur.endsWith('\\') ? '' : p.charAt(root.length) || '/') + part; if (!n.dirs.has(part)) n.dirs.set(part, mk(part, cur)); n = n.dirs.get(part); } return n; };
    files.forEach(f => nodeFor(f.path).files.push(f)); topDirs.forEach(d => nodeFor(d.path).hits.push(d));
    const count = n => (n.n = n.files.length + n.hits.length + [...n.dirs.values()].reduce((s, c) => s + count(c), 0));
    count(top); const cmp = (a, b) => (this.sortDesc ? -1 : 1) * a.name.localeCompare(b.name, undefined, { numeric: true });
    const render = (n, depth) => {
      let h = ''; [...n.hits].sort(cmp).forEach(d => { h += this.folderRows(d.path, d.name, d.path, depth, filter).replace('class="brow dir"', 'class="brow dir hit"'); });
      [...n.dirs.values()].sort(cmp).forEach(c => { const id = 'sq:' + c.path; h += this.row({ dir: true, id, name: c.name, count: c.n }, depth); if (this.expanded.has(id)) h += render(c, depth + 1); });
      [...n.files].sort(cmp).forEach(f => { h += this.row(this.fileItem(f), depth); });
      return h;
    };
    return render(top, 0);
  },
  searchHitsIn(root) { this.ensureIndex(root); const hits = (this.index.get(root) || []).filter(f => f.name.toLowerCase().includes(this.q)).slice(0, 400); return hits.length ? hits.map(f => this.row(this.fileItem(f))).join('') : (this.indexing.has(root) ? '<div class="brow dim">Searching…</div>' : '<div class="brow dim">No matches</div>'); },
  webPlaces(filter) { return this.places.filter(p => p.path.startsWith('web:')).map(p => this.webPlace(p, filter)).join(''); },
  webPlace(p, filter) { const items = (this.listing.get(p.path) || []).filter(f => (!filter || filter(f)) && (!this.q || f.name.toLowerCase().includes(this.q))); return this.staticFolderOpen(p.name, items.map(f => this.fileItem(f))); },
  async ensureIndex(root) { // recursive file list for search, built once per place
    if (!IS_DESKTOP || !root || root.startsWith('web:') || this.index.has(root) || this.indexing.has(root)) return;
    this.indexing.add(root); const out = [], queue = [[root, 0]]; let n = 0;
    while (queue.length && out.length < 30000 && n < 4000) { const [dir, d] = queue.shift(); n++; let items = []; try { items = await NATIVE.list(dir); } catch (e) { continue; } for (const it of items) { if (it.dir) { out.push(it); if (d < 8) queue.push([it.path, d + 1]); } else out.push(it); } }
    this.index.set(root, out); this.indexing.delete(root); this.renderList();
  },
  fromKey(k) {
    const [kind, ...rest] = k.split(':'); const v = rest.join(':');
    if (kind === 'fx' && DEVICES[v]) return this.fxItem(v);
    if (kind === 'inst') return this.instItem(v, v.startsWith('synth:') ? v.slice(6) : INST_NAMES[v] || v, 'Instrument');
    if (kind === 'file') return this.fileItem({ name: basename(v), path: v });
    if (kind === 'sid' && SAMPLES.has(v)) return this.projectSamples().find(o => o.sid === v) || null;
    return null;
  },
  tagsOf(key) { const ids = this.cols.items[key] || []; return this.cols.list.filter(c => ids.includes(c.id)); },
  // ---------- interaction ----------
  async click(e) {
    const s = e.target.closest('[data-side]'); if (s) { this.stopPreview(); this.sel = s.dataset.side; lsSet('sb-bsel', this.sel); this.render(); return; }
    const a = e.target.closest('[data-act]'); if (!a) return; const act = a.dataset.act;
    if (act === 'sort') { this.sortDesc = !this.sortDesc; this.renderList(); return; }
    if (act === 'inst') return addInstrumentTrack(a.dataset.val, null);
    if (act === 'fx') { const b = busById([...V.selTracks][0]); if (!b) return toast('Select a track first'); pushUndo('Add device'); b.devices.push(newDevice(a.dataset.val)); rewire(b); V.detail = V.detail === 'clip' ? 'both' : V.detail; ui.detail(); return; }
    if (act === 'dir') { this.stopPreview();
      const id = a.dataset.id, p = a.dataset.path;
      if (this.expanded.has(id)) { this.expanded.delete(id); if (id.startsWith('open:') || id.startsWith('sqroot:')) this.expanded.add('closed:' + id); }
      else { this.expanded.add(id); this.expanded.delete('closed:' + id); if (p && IS_DESKTOP && !this.listing.has(id)) { this.renderList(); try { this.listing.set(id, await NATIVE.list(p)); } catch (err) { this.listing.set(id, []); toast('That folder could not be read'); } } }
      this.renderList(); return;
    }
    if (act === 'addPlace') return this.addPlace();
    if (act === 'scan') return neScan();
    if (act === 'plugin') { const o = JSON.parse(a.dataset.val || '{}'); if (!NE.on) return toast('Turn on the native engine in Settings → Audio to use plug-ins'); return addPlugin(o.ref, o.instrument, o.instrument ? null : undefined); }
    if (act === 'groove') return applyGroove(a.dataset.val || (a.dataset.key || '').slice(7));
    if (act === 'tpl') { const t = (this.tpls || []).find(x => x.name === a.dataset.name); if (t) confirmLeave(() => newFromTemplate(t)); return; }
    if (act === 'prev') { $$('.brow.sel', $('#blist')).forEach(x => x.classList.remove('sel')); a.classList.add('sel'); if (this.previewOn) this.previewItem(a); return; }
    if (act === 'openSet') { if (e.detail === 2) confirmLeave(() => openPath(a.dataset.path)); return; }
    if (act === 'showClip') { const c = clipById(a.dataset.path); if (c) { openClip(c); V.scrollX = Math.max(0, c.start - 8); arr.draw(); } }
  },
  async addPlace() {
    if (IS_DESKTOP) { const p = await NATIVE.folderDialog(); if (!p) return; this.places.push({ name: basename(p), path: p }); this.savePlaces(); this.sel = 'place:' + (this.places.length - 1); this.expanded.add(p); this.listing.set(p, await NATIVE.list(p)); this.render(); return; }
    const i = document.createElement('input'); i.type = 'file'; i.webkitdirectory = true; i.multiple = true;
    i.onchange = () => { const files = [...i.files].filter(f => /\.(wav|aiff?|mp3|flac|ogg|m4a|als|sbproj)$/i.test(f.name)); const root = (files[0] && files[0].webkitRelativePath.split('/')[0]) || 'Folder'; const key = 'web:' + uid(); this.listing.set(key, files.map(f => { const id = uid(); WEB_FILES.set(id, f); return { name: f.webkitRelativePath.slice(root.length + 1), fileId: id, audio: !/\.(als|sbproj)$/i.test(f.name) }; })); this.places.push({ name: root, path: key }); this.sel = 'place:' + (this.places.length - 1); this.render(); };
    i.click();
  },
  context(e) {
    const side = e.target.closest('[data-side]'), row = e.target.closest('.brow'); if (!side && !row) return; e.preventDefault();
    if (side && side.dataset.side.startsWith('place:')) { const i = +side.dataset.side.slice(6), p = this.places[i]; return popMenu(e, [{ label: 'Rename', run: () => askText('Folder name', p.name, v => { p.name = v; this.savePlaces(); this.render(); }) }, ...(IS_DESKTOP ? [{ label: 'Show in Finder / Explorer', run: () => NATIVE.reveal(p.path) }] : []), { label: 'Remove from Places', danger: true, run: () => { this.places.splice(i, 1); this.savePlaces(); this.sel = 'project'; this.render(); } }]); }
    if (side && side.dataset.side.startsWith('col:')) { const col = this.cols.list.find(c => 'col:' + c.id === side.dataset.side); return popMenu(e, [{ label: 'Rename collection', run: () => askText('Collection name', col.name, v => { col.name = v; this.saveCols(); this.render(); }) }]); }
    if (!row || !row.dataset.key) return; const key = row.dataset.key, cur = this.cols.items[key] || [];
    const items = this.cols.list.map(c => ({ label: (cur.includes(c.id) ? '✓ ' : '') + c.name, run: () => { const s = new Set(this.cols.items[key] || []); s.has(c.id) ? s.delete(c.id) : s.add(c.id); if (s.size) this.cols.items[key] = [...s]; else delete this.cols.items[key]; this.saveCols(); this.renderList(); } }));
    if (IS_DESKTOP && row.dataset.path && key.startsWith('file:')) items.push('-', { label: 'Show in Finder / Explorer', run: () => NATIVE.reveal(row.dataset.path) });
    popMenu(e, items);
  },
  stopPreview() {
    this.pTok = (this.pTok || 0) + 1; // also cancels a preview that is still loading
    if (this.preview) { try { this.preview.onended = null; this.preview.stop(); } catch (e) { } this.preview = null; }
    document.querySelectorAll('.brow.playing').forEach(x => x.classList.remove('playing'));
  },
  async previewItem(a) {
    this.stopPreview(); const tok = this.pTok;
    if (ctx.state !== 'running') ctx.resume();
    let buf = null;
    try {
      if (a.dataset.sid) buf = SAMPLES.get(a.dataset.sid).buf;
      else if (a.dataset.file) buf = await decodeAudio(await WEB_FILES.get(a.dataset.file).arrayBuffer());
      else if (a.dataset.path && IS_DESKTOP) buf = await decodeAudio(await NATIVE.read(a.dataset.path));
    } catch (e) { return toast('That file could not be previewed'); }
    if (!buf || tok !== this.pTok) return;
    const key = a.dataset.sid || a.dataset.path || a.dataset.file; let info = this.pInfo.get(key);
    if (!info) { const x = monoOf(buf), bpm = buf.duration > 1 && buf.duration < 40 ? detectTempo(onsetEnvelope(x), buf.sampleRate, 512, buf.duration) : null; info = { bpm }; this.pInfo.set(key, info); if (this.pInfo.size > 300) this.pInfo.delete(this.pInfo.keys().next().value); }
    const nm = a.textContent.trim(), bi = document.getElementById('binfo'); bi.textContent = `${nm} · ${buf.duration < 60 ? buf.duration.toFixed(1) + ' s' : fmtTime(buf.duration)} · ${(buf.sampleRate / 1000).toFixed(1)} kHz · ${buf.numberOfChannels > 1 ? 'stereo' : 'mono'}${info.bpm ? ` · ~${Math.round(info.bpm)} BPM` : ''}`; bi.title = bi.textContent;
    // Sync: loops previewed while the song plays are stretched to its tempo and start on the next beat
    let play = buf, when = 0, loop = false;
    if (this.sync && T.playing && info.bpm && buf.duration < 40) { play = stretchBuffer(buf, info.bpm / bpmAt(nowPos())); if (tok !== this.pTok) return; when = timeAt(Math.ceil(nowPos() / BEAT() + 1e-6) * BEAT()); loop = true; }
    if (!this.pGain) { this.pGain = LIVE_CTX.createGain(); this.pGain.connect(M.cue); } this.pGain.gain.value = this.pVol;
    const s = LIVE_CTX.createBufferSource(); s.buffer = play; s.loop = loop; s.connect(this.pGain); s.start(when); this.preview = s;
    a.classList.add('playing'); s.onended = () => a.classList.remove('playing');
  },
};
