import { z } from "zod";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const scheduleDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(value + "T00:00:00Z");
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Invalid calendar date");
const weekday = z.number().int().min(0).max(6);
const common = {
  version: z.literal(2),
  timeZone: z
    .string()
    .min(1)
    .max(100)
    .refine((zone) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: zone });
        return true;
      } catch {
        return false;
      }
    }, "Invalid time zone"),
  startDate: scheduleDateSchema,
  endDate: scheduleDateSchema.optional(),
  times: z
    .array(time)
    .min(1)
    .max(6)
    .refine(
      (times) => new Set(times).size === times.length,
      "Send times must be unique",
    ),
};
export const recurrenceScheduleSchema = z
  .discriminatedUnion("cadence", [
    z
      .object({
        ...common,
        cadence: z.literal("once"),
        times: z.array(time).length(1),
      })
      .strict(),
    z
      .object({
        ...common,
        cadence: z.literal("daily"),
        interval: z.number().int().min(1).max(52),
      })
      .strict(),
    z
      .object({
        ...common,
        cadence: z.literal("weekly"),
        interval: z.number().int().min(1).max(52),
        weekdays: z
          .array(weekday)
          .min(1)
          .max(7)
          .refine((days) => new Set(days).size === days.length),
      })
      .strict(),
    z
      .object({
        ...common,
        cadence: z.literal("monthly"),
        interval: z.number().int().min(1).max(52),
        monthly: z.discriminatedUnion("kind", [
          z
            .object({
              kind: z.literal("day"),
              day: z.union([
                z.number().int().min(1).max(31),
                z.literal("last"),
              ]),
            })
            .strict(),
          z
            .object({
              kind: z.literal("weekday"),
              ordinal: z.union([
                z.literal(1),
                z.literal(2),
                z.literal(3),
                z.literal(4),
                z.literal(-1),
              ]),
              weekday,
            })
            .strict(),
        ]),
      })
      .strict(),
    z
      .object({
        ...common,
        cadence: z.literal("interval"),
        times: z.array(time).length(1),
        interval: z.number().int().min(1).max(1440),
        unit: z.enum(["minutes", "hours"]),
      })
      .strict(),
  ])
  .refine(
    (s) => !s.endDate || s.endDate >= s.startDate,
    "End date precedes start date",
  );

const legacyScheduleSchema = z
  .object({
    cadence: z.enum(["daily", "weekly"]),
    time,
    weekday: weekday.optional(),
  })
  .strict()
  .refine(
    (s) => s.cadence !== "weekly" || s.weekday !== undefined,
    "Weekly schedule needs a weekday",
  );

export const followScheduleSchema = z.union([
  recurrenceScheduleSchema,
  legacyScheduleSchema,
]);
export type FollowSchedule = z.infer<typeof followScheduleSchema>;
export type RecurrenceSchedule = z.infer<typeof recurrenceScheduleSchema>;
