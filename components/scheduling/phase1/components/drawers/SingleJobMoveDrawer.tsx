import React, { useMemo, useState } from 'react';
import { X, ArrowRight, CalendarClock, MapPin, AlertTriangle, CheckCircle2, Flag } from 'lucide-react';
import { Button, Badge } from '../UI';
import { DatePicker } from '../ui/DatePicker';
import { Job } from '../../types';
import {
  moveJobToEnd,
  moveJobToSlot,
  detectConflicts,
  ProposedChange,
  WorkingTimeConfig,
} from '../../services/scheduleEngine';
import { useTranslation } from '../../i18n/LanguageContext';

type MoveTab = 'end' | 'slot';

interface SingleJobMoveDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  job: Job | null;
  jobs: Job[];
  config: WorkingTimeConfig;
  initialTab?: MoveTab;
  referenceDate: string; // ISO 'now', injected so the engine stays pure
  onApply: (changes: ProposedChange[], label: string) => void;
}

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const SingleJobMoveDrawer = ({
  isOpen,
  onClose,
  job,
  jobs,
  config,
  initialTab = 'end',
  referenceDate,
  onApply,
}: SingleJobMoveDrawerProps) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<MoveTab>(initialTab);
  const [slotDate, setSlotDate] = useState(todayKey());
  const [slotTime, setSlotTime] = useState('08:00');

  React.useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      if (job?.startDate) {
        const d = new Date(job.startDate);
        setSlotDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
      }
    }
  }, [isOpen, initialTab, job]);

  // Duration preserved when moving to a specific slot.
  const durationMs = useMemo(() => {
    if (job?.startDate && job?.endDate) {
      return new Date(job.endDate).getTime() - new Date(job.startDate).getTime();
    }
    return 86_400_000;
  }, [job]);

  const endChange = useMemo(
    () => (job && isOpen ? moveJobToEnd(jobs, job.id, config, referenceDate) : null),
    [job, jobs, config, referenceDate, isOpen],
  );

  const slotChange = useMemo(() => {
    if (!job) return null;
    const start = new Date(`${slotDate}T${slotTime || '08:00'}`);
    const end = new Date(start.getTime() + durationMs);
    return moveJobToSlot(jobs, job.id, start.toISOString(), end.toISOString());
  }, [job, jobs, slotDate, slotTime, durationMs]);

  const slotConflicts = useMemo(() => {
    if (!job || !slotChange) return [];
    return detectConflicts(jobs, job.id, slotChange.newStart, slotChange.newEnd, config);
  }, [job, jobs, slotChange, config]);

  if (!job) return null;

  const activeChange = tab === 'end' ? endChange : slotChange;

  const handleApply = () => {
    if (!activeChange || activeChange.skipped) return;
    const label = tab === 'end'
      ? `Moved "${job.name}" to end of schedule`
      : `Moved "${job.name}" to ${fmt(activeChange.newStart)}`;
    onApply([activeChange], label);
    onClose();
  };

  const isLockedNoop = activeChange?.skipped === 'locked';

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden transition-opacity" onClick={onClose} />}

      <div
        className={`fixed top-0 right-0 h-full w-full md:w-[440px] bg-white dark:bg-gray-900 shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-6 border-b border-gray-100 dark:border-gray-800 flex justify-between items-start bg-gray-50/50 dark:bg-gray-800/50">
            <div className="min-w-0">
              <h2 className="text-xl font-black text-gray-900 dark:text-white tracking-tight truncate">{t('drawers.SingleJobMoveDrawer.moveJob')}</h2>
              <p className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mt-1 truncate">{job.name}</p>
              <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mt-2">
                <MapPin className="w-3 h-3" /> {job.address.split(',')[0]}
              </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full transition-colors text-gray-500 shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Tabs */}
          <div className="px-6 pt-4">
            <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
              <button
                onClick={() => setTab('end')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold transition-colors ${tab === 'end' ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
              >
                {t('drawers.SingleJobMoveDrawer.moveToEnd')}
              </button>
              <button
                onClick={() => setTab('slot')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-bold transition-colors ${tab === 'slot' ? 'bg-white dark:bg-gray-700 text-primary-600 dark:text-primary-400 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
              >
                {t('drawers.SingleJobMoveDrawer.specificSlot')}
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5">
            {isLockedNoop ? (
              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl flex gap-3">
                <Flag className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-300">{t('drawers.SingleJobMoveDrawer.lockedNotice')}</p>
              </div>
            ) : tab === 'end' ? (
              <>
                <p className="text-sm text-gray-600 dark:text-gray-300">{t('drawers.SingleJobMoveDrawer.moveToEndDescription')}</p>
                <div className="p-5 bg-primary-50 dark:bg-primary-900/20 rounded-2xl border border-primary-100 dark:border-primary-800">
                  <div className="text-xs font-bold text-primary-600 dark:text-primary-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                    <CalendarClock className="w-4 h-4" /> {t('drawers.SingleJobMoveDrawer.proposedNewSlot')}
                  </div>
                  <div className="text-lg font-bold text-primary-900 dark:text-primary-100">{fmt(endChange?.newStart || null)}</div>
                  <div className="text-sm text-primary-700/80 dark:text-primary-300/80 mt-1">{t('drawers.SingleJobMoveDrawer.nextOpenSlotNote')}</div>
                </div>
              </>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest block mb-2">{t('drawers.SingleJobMoveDrawer.newDate')}</span>
                    <DatePicker value={slotDate} onChange={setSlotDate} />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest block mb-2">{t('drawers.SingleJobMoveDrawer.startTime')}</span>
                    <input
                      type="time"
                      value={slotTime}
                      onChange={(e) => setSlotTime(e.target.value)}
                      className="w-full px-4 py-3 bg-white dark:bg-gray-900 border border-gray-400 dark:border-gray-500 rounded-xl outline-none focus:ring-2 focus:ring-primary-100 dark:focus:ring-primary-900/20 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>

                {slotConflicts.length > 0 ? (
                  <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
                    <div>
                      <div className="text-sm font-bold text-red-700 dark:text-red-300">{t('drawers.SingleJobMoveDrawer.conflictCount', { count: slotConflicts.length, s: slotConflicts.length === 1 ? '' : 's' })}</div>
                      <div className="text-xs text-red-600/80 dark:text-red-400/80 mt-0.5">{t('drawers.SingleJobMoveDrawer.conflictOverlaps', { names: jobs.filter(j => slotConflicts.includes(j.id)).map(j => j.name).join(', ') })}</div>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl flex gap-3 items-center">
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0" />
                    <div className="text-sm font-medium text-green-700 dark:text-green-300">{t('drawers.SingleJobMoveDrawer.noConflicts')}</div>
                  </div>
                )}
              </>
            )}

            {!isLockedNoop && activeChange && (
              <div className="rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                <div className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-3">{t('drawers.SingleJobMoveDrawer.scheduleChange')}</div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500 dark:text-gray-400">{fmt(activeChange.oldStart)}</span>
                  <ArrowRight className="w-4 h-4 text-gray-300 dark:text-gray-600" />
                  <span className="font-bold text-gray-900 dark:text-white">{fmt(activeChange.newStart)}</span>
                </div>
              </div>
            )}

            <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" /> {t('drawers.SingleJobMoveDrawer.otherJobsNote')}
            </p>
          </div>

          {/* Footer */}
          <div className="p-6 border-t border-gray-100 dark:border-gray-800 flex gap-3">
            <Button variant="secondary" onClick={onClose} className="flex-1">{t('drawers.SingleJobMoveDrawer.cancel')}</Button>
            <Button onClick={handleApply} disabled={isLockedNoop} className="flex-1 shadow-lg shadow-primary-500/20">{t('drawers.SingleJobMoveDrawer.apply')}</Button>
          </div>
        </div>
      </div>
    </>
  );
};
