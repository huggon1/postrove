import { useState } from "react";
import { sourceProfiles } from "../../shared/source-profiles";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CaretDown,
  FileText,
  LinkSimple,
  MagnifyingGlass,
  Plus,
  StopCircle,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import { bridge } from "../bridge";
import { Markdown } from "../components/Primitives";
import type { UiForwardingReport } from "../product-ui";
import { t, tf } from "../i18n";
import {
  IconButton,
  Modal,
  ModalHeader,
  Time,
  isRunning,
  stateLabel,
} from "./ui";
import type { Workspace } from "./use-workspace";
import { Feedback } from "./forms";

export function CollectLink({
  initial = "",
  workspace,
  onClose,
  onAdded,
  onConnections,
}: {
  initial?: string;
  workspace: Workspace;
  onClose(): void;
  onAdded(taskId: string): void;
  onConnections(): void;
}) {
  const [url, setUrl] = useState(initial),
    [error, setError] = useState("");
  return (
    <Modal label={t("添加链接")} className="compact-modal" onClose={onClose}>
      <ModalHeader title={t("添加链接")} onClose={onClose} />
      <form
        className="compact-body"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          try {
            const parsed = new URL(url.trim());
            if (
              parsed.protocol !== "https:" ||
              parsed.username ||
              parsed.password
            )
              throw new Error();
          } catch {
            setError(t("请输入 HTTPS 网页链接"));
            return;
          }
          const taskId = await workspace.run(() => bridge.addLink(url.trim()));
          if (taskId) onAdded(taskId);
        }}
      >
        <label className="config-field">
          <span>{t("链接")}</span>
          <input
            aria-label={t("链接")}
            type="url"
            autoFocus
            required
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://"
          />
        </label>
        {(error || workspace.error) && (
          <Feedback error>{error || workspace.error}</Feedback>
        )}
        <button
          className="primary full-width"
          type="submit"
          disabled={!url.trim() || workspace.busy}
        >
          <BookmarkIcon />
          {t("加入阅读")}
        </button>
        <button
          type="button"
          className="text-button link-connect-shortcut"
          onClick={onConnections}
        >
          <LinkSimple />
          {t("连接 Telegram 或飞书")}
          <ArrowRight />
        </button>
      </form>
    </Modal>
  );
}
const BookmarkIcon = () => <BookOpen />;

