import { describe, it, expect } from 'vitest';
import { upsertAllocation, removeAllocation, newShift, ensureJobAllocations, setAllocSpan, setAllocDayWindow, moveAllocation, moveJobDays, normalizeAlloc, splitPinnedPast } from './shifts';
import type { Job, JobCrewAllocation } from '../types';

const job = (over: Partial<Job> = {}): Job => ({
  id: 'j1', jobNumber: 'J-1', name: 'Ext', clientId: 'c1', estimateId: 'e1',
  address: 'x', stage: 'Scheduled', startDate: '2026-06-08T08:00:00', endDate: '2026-06-08T17:00:00',
  dateCreated: '2026-01-01', ...over,
} as Job);

const shift = (over: Partial<JobCrewAllocation> = {}): JobCrewAllocation => ({
  id: 'prep', name: 'Prep', memberIds: ['m1'], startDate: '2026-06-08', endDate: '2026-06-09',
  startTime: '08:00', endTime: '12:00', ...over,
});

describe('upsertAllocation', () => {
  it('adds a new shift and recomputes envelope + crewMemberIds', () => {
    const out = upsertAllocation(job({ allocations: [] }), shift());
    expect(out.allocations!.map(a => a.id)).toEqual(['prep']);
    expect(out.crewMemberIds).toEqual(['m1']);
    expect(out.startDate).toBe('2026-06-08T08:00:00');
    expect(out.endDate).toBe('2026-06-09T12:00:00'); // envelope covers the shift
  });

  it('replaces an existing shift by id, leaving others intact', () => {
    const base = job({ allocations: [shift(), shift({ id: 'finish', name: 'Finish', memberIds: ['m2'] })] });
    const out = upsertAllocation(base, shift({ memberIds: ['m1', 'm3'], endDate: '2026-06-08' }));
    expect(out.allocations!.find(a => a.id === 'prep')!.memberIds).toEqual(['m1', 'm3']);
    expect(out.allocations!.find(a => a.id === 'finish')!.memberIds).toEqual(['m2']);
    expect(new Set(out.crewMemberIds)).toEqual(new Set(['m1', 'm3', 'm2']));
  });
});

describe('removeAllocation', () => {
  it('drops the shift and re-syncs crew + envelope', () => {
    const base = job({ allocations: [shift(), shift({ id: 'finish', memberIds: ['m2'], startDate: '2026-06-10', endDate: '2026-06-11', startTime: '13:00', endTime: '17:00' })] });
    const out = removeAllocation(base, 'finish');
    expect(out.allocations!.map(a => a.id)).toEqual(['prep']);
    expect(out.crewMemberIds).toEqual(['m1']);
    expect(out.endDate).toBe('2026-06-09T12:00:00');
  });
});

describe('newShift', () => {
  it('seeds a shift from the job span with default times', () => {
    const s = newShift('shift-2', job());
    expect(s).toMatchObject({ id: 'shift-2', memberIds: [], startDate: '2026-06-08', endDate: '2026-06-08', startTime: '08:00', endTime: '17:00' });
    expect(s.name.length).toBeGreaterThan(0);
  });
});

describe('ensureJobAllocations', () => {
  it('materializes a legacy crewMemberIds job into one "Crew" shift without moving the job dates', () => {
    const base = job({ crewMemberIds: ['cm-6', 'cm-3'], dailyHours: { '2026-06-08': { startTime: '08:00', endTime: '12:00' } } });
    const out = ensureJobAllocations(base);
    expect(out.allocations).toHaveLength(1);
    const a = out.allocations![0];
    expect(a).toMatchObject({ name: 'Crew', memberIds: ['cm-6', 'cm-3'], startDate: '2026-06-08', endDate: '2026-06-08' });
    expect(a.dailyHours).toEqual({ '2026-06-08': { startTime: '08:00', endTime: '12:00' } });
    // Job envelope untouched (materialization is display-only, not a reschedule).
    expect(out.startDate).toBe('2026-06-08T08:00:00');
    expect(out.endDate).toBe('2026-06-08T17:00:00');
  });

  it('leaves a job that already has allocations unchanged', () => {
    const base = job({ allocations: [shift()] });
    expect(ensureJobAllocations(base)).toEqual(base);
  });

  it('leaves an unscheduled job (no startDate) unchanged', () => {
    const base = job({ startDate: undefined, endDate: undefined, crewMemberIds: ['m1'] });
    expect(ensureJobAllocations(base)).toEqual(base);
  });
});

