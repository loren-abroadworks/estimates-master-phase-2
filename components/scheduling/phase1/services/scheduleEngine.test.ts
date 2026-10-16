import { describe, it, expect } from 'vitest';
import { moveJobToSlot, shiftJobsFromPoint, configFromSettings, workingDayKeys, scheduledWindowHours, reflowFromStart, timeShiftChange, initialScheduleChange, allocDayWindow, recomputeJobEnvelope, cascadeFromTimeShift, cascadeForPrimary, resolveTimeShiftCascade, primaryFromDailyEdits, clampDayWindow, shiftCrewScope, placeHoursConflictFree, allocCoversDay, allocWorkedDayKeys, jobWorkedDayKeys } from './scheduleEngine';
import type { Job, JobCrewAllocation } from '../types';

describe('clampDayWindow', () => {
  const cfg = configFromSettings(undefined, false); // workday 08:00–17:00

  it('leaves a valid window unchanged', () => {
    const w = { startTime: '09:00', endTime: '12:00' };
    expect(clampDayWindow(w, w, 'startTime', cfg)).toEqual(w);
  });

  it('slides the end forward when a new start would pass the end (preserving duration)', () => {
    const prev = { startTime: '08:00', endTime: '12:00' }; // 4h
    const next = { startTime: '13:00', endTime: '12:00' }; // user set start to 1 PM
    expect(clampDayWindow(next, prev, 'startTime', cfg)).toEqual({ startTime: '13:00', endTime: '17:00' });
  });

  it('pulls the start back when a new end would precede the start (preserving duration)', () => {
    const prev = { startTime: '13:00', endTime: '17:00' }; // 4h
    const next = { startTime: '13:00', endTime: '12:00' }; // user set end to 12 PM
    expect(clampDayWindow(next, prev, 'endTime', cfg)).toEqual({ startTime: '08:00', endTime: '12:00' });
  });

  it('caps within the workday when the preserved duration would overflow', () => {
    const prev = { startTime: '08:00', endTime: '16:00' }; // 8h
    const next = { startTime: '15:00', endTime: '12:00' }; // start to 3 PM (inverts) -> 8h won't fit before 17:00
    expect(clampDayWindow(next, prev, 'startTime', cfg)).toEqual({ startTime: '09:00', endTime: '17:00' });
  });
});

describe('workingDayKeys', () => {
  // Jun 5 2026 = Fri, Jun 6 = Sat, Jun 7 = Sun, Jun 8 = Mon.
  it('drops weekend days when they are non-working', () => {
    const keys = workingDayKeys('2026-06-05T08:00:00', '2026-06-08T17:00:00', [0, 6]);
    expect(keys).toEqual(['2026-06-05', '2026-06-08']);
  });

  it('keeps every day when no weekdays are non-working', () => {
    const keys = workingDayKeys('2026-06-05T08:00:00', '2026-06-08T17:00:00', []);
    expect(keys).toEqual(['2026-06-05', '2026-06-06', '2026-06-07', '2026-06-08']);
  });

  it('falls back to the full span when every day is non-working (never empty)', () => {
    // Sat–Sun range with both marked non-working.
    const keys = workingDayKeys('2026-06-06T08:00:00', '2026-06-07T17:00:00', [0, 6]);
    expect(keys).toEqual(['2026-06-06', '2026-06-07']);
  });
});

const cfg = configFromSettings(undefined, true);
const j = (over: Partial<Job>): Job => ({
  id: 'j1', jobNumber: 'J-1', name: 'Job 1', stage: 'Scheduled',
  startDate: '2026-06-02T08:00:00', endDate: '2026-06-02T17:00:00', ...over,
} as Job);

describe('moveJobToSlot', () => {
  it('reanchors a job to the given slot and preserves the old dates', () => {
    const c = moveJobToSlot([j({})], 'j1', '2026-06-04T08:00:00', '2026-06-04T17:00:00');
    expect(c.oldStart).toBe('2026-06-02T08:00:00');
    expect(c.newStart).toBe('2026-06-04T08:00:00');
  });
});

describe('shiftJobsFromPoint', () => {
  it('marks locked jobs as skipped and shifts the rest forward', () => {
    const jobs = [j({}), j({ id: 'j2', jobNumber: 'J-2', is_locked: true })];
    const changes = shiftJobsFromPoint(jobs, '2026-06-02T00:00', 1, 'days', cfg);
    const locked = changes.find(c => c.jobId === 'j2');
    expect(locked?.skipped).toBe('locked');
    const moved = changes.find(c => c.jobId === 'j1');
    expect(moved?.skipped).toBeUndefined();
    expect(moved?.newStart).not.toBe(moved?.oldStart);
  });

  it('leaves jobs starting after the until-date in place as after-limit', () => {
    const jobs = [
      j({}), // j1 starts Jun 2
      j({ id: 'j2', jobNumber: 'J-2', startDate: '2026-06-04T08:00:00', endDate: '2026-06-04T17:00:00' }),
      j({ id: 'j3', jobNumber: 'J-3', startDate: '2026-06-10T08:00:00', endDate: '2026-06-10T17:00:00' }),
    ];
    const changes = shiftJobsFromPoint(jobs, '2026-06-02T00:00', 1, 'days', cfg, undefined, '2026-06-05');
    // Within [start point .. Jun 5] moves; after Jun 5 is held.
    expect(changes.find(c => c.jobId === 'j2')?.skipped).toBeUndefined();
    expect(changes.find(c => c.jobId === 'j3')?.skipped).toBe('after-limit');
  });

  it('shifts every eligible job when the until-date is blank', () => {
    const jobs = [j({}), j({ id: 'j3', jobNumber: 'J-3', startDate: '2026-06-10T08:00:00', endDate: '2026-06-10T17:00:00' })];
    const changes = shiftJobsFromPoint(jobs, '2026-06-02T00:00', 1, 'days', cfg, undefined, '');
    expect(changes.every(c => c.skipped !== 'after-limit')).toBe(true);
  });
});

import { spannedDayKeys, applyDailyHours } from './scheduleEngine';
import type { ProposedChange } from './scheduleEngine';

describe('spannedDayKeys', () => {
  it('returns one key for a single-day job', () => {
    expect(spannedDayKeys('2026-06-02T08:00:00', '2026-06-02T17:00:00')).toEqual(['2026-06-02']);
  });
  it('returns each calendar day for a multi-day job (inclusive)', () => {
    expect(spannedDayKeys('2026-06-02T08:00:00', '2026-06-04T17:00:00')).toEqual(['2026-06-02','2026-06-03','2026-06-04']);
  });
  it('falls back to the start day when end is null', () => {
    expect(spannedDayKeys('2026-06-02T08:00:00', null)).toEqual(['2026-06-02']);
  });
});

import { applyChangeToJob } from './scheduleEngine';

describe('applyChangeToJob', () => {
  const job = {
    id: 'a', jobNumber: 'J1', name: 'Exterior Repaint', stage: 'Scheduled',
    startDate: '2026-06-23T08:00:00', endDate: '2026-06-23T12:00:00',
    dailyHours: { '2026-06-23': { startTime: '08:00', endTime: '12:00' } },
  } as unknown as Job;

  it('persists the re-flowed per-day windows so a stale same-day override is replaced', () => {
    // Reschedule 8am–12pm -> 8am–5pm on the same day. The day view reads the per-day
    // window from dailyHours, so committing dates alone would leave it showing 12pm.
    const change: ProposedChange = {
      jobId: 'a', jobName: 'Exterior Repaint', jobNumber: 'J1',
      oldStart: '2026-06-23T08:00:00', oldEnd: '2026-06-23T12:00:00',
      newStart: '2026-06-23T08:00:00', newEnd: '2026-06-23T17:00:00',
      dailyHours: { '2026-06-23': { startTime: '08:00', endTime: '17:00' } },
    };
    const out = applyChangeToJob(job, change);
    expect(out.startDate).toBe('2026-06-23T08:00:00');
    expect(out.endDate).toBe('2026-06-23T17:00:00');
    expect(out.dailyHours!['2026-06-23']).toEqual({ startTime: '08:00', endTime: '17:00' });
  });

  it('keeps existing dailyHours for days the change does not touch', () => {
    const change: ProposedChange = {
      jobId: 'a', jobName: 'Exterior Repaint', jobNumber: 'J1',
      oldStart: '2026-06-23T08:00:00', oldEnd: '2026-06-23T12:00:00',
      newStart: '2026-06-24T08:00:00', newEnd: '2026-06-24T17:00:00',
      dailyHours: { '2026-06-24': { startTime: '08:00', endTime: '17:00' } },
    };
    const out = applyChangeToJob(job, change);
    expect(out.dailyHours!['2026-06-23']).toEqual({ startTime: '08:00', endTime: '12:00' });
    expect(out.dailyHours!['2026-06-24']).toEqual({ startTime: '08:00', endTime: '17:00' });
  });

  it('moves dates without touching dailyHours when the change carries none', () => {
    const change: ProposedChange = {
      jobId: 'a', jobName: 'Exterior Repaint', jobNumber: 'J1',
      oldStart: '2026-06-23T08:00:00', oldEnd: '2026-06-23T12:00:00',
      newStart: '2026-06-25T08:00:00', newEnd: '2026-06-25T12:00:00',
    };
    const out = applyChangeToJob(job, change);
    expect(out.startDate).toBe('2026-06-25T08:00:00');
    expect(out.dailyHours).toBe(job.dailyHours);
  });

  it('leaves the job untouched for a skipped change', () => {
    const change = {
      jobId: 'a', jobName: 'x', jobNumber: 'J1', oldStart: null, oldEnd: null,
      newStart: '', newEnd: '', skipped: 'locked',
    } as ProposedChange;
    expect(applyChangeToJob(job, change)).toBe(job);
  });
});

