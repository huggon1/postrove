import { test, expect } from "@playwright/test";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PlatformBrowser } from "../../src/main/services/platform-browser";
import { accountFromPage } from "../../src/main/services/platform-account";
import { launchChineseApplication } from "../support/application";

test("account names use authenticated self controls and home opens the same Chrome session", async () => {
  test.setTimeout(90000);
  const root = await mkdtemp(join(tmpdir(), "postrove-account-session-"));
  const browser = new PlatformBrowser(root, () => {}, undefined, {
    headless: false,
  });
  try {
    const context = await browser.context("x", false);
    await context.route("**/*", (route) => {
      const url = route.request().url();
      const body = url.includes("/api/me.json")
        ? JSON.stringify({ data: { name: "fixture_reddit" } })
        : url.includes("/x/web-interface/nav")
          ? JSON.stringify({
              code: 0,
              data: { isLogin: true, uname: "示例哔哩", mid: 12345 },
            })
          : url.includes("/user/selfinfo")
            ? JSON.stringify({
                data: { nickname: "示例红薯", red_id: "fixture_xhs" },
              })
            : '<header><button data-testid="SideNav_AccountSwitcher_Button"><span>Example X</span><span>@example_x</span></button></header><article>Unrelated source author</article>';
      return route.fulfill({
        contentType:
          url.includes("/api/") || url.includes("/x/web-interface/")
            ? "application/json"
            : "text/html",
        body,
      });
    });
    const requestedAccounts: string[] = [];
    context.request.get = (async (url: string) => {
      requestedAccounts.push(url);
      return {
        ok: () => true,
        json: async () =>
          url.includes("/api/me.json")
            ? { data: { name: "fixture_reddit" } }
            : url.includes("/x/web-interface/nav")
              ? {
                  code: 0,
                  data: { isLogin: true, uname: "示例哔哩", mid: 12345 },
                }
              : { data: { nickname: "示例红薯", red_id: "fixture_xhs" } },
      };
    }) as typeof context.request.get;
    await context.addCookies([
      {
        name: "auth_token",
        value: "fictional-account-one",
        domain: ".x.com",
        path: "/",
      },
      { name: "ct0", value: "fictional-csrf", domain: ".x.com", path: "/" },
      {
        name: "web_session",
        value: "fictional-xhs",
        domain: ".xiaohongshu.com",
        path: "/",
      },
      {
        name: "SESSDATA",
        value: "fictional-bili",
        domain: ".bilibili.com",
        path: "/",
      },
      {
        name: "reddit_session",
        value: "fictional-reddit",
        domain: ".reddit.com",
        path: "/",
      },
    ]);
    await browser.openHome("x");
    await browser.refreshAccount("x");
    const home = context
      .pages()
      .find((page) => page.url() === "https://x.com/home")!;
    expect(home).toBeTruthy();
    expect((await browser.status("x")).account).toEqual({
      name: "Example X",
      handle: "@example_x",
    });
    expect(
      (await context.cookies()).find((cookie) => cookie.name === "auth_token")
        ?.value,
    ).toBe("fictional-account-one");
    // Source pages and status reads retain the saved name until explicit refresh.
    await home.setContent(
      '<button data-testid="SideNav_AccountSwitcher_Button">Changed name<span>@changed</span></button>',
    );
    const reads = requestedAccounts.length;
    for (let i = 0; i < 3; i++)
      expect((await browser.status("x")).account?.name).toBe("Example X");
    expect(requestedAccounts).toHaveLength(reads);
    await context.route("https://x.com/home", (route) =>
      route.fulfill({
        body: '<button data-testid="SideNav_AccountSwitcher_Button">Refreshed name<span>@refreshed</span></button>',
        contentType: "text/html",
      }),
    );
    await browser.refreshAccount("x");
    expect((await browser.status("x")).account?.name).toBe("Refreshed name");
    await context.route("https://x.com/home", (route) => route.abort("failed"));
    await expect(browser.refreshAccount("x")).rejects.toThrow();
    expect((await browser.status("x")).account?.name).toBe("Refreshed name");
    await context.unroute("https://x.com/home");
    // A changed session cannot inherit the identity still painted on an old tab.
    await context.addCookies([
      {
        name: "auth_token",
        value: "fictional-account-two",
        domain: ".x.com",
        path: "/",
      },
    ]);
    expect((await browser.status("x")).account).toBeUndefined();
    await home.reload();
    await browser.refreshAccount("x");
    expect((await browser.status("x")).account?.name).toBe("Example X");
    await home.setContent("<article><h1>Another author</h1></article>");
    expect(await accountFromPage("x", home)).toBeUndefined();
    await home.setContent(
      '<a data-testid="AppTabBar_Profile_Link" href="/fixture_x">Profile</a>',
    );
    expect(await accountFromPage("x", home)).toEqual({
      name: "@fixture_x",
      handle: "@fixture_x",
    });
    await home.goto("https://gemini.google.com/app");
    await home.setContent(
      '<a aria-label="Google Account: Example Google (example@example.test)">Account</a><article>Another author</article>',
    );
    expect(await accountFromPage("gemini", home)).toEqual({
      name: "Example Google",
      handle: "example@example.test",
    });
    await context.route("https://ogs.google.com/widget/account", (route) =>
      route.fulfill({
        contentType: "text/html; charset=utf-8",
        body: '<a aria-label="Google 账户： Example Frame (frame@example.test)">Account</a>',
      }),
    );
    await home.setContent(
      '<iframe src="https://ogs.google.com/widget/account"></iframe>',
    );
    await home.frameLocator("iframe").locator("[aria-label]").waitFor();
    expect(await accountFromPage("gemini", home)).toEqual({
      name: "Example Frame",
      handle: "frame@example.test",
    });
    await home.goto("https://www.xiaohongshu.com/explore");
    await home.evaluate(() =>
      Object.assign(window, {
        __INITIAL_STATE__: {
          user: { userInfo: { nickname: "示例红薯", redId: "fixture_xhs" } },
        },
      }),
    );
    expect(await accountFromPage("xiaohongshu", home)).toEqual({
      name: "示例红薯",
      handle: "fixture_xhs",
    });
    // API identity is scoped to the authenticated session and shared browser.
    await browser.openHome("bilibili");
    await browser.refreshAccount("bilibili");
    expect((await browser.status("bilibili")).account?.name).toBe("示例哔哩");
    await browser.openHome("reddit");
    await browser.refreshAccount("reddit");
    expect((await browser.status("reddit")).account?.handle).toBe(
      "u/fixture_reddit",
    );
    await browser.logout("bilibili");
    expect((await browser.status("bilibili")).account).toBeUndefined();
    expect((await browser.status("x")).signedIn).toBe(true);
    const saved = await readFile(
      join(root, "shared/postrove-session-status.json"),
      "utf8",
    );
    expect(saved).not.toContain("fictional-account");
    expect(saved).not.toContain("fictional-bili");
    await browser.shutdown();
    const restarted = new PlatformBrowser(root, () => {});
    expect((await restarted.status("x")).account?.name).toBe("Example X");
    expect((await restarted.status("bilibili")).account).toBeUndefined();
    await restarted.shutdown();
  } finally {
    await browser.shutdown();
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 300,
    });
  }
});

