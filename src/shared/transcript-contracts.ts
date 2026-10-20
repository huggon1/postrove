import { z } from "zod";

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
export const transcriptEvidenceSchema = z
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
export type TranscriptEvidence = z.infer<typeof transcriptEvidenceSchema>;
