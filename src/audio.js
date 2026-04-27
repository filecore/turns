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

export function playLowHp() {
  const c   = ac();
  const osc = c.createOscillator();
  const g   = out(0.09, 0.28);
  osc.type = 'sine';
  osc.frequency.setValueAtTime(520, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(260, c.currentTime + 0.22);
  osc.connect(g);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + 0.30);
}

let _beatTimer = null;
let _beatCount = 0;

export function startAmbient() {
  if (_beatTimer) return;
  _beatCount = 0;
  function tick() {
    const c = ac();
    // Kick on every beat
    {
      const osc = c.createOscillator();
      const g = out(0.06, 0.38);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(85, c.currentTime);
      osc.frequency.exponentialRampToValueAtTime(30, c.currentTime + 0.32);
      osc.connect(g);
      osc.start(c.currentTime);
      osc.stop(c.currentTime + 0.42);
    }
    // Snare on beats 2 and 4
    if (_beatCount % 2 === 1) {
      const buf  = c.createBuffer(1, Math.floor(c.sampleRate * 0.10), c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src  = c.createBufferSource();
      const filt = c.createBiquadFilter();
      filt.type = 'bandpass'; filt.frequency.value = 1800; filt.Q.value = 0.8;
      const g = out(0.035, 0.14);
      src.buffer = buf; src.connect(filt); filt.connect(g);
      src.start(c.currentTime);
    }
    _beatCount++;
    _beatTimer = setTimeout(tick, 500);  // 120 BPM
  }
  tick();
}

export function stopAmbient() {
  if (_beatTimer) { clearTimeout(_beatTimer); _beatTimer = null; }
  _beatCount = 0;
}

export function playExplosion() {
  const c   = ac();
  const buf  = c.createBuffer(1, Math.floor(c.sampleRate * 0.30), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    const env = Math.pow(1 - i / data.length, 1.4);
    data[i] = (Math.random() * 2 - 1) * env;
  }
  const src  = c.createBufferSource();
  const filt = c.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.value = 400;
  const g = out(0.55, 0.30);
  src.buffer = buf;
  src.connect(filt);
  filt.connect(g);
  src.start(c.currentTime);
}

export function playRicochet() {
  const c   = ac();
  const osc = c.createOscillator();
  const g   = out(0.18, 0.08);
  osc.type = 'square';
  osc.frequency.setValueAtTime(1800, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(600, c.currentTime + 0.07);
  osc.connect(g);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + 0.09);
}

// Sniper crack: short sharp whip (high-freq sine, very fast decay)
export function playSniper() {
  const c   = ac();
  const osc = c.createOscillator();
  const g   = out(0.28, 0.06);
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(2200, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(380, c.currentTime + 0.05);
  osc.connect(g);
  osc.start(c.currentTime);
  osc.stop(c.currentTime + 0.07);
}
