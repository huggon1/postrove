import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  advisors,
  advisorById,
  advisorRouteFor,
  allowsGuest,
} from "../../src/shared/advisor-contracts";
import {
  canonicalPost,
  searchSectionSchema,
} from "../../src/shared/focus-search-contracts";
import {
  sourceEnhancement,
  sourcePlatform,
  youtubeVideo,
} from "../../src/shared/source-profiles";
import {
  searchInstruction,
  platformSearchInstruction,
} from "../../src/platforms/browser/prompts";
import {
  normalizeTranscript,
  selectTranscriptTrack,
  YoutubeTranscriptReader,
  youtubeRuntimeVersion,
} from "../../src/main/services/youtube-transcript";
import { ResultPublisher } from "../../src/main/services/result-publisher";

const videoId = "abcdefghijk";
const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
const captions = JSON.stringify({
  events: [
    {
      tStartMs: 0,
      dDurationMs: 3000,
      segs: [{ utf8: "Hello wonderful world" }],
    },
    {
      tStartMs: 2000,
      dDurationMs: 3000,
      segs: [{ utf8: "wonderful world and friends" }],
    },
    { tStartMs: 6000, dDurationMs: 1000, segs: [{ utf8: "and friends" }] },
  ],
});

test("source identities retain video locators and distinguish Reddit posts and comments", () => {
  for (const url of [
    `https://youtu.be/${videoId}?t=1m2s`,
    `https://www.youtube.com/watch?v=${videoId}&t=62`,
    `https://www.youtube.com/shorts/${videoId}#t=62s`,
  ]) {
    assert.deepEqual(canonicalPost("youtube", url), {
      key: `youtube:video:${videoId}`,
      url: `${videoUrl}&t=62s`,
    });
    assert.equal(sourcePlatform(url), "youtube");
  }
  assert.equal(
    youtubeVideo(`https://www.youtube.com/playlist?list=${videoId}`),
    undefined,
  );
  assert.equal(
    youtubeVideo(`https://www.youtube.com@evil.test/watch?v=${videoId}`),
    undefined,
  );
  assert.equal(
    canonicalPost(
      "reddit",
      "https://www.reddit.com/r/test/comments/abc123/a_title/",
    )?.key,
    "reddit:post:abc123",
  );
  for (const url of [
    "https://www.reddit.com/r/test/comments/abc123/a_title/def456/",
    "https://www.reddit.com/r/test/comments/abc123/comment/def456/",
  ])
    assert.deepEqual(canonicalPost("reddit", url), {
      key: "reddit:comment:def456",
      url: "https://www.reddit.com/r/test/comments/abc123/_/def456/",
    });
  assert.equal(
    canonicalPost("reddit", "https://www.reddit.com/r/test/"),
    undefined,
  );
  assert.equal(
    canonicalPost("x", "https://x.com/reader/status/123")?.key,
    "x:123",
  );
});

test("each expert binds its route while Gemini languages share their account and Skill", () => {
  const zh = advisorById("youtube-gemini-zh"),
    en = advisorById("youtube-gemini-en");
  assert.equal(zh.connectionId, en.connectionId);
  assert.equal(advisorRouteFor(zh).id, "youtube-gemini");
  assert.equal(zh.skill, en.skill);
  assert.equal(allowsGuest("reddit-web"), true);
  for (const advisor of advisors) {
    assert.equal(
      searchInstruction(advisor.platform, "question", "all", advisor.language),
      `question\n\n${sourceEnhancement(advisor.platform, advisor.language)}`,
    );
    assert.match(
      platformSearchInstruction(
        advisor.platform,
        "question",
        undefined,
        advisorRouteFor(advisor).id,
      ),
      new RegExp(advisor.skill),
    );
  }
  assert.throws(
    () => platformSearchInstruction("youtube", "question", undefined, "x-grok"),
    /mismatch/,
  );
  const section = {
    sectionId: randomUUID(),
    advisorId: en.id,
    connectionId: en.connectionId,
    routeId: "youtube-gemini",
    sourceProfileRevision: 1,
    platform: "youtube",
    promptLanguage: "en",
    prompt: "question",
    state: "pending",
    rawReply: "",
    candidates: [],
  };
  assert.ok(searchSectionSchema.safeParse(section).success);
  assert.ok(
    !searchSectionSchema.safeParse({ ...section, connectionId: "x-grok" })
      .success,
  );
});

test("original caption selection excludes translated tracks and normalizes only rolling overlaps", () => {
  const format = [
    { ext: "json3", url: "https://www.youtube.com/api/timedtext?lang=en" },
  ];
  assert.deepEqual(
    selectTranscriptTrack({
      language: "en",
      subtitles: { fr: format },
      automatic_captions: {
        "en-orig": format,
        zh: [
          {
            ext: "json3",
            url: "https://www.youtube.com/api/timedtext?tlang=zh",
          },
        ],
      },
    }),
    { language: "en-orig", kind: "automatic" },
  );
  assert.equal(
    selectTranscriptTrack({
      automatic_captions: { en: [{ ext: "json3", url: "invalid" }] },
    }),
    undefined,
  );
  const segments = normalizeTranscript(captions, videoId, 10);
  assert.deepEqual(
    segments.map((segment) => segment.text),
    ["Hello wonderful world", "and friends", "and friends"],
  );
  assert.equal(segments[1].url, `${videoUrl}&t=2s`);
  assert.throws(
    () => normalizeTranscript(captions, videoId, 1),
    /invalid_caption_time/,
  );
});

