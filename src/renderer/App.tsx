import { useEffect, useState } from "react";
import {
  ArrowRight,
  BookmarkSimple,
  ChatCircle,
  Check,
  Clock,
  GearSix,
  LinkSimple,
  Plus,
  Users,
  X,
} from "@phosphor-icons/react";
import { advisorById, type AdvisorId } from "../shared/advisor-contracts";
import { sourceProfiles } from "../shared/source-profiles";
import type { Follow } from "../shared/focus-search-contracts";
import type { RecordDeletion, RecordRef } from "../shared/deletion-contracts";
import { bridge } from "./bridge";
import { t, tf, useLanguage } from "./i18n";
import {
  useApplicationUpdates,
  UpdateExperience,
  UpdateSettings,
} from "./components/ApplicationUpdates";
import { useWorkspace } from "./workspace/use-workspace";
import {
  Avatar,
  IconButton,
  Modal,
  ModalHeader,
  Time,
  advisorName,
  isRunning,
} from "./workspace/ui";
import { Members } from "./workspace/Members";
import { Composer, TopicCard, TopicThread } from "./workspace/Topics";
import { CollectLink, ReadingLibrary, ReadingView } from "./workspace/Reading";
import { ScheduleEditor, ScheduleList } from "./workspace/Schedules";
import { Settings, type SettingsSection } from "./workspace/Settings";
import "./workspace/workspace.css";
import "./workspace/settings.css";
import "./workspace/production.css";

