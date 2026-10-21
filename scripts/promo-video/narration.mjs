import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";

// Run after `node audio.mjs`. Neural speech is synthesized by edge-tts 7.3.1
// through an isolated uv tool environment. The script uses public TTS voices;
// it reads no account configuration or credentials. Source MP3s are cached in
// voice-assets/ so later mixes work offline. Original music comes
// from audio.mjs; spoken copy belongs to this promotional-film task.
const run = promisify(execFile);
const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(root, "output");
const sourceDir = path.join(root, "voice-assets");
const sourceTimingFile = path.join(sourceDir, "timing.json");
const require = createRequire(import.meta.url);
const binaries = path.dirname(
  require.resolve("@remotion/compositor-darwin-arm64/package.json"),
);
const ffmpeg = path.join(binaries, "ffmpeg");
const RATE = 48_000;
const story = JSON.parse(
  fs.readFileSync(path.join(root, "story.json"), "utf8"),
);
const SECONDS = story.seconds;
const FRAMES = RATE * SECONDS;
const env = { ...process.env, DYLD_LIBRARY_PATH: binaries };
fs.mkdirSync(sourceDir, { recursive: true });
const previousTiming = fs.existsSync(sourceTimingFile)
  ? JSON.parse(fs.readFileSync(sourceTimingFile, "utf8"))
  : { languages: {} };

const tracks = Object.fromEntries(
  Object.entries(story.narration).map(([language, cues]) => [
    language,
    {
      voice: language === "zh-CN" ? "zh-CN-YunxiNeural" : "en-US-GuyNeural",
      cues: cues.map((cue) => ({
        ...cue,
        spokenText: cue.spokenText ?? cue.text,
        limit: cue.end,
      })),
    },
  ]),
);
const synthesisRate = "+0%";

const smooth = (value) => {
  const x = Math.max(0, Math.min(1, value));
  return x * x * (3 - 2 * x);
};
const db = (value) =>
  Number((20 * Math.log10(Math.max(value, 1e-12))).toFixed(3));

function readWav(file) {
  const data = fs.readFileSync(file);
  if (
    data.toString("ascii", 0, 4) !== "RIFF" ||
    data.toString("ascii", 8, 12) !== "WAVE"
  )
    throw new Error(`Expected WAV: ${file}`);
  let position = 12;
  let channels, rate, bits, pcm;
  while (position + 8 <= data.length) {
    const name = data.toString("ascii", position, position + 4);
    const size = data.readUInt32LE(position + 4);
    if (name === "fmt ") {
      if (data.readUInt16LE(position + 8) !== 1)
        throw new Error("Expected PCM WAV");
      channels = data.readUInt16LE(position + 10);
      rate = data.readUInt32LE(position + 12);
      bits = data.readUInt16LE(position + 22);
    }
    if (name === "data") pcm = data.subarray(position + 8, position + 8 + size);
    position += 8 + size + (size % 2);
  }
  if (
    channels !== 2 ||
    rate !== RATE ||
    bits !== 16 ||
    !pcm ||
    pcm.length !== FRAMES * 4
  )
    throw new Error(`Music must be ${SECONDS}-second 48 kHz stereo PCM16`);
  const l = new Float32Array(FRAMES);
  const r = new Float32Array(FRAMES);
  for (let i = 0; i < FRAMES; i++) {
    l[i] = pcm.readInt16LE(i * 4) / 32768;
    r[i] = pcm.readInt16LE(i * 4 + 2) / 32768;
  }
  return [l, r];
}

