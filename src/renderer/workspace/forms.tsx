import {
  useEffect,
  useId,
  useRef,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import {
  Check,
  CheckCircle,
  CircleNotch,
  Eye,
  EyeSlash,
  WarningCircle,
} from "@phosphor-icons/react";
import { t, tf } from "../i18n";
import { IconButton, Modal, ModalHeader } from "./ui";

export function SectionHeading({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <header className="settings-section-head">
      <h2>{title}</h2>
      {action}
    </header>
  );
}

export function SetupSteps({
  items,
  current,
}: {
  items: string[];
  current: number;
}) {
  return (
    <ol className="setup-steps">
      {items.map((label, index) => (
        <li
          key={label}
          aria-current={index === current ? "step" : undefined}
          className={index < current ? "complete" : ""}
        >
          <span>{index < current ? <Check /> : index + 1}</span>
          <b>{label}</b>
        </li>
      ))}
    </ol>
  );
}

export function Feedback({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) ref.current?.scrollIntoView({ block: "nearest" });
  }, [error, children]);
  return (
    <div
      ref={ref}
      className={`setup-feedback ${error ? "is-error" : ""}`}
      role={error ? "alert" : "status"}
    >
      {error ? <WarningCircle /> : <CheckCircle />}
      <span>{children}</span>
    </div>
  );
}

export function SecretField({
  label,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const [visible, setVisible] = useState(false);
  const generatedId = useId();
  const id = input.id ?? generatedId;
  return (
    <div className="config-field">
      <label htmlFor={id}>{label}</label>
      <div className="secret-input">
        <input
          {...input}
          id={id}
          aria-label={label}
          autoComplete="off"
          type={visible ? "text" : "password"}
        />
        <IconButton
          label={tf(visible ? "隐藏 {0}" : "显示 {0}", label)}
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          <span aria-hidden="true">{visible ? <EyeSlash /> : <Eye />}</span>
        </IconButton>
      </div>
    </div>
  );
}

export function ConfirmDialog({
  title,
  children,
  confirmLabel = t("确认"),
  cancelLabel = t("取消"),
  busy,
  error,
  onClose,
  onConfirm,
}: {
  title: string;
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  error?: string;
  onClose(): void;
  onConfirm(): void | Promise<void>;
}) {
  const close = () => {
    if (!busy) onClose();
  };
  return (
    <Modal
      label={title}
      className="compact-modal confirm-modal"
      onClose={close}
    >
      <ModalHeader title={title} onClose={close} closeDisabled={busy} />
      <div className="compact-body">
        {children && <div className="confirm-copy">{children}</div>}
        {error && <Feedback error>{error}</Feedback>}
        <div className="config-actions">
          <button
            className="secondary"
            data-initial-focus
            onClick={close}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            className="primary"
            disabled={busy}
            aria-busy={busy}
            onClick={() => void onConfirm()}
          >
            {busy && <CircleNotch className="spin" aria-hidden="true" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
