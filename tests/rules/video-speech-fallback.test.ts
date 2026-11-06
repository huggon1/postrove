import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { VideoSpeechFallback } from "../../src/main/services/video-speech";
import {
  YoutubeTranscriptReader,
  youtubeRuntimeVersion,
  type TranscriptRun,
} from "../../src/main/services/youtube-transcript";
import { BilibiliTranscriptReader } from "../../src/main/services/bilibili-transcript";
import { videoIdentity } from "../../src/shared/video-contracts";
import { readVideoCheckpoint } from "../../src/main/services/video-checkpoint";
import type { SpeechResult } from "../../src/shared/speech-contracts";
import type { SpeechService } from "../../src/main/services/speech";

const videoId = "abcdefghijk",
  bvid = "BV1234567890";
async function fixture(
  options: {
    missingModel?: boolean;
    abortOnTranscribe?: AbortController;
    failFirstMedia?: boolean;
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), "postrove-video-speech-"));
  const runtimeRoot = join(root, "runtime"),
    evidenceRoot = join(root, "evidence");
  const runtime = join(runtimeRoot, "youtube");
  await mkdir(runtime, { recursive: true });
  await writeFile(
    join(runtime, "runtime.json"),
    JSON.stringify(youtubeRuntimeVersion),
  );
  for (const name of ["yt-dlp", "deno"])
    await writeFile(
      join(runtime, name + (process.platform === "win32" ? ".exe" : "")),
      "fixture",
      { mode: 0o700 },
    );
  let transcriptions = 0,
    downloads = 0;
  const result: SpeechResult = {
    status: "completed",
    provenance: "application_asr",
    backend: "whisper.cpp",
    runtimeVersion: "fixture",
    model: "small",
    modelSha256: "a".repeat(64),
    language: "auto",
    duration: 10,
    chunks: [
      {
        index: 0,
        start: 0,
        end: 10,
        state: "speech",
        detectedLanguage: "zh",
        segments: [],
      },
    ],
    segments: [
      {
        id: "speech-0-0",
        start: 1,
        end: 3,
        recognizerEnd: 3.2,
        text: "视频中的原文。",
      },
    ],
  };
  const speech: Pick<SpeechService, "check" | "transcribe" | "acquireMedia"> = {
    async check() {
      return {
        backend: "whisper.cpp",
        runtime: "ready",
        model: options.missingModel ? "missing" : "ready",
        ...(options.missingModel ? { issue: "model_missing" as const } : {}),
      };
    },
    async transcribe(request) {
      transcriptions++;
      await request.onProgress?.(result);
      if (options.abortOnTranscribe) {
        options.abortOnTranscribe.abort();
        throw new Error("Cancelled");
      }
      return result;
    },
    async acquireMedia(request) {
      downloads++;
      assert.match(request.url, /^https:\/\/audio\.bilivideo\.com\//);
      assert.deepEqual(request.allowedHosts, ["audio.bilivideo.com"]);
      assert.equal(
        request.headers?.Referer,
        `https://www.bilibili.com/video/${bvid}?p=2`,
      );
      if (options.failFirstMedia && downloads === 1)
        throw new Error("download_failed");
      const path = join(root, "audio");
      await writeFile(path, "fixture");
      return { path, sha256: "a".repeat(64), bytes: 7 };
    },
  };
  const run: TranscriptRun = async (_exec, args, directory) => {
    if (args.includes("--dump-single-json"))
      return JSON.stringify({
        id: args.at(-1)?.includes("bilibili") ? `${bvid}_p2` : videoId,
        title: "Source title",
        description: "Source description",
        duration: 10,
        subtitles: {},
      });
    downloads++;
    assert.ok(args.includes("256M"));
    assert.equal(args.includes("--skip-download"), false);
    await writeFile(join(directory, "speech-media.webm"), "fixture audio");
    return "";
  };
  const fallback = new VideoSpeechFallback(runtimeRoot, speech, run);
  return {
    options,
    root,
    runtimeRoot,
    evidenceRoot,
    run,
    fallback,
    counts: () => ({ transcriptions, downloads }),
  };
}

