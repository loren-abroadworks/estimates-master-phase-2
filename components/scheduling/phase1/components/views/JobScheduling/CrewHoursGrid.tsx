import React, { useState } from 'react';
import type { CrewHoursGridModel, MemberRow, MemberDayCell, JobSummary } from '../../../services/crewHoursGrid';
import { CrewAvatar } from './CrewAvatar';
import { JOB_DND_TYPE, SHIFT_DND_TYPE, isJobDrag, isHoursDrag, readHoursTransfer, type HoursTransfer } from './jobDnd';
import { WeatherIcon } from './WeatherIcon';
import type { WeatherKind } from '../../../types';
import { JobsPanel } from './JobsPanel';
import { EditableHoursChip } from './EditableHoursChip';
import { BreakChip } from './BreakChip';
import { formatWindow } from '../../../services/crewAvailability';
import { AvailabilityBadge } from './AvailabilityBadge';
import { useTranslation } from '../../../i18n/LanguageContext';

interface CrewHoursGridProps {
  model: CrewHoursGridModel;
  canEdit: boolean;
  /** Forecast by local date key ('YYYY-MM-DD' -> kind), shown in each day header. */
  weather?: Record<string, WeatherKind>;
  onAssignWeek: (memberId: string) => void;
  onEditDay: (memberId: string, dateKey: string, jobId: string, hours: number, shiftId?: string) => void;
  onRemoveDay: (memberId: string, dateKey: string, jobId: string, shiftId?: string) => void;
  /** Fired when a job is dropped onto a member row. */
  onDropJobOnMember: (memberId: string, jobId: string, shiftId?: string) => void;
  /** Fired when a day chip is dragged onto another member's cell in the same day column:
   *  the source booking, and the member the hours should move to. Omit to keep chips fixed. */
  onTransferHours?: (source: HoursTransfer, toMemberId: string) => void;
  /** Fired when a job card is clicked, to open its details panel. */
  onSelectJob?: (jobId: string) => void;
  /** The selected job, shown on the grid: its chips are ringed, the rest recede, and the
   *  members working it are tinted. Null/omitted leaves the grid unhighlighted. */
  highlightJobId?: string | null;
  /** When false, hide the availability overlays (Off cells, break chips) so only the
   *  job schedule shows. Defaults to true. */
  showAvailability?: boolean;
  /** Sidebar heading + empty-state copy. Defaults suit the weekly grid; the Day
   *  view passes the "today" variants. */
  sidebarTitle?: string;
  sidebarEmptyLabel?: string;
  sidebarAllStaffedLabel?: string;
  /** Hide the jobs sidebar to give the grid full width (e.g. while the job
   *  details panel is open). The sidebar returns when this is false. */
  hideSidebar?: boolean;
  /** Job list for the sidebar. When omitted, the grid's week jobs are used. Lets the
   *  sidebar show a different period (month/year) than the week grid. */
  sidebarJobs?: JobSummary[];
  sidebarPeriod?: 'week' | 'month' | 'year';
  onSidebarPeriodChange?: (p: 'week' | 'month' | 'year') => void;
  sidebarCompact?: boolean;
  onSidebarCompactChange?: (v: boolean) => void;
}

const dayLabel = (key: string) => {
  const d = new Date(`${key}T12:00:00`);
  return {
    weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
    day: d.toLocaleDateString(undefined, { day: 'numeric' }),
  };
};

