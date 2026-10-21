import { execFileSync } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const story = JSON.parse(await readFile(path.join(root, "story.json"), "utf8"));
const require = createRequire(import.meta.url);
const binaries = require("@remotion/compositor-darwin-arm64").dir;
const env = { ...process.env, DYLD_LIBRARY_PATH: binaries };
const probe = path.join(binaries, "ffprobe");
const ffmpeg = path.join(binaries, "ffmpeg");
const lang = process.argv.includes("--english") ? "en" : "zh-CN";
const video = path.join(root, `output/postrove-${lang}-1080p.mp4`);
const info = JSON.parse(
  execFileSync(
    probe,
    [
      "-v",
      "error",
      "-count_frames",
      "-show_streams",
      "-show_format",
      "-of",
      "json",
      video,
    ],
    { encoding: "utf8", env },
  ),
);
const v = info.streams.find((s) => s.codec_type === "video");
const a = info.streams.find((s) => s.codec_type === "audio");
const expectedFrames = Math.round(story.seconds * story.fps);
const errors = [];
if (v?.width !== 1920 || v?.height !== 1080)
  errors.push("Expected 1920×1080 video");
if (v?.codec_name !== "h264" || v?.r_frame_rate !== `${story.fps}/1`)
  errors.push(`Expected H.264 at ${story.fps}fps`);
if (Number(v?.nb_read_frames) !== expectedFrames)
  errors.push(`Expected all ${expectedFrames} video frames`);
if (
  a?.codec_name !== "aac" ||
  a?.channels !== 2 ||
  Number(a?.sample_rate) !== 48000
)
  errors.push("Expected 48kHz stereo AAC");
if (Math.abs(Number(info.format.duration) - story.seconds) > 0.1)
  errors.push(`Expected ${story.seconds}-second film`);
execFileSync(
  ffmpeg,
  [
    "-v",
    "error",
    "-i",
    video,
    "-c:v",
    "rawvideo",
    "-c:a",
    "pcm_s16le",
    "-f",
    "null",
    "-",
  ],
  { encoding: "utf8", env, maxBuffer: 8 * 1024 * 1024 },
);

const wav = await readFile(path.join(root, `output/mix-${lang}.wav`));
let position = 12,
  pcm,
  channels,
  rate,
  bits;
while (position + 8 <= wav.length) {
  const id = wav.toString("ascii", position, position + 4);
  const size = wav.readUInt32LE(position + 4);
  if (id === "fmt ") {
    channels = wav.readUInt16LE(position + 10);
    rate = wav.readUInt32LE(position + 12);
    bits = wav.readUInt16LE(position + 22);
  }
  if (id === "data") pcm = wav.subarray(position + 8, position + 8 + size);
  position += 8 + size + (size % 2);
}
if (
  channels !== 2 ||
  rate !== 48000 ||
  bits !== 16 ||
  pcm?.length !== story.seconds * 192000
)
  throw new Error(`Expected ${story.seconds}-second 48kHz stereo PCM16 mix`);
const encodedWav = execFileSync(
  ffmpeg,
  [
    "-v",
    "error",
    "-i",
    video,
    "-vn",
    "-ac",
    "2",
    "-ar",
    "48000",
    "-c:a",
    "pcm_s16le",
    "-f",
    "wav",
    "-",
  ],
  { env, maxBuffer: story.seconds * 192000 + 1024 * 1024 },
);
let encoded;
for (let cursor = 12; cursor + 8 <= encodedWav.length;) {
  const id = encodedWav.toString("ascii", cursor, cursor + 4);
  const size = encodedWav.readUInt32LE(cursor + 4);
  if (id === "data") {
    encoded = encodedWav.subarray(
      cursor + 8,
      Math.min(encodedWav.length, cursor + 8 + size),
    );
    break;
  }
  cursor += 8 + size + (size % 2);
}
if (!encoded) throw new Error("Decoded MP4 audio has no PCM data");
let peak = 0,
  sum = 0,
  encodedSum = 0,
  dot = 0,
  difference = 0;
const samples = Math.min(pcm.length, encoded.length) / 2;
for (let i = 0; i < samples; i++) {
  const s = pcm.readInt16LE(i * 2) / 32768;
  const e = encoded.readInt16LE(i * 2) / 32768;
  peak = Math.max(peak, Math.abs(s));
  sum += s * s;
  encodedSum += e * e;
  dot += s * e;
  difference += (s - e) ** 2;
}
const correlation = dot / Math.sqrt(sum * encodedSum);
if (!Number.isFinite(correlation) || correlation < 0.985)
  errors.push("Encoded audio differs from the current mix");
if (peak >= 10 ** (-1 / 20))
  errors.push("Mix exceeds -1 dBFS delivery ceiling");
const narration = JSON.parse(
  await readFile(path.join(root, "voice-assets/timing.json"), "utf8"),
);
const cues = narration.languages[lang];
const intended = story.narration[lang];
if (narration.duration !== story.seconds || cues.length !== intended.length)
  errors.push("Narration manifest differs from the story timeline");
for (const [index, cue] of cues.entries()) {
  const planned = intended[index];
  if (
    !planned ||
    cue.start !== planned.start ||
    cue.text !== planned.text ||
    cue.spokenText !== (planned.spokenText ?? planned.text) ||
    JSON.stringify(cue.speechEdits ?? []) !==
      JSON.stringify(planned.speechEdits ?? []) ||
    cue.end > planned.end ||
    cue.end <= cue.start ||
    cue.start < 0 ||
    cue.end > story.seconds ||
    cue.playbackRate !== 1
  )
    errors.push(`Narration cue ${index + 1} differs from its story window`);
}
const db = (value) => 20 * Math.log10(Math.max(value, 1e-12));
const report = {
  passed: errors.length === 0,
  errors,
  video: path.relative(root, video),
  storyVersion: story.version,
  language: lang,
  width: v.width,
  height: v.height,
  fps: v.r_frame_rate,
  frames: Number(v.nb_read_frames),
  expectedFrames,
  duration: Number(info.format.duration),
  videoCodec: v.codec_name,
  audioCodec: a.codec_name,
  channels: a.channels,
  bytes: (await stat(video)).size,
  audio: {
    peakDbFS: db(peak),
    rmsDbFS: db(Math.sqrt(sum / samples)),
    encodedRmsDbFS: db(Math.sqrt(encodedSum / samples)),
    sourceCorrelation: correlation,
    codecErrorRms: Math.sqrt(difference / samples),
  },
  narration: cues,
  decode: "All video frames and audio decoded successfully",
};
await writeFile(
  path.join(root, `output/verification-${lang}.json`),
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
if (errors.length) process.exit(1);
