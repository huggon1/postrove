import { useEffect, useState } from "react";
import { bridge } from "../bridge";
import { t } from "../i18n";
import type { CapabilityView } from "../../shared/capability-contracts";
import type { Workspace } from "../workspace/use-workspace";
import type { SettingsSection } from "../workspace/Settings";
import { usePlatformStatus } from "../workspace/use-platform-status";
import { Modal, ModalHeader } from "../workspace/ui";
import { SectionHeading } from "../workspace/forms";
import {
  capabilityPlatforms,
  capabilityGroups,
  capabilityRanges,
  type CapabilityPlatform,
  type CapabilityRequirement,
} from "../workspace/capability-groups";

export function CapabilitySettings({
  workspace,
  onSection,
  onMember,
}: {
  workspace: Workspace;
  onSection(section: SettingsSection): void;
  onMember(connectionId?: string): void;
}) {
  const [view, setView] = useState<CapabilityView>();
  const [platformStatus] = usePlatformStatus();
  const [bilibili, setBilibili] = useState<boolean>();
  const [selected, setSelected] = useState<CapabilityPlatform>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let alive = true,
      revision = 0;
    const load = async () => {
      const current = ++revision;
      try {
        const [next, bili] = await Promise.all([
          bridge.capabilityView(),
          bridge.readingSiteStatus("bilibili"),
        ]);
        if (!alive || current !== revision) return;
        setView(next);
        setBilibili(bili.ok ? bili.value.signedIn : undefined);
        setError(bili.ok ? "" : bili.message);
      } catch {
        if (alive && current === revision) setError(t("状态读取失败"));
      }
    };
    void load();
    const off = bridge.onChanged(() => void load());
    return () => {
      alive = false;
      off();
    };
  }, []);
  function signedIn(platform: CapabilityPlatform) {
    return platform.id === "bilibili"
      ? bilibili
      : "connection" in platform
        ? platformStatus[platform.connection]?.signedIn
        : false;
  }
  async function configure(requirement: CapabilityRequirement) {
    if (!selected) return;
    if (requirement.id === "account" && selected.id === "bilibili") {
      setError("");
      setPending(true);
      try {
        const result = await bridge.loginReadingSite("bilibili");
        if (!result.ok) setError(result.message);
        else {
          const status = await bridge.readingSiteStatus("bilibili");
          if (status.ok) setBilibili(status.value.signedIn);
        }
      } catch {
        setError(t("平台登录操作未完成，请稍后重试"));
      } finally {
        setPending(false);
      }
      return;
    }
    if (requirement.id === "chrome") {
      setError("");
      try {
        await bridge.openChromeDownload();
      } catch {
        setError(t("操作未完成，请重试"));
      }
      return;
    }
    setSelected(undefined);
    if (requirement.id === "model") onSection("models");
    else if (requirement.id === "speech") onSection("speech");
    else if (requirement.id === "reader") onSection("about");
    else onMember("connection" in selected ? selected.connection : undefined);
  }
  const selectedGroups =
    selected && view
      ? capabilityGroups(
          selected,
          view,
          !!signedIn(selected),
          workspace.members?.enabled || [],
        )
      : [];
  function requirements(items: CapabilityRequirement[]) {
    return (
      <div className="capability-requirements">
        {items.map((requirement) => (
          <div className="capability-requirement" key={requirement.id}>
            <span>{t(requirement.label)}</span>
            {requirement.ready ? (
              <span className="is-ready">{t("已配置")}</span>
            ) : (
              <button
                className="text-button"
                disabled={pending}
                onClick={() => void configure(requirement)}
              >
                {t(
                  requirement.id === "reader"
                    ? "更新应用"
                    : requirement.id === "chrome"
                      ? "安装 Chrome"
                      : requirement.id === "speech"
                        ? "安装"
                        : requirement.id === "account"
                          ? "连接账号"
                          : requirement.id === "experts"
                            ? "启用专家"
                            : "配置",
                )}
              </button>
            )}
          </div>
        ))}
      </div>
    );
  }
  return (
    <>
      <SectionHeading title={t("能力地图")} />
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {!view ? (
        <p role="status">{t("正在读取…")}</p>
      ) : (
        <div className="capability-table-wrap">
          <table className="capability-table">
            <thead>
              <tr>
                <th>{t("平台")}</th>
                <th>{t("当前能力")}</th>
              </tr>
            </thead>
            <tbody>
              {capabilityPlatforms.map((platform) => {
                const groups = capabilityGroups(
                  platform,
                  view,
                  !!signedIn(platform),
                  workspace.members?.enabled || [],
                );
                const ready = groups.filter((group) => group.ready);
                return (
                  <tr key={platform.id} onClick={() => setSelected(platform)}>
                    <th scope="row">
                      <button
                        className="capability-platform"
                        onClick={() => setSelected(platform)}
                      >
                        <span
                          aria-hidden="true"
                          className={`capability-mark ${platform.id}`}
                        >
                          {platform.mark}
                        </span>
                        <span>{t(platform.name)}</span>
                      </button>
                    </th>
                    <td>
                      <div className="capability-points">
                        {ready.length ? (
                          ready.map((group) => (
                            <span key={group.name}>{t(group.name)}</span>
                          ))
                        ) : (
                          <span className="capability-empty">
                            {t("待配置")}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {selected && (
        <Modal
          label={t(selected.name)}
          className="connection-modal capability-modal"
          onClose={() => setSelected(undefined)}
        >
          <ModalHeader
            title={t(selected.name)}
            onClose={() => setSelected(undefined)}
          />
          <div className="capability-detail">
            <section className="capability-group">
              <div className="capability-group-head">
                <h3>{t("基础配置")}</h3>
              </div>
              {requirements(
                selectedGroups[0]?.requirements.filter(
                  (item) => item.id === "model" || item.id === "chrome",
                ) || [],
              )}
            </section>
            {selectedGroups.map((group) => (
              <section className="capability-group" key={group.name}>
                <div className="capability-group-head">
                  <h3>{t(group.name)}</h3>
                  <span className={group.ready ? "is-ready" : ""}>
                    {t(group.ready ? "已配置" : "待配置")}
                  </span>
                </div>
                {requirements(
                  group.requirements.filter(
                    (item) => item.id !== "model" && item.id !== "chrome",
                  ),
                )}
              </section>
            ))}
            {selected.id === "bilibili" && (
              <details className="capability-disclosure">
                <summary>{t("可选配置")}</summary>
                <div className="capability-requirement">
                  <span>{t("平台账号")}</span>
                  {bilibili ? (
                    <span className="is-ready">{t("已连接")}</span>
                  ) : (
                    <button
                      className="text-button"
                      disabled={pending}
                      onClick={() =>
                        void configure({
                          id: "account",
                          label: "平台账号",
                          ready: false,
                        })
                      }
                    >
                      {t("连接账号")}
                    </button>
                  )}
                </div>
              </details>
            )}
            <details className="capability-disclosure">
              <summary>{t("范围")}</summary>
              <p>{t(capabilityRanges[selected.id])}</p>
            </details>
            {error && (
              <p className="inline-error" role="alert">
                {error}
              </p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
