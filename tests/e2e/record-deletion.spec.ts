import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, readFile, rm, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:http";

// Failure cases: deletion removes a linked result or follow, undo loses identity,
// restart resurrects a hidden record, active deletion skips Stop confirmation,
// a repeated candidate reuses a deleted output, or invalid IPC changes history.
test("record deletion preserves independent results and persists undo and visibility", async ({}, info) => {
  test.setTimeout(120_000);
  const root = await mkdtemp(join(tmpdir(), "postrove-deletion-"));
  const profile = join(root, "profile");
  await mkdir(profile);
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
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const input = JSON.parse(raw);
    if (req.url === "/search" && input.prompt?.includes("Active deletion"))
      await new Promise((done) => setTimeout(done, 5000));
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/search")
      res.end(
        JSON.stringify({
          rawReply: "Preserved platform answer.",
          citationExtraction: { state: "completed" },
          candidates: [
            {
              candidateId: crypto.randomUUID(),
              postKey: "x:123456789",
              url: "https://x.com/fixture/status/123456789",
              title: "Deletion source",
              description: "Fictional source",
            },
          ],
        }),
      );
    else if (req.url === "/collect")
      res.end(
        JSON.stringify([
          {
            id: "main",
            role: "main",
            url: input.url,
            title: "Deletion source",
            chunks: [],
            summary: "",
            state: "pending",
            source: {
              platform: "x",
              sourceUrl: input.url,
              sourceIdentity: "Fixture",
              title: "Deletion source",
              fetchedAt: new Date().toISOString(),
              markdown: "Source body.",
              contentBlocks: [{ type: "text", text: "Source body." }],
              images: [],
              completeness: "complete",
              completenessNote: "",
            },
          },
        ]),
      );
    else if (req.url === "/translate")
      res.end(JSON.stringify({ text: "已保存的来源正文。", truncated: false }));
    else if (req.url === "/summary") res.end(JSON.stringify("保存的摘要。"));
    else res.end("{}");
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const launch = () =>
    electron.launch({
      args: ["."],
      env: {
        ...process.env,
        POSTROVE_RUN_MODE: "test",
        POSTROVE_TEST_DATA: profile,
        POSTROVE_TEST_WORKERS: resolve("build/test-workers"),
        POSTROVE_TEST_ENDPOINT: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
        POSTROVE_EVAL_DENY_KEYCHAIN: "1",
      },
    });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.evaluate(() =>
      window.postrove.saveAdvisorSettings({ enabled: ["x-grok-en"] }),
    );
    const started = await page.evaluate(() =>
      window.postrove.startFocusSearch({
        question: "Deletion review question",
        platforms: ["x"],
        period: "all",
      }),
    );
    expect(started.ok).toBe(true);
    const reports = async () => {
      const reply = await page.evaluate(() =>
        window.postrove.focusSearchReports(),
      );
      if (!reply.ok) throw new Error("Missing topics");
      return reply.value;
    };
    await expect
      .poll(async () => (await reports())[0]?.status)
      .toBe("completed");
    const report = (await reports())[0];
    const collect = async () =>
      page.evaluate((input) => window.postrove.addSearchCandidates(input), {
        reportId: report.reportId,
        candidateIds: report.sections[0].candidates.map(
          (item) => item.candidateId,
        ),
      });
    expect((await collect()).ok).toBe(true);
    const tasks = async () => {
      const reply = await page.evaluate(() =>
        window.postrove.forwardingTasks(),
      );
      if (!reply.ok) throw new Error("Missing reading");
      return reply.value;
    };
    await expect.poll(async () => (await tasks())[0]?.state).toBe("completed");
    const parsed = (await tasks())[0];
    await page
      .getByRole("navigation", { name: "主导航" })
      .getByRole("button", { name: "阅读", exact: true })
      .click();
    await page.getByRole("button", { name: "删除内容", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Deletion source", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "撤销", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Deletion source", exact: true }),
    ).toBeVisible();
    expect((await tasks())[0].materialId).toBe(parsed.materialId);
    await page.evaluate(
      (id) => window.postrove.deleteRecord({ kind: "task", id }),
      parsed.taskId,
    );
    await expect(
      page.getByRole("button", { name: "Deletion source", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "删除内容", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Deletion source", exact: true }),
    ).toHaveCount(0);
    expect((await collect()).ok).toBe(true);
    await expect.poll(async () => (await tasks())[0]?.state).toBe("completed");
    expect((await tasks())[0].taskId).not.toBe(parsed.taskId);
    await page
      .getByRole("navigation", { name: "主导航" })
      .getByRole("button", { name: "话题", exact: true })
      .click();
    await page
      .getByRole("button", { name: /^Deletion review question/ })
      .click();
    let thread = page.getByRole("dialog", { name: "话题详情" });
    await thread.getByRole("button", { name: "删除话题", exact: true }).click();
    await expect(
      page.getByRole("button", { name: /^Deletion review question/ }),
    ).toHaveCount(0);
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await expect(
      page.getByRole("button", { name: /^Deletion review question/ }),
    ).toHaveCount(0);
    expect((await tasks())[0].state).toBe("completed");
    const invalid = await page.evaluate(() =>
      window.postrove.deleteRecord({ kind: "invalid", id: "bad" } as never),
    );
    expect(invalid.ok).toBe(false);
    await page.evaluate(() =>
      window.postrove.startFocusSearch({
        question: "Active deletion",
        platforms: ["x"],
        period: "all",
      }),
    );
    await page.getByRole("button", { name: /^Active deletion/ }).click();
    thread = page.getByRole("dialog", { name: "话题详情" });
    await thread.getByRole("button", { name: "删除话题", exact: true }).click();
    const confirmation = page.getByRole("dialog", {
      name: "停止并删除",
      exact: true,
    });
    await expect(confirmation).toBeVisible();
    await confirmation
      .getByRole("button", { name: "保留记录", exact: true })
      .click();
    await thread.getByRole("button", { name: "删除话题", exact: true }).click();
    await confirmation
      .getByRole("button", { name: "停止并删除", exact: true })
      .click();
    await expect(confirmation).toBeHidden();
    const journal = await page.evaluate(() =>
      window.postrove.recordDeletions(),
    );
    if (!journal.ok) throw new Error("Missing undo");
    const last = journal.value.at(-1)!;
    await page.evaluate(
      (id) => window.postrove.undoDeletion(id),
      last.operationId,
    );
    await expect
      .poll(
        async () =>
          (await reports()).find((item) => item.question === "Active deletion")
            ?.status,
      )
      .toBe("stopped");
    const deleted = await page.evaluate(
      (ref) => window.postrove.deleteRecord(ref),
      last.records[0],
    );
    if (!deleted.ok || !deleted.value) throw new Error("Missing deletion");
    await page.waitForTimeout(8100);
    expect(
      (
        await page.evaluate(
          (id) => window.postrove.undoDeletion(id),
          deleted.value.operationId,
        )
      ).ok,
    ).toBe(false);
    await page.screenshot({
      path: info.outputPath("retained-reading-after-topic-deletion.png"),
    });
  } finally {
    await app.close();
    if (process.env.POSTROVE_REVIEW_OUTPUT) {
      await cp(profile, process.env.POSTROVE_REVIEW_OUTPUT, {
        recursive: true,
      });
    }
    await new Promise<void>((done) => server.close(() => done()));
    await rm(root, { recursive: true, force: true });
  }
});
