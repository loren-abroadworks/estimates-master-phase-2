import React, { useEffect, useRef, useState } from 'react';
import type { Job } from '../../../types';
import { WorkingTimeConfig } from '../../../services/scheduleEngine';
import { layoutLaneBars } from '../../../services/productionBoard';
import { MonthWeek, buildMonthWeekLane } from '../../../services/monthBoard';
import { JOB_DND_TYPE } from './jobDnd';

const DATE_BAND = 26; // px reserved at the top of each cell for the date number
const BAR_ROW = 26;   // px per stacked bar track

interface MonthBoardProps {
  weeks: MonthWeek[];
  jobs: Job[];
  config: WorkingTimeConfig;
  colorForJob: (job: Job) => string;
  canReschedule?: boolean;
  onSelectJob: (jobId: string) => void;
  onDropJob?: (jobId: string, dayKey: string, shiftId?: string) => void;
}

export const MonthBoard = ({ weeks, jobs, config, colorForJob, canReschedule, onSelectJob, onDropJob }: MonthBoardProps) => {
  const dragged = useRef<{ jobId: string; shiftId?: string } | null>(null);
  // The day cell currently under the dragged card — highlighted as the drop target.
  const [dropHoverCell, setDropHoverCell] = useState<string | null>(null);
  // While a native drag is in flight the spanning bars opt out of pointer events
  // so the day cells beneath them keep receiving dragover (and the highlight tracks).
  const [nativeDragActive, setNativeDragActive] = useState(false);

  // Clear drag state whenever an HTML5 drag finishes (drop or cancel).
  useEffect(() => {
    const end = () => { setNativeDragActive(false); setDropHoverCell(null); };
    window.addEventListener('dragend', end);
    window.addEventListener('drop', end);
    return () => {
      window.removeEventListener('dragend', end);
      window.removeEventListener('drop', end);
    };
  }, []);
  const cols = weeks[0]?.days.length ?? 5;
  const weekdayNames = (weeks[0]?.days ?? []).map(d =>
    d.date.toLocaleDateString(undefined, { weekday: 'short' }));

  return (
    <div
      className="border border-gray-200 dark:border-gray-700 rounded-2xl bg-white dark:bg-gray-800 overflow-hidden"
      onDragEnter={onDropJob ? ((e) => { if (e.dataTransfer.types.includes(JOB_DND_TYPE)) setNativeDragActive(true); }) : undefined}
    >
      {/* Weekday header */}
      <div className="grid border-b border-gray-100 dark:border-gray-700" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {weekdayNames.map((name, i) => (
          <div key={i} className="p-2 text-center text-[10px] font-black uppercase tracking-widest text-gray-400 border-l first:border-l-0 border-gray-100 dark:border-gray-700">{name}</div>
        ))}
      </div>

      {/* Week rows */}
      {weeks.map((week, wi) => {
        const dayKeys = week.days.map(d => d.key);
        const lane = buildMonthWeekLane(jobs, dayKeys, config, colorForJob);
        const { bars, trackCount } = layoutLaneBars(lane, dayKeys);
        const rowHeight = DATE_BAND + Math.max(1, trackCount) * BAR_ROW + 6;
        return (
          <div key={wi} className="relative border-b last:border-b-0 border-gray-100 dark:border-gray-700" style={{ minHeight: rowHeight }}>
            {/* Day cells */}
            <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
              {week.days.map(d => (
                <div
                  key={d.key}
                  onDragOver={onDropJob ? ((e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setDropHoverCell(d.key); }) : undefined}
                  onDragLeave={onDropJob ? (() => setDropHoverCell(prev => (prev === d.key ? null : prev))) : undefined}
                  onDrop={onDropJob ? ((e) => { e.preventDefault(); setDropHoverCell(null); const ref = dragged.current; const jobId = ref?.jobId ?? e.dataTransfer.getData(JOB_DND_TYPE); if (jobId) onDropJob(jobId, d.key, ref?.shiftId); dragged.current = null; }) : undefined}
                  className={`border-l first:border-l-0 border-gray-100 dark:border-gray-800 ${d.inMonth ? '' : 'bg-gray-50/60 dark:bg-gray-900/30'} ${dropHoverCell === d.key ? 'bg-primary-100 dark:bg-primary-900/40 ring-1 ring-inset ring-primary-300 dark:ring-primary-700' : ''}`}
                >
                  <div className={`p-1.5 text-right text-xs font-bold ${d.inMonth ? 'text-gray-700 dark:text-gray-200' : 'text-gray-300 dark:text-gray-600'}`}>
                    {d.date.getDate()}
                  </div>
                </div>
              ))}
            </div>

            {/* Spanning bars */}
            <div className={`absolute inset-x-0 ${nativeDragActive ? 'pointer-events-none' : ''}`} style={{ top: DATE_BAND }}>
              {bars.map(bar => (
                <button
                  key={`${bar.card.jobId}::${bar.card.shiftId ?? ''}`}
                  draggable={!!canReschedule}
                  onDragStart={(e) => { dragged.current = { jobId: bar.card.jobId, shiftId: bar.card.shiftId }; setNativeDragActive(true); e.dataTransfer.setData(JOB_DND_TYPE, bar.card.jobId); }}
                  onClick={() => onSelectJob(bar.card.jobId)}
                  className="absolute text-left rounded-md px-2 text-[11px] font-bold text-white truncate shadow-sm hover:brightness-110"
                  style={{
                    left: `calc(${(bar.startCol / cols) * 100}% + 2px)`,
                    width: `calc(${(bar.span / cols) * 100}% - 4px)`,
                    top: bar.track * BAR_ROW,
                    height: BAR_ROW - 4,
                    lineHeight: `${BAR_ROW - 4}px`,
                    backgroundColor: bar.card.color,
                  }}
                  title={`${bar.card.jobName}${bar.card.shiftName ? ` · ${bar.card.shiftName}` : ''}`}
                >
                  {bar.card.jobName}{bar.card.shiftName ? ` · ${bar.card.shiftName}` : ''}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
};
