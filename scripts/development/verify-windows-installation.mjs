import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { invokeNsis } from "./windows-installer.mjs";
import { promisify } from "node:util";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

// The real NSIS installer exercises the Windows release acceptance cases.
assert.equal(process.platform, "win32", "Use a native Windows x64 runner");
assert.equal(process.arch, "x64");
const run = promisify(execFile);
const output = resolve(".tmp/windows-installation");
const install = join(output, "安装 验证", "Postrove");
const profile = join(output, "用户 数据");
await mkdir(output, { recursive: true });
const version = JSON.parse(await readFile("package.json", "utf8")).version;
const installer = resolve(`release/Postrove-${version}-win-x64.exe`);
const uninstall = join(install, "Uninstall Postrove.exe");
const result = {
  result: "running",
  version,
  checks: [],
  boundary:
    "Native NSIS installation and installed executable with an independent profile; live platform and account acceptance remains separate",
};
let phase = "install";
let installed = false;
const invoke = (file, args) =>
  run(file, args, {
    timeout: 180000,
    windowsHide: true,
    maxBuffer: 2 * 1024 * 1024,
  });
const verify = async (name) => {
  await invoke(process.execPath, [
    "scripts/development/verify-package.mjs",
    "--app",
    install,
    "--profile",
    profile,
    "--output",
    join(output, name),
  ]);
};
try {
  await access(installer);
  await invokeNsis(installer, ["/S", "/currentuser", `/D=${install}`]);
  installed = true;
  await access(join(install, "Postrove.exe"));
  await access(uninstall);
  result.checks.push("per-user installation in a Unicode path");
  phase = "installed-application";
  await verify("first-install");
  const before = await readFile(join(profile, "focus-search.json"), "utf8");
  result.checks.push(
    "installed startup, enabled updates and retained schedule",
  );
  phase = "reinstall";
  await invokeNsis(installer, ["/S", "/currentuser", `/D=${install}`]);
  assert.equal(
    await readFile(join(profile, "focus-search.json"), "utf8"),
    before,
  );
  await verify("reinstalled");
  result.checks.push("reinstall preserves independent application data");
  phase = "uninstall";
  // _?= runs the uninstaller in place so this process can await its completion.
  await invokeNsis(uninstall, ["/S", `_?=${install}`]);
  await assert.rejects(access(join(install, "Postrove.exe")), {
    code: "ENOENT",
  });
  const saved = JSON.parse(
    await readFile(join(profile, "focus-search.json"), "utf8"),
  );
  assert.ok(
    saved.follows.some((follow) => follow.name === "Package retained schedule"),
  );
  result.checks.push(
    "uninstall removes the program and retains independent records",
  );
  installed = false;
  result.result = "passed";
} catch (error) {
  result.result = "failed";
  result.phase = phase;
  result.errorType = error.name;
  throw error;
} finally {
  await writeFile(
    join(output, "result.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  if (installed)
    await invokeNsis(uninstall, ["/S", `_?=${install}`]).catch(() => {});
}
console.log(`Windows installation verified: ${version}`);
