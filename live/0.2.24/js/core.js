'use strict';
/* ============ core utilities ============ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const uid = () => Math.random().toString(36).slice(2, 10);
const deep = o => JSON.parse(JSON.stringify(o));
const dbToGain = db => Math.pow(10, db / 20);
const gainToDb = g => 20 * Math.log10(Math.max(g, 1e-6));
const PC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = m => PC[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11], mixolydian: [0, 2, 4, 5, 7, 9, 10],
  'harmonic minor': [0, 2, 3, 5, 7, 8, 11], 'major pentatonic': [0, 2, 4, 7, 9],
  'minor pentatonic': [0, 3, 5, 7, 10], blues: [0, 3, 5, 6, 7, 10], chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
};
const inScale = (p, root = S.root, scale = S.scale) => SCALES[scale].includes((((p - root) % 12) + 12) % 12);
function snapToScale(p, root = S.root, scale = S.scale) {
  for (let d = 0; d < 12; d++) { if (inScale(p - d, root, scale)) return p - d; if (inScale(p + d, root, scale)) return p + d; }
  return p;
}
function scaleStep(p, steps, root = S.root, scale = S.scale) { // move p by n scale degrees
  let q = snapToScale(p, root, scale), dir = Math.sign(steps), n = Math.abs(steps);
  while (n > 0) { q += dir; if (inScale(q, root, scale)) n--; }
  return q;
}
const COLORS = ['#ff8a5c', '#f2c14e', '#86cf86', '#56c2d6', '#9b8cff', '#e47cc8', '#d6a16a', '#79a6ff'];
const GRIDS = [['1/4', 4], ['1/8', 2], ['1/8T', 4 / 3], ['1/16', 1], ['1/16T', 2 / 3], ['1/32', 0.5]];
const DIVS = { '1/1': 16, '1/2': 8, '1/4': 4, '1/4D': 6, '1/4T': 8 / 3, '1/8': 2, '1/8D': 3, '1/8T': 4 / 3, '1/16': 1, '1/16D': 1.5, '1/16T': 2 / 3, '1/32': 0.5 };
const divSec = div => (DIVS[div] || 2) * 15 / S.bpm;

function toast(msg, ms = 2600) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), ms);
}
function hold(param, t) { // cancel and hold an AudioParam at time t
  if (param.cancelAndHoldAtTime) param.cancelAndHoldAtTime(t); else { param.cancelScheduledValues(t); }
}
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } };

/* ============ FFT (radix-2, in place) ============ */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), h = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let j = 0; j < h; j++) {
        const a = i + j, b = a + h;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}
const hann = n => { const w = new Float32Array(n); for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)); return w; };

/* ============ audio context ============ */
// `ctx` is swapped for an OfflineAudioContext while rendering an export, so every node factory reads it at call time.
// App-wide preferences (Settings). Sample rate and buffer size are read once, when audio starts.
const GP = (() => { try { return JSON.parse(localStorage.getItem('sb-prefs') || '{}') || {}; } catch (e) { return {}; } })();
GP._bootBuffer = GP.buffer || null;
function saveGP() { try { const o = { ...GP }; delete o._bootBuffer; localStorage.setItem('sb-prefs', JSON.stringify(o)); } catch (e) { } }
let ctx = (() => { const AC = window.AudioContext || window.webkitAudioContext, sr = GP.sr || undefined; try { return new AC({ latencyHint: GP.buffer ? GP.buffer / (sr || 48000) : 'interactive', sampleRate: sr }); } catch (e) { return new AC({ latencyHint: 'interactive' }); } })();
const LIVE_CTX = ctx;
function setCtx(c) { ctx = c; }
const isOffline = () => ctx !== LIVE_CTX;
let PITCH_OK = false;
const NOISE = new WeakMap();
function noiseBuffer() {
  let b = NOISE.get(ctx); if (b) return b;
  b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  NOISE.set(ctx, b); return b;
}

