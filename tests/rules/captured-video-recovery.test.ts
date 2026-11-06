import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  recoverCapturedVideo,
  type SourceReaderCapture,
} from "../../src/main/services/captured-video-recovery";
import type { BrowserCapture } from "../../src/main/services/browser-agent";
import { sourceSchema } from "../../src/shared/source-contracts";
import { readingDiagnostic } from "../../src/shared/reading-diagnostics";
import { PlatformAccess } from "../../src/main/services/platform-access";
import type { BrowserAgent } from "../../src/main/services/browser-agent";

function fixture(metadataOnly = false) {
  const url = "https://www.bilibili.com/video/BV1234567890?p=2";
  const attemptId = randomUUID(),
    id = randomUUID();
  const source = sourceSchema.parse({
    sourceUrl: url,
    platform: "bilibili",
    title: "Observed title",
    sourceIdentity: "Observed creator",
    sourceKey: "bilibili:video:BV1234567890:p:2",
    fetchedAt: new Date().toISOString(),
    markdown:
      "Observed description.\n\n[00:01](https://www.bilibili.com/video/BV1234567890?p=2&t=1) Complete speech.",
    contentBlocks: [{ type: "text", text: "Complete speech." }],
    images: [],
    completeness: "partial",
    completenessNote: "Available speech; visual coverage unknown.",
    ...(metadataOnly
      ? {}
      : {
          evidence: {
            kind: "transcript",
            captureId: id,
            videoId: "BV1234567890",
            video: {
              platform: "bilibili",
              id: "BV1234567890",
              part: 2,
              aid: "123",
              bvid: "BV1234567890",
              sourceKey: "bilibili:video:BV1234567890:p:2",
              url,
            },
            provenance: {
              source: "application_asr",
              kind: "automatic",
              engine: "whisper.cpp",
            },
            language: "zh",
            trackKind: "automatic",
            transcriptCoverage: "complete",
            visualCoverage: "unknown",
            artifactKey: `${attemptId}/bilibili/BV1234567890-p2`,
            segments: [
              {
                id: "segment-1",
                start: 1,
                end: 3,
                text: "Complete speech.",
                url: `${url}&t=1`,
              },
            ],
          },
        }),
  });
  const capture: BrowserCapture = {
    text: source.markdown!,
    markdown: source.markdown!,
    pageUrl: url,
    url,
    sourceReader: true,
    images: [],
    links: [
      { url: "https://example.org/source", title: "Observed reference" },
      { url: `${url}&t=1`, title: "Transcript time" },
    ],
    evidence: source.evidence,
    readerCoverage: {
      completeness: source.completeness,
      note: source.completenessNote,
    },
  };
  const readers = new Map<string, SourceReaderCapture>([
    [id, { requestedUrl: url, attemptId, source }],
  ]);
  const captures = new Map([[id, capture]]);
  const collection = { url, browserUrl: url, includeReferences: true };
  const navigations = new Map([[url, url]]);
  return {
    collection,
    attemptId,
    readers,
    captures,
    navigations,
    id,
    source,
    capture,
  };
}

test("recovery retains exact reader identity, coverage and observed references", () => {
  const f = fixture();
  const output = recoverCapturedVideo(
    f.collection,
    f.attemptId,
    f.readers,
    f.captures,
    f.navigations,
  )!;
  assert.equal(output.materials[0].title, "Observed title");
  assert.equal(output.materials[0].sourceIdentity, "Observed creator");
  assert.deepEqual(output.materials[0].sourceCaptureIds, [f.id]);
  assert.equal(output.materials[0].completeness, "partial");
  assert.equal(output.materials.length, 2);
  assert.equal(output.materials[1].citedFromCaptureId, f.id);
  assert.equal(output.materials[1].url, "https://example.org/source");
  assert.equal(
    recoverCapturedVideo(
      { ...f.collection, includeReferences: false },
      f.attemptId,
      f.readers,
      f.captures,
      f.navigations,
    )!.materials.length,
    1,
  );
});

test("recovery requires current-task Main-owned source bytes and matching main, part and navigation", () => {
  const f = fixture();
  const recover = (
    url = f.collection.url,
    navigations = f.navigations,
    attempt = f.attemptId,
  ) =>
    recoverCapturedVideo(
      { ...f.collection, url, browserUrl: url },
      attempt,
      f.readers,
      f.captures,
      navigations,
    );
  assert.equal(recover(f.collection.url.replace("p=2", "p=1")), undefined);
  assert.equal(
    recover(
      f.collection.url,
      new Map([
        [
          f.collection.url,
          f.collection.url.replace("BV1234567890", "BV0987654321"),
        ],
      ]),
    ),
    undefined,
  );
  assert.equal(recover(undefined, undefined, randomUUID()), undefined);
  assert.equal(
    recoverCapturedVideo(
      undefined,
      f.attemptId,
      f.readers,
      f.captures,
      f.navigations,
    ),
    undefined,
  );
  f.capture.sourceReader = undefined;
  assert.equal(recover(), undefined);
  f.capture.sourceReader = true;
  f.capture.markdown = "Different unverified text";
  assert.equal(recover(), undefined);
});