describe('shiftCrewScope', () => {
  const job = { id: 'j1', allocations: [
    { id: 's1', memberIds: ['m1', 'm2'] },
    { id: 's2', memberIds: ['m3'] },
  ]} as unknown as Job;

  it('returns only the named shift members', () => {
    expect(shiftCrewScope(job, 's1').sort()).toEqual(['m1', 'm2']);
  });
  it('falls back to the union of all crew when shiftId is undefined', () => {
    expect(shiftCrewScope(job, undefined).sort()).toEqual(['m1', 'm2', 'm3']);
  });
  it('returns empty for an unknown shift id', () => {
    expect(shiftCrewScope(job, 'nope')).toEqual([]);
  });
});

describe('applyChangeToJob (shift move)', () => {
  const job = {
    id: 'j1', name: 'J', jobNumber: '1', stage: 'Scheduled',
    startDate: '2026-07-06T08:00:00', endDate: '2026-07-08T17:00:00',
    allocations: [
      { id: 's1', name: 'Prep', memberIds: ['m1'], startDate: '2026-07-06', endDate: '2026-07-06', startTime: '08:00', endTime: '12:00' },
      { id: 's2', name: 'Finish', memberIds: ['m2'], startDate: '2026-07-08', endDate: '2026-07-08', startTime: '13:00', endTime: '17:00' },
    ],
  } as unknown as Job;

  it('moves only the named shift and leaves the others put', () => {
    const change: ProposedChange = {
      jobId: 'j1', jobName: 'J', jobNumber: '1', shiftId: 's1',
      oldStart: '2026-07-06T08:00:00', oldEnd: '2026-07-06T12:00:00',
      newStart: '2026-07-09T08:00:00', newEnd: '2026-07-09T12:00:00',
    };
    const out = applyChangeToJob(job, change);
    expect(out.allocations!.find(a => a.id === 's1')!.startDate).toBe('2026-07-09');
    expect(out.allocations!.find(a => a.id === 's2')!.startDate).toBe('2026-07-08');
    // envelope now spans the un-moved s2 (Jul 8) as its start, s1 (Jul 9) as its end
    expect(out.startDate).toBe('2026-07-08T13:00:00');
    expect(out.endDate).toBe('2026-07-09T12:00:00');
  });

  it('without shiftId still moves the whole job (unchanged behavior)', () => {
    const change: ProposedChange = {
      jobId: 'j1', jobName: 'J', jobNumber: '1',
      oldStart: '2026-07-06T08:00:00', oldEnd: '2026-07-08T17:00:00',
      newStart: '2026-07-10T08:00:00', newEnd: '2026-07-12T17:00:00',
    };
    const out = applyChangeToJob(job, change);
    expect(out.startDate).toBe('2026-07-10T08:00:00');
    expect(out.endDate).toBe('2026-07-12T17:00:00');
  });
});

describe('applyDailyHours', () => {
  const change: ProposedChange = {
    jobId: 'a', jobName: 'Job', jobNumber: 'J1',
    oldStart: '2026-06-02T08:00:00', oldEnd: '2026-06-04T17:00:00',
    newStart: '2026-06-02T08:00:00', newEnd: '2026-06-04T17:00:00',
  };
  it('sets newStart/newEnd from the first and last day hours', () => {
    const out = applyDailyHours(change, {
      '2026-06-02': { startTime: '09:30', endTime: '17:00' },
      '2026-06-03': { startTime: '08:00', endTime: '17:00' },
      '2026-06-04': { startTime: '08:00', endTime: '15:45' },
    });
    expect(out.newStart).toBe('2026-06-02T09:30:00');
    expect(out.newEnd).toBe('2026-06-04T15:45:00');
  });
  it('is a no-op when no hours are provided', () => {
    expect(applyDailyHours(change, {})).toEqual(change);
  });
});

import { cascadeFromEdit, cascadeLeapfrogIds, toLocalDateKey } from './scheduleEngine';

describe('cascadeFromEdit', () => {
  // Primary j1 originally Jun 2; followers j2 (Jun 4) and j3 (Jun 9). cfg skips weekends.
  const jobs = [
    j({}),
    j({ id: 'j2', jobNumber: 'J-2', name: 'Job 2', startDate: '2026-06-04T08:00:00', endDate: '2026-06-04T17:00:00' }),
    j({ id: 'j3', jobNumber: 'J-3', name: 'Job 3', startDate: '2026-06-09T08:00:00', endDate: '2026-06-09T17:00:00' }),
  ];
  const primaryMovedTwoDays: ProposedChange = {
    jobId: 'j1', jobName: 'Job 1', jobNumber: 'J-1',
    oldStart: '2026-06-02T08:00:00', oldEnd: '2026-06-02T17:00:00',
    newStart: '2026-06-04T08:00:00', newEnd: '2026-06-04T17:00:00',
  };

  it('shifts every later job by the same calendar delta as the primary start', () => {
    const changes = cascadeFromEdit(jobs, primaryMovedTwoDays, cfg);
    // primary kept verbatim as the first row
    expect(changes[0]).toEqual(primaryMovedTwoDays);
    const j2 = changes.find(c => c.jobId === 'j2');
    const j3 = changes.find(c => c.jobId === 'j3');
    // +2 calendar days each, NOT weekend-skipped (Jun 6 is a Saturday).
    expect(toLocalDateKey(new Date(j2!.newStart))).toBe('2026-06-06');
    expect(toLocalDateKey(new Date(j3!.newStart))).toBe('2026-06-11');
  });

  it('returns only the primary change when the start did not move', () => {
    const noMove = { ...primaryMovedTwoDays, newStart: '2026-06-02T08:00:00', newEnd: '2026-06-02T17:00:00' };
    expect(cascadeFromEdit(jobs, noMove, cfg)).toEqual([noMove]);
  });

  it('leaves locked and earlier jobs out of the follower set', () => {
    const withLockedAndEarlier = [
      ...jobs,
      j({ id: 'j4', jobNumber: 'J-4', name: 'Locked', startDate: '2026-06-10T08:00:00', endDate: '2026-06-10T17:00:00', is_locked: true }),
      j({ id: 'j5', jobNumber: 'J-5', name: 'Earlier', startDate: '2026-05-30T08:00:00', endDate: '2026-05-30T17:00:00' }),
    ];
    const changes = cascadeFromEdit(withLockedAndEarlier, primaryMovedTwoDays, cfg);
    const ids = changes.map(c => c.jobId);
    expect(ids).not.toContain('j4'); // locked -> skipped -> excluded
    expect(ids).not.toContain('j5'); // before the primary -> excluded
    expect(ids).toEqual(expect.arrayContaining(['j1', 'j2', 'j3']));
  });
});

describe('cascadeFromEdit with end-date limit', () => {
  // primary j1 Jun 2 -> Jun 4 (+2 calendar days). followers j2 (Jun 4), j3 (Jun 9). cfg skips weekends.
  const jobs = [
    j({}),
    j({ id: 'j2', jobNumber: 'J-2', name: 'Job 2', startDate: '2026-06-04T08:00:00', endDate: '2026-06-04T17:00:00' }),
    j({ id: 'j3', jobNumber: 'J-3', name: 'Job 3', startDate: '2026-06-09T08:00:00', endDate: '2026-06-09T17:00:00' }),
  ];
  const primaryMovedTwoDays: ProposedChange = {
    jobId: 'j1', jobName: 'Job 1', jobNumber: 'J-1',
    oldStart: '2026-06-02T08:00:00', oldEnd: '2026-06-02T17:00:00',
    newStart: '2026-06-04T08:00:00', newEnd: '2026-06-04T17:00:00',
  };

  it('protects followers whose ORIGINAL start is after the cutoff', () => {
    const changes = cascadeFromEdit(jobs, primaryMovedTwoDays, cfg, '2026-06-05');
    const j2 = changes.find(c => c.jobId === 'j2'); // Jun 4 <= cutoff -> moves
    const j3 = changes.find(c => c.jobId === 'j3'); // Jun 9 > cutoff -> protected
    expect(j2?.skipped).toBeUndefined();
    expect(toLocalDateKey(new Date(j2!.newStart))).toBe('2026-06-06');
    expect(j3?.skipped).toBe('after-limit');
    expect(j3?.newStart).toBe('2026-06-09T08:00:00'); // unchanged
    expect(j3?.newEnd).toBe('2026-06-09T17:00:00');
  });

  it('moves a follower scheduled exactly ON the cutoff date', () => {
    const changes = cascadeFromEdit(jobs, primaryMovedTwoDays, cfg, '2026-06-09');
    const j3 = changes.find(c => c.jobId === 'j3'); // Jun 9 == cutoff -> moves
    expect(j3?.skipped).toBeUndefined();
    expect(toLocalDateKey(new Date(j3!.newStart))).toBe('2026-06-11');
  });

  it('behaves exactly like no-limit when untilDate is empty', () => {
    expect(cascadeFromEdit(jobs, primaryMovedTwoDays, cfg, '')).toEqual(
      cascadeFromEdit(jobs, primaryMovedTwoDays, cfg),
    );
  });
});

