import type { CrewBreak, CrewScheduleEntry, CrewMember } from '../types';

// Breaks come in 15-min increments (0.25h, 0.75h), so keep 2-decimal precision —
// rounding to 1 decimal would distort capacity math.
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Effective breaks for a member-day: the override when present (empty array = no
 *  breaks), otherwise the company default. Single source of truth for reads. */
export const resolveBreaks = (
  entry: CrewScheduleEntry | undefined,
  defaultBreaks: CrewBreak[],
): CrewBreak[] => entry?.breaksOverride ?? defaultBreaks ?? [];

const sumMinutes = (breaks: CrewBreak[]) => breaks.reduce((s, b) => s + (b.durationMinutes || 0), 0);

/** Total break time in hours (all breaks — paid and unpaid both reduce job-capacity). */
export const breakHours = (breaks: CrewBreak[]): number => round2(sumMinutes(breaks) / 60);

/** Paid-only break time in hours (added to paid hours; unpaid breaks are not paid). */
export const paidBreakHours = (breaks: CrewBreak[]): number =>
  round2(sumMinutes(breaks.filter(b => b.paid)) / 60);

const hhmmToMin = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
};

/** Hours of UNPAID FIXED breaks (those with a startTime) overlapping the window
 *  [startTime, endTime]. Each break contributes the intersection of its
 *  [start, start + duration] interval with the window. Paid and floating breaks
 *  are ignored. */
export const unpaidFixedBreakHoursInWindow = (
  breaks: CrewBreak[],
  startTime: string,
  endTime: string,
): number => {
  const ws = hhmmToMin(startTime);
  const we = hhmmToMin(endTime);
  let mins = 0;
  for (const b of breaks) {
    if (b.paid || !b.startTime) continue;
    const bs = hhmmToMin(b.startTime);
    const be = bs + (b.durationMinutes || 0);
    mins += Math.max(0, Math.min(be, we) - Math.max(bs, ws));
  }
  return round2(mins / 60);
};

/** Hours of UNPAID FLOATING breaks (no startTime) on a member-day. */
export const unpaidFloatingBreakHours = (breaks: CrewBreak[]): number =>
  round2(sumMinutes(breaks.filter(b => !b.paid && !b.startTime)) / 60);

/** Set a member's break override for one day (immutably).
 *  - `breaks` array  → store as the override ([] = explicit "no breaks").
 *  - `breaks` undefined → clear the override, reverting the day to the company default. */
export const setMemberDayBreaks = (
  member: CrewMember,
  dateKey: string,
  breaks: CrewBreak[] | undefined,
): CrewMember => {
  const schedule = { ...(member.schedule ?? {}) };
  const existing = schedule[dateKey];

  if (breaks === undefined) {
    if (!existing) return member;
    const { breaksOverride, ...rest } = existing;
    schedule[dateKey] = rest;
  } else {
    schedule[dateKey] = {
      date: dateKey,
      startTime: existing?.startTime ?? '08:00',
      endTime: existing?.endTime ?? '17:00',
      isOff: existing?.isOff ?? false,
      ...(existing?.reason !== undefined ? { reason: existing.reason } : {}),
      breaksOverride: breaks,
    };
  }
  return { ...member, schedule };
};

/** Hours of UNPAID break time on a day — fixed and floating alike. Unpaid time is time
 *  the crew isn't on the clock, so it comes out of what a working day can hold. */
export const unpaidBreakHours = (breaks: CrewBreak[]): number =>
  round2(sumMinutes(breaks.filter(b => !b.paid)) / 60);

/** A working day's capacity: the window's length less its unpaid breaks. This is the
 *  yardstick every per-person figure is measured against — a day, a week, a cell's
 *  "hours left" — so an 8am–5pm day with an unpaid half-hour lunch holds 8.5h of work,
 *  not 9. Paid breaks stay in: the crew is on the clock for them. */
export const workingDayCapacity = (windowHours: number, breaks: CrewBreak[]): number =>
  round2(Math.max(0, windowHours - unpaidBreakHours(breaks)));
