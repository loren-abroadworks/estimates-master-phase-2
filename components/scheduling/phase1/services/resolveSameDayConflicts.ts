import type { Job } from '../types';
import {
  ProposedChange, WorkingTimeConfig, CascadeScope, ClockInterval,
  jobClockWindowOnDay, spannedDayKeys, occupiesWorkingDay,
  occupiedIntervals, freeIntervals, advanceWorkingDays, toLocalDateKey,
  formatDisplayDate, hoursToHHMM, applyDailyHours,
} from './scheduleEngine';
import { sharedCrewScope, jobsShareCrew } from './rescheduleIssues';
import { withStagedWindow, fmtClock } from './productionBoard';

const EPS = 1e-9;

export interface ConflictResolution {
  jobId: string;
  jobName: string;
  jobNumber: string;
  kind: 'slide-same-day' | 'move-to-day' | 'unresolved' | 'locked-blocked';
  change: ProposedChange;
  label: string;
}

/** Resolutions that represent an actual move to stage (vs. informational notes). */
export const isMovableResolution = (r: ConflictResolution): boolean =>
  r.kind === 'slide-same-day' || r.kind === 'move-to-day';

/**
 * Fold the user's in-flight per-day hour edits into a staged change: update its
 * `dailyHours` and (via `applyDailyHours`) its first-day start / last-day end.
 * Conflict detection and resolution must read the SAME edited windows the grid
 * shows; with cascade off an edit lives only in `dailyHoursEdits`, so callers
 * bake it in before detecting/resolving conflicts.
 */
export const bakeDailyEdits = (
  change: ProposedChange,
  edits: Record<string, { startTime: string; endTime: string }> | undefined,
): ProposedChange => {
  if (!edits) return change;
  return { ...applyDailyHours(change, edits), dailyHours: { ...change.dailyHours, ...edits } };
};

const clockOverlaps = (a: ClockInterval | null, b: ClockInterval | null): boolean =>
  !!a && !!b && a.start < b.end - EPS && b.start < a.end - EPS;

const baseOf = (job: Job) => ({
  jobId: job.id, jobName: job.name, jobNumber: job.jobNumber,
  oldStart: job.startDate ?? null, oldEnd: job.endDate ?? null,
});

type Slot = { startTime: string; endTime: string };

/**
 * Earliest free clock-time slot of length `durHours` on `dayKey`, honoring the
 * shared-crew occupancy in `scope` (excluding `excludeJobId`). The job is placed
 * at the start of the earliest interval that fits; null when nothing fits.
 */
export const findSameDaySlot = (
  durHours: number, dayKey: string, scope: CascadeScope, excludeJobId: string,
  world: Job[], config: WorkingTimeConfig,
): Slot | null => {
  const occupied = occupiedIntervals(world, scope, dayKey, config, excludeJobId);
  const free = freeIntervals(occupied, config).filter(iv => iv.end - iv.start >= durHours - EPS);
  if (free.length === 0) return null;
  const startH = free[0].start;
  return { startTime: hoursToHHMM(startH), endTime: hoursToHHMM(startH + durHours) };
};

/**
 * Nearest working day (searching outward from the job's original day, both
 * directions, tie -> earlier) that has a free slot for a `durHours` window.
 */
export const findNearestDay = (
  job: Job, durHours: number, world: Job[], config: WorkingTimeConfig,
): { dayKey: string; slot: Slot } | null => {
  const scope = sharedCrewScope(job);
  const origin = new Date(job.startDate!);
  for (let d = 1; d <= 60; d++) {
    for (const dir of [-1, 1]) {
      const cand = advanceWorkingDays(origin, d * dir, config);
      const dayKey = toLocalDateKey(cand);
      const slot = findSameDaySlot(durHours, dayKey, scope, job.id, world, config);
      if (slot) return { dayKey, slot };
    }
  }
  return null;
};

const slideLabel = (job: Job, slot: Slot) =>
  `Move ${job.name} to ${fmtClock(slot.startTime)}–${fmtClock(slot.endTime)}`;

/**
 * Resolve one conflicting `job` displaced by `anchor` on `dayKey`:
 *   1. gap-fill into a free same-day slot (no cascade);
 *   2. else push right after the anchor's end if it fits the workday (cascades);
 *   3. else single-day -> nearest day; multi-day -> unresolved.
 * Same-day placement edits only `dailyHours[dayKey]`, recomputing newStart/newEnd
 * only when `dayKey` is the job's first/last spanned day. Returns the resolution
 * and whether it should seed a new cascade anchor.
 */