describe('cascadeLeapfrogIds', () => {
  const pc = (over: Partial<ProposedChange>): ProposedChange => ({
    jobId: 'x', jobName: 'X', jobNumber: 'X-1',
    oldStart: '2026-06-01T08:00:00', oldEnd: '2026-06-01T17:00:00',
    newStart: '2026-06-01T08:00:00', newEnd: '2026-06-01T17:00:00', ...over,
  });

  it('flags moved followers that land on/after a protected job', () => {
    const changes = [
      pc({ jobId: 'j1', newStart: '2026-06-04T08:00:00' }),                       // primary (excluded)
      pc({ jobId: 'j2', newStart: '2026-06-06T08:00:00' }),                       // moved, lands after Jun 5 -> flagged
      pc({ jobId: 'j3', newStart: '2026-06-05T08:00:00', skipped: 'after-limit' }), // protected at Jun 5
    ];
    expect(cascadeLeapfrogIds(changes, 'j1')).toEqual(['j2']);
  });

  it('does not flag a moved follower that stays before every protected job', () => {
    const changes = [
      pc({ jobId: 'j1', newStart: '2026-06-04T08:00:00' }),
      pc({ jobId: 'j2', newStart: '2026-06-04T08:00:00' }),                       // before Jun 9
      pc({ jobId: 'j3', newStart: '2026-06-09T08:00:00', skipped: 'after-limit' }),
    ];
    expect(cascadeLeapfrogIds(changes, 'j1')).toEqual([]);
  });

  it('returns [] when nothing is protected', () => {
    const changes = [
      pc({ jobId: 'j1', newStart: '2026-06-04T08:00:00' }),
      pc({ jobId: 'j2', newStart: '2026-06-06T08:00:00' }),
    ];
    expect(cascadeLeapfrogIds(changes, 'j1')).toEqual([]);
  });
});

describe('scheduledWindowHours', () => {
  const cfgWk = configFromSettings(undefined, true); // workday 8–17 = 9h, weekends [0,6]

  it('uses the standard workday length per spanned working day when no dailyHours', () => {
    // Jun 2 (Tue) – Jun 3 (Wed) = 2 working days × 9h.
    expect(scheduledWindowHours(j({ endDate: '2026-06-03T17:00:00' }), cfgWk)).toBe(18);
  });

  it('sums per-day windows when dailyHours is present', () => {
    const job = j({
      endDate: '2026-06-03T17:00:00',
      dailyHours: {
        '2026-06-02': { startTime: '08:00', endTime: '16:00' }, // 8h
        '2026-06-03': { startTime: '08:00', endTime: '11:00' }, // 3h
      },
    });
    expect(scheduledWindowHours(job, cfgWk)).toBe(11);
  });

  it('returns 0 for an unscheduled job', () => {
    expect(scheduledWindowHours(j({ startDate: undefined, endDate: undefined }), cfgWk)).toBe(0);
  });
});

describe('reflowFromStart', () => {
  // Workday 8–16 = 8h/day, weekends [0,6]. Jun 2 = Tue.
  const cfg8 = { skipNonWorkingDays: true, weekendDays: [0, 6], holidays: [], workDayStartHour: 8, workDayEndHour: 16 };

  it('keeps a job within one day when it fits', () => {
    const r = reflowFromStart('2026-06-02T08:00:00', 6, cfg8);
    expect(r.newStart).toBe('2026-06-02T08:00:00');
    expect(r.newEnd).toBe('2026-06-02T14:00:00');
    expect(r.dailyHours).toEqual({ '2026-06-02': { startTime: '08:00', endTime: '14:00' } });
  });

  it('spills overflow into the next working day, second day at workday start', () => {
    // 16h from Tue 12pm: Tue 12–16 (4h), Wed 8–16 (8h), Thu 8–12 (4h).
    const r = reflowFromStart('2026-06-02T12:00:00', 16, cfg8);
    expect(r.dailyHours).toEqual({
      '2026-06-02': { startTime: '12:00', endTime: '16:00' },
      '2026-06-03': { startTime: '08:00', endTime: '16:00' },
      '2026-06-04': { startTime: '08:00', endTime: '12:00' },
    });
    expect(r.newStart).toBe('2026-06-02T12:00:00');
    expect(r.newEnd).toBe('2026-06-04T12:00:00');
  });

  it('skips weekends when spilling', () => {
    // Jun 5 = Fri. 12h from Fri 12pm: Fri 12–16 (4h), Mon 8–16 (8h).
    const r = reflowFromStart('2026-06-05T12:00:00', 12, cfg8);
    expect(Object.keys(r.dailyHours)).toEqual(['2026-06-05', '2026-06-08']);
    expect(r.newEnd).toBe('2026-06-08T16:00:00');
  });

  it('clamps a start before the workday to the workday start', () => {
    const r = reflowFromStart('2026-06-02T06:00:00', 4, cfg8);
    expect(r.newStart).toBe('2026-06-02T08:00:00');
    expect(r.newEnd).toBe('2026-06-02T12:00:00');
  });
});

describe('timeShiftChange', () => {
  const cfg8 = { skipNonWorkingDays: true, weekendDays: [0, 6], holidays: [], workDayStartHour: 8, workDayEndHour: 16 };
  const job = { id: 'j1', jobNumber: 'J-1', name: 'Repaint', stage: 'Scheduled',
    startDate: '2026-06-02T08:00:00', endDate: '2026-06-02T16:00:00' } as Job;

  it('preserves duration and spills the end into the next day', () => {
    // 8h job pushed to 12pm: Tue 12–16 (4h) + Wed 8–12 (4h).
    const c = timeShiftChange(job, '2026-06-02T12:00:00', cfg8);
    expect(c.jobId).toBe('j1');
    expect(c.oldStart).toBe('2026-06-02T08:00:00');
    expect(c.newStart).toBe('2026-06-02T12:00:00');
    expect(c.newEnd).toBe('2026-06-03T12:00:00');
    expect(c.skipped).toBeUndefined();
  });

  it('carries the re-flowed per-day windows', () => {
    const c = timeShiftChange(job, '2026-06-02T12:00:00', cfg8);
    expect(c.dailyHours).toEqual({
      '2026-06-02': { startTime: '12:00', endTime: '16:00' },
      '2026-06-03': { startTime: '08:00', endTime: '12:00' },
    });
  });
});

describe('allocDayWindow', () => {
  const base = { id: 'a', name: 'Prep', memberIds: ['m1'],
    startDate: '2026-06-08', endDate: '2026-06-10', startTime: '08:00', endTime: '12:00' };

  it('returns the shift default window when the day has no override', () => {
    expect(allocDayWindow(base, '2026-06-08')).toEqual({ startTime: '08:00', endTime: '12:00' });
  });

  it('returns the per-day override when present', () => {
    const alloc = { ...base, dailyHours: { '2026-06-09': { startTime: '13:00', endTime: '17:00' } } };
    expect(allocDayWindow(alloc, '2026-06-09')).toEqual({ startTime: '13:00', endTime: '17:00' });
  });
});

describe('recomputeJobEnvelope', () => {
  it('spans earliest shift start to latest shift end with shift window times', () => {
    const j = {
      id: 'j1', jobNumber: 'J-1', name: 'Ext', stage: 'Scheduled',
      startDate: '2026-06-08T00:00:00', endDate: '2026-06-08T00:00:00',
      allocations: [
        { id: 'a', name: 'Prep', memberIds: ['m1'], startDate: '2026-06-08', endDate: '2026-06-09', startTime: '08:00', endTime: '12:00' },
        { id: 'b', name: 'Finish', memberIds: ['m2'], startDate: '2026-06-10', endDate: '2026-06-11', startTime: '13:00', endTime: '17:00' },
      ],
    } as unknown as Job;
    const out = recomputeJobEnvelope(j);
    expect(out.startDate).toBe('2026-06-08T08:00:00');
    expect(out.endDate).toBe('2026-06-11T17:00:00');
  });

  it('returns the job unchanged when there are no allocations', () => {
    const j = { id: 'j2', jobNumber: 'J-2', name: 'x', stage: 'Scheduled',
      startDate: '2026-06-08T08:00:00', endDate: '2026-06-08T17:00:00' } as unknown as Job;
    expect(recomputeJobEnvelope(j)).toEqual(j);
  });
});

describe('initialScheduleChange', () => {
  const cfg8 = { skipNonWorkingDays: true, weekendDays: [0, 6], holidays: [], workDayStartHour: 8, workDayEndHour: 16 };

  it('stages a no-op at the current dates for a scheduled job', () => {
    const job = { id: 'j1', jobNumber: 'J-1', name: 'Repaint', stage: 'Scheduled',
      startDate: '2026-06-02T08:00:00', endDate: '2026-06-03T16:00:00' } as Job;
    const c = initialScheduleChange(job, new Date('2026-07-06T00:00:00'), cfg8);
    expect(c.oldStart).toBe('2026-06-02T08:00:00');
    expect(c.oldEnd).toBe('2026-06-03T16:00:00');
    expect(c.newStart).toBe('2026-06-02T08:00:00');
    expect(c.newEnd).toBe('2026-06-03T16:00:00');
  });

  it('seeds an unscheduled job onto the seed day as a one-workday span', () => {
    const job = { id: 'j2', jobNumber: 'J-2', name: 'Garage', stage: 'Unscheduled',
      startDate: undefined, endDate: undefined } as unknown as Job;
    // Mon 2026-07-06 is a working day.
    const c = initialScheduleChange(job, new Date('2026-07-06T00:00:00'), cfg8);
    expect(c.oldStart).toBeNull();
    expect(c.oldEnd).toBeNull();
    expect(c.newStart).toBe('2026-07-06T08:00:00');
    expect(c.newEnd).toBe('2026-07-06T16:00:00');
  });

  it('normalizes a weekend seed to the next working day', () => {
    const job = { id: 'j3', jobNumber: 'J-3', name: 'Fence', stage: 'Unscheduled',
      startDate: undefined, endDate: undefined } as unknown as Job;
    // Sun 2026-07-05 -> next working day Mon 2026-07-06.
    const c = initialScheduleChange(job, new Date('2026-07-05T00:00:00'), cfg8);
    expect(c.newStart).toBe('2026-07-06T08:00:00');
    expect(c.newEnd).toBe('2026-07-06T16:00:00');
  });
});

