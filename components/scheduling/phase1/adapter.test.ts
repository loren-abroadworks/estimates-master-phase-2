import { describe, expect, it } from 'vitest';
import type { Job as AppJob, TeamMember } from '@/lib/types';
import { createInitialDatabase } from '@/lib/sampleData';
import { fromP1Job, fromP1Member, shiftsFromAllocations, toP1Job, toP1Member, toP1WorkOrder } from './adapter';
import { buildCrewHoursGrid, setMemberDayHours } from './services/crewHoursGrid';
import { buildJobLanes, buildMemberLanes } from './services/productionBoard';
import { moveAllocation } from './services/shifts';
import { configFromSettings } from './services/scheduleEngine';
import { DEFAULT_SCHEDULING } from './adapter';

const db = createInitialDatabase();
const jobs = db.collections.jobs;
const team = db.collections.team;
const workOrders = db.collections.workOrders;
const opts = { team, currentUserId: 'u_kevin', nonWorkingWeekdays: [0, 6] };

const job = (over: Partial<AppJob> = {}): AppJob => ({
  id: 'J1', jobNumber: 'JOB-1', title: 'Smith interior', customerId: 'C1', address: '1 Main St', status: 'Scheduled',
  startDate: '2026-10-05', endDate: '2026-10-07', startTime: '08:00', endTime: '16:00', estimatedHours: 40, value: 0,
  crew: [{ memberId: 'u_mike', role: 'Crew Lead', hours: 24 }, { memberId: 'u_luis', role: 'Painter', hours: 24 }],
  breaks: [], notes: [], history: [], createdAt: '2026-09-01', ...over,
});

describe('phase-1 scheduling adapter', () => {
  it('reads every sample job without throwing and keeps its dates', () => {
    for (const j of jobs) {
      const p1 = toP1Job(j, workOrders, team);
      expect(p1.startDate).toBe(j.startDate);
      if (j.startDate) expect(p1.allocations?.length).toBeGreaterThan(0);
    }
  });

  it('a job with crew but no shifts becomes one Crew shift spanning its dates', () => {
    const p1 = toP1Job(job(), workOrders, team);
    expect(p1.allocations).toHaveLength(1);
    expect(p1.allocations![0]).toMatchObject({ startDate: '2026-10-05', endDate: '2026-10-07', startTime: '08:00', endTime: '16:00', memberIds: ['u_mike', 'u_luis'] });
  });

  it('writing back derives shifts and dated crew hours, keeping roles', () => {
    const prev = job();
    const patch = fromP1Job(toP1Job(prev, workOrders, team), prev, opts);
    expect(patch.shifts).toHaveLength(1);
    expect(patch.startDate).toBe('2026-10-05');
    expect(patch.endDate).toBe('2026-10-07');
    const mike = patch.crew!.filter((c) => c.memberId === 'u_mike');
    expect(mike.map((c) => c.date)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07']);
    expect(mike.every((c) => c.hours === 8 && c.role === 'Crew Lead')).toBe(true);
    expect(patch.status).toBe('Scheduled');
  });

  it('saved allocations are used while they still match the shifts, and dropped when the shifts change elsewhere', () => {
    const prev = job();
    const p1 = setMemberDayHours(toP1Job(prev, workOrders, team), 'u_luis', '2026-10-06', 4);
    const saved = { ...prev, ...fromP1Job(p1, prev, opts) } as AppJob;
    expect(toP1Job(saved, workOrders, team).allocations![0]!.hoursAssignments?.u_luis?.['2026-10-06']).toBe(4);
    expect(saved.crew.find((c) => c.memberId === 'u_luis' && c.date === '2026-10-06')?.hours).toBe(4);

    // The job page moves the shift: the stale allocations are ignored.
    const moved = { ...saved, shifts: saved.shifts!.map((s) => ({ ...s, startDate: '2026-10-12', endDate: '2026-10-14' })), startDate: '2026-10-12', endDate: '2026-10-14' };
    expect(toP1Job(moved, workOrders, team).allocations![0]!.startDate).toBe('2026-10-12');
  });

  it('moving a shift on the board moves the app dates and crew days', () => {
    const prev = job();
    const p1 = toP1Job(prev, workOrders, team);
    const movedP1 = moveAllocation(p1, p1.allocations![0]!.id, '2026-10-12');
    const patch = fromP1Job(movedP1, prev, opts);
    expect(patch.startDate).toBe('2026-10-12');
    expect(patch.crew!.every((c) => !c.date || c.date >= '2026-10-12')).toBe(true);
  });

  it('skip days round-trip as excluded days on app shifts', () => {
    const shifts = shiftsFromAllocations([{ id: 'S', name: 'Prep', memberIds: ['u_mike'], startDate: '2026-10-05', endDate: '2026-10-09', startTime: '08:00', endTime: '16:00', skipDays: ['2026-10-07'] }]);
    expect(shifts[0]!.dailyHours).toEqual({ '2026-10-07': null });
    const back = toP1Job(job({ shifts }), workOrders, team);
    expect(back.allocations![0]!.skipDays).toEqual(['2026-10-07']);
  });

  it('unscheduling clears dates and moves the job back to Unscheduled', () => {
    const prev = job();
    const p1 = { ...toP1Job(prev, workOrders, team), startDate: undefined, endDate: undefined, allocations: [] };
    const patch = fromP1Job(p1, prev, opts);
    expect(patch.startDate).toBeUndefined();
    expect(patch.status).toBe('Unscheduled');
  });

  it('member availability: time off reads as off days, and only edits that differ are stored', () => {
    const m = { ...team.find((t) => t.id === 'u_mike')!, timeOff: [{ id: 'T', startDate: '2026-10-08', endDate: '2026-10-08', reason: 'Dentist' }] } as TeamMember;
    const p1 = toP1Member(m, '2026-10-01');
    expect(p1.schedule?.['2026-10-08']).toMatchObject({ isOff: true, reason: 'Dentist' });
    expect(fromP1Member(p1, m, '2026-10-01').daySchedule).toBeUndefined();
    const edited = { ...p1, schedule: { ...p1.schedule, '2026-10-09': { date: '2026-10-09', startTime: '10:00', endTime: '14:00', isOff: false } } };
    expect(fromP1Member(edited, m, '2026-10-01').daySchedule).toEqual({ '2026-10-09': { date: '2026-10-09', startTime: '10:00', endTime: '14:00', isOff: false } });
  });

  it('the board builders run on the adapted sample data', () => {
    const p1Jobs = jobs.map((j) => toP1Job(j, workOrders, team));
    const staff = team.filter((t) => t.isCrew).map((t) => toP1Member(t));
    const p1Wos = jobs.map((j) => toP1WorkOrder(j, workOrders, ''));
    const week = ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'].map((k) => new Date(`${k}T12:00:00`));
    const cfg = configFromSettings(DEFAULT_SCHEDULING, false);
    expect(() => buildJobLanes(p1Jobs, week, cfg)).not.toThrow();
    expect(() => buildMemberLanes(p1Jobs, staff, week, cfg)).not.toThrow();
    expect(() => buildCrewHoursGrid(staff, p1Jobs, p1Wos, week, [0, 6], 9, [])).not.toThrow();
  });
});
