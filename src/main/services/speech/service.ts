import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type {
  SpeechChunk,
  SpeechResult,
  SpeechReadiness,
  SpeechSegment,
} from "../../../shared/speech-contracts";
import { acquireSpeechMedia, importMedia } from "./media";
import {
  SpeechError,
  runSpeechProcess,
  type SpeechProcessRunner,
} from "./process";
import { SpeechRuntime, speechRuntimePins as pins } from "./runtime";
import { inspectWave, sliceWave } from "./wave";

export interface SpeechBudget {
  maxMediaBytes: number;
  maxDurationSeconds: number;
  chunkSeconds: number;
  processTimeoutMs: number;
  totalTimeoutMs: number;
  retries: number;
}
const defaults: SpeechBudget = {
  maxMediaBytes: 256 * 1024 * 1024,
  maxDurationSeconds: 7_200,
  chunkSeconds: 300,
  processTimeoutMs: 600_000,
  totalTimeoutMs: 3_600_000,
  retries: 1,
};
const active = new Set<string>();

export interface SpeechTranscriptionRequest {
  mediaPath: string;
  language?: string;
  signal: AbortSignal;
  onProgress?: (result: SpeechResult) => void | Promise<void>;
}
export interface SpeechTranscriber {
  check(): Promise<SpeechReadiness>;
  transcribe(request: SpeechTranscriptionRequest): Promise<SpeechResult>;
}

export function parseWhisperOutput(
  raw: string,
  index: number,
  start: number,
  end: number,
): SpeechChunk {
  let input: {
    result?: { language?: string };
    transcription: Array<{
      offsets: { from: number; to: number };
      text: string;
    }>;
  };
  try {
    input = JSON.parse(raw);
  } catch {
    throw new SpeechError("invalid_output");
  }
  if (!Array.isArray(input?.transcription))
    throw new SpeechError("invalid_output");
  const segments: SpeechSegment[] = [];
  let previousStart = 0;
  for (const item of input.transcription) {
    const from = item?.offsets?.from,
      to = item?.offsets?.to;
    if (
      !Number.isFinite(from) ||
      !Number.isFinite(to) ||
      from < previousStart ||
      to < from ||
      from < 0 ||
      to > Math.ceil(Math.max(1, end - start)) * 1000 + 1000 ||
      typeof item.text !== "string"
    )
      throw new SpeechError("invalid_output");
    previousStart = from;
    if (item.text.trim() && from < (end - start) * 1000)
      segments.push({
        id: `speech-${index}-${segments.length}`,
        start: start + from / 1000,
        end: Math.min(end, start + to / 1000),
        ...(start + to / 1000 > end
          ? { recognizerEnd: start + to / 1000 }
          : {}),
        text: item.text,
      });
  }
  const detectedLanguage = input.result?.language;
  if (detectedLanguage !== undefined && !/^[a-z]{2,3}$/.test(detectedLanguage))
    throw new SpeechError("invalid_output");
  return {
    index,
    start,
    end,
    state: segments.length ? "speech" : "no_speech",
    segments,
    ...(detectedLanguage ? { detectedLanguage } : {}),
  };
}

export class SpeechService implements SpeechTranscriber {
  readonly runtime: SpeechRuntime;
  private readonly budget: SpeechBudget;
  private readonly directory: string;
  private readonly run: SpeechProcessRunner;
  private readonly readiness: () => Promise<SpeechReadiness>;
  constructor(options: {
    runtimeRoot: string;
    dataDir: string;
    budget?: Partial<SpeechBudget>;
    run?: SpeechProcessRunner;
    readiness?: () => Promise<SpeechReadiness>;
  }) {
    this.directory = resolve(options.dataDir, "speech");
    this.runtime = new SpeechRuntime(options.runtimeRoot, options.dataDir);
    this.run = options.run ?? runSpeechProcess;
    this.readiness = options.readiness ?? (() => this.runtime.check());
    this.budget = { ...defaults, ...options.budget };
    for (const [name, value] of Object.entries(this.budget)) {
      if (
        !Number.isSafeInteger(value) ||
        value < (name === "retries" ? 0 : 1) ||
        value > defaults[name as keyof SpeechBudget]
      )
        throw new Error(`Invalid speech budget: ${name}`);
    }
  }
  check() {
    return this.readiness();
  }
  downloadModel(signal: AbortSignal) {
    return this.runtime.downloadModel(signal);
  }
  acquireMedia(
    options: Omit<
      Parameters<typeof acquireSpeechMedia>[0],
      "directory" | "maxBytes"
    >,
  ) {
    return acquireSpeechMedia({
      ...options,
      directory: join(this.directory, "media"),
      maxBytes: this.budget.maxMediaBytes,
    });
  }