describe('cascadeFromEdit scope', () => {
  const cfg = configFromSettings(undefined, true);
  const mk = (over: Partial<Job>): Job => ({
    id: 'x', jobNumber: 'X', name: 'X', stage: 'Scheduled',
    startDate: '2026-06-02T08:00:00', endDate: '2026-06-02T17:00:00', ...over,
  } as Job);

  it('only moves followers within the crew scope', () => {
    const primary = mk({ id: 'p', crewMemberIds: ['m1'] });
    const jobs = [
      primary,
      mk({ id: 'shared', crewMemberIds: ['m1'], startDate: '2026-06-04T08:00:00', endDate: '2026-06-04T17:00:00' }),
      mk({ id: 'other', crewMemberIds: ['m9'], startDate: '2026-06-04T08:00:00', endDate: '2026-06-04T17:00:00' }),
    ];
    const primaryChange = { jobId: 'p', jobName: 'P', jobNumber: 'P', oldStart: primary.startDate!, oldEnd: primary.endDate!, newStart: '2026-06-03T08:00:00', newEnd: '2026-06-03T17:00:00' } as any;
    const changes = cascadeFromEdit(jobs, primaryChange, cfg, undefined, { crewMemberIds: ['m1'] });
    const moved = changes.filter(c => !c.skipped).map(c => c.jobId);
    expect(moved).toContain('shared');
    expect(moved).not.toContain('other');
  });

  it('moves no followers when the scope has no members', () => {
    const primary = mk({ id: 'p', crewMemberIds: [] });
    const jobs = [primary, mk({ id: 'f', startDate: '2026-06-04T08:00:00', endDate: '2026-06-04T17:00:00' })];
    const primaryChange = { jobId: 'p', jobName: 'P', jobNumber: 'P', oldStart: primary.startDate!, oldEnd: primary.endDate!, newStart: '2026-06-03T08:00:00', newEnd: '2026-06-03T17:00:00' } as any;
    const changes = cascadeFromEdit(jobs, primaryChange, cfg, undefined, { crewMemberIds: [] });
    expect(changes.map(c => c.jobId)).toEqual(['p']);
  });
});

describe('cascadeFromTimeShift', () => {
  const cfg8 = { skipNonWorkingDays: true, weekendDays: [0, 6], holidays: [], workDayStartHour: 8, workDayEndHour: 16 };
  const mk = (over: Partial<Job>): Job => ({
    id: 'x', jobNumber: 'X', name: 'X', stage: 'Scheduled',
    startDate: '2026-06-02T08:00:00', endDate: '2026-06-02T16:00:00', ...over,
  } as Job);

  it('pushes shared-crew followers by the end-date extension', () => {
    // primary spilled from ending Jun 2 to ending Jun 3 (+1 day).
    const primaryChange = {
      jobId: 'p', jobName: 'P', jobNumber: 'P',
      oldStart: '2026-06-02T08:00:00', oldEnd: '2026-06-02T16:00:00',
      newStart: '2026-06-02T12:00:00', newEnd: '2026-06-03T12:00:00',
    } as any;
    const jobs = [
      mk({ id: 'p', crewMemberIds: ['m1'] }),
      mk({ id: 'follow', crewMemberIds: ['m1'], startDate: '2026-06-03T08:00:00', endDate: '2026-06-03T16:00:00' }),
      mk({ id: 'other', crewMemberIds: ['m9'], startDate: '2026-06-03T08:00:00', endDate: '2026-06-03T16:00:00' }),
    ];
    const changes = cascadeFromTimeShift(jobs, primaryChange, cfg8, { crewMemberIds: ['m1'] });
    const follow = changes.find(c => c.jobId === 'follow');
    expect(follow?.skipped).toBeUndefined();
    expect(toLocalDateKey(new Date(follow!.newStart))).toBe('2026-06-04'); // +1 day
    // Different-crew job is not moved.
    expect(changes.find(c => c.jobId === 'other')?.skipped ?? 'absent').not.toBe(undefined);
  });

  it('returns only the primary when the end did not move', () => {
    const primaryChange = {
      jobId: 'p', jobName: 'P', jobNumber: 'P',
      oldStart: '2026-06-02T08:00:00', oldEnd: '2026-06-02T16:00:00',
      newStart: '2026-06-02T10:00:00', newEnd: '2026-06-02T16:00:00',
    } as any;
    const jobs = [mk({ id: 'p', crewMemberIds: ['m1'] })];
    expect(cascadeFromTimeShift(jobs, primaryChange, cfg8, { crewMemberIds: ['m1'] })).toEqual([primaryChange]);
  });
});

describe('cascadeForPrimary', () => {
  const cfg8 = { skipNonWorkingDays: true, weekendDays: [0, 6], holidays: [], workDayStartHour: 8, workDayEndHour: 16 };
  const mk = (over: Partial<Job>): Job => ({
    id: 'x', jobNumber: 'X', name: 'X', stage: 'Scheduled',
    startDate: '2026-06-02T08:00:00', endDate: '2026-06-02T16:00:00', ...over,
  } as Job);

  it('cascades a same-day time shift by the end-date extension', () => {
    // start DAY unchanged (Jun 2), end spilled Jun 2 -> Jun 3.
    const primary = {
      jobId: 'p', jobName: 'P', jobNumber: 'P',
      oldStart: '2026-06-02T08:00:00', oldEnd: '2026-06-02T16:00:00',
      newStart: '2026-06-02T12:00:00', newEnd: '2026-06-03T12:00:00',
    } as any;
    const jobs = [
      mk({ id: 'p', crewMemberIds: ['m1'] }),
      mk({ id: 'follow', crewMemberIds: ['m1'], startDate: '2026-06-03T08:00:00', endDate: '2026-06-03T16:00:00' }),
    ];
    const changes = cascadeForPrimary(jobs, primary, cfg8, { crewMemberIds: ['m1'] });
    expect(changes.some(c => c.jobId === 'follow' && !c.skipped)).toBe(true);
  });

  it('cascades a moved start day by the day delta', () => {
    const primary = {
      jobId: 'p', jobName: 'P', jobNumber: 'P',
      oldStart: '2026-06-02T08:00:00', oldEnd: '2026-06-02T16:00:00',
      newStart: '2026-06-04T08:00:00', newEnd: '2026-06-04T16:00:00',
    } as any;
    const jobs = [
      mk({ id: 'p', crewMemberIds: ['m1'] }),
      mk({ id: 'follow', crewMemberIds: ['m1'], startDate: '2026-06-05T08:00:00', endDate: '2026-06-05T16:00:00' }),
    ];
    const changes = cascadeForPrimary(jobs, primary, cfg8, { crewMemberIds: ['m1'] });
    expect(changes.some(c => c.jobId === 'follow' && !c.skipped)).toBe(true);
  });
});

describe('primaryFromDailyEdits', () => {
  const cfg8 = { skipNonWorkingDays: true, weekendDays: [0, 6], holidays: [], workDayStartHour: 8, workDayEndHour: 16 };
  // Job whose startDate time-of-day (8 AM) differs from its first-day window (1 PM):
  // it works afternoons but its startDate field carries the default 8 AM.
  const job = j({
    id: 'p', jobNumber: 'P', name: 'Downtown',
    startDate: '2026-06-09T08:00:00', endDate: '2026-06-12T17:00:00',
    dailyHours: {
      '2026-06-09': { startTime: '13:00', endTime: '17:00' },
      '2026-06-10': { startTime: '13:00', endTime: '17:00' },
      '2026-06-11': { startTime: '13:00', endTime: '17:00' },
      '2026-06-12': { startTime: '13:00', endTime: '17:00' },
    },
  });
  const staged = {
    jobId: 'p', jobName: 'Downtown', jobNumber: 'P',
    oldStart: '2026-06-09T08:00:00', oldEnd: '2026-06-12T17:00:00',
    newStart: '2026-06-09T08:00:00', newEnd: '2026-06-12T17:00:00',
  } as ProposedChange;
  // The editor seeds the daily-hours map from the job's own windows. Unedited, it
  // equals the job's dailyHours — NOT the change's 8 AM start time.
  const seededHours = { ...job.dailyHours };

  it('returns the staged change unchanged when the first-day hours are unedited', () => {
    // Regression: the seeded 1 PM first-day start was compared against the change's
    // 8 AM newStart, falsely read as a time-shift, and re-flowed the whole job when
    // the user merely toggled cascade.
    const result = primaryFromDailyEdits(job, staged, seededHours, cfg8);
    expect(result.newStart).toBe(staged.newStart);
    expect(result.newEnd).toBe(staged.newEnd);
  });

  it('re-flows as a time-shift when the user actually edits the first-day start', () => {
    const edited = { ...seededHours, '2026-06-09': { startTime: '09:00', endTime: '17:00' } };
    const result = primaryFromDailyEdits(job, staged, edited, cfg8);
    expect(result.newStart).toBe('2026-06-09T09:00:00');
    expect(result.dailyHours).toBeDefined();
  });
});

