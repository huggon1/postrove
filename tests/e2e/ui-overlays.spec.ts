import { test, expect } from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChineseApplication } from "../support/application";
import { seedModelSettings } from "../support/model-settings";

for (const language of ["zh-CN", "en"] as const) {
  test(`session drafts, popover dismissal, and form submission in ${language}`, async ({}, info) => {
    test.setTimeout(180_000);
    const profile = await mkdtemp(join(tmpdir(), "postrove-ui-overlays-"));
    await writeFile(
      join(profile, "preferences.json"),
      JSON.stringify({ language }),
    );
    await writeFile(
      join(profile, "advisors.json"),
      JSON.stringify({
        version: 1,
        enabled: [
          "x-grok-zh",
          "x-grok-en",
          "xiaohongshu-diandian-zh",
          "youtube-gemini-zh",
          "youtube-gemini-en",
          "reddit-ai-en",
        ],
      }),
    );
    const [connection] = await seedModelSettings(join(profile, "pi"));
    const app = await launchChineseApplication({
      args: ["."],
      env: {
        ...process.env,
        POSTROVE_RUN_MODE: "review",
        POSTROVE_TEST_DATA: profile,
      },
    });
    const english = language === "en";
    const copy = (zh: string, en: string) => (english ? en : zh);
    try {
      const page = await app.firstWindow();
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setViewportSize({ width: 1100, height: 760 });
      const button = (zh: string, en: string) =>
        page.getByRole("button", { name: copy(zh, en), exact: true });
      const message = page.getByRole("textbox", {
        name: copy("话题内容", "Topic message"),
        exact: true,
      });
      await message.fill("Retained topic draft");
      await button("阅读", "Reading").click();
      await button("话题", "Topics").click();
      await expect(message).toHaveValue("Retained topic draft");
      const recipientTrigger = button("选择接收成员", "Choose recipients");
      await recipientTrigger.click();
      const menu = page.locator(".recipient-menu");
      await expect(menu.getByRole("checkbox").first()).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0);
      await expect(recipientTrigger).toBeFocused();
      await recipientTrigger.click();
      await message.click();
      await expect(menu).toHaveCount(0);
      await recipientTrigger.click();
      await button("发送", "Send").focus();
      await expect(menu).toHaveCount(0);
      await recipientTrigger.click();
      for (const checkbox of await menu.getByRole("checkbox").all())
        await checkbox.uncheck();
      await page.keyboard.press("Escape");
      await expect(
        recipientTrigger.getByText(copy("选择接收成员", "Choose recipients"), {
          exact: true,
        }),
      ).toBeVisible();
      await recipientTrigger.click();
      await menu.getByRole("checkbox").first().check();
      await page.keyboard.press("Escape");
      await page.setViewportSize({ width: 640, height: 480 });
      await recipientTrigger.click();
      const bounds = await menu.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return {
          top: r.top,
          bottom: r.bottom,
          left: r.left,
          right: r.right,
          width: innerWidth,
          height: innerHeight,
        };
      });
      expect(bounds.top).toBeGreaterThanOrEqual(0);
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.bottom).toBeLessThanOrEqual(bounds.height);
      expect(bounds.right).toBeLessThanOrEqual(bounds.width);
      await page.screenshot({
        path: info.outputPath("recipient-menu-bounds.png"),
        animations: "disabled",
      });
      // Supply enough surrounding content to move the anchor fully out of view.
      await page.evaluate(() => {
        document.body.style.minHeight = "2000px";
        window.scrollTo(0, 1000);
      });
      expect(
        await recipientTrigger.evaluate(
          (el) => el.getBoundingClientRect().bottom,
        ),
      ).toBeLessThanOrEqual(0);
      await expect(menu).toHaveCount(0);
      await page.evaluate(() => {
        document.body.style.minHeight = "";
        window.scrollTo(0, 0);
      });
      await page.keyboard.press("Escape");
      await page.setViewportSize({ width: 1100, height: 760 });

      await button("定时发送", "Scheduled sends").click();
      await button("新建定时消息", "New scheduled message").click();
      let schedule = page.locator(".schedule-editor");
      await expect(
        schedule.getByLabel(copy("名称", "Name"), { exact: true }),
      ).toBeFocused();
      await schedule
        .getByLabel(copy("消息内容", "Message"), { exact: true })
        .fill("Retained schedule draft");
      const textBounds = (await schedule
        .getByLabel(copy("消息内容", "Message"), { exact: true })
        .boundingBox())!;
      await page.mouse.move(textBounds.x + 20, textBounds.y + 20);
      await page.mouse.down();
      await page.mouse.move(5, 100, { steps: 5 });
      await page.mouse.up();
      await expect(schedule).toBeVisible();
      await page.mouse.move(5, 100);
      await page.mouse.down();
      await page.mouse.move(textBounds.x + 20, textBounds.y + 20, { steps: 5 });
      await page.mouse.up();
      await expect(schedule).toBeVisible();
      await page.keyboard.press("Escape");
      await button("新建定时消息", "New scheduled message").click();
      await expect(
        schedule.getByLabel(copy("消息内容", "Message"), { exact: true }),
      ).toHaveValue("Retained schedule draft");
      await schedule
        .getByRole("button", { name: copy("取消", "Cancel"), exact: true })
        .click();
      await button("新建定时消息", "New scheduled message").click();
      await expect(
        schedule.getByLabel(copy("消息内容", "Message"), { exact: true }),
      ).toHaveValue("");
      await page.mouse.click(5, 100);
      await expect(schedule).toHaveCount(0);

      await button("设置", "Settings").click();
      await page.locator(".telegram-settings .inbox-card").click();
      const telegram = page.getByRole("dialog", {
        name: copy("Telegram 接入", "Telegram setup"),
        exact: true,
      });
      await telegram
        .getByLabel("Bot Token", { exact: true })
        .fill("fictional-memory-only-token");
      await page.keyboard.press("Escape");
      await button("偏好设置", "Preferences").click();
      await button("收件连接", "Inbox connections").click();
      await page.locator(".telegram-settings .inbox-card").click();
      await expect(
        telegram.getByLabel("Bot Token", { exact: true }),
      ).toHaveValue("fictional-memory-only-token");
      await page.keyboard.press("Escape");
      await page.locator(".bot-settings .inbox-card").click();
      await button("使用已有应用", "Use existing app").click();
      const feishu = page.getByRole("dialog", {
        name: copy("飞书接入", "Feishu setup"),
        exact: true,
      });
      await feishu
        .getByLabel("App ID", { exact: true })
        .fill("fictional-app-id");
      await feishu
        .getByLabel("App Secret", { exact: true })
        .fill("fictional-memory-only-secret");
      await page.keyboard.press("Escape");
      await button("偏好设置", "Preferences").click();
      await button("收件连接", "Inbox connections").click();
      await page.locator(".bot-settings .inbox-card").click();
      await expect(feishu.getByLabel("App ID", { exact: true })).toHaveValue(
        "fictional-app-id",
      );
      await expect(
        feishu.getByLabel("App Secret", { exact: true }),
      ).toHaveValue("fictional-memory-only-secret");
      await page.keyboard.press("Escape");

      await button("后台模型", "Background models").click();
      const edit = async () => {
        await page
          .locator(".model-connection-card")
          .first()
          .getByRole("button", {
            name: copy("连接操作", "Connection actions"),
            exact: true,
          })
          .click();
        await page
          .getByRole("menuitem", {
            name: copy("编辑配置", "Edit configuration"),
            exact: true,
          })
          .click();
        return page.getByRole("dialog", {
          name: copy("编辑配置", "Edit configuration"),
          exact: true,
        });
      };
      let editor = await edit();
      const name = () =>
        editor.getByLabel(copy("连接名称", "Connection name"), { exact: true });
      await expect(name()).toBeFocused();
      await name().fill("Retained connection draft");
      await page.keyboard.press("Escape");
      editor = await edit();
      await expect(name()).toHaveValue("Retained connection draft");
      await editor
        .getByText(copy("更多任务参数", "More options"), { exact: true })
        .click();
      const temperature = editor.getByLabel("Temperature", { exact: true });
      await temperature.fill("3");
      await editor
        .getByRole("button", {
          name: copy("保存连接", "Save connection"),
          exact: true,
        })
        .click();
      await expect(temperature).toHaveAttribute("aria-invalid", "true");
      await expect(temperature).toBeFocused();
      await expect(editor.getByRole("alert")).toHaveText(
        copy("请输入 0 到 2 之间的数值", "Enter a number from 0 to 2"),
      );
      await page.screenshot({
        path: info.outputPath("temperature-error.png"),
        animations: "disabled",
      });
      await temperature.fill("0.5");
      const maxTokens = editor.getByLabel(
        copy("最大输出 token", "Output token limit"),
        { exact: true },
      );
      await maxTokens.fill("0");
      await name().press("Enter");
      await expect(maxTokens).toHaveAttribute("aria-invalid", "true");
      await expect(maxTokens).toBeFocused();
      await expect(editor.getByRole("alert")).toHaveText(
        copy(
          "请输入 1 到 2000000 之间的整数",
          "Enter a whole number from 1 to 2000000",
        ),
      );
      await page.screenshot({
        path: info.outputPath("token-count-error.png"),
        animations: "disabled",
      });
      await maxTokens.fill("1024");
      await editor
        .getByText(copy("高级 API 参数", "Advanced API options"), {
          exact: true,
        })
        .click();
      const apiJson = editor.getByLabel("Pi API options JSON", { exact: true });
      await apiJson.fill("{");
      await name().press("Enter");
      await expect(apiJson).toBeFocused();
      await expect(apiJson).toHaveAttribute("aria-invalid", "true");
      await expect(editor.getByRole("alert")).toHaveText(
        copy("请填写有效的 JSON 对象", "Enter a valid JSON object"),
      );
      await apiJson.fill("{}");
      await page.screenshot({
        path: info.outputPath("model-fields.png"),
        animations: "disabled",
      });
      await name().press("Enter");
      await expect(editor).toHaveCount(0);
      const saved = JSON.parse(
        await readFile(join(profile, "pi/connections.json"), "utf8"),
      );
      expect(
        saved.connections.find((value: any) => value.id === connection.id),
      ).toMatchObject({
        name: "Retained connection draft",
        options: { temperature: 0.5, maxTokens: 1024 },
      });
      // An unsaved candidate draft keeps its fields when another connection is
      // inspected. Reopening it returns to setup instead of saving over that connection.
      await button("新建连接", "New connection").click();
      const newEditor = page.getByRole("dialog", {
        name: copy("模型连接配置", "Model connection"),
        exact: true,
      });
      await newEditor
        .getByRole("button", {
          name: copy("自定义服务", "Custom service"),
          exact: true,
        })
        .click();
      await newEditor
        .getByLabel(copy("供应商 ID", "Provider ID"), { exact: true })
        .fill(connection.providerId);
      await newEditor
        .getByLabel("Pi models.json", { exact: true })
        .fill(
          await readFile(
            join(profile, "pi/connections", connection.id, "models.json"),
            "utf8",
          ),
        );
      await newEditor
        .getByRole("button", { name: copy("继续", "Continue"), exact: true })
        .click();
      const state = await page.evaluate(() => window.postrove.modelView());
      if (!state.ok) throw new Error(state.message);
      const method = state.value.providers.find(
        (provider) => provider.id === connection.providerId,
      )!.authMethods[0];
      await newEditor
        .getByRole("button", { name: method.name, exact: true })
        .click();
      await newEditor
        .locator('input[type="password"]')
        .fill("fictional-candidate-key");
      await newEditor
        .getByRole("button", {
          name: copy("继续认证", "Continue authentication"),
          exact: true,
        })
        .click();
      await newEditor
        .getByRole("button", { name: copy("继续", "Continue"), exact: true })
        .click();
      await newEditor
        .getByLabel(copy("连接名称", "Connection name"), { exact: true })
        .fill("Unsaved candidate A");
      await page.keyboard.press("Escape");
      editor = await edit();
      await expect(name()).toHaveValue("Retained connection draft");
      await page.keyboard.press("Escape");
      await button("新建连接", "New connection").click();
      await expect(
        newEditor.getByLabel(copy("供应商 ID", "Provider ID"), { exact: true }),
      ).toHaveValue(connection.providerId);
      await expect(
        newEditor.getByRole("button", {
          name: copy("保存并使用", "Save and use"),
          exact: true,
        }),
      ).toHaveCount(0);
      await newEditor
        .getByRole("button", { name: copy("取消", "Cancel"), exact: true })
        .click();
      const retained = JSON.parse(
        await readFile(join(profile, "pi/connections.json"), "utf8"),
      );
      expect(retained.connections).toHaveLength(2);
      expect(
        retained.connections.find((value: any) => value.id === connection.id)
          .name,
      ).toBe("Retained connection draft");
      await info.attach("copy-admission", {
        body: JSON.stringify({
          messages: [
            "请输入 0 到 2 之间的数值",
            "请输入 1 到 2000000 之间的整数",
          ],
          source: "Required operation",
          trigger:
            "An attempted model save contains an out-of-range temperature or a non-integer/out-of-range token count",
          placement: "Associated model field",
          language,
          menuBounds: bounds,
        }),
        contentType: "application/json",
      });
      expect(errors).toEqual([]);
    } finally {
      await app.close();
      await rm(profile, { recursive: true, force: true });
    }
  });
}

