/* ============ Stock sounds: ready-to-play instrument + effect presets, organised by type ============
   Each sound is { cat, name, inst: { type, ...settings }, fx: [[device, settings]], tags }. Many come in three
   characters: clean, Vintage (warm saturation and chorus) and Lo-fi (darker, wobbly, tape echo and crunch). */
const SOUNDS = [];
const SOUND_CATS = ['Bass & 808', 'Keys & Piano', 'Organ', 'Bells & Mallets', 'Pads', 'Leads', 'Plucks', 'Strings & Brass', 'Textures & FX', 'Drum Kits'];
const VERB = (mix = 0.22, decay = 2.4, extra = {}) => ['verb', { mix, decay, ...extra }];
const CHAR = {
  Vintage: [['sat', { style: 'Tape', drive: 7, tone: -0.25, mix: 0.8 }], ['chorus', { rate: 0.35, depth: 0.35, mix: 0.3 }]],
  'Lo-fi': [['filter', { type: 'lowpass', cutoff: 3600, res: 0.9 }], ['patina', { magnitude: 0.75, noise: 0.22, wobble: 0.55, distort: 0.15, magnetic: 0.45, dropouts: 0.2, tone: -0.3 }], ['tape', { div: '1/4', fb: 0.25, wow: 0.7, flutter: 0.5, highcut: 3000, mix: 0.12 }]],
};
function snd(cat, name, inst, fx = [], tags = '', chars = []) {
  SOUNDS.push({ cat, name, inst, fx, tags });
  chars.forEach(c => SOUNDS.push({ cat, name: `${name} (${c})`, inst, fx: [...CHAR[c], ...fx], tags: tags + ' ' + c.toLowerCase() + (c === 'Lo-fi' ? ' lofi' : '') }));
}
const BOTH = ['Vintage', 'Lo-fi'];
const C = (o) => ({ type: 'synth', ...o });

/* ---------- Bass & 808 ---------- */
const B808 = (o = {}) => C({ wave1: 'sine', wave2: 'sine', oct2: 1, mix2: 0.08, detune: 0, sub: 0, noise: 0, cutoff: 2400, res: 0.7, fenv: 0, A: 0.002, D: 2.2, Sus: 0.25, R: 0.5, glide: 0.08, mono: true, lfoAmt: 0, gain: 0.75, ...o });
snd('Bass & 808', '808 Clean', B808(), [], 'trap hip-hop 808 sub');
snd('Bass & 808', '808 Long Glide', B808({ glide: 0.18, D: 3.5, Sus: 0.5 }), [], 'trap 808 slide glide');
snd('Bass & 808', '808 Short Punch', B808({ D: 0.45, Sus: 0, R: 0.12 }), [['comp', { thresh: -16, ratio: 6, attack: 2, release: 80, makeup: 4 }]], 'trap drill 808 punch');
snd('Bass & 808', '808 Distorted', B808({ D: 2.6 }), [['sat', { style: 'Tube', drive: 18, tone: 0.1 }], ['limit', { ceiling: -1 }]], 'trap 808 dirty distorted');
snd('Bass & 808', '808 Fuzz', B808({ D: 2, mix2: 0.2 }), [['sat', { style: 'Fold', drive: 14, mix: 0.7 }], ['filter', { type: 'lowpass', cutoff: 4200, res: 1 }]], 'trap 808 fuzz experimental');
snd('Bass & 808', '808 Tape', B808({ D: 2.4 }), [['sat', { style: 'Tape', drive: 12, tone: -0.3 }]], '808 warm tape', ['Lo-fi']);
snd('Bass & 808', 'Sub Bass', C({ wave1: 'sine', wave2: 'triangle', oct2: 1, detune: 0, mix2: 0.2, sub: 0, cutoff: 900, res: 1, fenv: 300, A: 0.004, D: 0.3, Sus: 0.85, R: 0.12, glide: 0.04, mono: true, gain: 0.7 }), [], 'sub bass r&b');
snd('Bass & 808', 'Reese', C({ wave1: 'sawtooth', wave2: 'sawtooth', detune: 22, mix2: 0.5, sub: 0.4, cutoff: 700, res: 3, fenv: 600, fD: 0.6, A: 0.01, Sus: 0.9, R: 0.2, glide: 0.06, mono: true, lfoRate: 0.3, lfoAmt: 600, gain: 0.45 }), [], 'reese dnb dark');
snd('Bass & 808', 'Moog-ish Bass', C({ wave1: 'sawtooth', wave2: 'square', oct2: -1, detune: 4, mix2: 0.45, sub: 0.2, cutoff: 420, res: 7, fenv: 2600, fA: 0.002, fD: 0.22, A: 0.003, D: 0.4, Sus: 0.7, R: 0.12, mono: true, glide: 0.03, gain: 0.5 }), [], 'analog funk bass', ['Vintage']);
snd('Bass & 808', 'Funk Pluck Bass', C({ wave1: 'square', wave2: 'sawtooth', detune: 2, mix2: 0.3, cutoff: 600, res: 6, fenv: 3200, fD: 0.14, A: 0.002, D: 0.28, Sus: 0.2, R: 0.08, mono: true, gain: 0.55 }), [['comp', { thresh: -20, ratio: 4 }]], 'funk r&b gospel bass slap', ['Vintage']);
snd('Bass & 808', 'Upright Bass', { type: 'pluck', decay: 1.6, bright: 0.25, damp: 0.75, body: 900, pick: 0.22, gain: 0.85 }, [['eq', null], ['comp', { thresh: -18, ratio: 3 }]], 'jazz upright acoustic double bass', BOTH);
snd('Bass & 808', 'Fretless', C({ wave1: 'triangle', wave2: 'sine', oct2: 1, mix2: 0.3, detune: 6, cutoff: 1300, res: 2, fenv: 800, fD: 0.3, A: 0.03, D: 0.8, Sus: 0.6, R: 0.25, glide: 0.12, mono: true, gain: 0.6 }), [['chorus', { rate: 0.5, depth: 0.3, mix: 0.3 }]], 'jazz fretless smooth bass', ['Vintage']);
snd('Bass & 808', 'FM Bass', { type: 'fm', ratio: 1, index: 3.5, modDecay: 0.25, modSustain: 0.15, ratio2: 2, index2: 1, A: 0.002, D: 0.4, S: 0.6, R: 0.1, cutoff: 5000, gain: 0.55 }, [], 'fm bass growl dx');
snd('Bass & 808', 'Wobble Bass', C({ wave1: 'sawtooth', wave2: 'square', oct2: -1, detune: 10, mix2: 0.5, sub: 0.3, cutoff: 500, res: 9, fenv: 0, A: 0.005, Sus: 1, R: 0.1, mono: true, lfoRate: 3, lfoAmt: 2400, gain: 0.45 }), [['sat', { style: 'Transistor', drive: 10 }]], 'dubstep edm wobble growl');
snd('Bass & 808', 'Acid Bass', C({ wave1: 'sawtooth', wave2: 'sawtooth', detune: 0, mix2: 0, cutoff: 380, res: 14, fenv: 4800, fD: 0.18, A: 0.002, D: 0.2, Sus: 0.5, R: 0.06, glide: 0.06, mono: true, gain: 0.45 }), [['sat', { style: 'Tube', drive: 9 }], ['tape', { div: '1/8D', fb: 0.3, mix: 0.12 }]], 'acid 303 house techno');
snd('Bass & 808', 'Deep House Bass', C({ wave1: 'sine', wave2: 'square', oct2: 0, mix2: 0.15, cutoff: 700, res: 2, fenv: 900, fD: 0.15, A: 0.002, D: 0.25, Sus: 0.3, R: 0.1, mono: true, gain: 0.65 }), [], 'deep house amapiano bass');
snd('Bass & 808', 'Log Drum Bass', { type: 'fm', ratio: 2.4, index: 2.2, modDecay: 0.09, modSustain: 0, ratio2: 1, index2: 0, A: 0.001, D: 0.5, S: 0, R: 0.15, cutoff: 4000, gain: 0.6 }, [['sat', { style: 'Tube', drive: 6 }]], 'amapiano log drum afro');
snd('Bass & 808', 'Synth Bass Brass', C({ wave1: 'sawtooth', wave2: 'sawtooth', detune: 12, mix2: 0.5, cutoff: 900, res: 2, fenv: 1800, fA: 0.04, fD: 0.3, A: 0.01, Sus: 0.8, R: 0.15, mono: true, gain: 0.45 }), [], 'synth bass 80s pop', ['Vintage']);
snd('Bass & 808', 'Rubber Bass', { type: 'wave', table: 'basic', pos: 0.1, posEnv: 0.5, posDecay: 0.15, voices: 1, spread: 0, cutoff: 1800, res: 4, A: 0.002, D: 0.35, S: 0.4, R: 0.1, gain: 0.55 }, [], 'rubber bounce r&b pop');
snd('Bass & 808', 'Dark Drone Bass', { type: 'wave', table: 'digital', pos: 0.4, posEnv: -0.3, posDecay: 3, voices: 3, spread: 18, cutoff: 600, res: 3, A: 0.4, D: 2, S: 0.9, R: 1.5, gain: 0.4 }, [['phaser', { rate: 0.1, depth: 0.7, mix: 0.4 }]], 'experimental drone dark ambient');

