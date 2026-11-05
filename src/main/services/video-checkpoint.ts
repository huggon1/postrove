import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { sourceSchema } from "../../shared/source-contracts";
import {
  videoIdentity,
  type VideoIdentity,
} from "../../shared/video-contracts";
import { readingDiagnostic } from "../../shared/reading-diagnostics";
import type { VideoTranscriptResult } from "./video-transcript";

/** Recover only this attempt's validated source; recovery performs no network work. */
export async function readVideoCheckpoint(
  directory: string,
  video: VideoIdentity,
  artifactKey: string,
): Promise<VideoTranscriptResult | undefined> {
  try {
    const source = sourceSchema.parse(
      JSON.parse(await readFile(join(directory, "source.json"), "utf8")),
    );
    if (
      videoIdentity(source.sourceUrl)?.sourceKey !== video.sourceKey ||
      source.sourceKey !== video.sourceKey ||
      (source.evidence && source.evidence.artifactKey !== artifactKey)
    )
      return undefined;
    source.completeness = "partial";
    if (source.evidence) source.evidence.transcriptCoverage = "partial";
    let references: { url: string; title: string }[] = [];
    try {
      const saved = JSON.parse(
        await readFile(join(directory, "references.json"), "utf8"),
      );
      if (Array.isArray(saved))
        references = saved
          .filter(
            (item) =>
              typeof item?.url === "string" && typeof item?.title === "string",
          )
          .slice(0, 30);
    } catch {
      /* The metadata checkpoint precedes reference publication. */
    }
    return {
      outcome: "content",
      source,
      references,
      diagnostic: readingDiagnostic("capture_incomplete", "transcription", {
        failureCode: "transcript_interrupted",
      }),
    };
  } catch {
    return undefined;
  }
}
