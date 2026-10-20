import { sourceProfiles } from "../../shared/source-profiles";
import { useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  At,
  BookmarkSimple,
  CaretDown,
  Check,
  CheckCircle,
  Clock,
  FileText,
  LinkSimple,
  PaperPlaneTilt,
  Plus,
  StopCircle,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import type {
  FocusSearchReport,
  SearchSection,
} from "../../shared/focus-search-contracts";
import {
  advisors,
  legacyAdvisor,
  type AdvisorId,
} from "../../shared/advisor-contracts";
import { bridge } from "../bridge";
import { Markdown } from "../components/Primitives";
import { t, tf } from "../i18n";
import {
  Avatar,
  IconButton,
  Modal,
  ModalHeader,
  Time,
  advisorName,
  isRunning,
  stateLabel,
} from "./ui";
import type { Workspace } from "./use-workspace";

export const sectionAdvisor = (section: SearchSection) =>
  section.advisorId ?? legacyAdvisor(section.platform, section.promptLanguage);
const excerpt = (text: string) =>
  text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#*`>]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 160);
const sourceCount = (report: FocusSearchReport) =>
  new Set(
    report.sections.flatMap((section) =>
      section.candidates.map((candidate) => candidate.postKey),
    ),
  ).size;

export function Composer({
  workspace,
  selected,
  onSelected,
  onMembers,
  onLink,
  onSent,
}: {
  workspace: Workspace;
  selected: AdvisorId[];
  onSelected(ids: AdvisorId[]): void;
  onMembers(): void;
  onLink(url?: string): void;
  onSent(reportId: string): void;
}) {
  const [question, setQuestion] = useState("");
  const [menu, setMenu] = useState(false);
  const enabled = workspace.members?.enabled ?? [];
  const linkOnly = /^https:\/\/\S+$/.test(question.trim());
  async function send() {
    const text = question.trim();
    if (/^https:\/\/\S+$/.test(text)) {
      onLink(text);
      return;
    }
    const taskId = await workspace.run(() =>
      bridge.startFocusSearch({
        question: text,
        advisorIds: selected,
        platforms: [
          ...new Set(
            selected.map(
              (id) => advisors.find((advisor) => advisor.id === id)!.platform,
            ),
          ),
        ],
      }),
    );
    if (taskId) {
      setQuestion("");
      onSent(taskId);
    }
  }
  return (
    <section className="composer" aria-label={t("发起话题")}>
      <div className="composer-head">
        <Avatar />
        <label htmlFor="message">{t("发起话题")}</label>
      </div>
      <textarea
        id="message"
        aria-label={t("话题内容")}
        placeholder={t("有什么想问问大家的？")}
        maxLength={10000}
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            (event.metaKey || event.ctrlKey) &&
            question.trim() &&
            (selected.length || linkOnly) &&
            !workspace.busy
          ) {
            event.preventDefault();
            void send();
          }
        }}
      />
      <div className="composer-bottom">
        <div className="recipient-chips" aria-label={t("本次接收成员")}>
          {enabled.map((id) => (
            <button
              key={id}
              aria-pressed={selected.includes(id)}
              className={`member-chip ${selected.includes(id) ? "selected" : ""}`}
              onClick={() =>
                onSelected(
                  selected.includes(id)
                    ? selected.filter((other) => other !== id)
                    : [...selected, id],
                )
              }
            >
              <Avatar id={id} small />
              {advisorName(id)}
              {selected.includes(id) && <Check />}
            </button>
          ))}
          {!enabled.length && (
            <button className="text-button" onClick={onMembers}>
              <Plus />
              {t("添加成员")}
            </button>
          )}
        </div>
        <div className="compose-actions">
          <div className="recipient-menu-wrap">
            <IconButton
              label={t("选择接收成员")}
              onClick={() => setMenu(!menu)}
              aria-expanded={menu}
            >
              <At />
            </IconButton>
            {menu && (
              <div className="recipient-menu">
                <div className="recipient-menu-head">
                  <b>{t("接收成员")}</b>
                  <button
                    className="text-button"
                    onClick={() => setMenu(false)}
                  >
                    {t("完成")}
                  </button>
                </div>
                {enabled.map((id) => (
                  <label key={id}>
                    <input
                      type="checkbox"
                      checked={selected.includes(id)}
                      onChange={() =>
                        onSelected(
                          selected.includes(id)
                            ? selected.filter((other) => other !== id)
                            : [...selected, id],
                        )
                      }
                    />
                    <Avatar id={id} small />
                    {advisorName(id)}
                  </label>
                ))}
                <button
                  className="text-button"
                  onClick={() => {
                    setMenu(false);
                    onMembers();
                  }}
                >
                  <Plus />
                  {t("管理成员")}
                </button>
              </div>
            )}
          </div>
          <button
            className="primary send-button"
            disabled={
              !question.trim() ||
              (!selected.length && !linkOnly) ||
              workspace.busy ||
              workspace.loading
            }
            onClick={() => void send()}
          >
            {t(linkOnly ? "添加链接" : "发送")}
            <PaperPlaneTilt weight="fill" />
          </button>
        </div>
      </div>
    </section>
  );
}
export function TopicCard({
  report,
  unread,
  onOpen,
}: {
  report: FocusSearchReport;
  unread: boolean;
  onOpen(receipts?: boolean): void;
}) {
  const answered = report.sections.filter(
    (section) => !!section.rawReply,
  ).length;
  const issues = report.sections.some(
    (section) =>
      section.state === "failed" ||
      section.processingIssue ||
      ["failed", "empty"].includes(section.citationExtraction?.state ?? ""),
  );
  return (
    <article className="topic-card" data-topic={report.reportId}>
      <div className="topic-meta">
        <Avatar small />
        <strong>{t("我")}</strong>
        <Time value={report.createdAt} />
        {report.origin === "follow" && (
          <span className="origin-label">
            <Clock />
            {report.followName || t("定时发送")}
          </span>
        )}
        {unread && <span className="unread-dot" aria-label={t("未读")} />}
      </div>
      <button className="topic-content" onClick={() => onOpen()}>
        <h2>{report.question}</h2>
        <div className="reply-peeks">
          {report.sections.slice(0, 2).map((section) => (
            <div className="reply-peek" key={section.sectionId}>
              <Avatar id={sectionAdvisor(section)} small />
              <span>
                <b>{advisorName(sectionAdvisor(section))}</b>
                <span>
                  {excerpt(section.readingReply || section.rawReply) ||
                    section.error ||
                    stateLabel(section.state)}
                </span>
              </span>
            </div>
          ))}
        </div>
      </button>
      <div className="topic-footer">
        <button
          className={`receipt-link ${issues ? "attention" : ""}`}
          aria-label={tf("查看回执：{0}", report.question)}
          onClick={() => onOpen(true)}
        >
          <span className="avatar-stack">
            {report.sections.map((section) => (
              <Avatar
                key={section.sectionId}
                id={sectionAdvisor(section)}
                small
              />
            ))}
          </span>
          <span>{tf("{0}/{1} 已回复", answered, report.sections.length)}</span>
          {issues && <WarningCircle />}
          {isRunning(report.status) && <span className="running-dot" />}
        </button>
        <button className="open-topic" onClick={() => onOpen()}>
          {sourceCount(report) > 0 && (
            <span>
              <LinkSimple />
              {sourceCount(report)}
            </span>
          )}
          {t("打开话题")}
          <ArrowRight />
        </button>
      </div>
    </article>
  );
}

