import { test, expect, type ElectronApplication } from "@playwright/test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { launchChineseApplication } from "../support/application";
import type { FocusSearchReport } from "../../src/shared/focus-search-contracts";

// Production controls and IPC use a fresh fictional profile. Controlled failures
// hold only the named operation, preserve successful account observations, and
// exercise the initiating dialog's feedback rather than a background banner.
async function launch() {
  const profile = await mkdtemp(join(tmpdir(), "postrove-operation-ui-"));
  await writeFile(
    join(profile, "advisors.json"),
    JSON.stringify({ version: 1, enabled: ["reddit-ai-en"] }),
  );
  const app = await launchChineseApplication({
    args: ["."],
    env: {
      ...process.env,
      POSTROVE_TEST_DATA: profile,
      POSTROVE_RUN_MODE: "review",
      POSTROVE_EVAL_DENY_KEYCHAIN: "1",
    },
  });
  const page = await app.firstWindow();
  await expect(page.locator(".composer")).toBeVisible();
  return { profile, app, page };
}
async function seedSchedules(app: ElectronApplication) {
  const page = await app.firstWindow();
  return page.evaluate(async () => {
    const ids: string[] = [];
    for (const name of ["Fixture A", "Fixture B"]) {
      const reply = await window.postrove.saveFollow({
        name,
        question: name,
        advisorIds: ["reddit-ai-en"],
        platforms: ["reddit"],
        period: "all",
        schedule: {
          version: 2,
          cadence: "weekly",
          interval: 1,
          timeZone: "Asia/Shanghai",
          startDate: "2096-01-01",
          times: ["08:30"],
          weekdays: [1, 2, 3, 4, 5],
        },
      });
      if (!reply.ok) throw Error(reply.message);
      ids.push(reply.value.followId);
    }
    return ids;
  });
}

