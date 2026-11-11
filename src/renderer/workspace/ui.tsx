import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type Ref,
  type ReactNode,
} from "react";
import { User, X } from "@phosphor-icons/react";
import { advisorById, type AdvisorId } from "../../shared/advisor-contracts";
import { t, useLanguage } from "../i18n";
import "./ui-overlays.css";

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
      className={`avatar ${person ? { x: "grok", xiaohongshu: "diandian", youtube: "gemini", reddit: "reddit" }[person.platform] : "me"} ${small ? "small" : ""}`}
    >
      {person ? (
        { x: "G", xiaohongshu: "点", youtube: "✦", reddit: "R" }[
          person.platform
        ]
      ) : (
        <User weight="fill" />
      )}
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
  return `${t(advisor.name) + (advisor.platform === "youtube" ? " · YouTube" : "")} · ${t(advisor.language === "en" ? "英文" : "中文")}`;
}
export function IconButton({
  label,
  tooltip = false,
  children,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  tooltip?: boolean;
  ref?: Ref<HTMLButtonElement>;
}) {
  const tooltipId = useId();
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      aria-label={label}
      title={tooltip ? undefined : label}
      aria-describedby={tooltip ? tooltipId : undefined}
      {...props}
    >
      {children}
      {tooltip && (
        <span id={tooltipId} role="tooltip" className="icon-tooltip">
          {label}
        </span>
      )}
    </button>
  );
}
const openModals = new Set<HTMLDialogElement>();
let savedBodyOverflow = "";
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
  const backdropPointer = useRef(false);
  useEffect(() => {
    const dialog = ref.current!,
      focus = document.activeElement as HTMLElement | null;
    dialog.showModal();
    const initial =
      dialog.querySelector<HTMLElement>(
        '[data-initial-focus], input:not(:disabled):not([type="checkbox"]), textarea:not(:disabled), select:not(:disabled)',
      ) ?? dialog.querySelector<HTMLElement>("[data-modal-close]");
    if (!dialog.querySelector("[autofocus]")) initial?.focus();
    if (!openModals.size) savedBodyOverflow = document.body.style.overflow;
    openModals.add(dialog);
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      openModals.delete(dialog);
      if (!openModals.size) document.body.style.overflow = savedBodyOverflow;
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
        if (event.target === ref.current && backdropPointer.current) onClose();
        backdropPointer.current = false;
      }}
      onPointerDown={(event) => {
        backdropPointer.current = event.target === ref.current;
      }}
      onPointerUp={(event) => {
        backdropPointer.current &&= event.target === ref.current;
      }}
      onPointerCancel={() => {
        backdropPointer.current = false;
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
  leading,
  closeDisabled = false,
}: {
  title: string;
  children?: ReactNode;
  leading?: ReactNode;
  onClose(): void;
  closeDisabled?: boolean;
}) {
  return (
    <header className="modal-top">
      <div className="modal-title">
        {leading}
        <h2>{title}</h2>
      </div>
      <div className="modal-header-actions">
        {children}
        <IconButton
          label={t("关闭")}
          data-modal-close
          onClick={onClose}
          disabled={closeDisabled}
        >
          <X />
        </IconButton>
      </div>
    </header>
  );
}
export function Time({
  value,
  timeZone,
}: {
  value: string;
  timeZone?: string;
}) {
  const language = useLanguage();
  const date = new Date(value);
  return (
    <time dateTime={value} title={date.toLocaleString(language, { timeZone })}>
      {date.toLocaleDateString(language, {
        month: "short",
        day: "numeric",
        timeZone,
      })}{" "}
      ·{" "}
      {date.toLocaleTimeString(language, {
        hour: "2-digit",
        minute: "2-digit",
        timeZone,
        hourCycle: timeZone ? "h23" : undefined,
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
