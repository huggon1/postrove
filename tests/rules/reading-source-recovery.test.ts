import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readingDiagnostic, ReadingFailure } from "../../src/shared/reading-diagnostics";
import { readingMaterialSchema, type ReadingMaterial } from "../../src/shared/reading-contracts";
import { ForwardingStore } from "../../src/main/services/forwarding/store";
import { ForwardingPipelineService, type ForwardingWorkerHandle } from "../../src/main/services/forwarding/service";
import { xiaohongshuVideoDiagnostic } from "../../src/main/services/video-diagnostics";
import { ResultPublisher } from "../../src/main/services/result-publisher";
import { videoIdentity, videoArtifactKey, videoTimestampUrl } from "../../src/shared/video-contracts";
import { runReadingJob, type ReadingDependencies } from "../../src/worker/jobs/forwarding/reading";
import type { ForwardingJobCommand, ForwardingJobEventContract } from "../../src/worker/jobs/forwarding/contracts";

const url = "https://www.bilibili.com/video/BV1ab411c7mD?p=1";
const config = { method: "generic_api" as const, modelId: "fixture", api: "openai-completions" as const, baseUrl: "http://127.0.0.1:9/v1", credential: "fictional" };
const diagnosis = readingDiagnostic("component_unavailable", "readiness", { failureCode: "runtime_integrity" });
function material(body = "Saved video description", diagnosed = true): ReadingMaterial {
  return {
    id: "main", role: "main", url, title: "Fictional video", state: "pending", summary: "", chunks: [],
    ...(diagnosed ? { diagnostic: diagnosis } : {}),
    source: {
      sourceUrl: url, platform: "bilibili", title: "Fictional video", sourceIdentity: "Fictional author",
      fetchedAt: new Date().toISOString(), markdown: body,
      contentBlocks: [{ type: "text", text: body }], images: [],
      completeness: "partial", completenessNote: "Visual coverage unknown",
    },
  };
}
async function settled(service: ForwardingPipelineService, id: string) {
  for (let i = 0; i < 500; i++) {
    const detail = service.read(id);
    if (["failed", "completed"].includes(detail.task.state)) return detail;
    await new Promise((done) => setTimeout(done, 10));
  }
  throw new Error("Fixture task did not finish");
}
class Worker extends EventEmitter implements ForwardingWorkerHandle {
  constructor(private readonly reading: Partial<ReadingDependencies>) { super(); }
  kill() {}
  postMessage(command: ForwardingJobCommand & { config: typeof config }) {
    void runReadingJob(structuredClone(command), (event) => this.emit("message", structuredClone(event)), new AbortController().signal, this.reading);
  }
}
async function fixture(collect: () => Promise<ReadingMaterial[]>) {
  const root = await mkdtemp(join(tmpdir(), "postrove-source-recovery-"));
  const store = new ForwardingStore(join(root, "forwarding.json"));
  await store.open();
  const translations: string[] = [];
  const summaries: string[] = [];
  const published: unknown[] = [];
  const publications: Promise<unknown>[] = [];
  const publisher = new ResultPublisher(join(root, "results"));
  const service = new ForwardingPipelineService({
    store,
    acquire: async () => ({ config: { ...config }, release: async () => {} }),
    collectMaterials: collect,
    spawn: () => new Worker({
      collect: async () => { throw new Error("Main owns collection"); },
      translate: async (_material, text) => { translations.push(text); return { text: `Reading: ${text}`, truncated: false }; },
      summarize: async (saved) => { summaries.push(saved.chunks.map((chunk) => chunk.translated).join("\n")); return `Introduction ${summaries.length}`; },
    }),
    publish: async (detail) => {
      published.push(structuredClone(detail));
      const publication = publisher.publishReading(detail);
      publications.push(publication);
      return publication;
    },
    changed: () => {}, protectSensitive: async (value) => value, revealSensitive: async (value) => value,
    language: () => "en",
  });
  return { service, store, translations, summaries, published, publisher, root, close: async () => { await service.shutdown(); await Promise.allSettled(publications); await rm(root, { recursive: true, force: true }); } };
}

