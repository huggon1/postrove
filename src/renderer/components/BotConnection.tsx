import type { ReactNode } from "react";
import {
  ArrowRight,
  CheckCircle,
  PaperPlaneTilt,
  ShieldCheck,
  TelegramLogo,
  User,
} from "@phosphor-icons/react";
import { t, tf } from "../i18n";
import { Modal, ModalHeader } from "../workspace/ui";
import { SetupSteps } from "../workspace/forms";

export function ChannelSymbol({ channel }: { channel: "telegram" | "feishu" }) {
  return (
    <span className={`channel-symbol ${channel}`} aria-hidden="true">
      {channel === "telegram" ? (
        <TelegramLogo weight="fill" />
      ) : (
        <PaperPlaneTilt weight="fill" />
      )}
    </span>
  );
}

export function BotConnectionCard({
  channel,
  status,
  connected,
  configured,
  identity,
  open,
  onOpen,
}: {
  channel: "telegram" | "feishu";
  status: string;
  connected: boolean;
  configured: boolean;
  identity?: string;
  open: boolean;
  onOpen(): void;
}) {
  return (
    <button
      className={`inbox-card telegram-summary ${channel}`}
      aria-expanded={open}
      onClick={onOpen}
    >
      <ChannelSymbol channel={channel} />
      <h3>{channel === "telegram" ? "Telegram" : t("飞书")}</h3>
      <span className={`connection-pill ${connected ? "connected" : ""}`}>
        <i />
        {status}
      </span>
      {identity && <span className="inbox-identity">{identity}</span>}
      <span className="inbox-card-bottom">
        <span>{t(configured ? "管理连接" : "开始配置")}</span>
        <ArrowRight />
      </span>
    </button>
  );
}

export function BotDialog({
  channel,
  title,
  steps,
  step = 0,
  footer,
  children,
  onClose,
}: {
  channel: "telegram" | "feishu";
  title: string;
  steps?: string[];
  step?: number;
  footer?: ReactNode;
  children: ReactNode;
  onClose(): void;
}) {
  return (
    <Modal
      label={title}
      className="connection-modal bot-modal"
      onClose={onClose}
    >
      <ModalHeader
        title={title}
        leading={<ChannelSymbol channel={channel} />}
        onClose={onClose}
      />
      <div className="bot-workspace">
        {steps && <SetupSteps items={steps} current={step} />}
        <div className="setup-stage">{children}</div>
        {footer && <footer className="setup-footer">{footer}</footer>}
      </div>
    </Modal>
  );
}

export function BotIdentity({ name }: { name: string }) {
  return (
    <div className="verified-bot">
      <CheckCircle />
      <strong>{name}</strong>
    </div>
  );
}

type Chat = { id: string; label: string };
export function ChatAuthorizations({
  authorized,
  pending,
  busy,
  onAuthorize,
  onRevoke,
}: {
  authorized: Chat[];
  pending: Chat[];
  busy: boolean;
  onAuthorize(id: string): void;
  onRevoke(chat: Chat): void;
}) {
  const group = (chats: Chat[], granted: boolean) => (
    <section className="chat-group">
      <h4>{t(granted ? "已授权聊天" : "待授权聊天")}</h4>
      {chats.map((chat) => (
        <div
          className={`chat-option ${granted ? "authorized" : ""}`}
          key={chat.id}
        >
          <span className="chat-avatar" aria-hidden="true">
            {granted ? <ShieldCheck /> : <User />}
          </span>
          <span className="chat-identity">
            <strong>{chat.label}</strong>
            {chat.label !== chat.id && <small>{chat.id}</small>}
          </span>
          <button
            className={
              granted ? "text-button danger-text" : "secondary small-primary"
            }
            disabled={busy}
            aria-label={tf(granted ? "撤销 {0} 授权" : "授权 {0}", chat.label)}
            onClick={() => (granted ? onRevoke(chat) : onAuthorize(chat.id))}
          >
            {t(granted ? "撤销授权" : "授权")}
          </button>
        </div>
      ))}
    </section>
  );
  return (
    <div className="chat-authorizations">
      {!!authorized.length && group(authorized, true)}
      {!!pending.length && group(pending, false)}
      {!authorized.length && !pending.length && (
        <div className="discover-chat" role="status">
          <span className="state-symbol">
            <PaperPlaneTilt />
          </span>
          <span>{t("等待发现聊天")}</span>
        </div>
      )}
    </div>
  );
}
