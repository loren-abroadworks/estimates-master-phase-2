import { Job, JobCrewAllocation } from '../types';

/**
 * Pure scheduling engine for bulk / single-job rescheduling.
 *
 * No React, no global state: every function takes jobs + config in and returns
 * proposed changes out. Preview and commit call the SAME function — the preview
 * renders the returned ProposedChange[], and commit applies it. No Date.now()
 * is called inside any function (a referenceDate is injected) so results are
 * deterministic and testable.
 */

export type ShiftUnit = 'hours' | 'days';

export interface WorkingTimeConfig {
  /** When true, day-shifts step over weekends/holidays instead of landing on them. */
  skipNonWorkingDays: boolean;
  /** JS getDay() values treated as non-working (e.g. [0,6] = Sun, Sat). */
  weekendDays: number[];
  /** Local 'YYYY-MM-DD' dates treated as non-working. */
  holidays: string[];
  /** Hour-of-day a job is assumed to start (times aren't stored on jobs). */
  workDayStartHour: number;
  /** Hour-of-day a job is assumed to end. */
  workDayEndHour: number;
}

export interface CascadeScope {
  /** Limit cascade to jobs that include at least one of these crew members. */
  crewMemberIds?: string[];
  /** Limit cascade to jobs with one of these categories. */
  categories?: string[];
}

export type SkipReason = 'locked' | 'unscheduled' | 'before-point' | 'out-of-scope' | 'after-limit' | 'all-past';

export interface ProposedChange {
  jobId: string;
  jobName: string;
  jobNumber: string;
  oldStart: string | null;
  oldEnd: string | null;
  newStart: string;
  newEnd: string;
  /** Present when the job was NOT changed; the row is informational only. */
  skipped?: SkipReason;
  /** Re-flowed per-day windows from a time-shift; seeds the editor's daily hours. */
  dailyHours?: Record<string, { startTime: string; endTime: string }>;
  /** Present when this change moves a single shift (allocation id), not the whole job. */
  shiftId?: string;
  /** Elapsed days this change will keep as worked rather than move. Descriptive only —
   *  the commit recomputes the split from splitPinnedPast. */
  pinnedDays?: string[];
}

const MS_PER_HOUR = 3_600_000;
const MS_PER_DAY = 86_400_000;

/**
 * Derive the engine's WorkingTimeConfig from persisted SchedulingSettings.
 * Rain days and holidays are both treated as non-working days for cascade math.
 */
export const configFromSettings = (
  scheduling: {
    nonWorkingWeekdays: number[];
    holidays: { date: string }[];
    rainDays: { date: string }[];
    workDayStartHour: number;
    workDayEndHour: number;
  } | undefined,
  skipNonWorkingDays = false,
): WorkingTimeConfig => {
  if (!scheduling) {
    return { skipNonWorkingDays, weekendDays: [0, 6], holidays: [], workDayStartHour: 8, workDayEndHour: 17 };
  }
  return {
    skipNonWorkingDays,
    weekendDays: scheduling.nonWorkingWeekdays,
    holidays: [...scheduling.holidays.map((h) => h.date), ...scheduling.rainDays.map((r) => r.date)],
    workDayStartHour: scheduling.workDayStartHour,
    workDayEndHour: scheduling.workDayEndHour,
  };
};

/** Add hours to a date (intra-day, DST-naive — fine for hour bumps). */
export const addHours = (d: Date, h: number): Date => new Date(d.getTime() + h * MS_PER_HOUR);

/** Local 'YYYY-MM-DD' key (matches the date-only convention used by DatePicker). */
export const toLocalDateKey = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