export function ReadingLibrary({
  workspace,
  onOpen,
  onDelete,
}: {
  workspace: Workspace;
  onOpen(taskId: string): void;
  onDelete(id: string): void;
}) {
  const [query, setQuery] = useState("");
  const items = [
    ...workspace.content.reports,
    ...(workspace.content.partialReports ?? []),
  ]
    .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt))
    .filter((item) =>
      `${item.title} ${item.sourceUrl} ${item.summary}`
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
  return (
    <>
      <label className="library-search">
        <MagnifyingGlass />
        <input
          aria-label={t("搜索阅读内容")}
          placeholder={t("搜索阅读内容")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="library-grid">
        {items.map((item) => {
          const image = item.materials?.[0]?.source?.images[0];
          const task = workspace.content.tasks.find(
            (task) => task.taskId === item.taskId,
          );
          return (
            <article className="reading-card" key={item.taskId}>
              <button
                className={`reading-cover ${item.platform}`}
                onClick={() => onOpen(item.taskId)}
                aria-label={tf("阅读：{0}", item.title)}
              >
                {image ? (
                  <img
                    src={image.cachedUrl || image.url}
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <BookOpen weight="duotone" />
                )}
                <span className="reading-origin">
                  {item.platform === "web" || item.platform === "github"
                    ? new URL(item.sourceUrl).hostname.replace(/^www\./, "")
                    : t(sourceProfiles[item.platform].name)}
                </span>
              </button>
              <div className="reading-card-body">
                <button
                  className="reading-card-title"
                  onClick={() => onOpen(item.taskId)}
                >
                  <h2>{item.title}</h2>
                </button>
                {item.summary && <p>{item.summary}</p>}
                <div className="reading-card-footer">
                  <span>
                    {stateLabel(
                      task?.status ||
                        (item.reportState === "complete"
                          ? "completed"
                          : item.reportState === "processing"
                            ? "running"
                            : "partial"),
                    )}
                  </span>
                  <IconButton
                    label={t("删除内容")}
                    onClick={() => onDelete(item.materialId)}
                  >
                    <Trash />
                  </IconButton>
                </div>
              </div>
            </article>
          );
        })}
      </div>
      {!workspace.loading && !items.length && (
        <div className="empty-state">
          <BookOpen />
          <h2>{t(query ? "没有找到内容" : "还没有阅读内容")}</h2>
        </div>
      )}
    </>
  );
}

export function ReadingView({
  workspace,
  report,
  onClose,
}: {
  workspace: Workspace;
  report: UiForwardingReport;
  onClose(): void;
}) {
  const [materialId, setMaterialId] = useState(""),
    [original, setOriginal] = useState(false),
    [receipts, setReceipts] = useState(false);
  const materials = report.materials ?? [];
  const material =
    materials.find((item) => item.id === materialId) ?? materials[0];
  const task = workspace.content.tasks.find(
    (item) => item.taskId === report.taskId,
  );
  const active = isRunning(task?.status);
  const hasReading = material?.chunks.some((chunk) => chunk.translated);
  const body = material
    ? original || !hasReading
      ? material.source?.markdown ||
        material.chunks.map((chunk) => chunk.original).join("\n\n") ||
        material.source?.contentBlocks
          .map((block) =>
            block.type === "image"
              ? `![${material.source!.images.find((image) => image.imageId === block.imageId)?.alt || ""}](${material.source!.images.find((image) => image.imageId === block.imageId)?.url || ""})`
              : block.text,
          )
          .join("\n\n") ||
        ""
      : material.chunks
          .map((chunk) => chunk.translated || chunk.original)
          .join("\n\n")
    : "";
  return (
    <Modal label={t("阅读内容")} className="reader-modal" onClose={onClose}>
      <ModalHeader title={t("阅读")} onClose={onClose}>
        <IconButton
          label={t("打开原链接")}
          onClick={() =>
            void workspace.run(() =>
              bridge.openRepositoryLink(material?.url || report.sourceUrl),
            )
          }
        >
          <ArrowUpRight />
        </IconButton>
        {!active && (
          <IconButton
            label={t("结果文件")}
            onClick={() =>
              void workspace.run(() =>
                bridge.revealResult("reading", report.taskId),
              )
            }
          >
            <FileText />
          </IconButton>
        )}
      </ModalHeader>
      <div className="reader-scroll">
        <article className="reader-article">
          {workspace.error && (
            <p className="inline-error" role="alert">
              {workspace.error}
            </p>
          )}
          <div className="reader-meta">
            <span>{report.sourceIdentity}</span>
            <Time value={report.fetchedAt} />
          </div>
          <h1>{material?.title || report.title}</h1>
          <div className="reader-toolbar">
            <div className="content-language-modes">
              <button
                className={!original && hasReading ? "on" : ""}
                aria-pressed={!original && !!hasReading}
                disabled={!hasReading}
                onClick={() => setOriginal(false)}
              >
                {t("阅读版本")}
              </button>
              <button
                className={original || !hasReading ? "on" : ""}
                aria-pressed={original || !hasReading}
                onClick={() => setOriginal(true)}
              >
                {t("原文")}
              </button>
            </div>
            <button
              className="text-button"
              aria-expanded={receipts}
              onClick={() => setReceipts(!receipts)}
            >
              {t("处理状态")}
              <CaretDown className="disclosure-caret" />
            </button>
          </div>
          {receipts && (
            <div className="reader-receipt">
              <span>
                {stateLabel(task?.status)} · {task?.phase || report.stageLabel}
              </span>
              {task?.error && <p role="status">{task.error}</p>}
              <div>
                {active ? (
                  <button
                    className="text-button danger-text"
                    onClick={() =>
                      void workspace.booleanAction(() =>
                        bridge.cancelForwarding(report.taskId),
                      )
                    }
                  >
                    <StopCircle />
                    {t("停止")}
                  </button>
                ) : task?.status === "failed" ||
                  task?.status === "cancelled" ? (
                  <button
                    className="text-button"
                    onClick={() =>
                      void workspace.booleanAction(() =>
                        bridge.retryForwarding(report.taskId),
                      )
                    }
                  >
                    {t("重试")}
                  </button>
                ) : null}
                <button
                  className="text-button"
                  onClick={() =>
                    void workspace.run(() =>
                      bridge.exportTaskPiLogs(report.taskId),
                    )
                  }
                >
                  {t("导出运行日志")}
                </button>
              </div>
            </div>
          )}
          {materials.length > 1 && (
            <label className="material-select">
              <span>{t("材料")}</span>
              <select
                aria-label={t("材料")}
                value={material?.id}
                onChange={(event) => {
                  setMaterialId(event.target.value);
                  setOriginal(false);
                }}
              >
                {materials.map((item, index) => (
                  <option key={item.id} value={item.id}>
                    {index === 0 ? t("正文") : t("引用")} ·{" "}
                    {item.title || item.url}
                  </option>
                ))}
              </select>
            </label>
          )}
          {material?.summary && !original && (
            <p className="reader-introduction">{material.summary}</p>
          )}
          {material?.issue && (
            <p className="inline-error" role="status">
              <WarningCircle />
              {material.issue}
            </p>
          )}
          {body ? (
            <Markdown images={material?.source?.images}>{body}</Markdown>
          ) : (
            <div className="empty-state">
              <BookOpen />
              <h2>{task?.error || stateLabel(task?.status || "pending")}</h2>
            </div>
          )}
        </article>
      </div>
    </Modal>
  );
}
