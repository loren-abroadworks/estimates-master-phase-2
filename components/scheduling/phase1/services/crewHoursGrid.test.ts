import { describe, it, expect } from 'vitest';
import {
  requiredHoursForWeek, assignedHoursForJobInWeek, jobsScheduledInWeek,
  spreadWeeklyHours, assignableDayKeys, noEligibleDaysReason, setMemberDayHours, setMemberDayWindow, setMemberDayHoursPreservingSpan, assignMemberWeek,
  transferMemberDayHours,
  buildCrewHoursGrid, memberJobDayHours, memberShiftDayHours, buildJobSummaries, periodDayKeys, isMemberOnJob,
} from './crewHoursGrid';
import { computeWeeklyCapacity } from './shiftCapacity';
import type { CrewMember, Job, JobCrewAllocation, WorkOrder } from '../types';

const WEEKEND = [0, 6];

const job = (over: Partial<Job> = {}): Job =>
  ({ id: 'j1', jobNumber: 'J-1', name: 'Job', stage: 'Scheduled', clientId: 'c1', estimateId: 'e1',
     address: '1 St', dateCreated: '2026-01-01', ...over } as Job);

const wo = (over: Partial<WorkOrder> = {}): WorkOrder =>
  ({ id: 'wo1', estimateId: 'e1', version: 1, status: 'Scheduled', jobName: 'Job',
     totalProductionHours: 80, tasks: [], paintSchedule: [], crewLeaderId: null, crewMemberIds: [],
     ...over } as WorkOrder);

const member = (over: Partial<CrewMember> = {}): CrewMember =>
  ({ id: 'm1', name: 'Mike', role: 'Painter', ...over } as CrewMember);

// Week of Mon 2026-06-08 .. Fri 2026-06-12
const weekKeys = ['2026-06-08','2026-06-09','2026-06-10','2026-06-11','2026-06-12'];

describe('requiredHoursForWeek', () => {
  it('prorates a two-week job by working-day share (80h over 10 days, 5 in week = 40h)', () => {
    const j = job({ workOrderId: 'wo1', startDate: '2026-06-08T08:00:00', endDate: '2026-06-19T17:00:00' });
    const r = requiredHoursForWeek(j, [wo({ id: 'wo1' })], weekKeys, WEEKEND);
    expect(r.estimate).toBe(80);
    expect(r.required).toBe(40);
  });

  it('returns the full estimate when the job runs only in this week', () => {
    const j = job({ workOrderId: 'wo1', startDate: '2026-06-08T08:00:00', endDate: '2026-06-12T17:00:00' });
    const r = requiredHoursForWeek(j, [wo({ id: 'wo1' })], weekKeys, WEEKEND);
    expect(r.required).toBe(80);
  });

  it('reports zero estimate when there is no linked work order', () => {
    const j = job({ startDate: '2026-06-08T08:00:00', endDate: '2026-06-12T17:00:00' });
    const r = requiredHoursForWeek(j, [], weekKeys, WEEKEND);
    expect(r.estimate).toBe(0);
    expect(r.required).toBe(0);
  });
});

describe('memberJobDayHours — per-day window from dailyHours', () => {
  it('uses the dailyHours window length for a legacy crewMemberIds job day', () => {
    // 8am–5pm job shifted to 12pm–5pm on its first day → that day is 5h, not the 9h standard.
    const j = job({ startDate: '2026-06-08T12:00:00', endDate: '2026-06-09T17:00:00',
      crewMemberIds: ['m1'], dailyHours: { '2026-06-08': { startTime: '12:00', endTime: '17:00' } } });
    expect(memberJobDayHours(j, 'm1', '2026-06-08', 9)).toBe(5);
  });

  it('falls back to the standard day for a legacy day with no dailyHours window', () => {
    const j = job({ startDate: '2026-06-08T12:00:00', endDate: '2026-06-09T17:00:00',
      crewMemberIds: ['m1'], dailyHours: { '2026-06-08': { startTime: '12:00', endTime: '17:00' } } });
    expect(memberJobDayHours(j, 'm1', '2026-06-09', 9)).toBe(9);
  });

  it('uses the shift window for an allocation-span day without granular hours', () => {
    const j = job({ dailyHours: { '2026-06-08': { startTime: '13:00', endTime: '17:00' } },
      allocations: [{ id: 'a', name: 'x', startDate: '2026-06-08', endDate: '2026-06-08',
        startTime: '08:00', endTime: '17:00', memberIds: ['m1'] }] });
    // Shift window 08:00–17:00 = 9h; the job-level dailyHours no longer applies here.
    expect(memberJobDayHours(j, 'm1', '2026-06-08', 9)).toBe(9);
  });

  it('honors a shift per-day window override for the fallback', () => {
    const j = job({ allocations: [{ id: 'a', name: 'x', startDate: '2026-06-08', endDate: '2026-06-08',
      startTime: '08:00', endTime: '17:00', memberIds: ['m1'],
      dailyHours: { '2026-06-08': { startTime: '08:00', endTime: '12:00' } } }] });
    expect(memberJobDayHours(j, 'm1', '2026-06-08', 9)).toBe(4);
  });
});

describe('assignedHoursForJobInWeek', () => {
  it('sums granular hoursAssignments across members on this week\'s days', () => {
    const j = job({ allocations: [{ id: 'a', name: 'x', startDate: '2026-06-08', endDate: '2026-06-09',
      startTime: '08:00', endTime: '17:00', memberIds: ['m1', 'm2'],
      hoursAssignments: { m1: { '2026-06-08': 8, '2026-06-09': 6 }, m2: { '2026-06-08': 4 } } }] });
    expect(assignedHoursForJobInWeek(j, weekKeys, 8)).toBe(18);
  });

  it('falls back to the shift window for allocation days without granular hours', () => {
    const j = job({ allocations: [{ id: 'a', name: 'x', startDate: '2026-06-08', endDate: '2026-06-09',
      startTime: '08:00', endTime: '17:00', memberIds: ['m1'] }] });
    // Shift window 08:00–17:00 = 9h/day across two in-week days = 18h.
    expect(assignedHoursForJobInWeek(j, weekKeys, 8)).toBe(18);
  });

  it('ignores days outside the current week', () => {
    const j = job({ allocations: [{ id: 'a', name: 'x', startDate: '2026-06-05', endDate: '2026-06-08',
      startTime: '08:00', endTime: '17:00', memberIds: ['m1'],
      hoursAssignments: { m1: { '2026-06-05': 8, '2026-06-08': 8 } } }] });
    expect(assignedHoursForJobInWeek(j, weekKeys, 8)).toBe(8);
  });
});

describe('jobsScheduledInWeek', () => {
  it('includes jobs whose working-day span overlaps the week and excludes others', () => {
    const inWeek = job({ id: 'in', startDate: '2026-06-10T08:00:00', endDate: '2026-06-10T17:00:00' });
    const before = job({ id: 'before', startDate: '2026-06-01T08:00:00', endDate: '2026-06-01T17:00:00' });
    const cancelled = job({ id: 'x', stage: 'Cancelled', startDate: '2026-06-10T08:00:00', endDate: '2026-06-10T17:00:00' });
    const result = jobsScheduledInWeek([inWeek, before, cancelled], weekKeys, WEEKEND);
    expect(result.map(j => j.id)).toEqual(['in']);
  });
});