describe('resolveTimeShiftCascade', () => {
  const cfg8 = { skipNonWorkingDays: true, weekendDays: [0, 6], holidays: [], workDayStartHour: 8, workDayEndHour: 16 };
  const mk = (over: Partial<Job>): Job => ({
    id: 'x', jobNumber: 'X', name: 'X', stage: 'Scheduled',
    startDate: '2026-06-02T08:00:00', endDate: '2026-06-02T16:00:00', ...over,
  } as Job);

  // A same-day start-time shift that does NOT push the end into a new day, so
  // cascadeFromTimeShift finds no followers on its own.
  const sameDayPrimary = {
    jobId: 'p', jobName: 'P', jobNumber: 'P',
    oldStart: '2026-06-02T08:00:00', oldEnd: '2026-06-02T16:00:00',
    newStart: '2026-06-02T10:00:00', newEnd: '2026-06-02T16:00:00',
  } as any;

  it('keeps cascade ON when the user already enabled it (does not silently flip it off)', () => {
    // The regression: editing the start time used to recompute the toggle from
    // cascadeFromTimeShift, turning cascade OFF here and dropping the followers.
    const jobs = [mk({ id: 'p', crewMemberIds: ['m1'] })];
    const res = resolveTimeShiftCascade(jobs, sameDayPrimary, cfg8, { crewMemberIds: ['m1'] }, true);
    expect(res.cascadeOn).toBe(true);
  });

  it('runs the full cascade (matching the toggle) when cascade is already ON', () => {
    const primary = {
      jobId: 'p', jobName: 'P', jobNumber: 'P',
      oldStart: '2026-06-02T08:00:00', oldEnd: '2026-06-02T16:00:00',
      newStart: '2026-06-02T12:00:00', newEnd: '2026-06-03T12:00:00',
    } as any;
    const jobs = [
      mk({ id: 'p', crewMemberIds: ['m1'] }),
      mk({ id: 'follow', crewMemberIds: ['m1'], startDate: '2026-06-03T08:00:00', endDate: '2026-06-03T16:00:00' }),
    ];
    const res = resolveTimeShiftCascade(jobs, primary, cfg8, { crewMemberIds: ['m1'] }, true);
    expect(res.cascadeOn).toBe(true);
    expect(res.changes.some(c => c.jobId === 'follow' && !c.skipped)).toBe(true);
  });

  it('auto-enables cascade when OFF and the time shift produces followers', () => {
    const primary = {
      jobId: 'p', jobName: 'P', jobNumber: 'P',
      oldStart: '2026-06-02T08:00:00', oldEnd: '2026-06-02T16:00:00',
      newStart: '2026-06-02T12:00:00', newEnd: '2026-06-03T12:00:00',
    } as any;
    const jobs = [
      mk({ id: 'p', crewMemberIds: ['m1'] }),
      mk({ id: 'follow', crewMemberIds: ['m1'], startDate: '2026-06-03T08:00:00', endDate: '2026-06-03T16:00:00' }),
    ];
    const res = resolveTimeShiftCascade(jobs, primary, cfg8, { crewMemberIds: ['m1'] }, false);
    expect(res.cascadeOn).toBe(true);
    expect(res.changes.some(c => c.jobId === 'follow' && !c.skipped)).toBe(true);
  });

  it('leaves cascade OFF when OFF and the shift has no followers', () => {
    const jobs = [mk({ id: 'p', crewMemberIds: ['m1'] })];
    const res = resolveTimeShiftCascade(jobs, sameDayPrimary, cfg8, { crewMemberIds: ['m1'] }, false);
    expect(res.cascadeOn).toBe(false);
    expect(res.changes).toEqual([sameDayPrimary]);
  });
});

import { jobClockWindowOnDay } from './scheduleEngine';

describe('jobClockWindowOnDay', () => {
  const cfg = { skipNonWorkingDays: true, weekendDays: [0, 6], holidays: [], workDayStartHour: 8, workDayEndHour: 17 };
  const mk = (over: Partial<Job>): Job => ({
    id: 'j', jobNumber: 'J', name: 'J', stage: 'Scheduled',
    startDate: '2026-06-09T08:00:00', endDate: '2026-06-11T17:00:00', ...over,
  } as Job);

  it('uses the per-day window when present', () => {
    const job = mk({ dailyHours: { '2026-06-09': { startTime: '13:00', endTime: '17:00' } } });
    expect(jobClockWindowOnDay(job, '2026-06-09', cfg)).toEqual({ start: 13, end: 17 });
  });

  it('clamps first day to start-time..workday-end and middle days to the full workday', () => {
    const job = mk({ startDate: '2026-06-09T10:00:00', endDate: '2026-06-11T15:00:00' });
    expect(jobClockWindowOnDay(job, '2026-06-09', cfg)).toEqual({ start: 10, end: 17 }); // first
    expect(jobClockWindowOnDay(job, '2026-06-10', cfg)).toEqual({ start: 8, end: 17 });  // middle
    expect(jobClockWindowOnDay(job, '2026-06-11', cfg)).toEqual({ start: 8, end: 15 });  // last
  });

  it('returns null for a day the job does not occupy', () => {
    expect(jobClockWindowOnDay(mk({}), '2026-06-12', cfg)).toBeNull();
  });
});

import { occupiedIntervals } from './scheduleEngine';

describe('occupiedIntervals', () => {
  const cfg = { skipNonWorkingDays: true, weekendDays: [0, 6], holidays: [], workDayStartHour: 8, workDayEndHour: 17 };
  const mk = (over: Partial<Job>): Job => ({
    id: 'j', jobNumber: 'J', name: 'J', stage: 'Scheduled',
    startDate: '2026-06-09T08:00:00', endDate: '2026-06-09T17:00:00', crewMemberIds: ['m1'], ...over,
  } as Job);

  it('merges overlapping/adjacent shared-crew windows and excludes the subject', () => {
    const jobs = [
      mk({ id: 'self', dailyHours: { '2026-06-09': { startTime: '13:00', endTime: '17:00' } } }),
      mk({ id: 'a', dailyHours: { '2026-06-09': { startTime: '08:00', endTime: '10:00' } } }),
      mk({ id: 'b', dailyHours: { '2026-06-09': { startTime: '10:00', endTime: '12:00' } } }),
    ];
    const occ = occupiedIntervals(jobs, { crewMemberIds: ['m1'] }, '2026-06-09', cfg, 'self');
    expect(occ).toEqual([{ start: 8, end: 12 }]);
  });

  it('ignores jobs out of crew scope', () => {
    const jobs = [mk({ id: 'a', crewMemberIds: ['other'], dailyHours: { '2026-06-09': { startTime: '08:00', endTime: '12:00' } } })];
    expect(occupiedIntervals(jobs, { crewMemberIds: ['m1'] }, '2026-06-09', cfg)).toEqual([]);
  });
});

import { freeIntervals } from './scheduleEngine';

describe('freeIntervals', () => {
  const cfg = { skipNonWorkingDays: true, weekendDays: [0, 6], holidays: [], workDayStartHour: 8, workDayEndHour: 17 };

  it('returns the whole workday when nothing is occupied', () => {
    expect(freeIntervals([], cfg)).toEqual([{ start: 8, end: 17 }]);
  });

  it('returns gaps around occupied blocks, clamped to the workday', () => {
    expect(freeIntervals([{ start: 8, end: 12 }], cfg)).toEqual([{ start: 12, end: 17 }]);
    expect(freeIntervals([{ start: 8, end: 10 }, { start: 13, end: 17 }], cfg)).toEqual([{ start: 10, end: 13 }]);
  });

  it('is empty when the workday is fully occupied', () => {
    expect(freeIntervals([{ start: 7, end: 18 }], cfg)).toEqual([]);
  });
});

import { placeAfterConflictFree } from './scheduleEngine';

describe('placeAfterConflictFree', () => {
  const cfg = { skipNonWorkingDays: true, weekendDays: [0, 6], holidays: [], workDayStartHour: 8, workDayEndHour: 17 };
  const mk = (over: Partial<Job>): Job => ({
    id: 'j', jobNumber: 'J', name: 'J', stage: 'Scheduled',
    startDate: '2026-06-09T08:00:00', endDate: '2026-06-09T17:00:00', crewMemberIds: ['m1'], ...over,
  } as Job);

  it('places the job on the first working day after the anchor, preserving duration', () => {
    const job = mk({ id: 'blk' });
    const change = placeAfterConflictFree(job, '2026-06-12T17:00:00', [job], { crewMemberIds: ['m1'] }, cfg, new Set());
    expect(change.jobId).toBe('blk');
    expect(toLocalDateKey(new Date(change.newStart))).toBe('2026-06-15'); // Mon after Fri Jun 12
    expect(new Date(change.newEnd).getTime() - new Date(change.newStart).getTime())
      .toBe(new Date('2026-06-09T17:00:00').getTime() - new Date('2026-06-09T08:00:00').getTime());
  });

  it('skips forward past a day already occupied by a shared-crew job', () => {
    const job = mk({ id: 'blk' });
    const occupant = mk({ id: 'occ', startDate: '2026-06-15T08:00:00', endDate: '2026-06-15T17:00:00' });
    const change = placeAfterConflictFree(job, '2026-06-12T17:00:00', [job, occupant], { crewMemberIds: ['m1'] }, cfg, new Set());
    expect(toLocalDateKey(new Date(change.newStart))).toBe('2026-06-16');
  });
});

import { reflowAvoidingConflicts } from './scheduleEngine';