/* ---------- Keys & Piano ---------- */
const EP = (o) => ({ type: 'epiano', tone: 0.5, tine: 0.4, decay: 2.2, release: 0.25, trem: 0.3, tremRate: 4.5, drive: 0.15, gain: 0.55, ...o });
snd('Keys & Piano', 'Suitcase EP', EP({}), [VERB(0.15)], 'rhodes rnb neo soul electric piano', BOTH);
snd('Keys & Piano', 'Soft Rhodes', EP({ tone: 0.3, tine: 0.2, trem: 0.15, drive: 0.05 }), [VERB(0.2, 2.8)], 'rhodes soft jazz lofi chill', BOTH);
snd('Keys & Piano', 'Bright Tine', EP({ tone: 0.75, tine: 0.7, trem: 0.1, drive: 0.1 }), [VERB(0.12)], 'electric piano bright pop', ['Vintage']);
snd('Keys & Piano', 'Gospel EP', EP({ tone: 0.55, tine: 0.45, trem: 0.25, tremRate: 5.5, drive: 0.25, decay: 2.8 }), [['comp', { thresh: -20, ratio: 3 }], VERB(0.18, 2)], 'gospel church rhodes chords', ['Vintage']);
snd('Keys & Piano', 'Wurly', { type: 'fm', ratio: 1, index: 2.4, modDecay: 0.35, modSustain: 0.25, ratio2: 3, index2: 0.6, A: 0.003, D: 1.3, S: 0.35, R: 0.25, cutoff: 5200, gain: 0.5 }, [['sat', { style: 'Tube', drive: 6 }], ['autopan', { mode: 'tremolo', div: '1/8', amount: 0.25 }]], 'wurlitzer wurli soul rnb', BOTH);
snd('Keys & Piano', 'Dyno EP', EP({ tone: 0.8, tine: 0.65, trem: 0.4, tremRate: 3.5, drive: 0.2 }), [['chorus', { rate: 0.6, depth: 0.4, mix: 0.4 }], VERB(0.2)], 'dyno 80s rnb electric piano');
snd('Keys & Piano', 'Felt Piano', { type: 'pluck', decay: 4.5, bright: 0.3, damp: 0.6, body: 2600, pick: 0.12, gain: 0.7 }, [VERB(0.3, 3.2, { damp: 3500 })], 'felt soft piano lofi ambient', ['Lo-fi']);
snd('Keys & Piano', 'Honky Keys', { type: 'pluck', decay: 3.5, bright: 0.65, damp: 0.35, body: 5200, pick: 0.15, gain: 0.65 }, [['chorus', { rate: 1.4, depth: 0.25, delay: 6, mix: 0.4 }], VERB(0.15)], 'piano honky tonk detuned', BOTH);
snd('Keys & Piano', 'Toy Piano', { type: 'fm', ratio: 3.5, index: 2.5, modDecay: 0.2, modSustain: 0, ratio2: 7, index2: 1, A: 0.001, D: 0.9, S: 0, R: 0.4, cutoff: 9000, gain: 0.45 }, [VERB(0.2)], 'toy piano music box experimental lofi', ['Lo-fi']);
snd('Keys & Piano', 'Clavinet', C({ wave1: 'square', wave2: 'sawtooth', oct2: 1, detune: 3, mix2: 0.3, cutoff: 1600, res: 5, fenv: 4000, fD: 0.12, A: 0.001, D: 0.4, Sus: 0.25, R: 0.06, gain: 0.45 }), [['autopan', { mode: 'tremolo', div: '1/16', amount: 0.15 }]], 'clav funk soul', ['Vintage']);
snd('Keys & Piano', 'Jazz Keys', EP({ tone: 0.4, tine: 0.3, trem: 0, decay: 3, drive: 0.08 }), [VERB(0.25, 2.2)], 'jazz chords smooth', BOTH);
snd('Keys & Piano', 'DX Ballad Piano', { type: 'fm', ratio: 1, index: 1.8, modDecay: 0.6, modSustain: 0.05, ratio2: 14, index2: 0.8, A: 0.002, D: 2.5, S: 0.05, R: 0.6, cutoff: 8000, gain: 0.5 }, [['chorus', { rate: 0.4, depth: 0.3, mix: 0.3 }], VERB(0.25, 3)], '80s ballad dx7 pop', ['Vintage']);
snd('Keys & Piano', 'Synth Keys', C({ wave1: 'triangle', wave2: 'sine', oct2: 1, detune: 3, mix2: 0.35, cutoff: 3200, res: 1, fenv: 1800, fD: 0.5, A: 0.003, D: 0.9, Sus: 0.25, R: 0.35, gain: 0.5 }), [], 'keys simple synth', ['Lo-fi']);

