import React from 'react';
import { ArrowRight, AlertTriangle } from 'lucide-react';
import { Select } from '../../../UI';
import { ProposedChange } from '../../../../services/scheduleEngine';
import { ScheduleIssue } from '../../../../services/rescheduleIssues';
import { Suggestion } from '../../../../services/rescheduleSuggestions';
import { RescheduleImpact } from '../../../../services/rescheduleImpact';
import { ConflictStrip } from './ConflictStrip';
import { ImpactTiles } from './ImpactTiles';
import { SmartSuggestionsCard } from '../SmartSuggestionsCard';
import { useTranslation } from '../../../../i18n/LanguageContext';

interface BulkPreviewProps {
  changes: ProposedChange[];
  issues: ScheduleIssue[];
  suggestions: Suggestion[];
  impact: RescheduleImpact;
  onAutoFix: () => void;
  delayDays?: number;
  onChangeDelay?: (days: number) => void;
  /** Auto-Fix preview card is showing in the panel; hide the redundant conflict strip. */
  autoFixPreviewActive?: boolean;
}

const DELAY_OPTIONS = [1, 2, 3, 5, 7];
const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[11px] font-black uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500">{children}</div>
);
const fmtShort = (iso: string | null) => iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';

export const BulkPreview = ({ changes, issues, suggestions, impact, onAutoFix, delayDays, onChangeDelay, autoFixPreviewActive }: BulkPreviewProps) => {
  const { t } = useTranslation();
  const changed = changes.filter(c => !c.skipped);
  const issuesByJob = new Set(issues.map(i => i.jobId));

  return (
    <div className="space-y-6">
      {!autoFixPreviewActive && <ConflictStrip issueCount={issues.length} lockedCount={impact.lockedCount} canAutoFix={suggestions.length > 0} onAutoFix={onAutoFix} />}

      {onChangeDelay && (
        <div className="space-y-1.5">
          <SectionLabel>{t('views.JobScheduling.reschedule.BulkPreview.delayBy')}</SectionLabel>
          <Select
            value={delayDays ?? impact.totalDelayDays}
            onChange={v => onChangeDelay(Number(v))}
            options={DELAY_OPTIONS.map(d => ({ value: d, label: d === 1 ? t('views.JobScheduling.reschedule.BulkPreview.daySingular', { count: d }) : t('views.JobScheduling.reschedule.BulkPreview.dayPlural', { count: d }) }))}
          />
        </div>
      )}

      <div className="space-y-2">
        <SectionLabel>{t('views.JobScheduling.reschedule.BulkPreview.scheduleImpact')}</SectionLabel>
        <ImpactTiles impact={impact} />
      </div>

      <div className="space-y-2">
        <SectionLabel>{t('views.JobScheduling.reschedule.BulkPreview.affectedJobs')}</SectionLabel>
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-800">
          {changed.map(c => (
            <div key={c.jobId} className="flex items-center gap-2 px-3 py-2.5 text-sm">
              <div className="min-w-0 max-w-[150px]">
                <div className="font-bold truncate text-gray-900 dark:text-white">{c.jobName}</div>
                {/* Elapsed days do not move. Saying so here is what stops the preview
                    implying the whole job slides. */}
                {!!c.pinnedDays?.length && (
                  <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                    {t('views.JobScheduling.reschedule.BulkPreview.keepsWorkedDays', { count: c.pinnedDays.length })}
                  </div>
                )}
              </div>
              {issuesByJob.has(c.jobId) && <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-500" />}
              <span className="ml-auto flex items-center gap-1.5 text-xs">
                <span className="text-gray-400">{fmtShort(c.oldStart)}</span>
                <ArrowRight className="w-3 h-3 text-gray-400" />
                <span className="text-primary-600 dark:text-primary-400 font-semibold">{fmtShort(c.newStart)}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <SmartSuggestionsCard impact={impact} hasSuggestions={false} onAutoFix={onAutoFix} />
    </div>
  );
};
