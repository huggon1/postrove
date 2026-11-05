import { test, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChineseApplication } from "../support/application";

// Copy admission: platform/current-capability matrix and grouped setup requirements
// follow the approved capability demo and the requested status-to-setup dialog.
// Account access appears as capabilities; setup details list required configuration.
// Installer labels and feedback identify the
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
        platform: "Bilibili",
        platforms: [
          "X",
          "小红书",
          "YouTube",
          "Reddit",
          "GitHub",
          "Bilibili",
          "其他网页",
        ],
        needed: "待配置",
        configured: "已配置",
        model: "后台模型",
        configure: "配置",
        video: "视频信息",
        accountCaptions: "账号可见字幕",
        accountTranscription: "账号可见视频转录",
        account: "平台账号",
        connect: "连接账号",
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
        platform: "Bilibili",
        platforms: [
          "X",
          "Xiaohongshu",
          "YouTube",
          "Reddit",
          "GitHub",
          "Bilibili",
          "Other websites",
        ],
        needed: "Setup needed",
        configured: "Configured",
        model: "Background models",
        configure: "Configure",
        video: "Video details",
        accountCaptions: "Account-accessible captions",
        accountTranscription: "Account-accessible video transcription",
        account: "Platform account",
        connect: "Connect account",
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
        for (const platform of copy.platforms) {
          await page
            .getByRole("button", { name: platform, exact: true })
            .click();
          const platformDialog = page.getByRole("dialog", {
            name: platform,
            exact: true,
          });
          await expect(platformDialog.locator("details")).toHaveCount(0);
          await expect(
            platformDialog.locator(".capability-requirement"),
          ).toHaveCount(0);
          await platformDialog
            .locator(".capability-setup-status")
            .first()
            .click();
          const requirements = page.locator(".capability-setup-modal");
          await expect(
            requirements.locator('[data-configuration="missing"]'),
          ).toContainText(copy.model);
          await requirements
            .getByRole("button", { name: copy.close, exact: true })
            .click();
          await platformDialog
            .getByRole("button", { name: copy.close, exact: true })
            .click();
        }
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
        await expect(dialog.locator("details")).toHaveCount(0);
        await expect(dialog.locator(".capability-requirement")).toHaveCount(0);
        await expect(
          dialog.getByRole("heading", {
            name: copy.accountCaptions,
            exact: true,
          }),
        ).toBeVisible();
        await expect(
          dialog.getByRole("heading", {
            name: copy.accountTranscription,
            exact: true,
          }),
        ).toBeVisible();
        // Even a group with no extra component needs the shared background model.
        await dialog
          .getByRole("button", {
            name: `${copy.video} · ${copy.needed}`,
            exact: true,
          })
          .click();
        const videoSetup = page.getByRole("dialog", {
          name: copy.video,
          exact: true,
        });
        await expect(
          videoSetup.locator('[data-configuration="missing"]'),
        ).toContainText(copy.model);
        await expect(videoSetup).not.toContainText(copy.account);
        await videoSetup
          .getByRole("button", { name: copy.configure, exact: true })
          .click();
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(
          page.getByRole("heading", { name: copy.model, exact: true }),
        ).toBeVisible();
        await page
          .getByRole("button", { name: copy.capabilities, exact: true })
          .click();
        await page
          .getByRole("button", { name: copy.platform, exact: true })
          .click();
        await dialog
          .getByRole("button", {
            name: `${copy.accountCaptions} · ${copy.needed}`,
            exact: true,
          })
          .click();
        const accountSetup = page.getByRole("dialog", {
          name: copy.accountCaptions,
          exact: true,
        });
        await expect(
          accountSetup.locator('[data-configuration="missing"]'),
        ).toContainText(copy.account);
        await expect(
          accountSetup.getByRole("button", { name: copy.connect, exact: true }),
        ).toBeVisible();
        await accountSetup
          .getByRole("button", { name: copy.close, exact: true })
          .click();
        const status = dialog.getByRole("button", {
          name: `${copy.transcription} · ${copy.needed}`,
          exact: true,
        });
        await status.click();
        const setup = page.getByRole("dialog", {
          name: copy.transcription,
          exact: true,
        });
        await expect(
          setup.locator('[data-configuration="missing"]'),
        ).toContainText(copy.model);
        await expect(setup).not.toContainText(copy.account);
        await page.screenshot({
          path: info.outputPath(`${copy.language}-${size}-requirements.png`),
          animations: "disabled",
        });
        await setup
          .getByRole("button", { name: copy.close, exact: true })
          .click();
        await expect(status).toBeFocused();
        await status.click();
        await setup
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
    // A controlled readiness snapshot exercises the configured-status path without credentials.
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("capabilities:view");
      ipcMain.handle("capabilities:view", () => ({
        model: true,
        chrome: true,
        readers: { youtube: true, bilibili: true, xiaohongshu: true },
        speech: { backend: "whisper.cpp", runtime: "ready", model: "ready" },
      }));
    });
    await page
      .getByRole("button", { name: "Capabilities", exact: true })
      .click();
    await page.getByRole("button", { name: "GitHub", exact: true }).click();
    const github = page.getByRole("dialog", { name: "GitHub", exact: true });
    await github
      .getByRole("button", {
        name: "Repository README · Configured",
        exact: true,
      })
      .click();
    const configured = page.locator(".capability-setup-modal");
    await expect(
      configured.locator('[data-configuration="missing"]'),
    ).toHaveCount(0);
    await expect(
      configured.locator('[data-configuration="ready"]'),
    ).toContainText("Background models");
    await expect(
      configured.locator('[data-configuration="ready"]'),
    ).toContainText("Chrome");
    await page.screenshot({
      path: info.outputPath("en-compact-configured.png"),
      animations: "disabled",
    });
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
