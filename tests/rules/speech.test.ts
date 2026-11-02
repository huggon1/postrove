import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  copyFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { createHash } from "node:crypto";
import {
  SpeechService,
  SpeechRuntime,
  SpeechError,
  runSpeechProcess,
  parseWhisperOutput,
  acquireSpeechMedia,
  speechRuntimePins as pins,
  type SpeechProcessRunner,
} from "../../src/main/services/speech";
import { storeBytes } from "../../src/main/services/speech/media";

const ready = async () =>
  ({ backend: "whisper.cpp", runtime: "ready", model: "ready" }) as const;
const sha = (value: Buffer | string) =>
  createHash("sha256").update(value).digest("hex");
function wave(seconds: number, silent = false) {
  const pcm = Buffer.alloc(Math.round(seconds * 32_000));
  if (!silent)
    for (let i = 0; i < pcm.length; i += 2)
      pcm.writeInt16LE(Math.round(Math.sin(i / 20) * 1000), i);
  const head = Buffer.alloc(44);
  head.write("RIFF");
  head.writeUInt32LE(36 + pcm.length, 4);
  head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(16_000, 24);
  head.writeUInt32LE(32_000, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([head, pcm]);
}
async function fixture(
  t: { after(fn: () => Promise<void>): void },
  seconds = 3,
  silent = false,
) {
  const directory = await mkdtemp(join(tmpdir(), "postrove-speech-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const input = join(directory, "input.wav");
  await writeFile(input, wave(seconds, silent));
  const calls: string[][] = [];
  let recognition = 0;
  const run: SpeechProcessRunner = async ({ executable, args }) => {
    calls.push([basename(executable), ...args]);
    if (basename(executable).startsWith("ffmpeg")) {
      await copyFile(args[args.indexOf("-i") + 1], args.at(-1)!);
    } else {
      recognition++;
      const path = args[args.indexOf("-of") + 1];
      await writeFile(
        `${path}.json`,
        JSON.stringify({
          transcription: [
            {
              offsets: { from: 0, to: 1000 },
              text: ` 原文${recognition}，你好。 `,
            },
          ],
        }),
      );
    }
  };
  const create = (
    override?: Partial<ConstructorParameters<typeof SpeechService>[0]>,
  ) =>
    new SpeechService({
      runtimeRoot: join(directory, "runtime"),
      dataDir: directory,
      readiness: ready,
      run,
      budget: { chunkSeconds: 1 },
      ...override,
    });
  return {
    directory,
    input,
    calls,
    run,
    create,
    signal: new AbortController().signal,
  };
}

test("speech preserves recognized bytes and original timestamps across chunks and retry", async (t) => {
  const f = await fixture(t);
  let seen = 0;
  const service = f.create({
    run: async (request) => {
      if (basename(request.executable).startsWith("whisper") && ++seen === 2)
        throw new SpeechError("process_failed");
      await f.run(request);
    },
    budget: { chunkSeconds: 1, retries: 0 },
  });
  const partial = await service.transcribe({
    mediaPath: f.input,
    language: "zh",
    signal: f.signal,
  });
  assert.equal(partial.status, "partial");
  assert.deepEqual(partial.issue, { code: "process_failed", chunkIndex: 1 });
  assert.equal(partial.segments[0].text, " 原文1，你好。 ");
  const completed = await f
    .create()
    .transcribe({ mediaPath: f.input, language: "zh", signal: f.signal });
  assert.equal(completed.status, "completed");
  assert.equal(completed.provenance, "application_asr");
  assert.equal(completed.segments[0].text, partial.segments[0].text);
  assert.deepEqual(
    completed.segments.map(({ start, end }) => [start, end]),
    [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
  );
  assert.equal(
    f.calls.filter((call) => call[0].startsWith("whisper")).length,
    3,
  );
  assert.equal((await readdir(join(f.directory, "speech", "media"))).length, 1);
  assert.deepEqual(await readFile(f.input), wave(3));
  assert(
    f.calls.every(
      (call) => !call.includes("--translate") && !call.includes("-tr"),
    ),
  );
  const decode = f.calls.find((call) => call[0].startsWith("ffmpeg"))!;
  assert.equal(decode[decode.indexOf("-protocol_whitelist") + 1], "file,pipe");
});

test("digital silence completes with timed no_speech chunks and skips recognition", async (t) => {
  const f = await fixture(t, 2, true);
  const result = await f
    .create()
    .transcribe({ mediaPath: f.input, signal: f.signal });
  assert.equal(result.status, "completed");
  assert.equal(result.chunks.length, 2);
  assert(result.chunks.every((chunk) => chunk.state === "no_speech"));
  assert.deepEqual(result.segments, []);
  assert.equal(f.calls.length, 1);
});

test("long audio uses bounded chunks including the final short chunk", async (t) => {
  const f = await fixture(t, 601);
  const result = await f
    .create({ budget: {} })
    .transcribe({ mediaPath: f.input, signal: f.signal });
  assert.equal(result.status, "completed");
  assert.deepEqual(
    result.chunks.map(({ start, end }) => [start, end]),
    [
      [0, 300],
      [300, 600],
      [600, 601],
    ],
  );
  assert.equal(result.segments[2].start, 600);
});

test("Stop preserves completed chunks and a later call resumes them", async (t) => {
  const f = await fixture(t);
  const controller = new AbortController();
  const result = await f.create().transcribe({
    mediaPath: f.input,
    signal: controller.signal,
    onProgress: (progress) => {
      assert.equal(progress.chunks.length, 1);
      controller.abort();
    },
  });
  assert.equal(result.status, "cancelled");
  assert.equal(result.chunks.length, 1);
  const recovered = await f
    .create()
    .transcribe({ mediaPath: f.input, signal: f.signal });
  assert.equal(recovered.status, "completed");
  assert.equal(
    recovered.chunks[0].segments[0].text,
    result.chunks[0].segments[0].text,
  );
  assert.equal(
    f.calls.filter((call) => call[0].startsWith("whisper")).length,
    3,
  );
});

test("missing resources report dependency states before media processing", async (t) => {
  const f = await fixture(t);
  const result = await f
    .create({
      readiness: async () => ({
        backend: "whisper.cpp",
        runtime: "ready",
        model: "missing",
        issue: "model_missing",
      }),
    })
    .transcribe({ mediaPath: f.input, signal: f.signal });
  assert.equal(result.issue?.code, "model_missing");
  assert.equal(f.calls.length, 0);
});

test("media, duration, decode and total-time budgets retain their failure stages", async (t) => {
  const f = await fixture(t);
  assert.equal(
    (
      await f
        .create({ budget: { maxMediaBytes: 10 } })
        .transcribe({ mediaPath: f.input, signal: f.signal })
    ).issue?.code,
    "media_budget",
  );
  assert.equal(
    (
      await f
        .create({ budget: { maxDurationSeconds: 2 } })
        .transcribe({ mediaPath: f.input, signal: f.signal })
    ).issue?.code,
    "duration_budget",
  );
  assert.equal(
    (
      await f
        .create({
          run: async () => {
            throw new Error("raw private diagnostic");
          },
        })
        .transcribe({ mediaPath: f.input, signal: f.signal })
    ).issue?.code,
    "decode_failed",
  );
  const result = await f
    .create({
      budget: { totalTimeoutMs: 10 },
      run: async ({ signal }) => {
        await new Promise<void>((resolve) => {
          if (signal.aborted) resolve();
          else
            signal.addEventListener("abort", () => resolve(), { once: true });
        });
        throw new SpeechError("cancelled");
      },
    })
    .transcribe({ mediaPath: f.input, signal: f.signal });
  assert.equal(result.issue?.code, "timeout");
});

test("bounded process retries discard stale JSON and retain completed evidence", async (t) => {
  const f = await fixture(t, 1);
  let attempts = 0;
  const service = f.create({
    run: async (request) => {
      if (!basename(request.executable).startsWith("whisper"))
        return f.run(request);
      if (++attempts === 1) {
        await f.run(request);
        throw new SpeechError("process_failed");
      }
      // A successful exit with missing output must not admit the prior failed attempt.
    },
  });
  const result = await service.transcribe({
    mediaPath: f.input,
    signal: f.signal,
  });
  assert.equal(attempts, 2);
  assert.equal(result.status, "unavailable");
  assert.deepEqual(result.segments, []);
});

test("fractional tail timing preserves the recognizer end while clipping to original media", () => {
  const result = parseWhisperOutput(
    JSON.stringify({
      transcription: [{ offsets: { from: 0, to: 2000 }, text: "下午五點" }],
    }),
    2,
    4,
    5.592,
  );
  assert.deepEqual(result.segments, [
    {
      id: "speech-2-0",
      start: 4,
      end: 5.592,
      recognizerEnd: 6,
      text: "下午五點",
    },
  ]);
});

test("native timestamp overrun keeps the backend estimate and the bounded chunk end", () => {
  const chunk = parseWhisperOutput(
    JSON.stringify({
      transcription: [
        { offsets: { from: 26000, to: 31000 }, text: "開放時間" },
      ],
    }),
    1,
    30,
    60,
  );
  assert.deepEqual(chunk.segments, [
    {
      id: "speech-1-0",
      start: 56,
      end: 60,
      recognizerEnd: 61,
      text: "開放時間",
    },
  ]);
  assert.throws(
    () =>
      parseWhisperOutput(
        JSON.stringify({
          transcription: [
            {
              offsets: { from: 26000, to: 32000 },
              text: "outside timing budget",
            },
          ],
        }),
        1,
        30,
        60,
      ),
    /invalid_output/,
  );
});

test("invalid timestamps and unordered output fail validation; empty transcription records no speech", () => {
  assert.throws(
    () =>
      parseWhisperOutput(
        '{"transcription":[{"offsets":{"from":0,"to":999999},"text":"bad"}]}',
        0,
        0,
        1,
      ),
    /invalid_output/,
  );
  assert.throws(
    () =>
      parseWhisperOutput(
        '{"transcription":[{"offsets":{"from":-1,"to":0},"text":"bad"}]}',
        0,
        0,
        1,
      ),
    /invalid_output/,
  );
  assert.throws(() => parseWhisperOutput("{}", 0, 0, 1), /invalid_output/);
  assert.equal(
    parseWhisperOutput('{"transcription":[]}', 0, 0, 1).state,
    "no_speech",
  );
});

test("a shared profile has one active speech job", async (t) => {
  const f = await fixture(t, 1);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let admitted!: () => void;
  const entered = new Promise<void>((resolve) => {
    admitted = resolve;
  });
  const first = f
    .create({
      readiness: async () => {
        admitted();
        await held;
        return ready();
      },
    })
    .transcribe({ mediaPath: f.input, signal: f.signal });
  await entered;
  assert.equal(
    (await f.create().transcribe({ mediaPath: f.input, signal: f.signal }))
      .issue?.code,
    "busy",
  );
  release();
  assert.equal((await first).status, "completed");
});

test("native process boundary handles exit, failure, timeout, cancellation and output limits", async (t) => {
  const f = await fixture(t);
  const request = {
    executable: process.execPath,
    cwd: f.directory,
    signal: f.signal,
    timeoutMs: 10_000,
  };
  await runSpeechProcess({ ...request, args: ["-e", "process.exit(0)"] });
  await assert.rejects(
    runSpeechProcess({ ...request, args: ["-e", "process.exit(7)"] }),
    /process_failed/,
  );
  await assert.rejects(
    runSpeechProcess({
      ...request,
      args: ["-e", "setInterval(()=>{},100)"],
      timeoutMs: 20,
    }),
    /timeout/,
  );
  const controller = new AbortController();
  const job = runSpeechProcess({
    ...request,
    signal: controller.signal,
    args: ["-e", "setInterval(()=>{},100)"],
  });
  controller.abort();
  await assert.rejects(job, /cancelled/);
  await assert.rejects(
    runSpeechProcess({
      ...request,
      args: ["-e", "process.stdout.write('x'.repeat(10000))"],
      maxOutputBytes: 100,
    }),
    /output_budget/,
  );
  await assert.rejects(
    runSpeechProcess({
      ...request,
      executable: join(f.directory, "missing"),
      args: [],
    }),
    /process_failed/,
  );
});

test("runtime checks platform, pinned versions, binary integrity and model independently", async (t) => {
  const f = await fixture(t);
  const runtime = new SpeechRuntime(
    join(f.directory, "runtime"),
    f.directory,
    "win32-x64",
  );
  assert.equal((await runtime.check()).issue, "runtime_missing");
  await mkdir(runtime.directory, { recursive: true });
  const files = {
    "whisper-cli.exe": sha("whisper"),
    "ffmpeg.exe": sha("ffmpeg"),
    "whisper.dll": sha("dll"),
  };
  for (const [name, bytes] of Object.entries({
    "whisper-cli.exe": "whisper",
    "ffmpeg.exe": "ffmpeg",
    "whisper.dll": "dll",
  }))
    await writeFile(join(runtime.directory, name), bytes);
  await writeFile(
    join(runtime.directory, "runtime.json"),
    JSON.stringify({
      whisper: pins.whisper,
      ffmpeg: pins.ffmpeg,
      target: "win32-x64",
      files,
    }),
  );
  assert.equal((await runtime.check()).issue, "model_missing");
  await mkdir(runtime.modelDirectory, { recursive: true });
  await writeFile(runtime.model, "invalid");
  assert.equal((await runtime.check()).issue, "model_integrity");
  await writeFile(join(runtime.directory, "whisper.dll"), "changed");
  assert.equal((await runtime.check()).issue, "runtime_integrity");
  assert.equal(
    (await new SpeechRuntime(f.directory, f.directory, "linux-x64").check())
      .issue,
    "unsupported_runtime",
  );
});

test("media acquisition constrains redirects, strips cross-origin headers and preserves exact bytes", async (t) => {
  const f = await fixture(t);
  const requests: Array<{ url: string; headers?: HeadersInit }> = [];
  const result = await acquireSpeechMedia({
    url: "https://media.example/clip?token=local",
    allowedHosts: ["media.example", "cdn.example"],
    headers: { Cookie: "fixture-cookie" },
    directory: join(f.directory, "media"),
    signal: f.signal,
    fetch: async (url, init) => {
      requests.push({ url: String(url), headers: init?.headers });
      return requests.length === 1
        ? new Response(null, {
            status: 302,
            headers: { location: "https://cdn.example/audio" },
          })
        : new Response("audio bytes");
    },
  });
  assert.deepEqual(requests[0].headers, { Cookie: "fixture-cookie" });
  assert.equal(requests[1].headers, undefined);
  assert.equal(await readFile(result.path, "utf8"), "audio bytes");
  assert.equal(result.sha256, sha("audio bytes"));
  assert.deepEqual(await readdir(join(f.directory, "media")), [result.sha256]);
});

test("download limits, HTTP failures and blocked addresses retain observed causes", async (t) => {
  const f = await fixture(t);
  const options = {
    url: "https://media.example/audio",
    allowedHosts: ["media.example"],
    directory: join(f.directory, "media"),
    signal: f.signal,
  };
  await assert.rejects(
    acquireSpeechMedia({
      ...options,
      maxBytes: 2,
      fetch: async () => new Response("large"),
    }),
    /media_budget/,
  );
  await assert.rejects(
    acquireSpeechMedia({
      ...options,
      fetch: async () => new Response("access restricted", { status: 403 }),
    }),
    /download_failed/,
  );
  await assert.rejects(
    acquireSpeechMedia({ ...options, url: "http://media.example/audio" }),
    /media_unavailable/,
  );
  await assert.rejects(
    acquireSpeechMedia({
      ...options,
      fetch: async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://127.0.0.1/private" },
        }),
    }),
    /media_unavailable/,
  );
  assert.deepEqual(await readdir(options.directory), []);
});

test("failed model verification and cancellation preserve an existing file and remove staging bytes", async (t) => {
  const f = await fixture(t);
  const directory = join(f.directory, "models");
  await mkdir(directory);
  await writeFile(join(directory, "model.bin"), "retained");
  async function* bytes() {
    yield Buffer.from("wrong");
  }
  await assert.rejects(
    storeBytes(directory, bytes(), f.signal, 100, {
      file: "model.bin",
      bytes: 5,
      sha256: sha("right"),
    }),
    /download_integrity/,
  );
  assert.equal(
    await readFile(join(directory, "model.bin"), "utf8"),
    "retained",
  );
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    storeBytes(directory, bytes(), controller.signal, 100),
    /cancelled/,
  );
  assert.deepEqual(await readdir(directory), ["model.bin"]);
});
