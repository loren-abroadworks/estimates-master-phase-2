import React, { useMemo, useState } from 'react';
import { CalendarClock, Lock, AlertCircle, ArrowRight, Info, SlidersHorizontal, X } from 'lucide-react';
import { Button, Badge, NumberInput, Toggle } from '../UI';
import { DatePicker } from '../ui/DatePicker';
import { Job, CrewMember } from '../../types';
import {
  shiftJobsFromPoint,
  ProposedChange,
  ShiftUnit,
  WorkingTimeConfig,
} from '../../services/scheduleEngine';
import { useTranslation } from '../../i18n/LanguageContext';

interface CascadeRescheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobs: Job[];
  crew: CrewMember[];
  config: WorkingTimeConfig;
  /** Prefilled 'YYYY-MM-DD' from a right-clicked calendar date. */
  initialFromDate?: string;
  onApply: (changes: ProposedChange[], label: string) => void;
}

const SKIP_LABELS: Record<string, string> = {
  locked: 'Locked',
  unscheduled: 'Not scheduled',
  'before-point': 'Before start point',
  'out-of-scope': 'Out of scope',
  'after-limit': 'After end date',
};

const fmt = (iso: string | null): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  });
};

const todayKey = (): string => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

export const CascadeRescheduleModal = ({
  isOpen,
  onClose,
  jobs,
  crew,
  config,
  initialFromDate,
  onApply,
}: CascadeRescheduleModalProps) => {
  const { t } = useTranslation();
  const [fromDate, setFromDate] = useState(initialFromDate || todayKey());
  const [unit, setUnit] = useState<ShiftUnit>('days');
  const [amount, setAmount] = useState(1);
  const [skipWeekends, setSkipWeekends] = useState(false);
  // Optional end bound: jobs starting after this date are left in place.
  const [untilDate, setUntilDate] = useState('');
  const [showUnchanged, setShowUnchanged] = useState(false);

  // Keep the prefilled date in sync when reopened from a different calendar cell.
  React.useEffect(() => {
    if (isOpen && initialFromDate) setFromDate(initialFromDate);
  }, [isOpen, initialFromDate]);

  const fromDateTime = useMemo(() => new Date(`${fromDate}T08:00`).toISOString(), [fromDate]);

  const changes = useMemo(
    () => shiftJobsFromPoint(
      jobs,
      fromDateTime,
      amount,
      unit,
      { ...config, skipNonWorkingDays: skipWeekends },
      undefined,
      untilDate,
    ),
    [jobs, fromDateTime, amount, unit, skipWeekends, config, untilDate],
  );

  const affected = changes.filter((c) => !c.skipped);
  const unchanged = changes.filter((c) => c.skipped);
  const visibleRows = showUnchanged ? changes : affected;

  const label = `Rescheduled ${affected.length} job${affected.length === 1 ? '' : 's'} by ${amount} ${unit === 'hours' ? (amount === 1 ? 'hour' : 'hours') : (amount === 1 ? 'day' : 'days')}`;

  const handleApply = () => {
    if (affected.length === 0) return;
    onApply(changes, label);
    onClose();
  };

  return (
    <>
      {/* Backdrop — only on narrow screens; on lg the drawer docks and the calendar resizes beside it */}
      {isOpen && <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 lg:hidden transition-opacity" onClick={onClose} />}

      <div
        className={`fixed top-0 right-0 h-full w-full sm:w-[440px] z-50 flex flex-col bg-white dark:bg-gray-900 shadow-2xl border-l border-gray-200 dark:border-gray-800 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Accent rail */}
        <div className="h-1 w-full bg-gradient-to-r from-primary-500 via-primary-600 to-primary-500" />

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3 min-w-0">
            <div className="shrink-0 grid place-items-center w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-300">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <h2 className="font-heading font-black text-lg text-gray-900 dark:text-white leading-tight tracking-tight">{t('modals.CascadeRescheduleModal.bulkReschedule')}</h2>
          </div>
          <button onClick={onClose} aria-label={t('modals.CascadeRescheduleModal.close')} className="shrink-0 grid place-items-center w-9 h-9 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <div className="space-y-6">
        {/* Starting from */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">{t('modals.CascadeRescheduleModal.startingFrom')}</span>
          <DatePicker value={fromDate} onChange={setFromDate} />
        </div>

        {/* End date (optional upper bound) — jobs starting after it stay put */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">{t('modals.CascadeRescheduleModal.stopAfterOptional')}</span>
            {untilDate && (
              <button
                type="button"
                aria-label={t('modals.CascadeRescheduleModal.clearEndDate')}
                onClick={() => setUntilDate('')}
                className="text-[11px] font-semibold text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                {t('modals.CascadeRescheduleModal.clear')}
              </button>
            )}
          </div>
          <DatePicker value={untilDate} onChange={setUntilDate} />
          {!untilDate && (
            <p className="text-[11px] text-gray-400 dark:text-gray-500">{t('modals.CascadeRescheduleModal.noEndLimitHint')}</p>
          )}
        </div>

        {/* Shift method */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">{t('modals.CascadeRescheduleModal.shiftMethod')}</span>
          <div className="flex items-center gap-3">
            <div className="flex bg-gray-100 dark:bg-gray-900 rounded-xl p-1">
              {(['hours', 'days'] as ShiftUnit[]).map((u) => (
                <button
                  key={u}
                  onClick={() => setUnit(u)}
                  className={`px-4 py-2 rounded-lg text-sm font-bold capitalize whitespace-nowrap transition-colors ${
                    unit === u
                      ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 shadow-sm'
                      : 'text-gray-500 dark:text-gray-400'
                  }`}
                >
                  {t('modals.CascadeRescheduleModal.byUnit', { unit: u })}
                </button>
              ))}
            </div>
            <div className="w-20">
              <NumberInput value={amount} onChange={(v) => setAmount(Math.max(1, Math.round(v)))} min={1} step={1} className="!py-2 !px-4 !text-sm !text-center" />
            </div>
            <span className="text-sm text-gray-500 dark:text-gray-400 font-medium">{t('modals.CascadeRescheduleModal.unitForward', { unit })}</span>
          </div>
        </div>

        {/* Skip non-working days (days only) */}
        {unit === 'days' && (
          <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
            <Toggle label={t('modals.CascadeRescheduleModal.skipWeekendsHolidays')} checked={skipWeekends} onChange={setSkipWeekends} />
          </div>
        )}

        {/* Affected jobs preview */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest flex items-center gap-2">
              <CalendarClock className="w-4 h-4" /> {t('modals.CascadeRescheduleModal.affectedJobs', { count: affected.length })}
            </h4>
            {unchanged.length > 0 && (
              <button
                onClick={() => setShowUnchanged((s) => !s)}
                className="text-xs font-bold text-primary-600 dark:text-primary-400 hover:underline"
              >
                {showUnchanged ? t('modals.CascadeRescheduleModal.hide') : t('modals.CascadeRescheduleModal.show')} {t('modals.CascadeRescheduleModal.unchangedCount', { count: unchanged.length })}
              </button>
            )}
          </div>

          <div className="border border-gray-200 dark:border-gray-700 rounded-2xl overflow-hidden max-h-72 overflow-y-auto custom-scrollbar">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0">
                <tr className="bg-gray-50 dark:bg-gray-900 text-gray-500 dark:text-gray-400 font-bold uppercase text-[10px] tracking-widest">
                  <th className="px-4 py-3">{t('modals.CascadeRescheduleModal.colJob')}</th>
                  <th className="px-4 py-3">{t('modals.CascadeRescheduleModal.colFrom')}</th>
                  <th className="px-4 py-3"></th>
                  <th className="px-4 py-3">{t('modals.CascadeRescheduleModal.colTo')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {visibleRows.map((c) => (
                  <tr key={c.jobId} className={c.skipped ? 'opacity-50' : ''}>
                    <td className="px-4 py-3">
                      <div className="flex items-baseline gap-2 min-w-0">
                        <span className="font-semibold text-gray-900 dark:text-white truncate">{c.jobName}</span>
                        {c.skipped === 'locked' && <Lock className="w-3 h-3 shrink-0 self-center text-amber-500" />}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmt(c.oldStart)}</td>
                    <td className="px-4 py-3 text-gray-300 dark:text-gray-600">
                      {c.skipped ? (
                        <Badge color="amber">{SKIP_LABELS[c.skipped]}</Badge>
                      ) : (
                        <ArrowRight className="w-4 h-4" />
                      )}
                    </td>
                    <td className="px-4 py-3 font-bold text-gray-900 dark:text-white whitespace-nowrap">
                      {c.skipped ? '—' : fmt(c.newStart)}
                    </td>
                  </tr>
                ))}
                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-400 dark:text-gray-500 italic">
                      {t('modals.CascadeRescheduleModal.noJobsAtStartPoint')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="mt-3 text-xs text-gray-500 dark:text-gray-400 flex items-start gap-2">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            {t('modals.CascadeRescheduleModal.infoJobsWillMove')}{untilDate ? t('modals.CascadeRescheduleModal.infoAndBeforeEndDate') : ''}{t('modals.CascadeRescheduleModal.infoLockedNote')}
          </p>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
          <Button variant="secondary" onClick={onClose} className="flex-1">{t('modals.CascadeRescheduleModal.cancel')}</Button>
          <Button onClick={handleApply} disabled={affected.length === 0} className="flex-1 shadow-lg shadow-primary-500/20">
            {affected.length === 0 ? t('modals.CascadeRescheduleModal.noJobsToMove') : (affected.length === 1 ? t('modals.CascadeRescheduleModal.applyToJobSingular', { count: affected.length }) : t('modals.CascadeRescheduleModal.applyToJobPlural', { count: affected.length }))}
          </Button>
        </div>
        {affected.length === 0 && (
          <div className="text-[11px] text-amber-600 font-bold flex items-center gap-1.5 -mt-3">
            <AlertCircle className="w-3 h-3" /> {t('modals.CascadeRescheduleModal.adjustStartPointHint')}
          </div>
        )}
          </div>
        </div>
      </div>
    </>
  );
};
