import { Plus, X } from "@phosphor-icons/react";
import type {
  FollowSchedule,
  RecurrenceSchedule,
} from "../../shared/schedule-contracts";
import { recurrenceScheduleSchema } from "../../shared/schedule-contracts";
import {
  normalizeSchedule,
  scheduleDate,
  scheduleOccurrences,
} from "../../shared/schedules";
import { t, tf, useLanguage } from "../i18n";
import { IconButton } from "./ui";

export const weekdays = [
  "星期日",
  "星期一",
  "星期二",
  "星期三",
  "星期四",
  "星期五",
  "星期六",
];
const shortDays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
export const cadenceNames = {
  once: "仅一次",
  daily: "每天",
  weekly: "每周",
  monthly: "每月",
  interval: "固定间隔",
};
export type ScheduleDraft = {
  cadence: RecurrenceSchedule["cadence"];
  times: string[];
  timeZone: string;
  startDate: string;
  endDate: string;
  interval: number;
  weekdays: number[];
  monthMode: "day" | "weekday";
  monthDay: string;
  ordinal: 1 | 2 | 3 | 4 | -1;
  monthWeekday: number;
  fixedInterval: number;
  unit: "hours" | "minutes";
};
export function scheduleDraft(input?: FollowSchedule): ScheduleDraft {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const s = input ? normalizeSchedule(input) : undefined;
  return {
    cadence: s?.cadence ?? "weekly",
    times: s?.times ?? ["09:00"],
    timeZone: s?.timeZone ?? zone,
    startDate: s?.startDate ?? scheduleDate(new Date(), zone),
    endDate: s?.endDate ?? "",
    interval:
      s && ["daily", "weekly", "monthly"].includes(s.cadence) && "interval" in s
        ? s.interval
        : 1,
    weekdays: s?.cadence === "weekly" ? s.weekdays : [1, 2, 3, 4, 5],
    monthMode: s?.cadence === "monthly" ? s.monthly.kind : "day",
    monthDay:
      s?.cadence === "monthly" && s.monthly.kind === "day"
        ? String(s.monthly.day)
        : "1",
    ordinal:
      s?.cadence === "monthly" && s.monthly.kind === "weekday"
        ? s.monthly.ordinal
        : 1,
    monthWeekday:
      s?.cadence === "monthly" && s.monthly.kind === "weekday"
        ? s.monthly.weekday
        : 1,
    fixedInterval: s?.cadence === "interval" ? s.interval : 2,
    unit: s?.cadence === "interval" ? s.unit : "hours",
  };
}
export function parseScheduleDraft(d: ScheduleDraft) {
  const common = {
    version: 2,
    cadence: d.cadence,
    timeZone: d.timeZone,
    startDate: d.startDate,
    ...(d.endDate && d.cadence !== "once" ? { endDate: d.endDate } : {}),
    times: ["once", "interval"].includes(d.cadence)
      ? d.times.slice(0, 1)
      : [...d.times].sort(),
  };
  return recurrenceScheduleSchema.safeParse({
    ...common,
    ...(["daily", "weekly", "monthly"].includes(d.cadence)
      ? { interval: d.interval }
      : {}),
    ...(d.cadence === "weekly" ? { weekdays: [...d.weekdays].sort() } : {}),
    ...(d.cadence === "monthly"
      ? {
          monthly:
            d.monthMode === "day"
              ? {
                  kind: "day",
                  day: d.monthDay === "last" ? "last" : Number(d.monthDay),
                }
              : {
                  kind: "weekday",
                  ordinal: d.ordinal,
                  weekday: d.monthWeekday,
                },
        }
      : {}),
    ...(d.cadence === "interval"
      ? { interval: d.fixedInterval, unit: d.unit }
      : {}),
  });
}
export function scheduleSummary(input: FollowSchedule): string {
  const s = normalizeSchedule(input);
  let label = "";
  if (s.cadence === "once") label = s.startDate;
  if (s.cadence === "daily")
    label = s.interval === 1 ? t("每天") : tf("每 {0} 天", s.interval);
  if (s.cadence === "weekly") {
    const sorted = [...s.weekdays].sort(
      (a, b) => ((a + 6) % 7) - ((b + 6) % 7),
    );
    const days =
      sorted.length === 7
        ? t("每天")
        : sorted.join() === "1,2,3,4,5"
          ? t("周一至周五")
          : sorted.join() === "6,0"
            ? t("周末")
            : sorted.map((day) => t(shortDays[day])).join(t("、"));
    label =
      s.interval === 1 ? days : `${tf("每 {0} 周", s.interval)} · ${days}`;
  }
  if (s.cadence === "monthly") {
    const rule =
      s.monthly.kind === "day"
        ? s.monthly.day === "last"
          ? t("月末")
          : tf("{0} 日", s.monthly.day)
        : `${t({ 1: "第一个", 2: "第二个", 3: "第三个", 4: "第四个", [-1]: "最后一个" }[s.monthly.ordinal])} ${t(weekdays[s.monthly.weekday])}`;
    label = `${s.interval === 1 ? t("每月") : tf("每 {0} 个月", s.interval)} · ${rule}`;
  }
  if (s.cadence === "interval")
    return tf(s.unit === "hours" ? "每 {0} 小时" : "每 {0} 分钟", s.interval);
  return `${label} · ${[...s.times].sort().join(" / ")}`;
}
export function scheduleDraftError(d: ScheduleDraft): string {
  const times = ["once", "interval"].includes(d.cadence)
    ? d.times.slice(0, 1)
    : d.times;
  if (times.some((value) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)))
    return t("请填写有效的发送时间");
  if (new Set(times).size !== times.length) return t("发送时间重复，请调整");
  if (d.cadence === "weekly" && !d.weekdays.length) return t("请选择发送星期");
  if (d.cadence !== "once" && d.endDate && d.endDate < d.startDate)
    return t("结束日期应在开始日期当日或之后");
  return t("请填写有效的日期、时区和重复间隔");
}
const timeZones = [
  ...new Set([
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    "Asia/Shanghai",
    "Asia/Tokyo",
    "America/Los_Angeles",
    "Europe/London",
    "UTC",
    ...Intl.supportedValuesOf("timeZone"),
  ]),
];

