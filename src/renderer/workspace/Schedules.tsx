import { useEffect, useState } from "react";
import { Clock, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import {
  advisorById,
  legacyAdvisor,
  type AdvisorId,
} from "../../shared/advisor-contracts";
import type { Follow } from "../../shared/focus-search-contracts";
import { bridge } from "../bridge";
import { t, tf, useLanguage } from "../i18n";
import { Avatar, IconButton, Modal, ModalHeader, advisorName } from "./ui";
import type { Workspace } from "./use-workspace";
import { ConfirmDialog, Feedback } from "./forms";
import { normalizeSchedule, scheduleOccurrences } from "../../shared/schedules";
import {
  ScheduleFields,
  cadenceNames,
  parseScheduleDraft,
  scheduleDraft,
  scheduleSummary,
} from "./ScheduleFields";

export const followAdvisors = (follow: Follow) =>
  follow.advisorIds ??
  follow.platforms.map((platform) => legacyAdvisor(platform));
export function ScheduleList({
  workspace,
  onEdit,
}: {
  workspace: Workspace;
  onEdit(follow: Follow): void;
}) {
  const [confirm, setConfirm] = useState<Follow>();
  const language = useLanguage();
  return (
    <>
      <div className="schedule-list">
        {workspace.follows.map((follow) => (
          <article
            className={`schedule-card ${follow.paused ? "paused" : ""}`}
            key={follow.followId}
          >
            <div className="schedule-time">
              <Clock weight="duotone" />
              <strong>{normalizeSchedule(follow.schedule).times[0]}</strong>
              <span>{t(cadenceNames[follow.schedule.cadence])}</span>
            </div>
            <div className="schedule-content">
              <span className="schedule-name">{follow.name}</span>
              <h2>{follow.question}</h2>
              <p className="schedule-rule-summary">
                {scheduleSummary(follow.schedule)}
              </p>
              <div className="schedule-recipients">
                {followAdvisors(follow).map((id) => (
                  <span className="member-chip selected" key={id}>
                    <Avatar id={id} small />
                    {advisorName(id)}
                  </span>
                ))}
              </div>
              <p>
                {!follow.nextRunAt ? (
                  t("已结束")
                ) : follow.paused ? (
                  t("已暂停")
                ) : (
                  <>
                    {t("下次发送")}{" "}
                    <time dateTime={follow.nextRunAt}>
                      {new Intl.DateTimeFormat(language, {
                        timeZone: normalizeSchedule(follow.schedule).timeZone,
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        hourCycle: "h23",
                      }).format(new Date(follow.nextRunAt))}
                    </time>
                  </>
                )}
              </p>
              <span className="schedule-zone">
                {normalizeSchedule(follow.schedule).timeZone}
              </span>
            </div>
            <div className="schedule-actions">
              <input
                type="checkbox"
                role="switch"
                className="schedule-switch"
                aria-label={t(follow.paused ? "恢复定时发送" : "暂停定时发送")}
                checked={!follow.paused && !!follow.nextRunAt}
                disabled={workspace.busy || !follow.nextRunAt}
                onChange={() =>
                  void workspace.booleanAction(() =>
                    bridge.setFollowPaused(follow.followId, !follow.paused),
                  )
                }
              />
              <IconButton
                label={t("编辑定时消息")}
                onClick={() => onEdit(follow)}
              >
                <PencilSimple />
              </IconButton>
              <IconButton
                label={t("删除定时消息")}
                onClick={() => setConfirm(follow)}
              >
                <Trash />
              </IconButton>
            </div>
          </article>
        ))}
      </div>
      {!workspace.loading && !workspace.follows.length && (
        <div className="empty-state">
          <Clock />
          <h2>{t("还没有定时消息")}</h2>
        </div>
      )}
      {confirm && (
        <ConfirmDialog
          title={t("删除定时消息")}
          confirmLabel={t("删除")}
          busy={workspace.busy}
          error={workspace.error}
          onClose={() => setConfirm(undefined)}
          onConfirm={async () => {
            if (
              await workspace.booleanAction(() =>
                bridge.deleteFollow(confirm.followId),
              )
            )
              setConfirm(undefined);
          }}
        >
          {confirm.name}
        </ConfirmDialog>
      )}
    </>
  );
}
export function ScheduleEditor({
  workspace,
  value,
  onClose,
  onMembers,
}: {
  workspace: Workspace;
  value?: Follow;
  onClose(): void;
  onMembers(): void;
}) {
  const [name, setName] = useState(value?.name ?? ""),
    [question, setQuestion] = useState(value?.question ?? "");
  const [selected, setSelected] = useState<AdvisorId[]>(
    value
      ? followAdvisors(value).filter((id) =>
          workspace.members?.enabled.includes(id),
        )
      : (workspace.members?.enabled ?? []),
  );
  useEffect(() => {
    if (workspace.members)
      setSelected((old) =>
        old.filter((id) => workspace.members!.enabled.includes(id)),
      );
  }, [workspace.members?.enabled.join(",")]);
  const [draft, setDraft] = useState(() => scheduleDraft(value?.schedule));
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const parsed = parseScheduleDraft(draft);
  const valid =
    parsed.success && scheduleOccurrences(parsed.data, now).length > 0;
  return (
    <Modal
      label={t(value ? "编辑定时消息" : "新建定时消息")}
      className="compact-modal schedule-editor"
      onClose={onClose}
    >
      <ModalHeader
        title={t(value ? "编辑定时消息" : "新建定时消息")}
        onClose={onClose}
      />
      <form
        className="compact-body"
        onSubmit={async (event) => {
          event.preventDefault();
          if (
            !parsed.success ||
            !scheduleOccurrences(parsed.data, new Date()).length
          )
            return;
          const input = {
            name: name.trim() || undefined,
            question: question.trim(),
            advisorIds: selected,
            platforms: [
              ...new Set(selected.map((id) => advisorById(id).platform)),
            ],
            period: "all" as const,
            schedule: parsed.data,
          };
          const result = await workspace.run(() =>
            value
              ? bridge.updateFollow({ ...input, followId: value.followId })
              : bridge.saveFollow(input),
          );
          if (result) onClose();
        }}
      >
        {workspace.error && <Feedback error>{workspace.error}</Feedback>}
        <div className="schedule-editor-columns">
          <div className="schedule-message-fields">
            <label className="config-field">
              <span>{t("名称")}</span>
              <input
                aria-label={t("名称")}
                maxLength={200}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="config-field">
              <span>{t("消息内容")}</span>
              <textarea
                aria-label={t("消息内容")}
                required
                rows={4}
                maxLength={10000}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
              />
            </label>
            <fieldset className="recipient-field">
              <legend>{t("接收成员")}</legend>
              {!workspace.members?.enabled.length && (
                <button type="button" className="secondary" onClick={onMembers}>
                  <Plus />
                  {t("管理成员")}
                </button>
              )}
              <div className="recipient-chips">
                {workspace.members?.enabled.map((id) => (
                  <button
                    type="button"
                    key={id}
                    className={`member-chip ${selected.includes(id) ? "selected" : ""}`}
                    aria-pressed={selected.includes(id)}
                    onClick={() =>
                      setSelected((old) =>
                        old.includes(id)
                          ? old.filter((other) => other !== id)
                          : [...old, id],
                      )
                    }
                  >
                    <Avatar id={id} small />
                    {advisorName(id)}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>
          <ScheduleFields
            draft={draft}
            onChange={(patch) => setDraft((old) => ({ ...old, ...patch }))}
            now={now}
          />
        </div>
        <div className="schedule-editor-actions">
          <button type="button" className="secondary" onClick={onClose}>
            {t("取消")}
          </button>
          <button
            type="submit"
            className="primary"
            disabled={
              !selected.length || !question.trim() || !valid || workspace.busy
            }
          >
            {t("保存定时消息")}
            <Clock />
          </button>
        </div>
      </form>
    </Modal>
  );
}
