import type { CrewBreak, CrewMember, Job, JobCrewAllocation } from '../types';
import { toLocalDateKey, allocDayWindow, allocCoversDay } from './scheduleEngine';
import { availableHoursOn } from './crewAvailability';

export interface WeeklyHours {
  /** Available working hours across the week (weekdays the member isn't off). */
  capacity: number;
  /** Hours already committed to other jobs this week. */
  assigned: number;
  /** Hours still open to be assigned (never negative). */
  remaining: number;
}

export interface CommitmentOptions {
  /** Hours in a standard working day. Defaults to 8. */
  standardDay?: number;
  /** Skip this job when summing existing commitments (the one being assigned). */
  excludeJobId?: string;
  /** Skip this allocation when summing existing commitments. Use it when an editor
   *  holds a draft of that shift, so the saved copy isn't counted alongside it. */
  excludeAllocationId?: string;
  /** JS getDay() values that are non-working in the user's scheduling settings.
   *  Defaults to [0,6] (Sun/Sat) only when the caller doesn't know the config. */
  weekendDays?: number[];
  /** Company-default breaks, so a member-day's own window can be read net of unpaid
   *  time. Defaults to [] — a member with no schedule entry is on `standardDay` either
   *  way, so callers that don't pass it keep today's numbers. */
  defaultBreaks?: CrewBreak[];
}

type Options = CommitmentOptions;

const toH = (t: string) => { const [h, m] = t.split(':').map(Number); return h + (m || 0) / 60; };
const windowHours = (startTime: string, endTime: string): number =>
  Math.max(0, Math.round((toH(endTime) - toH(startTime)) * 10) / 10);

/** Length (hours) of a shift's window on one day, honoring per-day overrides. */
export const allocWindowHours = (alloc: JobCrewAllocation, dateKey: string): number => {
  const w = allocDayWindow(alloc, dateKey);
  return windowHours(w.startTime, w.endTime);
};

/** Length (hours) of a legacy (shift-less) job's window on one day: the per-day
 *  `dailyHours` window when present, else the standard working day. */
export const jobWindowHours = (job: Job, dateKey: string, standardDay: number): number => {
  const w = job.dailyHours?.[dateKey];
  return w ? windowHours(w.startTime, w.endTime) : standardDay;
};

/** One booking landing on a member's day: a shift of a job, or a legacy shift-less job. */
export interface DayCommitment {
  jobId: string;
  jobName: string;
  jobNumber?: string;
  /** The shift this booking belongs to. Absent for legacy (allocation-less) jobs. */
  shiftId?: string;
  shiftName?: string;
  /** The window worked that day, when the booking has one. */
  startTime?: string;
  endTime?: string;
  hours: number;
}

/** Everything `member` is booked to on one day, itemized. `committedHoursOnDay` is the
 *  sum of this list, so any surface showing the breakdown and any surface showing the
 *  total are reading the same traversal — they cannot drift apart. */
export const dayCommitments = (
  member: CrewMember,
  jobs: Job[],
  dateKey: string,
  opts: CommitmentOptions = {},
): DayCommitment[] => {
  const standardDay = opts.standardDay ?? 8;
  const { excludeJobId, excludeAllocationId } = opts;
  const out: DayCommitment[] = [];
  for (const job of jobs) {
    if (excludeJobId && job.id === excludeJobId) continue;
    if (job.allocations?.length) {
      for (const alloc of job.allocations) {
        if (excludeAllocationId && alloc.id === excludeAllocationId) continue;
        if (!alloc.memberIds?.includes(member.id)) continue;
        // Coverage first: a skipped day must not keep billing a stale granular entry.
        if (!allocCoversDay(alloc, dateKey)) continue;
        const memberMap = alloc.hoursAssignments?.[member.id];
        // A granular map is authoritative within a covered day.
        const hours = memberMap
          ? (memberMap[dateKey] !== undefined ? memberMap[dateKey] : 0)
          : allocWindowHours(alloc, dateKey);
        if (hours <= 0) continue;
        const w = allocDayWindow(alloc, dateKey);
        out.push({
          jobId: job.id, jobName: job.name, jobNumber: job.jobNumber,
          shiftId: alloc.id, shiftName: alloc.name,
          startTime: w.startTime, endTime: w.endTime, hours,
        });
      }
    } else if (job.startDate && job.crewMemberIds?.includes(member.id)) {
      const start = job.startDate.split('T')[0];
      const end = job.endDate ? job.endDate.split('T')[0] : start;
      if (dateKey < start || dateKey > end) continue;
      const hours = jobWindowHours(job, dateKey, standardDay);
      if (hours <= 0) continue;
      const w = job.dailyHours?.[dateKey];
      out.push({
        jobId: job.id, jobName: job.name, jobNumber: job.jobNumber,
        startTime: w?.startTime, endTime: w?.endTime, hours,
      });
    }
  }
  return out;
};

/** How many hours `member` is committed to across `jobs` on a given day key.
 *
 *  With no granular `hoursAssignments` entry, a member's hours are the length of the
 *  window they're scheduled in — the shift's, or a legacy job's day window. Falling back
 *  to a whole standard day per allocation fabricated hours: a 4h morning shift counted as
 *  a full day, and two shifts in one day counted as two full days. */
export const committedHoursOnDay = (
  member: CrewMember,
  jobs: Job[],
  dateKey: string,
  opts: CommitmentOptions = {},
): number =>
  dayCommitments(member, jobs, dateKey, opts).reduce((sum, c) => sum + c.hours, 0);

// Weekly capacity / committed / remaining hours for a crew member, used in the
// crew assignment list so schedulers can see who still has room this week.
export const computeWeeklyHours = (
  member: CrewMember,
  weekDays: Date[],
  jobs: Job[],
  opts: Options = {},
): WeeklyHours => {
  const standardDay = opts.standardDay ?? 8;
  const weekendDays = opts.weekendDays ?? [0, 6];
  let capacity = 0;
  let assigned = 0;
  for (const d of weekDays) {
    const dateKey = toLocalDateKey(d);
    const nonWorking = weekendDays.includes(d.getDay());
    // Their own day, not a blanket standard one: off is zero, a half day is half.
    if (!nonWorking) capacity += availableHoursOn(member, dateKey, standardDay, opts.defaultBreaks ?? []);
    assigned += committedHoursOnDay(member, jobs, dateKey, { ...opts, standardDay });
  }
  return { capacity, assigned, remaining: Math.max(0, capacity - assigned) };
};