test("successful text processing retains source-stage failure and retry captures richer content", async () => {
  let reads = 0;
  let captureStarted!: () => void, releaseCapture!: () => void;
  const recapturing = new Promise<void>((resolve) => { captureStarted = resolve; });
  const captureGate = new Promise<void>((resolve) => { releaseCapture = resolve; });
  const fx = await fixture(async () => {
    if (++reads === 1) return [material()];
    captureStarted();
    await captureGate;
    return [material("Saved video description\n\n[00:00] Complete spoken explanation", false)];
  });
  try {
    const id = await fx.service.submit(url);
    const before = await settled(fx.service, id);
    assert.equal(before.task.state, "failed");
    assert.equal(before.task.failureStage, "source");
    assert.deepEqual(before.task.diagnostic, diagnosis);
    assert.equal(before.task.materials![0].state, "partial");
    assert.equal(before.task.materials![0].chunks[0].complete, true);
    assert.equal(before.task.materials![0].summary, "Introduction 1");
    assert.equal(fx.service.list()[0].progress.evaluated, 0);
    await fx.service.retry(id);
    await recapturing;
    const duringCapture = fx.service.read(id).task;
    assert.equal(duringCapture.state, "running");
    assert.equal(duringCapture.phase, "读取来源");
    assert.deepEqual(duringCapture.source, before.task.source);
    assert.deepEqual(duringCapture.materials![0].chunks, before.task.materials![0].chunks);
    releaseCapture();
    const after = await settled(fx.service, id);
    assert.equal(reads, 2);
    assert.equal(after.task.state, "completed");
    assert.equal(after.task.diagnostic, undefined);
    assert.notEqual(after.task.attemptId, before.task.attemptId);
    assert.match(after.task.source!.markdown!, /Complete spoken explanation/);
    assert.match(after.task.materials![0].chunks[0].translated, /Complete spoken explanation/);
    assert.equal(after.task.materials![0].summary, "Introduction 2");
    assert.equal(fx.translations.length, 2);
    assert.equal((fx.published[0] as typeof before).task.source!.markdown, "Saved video description");
  } finally { releaseCapture(); await fx.close(); }
});

test("failed or empty recapture retains saved source, completed chunks and introduction", async () => {
  let reads = 0;
  const fx = await fixture(async () => {
    reads++;
    if (reads === 1) return [material()];
    if (reads === 2) throw new ReadingFailure(readingDiagnostic("network_failed", "source"), "Fixture network failure");
    const empty = material(); delete empty.source;
    empty.diagnostic = readingDiagnostic("capture_incomplete", "source");
    empty.state = "failed";
    return [empty];
  });
  try {
    const id = await fx.service.submit(url);
    const before = await settled(fx.service, id);
    for (const code of ["network_failed", "capture_incomplete"]) {
      await fx.service.retry(id);
      const after = await settled(fx.service, id);
      assert.equal(after.task.state, "failed");
      assert.equal(after.task.failureStage, "source");
      assert.equal(after.task.diagnostic?.code, code);
      assert.deepEqual(after.task.source, before.task.source);
      assert.deepEqual(after.task.materials![0].chunks, before.task.materials![0].chunks);
      assert.equal(after.task.materials![0].summary, before.task.materials![0].summary);
    }
    assert.equal(fx.translations.length, 1);
    assert.equal(fx.summaries.length, 1);
  } finally { await fx.close(); }
});