test("YouTube captions absent downloads audio once and retains timestamped ASR provenance", async () => {
  const f = await fixture();
  try {
    const reader = new YoutubeTranscriptReader(
      f.runtimeRoot,
      f.evidenceRoot,
      f.run,
      f.fallback,
    );
    const attempt = randomUUID(),
      signal = new AbortController().signal;
    const result = await reader.read(
      `https://youtu.be/${videoId}`,
      attempt,
      signal,
    );
    assert.equal(result.outcome, "content");
    if (result.outcome !== "content") return;
    assert.equal(
      result.source.evidence &&
        "provenance" in result.source.evidence &&
        result.source.evidence.provenance.source,
      "application_asr",
    );
    assert.equal(result.source.evidence?.language, "zh");
    assert.equal(
      result.source.evidence?.segments[0].url,
      `https://www.youtube.com/watch?v=${videoId}&t=1s`,
    );
    assert.equal("recognizerEnd" in result.source.evidence!.segments[0], false);
    const directory = join(f.evidenceRoot, attempt, "youtube", videoId);
    assert.equal(
      (await readdir(directory)).some((name) =>
        name.startsWith("speech-media."),
      ),
      false,
    );
    assert.match(
      await readFile(join(directory, "transcription.json"), "utf8"),
      /recognizerEnd/,
    );
    await reader.read(`https://youtu.be/${videoId}`, attempt, signal);
    assert.deepEqual(f.counts(), { transcriptions: 1, downloads: 1 });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("missing speech model preserves YouTube metadata and setup diagnostic without media download", async () => {
  const f = await fixture({ missingModel: true });
  try {
    const reader = new YoutubeTranscriptReader(
      f.runtimeRoot,
      f.evidenceRoot,
      f.run,
      f.fallback,
    );
    const attempt = randomUUID(),
      signal = new AbortController().signal;
    const result = await reader.read(
      `https://youtu.be/${videoId}`,
      attempt,
      signal,
    );
    assert.equal(result.outcome, "content");
    if (result.outcome !== "content") return;
    assert.match(result.source.markdown ?? "", /Source title/);
    assert.equal(result.source.evidence, undefined);
    assert.equal(result.diagnostic?.code, "component_missing");
    assert.deepEqual(result.diagnostic?.actions, ["setup_component"]);
    assert.deepEqual(f.counts(), { transcriptions: 0, downloads: 0 });
    const repeated = await reader.read(
      `https://youtu.be/${videoId}`,
      attempt,
      signal,
    );
    assert.deepEqual(repeated.diagnostic, result.diagnostic);
    f.options.missingModel = false;
    const resumed = await reader.read(
      `https://youtu.be/${videoId}`,
      attempt,
      signal,
    );
    assert.equal(resumed.outcome, "content");
    if (resumed.outcome === "content")
      assert.ok(resumed.source.evidence?.segments.length);
    assert.equal(resumed.diagnostic, undefined);
    assert.deepEqual(f.counts(), { transcriptions: 1, downloads: 1 });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("Bilibili subtitle login state still permits session-bound media ASR with HTTPS backups for the selected part", async () => {
  const f = await fixture({ failFirstMedia: true });
  const requests: string[] = [];
  try {
    const reader = new BilibiliTranscriptReader(
      f.runtimeRoot,
      f.evidenceRoot,
      f.run,
      f.fallback,
    );
    const result = await reader.read(
      `https://www.bilibili.com/video/${bvid}?p=2`,
      randomUUID(),
      new AbortController().signal,
      {
        async getJson(url) {
          requests.push(url);
          if (url.includes("/view?"))
            return {
              code: 0,
              data: {
                bvid,
                aid: 123,
                title: "Bilibili title",
                owner: { name: "Creator" },
                desc: "Written description\n\nhttps://example.org/reference",
                pic: "https://i0.hdslb.com/bfs/archive/cover.jpg",
                pages: [
                  {
                    page: 2,
                    cid: 789,
                    duration: 10,
                    part: "The selected part",
                  },
                ],
              },
            };
          if (url.includes("/v2?"))
            return {
              code: 0,
              data: {
                cid: 789,
                need_login_subtitle: true,
                subtitle: { subtitles: [] },
              },
            };
          assert.match(url, /\/playurl\?bvid=BV1234567890&cid=789/);
          return {
            code: 0,
            data: {
              dash: {
                audio: [
                  {
                    baseUrl:
                      "https://peer.mcdn.bilivideo.cn:8082/audio?token=private",
                    backupUrl: [
                      "https://audio.bilivideo.com/audio?token=private",
                      "https://audio.bilivideo.com/audio-backup?token=private",
                    ],
                  },
                ],
              },
            },
          };
        },
      },
    );
    assert.equal(result.outcome, "content");
    if (result.outcome !== "content") return;
    assert.equal(result.diagnostic, undefined);
    assert.match(result.source.markdown!, /The selected part/);
    assert.match(result.source.markdown!, /Written description/);
    assert.equal(result.source.images.length, 1);
    assert.equal(result.references.length, 1);
    assert.equal(
      "provenance" in result.source.evidence! &&
        result.source.evidence.provenance.source,
      "application_asr",
    );
    assert.match(result.source.evidence!.segments[0].url, /p=2&t=1/);
    assert.equal(
      result.source.evidence &&
        "video" in result.source.evidence &&
        result.source.evidence.video.cid,
      "789",
    );
    assert.equal(
      JSON.stringify(result.source).includes("token=private"),
      false,
    );
    assert.equal(requests.length, 3);
    assert.deepEqual(f.counts(), { downloads: 2, transcriptions: 1 });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("missing ASR resources retain video cover, part title and creator references", async () => {
  const f = await fixture({ missingModel: true });
  try {
    const directory = join(f.evidenceRoot, randomUUID());
    await mkdir(directory, { recursive: true });
    const result = await f.fallback.read({
      video: videoIdentity(`https://www.bilibili.com/video/${bvid}?p=2`)!,
      metadata: {
        title: "Video title",
        uploader: "Creator",
        partTitle: "Selected part",
        description:
          "The full written description\nhttps://example.org/creator",
        images: [
          {
            imageId: "bilibili-cover",
            url: "https://i0.hdslb.com/bfs/archive/cover.jpg",
            alt: "Video cover",
          },
        ],
      },
      directory,
      artifactKey: `${randomUUID()}/bilibili/${bvid}-p2`,
      signal: new AbortController().signal,
    });
    assert.equal(result.outcome, "content");
    if (result.outcome !== "content") return;
    assert.match(result.source.markdown!, /Selected part/);
    assert.match(result.source.markdown!, /full written description/);
    assert.equal(result.source.images.length, 1);
    assert.equal(result.references.length, 1);
    assert.equal(result.diagnostic?.stage, "readiness");
    assert.deepEqual(f.counts(), { transcriptions: 0, downloads: 0 });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("cancelling ASR retains committed source segments and removes downloaded media", async () => {
  const controller = new AbortController();
  const f = await fixture({ abortOnTranscribe: controller });
  try {
    const reader = new YoutubeTranscriptReader(
      f.runtimeRoot,
      f.evidenceRoot,
      f.run,
      f.fallback,
    );
    const attempt = randomUUID();
    await assert.rejects(
      reader.read(`https://youtu.be/${videoId}`, attempt, controller.signal),
      /Cancelled/,
    );
    const directory = join(f.evidenceRoot, attempt, "youtube", videoId);
    const saved = JSON.parse(
      await readFile(join(directory, "source.json"), "utf8"),
    );
    assert.equal(saved.evidence.segments[0].text, "视频中的原文。");
    const recovered = await reader.read(
      `https://youtu.be/${videoId}`,
      attempt,
      new AbortController().signal,
    );
    assert.equal(recovered.outcome, "content");
    if (recovered.outcome === "content") {
      assert.equal(
        recovered.source.evidence?.segments[0].text,
        "视频中的原文。",
      );
      assert.equal(recovered.source.evidence?.transcriptCoverage, "partial");
      assert.equal(recovered.diagnostic?.code, "capture_incomplete");
    }
    assert.deepEqual(f.counts(), { transcriptions: 1, downloads: 1 });
    await writeFile(
      join(directory, "reader-attempt.json"),
      JSON.stringify({ state: "running" }),
    );
    assert.equal(
      (
        await reader.read(
          `https://youtu.be/${videoId}`,
          attempt,
          new AbortController().signal,
        )
      ).outcome,
      "content",
    );
    const wrongIdentity = videoIdentity("https://youtu.be/zyxwvutsrqp")!;
    assert.equal(
      await readVideoCheckpoint(
        directory,
        wrongIdentity,
        `${attempt}/youtube/${videoId}`,
      ),
      undefined,
    );

    assert.equal(
      (await readdir(directory)).some((name) =>
        name.startsWith("speech-media."),
      ),
      false,
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("ASR checkpoints survive failed atomic replacement and ignore interrupted staging", async () => {
  const f = await fixture();
  try {
    const attempt = randomUUID(),
      artifactKey = `${attempt}/youtube/${videoId}`;
    const directory = join(f.evidenceRoot, artifactKey);
    await mkdir(directory, { recursive: true });
    const options = {
      video: videoIdentity(`https://youtu.be/${videoId}`)!,
      metadata: { title: "Source title", duration: 10 },
      directory,
      artifactKey,
      signal: new AbortController().signal,
    };
    await f.fallback.read(options);
    const previous = await readFile(join(directory, "source.json"), "utf8");
    await writeFile(join(directory, "source.json.tmp"), '{"truncated":');
    assert.ok(await readVideoCheckpoint(directory, options.video, artifactKey));
    await rm(join(directory, "source.json.tmp"));
    await mkdir(join(directory, "source.json.tmp"));
    await assert.rejects(f.fallback.read(options));
    assert.equal(
      await readFile(join(directory, "source.json"), "utf8"),
      previous,
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

for (const preview of [false, true])
  test(`shortened or preview media retains partial coverage (preview=${preview})`, async () => {
    const f = await fixture();
    try {
      const video = preview
        ? {
            ...videoIdentity(`https://www.bilibili.com/video/${bvid}?p=2`)!,
            cid: "789",
            bvid,
          }
        : videoIdentity(`https://youtu.be/${videoId}`)!;
      const artifactKey = `${randomUUID()}/${video.platform}/${video.id}${preview ? "-p2" : ""}`;
      const directory = join(f.evidenceRoot, artifactKey);
      await mkdir(directory, { recursive: true });
      const result = await f.fallback.read({
        video,
        metadata: { title: "Source title", duration: preview ? 10 : 100 },
        directory,
        artifactKey,
        signal: new AbortController().signal,
        ...(preview
          ? {
              session: {
                async getJson() {
                  return {
                    code: 0,
                    data: {
                      is_preview: 1,
                      dash: {
                        audio: [
                          { baseUrl: "https://audio.bilivideo.com/audio" },
                        ],
                      },
                    },
                  };
                },
              },
            }
          : {}),
      });
      assert.equal(result.outcome, "content");
      if (result.outcome !== "content") return;
      assert.equal(result.source.evidence?.transcriptCoverage, "partial");
      assert.equal(result.diagnostic?.code, "capture_incomplete");
      assert.equal(result.diagnostic?.stage, "media");
      assert.equal(
        result.diagnostic?.evidence?.failureCode,
        "media_incomplete",
      );
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  });
