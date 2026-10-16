import type { CrewMember, Job, JobCrewAllocation, WorkOrder, CrewBreak } from '../types';
import { workingDayKeys, toLocalDateKey, allocDayWindow, allocCoversDay, jobWorkedDayKeys } from './scheduleEngine';
import { computeWeeklyHours, allocWindowHours, jobWindowHours } from './crewWeeklyHours';
import { jobColor, jobDayWindow } from './productionBoard';
import { resolveBreaks, unpaidFixedBreakHoursInWindow, unpaidFloatingBreakHours } from './crewBreaks';
import { resolveDayAvailability, availableHoursOn, windowOutsideAvailability, type DayAvailability } from './crewAvailability';

export interface MemberDayCell {
  jobId: string; jobNumber: string; jobName: string; hours: number; color: string;
  /** The shift (allocation) this chip belongs to. Undefined for legacy no-allocation jobs. */
  shiftId?: string;
  shiftName?: string;
  startTime?: string; endTime?: string;
  /** Scheduled/typed hours before unpaid breaks were carved out (for the editor + tooltip). Defaults to `hours` when no break applies. */
  grossHours?: number;
  /** Unpaid break time carved out of this chip (hours). Omitted when none. */
  unpaidBreakHours?: number;
  /** Label of the break that was carved (for the hover breakdown). */
  breakLabel?: string;
  /** The member is off this day, yet this booking sits on it. Advisory only. */
  onOffDay?: boolean;
  /** Hours of this chip's window falling before / after the member's working day.
   *  Absent when the window sits inside their hours. */
  outsideAvailability?: { before: number; after: number };
  /** Hours booked past what the member can work this day. Absent when within it. */
  overAvailableHours?: number;
}
export interface MemberRow {
  memberId: string;
  name: string;
  role?: string;
  photo?: string;
  color?: string;
  cellsByDay: Record<string, MemberDayCell[]>;
  offByDay: Record<string, boolean>;
  weekTotal: number;
  capacity: number;
  remaining: number;
  overCapacity: boolean;
  /** Effective breaks per working day key (resolved default-or-override). */
  breaksByDay: Record<string, CrewBreak[]>;
  /** Resolved availability window per day key (schedule entry or default window). */
  availByDay: Record<string, DayAvailability>;
  /** Worked job hours + paid break hours for the week. */
  paidHours: number;
  /** Hours the member can work each day: 0 when off, their own window less the unpaid
   *  breaks inside it when they have one, else the standard day. The day totals read the
   *  same figure, so a column footer can never disagree with the chips above it. */
  availableHoursByDay: Record<string, number>;
}
export interface JobShiftSummary { shiftId: string; name: string; startTime: string; endTime: string; days: string[]; }

