import React, { useEffect, useState } from 'react';
import { X, MapPin, Calendar, Lock, ChevronRight, User, Clock, Pencil, Flag, Activity } from 'lucide-react';
import { Job, Client, CrewMember, JobStage, JobPriority, JobNote } from '../../../types';
import { toLocalDateKey, allocDayWindow, allocCoversDay } from '../../../services/scheduleEngine';
import { jobDayWindow, fmtClock } from '../../../services/productionBoard';
import { Button, Badge } from '../../UI';
import { PrioritySelect, PriorityPill } from './PrioritySelect';
import { JobNotes } from './JobNotes';
import { useTranslation } from '../../../i18n/LanguageContext';

interface JobDetailsPanelProps {
  job: Job | null;
  client?: Client | null;
  allStaff: CrewMember[];
  /** When true (e.g. a confirmation dialog is open over the panel), Esc/backdrop
   *  must not dismiss the panel so it doesn't close out from under the dialog. */
  disableClose?: boolean;
  onClose: () => void;
  onReschedule: (jobId: string) => void;
  onCancel: (jobId: string) => void;
  onViewFullDetails: (jobId: string) => void;
  /** Persist an edit made in the panel (priority, notes). */
  onUpdateJob?: (job: Job) => void;
  /** Port: extra actions under Schedule / Cancel (the app's "Send Emails"). */
  extraActions?: (jobId: string) => React.ReactNode;
}

// Pure: the patch applied when a job is cancelled.
export const cancelJobPatch = (job: Job): Job => ({
  ...job,
  stage: 'Cancelled',
  startDate: undefined,
  endDate: undefined,
});

// Pure: resolve the assigned crew for display.
export const crewSummary = (job: Job, allStaff: CrewMember[]): { count: number; names: string[]; members: CrewMember[] } => {
  const ids = job.crewMemberIds && job.crewMemberIds.length
    ? job.crewMemberIds
    : Array.from(new Set((job.allocations || []).flatMap(a => a.memberIds)));
  const members = ids
    .map(id => allStaff.find(s => s.id === id))
    .filter((m): m is CrewMember => !!m);
  // Count resolved members so the count never disagrees with the names shown.
  return { count: members.length, names: members.map(m => m.name), members };
};

// Pure: the job's ACTUAL span — earliest shift start → latest shift end (bare
// 'YYYY-MM-DD' keys) — i.e. what the user actually scheduled in the shifts, from
// either this view or the work order. Falls back to the job's own envelope dates when
// it has no allocations.
export const jobShiftSpan = (job: Job): { start?: string; end?: string } => {
  const allocs = job.allocations ?? [];
  const starts = allocs.map(a => a.startDate).filter(Boolean) as string[];
  const ends = allocs.map(a => a.endDate).filter(Boolean) as string[];
  if (!starts.length || !ends.length) return { start: job.startDate, end: job.endDate };
  return {
    start: starts.reduce((min, d) => (d < min ? d : min)),
    end: ends.reduce((max, d) => (d > max ? d : max)),
  };
};

// Pure: number of calendar days a job spans (inclusive). null when unscheduled.
export const jobDurationDays = (job: Job): number | null => {
  if (!job.startDate) return null;
  const s = new Date(job.startDate);
  const e = new Date(job.endDate || job.startDate);
  const startDay = new Date(s.getFullYear(), s.getMonth(), s.getDate()).getTime();
  const endDay = new Date(e.getFullYear(), e.getMonth(), e.getDate()).getTime();
  return Math.floor((endDay - startDay) / 86_400_000) + 1;
};

export interface JobDayWindow { dateKey: string; label: string; startTime: string; endTime: string; }

