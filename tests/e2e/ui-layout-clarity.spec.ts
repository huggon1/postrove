import { test, expect } from "@playwright/test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { launchChineseApplication } from "../support/application";

test("home and schedule cards use the saved zone and show a repeated name once", async ({}, info) => {
  const profile = await mkdtemp(join(tmpdir(), "postrove-ui-clarity-"));
  const question = "Fictional scheduled briefing";
  await writeFile(
    join(profile, "focus-search.json"),
    JSON.stringify({
      version: 1,
      reports: [],
      follows: [
        {
          followId: randomUUID(),
          name: question,
          question,
          platforms: ["reddit"],
          advisorIds: ["reddit-ai-en"],
          period: "all",
          paused: false,
          revision: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          nextRunAt: "2096-01-02T04:59:00.000Z",
          schedule: {
            version: 2,
            cadence: "once",
            timeZone: "America/New_York",
            startDate: "2096-01-01",
            times: ["23:59"],
          },
        },
      ],
    }),
  );
  const app = await launchChineseApplication({
    args: ["."],
    env: {
      ...process.env,
      TZ: "Asia/Shanghai",
      POSTROVE_TEST_DATA: profile,
      POSTROVE_RUN_MODE: "review",
    },
  });
  try {
    const page = await app.firstWindow();
    for (const language of ["zh-CN", "en"] as const) {
      await page.evaluate(
        (language) => window.postrove.saveLanguage(language),
        language,
      );
      await page.reload();
      const en = language === "en";
      const homeTime = page.locator(".next-schedule time");
      await expect(homeTime).toContainText("23:59");
      await expect(page.locator(".next-schedule-zone")).toHaveText(
        "America/New_York",
      );
      const displayed = await homeTime.innerText();
      await page
        .getByRole("button", {
          name: en ? "Scheduled sends" : "定时发送",
          exact: true,
        })
        .click();
      await expect(page.locator(".schedule-content time")).toHaveText(
        displayed,
      );
      await expect(page.locator(".schedule-name")).toHaveCount(0);
      await expect(page.locator(".schedule-content h2")).toHaveText(question);
      for (const width of [1100, 640, 390]) {
        await page.setViewportSize({ width, height: 760 });
        await expect(page.locator(".schedule-card")).toBeInViewport();
        const toggle = await page.getByRole("switch").boundingBox();
        expect(toggle!.width).toBeGreaterThan(toggle!.height * 1.5);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth - innerWidth,
          ),
        ).toBeLessThanOrEqual(1);
        await page.screenshot({
          path: info.outputPath(`${language}-${width}.png`),
          animations: "disabled",
        });
      }
    }
    await info.attach("copy-admission", {
      contentType: "application/json",
      body: JSON.stringify({
        existing:
          "Saved schedule zone and occurrence time, repeated in the existing next-send control.",
        requiredFeedback:
          "The next-send control shows the zone that determines the displayed occurrence.",
        trigger:
          "A future saved schedule is selected for the home next-send card.",
      }),
    });
  } finally {
    await app.close();
    await rm(profile, { recursive: true, force: true });
  }
});