/* Pitch worklet: YIN pitch detection + dual-tap delay-line shifter.
   Modes: correct (snap to key/scale at retune speed), shift (fixed interval). */
const PITCH_WORKLET = `
class GWPitch extends AudioWorkletProcessor {
  constructor(){
    super();
    this.N=2048; this.ana=new Float32Array(this.N); this.aw=0; this.cnt=0;
    this.D=16384; this.dl=new Float32Array(this.D); this.w=0;
    this.win=Math.round(sampleRate*0.032); this.phase=0;
    this.ratio=1; this.target=1; this.corr=1;
    this.mode='correct'; this.root=0; this.scale=[0,2,3,5,7,8,10]; this.speed=20; this.semis=0; this.fine=0;
    this.f=0; this.m=0; this.tm=0; this.rep=0; this.x=new Float32Array(912); this.d=new Float32Array(400);
    this.port.onmessage=e=>{ Object.assign(this,e.data); };
  }
  detect(){
    const x=this.x, W=512, maxT=400, minT=Math.floor(sampleRate/2/1000);
    let rms=0;
    for(let i=0;i<912;i++){ const a=(this.aw-1824+i*2+this.N*4)%this.N, b=(a+1)%this.N; x[i]=(this.ana[a]+this.ana[b])*0.5; rms+=x[i]*x[i]; }
    rms=Math.sqrt(rms/912); if(rms<0.008){ this.f=0; return; }
    const d=this.d; let run=0; d[0]=1;
    for(let t=1;t<maxT;t++){ let s=0; for(let i=0;i<W;i++){ const v=x[i]-x[i+t]; s+=v*v; } run+=s; d[t]= run>0? s*t/run : 1; }
    let tau=-1;
    for(let t=minT;t<maxT-1;t++){ if(d[t]<0.15){ while(t+1<maxT-1 && d[t+1]<d[t]) t++; tau=t; break; } }
    if(tau<0){ this.f=0; return; }
    const a=d[tau-1], b=d[tau], c=d[tau+1], den=a+c-2*b; const sh= den!==0? 0.5*(a-c)/den : 0;
    this.f = (sampleRate/2)/(tau+sh);
  }
  computeTarget(){
    const shift=Math.pow(2,(this.semis+this.fine/100)/12);
    if(this.mode==='shift'){ this.corr=1; this.target=shift; return; }
    if(this.f>50 && this.f<1100){
      const m=69+12*Math.log2(this.f/440); this.m=m;
      let best=Math.round(m), bd=99;
      for(let o=-1;o<=1;o++) for(const s of this.scale){
        const base=Math.floor(m/12)*12+o*12+((this.root+s)%12); const dd=Math.abs(base-m); if(dd<bd){bd=dd;best=base;}
      }
      this.tm=best; this.corr=Math.pow(2,(best-m)/12);
    }
    this.target=this.corr*shift;
  }
  process(inputs, outputs){
    const inp=inputs[0], out=outputs[0]; if(!out||!out[0]) return true;
    const n=out[0].length, c0=inp&&inp[0], c1=inp&&(inp[1]||inp[0]);
    const sp=Math.max(0.0005,(this.mode==='robot'?0.5:this.speed)/1000), coef=1-Math.exp(-1/(sp*sampleRate));
    const win=this.win, D=this.D;
    for(let i=0;i<n;i++){
      const x= c0? (c0[i]+c1[i])*0.5 : 0;
      this.ana[this.aw]=x; this.aw=(this.aw+1)%this.N;
      this.dl[this.w]=x;
      this.ratio+= (this.target-this.ratio)*coef;
      this.phase+= (1-this.ratio)/win; this.phase-=Math.floor(this.phase);
      const p2=(this.phase+0.5)%1;
      const y=this.tap(1+this.phase*win)*Math.sin(Math.PI*this.phase)**2 + this.tap(1+p2*win)*Math.sin(Math.PI*p2)**2;
      this.w=(this.w+1)%D;
      for(let c=0;c<out.length;c++) out[c][i]=y;
      if(++this.cnt>=512){ this.cnt=0; if(this.mode!=='shift'||true) this.detect(); this.computeTarget(); }
    }
    this.rep+=n; if(this.rep>4096){ this.rep=0; this.port.postMessage({f:this.f,m:this.m,tm:this.tm,ratio:this.ratio}); }
    return true;
  }
  tap(d){ const r=this.w-d; const i=Math.floor(r), fr=r-i; const D=this.D; const a=this.dl[((i%D)+D)%D], b=this.dl[(((i+1)%D)+D)%D]; return a+(b-a)*fr; }
}
registerProcessor('gw-pitch', GWPitch);
class GWRec extends AudioWorkletProcessor {
  constructor(){ super(); this.on=false; this.L=new Float32Array(4096); this.R=new Float32Array(4096); this.n=0; this.port.onmessage=e=>{ if(e.data.on!==undefined){ if(!e.data.on) this.flush(); this.on=e.data.on; } }; }
  flush(){ if(this.n){ this.port.postMessage({L:this.L.slice(0,this.n),R:this.R.slice(0,this.n)}); this.n=0; } }
  process(inputs, outputs){
    const i=inputs[0];
    if(this.on && i && i[0]){ const a=i[0], b=i[1]||i[0]; for(let k=0;k<a.length;k++){ this.L[this.n]=a[k]; this.R[this.n]=b[k]; if(++this.n===4096) this.flush(); } }
    return true;
  }
}
registerProcessor('gw-rec', GWRec);
class GWLoud extends AudioWorkletProcessor {
  constructor(){ super();
    const bq=(type,f0,G,Q)=>{ const A=Math.pow(10,G/40),w=2*Math.PI*f0/sampleRate,cs=Math.cos(w),al=Math.sin(w)/(2*Q); let b0,b1,b2,a0,a1,a2;
      if(type==='hs'){ const s=2*Math.sqrt(A)*al; b0=A*((A+1)+(A-1)*cs+s); b1=-2*A*((A-1)+(A+1)*cs); b2=A*((A+1)+(A-1)*cs-s); a0=(A+1)-(A-1)*cs+s; a1=2*((A-1)-(A+1)*cs); a2=(A+1)-(A-1)*cs-s; }
      else { b0=(1+cs)/2; b1=-(1+cs); b2=(1+cs)/2; a0=1+al; a1=-2*cs; a2=1-al; }
      return [b0/a0,b1/a0,b2/a0,a1/a0,a2/a0]; };
    this.f1=bq('hs',1681.974,3.99984,0.7071752); this.f2=bq('hp',38.13547,0,0.5003270);
    this.z=[[0,0,0,0],[0,0,0,0],[0,0,0,0],[0,0,0,0]]; this.blk=Math.round(sampleRate*0.1); this.acc=0; this.n=0; this.blocks=[]; this.gated=[]; this.peak=0;
    this.port.onmessage=e=>{ if(e.data.reset){ this.gated=[]; this.peak=0; } };
  }
  filt(x,f,z){ const y=f[0]*x+z[0]; z[0]=f[1]*x-f[3]*y+z[1]; z[1]=f[2]*x-f[4]*y; return y; }
  process(inputs){
    const i=inputs[0]; if(!i||!i[0]) return true; const L=i[0], R=i[1]||i[0];
    for(let k=0;k<L.length;k++){
      const a=Math.abs(L[k]), b=Math.abs(R[k]); if(a>this.peak) this.peak=a; if(b>this.peak) this.peak=b;
      const l=this.filt(this.filt(L[k],this.f1,this.z[0]),this.f2,this.z[1]), r=this.filt(this.filt(R[k],this.f1,this.z[2]),this.f2,this.z[3]);
      this.acc+=l*l+r*r; if(++this.n>=this.blk){ this.blocks.push(this.acc/this.n); if(this.blocks.length>30) this.blocks.shift(); this.acc=0; this.n=0; this.report(); }
    }
    return true;
  }
  report(){
    const lu=ms=>ms>0? -0.691+10*Math.log10(ms) : -Infinity, mean=a=>a.reduce((x,y)=>x+y,0)/(a.length||1);
    const mom=mean(this.blocks.slice(-4)), st=mean(this.blocks), mLU=lu(mom);
    if(this.blocks.length>=4 && mLU>-70){ this.gated.push(mom); if(this.gated.length>36000) this.gated.shift(); }
    let I=-Infinity; if(this.gated.length){ const rel=lu(mean(this.gated))-10; const g=this.gated.filter(v=>lu(v)>rel); I=lu(mean(g)); }
    this.port.postMessage({m:mLU,s:lu(st),i:I,peak:this.peak});
  }
}
registerProcessor('gw-loud', GWLoud);
// Dynamics: gate, or a compressor whose detector can listen to a second (sidechain) input.
class GWDyn extends AudioWorkletProcessor {
  constructor(){ super(); Object.assign(this,{mode:'gate',thr:-40,ratio:4,att:1,rel:100,hold:10,floor:-60,makeup:0,knee:6,flip:false,sc:false,env:0,g:1,holdN:0,rep:0,gr:0}); this.port.onmessage=e=>Object.assign(this,e.data); }
  process(inputs, outputs){
    const inp=inputs[0], sc=inputs[1], out=outputs[0]; if(!out||!out[0]) return true;
    const n=out[0].length, L=inp&&inp[0], R=inp&&(inp[1]||inp[0]), dL=this.sc&&sc&&sc[0]?sc[0]:L, dR=this.sc&&sc&&sc[0]?(sc[1]||sc[0]):R;
    const aC=Math.exp(-1/(Math.max(0.05,this.att)*sampleRate/1000)), rC=Math.exp(-1/(Math.max(1,this.rel)*sampleRate/1000)), holdS=this.hold*sampleRate/1000, fl=Math.pow(10,this.floor/20), mk=Math.pow(10,this.makeup/20);
    let minG=1;
    for(let i=0;i<n;i++){
      const lev=dL?Math.max(Math.abs(dL[i]),Math.abs(dR[i])):0;
      this.env= lev>this.env ? aC*this.env+(1-aC)*lev : rC*this.env+(1-rC)*lev;
      const db=20*Math.log10(this.env+1e-9); let tg;
      if(this.mode==='gate'){ let open=db>this.thr; if(this.flip) open=!open; if(open){ this.holdN=holdS; tg=1; } else if(this.holdN>0){ this.holdN--; tg=1; } else tg=fl; }
      else { const over=db-this.thr, k=this.knee/2; let red=0; if(over>k) red=over*(1-1/this.ratio); else if(over>-k) red=(1-1/this.ratio)*Math.pow(over+k,2)/(4*k||1); tg=Math.pow(10,-red/20)*mk; }
      const c= tg<this.g ? aC : rC; this.g=c*this.g+(1-c)*tg; if(this.g<minG) minG=this.g;
      for(let ch=0;ch<out.length;ch++){ const x=inp&&inp[ch]?inp[ch][i]:(L?L[i]:0); out[ch][i]=x*this.g; }
    }
    this.rep+=n; if(this.rep>2048){ this.rep=0; this.port.postMessage({gr:-20*Math.log10(Math.max(1e-6,minG/(this.mode==='comp'?mk:1)))}); }
    return true;
  }
}
registerProcessor('gw-dyn', GWDyn);
class GWBurn extends AudioWorkletProcessor { constructor(){ super(); this.n=0; this.port.onmessage=e=>{ this.n=e.data.n|0; }; } process(){ let x=0; for(let k=0;k<this.n;k++) x+=Math.sin(k); if(x===1.2345) this.port.postMessage(x); return true; } }
registerProcessor('gw-burn', GWBurn);

// ---- native engine bridge (Studio B 0.3+): rings in a SharedArrayBuffer, see native/src/shared.h ----
class GWOut extends AudioWorkletProcessor {   // mix and routed tracks -> device outputs
  constructor(o) { super(); const q = o.processorOptions; this.I = new Int32Array(q.sab); this.F = new Float32Array(q.sab); this.ring = q.ring; this.base = q.header; }
  process(inputs) {
    const I = this.I, F = this.F, ch = I[4] || 2, inp = inputs[0] || [], w = I[0] >>> 0, r = Atomics.load(I, 1) >>> 0, mask = this.ring - 1;
    if (((w - r) >>> 0) + 128 >= this.ring) return true;          // the device is not taking audio: drop
    for (let i = 0; i < 128; i++) { const o = this.base + ((w + i) & mask) * ch; for (let c = 0; c < ch; c++) F[o + c] = inp[c] ? inp[c][i] : 0; }
    Atomics.store(I, 0, (w + 128) | 0); return true;
  }
}
registerProcessor('gw-out', GWOut);
class GWIn extends AudioWorkletProcessor {    // device inputs -> Web Audio
  constructor(o) { super(); const q = o.processorOptions; this.I = new Int32Array(q.sab); this.F = new Float32Array(q.sab); this.ring = q.ring; this.base = q.header + q.ring * q.maxCh; }
  process(_, outputs) {
    const I = this.I, F = this.F, out = outputs[0], ch = I[5] || 1, mask = this.ring - 1; let r = Atomics.load(I, 3) >>> 0; const w = Atomics.load(I, 2) >>> 0; let avail = (w - r) >>> 0;
    if (avail > 4096) { r = (w - 512) >>> 0; avail = 512; }     // fell behind: jump to recent audio
    if (avail < 128) { for (const o of out) o.fill(0); return true; }
    for (let i = 0; i < 128; i++) { const o = this.base + ((r + i) & mask) * ch; for (let c = 0; c < out.length; c++) out[c][i] = c < ch ? F[o + c] : 0; }
    Atomics.store(I, 3, (r + 128) | 0); return true;
  }
}
registerProcessor('gw-in', GWIn);
class GWPlug extends AudioWorkletProcessor {  // one plug-in slot: send each block, play back the block from lag blocks ago
  constructor(o) {
    super(); const q = o.processorOptions; this.I = new Int32Array(q.sab); this.F = new Float32Array(q.sab); this.b = q.slotBase; this.nb = q.slotBlocks; this.bw = q.blockWords;
    this.ev = this.b + q.slotHeader; this.evCap = q.evCap; this.bev = q.blockEv; this.pend = [];
    this.req = this.ev + 4 * q.evCap; this.res = this.req + this.nb * this.bw; this.lag = q.lag; this.offline = q.offline; this.seq = 0;
    this.qL = []; this.qR = []; this.qS = []; this.dl = new Float32Array(2 * 128 * (this.lag + 1)); this.dp = 0;
    this.port.onmessage = e => { if (e.data === 'reset') { this.seq = 0; this.qS.length = this.qL.length = this.qR.length = 0; } };
  }
  process(inputs, outputs) {
    const I = this.I, F = this.F, b = this.b, out = outputs[0], inp = inputs[0] || [], L = inp[0], R = inp[1] || inp[0];
    if (!Atomics.load(I, b + 4)) {   // not loaded yet: pass the audio through, delayed like a loaded plug-in so timing stays put
      const n = this.dl.length / 2, o = this.dp * 128;
      for (let i = 0; i < 128; i++) { const j = (o + i) % n, jl = j, jr = n + j; const yl = this.dl[jl], yr = this.dl[jr]; this.dl[jl] = L ? L[i] : 0; this.dl[jr] = R ? R[i] : 0; out[0][i] = yl; if (out[1]) out[1][i] = yr; }
      this.dp = (this.dp + 1) % (this.lag + 1); return true;
    }
    if ((Atomics.load(I, b + 5) | 0) !== (this.offline ? 1 : 0)) { for (const o of out) o.fill(0); return true; }   // an export owns the slot right now
    const w = Atomics.load(I, b) >>> 0, r = Atomics.load(I, b + 1) >>> 0;
    if (((w - r) >>> 0) < this.nb) {
      const at = this.req + (w & (this.nb - 1)) * this.bw, fr = currentFrame;
      I[at] = fr % 4294967296 | 0; I[at + 1] = Math.floor(fr / 4294967296); I[at + 2] = 128; I[at + 3] = this.seq;
      for (let i = 0; i < 128; i++) { F[at + 4 + i] = L ? L[i] : 0; F[at + 132 + i] = R ? R[i] : 0; }
      // MIDI: take everything the page queued, keep it sorted, and pack the events that fall in this block
      let ew = Atomics.load(I, b + 8) >>> 0, er = Atomics.load(I, b + 9) >>> 0;
      while (er !== ew) { const e = this.ev + (er & (this.evCap - 1)) * 4; const f = (I[e] >>> 0) + (I[e + 1] >>> 0) * 4294967296, m = I[e + 2]; let k = this.pend.length; while (k && this.pend[k - 1][0] > f) k--; this.pend.splice(k, 0, [f, m]); er = (er + 1) >>> 0; }
      Atomics.store(I, b + 9, er | 0);
      let n = 0; const end = fr + 128, eo = at + 260;
      while (this.pend.length && this.pend[0][0] < end && n < this.bev) { const [f, m] = this.pend.shift(); I[eo + 1 + 2 * n] = Math.max(0, Math.min(127, f - fr)); I[eo + 2 + 2 * n] = m; n++; }
      I[eo] = n;
      Atomics.store(I, b, (w + 1) | 0);
    }
    const want = this.seq - this.lag; this.seq++;
    const pull = () => { let rw = Atomics.load(I, b + 2) >>> 0, rr = Atomics.load(I, b + 3) >>> 0;
      while (rr !== rw) { const at = this.res + (rr & (this.nb - 1)) * this.bw; const s = I[at + 3]; if (s >= want) { this.qS.push(s); this.qL.push(F.slice(at + 4, at + 132)); this.qR.push(F.slice(at + 132, at + 260)); } rr = (rr + 1) >>> 0; Atomics.store(I, b + 3, rr | 0); rw = Atomics.load(I, b + 2) >>> 0; } };
    pull();
    if (this.offline && want >= 0) { let n = 0; while (!this.qS.some(s => s >= want) && n++ < 3e7) pull(); }
    while (this.qS.length && this.qS[0] < want) { this.qS.shift(); this.qL.shift(); this.qR.shift(); }
    if (want >= 0 && this.qS.length && this.qS[0] === want) { out[0].set(this.qL.shift()); const rr = this.qR.shift(); if (out[1]) out[1].set(rr); this.qS.shift(); }
    else { for (const o of out) o.fill(0); if (want >= 0) Atomics.add(I, b + 7, 1); }
    return true;
  }
}
registerProcessor('gw-plug', GWPlug);
`;
const WORKLET_DONE = new WeakSet();
async function loadWorklets(c) {
  if (WORKLET_DONE.has(c)) return true;
  try {
    try { await c.audioWorklet.addModule(URL.createObjectURL(new Blob([PITCH_WORKLET], { type: 'application/javascript' }))); }
    catch (e1) { await c.audioWorklet.addModule('data:application/javascript;charset=utf-8,' + encodeURIComponent(PITCH_WORKLET)); }
    WORKLET_DONE.add(c); return true;
  } catch (e) { console.warn('worklets', e && e.message); return false; }
}
const audioReady = (async () => { PITCH_OK = await loadWorklets(ctx); })();
