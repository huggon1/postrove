import { z } from "zod";
import type { Language } from "./language";

export const advisorIdSchema = z.enum([
  "x-grok-zh",
  "x-grok-en",
  "xiaohongshu-diandian-zh",
  "youtube-gemini-zh",
  "youtube-gemini-en",
  "reddit-ai-en",
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
  {
    id: "youtube-gemini-zh",
    connectionId: "gemini-web",
    platform: "youtube",
    name: "Gemini",
    language: "zh-CN",
    skill: "gemini-youtube-search",
  },
  {
    id: "youtube-gemini-en",
    connectionId: "gemini-web",
    platform: "youtube",
    name: "Gemini",
    language: "en",
    skill: "gemini-youtube-search",
  },
  {
    id: "reddit-ai-en",
    connectionId: "reddit-web",
    platform: "reddit",
    name: "Reddit AI",
    language: "en",
    skill: "reddit-search",
  },
] as const;
export const advisorRoutes = [
  { id: "x-grok", connectionId: "x-grok", platform: "x", skill: "x-search" },
  {
    id: "xiaohongshu-diandian",
    connectionId: "xiaohongshu-diandian",
    platform: "xiaohongshu",
    skill: "xiaohongshu-search",
  },
  {
    id: "youtube-gemini",
    connectionId: "gemini-web",
    platform: "youtube",
    skill: "gemini-youtube-search",
  },
  {
    id: "reddit-ai",
    connectionId: "reddit-web",
    platform: "reddit",
    skill: "reddit-search",
  },
] as const;
export type AdvisorRoute = (typeof advisorRoutes)[number];
export function advisorRouteFor(advisor: Advisor): AdvisorRoute {
  return advisorRoutes.find(
    (route) =>
      route.connectionId === advisor.connectionId &&
      route.platform === advisor.platform,
  )!;
}
export const platformConnectionIdSchema = z.enum([
  "x-grok",
  "xiaohongshu-diandian",
  "gemini-web",
  "reddit-web",
]);
export type PlatformConnectionId = z.infer<typeof platformConnectionIdSchema>;
export const platformConnections = [
  {
    id: "x-grok",
    site: "x",
    name: "Grok",
    source: "X",
    advisorId: "x-grok-zh",
  },
  {
    id: "xiaohongshu-diandian",
    site: "xiaohongshu",
    name: "点点",
    source: "小红书",
    advisorId: "xiaohongshu-diandian-zh",
  },
  {
    id: "gemini-web",
    site: "gemini",
    name: "Gemini",
    source: "YouTube",
    advisorId: "youtube-gemini-zh",
  },
  {
    id: "reddit-web",
    site: "reddit",
    name: "Reddit AI",
    source: "Reddit",
    advisorId: "reddit-ai-en",
  },
] as const;
export type Advisor = (typeof advisors)[number];
export const allowsGuest = (connectionId: string) =>
  connectionId === "reddit-web";
export function advisorById(id: AdvisorId): Advisor {
  return advisors.find((advisor) => advisor.id === id)!;
}
export function legacyAdvisor(
  platform: Advisor["platform"],
  language?: Language,
): AdvisorId {
  return platform === "x"
    ? language === "zh-CN"
      ? "x-grok-zh"
      : "x-grok-en"
    : platform === "youtube"
      ? language === "en"
        ? "youtube-gemini-en"
        : "youtube-gemini-zh"
      : platform === "reddit"
        ? "reddit-ai-en"
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