describe('reflowAvoidingConflicts — Smart extension', () => {
  const cfg = { skipNonWorkingDays: true, weekendDays: [0, 6], holidays: [], workDayStartHour: 8, workDayEndHour: 17 };
  const mk = (over: Partial<Job>): Job => ({
    id: 'self', jobNumber: 'S', name: 'Self', stage: 'Scheduled', crewMemberIds: ['m1'],
    startDate: '2026-06-09T13:00:00', endDate: '2026-06-10T17:00:00',
    dailyHours: { '2026-06-09': { startTime: '13:00', endTime: '17:00' }, '2026-06-10': { startTime: '13:00', endTime: '17:00' } },
    ...over,
  } as Job);
  const scopeOf = () => ({ crewMemberIds: ['m1'] });

  it('extends a pinned day into adjacent free time before adding a new day', () => {
    // Total = 8h. User shrinks Jun 9 to 1h (16:00-17:00). Jun 10 free 12:00-13:00 (morning busy 8-12).
    const self = mk({});
    const morning = { id: 'am', jobNumber: 'A', name: 'AM', stage: 'Scheduled', crewMemberIds: ['m1'],
      startDate: '2026-06-10T08:00:00', endDate: '2026-06-10T08:00:00',
      dailyHours: { '2026-06-10': { startTime: '08:00', endTime: '12:00' } } } as unknown as Job;
    const pinned = { '2026-06-09': { startTime: '16:00', endTime: '17:00' }, '2026-06-10': { startTime: '13:00', endTime: '17:00' } };
    const { primary, displaced } = reflowAvoidingConflicts(self, pinned, [self, morning], scopeOf, cfg, {});
    // 8h total - (1h + 4h pinned) = 3h leftover; Jun 10 can extend 13:00 back to 12:00 (+1h, morning blocks earlier).
    expect(primary.dailyHours!['2026-06-10']).toEqual({ startTime: '12:00', endTime: '17:00' });
    expect(displaced).toEqual([]); // remaining 2h handled by later tasks (new days)
  });

  it('Simple mode does not extend existing days', () => {
    const self = mk({});
    const pinned = { '2026-06-09': { startTime: '16:00', endTime: '17:00' }, '2026-06-10': { startTime: '13:00', endTime: '17:00' } };
    const { primary } = reflowAvoidingConflicts(self, pinned, [self], scopeOf, cfg, { keepExistingDaysAsIs: true });
    expect(primary.dailyHours!['2026-06-10']).toEqual({ startTime: '13:00', endTime: '17:00' });
  });
});

describe('reflowAvoidingConflicts — new days + bump', () => {
  const cfg = { skipNonWorkingDays: true, weekendDays: [0, 6], holidays: [], workDayStartHour: 8, workDayEndHour: 17 };
  const scopeOf = () => ({ crewMemberIds: ['m1'] });
  const self = {
    id: 'self', jobNumber: 'S', name: 'Self', stage: 'Scheduled', crewMemberIds: ['m1'],
    startDate: '2026-06-09T13:00:00', endDate: '2026-06-12T17:00:00',
    dailyHours: {
      '2026-06-09': { startTime: '13:00', endTime: '17:00' }, '2026-06-10': { startTime: '13:00', endTime: '17:00' },
      '2026-06-11': { startTime: '13:00', endTime: '17:00' }, '2026-06-12': { startTime: '13:00', endTime: '17:00' },
    },
  } as unknown as Job;

  it('puts leftover hours on a new working day (Simple mode)', () => {
    const pinned = {
      '2026-06-09': { startTime: '16:00', endTime: '17:00' }, '2026-06-10': { startTime: '13:00', endTime: '17:00' },
      '2026-06-11': { startTime: '13:00', endTime: '17:00' }, '2026-06-12': { startTime: '13:00', endTime: '17:00' },
    };
    const { primary, displaced } = reflowAvoidingConflicts(self, pinned, [self], scopeOf, cfg, { keepExistingDaysAsIs: true });
    expect(primary.dailyHours!['2026-06-15']).toEqual({ startTime: '08:00', endTime: '11:00' });
    expect(displaced).toEqual([]);
  });

  it('bumps a shared-crew job that fully blocks the new day, then places the hours', () => {
    const blocker = {
      id: 'blk', jobNumber: 'B', name: 'Blocker', stage: 'Scheduled', crewMemberIds: ['m1'],
      startDate: '2026-06-15T08:00:00', endDate: '2026-06-15T17:00:00',
      dailyHours: { '2026-06-15': { startTime: '08:00', endTime: '17:00' } },
    } as unknown as Job;
    const pinned = {
      '2026-06-09': { startTime: '16:00', endTime: '17:00' }, '2026-06-10': { startTime: '13:00', endTime: '17:00' },
      '2026-06-11': { startTime: '13:00', endTime: '17:00' }, '2026-06-12': { startTime: '13:00', endTime: '17:00' },
    };
    const { primary, displaced } = reflowAvoidingConflicts(self, pinned, [self, blocker], scopeOf, cfg, { keepExistingDaysAsIs: true });
    expect(primary.dailyHours!['2026-06-15']).toEqual({ startTime: '08:00', endTime: '11:00' });
    expect(displaced.map((d) => d.jobId)).toEqual(['blk']);
    expect(new Date(displaced[0].newStart).getTime()).toBeGreaterThan(new Date('2026-06-15T11:00:00').getTime());
  });

  it('does not bump a blocker whose original start is after the untilDate cutoff', () => {
    const blocker = {
      id: 'blk', jobNumber: 'B', name: 'Blocker', stage: 'Scheduled', crewMemberIds: ['m1'],
      startDate: '2026-06-15T08:00:00', endDate: '2026-06-15T17:00:00',
      dailyHours: { '2026-06-15': { startTime: '08:00', endTime: '17:00' } },
    } as unknown as Job;
    const pinned = {
      '2026-06-09': { startTime: '16:00', endTime: '17:00' }, '2026-06-10': { startTime: '13:00', endTime: '17:00' },
      '2026-06-11': { startTime: '13:00', endTime: '17:00' }, '2026-06-12': { startTime: '13:00', endTime: '17:00' },
    };
    const { displaced } = reflowAvoidingConflicts(self, pinned, [self, blocker], scopeOf, cfg, { keepExistingDaysAsIs: true, untilDate: '2026-06-14' });
    expect(displaced).toEqual([]); // blocker protected; leftover lands on the next free day instead
  });
});

describe('reflowAvoidingConflicts — reported scenario', () => {
  const cfg = { skipNonWorkingDays: true, weekendDays: [0, 6], holidays: [], workDayStartHour: 8, workDayEndHour: 17 };
  const scopeOf = () => ({ crewMemberIds: ['m1'] });

  it('Jun 9 → 4 PM keeps the other afternoons and adds a new day, no morning double-book', () => {
    const self = {
      id: 'self', jobNumber: 'S', name: 'Downtown', stage: 'Scheduled', crewMemberIds: ['m1'],
      startDate: '2026-06-09T13:00:00', endDate: '2026-06-12T17:00:00',
      dailyHours: {
        '2026-06-09': { startTime: '13:00', endTime: '17:00' }, '2026-06-10': { startTime: '13:00', endTime: '17:00' },
        '2026-06-11': { startTime: '13:00', endTime: '17:00' }, '2026-06-12': { startTime: '13:00', endTime: '17:00' },
      },
    } as unknown as Job;
    // Shared-crew morning jobs Tue–Fri 8–12 so mornings are NOT free.
    const mornings = ['2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12'].map((d, i) => ({
      id: `am${i}`, jobNumber: `A${i}`, name: 'AM', stage: 'Scheduled', crewMemberIds: ['m1'],
      startDate: `${d}T08:00:00`, endDate: `${d}T12:00:00`, dailyHours: { [d]: { startTime: '08:00', endTime: '12:00' } },
    } as Job));
    const pinned = {
      '2026-06-09': { startTime: '16:00', endTime: '17:00' }, '2026-06-10': { startTime: '13:00', endTime: '17:00' },
      '2026-06-11': { startTime: '13:00', endTime: '17:00' }, '2026-06-12': { startTime: '13:00', endTime: '17:00' },
    };
    const { primary } = reflowAvoidingConflicts(self, pinned, [self, ...mornings], scopeOf, cfg, {});
    // Afternoons unchanged; mornings blocked → 3h leftover (after extending Jun 10–12 into the
    // free 12:00–13:00 hour each) lands on a new day.
    expect(primary.dailyHours!['2026-06-12'].endTime).toBe('17:00');
    expect(primary.dailyHours!['2026-06-09']).toEqual({ startTime: '16:00', endTime: '17:00' });
    // No morning double-book: every existing day's start is >= 12:00.
    for (const d of ['2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12']) {
      expect(primary.dailyHours![d].startTime >= '12:00').toBe(true);
    }
  });
});

