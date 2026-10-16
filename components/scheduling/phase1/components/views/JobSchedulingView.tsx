
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import {
  ChevronLeft, ChevronRight, User, Calendar, Briefcase,
  MapPin, Plus, Check, MoreVertical, Edit2, CheckCircle2, UserCircle, UserPlus,
  CalendarClock, Eye, EyeOff
} from 'lucide-react';
import { Job, WorkOrder, CrewMember, CrewScheduleEntry, GlobalSettings, Client, JobCrewAllocation } from '../../types';
import { Typography } from '../../theme/designSystem';
import { Button, Badge, Modal, TextInput, Select, Toggle } from '../UI';
import { CrewSelectionModal } from '../modals/CrewSelectionModal';
import { CascadeRescheduleModal } from '../modals/CascadeRescheduleModal';
import { ProposedChange, configFromSettings, shiftJobsFromPoint, toLocalDateKey, spannedDayKeys, workingDayKeys, applyDailyHours, cascadeFromEdit, cascadeForPrimary, cascadeLeapfrogIds, resolveTimeShiftCascade, timeShiftChange, primaryFromDailyEdits, reflowAvoidingConflicts, clampDayWindow, shiftCrewScope, allocDayWindow, recomputeJobEnvelope, allocWorkedDayKeys, advanceWorkingDays } from '../../services/scheduleEngine';
import { detectIssues, ScheduleIssue, sharedCrewScope } from '../../services/rescheduleIssues';
import { resolveShiftCascade, ResidualClash, detectShiftClashes } from '../../services/shiftCascade';
import { resolveSameDayConflicts, mergeResolutionsIntoChanges, isMovableResolution, bakeDailyEdits, ConflictResolution } from '../../services/resolveSameDayConflicts';
import { detectHoursWarnings } from '../../services/hoursWarnings';
import { buildSuggestions, Suggestion } from '../../services/rescheduleSuggestions';
import { computeImpact } from '../../services/rescheduleImpact';
import { CURRENT_USER, canManageSchedule } from '../../constants';
import { ProductionBoard } from './JobScheduling/ProductionBoard';
import { buildMemberLanes, buildJobLanes, visibleWeekDays, jobColor, jobDayWindow, withStagedWindow, BoardLane } from '../../services/productionBoard';
import { MonthBoard } from './JobScheduling/MonthBoard';
import { buildMonthWeeks } from '../../services/monthBoard';
import { computeJobStats, JobStats } from '../../services/jobStats';
import { applyStagedCrew, type StagedCrew } from '../../services/stagedCrew';
import { ReschedulePreviewPanel } from './JobScheduling/ReschedulePreviewPanel';
import { useReschedulePreview } from './JobScheduling/useReschedulePreview';
import { DatePicker } from '../ui/DatePicker';
import { SingleJobMoveDrawer } from '../drawers/SingleJobMoveDrawer';
import { JobDetailsPanel, cancelJobPatch } from './JobScheduling/JobDetailsPanel';
import { ShiftList } from './JobScheduling/ShiftList';
import { upsertAllocation, removeAllocation, setAllocSpan, setAllocDayWindow, newShift, ensureJobAllocations, moveAllocation, moveJobDays } from '../../services/shifts';
import { ConfirmationModal } from '../modals/ConfirmationModal';
import { CrewHoursGrid } from './JobScheduling/CrewHoursGrid';
import { AvailabilityBadge } from './JobScheduling/AvailabilityBadge';
import type { HoursTransfer } from './JobScheduling/jobDnd';
import { BreakEditorModal } from './JobScheduling/BreakEditorModal';
import { resolveBreaks, setMemberDayBreaks, workingDayCapacity } from '../../services/crewBreaks';
import { resolveDayAvailability, formatAvailWindow } from '../../services/crewAvailability';
import { DayCrewHeader } from './JobScheduling/DayCrewHeader';
import { JobsPanel } from './JobScheduling/JobsPanel';
import { DayBoard } from './JobScheduling/DayBoard';
import { setJobDayWindow, withDayWindows } from '../../services/dayBoard';
import { splitPinnedPast } from '../../services/shifts';
import { AssignHoursModal, type AssignHoursNoDaysReason } from './JobScheduling/AssignHoursModal';
import { ShiftPickerModal } from './JobScheduling/ShiftPickerModal';
import { UnscheduledJobsPanel, selectUnscheduledJobs, type UnscheduledJobCard } from './JobScheduling/UnscheduledJobsPanel';
import {
  buildCrewHoursGrid, buildJobSummaries, periodDayKeys, assignableDayKeys, noEligibleDaysReason, setMemberDayHours, setMemberDayWindow, setMemberDayHoursPreservingSpan, transferMemberDayHours, memberJobDayHours, assignedHoursForJobInWeek, isMemberOnJob,
} from '../../services/crewHoursGrid';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { detectAssignHoursWarnings, jobHoursProgress } from '../../services/assignHoursWarnings';

interface JobSchedulingViewProps {
  jobs: Job[];
  clients: Client[];
  workOrders: WorkOrder[];
  allStaff: CrewMember[];
  onUpdateJob: (job: Job) => void;
  onEditEmployee: (emp: CrewMember) => void;
  onViewJob?: (id: string) => void;
  onViewWorkOrder?: (id: string) => void;
  onApplySchedule: (changes: ProposedChange[], label: string, extraUndo?: () => void) => void;
  /** Non-blocking user message (e.g. a cascade-off shift clash warning). */
  onToast?: (message: string) => void;
  settings: GlobalSettings;
  onUpdateSettings: (s: GlobalSettings) => void;
  /** Port: who may change the schedule (the app's permission rules). Defaults to the phase-1 rule. */
  canReschedule?: boolean;
  /** Port: extra buttons shown beside Bulk Reschedule (the app's "Unsent changes"). */
  headerActions?: React.ReactNode;
  /** Port: extra actions in the job side panel (the app's "Send Emails", Oct 14 call). */
  renderJobActions?: (jobId: string) => React.ReactNode;
}

// Helper to calculate week start date (Sunday) based on a reference date
const getWeekStartDate = (date: Date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day; // Adjust to Sunday
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
};

// Helper to generate the 7 days of the week
const getWeekDays = (startDate: Date) => {
    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(startDate);
        d.setDate(startDate.getDate() + i);
        days.push(d);
    }
    return days;
};

// Helper to format 24h time to 12h AM/PM
// Modal for editing daily availability
const EditAvailabilityModal = ({ 
    isOpen, 
    onClose, 
    employee, 
    date, 
    onSave 
}: { 
    isOpen: boolean; 
    onClose: () => void; 
    employee: CrewMember | null; 
    date: Date; 
    onSave: (schedule: CrewScheduleEntry) => void;
}) => {
    const dateStr = date.toISOString().split('T')[0];
    const existingSchedule = employee?.schedule?.[dateStr];
    
    const [isOff, setIsOff] = useState(existingSchedule?.isOff || false);
    const [reason, setReason] = useState(existingSchedule?.reason || '');
    const [startTime, setStartTime] = useState(existingSchedule?.startTime || '08:00');
    const [endTime, setEndTime] = useState(existingSchedule?.endTime || '17:00');

    useEffect(() => {
        if (isOpen && employee) {
            const sched = employee.schedule?.[dateStr];
            setIsOff(sched?.isOff || false);
            setReason(sched?.reason || '');
            setStartTime(sched?.startTime || '08:00');
            setEndTime(sched?.endTime || '17:00');
        }
    }, [isOpen, employee, dateStr]);

    const handleSave = () => {
        onSave({
            date: dateStr,
            isOff,
            reason: isOff ? reason : undefined,
            startTime: !isOff ? startTime : '',
            endTime: !isOff ? endTime : ''
        });
        onClose();
    };

    const { t } = useTranslation();

    if (!isOpen || !employee) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('views.JobSchedulingView.editAvailabilityTitle', { name: employee.name })}>
            <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700">
                    <div>
                        <div className="font-bold text-gray-900 dark:text-white">{t('views.JobSchedulingView.dayOff')}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">{date.toDateString()}</div>
                    </div>
                    <Toggle checked={isOff} onChange={setIsOff} label="" />
                </div>

                {isOff ? (
                    <div>
                        <TextInput
                            label={t('views.JobSchedulingView.reason')}
                            placeholder={t('views.JobSchedulingView.reasonPlaceholder')}
                            value={reason}
                            onChange={setReason}
                        />
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">{t('views.JobSchedulingView.startTime')}</label>
                            <input
                                type="time"
                                className="w-full px-4 py-3 bg-white dark:bg-gray-900 border border-gray-400 dark:border-gray-500 rounded-xl outline-none focus:ring-2 focus:ring-primary-400/20 text-gray-900 dark:text-white font-medium"
                                value={startTime}
                                onChange={(e) => setStartTime(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2 block">{t('views.JobSchedulingView.endTime')}</label>
                            <input
                                type="time"
                                className="w-full px-4 py-3 bg-white dark:bg-gray-900 border border-gray-400 dark:border-gray-500 rounded-xl outline-none focus:ring-2 focus:ring-primary-400/20 text-gray-900 dark:text-white font-medium"
                                value={endTime}
                                onChange={(e) => setEndTime(e.target.value)}
                            />
                        </div>
                    </div>
                )}

                <div className="flex gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
                    <Button variant="secondary" onClick={onClose} className="flex-1">{t('views.JobSchedulingView.cancel')}</Button>
                    <Button onClick={handleSave} className="flex-1 shadow-lg shadow-primary-500/20">{t('views.JobSchedulingView.saveSchedule')}</Button>
                </div>
            </div>
        </Modal>
    );
};


