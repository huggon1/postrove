import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { readingDiagnostic } from "../../src/shared/reading-diagnostics";
import type { ReadingMaterial } from "../../src/shared/reading-contracts";
import { ExecutionFailure } from "../../src/shared/task-failure";
import { runReadingJob } from "../../src/worker/jobs/forwarding/reading";
import type { ForwardingJobEventContract } from "../../src/worker/jobs/forwarding/contracts";

const config = {
  method: "generic_api" as const,
  modelId: "fixture",
  api: "openai-completions" as const,
  baseUrl: "http://127.0.0.1:9/v1",
  credential: "fictional",
};
const url = "https://example.org/article";
const captionIssue = readingDiagnostic("captions_missing", "captions");
const material = (): ReadingMaterial => ({
  id: "main",
  role: "main",
  url,
  title: "Fictional article",
  state: "partial",
  summary: "",
  diagnostic: captionIssue,
  issue: "No native captions",
  chunks: [
    { index: 0, original: "First", translated: "第一段", complete: true },
    { index: 1, original: "Second", translated: "", complete: false },
  ],
  source: {
    sourceUrl: url,
    platform: "web",
    title: "Fictional article",
    sourceIdentity: "Fixture",
    fetchedAt: new Date().toISOString(),
    markdown: "First\n\nSecond",
    contentBlocks: [{ type: "text", text: "First\n\nSecond" }],
    images: [],
    completeness: "partial",
    completenessNote: "Page text only",
  },
});

for (const stage of ["translation", "summary"] as const) {
  test(`a ${stage} failure keeps its recovery action alongside an earlier caption issue`, async () => {
    const saved = material();
    const events: ForwardingJobEventContract[] = [];
    await runReadingJob(
      {
        taskId: randomUUID(),
        resultId: randomUUID(),
        sourceUrl: url,
        outputLanguage: "en",
        config,
        resume: { materials: [saved] },
      },
      (event) => events.push(event),
      new AbortController().signal,
      {
        collect: async () => {
          throw new Error("Unexpected source recollection");
        },
        translate: async () => {
          if (stage === "translation")
            throw new ExecutionFailure("model_network");
          return { text: "第二段", truncated: false };
        },
        summarize: async () => {
          throw new ExecutionFailure("model_network");
        },
      },
    );
    const result = events.findLast((event) => event.type === "result");
    assert.ok(result?.type === "result");
    assert.equal(result.failure?.stage, stage);
    assert.equal(result.failure?.readingDiagnostic?.stage, stage);
    assert.equal(result.failure?.readingDiagnostic?.code, "network_failed");
    assert.ok(
      result.failure?.readingDiagnostic?.actions.includes("resume_processing"),
    );
    assert.deepEqual(result.draft.materials[0].diagnostic, captionIssue);
    assert.equal(result.draft.materials[0].source?.markdown, "First\n\nSecond");
    assert.equal(result.draft.materials[0].chunks[0].translated, "第一段");
  });
}

test("truncated translation retains the source issue and reports its processing failure", async () => {
  const events: ForwardingJobEventContract[] = [];
  await runReadingJob(
    {
      taskId: randomUUID(),
      resultId: randomUUID(),
      sourceUrl: url,
      outputLanguage: "en",
      config,
      resume: { materials: [material()] },
    },
    (event) => events.push(event),
    new AbortController().signal,
    {
      translate: async () => ({ text: "部分第二段", truncated: true }),
      summarize: async () => "Introduction",
    },
  );
  const result = events.findLast((event) => event.type === "result");
  assert.ok(result?.type === "result");
  assert.deepEqual(result.draft.materials[0].diagnostic, captionIssue);
  assert.match(result.draft.materials[0].issue!, /No native captions/);
  assert.equal(result.failure?.readingDiagnostic?.stage, "translation");
  assert.ok(
    result.failure?.readingDiagnostic?.actions.includes("resume_processing"),
  );
  assert.equal(result.draft.materials[0].chunks[1].translated, "部分第二段");
  assert.equal(result.draft.materials[0].chunks[1].complete, false);
});
