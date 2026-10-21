import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle,
  CircleNotch,
  ShieldCheck,
} from "@phosphor-icons/react";
import { bridge } from "../bridge";
import { t } from "../i18n";
import { ConfirmDialog, Feedback, SecretField } from "../workspace/forms";
import {
  BotConnectionCard,
  BotDialog,
  BotIdentity,
  ChatAuthorizations,
} from "./BotConnection";
import type { UiSettings } from "../product-ui";

export interface TelegramSettingsProps {
  settings?: UiSettings;
  busy: boolean;
  onSaveTelegramToken: (token: string) => Promise<boolean>;
  onClearTelegramBotToken: () => Promise<boolean>;
  onVerifyTelegramBot: () => Promise<boolean>;
  onAuthorizeTelegramChat: (id: string) => Promise<boolean>;
  onRevokeTelegramChat: (id: string) => Promise<boolean>;
  onOpenContent: () => void;
}

export function TelegramSettings(props: TelegramSettingsProps) {
  const { settings } = props;
  const [pending, setPending] = useState(false);
  const busy = pending || props.busy;
  const telegram = settings?.telegram;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<number | "manage">(0);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<{
    title: string;
    target?: string;
    clear?: boolean;
    action: () => Promise<boolean>;
  }>();
  const status = telegram?.connected
    ? t("正在接收")
    : telegram?.error
      ? t("连接异常")
      : telegram?.configured
        ? t("已配置")
        : t("未连接");
  const identity = telegram?.botUsername
    ? `@${telegram.botUsername}`
    : "Telegram";
  const start = () => {
    setError("");
    setStep(telegram?.configured ? "manage" : 0);
    setOpen(true);
  };
  const finish = () => {
    setOpen(false);
    setToken("");
    setError("");
  };
  async function action(work: () => Promise<boolean>) {
    setError("");
    setPending(true);
    try {
      const ok = await work();
      if (!ok) setError(t("操作未完成，请检查 Token、网络和聊天状态后重试。"));
      return ok;
    } catch {
      setError(t("操作未完成，请检查 Token、网络和聊天状态后重试。"));
      return false;
    } finally {
      setPending(false);
    }
  }
  const chats = (
    <ChatAuthorizations
      authorized={(telegram?.chats ?? []).map((chat) => ({
        id: chat.chatId,
        label: chat.label,
      }))}
      pending={(telegram?.pendingChats ?? []).map((chat) => ({
        id: chat.chatId,
        label: chat.label,
      }))}
      busy={busy}
      onAuthorize={(id) => void action(() => props.onAuthorizeTelegramChat(id))}
      onRevoke={(chat) =>
        setConfirmation({
          title: t("撤销聊天授权"),
          target: chat.label,
          action: () => props.onRevokeTelegramChat(chat.id),
        })
      }
    />
  );
  return (
    <section className="telegram-settings" aria-label="Telegram">
      <BotConnectionCard
        channel="telegram"
        status={status}
        identity={telegram?.botUsername ? identity : undefined}
        connected={!!telegram?.connected}
        configured={!!telegram?.configured}
        open={open}
        onOpen={start}
      />
      {open && (
        <BotDialog
          channel="telegram"
          title={t("Telegram 接入")}
          onClose={finish}
          steps={
            step === "manage"
              ? undefined
              : [t("连接 Bot"), t("授权聊天"), t("完成配置")]
          }
          step={step === "manage" ? 0 : step}
          footer={
            step === "manage" ? undefined : (
              <>
                {step > 0 && (
                  <button
                    className="text-button"
                    onClick={() => {
                      setStep(step - 1);
                      setError("");
                    }}
                  >
                    <ArrowLeft />
                    {t("上一步")}
                  </button>
                )}
                <button className="text-button" onClick={finish}>
                  {t(step === 2 ? "完成" : "稍后继续")}
                </button>
              </>
            )
          }
        >
          {step === "manage" && (
            <>
              <div className="bot-management-head">
                <BotIdentity name={identity} />
                <button
                  className="secondary small-primary"
                  disabled={busy}
                  onClick={() => void action(props.onVerifyTelegramBot)}
                >
                  {busy ? <CircleNotch className="spin" /> : <ShieldCheck />}
                  {t("验证连接")}
                </button>
              </div>
              {telegram?.error && !error && (
                <Feedback error>{t(telegram.error)}</Feedback>
              )}
              {chats}
              <div className="config-actions">
                <button className="primary" onClick={() => setStep(1)}>
                  {t("添加聊天")}
                  <ArrowRight />
                </button>
                <button className="secondary" onClick={() => setStep(0)}>
                  {t("查看接入步骤")}
                </button>
              </div>
              <details className="config-details maintenance">
                <summary>{t("维护")}</summary>
                <div className="maintenance-actions">
                  <button className="text-button" onClick={() => setStep(0)}>
                    {t("更换 Token")}
                  </button>
                  <button
                    className="text-button danger-text"
                    disabled={busy}
                    onClick={() =>
                      setConfirmation({
                        title: t("清除 Token"),
                        target: identity,
                        clear: true,
                        action: props.onClearTelegramBotToken,
                      })
                    }
                  >
                    {t("清除 Token")}
                  </button>
                </div>
              </details>
            </>
          )}
          {step === 0 && (
            <form
              className="setup-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (!/^\d{5,20}:[A-Za-z0-9_-]{20,200}$/.test(token.trim())) {
                  setError(t("Telegram Bot Token 格式无效"));
                  return;
                }
                void action(async () => {
                  if (!(await props.onSaveTelegramToken(token.trim())))
                    return false;
                  setToken("");
                  setStep(1);
                  return true;
                });
              }}
            >
              <h3>{t("连接 Bot")}</h3>
              <div className="instruction-note">
                <p>
                  {t(
                    "在 Telegram 中打开 BotFather，发送 /newbot，按提示创建 Bot 并复制 Token。",
                  )}
                </p>
                <button
                  type="button"
                  className="text-button"
                  onClick={() =>
                    void bridge.openRepositoryLink("https://t.me/BotFather")
                  }
                >
                  {t("打开 BotFather")}
                  <ArrowUpRight />
                </button>
              </div>
              <SecretField
                label="Bot Token"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder={
                  telegram?.configured
                    ? t("输入新的 Token")
                    : t("粘贴 BotFather 提供的 Token")
                }
                disabled={busy}
                required
              />
              <button
                className="primary full-width"
                type="submit"
                disabled={busy || !token.trim()}
              >
                {busy ? <CircleNotch className="spin" /> : <ShieldCheck />}
                {t(busy ? "正在验证…" : "保存并验证")}
              </button>
            </form>
          )}
          {step === 1 && (
            <>
              <BotIdentity name={identity} />
              <h3>{t("授权聊天")}</h3>
              <div className="instruction-note">
                <p>
                  {t(
                    "向你的 Bot 发送 /start。选择出现的聊天并授权，再发送新的链接。",
                  )}
                </p>
                {telegram?.botUsername && (
                  <button
                    className="text-button"
                    onClick={() =>
                      void bridge.openRepositoryLink(
                        `https://t.me/${telegram.botUsername}`,
                      )
                    }
                  >
                    {identity}
                    <ArrowUpRight />
                  </button>
                )}
              </div>
              {chats}
              <button
                className="primary full-width"
                disabled={busy || !telegram?.chats.length}
                onClick={() => setStep(2)}
              >
                {t("继续")}
                <ArrowRight />
              </button>
            </>
          )}
          {step === 2 && (
            <div className="setup-complete">
              <span className="success-orbit">
                <CheckCircle weight="fill" />
              </span>
              <h3>{t("接入已配置")}</h3>
              <BotIdentity name={identity} />
              <button
                className="primary"
                onClick={() => {
                  finish();
                  props.onOpenContent();
                }}
              >
                {t("查看阅读内容")}
                <ArrowRight />
              </button>
            </div>
          )}
          {error && !confirmation && <Feedback error>{error}</Feedback>}
        </BotDialog>
      )}
      {confirmation && (
        <ConfirmDialog
          title={confirmation.title}
          cancelLabel={t("保留配置")}
          busy={busy}
          error={error}
          onClose={() => {
            setConfirmation(undefined);
            setError("");
          }}
          onConfirm={async () => {
            if (await action(confirmation.action)) {
              setConfirmation(undefined);
              if (confirmation.clear) setStep(0);
            }
          }}
        >
          {confirmation.target}
        </ConfirmDialog>
      )}
    </section>
  );
}
