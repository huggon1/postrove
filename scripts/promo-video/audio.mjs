import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// An original, deterministic score: warm extended chords, a small piano-like
// motif, and rounded tonal pulses. Each layer uses smooth amplitude envelopes.
const RATE = 48_000;
const DURATION = 48;
const COUNT = RATE * DURATION;
const TAU = Math.PI * 2;
const left = new Float32Array(COUNT);
const right = new Float32Array(COUNT);
const wetL = new Float32Array(COUNT);
const wetR = new Float32Array(COUNT);
let seed = 0x706f7374;
const random = () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return (seed >>> 0) / 4294967296;
};
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const smooth = (t) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

function voice(start, duration, pan, send, sample) {
  const from = Math.max(0, Math.floor(start * RATE));
  const end = Math.min(COUNT, Math.ceil((start + duration) * RATE));
  const gainL = Math.cos(((pan + 1) * Math.PI) / 4);
  const gainR = Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = from; i < end; i++) {
    const t = Math.max(0, i / RATE - start);
    const value = sample(t, duration);
    if (!Number.isFinite(value))
      throw new Error(`Invalid synthesized sample at ${start}s + ${t}s`);
    left[i] += value * gainL;
    right[i] += value * gainR;
    wetL[i] += value * gainL * send;
    wetR[i] += value * gainR * send;
  }
}

function pad(start, hold, notes, amplitude = 0.1) {
  notes.forEach((midi, index) => {
    const frequency = hz(midi);
    const phase = random() * TAU;
    const detune = 1 + (index % 2 ? 1 : -1) * 0.0012;
    const pan = (index / (notes.length - 1) - 0.5) * 1.35;
    voice(start, hold + 2.2, pan, 0.4, (t) => {
      const attack = smooth(t / 0.85);
      const release = 1 - smooth((t - hold) / 2.2);
      const shimmer = 0.93 + 0.07 * Math.sin(TAU * 0.13 * t + phase);
      const a = TAU * frequency * t;
      const wave =
        Math.sin(a + phase) * 0.64 +
        Math.sin(a * detune + phase + 0.4) * 0.24 +
        Math.sin(a * 2 + phase) * 0.09 +
        Math.sin(a * 3 + phase) * 0.03;
      return wave * amplitude * attack * release * shimmer;
    });
  });
}

function key(start, midi, amplitude = 0.12, pan = 0, length = 2.1) {
  const frequency = hz(midi);
  voice(start, length, pan, 0.38, (t) => {
    const a = TAU * frequency * t;
    const attack = 1 - Math.exp(-t * 260);
    const tail = 1 - smooth((t - length * 0.7) / (length * 0.3));
    const tone =
      Math.sin(a) * Math.exp(-t * 2.1) +
      0.28 * Math.sin(a * 2.001) * Math.exp(-t * 4.7) +
      0.1 * Math.sin(a * 3) * Math.exp(-t * 7.5) +
      0.025 * Math.sin(a * 7.01) * Math.exp(-t * 13);
    return tone * amplitude * attack * tail;
  });
}

function bass(start, midi, length, amplitude = 0.23) {
  const frequency = hz(midi);
  voice(start, length + 0.18, 0, 0.045, (t) => {
    const attack = smooth(t / 0.024);
    const release = 1 - smooth((t - length + 0.08) / 0.26);
    const a = TAU * frequency * t;
    return (
      (Math.sin(a) + 0.22 * Math.sin(a * 2) + 0.07 * Math.sin(a * 3)) *
      amplitude *
      attack *
      release
    );
  });
}

function kick(start, amplitude = 0.38) {
  let phase = 0;
  voice(start, 0.48, 0, 0.015, (t) => {
    phase += (TAU * (45 + 103 * Math.exp(-t * 34))) / RATE;
    const body = Math.sin(phase) * Math.exp(-t * 9.5);
    const tail = 1 - smooth((t - 0.36) / 0.12);
    return body * amplitude * smooth(t / 0.004) * tail;
  });
}