test("diagnosed metadata-only recapture preserves earlier speech, images and processed text", async () => {
  const richer = material("Saved description\n\nTen captured speech segments with detailed explanations.");
  const video = videoIdentity(url)!;
  richer.source!.evidence = {
    kind: "transcript", captureId: randomUUID(), videoId: video.id, video,
    language: "en", trackKind: "automatic", provenance: { source: "application_asr", kind: "automatic", engine: "fixture" },
    artifactKey: videoArtifactKey(randomUUID(), video), transcriptCoverage: "partial", visualCoverage: "unknown",
    segments: Array.from({ length: 10 }, (_, index) => ({ id: `segment-${index + 1}`, start: index, end: index + 1, text: `Speech ${index}`, url: videoTimestampUrl(video, index) })),
  };
  richer.source!.images = [{ imageId: "cover", url: "https://example.org/cover.png", alt: "Saved cover" }];
  let reads = 0;
  const fx = await fixture(async () => [++reads === 1 ? structuredClone(richer) : material("New metadata")]);
  try {
    const id = await fx.service.submit(url);
    const before = await settled(fx.service, id);
    await fx.service.retry(id);
    const after = await settled(fx.service, id);
    assert.equal(after.task.state, "failed");
    assert.deepEqual(after.task.source, before.task.source);
    assert.equal(after.task.source!.evidence!.segments.length, 10);
    assert.deepEqual(after.task.materials![0].chunks, before.task.materials![0].chunks);
    assert.equal(after.task.materials![0].summary, before.task.materials![0].summary);
    assert.equal(fx.translations.length, 1);
    assert.equal(fx.summaries.length, 1);
  } finally { await fx.close(); }
});

test("unchanged refreshed content reuses completed processing and clears recovered source issue", async () => {
  let reads = 0;
  const fx = await fixture(async () => [material(undefined, ++reads === 1)]);
  try {
    const id = await fx.service.submit(url);
    const before = await settled(fx.service, id);
    await fx.service.retry(id);
    const after = await settled(fx.service, id);
    assert.equal(after.task.state, "completed");
    assert.equal(after.task.materials![0].diagnostic, undefined);
    assert.deepEqual(after.task.materials![0].chunks, before.task.materials![0].chunks);
    assert.equal(after.task.materials![0].summary, before.task.materials![0].summary);
    assert.equal(fx.translations.length, 1);
    assert.equal(fx.summaries.length, 1);
  } finally { await fx.close(); }
});

test("source retry retains completed reference material", async () => {
  const reference = material("Completed reference", false);
  reference.id = "ref-1";
  reference.role = "reference";
  reference.url = "https://example.org/reference";
  reference.source!.sourceUrl = reference.url;
  reference.state = "completed";
  reference.chunks = [{ index: 0, original: "Completed reference", translated: "Saved reference reading", complete: true }];
  reference.summary = "Saved reference introduction";
  let reads = 0;
  const fx = await fixture(async () => ++reads === 1 ? [material(), structuredClone(reference)] : [material("Recovered source speech", false)]);
  try {
    const id = await fx.service.submit(url);
    await settled(fx.service, id);
    await fx.service.retry(id);
    const after = await settled(fx.service, id);
    assert.equal(after.task.state, "completed");
    assert.deepEqual(after.task.materials![1], reference);
    assert.equal(reads, 2);
  } finally { await fx.close(); }
});

test("processing-only retry reuses its source and completed translated chunks", async () => {
  const fx = await fixture(async () => { throw new Error("Processing retry must reuse captured source"); });
  try {
    const id = randomUUID(), now = new Date().toISOString();
    const saved = material("First\n\nSecond", false);
    saved.state = "partial";
    saved.diagnostic = readingDiagnostic("network_failed", "translation", undefined, true);
    saved.chunks = [
      { index: 0, original: "First", translated: "Saved first reading", complete: true },
      { index: 1, original: "Second", translated: "", complete: false },
    ];
    const normalized = readingMaterialSchema.parse(saved);
    await fx.store.update((state) => state.tasks.push({
      taskId: id, resultId: randomUUID(), materialId: randomUUID(), target: { sourceUrl: url, entry: "app" },
      state: "failed", phase: "解析失败", createdAt: now, updatedAt: now, finishedAt: now,
      source: normalized.source, materials: [normalized], outputLanguage: "en", activities: [], failureStage: "translation",
    }));
    await fx.service.retry(id);
    const after = await settled(fx.service, id);
    assert.equal(after.task.state, "completed");
    assert.deepEqual(after.task.materials![0].chunks[0], saved.chunks[0]);
    assert.deepEqual(fx.translations, ["Second"]);
  } finally { await fx.close(); }
});

