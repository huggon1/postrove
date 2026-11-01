import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { FocusSearchService } from "../../src/main/services/focus-search/service";
import { FocusSearchStore } from "../../src/main/storage/focus-search-store";
import { TaskStore } from "../../src/main/storage/task-store";
import { TaskService } from "../../src/main/services/tasks/task-service";
import { advisors } from "../../src/shared/advisor-contracts";
import type { ContentRequest } from "../../src/shared/content-contracts";
import type { SearchSection } from "../../src/shared/focus-search-contracts";
import type { SearchProgress } from "../../src/main/services/browser-agent";

type Reply = {
  rawReply: string;
  candidates: [];
  citationExtraction: { state: "completed" };
};
const reply = (section: SearchSection): Reply => ({
  rawReply: `Original ${section.advisorId}`,
  candidates: [],
  citationExtraction: { state: "completed" },
});
const input = {
  question: "Fixture question",
  platforms: ["x", "xiaohongshu", "youtube", "reddit"],
  advisorIds: advisors.map((a) => a.id),
};
async function until(check: () => boolean) {
  for (let n = 0; n < 800 && !check(); n++)
    await new Promise((done) => setTimeout(done, 5));
  assert.ok(check(), "expected lifecycle state is reached");
}
async function fixture(options: {
  execute: (
    section: SearchSection,
    signal: AbortSignal,
    taskId: string,
    progress?: (value: SearchProgress) => Promise<void>,
  ) => Promise<Reply>;
  content?: (
    input: ContentRequest,
    signal: AbortSignal,
    taskId: string,
  ) => Promise<string>;
}) {
  const root = await mkdtemp(join(tmpdir(), "postrove-parallel-search-"));
  const store = new FocusSearchStore(join(root, "search.json"));
  const taskStore = new TaskStore(join(root, "tasks.json"));
  await store.open();
  await taskStore.open();
  const tasks = new TaskService(taskStore);
  let acquired = 0,
    released = 0;
  const service = new FocusSearchService(
    store,
    tasks,
    {} as any,
    async () => {
      acquired++;
      return {
        ...options,
        release: async () => {
          released++;
        },
      };
    },
    () => {},
    { schedulerIntervalMs: 0 },
  );
  return {
    service,
    store,
    tasks,
    get acquired() {
      return acquired;
    },
    get released() {
      return released;
    },
    cleanup: async () => {
      await service.shutdown();
      await rm(root, { recursive: true, force: true });
    },
  };
}

test("four connections overlap, language bridges serialize, reading drains separately, and topics keep their queue", async () => {
  const gates = new Map(
    advisors.map((a) => [a.id, Promise.withResolvers<void>()]),
  );
  const readings = Promise.withResolvers<void>();
  const entered: string[] = [],
    processing: string[] = [];
  const f = await fixture({
    execute: async (section) => {
      entered.push(section.advisorId!);
      await gates.get(section.advisorId!)!.promise;
      return reply(section);
    },
    content: async (request, _signal, id) => {
      if (request.operation === "translate_question") return request.text;
      processing.push(id);
      await readings.promise;
      return request.text;
    },
  });
  try {
    const id = await f.service.start(input);
    const next = await f.service.start(input);
    await until(() => entered.length === 4);
    assert.deepEqual(
      new Set(entered),
      new Set([
        "x-grok-zh",
        "xiaohongshu-diandian-zh",
        "youtube-gemini-zh",
        "reddit-ai-en",
      ]),
    );
    assert.equal(f.service.readTask(next).status, "queued");
    assert.equal(f.acquired, 1);
    gates.get("x-grok-zh")!.resolve();
    gates.get("youtube-gemini-zh")!.resolve();
    await until(() => entered.length === 6 && processing.length === 2);
    assert.equal(f.service.readTask(id).status, "running");
    for (const gate of gates.values()) gate.resolve();
    await until(() => processing.length === 6);
    assert.equal(f.released, 0);
    assert.equal(f.service.readTask(next).status, "queued");
    readings.resolve();
    await until(() => f.released === 2);
    assert.equal(f.service.readTask(id).status, "completed");
    assert.equal(f.service.readTask(next).status, "completed");
    assert.ok(
      f.service
        .readTask(id)
        .sections.every((s) => s.readingReply === s.rawReply),
    );
    assert.equal(f.tasks.read(id)?.progress.completed, 6);
  } finally {
    for (const gate of gates.values()) gate.resolve();
    readings.resolve();
    await f.cleanup();
  }
});