function arrival(time, strength = 1) {
  kick(time, 0.36 * strength);
  key(time, 74, 0.11 * strength, -0.25, 3.1);
  key(time + 0.018, 81, 0.055 * strength, 0.3, 3.4);
}

const chords = [
  { time: 0, end: 4, notes: [47, 54, 57, 62, 66], root: 35 },
  { time: 4, end: 8, notes: [43, 54, 57, 59, 62], root: 31 },
  { time: 8, end: 10, notes: [45, 52, 57, 59, 64], root: 33 },
  { time: 10, end: 14, notes: [47, 54, 57, 62, 66], root: 35 },
  { time: 14, end: 18, notes: [43, 54, 57, 59, 62], root: 31 },
  { time: 18, end: 22, notes: [38, 54, 57, 61, 64], root: 26 },
  { time: 22, end: 25, notes: [45, 52, 57, 59, 61], root: 33 },
  { time: 25, end: 29, notes: [47, 54, 57, 62, 66], root: 35 },
  { time: 29, end: 34, notes: [38, 54, 57, 61, 64], root: 26 },
  { time: 34, end: 38, notes: [43, 54, 57, 59, 62], root: 31 },
  { time: 38, end: 42, notes: [38, 54, 57, 61, 64], root: 26 },
  { time: 42, end: 43, notes: [45, 52, 57, 59, 61], root: 33 },
  { time: 43, end: 46, notes: [38, 54, 57, 61, 64], root: 26 },
  { time: 46, end: 46.3, notes: [38, 50, 57, 62, 64, 66], root: 26 },
];

// 10–25: platform search; 25: independent replies; 34: reading; 43: brand.
for (const chord of chords) {
  const size = chord.time < 5 ? 0.061 : chord.time >= 34 ? 0.087 : 0.073;
  pad(chord.time, chord.end - chord.time, chord.notes, size);
  if (chord.time >= 10 && chord.time < 46) {
    for (let time = chord.time; time < chord.end - 0.1; time += 1) {
      bass(time, chord.root, 0.69, chord.time >= 43 ? 0.17 : 0.2);
      if (time + 0.75 < chord.end)
        bass(time + 0.75, chord.root + 12, 0.17, 0.09);
    }
  }
  const interval = chord.time < 5 ? 1 : chord.time >= 43 ? 0.75 : 0.5;
  const order = [2, 4, 3, 1, 4, 2, 3, 4];
  for (
    let time = chord.time + 0.25, index = 0;
    time < Math.min(chord.end, 46);
    time += interval, index++
  ) {
    const note =
      chord.notes[order[index % order.length] % chord.notes.length] + 12;
    key(
      time,
      note,
      (index % 3 === 0 ? 0.085 : 0.056) * (time < 5 ? 0.68 : 1),
      Math.sin(index * 1.9) * 0.48,
      2.05,
    );
  }
}

// A short recurring motif supplies a musical identity without crowding captions.
const motif = [
  [0, 78],
  [0.75, 76],
  [1.5, 73],
  [2.5, 74],
  [3.25, 69],
];
for (const [start, gain] of [
  [5, 0.95],
  [18, 0.85],
  [27, 1],
  [35, 0.8],
  [43, 0.8],
]) {
  for (const [offset, midi] of motif)
    key(start + offset, midi, 0.125 * gain, -0.16, 2.5);
}
key(46, 74, 0.15, -0.15, 2);
key(46.03, 81, 0.065, 0.2, 1.97);
bass(46, 26, 1.4, 0.2);

for (let bar = 10; bar < 46; bar += 2) {
  if (bar >= 43) {
    kick(bar, 0.28);
    continue;
  }
  kick(bar, 0.34);
  kick(bar + 1.25, 0.21);
  if (bar >= 18 && bar < 43) kick(bar + 1.75, 0.14);
}
for (let time = 0; time < 10; time += 1) bass(time, 35, 0.35, 0.056);
arrival(5, 0.78);
arrival(10, 0.75);
arrival(25, 0.65);
arrival(34, 0.85);
arrival(43, 0.95);

