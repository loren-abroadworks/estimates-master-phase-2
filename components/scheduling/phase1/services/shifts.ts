import type { Job, JobCrewAllocation } from '../types';
import { recomputeJobEnvelope, allocWorkedDayKeys, applyChangeToJob, type ProposedChange } from './scheduleEngine';

const syncCrew = (job: Job, allocations: JobCrewAllocation[]): Job =>
  recomputeJobEnvelope({
    ...job,
    allocations,
    crewMemberIds: Array.from(new Set(allocations.flatMap(a => a.memberIds ?? []))),
  });

/** Add `allocation` (new id) or replace the existing shift with the same id. */
export const upsertAllocation = (job: Job, allocation: JobCrewAllocation): Job => {
  const incoming = normalizeAlloc(allocation);
  const existing = job.allocations ?? [];
  const has = existing.some(a => a.id === incoming.id);
  const allocations = has
    ? existing.map(a => (a.id === incoming.id ? incoming : a))
    : [...existing, incoming];
  return syncCrew(job, allocations);
};

/** Remove the shift with `shiftId`. */
export const removeAllocation = (job: Job, shiftId: string): Job =>
  syncCrew(job, (job.allocations ?? []).filter(a => a.id !== shiftId));

/** Materialize a legacy job (crew via `crewMemberIds`, no `allocations`) into a
 *  single "Crew" shift so the shift editor can show and split it. Display-only:
 *  the job's own start/end dates are preserved (NOT recomputed), and its per-day
 *  windows are carried onto the shift. Jobs that already have shifts, or that are
 *  unscheduled (no startDate), are returned unchanged. */
export const ensureJobAllocations = (job: Job): Job => {
  if (job.allocations?.length) return job;
  const start = (job.startDate ?? '').split('T')[0];
  if (!start) return job;
  const end = (job.endDate ?? job.startDate ?? '').split('T')[0];
  const alloc: JobCrewAllocation = {
    id: `shift-${job.id}`, name: 'Crew', memberIds: [...(job.crewMemberIds ?? [])],
    startDate: start, endDate: end, startTime: '08:00', endTime: '17:00',
    ...(job.dailyHours ? { dailyHours: { ...job.dailyHours } } : {}),
  };
  return { ...job, allocations: [alloc], crewMemberIds: Array.from(new Set(alloc.memberIds)) };
};

/** A blank shift seeded from the job's current span, ready to edit. */
export const newShift = (id: string, job: Job): JobCrewAllocation => {
  const start = (job.startDate ?? '').split('T')[0];
  const end = (job.endDate ?? job.startDate ?? '').split('T')[0];
  return { id, name: 'New Shift', memberIds: [], startDate: start, endDate: end, startTime: '08:00', endTime: '17:00' };
};

const patchAlloc = (job: Job, shiftId: string, patch: (a: JobCrewAllocation) => JobCrewAllocation): Job => {
  const existing = job.allocations ?? [];
  if (!existing.some(a => a.id === shiftId)) return job;
  return syncCrew(job, existing.map(a => (a.id === shiftId ? normalizeAlloc(patch(a)) : a)));
};

/** Set a shift's overall date range (YYYY-MM-DD). */
export const setAllocSpan = (job: Job, shiftId: string, startDate: string, endDate: string): Job =>
  patchAlloc(job, shiftId, a => ({ ...a, startDate, endDate }));

/** Set (override) a shift's window on one day. */
export const setAllocDayWindow = (
  job: Job, shiftId: string, dateKey: string, window: { startTime: string; endTime: string },
): Job => patchAlloc(job, shiftId, a => ({ ...a, dailyHours: { ...a.dailyHours, [dateKey]: window } }));

// Calendar-day delta between two YYYY-MM-DD keys, anchored at local noon so the
// Date parse doesn't drop a day in negative-offset zones.
const dayDelta = (fromKey: string, toKey: string): number =>
  Math.round((new Date(`${toKey}T12:00:00`).getTime() - new Date(`${fromKey}T12:00:00`).getTime()) / 86_400_000);

const addDaysToKey = (key: string, days: number): string => {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Keep a shift's skip list and envelope consistent:
 *  - the envelope's first/last day is never itself skipped (a skipped boundary makes
 *    `recomputeJobEnvelope` read boundary times off a day nobody works, and starts the
 *    board bar on a hole), so trim inward past any skipped boundary days;
 *  - skip keys outside the envelope are dropped, so shrinking the range later cannot
 *    resurrect a skip the user can no longer see.
 *  An all-skipped shift is left alone: there is no day to trim to, and the editor blocks
 *  saving one, so silently inventing a worked day would be the worse failure. */
export const normalizeAlloc = (alloc: JobCrewAllocation): JobCrewAllocation => {
  const skips = alloc.skipDays;
  if (!skips?.length || !alloc.startDate || !alloc.endDate) return alloc;

  let start = alloc.startDate;
  let end = alloc.endDate;
  while (start <= end && skips.includes(start)) start = addDaysToKey(start, 1);
  while (end >= start && skips.includes(end)) end = addDaysToKey(end, -1);
  if (start > end) return alloc; // every day skipped — leave as authored

  const kept = skips.filter(k => k >= start && k <= end);
  return { ...alloc, startDate: start, endDate: end, skipDays: kept };
};