describe('spreadWeeklyHours', () => {
  it('splits evenly when divisible (32 over 4 days = 8 each)', () => {
    expect(spreadWeeklyHours(32, ['a', 'b', 'c', 'd'])).toEqual({ a: 8, b: 8, c: 8, d: 8 });
  });

  it('puts the remainder on the earliest days (30 over 4 = 8,8,7,7)', () => {
    expect(spreadWeeklyHours(30, ['a', 'b', 'c', 'd'])).toEqual({ a: 8, b: 8, c: 7, d: 7 });
  });

  it('returns an empty map for zero total or no days', () => {
    expect(spreadWeeklyHours(0, ['a'])).toEqual({});
    expect(spreadWeeklyHours(10, [])).toEqual({});
  });
});

describe('assignableDayKeys', () => {
  it('keeps every working day within the job span, days off included', () => {
    // A day off is a warning at assign time, not a day withheld from the scheduler.
    const j = job({ startDate: '2026-06-08T08:00:00', endDate: '2026-06-10T17:00:00' });
    expect(assignableDayKeys(j, weekKeys, WEEKEND)).toEqual(['2026-06-08', '2026-06-09', '2026-06-10']);
  });

  it('leaves out days the job does not run', () => {
    const j = job({ startDate: '2026-06-08T08:00:00', endDate: '2026-06-08T17:00:00' });
    expect(assignableDayKeys(j, weekKeys, WEEKEND)).toEqual(['2026-06-08']);
  });

  it('has no days for a job with no dates', () => {
    expect(assignableDayKeys(job(), weekKeys, WEEKEND)).toEqual([]);
  });
});

describe('setMemberDayHours — shift targeting', () => {
  const twoShift = () => job({ startDate: '2026-06-08T08:00:00', endDate: '2026-06-08T17:00:00',
    allocations: [
      { id: 'prep', name: 'Prep', startDate: '2026-06-08', endDate: '2026-06-08', startTime: '08:00', endTime: '12:00', memberIds: ['m1'] },
      { id: 'finish', name: 'Finish', startDate: '2026-06-08', endDate: '2026-06-08', startTime: '13:00', endTime: '17:00', memberIds: ['m1'] },
    ] });

  it('writes to the named shift, leaving the other untouched', () => {
    const out = setMemberDayHours(twoShift(), 'm1', '2026-06-08', 4, 'finish');
    expect(out.allocations!.find(a => a.id === 'finish')!.hoursAssignments).toEqual({ m1: { '2026-06-08': 4 } });
    expect(out.allocations!.find(a => a.id === 'prep')!.hoursAssignments ?? {}).toEqual({});
  });

  it('defaults to the primary (first) shift when no shiftId is given', () => {
    const out = setMemberDayHours(twoShift(), 'm1', '2026-06-08', 3);
    expect(out.allocations!.find(a => a.id === 'prep')!.hoursAssignments).toEqual({ m1: { '2026-06-08': 3 } });
  });
});

describe('setMemberDayHours', () => {
  it('creates an allocation and records the member + day hours when none exists', () => {
    const j = job({ startDate: '2026-06-08T08:00:00', endDate: '2026-06-09T17:00:00' });
    const next = setMemberDayHours(j, 'm1', '2026-06-08', 6);
    const a = next.allocations![0];
    expect(a.hoursAssignments!.m1['2026-06-08']).toBe(6);
    expect(a.memberIds).toContain('m1');
    expect(next.crewMemberIds).toContain('m1');
  });

  it('removes the member when their last day is set to zero', () => {
    const j = job({ allocations: [{ id: 'a', name: 'x', startDate: '2026-06-08', endDate: '2026-06-08',
      startTime: '08:00', endTime: '17:00', memberIds: ['m1'], hoursAssignments: { m1: { '2026-06-08': 8 } } }] });
    const next = setMemberDayHours(j, 'm1', '2026-06-08', 0);
    expect(next.allocations![0].memberIds).not.toContain('m1');
    expect(next.allocations![0].hoursAssignments!.m1).toBeUndefined();
    expect(next.crewMemberIds).not.toContain('m1');
  });

  it('keeps the other crew when removing one member from a crewMemberIds-only job', () => {
    // Job assigned only via crewMemberIds (no explicit allocations) — the demo-data shape.
    const j = job({ startDate: '2026-06-08T08:00:00', endDate: '2026-06-09T17:00:00',
      crewMemberIds: ['m1', 'm2', 'm3'] });
    const next = setMemberDayHours(j, 'm1', '2026-06-08', 0);
    // Only the removed member leaves; the others stay on the job.
    expect(next.crewMemberIds).not.toContain('m1');
    expect(next.crewMemberIds).toContain('m2');
    expect(next.crewMemberIds).toContain('m3');
  });

  it('drops a removed member\'s window overrides with them', () => {
    const j = job({ allocations: [{ id: 'a', name: 'x', startDate: '2026-06-08', endDate: '2026-06-08',
      startTime: '08:00', endTime: '17:00', memberIds: ['m1'],
      hoursAssignments: { m1: { '2026-06-08': 8 } },
      memberDailyWindows: { m1: { '2026-06-08': { startTime: '09:00', endTime: '13:00' } } } }] });
    const next = setMemberDayHours(j, 'm1', '2026-06-08', 0);
    expect(next.allocations![0].memberDailyWindows).toBeUndefined();
  });
});

describe('isMemberOnJob', () => {
  it('finds a member on the flattened crew or on any shift', () => {
    expect(isMemberOnJob(job({ crewMemberIds: ['m1'] }), 'm1')).toBe(true);
    expect(isMemberOnJob(job({ allocations: [{ id: 'a', name: 'x', startDate: '2026-06-08', endDate: '2026-06-08',
      startTime: '08:00', endTime: '17:00', memberIds: ['m2'] }] }), 'm2')).toBe(true);
  });

  it('is false for a job the member has no part in', () => {
    expect(isMemberOnJob(job({ crewMemberIds: ['m1'] }), 'm2')).toBe(false);
    expect(isMemberOnJob(job({}), 'm1')).toBe(false);
  });
});

