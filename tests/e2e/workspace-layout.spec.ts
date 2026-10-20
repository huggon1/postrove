import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Detect clipped navigation, duplicated page headings, and horizontal overflow
// after the topic workspace replaces the previous sidebar-based application.
test("topic navigation and settings fit both languages at desktop and compact widths", async ({}, info) => {
  test.setTimeout(120_000);
  const profile = await mkdtemp(join(tmpdir(), "postrove-layout-"));
  const app = await electron.launch({
    args: ["."],
    env: {
      ...process.env,
      POSTROVE_RUN_MODE: "review",
      POSTROVE_TEST_DATA: profile,
    },
  });
  try {
    const page = await app.firstWindow();
    const measurements: unknown[] = [];
    for (const language of ["zh-CN", "en"] as const) {
      await page.evaluate(async (language) => {
        await window.postrove.saveLanguage(language);
      }, language);
      await page.reload();
      const english = language === "en";
      const settings = english ? "Settings" : "设置";
      await expect(
        page.getByRole("button", { name: settings, exact: true }),
      ).toBeVisible();
      for (const width of [1280, 960, 390]) {
        await page.setViewportSize({ width, height: 900 });
        for (const name of english
          ? ["Topics", "Reading", "Scheduled sends", "Settings"]
          : ["话题", "阅读", "定时发送", "设置"]) {
          await page.getByRole("button", { name, exact: true }).click();
          await expect(page.locator("main h1")).toHaveText(name);
          await expect(page.locator("main h1")).toHaveCount(1);
          if (name === settings) {
            const sections = page.getByRole("navigation", {
              name: english ? "Settings sections" : "设置分类",
            });
            await sections
              .getByRole("button", {
                name: english ? "Background models" : "后台模型",
                exact: true,
              })
              .click();
            await expect(
              page.getByRole("button", {
                name: english ? "New connection" : "新建连接",
                exact: true,
              }),
            ).toBeVisible();
          }
          const bounds = await page.evaluate(() => {
            const main = document.querySelector("main")!;
            const heading = main.querySelector("h1")!.getBoundingClientRect();
            return {
              overflow:
                document.documentElement.scrollWidth - window.innerWidth,
              mainOverflow: main.scrollWidth - main.clientWidth,
              headingLeft: heading.left,
              headingRight: heading.right,
              viewportWidth: window.innerWidth,
            };
          });
          expect(bounds.overflow).toBeLessThanOrEqual(1);
          expect(bounds.mainOverflow).toBeLessThanOrEqual(1);
          expect(bounds.headingLeft).toBeGreaterThanOrEqual(0);
          expect(bounds.headingRight).toBeLessThanOrEqual(bounds.viewportWidth);
          measurements.push({ language, width, name, ...bounds });
        }
        await page.screenshot({
          path: info.outputPath(`${language}-${width}-settings.png`),
          animations: "disabled",
        });
      }
    }
    await info.attach("layout-measurements", {
      body: JSON.stringify(measurements, null, 2),
      contentType: "application/json",
    });
  } finally {
    await app.close();
    await rm(profile, { recursive: true, force: true });
  }
});
