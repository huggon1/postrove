import type { ReadingMaterial } from "../shared/reading-contracts";
import type { ModelReply } from "../shared/model-contracts";
import { bridge } from "./bridge";
import { t, tf } from "./i18n";

export interface UiForwardingReport {
  materials?: ReadingMaterial[];
  outputLanguage?: "zh-CN" | "en";
  materialId: string;
  taskId: string;
  title: string;
  platform: "github" | "x" | "xiaohongshu" | "web";
  sourceUrl: string;
  sourceIdentity: string;
  fetchedAt: string;
  completedAt?: string;
  summary: string;
  reportState: "complete" | "partial" | "processing";
  stageLabel: string;
  taskMessage?: string;
}
export interface UiTask {
  taskId: string;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  phase: string;
  error?: string;
}
export interface UiContentWorkspace {
  reports: UiForwardingReport[];
  tasks: UiTask[];
  partialReports?: UiForwardingReport[];
}
export interface UiSettings {
  telegram: {
    botUsername?: string;
    configured: boolean;
    connected: boolean;
    status: string;
    chats: Array<{ chatId: string; label: string; allowed: boolean }>;
    pendingChats: Array<{ chatId: string; label: string; lastSeenAt: string }>;
    pendingCount: number;
    lastPollAt?: string;
    error?: string;
  };
}

export interface ProductUiBridge {
  uiContent(): Promise<ModelReply<UiContentWorkspace>>;
  uiSettings(): Promise<ModelReply<UiSettings>>;
  uiSaveTelegramToken(token: string): Promise<ModelReply<void>>;
  uiClearTelegramBotToken(): Promise<ModelReply<void>>;
  uiVerifyTelegramBot(): Promise<ModelReply<void>>;
  uiAuthorizeTelegramChat(chatId: string): Promise<ModelReply<void>>;
  uiRevokeTelegramChat(chatId: string): Promise<ModelReply<void>>;
}
const failed = <T>(message: string): ModelReply<T> => ({ ok: false, message });

export function productUiBridge(): ProductUiBridge {
  const replyOperation = async <T>(
    operation: (() => Promise<ModelReply<T>>) | undefined,
    name: string,
  ) => (operation ? operation() : failed<T>(tf("{0} 服务尚未连接。", name)));
  return {
    uiContent: async () => {
      const forwardingReply = await bridge.forwardingTasks();
      if (!forwardingReply.ok) return forwardingReply;
      const summaries = forwardingReply.value;
      const reports: UiForwardingReport[] = [];
      const partialReports: UiForwardingReport[] = [];
      for (const summary of summaries) {
        const reply = await bridge.forwardingTask(summary.taskId);
        if (!reply.ok) continue;
        const detail = reply.value;
        const materials =
          detail.task.report?.materials ?? detail.partial.materials;
        const source = detail.task.report?.source ?? detail.partial.source;
        const host = new URL(summary.target.sourceUrl).hostname;
        const report: UiForwardingReport = {
          materials,
          outputLanguage: detail.task.outputLanguage,
          materialId: summary.materialId,
          taskId: summary.taskId,
          title:
            source?.title || materials?.[0]?.title || summary.target.sourceUrl,
          platform:
            source?.platform ??
            (host === "x.com"
              ? "x"
              : host.endsWith("xiaohongshu.com")
                ? "xiaohongshu"
                : host === "github.com"
                  ? "github"
                  : "web"),
          sourceUrl: summary.target.sourceUrl,
          sourceIdentity: source?.sourceIdentity ?? host,
          fetchedAt: summary.createdAt,
          completedAt: summary.finishedAt,
          summary: materials?.[0]?.summary ?? "",
          reportState:
            summary.state === "completed"
              ? "complete"
              : ["running", "queued"].includes(summary.state)
                ? "processing"
                : "partial",
          stageLabel: summary.phase,
          taskMessage: summary.message,
        };
        if (detail.task.report) reports.push(report);
        else partialReports.push(report);
      }
      const tasks: UiTask[] = summaries.map((summary) => ({
        taskId: summary.taskId,
        status: summary.state,
        phase: summary.phase,
        error: summary.message,
      }));
      return { ok: true, value: { tasks, reports, partialReports } };
    },
    uiSettings: async () => {
      if (!bridge.telegramStatus)
        return failed(t("Telegram 设置服务尚未连接。"));
      const telegramReply = await bridge.telegramStatus();
      if (!telegramReply.ok) return telegramReply;
      const telegram = telegramReply.value;
      const chatTitle = new Map(
        telegram.pendingChats.map((chat) => [chat.chatId, chat.title]),
      );
      return {
        ok: true,
        value: {
          telegram: {
            botUsername: telegram.botUsername,
            configured: telegram.configured,
            connected: telegram.status === "polling",
            status:
              telegram.status === "polling"
                ? t("正在接收消息")
                : telegram.status === "failed"
                  ? t("连接失败")
                  : telegram.configured
                    ? t("等待接收消息")
                    : t("未连接"),
            chats: telegram.authorizedChatIds.map((chatId) => ({
              chatId,
              label: chatTitle.get(chatId) ?? chatId,
              allowed: true,
            })),
            pendingChats: telegram.pendingChats
              .filter(
                (chat) => !telegram.authorizedChatIds.includes(chat.chatId),
              )
              .map((chat) => ({
                chatId: chat.chatId,
                label: chat.title || chat.username || chat.chatId,
                lastSeenAt: chat.lastSeenAt,
              })),
            pendingCount: telegram.queued + telegram.pendingAcknowledgements,
            lastPollAt: telegram.lastPollAt,
            error: telegram.lastError,
          },
        },
      };
    },
    uiSaveTelegramToken: (token) =>
      replyOperation(
        bridge.saveTelegramBotToken
          ? () => bridge.saveTelegramBotToken!(token)
          : undefined,
        t("保存 Telegram 凭据"),
      ),
    uiClearTelegramBotToken: () =>
      replyOperation(
        bridge.clearTelegramBotToken
          ? () => bridge.clearTelegramBotToken!()
          : undefined,
        t("清除 Telegram 凭据"),
      ),
    uiVerifyTelegramBot: async () => {
      const reply = await replyOperation(
        bridge.verifyTelegramBot
          ? () => bridge.verifyTelegramBot!()
          : undefined,
        t("验证 Telegram Bot"),
      );
      return reply.ok ? { ok: true, value: undefined } : reply;
    },
    uiAuthorizeTelegramChat: (chatId) =>
      replyOperation(
        bridge.authorizeTelegramChat
          ? () => bridge.authorizeTelegramChat!(chatId)
          : undefined,
        t("授权 Telegram 聊天"),
      ),
    uiRevokeTelegramChat: (chatId) =>
      replyOperation(
        bridge.revokeTelegramChat
          ? () => bridge.revokeTelegramChat!(chatId)
          : undefined,
        t("撤销 Telegram 聊天"),
      ),
  };
}
