import { describe, it, expect } from 'vitest';
import { buildDayBlocks, setJobDayWindow, shiftDayWindow, withDayWindows, splitBlockAroundBreaks } from './dayBoard';
import { buildJobLanes, buildMemberLanes } from './productionBoard';
import { configFromSettings } from './scheduleEngine';
import type { Job } from '../types';

const cfg = configFromSettings(undefined, false); // 8:00–17:00, weekend [0,6]

const job = (over: Partial<Job> = {}): Job =>
  ({ id: 'j1', jobNumber: 'J-1', name: 'Repaint', stage: 'Scheduled', clientId: 'c1',
     startDate: '2026-06-10T08:00:00', endDate: '2026-06-10T17:00:00', ...over } as Job);

// 2026-06-10 is a Wednesday.
const DAY = '2026-06-10';

describe('buildDayBlocks', () => {
  it('positions a full-workday job to span the whole axis', () => {
    const lanes = buildJobLanes([job()], [new Date('2026-06-10T12:00:00')], cfg);
    const rows = buildDayBlocks(lanes, DAY, cfg.workDayStartHour, cfg.workDayEndHour);
    const block = rows[0].blocks[0];
    expect(block.topPct).toBe(0);
    expect(block.heightPct).toBe(100);
    expect(block.clamped).toBe(false);
  });

  it('positions a midday job partway down the axis (10:00–14:00 of 8–17)', () => {
    const j = job({ startDate: '2026-06-10T10:00:00', endDate: '2026-06-10T14:00:00' });
    const lanes = buildJobLanes([j], [new Date('2026-06-10T12:00:00')], cfg);
    const block = buildDayBlocks(lanes, DAY, 8, 17)[0].blocks[0];
    // axis = 9h. top = (10-8)/9, height = (14-10)/9.
    expect(block.topPct).toBeCloseTo((2 / 9) * 100, 5);
    expect(block.heightPct).toBeCloseTo((4 / 9) * 100, 5);
    expect(block.clamped).toBe(false);
  });

  it('clamps a job that starts before the axis and flags it', () => {
    const j = job({ startDate: '2026-06-10T06:00:00', endDate: '2026-06-10T12:00:00' });
    const lanes = buildJobLanes([j], [new Date('2026-06-10T12:00:00')], cfg);
    const block = buildDayBlocks(lanes, DAY, 8, 17)[0].blocks[0];
    expect(block.topPct).toBe(0);
    expect(block.heightPct).toBeCloseTo((4 / 9) * 100, 5); // 8→12
    expect(block.clamped).toBe(true);
  });

  it('clamps a job that ends after the axis and flags it', () => {
    const j = job({ startDate: '2026-06-10T15:00:00', endDate: '2026-06-10T20:00:00' });
    const lanes = buildJobLanes([j], [new Date('2026-06-10T12:00:00')], cfg);
    const block = buildDayBlocks(lanes, DAY, 8, 17)[0].blocks[0];
    expect(block.topPct).toBeCloseTo((7 / 9) * 100, 5); // 15
    expect(block.heightPct).toBeCloseTo((2 / 9) * 100, 5); // 15→17
    expect(block.clamped).toBe(true);
  });

  it('enforces a minimum height so a zero-length block still renders', () => {
    const j = job({ startDate: '2026-06-10T10:00:00', endDate: '2026-06-10T10:00:00' });
    const lanes = buildJobLanes([j], [new Date('2026-06-10T12:00:00')], cfg);
    const block = buildDayBlocks(lanes, DAY, 8, 17)[0].blocks[0];
    expect(block.heightPct).toBeGreaterThan(0);
  });

  it('gives a lone block full width', () => {
    const lanes = buildJobLanes([job()], [new Date('2026-06-10T12:00:00')], cfg);
    const block = buildDayBlocks(lanes, DAY, 8, 17)[0].blocks[0];
    expect(block.leftPct).toBe(0);
    expect(block.widthPct).toBe(100);
  });

  it('cascades two overlapping blocks: one full-width underneath, one offset on top', () => {
    // Two members on different jobs that overlap in time, both shown in a member lane.
    const a = job({ id: 'a', name: 'A', startDate: '2026-06-10T08:00:00', endDate: '2026-06-10T12:00:00', crewMemberIds: ['m1'] });
    const b = job({ id: 'b', name: 'B', startDate: '2026-06-10T10:00:00', endDate: '2026-06-10T14:00:00', crewMemberIds: ['m1'] });
    const member = { id: 'm1', name: 'Mike', role: 'Painter', status: 'Active' } as any;
    const lanes = buildMemberLanes([a, b], [member], [new Date('2026-06-10T12:00:00')], cfg);
    const blocks = buildDayBlocks(lanes, DAY, 8, 17)[0].blocks;
    expect(blocks).toHaveLength(2);
    // First column: full width at the left, lowest stacking order.
    const byOffset = [...blocks].sort((x, y) => x.leftPct - y.leftPct);
    expect(byOffset[0]).toMatchObject({ leftPct: 0, widthPct: 100, zIndex: 0 });
    // Second column: offset right, narrower, stacked on top, still extends to the edge.
    expect(byOffset[1].leftPct).toBe(18);
    expect(byOffset[1].widthPct).toBe(82);
    expect(byOffset[1].zIndex).toBe(1);
  });

  it('keeps two non-overlapping blocks at full width', () => {
    const a = job({ id: 'a', name: 'A', startDate: '2026-06-10T08:00:00', endDate: '2026-06-10T10:00:00', crewMemberIds: ['m1'] });
    const b = job({ id: 'b', name: 'B', startDate: '2026-06-10T13:00:00', endDate: '2026-06-10T16:00:00', crewMemberIds: ['m1'] });
    const member = { id: 'm1', name: 'Mike', role: 'Painter', status: 'Active' } as any;
    const lanes = buildMemberLanes([a, b], [member], [new Date('2026-06-10T12:00:00')], cfg);
    const blocks = buildDayBlocks(lanes, DAY, 8, 17)[0].blocks;
    expect(blocks.every(bl => bl.widthPct === 100 && bl.leftPct === 0)).toBe(true);
  });

  it('uses the per-day dailyHours override when present', () => {
    const j = job({ dailyHours: { [DAY]: { startTime: '11:00', endTime: '13:00' } } });
    const lanes = buildJobLanes([j], [new Date('2026-06-10T12:00:00')], cfg);
    const block = buildDayBlocks(lanes, DAY, 8, 17)[0].blocks[0];
    expect(block.startTime).toBe('11:00');
    expect(block.endTime).toBe('13:00');
    expect(block.topPct).toBeCloseTo((3 / 9) * 100, 5); // 11
  });

  it('shows the selected day\'s per-day window for a multi-day job (not the overall span)', () => {
    // Mon 8–5, Tue 8–12, Wed 8–12. The card's overall window is the start day's
    // start → the END day's end (8–12), so the start day would wrongly read 8–12.
    const MON = '2026-06-22', TUE = '2026-06-23', WED = '2026-06-24';
    const j = job({
      startDate: `${MON}T08:00:00`, endDate: `${WED}T12:00:00`,
      dailyHours: {
        [MON]: { startTime: '08:00', endTime: '17:00' },
        [TUE]: { startTime: '08:00', endTime: '12:00' },
        [WED]: { startTime: '08:00', endTime: '12:00' },
      },
    });
    const lanes = withDayWindows(buildJobLanes([j], [new Date(`${MON}T12:00:00`)], cfg), [j]);
    const block = buildDayBlocks(lanes, MON, 8, 17)[0].blocks[0];
    expect(block.startTime).toBe('08:00');
    expect(block.endTime).toBe('17:00');
    expect(block.heightPct).toBe(100); // 8–17 fills the 8–17 axis
  });
});

