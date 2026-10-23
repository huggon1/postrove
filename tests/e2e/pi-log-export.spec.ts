import { test, expect, _electron as electron } from "@playwright/test";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
  utimes,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

// Failures: a single-file export loses sessions, depends on source files,
// breaks native interactions, or lets a native page change the index.
test("task logs export as one offline HTML with an index and native session navigation", async ({}, info) => {
  const root = await mkdtemp(join(tmpdir(), "postrove-html-export-"));
  const profile = join(root, "profile");
  const taskId = randomUUID();
  const executionId = randomUUID();
  const legacy = join(profile, "browser-traces", taskId, "html");
  const execution = join(
    profile,
    "browser-traces",
    taskId,
    "executions",
    executionId,
    "html",
  );
  await mkdir(legacy, { recursive: true });
  await mkdir(execution, { recursive: true });
  await writeFile(
    join(profile, "business-generation.json"),
    JSON.stringify({ generation: "search-follow-v1", state: "committed" }),
  );
  const timestamp = "2026-01-01T12:00:00.000Z";
  const taskTitle = "查找本地优先的阅读工具";
  await writeFile(
    join(profile, "tasks.json"),
    JSON.stringify({
      version: 1,
      tasks: [
        {
          taskId,
          label: taskTitle,
          kind: "focus_search",
          target: { kind: "none" },
          state: "completed",
          phase: "completed",
          progress: { completed: 1 },
          createdAt: timestamp,
          updatedAt: timestamp,
          finishedAt: timestamp,
        },
      ],
      activities: [],
    }),
  );
  const messages = [
    {
      role: "user",
      content: "Fictional request · 中文 🦊",
      timestamp: Date.parse(timestamp),
    },
    {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "Fictional reasoning detail" },
        { type: "text", text: "Fictional response" },
        {
          type: "toolCall",
          id: "call1",
          name: "read",
          arguments: { path: "fictional.txt" },
        },
      ],
      stopReason: "toolUse",
      timestamp: Date.parse(timestamp),
    },
    {
      role: "toolResult",
      toolCallId: "call1",
      toolName: "read",
      content: [{ type: "text", text: "Fictional tool result" }],
      isError: false,
      timestamp: Date.parse(timestamp),
    },
  ];
  const source = join(root, "fixture.jsonl");
  await writeFile(
    source,
    [
      {
        type: "session",
        version: 3,
        id: executionId,
        timestamp,
        cwd: "/fictional",
      },
      {
        type: "custom",
        id: "execution",
        parentId: null,
        timestamp,
        customType: "postrove-execution",
        data: {
          taskId,
          stage: "prepare_reading",
          targetLanguage: "zh-CN",
          materialTitle: "本地优先阅读工具的设计",
          chunkIndex: 0,
          attempt: 2,
        },
      },
      ...messages.map((message, index) => ({
        type: "message",
        id: `message${index}`,
        parentId: index ? `message${index - 1}` : "execution",
        timestamp,
        message,
      })),
    ]
      .map((entry) => JSON.stringify(entry))
      .join("\n") + "\n",
  );
  const { exportFromFile } = await import(
    new URL(
      "./core/export-html/index.js",
      import.meta.resolve("@earendil-works/pi-coding-agent"),
    ).href
  );
  await exportFromFile(source, { outputPath: join(legacy, "attempt-1.html") });
  const native = await readFile(join(legacy, "attempt-1.html"), "utf8");
  await writeFile(join(execution, "session.html"), native);
  const isolated =
    '<!DOCTYPE html><html><body><p id="isolation">pending</p><script>try { parent.document.querySelector("h1").textContent = "changed"; } catch { document.getElementById("isolation").textContent = "Parent access blocked"; }</script></body></html>';
  await writeFile(join(execution, "attempt-2.html"), isolated);
  for (const [index, file] of [
    join(legacy, "attempt-1.html"),
    join(execution, "session.html"),
    join(execution, "attempt-2.html"),
  ].entries()) {
    const time = new Date(Date.parse(timestamp) + index * 1000);
    await utimes(file, time, time);
  }
  const destination = info.outputPath("export", "task-logs.html");
  await mkdir(join(destination, ".."), { recursive: true });
  const app = await electron.launch({
    args: ["."],
    env: {
      ...process.env,
      POSTROVE_RUN_MODE: "test",
      POSTROVE_TEST_DATA: profile,
      POSTROVE_EVAL_DENY_KEYCHAIN: "1",
    },
  });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ dialog }) => {
      dialog.showSaveDialog = (async () => ({ canceled: true })) as any;
    });
    const canceled = await page.evaluate(
      (id) => window.postrove.exportTaskPiLogs(id),
      taskId,
    );
    expect(canceled).toEqual({ ok: true, value: undefined });
    expect(await readdir(join(destination, ".."))).toEqual([]);
    await app.evaluate(({ dialog, shell }, file) => {
      dialog.showSaveDialog = (async () => ({
        canceled: false,
        filePath: file,
      })) as any;
      shell.openPath = async (path) => {
        (globalThis as any).openedLogPath = path;
        return "";
      };
    }, destination);
    const exported = await page.evaluate(
      (id) => window.postrove.exportTaskPiLogs(id),
      taskId,
    );
    expect(exported).toEqual({ ok: true, value: destination });
    expect(await app.evaluate(() => (globalThis as any).openedLogPath)).toBe(
      destination,
    );
    expect(await readdir(join(destination, ".."))).toEqual(["task-logs.html"]);
    const html = await readFile(destination, "utf8");
    const manifest = JSON.parse(
      /<script id="pi-log-data" type="application\/json">([\s\S]*?)<\/script>/.exec(
        html,
      )![1],
    );
    expect(manifest.taskId).toBe(taskId);
    expect(manifest.task.title).toBe(taskTitle);
    expect(manifest.sessions[0].label).toBe("生成阅读版本 · 第 1 段");
    expect(manifest.sessions[0].details.targetLanguage).toBe("zh-CN");
    expect(manifest.sessions[0].details.attempt).toBe(2);
    expect(
      manifest.sessions.map((session: any) =>
        Buffer.from(session.html, "base64").toString("utf8"),
      ),
    ).toEqual([native, native, isolated]);
    await rm(join(profile, "browser-traces"), { recursive: true });
    expect(
      (
        await page.evaluate(
          (id) => window.postrove.exportTaskPiLogs(id),
          taskId,
        )
      ).ok,
    ).toBe(false);
    const [preview] = await Promise.all([
      app.waitForEvent("window"),
      app.evaluate(async ({ BrowserWindow }, file) => {
        const window = new BrowserWindow({
          show: false,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
          },
        });
        await window.loadFile(file);
      }, destination),
    ]);
    await preview.context().setOffline(true);
    await expect(
      preview.getByRole("heading", { name: taskTitle, exact: true }),
    ).toBeVisible();
    await expect(preview.locator(".session-link")).toHaveCount(3);
    await preview.screenshot({ path: info.outputPath("log-index.png") });
    await preview.locator(".session-link").first().click();
    await expect(
      preview.getByRole("button", { name: "上一段" }),
    ).toBeDisabled();
    const frame = preview.frameLocator("iframe");
    await expect(frame.locator("body")).toHaveCSS(
      "background-color",
      "rgb(255, 255, 255)",
    );
    await expect(frame.locator(".header h1")).toHaveText(
      "生成阅读版本 · 第 1 段",
    );
    await expect(frame.locator("#messages")).toContainText(
      "Fictional request · 中文 🦊",
    );
    await expect(frame.locator("#messages")).toContainText(
      "Fictional tool result",
    );
    await frame
      .getByRole("button", { name: "Toggle thinking", exact: true })
      .click();
    await expect(frame.locator(".thinking-text")).toBeHidden();
    await frame
      .getByRole("button", { name: "Toggle thinking", exact: true })
      .click();
    await expect(frame.locator(".thinking-text")).toBeVisible();
    await frame.locator("#tree-search").fill("request");
    await expect(frame.locator("#tree-container")).toContainText(
      "Fictional request",
    );
    await preview.screenshot({ path: info.outputPath("native-session.png") });
    await preview.getByRole("button", { name: "下一段" }).click();
    await expect(preview.getByLabel("切换会话")).toHaveValue("1");
    await expect(frame.locator("#messages")).toContainText(
      "Fictional response",
    );
    await preview.getByRole("button", { name: "上一段" }).click();
    await expect(preview.getByLabel("切换会话")).toHaveValue("0");
    await preview.getByLabel("切换会话").selectOption("2");
    await expect(frame.getByText("Parent access blocked")).toBeVisible();
    await expect(
      preview.getByRole("button", { name: "下一段" }),
    ).toBeDisabled();
    await preview.getByRole("link", { name: "执行目录" }).click();
    await expect(
      preview.getByRole("heading", { name: taskTitle, exact: true }),
    ).toBeVisible();
    await expect(preview.locator(".session-link").nth(2)).toBeFocused();
    await preview.setViewportSize({ width: 390, height: 844 });
    await preview.screenshot({ path: info.outputPath("log-index-narrow.png") });
    expect(
      await preview.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await preview.goto(`${preview.url().split("#")[0]}#session-2`);
    await expect(preview.getByLabel("切换会话")).toHaveValue("1");
    await expect(frame.locator("#messages")).toContainText(
      "Fictional response",
    );
    expect(
      await preview.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    await preview.screenshot({
      path: info.outputPath("native-session-narrow.png"),
    });
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