/** Move a shift so its start day becomes `newStartKey`, shifting its end day and
 *  re-keying its per-day windows by the same delta, then recompute the envelope.
 *  Unknown shift / undated shift → unchanged. */
export const moveAllocation = (job: Job, shiftId: string, newStartKey: string): Job =>
  patchAlloc(job, shiftId, a => {
    if (!a.startDate) return a;
    const delta = dayDelta(a.startDate, newStartKey);
    if (delta === 0) return a;
    const dailyHours = a.dailyHours
      ? Object.fromEntries(Object.entries(a.dailyHours).map(([k, w]) => [addDaysToKey(k, delta), w]))
      : a.dailyHours;
    // Skips are calendar days like the windows — a moved shift must skip the same day of
    // the shift, not the same date it used to skip.
    const skipDays = a.skipDays?.map(k => addDaysToKey(k, delta));
    // Granular per-member hours are date-keyed like the windows, so they move too. Leaving
    // them behind strands every booking on a date the shift no longer covers.
    const hoursAssignments = a.hoursAssignments
      ? Object.fromEntries(
          Object.entries(a.hoursAssignments).map(([memberId, days]) => [
            memberId,
            Object.fromEntries(Object.entries(days).map(([k, h]) => [addDaysToKey(k, delta), h])),
          ]),
        )
      : a.hoursAssignments;
    // Per-member window overrides are date-keyed too. Left behind, a member's retimed
    // day would apply to a date the shift no longer covers.
    const memberDailyWindows = a.memberDailyWindows
      ? Object.fromEntries(
          Object.entries(a.memberDailyWindows).map(([memberId, days]) => [
            memberId,
            Object.fromEntries(Object.entries(days).map(([k, w]) => [addDaysToKey(k, delta), w])),
          ]),
        )
      : a.memberDailyWindows;
    return {
      ...a,
      startDate: newStartKey,
      endDate: a.endDate ? addDaysToKey(a.endDate, delta) : newStartKey,
      ...(dailyHours ? { dailyHours } : {}),
      ...(skipDays ? { skipDays } : {}),
      ...(hoursAssignments ? { hoursAssignments } : {}),
      ...(memberDailyWindows ? { memberDailyWindows } : {}),
    };
  });

/** Slide a job's movable shifts by `days` working days, keeping the job's shape: one
 *  calendar delta is derived from the earliest moving shift and applied to them all, so
 *  the gaps between them survive a weekend falling inside one.
 *
 *  Shifts marked `pinned` are history and stay where they are — moving them would destroy
 *  the only record that the work happened. `skipShiftIds` holds the ones the caller chose
 *  to leave behind; deselecting the earliest shift moves the anchor to the next one that
 *  is still going, which is what makes "5 days later" mean 5 days from what actually moves.
 *  A job with nothing left to move, or `days: 0`, comes back unchanged.
 *
 *  `advanceDays` counts working days for the caller's own calendar (the scheduling
 *  settings), which is why it is injected rather than assumed here. */
export const moveJobDays = (
  job: Job,
  days: number,
  advanceDays: (startKey: string, days: number) => string,
  skipShiftIds: string[] = [],
): Job => {
  if (days === 0) return job;
  const movable = (job.allocations ?? []).filter(a => !a.pinned && a.startDate && !skipShiftIds.includes(a.id));
  if (movable.length === 0) return job;
  const anchor = movable.reduce((first, a) => (a.startDate! < first ? a.startDate! : first), movable[0].startDate!);
  const delta = dayDelta(anchor, advanceDays(anchor, days));
  if (delta === 0) return job;
  return movable.reduce(
    (acc, a) => moveAllocation(acc, a.id, addDaysToKey(a.startDate!, delta)),
    job,
  );
};

/** Split a shift at today's boundary into the history it has already worked and the
 *  remainder still to come.
 *
 *  Elapsed days are history: they keep their hours and windows rather than sliding with a
 *  reschedule, because with no timesheet in the model `hoursAssignments` on an elapsed day is
 *  the ONLY record that the work happened. Moving it destroys that record, frees the member's
 *  capacity, and invites the completed work to be booked a second time.
 *
 *  The boundary is strictly before `todayKey`: today itself stays movable, because rain
 *  arriving at 9am and the day's work being pushed out is the commonest reschedule there is.
 *
 *  Skipped days never count as worked — the decision reads `allocWorkedDayKeys`, not the raw
 *  span. Returns `{ moving }` alone when nothing has elapsed, `{ pinned }` alone when
 *  everything has, and both when it genuinely splits. Hours are partitioned: every date key
 *  lands in exactly one side. */
