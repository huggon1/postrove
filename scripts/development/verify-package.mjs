import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { join, resolve } from "node:path";
import { _electron as electron, expect } from "@playwright/test";

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log(
    "Usage: npm run test:package -- [--app PATH] [--profile PATH] [--output PATH]",
  );
  process.exit(0);
}
const options = new Map();
for (let i = 0; i < args.length; i += 2) {
  assert.ok(
    ["--app", "--profile", "--output"].includes(args[i]),
    "Unknown option",
  );
  assert.ok(
    args[i + 1] && !args[i + 1].startsWith("--"),
    "Option requires a path",
  );
  options.set(args[i], resolve(args[i + 1]));
}
assert.ok(
  ["darwin", "win32"].includes(process.platform),
  "Use a native macOS or Windows runner",
);
const windows = process.platform === "win32";
const appPath =
  options.get("--app") ??
  resolve(windows ? "release/win-unpacked" : "release/mac-arm64/Postrove.app");
const output = options.get("--output") ?? resolve(".tmp/package-verification");
const resources = join(appPath, windows ? "resources" : "Contents/Resources");
const expected = JSON.parse(await readFile("package.json", "utf8")).version;
await mkdir(output, { recursive: true });
const profile =
  options.get("--profile") ?? (await mkdtemp(join(output, "profile-")));
await mkdir(profile, { recursive: true });
let application,
  page,
  phase = "resources";
const rendererErrors = [];
const env = { ...process.env };
for (const key of Object.keys(env))
  if (key.startsWith("POSTROVE_") || key === "ELECTRON_RUN_AS_NODE")
    delete env[key];