/** Local 'HH:MM' time-of-day for an ISO datetime string. */
export const hhmmOf = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Inclusive list of local 'YYYY-MM-DD' keys a job covers from start to end. */
export const spannedDayKeys = (startIso: string, endIso: string | null): string[] => {
  const start = new Date(startIso);
  const end = endIso ? new Date(endIso) : start;
  const keys: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  while (cursor.getTime() <= last.getTime()) {
    keys.push(toLocalDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return keys.length ? keys : [toLocalDateKey(start)];
};

/**
 * Spanned day keys with non-working weekdays removed. `nonWorkingWeekdays` holds
 * JS getDay() values (e.g. [0,6] = Sun, Sat) disabled in the scheduling settings.
 * Falls back to the full span if filtering would leave no days, so callers never
 * get an empty list.
 */
export const workingDayKeys = (
  startIso: string,
  endIso: string | null,
  nonWorkingWeekdays: number[],
): string[] => {
  const all = spannedDayKeys(startIso, endIso);
  if (!nonWorkingWeekdays.length) return all;
  const working = all.filter(k => !nonWorkingWeekdays.includes(new Date(`${k}T00:00:00`).getDay()));
  return working.length ? working : all;
};

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** 'HH:mm' (e.g. '12:30') from a fractional hour, minute-rounded and carry-safe. */
export const hoursToHHMM = (h: number): string => {
  const total = Math.round(h * 60);
  return `${pad2(Math.floor(total / 60))}:${pad2(total % 60)}`;
};

/** 'HH:mm' -> fractional hours (e.g. '12:30' -> 12.5). */
const hhmmToHours = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return h + (m || 0) / 60;
};

/**
 * Keep a day window valid (start strictly before end) after one field is edited.
 * A valid `next` is returned unchanged. When the edit would invert the window, the
 * counterpart field slides to preserve the previous duration (≥ 15 min), clamped
 * to the workday — so editing the start past the end pushes the end out, and
 * editing the end before the start pulls the start back.
 */
export const clampDayWindow = (
  next: { startTime: string; endTime: string },
  prev: { startTime: string; endTime: string },
  changed: 'startTime' | 'endTime',
  config: WorkingTimeConfig,
): { startTime: string; endTime: string } => {
  const s = hhmmToHours(next.startTime);
  const e = hhmmToHours(next.endTime);
  if (s < e) return next;
  const dur = Math.max(0.25, hhmmToHours(prev.endTime) - hhmmToHours(prev.startTime));
  const dayStart = config.workDayStartHour;
  const dayEnd = config.workDayEndHour;
  if (changed === 'startTime') {
    let ns = s, ne = s + dur;
    if (ne > dayEnd) { ne = dayEnd; ns = Math.max(dayStart, dayEnd - dur); }
    return { startTime: hoursToHHMM(ns), endTime: hoursToHHMM(ne) };
  }
  let ne = e, ns = e - dur;
  if (ns < dayStart) { ns = dayStart; ne = Math.min(dayEnd, dayStart + dur); }
  return { startTime: hoursToHHMM(ns), endTime: hoursToHHMM(ne) };
};

/**
 * Total scheduled WINDOW hours of a job: for each working day it spans (weekends
 * removed), the per-day dailyHours window length when present, else the standard
 * workday length. Independent of crew assignment; this is the duration a
 * time-shift preserves. Returns 0 for an unscheduled job.
 */
export const scheduledWindowHours = (job: Job, config: WorkingTimeConfig): number => {
  if (!job.startDate) return 0;
  const keys = jobWorkedDayKeys(job, config.weekendDays);
  const standard = Math.max(0, config.workDayEndHour - config.workDayStartHour);
  let total = 0;
  for (const k of keys) {
    const w = job.dailyHours?.[k];
    total += w ? Math.max(0, hhmmToHours(w.endTime) - hhmmToHours(w.startTime)) : standard;
  }
  return Math.round(total * 10) / 10;
};

/** A shift's working window on one local 'YYYY-MM-DD': its per-day override when
 *  present, else the shift's default start/end time. */
export const allocDayWindow = (
  alloc: JobCrewAllocation,
  dateKey: string,
): { startTime: string; endTime: string } =>
  alloc.dailyHours?.[dateKey] ?? { startTime: alloc.startTime, endTime: alloc.endTime };

/** The window a MEMBER works on a given day: their personal override (set from the
 *  Assign Hours modal) when one exists, else the shift's window that day. Every surface
 *  that shows or measures one person's day routes through here, so a member who was
 *  given their own hours never silently reads back as the shift's. */
export const memberDayWindow = (
  alloc: JobCrewAllocation,
  memberId: string,
  dateKey: string,
): { startTime: string; endTime: string } =>
  alloc.memberDailyWindows?.[memberId]?.[dateKey] ?? allocDayWindow(alloc, dateKey);

/** Whether a shift actually works a given local 'YYYY-MM-DD': the day falls inside the
 *  shift's envelope AND is not in its skip list. This is the ONLY place the "does this
 *  shift cover this day" question is answered — capacity roll-ups, board occupancy and
 *  the Actual Schedule all route through it, so a skipped day cannot keep counting
 *  through some path that still compares the raw range. */
export const allocCoversDay = (alloc: JobCrewAllocation, dateKey: string): boolean =>
  !!alloc.startDate && !!alloc.endDate &&
  dateKey >= alloc.startDate && dateKey <= alloc.endDate &&
  !alloc.skipDays?.includes(dateKey);

/** The days a shift actually works: its span, less non-working weekdays, less its skip
 *  list. Unlike `workingDayKeys` this does NOT fall back to the full span when filtering
 *  empties the list — an all-skipped shift genuinely works no days, and callers need to
 *  see that rather than a span that silently reappears. */
export const allocWorkedDayKeys = (
  alloc: JobCrewAllocation,
  nonWorkingWeekdays: number[],
): string[] => {
  if (!alloc.startDate || !alloc.endDate) return [];
  return spannedDayKeys(`${alloc.startDate}T12:00:00`, `${alloc.endDate}T12:00:00`)
    .filter(k => !nonWorkingWeekdays.includes(new Date(`${k}T12:00:00`).getDay()))
    .filter(k => !alloc.skipDays?.includes(k));
};

/** The days a JOB actually works: the union of its shifts' worked days, sorted and
 *  de-duplicated. This is deliberately NOT the envelope. Once a reschedule can pin elapsed
 *  days into their own shift, a job legitimately has gaps — worked days, then nothing, then
 *  the moved remainder — and counting the gap as working days silently inflates every
 *  day-count pro-rate that reads it. Legacy jobs with no dated shifts fall back to the
 *  envelope, which for them is the same thing. */
export const jobWorkedDayKeys = (job: Job, nonWorkingWeekdays: number[]): string[] => {
  if (!job.startDate) return [];
  const dated = (job.allocations ?? []).filter(a => a.startDate && a.endDate);
  if (!dated.length) {
    return workingDayKeys(job.startDate, job.endDate ?? job.startDate, nonWorkingWeekdays);
  }
  const keys = new Set<string>();
  for (const a of dated) for (const k of allocWorkedDayKeys(a, nonWorkingWeekdays)) keys.add(k);
  return [...keys].sort();
};

/** Recompute a job's overall span from its shifts: earliest shift start … latest
 *  shift end, each boundary carrying that shift's window time-of-day on the
 *  boundary day. Jobs with no dated shifts are returned unchanged. */
export const recomputeJobEnvelope = (job: Job): Job => {
  const dated = (job.allocations ?? []).filter(a => a.startDate && a.endDate);
  if (!dated.length) return job;
  const startAlloc = dated.reduce((a, b) => (b.startDate < a.startDate ? b : a));
  const endAlloc = dated.reduce((a, b) => (b.endDate > a.endDate ? b : a));
  const startTime = allocDayWindow(startAlloc, startAlloc.startDate).startTime;
  const endTime = allocDayWindow(endAlloc, endAlloc.endDate).endTime;
  return { ...job, startDate: `${startAlloc.startDate}T${startTime}:00`, endDate: `${endAlloc.endDate}T${endTime}:00` };
};

/** Cascade crew scope for a (possibly shift-scoped) move: the named shift's members
 *  when `shiftId` is given, else the union of all the job's shift members. */
export const shiftCrewScope = (job: Job, shiftId: string | undefined): string[] => {
  const allocs = job.allocations ?? [];
  if (shiftId) return [...(allocs.find(a => a.id === shiftId)?.memberIds ?? [])];
  return Array.from(new Set(allocs.flatMap(a => a.memberIds ?? [])));
};

export interface ReflowResult {
  newStart: string;
  newEnd: string;
  dailyHours: Record<string, { startTime: string; endTime: string }>;
}

/**
 * Re-flow a job as a continuous ribbon of `durationHours` working-hours starting
 * at `newStartISO` (Option A). Day 1 runs from the new start (clamped into the
 * workday) to the workday end; each following WORKING day (skipping
 * weekends/holidays) fills from the workday start until all hours are placed.
 * Only day 1 carries the late start. Always emits at least one day.
 */
export const reflowFromStart = (
  newStartISO: string,
  durationHours: number,
  config: WorkingTimeConfig,
): ReflowResult => {
  const dayStart = config.workDayStartHour;
  const dayEnd = config.workDayEndHour;
  const start = new Date(newStartISO);

  let firstStartHour = start.getHours() + start.getMinutes() / 60;
  if (firstStartHour < dayStart) firstStartHour = dayStart;
  if (firstStartHour > dayEnd) firstStartHour = dayEnd;

  let cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  if (isNonWorkingDay(cursor, config)) {
    cursor = advanceWorkingDays(cursor, 1, config);
    firstStartHour = dayStart;
  }

  const dailyHours: Record<string, { startTime: string; endTime: string }> = {};
  let remaining = Math.max(0, Math.round(durationHours * 10) / 10);
  let overallStart: string | null = null;
  let overallEnd = '';
  let first = true;

  do {
    const sHour = first ? firstStartHour : dayStart;
    const avail = Math.max(0, dayEnd - sHour);
    // Day 1 starting at the workday end leaves no room; advance without emitting.
    if (avail === 0 && remaining > 0) {
      cursor = advanceWorkingDays(cursor, 1, config);
      first = false;
      continue;
    }
    const used = remaining > 0 ? Math.min(avail, remaining) : 0;
    const eHour = sHour + used;
    const key = toLocalDateKey(cursor);
    dailyHours[key] = { startTime: hoursToHHMM(sHour), endTime: hoursToHHMM(eHour) };
    if (overallStart === null) overallStart = `${key}T${hoursToHHMM(sHour)}:00`;
    overallEnd = `${key}T${hoursToHHMM(eHour)}:00`;
    remaining = Math.round((remaining - used) * 10) / 10;
    first = false;
    if (remaining > 0) cursor = advanceWorkingDays(cursor, 1, config);
  } while (remaining > 0);

  return { newStart: overallStart!, newEnd: overallEnd, dailyHours };
};

/**
 * Build a ProposedChange that pushes a job's start to `newStartISO` and re-flows
 * its preserved window-hours forward (Option A spill). Returns the job's existing
 * dates as `old*` and the re-flowed span + per-day windows as the new state.
 */
export const timeShiftChange = (
  job: Job,
  newStartISO: string,
  config: WorkingTimeConfig,
): ProposedChange => {
  const duration = scheduledWindowHours(job, config) || Math.max(1, config.workDayEndHour - config.workDayStartHour);
  const r = reflowFromStart(newStartISO, duration, config);
  return {
    jobId: job.id,
    jobName: job.name,
    jobNumber: job.jobNumber,
    oldStart: job.startDate ?? null,
    oldEnd: job.endDate ?? null,
    newStart: r.newStart,
    newEnd: r.newEnd,
    dailyHours: r.dailyHours,
  };
};

/**
 * Build the ProposedChange that seeds the reschedule/schedule editor for a job.
 * A scheduled job stages a no-op at its current dates. An unscheduled job (no
 * startDate) is seeded onto `seed` — a one-workday span at the workday start,
 * normalized to the next working day if `seed` lands on a weekend/holiday — so
 * the editor opens with a concrete date the user can then adjust.
 */
export const initialScheduleChange = (
  job: Job,
  seed: Date,
  config: WorkingTimeConfig,
): ProposedChange => {
  if (job.startDate) {
    return {
      jobId: job.id,
      jobName: job.name,
      jobNumber: job.jobNumber,
      oldStart: job.startDate,
      oldEnd: job.endDate || job.startDate,
      newStart: job.startDate,
      newEnd: job.endDate || job.startDate,
    };
  }
  const startHour = String(config.workDayStartHour).padStart(2, '0');
  return timeShiftChange(job, `${toLocalDateKey(seed)}T${startHour}:00`, config);
};

/** Adjust a change's overall start/end from the first/last day's edited hours. */
export const applyDailyHours = (
  change: ProposedChange,
  hours: Record<string, { startTime: string; endTime: string }>,
): ProposedChange => {
  const keys = spannedDayKeys(change.newStart, change.newEnd);
  const first = hours[keys[0]];
  const last = hours[keys[keys.length - 1]];
  if (!first && !last) return change;
  return {
    ...change,
    newStart: first ? `${keys[0]}T${first.startTime}:00` : change.newStart,
    newEnd: last ? `${keys[keys.length - 1]}T${last.endTime}:00` : change.newEnd,
  };
};

/** Re-key a shift's per-member day hours through `rekey`. `hoursAssignments` is a nested
 *  Record<memberId, Record<dateKey, hours>>, so both levels are rebuilt. Returns a spreadable
 *  fragment: `{}` when the shift has no granular hours, so the field stays absent rather than
 *  becoming an empty map. */
const rekeyHoursAssignments = (
  alloc: JobCrewAllocation,
  rekey: (k: string) => string,
): Pick<JobCrewAllocation, 'hoursAssignments'> | Record<string, never> =>
  alloc.hoursAssignments
    ? {
        hoursAssignments: Object.fromEntries(
          Object.entries(alloc.hoursAssignments).map(([memberId, days]) => [
            memberId,
            Object.fromEntries(Object.entries(days).map(([k, h]) => [rekey(k), h])),
          ]),
        ),
      }
    : {};

/** Commit a proposed change onto a job: move it to the new span AND persist the
 *  re-flowed per-day windows so the day view's per-day clock (jobDayWindow) matches
 *  the new schedule. Without this the stale `dailyHours` override for a day shadows
 *  the moved start/end clock, and the day board keeps showing the old times.
 *  Skipped changes leave the job untouched. */
export const applyChangeToJob = (
  job: Job,
  change: ProposedChange,
  opts: { deltaFromKey?: string } = {},
): Job => {
  if (change.skipped) return job;
  if (change.shiftId) {
    const windows = change.dailyHours;
    if (windows && Object.keys(windows).length > 0) {
      // The change carries the shift's complete new per-day windows (resolver / day
      // edit). Set the allocation's span + windows from them and recompute the envelope.
      const keys = Object.keys(windows).sort();
      const start = keys[0];
      const end = keys[keys.length - 1];
      const allocations = (job.allocations ?? []).map(a => {
        if (a.id !== change.shiftId || a.pinned) return a;
        // The windows replace the span outright, so there is no delta to reuse — derive one
        // from the new first day against this shift's own previous start, purely to re-key
        // the granular hours onto the days they now fall on.
        const delta = a.startDate
          ? Math.round(
              (new Date(`${start}T12:00:00`).getTime() - new Date(`${a.startDate}T12:00:00`).getTime()) / 86_400_000,
            )
          : 0;
        const rekey = (k: string): string => {
          const d = new Date(`${k}T12:00:00`);
          d.setDate(d.getDate() + delta);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };
        return {
          ...a,
          startDate: start,
          endDate: end,
          startTime: windows[start].startTime,
          endTime: windows[end].endTime,
          dailyHours: { ...windows },
          ...rekeyHoursAssignments(a, rekey),
        };
      });
      return recomputeJobEnvelope({ ...job, allocations });
    }
    // No explicit windows: move only the named allocation to the new start day,
    // re-keying its per-day windows by the same delta, then recompute the envelope.
    // (Re-keyed inline rather than via shifts.moveAllocation to avoid a
    // shifts.ts <-> scheduleEngine.ts import cycle.)
    const newStartKey = toLocalDateKey(new Date(change.newStart));
    const allocations = (job.allocations ?? []).map(a => {
      // A pinned shift is history: it never moves, however the change is scoped.
      if (a.id !== change.shiftId || !a.startDate || a.pinned) return a;
      // The origin defaults to this shift's own start, which is today's arithmetic. A caller
      // that has just frozen elapsed days passes the first SURVIVING day instead — measuring
      // from a start that is now pinned history would overshoot the target.
      const originKey = opts.deltaFromKey ?? a.startDate;
      const delta = Math.round(
        (new Date(`${newStartKey}T12:00:00`).getTime() - new Date(`${originKey}T12:00:00`).getTime()) / 86_400_000,
      );
      const rekey = (k: string): string => {
        const d = new Date(`${k}T12:00:00`);
        d.setDate(d.getDate() + delta);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      };
      return {
        ...a,
        startDate: newStartKey,
        endDate: a.endDate ? rekey(a.endDate) : newStartKey,
        ...(a.dailyHours ? { dailyHours: Object.fromEntries(Object.entries(a.dailyHours).map(([k, w]) => [rekey(k), w])) } : {}),
        ...rekeyHoursAssignments(a, rekey),
      };
    });
    return recomputeJobEnvelope({ ...job, allocations });
  }
  // Job-level change on an allocation-based job: move every shift by the change's
  // calendar-day delta so the envelope and the shifts stay in sync (bulk reschedule,
  // rain-day, cascade followers, Auto-Fix). Legacy jobs keep the plain date write.
  const datedAllocs = (job.allocations ?? []).filter(a => a.startDate);
  if (datedAllocs.length && job.startDate) {
    const originKey = opts.deltaFromKey ?? toLocalDateKey(new Date(job.startDate));
    const delta = Math.round(
      (new Date(`${toLocalDateKey(new Date(change.newStart))}T12:00:00`).getTime()
        - new Date(`${originKey}T12:00:00`).getTime()) / 86_400_000,
    );
    const rekey = (k: string): string => {
      const d = new Date(`${k}T12:00:00`);
      d.setDate(d.getDate() + delta);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const moved = (job.allocations ?? []).map(a => (!a.startDate || a.pinned) ? a : ({
      ...a,
      startDate: rekey(a.startDate),
      endDate: a.endDate ? rekey(a.endDate) : rekey(a.startDate),
      ...(a.dailyHours ? { dailyHours: Object.fromEntries(Object.entries(a.dailyHours).map(([k, w]) => [rekey(k), w])) } : {}),
      ...rekeyHoursAssignments(a, rekey),
    }));
    return recomputeJobEnvelope({
      ...job,
      allocations: moved,
      ...(change.dailyHours ? { dailyHours: { ...job.dailyHours, ...change.dailyHours } } : {}),
    });
  }
  return {
    ...job,
    startDate: change.newStart,
    endDate: change.newEnd,
    ...(change.dailyHours ? { dailyHours: { ...job.dailyHours, ...change.dailyHours } } : {}),
  };
};

/**
 * Human-readable date, e.g. "January 9, 2000". Accepts a Date or an ISO string;
 * a date-only 'YYYY-MM-DD' string is anchored to local midnight so it doesn't
 * shift a day across time zones.
 */
export const formatDisplayDate = (d: Date | string): string => {
  const date = typeof d === 'string'
    ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T00:00:00` : d)
    : d;
  return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
};

export const isNonWorkingDay = (d: Date, config: WorkingTimeConfig): boolean => {
  if (config.weekendDays.includes(d.getDay())) return true;
  return config.holidays.includes(toLocalDateKey(d));
};

/**
 * Does a job (start..end) occupy the given local day key as a WORKING day?
 * True when the day falls within the job's date range AND is itself a working
 * day. Used to render multi-day jobs across every day they span and to detect
 * same-day conflicts consistently with that rendering.
 */
export const occupiesWorkingDay = (
  startISO: string | undefined,
  endISO: string | undefined,
  dayKey: string,
  config: WorkingTimeConfig,
): boolean => {
  if (!startISO) return false;
  const startKey = toLocalDateKey(new Date(startISO));
  const endKey = toLocalDateKey(new Date(endISO || startISO));
  if (dayKey < startKey || dayKey > endKey) return false;
  const [y, m, d] = dayKey.split('-').map(Number);
  return !isNonWorkingDay(new Date(y, m - 1, d), config);
};

/** A clock-time window inside a single workday, in fractional hours (e.g. 13.5 = 1:30 PM). */
export interface ClockInterval { start: number; end: number }

/**
 * The clock-time window a job occupies on `dayKey`, in fractional hours, or null
 * when the job does not work that day. Uses the per-day window when present; else
 * clamps: first day = start-time → workday end, last day = workday start → end-time,
 * middle days = the full workday.
 */
export const jobClockWindowOnDay = (
  job: Job,
  dayKey: string,
  config: WorkingTimeConfig,
): ClockInterval | null => {
  if (!occupiesWorkingDay(job.startDate, job.endDate, dayKey, config)) return null;
  const w = job.dailyHours?.[dayKey];
  if (w) return { start: hhmmToHours(w.startTime), end: hhmmToHours(w.endTime) };
  const s = effectiveStart(job, config);
  const e = effectiveEnd(job, config);
  const startKey = s ? toLocalDateKey(s) : dayKey;
  const endKey = e ? toLocalDateKey(e) : dayKey;
  const start = dayKey === startKey && s ? s.getHours() + s.getMinutes() / 60 : config.workDayStartHour;
  const end = dayKey === endKey && e ? e.getHours() + e.getMinutes() / 60 : config.workDayEndHour;
  return { start, end };
};

/** Merge overlapping/touching intervals into a sorted, disjoint set. */
const mergeIntervals = (ivs: ClockInterval[]): ClockInterval[] => {
  const sorted = ivs.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const out: ClockInterval[] = [];
  for (const iv of sorted) {
    const last = out[out.length - 1];
    if (last && iv.start <= last.end) last.end = Math.max(last.end, iv.end);
    else out.push({ start: iv.start, end: iv.end });
  }
  return out;
};

/**
 * Merged clock-time intervals occupied on `dayKey` by jobs in `scope` (shared crew),
 * excluding `excludeJobId`. Locked jobs ARE included (they are real commitments).
 */
export const occupiedIntervals = (
  jobs: Job[],
  scope: CascadeScope,
  dayKey: string,
  config: WorkingTimeConfig,
  excludeJobId?: string,
): ClockInterval[] => {
  const ivs: ClockInterval[] = [];
  for (const j of jobs) {
    if (j.id === excludeJobId) continue;
    if (!isInScope(j, scope)) continue;
    const w = jobClockWindowOnDay(j, dayKey, config);
    if (w) ivs.push(w);
  }
  return mergeIntervals(ivs);
};

/** Free clock-time intervals within the workday, given occupied intervals. */
export const freeIntervals = (occupied: ClockInterval[], config: WorkingTimeConfig): ClockInterval[] => {
  const dayStart = config.workDayStartHour;
  const dayEnd = config.workDayEndHour;
  const merged = mergeIntervals(occupied);
  const free: ClockInterval[] = [];
  let cursor = dayStart;
  for (const iv of merged) {
    const s = Math.max(iv.start, dayStart);
    const e = Math.min(iv.end, dayEnd);
    if (e <= dayStart || s >= dayEnd) continue;
    if (s > cursor) free.push({ start: cursor, end: s });
    cursor = Math.max(cursor, e);
  }
  if (cursor < dayEnd) free.push({ start: cursor, end: dayEnd });
  return free;
};

/**
 * Place `job` at the earliest working day strictly after `afterISO` whose whole
 * span is free of its own shared-crew conflicts (per `scope`), preserving duration.
 * `displacedIds` are jobs being moved away and so ignored as occupiers. Falls back
 * to the day right after the anchor if no conflict-free slot is found within 120
 * working days.
 */
export const placeAfterConflictFree = (
  job: Job,
  afterISO: string,
  jobs: Job[],
  scope: CascadeScope,
  config: WorkingTimeConfig,
  displacedIds: Set<string>,
): ProposedChange => {
  const base = {
    jobId: job.id, jobName: job.name, jobNumber: job.jobNumber,
    oldStart: job.startDate ?? null, oldEnd: job.endDate ?? null,
  };
  const s = effectiveStart(job, config);
  const e = effectiveEnd(job, config);
  const durationMs = s && e ? e.getTime() - s.getTime() : MS_PER_DAY;
  const occupiers = jobs.filter((j) => j.id !== job.id && !displacedIds.has(j.id));

  let day = advanceWorkingDays(new Date(afterISO), 1, config);
  let fallback: { newStart: string; newEnd: string } | null = null;
  for (let guard = 0; guard < 120; guard++) {
    day.setHours(config.workDayStartHour, 0, 0, 0);
    const ns = new Date(day);
    const ne = new Date(ns.getTime() + durationMs);
    if (!fallback) fallback = { newStart: ns.toISOString(), newEnd: ne.toISOString() };
    const dayKeys = workingDayKeys(ns.toISOString(), ne.toISOString(), config.weekendDays);
    const clash = dayKeys.some((dk) => occupiedIntervals(occupiers, scope, dk, config, job.id).length > 0);
    if (!clash) return { ...base, newStart: ns.toISOString(), newEnd: ne.toISOString() };
    day = advanceWorkingDays(day, 1, config);
  }
  return { ...base, newStart: fallback!.newStart, newEnd: fallback!.newEnd };
};

/**
 * Move `days` WORKING days forward (or backward when negative), stepping one
 * calendar day at a time and only counting working days. Preserves the
 * wall-clock time of `start` (uses setDate, so it is DST-safe).
 */
export const advanceWorkingDays = (start: Date, days: number, config: WorkingTimeConfig): Date => {
  const cur = new Date(start);
  if (days === 0) return cur;
  const dir = days >= 0 ? 1 : -1;
  let remaining = Math.abs(days);
  while (remaining > 0) {
    cur.setDate(cur.getDate() + dir);
    if (!isNonWorkingDay(cur, config)) remaining--;
  }
  return cur;
};

/** Move a date by a plain number of calendar days, preserving wall-clock time (DST-safe). */
const addCalendarDays = (d: Date, days: number): Date => {
  const cur = new Date(d);
  cur.setDate(cur.getDate() + days);
  return cur;
};

/**
 * Effective start of a job: its stored startDate, but with the time-of-day
 * normalized to workDayStartHour when the stored time is midnight. The calendar
 * view assumes 8am–5pm, so the engine reconstructs the same anchor for stable
 * comparisons and previews.
 */
const effectiveStart = (job: Job, config: WorkingTimeConfig): Date | null => {
  if (!job.startDate) return null;
  const d = new Date(job.startDate);
  if (d.getHours() === 0 && d.getMinutes() === 0) d.setHours(config.workDayStartHour, 0, 0, 0);
  return d;
};

const effectiveEnd = (job: Job, config: WorkingTimeConfig): Date | null => {
  if (!job.endDate) return job.startDate ? effectiveStart(job, config) : null;
  const d = new Date(job.endDate);
  if (d.getHours() === 0 && d.getMinutes() === 0) d.setHours(config.workDayEndHour, 0, 0, 0);
  return d;
};

const isInScope = (job: Job, scope?: CascadeScope): boolean => {
  if (!scope) return true;
  if (scope.crewMemberIds && scope.crewMemberIds.length > 0) {
    const ids = job.crewMemberIds || [];
    if (!scope.crewMemberIds.some((id) => ids.includes(id))) return false;
  }
  if (scope.categories && scope.categories.length > 0) {
    if (!job.category || !scope.categories.includes(job.category)) return false;
  }
  return true;
};

/**
 * Shift every eligible job at or after `fromDateTime` by `amount` units.
 *
 * - Locked, unscheduled, out-of-scope, and before-the-point jobs are returned
 *   as informational rows with a `skipped` reason (never mutated).
 * - A job is "affected" when its effective start >= the from-point. A multi-day
 *   job that starts before the point but ends after it is anchored on its start
 *   and is therefore NOT shifted.
 * - Hours shifts are intra-day and never skip non-working days; the duration is
 *   preserved exactly.
 * - Day shifts move the date (DST-safe), preserve time-of-day, and (when
 *   skipNonWorkingDays) step over weekends/holidays. Start and end move by the
 *   same calendar delta so the job's day-span is unchanged.
 */
export const shiftJobsFromPoint = (
  jobs: Job[],
  fromDateTime: string,
  amount: number,
  unit: ShiftUnit,
  config: WorkingTimeConfig,
  scope?: CascadeScope,
  /** Local 'YYYY-MM-DD' upper bound. Jobs whose start day is after this are left
   *  in place (returned as `after-limit` rows). Empty/undefined = no end limit. */
  untilDate?: string,
): ProposedChange[] => {
  const fromMs = new Date(fromDateTime).getTime();

  const changes: ProposedChange[] = jobs.map((job): ProposedChange => {
    const base = {
      jobId: job.id,
      jobName: job.name,
      jobNumber: job.jobNumber,
      oldStart: job.startDate ?? null,
      oldEnd: job.endDate ?? null,
    };

    if (job.is_locked) {
      return { ...base, newStart: job.startDate ?? '', newEnd: job.endDate ?? '', skipped: 'locked' };
    }
    const start = effectiveStart(job, config);
    const end = effectiveEnd(job, config);
    if (!start || !end) {
      return { ...base, newStart: '', newEnd: '', skipped: 'unscheduled' };
    }
    if (!isInScope(job, scope)) {
      return { ...base, newStart: job.startDate!, newEnd: job.endDate ?? job.startDate!, skipped: 'out-of-scope' };
    }
    if (start.getTime() < fromMs) {
      return { ...base, newStart: job.startDate!, newEnd: job.endDate ?? job.startDate!, skipped: 'before-point' };
    }
    if (untilDate && toLocalDateKey(start) > untilDate) {
      return { ...base, newStart: job.startDate!, newEnd: job.endDate ?? job.startDate!, skipped: 'after-limit' };
    }

    let newStart: Date;
    let newEnd: Date;
    if (unit === 'hours') {
      newStart = addHours(start, amount);
      newEnd = new Date(newStart.getTime() + (end.getTime() - start.getTime()));
    } else {
      newStart = config.skipNonWorkingDays
        ? advanceWorkingDays(start, amount, config)
        : addCalendarDays(start, amount);
      // End moves by the same calendar delta as start so the day-span is preserved.
      const calendarDelta = Math.round((newStart.getTime() - start.getTime()) / MS_PER_DAY);
      newEnd = addCalendarDays(end, calendarDelta);
    }

    return { ...base, newStart: newStart.toISOString(), newEnd: newEnd.toISOString() };
  });

  return changes.sort((a, b) => {
    if (a.skipped && !b.skipped) return 1;
    if (!a.skipped && b.skipped) return -1;
    return (a.newStart || a.oldStart || '').localeCompare(b.newStart || b.oldStart || '');
  });
};

/** Local-midnight epoch ms for a date, ignoring time-of-day (calendar-day math). */
const localDayStartMs = (iso: string): number => {
  const d = new Date(iso);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
};

/**
 * Cascade helper for single-job edits. Keeps the user's freely-edited primary
 * change and shifts every job scheduled AFTER the primary's original start by the
 * same number of CALENDAR days the primary's start moved, so the gaps between jobs
 * are preserved. Followers move by a pure calendar delta (never weekend-skipping)
 * to stay aligned with the primary's explicit new date. Locked, unscheduled, and
 * earlier jobs are left untouched.
 *
 * Returns [primaryChange, ...shiftedFollowers]. When the start did not move
 * (delta 0) or the primary has no original start, returns [primaryChange] only.
 */
export const cascadeFromEdit = (
  jobs: Job[],
  primaryChange: ProposedChange,
  config: WorkingTimeConfig,
  /** Local 'YYYY-MM-DD'. Followers whose ORIGINAL start day is after this are
   *  left untouched (returned as `after-limit` rows). Empty/undefined = no limit. */
  untilDate?: string,
  /** Limit followers to jobs in scope (e.g. shared crew). An explicit empty
   *  crew list yields no followers. Undefined = all later jobs (legacy). */
  scope?: CascadeScope,
): ProposedChange[] => {
  if (!primaryChange.oldStart) return [primaryChange];
  // An explicit but empty crew scope means nothing shares crew → no followers.
  if (scope?.crewMemberIds && scope.crewMemberIds.length === 0) return [primaryChange];
  const deltaDays = Math.round(
    (localDayStartMs(primaryChange.newStart) - localDayStartMs(primaryChange.oldStart)) / MS_PER_DAY,
  );
  if (deltaDays === 0) return [primaryChange];
  const calendarConfig = { ...config, skipNonWorkingDays: false };
  const shifted = shiftJobsFromPoint(jobs, primaryChange.oldStart, deltaDays, 'days', calendarConfig, scope);
  const followers = shifted.filter(c => c.jobId !== primaryChange.jobId && !c.skipped);

  if (!untilDate) return [primaryChange, ...followers];

  const moved: ProposedChange[] = [];
  const protectedRows: ProposedChange[] = [];
  for (const f of followers) {
    // Compare the follower's ORIGINAL start day (Option A). On/before the cutoff moves; strictly after is protected.
    if (f.oldStart && toLocalDateKey(new Date(f.oldStart)) > untilDate) {
      protectedRows.push({
        jobId: f.jobId, jobName: f.jobName, jobNumber: f.jobNumber,
        oldStart: f.oldStart, oldEnd: f.oldEnd,
        newStart: f.oldStart, newEnd: f.oldEnd ?? f.oldStart,
        skipped: 'after-limit',
      });
    } else {
      moved.push(f);
    }
  }
  return [primaryChange, ...moved, ...protectedRows];
};

/**
 * Cascade for a time-shift whose spill pushed the job's END date out. Shifts
 * shared-crew jobs starting on/after the primary's ORIGINAL end forward by the
 * end-date extension (in calendar days), preserving gaps. Returns
 * [primaryChange, ...followers]. No movement when the end didn't advance or the
 * crew scope is empty.
 */
export const cascadeFromTimeShift = (
  jobs: Job[],
  primaryChange: ProposedChange,
  config: WorkingTimeConfig,
  scope?: CascadeScope,
  untilDate?: string,
): ProposedChange[] => {
  if (!primaryChange.oldEnd) return [primaryChange];
  if (scope?.crewMemberIds && scope.crewMemberIds.length === 0) return [primaryChange];
  const endDelta = Math.round(
    (localDayStartMs(primaryChange.newEnd) - localDayStartMs(primaryChange.oldEnd)) / MS_PER_DAY,
  );
  if (endDelta <= 0) return [primaryChange];
  const calendarConfig = { ...config, skipNonWorkingDays: false };
  const shifted = shiftJobsFromPoint(jobs, primaryChange.oldEnd, endDelta, 'days', calendarConfig, scope, untilDate);
  const followers = shifted.filter(c => c.jobId !== primaryChange.jobId && !c.skipped);
  return [primaryChange, ...followers];
};

/**
 * Pick the right cascade for an edited primary change: a moved start DAY cascades
 * by the day delta (`cascadeFromEdit`); a same-day time shift whose spill pushed
 * the END out cascades by the end-date extension (`cascadeFromTimeShift`). This is
 * what the cascade toggle should call so it works for both date moves and time
 * shifts.
 */
export const cascadeForPrimary = (
  jobs: Job[],
  primaryChange: ProposedChange,
  config: WorkingTimeConfig,
  scope?: CascadeScope,
  untilDate?: string,
): ProposedChange[] => {
  if (!primaryChange.oldStart) return [primaryChange];
  const startDayMoved = toLocalDateKey(new Date(primaryChange.newStart)) !== toLocalDateKey(new Date(primaryChange.oldStart));
  return startDayMoved
    ? cascadeFromEdit(jobs, primaryChange, config, untilDate, scope)
    : cascadeFromTimeShift(jobs, primaryChange, config, scope, untilDate);
};

/**
 * Re-derive the primary change from the user's current daily-hours edits. A start-
 * time edit on the first working day lives in the daily-hours map (not the staged
 * change), so when that day's start differs from its SEEDED baseline, rebuild the
 * change as a time-shift (re-flow + spill). A moved start DAY is already reflected
 * in the staged change, so that's returned as-is.
 *
 * The baseline is the same value the editor seeds the first day with — the change's
 * own dailyHours, else the job's dailyHours, else the change's start time-of-day.
 * Comparing against that (rather than the change's start time) means an UNEDITED
 * field — which equals the seed — is never mistaken for a time-shift, even when the
 * job's startDate time-of-day differs from its first-day window (e.g. an 8 AM
 * startDate on a job that actually works 1 PM–5 PM).
 */
export const primaryFromDailyEdits = (
  job: Job,
  staged: ProposedChange,
  dayHours: Record<string, { startTime: string; endTime: string }> | undefined,
  config: WorkingTimeConfig,
): ProposedChange => {
  if (!staged.oldStart) return staged;
  const startDayMoved = toLocalDateKey(new Date(staged.newStart)) !== toLocalDateKey(new Date(staged.oldStart));
  if (startDayMoved) return staged;
  const firstDay = spannedDayKeys(staged.newStart, staged.newEnd)[0];
  const editedStart = dayHours?.[firstDay]?.startTime;
  const baseStart = staged.dailyHours?.[firstDay]?.startTime
    ?? job.dailyHours?.[firstDay]?.startTime
    ?? hhmmOf(staged.newStart);
  if (editedStart && editedStart !== baseStart) {
    return timeShiftChange(job, `${firstDay}T${editedStart}:00`, config);
  }
  return staged;
};

export interface ReflowConflictResult {
  /** The edited job's resolved change (new per-day windows). */
  primary: ProposedChange;
  /** Other shared-crew jobs moved out of the way, in apply order. */
  displaced: ProposedChange[];
}

export interface ReflowConflictOptions {
  /** Simple mode: never extend existing days; all leftover goes to new days. */
  keepExistingDaysAsIs?: boolean;
  /** Local 'YYYY-MM-DD' cutoff: blockers whose original start is after this are
   *  left in place (not bumped). Empty/undefined = no limit. */
  untilDate?: string;
}

export interface PlaceHoursOptions {
  /** Simple mode: never Smart-extend the pinned days into adjacent free time. */
  keepExistingDaysAsIs?: boolean;
  /** Passed through to `onDayExhausted` so callers can bound blocker bumping. */
  untilDate?: string;
  /** Inclusive first working day to consider for NEW (leftover) placement. */
  fromKey: string;
  /** Whether a pinned day may grow EARLIER (default: yes). Callers that must not undo
   *  a user's start-later edit return false for that day. */
  canExtendEarlier?: (dayKey: string) => boolean;
  /** Called when a NEW day has no free slot. The caller may free space (e.g. bump
   *  blocking shared-crew jobs) and return true to retry the day with a fresh occupied
   *  read; return false (or omit the hook) to skip the day and count hours as unplaced.
   *  `coreLatestEndISO` is the latest end this core has placed so far. */
  onDayExhausted?: (dayKey: string, coreLatestEndISO: string) => boolean;
}

/**
 * Place `requiredHours` of work into conflict-free clock time: pinned days are kept
 * (and, in Smart mode, extended into adjacent free time), then leftover hours fill
 * working days from `fromKey` forward, reading busy time via `occupiedByDay`. Returns
 * the resulting per-day windows and any hours that could not be placed. This is the
 * shared placement core behind both `reflowAvoidingConflicts` (job cascade) and
 * `resolveShiftCascade` (shift cascade); the two differ only in the callbacks they pass.
 */
export const placeHoursConflictFree = (
  pinnedDayHours: Record<string, { startTime: string; endTime: string }>,
  requiredHours: number,
  occupiedByDay: (dayKey: string) => ClockInterval[],
  config: WorkingTimeConfig,
  opts: PlaceHoursOptions,
): { dayHours: Record<string, { startTime: string; endTime: string }>; unplaced: number } => {
  const result: Record<string, { startTime: string; endTime: string }> = {};
  const pinnedKeys = Object.keys(pinnedDayHours).sort();
  let pinnedTotal = 0;
  for (const k of pinnedKeys) {
    result[k] = { ...pinnedDayHours[k] };
    pinnedTotal += Math.max(0, hhmmToHours(pinnedDayHours[k].endTime) - hhmmToHours(pinnedDayHours[k].startTime));
  }
  let remaining = Math.round((requiredHours - pinnedTotal) * 10) / 10;

  // Smart: extend each pinned day into the free time adjacent to its window. Grow the
  // END later; grow the START earlier only when `canExtendEarlier` allows it.
  if (!opts.keepExistingDaysAsIs) {
    for (const k of pinnedKeys) {
      if (remaining <= 0) break;
      const free = freeIntervals(occupiedByDay(k), config);
      const win = { start: hhmmToHours(result[k].startTime), end: hhmmToHours(result[k].endTime) };
      const host = free.find((f) => f.start <= win.start + 1e-9 && f.end >= win.end - 1e-9);
      if (!host) continue;
      const canEarlier = opts.canExtendEarlier ? opts.canExtendEarlier(k) : true;
      let { start, end } = win;
      const takeLater = Math.min(host.end - end, remaining);
      end += takeLater; remaining = Math.round((remaining - takeLater) * 10) / 10;
      if (canEarlier) {
        const takeEarlier = Math.min(start - host.start, remaining);
        start -= takeEarlier; remaining = Math.round((remaining - takeEarlier) * 10) / 10;
      }
      result[k] = { startTime: hoursToHHMM(start), endTime: hoursToHHMM(end) };
    }
  }

  const latestEndISO = () => {
    const all = Object.keys(result).map((k) => `${k}T${result[k].endTime}:00`).sort();
    return all[all.length - 1] ?? `${opts.fromKey}T${hoursToHHMM(config.workDayStartHour)}:00`;
  };

  // Leftover hours onto working days from `fromKey` (inclusive). Step back one calendar
  // day so the first `advanceWorkingDays(+1)` lands on `fromKey` when it is a working day
  // (else on the next working day) — matching the job cascade's "strictly after the pinned
  // span" behavior when the caller passes the day after the span as `fromKey`.
  let cursor = new Date(`${opts.fromKey}T12:00:00`);
  cursor.setDate(cursor.getDate() - 1);
  for (let guard = 0; remaining > 0 && guard < 60; guard++) {
    cursor = advanceWorkingDays(cursor, 1, config);
    const dayKey = toLocalDateKey(cursor);
    const need = Math.min(remaining, config.workDayEndHour - config.workDayStartHour);
    let free = freeIntervals(occupiedByDay(dayKey), config);
    let slot = free.find((f) => f.end - f.start >= need - 1e-9) ?? free.find((f) => f.end - f.start >= 1e-9);
    if (!slot && opts.onDayExhausted) {
      const retry = opts.onDayExhausted(dayKey, latestEndISO());
      if (retry) { free = freeIntervals(occupiedByDay(dayKey), config); slot = free.find((f) => f.end - f.start >= 1e-9); }
    }
    if (slot) {
      const place = Math.min(need, slot.end - slot.start);
      result[dayKey] = { startTime: hoursToHHMM(slot.start), endTime: hoursToHHMM(slot.start + place) };
      remaining = Math.round((remaining - place) * 10) / 10;
    }
    // else: day unusable → loop advances to the next working day.
  }

  return { dayHours: result, unplaced: Math.max(0, remaining) };
};

/**
 * Re-place the edited job's hours conflict-free. Pins the user's day windows
 * (`pinnedDayHours`), keeps the job's total at `scheduledWindowHours`, and places
 * leftover hours into conflict-free clock time — Smart mode extends existing days
 * into adjacent free time first, then any remaining hours go onto new working days
 * (bumping fully-blocking shared-crew jobs past the project end, bounded by
 * `untilDate`). Placement is delegated to `placeHoursConflictFree`; this wrapper
 * supplies the shared-crew occupancy and does the blocker-bumping in `onDayExhausted`.
 *
 * `scopeOf` returns a job's shared-crew scope (caller wires `sharedCrewScope`),
 * keeping this function free of the crew/group dependency.
 */
export const reflowAvoidingConflicts = (
  job: Job,
  pinnedDayHours: Record<string, { startTime: string; endTime: string }>,
  jobs: Job[],
  scopeOf: (job: Job) => CascadeScope,
  config: WorkingTimeConfig,
  opts: ReflowConflictOptions = {},
): ReflowConflictResult => {
  const base = {
    jobId: job.id, jobName: job.name, jobNumber: job.jobNumber,
    oldStart: job.startDate ?? null, oldEnd: job.endDate ?? null,
  };
  const scope = scopeOf(job);
  const required = scheduledWindowHours(job, config);

  const displaced: ProposedChange[] = [];
  const displacedIds = new Set<string>();
  const occupiersExceptSelf = () => jobs.filter((j) => j.id !== job.id && !displacedIds.has(j.id));

  const pinnedKeys = Object.keys(pinnedDayHours).sort();
  // New days start on the working day strictly after the pinned span (unchanged behavior).
  const lastPinned = pinnedKeys[pinnedKeys.length - 1] ?? toLocalDateKey(new Date());
  const fromKey = toLocalDateKey(advanceWorkingDays(new Date(`${lastPinned}T12:00:00`), 1, config));

  const { dayHours: result } = placeHoursConflictFree(
    pinnedDayHours,
    required,
    (k) => occupiedIntervals(occupiersExceptSelf(), scope, k, config, job.id),
    config,
    {
      keepExistingDaysAsIs: opts.keepExistingDaysAsIs,
      untilDate: opts.untilDate,
      fromKey,
      // Only grow earlier when the user hasn't pushed this day's start later than its original.
      canExtendEarlier: (k) => {
        const originalStart = job.dailyHours?.[k]?.startTime;
        return originalStart === undefined
          || hhmmToHours(pinnedDayHours[k].startTime) <= hhmmToHours(originalStart) + 1e-9;
      },
      // Bump fully-blocking shared-crew jobs forward, then retry the day.
      onDayExhausted: (dayKey, coreLatestEndISO) => {
        const blockers = occupiersExceptSelf().filter(
          (j) => !j.is_locked && jobClockWindowOnDay(j, dayKey, config)
            && (!opts.untilDate || !j.startDate || toLocalDateKey(new Date(j.startDate)) <= opts.untilDate),
        );
        const dayEndISO = `${dayKey}T${hoursToHHMM(config.workDayEndHour)}:00`;
        const anchor = [coreLatestEndISO, dayEndISO, ...displaced.map((d) => d.newEnd)].sort().pop()!;
        for (const b of blockers) {
          displaced.push(placeAfterConflictFree(b, anchor, jobs, scopeOf(b), config, displacedIds));
          displacedIds.add(b.id);
        }
        return blockers.length > 0;
      },
    },
  );

  const keys = Object.keys(result).sort();
  const primary: ProposedChange = {
    ...base,
    newStart: `${keys[0]}T${result[keys[0]].startTime}:00`,
    newEnd: `${keys[keys.length - 1]}T${result[keys[keys.length - 1]].endTime}:00`,
    dailyHours: result,
  };
  return { primary, displaced };
};

export interface TimeShiftCascadeDecision {
  /** The changes to stage (primary first, then any followers). */
  changes: ProposedChange[];
  /** The cascade-toggle state to reflect after the shift. */
  cascadeOn: boolean;
}

/**
 * Decide what to stage — and what the cascade toggle should read — after the user
 * shifts a job's start time. If cascade is already ON (an explicit user choice),
 * RESPECT it: run the full cascade for the new start and keep the toggle on, so a
 * start-time edit behaves exactly like the toggle and followers update live
 * without a re-toggle. If cascade is OFF, auto-detect time-shift followers and
 * turn the toggle on only when there are any.
 */
export const resolveTimeShiftCascade = (
  jobs: Job[],
  primaryChange: ProposedChange,
  config: WorkingTimeConfig,
  scope: CascadeScope | undefined,
  cascadeOn: boolean,
  untilDate?: string,
): TimeShiftCascadeDecision => {
  if (cascadeOn) {
    return { changes: cascadeForPrimary(jobs, primaryChange, config, scope, untilDate), cascadeOn: true };
  }
  const cascaded = cascadeFromTimeShift(jobs, primaryChange, config, scope);
  const hasFollowers = cascaded.some(c => c.jobId !== primaryChange.jobId && !c.skipped);
  return { changes: hasFollowers ? cascaded : [primaryChange], cascadeOn: hasFollowers };
};

/**
 * Ids of moved followers (excluding the primary) that now land on or after the
 * earliest `after-limit` protected job — i.e. the cascade leapfrogged a job the
 * cutoff was meant to protect. Non-blocking; the UI surfaces it as a warning.
 */
export const cascadeLeapfrogIds = (
  changes: ProposedChange[],
  primaryJobId?: string,
): string[] => {
  const protectedDays = changes
    .filter(c => c.skipped === 'after-limit')
    .map(c => localDayStartMs(c.newStart));
  if (protectedDays.length === 0) return [];
  const earliest = Math.min(...protectedDays);
  return changes
    .filter(c => !c.skipped && c.jobId !== primaryJobId)
    .filter(c => localDayStartMs(c.newStart) >= earliest)
    .map(c => c.jobId);
};

/**
 * Move a single job to the next open slot after the last scheduled, non-locked
 * job. All other jobs are untouched. `referenceDate` anchors the result when no
 * other scheduled jobs exist (keeps the function pure — no Date.now() inside).
 */
export const moveJobToEnd = (
  jobs: Job[],
  jobId: string,
  config: WorkingTimeConfig,
  referenceDate: string,
): ProposedChange => {
  const job = jobs.find((j) => j.id === jobId);
  if (!job) throw new Error(`moveJobToEnd: job ${jobId} not found`);

  const base = {
    jobId: job.id,
    jobName: job.name,
    jobNumber: job.jobNumber,
    oldStart: job.startDate ?? null,
    oldEnd: job.endDate ?? null,
  };

  if (job.is_locked) {
    return { ...base, newStart: job.startDate ?? '', newEnd: job.endDate ?? '', skipped: 'locked' };
  }

  // Duration in ms, defaulting to a single working day.
  const start = effectiveStart(job, config);
  const end = effectiveEnd(job, config);
  const durationMs = start && end ? end.getTime() - start.getTime() : MS_PER_DAY;

  // Latest end among other scheduled, non-locked jobs.
  let lastEnd: Date | null = null;
  for (const j of jobs) {
    if (j.id === jobId || j.is_locked) continue;
    const e = effectiveEnd(j, config);
    if (e && (!lastEnd || e.getTime() > lastEnd.getTime())) lastEnd = e;
  }

  const anchor = lastEnd ?? new Date(referenceDate);
  const newStart = advanceWorkingDays(anchor, 1, config);
  newStart.setHours(config.workDayStartHour, 0, 0, 0);
  const newEnd = new Date(newStart.getTime() + durationMs);

  return { ...base, newStart: newStart.toISOString(), newEnd: newEnd.toISOString() };
};

/** Reassign a single job to an explicit slot. Pure recompute; ignores conflicts (non-blocking). */
export const moveJobToSlot = (
  jobs: Job[],
  jobId: string,
  newStart: string,
  newEnd: string,
): ProposedChange => {
  const job = jobs.find((j) => j.id === jobId);
  if (!job) throw new Error(`moveJobToSlot: job ${jobId} not found`);
  return {
    jobId: job.id,
    jobName: job.name,
    jobNumber: job.jobNumber,
    oldStart: job.startDate ?? null,
    oldEnd: job.endDate ?? null,
    newStart,
    newEnd,
  };
};

/**
 * Return the ids of other jobs scheduled on the SAME day the job is being moved
 * to. Jobs are single-day on the calendar, so conflicts are detected by start
 * day — matching exactly what the calendar shows.
 *
 * Non-blocking: callers surface a warning but do not prevent the move. Locked
 * jobs ARE reported (colliding with a locked commitment is what the user needs
 * to see). `newEnd` is accepted for signature stability but not used.
 */
export const detectConflicts = (
  jobs: Job[],
  jobId: string,
  newStart: string,
  _newEnd: string,
  config: WorkingTimeConfig,
): string[] => {
  const dropDay = toLocalDateKey(new Date(newStart));
  const conflicts: string[] = [];
  for (const j of jobs) {
    if (j.id === jobId) continue;
    const s = effectiveStart(j, config);
    if (s && toLocalDateKey(s) === dropDay) conflicts.push(j.id);
  }
  return conflicts;
};
