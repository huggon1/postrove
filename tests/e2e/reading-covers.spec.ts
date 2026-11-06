import { test, expect, _electron as electron } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { savedReading } from "../fixtures/saved-reading";

for (const language of ["zh-CN", "en"] as const) {
  test(`loaded reading covers retain separate cover and title targets in ${language}`, async ({}, info) => {
    const profile = await mkdtemp(join(tmpdir(), "postrove-reading-covers-"));
    const cache = join(profile, "material-images");
    await mkdir(cache);
    const fixtures = [
      { title: "Portrait cover", width: 450, height: 900, color: "#7198ca" },
      { title: "Landscape cover", width: 1200, height: 400, color: "#b49acb" },
    ];
    const tasks = [];
    for (const fixture of fixtures) {
      const url = `https://example.org/${fixture.width}-${fixture.height}`;
      const imageUrl = `${url}.png`;
      const imageId = createHash("sha256").update(imageUrl).digest("hex");
      await writeFile(
        join(cache, imageId),
        await sharp({
          create: {
            width: fixture.width,
            height: fixture.height,
            channels: 3,
            background: fixture.color,
          },
        })
          .png()
          .toBuffer(),
      );
      await writeFile(join(cache, `${imageId}.type`), "image/png");
      const task = savedReading(`postrove-image://${imageId}`).tasks[0];
      task.taskId = randomUUID();
      task.resultId = randomUUID();
      task.materialId = randomUUID();
      task.target.sourceUrl = url;
      task.source!.sourceUrl = url;
      task.source!.title = fixture.title;
      task.source!.images[0].url = imageUrl;
      task.materials![0].url = url;
      task.materials![0].title = fixture.title;
      task.materials![0].summary = "The saved summary remains below the cover.";
      tasks.push(task);
    }
    await writeFile(
      join(profile, "preferences.json"),
      JSON.stringify({ language }),
    );
    await writeFile(
      join(profile, "forwarding.json"),
      JSON.stringify({ version: 1, tasks }),
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
      const measurements = [];
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 900 });
        for (const fixture of fixtures) {
          const card = page
            .locator(".reading-card")
            .filter({
              has: page.getByRole("heading", {
                name: fixture.title,
                exact: true,
              }),
            });
          const image = card.locator(".reading-cover img");
          await expect
            .poll(() =>
              image.evaluate((element: HTMLImageElement) => [
                element.naturalWidth,
                element.naturalHeight,
              ]),
            )
            .toEqual([fixture.width, fixture.height]);
          await card.scrollIntoViewIfNeeded();
          const bounds = await card.evaluate((element) => {
            const cover = element.querySelector<HTMLElement>(".reading-cover")!;
            const image = cover.querySelector("img")!;
            const title = element.querySelector<HTMLElement>(
              ".reading-card-title",
            )!;
            const summary = element.querySelector<HTMLElement>(
              ".reading-card-body > p",
            )!;
            const rect = (target: Element) => {
              const { left, right, top, bottom, width, height } =
                target.getBoundingClientRect();
              return { left, right, top, bottom, width, height };
            };
            const titleRect = title.getBoundingClientRect();
            const hit = document.elementFromPoint(
              titleRect.left + titleRect.width / 2,
              titleRect.top + titleRect.height / 2,
            );
            return {
              cover: rect(cover),
              image: rect(image),
              title: rect(title),
              summary: rect(summary),
              titleHit: !!hit && title.contains(hit),
            };
          });
          expect(bounds.image.left).toBeGreaterThanOrEqual(
            bounds.cover.left - 1,
          );
          expect(bounds.image.right).toBeLessThanOrEqual(
            bounds.cover.right + 1,
          );
          expect(bounds.image.top).toBeGreaterThanOrEqual(bounds.cover.top - 1);
          expect(bounds.image.bottom).toBeLessThanOrEqual(
            bounds.cover.bottom + 1,
          );
          expect(bounds.title.top).toBeGreaterThanOrEqual(bounds.cover.bottom);
          expect(bounds.summary.top).toBeGreaterThanOrEqual(
            bounds.title.bottom,
          );
          expect(bounds.titleHit).toBe(true);
          measurements.push({
            language,
            width,
            fixture: fixture.title,
            ...bounds,
          });
          await card.screenshot({
            path: info.outputPath(`${language}-${width}-${fixture.width}-cover.png`),
            animations: "disabled",
          });
          for (const control of [
            card.locator(".reading-cover"),
            card.locator(".reading-card-title"),
          ]) {
            await control.click();
            const reader = page.getByRole("dialog", {
              name: language === "en" ? "Reading" : "阅读内容",
            });
            await expect(
              reader.getByRole("heading", { name: fixture.title, exact: true }),
            ).toBeVisible();
            await reader
              .getByRole("button", {
                name: language === "en" ? "Close" : "关闭",
                exact: true,
              })
              .click();
          }
        }
        await page.screenshot({
          path: info.outputPath(`${language}-${width}-reading-covers.png`),
          animations: "disabled",
        });
      }
      await info.attach("cover-bounds-and-hit-targets", {
        body: JSON.stringify(measurements, null, 2),
        contentType: "application/json",
      });
      await info.attach("copy-admission", {
        body: JSON.stringify({
          addedCopy: [],
          source: "Existing reading controls and fixture content",
        }),
        contentType: "application/json",
      });
    } finally {
      await app.close();
      await rm(profile, { recursive: true, force: true });
    }
  });
}
