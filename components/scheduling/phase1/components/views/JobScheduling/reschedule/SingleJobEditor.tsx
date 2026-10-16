import React from 'react';
import { Briefcase, CalendarClock, Users, UserCog, Info, AlertTriangle, Wand2 } from 'lucide-react';
import { ProposedChange, spannedDayKeys } from '../../../../services/scheduleEngine';
import { Toggle, Tooltip, TimeInput, Button } from '../../../UI';
import { ScheduleIssue } from '../../../../services/rescheduleIssues';
import { Suggestion } from '../../../../services/rescheduleSuggestions';
import { ConflictResolution, isMovableResolution } from '../../../../services/resolveSameDayConflicts';
import { JobStats } from '../../../../services/jobStats';
import { ConflictStrip } from './ConflictStrip';
import { CrewAvatar } from '../CrewAvatar';
import { DatePicker } from '../../../ui/DatePicker';
import type { CrewMemberLite } from '../ReschedulePreviewPanel';
import { JobCrewAllocation, CrewMember } from '../../../../types';
import { ShiftList } from '../ShiftList';
import { MoveScheduleModal, type MoveScheduleRow } from './MoveScheduleModal';
import { useTranslation } from '../../../../i18n/LanguageContext';

interface SingleJobEditorProps {
  change: ProposedChange;
  clientName?: string;
  issues: ScheduleIssue[];
  /** Advisory hours warnings (budget / day-capacity) for this job. Not auto-fixable. */
  hoursWarnings?: ScheduleIssue[];
  suggestions: Suggestion[];
  onAutoFix: () => void;
  stats?: JobStats;
  crew: CrewMemberLite[];
  onReassignCrew?: (jobId: string) => void;
  dayHours: Record<string, { startTime: string; endTime: string }>;
  onChangeDailyHour?: (jobId: string, dateKey: string, field: 'startTime' | 'endTime', value: string) => void;
  onChangeJobDate?: (jobId: string, field: 'start' | 'end', value: string) => void;
  /** Push the job's start to a new time-of-day on its first day (smart time-shift). */
  onShiftStartTime?: (jobId: string, dayKey: string, startTime: string) => void;
  /** JS getDay() values disabled in scheduling settings; hidden from the daily-hours rows. */
  nonWorkingWeekdays?: number[];
  /** Auto-Fix preview card is showing in the panel; hide the redundant conflict strip. */
  autoFixPreviewActive?: boolean;
  /** "Cascade following jobs" toggle state. */
  cascade?: boolean;
  onToggleCascade?: (on: boolean) => void;
  /** Smart vs Simple placement. Off = Smart (extend existing days), on = Simple. */
  keepExistingDaysAsIs?: boolean;
  onToggleKeepExistingDays?: (on: boolean) => void;
  /** Followers (excluding the primary) that will shift when cascade is on. */
  followingJobs?: ProposedChange[];
  /** Cascade end-date cutoff (local 'YYYY-MM-DD'); empty = no limit. */
  cascadeUntil?: string;
  onChangeCascadeUntil?: (date: string) => void;
  /** Followers left untouched because they fall after the cutoff. */
  protectedJobs?: ProposedChange[];
  /** Names of moved followers that leapfrogged a protected job. */
  leapfrogJobNames?: string[];
  /** Same-day conflicts created by this edit, with proposed slides/spills. */
  conflictResolutions?: ConflictResolution[];
  /** Stage the conflict resolutions into the preview (the "Move conflicting job" action). */
  onMoveConflicts?: () => void;
  /** Shift-management mode (staged draft job): render the per-shift cards (ShiftList) in
   *  place of the job-level WHEN / DAILY HOURS / CREW sections. */
  manage?: {
    shifts: JobCrewAllocation[];
    allStaff: CrewMember[];
    weekendDays: number[];
    canDelete: boolean;
    onAddShift: () => void;
    onRenameShift: (shiftId: string, name: string) => void;
    onDeleteShift: (shiftId: string) => void;
    onChangeSpan: (shiftId: string, startDate: string, endDate: string) => void;
    onChangeDayWindow: (shiftId: string, dateKey: string, window: { startTime: string; endTime: string }) => void;
    onEditMembers: (shiftId: string) => void;
    /** Slide the chosen shifts by `days` working days (negative = earlier); the ids in
     *  `skipShiftIds` stay where they are. */
    onMoveDays?: (days: number, skipShiftIds: string[]) => void;
    /** Where every shift lands for a signed day count — the move modal's live preview. */
    previewMoveDays?: (days: number, skipShiftIds: string[]) => MoveScheduleRow[];
  };
}

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[11px] font-black uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500">{children}</div>
);

