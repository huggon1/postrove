import { z } from "zod";
import type { Language } from "./language";

export const advisorIdSchema = z.enum([
  "x-grok-zh",
  "x-grok-en",
  "xiaohongshu-diandian-zh",
]);
export type AdvisorId = z.infer<typeof advisorIdSchema>;
export const advisors = [
  {
    id: "x-grok-zh",
    connectionId: "x-grok",
    platform: "x",
    name: "Grok",
    language: "zh-CN",
    skill: "x-search",
  },
  {
    id: "x-grok-en",
    connectionId: "x-grok",
    platform: "x",
    name: "Grok",
    language: "en",
    skill: "x-search",
  },
  {
    id: "xiaohongshu-diandian-zh",
    connectionId: "xiaohongshu-diandian",
    platform: "xiaohongshu",
    name: "点点",
    language: "zh-CN",
    skill: "xiaohongshu-search",
  },
] as const;
export type Advisor = (typeof advisors)[number];
export function advisorById(id: AdvisorId): Advisor {
  return advisors.find((advisor) => advisor.id === id)!;
}
export function legacyAdvisor(
  platform: "x" | "xiaohongshu",
  language?: Language,
): AdvisorId {
  return platform === "x"
    ? language === "zh-CN"
      ? "x-grok-zh"
      : "x-grok-en"
    : "xiaohongshu-diandian-zh";
}
export const advisorSettingsSchema = z
  .object({
    version: z.literal(1),
    enabled: z
      .array(advisorIdSchema)
      .refine((ids) => new Set(ids).size === ids.length),
  })
  .strict();
export type AdvisorSettings = z.infer<typeof advisorSettingsSchema>;
export const saveAdvisorSettingsSchema = advisorSettingsSchema.pick({
  enabled: true,
});
