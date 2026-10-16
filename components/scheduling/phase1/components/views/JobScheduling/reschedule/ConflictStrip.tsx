import React from 'react';
import { AlertTriangle, CheckCircle2, Wand2 } from 'lucide-react';
import { useTranslation } from '../../../../i18n/LanguageContext';

interface ConflictStripProps {
  /** Number of detected scheduling issues. */
  issueCount: number;
  /** Locked jobs that can't move (informational). */
  lockedCount?: number;
  /** A suggestion set exists, so Auto-Fix can run. */
  canAutoFix: boolean;
  /** Trigger the Auto-Fix preview. */
  onAutoFix: () => void;
  /** Optional "View"/"Hide" toggle for per-job detail (bulk mode). */
  onViewDetails?: () => void;
  reviewing?: boolean;
}

export const ConflictStrip = ({ issueCount, lockedCount = 0, canAutoFix, onAutoFix, onViewDetails, reviewing }: ConflictStripProps) => {
  const { t } = useTranslation();
  const hasProblems = issueCount > 0 || lockedCount > 0;

  if (!hasProblems) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-green-200 dark:border-green-800 bg-green-50/70 dark:bg-green-900/20 px-3 py-2.5 text-sm font-medium text-green-700 dark:text-green-400">
        <CheckCircle2 className="w-4 h-4 shrink-0" /> {t('views.JobScheduling.reschedule.ConflictStrip.noConflicts')}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-red-200 dark:border-red-800 bg-red-50/70 dark:bg-red-900/20 px-3 py-2.5">
      <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
      <span className="text-sm font-bold text-red-700 dark:text-red-300">
        {issueCount > 0
          ? (issueCount === 1
            ? t('views.JobScheduling.reschedule.ConflictStrip.conflictSingular', { count: issueCount })
            : t('views.JobScheduling.reschedule.ConflictStrip.conflictPlural', { count: issueCount }))
          : t('views.JobScheduling.reschedule.ConflictStrip.locked', { count: lockedCount })}
      </span>
      {onViewDetails && (
        <button onClick={onViewDetails} className="text-[11px] font-bold text-red-600 dark:text-red-300 underline">
          {reviewing ? t('views.JobScheduling.reschedule.ConflictStrip.hide') : t('views.JobScheduling.reschedule.ConflictStrip.view')}
        </button>
      )}
      {canAutoFix && (
        <button
          onClick={onAutoFix}
          className="ml-auto inline-flex items-center gap-1 rounded-full bg-primary-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-primary-700"
        >
          <Wand2 className="w-3.5 h-3.5" /> {t('views.JobScheduling.reschedule.ConflictStrip.autoFix')}
        </button>
      )}
    </div>
  );
};