env.POSTROVE_TEST_DATA = profile;
env.POSTROVE_RUN_MODE = "review";
const launch = async () => {
  application = await electron.launch({
    executablePath: join(
      appPath,
      windows ? "Postrove.exe" : "Contents/MacOS/Postrove",
    ),
    args: [],
    env,
    timeout: 30000,
  });
  page = await application.firstWindow({ timeout: 30000 });
  page.on("pageerror", (error) => rendererErrors.push(error.name));
  await expect(page.getByRole("navigation")).toBeVisible({ timeout: 30000 });
};
try {
  await access(join(resources, "app.asar"));
  await access(join(resources, "app-update.yml"));
  await access(
    join(resources, `.runtime/xiaohongshu-mcp${windows ? ".exe" : ""}`),
    windows ? constants.F_OK : constants.X_OK,
  );
  await access(join(resources, ".runtime/XIAOHONGSHU-LICENSE"));
  for (const name of ["yt-dlp", "deno"])
    await access(
      join(resources, ".runtime/youtube", name + (windows ? ".exe" : "")),
      windows ? constants.F_OK : constants.X_OK,
    );
  for (const name of ["runtime.json", "YT-DLP-LICENSE", "DENO-LICENSE"])
    await access(join(resources, ".runtime/youtube", name));
  phase = "startup";
  await launch();
  await page.evaluate(() => window.postrove.saveLanguage("zh-CN"));
  const identity = await application.evaluate(({ app }) => {
    const fs = process.getBuiltinModule("fs"),
      path = process.getBuiltinModule("path");
    const root = app.getAppPath();
    for (const name of [
      "dist/main/preload.cjs",
      "dist/worker/model-worker.mjs",
      "dist/worker/jobs/browser/worker-entry.mjs",
      "dist/worker/jobs/forwarding/worker-entry.mjs",
      "dist/renderer/index.html",
      "dist/assets/postrove.png",
    ])
      if (!fs.existsSync(path.join(root, name)))
        throw Error("Missing application resource");
    for (const name of [
      "update-test.cjs",
      "upgrade-trial.cjs",
      "windows-upgrade-check.cjs",
    ])
      if (fs.existsSync(path.join(root, "dist/main", name)))
        throw Error("Test entry included in release package");
    return {
      packaged: app.isPackaged,
      version: app.getVersion(),
      profile: app.getPath("userData"),
      build: JSON.parse(
        fs.readFileSync(path.join(root, "dist/build-identity.json"), "utf8"),
      ),
    };
  });
  assert.equal(identity.packaged, true);
  assert.equal(identity.version, expected);
  assert.equal(identity.build.version, expected);
  assert.equal(identity.profile, profile);
  if (process.env.GITHUB_SHA) {
    assert.equal(identity.build.revision, process.env.GITHUB_SHA);
    assert.equal(identity.build.dirty, false);
  }
  phase = "navigation";
  for (const name of ["话题", "阅读", "定时发送"])
    await page
      .getByRole("navigation", { name: "主导航" })
      .getByRole("button", { name, exact: true })
      .click();
  await page.getByRole("button", { name: "管理成员", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "我的成员", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  phase = "settings";
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "偏好设置", exact: true }).click();
  await expect(page.getByLabel("任务浏览器", { exact: true })).toHaveValue(
    "headless",
  );
  await page.getByRole("button", { name: "关于", exact: true }).click();
  const updates = page.getByRole("region", { name: "应用更新", exact: true });
  await expect(updates).toContainText(`Postrove ${expected}`);
  const updateState = await page.evaluate(() =>
    window.postrove.applicationUpdates(),
  );
  assert.equal(updateState.ok, true);
  assert.notEqual(updateState.value.state, "disabled");
  assert.equal(updateState.value.version, expected);
  const retained = await page.evaluate(async () => {
    await window.postrove.saveAdvisorSettings({ enabled: ["reddit-ai-en"] });
    const view = await window.postrove.follows();
    if (!view.ok) throw Error("Schedule state is unavailable");
    const existing = view.value.find(
      (follow) => follow.name === "Package retained schedule",
    );
    if (existing) return { ok: true };
    const saved = await window.postrove.saveFollow({
      name: "Package retained schedule",
      question: "A reading routine",
      platforms: ["reddit"],
      advisorIds: ["reddit-ai-en"],
      period: "all",
      schedule: { cadence: "daily", time: "23:59" },
    });
    if (!saved.ok) return saved;
    return window.postrove.setFollowPaused(saved.value.followId, true);
  });
  assert.equal(retained.ok, true);
  await expect
    .poll(() =>
      updates
        .locator("img")
        .evaluate((image) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  await page.screenshot({ path: join(output, "settings-zh-CN.png") });
  await page.getByRole("button", { name: "偏好设置", exact: true }).click();
  await page.getByLabel("界面语言", { exact: true }).selectOption("en");
  await expect(page.getByLabel("Task browser", { exact: true })).toHaveValue(
    "headless",
  );
  phase = "restart";
  await application.close();
  application = undefined;
  await launch();
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await expect(
    page.getByLabel("Interface language", { exact: true }),
  ).toHaveValue("en");
  await expect(page.getByLabel("Task browser", { exact: true })).toHaveValue(
    "headless",
  );
  await page.getByRole("button", { name: "About", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Application updates", exact: true }),
  ).toContainText(`Postrove ${expected}`);
  await page.screenshot({ path: join(output, "settings-en.png") });
  await page
    .getByRole("button", { name: "Scheduled sends", exact: true })
    .click();
  await expect(
    page.getByText("Package retained schedule", { exact: true }).first(),
  ).toBeVisible();
  assert.deepEqual(rendererErrors, []);
  phase = "shutdown";
  await application.close();
  application = undefined;
  await assert.rejects(access(join(profile, ".branchout-owner.json")), {
    code: "ENOENT",
  });
  await writeFile(
    join(output, "result.json"),
    JSON.stringify(
      {
        result: "passed",
        version: expected,
        build: identity.build,
        checks: [
          "ASAR resources",
          "bundled reader and license",
          "page navigation",
          "packaged updater",
          "default headless mode",
          "app icon",
          "language persistence",
          "schedule persistence",
          "clean shutdown",
        ],
        boundary:
          "Real packaged executable and fresh profile; platform login, live retrieval, DMG first-open, and signature acceptance are separate checks",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`Package verification passed: ${expected}`);
} catch (error) {
  if (page && !page.isClosed())
    await page
      .screenshot({ path: join(output, "failed.png"), timeout: 5000 })
      .catch(() => {});
  await writeFile(
    join(output, "result.json"),
    JSON.stringify(
      {
        result: "failed",
        phase,
        errorType: error.name,
      },
      null,
      2,
    ) + "\n",
  );
  throw error;
} finally {
  if (application) {
    const child = application.process();
    let timer;
    await Promise.race([
      application.close().catch(() => {}),
      new Promise((done) => {
        timer = setTimeout(() => {
          child.kill("SIGKILL");
          done();
        }, 5000);
      }),
    ]);
    clearTimeout(timer);
  }
  if (!options.has("--profile"))
    await rm(profile, { recursive: true, force: true });
}