/* ---------- Organ ---------- */
const ORG = (o) => ({ type: 'organ', d1: 8, d2: 8, d3: 8, d4: 0, d5: 0, d6: 0, d7: 0, d8: 0, d9: 0, perc: 'off', percDecay: 0.4, percLevel: 0.5, click: 0.3, drive: 0.15, rotary: 'slow', rotaryDepth: 0.5, tone: 7000, gain: 0.45, ...o });
snd('Organ', 'Gospel B3 (888)', ORG({ d1: 8, d2: 8, d3: 8, drive: 0.3, rotary: 'fast', perc: '3rd', percLevel: 0.4 }), [VERB(0.15, 1.8)], 'gospel church b3 hammond organ shout', ['Vintage']);
snd('Organ', 'Full Drawbars', ORG({ d1: 8, d2: 8, d3: 8, d4: 8, d5: 8, d6: 8, d7: 8, d8: 8, d9: 8, drive: 0.35, rotary: 'fast' }), [], 'gospel full organ rock');
snd('Organ', 'Jazz Organ', ORG({ d1: 8, d2: 8, d3: 8, perc: '3rd', percDecay: 0.25, percLevel: 0.7, click: 0.5, drive: 0.1, rotary: 'slow' }), [VERB(0.12)], 'jazz organ jimmy smith', BOTH);
snd('Organ', 'Soft Worship Organ', ORG({ d1: 6, d2: 0, d3: 8, d4: 4, d5: 0, d6: 2, click: 0, drive: 0.05, rotary: 'slow', rotaryDepth: 0.3, tone: 4000 }), [VERB(0.3, 3.5)], 'worship gospel soft organ pad');
snd('Organ', 'Soul Organ', ORG({ d1: 8, d2: 3, d3: 8, d4: 6, d5: 0, d6: 4, perc: '2nd', percLevel: 0.4, drive: 0.25, rotary: 'slow' }), [], 'soul rnb organ', BOTH);
snd('Organ', 'Rock Organ', ORG({ d1: 8, d2: 8, d3: 8, d4: 8, d5: 0, d6: 0, d7: 0, d8: 0, d9: 8, drive: 0.6, rotary: 'fast', click: 0.6 }), [], 'rock dirty organ');
snd('Organ', 'Reggae Bubble Organ', ORG({ d1: 0, d2: 0, d3: 8, d4: 8, d5: 6, d6: 0, perc: '2nd', percDecay: 0.12, percLevel: 0.6, click: 0.6, rotary: 'off', drive: 0.1 }), [], 'reggae bubble skank organ');
snd('Organ', 'Flute Stop', ORG({ d1: 0, d2: 0, d3: 8, d4: 0, d5: 0, d6: 0, click: 0.1, drive: 0, rotary: 'slow', rotaryDepth: 0.2, tone: 3000 }), [VERB(0.3, 3)], 'organ flute soft', ['Lo-fi']);
snd('Organ', 'Cathedral Organ', ORG({ d1: 8, d2: 6, d3: 8, d4: 6, d5: 4, d6: 6, d7: 2, d8: 2, d9: 4, click: 0, rotary: 'off', drive: 0, tone: 6000 }), [VERB(0.45, 6, { size: 0.95, predelay: 40 })], 'church cathedral pipe organ big');
snd('Organ', 'Combo Organ', ORG({ d1: 0, d2: 0, d3: 8, d4: 8, d5: 0, d6: 8, d7: 0, d8: 0, d9: 8, click: 0.2, rotary: 'off', drive: 0.2, tone: 9000 }), [['autopan', { mode: 'tremolo', div: '1/8', amount: 0.2 }]], '60s combo vox farfisa', BOTH);

/* ---------- Bells & Mallets ---------- */
const FMB = (o) => ({ type: 'fm', ratio: 3.5, index: 3, modDecay: 1.2, modSustain: 0, ratio2: 7, index2: 0.5, fine: 0, A: 0.001, D: 2.5, S: 0, R: 1.2, cutoff: 12000, gain: 0.45, ...o });
snd('Bells & Mallets', 'Trap Bell', FMB({ ratio: 3.5, index: 2.4, modDecay: 0.6, D: 1.6 }), [VERB(0.25, 2.6)], 'trap bell dark hip-hop', ['Lo-fi']);
snd('Bells & Mallets', 'Glass Bell', FMB({ ratio: 5.5, index: 2.2, modDecay: 2, D: 3 }), [VERB(0.3, 3.5), ['tape', { div: '1/4', fb: 0.3, mix: 0.15 }]], 'bell glass bright pop');
snd('Bells & Mallets', 'Tubular Bell', FMB({ ratio: 2.76, index: 4, modDecay: 2.5, D: 5, R: 2 }), [VERB(0.35, 4)], 'tubular bell church');
snd('Bells & Mallets', 'Music Box', FMB({ ratio: 4, index: 1.4, modDecay: 0.4, D: 1.2, ratio2: 12, index2: 0.6 }), [VERB(0.3, 2.5)], 'music box lofi nursery', ['Lo-fi']);
snd('Bells & Mallets', 'Celesta', FMB({ ratio: 4, index: 1.1, modDecay: 0.3, D: 1.4, cutoff: 9000 }), [VERB(0.25, 2.2)], 'celesta orchestral sparkle');
snd('Bells & Mallets', 'Vibraphone', FMB({ ratio: 4, index: 1.2, modDecay: 0.5, D: 3, S: 0, ratio2: 1, index2: 0 }), [['autopan', { mode: 'tremolo', div: '1/8', amount: 0.3 }], VERB(0.2)], 'vibes vibraphone jazz', BOTH);
snd('Bells & Mallets', 'Marimba', FMB({ ratio: 4, index: 1.8, modDecay: 0.06, D: 0.6, R: 0.3, ratio2: 10, index2: 0.4 }), [VERB(0.12)], 'marimba afro amapiano wood', ['Lo-fi']);
snd('Bells & Mallets', 'Kalimba', FMB({ ratio: 6.2, index: 1.6, modDecay: 0.08, D: 0.9, R: 0.4 }), [VERB(0.18)], 'kalimba thumb piano afro lofi', ['Lo-fi']);
snd('Bells & Mallets', 'Steel Drum', FMB({ ratio: 2.3, index: 2.5, modDecay: 0.3, D: 0.9, R: 0.3 }), [VERB(0.15)], 'steel drum pan caribbean');
snd('Bells & Mallets', 'Glockenspiel', FMB({ ratio: 3.5, index: 0.8, modDecay: 0.2, D: 1.8, ratio2: 9, index2: 0.3 }), [VERB(0.2)], 'glock glockenspiel sparkle');
snd('Bells & Mallets', 'Dark Bell Pad', FMB({ ratio: 1.41, index: 2, modDecay: 3, modSustain: 0.2, A: 0.3, D: 4, S: 0.4, R: 3 }), [VERB(0.45, 5)], 'dark bell pad trap ambient experimental');

