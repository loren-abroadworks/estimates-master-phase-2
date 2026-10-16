import { describe, it, expect } from 'vitest';
import { detectAssignHoursWarnings, jobHoursProgress } from './assignHoursWarnings';

const base = {
  memberName: 'Alex',
  enteredTotal: 18,
  memberWeekTotalOther: 18, // member already has 18h on other jobs this week
  weeklyCapacity: 45,
  jobName: 'Deck Staining',
  jobTotalOther: 0, // no other hours on this job
  estHours: 40,
};

describe('detectAssignHoursWarnings — weekly capacity', () => {
  it('no warning when projected week total is under capacity', () => {
    // 18 + 18 = 36 < 45
    expect(detectAssignHoursWarnings(base)).toEqual([]);
  });

  it('no warning when projected week total exactly equals capacity', () => {
    // 27 + 18 = 45 === 45
    expect(detectAssignHoursWarnings({ ...base, enteredTotal: 27 })).toEqual([]);
  });

  it('warns when the entered hours push the member over weekly capacity', () => {
    // 30 + 18 = 48 > 45
    const w = detectAssignHoursWarnings({ ...base, enteredTotal: 30 });
    const capacity = w.find(m => m.includes('capacity'));
    expect(capacity).toBeDefined();
    expect(capacity).toContain('Alex');
    expect(capacity).toContain('48.0h');
    expect(capacity).toContain('45.0h');
  });

  it('no capacity warning when capacity is unknown (0)', () => {
    expect(detectAssignHoursWarnings({ ...base, enteredTotal: 99, weeklyCapacity: 0 }))
      .not.toContain(expect.stringContaining('capacity'));
  });
});

describe('detectAssignHoursWarnings — job estimate', () => {
  it('no warning when projected job total is under the estimate', () => {
    // jobTotalOther 0 + entered 18 = 18 < 40
    expect(detectAssignHoursWarnings(base).some(m => m.includes('estimate'))).toBe(false);
  });

  it('warns when the entered hours push the job over its estimate', () => {
    // jobTotalOther 30 + entered 18 = 48 > 40
    const w = detectAssignHoursWarnings({ ...base, jobTotalOther: 30 });
    const budget = w.find(m => m.includes('estimate'));
    expect(budget).toBeDefined();
    expect(budget).toContain('Deck Staining');
    expect(budget).toContain('48.0h');
    expect(budget).toContain('40.0h');
  });

  it('no budget warning when the job has no estimate (0)', () => {
    expect(detectAssignHoursWarnings({ ...base, jobTotalOther: 999, estHours: 0 })
      .some(m => m.includes('estimate'))).toBe(false);
  });
});

describe('detectAssignHoursWarnings — both', () => {
  it('emits both warnings when over capacity and over estimate', () => {
    // week: 30 + 20 = 50 > 45 ; job: 30 + 20 = 50 > 40
    const w = detectAssignHoursWarnings({
      ...base, enteredTotal: 20, memberWeekTotalOther: 30, jobTotalOther: 30,
    });
    expect(w).toHaveLength(2);
  });
});

describe('jobHoursProgress', () => {
  it('reports hours still needed when the job is under its estimate', () => {
    // other 20 + entered 15 = 35 assigned, of 40 => 5 remaining
    expect(jobHoursProgress(20, 15, 40)).toEqual({ assigned: 35, estimate: 40, remaining: 5 });
  });

  it('clamps remaining to zero when fully staffed or over', () => {
    expect(jobHoursProgress(30, 20, 40)).toEqual({ assigned: 50, estimate: 40, remaining: 0 });
  });

  it('rounds to one decimal', () => {
    expect(jobHoursProgress(10.25, 5.1, 40)).toEqual({ assigned: 15.4, estimate: 40, remaining: 24.6 });
  });

  it('returns null when the job has no estimate', () => {
    expect(jobHoursProgress(10, 5, 0)).toBeNull();
  });

  it('measures remaining against the fixed estimate, not the assigned total', () => {
    // Unassigning (lower jobTotalOther) must not change the estimate denominator.
    expect(jobHoursProgress(0, 0, 40)!.estimate).toBe(40);
    expect(jobHoursProgress(35, 0, 40)!.estimate).toBe(40);
  });
});
