import { z } from "zod";
import {
  advisorIdSchema,
  advisorById,
  advisorRouteFor,
} from "./advisor-contracts";
import { xPostUrlSchema, xhsNoteUrlSchema } from "./source-contracts";
import { redditPost, youtubeVideo } from "./source-profiles";
import { followScheduleSchema } from "./schedule-contracts";
export { followScheduleSchema } from "./schedule-contracts";

export const searchPlatformSchema = z.enum([
  "xiaohongshu",
  "x",
  "youtube",
  "reddit",
]);
export const searchPeriodSchema = z.enum(["day", "week", "month", "all"]);
export const startFocusSearchSchema = z
  .object({
    question: z.string().trim().min(1).max(10000),
    platforms: z
      .array(searchPlatformSchema)
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length),
    period: searchPeriodSchema.default("all"),
    advisorIds: z
      .array(advisorIdSchema)
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length)
      .optional(),
  })
  .strict();
export const searchCandidateSchema = z
  .object({
    candidateId: z.string().uuid(),
    postKey: z.string().min(1),
    url: z.string().url().max(4096),
    title: z.string().min(1).max(1000),
    description: z.string().max(5000),
    publishedAt: z.string().max(120).optional(),
  })
  .strict();
export const searchSectionSchema = z
  .object({
    sectionId: z.string().uuid(),
    platform: searchPlatformSchema,
    advisorId: advisorIdSchema.optional(),
    connectionId: z.string().optional(),
    routeId: z.string().optional(),
    sourceProfileRevision: z.number().int().positive().optional(),
    runId: z.string().uuid().optional(),
    skillRevision: z.string().optional(),
    promptRevision: z.string().optional(),
    readingReply: z.string().optional(),
    cancelled: z.boolean().optional(),
    processingIssue: z.string().max(1000).optional(),
    failureStage: z
      .enum(["preparation", "bridge", "platform", "sources", "processing"])
      .optional(),
    checkpoint: z
      .object({
        state: z.enum(["prepared", "submitted", "answered"]),
        conversationUrl: z.string().url().optional(),
        submittedAt: z.string().datetime().optional(),
      })
      .strict()
      .optional(),
    promptLanguage: z.enum(["zh-CN", "en"]),
    prompt: z.string(),
    platformPrompt: z.string().optional(),
    warnings: z.array(z.string().max(1000)).optional(),
    citationExtraction: z
      .object({
        state: z.enum(["pending", "running", "completed", "empty", "failed"]),
        error: z.string().max(1000).optional(),
      })
      .strict()
      .optional(),
    state: z.enum(["pending", "running", "completed", "failed"]),
    rawReply: z.string(),
    candidates: z.array(searchCandidateSchema),
    error: z.string().max(1000).optional(),
    finishedAt: z.string().datetime().optional(),
  })
  .strip()
  .superRefine((section, ctx) => {
    if (section.advisorId) {
      const advisor = advisorById(section.advisorId);
      if (
        (section.connectionId &&
          section.connectionId !== advisor.connectionId) ||
        (section.routeId && section.routeId !== advisorRouteFor(advisor).id)
      )
        ctx.addIssue({
          code: "custom",
          message: "Advisor route or connection mismatch",
        });
    }
    for (const candidate of section.candidates) {
      const parsed = canonicalPost(section.platform, candidate.url);
      if (!parsed || parsed.key !== candidate.postKey)
        ctx.addIssue({ code: "custom", message: "Invalid platform candidate" });
    }
  });
export const questionPreparationSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("preparing") }).strict(),
  z
    .object({
      state: z.literal("ready"),
      question: z.string().min(1).max(1_000_000),
    })
    .strict(),
  z
    .object({
      state: z.literal("failed"),
      error: z.string().min(1).max(1000),
    })
    .strict(),
]);
export type QuestionPreparation = z.infer<typeof questionPreparationSchema>;
export const focusSearchReportSchema = z
  .object({
    reportId: z.string().uuid(),
    taskId: z.string().uuid(),
    createdAt: z.string().datetime(),
    question: z.string().min(1),
    questionPreparations: z
      .object({
        "zh-CN": questionPreparationSchema.optional(),
        en: questionPreparationSchema.optional(),
      })
      .strict()
      .optional(),
    outputLanguage: z.enum(["zh-CN", "en"]).optional(),
    taskOutcome: z.enum(["completed", "failed", "cancelled"]).optional(),
    origin: z.enum(["manual", "follow"]).optional(),
    followId: z.string().uuid().optional(),
    followName: z.string().optional(),
    followRevision: z.number().int().positive().optional(),
    scheduledFor: z.string().datetime().optional(),
    status: z
      .enum(["queued", "running", "completed", "partial", "failed", "stopped"])
      .optional(),
    finishedAt: z.string().datetime().optional(),
    period: searchPeriodSchema,
    platforms: z.array(searchPlatformSchema).min(1),
    sections: z.array(searchSectionSchema),
    submissions: z.array(
      z
        .object({
          postKey: z.string(),
          taskId: z.string().uuid(),
          resultId: z.string().uuid(),
          submitted: z.boolean(),
        })
        .strict(),
    ),
  })
  .strip()
  .superRefine((report, ctx) => {
    const pairs = new Set<string>(),
      sectionIds = new Set<string>(),
      candidates = new Set<string>();
    for (const section of report.sections) {
      const pair = section.advisorId ?? section.platform;
      if (
        !report.platforms.includes(section.platform) ||
        pairs.has(pair) ||
        sectionIds.has(section.sectionId)
      )
        ctx.addIssue({
          code: "custom",
          message: "Each section must reference one selected platform",
        });
      if (
        section.advisorId
          ? advisorById(section.advisorId).platform !== section.platform ||
            advisorById(section.advisorId).language !== section.promptLanguage
          : section.promptLanguage !==
            (["x", "reddit"].includes(section.platform) ? "en" : "zh-CN")
      )
        ctx.addIssue({
          code: "custom",
          message: "Unexpected platform prompt language",
        });
      if (
        section.state === "completed" &&
        (!section.rawReply.trim() || !section.finishedAt)
      )
        ctx.addIssue({
          code: "custom",
          message:
            "Completed section requires an original reply and completion time",
        });
      pairs.add(pair);
      sectionIds.add(section.sectionId);
      if (section.advisorId) {
        const advisor = advisorById(section.advisorId);
        if (
          (section.connectionId &&
            section.connectionId !== advisor.connectionId) ||
          (section.routeId && section.routeId !== advisorRouteFor(advisor).id)
        )
          ctx.addIssue({
            code: "custom",
            message: "Advisor route or connection mismatch",
          });
      }
      for (const candidate of section.candidates) {
        if (candidates.has(candidate.candidateId))
          ctx.addIssue({
            code: "custom",
            message: "Candidate identity repeated",
          });
        candidates.add(candidate.candidateId);
      }
    }
    if (
      new Set(report.platforms).size !== report.platforms.length ||
      new Set(report.sections.map((section) => section.platform)).size !==
        report.platforms.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Report requires all selected platform sections",
      });
    const postKeys = new Set(
        report.sections.flatMap((section) =>
          section.candidates.map((c) => c.postKey),
        ),
      ),
      submitted = new Set<string>();
    for (const submission of report.submissions) {
      if (
        !postKeys.has(submission.postKey) ||
        submitted.has(submission.postKey)
      )
        ctx.addIssue({
          code: "custom",
          message: "Submission must reference one report post",
        });
      submitted.add(submission.postKey);
    }
  });
