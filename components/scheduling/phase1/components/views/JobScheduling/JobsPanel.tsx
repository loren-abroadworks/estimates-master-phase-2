import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, GripVertical, Rows3 } from 'lucide-react';
import type { JobSummary } from '../../../services/crewHoursGrid';
import { Toggle } from '../../UI';
import { JOB_DND_TYPE, SHIFT_DND_TYPE } from './jobDnd';
import { useTranslation } from '../../../i18n/LanguageContext';

interface JobsPanelProps {
  /** Heading, e.g. "Jobs This Week" or "Jobs Today". */
  title: string;
  jobs: JobSummary[];
  /** Shown when there are no jobs at all in scope. */
  emptyLabel: string;
  /** Shown when jobs exist but all are filtered out by "Hide staffed". */
  allStaffedLabel: string;
  /** Fired when a job card is clicked, to open its details panel. */
  onSelectJob?: (jobId: string) => void;
  /** Fired on drag start/end with the dragged job id (null on end), so the parent
   *  can highlight that job's working-day columns. */
  onDragJobChange?: (jobId: string | null) => void;
  /** Sidebar period lens. When onPeriodChange is provided, the Week/Month/Year
   *  control is shown. */
  period?: 'week' | 'month' | 'year';
  onPeriodChange?: (p: 'week' | 'month' | 'year') => void;
  /** Ultra-compact single-line rows. When onCompactChange is provided, the toggle
   *  is shown. */
  compact?: boolean;
  onCompactChange?: (v: boolean) => void;
}

const dayLabel = (key: string) => {
  const d = new Date(`${key}T12:00:00`);
  return {
    weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
    day: d.toLocaleDateString(undefined, { day: 'numeric' }),
  };
};

const PERIODS: Array<'week' | 'month' | 'year'> = ['week', 'month', 'year'];
const sublabelKey = (p: 'week' | 'month' | 'year') =>
  p === 'month' ? 'views.JobScheduling.JobsPanel.thisMonth'
  : p === 'year' ? 'views.JobScheduling.JobsPanel.thisYear'
  : 'views.JobScheduling.JobsPanel.thisWeek';

const fmtClock = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: m ? '2-digit' : undefined });
};

