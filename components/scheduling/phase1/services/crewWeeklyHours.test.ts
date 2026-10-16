import { describe, it, expect } from 'vitest';
import { computeWeeklyHours, committedHoursOnDay, dayCommitments } from './crewWeeklyHours';
import type { CrewMember, Job } from '../types';

// Mon–Fri of a week plus the weekend, anchored at noon to dodge tz edges.
const weekDays = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07']
  .map(k => new Date(`${k}T12:00:00`));

const member = (over: Partial<CrewMember> = {}): CrewMember =>
  ({ id: 'm1', name: 'Mike', ...over } as CrewMember);

const job = (over: Partial<Job> = {}): Job =>
  ({ id: 'j1', jobNumber: 'J-1', name: 'Job', stage: 'Scheduled', ...over } as Job);

describe('computeWeeklyHours', () => {
  it('counts only weekdays toward capacity (5 × 8 = 40)', () => {
    const wh = computeWeeklyHours(member(), weekDays, []);
    expect(wh.capacity).toBe(40);
    expect(wh.assigned).toBe(0);
    expect(wh.remaining).toBe(40);
  });

  it('subtracts hours assigned to other jobs from remaining', () => {
    const j = job({
      allocations: [{ id: 'a', name: 'x', startDate: '2026-06-01', endDate: '2026-06-02', startTime: '08:00', endTime: '17:00',
        memberIds: ['m1'], hoursAssignments: { m1: { '2026-06-01': 8, '2026-06-02': 6 } } }],
    });
    const wh = computeWeeklyHours(member(), weekDays, [j]);
    expect(wh.assigned).toBe(14);
    expect(wh.remaining).toBe(26);
  });

  // Without a granular map, a member's hours on a shift are the shift's WINDOW — the same
  // fallback the crew hours grid uses. Falling back to a whole standard day fabricated
  // hours: a 4h morning shift read as 8h, and two shifts in one day as 16h.
  it('falls back to the shift window, not a standard day, when hours are not itemized', () => {
    const j = job({
      allocations: [{ id: 'a', name: 'Morning', startDate: '2026-06-01', endDate: '2026-06-02',
        startTime: '08:00', endTime: '12:00', memberIds: ['m1'] }],
    });
    expect(computeWeeklyHours(member(), weekDays, [j]).assigned).toBe(8); // 4h × 2 days
  });

  it('does not stack a standard day per shift when a member works two shifts in a day', () => {
    const j = job({
      allocations: [
        { id: 'a', name: 'Morning', startDate: '2026-06-01', endDate: '2026-06-01', startTime: '08:00', endTime: '12:00', memberIds: ['m1'] },
        { id: 'b', name: 'Afternoon', startDate: '2026-06-01', endDate: '2026-06-01', startTime: '13:00', endTime: '17:00', memberIds: ['m1'] },
      ],
    });
    expect(computeWeeklyHours(member(), weekDays, [j]).assigned).toBe(8); // 4h + 4h, not 16h
  });

  it('honours a per-day window override on a shift', () => {
    const j = job({
      allocations: [{ id: 'a', name: 'Crew', startDate: '2026-06-01', endDate: '2026-06-01',
        startTime: '08:00', endTime: '17:00', memberIds: ['m1'],
        dailyHours: { '2026-06-01': { startTime: '08:00', endTime: '11:30' } } } as any],
    });
    expect(computeWeeklyHours(member(), weekDays, [j]).assigned).toBe(3.5);
  });

  it('honours a per-day window on a legacy job with no shifts', () => {
    const j = job({
      startDate: '2026-06-01T08:00:00', endDate: '2026-06-01T17:00:00',
      crewMemberIds: ['m1'], allocations: [],
      dailyHours: { '2026-06-01': { startTime: '08:00', endTime: '12:00' } },
    } as any);
    expect(computeWeeklyHours(member(), weekDays, [j]).assigned).toBe(4);
  });

  it('excludes the job currently being assigned', () => {
    const j = job({ id: 'self', allocations: [{ id: 'a', name: 'x', startDate: '2026-06-01', endDate: '2026-06-01', startTime: '08:00', endTime: '17:00', memberIds: ['m1'], hoursAssignments: { m1: { '2026-06-01': 8 } } }] });
    const wh = computeWeeklyHours(member(), weekDays, [j], { excludeJobId: 'self' });
    expect(wh.assigned).toBe(0);
    expect(wh.remaining).toBe(40);
  });

  it('drops capacity for days the member is off', () => {
    const m = member({ schedule: { '2026-06-01': { isOff: true } } as any });
    const wh = computeWeeklyHours(m, weekDays, []);
    expect(wh.capacity).toBe(32);
  });

  it('uses the configured non-working weekdays, not a hardcoded weekend', () => {
    // A shop that works Sat/Sun and rests Mon/Tue (getDay 1,2). The same 7 days
    // then yield 5 working days again, but a DIFFERENT five.
    const wh = computeWeeklyHours(member(), weekDays, [], { weekendDays: [1, 2] });
    expect(wh.capacity).toBe(40); // Wed–Sun
  });

  it('counts all seven days when no weekday is non-working', () => {
    const wh = computeWeeklyHours(member(), weekDays, [], { weekendDays: [] });
    expect(wh.capacity).toBe(56);
  });
});

