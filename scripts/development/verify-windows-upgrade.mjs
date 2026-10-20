import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { access, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { _electron as electron, expect } from "@playwright/test";
import { invokeNsis } from "./windows-installer.mjs";

assert.equal(process.platform, "win32", "Use a native Windows x64 runner");
assert.equal(process.arch, "x64");
const run = promisify(execFile);
const yaml = createRequire(import.meta.url)("js-yaml");
const root = resolve(".tmp/windows-upgrade");
const evidence = join(root, "evidence");
const install = join(root, "安装 升级", "Postrove");
const profile = join(root, "安装 升级", "profile");
await rm(root, { recursive: true, force: true });
await mkdir(evidence, { recursive: true });
await mkdir(profile, { recursive: true });
const version = JSON.parse(await readFile("package.json", "utf8")).version;
assert.match(version, /^\d+\.\d+\.\d+$/);
const [major, minor, patch] = version.split(".").map(Number);
const next = `${major}.${minor}.${patch + 1}`;
const requests = [];
const server = createServer(async (request, response) => {
  const name = basename(new URL(request.url, "http://localhost").pathname);
  if (
    !/^(?:latest\.yml|Postrove-[\d.]+-win-x64\.exe(?:\.blockmap)?)$/.test(name)
  ) {
    response.writeHead(404).end();
    return;
  }
  requests.push(name);
  try {
    const bytes = await readFile(join(root, "candidate", name));
    response.writeHead(200, {
      "Content-Type": "application/octet-stream",
      "Content-Length": bytes.length,
    });
    response.end(bytes);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const endpoint = `http://127.0.0.1:${server.address().port}`;
const config = yaml.load(await readFile("electron-builder.yml", "utf8"));
config.publish = { provider: "generic", url: endpoint, channel: "latest" };
config.extraMetadata = { main: "dist/main/windows-upgrade-check.cjs" };
const bootstrap = resolve("dist/main/windows-upgrade-check.cjs");
await writeFile(
  bootstrap,
  `
const {app}=require("electron"), fs=require("node:fs"), path=require("node:path");
const root=path.resolve(path.dirname(process.execPath),"../profile");
process.env.POSTROVE_TEST_DATA=root;
process.env.POSTROVE_RUN_MODE="review";
app.on("browser-window-created",(_,window)=>window.webContents.once("did-finish-load",async()=>{
  try {
    const ready=await window.webContents.executeJavaScript('new Promise(resolve=>{const deadline=Date.now()+30000;const check=()=>{if(document.querySelector("nav"))resolve(true);else if(Date.now()>deadline)resolve(false);else setTimeout(check,100);};check();})');
    if(!ready) return;
    const image=await window.webContents.capturePage();
    fs.writeFileSync(path.join(root,"restarted.png"),image.toPNG());
    fs.writeFileSync(path.join(root,"restart-probe.json"),JSON.stringify({version:app.getVersion(),pid:process.pid,profile:app.getPath("userData")}));
  } catch {}
}));
setInterval(()=>{const flag=path.join(root,"close-for-verification"); if(fs.existsSync(flag)){fs.rmSync(flag);app.quit();}},250).unref();
require("./main.cjs");
`,
);
let application,
  page,
  installed = false,
  phase = "build";
const result = {
  result: "running",
  from: version,
  to: next,
  checks: [],
  requests,
};
const checkpoint = async (nextPhase) => {
  phase = nextPhase;
  console.log(`Windows upgrade verification: ${phase}`);
  await writeFile(
    join(evidence, "last-stage.json"),
    JSON.stringify({ phase, at: new Date().toISOString() }) + "\n",
  );
};
const until = async (read, accept, timeout = 180000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await read();
    if (accept(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw Error(`Windows upgrade timed out at ${phase}`);
};
try {
  for (const [candidateVersion, folder] of [
    [version, "baseline"],
    [next, "candidate"],
  ]) {
    await checkpoint(`build ${candidateVersion}`);
    config.directories.output = join(root, folder);
    config.extraMetadata.version = candidateVersion;
    const file = join(root, `${folder}.json`);
    await writeFile(file, JSON.stringify(config));
    await run(
      process.execPath,
      [
        resolve("node_modules/electron-builder/out/cli/cli.js"),
        "--config",
        file,
        "--win",
        "nsis",
        "--x64",
        "--publish",
        "never",
      ],
      { timeout: 600000, maxBuffer: 10 * 1024 * 1024, windowsHide: true },
    );
  }
  await checkpoint("install baseline");
  await invokeNsis(join(root, "baseline", `Postrove-${version}-win-x64.exe`), [
    "/S",
    "/currentuser",
    `/D=${install}`,
  ]);
  installed = true;
  await access(join(install, "Postrove.exe"));
  application = await electron.launch({
    executablePath: join(install, "Postrove.exe"),
    args: [],
    timeout: 45000,
  });
  page = await application.firstWindow({ timeout: 45000 });
  await expect(page.getByRole("navigation")).toBeVisible({ timeout: 30000 });
  const originalPid = application.process().pid;
  await page.evaluate(async () => {
    await window.postrove.saveLanguage("zh-CN");
    await window.postrove.saveAdvisorSettings({ enabled: ["reddit-ai-en"] });
    const saved = await window.postrove.saveFollow({
      name: "Upgrade retained schedule",
      question: "A reading habit",
      advisorIds: ["reddit-ai-en"],
      platforms: ["reddit"],
      period: "all",
      schedule: { cadence: "daily", time: "23:59" },
    });
    if (!saved.ok) throw Error("Schedule setup failed");
    await window.postrove.setFollowPaused(saved.value.followId, true);
  });
  await mkdir(join(profile, "platform-browser"), { recursive: true });
  await writeFile(
    join(profile, "platform-browser/session-sentinel.txt"),
    "fictional session retention evidence",
  );
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "关于", exact: true }).click();
  const updates = page.getByRole("region", { name: "应用更新", exact: true });
  await checkpoint("check and download");
  const check = updates.getByRole("button", { name: "检查更新", exact: true });
  if ((await check.isVisible()) && (await check.isEnabled()))
    await check.click();
  await updates
    .getByRole("button", { name: "下载更新", exact: true })
    .click({ timeout: 30000 });
  await updates
    .getByRole("button", { name: "安装并重启", exact: true })
    .waitFor({ timeout: 120000 });
  await page.screenshot({ path: join(evidence, "downloaded.png") });
  await rm(join(profile, "restarted.png"), { force: true });
  await checkpoint("NSIS replacement and restart");
  await updates
    .getByRole("button", { name: "安装并重启", exact: true })
    .click()
    .catch((error) => {
      if (!/Target.*closed/i.test(error.message)) throw error;
    });
  const probe = await until(
    async () =>
      JSON.parse(
        await readFile(join(profile, "restart-probe.json"), "utf8").catch(
          () => "{}",
        ),
      ),
    (probe) => probe.version === next && probe.pid !== originalPid,
  );
  assert.equal(probe.profile, profile);
  await until(
    async () =>
      JSON.parse(
        await readFile(join(profile, "application-update.json"), "utf8").catch(
          () => "{}",
        ),
      ),
    (receipt) => !receipt.to,
  );
  const saved = JSON.parse(
    await readFile(join(profile, "focus-search.json"), "utf8"),
  );
  assert.ok(
    saved.follows.some(
      (follow) => follow.name === "Upgrade retained schedule" && follow.paused,
    ),
  );
  assert.equal(
    await readFile(
      join(profile, "platform-browser/session-sentinel.txt"),
      "utf8",
    ),
    "fictional session retention evidence",
  );
  assert.ok(requests.includes("latest.yml"));
  assert.ok(requests.some((name) => name.endsWith(".exe")));
  const screenshot = await until(
    () => readFile(join(profile, "restarted.png")).catch(() => undefined),
    Boolean,
    30000,
  );
  await writeFile(join(evidence, "restarted.png"), screenshot);
  result.checks.push(
    "installed production updater",
    "latest.yml and verified EXE download",
    "silent NSIS replacement",
    "automatic restart into the newer version",
    "same isolated profile",
    "schedule and session-directory retention",
    "consumed upgrade receipt",
  );
  result.result = "passed";
} catch (error) {
  result.result = "failed";
  result.phase = phase;
  result.errorType = error.name;
  if (page && !page.isClosed())
    await page
      .screenshot({ path: join(evidence, "failed.png"), timeout: 5000 })
      .catch(() => {});
  throw error;
} finally {
  await writeFile(
    join(evidence, "result.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  if (application && application.process().exitCode === null)
    await application.close().catch(() => {});
  const owner = JSON.parse(
    await readFile(join(profile, ".branchout-owner.json"), "utf8").catch(
      () => "{}",
    ),
  );
  if (owner.pid) {
    await writeFile(join(profile, "close-for-verification"), "close");
    await until(
      () =>
        access(join(profile, ".branchout-owner.json")).then(
          () => false,
          () => true,
        ),
      Boolean,
      30000,
    ).catch(() => {});
  }
  if (installed)
    await invokeNsis(join(install, "Uninstall Postrove.exe"), [
      "/S",
      `_?=${install}`,
    ]).catch(() => {});
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await rm(bootstrap, { force: true });
}
console.log(`Windows native upgrade verified: ${version} -> ${next}`);
