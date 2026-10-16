import type { CrewBreak, CrewMember, Job, JobCrewAllocation } from '../types';
import { toLocalDateKey } from './scheduleEngine';
import { committedHoursOnDay, computeWeeklyHours } from './crewWeeklyHours';
import { memberShiftDayHours } from './crewHoursGrid';
import { availableHoursOn } from './crewAvailability';

/**
 * Capacity roll-ups for the shift editor's crew grid. Every figure is "assigned out of
 * capacity", where capacity is the *shift window* (start–end time × days worked), not the
 * standard 8h day: a shift is what the scheduler is filling, so its own window is the
 * yardstick. Other jobs don't shrink it — they surface separately as conflict flags.
 * The per-person roll-ups are the exception — a week (`computeWeeklyCapacity`) and a single
 * day (`computeDayLoad`) are measured against standard working days, net of other jobs, so
 * they agree with each other and with the crew picker's weekly figure.
 */
export interface CapacityBar {
  /** Hours assigned. */
  assigned: number;
  /** Hours available. */
  capacity: number;
  /** Hours still open (0 once at or over capacity). */
  free: number;
  /** Hours beyond capacity (0 while within it). */
  over: number;
  /** 0–1 fill ratio for a progress bar. Clamped, so an overbooked bar reads full. */
  ratio: number;
}

/** Draft per-day hours as the modal holds them: { memberId: { dateKey: hours } }. */
export type HoursAssignments = Record<string, Record<string, number>>;

/** Every date key in a shift's span, weekends included. Coverage (span + skip list) is
 *  what decides whether a day carries hours, so the span is the right net to cast — the
 *  same one the board reads through. Anchored at local noon: a bare 'YYYY-MM-DD' parses
 *  as UTC midnight and slips back a day in negative-offset zones. */
export const allocSpanDayKeys = (alloc: JobCrewAllocation): string[] => {
  const start = (alloc.startDate ?? '').split('T')[0];
  const end = (alloc.endDate ?? alloc.startDate ?? '').split('T')[0];
  if (!start) return [];
  const keys: string[] = [];
  const d = new Date(`${start}T12:00:00`);
  const last = new Date(`${end || start}T12:00:00`);
  let safety = 0;
  while (d <= last && safety < 400) {
    keys.push(toLocalDateKey(d));
    d.setDate(d.getDate() + 1);
    safety++;
  }
  return keys;
};

/** The hours to open a shift editor with, read the same way every other surface reads
 *  them — through `memberShiftDayHours`.
 *
 *  A raw `hoursAssignments` map is authoritative only PER MEMBER: someone on `memberIds`
 *  with no entry in it is booked implicitly, for the shift's window. Seeding from the raw
 *  map therefore showed those members as blank while the board showed them working, and
 *  saving the shift would have written that blank back over their hours. One granular
 *  member is enough to cause it, because any single per-day edit creates the map. */
export const seedHoursDraft = (
  alloc: JobCrewAllocation,
  dayKeys: string[] = allocSpanDayKeys(alloc),
): HoursAssignments => {
  const draft: HoursAssignments = {};
  for (const memberId of alloc.memberIds ?? []) {
    const days: Record<string, number> = {};
    for (const dateKey of dayKeys) {
      const hours = memberShiftDayHours(alloc, memberId, dateKey);
      // Skipped and unbooked days stay absent, so their cells read as empty, not "0".
      if (hours > 0) days[dateKey] = hours;
    }
    draft[memberId] = days;
  }
  return draft;
};

const round = (n: number) => Math.round(n * 100) / 100;

const makeBar = (assigned: number, capacity: number): CapacityBar => ({
  assigned: round(assigned),
  capacity: round(capacity),
  free: round(Math.max(0, capacity - assigned)),
  over: round(Math.max(0, assigned - capacity)),
  ratio: capacity > 0 ? Math.min(1, assigned / capacity) : (assigned > 0 ? 1 : 0),
});

/** True when the member has the day marked off in their schedule. */
export const isOffOn = (member: CrewMember | undefined, dayKey: string): boolean =>
  !!member?.schedule?.[dayKey]?.isOff;

/** One member's capacity for one shift day: the shift window, or 0 when they're off. */
export const memberDayCapacity = (
  member: CrewMember | undefined,
  dayKey: string,
  shiftDayHours: number,
): number => (isOffOn(member, dayKey) ? 0 : shiftDayHours);

const draftHours = (hours: HoursAssignments, memberId: string, dayKey: string): number =>
  hours[memberId]?.[dayKey] || 0;

