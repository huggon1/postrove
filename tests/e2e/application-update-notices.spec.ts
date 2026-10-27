import { test, expect } from "@playwright/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { launchChineseApplication } from "../support/application";

for (const language of ["zh-CN", "en"] as const) {
  test(`update notices fit through installation in ${language}`, async ({}, info) => {
    const profile = await mkdtemp(join(tmpdir(), "postrove-update-notices-"));
    const server = createServer((_, res) => {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ version: "0.1.1", notes: "Fixture release" }));
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    await writeFile(
      join(profile, "preferences.json"),
      JSON.stringify({ language }),
    );
    await writeFile(
      join(profile, "application-update.json"),
      JSON.stringify({ from: "0.0.9", to: "0.1.0" }),
    );
    const application = await launchChineseApplication({
      args: [resolve("dist/main/update-test.cjs")],
      env: {
        ...process.env,
        POSTROVE_TEST_DATA: profile,
        POSTROVE_RUN_MODE: "test",
        POSTROVE_TEST_ENDPOINT: `http://127.0.0.1:${(server.address() as any).port}`,
      },
    });
    try {
      const page = await application.firstWindow();
      const english = language === "en";
      const notices = page.locator(".update-toast");
      const success = page.locator(".update-toast-success");
      await expect(success).toContainText("0.1.0");
      await page
        .getByRole("button", {
          name: english ? "Settings" : "设置",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", { name: english ? "About" : "关于", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: english ? "Check for updates" : "检查更新",
          exact: true,
        })
        .click();
      await expect(notices).toHaveCount(2);
      const measurements: unknown[] = [];
      for (const width of [1100, 390, 340]) {
        await page.setViewportSize({ width, height: 800 });
        const bounds = await notices.evaluateAll((elements) =>
          elements.map((element) => {
            const rect = element.getBoundingClientRect();
            const style = getComputedStyle(element);
            const actions = [...element.querySelectorAll("button")].map(
              (button) => {
                const box = button.getBoundingClientRect();
                return { left: box.left, right: box.right, bottom: box.bottom };
              },
            );
            return {
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom,
              border: style.borderTopWidth,
              background: style.backgroundColor,
              actions,
            };
          }),
        );
        expect(bounds[0].bottom).toBeLessThan(bounds[1].top);
        for (const bound of bounds) {
          expect(bound.left).toBeGreaterThanOrEqual(16);
          expect(bound.right).toBeLessThanOrEqual(width - 16);
          expect(bound.bottom).toBeLessThanOrEqual(
            800 - (width <= 600 ? 82 : 24),
          );
          expect(bound.border).toBe("1px");
          expect(bound.background).toBe("rgb(255, 255, 255)");
          for (const action of bound.actions) {
            expect(action.left).toBeGreaterThan(bound.left);
            expect(action.right).toBeLessThan(bound.right);
            expect(action.bottom).toBeLessThan(bound.bottom);
          }
        }
        measurements.push({ width, bounds });
        await page.screenshot({
          path: info.outputPath(`${language}-${width}-notices.png`),
        });
      }
      await success
        .getByRole("button", {
          name: english ? "Dismiss notice" : "关闭提示",
          exact: true,
        })
        .click();
      await expect(success).toHaveCount(0);
      await page.setViewportSize({ width: 1100, height: 800 });
      await page.screenshot({
        path: info.outputPath(`${language}-available.png`),
      });
      await page
        .getByRole("button", { name: english ? "Topics" : "话题", exact: true })
        .first()
        .click();
      await notices
        .getByRole("button", {
          name: english ? "View update" : "查看更新",
          exact: true,
        })
        .click();
      await expect(
        page.getByRole("region", {
          name: english ? "Application updates" : "应用更新",
          exact: true,
        }),
      ).toBeVisible();
      await expect(notices).toHaveCount(0);
      await page
        .getByRole("button", {
          name: english ? "Download update" : "下载更新",
          exact: true,
        })
        .click();
      await page
        .getByRole("button", {
          name: english ? "Install and restart" : "安装并重启",
          exact: true,
        })
        .click();
      const installation = page.getByRole("status").filter({
        hasText: english
          ? "Preparing to install the update"
          : "正在准备安装更新",
      });
      await expect(installation).toContainText(
        english
          ? "Verifying the package and saving state, then restarting the application."
          : "正在验证安装包并保存状态，随后重启应用。",
      );
      for (const width of [1100, 390, 340]) {
        await page.setViewportSize({ width, height: 800 });
        const bound = await installation.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            border: style.borderTopWidth,
            background: style.backgroundColor,
            text: [...element.querySelectorAll("p")].map((paragraph) => {
              const box = paragraph.getBoundingClientRect();
              return {
                left: box.left,
                right: box.right,
                bottom: box.bottom,
                overflow: paragraph.scrollWidth > paragraph.clientWidth,
              };
            }),
          };
        });
        expect(bound.left).toBeGreaterThanOrEqual(16);
        expect(bound.right).toBeLessThanOrEqual(width - 16);
        expect(bound.top).toBeGreaterThanOrEqual(0);
        expect(bound.bottom).toBeLessThanOrEqual(
          800 - (width <= 600 ? 82 : 24),
        );
        expect(bound.border).toBe("1px");
        expect(bound.background).toBe("rgb(255, 255, 255)");
        for (const paragraph of bound.text) {
          expect(paragraph.left).toBeGreaterThan(bound.left);
          expect(paragraph.right).toBeLessThan(bound.right);
          expect(paragraph.bottom).toBeLessThan(bound.bottom);
          expect(paragraph.overflow).toBe(false);
        }
        measurements.push({ state: "installing", width, bound });
        await page.screenshot({
          path: info.outputPath(`${language}-${width}-installing.png`),
        });
      }
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(installation.locator("svg")).toHaveCSS(
        "animation-name",
        "none",
      );
      await info.attach("notice-review", {
        body: JSON.stringify(
          {
            language,
            measurements,
            copyAdmission:
              "Existing release, success, View update, Later, and Dismiss notice strings in their existing update states. Existing installation title and restart message appear when Install and restart enters the installing state. Both interface languages retain their existing strings.",
            boundary:
              "Production renderer, IPC and update service; controlled release response and isolated profile.",
          },
          null,
          2,
        ),
        contentType: "application/json",
      });
    } finally {
      await application.close();
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
      await rm(profile, { recursive: true, force: true });
    }
  });
}
