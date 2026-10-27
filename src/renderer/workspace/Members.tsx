import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle,
  CircleNotch,
  Globe,
  Info,
  Plus,
  ShieldCheck,
  SignOut,
} from "@phosphor-icons/react";
import {
  advisors,
  advisorById,
  allowsGuest,
  advisorRoutes,
  platformConnections,
  type Advisor,
  type AdvisorId,
} from "../../shared/advisor-contracts";
import { bridge } from "../bridge";
import { t } from "../i18n";
import { Avatar, IconButton, Modal, ModalHeader, advisorName } from "./ui";
import { ConfirmDialog, Feedback, SetupSteps } from "./forms";
import { usePlatformStatus } from "./use-platform-status";
import type { Workspace } from "./use-workspace";

const connections = platformConnections.map((connection) => ({
  ...advisorById(connection.advisorId),
  source: connection.source,
}));
export function Members({
  workspace,
  onClose,
  initial,
}: {
  workspace: Workspace;
  onClose(): void;
  initial?: string;
}) {
  const [selected, setSelected] = useState(initial);
  const [status, setStatus] = usePlatformStatus();
  const [disabling, setDisabling] = useState<Advisor>();
  const [busy, setBusy] = useState(false),
    [waiting, setWaiting] = useState(false),
    [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [disconnect, setDisconnect] = useState(false);
  const current = connections.find((item) => item.connectionId === selected);
  async function action(kind: "login" | "check" | "logout") {
    if (!current) return false;
    setBusy(true);
    setError("");
    try {
      const reply =
        kind === "check"
          ? await bridge.platformStatus(current.connectionId)
          : await (kind === "login"
              ? bridge.loginPlatform(current.connectionId)
              : bridge.logoutPlatform(current.connectionId));
      if (!reply.ok) {
        setError(reply.message);
        return false;
      }
      const check = await bridge.platformStatus(current.connectionId);
      if (check.ok) {
        setStatus((old) => ({
          ...old,
          [current.connectionId]: {
            signedIn: check.value.signedIn,
            installed:
              "installed" in check.value ? !!check.value.installed : true,
          },
        }));
        if (kind === "check" && !check.value.signedIn)
          setError(t("尚未检测到登录"));
      }
      if (kind === "login") setWaiting(true);
      if (kind === "logout") setWaiting(false);
      return check.ok;
    } catch {
      setError(t("平台登录操作未完成，请稍后重试"));
      return false;
    } finally {
      setBusy(false);
      setSigningOut(false);
    }
  }
  async function toggle(advisor: Advisor) {
    const enabled = workspace.members?.enabled ?? [];
    const next = enabled.includes(advisor.id)
      ? enabled.filter((id) => id !== advisor.id)
      : [...enabled, advisor.id];
    setBusy(true);
    setError("");
    try {
      const reply = await bridge.saveAdvisorSettings({ enabled: next });
      if (!reply.ok) setError(reply.message);
      else await workspace.refresh();
      return reply.ok;
    } catch {
      setError(t("设置保存失败"));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const choices = (connection: Advisor) => (
    <div className="expert-route-list">
      {advisorRoutes
        .filter((route) => route.connectionId === connection.connectionId)
        .map((route) => (
          <div className="expert-picker" key={route.id}>
            <span className="expert-picker-label">
              {route.platform === "youtube" ? "YouTube" : t("语言专家")}
            </span>
            <div className="expert-options">
              {advisors
                .filter(
                  (advisor) =>
                    advisor.connectionId === connection.connectionId &&
                    advisor.platform === route.platform,
                )
                .map((advisor) => {
                  const active = workspace.members?.enabled.includes(
                    advisor.id,
                  );
                  return (
                    <button
                      key={advisor.id}
                      type="button"
                      role="switch"
                      aria-label={advisorName(advisor.id)}
                      aria-checked={!!active}
                      disabled={
                        busy ||
                        (!status[connection.connectionId]?.signedIn &&
                          !allowsGuest(connection.connectionId) &&
                          !active)
                      }
                      className="expert-option"
                      onClick={() =>
                        active ? setDisabling(advisor) : void toggle(advisor)
                      }
                    >
                      <span className="expert-language-symbol">
                        {advisor.language === "en" ? "En" : "中"}
                      </span>
                      <span>
                        <b>
                          {t(
                            advisor.language === "en" ? "英文专家" : "中文专家",
                          )}
                        </b>
                      </span>
                      <span className="expert-option-check">
                        {active ? <Check /> : <Plus />}
                      </span>
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
    </div>
  );
  const connected = !!current && status[current.connectionId]?.signedIn;
  return (
    <Modal
      label={t("我的成员")}
      className="connection-modal member-modal"
      onClose={onClose}
    >
      <ModalHeader
        title={current ? `${t(current.name)} · ${t("配置")}` : t("我的成员")}
        onClose={onClose}
        leading={
          current && (
            <IconButton
              label={t("返回成员列表")}
              onClick={() => {
                setSelected(undefined);
                setError("");
                setWaiting(false);
              }}
            >
              <ArrowLeft />
            </IconButton>
          )
        }
      />
      {!current ? (
        <div className="member-catalog shared-member-catalog">
          {connections.map((connection) => (
            <section
              key={connection.connectionId}
              className="adapter-group shared-adapter-card"
            >
              <header>
                <Avatar id={connection.id} languageBadge={false} />
                <div className="adapter-heading">
                  <h3>{t(connection.name)}</h3>
                  <p>{t(connection.source)}</p>
                </div>
                <span
                  className={`connection-pill ${status[connection.connectionId]?.signedIn ? "connected" : ""}`}
                >
                  <i />
                  {t(
                    status[connection.connectionId]?.signedIn
                      ? "已连接"
                      : "未连接",
                  )}
                </span>
                <button
                  className={
                    status[connection.connectionId]?.signedIn ||
                    allowsGuest(connection.connectionId)
                      ? "secondary"
                      : "primary"
                  }
                  onClick={() => {
                    setSelected(connection.connectionId);
                    setError("");
                  }}
                >
                  {t(
                    status[connection.connectionId]?.signedIn ||
                      allowsGuest(connection.connectionId)
                      ? "管理配置"
                      : "连接平台",
                  )}
                  <ArrowRight />
                </button>
              </header>
              {choices(connection)}
            </section>
          ))}
        </div>
      ) : (
        <div className="member-detail">
          <aside className={`connection-identity ${current.platform}`}>
            <Avatar id={current.id} languageBadge={false} />
            <h3>{t(current.name)}</h3>
            <span>{t(current.source)}</span>
            <div className="identity-line" />
            <span className="identity-status">
              {connected ? <CheckCircle /> : <Globe />}
              {t(connected ? "已连接" : "未连接")}
            </span>
          </aside>
          <div className="member-workspace">
            {connected || allowsGuest(current.connectionId) ? (
              <>
                {choices(current)}
                <div className="role-language-route">
                  <span>
                    <small>{t("专家语言")}</small>
                    <b>
                      {advisors
                        .filter(
                          (advisor) =>
                            advisor.connectionId === current.connectionId &&
                            workspace.members?.enabled.includes(advisor.id),
                        )
                        .map((advisor) =>
                          advisor.language === "en" ? "English" : "中文",
                        )
                        .join(" / ") || "—"}
                    </b>
                  </span>
                  <ArrowRight />
                  <span>
                    <small>{t("平台")}</small>
                    <b>{t(current.name)}</b>
                  </span>
                  <ArrowRight />
                  <span>
                    <small>{t("阅读语言")}</small>
                    <b>
                      {(workspace.preferences.readingLanguage === "app"
                        ? workspace.preferences.language
                        : workspace.preferences.readingLanguage) === "en"
                        ? "English"
                        : "中文"}
                    </b>
                  </span>
                </div>
              </>
            ) : (
              <>
                <SetupSteps
                  items={[t("平台登录"), t("启用专家")]}
                  current={0}
                />
                <div className="setup-state">
                  <span className="state-symbol">
                    {waiting ? <CircleNotch className="spin" /> : <Globe />}
                  </span>
                  <h3>{t(waiting ? "等待完成平台登录" : "连接平台账号")}</h3>
                  {!status[current.connectionId]?.installed &&
                    status[current.connectionId] && (
                      <p role="status">
                        {t("请先安装 Google Chrome，再打开浏览器登录。")}
                      </p>
                    )}
                </div>
              </>
            )}
            <div className="config-actions vertical">
              {!connected && (
                <div className="platform-account-notice" role="note">
                  <Info aria-hidden="true" />
                  <span>
                    {t("使用平台 AI 可能触发账号风控，建议使用小号登录。")}
                  </span>
                </div>
              )}
              <button
                className="primary"
                disabled={busy}
                onClick={() => void action("login")}
              >
                {t(connected ? "打开平台" : "打开登录窗口")}
                <ArrowUpRight />
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => void action("check")}
              >
                {busy ? <CircleNotch className="spin" /> : <ShieldCheck />}
                {t("检查登录状态")}
              </button>
              {connected && (
                <button
                  className="text-button danger-text"
                  disabled={busy}
                  onClick={() => setDisconnect(true)}
                >
                  <SignOut />
                  {t("退出登录")}
                </button>
              )}
            </div>
            {error && !disconnect && !disabling && (
              <Feedback error>{error}</Feedback>
            )}
          </div>
        </div>
      )}
      {!current && error && !disabling && (
        <div className="member-catalog-feedback">
          <Feedback error>{error}</Feedback>
        </div>
      )}
      {disconnect && (
        <ConfirmDialog
          title={t("退出登录")}
          confirmLabel={t("退出登录")}
          busy={signingOut}
          error={error}
          onClose={() => setDisconnect(false)}
          onConfirm={async () => {
            setSigningOut(true);
            if (await action("logout")) setDisconnect(false);
          }}
        >
          {current && `${t(current.name)} · ${t(current.source)}`}
        </ConfirmDialog>
      )}
      {disabling && (
        <ConfirmDialog
          title={t("停用专家")}
          confirmLabel={t("停用专家")}
          busy={busy}
          error={error}
          onClose={() => setDisabling(undefined)}
          onConfirm={async () => {
            if (await toggle(disabling)) setDisabling(undefined);
          }}
        >
          {advisorName(disabling.id)}
        </ConfirmDialog>
      )}
    </Modal>
  );
}
