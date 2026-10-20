import { utilityProcess } from "electron";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { ContentRequest } from "../../shared/content-contracts";
import type { ModelExecutionConfig } from "../../shared/model-contracts";
import { createWorkerEnvironment } from "./worker-environment";

type ContentLease = {
  config: ModelExecutionConfig;
  release(): Promise<void>;
};
export class ContentService {
  private active = 0;
  private waiting = new Set<() => void>();
  constructor(
    private acquire: () => Promise<ContentLease>,
    private traceRoot?: string,
  ) {}
  async execute(
    input: ContentRequest,
    signal: AbortSignal,
    bound?: ContentLease,
    taskId: string = randomUUID(),
  ): Promise<string> {
    while (this.active >= 2) {
      await new Promise<void>((resolve, reject) => {
        const wake = () => {
          cleanup();
          resolve();
        };
        const cancel = () => {
          cleanup();
          reject(new Error("cancelled"));
        };
        const cleanup = () => {
          this.waiting.delete(wake);
          signal.removeEventListener("abort", cancel);
        };
        this.waiting.add(wake);
        signal.addEventListener("abort", cancel, { once: true });
        if (signal.aborted) cancel();
      });
    }
    signal.throwIfAborted();
    this.active++;
    let lease: Awaited<ReturnType<ContentService["acquire"]>> | undefined;
    try {
      lease = bound ?? (await this.acquire());
      signal.throwIfAborted();
      return await new Promise<string>((resolve, reject) => {
        const worker = utilityProcess.fork(
          join(__dirname, "../worker/content-worker.mjs"),
          [],
          {
            stdio: "pipe",
            env: createWorkerEnvironment(
              process.env,
              undefined,
              undefined,
              lease!.config.method === "pi" && lease!.config.useEnvironment,
            ),
          },
        );
        worker.stdout?.resume();
        worker.stderr?.resume();
        let settled = false;
        const finish = (value?: string, error?: string) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          clearTimeout(drain);
          signal.removeEventListener("abort", cancel);
          worker.kill();
          if (value !== undefined) resolve(value);
          else reject(new Error(error ?? "content_processing_failed"));
        };
        let drain: ReturnType<typeof setTimeout> | undefined;
        const cancel = () => {
          worker.postMessage({ type: "cancel" });
          drain ??= setTimeout(() => finish(undefined, "cancelled"), 35_000);
        };
        const timeout = setTimeout(cancel, 180_000);
        worker.on("message", (message) => {
          if (message?.type === "result" && typeof message.value === "string")
            finish(message.value);
          else if (message?.type === "failed")
            finish(undefined, message.message);
        });
        worker.on("exit", () => finish());
        signal.addEventListener("abort", cancel, { once: true });
        if (signal.aborted) cancel();
        else
          worker.postMessage({
            type: "content",
            config: lease!.config,
            input,
            taskId,
            traceRoot: this.traceRoot,
          });
      });
    } finally {
      try {
        if (!bound) await lease?.release();
      } finally {
        this.active--;
        this.waiting.values().next().value?.();
      }
    }
  }
}
