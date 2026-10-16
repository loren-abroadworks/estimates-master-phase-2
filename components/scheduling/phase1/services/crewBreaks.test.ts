import { describe, it, expect } from 'vitest';
import { resolveBreaks, breakHours, paidBreakHours, setMemberDayBreaks, unpaidFixedBreakHoursInWindow, unpaidFloatingBreakHours, unpaidBreakHours, workingDayCapacity } from './crewBreaks';
import type { CrewBreak, CrewScheduleEntry, CrewMember } from '../types';

const member = (over: Partial<CrewMember> = {}): CrewMember =>
  ({ id: 'm1', name: 'Mike', role: 'Painter', ...over });

const lunch = (over: Partial<CrewBreak> = {}): CrewBreak =>
  ({ id: 'b1', label: 'Lunch', durationMinutes: 30, paid: false, startTime: '12:00', ...over });

const entry = (over: Partial<CrewScheduleEntry> = {}): CrewScheduleEntry =>
  ({ date: '2026-06-08', startTime: '08:00', endTime: '17:00', isOff: false, ...over });

describe('resolveBreaks', () => {
  it('uses the company default when no override is present', () => {
    expect(resolveBreaks(entry(), [lunch()])).toEqual([lunch()]);
  });

  it('uses the override when one is set', () => {
    const custom = [lunch({ durationMinutes: 60 })];
    expect(resolveBreaks(entry({ breaksOverride: custom }), [lunch()])).toEqual(custom);
  });

  it('treats an empty override array as "no breaks today"', () => {
    expect(resolveBreaks(entry({ breaksOverride: [] }), [lunch()])).toEqual([]);
  });

  it('returns the default when the entry itself is undefined', () => {
    expect(resolveBreaks(undefined, [lunch()])).toEqual([lunch()]);
  });

  it('returns an empty array when there is no override and no default', () => {
    expect(resolveBreaks(undefined, [])).toEqual([]);
  });
});

describe('breakHours / paidBreakHours', () => {
  it('sums all break minutes into hours regardless of paid flag', () => {
    expect(breakHours([lunch({ durationMinutes: 30, paid: true }), lunch({ id: 'b2', durationMinutes: 15, paid: false })])).toBe(0.75);
  });

  it('counts only paid breaks toward paid hours', () => {
    expect(paidBreakHours([lunch({ durationMinutes: 30, paid: true }), lunch({ id: 'b2', durationMinutes: 30, paid: false })])).toBe(0.5);
  });

  it('returns 0 for an empty list', () => {
    expect(breakHours([])).toBe(0);
    expect(paidBreakHours([])).toBe(0);
  });
});

describe('unpaidFixedBreakHoursInWindow', () => {
  it('counts a fixed unpaid break fully inside the window', () => {
    expect(unpaidFixedBreakHoursInWindow([lunch()], '08:00', '13:00')).toBe(0.5);
  });

  it('returns 0 when the break sits in a gap outside the window', () => {
    // window 08:00–12:00, lunch starts at 12:00 → no overlap.
    expect(unpaidFixedBreakHoursInWindow([lunch()], '08:00', '12:00')).toBe(0);
  });

  it('counts only the overlapping minutes on a partial overlap', () => {
    // window ends 12:15, lunch 12:00–12:30 → 15 min inside.
    expect(unpaidFixedBreakHoursInWindow([lunch()], '08:00', '12:15')).toBe(0.25);
  });

  it('ignores paid breaks', () => {
    expect(unpaidFixedBreakHoursInWindow([lunch({ paid: true })], '08:00', '13:00')).toBe(0);
  });

  it('ignores floating (no startTime) breaks', () => {
    expect(unpaidFixedBreakHoursInWindow([lunch({ startTime: undefined })], '08:00', '13:00')).toBe(0);
  });

  it('sums multiple unpaid fixed breaks in the window', () => {
    const coffee = lunch({ id: 'b2', durationMinutes: 15, startTime: '10:00' });
    expect(unpaidFixedBreakHoursInWindow([lunch(), coffee], '08:00', '13:00')).toBe(0.75);
  });
});

describe('unpaidFloatingBreakHours', () => {
  it('counts unpaid floating breaks', () => {
    expect(unpaidFloatingBreakHours([lunch({ startTime: undefined })])).toBe(0.5);
  });

  it('ignores fixed (timed) breaks', () => {
    expect(unpaidFloatingBreakHours([lunch()])).toBe(0);
  });

  it('ignores paid floating breaks', () => {
    expect(unpaidFloatingBreakHours([lunch({ startTime: undefined, paid: true })])).toBe(0);
  });
});

describe('setMemberDayBreaks', () => {
  it('sets a break override, creating a schedule entry when none exists', () => {
    const next = setMemberDayBreaks(member(), '2026-06-08', [lunch()]);
    expect(next.schedule!['2026-06-08'].breaksOverride).toEqual([lunch()]);
    expect(next.schedule!['2026-06-08'].isOff).toBe(false);
  });

  it('stores an empty array as an explicit "no breaks" override', () => {
    const next = setMemberDayBreaks(member(), '2026-06-08', []);
    expect(next.schedule!['2026-06-08'].breaksOverride).toEqual([]);
  });

  it('reverts to the company default by clearing the override (undefined)', () => {
    const m = member({ schedule: { '2026-06-08': entry({ breaksOverride: [lunch()] }) } });
    const next = setMemberDayBreaks(m, '2026-06-08', undefined);
    expect(next.schedule!['2026-06-08'].breaksOverride).toBeUndefined();
  });

  it('preserves existing entry fields (isOff, reason) when overriding breaks', () => {
    const m = member({ schedule: { '2026-06-08': entry({ isOff: true, reason: 'PTO' }) } });
    const next = setMemberDayBreaks(m, '2026-06-08', [lunch()]);
    expect(next.schedule!['2026-06-08'].isOff).toBe(true);
    expect(next.schedule!['2026-06-08'].reason).toBe('PTO');
  });

  it('does not mutate the original member', () => {
    const m = member();
    setMemberDayBreaks(m, '2026-06-08', [lunch()]);
    expect(m.schedule).toBeUndefined();
  });
});

describe('unpaidBreakHours', () => {
  it('sums unpaid breaks whether they are anchored to a time or floating', () => {
    expect(unpaidBreakHours([lunch(), lunch({ id: 'b2', durationMinutes: 15, startTime: undefined })])).toBe(0.75);
  });

  it('ignores paid breaks — the crew is paid for them, so they stay in the working day', () => {
    expect(unpaidBreakHours([lunch({ paid: true }), lunch({ id: 'b2', durationMinutes: 30 })])).toBe(0.5);
  });

  it('returns 0 for an empty list', () => {
    expect(unpaidBreakHours([])).toBe(0);
  });
});

describe('workingDayCapacity', () => {
  it('carves unpaid breaks out of the window: 8am–5pm less a 30m lunch is 8.5h', () => {
    expect(workingDayCapacity(9, [lunch()])).toBe(8.5);
  });

  it('leaves the window whole when every break is paid', () => {
    expect(workingDayCapacity(9, [lunch({ paid: true })])).toBe(9);
  });

  it('never goes negative', () => {
    expect(workingDayCapacity(0.25, [lunch({ durationMinutes: 60 })])).toBe(0);
  });
});