test("a pending schedule save keeps its draft locked until the response", async () => {
  const profile = await mkdtemp(join(tmpdir(), "postrove-schedule-commit-"));
  await writeFile(
    join(profile, "advisors.json"),
    JSON.stringify({ version: 1, enabled: ["reddit-ai-en"] }),
  );
  const app = await launchChineseApplication({
    args: ["."],
    env: {
      ...process.env,
      POSTROVE_RUN_MODE: "review",
      POSTROVE_TEST_DATA: profile,
    },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "定时发送", exact: true }).click();
    await page
      .getByRole("button", { name: "新建定时消息", exact: true })
      .click();
    const editor = page.locator(".schedule-editor");
    const message = editor.getByLabel("消息内容", { exact: true });
    await message.fill("Fictional retained commit draft");
    await app.evaluate(({ ipcMain }) => {
      (ipcMain as any)._invokeHandlers.set(
        "search:save-follow",
        async () =>
          new Promise((resolve) => {
            (globalThis as any).releaseOverlaySave = resolve;
          }),
      );
    });
    await editor
      .getByRole("button", { name: "保存定时消息", exact: true })
      .click();
    await expect(message).toBeDisabled();
    await expect(editor.getByLabel("重复", { exact: true })).toBeDisabled();
    await expect(
      editor.getByRole("button", { name: "关闭", exact: true }),
    ).toBeDisabled();
    await expect(
      editor.locator(".schedule-editor-actions .spin"),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(editor).toBeVisible();
    await app.evaluate(() =>
      (globalThis as any).releaseOverlaySave({
        ok: false,
        message: "操作未完成，请重试",
      }),
    );
    await expect(message).toBeEnabled();
    await expect(message).toHaveValue("Fictional retained commit draft");
    await expect(editor.getByRole("alert")).toBeVisible();
  } finally {
    await app.close();
    await rm(profile, { recursive: true, force: true });
  }
});
