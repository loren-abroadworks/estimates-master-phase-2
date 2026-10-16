import type { Job, CrewMember, JobCrewAllocation } from '../types';
import { WorkingTimeConfig, occupiesWorkingDay, toLocalDateKey, allocDayWindow } from './scheduleEngine';

export interface BoardCard {
  jobId: string;
  jobName: string;
  jobNumber: string;
  color: string;
  startKey: string;        // local YYYY-MM-DD
  endKey: string;
  isLocked: boolean;
  startTime: string;       // HH:mm — first working day's start
  endTime: string;         // HH:mm — last working day's end
  shiftId?: string;        // present when this bar is one shift of a multi-shift job
  shiftName?: string;
  /** Days inside [startKey, endKey] the bar does NOT occupy (the shift's skipped days). */
  skipDays?: string[];
  /** Crew assigned to this bar — the shift's members, or the whole job's for legacy cards. */
  memberIds?: string[];
}

const pad2 = (n: number) => String(n).padStart(2, '0');
const timeOf = (iso: string) => `${pad2(new Date(iso).getHours())}:${pad2(new Date(iso).getMinutes())}`;

/** A job's working window on a specific local YYYY-MM-DD: the per-day override in
 *  `dailyHours` when present, else the job's overall start/end clock. Null when
 *  the job is unscheduled. Shared by the board, hours grid and assign modal. */
export const jobDayWindow = (job: Job, dateKey: string): { startTime: string; endTime: string } | null => {
  if (!job.startDate) return null;
  const o = job.dailyHours?.[dateKey];
  return {
    startTime: o?.startTime ?? timeOf(job.startDate),
    endTime: o?.endTime ?? timeOf(job.endDate || job.startDate),
  };
};

/** Reflect a staged reschedule on a job for board/grid display: move it to the
 *  change's new span AND carry the per-day windows so each day cell reads its own
 *  hours instead of falling back to the job's overall start/end clock. Precedence
 *  (low→high): the job's saved windows, the staged change's re-flowed windows, then
 *  live per-day edits the user is making in the editor (which may touch days the
 *  re-flow didn't, e.g. a later day's start). */
export const withStagedWindow = (
  job: Job,
  change: { newStart: string; newEnd: string | null; dailyHours?: Record<string, { startTime: string; endTime: string }> },
  edits?: Record<string, { startTime: string; endTime: string }>,
): Job => ({
  ...job,
  startDate: change.newStart,
  endDate: change.newEnd ?? change.newStart,
  dailyHours: { ...job.dailyHours, ...change.dailyHours, ...edits },
});

