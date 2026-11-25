import { expect, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultPiOptions } from "../../src/shared/model-contracts";
import { launchChineseApplication } from "../support/application";

for (const language of ["zh-CN", "en"] as const) {
  test(`topic connection recovery in ${language}`, async ({}, info) => {
    test.setTimeout(75_000);
    const zh = language === "zh-CN";
    const root = await mkdtemp(join(tmpdir(), "postrove-connection-recovery-"));
    const session = join(root, "platform-browser", "shared");
    const id = randomUUID();
    const credentials = join(root, "pi", "connections", id);
    await Promise.all([
      mkdir(session, { recursive: true }),
      mkdir(credentials, { recursive: true }),
    ]);
    const selected = [
      "x-grok-zh",
      "x-grok-en",
      "xiaohongshu-diandian-zh",
      "reddit-ai-en",
    ] as const;
    const status = join(session, "postrove-session-status.json");
    const ended = "2026-01-01T00:00:00.000Z";
    const historical = [true, false].map((oauth) => ({
      reportId: randomUUID(),
      taskId: randomUUID(),
      createdAt: ended,
      finishedAt: ended,
      status: "failed",
      taskOutcome: "failed",
      question: oauth ? "Previous OAuth failure" : "Previous API key failure",
      period: "all",
      platforms: ["x"],
      sections: (["zh", "en"] as const).map((locale) => ({
        sectionId: randomUUID(),
        advisorId: `x-grok-${locale}`,
        platform: "x",
        promptLanguage: locale === "zh" ? "zh-CN" : "en",
        prompt: "Previous question",
        state: "failed",
        rawReply: "",
        candidates: [],
        error: "Fixture authorization failure",
        failureStage: "preparation",
        modelAuthorization: { connectionId: id, providerName: "OpenAI", oauth },
      })),
      submissions: [],
    }));
    const cookies = [
      { name: "auth_token", domain: ".x.com", expires: 1 },
      { name: "ct0", domain: ".x.com", expires: 1 },
      { name: "web_session", domain: ".xiaohongshu.com", expires: -1 },
    ];
    await Promise.all([
      writeFile(status, JSON.stringify({ cookies })),
      writeFile(
        join(root, "focus-search.json"),
        JSON.stringify({
          version: 1,
          reports: historical,
          follows: [],
        }),
      ),
      writeFile(join(root, "preferences.json"), JSON.stringify({ language })),
      writeFile(
        join(root, "advisors.json"),
        JSON.stringify({ version: 1, enabled: selected }),
      ),
      writeFile(
        join(root, "pi", "connections.json"),
        JSON.stringify({
          version: 2,
          connections: [
            {
              id,
              providerId: "openai",
              modelId: "gpt-6.1-sol",
              name: "Fixture model",
              options: defaultPiOptions(),
              useEnvironment: false,
            },
          ],
        }),
      ),
      writeFile(
        join(credentials, "auth.json"),
        JSON.stringify({
          openai: {
            type: "oauth",
            access: "fictional-access",
            refresh: "fictional-refresh",
            clientId: "fictional-client",
            expires: 1,
            accountId: "fictional-account",
          },
        }),
      ),
    ]);
    const submitted: string[] = [];
    let requireAccountAction = false;
    const server = createServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(chunk);
      const { advisorId } = JSON.parse(Buffer.concat(chunks).toString());
      submitted.push(advisorId);
      const result =
        requireAccountAction && advisorId === "reddit-ai-en"
          ? { error: "action_required" }
          : advisorId === "xiaohongshu-diandian-zh"
            ? { error: "verification_required" }
            : {
                rawReply: "Fixture Reddit reply",
                candidates: [],
                citationExtraction: { state: "empty" },
              };
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify(result));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("Fixture server unavailable");
    let app: Awaited<ReturnType<typeof launchChineseApplication>> | undefined;
    try {
      app = await launchChineseApplication({
        args: ["."],
        env: {
          ...process.env,
          POSTROVE_RUN_MODE: "test",
          POSTROVE_TEST_DATA: root,
          POSTROVE_TEST_ENDPOINT: `http://127.0.0.1:${address.port}`,
        },
      });
      const page = await app.firstWindow();
      await app.evaluate(({ ipcMain }) => {
        const capture = globalThis as typeof globalThis & {
          accountActions?: string[];
        };
        capture.accountActions = [];
        for (const channel of [
          "platform-connection:login",
          "platform-connection:open-account-action",
        ]) {
          ipcMain.removeHandler(channel);
          ipcMain.handle(channel, (_event, id) => {
            capture.accountActions!.push(`${channel}:${id}`);
            return { ok: true };
          });
        }
      });
      const composer = page.locator(".composer");
      const draft = composer.getByRole("textbox");
      const login = composer.getByRole("button", {
        name: zh ? "登录 X" : "Sign in to X",
        exact: true,
      });
      await expect(login).toHaveCount(1);
      await login.click();
      const partial = composer.getByRole("button", {
        name: zh ? "仅发送给可用成员" : "Send to available members only",
      });
      await draft.fill("Connection fixture");
      await expect(partial).toBeEnabled();
      await draft.press(
        process.platform === "darwin" ? "Meta+Enter" : "Control+Enter",
      );
      expect(submitted).toEqual([]);
      await page.screenshot({
        path: info.outputPath("composer-platform.png"),
        animations: "disabled",
      });
      await partial.click();
      const thread = page.locator(".thread-modal");
      await expect(thread.getByText("Fixture Reddit reply")).toBeVisible();
      expect(submitted.sort()).toEqual([
        "reddit-ai-en",
        "xiaohongshu-diandian-zh",
      ]);
      const verify = thread.getByRole("button", {
        name: zh ? "打开平台完成验证" : "Open platform to verify",
      });
      await expect(verify).toBeVisible();
      await verify.click();
      await thread
        .getByRole("button", { name: zh ? "关闭" : "Close", exact: true })
        .click();
      expect(
        await app.evaluate(() => (globalThis as any).accountActions),
      ).toEqual([
        "platform-connection:login:x-grok",
        "platform-connection:open-account-action:xiaohongshu-diandian",
      ]);

      requireAccountAction = true;
      const second = await page.evaluate(() =>
        window.postrove.startFocusSearch({
          question: "Account agreement fixture",
          advisorIds: ["reddit-ai-en"],
          platforms: ["reddit"],
        }),
      );
      expect(second.ok).toBe(true);
      await page
        .getByRole("button", { name: /Account agreement fixture/ })
        .filter({ hasText: "Account agreement fixture" })
        .first()
        .click();
      const confirm = thread.getByRole("button", {
        name: zh ? "打开平台处理" : "Open platform to continue",
      });
      await expect(confirm).toBeVisible();
      await confirm.click();
      await page.screenshot({
        path: info.outputPath("topic-account-action.png"),
        animations: "disabled",
      });
      await thread
        .getByRole("button", { name: zh ? "关闭" : "Close", exact: true })
        .click();

      const closeThread = () =>
        thread
          .getByRole("button", { name: zh ? "关闭" : "Close", exact: true })
          .click();
      for (const report of historical) {
        await page
          .locator(`[data-topic="${report.reportId}"] .topic-content`)
          .click();
        const label = report.sections[0].modelAuthorization.oauth
          ? zh
            ? "重新授权 OpenAI"
            : "Reauthorize OpenAI"
          : zh
            ? "重新认证 OpenAI"
            : "Reauthenticate OpenAI";
        await expect(thread.getByRole("button", { name: label })).toHaveCount(
          1,
        );
        await expect(
          thread.getByText("Fixture authorization failure"),
        ).toHaveCount(0);
        await page.screenshot({
          path: info.outputPath(`thread-${report.reportId}.png`),
          animations: "disabled",
        });
        await closeThread();
      }

      await app.evaluate(() => {
        const capture = globalThis as typeof globalThis & {
          refreshRequests?: number;
        };
        capture.refreshRequests = 0;
        globalThis.fetch = async (input) => {
          if (
            String(input) === "https://auth.openai.com/api/accounts/oauth/token"
          ) {
            capture.refreshRequests!++;
            return Response.json({ error: "invalid_grant" }, { status: 400 });
          }
          return new Response(null, { status: 503 });
        };
      });
      await draft.fill("Keep this question while I reconnect");
      const activation = await page.evaluate(
        (connectionId) =>
          window.postrove.activateModelConnection({ connectionId }),
        id,
      );
      expect(activation.ok).toBe(true);
      const reauthorize = composer.getByRole("button", {
        name: zh ? "重新授权 OpenAI" : "Reauthorize OpenAI",
      });
      await expect(reauthorize).toBeVisible();
      const send = composer.getByRole("button", {
        name: zh ? "发送" : "Send",
        exact: true,
      });
      await expect(send).toBeDisabled();
      expect(
        await app.evaluate(() => (globalThis as any).refreshRequests),
      ).toBe(1);
      const blocked = await page.evaluate(() =>
        window.postrove.startFocusSearch({
          question: "Must not create a topic",
          advisorIds: ["reddit-ai-en"],
          platforms: ["reddit"],
        }),
      );
      expect(blocked).toMatchObject({ ok: false, message: "请先恢复连接" });
      expect(submitted.sort()).toEqual([
        "reddit-ai-en",
        "reddit-ai-en",
        "xiaohongshu-diandian-zh",
      ]);
      await app.evaluate(({ ipcMain, BrowserWindow }) => {
        const handlers = (ipcMain as any)._invokeHandlers as Map<
          string,
          (...args: any[]) => Promise<any>
        >;
        const original = handlers.get("search:readiness")!;
        (globalThis as any).restoreReadiness = () => {
          handlers.set("search:readiness", original);
          BrowserWindow.getAllWindows()[0].webContents.send("postrove:changed");
        };
        handlers.set("search:readiness", async (...args) => {
          const reply = await original(...args);
          return {
            ...reply,
            value: { signInRequired: [] },
          };
        });
        BrowserWindow.getAllWindows()[0].webContents.send("postrove:changed");
      });
      await expect(send).toBeEnabled();
      await send.click();
      await expect(
        composer.getByText(
          zh ? "请先恢复连接" : "Restore the connection before sending",
          { exact: true },
        ),
      ).toBeVisible();
      await app.evaluate(() => (globalThis as any).restoreReadiness());
      await expect(reauthorize).toBeVisible();
      await expect(draft).toHaveValue("Keep this question while I reconnect");
      await page.screenshot({
        path: info.outputPath("composer-authorization.png"),
        animations: "disabled",
      });
      await page.setViewportSize({ width: 390, height: 760 });
      await expect(reauthorize).toBeInViewport();
      await expect(send).toBeInViewport();
      expect(
        await page.evaluate(() => {
          const root = document.documentElement;
          return root.scrollWidth - root.clientWidth;
        }),
      ).toBe(0);
      await page.screenshot({
        path: info.outputPath("composer-authorization-compact.png"),
        animations: "disabled",
      });
      await reauthorize.click();
      const editor = page.getByRole("dialog");
      await expect(
        editor.getByRole("button", {
          name: "Sign in with ChatGPT",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        editor.getByRole("button", {
          name: zh ? "保存连接" : "Save connection",
        }),
      ).toHaveCount(0);
      await expect(
        editor.getByText(zh ? "请完成认证" : "Complete authentication", {
          exact: true,
        }),
      ).toBeVisible();
      await editor
        .getByRole("button", { name: zh ? "取消" : "Cancel", exact: true })
        .click();
      await page
        .getByRole("button", { name: zh ? "话题" : "Topics", exact: true })
        .click();
      await expect(draft).toHaveValue("Keep this question while I reconnect");
      const persisted = JSON.parse(
        await readFile(join(credentials, "auth.json"), "utf8"),
      );
      expect(persisted.openai.refresh).toBe("fictional-refresh");
    } finally {
      await app?.close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(root, { recursive: true, force: true });
    }
  });
}
