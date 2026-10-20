import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { FocusSearchStore } from "../../src/main/storage/focus-search-store";
import { FocusSearchService } from "../../src/main/services/focus-search/service";
import { TaskStore } from "../../src/main/storage/task-store";
import { TaskService } from "../../src/main/services/tasks/task-service";
import { AdvisorStore } from "../../src/main/storage/advisor-store";
import { ResultPublisher } from "../../src/main/services/result-publisher";
import { executeContent } from "../../src/worker/content/capabilities";
import { prepareProfile } from "../../src/main/runtime/profile";
import type { AdvisorId } from "../../src/shared/advisor-contracts";
import type {
  FocusSearchReport,
  SearchSection,
} from "../../src/shared/focus-search-contracts";
import type { ForwardingTaskDetail } from "../../src/shared/forwarding-view-contracts";

async function until(check: () => boolean) {
  for (let index = 0; index < 400 && !check(); index++)
    await new Promise((done) => setTimeout(done, 5));
  assert.ok(check(), "operation reaches its terminal state");
}
async function fixture(
  execute: (section: SearchSection, signal: AbortSignal) => Promise<any>,
  options: any = {},
  content?: any,
) {
  const root = await mkdtemp(join(tmpdir(), "postrove-topic-rule-"));
  const store = new FocusSearchStore(join(root, "focus-search.json"));
  await store.open();
  const taskStore = new TaskStore(join(root, "tasks.json"));
  await taskStore.open();
  const service = new FocusSearchService(
    store,
    new TaskService(taskStore),
    {} as any,
    async () => ({ execute, content, release: async () => {} }),
    () => {},
    { schedulerIntervalMs: 0, ...options },
  );
  return {
    root,
    store,
    service,
    cleanup: async () => {
      await service.shutdown();
      await rm(root, { recursive: true, force: true });
    },
  };
}
const reply = {
  rawReply: "# Original\n\n[Source](https://x.com/person/status/123)",
  candidates: [],
  citationExtraction: { state: "empty" as const },
};
const send = {
  question: "我的问题",
  platforms: ["x"] as const,
  advisorIds: ["x-grok-zh", "x-grok-en"] as AdvisorId[],
};

test("language experts share a connection and freeze identity, language and exact submitted text", async () => {
  let enabled: AdvisorId[] = [...send.advisorIds];
  let language: "zh-CN" | "en" = "zh-CN";
  let resume!: () => void;
  const gate = new Promise<void>((done) => {
    resume = done;
  });
  const seen: SearchSection[] = [];
  const calls: string[] = [];
  const f = await fixture(
    async (section) => {
      seen.push(structuredClone(section));
      if (seen.length === 1) await gate;
      return reply;
    },
    {
      language: () => language,
      advisorIds: () => enabled,
      revisions: async () => ({
        skillRevision: "skill-v1",
        promptRevision: "prompt-v1",
      }),
    },
    async (input: any) => {
      calls.push(input.operation + ":" + input.targetLanguage);
      return input.operation === "translate_content" &&
        input.text === send.question
        ? input.targetLanguage === "en"
          ? "My question"
          : "我的问题"
        : input.text;
    },
  );
  try {
    const id = await f.service.start(send);
    await until(() => seen.length === 1);
    enabled = [];
    language = "en";
    resume();
    await until(() => !!f.service.readTask(id).finishedAt);
    const report = f.service.readTask(id);
    assert.equal(report.outputLanguage, "zh-CN");
    assert.equal(seen.length, 2);
    assert.equal(
      report.sections[0].connectionId,
      report.sections[1].connectionId,
    );
    assert.notEqual(report.sections[0].runId, report.sections[1].runId);
    assert.equal(
      seen[0].prompt,
      "我的问题\n\n请基于相关 X 帖子回答，并附原帖链接。",
    );
    assert.equal(
      seen[1].prompt,
      "My question\n\nAnswer using relevant X posts and include links to the original posts.",
    );
    assert.ok(
      report.sections.every(
        (section) =>
          section.skillRevision === "skill-v1" &&
          section.readingReply === reply.rawReply,
      ),
    );
    assert.ok(calls.includes("format_content:zh-CN"));
    assert.equal(report.status, "partial");
    await assert.rejects(f.service.start(send), /member|advisor|enabled/i);
  } finally {
    resume();
    await f.cleanup();
  }
});

