import { randomUUID } from "node:crypto";
import { chmod, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sourceSchema } from "../../shared/source-contracts";
import {
  videoTimestampUrl,
  type VideoIdentity,
} from "../../shared/video-contracts";
import { readingDiagnostic } from "../../shared/reading-diagnostics";
import type { SpeechResult } from "../../shared/speech-contracts";
import type { SpeechService } from "./speech";
import type {
  VideoReadSession,
  VideoTranscriptResult,
} from "./video-transcript";
import { xiaohongshuVideoDiagnostic } from "./video-diagnostics";
import { runTranscriptProcess, type TranscriptRun } from "./youtube-transcript";
import {
  videoMetadataMarkdown,
  videoDescriptionReferences,
  type VideoMetadata,
} from "./video-metadata";

export type VideoSpeechMetadata = VideoMetadata;
/** Uses page identity for media retrieval and publishes only bounded ASR evidence. */
export class VideoSpeechFallback {
  constructor(
    private runtimeRoot: string,
    private speech: Pick<
      SpeechService,
      "check" | "transcribe" | "acquireMedia"
    >,
    private run: TranscriptRun = runTranscriptProcess,
  ) {}
  async ready() {
    const status = await this.speech.check();
    return status.runtime === "ready" && status.model === "ready";
  }
  async read(options: {
    video: VideoIdentity;
    metadata: VideoSpeechMetadata;
    directory: string;
    artifactKey: string;
    signal: AbortSignal;
    session?: VideoReadSession;
  }): Promise<VideoTranscriptResult> {
    const { video, metadata, directory, artifactKey, signal, session } =
      options;
    let speech: SpeechResult | undefined;
    let issue: string | undefined;
    let limitedMedia = false;
    const save = async (name: string, value: unknown) => {
      const target = join(directory, name);
      await writeFile(`${target}.tmp`, JSON.stringify(value), { mode: 0o600 });
      await rename(`${target}.tmp`, target);
    };
    const publish = async () => {
      const segments = (speech?.segments ?? []).map((segment, index) => ({
        id: `segment-${index + 1}`,
        start: segment.start,
        end: segment.end,
        text: segment.text,
        url: videoTimestampUrl(video, segment.start),
      }));
      const markdown = [
        videoMetadataMarkdown(metadata),
        ...segments.map(
          (segment) =>
            `[${Math.floor(segment.start / 60)}:${String(Math.floor(segment.start % 60)).padStart(2, "0")}](${segment.url}) ${segment.text}`,
        ),
      ]
        .filter(Boolean)
        .join("\n\n");
      const languages = [
        ...new Set(
          speech?.chunks.map((chunk) => chunk.detectedLanguage).filter(Boolean),
        ),
      ];
      const source = sourceSchema.parse({
        platform: video.platform,
        sourceUrl: video.url,
        sourceKey: video.sourceKey,
        sourceIdentity: (
          metadata.uploader ||
          metadata.title ||
          video.url
        ).slice(0, 300),
        title: metadata.title.slice(0, 500),
        fetchedAt: new Date().toISOString(),
        markdown,
        contentBlocks: Array.from(
          { length: Math.ceil(markdown.length / 300000) },
          (_, index) => ({
            type: "text",
            text: markdown.slice(index * 300000, (index + 1) * 300000),
          }),
        ),
        images: metadata.images ?? [],
        completeness: "partial",
        completenessNote: `Metadata captured. Speech: ${speech?.status ?? "unavailable"}${issue ? ` (${issue})` : ""}. Visual coverage: unknown.`,
        ...(segments.length
          ? {
              evidence: {
                kind: "transcript",
                captureId: randomUUID(),
                videoId: video.id,
                video,
                language:
                  speech?.language === "auto"
                    ? languages.length === 1
                      ? languages[0]
                      : "und"
                    : speech?.language || "und",
                trackKind: "automatic",
                provenance: {
                  source: "application_asr",
                  kind: "automatic",
                  engine: speech!.backend,
                  model: speech!.model,
                },
                duration: speech?.duration ?? metadata.duration,
                transcriptCoverage:
                  speech?.status === "completed" && !issue
                    ? "complete"
                    : "partial",
                visualCoverage: "unknown",
                artifactKey,
                segments,
              },
            }
          : {}),
      });
      await save("source.json", source);
      await save("segments.json", segments);
      return source;
    };
    await publish();
    let mediaPath: string | undefined;
    try {
      const readiness = await this.speech.check();
      if (readiness.runtime !== "ready" || readiness.model !== "ready")
        throw new Error(
          readiness.issue ??
            (readiness.runtime !== "ready"
              ? "runtime_missing"
              : "model_missing"),
        );
      if (metadata.duration !== undefined && metadata.duration > 2 * 60 * 60)
        throw new Error("duration_budget");
      if (video.platform === "bilibili" && session && video.cid) {
        const raw = (await session.getJson(
          `https://api.bilibili.com/x/player/playurl?bvid=${video.bvid ?? video.id}&cid=${video.cid}&fnval=16&qn=16&fourk=0`,
          signal,
        )) as any;
        if (raw?.code === -101) throw new Error("login_required");
        if (raw?.code !== 0) throw new Error("media_unavailable");
        limitedMedia =
          raw.data?.is_preview === true || raw.data?.is_preview === 1;
        const audio = raw.data?.dash?.audio;
        const candidates = (Array.isArray(audio) ? audio : [])
          .slice()
          .sort(
            (left, right) =>
              (Number(left.bandwidth) || Infinity) -
              (Number(right.bandwidth) || Infinity),
          );
        // CDN responses list peer-delivery primaries on alternate ports and HTTPS backups.
        // Select complete, policy-compatible media URLs from this response only.
        const addresses: unknown[] = candidates.flatMap((item: any) => [
          item.baseUrl ?? item.base_url,
          ...(Array.isArray(item.backupUrl ?? item.backup_url)
            ? (item.backupUrl ?? item.backup_url)
            : []),
        ]);
        if (
          !addresses.length &&
          Array.isArray(raw.data?.durl) &&
          raw.data.durl.length === 1
        )
          addresses.push(
            raw.data.durl[0]?.url,
            ...(raw.data.durl[0]?.backup_url ?? []),
          );
        const urls = [
          ...new Set(
            addresses.filter(
              (value): value is string => typeof value === "string",
            ),
          ),
        ]
          .flatMap((address) => {
            try {
              const url = new URL(address);
              return url.protocol === "https:" &&
                !url.port &&
                !url.username &&
                !url.password &&
                (url.hostname.endsWith(".bilivideo.com") ||
                  url.hostname.endsWith(".hdslb.com") ||
                  url.hostname.endsWith(".bilivideo.cn"))
                ? [url]
                : [];
            } catch {
              return [];
            }
          })
          .slice(0, 3);
        let mediaFailure: unknown;
        for (const url of urls) {
          if (signal.aborted) throw new Error("cancelled");
          try {
            mediaPath = (
              await this.speech.acquireMedia({
                url: url.href,
                allowedHosts: [url.hostname],
                headers: { Referer: video.url },
                signal,
              })
            ).path;
            break;
          } catch (error) {
            mediaFailure = error;
          }
        }
        if (!mediaPath) throw mediaFailure ?? new Error("media_unavailable");
      } else {
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
        await this.run(
          executable,
          [
            "--ignore-config",
            "--no-plugin-dirs",
            "--no-remote-components",
            "--no-cache-dir",
            "--no-playlist",
            "--no-progress",
            "--no-warnings",
            "--socket-timeout",
            "20",
            "--retries",
            "1",
            "--max-filesize",
            "256M",
            "--format",
            "bestaudio/best",
            "--js-runtimes",
            `deno:${deno}`,
            "--output",
            "speech-media.%(ext)s",
            "--",
            video.url,
          ],
          directory,
          signal,
        );
        const names = (await readdir(directory)).filter(
          (name) =>
            /^speech-media\.[a-zA-Z0-9]+$/.test(name) &&
            !name.endsWith(".part") &&
            !name.endsWith(".ytdl"),
        );
        if (names.length !== 1) throw new Error("media_unavailable");
        mediaPath = join(directory, names[0]);
        const info = await stat(mediaPath);
        if (!info.isFile() || info.size > 256 * 1024 * 1024)
          throw new Error("media_budget");
        await chmod(mediaPath, 0o600);
      }
      speech = await this.speech.transcribe({
        mediaPath,
        signal,
        onProgress: async (result) => {
          speech = result;
          await save("transcription.json", result);
          await publish();
        },
      });
      const shortened =
        speech.duration !== undefined &&
        metadata.duration !== undefined &&
        speech.duration + Math.max(2, metadata.duration * 0.01) <
          metadata.duration;
      issue =
        speech.issue?.code ??
        (limitedMedia || shortened ? "media_incomplete" : undefined);
      await save("transcription.json", speech);
    } catch (error) {
      issue = signal.aborted
        ? "cancelled"
        : error instanceof Error && /^[a-z_]{1,64}$/.test(error.message)
          ? error.message
          : "media_unavailable";
    } finally {
      for (const name of await readdir(directory))
        if (/^speech-media\.[a-zA-Z0-9.]+$/.test(name))
          await rm(join(directory, name), { force: true }).catch(() => {});
    }
    const source = await publish();
    if (signal.aborted) throw new Error("Cancelled");
    const references = videoDescriptionReferences(
      metadata.description ?? "",
      video,
    );
    return {
      outcome: "content",
      source,
      references,
      ...(issue
        ? {
            diagnostic:
              issue === "media_incomplete"
                ? readingDiagnostic("capture_incomplete", "media", {
                    failureCode: issue,
                  })
                : xiaohongshuVideoDiagnostic(issue, "transcription"),
          }
        : {}),
    };
  }
}