type Page = "topics" | "reading" | "schedules" | "settings";
export function App() {
  useLanguage();
  const workspace = useWorkspace();
  const updates = useApplicationUpdates();
  const [page, setPage] = useState<Page>("topics"),
    [settingsSection, setSettingsSection] =
      useState<SettingsSection>("connections");
  const [memberOpen, setMemberOpen] = useState(false),
    [memberConnection, setMemberConnection] = useState<string>();
  const [recipients, setRecipients] = useState<AdvisorId[]>(),
    [filter, setFilter] = useState("all");
  const [topicId, setTopicId] = useState(""),
    [receipts, setReceipts] = useState(false),
    [readerId, setReaderId] = useState("");
  const [link, setLink] = useState<{ url?: string }>(),
    [schedule, setSchedule] = useState<{ value?: Follow }>();
  const [undo, setUndo] = useState<RecordDeletion[]>([]);
  const [pendingDelete, setPendingDelete] = useState<RecordRef>();
  const [seen, setSeen] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem("postrove.read-topics") || "{}");
    } catch {
      return {};
    }
  });
  const active = workspace.reports.find(
    (report) => report.reportId === topicId || report.taskId === topicId,
  );
  const reader = [
    ...workspace.content.reports,
    ...(workspace.content.partialReports ?? []),
  ].find((report) => report.taskId === readerId);
  const enabled = workspace.members?.enabled;
  useEffect(() => {
    workspace.setError("");
  }, [topicId, readerId, !!link, !!schedule, memberOpen, workspace.setError]);
  useEffect(() => {
    if (enabled)
      setRecipients((old) =>
        old ? old.filter((id) => enabled.includes(id)) : enabled,
      );
  }, [enabled?.join(",")]);
  useEffect(() => {
    if (!active) return;
    setSeen((old) => ({
      ...old,
      [active.reportId]: active.finishedAt || active.createdAt,
    }));
  }, [active?.reportId, active?.finishedAt]);
  useEffect(() => {
    localStorage.setItem("postrove.read-topics", JSON.stringify(seen));
  }, [seen]);
  useEffect(() => {
    if (!undo.length) return;
    const timer = setTimeout(
      () =>
        setUndo((old) =>
          old.filter((entry) => Date.parse(entry.expiresAt) > Date.now()),
        ),
      Math.max(
        0,
        Math.min(...undo.map((entry) => Date.parse(entry.expiresAt))) -
          Date.now(),
      ),
    );
    return () => clearTimeout(timer);
  }, [undo]);
  useEffect(() => {
    void bridge
      .recordDeletions()
      .then((reply) => {
        if (reply.ok) setUndo(reply.value);
      })
      .catch(() => {});
  }, []);
  const unread = (report: (typeof workspace.reports)[number]) =>
    !!report.finishedAt && seen[report.reportId] !== report.finishedAt;
  const reports = workspace.reports
    .filter((report) =>
      filter === "unread"
        ? unread(report)
        : filter === "scheduled"
          ? report.origin === "follow"
          : true,
    )
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const openMembers = (connectionId?: string) => {
    setMemberConnection(connectionId);
    setMemberOpen(true);
  };
  const openTopic = (id: string, receipt = false) => {
    setTopicId(id);
    setReceipts(receipt);
  };
  async function remove(ref: RecordRef) {
    const active =
      ref.kind === "search"
        ? isRunning(
            workspace.reports.find((report) => report.reportId === ref.id)
              ?.status,
          )
        : isRunning(
            workspace.content.tasks.find(
              (task) =>
                task.taskId ===
                [
                  ...workspace.content.reports,
                  ...(workspace.content.partialReports ?? []),
                ].find((item) => item.materialId === ref.id)?.taskId,
            )?.status,
          );
    if (active) {
      setPendingDelete(ref);
      return;
    }
    await performRemove(ref);
  }
  async function performRemove(ref: RecordRef) {
    const result = await workspace.run(() => bridge.deleteRecord(ref));
    if (result) {
      setUndo((old) => [...old, result]);
      setPendingDelete(undefined);
      if (ref.kind === "search") setTopicId("");
      if (ref.kind === "parsed") setReaderId("");
    }
  }
  const next = workspace.follows
    .filter((follow) => !follow.paused && follow.nextRunAt)
    .sort((a, b) => a.nextRunAt!.localeCompare(b.nextRunAt!))[0];
  const heading = t(
    {
      topics: "话题",
      reading: "阅读",
      schedules: "定时发送",
      settings: "设置",
    }[page],
  );
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <button
            className="brand"
            aria-label={t("Postrove 话题首页")}
            onClick={() => setPage("topics")}
          >
            <span className="brand-symbol" aria-hidden="true">
              <img src="../assets/postrove-mark.svg" alt="" />
            </span>
            <span>
              postrove<span className="brand-dot">.</span>
            </span>
          </button>
          <nav className="main-nav" aria-label={t("主导航")}>
            {(
              [
                { id: "topics", label: "话题", icon: ChatCircle },
                { id: "reading", label: "阅读", icon: BookmarkSimple },
                { id: "schedules", label: "定时发送", icon: Clock },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                className={page === id ? "active" : ""}
                aria-current={page === id ? "page" : undefined}
                onClick={() => setPage(id)}
              >
                <Icon weight={page === id ? "fill" : "regular"} />
                {t(label)}
              </button>
            ))}
          </nav>
          <div className="top-actions">
            <IconButton label={t("管理成员")} onClick={() => openMembers()}>
              <Users />
            </IconButton>
            <IconButton
              label={t("设置")}
              className={page === "settings" ? "active" : ""}
              onClick={() => setPage("settings")}
            >
              <GearSix />
            </IconButton>
          </div>
        </div>
      </header>
      <main className={`page ${page !== "topics" ? "one-column" : ""}`}>
        <section className="main-column">
          <div className="page-heading">
            <div>
              <h1>{heading}</h1>
              {page !== "settings" && (
                <span className="heading-count">
                  {page === "topics"
                    ? workspace.reports.length
                    : page === "schedules"
                      ? workspace.follows.length
                      : workspace.content.reports.length +
                        (workspace.content.partialReports?.length ?? 0)}
                </span>
              )}
            </div>
            {page === "topics" ? (
              <div className="filter-tabs">
                {[
                  { id: "all", label: "全部" },
                  { id: "unread", label: "未读" },
                  { id: "scheduled", label: "定时" },
                ].map((item) => (
                  <button
                    key={item.id}
                    className={filter === item.id ? "on" : ""}
                    aria-pressed={filter === item.id}
                    onClick={() => setFilter(item.id)}
                  >
                    {t(item.label)}
                  </button>
                ))}
              </div>
            ) : page === "reading" ? (
              <button className="primary" onClick={() => setLink({})}>
                <Plus />
                {t("添加链接")}
              </button>
            ) : page === "schedules" ? (
              <button className="primary" onClick={() => setSchedule({})}>
                <Plus />
                {t("新建定时消息")}
              </button>
            ) : null}
          </div>
          {workspace.error && !link && !schedule && (
            <div className="workspace-error" role="alert">
              <span>{workspace.error}</span>
              <button
                className="text-button"
                onClick={() => void workspace.refresh()}
              >
                {t("重试")}
              </button>
              <IconButton
                label={t("关闭")}
                onClick={() => workspace.setError("")}
              >
                <X />
              </IconButton>
            </div>
          )}
          {page === "topics" && (
            <>
              <Composer
                workspace={workspace}
                selected={recipients ?? []}
                onSelected={setRecipients}
                onMembers={() => openMembers()}
                onLink={(url) => setLink({ url })}
                onSent={(id) => openTopic(id)}
              />
              <div className="topic-feed" aria-label={t("话题列表")}>
                {reports.map((report) => (
                  <TopicCard
                    key={report.reportId}
                    report={report}
                    unread={unread(report)}
                    onOpen={(receipts) => openTopic(report.reportId, receipts)}
                  />
                ))}
                {workspace.loading && (
                  <div className="loading-state" role="status">
                    {t("载入中…")}
                  </div>
                )}
                {!workspace.loading && !reports.length && (
                  <div className="empty-state">
                    <ChatCircle />
                    <h2>
                      {t(
                        filter === "unread"
                          ? "未读话题都看完了"
                          : filter === "scheduled"
                            ? "还没有定时话题"
                            : "发起第一个话题",
                      )}
                    </h2>
                  </div>
                )}
              </div>
            </>
          )}
          {page === "reading" && (
            <ReadingLibrary
              workspace={workspace}
              onOpen={setReaderId}
              onDelete={(id) => void remove({ kind: "parsed", id })}
            />
          )}
          {page === "schedules" && (
            <ScheduleList
              workspace={workspace}
              onEdit={(value) => setSchedule({ value })}
            />
          )}
          {page === "settings" && (
            <Settings
              workspace={workspace}
              section={settingsSection}
              onSection={setSettingsSection}
              onMember={openMembers}
              onReading={() => setPage("reading")}
              updateSection={
                <UpdateSettings
                  updates={updates}
                  onTasks={() => {
                    const job = updates.view?.jobs[0];
                    if (job?.kind === "search") openTopic(job.id, true);
                    else if (job) setReaderId(job.id);
                  }}
                  onLater={() => setPage("topics")}
                />
              }
            />
          )}
        </section>
        {page === "topics" && (
          <aside className="side-column">
            <section className="members-aside">
              <div className="section-title">
                <h2>{t("我的成员")}</h2>
                <IconButton label={t("添加成员")} onClick={() => openMembers()}>
                  <Plus />
                </IconButton>
              </div>
              {enabled?.map((id) => (
                <button
                  className="aside-person"
                  key={id}
                  onClick={() => openMembers(advisorById(id).connectionId)}
                >
                  <Avatar id={id} />
                  <span>
                    <strong>{advisorName(id)}</strong>
                    <small>
                      {t(sourceProfiles[advisorById(id).platform].name)}
                    </small>
                  </span>
                  <span className="member-presence" />
                </button>
              ))}
              {enabled && !enabled.length && (
                <button className="aside-add" onClick={() => openMembers()}>
                  <Plus />
                  {t("添加成员")}
                </button>
              )}
            </section>
            <section className="schedule-aside">
              <div className="section-title">
                <h2>{t("下次发送")}</h2>
                <IconButton
                  label={t("新建定时消息")}
                  onClick={() => setSchedule({})}
                >
                  <Plus />
                </IconButton>
              </div>
              {next ? (
                <button
                  className="next-schedule"
                  onClick={() => setSchedule({ value: next })}
                >
                  <span>
                    <Clock />
                    <Time value={next.nextRunAt!} />
                  </span>
                  <strong>{next.question}</strong>
                  <ArrowRight />
                </button>
              ) : (
                <button className="aside-add" onClick={() => setSchedule({})}>
                  <Clock />
                  {t("定时发送一条消息")}
                </button>
              )}
            </section>
            <button className="collect-shortcut" onClick={() => setLink({})}>
              <span>
                <LinkSimple />
              </span>
              <strong>{t("添加链接")}</strong>
              <ArrowRight />
            </button>
          </aside>
        )}
      </main>
      {active && (
        <TopicThread
          workspace={workspace}
          report={active}
          initialReceipts={receipts}
          onClose={() => setTopicId("")}
          onRead={setReaderId}
          onDelete={() => void remove({ kind: "search", id: active.reportId })}
        />
      )}
      {reader && (
        <ReadingView
          workspace={workspace}
          report={reader}
          onClose={() => setReaderId("")}
        />
      )}
      {memberOpen && (
        <Members
          workspace={workspace}
          initial={memberConnection}
          onClose={() => setMemberOpen(false)}
        />
      )}
      {link && (
        <CollectLink
          workspace={workspace}
          initial={link.url}
          onClose={() => setLink(undefined)}
          onAdded={() => {
            setLink(undefined);
            setPage("reading");
          }}
          onConnections={() => {
            setLink(undefined);
            setSettingsSection("connections");
            setPage("settings");
          }}
        />
      )}
      {schedule && (
        <ScheduleEditor
          workspace={workspace}
          value={schedule.value}
          onMembers={() => {
            setMemberConnection(undefined);
            setMemberOpen(true);
          }}
          onClose={() => setSchedule(undefined)}
        />
      )}
      {pendingDelete && (
        <Modal
          label={t("停止并删除")}
          className="compact-modal"
          onClose={() => setPendingDelete(undefined)}
        >
          <ModalHeader
            title={t("停止并删除")}
            onClose={() => setPendingDelete(undefined)}
          />
          <div className="compact-body">
            <div className="config-actions">
              <button
                className="secondary"
                onClick={() => setPendingDelete(undefined)}
              >
                {t("保留记录")}
              </button>
              <button
                className="primary"
                disabled={workspace.busy}
                onClick={() => void performRemove(pendingDelete)}
              >
                {t("停止并删除")}
              </button>
            </div>
          </div>
        </Modal>
      )}
      <div className="toast-stack">
        {undo.map((entry) => (
          <div className="toast" role="status" key={entry.operationId}>
            <Check />
            {t("已删除")}
            <button
              className="text-button"
              onClick={async () => {
                if (
                  await workspace.booleanAction(() =>
                    bridge.undoDeletion(entry.operationId),
                  )
                )
                  setUndo((old) =>
                    old.filter(
                      (item) => item.operationId !== entry.operationId,
                    ),
                  );
              }}
            >
              {t("撤销")}
            </button>
          </div>
        ))}
      </div>
      <UpdateExperience
        updates={updates}
        onOpen={() => {
          setSettingsSection("about");
          setPage("settings");
        }}
      />
    </>
  );
}
