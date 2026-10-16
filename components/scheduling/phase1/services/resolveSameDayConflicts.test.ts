import { describe, it, expect } from 'vitest';
import {
  resolveSameDayConflicts, mergeResolutionsIntoChanges, findSameDaySlot,
  isMovableResolution, bakeDailyEdits, ConflictResolution,
} from './resolveSameDayConflicts';
import { configFromSettings, ProposedChange } from './scheduleEngine';
import { sharedCrewScope, detectIssues } from './rescheduleIssues';
import type { Job } from '../types';

const cfg = configFromSettings(undefined, false); // 08:00–17:00, weekends [0,6]

const makeJob = (
  id: string, start: string, end: string, days: Record<string, [string, string]>, over: Partial<Job> = {},
): Job => ({
  id, jobNumber: id, name: id, stage: 'Scheduled',
  startDate: start, endDate: end,
  dailyHours: Object.fromEntries(Object.entries(days).map(([k, [s, e]]) => [k, { startTime: s, endTime: e }])),
  crewMemberIds: ['m1'], dateCreated: '', clientId: '', estimateId: '', address: '',
  ...over,
} as Job);

// Single-day job on `day` with one clock window.
const dayJob = (id: string, day: string, s: string, e: string, over: Partial<Job> = {}): Job =>
  makeJob(id, `${day}T${s}:00`, `${day}T${e}:00`, { [day]: [s, e] }, over);

const primaryChange = (j: Job): ProposedChange => ({
  jobId: j.id, jobName: j.name, jobNumber: j.jobNumber,
  oldStart: j.startDate!, oldEnd: j.endDate!,
  newStart: j.startDate!, newEnd: j.endDate!, dailyHours: j.dailyHours,
});

const D = '2026-06-01'; // Monday

