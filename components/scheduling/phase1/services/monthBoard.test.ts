import { describe, it, expect } from 'vitest';
import { buildMonthWeeks, buildMonthWeekLane } from './monthBoard';
import { configFromSettings } from './scheduleEngine';
import { layoutLaneBars } from './productionBoard';
import type { Job } from '../types';

const cfg = configFromSettings(undefined, false); // weekends [0,6] non-working

const job = (over: Partial<Job>): Job => ({
  id: 'j1', jobNumber: 'J-1', name: 'Job 1', stage: 'Scheduled',
  startDate: '2026-06-02T08:00:00', endDate: '2026-06-02T17:00:00', ...over,
} as Job);

describe('buildMonthWeeks', () => {
  // June 2026: Jun 1 = Mon, Jun 30 = Tue. Grid starts Sun May 31.
  const ref = new Date(2026, 5, 15); // month index 5 = June

  it('returns one row per week covering the month, weekdays only', () => {
    const weeks = buildMonthWeeks(ref, cfg);
    expect(weeks).toHaveLength(5);
    // Sunday is filtered out, so each row starts Monday with 5 working days.
    expect(weeks[0].days).toHaveLength(5);
    expect(weeks[0].days[0].key).toBe('2026-06-01');
    expect(weeks[0].days[4].key).toBe('2026-06-05');
  });

  it('marks adjacent-month days with inMonth=false', () => {
    const weeks = buildMonthWeeks(ref, cfg);
    const lastWeek = weeks[weeks.length - 1];
    const july1 = lastWeek.days.find(d => d.key === '2026-07-01');
    expect(july1?.inMonth).toBe(false);
    expect(weeks[0].days.find(d => d.key === '2026-06-01')?.inMonth).toBe(true);
  });

  it('keeps weekend columns when weekends are working', () => {
    const weeks = buildMonthWeeks(ref, { ...cfg, weekendDays: [] });
    expect(weeks[0].days).toHaveLength(7);
    expect(weeks[0].days[0].key).toBe('2026-05-31'); // Sunday shown
  });
});

describe('buildMonthWeekLane', () => {
  const weekKeys = ['2026-06-01','2026-06-02','2026-06-03','2026-06-04','2026-06-05'];

  it('places a multi-day job on each working day it spans', () => {
    const j = job({ startDate: '2026-06-02T08:00:00', endDate: '2026-06-04T17:00:00' });
    const lane = buildMonthWeekLane([j], weekKeys, cfg, () => '#abc');
    expect(lane.cardsByDay['2026-06-02']?.[0].jobId).toBe('j1');
    expect(lane.cardsByDay['2026-06-04']?.[0].jobId).toBe('j1');
    expect(lane.cardsByDay['2026-06-01']).toBeUndefined();
    // layoutLaneBars turns it into a single 3-column bar.
    const { bars } = layoutLaneBars(lane, weekKeys);
    expect(bars).toHaveLength(1);
    expect(bars[0].startCol).toBe(1);
    expect(bars[0].span).toBe(3);
  });

  it('applies the color callback and skips non-schedulable jobs', () => {
    const lane = buildMonthWeekLane(
      [job({ id: 'done', stage: 'Completed' }), job({ id: 'live' })],
      weekKeys, cfg, () => '#123456',
    );
    expect(lane.cardsByDay['2026-06-02']?.map(c => c.jobId)).toEqual(['live']);
    expect(lane.cardsByDay['2026-06-02']?.[0].color).toBe('#123456');
  });

  it('emits one card per shift for an allocation-based job', () => {
    const j = job({
      id: 'multi', startDate: '2026-06-02T08:00:00', endDate: '2026-06-03T17:00:00',
      allocations: [
        { id: 's1', name: 'Prep', memberIds: ['m1'], startDate: '2026-06-02', endDate: '2026-06-02', startTime: '08:00', endTime: '12:00' },
        { id: 's2', name: 'Finish', memberIds: ['m1'], startDate: '2026-06-03', endDate: '2026-06-03', startTime: '08:00', endTime: '12:00' },
      ],
    } as Partial<Job>);
    const lane = buildMonthWeekLane([j], weekKeys, cfg, () => '#abc');
    expect(lane.cardsByDay['2026-06-02']?.map(c => c.shiftId)).toEqual(['s1']);
    expect(lane.cardsByDay['2026-06-02']?.[0].shiftName).toBe('Prep');
    expect(lane.cardsByDay['2026-06-03']?.map(c => c.shiftId)).toEqual(['s2']);
    expect(lane.cardsByDay['2026-06-03']?.[0].shiftName).toBe('Finish');
    const { bars } = layoutLaneBars(lane, weekKeys);
    expect(bars).toHaveLength(2);
  });

  it('emits a single job card for a legacy job (no allocations)', () => {
    const lane = buildMonthWeekLane([job({ id: 'legacy' })], weekKeys, cfg, () => '#abc');
    const card = lane.cardsByDay['2026-06-02']?.[0];
    expect(card?.jobId).toBe('legacy');
    expect(card?.shiftId).toBeUndefined();
    expect(card?.color).toBe('#abc');
  });
});

describe('month lane label noise', () => {
  const weekKeys = ['2026-06-01','2026-06-02','2026-06-03','2026-06-04','2026-06-05'];
  it("a job's only shift emits no shiftName", () => {
    const j = job({ id: 'solo', startDate: '2026-06-02T08:00:00', endDate: '2026-06-02T17:00:00',
      allocations: [{ id: 'only', name: 'Crew', memberIds: ['m1'], startDate: '2026-06-02', endDate: '2026-06-02', startTime: '08:00', endTime: '17:00' }] } as Partial<Job>);
    const lane = buildMonthWeekLane([j], weekKeys, cfg, () => '#abc');
    expect(lane.cardsByDay['2026-06-02']?.[0].shiftId).toBe('only');
    expect(lane.cardsByDay['2026-06-02']?.[0].shiftName).toBeUndefined();
  });
});

describe('buildMonthWeekLane with a skipped day', () => {
  const weekKeys = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05'];

  it('leaves a skipped day empty and bars either side of it', () => {
    const j = job({
      startDate: '2026-06-02T08:00:00', endDate: '2026-06-04T17:00:00',
      allocations: [{
        id: 's1', name: 'Crew', memberIds: ['m1'],
        startDate: '2026-06-02', endDate: '2026-06-04',
        startTime: '08:00', endTime: '17:00',
        skipDays: ['2026-06-03'],
      }],
    });
    const lane = buildMonthWeekLane([j], weekKeys, cfg, () => '#abc');
    expect(lane.cardsByDay['2026-06-02']?.[0].jobId).toBe('j1');
    expect(lane.cardsByDay['2026-06-03']).toBeUndefined();
    expect(lane.cardsByDay['2026-06-04']?.[0].jobId).toBe('j1');
    // The hole splits what would otherwise be one 3-column bar into two 1-column bars.
    const { bars } = layoutLaneBars(lane, weekKeys);
    expect(bars).toHaveLength(2);
    expect(bars.map(b => b.span)).toEqual([1, 1]);
  });
});
