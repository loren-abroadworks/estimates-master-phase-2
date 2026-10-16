import { describe, it, expect } from 'vitest';
import type { Job } from '../types';
import { buildMemberTimelines, occurrencesClash, clashesWith } from './shiftCascade';

const config = { skipNonWorkingDays: true, weekendDays: [0, 6], holidays: [], workDayStartHour: 8, workDayEndHour: 17 };

const job = (id: string, allocs: any[]): Job => ({ id, name: id, jobNumber: id, stage: 'Scheduled', allocations: allocs } as unknown as Job);

describe('buildMemberTimelines', () => {
  it('pools occurrences per member across jobs and days', () => {
    const jobs = [
      job('j1', [{ id: 's1', name: 'Prep', memberIds: ['m1'], startDate: '2026-07-06', endDate: '2026-07-07', startTime: '08:00', endTime: '12:00' }]),
      job('j2', [{ id: 's2', name: 'Paint', memberIds: ['m1', 'm2'], startDate: '2026-07-06', endDate: '2026-07-06', startTime: '13:00', endTime: '17:00' }]),
    ];
    const tl = buildMemberTimelines(jobs, config);
    expect(tl.get('m1')!.map(o => o.dateKey).sort()).toEqual(['2026-07-06', '2026-07-06', '2026-07-07']);
    expect(tl.get('m2')!).toHaveLength(1);
  });
});

describe('occurrencesClash', () => {
  const occ = (dateKey: string, startMin: number, endMin: number): any => ({ jobId: 'j', shiftId: 's', shiftName: 's', memberIds: ['m1'], dateKey, startMin, endMin });
  it('true when same day and clock windows overlap', () => {
    expect(occurrencesClash(occ('2026-07-06', 480, 720), occ('2026-07-06', 600, 900))).toBe(true);
  });
  it('false when same day but windows are back-to-back', () => {
    expect(occurrencesClash(occ('2026-07-06', 480, 720), occ('2026-07-06', 720, 900))).toBe(false);
  });
  it('false on different days', () => {
    expect(occurrencesClash(occ('2026-07-06', 480, 720), occ('2026-07-07', 480, 720))).toBe(false);
  });
});

describe('clashesWith', () => {
  it('returns shifts overlapping the target on a shared member, excluding pinned', () => {
    const jobs = [
      job('j1', [{ id: 's1', name: 'A', memberIds: ['m1'], startDate: '2026-07-06', endDate: '2026-07-06', startTime: '14:00', endTime: '16:00' }]),
      job('j2', [{ id: 's2', name: 'B', memberIds: ['m1'], startDate: '2026-07-06', endDate: '2026-07-06', startTime: '11:00', endTime: '16:00' }]),
    ];
    const tl = buildMemberTimelines(jobs, config);
    expect(clashesWith({ jobId: 'j1', shiftId: 's1' }, tl, new Set(['s1']))).toEqual([{ jobId: 'j2', shiftId: 's2' }]);
  });
});

import { resolveShiftCascade, shiftRequiredHours } from './shiftCascade';
import type { ProposedChange } from './scheduleEngine';

const alloc = (id: string, name: string, members: string[], startDate: string, endDate: string, startTime: string, endTime: string) =>
  ({ id, name, memberIds: members, startDate, endDate, startTime, endTime });