describe('setMemberDayWindow', () => {
  const base = () => job({ allocations: [{ id: 'a', name: 'x', startDate: '2026-06-08', endDate: '2026-06-09',
    startTime: '08:00', endTime: '17:00', memberIds: ['m1', 'm2'],
    hoursAssignments: { m1: { '2026-06-08': 8 } } }] });

  it('records a member\'s personal window for one day', () => {
    const next = setMemberDayWindow(base(), 'm1', '2026-06-08', { startTime: '10:00', endTime: '14:00' });
    expect(next.allocations![0].memberDailyWindows).toEqual({ m1: { '2026-06-08': { startTime: '10:00', endTime: '14:00' } } });
    // Hours and crew stay untouched.
    expect(next.allocations![0].hoursAssignments).toEqual({ m1: { '2026-06-08': 8 } });
    expect(next.allocations![0].memberIds).toEqual(['m1', 'm2']);
  });

  it('keeps other members\' and other days\' windows when writing one', () => {
    let next = setMemberDayWindow(base(), 'm1', '2026-06-08', { startTime: '10:00', endTime: '14:00' });
    next = setMemberDayWindow(next, 'm2', '2026-06-08', { startTime: '07:00', endTime: '11:00' });
    next = setMemberDayWindow(next, 'm1', '2026-06-09', { startTime: '12:00', endTime: '16:00' });
    expect(next.allocations![0].memberDailyWindows).toEqual({
      m1: { '2026-06-08': { startTime: '10:00', endTime: '14:00' }, '2026-06-09': { startTime: '12:00', endTime: '16:00' } },
      m2: { '2026-06-08': { startTime: '07:00', endTime: '11:00' } },
    });
  });

  it('clears a window with null, and empty maps disappear entirely', () => {
    let next = setMemberDayWindow(base(), 'm1', '2026-06-08', { startTime: '10:00', endTime: '14:00' });
    next = setMemberDayWindow(next, 'm1', '2026-06-08', null);
    expect(next.allocations![0].memberDailyWindows).toBeUndefined();
  });

  it('writes to the named shift only', () => {
    const twoShift = job({ allocations: [
      { id: 'prep', name: 'Prep', startDate: '2026-06-08', endDate: '2026-06-08', startTime: '08:00', endTime: '12:00', memberIds: ['m1'] },
      { id: 'finish', name: 'Finish', startDate: '2026-06-08', endDate: '2026-06-08', startTime: '13:00', endTime: '17:00', memberIds: ['m1'] },
    ] });
    const next = setMemberDayWindow(twoShift, 'm1', '2026-06-08', { startTime: '14:00', endTime: '16:00' }, 'finish');
    expect(next.allocations!.find(a => a.id === 'finish')!.memberDailyWindows).toEqual({ m1: { '2026-06-08': { startTime: '14:00', endTime: '16:00' } } });
    expect(next.allocations!.find(a => a.id === 'prep')!.memberDailyWindows).toBeUndefined();
  });
});

describe('setMemberDayHoursPreservingSpan — editing one implicit day keeps the others', () => {
  // Member assigned via crewMemberIds only (window fallback shows 9h every span day).
  // Editing Monday must not collapse Tue–Fri to zero.
  it('materializes the window hours for the other span days when going granular', () => {
    const j = job({ startDate: '2026-06-08T08:00:00', endDate: '2026-06-12T17:00:00',
      crewMemberIds: ['m1', 'm2'] });
    const next = setMemberDayHoursPreservingSpan(j, 'm1', '2026-06-08', 4, WEEKEND, 9);
    expect(memberJobDayHours(next, 'm1', '2026-06-08', 9)).toBe(4); // edited day
    expect(memberJobDayHours(next, 'm1', '2026-06-09', 9)).toBe(9); // preserved
    expect(memberJobDayHours(next, 'm1', '2026-06-12', 9)).toBe(9); // preserved
    // The untouched co-worker is unaffected.
    expect(memberJobDayHours(next, 'm2', '2026-06-09', 9)).toBe(9);
  });

  it('respects per-day windows when materializing the preserved days', () => {
    const j = job({ startDate: '2026-06-08T08:00:00', endDate: '2026-06-09T17:00:00',
      crewMemberIds: ['m1'], dailyHours: { '2026-06-09': { startTime: '13:00', endTime: '17:00' } } });
    const next = setMemberDayHoursPreservingSpan(j, 'm1', '2026-06-08', 2, WEEKEND, 9);
    expect(memberJobDayHours(next, 'm1', '2026-06-08', 9)).toBe(2); // edited
    expect(memberJobDayHours(next, 'm1', '2026-06-09', 9)).toBe(4); // 13:00–17:00 window preserved
  });

  it('removing one implicit day keeps the rest of the span', () => {
    const j = job({ startDate: '2026-06-08T08:00:00', endDate: '2026-06-10T17:00:00',
      crewMemberIds: ['m1'] });
    const next = setMemberDayHoursPreservingSpan(j, 'm1', '2026-06-09', 0, WEEKEND, 9);
    expect(memberJobDayHours(next, 'm1', '2026-06-08', 9)).toBe(9);
    expect(memberJobDayHours(next, 'm1', '2026-06-09', 9)).toBe(0); // removed
    expect(memberJobDayHours(next, 'm1', '2026-06-10', 9)).toBe(9);
  });

  it('leaves an already-granular member untouched apart from the edited day', () => {
    const j = job({ allocations: [{ id: 'a', name: 'x', startDate: '2026-06-08', endDate: '2026-06-10',
      startTime: '08:00', endTime: '17:00', memberIds: ['m1'],
      hoursAssignments: { m1: { '2026-06-08': 5, '2026-06-10': 6 } } }] });
    const next = setMemberDayHoursPreservingSpan(j, 'm1', '2026-06-08', 3, WEEKEND, 9);
    expect(memberJobDayHours(next, 'm1', '2026-06-08', 9)).toBe(3); // edited
    expect(memberJobDayHours(next, 'm1', '2026-06-09', 9)).toBe(0); // never set, stays 0
    expect(memberJobDayHours(next, 'm1', '2026-06-10', 9)).toBe(6); // untouched granular day
  });

  it('adds a brand-new member without materializing a window they never had', () => {
    const j = job({ startDate: '2026-06-08T08:00:00', endDate: '2026-06-10T17:00:00' });
    const next = setMemberDayHoursPreservingSpan(j, 'm1', '2026-06-08', 6, WEEKEND, 9);
    expect(memberJobDayHours(next, 'm1', '2026-06-08', 9)).toBe(6);
    expect(memberJobDayHours(next, 'm1', '2026-06-09', 9)).toBe(0); // not previously assigned
  });
});

describe('transferMemberDayHours — handing one day\'s hours to another member', () => {
  it('clears the source member\'s day and gives the hours to the destination', () => {
    const j = job({ allocations: [{ id: 'a', name: 'x', startDate: '2026-06-08', endDate: '2026-06-10',
      startTime: '08:00', endTime: '17:00', memberIds: ['m1'],
      hoursAssignments: { m1: { '2026-06-08': 4, '2026-06-09': 5 } } }] });
    const next = transferMemberDayHours(j, 'm1', 'm2', '2026-06-08', 4, WEEKEND, 9, 'a');
    expect(memberJobDayHours(next, 'm1', '2026-06-08', 9)).toBe(0);
    expect(memberJobDayHours(next, 'm2', '2026-06-08', 9)).toBe(4);
    // The source member's other days are untouched.
    expect(memberJobDayHours(next, 'm1', '2026-06-09', 9)).toBe(5);
  });

  it('adds to the hours the destination already has on that job and day', () => {
    const j = job({ allocations: [{ id: 'a', name: 'x', startDate: '2026-06-08', endDate: '2026-06-10',
      startTime: '08:00', endTime: '17:00', memberIds: ['m1', 'm2'],
      hoursAssignments: { m1: { '2026-06-08': 4 }, m2: { '2026-06-08': 3 } } }] });
    const next = transferMemberDayHours(j, 'm1', 'm2', '2026-06-08', 4, WEEKEND, 9, 'a');
    expect(memberJobDayHours(next, 'm2', '2026-06-08', 9)).toBe(7);
    expect(memberJobDayHours(next, 'm1', '2026-06-08', 9)).toBe(0);
  });

  it('keeps the source member\'s remaining implicit span days when they had no granular map', () => {
    const j = job({ startDate: '2026-06-08T08:00:00', endDate: '2026-06-10T17:00:00',
      crewMemberIds: ['m1'] });
    const next = transferMemberDayHours(j, 'm1', 'm2', '2026-06-09', 9, WEEKEND, 9);
    expect(memberJobDayHours(next, 'm1', '2026-06-08', 9)).toBe(9);
    expect(memberJobDayHours(next, 'm1', '2026-06-09', 9)).toBe(0);
    expect(memberJobDayHours(next, 'm1', '2026-06-10', 9)).toBe(9);
    expect(memberJobDayHours(next, 'm2', '2026-06-09', 9)).toBe(9);
  });

  it('moves hours on the named shift only, leaving the other shift alone', () => {
    const j = job({ allocations: [
      { id: 'a', name: 'AM', startDate: '2026-06-08', endDate: '2026-06-08',
        startTime: '08:00', endTime: '12:00', memberIds: ['m1'], hoursAssignments: { m1: { '2026-06-08': 4 } } },
      { id: 'b', name: 'PM', startDate: '2026-06-08', endDate: '2026-06-08',
        startTime: '13:00', endTime: '17:00', memberIds: ['m1'], hoursAssignments: { m1: { '2026-06-08': 4 } } },
    ] });
    const next = transferMemberDayHours(j, 'm1', 'm2', '2026-06-08', 4, WEEKEND, 9, 'b');
    const shift = (id: string) => next.allocations!.find(a => a.id === id)!;
    expect(memberShiftDayHours(shift('a'), 'm1', '2026-06-08')).toBe(4); // AM untouched
    expect(memberShiftDayHours(shift('b'), 'm1', '2026-06-08')).toBe(0);
    expect(memberShiftDayHours(shift('b'), 'm2', '2026-06-08')).toBe(4);
  });

  it('is a no-op when the source and destination are the same member', () => {
    const j = job({ allocations: [{ id: 'a', name: 'x', startDate: '2026-06-08', endDate: '2026-06-08',
      startTime: '08:00', endTime: '17:00', memberIds: ['m1'], hoursAssignments: { m1: { '2026-06-08': 4 } } }] });
    const next = transferMemberDayHours(j, 'm1', 'm1', '2026-06-08', 4, WEEKEND, 9, 'a');
    expect(memberJobDayHours(next, 'm1', '2026-06-08', 9)).toBe(4);
  });
});

