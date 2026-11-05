import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ForwardingStore } from "../../src/main/services/forwarding/store";
import {
  ForwardingPipelineService,
  type ForwardingWorkerHandle,
} from "../../src/main/services/forwarding/service";
import {
  ReadingFailure,
  readingDiagnostic,
} from "../../src/shared/reading-diagnostics";
import type { ReadingMaterial } from "../../src/shared/reading-contracts";

const config = {
  method: "generic_api" as const,
  modelId: "fixture",
  api: "openai-completions" as const,
  baseUrl: "http://127.0.0.1:9/v1",
  credential: "fictional",
};
async function settled(service: ForwardingPipelineService, id: string) {
  for (let i = 0; i < 300; i++) {
    const detail = service.read(id);
    if (["failed", "completed"].includes(detail.task.state)) return detail;
    await new Promise((done) => setTimeout(done, 10));
  }
  throw new Error("Fixture task did not finish");
}

test("typed source failures reach durable task receipts without a login inference", async () => {
  const root = await mkdtemp(join(tmpdir(), "postrove-diagnostic-receipt-"));
  try {
    const file = join(root, "forwarding.json");
    const store = new ForwardingStore(file);
    await store.open();
    const diagnostic = readingDiagnostic("component_missing", "readiness");
    const service = new ForwardingPipelineService({
      store,
      acquire: async () => ({ config, release: async () => {} }),
      collectMaterials: async () => {
        throw new ReadingFailure(diagnostic, "Component missing");
      },
      spawn: () => {
        throw new Error("Unexpected worker");
      },
      protectSensitive: async (value) => value,
      revealSensitive: async (value) => value,
      changed: () => {},
      language: () => "en",
    });
    const id = await service.submit("https://example.org/fixture");
    const detail = await settled(service, id);
    assert.deepEqual(detail.task.diagnostic, diagnostic);
    assert.deepEqual(service.list()[0].diagnostic, diagnostic);
    assert.doesNotMatch(detail.task.message!, /login|sign.in/i);
    await service.shutdown();
    const restored = new ForwardingStore(file);
    await restored.open();
    assert.deepEqual(restored.snapshot().tasks[0].diagnostic, diagnostic);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("partial reading receipt preserves source, completed chunks, and unfinished processing action", async () => {
  const root = await mkdtemp(join(tmpdir(), "postrove-partial-receipt-"));
  let service: ForwardingPipelineService | undefined;
  try {
    const store = new ForwardingStore(join(root, "forwarding.json"));
    await store.open();
    const url = "https://example.org/partial";
    const material: ReadingMaterial = {
      id: "main",
      role: "main",
      url,
      title: "Fictional article",
      state: "partial",
      summary: "",
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
        completeness: "complete",
        completenessNote: "Fixture",
      },
    };
    const diagnostic = readingDiagnostic(
      "network_failed",
      "translation",
      { transportCode: "ECONNRESET" },
      true,
    );
    class Worker extends EventEmitter implements ForwardingWorkerHandle {
      kill() {}
      postMessage(raw: unknown) {
        const command = raw as {
          taskId: string;
          resultId: string;
          outputLanguage: string;
        };
        const updated = {
          ...structuredClone(material),
          diagnostic,
          issue: "Translation failed",
        };
        queueMicrotask(() => {
          this.emit("message", {
            type: "material",
            taskId: command.taskId,
            resultId: command.resultId,
            material: updated,
          });
          this.emit("message", {
            type: "result",
            taskId: command.taskId,
            resultId: command.resultId,
            draft: {
              materials: [updated],
              source: material.source,
              outputLanguage: command.outputLanguage,
            },
            failure: {
              materialId: "main",
              stage: "translation",
              message: "Translation failed",
              readingDiagnostic: diagnostic,
            },
          });
        });
      }
    }
    service = new ForwardingPipelineService({
      store,
      acquire: async () => ({ config, release: async () => {} }),
      collectMaterials: async () => [structuredClone(material)],
      spawn: () => new Worker(),
      protectSensitive: async (value) => value,
      revealSensitive: async (value) => value,
      changed: () => {},
    });
    const id = await service.submit(url);
    const detail = await settled(service, id);
    assert.equal(detail.task.failureStage, "translation");
    assert.deepEqual(detail.task.diagnostic, diagnostic);
    assert.deepEqual(detail.task.materials![0].source, material.source);
    assert.deepEqual(detail.task.materials![0].chunks, material.chunks);
    assert.ok(detail.task.diagnostic!.actions.includes("resume_processing"));
    assert.ok(detail.task.report);
  } finally {
    await service?.shutdown();
    await rm(root, { recursive: true, force: true });
  }
});