test("verified Bilibili aliases retain part identity", () => {
  const f = fixture();
  const alias = "https://www.bilibili.com/video/av123?p=2";
  assert.ok(
    recoverCapturedVideo(
      { ...f.collection, url: alias, browserUrl: alias },
      f.attemptId,
      f.readers,
      f.captures,
      new Map([[alias, f.collection.url]]),
    ),
  );
  assert.equal(
    recoverCapturedVideo(
      { ...f.collection, url: alias.replace("123", "456"), browserUrl: alias },
      f.attemptId,
      f.readers,
      f.captures,
      new Map([[alias, f.collection.url]]),
    ),
    undefined,
  );
});

for (const metadataOnly of [false, true])
  test(`reader outcome owns the recovered diagnostic (${metadataOnly ? "metadata checkpoint" : "complete speech"})`, async () => {
    const f = fixture(metadataOnly);
    const speech = readingDiagnostic("model_not_ready", "readiness");
    if (metadataOnly) f.capture.readerDiagnostic = speech;
    const output = recoverCapturedVideo(
      { ...f.collection, includeReferences: false },
      f.attemptId,
      f.readers,
      f.captures,
      f.navigations,
    )!;
    const agent = {
      run: async () => ({
        output,
        captureData: f.captures,
        navigations: f.navigations,
        sourceDiagnostics: new Map([
          [f.collection.url, readingDiagnostic("login_required", "access")],
        ]),
      }),
    } as unknown as BrowserAgent;
    const material = (
      await new PlatformAccess(agent).collect(
        randomUUID(),
        f.collection.url,
        {
          method: "generic_api",
          modelId: "fixture",
          api: "openai-completions",
          baseUrl: "http://127.0.0.1:9/v1",
          credential: "fictional",
        },
        new AbortController().signal,
        false,
      )
    )[0];
    assert.equal(material.source?.markdown, f.source.markdown);
    assert.deepEqual(material.diagnostic, metadataOnly ? speech : undefined);
  });

test("Xiaohongshu share-link recovery requires the observed original-note navigation", () => {
  const f = fixture(true);
  const note = "https://www.xiaohongshu.com/explore/example_note_123";
  const share = "https://xhslink.com/a/example123";
  const source = sourceSchema.parse({
    ...f.source,
    sourceUrl: note,
    platform: "xiaohongshu",
    sourceKey: undefined,
  });
  f.readers.set(f.id, { source, requestedUrl: note, attemptId: f.attemptId });
  f.capture.url = note;
  f.capture.pageUrl = note;
  const collection = { url: share, browserUrl: share, includeReferences: true };
  assert.equal(
    recoverCapturedVideo(
      collection,
      f.attemptId,
      f.readers,
      f.captures,
      new Map(),
    ),
    undefined,
  );
  const output = recoverCapturedVideo(
    collection,
    f.attemptId,
    f.readers,
    f.captures,
    new Map([[share, note]]),
  )!;
  assert.equal(output.materials[0].url, share);
  assert.equal(output.materials[1].url, "https://example.org/source");
});

test("a reader record retains only evidence from the current attempt", () => {
  const f = fixture();
  f.source.evidence!.artifactKey = `${randomUUID()}/bilibili/BV1234567890-p2`;
  assert.equal(
    recoverCapturedVideo(
      f.collection,
      f.attemptId,
      f.readers,
      f.captures,
      f.navigations,
    ),
    undefined,
  );
});

test("complete reader speech takes priority over a longer partial checkpoint", () => {
  const f = fixture(),
    partialId = randomUUID();
  const partial = structuredClone(f.source);
  partial.markdown = "Long partial speech. ".repeat(30);
  partial.evidence!.captureId = partialId;
  partial.evidence!.transcriptCoverage = "partial";
  partial.evidence!.segments[0].text = partial.markdown;
  f.readers.set(partialId, {
    source: partial,
    requestedUrl: f.collection.url,
    attemptId: f.attemptId,
  });
  f.captures.set(partialId, {
    ...f.capture,
    markdown: partial.markdown,
    evidence: partial.evidence,
  });
  const output = recoverCapturedVideo(
    f.collection,
    f.attemptId,
    f.readers,
    f.captures,
    f.navigations,
  )!;
  assert.deepEqual(output.materials[0].sourceCaptureIds, [f.id]);
});