export const JobSchedulingView = ({
    jobs,
    clients,
    workOrders,
    allStaff,
    onUpdateJob,
    onEditEmployee,
    onViewJob,
    onViewWorkOrder,
    onApplySchedule,
    onToast,
    settings,
    onUpdateSettings,
    ...props
}: JobSchedulingViewProps) => {
  const { t } = useTranslation();
  const [view, setView] = useState<'member' | 'job'>('job');
  const [scale, setScale] = useState<'week' | 'month' | 'day'>('week');
  // Jobs sidebar lens — independent of the grid scale; persisted per user.
  const [sidebarPeriod, setSidebarPeriod] = useLocalStorage<'week' | 'month' | 'year'>('jobScheduling.sidebar.period', 'week');
  const [sidebarCompact, setSidebarCompact] = useLocalStorage<boolean>('jobScheduling.sidebar.compact', false);
  // Crew Member view sub-mode: the per-member card board vs. the weekly hours grid.
  const [boardMode, setBoardMode] = useState<'board' | 'hours'>('board');
  // Crew view: whether per-member availability overlays (off days, work hours,
  // breaks) are shown on the board. Job schedule is always shown.
  const [showAvailability, setShowAvailability] = useState(true);
  // Member whose weekly hours are being assigned via the modal (null = closed).
  const [assignMemberId, setAssignMemberId] = useState<string | null>(null);
  // Set when a job card is dropped on a member, so the Assign Hours modal opens with that job locked.
  const [assignJobId, setAssignJobId] = useState<string | null>(null);
  // Job whose shifts the drop-assign picker is choosing among (null = closed); set when a
  // job with 2+ shifts is dropped on a member. The chosen shift lands in `assignShiftId`.
  const [pickerJobId, setPickerJobId] = useState<string | null>(null);
  // Shift the drop-assign hours will target (undefined = job's only/primary shift).
  const [assignShiftId, setAssignShiftId] = useState<string | undefined>(undefined);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  // Member-day whose breaks are being edited via the modal (null = closed).
  const [breakEdit, setBreakEdit] = useState<{ memberId: string; dateKey: string } | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());

  const preview = useReschedulePreview();
  const workConfig = useMemo(() => configFromSettings(settings?.scheduling, false), [settings?.scheduling]);
  const canReschedule = props.canReschedule ?? canManageSchedule(CURRENT_USER.role);
  const referenceDate = new Date().toISOString();
  const [moveJob, setMoveJob] = useState<Job | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  // Job dragged on the board; shown at its new day as a faded placeholder until applied.
  const [pendingMoveId, setPendingMoveId] = useState<string | null>(null);
  // Auto-Fix destinations being previewed on the board (jobId -> new dates), so the
  // user can see where jobs will land before confirming the fix. Cleared on cancel/close.
  const [autoFixDest, setAutoFixDest] = useState<Record<string, { newStart: string; newEnd: string }> | null>(null);
  // Per-day start/end hours being edited in the reschedule preview (jobId -> dateKey -> times).
  type DayHours = { startTime: string; endTime: string };
  const [dailyHoursEdits, setDailyHoursEdits] = useState<Record<string, Record<string, DayHours>>>({});
  // "Cascade following jobs" toggle for the single-job editor. Opt-in per edit.
  const [cascade, setCascade] = useState(false);
  // Optional cutoff for the cascade. Empty = no limit. Followers scheduled after this date stay put.
  const [cascadeUntil, setCascadeUntil] = useState<string>('');
  // Placement mode for conflict-aware reflow: false = Smart (extend existing days),
  // true = Simple (new days only). Persists across editor opens (unlike `cascade`).
  const [keepExistingDaysAsIs, setKeepExistingDaysAsIs] = useState(false);
  // Shift-cascade clashes the resolver could not re-place in bounds (non-blocking warnings).
  const [residualClashes, setResidualClashes] = useState<ResidualClash[]>([]);
  // Which shift the reschedule drawer is editing (shift mode). Seeded when a shift move
  // is staged; reset when the preview clears.
  // In management mode, the shift most recently moved/edited — the cascade anchor when
  // the "Cascade following jobs" toggle is flipped on later.
  const [draftMovedShiftId, setDraftMovedShiftId] = useState<string | null>(null);
  // Pending crew reassignment per job, committed on Apply (parallels dailyHoursEdits).
  const [stagedCrewByJob, setStagedCrewByJob] = useState<Record<string, StagedCrew>>({});
  const hhmm = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const [jobToCancel, setJobToCancel] = useState<Job | null>(null);

  const handleMarkRainDay = (dateKey: string) => {
    if (!canReschedule) return;
    const cfgWithRain = configFromSettings(settings.scheduling, true);
    // Treat the marked day as non-working so jobs land on a real workday.
    const cfg = { ...cfgWithRain, holidays: [...cfgWithRain.holidays, dateKey] };
    const changes = shiftJobsFromPoint(jobs, `${dateKey}T00:00`, 1, 'days', cfg);
    const affected = changes.filter(c => !c.skipped).length;

    const existing = settings.scheduling?.rainDays || [];
    const alreadyMarked = existing.some(r => r.date === dateKey);
    // Snapshot the pre-mark settings explicitly so the undo restores exactly
    // this state regardless of any later settings changes.
    const preMarkSettings = settings;
    const persist = () => {
      if (alreadyMarked) return;
      onUpdateSettings({
        ...settings,
        scheduling: {
          nonWorkingWeekdays: settings.scheduling?.nonWorkingWeekdays ?? [0, 6],
          holidays: settings.scheduling?.holidays ?? [],
          workDayStartHour: settings.scheduling?.workDayStartHour ?? 8,
          workDayEndHour: settings.scheduling?.workDayEndHour ?? 17,
          rainDays: [...existing, { date: dateKey, type: 'rain' as const }],
        },
      });
    };
    const undoPersist = () => onUpdateSettings(preMarkSettings);

    const label = `Rain Day: ${affected} job${affected === 1 ? '' : 's'} shifted forward one workday`;
    preview.stage({
      changes,
      label,
      mode: 'bulk',
      // Recompute the undo-toast label from the actually-committed changes — they
      // may differ from the staged preview if Auto-Fix moved some jobs further.
      commit: (eff) => {
        persist();
        const n = eff.filter(c => !c.skipped).length;
        const committedLabel = `Rain Day: ${n} job${n === 1 ? '' : 's'} rescheduled`;
        onApplySchedule(eff, committedLabel, undoPersist);
      },
    });
  };

  // Modal States
  const [isBulkOpen, setIsBulkOpen] = useState(false);
  const [isAvailabilityModalOpen, setIsAvailabilityModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<CrewMember | null>(null);
  const [editingDate, setEditingDate] = useState<Date>(new Date());
  
  const [isCrewModalOpen, setIsCrewModalOpen] = useState(false);
  const [jobToAssign, setJobToAssign] = useState<Job | null>(null);
  // The shift whose members are being edited (drawer card → Edit members), and a counter
  // for stable new-shift ids (avoids Date.now() so behavior stays deterministic).
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  // Whether the shift modal was opened via "Add shift" (vs "Edit members") — drives its title.
  const [addingShift, setAddingShift] = useState(false);
  const [shiftSeq, setShiftSeq] = useState(0);

  // Derived Data
  const weekStart = useMemo(() => getWeekStartDate(currentDate), [currentDate]);
  // Working days only — drives the hours grid, assignable days, and capacity math.
  const weekDays = useMemo(() => visibleWeekDays(getWeekDays(weekStart), workConfig), [weekStart, workConfig]);
  // The BOARD shows the full week: non-working days render as muted, inert columns so
  // the calendar reads as a real week instead of silently skipping Sat/Sun.
  const boardWeekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const monthWeeks = useMemo(() => buildMonthWeeks(currentDate, workConfig), [currentDate, workConfig]);
  const selectedDayKey = useMemo(() => toLocalDateKey(currentDate), [currentDate]);

  // Day keys currently on screen, so actions can detect when a job lands off-view.
  const visibleDayKeys = useMemo(() => (
    scale === 'month'
      ? new Set(monthWeeks.flatMap(w => w.days.map(d => d.key)))
      : new Set(boardWeekDays.map(d => toLocalDateKey(d)))
  ), [scale, monthWeeks, boardWeekDays]);

  // Actions
  const handlePrevWeek = () => {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - 7);
      setCurrentDate(d);
  };

  const handleNextWeek = () => {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + 7);
      setCurrentDate(d);
  };

  const handlePrevMonth = () => {
      const d = new Date(currentDate);
      d.setMonth(d.getMonth() - 1);
      setCurrentDate(d);
  };

  const handleNextMonth = () => {
      const d = new Date(currentDate);
      d.setMonth(d.getMonth() + 1);
      setCurrentDate(d);
  };

  const handlePrevDay = () => {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - 1);
      setCurrentDate(d);
  };

  const handleNextDay = () => {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + 1);
      setCurrentDate(d);
  };

  // The hours grid supports Week and Day, but not Month; snap back to week from month.
  useEffect(() => {
    if (view === 'member' && boardMode === 'hours' && scale === 'month') setScale('week');
  }, [view, boardMode, scale]);

  const openAvailabilityModal = (employee: CrewMember, date: Date) => {
      setEditingEmployee(employee);
      setEditingDate(date);
      setIsAvailabilityModalOpen(true);
  };

  const handleSaveAvailability = (scheduleEntry: CrewScheduleEntry) => {
      if (editingEmployee) {
          const updatedEmployee = {
              ...editingEmployee,
              schedule: {
                  ...editingEmployee.schedule,
                  [scheduleEntry.date]: scheduleEntry
              }
          };
          onEditEmployee(updatedEmployee);
      }
  };

  const handleDropJob = (jobId: string, dayKey: string, shiftId?: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job || job.is_locked) return;
    // The board shows non-working days but they take no work; the cells are inert as
    // drop targets too, so this is a backstop for any other path in.
    if (workConfig.weekendDays.includes(new Date(`${dayKey}T12:00:00`).getDay())) {
      onToast?.(t('views.JobSchedulingView.nonWorkingDayDrop'));
      return;
    }

    if (shiftId) {
      const alloc = job.allocations?.find(a => a.id === shiftId);
      if (!alloc?.startDate) return;
      // Open the shift-management drawer (stacked cards) with the dragged shift already
      // moved to the drop day in the draft. Cascade is off on drop; toggling it on later
      // resolves clashes anchored on this shift (draftMovedShiftId).
      const draft = moveAllocation(ensureJobAllocations(job), shiftId, dayKey);
      setCascade(false);
      setDraftMovedShiftId(shiftId);
      preview.stage({
        changes: [], label: `Move ${alloc.name}`, mode: 'edit', primaryJobId: jobId, draftJob: draft,
        commit: (eff) => onApplySchedule(eff, `Move ${alloc.name}`),
      });
      setPendingMoveId(jobId);
      return;
    }

    // No shift id: an unscheduled card (or a shiftless job) dropped on a day. Build the
    // dated job at the drop day, materialize its Crew shift, and open the cards drawer —
    // the job is born with a shift; Apply commits the draft, Cancel discards it.
    const startISO = `${dayKey}T${String(workConfig.workDayStartHour).padStart(2, '0')}:00:00`;
    const durMs = job.startDate && job.endDate
      ? new Date(job.endDate).getTime() - new Date(job.startDate).getTime()
      : (workConfig.workDayEndHour - workConfig.workDayStartHour) * 3_600_000;
    const endISO = new Date(new Date(startISO).getTime() + durMs).toISOString();
    const draft = ensureJobAllocations({ ...job, startDate: startISO, endDate: endISO });
    const label = job.startDate ? `Move ${job.name}` : `Schedule ${job.name}`;
    setCascade(false);
    setDraftMovedShiftId(draft.allocations?.[0]?.id ?? null);
    preview.stage({
      changes: [], label, mode: 'edit', primaryJobId: jobId, draftJob: draft,
      commit: (eff) => onApplySchedule(eff, label),
    });
    setPendingMoveId(jobId);
  };

  const handleConfirmCancel = () => {
    if (!jobToCancel) return;
    onUpdateJob(cancelJobPatch(jobToCancel));
    setJobToCancel(null);
    setSelectedJob(null);
  };

  // A working day's capacity. An explicit setting is taken as-is — whoever typed 8 meant
  // 8 of work. The fallback derives the day from the work window, and unpaid breaks come
  // out of it: 8am–5pm with an unpaid half-hour lunch holds 8.5h, not 9. Without this the
  // grid's "hours left" quietly counted lunch as billable time.
  const capacityHours = settings.scheduling?.crewDailyCapacityHours
    ?? workingDayCapacity(
      workConfig.workDayEndHour - workConfig.workDayStartHour,
      settings.scheduling?.defaultBreaks ?? [],
    );

  // Company default working window (members without a per-day schedule entry fall back
  // to this); used to render availability overlays on the crew board.
  const hourToHHmm = (h: number) => `${String(h).padStart(2, '0')}:00`;
  const availWindow = useMemo(
    () => ({ startTime: hourToHHmm(workConfig.workDayStartHour), endTime: hourToHHmm(workConfig.workDayEndHour) }),
    [workConfig.workDayStartHour, workConfig.workDayEndHour],
  );

  // Reset the pending placeholder whenever the staged preview clears (apply/cancel).
  useEffect(() => { if (!preview.staged) { setPendingMoveId(null); setAutoFixDest(null); setResidualClashes([]); setDraftMovedShiftId(null); } }, [preview.staged]);

  // Seed per-day hour edits from the staged changes (existing job.dailyHours, else
  // the change's start/end time-of-day, else workday defaults). Keyed by new days.
  useEffect(() => {
    const s = preview.staged;
    if (!s) { setDailyHoursEdits({}); setStagedCrewByJob({}); return; }
    const next: Record<string, Record<string, DayHours>> = {};
    for (const c of s.changes) {
      if (c.skipped) continue;
      const job = jobs.find(j => j.id === c.jobId);
      // Seed only the WORKING days the job spans — a job that re-flows past a weekend
      // skips the non-working days, so we never persist empty Sat/Sun windows.
      const keys = workingDayKeys(c.newStart, c.newEnd, workConfig.weekendDays);
      const defStart = hhmm(c.newStart);
      const defEnd = c.newEnd ? hhmm(c.newEnd) : `${String(workConfig.workDayEndHour).padStart(2, '0')}:00`;
      next[c.jobId] = Object.fromEntries(keys.map(k => [
        k,
        c.dailyHours?.[k] ?? job?.dailyHours?.[k] ?? { startTime: defStart, endTime: defEnd },
      ]));
    }
    setDailyHoursEdits(next);
  }, [preview.staged, jobs, workConfig]);

  // Crew scope for cascades: the primary job's assigned members. An empty list
  // (crewless job) yields no followers. For a staged single-shift move, the scope
  // narrows to just that shift's members so only jobs sharing them cascade.
  const scopeForJob = useCallback((jobId: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return { crewMemberIds: [] };
    const staged = preview.staged?.changes.find(c => c.jobId === jobId && !c.skipped);
    if (staged?.shiftId) return { crewMemberIds: shiftCrewScope(job, staged.shiftId) };
    return sharedCrewScope(job);
  }, [jobs, preview.staged]);

  const handleChangeJobDate = (jobId: string, field: 'start' | 'end', value: string) => {
    if (!value) return;
    const s = preview.staged;
    if (!s) return;
    const primaryId = s.primaryJobId ?? jobId;
    const prev = s.changes.find(c => c.jobId === primaryId && !c.skipped);
    if (!prev) return;
    const keys = spannedDayKeys(prev.newStart, prev.newEnd);
    let startDate = keys[0];
    let endDate = keys[keys.length - 1];
    if (field === 'start') startDate = value; else endDate = value;
    if (endDate < startDate) endDate = startDate; // keep end on/after start
    const primaryChange: ProposedChange = {
      ...prev,
      newStart: `${startDate}T${hhmm(prev.newStart)}:00`,
      newEnd: `${endDate}T${hhmm(prev.newEnd || prev.newStart)}:00`,
    };
    preview.setChanges(cascade ? cascadeFromEdit(jobs, primaryChange, workConfig, cascadeUntil, scopeForJob(primaryChange.jobId)) : [primaryChange]);
  };

  // Re-derive the primary change from the user's current daily-hours edits. The
  // first-day start edit lives in dailyHoursEdits (not the staged change), so this
  // rebuilds a time-shift when it differs from its seeded baseline. See
  // primaryFromDailyEdits for why the baseline — not the change's start time — is
  // the right reference.
  const primaryFromEdits = (staged: ProposedChange): ProposedChange => {
    const job = jobs.find(j => j.id === staged.jobId);
    if (!job) return staged;
    return primaryFromDailyEdits(job, staged, dailyHoursEdits[staged.jobId], workConfig);
  };

  // Conflict-aware reflow for the edited job, using the current daily-hours edits as
  // the pinned windows. Returns the primary change + any displaced shared-crew jobs.
  const runReflow = (job: Job, pinned: Record<string, DayHours>, until: string) =>
    reflowAvoidingConflicts(job, pinned, jobs, (j) => scopeForJob(j.id), workConfig, { keepExistingDaysAsIs, untilDate: until || undefined });

  // Re-stage the primary (and any followers) for the current edits. A moved start
  // DAY uses the day-shift cascade (cascadeForPrimary); an in-place hours/time edit
  // uses the conflict-aware reflow (re-place leftover + bump blockers).

  // --- Manage shifts in the drawer (staged draft job) ---
  const draftJob = preview.staged?.draftJob;

  // The preview must describe exactly what the commit will do, so it asks the same
  // splitPinnedPast the commit does rather than re-deriving the boundary. Annotating here —
  // the single point the staged payload is read — beats touching all nine stage() calls, and
  // pinnedDays is descriptive only: the commit recomputes the split regardless.
  const stagedWithPinnedDays = useMemo(() => {
    const s = preview.staged;
    if (!s) return s;
    const todayKey = toLocalDateKey(new Date());
    const changes = s.changes.map(ch => {
      const job = jobs.find(j => j.id === ch.jobId);
      if (!job?.allocations?.length) return ch;
      const target = ch.shiftId ? job.allocations.filter(a => a.id === ch.shiftId) : job.allocations;
      const pinnedDays = target
        .filter(a => !a.pinned)
        .flatMap(a => {
          const { pinned } = splitPinnedPast(a, todayKey, workConfig.weekendDays);
          return pinned ? allocWorkedDayKeys(pinned, workConfig.weekendDays) : [];
        });
      return pinnedDays.length ? { ...ch, pinnedDays } : ch;
    });
    return { ...s, changes };
  }, [preview.staged, jobs, workConfig.weekendDays]);
  const findAlloc = (job: Job, id: string) => job.allocations?.find(a => a.id === id);

  // Structural edit: update the draft, no cascade.
  const draftEdit = (fn: (job: Job) => Job) => {
    const d = preview.staged?.draftJob; if (!d) return;
    preview.setDraft(recomputeJobEnvelope(fn(d)));
  };

  const draftAddShift = () => {
    const d = preview.staged?.draftJob; if (!d) return;
    const id = `shift-${shiftSeq}`; setShiftSeq(n => n + 1);
    preview.setDraft(recomputeJobEnvelope(upsertAllocation(d, newShift(id, d))));
    setAddingShift(true);
    setEditingShiftId(id); // choose members immediately
  };

  // Recompute cascade followers for the current draft, anchored on the given shift.
  // `on` is explicit (not the `cascade` state) so it's safe to call in the same tick as
  // setCascade(true) from the toggle. Followers land on OTHER jobs; the primary is the draft.
  const recomputeDraftCascade = (d: Job, shiftId: string | null, until: string, on: boolean) => {
    const alloc = shiftId ? findAlloc(d, shiftId) : undefined;
    const world = jobs.map(j => (j.id === d.id ? d : j));
    if (on && alloc?.startDate && alloc.endDate) {
      const dayKeys = workingDayKeys(`${alloc.startDate}T12:00:00`, `${alloc.endDate}T12:00:00`, workConfig.weekendDays);
      const dh = Object.fromEntries(dayKeys.map(k => [k, allocDayWindow(alloc, k)]));
      const keys = Object.keys(dh).sort();
      const anchor: ProposedChange = {
        jobId: d.id, jobName: d.name, jobNumber: d.jobNumber, shiftId: shiftId!,
        oldStart: null, oldEnd: null,
        newStart: `${keys[0]}T${dh[keys[0]].startTime}:00`,
        newEnd: `${keys[keys.length - 1]}T${dh[keys[keys.length - 1]].endTime}:00`,
        dailyHours: dh,
      };
      const { changes, residual } = resolveShiftCascade(world, anchor, workConfig, { keepExistingDaysAsIs, untilDate: until || undefined });
      preview.setChanges(changes);
      setResidualClashes(residual);
    } else {
      preview.setChanges([]);
      setResidualClashes([]);
      const clashes = detectShiftClashes(world, workConfig);
      if (clashes.length) onToast?.(`Heads up: ${clashes[0].message} on ${clashes[0].dateKey}`);
    }
  };

  // Schedule edit: update the draft, remember the anchor shift, and recompute cascade.
  const draftScheduleEdit = (fn: (job: Job) => Job, shiftId: string) => {
    const d = preview.staged?.draftJob; if (!d) return;
    const next = recomputeJobEnvelope(fn(d));
    preview.setDraft(next);
    setDraftMovedShiftId(shiftId);
    recomputeDraftCascade(next, shiftId, cascadeUntil, cascade);
  };

  // The draft with every movable shift slid by `days` working days. Pure — the caller
  // decides whether to stage it or only show it.
  const movedDraft = (days: number, skipShiftIds: string[] = []): Job => draftJob
    ? moveJobDays(draftJob, days, (startKey, n) =>
        toLocalDateKey(advanceWorkingDays(new Date(`${startKey}T12:00:00`), n, workConfig)), skipShiftIds)
    : (draftJob as unknown as Job);

  const manageBundle = draftJob ? {
    shifts: draftJob.allocations ?? [],
    allStaff,
    weekendDays: workConfig.weekendDays,
    canDelete: (draftJob.allocations?.length ?? 0) > 1,
    onAddShift: draftAddShift,
    onRenameShift: (id: string, name: string) => { const a = findAlloc(draftJob, id); if (a) draftEdit(j => upsertAllocation(j, { ...a, name })); },
    onDeleteShift: (id: string) => draftEdit(j => removeAllocation(j, id)),
    onChangeSpan: (id: string, s: string, e: string) => draftScheduleEdit(j => setAllocSpan(j, id, s, e), id),
    onChangeDayWindow: (id: string, dateKey: string, w: DayHours) => draftScheduleEdit(j => setAllocDayWindow(j, id, dateKey, w), id),
    onEditMembers: (id: string) => { setAddingShift(false); setEditingShiftId(id); },
    // Slide the whole job. Working days come from the same scheduling settings the rest of
    // the board counts by, and the first moved shift is what the cascade recomputes from.
    onMoveDays: (days: number, skipShiftIds: string[]) => {
      const moved = movedDraft(days, skipShiftIds);
      if (moved === draftJob) return;
      const firstMoved = (moved.allocations ?? []).find(a => !a.pinned && a.startDate && !skipShiftIds.includes(a.id));
      draftScheduleEdit(() => moved, firstMoved?.id ?? '');
    },
    // Same computation, staged nowhere: the modal shows where each shift would land.
    previewMoveDays: (days: number, skipShiftIds: string[]) => {
      const moved = movedDraft(days, skipShiftIds);
      return (draftJob.allocations ?? []).map(a => {
        const after = (moved.allocations ?? []).find(b => b.id === a.id) ?? a;
        return {
          id: a.id,
          name: a.name,
          pinned: a.pinned,
          from: { startDate: a.startDate ?? '', endDate: a.endDate ?? a.startDate ?? '' },
          to: { startDate: after.startDate ?? '', endDate: after.endDate ?? after.startDate ?? '' },
        };
      }).filter(r => r.from.startDate);
    },
  } : undefined;

  const restageForPrimary = (staged: ProposedChange, until: string) => {
    const startDayMoved = !!staged.oldStart
      && toLocalDateKey(new Date(staged.newStart)) !== toLocalDateKey(new Date(staged.oldStart));
    if (startDayMoved) {
      const primary = primaryFromEdits(staged);
      preview.setChanges(cascadeForPrimary(jobs, primary, workConfig, scopeForJob(primary.jobId), until));
      return;
    }
    const job = jobs.find(j => j.id === staged.jobId);
    const pinned = dailyHoursEdits[staged.jobId];
    if (!job || !pinned) { preview.setChanges([primaryFromEdits(staged)]); return; }
    const out = runReflow(job, pinned, until);
    preview.setChanges([out.primary, ...out.displaced]);
  };

  const handleToggleCascade = (on: boolean) => {
    setCascade(on);
    if (!on) setCascadeUntil('');
    const s = preview.staged;
    if (!s) return;
    // Management mode: recompute followers for the draft, anchored on the moved shift.
    if (s.draftJob) { recomputeDraftCascade(s.draftJob, draftMovedShiftId, on ? cascadeUntil : '', on); return; }
    const staged = s.changes.find(c => c.jobId === s.primaryJobId && !c.skipped) ?? s.changes.find(c => !c.skipped);
    if (!staged) return;
    if (!on) { preview.setChanges([staged.shiftId ? staged : primaryFromEdits(staged)]); setResidualClashes([]); return; }
    restageForPrimary(staged, cascadeUntil);
  };

  const handleChangeCascadeUntil = (date: string) => {
    setCascadeUntil(date);
    const s = preview.staged;
    if (!s || !cascade) return;
    if (s.draftJob) { recomputeDraftCascade(s.draftJob, draftMovedShiftId, date, true); return; }
    const staged = s.changes.find(c => c.jobId === s.primaryJobId && !c.skipped) ?? s.changes.find(c => !c.skipped);
    if (!staged) return;
    restageForPrimary(staged, date);
  };

  const handleChangeDailyHour = (jobId: string, dateKey: string, field: 'startTime' | 'endTime', value: string) => {
    const prevWin = dailyHoursEdits[jobId]?.[dateKey] ?? availWindow;
    // Keep the window valid: editing one field past the other slides the counterpart
    // (preserving duration) instead of leaving an inverted start > end window.
    const win = clampDayWindow({ ...prevWin, [field]: value }, prevWin, field, workConfig);
    const pinned: Record<string, DayHours> = { ...dailyHoursEdits[jobId], [dateKey]: win };
    setDailyHoursEdits(prev => ({ ...prev, [jobId]: pinned }));
    if (!cascade) return; // literal: hours apply as typed on Apply
    const job = jobs.find(j => j.id === jobId);
    const s = preview.staged;
    if (!job || !(s && s.primaryJobId === jobId)) return;
    const out = runReflow(job, pinned, cascadeUntil);
    preview.setChanges([out.primary, ...out.displaced]);
  };

  // Optimistically place the dragged job at its staged day (faded placeholder) so the
  // board reflects the move before the user applies it. Only the dragged job is moved.
  const displayJobs = useMemo<Job[]>(() => {
    const s = preview.staged;
    if (!s) return jobs;
    // In edit mode, reflect the primary + any cascade followers as placeholders.
    const stagedById = s.mode === 'edit'
      ? new Map(s.changes.filter(c => !c.skipped).map(c => [c.jobId, c]))
      : null;
    return jobs.map(j => {
      // Management mode: render the primary job as its live draft (envelope already
      // recomputed by the shift services as cards are edited).
      if (s.draftJob && j.id === s.draftJob.id) return s.draftJob;
      // Auto-Fix preview: place the job at its proposed destination.
      const dest = autoFixDest?.[j.id];
      if (dest) return { ...j, startDate: dest.newStart, endDate: dest.newEnd };
      // Dragged job: place it at its staged day, carrying per-day windows so each
      // day cell shows its own hours (not the job's overall start/end clock).
      if (j.id === pendingMoveId) {
        const ch = s.changes.find(c => c.jobId === pendingMoveId && !c.skipped);
        if (ch) return withStagedWindow(j, ch, dailyHoursEdits[j.id]);
      }
      // Single-edit (incl. cascade): reflect each staged change on the board,
      // including the re-flowed/edited per-day windows.
      const staged = stagedById?.get(j.id);
      if (staged) return withStagedWindow(j, staged, dailyHoursEdits[j.id]);
      return j;
    });
  }, [jobs, preview.staged, pendingMoveId, autoFixDest, dailyHoursEdits]);

  const pendingIds = useMemo(() => {
    const ids = new Set<string>();
    if (pendingMoveId) ids.add(pendingMoveId);
    if (autoFixDest) Object.keys(autoFixDest).forEach(id => ids.add(id));
    return ids.size > 0 ? ids : undefined;
  }, [pendingMoveId, autoFixDest]);

  // Board rows for the active view (crew / member / job).
  const boardLanes = useMemo<BoardLane[]>(() => {
    if (view === 'member') return buildMemberLanes(displayJobs, allStaff, boardWeekDays, workConfig);
    return buildJobLanes(displayJobs, boardWeekDays, workConfig);
  }, [view, displayJobs, allStaff, boardWeekDays, workConfig]);

  // Lanes for the single selected day (Day scale). Reuses the week builders with a
  // one-element day list so a job appears only if it occupies the selected date.
  const dayLanes = useMemo<BoardLane[]>(() => {
    const days = [currentDate];
    const lanes = view === 'member'
      ? buildMemberLanes(displayJobs, allStaff, days, workConfig)
      : buildJobLanes(displayJobs, days, workConfig);
    // Resolve each card's clock to the selected day's per-day window so a multi-day
    // job shows that day's hours, not its overall start→end span.
    return withDayWindows(lanes, displayJobs);
  }, [view, displayJobs, allStaff, currentDate, workConfig]);

  const activeStaff = useMemo(() => allStaff.filter(s => s.status !== 'Inactive'), [allStaff]);

  // Jobs not yet placed on the calendar, shown as draggable cards below the
  // board in Job view. Dropping one on a day routes through handleDropJob.
  const unscheduledCards = useMemo<UnscheduledJobCard[]>(() =>
    selectUnscheduledJobs(jobs).map(job => ({
      job,
      clientName: clients.find(c => c.id === job.clientId)?.name,
      color: jobColor(job.id),
      estHours: computeJobStats(job, workOrders).estHours,
    })),
  [jobs, clients, workOrders]);

  const hoursGridActive = view === 'member' && boardMode === 'hours';

  const hoursModel = useMemo(() => (
    hoursGridActive
      ? buildCrewHoursGrid(activeStaff, displayJobs, workOrders, weekDays, workConfig.weekendDays, capacityHours, settings.scheduling?.defaultBreaks ?? [], availWindow)
      : null
  ), [hoursGridActive, activeStaff, displayJobs, workOrders, weekDays, workConfig.weekendDays, capacityHours, settings.scheduling?.defaultBreaks, availWindow]);

  // Sidebar runs on its own period lens, independent of the week grid. Week reuses
  // the grid's weekDays; month/year span the calendar period and re-prorate hours.
  const sidebarDayKeys = useMemo(
    () => periodDayKeys(currentDate, sidebarPeriod, workConfig.weekendDays, weekDays.map(toLocalDateKey)),
    [currentDate, sidebarPeriod, workConfig.weekendDays, weekDays],
  );
  const sidebarJobs = useMemo(() => {
    const list = buildJobSummaries(displayJobs, workOrders, sidebarDayKeys, workConfig.weekendDays, capacityHours, activeStaff, settings.scheduling?.defaultBreaks ?? []);
    if (sidebarPeriod === 'week') return list;
    // "What's coming up": chronological by earliest working day in the period.
    return [...list].sort((a, b) => (a.days[0] ?? '').localeCompare(b.days[0] ?? ''));
  }, [displayJobs, workOrders, sidebarDayKeys, workConfig.weekendDays, capacityHours, sidebarPeriod, activeStaff, settings.scheduling?.defaultBreaks]);
  const sidebarTitle = useMemo(() => (
    sidebarPeriod === 'month' ? t('views.JobScheduling.CrewHoursGrid.jobsThisMonth')
    : sidebarPeriod === 'year' ? t('views.JobScheduling.CrewHoursGrid.jobsThisYear')
    : t('views.JobScheduling.CrewHoursGrid.jobsThisWeek')
  ), [sidebarPeriod, t]);

  // Day-scoped job summaries for the Day + Hours sidebar: the same builder fed just
  // the selected day, so "Jobs Today" shows that day's assigned/required and line items.
  const dayModel = useMemo(() => (
    hoursGridActive && scale === 'day'
      ? buildCrewHoursGrid(activeStaff, displayJobs, workOrders, [currentDate], workConfig.weekendDays, capacityHours, settings.scheduling?.defaultBreaks ?? [], availWindow)
      : null
  ), [hoursGridActive, scale, activeStaff, displayJobs, workOrders, currentDate, workConfig.weekendDays, capacityHours, settings.scheduling?.defaultBreaks, availWindow]);

  // Conflict detection and the resolution card must read the same edited windows.
  // With cascade off, a per-day edit lives only in dailyHoursEdits, so bake it into
  // the staged changes before detecting issues / building suggestions — otherwise the
  // strip evaluates the job at its original time and contradicts the conflict card.
  const editedChanges = useMemo(
    () => (preview.staged ? preview.staged.changes.map(c => bakeDailyEdits(c, dailyHoursEdits[c.jobId])) : []),
    [preview.staged, dailyHoursEdits],
  );

  const issues = useMemo<ScheduleIssue[]>(() => {
    if (!preview.staged) return [];
    const base = detectIssues(editedChanges, jobs, workConfig, capacityHours);
    // Surface shift-cascade residual clashes as non-blocking warnings in the same list.
    const residualIssues: ScheduleIssue[] = residualClashes.map(r => ({
      jobId: r.jobId, jobName: r.jobName, kind: 'double-book', severity: 'medium', message: r.message,
    }));
    return [...base, ...residualIssues];
  }, [preview.staged, editedChanges, jobs, workConfig, capacityHours, residualClashes]);

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!preview.staged) return [];
    return buildSuggestions(editedChanges, jobs, workConfig, {
      mockWeather: settings.scheduling?.mockWeather || {},
      capacityHours,
    });
  }, [preview.staged, editedChanges, jobs, workConfig, capacityHours, settings.scheduling?.mockWeather]);

  const conflictResolutions = useMemo<ConflictResolution[]>(() => {
    const s = preview.staged;
    if (!s || s.mode !== 'edit' || !s.primaryJobId) return [];
    const primary = s.changes.find(c => c.jobId === s.primaryJobId && !c.skipped);
    if (!primary) return [];
    // Proposed world: committed jobs with every non-skipped staged change applied,
    // including this edit and any conflicting jobs already moved. Once a conflicting
    // job is staged into its new slot it no longer clashes, so the card self-clears.
    const world = jobs.map(j => {
      const c = s.changes.find(cc => cc.jobId === j.id && !cc.skipped);
      return c ? withStagedWindow(j, c, dailyHoursEdits[j.id]) : j;
    });
    return resolveSameDayConflicts(primary, world, workConfig);
  }, [preview.staged, jobs, workConfig, dailyHoursEdits]);

  const handleMoveConflicts = () => {
    const s = preview.staged;
    if (!s) return;
    if (!conflictResolutions.some(isMovableResolution)) return;
    // Bake the user's in-flight per-day edits into the staged changes so the
    // re-seed effect (keyed on preview.staged) preserves them across setChanges.
    preview.setChanges(mergeResolutionsIntoChanges(s.changes, conflictResolutions, dailyHoursEdits));
  };

  // Resolve a job's assigned crew members from its ids + allocations.
  const assignedMembers = useCallback((job: Job): CrewMember[] => {
    const ids = new Set<string>(job.crewMemberIds || []);
    job.allocations?.forEach(a => a.memberIds?.forEach(m => ids.add(m)));
    return allStaff.filter(s => ids.has(s.id));
  }, [allStaff]);

  // Jobs shown in month view, filtered by the lane toggle (member dropdown when in member mode).
  const monthJobs = useMemo(() => {
    if (view === 'member' && selectedMemberId) {
      return displayJobs.filter(j => assignedMembers(j).some(m => m.id === selectedMemberId));
    }
    return displayJobs;
  }, [view, selectedMemberId, displayJobs, assignedMembers]);

  // jobId -> assigned crew members (with avatars) for the changing jobs.
  const crewByJob = useMemo<Record<string, CrewMember[]>>(() => {
    if (!preview.staged) return {};
    const map: Record<string, CrewMember[]> = {};
    for (const c of preview.staged.changes) {
      if (c.skipped) continue;
      const job = jobs.find(j => j.id === c.jobId);
      if (!job) continue;
      const stagedCrew = stagedCrewByJob[c.jobId];
      map[c.jobId] = stagedCrew
        ? stagedCrew.memberIds.map(id => allStaff.find(s => s.id === id)).filter((m): m is CrewMember => !!m)
        : assignedMembers(job);
    }
    return map;
  }, [preview.staged, jobs, assignedMembers, stagedCrewByJob, allStaff]);

  // jobId -> work-order stats (work order #, est/assigned/rendered hours).
  const statsByJob = useMemo<Record<string, JobStats>>(() => {
    if (!preview.staged) return {};
    const map: Record<string, JobStats> = {};
    // Management mode: the primary job lives in draftJob, not in `changes` (those are
    // cascade followers) — compute from the DRAFT so hours update live as shifts are edited.
    const draft = preview.staged.draftJob;
    if (draft) map[draft.id] = computeJobStats(draft, workOrders);
    for (const c of preview.staged.changes) {
      if (c.skipped) continue;
      const job = jobs.find(j => j.id === c.jobId);
      if (job && !map[c.jobId]) map[c.jobId] = computeJobStats(job, workOrders);
    }
    return map;
  }, [preview.staged, jobs, workOrders]);

  // Advisory hours warnings for the job being edited (budget + daily capacity).
  // Computed from the STAGED edits so they track live changes. Edit mode only.
  const hoursWarnings = useMemo<ScheduleIssue[]>(() => {
    const s = preview.staged;
    if (!s || s.mode !== 'edit') return [];
    const primary = s.primaryJobId
      ? (s.changes.find(c => c.jobId === s.primaryJobId && !c.skipped) ?? s.changes.find(c => !c.skipped))
      : s.changes.find(c => !c.skipped);
    if (!primary) return [];
    const crewMembers = crewByJob[primary.jobId] ?? [];
    const standardDay = workConfig.workDayEndHour - workConfig.workDayStartHour;
    return detectHoursWarnings({
      jobId: primary.jobId,
      jobName: primary.jobName,
      stagedDays: workingDayKeys(primary.newStart, primary.newEnd, workConfig.weekendDays),
      dailyHours: dailyHoursEdits[primary.jobId] ?? {},
      crew: crewMembers.map(m => ({ id: m.id, name: m.name })),
      estHours: statsByJob[primary.jobId]?.estHours ?? 0,
      otherJobs: jobs.filter(j => j.id !== primary.jobId),
      capacityHours,
      standardDay,
    });
  }, [preview.staged, crewByJob, statsByJob, dailyHoursEdits, jobs, capacityHours, workConfig]);

  // jobId -> client name, for the single-job editor header subtitle.
  const clientNameByJob = useMemo<Record<string, string>>(() => {
    if (!preview.staged) return {};
    const map: Record<string, string> = {};
    const draft = preview.staged.draftJob;
    if (draft) {
      const client = clients.find(cl => cl.id === draft.clientId);
      if (client) map[draft.id] = client.name;
    }
    for (const c of preview.staged.changes) {
      if (c.skipped) continue;
      const job = jobs.find(j => j.id === c.jobId);
      const client = job ? clients.find(cl => cl.id === job.clientId) : undefined;
      if (client) map[c.jobId] = client.name;
    }
    return map;
  }, [preview.staged, jobs, clients]);

  // Followers (excluding the primary) that will shift when cascade is on — for the editor summary.
  const cascadeFollowers = useMemo<ProposedChange[]>(() => {
    const s = preview.staged;
    if (!s || s.mode !== 'edit' || !cascade) return [];
    return s.changes.filter(c => c.jobId !== s.primaryJobId && !c.skipped);
  }, [preview.staged, cascade]);

  // Followers left untouched because they fall after the cutoff date.
  const cascadeProtected = useMemo<ProposedChange[]>(() => {
    const s = preview.staged;
    if (!s || s.mode !== 'edit' || !cascade) return [];
    return s.changes.filter(c => c.skipped === 'after-limit');
  }, [preview.staged, cascade]);

  // Names of moved followers that leapfrogged a protected job (non-blocking warning).
  const cascadeLeapfrogNames = useMemo<string[]>(() => {
    const s = preview.staged;
    if (!s || s.mode !== 'edit' || !cascade) return [];
    const ids = new Set(cascadeLeapfrogIds(s.changes, s.primaryJobId));
    return s.changes.filter(c => ids.has(c.jobId)).map(c => c.jobName);
  }, [preview.staged, cascade]);

  // Open the full crew-assignment modal for a job (from the sidebar's Reassign
  // button or the job details panel), where per-day/per-member hours are set.
  const handleReassignCrew = (jobId: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;
    setJobToAssign(job);
    setIsCrewModalOpen(true);
  };

  // Apply a single day's hour edit straight through (commit-immediately, no staging).
  const handleHoursEditDay = (memberId: string, dateKey: string, jobId: string, hours: number, shiftId?: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;
    onUpdateJob(setMemberDayHoursPreservingSpan(job, memberId, dateKey, hours, workConfig.weekendDays, capacityHours, shiftId));
  };

  const handleHoursRemoveDay = (memberId: string, dateKey: string, jobId: string, shiftId?: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;
    onUpdateJob(setMemberDayHoursPreservingSpan(job, memberId, dateKey, 0, workConfig.weekendDays, capacityHours, shiftId));
  };

  // A day chip was dragged from one member onto another in the same day column: the
  // hours leave the first member and land on the second, in one job write.
  const handleTransferHours = (src: HoursTransfer, toMemberId: string) => {
    const job = jobs.find(j => j.id === src.jobId);
    if (!job) return;
    if (job.is_locked) {
      onToast?.(t('views.JobSchedulingView.jobLockedNoTransfer', { jobNumber: job.jobNumber }));
      return;
    }
    onUpdateJob(transferMemberDayHours(job, src.memberId, toMemberId, src.dateKey, src.hours, workConfig.weekendDays, capacityHours, src.shiftId));
  };

  // Day view: drag committed a new start/end clock for a job on one day.
  // Smart time-shift: push a job's start to `startTime` on `dayKey`, re-flow it
  // forward (spill into the next working day), and cascade shared-crew conflicts.
  // Routes through the same preview/Apply pipeline as date edits.
  const handleShiftStartTime = (jobId: string, dayKey: string, startTime: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job || job.is_locked) return;
    const s = preview.staged;
    const editorOpen = !!s && s.primaryJobId === jobId;

    if (editorOpen) {
      // Pin the first day's new start in the edits, then re-resolve. With the master
      // toggle OFF the hours stay literal (Apply maps them via applyDailyHours); ON
      // runs the conflict-aware reflow (re-place leftover + bump blockers).
      const prevWin = dailyHoursEdits[jobId]?.[dayKey] ?? availWindow;
      // Slide the end to keep a valid window when the new start would pass it.
      const win = clampDayWindow({ startTime, endTime: prevWin.endTime }, prevWin, 'startTime', workConfig);
      const pinned: Record<string, DayHours> = { ...dailyHoursEdits[jobId], [dayKey]: win };
      setDailyHoursEdits(prev => ({ ...prev, [jobId]: pinned }));
      if (!cascade) return;
      const out = runReflow(job, pinned, cascadeUntil);
      preview.setChanges([out.primary, ...out.displaced]);
      return;
    }

    // No open editor (Day-board block drag): open a fresh preview via the existing
    // time-shift so the drag lands somewhere sensible; further edits in the editor
    // use the conflict-aware reflow.
    const primaryChange = timeShiftChange(job, `${dayKey}T${startTime}:00`, workConfig);
    const scope = sharedCrewScope(job);
    const { changes, cascadeOn } = resolveTimeShiftCascade(jobs, primaryChange, workConfig, scope, cascade, cascadeUntil);
    if (!cascade) {
      setCascade(cascadeOn); // default ON when shared-crew conflicts exist
      setCascadeUntil('');
    }
    preview.stage({
      changes,
      label: `Reschedule ${job.name}`,
      mode: 'edit',
      primaryJobId: jobId,
      commit: (eff) => onApplySchedule(eff, `Reschedule ${job.name}`),
    });
    setPendingMoveId(jobId);
  };

  const handleChangeDayWindow = (jobId: string, dayKey: string, window: { startTime: string; endTime: string }, shiftId?: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;
    if (shiftId) {
      const alloc = job.allocations?.find(a => a.id === shiftId);
      if (!alloc) return;
      // Open the shift-management drawer (stacked cards) with this shift's day window
      // edited in the draft — same staged flow as the week-board drag and click-to-manage.
      const draft = setAllocDayWindow(ensureJobAllocations(job), shiftId, dayKey, window);
      setCascade(false);
      setDraftMovedShiftId(shiftId);
      preview.stage({
        changes: [], label: `Edit ${alloc.name}`, mode: 'edit', primaryJobId: jobId, draftJob: draft,
        commit: (eff) => onApplySchedule(eff, `Edit ${alloc.name}`),
      });
      setPendingMoveId(jobId);
      return;
    }
    const prevStart = job.dailyHours?.[dayKey]?.startTime
      ?? `${String(workConfig.workDayStartHour).padStart(2, '0')}:00`;
    if (window.startTime !== prevStart) {
      handleShiftStartTime(jobId, dayKey, window.startTime);
    } else {
      onUpdateJob(setJobDayWindow(job, dayKey, window));
    }
  };

  // Day + Hours timeline: the selected day's hour cells for a (member, job, shift) block.
  const dayCellsFor = (memberId: string, jobId: string, shiftId?: string) => {
    const row = dayModel?.rows.find(r => r.memberId === memberId);
    return (row?.cellsByDay[selectedDayKey] ?? []).filter(c =>
      c.jobId === jobId && (shiftId === undefined || c.shiftId === shiftId));
  };
  // Assigned crew-hours shown on a timeline block; always inline-editable since each
  // (member, job, shift) block maps to a single cell.
  const dayBlockHours = (memberId: string, jobId: string, shiftId?: string) => {
    if (!dayModel) return null;
    const cells = dayCellsFor(memberId, jobId, shiftId);
    const hours = Math.round(cells.reduce((s, c) => s + c.hours, 0) * 10) / 10;
    return { hours, editable: true };
  };
  const handleEditBlockHours = (memberId: string, jobId: string, hours: number, shiftId?: string) => {
    handleHoursEditDay(memberId, selectedDayKey, jobId, hours, shiftId);
  };
  const handleRemoveBlockHours = (memberId: string, jobId: string, shiftId?: string) => {
    handleHoursRemoveDay(memberId, selectedDayKey, jobId, shiftId);
  };

  // Jobs the Assign Hours modal offers: only the member's own jobs. The one exception
  // is the job the modal was opened FOR (a job dropped onto the member) — that's the
  // act of assigning them, so it stays even though they aren't on it yet.
  const assignableJobs = useMemo(() => {
    if (!assignMemberId) return [];
    return (hoursModel?.jobs ?? [])
      .filter(s => {
        if (s.jobId === assignJobId) return true;
        const job = jobs.find(x => x.id === s.jobId);
        return !!job && isMemberOnJob(job, assignMemberId);
      })
      .map(s => ({ id: s.jobId, jobNumber: s.jobNumber, name: s.jobName }));
  }, [hoursModel, jobs, assignMemberId, assignJobId]);

  // Days for the Assign Hours modal: every working day of the job that falls in this
  // week, days off included — those are marked, not withheld. Prefill with their
  // existing hours; new days default to 0.
  const getAssignDays = useCallback((jobId: string) => {
    const job = jobs.find(j => j.id === jobId);
    const member = allStaff.find(s => s.id === assignMemberId);
    if (!job || !member) return [];
    const eligible = assignableDayKeys(job, weekDays.map(toLocalDateKey), workConfig.weekendDays);
    const row = hoursModel?.rows.find(r => r.memberId === member.id);
    const defaults = settings.scheduling?.defaultBreaks ?? [];
    const existing = (k: string) => row?.cellsByDay[k]?.find(c => c.jobId === jobId)?.hours ?? 0;
    // The shift the assignment targets, for the member's saved per-day window overrides.
    const alloc = job.allocations?.find(a => a.id === assignShiftId) ?? job.allocations?.[0];
    return eligible.map(k => {
      const d = new Date(`${k}T12:00:00`);
      const w = alloc?.memberDailyWindows?.[member.id]?.[k] ?? jobDayWindow(job, k);
      return {
        dateKey: k,
        weekday: d.toLocaleDateString(undefined, { weekday: 'short' }),
        dayNum: d.toLocaleDateString(undefined, { day: 'numeric' }),
        hours: existing(k),
        startTime: w?.startTime,
        endTime: w?.endTime,
        breaks: resolveBreaks(member.schedule?.[k], defaults),
        off: !!member.schedule?.[k]?.isOff,
        offReason: member.schedule?.[k]?.reason,
      };
    });
  }, [jobs, allStaff, assignMemberId, assignShiftId, weekDays, workConfig.weekendDays, hoursModel, settings.scheduling?.defaultBreaks]);

  // Why the Assign Hours day list came back empty, with the dates spelled out the same
  // way the day rows label them.
  const getAssignNoDaysReason = useCallback((jobId: string): AssignHoursNoDaysReason | null => {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return null;
    const reason = noEligibleDaysReason(job, weekDays.map(toLocalDateKey), workConfig.weekendDays);
    if (!reason) return null;
    if (reason.kind === 'unscheduled') return { kind: 'unscheduled' };
    const label = (k: string) => {
      const d = new Date(`${k}T12:00:00`);
      return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${d.toLocaleDateString(undefined, { day: 'numeric' })}`;
    };
    return { kind: 'notThisWeek', dayLabels: reason.jobDays.map(label) };
  }, [jobs, weekDays, workConfig.weekendDays]);

  // Shared inputs for the Assign Hours modal's live readouts: resolves the member,
  // job, the hours currently entered, and the totals to compare against. Returns
  // null when the member/job can't be resolved.
  const assignContext = useCallback((jobId: string, hoursByDay: Record<string, number>) => {
    const job = jobs.find(j => j.id === jobId);
    const member = allStaff.find(s => s.id === assignMemberId);
    if (!job || !member) return null;
    const standardDay = workConfig.workDayEndHour - workConfig.workDayStartHour;
    // The member's saved hours for exactly the cells the modal's inputs prefill and
    // replace, so the live readout compares against the right baseline.
    const currentShown = Object.keys(hoursByDay).reduce((s, k) => s + memberJobDayHours(job, member.id, k, standardDay), 0);
    const enteredTotal = Object.values(hoursByDay).reduce((s, h) => s + (h || 0), 0);
    const row = hoursModel?.rows.find(r => r.memberId === member.id);
    const jobDayKeys = workingDayKeys(job.startDate ?? '', job.endDate ?? job.startDate ?? '', workConfig.weekendDays);
    const jobTotalNow = assignedHoursForJobInWeek(job, jobDayKeys, standardDay);
    const estHours = workOrders.find(w => w.id === job.workOrderId)?.totalProductionHours ?? 0;
    return {
      memberName: member.name,
      jobName: job.name,
      enteredTotal,
      memberWeekTotalOther: (row?.weekTotal ?? 0) - currentShown,
      weeklyCapacity: row?.capacity ?? 0,
      jobTotalOther: jobTotalNow - currentShown,
      estHours,
    };
  }, [jobs, allStaff, assignMemberId, workConfig, hoursModel, workOrders]);

  // Hours already on a job from every shift EXCEPT one — what the crew-assignment modal's
  // Assign Hours popup needs to show the job-wide JOB HOURS readout while its own shift is
  // still a draft.
  const otherShiftsHours = useCallback((job: Job, shiftId?: string) => {
    const keys = workingDayKeys(job.startDate ?? '', job.endDate ?? job.startDate ?? '', workConfig.weekendDays);
    const others = { ...job, allocations: (job.allocations ?? []).filter(a => a.id !== shiftId) };
    return assignedHoursForJobInWeek(others, keys, workConfig.workDayEndHour - workConfig.workDayStartHour);
  }, [workConfig]);

  // Live over-limit advisories for the modal (member over capacity / job over estimate).
  const getAssignWarnings = useCallback((jobId: string, hoursByDay: Record<string, number>): string[] => {
    const ctx = assignContext(jobId, hoursByDay);
    return ctx ? detectAssignHoursWarnings(ctx) : [];
  }, [assignContext]);

  // Live "hours still needed" for the job, including the hours being entered.
  const getAssignProgress = useCallback((jobId: string, hoursByDay: Record<string, number>) => {
    const ctx = assignContext(jobId, hoursByDay);
    return ctx ? jobHoursProgress(ctx.jobTotalOther, ctx.enteredTotal, ctx.estHours) : null;
  }, [assignContext]);

  // Drop-a-job-onto-a-member: resolve which shift the hours target. 0/1 shift → the
  // primary (or none), open the Assign Hours modal directly; 2+ shifts → open the
  // shift picker first, which sets assignShiftId then leaves the modal open.
  const beginAssign = (memberId: string, jobId: string, shiftId?: string) => {
    const job = jobs.find(j => j.id === jobId);
    const shifts = job?.allocations ?? [];
    setAssignMemberId(memberId);
    setAssignJobId(jobId);
    if (shiftId) { setAssignShiftId(shiftId); return; } // shift chosen at drag time — no picker
    if (shifts.length >= 2) { setPickerJobId(jobId); return; }
    setAssignShiftId(shifts[0]?.id);
  };

  // Per-day assignment from the modal: set each shown day's hours (0 clears it) on the
  // chosen shift, leaving the member's other days untouched. Days whose start/end times
  // were edited get a member-specific window override; a cleared day drops its override.
  const handleAssignDaysSubmit = (jobId: string, hoursByDay: Record<string, number>, windowsByDay: Record<string, { startTime: string; endTime: string }>) => {
    const job = jobs.find(j => j.id === jobId);
    const member = allStaff.find(s => s.id === assignMemberId);
    if (job && member) {
      let next = job;
      for (const [k, h] of Object.entries(hoursByDay)) {
        next = setMemberDayHours(next, member.id, k, h, assignShiftId);
        if (h > 0 && windowsByDay[k]) {
          next = setMemberDayWindow(next, member.id, k, windowsByDay[k], assignShiftId);
        } else if (h <= 0) {
          next = setMemberDayWindow(next, member.id, k, null, assignShiftId);
        }
      }
      onUpdateJob(next);
    }
    setAssignMemberId(null);
    setAssignJobId(null);
    setAssignShiftId(undefined);
  };

  // Save handler for the crew modal: replace the job's crew and persist the
  // allocation (dates, times, and the per-day/per-member hours grid).
  const handleSaveCrewModal = (newCrew: CrewMember[], allocation?: Partial<JobCrewAllocation>) => {
    if (jobToAssign) {
      const memberIds = newCrew.map(c => c.id);
      const job = jobs.find(j => j.id === jobToAssign.id);
      const existing = job?.allocations?.[0];
      const full: JobCrewAllocation = {
        id: allocation?.id || existing?.id || `alloc-${Date.now()}`,
        name: allocation?.name || existing?.name || 'Crew',
        startDate: allocation?.startDate || existing?.startDate || (job?.startDate || '').split('T')[0],
        endDate: allocation?.endDate || existing?.endDate || (job?.endDate || job?.startDate || '').split('T')[0],
        startTime: allocation?.startTime || existing?.startTime || '08:00',
        endTime: allocation?.endTime || existing?.endTime || '17:00',
        memberIds,
        hoursAssignments: allocation?.hoursAssignments,
        memberDailyWindows: allocation?.memberDailyWindows,
      };
      if (preview.staged) {
        // Inside the reschedule drawer: stage; committed on Apply, discarded on Cancel.
        setStagedCrewByJob(prev => ({ ...prev, [jobToAssign.id]: { memberIds, allocation: full } }));
      } else if (job) {
        // Standalone (from the job details panel): no drawer to Apply, so write through.
        onUpdateJob({ ...job, crewMemberIds: memberIds, allocations: memberIds.length ? [full] : [] });
      }
    }
    setIsCrewModalOpen(false);
    setJobToAssign(null);
  };

  // "Reschedule job" (scheduled) / "Schedule job" (unscheduled) from the details
  // panel: stage a preview so the editor sidebar opens, where dates/hours/crew can
  // be edited. A scheduled job stages a no-op at its current dates; an unscheduled
  // job is seeded onto the first working day currently in view so the editor opens
  // with a concrete date to adjust (see initialScheduleChange).
  const handleRescheduleJob = (jobId: string) => {
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;
    // Open the drawer in shift-management mode: edit a draft of the job's shifts
    // (materialize a legacy crew into one shift first). Cascade followers on OTHER jobs
    // go into `changes`; the primary job commits from `draftJob` on Apply.
    const draft = ensureJobAllocations(job);
    const label = job.startDate ? `Edit ${job.name}` : `Schedule ${job.name}`;
    setCascade(false);
    preview.stage({ changes: [], label, mode: 'edit', primaryJobId: job.id, draftJob: draft, commit: (eff) => onApplySchedule(eff, label) });
    setSelectedJob(null);
  };

  // Step 1 — preview: show each job's proposed destination on the board as a faded
  // placeholder, and jump to the earliest off-view landing date so it's in view.
  const handlePreviewAutoFix = () => {
    if (!preview.staged) return;
    const dest: Record<string, { newStart: string; newEnd: string }> = {};
    for (const s of suggestions) dest[s.jobId] = { newStart: s.change.newStart, newEnd: s.change.newEnd };
    setAutoFixDest(dest);

    const offViewKeys = suggestions
      .map(s => toLocalDateKey(new Date(s.change.newStart)))
      .filter(k => !visibleDayKeys.has(k))
      .sort();
    if (offViewKeys.length > 0) setCurrentDate(new Date(`${offViewKeys[0]}T00:00`));
  };

  // Cancel the preview: drop the board placeholders, leave the staged changes as-is.
  const handleCancelAutoFix = () => setAutoFixDest(null);

  // Step 2 — confirm: commit the proposed dates into the staged changes. The board
  // placeholders (autoFixDest) stay until the whole reschedule is applied/cancelled.
  const handleAutoFix = () => {
    if (!preview.staged) return;
    const byId = new Map(suggestions.map(s => [s.jobId, s.change]));
    const merged = preview.staged.changes.map(c => byId.get(c.jobId) ?? c);
    preview.setChanges(merged);
  };

  const impact = useMemo(() => computeImpact(
    preview.staged?.changes ?? [],
    jobs,
    allStaff,
    clients,
    settings.scheduling?.mockWeather || {},
  ), [preview.staged, jobs, allStaff, clients, settings.scheduling?.mockWeather]);

  const handleChangeDelay = (days: number) => {
    const s = preview.staged;
    if (!s?.recompute) return;
    preview.stage({ ...s, changes: s.recompute(days), delayDays: days });
  };

  // Any right-docked scheduling panel open? On lg+ the content reserves a gutter
  // (lg:pr-[440px]) so the panel docks beside the calendar instead of covering it.
  const panelOpen = !!preview.staged || isBulkOpen || !!moveJob || !!selectedJob;

  return (
    <div className={`w-full mx-auto min-h-screen py-8 pl-4 pr-4 md:pl-8 md:pr-8 lg:pl-12 transition-[padding] duration-300 ${panelOpen ? 'lg:pr-[440px]' : 'lg:pr-12'}`}>
        
        {/* Bulk Reschedule Modal */}
        <CascadeRescheduleModal
            isOpen={isBulkOpen}
            onClose={() => setIsBulkOpen(false)}
            jobs={jobs}
            crew={allStaff}
            config={workConfig}
            onApply={(changes, label) => {
                preview.stage({ changes, label, mode: 'bulk', commit: (eff) => onApplySchedule(eff, label) });
                setIsBulkOpen(false);
            }}
        />

        {/* Availability Edit Modal */}
        <EditAvailabilityModal
            isOpen={isAvailabilityModalOpen}
            onClose={() => setIsAvailabilityModalOpen(false)}
            employee={editingEmployee}
            date={editingDate}
            onSave={handleSaveAvailability}
        />

        {/* Per-member-day Break Editor */}
        {/* Job Assignment Modal */}
        {jobToAssign && (
            <CrewSelectionModal
                isOpen={isCrewModalOpen}
                onClose={() => { setIsCrewModalOpen(false); setJobToAssign(null); }}
                currentCrew={assignedMembers(jobToAssign)}
                onSave={handleSaveCrewModal}
                allStaff={allStaff}
                jobStartDate={jobToAssign.startDate}
                jobEndDate={jobToAssign.endDate}
                existingJobs={jobs}
                allocationToEdit={jobToAssign.allocations?.[0]}
                estHours={statsByJob[jobToAssign.id]?.estHours}
                jobRef={{ jobNumber: jobToAssign.jobNumber, name: jobToAssign.name }}
                otherShiftsHours={otherShiftsHours(jobToAssign, jobToAssign.allocations?.[0]?.id)}
                onEditMember={onEditEmployee}
                simplified
                excludeJobId={jobToAssign.id}
                weekendDays={workConfig.weekendDays}
                dailyCapacityHours={capacityHours}
                availabilityWindow={availWindow}
                defaultBreaks={settings.scheduling?.defaultBreaks ?? []}
            />
        )}


        {/* Full Assign Crew & Schedule modal for a single shift (opened from "Add shift"
            or a card's "Edit members") — edits the draft. Work Order card hidden. */}
        {draftJob && editingShiftId && (
            <CrewSelectionModal
                isOpen={!!editingShiftId}
                onClose={() => { setEditingShiftId(null); setAddingShift(false); }}
                currentCrew={allStaff.filter(m => findAlloc(draftJob, editingShiftId)?.memberIds.includes(m.id))}
                onSave={(newCrew, allocation) => {
                  const a = findAlloc(draftJob, editingShiftId);
                  if (a) {
                    const updated: JobCrewAllocation = {
                      ...a,
                      name: allocation?.name || a.name,
                      memberIds: newCrew.map(c => c.id),
                      ...(allocation?.startDate ? { startDate: allocation.startDate } : {}),
                      ...(allocation?.endDate ? { endDate: allocation.endDate } : {}),
                      ...(allocation?.startTime ? { startTime: allocation.startTime } : {}),
                      ...(allocation?.endTime ? { endTime: allocation.endTime } : {}),
                      ...(allocation?.hoursAssignments ? { hoursAssignments: allocation.hoursAssignments } : {}),
                      // The day set travels with the shift: skipped days and per-day
                      // windows are authored here, so an empty list must overwrite, not
                      // be treated as "unset" and dropped.
                      ...(allocation?.skipDays ? { skipDays: allocation.skipDays } : {}),
                      ...(allocation?.dailyHours ? { dailyHours: allocation.dailyHours } : {}),
                    };
                    // Route through the schedule-edit path so the envelope + cascade recompute.
                    draftScheduleEdit(j => upsertAllocation(j, updated), editingShiftId);
                  }
                  setEditingShiftId(null);
                  setAddingShift(false);
                }}
                allStaff={allStaff}
                jobStartDate={draftJob.startDate}
                jobEndDate={draftJob.endDate}
                existingJobs={jobs}
                allocationToEdit={findAlloc(draftJob, editingShiftId)}
                estHours={statsByJob[draftJob.id]?.estHours}
                assignedHours={statsByJob[draftJob.id]?.assignedHours}
                renderedHours={statsByJob[draftJob.id]?.renderedHours}
                jobRef={{ jobNumber: draftJob.jobNumber, name: draftJob.name }}
                otherShiftsHours={otherShiftsHours(draftJob, editingShiftId)}
                onEditMember={onEditEmployee}
                hideWorkOrder
                title={addingShift ? t('views.JobSchedulingView.addShiftTitle') : t('views.JobSchedulingView.editShiftTitle')}
                confirmLabel={t('views.JobSchedulingView.assignShift')}
                excludeJobId={draftJob.id}
                weekendDays={workConfig.weekendDays}
                dailyCapacityHours={capacityHours}
                availabilityWindow={availWindow}
                defaultBreaks={settings.scheduling?.defaultBreaks ?? []}
            />
        )}

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 mb-8">
            <div>
                {/* Port: production title size (job-scheduling/v2/templates), not the phase-1 Typography.h1. */}
                <h1 className="mb-4 text-3xl font-black tracking-tight text-gray-900 dark:text-white md:text-4xl">{t('views.JobSchedulingView.pageTitle')}</h1>
                <p className="font-sans text-lg leading-relaxed text-gray-500 dark:text-gray-400 md:text-xl">{t('views.JobSchedulingView.pageLead')}</p>
            </div>
            
            {/* View Controls */}
            <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700 w-full md:w-auto">
                <button
                    onClick={() => setView('job')}
                    className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${view === 'job' ? 'bg-white dark:bg-gray-700 shadow-sm text-primary-700 dark:text-primary-300' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
                >
                    <Briefcase className="w-4 h-4" /> {t('views.JobSchedulingView.viewJob')}
                </button>
                <button
                    onClick={() => setView('member')}
                    className={`flex-1 md:flex-none px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-2 ${view === 'member' ? 'bg-white dark:bg-gray-700 shadow-sm text-primary-700 dark:text-primary-300' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
                >
                    <User className="w-4 h-4" /> {t('views.JobSchedulingView.viewCrew')}
                </button>
            </div>
        </div>

        {/* Date Navigator */}
        <div className="flex items-center justify-between bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm mb-6 gap-4">
            <button onClick={scale === 'month' ? handlePrevMonth : scale === 'day' ? handlePrevDay : handlePrevWeek} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors text-gray-500 dark:text-gray-400">
                <ChevronLeft className="w-6 h-6" />
            </button>
            <div className="text-center flex-1">
                <span className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest block mb-1">{scale === 'month' ? t('views.JobSchedulingView.scaleMonth') : scale === 'day' ? t('views.JobSchedulingView.scaleDay') : t('views.JobSchedulingView.scaleWeekOf')}</span>
                {/* The title doubles as a date-picker trigger: click to jump to any date. */}
                <DatePicker
                    value={toLocalDateKey(currentDate)}
                    onChange={(key) => setCurrentDate(new Date(`${key}T12:00:00`))}
                    granularity={scale === 'month' ? 'month' : 'day'}
                    align="center"
                    className="inline-block"
                    renderTrigger={(open) => (
                        <button
                            type="button"
                            onClick={open}
                            className="text-xl font-bold text-gray-900 dark:text-white rounded-lg px-2 py-0.5 transition-colors hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-50 dark:hover:bg-gray-700/60 cursor-pointer"
                        >
                            {scale === 'month'
                                ? currentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
                                : scale === 'day'
                                ? currentDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
                                : weekStart.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}
                        </button>
                    )}
                />
            </div>
            <button onClick={scale === 'month' ? handleNextMonth : scale === 'day' ? handleNextDay : handleNextWeek} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition-colors text-gray-500 dark:text-gray-400">
                <ChevronRight className="w-6 h-6" />
            </button>
            <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
                <button onClick={() => setScale('day')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${scale === 'day' ? 'bg-white dark:bg-gray-700 shadow-sm text-primary-700 dark:text-primary-300' : 'text-gray-500 dark:text-gray-400'}`}>{t('views.JobSchedulingView.scaleDay')}</button>
                <button onClick={() => setScale('week')} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${scale === 'week' ? 'bg-white dark:bg-gray-700 shadow-sm text-primary-700 dark:text-primary-300' : 'text-gray-500 dark:text-gray-400'}`}>{t('views.JobSchedulingView.scaleWeek')}</button>
                <button onClick={() => setScale('month')} disabled={hoursGridActive} className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${scale === 'month' ? 'bg-white dark:bg-gray-700 shadow-sm text-primary-700 dark:text-primary-300' : 'text-gray-500 dark:text-gray-400'} ${hoursGridActive ? 'opacity-40 cursor-not-allowed' : ''}`}>{t('views.JobSchedulingView.scaleMonth')}</button>
            </div>
            {canReschedule && (
                <div className="flex items-center gap-2 border-l border-gray-200 dark:border-gray-700 pl-4">
                    {props.headerActions}
                    <Button
                        variant="secondary"
                        onClick={() => setIsBulkOpen(true)}
                        className="flex items-center gap-2 whitespace-nowrap"
                    >
                        <CalendarClock className="w-4 h-4" />
                        {t('views.JobSchedulingView.bulkReschedule')}
                    </Button>
                </div>
            )}
        </div>

        {view === 'member' && (
          <div className="mb-6 flex items-center gap-3">
            <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setBoardMode('board')}
                className={`px-4 sm:px-6 py-2 rounded-lg text-sm font-bold transition-all ${boardMode === 'board' ? 'bg-white dark:bg-gray-700 shadow-sm text-primary-700 dark:text-primary-300' : 'text-gray-500 dark:text-gray-400'}`}
              >
                {t('views.JobSchedulingView.modeBoard')}
              </button>
              <button
                onClick={() => setBoardMode('hours')}
                className={`px-4 sm:px-6 py-2 rounded-lg text-sm font-bold transition-all ${boardMode === 'hours' ? 'bg-white dark:bg-gray-700 shadow-sm text-primary-700 dark:text-primary-300' : 'text-gray-500 dark:text-gray-400'}`}
              >
                {t('views.JobSchedulingView.modeHours')}
              </button>
            </div>
            <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setShowAvailability(v => !v)}
                title={showAvailability ? t('views.JobSchedulingView.hideAvailability') : t('views.JobSchedulingView.showAvailability')}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${showAvailability ? 'bg-white dark:bg-gray-700 shadow-sm text-primary-700 dark:text-primary-300' : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'}`}
              >
                {showAvailability ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                {t('views.JobSchedulingView.availabilityLabel')}
              </button>
            </div>
          </div>
        )}

        {scale === 'month' && view === 'member' && (
            <div className="mb-6 flex items-center gap-2">
                <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{t('views.JobSchedulingView.memberLabel')}</span>
                <div className="w-56">
                    <Select
                        value={selectedMemberId ?? ''}
                        onChange={v => setSelectedMemberId(v || null)}
                        options={[{ value: '', label: t('views.JobSchedulingView.allMembers') }, ...allStaff.map(s => ({ value: s.id, label: s.name }))]}
                    />
                </div>
            </div>
        )}

        {/* Scheduling board — rows grouped by the active view. The hours grid is the
            weekly table; in Day scale the hours view shares the timeline board below. */}
        {/* Port: tour target for the crew-notification feature tour. */}
        <div data-tour="js-board">
        {hoursGridActive && scale !== 'day' && hoursModel ? (
          <CrewHoursGrid
            model={hoursModel}
            canEdit={canReschedule}
            weather={settings.scheduling?.mockWeather}
            onAssignWeek={(memberId) => { setAssignJobId(null); setAssignMemberId(memberId); }}
            onEditDay={handleHoursEditDay}
            onRemoveDay={handleHoursRemoveDay}
            onDropJobOnMember={(memberId, jobId, shiftId) => beginAssign(memberId, jobId, shiftId)}
            onTransferHours={handleTransferHours}
            onSelectJob={(id) => { const j = jobs.find(x => x.id === id); if (j) setSelectedJob(j); }}
            highlightJobId={selectedJob?.id ?? null}
            showAvailability={showAvailability}
            hideSidebar={panelOpen}
            sidebarTitle={sidebarTitle}
            sidebarJobs={sidebarJobs}
            sidebarPeriod={sidebarPeriod}
            onSidebarPeriodChange={setSidebarPeriod}
            sidebarCompact={sidebarCompact}
            onSidebarCompactChange={setSidebarCompact}
          />
        ) : hoursGridActive && scale === 'day' && dayModel ? (
          // Day + Hours: the crew timeline with the week Hours feature set — a day
          // header with the crew total, per-crew capacity in the column headers,
          // inline-editable hours on each block, drag-to-assign, and the jobs sidebar.
          <div className="flex flex-col xl:flex-row gap-6 xl:items-start">
            <div className="flex-1 min-w-0">
              <DayCrewHeader dayKey={selectedDayKey} weather={settings.scheduling?.mockWeather} total={dayModel.dayTotals[selectedDayKey] ?? null} />
              <DayBoard
                lanes={dayLanes}
                dayKey={selectedDayKey}
                config={workConfig}
                canReschedule={canReschedule}
                rainDays={settings.scheduling?.rainDays}
                weather={settings.scheduling?.mockWeather}
                onViewJob={(id) => { const j = jobs.find(x => x.id === id); if (j) setSelectedJob(j); }}
                onChangeDayWindow={handleChangeDayWindow}
                onMarkRainDay={handleMarkRainDay}
                onDropJobOnLane={(laneId, jobId, shiftId) => beginAssign(laneId, jobId, shiftId)}
                blockHours={dayBlockHours}
                onEditBlockHours={handleEditBlockHours}
                onRemoveBlockHours={handleRemoveBlockHours}
                laneBreaks={view === 'member' && showAvailability
                  ? (laneId) => resolveBreaks(allStaff.find(m => m.id === laneId)?.schedule?.[selectedDayKey], settings.scheduling?.defaultBreaks ?? [])
                  : undefined}
                renderRowLabel={
                  view === 'member'
                  ? (lane) => {
                      const emp = allStaff.find(s => s.id === lane.crewId);
                      // Surface each member's capacity for the day, mirroring the weekly grid.
                      const cap = dayModel?.rows.find(r => r.memberId === lane.crewId);
                      const pct = cap && cap.capacity > 0 ? Math.min(100, Math.round((cap.weekTotal / cap.capacity) * 100)) : 0;
                      const bar = cap?.overCapacity ? 'bg-red-500' : (cap && cap.capacity > 0 && cap.weekTotal === cap.capacity) ? 'bg-amber-500' : 'bg-emerald-500';
                      return (
                        <div className="w-full min-w-0">
                          <div className="flex items-center gap-2 justify-center">
                            <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden border border-white dark:border-gray-600 shrink-0">
                              {emp?.photo ? <img src={emp.photo} alt={emp.name} className="w-full h-full object-cover" /> : <User className="w-full h-full p-1.5 text-gray-400" />}
                            </div>
                            <div className="min-w-0">
                              <div className="font-bold text-sm truncate">{lane.crewName}</div>
                              {lane.inactive
                                ? <div className="text-[11px] text-amber-500 truncate">{t('views.JobSchedulingView.inactive')}</div>
                                : emp?.role && <div className="text-[11px] text-gray-400 truncate">{emp.role}</div>}
                              {!lane.inactive && showAvailability && (() => {
                                const a = resolveDayAvailability(emp ?? { id: lane.crewId, name: lane.crewName, role: '' }, selectedDayKey, availWindow);
                                return <div className="text-[11px] text-gray-400 truncate tabular-nums">{formatAvailWindow(a)}</div>;
                              })()}
                            </div>
                          </div>
                          {cap && (
                            <div className="mt-1.5">
                              <div className="flex items-baseline justify-center gap-1.5 whitespace-nowrap leading-tight">
                                <span className={`text-[11px] font-bold ${cap.overCapacity ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>{cap.weekTotal} / {cap.capacity}h</span>
                                {cap.overCapacity
                                  ? <span className="text-[10px] font-bold text-red-500">+{Math.round((cap.weekTotal - cap.capacity) * 10) / 10}h</span>
                                  : <span className="text-[10px] text-gray-400">{t('views.JobSchedulingView.hoursFree', { remaining: cap.remaining })}</span>}
                              </div>
                              <div className="mt-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                                <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    }
                  : undefined}
              />
            </div>
            {!panelOpen && (
              <JobsPanel
                title={t('views.JobSchedulingView.jobsToday')}
                jobs={dayModel.jobs}
                emptyLabel={t('views.JobSchedulingView.noJobsToday')}
                allStaffedLabel={t('views.JobSchedulingView.allJobsStaffed')}
                onSelectJob={(id) => { const j = jobs.find(x => x.id === id); if (j) setSelectedJob(j); }}
              />
            )}
          </div>
        ) : scale === 'day' ? (
          // Day + Board: the timeline, with the same day header (no crew total).
          <div>
            <DayCrewHeader dayKey={selectedDayKey} weather={settings.scheduling?.mockWeather} />
            <DayBoard
              lanes={dayLanes}
              dayKey={selectedDayKey}
              config={workConfig}
              canReschedule={canReschedule}
              rainDays={settings.scheduling?.rainDays}
              weather={settings.scheduling?.mockWeather}
              onViewJob={(id) => { const j = jobs.find(x => x.id === id); if (j) setSelectedJob(j); }}
              onChangeDayWindow={handleChangeDayWindow}
              onMarkRainDay={handleMarkRainDay}
              laneBreaks={view === 'member' && showAvailability
                ? (laneId) => resolveBreaks(allStaff.find(m => m.id === laneId)?.schedule?.[selectedDayKey], settings.scheduling?.defaultBreaks ?? [])
                : undefined}
              renderRowLabel={
                view === 'member'
                ? (lane) => {
                    const emp = allStaff.find(s => s.id === lane.crewId);
                    return (
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden border border-white dark:border-gray-600 shrink-0">
                          {emp?.photo ? <img src={emp.photo} alt={emp.name} className="w-full h-full object-cover" /> : <User className="w-full h-full p-1.5 text-gray-400" />}
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-sm truncate">{lane.crewName}</div>
                          {lane.inactive
                            ? <div className="text-[11px] text-amber-500 truncate">{t('views.JobSchedulingView.inactive')}</div>
                            : emp?.role && <div className="text-[11px] text-gray-400 truncate">{emp.role}</div>}
                          {!lane.inactive && showAvailability && (() => {
                            const a = resolveDayAvailability(emp ?? { id: lane.crewId, name: lane.crewName, role: '' }, selectedDayKey, availWindow);
                            return <div className="text-[11px] text-gray-400 truncate tabular-nums">{formatAvailWindow(a)}</div>;
                          })()}
                        </div>
                      </div>
                    );
                  }
                : undefined}
            />
          </div>
        ) : scale === 'month' ? (
          <MonthBoard
            weeks={monthWeeks}
            jobs={monthJobs}
            config={workConfig}
            colorForJob={(j) => jobColor(j.id)}
            canReschedule={canReschedule}
            onSelectJob={(id) => { const j = jobs.find(x => x.id === id); if (j) setSelectedJob(j); }}
            onDropJob={handleDropJob}
          />
        ) : (
        <ProductionBoard
          lanes={boardLanes}
          weekDays={boardWeekDays}
          config={workConfig}
          canReschedule={canReschedule}
          staff={allStaff}
          pendingIds={pendingIds}
          rainDays={settings.scheduling?.rainDays}
          weather={settings.scheduling?.mockWeather}
          onDropJob={handleDropJob}
          onMarkRainDay={handleMarkRainDay}
          onViewJob={(id) => { const j = jobs.find(x => x.id === id); if (j) setSelectedJob(j); }}
          onMoveJob={(id) => { const j = jobs.find(x => x.id === id); if (j) setMoveJob(j); }}
          renderRowLabel={
            view === 'member'
            ? (lane) => {
                const emp = allStaff.find(s => s.id === lane.crewId);
                return (
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden border border-white dark:border-gray-600 shrink-0">
                      {emp?.photo ? <img src={emp.photo} alt={emp.name} className="w-full h-full object-cover" /> : <User className="w-full h-full p-1.5 text-gray-400" />}
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-sm truncate">{lane.crewName}</div>
                      {lane.inactive
                        ? <div className="text-[11px] text-amber-500 truncate">{t('views.JobSchedulingView.inactive')}</div>
                        : emp?.role && <div className="text-[11px] text-gray-400 truncate">{emp.role}</div>}
                    </div>
                  </div>
                );
              }
            : undefined}
          renderCellExtra={view === 'member' && showAvailability
            ? (laneId, dayKey) => {
                const emp = allStaff.find(s => s.id === laneId);
                if (!emp) return null;
                const a = resolveDayAvailability(emp, dayKey, availWindow);
                return <AvailabilityBadge avail={a} className="absolute top-1 right-1" />;
              }
            : undefined}
          onCellActivate={view === 'member'
            ? (laneId, dayKey) => {
                const emp = allStaff.find(s => s.id === laneId);
                if (emp) openAvailabilityModal(emp, new Date(`${dayKey}T00:00:00`));
              }
            : undefined}
        />
        )}
        </div>

        {view === 'job' && (
          <UnscheduledJobsPanel
            cards={unscheduledCards}
            canReschedule={canReschedule}
            onSelectJob={(id) => { const j = jobs.find(x => x.id === id); if (j) setSelectedJob(j); }}
          />
        )}

        <SingleJobMoveDrawer
            isOpen={!!moveJob}
            onClose={() => setMoveJob(null)}
            job={moveJob}
            jobs={jobs}
            config={workConfig}
            referenceDate={referenceDate}
            onApply={(changes, label) => {
                const anchorIso = changes
                  .filter(c => !c.skipped && c.oldStart)
                  .map(c => c.oldStart!)
                  .sort()[0];
                const recompute = anchorIso
                  ? (days: number) => shiftJobsFromPoint(jobs, anchorIso, days, 'days', workConfig)
                  : undefined;
                const firstDelay = changes.find(c => !c.skipped && c.oldStart && c.newStart);
                const delayDays = firstDelay
                  ? Math.max(0, Math.round((new Date(firstDelay.newStart).getTime() - new Date(firstDelay.oldStart!).getTime()) / 86_400_000))
                  : undefined;
                preview.stage({ changes, label, mode: 'bulk', commit: (eff) => onApplySchedule(eff, label), recompute, delayDays });
                setMoveJob(null);
            }}
        />

        <ReschedulePreviewPanel
            staged={stagedWithPinnedDays}
            issues={issues}
            hoursWarnings={hoursWarnings}
            suggestions={suggestions}
            impact={impact}
            manage={manageBundle}
            onApply={() => {
              const s = preview.staged;
              if (!s) return;
              // Management mode: commit the draft job's shifts + any cascade followers.
              if (s.draftJob) {
                onUpdateJob(s.draftJob);
                const followers = s.changes.filter(c => !c.skipped);
                if (followers.length) onApplySchedule(followers, s.label);
                preview.clear();
                return;
              }
              const adjusted = s.changes.map(c => {
                if (c.skipped) return c;
                const edits = dailyHoursEdits[c.jobId];
                const stagedCrew = stagedCrewByJob[c.jobId];
                // Crew reassignment is committed straight onto the job (the change
                // doesn't carry it).
                if (stagedCrew) {
                  const job = jobs.find(j => j.id === c.jobId);
                  if (job) onUpdateJob(applyStagedCrew(job, stagedCrew));
                }
                // Shift changes carry their own per-shift windows (from the resolver or
                // the drag). The job-level `dailyHoursEdits` map is keyed by jobId, so
                // baking it here would clobber every shift of the job with one window —
                // commit shift changes as-is.
                if (c.shiftId) return c;
                // Fold per-day edits into the change's windows so the commit persists
                // them (applyChangeToJob merges change.dailyHours onto the job) —
                // matching what the preview showed via withStagedWindow.
                return edits
                  ? { ...applyDailyHours(c, edits), dailyHours: { ...c.dailyHours, ...edits } }
                  : c;
              });
              s.commit(adjusted);
              preview.clear();
            }}
            onCancel={() => preview.clear()}
            onAutoFix={handleAutoFix}
            onPreviewAutoFix={handlePreviewAutoFix}
            onCancelAutoFix={handleCancelAutoFix}
            onChangeDelay={handleChangeDelay}
            dailyHoursEdits={dailyHoursEdits}
            onChangeDailyHour={handleChangeDailyHour}
            onChangeJobDate={handleChangeJobDate}
            onShiftStartTime={handleShiftStartTime}
            crewByJob={crewByJob}
            onReassignCrew={handleReassignCrew}
            statsByJob={statsByJob}
            clientNameByJob={clientNameByJob}
            nonWorkingWeekdays={workConfig.weekendDays}
            cascade={cascade}
            onToggleCascade={handleToggleCascade}
            keepExistingDaysAsIs={keepExistingDaysAsIs}
            onToggleKeepExistingDays={setKeepExistingDaysAsIs}
            followingJobs={cascadeFollowers}
            cascadeUntil={cascadeUntil}
            onChangeCascadeUntil={handleChangeCascadeUntil}
            protectedJobs={cascadeProtected}
            leapfrogJobNames={cascadeLeapfrogNames}
            conflictResolutions={conflictResolutions}
            onMoveConflicts={handleMoveConflicts}
        />

        <JobDetailsPanel
            job={selectedJob}
            client={selectedJob ? (clients.find(c => c.id === selectedJob.clientId) ?? null) : null}
            allStaff={allStaff}
            disableClose={!!jobToCancel}
            onClose={() => setSelectedJob(null)}
            onReschedule={handleRescheduleJob}
            onCancel={(id) => { const j = jobs.find(x => x.id === id); if (j) setJobToCancel(j); }}
            onViewFullDetails={(id) => { setSelectedJob(null); onViewJob?.(id); }}
            onUpdateJob={(updated) => { onUpdateJob(updated); setSelectedJob(updated); }}
            extraActions={props.renderJobActions}
        />

        <ConfirmationModal
            isOpen={!!jobToCancel}
            onClose={() => setJobToCancel(null)}
            onConfirm={handleConfirmCancel}
            title={t('views.JobSchedulingView.cancelJobTitle')}
            message={t('views.JobSchedulingView.cancelJobMessage')}
            confirmLabel={t('views.JobSchedulingView.cancelJobConfirm')}
            cancelLabel={t('views.JobSchedulingView.cancelJobKeep')}
            variant="danger"
        />

        <AssignHoursModal
            isOpen={!!assignMemberId}
            memberName={allStaff.find(s => s.id === assignMemberId)?.name ?? ''}
            jobs={assignableJobs}
            lockedJobId={assignJobId ?? undefined}
            getDays={getAssignDays}
            getNoDaysReason={getAssignNoDaysReason}
            getWarnings={getAssignWarnings}
            getProgress={getAssignProgress}
            onEditBreaks={(dateKey) => { if (assignMemberId) setBreakEdit({ memberId: assignMemberId, dateKey }); }}
            hidden={!!breakEdit || !!pickerJobId}
            onClose={() => { setAssignMemberId(null); setAssignJobId(null); setAssignShiftId(undefined); }}
            onSubmit={handleAssignDaysSubmit}
        />

        {/* Choose the target shift when a job with 2+ shifts is dropped on a member.
            Picking sets assignShiftId and closes the picker, revealing Assign Hours. */}
        {pickerJobId && (() => {
          const job = jobs.find(j => j.id === pickerJobId);
          if (!job) return null;
          return (
            <ShiftPickerModal
              open
              job={job}
              onClose={() => { setPickerJobId(null); setAssignMemberId(null); setAssignJobId(null); setAssignShiftId(undefined); }}
              onPick={(shiftId) => {
                if (shiftId === 'new') {
                  const id = `alloc-${Date.now()}`;
                  onUpdateJob(upsertAllocation(job, newShift(id, job)));
                  setAssignShiftId(id);
                } else {
                  setAssignShiftId(shiftId);
                }
                setPickerJobId(null);
              }}
            />
          );
        })()}

        {/* Break editor — rendered last so it stacks above the Assign Hours modal when
            opened from a day row (all modals share the same z-index). */}
        {breakEdit && (() => {
          const member = allStaff.find(m => m.id === breakEdit.memberId);
          if (!member) return null;
          const defaults = settings.scheduling?.defaultBreaks ?? [];
          const entry = member.schedule?.[breakEdit.dateKey];
          const persist = (updated: CrewMember) => { onEditEmployee(updated); setBreakEdit(null); };
          return (
            <BreakEditorModal
              memberName={member.name}
              dateKey={breakEdit.dateKey}
              initialBreaks={resolveBreaks(entry, defaults)}
              isDefault={entry?.breaksOverride === undefined}
              onClose={() => setBreakEdit(null)}
              onSave={(breaks) => persist(setMemberDayBreaks(member, breakEdit.dateKey, breaks))}
              onResetToDefault={() => persist(setMemberDayBreaks(member, breakEdit.dateKey, undefined))}
            />
          );
        })()}
    </div>
  );
};

