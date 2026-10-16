import type { CrewBreak, CrewMember, Job, JobCrewAllocation } from '../types';
import { allocCoversDay, allocDayWindow } from './scheduleEngine';
import { memberShiftDayHours, setMemberDayHoursPreservingSpan } from './crewHoursGrid';
import { resolveBreaks, unpaidFixedBreakHoursInWindow } from './crewBreaks';
import { resolveDayAvailability } from './crewAvailability';

/** One booking rewritten to fit a member's new schedule. `to === 0` removes it. */
export interface BookingTrim {
  jobId: string;
  jobNumber: string;
  shiftId?: string;
  memberId: string;
  dateKey: string;
  from: number;
  to: number;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const toH = (t: string) => { const [h, m] = t.split(':').map(Number); return h + (m || 0) / 60; };

/** Days whose schedule entry differs between two versions of a member. A profile-only
 *  edit yields none, so saving a name never rewrites a booking. */
const changedDays = (next: CrewMember, prev: CrewMember | undefined): string[] => {
  const a = prev?.schedule ?? {};
  const b = next.schedule ?? {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter(k => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null));
};

/** Hours of work the member's new day leaves inside a shift's window: the overlap of the
 *  two windows, less the unpaid breaks sitting in that overlap. */
const roomInsideWindow = (
  member: CrewMember,
  dateKey: string,
  win: { startTime: string; endTime: string },
  defaultBreaks: CrewBreak[],
): number => {
  const avail = resolveDayAvailability(member, dateKey, win);
  if (avail.off) return 0;
  const startTime = toH(avail.startTime) > toH(win.startTime) ? avail.startTime : win.startTime;
  const endTime = toH(avail.endTime) < toH(win.endTime) ? avail.endTime : win.endTime;
  const overlap = round1(Math.max(0, toH(endTime) - toH(startTime)));
  if (overlap <= 0) return 0;
  const breaks = resolveBreaks(member.schedule?.[dateKey], defaultBreaks);
  return round1(Math.max(0, overlap - unpaidFixedBreakHoursInWindow(breaks, startTime, endTime)));
};

/** Bookings that no longer fit a member's schedule, for the days that schedule just
 *  changed on.
 *
 *  Off means the whole person-day is gone, so the booking goes to zero. A working window
 *  that misses the shift entirely is a statement about where the SHIFT sits, not the
 *  person — those hours are left alone and flagged in the grid instead, because deleting
 *  a whole booking on a settings save is too destructive to do silently. */
export const availabilityTrims = (
  jobs: Job[],
  next: CrewMember,
  prev: CrewMember | undefined,
  defaultBreaks: CrewBreak[],
): BookingTrim[] => {
  const days = changedDays(next, prev);
  if (!days.length) return [];
  const trims: BookingTrim[] = [];
  for (const job of jobs) {
    if (job.is_locked) continue;
    const allocs: JobCrewAllocation[] = job.allocations ?? [];
    for (const dateKey of days) {
      // A day whose entry was DELETED makes no statement about the member, so it trims
      // nothing. Without this, clearing an entry would trim every booking on that day
      // down to the shift window less breaks.
      const entry = next.schedule?.[dateKey];
      if (!entry) continue;
      const off = !!entry.isOff;
      for (const alloc of allocs) {
        if (!allocCoversDay(alloc, dateKey)) continue;
        const from = memberShiftDayHours(alloc, next.id, dateKey);
        if (from <= 0) continue;
        const win = allocDayWindow(alloc, dateKey);
        const room = roomInsideWindow(next, dateKey, win, defaultBreaks);
        // No overlap on a working day: keep the hours, let the grid flag them.
        if (!off && room <= 0) continue;
        const to = off ? 0 : Math.min(from, room);
        if (to === from) continue;
        trims.push({ jobId: job.id, jobNumber: job.jobNumber, shiftId: alloc.id, memberId: next.id, dateKey, from, to });
      }
    }
  }
  return trims;
};

/** Apply trims, one new `Job` per affected job. Trims on the same job are folded
 *  together: separate writes to one job would clobber each other. */
export const applyAvailabilityTrims = (
  jobs: Job[],
  trims: BookingTrim[],
  weekendDays: number[],
  standardDay: number,
): Job[] => {
  if (!trims.length) return jobs;
  const byJob = new Map<string, BookingTrim[]>();
  for (const t of trims) byJob.set(t.jobId, [...(byJob.get(t.jobId) ?? []), t]);
  return jobs.map(job => {
    const mine = byJob.get(job.id);
    if (!mine) return job;
    return mine.reduce(
      (acc, t) => setMemberDayHoursPreservingSpan(acc, t.memberId, t.dateKey, t.to, weekendDays, standardDay, t.shiftId),
      job,
    );
  });
};
