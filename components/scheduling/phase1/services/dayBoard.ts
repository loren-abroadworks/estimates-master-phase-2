import type { Job } from '../types';
import { BoardLane, BoardCard, jobDayWindow } from './productionBoard';
import { allocDayWindow } from './scheduleEngine';

const MIN_HEIGHT_PCT = 4; // smallest visible block
const SNAP_HOURS = 0.25; // 15 minutes

export interface DayBlock {
  card: BoardCard;
  topPct: number;     // 0–100, block top within the hour axis
  heightPct: number;  // 0–100, block height
  leftPct: number;    // 0–100, horizontal offset (cascade overlap layout)
  widthPct: number;   // 0–100, horizontal width
  zIndex: number;     // stacking order within an overlap cluster (higher = on top)
  startTime: string;  // HH:mm shown on the block (pre-clamp)
  endTime: string;
  clamped: boolean;   // true if real times fell outside the axis
}

export interface DayRow {
  laneId: string;
  laneName: string;
  blocks: DayBlock[];
}

export interface BlockSegment {
  topPct: number;    // 0–100, segment top within the hour axis
  heightPct: number; // 0–100, segment height
}

const SEGMENT_EPS_PCT = 0.3; // drop hairline segments left by edge breaks

// "HH:mm" -> fractional hours (e.g. "10:30" -> 10.5).
const toHours = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h + (m || 0) / 60;
};