test("platform, citation and reading failures retain independent results and continue the next language", async () => {
  const f = await fixture({
    execute: async (section, _signal, _id, progress) => {
      if (section.advisorId === "x-grok-zh") {
        await progress?.({
          rawReply: reply(section).rawReply,
          checkpoint: {
            state: "answered",
            conversationUrl: "https://x.com/i/grok/conversation/fixture",
          },
          citationExtraction: { state: "running" },
        });
        throw new Error("Browser worker stopped");
      }
      if (section.platform === "xiaohongshu")
        throw new Error("verification_required");
      return reply(section);
    },
    content: async (request) => {
      if (
        request.operation === "prepare_reading" &&
        request.text.includes("youtube-gemini-zh")
      )
        throw new Error("fixture reading failure");
      return request.text;
    },
  });
  try {
    const id = await f.service.start(input);
    await until(() => f.released === 1);
    const report = f.service.readTask(id);
    const byId = (id: string) =>
      report.sections.find((s) => s.advisorId === id)!;
    assert.equal(report.status, "partial");
    assert.equal(byId("x-grok-zh").rawReply, "Original x-grok-zh");
    assert.equal(byId("x-grok-zh").citationExtraction?.state, "failed");
    assert.equal(byId("x-grok-zh").failureStage, "sources");
    assert.equal(byId("x-grok-en").state, "completed");
    assert.equal(byId("xiaohongshu-diandian-zh").failureStage, "platform");
    assert.equal(byId("youtube-gemini-zh").failureStage, "processing");
    assert.equal(
      byId("youtube-gemini-zh").rawReply,
      "Original youtube-gemini-zh",
    );
    assert.equal(byId("youtube-gemini-en").state, "completed");
    assert.equal(byId("reddit-ai-en").state, "completed");
  } finally {
    await f.cleanup();
  }
});

test("stopping active and queued experts preserves checkpoints and rejects late progress while peers continue", async () => {
  const held = Promise.withResolvers<void>(),
    peer = Promise.withResolvers<void>();
  const entered: string[] = [];
  const f = await fixture({
    execute: async (section, _signal, _id, progress) => {
      entered.push(section.advisorId!);
      if (section.platform === "x") {
        await progress?.({
          rawReply: "Saved before Stop",
          checkpoint: { state: "answered" },
          citationExtraction: { state: "running" },
        });
        await held.promise;
        await progress?.({
          rawReply: "Late replacement",
          citationExtraction: { state: "completed" },
        });
      } else await peer.promise;
      return reply(section);
    },
  });
  try {
    const id = await f.service.start({
      ...input,
      platforms: ["x", "reddit"],
      advisorIds: ["x-grok-zh", "x-grok-en", "reddit-ai-en"],
    });
    await until(
      () =>
        entered.length === 2 && !!f.service.readTask(id).sections[0].rawReply,
    );
    const report = f.service.readTask(id);
    await f.service.cancelSection(id, report.sections[1].sectionId);
    await f.service.cancelSection(id, report.sections[0].sectionId);
    held.resolve();
    await until(
      () =>
        !f.service.readTask(id).sections[0].citationExtraction ||
        f.service.readTask(id).sections[0].citationExtraction?.state ===
          "failed",
    );
    assert.equal(f.service.readTask(id).status, "running");
    assert.equal(f.released, 0);
    peer.resolve();
    await until(() => f.released === 1);
    const saved = f.service.readTask(id);
    assert.deepEqual(entered, ["x-grok-zh", "reddit-ai-en"]);
    assert.equal(saved.sections[0].rawReply, "Saved before Stop");
    assert.equal(saved.sections[0].citationExtraction?.state, "failed");
    assert.equal(saved.sections[1].cancelled, true);
    assert.equal(saved.sections[2].state, "completed");
    assert.equal(saved.status, "partial");
  } finally {
    held.resolve();
    peer.resolve();
    await f.cleanup();
  }
});