describe('placeHoursConflictFree', () => {
  const config = { skipNonWorkingDays: true, weekendDays: [0, 6], holidays: [], workDayStartHour: 8, workDayEndHour: 17 };
  const noneBusy = () => [];

  it('keeps a pinned day and places leftover hours on the next working day (Simple)', () => {
    const out = placeHoursConflictFree(
      { '2026-07-06': { startTime: '08:00', endTime: '12:00' } }, // 4h pinned
      12,                                                          // needs 8h more
      noneBusy, config,
      { keepExistingDaysAsIs: true, fromKey: '2026-07-07' },
    );
    expect(out.dayHours['2026-07-06']).toEqual({ startTime: '08:00', endTime: '12:00' });
    expect(out.dayHours['2026-07-07']).toEqual({ startTime: '08:00', endTime: '16:00' }); // 8h
    expect(out.unplaced).toBe(0);
  });

  it('Smart mode extends the pinned day into adjacent free time before opening a new day', () => {
    const out = placeHoursConflictFree(
      { '2026-07-06': { startTime: '08:00', endTime: '12:00' } }, // 4h pinned
      7, noneBusy, config,
      { keepExistingDaysAsIs: false, fromKey: '2026-07-07' },
    );
    expect(out.dayHours['2026-07-06']).toEqual({ startTime: '08:00', endTime: '15:00' }); // extended to 7h, one day
    expect(out.dayHours['2026-07-07']).toBeUndefined();
    expect(out.unplaced).toBe(0);
  });

  it('fills a partial gap then spills the leftover to the next working day (no exhaust hook)', () => {
    const busy = (k: string) => (k === '2026-07-06' ? [{ start: 8, end: 16 }] : []); // only 16-17 free on day 1
    const out = placeHoursConflictFree(
      {}, 4, busy, config,
      { keepExistingDaysAsIs: true, fromKey: '2026-07-06' },
    );
    expect(out.dayHours['2026-07-06']).toEqual({ startTime: '16:00', endTime: '17:00' }); // 1h fits the gap
    expect(out.dayHours['2026-07-07']).toEqual({ startTime: '08:00', endTime: '11:00' }); // 3h spill forward
    expect(out.unplaced).toBe(0);
  });

  it('reports unplaced hours when every day is full and there is no exhaust hook', () => {
    const alwaysFull = () => [{ start: 8, end: 17 }]; // no free time anywhere
    const out = placeHoursConflictFree(
      {}, 4, alwaysFull, config,
      { keepExistingDaysAsIs: true, fromKey: '2026-07-06' },
    );
    expect(out.dayHours).toEqual({});
    expect(out.unplaced).toBe(4);
  });

  it('retries a day when onDayExhausted frees room', () => {
    let freed = false;
    const busy = (k: string) => (k === '2026-07-06' && !freed ? [{ start: 8, end: 17 }] : []);
    const out = placeHoursConflictFree(
      {}, 2, busy, config,
      { keepExistingDaysAsIs: true, fromKey: '2026-07-06', onDayExhausted: () => { freed = true; return true; } },
    );
    expect(out.dayHours['2026-07-06']).toEqual({ startTime: '08:00', endTime: '10:00' });
    expect(out.unplaced).toBe(0);
  });
});

describe('applyChangeToJob (shift window apply)', () => {
  const job = {
    id: 'j1', name: 'J', jobNumber: '1',
    startDate: '2026-07-06T08:00:00', endDate: '2026-07-06T12:00:00',
    allocations: [
      { id: 's1', name: 'Prep', memberIds: ['m1'], startDate: '2026-07-06', endDate: '2026-07-06', startTime: '08:00', endTime: '12:00' },
    ],
  } as unknown as Job;

  it('applies the change dailyHours as the allocation windows and re-derives its span', () => {
    const change: ProposedChange = {
      jobId: 'j1', jobName: 'J', jobNumber: '1', shiftId: 's1',
      oldStart: '2026-07-06T08:00:00', oldEnd: '2026-07-06T12:00:00',
      newStart: '2026-07-08T08:00:00', newEnd: '2026-07-09T12:00:00',
      dailyHours: {
        '2026-07-08': { startTime: '08:00', endTime: '17:00' },
        '2026-07-09': { startTime: '08:00', endTime: '12:00' },
      },
    };
    const out = applyChangeToJob(job, change);
    const a = out.allocations!.find(x => x.id === 's1')!;
    expect(a.startDate).toBe('2026-07-08');
    expect(a.endDate).toBe('2026-07-09');
    expect(a.startTime).toBe('08:00');
    expect(a.endTime).toBe('12:00');
    expect(a.dailyHours).toEqual(change.dailyHours);
    expect(out.startDate).toBe('2026-07-08T08:00:00'); // envelope recomputed
    expect(out.endDate).toBe('2026-07-09T12:00:00');
  });
});

describe('applyChangeToJob (job-level move of an allocation job)', () => {
  const job = {
    id: 'j1', name: 'J', jobNumber: '1',
    startDate: '2026-07-06T08:00:00', endDate: '2026-07-08T12:00:00',
    allocations: [
      { id: 's1', name: 'Prep', memberIds: ['m1'], startDate: '2026-07-06', endDate: '2026-07-06', startTime: '08:00', endTime: '17:00',
        dailyHours: { '2026-07-06': { startTime: '08:00', endTime: '12:00' } } },
      { id: 's2', name: 'Paint', memberIds: ['m1'], startDate: '2026-07-07', endDate: '2026-07-08', startTime: '08:00', endTime: '12:00' },
    ],
  } as unknown as Job;

  it('moves every allocation by the change day-delta and recomputes the envelope', () => {
    const change: ProposedChange = {
      jobId: 'j1', jobName: 'J', jobNumber: '1',
      oldStart: '2026-07-06T08:00:00', oldEnd: '2026-07-08T12:00:00',
      newStart: '2026-07-08T08:00:00', newEnd: '2026-07-10T12:00:00', // +2 days
    };
    const out = applyChangeToJob(job, change);
    const s1 = out.allocations!.find(a => a.id === 's1')!;
    const s2 = out.allocations!.find(a => a.id === 's2')!;
    expect(s1.startDate).toBe('2026-07-08');
    expect(s1.dailyHours).toEqual({ '2026-07-08': { startTime: '08:00', endTime: '12:00' } });
    expect(s2.startDate).toBe('2026-07-09');
    expect(s2.endDate).toBe('2026-07-10');
    expect(out.startDate).toBe('2026-07-08T08:00:00'); // envelope recomputed from shifts
    expect(out.endDate).toBe('2026-07-10T12:00:00');
  });
});

describe('allocCoversDay', () => {
  const alloc: JobCrewAllocation = {
    id: 's1', name: 'Crew', memberIds: ['m1'],
    startDate: '2026-08-19', endDate: '2026-08-21',
    startTime: '08:00', endTime: '17:00',
  };

  it('covers every day in the range when nothing is skipped', () => {
    expect(allocCoversDay(alloc, '2026-08-19')).toBe(true);
    expect(allocCoversDay(alloc, '2026-08-20')).toBe(true);
    expect(allocCoversDay(alloc, '2026-08-21')).toBe(true);
  });

  it('does not cover days outside the range', () => {
    expect(allocCoversDay(alloc, '2026-08-18')).toBe(false);
    expect(allocCoversDay(alloc, '2026-08-22')).toBe(false);
  });

  it('does not cover a skipped day', () => {
    const skipping = { ...alloc, skipDays: ['2026-08-20'] };
    expect(allocCoversDay(skipping, '2026-08-19')).toBe(true);
    expect(allocCoversDay(skipping, '2026-08-20')).toBe(false);
    expect(allocCoversDay(skipping, '2026-08-21')).toBe(true);
  });

  it('treats an empty skip list the same as none', () => {
    expect(allocCoversDay({ ...alloc, skipDays: [] }, '2026-08-20')).toBe(true);
  });

  it('does not cover anything when the shift is undated', () => {
    expect(allocCoversDay({ ...alloc, startDate: '', endDate: '' }, '2026-08-19')).toBe(false);
  });
});

describe('allocWorkedDayKeys', () => {
  const alloc: JobCrewAllocation = {
    id: 's1', name: 'Crew', memberIds: ['m1'],
    startDate: '2026-08-19', endDate: '2026-08-25', // Wed → Tue, spans a weekend
    startTime: '08:00', endTime: '17:00',
  };

  it('lists the range minus weekends', () => {
    expect(allocWorkedDayKeys(alloc, [0, 6])).toEqual([
      '2026-08-19', '2026-08-20', '2026-08-21', '2026-08-24', '2026-08-25',
    ]);
  });

  it('also drops skipped days', () => {
    const skipping = { ...alloc, skipDays: ['2026-08-20', '2026-08-24'] };
    expect(allocWorkedDayKeys(skipping, [0, 6])).toEqual([
      '2026-08-19', '2026-08-21', '2026-08-25',
    ]);
  });

  it('returns an empty list when every day is skipped (no silent fallback)', () => {
    const allSkipped = { ...alloc, skipDays: ['2026-08-19', '2026-08-20', '2026-08-21', '2026-08-24', '2026-08-25'] };
    expect(allocWorkedDayKeys(allSkipped, [0, 6])).toEqual([]);
  });

  it('returns nothing for an undated shift', () => {
    expect(allocWorkedDayKeys({ ...alloc, startDate: '', endDate: '' }, [0, 6])).toEqual([]);
  });
});

// ── Booked hours travelling with a moved job ──────────────────────────────────
// Shared by the re-key tests below and the pinned-past tests: a 3-day job with one
// member booked 8h on each day, granular (hoursAssignments set, not window-derived).
const granularJob = (): Job => ({
  id: 'j1', jobNumber: 'J-1', name: 'Deck', clientId: 'c1', estimateId: 'e1',
  address: 'x', stage: 'Scheduled', dateCreated: '2026-01-01',
  startDate: '2026-08-17T08:00:00', endDate: '2026-08-19T17:00:00',
  crewMemberIds: ['m1'],
  allocations: [{
    id: 'a1', name: 'Crew', memberIds: ['m1'],
    startDate: '2026-08-17', endDate: '2026-08-19',
    startTime: '08:00', endTime: '17:00',
    hoursAssignments: { m1: { '2026-08-17': 8, '2026-08-18': 8, '2026-08-19': 8 } },
  }],
} as unknown as Job);

