import { FastifyInstance } from "fastify";
import { z } from "zod";
import { and, eq, gte, lte, inArray, asc, sql, or, isNull } from "drizzle-orm";
import { authGuard } from "../middleware/auth.js";
import { db, schema } from "../db/index.js";
import { PROJECT_TYPES } from "@hcc/shared";

const querySchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  project_type: z.enum([...PROJECT_TYPES, "all"]).default("all"),
});

// Hard cap on occurrences materialized per series per window. A daily series
// repeating forever inside a 60-month window is ~1800 days — well under this
// — but the cap defends against pathological inputs (interval=1 + huge
// window + bogus count).
const MAX_OCCURRENCES_PER_SERIES = 2000;

type TaskRow = typeof schema.tasks.$inferSelect;

export default async function calendarRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authGuard);

  app.get("/api/v1/calendar/events", async (req, reply) => {
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Validation Error",
        message: parsed.error.issues.map((i) => i.message).join("; "),
      });
    }

    const { from, to, project_type } = parsed.data;
    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return reply.status(400).send({
        error: "Validation Error",
        message: "Invalid date range",
      });
    }

    const userProjects = await db
      .select({
        id: schema.projects.id,
        type: schema.projects.type,
      })
      .from(schema.projects)
      .where(eq(schema.projects.user_id, req.userId));

    const projectTypeById = new Map<string, string>();
    for (const p of userProjects) projectTypeById.set(p.id, p.type);

    // Two overlap conditions OR'd together:
    //   - Non-recurring: the existing rule — start <= to AND
    //     COALESCE(end_date, due_date) >= from. Catches multi-day spans
    //     whose start sits outside the window.
    //   - Recurring:     the series may produce an occurrence inside the
    //     window. We can't perfectly filter that in SQL without modeling
    //     the recurrence rule, so we fetch any series whose due_date <= to
    //     and whose recurrence_end_date is either null or >= from, then
    //     let the JS expansion decide which occurrences (if any) land in
    //     the window.
    const overlapForOneOff = and(
      isNull(schema.tasks.recurrence_frequency),
      lte(schema.tasks.due_date, toDate),
      gte(
        sql`COALESCE(${schema.tasks.end_date}, ${schema.tasks.due_date})`,
        fromDate
      )
    );
    const overlapForSeries = and(
      sql`${schema.tasks.recurrence_frequency} IS NOT NULL`,
      lte(schema.tasks.due_date, toDate),
      or(
        isNull(schema.tasks.recurrence_end_date),
        gte(schema.tasks.recurrence_end_date, fromDate)
      )
    );

    const baseConditions = [
      eq(schema.tasks.user_id, req.userId),
      or(overlapForOneOff, overlapForSeries),
    ];

    if (project_type === "sell" || project_type === "buy") {
      const matchingIds = userProjects
        .filter((p) => p.type === project_type)
        .map((p) => p.id);
      if (matchingIds.length === 0) return { data: [], total: 0 };
      baseConditions.push(inArray(schema.tasks.project_id, matchingIds));
    }

    const rows = await db
      .select()
      .from(schema.tasks)
      .where(and(...baseConditions))
      .orderBy(
        asc(schema.tasks.due_date),
        sql`${schema.tasks.start_time} ASC NULLS LAST`,
        asc(schema.tasks.title)
      );

    // Each returned event carries both the series-level due_date/end_date
    // (used by the modal when the user edits an entry — those reads must
    // hit the series original, not a particular occurrence) and the
    // occurrence_start/occurrence_end pair (used by the calendar grid for
    // placement). For non-recurring entries the occurrence fields just
    // mirror due_date/end_date, so the front-end can treat both kinds
    // uniformly.
    type CalendarEvent = TaskRow & {
      project_type: string | null;
      occurrence_start: Date | null;
      occurrence_end: Date | null;
    };
    const events: CalendarEvent[] = [];
    for (const row of rows) {
      const project_type_value = row.project_id
        ? projectTypeById.get(row.project_id) ?? null
        : null;
      if (!row.recurrence_frequency) {
        events.push({
          ...row,
          project_type: project_type_value,
          occurrence_start: row.due_date,
          occurrence_end: row.end_date,
        });
        continue;
      }
      // Expand the series. Each emitted event keeps the series id so
      // the front-end's edit flow ("find entry by id") still resolves to
      // the series, and keeps due_date/end_date as the series originals
      // so the modal hydrates correctly when editing.
      for (const occ of expandSeries(row, fromDate, toDate)) {
        events.push({
          ...row,
          project_type: project_type_value,
          occurrence_start: occ.due_date,
          occurrence_end: occ.end_date,
        });
      }
    }

    // Re-sort by occurrence date so occurrences interleave correctly across
    // overlapping series.
    events.sort((a, b) => {
      const at = a.occurrence_start?.getTime() ?? 0;
      const bt = b.occurrence_start?.getTime() ?? 0;
      if (at !== bt) return at - bt;
      const as = a.start_time ?? "￿";
      const bs = b.start_time ?? "￿";
      if (as !== bs) return as < bs ? -1 : 1;
      return a.title.localeCompare(b.title);
    });

    return { data: events, total: events.length };
  });
}

