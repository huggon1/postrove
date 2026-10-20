import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, readFile, writeFile, rm, cp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const execute = promisify(execFile);
const checksum = resolve("scripts/app-build/checksums.mjs");
const merge = resolve("scripts/app-build/merge-release.mjs");
const version = "1.2.3",
  revision = "1234567890abcdef1234567890abcdef12345678";
const digest = (algorithm, bytes, encoding) =>
  createHash(algorithm).update(bytes).digest(encoding);
const run = (file, args, root) =>
  execute(process.execPath, [file, ...args], {
    cwd: root,
    env: { ...process.env, GITHUB_SHA: revision },
    timeout: 30000,
  });

const prepare = async (root, platform, folder) => {
  const source = join(root, folder),
    release = join(source, "release");
  await mkdir(join(source, "dist"), { recursive: true });
  await mkdir(release);
  await writeFile(
    join(source, "dist/build-identity.json"),
    JSON.stringify({ version, revision, platform, dirty: false }),
  );
  const suffix = platform === "win32-x64" ? "win-x64" : "mac-arm64";
  const extensions = platform === "win32-x64" ? ["exe"] : ["dmg", "zip"];
  const files = [];
  for (const extension of extensions) {
    const name = `Postrove-${version}-${suffix}.${extension}`;
    const bytes = Buffer.from(`fictional ${platform} ${extension} package`);
    await writeFile(join(release, name), bytes);
    await writeFile(join(release, name + ".blockmap"), "fictional blockmap");
    files.push({
      url: name,
      size: bytes.length,
      sha512: digest("sha512", bytes, "base64"),
    });
  }
  // JSON is valid YAML. Use the real feed parser and hashing scripts.
  await writeFile(
    join(release, platform === "win32-x64" ? "latest.yml" : "latest-mac.yml"),
    JSON.stringify({ version, files }),
  );
  if (platform === "darwin-arm64")
    await writeFile(
      join(release, "signing-requirement.txt"),
      "fictional signing requirement",
    );
  return { source, release };
};

test("release assembly retains both feeds and rejects damaged, incomplete or mixed packages", async () => {
  const root = await mkdtemp(join(tmpdir(), "postrove-release-"));
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ version }));
    const mac = await prepare(root, "darwin-arm64", "mac-source");
    const windows = await prepare(root, "win32-x64", "win-source");
    for (const build of [mac, windows])
      await run(checksum, [build.source], root);
    const packages = join(root, "packages");
    await cp(mac.release, join(packages, "mac-arm64"), { recursive: true });
    await cp(windows.release, join(packages, "win-x64"), { recursive: true });
    const output = join(root, "combined");
    await run(merge, [packages, output], root);
    const manifest = JSON.parse(
      await readFile(join(output, "build-manifest.json"), "utf8"),
    );
    assert.deepEqual(manifest.builds.map((build) => build.platform).sort(), [
      "darwin-arm64",
      "win32-x64",
    ]);
    for (const file of [
      "latest.yml",
      "latest-mac.yml",
      `Postrove-${version}-win-x64.exe`,
      `Postrove-${version}-mac-arm64.zip`,
    ]) {
      assert.ok(manifest.artifacts.some((artifact) => artifact.file === file));
    }
    const sums = await readFile(join(output, "SHA256SUMS.txt"), "utf8");
    for (const line of sums.trim().split("\n")) {
      const [expected, name] = line.split("  ");
      assert.equal(
        digest("sha256", await readFile(join(output, name)), "hex"),
        expected,
      );
    }
    const installer = join(
      packages,
      "win-x64",
      `Postrove-${version}-win-x64.exe`,
    );
    const original = await readFile(installer);
    await writeFile(installer, "damaged installer");
    await assert.rejects(
      run(merge, [packages, join(root, "damaged")], root),
      /checksum differs/,
    );
    await writeFile(installer, original);
    const path = join(packages, "win-x64/build-manifest.json");
    const windowsManifest = JSON.parse(await readFile(path, "utf8"));
    await writeFile(
      path,
      JSON.stringify({
        ...windowsManifest,
        build: {
          ...windowsManifest.build,
          revision: "ffffffffffffffffffffffffffffffffffffffff",
        },
      }),
    );
    await assert.rejects(run(merge, [packages, join(root, "mixed")], root));
    await writeFile(
      path,
      JSON.stringify({
        ...windowsManifest,
        artifacts: windowsManifest.artifacts.filter(
          (item) => item.file !== "latest.yml",
        ),
      }),
    );
    await assert.rejects(
      run(merge, [packages, join(root, "incomplete")], root),
      /Missing release asset/,
    );
    await writeFile(
      path,
      JSON.stringify({
        ...windowsManifest,
        build: { ...windowsManifest.build, dirty: true },
      }),
    );
    await assert.rejects(
      run(merge, [packages, join(root, "dirty")], root),
      /committed source revision/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("package checksums reject an absent feed or an installer that differs from its feed digest", async () => {
  const root = await mkdtemp(join(tmpdir(), "postrove-feed-"));
  try {
    const windows = await prepare(root, "win32-x64", "windows");
    const feedPath = join(windows.release, "latest.yml");
    const feed = await readFile(feedPath);
    await rm(feedPath);
    await assert.rejects(
      run(checksum, [windows.source], root),
      /artifact is missing/,
    );
    await writeFile(feedPath, feed);
    await writeFile(
      join(windows.release, `Postrove-${version}-win-x64.exe`),
      "tampered bytes",
    );
    await assert.rejects(
      run(checksum, [windows.source], root),
      /package checksum differs/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
