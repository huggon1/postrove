import "./prepare.mjs";
import { bundle } from "@remotion/bundler";
import {
  renderMedia,
  renderStill,
  selectComposition,
} from "@remotion/renderer";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, "output");
const browserExecutable =
  process.env.POSTROVE_RENDER_CHROME ||
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const stillsOnly = process.argv.includes("--stills");
const english = process.argv.includes("--english");
const language = english ? "en" : "zh-CN";
await mkdir(out, { recursive: true });
await copyFile(
  path.join(out, "soundtrack.wav"),
  path.join(root, "public/soundtrack.wav"),
);
console.log("Bundling film…");
const serveUrl = await bundle({
  entryPoint: path.join(root, "src/index.tsx"),
  publicDir: path.join(root, "public"),
  outDir: path.join(
    root,
    ".bundle",
    stillsOnly ? `review-${language}` : language,
  ),
});
const inputProps = { language, sound: true };
const composition = await selectComposition({
  serveUrl,
  id: english ? "Postrove-EN" : "Postrove-CN",
  inputProps,
  browserExecutable,
  chromeMode: "chrome-for-testing",
});
const samples = [
  0.5, 1.8, 3.6, 5.4, 7.2, 9.2, 10.7, 12.3, 13.6, 15, 17, 19.5, 21.1, 22.8,
  24.3, 25.7, 27.4, 29.7, 31.5, 33, 34.7, 36.5, 38.5, 41.4, 43.5, 45.5, 47.3,
];
await mkdir(path.join(out, `stills-v4-${language}`), { recursive: true });
const requested = process.argv.find((x) => x.startsWith("--samples="));
const reviewSamples = requested
  ? requested.split("=")[1].split(",").map(Number)
  : samples;
for (const s of process.argv.includes("--skip-stills") ? [] : reviewSamples) {
  await renderStill({
    serveUrl,
    composition,
    inputProps,
    frame: Math.round(s * composition.fps),
    output: path.join(
      out,
      `stills-v4-${language}`,
      `${String(s).padStart(4, "0")}.png`,
    ),
    browserExecutable,
    chromeMode: "chrome-for-testing",
    imageFormat: "png",
    scale: 0.6,
  });
}
console.log(
  process.argv.includes("--skip-stills")
    ? "Using existing review frames."
    : `Rendered ${reviewSamples.length} review frames.`,
);
if (stillsOnly) process.exit(0);
const output = path.join(out, `postrove-${language}-1080p.mp4`);
const visuals = path.join(out, `postrove-${language}-visuals.mp4`);
let last = -1;
await renderMedia({
  serveUrl,
  composition,
  inputProps: { ...inputProps, sound: false },
  muted: true,
  browserExecutable,
  chromeMode: "chrome-for-testing",
  codec: "h264",
  audioCodec: "aac",
  crf: 18,
  pixelFormat: "yuv420p",
  outputLocation: visuals,
  concurrency: 1,
  timeoutInMilliseconds: 90000,
  onBrowserLog: (log) => {
    if (log.type === "error") console.log("Browser:", log.text);
  },
  x264Preset: "medium",
  onProgress: ({ progress }) => {
    const pct = Math.floor((progress * 100) / 5) * 5;
    if (pct > last) {
      last = pct;
      console.log(`Film render: ${pct}%`);
    }
  },
});
const require = createRequire(import.meta.url);
const binaries = require("@remotion/compositor-darwin-arm64").dir;
execFileSync(
  path.join(binaries, "ffmpeg"),
  [
    "-y",
    "-v",
    "error",
    "-i",
    visuals,
    "-i",
    path.join(out, `mix-${language}.wav`),
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "256k",
    "-t",
    String(composition.durationInFrames / composition.fps),
    "-movflags",
    "+faststart",
    output,
  ],
  { env: { ...process.env, DYLD_LIBRARY_PATH: binaries }, stdio: "inherit" },
);
await writeFile(
  path.join(out, `render-${language}.json`),
  JSON.stringify(
    {
      output,
      language,
      width: composition.width,
      height: composition.height,
      fps: composition.fps,
      frames: composition.durationInFrames,
      duration: composition.durationInFrames / composition.fps,
      sourceCaptures:
        "Dedicated fictional game-demo captures from the real application",
      renderedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
console.log(output);