describe('setAllocSpan', () => {
  it('updates a shift date range and recomputes the envelope', () => {
    const base = job({ allocations: [shift()] });
    const out = setAllocSpan(base, 'prep', '2026-06-08', '2026-06-12');
    const a = out.allocations!.find(x => x.id === 'prep')!;
    expect([a.startDate, a.endDate]).toEqual(['2026-06-08', '2026-06-12']);
    expect(out.endDate).toBe('2026-06-12T12:00:00');
  });

  it('returns the job unchanged for an unknown shift id', () => {
    const base = job({ allocations: [shift()] });
    expect(setAllocSpan(base, 'nope', '2026-06-08', '2026-06-12')).toEqual(base);
  });
});

describe('setAllocDayWindow', () => {
  it('sets a per-day window override on the shift', () => {
    const base = job({ allocations: [shift()] });
    const out = setAllocDayWindow(base, 'prep', '2026-06-09', { startTime: '13:00', endTime: '17:00' });
    expect(out.allocations!.find(a => a.id === 'prep')!.dailyHours).toEqual({ '2026-06-09': { startTime: '13:00', endTime: '17:00' } });
  });
});

describe('moveAllocation', () => {
  const base = () => job({
    startDate: '2026-06-08T08:00:00', endDate: '2026-06-09T12:00:00',
    allocations: [shift({ startDate: '2026-06-08', endDate: '2026-06-09',
      dailyHours: { '2026-06-08': { startTime: '08:00', endTime: '12:00' } } })],
  });

  it('shifts the allocation span and re-keys dailyHours by the day delta', () => {
    const out = moveAllocation(base(), 'prep', '2026-06-11'); // +3 days
    const a = out.allocations!.find(x => x.id === 'prep')!;
    expect(a.startDate).toBe('2026-06-11');
    expect(a.endDate).toBe('2026-06-12');
    expect(a.dailyHours).toEqual({ '2026-06-11': { startTime: '08:00', endTime: '12:00' } });
  });

  it('recomputes the job envelope to cover the moved shift', () => {
    const out = moveAllocation(base(), 'prep', '2026-06-11');
    expect(out.startDate).toBe('2026-06-11T08:00:00');
    expect(out.endDate).toBe('2026-06-12T12:00:00');
  });

  it('returns the job unchanged for an unknown shift id', () => {
    const b = base();
    expect(moveAllocation(b, 'nope', '2026-06-11')).toBe(b);
  });
});

describe('normalizeAlloc', () => {
  const base: JobCrewAllocation = {
    id: 's1', name: 'Crew', memberIds: ['m1'],
    startDate: '2026-08-19', endDate: '2026-08-21',
    startTime: '08:00', endTime: '17:00',
  };

  it('leaves a shift with no skip list untouched', () => {
    expect(normalizeAlloc(base)).toEqual(base);
  });

  // A skipped boundary day would make recomputeJobEnvelope read the job's start time off
  // a day nobody works, and would start the board bar on a hole.
  it('trims the envelope inward past a skipped first day', () => {
    const n = normalizeAlloc({ ...base, skipDays: ['2026-08-19'] });
    expect(n.startDate).toBe('2026-08-20');
    expect(n.endDate).toBe('2026-08-21');
    expect(n.skipDays ?? []).toEqual([]);
  });

  it('trims the envelope inward past a skipped last day', () => {
    const n = normalizeAlloc({ ...base, skipDays: ['2026-08-21'] });
    expect(n.startDate).toBe('2026-08-19');
    expect(n.endDate).toBe('2026-08-20');
  });

  it('keeps an interior skip and drops out-of-range skips', () => {
    const n = normalizeAlloc({ ...base, skipDays: ['2026-08-20', '2026-08-30', '2026-08-01'] });
    expect(n.startDate).toBe('2026-08-19');
    expect(n.endDate).toBe('2026-08-21');
    expect(n.skipDays).toEqual(['2026-08-20']);
  });

  it('leaves an all-skipped shift dated but working nothing, rather than inventing a day', () => {
    const n = normalizeAlloc({ ...base, skipDays: ['2026-08-19', '2026-08-20', '2026-08-21'] });
    expect(n.startDate).toBe('2026-08-19');
    expect(n.endDate).toBe('2026-08-21');
    expect(n.skipDays).toEqual(['2026-08-19', '2026-08-20', '2026-08-21']);
  });

  it('is applied by upsertAllocation', () => {
    const out = upsertAllocation(job(), { ...base, skipDays: ['2026-08-19'] });
    expect(out.allocations![0].startDate).toBe('2026-08-20');
  });
});

