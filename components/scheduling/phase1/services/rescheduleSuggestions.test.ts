import { describe, it, expect } from 'vitest';
import { buildSuggestions, Suggestion } from './rescheduleSuggestions';
import { configFromSettings, ProposedChange, toLocalDateKey } from './scheduleEngine';
import type { Job, WeatherKind } from '../types';

const cfg = configFromSettings(undefined, false); // weekends [0,6]
const capacity = cfg.workDayEndHour - cfg.workDayStartHour;

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

describe('buildSuggestions', () => {
  it('suggests moving a job off a weekend to the next working day', () => {
    const jobs = [job({})];
    const chs = [change({ newStart: '2026-06-06T08:00:00', newEnd: '2026-06-06T17:00:00' })]; // Sat
    const sugg = buildSuggestions(chs, jobs, cfg, { mockWeather: {}, capacityHours: capacity });
    expect(sugg).toHaveLength(1);
    expect(sugg[0].jobId).toBe('j1');
    expect(toLocalDateKey(new Date(sugg[0].change.newStart))).toBe('2026-06-08'); // Mon
  });
  it('suggests moving a job off a rain day to the next clear working day', () => {
    const jobs = [job({})];
    const weather: Record<string, WeatherKind> = { '2026-06-03': 'rain', '2026-06-04': 'clear' };
    const chs = [change({ newStart: '2026-06-03T08:00:00', newEnd: '2026-06-03T17:00:00' })]; // Wed rain
    const sugg = buildSuggestions(chs, jobs, cfg, { mockWeather: weather, capacityHours: capacity });
    expect(sugg).toHaveLength(1);
    expect(toLocalDateKey(new Date(sugg[0].change.newStart))).toBe('2026-06-04'); // Thu clear
  });
  it('skips days occupied by a multi-day job, not just its start day', () => {
    const jobs = [
      job({}), // j1 subject, currently on Sat (flagged) — shares m1 with j2
      job({ id: 'j2', name: 'Lakeview', crewMemberIds: ['m1'], startDate: '2026-06-08T08:00:00', endDate: '2026-06-09T17:00:00' }), // occupies Mon + Tue
    ];
    const chs = [change({ newStart: '2026-06-06T08:00:00', newEnd: '2026-06-06T17:00:00' })]; // Sat
    const sugg = buildSuggestions(chs, jobs, cfg, { mockWeather: {}, capacityHours: capacity });
    expect(sugg).toHaveLength(1);
    // Mon (8th) and Tue (9th) are both taken by the 2-day job → first clear day is Wed (10th).
    expect(toLocalDateKey(new Date(sugg[0].change.newStart))).toBe('2026-06-10');
  });
  it('returns no suggestion for a clean change', () => {
    const jobs = [job({})];
    const chs = [change({ newStart: '2026-06-04T08:00:00', newEnd: '2026-06-04T17:00:00' })]; // Thu clear, no conflict
    expect(buildSuggestions(chs, jobs, cfg, { mockWeather: {}, capacityHours: capacity })).toHaveLength(0);
  });
  it('preserves the original old dates and the job duration in the suggested change', () => {
    const jobs = [job({})];
    const chs = [change({ newStart: '2026-06-06T08:00:00', newEnd: '2026-06-06T17:00:00' })];
    const s = buildSuggestions(chs, jobs, cfg, { mockWeather: {}, capacityHours: capacity })[0];
    expect(s.change.oldStart).toBe('2026-06-02T08:00:00');
    const dur = new Date(s.change.newEnd).getTime() - new Date(s.change.newStart).getTime();
    expect(dur).toBe(9 * 3_600_000);
  });
  it('ignores skipped changes', () => {
    const jobs = [job({})];
    const chs = [change({ skipped: 'locked', newStart: '2026-06-06T08:00:00', newEnd: '2026-06-06T17:00:00' })];
    expect(buildSuggestions(chs, jobs, cfg, { mockWeather: {}, capacityHours: capacity })).toHaveLength(0);
  });
  it('does not suggest moving a job that is only past-due (forward move would worsen it)', () => {
    const jobs = [job({ customerWindow: { dueDate: '2026-06-02' } })];
    // Thursday, clear, no conflict — the ONLY issue is past-due
    const chs = [change({ newStart: '2026-06-04T08:00:00', newEnd: '2026-06-04T17:00:00' })];
    expect(buildSuggestions(chs, jobs, cfg, { mockWeather: {}, capacityHours: capacity })).toHaveLength(0);
  });
});