test("startup recovers legacy completed source diagnoses and allows recapture", async () => {
  const fx = await fixture(async () => [material("Recovered spoken content", false)]);
  try {
    const id = randomUUID(), resultId = randomUUID(), now = new Date().toISOString();
    const saved = material();
    saved.state = "completed";
    saved.summary = "Saved introduction";
    saved.chunks = [{ index: 0, original: "Saved video description", translated: "Saved reading", complete: true }];
    await fx.store.update((state) => state.tasks.push({
      taskId: id, resultId, materialId: randomUUID(), target: { sourceUrl: url, entry: "app" },
      state: "completed", phase: "已保存", createdAt: now, updatedAt: now, finishedAt: now,
      source: saved.source, materials: [saved], outputLanguage: "en", activities: [],
      report: { source: saved.source!, materials: [structuredClone(saved)], outputLanguage: "en" },
    }));
    const oldPath = await fx.publisher.publishReading(fx.service.read(id));
    const oldMarkdown = await readFile(oldPath!, "utf8");
    assert.match(oldMarkdown, /· completed/);
    await fx.service.recover();
    const recovered = fx.service.read(id);
    assert.equal(recovered.task.state, "failed");
    assert.equal(recovered.task.failureStage, "source");
    assert.equal(recovered.task.report!.materials[0].state, "partial");
    assert.equal(recovered.task.materials![0].summary, "Saved introduction");
    assert.notEqual(recovered.task.attemptId, resultId);
    assert.equal(recovered.task.attemptStartedAt, now);
    assert.equal(recovered.task.finishedAt, now);
    const correctedPath = fx.publisher.path("reading", recovered.task.attemptId!);
    assert.equal(await readFile(oldPath!, "utf8"), oldMarkdown);
    assert.match(await readFile(correctedPath, "utf8"), /· failed/);
    assert.match(await readFile(correctedPath, "utf8"), /reading component/i);
    const latestFile = join(fx.root, "results/reading/latest.json");
    assert.equal(JSON.parse(await readFile(latestFile, "utf8")).runId, recovered.task.attemptId);
    const newer = structuredClone(recovered);
    newer.task.attemptId = randomUUID();
    newer.task.attemptStartedAt = new Date(Date.parse(now) + 1000).toISOString();
    await fx.publisher.publishReading(newer);
    await fx.publisher.publishReading(recovered);
    assert.equal(JSON.parse(await readFile(latestFile, "utf8")).runId, newer.task.attemptId);
    await fx.service.retry(id);
    assert.equal((await settled(fx.service, id)).task.state, "completed");
  } finally { await fx.close(); }
});

test("a completed legacy material with source diagnosis stays partial in the reading worker", async () => {
  const saved = material();
  saved.state = "completed";
  saved.summary = "Saved introduction";
  saved.chunks = [{ index: 0, original: "Saved video description", translated: "Saved reading", complete: true }];
  const events: ForwardingJobEventContract[] = [];
  await runReadingJob({ taskId: randomUUID(), resultId: randomUUID(), sourceUrl: url, outputLanguage: "en", config: { ...config }, resume: { materials: [saved] } }, (event) => events.push(event), new AbortController().signal, {
    translate: async () => { throw new Error("Completed translation must be reused"); },
    summarize: async () => { throw new Error("Completed introduction must be reused"); },
  });
  const result = events.findLast((event) => event.type === "result");
  assert.ok(result?.type === "result");
  assert.equal(result.draft.materials[0].state, "partial");
  assert.equal(result.failure?.stage, "source");
  assert.deepEqual(result.failure?.readingDiagnostic, diagnosis);
});

test("speech runtime and model integrity failures offer component recovery", () => {
  for (const reason of ["runtime_integrity", "model_integrity"]) {
    const diagnostic = xiaohongshuVideoDiagnostic(reason);
    assert.equal(diagnostic.code, "component_unavailable");
    assert.equal(diagnostic.stage, "readiness");
    assert.deepEqual(diagnostic.actions, ["setup_component", "retry_capture"]);
    assert.equal(diagnostic.evidence?.failureCode, reason);
  }
});
