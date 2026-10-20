import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

const packages = resolve(process.argv[2] ?? "packages");
const output = resolve(process.argv[3] ?? "artifacts");
const expectedVersion = JSON.parse(
  await readFile("package.json", "utf8"),
).version;
const expectedRevision =
  process.env.GITHUB_SHA ??
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
assert.equal(
  (
    await readdir(output).catch((error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    })
  ).length,
  0,
  "Release output must be empty",
);
const builds = [],
  files = new Map();
const retain = (name, bytes) => {
  assert.equal(name, basename(name), "Release asset must be a filename");
  assert.ok(
    !name.includes("\\") && !files.has(name),
    "Release assets must have distinct names",
  );
  files.set(name, bytes);
};
for (const [folder, platform, suffix] of [
  ["mac-arm64", "darwin-arm64", "mac-arm64"],
  ["win-x64", "win32-x64", "win-x64"],
]) {
  const directory = join(packages, folder);
  const raw = await readFile(join(directory, "build-manifest.json"));
  const manifest = JSON.parse(raw);
  assert.equal(manifest.build.platform, platform);
  assert.equal(manifest.build.version, expectedVersion);
  assert.equal(manifest.build.revision, expectedRevision);
  assert.equal(
    manifest.build.dirty,
    false,
    "Release packages require a committed source revision",
  );
  const required =
    platform === "win32-x64"
      ? [`Postrove-${expectedVersion}-win-x64.exe`, "latest.yml"]
      : [
          `Postrove-${expectedVersion}-mac-arm64.dmg`,
          `Postrove-${expectedVersion}-mac-arm64.zip`,
          "latest-mac.yml",
        ];
  for (const name of required)
    assert.ok(
      manifest.artifacts.some((item) => item.file === name),
      `Missing release asset: ${name}`,
    );
  for (const item of manifest.artifacts) {
    assert.equal(item.file, basename(item.file));
    assert.ok(!item.file.includes("\\"));
    const path = join(directory, item.file);
    assert.ok(
      (await lstat(path)).isFile(),
      "Release assets must be regular files",
    );
    const bytes = await readFile(path);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      item.sha256,
      "Release asset checksum differs",
    );
    retain(item.file, bytes);
  }
  retain(`build-manifest-${suffix}.json`, raw);
  if (platform === "darwin-arm64")
    retain(
      "signing-requirement.txt",
      await readFile(join(directory, "signing-requirement.txt")),
    );
  builds.push(manifest.build);
}
const artifacts = [...files]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([file, bytes]) => ({
    file,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }));
retain(
  "build-manifest.json",
  Buffer.from(
    JSON.stringify(
      {
        version: expectedVersion,
        revision: expectedRevision,
        builds,
        artifacts,
      },
      null,
      2,
    ) + "\n",
  ),
);
const sums =
  [...files]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([file, bytes]) =>
        `${createHash("sha256").update(bytes).digest("hex")}  ${file}`,
    )
    .join("\n") + "\n";
await mkdir(output, { recursive: true });
for (const [name, bytes] of files) await writeFile(join(output, name), bytes);
await writeFile(join(output, "SHA256SUMS.txt"), sums);
console.log(`Verified both platform packages for Postrove ${expectedVersion}`);
