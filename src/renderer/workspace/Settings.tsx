import { useState } from "react";
import {
  ArrowRight,
  Plus,
  Desktop,
  GearSix,
  Globe,
  LinkSimple,
  Sparkle,
  Users,
} from "@phosphor-icons/react";
import { ModelSettings } from "../components/ModelSettings";
import { TelegramSettings } from "../components/TelegramSettings";
import { FeishuSettings } from "../components/FeishuSettings";
import { bridge } from "../bridge";
import { selectLanguage, t } from "../i18n";
import { Avatar } from "./ui";
import { SectionHeading } from "./forms";
import { usePlatformStatus } from "./use-platform-status";
import {
  advisors,
  advisorById,
  allowsGuest,
  platformConnections,
} from "../../shared/advisor-contracts";
import type { Workspace } from "./use-workspace";
import type { ReactNode } from "react";

const sections = [
  { id: "connections", label: "收件连接", icon: LinkSimple },
  { id: "members", label: "AI 成员", icon: Users },
  { id: "models", label: "后台模型", icon: Sparkle },
  { id: "preferences", label: "偏好设置", icon: GearSix },
  { id: "about", label: "关于", icon: Globe },
] as const;
export type SettingsSection = (typeof sections)[number]["id"];
export function Settings({
  workspace,
  section,
  onSection,
  onMember,
  onReading,
  updateSection,
}: {
  workspace: Workspace;
  section: SettingsSection;
  onSection(section: SettingsSection): void;
  onMember(connectionId?: string): void;
  onReading(): void;
  updateSection: ReactNode;
}) {
  const [error, setError] = useState("");
  const [platformStatus] = usePlatformStatus();
  async function telegramAction(operation: () => Promise<{ ok: boolean }>) {
    const reply = await operation();
    if (reply.ok) await workspace.refresh();
    return reply.ok;
  }
  async function preference(
    operation: () => Promise<typeof workspace.preferences>,
  ) {
    setError("");
    try {
      const value = await operation();
      workspace.setPreferences(value);
      selectLanguage(value.language);
    } catch {
      setError(t("设置保存失败"));
    }
  }
  return (
    <div className="settings-layout">
      <nav className="settings-nav" aria-label={t("设置分类")}>
        {sections.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            aria-current={section === id ? "page" : undefined}
            onClick={() => onSection(id)}
          >
            <Icon weight={section === id ? "fill" : "regular"} />
            {t(label)}
          </button>
        ))}
      </nav>
      <div className="settings-content">
        {section === "connections" && (
          <>
            <SectionHeading title={t("收件连接")} />
            <div className="inbox-connections">
              <TelegramSettings
                settings={workspace.settings}
                busy={workspace.busy}
                onSaveTelegramToken={(token) =>
                  telegramAction(() => workspace.ui.uiSaveTelegramToken(token))
                }
                onClearTelegramBotToken={() =>
                  telegramAction(workspace.ui.uiClearTelegramBotToken)
                }
                onVerifyTelegramBot={() =>
                  telegramAction(workspace.ui.uiVerifyTelegramBot)
                }
                onAuthorizeTelegramChat={(id) =>
                  telegramAction(() => workspace.ui.uiAuthorizeTelegramChat(id))
                }
                onRevokeTelegramChat={(id) =>
                  telegramAction(() => workspace.ui.uiRevokeTelegramChat(id))
                }
                onOpenContent={onReading}
              />
              <FeishuSettings onOpenContent={onReading} />
            </div>
          </>
        )}
        {section === "models" && <ModelSettings />}
        {section === "members" && (
          <>
            <SectionHeading title={t("AI 成员")} />
            <div className="settings-members">
              {platformConnections
                .map((connection) => ({
                  ...advisorById(connection.advisorId),
                  source: connection.source,
                }))
                .filter(
                  (connection) =>
                    platformStatus[connection.connectionId]?.signedIn ||
                    workspace.members?.enabled.some(
                      (id) =>
                        advisors.find((advisor) => advisor.id === id)
                          ?.connectionId === connection.connectionId,
                    ),
                )
                .map((connection) => (
                  <button
                    key={connection.connectionId}
                    onClick={() => onMember(connection.connectionId)}
                  >
                    <Avatar id={connection.id} languageBadge={false} />
                    <span>
                      <strong>{t(connection.name)}</strong>
                      <small>{t(connection.source)}</small>
                      <span className="settings-expert-tags">
                        {advisors
                          .filter(
                            (advisor) =>
                              advisor.connectionId ===
                                connection.connectionId &&
                              workspace.members?.enabled.includes(advisor.id),
                          )
                          .map((advisor) => (
                            <i key={advisor.id}>
                              {t(
                                advisor.language === "en"
                                  ? "英文专家"
                                  : "中文专家",
                              )}
                            </i>
                          ))}
                      </span>
                    </span>
                    <span
                      className={`connection-pill ${platformStatus[connection.connectionId]?.signedIn ? "connected" : ""}`}
                    >
                      <i />
                      {t(
                        platformStatus[connection.connectionId]?.signedIn
                          ? "已连接"
                          : allowsGuest(connection.connectionId)
                            ? "可使用"
                            : "待连接",
                      )}
                    </span>
                    <ArrowRight />
                  </button>
                ))}
              <button className="add-member-card" onClick={() => onMember()}>
                <span className="add-connection-symbol">
                  <Plus />
                </span>
                <strong>{t("连接平台 AI")}</strong>
                <ArrowRight />
              </button>
            </div>
          </>
        )}
        {section === "preferences" && (
          <>
            <SectionHeading title={t("偏好设置")} />
            <div className="preference-group">
              <label className="preference-row">
                <span>
                  <Globe />
                  {t("界面语言")}
                </span>
                <select
                  aria-label={t("界面语言")}
                  value={workspace.preferences.language}
                  onChange={(event) =>
                    void preference(() =>
                      bridge.saveLanguage(event.target.value as "zh-CN" | "en"),
                    )
                  }
                >
                  <option value="zh-CN">简体中文</option>
                  <option value="en">English</option>
                </select>
              </label>
              <label className="preference-row">
                <span>
                  <Globe />
                  {t("阅读语言")}
                </span>
                <select
                  aria-label={t("阅读语言")}
                  value={workspace.preferences.readingLanguage}
                  onChange={(event) =>
                    void preference(() =>
                      bridge.saveReadingLanguage(
                        event.target.value as "zh-CN" | "en" | "app",
                      ),
                    )
                  }
                >
                  <option value="app">{t("跟随界面")}</option>
                  <option value="zh-CN">简体中文</option>
                  <option value="en">English</option>
                </select>
              </label>
              <label className="preference-row">
                <span>
                  <Desktop />
                  {t("任务浏览器")}
                </span>
                <select
                  aria-label={t("任务浏览器")}
                  value={
                    workspace.preferences.taskBrowserVisible
                      ? "visible"
                      : "headless"
                  }
                  onChange={(event) =>
                    void preference(() =>
                      bridge.saveTaskBrowserVisible(
                        event.target.value === "visible",
                      ),
                    )
                  }
                >
                  <option value="headless">{t("后台运行")}</option>
                  <option value="visible">{t("显示窗口")}</option>
                </select>
              </label>
            </div>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
          </>
        )}
        {section === "about" && (
          <>
            <SectionHeading title={t("关于")} />
            {updateSection}
          </>
        )}
      </div>
    </div>
  );
}
