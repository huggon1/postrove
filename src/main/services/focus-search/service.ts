import { sourceProfiles } from "../../../shared/source-profiles";
import type { ContentRequest } from "../../../shared/content-contracts";
import type { ExecutionGate } from "../execution-gate";
import { randomUUID } from "node:crypto";
import {
  startFocusSearchSchema,
  saveFollowSchema,
  updateFollowSchema,
  type FocusSearchReport,
  type SearchSection,
  type SearchAddition,
  type Follow,
} from "../../../shared/focus-search-contracts";
import { FocusSearchStore } from "../../storage/focus-search-store";
import type { TaskService } from "../tasks/task-service";
import type { ForwardingPipelineService } from "../forwarding/service";
import {
  advisorById,
  advisorRouteFor,
  legacyAdvisor,
  type AdvisorId,
} from "../../../shared/advisor-contracts";
import { searchInstruction } from "../../../platforms/browser/prompts";
import type { SearchProgress } from "../browser-agent";
import { localizedText, type Language } from "../../../shared/language";
import { failureMessages } from "../../../shared/task-failure";
import { nextScheduleRun, normalizeSchedule } from "../../../shared/schedules";

/** Shared calendar and elapsed-interval calculation for future occurrences. */
export const nextFollowRun = nextScheduleRun;

type SearchExecution = {
  content?: (
    input: ContentRequest,
    signal: AbortSignal,
    runId: string,
  ) => Promise<string>;
  execute: (
    section: SearchSection,
    signal: AbortSignal,
    taskId: string,
    onProgress?: (progress: SearchProgress) => Promise<void>,
  ) => Promise<{
    rawReply: string;
    candidates: SearchSection["candidates"];
    platformPrompt?: string;
    warnings?: string[];
    citationExtraction?: SearchSection["citationExtraction"];
  }>;
  release: () => Promise<void>;
};

function citationFailureReason(code: string | undefined, language?: Language) {
  if (code?.startsWith("source_unverified:"))
    return localizedText(
      language,
      "小红书原帖地址尚未核验；已保留平台原回答。",
      "The original Xiaohongshu note address has not been verified; the platform reply is saved.",
    );
  if (code?.startsWith("source_unavailable:"))
    return localizedText(
      language,
      code.includes("300031")
        ? "小红书来源暂不可读（300031：当前笔记暂时无法浏览）；已保留平台原回答。"
        : "小红书来源暂不可读；已保留平台原回答。",
      code.includes("300031")
        ? "The Xiaohongshu source is currently unavailable (300031: 当前笔记暂时无法浏览); the platform reply is saved."
        : "The Xiaohongshu source is currently unavailable; the platform reply is saved.",
    );
  const english: Record<string, string> = {
    model_auth: "Model authentication failed.",
    model_rate_limit:
      "Model requests were rate limited or the account quota is exhausted.",
    model_network: "The model service connection failed.",
    model_unavailable: "The model service is temporarily unavailable.",
    model_context: "The input exceeds the model context limit.",
    model_output_limit: "Model output reached its limit.",
    model_empty: "The model returned an empty result.",
    model_invalid_output: "The model returned an invalid result.",
    model_turn_limit: "The model reached its turn limit.",
    model_rejected: "The model service rejected the request.",
    model_connection_failed: "Model connection failed after automatic retries.",
    login_required: "Platform sign-in is required.",
    verification_required: "Platform verification requires user action.",
    access_limited: "Platform access is restricted.",
    action_required:
      "Platform account or terms confirmation requires your action in Settings.",
    browser_interaction_failed: "Source-page interaction did not complete.",
    "Browser worker stopped":
      "The browser worker stopped during citation extraction.",
    "Browser task timed out": "Citation extraction timed out.",
  };
  const chinese: Record<string, string> = {
    ...failureMessages,
    model_connection_failed: "模型连接失败，自动重试后仍无法连接。",
    login_required: "平台需要登录。",
    verification_required: "平台需要人工验证。",
    access_limited: "平台访问受限。",
    action_required: "平台需要你在设置中确认账号关联或协议。",
    browser_interaction_failed: "引用来源页面操作未完成。",
    "Browser worker stopped": "引用提取期间浏览器工作进程退出。",
    "Browser task timed out": "引用帖子提取超时。",
  };
  if (code && (chinese[code] || english[code]))
    return localizedText(
      language,
      chinese[code] || "模型调用失败。",
      english[code] || "The model request failed.",
    );
  return (
    code?.trim().slice(0, 1000) ||
    localizedText(
      language,
      "引用来源页面操作未完成。",
      "Source-page interaction did not complete.",
    )
  );
}

