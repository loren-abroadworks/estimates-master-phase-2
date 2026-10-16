import type { Job } from '../types';
import { WorkingTimeConfig, toLocalDateKey, occupiesWorkingDay } from './scheduleEngine';
import { visibleWeekDays, BoardLane, BoardCard, cardHours, shiftCardHours } from './productionBoard';

export interface MonthDay { date: Date; key: string; inMonth: boolean; }
export interface MonthWeek { days: MonthDay[]; }

/** Week rows covering the month containing `refDate`. Grid starts on the Sunday
 *  on/before the 1st and ends on the week containing the last day, so the first
 *  and last rows can include adjacent-month days (inMonth=false). Each week's
 *  days are filtered to working weekdays (weekends dropped per config). */
export const buildMonthWeeks = (refDate: Date, config: WorkingTimeConfig): MonthWeek[] => {
  const year = refDate.getFullYear();
  const month = refDate.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0); // last day of month
  const gridStart = new Date(year, month, 1 - first.getDay()); // back to Sunday

  const weeks: MonthWeek[] = [];
  const cursor = new Date(gridStart);
  // Guard at 6 rows (max any month spans) to avoid any chance of a runaway loop.
  for (let w = 0; w < 6; w++) {
    const seven: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(cursor);
      d.setDate(cursor.getDate() + i);
      seven.push(d);
    }
    const working = visibleWeekDays(seven, config);
    weeks.push({
      days: working.map(d => ({ date: d, key: toLocalDateKey(d), inMonth: d.getMonth() === month })),
    });
    const weekEnd = new Date(cursor);
    weekEnd.setDate(cursor.getDate() + 6);
    if (weekEnd.getTime() >= last.getTime()) break;
    cursor.setDate(cursor.getDate() + 7);
  }
  return weeks;
};

const schedulable = (job: Job): boolean =>
  !!job.startDate && job.stage !== 'Completed' && job.stage !== 'Marketing' && job.stage !== 'Cancelled';

/** A single board lane holding every schedulable job that occupies any of the
 *  given week's working days. `color` sets each card's bar color (crew color). */
export const buildMonthWeekLane = (
  jobs: Job[],
  weekDayKeys: string[],
  config: WorkingTimeConfig,
  color: (job: Job) => string,
): BoardLane => {
  const lane: BoardLane = { crewId: 'month', crewName: '', cardsByDay: {} };
  for (const job of jobs) {
    if (!schedulable(job)) continue;

    // One card per dated shift (allocation-based job), else one job card (legacy).
    // The passed `color` is the fallback; a shift uses its own color when set.
    const cards: BoardCard[] = job.allocations?.length
      ? job.allocations
          .filter(a => a.startDate)
          .map(alloc => ({
            jobId: job.id, jobName: job.name, jobNumber: job.jobNumber,
            color: alloc.color ?? color(job),
            startKey: alloc.startDate,
            endKey: alloc.endDate || alloc.startDate,
            isLocked: !!job.is_locked,
            shiftId: alloc.id, shiftName: (job.allocations!.length >= 2 ? alloc.name : undefined),
            ...(alloc.skipDays?.length ? { skipDays: alloc.skipDays } : {}),
            ...shiftCardHours(alloc),
          }))
      : [{
          jobId: job.id, jobName: job.name, jobNumber: job.jobNumber,
          color: color(job),
          startKey: toLocalDateKey(new Date(job.startDate!)),
          endKey: toLocalDateKey(new Date(job.endDate || job.startDate!)),
          isLocked: !!job.is_locked,
          ...cardHours(job),
        }];

    for (const card of cards) {
      for (const key of weekDayKeys) {
        // Anchor the card's bare date-key span at local noon so occupiesWorkingDay
        // doesn't drop a day in negative-offset zones.
        if (!card.skipDays?.includes(key) &&
            occupiesWorkingDay(`${card.startKey}T12:00:00`, `${card.endKey}T12:00:00`, key, config)) {
          (lane.cardsByDay[key] ||= []).push(card);
        }
      }
    }
  }
  return lane;
};