test("stopping one expert preserves its answer and continues the other expert", async () => {
  let entered = false;
  const f = await fixture(async (section, signal) => {
    if (section.advisorId === "x-grok-zh") {
      entered = true;
      await new Promise<void>((_, reject) =>
        signal.addEventListener("abort", () => reject(new Error("cancelled")), {
          once: true,
        }),
      );
    }
    return reply;
  });
  try {
    const id = await f.service.start(send);
    await until(() => entered);
    const first = f.service.readTask(id).sections[0];
    await f.service.cancelSection(id, first.sectionId);
    await until(() => !!f.service.readTask(id).finishedAt);
    assert.equal(f.service.readTask(id).sections[0].cancelled, true);
    assert.equal(f.service.readTask(id).sections[1].rawReply, reply.rawReply);
    assert.equal(f.service.readTask(id).status, "partial");
  } finally {
    await f.cleanup();
  }
});

test("submitted recovery observes the saved conversation without preparing a second question", async () => {
  const seen: SearchSection[] = [];
  const f = await fixture(
    async (section) => {
      seen.push(section);
      return reply;
    },
    {},
    async () => {
      throw new Error("unexpected question translation");
    },
  );
  try {
    const id = randomUUID();
    await f.store.update((state) =>
      state.reports.push({
        reportId: randomUUID(),
        taskId: id,
        question: "Question",
        createdAt: new Date().toISOString(),
        outputLanguage: "en",
        period: "all",
        platforms: ["x"],
        submissions: [],
        status: "running",
        sections: [
          {
            sectionId: randomUUID(),
            runId: randomUUID(),
            advisorId: "x-grok-en",
            connectionId: "x-grok",
            platform: "x",
            promptLanguage: "en",
            prompt: "Already sent",
            rawReply: "",
            candidates: [],
            state: "running",
            checkpoint: {
              state: "submitted",
              conversationUrl: "https://x.com/i/grok/conversation/abc",
            },
          },
        ],
      }),
    );
    await f.service.recover();
    await until(() => !!f.service.readTask(id).finishedAt);
    assert.equal(seen[0].prompt, "Already sent");
    assert.equal(
      seen[0].checkpoint?.conversationUrl,
      "https://x.com/i/grok/conversation/abc",
    );
    assert.equal(f.service.readTask(id).sections[0].rawReply, reply.rawReply);
  } finally {
    await f.cleanup();
  }
});

test("stopping a queued expert skips its execution and stopping processing preserves its original answer", async () => {
  const entered: string[] = [];
  let release!: () => void;
  const wait = new Promise<void>((done) => {
    release = done;
  });
  const f = await fixture(async (section) => {
    entered.push(section.advisorId!);
    await wait;
    return { ...reply, citationExtraction: { state: "completed" } };
  });
  try {
    const id = await f.service.start(send);
    await until(() => entered.length === 1);
    await f.service.cancelSection(
      id,
      f.service.readTask(id).sections[1].sectionId,
    );
    release();
    await until(() => !!f.service.readTask(id).finishedAt);
    assert.deepEqual(entered, ["x-grok-zh"]);
    assert.equal(f.service.readTask(id).status, "partial");
  } finally {
    release();
    await f.cleanup();
  }

  let processing = false;
  const g = await fixture(
    async () => ({ ...reply, citationExtraction: { state: "completed" } }),
    {},
    async (input: any, signal: AbortSignal) => {
      if (input.operation !== "format_content") return input.text;
      processing = true;
      await new Promise<void>((_, reject) =>
        signal.addEventListener("abort", () => reject(new Error("cancelled")), {
          once: true,
        }),
      );
      return input.text;
    },
  );
  try {
    const id = await g.service.start({ ...send, advisorIds: ["x-grok-en"] });
    await until(() => processing);
    await g.service.cancelSection(
      id,
      g.service.readTask(id).sections[0].sectionId,
    );
    await until(() => !!g.service.readTask(id).finishedAt);
    assert.equal(g.service.readTask(id).sections[0].rawReply, reply.rawReply);
    assert.equal(g.service.readTask(id).sections[0].readingReply, undefined);
    assert.equal(g.service.readTask(id).status, "partial");
  } finally {
    await g.cleanup();
  }
});