describe('moveAllocation with skipped days', () => {
  const withSkip = job({
    startDate: '2026-08-19T08:00:00', endDate: '2026-08-21T17:00:00',
    allocations: [{
      id: 's1', name: 'Crew', memberIds: ['m1'],
      startDate: '2026-08-19', endDate: '2026-08-21',
      startTime: '08:00', endTime: '17:00',
      skipDays: ['2026-08-20'],
      dailyHours: { '2026-08-21': { startTime: '07:00', endTime: '12:00' } },
    }],
  });

  it('re-keys skipDays by the same delta as dailyHours', () => {
    const moved = moveAllocation(withSkip, 's1', '2026-08-26'); // +7 days
    const a = moved.allocations![0];
    expect(a.startDate).toBe('2026-08-26');
    expect(a.endDate).toBe('2026-08-28');
    expect(a.skipDays).toEqual(['2026-08-27']);
    expect(a.dailyHours).toEqual({ '2026-08-28': { startTime: '07:00', endTime: '12:00' } });
  });
});

describe('moveAllocation — granular hours move with the shift', () => {
  it('re-keys hoursAssignments by the same delta as the span', () => {
    const base = job({
      allocations: [shift({
        startDate: '2026-06-08', endDate: '2026-06-09',
        hoursAssignments: { m1: { '2026-06-08': 4, '2026-06-09': 4 } },
      })],
    });
    const out = moveAllocation(base, 'prep', '2026-06-15');
    const a = out.allocations![0];
    expect(a.startDate).toBe('2026-06-15');
    expect(a.endDate).toBe('2026-06-16');
    expect(a.hoursAssignments).toEqual({ m1: { '2026-06-15': 4, '2026-06-16': 4 } });
  });

  it('re-keys every member independently', () => {
    const base = job({
      allocations: [shift({
        startDate: '2026-06-08', endDate: '2026-06-09', memberIds: ['m1', 'm2'],
        hoursAssignments: { m1: { '2026-06-08': 4 }, m2: { '2026-06-09': 8 } },
      })],
    });
    const out = moveAllocation(base, 'prep', '2026-06-15');
    expect(out.allocations![0].hoursAssignments).toEqual({
      m1: { '2026-06-15': 4 }, m2: { '2026-06-16': 8 },
    });
  });

  it('leaves a shift with no granular hours untouched', () => {
    const out = moveAllocation(job({ allocations: [shift()] }), 'prep', '2026-06-15');
    expect(out.allocations![0].hoursAssignments).toBeUndefined();
    expect(out.allocations![0].startDate).toBe('2026-06-15');
  });
});

