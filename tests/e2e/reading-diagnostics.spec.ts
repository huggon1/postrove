import { test, expect, _electron as electron } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readingIssueCodeSchema,
  readingDiagnostic,
} from "../../src/shared/reading-diagnostics";
import { readingDiagnosticMessage } from "../../src/shared/reading-diagnostic-messages";

// Every new status is required feedback for its saved failure, in the existing issue region.
for (const language of ["zh-CN", "en"] as const) {
  test(`reading diagnostic feedback renders with retained material in ${language}`, async ({}, info) => {
    const root = await mkdtemp(join(tmpdir(), "postrove-diagnostic-ui-"));
    const profile = join(root, "profile");
    await mkdir(profile);
    const url = "https://example.org/diagnostics";
    const now = new Date().toISOString();
    const source = {
      sourceUrl: url,
      platform: "web",
      title: "Diagnostic fixture",
      sourceIdentity: "Fictional author",
      fetchedAt: now,
      markdown: "Saved original",
      contentBlocks: [{ type: "text", text: "Saved original" }],
      images: [],
      completeness: "complete",
      completenessNote: "Fixture",
    };
    const main = {
      id: "main",
      role: "main",
      url,
      title: "Diagnostic fixture",
      source,
      state: "completed",
      summary: "Saved introduction",
      chunks: [
        {
          index: 0,
          original: "Saved original",
          translated: "Saved reading",
          complete: true,
        },
      ],
    };
    const codes = readingIssueCodeSchema.options;
    const references = codes.map((code, index) => {
      const diagnostic = readingDiagnostic(
        code,
        code === "processing_failed" ? "translation" : "source",
        code === "http_error" ? { httpStatus: 403 } : undefined,
        code === "processing_failed",
      );
      return {
        id: `ref-${index}`,
        role: "reference",
        url: `https://example.org/issue/${index}`,
        title: code,
        state: "failed",
        summary: "",
        chunks: [],
        issue: readingDiagnosticMessage(diagnostic, language),
        diagnostic,
      };
    });
    const outputLimit = readingDiagnostic(
      "model_failed",
      "translation",
      { failureCode: "model_output_limit" },
      true,
    );
    references.push({
      id: "output-limit",
      role: "reference",
      url: "https://example.org/output-limit",
      title: "model_failed",
      state: "partial",
      summary: "",
      chunks: [],
      diagnostic: outputLimit,
      issue: readingDiagnosticMessage(outputLimit, language),
    });
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
            taskId: randomUUID(),
            resultId: randomUUID(),
            materialId: randomUUID(),
            target: { sourceUrl: url, entry: "app" },
            state: "failed",
            phase: "解析失败",
            createdAt: now,
            updatedAt: now,
            finishedAt: now,
            source,
            materials: [main, ...references],
            outputLanguage: language,
            activities: [],
            failureStage: "source",
            message: references[0].issue,
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
      const page = await app.firstWindow();
      await page
        .getByRole("navigation")
        .getByRole("button", {
          name: language === "en" ? "Reading" : "阅读",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: "Diagnostic fixture", exact: true })
        .click();
      const reader = page.getByRole("dialog");
      await expect(reader.locator(".markdown")).toContainText("Saved reading");
      const selector = reader.getByRole("combobox");
      for (const reference of references) {
        await selector.selectOption(reference.id);
        await expect(reader.locator(".inline-error")).toContainText(
          reference.issue,
        );
        await expect(reader.locator(".empty-state")).toHaveCount(0);
      }
      await selector.selectOption("output-limit");
      await expect(reader.locator(".inline-error")).toContainText(
        language === "en"
          ? "Model output reached its limit"
          : "输出达到模型上限",
      );
      await page.screenshot({
        path: info.outputPath(`output-limit-${language}.png`),
      });
      await selector.selectOption(
        references.find((item) => item.diagnostic.code === "http_error")!.id,
      );
      await page.screenshot({
        path: info.outputPath(`diagnostics-${language}.png`),
      });
      await info.attach("copy-admission", {
        body: JSON.stringify(
          references.map((item) => ({
            message: item.issue,
            source: "Required operation",
            placement: "Existing reading material issue region",
            trigger:
              item.diagnostic.evidence?.failureCode ?? item.diagnostic.code,
          })),
          null,
          2,
        ),
        contentType: "application/json",
      });
    } finally {
      await app.close();
      await rm(root, { recursive: true, force: true });
    }
  });
}

test("collection retains page text and an observed missing-caption diagnosis", async () => {
  const root = await mkdtemp(join(tmpdir(), "postrove-partial-diagnostic-"));
  const app = await electron.launch({
    args: [join(process.cwd(), "build/test-workers/browser-app.mjs")],
    env: { ...process.env, POSTROVE_BROWSER_FIXTURE_ROOT: root },
  });
  try {
    await app.firstWindow();
    const materials = await app.evaluate(() =>
      (globalThis as any).runDiagnosticCollectionFixture(),
    );
    expect(materials[0].source.markdown).toBe("Saved page description");
    expect(materials[0].source.completeness).toBe("partial");
    expect(materials[0].diagnostic).toMatchObject({
      code: "captions_missing",
      stage: "captions",
    });
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