/** A member's row total: hours they're assigned in this shift out of the shift window. */
export const computeShiftCapacity = (
  member: CrewMember,
  dayKeys: string[],
  hours: HoursAssignments,
  shiftDayHours: number,
): CapacityBar => {
  let assigned = 0;
  let capacity = 0;
  for (const key of dayKeys) {
    assigned += draftHours(hours, member.id, key);
    capacity += memberDayCapacity(member, key, shiftDayHours);
  }
  return makeBar(assigned, capacity);
};

/**
 * A member's week: their standard working-day capacity against everything they're
 * committed to — other jobs plus the draft hours in this shift. `opts.excludeJobId` /
 * `opts.excludeAllocationId` keep the saved copy of the shift being edited from being
 * counted alongside the draft.
 */
export const computeWeeklyCapacity = (
  member: CrewMember,
  weekDays: Date[],
  jobs: Job[],
  hours: HoursAssignments,
  opts: { standardDay?: number; weekendDays?: number[]; excludeJobId?: string; excludeAllocationId?: string } = {},
): CapacityBar => {
  const weekly = computeWeeklyHours(member, weekDays, jobs, opts);
  let draft = 0;
  for (const d of weekDays) draft += draftHours(hours, member.id, toLocalDateKey(d));
  return makeBar(weekly.assigned + draft, weekly.capacity);
};

/** One day column, this shift only: hours assigned that day out of the crew's window. */
export const computeDayShiftCapacity = (
  members: CrewMember[],
  dayKey: string,
  hours: HoursAssignments,
  shiftDayHours: number,
): CapacityBar => {
  let assigned = 0;
  let capacity = 0;
  for (const m of members) {
    assigned += draftHours(hours, m.id, dayKey);
    capacity += memberDayCapacity(m, dayKey, shiftDayHours);
  }
  return makeBar(assigned, capacity);
};

/**
 * One day column, company-wide: every staff member's committed hours that day across all
 * jobs plus this shift's draft, out of the whole roster's hours for that day.
 */
export const computeDayAllCrewCapacity = (
  allStaff: CrewMember[],
  shiftMembers: CrewMember[],
  dayKey: string,
  jobs: Job[],
  hours: HoursAssignments,
  shiftDayHours: number,
  opts: { standardDay?: number; excludeJobId?: string; excludeAllocationId?: string } = {},
): CapacityBar => {
  let assigned = 0;
  let capacity = 0;
  for (const m of allStaff) {
    assigned += committedHoursOnDay(m, jobs, dayKey, opts);
    capacity += memberDayCapacity(m, dayKey, shiftDayHours);
  }
  // Draft hours live only in the modal, so they're added on top of the saved commitments.
  for (const m of shiftMembers) assigned += draftHours(hours, m.id, dayKey);
  return makeBar(assigned, capacity);
};

/** One member's day, measured the way the weekly roll-up measures a week. */
export interface DayLoad {
  /** Their working day — 0 when they have the day off. */
  capacity: number;
  /** Hours already committed to other jobs that day. */
  elsewhere: number;
  /** Everything landing on the day: other jobs plus this shift's cell. */
  used: number;
  /** Hours of their day still open (0 once at or past capacity). */
  left: number;
  /** Hours past their working day (0 while within it). Drives the cell conflict flag. */
  over: number;
}

/**
 * A member's whole day around one cell: their standard working day against other jobs plus
 * the hours typed here. This is the per-day slice of `computeWeeklyCapacity` — same basis,
 * so a row's daily `left` figures reconcile with its weekly meter and with the crew picker.
 * The shift window is deliberately *not* the yardstick here: it measures the shift (see
 * `computeShiftCapacity`), not the person.
 */
export const computeDayLoad = (
  member: CrewMember,
  dayKey: string,
  jobs: Job[],
  cellHours: number,
  opts: { standardDay?: number; excludeJobId?: string; excludeAllocationId?: string; defaultBreaks?: CrewBreak[] } = {},
): DayLoad => {
  // Their own day: off is zero, a half day is half, no entry is the standard day.
  const capacity = availableHoursOn(member, dayKey, opts.standardDay ?? 8, opts.defaultBreaks ?? []);
  const elsewhere = committedHoursOnDay(member, jobs, dayKey, opts);
  const used = elsewhere + cellHours;
  return {
    capacity: round(capacity),
    elsewhere: round(elsewhere),
    used: round(used),
    left: round(Math.max(0, capacity - used)),
    over: round(Math.max(0, used - capacity)),
  };
};