describe('committedHoursOnDay with skipped days', () => {
  const member = { id: 'm1', name: 'Mike', role: 'Painter' } as CrewMember;
  const job = {
    id: 'j1', jobNumber: 'J-1', name: 'Deck', clientId: 'c1', estimateId: 'e1',
    address: 'x', stage: 'Scheduled', dateCreated: '2026-08-01',
    startDate: '2026-08-19T08:00:00', endDate: '2026-08-21T17:00:00',
    allocations: [{
      id: 's1', name: 'Crew', memberIds: ['m1'],
      startDate: '2026-08-19', endDate: '2026-08-21',
      startTime: '08:00', endTime: '17:00',
      skipDays: ['2026-08-20'],
    }],
  } as Job;

  it('counts a worked day and not a skipped one', () => {
    expect(committedHoursOnDay(member, [job], '2026-08-19')).toBe(9);
    expect(committedHoursOnDay(member, [job], '2026-08-20')).toBe(0);
  });

  it('ignores a granular entry left on a skipped day', () => {
    const j = {
      ...job,
      allocations: [{ ...job.allocations![0], hoursAssignments: { m1: { '2026-08-20': 8 } } }],
    } as Job;
    expect(committedHoursOnDay(member, [j], '2026-08-20')).toBe(0);
  });
});

// The editor's per-cell breakdown reads this list while the caption reads
// committedHoursOnDay. They are the same traversal, so the two can't drift.
describe('dayCommitments', () => {
  const twoShifts = job({
    name: 'Deck Staining',
    allocations: [
      { id: 'a1', name: 'Prep', startDate: '2026-06-01', endDate: '2026-06-02', startTime: '08:00', endTime: '12:00', memberIds: ['m1'] },
      { id: 'a2', name: 'Spray', startDate: '2026-06-01', endDate: '2026-06-01', startTime: '13:00', endTime: '17:00',
        memberIds: ['m1'], hoursAssignments: { m1: { '2026-06-01': 3 } } },
    ],
  });

  it('itemizes each shift with its window and hours', () => {
    expect(dayCommitments(member(), [twoShifts], '2026-06-01')).toEqual([
      { jobId: 'j1', jobNumber: 'J-1', jobName: 'Deck Staining', shiftId: 'a1', shiftName: 'Prep',
        startTime: '08:00', endTime: '12:00', hours: 4 },
      { jobId: 'j1', jobNumber: 'J-1', jobName: 'Deck Staining', shiftId: 'a2', shiftName: 'Spray',
        startTime: '13:00', endTime: '17:00', hours: 3 },
    ]);
  });

  it('sums to committedHoursOnDay', () => {
    const items = dayCommitments(member(), [twoShifts], '2026-06-01');
    expect(items.reduce((s, c) => s + c.hours, 0)).toBe(committedHoursOnDay(member(), [twoShifts], '2026-06-01'));
  });

  it('reports a per-day window override, not the shift default', () => {
    const j = job({
      allocations: [{ id: 'a', name: 'Crew', startDate: '2026-06-01', endDate: '2026-06-02', startTime: '08:00', endTime: '17:00',
        memberIds: ['m1'], dailyHours: { '2026-06-02': { startTime: '07:00', endTime: '12:00' } } }],
    });
    expect(dayCommitments(member(), [j], '2026-06-02')[0]).toMatchObject({ startTime: '07:00', endTime: '12:00', hours: 5 });
  });

  it('omits a day the shift skips', () => {
    const j = job({
      allocations: [{ id: 'a', name: 'Crew', startDate: '2026-06-01', endDate: '2026-06-03', startTime: '08:00', endTime: '17:00',
        memberIds: ['m1'], skipDays: ['2026-06-02'] }],
    });
    expect(dayCommitments(member(), [j], '2026-06-02')).toEqual([]);
    expect(dayCommitments(member(), [j], '2026-06-03')).toHaveLength(1);
  });

  // The editor holds a draft of the shift being edited; counting the saved copy too
  // would double-book the member against themselves.
  it('honours excludeAllocationId and excludeJobId', () => {
    expect(dayCommitments(member(), [twoShifts], '2026-06-01', { excludeAllocationId: 'a1' }))
      .toHaveLength(1);
    expect(dayCommitments(member(), [twoShifts], '2026-06-01', { excludeJobId: 'j1' })).toEqual([]);
  });

  it('carries a legacy (shift-less) job with no shift name', () => {
    const j = job({ name: 'Old Job', startDate: '2026-06-01T08:00:00', endDate: '2026-06-01T17:00:00', crewMemberIds: ['m1'] });
    expect(dayCommitments(member(), [j], '2026-06-01', { standardDay: 8 }))
      .toEqual([{ jobId: 'j1', jobNumber: 'J-1', jobName: 'Old Job', startTime: undefined, endTime: undefined, hours: 8 }]);
  });
});

describe('computeWeeklyHours — capacity follows the member schedule', () => {
  const lunch = { id: 'b1', durationMinutes: 60, paid: false, startTime: '12:00' };

  it('counts a half day as half a day and an off day as none', () => {
    // weekDays is Mon 2026-06-01 .. Sun 2026-06-07; the weekend is excluded by opts.
    const m = member({ schedule: {
      '2026-06-01': { date: '2026-06-01', startTime: '08:00', endTime: '17:00', isOff: false },
      '2026-06-02': { date: '2026-06-02', startTime: '08:00', endTime: '12:00', isOff: false },
      '2026-06-03': { date: '2026-06-03', startTime: '08:00', endTime: '17:00', isOff: true },
    } });
    // Mon 8 + Tue 4 + Wed 0 (off) + Thu 8 + Fri 8 (no entry -> standard day) = 28
    const r = computeWeeklyHours(m, weekDays, [], { standardDay: 8, weekendDays: [0, 6], defaultBreaks: [lunch] });
    expect(r.capacity).toBe(28);
  });

  it('leaves a member with no schedule on the standard day for every weekday', () => {
    const r = computeWeeklyHours(member(), weekDays, [], { standardDay: 8, weekendDays: [0, 6], defaultBreaks: [lunch] });
    expect(r.capacity).toBe(40);
  });
});