// Copy admission: the user requested the account name in connection settings.
// Open account home names the icon's required action. Account name pending reports
// a connected session whose self identity has yet to be observed. Existing login
// failure feedback reports a failed home-open operation and retains the controls.
test("connection settings display account names and home icons in both languages and widths", async ({}, info) => {
  test.setTimeout(90000);
  const root = await mkdtemp(join(tmpdir(), "postrove-account-layout-"));
  await mkdir(join(root, "platform-browser/shared"), { recursive: true });
  await writeFile(
    join(root, "platform-browser/shared/postrove-session-status.json"),
    JSON.stringify({
      cookies: [
        { name: "auth_token", domain: ".x.com", expires: -1 },
        { name: "ct0", domain: ".x.com", expires: -1 },
        { name: "web_session", domain: ".xiaohongshu.com", expires: -1 },
        { name: "SID", domain: ".google.com", expires: -1 },
        { name: "reddit_session", domain: ".reddit.com", expires: -1 },
        { name: "SESSDATA", domain: ".bilibili.com", expires: -1 },
      ],
      accounts: Object.fromEntries(
        ["x", "xiaohongshu", "reddit", "bilibili"].map((site) => [
          site,
          {
            session: "a".repeat(64),
            account: { name: `Example ${site}`, handle: `example_${site}` },
          },
        ]),
      ),
    }),
  );
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
    await app.evaluate(({ ipcMain }) => {
      const fixture = globalThis as unknown as { openedAccounts: string[] };
      fixture.openedAccounts = [];
      for (const channel of [
        "platform-connection:home",
        "reading-site:home",
        "platform-connection:refresh-account",
        "reading-site:refresh-account",
      ]) {
        ipcMain.removeHandler(channel);
        ipcMain.handle(channel, (_event, id: string) => {
          fixture.openedAccounts.push(`${channel}:${id}`);
          return { ok: true, value: undefined };
        });
      }
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.getByRole("button", { name: "设置", exact: true }).click();
    for (const language of ["zh-CN", "en"] as const) {
      const zh = language === "zh-CN";
      if (!zh) {
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
          .getByRole("button", {
            name: zh ? "AI 成员" : "AI members",
            exact: true,
          })
          .click();
        await expect(page.locator(".settings-member-card")).toHaveCount(4);
        await expect(
          page.locator(".settings-member-card").first(),
        ).toContainText("Example x");
        const firstCard = page.locator(".settings-member-card").first();
        for (const label of [
          zh ? "打开账号主页" : "Open account home",
          zh ? "刷新账号名称" : "Refresh account name",
        ]) {
          const icon = firstCard.getByRole("button", {
            name: label,
            exact: true,
          });
          await icon.hover();
          await expect(icon.getByRole("tooltip")).toBeVisible();
          await expect(icon.getByRole("tooltip")).toHaveText(label);
          await icon.focus();
          await expect(icon.getByRole("tooltip")).toBeVisible();
          const bounds = await icon.getByRole("tooltip").boundingBox();
          expect(bounds!.x).toBeGreaterThanOrEqual(0);
          expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport.width);
          await page.screenshot({
            path: info.outputPath(
              `${language}-${size}-${label.includes("刷新") || label.includes("Refresh") ? "refresh" : "home"}-tooltip.png`,
            ),
            animations: "disabled",
          });
          await icon.click();
        }
        await page.screenshot({
          path: info.outputPath(`${language}-${size}-settings.png`),
          animations: "disabled",
        });
        await page
          .locator(".settings-member-card")
          .first()
          .locator("button")
          .first()
          .click();
        const dialog = page.locator(".member-modal");
        await expect(dialog.locator(".platform-account-name")).toContainText(
          "Example x",
        );
        await expect(
          dialog.getByRole("button", {
            name: zh ? "打开平台" : "Open",
            exact: true,
          }),
        ).toBeVisible();
        if (size === "compact") {
          const heading = await dialog
            .locator(".connection-identity h3")
            .boundingBox();
          const status = await dialog.locator(".identity-status").boundingBox();
          expect(status!.x).toBeGreaterThan(heading!.x + heading!.width + 8);
        }
        await page.screenshot({
          path: info.outputPath(`${language}-${size}-account.png`),
          animations: "disabled",
        });
        await dialog
          .getByRole("button", { name: zh ? "关闭" : "Close", exact: true })
          .click();
        await page
          .locator(".settings-member-card")
          .nth(2)
          .locator("button")
          .first()
          .click();
        await expect(
          page.locator(".member-modal .platform-account-name"),
        ).toHaveText(zh ? "账号名称待识别" : "Account name pending");
        await page.screenshot({
          path: info.outputPath(`${language}-${size}-pending-account.png`),
          animations: "disabled",
        });
        await page
          .locator(".member-modal")
          .getByRole("button", { name: zh ? "关闭" : "Close", exact: true })
          .click();
        await page
          .getByRole("button", {
            name: zh ? "能力地图" : "Capabilities",
            exact: true,
          })
          .click();
        await page
          .getByRole("button", { name: "Bilibili", exact: true })
          .click();
        await page
          .getByRole("button", {
            name: new RegExp(
              zh ? "^账号可见字幕 ·" : "^Account-accessible captions ·",
            ),
          })
          .click();
        const requirement = page.getByRole("dialog").last();
        await expect(requirement).toContainText("Example bilibili");
        await requirement
          .getByRole("button", {
            name: zh ? "打开账号主页" : "Open account home",
            exact: true,
          })
          .click();
        await page.screenshot({
          path: info.outputPath(`${language}-${size}-bilibili.png`),
          animations: "disabled",
        });
        await requirement
          .getByRole("button", { name: zh ? "关闭" : "Close", exact: true })
          .click();
        await page
          .getByRole("dialog")
          .last()
          .getByRole("button", { name: zh ? "关闭" : "Close", exact: true })
          .click();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
      }
    }
    const opened = await app.evaluate(
      () =>
        (globalThis as unknown as { openedAccounts: string[] }).openedAccounts,
    );
    expect(opened).toEqual([
      "platform-connection:home:x-grok",
      "platform-connection:refresh-account:x-grok",
      "reading-site:home:bilibili",
      "platform-connection:home:x-grok",
      "platform-connection:refresh-account:x-grok",
      "reading-site:home:bilibili",
      "platform-connection:home:x-grok",
      "platform-connection:refresh-account:x-grok",
      "reading-site:home:bilibili",
      "platform-connection:home:x-grok",
      "platform-connection:refresh-account:x-grok",
      "reading-site:home:bilibili",
    ]);
    expect(errors).toEqual([]);
    await info.attach("copy-admission", {
      body: JSON.stringify({
        accountName:
          "Explicit user request: show configured account name in connection settings",
        openAccountHome:
          "Required operation: opens this connection's homepage in shared Chrome",
        pendingName:
          "Required state: connected session without observed self identity",
      }),
      contentType: "application/json",
    });
  } finally {
    await app.close();
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 300,
    });
  }
});