// Crossed, filtered feedback taps provide an airy room and stereo echoes.
const delays = [0.137, 0.211, 0.307, 0.431].map((seconds, index) => ({
  l: new Float32Array(Math.round(RATE * seconds)),
  r: new Float32Array(Math.round(RATE * (seconds + 0.017 + index * 0.003))),
  pL: 0,
  pR: 0,
  filterL: 0,
  filterR: 0,
}));
for (let i = 0; i < COUNT; i++) {
  let reverberationL = 0;
  let reverberationR = 0;
  for (let tap = 0; tap < delays.length; tap++) {
    const delay = delays[tap];
    const oldL = delay.l[delay.pL];
    const oldR = delay.r[delay.pR];
    delay.filterL += 0.19 * (oldL - delay.filterL);
    delay.filterR += 0.19 * (oldR - delay.filterR);
    delay.l[delay.pL] = wetL[i] * 0.38 + delay.filterR * (0.64 - tap * 0.045);
    delay.r[delay.pR] = wetR[i] * 0.38 + delay.filterL * (0.64 - tap * 0.045);
    delay.pL = (delay.pL + 1) % delay.l.length;
    delay.pR = (delay.pR + 1) % delay.r.length;
    reverberationL += oldL * 0.24;
    reverberationR += oldR * 0.24;
  }
  const fade = smooth(i / RATE / 0.07) * (1 - smooth((i / RATE - 46.2) / 1.8));
  left[i] = (left[i] + reverberationL) * fade;
  right[i] = (right[i] + reverberationR) * fade;
}

// A soft mastering curve rounds transients. Its ceiling is below -1 dBFS.
const ceiling = 0.875;
const master = (value) =>
  value / (1 + (Math.abs(value) / ceiling) ** 6) ** (1 / 6);
// Fixed gain keeps the tonal arrangement stable between score revisions.
const gain = 1.5;

const pcm = Buffer.alloc(COUNT * 4);
let sum = 0;
let peak = 0;
for (let i = 0; i < COUNT; i++) {
  const l = Math.round(master(left[i] * gain) * 32767);
  const r = Math.round(master(right[i] * gain) * 32767);
  pcm.writeInt16LE(l, i * 4);
  pcm.writeInt16LE(r, i * 4 + 2);
  sum += (l / 32768) ** 2 + (r / 32768) ** 2;
  peak = Math.max(peak, Math.abs(l / 32768), Math.abs(r / 32768));
}
const header = Buffer.alloc(44);
header.write("RIFF", 0);
header.writeUInt32LE(36 + pcm.length, 4);
header.write("WAVEfmt ", 8);
header.writeUInt32LE(16, 16);
header.writeUInt16LE(1, 20);
header.writeUInt16LE(2, 22);
header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 4, 28);
header.writeUInt16LE(4, 32);
header.writeUInt16LE(16, 34);
header.write("data", 36);
header.writeUInt32LE(pcm.length, 40);
const folder = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "output",
);
fs.mkdirSync(folder, { recursive: true });
const destination = path.join(folder, "soundtrack.wav");
fs.writeFileSync(destination, Buffer.concat([header, pcm]));
console.log(
  JSON.stringify(
    {
      file: destination,
      durationSeconds: COUNT / RATE,
      sampleRate: RATE,
      channels: 2,
      rmsDbFS: Number(
        (20 * Math.log10(Math.sqrt(sum / (COUNT * 2)))).toFixed(3),
      ),
      peakDbFS: Number((20 * Math.log10(peak)).toFixed(3)),
      peak: Number(peak.toFixed(6)),
      bytes: header.length + pcm.length,
    },
    null,
    2,
  ),
);
