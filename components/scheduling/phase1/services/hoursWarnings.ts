import type { Job } from '../types';
import type { ScheduleIssue } from './rescheduleIssues';
import { formatDisplayDate } from './scheduleEngine';
import { memberJobDayHours } from './crewHoursGrid';

interface DayHours { startTime: string; endTime: string }

/** Hours in a single day window, e.g. 08:00–16:00 = 8. Never negative. */
const dayLength = (h: DayHours | undefined): number => {
  if (!h) return 0;
  const [sh, sm] = (h.startTime || '08:00').split(':').map(Number);
  const [eh, em] = (h.endTime || '17:00').split(':').map(Number);
  return Math.max(0, (eh + em / 60) - (sh + sm / 60));
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export interface HoursWarningArgs {
  jobId: string;
  jobName: string;
  /** Working-day keys (YYYY-MM-DD) the edited job spans, staged. */
  stagedDays: string[];
  /** Staged per-day hours for the edited job, keyed by day. */
  dailyHours: Record<string, DayHours>;
  /** Staged crew assigned to the edited job. */
  crew: { id: string; name: string }[];
  /** Estimated production hours for the job's work order (0 if none). */
  estHours: number;
  /** All other jobs on the board (everything except the edited job). */
  otherJobs: Job[];
  /** Per-crew daily capacity in hours. */
  capacityHours: number;
  /** Standard workday length, used as the fallback for other jobs' hours. */
  standardDay: number;
}

/**
 * Advisory warnings shown live while editing one job's schedule. Pure: all
 * inputs are the STAGED (unsaved) edits plus the rest of the board, so the
 * result tracks what the user is currently scheduling. Two kinds:
 *  - 'budget': per-person labor hours scheduled exceed the work-order estimate.
 *  - 'day-capacity': a crew member's hours across ALL jobs on a day exceed the cap.
 * Only emitted when strictly over the limit. Never blocks; not auto-fixable.
 */
export const detectHoursWarnings = (args: HoursWarningArgs): ScheduleIssue[] => {
  const { jobId, jobName, stagedDays, dailyHours, crew, estHours, otherJobs, capacityHours, standardDay } = args;
  const issues: ScheduleIssue[] = [];

  // Budget: sum daily hours across staged days, multiplied by crew size.
  const perPersonHours = stagedDays.reduce((sum, day) => sum + dayLength(dailyHours[day]), 0);
  const projected = round1(perPersonHours * crew.length);
  if (estHours > 0 && projected > estHours) {
    issues.push({
      jobId, jobName, kind: 'budget', severity: 'low',
      message: `Over estimate by ${round1(projected - estHours).toFixed(1)}h — scheduling ${projected.toFixed(1)}h against a ${estHours.toFixed(1)}h estimate.`,
    });
  }

  // Day capacity: for each member, on each staged day, this job's staged hours
  // plus the member's hours from every other job occupying that day.
  for (const day of stagedDays) {
    const thisJobHours = dayLength(dailyHours[day]);
    for (const member of crew) {
      const otherHours = otherJobs.reduce(
        (sum, j) => j.id === jobId ? sum : sum + memberJobDayHours(j, member.id, day, standardDay),
        0,
      );
      const total = round1(thisJobHours + otherHours);
      if (total > capacityHours) {
        const compactDay = new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        issues.push({
          jobId, jobName, kind: 'day-capacity', severity: 'medium',
          memberId: member.id,
          message: `${formatDisplayDate(day)}: ${member.name} over capacity — ${total.toFixed(1)}h scheduled (cap ${capacityHours.toFixed(1)}h).`,
          shortMessage: `${compactDay}: over capacity — ${total.toFixed(1)}h scheduled (cap ${capacityHours.toFixed(1)}h)`,
        });
      }
    }
  }

  return issues;
};