describe('assignMemberWeek', () => {
  it('replaces the member\'s days for the job with the new spread', () => {
    const j = job({ allocations: [{ id: 'a', name: 'x', startDate: '2026-06-08', endDate: '2026-06-12',
      startTime: '08:00', endTime: '17:00', memberIds: ['m1'], hoursAssignments: { m1: { '2026-06-08': 8, '2026-06-12': 8 } } }] });
    const next = assignMemberWeek(j, 'm1', { '2026-06-09': 8, '2026-06-10': 8 });
    expect(next.allocations![0].hoursAssignments!.m1).toEqual({ '2026-06-09': 8, '2026-06-10': 8 });
  });
});

const weekDates = weekKeys.map(k => new Date(`${k}T12:00:00`));

describe('buildCrewHoursGrid', () => {
  it('exposes a resolved availability window per day, defaulting when no schedule entry', () => {
    const model = buildCrewHoursGrid([member()], [], [], weekDates, WEEKEND, 8, [], { startTime: '07:00', endTime: '15:00' });
    const key = model.dayKeys[0];
    expect(model.rows[0].availByDay[key]).toEqual({ off: false, startTime: '07:00', endTime: '15:00' });
  });

  it('builds member rows with cells, capacity, and a jobs panel including unstaffed jobs', () => {
    const staffed = job({ id: 'staffed', jobNumber: 'J-1', name: 'Staffed', workOrderId: 'wo1',
      startDate: '2026-06-08T08:00:00', endDate: '2026-06-08T17:00:00',
      allocations: [{ id: 'a', name: 'x', startDate: '2026-06-08', endDate: '2026-06-08',
        startTime: '08:00', endTime: '17:00', memberIds: ['m1'], hoursAssignments: { m1: { '2026-06-08': 8 } } }] });
    const unstaffed = job({ id: 'unstaffed', jobNumber: 'J-2', name: 'Unstaffed', workOrderId: 'wo2',
      startDate: '2026-06-09T08:00:00', endDate: '2026-06-09T17:00:00' });
    const orders = [wo({ id: 'wo1', totalProductionHours: 8 }), wo({ id: 'wo2', totalProductionHours: 20 })];

    const model = buildCrewHoursGrid([member()], [staffed, unstaffed], orders, weekDates, WEEKEND, 8);

    expect(model.dayKeys).toEqual(weekKeys);
    const row = model.rows[0];
    expect(row.cellsByDay['2026-06-08']).toEqual([{ jobId: 'staffed', jobNumber: 'J-1', jobName: 'Staffed', shiftId: 'a', shiftName: undefined, hours: 8, grossHours: 8, color: expect.any(String), startTime: '08:00', endTime: '17:00' }]);
    expect(row.weekTotal).toBe(8);
    expect(row.capacity).toBe(40);
    expect(row.remaining).toBe(32);

    const unstaffedSummary = model.jobs.find(j => j.jobId === 'unstaffed')!;
    expect(unstaffedSummary.required).toBe(20);
    expect(unstaffedSummary.assigned).toBe(0);
    expect(unstaffedSummary.missing).toBe(20);
  });

  it('shows a member\'s personal day window on their chip, not the shift\'s', () => {
    // Mike has a 13:00–17:00 override on Monday; Sara stays on the shift's 08:00–17:00.
    const j = job({ id: 'j', jobNumber: 'J-1', name: 'Job', workOrderId: 'wo1',
      startDate: '2026-06-08T08:00:00', endDate: '2026-06-08T17:00:00',
      allocations: [{ id: 'a', name: 'x', startDate: '2026-06-08', endDate: '2026-06-08',
        startTime: '08:00', endTime: '17:00', memberIds: ['m1', 'm2'],
        hoursAssignments: { m1: { '2026-06-08': 4 }, m2: { '2026-06-08': 8 } },
        memberDailyWindows: { m1: { '2026-06-08': { startTime: '13:00', endTime: '17:00' } } } }] });

    const model = buildCrewHoursGrid([member(), member({ id: 'm2', name: 'Sara' })], [j], [wo({ id: 'wo1' })], weekDates, WEEKEND, 8);

    const mike = model.rows[0].cellsByDay['2026-06-08'][0];
    expect([mike.startTime, mike.endTime]).toEqual(['13:00', '17:00']);
    const sara = model.rows[1].cellsByDay['2026-06-08'][0];
    expect([sara.startTime, sara.endTime]).toEqual(['08:00', '17:00']);
  });

  it('scopes job summaries to a single day when fed one day (Day + Hours sidebar)', () => {
    // A week-long job (Mon–Fri, 5 working days) estimated at 40h; the member has 6h on Wed.
    const wed = new Date('2026-06-10T12:00:00');
    const j = job({ id: 'j', jobNumber: 'J-1', name: 'Job', workOrderId: 'wo1',
      startDate: '2026-06-08T08:00:00', endDate: '2026-06-12T17:00:00',
      allocations: [{ id: 'a', name: 'x', startDate: '2026-06-08', endDate: '2026-06-12',
        startTime: '08:00', endTime: '17:00', memberIds: ['m1'], hoursAssignments: { m1: { '2026-06-09': 9, '2026-06-10': 6 } } }] });

    const model = buildCrewHoursGrid([member()], [j], [wo({ id: 'wo1', totalProductionHours: 40 })], [wed], WEEKEND, 8);

    expect(model.dayKeys).toEqual(['2026-06-10']);
    const summary = model.jobs.find(s => s.jobId === 'j')!;
    expect(summary.required).toBe(8);          // 40h prorated to 1 of the job's 5 working days
    expect(summary.assigned).toBe(6);          // only Wed's hours, not Tue's 9h
    expect(summary.missing).toBe(2);
    expect(summary.days).toEqual(['2026-06-10']);
  });

  it('rolls up per-day totals: assigned across crew vs. total daily capacity', () => {
    const staffed = job({ id: 'staffed', jobNumber: 'J-1', name: 'Staffed', workOrderId: 'wo1',
      startDate: '2026-06-08T08:00:00', endDate: '2026-06-08T17:00:00',
      allocations: [{ id: 'a', name: 'x', startDate: '2026-06-08', endDate: '2026-06-08',
        startTime: '08:00', endTime: '17:00', memberIds: ['m1'], hoursAssignments: { m1: { '2026-06-08': 8 } } }] });
    // Two members, daily capacity 8 → 16 available per working day.
    const model = buildCrewHoursGrid([member(), member({ id: 'm2', name: 'Sara' })], [staffed], [wo({ id: 'wo1', totalProductionHours: 8 })], weekDates, WEEKEND, 8);
    expect(model.dayTotals['2026-06-08']).toEqual({ assigned: 8, capacity: 16 });
    expect(model.dayTotals['2026-06-09']).toEqual({ assigned: 0, capacity: 16 });
  });

  it('emits one cell per allocation (shift) a member works that day', () => {
    const j = job({ id: 'multi', jobNumber: 'J-9', name: 'Multi', workOrderId: 'wo9',
      startDate: '2026-06-08T08:00:00', endDate: '2026-06-12T17:00:00',
      allocations: [
        { id: 'a', name: 'Crew A', startDate: '2026-06-08', endDate: '2026-06-12',
          startTime: '08:00', endTime: '17:00', memberIds: ['m1'], hoursAssignments: { m1: { '2026-06-08': 3 } } },
        { id: 'b', name: 'Crew B', startDate: '2026-06-08', endDate: '2026-06-12',
          startTime: '08:00', endTime: '17:00', memberIds: ['m1'], hoursAssignments: { m1: { '2026-06-08': 4 } } },
      ] });
    const model = buildCrewHoursGrid([member()], [j], [wo({ id: 'wo9' })], weekDates, WEEKEND, 8);
    const cells = model.rows[0].cellsByDay['2026-06-08'];
    expect(cells).toHaveLength(2);
    expect(cells.map(c => [c.shiftId, c.hours])).toEqual([['a', 3], ['b', 4]]);
    // Per-shift chips still sum to the same day total.
    expect(model.dayTotals['2026-06-08'].assigned).toBe(7);
  });
});

