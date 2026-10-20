import type { FollowSchedule, RecurrenceSchedule } from "./schedule-contracts";

const formatters = new Map<string, Intl.DateTimeFormat>();
function parts(epoch: number, zone: string) {
  if (!formatters.has(zone)) {
    if (formatters.size >= 64) formatters.clear();
    formatters.set(
      zone,
      new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }),
    );
  }
  return Object.fromEntries(
    formatters
      .get(zone)!
      .formatToParts(epoch)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  );
}
export function scheduleDate(epoch: Date | number, zone: string): string {
  const p = parts(Number(epoch), zone);
  return `${p.year}-${p.month}-${p.day}`;
}
export function normalizeSchedule(
  schedule: FollowSchedule,
  anchor = new Date(),
): RecurrenceSchedule {
  if ("version" in schedule) return schedule;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const common = {
    version: 2 as const,
    timeZone,
    startDate: scheduleDate(anchor, timeZone),
    times: [schedule.time],
    interval: 1,
  };
  return schedule.cadence === "weekly"
    ? { ...common, cadence: "weekly", weekdays: [schedule.weekday!] }
    : { ...common, cadence: "daily" };
}
const addDays = (date: string, days: number) =>
  new Date(Date.parse(date + "T00:00:00Z") + days * 86400000)
    .toISOString()
    .split("T")[0];
const dayDiff = (a: string, b: string) =>
  Math.round(
    (Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86400000,
  );
const weekday = (date: string) => new Date(date + "T00:00:00Z").getUTCDay();
const monday = (date: string) => addDays(date, -((weekday(date) + 6) % 7));

// Skip missing wall times; consume the first instant when a clock hour repeats.
export function scheduleWallTime(
  date: string,
  time: string,
  zone: string,
): number | null {
  const target = Date.parse(date + "T" + time + ":00Z");
  const offsets = new Set<number>();
  for (const shift of [-86400000, 0, 86400000]) {
    const p = parts(target + shift, zone);
    offsets.add(
      Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`) -
        (target + shift),
    );
  }
  return (
    [...offsets]
      .map((offset) => target - offset)
      .filter((epoch) => {
        const p = parts(epoch, zone);
        return (
          `${p.year}-${p.month}-${p.day}` === date &&
          `${p.hour}:${p.minute}` === time
        );
      })
      .sort((a, b) => a - b)[0] ?? null
  );
}

/** Strictly future occurrences; calendar rules retain the saved zone and anchor. */
export function scheduleOccurrences(
  input: FollowSchedule,
  after: Date,
  count = 3,
): string[] {
  const s = normalizeSchedule(input, after),
    result: number[] = [];
  const limit = Math.min(10, Math.max(0, Math.floor(count)));
  if (!limit || !Number.isFinite(after.getTime())) return [];
  const include = (epoch: number | null): epoch is number =>
    epoch !== null &&
    epoch > after.getTime() &&
    (!s.endDate || scheduleDate(epoch, s.timeZone) <= s.endDate);
  if (s.cadence === "once") {
    const epoch = scheduleWallTime(s.startDate, s.times[0], s.timeZone);
    return include(epoch) ? [new Date(epoch).toISOString()] : [];
  }
  if (s.cadence === "interval") {
    const anchor = scheduleWallTime(s.startDate, s.times[0], s.timeZone);
    if (anchor === null) return [];
    const gap = s.interval * (s.unit === "hours" ? 3600000 : 60000);
    const first =
      anchor +
      Math.max(0, Math.floor((after.getTime() - anchor) / gap) + 1) * gap;
    for (let i = 0; i < limit; i++) {
      const epoch = first + i * gap;
      if (include(epoch)) result.push(epoch);
    }
    return result.map((epoch) => new Date(epoch).toISOString());
  }
  const first = [s.startDate, scheduleDate(after, s.timeZone)].sort().at(-1)!;
  const times = [...s.times].sort();
  const dates = function* () {
    if (s.cadence === "daily") {
      let date = addDays(
        s.startDate,
        Math.max(0, Math.ceil(dayDiff(first, s.startDate) / s.interval)) *
          s.interval,
      );
      while (date.length === 10) {
        yield date;
        date = addDays(date, s.interval);
      }
    } else if (s.cadence === "weekly") {
      const anchor = monday(s.startDate);
      let week = addDays(
        anchor,
        Math.max(
          0,
          Math.floor(dayDiff(monday(first), anchor) / (7 * s.interval)),
        ) *
          7 *
          s.interval,
      );
      const offsets = s.weekdays
        .map((day) => (day + 6) % 7)
        .sort((a, b) => a - b);
      while (week.length === 10) {
        for (const offset of offsets) {
          const date = addDays(week, offset);
          if (date.length === 10 && date >= first) yield date;
        }
        week = addDays(week, 7 * s.interval);
      }
    } else if (s.cadence === "monthly") {
      const monthIndex = (date: string) =>
        Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7)) - 1;
      const anchor = monthIndex(s.startDate);
      let month =
        anchor +
        Math.max(0, Math.ceil((monthIndex(first) - anchor) / s.interval)) *
          s.interval;
      // Gregorian month patterns repeat after 4,800 months. A full cycle
      // also terminates impossible rules such as February 31 every 12 months.
      let emptyMonths = 0;
      while (month < 10000 * 12 && emptyMonths < 4800) {
        const year = Math.floor(month / 12),
          monthNumber = (month % 12) + 1;
        const prefix = `${String(year).padStart(4, "0")}-${String(monthNumber).padStart(2, "0")}`;
        const end = new Date(prefix + "-01T00:00:00Z");
        end.setUTCMonth(end.getUTCMonth() + 1, 0);
        const last = end.getUTCDate();
        const rule = s.monthly;
        const day =
          rule.kind === "day"
            ? rule.day === "last"
              ? last
              : rule.day
            : rule.ordinal === -1
              ? last - ((end.getUTCDay() - rule.weekday + 7) % 7)
              : 1 +
                ((rule.weekday - weekday(prefix + "-01") + 7) % 7) +
                (rule.ordinal - 1) * 7;
        if (day <= last) {
          const date = `${prefix}-${String(day).padStart(2, "0")}`;
          if (date >= first) yield date;
          emptyMonths = 0;
        } else emptyMonths++;
        month += s.interval;
      }
    }
  };
  for (const date of dates()) {
    if (s.endDate && date > s.endDate) break;
    for (const time of times) {
      const epoch = scheduleWallTime(date, time, s.timeZone);
      if (include(epoch)) result.push(epoch);
      if (result.length >= limit)
        return result.map((epoch) => new Date(epoch).toISOString());
    }
  }
  return result.map((epoch) => new Date(epoch).toISOString());
}

export function nextScheduleRun(
  schedule: FollowSchedule,
  after: Date,
): string | null {
  return scheduleOccurrences(schedule, after, 1)[0] ?? null;
}