test("pending schedule actions remain local and retry repeats the failed mutation", async ({}, info) => {
  const { profile, app, page } = await launch();
  try {
    const [firstId] = await seedSchedules(app);
    await app.evaluate(({ ipcMain }, firstId) => {
      const handlers = (ipcMain as any)._invokeHandlers as Map<
        string,
        (...args: any[]) => any
      >;
      const original = handlers.get("search:pause-follow")!;
      const state: any = ((globalThis as any).operationFixture = { calls: 0 });
      handlers.set("search:pause-follow", (event, input) => {
        if (input.followId === firstId && ++state.calls === 1)
          return new Promise((resolve) => {
            state.release = resolve;
          });
        return original(event, input);
      });
    }, firstId);
    await page.getByRole("button", { name: "定时发送", exact: true }).click();
    const first = page
      .locator(".schedule-card")
      .filter({ hasText: "Fixture A" });
    const second = page
      .locator(".schedule-card")
      .filter({ hasText: "Fixture B" });
    await first.getByRole("switch").click();
    await expect(first.getByRole("switch")).toBeDisabled();
    await expect(second.getByRole("switch")).toBeEnabled();
    await second.getByRole("switch").click();
    await expect(second).toContainText("已暂停");
    await page.getByRole("button", { name: "话题", exact: true }).click();
    await page
      .getByRole("textbox", { name: "话题内容", exact: true })
      .fill("A separate action remains available");
    await expect(
      page.getByRole("button", { name: "发送", exact: true }),
    ).toBeEnabled();
    await app.evaluate(() =>
      (globalThis as any).operationFixture.release({
        ok: false,
        message: "操作未完成，请重试",
      }),
    );
    await page.getByRole("button", { name: "定时发送", exact: true }).click();
    await expect(first.getByRole("alert")).toContainText("操作未完成");
    await first.getByRole("button", { name: "重试", exact: true }).click();
    await expect(first).toContainText("已暂停");
    expect(
      await app.evaluate(() => (globalThis as any).operationFixture.calls),
    ).toBe(2);
    await expect(first.getByRole("alert")).toHaveCount(0);
    await page.screenshot({
      path: info.outputPath("scoped-actions.png"),
      animations: "disabled",
    });
  } finally {
    await app.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test("account and speech read failures retain recovery controls and expert disable shows schedule impact", async ({}, info) => {
  const { profile, app, page } = await launch();
  try {
    await seedSchedules(app);
    await app.evaluate(({ ipcMain }) => {
      const handlers = (ipcMain as any)._invokeHandlers as Map<
        string,
        (...args: any[]) => any
      >;
      const originalSpeech = handlers.get("speech-install:view")!;
      const state = ((globalThis as any).readFixture = {
        failAccounts: false,
        failSpeech: true,
        failBilibili: false,
        speechCalls: 0,
      });
      handlers.set("platform-connection:status", async () =>
        state.failAccounts
          ? { ok: false, message: "状态读取失败" }
          : {
              ok: true,
              value: {
                signedIn: true,
                installed: true,
                account: { name: "Fictional account" },
              },
            },
      );
      handlers.set("reading-site:status", async () =>
        state.failBilibili
          ? { ok: false, message: "状态读取失败" }
          : {
              ok: true,
              value: {
                signedIn: true,
                installed: true,
                account: { name: "Fictional Bilibili account" },
              },
            },
      );
      handlers.set("speech-install:view", (...args) => {
        state.speechCalls++;
        if (state.failSpeech) throw Error("Fixture read failed");
        return originalSpeech(...args);
      });
    });
    for (const language of ["zh-CN", "en"] as const) {
      await page.evaluate(
        (language) => window.postrove.saveLanguage(language),
        language,
      );
      await page.reload();
      const english = language === "en";
      await page
        .getByRole("button", {
          name: english ? "Manage members" : "管理成员",
          exact: true,
        })
        .click();
      const members = page.locator(".member-modal");
      const card = members.locator(".shared-adapter-card").first();
      await expect(card.locator(".platform-account-name")).toHaveText(
        "Fictional account",
      );
      if (english) {
        await app.evaluate(({ BrowserWindow }) => {
          (globalThis as any).readFixture.failAccounts = true;
          BrowserWindow.getAllWindows()[0].webContents.send("postrove:changed");
        });
      } else {
        await card
          .getByRole("button", { name: "管理配置", exact: true })
          .click();
        await app.evaluate(() => {
          (globalThis as any).readFixture.failAccounts = true;
        });
        await members
          .getByRole("button", { name: "检查登录状态", exact: true })
          .click();
        await expect(members.locator(".identity-status")).toHaveText(
          "读取失败",
        );
        await members
          .getByRole("button", { name: "返回成员列表", exact: true })
          .click();
      }
      await expect(card.locator(".connection-pill")).toHaveText(
        english ? "Read failed" : "读取失败",
      );
      await expect(card.locator(".platform-account-name")).toHaveText(
        "Fictional account",
      );
      await expect(card.locator(".connection-pill")).not.toHaveClass(
        /connected/,
      );
      await expect(card.getByRole("alert")).toBeVisible();
      await app.evaluate(() => {
        (globalThis as any).readFixture.failAccounts = false;
      });
      await card
        .getByRole("button", {
          name: english ? "Reload" : "重新加载",
          exact: true,
        })
        .click();
      await expect(card.locator(".connection-pill")).toHaveText(
        english ? "Connected" : "已连接",
      );
      await members
        .getByRole("switch", {
          name: english ? "Reddit AI · English" : "Reddit AI · 英文",
          exact: true,
        })
        .click();
      const impact = page.getByRole("dialog", {
        name: english ? "Disable expert" : "停用专家",
        exact: true,
      });
      await expect(impact).toContainText(
        english
          ? "Affects 2 scheduled messages; 2 will be paused."
          : "影响 2 条定时消息，其中 2 条将暂停",
      );
      await page.screenshot({
        path: info.outputPath(`disable-impact-${language}.png`),
        animations: "disabled",
      });
      await impact
        .getByRole("button", { name: english ? "Cancel" : "取消", exact: true })
        .click();
      await members
        .getByRole("button", { name: english ? "Close" : "关闭", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: english ? "Settings" : "设置",
          exact: true,
        })
        .click();
      if (!english) {
        await app.evaluate(() => {
          (globalThis as any).readFixture.failAccounts = true;
        });
        await page
          .getByRole("button", { name: "管理成员", exact: true })
          .click();
        const unknownMember = page.locator(".member-modal");
        const unknownCard = unknownMember
          .locator(".shared-adapter-card")
          .first();
        await expect(unknownCard.locator(".connection-pill")).toHaveText(
          "读取失败",
        );
        await unknownCard
          .getByRole("button", { name: "管理配置", exact: true })
          .click();
        await expect(unknownMember.locator(".setup-state")).not.toContainText(
          "Google Chrome",
        );
        await page.keyboard.press("Escape");
        await page
          .getByRole("button", { name: "能力地图", exact: true })
          .click();
        await page.locator(".capability-platform").first().click();
        await page.locator(".capability-setup-status").first().click();
        const requirements = page.getByRole("dialog").last();
        await expect(requirements.getByRole("alert")).toHaveText(
          "状态读取失败",
        );
        await app.evaluate(() => {
          (globalThis as any).readFixture.failAccounts = false;
        });
        await requirements
          .getByRole("button", { name: "重新加载", exact: true })
          .click();
        await expect(requirements.getByRole("alert")).toHaveCount(0);
        await page.keyboard.press("Escape");
        await page.keyboard.press("Escape");
        await page
          .getByRole("button", { name: "Bilibili", exact: true })
          .click();
        await page.locator(".capability-setup-status").last().click();
        const biliRequirements = page.getByRole("dialog").last();
        await expect(biliRequirements).toContainText(
          "Fictional Bilibili account",
        );
        await app.evaluate(({ BrowserWindow }) => {
          (globalThis as any).readFixture.failBilibili = true;
          BrowserWindow.getAllWindows()[0].webContents.send("postrove:changed");
        });
        await expect(biliRequirements.getByRole("alert")).toHaveText(
          "状态读取失败",
        );
        await expect(biliRequirements).toContainText(
          "Fictional Bilibili account",
        );
        await page.keyboard.press("Escape");
        const biliPlatform = page.getByRole("dialog").last();
        await expect(biliPlatform.getByRole("alert")).toHaveText(
          "状态读取失败",
        );
        await app.evaluate(() => {
          (globalThis as any).readFixture.failBilibili = false;
        });
        await biliPlatform
          .getByRole("button", { name: "重新加载", exact: true })
          .click();
        await expect(biliPlatform.getByRole("alert")).toHaveCount(0);
        await page.keyboard.press("Escape");
      }
      await page
        .getByRole("button", {
          name: english ? "Speech to text" : "语音转文字",
          exact: true,
        })
        .click();
      const speech = page.locator(".speech-install-card");
      await expect(speech.getByRole("status")).toHaveText(
        english ? "Read failed" : "读取失败",
      );
      await expect(speech).not.toContainText(
        english ? "Loading…" : "正在读取…",
      );
      await page.screenshot({
        path: info.outputPath(`read-failure-${language}.png`),
        animations: "disabled",
      });
      await app.evaluate(() => {
        (globalThis as any).readFixture.failSpeech = false;
      });
      await speech
        .getByRole("button", {
          name: english ? "Reload" : "重新加载",
          exact: true,
        })
        .click();
      await expect(speech.getByRole("alert")).toHaveCount(0);
      await expect(
        speech.getByRole("button", {
          name: english ? "Reload" : "重新加载",
          exact: true,
        }),
      ).toHaveCount(0);
      await app.evaluate(() => {
        (globalThis as any).readFixture.failSpeech = true;
      });
    }
    await page
      .getByRole("button", { name: "Manage members", exact: true })
      .click();
    await page
      .getByRole("switch", { name: "Reddit AI · English", exact: true })
      .click();
    const confirmation = page.getByRole("dialog", {
      name: "Disable expert",
      exact: true,
    });
    await expect(confirmation).toContainText(
      "Affects 2 scheduled messages; 2 will be paused.",
    );
    await page.screenshot({
      path: info.outputPath("disable-impact-en.png"),
      animations: "disabled",
    });
    await confirmation
      .getByRole("button", { name: "Disable expert", exact: true })
      .click();
    await expect
      .poll(async () => {
        const reply = await page.evaluate(() => window.postrove.follows());
        return reply.ok && reply.value.every((follow) => follow.paused);
      })
      .toBe(true);
    await info.attach("copy-admission", {
      body: JSON.stringify([
        {
          message: "Reload / 重新加载",
          source: "Required operation",
          trigger:
            "A configuration or snapshot read failed; retry reloads that state",
        },
        {
          message: "Read failed / 读取失败",
          source: "Required operation",
          trigger: "Account or speech state retrieval failed",
        },
        {
          message: "Affects {0} scheduled messages; {1} will be paused.",
          source: "Required operation",
          trigger:
            "Confirm disabling an expert present in future schedule recipients",
        },
      ]),
      contentType: "application/json",
    });
  } finally {
    await app.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test("delete and update errors remain in their active confirmation dialogs in both languages", async ({}, info) => {
  const { profile, app, page } = await launch();
  try {
    const demo = JSON.parse(
      await readFile(
        resolve("scripts/promo-video/demo-assets/fixture-zh-CN.json"),
        "utf8",
      ),
    );
    const report = demo["focus-search.json"].reports[0] as FocusSearchReport;
    report.question = "UI feedback topic";
    report.status = "running";
    await app.evaluate(({ ipcMain, BrowserWindow }, report) => {
      const handlers = (ipcMain as any)._invokeHandlers as Map<
        string,
        (...args: any[]) => any
      >;
      handlers.set("search:reports", async () => ({
        ok: true,
        value: [report],
      }));
      handlers.set("records:delete", async () => ({
        ok: false,
        message: "操作未完成，请重试",
      }));
      handlers.set("updates:view", async () => ({
        ok: true,
        value: {
          version: "0.1.0",
          state: "downloaded",
          release: { version: "0.1.1", notes: "" },
          jobs: [{ id: report.taskId, kind: "search", label: report.question }],
        },
      }));
      handlers.set("updates:install", async (_event, wait) =>
        wait
          ? { ok: false, message: "更新操作失败，请重试" }
          : { ok: true, value: { requiresWait: true } },
      );
      BrowserWindow.getAllWindows()[0].webContents.send("postrove:changed");
      BrowserWindow.getAllWindows()[0].webContents.send("updates:changed");
    }, report);
    for (const language of ["zh-CN", "en"] as const) {
      await page.evaluate(
        (language) => window.postrove.saveLanguage(language),
        language,
      );
      await page.reload();
      const english = language === "en";
      await page
        .locator(".topic-content")
        .filter({ hasText: "UI feedback topic" })
        .click();
      await page
        .getByRole("button", {
          name: english ? "Delete topic" : "删除话题",
          exact: true,
        })
        .click();
      const deletion = page.getByRole("dialog", {
        name: english ? "Stop and delete" : "停止并删除",
        exact: true,
      });
      await deletion
        .getByRole("button", {
          name: english ? "Stop and delete" : "停止并删除",
          exact: true,
        })
        .click();
      await expect(deletion.getByRole("alert")).toBeVisible();
      await expect(
        deletion.getByRole("button", {
          name: english ? "Stop and delete" : "停止并删除",
          exact: true,
        }),
      ).toBeEnabled();
      await page.screenshot({
        path: info.outputPath(`delete-error-${language}.png`),
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await expect(page.locator(".workspace-error")).toHaveCount(0);
      await page.keyboard.press("Escape");
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
          name: english ? "Install and restart" : "安装并重启",
          exact: true,
        })
        .click();
      const update = page.getByRole("dialog").last();
      await update
        .getByRole("button", {
          name: english ? "Install when tasks finish" : "任务完成后安装",
          exact: true,
        })
        .click();
      await expect(update.getByRole("alert")).toBeVisible();
      await page.screenshot({
        path: info.outputPath(`update-error-${language}.png`),
        animations: "disabled",
      });
      await page.keyboard.press("Escape");
      await expect(
        page.locator(".application-updates").getByRole("alert"),
      ).toHaveCount(0);
    }
  } finally {
    await app.close();
    await rm(profile, { recursive: true, force: true });
  }
});
