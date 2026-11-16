// A worker with Node access: loads the native engine addon and runs its pump thread against our SharedArrayBuffer.
let E = null;
onmessage = e => {
  const m = e.data;
  try {
    if (m.type === 'attach') { E = require(m.addon); const ok = E.attach(m.shm, new Int32Array(m.sab)); postMessage({ type: 'attached', ok }); return; }
    if (!E) return;
    if (m.type === 'ev') E.sendEvents(m.slot, m.data);
    else if (m.type === 'par') E.sendParam(m.slot, m.frame, m.index, m.value);
    else if (m.type === 'tr') E.setTransport(m.bpm, m.ppq, m.frame, m.playing, m.num, m.den);
    else if (m.type === 'reset') E.bridgeReset(m.slot);
    else if (m.type === 'status') postMessage({ type: 'status', id: m.id, status: E.status() });
    else if (m.type === 'detach') E.detach();
  } catch (err) { postMessage({ type: 'error', message: err.message }); }
};
