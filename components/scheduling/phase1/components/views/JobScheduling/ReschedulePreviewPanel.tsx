import React, { useEffect, useRef, useState } from 'react';
import { CalendarClock, X, CheckCircle2, Wand2 } from 'lucide-react';
import { Button, Badge } from '../../UI';
import { StagedReschedule, summarizeStaged } from '../../../services/reschedulePreview';
import type { ProposedChange } from '../../../services/scheduleEngine';
import { ScheduleIssue } from '../../../services/rescheduleIssues';
import { Suggestion } from '../../../services/rescheduleSuggestions';
import { ConflictResolution } from '../../../services/resolveSameDayConflicts';
import { RescheduleImpact } from '../../../services/rescheduleImpact';
import { JobStats } from '../../../services/jobStats';
import { SingleJobEditor } from './reschedule/SingleJobEditor';
import { BulkPreview } from './reschedule/BulkPreview';
import { useTranslation } from '../../../i18n/LanguageContext';

export interface CrewMemberLite { id: string; name: string; role?: string; photo?: string; color?: string; }

interface ReschedulePreviewPanelProps {
  staged: StagedReschedule | null;
  issues: ScheduleIssue[];
  /** Advisory hours warnings for the edited job, passed to SingleJobEditor. */
  hoursWarnings?: ScheduleIssue[];
  suggestions: Suggestion[];
  impact: RescheduleImpact;
  onApply: () => void;
  onCancel: () => void;
  onAutoFix: () => void;
  /** Auto-Fix preview opened: show proposed destinations on the board. */
  onPreviewAutoFix?: () => void;
  /** Auto-Fix preview cancelled: clear the board destinations. */
  onCancelAutoFix?: () => void;
  onChangeDelay?: (days: number) => void;
  dailyHoursEdits?: Record<string, Record<string, { startTime: string; endTime: string }>>;
  onChangeDailyHour?: (jobId: string, dateKey: string, field: 'startTime' | 'endTime', value: string) => void;
  onChangeJobDate?: (jobId: string, field: 'start' | 'end', value: string) => void;
  onShiftStartTime?: (jobId: string, dayKey: string, startTime: string) => void;
  /** Shift-management bundle forwarded to SingleJobEditor (staged draft-job cards). */
  manage?: React.ComponentProps<typeof SingleJobEditor>['manage'];
  crewByJob?: Record<string, CrewMemberLite[]>;
  onReassignCrew?: (jobId: string) => void;
  statsByJob?: Record<string, JobStats>;
  /** jobId -> client name, for the single-job header subtitle. */
  clientNameByJob?: Record<string, string>;
  /** JS getDay() values disabled in scheduling settings; hidden from daily-hours rows. */
  nonWorkingWeekdays?: number[];
  /** Cascade toggle for the single-job editor. */
  cascade?: boolean;
  onToggleCascade?: (on: boolean) => void;
  /** Smart vs Simple placement toggle (shown when cascade is on). */
  keepExistingDaysAsIs?: boolean;
  onToggleKeepExistingDays?: (on: boolean) => void;
  followingJobs?: import('../../../services/scheduleEngine').ProposedChange[];
  /** Cascade end-date cutoff (local 'YYYY-MM-DD'); empty = no limit. */
  cascadeUntil?: string;
  onChangeCascadeUntil?: (date: string) => void;
  /** Followers left untouched because they fall after the cutoff. */
  protectedJobs?: import('../../../services/scheduleEngine').ProposedChange[];
  /** Names of moved followers that leapfrogged a protected job. */
  leapfrogJobNames?: string[];
  conflictResolutions?: ConflictResolution[];
  onMoveConflicts?: () => void;
}

