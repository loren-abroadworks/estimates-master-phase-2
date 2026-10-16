import type React from 'react';

// MIME type carrying a dragged job's id between a job card and a drop target
// (crew member row, or a board day cell). Shared so every drag source/target
// uses the same channel.
export const JOB_DND_TYPE = 'application/x-job-id';

// MIME type carrying a dragged SHIFT's id alongside JOB_DND_TYPE, so drop targets can
// assign directly into that shift (skipping the shift picker).
export const SHIFT_DND_TYPE = 'application/x-shift-id';

// True when a drag carries a job payload. `dataTransfer.types` (the keys) is readable
// during dragover — unlike the values — so drop targets use it to light up.
export const isJobDrag = (e: React.DragEvent): boolean =>
  e.dataTransfer.types.includes(JOB_DND_TYPE);

// MIME type carrying an existing day chip's hours while it is dragged from one crew
// member to another in the hours grid. Deliberately NOT JOB_DND_TYPE: a chip drag must
// not trigger the job-assign drop handlers.
export const HOURS_DND_TYPE = 'application/x-hours-transfer';

/** One day chip's booking, as handed from one member to another. `hours` is the gross
 *  (scheduled) figure — the destination's own unpaid break is carved on read. */
export interface HoursTransfer {
  memberId: string;
  dateKey: string;
  jobId: string;
  shiftId?: string;
  hours: number;
}

/** True when a drag carries a day chip's hours. */
export const isHoursDrag = (e: React.DragEvent): boolean =>
  e.dataTransfer.types.includes(HOURS_DND_TYPE);

/** The dragged chip read back off the drag event, or null when it carries none. */
export const readHoursTransfer = (e: React.DragEvent): HoursTransfer | null => {
  const raw = e.dataTransfer.getData(HOURS_DND_TYPE);
  if (!raw) return null;
  try {
    const t = JSON.parse(raw) as HoursTransfer;
    return t && t.memberId && t.dateKey && t.jobId && t.hours > 0 ? t : null;
  } catch {
    return null;
  }
};
