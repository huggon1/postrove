import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  sourceSchema,
  type SourceContent,
} from "../../shared/source-contracts";
import { videoArtifactKey, videoIdentity } from "../../shared/video-contracts";
import {
  readingDiagnosticSchema,
  readingStageSchema,
  type ReadingStage,
} from "../../shared/reading-diagnostics";
import { xiaohongshuVideoDiagnostic } from "./video-diagnostics";
import { videoDescriptionReferences } from "./video-metadata";
import type {
  SpeechReadiness,
  SpeechResult,
} from "../../shared/speech-contracts";
import type {
  VideoReadSession,
  VideoTranscriptReader,
  VideoTranscriptResult,
} from "./video-transcript";
import {
  xhsNoteIdentity,
  mergeXhsVideoMetadata,
  normalizeXhsVideoMetadata,
  type XhsCookie,
  type XhsVideoMetadata,
  type XiaohongshuMediaReader,
} from "./xiaohongshu-media";

export interface XhsVideoContext {
  cookies?: XhsCookie[];
  fallback?: XhsVideoMetadata;
  /** Only an observed website challenge supplies this field. */
  accessIssue?:
    | "login_required"
    | "verification_required"
    | "access_parameters_invalid"
    | "source_unavailable";
}
export interface XhsVideoDependencies {
  media: Pick<XiaohongshuMediaReader, "available" | "read">;
  speech: {
    check?(): Promise<SpeechReadiness>;
    transcribe(request: {
      mediaPath: string;
      signal: AbortSignal;
      onProgress?: (result: SpeechResult) => Promise<void>;
    }): Promise<SpeechResult>;
  };
  acquire(request: {
    url: string;
    allowedHosts: string[];
    headers: Record<string, string>;
    directory: string;
    signal: AbortSignal;
  }): Promise<{ path: string }>;
  context?(
    url: string,
    signal: AbortSignal,
    session?: VideoReadSession,
  ): Promise<XhsVideoContext>;
}
function time(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
async function save(path: string, value: unknown) {
  await writeFile(`${path}.tmp`, JSON.stringify(value), { mode: 0o600 });
  await rename(`${path}.tmp`, path);
}
/** Captures page metadata first, then retains every completed speech segment. */
export class XiaohongshuVideoReader implements VideoTranscriptReader {
  private pending = new Map<string, Promise<VideoTranscriptResult>>();
  constructor(
    readonly evidenceRoot: string,
    private dependencies: XhsVideoDependencies,
  ) {}
  // Tool admission follows source-reader readiness; ASR readiness remains a separate result.
  available() {
    return this.dependencies.media.available();
  }
  async read(
    url: string,
    attemptId: string,
    signal: AbortSignal,
    session?: VideoReadSession,
  ): Promise<VideoTranscriptResult> {
    if (signal.aborted) throw new Error("Cancelled");
    const note = xhsNoteIdentity(url),
      video = videoIdentity(url);
    if (!note || !video || video.platform !== "xiaohongshu")
      throw new Error("Invalid Xiaohongshu video identity");
    const key = videoArtifactKey(attemptId, video);
    const existing = this.pending.get(key);
    if (existing) return existing;
    const operation = this.capture(url, key, signal, session).finally(() =>
      this.pending.delete(key),
    );
    this.pending.set(key, operation);
    return operation;
  }
  private async capture(
    url: string,
    key: string,
    signal: AbortSignal,
    session?: VideoReadSession,
  ): Promise<VideoTranscriptResult> {
    const note = xhsNoteIdentity(url)!,
      video = videoIdentity(url)!;
    const directory = join(this.evidenceRoot, key);
    const stateFile = join(directory, "reader-attempt.json");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    let metadata: XhsVideoMetadata | undefined;
    let speech: SpeechResult | undefined;
    let retainedSource: SourceContent | undefined;
    let references: { url: string; title: string }[] = [];
    try {
      const saved = JSON.parse(await readFile(stateFile, "utf8"));
      const savedDiagnostic = readingDiagnosticSchema.safeParse(
        saved.diagnostic,
      );
      const savedStage = readingStageSchema.safeParse(saved.issueStage);
      const diagnostic = savedDiagnostic.success
        ? savedDiagnostic.data
        : saved.issue
          ? xiaohongshuVideoDiagnostic(
              saved.issue,
              savedStage.success
                ? savedStage.data
                : saved.speechIssue
                  ? "transcription"
                  : "source",
            )
          : undefined;
      let cachedSource: SourceContent | undefined;
      try {
        cachedSource = sourceSchema.parse(
          JSON.parse(await readFile(join(directory, "source.json"), "utf8")),
        );
        if (
          xhsNoteIdentity(cachedSource.sourceUrl)?.id !== note.id ||
          (cachedSource.evidence && cachedSource.evidence.artifactKey !== key)
        )
          cachedSource = undefined;
      } catch {
        /* The attempt may have ended before source publication. */
      }
      try {
        const snapshot = JSON.parse(
          await readFile(join(directory, "source-metadata.json"), "utf8"),
        );
        metadata = normalizeXhsVideoMetadata(
          { ...snapshot, thumbnails: snapshot.images },
          note,
        ).metadata;
        if (cachedSource)
          metadata.images = cachedSource.images.map(({ url, alt }) => ({
            url,
            alt,
          }));
      } catch {
        /* Earlier attempts retain their source checkpoint. */
      }
      if (metadata)
        references = videoDescriptionReferences(metadata.description, video);
      const readiness =
        diagnostic?.category === "readiness"
          ? await this.dependencies.speech.check?.().catch(() => undefined)
          : undefined;
      const resumeSpeech =
        readiness?.runtime === "ready" &&
        readiness.model === "ready" &&
        (await this.dependencies.media.available());
      if (resumeSpeech) {
        retainedSource = cachedSource;
        if (cachedSource?.evidence) {
          try {
            const previous = JSON.parse(
              await readFile(join(directory, "transcription.json"), "utf8"),
            );
            const segments = cachedSource.evidence.segments;
            if (
              previous.provenance === "application_asr" &&
              previous.backend === "whisper.cpp" &&
              ["completed", "partial", "unavailable", "cancelled"].includes(
                previous.status,
              ) &&
              typeof previous.language === "string" &&
              typeof previous.runtimeVersion === "string" &&
              typeof previous.model === "string" &&
              typeof previous.modelSha256 === "string" &&
              /^[a-f0-9]{64}$/.test(previous.modelSha256) &&
              Array.isArray(previous.chunks) &&
              previous.chunks.every(
                (chunk: any) =>
                  chunk &&
                  (!chunk.detectedLanguage ||
                    typeof chunk.detectedLanguage === "string"),
              ) &&
              Array.isArray(previous.segments) &&
              previous.segments.length === segments.length &&
              previous.segments.every(
                (segment: any, index: number) =>
                  segment.start === segments[index].start &&
                  segment.end === segments[index].end &&
                  segment.text === segments[index].text,
              )
            )
              speech = previous;
          } catch {
            /* The validated source still retains recognized speech. */
          }
        }
      } else if (cachedSource)
        return {
          outcome: "content",
          source: cachedSource,
          references,
          ...(diagnostic ? { diagnostic } : {}),
        };
      else if (saved.state === "unavailable")
        return {
          outcome: "unavailable",
          reason: saved.reason,
          ...(diagnostic ? { diagnostic } : {}),
        };
      else return { outcome: "unavailable", reason: "xiaohongshu_interrupted" };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    let issue: string | undefined;
    let issueStage: ReadingStage = "source";
    const diagnostic = () =>
      issue ? xiaohongshuVideoDiagnostic(issue, issueStage) : undefined;
    let cookies: string = "absent";
    const publish = async () => {
      if (!metadata) return retainedSource;
      // A resource retry retains previously captured speech until new speech reaches it.
      if (retainedSource?.evidence?.segments.length && !speech)
        return retainedSource;
      const segments: {
        id: string;
        start: number;
        end: number;
        text: string;
        url: string;
      }[] = [];
      let characters = 0;
      for (const segment of speech?.segments ?? []) {
        if (
          characters + segment.text.length > 1_000_000 ||
          segments.length >= 20_000
        ) {
          issue = "speech_output_budget";
          issueStage = "transcription";
          break;
        }
        if (
          !Number.isFinite(segment.start) ||
          !Number.isFinite(segment.end) ||
          segment.start < 0 ||
          segment.end < segment.start ||
          !segment.text.trim() ||
          segment.text.length > 300_000
        ) {
          issue = "speech_invalid_output";
          issueStage = "transcription";
          break;
        }
        characters += segment.text.length;
        segments.push({
          id: `segment-${segments.length + 1}`,
          start: segment.start,
          end: segment.end,
          text: segment.text,
          url: note.requestUrl,
        });
      }
      const speechState = !speech
        ? issue
          ? "unavailable"
          : "pending"
        : segments.length
          ? speech.status === "completed" && !issue
            ? "complete"
            : "partial"
          : speech.status === "completed"
            ? "zero_segments"
            : speech.status;
      const markdown = [
        metadata.title ? `# ${metadata.title}` : "",
        metadata.uploader,
        metadata.description,
        ...metadata.images.map((image) => `![${image.alt}](<${image.url}>)`),
        ...segments.map(
          (segment) =>
            `[${time(segment.start)}](<${segment.url}>) ${segment.text}`,
        ),
      ]
        .filter(Boolean)
        .join("\n\n");
      if (!markdown) return undefined;
      const captured = [
        metadata.title ? "title" : "",
        metadata.description ? "written description" : "",
        metadata.images.length ? "cover" : "",
      ]
        .filter(Boolean)
        .join(", ");
      const detectedLanguages = [
        ...new Set(
          speech?.chunks
            .map((chunk) => chunk.detectedLanguage)
            .filter((language): language is string => !!language) ?? [],
        ),
      ];
      const language =
        speech?.language === "auto"
          ? detectedLanguages.length === 1
            ? detectedLanguages[0]
            : "und"
          : speech?.language || "und";
      const source = sourceSchema.parse({
        sourceUrl: note.requestUrl,
        platform: "xiaohongshu",
        ...(segments.length ? { sourceKey: video.sourceKey } : {}),
        title:
          metadata.title ||
          metadata.description.split("\n")[0].slice(0, 160) ||
          note.url,
        sourceIdentity: metadata.uploader || "Xiaohongshu note",
        fetchedAt: new Date().toISOString(),
        markdown,
        contentBlocks: Array.from(
          { length: Math.ceil(markdown.length / 300_000) },
          (_, index) => ({
            type: "text",
            text: markdown.slice(index * 300_000, (index + 1) * 300_000),
          }),
        ),
        images: metadata.images.map((image, index) => ({
          ...image,
          imageId: `xhs-cover-${index + 1}`,
        })),
        completeness: "partial",
        completenessNote: `Captured ${captured}. Speech: ${speechState}${issue ? ` (${issue})` : ""}. Visual coverage: unknown.`,
        ...(segments.length
          ? {
              evidence: {
                kind: "transcript",
                captureId: randomUUID(),
                videoId: video.id,
                video,
                language,
                trackKind: "automatic",
                provenance: {
                  source: "application_asr",
                  kind: "automatic",
                  engine: speech!.backend,
                  model: speech!.model,
                },
                duration: speech?.duration ?? metadata.duration,
                transcriptCoverage:
                  speechState === "complete" ? "complete" : "partial",
                visualCoverage: "unknown",
                artifactKey: key,
                segments,
              },
            }
          : {}),
      });
      await save(join(directory, "source.json"), source);
      await save(join(directory, "segments.json"), segments);
      await save(join(directory, "source-metadata.json"), metadata);
      references = videoDescriptionReferences(metadata.description, video);
      await save(join(directory, "references.json"), references);
      return source;
    };
    const state = async (value: object) =>
      save(stateFile, {
        ...value,
        video,
        at: new Date().toISOString(),
        cookies,
        visualCoverage: "unknown",
        speechStatus: speech?.status ?? "unavailable",
        speechCoverage: speech?.segments.length
          ? speech.status === "completed" && !issue
            ? "complete"
            : "partial"
          : speech?.status === "completed"
            ? "zero_segments"
            : "unavailable",
        speechIssue: speech?.issue,
        metadataCoverage: {
          title: !!metadata?.title,
          writtenDescription: !!metadata?.description,
          cover: !!metadata?.images.length,
        },
        issue,
        issueStage,
        diagnostic: diagnostic(),
      });
    await state({ state: "running" });
    try {
      const context =
        (await this.dependencies.context?.(url, signal, session)) ??
        (await session?.getXiaohongshuContext?.(url, signal)) ??
        {};
      if (context.fallback && context.fallback.id !== note.id)
        throw new Error("xiaohongshu_identity_changed");
      metadata = mergeXhsVideoMetadata(context.fallback, metadata);
      cookies = !context.cookies?.length
        ? "absent"
        : context.cookies.some((cookie) => cookie.name === "web_session")
          ? "account_session_present"
          : "guest";
      await publish();
      if (context.accessIssue) {
        issue = context.accessIssue;
        issueStage = "access";
      } else {
        const media = await this.dependencies.media.read({
          url: note.requestUrl,
          directory,
          signal,
          cookies: context.cookies,
          fallback: metadata,
        });
        metadata = mergeXhsVideoMetadata(media.metadata, metadata);
        cookies = media.cookies;
        issue = media.issue;
        await publish();
        if (media.media) issueStage = "readiness";
        const readiness = media.media
          ? await this.dependencies.speech.check?.()
          : undefined;
        if (
          readiness &&
          (readiness.runtime !== "ready" || readiness.model !== "ready")
        )
          issue = readiness.issue ?? "speech_runtime_missing";
        else if (media.media) {
          issueStage = "media";
          const acquired = await this.dependencies.acquire({
            ...media.media,
            directory: join(directory, "media"),
            signal,
          });
          issueStage = "transcription";
          const retainSpeech = (result: SpeechResult) => {
            const end = (value: SpeechResult | undefined) =>
              value?.segments.reduce(
                (maximum, segment) => Math.max(maximum, segment.end),
                0,
              ) ?? 0;
            if (
              !speech ||
              result.status === "completed" ||
              end(result) >= end(speech)
            )
              speech = result;
          };
          const result = await this.dependencies.speech.transcribe({
            mediaPath: acquired.path,
            signal,
            onProgress: async (result) => {
              retainSpeech(result);
              await save(join(directory, "transcription.json"), speech);
              await publish();
            },
          });
          retainSpeech(result);
          issue = result.issue?.code;
          await save(join(directory, "transcription.json"), speech);
        }
      }
    } catch (error) {
      issue = signal.aborted
        ? "cancelled"
        : error instanceof Error && /^[a-z_]+$/.test(error.message)
          ? error.message
          : "xiaohongshu_extraction_failed";
    }
    const source = await publish();
    await state({
      state: signal.aborted
        ? "cancelled"
        : source
          ? issue
            ? "partial"
            : "completed"
          : "unavailable",
      reason: issue ?? "xiaohongshu_media_unavailable",
    });
    if (signal.aborted) throw new Error("Cancelled");
    return source
      ? {
          outcome: "content",
          source,
          references,
          ...(diagnostic() ? { diagnostic: diagnostic() } : {}),
        }
      : {
          outcome: "unavailable",
          reason: issue ?? "xiaohongshu_media_unavailable",
          diagnostic:
            diagnostic() ??
            xiaohongshuVideoDiagnostic("xiaohongshu_media_unavailable"),
        };
  }
}