import type { CrewBreak } from '../types';

// Reuses the existing `weekDates` (Mon 2026-06-08 .. Fri 2026-06-12) defined above.
const lunch30: CrewBreak = { id: 'b1', label: 'Lunch', durationMinutes: 30, paid: false, startTime: '12:00' };

const oneDay = [new Date('2026-06-08T12:00:00')];
// A one-day job 8:00–13:00 for m1 (gross 5h via dailyHours).
const fiveHourJob = job({
  startDate: '2026-06-08T08:00:00', endDate: '2026-06-08T13:00:00',
  crewMemberIds: ['m1'],
  dailyHours: { '2026-06-08': { startTime: '08:00', endTime: '13:00' } },
});

describe('buildCrewHoursGrid — break-aware job hours', () => {
  it('carves an unpaid fixed break inside the window off the chip', () => {
    const model = buildCrewHoursGrid([member()], [fiveHourJob], [], oneDay, WEEKEND, 8, [lunch30]);
    const cell = model.rows[0].cellsByDay['2026-06-08'][0];
    expect(cell.grossHours).toBe(5);
    expect(cell.hours).toBe(4.5);
    expect(cell.unpaidBreakHours).toBe(0.5);
    expect(model.rows[0].weekTotal).toBe(4.5);
  });

  it('leaves the chip whole for a PAID break in the window', () => {
    const paidLunch = { ...lunch30, paid: true };
    const model = buildCrewHoursGrid([member()], [fiveHourJob], [], oneDay, WEEKEND, 8, [paidLunch]);
    const cell = model.rows[0].cellsByDay['2026-06-08'][0];
    expect(cell.hours).toBe(5);
    expect(cell.unpaidBreakHours).toBeUndefined();
    expect(model.rows[0].weekTotal).toBe(5);
    expect(model.rows[0].paidHours).toBe(5);
  });

  it('does not carve a fixed break that falls in a gap between jobs', () => {
    // Job is 08:00–12:00; lunch starts 12:00 → outside the window.
    const morning = job({
      startDate: '2026-06-08T08:00:00', endDate: '2026-06-08T12:00:00',
      crewMemberIds: ['m1'], dailyHours: { '2026-06-08': { startTime: '08:00', endTime: '12:00' } },
    });
    const model = buildCrewHoursGrid([member()], [morning], [], oneDay, WEEKEND, 8, [lunch30]);
    const cell = model.rows[0].cellsByDay['2026-06-08'][0];
    expect(cell.hours).toBe(4);
    expect(cell.unpaidBreakHours).toBeUndefined();
  });

  it('subtracts an unpaid floating break from the day total, not the chip', () => {
    const floating: CrewBreak = { id: 'f1', durationMinutes: 30, paid: false }; // no startTime
    const fullDay = job({
      startDate: '2026-06-08T08:00:00', endDate: '2026-06-08T16:00:00',
      crewMemberIds: ['m1'], dailyHours: { '2026-06-08': { startTime: '08:00', endTime: '16:00' } },
    });
    const model = buildCrewHoursGrid([member()], [fullDay], [], oneDay, WEEKEND, 8, [floating]);
    const cell = model.rows[0].cellsByDay['2026-06-08'][0];
    expect(cell.hours).toBe(8);              // chip unchanged
    expect(model.rows[0].weekTotal).toBe(7.5); // day total reduced
    expect(model.dayTotals['2026-06-08'].assigned).toBe(7.5);
  });
});

describe('buildCrewHoursGrid — breaks', () => {
  it('capacity is the full working day; breaks do not shrink it', () => {
    const model = buildCrewHoursGrid([member()], [], [], weekDates, WEEKEND, 8, [lunch30]);
    expect(model.rows[0].capacity).toBe(40);
  });

  it('exposes resolved breaks per working day in breaksByDay', () => {
    const model = buildCrewHoursGrid([member()], [], [], weekDates, WEEKEND, 8, [lunch30]);
    expect(model.rows[0].breaksByDay['2026-06-08']).toEqual([lunch30]);
  });

  it('honours a per-day override (empty array = no break that day)', () => {
    const m = member({ schedule: { '2026-06-08': { date: '2026-06-08', startTime: '08:00', endTime: '17:00', isOff: false, breaksOverride: [] } } });
    const model = buildCrewHoursGrid([m], [], [], weekDates, WEEKEND, 8, [lunch30]);
    // 41h, not 40: Monday is an explicit 8am–5pm with no break to carve, so it holds a
    // full 9h of work. The other four days have no entry and stay on the standard day.
    expect(model.rows[0].capacity).toBe(41);
    expect(model.rows[0].breaksByDay['2026-06-08']).toEqual([]);
  });

  it('paidHours equals worked hours (paid in-window breaks counted, unpaid not)', () => {
    const model = buildCrewHoursGrid([member()], [], [], weekDates, WEEKEND, 8, [lunch30]);
    expect(model.rows[0].paidHours).toBe(model.rows[0].weekTotal);
    expect(model.rows[0].paidHours).toBe(0); // no jobs → no worked hours
  });
});