/* ---------- Pads ---------- */
const PAD = (o) => C({ wave1: 'sawtooth', wave2: 'sawtooth', oct2: 0, detune: 14, mix2: 0.5, sub: 0, noise: 0, cutoff: 1400, res: 1.5, fenv: 300, fA: 0.8, fD: 2, A: 0.9, D: 1.5, Sus: 0.85, R: 2.2, lfoRate: 0.25, lfoAmt: 120, gain: 0.32, ...o });
snd('Pads', 'Warm Pad', PAD({}), [VERB(0.35, 3.5)], 'warm pad rnb', BOTH);
snd('Pads', 'Choir Pad', { type: 'wave', table: 'vocal', pos: 0.35, posEnv: 0.2, posDecay: 4, voices: 4, spread: 16, cutoff: 3500, res: 0.8, A: 0.8, D: 2, S: 0.9, R: 2.5, gain: 0.38 }, [['chorus', { rate: 0.3, depth: 0.5, mix: 0.4 }], VERB(0.4, 4.5)], 'choir vocal aahs gospel worship', BOTH);
snd('Pads', 'Worship Swell', PAD({ wave1: 'sawtooth', wave2: 'triangle', detune: 10, cutoff: 1800, A: 2.4, R: 3.5 }), [['chorus', { rate: 0.2, depth: 0.4, mix: 0.4 }], VERB(0.5, 6, { size: 0.9 })], 'worship ambient swell pad church');
snd('Pads', 'Strings Pad', PAD({ wave1: 'sawtooth', wave2: 'sawtooth', detune: 18, cutoff: 2600, res: 0.8, A: 0.5, R: 1.6 }), [['chorus', { rate: 0.6, depth: 0.5, mix: 0.45 }], VERB(0.3, 3)], 'string machine solina pad', BOTH);
snd('Pads', 'Glass Pad', { type: 'wave', table: 'digital', pos: 0.6, posEnv: -0.2, posDecay: 5, voices: 3, spread: 20, cutoff: 7000, res: 1, A: 1, D: 3, S: 0.8, R: 3, gain: 0.32 }, [VERB(0.4, 5)], 'glass digital shimmer pad pop');
snd('Pads', 'Dark Trap Pad', PAD({ wave1: 'triangle', wave2: 'sawtooth', detune: 9, cutoff: 700, res: 2, A: 1.2, lfoAmt: 200 }), [['filter', { type: 'lowpass', cutoff: 1600, shape: 'sine', div: '2/1', depth: 0.3 }], VERB(0.4, 4)], 'dark trap pad atmosphere');
snd('Pads', 'Lo-fi Haze', PAD({ wave1: 'triangle', wave2: 'sine', oct2: 1, detune: 8, cutoff: 1600, A: 0.6, R: 2 }), [VERB(0.35, 3)], 'lofi haze chill pad', ['Lo-fi']);
snd('Pads', 'Supersaw Pad', { type: 'wave', table: 'basic', pos: 0.75, posEnv: 0, voices: 4, spread: 30, cutoff: 5000, res: 1, A: 0.6, D: 2, S: 0.9, R: 2, gain: 0.3 }, [VERB(0.35, 3.5)], 'supersaw edm trance pop pad');
snd('Pads', 'Analog Brass Pad', PAD({ wave1: 'sawtooth', wave2: 'square', detune: 6, cutoff: 900, fenv: 1600, fA: 0.4, fD: 1, A: 0.3, R: 1.2 }), [VERB(0.25)], '80s brass pad analog', ['Vintage']);
snd('Pads', 'Ambient Drift', { type: 'wave', table: 'vocal', pos: 0.1, posEnv: 0.8, posDecay: 8, voices: 4, spread: 25, cutoff: 2800, res: 2, A: 2.5, D: 4, S: 0.8, R: 5, gain: 0.3 }, [['phaser', { rate: 0.08, depth: 0.8, mix: 0.4 }], VERB(0.55, 8, { size: 1 })], 'ambient drift experimental evolving');
snd('Pads', 'Neo Soul Pad', PAD({ wave1: 'triangle', wave2: 'sawtooth', detune: 7, mix2: 0.3, cutoff: 1200, A: 0.4, R: 1.4 }), [['chorus', { rate: 0.4, depth: 0.4, mix: 0.35 }], VERB(0.3)], 'neo soul rnb pad', BOTH);
snd('Pads', 'Organ Pad', ORG({ d1: 6, d2: 0, d3: 6, d4: 4, d6: 3, click: 0, rotary: 'slow', rotaryDepth: 0.6, tone: 3200, drive: 0 }), [VERB(0.45, 5)], 'organ pad gospel worship soft');
snd('Pads', 'Noise Wash', PAD({ wave1: 'sine', wave2: 'sine', mix2: 0, noise: 0.6, cutoff: 2000, res: 3, A: 2, R: 4, lfoRate: 0.1, lfoAmt: 900 }), [VERB(0.5, 6)], 'noise wash texture experimental ambient');

