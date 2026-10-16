import { describe, it, expect } from 'vitest';
import { applyStagedCrew, type StagedCrew } from './stagedCrew';
import type { Job, JobCrewAllocation } from '../types';

const job = (over: Partial<Job> = {}): Job =>
  ({ id: 'j1', jobNumber: 'J-1', name: 'Job', stage: 'Scheduled', startDate: '2026-06-02', endDate: '2026-06-04', ...over } as Job);

const alloc: JobCrewAllocation = {
  id: 'a1', name: 'Crew', startDate: '2026-06-02', endDate: '2026-06-04',
  startTime: '08:00', endTime: '17:00', memberIds: ['m1', 'm2'],
};

describe('applyStagedCrew', () => {
  it('writes the staged members and allocation onto the job', () => {
    const staged: StagedCrew = { memberIds: ['m1', 'm2'], allocation: alloc };
    const result = applyStagedCrew(job(), staged);
    expect(result.crewMemberIds).toEqual(['m1', 'm2']);
    expect(result.allocations).toEqual([alloc]);
  });

  it('clears allocations when no members are staged', () => {
    const staged: StagedCrew = { memberIds: [], allocation: { ...alloc, memberIds: [] } };
    const result = applyStagedCrew(job(), staged);
    expect(result.crewMemberIds).toEqual([]);
    expect(result.allocations).toEqual([]);
  });
});
