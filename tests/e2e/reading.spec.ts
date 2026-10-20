import sharp from "sharp";
import { test, expect, _electron as electron } from "@playwright/test";
import { createServer } from "node:http";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// Failure cases: references recurse; an attachment failure hides the main text;
// language switches change saved output;
// images lose their position; restart loses saved partial materials.
test("reading preserves materials, partial output, frozen language and restart recovery", async ({}, info) => {
  const root = await mkdtemp(join(tmpdir(), "postrove-reading-"));
  const profile = join(root, "profile");
  await mkdir(profile);
  await writeFile(
    join(profile, "business-generation.json"),
    JSON.stringify({ generation: "search-follow-v1", state: "committed" }),
  );
  const cacheId = "b".repeat(64);
  await mkdir(join(profile, "material-images"));
  await writeFile(
    join(profile, "material-images", cacheId),
    await sharp({
      create: { width: 300, height: 100, channels: 3, background: "#dfe9e3" },
    })
      .png()
      .toBuffer(),
  );
  await writeFile(
    join(profile, "material-images", `${cacheId}.type`),
    "image/png",
  );
  const calls: any[] = [];
  let failed = false;
  let unavailableMain = false;
  const server = createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const input = JSON.parse(raw);
    calls.push({ route: req.url, ...input });
    const source = (url: string, title: string, markdown: string) => ({
      sourceUrl: url,
      platform: "web",
      title,
      sourceIdentity: "Fictional author",
      fetchedAt: new Date().toISOString(),
      markdown,
      contentBlocks: [{ type: "text", text: markdown }],
      images: url.endsWith("/main")
        ? [
            {
              imageId: "diagram",
              url: "https://example.com/diagram.png",
              alt: "Diagram",
              cachedUrl: `postrove-image://${cacheId}`,
            },
          ]
        : [],
      completeness: "complete",
      completenessNote: "Fixture full body",
    });
    let output: any;
    if (req.url === "/collect")
      output = [
        {
          id: "main",
          role: "main",
          url: input.url,
          title: input.url.endsWith("/english")
            ? "English fixture"
            : "Main fixture",
          source: source(
            input.url,
            input.url.endsWith("/english") ? "English fixture" : "Main fixture",
            "# Main\n\nFirst paragraph.\n\n![Diagram](https://example.com/diagram.png)\n\nLast paragraph.\n\n```mermaid\nflowchart TD\nA[Draft] --> B[Saved]\n```\n\n" +
              Array.from(
                { length: 30 },
                (_, i) => `Paragraph ${i + 1} explains the saved draft.`,
              ).join("\n\n"),
          ),
          chunks: [],
          summary: "",
          state: "pending",
        },
        {
          id: "ref-1",
          role: "reference",
          url: "https://example.com/article",
          title: "Linked article",
          source: source(
            "https://example.com/article",
            "Linked article",
            "# Article\n\nAttachment body.",
          ),
          chunks: [],
          summary: "",
          state: "pending",
        },
        {
          id: "ref-2",
          role: "reference",
          url: "https://example.com/unavailable",
          title: "Unavailable attachment",
          chunks: [],
          summary: "",
          state: "failed",
          issue: "来源访问受限",
        },
      ];
    if (
      req.url === "/collect" &&
      input.url.endsWith("/recover") &&
      !unavailableMain
    ) {
      unavailableMain = true;
      output = [
        {
          id: "main",
          role: "main",
          url: input.url,
          title: "Recoverable main",
          chunks: [],
          summary: "",
          state: "failed",
          issue: "来源暂时不可读",
        },
      ];
    }
    if (req.url === "/translate") {
      if (input.language === "en") {
        output = { text: input.text, truncated: false };
      } else if (input.material.id === "ref-1" && !failed) {
        failed = true;
        output = { text: "# 部分文章\n\n已返回的段落。", truncated: true };
      } else
        output = {
          text:
            input.material.id === "main"
              ? "# 主内容\n\n第一段。\n\n![示意图](https://example.com/diagram.png)\n\n最后一段。\n\n```mermaid\nflowchart TD\nA[草稿] --> B[已保存]\n```\n\n" +
                Array.from(
                  { length: 30 },
                  (_, i) => `第 ${i + 1} 段说明已保存的草稿。`,
                ).join("\n\n")
              : "# 文章\n\n附件正文。",
          truncated: false,
        };
    }
    if (req.url === "/summary")
      output =
        input.language === "en"
          ? "This material explains how a draft is saved and includes a flowchart."
          : "这份材料说明了草稿保存流程，并给出了具体操作。";
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(output));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const endpoint = `http://127.0.0.1:${(server.address() as any).port}`;
  await writeFile(
    join(profile, "model-connection.json"),
    JSON.stringify({
      method: "generic_api",
      api: "openai-completions",
      modelId: "fixture",
      apiKey: "fictional",
      baseUrl: endpoint,
    }),
  );
  let app: Awaited<ReturnType<typeof electron.launch>> | undefined;
  const launch = async () => {
    app = await electron.launch({
      args: ["."],
      env: {
        ...process.env,
        POSTROVE_RUN_MODE: "test",
        POSTROVE_TEST_DATA: profile,
        POSTROVE_TEST_WORKERS: resolve("build/test-workers"),
        POSTROVE_TEST_ENDPOINT: endpoint,
      },
    });
    const page = await app.firstWindow();
    await expect(
      page.getByRole("navigation", { name: "主导航" }),
    ).toBeVisible();
    return page;
  };
  try {
    let page = await launch();
    const add = async (url: string) => {
      const reply = await page.evaluate(
        (url) => window.postrove.addLink(url),
        url,
      );
      expect(reply.ok).toBe(true);
      return (reply as any).value as string;
    };
    const saved = async (taskId: string) =>
      JSON.parse(
        await readFile(join(profile, "forwarding.json"), "utf8"),
      ).tasks.find((task: any) => task.taskId === taskId);
    const id = await add("https://example.com/main");
    await expect.poll(async () => (await saved(id)).state).toBe("failed");
    await page
      .getByRole("navigation", { name: "主导航" })
      .getByRole("button", { name: "阅读", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Main fixture", exact: true })
      .click();
    const reader = page.getByRole("dialog", { name: "阅读内容" });
    await expect(
      reader.getByRole("heading", { name: "主内容", exact: true }).first(),
    ).toBeVisible();
    await expect(reader.locator(".markdown")).toContainText("第一段");
    await expect(reader.locator(".markdown img")).toHaveJSProperty(
      "naturalWidth",
      300,
    );
    await expect(reader.locator(".markdown svg")).toBeVisible();
    await reader.getByRole("button", { name: "原文", exact: true }).click();
    await expect(reader.locator(".markdown")).toContainText("First paragraph");
    await reader.getByRole("button", { name: "阅读版本", exact: true }).click();
    await expect(reader.locator(".markdown")).toContainText("第一段");
    const selector = reader.getByRole("combobox", {
      name: "材料",
      exact: true,
    });
    await selector.selectOption("ref-1");
    await expect(reader).toContainText("已返回的段落");
    await selector.selectOption("ref-2");
    await expect(reader).toContainText("来源访问受限");
    await page.screenshot({
      path: info.outputPath("partial-material-reader.png"),
    });
    await reader.getByRole("button", { name: "关闭", exact: true }).click();
    await page.evaluate(() => window.postrove.saveReadingLanguage("en"));
    const english = await add("https://example.com/english");
    await expect.poll(async () => (await saved(english)).state).toBe("failed");
    expect((await saved(id)).outputLanguage).toBe("zh-CN");
    expect((await saved(english)).outputLanguage).toBe("en");
    const before = JSON.stringify((await saved(id)).materials);
    await app!.close();
    page = await launch();
    expect(JSON.stringify((await saved(id)).materials)).toBe(before);
    await page
      .getByRole("navigation", { name: "主导航" })
      .getByRole("button", { name: "阅读", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Main fixture", exact: true })
      .click();
    await expect(page.getByRole("dialog", { name: "阅读内容" })).toContainText(
      "第一段",
    );
    expect(calls.filter((call) => call.route === "/collect")).toHaveLength(2);
    const resultRoot = join(
      profile,
      "results/reading",
      (await saved(id)).resultId,
    );
    await expect(
      readFile(join(resultRoot, "result.md"), "utf8"),
    ).resolves.toContain("第一段");
  } finally {
    await info.attach("reading-state", {
      body: await readFile(join(profile, "forwarding.json")).catch(() =>
        Buffer.from("{}"),
      ),
      contentType: "application/json",
    });
    await app?.close();
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
    await rm(root, { recursive: true, force: true });
  }
});