/* ---------- Leads ---------- */
const LEAD = (o) => C({ wave1: 'sawtooth', wave2: 'square', oct2: 0, detune: 9, mix2: 0.4, cutoff: 2600, res: 3, fenv: 1800, fA: 0.005, fD: 0.3, A: 0.005, D: 0.3, Sus: 0.8, R: 0.2, glide: 0.04, mono: true, lfoRate: 5.5, lfoAmt: 0, gain: 0.4, ...o });
snd('Leads', 'Saw Lead', LEAD({}), [['delay', { mix: 0.18 }], VERB(0.15)], 'saw lead synth', ['Vintage']);
snd('Leads', 'Sine Lead', LEAD({ wave1: 'sine', wave2: 'triangle', oct2: 1, mix2: 0.2, cutoff: 4000, res: 1, fenv: 0, glide: 0.06 }), [['delay', { mix: 0.2 }]], 'sine whistle lead rnb trap', ['Lo-fi']);
snd('Leads', 'G-Funk Whine', LEAD({ wave1: 'sine', wave2: 'sawtooth', mix2: 0.15, cutoff: 3000, res: 4, fenv: 0, glide: 0.12, lfoRate: 5.5, lfoAmt: 25 }), [['delay', { mix: 0.22 }], VERB(0.2)], 'g-funk whine west coast portamento');
snd('Leads', 'Square Lead', LEAD({ wave1: 'square', wave2: 'square', oct2: 1, detune: 5, mix2: 0.25, cutoff: 3500 }), [], 'square chiptune lead', ['Lo-fi']);
snd('Leads', 'Supersaw Lead', { type: 'wave', table: 'basic', pos: 0.75, posEnv: 0, voices: 4, spread: 25, cutoff: 9000, res: 1, A: 0.005, D: 0.5, S: 0.85, R: 0.3, gain: 0.32 }, [['delay', { mix: 0.2 }], VERB(0.2)], 'supersaw edm festival lead');
snd('Leads', 'Vocal Lead', { type: 'wave', table: 'vocal', pos: 0.5, posEnv: 0.3, posDecay: 0.4, voices: 2, spread: 8, cutoff: 5000, res: 2, A: 0.02, D: 0.5, S: 0.8, R: 0.3, gain: 0.38 }, [['chorus', { mix: 0.3 }], VERB(0.2)], 'vocal formant lead experimental');
snd('Leads', 'Brass Stab Lead', LEAD({ wave1: 'sawtooth', wave2: 'sawtooth', detune: 12, cutoff: 800, fenv: 3600, fA: 0.04, fD: 0.25, mono: false }), [VERB(0.15)], 'brass stab lead 80s pop');
snd('Leads', 'Flute Lead', { type: 'wave', table: 'basic', pos: 0, posEnv: 0, voices: 1, cutoff: 2800, res: 1, A: 0.06, D: 0.2, S: 0.9, R: 0.2, gain: 0.42 }, [['chorus', { rate: 5, depth: 0.08, mix: 0.3 }], VERB(0.25)], 'flute soft breathy jazz lofi', BOTH);
snd('Leads', 'Acid Lead', LEAD({ wave1: 'sawtooth', wave2: 'sawtooth', mix2: 0, cutoff: 500, res: 13, fenv: 5000, fD: 0.15 }), [['sat', { style: 'Tube', drive: 10 }], ['delay', { mix: 0.15 }]], 'acid lead experimental');
snd('Leads', 'Sync-ish Lead', LEAD({ wave1: 'sawtooth', wave2: 'square', oct2: 2, detune: 30, mix2: 0.6, cutoff: 3200, res: 5, fenv: 2400 }), [], 'sync lead aggressive edm');
snd('Leads', 'Theremin', LEAD({ wave1: 'sine', wave2: 'sine', mix2: 0, cutoff: 6000, res: 1, fenv: 0, A: 0.08, R: 0.4, glide: 0.25, lfoRate: 6, lfoAmt: 35 }), [VERB(0.35, 3)], 'theremin eerie experimental');

/* ---------- Plucks ---------- */
const PL = (o) => C({ wave1: 'sawtooth', wave2: 'square', oct2: 1, detune: 6, mix2: 0.3, cutoff: 900, res: 3, fenv: 4200, fA: 0.001, fD: 0.16, A: 0.001, D: 0.32, Sus: 0, R: 0.25, gain: 0.45, ...o });
snd('Plucks', 'Classic Pluck', PL({}), [['delay', { mix: 0.18 }], VERB(0.15)], 'pluck synth edm pop', ['Lo-fi']);
snd('Plucks', 'Soft Pluck', PL({ wave1: 'triangle', wave2: 'sine', cutoff: 1200, res: 1, fenv: 2000, D: 0.5 }), [VERB(0.2)], 'soft pluck rnb chill', BOTH);
snd('Plucks', 'Afro Pluck', PL({ wave1: 'square', wave2: 'triangle', cutoff: 1400, res: 4, fenv: 3000, fD: 0.1, D: 0.25 }), [['delay', { divL: '1/8', divR: '1/8D', mix: 0.18 }]], 'afro afrobeats amapiano pluck guitar-ish');
snd('Plucks', 'Nylon Guitar', { type: 'pluck', decay: 2.6, bright: 0.5, damp: 0.5, body: 3800, pick: 0.18, gain: 0.7 }, [VERB(0.18)], 'nylon guitar acoustic latin bossa jazz', BOTH);
snd('Plucks', 'Steel Guitar', { type: 'pluck', decay: 3.2, bright: 0.8, damp: 0.3, body: 6000, pick: 0.1, gain: 0.65 }, [VERB(0.15)], 'acoustic steel guitar folk pop', ['Lo-fi']);
snd('Plucks', 'Muted Guitar', { type: 'pluck', decay: 0.35, bright: 0.5, damp: 0.85, body: 2500, pick: 0.2, gain: 0.8 }, [['comp', { thresh: -18, ratio: 4 }]], 'muted guitar funk palm mute rnb', ['Vintage']);
snd('Plucks', 'Harp', { type: 'pluck', decay: 4, bright: 0.7, damp: 0.25, body: 7000, pick: 0.35, gain: 0.6 }, [VERB(0.35, 3.5)], 'harp orchestral gospel worship');
snd('Plucks', 'Koto', { type: 'pluck', decay: 2, bright: 0.85, damp: 0.4, body: 5000, pick: 0.06, gain: 0.6 }, [['chorus', { rate: 3, depth: 0.1, mix: 0.25 }], VERB(0.2)], 'koto japanese experimental lofi', ['Lo-fi']);
snd('Plucks', 'Pizzicato', { type: 'pluck', decay: 0.7, bright: 0.45, damp: 0.6, body: 3000, pick: 0.25, gain: 0.75 }, [VERB(0.3, 2.5)], 'pizzicato strings orchestral');
snd('Plucks', 'Bass Pluck Stab', PL({ oct2: 0, cutoff: 500, res: 6, fenv: 3000, fD: 0.1, D: 0.18, mono: true }), [], 'stab pluck house');
snd('Plucks', 'Digital Pluck', { type: 'wave', table: 'digital', pos: 0.8, posEnv: -0.7, posDecay: 0.15, voices: 2, spread: 10, cutoff: 8000, res: 2, A: 0.001, D: 0.35, S: 0, R: 0.3, gain: 0.4 }, [['delay', { mix: 0.2 }], VERB(0.2)], 'digital pluck future bass pop');
snd('Plucks', 'Sitar-ish', { type: 'pluck', decay: 3, bright: 0.9, damp: 0.2, body: 4500, pick: 0.04, gain: 0.55 }, [['phaser', { mode: 'flanger', rate: 0.3, depth: 0.4, mix: 0.3 }], VERB(0.2)], 'sitar eastern experimental psychedelic');

