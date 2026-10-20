import { execFileSync } from "node:child_process";
import { readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
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
const errors = [];
if (v?.width !== 1920 || v?.height !== 1080)
  errors.push("Expected 1920×1080 video");
if (v?.codec_name !== "h264" || v?.r_frame_rate !== "60/1")
  errors.push("Expected H.264 at 60fps");
if (Number(v?.nb_read_frames) !== 2880)
  errors.push("Expected all 2880 video frames");
if (a?.codec_name !== "aac" || a?.channels !== 2)
  errors.push("Expected stereo AAC");
if (Math.abs(Number(info.format.duration) - 48) > 0.1)
  errors.push("Expected 48-second film");
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
  {
    encoding: "utf8",
    env,
    maxBuffer: 8 * 1024 * 1024,
  },
);
const wav = await readFile(path.join(root, `output/mix-${lang}.wav`));
let peak = 0,
  sum = 0;
for (let i = 44; i < wav.length; i += 2) {
  const s = wav.readInt16LE(i) / 32768;
  peak = Math.max(peak, Math.abs(s));
  sum += s * s;
}
const narration = JSON.parse(
  await readFile(path.join(root, "voice-assets/timing.json"), "utf8"),
);
const cues = narration.languages[lang];
if (
  cues.length !== 3 ||
  cues.some((c) => c.start < 0 || c.end > 48 || c.end <= c.start)
)
  errors.push("Expected three valid narration cues inside the film");
if (
  wav.readUInt32LE(24) !== 48000 ||
  wav.readUInt16LE(22) !== 2 ||
  (wav.length - 44) / 192000 !== 48
)
  errors.push("Expected 48-second 48kHz stereo mix");
const report = {
  passed: errors.length === 0,
  errors,
  video,
  width: v.width,
  height: v.height,
  fps: v.r_frame_rate,
  frames: Number(v.nb_read_frames),
  duration: Number(info.format.duration),
  videoCodec: v.codec_name,
  audioCodec: a.codec_name,
  channels: a.channels,
  bytes: (await stat(video)).size,
  audio: {
    peakDbFS: 20 * Math.log10(peak),
    rmsDbFS: 20 * Math.log10(Math.sqrt(sum / ((wav.length - 44) / 2))),
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
