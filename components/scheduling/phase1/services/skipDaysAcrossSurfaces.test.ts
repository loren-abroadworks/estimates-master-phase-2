import { describe, it, expect } from 'vitest';
import { upsertAllocation } from './shifts';
import { configFromSettings } from './scheduleEngine';
import { boardShifts, buildMemberLanes } from './productionBoard';
import { committedHoursOnDay } from './crewWeeklyHours';
import { memberShiftDayHours } from './crewHoursGrid';
import { jobActualSchedule } from '../components/views/JobScheduling/JobDetailsPanel';
import type { Job, CrewMember, JobCrewAllocation } from '../types';

/**
 * One skipped day, checked across every surface that reports it. These surfaces derive
 * their answers independently — the drawer reads shift windows, the board reads occupancy,
 * the meters read committed hours — so a skip that only lands in some of them shows up as
 * two parts of the app disagreeing. That is the class of bug that started this work (the
 * drawer reading "12:00 PM – 12:00 PM" while the shift said 8:00 AM – 5:00 PM), and it is
 * invisible to per-module tests.
 */
describe('a skipped day, across every surface', () => {
  const member: CrewMember = { id: 'm1', name: 'Mike', role: 'Painter' };
  const cfg = configFromSettings(undefined, false);

  // Wed Aug 19 → Fri Aug 21 2026, skipping Thu the 20th, with Friday cut to a half day.
  const shift: JobCrewAllocation = {
    id: 's1', name: 'Crew', memberIds: ['m1'],
    startDate: '2026-08-19', endDate: '2026-08-21',
    startTime: '08:00', endTime: '17:00',
    skipDays: ['2026-08-20'],
    dailyHours: { '2026-08-21': { startTime: '07:00', endTime: '12:00' } },
  };
  const bare: Job = {
    id: 'j1', jobNumber: 'J-1', name: 'Deck Staining', clientId: 'c1', estimateId: 'e1',
    address: '321 Design St', stage: 'Scheduled', dateCreated: '2026-08-01',
  } as Job;

  // Save it the way the editor does, so envelope recomputation and normalization apply.
  const job = upsertAllocation(bare, shift);

  it('recomputes the job envelope from the worked boundary days', () => {
    expect(job.startDate).toBe('2026-08-19T08:00:00');
    // Friday's override is the last worked window, so the envelope ends at 12:00, not 17:00.
    expect(job.endDate).toBe('2026-08-21T12:00:00');
  });

  it('drawer: Daily Hours lists the two worked days with their own windows', () => {
    expect(jobActualSchedule(job).map(d => [d.dateKey, d.startTime, d.endTime])).toEqual([
      ['2026-08-19', '08:00', '17:00'],
      ['2026-08-21', '07:00', '12:00'],
    ]);
  });

  it('board: the bar appears either side of the skipped day, never on it', () => {
    const days = [new Date(2026, 7, 19), new Date(2026, 7, 20), new Date(2026, 7, 21)];
    const byDay = buildMemberLanes([job], [member], days, cfg)[0].cardsByDay;
    expect(byDay['2026-08-19']?.length).toBe(1);
    expect(byDay['2026-08-20'] ?? []).toEqual([]);
    expect(byDay['2026-08-21']?.length).toBe(1);
    expect(boardShifts(job)[0].card.skipDays).toEqual(['2026-08-20']);
  });

  it('capacity: the member owes hours on worked days and nothing on the skipped one', () => {
    expect(committedHoursOnDay(member, [job], '2026-08-19')).toBe(9);
    expect(committedHoursOnDay(member, [job], '2026-08-20')).toBe(0);
    expect(committedHoursOnDay(member, [job], '2026-08-21')).toBe(5);
  });

  it('every surface agrees on which days are worked', () => {
    const saved = job.allocations![0];
    const fromDrawer = jobActualSchedule(job).map(d => d.dateKey);
    const fromGrid = ['2026-08-19', '2026-08-20', '2026-08-21']
      .filter(k => memberShiftDayHours(saved, 'm1', k) > 0);
    const fromCapacity = ['2026-08-19', '2026-08-20', '2026-08-21']
      .filter(k => committedHoursOnDay(member, [job], k) > 0);
    expect(fromGrid).toEqual(fromDrawer);
    expect(fromCapacity).toEqual(fromDrawer);
  });
});