/* ---------- Strings & Brass (synthesised) ---------- */
snd('Strings & Brass', 'String Section', PAD({ wave1: 'sawtooth', wave2: 'sawtooth', detune: 16, cutoff: 3200, res: 0.8, fenv: 0, A: 0.25, D: 1, Sus: 0.9, R: 0.9, lfoRate: 5, lfoAmt: 12 }), [['chorus', { rate: 0.5, depth: 0.4, mix: 0.4 }], VERB(0.35, 3.2)], 'strings section orchestral cinematic gospel', BOTH);
snd('Strings & Brass', 'Cello Legato', LEAD({ wave1: 'sawtooth', wave2: 'sawtooth', detune: 8, mix2: 0.4, cutoff: 1800, res: 1, fenv: 0, A: 0.18, R: 0.5, glide: 0.08, lfoRate: 5, lfoAmt: 15 }), [VERB(0.3, 3)], 'cello strings solo cinematic');
snd('Strings & Brass', 'Synth Brass', C({ wave1: 'sawtooth', wave2: 'sawtooth', detune: 10, mix2: 0.5, cutoff: 700, res: 2, fenv: 3000, fA: 0.06, fD: 0.35, A: 0.03, D: 0.4, Sus: 0.8, R: 0.3, gain: 0.38 }), [VERB(0.2)], 'synth brass 80s funk', ['Vintage']);
snd('Strings & Brass', 'Horn Section', { type: 'fm', ratio: 1, index: 2.2, modDecay: 0.15, modSustain: 0.6, ratio2: 1, index2: 0.5, A: 0.04, D: 0.3, S: 0.85, R: 0.2, cutoff: 6000, gain: 0.45 }, [['chorus', { rate: 0.3, depth: 0.2, mix: 0.3 }], VERB(0.2)], 'horns brass section soul gospel funk', ['Vintage']);
snd('Strings & Brass', 'Muted Trumpet', { type: 'fm', ratio: 1, index: 1.4, modDecay: 0.1, modSustain: 0.5, ratio2: 3, index2: 0.3, A: 0.05, D: 0.3, S: 0.8, R: 0.15, cutoff: 3500, gain: 0.45 }, [VERB(0.25)], 'muted trumpet jazz lofi', BOTH);
snd('Strings & Brass', 'Sax-ish', { type: 'wave', table: 'vocal', pos: 0.7, posEnv: 0.1, posDecay: 0.3, voices: 1, cutoff: 3400, res: 3, A: 0.05, D: 0.4, S: 0.85, R: 0.2, gain: 0.4 }, [['sat', { style: 'Tube', drive: 6 }], VERB(0.22)], 'sax saxophone jazz rnb', BOTH);
snd('Strings & Brass', 'Orchestra Hit', C({ wave1: 'sawtooth', wave2: 'square', oct2: 1, detune: 20, mix2: 0.5, noise: 0.25, cutoff: 3000, res: 1, fenv: 2000, fD: 0.2, A: 0.001, D: 0.5, Sus: 0, R: 0.4, gain: 0.4 }), [VERB(0.35, 2.5)], 'orchestra hit stab 80s hip-hop');

/* ---------- Textures & FX ---------- */
snd('Textures & FX', 'Riser', C({ wave1: 'sawtooth', wave2: 'sawtooth', detune: 25, mix2: 0.5, noise: 0.4, cutoff: 300, res: 6, fenv: 9000, fA: 6, fD: 1, A: 4, D: 1, Sus: 1, R: 1, lfoRate: 8, lfoAmt: 300, gain: 0.3 }), [VERB(0.4, 4)], 'riser build up transition edm');
snd('Textures & FX', 'Downlifter', C({ wave1: 'sine', wave2: 'sawtooth', mix2: 0.3, noise: 0.6, cutoff: 9000, res: 3, fenv: -8000, fA: 0.01, fD: 3, A: 0.01, D: 3, Sus: 0, R: 1, gain: 0.35 }), [VERB(0.45, 5)], 'downlifter fall transition');
snd('Textures & FX', 'Impact', { type: 'fm', ratio: 0.5, index: 6, modDecay: 0.4, modSustain: 0, ratio2: 1.5, index2: 4, A: 0.001, D: 2.5, S: 0, R: 1, cutoff: 6000, gain: 0.6 }, [['sat', { style: 'Tube', drive: 10 }], VERB(0.45, 5)], 'impact boom hit cinematic');
snd('Textures & FX', 'Vinyl Noise Bed', C({ wave1: 'sine', wave2: 'sine', mix2: 0, noise: 1, cutoff: 3500, res: 1, A: 0.5, Sus: 1, R: 1, gain: 0.12 }), [['sat', { style: 'Crush', drive: 6, mix: 0.4 }], ['filter', { type: 'bandpass', cutoff: 2200, res: 0.8 }]], 'vinyl crackle noise lofi bed');
snd('Textures & FX', 'Granular Shimmer', { type: 'wave', table: 'digital', pos: 1, posEnv: -0.9, posDecay: 6, voices: 4, spread: 35, cutoff: 9000, res: 1, A: 1.5, D: 4, S: 0.6, R: 4, gain: 0.28 }, [['tape', { div: '1/8D', fb: 0.7, wow: 0.6, mix: 0.4 }], VERB(0.55, 8)], 'shimmer granular ambient experimental');
snd('Textures & FX', 'Space Drone', ORG({ d1: 8, d2: 4, d3: 0, d4: 2, d5: 6, d6: 0, d7: 4, d8: 0, d9: 0, click: 0, rotary: 'slow', rotaryDepth: 1, drive: 0.4, tone: 2500 }), [['phaser', { rate: 0.05, depth: 0.9, fb: 0.6, mix: 0.6 }], VERB(0.6, 9)], 'drone space experimental dark');
snd('Textures & FX', 'Laser Zap', C({ wave1: 'square', wave2: 'sawtooth', oct2: 2, mix2: 0.3, cutoff: 8000, res: 8, fenv: -7000, fD: 0.12, A: 0.001, D: 0.15, Sus: 0, R: 0.05, glide: 0.3, mono: true, gain: 0.35 }), [['delay', { mix: 0.25 }]], 'laser zap sci-fi fx');
snd('Textures & FX', 'Tape Stop Pad', PAD({ wave1: 'triangle', wave2: 'sawtooth', glide: 0.8, mono: true, A: 0.3 }), [['tape', { div: '1/4', fb: 0.5, wow: 1, flutter: 0.8, mix: 0.3 }]], 'tape wobble warped lofi experimental', ['Lo-fi']);
snd('Textures & FX', 'Glitch Bleeps', { type: 'fm', ratio: 7.1, index: 8, modDecay: 0.03, modSustain: 0, ratio2: 13, index2: 5, A: 0.001, D: 0.08, S: 0, R: 0.03, cutoff: 12000, gain: 0.35 }, [['sat', { style: 'Crush', drive: 8, mix: 0.6 }], ['delay', { divL: '1/16', divR: '1/8', fb: 0.5, mix: 0.3 }]], 'glitch idm experimental bleeps');
snd('Textures & FX', 'Wind', C({ wave1: 'sine', wave2: 'sine', mix2: 0, noise: 1, cutoff: 900, res: 6, A: 1.5, Sus: 1, R: 2, lfoRate: 0.2, lfoAmt: 700, gain: 0.25 }), [VERB(0.4, 4)], 'wind air atmosphere ambient');

