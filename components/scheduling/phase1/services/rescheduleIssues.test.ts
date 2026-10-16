import { describe, it, expect } from 'vitest';
import { detectIssues, ScheduleIssue, sharedCrewScope } from './rescheduleIssues';
import { configFromSettings, ProposedChange } from './scheduleEngine';
import type { Job } from '../types';

const cfg = configFromSettings(undefined, false); // weekends [0,6], no holidays
const WORKDAY = cfg.workDayEndHour - cfg.workDayStartHour; // 9
const capacity = WORKDAY; // 1 job/day per member by default

const job = (over: Partial<Job>): Job => ({
  id: 'j1', jobNumber: 'J-1', name: 'Job 1', stage: 'Scheduled',
  startDate: '2026-06-02T08:00:00', endDate: '2026-06-02T17:00:00',
  crewMemberIds: ['m1'], dateCreated: '', clientId: '', estimateId: '', address: '',
  ...over,
} as Job);

const change = (over: Partial<ProposedChange>): ProposedChange => ({
  jobId: 'j1', jobName: 'Job 1', jobNumber: 'J-1',
  oldStart: '2026-06-02T08:00:00', oldEnd: '2026-06-02T17:00:00',
  newStart: '2026-06-02T08:00:00', newEnd: '2026-06-02T17:00:00',
  ...over,
});

const kinds = (issues: ScheduleIssue[]) => issues.map(i => i.kind).sort();

describe('detectIssues', () => {
  it('flags weekend work when a job lands on Saturday', () => {
    const jobs = [job({})];
    const chs = [change({ newStart: '2026-06-06T08:00:00', newEnd: '2026-06-06T17:00:00' })]; // Sat
    expect(kinds(detectIssues(chs, jobs, cfg, capacity))).toContain('weekend');
  });
  it('flags double-booking when two proposed jobs share a member on the same day', () => {
    const jobs = [job({}), job({ id: 'j2', jobNumber: 'J-2', name: 'Job 2', crewMemberIds: ['m1'], startDate: '2026-06-09T08:00:00', endDate: '2026-06-09T17:00:00' })];
    const chs = [change({ newStart: '2026-06-09T08:00:00', newEnd: '2026-06-09T17:00:00' })];
    expect(kinds(detectIssues(chs, jobs, cfg, capacity))).toContain('double-book');
  });
  it('does not flag two same-day jobs whose assigned members differ', () => {
    // Member-based conflict only: distinct people working separate jobs the same
    // day is not a double-book.
    const jobs = [
      job({ crewMemberIds: ['m1'] }),
      job({ id: 'j2', jobNumber: 'J-2', name: 'Job 2', crewMemberIds: ['m2'], startDate: '2026-06-09T08:00:00', endDate: '2026-06-09T17:00:00' }),
    ];
    const chs = [change({ newStart: '2026-06-09T08:00:00', newEnd: '2026-06-09T17:00:00' })];
    expect(kinds(detectIssues(chs, jobs, cfg, capacity))).not.toContain('double-book');
  });
  it('does not flag a shared member working morning + afternoon jobs the same day', () => {
    // Same person on both jobs, same day, but 8–12 vs 1–5 → no hour overlap.
    const jobs = [
      job({ crewMemberIds: ['m1'], startDate: '2026-06-09T08:00:00', endDate: '2026-06-09T12:00:00' }),
      job({ id: 'j2', jobNumber: 'J-2', name: 'Job 2', crewMemberIds: ['m1'], startDate: '2026-06-09T13:00:00', endDate: '2026-06-09T17:00:00' }),
    ];
    const chs = [change({ newStart: '2026-06-09T08:00:00', newEnd: '2026-06-09T12:00:00' })];
    expect(kinds(detectIssues(chs, jobs, cfg, capacity))).not.toContain('double-book');
  });
  it('flags double-booking when a shared member has overlapping hours the same day', () => {
    const jobs = [
      job({ crewMemberIds: ['m1'], startDate: '2026-06-09T08:00:00', endDate: '2026-06-09T14:00:00' }),
      job({ id: 'j2', jobNumber: 'J-2', name: 'Job 2', crewMemberIds: ['m1'], startDate: '2026-06-09T13:00:00', endDate: '2026-06-09T17:00:00' }),
    ];
    const chs = [change({ newStart: '2026-06-09T08:00:00', newEnd: '2026-06-09T14:00:00' })];
    expect(kinds(detectIssues(chs, jobs, cfg, capacity))).toContain('double-book');
  });
  it('flags double-booking against a multi-day job that spans the subject day', () => {
    // Lakeview occupies Jun 11–12; the subject (shares m1) lands on Jun 12 — Lakeview's
    // second day, which the old start-day-only check missed.
    const jobs = [
      job({ crewMemberIds: ['m1'] }),
      job({ id: 'j2', name: 'Lakeview', crewMemberIds: ['m1'], startDate: '2026-06-11T08:00:00', endDate: '2026-06-12T17:00:00' }),
    ];
    const chs = [change({ newStart: '2026-06-12T08:00:00', newEnd: '2026-06-12T17:00:00' })];
    expect(kinds(detectIssues(chs, jobs, cfg, capacity))).toContain('double-book');
  });
  it('flags past-due when the new end is after the customer due date', () => {
    const jobs = [job({ customerWindow: { dueDate: '2026-06-02' } })];
    const chs = [change({ newStart: '2026-06-04T08:00:00', newEnd: '2026-06-04T17:00:00' })];
    expect(kinds(detectIssues(chs, jobs, cfg, capacity))).toContain('past-due');
  });
  it('suppresses capacity when a double-book already covers the same job/day', () => {
    // Two jobs share m1 on the same day: under default capacity this is both a
    // double-book and a capacity overflow, but only double-book should surface.
    const jobs = [job({}), job({ id: 'j2', jobNumber: 'J-2', crewMemberIds: ['m1'], startDate: '2026-06-09T08:00:00', endDate: '2026-06-09T17:00:00' })];
    const chs = [change({ newStart: '2026-06-09T08:00:00', newEnd: '2026-06-09T17:00:00' })];
    const k = kinds(detectIssues(chs, jobs, cfg, capacity));
    expect(k).toContain('double-book');
    expect(k).not.toContain('capacity');
  });
  it('returns no issues for a clean weekday move with no conflicts', () => {
    const jobs = [job({})];
    const chs = [change({ newStart: '2026-06-03T08:00:00', newEnd: '2026-06-03T17:00:00' })];
    expect(detectIssues(chs, jobs, cfg, capacity)).toHaveLength(0);
  });
  it('ignores skipped changes', () => {
    const jobs = [job({})];
    const chs = [change({ skipped: 'locked', newStart: '2026-06-06T08:00:00', newEnd: '2026-06-06T17:00:00' })];
    expect(detectIssues(chs, jobs, cfg, capacity)).toHaveLength(0);
  });
});

describe('sharedCrewScope', () => {
  it('returns the job assigned members', () => {
    const job = { id: 'j', crewMemberIds: ['m1', 'm2'] } as any;
    expect(new Set(sharedCrewScope(job).crewMemberIds)).toEqual(new Set(['m1', 'm2']));
  });

  it('de-duplicates repeated members', () => {
    const job = { id: 'j', crewMemberIds: ['m1', 'm1', 'm2'] } as any;
    expect(new Set(sharedCrewScope(job).crewMemberIds)).toEqual(new Set(['m1', 'm2']));
  });

  it('returns an empty member list for a crewless job', () => {
    const job = { id: 'j' } as any;
    expect(sharedCrewScope(job).crewMemberIds).toEqual([]);
  });
});