  async transcribe(request: SpeechTranscriptionRequest): Promise<SpeechResult> {
    const language = request.language ?? "auto";
    if (!/^(auto|[a-z]{2,3})$/.test(language))
      throw new Error("Invalid speech language");
    const result: SpeechResult = {
      status: "unavailable",
      provenance: "application_asr",
      backend: "whisper.cpp",
      runtimeVersion: pins.whisper,
      model: pins.model.id,
      modelSha256: pins.model.sha256,
      language,
      chunks: [],
      segments: [],
    };
    if (active.has(this.directory))
      return { ...result, issue: { code: "busy" } };
    active.add(this.directory);
    const timeout = AbortSignal.timeout(this.budget.totalTimeoutMs);
    const signal = AbortSignal.any([request.signal, timeout]);
    let temporary: string | undefined;
    let chunkIndex: number | undefined;
    try {
      if (signal.aborted) throw new SpeechError("cancelled");
      const ready = await this.check();
      if (ready.issue) throw new SpeechError(ready.issue);
      if (ready.runtime !== "ready" || ready.model !== "ready")
        throw new SpeechError("runtime_missing");
      const media = await importMedia(
        request.mediaPath,
        join(this.directory, "media"),
        signal,
        this.budget.maxMediaBytes,
      );
      result.mediaSha256 = media.sha256;
      const key = createHash("sha256")
        .update(
          JSON.stringify({
            media: media.sha256,
            version: pins.whisper,
            model: pins.model.sha256,
            language,
            chunk: this.budget.chunkSeconds,
            ffmpeg: pins.ffmpeg,
            pipeline: 1,
          }),
        )
        .digest("hex");
      const job = join(this.directory, "jobs", key);
      await mkdir(job, { recursive: true, mode: 0o700 });
      temporary = join(job, `.attempt-${randomUUID()}`);
      await mkdir(temporary, { mode: 0o700 });
      const wave = join(temporary, "audio.wav");
      await this.execute(
        this.runtime.ffmpeg,
        [
          "-nostdin",
          "-v",
          "error",
          "-protocol_whitelist",
          "file,pipe",
          "-format_whitelist",
          "mov,mp3,wav,ogg,flac,matroska,webm,aac,mpegts",
          "-i",
          media.path,
          "-map",
          "0:a:0",
          "-vn",
          "-t",
          String(this.budget.maxDurationSeconds + 1),
          "-ac",
          "1",
          "-ar",
          "16000",
          "-c:a",
          "pcm_s16le",
          "-f",
          "wav",
          "-y",
          wave,
        ],
        temporary,
        signal,
        "decode_failed",
      );
      const audio = await inspectWave(wave);
      result.duration = audio.duration;
      if (audio.duration > this.budget.maxDurationSeconds)
        throw new SpeechError("duration_budget");
      result.totalChunks = Math.ceil(audio.duration / this.budget.chunkSeconds);
      for (let index = 0; index < result.totalChunks; index++) {
        chunkIndex = index;
        if (signal.aborted) throw new SpeechError("cancelled");
        const start = index * this.budget.chunkSeconds;
        const end = Math.min(audio.duration, start + this.budget.chunkSeconds);
        const saved = join(job, `chunk-${index}.json`);
        let chunk: SpeechChunk | undefined;
        try {
          if ((await stat(saved)).size > 1_048_576)
            throw new Error("checkpoint budget");
          const cached = JSON.parse(await readFile(saved, "utf8"));
          const validated = parseWhisperOutput(
            JSON.stringify({
              result: { language: cached.detectedLanguage },
              transcription: cached.segments?.map((segment: SpeechSegment) => ({
                offsets: {
                  from: (segment.start - start) * 1000,
                  to: ((segment.recognizerEnd ?? segment.end) - start) * 1000,
                },
                text: segment.text,
              })),
            }),
            index,
            start,
            end,
          );
          if (
            cached.index === index &&
            cached.start === start &&
            cached.end === end &&
            cached.state === validated.state
          )
            chunk = validated;
        } catch {
          /* A missing or invalid checkpoint reprocesses only this chunk. */
        }
        if (!chunk) {
          const input = join(temporary, "chunk.wav"),
            output = join(temporary, "recognized");
          const { silent } = await sliceWave(
            wave,
            input,
            audio.offset + start * 32_000,
            Math.round((end - start) * 32_000),
          );
          if (silent)
            chunk = { index, start, end, state: "no_speech", segments: [] };
          else {
            await this.execute(
              this.runtime.whisper,
              [
                "-m",
                this.runtime.model,
                "-f",
                input,
                "-l",
                language,
                "-oj",
                "-of",
                output,
                "-t",
                "4",
                "-ng",
                "-np",
              ],
              temporary,
              signal,
              "process_failed",
              () => rm(`${output}.json`, { force: true }),
            );
            try {
              if ((await stat(`${output}.json`)).size > 1_048_576)
                throw new SpeechError("output_budget");
              const raw = await readFile(`${output}.json`, "utf8");
              await writeFile(
                join(job, `recognition-${index}-${randomUUID()}.json`),
                raw,
                { mode: 0o600 },
              );
              chunk = parseWhisperOutput(raw, index, start, end);
            } catch (error) {
              throw error instanceof SpeechError
                ? error
                : new SpeechError("invalid_output");
            }
          }
          const staging = `${saved}.${randomUUID()}.tmp`;
          try {
            await writeFile(staging, JSON.stringify(chunk), { mode: 0o600 });
            await rename(staging, saved);
          } finally {
            await rm(staging, { force: true });
          }
        }
        result.chunks.push(chunk);
        result.segments.push(...chunk.segments);
        result.status = "partial";
        await request.onProgress?.(structuredClone(result));
      }
      result.status = "completed";
    } catch (error) {
      const code = request.signal.aborted
        ? "cancelled"
        : timeout.aborted
          ? "timeout"
          : error instanceof SpeechError
            ? error.code
            : "storage_failed";
      result.status =
        code === "cancelled"
          ? "cancelled"
          : result.chunks.length
            ? "partial"
            : "unavailable";
      result.issue = {
        code,
        ...(chunkIndex === undefined ? {} : { chunkIndex }),
      };
    } finally {
      if (temporary)
        await rm(temporary, { recursive: true, force: true }).catch(() => {});
      active.delete(this.directory);
    }
    return result;
  }

  private async execute(
    executable: string,
    args: string[],
    cwd: string,
    signal: AbortSignal,
    failure: "decode_failed" | "process_failed",
    beforeAttempt?: () => Promise<void>,
  ) {
    for (let attempt = 0; ; attempt++) {
      try {
        if (signal.aborted) throw new SpeechError("cancelled");
        await beforeAttempt?.();
        await this.run({
          executable,
          args,
          cwd,
          signal,
          timeoutMs: this.budget.processTimeoutMs,
        });
        return;
      } catch (error) {
        if (signal.aborted) throw new SpeechError("cancelled");
        const code = error instanceof SpeechError ? error.code : failure;
        if (code !== "process_failed" || attempt >= this.budget.retries)
          throw new SpeechError(code === "process_failed" ? failure : code);
      }
    }
  }
}