/* ---------- Drum Kits ---------- */
const KIT = (pads, fx = []) => ({ inst: { type: 'drums', pads: pads.map(([kind, tune = 0, decay = 1, level = 0.85, pan = 0]) => ({ kind, tune, decay, level, pan, sampleId: null })) }, fx });
const kit = (name, k, tags) => SOUNDS.push({ cat: 'Drum Kits', name, inst: k.inst, fx: k.fx, tags });
kit('Trap Kit', KIT([['Sub Kick', 0, 1.6, 0.95], ['Snare', 2, 0.8], ['Clap', 0, 1], ['Closed Hat', 3, 0.5, 0.7], ['Open Hat', 2, 0.8, 0.6], ['Tom', -5, 1.2], ['Rim', 4, 0.6, 0.7], ['Shaker', 0, 0.6, 0.6]]), 'trap 808 drill hip-hop');
kit('Boom Bap Kit', KIT([['Kick', -2, 0.8], ['Snare', -3, 1.1], ['Clap', -2, 0.9, 0.7], ['Closed Hat', -2, 0.8, 0.7], ['Open Hat', -2, 0.9, 0.6], ['Tom', -3, 1], ['Rim', 0, 0.7], ['Shaker', -2, 0.7, 0.5]], [['sat', { style: 'Tape', drive: 9, tone: -0.3 }], ['comp', { thresh: -18, ratio: 4, attack: 10 }]]), 'boom bap 90s hip-hop');
kit('Lo-fi Kit', KIT([['Kick', -3, 0.7, 0.9], ['Snare', -4, 0.9, 0.8], ['Rim', -2, 0.8, 0.7], ['Closed Hat', -5, 0.7, 0.55], ['Open Hat', -5, 0.7, 0.45], ['Shaker', -4, 0.8, 0.5], ['Tom', -6, 1], ['Clap', -4, 0.8, 0.6]], [...CHAR['Lo-fi'], ['comp', { thresh: -20, ratio: 3 }]]), 'lofi chill hip-hop dusty');
kit('808 Classic', KIT([['Kick', 0, 1.3], ['Snare', 0, 1], ['Clap', 0, 1], ['Closed Hat', 0, 1, 0.7], ['Open Hat', 0, 1, 0.6], ['Tom', 0, 1], ['Rim', 0, 1], ['Cowbell', 0, 1, 0.6]]), '808 classic electro miami');
kit('909 House Kit', KIT([['Kick', 1, 0.9, 0.95], ['Clap', 1, 1.1], ['Snare', 2, 0.9], ['Closed Hat', 4, 0.6, 0.65], ['Open Hat', 3, 1, 0.55], ['Rim', 3, 0.6], ['Shaker', 2, 0.6, 0.55], ['Tom', 2, 1]], [['comp', { thresh: -16, ratio: 4, attack: 5 }]]), '909 house techno dance');
kit('Gospel Kit', KIT([['Kick', -1, 1], ['Snare', 1, 1.1, 0.9], ['Clap', 1, 1.1], ['Closed Hat', 2, 0.7, 0.7], ['Open Hat', 1, 1, 0.6], ['Tom', -2, 1.3], ['Rim', 2, 0.8], ['Shaker', 0, 0.8, 0.55]], [VERB(0.12, 1.6)]), 'gospel church live chops');
kit('Jazz Brush Kit', KIT([['Kick', -4, 0.6, 0.7], ['Shaker', -6, 1.6, 0.6], ['Rim', -3, 0.8, 0.6], ['Closed Hat', -6, 0.9, 0.5], ['Open Hat', -6, 1.4, 0.45], ['Tom', -4, 1.2, 0.7], ['Snare', -6, 1.5, 0.55], ['Clap', -6, 0.6, 0.35]], [VERB(0.18, 1.4)]), 'jazz brushes soft live');
kit('Afro Kit', KIT([['Kick', 0, 0.8], ['Rim', 2, 0.8], ['Shaker', 1, 0.6, 0.7], ['Clap', 0, 0.9], ['Tom', 3, 0.9], ['Tom', -2, 1.1], ['Closed Hat', 3, 0.5, 0.6], ['Cowbell', 1, 0.8, 0.5]]), 'afrobeats amapiano percussion');
kit('Experimental Kit', KIT([['Sub Kick', -7, 2], ['Snare', 7, 0.5], ['Clap', -9, 2], ['Closed Hat', 12, 0.3, 0.6], ['Cowbell', -12, 1.5, 0.5], ['Tom', 12, 0.5], ['Rim', -12, 1.5], ['Shaker', 9, 2, 0.5]], [['sat', { style: 'Fold', drive: 10, mix: 0.5 }], ['tape', { div: '1/16', fb: 0.4, mix: 0.2 }]]), 'experimental glitch weird');
kit('Pop Kit', KIT([['Kick', 0, 1, 0.95], ['Snare', 1, 1], ['Clap', 0, 1.2], ['Closed Hat', 2, 0.6, 0.65], ['Open Hat', 1, 0.9, 0.55], ['Tom', 0, 1], ['Rim', 1, 0.7], ['Shaker', 1, 0.6, 0.55]], [['comp', { thresh: -14, ratio: 4, attack: 4, makeup: 3 }], VERB(0.1, 1.2)]), 'pop punchy modern edm');

