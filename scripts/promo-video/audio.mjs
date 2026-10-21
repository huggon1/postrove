import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const authoringFolder = path.dirname(fileURLToPath(import.meta.url));
const story = JSON.parse(
  fs.readFileSync(path.join(authoringFolder, "story.json"), "utf8"),
);

// An original, deterministic score: warm extended chords, a small piano-like
// motif, and rounded tonal pulses. Each layer uses smooth amplitude envelopes.
const RATE = 48_000;
const DURATION = story.seconds;
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

function tap(start, amplitude = 0.07, pan = 0) {
  voice(start, 0.105, pan, 0.08, (t) => {
    const attack = smooth(t / 0.007);
    const body = Math.sin(TAU * 520 * t) + 0.22 * Math.sin(TAU * 1042 * t);
    return (
      body *
      amplitude *
      attack *
      Math.exp(-t * 64) *
      (1 - smooth((t - 0.075) / 0.03))
    );
  });
}

// Each story has its own tension and resolution, aligned to story.json.
const progression = [
  [45, 52, 55, 59, 62],
  [50, 57, 61, 64, 69],
  [47, 54, 57, 61, 66],
  [43, 50, 54, 57, 62],
];
const contentStart = story.scenes.find[0];
pad(0, contentStart, progression[0], 0.032);
key(0.15, 74, 0.065, -0.1, 2.6);
key(0.4, 81, 0.035, 0.15, 2.4);
for (
  let time = contentStart, index = 0;
  time < DURATION - 2;
  time += 3.5, index++
) {
  const notes = progression[index % 4];
  const quiet =
    (time >= story.scenes.browse[0] && time < story.scenes.forward[0]) ||
    time >= story.scenes.use[0];
  const hold = Math.min(3.5, DURATION - time);
  pad(time, hold, notes, quiet ? 0.043 : 0.055);
  for (let beat = 0; beat < hold - 0.15; beat += 0.7)
    key(
      time + beat + 0.1,
      notes[Math.floor(beat / 0.7) % 5] + 12,
      quiet ? 0.044 : 0.058,
      Math.sin(beat) * 0.3,
      1.4,
    );
  if (time >= story.scenes.ask[0] && time < story.scenes.end[0])
    bass(time, notes[0] - 12, 0.65, 0.1);
}
for (let time = story.scenes.ask[0]; time < story.scenes.end[0]; time += 1) {
  const quiet =
    time >= story.scenes.browse[0] && time < story.scenes.forward[0];
  kick(time, quiet ? 0.08 : 0.17);
  tap(time + 0.5, quiet ? 0.017 : 0.037, 0.13);
}
for (const time of [0.8, 2.2, 18.3, 32.1, 33.85, 38.2, 39.4, 47.2])
  tap(contentStart + time, 0.07, -0.1);
for (const scene of ["bridge", "ask", "compare", "forward", "use", "end"])
  arrival(story.scenes[scene][0], 0.42);
key(story.scenes.end[0] + 1, 74, 0.09, -0.12, 2.7);
key(story.scenes.end[0] + 1.05, 81, 0.04, 0.16, 2.6);
bass(story.scenes.end[0] + 1, 38, 1.5, 0.08);

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
  const fade =
    smooth(i / RATE / 0.07) * (1 - smooth((i / RATE - (DURATION - 2.2)) / 2.2));
  left[i] = (left[i] + reverberationL) * fade;
  right[i] = (right[i] + reverberationR) * fade;
}

// A soft mastering curve rounds transients. Its ceiling is below -1 dBFS.
const ceiling = 0.875;
const master = (value) =>
  value / (1 + (Math.abs(value) / ceiling) ** 6) ** (1 / 6);
// Fixed gain keeps the tonal arrangement stable between score revisions.
const gain = 1.35;

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
