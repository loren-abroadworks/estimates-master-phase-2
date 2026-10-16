import type { CrewBreak, CrewMember, SchedulingSettings } from '../types';
import { resolveBreaks, unpaidFixedBreakHoursInWindow, unpaidFloatingBreakHours } from './crewBreaks';
import { configFromSettings } from './scheduleEngine';

export interface DayAvailability {
  off: boolean;
  reason?: string;
  startTime: string; // 'HH:mm'
  endTime: string;   // 'HH:mm'
}

/** A member's availability for one day: their schedule entry when present, else the
 *  company default window. `off` carries the optional reason. */
export const resolveDayAvailability = (
  member: CrewMember,
  dayKey: string,
  defaultWindow: { startTime: string; endTime: string },
): DayAvailability => {
  const s = member.schedule?.[dayKey];
  const startTime = s?.startTime || defaultWindow.startTime;
  const endTime = s?.endTime || defaultWindow.endTime;
  if (s?.isOff) return { off: true, reason: s.reason, startTime, endTime };
  return { off: false, startTime, endTime };
};

const compact = (hhmm: string): string => {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, '0')}${period}` : `${h12}${period}`;
};

/** Compact window label: "8a–5p". */
export const formatWindow = (startTime: string, endTime: string): string =>
  `${compact(startTime)}–${compact(endTime)}`;

/** Compact board label: "8a–5p" on working days; reason or "Off" when off. */
export const formatAvailWindow = (a: DayAvailability): string =>
  a.off ? (a.reason || 'Off') : `${compact(a.startTime)}–${compact(a.endTime)}`;

const toH = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h + (m || 0) / 60;
};
const round1 = (n: number) => Math.round(n * 10) / 10;

/** How far a scheduled window sticks out past a member's availability, in hours. */
export interface AvailabilityFit {
  /** Hours scheduled before the member's day starts. */
  before: number;
  /** Hours scheduled after the member's day ends. */
  after: number;
  /** True when any part of the window falls outside their hours. */
  outside: boolean;
}

/** Compare a scheduled window against a member's availability for that day.
 *  This is about WHEN, not HOW MUCH: a 4h window is a conflict at 6pm for someone who
 *  works 8–5 even though 4h fits inside their day. Volume is measured separately, against
 *  the standard working day, by `computeDayLoad`.
 *
 *  An off day is not evaluated here — being off is reported on its own, and treating the
 *  whole window as "outside" would double-report it. */
export const windowOutsideAvailability = (
  avail: DayAvailability,
  window: { startTime: string; endTime: string },
): AvailabilityFit => {
  if (avail.off) return { before: 0, after: 0, outside: false };
  const before = round1(Math.max(0, toH(avail.startTime) - toH(window.startTime)));
  const after = round1(Math.max(0, toH(window.endTime) - toH(avail.endTime)));
  return { before, after, outside: before + after > 0 };
};

/** Hours of work a window holds: its length less the unpaid break time actually inside
 *  it. Window-aware on purpose — a noon lunch is not carved out of an 8am–12pm morning,
 *  because that person's day ends before it starts. Unpaid floating breaks carry no time,
 *  so they come off any window they're attached to. */
const netWindowHours = (startTime: string, endTime: string, breaks: CrewBreak[]): number => {
  const length = Math.max(0, round1(toH(endTime) - toH(startTime)));
  const carve = unpaidFixedBreakHoursInWindow(breaks, startTime, endTime) + unpaidFloatingBreakHours(breaks);
  return Math.max(0, round1(length - carve));
};

/** Hours a member can actually work on one day — the yardstick every per-person figure
 *  is measured against.
 *
 *  No schedule entry means the company standard day: deriving from the *fallback*
 *  window would quietly re-rate every member who has never had a schedule set. Only a
 *  schedule someone actually typed changes their hours. Off is zero. Otherwise it is
 *  their window less its unpaid breaks — the same basis as `standardDay` itself, so
 *  8am–5pm with an unpaid hour lunch stays 8h and 8am–12pm becomes 4h. */
export const availableHoursOn = (
  member: CrewMember,
  dayKey: string,
  standardDay: number,
  defaultBreaks: CrewBreak[] = [],
): number => {
  const entry = member.schedule?.[dayKey];
  if (!entry) return standardDay;
  if (entry.isOff) return 0;
  if (!entry.startTime || !entry.endTime) return standardDay;
  return netWindowHours(entry.startTime, entry.endTime, resolveBreaks(entry, defaultBreaks));
};

/** The company's standard working day: the configured per-crew capacity when set, else
 *  the company window less its unpaid default breaks. Shared so App and the scheduling
 *  view can never disagree about the number. */
export const companyStandardDay = (scheduling: SchedulingSettings | undefined): number => {
  if (scheduling?.crewDailyCapacityHours) return scheduling.crewDailyCapacityHours;
  const cfg = configFromSettings(scheduling, false);
  const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
  return netWindowHours(hh(cfg.workDayStartHour), hh(cfg.workDayEndHour), scheduling?.defaultBreaks ?? []);
};
