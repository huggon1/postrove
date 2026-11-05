import type { SourceContent } from "../../shared/source-contracts";
import type { ReadingDiagnostic } from "../../shared/reading-diagnostics";
import type { XhsVideoContext } from "./xiaohongshu-video";
import {
  videoIdentity,
  type VideoPlatform,
} from "../../shared/video-contracts";

export type VideoTranscriptResult = (
  | {
      outcome: "content";
      source: SourceContent;
      references: { url: string; title: string }[];
    }
  | { outcome: "unavailable"; reason: string }
) & { diagnostic?: ReadingDiagnostic };
/** Main supplies session-bound JSON access; implementations retain only source evidence. */
export interface VideoReadSession {
  getJson(url: string, signal: AbortSignal): Promise<unknown>;
  getXiaohongshuContext?(
    url: string,
    signal: AbortSignal,
  ): Promise<XhsVideoContext>;
}
export interface VideoTranscriptReader {
  available(): Promise<boolean>;
  read(
    url: string,
    attemptId: string,
    signal: AbortSignal,
    session?: VideoReadSession,
  ): Promise<VideoTranscriptResult>;
}
export class VideoTranscriptReaders implements VideoTranscriptReader {
  constructor(
    private readers: Partial<Record<VideoPlatform, VideoTranscriptReader>>,
  ) {}
  async available() {
    return (await this.platforms()).length > 0;
  }
  async platforms() {
    const ready: VideoPlatform[] = [];
    for (const [platform, reader] of Object.entries(this.readers))
      if (await reader.available()) ready.push(platform as VideoPlatform);
    return ready;
  }
  async read(
    url: string,
    attemptId: string,
    signal: AbortSignal,
    session?: VideoReadSession,
  ): Promise<VideoTranscriptResult> {
    if (signal.aborted) throw new Error("Cancelled");
    const video = videoIdentity(url);
    if (!video) throw new Error("Invalid transcript identity");
    const reader = this.readers[video.platform];
    return reader
      ? reader.read(url, attemptId, signal, session)
      : { outcome: "unavailable", reason: "transcript_runtime_unavailable" };
  }
}
