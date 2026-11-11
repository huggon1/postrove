import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { sourceProfiles } from "../../shared/source-profiles";
import { forwardingInputSchema } from "../../shared/source-contracts";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CaretDown,
  Check,
  Copy,
  CircleNotch,
  FileText,
  LinkSimple,
  MagnifyingGlass,
  Plus,
  StopCircle,
  Trash,
  WarningCircle,
  X,
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
import type { ModelReply } from "../../shared/model-contracts";
import { Feedback } from "./forms";
import { useSessionDraft } from "./use-session-draft";

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
  const [url, setUrl, discardUrl] = useSessionDraft("reading.link", initial);
  const [error, setError] = useState("");
  const linkScope = "reading:add-link";
  const linkPending = workspace.pending(linkScope);
  const close = () => {
    if (!linkPending) onClose();
  };
  useEffect(() => {
    if (initial) setUrl(initial);
  }, [initial]);
  return (
    <Modal label={t("添加链接")} className="compact-modal" onClose={close}>
      <ModalHeader
        title={t("添加链接")}
        onClose={close}
        closeDisabled={linkPending}
      />
      <form
        className="compact-body"
        onSubmit={async (event) => {
          event.preventDefault();
          setError("");
          const parsed = forwardingInputSchema.safeParse(url);
          if (!parsed.success) {
            setError(t("请输入 HTTPS 网页链接"));
            return;
          }
          const taskId = await workspace.run(
            () => bridge.addLink(parsed.data),
            linkScope,
          );
          if (taskId) {
            discardUrl();
            onAdded(taskId);
          }
        }}
      >
        <label className="config-field">
          <span>{t("链接")}</span>
          <input
            aria-label={t("链接")}
            type="text"
            inputMode="url"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            required
            disabled={linkPending}
            value={url}
            onChange={(event) => {
              setUrl(event.target.value);
              setError("");
              workspace.clearError(linkScope);
            }}
            placeholder="https://"
          />
        </label>
        {(error || workspace.errorFor(linkScope) || workspace.error) && (
          <Feedback error>
            {error || workspace.errorFor(linkScope) || workspace.error}
          </Feedback>
        )}
        <button
          className="primary full-width"
          type="submit"
          disabled={!url.trim() || workspace.pending(linkScope)}
        >
          {workspace.pending(linkScope) ? (
            <CircleNotch className="spin" />
          ) : (
            <BookmarkIcon />
          )}
          {t("加入阅读")}
        </button>
        <button
          type="button"
          className="text-button link-connect-shortcut"
          disabled={linkPending}
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
  query,
  onQuery,
}: {
  workspace: Workspace;
  onOpen(taskId: string): void;
  onDelete(id: string): void;
  query: string;
  onQuery(value: string): void;
}) {
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
          onChange={(event) => onQuery(event.target.value)}
        />
        {query && (
          <IconButton label={t("清除搜索")} onClick={() => onQuery("")}>
            <X />
          </IconButton>
        )}
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
                  {item.platform === "web" ||
                  item.platform === "github" ||
                  item.platform === "bilibili"
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

type ReaderSession = {
  materialId: string;
  original: boolean;
  positions: Record<string, number>;
};
const readerSessions = new Map<string, ReaderSession>();

export function ReadingView({
  workspace,
  report,
  onClose,
}: {
  workspace: Workspace;
  report: UiForwardingReport;
  onClose(): void;
}) {
  const session = useRef<ReaderSession>(
    readerSessions.get(report.taskId) ?? {
      materialId: "",
      original: false,
      positions: {},
    },
  ).current;
  const [materialId, setMaterialId] = useState(session.materialId),
    [original, setOriginal] = useState(session.original),
    [receipts, setReceipts] = useState(false),
    [copiedPath, setCopiedPath] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const restoringPosition = useRef(false);
  const scope = (action: string) => `reading:${report.taskId}:${action}`;
  const [lastAction, setLastAction] = useState<string>();
  const actionError =
    (lastAction && workspace.errorFor(scope(lastAction))) || workspace.error;
  const executionPending =
    workspace.pending(scope("stop")) || workspace.pending(scope("retry"));
  function runAction<T>(
    action: string,
    operation: () => Promise<ModelReply<T>>,
  ) {
    setLastAction(action);
    return workspace.run(operation, scope(action));
  }
  useEffect(() => {
    if (!copiedPath) return;
    const timer = setTimeout(() => setCopiedPath(false), 2_000);
    return () => clearTimeout(timer);
  }, [copiedPath]);

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

  const positionKey = `${material?.id ?? ""}:${original ? "original" : "reading"}`;
  useLayoutEffect(() => {
    session.materialId = material?.id ?? "";
    session.original = original;
    readerSessions.set(report.taskId, session);
    if (readerSessions.size > 100)
      readerSessions.delete(readerSessions.keys().next().value!);
    const element = scroll.current;
    if (!element) return;
    const position = session.positions[positionKey] ?? 0;
    let restoring = position > 0;
    restoringPosition.current = restoring;
    const restore = () => {
      if (!restoring) return;
      for (const image of element.querySelectorAll("img"))
        image.loading = "eager";
      element.scrollTop = position;
    };
    const observer = new ResizeObserver(restore);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    const stopRestoring = () => {
      restoring = false;
      restoringPosition.current = false;
      observer.disconnect();
    };
    element.addEventListener("load", restore, true);
    element.addEventListener("error", restore, true);
    element.addEventListener("wheel", stopRestoring, { passive: true });
    element.addEventListener("touchstart", stopRestoring, { passive: true });
    element.addEventListener("pointerdown", stopRestoring);
    document.addEventListener("keydown", stopRestoring, true);
    if (!restoring) element.scrollTop = 0;
    restore();
    const frame = requestAnimationFrame(restore);
    return () => {
      cancelAnimationFrame(frame);
      stopRestoring();
      element.removeEventListener("load", restore, true);
      element.removeEventListener("error", restore, true);
      element.removeEventListener("wheel", stopRestoring);
      element.removeEventListener("touchstart", stopRestoring);
      element.removeEventListener("pointerdown", stopRestoring);
      document.removeEventListener("keydown", stopRestoring, true);
    };
  }, [report.taskId, material?.id, original]);
  return (
    <Modal label={t("阅读内容")} className="reader-modal" onClose={onClose}>
      <ModalHeader title={t("阅读")} onClose={onClose}>
        <IconButton
          label={t("打开原链接")}
          disabled={workspace.pending(scope("open"))}
          onClick={() =>
            void runAction("open", () =>
              bridge.openRepositoryLink(material?.url || report.sourceUrl),
            )
          }
        >
          <ArrowUpRight />
        </IconButton>
        {!active && (
          <IconButton
            label={t(copiedPath ? "已复制路径" : "复制结果文件路径")}
            tooltip
            disabled={workspace.pending(scope("copy"))}
            onClick={async () => {
              setCopiedPath(false);
              const path = await runAction("copy", () =>
                bridge.copyResultPath("reading", report.taskId),
              );
              if (path) setCopiedPath(true);
            }}
          >
            {workspace.pending(scope("copy")) ? (
              <CircleNotch className="spin" />
            ) : copiedPath ? (
              <Check />
            ) : (
              <Copy />
            )}
          </IconButton>
        )}
        {!active && (
          <IconButton
            label={t("结果文件")}
            disabled={workspace.pending(scope("files"))}
            onClick={() =>
              void runAction("files", () =>
                bridge.revealResult("reading", report.taskId),
              )
            }
          >
            <FileText />
          </IconButton>
        )}
      </ModalHeader>
      <div className="reader-controls">
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
          <div className="reader-task-actions">
            {active ? (
              <button
                className="text-button danger-text"
                disabled={executionPending}
                onClick={() =>
                  void runAction("stop", () =>
                    bridge.cancelForwarding(report.taskId),
                  )
                }
              >
                {executionPending ? (
                  <CircleNotch className="spin" />
                ) : (
                  <StopCircle />
                )}
                {t("停止")}
              </button>
            ) : (
              (task?.status === "failed" || task?.status === "cancelled") && (
                <button
                  className="text-button"
                  disabled={executionPending}
                  onClick={() =>
                    void runAction("retry", () =>
                      bridge.retryForwarding(report.taskId),
                    )
                  }
                >
                  {executionPending && <CircleNotch className="spin" />}
                  {t("重试")}
                </button>
              )
            )}
            <button
              className="text-button"
              aria-expanded={receipts}
              onClick={() => setReceipts(!receipts)}
            >
              {t("处理状态")}
              <CaretDown className="disclosure-caret" />
            </button>
          </div>
        </div>
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
        {receipts && (
          <div className="reader-receipt">
            <span>
              {stateLabel(task?.status)} · {t(task?.phase || report.stageLabel)}
            </span>
            {task?.error && <p role="status">{task.error}</p>}
            <button
              className="text-button"
              disabled={workspace.pending(scope("logs"))}
              onClick={() =>
                void runAction("logs", () =>
                  bridge.exportTaskPiLogs(report.taskId),
                )
              }
            >
              {t("导出运行日志")}
            </button>
          </div>
        )}
        {actionError && <Feedback error>{actionError}</Feedback>}
      </div>
      <div
        className="reader-scroll"
        ref={scroll}
        onScroll={(event) => {
          if (!restoringPosition.current)
            session.positions[positionKey] = event.currentTarget.scrollTop;
        }}
      >
        <article className="reader-article">
          <div className="reader-meta">
            <span>{report.sourceIdentity}</span>
            <Time value={report.fetchedAt} />
          </div>
          <h1>{material?.title || report.title}</h1>
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
          ) : material?.issue ? null : (
            <div className="empty-state">
              <BookOpen />
              <h2>
                {material
                  ? stateLabel(
                      material.state === "processing"
                        ? "running"
                        : material.state,
                    )
                  : task?.error || stateLabel(task?.status || "pending")}
              </h2>
            </div>
          )}
        </article>
      </div>
    </Modal>
  );
}
