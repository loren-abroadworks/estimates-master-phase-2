const round1 = (n: number) => Math.round(n * 10) / 10;

export interface AssignHoursWarningArgs {
  memberName: string;
  /** Sum of the hours being entered in the modal for the shown days. */
  enteredTotal: number;
  /** Member's week total EXCLUDING their current hours on this job's shown days. */
  memberWeekTotalOther: number;
  /** Member's weekly capacity (0 = unknown, no check). */
  weeklyCapacity: number;
  jobName: string;
  /** Job's total assigned hours EXCLUDING this member's hours on the shown days. */
  jobTotalOther: number;
  /** Job's estimated production hours (0 = no work order, no check). */
  estHours: number;
}

/**
 * Advisory warnings shown live in the Assign Hours modal as hours are entered
 * for one member on one job. Pure and only over-limit:
 *  - weekly capacity: the member's projected week total exceeds their capacity.
 *  - estimate: the job's projected total assigned hours exceed its estimate.
 * Never blocks the assignment.
 */
export const detectAssignHoursWarnings = (args: AssignHoursWarningArgs): string[] => {
  const warnings: string[] = [];

  const projectedWeek = round1(args.memberWeekTotalOther + args.enteredTotal);
  if (args.weeklyCapacity > 0 && projectedWeek > args.weeklyCapacity) {
    warnings.push(`${args.memberName} would be over capacity this week — ${projectedWeek.toFixed(1)}h of ${args.weeklyCapacity.toFixed(1)}h.`);
  }

  const projectedJob = round1(args.jobTotalOther + args.enteredTotal);
  if (args.estHours > 0 && projectedJob > args.estHours) {
    warnings.push(`${args.jobName} would be over its estimate — ${projectedJob.toFixed(1)}h of ${args.estHours.toFixed(1)}h.`);
  }

  return warnings;
};

export interface JobHoursProgress {
  /** Job's projected total assigned hours, including the hours being entered. */
  assigned: number;
  /** Job's estimated production hours. */
  estimate: number;
  /** Hours still needed to reach the estimate (0 once fully staffed or over). */
  remaining: number;
}

/**
 * Live "hours still needed" for the job while assigning. Returns null when the
 * job has no estimate, so callers can hide the readout.
 */
export const jobHoursProgress = (
  jobTotalOther: number,
  enteredTotal: number,
  estHours: number,
): JobHoursProgress | null => {
  if (estHours <= 0) return null;
  const assigned = round1(jobTotalOther + enteredTotal);
  return { assigned, estimate: estHours, remaining: Math.max(0, round1(estHours - assigned)) };
};
