import React, { useMemo } from 'react';
import { CloudRain } from 'lucide-react';
import { useTranslation } from '../../../i18n/LanguageContext';
import { WorkingTimeConfig, toLocalDateKey } from '../../../services/scheduleEngine';
import { BoardLane, fmtClock } from '../../../services/productionBoard';
import { buildDayBlocks, shiftDayWindow, splitBlockAroundBreaks } from '../../../services/dayBoard';
import { WeatherIcon } from './WeatherIcon';
import type { WeatherKind } from '../../../types';
import { JOB_DND_TYPE, SHIFT_DND_TYPE, isJobDrag } from './jobDnd';
import type { CrewBreak } from '../../../types';
import { BreakChip } from './BreakChip';

const pad2 = (n: number) => String(n).padStart(2, '0');
const HOUR_HEIGHT = 56; // px per hour row — drives proportional block heights

// Convert 'HH:mm' to a fractional hour (e.g. '12:30' -> 12.5). Returns null if blank.
const hhmmToHours = (t?: string): number | null => {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return (h || 0) + (m || 0) / 60;
};

interface DayBoardProps {
  lanes: BoardLane[];
  dayKey: string;
  config: WorkingTimeConfig;
  canReschedule: boolean;
  rainDays?: { date: string }[];
  /** Forecast by local date key ('YYYY-MM-DD' -> kind), shown in the day header corner. */
  weather?: Record<string, WeatherKind>;
  renderRowLabel?: (lane: BoardLane) => React.ReactNode;
  onViewJob?: (jobId: string) => void;
  /** Commit a new start/end clock for a job on this day. */
  onChangeDayWindow?: (jobId: string, dayKey: string, window: { startTime: string; endTime: string }, shiftId?: string) => void;
  onMarkRainDay?: (dayKey: string) => void;
  /** Fired when a job is dropped onto a lane column. In the crew view the lane id is
   *  the member id, routing into the assign flow. */
  onDropJobOnLane?: (laneId: string, jobId: string, shiftId?: string) => void;
  /** Hours/Day only: the assigned crew-hours for a (lane, job) block and whether the
   *  value is inline-editable. Return null to hide the hours readout (e.g. Board mode). */
  blockHours?: (laneId: string, jobId: string, shiftId?: string) => { hours: number; editable: boolean } | null;
  onEditBlockHours?: (laneId: string, jobId: string, hours: number, shiftId?: string) => void;
  onRemoveBlockHours?: (laneId: string, jobId: string, shiftId?: string) => void;
  /** Effective breaks for a lane (member) on this day. Fixed breaks anchor to their
   *  time; flexible breaks (no startTime) float at the top of the column. */
  laneBreaks?: (laneId: string) => CrewBreak[];
}

/** Inline hours field shown on a timeline block. Holds its own draft so the field
 *  can be cleared mid-edit; stops pointer/click propagation so editing never starts
 *  a block drag or opens the job. */
