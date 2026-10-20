import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createUpdateDriver } from "../../src/main/services/update-driver";

test("Windows updates select the EXE, recheck staged bytes and force restart without macOS staging", async () => {
  const root = await mkdtemp(join(tmpdir(), "postrove-update-driver-"));
  const path = join(root, "update.exe"),
    original = Buffer.from("fictional installer bytes");
  const sha512 = createHash("sha512").update(original).digest("base64");
  const emitter = new EventEmitter();
  let installArgs: unknown[] = [];
  const transport = Object.assign(emitter, {
    async checkForUpdates() {
      return {
        isUpdateAvailable: true,
        updateInfo: {
          version: "1.0.1",
          releaseDate: "2026-01-01",
          files: [
            { url: "mac.zip", size: 999, sha512 },
            { url: "windows.exe", size: original.length, sha512 },
          ],
        },
      };
    },
    async downloadUpdate() {
      return [path];
    },
    quitAndInstall(...args: unknown[]) {
      installArgs = args;
    },
  }) as unknown as Parameters<typeof createUpdateDriver>[1];
  const native = Object.assign(new EventEmitter(), {
    checkForUpdates() {
      throw Error("Windows entered macOS staging");
    },
  });
  const driver = createUpdateDriver(
    "win32",
    transport,
    native as unknown as Parameters<typeof createUpdateDriver>[2],
  );
  try {
    assert.equal((await driver.check())?.size, original.length);
    await assert.rejects(driver.prepareInstall(), /missing/);
    await writeFile(path, original);
    await driver.download(new AbortController().signal, () => {});
    await driver.prepareInstall();
    assert.equal(emitter.listenerCount("download-progress"), 0);
    await writeFile(path, "altered bytes");
    await assert.rejects(driver.prepareInstall(), /checksum/);
    await writeFile(path, original);
    await driver.prepareInstall();
    driver.quitAndInstall();
    assert.deepEqual(installArgs, [true, true]);
    assert.equal(transport.autoDownload, false);
    assert.equal(transport.autoInstallOnAppQuit, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("macOS stages through the native updater and propagates validation failure", async () => {
  let checks = 0;
  const native = Object.assign(new EventEmitter(), {
    checkForUpdates() {
      checks++;
      queueMicrotask(() => native.emit("error", Error("Invalid signature")));
    },
  });
  const transport = new EventEmitter() as unknown as Parameters<
    typeof createUpdateDriver
  >[1];
  const driver = createUpdateDriver(
    "darwin",
    transport,
    native as unknown as Parameters<typeof createUpdateDriver>[2],
  );
  await assert.rejects(
    driver.prepareInstall(),
    /Native update validation failed/,
  );
  assert.equal(checks, 1);
  native.checkForUpdates = () => {
    checks++;
    queueMicrotask(() => native.emit("update-downloaded"));
  };
  await driver.prepareInstall();
  await driver.prepareInstall();
  assert.equal(checks, 2);
  assert.equal(native.listenerCount("update-downloaded"), 0);
});
