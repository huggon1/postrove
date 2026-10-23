import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { FocusSearchStore } from "../../src/main/storage/focus-search-store";
import { FocusSearchService } from "../../src/main/services/focus-search/service";
import { TaskStore } from "../../src/main/storage/task-store";
import { TaskService } from "../../src/main/services/tasks/task-service";
import { executeContent } from "../../src/worker/content/capabilities";
import { splitMarkdown } from "../../src/worker/content/chunks";
import { runReadingJob } from "../../src/worker/jobs/forwarding/reading";
import { advisors } from "../../src/shared/advisor-contracts";
import type { ContentRequest } from "../../src/shared/content-contracts";
import type {
  FocusSearchReport,
  QuestionPreparation,
  SearchSection,
} from "../../src/shared/focus-search-contracts";
import type { ReadingMaterial } from "../../src/shared/reading-contracts";
import type { ForwardingJobEventContract } from "../../src/worker/jobs/forwarding/contracts";

const question = "我想做一个像素风游戏 最近什么题材比较流行";
const englishQuestion =
  "I want to make a pixel-art game. What genres have been popular recently?";
const badAnswer = "最近比较流行、也很适合像素风表现的题材有：\n\n1. 生存建造";
const reply = (section: SearchSection) => ({
  rawReply: `Original reply from ${section.advisorId}`,
  candidates: [],
  citationExtraction: { state: "completed" as const },
});

async function until(check: () => boolean) {
  for (let n = 0; n < 800 && !check(); n++)
    await new Promise((done) => setTimeout(done, 5));
  assert.ok(check(), "execution reaches the expected state");
}

async function fixture(options: {
  content: (
    input: ContentRequest,
    signal: AbortSignal,
    taskId: string,
  ) => Promise<string>;
  execute?: (section: SearchSection) => Promise<ReturnType<typeof reply>>;
  release?: () => Promise<void>;
}) {
  const root = await mkdtemp(join(tmpdir(), "postrove-translation-rule-"));
  const file = join(root, "focus-search.json");
  const store = new FocusSearchStore(file);
  const tasks = new TaskStore(join(root, "tasks.json"));
  await store.open();
  await tasks.open();
  const service = new FocusSearchService(
    store,
    new TaskService(tasks),
    {} as any,
    async () => ({
      content: options.content,
      execute: options.execute ?? (async (section) => reply(section)),
      release: options.release ?? (async () => {}),
    }),
    () => {},
    { schedulerIntervalMs: 0, language: () => "zh-CN" },
  );
  return {
    service,
    store,
    file,
    cleanup: async () => {
      await service.shutdown();
      await rm(root, { recursive: true, force: true });
    },
  };
}

test("six experts share two saved question versions and process each reply once", async () => {
  const calls: { input: ContentRequest; taskId: string }[] = [];
  const seen: SearchSection[] = [];
  const f = await fixture({
    content: async (input, _signal, taskId) => {
      calls.push({ input, taskId });
      return input.operation === "translate_question"
        ? input.targetLanguage === "en"
          ? englishQuestion
          : question
        : input.text;
    },
    execute: async (section) => {
      const saved = JSON.parse(await readFile(f.file, "utf8")).reports.at(-1);
      assert.equal(
        saved.questionPreparations[section.promptLanguage].state,
        "ready",
      );
      seen.push(structuredClone(section));
      return reply(section);
    },
  });
  try {
    const input = {
      question,
      platforms: ["x", "xiaohongshu", "youtube", "reddit"],
      advisorIds: advisors.map((a) => a.id),
    };
    for (let run = 0; run < 2; run++) {
      const id = await f.service.start(input);
      await until(() => !!f.service.readTask(id).finishedAt);
      const prepared = calls.filter(
        (c) => c.taskId === id && c.input.operation === "translate_question",
      );
      assert.deepEqual(prepared.map((c) => c.input.targetLanguage).sort(), [
        "en",
        "zh-CN",
      ]);
      assert.equal(f.service.readTask(id).question, question);
    }
    assert.equal(seen.length, 12);
    for (const section of seen)
      assert.ok(
        section.prompt.startsWith(
          (section.promptLanguage === "en" ? englishQuestion : question) +
            "\n\n",
        ),
      );
    const englishPrompts = seen.filter((s) => s.promptLanguage === "en");
    assert.match(
      englishPrompts.find((s) => s.platform === "x")!.prompt,
      /X posts/,
    );
    assert.match(
      englishPrompts.find((s) => s.platform === "reddit")!.prompt,
      /Reddit/,
    );
    assert.equal(
      calls.filter((c) => c.input.operation === "prepare_reading").length,
      12,
    );
    assert.ok(!calls.some((c) => c.input.operation === "format_content"));
  } finally {
    await f.cleanup();
  }
});

