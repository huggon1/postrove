import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { User, X } from "@phosphor-icons/react";
import { advisorById, type AdvisorId } from "../../shared/advisor-contracts";
import { t, useLanguage } from "../i18n";

export function Avatar({
  id,
  small = false,
  languageBadge = true,
}: {
  id?: AdvisorId;
  small?: boolean;
  languageBadge?: boolean;
}) {
  const person = id && advisorById(id);
  return (
    <span
      aria-hidden="true"
      className={`avatar ${person ? (person.platform === "x" ? "grok" : "diandian") : "me"} ${small ? "small" : ""}`}
    >
      {person ? person.platform === "x" ? "G" : "点" : <User weight="fill" />}
      {languageBadge && person && (
        <span className="avatar-language">
          {person.language === "en" ? "en" : "中"}
        </span>
      )}
    </span>
  );
}
export function advisorName(id: AdvisorId) {
  const advisor = advisorById(id);
  return `${advisor.platform === "x" ? "Grok" : t("点点")} · ${t(advisor.language === "en" ? "英文" : "中文")}`;
}
export function IconButton({
  label,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      aria-label={label}
      title={label}
      {...props}
    />
  );
}
export function Modal({
  label,
  className = "",
  children,
  onClose,
}: {
  label: string;
  className?: string;
  children: ReactNode;
  onClose(): void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!,
      focus = document.activeElement as HTMLElement | null;
    dialog.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previous;
      if (focus?.isConnected) focus.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="dialog-frame">{children}</div>
    </dialog>
  );
}
export function ModalHeader({
  title,
  onClose,
  children,
}: {
  title: string;
  children?: ReactNode;
  onClose(): void;
}) {
  return (
    <header className="modal-top">
      <h2>{title}</h2>
      <div className="modal-header-actions">
        {children}
        <IconButton label={t("关闭")} onClick={onClose}>
          <X />
        </IconButton>
      </div>
    </header>
  );
}
export function Time({ value }: { value: string }) {
  const language = useLanguage();
  const date = new Date(value);
  return (
    <time dateTime={value} title={date.toLocaleString(language)}>
      {date.toLocaleDateString(language, { month: "short", day: "numeric" })} ·{" "}
      {date.toLocaleTimeString(language, {
        hour: "2-digit",
        minute: "2-digit",
      })}
    </time>
  );
}
export const isRunning = (state?: string) =>
  !!state && ["pending", "queued", "running"].includes(state);
export function stateLabel(state?: string) {
  return t(
    (
      {
        queued: "排队中",
        pending: "等待中",
        running: "进行中",
        completed: "已完成",
        partial: "部分完成",
        empty: "暂无引用",
        failed: "失败",
        stopped: "已停止",
        cancelled: "已停止",
      } as Record<string, string>
    )[state ?? ""] ?? "等待中",
  );
}
