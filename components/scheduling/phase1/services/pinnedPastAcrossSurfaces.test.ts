import { describe, it, expect } from 'vitest';
import { applyChangeToJobPinningPast } from './shifts';
import { configFromSettings, jobWorkedDayKeys } from './scheduleEngine';
import { buildCrewHoursGrid, buildJobSummaries, memberShiftDayHours } from './crewHoursGrid';
import type { Job, CrewMember, WorkOrder } from '../types';
import type { ProposedChange } from './scheduleEngine';

/**
 * An in-flight job rescheduled, checked across the surfaces a scheduler actually looks at.
 *
 * This is the bug that started the work, and it was invisible to per-module tests: the
 * commit re-keyed the shift's dates but not its hours, so the grid read 0 on the old days
 * AND 0 on the new ones, the member's week total dropped, the capacity bar freed up, and
 * the sidebar reported the whole estimate as missing. Every surface agreed, and every
 * surface was wrong — which is why nobody noticed that the record of last week's work had
 * been destroyed. There is no timesheet behind these numbers to fall back on.
 */
describe('an in-flight job rescheduled, across every surface', () => {
  const cfg = configFromSettings(undefined, false); // workday 08:00–17:00, weekends off
  const WEEKENDS = cfg.weekendDays;
  const member: CrewMember = { id: 'm1', name: 'Mike', role: 'Painter' };
  // Per-DAY hours, not a weekly figure — capacity is this times the week's working days.
  const STANDARD_DAY = 8;

  // Mon Aug 17 → Wed Aug 19 2026, 8h/day for Mike. Today is Wednesday the 19th, so Mon and
  // Tue are worked history and only Wednesday is still movable.
  const TODAY = '2026-08-19';
  const inFlight = (): Job => ({
    id: 'j1', jobNumber: 'J-1', name: 'Deck Staining', clientId: 'c1', estimateId: 'e1',
    address: '321 Design St', stage: 'Scheduled', dateCreated: '2026-08-01',
    workOrderId: 'wo1',
    startDate: '2026-08-17T08:00:00', endDate: '2026-08-19T17:00:00',
    crewMemberIds: ['m1'],
    allocations: [{
      id: 's1', name: 'Crew', memberIds: ['m1'],
      startDate: '2026-08-17', endDate: '2026-08-19',
      startTime: '08:00', endTime: '17:00',
      hoursAssignments: { m1: { '2026-08-17': 8, '2026-08-18': 8, '2026-08-19': 8 } },
    }],
  } as unknown as Job);

  const workOrders = [{ id: 'wo1', totalProductionHours: 24 }] as unknown as WorkOrder[];

  // Rain on Wednesday: push the job out to the following Monday.
  const pushToNextMonday = (): ProposedChange => ({
    jobId: 'j1', jobName: 'Deck Staining', jobNumber: 'J-1',
    oldStart: '2026-08-17T08:00:00', oldEnd: '2026-08-19T17:00:00',
    newStart: '2026-08-24T08:00:00', newEnd: '2026-08-24T17:00:00',
  });

  const moved = () => applyChangeToJobPinningPast(
    inFlight(), pushToNextMonday(), { todayKey: TODAY, nonWorkingWeekdays: WEEKENDS },
  );

  const weekOf17 = ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21'];
  const weekOf24 = ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28'];
  const asDates = (keys: string[]) => keys.map(k => new Date(`${k}T12:00:00`));

  it('the hours grid still shows the worked days, with their hours', () => {
    const grid = buildCrewHoursGrid([member], [moved()], workOrders, asDates(weekOf17), WEEKENDS, STANDARD_DAY);
    const [row] = grid.rows;
    expect(row.cellsByDay['2026-08-17'].map(c => c.hours)).toEqual([8]);
    expect(row.cellsByDay['2026-08-18'].map(c => c.hours)).toEqual([8]);
    // Wednesday's work left; the day is empty, not holding a stale chip.
    expect(row.cellsByDay['2026-08-19']).toEqual([]);
  });

  it('the moved day shows up on the week it moved to, not two days further out', () => {
    const grid = buildCrewHoursGrid([member], [moved()], workOrders, asDates(weekOf24), WEEKENDS, STANDARD_DAY);
    const [row] = grid.rows;
    expect(row.cellsByDay['2026-08-24'].map(c => c.hours)).toEqual([8]);
    expect(row.cellsByDay['2026-08-26']).toEqual([]); // the overshoot bug's landing spot
  });

  it('does not hand the worked hours back as free capacity', () => {
    const [row] = buildCrewHoursGrid([member], [moved()], workOrders, asDates(weekOf17), WEEKENDS, STANDARD_DAY).rows;
    // 16h of that week is spent and stays spent. Before the fix this read 0 / 40h, which is
    // what invited the completed work to be booked a second time.
    expect(row.capacity).toBe(40); // 8h x 5 working days
    expect(row.weekTotal).toBe(16);
    expect(row.remaining).toBe(24);
  });

  it('reports no missing hours against the days already worked', () => {
    const [summary] = buildJobSummaries([moved()], workOrders, weekOf17, WEEKENDS, 8, [member]);
    // 3 worked days across the job, 2 of them this week: 24 x 2/3 required, 16 assigned.
    expect(summary.required).toBe(16);
    expect(summary.assigned).toBe(16);
    expect(summary.missing).toBe(0);
  });

  it('counts the job as three worked days, not the six its envelope spans', () => {
    // Aug 17-24 is six working days; the job works three. Reading the envelope here is what
    // produced the phantom "4h missing" that the sidebar showed.
    expect(jobWorkedDayKeys(moved(), WEEKENDS)).toEqual(['2026-08-17', '2026-08-18', '2026-08-24']);
  });

  it('keeps the worked days on a shift that reads as history', () => {
    const out = moved();
    const pinned = out.allocations!.find(a => a.pinned)!;
    expect(pinned.startDate).toBe('2026-08-17');
    expect(pinned.endDate).toBe('2026-08-18');
    expect(memberShiftDayHours(pinned, 'm1', '2026-08-17')).toBe(8);
    expect(memberShiftDayHours(pinned, 'm1', '2026-08-18')).toBe(8);
    // The live shift holds only what is still to come.
    const live = out.allocations!.find(a => !a.pinned)!;
    expect(memberShiftDayHours(live, 'm1', '2026-08-24')).toBe(8);
  });

  it('survives a second reschedule without touching the history again', () => {
    const twice = applyChangeToJobPinningPast(
      moved(),
      { ...pushToNextMonday(), oldStart: '2026-08-24T08:00:00', newStart: '2026-08-31T08:00:00', newEnd: '2026-08-31T17:00:00' },
      { todayKey: TODAY, nonWorkingWeekdays: WEEKENDS },
    );
    expect(twice.allocations!.filter(a => a.pinned)).toHaveLength(1);
    const [row] = buildCrewHoursGrid([member], [twice], workOrders, asDates(weekOf17), WEEKENDS, STANDARD_DAY).rows;
    expect(row.weekTotal).toBe(16); // history untouched by the repeat move
    expect(twice.allocations!.find(a => !a.pinned)!.startDate).toBe('2026-08-31');
  });
});