test("issue question reaches the platform verbatim after one shared same-language repair", async () => {
  let attempts = 0;
  const seen: SearchSection[] = [];
  const f = await fixture({
    content: async (input) =>
      input.operation === "translate_question"
        ? executeContent(input, async () =>
            ++attempts === 1
              ? badAnswer
              : JSON.stringify({
                  sourceLanguage: "zh-CN",
                  question: badAnswer,
                }),
          )
        : input.text,
    execute: async (section) => {
      seen.push(section);
      return reply(section);
    },
  });
  try {
    const id = await f.service.start({
      question,
      platforms: ["xiaohongshu", "x"],
      advisorIds: ["xiaohongshu-diandian-zh", "x-grok-zh"],
    });
    await until(() => !!f.service.readTask(id).finishedAt);
    assert.equal(attempts, 2);
    assert.equal(seen.length, 2);
    assert.equal(
      seen[0].prompt,
      question + "\n\n请基于相关小红书笔记回答，并附原笔记链接。",
    );
    assert.ok(seen.every((s) => !s.prompt.includes(badAnswer)));
  } finally {
    await f.cleanup();
  }
});

test("a failed language shares one correction budget, sends zero questions and leaves the other language usable", async () => {
  let englishAttempts = 0;
  const seen: SearchSection[] = [];
  const f = await fixture({
    content: async (input) => {
      if (input.operation !== "translate_question") return input.text;
      return executeContent(input, async () => {
        if (input.targetLanguage === "en") {
          englishAttempts++;
          return "Here are the most popular game genres.";
        }
        return JSON.stringify({ sourceLanguage: "zh-CN", question });
      });
    },
    execute: async (section) => {
      seen.push(section);
      return reply(section);
    },
  });
  try {
    const id = await f.service.start({
      question,
      platforms: ["x", "reddit", "xiaohongshu"],
      advisorIds: ["x-grok-en", "reddit-ai-en", "xiaohongshu-diandian-zh"],
    });
    await until(() => !!f.service.readTask(id).finishedAt);
    assert.equal(englishAttempts, 2);
    assert.deepEqual(
      seen.map((s) => s.advisorId),
      ["xiaohongshu-diandian-zh"],
    );
    const report = f.service.readTask(id);
    assert.equal(report.questionPreparations?.en?.state, "failed");
    assert.ok(
      report.sections
        .filter((s) => s.promptLanguage === "en")
        .every((s) => s.failureStage === "preparation" && s.state === "failed"),
    );
    assert.equal(report.status, "partial");
  } finally {
    await f.cleanup();
  }
});

test("stopping the first waiter keeps the pending translation for another expert", async () => {
  let calls = 0;
  let signal!: AbortSignal;
  let release!: (question: string) => void;
  const held = new Promise<string>((done) => {
    release = done;
  });
  const seen: string[] = [];
  const f = await fixture({
    content: async (input, sharedSignal) => {
      if (input.operation !== "translate_question") return input.text;
      calls++;
      signal = sharedSignal;
      return held;
    },
    execute: async (section) => {
      seen.push(section.advisorId!);
      return reply(section);
    },
  });
  try {
    const id = await f.service.start({
      question,
      platforms: ["x", "reddit"],
      advisorIds: ["x-grok-en", "reddit-ai-en"],
    });
    await until(() => calls === 1);
    await f.service.cancelSection(
      id,
      f.service.readTask(id).sections[0].sectionId,
    );
    await until(() => f.service.readTask(id).sections[1].state === "running");
    assert.equal(signal.aborted, false);
    release(englishQuestion);
    await until(() => !!f.service.readTask(id).finishedAt);
    assert.equal(calls, 1);
    assert.deepEqual(seen, ["reddit-ai-en"]);
    assert.equal(
      f.service.readTask(id).questionPreparations?.en?.state,
      "ready",
    );
  } finally {
    release(englishQuestion);
    await f.cleanup();
  }
});