// Walk a recurring series forward from due_date, yielding each occurrence
// whose [due_date, end_date] overlaps [windowStart, windowEnd]. Date math
// is done in UTC because the DB stores timestamps at UTC midnight (the
// tasks route converts the "YYYY-MM-DD" date inputs via new Date(str),
// which the spec parses as UTC).
function* expandSeries(
  row: TaskRow,
  windowStart: Date,
  windowEnd: Date
): Generator<{ due_date: Date; end_date: Date | null }> {
  if (!row.due_date || !row.recurrence_frequency) return;
  const freq = row.recurrence_frequency;
  const interval = Math.max(1, row.recurrence_interval ?? 1);
  const seriesStart = row.due_date;
  const durationMs = row.end_date
    ? row.end_date.getTime() - seriesStart.getTime()
    : 0;

  // Hard stop: either the series-level end_date, or the requested window's
  // end — whichever comes first.
  const hardStop =
    row.recurrence_end_date && row.recurrence_end_date < windowEnd
      ? row.recurrence_end_date
      : windowEnd;
  const countCap = row.recurrence_count ?? Infinity;

  let emitted = 0;
  let occurrenceIdx = 0;

  const yieldIfInWindow = function* (date: Date) {
    const end = durationMs > 0 ? new Date(date.getTime() + durationMs) : null;
    // Occurrence overlaps the window iff its start <= windowEnd AND its
    // end (or start if no end) >= windowStart.
    const occEndForCompare = end ?? date;
    if (date <= windowEnd && occEndForCompare >= windowStart) {
      yield { due_date: date, end_date: end };
    }
  };

  if (freq === "weekly" && row.recurrence_weekdays) {
    // Multi-weekday: within each interval-week, emit one occurrence per
    // selected weekday. We anchor weeks to the Monday on/before the
    // series start so "every 2 weeks on Mon/Wed" lines up the way users
    // expect across years.
    const weekdays = row.recurrence_weekdays
      .split(",")
      .map((s) => Number(s))
      .filter((n) => n >= 0 && n <= 6)
      .sort((a, b) => a - b);
    if (weekdays.length === 0) return;
    const anchor = mondayOnOrBefore(seriesStart);
    let weekIdx = 0;
    while (true) {
      const weekStart = addDaysUTC(anchor, weekIdx * 7 * interval);
      if (weekStart > hardStop) break;
      if (emitted >= countCap || emitted >= MAX_OCCURRENCES_PER_SERIES) break;
      for (const wd of weekdays) {
        const date = addDaysUTC(weekStart, wd);
        if (date < seriesStart) continue; // ignore weekdays in the anchor
                                          // week that fall before the
                                          // series start
        if (date > hardStop) break;
        if (emitted >= countCap || emitted >= MAX_OCCURRENCES_PER_SERIES)
          break;
        occurrenceIdx++;
        emitted++;
        yield* yieldIfInWindow(date);
      }
      weekIdx++;
    }
    return;
  }

  // Single-cadence variants: just step the start date forward by the
  // appropriate unit.
  while (occurrenceIdx < countCap) {
    if (occurrenceIdx >= MAX_OCCURRENCES_PER_SERIES) break;
    const date = advance(seriesStart, freq, interval, occurrenceIdx);
    if (date > hardStop) break;
    occurrenceIdx++;
    emitted++;
    yield* yieldIfInWindow(date);
  }
}

function advance(
  start: Date,
  freq: string,
  interval: number,
  n: number
): Date {
  // n=0 returns the start itself (the first occurrence is always at start).
  if (freq === "daily") return addDaysUTC(start, n * interval);
  if (freq === "weekly") return addDaysUTC(start, n * interval * 7);
  if (freq === "monthly") return addMonthsUTC(start, n * interval);
  if (freq === "yearly") return addMonthsUTC(start, n * interval * 12);
  // Fallback: treat unknown frequency as a single occurrence at start.
  return n === 0 ? start : new Date(8640000000000000);
}

function addDaysUTC(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function addMonthsUTC(d: Date, months: number): Date {
  const out = new Date(d);
  const targetMonth = out.getUTCMonth() + months;
  // setUTCMonth handles year rollover automatically; clamp the day-of-month
  // so Jan 31 + 1 month becomes Feb 28/29 instead of spilling into March.
  const day = out.getUTCDate();
  out.setUTCDate(1);
  out.setUTCMonth(targetMonth);
  const lastOfMonth = new Date(
    Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)
  ).getUTCDate();
  out.setUTCDate(Math.min(day, lastOfMonth));
  return out;
}

function mondayOnOrBefore(d: Date): Date {
  const out = new Date(d);
  // getUTCDay: 0=Sun..6=Sat. We want 0=Mon..6=Sun, so map Sunday (0) to 6
  // and everything else to (day-1).
  const day = out.getUTCDay();
  const delta = day === 0 ? -6 : 1 - day;
  out.setUTCDate(out.getUTCDate() + delta);
  return out;
}
