import { describe, it, expect } from 'vitest';
import { buildMemberLanes, buildJobLanes, layoutLaneBars, jobColor, visibleWeekDays, jobDayWindow, withStagedWindow, fmtClock, boardShifts, shiftCardHours, BoardLane, BoardCard } from './productionBoard';
import { configFromSettings } from './scheduleEngine';
import type { Job, CrewMember } from '../types';

const cfg = configFromSettings(undefined, false);

describe('visibleWeekDays', () => {
  // Sun May 31 -> Sat Jun 6 2026.
  const fullWeek = ['2026-05-31','2026-06-01','2026-06-02','2026-06-03','2026-06-04','2026-06-05','2026-06-06']
    .map(k => new Date(`${k}T12:00:00`));

  it('drops Sun & Sat when they are non-working (default config)', () => {
    const visible = visibleWeekDays(fullWeek, cfg).map(d => d.getDate());
    expect(visible).toEqual([1, 2, 3, 4, 5]); // Mon..Fri
  });

  it('keeps every day when no weekdays are non-working', () => {
    expect(visibleWeekDays(fullWeek, { ...cfg, weekendDays: [] })).toHaveLength(7);
  });

  it('falls back to the full week if every day is non-working', () => {
    expect(visibleWeekDays(fullWeek, { ...cfg, weekendDays: [0,1,2,3,4,5,6] })).toHaveLength(7);
  });
});

const weekDays = ['2026-06-01','2026-06-02','2026-06-03','2026-06-04','2026-06-05']
  .map(k => new Date(`${k}T12:00:00`));

const job = (over: Partial<Job>): Job => ({
  id: 'j1', jobNumber: 'J-1', name: 'Job 1', stage: 'Scheduled',
  startDate: '2026-06-02T08:00:00', endDate: '2026-06-02T17:00:00',
  ...over,
} as Job);


describe('boardShifts', () => {
  it('yields one card per shift, tinted and spanned by the shift', () => {
    const j = job({
      id: 'j', name: 'Repaint', startDate: '2026-06-01T08:00:00', endDate: '2026-06-03T17:00:00',
      allocations: [
        { id: 's1', name: 'Prep', memberIds: ['m1'], startDate: '2026-06-01', endDate: '2026-06-01', startTime: '08:00', endTime: '12:00', color: '#123456' },
        { id: 's2', name: 'Finish', memberIds: ['m1', 'm2'], startDate: '2026-06-02', endDate: '2026-06-03', startTime: '13:00', endTime: '17:00' },
      ],
    });
    const shifts = boardShifts(j);
    expect(shifts).toHaveLength(2);
    expect(shifts[0].card).toMatchObject({ shiftId: 's1', shiftName: 'Prep', color: '#123456', startKey: '2026-06-01', endKey: '2026-06-01', startTime: '08:00', endTime: '12:00' });
    expect(shifts[0].memberIds).toEqual(['m1']);
    expect(shifts[1].card).toMatchObject({ shiftId: 's2', shiftName: 'Finish', startKey: '2026-06-02', endKey: '2026-06-03', startTime: '13:00', endTime: '17:00' });
    expect(shifts[1].memberIds).toEqual(['m1', 'm2']);
    // The card itself carries its crew so the board can render avatars on the bar.
    expect(shifts[0].card.memberIds).toEqual(['m1']);
    expect(shifts[1].card.memberIds).toEqual(['m1', 'm2']);
  });

  it('falls back to a single job-spanning card with no shift identity for legacy jobs', () => {
    const j = job({ id: 'j', crewMemberIds: ['m1'], startDate: '2026-06-01T08:00:00', endDate: '2026-06-02T17:00:00' });
    const shifts = boardShifts(j);
    expect(shifts).toHaveLength(1);
    expect(shifts[0].card.shiftId).toBeUndefined();
    expect(shifts[0].card.shiftName).toBeUndefined();
    expect(shifts[0].memberIds).toEqual(['m1']);
    expect(shifts[0].card.memberIds).toEqual(['m1']);
  });

  it('skips shifts with no start date', () => {
    const j = job({ id: 'j', startDate: '2026-06-01T08:00:00', endDate: '2026-06-01T17:00:00',
      allocations: [{ id: 's1', name: 'Prep', memberIds: ['m1'], startDate: '', endDate: '', startTime: '08:00', endTime: '12:00' }] });
    expect(boardShifts(j)).toHaveLength(0);
  });
});