describe('buildJobSummaries', () => {
  const twoWeekJob = job({
    workOrderId: 'wo1', startDate: '2026-06-08T08:00:00', endDate: '2026-06-19T17:00:00', // Mon..Fri across 2 weeks = 10 working days
  });
  const orders = [wo({ id: 'wo1', totalProductionHours: 80 })];

  it('matches the job summaries buildCrewHoursGrid produces for the same week', () => {
    const weekDays = weekKeys.map(k => new Date(`${k}T12:00:00`));
    const fromGrid = buildCrewHoursGrid([member()], [twoWeekJob], orders, weekDays, WEEKEND, 8).jobs;
    const direct = buildJobSummaries([twoWeekJob], orders, weekKeys, WEEKEND);
    expect(direct).toEqual(fromGrid);
  });

  it('prorates required hours to the wider month range (80h over 10 days, all 10 in month = 80h)', () => {
    const monthKeys = periodDayKeys(new Date('2026-06-15T12:00:00'), 'month', WEEKEND, weekKeys);
    const [summary] = buildJobSummaries([twoWeekJob], orders, monthKeys, WEEKEND);
    expect(summary.required).toBe(80);
    expect(summary.days.length).toBe(10);
  });

  it('excludes jobs whose working days do not intersect the range', () => {
    const future = job({ workOrderId: 'wo1', startDate: '2026-09-01', endDate: '2026-09-04' });
    expect(buildJobSummaries([future], orders, weekKeys, WEEKEND)).toEqual([]);
  });
});

describe('buildJobSummaries — break-aware assigned', () => {
  const dayKeys = ['2026-06-08'];

  it('subtracts unpaid fixed breaks inside the job window from assigned', () => {
    const list = buildJobSummaries([fiveHourJob], [], dayKeys, WEEKEND, 8, [member()], [lunch30]);
    expect(list[0].assigned).toBe(4.5);
  });

  it('counts paid breaks (assigned stays whole)', () => {
    const paidLunch = { ...lunch30, paid: true };
    const list = buildJobSummaries([fiveHourJob], [], dayKeys, WEEKEND, 8, [member()], [paidLunch]);
    expect(list[0].assigned).toBe(5);
  });

  it('ignores floating breaks for the per-job counter', () => {
    const floating: CrewBreak = { id: 'f1', durationMinutes: 30, paid: false };
    const list = buildJobSummaries([fiveHourJob], [], dayKeys, WEEKEND, 8, [member()], [floating]);
    expect(list[0].assigned).toBe(5);
  });

  it('is backward-compatible when no members are passed (gross hours)', () => {
    const list = buildJobSummaries([fiveHourJob], [], dayKeys, WEEKEND, 8);
    expect(list[0].assigned).toBe(5);
  });
});

describe('periodDayKeys', () => {
  it('returns the given week keys unchanged for the week period', () => {
    expect(periodDayKeys(new Date('2026-06-10T12:00:00'), 'week', WEEKEND, weekKeys)).toEqual(weekKeys);
  });

  it('returns every working day of the calendar month for the month period', () => {
    const keys = periodDayKeys(new Date('2026-06-15T12:00:00'), 'month', WEEKEND, weekKeys);
    expect(keys[0]).toBe('2026-06-01'); // Mon
    expect(keys[keys.length - 1]).toBe('2026-06-30'); // Tue
    expect(keys.every(k => k.startsWith('2026-06-'))).toBe(true);
    expect(keys).not.toContain('2026-06-06'); // Saturday excluded
  });

  it('spans the whole calendar year for the year period', () => {
    const keys = periodDayKeys(new Date('2026-06-15T12:00:00'), 'year', WEEKEND, weekKeys);
    expect(keys[0]).toBe('2026-01-01');
    expect(keys[keys.length - 1]).toBe('2026-12-31');
  });
});

describe('memberShiftDayHours', () => {
  const alloc = { id: 'prep', name: 'Prep', startDate: '2026-06-08', endDate: '2026-06-09',
    startTime: '08:00', endTime: '12:00', memberIds: ['m1'] } as any;

  it('returns granular hours when set', () => {
    const a = { ...alloc, hoursAssignments: { m1: { '2026-06-08': 3 } } };
    expect(memberShiftDayHours(a, 'm1', '2026-06-08')).toBe(3);
  });

  it('falls back to the shift window length when no granular map', () => {
    expect(memberShiftDayHours(alloc, 'm1', '2026-06-08')).toBe(4); // 08:00–12:00
  });

  it('returns 0 when the member is not in the shift or the day is outside the span', () => {
    expect(memberShiftDayHours(alloc, 'm2', '2026-06-08')).toBe(0);
    expect(memberShiftDayHours(alloc, 'm1', '2026-06-20')).toBe(0);
  });
});

describe('buildCrewHoursGrid — per-shift chips', () => {
  it('emits one cell per shift a member works that day', () => {
    const j = job({ startDate: '2026-06-08T08:00:00', endDate: '2026-06-08T17:00:00',
      allocations: [
        { id: 'prep', name: 'Prep', startDate: '2026-06-08', endDate: '2026-06-08', startTime: '08:00', endTime: '12:00', memberIds: ['m1'], hoursAssignments: { m1: { '2026-06-08': 4 } } },
        { id: 'finish', name: 'Finish', startDate: '2026-06-08', endDate: '2026-06-08', startTime: '13:00', endTime: '17:00', memberIds: ['m1'], hoursAssignments: { m1: { '2026-06-08': 4 } } },
      ] });
    const m = member({ id: 'm1', name: 'Mike' });
    const oneDay = [new Date('2026-06-08T12:00:00')];
    const model = buildCrewHoursGrid([m], [j], [], oneDay, WEEKEND, 8);
    const cells = model.rows[0].cellsByDay['2026-06-08'];
    expect(cells.map(c => c.shiftId)).toEqual(['prep', 'finish']); // sorted by window start
    expect(cells.map(c => c.hours)).toEqual([4, 4]);
    expect(cells.map(c => c.shiftName)).toEqual(['Prep', 'Finish']);
  });
});

describe('buildJobSummaries — per-shift summaries', () => {
  const weekKeys = ['2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12'];
  const twoShift = {
    id: 'j-2s', jobNumber: 'J-2S', name: 'Two Shift', address: 'x', stage: 'Scheduled',
    startDate: '2026-06-08T08:00:00', endDate: '2026-06-09T17:00:00',
    allocations: [
      { id: 's1', name: 'First Coat', memberIds: ['m1'], startDate: '2026-06-08', endDate: '2026-06-09', startTime: '13:00', endTime: '15:00' },
      { id: 's2', name: 'Second Coat', memberIds: ['m1'], startDate: '2026-06-08', endDate: '2026-06-09', startTime: '15:00', endTime: '17:00' },
    ],
  } as unknown as Job;

  it('emits one shift summary per allocation with period-filtered days', () => {
    const [sum] = buildJobSummaries([twoShift], [], weekKeys, [0, 6]);
    expect(sum.shifts.map(s => s.name)).toEqual(['First Coat', 'Second Coat']);
    expect(sum.shifts[0]).toMatchObject({ shiftId: 's1', startTime: '13:00', endTime: '15:00', days: ['2026-06-08', '2026-06-09'] });
  });

  it('a shift outside the period lists with empty days', () => {
    // One shift inside the week, one after it. The envelope has to span both, the way every
    // real write does (recomputeJobEnvelope runs on all of them) — a job whose only shift is
    // outside the period is not scheduled in that period at all, so it would not be listed.
    const j = {
      ...twoShift,
      endDate: '2026-06-15T17:00:00',
      allocations: [
        twoShift.allocations![0],
        { ...twoShift.allocations![1], startDate: '2026-06-15', endDate: '2026-06-15' },
      ],
    } as Job;
    const [sum] = buildJobSummaries([j], [], weekKeys, [0, 6]);
    expect(sum.shifts.map(sh => sh.shiftId)).toEqual(['s1', 's2']); // both listed
    expect(sum.shifts[0].days).toEqual(['2026-06-08', '2026-06-09']);
    expect(sum.shifts[1].days).toEqual([]); // outside the period, but still present
  });
});

