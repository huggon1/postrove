import { test, expect, _electron as electron } from "@playwright/test";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("Windows close exits cleanly and restart retains the workspace profile", async ({}, info) => {
  test.skip(process.platform !== "win32", "Native Windows window lifecycle");
  const root = await mkdtemp(join(tmpdir(), "postrove-windows-"));
  const profile = join(root, "应用 数据");
  await mkdir(profile);
  const launch = () =>
    electron.launch({
      args: ["."],
      env: {
        ...process.env,
        POSTROVE_TEST_DATA: profile,
        POSTROVE_RUN_MODE: "review",
      },
    });
  let application = await launch();
  try {
    let page = await application.firstWindow();
    await expect(page.getByRole("navigation")).toBeVisible();
    const saved = await page.evaluate(async () => {
      await window.postrove.saveAdvisorSettings({ enabled: ["reddit-ai-en"] });
      const result = await window.postrove.saveFollow({
        name: "Windows retained schedule",
        question: "A reading habit",
        advisorIds: ["reddit-ai-en"],
        platforms: ["reddit"],
        period: "all",
        schedule: { cadence: "daily", time: "23:59" },
      });
      if (result.ok)
        await window.postrove.setFollowPaused(result.value.followId, true);
      await window.postrove.saveLanguage("en");
      return result.ok;
    });
    expect(saved).toBe(true);
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].minimize(),
    );
    expect(application.process().exitCode).toBeNull();
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].restore(),
    );
    await page.screenshot({ path: info.outputPath("windows-workspace.png") });
    const child = application.process();
    await application.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].close(),
    );
    await expect.poll(() => child.exitCode, { timeout: 45000 }).toBe(0);
    await expect(
      readFile(join(profile, ".branchout-owner.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    application = await launch();
    page = await application.firstWindow();
    await page
      .getByRole("button", { name: "Scheduled sends", exact: true })
      .click();
    await expect(
      page.getByText("Windows retained schedule", { exact: true }).first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "About", exact: true }).click();
    const updates = page.getByRole("region", {
      name: "Application updates",
      exact: true,
    });
    await expect(updates).toContainText("installed");
    await page.screenshot({ path: info.outputPath("windows-restarted.png") });
  } finally {
    if (application.process().exitCode === null) await application.close();
    await rm(root, { recursive: true, force: true });
  }
});
