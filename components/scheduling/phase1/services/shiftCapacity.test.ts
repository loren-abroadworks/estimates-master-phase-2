import { describe, it, expect } from 'vitest';
import {
  seedHoursDraft,
  computeShiftCapacity,
  computeWeeklyCapacity,
  computeDayShiftCapacity,
  computeDayAllCrewCapacity,
  computeDayLoad,
  memberDayCapacity,
} from './shiftCapacity';
import type { CrewMember, Job, JobCrewAllocation } from '../types';

const mike: CrewMember = { id: 'm1', name: 'Mike Smith', role: 'Owner' };
const david: CrewMember = { id: 'm2', name: 'David Chen', role: 'Estimator' };

// The mockup's shift: Wed Aug 5 – Thu Aug 6 2026, 08:00–17:00 (9h/day).
const dayKeys = ['2026-08-05', '2026-08-06'];
const SHIFT_DAY = 9;

// Mike 5+5, David 4+4 → 10 and 8 assigned.
const hours = {
  m1: { '2026-08-05': 5, '2026-08-06': 5 },
  m2: { '2026-08-05': 4, '2026-08-06': 4 },
};

describe('computeShiftCapacity', () => {
  it('measures a member against the shift window, not a standard day', () => {
    expect(computeShiftCapacity(mike, dayKeys, hours, SHIFT_DAY)).toMatchObject({
      assigned: 10,
      capacity: 18,
      free: 8,
      over: 0,
    });
  });

  it('drops days the member has off from their capacity', () => {
    const off: CrewMember = { ...mike, schedule: { '2026-08-06': { date: '2026-08-06', startTime: '08:00', endTime: '17:00', isOff: true } } };
    expect(computeShiftCapacity(off, dayKeys, hours, SHIFT_DAY)).toMatchObject({ capacity: 9, over: 1 });
  });

  it('reports hours beyond the window as over, and fills the bar', () => {
    const heavy = { m1: { '2026-08-05': 12, '2026-08-06': 12 } };
    expect(computeShiftCapacity(mike, dayKeys, heavy, SHIFT_DAY)).toMatchObject({
      assigned: 24,
      capacity: 18,
      free: 0,
      over: 6,
      ratio: 1,
    });
  });
});

describe('computeWeeklyCapacity', () => {
  // Sun Aug 2 – Sat Aug 8 2026.
  const weekDays = Array.from({ length: 7 }, (_, i) => new Date(2026, 7, 2 + i, 12));

  it('counts the draft shift against standard working days', () => {
    expect(computeWeeklyCapacity(mike, weekDays, [], hours)).toMatchObject({
      assigned: 10,
      capacity: 40,
      free: 30,
    });
  });

  it('adds hours the member already owes other jobs', () => {
    const other: Job[] = [{
      id: 'j9', name: 'Other job',
      allocations: [{ id: 'a9', name: 'Crew', memberIds: ['m1'], startDate: '2026-08-03', endDate: '2026-08-03', hoursAssignments: { m1: { '2026-08-03': 8 } } }],
    } as unknown as Job];
    expect(computeWeeklyCapacity(mike, weekDays, other, hours)).toMatchObject({ assigned: 18, free: 22 });
  });

  it('skips the saved copy of the shift being edited', () => {
    const sameJob: Job[] = [{
      id: 'j1', name: 'This job',
      allocations: [{ id: 'shift-1', name: 'Crew', memberIds: ['m1'], startDate: '2026-08-05', endDate: '2026-08-05', hoursAssignments: { m1: { '2026-08-05': 5 } } }],
    } as unknown as Job];
    const bar = computeWeeklyCapacity(mike, weekDays, sameJob, hours, { excludeAllocationId: 'shift-1' });
    expect(bar.assigned).toBe(10); // draft only — the saved 5h isn't double counted
  });
});

describe('computeDayShiftCapacity', () => {
  it('sums the crew on one day against their combined window', () => {
    expect(computeDayShiftCapacity([mike, david], '2026-08-05', hours, SHIFT_DAY)).toMatchObject({
      assigned: 9,
      capacity: 18,
    });
  });
});

describe('computeDayAllCrewCapacity', () => {
  const roster = [mike, david, { id: 'm3', name: 'Jessica Miller', role: 'Estimator' } as CrewMember];

  it('measures the draft against the whole roster capacity for that day', () => {
    expect(computeDayAllCrewCapacity(roster, [mike, david], '2026-08-05', [], hours, SHIFT_DAY)).toMatchObject({
      assigned: 9,
      capacity: 27,
    });
  });

  it('includes other crew committed to other jobs that day', () => {
    const other: Job[] = [{
      id: 'j9', name: 'Other job',
      allocations: [{ id: 'a9', name: 'Crew', memberIds: ['m3'], startDate: '2026-08-05', endDate: '2026-08-05', hoursAssignments: { m3: { '2026-08-05': 6 } } }],
    } as unknown as Job];
    expect(computeDayAllCrewCapacity(roster, [mike, david], '2026-08-05', other, hours, SHIFT_DAY)).toMatchObject({
      assigned: 15,
      capacity: 27,
    });
  });
});