test("shared text capabilities repair links once, preserve code and reject invented citations", async () => {
  const text =
    "Read [source](https://example.org/post). Use `exact_id`.\n\n```sh\nnpm run build\n```";
  let calls = 0;
  const translated = await executeContent(
    { operation: "translate_content", text, targetLanguage: "zh-CN" },
    async () =>
      ++calls === 1
        ? "阅读 [来源](https://wrong.invalid)。"
        : text.replace("Read", "阅读"),
  );
  assert.equal(calls, 2);
  assert.match(translated, /npm run build/);
  assert.match(translated, /https:\/\/example.org\/post/);
  await assert.rejects(
    executeContent(
      { operation: "format_content", text, targetLanguage: "en" },
      async () => "lost links",
    ),
    /preservation/,
  );
  await assert.rejects(
    executeContent(
      { operation: "structure_content", text, targetLanguage: "en" },
      async () =>
        JSON.stringify({
          title: "Title",
          markdown: text,
          citations: [{ title: "Invented", url: "https://wrong.invalid" }],
        }),
    ),
    /preservation/,
  );
});

test("result packages remain immutable and latest follows admission order across restart", async () => {
  const root = await mkdtemp(join(tmpdir(), "postrove-results-rule-"));
  try {
    const publisher = new ResultPublisher(root);
    const report = (createdAt: string): FocusSearchReport => ({
      reportId: randomUUID(),
      taskId: randomUUID(),
      createdAt,
      question: "Question",
      period: "all",
      platforms: ["x"],
      sections: [
        {
          sectionId: randomUUID(),
          platform: "x",
          promptLanguage: "en",
          prompt: "Question",
          state: "completed",
          finishedAt: createdAt,
          rawReply: "Original answer",
          candidates: [],
        },
      ],
      submissions: [],
      finishedAt: createdAt,
      status: "partial",
    });
    const older = report("2026-10-01T00:00:00.000Z"),
      newer = report("2026-10-02T00:00:00.000Z");
    const path = await publisher.publishSearch(newer);
    const original = await readFile(path!, "utf8");
    await new ResultPublisher(root).publishSearch({
      ...newer,
      question: "Changed",
    });
    assert.equal(await readFile(path!, "utf8"), original);
    await publisher.publishSearch(older);
    assert.match(
      await readFile(join(root, "search/latest.md"), "utf8"),
      new RegExp(newer.taskId),
    );
    assert.equal(
      JSON.parse(
        await readFile(
          join(root, "search", newer.taskId, "manifest.json"),
          "utf8",
        ),
      ).status,
      "partial",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reading result packages retain original bodies and portable cached images", async () => {
  const root = await mkdtemp(join(tmpdir(), "postrove-reading-result-"));
  const runId = randomUUID();
  const imageId = "a".repeat(64);
  const markdown = `# Source\n\n![Diagram](<https://example.org/diagram.png>)`;
  try {
    await mkdir(join(root, "images"));
    await writeFile(join(root, "images", imageId), "captured image bytes");
    await writeFile(join(root, "images", imageId + ".type"), "image/png");
    const detail: ForwardingTaskDetail = {
      task: {
        taskId: randomUUID(),
        materialId: randomUUID(),
        resultId: runId,
        target: { sourceUrl: "https://example.org/post", entry: "app" },
        state: "failed",
        phase: "Translation failed",
        activities: [],
        createdAt: "2026-10-01T00:00:00.000Z",
        updatedAt: "2026-10-01T00:01:00.000Z",
        finishedAt: "2026-10-01T00:01:00.000Z",
      },
      partial: {
        materials: [
          {
            id: "main",
            role: "main",
            url: "https://example.org/post",
            title: "Source",
            state: "failed",
            summary: "",
            chunks: [],
            source: {
              sourceUrl: "https://example.org/post",
              platform: "web",
              title: "Source",
              sourceIdentity: "Author",
              fetchedAt: "2026-10-01T00:00:00.000Z",
              markdown,
              contentBlocks: [{ type: "text", text: markdown }],
              images: [
                {
                  imageId: "image-1",
                  url: "https://example.org/diagram.png",
                  alt: "Diagram",
                  cachedUrl: `postrove-image://${imageId}`,
                },
              ],
              completeness: "complete",
              completenessNote: "",
            },
          },
        ],
      },
    };
    const publisher = new ResultPublisher(
      join(root, "results"),
      join(root, "images"),
    );
    const path = await publisher.publishReading(detail);
    assert.match(
      await readFile(path!, "utf8"),
      new RegExp(`!\\[Diagram\\]\\(<assets/${imageId}\\.png>\\)`),
    );
    assert.match(
      await readFile(
        join(root, "results/reading", runId, "sources/material-1.md"),
        "utf8",
      ),
      new RegExp(`\\(<../assets/${imageId}\\.png>\\)`),
    );
    assert.match(
      await readFile(join(root, "results/reading/latest.md"), "utf8"),
      new RegExp(`\\(<${runId}/assets/${imageId}\\.png>\\)`),
    );
    assert.equal(
      await readFile(
        join(root, "results/reading", runId, "assets", imageId + ".png"),
        "utf8",
      ),
      "captured image bytes",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("profile migration retains old business records, language experts, results and credential boundaries", async () => {
  const root = await mkdtemp(join(tmpdir(), "postrove-preserve-rule-"));
  const source = join(root, "source");
  try {
    await mkdir(join(source, "results/search/run/sources"), {
      recursive: true,
    });
    await writeFile(
      join(source, "results/search/run/result.md"),
      "Saved result",
    );
    await writeFile(
      join(source, "preferences.json"),
      JSON.stringify({ language: "en" }),
    );
    await writeFile(
      join(source, "focus-search.json"),
      JSON.stringify({
        version: 1,
        reports: [],
        follows: [
          {
            followId: randomUUID(),
            name: "Saved schedule",
            question: "Saved question",
            platforms: ["x"],
            period: "month",
            schedule: { cadence: "daily", time: "09:00" },
            paused: true,
            revision: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            nextRunAt: new Date().toISOString(),
          },
        ],
      }),
    );
    await writeFile(
      join(source, "model-connection.json"),
      JSON.stringify({ secret: "fictional" }),
    );
    const members = new AdvisorStore(join(source, "advisors.json"));
    await members.open(["x-grok-en"]);
    await members.save({ enabled: ["x-grok-zh", "x-grok-en"] });
    await prepareProfile(join(root, "copy"), source);
    const copied = new FocusSearchStore(join(root, "copy/focus-search.json"));
    await copied.open();
    assert.deepEqual(copied.snapshot().follows[0].advisorIds, ["x-grok-en"]);
    assert.equal(copied.snapshot().follows[0].period, "month");
    assert.equal(
      await readFile(join(root, "copy/results/search/run/result.md"), "utf8"),
      "Saved result",
    );
    assert.equal(
      JSON.parse(await readFile(join(root, "copy/preferences.json"), "utf8"))
        .language,
      "en",
    );
    await assert.rejects(readFile(join(root, "copy/model-connection.json")), {
      code: "ENOENT",
    });
    await symlink(join(root, "copy"), join(source, "results/escape"));
    await assert.rejects(
      prepareProfile(join(root, "unsafe"), source),
      /regular/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