export interface JobSummary {
  jobId: string; jobNumber: string; jobName: string; address: string; color: string;
  estimate: number; required: number; assigned: number; missing: number;
  /** The job's working days that fall within this week, in order. */
  days: string[];
  /** One entry per shift (allocation); `days` filtered to the sidebar period. */
  shifts: JobShiftSummary[];
}
/** Per-day roll-up across all crew: hours assigned vs. total available capacity. */
export interface DayTotal { assigned: number; capacity: number; }
export interface CrewHoursGridModel {
  dayKeys: string[];
  rows: MemberRow[];
  jobs: JobSummary[];
  /** day key -> assigned/capacity hours summed over every member. */
  dayTotals: Record<string, DayTotal>;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Estimate and this-week's prorated required hours for a job. */
export const requiredHoursForWeek = (
  job: Job,
  workOrders: WorkOrder[],
  weekKeys: string[],
  weekendDays: number[],
): { estimate: number; required: number } => {
  const estimate = workOrders.find(w => w.id === job.workOrderId)?.totalProductionHours ?? 0;
  if (!estimate || !job.startDate) return { estimate, required: 0 };
  const allKeys = jobWorkedDayKeys(job, weekendDays);
  const total = allKeys.length;
  if (!total) return { estimate, required: 0 };
  const inWeek = allKeys.filter(k => weekKeys.includes(k)).length;
  return { estimate, required: round1((estimate * inWeek) / total) };
};

/** Hours a member is booked to one job on one day: granular if set, else the
 *  day's scheduled window when the day falls in the allocation span. Mirrors crewWeeklyHours. */
export const memberJobDayHours = (
  job: Job,
  memberId: string,
  dateKey: string,
  standardDay: number,
): number => {
  if (job.allocations?.length) {
    let total = 0;
    for (const alloc of job.allocations) {
      if (!alloc.memberIds?.includes(memberId)) continue;
      // Coverage first — see memberShiftDayHours.
      if (!allocCoversDay(alloc, dateKey)) continue;
      const memberMap = alloc.hoursAssignments?.[memberId];
      if (memberMap) {
        // Granular map is authoritative within a covered day: only days explicitly set count.
        if (memberMap[dateKey] !== undefined) total += memberMap[dateKey];
      } else {
        // No granular data for this member: fall back to the SHIFT's window on this day.
        total += allocWindowHours(alloc, dateKey);
      }
    }
    return total;
  }
  if (job.startDate && job.crewMemberIds?.includes(memberId)) {
    const start = job.startDate.split('T')[0];
    const end = (job.endDate ?? job.startDate).split('T')[0];
    if (dateKey >= start && dateKey <= end) return jobWindowHours(job, dateKey, standardDay);
  }
  return 0;
};

/** Hours a member is booked to ONE shift on a day: granular map if present, else
 *  the shift's window length across its span. 0 when the member isn't in the shift
 *  or the day falls outside it. */
export const memberShiftDayHours = (alloc: JobCrewAllocation, memberId: string, dateKey: string): number => {
  if (!alloc.memberIds?.includes(memberId)) return 0;
  // Coverage first: a skipped day contributes nothing even if a granular entry survives
  // on it, because the entry is kept (not purged) so re-including the day restores it.
  if (!allocCoversDay(alloc, dateKey)) return 0;
  const map = alloc.hoursAssignments?.[memberId];
  if (map) return map[dateKey] !== undefined ? map[dateKey] : 0;
  return allocWindowHours(alloc, dateKey);
};

/** Total hours booked to a job across all its members on this week's days. */
export const assignedHoursForJobInWeek = (job: Job, weekKeys: string[], standardDay: number): number => {
  const memberIds = new Set<string>(job.crewMemberIds ?? []);
  job.allocations?.forEach(a => a.memberIds?.forEach(m => memberIds.add(m)));
  let total = 0;
  for (const m of memberIds) for (const k of weekKeys) total += memberJobDayHours(job, m, k, standardDay);
  return round1(total);
};

/** Like assignedHoursForJobInWeek, but net of unpaid FIXED breaks that fall inside
 *  the job's window on each member's working day. Floating breaks are not subtracted
 *  (they are not attributable to a specific job). Falls back to gross when a member
 *  is unknown/off or the job has no window that day. */
export const assignedHoursForJobInWeekNet = (
  job: Job,
  weekKeys: string[],
  standardDay: number,
  members: CrewMember[],
  defaultBreaks: CrewBreak[],
): number => {
  const byId = new Map(members.map(m => [m.id, m]));
  const memberIds = new Set<string>(job.crewMemberIds ?? []);
  job.allocations?.forEach(a => a.memberIds?.forEach(m => memberIds.add(m)));
  let total = 0;
  for (const id of memberIds) {
    const member = byId.get(id);
    for (const k of weekKeys) {
      const hrs = memberJobDayHours(job, id, k, standardDay);
      if (hrs <= 0) continue;
      const off = !!member?.schedule?.[k]?.isOff;
      const w = jobDayWindow(job, k);
      const carve = (!off && member && w)
        ? Math.min(hrs, unpaidFixedBreakHoursInWindow(resolveBreaks(member.schedule?.[k], defaultBreaks), w.startTime, w.endTime))
        : 0;
      total += hrs - carve;
    }
  }
  return round1(total);
};

/** Jobs (non-cancelled) whose working-day span overlaps the given week. */
export const jobsScheduledInWeek = (jobs: Job[], weekKeys: string[], weekendDays: number[]): Job[] =>
  jobs.filter(j => {
    if (j.stage === 'Cancelled' || !j.startDate) return false;
    const keys = jobWorkedDayKeys(j, weekendDays);
    return keys.some(k => weekKeys.includes(k));
  });

/** Job summaries for the sidebar over an arbitrary set of working-day keys.
 *  Independent of crew rows — used by the grid (one week) and the Jobs sidebar
 *  (week / month / year). */
export const buildJobSummaries = (
  jobs: Job[],
  workOrders: WorkOrder[],
  dayKeys: string[],
  weekendDays: number[],
  standardDay: number = 8,
  members: CrewMember[] = [],
  defaultBreaks: CrewBreak[] = [],
): JobSummary[] =>
  jobsScheduledInWeek(jobs, dayKeys, weekendDays).map(j => {
    const { estimate, required } = requiredHoursForWeek(j, workOrders, dayKeys, weekendDays);
    const assigned = assignedHoursForJobInWeekNet(j, dayKeys, standardDay, members, defaultBreaks);
    const jobKeys = new Set(jobWorkedDayKeys(j, weekendDays));
    return {
      jobId: j.id, jobNumber: j.jobNumber, jobName: j.name, address: j.address, color: jobColor(j.id),
      estimate, required, assigned,
      missing: estimate > 0 ? Math.max(0, round1(required - assigned)) : 0,
      days: dayKeys.filter(k => jobKeys.has(k)),
      shifts: (j.allocations ?? [])
        .filter(a => a.startDate)
        .map(a => {
          const allocKeys = new Set(workingDayKeys(`${a.startDate}T12:00:00`, `${a.endDate || a.startDate}T12:00:00`, weekendDays));
          return { shiftId: a.id, name: a.name, startTime: a.startTime, endTime: a.endTime, days: dayKeys.filter(k => allocKeys.has(k)) };
        }),
    };
  });

/** Working-day keys for the sidebar's period, anchored to the grid's current date.
 *  Week reuses the grid's already-computed `weekDayKeys` (identical scope); month and
 *  year enumerate the calendar period and drop non-working weekdays. */
export const periodDayKeys = (
  currentDate: Date,
  period: 'week' | 'month' | 'year',
  weekendDays: number[],
  weekDayKeys: string[],
): string[] => {
  if (period === 'week') return weekDayKeys;
  const y = currentDate.getFullYear();
  const [first, last] = period === 'month'
    ? [new Date(y, currentDate.getMonth(), 1), new Date(y, currentDate.getMonth() + 1, 0)]
    : [new Date(y, 0, 1), new Date(y, 11, 31)];
  // Anchor at local noon: a bare 'YYYY-MM-DD' parses as UTC midnight and shifts back
  // a day in negative-offset zones, dropping a boundary day vs. the local calendar.
  return workingDayKeys(`${toLocalDateKey(first)}T12:00:00`, `${toLocalDateKey(last)}T12:00:00`, weekendDays);
};

/** Distribute a weekly total as whole hours across days; remainder to earliest days. */
export const spreadWeeklyHours = (total: number, dayKeys: string[]): Record<string, number> => {
  const out: Record<string, number> = {};
  const n = dayKeys.length;
  if (n === 0 || total <= 0) return out;
  const base = Math.floor(total / n);
  let rem = total - base * n;
  for (const k of dayKeys) {
    out[k] = base + (rem > 0 ? 1 : 0);
    if (rem > 0) rem--;
  }
  return out;
};

/** Days a member can be booked to a job this week: the job's working days that fall in
 *  the week.
 *
 *  Days the member is off are INCLUDED. Somebody occasionally has to be booked onto a day
 *  off — a callout, a deadline — and withholding the day only left the scheduler with an
 *  empty list and no way through. The day off is warned about at assign time instead. */
export const assignableDayKeys = (job: Job, weekKeys: string[], weekendDays: number[]): string[] => {
  if (!job.startDate) return [];
  const jobKeys = new Set(jobWorkedDayKeys(job, weekendDays));
  return weekKeys.filter(k => jobKeys.has(k));
};

/** Why there is no day to book on, or null when there is one. Both causes are about the
 *  JOB — a member being off no longer empties the list, it only earns a warning — and one
 *  message covering both told the scheduler nothing they could act on. */
export type NoEligibleDaysReason =
  /** The job has no dates yet, so it has no days to assign on any week. */
  | { kind: 'unscheduled' }
  /** The job runs, but not on any working day of this week. `jobDays` is when it does. */
  | { kind: 'notThisWeek'; jobDays: string[] };

export const noEligibleDaysReason = (
  job: Job,
  weekKeys: string[],
  weekendDays: number[],
): NoEligibleDaysReason | null => {
  if (assignableDayKeys(job, weekKeys, weekendDays).length) return null;
  if (!job.startDate) return { kind: 'unscheduled' };
  return { kind: 'notThisWeek', jobDays: jobWorkedDayKeys(job, weekendDays) };
};

const ensureAllocations = (job: Job): JobCrewAllocation[] => {
  if (job.allocations?.length) return job.allocations.map(a => ({ ...a }));
  // Seed the synthesized allocation with the job's existing crew so editing one
  // member's hours doesn't drop everyone assigned via crewMemberIds.
  return [{
    id: `alloc-${job.id}`, name: 'Crew',
    startDate: (job.startDate ?? '').split('T')[0],
    endDate: (job.endDate ?? job.startDate ?? '').split('T')[0],
    startTime: '08:00', endTime: '17:00', memberIds: [...(job.crewMemberIds ?? [])],
  }];
};

const withFlattenedCrew = (job: Job, allocs: JobCrewAllocation[]): Job => ({
  ...job,
  allocations: allocs,
  crewMemberIds: Array.from(new Set(allocs.flatMap(a => a.memberIds ?? []))),
});

/** The shift a write targets: the one matching `shiftId`, else the primary (first). */
const pickAlloc = (allocs: JobCrewAllocation[], shiftId?: string): JobCrewAllocation =>
  (shiftId && allocs.find(a => a.id === shiftId)) || allocs[0];

/** Set (or clear, when hours<=0) a member's hours for one day on one job's primary allocation. */
export const setMemberDayHours = (job: Job, memberId: string, dateKey: string, hours: number, shiftId?: string): Job => {
  const allocs = ensureAllocations(job);
  const alloc = pickAlloc(allocs, shiftId);
  const ha: Record<string, Record<string, number>> = { ...(alloc.hoursAssignments ?? {}) };
  const days = { ...(ha[memberId] ?? {}) };
  if (hours > 0) days[dateKey] = hours; else delete days[dateKey];
  if (Object.keys(days).length) ha[memberId] = days; else delete ha[memberId];
  alloc.hoursAssignments = ha;
  const stillHas = !!ha[memberId];
  let memberIds = alloc.memberIds ?? [];
  if (stillHas && !memberIds.includes(memberId)) memberIds = [...memberIds, memberId];
  if (!stillHas) memberIds = memberIds.filter(id => id !== memberId);
  alloc.memberIds = memberIds;
  // A member dropped from the shift takes their window overrides with them.
  if (!stillHas && alloc.memberDailyWindows?.[memberId]) {
    const { [memberId]: _gone, ...rest } = alloc.memberDailyWindows;
    alloc.memberDailyWindows = Object.keys(rest).length ? rest : undefined;
  }
  return withFlattenedCrew(job, allocs);
};

/** Whether a member is assigned to a job — on its flattened crew or on any of its
 *  shifts. Drives which jobs the Assign Hours modal offers for that member. */
export const isMemberOnJob = (job: Job, memberId: string): boolean =>
  !!job.crewMemberIds?.includes(memberId) ||
  (job.allocations ?? []).some(a => a.memberIds?.includes(memberId));

/** Set (or clear, when `window` is null) a member's working window for one day on one
 *  shift. The override only changes what times the member works that day — their
 *  assigned hours stay in `hoursAssignments`. */
export const setMemberDayWindow = (
  job: Job,
  memberId: string,
  dateKey: string,
  window: { startTime: string; endTime: string } | null,
  shiftId?: string,
): Job => {
  const allocs = ensureAllocations(job);
  const alloc = pickAlloc(allocs, shiftId);
  const all = { ...(alloc.memberDailyWindows ?? {}) };
  const days = { ...(all[memberId] ?? {}) };
  if (window) days[dateKey] = window; else delete days[dateKey];
  if (Object.keys(days).length) all[memberId] = days; else delete all[memberId];
  alloc.memberDailyWindows = Object.keys(all).length ? all : undefined;
  return withFlattenedCrew(job, allocs);
};

/** Set (or clear) a member's hours for one day on the primary allocation while
 *  preserving their other days. A member assigned without a granular per-day map
 *  shows the window-fallback hours on every span day (see memberJobDayHours); writing
 *  a single day would turn the map granular and silently drop every other (unset) day
 *  to zero. To prevent that, when the member has no granular map yet we first
 *  materialize the window hours across their working span, then apply the edit. */
export const setMemberDayHoursPreservingSpan = (
  job: Job,
  memberId: string,
  dateKey: string,
  hours: number,
  weekendDays: number[],
  standardDay: number,
  shiftId?: string,
): Job => {
  const alloc = pickAlloc(ensureAllocations(job), shiftId);
  const granular = alloc.hoursAssignments?.[memberId];
  const isImplicit = alloc.memberIds?.includes(memberId) && !(granular && Object.keys(granular).length);
  let next = job;
  if (isImplicit) {
    // Anchor at local noon: a bare 'YYYY-MM-DD' parses as UTC midnight and shifts back
    // a day in negative-offset zones, dropping the span's last day vs. the display.
    const atNoon = (d: string) => (d.includes('T') ? d : `${d}T12:00:00`);
    const start = (alloc.startDate ?? job.startDate ?? '').split('T')[0];
    const end = (alloc.endDate ?? alloc.startDate ?? job.endDate ?? job.startDate ?? '').split('T')[0];
    if (start) {
      for (const k of workingDayKeys(atNoon(start), atNoon(end || start), weekendDays)) {
        if (k === dateKey) continue; // the edited day is written below
        const wh = jobWindowHours(job, k, standardDay);
        if (wh > 0) next = setMemberDayHours(next, memberId, k, wh, shiftId);
      }
    }
  }
  return setMemberDayHours(next, memberId, dateKey, hours, shiftId);
};

/** Hand one day's hours on one shift from one member to another: the source day is
 *  cleared and the hours land on the destination, added to whatever they already hold
 *  there. Both writes chain onto one Job value, since both members hang off the same
 *  job and two separate writes would clobber each other. `hours` is the gross
 *  (scheduled) figure — the destination's own unpaid break is carved on read. */
export const transferMemberDayHours = (
  job: Job,
  fromMemberId: string,
  toMemberId: string,
  dateKey: string,
  hours: number,
  weekendDays: number[],
  standardDay: number,
  shiftId?: string,
): Job => {
  if (fromMemberId === toMemberId || !(hours > 0)) return job;
  const alloc = pickAlloc(ensureAllocations(job), shiftId);
  const existing = memberShiftDayHours(alloc, toMemberId, dateKey);
  const cleared = setMemberDayHoursPreservingSpan(job, fromMemberId, dateKey, 0, weekendDays, standardDay, shiftId);
  return setMemberDayHoursPreservingSpan(cleared, toMemberId, dateKey, round1(existing + hours), weekendDays, standardDay, shiftId);
};

/** Replace a member's days for a job (clears their existing days, then applies hoursByDay). */
export const assignMemberWeek = (job: Job, memberId: string, hoursByDay: Record<string, number>, shiftId?: string): Job => {
  const allocs = ensureAllocations(job);
  const alloc = pickAlloc(allocs, shiftId);
  const ha: Record<string, Record<string, number>> = { ...(alloc.hoursAssignments ?? {}) };
  delete ha[memberId];
  alloc.hoursAssignments = ha;
  alloc.memberIds = (alloc.memberIds ?? []).filter(id => id !== memberId);
  let next = withFlattenedCrew(job, allocs);
  for (const [k, h] of Object.entries(hoursByDay)) next = setMemberDayHours(next, memberId, k, h, shiftId);
  return next;
};

/** Build the full crew-hours view model for one week. */
export const buildCrewHoursGrid = (
  members: CrewMember[],
  jobs: Job[],
  workOrders: WorkOrder[],
  weekDays: Date[],
  weekendDays: number[],
  standardDay: number,
  defaultBreaks: CrewBreak[] = [],
  defaultWindow: { startTime: string; endTime: string } = { startTime: '08:00', endTime: '17:00' },
): CrewHoursGridModel => {
  const dayKeys = weekDays.map(toLocalDateKey);
  const weekJobs = jobsScheduledInWeek(jobs, dayKeys, weekendDays);

  const rows: MemberRow[] = members.map(m => {
    // Capacity is the member's full working day — breaks no longer shrink it.
    // assigned/weekTotal is derived from the cells below (net of unpaid breaks) so the
    // WEEK column always tracks the worked hours the chips show.
    const baseCapacity = computeWeeklyHours(m, weekDays, [], { standardDay, weekendDays, defaultBreaks }).capacity;
    const cellsByDay: Record<string, MemberDayCell[]> = {};
    const offByDay: Record<string, boolean> = {};
    const availByDay: Record<string, DayAvailability> = {};
    const availableHoursByDay: Record<string, number> = {};
    const breaksByDay: Record<string, CrewBreak[]> = {};
    let weekTotal = 0;
    for (const key of dayKeys) {
      offByDay[key] = !!m.schedule?.[key]?.isOff;
      availByDay[key] = resolveDayAvailability(m, key, defaultWindow);
      availableHoursByDay[key] = availableHoursOn(m, key, standardDay, defaultBreaks);
      // Breaks only count on working, non-off days (dayKeys are already working days).
      const dayBreaks = offByDay[key] ? [] : resolveBreaks(m.schedule?.[key], defaultBreaks);
      breaksByDay[key] = dayBreaks;
      const cells: MemberDayCell[] = [];
      for (const j of weekJobs) {
        // Emit one chip per shift (allocation) the member works that day; a legacy
        // job with no allocations keeps a single per-job chip.
        const pushCell = (
          gross: number,
          w: { startTime: string; endTime: string } | null,
          shiftId?: string,
          shiftName?: string,
        ) => {
          if (gross <= 0) return;
          // Unpaid fixed breaks inside this window carve worked hours off the chip.
          const carve = w ? Math.min(gross, unpaidFixedBreakHoursInWindow(dayBreaks, w.startTime, w.endTime)) : 0;
          const carvingBreak = (carve > 0 && w)
            ? dayBreaks.find(b => !b.paid && b.startTime && b.startTime >= w.startTime && b.startTime < w.endTime)
            : undefined;
          // WHEN: does this window fall outside their day? An off day is reported on its
          // own — windowOutsideAvailability stays silent for it, so it isn't double-flagged.
          const avail = availByDay[key];
          const fit = w ? windowOutsideAvailability(avail, w) : { before: 0, after: 0, outside: false };
          // HOW MUCH: hours booked past the day they can work. Both flags can fire at once.
          const over = round1(Math.max(0, gross - availableHoursByDay[key]));
          cells.push({
            jobId: j.id, jobNumber: j.jobNumber, jobName: j.name, shiftId, shiftName,
            hours: round2(gross - carve), grossHours: gross,
            color: jobColor(j.id), startTime: w?.startTime, endTime: w?.endTime,
            ...(carve > 0 ? { unpaidBreakHours: carve, breakLabel: carvingBreak?.label } : {}),
            ...(avail.off ? { onOffDay: true } : {}),
            ...(fit.outside ? { outsideAvailability: { before: fit.before, after: fit.after } } : {}),
            ...(over > 0 ? { overAvailableHours: over } : {}),
          });
        };
        if (j.allocations?.length) {
          for (const alloc of j.allocations) {
            // The chip's window is the MEMBER's: their personal per-day override when one
            // was set (Assign Hours modal), else the shift's window that day. Break
            // carving and the outside-availability flags follow the same window.
            const memberWindow = alloc.memberDailyWindows?.[m.id]?.[key] ?? allocDayWindow(alloc, key);
            // Suppress the lone default shift's name — chips read as the job alone.
            pushCell(memberShiftDayHours(alloc, m.id, key), memberWindow, alloc.id, j.allocations.length >= 2 ? alloc.name : undefined);
          }
        } else {
          pushCell(memberJobDayHours(j, m.id, key, standardDay), jobDayWindow(j, key), undefined, undefined);
        }
      }
      const startMin = (t?: string) => { if (!t) return Number.POSITIVE_INFINITY; const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
      cells.sort((a, b) => startMin(a.startTime) - startMin(b.startTime));
      cellsByDay[key] = cells;
      // Unpaid floating breaks (no set time) reduce the day's worked total, not any chip.
      const dayWorked = cells.reduce((s, c) => s + c.hours, 0);
      weekTotal += Math.max(0, round2(dayWorked - unpaidFloatingBreakHours(dayBreaks)));
    }
    weekTotal = round1(weekTotal);
    const capacity = Math.max(0, round1(baseCapacity));
    return {
      memberId: m.id, name: m.name, role: m.role, photo: m.photo, color: m.color,
      cellsByDay, offByDay, breaksByDay, availByDay, availableHoursByDay,
      weekTotal, capacity, remaining: Math.max(0, round1(capacity - weekTotal)),
      overCapacity: weekTotal > capacity,
      paidHours: weekTotal,
    };
  });

  const jobSummaries = buildJobSummaries(jobs, workOrders, dayKeys, weekendDays, standardDay, members, defaultBreaks);

  // Per-day roll-up: assigned = sum of every member's chips that day; capacity =
  // standardDay for each member who isn't off (dayKeys are already working days).
  const dayTotals: Record<string, DayTotal> = {};
  for (const key of dayKeys) {
    let assigned = 0;
    let capacity = 0;
    for (const row of rows) {
      capacity += row.availableHoursByDay[key] ?? standardDay;
      const worked = (row.cellsByDay[key] ?? []).reduce((s, c) => s + c.hours, 0);
      assigned += Math.max(0, worked - unpaidFloatingBreakHours(row.breaksByDay[key] ?? []));
    }
    dayTotals[key] = { assigned: round1(assigned), capacity: round1(capacity) };
  }

  return { dayKeys, rows, jobs: jobSummaries, dayTotals };
};
