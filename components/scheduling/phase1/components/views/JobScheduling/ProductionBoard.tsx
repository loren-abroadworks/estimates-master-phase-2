import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CloudRain } from 'lucide-react';
import { useTranslation } from '../../../i18n/LanguageContext';
import { WorkingTimeConfig, toLocalDateKey } from '../../../services/scheduleEngine';
import { BoardCard, BoardLane, layoutLaneBars } from '../../../services/productionBoard';
import { JobCard } from './JobCard';
import type { CrewMemberLite } from './ReschedulePreviewPanel';
import { JOB_DND_TYPE } from './jobDnd';
import { WeatherIcon } from './WeatherIcon';
import type { WeatherKind } from '../../../types';

const DRAG_THRESHOLD = 5; // px the pointer must move before a drag starts
const BAR_ROW = 56; // px per stacked bar track within a lane

// Resolve the board cell under a screen point (works for mouse/trackpad/touch).
const cellAtPoint = (x: number, y: number): { id: string; day: string } | null => {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  const cell = el?.closest('[data-cell-id]') as HTMLElement | null;
  if (!cell) return null;
  return { id: cell.dataset.cellId!, day: cell.dataset.cellDay! };
};

interface ProductionBoardProps {
  lanes: BoardLane[];
  weekDays: Date[];
  config: WorkingTimeConfig;
  canReschedule: boolean;
  /** Roster used to render each bar's crew avatars; omit to hide them. */
  staff?: CrewMemberLite[];
  rainDays?: { date: string }[];
  /** Forecast by local date key ('YYYY-MM-DD' -> kind), shown in each day header. */
  weather?: Record<string, WeatherKind>;
  onDropJob: (jobId: string, dayKey: string, shiftId?: string) => void;
  onMarkRainDay?: (dayKey: string) => void;
  onViewJob?: (jobId: string) => void;
  onMoveJob?: (jobId: string) => void;
  /** Custom row-label renderer (e.g. member avatar, job name). Defaults to lane.crewName. */
  renderRowLabel?: (lane: BoardLane) => React.ReactNode;
  /** Extra content rendered behind the cards in each lane cell (e.g. availability). */
  renderCellExtra?: (laneId: string, dayKey: string) => React.ReactNode;
  /** Fired when a cell background (not a card) is clicked (e.g. edit availability). */
  onCellActivate?: (laneId: string, dayKey: string) => void;
  /** Job ids to render as faded placeholders (e.g. a staged-but-unapplied move). */
  pendingIds?: Set<string>;
}

