import { describe, it, expect } from 'vitest';
import { detectHoursWarnings } from './hoursWarnings';
import type { Job } from '../types';

// A staged day always uses an 8-hour window unless overridden.
const day8 = { startTime: '08:00', endTime: '16:00' }; // 8h

// Minimal Job factory for "other jobs" on the board.
const job = (over: Partial<Job>): Job => ({
  id: 'other', jobNumber: 'J-9', name: 'Other', stage: 'Scheduled',
  startDate: '2026-06-16T08:00:00', endDate: '2026-06-16T17:00:00',
  crewMemberIds: ['m1'], dateCreated: '', clientId: '', estimateId: '', address: '',
  ...over,
} as Job);

const base = {
  jobId: 'j1',
  jobName: 'Job 1',
  stagedDays: ['2026-06-16'],
  dailyHours: { '2026-06-16': day8 },
  crew: [{ id: 'm1', name: 'Alex' }],
  estHours: 40,
  otherJobs: [] as Job[],
  capacityHours: 8,
  standardDay: 9,
};

const kinds = (args: Parameters<typeof detectHoursWarnings>[0]) =>
  detectHoursWarnings(args).map(i => i.kind).sort();

describe('detectHoursWarnings — budget', () => {
  it('no warning when scheduled hours are under the estimate', () => {
    // 1 member x 8h x 1 day = 8h < 40h
    expect(kinds(base)).not.toContain('budget');
  });

  it('no warning when scheduled hours exactly equal the estimate', () => {
    // 1 member x 8h x 5 days = 40h === 40h
    const days = ['2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19', '2026-06-22'];
    const dailyHours = Object.fromEntries(days.map(d => [d, day8]));
    expect(kinds({ ...base, stagedDays: days, dailyHours })).not.toContain('budget');
  });

  it('warns when scheduled hours exceed the estimate', () => {
    const days = ['2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19', '2026-06-22', '2026-06-23'];
    const dailyHours = Object.fromEntries(days.map(d => [d, day8])); // 48h > 40h
    const issues = detectHoursWarnings({ ...base, stagedDays: days, dailyHours });
    const budget = issues.find(i => i.kind === 'budget');
    expect(budget).toBeDefined();
    expect(budget!.severity).toBe('low');
    expect(budget!.message).toContain('48.0h');
    expect(budget!.message).toContain('40.0h');
  });

  it('counts per-person hours (2 members double the total)', () => {
    // 2 members x 8h x 3 days = 48h > 40h
    const days = ['2026-06-16', '2026-06-17', '2026-06-18'];
    const dailyHours = Object.fromEntries(days.map(d => [d, day8]));
    expect(kinds({
      ...base, stagedDays: days, dailyHours,
      crew: [{ id: 'm1', name: 'Alex' }, { id: 'm2', name: 'Bo' }],
    })).toContain('budget');
  });

  it('no budget warning when there is no work order (estHours = 0)', () => {
    const days = ['2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19', '2026-06-22', '2026-06-23'];
    const dailyHours = Object.fromEntries(days.map(d => [d, day8]));
    expect(kinds({ ...base, estHours: 0, stagedDays: days, dailyHours })).not.toContain('budget');
  });
});

describe('detectHoursWarnings — day capacity', () => {
  it('no warning when a single day is within capacity', () => {
    expect(kinds(base)).not.toContain('day-capacity');
  });

  it('warns when this job alone exceeds the daily cap', () => {
    const long = { startTime: '07:00', endTime: '19:00' }; // 12h > 8h cap
    const issues = detectHoursWarnings({ ...base, dailyHours: { '2026-06-16': long } });
    const cap = issues.find(i => i.kind === 'day-capacity');
    expect(cap).toBeDefined();
    expect(cap!.severity).toBe('medium');
    expect(cap!.message).toContain('Alex');
    expect(cap!.message).toContain('12.0h');
    expect(cap!.message).toContain('8.0h');
  });

  it('warns when another job that day pushes the member over the cap', () => {
    // This job: 8h. Other job m1 works the same day: +9h standard => 17h > 8h.
    const other = job({ id: 'other', crewMemberIds: ['m1'] });
    expect(kinds({ ...base, otherJobs: [other] })).toContain('day-capacity');
  });

  it('ignores other jobs that do not include the member', () => {
    const other = job({ id: 'other', crewMemberIds: ['someone-else'] });
    expect(kinds({ ...base, otherJobs: [other] })).not.toContain('day-capacity');
  });

  it('reports only the overloaded member, once per day', () => {
    const long = { startTime: '07:00', endTime: '19:00' }; // 12h
    const issues = detectHoursWarnings({
      ...base,
      dailyHours: { '2026-06-16': long },
      crew: [{ id: 'm1', name: 'Alex' }, { id: 'm2', name: 'Bo' }],
    });
    const caps = issues.filter(i => i.kind === 'day-capacity');
    // Both members work 12h this single day, so both are reported — once each.
    expect(caps).toHaveLength(2);
  });
});