// The crew hours grid and the shift editor's weekly meter must report the same hours for
// the same member and week — they drifted once because each had its own fallback for a
// member with no itemized hours (the grid used the shift window, the editor a whole
// standard day, stacked per shift). Both now share crewWeeklyHours' window helpers.
describe('grid week total vs. the shift editor weekly meter', () => {
  const weekDays = ['2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12']
    .map(k => new Date(`${k}T12:00:00`));
  const member = { id: 'm1', name: 'Mike' } as CrewMember;

  const agree = (jobs: Job[], standardDay = 9) => {
    const [row] = buildCrewHoursGrid([member], jobs, [], weekDays, [0, 6], standardDay).rows;
    const bar = computeWeeklyCapacity(member, weekDays, jobs, {}, { standardDay, weekendDays: [0, 6] });
    expect(bar.assigned).toBe(row.weekTotal);
    expect(bar.capacity).toBe(row.capacity);
    return row.weekTotal;
  };

  it('agrees on a member working a 4h morning shift all week', () => {
    const j = {
      id: 'j1', jobNumber: 'J-1', name: 'Job', stage: 'Scheduled',
      startDate: '2026-06-08T08:00:00', endDate: '2026-06-12T12:00:00',
      allocations: [{ id: 'a1', name: 'Morning', memberIds: ['m1'], startDate: '2026-06-08', endDate: '2026-06-12', startTime: '08:00', endTime: '12:00' }],
    } as unknown as Job;
    expect(agree([j])).toBe(20); // 4h × 5 days — not 45h
  });

  it('agrees when the member works two shifts in one day', () => {
    const j = {
      id: 'j1', jobNumber: 'J-1', name: 'Job', stage: 'Scheduled',
      startDate: '2026-06-08T08:00:00', endDate: '2026-06-08T17:00:00',
      allocations: [
        { id: 'a1', name: 'Morning', memberIds: ['m1'], startDate: '2026-06-08', endDate: '2026-06-08', startTime: '08:00', endTime: '12:00' },
        { id: 'a2', name: 'Afternoon', memberIds: ['m1'], startDate: '2026-06-08', endDate: '2026-06-08', startTime: '13:00', endTime: '17:00' },
      ],
    } as unknown as Job;
    expect(agree([j])).toBe(8); // 4h + 4h — not two standard days
  });

  it('agrees on itemized hours and on a per-day window override', () => {
    const itemized = {
      id: 'j1', jobNumber: 'J-1', name: 'Job', stage: 'Scheduled',
      startDate: '2026-06-08T08:00:00', endDate: '2026-06-09T17:00:00',
      allocations: [{
        id: 'a1', name: 'Crew', memberIds: ['m1'], startDate: '2026-06-08', endDate: '2026-06-09',
        startTime: '08:00', endTime: '17:00', hoursAssignments: { m1: { '2026-06-08': 6 } },
      }],
    } as unknown as Job;
    expect(agree([itemized])).toBe(6); // the unset second day counts as 0 on both sides

    const override = {
      id: 'j2', jobNumber: 'J-2', name: 'Job', stage: 'Scheduled',
      startDate: '2026-06-08T08:00:00', endDate: '2026-06-08T17:00:00',
      allocations: [{
        id: 'a1', name: 'Crew', memberIds: ['m1'], startDate: '2026-06-08', endDate: '2026-06-08',
        startTime: '08:00', endTime: '17:00', dailyHours: { '2026-06-08': { startTime: '08:00', endTime: '11:30' } },
      }],
    } as unknown as Job;
    expect(agree([override])).toBe(3.5);
  });

  it('agrees on a legacy job with no shifts', () => {
    const j = {
      id: 'j1', jobNumber: 'J-1', name: 'Job', stage: 'Scheduled',
      startDate: '2026-06-08T08:00:00', endDate: '2026-06-09T17:00:00',
      crewMemberIds: ['m1'], allocations: [],
      dailyHours: { '2026-06-08': { startTime: '08:00', endTime: '12:00' } },
    } as unknown as Job;
    expect(agree([j])).toBe(13); // 4h (windowed) + 9h (standard day)
  });
});

describe('skipped days contribute no hours', () => {
  const member = 'm1';
  const alloc: JobCrewAllocation = {
    id: 's1', name: 'Crew', memberIds: [member],
    startDate: '2026-08-19', endDate: '2026-08-21',
    startTime: '08:00', endTime: '17:00',
    skipDays: ['2026-08-20'],
  };
  const job: Job = {
    id: 'j1', jobNumber: 'J-1', name: 'Deck', clientId: 'c1', estimateId: 'e1',
    address: 'x', stage: 'Scheduled', dateCreated: '2026-08-01',
    startDate: '2026-08-19T08:00:00', endDate: '2026-08-21T17:00:00',
    allocations: [alloc],
  } as Job;

  it('memberShiftDayHours returns 0 on a skipped day, hours on a worked day', () => {
    expect(memberShiftDayHours(alloc, member, '2026-08-19')).toBe(9);
    expect(memberShiftDayHours(alloc, member, '2026-08-20')).toBe(0);
    expect(memberShiftDayHours(alloc, member, '2026-08-21')).toBe(9);
  });

  // The regression that matters: a granular per-member entry must NOT resurrect a
  // skipped day, because the map is consulted before the range check.
  it('memberShiftDayHours ignores a granular entry left on a skipped day', () => {
    const withGranular = { ...alloc, hoursAssignments: { [member]: { '2026-08-20': 8 } } };
    expect(memberShiftDayHours(withGranular, member, '2026-08-20')).toBe(0);
  });

  // Both days are in the granular map, so the ONLY difference between them is the skip.
  // (A member's granular map is authoritative: days absent from it count 0 regardless.)
  it('memberJobDayHours ignores a granular entry left on a skipped day', () => {
    const withGranular = { ...alloc, hoursAssignments: { [member]: { '2026-08-19': 9, '2026-08-20': 8 } } };
    const j = { ...job, allocations: [withGranular] };
    expect(memberJobDayHours(j, member, '2026-08-20', 8)).toBe(0);
    expect(memberJobDayHours(j, member, '2026-08-19', 8)).toBe(9);
  });

  it('a member with no granular map falls back to the window on worked days only', () => {
    expect(memberJobDayHours(job, member, '2026-08-19', 8)).toBe(9);
    expect(memberJobDayHours(job, member, '2026-08-20', 8)).toBe(0);
    expect(memberJobDayHours(job, member, '2026-08-21', 8)).toBe(9);
  });
});