const resolveConflict = (
  job: Job, anchor: Job, dayKey: string, world: Job[], config: WorkingTimeConfig,
): { res: ConflictResolution; cascade: boolean } => {
  const base = baseOf(job);
  const win = jobClockWindowOnDay(job, dayKey, config)!;
  const anchorWin = jobClockWindowOnDay(anchor, dayKey, config)!;
  const durHours = win.end - win.start;
  const scope = sharedCrewScope(job);
  const spanned = spannedDayKeys(job.startDate!, job.endDate ?? job.startDate!);
  const isMultiDay = spanned.length > 1;

  const sameDayChange = (slot: Slot): ProposedChange => ({
    ...base,
    newStart: dayKey === spanned[0] ? `${dayKey}T${slot.startTime}:00` : job.startDate!,
    newEnd: dayKey === spanned[spanned.length - 1] ? `${dayKey}T${slot.endTime}:00` : (job.endDate ?? job.startDate!),
    dailyHours: { ...job.dailyHours, [dayKey]: slot },
  });

  // 1. Gap-fill same day.
  const gap = findSameDaySlot(durHours, dayKey, scope, job.id, world, config);
  if (gap) {
    return { res: { ...base, kind: 'slide-same-day', change: sameDayChange(gap), label: slideLabel(job, gap) }, cascade: false };
  }

  // 2. Push-to-make-room: place right after the anchor's end if it fits the workday.
  const pushStart = anchorWin.end;
  if (pushStart + durHours <= config.workDayEndHour + EPS) {
    const slot: Slot = { startTime: hoursToHHMM(pushStart), endTime: hoursToHHMM(pushStart + durHours) };
    return { res: { ...base, kind: 'slide-same-day', change: sameDayChange(slot), label: slideLabel(job, slot) }, cascade: true };
  }

  // 3a. Single-day: relocate the whole job to the nearest fitting working day.
  if (!isMultiDay) {
    const near = findNearestDay(job, durHours, world, config);
    if (near) {
      return {
        res: {
          ...base, kind: 'move-to-day',
          change: {
            ...base, newStart: `${near.dayKey}T${near.slot.startTime}:00`, newEnd: `${near.dayKey}T${near.slot.endTime}:00`,
            dailyHours: { [near.dayKey]: near.slot },
          },
          label: `Move ${job.name} to ${formatDisplayDate(near.dayKey)}, ${fmtClock(near.slot.startTime)}–${fmtClock(near.slot.endTime)}`,
        },
        cascade: false,
      };
    }
  }

  // 3b. Multi-day (or single-day with no day found): leave it for manual handling.
  return {
    res: {
      ...base, kind: 'unresolved',
      change: { ...base, newStart: job.startDate!, newEnd: job.endDate ?? job.startDate! },
      label: `${job.name} can't fit on ${formatDisplayDate(dayKey)} — reschedule manually`,
    },
    cascade: false,
  };
};

export const resolveSameDayConflicts = (
  primary: ProposedChange,
  world: Job[],
  config: WorkingTimeConfig,
): ConflictResolution[] => {
  const subject = world.find(j => j.id === primary.jobId);
  if (!subject) return [];

  const work = world.slice();                  // mutable copy; updated as we resolve
  const resolutions: ConflictResolution[] = [];
  const visited = new Set<string>([subject.id]);
  let anchors: Job[] = [subject];

  // Each anchor's window may displace shared-crew jobs. Gap-fill placements are
  // conflict-free (no new anchor); push placements intentionally overlap, so the
  // bumped job is enqueued as the next anchor. `visited` + the bound prevent cycles.
  for (let guard = 0; guard < 200 && anchors.length > 0; guard++) {
    const next: Job[] = [];
    for (const anchor of anchors) {
      const anchorDays = spannedDayKeys(anchor.startDate!, anchor.endDate ?? anchor.startDate!);
      for (const other of work) {
        if (visited.has(other.id)) continue;
        if (!jobsShareCrew(anchor, other)) continue;
        const clashDay = anchorDays.find(dk =>
          occupiesWorkingDay(other.startDate, other.endDate, dk, config) &&
          clockOverlaps(jobClockWindowOnDay(anchor, dk, config), jobClockWindowOnDay(other, dk, config)));
        if (!clashDay) continue;

        visited.add(other.id);
        if (other.is_locked) {
          resolutions.push({
            ...baseOf(other), kind: 'locked-blocked',
            change: { ...baseOf(other), newStart: other.startDate!, newEnd: other.endDate ?? other.startDate! },
            label: `${other.name} is locked and can't be moved`,
          });
          continue;
        }

        const { res, cascade } = resolveConflict(other, anchor, clashDay, work, config);
        resolutions.push(res);
        if (isMovableResolution(res)) {
          const idx = work.findIndex(j => j.id === other.id);
          work[idx] = withStagedWindow(other, res.change);
          if (cascade) next.push(work[idx]);
        }
      }
    }
    anchors = next;
  }
  return resolutions;
};

/**
 * Merge conflict resolutions into the staged `changes` array for the "Move
 * conflicting job" action. Each existing change first has the user's in-flight
 * per-day edits (`dailyHoursEdits`) baked into its `dailyHours` (and its
 * start/end clock via `applyDailyHours`). This matters because committing the
 * resolutions re-seeds the editor's per-day hours from the staged changes — so
 * an edit that lived only in `dailyHoursEdits` (e.g. a mid-span window change
 * with cascade off) would otherwise be discarded on the round-trip. Only movable
 * resolutions (`slide-same-day` / `move-to-day`) overlay by jobId; `unresolved`
 * and `locked-blocked` are informational and never staged.
 */
export const mergeResolutionsIntoChanges = (
  changes: ProposedChange[],
  resolutions: ConflictResolution[],
  dailyHoursEdits: Record<string, Record<string, { startTime: string; endTime: string }>>,
): ProposedChange[] => {
  const byId = new Map(changes.map(c => [c.jobId, bakeDailyEdits(c, dailyHoursEdits[c.jobId])]));
  for (const r of resolutions) {
    if (!isMovableResolution(r)) continue;
    byId.set(r.jobId, r.change);
  }
  return [...byId.values()];
};
