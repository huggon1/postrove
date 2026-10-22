import { launchChineseApplication } from "../support/application";
import { test, expect } from "@playwright/test";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Real Electron, persisted stores, IPC and controlled platform boundary.
// Checks role identity, shared connection, frozen languages, progressive settings,
// partial receipts, source collection, schedules, immutable files and restart.
test("topic workspace connects experts, sends independently, reads and schedules", async ({}, info) => {
  test.setTimeout(120000);
  const root = await mkdtemp(join(tmpdir(), "postrove-topic-"));
  const profile = join(root, "profile");
  await mkdir(join(profile, "platform-browser/shared"), { recursive: true });
  await writeFile(
    join(profile, "advisors.json"),
    JSON.stringify({ version: 1, enabled: [] }),
  );
  await writeFile(
    join(profile, "model-connection.json"),
    JSON.stringify({
      method: "generic_api",
      baseUrl: "http://127.0.0.1:1",
      api: "openai-completions",
      modelId: "fixture",
      apiKey: "fictional",
    }),
  );
  const submitted: any[] = [];
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const input = JSON.parse(raw);
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/search") {
      submitted.push(input);
      if (input.platform === "xiaohongshu") {
        res.writeHead(403);
        res.end("{}");
        return;
      }
      res.end(
        JSON.stringify({
          rawReply:
            input.promptLanguage === "en"
              ? "# Reading habits\n\nUse small queues and keep source links."
              : "# 阅读习惯\n\n保持小队列，保留原帖链接。",
          candidates: [
            {
              candidateId: crypto.randomUUID(),
              postKey: "x:123456789",
              url: "https://x.com/fictional/status/123456789",
              title: "A reader’s workflow",
              description: "Keep a small queue and revisit useful sources.",
            },
          ],
          citationExtraction: { state: "completed" },
        }),
      );
    } else if (req.url === "/collect")
      res.end(
        JSON.stringify([
          {
            id: "main",
            role: "main",
            url: input.url,
            title: "A reader’s workflow",
            chunks: [],
            summary: "",
            state: "pending",
            source: {
              platform: "x",
              sourceUrl: input.url,
              sourceIdentity: "Reader",
              title: "A reader’s workflow",
              fetchedAt: new Date().toISOString(),
              markdown: "# Reading\n\nKeep a small queue.",
              contentBlocks: [
                { type: "text", text: "# Reading\n\nKeep a small queue." },
              ],
              images: [],
              completeness: "complete",
              completenessNote: "",
            },
          },
        ]),
      );
    else if (req.url === "/translate")
      res.end(
        JSON.stringify({
          text: "# 阅读\n\n保持一个小队列。",
          truncated: false,
        }),
      );
    else if (req.url === "/summary")
      res.end(JSON.stringify("作者分享了管理阅读队列的方法。"));
    else {
      res.writeHead(404);
      res.end("{}");
    }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const launch = () =>
    launchChineseApplication({
      args: ["."],
      env: {
        ...process.env,
        POSTROVE_RUN_MODE: "test",
        POSTROVE_TEST_DATA: profile,
        POSTROVE_TEST_WORKERS: resolve("build/test-workers"),
        POSTROVE_TEST_ENDPOINT: `http://127.0.0.1:${(server.address() as any).port}`,
        POSTROVE_EVAL_DENY_KEYCHAIN: "1",
      },
    });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await expect(
      page.getByRole("heading", { name: "话题", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "管理成员", exact: true }).click();
    const members = page.getByRole("dialog", { name: "我的成员", exact: true });
    await expect(
      members.getByRole("switch", { name: "Grok · 中文" }),
    ).toBeDisabled();
    await members
      .getByRole("button", { name: "连接平台", exact: false })
      .first()
      .click();
    await expect(
      members.getByRole("button", { name: "打开登录窗口", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath("member-sign-in.png"),
    });
    await members.getByRole("button", { name: "关闭", exact: true }).click();
    // A platform session is observed through its real status boundary.
    await writeFile(
      join(profile, "platform-browser/shared/postrove-session-status.json"),
      JSON.stringify({
        cookies: [
          { name: "auth_token", domain: ".x.com", expires: -1 },
          { name: "ct0", domain: ".x.com", expires: -1 },
          { name: "web_session", domain: ".xiaohongshu.com", expires: -1 },
        ],
      }),
    );
    await page.getByRole("button", { name: "管理成员", exact: true }).click();
    for (const name of ["Grok · 中文", "Grok · 英文", "点点 · 中文"])
      await members.getByRole("switch", { name }).click();
    await expect(
      members.getByRole("switch", { name: "Grok · 中文" }),
    ).toBeChecked();
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath("shared-language-experts.png"),
    });
    await members.getByRole("switch", { name: "Grok · 英文" }).click();
    const disable = page.getByRole("dialog", { name: "停用专家", exact: true });
    await expect(disable).toHaveCSS("opacity", "1");
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath("member-disable-confirmation.png"),
    });
    await disable
      .getByRole("button", { name: "停用专家", exact: true })
      .click();
    await expect(
      members.getByRole("switch", { name: "Grok · 英文" }),
    ).not.toBeChecked();
    await members.getByRole("switch", { name: "Grok · 英文" }).click();
    await members
      .getByRole("button", { name: "管理配置", exact: true })
      .first()
      .click();
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath("member-shared-connection.png"),
    });
    await members
      .getByRole("button", { name: "退出登录", exact: true })
      .click();
    const logout = page.getByRole("dialog", { name: "退出登录", exact: true });
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath("member-logout-confirmation.png"),
    });
    await logout.getByRole("button", { name: "取消", exact: true }).click();
    await expect(members).toBeVisible();
    await members.getByRole("button", { name: "关闭", exact: true }).click();
    // Recipient selection is deliberate after membership changes.
    for (const name of ["Grok · 中文", "Grok · 英文", "点点 · 中文"])
      await page
        .getByRole("region", { name: "发起话题" })
        .getByRole("button", { name, exact: false })
        .click();
    await page
      .getByRole("textbox", { name: "话题内容" })
      .fill("大家怎样保存有用的阅读内容？");
    await page.getByRole("button", { name: "发送", exact: true }).click();
    const thread = page.getByRole("dialog", { name: "话题详情" });
    await expect(thread).toBeVisible();
    await expect.poll(() => submitted.length).toBe(3);
    await expect(
      thread.getByText("# Reading habits", { exact: false }),
    ).not.toBeVisible();
    await expect(
      thread.getByRole("heading", { name: "Reading habits" }),
    ).toBeVisible();
    await expect(
      thread.getByRole("heading", { name: "阅读习惯" }),
    ).toBeVisible();
    await thread.getByRole("button", { name: "成员回执", exact: true }).click();
    await expect(thread.getByLabel("成员回执", { exact: true })).toContainText(
      "失败",
    );
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath("topic-with-receipts.png"),
    });
    await expect
      .poll(
        async () =>
          JSON.parse(await readFile(join(profile, "focus-search.json"), "utf8"))
            .reports[0]?.status,
      )
      .toBe("partial");
    const stored = JSON.parse(
      await readFile(join(profile, "focus-search.json"), "utf8"),
    ).reports[0];
    expect(
      new Set(stored.sections.map((section: any) => section.runId)).size,
    ).toBe(3);
    expect(stored.sections[0].connectionId).toBe(
      stored.sections[1].connectionId,
    );
    const result = await readFile(
      join(profile, "results/search", stored.taskId, "result.md"),
      "utf8",
    );
    expect(result).toContain("Reading habits");
    expect(result).toContain("阅读习惯");
    await thread.getByRole("button", { name: "收取全部", exact: true }).click();
    await expect
      .poll(
        async () =>
          JSON.parse(await readFile(join(profile, "forwarding.json"), "utf8"))
            .tasks[0]?.state,
      )
      .toBe("completed");
    expect(
      JSON.parse(await readFile(join(profile, "forwarding.json"), "utf8"))
        .tasks,
    ).toHaveLength(1);
    await thread.getByRole("button", { name: "关闭", exact: true }).click();
    await page
      .getByRole("navigation", { name: "主导航" })
      .getByRole("button", { name: "阅读", exact: true })
      .click();
    await page
      .getByRole("button", { name: "A reader’s workflow", exact: true })
      .click();
    const reader = page.getByRole("dialog", { name: "阅读内容" });
    await expect(reader).toContainText("保持一个小队列");
    await reader.getByRole("button", { name: "原文", exact: true }).click();
    await expect(reader).toContainText("Keep a small queue");
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath("reading-original.png"),
    });
    await reader.getByRole("button", { name: "关闭", exact: true }).click();
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await page.getByRole("button", { name: "偏好设置", exact: true }).click();
    await page
      .getByRole("combobox", { name: "阅读语言", exact: true })
      .selectOption("en");
    await expect
      .poll(
        async () =>
          (await page.evaluate(() => window.postrove.preferences()))
            .readingLanguage,
      )
      .toBe("en");
    await page
      .getByRole("navigation", { name: "主导航" })
      .getByRole("button", { name: "定时发送", exact: true })
      .click();
    await page
      .getByRole("button", { name: "新建定时消息", exact: true })
      .click();
    const editor = page.getByRole("dialog", { name: "新建定时消息" });
    await editor
      .getByLabel("消息内容", { exact: true })
      .fill("每周有哪些值得读的长文章？");
    await editor.getByLabel("重复", { exact: true }).selectOption("weekly");
    await editor.getByLabel("发送时间", { exact: true }).fill("08:30");
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath("schedule-weekly-form.png"),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath("schedule-weekly-narrow.png"),
    });
    await page.setViewportSize({ width: 1100, height: 760 });
    await editor.getByRole("button", { name: "保存定时消息" }).click();
    await expect(
      page.getByRole("heading", { name: "每周有哪些值得读的长文章？" }),
    ).toBeVisible();
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath("scheduled-message.png"),
    });
    await page
      .getByRole("navigation", { name: "主导航" })
      .getByRole("button", { name: "话题", exact: true })
      .click();
    await expect(
      page
        .getByRole("navigation", { name: "主导航" })
        .getByRole("button", { name: "话题", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      page.getByRole("heading", { name: "话题", exact: true }),
    ).toBeVisible();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.screenshot({
      path: info.outputPath("topic-desktop.png"),
      animations: "disabled",
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath("topic-compact.png"),
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await expect(
      page.getByRole("button", { name: /^大家怎样保存有用/ }),
    ).toBeVisible();
    expect(
      (await page.evaluate(() => window.postrove.advisorSettings())).ok,
    ).toBe(true);
    expect(
      await readFile(
        join(profile, "results/search", stored.taskId, "result.md"),
        "utf8",
      ),
    ).toBe(result);
  } finally {
    await app.close();
    await new Promise<void>((done) => server.close(() => done()));
    await rm(root, { recursive: true, force: true });
  }
});
