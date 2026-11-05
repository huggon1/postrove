import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import pins from "../../../shared/speech-runtime.json";
import type { SpeechReadiness } from "../../../shared/speech-contracts";
import { SpeechError } from "./process";
import { storeBytes, type SpeechFetch } from "./media";

export { pins as speechRuntimePins };
export const speechTarget = `${process.platform}-${process.arch}`;

export async function hashFile(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest("hex");
}

export class SpeechRuntime {
  readonly directory: string;
  readonly modelDirectory: string;
  constructor(
    runtimeRoot: string,
    dataDir: string,
    private readonly target = speechTarget,
  ) {
    this.directory = join(runtimeRoot, "speech", target);
    this.modelDirectory = join(dataDir, "speech", "models");
  }
  get whisper() {
    return join(
      this.directory,
      this.target === "win32-x64" ? "whisper-cli.exe" : "whisper-cli",
    );
  }
  get ffmpeg() {
    return join(
      this.directory,
      this.target === "win32-x64" ? "ffmpeg.exe" : "ffmpeg",
    );
  }
  get model() {
    return join(this.modelDirectory, pins.model.file);
  }

  async check(): Promise<SpeechReadiness> {
    const result: SpeechReadiness = {
      backend: "whisper.cpp",
      runtime: "missing",
      model: "missing",
    };
    if (!["darwin-arm64", "win32-x64"].includes(this.target)) {
      result.runtime = "unsupported";
      result.issue = "unsupported_runtime";
      return result;
    }
    try {
      const model = await stat(this.model);
      result.model =
        model.isFile() &&
        model.size === pins.model.bytes &&
        (await hashFile(this.model)) === pins.model.sha256
          ? "ready"
          : "invalid";
    } catch {
      result.model = "missing";
    }
    try {
      await access(join(this.directory, "runtime.json"));
    } catch {
      result.issue = "runtime_missing";
      return result;
    }
    result.runtime = "invalid";
    try {
      const manifest = JSON.parse(
        await readFile(join(this.directory, "runtime.json"), "utf8"),
      );
      if (
        manifest.whisper !== pins.whisper ||
        manifest.ffmpeg !== pins.ffmpeg ||
        manifest.target !== this.target
      )
        throw new Error("version");
      if (!manifest.files || typeof manifest.files !== "object")
        throw new Error("manifest");
      for (const executable of [this.whisper, this.ffmpeg]) {
        const name = executable.slice(this.directory.length + 1);
        if (!manifest.files[name]) throw new Error("executable");
      }
      for (const [name, digest] of Object.entries(manifest.files)) {
        if (
          !/^[A-Za-z0-9_.-]+$/.test(name) ||
          typeof digest !== "string" ||
          !/^[a-f0-9]{64}$/.test(digest)
        )
          throw new Error("manifest");
        if ((await hashFile(join(this.directory, name))) !== digest)
          throw new Error("checksum");
      }
      result.runtime = "ready";
    } catch {
      result.issue = "runtime_integrity";
      return result;
    }
    if (result.model !== "ready")
      result.issue =
        result.model === "missing" ? "model_missing" : "model_integrity";
    return result;
  }

  /** Explicit provisioning action; ordinary transcription only checks readiness. */
  async downloadModel(
    signal: AbortSignal,
    fetcher: SpeechFetch = globalThis.fetch,
    progress?: (bytes: number) => void,
  ): Promise<void> {
    const timeout = AbortSignal.timeout(1_800_000);
    const combined = AbortSignal.any([signal, timeout]);
    try {
      const response = await fetcher(pins.model.url, { signal: combined });
      if (!response.ok || !response.body)
        throw new SpeechError("download_failed");
      await storeBytes(
        this.modelDirectory,
        response.body,
        combined,
        pins.model.bytes,
        pins.model,
        progress,
      );
    } catch (error) {
      if (signal.aborted) throw new SpeechError("cancelled");
      if (timeout.aborted) throw new SpeechError("timeout");
      if (error instanceof SpeechError && error.code === "media_budget")
        throw new SpeechError("download_integrity");
      if (error instanceof SpeechError) throw error;
      throw new SpeechError("download_failed");
    }
  }
}
