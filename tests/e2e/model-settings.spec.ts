import { test, expect, type ElectronApplication } from "@playwright/test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { launchChineseApplication } from "../support/application";
import {
  modelSettingsServer,
  seedModelSettings,
} from "../support/model-settings";

// Production UI, IPC, native Pi authentication, and model requests use fictional
// connections and a loopback fixture. No installed profile or external account is used.
test("model selection, connection checks, and saved edits share the same active configuration", async ({}, info) => {
  test.setTimeout(120_000);
  const profile = await mkdtemp(join(tmpdir(), "postrove-model-settings-ui-"));
  const server = await modelSettingsServer();
  const [primary, backup] = await seedModelSettings(
    join(profile, "pi"),
    server.endpoint,
  );
  const saved = async () =>
    JSON.parse(await readFile(join(profile, "pi/connections.json"), "utf8"));
  let app: ElectronApplication | undefined;
  const launch = async (english = false) => {
    const running = await launchChineseApplication({
      args: ["."],
      env: {
        ...process.env,
        POSTROVE_TEST_DATA: profile,
        POSTROVE_RUN_MODE: "test",
      },
    });
    app = running;
    const page = await running.firstWindow();
    await page
      .getByRole("button", { name: english ? "Settings" : "设置", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: english ? "Background models" : "后台模型",
        exact: true,
      })
      .click();
    return page;
  };
  try {
    let page = await launch();
    const capture = async (name: string) =>
      page.screenshot({
        path: info.outputPath(`${name}.png`),
        animations: "disabled",
      });
    const card = (name: string) =>
      page.getByRole("article", { name, exact: true });
    const currentModel = () =>
      page.getByRole("combobox", { name: "当前模型", exact: true });
    const view = async () => {
      const reply = await page.evaluate(() => window.postrove.modelView());
      if (!reply.ok) throw new Error(reply.message);
      return reply.value;
    };
    const edit = async (name: string) => {
      await card(name)
        .getByRole("button", { name: "连接操作", exact: true })
        .click();
      await page
        .getByRole("menuitem", { name: "编辑配置", exact: true })
        .click();
      return page.getByRole("dialog", { name: "编辑配置", exact: true });
    };

    await expect(
      card(primary.name).getByText("正在使用", { exact: true }),
    ).toBeVisible();
    await expect(currentModel()).toHaveValue(primary.modelId);
    await expect(
      page.getByRole("button", { name: "检查连接", exact: true }),
    ).toHaveCount(1);
    await capture("model-settings-initial-zh");
    await page.getByRole("button", { name: "检查连接", exact: true }).click();
    await expect(page.getByText("连接检查通过", { exact: true })).toBeVisible();
    expect(server.calls.at(-1)).toEqual({
      model: primary.modelId,
      authenticated: true,
    });
    await capture("model-settings-passed-zh");

    await currentModel().selectOption(`${primary.providerId}-quick`);
    await expect(currentModel()).toHaveValue(`${primary.providerId}-quick`);
    await expect(page.getByText("连接检查通过", { exact: true })).toHaveCount(
      0,
    );
    await expect
      .poll(
        async () =>
          (await saved()).connections.find(
            (item: any) => item.id === primary.id,
          ).modelId,
      )
      .toBe(`${primary.providerId}-quick`);
    await page.getByRole("button", { name: "检查连接", exact: true }).click();
    await expect(page.getByText("连接检查通过", { exact: true })).toBeVisible();
    expect(server.calls.at(-1)?.model).toBe(`${primary.providerId}-quick`);

    const backupEditor = await edit(backup.name);
    await backupEditor
      .getByLabel("连接名称", { exact: true })
      .fill("Demo B edited");
    await backupEditor
      .getByRole("combobox", { name: "阅读任务 Reasoning", exact: true })
      .selectOption("low");
    await capture("model-settings-edit-backup-zh");
    await backupEditor
      .getByRole("button", { name: "保存连接", exact: true })
      .click();
    await expect(backupEditor).toHaveCount(0);
    expect((await view()).current?.connectionId).toBe(primary.id);
    await expect(
      page.locator(".model-connection-card").first(),
    ).toHaveAttribute("aria-label", primary.name);
    expect(
      (await view()).currentModels.every((model) =>
        model.id.startsWith(primary.providerId),
      ),
    ).toBe(true);
    await expect(page.getByText("连接检查通过", { exact: true })).toBeVisible();
    await card("Demo B edited")
      .getByRole("button", { name: "使用此连接", exact: true })
      .click();
    await expect(
      card("Demo B edited").getByText("正在使用", { exact: true }),
    ).toBeVisible();
    await expect(currentModel()).toHaveValue(backup.modelId);
    await expect(page.getByText("连接检查通过", { exact: true })).toHaveCount(
      0,
    );
    await currentModel().selectOption(`${backup.providerId}-quick`);
    await expect(page.getByRole("alert")).toContainText("Reasoning");
    await expect(currentModel()).toHaveValue(backup.modelId);
    const activeEditor = await edit("Demo B edited");
    await activeEditor
      .getByRole("combobox", { name: "阅读任务 Reasoning", exact: true })
      .selectOption("task_default");
    await activeEditor
      .getByRole("button", { name: "保存连接", exact: true })
      .click();
    await expect(activeEditor).toHaveCount(0);
    await currentModel().selectOption(`${backup.providerId}-offline`);
    await page.getByRole("button", { name: "检查连接", exact: true }).click();
    await expect(card("Demo B edited").getByRole("alert")).toBeVisible();
    await capture("model-settings-failed-zh");

    await currentModel().selectOption(backup.modelId);
    await expect(page.getByRole("alert")).toHaveCount(0);
    server.controls.hold = true;
    const before = server.calls.length;
    await page.getByRole("button", { name: "检查连接", exact: true }).click();
    await expect.poll(() => server.calls.length).toBe(before + 1);
    await expect(page.getByText("检查中…", { exact: true })).toBeVisible();
    await capture("model-settings-running-zh");
    await page
      .getByRole("button", { name: "取消连接检查", exact: true })
      .click();
    await expect(page.getByText("检查已取消", { exact: true })).toBeVisible();
    server.controls.hold = false;
    server.releaseHeld();
    await capture("model-settings-cancelled-zh");

    server.controls.hold = true;
    const previous = server.calls.length;
    await page.getByRole("button", { name: "检查连接", exact: true }).click();
    await expect.poll(() => server.calls.length).toBe(previous + 1);
    await card(primary.name)
      .getByRole("button", { name: "使用此连接", exact: true })
      .click();
    await expect(currentModel()).toHaveValue(`${primary.providerId}-quick`);
    expect((await view()).check).toBe("idle");
    server.controls.hold = false;
    server.releaseHeld();
    await page.getByRole("button", { name: "检查连接", exact: true }).click();
    await expect(page.getByText("连接检查通过", { exact: true })).toBeVisible();
    expect(server.calls.at(-1)?.model).toBe(`${primary.providerId}-quick`);

    const menuButton = card(primary.name).getByRole("button", {
      name: "连接操作",
      exact: true,
    });
    await menuButton.focus();
    await page.keyboard.press("ArrowDown");
    await expect(
      page.getByRole("menuitem", { name: "编辑配置", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(
      page.getByRole("menuitem", { name: "移除连接", exact: true }),
    ).toBeFocused();
    await capture("model-settings-menu-zh");
    await page.keyboard.press("Escape");
    await expect(menuButton).toBeFocused();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator(".model-settings")).toBeVisible();
    expect(
      await page
        .locator(".model-settings")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await capture("model-settings-compact-zh");

    await page.getByRole("button", { name: "偏好设置", exact: true }).click();
    await page
      .getByRole("combobox", { name: "界面语言", exact: true })
      .selectOption("en");
    await page
      .getByRole("button", { name: "Background models", exact: true })
      .click();
    await expect(
      page.getByRole("combobox", { name: "Current model", exact: true }),
    ).toHaveValue(`${primary.providerId}-quick`);
    await expect(
      page.getByRole("button", { name: "Check connection", exact: true }),
    ).toBeEnabled();
    expect(await page.locator(".model-settings").innerText()).not.toMatch(
      /[\u4e00-\u9fff]/u,
    );
    expect(
      await page
        .locator(".model-settings")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true);
    await capture("model-settings-compact-en");
    await card(primary.name)
      .getByRole("button", { name: "Connection actions", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Edit configuration", exact: true })
      .click();
    const englishEditor = page.getByRole("dialog", {
      name: "Edit configuration",
      exact: true,
    });
    await englishEditor
      .getByRole("combobox", { name: "Model", exact: true })
      .selectOption(primary.modelId);
    await englishEditor
      .getByRole("combobox", { name: "Browser reasoning", exact: true })
      .selectOption("high");
    await englishEditor
      .getByRole("button", { name: "Save connection", exact: true })
      .click();
    await expect(englishEditor).toHaveCount(0);
    await page
      .getByRole("combobox", { name: "Current model", exact: true })
      .selectOption(`${primary.providerId}-quick`);
    await expect(page.getByRole("alert")).toContainText(
      "different reasoning settings",
    );
    await capture("model-settings-model-error-en");
    await page.setViewportSize({ width: 1100, height: 760 });
    await capture("model-settings-desktop-en");

    await page
      .getByRole("button", { name: "New connection", exact: true })
      .click();
    const newEditor = page.getByRole("dialog", {
      name: "Model connection",
      exact: true,
    });
    await newEditor
      .getByRole("button", { name: "Custom service", exact: true })
      .click();
    await newEditor
      .getByLabel("Provider ID", { exact: true })
      .fill(primary.providerId);
    await newEditor
      .getByLabel("Pi models.json", { exact: true })
      .fill(
        await readFile(
          join(profile, "pi/connections", primary.id, "models.json"),
          "utf8",
        ),
      );
    await newEditor
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    const authMethod = (await view()).providers.find(
      (item) => item.id === primary.providerId,
    )!.authMethods[0];
    await newEditor
      .getByRole("button", { name: authMethod.name, exact: true })
      .click();
    await newEditor
      .locator('input[type="password"]')
      .fill("fictional-model-key");
    await newEditor
      .getByRole("button", { name: "Continue authentication", exact: true })
      .click();
    await newEditor
      .getByRole("button", { name: "Continue", exact: true })
      .click();
    await newEditor
      .getByRole("combobox", { name: "Model", exact: true })
      .selectOption(primary.modelId);
    await expect(
      newEditor.getByRole("button", { name: "Save and use", exact: true }),
    ).toBeEnabled();
    expect(await newEditor.innerText()).not.toMatch(/[\u4e00-\u9fff]/u);
    await capture("model-settings-save-and-use-en");
    await newEditor
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await expect(newEditor).toHaveCount(0);
    expect((await view()).current?.connectionId).toBe(primary.id);
    expect((await saved()).connections).toHaveLength(2);

    await app!.close();
    app = undefined;
    page = await launch(true);
    await expect(
      page.getByRole("combobox", { name: "Current model", exact: true }),
    ).toHaveValue(primary.modelId);
    expect((await view()).current?.connectionId).toBe(primary.id);
    expect((await view()).check).toBe("idle");
    expect(
      (await saved()).connections.find((item: any) => item.id === backup.id)
        .name,
    ).toBe("Demo B edited");
    expect(JSON.stringify(await view())).not.toContain("fictional-model-key");
  } finally {
    server.controls.hold = false;
    server.releaseHeld();
    await app?.close();
    await server.close();
    await rm(profile, { recursive: true, force: true });
  }
});
