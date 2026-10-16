import React, { useState, useEffect } from 'react';
import { AlertTriangle, Coffee, Trash2 } from 'lucide-react';
import { Modal, Button, Select, TimeInput } from '../../UI';
import type { JobHoursProgress } from '../../../services/assignHoursWarnings';
import type { CrewBreak } from '../../../types';
import { useTranslation } from '../../../i18n/LanguageContext';

export interface AssignHoursModalJob { id: string; jobNumber: string; name: string; }

/** Why the day list is empty, so the modal can say something the scheduler can act on
 *  instead of one sentence covering three unrelated situations. `dayLabels` are already
 *  human-readable ("Mon 17"), formatted by the caller that knows the locale. */
export type AssignHoursNoDaysReason =
  | { kind: 'unscheduled' }
  | { kind: 'notThisWeek'; dayLabels: string[] };
/** One schedulable day for the selected job: label parts, optional working
 *  window times, the hours to prefill, and the member's resolved breaks that day. */
export interface AssignHoursDay {
  dateKey: string; weekday: string; dayNum: string; hours: number;
  startTime?: string; endTime?: string; breaks?: CrewBreak[];
  /** The member is off this day. Offered anyway — the row says so, and hours landing on
   *  it raise a warning. Nothing is blocked. */
  off?: boolean;
  /** The reason they gave for being off, shown in place of the bare word. */
  offReason?: string;
}

const breakDur = (mins: number) => (mins % 60 === 0 ? `${mins / 60}h` : `${mins}m`);

interface AssignHoursModalProps {
  isOpen: boolean;
  memberName: string;
  jobs: AssignHoursModalJob[];
  /** When set (e.g. a job dragged onto a member), the job is preselected and locked. */
  lockedJobId?: string;
  /** Eligible days + prefill hours for a job/member; recomputed when the job changes. */
  getDays: (jobId: string) => AssignHoursDay[];
  /** Why `getDays` came back empty. Omit to keep the plain no-days sentence. */
  getNoDaysReason?: (jobId: string) => AssignHoursNoDaysReason | null;
  /** Advisory over-limit warnings for the live entry; recomputed as hours change. */
  getWarnings?: (jobId: string, hoursByDay: Record<string, number>) => string[];
  /** Live job hours progress (assigned vs estimate, hours still needed); null hides it. */
  getProgress?: (jobId: string, hoursByDay: Record<string, number>) => JobHoursProgress | null;
  /** Open the break editor for one of the member's days. Omit to hide break controls. */
  onEditBreaks?: (dateKey: string) => void;
  /** Keep mounted but hidden (e.g. while the break editor takes over the screen). */
  hidden?: boolean;
  onClose: () => void;
  /** `windowsByDay` holds only the days whose start/end times the user edited here —
   *  the member's personal working window for those days. */
  onSubmit: (jobId: string, hoursByDay: Record<string, number>, windowsByDay: Record<string, DayWindow>) => void;
}

export interface DayWindow { startTime: string; endTime: string; }

