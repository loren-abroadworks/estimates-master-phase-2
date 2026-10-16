import type { Job, JobCrewAllocation } from '../types';

/** A pending crew change held in the preview until Apply commits it. */
export interface StagedCrew {
  memberIds: string[];
  allocation: JobCrewAllocation;
}

/** Returns a copy of `job` with the staged crew applied. Empty members clears
 *  the allocation so member board lanes recompute to "unassigned". */
export const applyStagedCrew = (job: Job, staged: StagedCrew): Job => ({
  ...job,
  crewMemberIds: staged.memberIds,
  allocations: staged.memberIds.length ? [staged.allocation] : [],
});