describe('resolveSameDayConflicts', () => {
  it('gap-fills into the earliest free slot (the freed morning), not after the anchor', () => {
    const a = dayJob('A', D, '13:00', '17:00'); // primary, afternoon
    const b = dayJob('B', D, '13:00', '17:00'); // 4h, overlaps A
    const res = resolveSameDayConflicts(primaryChange(a), [a, b], cfg);
    expect(res).toHaveLength(1);
    expect(res[0].kind).toBe('slide-same-day');
    expect(res[0].change.dailyHours![D]).toEqual({ startTime: '08:00', endTime: '12:00' });
  });

  it('gap-fills the earliest free slot when the morning is occupied', () => {
    const a = dayJob('A', D, '08:00', '12:00'); // primary, morning
    const b = dayJob('B', D, '10:00', '13:00'); // 3h, overlaps A
    const res = resolveSameDayConflicts(primaryChange(a), [a, b], cfg);
    expect(res[0].kind).toBe('slide-same-day');
    expect(res[0].change.dailyHours![D]).toEqual({ startTime: '12:00', endTime: '15:00' });
  });

  it('multi-day: gap-fills only the conflicting day, preserving the project span', () => {
    const a = dayJob('A', '2026-06-02', '13:00', '17:00'); // primary, single day, Tue
    // Downtown spans Mon–Wed, 13:00–17:00 each working day; clash on Tue Jun 2.
    const b = makeJob('B', '2026-06-01T13:00:00', '2026-06-03T17:00:00', {
      '2026-06-01': ['13:00', '17:00'], '2026-06-02': ['13:00', '17:00'], '2026-06-03': ['13:00', '17:00'],
    });
    const res = resolveSameDayConflicts(primaryChange(a), [a, b], cfg);
    expect(res).toHaveLength(1);
    expect(res[0].kind).toBe('slide-same-day');
    expect(res[0].change.dailyHours!['2026-06-02']).toEqual({ startTime: '08:00', endTime: '12:00' });
    expect(res[0].change.newStart).toBe('2026-06-01T13:00:00'); // first day untouched
    expect(res[0].change.newEnd).toBe('2026-06-03T17:00:00');   // last day untouched
  });

  it('pushes a blocker to make room when no gap fits, cascading to the bumped job', () => {
    const a = dayJob('A', D, '08:00', '12:00');  // primary
    const b = dayJob('B', D, '10:00', '13:00');  // 3h
    const c = dayJob('C', D, '14:00', '15:00');  // 1h, sits in B's would-be slot
    const res = resolveSameDayConflicts(primaryChange(a), [a, b, c], cfg);
    const byId = Object.fromEntries(res.map(r => [r.jobId, r]));
    expect(res).toHaveLength(2);
    expect(byId.B.change.dailyHours![D]).toEqual({ startTime: '12:00', endTime: '15:00' });
    expect(byId.C.kind).toBe('slide-same-day');
    expect(byId.C.change.dailyHours![D]).toEqual({ startTime: '15:00', endTime: '16:00' });
  });

  it('single-day with no same-day fit moves to the nearest working day', () => {
    const day = '2026-06-03'; // Wednesday
    const a = dayJob('A', day, '08:00', '15:00'); // primary fills most of the day
    const b = dayJob('B', day, '14:00', '17:00'); // 3h won't fit after 15:00
    const res = resolveSameDayConflicts(primaryChange(a), [a, b], cfg);
    expect(res).toHaveLength(1);
    expect(res[0].kind).toBe('move-to-day');
    expect(res[0].change.newStart).toBe('2026-06-02T08:00:00'); // nearest day, tie -> earlier (Tue)
    expect(res[0].change.dailyHours!['2026-06-02']).toEqual({ startTime: '08:00', endTime: '11:00' });
  });

  it('multi-day with no same-day fit is reported as unresolved (project untouched)', () => {
    const a = dayJob('A', '2026-06-02', '08:00', '17:00'); // primary fills the whole day
    const b = makeJob('B', '2026-06-01T13:00:00', '2026-06-03T17:00:00', {
      '2026-06-01': ['13:00', '17:00'], '2026-06-02': ['13:00', '17:00'], '2026-06-03': ['13:00', '17:00'],
    });
    const res = resolveSameDayConflicts(primaryChange(a), [a, b], cfg);
    expect(res).toHaveLength(1);
    expect(res[0].kind).toBe('unresolved');
  });

  it('ignores overlaps when no crew member is shared', () => {
    const a = dayJob('A', D, '08:00', '12:00', { crewMemberIds: ['m1'] });
    const b = dayJob('B', D, '10:00', '13:00', { crewMemberIds: ['m2'] });
    expect(resolveSameDayConflicts(primaryChange(a), [a, b], cfg)).toEqual([]);
  });

  it('ignores shared-crew jobs that do not overlap in time', () => {
    const a = dayJob('A', D, '08:00', '10:00');
    const b = dayJob('B', D, '13:00', '15:00');
    expect(resolveSameDayConflicts(primaryChange(a), [a, b], cfg)).toEqual([]);
  });

  it('reports a locked conflicting job as unresolvable instead of moving it', () => {
    const a = dayJob('A', D, '08:00', '12:00');
    const b = dayJob('B', D, '10:00', '13:00', { is_locked: true });
    const res = resolveSameDayConflicts(primaryChange(a), [a, b], cfg);
    expect(res).toHaveLength(1);
    expect(res[0].kind).toBe('locked-blocked');
    expect(res[0].change.newStart).toBe(b.startDate);
  });
});

describe('findSameDaySlot', () => {
  const scope = sharedCrewScope({ id: 'x', crewMemberIds: ['m1'] } as Job);

  it('returns the earliest free interval that fits, placed at its start', () => {
    const a = dayJob('A', D, '13:00', '17:00');
    const slot = findSameDaySlot(4, D, scope, 'B', [a], cfg);
    expect(slot).toEqual({ startTime: '08:00', endTime: '12:00' });
  });

  it('returns null when nothing fits', () => {
    const a = dayJob('A', D, '08:00', '17:00');
    expect(findSameDaySlot(4, D, scope, 'B', [a], cfg)).toBeNull();
  });
});

