import type { Job } from '../types';
import {
  ProposedChange, WorkingTimeConfig, CascadeScope, isNonWorkingDay, toLocalDateKey, formatDisplayDate,
  spannedDayKeys, occupiesWorkingDay,
} from './scheduleEngine';
import { jobDayWindow, withStagedWindow } from './productionBoard';

/** Two jobs share a crew when they have an individual member in common — the same
 *  person would work both jobs. */
export const jobsShareCrew = (a: Job, b: Job): boolean => {
  const aMembers = new Set(a.crewMemberIds || []);
  return (b.crewMemberIds || []).some(m => aMembers.has(m));
};

type Window = { startTime: string; endTime: string };
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
/** Two same-day windows overlap when each starts before the other ends. */
const windowsOverlap = (a: Window | null, b: Window | null): boolean =>
  !!a && !!b && toMin(a.startTime) < toMin(b.endTime) && toMin(b.startTime) < toMin(a.endTime);
/** Hours a window covers (0 when absent). */
const windowHours = (w: Window | null): number =>
  w ? Math.max(0, toMin(w.endTime) - toMin(w.startTime)) / 60 : 0;

/**
 * A CascadeScope limiting a cascade to jobs that share crew with `job`: the job's
 * own assigned members. Combined with scheduleEngine's member-overlap `isInScope`,
 * this matches `jobsShareCrew`.
 */
export const sharedCrewScope = (job: Job): CascadeScope => ({
  crewMemberIds: [...new Set<string>(job.crewMemberIds ?? [])],
});

export type IssueKind =
  | 'double-book' | 'weekend' | 'capacity' | 'past-due'
  | 'budget' | 'day-capacity';
export type IssueSeverity = 'high' | 'medium' | 'low';

export interface ScheduleIssue {
  jobId: string;
  jobName: string;
  kind: IssueKind;
  severity: IssueSeverity;
  message: string;
  /** Crew member this issue is about, when it's per-person (e.g. day-capacity). */
  memberId?: string;
  /** Condensed message for inline display next to that member. */
  shortMessage?: string;
}

/**
 * Detect scheduling issues in the PROPOSED world: committed jobs with the
 * staged (non-skipped) changes applied. Only changed jobs are evaluated as the
 * subject; conflicts are checked against the full proposed world.
 * Heuristic capacity (no per-job hours exist): default capacity (= workday
 * length) allows 1 job/day per member, so capacity overflow coincides with
 * double-booking under defaults. To avoid duplicate alerts, a capacity issue is
 * only raised when the same job/day is NOT already flagged as a double-book.
 */
export const detectIssues = (
  changes: ProposedChange[],
  jobs: Job[],
  config: WorkingTimeConfig,
  capacityHours: number,
): ScheduleIssue[] => {
  const applied = changes.filter(c => !c.skipped);
  if (applied.length === 0) return [];

  const changeById = new Map(applied.map(c => [c.jobId, c]));
  // Apply each staged change's re-flowed per-day windows so conflict checks read
  // the same hours the grid shows (morning vs afternoon, etc.), not just the day.
  const world: Job[] = jobs.map(j => {
    const c = changeById.get(j.id);
    return c ? withStagedWindow(j, c) : j;
  });

  const dailyCapacity = capacityHours || Math.max(1, config.workDayEndHour - config.workDayStartHour);

  const dayKeyOf = (iso: string) => toLocalDateKey(new Date(iso));
  const membersOf = (j: Job) => j.crewMemberIds || [];

  const issues: ScheduleIssue[] = [];

  for (const c of applied) {
    const subject = world.find(j => j.id === c.jobId);
    if (!subject) continue;
    const dayKey = dayKeyOf(c.newStart);

    if (isNonWorkingDay(new Date(c.newStart), config)) {
      issues.push({ jobId: c.jobId, jobName: c.jobName, kind: 'weekend', severity: 'medium',
        message: `${c.jobName} lands on a non-working day` });
    }

    const due = subject.customerWindow?.dueDate;
    if (due && dayKeyOf(c.newEnd) > due) {
      issues.push({ jobId: c.jobId, jobName: c.jobName, kind: 'past-due', severity: 'high',
        message: `${c.jobName} ends after the customer due date (${formatDisplayDate(due)})` });
    }

    const myMembers = new Set(membersOf(subject));
    // Every working day this job occupies — multi-day jobs conflict on any shared day.
    const subjectDays = spannedDayKeys(c.newStart, c.newEnd);
    if (myMembers.size > 0) {
      // A real double-book needs a shared member AND overlapping hours that day —
      // the same crew working one job in the morning and another in the afternoon
      // is not a conflict.
      const clash = world.find(other =>
        other.id !== subject.id &&
        jobsShareCrew(subject, other) &&
        subjectDays.some(dk =>
          occupiesWorkingDay(other.startDate, other.endDate, dk, config) &&
          windowsOverlap(jobDayWindow(subject, dk), jobDayWindow(other, dk)),
        ),
      );
      if (clash) {
        issues.push({ jobId: c.jobId, jobName: c.jobName, kind: 'double-book', severity: 'high',
          message: `${c.jobName} overlaps ${clash.name} on the same crew that day` });
      }

      // Capacity overflow: a member's total assigned hours that day exceed the daily
      // capacity. Suppressed when a double-book already covers the same job/day to
      // avoid duplicate-feeling alerts.
      if (!clash) {
        const over = [...myMembers].some(m =>
          subjectDays.some(dk => {
            const hours = world.reduce((sum, j) =>
              membersOf(j).includes(m) && occupiesWorkingDay(j.startDate, j.endDate, dk, config)
                ? sum + windowHours(jobDayWindow(j, dk))
                : sum, 0);
            return hours > dailyCapacity;
          }),
        );
        if (over) {
          issues.push({ jobId: c.jobId, jobName: c.jobName, kind: 'capacity', severity: 'medium',
            message: `Crew over capacity on ${formatDisplayDate(dayKey)}` });
        }
      }
    }
  }

  return issues;
};
