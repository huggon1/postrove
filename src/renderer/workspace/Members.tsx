import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCircle,
  CircleNotch,
  Globe,
  Plus,
  ShieldCheck,
  SignOut,
} from "@phosphor-icons/react";
import {
  advisors,
  type Advisor,
  type AdvisorId,
} from "../../shared/advisor-contracts";
import { bridge } from "../bridge";
import { t } from "../i18n";
import { Avatar, IconButton, Modal, ModalHeader, advisorName } from "./ui";
import type { Workspace } from "./use-workspace";

const connections = [advisors[0], advisors[2]];
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
  const [status, setStatus] = useState<
    Record<string, { signedIn: boolean; installed: boolean }>
  >({});
  const [busy, setBusy] = useState(false),
    [waiting, setWaiting] = useState(false),
    [error, setError] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const [disconnect, setDisconnect] = useState(false);
  const current = connections.find((item) => item.connectionId === selected);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      const values = await Promise.allSettled([
        bridge.xStatus(),
        bridge.xhsStatus(),
      ]);
      if (!alive) return;
      values.forEach((value, index) => {
        if (value.status === "fulfilled" && value.value.ok) {
          const state = value.value.value;
          setStatus((old) => ({
            ...old,
            [connections[index].connectionId]: {
              signedIn: state.signedIn,
              installed: "installed" in state ? !!state.installed : true,
            },
          }));
        }
      });
    };
    void load();
    const off = bridge.onChanged(() => void load());
    return () => {
      alive = false;
      off();
    };
  }, []);
  async function action(kind: "login" | "check" | "logout") {
    if (!current) return;
    setBusy(true);
    setError("");
    try {
      const reply =
        kind === "check"
          ? current.platform === "x"
            ? await bridge.xStatus()
            : await bridge.xhsStatus()
          : current.platform === "x"
            ? await (kind === "login" ? bridge.loginX() : bridge.logoutX())
            : await (kind === "login" ? bridge.loginXhs() : bridge.logoutXhs());
      if (!reply.ok) {
        setError(reply.message);
        return;
      }
      const check =
        current.platform === "x"
          ? await bridge.xStatus()
          : await bridge.xhsStatus();
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
    } catch {
      setError(t("平台登录操作未完成，请稍后重试"));
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
    } catch {
      setError(t("设置保存失败"));
    } finally {
      setBusy(false);
    }
  }
  const choices = (connection: Advisor) => (
    <div className="expert-picker">
      <span className="expert-picker-label">{t("语言专家")}</span>
      <div className="expert-options">
        {advisors
          .filter((advisor) => advisor.connectionId === connection.connectionId)
          .map((advisor) => {
            const active = workspace.members?.enabled.includes(advisor.id);
            return (
              <button
                key={advisor.id}
                type="button"
                role="switch"
                aria-label={advisorName(advisor.id)}
                aria-checked={!!active}
                disabled={
                  busy ||
                  (!status[connection.connectionId]?.signedIn && !active)
                }
                className="expert-option"
                onClick={() => void toggle(advisor)}
              >
                <span className="expert-language-symbol">
                  {advisor.language === "en" ? "En" : "中"}
                </span>
                <span>
                  <b>
                    {t(advisor.language === "en" ? "英文专家" : "中文专家")}
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
  );
  const connected = !!current && status[current.connectionId]?.signedIn;
  return (
    <Modal
      label={t("我的成员")}
      className="connection-modal member-modal"
      onClose={onClose}
    >
      <ModalHeader
        title={
          current
            ? `${current.platform === "x" ? "Grok" : t("点点")} · ${t("配置")}`
            : t("我的成员")
        }
        onClose={onClose}
      >
        {current && (
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
        )}
      </ModalHeader>
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
                  <h3>{connection.platform === "x" ? "Grok" : t("点点")}</h3>
                  <p>{connection.platform === "x" ? "X" : t("小红书")}</p>
                </div>
                <span
                  className={`connection-pill ${status[connection.connectionId]?.signedIn ? "connected" : ""}`}
                >
                  <i />
                  {t(
                    status[connection.connectionId]?.signedIn
                      ? "已连接"
                      : "待连接",
                  )}
                </span>
                <button
                  className={
                    status[connection.connectionId]?.signedIn
                      ? "secondary"
                      : "primary"
                  }
                  onClick={() => {
                    setSelected(connection.connectionId);
                    setError("");
                  }}
                >
                  {t(
                    status[connection.connectionId]?.signedIn
                      ? "管理配置"
                      : "连接平台",
                  )}
                  <ArrowUpRight />
                </button>
              </header>
              {choices(connection)}
            </section>
          ))}
        </div>
      ) : (
        <div className="member-detail">
          <aside
            className={`connection-identity ${current.platform === "x" ? "grok" : "diandian"}`}
          >
            <Avatar id={current.id} languageBadge={false} />
            <h3>{current.platform === "x" ? "Grok" : t("点点")}</h3>
            <span>{current.platform === "x" ? "X" : t("小红书")}</span>
            <div className="identity-line" />
            <span className="identity-status">
              {connected ? <CheckCircle /> : <Globe />}
              {t(connected ? "已连接" : "待连接")}
            </span>
          </aside>
          <div className="member-workspace">
            {connected ? (
              <>
                {choices(current)}
                <div className="role-language-route">
                  <span>
                    <small>{t("提问语言")}</small>
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
                    <b>{current.platform === "x" ? "Grok" : t("点点")}</b>
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
                <ol className="setup-steps">
                  <li aria-current="step">
                    <span>1</span>
                    <b>{t("平台登录")}</b>
                  </li>
                  <li>
                    <span>2</span>
                    <b>{t("启用专家")}</b>
                  </li>
                </ol>
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
            {error && (
              <p className="setup-feedback is-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
      )}
      {!current && error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {disconnect && (
        <Modal
          label={t("退出登录")}
          className="compact-modal"
          onClose={() => setDisconnect(false)}
        >
          <ModalHeader
            title={t("退出登录")}
            onClose={() => setDisconnect(false)}
          />
          <div className="compact-body">
            <div className="config-actions">
              <button
                className="secondary"
                onClick={() => setDisconnect(false)}
              >
                {t("取消")}
              </button>
              <button
                className="primary"
                disabled={signingOut}
                onClick={async () => {
                  setSigningOut(true);
                  await action("logout");
                  setDisconnect(false);
                }}
              >
                {t("退出登录")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </Modal>
  );
}