async function readerFixture(failure = false) {
  const root = await mkdtemp(join(tmpdir(), "postrove-transcript-"));
  const runtime = join(root, "runtime", "youtube");
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
  const calls: string[][] = [];
  const reader = new YoutubeTranscriptReader(
    join(root, "runtime"),
    join(root, "evidence"),
    async (_executable, args, directory, signal) => {
      calls.push(args);
      if (signal.aborted) throw new Error("Cancelled");
      if (failure) throw new Error("transcript_extraction_failed");
      if (args.includes("--dump-single-json"))
        return JSON.stringify({
          id: videoId,
          title: "Original video",
          language: "en",
          duration: 10,
          description: "[Material](https://example.test/article)",
          subtitles: {
            en: [
              {
                ext: "json3",
                url: "https://www.youtube.com/api/timedtext?lang=en",
              },
            ],
          },
        });
      await writeFile(join(directory, "captions.en.json3"), captions);
      return "";
    },
  );
  return { root, reader, calls };
}

test("transcript tool saves raw evidence once per attempt and publishes a fixed result package", async () => {
  const f = await readerFixture();
  try {
    const attemptId = randomUUID();
    const result = await f.reader.read(
      videoUrl,
      attemptId,
      new AbortController().signal,
    );
    assert.equal(result.outcome, "content");
    if (result.outcome !== "content") return;
    assert.equal(result.source.evidence?.segments.length, 3);
    assert.deepEqual(result.references, [
      {
        url: "https://example.test/article",
        title: "https://example.test/article",
      },
    ]);
    assert.equal(
      await readFile(
        join(
          f.reader.evidenceRoot,
          attemptId,
          "youtube",
          videoId,
          "captions.json3",
        ),
        "utf8",
      ),
      captions,
    );
    await f.reader.read(
      `https://youtu.be/${videoId}?t=5`,
      attemptId,
      new AbortController().signal,
    );
    assert.equal(f.calls.length, 2);
    for (const args of f.calls) {
      assert.ok(
        args.includes("--ignore-config") &&
          args.includes("--skip-download") &&
          args.includes("--no-playlist"),
      );
      assert.ok(!args.includes("--cookies-from-browser"));
      assert.equal(args.at(-1), videoUrl);
    }
    const material = {
      id: "main",
      role: "main",
      url: videoUrl,
      title: "Original video",
      source: result.source,
      chunks: [],
      summary: "",
      state: "partial",
    };
    const detail = {
      task: {
        taskId: randomUUID(),
        resultId: randomUUID(),
        attemptId,
        createdAt: "2026-10-20T00:00:00.000Z",
        attemptStartedAt: "2026-10-20T00:00:00.000Z",
        finishedAt: "2026-10-20T00:01:00.000Z",
        target: { sourceUrl: videoUrl },
        state: "completed",
      },
      partial: { materials: [material] },
    } as any;
    const publisher = new ResultPublisher(
      join(f.root, "results"),
      undefined,
      f.reader.evidenceRoot,
    );
    await publisher.publishReading(detail);
    const resultRoot = join(f.root, "results", "reading", attemptId);
    const manifest = JSON.parse(
      await readFile(join(resultRoot, "manifest.json"), "utf8"),
    );
    assert.equal(
      manifest.evidenceFiles.find((file: any) =>
        file.path.endsWith("/captions.json3"),
      ).sha256,
      createHash("sha256").update(captions).digest("hex"),
    );
    assert.match(
      await readFile(join(resultRoot, "result.md"), "utf8"),
      /Original video/,
    );
    assert.equal(
      await readFile(
        join(resultRoot, "evidence", "youtube", videoId, "captions.json3"),
        "utf8",
      ),
      captions,
    );
    await publisher.publishReading({
      ...detail,
      task: { ...detail.task, state: "failed" },
    });
    assert.equal(
      JSON.parse(await readFile(join(resultRoot, "manifest.json"), "utf8"))
        .status,
      "completed",
    );
    await f.reader.read(videoUrl, randomUUID(), new AbortController().signal);
    assert.equal(f.calls.length, 4);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test("saved reader failures support browser fallback and cancellation preserves its attempt state", async () => {
  const f = await readerFixture(true);
  try {
    const id = randomUUID(),
      signal = new AbortController().signal;
    assert.deepEqual(await f.reader.read(videoUrl, id, signal), {
      outcome: "unavailable",
      reason: "transcript_extraction_failed",
    });
    assert.equal(
      (await f.reader.read(videoUrl, id, signal)).outcome,
      "unavailable",
    );
    assert.equal(f.calls.length, 1);
    const cancelled = new AbortController();
    cancelled.abort();
    const stoppedId = randomUUID();
    await assert.rejects(
      f.reader.read(videoUrl, stoppedId, cancelled.signal),
      /Cancelled/,
    );
    assert.equal(
      JSON.parse(
        await readFile(
          join(
            f.reader.evidenceRoot,
            stoppedId,
            "youtube",
            videoId,
            "reader-attempt.json",
          ),
          "utf8",
        ),
      ).reason,
      "cancelled",
    );
    await assert.rejects(
      f.reader.read(videoUrl, "../escape", signal),
      /identity/,
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