/** "08:00" → "8:00 AM" — the app's 12-hour clock display. */
export const fmtClock = (hhmm: string): string => {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad2(m)} ${period}`;
};

/** Start/end clock times for a job's board card — the start day's start hour and
 *  the end day's end hour, honoring per-day overrides in `dailyHours`. */
export const cardHours = (job: Job): { startTime: string; endTime: string } => {
  const startKey = toLocalDateKey(new Date(job.startDate!));
  const endKey = toLocalDateKey(new Date(job.endDate || job.startDate!));
  return {
    startTime: job.dailyHours?.[startKey]?.startTime ?? timeOf(job.startDate!),
    endTime: job.dailyHours?.[endKey]?.endTime ?? timeOf(job.endDate || job.startDate!),
  };
};

export interface BoardLane {
  crewId: string;          // member id, job id, or 'unassigned'
  crewName: string;
  /** day key -> cards present that day */
  cardsByDay: Record<string, BoardCard[]>;
  inactive?: boolean;      // member exists in roster but status === 'Inactive'
  available?: boolean;     // member has no assigned work this week (member lanes only)
}

const PALETTE = ['#06b6d4','#f97316','#ec4899','#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6'];
export const jobColor = (id: string): string => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return PALETTE[Math.abs(hash) % PALETTE.length];
};

/** Board columns with non-working weekdays removed (e.g. Sat/Sun disabled in
 *  scheduling settings). Falls back to the full set if every day is non-working,
 *  so the board never renders zero columns. */
export const visibleWeekDays = (weekDays: Date[], config: WorkingTimeConfig): Date[] => {
  const visible = weekDays.filter(d => !config.weekendDays.includes(d.getDay()));
  return visible.length ? visible : weekDays;
};

// Shared helpers for the member/job lane builders.
const memberIdsOf = (job: Job): string[] => {
  const ids = new Set<string>(job.crewMemberIds || []);
  job.allocations?.forEach(a => a.memberIds?.forEach(m => ids.add(m)));
  return [...ids];
};

const schedulable = (job: Job): boolean =>
  !!job.startDate && job.stage !== 'Completed' && job.stage !== 'Marketing' && job.stage !== 'Cancelled';

const cardFor = (job: Job): BoardCard => ({
  jobId: job.id, jobName: job.name, jobNumber: job.jobNumber,
  color: jobColor(job.id),
  startKey: toLocalDateKey(new Date(job.startDate!)),
  endKey: toLocalDateKey(new Date(job.endDate || job.startDate!)),
  isLocked: !!job.is_locked,
  ...cardHours(job),
});

/** Start/end clock for a shift's board bar: its start-day start → end-day end,
 *  honoring per-day window overrides. */
export const shiftCardHours = (alloc: JobCrewAllocation): { startTime: string; endTime: string } => ({
  startTime: allocDayWindow(alloc, alloc.startDate).startTime,
  endTime: allocDayWindow(alloc, alloc.endDate).endTime,
});

/** The board bars for a job, one per shift, each paired with the members that shift
 *  covers (for member-lane placement). Jobs with `allocations` yield one card per
 *  dated shift (tinted by shift color, spanning the shift's own dates); legacy jobs
 *  (crew via `crewMemberIds`, no allocations) yield a single job-spanning card with
 *  no shift identity — unchanged from before shifts. */
export const boardShifts = (job: Job): { card: BoardCard; memberIds: string[] }[] => {
  if (job.allocations?.length) {
    return job.allocations
      .filter(a => a.startDate)
      .map(alloc => ({
        card: {
          jobId: job.id, jobName: job.name, jobNumber: job.jobNumber,
          color: alloc.color ?? jobColor(job.id),
          startKey: alloc.startDate,
          endKey: alloc.endDate || alloc.startDate,
          isLocked: !!job.is_locked,
          // A job's ONLY shift is presentational noise (the default "Crew") — keep the
          // id for behavior but suppress the name so labels read as the job.
          shiftId: alloc.id, shiftName: job.allocations!.length >= 2 ? alloc.name : undefined,
          ...(alloc.skipDays?.length ? { skipDays: alloc.skipDays } : {}),
          ...shiftCardHours(alloc),
          memberIds: alloc.memberIds ?? [],
        },
        memberIds: alloc.memberIds ?? [],
      }));
  }
  const legacyMemberIds = memberIdsOf(job);
  return [{ card: { ...cardFor(job), memberIds: legacyMemberIds }, memberIds: legacyMemberIds }];
};

/** A card occupies a day when the day falls in the card's span and is a working day.
 *  Card date keys are bare YYYY-MM-DD; anchor at local noon so the Date parse used by
 *  occupiesWorkingDay doesn't drop a day in negative-offset timezones. */
const cardOccupies = (card: BoardCard, dayKey: string, config: WorkingTimeConfig): boolean =>
  !card.skipDays?.includes(dayKey) &&
  occupiesWorkingDay(`${card.startKey}T12:00:00`, `${card.endKey}T12:00:00`, dayKey, config);

/** Lanes keyed by team member (rows = members). A job appears in every assigned
 *  member's lane. Members with no work this week are flagged `available` and
 *  sorted after the busy members (rendered under an "Available this week" group).
 *  Jobs whose crew can't be resolved to a known member don't appear here — they
 *  belong to no person, and surface in the Job view instead. */
export const buildMemberLanes = (
  jobs: Job[],
  staff: CrewMember[],
  weekDays: Date[],
  config: WorkingTimeConfig,
): BoardLane[] => {
  const dayKeys = weekDays.map(toLocalDateKey);
  const byId = new Map(staff.map(s => [s.id, s]));
  const lanes = new Map<string, BoardLane>();
  const ensure = (id: string, name: string, inactive?: boolean): BoardLane => {
    if (!lanes.has(id)) lanes.set(id, { crewId: id, crewName: name, cardsByDay: {}, ...(inactive ? { inactive: true } : {}) });
    return lanes.get(id)!;
  };

  // Seed a lane for every ACTIVE member so they render even with no work.
  // Inactive members only get a lane when they actually have a job (added below).
  staff.filter(m => m.status !== 'Inactive').forEach(m => ensure(m.id, m.name));

  for (const job of jobs) {
    if (!schedulable(job)) continue;
    for (const { card, memberIds } of boardShifts(job)) {
      const known = memberIds.filter(id => byId.has(id));
      for (const target of known) {
        const member = byId.get(target)!;
        const lane = ensure(target, member.name, member.status === 'Inactive');
        for (const key of dayKeys) {
          if (cardOccupies(card, key, config)) (lane.cardsByDay[key] ||= []).push(card);
        }
      }
    }
  }

  // Members with no cards this week are "available"; group them after the busy
  // ones while preserving input order within each group.
  const all = [...lanes.values()];
  all.forEach(l => { if (Object.keys(l.cardsByDay).length === 0) l.available = true; });
  return [...all.filter(l => !l.available), ...all.filter(l => l.available)];
};

/** Lanes keyed by job (one row per job that occupies the visible week). */
export const buildJobLanes = (
  jobs: Job[],
  weekDays: Date[],
  config: WorkingTimeConfig,
): BoardLane[] => {
  const dayKeys = weekDays.map(toLocalDateKey);
  const lanes: BoardLane[] = [];

  for (const job of jobs) {
    if (!schedulable(job)) continue;
    const cardsByDay: Record<string, BoardCard[]> = {};
    for (const { card } of boardShifts(job)) {
      for (const key of dayKeys) {
        if (cardOccupies(card, key, config)) (cardsByDay[key] ||= []).push(card);
      }
    }
    if (Object.keys(cardsByDay).length === 0) continue; // not in this week
    lanes.push({ crewId: job.id, crewName: job.name, cardsByDay });
  }

  const firstKey = (l: BoardLane) => Object.keys(l.cardsByDay).sort()[0] ?? '';
  return lanes.sort((a, b) => firstKey(a).localeCompare(firstKey(b)) || a.crewName.localeCompare(b.crewName));
};

export interface PlacedBar { card: BoardCard; startCol: number; span: number; track: number; }
export interface LaneLayout { bars: PlacedBar[]; trackCount: number; }

/** Turn a lane's per-day cards into spanning bars, stacking overlaps onto tracks. */
export const layoutLaneBars = (lane: BoardLane, dayKeys: string[]): LaneLayout => {
  // Collect, per job, the column indices it occupies in the visible week.
  const cols = new Map<string, { card: BoardCard; idxs: number[] }>();
  dayKeys.forEach((key, i) => {
    for (const card of lane.cardsByDay[key] || []) {
      const barKey = `${card.jobId}::${card.shiftId ?? ''}`;
      const entry = cols.get(barKey) ?? { card, idxs: [] };
      entry.idxs.push(i);
      cols.set(barKey, entry);
    }
  });

  // One bar per RUN of consecutive columns, not one bar per job: a day the job doesn't
  // work (a skipped shift day, or a mid-week holiday) leaves a hole in `idxs`, and a bar
  // must not paint over a day it doesn't occupy. Without holes this yields exactly one
  // bar per job, as before.
  const bars: PlacedBar[] = [...cols.values()].flatMap(({ card, idxs }) => {
    const sorted = [...idxs].sort((a, b) => a - b);
    const runs: PlacedBar[] = [];
    let start = sorted[0];
    let prev = sorted[0];
    for (const i of sorted.slice(1)) {
      if (i === prev + 1) { prev = i; continue; }
      runs.push({ card, startCol: start, span: prev - start + 1, track: 0 });
      start = i; prev = i;
    }
    runs.push({ card, startCol: start, span: prev - start + 1, track: 0 });
    return runs;
  });

  // Greedy track packing: sort by start, then name; place each bar on the first
  // track whose previous bar ended before this one starts.
  bars.sort((a, b) =>
    a.startCol - b.startCol
    || a.card.jobName.localeCompare(b.card.jobName)
    || (a.card.shiftName ?? '').localeCompare(b.card.shiftName ?? ''));
  const trackEnds: number[] = []; // last occupied col per track
  for (const bar of bars) {
    let t = trackEnds.findIndex(end => end < bar.startCol);
    if (t === -1) { t = trackEnds.length; trackEnds.push(-1); }
    trackEnds[t] = bar.startCol + bar.span - 1;
    bar.track = t;
  }

  return { bars, trackCount: trackEnds.length };
};
