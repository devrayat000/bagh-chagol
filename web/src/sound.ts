// Tiny synthesised sound effects (Web Audio), so the game needs no audio files.

let ctx: AudioContext | null = null;
export let soundOn = localStorage.getItem("bagh.sound") !== "off";

export function toggleSound() {
  soundOn = !soundOn;
  localStorage.setItem("bagh.sound", soundOn ? "on" : "off");
}

function audio(): AudioContext | null {
  if (!soundOn) return null;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slideTo?: number) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const osc = a.createOscillator();
  const amp = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(amp).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur: number, gain: number, freq: number, delay = 0) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) ** 2;
  const src = a.createBufferSource();
  src.buffer = buf;
  const filter = a.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = freq;
  const amp = a.createGain();
  amp.gain.value = gain;
  src.connect(filter).connect(amp).connect(a.destination);
  src.start(t);
}

export const sfx = {
  select: () => tone(660, 0.07, "sine", 0.08),
  move: () => {
    noise(0.07, 0.5, 1800); // wooden tap
    tone(220, 0.09, "triangle", 0.12, 0, 160);
  },
  capture: () => {
    noise(0.18, 0.9, 500);
    tone(160, 0.3, "sawtooth", 0.07, 0, 60);
    tone(520, 0.12, "square", 0.04, 0.02, 300);
  },
  invalid: () => tone(140, 0.12, "triangle", 0.08),
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, "triangle", 0.12, i * 0.11)),
  lose: () => [392, 330, 262].forEach((f, i) => tone(f, 0.4, "triangle", 0.1, i * 0.16)),
  draw: () => [440, 440].forEach((f, i) => tone(f, 0.25, "sine", 0.1, i * 0.18)),
  click: () => tone(880, 0.04, "sine", 0.05),
};
