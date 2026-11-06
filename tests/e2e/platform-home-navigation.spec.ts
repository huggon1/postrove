import { test, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserContext } from "playwright-core";
import { PlatformBrowser } from "../../src/main/services/platform-browser";

for (const warmHeadless of [false, true])
  test(`account home opens after navigation commits ${warmHeadless ? "from a headless session" : "from a cold profile"}`, async () => {
    test.setTimeout(90000);
    const root = await mkdtemp(join(tmpdir(), "postrove-home-navigation-"));
    const browser = new PlatformBrowser(root, () => {}, undefined, {
      headless: true,
    });
    let releaseScript!: () => void;
    const scriptReady = new Promise<void>(
      (resolve) => (releaseScript = resolve),
    );
    const contexts = new WeakSet<BrowserContext>();
    let seeded = false;
    // The production mode switch creates a fresh client context. Install controlled
    // responses on that context while retaining the real launcher and cookie transfer.
    const internal = browser as unknown as {
      openQueuedContext(
        site: string,
        headless?: boolean,
      ): Promise<BrowserContext>;
    };
    const open = internal.openQueuedContext.bind(browser);
    internal.openQueuedContext = async (site, headless) => {
      const context = await open(site, headless);
      if (!contexts.has(context)) {
        contexts.add(context);
        context.setDefaultNavigationTimeout(300);
        context.request.get = (async () => ({
          ok: () => false,
        })) as unknown as typeof context.request.get;
        if (!seeded) {
          await context.addCookies([
            {
              name: "web_session",
              value: "fictional-retained-account",
              domain: ".xiaohongshu.com",
              path: "/",
            },
          ]);
          seeded = true;
        }
        await context.route("https://www.xiaohongshu.com/**", async (route) => {
          if (route.request().url().endsWith("/slow-script.js")) {
            await scriptReady;
            await route.fulfill({
              contentType: "application/javascript",
              body: "",
            });
          } else
            await route.fulfill({
              contentType: "text/html",
              body: '<main><h1>Fixture account home</h1></main><script src="/slow-script.js"></script><script>window.__INITIAL_STATE__={user:{userInfo:{nickname:"Late account name",redId:"fixture-late"}}};</script>',
            });
        });
      }
      return context;
    };
    try {
      if (warmHeadless) await browser.context("xiaohongshu", true);
      await browser.openHome("xiaohongshu");
      const context = await browser.context("xiaohongshu", false);
      const home = context
        .pages()
        .find((page) => page.url() === "https://www.xiaohongshu.com/explore")!;
      expect(home).toBeTruthy();
      expect(await home.evaluate(() => document.readyState)).toBe("loading");
      expect(await home.getByRole("heading").innerText()).toBe(
        "Fixture account home",
      );
      expect(
        (await context.cookies()).find(
          (cookie) => cookie.name === "web_session",
        )?.value,
      ).toBe("fictional-retained-account");
      expect((await browser.status("xiaohongshu")).account).toBeUndefined();
      releaseScript();
      await home.waitForLoadState("domcontentloaded", { timeout: 5000 });
      expect((await browser.status("xiaohongshu")).account).toBeUndefined();
      await browser.refreshAccount("xiaohongshu");
      expect((await browser.status("xiaohongshu")).account).toEqual({
        name: "Late account name",
        handle: "fixture-late",
      });
      const version = await context.newPage();
      await version.goto("chrome://version", { timeout: 12000 });
      expect(await version.locator("#command_line").innerText()).not.toContain(
        "--headless",
      );
    } finally {
      releaseScript();
      await browser.shutdown();
      await rm(root, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 300,
      });
    }
  });

test("account home reports a failed document navigation", async () => {
  const root = await mkdtemp(join(tmpdir(), "postrove-home-failure-"));
  const browser = new PlatformBrowser(root, () => {}, undefined, {
    headless: false,
  });
  try {
    const context = await browser.context("xiaohongshu", false);
    await context.route("https://www.xiaohongshu.com/**", (route) =>
      route.abort("failed"),
    );
    await expect(browser.openHome("xiaohongshu")).rejects.toThrow(
      /net::ERR_FAILED/,
    );
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
