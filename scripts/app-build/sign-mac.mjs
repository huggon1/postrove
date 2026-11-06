import { createHash } from "node:crypto";
import { lstatSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { signAsync } from "@electron/osx-sign";

// Retain electron-builder's four signing attempts and 5/10/15 second backoff.
async function signWithRetry(options) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await signAsync(options);
    } catch (error) {
      if (attempt === 3) throw error;
      await delay(5000 * (attempt + 1));
    }
  }
}

// Nested Mach-O signatures change executable bytes. Seal their final hashes into
// the containing application's resources immediately before signing that app.
export function refreshSpeechManifest(app) {
  const directory = join(
    app,
    "Contents/Resources/.runtime/speech/darwin-arm64",
  );
  const path = join(directory, "runtime.json");
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  if (
    manifest.target !== "darwin-arm64" ||
    !manifest.files ||
    typeof manifest.files !== "object" ||
    Array.isArray(manifest.files) ||
    !manifest.files["whisper-cli"] ||
    !manifest.files.ffmpeg
  )
    throw new Error("Invalid packaged speech manifest");
  const files = {};
  for (const [name, digest] of Object.entries(manifest.files)) {
    if (
      !/^[A-Za-z0-9_.-]+$/.test(name) ||
      name === "runtime.json" ||
      typeof digest !== "string" ||
      !/^[a-f0-9]{64}$/.test(digest)
    )
      throw new Error("Invalid packaged speech manifest entry");
    const file = join(directory, name);
    if (!lstatSync(file).isFile())
      throw new Error("Packaged speech entry must be a regular file");
    files[name] = createHash("sha256").update(readFileSync(file)).digest("hex");
  }
  writeFileSync(path, JSON.stringify({ ...manifest, files }), { mode: 0o600 });
}

export async function signMac(options, signer = signWithRetry) {
  const previous = options.optionsForFile;
  let refreshed = false;
  await signer({
    ...options,
    optionsForFile(file) {
      if (resolve(file) === resolve(options.app)) {
        refreshSpeechManifest(options.app);
        refreshed = true;
      }
      return previous?.(file) ?? {};
    },
  });
  if (!refreshed)
    throw new Error("Application signing skipped speech manifest sealing");
}

// electron-builder also passes its packager as a second argument.
export default (options) => signMac(options);
