import test from "node:test";
import assert from "node:assert/strict";
import {
  recurrenceScheduleSchema,
  type RecurrenceSchedule,
} from "../../src/shared/schedule-contracts";
import {
  nextScheduleRun,
  normalizeSchedule,
  scheduleOccurrences,
  scheduleWallTime,
} from "../../src/shared/schedules";

const base = {
  version: 2 as const,
  timeZone: "Asia/Shanghai",
  startDate: "2026-10-19",
  times: ["09:00"],
};
const after = new Date("2026-10-20T13:00:00Z");
test("recurrence contracts reject invalid dates, zones, duplicate times, empty weekdays and fractional intervals", () => {
  const valid = { ...base, cadence: "weekly", interval: 2, weekdays: [1, 3] };
  assert.ok(recurrenceScheduleSchema.safeParse(valid).success);
  for (const patch of [
    { startDate: "2026-02-30" },
    { timeZone: "Missing/Zone" },
    { times: ["09:00", "09:00"] },
    { weekdays: [] },
    { weekdays: [1, 1] },
    { interval: 1.5 },
    { endDate: "2026-10-18" },
  ])
    assert.equal(
      recurrenceScheduleSchema.safeParse({ ...valid, ...patch }).success,
      false,
      JSON.stringify(patch),
    );
});
test("multiple send times and fortnightly weeks use the saved start-date anchor", () => {
  assert.deepEqual(
    scheduleOccurrences(
      { ...base, cadence: "daily", interval: 2, times: ["18:00", "09:00"] },
      after,
    ),
    [
      "2026-10-21T01:00:00.000Z",
      "2026-10-21T10:00:00.000Z",
      "2026-10-23T01:00:00.000Z",
    ],
  );
  assert.deepEqual(
    scheduleOccurrences(
      { ...base, cadence: "weekly", interval: 2, weekdays: [1, 3] },
      after,
      4,
    ),
    [
      "2026-10-21T01:00:00.000Z",
      "2026-11-02T01:00:00.000Z",
      "2026-11-04T01:00:00.000Z",
      "2026-11-16T01:00:00.000Z",
    ],
  );
});
test("monthly dates skip short months while month-end and ordinal weekdays retain their calendar meaning", () => {
  const monthly = { ...base, cadence: "monthly" as const, interval: 1 };
  assert.deepEqual(
    scheduleOccurrences(
      { ...monthly, monthly: { kind: "day", day: 31 } },
      after,
    ),
    [
      "2026-10-31T01:00:00.000Z",
      "2026-12-31T01:00:00.000Z",
      "2027-01-31T01:00:00.000Z",
    ],
  );
  assert.deepEqual(
    scheduleOccurrences(
      { ...monthly, monthly: { kind: "day", day: "last" } },
      after,
    ),
    [
      "2026-10-31T01:00:00.000Z",
      "2026-11-30T01:00:00.000Z",
      "2026-12-31T01:00:00.000Z",
    ],
  );
  assert.deepEqual(
    scheduleOccurrences(
      { ...monthly, monthly: { kind: "weekday", ordinal: -1, weekday: 5 } },
      after,
    ),
    [
      "2026-10-30T01:00:00.000Z",
      "2026-11-27T01:00:00.000Z",
      "2026-12-25T01:00:00.000Z",
    ],
  );
  assert.equal(
    nextScheduleRun(
      {
        ...monthly,
        startDate: "2028-02-01",
        monthly: { kind: "day", day: 29 },
      },
      after,
    ),
    "2028-02-29T01:00:00.000Z",
  );
});
test("one-time schedules and inclusive end dates exhaust without inventing another occurrence", () => {
  const once: RecurrenceSchedule = {
    ...base,
    startDate: "2026-10-21",
    cadence: "once",
  };
  assert.deepEqual(scheduleOccurrences(once, after), [
    "2026-10-21T01:00:00.000Z",
  ]);
  assert.equal(nextScheduleRun(once, new Date("2026-10-21T01:00:00Z")), null);
  const bounded: RecurrenceSchedule = {
    ...base,
    cadence: "daily",
    interval: 1,
    startDate: "2026-10-21",
    endDate: "2026-10-22",
    times: ["09:00", "18:00"],
  };
  assert.equal(scheduleOccurrences(bounded, after, 10).length, 4);
  assert.equal(
    nextScheduleRun(bounded, new Date("2026-10-22T10:00:00Z")),
    null,
  );
});
test("sparse monthly rules find leap dates beyond a fixed search horizon and terminate impossible dates", () => {
  const schedule = {
    ...base,
    startDate: "2096-02-01",
    cadence: "monthly" as const,
    interval: 48,
    monthly: { kind: "day" as const, day: 29 },
  };
  const dates = scheduleOccurrences(
    schedule,
    new Date("2097-01-01T00:00:00Z"),
    10,
  );
  assert.equal(dates.length, 10);
  assert.equal(dates[0], "2104-02-29T01:00:00.000Z");
  assert.equal(dates[9], "2140-02-29T01:00:00.000Z");
  assert.equal(
    nextScheduleRun(
      { ...schedule, interval: 12, monthly: { kind: "day", day: 31 } },
      after,
    ),
    null,
  );
});
test("named-zone wall times handle DST gaps, repeated hours, and half-hour offset changes", () => {
  assert.equal(
    scheduleWallTime("2027-03-14", "02:30", "America/Los_Angeles"),
    null,
  );
  assert.equal(
    new Date(
      scheduleWallTime("2026-11-01", "01:30", "America/Los_Angeles")!,
    ).toISOString(),
    "2026-11-01T08:30:00.000Z",
  );
  assert.equal(
    scheduleWallTime("2026-10-04", "02:15", "Australia/Lord_Howe"),
    null,
  );
  const daily: RecurrenceSchedule = {
    ...base,
    cadence: "daily",
    interval: 1,
    timeZone: "America/Los_Angeles",
    startDate: "2027-03-13",
    times: ["02:30"],
  };
  assert.deepEqual(
    scheduleOccurrences(daily, new Date("2027-03-13T00:00:00Z")),
    [
      "2027-03-13T10:30:00.000Z",
      "2027-03-15T09:30:00.000Z",
      "2027-03-16T09:30:00.000Z",
    ],
  );
});
test("fixed intervals use elapsed time across DST and retain the original anchor after pause", () => {
  const interval: RecurrenceSchedule = {
    ...base,
    cadence: "interval",
    interval: 2,
    unit: "hours",
    timeZone: "America/Los_Angeles",
    startDate: "2026-11-01",
    times: ["00:30"],
  };
  assert.deepEqual(
    scheduleOccurrences(interval, new Date("2026-11-01T07:29:00Z")),
    [
      "2026-11-01T07:30:00.000Z",
      "2026-11-01T09:30:00.000Z",
      "2026-11-01T11:30:00.000Z",
    ],
  );
  assert.equal(
    nextScheduleRun(interval, new Date("2026-11-01T10:45:00Z")),
    "2026-11-01T11:30:00.000Z",
  );
});
test("legacy schedules retain their weekday and time while adopting a named device zone", () => {
  const normalized = normalizeSchedule(
    { cadence: "weekly", time: "08:30", weekday: 0 },
    after,
  );
  assert.equal(normalized.version, 2);
  assert.equal(
    normalized.timeZone,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  assert.deepEqual(normalized.times, ["08:30"]);
  assert.ok(normalized.cadence === "weekly");
  assert.deepEqual(normalized.weekdays, [0]);
});
