import { useEffect, useState } from "react";
import {
  Clock,
  DotsThree,
  Pause,
  PencilSimple,
  Play,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import {
  advisorById,
  legacyAdvisor,
  type AdvisorId,
} from "../../shared/advisor-contracts";
import type { Follow } from "../../shared/focus-search-contracts";
import { bridge } from "../bridge";
import { t, tf } from "../i18n";
import {
  Avatar,
  IconButton,
  Modal,
  ModalHeader,
  Time,
  advisorName,
} from "./ui";
import type { Workspace } from "./use-workspace";
import { ConfirmDialog, Feedback } from "./forms";

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
              <strong>{follow.schedule.time}</strong>
              <span>
                {t(
                  follow.schedule.cadence === "daily"
                    ? "每天"
                    : [
                        "每周日",
                        "每周一",
                        "每周二",
                        "每周三",
                        "每周四",
                        "每周五",
                        "每周六",
                      ][follow.schedule.weekday ?? 0],
                )}
              </span>
            </div>
            <div className="schedule-content">
              <span className="schedule-name">{follow.name}</span>
              <h2>{follow.question}</h2>
              <div className="schedule-recipients">
                {followAdvisors(follow).map((id) => (
                  <span className="member-chip selected" key={id}>
                    <Avatar id={id} small />
                    {advisorName(id)}
                  </span>
                ))}
              </div>
              <p>
                {follow.paused ? (
                  t("已暂停")
                ) : (
                  <>
                    {t("下次发送")} <Time value={follow.nextRunAt} />
                  </>
                )}
              </p>
            </div>
            <div className="schedule-actions">
              <IconButton
                label={t(follow.paused ? "恢复定时发送" : "暂停定时发送")}
                disabled={workspace.busy}
                onClick={() =>
                  void workspace.booleanAction(() =>
                    bridge.setFollowPaused(follow.followId, !follow.paused),
                  )
                }
              >
                {follow.paused ? <Play /> : <Pause />}
              </IconButton>
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
  const [cadence, setCadence] = useState<"daily" | "weekly">(
      value?.schedule.cadence ?? "daily",
    ),
    [time, setTime] = useState(value?.schedule.time ?? "09:00"),
    [weekday, setWeekday] = useState(value?.schedule.weekday ?? 1);
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
          const input = {
            name: name.trim() || undefined,
            question: question.trim(),
            advisorIds: selected,
            platforms: [
              ...new Set(selected.map((id) => advisorById(id).platform)),
            ],
            period: "all" as const,
            schedule: {
              cadence,
              time,
              ...(cadence === "weekly" ? { weekday } : {}),
            },
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
        <div className="schedule-config-row">
          <label className="config-field">
            <span>{t("重复")}</span>
            <select
              aria-label={t("重复")}
              value={cadence}
              onChange={(event) =>
                setCadence(event.target.value as "daily" | "weekly")
              }
            >
              <option value="daily">{t("每天")}</option>
              <option value="weekly">{t("每周")}</option>
            </select>
          </label>
          {cadence === "weekly" && (
            <label className="config-field">
              <span>{t("星期")}</span>
              <select
                aria-label={t("星期")}
                value={weekday}
                onChange={(event) => setWeekday(Number(event.target.value))}
              >
                {[
                  "星期日",
                  "星期一",
                  "星期二",
                  "星期三",
                  "星期四",
                  "星期五",
                  "星期六",
                ].map((label, index) => (
                  <option key={index} value={index}>
                    {t(label)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="config-field">
            <span>{t("发送时间")}</span>
            <input
              aria-label={t("发送时间")}
              type="time"
              required
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          </label>
        </div>
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
        <button
          type="submit"
          className="primary full-width"
          disabled={
            !selected.length || !question.trim() || !time || workspace.busy
          }
        >
          {t("保存定时消息")}
          <Clock />
        </button>
      </form>
    </Modal>
  );
}