export function ScheduleFields({
  draft: d,
  onChange,
  now,
}: {
  draft: ScheduleDraft;
  onChange(patch: Partial<ScheduleDraft>): void;
  now: Date;
}) {
  const language = useLanguage();
  const parsed = parseScheduleDraft(d);
  const next = parsed.success ? scheduleOccurrences(parsed.data, now) : [];
  const error = !parsed.success
    ? scheduleDraftError(d)
    : !next.length
      ? t("此规则已没有未来发送时间，请调整日期或重复规则")
      : "";
  const single = ["once", "interval"].includes(d.cadence);
  const every = (label: string, unit: string) => (
    <div className="schedule-every">
      <span>{t("每")}</span>
      <input
        type="number"
        aria-label={t(label)}
        min={1}
        max={52}
        value={d.interval || ""}
        onChange={(e) => onChange({ interval: Number(e.target.value) })}
      />
      <span>{tf(unit, d.interval)}</span>
    </div>
  );
  return (
    <section className="schedule-rules">
      <div className="config-field schedule-time-field">
        <span>{t(d.cadence === "interval" ? "起算时间" : "发送时间")}</span>
        <div className="schedule-times">
          {(single ? d.times.slice(0, 1) : d.times).map((time, index) => (
            <div className="schedule-time-input" key={index}>
              <input
                type="time"
                aria-label={
                  d.cadence === "interval"
                    ? t("起算时间")
                    : index === 0
                      ? t("发送时间")
                      : tf("发送时间 {0}", index + 1)
                }
                required
                value={time}
                onChange={(e) =>
                  onChange({
                    times: d.times.map((old, i) =>
                      i === index ? e.target.value : old,
                    ),
                  })
                }
              />
              {!single && d.times.length > 1 && (
                <IconButton
                  label={tf("移除时间 {0}", index + 1)}
                  onClick={() =>
                    onChange({ times: d.times.filter((_, i) => i !== index) })
                  }
                >
                  <X />
                </IconButton>
              )}
            </div>
          ))}
          {!single && d.times.length < 6 && (
            <button
              type="button"
              className="schedule-add-time text-button"
              onClick={() =>
                onChange({
                  times: [
                    ...d.times,
                    [
                      "09:00",
                      "12:00",
                      "18:00",
                      "21:00",
                      "07:00",
                      "15:00",
                      "10:00",
                    ].find((time) => !d.times.includes(time))!,
                  ],
                })
              }
            >
              <Plus />
              {t("添加时间")}
            </button>
          )}
        </div>
      </div>
      <label className="config-field">
        <span>{t("重复")}</span>
        <select
          aria-label={t("重复")}
          value={d.cadence}
          onChange={(e) =>
            onChange({ cadence: e.target.value as ScheduleDraft["cadence"] })
          }
        >
          {Object.entries(cadenceNames).map(([value, label]) => (
            <option key={value} value={value}>
              {t(label)}
            </option>
          ))}
        </select>
      </label>
      {d.cadence === "once" && (
        <label className="config-field">
          <span>{t("日期")}</span>
          <input
            aria-label={t("日期")}
            type="date"
            value={d.startDate}
            required
            onChange={(e) => onChange({ startDate: e.target.value })}
          />
        </label>
      )}
      {d.cadence === "daily" && every("重复天数", "天")}
      {d.cadence === "weekly" && (
        <div className="schedule-weekly">
          <div className="schedule-weekdays">
            {[1, 2, 3, 4, 5, 6, 0].map((day) => (
              <button
                type="button"
                key={day}
                aria-label={t(weekdays[day])}
                aria-pressed={d.weekdays.includes(day)}
                onClick={() =>
                  onChange({
                    weekdays: d.weekdays.includes(day)
                      ? d.weekdays.filter((x) => x !== day)
                      : [...d.weekdays, day],
                  })
                }
              >
                {t(["日", "一", "二", "三", "四", "五", "六"][day])}
              </button>
            ))}
          </div>
          <div className="schedule-presets">
            {[
              ["每天", [0, 1, 2, 3, 4, 5, 6]],
              ["周一至周五", [1, 2, 3, 4, 5]],
              ["周末", [0, 6]],
            ].map(([label, days]) => (
              <button
                type="button"
                key={String(label)}
                aria-pressed={
                  [...d.weekdays].sort().join() ===
                  [...(days as number[])].sort().join()
                }
                onClick={() => onChange({ weekdays: days as number[] })}
              >
                {t(label as string)}
              </button>
            ))}
          </div>
          {every("重复周数", "周")}
        </div>
      )}
      {d.cadence === "monthly" && (
        <div className="schedule-monthly">
          {every("重复月数", "个月")}
          <label className="config-field">
            <span>{t("按")}</span>
            <select
              aria-label={t("按")}
              value={d.monthMode}
              onChange={(e) =>
                onChange({
                  monthMode: e.target.value as ScheduleDraft["monthMode"],
                })
              }
            >
              <option value="day">{t("日期")}</option>
              <option value="weekday">{t("第几个星期")}</option>
            </select>
          </label>
          {d.monthMode === "day" ? (
            <label className="config-field">
              <span>{t("每月日期")}</span>
              <select
                aria-label={t("每月日期")}
                value={d.monthDay}
                onChange={(e) => onChange({ monthDay: e.target.value })}
              >
                {Array.from({ length: 31 }, (_, i) => (
                  <option key={i} value={i + 1}>
                    {tf("{0} 日", i + 1)}
                  </option>
                ))}
                <option value="last">{t("月末")}</option>
              </select>
            </label>
          ) : (
            <div className="schedule-month-position">
              <label className="config-field">
                <span>{t("第几个星期")}</span>
                <select
                  aria-label={t("第几个星期")}
                  value={d.ordinal}
                  onChange={(e) =>
                    onChange({
                      ordinal: Number(
                        e.target.value,
                      ) as ScheduleDraft["ordinal"],
                    })
                  }
                >
                  {[
                    [1, "第一个"],
                    [2, "第二个"],
                    [3, "第三个"],
                    [4, "第四个"],
                    [-1, "最后一个"],
                  ].map(([value, label]) => (
                    <option key={value} value={value}>
                      {t(String(label))}
                    </option>
                  ))}
                </select>
              </label>
              <label className="config-field">
                <span>{t("星期")}</span>
                <select
                  aria-label={t("星期")}
                  value={d.monthWeekday}
                  onChange={(e) =>
                    onChange({ monthWeekday: Number(e.target.value) })
                  }
                >
                  {[1, 2, 3, 4, 5, 6, 0].map((day) => (
                    <option key={day} value={day}>
                      {t(weekdays[day])}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {d.monthMode === "day" && Number(d.monthDay) >= 29 && (
            <p className="schedule-hint">{t("缺少该日期的月份跳过")}</p>
          )}
        </div>
      )}
      {d.cadence === "interval" && (
        <div className="schedule-every">
          <span>{t("每")}</span>
          <input
            type="number"
            min={1}
            max={1440}
            aria-label={t("重复间隔")}
            value={d.fixedInterval || ""}
            onChange={(e) =>
              onChange({ fixedInterval: Number(e.target.value) })
            }
          />
          <select
            aria-label={t("间隔单位")}
            value={d.unit}
            onChange={(e) =>
              onChange({ unit: e.target.value as ScheduleDraft["unit"] })
            }
          >
            <option value="hours">{tf("小时", d.fixedInterval)}</option>
            <option value="minutes">{tf("分钟", d.fixedInterval)}</option>
          </select>
        </div>
      )}
      <details className="schedule-more">
        <summary>{t("更多设置")}</summary>
        <label className="config-field">
          <span>{t("时区")}</span>
          <select
            aria-label={t("时区")}
            value={d.timeZone}
            onChange={(e) => onChange({ timeZone: e.target.value })}
          >
            {[...new Set([d.timeZone, ...timeZones])].map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </label>
        {d.cadence !== "once" && (
          <div className="schedule-date-bounds">
            <label className="config-field">
              <span>{t("开始日期")}</span>
              <input
                type="date"
                aria-label={t("开始日期")}
                required
                value={d.startDate}
                onChange={(e) => onChange({ startDate: e.target.value })}
              />
            </label>
            <label className="config-field">
              <span>{t("结束日期（可选）")}</span>
              <input
                type="date"
                aria-label={t("结束日期（可选）")}
                value={d.endDate}
                onChange={(e) => onChange({ endDate: e.target.value })}
              />
            </label>
          </div>
        )}
      </details>
      <div className="schedule-preview" aria-live="polite">
        {parsed.success && <strong>{scheduleSummary(parsed.data)}</strong>}
        <span>{t("接下来发送")}</span>
        {next.map((value) => (
          <time key={value} dateTime={value}>
            {new Intl.DateTimeFormat(language, {
              timeZone: d.timeZone,
              year: "numeric",
              month: "short",
              day: "numeric",
              weekday: "short",
              hour: "2-digit",
              minute: "2-digit",
              hourCycle: "h23",
            }).format(new Date(value))}
          </time>
        ))}
        <small>{d.timeZone}</small>
        {error && (
          <p className="schedule-validation" role="alert">
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