export function TopicThread({
  workspace,
  report,
  initialReceipts = false,
  onClose,
  onRead,
  onDelete,
}: {
  workspace: Workspace;
  report: FocusSearchReport;
  initialReceipts?: boolean;
  onClose(): void;
  onRead(taskId: string): void;
  onDelete(): void;
}) {
  const [receipts, setReceipts] = useState(initialReceipts),
    [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(new Set<string>());
  const [original, setOriginal] = useState(new Set<string>()),
    [prompt, setPrompt] = useState(new Set<string>());
  const [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const candidates = report.sections.flatMap((section) => section.candidates);
  const allCandidates = [
    ...new Map(
      candidates.map((candidate) => [candidate.postKey, candidate]),
    ).values(),
  ];
  const toggle = (current: Set<string>, key: string) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };
  async function collect(ids: string[]) {
    setSaving(true);
    setError("");
    try {
      const reply = await bridge.addSearchCandidates({
        reportId: report.reportId,
        candidateIds: ids,
      });
      if (!reply.ok) setError(reply.message);
      else {
        const failures = reply.value.filter((item) => item.error);
        if (failures.length)
          setError(tf("{0} 个来源收取失败", failures.length));
        else {
          setSelecting(false);
          setSelected(new Set());
        }
        await workspace.refresh();
      }
    } catch {
      setError(t("收取失败，请重试"));
    } finally {
      setSaving(false);
    }
  }
  const source = (candidate: (typeof candidates)[number]) => {
    const submission = report.submissions.find(
      (item) => item.postKey === candidate.postKey && item.submitted,
    );
    const parsed =
      submission &&
      [
        ...workspace.content.reports,
        ...(workspace.content.partialReports ?? []),
      ].find((item) => item.taskId === submission.taskId);
    const active = parsed?.reportState === "processing";
    return (
      <div
        key={candidate.candidateId}
        className={`source-tile ${selected.has(candidate.candidateId) ? "selected" : ""}`}
      >
        {selecting && (
          <input
            type="checkbox"
            aria-label={tf("选择来源：{0}", candidate.title)}
            checked={selected.has(candidate.candidateId)}
            disabled={!!submission}
            onChange={() =>
              setSelected(toggle(selected, candidate.candidateId))
            }
          />
        )}
        <span className="source-mark">
          <LinkSimple />
        </span>
        <button
          className="source-title"
          onClick={() =>
            parsed
              ? onRead(parsed.taskId)
              : void bridge.openSearchCandidate({
                  reportId: report.reportId,
                  candidateIds: [candidate.candidateId],
                })
          }
        >
          <strong>{candidate.title}</strong>
          {candidate.description && <small>{candidate.description}</small>}
        </button>
        <button
          className={`tiny-button ${parsed ? "ready" : ""}`}
          disabled={
            saving ||
            (active && !parsed?.materials?.some((material) => material.source))
          }
          onClick={() =>
            parsed
              ? onRead(parsed.taskId)
              : void collect([candidate.candidateId])
          }
        >
          {parsed ? (active ? t("收取中") : t("阅读")) : t("收取")}
          <BookmarkSimple />
        </button>
      </div>
    );
  };
  return (
    <Modal label={t("话题详情")} className="thread-modal" onClose={onClose}>
      <ModalHeader title={t("话题")} onClose={onClose}>
        <IconButton label={t("删除话题")} onClick={onDelete}>
          <Trash />
        </IconButton>
        <button
          className={`text-button ${receipts ? "selected-action" : ""}`}
          aria-expanded={receipts}
          onClick={() => setReceipts(!receipts)}
        >
          {t("成员回执")}
          <CaretDown />
        </button>
      </ModalHeader>
      <div className="thread-scroll">
        {workspace.error && (
          <p className="inline-error" role="alert">
            {workspace.error}
          </p>
        )}
        <div className="thread-question">
          <div className="topic-meta">
            <Avatar small />
            <strong>{t("我")}</strong>
            <Time value={report.createdAt} />
          </div>
          <h1>{report.question}</h1>
        </div>
        {receipts && (
          <section className="receipt-panel" aria-label={t("成员回执")}>
            {report.sections.map((section) => (
              <div className="receipt-item" key={section.sectionId}>
                <div className="receipt-row">
                  <Avatar id={sectionAdvisor(section)} small />
                  <strong>{advisorName(sectionAdvisor(section))}</strong>
                  <span
                    className={
                      section.state === "failed" ? "receipt-error" : ""
                    }
                  >
                    {section.cancelled
                      ? t("已停止")
                      : stateLabel(section.state)}
                  </span>
                  {isRunning(section.state) && (
                    <IconButton
                      label={tf(
                        "停止 {0}",
                        advisorName(sectionAdvisor(section)),
                      )}
                      disabled={workspace.busy}
                      onClick={() =>
                        void workspace.booleanAction(() =>
                          bridge.cancelAdvisorRun(
                            report.taskId,
                            section.sectionId,
                          ),
                        )
                      }
                    >
                      <StopCircle />
                    </IconButton>
                  )}
                </div>
                {(section.error ||
                  section.processingIssue ||
                  section.citationExtraction?.error) && (
                  <p className="receipt-reason">
                    <WarningCircle />
                    {section.failureStage && (
                      <b>
                        {t(
                          {
                            preparation: "提问翻译",
                            bridge: "浏览器桥梁",
                            platform: "平台账号",
                            sources: "引用收取",
                            processing: "阅读处理",
                          }[section.failureStage],
                        )}{" "}
                        ·{" "}
                      </b>
                    )}
                    {section.error ||
                      section.processingIssue ||
                      section.citationExtraction?.error}
                  </p>
                )}
                {section.rawReply && (
                  <div className="receipt-source-state">
                    {t("引用")} ·{" "}
                    {stateLabel(section.citationExtraction?.state)}
                  </div>
                )}
              </div>
            ))}
            <div className="receipt-actions">
              {isRunning(report.status) ? (
                <button
                  className="text-button danger-text"
                  onClick={() =>
                    void workspace.booleanAction(() =>
                      bridge.cancelFocusSearch(report.taskId),
                    )
                  }
                >
                  <StopCircle />
                  {t("停止话题")}
                </button>
              ) : (
                <button
                  className="text-button"
                  onClick={() =>
                    void workspace.run(() =>
                      bridge.revealResult("search", report.taskId),
                    )
                  }
                >
                  <FileText />
                  {t("结果文件")}
                </button>
              )}
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
          </section>
        )}
        <div className="reply-section-head">
          <h3>{tf("{0} 位成员的回复", report.sections.length)}</h3>
          {allCandidates.length > 0 && (
            <div>
              <button
                className="text-button"
                aria-pressed={selecting}
                onClick={() => {
                  setSelecting(!selecting);
                  setSelected(new Set());
                }}
              >
                {t(selecting ? "取消选择" : "选择来源")}
              </button>
              <button
                className="text-button"
                disabled={
                  saving ||
                  allCandidates.every((candidate) =>
                    report.submissions.some(
                      (item) =>
                        item.postKey === candidate.postKey && item.submitted,
                    ),
                  )
                }
                onClick={() =>
                  void collect(
                    allCandidates
                      .filter(
                        (candidate) =>
                          !report.submissions.some(
                            (item) =>
                              item.postKey === candidate.postKey &&
                              item.submitted,
                          ),
                      )
                      .map((candidate) => candidate.candidateId),
                  )
                }
              >
                {t("收取全部")}
                <BookmarkSimple />
              </button>
            </div>
          )}
        </div>
        {report.sections.map((section) => (
          <article
            className="full-reply"
            key={section.sectionId}
            data-advisor={sectionAdvisor(section)}
          >
            <div className="reply-author">
              <Avatar id={sectionAdvisor(section)} />
              <div>
                <strong>{advisorName(sectionAdvisor(section))}</strong>
                <span>
                  {t(sourceProfiles[section.platform].name)}
                  {section.finishedAt && (
                    <>
                      {" "}
                      · <Time value={section.finishedAt} />
                    </>
                  )}
                </span>
              </div>
              {section.state === "failed" && (
                <WarningCircle className="receipt-error" />
              )}
            </div>
            <div className="reply-body">
              {section.rawReply ? (
                <>
                  <div className="reply-language-tools">
                    <div className="content-language-modes">
                      <button
                        aria-pressed={
                          !original.has(section.sectionId) &&
                          !!section.readingReply
                        }
                        className={
                          !original.has(section.sectionId) &&
                          section.readingReply
                            ? "on"
                            : ""
                        }
                        disabled={!section.readingReply}
                        onClick={() =>
                          setOriginal((old) => {
                            const next = new Set(old);
                            next.delete(section.sectionId);
                            return next;
                          })
                        }
                      >
                        {t("阅读版本")}
                      </button>
                      <button
                        aria-pressed={
                          original.has(section.sectionId) ||
                          !section.readingReply
                        }
                        className={
                          original.has(section.sectionId) ||
                          !section.readingReply
                            ? "on"
                            : ""
                        }
                        onClick={() =>
                          setOriginal((old) =>
                            new Set(old).add(section.sectionId),
                          )
                        }
                      >
                        {t("原文")}
                      </button>
                    </div>
                    <button
                      className="text-button"
                      aria-expanded={prompt.has(section.sectionId)}
                      onClick={() =>
                        setPrompt(toggle(prompt, section.sectionId))
                      }
                    >
                      {t("实际提问")}
                      <CaretDown />
                    </button>
                  </div>
                  {prompt.has(section.sectionId) && (
                    <div className="submitted-question">
                      <span>
                        {section.promptLanguage === "en" ? "English" : "中文"}
                      </span>
                      <p>{section.platformPrompt || section.prompt}</p>
                    </div>
                  )}
                  <Markdown>
                    {original.has(section.sectionId) || !section.readingReply
                      ? section.rawReply
                      : section.readingReply}
                  </Markdown>
                  {section.processingIssue && (
                    <p className="inline-error">{section.processingIssue}</p>
                  )}
                </>
              ) : (
                <div
                  className={
                    section.state === "failed" ? "reply-error" : "reply-waiting"
                  }
                >
                  {section.state === "failed" ? (
                    <WarningCircle />
                  ) : (
                    <span className="running-dot" />
                  )}
                  <span>{section.error || stateLabel(section.state)}</span>
                </div>
              )}
              {section.candidates.length > 0 && (
                <div className="reply-sources">
                  <div className="sources-heading">
                    <span>
                      <LinkSimple />
                      {tf("{0} 个来源", section.candidates.length)}
                    </span>
                    <button
                      className="text-button"
                      disabled={
                        saving ||
                        section.candidates.every((candidate) =>
                          report.submissions.some(
                            (item) =>
                              item.postKey === candidate.postKey &&
                              item.submitted,
                          ),
                        )
                      }
                      onClick={() =>
                        void collect(
                          section.candidates
                            .filter(
                              (candidate) =>
                                !report.submissions.some(
                                  (item) =>
                                    item.postKey === candidate.postKey &&
                                    item.submitted,
                                ),
                            )
                            .map((candidate) => candidate.candidateId),
                        )
                      }
                    >
                      {t("收取这些来源")}
                    </button>
                  </div>
                  {section.candidates.map(source)}
                </div>
              )}
            </div>
          </article>
        ))}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        {!isRunning(report.status) && (
          <div className="thread-end">
            <span />
            <CheckCircle />
            <span />
          </div>
        )}
      </div>
      {selecting && (
        <div className="selection-bar">
          <span>{tf("已选 {0} 个来源", selected.size)}</span>
          <button
            className="primary"
            disabled={!selected.size || saving}
            onClick={() => void collect([...selected])}
          >
            {t("收取所选")}
            <BookmarkSimple />
          </button>
        </div>
      )}
    </Modal>
  );
}