export const ProductionBoard = ({
  lanes, weekDays, config, canReschedule, staff, rainDays, weather, onDropJob, onMarkRainDay, onViewJob, onMoveJob,
  renderCellExtra, onCellActivate, pendingIds,
}: ProductionBoardProps) => {
  const { t } = useTranslation();
  // Cells highlighted under the dragged card — its whole day-span, not just the hovered day.
  const [hoverCells, setHoverCells] = useState<Set<string>>(new Set());
  // Cell highlighted while an external (HTML5) job card is dragged over it.
  const [dropHoverCell, setDropHoverCell] = useState<string | null>(null);
  // True while an unscheduled job is being dragged over the board (HTML5 DnD).
  // Lets the spanning bars opt out of pointer events so a drop can land on the
  // day cell beneath an existing job's bar.
  const [nativeDragActive, setNativeDragActive] = useState(false);
  const [ghost, setGhost] = useState<{ x: number; y: number; width: number; height: number; name: string; color: string; duration: number } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; dayKey: string } | null>(null);
  const dayKeys = weekDays.map(toLocalDateKey);
  const rainDaySet = useMemo(() => new Set((rainDays || []).map(r => r.date)), [rainDays]);
  const canMarkRain = canReschedule && !!onMarkRainDay;
  // Non-working days (per the scheduling settings) render as muted, inert columns:
  // visible so the week reads whole, but never a drop target.
  const isNonWorkingKey = (k: string) => config.weekendDays.includes(new Date(`${k}T12:00:00`).getDay());

  // Pointer-based drag (mouse/trackpad/touch). Refs hold transient drag state so
  // the window listeners don't go stale; React state drives the ghost + hover.
  const dragRef = useRef<{ card: BoardCard; startX: number; startY: number; active: boolean; width: number; height: number; offsetX: number; offsetY: number } | null>(null);
  const movedRef = useRef(false);
  const onDropRef = useRef(onDropJob);
  onDropRef.current = onDropJob;
  const dayKeysRef = useRef(dayKeys);
  dayKeysRef.current = dayKeys;
  const lanesRef = useRef(lanes);
  lanesRef.current = lanes;
  const weekendRef = useRef(config.weekendDays);
  weekendRef.current = config.weekendDays;

  // Inclusive day-span of a card, derived from its start/end day keys.
  const spanOf = (card: BoardCard) =>
    Math.max(1, Math.round((new Date(card.endKey).getTime() - new Date(card.startKey).getTime()) / 86_400_000) + 1);

  const handleCardPointerDown = (card: BoardCard, e: React.PointerEvent) => {
    if (!canReschedule || e.button !== 0) return;
    // Capture the card's actual size and the grab offset so the drag ghost matches it.
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    dragRef.current = {
      card, startX: e.clientX, startY: e.clientY, active: false,
      width: rect.width, height: rect.height, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top,
    };
    movedRef.current = false;
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (!d.active) {
        if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < DRAG_THRESHOLD) return;
        d.active = true;
        movedRef.current = true;
        // Suppress text selection of the board while dragging, and clear any
        // selection the initial press may have started.
        document.body.style.userSelect = 'none';
        (document.body.style as any).webkitUserSelect = 'none';
        window.getSelection()?.removeAllRanges();
      }
      e.preventDefault();
      setGhost({ x: e.clientX - d.offsetX, y: e.clientY - d.offsetY, width: d.width, height: d.height, name: d.card.jobName, color: d.card.color, duration: spanOf(d.card) });
      // Highlight the full day-span the job would occupy from the hovered day. The
      // job may be "connected" across multiple rows (same job assigned to several
      // members), so highlight the target span in EVERY lane that holds this job.
      const cell = cellAtPoint(e.clientX, e.clientY);
      const keys = dayKeysRef.current;
      const nonWorking = (k: string) => weekendRef.current.includes(new Date(`${k}T12:00:00`).getDay());
      const next = new Set<string>();
      const idx = cell && !nonWorking(cell.day) ? keys.indexOf(cell.day) : -1;
      if (idx >= 0) {
        const span = spanOf(d.card);
        const jobId = d.card.jobId;
        const shiftId = d.card.shiftId;
        const laneIds = lanesRef.current
          .filter(l => Object.values(l.cardsByDay).some(cs =>
            cs.some(c => c.jobId === jobId && (shiftId === undefined || c.shiftId === shiftId))))
          .map(l => l.crewId);
        const targets = laneIds.length ? laneIds : [cell!.id.slice(0, cell!.id.length - cell!.day.length - 1)];
        // The highlighted span counts WORKING days only — a job dropped on Friday
        // resumes Monday, so Sat/Sun columns are stepped over, not lit.
        const spanKeys: string[] = [];
        for (let k = idx; k < keys.length && spanKeys.length < span; k++) {
          if (!nonWorking(keys[k])) spanKeys.push(keys[k]);
        }
        for (const laneId of targets) {
          for (const key of spanKeys) next.add(`${laneId}:${key}`);
        }
      }
      setHoverCells(next);
    };
    const onUp = (e: PointerEvent) => {
      const d = dragRef.current;
      dragRef.current = null;
      setGhost(null);
      setHoverCells(new Set());
      // Restore text selection regardless of how the press ended.
      document.body.style.userSelect = '';
      (document.body.style as any).webkitUserSelect = '';
      if (d && d.active) {
        const cell = cellAtPoint(e.clientX, e.clientY);
        const nonWorking = cell && weekendRef.current.includes(new Date(`${cell.day}T12:00:00`).getDay());
        if (cell && !nonWorking) onDropRef.current(d.card.jobId, cell.day, d.card.shiftId);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setHoverCells(new Set());
      document.body.style.userSelect = '';
      (document.body.style as any).webkitUserSelect = '';
    };
  }, []);

  // Clear the native-drag flag whenever an HTML5 drag finishes (drop or cancel),
  // restoring the bars' pointer events.
  useEffect(() => {
    const end = () => setNativeDragActive(false);
    window.addEventListener('dragend', end);
    window.addEventListener('drop', end);
    return () => {
      window.removeEventListener('dragend', end);
      window.removeEventListener('drop', end);
    };
  }, []);

  // Swallow the click that follows a drag so it doesn't open the job.
  const handleCardClick = (jobId: string) => {
    if (movedRef.current) { movedRef.current = false; return; }
    onViewJob?.(jobId);
  };

  const handleContextMenu = (e: React.MouseEvent, dayKey: string) => {
    if (!canMarkRain) return;
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, dayKey });
  };

  // Close the context menu on any outside interaction.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [menu]);

  return (
    <div
      className="overflow-x-auto border border-gray-200 dark:border-gray-700 rounded-2xl bg-white dark:bg-gray-800"
      onDragEnter={canReschedule ? (e) => { if (e.dataTransfer.types.includes(JOB_DND_TYPE)) setNativeDragActive(true); } : undefined}
    >
      <div
        className="grid min-w-[1000px]"
        style={{ gridTemplateColumns: `repeat(${weekDays.length}, 1fr)` }}
      >
        {/* Header row — no row-label column */}
        {weekDays.map((d, i) => {
          const dayKey = dayKeys[i];
          const isRain = rainDaySet.has(dayKey);
          const isOff = isNonWorkingKey(dayKey);
          return (
            <div
              key={d.toISOString()}
              onContextMenu={(e) => handleContextMenu(e, dayKey)}
              title={canMarkRain ? t('views.JobScheduling.ProductionBoard.rightClickToMarkRainDay') : undefined}
              className={`relative p-3 text-center border-b border-l border-gray-100 dark:border-gray-700 ${canMarkRain ? 'cursor-context-menu' : ''} ${isOff ? 'bg-gray-50/70 dark:bg-gray-900/40' : ''}`}
            >
              <div className="text-[10px] font-bold text-gray-400 uppercase">{d.toLocaleDateString(undefined, { weekday: 'short' })}</div>
              <div className="flex items-center justify-center gap-1.5">
                <span className={`text-lg font-black ${isOff ? 'text-gray-400 dark:text-gray-500' : 'text-gray-900 dark:text-white'}`}>{d.getDate()}</span>
                <WeatherIcon kind={weather?.[dayKey]} className="w-4 h-4" />
              </div>
              {isRain && (
                <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/40 border border-blue-200 dark:border-blue-800 px-1.5 py-0.5 rounded-full">
                  <CloudRain className="w-2.5 h-2.5" /> {t('views.JobScheduling.ProductionBoard.rain')}
                </span>
              )}
            </div>
          );
        })}

        {/* Lanes */}
        {lanes.map(lane => {
          const { bars, trackCount } = layoutLaneBars(lane, dayKeys);
          const laneHeight = Math.max(1, trackCount) * BAR_ROW;
          return (
            <React.Fragment key={lane.crewId}>
              <div className="relative border-b border-gray-100 dark:border-gray-800" style={{ gridColumn: '1 / -1', minHeight: laneHeight }}>
                {/* Background day cells: drop targets, rain, availability */}
                <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${dayKeys.length}, 1fr)` }}>
                  {dayKeys.map(dayKey => {
                    const cellId = `${lane.crewId}:${dayKey}`;
                    const isRain = rainDaySet.has(dayKey);
                    const isOff = isNonWorkingKey(dayKey);
                    const droppable = canReschedule && !isOff;
                    return (
                      <div
                        key={cellId}
                        data-cell-id={cellId}
                        data-cell-day={dayKey}
                        onContextMenu={(e) => handleContextMenu(e, dayKey)}
                        onClick={onCellActivate ? () => onCellActivate(lane.crewId, dayKey) : undefined}
                        onDragOver={droppable ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDropHoverCell(cellId); } : undefined}
                        onDragLeave={droppable ? () => setDropHoverCell(prev => (prev === cellId ? null : prev)) : undefined}
                        onDrop={droppable ? (e) => { e.preventDefault(); setDropHoverCell(null); const id = e.dataTransfer.getData(JOB_DND_TYPE); if (id) onDropJob(id, dayKey); } : undefined}
                        className={`relative border-l border-gray-100 dark:border-gray-800 ${onCellActivate ? 'cursor-pointer' : ''} ${isOff ? 'bg-gray-50/70 dark:bg-gray-900/40' : ''} ${(hoverCells.has(cellId) || dropHoverCell === cellId) ? 'bg-primary-100 dark:bg-primary-900/40 ring-1 ring-inset ring-primary-300 dark:ring-primary-700' : ''}`}
                      >
                        {isRain && (
                          <div
                            className="pointer-events-none absolute inset-0 opacity-70"
                            style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(59,130,246,0.14) 6px, rgba(59,130,246,0.14) 12px)' }}
                          />
                        )}
                        {renderCellExtra && (
                          <div className="pointer-events-none absolute inset-0">{renderCellExtra(lane.crewId, dayKey)}</div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {/* Spanning bars layer. The container never intercepts pointer/drag
                    events — only the bars themselves do — so native drags from the
                    Unscheduled panel reach the background drop-target cells. During a
                    pointer-drag (ghost active) or a native drag of an unscheduled job
                    (nativeDragActive) even the bars opt out, so the drop lands on the
                    day cell beneath an existing job's bar. */}
                <div className="absolute inset-0 pointer-events-none">
                  {bars.map(bar => (
                    <div
                      key={`${bar.card.jobId}:${bar.card.shiftId ?? ''}`}
                      className={`absolute px-1.5 ${(ghost || nativeDragActive) ? 'pointer-events-none' : 'pointer-events-auto'}`}
                      style={{
                        left: `${(bar.startCol / dayKeys.length) * 100}%`,
                        width: `${(bar.span / dayKeys.length) * 100}%`,
                        top: bar.track * BAR_ROW + 6,
                        height: BAR_ROW - 12,
                      }}
                    >
                      <JobCard
                        card={bar.card}
                        draggable={canReschedule}
                        onPointerDownDrag={handleCardPointerDown}
                        onClick={handleCardClick}
                        onMoveJob={onMoveJob}
                        durationDays={bar.span}
                        staff={staff}
                        pending={pendingIds?.has(bar.card.jobId)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Floating drag ghost — same size as the card being dragged */}
      {ghost && (
        <div
          className="fixed z-[60] pointer-events-none px-2 py-1.5 rounded-lg text-white text-xs font-bold shadow-2xl opacity-90 flex items-center gap-1"
          style={{ left: ghost.x, top: ghost.y, width: ghost.width, height: ghost.height, backgroundColor: ghost.color }}
        >
          <span className="truncate">{ghost.name}</span>
          <span className="ml-auto shrink-0 text-[10px] font-black opacity-90">{t('views.JobScheduling.ProductionBoard.ghostDuration', { duration: ghost.duration })}</span>
        </div>
      )}

      {/* Day right-click context menu */}
      {menu && onMarkRainDay && (
        <div
          className="fixed z-50 min-w-[180px] rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl py-1"
          style={{ top: menu.y, left: menu.x }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            onClick={() => { onMarkRainDay(menu.dayKey); setMenu(null); }}
          >
            <CloudRain className="w-4 h-4 text-blue-500" />
            {t('views.JobScheduling.ProductionBoard.markAsRainDay')}
          </button>
        </div>
      )}
    </div>
  );
};
