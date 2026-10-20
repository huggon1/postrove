import { spawn } from "node:child_process";
import {
  access,
  chmod,
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  sourceSchema,
  type SourceContent,
} from "../../shared/source-contracts";
import { youtubeVideo } from "../../shared/source-profiles";
import { transcriptSegmentSchema } from "../../shared/transcript-contracts";

export const youtubeRuntimeVersion = {
  downloader: "2026.08.19",
  javascript: "2.5.6",
} as const;
type Track = { language: string; kind: "creator" | "automatic" };
type Metadata = {
  id?: string;
  title?: string;
  uploader?: string;
  channel?: string;
  description?: string;
  language?: string;
  duration?: number;
  subtitles?: Record<string, { ext?: string; url?: string }[]>;
  automatic_captions?: Record<string, { ext?: string; url?: string }[]>;
};
export type TranscriptResult =
  | {
      outcome: "content";
      source: SourceContent;
      references: { url: string; title: string }[];
    }
  | { outcome: "unavailable"; reason: string };
type Run = (
  executable: string,
  args: string[],
  directory: string,
  signal: AbortSignal,
) => Promise<string>;

export function selectTranscriptTrack(metadata: Metadata): Track | undefined {
  const candidates: Track[] = [];
  for (const [kind, tracks] of [
    ["creator", metadata.subtitles],
    ["automatic", metadata.automatic_captions],
  ] as const)
    for (const [language, formats] of Object.entries(tracks ?? {})) {
      if (language === "live_chat" || !/^[A-Za-z0-9_-]{1,80}$/.test(language))
        continue;
      if (
        formats.some((format) => {
          try {
            return (
              format.ext === "json3" &&
              !!format.url &&
              !new URL(format.url).searchParams.has("tlang")
            );
          } catch {
            return false;
          }
        })
      )
        candidates.push({ language, kind });
    }
  const original = metadata.language?.replace(/-orig$/, "");
  return (
    candidates.find(
      (track) => track.kind === "creator" && track.language === original,
    ) ??
    candidates.find(
      (track) =>
        track.kind === "automatic" &&
        (track.language.endsWith("-orig") || track.language === original),
    ) ??
    candidates.find((track) => track.kind === "creator") ??
    candidates[0]
  );
}

/** json3 rolling captions repeat a window; remove only overlap in adjacent timed windows. */
export function normalizeTranscript(
  raw: string,
  videoId: string,
  duration?: number,
) {
  const input = JSON.parse(raw);
  if (!Array.isArray(input.events)) throw new Error("invalid_captions");
  const segments: Array<{
    id: string;
    start: number;
    end: number;
    text: string;
    url: string;
  }> = [];
  let previousText = "",
    previousEnd = -1;
  for (const event of input.events) {
    if (!Array.isArray(event.segs)) continue;
    const start = Number(event.tStartMs) / 1000;
    const length = Number(event.dDurationMs) / 1000;
    if (
      !Number.isFinite(start) ||
      start < 0 ||
      !Number.isFinite(length) ||
      length < 0
    )
      throw new Error("invalid_captions");
    if (duration !== undefined && start > duration + 2)
      throw new Error("invalid_caption_time");
    const end =
      duration === undefined
        ? start + length
        : Math.min(start + length, duration);
    const fullText = event.segs
      .map((segment: { utf8?: string }) => segment.utf8 ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    if (!fullText) continue;
    let text = fullText;
    if (start < previousEnd && previousText) {
      let overlap = Math.min(previousText.length, text.length);
      while (
        overlap > 0 &&
        previousText.slice(-overlap) !== text.slice(0, overlap)
      )
        overlap--;
      if (
        overlap === text.length ||
        (overlap >= 4 &&
          (/\s/.test(text[overlap] ?? "") ||
            /[^\x00-\x7f]/.test(text.slice(0, overlap))))
      )
        text = text.slice(overlap).trim();
    }
    previousText = fullText;
    previousEnd = end;
    if (text)
      segments.push(
        transcriptSegmentSchema.parse({
          id: `segment-${segments.length + 1}`,
          start,
          end: Math.max(start, end),
          text,
          url: `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(start)}s`,
        }),
      );
  }
  if (!segments.length) throw new Error("empty_captions");
  return segments;
}
const runProcess: Run = (executable, args, directory, signal) =>
  new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error("Cancelled"));
    const env: NodeJS.ProcessEnv = {
      DENO_NO_UPDATE_CHECK: "1",
      DENO_DIR: join(directory, "js-cache"),
    };
    for (const name of [
      "PATH",
      "HOME",
      "TMPDIR",
      "TEMP",
      "TMP",
      "SYSTEMROOT",
      "WINDIR",
      "HTTP_PROXY",
      "HTTPS_PROXY",
      "ALL_PROXY",
      "NO_PROXY",
      "http_proxy",
      "https_proxy",
      "all_proxy",
      "no_proxy",
    ])
      if (process.env[name]) env[name] = process.env[name];
    const child = spawn(executable, args, {
      cwd: directory,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env,
      detached: process.platform !== "win32",
    });
    const output: Buffer[] = [];
    let bytes = 0,
      failed = false;
    const stop = (error: Error) => {
      if (failed) return;
      failed = true;
      try {
        if (process.platform !== "win32" && child.pid)
          process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
      reject(error);
    };
    const abort = () => stop(new Error("Cancelled"));
    const timer = setTimeout(
      () => stop(new Error("transcript_timeout")),
      75_000,
    );
    signal.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (part: Buffer) => {
      bytes += part.length;
      if (bytes > 24 * 1024 * 1024) stop(new Error("transcript_output_limit"));
      else output.push(part);
    });
    // Downloader diagnostics can contain temporary signed URLs. Store classified state only.
    child.stderr.resume();
    child.on("error", () => stop(new Error("transcript_runtime_unavailable")));
    child.on("close", (code) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      if (!failed)
        code === 0
          ? resolve(Buffer.concat(output).toString("utf8"))
          : reject(new Error("transcript_extraction_failed"));
    });
  });