// Pure: one entry per calendar day the job spans (inclusive), each with its
// working window (per-day overrides win; otherwise the job's start/end clock).
// Empty when unscheduled.
export const jobDailySchedule = (job: Job): JobDayWindow[] => {
  if (!job.startDate) return [];
  const s = new Date(job.startDate);
  const e = new Date(job.endDate || job.startDate);
  const cur = new Date(s.getFullYear(), s.getMonth(), s.getDate());
  const last = new Date(e.getFullYear(), e.getMonth(), e.getDate());
  const days: JobDayWindow[] = [];
  while (cur.getTime() <= last.getTime()) {
    const key = toLocalDateKey(cur);
    const w = jobDayWindow(job, key)!;
    days.push({
      dateKey: key,
      label: cur.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
      startTime: w.startTime,
      endTime: w.endTime,
    });
    cur.setDate(cur.getDate() + 1);
  }
  return days;
};

// Pure: the ACTUAL daily hours — one entry per calendar day the job's SHIFTS cover,
// each day's window being the union of the shifts working that day (earliest start →
// latest end, per-shift per-day overrides honored). Days no shift covers are omitted.
// Jobs with no dated shifts fall back to their own envelope/`dailyHours`.
export const jobActualSchedule = (job: Job): JobDayWindow[] => {
  const dated = (job.allocations ?? []).filter(a => a.startDate && a.endDate);
  if (!dated.length) return jobDailySchedule(job);
  const first = dated.reduce((min, a) => (a.startDate < min ? a.startDate : min), dated[0].startDate);
  const last = dated.reduce((max, a) => (a.endDate > max ? a.endDate : max), dated[0].endDate);
  // Iterate on local dates so DST-shifted days still advance one calendar day at a time.
  const cur = new Date(`${first}T12:00:00`);
  const end = new Date(`${last}T12:00:00`);
  const days: JobDayWindow[] = [];
  while (cur.getTime() <= end.getTime()) {
    const key = toLocalDateKey(cur);
    const windows = dated
      .filter(a => allocCoversDay(a, key))
      .map(a => allocDayWindow(a, key));
    if (windows.length) {
      days.push({
        dateKey: key,
        label: cur.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
        startTime: windows.reduce((min, w) => (w.startTime < min ? w.startTime : min), windows[0].startTime),
        endTime: windows.reduce((max, w) => (w.endTime > max ? w.endTime : max), windows[0].endTime),
      });
    }
    cur.setDate(cur.getDate() + 1);
  }
  return days;
};

const STAGE_COLOR: Record<JobStage, 'gray' | 'blue' | 'green' | 'amber' | 'red' | 'purple'> = {
  Confirmed: 'gray',
  Scheduled: 'blue',
  'In Production': 'purple',
  'Touch Up': 'amber',
  'Ready for Inspection': 'amber',
  Completed: 'green',
  Marketing: 'gray',
  Cancelled: 'red',
};

const STAGE_DOT: Record<JobStage, string> = {
  Confirmed: 'bg-gray-400',
  Scheduled: 'bg-blue-500',
  'In Production': 'bg-purple-500',
  'Touch Up': 'bg-amber-500',
  'Ready for Inspection': 'bg-amber-500',
  Completed: 'bg-green-500',
  Marketing: 'bg-gray-400',
  Cancelled: 'bg-red-500',
};

const fmtDate = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : null;

type Tab = 'details' | 'notes';
const TABS: { id: Tab; label: string }[] = [
  { id: 'details', label: 'Details' },
  { id: 'notes', label: 'Notes' },
];

// A group heading for the schedule section.
const SectionHeader = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[11px] font-black uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500 pt-1">{children}</div>
);

