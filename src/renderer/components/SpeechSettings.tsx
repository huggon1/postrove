import { useEffect, useRef, useState } from "react";
import { bridge } from "../bridge";
import { t } from "../i18n";
import type { SpeechInstallView } from "../../shared/capability-contracts";
import type { SpeechIssueCode } from "../../shared/speech-contracts";
import { SectionHeading } from "../workspace/forms";

const activeStates = new Set(["preparing", "downloading", "verifying"]);
const errors: Partial<Record<SpeechIssueCode, string>> = {
  unsupported_runtime: "当前系统暂未提供转写组件",
  runtime_missing: "转写组件缺失，请更新应用",
  runtime_integrity: "转写组件校验失败，请更新应用",
  download_failed: "模型下载中断",
  download_integrity: "模型校验失败",
  model_integrity: "模型校验失败",
  timeout: "模型下载超时",
  storage_failed: "模型保存失败，请检查磁盘空间",
};
export function SpeechSettings() {
  return (
    <>
      <SectionHeading title={t("语音转文字")} />
      <SpeechInstallCard />
    </>
  );
}
export function SpeechInstallCard() {
  const [view, setView] = useState<SpeechInstallView>();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    let revision = 0;
    const load = async () => {
      const current = ++revision;
      try {
        const next = await bridge.speechInstallView();
        if (alive.current && current === revision) setView(next);
      } catch {
        if (alive.current && current === revision) setError(t("状态读取失败"));
      }
    };
    void load();
    const off = bridge.onChanged(() => void load());
    return () => {
      alive.current = false;
      off();
    };
  }, []);
  async function act(cancel: boolean) {
    setPending(true);
    setError("");
    try {
      const next = await (cancel
        ? bridge.cancelSpeechInstall()
        : bridge.installSpeech());
      if (alive.current) setView(next);
    } catch {
      if (alive.current) setError(t("操作未完成，请重试"));
    } finally {
      if (alive.current) setPending(false);
    }
  }
  const active = !!view && activeStates.has(view.state);
  const status = !view
    ? "正在读取…"
    : view.state === "ready"
      ? "已就绪"
      : view.state === "preparing"
        ? "准备中"
        : view.state === "downloading"
          ? "下载中"
          : view.state === "verifying"
            ? "校验中"
            : view.state === "cancelled"
              ? "已取消"
              : view.state === "failed"
                ? "安装失败"
                : "待安装";
  const downloaded = view ? Math.min(view.downloadedBytes, view.totalBytes) : 0;
  const total = view?.totalBytes || 190085487;
  const progress = Math.floor((downloaded / total) * 100);
  return (
    <section
      className="speech-install-card"
      aria-label={t("本地转写")}
      data-install-state={view?.state || "loading"}
    >
      <div className="speech-install-head">
        <strong>{t("本地转写")}</strong>
        <span
          className={view?.state === "ready" ? "is-ready" : ""}
          role="status"
        >
          {t(status)}
        </span>
      </div>
      <dl className="speech-install-resources">
        <div>
          <dt>{t("转写组件")}</dt>
          <dd>
            {!view
              ? "—"
              : t(
                  view.readiness.runtime === "ready"
                    ? "已就绪"
                    : view.readiness.runtime === "unsupported"
                      ? "当前系统暂未提供"
                      : view.readiness.runtime === "invalid"
                        ? "校验失败"
                        : "组件缺失",
                )}
          </dd>
        </div>
        <div>
          <dt>
            Whisper small<small>{t("模型 · 190 MB")}</small>
          </dt>
          <dd>
            {view?.state === "downloading"
              ? `${progress}% · ${(downloaded / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} MB`
              : t(
                  view?.state === "verifying"
                    ? "校验中"
                    : view?.readiness.model === "ready"
                      ? "已就绪"
                      : view?.readiness.model === "invalid"
                        ? "校验失败"
                        : "待下载",
                )}
          </dd>
        </div>
      </dl>
      {active && (
        <div className="speech-install-progress">
          {view.state === "downloading" ? (
            <progress
              aria-label={t("模型下载")}
              value={downloaded}
              max={total}
            />
          ) : (
            <progress
              aria-label={t(
                view.state === "preparing" ? "校验组件" : "校验模型",
              )}
            />
          )}
        </div>
      )}
      {(error || view?.state === "failed") && (
        <p className="inline-error" role="alert">
          {error ||
            t(errors[view?.error || "download_failed"] || "安装未完成，请重试")}
        </p>
      )}
      {view && view.state !== "ready" && (
        <div className="speech-install-actions">
          <button
            className={active ? "secondary" : "primary"}
            disabled={pending || view.readiness.runtime === "unsupported"}
            onClick={() => void act(active)}
          >
            {t(
              active
                ? "取消"
                : view.state === "failed" || view.state === "cancelled"
                  ? "重试"
                  : "一键安装",
            )}
          </button>
        </div>
      )}
    </section>
  );
}
