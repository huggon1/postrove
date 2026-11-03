import assert from "node:assert/strict";
import { test } from "node:test";
import { SpeechInstaller } from "../../src/main/services/speech/installer";
import { SpeechError } from "../../src/main/services/speech/process";
import type { SpeechReadiness } from "../../src/shared/speech-contracts";

const missing = (): SpeechReadiness => ({
  backend: "whisper.cpp",
  runtime: "ready",
  model: "missing",
  issue: "model_missing",
});
test("installation publishes byte progress, verification and ready after complete model", async () => {
  let installed = false;
  const states: string[] = [];
  let installer: SpeechInstaller;
  installer = new SpeechInstaller(
    {
      check: async () =>
        installed
          ? { backend: "whisper.cpp", runtime: "ready", model: "ready" }
          : missing(),
      downloadModel: async (_signal, _fetch, progress) => {
        progress?.(1000);
        assert.equal((await installer.view()).downloadedBytes, 1000);
        assert.equal((await installer.view()).state, "downloading");
        installed = true;
      },
    },
    () => {
      void installer.view().then((v) => states.push(v.state));
    },
  );
  await installer.start();
  // cancel waits for the in-flight operation; here the model has already published.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await installer.view()).state, "ready");
  assert.ok(states.includes("verifying"));
  assert.ok(states.includes("ready"));
});

test("cancel drains one active download, retry starts afresh and reports integrity failure", async () => {
  let starts = 0;
  let active = 0;
  let maxActive = 0;
  const installer = new SpeechInstaller(
    {
      check: async () => missing(),
      downloadModel: async (signal, _fetch, progress) => {
        starts++;
        active++;
        maxActive = Math.max(active, maxActive);
        try {
          progress?.(25);
          if (starts > 1) throw new SpeechError("download_integrity");
          await new Promise<void>((_resolve, reject) => {
            signal.addEventListener(
              "abort",
              () => reject(new SpeechError("cancelled")),
              { once: true },
            );
          });
        } finally {
          active--;
        }
      },
    },
    () => {},
  );
  await installer.start();
  await new Promise((resolve) => setImmediate(resolve));
  await installer.start();
  assert.equal(starts, 1);
  assert.equal((await installer.cancel()).state, "cancelled");
  assert.equal(active, 0);
  await installer.start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await installer.view()).state, "failed");
  assert.equal((await installer.view()).error, "download_integrity");
  assert.equal(starts, 2);
  assert.equal(maxActive, 1);
});

test("missing packaged runtime stops before model download", async () => {
  let downloads = 0;
  const installer = new SpeechInstaller(
    {
      check: async () => ({
        ...missing(),
        runtime: "invalid",
        issue: "runtime_integrity",
      }),
      downloadModel: async () => {
        downloads++;
      },
    },
    () => {},
  );
  await installer.start();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await installer.view()).state, "failed");
  assert.equal((await installer.view()).error, "runtime_integrity");
  assert.equal(downloads, 0);
});