test("Stop all aborts browser and reading work, drains cleanup before releasing the lease, and keeps saved answers", async () => {
  const cleanup = Promise.withResolvers<void>();
  let browsers = 0,
    readings = 0,
    aborted = 0;
  const cancelled = (signal: AbortSignal) =>
    new Promise<never>((_resolve, reject) => {
      const stop = () => {
        aborted++;
        void cleanup.promise.then(() => reject(new Error("cancelled")));
      };
      signal.addEventListener("abort", stop, { once: true });
      if (signal.aborted) stop();
    });
  const f = await fixture({
    execute: async (section, signal, _id, progress) => {
      if (section.platform === "x" || section.platform === "reddit") {
        browsers++;
        await progress?.({
          checkpoint: {
            state: "submitted",
            conversationUrl: "https://example.org/fixture-conversation",
          },
        });
        return cancelled(signal);
      }
      return reply(section);
    },
    content: async (request, signal) => {
      if (request.operation === "translate_question") return request.text;
      readings++;
      return cancelled(signal);
    },
  });
  try {
    const id = await f.service.start({
      ...input,
      advisorIds: [
        "x-grok-zh",
        "x-grok-en",
        "xiaohongshu-diandian-zh",
        "youtube-gemini-zh",
        "reddit-ai-en",
      ],
    });
    await until(() => browsers === 2 && readings === 2);
    const next = await f.service.start({
      ...input,
      platforms: ["x"],
      advisorIds: ["x-grok-en"],
    });
    await f.service.cancel(next);
    await f.service.cancel(id);
    await until(() => aborted === 4);
    assert.equal(f.released, 0);
    const stopped = f.service.readTask(id);
    assert.equal(stopped.status, "stopped");
    assert.equal(stopped.sections.filter((s) => s.rawReply).length, 2);
    cleanup.resolve();
    await until(() => f.released === 1);
    assert.deepEqual(f.service.readTask(id), stopped);
    assert.equal(f.acquired, 1);
    assert.equal(f.tasks.read(id)?.state, "cancelled");
  } finally {
    cleanup.resolve();
    await f.cleanup();
  }
});

test("an orchestration error drains peer workers before final failure and lease release", async () => {
  const held = Promise.withResolvers<void>(),
    first = Promise.withResolvers<void>();
  let peerEntered = false;
  const f = await fixture({
    execute: async (section) => {
      if (section.platform === "reddit") {
        peerEntered = true;
        await held.promise;
      } else await first.promise;
      return reply(section);
    },
  });
  const receive = f.tasks.receive.bind(f.tasks);
  let failed = false;
  f.tasks.receive = async (id, event: any) => {
    if (event.type === "progress" && !failed) {
      failed = true;
      throw new Error("fixture progress persistence failed");
    }
    return receive(id, event);
  };
  try {
    const id = await f.service.start({
      ...input,
      platforms: ["x", "reddit"],
      advisorIds: ["x-grok-zh", "x-grok-en", "reddit-ai-en"],
    });
    await until(() => peerEntered);
    const queued = f.service.readTask(id).sections[1];
    await f.service.cancelSection(id, queued.sectionId);
    const stopped = f.service.readTask(id).sections[1];
    first.resolve();
    await until(() => failed);
    assert.equal(f.released, 0);
    assert.equal(f.service.readTask(id).status, "running");
    held.resolve();
    await until(() => f.released === 1);
    assert.equal(f.service.readTask(id).taskOutcome, "failed");
    assert.deepEqual(f.service.readTask(id).sections[1], stopped);
    assert.ok(
      f.service
        .readTask(id)
        .sections.filter((s) => !s.cancelled)
        .every((s) => !!s.rawReply),
    );
  } finally {
    first.resolve();
    held.resolve();
    await f.cleanup();
  }
});