describe('splitPinnedPast', () => {
  // Mon 2026-08-17 … Wed 2026-08-19, 8h/day for m1. Weekends off.
  const WEEKENDS = [0, 6];
  const threeDay = (over: Partial<JobCrewAllocation> = {}): JobCrewAllocation => shift({
    id: 'a1', name: 'Crew', memberIds: ['m1'],
    startDate: '2026-08-17', endDate: '2026-08-19', startTime: '08:00', endTime: '17:00',
    hoursAssignments: { m1: { '2026-08-17': 8, '2026-08-18': 8, '2026-08-19': 8 } },
    ...over,
  });

  it('does not split when no day has elapsed', () => {
    const out = splitPinnedPast(threeDay(), '2026-08-17', WEEKENDS);
    expect(out.pinned).toBeUndefined();
    expect(out.moving).toEqual(threeDay());
  });

  it('pins the whole shift when every day has elapsed', () => {
    const out = splitPinnedPast(threeDay(), '2026-08-20', WEEKENDS);
    expect(out.moving).toBeUndefined();
    expect(out.pinned!.pinned).toBe(true);
    expect(out.pinned!.id).toBe('a1'); // nothing to split from, so it keeps its identity
    expect(out.pinned!.hoursAssignments).toEqual({
      m1: { '2026-08-17': 8, '2026-08-18': 8, '2026-08-19': 8 },
    });
  });

  it('splits into a frozen past shift and a moving remainder', () => {
    const out = splitPinnedPast(threeDay(), '2026-08-19', WEEKENDS);

    expect(out.pinned!.id).toBe('a1-worked');
    expect(out.pinned!.pinned).toBe(true);
    expect(out.pinned!.memberIds).toEqual(['m1']);
    expect(out.pinned!.startDate).toBe('2026-08-17');
    expect(out.pinned!.endDate).toBe('2026-08-18');
    expect(out.pinned!.hoursAssignments).toEqual({ m1: { '2026-08-17': 8, '2026-08-18': 8 } });

    expect(out.moving!.id).toBe('a1'); // the live shift keeps the original id
    expect(out.moving!.pinned).toBeUndefined();
    expect(out.moving!.startDate).toBe('2026-08-19');
    expect(out.moving!.endDate).toBe('2026-08-19');
    expect(out.moving!.hoursAssignments).toEqual({ m1: { '2026-08-19': 8 } });
  });

  it('partitions hours without duplicating or losing any', () => {
    const out = splitPinnedPast(threeDay(), '2026-08-19', WEEKENDS);
    const sum = (a?: JobCrewAllocation) =>
      Object.values(a?.hoursAssignments?.m1 ?? {}).reduce((s, h) => s + h, 0);
    expect(sum(out.pinned) + sum(out.moving)).toBe(24);
  });

  it('partitions per-day windows and skip days by the same boundary', () => {
    const out = splitPinnedPast(threeDay({
      startDate: '2026-08-17', endDate: '2026-08-21',
      skipDays: ['2026-08-18', '2026-08-20'],
      dailyHours: {
        '2026-08-17': { startTime: '08:00', endTime: '12:00' },
        '2026-08-21': { startTime: '13:00', endTime: '17:00' },
      },
    }), '2026-08-19', WEEKENDS);

    // Worked days are 17, 19, 21 (18 and 20 are skipped). With today = 19, only the 17th
    // has elapsed, so the pinned shift spans 17-17 and the moving one 19-21.
    expect(out.pinned!.startDate).toBe('2026-08-17');
    expect(out.pinned!.endDate).toBe('2026-08-17');
    expect(out.pinned!.dailyHours).toEqual({ '2026-08-17': { startTime: '08:00', endTime: '12:00' } });
    // Aug 18 sits outside the pinned span, so normalizeAlloc drops it rather than carrying a
    // skip day the shift can no longer reach.
    expect(out.pinned!.skipDays).toEqual([]);

    expect(out.moving!.startDate).toBe('2026-08-19');
    expect(out.moving!.dailyHours).toEqual({ '2026-08-21': { startTime: '13:00', endTime: '17:00' } });
    expect(out.moving!.skipDays).toEqual(['2026-08-20']); // inside 19-21, so it survives
  });

  it('ignores skipped days when deciding what has elapsed', () => {
    // Mon 17 is skipped, so the earliest WORKED day is Tue 18. With today = Tue 18, nothing
    // has actually been worked yet, so there is nothing to pin — even though the shift's raw
    // span starts before today. Reading the span instead of the worked days would wrongly
    // freeze a day nobody worked.
    const out = splitPinnedPast(threeDay({ skipDays: ['2026-08-17'] }), '2026-08-18', WEEKENDS);
    expect(out.pinned).toBeUndefined();
    // Nothing was split, so the shift comes back untouched — normalizing it here would be a
    // surprise side effect on the path that does no work.
    expect(out.moving!.startDate).toBe('2026-08-17');
    expect(out.moving!.skipDays).toEqual(['2026-08-17']);
  });

  it('treats an undated shift as nothing to split', () => {
    const out = splitPinnedPast(
      shift({ startDate: '', endDate: '' }) as JobCrewAllocation, '2026-08-19', WEEKENDS,
    );
    expect(out.pinned).toBeUndefined();
    expect(out.moving).toBeDefined();
  });
});

describe('moveAllocation — per-member window overrides move with the shift', () => {
  it('re-keys memberDailyWindows by the same delta as the span', () => {
    const base = job({
      allocations: [shift({
        startDate: '2026-06-08', endDate: '2026-06-09',
        memberDailyWindows: { m1: { '2026-06-09': { startTime: '09:00', endTime: '13:00' } } },
      })],
    });
    const out = moveAllocation(base, 'prep', '2026-06-15');
    expect(out.allocations![0].memberDailyWindows).toEqual({
      m1: { '2026-06-16': { startTime: '09:00', endTime: '13:00' } },
    });
  });
});