const TimelineHoursField = ({ hours, label, onCommit, onRemove }: {
  hours: number; label: string; onCommit: (h: number) => void; onRemove: () => void;
}) => {
  const [draft, setDraft] = React.useState<string | null>(null);
  const editing = draft !== null;
  return (
    <input
      type="number"
      min={0}
      value={editing ? draft! : hours}
      onChange={(e) => {
        const raw = e.target.value;
        setDraft(raw);
        const v = Number(raw);
        if (raw !== '' && v > 0) onCommit(v);
      }}
      onBlur={() => {
        const raw = editing ? draft! : String(hours);
        const v = Number(raw);
        if (raw === '' || !(v > 0)) onRemove();
        setDraft(null);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      aria-label={label}
      className="w-7 bg-white/25 rounded text-white text-right text-[10px] font-bold px-0.5 outline-none focus:bg-white/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
    />
  );
};

export const DayBoard = ({
  lanes, dayKey, config, canReschedule, rainDays, weather, renderRowLabel, onViewJob, onChangeDayWindow, onMarkRainDay, onDropJobOnLane,
  blockHours, onEditBlockHours, onRemoveBlockHours, laneBreaks,
}: DayBoardProps) => {
  const { t } = useTranslation();
  // Lane column hovered during a job drag, advertised as a drop target.
  const [dragOverLaneId, setDragOverLaneId] = React.useState<string | null>(null);

  const handleLaneDrop = (laneId: string) => (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverLaneId(null);
    if (!onDropJobOnLane) return;
    const jobId = e.dataTransfer.getData(JOB_DND_TYPE);
    const shiftId = e.dataTransfer.getData(SHIFT_DND_TYPE) || undefined;
    if (jobId) onDropJobOnLane(laneId, jobId, shiftId);
  };
  // Full 24-hour axis (like Google Calendar); the view scrolls and opens at the workday.
  const axisStart = 0;
  const axisEnd = 24;
  const span = axisEnd - axisStart;
  const bodyHeight = span * HOUR_HEIGHT;

  const rows = useMemo(
    () => buildDayBlocks(lanes, dayKey, axisStart, axisEnd),
    [lanes, dayKey, axisStart, axisEnd],
  );
  const hourLabels = useMemo(() => {
    const out: string[] = [];
    for (let h = axisStart; h <= axisEnd; h++) out.push(`${pad2(h % 24)}:00`);
    return out;
  }, [axisStart, axisEnd]);

  // Red "now" line, only when the selected day is today and within the axis.
  const now = new Date();
  const nowHours = now.getHours() + now.getMinutes() / 60;
  const isToday = dayKey === toLocalDateKey(now);
  const nowTop = (isToday && nowHours >= axisStart && nowHours <= axisEnd)
    ? ((nowHours - axisStart) / span) * bodyHeight
    : null;
  const nowLabel = fmtClock(`${pad2(now.getHours())}:${pad2(now.getMinutes())}`);

  // On open / day change, scroll into a useful window: center on "now" when
  // viewing today (so the red line is visible), else open at the workday start.
  const scrollRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const anchorHour = isToday ? Math.max(0, nowHours - 2) : Math.max(0, config.workDayStartHour - 0.5);
    el.scrollTop = anchorHour * HOUR_HEIGHT;
  }, [dayKey, config.workDayStartHour, isToday, nowHours]);

  const isRain = (rainDays || []).some(r => r.date === dayKey);
  const canMarkRain = canReschedule && !!onMarkRainDay;

  // Continuous hour gridlines: a line at the top of every hour row.
  const hourLines = `repeating-linear-gradient(to bottom, rgba(120,120,120,0.18) 0, rgba(120,120,120,0.18) 1px, transparent 1px, transparent ${HOUR_HEIGHT}px)`;

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!canMarkRain) return;
    e.preventDefault();
    onMarkRainDay!(dayKey);
  };

  // Vertical pointer-drag: maps cursor travel to a clock delta on drop. The ref
  // holds transient drag state so the window listeners don't go stale.
  const dragRef = React.useRef<{ jobId: string; shiftId?: string; startY: number; colHeight: number; window: { startTime: string; endTime: string }; moved: boolean } | null>(null);

  React.useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      d.moved = true;
      e.preventDefault();
    };
    const onUp = (e: PointerEvent) => {
      const d = dragRef.current;
      dragRef.current = null;
      if (!d || !d.moved) return;
      const deltaPx = e.clientY - d.startY;
      const deltaHours = (deltaPx / d.colHeight) * span;
      const next = shiftDayWindow(d.window, deltaHours, axisStart, axisEnd);
      onChangeDayWindow?.(d.jobId, dayKey, next, d.shiftId);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [axisStart, axisEnd, span, dayKey, onChangeDayWindow]);

  const minWidth = 64 + rows.length * 150;

  return (
    <div ref={scrollRef} className="overflow-auto border border-gray-200 dark:border-gray-700 rounded-2xl bg-white dark:bg-gray-800" style={{ maxHeight: 660 }}>
      <div
        className="grid"
        style={{ gridTemplateColumns: `64px repeat(${Math.max(1, rows.length)}, minmax(150px, 220px))`, minWidth }}
      >
        {/* Header row (sticky) — forecast corner above the time gutter, then one cell per lane */}
        <div className="sticky top-0 z-20 bg-white dark:bg-gray-800 border-b border-r border-gray-100 dark:border-gray-700 grid place-items-center">
          <WeatherIcon kind={weather?.[dayKey]} className="w-5 h-5" />
        </div>
        {rows.map(row => (
          <div
            key={row.laneId}
            className="sticky top-0 z-20 bg-white dark:bg-gray-800 px-2 py-2.5 border-b border-l border-gray-100 dark:border-gray-700 flex items-center justify-center text-center min-w-0"
          >
            {renderRowLabel
              ? renderRowLabel(lanes.find(l => l.crewId === row.laneId)!)
              : <span className="font-bold text-sm text-gray-700 dark:text-gray-200 truncate">{row.laneName}</span>}
          </div>
        ))}
        {rows.length === 0 && <div className="sticky top-0 z-20 bg-white dark:bg-gray-800 border-b border-l border-gray-100 dark:border-gray-700" />}

        {/* Time gutter — hour labels aligned to each gridline */}
        <div className="relative bg-white dark:bg-gray-800 border-r border-gray-100 dark:border-gray-700" style={{ height: bodyHeight }}>
          {hourLabels.map((hhmm, i) => (
            <div
              key={i}
              className="absolute right-1.5 -translate-y-1/2 text-[10px] font-bold text-gray-400 dark:text-gray-500 whitespace-nowrap"
              style={{ top: i * HOUR_HEIGHT }}
            >
              {fmtClock(hhmm)}
            </div>
          ))}
          {/* Current-time readout, aligned with the red line */}
          {nowTop !== null && (
            <div className="absolute right-1 z-20 -translate-y-1/2" style={{ top: nowTop }}>
              <span className="inline-block bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap shadow">{nowLabel}</span>
            </div>
          )}
        </div>

        {/* One timeline column per lane, sharing the hour gridlines */}
        {rows.map(row => {
          const dropActive = !!onDropJobOnLane;
          const isDropTarget = dragOverLaneId === row.laneId;
          return (
          <div
            key={row.laneId}
            onContextMenu={handleContextMenu}
            onDragOver={dropActive ? (e) => { if (!isJobDrag(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDragOverLaneId(row.laneId); } : undefined}
            onDragLeave={dropActive ? () => setDragOverLaneId(prev => (prev === row.laneId ? null : prev)) : undefined}
            onDrop={dropActive ? handleLaneDrop(row.laneId) : undefined}
            className={`relative border-l border-gray-100 dark:border-gray-800 ${canMarkRain ? 'cursor-context-menu' : ''} ${isDropTarget ? 'ring-2 ring-inset ring-primary-400 bg-primary-50/60 dark:bg-primary-900/20' : ''}`}
            style={{ height: bodyHeight, backgroundImage: hourLines }}
          >
            {isRain && (
              <div
                className="pointer-events-none absolute inset-0 opacity-70"
                style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(59,130,246,0.14) 6px, rgba(59,130,246,0.14) 12px)' }}
              />
            )}
            {nowTop !== null && (
              <div className="pointer-events-none absolute inset-x-0 z-10 h-px bg-red-500" style={{ top: nowTop }} />
            )}
            {row.blocks.map(block => {
              const draggable = canReschedule && !block.card.isLocked && !!onChangeDayWindow;
              const hrs = blockHours?.(row.laneId, block.card.jobId, block.card.shiftId) ?? null;
              const fixedBreaks = (laneBreaks?.(row.laneId) ?? []).filter(b => b.startTime) as { startTime: string; durationMinutes: number }[];
              const startH = hhmmToHours(block.startTime);
              const endH = hhmmToHours(block.endTime);
              const segments = (startH !== null && endH !== null)
                ? splitBlockAroundBreaks(startH, endH, fixedBreaks, axisStart, axisEnd)
                : [{ topPct: block.topPct, heightPct: block.heightPct }];
              const onPointerDown = draggable ? (e: React.PointerEvent) => {
                if (e.button !== 0) return;
                const col = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
                dragRef.current = { jobId: block.card.jobId, shiftId: block.card.shiftId, startY: e.clientY, colHeight: col.height || 1, window: { startTime: block.startTime, endTime: block.endTime }, moved: false };
              } : undefined;
              return segments.map((seg, i) => (
                <div
                  key={`${block.card.jobId}:${block.card.shiftId ?? ''}-${i}`}
                  data-job-id={block.card.jobId}
                  data-shift-id={block.card.shiftId ?? ''}
                  data-draggable={draggable ? 'true' : 'false'}
                  onPointerDown={onPointerDown}
                  onClick={() => { if (!dragRef.current) onViewJob?.(block.card.jobId); }}
                  className={`absolute p-px ${draggable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}`}
                  style={{ top: `${seg.topPct}%`, height: `${seg.heightPct}%`, left: `${block.leftPct}%`, width: `${block.widthPct}%`, zIndex: 5 + block.zIndex }}
                >
                  <div
                    className={`h-full w-full rounded-lg pl-2.5 pr-2 py-1 shadow-sm overflow-hidden text-white ${block.clamped ? 'ring-2 ring-inset ring-primary-400/40' : ''}`}
                    style={{ backgroundColor: block.card.color }}
                  >
                    <div className="text-xs font-bold truncate leading-tight">{block.card.jobName}</div>
                    {i === 0 && (
                      <div className="flex items-center gap-1 text-[10px] font-medium text-white/80">
                        <span className="truncate">{block.card.shiftName ? `${block.card.shiftName} · ` : ''}{fmtClock(block.startTime)} – {fmtClock(block.endTime)}</span>
                        {hrs && (
                          hrs.editable && onEditBlockHours ? (
                            <span className="ml-auto flex items-center gap-0.5 shrink-0">
                              <TimelineHoursField
                                hours={hrs.hours}
                                label={t('views.JobScheduling.DayBoard.hoursAriaLabel', { jobName: block.card.jobName })}
                                onCommit={(h) => onEditBlockHours(row.laneId, block.card.jobId, h, block.card.shiftId)}
                                onRemove={() => onRemoveBlockHours?.(row.laneId, block.card.jobId, block.card.shiftId)}
                              />
                              <span>{t('views.JobScheduling.DayBoard.hoursUnit')}</span>
                            </span>
                          ) : (
                            <span className="ml-auto shrink-0 font-bold text-white">{hrs.hours}h</span>
                          )
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ));
            })}
            {(() => {
              const lb = laneBreaks?.(row.laneId) ?? [];
              const fixed = lb.filter(b => b.startTime);
              const flexible = lb.filter(b => !b.startTime);
              return (
                <>
                  {fixed.map(b => {
                    const startH = hhmmToHours(b.startTime)!;
                    const top = ((startH - axisStart) / span) * 100;
                    const height = (b.durationMinutes / 60 / span) * 100;
                    return (
                      <div
                        key={b.id}
                        className="pointer-events-none absolute inset-x-1 z-[8] rounded-md border border-dashed border-gray-400/70 bg-gray-200/70 dark:bg-gray-600/60 px-1.5 py-0.5 overflow-hidden"
                        style={{ top: `${top}%`, height: `${Math.max(2, height)}%` }}
                        title={t('views.JobScheduling.DayBoard.breakTitle', { label: b.label || t('views.JobScheduling.DayBoard.breakFallback'), status: b.paid ? t('views.JobScheduling.DayBoard.paid') : t('views.JobScheduling.DayBoard.unpaid') })}
                      >
                        <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-200 truncate">{b.label || t('views.JobScheduling.DayBoard.breakFallback')} · {fmtClock(b.startTime!)}</span>
                      </div>
                    );
                  })}
                  {flexible.length > 0 && (
                    <div className="absolute top-1 inset-x-1 z-[6] flex flex-wrap gap-1">
                      {flexible.map(b => <BreakChip key={b.id} brk={b} floating />)}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
          );
        })}
      </div>
    </div>
  );
};
