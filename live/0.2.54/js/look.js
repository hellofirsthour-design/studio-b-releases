/* ============ Live screens on devices, and the help and status bar ============ */

/* ---------- device screens ---------- */
const SCREEN_TYPES = { comp: 'dyn', iron: 'dyn', limit: 'dyn', apex: 'dyn', verb: 'decay', spaces: 'decay', orbit: 'decay', lfo: 'scope', shaper: 'scope', envf: 'scope' };
function devScreen(body, d, r) {
  const kind = SCREEN_TYPES[d.type]; if (!kind) return;
  const cv = document.createElement('canvas'); cv.className = 'dscreen'; body.appendChild(cv);
  const trail = [];
  VIS.add(() => {
    if (!cv.isConnected) return false;
    const dpr = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight; if (!W) return;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 1; for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(Math.round(W * i / 4) + .5, 0); g.lineTo(Math.round(W * i / 4) + .5, H); g.moveTo(0, Math.round(H * i / 4) + .5); g.lineTo(W, Math.round(H * i / 4) + .5); g.stroke(); }
    const acc = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#f2b544', p = d.p;
    if (kind === 'dyn') { // input level (dB) across, output level up: the transfer curve, with the gain reduction as a bar on the right
      const lo = -60, gw = W - 18, X = db => (db - lo) / -lo * gw, Y = db => H - 4 - (db - lo) / -lo * (H - 8);
      const thr = d.type === 'limit' || d.type === 'apex' ? p.ceiling || 0 : p.thresh, ratio = d.type === 'limit' || d.type === 'apex' ? 100 : p.ratio || 4, knee = p.knee || 0, pre = d.type === 'iron' ? p.input || 0 : d.type === 'apex' ? -(p.thresh || 0) : 0, ceil = d.type === 'apex' ? p.ceiling : 0;
      const outDb = x => { x += pre; const over = x - thr, k = knee / 2; let red = 0; if (over > k) red = over * (1 - 1 / ratio); else if (over > -k && k > 0) red = (1 - 1 / ratio) * (over + k) ** 2 / (4 * k); return Math.min(x - red, d.type === 'apex' ? ceil : 99); };
      g.setLineDash([3, 3]); g.strokeStyle = 'rgba(255,255,255,.14)'; g.beginPath(); g.moveTo(X(lo), Y(lo)); g.lineTo(X(0), Y(0)); g.stroke(); g.setLineDash([]);
      g.strokeStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.moveTo(X(thr - pre) + .5, 0); g.lineTo(X(thr - pre) + .5, H); g.stroke();
      g.strokeStyle = acc; g.lineWidth = 1.8; g.beginPath(); for (let x = lo; x <= 0; x += 0.5) { const y = Y(clamp(outDb(x), lo, 6)); x === lo ? g.moveTo(X(x), y) : g.lineTo(X(x), y); } g.stroke();
      const gr = clamp(r.reductionDb != null ? r.reductionDb : r.gr || 0, 0, 24); g.fillStyle = '#16171b'; g.fillRect(W - 10, 4, 6, H - 8); g.fillStyle = acc; g.fillRect(W - 10, 4, 6, (H - 8) * gr / 24);
    } else if (kind === 'decay') { // the reverb's tail
      const secs = d.type === 'orbit' ? (p.verbOn ? 0.8 + (p.verbSize || 0) * 9 : 0) : p.decay || 2, pre = d.type === 'spaces' ? (p.predelay || 0) / 1000 : d.type === 'verb' ? (p.predelay || 0) / 1000 : 0.02, span = Math.max(1, secs * 1.3 + pre), col = '#a78bfa';
      g.strokeStyle = 'rgba(167,139,250,.28)'; g.beginPath(); for (let x = 0; x < W; x += 2) { const t = x / W * span; if (t < pre) continue; const e = Math.exp(-(t - pre) / Math.max(0.05, secs) * 6.9 / 3); g.moveTo(x + .5, H - 4); g.lineTo(x + .5, H - 4 - e * (H - 14) * (0.35 + 0.65 * Math.abs(Math.sin(x * 12.9898) * 43758.5453 % 1))); } g.stroke();
      g.strokeStyle = col; g.lineWidth = 1.8; g.beginPath(); for (let x = 0; x <= W; x += 2) { const t = x / W * span, e = t < pre ? 0 : Math.exp(-(t - pre) / Math.max(0.05, secs) * 6.9 / 3) * Math.min(1, (t - pre) / 0.01); const y = H - 4 - e * (H - 14); x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
      g.fillStyle = col; g.font = '600 10px ' + (getComputedStyle(document.body).getPropertyValue('--mono') || 'monospace'); g.textAlign = 'right'; g.fillText(secs ? secs.toFixed(1) + ' s' : 'off', W - 6, 13);
    } else { // modulators: a scope of the last few seconds of movement
      trail.push(r.v || 0); if (trail.length > W) trail.shift(); const col = '#56c2d6';
      g.strokeStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.moveTo(0, H / 2 + .5); g.lineTo(W, H / 2 + .5); g.stroke();
      g.strokeStyle = col; g.lineWidth = 1.8; g.beginPath(); trail.forEach((v, i) => { const x = W - trail.length + i, y = H / 2 - v * (H / 2 - 6); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
      const v = trail[trail.length - 1] || 0; g.fillStyle = '#fff'; g.beginPath(); g.arc(W - 2, H / 2 - v * (H / 2 - 6), 3.5, 0, 7); g.fill();
    }
  });
}

/* ---------- help and status bar ---------- */
const HELP = { // a little more than the tooltip for the controls people reach for most
  play: 'Play from the insert marker. Space plays and stops.', rec: 'Record: starts the song recording into armed tracks, after the count-in if one is set. Stop ends it.',
  countIn: 'Record options: count-in (clicks before recording), pre-roll (the song plays a bar or two before the record point) and post-roll (it keeps playing after punch-out, then stops).', writerBtn: 'Writer: chords, melody, bass and beats written as MIDI clips you can edit.', loopBtn: 'Loop the bracketed range. L toggles it.',
};
function helpText(el) {
  const h = el && el.closest && el.closest('[data-help],[title],[aria-label]'); if (!h) return null;
  if (h.id && HELP[h.id]) return [h.getAttribute('aria-label') || h.title || h.id, HELP[h.id]];
  const card = h.closest('.card'), kn = h.closest('.knob, .psel, .tog');
  if (kn && card) { const dev = (card.querySelector('.ch b, .ch .cn') || {}).textContent || ''; const lab = (kn.querySelector('.kl, span, label') || {}).textContent || h.getAttribute('aria-label') || ''; return [dev + (lab ? ' · ' + lab : ''), 'Drag to change, or scroll. Double-click to reset. Right-click to map or automate.']; }
  const t = h.dataset.help || h.title || h.getAttribute('aria-label'); return t ? ['', t] : null;
}
document.addEventListener('mouseover', e => { const el = $('#stHelp'); if (!el) return; const t = helpText(e.target); el.innerHTML = t ? (t[0] ? `<b>${esc(t[0])}</b>` : '') + esc(t[1]) : '<span class="faint">Hover anything to see what it does.</span>'; });
async function statusInfo() {
  const el = $('#stInfo'); if (!el) return;
  let parts = [`${(LIVE_CTX.sampleRate / 1000).toFixed(LIVE_CTX.sampleRate % 1000 ? 1 : 0)} kHz`], ok = LIVE_CTX.state === 'running';
  if (NE.on && NE.dev) { const st = await neStatus().catch(() => null); parts.push(`${NE.dev.buffer || GP.buffer || 256} smp · ${((NE.dev.outLatency || 0)).toFixed(1)} ms`, `${NE.dev.backend || ''} · ${NE.dev.outputName || ''}`.replace(/^ · /, '')); if (st) { parts.push(`CPU <b>${Math.round(st.cpu * 100)}%</b>`); if (st.underruns) parts.push(`dropouts <b>${st.underruns}</b>`); ok = ok && st.cpu < 0.85; } }
  else parts.push(`${Math.round((LIVE_CTX.baseLatency || 0) * 1000 + (LIVE_CTX.outputLatency || 0) * 1000)} ms`, 'Built-in audio');
  parts.push(`${S.tracks.length} tracks`);
  el.innerHTML = parts.map(x => `<span>${x}</span>`).join('') + `<span class="ok ${ok ? '' : 'warn'}" title="${ok ? 'Audio running' : 'Audio is paused or under load'}"></span>`;
}
setInterval(() => { if (typeof S !== 'undefined' && S) statusInfo(); }, 1000);
setTimeout(() => { const el = $('#stHelp'); if (el && !el.innerHTML) el.innerHTML = '<span class="faint">Hover anything to see what it does.</span>'; }, 0);

/* Escape closes the open menu, or the window on top (Writer, Settings, Export, a name box). Questions that need an answer (save changes, recover work) stay. */
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const menu = $('#menu'); if (menu && !menu.hidden) { menu.hidden = true; e.preventDefault(); return; }
  const open = [...document.querySelectorAll('.modal')].filter(m => !m.hidden && !['leave', 'recover'].includes(m.id)); if (!open.length) return;
  const m = open[open.length - 1]; if (m.id === 'prefs' && typeof testTone === 'function') testTone(false); m.hidden = true; e.preventDefault(); e.stopPropagation();
}, true);