export const splitPinnedPast = (
  alloc: JobCrewAllocation,
  todayKey: string,
  nonWorkingWeekdays: number[],
): { pinned?: JobCrewAllocation; moving?: JobCrewAllocation } => {
  const worked = allocWorkedDayKeys(alloc, nonWorkingWeekdays);
  const past = worked.filter(k => k < todayKey);
  const future = worked.filter(k => k >= todayKey);

  if (!past.length) return { moving: alloc };
  if (!future.length) return { pinned: { ...alloc, pinned: true } };

  // Keep only the date-keyed entries on one side of the boundary. Absent stays absent, so a
  // shift that never had windows or hours does not grow empty maps.
  const sliceDays = <T,>(
    map: Record<string, T> | undefined, keep: (k: string) => boolean,
  ): Record<string, T> | undefined =>
    map ? Object.fromEntries(Object.entries(map).filter(([k]) => keep(k))) : undefined;

  const sliceHours = (
    ha: JobCrewAllocation['hoursAssignments'], keep: (k: string) => boolean,
  ): JobCrewAllocation['hoursAssignments'] =>
    ha
      ? Object.fromEntries(
          Object.entries(ha).map(([memberId, days]) => [memberId, sliceDays(days, keep)!]),
        )
      : undefined;

  const isPast = (k: string) => k < todayKey;
  const isFuture = (k: string) => k >= todayKey;

  const pinned = normalizeAlloc({
    ...alloc,
    id: `${alloc.id}-worked`,
    pinned: true,
    startDate: past[0],
    endDate: past[past.length - 1],
    ...(alloc.dailyHours ? { dailyHours: sliceDays(alloc.dailyHours, isPast)! } : {}),
    ...(alloc.skipDays ? { skipDays: alloc.skipDays.filter(isPast) } : {}),
    ...(alloc.hoursAssignments ? { hoursAssignments: sliceHours(alloc.hoursAssignments, isPast)! } : {}),
  });

  const moving = normalizeAlloc({
    ...alloc,
    startDate: future[0],
    endDate: alloc.endDate,
    ...(alloc.dailyHours ? { dailyHours: sliceDays(alloc.dailyHours, isFuture)! } : {}),
    ...(alloc.skipDays ? { skipDays: alloc.skipDays.filter(isFuture) } : {}),
    ...(alloc.hoursAssignments ? { hoursAssignments: sliceHours(alloc.hoursAssignments, isFuture)! } : {}),
  });

  return { pinned, moving };
};

/** Commit a change, keeping any elapsed days as history.
 *
 *  Splits every unpinned shift at `todayKey` first, then moves only the remainders — and
 *  measures the move's delta from the first SURVIVING day rather than the old start. That
 *  distinction is the whole point: a job running Mon-Wed that is pushed to the following
 *  Monday must land Wednesday's work on that Monday, not a further two days out because the
 *  delta was measured from a Monday that is now frozen history.
 *
 *  Lives here rather than in scheduleEngine.ts because splitPinnedPast does, and shifts.ts
 *  already depends on the engine — composing in the other direction would make the pair a
 *  cycle. Without `todayKey` this is plain `applyChangeToJob`, so existing callers are
 *  unaffected. */
export const applyChangeToJobPinningPast = (
  job: Job,
  change: ProposedChange,
  opts: { todayKey?: string; nonWorkingWeekdays?: number[] } = {},
): Job => {
  const { todayKey, nonWorkingWeekdays = [] } = opts;
  if (!todayKey || !job.allocations?.length) return applyChangeToJob(job, change);

  const target = change.shiftId
    ? job.allocations.filter(a => a.id === change.shiftId)
    : job.allocations;
  const splits = target
    .filter(a => !a.pinned)
    .map(a => ({ id: a.id, ...splitPinnedPast(a, todayKey, nonWorkingWeekdays) }));

  const pinnedShifts = splits.map(s => s.pinned).filter((a): a is JobCrewAllocation => !!a);
  const movingShifts = splits.map(s => s.moving).filter((a): a is JobCrewAllocation => !!a);

  // Everything this change would touch has already elapsed — there is nothing left to move.
  if (!movingShifts.length) return job;

  const untouched = job.allocations.filter(a => a.pinned || !splits.some(s => s.id === a.id));
  const staged: Job = { ...job, allocations: [...untouched, ...pinnedShifts, ...movingShifts] };
  const unpinned = staged.allocations!.filter(a => !a.pinned && a.startDate);

  // No history anywhere on this job, so the engine's own origin is already right and this is
  // exactly today's behaviour.
  if (staged.allocations!.every(a => !a.pinned)) return applyChangeToJob(job, change);

  // Otherwise the delta must be measured from the earliest day still live, NOT from the job's
  // envelope start — once anything is pinned, that start is frozen history. This holds on a
  // SECOND reschedule too, when this call splits nothing but an earlier one already did: the
  // envelope still begins in the past, so deferring to the engine's default would overshoot
  // the target by the length of the frozen prefix.
  const deltaFromKey = unpinned.map(a => a.startDate).sort()[0];

  return applyChangeToJob(staged, change, { deltaFromKey });
};
