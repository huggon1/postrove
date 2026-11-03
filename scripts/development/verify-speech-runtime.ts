import assert from "node:assert/strict";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { isAbsolute, join, resolve } from "node:path";
import {
  SpeechService,
  runSpeechProcess,
  speechRuntimePins,
  type SpeechProcessRunner,
} from "../../src/main/services/speech";

const args = process.argv.slice(2);
if (
  args.length !== 4 ||
  args[0] !== "--profile" ||
  args[2] !== "--output" ||
  !isAbsolute(args[1]) ||
  !isAbsolute(args[3])
)
  throw new Error(
    "Usage: npm run verify:speech-runtime -- --profile /absolute/profile --output /absolute/evidence",
  );
const dataDir = resolve(args[1]),
  output = resolve(args[3]),
  runtimeRoot = resolve(".runtime");
await mkdir(output, { recursive: true, mode: 0o700 });
const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
const signal = controller.signal;
let observedCase = "short-chinese";
const observeRun: SpeechProcessRunner = async (request) => {
  await runSpeechProcess(request);
  if (!request.args.includes("-oj")) return;
  const file = `${request.args[request.args.indexOf("-of") + 1]}.json`;
  if ((await stat(file)).size > 1_048_576) return;
  let parsed;
  try {
    parsed = JSON.parse(await readFile(file, "utf8"));
  } catch {
    return;
  }
  await writeFile(
    join(output, `recognizer-${observedCase}-${randomUUID()}.json`),
    JSON.stringify(
      { result: parsed.result, transcription: parsed.transcription },
      null,
      2,
    ),
    { mode: 0o600 },
  );
};
const service = new SpeechService({ runtimeRoot, dataDir, run: observeRun });
async function recordCase(name: string, result: unknown) {
  await writeFile(
    join(output, `${name}.json`),
    JSON.stringify(result, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify({ completedCase: name }));
}
const readiness = await service.check();
assert.equal(readiness.runtime, "ready");
if (readiness.model !== "ready") await service.downloadModel(signal);
assert.equal((await service.check()).model, "ready");
console.log(JSON.stringify({ stage: "resources_ready" }));

// Public short test wave documented by sherpa's SenseVoice examples.
const sample = {
  url: "https://huggingface.co/csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17/resolve/main/test_wavs/zh.wav",
  sha256: "b77f1794fe374a0ba1ee1dc458bfaf9349496cbbfc32780c50ba3c5a7ad8e373",
  bytes: 178988,
  usage: "https://k2-fsa.github.io/sherpa/onnx/sense-voice/pretrained.html",
};
const media = await service.acquireMedia({
  url: sample.url,
  allowedHosts: [
    "huggingface.co",
    "us.aws.cdn.hf.co",
    "cdn-lfs.huggingface.co",
  ],
  signal,
});
assert.equal(media.sha256, sample.sha256);
assert.equal(media.bytes, sample.bytes);
const start = performance.now();
const chinese = await service.transcribe({
  mediaPath: media.path,
  language: "zh",
  signal,
});
const elapsedMs = Math.round(performance.now() - start);
await writeFile(
  join(output, "short-chinese.json"),
  JSON.stringify({ sample, elapsedMs, chinese }, null, 2),
);
assert.equal(chinese.status, "completed");
console.log(
  JSON.stringify({
    completedCase: "short_chinese",
    elapsedMs,
    text: chinese.segments.map((segment) => segment.text).join(""),
  }),
);
assert(chinese.segments.length > 0);
assert(
  chinese.segments.every(
    (segment) => segment.start >= 0 && segment.end <= chinese.duration!,
  ),
);
// Assert the time-of-day content shared by the public example's transcript.
// Other words and broader semantic quality retain their manual-review scope.
const text = chinese.segments.map((segment) => segment.text).join("");
const normalized = text
  .replace(/點/g, "点")
  .replace(/九/g, "9")
  .replace(/五/g, "5")
  .replace(/\s/g, "");
assert(
  normalized.includes("早上9点") && normalized.includes("下午5点"),
  "Short Chinese sample lost its time-of-day content",
);

function silence(seconds: number) {
  const size = seconds * 32_000,
    bytes = Buffer.alloc(size + 44);
  bytes.write("RIFF");
  bytes.writeUInt32LE(size + 36, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(16_000, 24);
  bytes.writeUInt32LE(32_000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(size, 40);
  return bytes;
}
const silentPath = join(dataDir, "speech", "silence-fixture.wav");
await writeFile(silentPath, silence(2), { mode: 0o600 });
const silent = await service.transcribe({ mediaPath: silentPath, signal });
assert.equal(silent.status, "completed");
assert.equal(silent.segments.length, 0);
await recordCase("digital-silence", silent);
const longPath = join(dataDir, "speech", "long-silence-fixture.wav");
await writeFile(longPath, silence(601), { mode: 0o600 });
const long = await service.transcribe({ mediaPath: longPath, signal });
assert.equal(long.status, "completed");
assert.deepEqual(
  long.chunks.map(({ start, end }) => [start, end]),
  [
    [0, 300],
    [300, 600],
    [600, 601],
  ],
);

const spokenPath = join(dataDir, "speech", "long-spoken-fixture.wav");
await recordCase("long-silence", long);
observedCase = "long-spoken";
await runSpeechProcess({
  executable: service.runtime.ffmpeg,
  cwd: dataDir,
  signal,
  timeoutMs: 60_000,
  args: [
    "-nostdin",
    "-v",
    "error",
    "-stream_loop",
    "11",
    "-i",
    media.path,
    "-t",
    "61",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    "-f",
    "wav",
    "-y",
    spokenPath,
  ],
});
const longSpoken = await new SpeechService({
  runtimeRoot,
  dataDir,
  run: observeRun,
  budget: { chunkSeconds: 30 },
}).transcribe({ mediaPath: spokenPath, language: "zh", signal });
await recordCase("long-spoken", longSpoken);
assert.equal(longSpoken.status, "completed");
assert.equal(longSpoken.chunks.length, 3);
assert.deepEqual(
  longSpoken.chunks.map(({ index, start, end }) => [index, start, end]),
  [
    [0, 0, 30],
    [1, 30, 60],
    [2, 60, 61],
  ],
);
assert(
  longSpoken.chunks.every((chunk) =>
    chunk.segments.every(
      (segment) =>
        segment.start >= chunk.start &&
        segment.start <= segment.end &&
        segment.end <= chunk.end,
    ),
  ),
);
assert(longSpoken.segments.some((segment) => segment.start >= 30));
assert(
  longSpoken.segments.every((segment) => segment.end <= longSpoken.duration!),
);

const stop = new AbortController();
observedCase = "stop-resume";
const chunked = new SpeechService({
  runtimeRoot,
  dataDir,
  run: observeRun,
  budget: { chunkSeconds: 2 },
});
const stopped = await chunked.transcribe({
  mediaPath: media.path,
  language: "zh",
  signal: stop.signal,
  onProgress: () => stop.abort(),
});
assert.equal(stopped.status, "cancelled");
assert.equal(stopped.chunks.length, 1);
const resumed = await chunked.transcribe({
  mediaPath: media.path,
  language: "zh",
  signal,
});
assert.equal(resumed.status, "completed");
assert.deepEqual(resumed.chunks[0], stopped.chunks[0]);
await recordCase("stop-resume", { stopped, resumed });

const interrupt = new AbortController();
observedCase = "process-cancellation";
const interrupted = new SpeechService({
  runtimeRoot,
  dataDir,
  run: async (request) => {
    const child = observeRun(request);
    if (request.args.includes("-oj")) setTimeout(() => interrupt.abort(), 20);
    return child;
  },
});
const cancelled = await interrupted.transcribe({
  mediaPath: media.path,
  language: "en",
  signal: interrupt.signal,
});
assert.equal(cancelled.status, "cancelled");
const missing = new SpeechService({
  runtimeRoot,
  dataDir: join(dataDir, "missing-model-fixture"),
});
assert.equal(
  (await missing.transcribe({ mediaPath: media.path, signal })).issue?.code,
  "model_missing",
);
const failing = new SpeechService({
  runtimeRoot,
  dataDir,
  run: async (request) => {
    if (request.args.includes("-oj"))
      throw new Error("Controlled process failure");
    return runSpeechProcess(request);
  },
});
assert.equal(
  (await failing.transcribe({ mediaPath: media.path, language: "ja", signal }))
    .issue?.code,
  "process_failed",
);

await writeFile(
  join(output, "native-verification.json"),
  JSON.stringify(
    {
      platform: process.platform,
      arch: process.arch,
      runtime: speechRuntimePins,
      shortChineseElapsedMs: elapsedMs,
      shortChineseText: text,
      native: { silent, long, longSpoken, stopped, resumed, cancelled },
      controlled: ["missing_model", "recognizer_process_failure"],
      pending: [
        "broader_recognition_quality",
        "real_website_media",
        "final_application_integration",
      ],
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({
    platform: process.platform,
    arch: process.arch,
    shortChineseElapsedMs: elapsedMs,
    shortChineseText: text,
    status: "passed",
  }),
);
