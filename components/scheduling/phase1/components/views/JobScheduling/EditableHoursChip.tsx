import React, { useState } from 'react';
import type { MemberDayCell } from '../../../services/crewHoursGrid';
import { fmtClock } from '../../../services/productionBoard';
import { HOURS_DND_TYPE, type HoursTransfer } from './jobDnd';
import { useTranslation } from '../../../i18n/LanguageContext';

interface EditableHoursChipProps {
  cell: MemberDayCell;
  canEdit: boolean;
  /** aria-label for the hours input. */
  editLabel: string;
  onSelectJob?: (jobId: string) => void;
  /** Commit a positive hour value for this cell. */
  onCommit: (hours: number) => void;
  /** Clear the cell (hours emptied or set to 0). */
  onRemove: () => void;
  /** This chip's booking, which makes it draggable onto another crew member. Omit to
   *  leave the chip fixed in place. */
  transfer?: HoursTransfer;
  /** The drag started (or ended, with null), so the grid can light up its drop targets. */
  onTransferDrag?: (t: HoursTransfer | null) => void;
  /** The member's working window that day, e.g. "8am–12pm", for the warning text. */
  availWindow?: string;
  /** Hours the member can work that day, for the "past the Xh they work" warning. */
  availableHours?: number;
  /** The member's name, for the off-day warning. */
  memberName?: string;
  /** How this chip reads against the currently selected job: 'on' for the selected job
   *  itself, 'off' for everything else. Omit when no job is selected — the chip then
   *  looks exactly as it always has. */
  highlight?: 'on' | 'off';
}

/** A single job chip in the crew hours grids: the job name (opens details), its
 *  working-window time, and an inline-editable hours field. Holds its own draft so the
 *  field can be cleared mid-edit without the chip disappearing. Shared by the weekly
 *  grid and the vertical day grid. */
export const EditableHoursChip = ({
  cell, canEdit, editLabel, onSelectJob, onCommit, onRemove, transfer, onTransferDrag,
  availWindow, availableHours, memberName, highlight,
}: EditableHoursChipProps) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string | null>(null);
  const isEditing = draft !== null;
  const gross = cell.grossHours ?? cell.hours;
  const breakTitle = cell.unpaidBreakHours
    ? t('views.JobScheduling.EditableHoursChip.breakBreakdown', {
        gross,
        carved: cell.unpaidBreakHours,
        label: cell.breakLabel || t('views.JobScheduling.BreakChip.break'),
      })
    : undefined;

  // Advisory only: the number a scheduler typed always stands. The chip just says what
  // it disagrees with, in the crew picker's wording.
  const availabilityLines = [
    cell.onOffDay ? t('views.JobScheduling.EditableHoursChip.offThatDay', { name: memberName ?? '' }) : '',
    cell.outsideAvailability && availWindow
      ? t('views.JobScheduling.EditableHoursChip.outsideWorkWindow', { window: availWindow })
      : '',
    cell.overAvailableHours
      ? t('views.JobScheduling.EditableHoursChip.overAvailable', { hours: cell.overAvailableHours, available: availableHours ?? 0 })
      : '',
  ].filter(Boolean);
  const flagged = availabilityLines.length > 0;
  const hoursTitle = [breakTitle, ...availabilityLines].filter(Boolean).join(' · ') || undefined;

  const draggable = canEdit && !!transfer;

  // The selected job keeps its colour and gains a ring; everything else recedes so the
  // one job reads at a glance on a dense week.
  const highlightClass = highlight === 'on'
    ? 'ring-2 ring-gray-900/70 dark:ring-white ring-offset-1 ring-offset-white dark:ring-offset-gray-800 shadow-md'
    : highlight === 'off' ? 'opacity-40' : '';

  return (
    <div
      data-highlight={highlight}
      draggable={draggable}
      onDragStart={draggable ? (e) => {
        // Dragging inside the hours field is text selection, not a transfer.
        if ((e.target as HTMLElement).tagName === 'INPUT') { e.preventDefault(); return; }
        e.dataTransfer.setData(HOURS_DND_TYPE, JSON.stringify(transfer));
        e.dataTransfer.effectAllowed = 'move';
        onTransferDrag?.(transfer!);
      } : undefined}
      onDragEnd={draggable ? () => onTransferDrag?.(null) : undefined}
      className={`group/chip flex items-center gap-1.5 rounded-lg pl-2 pr-1 py-1 text-white shadow-sm transition-all ${draggable ? 'cursor-grab active:cursor-grabbing' : ''} ${highlightClass}`}
      style={{ backgroundColor: cell.color }}
      title={`${cell.jobNumber} · ${cell.jobName}${cell.shiftName ? ` · ${cell.shiftName}` : ''}`}
    >
      <button
        type="button"
        onClick={() => onSelectJob?.(cell.jobId)}
        aria-label={t('views.JobScheduling.EditableHoursChip.viewJobDetails', { name: cell.jobName || cell.jobNumber })}
        title={t('views.JobScheduling.EditableHoursChip.viewJobDetails', { name: cell.jobName || cell.jobNumber })}
        className="group/openjob min-w-0 flex-1 text-left focus:outline-none"
      >
        <div className="truncate text-[11px] font-bold leading-tight group-hover/openjob:underline">
          {cell.jobName || cell.jobNumber}
        </div>
        {cell.startTime && cell.endTime && (
          <div className="truncate text-[10px] font-medium text-white/70 leading-tight">
            {/* The shift name pops (bold, full white); the time window stays muted. */}
            {cell.shiftName && <span className="font-bold text-white">{cell.shiftName}</span>}
            {cell.shiftName ? ' · ' : ''}{fmtClock(cell.startTime)}–{fmtClock(cell.endTime)}
          </div>
        )}
      </button>
      {canEdit ? (
        <input
          type="number"
          min={0}
          title={hoursTitle}
          // Idle: show net worked hours. On focus, edit the gross (scheduled/typed)
          // value so the user's input is never silently rewritten by the break carve.
          value={isEditing ? draft! : cell.hours}
          onFocus={() => setDraft(String(gross))}
          onChange={e => {
            const raw = e.target.value;
            setDraft(raw);
            // Commit a valid positive value live; an empty/zero field is held
            // until blur so the chip stays put.
            const v = Number(raw);
            if (raw !== '' && v > 0) onCommit(v);
          }}
          onBlur={() => {
            const raw = isEditing ? draft! : String(gross);
            const v = Number(raw);
            if (raw === '' || !(v > 0)) onRemove();
            setDraft(null);
          }}
          aria-label={editLabel}
          className={`w-8 text-right text-xs font-bold text-white rounded px-0.5 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
            flagged ? 'bg-amber-300/40 ring-2 ring-amber-300 focus:bg-amber-300/60' : 'bg-white/25 focus:bg-white/40'
          }`}
        />
      ) : (
        <span
          className={`text-xs font-bold text-white rounded px-0.5 ${flagged ? 'bg-amber-300/40 ring-2 ring-amber-300' : ''}`}
          title={hoursTitle}
        >{cell.hours}</span>
      )}
      <span className="text-[10px] text-white/70 font-medium">{t('views.JobScheduling.EditableHoursChip.hoursUnit')}</span>
    </div>
  );
};
