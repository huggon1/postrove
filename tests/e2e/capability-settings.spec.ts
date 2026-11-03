import { test, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChineseApplication } from "../support/application";

// Copy admission: platform/current-capability matrix and grouped setup requirements
// follow the approved capability demo. Installer labels and feedback identify the
// real component/model readiness and the required install/cancel/retry operation.
test("capability settings show real readiness and route missing speech setup in both languages", async ({}, info) => {
  test.setTimeout(90_000);
  const root = await mkdtemp(join(tmpdir(), "postrove-capability-settings-"));
  const app = await launchChineseApplication({
    args: ["."],
    env: {
      ...process.env,
      POSTROVE_RUN_MODE: "review",
      POSTROVE_TEST_DATA: root,
    },
  });
  try {
    const page = await app.firstWindow();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const languages = [
      {
        language: "zh-CN",
        settings: "设置",
        capabilities: "能力地图",
        speech: "语音转文字",
        preferences: "偏好设置",
        languageLabel: "界面语言",
        platform: "小红书",
        transcription: "视频转录",
        install: "安装",
        close: "关闭",
      },
      {
        language: "en",
        settings: "Settings",
        capabilities: "Capabilities",
        speech: "Speech to text",
        preferences: "Preferences",
        languageLabel: "Interface language",
        platform: "Xiaohongshu",
        transcription: "Video transcription",
        install: "Install",
        close: "Close",
      },
    ];
    await page.getByRole("button", { name: "设置", exact: true }).click();
    for (const copy of languages) {
      if (copy.language === "en") {
        await page
          .getByRole("button", { name: "偏好设置", exact: true })
          .click();
        await page.getByLabel("界面语言", { exact: true }).selectOption("en");
      }
      for (const [size, viewport] of Object.entries({
        desktop: { width: 1280, height: 900 },
        compact: { width: 390, height: 844 },
      })) {
        await page.setViewportSize(viewport);
        await page
          .getByRole("button", { name: copy.capabilities, exact: true })
          .click();
        await expect(
          page.getByRole("heading", { name: copy.capabilities, exact: true }),
        ).toBeVisible();
        const table = page.locator(".capability-table");
        await expect(table.locator("thead th")).toHaveCount(2);
        await expect(table.locator("tbody tr")).toHaveCount(7);
        await expect(table).not.toContainText("全部能力与要求");
        await page.screenshot({
          path: info.outputPath(`${copy.language}-${size}-capabilities.png`),
          animations: "disabled",
        });
        await page
          .getByRole("button", { name: copy.platform, exact: true })
          .click();
        const dialog = page.getByRole("dialog", {
          name: copy.platform,
          exact: true,
        });
        await expect(
          dialog.getByRole("heading", {
            name: copy.transcription,
            exact: true,
          }),
        ).toBeVisible();
        await page.screenshot({
          path: info.outputPath(`${copy.language}-${size}-platform.png`),
          animations: "disabled",
        });
        const group = dialog
          .locator(".capability-group")
          .filter({
            has: page.getByRole("heading", {
              name: copy.transcription,
              exact: true,
            }),
          });
        await group
          .getByRole("button", { name: copy.install, exact: true })
          .click();
        await expect(dialog).toHaveCount(0);
        await expect(
          page.getByRole("heading", { name: copy.speech, exact: true }),
        ).toBeVisible();
        const speech = page.locator(".speech-install-card");
        await expect(speech).not.toHaveAttribute(
          "data-install-state",
          "loading",
        );
        await expect(speech).toContainText("Whisper small");
        await expect(speech).toContainText("190 MB");
        await expect(speech.getByRole("button")).toHaveCount(1);
        await page.screenshot({
          path: info.outputPath(`${copy.language}-${size}-speech.png`),
          animations: "disabled",
        });
        const dimensions = await page.evaluate(() => ({
          width: innerWidth,
          content: document.documentElement.scrollWidth,
        }));
        expect(dimensions.content).toBeLessThanOrEqual(dimensions.width);
      }
    }
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
