import { z } from "zod";

export const piLogExecutionSchema = z.object({
  taskId: z.string().uuid(),
  stage: z.enum([
    "search",
    "collect",
    "translation",
    "summary",
    "translate_question",
    "translate_content",
    "format_content",
    "structure_content",
    "introduce_content",
  ]),
  platform: z
    .enum(["x", "xiaohongshu", "youtube", "reddit", "github", "web"])
    .optional(),
  materialTitle: z.string().max(500).optional(),
  materialId: z.string().max(100).optional(),
  sourceUrl: z.string().url().max(4096).optional(),
  operationId: z.string().max(300).optional(),
  chunkIndex: z.number().int().nonnegative().optional(),
  repair: z.boolean().optional(),
  attempt: z.number().int().positive(),
});

export type PiLogExecution = z.infer<typeof piLogExecutionSchema>;