// One labelled row in the Details tab: leading icon, fixed-width label, value.
const Row = ({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) => (
  <div className="flex items-start gap-3">
    <Icon className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
    <div className="w-24 shrink-0 text-sm text-gray-500 dark:text-gray-400">{label}</div>
    <div className="flex-1 min-w-0 text-sm font-medium text-gray-900 dark:text-white">{children}</div>
  </div>
);

export const JobDetailsPanel = ({
  job, client, allStaff, disableClose, onClose, onReschedule, onCancel, onViewFullDetails, onUpdateJob, extraActions,
}: JobDetailsPanelProps) => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>('details');

  // Reset to the Details tab when a different job opens.
  useEffect(() => { setTab('details'); }, [job?.id]);

  useEffect(() => {
    if (!job || disableClose) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [job, disableClose, onClose]);

  if (!job) return null;

  // ACTUAL schedule follows the shifts: evaluate against a job whose envelope is the
  // shift span (min start → max end), anchored at local noon so a bare date key doesn't
  // roll back a day in negative-offset zones. Falls back to the job's own dates when it
  // has no shifts.
  const actualSpan = jobShiftSpan(job);
  const anchorDate = (d?: string) => (d ? (d.includes('T') ? d : `${d}T12:00:00`) : d);
  const effJob: Job = { ...job, startDate: anchorDate(actualSpan.start), endDate: anchorDate(actualSpan.end) };
  const actualStart = fmtDate(effJob.startDate);
  // End date falls back to the start date for single-day jobs (endDate may be unset).
  const actualEnd = fmtDate(effJob.endDate || effJob.startDate);
  const durationDays = jobDurationDays(effJob);
  // Daily hours come from the shifts themselves — the noon-anchored envelope above
  // carries no real clock, so it must never be the source for the hours.
  const schedule = jobActualSchedule(job);

  const priority: JobPriority = job.priority || 'Normal';
  const editable = !!onUpdateJob;
  const notes = job.notes ?? [];
  const setPriority = (p: JobPriority) => onUpdateJob?.({ ...job, priority: p });
  const setNotes = (n: JobNote[]) => onUpdateJob?.({ ...job, notes: n.length ? n : undefined });

  return (
    <div className="fixed inset-0 z-50 flex justify-end pointer-events-none">
      {/* Backdrop — only on narrow screens; on lg the panel docks and the calendar resizes beside it */}
      <div className="absolute inset-0 bg-black/30 pointer-events-auto lg:hidden" onClick={disableClose ? undefined : onClose} />

      {/* Panel */}
      <div className="relative w-full sm:w-[440px] sm:max-w-none h-full bg-white dark:bg-gray-900 shadow-2xl border-l border-gray-200 dark:border-gray-800 flex flex-col pointer-events-auto animate-in slide-in-from-right duration-300">
        {/* Header */}
        <div className="px-5 pt-5 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${STAGE_DOT[job.stage]}`} />
              <h2 className="text-xl font-black text-gray-900 dark:text-white truncate">{job.name}</h2>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="text-sm font-medium text-gray-400 mt-1 ml-[1.25rem]">{t('views.JobScheduling.JobDetailsPanel.jobNumber', { number: job.jobNumber })}</div>

          {/* Tabs */}
          <div className="flex items-center gap-5 mt-3 -mb-px">
            {TABS.map(tabItem => (
              <button
                key={tabItem.id}
                onClick={() => setTab(tabItem.id)}
                className={`pb-2.5 text-sm font-bold border-b-2 transition-colors ${
                  tab === tabItem.id
                    ? 'border-primary-600 text-primary-600 dark:text-primary-400 dark:border-primary-400'
                    : 'border-transparent text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                }`}
              >
                {tabItem.id === 'details' ? t('views.JobScheduling.JobDetailsPanel.tabDetails') : t('views.JobScheduling.JobDetailsPanel.tabNotes')}
                {tabItem.id === 'notes' && notes.length > 0 && <span className="ml-1.5 inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-primary-500 text-white text-[10px] font-black align-middle">{notes.length}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'details' && (
            <div className="space-y-4">
              <Row icon={User} label={t('views.JobScheduling.JobDetailsPanel.customer')}>
                {client?.name || t('views.JobScheduling.JobDetailsPanel.unknownCustomer')}
                {client?.phone && <span className="font-normal text-gray-500"> · {client.phone}</span>}
              </Row>

              <Row icon={MapPin} label={t('views.JobScheduling.JobDetailsPanel.address')}>
                <span className="whitespace-pre-line">{job.address}</span>
              </Row>

              {/* Schedule — derived from the shifts (read-only). */}
              <SectionHeader>{t('views.JobScheduling.JobDetailsPanel.actualSchedule')}</SectionHeader>

              <Row icon={Calendar} label={t('views.JobScheduling.JobDetailsPanel.startDate')}>
                {actualStart || <span className="font-normal text-gray-400">{t('views.JobScheduling.JobDetailsPanel.notScheduled')}</span>}
              </Row>

              <Row icon={Calendar} label={t('views.JobScheduling.JobDetailsPanel.endDate')}>
                {actualEnd || <span className="font-normal text-gray-400">{t('views.JobScheduling.JobDetailsPanel.notScheduled')}</span>}
              </Row>

              <Row icon={Clock} label={t('views.JobScheduling.JobDetailsPanel.duration')}>
                {durationDays != null
                  ? (durationDays === 1
                      ? t('views.JobScheduling.JobDetailsPanel.durationSingular')
                      : t('views.JobScheduling.JobDetailsPanel.durationPlural', { count: durationDays }))
                  : <span className="font-normal text-gray-400">—</span>}
              </Row>

              <Row icon={Clock} label={t('views.JobScheduling.JobDetailsPanel.dailyHours')}>
                {schedule.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {schedule.map(d => (
                      <div key={d.dateKey} className="flex items-center justify-between gap-3">
                        <span className="font-normal text-gray-500 dark:text-gray-400">{d.label}</span>
                        <span className="tabular-nums">{fmtClock(d.startTime)} – {fmtClock(d.endTime)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="font-normal text-gray-400">{t('views.JobScheduling.JobDetailsPanel.notScheduled')}</span>
                )}
              </Row>

              <Row icon={Pencil} label={t('views.JobScheduling.JobDetailsPanel.jobType')}>
                {job.category || <span className="font-normal text-gray-400">—</span>}
              </Row>

              <Row icon={Flag} label={t('views.JobScheduling.JobDetailsPanel.priority')}>
                {editable
                  ? <PrioritySelect value={priority} onChange={setPriority} />
                  : <PriorityPill priority={priority} />}
              </Row>

              <Row icon={Activity} label={t('views.JobScheduling.JobDetailsPanel.status')}>
                <Badge color={STAGE_COLOR[job.stage]}>{job.stage}</Badge>
              </Row>

              {job.is_locked && (
                <Row icon={Lock} label={t('views.JobScheduling.JobDetailsPanel.locked')}>
                  <span className="font-normal text-gray-500">{t('views.JobScheduling.JobDetailsPanel.lockedDescription')}</span>
                </Row>
              )}
            </div>
          )}

          {tab === 'notes' && (
            editable
              ? <JobNotes notes={notes} onChange={setNotes} fill />
              : (
                <div className="space-y-2">
                  {notes.length > 0
                    ? notes.map(n => (
                        <div key={n.id} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/60 p-3">
                          <p className="text-sm text-gray-800 dark:text-gray-100 whitespace-pre-line break-words">{n.text}</p>
                        </div>
                      ))
                    : <p className="text-sm text-gray-400 text-center py-16">{t('views.JobScheduling.JobDetailsPanel.noNotesYet')}</p>}
                </div>
              )
          )}
        </div>

        {/* Actions */}
        <div className="p-5 border-t border-gray-100 dark:border-gray-800 space-y-2">
          <Button onClick={() => onReschedule(job.id)} className="w-full justify-center">{job.startDate ? t('views.JobScheduling.JobDetailsPanel.viewShifts') : t('views.JobScheduling.JobDetailsPanel.scheduleJob')}</Button>
          {job.startDate && extraActions?.(job.id)}
          <Button variant="danger" onClick={() => onCancel(job.id)} className="w-full justify-center">{t('views.JobScheduling.JobDetailsPanel.cancelJob')}</Button>
          <button
            onClick={() => onViewFullDetails(job.id)}
            className="w-full flex items-center justify-center gap-1 pt-2 text-sm font-bold text-primary-600 dark:text-primary-400 hover:underline"
          >
            {t('views.JobScheduling.JobDetailsPanel.viewFullDetails')} <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
