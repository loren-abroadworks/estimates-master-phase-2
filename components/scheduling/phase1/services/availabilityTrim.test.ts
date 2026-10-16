import { describe, it, expect } from 'vitest';
import { availabilityTrims, applyAvailabilityTrims } from './availabilityTrim';
import { memberJobDayHours } from './crewHoursGrid';
import type { CrewMember, Job } from '../types';

const WEEKEND = [0, 6];
const DAY = '2026-08-18'; // a Tuesday

const job = (over: Partial<Job> = {}): Job =>
  ({ id: 'j1', jobNumber: 'J-1', name: 'Job', stage: 'Scheduled', clientId: 'c1', estimateId: 'e1',
     address: '1 St', dateCreated: '2026-01-01', ...over } as Job);

// One shift, 8am–5pm on the one day, with Mike booked its full 9h.
const booked = (over: Partial<Job> = {}) => job({
  allocations: [{ id: 'a', name: 'Crew', startDate: DAY, endDate: DAY,
    startTime: '08:00', endTime: '17:00', memberIds: ['m1'],
    hoursAssignments: { m1: { [DAY]: 9 } } }],
  ...over,
});

type Entry = NonNullable<CrewMember['schedule']>[string];
const mike = (over: Partial<Entry> = {}): CrewMember =>
  ({ id: 'm1', name: 'Mike', role: 'Painter',
     schedule: { [DAY]: { date: DAY, startTime: '08:00', endTime: '17:00', isOff: false, ...over } },
   } as CrewMember);

describe('availabilityTrims', () => {
  it('trims a booking down to a new half day', () => {
    const trims = availabilityTrims([booked()], mike({ endTime: '12:00' }), mike(), []);
    expect(trims).toEqual([{ jobId: 'j1', jobNumber: 'J-1', shiftId: 'a', memberId: 'm1', dateKey: DAY, from: 9, to: 4 }]);
  });

  it('removes the booking when the day is marked off', () => {
    const trims = availabilityTrims([booked()], mike({ isOff: true }), mike(), []);
    expect(trims).toEqual([{ jobId: 'j1', jobNumber: 'J-1', shiftId: 'a', memberId: 'm1', dateKey: DAY, from: 9, to: 0 }]);
  });

  it('leaves a booking alone when the new window misses the shift entirely', () => {
    // They now work mornings; the shift is 1–5pm. Nothing sensible to trim to, and
    // deleting a whole booking over a settings save would be too destructive.
    const afternoon = job({ allocations: [{ id: 'a', name: 'Crew', startDate: DAY, endDate: DAY,
      startTime: '13:00', endTime: '17:00', memberIds: ['m1'], hoursAssignments: { m1: { [DAY]: 4 } } }] });
    expect(availabilityTrims([afternoon], mike({ endTime: '12:00' }), mike(), [])).toEqual([]);
  });

  it('ignores days whose schedule entry did not change', () => {
    expect(availabilityTrims([booked()], mike(), mike(), [])).toEqual([]);
  });

  it('ignores a day whose schedule entry was deleted', () => {
    // Clearing an entry says nothing about the member; it must not trim their booking.
    const cleared = { id: 'm1', name: 'Mike', role: 'Painter', schedule: {} } as CrewMember;
    expect(availabilityTrims([booked()], cleared, mike({ endTime: '12:00' }), [])).toEqual([]);
  });

  it('ignores an edit that touches no schedule at all', () => {
    const before = mike();
    const renamed = { ...before, name: 'Michael' } as CrewMember;
    expect(availabilityTrims([booked()], renamed, before, [])).toEqual([]);
  });

  it('emits nothing when the booking already fits the new window', () => {
    const light = job({ allocations: [{ id: 'a', name: 'Crew', startDate: DAY, endDate: DAY,
      startTime: '08:00', endTime: '17:00', memberIds: ['m1'], hoursAssignments: { m1: { [DAY]: 3 } } }] });
    expect(availabilityTrims([light], mike({ endTime: '12:00' }), mike(), [])).toEqual([]);
  });

  it('carves an unpaid lunch out of the room a half day leaves', () => {
    // 8am–1pm is 5h of window; an unpaid noon hour inside it leaves 4h of work.
    const lunch = [{ id: 'b1', durationMinutes: 60, paid: false, startTime: '12:00' }];
    const trims = availabilityTrims([booked()], mike({ endTime: '13:00' }), mike(), lunch);
    expect(trims[0].to).toBe(4);
  });

  it('trims every shift the member holds that day', () => {
    const twoShifts = job({ allocations: [
      { id: 'am', name: 'AM', startDate: DAY, endDate: DAY, startTime: '08:00', endTime: '12:00',
        memberIds: ['m1'], hoursAssignments: { m1: { [DAY]: 4 } } },
      { id: 'pm', name: 'PM', startDate: DAY, endDate: DAY, startTime: '13:00', endTime: '17:00',
        memberIds: ['m1'], hoursAssignments: { m1: { [DAY]: 4 } } },
    ] });
    const trims = availabilityTrims([twoShifts], mike({ isOff: true }), mike(), []);
    expect(trims.map(t => t.shiftId)).toEqual(['am', 'pm']);
    expect(trims.every(t => t.to === 0)).toBe(true);
  });

  it('leaves another member\'s bookings alone', () => {
    const ana = job({ allocations: [{ id: 'a', name: 'Crew', startDate: DAY, endDate: DAY,
      startTime: '08:00', endTime: '17:00', memberIds: ['m2'], hoursAssignments: { m2: { [DAY]: 9 } } }] });
    expect(availabilityTrims([ana], mike({ endTime: '12:00' }), mike(), [])).toEqual([]);
  });

  it('skips a locked job', () => {
    const locked = booked({ is_locked: true });
    expect(availabilityTrims([locked], mike({ endTime: '12:00' }), mike(), [])).toEqual([]);
  });
});

