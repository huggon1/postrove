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
import { readingDiagnostic } from "../../src/shared/reading-diagnostics";
const id = "abcdef1234567890abcdef12",
  url = `https://www.xiaohongshu.com/explore/${id}?xsec_token=fictional-access`;
const metadata = {
  id,
  title: "Fictional spoken note",
  description: "Written description\n\nhttps://example.org/creator-material",
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
    assert.match(result.source.markdown!, /Fixture/);
    assert.deepEqual(result.references, [
      {
        url: "https://example.org/creator-material",
        title: "https://example.org/creator-material",
      },
    ]);
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
test("XHS public evidence keeps bounded times while raw ASR retains recognizer estimates", async () => {
  const segments = speech.segments.map((segment) => ({
    ...segment,
    end: speech.duration!,
    recognizerEnd: speech.duration! + 0.5,
  }));
  const recognized = {
    ...speech,
    chunks: speech.chunks.map((chunk) => ({ ...chunk, segments })),
    segments,
  };
  const f = await fixture({
    speech: {
      transcribe: async (request) => {
        await request.onProgress?.({ ...recognized, status: "partial" });
        return recognized;
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
    assert.deepEqual(result.source.evidence?.segments, [
      {
        id: "segment-1",
        start: recognized.segments[0].start,
        end: recognized.segments[0].end,
        text: recognized.segments[0].text,
        url,
      },
    ]);
    assert.equal(result.source.evidence?.transcriptCoverage, "complete");
    const raw = JSON.parse(
      await readFile(join(f.directory, "transcription.json"), "utf8"),
    );
    assert.equal(raw.segments[0].recognizerEnd, 12.5);
    assert.deepEqual(raw, recognized);
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
    assert.equal(result.diagnostic?.stage, "access");
    assert.deepEqual(result.diagnostic?.actions, ["provide_access_link"]);
    assert.deepEqual(
      (await f.reader.read(url, f.attempt, new AbortController().signal))
        .diagnostic,
      result.diagnostic,
    );
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
      assert.equal(result.diagnostic?.code, accessIssue);
      assert.equal(result.diagnostic?.stage, "access");
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
    assert.equal(result.diagnostic?.stage, "readiness");
    assert.deepEqual(result.diagnostic?.actions, ["setup_component"]);
    assert.equal(result.diagnostic?.evidence?.failureCode, "model_missing");
    if (result.outcome === "content")
      assert.match(result.source.completenessNote, /model_missing/);
    assert.equal(f.downloads(), 0);
  } finally {
    await f.cleanup();
  }
});

test("XHS readiness-blocked attempts resume once the local model becomes ready", async () => {
  let ready = false;
  const f = await fixture({
    speech: {
      check: async () => ({
        backend: "whisper.cpp",
        runtime: "ready",
        model: ready ? "ready" : "missing",
        ...(ready ? {} : { issue: "model_missing" }),
      }),
      transcribe: async () => speech,
    },
  });
  try {
    const signal = new AbortController().signal;
    const first = await f.reader.read(url, f.attempt, signal);
    assert.equal(first.diagnostic?.stage, "readiness");
    assert.equal(f.reads(), 1);
    assert.deepEqual(await f.reader.read(url, f.attempt, signal), first);
    assert.equal(f.reads(), 1);
    ready = true;
    const resumed = await f.reader.read(url, f.attempt, signal);
    assert.equal(resumed.outcome, "content");
    if (resumed.outcome !== "content") return;
    assert.equal(resumed.diagnostic, undefined);
    assert.match(resumed.source.markdown!, /Written description/);
    assert.match(resumed.source.markdown!, /这是口述内容/);
    assert.equal(resumed.source.images.length, 1);
    assert.equal(resumed.source.evidence?.segments.length, 1);
    assert.equal(f.downloads(), 1);
    assert.equal(f.reads(), 2);
  } finally {
    await f.cleanup();
  }
});

test("XHS resource retry keeps metadata and earlier speech when later media access fails", async () => {
  let resumed = false;
  const priorSpeech: SpeechResult = {
    ...speech,
    status: "partial",
    issue: { code: "model_missing" },
  };
  const f = await fixture({
    context: async () => {
      if (resumed) throw new Error("download_failed");
      return {};
    },
    speech: {
      check: async () => ({
        backend: "whisper.cpp",
        runtime: "ready",
        model: "ready",
      }),
      transcribe: async () => priorSpeech,
    },
  });
  try {
    const first = await f.reader.read(
      url,
      f.attempt,
      new AbortController().signal,
    );
    assert.equal(first.outcome, "content");
    assert.equal(first.diagnostic?.stage, "readiness");
    const raw = await readFile(join(f.directory, "transcription.json"), "utf8");
    resumed = true;
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
    assert.equal(result.source.evidence?.transcriptCoverage, "partial");
    assert.equal(result.diagnostic?.evidence?.failureCode, "download_failed");
    assert.equal(
      await readFile(join(f.directory, "transcription.json"), "utf8"),
      raw,
    );
    assert.equal(result.references.length, 1);
  } finally {
    await f.cleanup();
  }
});

test("XHS committed page metadata survives a media adapter with missing metadata", async () => {
  const f = await fixture({
    context: async () => ({ fallback: metadata }),
    media: {
      available: async () => true,
      read: async () => ({
        note: { id, url, requestUrl: url },
        cookies: "guest",
        issue: "extraction_failed",
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
    assert.match(result.source.markdown!, /Written description/);
    assert.equal(result.source.images.length, 1);
    assert.equal(result.references.length, 1);
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
    assert.equal(result.diagnostic?.stage, "transcription");
    assert.equal(result.diagnostic?.evidence?.failureCode, "process_failed");
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
    assert.match(
      await readFile(join(exported, "source-metadata.json"), "utf8"),
      /Written description/,
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
      diagnostic: readingDiagnostic("unknown", "source", {
        failureCode: "xiaohongshu_identity_changed",
      }),
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

for (const stage of ["translation", "summary"] as const) {
  test(`XHS partial speech diagnosis survives a later ${stage} failure`, async () => {
    const f = await fixture({
      speech: {
        transcribe: async () => ({
          ...speech,
          status: "partial",
          issue: { code: "process_failed" },
        }),
      },
    });
    try {
      const captured = await f.reader.read(
        url,
        f.attempt,
        new AbortController().signal,
      );
      assert.equal(captured.outcome, "content");
      if (captured.outcome !== "content") return;
      const { runReadingJob } =
        await import("../../src/worker/jobs/forwarding/reading");
      const { ExecutionFailure } =
        await import("../../src/shared/task-failure");
      const events: any[] = [];
      await runReadingJob(
        {
          taskId: randomUUID(),
          resultId: randomUUID(),
          sourceUrl: url,
          outputLanguage: "en",
          config: {
            method: "generic_api",
            modelId: "fixture",
            api: "openai-completions",
            baseUrl: "http://127.0.0.1:9/v1",
            credential: "fictional",
          },
          resume: {
            materials: [
              {
                id: "main",
                role: "main",
                url,
                title: "Fixture",
                state: "partial",
                source: captured.source,
                diagnostic: captured.diagnostic,
                issue: "Saved speech process observation",
                summary: "",
                chunks: [
                  {
                    index: 0,
                    original: "First",
                    translated: "Saved first",
                    complete: true,
                  },
                  {
                    index: 1,
                    original: "Second",
                    translated: "",
                    complete: false,
                  },
                ],
              },
            ],
          },
        },
        (event) => events.push(event),
        new AbortController().signal,
        {
          translate: async () => {
            if (stage === "translation")
              throw new ExecutionFailure("model_network");
            return { text: "Translated second", truncated: false };
          },
          summarize: async () => {
            throw new ExecutionFailure("model_network");
          },
        },
      );
      const result = events.findLast((event) => event.type === "result");
      assert.equal(result.failure.readingDiagnostic.stage, stage);
      assert.ok(
        result.failure.readingDiagnostic.actions.includes("resume_processing"),
      );
      assert.deepEqual(
        result.draft.materials[0].diagnostic,
        captured.diagnostic,
      );
      assert.equal(
        result.draft.materials[0].chunks[0].translated,
        "Saved first",
      );
      assert.match(result.draft.materials[0].source.markdown, /这是口述内容/);
    } finally {
      await f.cleanup();
    }
  });
}

test("XHS media transfer failure preserves the media stage independently of login", async () => {
  const f = await fixture({
    acquire: async () => {
      throw new Error("download_failed");
    },
  });
  try {
    const result = await f.reader.read(
      url,
      f.attempt,
      new AbortController().signal,
    );
    assert.equal(result.outcome, "content");
    assert.equal(result.diagnostic?.stage, "media");
    assert.equal(result.diagnostic?.code, "unknown");
    assert.equal(result.diagnostic?.evidence?.failureCode, "download_failed");
  } finally {
    await f.cleanup();
  }
});