/** Duration of a window in hours (one decimal), never negative. */
const windowHours = (w: DayWindow): number => {
  const mins = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  return Math.max(0, round1((mins(w.endTime) - mins(w.startTime)) / 60));
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export const AssignHoursModal = ({ isOpen, memberName, jobs, lockedJobId, getDays, getNoDaysReason, getWarnings, getProgress, onEditBreaks, hidden, onClose, onSubmit }: AssignHoursModalProps) => {
  const { t } = useTranslation();
  const [jobId, setJobId] = useState('');
  const [days, setDays] = useState<AssignHoursDay[]>([]);
  // Per-day hours as strings so the inputs can be cleared while typing.
  const [values, setValues] = useState<Record<string, string>>({});
  // Per-day working windows, live-editable. Only the days the user actually touches
  // are submitted as member-specific overrides.
  const [windows, setWindows] = useState<Record<string, DayWindow>>({});
  const [dirtyWindows, setDirtyWindows] = useState<Set<string>>(new Set());
  // Days dropped from the assignment here. Their hours are computed from their window, so
  // there is no longer a figure to clear — removing the row is how a day comes off.
  const [removedDays, setRemovedDays] = useState<Set<string>>(new Set());

  // Load the day list (and prefill values) whenever the modal opens or the job changes.
  useEffect(() => {
    if (!isOpen) return;
    const initialJob = lockedJobId ?? jobs[0]?.id ?? '';
    setJobId(initialJob);
  }, [isOpen, jobs, lockedJobId]);

  useEffect(() => {
    if (!isOpen || !jobId) { setDays([]); setValues({}); setWindows({}); setDirtyWindows(new Set()); return; }
    const ds = getDays(jobId);
    setDays(ds);
    setValues(Object.fromEntries(ds.map(d => [d.dateKey, d.hours ? String(d.hours) : ''])));
    setWindows(Object.fromEntries(ds
      .filter(d => d.startTime && d.endTime)
      .map(d => [d.dateKey, { startTime: d.startTime!, endTime: d.endTime! }])));
    setDirtyWindows(new Set());
    setRemovedDays(new Set());
  }, [isOpen, jobId, getDays]);

  // Editing a day's start/end times re-derives that day's hours from the new window —
  // adjusting when the member works IS adjusting how long they work.
  const handleWindowChange = (dateKey: string, patch: Partial<DayWindow>) => {
    const cur = windows[dateKey];
    if (!cur) return;
    const next = { ...cur, ...patch };
    setWindows(prev => ({ ...prev, [dateKey]: next }));
    if (next.startTime && next.endTime) {
      setValues(v => ({ ...v, [dateKey]: String(windowHours(next)) }));
    }
    setDirtyWindows(prev => new Set(prev).add(dateKey));
  };

  if (!isOpen) return null;

  // A removed day is worth nothing, which is also what tells the caller to drop it.
  const dayHours = (d: AssignHoursDay) => (removedDays.has(d.dateKey) ? 0 : Number(values[d.dateKey]) || 0);
  const shownDays = days.filter(d => !removedDays.has(d.dateKey));

  const total = round1(shownDays.reduce((sum, d) => sum + dayHours(d), 0));

  // Live over-limit advisories for the hours currently entered. Advisory only.
  const hoursByDay: Record<string, number> = Object.fromEntries(days.map(d => [d.dateKey, dayHours(d)]));
  const warnings = jobId && getWarnings ? getWarnings(jobId, hoursByDay) : [];
  const progress = jobId && getProgress ? getProgress(jobId, hoursByDay) : null;

  // Days off only complain once hours actually land on them: marking the row is enough
  // while it is empty.
  const bookedOffDays = shownDays.filter(d => d.off && dayHours(d) > 0);
  const offWarnings = bookedOffDays.length ? [
    t(bookedOffDays.length === 1
      ? 'views.JobScheduling.AssignHoursModal.offDayWarningOne'
      : 'views.JobScheduling.AssignHoursModal.offDayWarningMany', {
      memberName,
      days: bookedOffDays.map(d => `${d.weekday} ${d.dayNum}`).join(', '),
      hours: round1(bookedOffDays.reduce((sum, d) => sum + dayHours(d), 0)),
    }),
  ] : [];

  // With no day to assign on, say which of the three reasons it is — the scheduler can
  // act on "he's off Mon and Tue", not on "no schedulable days".
  const jobNumber = jobs.find(j => j.id === jobId)?.jobNumber ?? '';
  const reason = days.length === 0 && jobId && getNoDaysReason ? getNoDaysReason(jobId) : null;
  const noDaysMessage =
    reason?.kind === 'unscheduled'
      ? t('views.JobScheduling.AssignHoursModal.noDaysUnscheduled', { jobNumber })
      : reason?.kind === 'notThisWeek'
        ? t('views.JobScheduling.AssignHoursModal.noDaysNotThisWeek', { jobNumber, days: reason.dayLabels.join(', ') })
        : t('views.JobScheduling.AssignHoursModal.noSchedulableDays', { memberName });

  const handleSubmit = () => {
    if (!jobId) return;
    const hoursByDay: Record<string, number> = {};
    for (const d of days) {
      const h = dayHours(d);
      hoursByDay[d.dateKey] = Number.isFinite(h) && h > 0 ? h : 0;
    }
    const windowsByDay: Record<string, DayWindow> = {};
    for (const k of dirtyWindows) {
      // A day on its way out keeps no retimed window.
      if (windows[k] && !removedDays.has(k)) windowsByDay[k] = windows[k];
    }
    onSubmit(jobId, hoursByDay, windowsByDay);
  };

  return (
    <Modal isOpen={isOpen} hidden={hidden} onClose={onClose} title={t('views.JobScheduling.AssignHoursModal.title', { memberName })}>
      <div className="space-y-4">
        <div>
          <label htmlFor="assign-job" className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 block">{t('views.JobScheduling.AssignHoursModal.jobLabel')}</label>
          <Select
            id="assign-job"
            value={jobId}
            onChange={setJobId}
            disabled={!!lockedJobId}
            // A shift assigned from inside the shift editor has no work order number of
            // its own, so the dash only appears when there are two parts to join.
            options={jobs.map(j => ({ value: j.id, label: [j.jobNumber, j.name].filter(Boolean).join(' — ') }))}
          />
        </div>

        {progress && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/30 px-3 py-2.5">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t('views.JobScheduling.AssignHoursModal.jobHours')}</span>
            <span className="text-sm text-gray-700 dark:text-gray-200">
              <span className="font-bold text-gray-900 dark:text-white">{progress.assigned}h</span>
              <span className="text-gray-400"> {t('views.JobScheduling.AssignHoursModal.ofEstimate', { estimate: progress.estimate })}</span>
              {progress.remaining > 0
                ? <span className="ml-2 font-bold text-primary-600 dark:text-primary-400">{t('views.JobScheduling.AssignHoursModal.stillNeeded', { remaining: progress.remaining })}</span>
                : <span className="ml-2 font-bold text-green-600 dark:text-green-400">{t('views.JobScheduling.AssignHoursModal.fullyStaffed')}</span>}
            </span>
          </div>
        )}

        <div>
          <div className="flex items-baseline justify-between mb-2">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">{t('views.JobScheduling.AssignHoursModal.hoursPerDay')}</span>
            <span className="text-xs font-bold text-gray-900 dark:text-white">{t('views.JobScheduling.AssignHoursModal.totalHours', { total })}</span>
          </div>
          {shownDays.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-3">{days.length === 0 ? noDaysMessage : t('views.JobScheduling.AssignHoursModal.allDaysRemoved')}</p>
          ) : (
            <div className="space-y-2">
              {shownDays.map(d => (
                <div key={d.dateKey} className="px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/30">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                        <span className="text-gray-400 uppercase text-xs font-bold tracking-wider mr-1.5">{d.weekday}</span>
                        {d.dayNum}
                      </span>
                      {/* A day off says so and still offers its times: somebody occasionally has
                          to be booked onto one, and the hours it takes come from the window like
                          any other day. The warning below is what flags it. */}
                      {d.off && (
                        <div className="text-xs font-bold uppercase tracking-wide text-red-500">
                          {d.offReason || t('views.JobScheduling.AssignHoursModal.dayOff')}
                        </div>
                      )}
                      {windows[d.dateKey] && (
                        <div className="mt-1 flex items-center gap-1.5">
                          <div className="w-[6.75rem]">
                            <TimeInput
                              size="sm"
                              value={windows[d.dateKey].startTime}
                              onChange={v => handleWindowChange(d.dateKey, { startTime: v })}
                              ariaLabel={t('views.JobScheduling.AssignHoursModal.startTimeOnDay', { weekday: d.weekday, dayNum: d.dayNum })}
                            />
                          </div>
                          <span className="text-xs text-gray-400">–</span>
                          <div className="w-[6.75rem]">
                            <TimeInput
                              size="sm"
                              value={windows[d.dateKey].endTime}
                              onChange={v => handleWindowChange(d.dateKey, { endTime: v })}
                              ariaLabel={t('views.JobScheduling.AssignHoursModal.endTimeOnDay', { weekday: d.weekday, dayNum: d.dayNum })}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {/* The day's length follows its start and end times — retime the day to
                          change it. An <output> and not a field: there is nothing to type here,
                          and it is literally the result of a calculation. */}
                      <output
                        aria-label={t('views.JobScheduling.AssignHoursModal.hoursOnDay', { weekday: d.weekday, dayNum: d.dayNum })}
                        className={`text-right text-base font-bold tabular-nums ${
                          d.off && dayHours(d) > 0
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-gray-900 dark:text-white'
                        }`}
                      >
                        {values[d.dateKey] || '0'}
                      </output>
                      <span className="text-xs text-gray-400 font-medium">h</span>
                      <button
                        type="button"
                        onClick={() => setRemovedDays(prev => new Set(prev).add(d.dateKey))}
                        aria-label={t('views.JobScheduling.AssignHoursModal.removeDay', { weekday: d.weekday, dayNum: d.dayNum })}
                        title={t('views.JobScheduling.AssignHoursModal.removeDay', { weekday: d.weekday, dayNum: d.dayNum })}
                        className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {onEditBreaks && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {(d.breaks ?? []).map(brk => (
                        <span key={brk.id} className="inline-flex items-center gap-1 rounded-md bg-gray-100 dark:bg-gray-700/60 px-1.5 py-0.5 text-[11px] font-medium text-gray-600 dark:text-gray-300">
                          <Coffee className="w-3 h-3 text-gray-400" />{brk.label || t('views.JobScheduling.AssignHoursModal.breakFallback')} · {breakDur(brk.durationMinutes)}
                        </span>
                      ))}
                      <button
                        type="button"
                        onClick={() => onEditBreaks(d.dateKey)}
                        aria-label={t('views.JobScheduling.AssignHoursModal.breaksActionOn', { action: (d.breaks ?? []).length ? t('views.JobScheduling.AssignHoursModal.editBreaks') : t('views.JobScheduling.AssignHoursModal.addBreak'), weekday: d.weekday, dayNum: d.dayNum })}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary-600 hover:text-primary-700 dark:text-primary-400"
                      >
                        {(d.breaks ?? []).length ? t('views.JobScheduling.AssignHoursModal.editBreaks') : <><Coffee className="w-3 h-3" /> {t('views.JobScheduling.AssignHoursModal.addBreak')}</>}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {shownDays.length > 0 && (
            <p className="text-xs text-gray-400 mt-2">{t('views.JobScheduling.AssignHoursModal.helperText')}</p>
          )}
        </div>

        {[...offWarnings, ...warnings].length > 0 && (
          <div className="space-y-1.5">
            {[...offWarnings, ...warnings].map((w, i) => (
              <div key={i} className="flex items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/20 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{w}</span>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
          <Button variant="secondary" onClick={onClose} className="flex-1">{t('views.JobScheduling.AssignHoursModal.cancel')}</Button>
          <Button onClick={handleSubmit} disabled={!jobId || days.length === 0} className="flex-1">{t('views.JobScheduling.AssignHoursModal.assign')}</Button>
        </div>
      </div>
    </Modal>
  );
};
