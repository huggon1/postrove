import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ForwardingStore } from "../../src/main/services/forwarding/store";

test(
  "Windows state commits survive a brief external reader lock",
  { skip: process.platform !== "win32" },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "postrove-state-"));
    const file = join(root, "forwarding.json");
    const store = new ForwardingStore(file);
    let reader: ReturnType<typeof spawn> | undefined;
    try {
      await store.open();
      await store.update(() => {});
      reader = spawn(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          "$reader = [System.IO.File]::Open($env:POSTROVE_STATE_FILE, 'Open', 'Read', 'ReadWrite'); [Console]::Out.WriteLine('locked'); Start-Sleep -Milliseconds 750; $reader.Dispose()",
        ],
        {
          env: { ...process.env, POSTROVE_STATE_FILE: file },
          windowsHide: true,
          stdio: ["ignore", "pipe", "ignore"],
        },
      );
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(Error("State reader did not open")),
          10000,
        );
        reader!.stdout!.once("data", () => {
          clearTimeout(timeout);
          resolve();
        });
        reader!.once("error", (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
      let committed = false;
      const saving = store
        .update((state) => {
          const now = new Date().toISOString();
          state.tasks.push({
            taskId: randomUUID(),
            materialId: randomUUID(),
            resultId: randomUUID(),
            target: { sourceUrl: "https://example.com/retained", entry: "app" },
            state: "queued",
            phase: "等待处理",
            activities: [],
            createdAt: now,
            updatedAt: now,
          });
        })
        .then(() => {
          committed = true;
        });
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.equal(committed, false);
      assert.equal(store.snapshot().tasks.length, 0);
      await saving;
      assert.equal(store.snapshot().tasks.length, 1);
      assert.equal(JSON.parse(await readFile(file, "utf8")).tasks.length, 1);
    } finally {
      if (reader?.exitCode === null) {
        reader.kill();
        await new Promise((resolve) => reader!.once("exit", resolve));
      }
      await rm(root, { recursive: true, force: true });
    }
  },
);
