/* ============ Preferences ============
   App-wide settings live in GP (localStorage "sb-prefs"); per-song ones (metronome, count-in, record quantize,
   latency compensation) stay in S.prefs so they travel with the project. */
const PREF_TABS = [['look', 'Look', 'Feel'], ['audio', 'Audio'], ['midi', 'Tempo', 'MIDI'], ['file', 'File', 'Folder'], ['library', 'Library'], ['plugins', 'Plug-Ins'], ['record', 'Record', 'Warp'], ['maint', 'Updates', 'Maintenance']];
let PREF_TAB = lsGet('sb-preftab') || 'audio';
const PREFS_TONE = { osc: null, g: null }, PREFS_CPU = { node: null, sink: null };
const prow = (label, ctl, hint) => `<div class="pfrow"><span class="pflab">${label}${hint ? `<small>${hint}</small>` : ''}</span><span class="pfctl">${ctl}</span></div>`;
const psel = (id, opts, val) => `<select id="${id}" class="dd">${opts.map(([v, l]) => `<option value="${v}" ${String(v) === String(val) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const ptog = (id, on, labels = ['Off', 'On']) => `<button id="${id}" class="pftog ${on ? 'on' : ''}" aria-pressed="${!!on}">${on ? labels[1] : labels[0]}</button>`;
const psec = t => `<div class="pfsec"><span>${t}</span></div>`;
const latMs = () => ({ out: Math.round(((LIVE_CTX.baseLatency || 0) + (LIVE_CTX.outputLatency || 0)) * 1000 * 10) / 10, inp: Math.round((LIVE_CTX.baseLatency || 0) * 1000 * 10) / 10 });
const audioRestartNeeded = () => (GP.sr && GP.sr !== LIVE_CTX.sampleRate) || (GP.buffer && GP.buffer !== (GP._bootBuffer || GP.buffer));

async function showPrefs() {
  const d = $('#prefs'); d.hidden = false; S.prefs = S.prefs || {};
  $('#pfTabs').innerHTML = PREF_TABS.map(([k, ...l]) => `<button data-tab="${k}" class="${k === PREF_TAB ? 'on' : ''}">${l.join('<br>')}</button>`).join('');
  $('#pfTabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (!b) return; PREF_TAB = b.dataset.tab; lsSet('sb-preftab', PREF_TAB); showPrefs(); };
  const body = $('#pfBody'), pane = PREF_PANES[PREF_TAB] || PREF_PANES.audio;
  body.innerHTML = await pane.html(); pane.bind && pane.bind(body);
  body.querySelectorAll('input,select').forEach(el => el.addEventListener('keydown', e => e.stopPropagation()));
}
const tog = (id, get, set, labels) => { const b = $('#' + id); if (!b) return; b.onclick = () => { set(!get()); b.classList.toggle('on', get()); b.setAttribute('aria-pressed', get()); b.textContent = get() ? (labels || ['Off', 'On'])[1] : (labels || ['Off', 'On'])[0]; }; };

const PREF_PANES = {
  look: {
    html: () => psec('Zoom and scrolling') +
      prow('Zoom and scrub speed', `<input id="pfZoomSp" type="range" min="0.4" max="2" step="0.05" value="${GP.zoomSpeed || 1}"><b id="pfZoomSpV" class="pfval">${Math.round((GP.zoomSpeed || 1) * 100)}%</b>`, 'How far one wheel notch or ruler drag zooms') +
      prow('Smooth zoom', ptog('pfSmooth', GP.smooth !== false)) +
      psec('Interface') +
      prow('Interface size', psel('pfScale', [[0.9, '90%'], [1, '100%'], [1.1, '110%'], [1.25, '125%']], GP.uiScale || 1)) +
      prow('Hover hints', ptog('pfTips', GP.tips !== false)) +
      prow('Follow the playhead', ptog('pfFollow', !!V.follow)) +
      prow('Calm meters', ptog('pfCalm', !!GP.calm), 'Less blinking and glow'),
    bind() {
      $('#pfZoomSp').oninput = e => { GP.zoomSpeed = +e.target.value; $('#pfZoomSpV').textContent = Math.round(GP.zoomSpeed * 100) + '%'; saveGP(); };
      tog('pfSmooth', () => GP.smooth !== false, v => { GP.smooth = v; saveGP(); });
      $('#pfScale').onchange = e => { GP.uiScale = +e.target.value; saveGP(); applyLook(); };
      tog('pfTips', () => GP.tips !== false, v => { GP.tips = v; saveGP(); });
      tog('pfFollow', () => !!V.follow, v => { V.follow = v; ui.transport(); });
      tog('pfCalm', () => !!GP.calm, v => { GP.calm = v; saveGP(); applyLook(); });
    },
  },
  audio: {
    async html() {
      if (NE.avail && NE.avail.ok && GP.engine !== 'web') return nativeAudioHtml();
      let devs = []; try { devs = await navigator.mediaDevices.enumerateDevices(); } catch (e) { }
      const outs = devs.filter(x => x.kind === 'audiooutput' && x.deviceId !== 'default'), ins = devs.filter(x => x.kind === 'audioinput' && x.deviceId !== 'default');
      const plat = /Mac/i.test(navigator.platform) ? 'Core Audio' : /Win/i.test(navigator.platform) ? 'Windows Audio' : 'System audio';
      const L = latMs(), dec = S.prefs.latencyMs != null ? S.prefs.latencyMs : 0, lab = (x, f) => esc(x.label || f);
      const sr = GP.sr || LIVE_CTX.sampleRate, buf = GP.buffer || 0;
      return psec('Audio device') + (NE.avail && NE.avail.ok ? prow('Audio engine', psel('pfEng', [['native', 'Native (recommended)'], ['web', 'Built-in (browser audio)']], 'web')) : '') +
        prow('Driver type', psel('pfDrv', [['sys', plat]], 'sys'), 'Studio B uses your system audio') +
        prow('Audio input device', psel('pfIn', [['default', 'System default'], ['none', 'No device'], ...ins.map(x => [x.deviceId, lab(x, 'Input (allow access to see names)')])], GP.inId || 'default') + (ins.length && !ins[0].label ? '<button class="btn ghostb tiny" id="pfAllow">Allow</button>' : '')) +
        prow('Audio output device', psel('pfOut', [['default', 'System default'], ...outs.map(x => [x.deviceId, lab(x, 'Output')])], GP.outId || 'default')) +
        prow('Channel configuration', psel('pfInCh', [['st', 'Input: stereo (1/2)'], ['l', 'Input: mono, left (1)'], ['r', 'Input: mono, right (2)']], GP.inCh || 'st') + psel('pfOutCh', [['st', 'Output: stereo'], ['mono', 'Output: mono']], GP.outMono ? 'mono' : 'st')) +
        psec('Sample rate') +
        prow('In/out sample rate', psel('pfSr', [[44100, '44100'], [48000, '48000'], [88200, '88200'], [96000, '96000']], sr) + (sr !== LIVE_CTX.sampleRate ? ` <span class="pfnote">now ${LIVE_CTX.sampleRate}</span>` : '')) +
        prow('Sample rate conversion', psel('pfSrc', [['hq', 'High quality'], ['fast', 'Fast']], GP.srcQuality || 'hq'), 'Used when files at other rates are stretched') +
        psec('Latency') +
        prow('Buffer size', psel('pfBuf', [[0, 'Automatic (lowest)'], [128, '128 samples'], [256, '256 samples'], [512, '512 samples'], [1024, '1024 samples'], [2048, '2048 samples']], buf)) +
        prow('Input latency', `<b class="pfval">${L.inp.toFixed(2)} ms</b>`) +
        prow('Output latency', `<b class="pfval">${L.out.toFixed(1)} ms</b>`) +
        prow('Driver error compensation', `<input id="pfDec" type="number" step="0.1" min="-200" max="500" value="${dec}"><span class="pfunit">ms</span>`, 'Shifts recordings so they line up with what you heard') +
        prow('Overall latency', `<b class="pfval" id="pfOver">${(L.inp + L.out + dec).toFixed(1)} ms</b>`) +
        (audioRestartNeeded() ? `<div class="pfwarn">Sample rate and buffer changes apply when audio restarts. <button class="btn prim tiny" id="pfRestart">Restart audio now</button></div>` : '') +
        psec('Test') +
        prow('Test tone', ptog('pfTone', !!PREFS_TONE.osc)) +
        prow('Tone volume', `<input id="pfToneVol" type="range" min="-60" max="0" step="1" value="${GP.toneDb != null ? GP.toneDb : -36}"><b class="pfval" id="pfToneVolV">${GP.toneDb != null ? GP.toneDb : -36} dB</b>`) +
        prow('Tone frequency', `<input id="pfToneHz" type="range" min="20" max="2000" step="1" value="${GP.toneHz || 440}"><b class="pfval" id="pfToneHzV">${GP.toneHz || 440} Hz</b>`) +
        prow('CPU usage simulator', `<input id="pfCpu" type="range" min="0" max="90" step="5" value="${GP.cpuSim || 0}"><b class="pfval" id="pfCpuV">${GP.cpuSim || 0}%</b>`, 'Loads the audio thread to test for dropouts');
    },
    bind() {
      if (NE.avail && NE.avail.ok && GP.engine !== 'web') return nativeAudioBind();
      if ($('#pfEng')) $('#pfEng').onchange = async e => { GP.engine = e.target.value; saveGP(); if (GP.engine === 'native') { const on = await neStart(); if (on) toast('Native audio on'); } showPrefs(); };
      $('#pfIn').onchange = async e => { GP.inId = e.target.value === 'default' ? null : e.target.value; saveGP(); await reopenDefaultInput(); toast(e.target.value === 'none' ? 'Audio input off' : 'Input changed'); };
      if ($('#pfAllow')) $('#pfAllow').onclick = async () => { try { await getInput('default'); showPrefs(); } catch (e) { toast('Input access was refused'); } };
      $('#pfOut').onchange = async e => { GP.outId = e.target.value === 'default' ? null : e.target.value; saveGP(); const ok = await applyOutputDevice(); toast(ok ? 'Output changed' : 'This build cannot switch outputs; use your system sound settings.'); };
      $('#pfInCh').onchange = async e => { GP.inCh = e.target.value; saveGP(); await reopenDefaultInput(); };
      $('#pfOutCh').onchange = e => { GP.outMono = e.target.value === 'mono'; saveGP(); applyOutputMono(); };
      $('#pfSr').onchange = e => { GP.sr = +e.target.value; saveGP(); showPrefs(); };
      $('#pfSrc').onchange = e => { GP.srcQuality = e.target.value; saveGP(); };
      $('#pfBuf').onchange = e => { GP.buffer = +e.target.value || null; saveGP(); showPrefs(); };
      $('#pfDec').onchange = e => { S.prefs.latencyMs = +e.target.value; markDirty(); const L = latMs(); $('#pfOver').textContent = (L.inp + L.out + S.prefs.latencyMs).toFixed(1) + ' ms'; };
      if ($('#pfRestart')) $('#pfRestart').onclick = () => confirmLeave(() => { V.dirty = false; if (IS_DESKTOP) NATIVE.restart(); else location.reload(); });
      tog('pfTone', () => !!PREFS_TONE.osc, v => testTone(v));
      $('#pfToneVol').oninput = e => { GP.toneDb = +e.target.value; $('#pfToneVolV').textContent = GP.toneDb + ' dB'; saveGP(); if (PREFS_TONE.g) PREFS_TONE.g.gain.setTargetAtTime(dbToGain(GP.toneDb), LIVE_CTX.currentTime, 0.02); };
      $('#pfToneHz').oninput = e => { GP.toneHz = +e.target.value; $('#pfToneHzV').textContent = GP.toneHz + ' Hz'; saveGP(); if (PREFS_TONE.osc) PREFS_TONE.osc.frequency.setTargetAtTime(GP.toneHz, LIVE_CTX.currentTime, 0.02); };
      $('#pfCpu').oninput = e => { GP.cpuSim = +e.target.value; $('#pfCpuV').textContent = GP.cpuSim + '%'; cpuSimulator(GP.cpuSim); };
    },
  },
  midi: {
    async html() {
      let ins = []; try { const acc = await navigator.requestMIDIAccess(); ins = [...acc.inputs.values()]; } catch (e) { }
      return psec('Tempo') +
        prow('Tempo for new projects', `<input id="pfBpm" type="number" min="40" max="300" step="0.01" value="${GP.bpm || 120}"><span class="pfunit">BPM</span>`) +
        prow('Ableton Link', '<span class="pfnote">Not available yet: it needs the native audio engine</span>') +
        psec('MIDI ports') +
        (ins.length ? ins.map(p => prow(`Input: ${esc(p.name)}`, `<button class="pftog ${GP.midiOff && GP.midiOff[p.id] ? '' : 'on'}" data-midi="${esc(p.id)}">Track</button>`)).join('') : prow('Inputs', '<span class="pfnote">No MIDI devices found. Plug one in and reopen Settings.</span>')) +
        prow('Computer keyboard plays notes', ptog('pfKb', !!KB.on), 'Same as the keyboard button in the toolbar');
    },
    bind(body) {
      $('#pfBpm').onchange = e => { GP.bpm = clamp(+e.target.value || 120, 40, 300); saveGP(); };
      body.querySelectorAll('[data-midi]').forEach(b => (b.onclick = () => { GP.midiOff = GP.midiOff || {}; GP.midiOff[b.dataset.midi] = !GP.midiOff[b.dataset.midi]; b.classList.toggle('on', !GP.midiOff[b.dataset.midi]); saveGP(); }));
      tog('pfKb', () => !!KB.on, v => { KB.on = v; $('#kbBtn').classList.toggle('on', v); });
    },
  },
  file: {
    async html() {
      const lib = browser.userLib || '(desktop app only)', auto = await autosaveDir();
      return psec('Saving') +
        prow('Autosave', ptog('pfAuto', GP.autosave !== false)) +
        prow('Autosave every', psel('pfAutoMin', [[1, '1 minute'], [2, '2 minutes'], [5, '5 minutes'], [10, '10 minutes']], GP.autosaveMin || 1)) +
        prow('Recorded audio', psel('pfRecBits', [[16, '16-bit WAV'], [24, '24-bit WAV'], [32, '32-bit float WAV']], GP.recBits || 24), 'Takes are written next to the project when you save') +
        psec('Folders') +
        prow('User Library', `<span class="pfpath">${esc(lib)}</span>${IS_DESKTOP && browser.userLib ? '<button class="btn ghostb tiny" id="pfShowLib">Show</button>' : ''}`) +
        prow('Autosave folder', `<span class="pfpath">${esc(auto || 'Browser storage')}</span>`);
    },
    bind() {
      tog('pfAuto', () => GP.autosave !== false, v => { GP.autosave = v; saveGP(); });
      $('#pfAutoMin').onchange = e => { GP.autosaveMin = +e.target.value; saveGP(); };
      $('#pfRecBits').onchange = e => { GP.recBits = +e.target.value; saveGP(); };
      if ($('#pfShowLib')) $('#pfShowLib').onclick = () => NATIVE.reveal(joinPath(browser.userLib, 'Read me.txt'));
    },
  },
  library: {
    html: () => psec('Preview') +
      prow('Preview files when you click them', ptog('pfPrev', browser.previewOn)) +
      prow('Sync preview to the song', ptog('pfPSync', browser.sync)) +
      prow('Preview volume', `<input id="pfPVol" type="range" min="0" max="1.2" step="0.01" value="${browser.pVol}">`) +
      psec('Folders') +
      prow('Rescan folders', '<button class="btn ghostb tiny" id="pfRescan">Rescan</button>', 'Picks up files added outside Studio B') +
      prow('Places', `<span class="pfnote">${browser.places.length} added folder${browser.places.length === 1 ? '' : 's'}. Add more from the browser sidebar.</span>`),
    bind() {
      tog('pfPrev', () => browser.previewOn, v => { browser.previewOn = v; lsSet('sb-preview', v ? '1' : '0'); if (!v) browser.stopPreview(); browser.renderFoot(); });
      tog('pfPSync', () => browser.sync, v => { browser.sync = v; lsSet('sb-psync', v ? '1' : '0'); browser.renderFoot(); });
      $('#pfPVol').oninput = e => { browser.pVol = +e.target.value; lsSet('sb-pvol', String(browser.pVol)); $('#bvol').value = browser.pVol; };
      $('#pfRescan').onclick = () => { browser.index.clear(); browser.listing.clear(); browser.render(); toast('Rescanning your folders'); };
    },
  },
  plugins: {
    async html() {
      if (!NE.avail || !NE.avail.ok) return psec('Plug-ins') + `<p class="pftext">${!IS_DESKTOP ? 'VST3 and Audio Unit plug-ins run in the desktop app.' : !NE.avail ? 'This copy of Studio B is older than the native engine. Download the newest installer once to run VST3 and Audio Unit plug-ins; after that, updates arrive on their own.' : 'The native engine did not load on this computer: ' + esc(NE.avail.error || '')}</p>`;
      const mac = NE.avail.platform === 'darwin', n = nePlugins().length, f = (NE.catalog.failed || []).length;
      return psec('Plug-in sources') +
        prow('Use VST3 plug-ins', ptog('pfVst3', GP.useVST3 !== false)) +
        (mac ? prow('Use Audio Units', ptog('pfAU', GP.useAU !== false)) : '') +
        prow('Custom VST3 folders', `<span class="pfpath">${esc((GP.vst3Folders || []).join(', ') || 'None (the standard folders are always searched)')}</span><button class="btn ghostb tiny" id="pfAddFolder">Add…</button>${(GP.vst3Folders || []).length ? '<button class="btn ghostb tiny" id="pfClearFolders">Clear</button>' : ''}`) +
        prow('Plug-ins found', `<b class="pfval">${n}</b>${f ? ` <span class="pfnote">${f} could not load</span>` : ''}<button class="btn prim tiny" id="pfRescan">Rescan</button>`, NE.catalog.scannedAt ? 'Last scan ' + new Date(NE.catalog.scannedAt).toLocaleString() : 'Not scanned yet') +
        psec('Timing') +
        prow('Delay compensation', ptog('pfPdc', GP.pdc !== false), 'Delays the other tracks to match each plug-in\'s latency') +
        prow('Plug-in buffer', psel('pfLag', [[2, '2 blocks (lowest latency)'], [3, '3 blocks (default)'], [4, '4 blocks (safest)']], GP.plugLag || 3), 'Raise it if plug-ins crackle') +
        (f ? psec('Could not load') + (NE.catalog.failed || []).slice(0, 30).map(x => prow(esc(basename(x.path)), `<span class="pfnote">${esc(x.error)}</span>`)).join('') : '');
    },
    bind() {
      if (!NE.avail || !NE.avail.ok) return;
      tog('pfVst3', () => GP.useVST3 !== false, v => { GP.useVST3 = v; saveGP(); });
      tog('pfAU', () => GP.useAU !== false, v => { GP.useAU = v; saveGP(); });
      $('#pfAddFolder').onclick = async () => { const d = await NATIVE.folderDialog(); if (!d) return; GP.vst3Folders = [...new Set([...(GP.vst3Folders || []), d])]; saveGP(); showPrefs(); };
      if ($('#pfClearFolders')) $('#pfClearFolders').onclick = () => { GP.vst3Folders = []; saveGP(); showPrefs(); };
      $('#pfRescan').onclick = async () => { await neScan(); showPrefs(); };
      tog('pfPdc', () => GP.pdc !== false, v => { GP.pdc = v; saveGP(); applyPDC(); });
      $('#pfLag').onchange = e => { GP.plugLag = +e.target.value; NE.lag = GP.plugLag; saveGP(); rebuildAll(); schedulePDC(); };
    },
  },
  record: {
    html: () => psec('Record') +
      prow('Count-in', psel('pfCount', [[0, 'None'], [1, '1 bar'], [2, '2 bars'], [4, '4 bars']], S.prefs.countIn || 0)) +
      prow('Metronome volume', `<input id="pfMetVol" type="range" min="0" max="1" step="0.01" value="${S.prefs.metroVol != null ? S.prefs.metroVol : 0.6}">`) +
      prow('Metronome sound', psel('pfMetSnd', [['click', 'Click'], ['wood', 'Wood'], ['beep', 'Beep']], S.prefs.metroSound || 'click')) +
      prow('Metronome only while recording', ptog('pfMetRec', !!S.prefs.metroRecOnly)) +
      prow('Record quantize (MIDI)', psel('pfRecQ', [[0.0625, 'Off'], [4, '1/4'], [2, '1/8'], [1, '1/16'], [0.5, '1/32']], S.prefs.recQuant || 0.0625)) +
      psec('Warp') +
      prow('Auto-warp loops', ptog('pfAutoWarp', GP.autoWarp !== false), 'Loops you drop in follow the song tempo') +
      prow('Default warp mode', psel('pfWMode', [['complex', 'Complex (keeps pitch)'], ['beats', 'Beats (slices at transients)'], ['repitch', 'Re-Pitch (like a turntable)']], GP.warpMode || 'complex')) +
      prow('Create fades on clip edges', ptog('pfEdgeFade', GP.edgeFade !== false), 'A 4 ms fade so cuts never click'),
    bind() {
      $('#pfCount').onchange = e => { S.prefs.countIn = +e.target.value; ui.transport(); markDirty(); };
      $('#pfMetVol').oninput = e => { S.prefs.metroVol = +e.target.value; click(ctx.currentTime + 0.02, true); };
      $('#pfMetSnd').onchange = e => { S.prefs.metroSound = e.target.value; click(ctx.currentTime + 0.02, true); };
      tog('pfMetRec', () => !!S.prefs.metroRecOnly, v => { S.prefs.metroRecOnly = v; });
      $('#pfRecQ').onchange = e => { S.prefs.recQuant = +e.target.value; };
      tog('pfAutoWarp', () => GP.autoWarp !== false, v => { GP.autoWarp = v; saveGP(); });
      $('#pfWMode').onchange = e => { GP.warpMode = e.target.value; saveGP(); };
      tog('pfEdgeFade', () => GP.edgeFade !== false, v => { GP.edgeFade = v; saveGP(); });
    },
  },
  maint: {
    async html() {
      const info = IS_DESKTOP ? await NATIVE.appInfo() : null;
      return psec('Studio B') +
        prow('Version', `<b class="pfval">${info ? esc(info.version) + (info.source === 'live' ? ' (updated in place)' : '') : 'Browser build'}</b>`) +
        (IS_DESKTOP ? prow('Updates', '<button class="btn ghostb tiny" id="pfUpd">Check for updates</button><button class="btn ghostb tiny" id="pfRel">All releases</button>') : '') +
        psec('Maintenance') +
        prow('Reset preferences', '<button class="btn ghostb tiny danger" id="pfReset">Reset</button>', 'Back to the default app settings (your projects are not touched)') +
        psec('Open-source software') +
        `<p class="pftext">MP3 export uses <b>lamejs</b> (LGPL-3.0). Its licence is in the app folder under vendor/lamejs.</p>`;
    },
    bind() {
      if ($('#pfUpd')) $('#pfUpd').onclick = () => { toast('Checking for updates…'); NATIVE.checkUpdate(); };
      if ($('#pfRel')) $('#pfRel').onclick = () => NATIVE.openReleases();
      $('#pfReset').onclick = () => { Object.keys(GP).forEach(k => delete GP[k]); saveGP(); applyLook(); toast('Preferences reset. Audio settings apply after a restart.'); showPrefs(); };
    },
  },
};

/* ---------- applying app-wide settings ---------- */
function applyLook() { document.body.style.zoom = GP.uiScale && GP.uiScale !== 1 ? GP.uiScale : ''; document.body.classList.toggle('calm', !!GP.calm); arr.draw && arr.draw(); }
async function applyOutputDevice() { if (!LIVE_CTX.setSinkId) return false; try { await LIVE_CTX.setSinkId(GP.outId || ''); return true; } catch (e) { console.warn(e); return false; } }
function applyOutputMono() { try { LIVE_CTX.destination.channelCount = GP.outMono ? 1 : Math.min(2, LIVE_CTX.destination.maxChannelCount || 2); LIVE_CTX.destination.channelInterpretation = 'speakers'; } catch (e) { } }
async function reopenDefaultInput() {
  const inp = INPUTS.get('default'); if (inp) { try { inp.stream.getTracks().forEach(t => t.stop()); inp.src.disconnect(); } catch (e) { } INPUTS.delete('default'); }
  if (GP.inId === 'none') { connectInputs(); return; }
  if (S.tracks.some(t => t.kind === 'audio' && t.arm && (t.input || 'default') === 'default')) { try { await getInput('default'); } catch (e) { toast('That input could not be opened'); } }
  connectInputs();
}
function testTone(on) {
  if (PREFS_TONE.osc) { try { PREFS_TONE.g.gain.setTargetAtTime(0, LIVE_CTX.currentTime, 0.02); PREFS_TONE.osc.stop(LIVE_CTX.currentTime + 0.1); } catch (e) { } PREFS_TONE.osc = PREFS_TONE.g = null; }
  if (!on) return; if (LIVE_CTX.state !== 'running') LIVE_CTX.resume();
  const o = LIVE_CTX.createOscillator(), g = LIVE_CTX.createGain(); o.frequency.value = GP.toneHz || 440; g.gain.value = 0; g.gain.setTargetAtTime(dbToGain(GP.toneDb != null ? GP.toneDb : -36), LIVE_CTX.currentTime, 0.02);
  o.connect(g); g.connect(IO.main); o.start(); PREFS_TONE.osc = o; PREFS_TONE.g = g;
}
// Busy work on the audio thread: roughly pct% of each render block, to test how close the system is to dropouts.
let _itersPerMs = 0;
function cpuSimulator(pct) {
  if (!pct) { if (PREFS_CPU.node) { PREFS_CPU.node.disconnect(); PREFS_CPU.node = null; } return; }
  if (!PITCH_OK) return toast('The CPU simulator needs audio worklets');
  if (!_itersPerMs) { const t0 = performance.now(); let x = 0, n = 0; while (performance.now() - t0 < 8) { for (let k = 0; k < 1000; k++) x += Math.sin(k); n += 1000; } _itersPerMs = n / (performance.now() - t0); }
  if (!PREFS_CPU.node) { PREFS_CPU.node = new AudioWorkletNode(LIVE_CTX, 'gw-burn'); const z = LIVE_CTX.createGain(); z.gain.value = 0; PREFS_CPU.node.connect(z); z.connect(LIVE_CTX.destination); }
  const blockMs = 128 / LIVE_CTX.sampleRate * 1000; PREFS_CPU.node.port.postMessage({ n: Math.round(_itersPerMs * blockMs * pct / 100) });
}
// the test tone only plays while Settings is open
document.getElementById('prefs').addEventListener('click', e => { const d = e.currentTarget; if (e.target === d || e.target.closest('[data-close]')) testTone(false); });

/* ---------- Audio settings with the native engine ---------- */
async function nativeAudioHtml() {
  const backends = NE.avail.backends.filter(b => b.id !== 'null' || GP.driver === 'null'), cur = NE.dev ? NE.dev.backend : (GP.driver || neDefaultBackend());
  let devs = { outputs: [], inputs: [] }; try { devs = await NATIVE.engine.devices(cur); } catch (e) { }
  const outs = devs.outputs || [], ins = devs.inputs || [], d = NE.dev || {}, st = NE.on ? await neStatus() : null;
  const dec = S.prefs.latencyMs != null ? S.prefs.latencyMs : 0, plug = NE.lag * 128 / LIVE_CTX.sampleRate * 1000;
  const pairs = n => { const o = []; for (let c = 1; c <= n; c += 2) o.push(['ext:' + c, `${c}/${Math.min(c + 1, n)}`]); return o; };
  return psec('Audio device') +
    prow('Audio engine', psel('pfEng', [['native', 'Native (recommended)'], ['web', 'Built-in (browser audio)']], 'native'), 'Native runs plug-ins, uses every channel of your interface and sets the buffer size') +
    prow('Driver type', psel('pfDrv', backends.map(b => [b.id, b.name]), cur)) +
    prow('Audio input device', psel('pfIn', [['', 'System default'], ['none', 'No device'], ...ins.map(x => [x.name, `${x.name} (${x.channels} in)`])], GP.inId === 'none' ? 'none' : (GP.inName || ''))) +
    prow('Audio output device', psel('pfOut', [['', 'System default'], ...outs.map(x => [x.name, `${x.name} (${x.channels} out)`])], GP.outName || '')) +
    prow('Main output', psel('pfMainOut', pairs(IO.outCh || 2).map(([v, l]) => [v, 'Out ' + l]), GP.mainOut || 'ext:1'), 'Where the main mix plays') +
    prow('Cue output', psel('pfCueOut', pairs(IO.outCh || 2).map(([v, l]) => [v, 'Out ' + l]), GP.cueOut || GP.mainOut || 'ext:1'), 'Browser preview, and the metronome when it is sent to cue') +
    prow('Metronome to cue', ptog('pfClickCue', !!GP.clickCue)) +
    psec('Sample rate') +
    prow('In/out sample rate', psel('pfSr', [[44100, '44100'], [48000, '48000'], [88200, '88200'], [96000, '96000']], d.sampleRate || GP.sr || LIVE_CTX.sampleRate) + ((d.sampleRate && d.sampleRate !== LIVE_CTX.sampleRate) ? ` <span class="pfnote">mixer at ${LIVE_CTX.sampleRate}: restart to match</span>` : '')) +
    psec('Latency') +
    prow('Buffer size', psel('pfBuf', [[64, '64 samples'], [128, '128 samples'], [256, '256 samples'], [512, '512 samples'], [1024, '1024 samples'], [2048, '2048 samples']], d.buffer || GP.buffer || 256)) +
    prow('Input latency', `<b class="pfval">${(d.inLatency || 0).toFixed(2)} ms</b>`) +
    prow('Output latency', `<b class="pfval">${(d.outLatency || 0).toFixed(1)} ms</b>`) +
    prow('Driver error compensation', `<input id="pfDec" type="number" step="0.1" min="-200" max="500" value="${dec}"><span class="pfunit">ms</span>`, 'Shifts recordings so they line up with what you heard') +
    prow('Overall latency', `<b class="pfval" id="pfOver">${((d.inLatency || 0) + (d.outLatency || 0) + plug + dec).toFixed(1)} ms</b>`, `Includes ${plug.toFixed(1)} ms of plug-in buffer`) +
    prow('Status', `<span class="pfnote" id="pfStat">${NE.on ? `${esc(d.outputName || '')} · ${d.outputs} out / ${d.inputs} in · CPU ${Math.round((st && st.cpu || 0) * 100)}% · dropouts ${st ? st.underruns : 0}` : esc(NE.error || 'Not running')}</span>`) +
    (d.sampleRate && d.sampleRate !== LIVE_CTX.sampleRate ? `<div class="pfwarn">Studio B's mixer runs at ${LIVE_CTX.sampleRate} Hz and converts to ${d.sampleRate} Hz. Restart to run both at the same rate. <button class="btn prim tiny" id="pfRestart">Restart now</button></div>` : '') +
    psec('Test') +
    prow('Test tone', ptog('pfTone', !!PREFS_TONE.osc)) +
    prow('Tone volume', `<input id="pfToneVol" type="range" min="-60" max="0" step="1" value="${GP.toneDb != null ? GP.toneDb : -36}"><b class="pfval" id="pfToneVolV">${GP.toneDb != null ? GP.toneDb : -36} dB</b>`) +
    prow('Tone frequency', `<input id="pfToneHz" type="range" min="20" max="2000" step="1" value="${GP.toneHz || 440}"><b class="pfval" id="pfToneHzV">${GP.toneHz || 440} Hz</b>`) +
    prow('CPU usage simulator', `<input id="pfCpu" type="range" min="0" max="90" step="5" value="${GP.cpuSim || 0}"><b class="pfval" id="pfCpuV">${GP.cpuSim || 0}%</b>`, 'Loads the audio thread to test for dropouts');
}
function nativeAudioBind() {
  const reopen = async () => { showBusy('Opening the audio device…'); try { await neRestart(); } finally { showBusy(null); } showPrefs(); };
  $('#pfEng').onchange = async e => { GP.engine = e.target.value; saveGP(); if (GP.engine === 'web') { await neStop(); toast('Using the built-in engine. Plug-ins are paused.'); } showPrefs(); };
  $('#pfDrv').onchange = e => { GP.driver = e.target.value; GP.outName = ''; GP.inName = ''; saveGP(); reopen(); };
  $('#pfIn').onchange = e => { if (e.target.value === 'none') GP.inId = 'none'; else { GP.inId = null; GP.inName = e.target.value; } saveGP(); reopen(); };
  $('#pfOut').onchange = e => { GP.outName = e.target.value; saveGP(); reopen(); };
  $('#pfMainOut').onchange = e => { GP.mainOut = e.target.value; saveGP(); ioWire(); };
  $('#pfCueOut').onchange = e => { GP.cueOut = e.target.value; saveGP(); ioWire(); };
  tog('pfClickCue', () => !!GP.clickCue, v => { GP.clickCue = v; saveGP(); buildMaster(); rebuildAll(); });
  $('#pfSr').onchange = e => { GP.sr = +e.target.value; saveGP(); reopen(); };
  $('#pfBuf').onchange = e => { GP.buffer = +e.target.value; saveGP(); reopen(); };
  $('#pfDec').onchange = e => { S.prefs.latencyMs = +e.target.value; markDirty(); };
  if ($('#pfRestart')) $('#pfRestart').onclick = () => confirmLeave(() => { V.dirty = false; NATIVE.restart(); });
  tog('pfTone', () => !!PREFS_TONE.osc, v => testTone(v));
  $('#pfToneVol').oninput = e => { GP.toneDb = +e.target.value; $('#pfToneVolV').textContent = GP.toneDb + ' dB'; saveGP(); if (PREFS_TONE.g) PREFS_TONE.g.gain.setTargetAtTime(dbToGain(GP.toneDb), LIVE_CTX.currentTime, 0.02); };
  $('#pfToneHz').oninput = e => { GP.toneHz = +e.target.value; $('#pfToneHzV').textContent = GP.toneHz + ' Hz'; saveGP(); if (PREFS_TONE.osc) PREFS_TONE.osc.frequency.setTargetAtTime(GP.toneHz, LIVE_CTX.currentTime, 0.02); };
  $('#pfCpu').oninput = e => { GP.cpuSim = +e.target.value; $('#pfCpuV').textContent = GP.cpuSim + '%'; cpuSimulator(GP.cpuSim); };
  clearInterval(nativeAudioBind._t); nativeAudioBind._t = setInterval(async () => { const el = $('#pfStat'); if (!el || $('#prefs').hidden) return clearInterval(nativeAudioBind._t); const st = await neStatus(); if (st && NE.dev) el.textContent = `${NE.dev.outputName} · ${NE.dev.outputs} out / ${NE.dev.inputs} in · CPU ${Math.round(st.cpu * 100)}% · dropouts ${st.underruns}`; }, 1000);
}
