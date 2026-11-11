import { test, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchChineseApplication } from "../support/application";
import { seedModelSettings } from "../support/model-settings";

test("native authentication keeps its answer while submission is pending or fails", async () => {
  const profile = await mkdtemp(join(tmpdir(), "postrove-auth-pending-"));
  const [connection] = await seedModelSettings(join(profile, "pi"));
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
    await page.getByRole("button", { name: "设置", exact: true }).click();
    await page.getByRole("button", { name: "后台模型", exact: true }).click();
    await page
      .getByRole("article", { name: connection.name, exact: true })
      .getByRole("button", { name: "连接操作", exact: true })
      .click();
    await page.getByRole("menuitem", { name: "编辑配置", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "编辑配置", exact: true });
    await editor.getByRole("button", { name: "上一步", exact: true }).click();
    const reply = await page.evaluate(() => window.postrove.modelView());
    if (!reply.ok) throw new Error(reply.message);
    const method = reply.value.providers
      .find((item) => item.id === connection.providerId)!
      .authMethods.find((item) => item.type === "api_key")!;
    await editor
      .getByRole("button", { name: method.name, exact: true })
      .click();
    const answer = editor.locator(".model-auth-prompt input");
    await answer.fill("fictional-retained-answer");
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler("model:respond");
      ipcMain.handle(
        "model:respond",
        () =>
          new Promise((resolve) => {
            (globalThis as any).finishAuthSubmission = resolve;
          }),
      );
    });
    await editor.getByRole("button", { name: "继续认证", exact: true }).click();
    await expect(answer).toBeDisabled();
    await expect(answer).toHaveValue("fictional-retained-answer");
    await expect(
      editor.getByRole("button", { name: "关闭", exact: true }),
    ).toBeDisabled();
    await expect(editor.locator(".model-auth-prompt .spin")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(editor).toBeVisible();
    await app.evaluate(() =>
      (globalThis as any).finishAuthSubmission({
        ok: false,
        message: "操作未完成，请重试",
      }),
    );
    await expect(answer).toBeEnabled();
    await expect(answer).toHaveValue("fictional-retained-answer");
    await expect(editor.getByRole("alert")).toBeVisible();
    await page.evaluate(() => window.postrove.cancelModelLogin());
  } finally {
    await app.close();
    await rm(profile, { recursive: true, force: true });
  }
});
