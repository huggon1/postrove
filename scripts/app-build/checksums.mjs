import { createReadStream } from "node:fs";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";

const yaml = createRequire(import.meta.url)("js-yaml");
const root = resolve(process.argv[2] ?? ".");
const build = JSON.parse(
  await readFile(join(root, "dist/build-identity.json"), "utf8"),
);
const targets = {
  "darwin-arm64": {
    suffix: "mac-arm64",
    extensions: ["dmg", "zip"],
    feed: "latest-mac.yml",
  },
  "win32-x64": { suffix: "win-x64", extensions: ["exe"], feed: "latest.yml" },
};
const target = targets[build.platform];
if (!target) throw Error(`Unsupported release platform: ${build.platform}`);
const directory = join(root, "release");
const names = (await readdir(directory))
  .filter(
    (name) =>
      name === target.feed ||
      new RegExp(
        `^Postrove-${build.version.replaceAll(".", "\\.")}-${target.suffix}\\.(?:${target.extensions.join("|")})(?:\\.blockmap)?$`,
      ).test(name),
  )
  .sort();
for (const name of [
  target.feed,
  ...target.extensions.map(
    (ext) => `Postrove-${build.version}-${target.suffix}.${ext}`,
  ),
])
  if (!names.includes(name))
    throw Error(`Release artifact is missing: ${name}`);
const feed = yaml.load(await readFile(join(directory, target.feed), "utf8"));
if (feed.version !== build.version)
  throw Error("Update manifest version differs from the build");
for (const file of feed.files ?? []) {
  if (!names.includes(file.url))
    throw Error("Update manifest references an absent package");
  const hash = createHash("sha512");
  for await (const block of createReadStream(join(directory, file.url)))
    hash.update(block);
  if (hash.digest("base64") !== file.sha512)
    throw Error("Update manifest package checksum differs");
}
const updateExtension = build.platform === "win32-x64" ? "exe" : "zip";
if (
  !feed.files?.some(
    (file) =>
      file.url ===
      `Postrove-${build.version}-${target.suffix}.${updateExtension}`,
  )
)
  throw Error("Update manifest is missing its installable package");
const artifacts = [];
for (const name of names) {
  const hash = createHash("sha256");
  for await (const block of createReadStream(join(directory, name)))
    hash.update(block);
  artifacts.push({ file: name, sha256: hash.digest("hex") });
}
await writeFile(
  join(directory, "build-manifest.json"),
  JSON.stringify({ build, artifacts }, null, 2) + "\n",
);
await writeFile(
  join(directory, "SHA256SUMS.txt"),
  artifacts.map((item) => `${item.sha256}  ${item.file}`).join("\n") + "\n",
);
