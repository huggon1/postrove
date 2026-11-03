import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { sourceSchema } from "../../shared/source-contracts";
import {
  videoIdentity,
  videoArtifactKey,
  videoTimestampUrl,
  type VideoIdentity,
} from "../../shared/video-contracts";
import { transcriptSegmentSchema } from "../../shared/transcript-contracts";
import {
  youtubeRuntimeVersion,
  runTranscriptProcess,
  type TranscriptRun,
} from "./youtube-transcript";
import { readVideoCheckpoint } from "./video-checkpoint";
import type { VideoSpeechFallback } from "./video-speech";
import { fetchBilibiliJson, bilibiliJsonUrl } from "./video-session";
import type {
  VideoTranscriptReader,
  VideoTranscriptResult,
  VideoReadSession,
} from "./video-transcript";

const maxBytes = 20 * 1024 * 1024;
type Subtitle = { ext?: string; data?: string };
type Metadata = {
  id?: string;
  _type?: string;
  subtitles?: Record<string, Subtitle[]>;
};
const numericId = (value: unknown) =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0
    ? String(value)
    : typeof value === "string" && /^[1-9]\d{0,19}$/.test(value)
      ? value
      : undefined;
function apiData(raw: any) {
  if (raw?.code === -101) throw new Error("bilibili_login_required");
  if (typeof raw?.code === "number" && raw.code !== 0)
    throw new Error(`bilibili_api_${raw.code}`);
  if (raw?.code !== 0 || !raw.data || typeof raw.data !== "object")
    throw new Error("transcript_extraction_failed");
  return raw.data;
}
export function selectBilibiliTrack(
  metadata: Metadata,
): { language: string; srt: string } | undefined {
  const tracks = Object.entries(metadata.subtitles ?? {}).flatMap(
    ([language, formats]) =>
      language !== "danmaku" && /^[A-Za-z0-9_-]{1,80}$/.test(language)
        ? formats
            .filter(
              (format) =>
                format.ext === "srt" &&
                typeof format.data === "string" &&
                format.data.trim(),
            )
            .map((format) => ({ language, srt: format.data! }))
        : [],
  );
  return (
    tracks.find((track) => /^(?:zh|ai-zh)(?:-|$)/.test(track.language)) ??
    tracks[0]
  );
}
function seconds(raw: string) {
  const match = raw.match(/^(\d{2,}):([0-5]\d):([0-5]\d)[,.](\d{3})$/);
  if (!match) throw new Error("invalid_captions");
  return (
    Number(match[1]) * 3600 +
    Number(match[2]) * 60 +
    Number(match[3]) +
    Number(match[4]) / 1000
  );
}
export function normalizeSrt(
  raw: string,
  video: VideoIdentity,
  duration?: number,
) {
  if (Buffer.byteLength(raw) > maxBytes)
    throw new Error("transcript_output_limit");
  const segments = raw
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean)
    .map((cue, index) => {
      const lines = cue.split("\n");
      if (/^\d+$/.test(lines[0])) lines.shift();
      const time = lines
        .shift()
        ?.match(
          /^(\d{2,}:[0-5]\d:[0-5]\d[,.]\d{3})\s*-->\s*(\d{2,}:[0-5]\d:[0-5]\d[,.]\d{3})$/,
        );
      if (!time) throw new Error("invalid_captions");
      const start = seconds(time[1]),
        end = seconds(time[2]);
      if (end < start || (duration !== undefined && start > duration + 2))
        throw new Error("invalid_caption_time");
      return transcriptSegmentSchema.parse({
        id: `segment-${index + 1}`,
        start,
        end:
          duration === undefined
            ? end
            : Math.max(start, Math.min(end, duration)),
        text: lines.join("\n").trim(),
        url: videoTimestampUrl(video, start),
      });
    });
  if (!segments.length || segments.length > 100_000)
    throw new Error("empty_captions");
  return segments;
}
function srtTime(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new Error("invalid_captions");
  const ms = Math.round(value * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
}
function subtitleSrt(raw: any) {
  if (!Array.isArray(raw?.body) || raw.body.length > 100_000)
    throw new Error("invalid_captions");
  return raw.body
    .map((line: any, index: number) => {
      if (typeof line.content !== "string") throw new Error("invalid_captions");
      return `${index + 1}\n${srtTime(line.from)} --> ${srtTime(line.to)}\n${line.content}\n`;
    })
    .join("\n");
}

export class BilibiliTranscriptReader implements VideoTranscriptReader {
  private pending = new Map<string, Promise<VideoTranscriptResult>>();
  constructor(
    private runtimeRoot: string,
    readonly evidenceRoot: string,
    private run: TranscriptRun = runTranscriptProcess,
    private speech?: Pick<VideoSpeechFallback, "read" | "ready">,
  ) {}
  async available() {
    try {
      const root = join(this.runtimeRoot, "youtube");
      const manifest = JSON.parse(
        await readFile(join(root, "runtime.json"), "utf8"),
      );
      if (manifest.downloader !== youtubeRuntimeVersion.downloader)
        return false;
      await access(
        join(root, process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp"),
        constants.X_OK,
      );
      return true;
    } catch {
      return false;
    }
  }
  async read(
    raw: string,
    attemptId: string,
    signal: AbortSignal,
    session?: VideoReadSession,
  ) {
    if (signal.aborted) throw new Error("Cancelled");
    const video = videoIdentity(raw);
    if (video?.platform !== "bilibili" || !/^[a-f0-9-]{36}$/.test(attemptId))
      throw new Error("Invalid transcript identity");
    const key = videoArtifactKey(attemptId, video);
    const pending = this.pending.get(key);
    if (pending) return pending;
    const operation = this.capture(video, key, signal, session).finally(() =>
      this.pending.delete(key),
    );
    this.pending.set(key, operation);
    return operation;
  }
  private async capture(
    video: VideoIdentity,
    key: string,
    signal: AbortSignal,
    session?: VideoReadSession,
  ): Promise<VideoTranscriptResult> {
    const directory = join(this.evidenceRoot, key);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const stateFile = join(directory, "reader-attempt.json");
    let stage: "readiness" | "source" | "captions" = "readiness";
    const save = async (name: string, value: unknown) =>
      writeFile(
        join(directory, name),
        typeof value === "string" ? value : JSON.stringify(value, null, 2),
        { mode: 0o600 },
      );
    const state = async (value: object) => {
      await save("reader-attempt.json.tmp", {
        ...value,
        stage,
        video,
        runtime: { downloader: youtubeRuntimeVersion.downloader },
        at: new Date().toISOString(),
      });
      await rename(stateFile + ".tmp", stateFile);
    };
    if (!signal.aborted) {
      try {
        const saved = JSON.parse(await readFile(stateFile, "utf8"));
        const resumeSpeech =
          saved.state === "completed" &&
          saved.diagnostic?.category === "readiness" &&
          (await this.speech?.ready());
        if (!resumeSpeech) {
          if (saved.state === "completed")
            return {
              outcome: "content",
              source: sourceSchema.parse(
                JSON.parse(
                  await readFile(join(directory, "source.json"), "utf8"),
                ),
              ),
              references: JSON.parse(
                await readFile(join(directory, "references.json"), "utf8"),
              ),
              ...(saved.diagnostic ? { diagnostic: saved.diagnostic } : {}),
            };
          const checkpoint = await readVideoCheckpoint(directory, video, key);
          if (checkpoint) return checkpoint;
          return {
            outcome: "unavailable",
            reason:
              saved.state === "unavailable"
                ? saved.reason
                : "transcript_interrupted",
          };
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    await state({ state: "running" });
    const budget = AbortSignal.any([signal, AbortSignal.timeout(75_000)]);
    try {
      if (signal.aborted) throw new Error("Cancelled");
      if (!(await this.available()))
        throw new Error("transcript_runtime_unavailable");
      const getJson = (url: string) =>
        session
          ? session.getJson(bilibiliJsonUrl(url).href, budget)
          : fetchBilibiliJson(url, budget);
      stage = "source";
      await state({ state: "running" });
      const query = video.id.startsWith("BV")
        ? `bvid=${video.id}`
        : `aid=${video.id.slice(2)}`;
      const view = apiData(
        await getJson(`https://api.bilibili.com/x/web-interface/view?${query}`),
      );
      if (
        video.id.startsWith("BV")
          ? view.bvid !== video.id
          : numericId(view.aid) !== video.id.slice(2)
      )
        throw new Error("transcript_identity_changed");
      if (
        typeof view.bvid !== "string" ||
        !/^BV[A-Za-z0-9]{10}$/.test(view.bvid) ||
        !numericId(view.aid)
      )
        throw new Error("transcript_identity_changed");
      const page = Array.isArray(view.pages)
        ? view.pages.find((page: any) => page.page === video.part)
        : undefined;
      const cid = numericId(
        page?.cid ?? (video.part === 1 ? view.cid : undefined),
      );
      if (!cid) throw new Error("transcript_identity_changed");
      video = { ...video, cid, aid: numericId(view.aid), bvid: view.bvid };
      const duration =
        typeof page?.duration === "number" &&
        Number.isFinite(page.duration) &&
        page.duration >= 0
          ? page.duration
          : undefined;
      // Keep public source metadata; signed media URLs and session state stay out of packages.
      const metadata: Record<string, unknown> = {
        video,
        bvid: view.bvid,
        aid: numericId(view.aid),
        title: String(view.title ?? video.url),
        uploader: String(view.owner?.name ?? ""),
        description: String(view.desc ?? ""),
        duration,
      };
      await save("metadata.json", metadata);
      stage = "captions";
      await state({ state: "running" });
      let track: ReturnType<typeof selectBilibiliTrack> = undefined;
      let extractorFailure: string | undefined;
      try {
        const bytes = await this.run(
          join(
            this.runtimeRoot,
            "youtube",
            process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp",
          ),
          [
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
            "--write-subs",
            "--sub-langs",
            "all,-danmaku",
            "--sub-format",
            "srt",
            "--dump-single-json",
            "--",
            video.url,
          ],
          directory,
          budget,
        );
        if (Buffer.byteLength(bytes) > maxBytes)
          throw new Error("transcript_output_limit");
        const extracted: Metadata = JSON.parse(bytes);
        const bvid = String(view.bvid);
        if (
          extracted._type === "playlist" ||
          ![
            `${bvid}_p${video.part}`,
            ...(video.part === 1 ? [bvid] : []),
          ].includes(extracted.id ?? "")
        )
          throw new Error("transcript_identity_changed");
        track = selectBilibiliTrack(extracted);
      } catch (error) {
        if (
          budget.aborted ||
          (error instanceof Error &&
            /^(transcript_identity_changed|transcript_output_limit)$/.test(
              error.message,
            ))
        )
          throw error;
        extractorFailure = "transcript_extraction_failed";
      }
      if (!track) {
        const rawPlayer = (await getJson(
          `https://api.bilibili.com/x/player/wbi/v2?bvid=${view.bvid}&cid=${cid}`,
        )) as { code?: number };
        const player =
          rawPlayer?.code === -101 && this.speech
            ? { need_login_subtitle: true }
            : apiData(rawPlayer);
        if (player.cid !== undefined && numericId(player.cid) !== cid)
          throw new Error("transcript_identity_changed");
        const subtitles: any[] = Array.isArray(player.subtitle?.subtitles)
          ? player.subtitle.subtitles
          : [];
        const listed = subtitles.filter(
          (sub) =>
            typeof sub.lan === "string" &&
            /^[A-Za-z0-9_-]{1,80}$/.test(sub.lan) &&
            typeof sub.subtitle_url === "string" &&
            sub.subtitle_url,
        );
        const selected =
          listed.find((sub) => /^(?:zh|ai-zh)(?:-|$)/.test(sub.lan)) ??
          listed[0];
        await save("metadata.json", {
          ...metadata,
          needLoginSubtitle: player.need_login_subtitle === true,
          subtitleLanguages: listed.map((sub) => sub.lan),
          ...(extractorFailure ? { extractorFailure } : {}),
        });
        if (!selected && this.speech) {
          const result = await this.speech.read({
            video,
            metadata: {
              title: String(metadata.title),
              uploader: String(metadata.uploader),
              description: String(metadata.description),
              duration,
            },
            directory,
            artifactKey: key,
            signal,
            session,
          });
          await save(
            "references.json",
            result.outcome === "content" ? result.references : [],
          );
          await state({ state: "completed", diagnostic: result.diagnostic });
          return result;
        }
        if (!selected)
          throw new Error(
            player.need_login_subtitle === true
              ? "need_login_subtitle"
              : "bilibili_subtitles_unavailable",
          );
        const subtitleUrl = selected.subtitle_url.startsWith("//")
          ? `https:${selected.subtitle_url}`
          : selected.subtitle_url;
        const raw = await getJson(subtitleUrl);
        await save("captions.json", raw);
        track = { language: selected.lan, srt: subtitleSrt(raw) };
      }
      if (budget.aborted) throw new Error("transcript_timeout");
      await save("captions.srt", track.srt);
      const segments = normalizeSrt(track.srt, video, duration);
      await save("segments.json", segments);
      const kind = track.language.startsWith("ai-") ? "automatic" : "unknown";
      const markdown =
        `# ${metadata.title}\n\n${metadata.uploader}\n\n${metadata.description}\n\n` +
        segments
          .map(
            (segment) =>
              `[${Math.floor(segment.start / 60)}:${String(Math.floor(segment.start % 60)).padStart(2, "0")}](${segment.url}) ${segment.text}`,
          )
          .join("\n\n");
      const references = [
        ...new Set(
          String(metadata.description).match(
            /https:\/\/[^\s<>"\u0000-\u001f]+/g,
          ) ?? [],
        ),
      ]
        .map((raw) => raw.replace(/[),.;]+$/, ""))
        .filter((raw) => {
          try {
            const url = new URL(raw);
            return (
              !url.username &&
              !url.password &&
              videoIdentity(raw)?.sourceKey !== video.sourceKey
            );
          } catch {
            return false;
          }
        })
        .slice(0, 30)
        .map((url) => ({ url, title: url }));
      const source = sourceSchema.parse({
        platform: "bilibili",
        sourceUrl: video.url,
        sourceKey: video.sourceKey,
        sourceIdentity: String(metadata.uploader || metadata.title).slice(
          0,
          300,
        ),
        title: String(metadata.title).slice(0, 500),
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
          video,
          provenance: { source: "platform_captions", kind },
          language: track.language,
          trackKind: kind,
          duration,
          transcriptCoverage: "unknown",
          visualCoverage: "unknown",
          artifactKey: key,
          segments,
        },
      });
      await save("references.json", references);
      await save("source.json", source);
      if (budget.aborted) throw new Error("transcript_timeout");
      await state({ state: "completed" });
      return { outcome: "content", source, references };
    } catch (error) {
      const reason = signal.aborted
        ? "cancelled"
        : budget.aborted
          ? "transcript_timeout"
          : error instanceof Error &&
              /^(transcript_|bilibili_|need_login_subtitle$|invalid_|empty_)/.test(
                error.message,
              )
            ? error.message
            : "transcript_extraction_failed";
      await state({ state: "unavailable", reason });
      if (signal.aborted) throw new Error("Cancelled");
      return { outcome: "unavailable", reason };
    }
  }
}
