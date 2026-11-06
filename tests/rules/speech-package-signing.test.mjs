import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  refreshSpeechManifest,
  signMac,
} from "../../scripts/app-build/sign-mac.mjs";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), "postrove-speech-signing-"));
  const app = join(root, "Postrove.app");
  const directory = join(
    app,
    "Contents/Resources/.runtime/speech/darwin-arm64",
  );
  await mkdir(directory, { recursive: true });
  const files = {};
  for (const name of ["whisper-cli", "ffmpeg", "SPEECH-NOTICE.txt"]) {
    const bytes = Buffer.from(`Prepared ${name}`);
    await writeFile(join(directory, name), bytes);
    files[name] = digest(bytes);
  }
  const manifest = {
    whisper: "1.8.2",
    ffmpeg: "8.0.1",
    target: "darwin-arm64",
    files,
  };
  const path = join(directory, "runtime.json");
  await writeFile(path, JSON.stringify(manifest));
  try {
    await run({ root, app, directory, path, manifest });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("signing seals final nested bytes before the app signature and retains per-file options", async () => {
  await fixture(async ({ app, directory, path, manifest }) => {
    const seen = [];
    const options = {
      app,
      identity: "test",
      optionsForFile: (file) => ({ entitlements: file }),
    };
    await signMac(options, async (forwarded) => {
      assert.equal(forwarded.identity, options.identity);
      for (const name of ["whisper-cli", "ffmpeg"]) {
        const file = join(directory, name);
        assert.deepEqual(forwarded.optionsForFile(file), {
          entitlements: file,
        });
        await writeFile(file, `Signed ${name}`);
        // Each remaining child still sees the preparation manifest.
        assert.deepEqual(JSON.parse(await readFile(path, "utf8")), manifest);
        seen.push(file);
      }
      assert.deepEqual(forwarded.optionsForFile(app), { entitlements: app });
      const sealed = JSON.parse(await readFile(path, "utf8"));
      for (const name of Object.keys(manifest.files))
        assert.equal(
          sealed.files[name],
          digest(await readFile(join(directory, name))),
        );
      assert.equal(sealed.whisper, manifest.whisper);
      assert.equal(
        sealed.files["SPEECH-NOTICE.txt"],
        manifest.files["SPEECH-NOTICE.txt"],
      );
      assert.notEqual(sealed.files.ffmpeg, manifest.files.ffmpeg);
      seen.push(app);
    });
    assert.equal(seen.at(-1), app);
    // Runtime still rejects any mutation after sealing.
    await writeFile(join(directory, "ffmpeg"), "tampered");
    assert.notEqual(
      JSON.parse(await readFile(path, "utf8")).files.ffmpeg,
      digest(await readFile(join(directory, "ffmpeg"))),
    );
  });
});

test("a signer that skips the app seal fails packaging", async () => {
  await fixture(async ({ app }) => {
    await assert.rejects(
      signMac({ app }, async () => {}),
      /skipped speech manifest/,
    );
  });
});

test("invalid manifests fail before replacing their content", async () => {
  await fixture(async ({ app, path, manifest }) => {
    const bytes = JSON.stringify({
      ...manifest,
      files: { ...manifest.files, "../outside": digest("x") },
    });
    await writeFile(path, bytes);
    assert.throws(
      () => refreshSpeechManifest(app),
      /Invalid packaged speech manifest entry/,
    );
    assert.equal(await readFile(path, "utf8"), bytes);
  });
});

test(
  "real macOS signing seals final speech bytes inside the verified application",
  { skip: process.platform !== "darwin" },
  async () => {
    await fixture(async ({ app, directory, path }) => {
      for (const name of ["whisper-cli", "ffmpeg"])
        await copyFile("/usr/bin/true", join(directory, name));
      await mkdir(join(app, "Contents/MacOS"));
      await copyFile("/usr/bin/true", join(app, "Contents/MacOS/Postrove"));
      await writeFile(
        join(app, "Contents/Info.plist"),
        '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.postrove.signing-test</string><key>CFBundleExecutable</key><string>Postrove</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>1.0.0</string></dict></plist>',
      );
      refreshSpeechManifest(app);
      const before = JSON.parse(await readFile(path, "utf8"));
      await signMac({
        app,
        identity: "-",
        identityValidation: false,
        platform: "darwin",
        preAutoEntitlements: false,
        gatekeeperAssess: false,
        optionsForFile: () => ({ timestamp: "none", hardenedRuntime: false }),
      });
      execFileSync("codesign", ["--verify", "--deep", "--strict", app], {
        stdio: "pipe",
      });
      const after = JSON.parse(await readFile(path, "utf8"));
      assert.notEqual(after.files.ffmpeg, before.files.ffmpeg);
      assert.equal(
        after.files.ffmpeg,
        digest(await readFile(join(directory, "ffmpeg"))),
      );
    });
  },
);
