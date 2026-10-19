import { z } from "zod";
import { languageSchema } from "./language";

export const contentRequestSchema = z
  .object({
    operation: z.enum([
      "translate_content",
      "format_content",
      "structure_content",
      "introduce_content",
    ]),
    text: z.string().min(1).max(1_000_000),
    targetLanguage: languageSchema.default("zh-CN"),
  })
  .strict();
export type ContentRequest = z.input<typeof contentRequestSchema>;
export const structuredContentSchema = z
  .object({
    title: z.string().max(500),
    markdown: z.string().min(1),
    citations: z.array(
      z.object({ title: z.string(), url: z.string().url() }).strict(),
    ),
  })
  .strict();
