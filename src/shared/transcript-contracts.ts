import { z } from "zod";
import {
  videoIdentitySchema,
  videoIdentity,
  parseVideoArtifactKey,
} from "./video-contracts";

export const transcriptSegmentSchema = z
  .object({
    id: z.string().regex(/^segment-\d+$/),
    start: z.number().finite().nonnegative(),
    end: z.number().finite().nonnegative(),
    text: z.string().min(1).max(300_000),
    url: z.string().url(),
  })
  .strict()
  .refine((segment) => segment.end >= segment.start);
const legacyTranscriptEvidenceSchema = z
  .object({
    kind: z.literal("transcript"),
    captureId: z.string().uuid(),
    videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/),
    language: z.string().min(1).max(80),
    trackKind: z.enum(["creator", "automatic"]),
    duration: z.number().finite().nonnegative().optional(),
    transcriptCoverage: z.enum(["complete", "partial", "unknown"]),
    visualCoverage: z.literal("unknown"),
    artifactKey: z
      .string()
      .regex(/^[a-f0-9-]{36}\/youtube\/[A-Za-z0-9_-]{11}$/),
    segments: z.array(transcriptSegmentSchema).min(1).max(100_000),
  })
  .strict();
export const videoTranscriptEvidenceSchema = legacyTranscriptEvidenceSchema
  .extend({
    videoId: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/),
    video: videoIdentitySchema,
    provenance: z.discriminatedUnion("source", [
      z
        .object({
          source: z.literal("platform_captions"),
          kind: z.enum(["human", "automatic", "unknown"]),
        })
        .strict(),
      z
        .object({
          source: z.literal("application_asr"),
          kind: z.literal("automatic"),
          engine: z.string().min(1).max(100),
          model: z.string().min(1).max(200).optional(),
        })
        .strict(),
    ]),
    trackKind: z.enum(["creator", "automatic", "unknown"]),
    artifactKey: z.string().max(300),
  })
  .superRefine((evidence, ctx) => {
    const key = parseVideoArtifactKey(evidence.artifactKey);
    const resource = `${evidence.video.id}${evidence.video.part ? `-p${evidence.video.part}` : ""}`;
    const kind =
      evidence.provenance.kind === "human"
        ? "creator"
        : evidence.provenance.kind;
    if (
      !key ||
      key.platform !== evidence.video.platform ||
      !(key.resource === resource || key.resource.startsWith(`${resource}-`)) ||
      evidence.videoId !== evidence.video.id ||
      kind !== evidence.trackKind
    )
      ctx.addIssue({
        code: "custom",
        message: "Video evidence identity or provenance mismatch",
      });
    for (const segment of evidence.segments) {
      if (videoIdentity(segment.url)?.sourceKey !== evidence.video.sourceKey)
        ctx.addIssue({
          code: "custom",
          message: "Segment belongs to a different video part",
        });
    }
  });
export const transcriptEvidenceSchema = z.union([
  legacyTranscriptEvidenceSchema,
  videoTranscriptEvidenceSchema,
]);
export type TranscriptEvidence = z.infer<typeof transcriptEvidenceSchema>;