const rangeLabel = (days: string[]) => {
  if (!days.length) return '';
  const fmt = (k: string) => new Date(`${k}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const first = fmt(days[0]);
  const last = fmt(days[days.length - 1]);
  return first === last ? first : `${first} – ${last}`;
};

/** Right-hand list of jobs in scope as draggable cards: drop one on a crew member to
 *  assign hours. Self-contained — the drag payload rides in dataTransfer so any drop
 *  target can read it without shared state. */
export const JobsPanel = ({
  title, jobs, emptyLabel, allStaffedLabel, onSelectJob, onDragJobChange,
  period = 'week', onPeriodChange, compact = false, onCompactChange,
}: JobsPanelProps) => {
  const { t } = useTranslation();
  // Hide jobs whose hours are already fully staffed (no missing hours).
  const [hideStaffed, setHideStaffed] = useState(false);
  // The card currently being dragged, used only to dim it.
  const [draggingJobId, setDraggingJobId] = useState<string | null>(null);
  // Multi-shift cards expanded to show their draggable shift rows.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Shared dragstart: every drag carries the job id; shift-scoped drags also carry the
  // shift id so the drop can assign into that shift directly (no picker).
  const startDrag = (e: React.DragEvent, jobId: string, shiftId?: string) => {
    e.dataTransfer.setData(JOB_DND_TYPE, jobId);
    if (shiftId) e.dataTransfer.setData(SHIFT_DND_TYPE, shiftId);
    e.dataTransfer.effectAllowed = 'copy';
    setDraggingJobId(jobId);
    onDragJobChange?.(jobId);
  };
  const toggleExpanded = (jobId: string) => setExpanded(prev => {
    const n = new Set(prev);
    if (n.has(jobId)) n.delete(jobId); else n.add(jobId);
    return n;
  });

  const staffedCount = jobs.filter(j => j.missing === 0).length;
  const visibleJobs = hideStaffed ? jobs.filter(j => j.missing > 0) : jobs;

  return (
    <div className="w-full xl:w-80 shrink-0 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm p-5 flex flex-col max-h-[calc(100vh-6rem)] xl:sticky xl:top-6">
      <div className="flex items-center justify-between gap-3 mb-3 shrink-0">
        <h3 className="min-w-0 truncate text-xs font-bold uppercase tracking-wider text-gray-400">{title}</h3>
        {staffedCount > 0 && (
          <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">{t('views.JobScheduling.JobsPanel.hideStaffed')}</span>
            <Toggle checked={hideStaffed} onChange={setHideStaffed} />
          </label>
        )}
      </div>
      {(onPeriodChange || onCompactChange) && (
        <div className="flex items-center justify-between gap-2 mb-3 shrink-0">
          {onPeriodChange ? (
            <div className="flex rounded-lg bg-gray-100 dark:bg-gray-700/60 p-0.5">
              {PERIODS.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => onPeriodChange(p)}
                  aria-pressed={period === p}
                  className={`px-3 py-1 rounded-md text-xs font-bold transition-colors ${
                    period === p
                      ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow-sm'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  {t(`views.JobScheduling.JobsPanel.period${p[0].toUpperCase()}${p.slice(1)}`)}
                </button>
              ))}
            </div>
          ) : <span />}
          {onCompactChange && (
            <button
              type="button"
              onClick={() => onCompactChange(!compact)}
              aria-label={t('views.JobScheduling.JobsPanel.compactView')}
              aria-pressed={compact}
              className={`shrink-0 p-1.5 rounded-lg border transition-colors ${
                compact
                  ? 'border-primary-400 text-primary-600 bg-primary-50 dark:bg-primary-900/30'
                  : 'border-gray-200 dark:border-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200'
              }`}
            >
              <Rows3 className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
      <ul className="flex flex-col gap-2 flex-1 min-h-0 overflow-y-auto -mr-2 pr-2">
        {visibleJobs.map(j => {
          // Staffed jobs (no missing hours) always show a full bar — including jobs
          // with no estimate, where `required` is 0 but the job is staffed by definition.
          const pct = j.missing > 0
            ? (j.required > 0 ? Math.min(100, Math.round((j.assigned / j.required) * 100)) : 0)
            : 100;
          // Multi-shift jobs aren't draggable as a whole — expand and drag a shift row.
          // Single-shift jobs drag as before, carrying their lone shift's id.
          const multi = j.shifts.length >= 2;
          const isExpanded = expanded.has(j.jobId);
          const chevron = multi ? (
            <button
              type="button"
              aria-label={t('views.JobScheduling.JobsPanel.toggleShifts')}
              aria-expanded={isExpanded}
              onClick={(e) => { e.stopPropagation(); toggleExpanded(j.jobId); }}
              className="shrink-0 p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </button>
          ) : null;
          const shiftList = multi && isExpanded ? (
            <ul className="mt-2 flex flex-col gap-1.5">
              {j.shifts.map(s => (
                <li
                  key={s.shiftId}
                  draggable
                  onDragStart={(e) => { e.stopPropagation(); startDrag(e, j.jobId, s.shiftId); }}
                  onDragEnd={(e) => { e.stopPropagation(); setDraggingJobId(null); onDragJobChange?.(null); }}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1.5 cursor-grab active:cursor-grabbing hover:border-gray-300 dark:hover:border-gray-600"
                >
                  {/* Line 1: grip + name + window. Day chips wrap on their own line below
                      so the shift name never truncates against them. */}
                  <div className="flex items-center gap-2 min-w-0">
                    <GripVertical className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-xs font-bold text-gray-800 dark:text-gray-100">{s.name}</span>
                    <span className="text-[10px] font-semibold text-gray-400 tabular-nums shrink-0">{fmtClock(s.startTime)}–{fmtClock(s.endTime)}</span>
                  </div>
                  {period === 'week' && s.days.length > 0 && (
                    <div className="mt-1 ml-5.5 flex flex-wrap gap-1 pl-0.5">
                      {s.days.map(k => {
                        const { weekday, day } = dayLabel(k);
                        return <span key={k} className="px-1 py-0.5 rounded text-[9px] font-bold uppercase bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300">{weekday} {day}</span>;
                      })}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          ) : null;
          return (
            <li
              key={j.jobId}
              draggable={!multi}
              onDragStart={multi ? undefined : (e) => startDrag(e, j.jobId, j.shifts[0]?.shiftId)}
              onDragEnd={multi ? undefined : () => { setDraggingJobId(null); onDragJobChange?.(null); }}
              onClick={onSelectJob ? () => onSelectJob(j.jobId) : undefined}
              onKeyDown={onSelectJob ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectJob(j.jobId); } } : undefined}
              role={onSelectJob ? 'button' : undefined}
              tabIndex={onSelectJob ? 0 : undefined}
              title={onSelectJob
                ? t('views.JobScheduling.JobsPanel.jobCardTitleClickable', { jobNumber: j.jobNumber, jobName: j.jobName })
                : t('views.JobScheduling.JobsPanel.jobCardTitleDragOnly', { jobNumber: j.jobNumber, jobName: j.jobName })}
              className={`group relative rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/30 p-2.5 pl-3.5 ${multi ? '' : 'cursor-grab active:cursor-grabbing'} hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 transition-all ${
                draggingJobId === j.jobId ? 'opacity-50 ring-2 ring-primary-400' : ''
              }`}
            >
              <span className="absolute left-0 top-2 bottom-2 w-1.5 rounded-full" style={{ backgroundColor: j.color }} />
              {compact ? (
                <>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: j.color }} />
                  <span className="min-w-0 flex-1 truncate font-semibold text-sm text-gray-900 dark:text-white">{j.jobName}</span>
                  <span className="text-xs font-extrabold tabular-nums text-gray-900 dark:text-white shrink-0">
                    {j.estimate > 0 ? `${Math.min(j.assigned, j.required)} / ${j.required}h` : `${j.assigned} / ${j.assigned}h`}
                  </span>
                  {j.missing > 0 ? (
                    <span className="flex items-center gap-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 text-[11px] font-extrabold text-amber-700 dark:text-amber-300 shrink-0">
                      <AlertTriangle className="w-3 h-3 shrink-0" /> {j.missing}h
                    </span>
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  )}
                  {chevron}
                </div>
                {shiftList}
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 font-bold text-sm text-gray-900 dark:text-white truncate">{j.jobName}</span>
                    {chevron ?? <GripVertical className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0 group-hover:text-gray-400" />}
                  </div>
                  {j.days.length > 0 && (
                    period === 'week' ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {j.days.map(k => {
                          const { weekday, day } = dayLabel(k);
                          return (
                            <span key={k} className="px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide bg-gray-200/70 dark:bg-gray-700/70 text-gray-600 dark:text-gray-300">
                              {weekday} {day}
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="mt-1.5 text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                        {t('views.JobScheduling.JobsPanel.dayRange', { range: rangeLabel(j.days), count: j.days.length })}
                      </div>
                    )
                  )}
                  <div className="mt-2 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    <div className={`h-full rounded-full ${j.missing > 0 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    {/* Cap the numerator at required so a staffed job reads as a clean met
                        total (9 / 9h) instead of an over-assigned-looking 18 / 9h. A job with
                        no estimate is staffed by definition, so its assigned hours are its
                        total (18 / 18h). The period label sits inline to save a row. */}
                    <div className="flex items-baseline gap-1.5 min-w-0">
                      <span className="text-sm font-extrabold tabular-nums text-gray-900 dark:text-white shrink-0">
                        {j.estimate > 0 ? `${Math.min(j.assigned, j.required)} / ${j.required}h` : `${j.assigned} / ${j.assigned}h`}
                      </span>
                      <span className="text-[11px] font-semibold text-gray-400 truncate">{t(sublabelKey(period))}</span>
                    </div>
                    {j.missing > 0 ? (
                      <span className="flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 text-xs font-extrabold text-amber-700 dark:text-amber-300">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {t('views.JobScheduling.JobsPanel.hoursMissing', { hours: j.missing })}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-900/30 px-2 py-0.5 text-xs font-extrabold text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> {t('views.JobScheduling.JobsPanel.staffed')}
                      </span>
                    )}
                  </div>
                  {shiftList}
                </>
              )}
            </li>
          );
        })}
      </ul>
      {visibleJobs.length === 0 && (
        <p className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
          <CheckCircle2 className="w-4 h-4" />
          {hideStaffed && staffedCount > 0 ? allStaffedLabel : emptyLabel}
        </p>
      )}
    </div>
  );
};
