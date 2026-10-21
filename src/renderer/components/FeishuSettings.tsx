import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle,
  CircleNotch,
  PaperPlaneTilt,
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
import type { BotStatus } from "../../shared/bot-contracts";

export function FeishuSettings({
  onOpenContent,
}: {
  onOpenContent: () => void;
}) {
  const channel = "feishu" as const;
  const [status, setStatus] = useState<BotStatus>();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<number | "manage">(0);
  const [manual, setManual] = useState(false);
  const [appId, setAppId] = useState(""),
    [secret, setSecret] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const registrationSeen = useRef(false);
  const [confirm, setConfirm] = useState<{
    title: string;
    target?: string;
    action(): Promise<boolean>;
    clear?: boolean;
  }>();
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const reply = await bridge.botStatus(channel);
        if (active && reply.ok) setStatus(reply.value);
      } catch {
        if (active) setError(t("机器人操作未完成"));
      }
    };
    void refresh();
    const off = bridge.onChanged(() => void refresh());
    return () => {
      active = false;
      off();
    };
  }, []);
  useEffect(() => {
    if (!open || manual || step !== 0) return;
    if (status?.registration) registrationSeen.current = true;
    else if (registrationSeen.current && status?.configured) {
      registrationSeen.current = false;
      setStep(1);
    }
  }, [open, manual, step, status]);
  useEffect(() => {
    if (!status?.registration?.expiresAt) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [status?.registration?.expiresAt]);
  async function action(
    work: () => Promise<{ ok: boolean; message?: string }>,
  ) {
    setBusy(true);
    setError("");
    try {
      const reply = await work();
      if (!reply.ok) setError(reply.message ?? t("机器人操作未完成"));
      return reply.ok;
    } catch {
      setError(t("机器人操作未完成"));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const cancelRegistration = () => {
    registrationSeen.current = false;
    void bridge.cancelBotRegistration(channel);
  };
  const finish = () => {
    setOpen(false);
    setSecret("");
    setError("");
    cancelRegistration();
  };
  const start = () => {
    setStep(status?.configured ? "manage" : 0);
    setError("");
    setOpen(true);
  };
  const authorized = new Set(status?.authorizedChatIds ?? []);
  const chats = (
    <ChatAuthorizations
      authorized={[...authorized].map((id) => ({
        id,
        label:
          status?.pendingChats.find((chat) => chat.chatId === id)?.title || id,
      }))}
      pending={(status?.pendingChats ?? [])
        .filter((chat) => !authorized.has(chat.chatId))
        .map((chat) => ({ id: chat.chatId, label: chat.title }))}
      busy={busy}
      onAuthorize={(id) =>
        void action(() => bridge.authorizeBotChat(channel, id))
      }
      onRevoke={(chat) =>
        setConfirm({
          title: t("撤销聊天授权"),
          target: chat.label,
          action: () => action(() => bridge.revokeBotChat(channel, chat.id)),
        })
      }
    />
  );
  const identity = status?.botName || status?.accountId || t("飞书");
  const registration = status?.registration;
  const expired =
    !!registration?.expiresAt && Date.parse(registration.expiresAt) <= now;
  return (
    <section className="bot-settings" aria-label={t("飞书")}>
      <BotConnectionCard
        channel="feishu"
        status={t(
          status?.status === "connected"
            ? "正在接收"
            : status?.lastError
              ? "连接异常"
              : status?.configured
                ? "已配置"
                : "未连接",
        )}
        connected={status?.status === "connected"}
        configured={!!status?.configured}
        identity={status?.botName || status?.accountId}
        open={open}
        onOpen={start}
      />
      {open && (
        <BotDialog
          channel="feishu"
          title={t("飞书接入")}
          onClose={finish}
          steps={
            step === "manage"
              ? undefined
              : [t("连接机器人"), t("应用权限"), t("授权聊天"), t("完成配置")]
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
                  {t(step === 3 ? "完成" : "稍后继续")}
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
                  onClick={() => void action(() => bridge.verifyBot(channel))}
                >
                  {busy ? <CircleNotch className="spin" /> : <ShieldCheck />}
                  {t("验证连接")}
                </button>
              </div>
              {status?.lastError && !error && (
                <Feedback error>{t(status.lastError)}</Feedback>
              )}
              {chats}
              {!!(status?.queued || status?.pendingAcknowledgements) && (
                <div className="bot-queue-status" role="status">
                  <span>
                    {t("待入队")} <b>{status?.queued}</b>
                  </span>
                  <span>
                    {t("待发送回执")} <b>{status?.pendingAcknowledgements}</b>
                  </span>
                </div>
              )}
              <div className="config-actions">
                <button className="primary" onClick={() => setStep(2)}>
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
                    {t("更换应用")}
                  </button>
                  <button
                    className="text-button danger-text"
                    disabled={busy}
                    onClick={() =>
                      setConfirm({
                        title: t("清除配置"),
                        target: identity,
                        clear: true,
                        action: () =>
                          action(() => bridge.clearBotCredentials(channel)),
                      })
                    }
                  >
                    {t("清除配置")}
                  </button>
                </div>
              </details>
            </>
          )}
          {step === 0 && (
            <>
              <h3>{t("连接机器人")}</h3>
              <div className="segmented setup-mode">
                <button
                  aria-pressed={!manual}
                  className={!manual ? "on" : ""}
                  onClick={() => {
                    setManual(false);
                    setError("");
                  }}
                >
                  {t("扫码创建应用")}
                </button>
                <button
                  aria-pressed={manual}
                  className={manual ? "on" : ""}
                  onClick={() => {
                    cancelRegistration();
                    setManual(true);
                    setError("");
                  }}
                >
                  {t("使用已有应用")}
                </button>
              </div>
              {manual ? (
                <form
                  className="setup-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void action(async () => {
                      const reply = await bridge.saveBotCredentials(channel, {
                        appId: appId.trim(),
                        appSecret: secret.trim(),
                      });
                      if (reply.ok) {
                        setSecret("");
                        setStep(1);
                      }
                      return reply;
                    });
                  }}
                >
                  <label className="config-field">
                    <span>App ID</span>
                    <input
                      aria-label="App ID"
                      autoComplete="off"
                      value={appId}
                      onChange={(event) => setAppId(event.target.value)}
                      disabled={busy}
                      required
                    />
                  </label>
                  <SecretField
                    label="App Secret"
                    value={secret}
                    onChange={(event) => setSecret(event.target.value)}
                    disabled={busy}
                    required
                  />
                  <button
                    className="primary full-width"
                    type="submit"
                    disabled={busy || !appId.trim() || !secret.trim()}
                  >
                    {busy ? <CircleNotch className="spin" /> : <ShieldCheck />}
                    {t(busy ? "正在验证…" : "保存并验证")}
                  </button>
                </form>
              ) : (
                <div className="scan-connection">
                  <span className="state-symbol">
                    <PaperPlaneTilt />
                  </span>
                  <p>
                    {t(
                      registration?.url
                        ? "打开飞书授权页面并扫码确认，凭据会保存到本机。"
                        : "创建自己的飞书应用机器人，并将事件订阅设为长连接。每个应用由一台 Postrove 接收消息。",
                    )}
                  </p>
                  {registration?.url && !expired ? (
                    <>
                      <button
                        className="primary"
                        onClick={() =>
                          void bridge.openRepositoryLink(registration.url!)
                        }
                      >
                        {t("打开扫码授权页面")}
                        <ArrowUpRight />
                      </button>
                      <small>
                        {t("链接到期时间")}{" "}
                        <time dateTime={registration.expiresAt}>
                          {new Date(
                            registration.expiresAt!,
                          ).toLocaleTimeString()}
                        </time>
                      </small>
                      <button
                        className="text-button"
                        onClick={cancelRegistration}
                      >
                        {t("取消连接")}
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          void action(() =>
                            bridge.startBotRegistration(channel),
                          )
                        }
                      >
                        {busy ? (
                          <CircleNotch className="spin" />
                        ) : (
                          <ArrowRight />
                        )}
                        {t("扫码创建应用")}
                      </button>
                      {expired && (
                        <Feedback error>{t("扫码链接已过期")}</Feedback>
                      )}
                    </>
                  )}
                </div>
              )}
              {registration?.error && (
                <Feedback error>{t(registration.error)}</Feedback>
              )}
            </>
          )}
          {step === 1 && (
            <>
              <BotIdentity name={identity} />
              <h3>{t("应用权限")}</h3>
              <ul className="permission-list">
                {[
                  "启用机器人与单聊接收",
                  "开通发送消息和读取历史消息权限",
                  "订阅接收消息事件，使用长连接",
                  "发布应用",
                ].map((label, index) => (
                  <li key={label}>
                    <span>{index + 1}</span>
                    {t(label)}
                  </li>
                ))}
              </ul>
              <button
                className="secondary"
                onClick={() =>
                  void bridge.openRepositoryLink("https://open.feishu.cn/app")
                }
              >
                {t("打开飞书开放平台")}
                <ArrowUpRight />
              </button>
              <button
                className="primary full-width"
                disabled={busy}
                onClick={async () => {
                  if (await action(() => bridge.verifyBot(channel))) setStep(2);
                }}
              >
                {busy ? <CircleNotch className="spin" /> : <ShieldCheck />}
                {t(busy ? "正在验证…" : "验证连接并继续")}
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <BotIdentity name={identity} />
              <h3>{t("授权聊天")}</h3>
              <div className="instruction-note">
                <p>{t("向机器人发送一条消息，再授权这里出现的聊天。")}</p>
              </div>
              {chats}
              <button
                className="primary full-width"
                disabled={busy || !status?.authorizedChatIds.length}
                onClick={() => setStep(3)}
              >
                {t("继续")}
                <ArrowRight />
              </button>
            </>
          )}
          {step === 3 && (
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
                  onOpenContent();
                }}
              >
                {t("查看阅读内容")}
                <ArrowRight />
              </button>
            </div>
          )}
          {error && !confirm && <Feedback error>{error}</Feedback>}
        </BotDialog>
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          cancelLabel={t("保留配置")}
          busy={busy}
          error={error}
          onClose={() => {
            setConfirm(undefined);
            setError("");
          }}
          onConfirm={async () => {
            if (await confirm.action()) {
              if (confirm.clear) setStep(0);
              setConfirm(undefined);
            }
          }}
        >
          {confirm.target}
        </ConfirmDialog>
      )}
    </section>
  );
}
