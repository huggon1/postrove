import { test, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PlatformBrowser } from "../../src/main/services/platform-browser";

test("login captures one account snapshot; explicit refresh updates it", async () => {
  test.setTimeout(60000);
  const root = await mkdtemp(join(tmpdir(), "postrove-account-login-"));
  const browser = new PlatformBrowser(root, () => {}, undefined, {
    headless: false,
  });
  try {
    const context = await browser.context("x", false);
    let homeVisits = 0;
    let name = "First account";
    await context.route("https://x.com/**", async (route) => {
      if (route.request().url() === "https://x.com/home") homeVisits++;
      await route.fulfill({
        contentType: "text/html",
        body: `<button data-testid="SideNav_AccountSwitcher_Button">${name}<span>@fixture_account</span></button>`,
      });
    });
    await browser.login("x");
    await context.addCookies([
      {
        name: "auth_token",
        value: "fictional-login",
        domain: ".x.com",
        path: "/",
      },
      { name: "ct0", value: "fictional-csrf", domain: ".x.com", path: "/" },
    ]);
    await expect
      .poll(async () => (await browser.status("x")).account?.name)
      .toBe("First account");
    expect(homeVisits).toBe(1);
    name = "Renamed account";
    await new Promise((resolve) => setTimeout(resolve, 3500));
    expect((await browser.status("x")).account?.name).toBe("First account");
    expect(homeVisits).toBe(1);
    await browser.refreshAccount("x");
    expect((await browser.status("x")).account?.name).toBe("Renamed account");
    expect(homeVisits).toBe(2);
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
