import { test, expect, _electron as electron } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

for (const language of ["zh-CN", "en"] as const) {
  test(`reading copies the current result path in ${language}`, async ({}, info) => {
    const profile = await mkdtemp(join(tmpdir(), "postrove-result-path-"));
    const taskId = randomUUID();
    const materialId = randomUUID();
    const attemptId = randomUUID();
    const url = "https://example.org/reading";
    const now = new Date().toISOString();
    const source = {
      sourceUrl: url,
      platform: "web",
      title: "Saved reading fixture",
      sourceIdentity: "Fictional author",
      fetchedAt: now,
      markdown: "Saved original text.",
      contentBlocks: [{ type: "text", text: "Saved original text." }],
      images: [],
      completeness: "complete",
      completenessNote: "Fixture",
    };
    await writeFile(
      join(profile, "preferences.json"),
      JSON.stringify({ language }),
    );
    await writeFile(
      join(profile, "forwarding.json"),
      JSON.stringify({
        version: 1,
        tasks: [
          {
            taskId,
            resultId: randomUUID(),
            materialId,
            attemptId,
            attemptStartedAt: now,
            target: { sourceUrl: url, entry: "app" },
            state: "failed",
            phase: "解析失败",
            createdAt: now,
            updatedAt: now,
            finishedAt: now,
            outputLanguage: language,
            source,
            materials: [
              {
                id: "main",
                role: "main",
                url,
                title: source.title,
                source,
                state: "completed",
                summary: "Saved introduction.",
                chunks: [
                  {
                    index: 0,
                    original: source.markdown,
                    translated: "Saved reading text.",
                    complete: true,
                  },
                ],
              },
            ],
            activities: [],
          },
        ],
      }),
    );
    const app = await electron.launch({
      args: ["."],
      env: {
        ...process.env,
        POSTROVE_RUN_MODE: "test",
        POSTROVE_TEST_DATA: profile,
      },
    });
    try {
      // Keep the host clipboard and Finder intact while exercising production IPC.
      await app.evaluate(({ clipboard, shell }) => {
        (globalThis as any).copiedResultPath = undefined;
        (globalThis as any).revealedResults = 0;
        clipboard.writeText = async (value) => {
          if ((globalThis as any).failClipboard)
            throw new Error("Clipboard fixture failure");
          (globalThis as any).copiedResultPath = value;
        };
        shell.showItemInFolder = () => {
          (globalThis as any).revealedResults++;
        };
      });
      const page = await app.firstWindow();
      const english = language === "en";
      const copyLabel = english ? "Copy result file path" : "复制结果文件路径";
      const copiedLabel = english ? "Path copied" : "已复制路径";
      await page
        .getByRole("navigation")
        .getByRole("button", {
          name: english ? "Reading" : "阅读",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: source.title, exact: true })
        .click();
      const reader = page.getByRole("dialog");
      const resultPath = join(
        profile,
        "results",
        "reading",
        attemptId,
        "result.md",
      );
      // Recreate the current attempt package when a user has moved its directory.
      await rm(join(profile, "results", "reading", attemptId), {
        recursive: true,
        force: true,
      });
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 900 });
        const copy = reader.getByRole("button", {
          name: copyLabel,
          exact: true,
        });
        await expect(copy).toBeVisible();
        await copy.hover();
        await expect(copy.getByRole("tooltip")).toBeVisible();
        await expect(copy.getByRole("tooltip")).toHaveText(copyLabel);
        const tooltip = await copy.getByRole("tooltip").boundingBox();
        expect(tooltip!.x).toBeGreaterThanOrEqual(0);
        expect(tooltip!.x + tooltip!.width).toBeLessThanOrEqual(width);
        await page.screenshot({
          path: info.outputPath(`${language}-${width}-copy.png`),
          animations: "disabled",
        });
        await copy.click();
        await expect(
          reader.getByRole("button", { name: copiedLabel, exact: true }),
        ).toBeVisible();
        expect(
          await app.evaluate(() => (globalThis as any).copiedResultPath),
        ).toBe(resultPath);
        expect(await readFile(resultPath, "utf8")).toContain(
          "Saved reading text.",
        );
        expect(
          await app.evaluate(() => (globalThis as any).revealedResults),
        ).toBe(0);
        await page.screenshot({
          path: info.outputPath(`${language}-${width}-copied.png`),
          animations: "disabled",
        });
        const bounds = await reader.evaluate((element) => {
          const header = element.querySelector(".modal-header-actions")!;
          return {
            overflow: element.scrollWidth - element.clientWidth,
            right: header.getBoundingClientRect().right,
            viewport: innerWidth,
          };
        });
        expect(bounds.overflow).toBeLessThanOrEqual(1);
        expect(bounds.right).toBeLessThanOrEqual(bounds.viewport);
        await expect(copy).toBeVisible();
      }
      await app.evaluate(() => {
        (globalThis as any).failClipboard = true;
      });
      await reader
        .getByRole("button", { name: copyLabel, exact: true })
        .click();
      await expect(reader.getByRole("alert")).toHaveText(
        english ? "Operation incomplete. Please retry" : "操作未完成，请重试",
      );
      await expect(
        reader.getByRole("button", { name: copiedLabel, exact: true }),
      ).toHaveCount(0);
      await page.screenshot({
        path: info.outputPath(`${language}-390-copy-failed.png`),
        animations: "disabled",
      });
      expect(
        await app.evaluate(() => (globalThis as any).copiedResultPath),
      ).toBe(resultPath);
      await app.evaluate(() => {
        (globalThis as any).failClipboard = false;
      });
      const invalid = await page.evaluate(() =>
        window.postrove.copyResultPath("reading", "invalid"),
      );
      expect(invalid.ok).toBe(false);
      const missing = await page.evaluate(
        (id) => window.postrove.copyResultPath("reading", id),
        randomUUID(),
      );
      expect(missing.ok).toBe(false);
      const removed = await page.evaluate(
        (materialId) =>
          window.postrove.deleteRecord({ kind: "parsed", id: materialId }),
        materialId,
      );
      expect(removed.ok).toBe(true);
      const deleted = await page.evaluate(
        (taskId) => window.postrove.copyResultPath("reading", taskId),
        taskId,
      );
      expect(deleted.ok).toBe(false);
      expect(
        await app.evaluate(() => (globalThis as any).copiedResultPath),
      ).toBe(resultPath);
      await info.attach("copy-admission", {
        body: JSON.stringify(
          [
            {
              message: copyLabel,
              source: "Required operation",
              placement: "Terminal reading header icon label and tooltip",
              trigger: "Current reading attempt has ended",
            },
            {
              message: copiedLabel,
              source: "Required operation",
              placement: "Copy icon label and tooltip with check icon",
              trigger:
                "Main successfully writes the result path to clipboard; resets after two seconds",
            },
            {
              message: english
                ? "Operation incomplete. Please retry"
                : "操作未完成，请重试",
              source: "Existing copy",
              placement: "Existing reading operation error region",
              trigger: "Clipboard write rejects",
            },
          ],
          null,
          2,
        ),
        contentType: "application/json",
      });
    } finally {
      await app.close();
      await rm(profile, { recursive: true, force: true });
    }
  });
}
