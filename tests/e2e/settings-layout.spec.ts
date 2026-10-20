import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Layout acceptance: settings headers preserve their action hierarchy; bot setup
// opens directly, secrets keep their value while masked, failures stay in the
// current step, and nested member management preserves the scheduled message.
test("settings and nested forms retain the approved layout through real controls", async ({}, info) => {
  test.setTimeout(90_000);
  const root = await mkdtemp(join(tmpdir(), "postrove-settings-layout-"));
  const app = await electron.launch({
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
    const capture = (name: string) =>
      page.screenshot({
        path: info.outputPath(name + ".png"),
        animations: "disabled",
      });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await capture("inbox-cards");
    await page.locator(".telegram-settings .inbox-card").click();
    const telegram = page.getByRole("dialog", {
      name: "Telegram 接入",
      exact: true,
    });
    const token = telegram.getByLabel("Bot Token", { exact: true });
    await expect(token).toBeVisible();
    await token.fill("invalid-token");
    await telegram
      .getByRole("button", { name: "显示 Bot Token", exact: true })
      .click();
    await expect(token).toHaveAttribute("type", "text");
    await telegram
      .getByRole("button", { name: "隐藏 Bot Token", exact: true })
      .click();
    await expect(token).toHaveAttribute("type", "password");
    await expect(token).toHaveValue("invalid-token");
    await telegram
      .getByRole("button", { name: "保存并验证", exact: true })
      .click();
    await expect(telegram.getByRole("alert")).toContainText("Token");
    await expect(page.locator(".workspace-error")).toHaveCount(0);
    await capture("telegram-validation");
    await telegram.getByRole("button", { name: "关闭", exact: true }).click();
    await page.getByRole("button", { name: "AI 成员", exact: true }).click();
    await capture("members-settings-empty");
    await page
      .getByRole("button", { name: "连接平台 AI", exact: true })
      .click();
    const members = page.locator(".member-modal");
    await capture("members-catalog");
    await members
      .getByRole("button", { name: "连接平台", exact: false })
      .first()
      .click();
    await capture("member-login");
    await members
      .getByRole("button", { name: "返回成员列表", exact: true })
      .click();
    await members.getByRole("button", { name: "关闭", exact: true }).click();
    await page.getByRole("button", { name: "后台模型", exact: true }).click();
    const header = page.locator(".model-settings .settings-section-head");
    const heading = await header.getByRole("heading").boundingBox();
    const action = await header
      .getByRole("button", { name: "新建连接", exact: true })
      .boundingBox();
    expect(action!.x).toBeGreaterThan(heading!.x + heading!.width + 24);
    expect(
      Math.abs(
        action!.y + action!.height / 2 - heading!.y - heading!.height / 2,
      ),
    ).toBeLessThan(3);
    expect(action!.height).toBeLessThanOrEqual(42);
    await capture("model-settings-empty");
    await page.getByRole("button", { name: "新建连接", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "继续", exact: true }),
    ).toBeDisabled();
    await capture("model-provider");
    await page.getByRole("button", { name: "关闭", exact: true }).click();
    await page.getByRole("button", { name: "定时发送", exact: true }).click();
    await page
      .getByRole("button", { name: "新建定时消息", exact: true })
      .click();
    const schedule = page.locator(".schedule-editor");
    await schedule
      .getByLabel("消息内容", { exact: true })
      .fill("保留这条尚未保存的消息");
    await schedule
      .getByRole("button", { name: "管理成员", exact: true })
      .click();
    await expect(members).toBeVisible();
    await capture("schedule-nested-members");
    await members.getByRole("button", { name: "关闭", exact: true }).click();
    await expect(schedule.getByLabel("消息内容", { exact: true })).toHaveValue(
      "保留这条尚未保存的消息",
    );
    expect(await page.evaluate(() => document.body.style.overflow)).toBe(
      "hidden",
    );
    await schedule.getByRole("button", { name: "关闭", exact: true }).click();
    expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
    await page
      .getByRole("navigation", { name: "主导航" })
      .getByRole("button", { name: "阅读", exact: true })
      .click();
    await page.getByRole("button", { name: "添加链接", exact: true }).click();
    const link = page.getByRole("dialog", { name: "添加链接", exact: true });
    await capture("link-intake");
    await link
      .getByLabel("链接", { exact: true })
      .fill("http://example.com/article");
    await link.getByRole("button", { name: "加入阅读", exact: true }).click();
    await expect(link.getByRole("alert")).toHaveText("请输入 HTTPS 网页链接");
    await capture("link-validation");
    await link
      .getByRole("button", { name: "连接 Telegram 或飞书", exact: true })
      .click();
    await expect(link).toHaveCount(0);
    await expect(page.locator(".inbox-connections")).toBeVisible();
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await page.getByRole("button", { name: "偏好设置", exact: true }).click();
    await page.getByLabel("界面语言", { exact: true }).selectOption("en");
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: "Inbox connections", exact: true })
      .click();
    await page.locator(".bot-settings .inbox-card").click();
    await page
      .getByRole("button", { name: "Use existing app", exact: true })
      .click();
    const feishu = page.getByRole("dialog", {
      name: "Feishu setup",
      exact: true,
    });
    await expect(
      feishu.getByRole("button", { name: "Use existing app", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      feishu.getByLabel("App Secret", { exact: true }),
    ).toBeInViewport();
    expect(
      await feishu.evaluate((el) => el.scrollWidth <= el.clientWidth),
    ).toBe(true);
    expect(await feishu.innerText()).not.toMatch(/[\u4e00-\u9fff]/u);
    await capture("feishu-existing-en-narrow");
    expect(errors).toEqual([]);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
