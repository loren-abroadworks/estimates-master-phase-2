import type { Job, JobCrewAllocation } from '../types';
import {
  WorkingTimeConfig, ProposedChange, allocDayWindow, workingDayKeys,
  applyChangeToJob, placeHoursConflictFree, advanceWorkingDays, toLocalDateKey,
} from './scheduleEngine';

export interface ShiftOccurrence {
  jobId: string;
  shiftId: string;
  shiftName: string;
  memberIds: string[];
  dateKey: string;
  startMin: number;
  endMin: number;
}

export interface ShiftRef { jobId: string; shiftId: string; }

const toMin = (t: string): number => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };

/** Every dated shift on every job, expanded across its working days, grouped by member.
 *  This is each crew member's "personal timeline" — job-agnostic. */
export const buildMemberTimelines = (jobs: Job[], config: WorkingTimeConfig): Map<string, ShiftOccurrence[]> => {
  const timelines = new Map<string, ShiftOccurrence[]>();
  for (const job of jobs) {
    for (const alloc of job.allocations ?? []) {
      if (!alloc.startDate || !alloc.endDate) continue;
      const days = workingDayKeys(`${alloc.startDate}T12:00:00`, `${alloc.endDate}T12:00:00`, config.weekendDays);
      for (const dateKey of days) {
        const w = allocDayWindow(alloc, dateKey);
        const occ: ShiftOccurrence = {
          jobId: job.id, shiftId: alloc.id, shiftName: alloc.name, memberIds: alloc.memberIds ?? [],
          dateKey, startMin: toMin(w.startTime), endMin: toMin(w.endTime),
        };
        for (const m of occ.memberIds) {
          const arr = timelines.get(m) ?? [];
          arr.push(occ);
          timelines.set(m, arr);
        }
      }
    }
  }
  return timelines;
};

/** Same calendar day and overlapping clock windows (each starts before the other ends). */
export const occurrencesClash = (a: ShiftOccurrence, b: ShiftOccurrence): boolean =>
  a.dateKey === b.dateKey && a.startMin < b.endMin && b.startMin < a.endMin;

/** The distinct shifts (excluding `pinned` shift ids and the target itself) that overlap
 *  `target` on any member whose timeline both share. */
export const clashesWith = (target: ShiftRef, timelines: Map<string, ShiftOccurrence[]>, pinned: Set<string>): ShiftRef[] => {
  const targetOccs: ShiftOccurrence[] = [];
  for (const occs of timelines.values()) for (const o of occs) if (o.shiftId === target.shiftId && o.jobId === target.jobId) targetOccs.push(o);

  const found = new Map<string, ShiftRef>();
  for (const to of targetOccs) {
    for (const m of to.memberIds) {
      for (const o of timelines.get(m) ?? []) {
        if (o.shiftId === target.shiftId) continue;
        if (pinned.has(o.shiftId)) continue;
        if (occurrencesClash(to, o)) found.set(`${o.jobId}:${o.shiftId}`, { jobId: o.jobId, shiftId: o.shiftId });
      }
    }
  }
  return [...found.values()];
};

/** Total working-hours a shift covers, summed over its working days. */
export const shiftRequiredHours = (alloc: JobCrewAllocation, config: WorkingTimeConfig): number => {
  if (!alloc.startDate || !alloc.endDate) return 0;
  const days = workingDayKeys(`${alloc.startDate}T12:00:00`, `${alloc.endDate}T12:00:00`, config.weekendDays);
  let total = 0;
  for (const k of days) {
    const w = allocDayWindow(alloc, k);
    total += Math.max(0, toMin(w.endTime) - toMin(w.startTime)) / 60;
  }
  return Math.round(total * 10) / 10;
};

export interface ResidualClash {
  jobId: string; jobName: string; shiftId: string; shiftName: string; memberIds: string[]; message: string;
}

/**
 * Resolve a shift move's chain: the anchor (moved) shift is pinned; each shift it (or a
 * subsequently re-placed shift) double-books on a shared member is re-placed into
 * conflict-free time with the page's Smart/Simple policy. Returns follower per-shift
 * changes (never the anchor) and residual clashes that could not be resolved in bounds.
 */