export class YoutubeTranscriptReader {
  private pending = new Map<string, Promise<TranscriptResult>>();
  private readiness?: Promise<boolean>;
  constructor(
    private runtimeRoot: string,
    readonly evidenceRoot: string,
    private run: Run = runProcess,
  ) {}
  available() {
    return (this.readiness ??= (async () => {
      try {
        const directory = join(this.runtimeRoot, "youtube");
        const manifest = JSON.parse(
          await readFile(join(directory, "runtime.json"), "utf8"),
        );
        if (
          manifest.downloader !== youtubeRuntimeVersion.downloader ||
          manifest.javascript !== youtubeRuntimeVersion.javascript
        )
          return false;
        for (const name of ["yt-dlp", "deno"])
          await access(
            join(
              directory,
              name + (process.platform === "win32" ? ".exe" : ""),
            ),
            constants.X_OK,
          );
        return true;
      } catch {
        return false;
      }
    })());
  }
  async read(
    raw: string,
    attemptId: string,
    signal: AbortSignal,
  ): Promise<TranscriptResult> {
    const video = youtubeVideo(raw);
    if (!video || !/^[a-f0-9-]{36}$/.test(attemptId))
      throw new Error("Invalid transcript identity");
    const key = `${attemptId}/youtube/${video.id}`;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const operation = this.capture(video, key, signal).finally(() =>
      this.pending.delete(key),
    );
    this.pending.set(key, operation);
    return operation;
  }
  private async capture(
    video: NonNullable<ReturnType<typeof youtubeVideo>>,
    key: string,
    signal: AbortSignal,
  ): Promise<TranscriptResult> {
    const directory = join(this.evidenceRoot, key);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const stateFile = join(directory, "reader-attempt.json");
    try {
      const saved = JSON.parse(await readFile(stateFile, "utf8"));
      if (saved.state === "completed")
        return {
          outcome: "content",
          source: sourceSchema.parse(
            JSON.parse(await readFile(join(directory, "source.json"), "utf8")),
          ),
          references: JSON.parse(
            await readFile(join(directory, "references.json"), "utf8"),
          ),
        };
      if (saved.state === "unavailable")
        return { outcome: "unavailable", reason: saved.reason };
      return { outcome: "unavailable", reason: "transcript_interrupted" };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const saveState = async (state: object) => {
      await writeFile(
        stateFile + ".tmp",
        JSON.stringify({
          ...state,
          videoId: video.id,
          runtime: youtubeRuntimeVersion,
          at: new Date().toISOString(),
        }),
        { mode: 0o600 },
      );
      await rename(stateFile + ".tmp", stateFile);
    };
    await saveState({ state: "running" });
    try {
      if (!(await this.available()))
        throw new Error("transcript_runtime_unavailable");
      const executable = join(
        this.runtimeRoot,
        "youtube",
        process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp",
      );
      const deno = join(
        this.runtimeRoot,
        "youtube",
        process.platform === "win32" ? "deno.exe" : "deno",
      );
      const common = [
        "--ignore-config",
        "--no-plugin-dirs",
        "--no-remote-components",
        "--no-cache-dir",
        "--no-playlist",
        "--skip-download",
        "--no-progress",
        "--no-warnings",
        "--socket-timeout",
        "20",
        "--retries",
        "1",
        "--js-runtimes",
        `deno:${deno}`,
      ];
      const metadataBytes = await this.run(
        executable,
        [...common, "--dump-single-json", "--", video.url],
        directory,
        signal,
      );
      await writeFile(join(directory, "metadata.json"), metadataBytes, {
        mode: 0o600,
      });
      const metadata: Metadata = JSON.parse(metadataBytes);
      if (metadata.id !== video.id)
        throw new Error("transcript_identity_changed");
      const track = selectTranscriptTrack(metadata);
      if (!track) throw new Error("transcript_unavailable");
      await this.run(
        executable,
        [
          ...common,
          track.kind === "creator" ? "--write-subs" : "--write-auto-subs",
          "--sub-langs",
          track.language,
          "--sub-format",
          "json3",
          "--output",
          "captions.%(ext)s",
          "--",
          video.url,
        ],
        directory,
        signal,
      );
      const names = (await readdir(directory)).filter((name) =>
        /^captions\.[A-Za-z0-9_-]+\.json3$/.test(name),
      );
      if (names.length !== 1) throw new Error("transcript_unavailable");
      if ((await stat(join(directory, names[0]))).size > 20 * 1024 * 1024)
        throw new Error("transcript_output_limit");
      await chmod(join(directory, names[0]), 0o600);
      const captions = await readFile(join(directory, names[0]), "utf8");
      if (Buffer.byteLength(captions) > 20 * 1024 * 1024)
        throw new Error("transcript_output_limit");
      await writeFile(join(directory, "captions.json3"), captions, {
        mode: 0o600,
      });
      const duration =
        typeof metadata.duration === "number" &&
        Number.isFinite(metadata.duration) &&
        metadata.duration >= 0
          ? metadata.duration
          : undefined;
      const segments = normalizeTranscript(captions, video.id, duration);
      await writeFile(
        join(directory, "segments.json"),
        JSON.stringify(segments, null, 2),
        { mode: 0o600 },
      );
      const markdown =
        `# ${metadata.title || video.url}\n\n${metadata.channel || metadata.uploader || ""}\n\n${metadata.description || ""}\n\n` +
        segments
          .map(
            (segment) =>
              `[${Math.floor(segment.start / 60)}:${String(Math.floor(segment.start % 60)).padStart(2, "0")}](${segment.url}) ${segment.text}`,
          )
          .join("\n\n");
      const references = [
        ...new Set(
          (metadata.description ?? "").match(
            /https:\/\/[^\s<>"\u0000-\u001f]+/g,
          ) ?? [],
        ),
      ]
        .map((url) => url.replace(/[),.;]+$/, ""))
        .filter((raw) => {
          try {
            const u = new URL(raw);
            return (
              u.protocol === "https:" &&
              !u.username &&
              !u.password &&
              youtubeVideo(raw)?.key !== video.key
            );
          } catch {
            return false;
          }
        })
        .slice(0, 30)
        .map((url) => ({ url, title: url }));
      await writeFile(
        join(directory, "references.json"),
        JSON.stringify(references),
        { mode: 0o600 },
      );
      const source = sourceSchema.parse({
        platform: "youtube",
        sourceUrl: video.url,
        sourceIdentity: String(
          metadata.channel || metadata.uploader || metadata.title || video.url,
        ).slice(0, 300),
        sourceKey: video.key,
        title: String(metadata.title || video.url).slice(0, 500),
        fetchedAt: new Date().toISOString(),
        markdown,
        contentBlocks: Array.from(
          { length: Math.ceil(markdown.length / 300000) },
          (_, index) => ({
            type: "text",
            text: markdown.slice(index * 300000, (index + 1) * 300000),
          }),
        ),
        images: [],
        completeness: "partial",
        completenessNote:
          "Available original transcript and metadata; visual content coverage is unknown.",
        evidence: {
          kind: "transcript",
          captureId: randomUUID(),
          videoId: video.id,
          language: track.language,
          trackKind: track.kind,
          duration,
          transcriptCoverage: "unknown",
          visualCoverage: "unknown",
          artifactKey: key,
          segments,
        },
      });
      await writeFile(join(directory, "source.json"), JSON.stringify(source), {
        mode: 0o600,
      });
      await saveState({ state: "completed" });
      return { outcome: "content", source, references };
    } catch (error) {
      const reason = signal.aborted
        ? "cancelled"
        : error instanceof Error &&
            /^(transcript_|invalid_|empty_)/.test(error.message)
          ? error.message
          : "transcript_extraction_failed";
      await saveState({ state: "unavailable", reason });
      if (signal.aborted) throw new Error("Cancelled");
      return { outcome: "unavailable", reason };
    }
  }
}
