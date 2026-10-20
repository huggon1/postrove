import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const downloader = "2026.08.19";
const javascript = "2.5.6";
const targets = {
  "darwin-arm64": [
    "yt-dlp_macos",
    "0f192b7ec147ab6288885d6351d9ab67367640029b4377576ef46dd79cf7b202",
    "deno-aarch64-apple-darwin.zip",
    "32a5b2bcf49432715719c7c769529269fbd08cafdc059b7cecd42f9d771059ab",
  ],
  "linux-x64": [
    "yt-dlp_linux",
    "58162f9bfdc27458ea47bfcb311cf47028f17d8154a8bf7d689861d46399230a",
    "deno-x86_64-unknown-linux-gnu.zip",
    "fd4f6abc1b6a134fa9a4dba56519f1631f44c88e04e4e3e9a8ff5975dfa66e1a",
  ],
  "win32-x64": [
    "yt-dlp.exe",
    "66674953fe251b89f4d08c5f0e35e0728679bd67ab3d7d05c0562af101dd3e7a",
    "deno-x86_64-pc-windows-msvc.zip",
    "1327356cd63e23d0da7d11d5f5ca6b45902b1b62ee2debd4fbbd0aad2aab9786",
  ],
};
const target = targets[`${process.platform}-${process.arch}`];
if (!target)
  throw new Error("YouTube runtime is unavailable for this build target");
const parent = join(process.cwd(), ".runtime");
const stage = join(parent, `.youtube-${randomUUID()}`);
await mkdir(stage, { recursive: true, mode: 0o700 });
async function download(url, file, digest) {
  const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!response.ok)
    throw new Error(`Runtime download failed: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (digest && createHash("sha256").update(bytes).digest("hex") !== digest)
    throw new Error("Runtime checksum mismatch");
  await writeFile(join(stage, file), bytes, { mode: 0o600 });
}
try {
  const [asset, digest, deno, denoDigest] = target;
  const suffix = process.platform === "win32" ? ".exe" : "";
  await download(
    `https://github.com/yt-dlp/yt-dlp/releases/download/${downloader}/${asset}`,
    `yt-dlp${suffix}`,
    digest,
  );
  await download(
    `https://github.com/denoland/deno/releases/download/v${javascript}/${deno}`,
    "deno.zip",
    denoDigest,
  );
  if (process.platform === "win32")
    execFileSync("tar", ["-xf", "deno.zip"], { cwd: stage });
  else execFileSync("unzip", ["-q", "deno.zip"], { cwd: stage });
  await rm(join(stage, "deno.zip"));
  if (process.platform !== "win32")
    for (const name of ["yt-dlp", "deno"])
      await chmod(join(stage, name), 0o755);
  const version = execFileSync(join(stage, `yt-dlp${suffix}`), ["--version"], {
    encoding: "utf8",
  }).trim();
  const jsVersion = execFileSync(join(stage, `deno${suffix}`), ["--version"], {
    encoding: "utf8",
  });
  if (version !== downloader || !jsVersion.startsWith(`deno ${javascript} `))
    throw new Error("Runtime version mismatch");
  await download(
    `https://raw.githubusercontent.com/yt-dlp/yt-dlp/${downloader}/LICENSE`,
    "YT-DLP-LICENSE",
  );
  await download(
    `https://raw.githubusercontent.com/denoland/deno/v${javascript}/LICENSE.md`,
    "DENO-LICENSE",
  );
  await writeFile(
    join(stage, "runtime.json"),
    JSON.stringify({
      downloader,
      javascript,
      platform: process.platform,
      arch: process.arch,
    }),
    { mode: 0o600 },
  );
  await rm(join(parent, "youtube"), { recursive: true, force: true });
  await rename(stage, join(parent, "youtube"));
  console.log(
    `YouTube runtime ${downloader} / Deno ${javascript} verified and installed`,
  );
} finally {
  await rm(stage, { recursive: true, force: true });
}