function finishCitation(section: SearchSection, reason: string) {
  if (
    section.citationExtraction &&
    ["pending", "running"].includes(section.citationExtraction.state)
  )
    section.citationExtraction = {
      state: "failed",
      error: reason.slice(0, 1000),
    };
}

function searchStatus(sections: SearchSection[]) {
  const completed = sections.filter((section) => section.state === "completed");
  if (!completed.length) return "failed" as const;
  return completed.length < sections.length ||
    sections.some(
      (section) =>
        section.cancelled ||
        section.processingIssue ||
        (section.citationExtraction &&
          ["pending", "running", "failed", "empty"].includes(
            section.citationExtraction.state,
          )),
    )
    ? ("partial" as const)
    : ("completed" as const);
}

export class FocusSearchService {
  private active = new Map<string, AbortController>();
  private sectionControllers = new Map<string, AbortController>();
  private queue: Promise<unknown> = Promise.resolve();
  private mutations: Promise<unknown> = Promise.resolve();
  private schedules: Promise<unknown> = Promise.resolve();
  private timer?: ReturnType<typeof setInterval>;
  private closed = false;
  constructor(
    private store: FocusSearchStore,
    private tasks: TaskService,
    private forwarding: ForwardingPipelineService,
    private prepareExecution: () => Promise<SearchExecution>,
    private changed: () => void,
    private options: {
      isParsedDeleted?: (taskId: string) => boolean;
      now?: () => Date;
      schedulerIntervalMs?: number;
      executionGate?: ExecutionGate;
      language?: () => "zh-CN" | "en";
      advisorIds?: () => AdvisorId[];
      prepareQuestion?: (
        question: string,
        language: Language,
        signal: AbortSignal,
      ) => Promise<string>;
      prepareReply?: (
        reply: string,
        language: Language,
        signal: AbortSignal,
      ) => Promise<string>;
      revisions?: (
        platform: SearchSection["platform"],
        routeId?: string,
      ) => Promise<{ skillRevision: string; promptRevision: string }>;
      publish?: (report: FocusSearchReport) => Promise<unknown>;
    } = {},
  ) {}
  private clock() {
    return this.options.now?.() ?? new Date();
  }
  private now() {
    return this.clock().toISOString();
  }
  private nextRun(follow: Follow, timestamp = this.clock()) {
    const after = Math.max(
      timestamp.getTime(),
      follow.lastOccurrenceAt ? new Date(follow.lastOccurrenceAt).getTime() : 0,
      follow.lastEvaluatedAt ? new Date(follow.lastEvaluatedAt).getTime() : 0,
    );
    return nextFollowRun(follow.schedule, new Date(after));
  }
  reports() {
    return this.store.snapshot().reports;
  }
  follows() {
    return this.store.snapshot().follows;
  }
  readTask(taskId: string) {
    const report = this.reports().find((r) => r.taskId === taskId);
    if (!report) throw new Error("Search report not found");
    return report;
  }
  private serialSchedule<T>(operation: () => Promise<T>): Promise<T> {
    const job = this.schedules.then(operation);
    this.schedules = job.catch(() => {});
    return job;
  }
  async recover() {
    await this.store.update((state) => {
      for (const report of state.reports) {
        if (
          report.status === "queued" &&
          report.sections.every(
            (section) => section.state === "pending" && !section.rawReply,
          )
        )
          continue;
        if (
          report.status === "running" &&
          report.sections.some(
            (section) => section.checkpoint?.state === "submitted",
          )
        ) {
          report.status = "queued";
          for (const section of report.sections)
            if (section.state === "running") section.state = "pending";
          continue;
        }
        const interrupted =
          report.status === "queued" ||
          report.status === "running" ||
          report.sections.some(
            (s) => s.state === "running" || s.state === "pending",
          );
        const reason = localizedText(
          report.outputLanguage,
          "应用退出，运行已中断",
          "The app exited and interrupted this run",
        );
        for (const section of report.sections) {
          if (section.state === "running" || section.state === "pending") {
            section.state = section.rawReply.trim() ? "completed" : "failed";
            section.error = section.rawReply.trim() ? undefined : reason;
            section.finishedAt = this.now();
          }
          finishCitation(section, reason);
        }
        if (interrupted) {
          report.status = searchStatus(report.sections);
          report.taskOutcome =
            report.status === "completed" ? "completed" : "failed";
          report.finishedAt = this.now();
        } else if (report.status !== "stopped") {
          report.status = searchStatus(report.sections);
          if (report.status === "completed") report.taskOutcome = "completed";
          else if (report.status === "failed") report.taskOutcome = "failed";
        }
      }
      for (const follow of state.follows) {
        follow.schedule = normalizeSchedule(
          follow.schedule,
          new Date(follow.createdAt),
        );
        if (follow.nextRunAt && new Date(follow.nextRunAt) <= this.clock()) {
          follow.lastOccurrenceAt = follow.nextRunAt;
          follow.lastSkippedAt = follow.nextRunAt;
        }
        follow.nextRunAt = this.nextRun(follow);
        follow.lastEvaluatedAt = new Date(
          Math.max(
            this.clock().getTime(),
            Date.parse(follow.lastEvaluatedAt ?? "1970-01-01"),
          ),
        ).toISOString();
      }
    });
    for (const report of this.reports()) {
      if (report.status === "queued") {
        await this.tasks.create({
          taskId: report.taskId,
          kind: "focus_search",
          target: { kind: "none" },
          phase: "等待搜索",
        });
        if (!this.active.has(report.taskId)) this.enqueue(report.taskId);
        continue;
      }
      const task = this.tasks.read(report.taskId);
      if (
        task &&
        report.finishedAt &&
        report.status &&
        ["completed", "partial", "failed", "stopped"].includes(report.status)
      ) {
        await this.tasks.reconcileSearchOutcome(
          report.taskId,
          report.taskOutcome ??
            (report.status === "completed"
              ? "completed"
              : report.status === "stopped"
                ? "cancelled"
                : "failed"),
          report.reportId,
          report.finishedAt,
        );
      } else if (task && ["queued", "running"].includes(task.state))
        await this.tasks.receive(report.taskId, {
          type: "failed",
          taskId: report.taskId,
          code: "search_interrupted",
          message: localizedText(
            report.outputLanguage,
            "应用退出，运行已中断",
            "The app exited and interrupted this run",
          ),
        });
    }
    for (const report of this.reports())
      if (report.finishedAt) await this.options.publish?.(report);
    if (this.timer) clearInterval(this.timer);
    const interval = this.options.schedulerIntervalMs ?? 1000;
    if (interval > 0) {
      this.timer = setInterval(() => {
        void this.tickSchedules().catch(() => {});
      }, interval);
      this.timer.unref?.();
    }
    this.changed();
  }
  async saveFollow(raw: unknown): Promise<Follow> {
    const input = saveFollowSchema.parse(raw);
    this.validateAdvisors(
      input.advisorIds ??
        input.platforms.map((platform) => legacyAdvisor(platform)),
    );
    input.schedule = normalizeSchedule(input.schedule, this.clock());
    const nextRunAt = nextFollowRun(input.schedule, this.clock());
    if (!nextRunAt) throw this.scheduleExpired();
    const follow: Follow = {
      ...input,
      name: input.name ?? input.question.slice(0, 80),
      followId: randomUUID(),
      paused: false,
      revision: 1,
      createdAt: this.now(),
      updatedAt: this.now(),
      nextRunAt,
    };
    await this.serialSchedule(() =>
      this.store.update((s) => s.follows.push(follow)),
    );
    this.changed();
    return structuredClone(follow);
  }
  async updateFollow(raw: unknown): Promise<Follow> {
    const input = updateFollowSchema.parse(raw);
    this.validateAdvisors(
      input.advisorIds ??
        input.platforms.map((platform) => legacyAdvisor(platform)),
    );
    input.schedule = normalizeSchedule(input.schedule, this.clock());
    let result!: Follow;
    await this.serialSchedule(() =>
      this.store.update((state) => {
        const follow = state.follows.find((f) => f.followId === input.followId);
        if (!follow) throw new Error("Follow not found");
        const nextRunAt = this.nextRun({ ...follow, schedule: input.schedule });
        if (!nextRunAt) throw this.scheduleExpired();
        Object.assign(follow, input, {
          name: input.name ?? input.question.slice(0, 80),
          revision: follow.revision + 1,
          updatedAt: this.now(),
          nextRunAt,
        });
        result = structuredClone(follow);
      }),
    );
    this.changed();
    return result;
  }
  private validateAdvisors(ids?: AdvisorId[]) {
    if (
      ids &&
      this.options.advisorIds &&
      ids.some((id) => !this.options.advisorIds!().includes(id))
    )
      throw new Error("Advisor is unavailable");
  }
  private scheduleExpired() {
    return new Error(
      localizedText(
        this.options.language?.(),
        "此规则已没有未来发送时间，请调整日期或重复规则",
        "No future sends. Adjust the dates or repeat rule.",
      ),
    );
  }
  async reconcileAdvisors() {
    if (!this.options.advisorIds) return;
    const enabled = this.options.advisorIds();
    await this.serialSchedule(() =>
      this.store.update((state) => {
        for (const follow of state.follows) {
          const ids = (
            follow.advisorIds ??
            follow.platforms.map((platform) => legacyAdvisor(platform))
          ).filter((id) => enabled.includes(id));
          if (ids.length) {
            follow.advisorIds = ids;
            follow.platforms = [
              ...new Set(ids.map((id) => advisorById(id).platform)),
            ];
          } else follow.paused = true;
        }
      }),
    );
    this.changed();
  }
  async setFollowPaused(followId: string, paused: boolean) {
    if (typeof paused !== "boolean") throw new Error("Invalid pause state");
    await this.serialSchedule(() =>
      this.store.update((state) => {
        const follow = state.follows.find((f) => f.followId === followId);
        if (!follow) throw new Error("Follow not found");
        if (!paused)
          this.validateAdvisors(
            follow.advisorIds ??
              follow.platforms.map((platform) => legacyAdvisor(platform)),
          );
        follow.paused = paused;
        follow.updatedAt = this.now();
        follow.nextRunAt = this.nextRun(follow);
        if (!paused && !follow.nextRunAt) throw this.scheduleExpired();
      }),
    );
    this.changed();
  }
  async deleteFollow(followId: string) {
    await this.serialSchedule(() =>
      this.store.update((state) => {
        state.follows = state.follows.filter((f) => f.followId !== followId);
      }),
    );
    this.changed();
  }
  tickSchedules(): Promise<void> {
    return this.serialSchedule(async () => {
      if (this.closed) return;
      const timestamp = this.clock();
      for (const follow of this.follows()) {
        if (
          !follow.nextRunAt ||
          new Date(follow.nextRunAt).getTime() > timestamp.getTime()
        )
          continue;
        const scheduledFor = follow.nextRunAt;
        if (follow.paused) {
          await this.store.update((state) => {
            const current = state.follows.find(
              (f) => f.followId === follow.followId,
            )!;
            current.nextRunAt = this.nextRun(current, timestamp);
            current.lastEvaluatedAt = timestamp.toISOString();
            current.lastSkippedAt = scheduledFor;
          });
          this.changed();
          continue;
        }
        const advisorIds = (
          follow.advisorIds ??
          follow.platforms.map((platform) => legacyAdvisor(platform))
        ).filter(
          (id) =>
            !this.options.advisorIds || this.options.advisorIds().includes(id),
        );
        if (!advisorIds.length) {
          await this.store.update((state) => {
            state.follows.find((f) => f.followId === follow.followId)!.paused =
              true;
          });
          this.changed();
          continue;
        }
        const late =
          timestamp.getTime() - new Date(follow.nextRunAt).getTime() >= 60_000;
        const outstanding = this.reports().some(
          (r) =>
            r.followId === follow.followId &&
            (r.status === "queued" || r.status === "running"),
        );
        // Advance before admitting work; replay after crash expires this occurrence.
        await this.store.update((state) => {
          const current = state.follows.find(
            (f) => f.followId === follow.followId,
          )!;
          current.lastOccurrenceAt = scheduledFor;
          current.nextRunAt = this.nextRun(current, timestamp);
          current.lastEvaluatedAt = timestamp.toISOString();
          if (late || outstanding) current.lastSkippedAt = scheduledFor;
        });
        if (!late && !outstanding)
          await this.startRun(
            {
              question: follow.question,
              platforms: [
                ...new Set(advisorIds.map((id) => advisorById(id).platform)),
              ],
              period: "all",
              advisorIds,
            },
            follow,
          );
        this.changed();
      }
    });
  }
  async start(raw: unknown) {
    return this.startRun(raw);
  }
  private async startRun(raw: unknown, follow?: Follow) {
    if (this.closed) throw new Error("Search service is closed");
    const input = startFocusSearchSchema.parse(raw);
    const ids =
      input.advisorIds ??
      input.platforms.map((platform) => legacyAdvisor(platform));
    if (
      this.options.advisorIds &&
      ids.some((id) => !this.options.advisorIds!().includes(id))
    )
      throw new Error("Advisor is unavailable");
    const selectedPlatforms = [
      ...new Set(ids.map((id) => advisorById(id).platform)),
    ];
    if (
      selectedPlatforms.length !== input.platforms.length ||
      selectedPlatforms.some((platform) => !input.platforms.includes(platform))
    )
      throw new Error("Advisor platform mismatch");
    const sections: SearchSection[] = [];
    for (const id of ids) {
      const advisor = advisorById(id);
      sections.push({
        sectionId: randomUUID(),
        runId: randomUUID(),
        advisorId: id,
        connectionId: advisor.connectionId,
        routeId: advisorRouteFor(advisor).id,
        sourceProfileRevision: sourceProfiles[advisor.platform].revision,
        platform: advisor.platform,
        promptLanguage: advisor.language,
        prompt: input.question,
        ...(await this.options.revisions?.(
          advisor.platform,
          advisorRouteFor(advisor).id,
        )),
        checkpoint: { state: "prepared" },
        state: "pending",
        rawReply: "",
        candidates: [],
        citationExtraction: { state: "pending" },
      });
    }
    const taskId = randomUUID();
    const report: FocusSearchReport = {
      reportId: randomUUID(),
      taskId,
      createdAt: this.now(),
      outputLanguage: this.options.language?.() ?? "zh-CN",
      period: input.period,
      platforms: input.platforms,
      submissions: [],
      status: "queued",
      origin: follow ? "follow" : "manual",
      question: input.question,
      ...(follow
        ? {
            followId: follow.followId,
            followName: follow.name,
            followRevision: follow.revision,
            scheduledFor: follow.nextRunAt!,
          }
        : {}),
      sections,
    };
    await this.store.update((s) => s.reports.push(report));
    try {
      await this.tasks.create({
        taskId,
        kind: "focus_search",
        target: { kind: "none" },
        phase: localizedText(
          report.outputLanguage,
          "等待搜索",
          "Waiting to search",
        ),
      });
    } catch (error) {
      await this.store.update((s) => {
        const r = s.reports.find((r) => r.taskId === taskId)!;
        r.status = "failed";
        r.taskOutcome = "failed";
        r.finishedAt = this.now();
        for (const section of r.sections) {
          section.state = "failed";
          section.error = localizedText(
            report.outputLanguage,
            "任务创建失败",
            "Task creation failed",
          );
          section.finishedAt = this.now();
        }
      });
      throw error;
    }
    this.enqueue(taskId);
    this.changed();
    return taskId;
  }
  private enqueue(taskId: string) {
    const controller = new AbortController();
    this.active.set(taskId, controller);
    const run = this.queue
      .catch(() => {})
      .then(() => this.run(taskId, controller));
    this.queue = run.catch(() => {});
  }
  private async run(taskId: string, controller: AbortController) {
    let execution: SearchExecution | undefined;
    let release: (() => void) | undefined;
    const language = this.readTask(taskId).outputLanguage;
    try {
      if (controller.signal.aborted) return;
      if (this.options.executionGate) {
        release = await this.options.executionGate.enter(
          { id: taskId, kind: "search", label: this.readTask(taskId).question },
          controller.signal,
        );
        if (!release || controller.signal.aborted) return;
      }
      await this.store.update((s) => {
        s.reports.find((r) => r.taskId === taskId)!.status = "running";
      });
      await this.tasks.receive(taskId, {
        type: "phase",
        taskId,
        phase: localizedText(language, "准备搜索", "Preparing search"),
      });
      this.changed();
      execution = await this.prepareExecution();
      for (const queued of this.readTask(taskId).sections) {
        if (controller.signal.aborted) break;
        const initial = this.readTask(taskId).sections.find(
          (section) => section.sectionId === queued.sectionId,
        )!;
        if (initial.state === "completed" || initial.cancelled) continue;
        const sectionController = new AbortController();
        const cancelSection = () => sectionController.abort();
        controller.signal.addEventListener("abort", cancelSection, {
          once: true,
        });
        this.sectionControllers.set(initial.sectionId, sectionController);
        await this.store.update((s) => {
          const section = s.reports
            .find((r) => r.taskId === taskId)!
            .sections.find((v) => v.sectionId === initial.sectionId)!;
          section.state = "running";
          delete section.error;
        });
        this.changed();
        await this.tasks.receive(taskId, {
          type: "activity",
          taskId,
          action: "search",
          summary: localizedText(
            language,
            `正在搜索 ${initial.platform}`,
            `Searching ${initial.platform}`,
          ),
        });
        try {
          if (!initial.checkpoint || initial.checkpoint.state === "prepared") {
            try {
              const question = execution.content
                ? await execution.content(
                    {
                      operation: "translate_question",
                      text: this.readTask(taskId).question,
                      targetLanguage: initial.promptLanguage,
                    },
                    sectionController.signal,
                    initial.runId ?? taskId,
                  )
                : this.options.prepareQuestion
                  ? await this.options.prepareQuestion(
                      this.readTask(taskId).question,
                      initial.promptLanguage,
                      sectionController.signal,
                    )
                  : this.readTask(taskId).question;
              initial.prompt = searchInstruction(
                initial.platform,
                question,
                "all",
                initial.promptLanguage,
              );
              await this.store.update((state) => {
                state.reports
                  .find((r) => r.taskId === taskId)!
                  .sections.find(
                    (s) => s.sectionId === initial.sectionId,
                  )!.prompt = initial.prompt;
              });
            } catch (error) {
              await this.store.update((state) => {
                state.reports
                  .find((r) => r.taskId === taskId)!
                  .sections.find(
                    (s) => s.sectionId === initial.sectionId,
                  )!.failureStage = "preparation";
              });
              throw error;
            }
          }
          const result = await execution.execute(
            initial,
            sectionController.signal,
            initial.runId ?? taskId,
            async (progress) => {
              if (sectionController.signal.aborted) return;
              await this.store.update((s) => {
                const section = s.reports
                  .find((r) => r.taskId === taskId)!
                  .sections.find((v) => v.sectionId === initial.sectionId)!;
                Object.assign(section, progress);
              });
              if (progress.rawReply)
                await this.tasks.receive(taskId, {
                  type: "phase",
                  taskId,
                  phase: localizedText(
                    language,
                    `提取 ${initial.platform} 引用帖子`,
                    `Extracting ${initial.platform} citations`,
                  ),
                });
              this.changed();
            },
          );
          if (result.citationExtraction?.state === "failed")
            result.citationExtraction.error = citationFailureReason(
              result.citationExtraction.error,
              language,
            );
          if (sectionController.signal.aborted) continue;
          await this.store.update((s) => {
            const section = s.reports
              .find((r) => r.taskId === taskId)!
              .sections.find((v) => v.sectionId === initial.sectionId)!;
            Object.assign(section, result, {
              state: "running",
              checkpoint: {
                state: "answered",
                conversationUrl: this.readTask(taskId).sections.find(
                  (s) => s.sectionId === initial.sectionId,
                )?.checkpoint?.conversationUrl,
              },
            });
            if (result.citationExtraction?.state === "failed")
              section.failureStage = "sources";
          });
          if (
            result.rawReply &&
            (execution.content || this.options.prepareReply)
          ) {
            try {
              const targetLanguage = language ?? "zh-CN";
              const readingReply = execution.content
                ? await execution.content(
                    {
                      operation: "translate_content",
                      text: await execution.content(
                        {
                          operation: "format_content",
                          text: result.rawReply,
                          targetLanguage,
                        },
                        sectionController.signal,
                        initial.runId ?? taskId,
                      ),
                      targetLanguage,
                    },
                    sectionController.signal,
                    initial.runId ?? taskId,
                  )
                : await this.options.prepareReply!(
                    result.rawReply,
                    targetLanguage,
                    sectionController.signal,
                  );
              if (!sectionController.signal.aborted)
                await this.store.update((state) => {
                  state.reports
                    .find((r) => r.taskId === taskId)!
                    .sections.find(
                      (s) => s.sectionId === initial.sectionId,
                    )!.readingReply = readingReply;
                });
            } catch {
              if (!sectionController.signal.aborted)
                await this.store.update((state) => {
                  const section = state.reports
                    .find((r) => r.taskId === taskId)!
                    .sections.find((s) => s.sectionId === initial.sectionId)!;
                  section.processingIssue = localizedText(
                    language,
                    "阅读版本生成失败",
                    "Reading version failed",
                  );
                  section.failureStage = "processing";
                });
            }
          }
          if (!sectionController.signal.aborted)
            await this.store.update((state) => {
              const section = state.reports
                .find((r) => r.taskId === taskId)!
                .sections.find((s) => s.sectionId === initial.sectionId)!;
              section.state = "completed";
              section.finishedAt = this.now();
            });
        } catch (error) {
          if (sectionController.signal.aborted) continue;
          const code = error instanceof Error ? error.message : "";
          const accessMessages: Record<string, string> = {
            login_required: localizedText(
              language,
              "平台需要登录",
              "Platform sign-in is required",
            ),
            verification_required: localizedText(
              language,
              "平台需要人工验证",
              "Platform verification requires user action",
            ),
            action_required: localizedText(
              language,
              "平台需要你确认账号关联或协议，请在设置中打开平台登录窗口处理",
              "Platform account or terms confirmation requires your action; open its sign-in window in Settings",
            ),
            access_limited: localizedText(
              language,
              "平台访问受限",
              "Platform access is restricted",
            ),
            browser_interaction_failed: localizedText(
              language,
              "平台页面操作未完成",
              "Platform browser interaction did not complete",
            ),
            model_connection_failed: localizedText(
              language,
              "模型连接失败，自动重试后仍无法连接",
              "Model connection failed after automatic retries",
            ),
          };
          await this.store.update((s) => {
            const section = s.reports
              .find((r) => r.taskId === taskId)!
              .sections.find((v) => v.sectionId === initial.sectionId)!;
            if (section.rawReply.trim()) {
              section.state = "completed";
              delete section.error;
              section.failureStage = "sources";
              finishCitation(section, citationFailureReason(code, language));
              section.finishedAt = this.now();
              return;
            }
            section.state = "failed";
            section.failureStage ??= [
              "login_required",
              "verification_required",
              "action_required",
              "access_limited",
            ].includes(code)
              ? "platform"
              : "bridge";
            section.error =
              accessMessages[code] ??
              localizedText(
                language,
                "平台获取失败，请检查平台状态和模型连接",
                "Platform retrieval failed; check the platform and model connection",
              );
            section.finishedAt = this.now();
          });
        } finally {
          controller.signal.removeEventListener("abort", cancelSection);
          this.sectionControllers.delete(initial.sectionId);
        }
        const report = this.readTask(taskId);
        await this.tasks.receive(taskId, {
          type: "progress",
          taskId,
          completed: report.sections.filter(
            (s) => s.state === "completed" || s.state === "failed",
          ).length,
          total: report.sections.length,
        });
        this.changed();
      }
      if (controller.signal.aborted) return;
      const report = this.readTask(taskId);
      const success = report.sections.filter(
        (s) => s.state === "completed",
      ).length;
      await this.store.update((s) => {
        const r = s.reports.find((r) => r.taskId === taskId)!;
        r.status = searchStatus(r.sections);
        r.taskOutcome = success ? "completed" : "failed";
        r.finishedAt = this.now();
      });
      if (!success)
        await this.tasks.receive(taskId, {
          type: "failed",
          taskId,
          code: "search_failed",
          message: localizedText(
            language,
            "所有平台均未成功获取结果",
            "Retrieval failed on all platforms",
          ),
        });
      else
        await this.tasks.receive(taskId, {
          type: "completed",
          taskId,
          result: { kind: "focus_search_report", id: report.reportId },
        });
    } catch {
      if (!controller.signal.aborted) {
        await this.store.update((state) => {
          const report = state.reports.find((r) => r.taskId === taskId)!;
          const reason = localizedText(
            language,
            execution ? "搜索执行中断" : "后台模型连接不可用，请检查设置",
            execution
              ? "Search was interrupted"
              : "Background model unavailable; check Settings",
          );
          for (const section of report.sections) {
            if (section.state !== "completed") {
              section.state = section.rawReply.trim() ? "completed" : "failed";
              section.error = section.rawReply.trim() ? undefined : reason;
              section.failureStage ??= "bridge";
              section.finishedAt = this.now();
            }
            finishCitation(section, reason);
          }
          report.status = searchStatus(report.sections);
          report.taskOutcome = "failed";
          report.finishedAt = this.now();
        });
        await this.tasks.receive(taskId, {
          type: "failed",
          taskId,
          code: "search_failed",
          message: localizedText(
            language,
            "搜索执行中断，已保存取得的结果",
            "Search was interrupted; retrieved results are saved",
          ),
        });
      }
    } finally {
      try {
        await execution?.release();
      } finally {
        this.active.delete(taskId);
        release?.();
        await this.options.publish?.(this.readTask(taskId));
        this.changed();
      }
    }
  }
  async cancelSection(taskId: string, sectionId: string) {
    const report = this.readTask(taskId);
    const section = report.sections.find(
      (item) => item.sectionId === sectionId,
    );
    if (!section) throw new Error("Advisor run not found");
    if (
      ["completed", "failed"].includes(section.state) &&
      !this.sectionControllers.has(sectionId)
    )
      return;
    this.sectionControllers.get(sectionId)?.abort();
    await this.store.update((state) => {
      const section = state.reports
        .find((r) => r.taskId === taskId)!
        .sections.find((s) => s.sectionId === sectionId)!;
      section.cancelled = true;
      section.state = section.rawReply ? "completed" : "failed";
      section.error = localizedText(report.outputLanguage, "已停止", "Stopped");
      section.finishedAt = this.now();
      finishCitation(section, section.error);
    });
    this.changed();
  }
  async retry(_taskId: string): Promise<string> {
    throw new Error(
      localizedText(
        this.options.language?.(),
        "请发起新话题",
        "Start a new topic",
      ),
    );
  }
  async cancel(taskId: string) {
    const report = this.readTask(taskId);
    if (report.status && !["queued", "running"].includes(report.status)) return;
    this.active.get(taskId)?.abort();
    await this.store.update((state) => {
      const report = state.reports.find((r) => r.taskId === taskId)!;
      for (const section of report.sections)
        if (section.state === "running" || section.state === "pending") {
          section.cancelled = true;
          section.state = section.rawReply.trim() ? "completed" : "failed";
          section.error = localizedText(
            report.outputLanguage,
            "用户已停止运行",
            "Stopped by the user",
          );
          finishCitation(section, section.error);
          section.finishedAt = this.now();
        }
      report.status = "stopped";
      report.taskOutcome = "cancelled";
      report.finishedAt = this.now();
    });
    await this.tasks.cancel(taskId);
    await this.options.publish?.(this.readTask(taskId));
    this.changed();
  }
  add(reportId: string, candidateIds: string[]): Promise<SearchAddition[]> {
    const operation = this.mutations
      .catch(() => {})
      .then(async () => {
        const reply: SearchAddition[] = [];
        for (const candidateId of new Set(candidateIds)) {
          try {
            const report = this.reports().find((r) => r.reportId === reportId);
            if (!report) throw new Error("Report unavailable");
            const candidate = report.sections
              .flatMap((s) => s.candidates)
              .find((c) => c.candidateId === candidateId);
            if (!candidate) throw new Error("Candidate unavailable");
            let submission = report.submissions.find(
              (s) => s.postKey === candidate.postKey,
            );
            if (
              submission &&
              this.options.isParsedDeleted?.(submission.taskId)
            ) {
              await this.store.update((s) => {
                const saved = s.reports.find((r) => r.reportId === reportId)!;
                saved.submissions = saved.submissions.filter(
                  (v) => v.postKey !== candidate.postKey,
                );
              });
              submission = undefined;
            }
            if (!submission) {
              submission = {
                postKey: candidate.postKey,
                taskId: randomUUID(),
                resultId: randomUUID(),
                submitted: false,
              };
              const reserved = submission;
              await this.store.update((s) =>
                s.reports
                  .find((r) => r.reportId === reportId)!
                  .submissions.push(reserved),
              );
            }
            const taskId = await this.forwarding.submit(
              candidate.url,
              submission,
            );
            await this.store.update((s) => {
              s.reports
                .find((r) => r.reportId === reportId)!
                .submissions.find(
                  (v) => v.postKey === candidate.postKey,
                )!.submitted = true;
            });
            reply.push({ candidateId, taskId });
          } catch {
            reply.push({
              candidateId,
              error: "Could not add this post; retry",
            });
          }
        }
        this.changed();
        return reply;
      });
    this.mutations = operation.catch(() => {});
    return operation;
  }
  async shutdown() {
    this.closed = true;
    if (this.timer) clearInterval(this.timer);
    await this.schedules.catch(() => {});
    for (const [taskId, controller] of this.active) {
      if (this.readTask(taskId).status === "queued") controller.abort();
      else await this.cancel(taskId);
    }
    await this.queue.catch(() => {});
    await this.mutations.catch(() => {});
  }
}