describe('resolveShiftCascade', () => {
  it('re-places a shift the moved shift now double-books (the John scenario)', () => {
    // John (m1) is on Shift A (7-10) and Shift B (11-16) same day. Move A to 14:00-16:00
    // -> A now overlaps B on m1. Resolver re-places B (the blocker), leaving A pinned.
    const jobs = [
      job('j1', [alloc('sA', 'A', ['m1'], '2026-07-06', '2026-07-06', '14:00', '16:00')]),  // already moved
      job('j2', [alloc('sB', 'B', ['m1'], '2026-07-06', '2026-07-06', '11:00', '16:00')]),
    ];
    const anchor: ProposedChange = {
      jobId: 'j1', jobName: 'j1', jobNumber: 'j1', shiftId: 'sA',
      oldStart: '2026-07-06T07:00:00', oldEnd: '2026-07-06T10:00:00',
      newStart: '2026-07-06T14:00:00', newEnd: '2026-07-06T16:00:00',
    };
    const { changes, residual } = resolveShiftCascade(jobs, anchor, config, {});
    expect(residual).toEqual([]);
    // Exactly one follower — Shift B — and its Jul-6 window (if any) must not cover 14-16.
    expect(changes.map(c => c.shiftId)).toEqual(['sB']);
    const bWindows = changes[0].dailyHours!;
    const jul6 = bWindows['2026-07-06'];
    const stillOverlaps = !!jul6 && jul6.startTime < '16:00' && jul6.endTime > '14:00';
    expect(stillOverlaps).toBe(false);
  });

  it('leaves the anchor shift untouched (never emits a change for it)', () => {
    const jobs = [
      job('j1', [alloc('sA', 'A', ['m1'], '2026-07-06', '2026-07-06', '14:00', '16:00')]),
      job('j2', [alloc('sB', 'B', ['m1'], '2026-07-06', '2026-07-06', '11:00', '16:00')]),
    ];
    const anchor: ProposedChange = { jobId: 'j1', jobName: 'j1', jobNumber: 'j1', shiftId: 'sA', oldStart: null, oldEnd: null, newStart: '2026-07-06T14:00:00', newEnd: '2026-07-06T16:00:00' };
    const { changes } = resolveShiftCascade(jobs, anchor, config, {});
    expect(changes.every(c => c.shiftId !== 'sA')).toBe(true);
  });

  it('reports a ResidualClash when a blocker cannot be placed before untilDate', () => {
    const jobs = [
      job('j1', [alloc('sA', 'A', ['m1'], '2026-07-06', '2026-07-06', '08:00', '17:00')]), // fills the whole day
      job('j2', [alloc('sB', 'B', ['m1'], '2026-07-06', '2026-07-06', '08:00', '17:00')]),
    ];
    const anchor: ProposedChange = { jobId: 'j1', jobName: 'j1', jobNumber: 'j1', shiftId: 'sA', oldStart: null, oldEnd: null, newStart: '2026-07-06T08:00:00', newEnd: '2026-07-06T17:00:00' };
    // untilDate == the clash day means the blocker cannot spill to a later day.
    const { changes, residual } = resolveShiftCascade(jobs, anchor, config, { untilDate: '2026-07-06' });
    expect(changes).toEqual([]);
    expect(residual).toHaveLength(1);
    expect(residual[0].shiftId).toBe('sB');
  });
});

import { detectShiftClashes } from './shiftCascade';

describe('detectShiftClashes', () => {
  it('reports a member double-booked by two overlapping shifts on a day', () => {
    const jobs = [
      job('j1', [alloc('sA', 'A', ['m1'], '2026-07-06', '2026-07-06', '08:00', '12:00')]),
      job('j2', [alloc('sB', 'B', ['m1'], '2026-07-06', '2026-07-06', '10:00', '14:00')]),
    ];
    const clashes = detectShiftClashes(jobs, config);
    expect(clashes).toHaveLength(1);
    expect(clashes[0].memberId).toBe('m1');
    expect(clashes[0].dateKey).toBe('2026-07-06');
  });

  it('returns nothing when windows do not overlap', () => {
    const jobs = [
      job('j1', [alloc('sA', 'A', ['m1'], '2026-07-06', '2026-07-06', '08:00', '12:00')]),
      job('j2', [alloc('sB', 'B', ['m1'], '2026-07-06', '2026-07-06', '13:00', '17:00')]),
    ];
    expect(detectShiftClashes(jobs, config)).toEqual([]);
  });
});