/**
 * The first day's start time drives a smart re-flow (+ cascade) that re-seeds every
 * day's hours. The re-flow runs immediately on each change so the rest of the
 * schedule and any cascade update live. To stop that re-seed (or a clamped value
 * like a half-typed "01:00") from resetting the field mid-type, the input keeps a
 * local draft and ignores external value changes while it's focused — adopting the
 * authoritative value only once focus leaves.
 */
const FirstDayStartInput = ({ value, onShift }: { value: string; onShift: (val: string) => void }) => {
  const [draft, setDraft] = React.useState(value);
  const focused = React.useRef(false);
  React.useEffect(() => { if (!focused.current) setDraft(value); }, [value]);
  return (
    <TimeInput
      value={draft}
      onChange={(v) => { setDraft(v); onShift(v); }}
      onFocus={() => { focused.current = true; }}
      onBlur={(v) => { focused.current = false; onShift(v); }}
    />
  );
};

const fmtRange = (start: string | null, end: string | null) => {
  const f = (iso: string | null) => iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';
  const a = f(start), b = f(end ?? start);
  return a === b ? a : `${a} – ${b}`;
};

export const SingleJobEditor = ({
  change: c, clientName, issues, hoursWarnings = [], suggestions, onAutoFix, stats, crew, onReassignCrew, dayHours, onChangeDailyHour, onChangeJobDate, onShiftStartTime, nonWorkingWeekdays = [], autoFixPreviewActive, cascade, onToggleCascade, keepExistingDaysAsIs, onToggleKeepExistingDays, followingJobs = [], cascadeUntil = '', onChangeCascadeUntil, protectedJobs = [], leapfrogJobNames = [], conflictResolutions = [], onMoveConflicts,
  manage,
}: SingleJobEditorProps) => {
  const { t } = useTranslation();
  // The move-the-whole-job modal, opened from the button above the shift cards.
  const [moveOpen, setMoveOpen] = React.useState(false);
  const isNonWorkingDay = (dateKey: string) => nonWorkingWeekdays.includes(new Date(`${dateKey}T00:00:00`).getDay());
  const spanned = spannedDayKeys(c.newStart, c.newEnd);
  // Daily Hours lists only the WORKING days the job spans. A job that re-flows
  // past a weekend skips the non-working days entirely — work resumes on the next
  // working day — so the editor never shows an empty Sat/Sun row.
  const keys = spanned.filter(k => !isNonWorkingDay(k));
  const jobIssues = issues.filter(i => i.jobId === c.jobId);
  const jobHoursWarnings = hoursWarnings.filter(w => w.jobId === c.jobId);
  // Overlaps are shown once, in the conflict-resolution card below; only the
  // non-overlap problems (due-date, weekend, capacity) remain as advisories.
  const advisories = jobIssues.filter(i => i.kind !== 'double-book');
  const hasProblems = conflictResolutions.length > 0 || advisories.length > 0;

  // Per-member capacity warnings render beside their crew member; everything else
  // (e.g. the job-level "over estimate" budget warning) stays in the advisory list.
  const crewIds = new Set(crew.map(m => m.id));
  const warningsByMember = new Map<string, ScheduleIssue[]>();
  const otherHoursWarnings = jobHoursWarnings.filter(w => {
    if (w.memberId && crewIds.has(w.memberId)) {
      const list = warningsByMember.get(w.memberId) ?? [];
      list.push(w);
      warningsByMember.set(w.memberId, list);
      return false;
    }
    return true;
  });

  // Calendar days the primary's start moved — drives the cascade summary label.
  const dayMs = (iso: string) => { const d = new Date(iso); return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); };
  const startDeltaDays = c.oldStart ? Math.round((dayMs(c.newStart) - dayMs(c.oldStart)) / 86_400_000) : 0;
  const deltaLabel = `${startDeltaDays > 0 ? '+' : ''}${startDeltaDays} day${Math.abs(startDeltaDays) === 1 ? '' : 's'}`;
  const showCascadeSummary = cascade && followingJobs.length > 0 && startDeltaDays !== 0;
  const cutoffLabel = cascadeUntil
    ? new Date(`${cascadeUntil}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : '';

  return (
    <div className="space-y-6">
      {!hasProblems && <ConflictStrip issueCount={0} canAutoFix={false} onAutoFix={() => {}} />}
      {advisories.length > 0 && (
        <div className="space-y-1.5">
          {advisories.map((iss, i) => (
            <div key={i} className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/20 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">{iss.message}</div>
          ))}
        </div>
      )}

      {conflictResolutions.length > 0 && (
        <div className="space-y-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/20 p-3">
          <div className="flex items-center gap-1.5 text-sm font-bold text-amber-800 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {conflictResolutions.length === 1
              ? t('views.JobScheduling.reschedule.SingleJobEditor.conflictingJobSingular')
              : t('views.JobScheduling.reschedule.SingleJobEditor.conflictingJobPlural', { count: conflictResolutions.length })}
          </div>
          <ul className="space-y-1 text-xs text-amber-700 dark:text-amber-300">
            {conflictResolutions.map(r => (
              <li key={r.jobId} className="flex gap-1.5">
                <span aria-hidden="true">•</span><span>{r.label}</span>
              </li>
            ))}
          </ul>
          {onMoveConflicts && conflictResolutions.some(isMovableResolution) && (
            <button
              onClick={onMoveConflicts}
              className="inline-flex items-center gap-1 rounded-full bg-primary-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-primary-700"
            >
              <Wand2 className="w-3.5 h-3.5" /> {t('views.JobScheduling.reschedule.SingleJobEditor.moveConflicting')}
            </button>
          )}
        </div>
      )}

      {/* When */}
      {!manage && onChangeJobDate && (
        <div className="space-y-1.5">
          <SectionLabel>{t('views.JobScheduling.reschedule.SingleJobEditor.when')}</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">{t('views.JobScheduling.reschedule.SingleJobEditor.startDate')}</label>
              <DatePicker value={keys[0]} onChange={v => onChangeJobDate(c.jobId, 'start', v)} isDateDisabled={isNonWorkingDay} />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500 mb-1">{t('views.JobScheduling.reschedule.SingleJobEditor.endDate')}</label>
              <DatePicker value={keys[keys.length - 1]} onChange={v => onChangeJobDate(c.jobId, 'end', v)} align="right" isDateDisabled={isNonWorkingDay} />
            </div>
          </div>
          {onToggleCascade && (
            <div className="mt-3 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-200">
                  {t('views.JobScheduling.reschedule.SingleJobEditor.cascadeFollowingJobs')}
                  <Tooltip content={t('views.JobScheduling.reschedule.SingleJobEditor.cascadeFollowingJobsTooltip')}>
                    <Info className="w-3.5 h-3.5 text-gray-400 cursor-help" aria-label={t('views.JobScheduling.reschedule.SingleJobEditor.aboutCascadeFollowingJobs')} />
                  </Tooltip>
                </span>
                <Toggle ariaLabel={t('views.JobScheduling.reschedule.SingleJobEditor.cascadeFollowingJobs')} checked={!!cascade} onChange={onToggleCascade} />
              </div>

              {cascade && (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 dark:text-gray-500">{t('views.JobScheduling.reschedule.SingleJobEditor.stopCascadeAfter')}</label>
                    {cascadeUntil && (
                      <button
                        type="button"
                        aria-label={t('views.JobScheduling.reschedule.SingleJobEditor.clearCascadeCutoffAriaLabel')}
                        onClick={() => onChangeCascadeUntil?.('')}
                        className="text-[11px] font-semibold text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        {t('views.JobScheduling.reschedule.SingleJobEditor.clear')}
                      </button>
                    )}
                  </div>
                  <DatePicker value={cascadeUntil} onChange={onChangeCascadeUntil ?? (() => {})} />
                  {!cascadeUntil && (
                    <p className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">{t('views.JobScheduling.reschedule.SingleJobEditor.leaveBlankNoLimit')}</p>
                  )}
                </div>
              )}

              {cascade && onToggleKeepExistingDays && (
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-200">
                    {t('views.JobScheduling.reschedule.SingleJobEditor.keepExistingDaysAsIs')}
                    <Tooltip content={t('views.JobScheduling.reschedule.SingleJobEditor.keepExistingDaysAsIsTooltip')}>
                      <Info className="w-3.5 h-3.5 text-gray-400 cursor-help" aria-label={t('views.JobScheduling.reschedule.SingleJobEditor.aboutKeepExistingDaysAsIs')} />
                    </Tooltip>
                  </span>
                  <Toggle ariaLabel={t('views.JobScheduling.reschedule.SingleJobEditor.keepExistingDaysAsIs')} checked={!!keepExistingDaysAsIs} onChange={onToggleKeepExistingDays} />
                </div>
              )}

              {showCascadeSummary && (
                <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  <span className="font-semibold text-gray-700 dark:text-gray-200">
                    {followingJobs.length === 1
                      ? t('views.JobScheduling.reschedule.SingleJobEditor.laterJobWillShiftSingular', { delta: deltaLabel })
                      : t('views.JobScheduling.reschedule.SingleJobEditor.laterJobsWillShiftPlural', { count: followingJobs.length, delta: deltaLabel })}
                  </span>
                  <span className="block mt-0.5 truncate">{followingJobs.map(f => f.jobName).join(', ')}</span>
                </div>
              )}

              {cascade && protectedJobs.length > 0 && cutoffLabel && (
                <p className="mt-2 text-xs font-semibold text-gray-700 dark:text-gray-200">
                  {protectedJobs.length === 1
                    ? t('views.JobScheduling.reschedule.SingleJobEditor.protectedJobSingular', { cutoff: cutoffLabel })
                    : t('views.JobScheduling.reschedule.SingleJobEditor.protectedJobsPlural', { count: protectedJobs.length, cutoff: cutoffLabel })}
                </p>
              )}

              {cascade && leapfrogJobNames.length > 0 && (
                <p className="mt-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1.5 text-xs text-amber-700 dark:text-amber-300">
                  {leapfrogJobNames.length === 1
                    ? t('views.JobScheduling.reschedule.SingleJobEditor.leapfrogWarningSingular', { names: leapfrogJobNames.join(', ') })
                    : t('views.JobScheduling.reschedule.SingleJobEditor.leapfrogWarningPlural', { names: leapfrogJobNames.join(', ') })}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Daily hours (or, in management mode, the full per-shift card list) */}
      {manage ? (
        <div className="space-y-3">
          {manage.onMoveDays && manage.previewMoveDays && (
            <>
              <Button
                variant="secondary"
                // Nothing to move: every shift is worked history, or none has dates yet.
                disabled={!manage.shifts.some(a => !a.pinned && a.startDate)}
                onClick={() => setMoveOpen(true)}
                className="w-full justify-center"
              >
                <CalendarClock className="w-4 h-4" />
                {t('views.JobScheduling.reschedule.SingleJobEditor.moveSchedule')}
              </Button>
              <MoveScheduleModal
                isOpen={moveOpen}
                preview={manage.previewMoveDays}
                onClose={() => setMoveOpen(false)}
                onMove={manage.onMoveDays}
              />
            </>
          )}
          <div className="space-y-1.5">
          <SectionLabel>{t('views.JobScheduling.reschedule.SingleJobEditor.shifts')}</SectionLabel>
          <ShiftList
            allocations={manage.shifts}
            allStaff={manage.allStaff}
            weekendDays={manage.weekendDays}
            canDelete={manage.canDelete}
            onEditMembers={manage.onEditMembers}
            onAddShift={manage.onAddShift}
            onRenameShift={manage.onRenameShift}
            onChangeSpan={manage.onChangeSpan}
            onChangeDayWindow={manage.onChangeDayWindow}
            onDeleteShift={manage.onDeleteShift}
          />
          </div>
        </div>
      ) : onChangeDailyHour && (
        <div className="space-y-1.5">
          <SectionLabel>{t('views.JobScheduling.reschedule.SingleJobEditor.dailyHours')}</SectionLabel>
          <div className="space-y-3">
            {keys.map((dateKey, idx) => {
              const h = dayHours[dateKey] ?? { startTime: '08:00', endTime: '17:00' };
              const label = new Date(`${dateKey}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
              // The FIRST day's start drives the smart time-shift (re-flow + cascade).
              // It re-flows live on every change via its own focus-guarded draft input
              // (see FirstDayStartInput), so the schedule and cascade update immediately
              // without the re-seed resetting the field. Other fields are plain per-day
              // window edits.
              const isFirstDay = idx === 0 && !!onShiftStartTime;
              return (
                <div key={dateKey} className="space-y-1 text-sm">
                  <span className="block font-medium text-gray-500 dark:text-gray-400">{label}</span>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      {isFirstDay
                        ? <FirstDayStartInput value={h.startTime} onShift={(val) => { if (val && val !== c.newStart.slice(11, 16)) onShiftStartTime!(c.jobId, dateKey, val); }} />
                        : <TimeInput value={h.startTime} onChange={v => onChangeDailyHour(c.jobId, dateKey, 'startTime', v)} />}
                    </div>
                    <span className="text-gray-400">–</span>
                    <div className="flex-1 min-w-0"><TimeInput value={h.endTime} onChange={v => onChangeDailyHour(c.jobId, dateKey, 'endTime', v)} /></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Crew (job-level; hidden in management mode where crew is per-shift on the cards) */}
      {!manage && (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <SectionLabel>{t('views.JobScheduling.reschedule.SingleJobEditor.crew')}</SectionLabel>
          {onReassignCrew && (
            <button onClick={() => onReassignCrew(c.jobId)} className="inline-flex items-center gap-1 text-[11px] font-bold text-primary-600 dark:text-primary-400 hover:underline">
              <UserCog className="w-3.5 h-3.5" /> {t('views.JobScheduling.reschedule.SingleJobEditor.editCrew')}
            </button>
          )}
        </div>
        {crew.length > 0 ? (
          <div className="flex flex-col gap-2">
            {crew.map(m => {
              const memberWarnings = warningsByMember.get(m.id) ?? [];
              return (
                <div key={m.id} className="flex items-start gap-2 min-w-0">
                  <CrewAvatar m={m} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">{m.name}</div>
                    {m.role && <div className="text-[11px] text-gray-400 truncate">{m.role}</div>}
                    {memberWarnings.map((w, i) => (
                      <div key={i} className="mt-0.5 flex items-start gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                        <span>{w.shortMessage ?? w.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-gray-400"><Users className="w-4 h-4 shrink-0" /> {t('views.JobScheduling.reschedule.SingleJobEditor.unassigned')}</div>
        )}
      </div>
      )}

      {/* Job-level hours advisories (e.g. over estimate). Per-member capacity
          warnings render beside their crew member above. Advisory only. */}
      {otherHoursWarnings.length > 0 && (
        <div className="space-y-1.5">
          {otherHoursWarnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/20 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{w.message}</span>
            </div>
          ))}
        </div>
      )}

      {/* Compact impact */}
      {stats && (
        <div className="space-y-2">
          <SectionLabel>{t('views.JobScheduling.reschedule.SingleJobEditor.impact')}</SectionLabel>
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 space-y-3">
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 shrink-0 text-gray-400" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{t('views.JobScheduling.reschedule.SingleJobEditor.workOrder')}</span>
              <span className="ml-auto text-sm font-black text-gray-900 dark:text-white">#{stats.workOrderNumber}</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-end justify-between gap-2">
                <div>
                  <div className="font-heading font-black leading-none text-2xl text-gray-900 dark:text-white">{stats.estHours.toFixed(1)}</div>
                  <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">{t('views.JobScheduling.reschedule.SingleJobEditor.totalEstHours')}</div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-black text-primary-600 dark:text-primary-400 tabular-nums">{stats.assignedHours.toFixed(1)}</span>
                  <span className="text-xs font-bold text-gray-400"> {t('views.JobScheduling.reschedule.SingleJobEditor.assigned')}</span>
                  {stats.renderedHours > 0 && (
                    <div className="text-[11px] font-bold text-green-600 dark:text-green-400 tabular-nums">{stats.renderedHours.toFixed(1)} {t('views.JobScheduling.reschedule.SingleJobEditor.logged')}</div>
                  )}
                </div>
              </div>
              <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary-500"
                  style={{ width: `${stats.estHours > 0 ? Math.min(100, Math.round((stats.assignedHours / stats.estHours) * 100)) : 0}%` }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 shrink-0 text-gray-400" />
              <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{t('views.JobScheduling.reschedule.SingleJobEditor.jobSchedule')}</span>
              <span className="ml-auto text-sm font-bold text-gray-900 dark:text-white">{fmtRange(c.newStart, c.newEnd)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
