import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  buildPiLogDocument,
  readTaskPiLogPages,
  readPiLogSessionDetails,
} from "../../src/main/services/tasks/pi-log-document";

test("log export retains legacy pages, execution pages and failed attempts in update order", async () => {
  const root = await mkdtemp(join(tmpdir(), "postrove-log-export-"));
  try {
    const taskId = randomUUID();
    const runId = randomUUID();
    const executionId = randomUUID();
    const legacy = join(root, "first", taskId, "html");
    const execution = join(
      root,
      "first",
      taskId,
      "executions",
      executionId,
      "html",
    );
    const otherRoot = join(root, "second", taskId, "html");
    const expertRun = join(root, "first", runId, "html");
    for (const directory of [legacy, execution, otherRoot, expertRun])
      await mkdir(directory, { recursive: true });
    const sources = [
      [join(legacy, "attempt-2.html"), "<html>失败尝试</html>"],
      [join(execution, "session.html"), "<html>当前会话 🦊</html>"],
      [join(otherRoot, "session.html"), "<html>另一个根目录</html>"],
      [join(expertRun, "session.html"), "<html>专家执行记录</html>"],
    ];
    for (const [index, [path, content]] of sources.entries()) {
      await writeFile(path, content);
      const timestamp = new Date(Date.UTC(2026, 0, 1, 0, index));
      await utimes(path, timestamp, timestamp);
    }
    await writeFile(join(legacy, "session.jsonl"), "internal source");
    await writeFile(join(legacy, "unrelated.html"), "unrelated");
    await symlink(sources[0][0], join(legacy, "attempt-1.html"));
    const invalid = join(
      root,
      "first",
      taskId,
      "executions",
      "invalid",
      "html",
    );
    await mkdir(invalid, { recursive: true });
    await writeFile(join(invalid, "session.html"), "invalid identity");

    const pages = await readTaskPiLogPages(
      [join(root, "first"), join(root, "second"), join(root, "missing")],
      taskId,
      [runId, runId, taskId],
    );
    assert.deepEqual(
      pages.map((page) => page.file),
      [
        `0-${taskId}-legacy-attempt-2.html`,
        `0-${taskId}-${executionId}-session.html`,
        `1-${taskId}-legacy-session.html`,
        `0-${runId}-legacy-session.html`,
      ],
    );
    assert.deepEqual(
      pages.map((page) => Buffer.from(page.html, "base64").toString("utf8")),
      sources.map(([, html]) => html),
    );
    assert.equal(await readFile(sources[0][0], "utf8"), sources[0][1]);
    assert.deepEqual(
      pages.map((page) => page.runId),
      [taskId, taskId, taskId, runId],
    );
    assert.deepEqual(await readTaskPiLogPages([root], randomUUID()), []);
    await assert.rejects(readTaskPiLogPages([root], "../other-task"));
    await assert.rejects(readTaskPiLogPages([root], taskId, ["../other-run"]));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("single HTML embeds exact native pages and escapes metadata script delimiters", () => {
  const native =
    '<!DOCTYPE html><html><body>中文 🦊<script>const text = "</script>";</script></body></html>';
  const document = {
    taskId: randomUUID(),
    exportedAt: new Date().toISOString(),
    sessions: [
      {
        file: "0-legacy-session.html",
        executionId: "</script><script>window.injected = true</script>",
        updatedAt: new Date().toISOString(),
        html: Buffer.from(native).toString("base64"),
      },
    ],
  };
  const html = buildPiLogDocument(document);
  assert.ok(!html.includes(document.sessions[0].executionId));
  const data =
    /<script id="pi-log-data" type="application\/json">([\s\S]*?)<\/script>/.exec(
      html,
    )![1];
  const decoded = JSON.parse(data);
  assert.deepEqual(decoded, {
    ...document,
    sessions: [{ ...document.sessions[0], label: "执行记录 · 用途待记录" }],
  });
  assert.equal(
    Buffer.from(decoded.sessions[0].html, "base64").toString("utf8"),
    native,
  );
});

test("session names use recorded task, material, segment and attempt evidence", () => {
  const taskId = randomUUID();
  const native = (data: unknown) =>
    `<script id="session-data" type="application/json">${Buffer.from(JSON.stringify(data)).toString("base64")}</script>`;
  const data = {
    header: { id: "fixture-attempt-2", timestamp: "2026-01-01T00:00:00.000Z" },
    entries: [
      {
        type: "custom",
        customType: "postrove-execution",
        data: {
          taskId,
          stage: "translation",
          materialTitle: "Material A",
          chunkIndex: 2,
          repair: true,
          attempt: 2,
        },
      },
      {
        type: "message",
        message: {
          role: "assistant",
          model: "fixture-model",
          diagnostics: [{ type: "postrove_model_failure" }],
        },
      },
    ],
  };
  const details = readPiLogSessionDetails(native(data), taskId);
  assert.equal(details.stage, "translation");
  assert.equal(details.materialTitle, "Material A");
  assert.equal(details.chunkIndex, 2);
  assert.equal(details.attempt, 2);
  assert.equal(details.repair, true);
  assert.equal(details.state, "failed");
  assert.equal(details.namingSource, "recorded");
  assert.equal(
    readPiLogSessionDetails(native(data), randomUUID()).stage,
    undefined,
  );
  assert.deepEqual(
    readPiLogSessionDetails("<html>old document</html>", taskId),
    {},
  );
  const legacy = readPiLogSessionDetails(
    native({
      ...data,
      systemPrompt: "Write a plain reading introduction for this one material.",
      entries: [
        {
          type: "message",
          message: {
            role: "user",
            content: JSON.stringify({ title: "Older material" }),
          },
        },
      ],
    }),
    taskId,
  );
  assert.equal(legacy.stage, "summary");
  assert.equal(legacy.materialTitle, "Older material");
  assert.equal(legacy.namingSource, "legacy");
  assert.equal(legacy.attempt, 2);
});