for (const scope of ["expert", "topic"] as const)
  test(`stopping the last ${scope} consumer cancels preparation before releasing its lease`, async () => {
    let entered = false,
      aborted = false,
      released = false,
      submitted = false;
    const f = await fixture({
      content: async (_input, signal) => {
        entered = true;
        return new Promise<string>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              aborted = true;
              reject(new Error("cancelled"));
            },
            { once: true },
          );
        });
      },
      execute: async (section) => {
        submitted = true;
        return reply(section);
      },
      release: async () => {
        assert.equal(aborted, true);
        released = true;
      },
    });
    try {
      const id = await f.service.start({
        question,
        platforms: ["x"],
        advisorIds: ["x-grok-en"],
      });
      await until(() => entered);
      if (scope === "topic") await f.service.cancel(id);
      else
        await f.service.cancelSection(
          id,
          f.service.readTask(id).sections[0].sectionId,
        );
      await until(() => released);
      assert.equal(submitted, false);
      assert.equal(f.service.readTask(id).sections[0].cancelled, true);
    } finally {
      await f.cleanup();
    }
  });

for (const saved of ["ready", "failed", "preparing"] as const)
  test(`recovery reuses ${saved} language state and observes submitted conversations`, async () => {
    let preparations = 0;
    const seen: SearchSection[] = [];
    const f = await fixture({
      content: async (input) => {
        if (input.operation !== "translate_question") return input.text;
        preparations++;
        return englishQuestion;
      },
      execute: async (section) => {
        seen.push(section);
        return reply(section);
      },
    });
    try {
      const preparation: QuestionPreparation =
        saved === "ready"
          ? { state: "ready", question: englishQuestion }
          : saved === "failed"
            ? { state: "failed", error: "Question translation check failed" }
            : { state: "preparing" };
      const id = randomUUID();
      const report: FocusSearchReport = {
        reportId: randomUUID(),
        taskId: id,
        question,
        createdAt: new Date().toISOString(),
        outputLanguage: "zh-CN",
        period: "all",
        platforms: ["x", "reddit"],
        submissions: [],
        status: "running",
        questionPreparations: { en: preparation },
        sections: ["x-grok-en", "reddit-ai-en"].map((advisorId, index) => ({
          sectionId: randomUUID(),
          runId: randomUUID(),
          advisorId: advisorId as "x-grok-en" | "reddit-ai-en",
          platform: index ? "reddit" : "x",
          promptLanguage: "en",
          prompt: index ? question : "Already submitted question",
          state: index ? "pending" : "running",
          rawReply: "",
          candidates: [],
          checkpoint: index
            ? { state: "prepared" }
            : {
                state: "submitted",
                conversationUrl: "https://x.com/i/grok/conversation/saved",
              },
        })),
      };
      await f.store.update((state) => {
        state.reports.push(report);
      });
      const reopened = new FocusSearchStore(f.file);
      await reopened.open();
      assert.deepEqual(reopened.snapshot().reports[0].questionPreparations, {
        en: preparation,
      });
      await f.service.recover();
      await until(() => !!f.service.readTask(id).finishedAt);
      assert.equal(seen[0].prompt, "Already submitted question");
      assert.equal(seen[0].checkpoint?.state, "submitted");
      assert.equal(preparations, saved === "preparing" ? 1 : 0);
      assert.equal(seen.length, saved === "failed" ? 1 : 2);
      if (saved !== "failed")
        assert.ok(seen[1].prompt.startsWith(englishQuestion + "\n\n"));
    } finally {
      await f.cleanup();
    }
  });