// Capacity bar fill + tone: emerald within capacity, red once over.
const capacityTone = (row: MemberRow) => {
  if (row.overCapacity) return { bar: 'bg-red-500', text: 'text-red-600 dark:text-red-400' };
  if (row.capacity > 0 && row.weekTotal === row.capacity) return { bar: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' };
  return { bar: 'bg-emerald-500', text: 'text-gray-700 dark:text-gray-300' };
};

export const CrewHoursGrid = ({
  model, canEdit, weather, onAssignWeek, onEditDay, onRemoveDay, onDropJobOnMember, onTransferHours, onSelectJob,
  highlightJobId,
  showAvailability = true,
  sidebarTitle,
  sidebarEmptyLabel,
  sidebarAllStaffedLabel,
  hideSidebar = false,
  sidebarJobs,
  sidebarPeriod,
  onSidebarPeriodChange,
  sidebarCompact,
  onSidebarCompactChange,
}: CrewHoursGridProps) => {
  const { t } = useTranslation();
  const resolvedSidebarTitle = sidebarTitle ?? t('views.JobScheduling.CrewHoursGrid.jobsThisWeek');
  const resolvedSidebarEmptyLabel = sidebarEmptyLabel ?? t('views.JobScheduling.CrewHoursGrid.noJobsScheduled');
  const resolvedSidebarAllStaffedLabel = sidebarAllStaffedLabel ?? t('views.JobScheduling.CrewHoursGrid.allJobsFullyStaffed');
  // The member row currently hovered during a job drag, advertised as a drop target.
  const [dragOverMemberId, setDragOverMemberId] = useState<string | null>(null);
  // The job card currently being dragged from the sidebar; its working days are
  // highlighted as columns so you can see which days the job lands on.
  const [draggingJobId, setDraggingJobId] = useState<string | null>(null);
  const sidebarJobList = sidebarJobs ?? model.jobs;
  const highlightDays = new Set(
    draggingJobId ? sidebarJobList.find(j => j.jobId === draggingJobId)?.days ?? [] : []
  );

  // Who works the selected job, anywhere in the period — their name and capacity cells
  // get tinted so "who's on this job" reads without scanning every day column.
  const highlightMembers = new Set(
    highlightJobId
      ? model.rows
          .filter(r => Object.values(r.cellsByDay).some(cells => cells.some(c => c.jobId === highlightJobId)))
          .map(r => r.memberId)
      : []
  );

  // The chip currently being dragged between members, and the cell it hovers.
  const [transferSource, setTransferSource] = useState<HoursTransfer | null>(null);
  const [transferOverCell, setTransferOverCell] = useState<string | null>(null);

  // Hours move within a day column, to another member: the day and the job's own span
  // stay put — changing the date is the reschedule flow's job.
  //
  // A day off does NOT refuse the drop. Somebody occasionally has to be booked onto one,
  // and the chip lands already flagged amber as sitting on a day off, which is the
  // warning. Blocking it left no way through.
  const canAcceptTransfer = (src: HoursTransfer | null, row: MemberRow, dateKey: string) =>
    !!onTransferHours && canEdit && !!src
    && src.dateKey === dateKey && src.memberId !== row.memberId;

  const handleTransferDrop = (row: MemberRow, dateKey: string) => (e: React.DragEvent) => {
    if (!isHoursDrag(e)) return;
    e.preventDefault();
    e.stopPropagation(); // the member row's job-assign drop must not also fire
    // Prefer the live drag state; fall back to the payload (e.g. after a re-render).
    const src = transferSource ?? readHoursTransfer(e);
    setTransferSource(null);
    setTransferOverCell(null);
    if (canAcceptTransfer(src, row, dateKey)) onTransferHours!(src!, row.memberId);
  };

  const handleMemberDrop = (memberId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const jobId = e.dataTransfer.getData(JOB_DND_TYPE);
    const shiftId = e.dataTransfer.getData(SHIFT_DND_TYPE) || undefined;
    setDragOverMemberId(null);
    if (jobId) onDropJobOnMember(memberId, jobId, shiftId);
  };

  // ── Shared cell pieces ───────────────────────────────────────────────────

  const renderMember = (row: MemberRow) => (
    canEdit ? (
      <button
        type="button"
        onClick={() => onAssignWeek(row.memberId)}
        aria-label={t('views.JobScheduling.CrewHoursGrid.assignHoursTo', { name: row.name })}
        title={t('views.JobScheduling.CrewHoursGrid.assignHoursTo', { name: row.name })}
        className="group/member flex w-full items-center gap-3 rounded-lg -mx-1.5 px-1.5 py-1 text-left hover:bg-gray-100 dark:hover:bg-gray-700/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 transition-colors"
      >
        <CrewAvatar m={{ id: row.memberId, name: row.name, photo: row.photo, color: row.color }} />
        <div className="min-w-0 flex-1">
          <div className="font-bold text-sm truncate text-gray-900 dark:text-white group-hover/member:text-primary-600 dark:group-hover/member:text-primary-400 transition-colors">{row.name}</div>
          {row.role && <div className="text-[11px] text-gray-400 truncate">{row.role}</div>}
        </div>
      </button>
    ) : (
      <div className="flex items-center gap-3">
        <CrewAvatar m={{ id: row.memberId, name: row.name, photo: row.photo, color: row.color }} />
        <div className="min-w-0 flex-1">
          <div className="font-bold text-sm truncate text-gray-900 dark:text-white">{row.name}</div>
          {row.role && <div className="text-[11px] text-gray-400 truncate">{row.role}</div>}
        </div>
      </div>
    )
  );

  const renderCapacity = (row: MemberRow) => {
    const tone = capacityTone(row);
    const pct = row.capacity > 0 ? Math.min(100, Math.round((row.weekTotal / row.capacity) * 100)) : 0;
    return (
      <>
        <div className="flex flex-wrap items-baseline gap-x-2 mb-1.5">
          <span className={`text-sm font-bold ${tone.text}`}>{row.weekTotal} / {row.capacity}h</span>
          {row.overCapacity
            ? <span className="text-[11px] font-bold text-red-500">{t('views.JobScheduling.CrewHoursGrid.hoursOver', { hours: Math.round((row.weekTotal - row.capacity) * 10) / 10 })}</span>
            : <span className="text-[11px] text-gray-400">{t('views.JobScheduling.CrewHoursGrid.hoursFree', { hours: row.remaining })}</span>}
        </div>
        <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
          <div className={`h-full rounded-full ${tone.bar} transition-all`} style={{ width: `${pct}%` }} />
        </div>
      </>
    );
  };

  const renderChip = (row: MemberRow, k: string, cell: MemberDayCell) => (
    <EditableHoursChip
      key={`${cell.jobId}:${cell.shiftId ?? ''}`}
      cell={cell}
      canEdit={canEdit}
      // The gross (scheduled) hours travel; the destination's own break is carved on read.
      transfer={onTransferHours ? { memberId: row.memberId, dateKey: k, jobId: cell.jobId, shiftId: cell.shiftId, hours: cell.grossHours ?? cell.hours } : undefined}
      onTransferDrag={(t) => { setTransferSource(t); if (!t) setTransferOverCell(null); }}
      // What the chip needs to say WHY it's flagged — only the grid knows the member's day.
      availWindow={row.availByDay[k] ? formatWindow(row.availByDay[k].startTime, row.availByDay[k].endTime) : undefined}
      availableHours={row.availableHoursByDay[k]}
      memberName={row.name}
      highlight={highlightJobId ? (cell.jobId === highlightJobId ? 'on' : 'off') : undefined}
      editLabel={t('views.JobScheduling.CrewHoursGrid.editLabel', { jobNumber: cell.jobNumber, name: row.name, date: k })}
      onSelectJob={onSelectJob}
      onCommit={(hours) => onEditDay(row.memberId, k, cell.jobId, hours, cell.shiftId)}
      onRemove={() => onRemoveDay(row.memberId, k, cell.jobId, cell.shiftId)}
    />
  );

  // ── Week table (members as rows, days as columns) ─────────────────────────

  const weekTable = (
    <div className="flex-1 min-w-0 overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
      <table className="border-separate border-spacing-0 table-fixed">
        <thead>
          <tr className="bg-gray-50 dark:bg-gray-800/60">
            <th className="sticky left-0 z-20 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 text-left px-5 py-3 text-xs font-bold uppercase tracking-widest text-gray-400 w-44">{t('views.JobScheduling.CrewHoursGrid.member')}</th>
            <th className="sticky left-44 z-20 bg-gray-50 dark:bg-gray-800 border-b border-r border-gray-200 dark:border-gray-700 px-5 py-3 text-left text-xs font-bold uppercase tracking-widest text-gray-400 w-44">{t('views.JobScheduling.CrewHoursGrid.capacity')}</th>
            {model.dayKeys.map(k => {
              const { weekday, day } = dayLabel(k);
              const total = model.dayTotals[k];
              const over = total && total.assigned > total.capacity;
              return (
                <th key={k} className={`px-3 py-3 text-center w-44 border-b border-gray-200 dark:border-gray-700 transition-colors ${
                  highlightDays.has(k) ? 'border-dashed border-t-2 border-l-2 border-r-2 border-violet-400 dark:border-violet-500' : ''
                }`}>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400">{weekday}</div>
                  <div className="flex items-center justify-center gap-1.5 leading-tight">
                    <span className="text-base font-bold text-gray-900 dark:text-white">{day}</span>
                    <WeatherIcon kind={weather?.[k]} className="w-4 h-4" />
                  </div>
                  {total && (
                    <div
                      className={`mt-1 text-[11px] font-bold tabular-nums ${over ? 'text-red-500' : 'text-gray-900 dark:text-gray-100'}`}
                      title={t('views.JobScheduling.CrewHoursGrid.hoursAssignedTooltip')}
                    >
                      {total.assigned} / {total.capacity}h
                    </div>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {model.rows.map((row, rowIdx) => {
            const rowBorder = rowIdx < model.rows.length - 1 ? 'border-b border-gray-100 dark:border-gray-700/50' : '';
            const highlighted = highlightMembers.has(row.memberId);
            // Sticky cells need an opaque background, so the tint replaces it rather than
            // layering on top.
            const memberBg = highlighted ? 'bg-primary-50 dark:bg-primary-900/40' : 'bg-white dark:bg-gray-800';
            return (
            <tr
              key={row.memberId}
              onDragOver={(e) => { if (!isJobDrag(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDragOverMemberId(row.memberId); }}
              onDragLeave={() => setDragOverMemberId(prev => (prev === row.memberId ? null : prev))}
              onDrop={handleMemberDrop(row.memberId)}
              className={`transition-colors ${
                dragOverMemberId === row.memberId
                  ? 'bg-primary-50 dark:bg-primary-900/20 ring-2 ring-inset ring-primary-400'
                  : 'hover:bg-gray-50/50 dark:hover:bg-gray-800/40'
              }`}
            >
              <td
                data-testid={`crew-member-${row.memberId}`}
                data-highlighted={highlighted ? 'true' : undefined}
                className={`sticky left-0 z-10 ${memberBg} px-5 py-4 align-middle transition-colors ${rowBorder}`}
              >{renderMember(row)}</td>
              <td
                data-highlighted={highlighted ? 'true' : undefined}
                className={`sticky left-44 z-10 ${memberBg} border-r border-gray-200 dark:border-gray-700 px-5 py-4 align-middle transition-colors ${rowBorder}`}
              >{renderCapacity(row)}</td>
              {model.dayKeys.map(k => {
                const cells = row.cellsByDay[k] ?? [];
                const cellId = `${row.memberId}:${k}`;
                const acceptsTransfer = canAcceptTransfer(transferSource, row, k);
                return (
                  <td
                    key={k}
                    data-testid={`crew-cell-${row.memberId}-${k}`}
                    onDragOver={(e) => {
                      if (!isHoursDrag(e)) return;
                      if (!acceptsTransfer) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      setTransferOverCell(cellId);
                    }}
                    onDragLeave={() => setTransferOverCell(prev => (prev === cellId ? null : prev))}
                    onDrop={handleTransferDrop(row, k)}
                    className={`px-2 py-3 align-top transition-colors ${rowBorder} ${showAvailability && row.offByDay[k] ? 'bg-gray-50/70 dark:bg-gray-900/30' : ''} ${
                      highlightDays.has(k)
                        ? `border-dashed border-l-2 border-r-2 border-violet-400 dark:border-violet-500 ${rowIdx === model.rows.length - 1 ? 'border-b-2' : ''}`
                        : ''
                    } ${
                      transferOverCell === cellId
                        ? 'bg-primary-50 dark:bg-primary-900/20 ring-2 ring-inset ring-primary-400'
                        : acceptsTransfer ? 'bg-primary-50/60 dark:bg-primary-900/10' : ''
                    }`}
                  >
                    <div className="space-y-1.5">
                      {/* Availability reads the same here as on the Board — one pill, same
                          shape and tone. It replaces the window label, never the work:
                          hours booked on an off day have to stay visible to be fixable. */}
                      {showAvailability && row.availByDay[k] && (
                        <AvailabilityBadge avail={row.availByDay[k]} />
                      )}
                      {cells.map(cell => renderChip(row, k, cell))}
                      {showAvailability && !row.offByDay[k] && (row.breaksByDay[k] ?? []).length > 0 && (
                        <div className="space-y-1 pt-0.5">
                          {(row.breaksByDay[k] ?? []).map(brk => (
                            <BreakChip key={brk.id} brk={brk} floating={!brk.startTime} />
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="flex flex-col xl:flex-row gap-6 xl:items-start">
      {weekTable}
      {!hideSidebar && (
        <JobsPanel
          title={resolvedSidebarTitle}
          jobs={sidebarJobList}
          emptyLabel={resolvedSidebarEmptyLabel}
          allStaffedLabel={resolvedSidebarAllStaffedLabel}
          onSelectJob={onSelectJob}
          onDragJobChange={setDraggingJobId}
          period={sidebarPeriod}
          onPeriodChange={onSidebarPeriodChange}
          compact={sidebarCompact}
          onCompactChange={onSidebarCompactChange}
        />
      )}
    </div>
  );
};
