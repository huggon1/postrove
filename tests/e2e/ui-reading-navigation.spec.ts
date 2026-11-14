import { test, expect } from "@playwright/test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { savedReading } from "../fixtures/saved-reading";
import { launchChineseApplication } from "../support/application";
import { forwardingStateSchema } from "../../src/main/services/forwarding/store";
import { readFileSync } from "node:fs";
const catalog = JSON.parse(
  readFileSync(join(process.cwd(), "src/renderer/i18n/en.json"), "utf8"),
) as Record<string, string>;
import { searchStateSchema } from "../../src/shared/focus-search-contracts";

// Production renderer, IPC reads, stores, and keyboard controls use fictional records.
// Recovery probes control action replies, phase/status snapshots, image responses,
// and delayed image sizing; external account and service acceptance stays separate.
for (const language of ["zh-CN", "en"] as const) {
  test(`reading and topic recovery keep navigation and feedback local in ${language}`, async ({}, info) => {
    test.setTimeout(120_000);
    const profile = await mkdtemp(join(tmpdir(), "postrove-ui-reading-"));
    const english = language === "en";
    const label = (zh: string, en: string) => (english ? en : zh);
    const reading = savedReading();
    const task = reading.tasks[0];
    const body = Array.from(
      { length: 45 },
      (_, i) =>
        `## Section ${i}\n\nFictional saved paragraph ${i}. Read and compare the retained material.`,
    ).join("\n\n");
    const main = task.materials![0];
    main.source!.images = [];
    main.source!.markdown = body;
    main.source!.contentBlocks = [{ type: "text", text: body }];
    main.chunks = [
      { index: 0, original: body, translated: body, complete: true },
    ];
    const reference = structuredClone(main);
    reference.id = "reference";
    reference.role = "reference";
    reference.url = "https://example.com/reference";
    reference.source!.sourceUrl = reference.url;
    reference.title = "Reference fixture";
    task.materials = [main, reference];
    task.report!.materials = task.materials!;
    task.source = main.source;
    task.report!.source = main.source!;
    task.state = "failed";
    task.phase = "已保存";
    const now = "2026-11-10T00:00:00.000Z";
    const sourceUrl = "https://x.com/fictional/status/123456789";
    const topic = {
      reportId: randomUUID(),
      taskId: randomUUID(),
      question: "Source comparison fixture",
      createdAt: now,
      finishedAt: now,
      status: "partial",
      taskOutcome: "failed",
      period: "all",
      platforms: ["x"],
      submissions: [],
      sections: ["en", "zh-CN"].map((promptLanguage) => ({
        sectionId: randomUUID(),
        runId: randomUUID(),
        platform: "x",
        advisorId: promptLanguage === "en" ? "x-grok-en" : "x-grok-zh",
        connectionId: "x-grok",
        routeId: "x-grok",
        promptLanguage,
        prompt: "Source comparison fixture",
        state: "completed",
        finishedAt: now,
        rawReply: body,
        readingReply: body,
        citationExtraction: { state: "completed" },
        candidates: [
          {
            candidateId: randomUUID(),
            postKey: "x:123456789",
            url: sourceUrl,
            title: "Shared source",
            description: "Fictional source",
          },
        ],
      })),
    };
    (topic.sections[1] as any).processingIssue =
      "Fictional reading preparation failed";
    const failed = structuredClone(topic);
    failed.reportId = randomUUID();
    failed.taskId = randomUUID();
    failed.question = "Failed topic fixture";
    failed.status = "failed";
    failed.sections.forEach((section) => {
      section.state = "failed";
      section.rawReply = "";
      section.readingReply = "";
      section.candidates = [];
    });
    await writeFile(
      join(profile, "preferences.json"),
      JSON.stringify({ language }),
    );
    await writeFile(join(profile, "forwarding.json"), JSON.stringify(reading));
    await writeFile(
      join(profile, "focus-search.json"),
      JSON.stringify(
        searchStateSchema.parse({
          version: 1,
          reports: [topic, failed],
          follows: [],
        }),
      ),
    );
    await writeFile(
      join(profile, "advisors.json"),
      JSON.stringify({ version: 1, enabled: ["x-grok-en", "x-grok-zh"] }),
    );
    const app = await launchChineseApplication({
      args: ["."],
      env: {
        ...process.env,
        POSTROVE_RUN_MODE: "test",
        POSTROVE_TEST_DATA: profile,
      },
    });
    try {
      const page = await app.firstWindow();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await app.evaluate(({ ipcMain, shell }) => {
        (globalThis as any).openedSource = "";
        shell.openExternal = async (url) => {
          (globalThis as any).openedSource = url;
        };
        ipcMain.removeHandler("search:add");
        ipcMain.handle("search:add", async () => ({
          ok: false,
          message: "收取失败，请重试",
        }));
      });
      await page
        .getByRole("button", { name: label("阅读", "Reading"), exact: true })
        .click();
      const query = page.getByRole("textbox", {
        name: label("搜索阅读内容", "Search your reading"),
        exact: true,
      });
      await query.fill("Retained");
      await page
        .getByRole("button", { name: label("话题", "Topics"), exact: true })
        .click();
      await page
        .getByRole("button", { name: label("阅读", "Reading"), exact: true })
        .click();
      await expect(query).toHaveValue("Retained");
      await page
        .getByRole("button", { name: "Retained reading", exact: true })
        .click();
      let reader = page.getByRole("dialog", {
        name: label("阅读内容", "Reading"),
        exact: true,
      });
      const scroll = reader.locator(".reader-scroll");
      await expect(
        reader.getByRole("button", {
          name: label("重试", "Retry"),
          exact: true,
        }),
      ).toBeVisible();
      const selector = reader.getByRole("combobox", {
        name: label("材料", "Material"),
        exact: true,
      });
      // Switch before the browser delivers its queued scroll event.
      await selector.evaluate((element: HTMLSelectElement) => {
        const content = element
          .closest(".reader-modal")!
          .querySelector(".reader-scroll")!;
        content.scrollTop = 1200;
        element.value = "reference";
        element.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBe(0);
      await scroll.evaluate((el) => {
        el.scrollTop = 800;
      });
      await selector.selectOption("main");
      await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBe(1200);
      await expect(selector).toBeInViewport();
      await expect(
        reader.getByRole("button", {
          name: label("处理状态", "Processing status"),
          exact: true,
        }),
      ).toBeInViewport();
      await reader
        .getByRole("button", {
          name: label("处理状态", "Processing status"),
          exact: true,
        })
        .click();
      await expect(reader.locator(".reader-receipt")).toContainText(
        label("已保存", "Saved"),
      );
      if (english)
        expect(await reader.locator(".reader-receipt").innerText()).not.toMatch(
          /[\u4e00-\u9fff]/u,
        );
      await app.evaluate(({ ipcMain }) => {
        const handlers = (ipcMain as any)._invokeHandlers as Map<
          string,
          (...args: any[]) => Promise<any>
        >;
        const original = handlers.get("forwarding:tasks")!;
        handlers.set("forwarding:tasks", async (...args: any[]) => {
          const reply = await original(...args);
          if (reply.ok)
            reply.value = reply.value.map((value: any) => ({
              ...value,
              phase: (globalThis as any).reviewPhase ?? value.phase,
            }));
          return reply;
        });
      });
      for (const phase of forwardingStateSchema.shape.tasks.element.shape.phase
        .options) {
        await app.evaluate(({ BrowserWindow }, phase) => {
          (globalThis as any).reviewPhase = phase;
          BrowserWindow.getAllWindows()[0].webContents.send("postrove:changed");
        }, phase);
        await expect(reader.locator(".reader-receipt")).toContainText(
          english ? (catalog as Record<string, string>)[phase] : phase,
        );
      }

      await reader
        .getByRole("button", { name: label("关闭", "Close"), exact: true })
        .click();
      await page
        .getByRole("button", { name: "Retained reading", exact: true })
        .click();
      await expect.poll(() => scroll.evaluate((el) => el.scrollTop)).toBe(1200);
      await page.screenshot({
        path: info.outputPath(`${language}-reader-position.png`),
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await page
        .getByRole("button", {
          name: label("清除搜索", "Clear search"),
          exact: true,
        })
        .click();
      await expect(query).toHaveValue("");
      await page
        .getByRole("button", { name: label("话题", "Topics"), exact: true })
        .click();
      await page
        .locator(".topic-content")
        .filter({ hasText: topic.question })
        .click();
      const thread = page.getByRole("dialog", {
        name: label("话题详情", "Topic"),
        exact: true,
      });
      const jump = thread.getByRole("navigation", {
        name: label("成员回复", "Member replies"),
        exact: true,
      });
      await jump.getByRole("button").last().click();
      await expect(thread.locator(".full-reply").last()).toBeFocused();
      await expect
        .poll(() =>
          thread.locator(".thread-scroll").evaluate((el) => el.scrollTop),
        )
        .toBeGreaterThan(2000);
      await thread
        .getByRole("button", {
          name: label("选择来源", "Select sources"),
          exact: true,
        })
        .click();
      const choices = thread.getByRole("checkbox");
      await choices.first().check();
      await expect(choices.last()).toBeChecked();
      await expect(thread.locator(".selection-bar")).toContainText(
        label("已选 1 个来源", "1 sources selected"),
      );
      const source = thread.locator(".source-entry").first();
      await source
        .getByRole("button", { name: label("收取", "Collect"), exact: true })
        .click();
      await expect(source.getByRole("alert")).toBeInViewport();
      await expect(source.getByRole("alert")).toContainText(
        label("收取失败，请重试", "Collection failed. Try again."),
      );
      await thread
        .getByRole("button", {
          name: label("收取所选", "Collect selected"),
          exact: true,
        })
        .click();
      await expect(
        thread.locator(".selection-bar").getByRole("alert"),
      ).toBeInViewport();
      await source.locator(".source-title").click();
      await expect
        .poll(() => app.evaluate(() => (globalThis as any).openedSource))
        .toBe(sourceUrl);
      await thread.locator(".thread-scroll").evaluate((el) => {
        el.scrollTop = el.scrollHeight;
      });
      await expect(thread.locator(".thread-end")).toHaveAttribute(
        "data-status",
        "partial",
      );
      await expect(thread.locator(".thread-end")).toContainText(
        label("部分完成", "Partially completed"),
      );
      await page.screenshot({
        path: info.outputPath(`${language}-topic-partial.png`),
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await page
        .getByRole("textbox", {
          name: label("话题内容", "Topic message"),
          exact: true,
        })
        .fill("Keep this topic draft");
      await page
        .locator(".topic-content")
        .filter({ hasText: failed.question })
        .click();
      await expect(thread.locator(".thread-end")).toHaveAttribute(
        "data-status",
        "failed",
      );
      await thread
        .getByRole("button", {
          name: label("再次提问", "Ask again"),
          exact: true,
        })
        .click();
      const replaceDraft = page.getByRole("dialog", {
        name: label("替换现有草稿", "Replace current draft"),
        exact: true,
      });
      await expect(replaceDraft).toContainText(failed.question);
      await page.screenshot({
        path: info.outputPath(`${language}-replace-draft.png`),
        animations: "disabled",
      });
      await replaceDraft
        .getByRole("button", {
          name: label("保留草稿", "Keep draft"),
          exact: true,
        })
        .click();
      await expect(thread).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("textbox", {
          name: label("话题内容", "Topic message"),
          exact: true,
        }),
      ).toHaveValue("Keep this topic draft");
      await page
        .locator(".topic-content")
        .filter({ hasText: failed.question })
        .click();
      await thread
        .getByRole("button", {
          name: label("再次提问", "Ask again"),
          exact: true,
        })
        .click();
      await replaceDraft
        .getByRole("button", {
          name: label("替换草稿", "Replace draft"),
          exact: true,
        })
        .click();
      const composer = page.getByRole("textbox", {
        name: label("话题内容", "Topic message"),
        exact: true,
      });
      await expect(composer).toHaveValue(failed.question);
      await expect(composer).toBeFocused();
      await expect(
        page
          .getByRole("region", {
            name: label("发起话题", "Start a topic"),
            exact: true,
          })
          .locator(".member-chip.selected"),
      ).toHaveCount(2);
      await app.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler("search:start");
        ipcMain.handle(
          "search:start",
          () =>
            new Promise((resolve) => {
              (globalThis as any).finishQuestion = resolve;
            }),
        );
      });
      await composer.fill("Retain the admitted question while pending");
      await page
        .getByRole("button", { name: label("发送", "Send"), exact: true })
        .click();
      await expect(composer).toBeDisabled();
      await page
        .locator(".topic-content")
        .filter({ hasText: failed.question })
        .click();
      await expect(
        thread.getByRole("button", {
          name: label("再次提问", "Ask again"),
          exact: true,
        }),
      ).toBeDisabled();
      await page.keyboard.press("Escape");
      await app.evaluate(() =>
        (globalThis as any).finishQuestion({
          ok: false,
          message: "操作未完成，请重试",
        }),
      );
      await expect(composer).toBeEnabled();
      await expect(composer).toHaveValue(
        "Retain the admitted question while pending",
      );
      for (const width of [1100, 390]) {
        await page.setViewportSize({ width, height: 760 });
        await page
          .getByRole("button", { name: label("阅读", "Reading"), exact: true })
          .click();
        await page
          .getByRole("button", { name: "Retained reading", exact: true })
          .click();
        await expect(reader.getByRole("combobox")).toBeInViewport();
        expect(
          await reader.evaluate((el) => el.scrollWidth - el.clientWidth),
        ).toBeLessThanOrEqual(1);
        await page.screenshot({
          path: info.outputPath(`${language}-${width}-reader.png`),
          animations: "disabled",
        });
        await page.keyboard.press("Escape");
      }
      await page
        .getByRole("button", { name: label("话题", "Topics"), exact: true })
        .click();
      const linkQuestion = page.getByRole("textbox", {
        name: label("话题内容", "Topic message"),
        exact: true,
      });
      await linkQuestion.fill("https://example.com/audit-link");
      const composerRegion = page.getByRole("region", {
        name: label("发起话题", "Start a topic"),
        exact: true,
      });
      await composerRegion
        .getByRole("button", {
          name: label("添加链接", "Add a link"),
          exact: true,
        })
        .click();
      await page.keyboard.press("Escape");
      await expect(linkQuestion).toHaveValue("https://example.com/audit-link");
      await composerRegion
        .getByRole("button", {
          name: label("添加链接", "Add a link"),
          exact: true,
        })
        .click();
      await app.evaluate(({ ipcMain }) => {
        ipcMain.removeHandler("forwarding:add");
        ipcMain.handle(
          "forwarding:add",
          () =>
            new Promise((resolve) => {
              (globalThis as any).finishLink = resolve;
            }),
        );
      });
      const linkDialog = page.getByRole("dialog", {
        name: label("添加链接", "Add a link"),
        exact: true,
      });
      await linkDialog
        .getByRole("button", {
          name: label("加入阅读", "Add to reading"),
          exact: true,
        })
        .click();
      await expect(
        linkDialog.getByRole("button", {
          name: label("关闭", "Close"),
          exact: true,
        }),
      ).toBeDisabled();
      await page.keyboard.press("Escape");
      await expect(linkDialog).toBeVisible();
      await app.evaluate(
        ({}, taskId) =>
          (globalThis as any).finishLink({ ok: true, value: taskId }),
        randomUUID(),
      );
      await expect(linkDialog).toHaveCount(0);
      await page
        .getByRole("button", { name: label("话题", "Topics"), exact: true })
        .click();
      await expect(linkQuestion).toHaveValue("");
      await linkQuestion.fill("Retain an independent question draft");
      await page
        .getByRole("button", { name: label("阅读", "Reading"), exact: true })
        .click();
      await page
        .getByRole("button", {
          name: label("添加链接", "Add a link"),
          exact: true,
        })
        .click();
      await linkDialog
        .getByRole("textbox", { name: label("链接", "Link"), exact: true })
        .fill("https://example.com/other-link");
      await app.evaluate(({ ipcMain }, taskId) => {
        ipcMain.removeHandler("forwarding:add");
        ipcMain.handle("forwarding:add", async () => ({
          ok: true,
          value: taskId,
        }));
      }, randomUUID());
      await linkDialog
        .getByRole("button", {
          name: label("加入阅读", "Add to reading"),
          exact: true,
        })
        .click();
      await expect(linkDialog).toHaveCount(0);
      await page
        .getByRole("button", { name: label("话题", "Topics"), exact: true })
        .click();
      await expect(linkQuestion).toHaveValue(
        "Retain an independent question draft",
      );
      await info.attach("copy-admission", {
        body: JSON.stringify({
          reused: [
            "Stop",
            "Retry",
            "Processing status",
            "Original",
            "Reading version",
            "material",
            "terminal state labels",
            "collection failure",
          ],
          requiredControls: {
            "Ask again":
              "Failed, partial, or stopped topic: repopulates a new question and retained enabled recipients",
            "Member replies": "Navigation to an existing member reply",
            "Clear search": "Entered reading query: resets its filter",
            "Replace current draft / Keep draft / Replace draft":
              "Ask again encounters a different nonempty draft: preview and explicitly preserve or replace it",
            "Translating materials / Generating summary":
              "Saved forwarding phase rendered in the selected interface language",
          },
          scope:
            "Fictional saved records with controlled collection failure, phase snapshots, and delayed link-admission replies; real renderer, IPC reads, navigation, scrolling, and focus",
        }),
        contentType: "application/json",
      });
      expect(errors).toEqual([]);
    } finally {
      await app.close();
      await rm(profile, { recursive: true, force: true });
    }
  });
}

test("reader restores a saved offset after delayed image sizing", async ({}, info) => {
  const profile = await mkdtemp(
    join(tmpdir(), "postrove-reader-image-position-"),
  );
  const reading = savedReading();
  const task = reading.tasks[0];
  const material = task.materials![0];
  const url = "https://example.com/audit-scroll-image.svg";
  const body = `![Fictional tall image](${url})\n\n${Array.from({ length: 12 }, (_, i) => `## Section ${i}\n\nFictional retained paragraph after the image.`).join("\n\n")}`;
  material.source!.markdown = body;
  material.source!.images = [];
  material.source!.contentBlocks = [{ type: "text", text: body }];
  material.chunks = [
    { index: 0, original: body, translated: body, complete: true },
  ];
  task.report!.materials = task.materials!;
  task.source = material.source;
  task.report!.source = material.source!;
  await writeFile(join(profile, "forwarding.json"), JSON.stringify(reading));
  const app = await launchChineseApplication({
    args: ["."],
    env: {
      ...process.env,
      POSTROVE_RUN_MODE: "test",
      POSTROVE_TEST_DATA: profile,
    },
  });
  try {
    const page = await app.firstWindow();
    await page.route(url, async (route) => {
      await route.fulfill({
        contentType: "image/svg+xml",
        headers: { "cache-control": "no-store" },
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="6000"><rect width="600" height="6000" fill="#edf3ff"/></svg>',
      });
    });
    await page.getByRole("button", { name: "阅读", exact: true }).click();
    await page
      .getByRole("button", { name: "Retained reading", exact: true })
      .click();
    const reader = page.getByRole("dialog", { name: "阅读内容", exact: true });
    const scroll = reader.locator(".reader-scroll");
    await expect
      .poll(() =>
        reader
          .locator(".markdown img")
          .evaluate((image: HTMLImageElement) => image.complete),
      )
      .toBe(true);
    await scroll.evaluate((element) => {
      element.scrollTop = 5000;
    });
    await expect
      .poll(() => scroll.evaluate((element) => element.scrollTop))
      .toBe(5000);
    await page.keyboard.press("Escape");
    // Defer the image's layout size after reopening. This exercises a late image
    // resize even when Chromium retains its decoded resource in memory.
    const pendingSize = await page.addStyleTag({
      content: ".reader-article .markdown img { height: 0 !important; }",
    });
    await page
      .getByRole("button", { name: "Retained reading", exact: true })
      .click();
    await expect
      .poll(() => scroll.evaluate((element) => element.scrollTop))
      .toBeLessThan(5000);
    await pendingSize.evaluate((style) => (style as HTMLStyleElement).remove());
    await expect
      .poll(() => scroll.evaluate((element) => element.scrollTop))
      .toBe(5000);
    await page.screenshot({
      path: info.outputPath("restored-after-image-load.png"),
      animations: "disabled",
    });
    await scroll.hover();
    await page.mouse.wheel(0, 300);
    await expect
      .poll(() => scroll.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(5000);
  } finally {
    await app.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test("reader shows the latest action failure and drains Stop before enabling Retry", async ({}, info) => {
  const profile = await mkdtemp(
    join(tmpdir(), "postrove-reader-action-feedback-"),
  );
  const reading = savedReading();
  const task = reading.tasks[0];
  const material = task.materials![0];
  material.source!.images = [];
  material.source!.contentBlocks = [{ type: "text", text: "Saved source" }];
  task.source = material.source;
  task.report!.materials = task.materials!;
  task.report!.source = material.source!;
  task.state = "failed";
  await writeFile(
    join(profile, "preferences.json"),
    JSON.stringify({ language: "en" }),
  );
  await writeFile(join(profile, "forwarding.json"), JSON.stringify(reading));
  const app = await launchChineseApplication({
    args: ["."],
    env: {
      ...process.env,
      POSTROVE_RUN_MODE: "test",
      POSTROVE_TEST_DATA: profile,
    },
  });
  try {
    const page = await app.firstWindow();
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("results:copy-path");
      ipcMain.handle("results:copy-path", async () => ({
        ok: false,
        message: "结果文件暂不可用",
      }));
      ipcMain.removeHandler("results:reveal");
      ipcMain.handle("results:reveal", async () => ({
        ok: false,
        message: "操作未完成，请重试",
      }));
      const handlers = (ipcMain as any)._invokeHandlers as Map<
        string,
        (...args: any[]) => Promise<any>
      >;
      const original = handlers.get("forwarding:tasks")!;
      handlers.set("forwarding:tasks", async (...args: any[]) => {
        const reply = await original(...args);
        if (reply.ok)
          reply.value = reply.value.map((value: any) => ({
            ...value,
            state: (globalThis as any).reviewState ?? value.state,
          }));
        return reply;
      });
      ipcMain.removeHandler("forwarding:cancel");
      ipcMain.handle(
        "forwarding:cancel",
        () =>
          new Promise((resolve) => {
            (globalThis as any).finishStop = resolve;
          }),
      );
    });
    await page.getByRole("button", { name: "Reading", exact: true }).click();
    await page
      .getByRole("button", { name: "Retained reading", exact: true })
      .click();
    const reader = page.getByRole("dialog", { name: "Reading", exact: true });
    await reader
      .getByRole("button", { name: "Copy result file path", exact: true })
      .click();
    await expect(reader.getByRole("alert")).toHaveText(
      "Result file is unavailable",
    );
    await reader
      .getByRole("button", { name: "Result file", exact: true })
      .click();
    await expect(reader.getByRole("alert")).toHaveText(
      "Operation incomplete. Please retry",
    );
    await page.screenshot({
      path: info.outputPath("latest-action-error.png"),
      animations: "disabled",
    });
    await app.evaluate(({ BrowserWindow }) => {
      (globalThis as any).reviewState = "running";
      BrowserWindow.getAllWindows()[0].webContents.send("postrove:changed");
    });
    const stop = reader.getByRole("button", { name: "Stop", exact: true });
    await stop.click();
    await expect(stop).toBeDisabled();
    await app.evaluate(({ BrowserWindow }) => {
      (globalThis as any).reviewState = "cancelled";
      BrowserWindow.getAllWindows()[0].webContents.send("postrove:changed");
    });
    const retry = reader.getByRole("button", { name: "Retry", exact: true });
    await expect(retry).toBeDisabled();
    await app.evaluate(() =>
      (globalThis as any).finishStop({ ok: true, value: undefined }),
    );
    await expect(retry).toBeEnabled();
  } finally {
    await app.close();
    await rm(profile, { recursive: true, force: true });
  }
});