describe('moveJobDays', () => {
  // Mon 8 Jun 2026 through Fri 12; the injected counter skips Sat/Sun.
  const advance = (startKey: string, days: number): string => {
    const d = new Date(`${startKey}T12:00:00`);
    const dir = days >= 0 ? 1 : -1;
    let left = Math.abs(days);
    while (left > 0) {
      d.setDate(d.getDate() + dir);
      if (d.getDay() !== 0 && d.getDay() !== 6) left--;
    }
    return d.toISOString().slice(0, 10);
  };
  const twoShifts = () => job({
    allocations: [
      shift({ id: 'prep', startDate: '2026-06-11', endDate: '2026-06-11' }),   // Thu
      shift({ id: 'paint', startDate: '2026-06-15', endDate: '2026-06-16' }),  // Mon–Tue
    ],
  });

  it('slides every shift by one calendar delta, keeping the gaps', () => {
    // +2 working days from Thu 11 lands on Mon 15: a 4-day calendar delta for both.
    const out = moveJobDays(twoShifts(), 2, advance);
    expect(out.allocations!.map(a => [a.startDate, a.endDate])).toEqual([
      ['2026-06-15', '2026-06-15'],
      ['2026-06-19', '2026-06-20'],
    ]);
  });

  it('moves backwards too', () => {
    // -2 working days from Thu 11 is Tue 9: a 2-day delta.
    const out = moveJobDays(twoShifts(), -2, advance);
    expect(out.allocations!.map(a => a.startDate)).toEqual(['2026-06-09', '2026-06-13']);
  });

  it('carries each shift\'s per-day hours and windows along', () => {
    const base = job({
      allocations: [shift({
        startDate: '2026-06-11', endDate: '2026-06-11',
        hoursAssignments: { m1: { '2026-06-11': 4 } },
        dailyHours: { '2026-06-11': { startTime: '08:00', endTime: '12:00' } },
      })],
    });
    const out = moveJobDays(base, 2, advance);
    expect(out.allocations![0].hoursAssignments).toEqual({ m1: { '2026-06-15': 4 } });
    expect(out.allocations![0].dailyHours).toEqual({ '2026-06-15': { startTime: '08:00', endTime: '12:00' } });
  });

  it('leaves worked shifts where they are and anchors on the first movable one', () => {
    const base = job({
      allocations: [
        shift({ id: 'done', startDate: '2026-06-08', endDate: '2026-06-08', pinned: true }),
        shift({ id: 'paint', startDate: '2026-06-11', endDate: '2026-06-11' }),
      ],
    });
    const out = moveJobDays(base, 2, advance);
    const byId = Object.fromEntries(out.allocations!.map(a => [a.id, a.startDate]));
    expect(byId.done).toBe('2026-06-08');
    // Anchored on Thu 11 (the first MOVABLE shift), +2 working days = Mon 15.
    expect(byId.paint).toBe('2026-06-15');
  });

  it('leaves out the shifts the caller skipped, anchoring on what still moves', () => {
    // Prep (Thu 11) sits out, so +2 working days is measured from Paint (Mon 15) and
    // lands it on Wed 17 — a 2-day delta, not the 4-day one Prep would have produced.
    const out = moveJobDays(twoShifts(), 2, advance, ['prep']);
    const byId = Object.fromEntries(out.allocations!.map(a => [a.id, a.startDate]));
    expect(byId.prep).toBe('2026-06-11');
    expect(byId.paint).toBe('2026-06-17');
  });

  it('returns the job untouched when every shift is skipped', () => {
    const base = twoShifts();
    expect(moveJobDays(base, 2, advance, ['prep', 'paint'])).toBe(base);
  });

  it('returns the job untouched with nothing movable, or no days to move', () => {
    const pinnedOnly = job({ allocations: [shift({ pinned: true })] });
    expect(moveJobDays(pinnedOnly, 3, advance)).toBe(pinnedOnly);
    const normal = twoShifts();
    expect(moveJobDays(normal, 0, advance)).toBe(normal);
    const undated = job({ allocations: [shift({ startDate: undefined, endDate: undefined })] });
    expect(moveJobDays(undated, 3, advance)).toBe(undated);
  });
});