describe('applyAvailabilityTrims', () => {
  it('writes a trim onto the job', () => {
    const jobs = [booked()];
    const trims = availabilityTrims(jobs, mike({ endTime: '12:00' }), mike(), []);
    const next = applyAvailabilityTrims(jobs, trims, WEEKEND, 8);
    expect(memberJobDayHours(next[0], 'm1', DAY, 8)).toBe(4);
  });

  it('folds two trims on one job into a single job value', () => {
    const twoShifts = job({ allocations: [
      { id: 'am', name: 'AM', startDate: DAY, endDate: DAY, startTime: '08:00', endTime: '12:00',
        memberIds: ['m1'], hoursAssignments: { m1: { [DAY]: 4 } } },
      { id: 'pm', name: 'PM', startDate: DAY, endDate: DAY, startTime: '13:00', endTime: '17:00',
        memberIds: ['m1'], hoursAssignments: { m1: { [DAY]: 4 } } },
    ] });
    const trims = availabilityTrims([twoShifts], mike({ isOff: true }), mike(), []);
    const next = applyAvailabilityTrims([twoShifts], trims, WEEKEND, 8);
    expect(next).toHaveLength(1);
    expect(memberJobDayHours(next[0], 'm1', DAY, 8)).toBe(0);
  });

  it('returns the untouched jobs unchanged, by identity', () => {
    const other = job({ id: 'j2', jobNumber: 'J-2' });
    const jobs = [booked(), other];
    const trims = availabilityTrims(jobs, mike({ endTime: '12:00' }), mike(), []);
    const next = applyAvailabilityTrims(jobs, trims, WEEKEND, 8);
    expect(next[1]).toBe(other);
  });

  it('returns the same array when there is nothing to apply', () => {
    const jobs = [booked()];
    expect(applyAvailabilityTrims(jobs, [], WEEKEND, 8)).toBe(jobs);
  });
});