function writeWav(file, left, right) {
  const count = left.length;
  const header = Buffer.alloc(44);
  header.write("RIFF");
  header.writeUInt32LE(36 + count * 4, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(2, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 4, 28);
  header.writeUInt16LE(4, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(count * 4, 40);
  const pcm = Buffer.alloc(count * 4);
  let peak = 0;
  let sum = 0;
  let activeSum = 0;
  let activeCount = 0;
  for (let i = 0; i < count; i++) {
    for (let channel = 0; channel < 2; channel++) {
      const x = channel === 0 ? left[i] : right[i];
      if (!Number.isFinite(x)) throw new Error(`Invalid output sample at ${i}`);
      const quantized = Math.round(
        Math.max(-0.885, Math.min(0.885, x)) * 32767,
      );
      pcm.writeInt16LE(quantized, i * 4 + channel * 2);
      const sample = quantized / 32768;
      peak = Math.max(peak, Math.abs(sample));
      sum += sample * sample;
      if (Math.abs(sample) > 0.006) {
        activeSum += sample * sample;
        activeCount++;
      }
    }
  }
  fs.writeFileSync(file, Buffer.concat([header, pcm]));
  const report = {
    file: path.relative(root, file),
    duration: count / RATE,
    sampleRate: RATE,
    channels: 2,
    peakDbFS: db(peak),
    rmsDbFS: db(Math.sqrt(sum / (count * 2))),
    activeRmsDbFS: db(Math.sqrt(activeSum / Math.max(1, activeCount))),
  };
  if (report.peakDbFS >= -1)
    throw new Error("Output peak exceeds delivery limit");
  return report;
}

function decodePcm(file, filter = "anull") {
  const buffer = execFileSync(
    ffmpeg,
    [
      "-v",
      "error",
      "-i",
      file,
      "-vn",
      "-af",
      filter,
      "-ac",
      "1",
      "-ar",
      String(RATE),
      "-c:a",
      "pcm_s16le",
      "-f",
      "wav",
      "-",
    ],
    { env, maxBuffer: 24 * 1024 * 1024 },
  );
  let pcm;
  for (let position = 12; position + 8 <= buffer.length;) {
    const name = buffer.toString("ascii", position, position + 4);
    const size = buffer.readUInt32LE(position + 4);
    if (name === "data") {
      pcm = buffer.subarray(
        position + 8,
        Math.min(buffer.length, position + 8 + size),
      );
      break;
    }
    position += 8 + size + (size % 2);
  }
  if (!pcm) throw new Error(`Decoder returned an invalid WAV: ${file}`);
  const samples = new Float32Array(pcm.length / 2);
  for (let i = 0; i < samples.length; i++)
    samples[i] = pcm.readInt16LE(i * 2) / 32768;
  return samples;
}

function decode(file, edits = []) {
  let samples;
  if (edits.length) {
    let cursor = 0;
    const parts = [];
    for (const edit of edits) {
      if (!(
        edit.start >= cursor &&
        edit.end > edit.start &&
        edit.rate >= 0.5 &&
        edit.rate <= 2
      ))
        throw new Error("Invalid localized speech timing edit");
      parts.push(
        decodePcm(
          file,
          `atrim=start=${cursor}:end=${edit.start},asetpts=PTS-STARTPTS`,
        ),
      );
      parts.push(
        decodePcm(
          file,
          `atrim=start=${edit.start}:end=${edit.end},asetpts=PTS-STARTPTS,atempo=${edit.rate}`,
        ),
      );
      cursor = edit.end;
    }
    parts.push(decodePcm(file, `atrim=start=${cursor},asetpts=PTS-STARTPTS`));
    samples = parts[0];
    for (const part of parts.slice(1)) {
      const overlap = Math.min(
        Math.round(RATE * 0.004),
        samples.length,
        part.length,
      );
      const joined = new Float32Array(samples.length + part.length - overlap);
      joined.set(samples);
      for (let i = 0; i < overlap; i++) {
        const mix = (i + 1) / (overlap + 1);
        joined[samples.length - overlap + i] =
          samples[samples.length - overlap + i] * (1 - mix) + part[i] * mix;
      }
      joined.set(part.subarray(overlap), samples.length);
      samples = joined;
    }
  } else samples = decodePcm(file);
  let from = 0;
  let to = samples.length;
  while (from < to && Math.abs(samples[from]) < 0.006) from++;
  while (to > from && Math.abs(samples[to - 1]) < 0.006) to--;
  from = Math.max(0, from - Math.round(RATE * 0.04));
  to = Math.min(samples.length, to + Math.round(RATE * 0.12));
  return samples.slice(from, to);
}

// The packaged timing manifest identifies each cached voice and spoken text.
// Changed copy or voice gets one bounded 30-second synthesis attempt.
const jobs = [];
for (const [language, track] of Object.entries(tracks)) {
  for (let index = 0; index < track.cues.length; index++) {
    const cue = track.cues[index];
    cue.source = path.join(sourceDir, `${language}-${index + 1}.mp3`);
    const previousCue = previousTiming.languages?.[language]?.[index];
    if (
      !fs.existsSync(cue.source) ||
      fs.statSync(cue.source).size < 1000 ||
      previousCue?.text !== cue.text ||
      (previousCue?.spokenText ?? previousCue?.text) !== cue.spokenText ||
      previousCue?.voice !== track.voice ||
      previousTiming.synthesisRate !== synthesisRate
    ) {
      jobs.push(async () => {
        await run(
          "uvx",
          [
            "--from",
            "edge-tts==7.3.1",
            "edge-tts",
            "--voice",
            track.voice,
            "--text",
            cue.spokenText,
            `--rate=${synthesisRate}`,
            "--write-media",
            cue.source,
          ],
          { cwd: root, timeout: 30_000, maxBuffer: 1024 * 1024 },
        );
      });
    }
  }
}
// Two network requests at a time keep remote synthesis responsive.
for (let index = 0; index < jobs.length; index += 2)
  await Promise.all(jobs.slice(index, index + 2).map((job) => job()));

const [musicL, musicR] = readWav(path.join(output, "soundtrack.wav"));
const reports = [];
const timing = {
  duration: SECONDS,
  sampleRate: RATE,
  synthesisRate,
  storyVersion: story.version,
  provider: "Microsoft Edge online Neural TTS through edge-tts 7.3.1",
  languages: {},
};
for (const [language, track] of Object.entries(tracks)) {
  const speech = new Float32Array(FRAMES);
  const timeline = [];
  for (const cue of track.cues) {
    if (
      cue.speechEdits?.length &&
      createHash("sha256").update(fs.readFileSync(cue.source)).digest("hex") !==
        cue.speechEditSourceSha256
    )
      throw new Error(
        "Localized speech timing needs review for the changed voice asset",
      );
    let samples = decode(cue.source, cue.speechEdits);
    const available = cue.limit - cue.start;
    const tempo = 1;
    if (samples.length / RATE > available) {
      throw new Error(
        `Speech cue needs a shorter text: ${language} ${cue.start}s (${(samples.length / RATE).toFixed(3)}s available ${available}s)`,
      );
    }
    let peak = 0;
    let sum = 0;
    let voiced = 0;
    for (const sample of samples) {
      peak = Math.max(peak, Math.abs(sample));
      if (Math.abs(sample) > 0.006) {
        sum += sample * sample;
        voiced++;
      }
    }
    const gain = Math.min(
      0.74 / peak,
      0.19 / Math.sqrt(sum / Math.max(1, voiced)),
    );
    const first = Math.round(cue.start * RATE);
    for (let i = 0; i < samples.length && first + i < FRAMES; i++) {
      const fade =
        smooth(i / (RATE * 0.008)) *
        (1 - smooth((i - samples.length + RATE * 0.016) / (RATE * 0.016)));
      speech[first + i] += samples[i] * gain * fade;
    }
    timeline.push({
      start: cue.start,
      limit: cue.limit,
      end: Number((cue.start + samples.length / RATE).toFixed(3)),
      text: cue.text,
      spokenText: cue.spokenText,
      speechEdits: cue.speechEdits ?? [],
      voice: track.voice,
      playbackRate: Number(tempo.toFixed(4)),
    });
  }
  reports.push(
    writeWav(path.join(output, `narration-${language}.wav`), speech, speech),
  );
  const mixL = new Float32Array(FRAMES);
  const mixR = new Float32Array(FRAMES);
  const limit = (value) =>
    value / (1 + (Math.abs(value) / 0.875) ** 6) ** (1 / 6);
  for (let i = 0; i < FRAMES; i++) {
    const time = i / RATE;
    let duck = 0;
    for (const cue of timeline)
      duck = Math.max(
        duck,
        smooth((time - cue.start + 0.18) / 0.18) *
          (1 - smooth((time - cue.end) / 0.8)),
      );
    // The tonal bed opens gently after each phrase: 0.46 between cues, 0.21 under speech.
    const musicGain = 0.46 - duck * 0.25;
    mixL[i] = limit(musicL[i] * musicGain + speech[i]);
    mixR[i] = limit(musicR[i] * musicGain + speech[i]);
  }
  reports.push(writeWav(path.join(output, `mix-${language}.wav`), mixL, mixR));
  timing.languages[language] = timeline;
}
const serializedTiming = JSON.stringify(timing, null, 2);
fs.writeFileSync(path.join(output, "narration-timing.json"), serializedTiming);
fs.writeFileSync(sourceTimingFile, serializedTiming);
fs.writeFileSync(
  path.join(output, "audio-verification.json"),
  JSON.stringify(reports, null, 2),
);
console.log(JSON.stringify({ timing, reports }, null, 2));