/* ---------- loading and previewing ---------- */
const soundByName = n => SOUNDS.find(s => s.name === n);
// Level trims measured by rendering each sound (a full-velocity chord, a low bass note or a drum pattern), so the library sits at an even level.
const SOUND_TRIM = {"808 Clean": 1.85, "808 Long Glide": 1.85, "Sub Bass": 1.92, "Reese": 1.9, "Moog-ish Bass": 1.62, "Funk Pluck Bass (Vintage)": 0.65, "Upright Bass (Vintage)": 0.48, "Fretless": 1.22, "Fretless (Vintage)": 0.78, "FM Bass": 1.29, "Deep House Bass": 1.9, "Synth Bass Brass": 2.4, "Rubber Bass": 1.57, "Dark Drone Bass": 1.96, "Suitcase EP (Vintage)": 0.59, "Soft Rhodes (Vintage)": 0.57, "Bright Tine (Vintage)": 0.51, "Gospel EP": 0.73, "Gospel EP (Vintage)": 0.41, "Wurly (Vintage)": 0.74, "Dyno EP": 0.66, "Felt Piano": 0.47, "Honky Keys": 0.39, "Honky Keys (Vintage)": 0.25, "Toy Piano": 0.65, "Clavinet (Vintage)": 0.76, "Jazz Keys": 0.76, "Jazz Keys (Vintage)": 0.61, "DX Ballad Piano": 0.5, "DX Ballad Piano (Vintage)": 0.39, "Gospel B3 (888) (Vintage)": 0.55, "Jazz Organ (Vintage)": 0.67, "Soul Organ (Vintage)": 0.6, "Combo Organ (Vintage)": 0.65, "Trap Bell": 0.63, "Glass Bell": 0.65, "Tubular Bell": 0.65, "Music Box": 0.65, "Celesta": 0.66, "Vibraphone (Vintage)": 0.71, "Marimba": 0.64, "Kalimba": 0.65, "Steel Drum": 0.64, "Glockenspiel": 0.65, "Dark Bell Pad": 0.62, "Warm Pad": 1.2, "Worship Swell": 3, "Strings Pad": 1.42, "Dark Trap Pad": 1.6, "Lo-fi Haze (Lo-fi)": 1.22, "Ambient Drift": 2.07, "Neo Soul Pad": 1.92, "Neo Soul Pad (Lo-fi)": 1.31, "Noise Wash": 1.97, "Supersaw Lead": 0.61, "Flute Lead": 0.71, "Flute Lead (Vintage)": 0.66, "Soft Pluck (Vintage)": 0.76, "Nylon Guitar": 0.45, "Nylon Guitar (Vintage)": 0.58, "Steel Guitar": 0.27, "Muted Guitar": 0.28, "Muted Guitar (Vintage)": 0.39, "Harp": 0.28, "Koto": 0.37, "Pizzicato": 0.48, "Sitar-ish": 0.21, "String Section": 1.23, "Horn Section": 0.68, "Horn Section (Vintage)": 0.55, "Muted Trumpet": 0.78, "Muted Trumpet (Vintage)": 0.68, "Riser": 3, "Impact": 0.39, "Vinyl Noise Bed": 3, "Space Drone": 0.49, "Tape Stop Pad": 1.2, "Glitch Bleeps": 0.69, "Wind": 1.44, "Trap Kit": 0.73, "Boom Bap Kit": 0.42, "909 House Kit": 0.68, "Experimental Kit": 0.51, "Pop Kit": 0.64};
function soundInst(s) { const base = s.inst.type === 'synth' ? { ...SYNTH_DEFAULT } : s.inst.type === 'drums' ? {} : newInst(s.inst.type), o = { ...deep(base), ...deep(s.inst), preset: s.name }, tr = SOUND_TRIM[s.name] || 1; if (s.pack) o.zones = packZones(s);
  if (tr !== 1) { if (o.pads) o.pads.forEach(p => (p.level = +(p.level * tr).toFixed(3))); else if (o.gain != null) o.gain = +(o.gain * tr).toFixed(3); }
  return o; }
function soundDevices(s) { return s.fx.filter(([k, p]) => DEVICES[k] && p).map(([k, p]) => newDevice(k, { ...DEVICES[k].def(), ...p })); }
function addSound(name, onto) {
  const s = soundByName(name); if (!s) return;
  if (s.pack && !packReady(s)) { toast(`Loading ${s.name}…`, 1500); return packLoad(s).then(ok => ok && addSound(name, onto)); }
  if (onto && onto.kind === 'midi') { pushUndo('Load sound'); removeBus(onto); onto.inst = soundInst(s); onto.devices = [...soundDevices(s), ...onto.devices.filter(d => d.type === 'plugin')]; onto.name = s.name; buildBus(onto, 'track'); routeOut(onto); V.selTracks = new Set([onto.id]); V.detail = 'devices'; ui.all(); return; }
  const t = addTrack('midi', s.inst.type === 'drums' ? 'drums' : 'synth'); removeBus(t); t.inst = soundInst(s); t.devices = soundDevices(s); t.name = s.name; buildBus(t, 'track'); routeOut(t);
  V.selTracks = new Set([t.id]); V.detail = 'devices'; ui.all();
}
// Clicking a sound in the browser plays a short phrase through the cue output.
let _snd = null;
let _sndWant = null;
function previewSound(name) {
  const s = soundByName(name); if (!s || isOffline()) return;
  if (s.pack && !packReady(s)) { const want = name; _sndWant = want; return packLoad(s).then(ok => ok && _sndWant === want && previewSound(name)); } stopSoundPreview(); if (LIVE_CTX.state !== 'running') LIVE_CTX.resume();
  const t = { id: 'preview', name, kind: 'midi', inst: soundInst(s), devices: soundDevices(s), auto: {} }, inst = makeInstrument(t), out = LIVE_CTX.createGain(); out.gain.value = browser.pVol != null ? browser.pVol : 0.8;
  chain(inst.out, t.devices, out); out.connect(M.cue);
  const now = LIVE_CTX.currentTime + 0.05, beat = 60 / (S.bpm || 100), cat = s.cat, n = [];
  if (cat === 'Drum Kits') [[0, 0], [2, 0.5], [1, 1], [2, 1.5], [0, 2], [0, 2.25], [1, 3], [4, 3.5]].forEach(([p, b]) => n.push([p, b * beat * 0.5, 0.2]));
  else if (cat === 'Bass & 808') [[36, 0, 1.4], [36, 1.5, 0.4], [39, 2, 0.8], [34, 3, 1.4]].forEach(([p, b, d]) => n.push([p, b * beat, d * beat]));
  else if (['Leads', 'Plucks', 'Bells & Mallets', 'Textures & FX'].includes(cat)) [60, 63, 67, 70, 72, 70, 67].forEach((p, i) => n.push([cat === 'Textures & FX' ? 60 : p, i * beat * 0.5, cat === 'Textures & FX' ? beat * 3 : beat * 0.45]));
  else [[48, 55, 58, 63], [46, 53, 57, 62]].forEach((ch, i) => ch.forEach(p => n.push([p, i * beat * 2, beat * 1.8])));
  n.forEach(([p, at, d]) => inst.noteOn(p, now + at, 0.8, d));
  _snd = { inst, out, devs: t.devices, until: setTimeout(stopSoundPreview, 6000) };
}
function stopSoundPreview() {
  if (!_snd) return; clearTimeout(_snd.until); const x = _snd; _snd = null;
  try { x.inst.allOff(LIVE_CTX.currentTime); } catch (e) { }
  setTimeout(() => { try { x.out.disconnect(); } catch (e) { } x.devs.forEach(d => { const r = DEV_RT.get(d.id); if (r) { r.dispose(); DEV_RT.delete(d.id); } }); if (x.inst.dispose) x.inst.dispose(); }, 600);
}