export const resolveShiftCascade = (
  jobs: Job[],
  anchor: ProposedChange,
  config: WorkingTimeConfig,
  opts: { keepExistingDaysAsIs?: boolean; untilDate?: string },
): { changes: ProposedChange[]; residual: ResidualClash[] } => {
  if (!anchor.shiftId) return { changes: [], residual: [] };

  // World with the anchor applied (envelope + windows already reflect the move).
  let world: Job[] = jobs.map(j => (j.id === anchor.jobId ? applyChangeToJob(j, anchor) : j));

  const pinned = new Set<string>([anchor.shiftId]);
  const changes: ProposedChange[] = [];
  const residual: ResidualClash[] = [];
  const visited = new Map<string, string>();       // shiftId -> last placed start key
  const queue: ShiftRef[] = [{ jobId: anchor.jobId, shiftId: anchor.shiftId }];

  const findAlloc = (ref: ShiftRef) => {
    const j = world.find(x => x.id === ref.jobId);
    const a = j?.allocations?.find(x => x.id === ref.shiftId);
    return j && a ? { job: j, alloc: a } : null;
  };

  let guard = 0;
  while (queue.length && guard++ < 200) {
    const cur = queue.shift()!;
    const timelines = buildMemberTimelines(world, config);
    const clashing = clashesWith(cur, timelines, pinned)
      .map(ref => findAlloc(ref))
      .filter((x): x is NonNullable<typeof x> => !!x && !!x.alloc.startDate)
      // Earliest-start-first for deterministic ordering.
      .sort((a, b) => (a.alloc.startDate! < b.alloc.startDate! ? -1 : a.alloc.startDate! > b.alloc.startDate! ? 1 : 0));

    for (const { job, alloc } of clashing) {
      if (pinned.has(alloc.id)) continue;
      const clashKey = alloc.startDate!;
      const required = shiftRequiredHours(alloc, config);
      // Busy time for this shift's crew = the pinned shifts' intervals on that day.
      const occupiedByDay = (dayKey: string): { start: number; end: number }[] => {
        const ivs: { start: number; end: number }[] = [];
        const tl = buildMemberTimelines(world, config);
        for (const m of alloc.memberIds ?? []) {
          for (const o of tl.get(m) ?? []) {
            if (o.dateKey === dayKey && pinned.has(o.shiftId) && o.shiftId !== alloc.id) ivs.push({ start: o.startMin / 60, end: o.endMin / 60 });
          }
        }
        return ivs;
      };
      // Smart may pull the shift earlier the same day -> start candidates at the clash day.
      // Simple spills forward -> start at the next working day.
      const fromKey = opts.keepExistingDaysAsIs
        ? toLocalDateKey(advanceWorkingDays(new Date(`${clashKey}T12:00:00`), 1, config))
        : clashKey;

      const { dayHours, unplaced } = placeHoursConflictFree(
        {}, required, occupiedByDay, config,
        { keepExistingDaysAsIs: opts.keepExistingDaysAsIs, untilDate: opts.untilDate, fromKey },
      );

      const keys = Object.keys(dayHours).sort();
      if (unplaced > 0 || keys.length === 0
        || (opts.untilDate && keys[keys.length - 1] > opts.untilDate)) {
        residual.push({
          jobId: job.id, jobName: job.name, shiftId: alloc.id, shiftName: alloc.name,
          memberIds: alloc.memberIds ?? [],
          message: `${alloc.name} on ${job.name} could not be re-placed conflict-free`,
        });
        pinned.add(alloc.id); // stop reprocessing; it stays where it is
        continue;
      }

      const newStartKey = keys[0];
      if (visited.get(alloc.id) === newStartKey) { pinned.add(alloc.id); continue; } // no forward progress
      visited.set(alloc.id, newStartKey);

      const change: ProposedChange = {
        jobId: job.id, jobName: job.name, jobNumber: job.jobNumber,
        oldStart: `${alloc.startDate}T${allocDayWindow(alloc, alloc.startDate!).startTime}:00`,
        oldEnd: `${alloc.endDate}T${allocDayWindow(alloc, alloc.endDate!).endTime}:00`,
        newStart: `${newStartKey}T${dayHours[newStartKey].startTime}:00`,
        newEnd: `${keys[keys.length - 1]}T${dayHours[keys[keys.length - 1]].endTime}:00`,
        shiftId: alloc.id, dailyHours: dayHours,
      };
      changes.push(change);
      pinned.add(alloc.id);
      world = world.map(j => (j.id === job.id ? applyChangeToJob(j, change) : j));
      queue.push({ jobId: job.id, shiftId: alloc.id }); // its new spot may clash further
    }
  }

  // Collapse to the last change per shift (guard against duplicates from the chain).
  const lastByShift = new Map<string, ProposedChange>();
  for (const c of changes) lastByShift.set(c.shiftId!, c);
  return { changes: [...lastByShift.values()], residual };
};

export interface ShiftClash { memberId: string; dateKey: string; a: ShiftRef; b: ShiftRef; message: string; }

/** Every member double-booked by two overlapping shift occurrences on a day, across the
 *  whole schedule. Used for the cascade-OFF non-blocking warning. Each unordered pair is
 *  reported once per member/day. */
export const detectShiftClashes = (jobs: Job[], config: WorkingTimeConfig): ShiftClash[] => {
  const timelines = buildMemberTimelines(jobs, config);
  const out: ShiftClash[] = [];
  const seen = new Set<string>();
  for (const [memberId, occs] of timelines) {
    for (let i = 0; i < occs.length; i++) {
      for (let k = i + 1; k < occs.length; k++) {
        const a = occs[i], b = occs[k];
        if (a.shiftId === b.shiftId) continue;
        if (!occurrencesClash(a, b)) continue;
        const pair = [a.shiftId, b.shiftId].sort().join('|');
        const key = `${memberId}:${a.dateKey}:${pair}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          memberId, dateKey: a.dateKey,
          a: { jobId: a.jobId, shiftId: a.shiftId }, b: { jobId: b.jobId, shiftId: b.shiftId },
          message: `${a.shiftName} overlaps ${b.shiftName} on the same crew member`,
        });
      }
    }
  }
  return out;
};