const fromHours = (h: number): string => {
  const total = Math.round(h * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

/** Re-resolve each card's start/end clock to its own day's per-day window, so the
 *  day view shows that day's hours rather than the job's overall span window. The
 *  shared card from the week builders carries the start-day start → end-day end,
 *  which is wrong for any other day of a multi-day job. Returns new lanes/cards;
 *  the originals are untouched (cards may be shared across member lanes). */
export const withDayWindows = (lanes: BoardLane[], jobs: Job[]): BoardLane[] => {
  const byId = new Map(jobs.map(j => [j.id, j]));
  return lanes.map(lane => ({
    ...lane,
    cardsByDay: Object.fromEntries(
      Object.entries(lane.cardsByDay).map(([key, cards]) => [
        key,
        cards.map(card => {
          const job = byId.get(card.jobId);
          if (!job) return card;
          const alloc = card.shiftId ? job.allocations?.find(a => a.id === card.shiftId) : undefined;
          const win = alloc ? allocDayWindow(alloc, key) : jobDayWindow(job, key);
          return win ? { ...card, startTime: win.startTime, endTime: win.endTime } : card;
        }),
      ]),
    ),
  }));
};

/** Turn each lane's cards into vertically-positioned hour blocks for one day.
 *  Times are taken from the card's per-day window (resolved by withDayWindows on
 *  the day lanes via jobDayWindow), clamped to [axisStart, axisEnd]. */
export const buildDayBlocks = (
  lanes: BoardLane[],
  dayKey: string,
  axisStart: number,
  axisEnd: number,
): DayRow[] => {
  const span = Math.max(1, axisEnd - axisStart);
  return lanes.map(lane => {
    const cards = lane.cardsByDay[dayKey] ?? [];
    const blocks = cards.map<DayBlock>(card => {
      const rawStart = toHours(card.startTime);
      const rawEnd = toHours(card.endTime);
      const start = Math.min(Math.max(rawStart, axisStart), axisEnd);
      const end = Math.min(Math.max(rawEnd, axisStart), axisEnd);
      const topPct = ((start - axisStart) / span) * 100;
      const heightPct = Math.max(MIN_HEIGHT_PCT, ((end - start) / span) * 100);
      return {
        card,
        topPct,
        heightPct,
        leftPct: 0,
        widthPct: 100,
        zIndex: 0,
        startTime: card.startTime,
        endTime: card.endTime,
        clamped: rawStart < axisStart || rawEnd > axisEnd,
      };
    });
    layoutOverlaps(blocks);
    return { laneId: lane.crewId, laneName: lane.crewName, blocks };
  });
};

/** Split a job's [startH, endH] (fractional hours) into the visible segments left
 *  after removing each fixed-break interval that overlaps the window. `breaks` are
 *  fixed breaks ({ startTime: 'HH:mm', durationMinutes }); paid status is irrelevant
 *  here — the caller decides which breaks to pass. Segments are top/height
 *  percentages of [axisStart, axisEnd], clamped to the axis and ordered top→bottom.
 *  No overlapping break → a single full-window segment. */
export const splitBlockAroundBreaks = (
  startH: number,
  endH: number,
  breaks: { startTime: string; durationMinutes: number }[],
  axisStart: number,
  axisEnd: number,
): BlockSegment[] => {
  const span = Math.max(1, axisEnd - axisStart);
  const winStart = Math.min(Math.max(startH, axisStart), axisEnd);
  const winEnd = Math.min(Math.max(endH, axisStart), axisEnd);
  if (winEnd <= winStart) return [];

  // Break intervals clamped to the job window, sorted, only those that overlap.
  const cuts = breaks
    .map(b => {
      const bs = toHours(b.startTime);
      return { s: Math.max(bs, winStart), e: Math.min(bs + b.durationMinutes / 60, winEnd) };
    })
    .filter(c => c.e > c.s)
    .sort((a, b) => a.s - b.s);

  const toSeg = (s: number, e: number): BlockSegment => ({
    topPct: ((s - axisStart) / span) * 100,
    heightPct: ((e - s) / span) * 100,
  });

  const segments: BlockSegment[] = [];
  let cursor = winStart;
  for (const c of cuts) {
    if (c.s > cursor) segments.push(toSeg(cursor, c.s));
    cursor = Math.max(cursor, c.e);
  }
  if (winEnd > cursor) segments.push(toSeg(cursor, winEnd));
  return segments.filter(s => s.heightPct >= SEGMENT_EPS_PCT);
};

// Largest per-column horizontal offset; later overlap columns shift right by this
// (capped) and stack on top, so each card's left edge stays visible.
const MAX_OFFSET_PCT = 70;
const STEP_PCT = 18;

/** Lay overlapping blocks as a cascade (Google-Calendar style): blocks are grouped
 *  into overlap clusters, greedy-packed into columns, then each column is offset to
 *  the right and stacked on top of the previous so cards overlap yet each peeks out.
 *  Mutates blocks' leftPct/widthPct/zIndex in place. */
const layoutOverlaps = (blocks: DayBlock[]): void => {
  if (blocks.length < 2) return;
  const top = (b: DayBlock) => b.topPct;
  const bottom = (b: DayBlock) => b.topPct + b.heightPct;
  const sorted = [...blocks].sort((a, b) => top(a) - top(b) || bottom(a) - bottom(b));

  // Split into clusters of transitively-overlapping blocks (a gap closes a cluster).
  let cluster: DayBlock[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    if (!cluster.length) return;
    // Greedy column packing within the cluster (blocks already sorted by start);
    // non-overlapping blocks reuse an earlier column (same offset).
    const colEnds: number[] = [];
    const colOf = new Map<DayBlock, number>();
    for (const b of cluster) {
      let c = colEnds.findIndex(end => top(b) >= end);
      if (c === -1) { c = colEnds.length; colEnds.push(0); }
      colEnds[c] = bottom(b);
      colOf.set(b, c);
    }
    const cols = colEnds.length;
    const step = cols > 1 ? Math.min(STEP_PCT, MAX_OFFSET_PCT / (cols - 1)) : 0;
    for (const b of cluster) {
      const c = colOf.get(b)!;
      b.leftPct = c * step;
      b.widthPct = 100 - b.leftPct;
      b.zIndex = c;
    }
    cluster = [];
    clusterEnd = -Infinity;
  };
  for (const b of sorted) {
    if (cluster.length && top(b) >= clusterEnd) flush();
    cluster.push(b);
    clusterEnd = Math.max(clusterEnd, bottom(b));
  }
  flush();
};

/** Pure: return a new Job with this day's start/end clock times set in dailyHours. */
export const setJobDayWindow = (
  job: Job,
  dayKey: string,
  window: { startTime: string; endTime: string },
): Job => ({
  ...job,
  dailyHours: { ...job.dailyHours, [dayKey]: window },
});

/** Shift a day window by deltaHours, snapped to 15 min, clamped so the block
 *  stays within [axisStart, axisEnd] and keeps its duration. */
export const shiftDayWindow = (
  window: { startTime: string; endTime: string },
  deltaHours: number,
  axisStart: number,
  axisEnd: number,
): { startTime: string; endTime: string } => {
  const start = toHours(window.startTime);
  const end = toHours(window.endTime);
  const dur = end - start;
  const snapped = Math.round(deltaHours / SNAP_HOURS) * SNAP_HOURS;
  let newStart = start + snapped;
  newStart = Math.max(axisStart, Math.min(newStart, axisEnd - dur));
  return { startTime: fromHours(newStart), endTime: fromHours(newStart + dur) };
};