describe('isMovableResolution', () => {
  const mk = (kind: ConflictResolution['kind']): ConflictResolution =>
    ({ jobId: 'x', jobName: 'X', jobNumber: 'x', kind, change: {} as ProposedChange, label: '' });
  it('is true only for slide-same-day and move-to-day', () => {
    expect(isMovableResolution(mk('slide-same-day'))).toBe(true);
    expect(isMovableResolution(mk('move-to-day'))).toBe(true);
    expect(isMovableResolution(mk('unresolved'))).toBe(false);
    expect(isMovableResolution(mk('locked-blocked'))).toBe(false);
  });
});

describe('bakeDailyEdits', () => {
  const cap = cfg.workDayEndHour - cfg.workDayStartHour;

  it('lets detectIssues see an in-flight mid-day edit that creates a conflict', () => {
    const a = dayJob('A', D, '08:00', '12:00'); // originally no overlap with B
    const b = dayJob('B', D, '13:00', '17:00');
    const aChange = primaryChange(a);
    // Detection without the edit: A still at 08:00–12:00, so no conflict.
    expect(detectIssues([aChange], [a, b], cfg, cap).some(i => i.kind === 'double-book')).toBe(false);
    // User drags A's window to 13:00–17:00 (overlaps B) — lives only in dailyHoursEdits.
    const baked = bakeDailyEdits(aChange, { [D]: { startTime: '13:00', endTime: '17:00' } });
    expect(detectIssues([baked], [a, b], cfg, cap).some(i => i.kind === 'double-book')).toBe(true);
  });

  it('returns the change unchanged when there are no edits', () => {
    const c = primaryChange(dayJob('A', D, '08:00', '12:00'));
    expect(bakeDailyEdits(c, undefined)).toBe(c);
  });
});

describe('mergeResolutionsIntoChanges', () => {
  const primary: ProposedChange = {
    jobId: 'd', jobName: 'Downtown', jobNumber: 'wo-4',
    oldStart: '2026-06-16T13:00:00', oldEnd: '2026-06-19T17:00:00',
    newStart: '2026-06-16T13:00:00', newEnd: '2026-06-19T17:00:00',
  };
  const edits = {
    d: {
      '2026-06-16': { startTime: '13:00', endTime: '17:00' },
      '2026-06-18': { startTime: '08:00', endTime: '12:00' },
      '2026-06-19': { startTime: '13:00', endTime: '17:00' },
    },
  };
  const slide: ConflictResolution = {
    jobId: 'ak', jobName: 'Anderson', jobNumber: 'wo-5', kind: 'slide-same-day',
    change: {
      jobId: 'ak', jobName: 'Anderson', jobNumber: 'wo-5',
      oldStart: '2026-06-18T08:00:00', oldEnd: '2026-06-18T12:00:00',
      newStart: '2026-06-18T12:00:00', newEnd: '2026-06-18T16:00:00',
      dailyHours: { '2026-06-18': { startTime: '12:00', endTime: '16:00' } },
    },
    label: 'Move Anderson to 12:00 PM–4:00 PM',
  };

  it('bakes in-flight per-day edits into the primary change so a re-seed preserves them', () => {
    const merged = mergeResolutionsIntoChanges([primary], [slide], edits);
    const d = merged.find(c => c.jobId === 'd')!;
    expect(d.dailyHours!['2026-06-18']).toEqual({ startTime: '08:00', endTime: '12:00' });
    expect(merged.find(c => c.jobId === 'ak')).toBeTruthy();
  });

  it('adds the moved conflicting job and keeps the existing primary', () => {
    const merged = mergeResolutionsIntoChanges([primary], [slide], edits);
    expect(merged.map(c => c.jobId).sort()).toEqual(['ak', 'd']);
    expect(merged.find(c => c.jobId === 'ak')!.newStart).toBe('2026-06-18T12:00:00');
  });

  it('does not stage unresolved or locked-blocked resolutions', () => {
    const unresolved: ConflictResolution = { ...slide, kind: 'unresolved' };
    const locked: ConflictResolution = { ...slide, kind: 'locked-blocked' };
    expect(mergeResolutionsIntoChanges([primary], [unresolved], edits).map(c => c.jobId)).toEqual(['d']);
    expect(mergeResolutionsIntoChanges([primary], [locked], edits).map(c => c.jobId)).toEqual(['d']);
  });
});
