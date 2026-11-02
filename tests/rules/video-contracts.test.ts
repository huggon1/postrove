import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  videoIdentity,
  videoIdentitySchema,
  videoArtifactKey,
  parseVideoArtifactKey,
  videoTimestampUrl,
} from "../../src/shared/video-contracts";
import { transcriptEvidenceSchema } from "../../src/shared/transcript-contracts";
import { sourceSchema } from "../../src/shared/source-contracts";
import { VideoTranscriptReaders } from "../../src/main/services/video-transcript";

const url = "https://www.bilibili.com/video/BV1234567890?p=2&t=12";
test("video identity keeps Bilibili parts distinct and timestamps local to that part", () => {
  const video = videoIdentity(url)!;
  assert.equal(video.sourceKey, "bilibili:video:BV1234567890:p:2");
  assert.equal(videoTimestampUrl(video, 12.5), url);
  assert.notEqual(
    videoIdentity(url.replace("p=2", "p=1"))?.sourceKey,
    video.sourceKey,
  );
  assert.equal(
    videoIdentity("https://www.bilibili.com/video/av123?p=3")?.id,
    "av123",
  );
  assert.equal(
    videoIdentity("https://www.bilibili.com/video/AV123?p=3")?.id,
    "av123",
  );
  for (const bad of [
    url.replace("www.bilibili.com", "www.bilibili.com.evil.test"),
    url.replace("https://", "https://user@"),
    url.replace("p=2", "p=0"),
    url.replace(".com/", ".com:9000/"),
  ])
    assert.equal(videoIdentity(bad), undefined);
  assert.equal(
    videoIdentitySchema.safeParse({ ...video, part: 3 }).success,
    false,
  );
  assert.equal(
    parseVideoArtifactKey(`${randomUUID()}/bilibili/../../other`),
    undefined,
  );
});

test("generic evidence separates native caption and application ASR provenance and validates identity", () => {
  const video = { ...videoIdentity(url)!, cid: "123456" };
  const evidence = {
    kind: "transcript",
    captureId: randomUUID(),
    videoId: video.id,
    video,
    language: "zh-CN",
    trackKind: "unknown",
    provenance: { source: "platform_captions", kind: "unknown" },
    artifactKey: videoArtifactKey(randomUUID(), video),
    transcriptCoverage: "unknown",
    visualCoverage: "unknown",
    segments: [{ id: "segment-1", start: 12, end: 14, text: "Caption", url }],
  };
  assert.equal(transcriptEvidenceSchema.safeParse(evidence).success, true);
  assert.equal(
    transcriptEvidenceSchema.safeParse({
      ...evidence,
      segments: [{ ...evidence.segments[0], url: url.replace("p=2", "p=1") }],
    }).success,
    false,
  );
  assert.equal(
    transcriptEvidenceSchema.safeParse({
      ...evidence,
      artifactKey: `${randomUUID()}/bilibili/other-video`,
    }).success,
    false,
  );
  assert.equal(
    videoIdentitySchema.safeParse({
      ...video,
      url: `${video.url}&access=private`,
    }).success,
    false,
  );
  const asr = {
    ...evidence,
    trackKind: "automatic",
    provenance: {
      source: "application_asr",
      kind: "automatic",
      engine: "local",
      model: "test-model",
    },
  };
  assert.equal(transcriptEvidenceSchema.safeParse(asr).success, true);
  assert.equal(
    transcriptEvidenceSchema.safeParse({ ...asr, trackKind: "creator" })
      .success,
    false,
  );
  const source = {
    platform: "bilibili",
    sourceUrl: url,
    sourceIdentity: "Fixture",
    sourceKey: video.sourceKey,
    fetchedAt: new Date().toISOString(),
    contentBlocks: [{ type: "text", text: "Caption" }],
    images: [],
    completeness: "partial",
    completenessNote: "Fixture",
    evidence,
  };
  assert.equal(sourceSchema.safeParse(source).success, true);
  assert.equal(
    sourceSchema.safeParse({ ...source, sourceUrl: url.replace("p=2", "p=1") })
      .success,
    false,
  );
});

test("saved YouTube evidence retains its original shape and reader dispatch preserves cancellation", async () => {
  const legacy = {
    kind: "transcript",
    captureId: randomUUID(),
    videoId: "abcdefghijk",
    language: "en",
    trackKind: "creator",
    artifactKey: `${randomUUID()}/youtube/abcdefghijk`,
    transcriptCoverage: "unknown",
    visualCoverage: "unknown",
    segments: [
      {
        id: "segment-1",
        start: 0,
        end: 1,
        text: "Original",
        url: "https://www.youtube.com/watch?v=abcdefghijk&t=0s",
      },
    ],
  };
  assert.deepEqual(transcriptEvidenceSchema.parse(legacy), legacy);
  const registry = new VideoTranscriptReaders({
    youtube: {
      available: async () => true,
      read: async () => ({ outcome: "unavailable", reason: "fixture" }),
    },
  });
  assert.deepEqual(await registry.platforms(), ["youtube"]);
  assert.deepEqual(
    await registry.read(
      "https://youtu.be/abcdefghijk",
      randomUUID(),
      new AbortController().signal,
    ),
    { outcome: "unavailable", reason: "fixture" },
  );
  const stop = new AbortController();
  stop.abort();
  await assert.rejects(
    registry.read(url, randomUUID(), stop.signal),
    /Cancelled/,
  );
});

test("publication retains unavailable generic reader evidence and excludes connection files", async () => {
  const { mkdtemp, mkdir, writeFile, readFile, rm, access } =
    await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { ResultPublisher } =
    await import("../../src/main/services/result-publisher");
  const root = await mkdtemp(join(tmpdir(), "postrove-video-package-"));
  try {
    const attemptId = randomUUID();
    const raw = join(root, "capture", attemptId, "bilibili", "BV1234567890-p2");
    await mkdir(raw, { recursive: true });
    await writeFile(
      join(raw, "reader-attempt.json"),
      JSON.stringify({ state: "unavailable", reason: "need_login_subtitle" }),
    );
    await writeFile(join(raw, "cookies.txt"), "private fixture");
    const publisher = new ResultPublisher(
      join(root, "results"),
      undefined,
      join(root, "capture"),
    );
    await publisher.publishReading({
      task: {
        taskId: randomUUID(),
        resultId: randomUUID(),
        attemptId,
        createdAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        target: { sourceUrl: url },
        state: "failed",
      },
      partial: { materials: [] },
    } as any);
    const packaged = join(root, "results", "reading", attemptId);
    const manifest = JSON.parse(
      await readFile(join(packaged, "manifest.json"), "utf8"),
    );
    assert.equal(manifest.readerAttempts[0].platform, "bilibili");
    assert.match(
      await readFile(
        join(packaged, "evidence/bilibili/BV1234567890-p2/reader-attempt.json"),
        "utf8",
      ),
      /need_login_subtitle/,
    );
    await assert.rejects(
      access(join(packaged, "evidence/bilibili/BV1234567890-p2/cookies.txt")),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