describe('computeDayLoad', () => {
  const other: Job[] = [{
    id: 'j9', name: 'Other job',
    allocations: [{ id: 'a9', name: 'Crew', memberIds: ['m1'], startDate: '2026-08-05', endDate: '2026-08-05', hoursAssignments: { m1: { '2026-08-05': 6 } } }],
  } as unknown as Job];

  it('flags a cell that pushes the member past a standard day', () => {
    expect(computeDayLoad(mike, '2026-08-05', other, 5)).toEqual({
      capacity: 8, elsewhere: 6, used: 11, left: 0, over: 3,
    });
  });

  it('stays quiet when the day still fits, and reports what is left', () => {
    expect(computeDayLoad(mike, '2026-08-05', other, 2)).toEqual({
      capacity: 8, elsewhere: 6, used: 8, left: 0, over: 0,
    });
  });

  it('leaves the rest of a standard day open when nothing else is booked', () => {
    expect(computeDayLoad(mike, '2026-08-05', [], 4)).toEqual({
      capacity: 8, elsewhere: 0, used: 4, left: 4, over: 0,
    });
  });

  it('counts other jobs against the day even with an empty cell', () => {
    expect(computeDayLoad(mike, '2026-08-05', other, 0)).toMatchObject({ elsewhere: 6, left: 2, over: 0 });
  });

  it('measures a half day against the half-day window', () => {
    const half: CrewMember = { ...mike, schedule: { '2026-08-05': { date: '2026-08-05', startTime: '08:00', endTime: '12:00', isOff: false } } };
    const load = computeDayLoad(half, '2026-08-05', [], 4);
    expect(load.capacity).toBe(4);
    expect(load.over).toBe(0);
  });

  it('reports hours past a half day as over', () => {
    const half: CrewMember = { ...mike, schedule: { '2026-08-05': { date: '2026-08-05', startTime: '08:00', endTime: '12:00', isOff: false } } };
    const load = computeDayLoad(half, '2026-08-05', [], 9);
    expect(load.capacity).toBe(4);
    expect(load.over).toBe(5);
  });

  it('has no capacity on a day the member is off, so any hours read as over', () => {
    const off: CrewMember = { ...mike, schedule: { '2026-08-05': { date: '2026-08-05', startTime: '08:00', endTime: '17:00', isOff: true } } };
    expect(computeDayLoad(off, '2026-08-05', [], 3)).toMatchObject({ capacity: 0, left: 0, over: 3 });
  });

  it('skips the saved copy of the shift being edited', () => {
    const sameShift: Job[] = [{
      id: 'j1', name: 'This job',
      allocations: [{ id: 'shift-1', name: 'Crew', memberIds: ['m1'], startDate: '2026-08-05', endDate: '2026-08-05', hoursAssignments: { m1: { '2026-08-05': 6 } } }],
    } as unknown as Job];
    expect(computeDayLoad(mike, '2026-08-05', sameShift, 5, { excludeAllocationId: 'shift-1' }))
      .toMatchObject({ elsewhere: 0, used: 5, left: 3, over: 0 });
  });

  it('honours a non-standard working day', () => {
    expect(computeDayLoad(mike, '2026-08-05', [], 5, { standardDay: 10 }))
      .toMatchObject({ capacity: 10, left: 5, over: 0 });
  });
});

describe('memberDayCapacity', () => {
  it('is the shift window on a working day and zero on a day off', () => {
    expect(memberDayCapacity(mike, '2026-08-05', 9)).toBe(9);
    const off: CrewMember = { ...mike, schedule: { '2026-08-05': { date: '2026-08-05', startTime: '08:00', endTime: '17:00', isOff: true } } };
    expect(memberDayCapacity(off, '2026-08-05', 9)).toBe(0);
  });
});

describe('seedHoursDraft — opening a shift shows the hours the board shows', () => {
  const DAYS = ['2026-08-18', '2026-08-19', '2026-08-20'];
  // A 1–5pm shift with three members. Only cm-1 has a granular map (one edited day):
  // the other two are booked implicitly, which is what the board renders as 4h chips.
  const alloc = {
    id: 's1', name: 'Cut & Roll', memberIds: ['cm-1', 'cm-2', 'cm-4'],
    startDate: '2026-08-18', endDate: '2026-08-20',
    startTime: '13:00', endTime: '17:00',
    hoursAssignments: { 'cm-1': { '2026-08-20': 4 } },
  } as JobCrewAllocation;

  it('seeds a member with no granular entry from the shift window', () => {
    const draft = seedHoursDraft(alloc, DAYS);
    expect(draft['cm-2']).toEqual({ '2026-08-18': 4, '2026-08-19': 4, '2026-08-20': 4 });
  });

  it('keeps a granular member\'s own days, and only those', () => {
    const draft = seedHoursDraft(alloc, DAYS);
    expect(draft['cm-1']).toEqual({ '2026-08-20': 4 });
  });

  it('seeds nothing for someone who is not on the shift', () => {
    const draft = seedHoursDraft(alloc, DAYS);
    expect(draft['cm-9']).toBeUndefined();
  });

  it('leaves a skipped day out of the draft', () => {
    const withSkip = { ...alloc, skipDays: ['2026-08-19'] } as JobCrewAllocation;
    expect(seedHoursDraft(withSkip, DAYS)['cm-2']).toEqual({ '2026-08-18': 4, '2026-08-20': 4 });
  });

  it('defaults to the shift\'s own span when no days are passed', () => {
    expect(Object.keys(seedHoursDraft(alloc)['cm-2'])).toEqual(DAYS);
  });

  it('honours a per-day window override', () => {
    const withDay = { ...alloc, dailyHours: { '2026-08-18': { startTime: '08:00', endTime: '17:00' } } } as JobCrewAllocation;
    expect(seedHoursDraft(withDay, DAYS)['cm-2']['2026-08-18']).toBe(9);
  });
});
