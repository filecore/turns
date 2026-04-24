// audio.js -- Web Audio API synthesis, no external files

let _ctx = null;

function ac() {
  if (!_ctx) _ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

function out(gainVal, duration) {
  const g = ac().createGain();
  g.gain.setValueAtTime(gainVal, ac().currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ac().currentTime + duration);
  g.connect(ac().destination);
  return g;
}

export function playShoot() {
  const c   = ac();
  const osc = c.createOscillator();
  const g   = out(0.35, 0.10);
  osc.frequency.setValueAtTime(680, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(180, c.currentTime + 0.09);
  osc.connect(g);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + 0.12);
}

export function playReload() {
  const c    = ac();
  const buf  = c.createBuffer(1, Math.floor(c.sampleRate * 0.04), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
  const src  = c.createBufferSource();
  const filt = c.createBiquadFilter();
  filt.type = 'highpass';
  filt.frequency.value = 1800;
  const g = out(0.25, 0.04);
  src.buffer = buf;
  src.connect(filt);
  filt.connect(g);
  src.start(c.currentTime);
}

export function playBlock() {
  const c   = ac();
  const o1  = c.createOscillator();
  const o2  = c.createOscillator();
  const g   = out(0.22, 0.14);
  o1.type = 'square'; o1.frequency.value = 1100;
  o2.type = 'square'; o2.frequency.value = 1480;
  o1.connect(g); o2.connect(g);
  o1.start(c.currentTime); o2.start(c.currentTime);
  o1.stop(c.currentTime + 0.16); o2.stop(c.currentTime + 0.16);
}

export function playHit() {
  const c   = ac();
  const osc = c.createOscillator();
  const g   = out(0.45, 0.16);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(160, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(55, c.currentTime + 0.14);
  osc.connect(g);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + 0.18);
}

export function playDeath() {
  const c   = ac();
  const osc = c.createOscillator();
  const g   = out(0.55, 0.48);
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(110, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(28, c.currentTime + 0.44);
  osc.connect(g);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + 0.52);
}

export function playUiTick() {
  const c   = ac();
  const osc = c.createOscillator();
  const g   = out(0.12, 0.055);
  osc.type = 'square';
  osc.frequency.value = 1400;
  osc.connect(g);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + 0.06);
}
