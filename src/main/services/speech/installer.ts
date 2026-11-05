import type { SpeechInstallView } from "../../../shared/capability-contracts";
import { SpeechError } from "./process";
import { SpeechRuntime, speechRuntimePins } from "./runtime";
import type { SpeechFetch } from "./media";

/** Owns one profile's explicit installation. IPC stays responsive during download. */
export class SpeechInstaller {
  private value: SpeechInstallView = {
    state: "idle",
    downloadedBytes: 0,
    totalBytes: speechRuntimePins.model.bytes,
    readiness: { backend: "whisper.cpp", runtime: "missing", model: "missing" },
  };
  private initialized?: Promise<void>;
  private controller?: AbortController;
  private operation?: Promise<void>;
  constructor(
    private runtime: Pick<SpeechRuntime, "check" | "downloadModel">,
    private changed: () => void,
    private fetcher: SpeechFetch = globalThis.fetch,
  ) {}
  private initialize() {
    return (this.initialized ??= this.runtime.check().then((readiness) => {
      this.value.readiness = readiness;
      if (readiness.runtime === "ready" && readiness.model === "ready") {
        this.value.state = "ready";
        this.value.downloadedBytes = this.value.totalBytes;
      }
    }));
  }
  async view(): Promise<SpeechInstallView> {
    await this.initialize();
    return structuredClone(this.value);
  }
  async start(): Promise<SpeechInstallView> {
    await this.initialize();
    if (this.controller) return this.view();
    const controller = new AbortController();
    this.controller = controller;
    this.value.state = "preparing";
    this.value.downloadedBytes = 0;
    delete this.value.error;
    this.changed();
    this.operation = this.install(controller).finally(() => {
      this.controller = undefined;
      this.changed();
    });
    return this.view();
  }
  async cancel(): Promise<SpeechInstallView> {
    this.controller?.abort();
    await this.operation;
    return this.view();
  }
  async shutdown() {
    this.controller?.abort();
    await this.operation;
  }
  private async install(controller: AbortController) {
    const { signal } = controller;
    try {
      this.value.readiness = await this.runtime.check();
      if (signal.aborted) throw new SpeechError("cancelled");
      if (this.value.readiness.runtime !== "ready")
        throw new SpeechError(this.value.readiness.issue ?? "runtime_missing");
      if (this.value.readiness.model !== "ready") {
        this.value.state = "downloading";
        this.changed();
        let lastChange = 0;
        await this.runtime.downloadModel(signal, this.fetcher, (bytes) => {
          this.value.downloadedBytes = bytes;
          if (bytes >= this.value.totalBytes) this.value.state = "verifying";
          if (Date.now() - lastChange > 100 || bytes >= this.value.totalBytes) {
            lastChange = Date.now();
            this.changed();
          }
        });
      }
      this.value.state = "verifying";
      this.changed();
      this.value.readiness = await this.runtime.check();
      if (signal.aborted) throw new SpeechError("cancelled");
      if (
        this.value.readiness.runtime !== "ready" ||
        this.value.readiness.model !== "ready"
      )
        throw new SpeechError(this.value.readiness.issue ?? "model_integrity");
      this.value.downloadedBytes = this.value.totalBytes;
      this.value.state = "ready";
    } catch (error) {
      const code = signal.aborted
        ? "cancelled"
        : error instanceof SpeechError
          ? error.code
          : "download_failed";
      this.value.state = code === "cancelled" ? "cancelled" : "failed";
      this.value.error = code;
      this.value.readiness = await this.runtime
        .check()
        .catch(() => this.value.readiness);
    }
  }
}