test("reading preparation translates mixed content as data and repairs changed destinations once", async () => {
  const original =
    "已经是中文的段落。\n\n> What genres are popular?\n\nRead [source](https://example.org/post) and ![image](https://example.org/image.png). Keep `exact_id`.\n\n```sh\nnpm run build\n```";
  const translated = original
    .replace("What genres are popular?", "什么题材比较流行？")
    .replace("Read", "阅读");
  const calls: { text: string; system: string }[] = [];
  const result = await executeContent(
    { operation: "prepare_reading", text: original, targetLanguage: "zh-CN" },
    async (text, system) => {
      calls.push({ text, system });
      return calls.length === 1
        ? translated.replace(
            "https://example.org/post",
            "https://wrong.invalid",
          )
        : translated;
    },
  );
  assert.equal(JSON.parse(calls[0].text).sourceMarkdown, original);
  assert.equal(JSON.parse(calls[1].text).original, original);
  assert.equal(result, translated);
  assert.equal(calls.length, 2);
  await assert.rejects(
    executeContent(
      { operation: "prepare_reading", text: original, targetLanguage: "zh-CN" },
      async () => "A summary without the original links or code.",
    ),
    /preservation/,
  );
});

test("reading resumes saved chunks from the captured version and only retries unfinished content", async () => {
  const url = "https://example.org/article";
  const original =
    "First section " +
    "a".repeat(5000) +
    "\n\nSecond section " +
    "b".repeat(5000);
  const material: ReadingMaterial = {
    id: "main",
    role: "main",
    url,
    title: "Article",
    chunks: [],
    summary: "",
    state: "pending",
    source: {
      platform: "web",
      sourceUrl: url,
      title: "Article",
      markdown: original,
      sourceIdentity: "article",
      fetchedAt: new Date().toISOString(),
      contentBlocks: [],
      images: [],
      completeness: "complete",
      completenessNote: "",
    },
  };
  const command = {
    taskId: randomUUID(),
    resultId: randomUUID(),
    sourceUrl: url,
    outputLanguage: "zh-CN" as const,
    config: {
      method: "generic_api" as const,
      modelId: "fixture",
      baseUrl: "http://127.0.0.1:9/v1",
      api: "openai-completions" as const,
      credential: "fictional",
    },
    resume: { materials: [material] },
  };
  const events: ForwardingJobEventContract[] = [];
  const attempts: number[] = [];
  const deps = {
    collect: async (): Promise<ReadingMaterial[]> => {
      throw new Error("Unexpected source recollection");
    },
    summarize: async () => "文章简介。",
  };
  await runReadingJob(
    command,
    (event) => events.push(event),
    new AbortController().signal,
    {
      ...deps,
      translate: async (_material, _text, index) => {
        attempts.push(index);
        if (index === 1) throw new Error("temporary failure");
        return { text: "第一部分。", truncated: false };
      },
    },
  );
  const partial = events.findLast((e) => e.type === "result");
  assert.ok(partial?.type === "result");
  const saved = partial.draft.materials[0];
  assert.equal(saved.state, "partial");
  assert.equal(saved.chunks[0].complete, true);
  assert.equal(saved.chunks[1].complete, false);
  assert.equal(saved.source?.markdown, original);
  events.length = 0;
  await runReadingJob(
    { ...command, resume: { materials: [saved] } },
    (event) => events.push(event),
    new AbortController().signal,
    {
      ...deps,
      translate: async (_material, text, index) => {
        attempts.push(index);
        assert.equal(text, saved.chunks[1].original);
        return { text: "第二部分。", truncated: false };
      },
    },
  );
  const completed = events.findLast((e) => e.type === "result");
  assert.ok(completed?.type === "result");
  assert.deepEqual(attempts, [0, 1, 1]);
  assert.equal(completed.draft.materials[0].state, "completed");
  assert.equal(completed.draft.materials[0].chunks[0].translated, "第一部分。");
});

test("Markdown chunking retains source bytes, oversized code blocks and paragraph separators", () => {
  const code = "```sh\n" + "npm run build\n".repeat(20) + "```\n\n";
  const original = "\n\nFirst paragraph.\n\n" + code + "Final paragraph.\n";
  const chunks = splitMarkdown(original, 40);
  assert.equal(chunks.join(""), original);
  assert.ok(chunks.every((chunk) => chunk.trim()));
  assert.ok(chunks.includes(code));
});