describe('shiftCardHours', () => {
  it('uses the shift start-day start and end-day end, honoring per-day overrides', () => {
    const alloc = { id: 's', name: 'x', memberIds: [], startDate: '2026-06-01', endDate: '2026-06-03',
      startTime: '08:00', endTime: '17:00', dailyHours: { '2026-06-03': { startTime: '09:00', endTime: '15:00' } } };
    expect(shiftCardHours(alloc)).toEqual({ startTime: '08:00', endTime: '15:00' });
  });
});

describe('jobColor', () => {
  it('returns the same hex value for the same id (stable)', () => {
    expect(jobColor('x')).toBe(jobColor('x'));
  });

  it('returns a valid palette hex color', () => {
    expect(jobColor('x')).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('jobDayWindow', () => {
  const job = { id: 'j1', startDate: '2026-06-08T08:00:00', endDate: '2026-06-10T17:00:00' } as Job;

  it('falls back to the job start/end clock when there is no per-day override', () => {
    expect(jobDayWindow(job, '2026-06-09')).toEqual({ startTime: '08:00', endTime: '17:00' });
  });

  it('honors a per-day dailyHours override', () => {
    const withOverride = { ...job, dailyHours: { '2026-06-09': { startTime: '10:00', endTime: '14:30' } } } as Job;
    expect(jobDayWindow(withOverride, '2026-06-09')).toEqual({ startTime: '10:00', endTime: '14:30' });
  });

  it('returns null for an unscheduled job', () => {
    expect(jobDayWindow({ id: 'j2' } as Job, '2026-06-09')).toBeNull();
  });
});

describe('withStagedWindow', () => {
  const job = {
    id: 'j1',
    startDate: '2026-06-08T08:00:00',
    endDate: '2026-06-10T17:00:00',
    dailyHours: {
      '2026-06-08': { startTime: '08:00', endTime: '17:00' },
      '2026-06-09': { startTime: '08:00', endTime: '17:00' },
      '2026-06-10': { startTime: '08:00', endTime: '17:00' },
    },
  } as unknown as Job;

  it('moves the job and carries the change\'s per-day windows so each day reads its own hours', () => {
    // A time-shift of the first day re-flows the window: Mon 12-5, others 8-5.
    const change = {
      newStart: '2026-06-08T12:00:00',
      newEnd: '2026-06-10T17:00:00',
      dailyHours: {
        '2026-06-08': { startTime: '12:00', endTime: '17:00' },
        '2026-06-09': { startTime: '08:00', endTime: '17:00' },
        '2026-06-10': { startTime: '08:00', endTime: '17:00' },
      },
    };
    const moved = withStagedWindow(job, change);
    expect(moved.startDate).toBe('2026-06-08T12:00:00');
    expect(jobDayWindow(moved, '2026-06-08')).toEqual({ startTime: '12:00', endTime: '17:00' });
    expect(jobDayWindow(moved, '2026-06-09')).toEqual({ startTime: '08:00', endTime: '17:00' });
  });

  it('lets live per-day edits override the staged change windows', () => {
    const change = { newStart: '2026-06-08T08:00:00', newEnd: '2026-06-10T17:00:00', dailyHours: job.dailyHours };
    // The user edited only Tue Jun 9 to start at noon.
    const edits = { '2026-06-09': { startTime: '12:00', endTime: '17:00' } };
    const moved = withStagedWindow(job, change, edits);
    expect(jobDayWindow(moved, '2026-06-09')).toEqual({ startTime: '12:00', endTime: '17:00' });
    expect(jobDayWindow(moved, '2026-06-08')).toEqual({ startTime: '08:00', endTime: '17:00' });
  });

  it('falls back to start when the change has no end', () => {
    const moved = withStagedWindow(job, { newStart: '2026-06-08T08:00:00', newEnd: null });
    expect(moved.endDate).toBe('2026-06-08T08:00:00');
  });
});

describe('fmtClock', () => {
  it('formats 24-hour HH:mm as a 12-hour clock', () => {
    expect(fmtClock('08:00')).toBe('8:00 AM');
    expect(fmtClock('17:30')).toBe('5:30 PM');
    expect(fmtClock('00:15')).toBe('12:15 AM');
    expect(fmtClock('12:00')).toBe('12:00 PM');
  });
});

const staff = [
  { id: 'm1', name: 'Alice', role: 'Lead' },
  { id: 'm2', name: 'Bob', role: 'Painter' },
] as CrewMember[];

describe('buildMemberLanes', () => {
  it('seeds a lane per staff member in input order', () => {
    const lanes = buildMemberLanes([], staff, weekDays, cfg);
    expect(lanes.map(l => l.crewId)).toEqual(['m1', 'm2']);
  });

  it('places a job in every assigned member lane (multi-member duplication)', () => {
    const j = job({ id: 'jA', name: 'Repaint', crewMemberIds: ['m1', 'm2'] });
    const lanes = buildMemberLanes([j], staff, weekDays, cfg);
    expect(lanes.find(l => l.crewId === 'm1')!.cardsByDay['2026-06-02'][0].jobId).toBe('jA');
    expect(lanes.find(l => l.crewId === 'm2')!.cardsByDay['2026-06-02'][0].jobId).toBe('jA');
  });

  it('omits a job with no resolvable member (no Unassigned lane)', () => {
    const j = job({ id: 'jU', crewMemberIds: [] });
    const lanes = buildMemberLanes([j], staff, weekDays, cfg);
    expect(lanes.find(l => l.crewId === 'unassigned')).toBeUndefined();
    const appears = lanes.some(l => Object.values(l.cardsByDay).some(cs => cs.some(c => c.jobId === 'jU')));
    expect(appears).toBe(false);
  });

  it('flags members with no work this week as available and groups them after busy members', () => {
    const j = job({ id: 'jA', crewMemberIds: ['m2'] });
    const lanes = buildMemberLanes([j], staff, weekDays, cfg);
    expect(lanes.map(l => l.crewId)).toEqual(['m2', 'm1']); // busy first, available last
    expect(lanes.find(l => l.crewId === 'm2')!.available).toBeUndefined();
    expect(lanes.find(l => l.crewId === 'm1')!.available).toBe(true);
  });

  it('places allocation members per shift and ignores stale crewMemberIds when shifts exist', () => {
    // Shift-native: each shift places its own members; crewMemberIds is only the
    // legacy (no-allocations) fallback. A member present only in a stale
    // crewMemberIds (in no shift) gets no bar.
    const j = job({ id: 'jX', crewMemberIds: ['m1'], allocations: [{ id: 'a', name: 'x', memberIds: ['m2'], startDate: '2026-06-02', endDate: '2026-06-02', startTime: '08:00', endTime: '17:00' }] });
    const lanes = buildMemberLanes([j], staff, weekDays, cfg);
    expect(lanes.find(l => l.crewId === 'm2')!.cardsByDay['2026-06-02']).toHaveLength(1);
    expect(lanes.find(l => l.crewId === 'm1')!.available).toBe(true);
  });

  it('seeds only active members (inactive with no work gets no lane)', () => {
    const withInactive = [...staff, { id: 'm3', name: 'Cara', status: 'Inactive' }] as CrewMember[];
    const lanes = buildMemberLanes([], withInactive, weekDays, cfg);
    expect(lanes.map(l => l.crewId)).toEqual(['m1', 'm2']);
  });

  it('names an inactive assignee in their own lane, flagged inactive, not Unassigned', () => {
    const withInactive = [...staff, { id: 'm3', name: 'Cara', status: 'Inactive' }] as CrewMember[];
    const j = job({ id: 'jI', crewMemberIds: ['m3'] });
    const lanes = buildMemberLanes([j], withInactive, weekDays, cfg);
    const lane = lanes.find(l => l.crewId === 'm3')!;
    expect(lane.crewName).toBe('Cara');
    expect(lane.inactive).toBe(true);
    expect(lane.cardsByDay['2026-06-02'][0].jobId).toBe('jI');
    expect(lanes.find(l => l.crewId === 'unassigned')).toBeUndefined();
  });
});

describe('shift-aware lanes', () => {
  const multiShift = job({
    id: 'j', name: 'Repaint',
    startDate: '2026-06-01T08:00:00', endDate: '2026-06-02T17:00:00',
    allocations: [
      { id: 's1', name: 'Prep', memberIds: ['m1'], startDate: '2026-06-01', endDate: '2026-06-01', startTime: '08:00', endTime: '12:00' },
      { id: 's2', name: 'Finish', memberIds: ['m2'], startDate: '2026-06-02', endDate: '2026-06-02', startTime: '13:00', endTime: '17:00' },
    ],
  });

  it('places each shift only in the lanes of its own members (member view)', () => {
    const lanes = buildMemberLanes([multiShift], staff, weekDays, cfg);
    const m1 = lanes.find(l => l.crewId === 'm1')!;
    const m2 = lanes.find(l => l.crewId === 'm2')!;
    expect(m1.cardsByDay['2026-06-01']?.map(c => c.shiftId)).toEqual(['s1']);
    expect(m1.cardsByDay['2026-06-02']).toBeUndefined(); // m1 not in the Finish shift
    expect(m2.cardsByDay['2026-06-02']?.map(c => c.shiftId)).toEqual(['s2']);
  });

  it('emits one card per shift on the job lane (job view)', () => {
    const [lane] = buildJobLanes([multiShift], weekDays, cfg);
    expect(lane.cardsByDay['2026-06-01'].map(c => c.shiftId)).toEqual(['s1']);
    expect(lane.cardsByDay['2026-06-02'].map(c => c.shiftId)).toEqual(['s2']);
  });
});

describe('buildJobLanes', () => {
  it('creates one lane per occupying job, ordered by start day then name', () => {
    const a = job({ id: 'a', name: 'Zebra', startDate: '2026-06-01T08:00:00', endDate: '2026-06-01T17:00:00' });
    const b = job({ id: 'b', name: 'Alpha', startDate: '2026-06-02T08:00:00', endDate: '2026-06-02T17:00:00' });
    const lanes = buildJobLanes([b, a], weekDays, cfg);
    expect(lanes.map(l => l.crewName)).toEqual(['Zebra', 'Alpha']);
    expect(lanes[0].cardsByDay['2026-06-01'][0].jobId).toBe('a');
  });

  it('excludes jobs that do not occupy any visible day and Completed jobs', () => {
    const offWeek = job({ id: 'off', startDate: '2026-07-01T08:00:00', endDate: '2026-07-01T17:00:00' });
    const done = job({ id: 'done', stage: 'Completed' });
    expect(buildJobLanes([offWeek, done], weekDays, cfg)).toHaveLength(0);
  });
});

describe('layoutLaneBars', () => {
  const keys = ['2026-06-01','2026-06-02','2026-06-03','2026-06-04','2026-06-05'];
  const lane = (cards: Record<string, { jobId: string; jobName?: string }[]>) =>
    ({ crewId: 'L', crewName: 'L', cardsByDay: Object.fromEntries(
      Object.entries(cards).map(([k, cs]) => [k, cs.map(c => ({
        jobId: c.jobId, jobName: c.jobName ?? c.jobId, jobNumber: 'n', color: '#000',
        startKey: k, endKey: k, isLocked: false,
      }))]),
    ) } as any);

  it('spans a job from its first to last occupied day', () => {
    const l = lane({ '2026-06-02': [{ jobId: 'a' }], '2026-06-03': [{ jobId: 'a' }], '2026-06-04': [{ jobId: 'a' }] });
    const { bars, trackCount } = layoutLaneBars(l, keys);
    expect(bars).toHaveLength(1);
    expect(bars[0]).toMatchObject({ startCol: 1, span: 3, track: 0 });
    expect(trackCount).toBe(1);
  });

  it('places two non-overlapping jobs on the same track', () => {
    const l = lane({ '2026-06-01': [{ jobId: 'a' }], '2026-06-03': [{ jobId: 'b' }] });
    const { bars, trackCount } = layoutLaneBars(l, keys);
    expect(trackCount).toBe(1);
    expect(bars.every(b => b.track === 0)).toBe(true);
  });

  it('stacks overlapping jobs on separate tracks', () => {
    const l = lane({
      '2026-06-01': [{ jobId: 'a' }], '2026-06-02': [{ jobId: 'a' }, { jobId: 'b' }], '2026-06-03': [{ jobId: 'b' }],
    });
    const { bars, trackCount } = layoutLaneBars(l, keys);
    expect(trackCount).toBe(2);
    const byId = Object.fromEntries(bars.map(b => [b.card.jobId, b]));
    expect(byId.a.track).toBe(0);
    expect(byId.b.track).toBe(1);
  });

  it('clamps a job to the days it occupies within the week', () => {
    const l = lane({ '2026-06-03': [{ jobId: 'a' }], '2026-06-04': [{ jobId: 'a' }] });
    expect(layoutLaneBars(l, keys).bars[0]).toMatchObject({ startCol: 2, span: 2 });
  });

  it('keeps two shifts of the same job as separate bars', () => {
    const l = {
      crewId: 'L', crewName: 'L', cardsByDay: {
        '2026-06-01': [{ jobId: 'a', jobName: 'A', jobNumber: 'n', color: '#000', startKey: '2026-06-01', endKey: '2026-06-01', isLocked: false, shiftId: 's1', shiftName: 'Prep', startTime: '08:00', endTime: '12:00' }],
        '2026-06-02': [{ jobId: 'a', jobName: 'A', jobNumber: 'n', color: '#000', startKey: '2026-06-02', endKey: '2026-06-02', isLocked: false, shiftId: 's2', shiftName: 'Finish', startTime: '13:00', endTime: '17:00' }],
      },
    } as any;
    const { bars } = layoutLaneBars(l, keys);
    expect(bars).toHaveLength(2);
    expect(bars.map(b => b.card.shiftId).sort()).toEqual(['s1', 's2']);
  });

  it('stacks two overlapping shifts of the same job on separate tracks', () => {
    const l = {
      crewId: 'L', crewName: 'L', cardsByDay: {
        '2026-06-01': [
          { jobId: 'a', jobName: 'A', jobNumber: 'n', color: '#000', startKey: '2026-06-01', endKey: '2026-06-01', isLocked: false, shiftId: 's1', shiftName: 'Prep', startTime: '08:00', endTime: '12:00' },
          { jobId: 'a', jobName: 'A', jobNumber: 'n', color: '#000', startKey: '2026-06-01', endKey: '2026-06-01', isLocked: false, shiftId: 's2', shiftName: 'Finish', startTime: '13:00', endTime: '17:00' },
        ],
      },
    } as any;
    expect(layoutLaneBars(l, keys).trackCount).toBe(2);
  });

  it('reports trackCount 0 for an empty lane', () => {
    expect(layoutLaneBars(lane({}), keys).trackCount).toBe(0);
  });
});

describe('boardShifts label noise', () => {
  it("a job's ONLY shift keeps its shiftId but no shiftName (label noise suppressed)", () => {
    const j = {
      id: 'solo', jobNumber: 'S', name: 'Solo', stage: 'Scheduled',
      startDate: '2026-06-01T08:00:00', endDate: '2026-06-01T17:00:00',
      allocations: [{ id: 'only', name: 'Crew', memberIds: ['m1'], startDate: '2026-06-01', endDate: '2026-06-01', startTime: '08:00', endTime: '17:00' }],
    } as unknown as Job;
    const [one] = boardShifts(j);
    expect(one.card.shiftId).toBe('only');
    expect(one.card.shiftName).toBeUndefined();
  });
});

describe('boardShifts with skipped days', () => {
  const skipJob: Job = {
    id: 'j1', jobNumber: 'J-1', name: 'Deck', clientId: 'c1', estimateId: 'e1',
    address: 'x', stage: 'Scheduled', dateCreated: '2026-08-01',
    startDate: '2026-08-19T08:00:00', endDate: '2026-08-21T17:00:00',
    allocations: [{
      id: 's1', name: 'Crew', memberIds: ['m1'],
      startDate: '2026-08-19', endDate: '2026-08-21',
      startTime: '08:00', endTime: '17:00',
      skipDays: ['2026-08-20'],
    }],
  } as Job;

  it('carries the shift skip list onto the card', () => {
    expect(boardShifts(skipJob)[0].card.skipDays).toEqual(['2026-08-20']);
  });

  it('leaves skipDays off a card whose shift skips nothing', () => {
    const plain = { ...skipJob, allocations: [{ ...skipJob.allocations![0], skipDays: [] }] } as Job;
    expect(boardShifts(plain)[0].card.skipDays).toBeUndefined();
  });

  it('places cards either side of the skipped day and none on it', () => {
    // Signature is buildMemberLanes(jobs, staff, weekDays: Date[], config) — the third
    // argument is Date objects, NOT day keys. Aug 19-21 2026 are Wed/Thu/Fri, so weekend
    // filtering cannot confound this: the only reason the 20th is empty is the skip.
    const member: CrewMember = { id: 'm1', name: 'Mike', role: 'Painter' };
    const days = [new Date(2026, 7, 19), new Date(2026, 7, 20), new Date(2026, 7, 21)];
    const lanes = buildMemberLanes([skipJob], [member], days, cfg);
    const byDay = lanes[0].cardsByDay;
    expect(byDay['2026-08-19']?.length).toBe(1);
    expect(byDay['2026-08-20'] ?? []).toEqual([]);
    expect(byDay['2026-08-21']?.length).toBe(1);
  });
});

describe('layoutLaneBars across days a job does not work', () => {
  const dayKeys = ['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05'];
  const card = (over: Partial<BoardCard> = {}): BoardCard => ({
    jobId: 'j1', jobName: 'Deck', jobNumber: 'J-1', color: '#abc',
    startKey: '2026-06-01', endKey: '2026-06-05', isLocked: false,
    startTime: '08:00', endTime: '17:00', shiftId: 's1', ...over,
  } as BoardCard);

  it('keeps a contiguous run as a single bar', () => {
    const lane: BoardLane = {
      crewId: 'm1', crewName: 'Mike',
      cardsByDay: { '2026-06-01': [card()], '2026-06-02': [card()], '2026-06-03': [card()] },
    };
    const { bars } = layoutLaneBars(lane, dayKeys);
    expect(bars).toHaveLength(1);
    expect([bars[0].startCol, bars[0].span]).toEqual([0, 3]);
  });

  it('splits into one bar per run when a middle day is not worked', () => {
    const lane: BoardLane = {
      crewId: 'm1', crewName: 'Mike',
      cardsByDay: { '2026-06-01': [card()], '2026-06-02': [card()], '2026-06-04': [card()] },
    };
    const { bars } = layoutLaneBars(lane, dayKeys);
    expect(bars.map(b => [b.startCol, b.span])).toEqual([[0, 2], [3, 1]]);
    // Both runs belong to the same shift, so they share one track (one visual row).
    expect(bars.every(b => b.track === 0)).toBe(true);
  });
});