describe('withDayWindows (shift-aware)', () => {
  it('resolves a shift card to its own per-day window', () => {
    const j = job({
      startDate: '2026-06-10T08:00:00', endDate: '2026-06-10T17:00:00',
      allocations: [{ id: 's1', name: 'Prep', memberIds: ['m1'], startDate: '2026-06-10', endDate: '2026-06-10',
        startTime: '08:00', endTime: '12:00', dailyHours: { '2026-06-10': { startTime: '09:00', endTime: '11:30' } } }],
    });
    const lanes = [{ crewId: 'm1', crewName: 'Ann', cardsByDay: {
      '2026-06-10': [{ jobId: 'j1', jobName: 'Repaint', jobNumber: 'J-1', color: '#000', startKey: '2026-06-10', endKey: '2026-06-10', isLocked: false, shiftId: 's1', shiftName: 'Prep', startTime: '08:00', endTime: '12:00' }],
    } }] as any;
    const out = withDayWindows(lanes, [j]);
    expect(out[0].cardsByDay['2026-06-10'][0]).toMatchObject({ startTime: '09:00', endTime: '11:30' });
  });
});

describe('setJobDayWindow', () => {
  it('writes the day window into dailyHours without mutating the input', () => {
    const j = job();
    const next = setJobDayWindow(j, DAY, { startTime: '09:30', endTime: '15:30' });
    expect(next).not.toBe(j);
    expect(j.dailyHours).toBeUndefined();
    expect(next.dailyHours?.[DAY]).toEqual({ startTime: '09:30', endTime: '15:30' });
  });

  it('leaves other days untouched', () => {
    const j = job({ dailyHours: { '2026-06-11': { startTime: '08:00', endTime: '12:00' } } });
    const next = setJobDayWindow(j, DAY, { startTime: '10:00', endTime: '14:00' });
    expect(next.dailyHours?.['2026-06-11']).toEqual({ startTime: '08:00', endTime: '12:00' });
    expect(next.dailyHours?.[DAY]).toEqual({ startTime: '10:00', endTime: '14:00' });
  });
});