describe('buildCrewHoursGrid — availability flags on the cells', () => {
  const lunch: CrewBreak = { id: 'b1', durationMinutes: 60, paid: false, startTime: '12:00' };
  const DAY = '2026-08-18';
  const days = [new Date(`${DAY}T12:00:00`)];
  // One shift, 1–5pm, with m1 booked its full 4h.
  const shiftJob = () => job({ startDate: `${DAY}T13:00:00`, endDate: `${DAY}T17:00:00`,
    allocations: [{ id: 'a', name: 'Crew',
      startDate: DAY, endDate: DAY, startTime: '13:00', endTime: '17:00',
      memberIds: ['m1'], hoursAssignments: { m1: { [DAY]: 4 } } }] });
  const withDay = (over: Partial<{ startTime: string; endTime: string; isOff: boolean }>) =>
    member({ schedule: { [DAY]: { date: DAY, startTime: '08:00', endTime: '17:00', isOff: false, ...over } } });

  it('flags a chip that sits outside the member\'s working window', () => {
    // They work mornings; the shift runs 1–5pm, entirely after their day ends.
    const model = buildCrewHoursGrid([withDay({ endTime: '12:00' })], [shiftJob()], [], days, WEEKEND, 8, [lunch]);
    expect(model.rows[0].cellsByDay[DAY][0].outsideAvailability).toEqual({ before: 0, after: 5 });
  });

  it('flags a chip on a day the member is off, and keeps the chip', () => {
    const model = buildCrewHoursGrid([withDay({ isOff: true })], [shiftJob()], [], days, WEEKEND, 8, [lunch]);
    const cell = model.rows[0].cellsByDay[DAY][0];
    expect(cell.onOffDay).toBe(true);
    expect(cell.hours).toBe(4); // the booking is still visible, not hidden
  });

  it('reports hours booked past what the member can work that day', () => {
    const model = buildCrewHoursGrid([withDay({ endTime: '12:00' })], [shiftJob()], [], days, WEEKEND, 8, [lunch]);
    // 4h booked against a 4h day is not over; the flag is about volume only.
    expect(model.rows[0].cellsByDay[DAY][0].overAvailableHours).toBeUndefined();
    expect(model.rows[0].availableHoursByDay[DAY]).toBe(4);
  });

  it('flags the volume when more hours are booked than the member can work', () => {
    const nineHourShift = job({ startDate: `${DAY}T08:00:00`, endDate: `${DAY}T17:00:00`,
      allocations: [{ id: 'a', name: 'Crew',
        startDate: DAY, endDate: DAY, startTime: '08:00', endTime: '17:00',
        memberIds: ['m1'], hoursAssignments: { m1: { [DAY]: 9 } } }] });
    const model = buildCrewHoursGrid([withDay({ endTime: '12:00' })], [nineHourShift], [], days, WEEKEND, 8, [lunch]);
    expect(model.rows[0].cellsByDay[DAY][0].overAvailableHours).toBe(5); // 9h booked, 4h day
  });

  it('leaves an in-window chip on a normal day unflagged', () => {
    const model = buildCrewHoursGrid([withDay({})], [shiftJob()], [], days, WEEKEND, 8, [lunch]);
    const cell = model.rows[0].cellsByDay[DAY][0];
    expect(cell.onOffDay).toBeUndefined();
    expect(cell.outsideAvailability).toBeUndefined();
    expect(cell.overAvailableHours).toBeUndefined();
  });

  it('builds the day column capacity from what each member can actually work', () => {
    const half = withDay({ endTime: '12:00' });
    const off = member({ id: 'm2', name: 'Ana', schedule: { [DAY]: { date: DAY, startTime: '08:00', endTime: '17:00', isOff: true } } });
    const plain = member({ id: 'm3', name: 'Sam' });
    const model = buildCrewHoursGrid([half, off, plain], [], [], days, WEEKEND, 8, [lunch]);
    expect(model.dayTotals[DAY].capacity).toBe(12); // 4 + 0 + 8
  });
});

describe('noEligibleDaysReason — why there is no day to book on', () => {
  it('is null while the job still runs on a day of this week', () => {
    const j = job({ startDate: '2026-06-08T08:00:00', endDate: '2026-06-09T17:00:00' });
    expect(noEligibleDaysReason(j, weekKeys, WEEKEND)).toBeNull();
  });

  it('reports an unscheduled job, which has no days at all yet', () => {
    expect(noEligibleDaysReason(job(), weekKeys, WEEKEND)).toEqual({ kind: 'unscheduled' });
  });

  it('reports a job that runs outside this week, and when it does run', () => {
    const j = job({ startDate: '2026-06-15T08:00:00', endDate: '2026-06-17T17:00:00' });
    expect(noEligibleDaysReason(j, weekKeys, WEEKEND))
      .toEqual({ kind: 'notThisWeek', jobDays: ['2026-06-15', '2026-06-16', '2026-06-17'] });
  });
});

describe('assignableDayKeys — a day off is offered, not withheld', () => {
  it('keeps a day the member is off, so a scheduler can still book it', () => {
    const j = job({ startDate: '2026-06-08T08:00:00', endDate: '2026-06-09T17:00:00' });
    expect(assignableDayKeys(j, weekKeys, WEEKEND)).toEqual(['2026-06-08', '2026-06-09']);
  });
});

describe('noEligibleDaysReason — only the job can leave nothing to assign', () => {
  it('is null when the job runs this week, even if the member is off all of it', () => {
    const j = job({ startDate: '2026-06-08T08:00:00', endDate: '2026-06-09T17:00:00' });
    expect(noEligibleDaysReason(j, weekKeys, WEEKEND)).toBeNull();
  });
});

describe('requiredHoursForWeek — a gapped job pro-rates over worked days', () => {
  const WEEKENDS = [0, 6];
  const wo = [{ id: 'wo1', totalProductionHours: 24 }] as any;
  // Mon 17 + Tue 18 pinned as worked, Wednesday's day pushed out to Mon 24.
  const gapped = {
    id: 'j1', jobNumber: 'J-1', name: 'Deck', workOrderId: 'wo1', stage: 'Scheduled',
    startDate: '2026-08-17T08:00:00', endDate: '2026-08-24T17:00:00',
    allocations: [
      { id: 'a1-worked', name: 'Crew', memberIds: ['m1'], pinned: true,
        startDate: '2026-08-17', endDate: '2026-08-18', startTime: '08:00', endTime: '17:00' },
      { id: 'a1', name: 'Crew', memberIds: ['m1'],
        startDate: '2026-08-24', endDate: '2026-08-24', startTime: '08:00', endTime: '17:00' },
    ],
  } as any;

  it('asks for two thirds of the estimate in the week holding two of three worked days', () => {
    const weekOf17 = ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21'];
    // 3 worked days total, 2 of them this week -> 24 * 2/3. The envelope would have said
    // 24 * 5/6 = 20h and reported a phantom 4h missing.
    expect(requiredHoursForWeek(gapped, wo, weekOf17, WEEKENDS).required).toBe(16);
  });

  it('asks for the remaining third in the week holding the moved day', () => {
    const weekOf24 = ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28'];
    expect(requiredHoursForWeek(gapped, wo, weekOf24, WEEKENDS).required).toBe(8);
  });
});
