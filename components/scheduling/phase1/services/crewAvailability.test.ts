import { describe, it, expect } from 'vitest';
import { resolveDayAvailability, formatAvailWindow, formatWindow, windowOutsideAvailability, availableHoursOn, companyStandardDay } from './crewAvailability';
import type { DayAvailability } from './crewAvailability';
import type { CrewMember } from '../types';

const DEF = { startTime: '08:00', endTime: '17:00' };
const member = (schedule?: CrewMember['schedule']): CrewMember => ({
  id: 'm1', name: 'Mike', role: 'Painter', schedule,
});

describe('resolveDayAvailability', () => {
  it('uses the per-day schedule entry when present', () => {
    const m = member({ '2026-06-08': { date: '2026-06-08', startTime: '07:00', endTime: '15:30', isOff: false } });
    expect(resolveDayAvailability(m, '2026-06-08', DEF)).toEqual({ off: false, startTime: '07:00', endTime: '15:30' });
  });

  it('falls back to the default window when there is no entry', () => {
    expect(resolveDayAvailability(member(), '2026-06-08', DEF)).toEqual({ off: false, startTime: '08:00', endTime: '17:00' });
  });

  it('reports off with the reason when the day is marked off', () => {
    const m = member({ '2026-06-08': { date: '2026-06-08', startTime: '08:00', endTime: '17:00', isOff: true, reason: 'PTO' } });
    expect(resolveDayAvailability(m, '2026-06-08', DEF)).toEqual({ off: true, reason: 'PTO', startTime: '08:00', endTime: '17:00' });
  });
});

describe('formatAvailWindow', () => {
  it('formats a whole-hour window compactly', () => {
    expect(formatAvailWindow({ off: false, startTime: '08:00', endTime: '17:00' })).toBe('8am–5pm');
  });

  it('keeps minutes when not on the hour', () => {
    expect(formatAvailWindow({ off: false, startTime: '08:30', endTime: '12:00' })).toBe('8:30am–12pm');
  });

  it('shows the reason (or "Off") when off', () => {
    expect(formatAvailWindow({ off: true, reason: 'PTO', startTime: '08:00', endTime: '17:00' })).toBe('PTO');
    expect(formatAvailWindow({ off: true, startTime: '08:00', endTime: '17:00' })).toBe('Off');
  });
});

describe('formatWindow', () => {
  it('formats a window without needing a DayAvailability', () => {
    expect(formatWindow('13:00', '17:30')).toBe('1pm–5:30pm');
  });
});

// This asks WHEN, not HOW MUCH: volume is measured elsewhere, against the standard
// working day. A 4h window is still the wrong 4h at 6pm for someone who works 8–5,
// and no hours-based check can see that.
describe('windowOutsideAvailability', () => {
  const works8to5: DayAvailability = { off: false, startTime: '08:00', endTime: '17:00' };

  it('reports nothing when the window sits inside their hours', () => {
    expect(windowOutsideAvailability(works8to5, { startTime: '09:00', endTime: '15:00' }))
      .toEqual({ before: 0, after: 0, outside: false });
  });

  it('treats an exact match as inside', () => {
    expect(windowOutsideAvailability(works8to5, { startTime: '08:00', endTime: '17:00' }).outside).toBe(false);
  });

  it('measures an early start', () => {
    expect(windowOutsideAvailability(works8to5, { startTime: '06:30', endTime: '15:00' }))
      .toEqual({ before: 1.5, after: 0, outside: true });
  });

  it('measures a late finish', () => {
    expect(windowOutsideAvailability(works8to5, { startTime: '09:00', endTime: '19:00' }))
      .toEqual({ before: 0, after: 2, outside: true });
  });

  it('measures both ends of a window that swallows their day', () => {
    expect(windowOutsideAvailability(works8to5, { startTime: '07:00', endTime: '18:00' }))
      .toEqual({ before: 1, after: 1, outside: true });
  });

  it('respects a member with their own shorter window', () => {
    const partTime: DayAvailability = { off: false, startTime: '08:00', endTime: '12:00' };
    expect(windowOutsideAvailability(partTime, { startTime: '08:00', endTime: '17:00' }))
      .toEqual({ before: 0, after: 5, outside: true });
  });

  // Being off is reported on its own; calling the whole window "outside" would say it twice.
  it('stays quiet on an off day', () => {
    const off: DayAvailability = { off: true, reason: 'PTO', startTime: '08:00', endTime: '17:00' };
    expect(windowOutsideAvailability(off, { startTime: '08:00', endTime: '17:00' }).outside).toBe(false);
  });
});

describe('availableHoursOn', () => {
  const lunch = { id: 'b1', label: 'Lunch', durationMinutes: 60, paid: false, startTime: '12:00' };
  const DAY = '2026-08-18';
  const entry = (over: Partial<NonNullable<CrewMember['schedule']>[string]> = {}) =>
    member({ [DAY]: { date: DAY, startTime: '08:00', endTime: '17:00', isOff: false, ...over } });

  it('falls back to the standard day when the member has no entry for that day', () => {
    expect(availableHoursOn(member(), DAY, 8, [lunch])).toBe(8);
  });

  it('is zero on a day the member is off', () => {
    expect(availableHoursOn(entry({ isOff: true }), DAY, 8, [lunch])).toBe(0);
  });

  it('is the half-day window on a morning-only day, with no lunch inside it', () => {
    expect(availableHoursOn(entry({ endTime: '12:00' }), DAY, 8, [lunch])).toBe(4);
  });

  it('carves an unpaid lunch out of a full window, so 8am-5pm holds 8h of work', () => {
    expect(availableHoursOn(entry(), DAY, 8, [lunch])).toBe(8);
  });

  it('honors a per-day break override ahead of the company default', () => {
    expect(availableHoursOn(entry({ breaksOverride: [] }), DAY, 8, [lunch])).toBe(9);
  });

  it('falls back to the standard day when an entry carries no times', () => {
    expect(availableHoursOn(entry({ startTime: '', endTime: '' }), DAY, 8, [lunch])).toBe(8);
  });
});

describe('companyStandardDay', () => {
  it('takes an explicit crew daily capacity as-is', () => {
    expect(companyStandardDay({
      nonWorkingWeekdays: [0, 6], holidays: [], rainDays: [],
      workDayStartHour: 8, workDayEndHour: 17, crewDailyCapacityHours: 7.5,
    })).toBe(7.5);
  });

  it('derives the day from the company window less unpaid breaks when unset', () => {
    expect(companyStandardDay({
      nonWorkingWeekdays: [0, 6], holidays: [], rainDays: [],
      workDayStartHour: 8, workDayEndHour: 17,
      defaultBreaks: [{ id: 'b1', durationMinutes: 60, paid: false, startTime: '12:00' }],
    })).toBe(8);
  });

  it('falls back to the default 8am-5pm window with no settings at all', () => {
    expect(companyStandardDay(undefined)).toBe(9);
  });
});