const granularChange = (over: Partial<ProposedChange> = {}): ProposedChange => ({
  jobId: 'j1', jobName: 'Deck', jobNumber: 'J-1',
  oldStart: '2026-08-17T08:00:00', oldEnd: '2026-08-19T17:00:00',
  newStart: '2026-08-24T08:00:00', newEnd: '2026-08-26T17:00:00',
  ...over,
});

describe('applyChangeToJob — booked hours travel with the job', () => {
  it('re-keys hours by the delta on a job-level move', () => {
    const out = applyChangeToJob(granularJob(), granularChange());
    expect(out.allocations![0].hoursAssignments).toEqual({
      m1: { '2026-08-24': 8, '2026-08-25': 8, '2026-08-26': 8 },
    });
  });

  it('re-keys hours on a shift-scoped move', () => {
    const out = applyChangeToJob(granularJob(), granularChange({ shiftId: 'a1' }));
    expect(out.allocations![0].hoursAssignments).toEqual({
      m1: { '2026-08-24': 8, '2026-08-25': 8, '2026-08-26': 8 },
    });
  });

  it('re-keys hours on a shift move carrying explicit per-day windows', () => {
    const out = applyChangeToJob(granularJob(), granularChange({
      shiftId: 'a1',
      dailyHours: {
        '2026-08-24': { startTime: '08:00', endTime: '17:00' },
        '2026-08-25': { startTime: '08:00', endTime: '17:00' },
        '2026-08-26': { startTime: '08:00', endTime: '17:00' },
      },
    }));
    expect(out.allocations![0].hoursAssignments).toEqual({
      m1: { '2026-08-24': 8, '2026-08-25': 8, '2026-08-26': 8 },
    });
  });

  it('re-keys every member independently', () => {
    const base = granularJob();
    base.allocations![0].memberIds = ['m1', 'm2'];
    base.allocations![0].hoursAssignments = {
      m1: { '2026-08-17': 8 },
      m2: { '2026-08-18': 4, '2026-08-19': 4 },
    };
    const out = applyChangeToJob(base, granularChange());
    expect(out.allocations![0].hoursAssignments).toEqual({
      m1: { '2026-08-24': 8 },
      m2: { '2026-08-25': 4, '2026-08-26': 4 },
    });
  });

  it('leaves a job with no granular hours untouched', () => {
    const base = granularJob();
    delete base.allocations![0].hoursAssignments;
    const out = applyChangeToJob(base, granularChange());
    expect(out.allocations![0].hoursAssignments).toBeUndefined();
    expect(out.allocations![0].startDate).toBe('2026-08-24');
  });
});

// applyChangeToJobPinningPast lives in shifts.ts: it composes splitPinnedPast with
// applyChangeToJob, and shifts.ts already imports scheduleEngine.ts, so keeping the
// composition there is what stops the dependency becoming a cycle.
import { applyChangeToJobPinningPast } from './shifts';

describe('applyChangeToJobPinningPast — elapsed days stay put', () => {
  const WEEKENDS = [0, 6];

  it('keeps elapsed days and lands the remainder exactly on newStart', () => {
    // Job Mon 17 - Wed 19, today is Wed 19, pushed to Mon 24.
    // Mon/Tue are history; Wednesday's 8h must land on Aug 24 — NOT Aug 26.
    const out = applyChangeToJobPinningPast(
      granularJob(), granularChange(), { todayKey: '2026-08-19', nonWorkingWeekdays: WEEKENDS },
    );

    const pinned = out.allocations!.find(a => a.pinned)!;
    const moving = out.allocations!.find(a => !a.pinned)!;

    expect(pinned.startDate).toBe('2026-08-17');
    expect(pinned.endDate).toBe('2026-08-18');
    expect(pinned.hoursAssignments).toEqual({ m1: { '2026-08-17': 8, '2026-08-18': 8 } });

    expect(moving.startDate).toBe('2026-08-24');
    expect(moving.hoursAssignments).toEqual({ m1: { '2026-08-24': 8 } });
  });

  it('is a no-op with no todayKey, matching the unpinned behaviour exactly', () => {
    const withOpts = applyChangeToJobPinningPast(granularJob(), granularChange(), { nonWorkingWeekdays: WEEKENDS });
    const without = applyChangeToJob(granularJob(), granularChange());
    expect(withOpts).toEqual(without);
    expect(withOpts.allocations!.some(a => a.pinned)).toBe(false);
  });

  it('leaves an already-pinned shift alone on a second reschedule', () => {
    const once = applyChangeToJobPinningPast(
      granularJob(), granularChange(), { todayKey: '2026-08-19', nonWorkingWeekdays: WEEKENDS },
    );
    const twice = applyChangeToJobPinningPast(
      once,
      granularChange({ oldStart: '2026-08-24T08:00:00', newStart: '2026-08-31T08:00:00', newEnd: '2026-08-31T17:00:00' }),
      { todayKey: '2026-08-19', nonWorkingWeekdays: WEEKENDS },
    );
    const pinned = twice.allocations!.filter(a => a.pinned);
    expect(pinned).toHaveLength(1);
    expect(pinned[0].hoursAssignments).toEqual({ m1: { '2026-08-17': 8, '2026-08-18': 8 } });
    expect(twice.allocations!.find(a => !a.pinned)!.startDate).toBe('2026-08-31');
  });

  it('does not split a job whose every day is still ahead', () => {
    const out = applyChangeToJobPinningPast(
      granularJob(), granularChange(), { todayKey: '2026-08-17', nonWorkingWeekdays: WEEKENDS },
    );
    expect(out.allocations).toHaveLength(1);
    expect(out.allocations![0].pinned).toBeUndefined();
    expect(out.allocations![0].startDate).toBe('2026-08-24');
  });

  it('leaves the job untouched when every targeted day has already elapsed', () => {
    const out = applyChangeToJobPinningPast(
      granularJob(), granularChange(), { todayKey: '2026-08-20', nonWorkingWeekdays: WEEKENDS },
    );
    expect(out).toEqual(granularJob());
  });

  it('spans the job envelope across both the pinned and the moved shift', () => {
    const out = applyChangeToJobPinningPast(
      granularJob(), granularChange(), { todayKey: '2026-08-19', nonWorkingWeekdays: WEEKENDS },
    );
    expect(out.startDate!.startsWith('2026-08-17')).toBe(true);
    expect(out.endDate!.startsWith('2026-08-24')).toBe(true);
  });
});

describe('jobWorkedDayKeys', () => {
  const WEEKENDS = [0, 6];
  const base = {
    id: 'j1', jobNumber: 'J-1', name: 'Deck', clientId: 'c1', estimateId: 'e1',
    address: 'x', stage: 'Scheduled', dateCreated: '2026-01-01',
  };

  it('unions the days its shifts actually work, skipping the gap between them', () => {
    const job = {
      ...base,
      startDate: '2026-08-17T08:00:00', endDate: '2026-08-24T17:00:00',
      allocations: [
        { id: 'a1-worked', name: 'Crew', memberIds: ['m1'], pinned: true,
          startDate: '2026-08-17', endDate: '2026-08-18', startTime: '08:00', endTime: '17:00' },
        { id: 'a1', name: 'Crew', memberIds: ['m1'],
          startDate: '2026-08-24', endDate: '2026-08-24', startTime: '08:00', endTime: '17:00' },
      ],
    } as unknown as Job;
    // Aug 19, 20, 21 are inside the envelope but worked by no shift.
    expect(jobWorkedDayKeys(job, WEEKENDS)).toEqual(['2026-08-17', '2026-08-18', '2026-08-24']);
  });

  it('de-duplicates days two shifts share', () => {
    const job = {
      ...base,
      startDate: '2026-08-17T08:00:00', endDate: '2026-08-18T17:00:00',
      allocations: [
        { id: 'am', name: 'AM', memberIds: ['m1'], startDate: '2026-08-17', endDate: '2026-08-18', startTime: '08:00', endTime: '12:00' },
        { id: 'pm', name: 'PM', memberIds: ['m2'], startDate: '2026-08-17', endDate: '2026-08-18', startTime: '13:00', endTime: '17:00' },
      ],
    } as unknown as Job;
    expect(jobWorkedDayKeys(job, WEEKENDS)).toEqual(['2026-08-17', '2026-08-18']);
  });

  it('respects a shift\'s skipDays', () => {
    const job = {
      ...base,
      startDate: '2026-08-17T08:00:00', endDate: '2026-08-19T17:00:00',
      allocations: [
        { id: 'a1', name: 'Crew', memberIds: ['m1'], startDate: '2026-08-17', endDate: '2026-08-19',
          startTime: '08:00', endTime: '17:00', skipDays: ['2026-08-18'] },
      ],
    } as unknown as Job;
    expect(jobWorkedDayKeys(job, WEEKENDS)).toEqual(['2026-08-17', '2026-08-19']);
  });

  it('falls back to the envelope for a legacy job with no dated shifts', () => {
    const job = { ...base, startDate: '2026-08-17T08:00:00', endDate: '2026-08-19T17:00:00' } as unknown as Job;
    expect(jobWorkedDayKeys(job, WEEKENDS)).toEqual(['2026-08-17', '2026-08-18', '2026-08-19']);
  });

  it('returns nothing for an unscheduled job', () => {
    expect(jobWorkedDayKeys({ ...base, startDate: '' } as unknown as Job, WEEKENDS)).toEqual([]);
  });
});