describe('shiftDayWindow', () => {
  it('shifts both ends by the snapped delta, preserving duration', () => {
    const r = shiftDayWindow({ startTime: '10:00', endTime: '14:00' }, 1, 8, 17); // +1h
    expect(r).toEqual({ startTime: '11:00', endTime: '15:00' });
  });

  it('snaps to 15-minute increments', () => {
    const r = shiftDayWindow({ startTime: '10:00', endTime: '12:00' }, 0.2, 8, 17); // 0.2h -> 15min
    expect(r).toEqual({ startTime: '10:15', endTime: '12:15' });
  });

  it('clamps so the block stays within the axis', () => {
    const r = shiftDayWindow({ startTime: '08:00', endTime: '12:00' }, -2, 8, 17); // can't go before 8
    expect(r).toEqual({ startTime: '08:00', endTime: '12:00' });
  });

  it('clamps at the bottom edge', () => {
    const r = shiftDayWindow({ startTime: '14:00', endTime: '17:00' }, 5, 8, 17);
    expect(r).toEqual({ startTime: '14:00', endTime: '17:00' });
  });
});

describe('splitBlockAroundBreaks', () => {
  // Axis 0–24, span 24 → each hour = 100/24 ≈ 4.1667%.
  const pct = (h: number) => (h / 24) * 100;
  const round = (n: number) => Math.round(n * 1000) / 1000;
  const seg = (s: number, e: number) => ({ topPct: round(pct(s)), heightPct: round(pct(e - s)) });
  const norm = (segs: { topPct: number; heightPct: number }[]) =>
    segs.map(x => ({ topPct: round(x.topPct), heightPct: round(x.heightPct) }));

  it('returns one full segment when no break overlaps', () => {
    expect(norm(splitBlockAroundBreaks(8, 17, [], 0, 24))).toEqual([seg(8, 17)]);
  });

  it('returns one full segment when the break is outside the window', () => {
    const breaks = [{ startTime: '19:00', durationMinutes: 30 }];
    expect(norm(splitBlockAroundBreaks(8, 17, breaks, 0, 24))).toEqual([seg(8, 17)]);
  });

  it('splits into two segments around a mid-window break', () => {
    const breaks = [{ startTime: '12:00', durationMinutes: 30 }];
    expect(norm(splitBlockAroundBreaks(8, 17, breaks, 0, 24))).toEqual([seg(8, 12), seg(12.5, 17)]);
  });

  it('trims the start when a break overlaps the leading edge', () => {
    const breaks = [{ startTime: '08:00', durationMinutes: 30 }];
    expect(norm(splitBlockAroundBreaks(8, 17, breaks, 0, 24))).toEqual([seg(8.5, 17)]);
  });

  it('trims the end when a break overlaps the trailing edge', () => {
    const breaks = [{ startTime: '16:45', durationMinutes: 30 }]; // 16.75–17.25, clamped to 17
    expect(norm(splitBlockAroundBreaks(8, 17, breaks, 0, 24))).toEqual([seg(8, 16.75)]);
  });

  it('produces three segments for two interior breaks', () => {
    const breaks = [
      { startTime: '10:00', durationMinutes: 30 },
      { startTime: '12:00', durationMinutes: 60 },
    ];
    expect(norm(splitBlockAroundBreaks(8, 17, breaks, 0, 24))).toEqual([seg(8, 10), seg(10.5, 12), seg(13, 17)]);
  });

  it('returns no segments when a break covers the whole window', () => {
    const breaks = [{ startTime: '08:00', durationMinutes: 600 }]; // 8–18 covers 8–17
    expect(splitBlockAroundBreaks(8, 17, breaks, 0, 24)).toEqual([]);
  });
});
