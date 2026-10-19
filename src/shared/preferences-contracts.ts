import { z } from "zod";
import { languageSchema } from "./language";

export const preferencesSchema = z.object({
  language: languageSchema.default("zh-CN"),
  readingLanguage: z.union([languageSchema, z.literal("app")]).default("app"),
  taskBrowserVisible: z.boolean().default(false),
});
export type ApplicationPreferences = z.infer<typeof preferencesSchema>;