test("recovery retains mixed submitted, answered, completed and stopped expert identities", async () => {
  const seen: SearchSection[] = [];
  let preparations = 0;
  const f = await fixture({
    execute: async (section) => {
      seen.push(structuredClone(section));
      return {
        ...reply(section),
        rawReply: section.rawReply || reply(section).rawReply,
      };
    },
    content: async (request) => {
      if (request.operation === "translate_question") preparations++;
      return request.text;
    },
  });
  try {
    const id = randomUUID();
    await f.store.update((state) =>
      state.reports.push({
        taskId: id,
        reportId: randomUUID(),
        question: input.question,
        createdAt: new Date().toISOString(),
        period: "all",
        platforms: ["x", "xiaohongshu", "youtube", "reddit"],
        submissions: [],
        status: "running",
        questionPreparations: {
          en: { state: "ready", question: "Prepared English question" },
          "zh-CN": { state: "ready", question: "Prepared Chinese question" },
        },
        sections: advisors.map((advisor) => ({
          sectionId: randomUUID(),
          runId: randomUUID(),
          advisorId: advisor.id,
          connectionId: advisor.connectionId,
          platform: advisor.platform,
          promptLanguage: advisor.language,
          prompt: "Saved submitted prompt",
          candidates: [],
          rawReply:
            advisor.id === "youtube-gemini-zh"
              ? "Captured Gemini answer"
              : advisor.id === "youtube-gemini-en"
                ? "Completed Gemini answer"
                : "",
          state:
            advisor.id === "youtube-gemini-en"
              ? "completed"
              : advisor.platform === "xiaohongshu"
                ? "failed"
                : "running",
          ...(advisor.id === "youtube-gemini-en"
            ? { finishedAt: new Date().toISOString() }
            : {}),
          ...(advisor.platform === "xiaohongshu" ? { cancelled: true } : {}),
          checkpoint:
            advisor.id === "x-grok-zh"
              ? {
                  state: "submitted",
                  conversationUrl:
                    "https://x.com/i/grok/conversation/saved-fixture",
                }
              : advisor.id === "youtube-gemini-zh"
                ? {
                    state: "answered",
                    conversationUrl:
                      "https://gemini.google.com/app/saved-fixture",
                  }
                : { state: "prepared" },
        })),
      }),
    );
    await f.service.recover();
    await until(() => f.released === 1);
    assert.equal(preparations, 0);
    assert.equal(seen.length, 4);
    assert.equal(
      seen.find((s) => s.advisorId === "x-grok-zh")?.checkpoint
        ?.conversationUrl,
      "https://x.com/i/grok/conversation/saved-fixture",
    );
    assert.equal(
      seen.find((s) => s.advisorId === "x-grok-zh")?.prompt,
      "Saved submitted prompt",
    );
    assert.equal(
      seen.find((s) => s.advisorId === "youtube-gemini-zh")?.checkpoint?.state,
      "answered",
    );
    const report = f.service.readTask(id);
    assert.equal(
      report.sections.find((s) => s.advisorId === "youtube-gemini-zh")
        ?.rawReply,
      "Captured Gemini answer",
    );
    assert.equal(
      report.sections.find((s) => s.advisorId === "youtube-gemini-en")
        ?.rawReply,
      "Completed Gemini answer",
    );
    assert.equal(
      report.sections.find((s) => s.platform === "xiaohongshu")?.cancelled,
      true,
    );
    assert.equal(report.status, "partial");
  } finally {
    await f.cleanup();
  }
});
