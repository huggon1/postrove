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
const draft = process.argv.includes("--draft");
const reviewDir = `stills-v10-${language}`;
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
  0,
  0.5,
  1.5,
  2.8,
  3.2,
  ...[
    1.2, 2.8, 5.8, 9.5, 13.2, 17.5, 20, 23.5, 25, 25.2, 26.4, 28.5, 32.2, 34,
    35.5, 38.7, 39.5, 41.2, 43.5, 45.8, 46.8, 47.6, 49.5, 53,
  ].map((time) => time + 3),
];
await mkdir(path.join(out, reviewDir), { recursive: true });
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
    output: path.join(out, reviewDir, `${String(s).padStart(4, "0")}.png`),
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
const output = path.join(
  out,
  `postrove-${language}-${draft ? "draft" : "1080p"}.mp4`,
);
const visuals = path.join(
  out,
  `postrove-${language}-${draft ? "draft-" : ""}visuals.mp4`,
);
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
  scale: draft ? 0.5 : 1,
  everyNthFrame: draft ? 2 : 1,
  timeoutInMilliseconds: 90000,
  onBrowserLog: (log) => {
    if (log.type === "error") console.log("Browser:", log.text);
  },
  x264Preset: draft ? "veryfast" : "medium",
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
  path.join(out, `render-${language}${draft ? "-draft" : ""}.json`),
  JSON.stringify(
    {
      output,
      language,
      width: composition.width * (draft ? 0.5 : 1),
      height: composition.height * (draft ? 0.5 : 1),
      fps: composition.fps / (draft ? 2 : 1),
      frames: composition.durationInFrames / (draft ? 2 : 1),
      duration: composition.durationInFrames / composition.fps,
      sourceCaptures:
        "Current real application captures with fictional pixel-game development records; procedural phone narrative",
      renderedAt: new Date().toISOString(),
    },
    null,
    2,
  ),
);
console.log(output);
// All media and reports have been written. Retire CLI watcher handles.
process.exit(0);