export const saveFollowSchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    question: z.string().trim().min(1).max(10000),
    platforms: z
      .array(searchPlatformSchema)
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length),
    period: searchPeriodSchema.default("all"),
    advisorIds: z
      .array(advisorIdSchema)
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length)
      .optional(),
    schedule: followScheduleSchema,
  })
  .strict();
export const updateFollowSchema = saveFollowSchema.extend({
  followId: z.string().uuid(),
});
export const followSchema = saveFollowSchema
  .extend({
    followId: z.string().uuid(),
    name: z.string().min(1),
    paused: z.boolean(),
    revision: z.number().int().positive(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    nextRunAt: z.string().datetime().nullable(),
    lastEvaluatedAt: z.string().datetime().optional(),
    lastSkippedAt: z.string().datetime().optional(),
    lastOccurrenceAt: z.string().datetime().optional(),
  })
  .strict();
export type SaveFollow = z.infer<typeof saveFollowSchema>;
export type UpdateFollow = z.infer<typeof updateFollowSchema>;
export type Follow = z.infer<typeof followSchema>;
export type FollowSchedule = z.infer<typeof followScheduleSchema>;

export const searchStateSchema = z
  .object({
    version: z.literal(1),
    reports: z.array(focusSearchReportSchema),
    follows: z.array(followSchema).default([]),
  })
  .strict()
  .superRefine((state, ctx) => {
    if (
      new Set(state.follows.map((f) => f.followId)).size !==
      state.follows.length
    )
      ctx.addIssue({ code: "custom", message: "Follow identity repeated" });
    if (
      new Set(state.reports.map((r) => r.reportId)).size !==
        state.reports.length ||
      new Set(state.reports.map((r) => r.taskId)).size !== state.reports.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Search report identity repeated",
      });
  });
export const searchSelectionSchema = z
  .object({
    reportId: z.string().uuid(),
    candidateIds: z.array(z.string().uuid()).min(1),
  })
  .strict();
export function canonicalPost(platform: SearchPlatform, raw: string) {
  if (platform === "youtube") {
    const video = youtubeVideo(raw);
    return video && { key: video.key, url: video.locator };
  }
  if (platform === "reddit") return redditPost(raw);
  try {
    const url = new URL(raw);
    if (platform === "x" && xPostUrlSchema.safeParse(raw).success) {
      const id = url.pathname.match(/\/status\/(\d+)/)?.[1];
      if (id)
        return {
          key: `x:${id}`,
          url: `https://x.com${url.pathname.replace(/\/$/, "")}`,
        };
    }
    if (platform === "xiaohongshu" && xhsNoteUrlSchema.safeParse(raw).success) {
      const id = url.pathname.split("/").filter(Boolean).at(-1);
      if (id) return { key: `xiaohongshu:${id}`, url: raw };
    }
  } catch {
    /* invalid URL */
  }
  return undefined;
}
export type SearchPlatform = z.infer<typeof searchPlatformSchema>;
export type SearchPeriod = z.infer<typeof searchPeriodSchema>;
export type SearchSection = z.infer<typeof searchSectionSchema>;
export type FocusSearchReport = z.infer<typeof focusSearchReportSchema>;
export type SearchState = z.infer<typeof searchStateSchema>;
export type StartFocusSearch = z.input<typeof startFocusSearchSchema>;
export type SearchSelection = z.infer<typeof searchSelectionSchema>;
export type SearchAddition = {
  candidateId: string;
  taskId?: string;
  error?: string;
};
