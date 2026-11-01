import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  XiaohongshuVideoReader,
  type XhsVideoDependencies,
} from "../../src/main/services/xiaohongshu-video";
import type { SpeechResult } from "../../src/shared/speech-contracts";
import { sourceSchema } from "../../src/shared/source-contracts";
const id = "abcdef1234567890abcdef12",
  url = `https://www.xiaohongshu.com/explore/${id}?xsec_token=fictional-access`;
const metadata = {
  id,
  title: "Fictional spoken note",
  description: "Written description",
  uploader: "Fixture",
  duration: 12,
  images: [{ url: "https://example.test/cover.jpg", alt: "Video cover" }],
};
const speech: SpeechResult = {
  status: "completed",
  provenance: "application_asr",
  backend: "whisper.cpp",
  runtimeVersion: "fixture",
  model: "fixture",
  modelSha256: "a".repeat(64),
  language: "auto",
  duration: 12,
  totalChunks: 1,
  chunks: [
    {
      index: 0,
      start: 0,
      end: 12,
      state: "speech",
      detectedLanguage: "zh",
      segments: [
        { id: "speech-0-0", start: 1, end: 3, text: "  这是口述内容。" },
      ],
    },
  ],
  segments: [{ id: "speech-0-0", start: 1, end: 3, text: "  这是口述内容。" }],
};
async function fixture(overrides: Partial<XhsVideoDependencies> = {}) {
  const root = await mkdtemp(join(tmpdir(), "postrove-xhs-video-")),
    attempt = randomUUID();
  let reads = 0,
    downloads = 0;
  const reader = new XiaohongshuVideoReader(root, {
    media: {
      available: async () => true,
      read: async () => {
        reads++;
        return {
          note: { id, url, requestUrl: url },
          metadata,
          cookies: "guest",
          media: {
            url: "https://sns-video-bd.xhscdn.com/fixture.mp4",
            allowedHosts: ["sns-video-bd.xhscdn.com"],
            headers: {},
          },
        };
      },
    },
    acquire: async () => {
      downloads++;
      return { path: join(root, "fixture.mp4") };
    },
    speech: { transcribe: async () => speech },
    ...overrides,
  });
  return {
    reader,
    root,
    attempt,
    directory: join(root, attempt, "xiaohongshu", id),
    reads: () => reads,
    downloads: () => downloads,
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}
test("XHS video composes written text, cover and ASR with separate provenance", async () => {
  const f = await fixture();
  try {
    const result = await f.reader.read(
      url,
      f.attempt,
      new AbortController().signal,
    );
    assert.equal(result.outcome, "content");
    if (result.outcome !== "content") return;
    assert.match(result.source.markdown!, /Written description/);
    assert.match(result.source.markdown!, /这是口述内容/);
    assert.equal(result.source.images.length, 1);
    assert.equal(result.source.sourceUrl, url);
    const evidence = result.source.evidence!;
    assert.ok("provenance" in evidence);
    if (!("provenance" in evidence)) return;
    assert.equal(evidence.provenance.source, "application_asr");
    assert.equal(evidence.language, "zh");
    assert.equal(evidence.visualCoverage, "unknown");
    assert.equal(evidence.segments[0].text, speech.segments[0].text);
    assert.equal(evidence.segments[0].url, url);
    assert.equal(evidence.segments[0].start, 1);
    assert.equal(evidence.transcriptCoverage, "complete");
    assert.equal(result.source.completeness, "partial");
    const shortSource = {
      ...result.source,
      sourceUrl: "https://xhslink.com/o/fictional",
      resolvedSourceUrl: url,
    };
    assert.equal(sourceSchema.safeParse(shortSource).success, true);
    assert.equal(
      sourceSchema.safeParse({
        ...shortSource,
        sourceUrl: "https://evil.test/fictional",
      }).success,
      false,
    );
    assert.equal(
      sourceSchema.safeParse({
        ...shortSource,
        resolvedSourceUrl: url.replace(id, "b".repeat(24)),
      }).success,
      false,
    );
    const again = await f.reader.read(
      url,
      f.attempt,
      new AbortController().signal,
    );
    assert.deepEqual(again, result);
    assert.equal(f.reads(), 1);
    assert.equal(f.downloads(), 1);
    assert.deepEqual(
      JSON.parse(
        await readFile(join(f.directory, "transcription.json"), "utf8"),
      ),
      speech,
    );
  } finally {
    await f.cleanup();
  }
});
test("XHS silent or music fixture records zero recognized speech segments and retains page content", async () => {
  const f = await fixture({
    speech: {
      transcribe: async () => ({
        ...speech,
        segments: [],
        chunks: [
          { index: 0, start: 0, end: 12, state: "no_speech", segments: [] },
        ],
      }),
    },
  });
  try {
    const result = await f.reader.read(
      url,
      f.attempt,
      new AbortController().signal,
    );
    assert.equal(result.outcome, "content");
    if (result.outcome !== "content") return;
    assert.equal(result.source.evidence, undefined);
    assert.match(result.source.completenessNote, /zero_segments/);
    assert.match(result.source.markdown!, /Written description/);
    assert.equal(result.source.images.length, 1);
    const state = JSON.parse(
      await readFile(join(f.directory, "reader-attempt.json"), "utf8"),
    );
    assert.equal(state.speechStatus, "completed");
    assert.equal(state.visualCoverage, "unknown");
  } finally {
    await f.cleanup();
  }
});
test("XHS media rejection retains same-note metadata and the original source stage", async () => {
  const f = await fixture({
    media: {
      available: async () => true,
      read: async () => ({
        note: { id, url, requestUrl: url },
        metadata,
        cookies: "absent",
        issue: "access_parameters_invalid",
      }),
    },
  });
  try {
    const result = await f.reader.read(
      url,
      f.attempt,
      new AbortController().signal,
    );
    assert.equal(result.outcome, "content");
    if (result.outcome !== "content") return;
    assert.match(result.source.completenessNote, /access_parameters_invalid/);
    assert.equal(f.downloads(), 0);
    assert.match(result.source.markdown!, /Written description/);
  } finally {
    await f.cleanup();
  }
});
test("XHS observed login and verification challenges retain their specific causes", async () => {
  for (const accessIssue of [
    "login_required",
    "verification_required",
  ] as const) {
    const f = await fixture({
      context: async () => ({ fallback: metadata, accessIssue }),
    });
    try {
      const result = await f.reader.read(
        url,
        f.attempt,
        new AbortController().signal,
      );
      assert.equal(result.outcome, "content");
      if (result.outcome === "content")
        assert.match(result.source.completenessNote, new RegExp(accessIssue));
      assert.equal(f.reads(), 0);
      assert.equal(f.downloads(), 0);
    } finally {
      await f.cleanup();
    }
  }
});
test("XHS missing ASR model is separate from website access and skips the media download", async () => {
  const f = await fixture({
    speech: {
      check: async () => ({
        backend: "whisper.cpp",
        runtime: "ready",
        model: "missing",
        issue: "model_missing",
      }),
      transcribe: async () => {
        throw new Error("should_not_run");
      },
    },
  });
  try {
    const result = await f.reader.read(
      url,
      f.attempt,
      new AbortController().signal,
    );
    assert.equal(result.outcome, "content");
    if (result.outcome === "content")
      assert.match(result.source.completenessNote, /model_missing/);
    assert.equal(f.downloads(), 0);
  } finally {
    await f.cleanup();
  }
});
test("XHS completed chunks survive a later speech failure", async () => {
  const partial = {
    ...speech,
    status: "partial" as const,
    issue: { code: "process_failed" as const },
  };
  const f = await fixture({
    speech: {
      transcribe: async (request) => {
        await request.onProgress?.(partial);
        return partial;
      },
    },
  });
  try {
    const result = await f.reader.read(
      url,
      f.attempt,
      new AbortController().signal,
    );
    assert.equal(result.outcome, "content");
    if (result.outcome !== "content") return;
    assert.equal(result.source.evidence?.transcriptCoverage, "partial");
    assert.match(result.source.markdown!, /这是口述内容/);
    assert.match(result.source.completenessNote, /process_failed/);
  } finally {
    await f.cleanup();
  }
});
test("XHS cancellation preserves the original metadata and completed speech checkpoint", async () => {
  const controller = new AbortController();
  const f = await fixture({
    speech: {
      transcribe: async (request) => {
        await request.onProgress?.({ ...speech, status: "partial" });
        controller.abort();
        throw new Error("Cancelled");
      },
    },
  });
  try {
    await assert.rejects(
      f.reader.read(url, f.attempt, controller.signal),
      /Cancelled/,
    );
    const saved = JSON.parse(
      await readFile(join(f.directory, "source.json"), "utf8"),
    );
    assert.match(saved.markdown, /Written description/);
    assert.match(saved.markdown, /这是口述内容/);
    assert.equal(saved.evidence.transcriptCoverage, "partial");
    const { ResultPublisher } =
      await import("../../src/main/services/result-publisher");
    await new ResultPublisher(
      join(f.root, "results"),
      undefined,
      f.root,
    ).publishReading({
      task: {
        taskId: randomUUID(),
        resultId: randomUUID(),
        attemptId: f.attempt,
        createdAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        target: { sourceUrl: url },
        state: "stopped",
      },
      partial: { materials: [] },
    } as any);
    const exported = join(
      f.root,
      "results",
      "reading",
      f.attempt,
      "evidence",
      "xiaohongshu",
      id,
    );
    assert.match(
      await readFile(join(exported, "source.json"), "utf8"),
      /这是口述内容/,
    );
    assert.equal(
      JSON.parse(await readFile(join(exported, "reader-attempt.json"), "utf8"))
        .state,
      "cancelled",
    );
    const recovered = await f.reader.read(
      url,
      f.attempt,
      new AbortController().signal,
    );
    assert.equal(recovered.outcome, "content");
    assert.equal(f.reads(), 1);
  } finally {
    await f.cleanup();
  }
});
test("XHS unrelated metadata, unknown failures and invalid attempt identities remain bounded", async () => {
  const f = await fixture({
    context: async () => ({ fallback: { ...metadata, id: "b".repeat(24) } }),
  });
  try {
    const result = await f.reader.read(
      url,
      f.attempt,
      new AbortController().signal,
    );
    assert.deepEqual(result, {
      outcome: "unavailable",
      reason: "xiaohongshu_identity_changed",
    });
    assert.equal(f.reads(), 0);
    await assert.rejects(
      f.reader.read(url, "../escape", new AbortController().signal),
      /identity/,
    );
  } finally {
    await f.cleanup();
  }
});
