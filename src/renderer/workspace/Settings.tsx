import { useState } from "react";
import {
  CaretRight,
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
import { Avatar, advisorName } from "./ui";
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
            <CaretRight />
          </button>
        ))}
      </nav>
      <div className="settings-content">
        {section === "connections" && (
          <>
            <div className="settings-section-head">
              <h2>{t("收件连接")}</h2>
            </div>
            <div className="inbox-connections">
              <TelegramSettings
                settings={workspace.settings}
                busy={workspace.busy}
                onSaveTelegramToken={(token) =>
                  workspace.booleanAction(() =>
                    workspace.ui.uiSaveTelegramToken(token),
                  )
                }
                onClearTelegramBotToken={() =>
                  workspace.booleanAction(workspace.ui.uiClearTelegramBotToken)
                }
                onVerifyTelegramBot={() =>
                  workspace.booleanAction(workspace.ui.uiVerifyTelegramBot)
                }
                onAuthorizeTelegramChat={(id) =>
                  workspace.booleanAction(() =>
                    workspace.ui.uiAuthorizeTelegramChat(id),
                  )
                }
                onRevokeTelegramChat={(id) =>
                  workspace.booleanAction(() =>
                    workspace.ui.uiRevokeTelegramChat(id),
                  )
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
            <div className="settings-section-head">
              <h2>{t("AI 成员")}</h2>
              <button className="primary" onClick={() => onMember()}>
                {t("管理成员")}
              </button>
            </div>
            <div className="settings-members">
              {workspace.members?.enabled.map((id) => (
                <button
                  key={id}
                  onClick={() =>
                    onMember(
                      id.startsWith("x-") ? "x-grok" : "xiaohongshu-diandian",
                    )
                  }
                >
                  <Avatar id={id} />
                  <span>
                    <strong>{advisorName(id)}</strong>
                  </span>
                  <CaretRight />
                </button>
              ))}
            </div>
          </>
        )}
        {section === "preferences" && (
          <>
            <div className="settings-section-head">
              <h2>{t("偏好设置")}</h2>
            </div>
            <div className="preference-group">
              <label className="preference-row">
                <span>{t("界面语言")}</span>
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
                <span>{t("阅读语言")}</span>
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
                <span>{t("任务浏览器")}</span>
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
        {section === "about" && updateSection}
      </div>
    </div>
  );
}