export const ReschedulePreviewPanel = ({
  staged, issues, hoursWarnings, suggestions, impact, onApply, onCancel, onAutoFix, onPreviewAutoFix, onCancelAutoFix, onChangeDelay,
  dailyHoursEdits, onChangeDailyHour, onChangeJobDate, onShiftStartTime, crewByJob, onReassignCrew, statsByJob, clientNameByJob, nonWorkingWeekdays,
  manage,
  cascade, onToggleCascade, keepExistingDaysAsIs, onToggleKeepExistingDays, followingJobs, cascadeUntil, onChangeCascadeUntil, protectedJobs, leapfrogJobNames, conflictResolutions, onMoveConflicts,
}: ReschedulePreviewPanelProps) => {
  const { t } = useTranslation();
  const [autoFixPreview, setAutoFixPreview] = useState<string[] | null>(null);
  const [autoFixApplied, setAutoFixApplied] = useState<string[] | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if ((autoFixPreview || autoFixApplied) && bodyRef.current) bodyRef.current.scrollTo?.({ top: 0, behavior: 'smooth' });
  }, [autoFixPreview, autoFixApplied]);

  useEffect(() => { if (!staged) { setAutoFixApplied(null); setAutoFixPreview(null); } }, [staged]);

  if (!staged) return null;

  const { changedCount, skippedCount } = summarizeStaged(staged.changes);
  const changed = staged.changes.filter(c => !c.skipped);
  const isEdit = staged.mode === 'edit';
  const draft = staged.draftJob;
  // In management mode the primary isn't in `changes` (those are followers) — synthesize a
  // header/impact change from the draft job's envelope.
  const editChange: ProposedChange | undefined = draft
    ? { jobId: draft.id, jobName: draft.name, jobNumber: draft.jobNumber,
        oldStart: draft.startDate ?? null, oldEnd: draft.endDate ?? null,
        newStart: draft.startDate ?? '', newEnd: draft.endDate ?? draft.startDate ?? '' }
    : staged.primaryJobId
      ? (changed.find(c => c.jobId === staged.primaryJobId) ?? changed[0])
      : changed[0];
  const highCount = issues.filter(i => i.severity === 'high').length;

  const previewAutoFix = () => { setAutoFixApplied(null); setAutoFixPreview(suggestions.map(s => s.label)); onPreviewAutoFix?.(); };
  const cancelAutoFix = () => { setAutoFixPreview(null); onCancelAutoFix?.(); };
  const confirmAutoFix = () => { setAutoFixApplied(autoFixPreview ?? suggestions.map(s => s.label)); setAutoFixPreview(null); onAutoFix(); };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden animate-in fade-in duration-200" onClick={onCancel} />
      <div className="fixed top-0 right-0 h-full w-full sm:w-[440px] z-50 flex flex-col bg-white dark:bg-gray-900 shadow-2xl border-l border-gray-200 dark:border-gray-800 animate-in slide-in-from-right duration-300">
        <div className="h-1 w-full bg-gradient-to-r from-primary-500 via-primary-600 to-primary-500" />

        <div className="flex items-start justify-between gap-4 px-5 pt-4 pb-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-start gap-3 min-w-0">
            <div className="shrink-0 grid place-items-center w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-300">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              {isEdit ? (
                <>
                  <h3 className="font-heading font-black text-lg text-gray-900 dark:text-white leading-tight">{t('views.JobScheduling.ReschedulePreviewPanel.editSchedule')}</h3>
                  <div className="mt-1 text-sm text-gray-500 dark:text-gray-400 truncate">
                    {editChange?.jobName}
                    {clientNameByJob?.[editChange?.jobId ?? ''] ? ` · ${clientNameByJob[editChange.jobId]}` : ''}
                    {statsByJob?.[editChange?.jobId ?? '']?.workOrderNumber ? ` · #${statsByJob[editChange.jobId].workOrderNumber}` : ''}
                  </div>
                </>
              ) : (
                <>
                  <h3 className="font-heading font-black text-lg text-gray-900 dark:text-white leading-tight">{t('views.JobScheduling.ReschedulePreviewPanel.reschedulePreview')}</h3>
                  <div className="mt-1 flex items-center gap-2 flex-wrap"><Badge color="primary">{staged.label}</Badge></div>
                  <div className="mt-1.5 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 flex-wrap">
                    <span><span className="font-semibold text-gray-700 dark:text-gray-200">{changedCount}</span> {t('views.JobScheduling.ReschedulePreviewPanel.changing')}</span>
                    {skippedCount > 0 && <span className="text-gray-400">· {skippedCount} {t('views.JobScheduling.ReschedulePreviewPanel.skipped')}</span>}
                    {highCount > 0 && <Badge color="red">{highCount} {t('views.JobScheduling.ReschedulePreviewPanel.toResolve')}</Badge>}
                  </div>
                </>
              )}
            </div>
          </div>
          <button onClick={onCancel} aria-label={t('views.JobScheduling.ReschedulePreviewPanel.close')} className="shrink-0 grid place-items-center w-9 h-9 rounded-full text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div ref={bodyRef} className="flex-1 overflow-y-auto px-5 py-5">
          {autoFixPreview && (
            <div className="mb-6 rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/30 shadow-md p-3 animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="flex items-start gap-2">
                <Wand2 className="w-4 h-4 mt-0.5 shrink-0 text-primary-600 dark:text-primary-300" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-primary-800 dark:text-primary-200">
                    {autoFixPreview.length > 0 ? (autoFixPreview.length === 1 ? t('views.JobScheduling.ReschedulePreviewPanel.autoFixWillMakeSingular', { count: autoFixPreview.length }) : t('views.JobScheduling.ReschedulePreviewPanel.autoFixWillMakePlural', { count: autoFixPreview.length })) : t('views.JobScheduling.ReschedulePreviewPanel.autoFixNothingToChange')}
                  </div>
                  {autoFixPreview.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-primary-700 dark:text-primary-300">{autoFixPreview.map((l, i) => <li key={i}>• {l}</li>)}</ul>
                  )}
                  <div className="mt-2.5 flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={cancelAutoFix}>{t('views.JobScheduling.ReschedulePreviewPanel.cancel')}</Button>
                    <Button size="sm" onClick={confirmAutoFix} disabled={autoFixPreview.length === 0}>{t('views.JobScheduling.ReschedulePreviewPanel.applyAutoFix')}</Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {autoFixApplied && (
            <div className="mb-6 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/30 shadow-md p-3 animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-start gap-2 min-w-0">
                  <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-green-600 dark:text-green-400" />
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-green-800 dark:text-green-300">
                      {autoFixApplied.length > 0 ? (autoFixApplied.length === 1 ? t('views.JobScheduling.ReschedulePreviewPanel.autoFixAppliedSingular', { count: autoFixApplied.length }) : t('views.JobScheduling.ReschedulePreviewPanel.autoFixAppliedPlural', { count: autoFixApplied.length })) : t('views.JobScheduling.ReschedulePreviewPanel.autoFixRanNothingToChange')}
                    </div>
                    {autoFixApplied.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-xs text-green-700 dark:text-green-400">{autoFixApplied.map((l, i) => <li key={i}>• {l}</li>)}</ul>
                    )}
                  </div>
                </div>
                <button onClick={() => setAutoFixApplied(null)} aria-label={t('views.JobScheduling.ReschedulePreviewPanel.dismiss')} className="shrink-0 text-green-600/70 hover:text-green-800 dark:hover:text-green-300"><X className="w-4 h-4" /></button>
              </div>
            </div>
          )}

          {isEdit && editChange ? (
            <SingleJobEditor
              change={editChange}
              clientName={clientNameByJob?.[editChange.jobId]}
              issues={issues}
              hoursWarnings={hoursWarnings}
              suggestions={suggestions}
              onAutoFix={previewAutoFix}
              stats={statsByJob?.[editChange.jobId]}
              crew={crewByJob?.[editChange.jobId] ?? []}
              onReassignCrew={onReassignCrew}
              dayHours={dailyHoursEdits?.[editChange.jobId] ?? {}}
              onChangeDailyHour={onChangeDailyHour}
              onChangeJobDate={onChangeJobDate}
              onShiftStartTime={onShiftStartTime}
              manage={manage}
              nonWorkingWeekdays={nonWorkingWeekdays}
              autoFixPreviewActive={!!autoFixPreview}
              cascade={cascade}
              // Cascade only applies when moving an already-scheduled job; for a
              // first-time placement (no prior start) there is nothing to shift.
              onToggleCascade={editChange.oldStart ? onToggleCascade : undefined}
              keepExistingDaysAsIs={keepExistingDaysAsIs}
              onToggleKeepExistingDays={onToggleKeepExistingDays}
              followingJobs={followingJobs}
              cascadeUntil={cascadeUntil}
              onChangeCascadeUntil={onChangeCascadeUntil}
              protectedJobs={protectedJobs}
              leapfrogJobNames={leapfrogJobNames}
              conflictResolutions={conflictResolutions}
              onMoveConflicts={onMoveConflicts}
            />
          ) : (
            <BulkPreview
              changes={staged.changes}
              issues={issues}
              suggestions={suggestions}
              impact={impact}
              onAutoFix={previewAutoFix}
              delayDays={staged.delayDays}
              onChangeDelay={staged.recompute && onChangeDelay ? onChangeDelay : undefined}
              autoFixPreviewActive={!!autoFixPreview}
            />
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 space-y-2.5">
          {isEdit ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center">{t('views.JobScheduling.ReschedulePreviewPanel.savesOnApply')}</p>
          ) : changedCount > 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center">{changedCount === 1 ? t('views.JobScheduling.ReschedulePreviewPanel.applyingWillRescheduleSingular', { count: changedCount }) : t('views.JobScheduling.ReschedulePreviewPanel.applyingWillReschedulePlural', { count: changedCount })}</p>
          ) : null}
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" className="flex-1" onClick={onCancel}>{t('views.JobScheduling.ReschedulePreviewPanel.cancel')}</Button>
            <Button size="sm" className="flex-[2]" onClick={onApply} disabled={!isEdit && changedCount === 0}>
              {isEdit ? t('views.JobScheduling.ReschedulePreviewPanel.apply') : (changedCount > 0 ? (changedCount === 1 ? t('views.JobScheduling.ReschedulePreviewPanel.applyWithJobSingular', { count: changedCount }) : t('views.JobScheduling.ReschedulePreviewPanel.applyWithJobPlural', { count: changedCount })) : t('views.JobScheduling.ReschedulePreviewPanel.apply'))}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};
