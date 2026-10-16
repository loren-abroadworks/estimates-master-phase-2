'use client';

/*
  Job Scheduling: the phase-1 prototype board (estimates-master-phase-1,
  components/views/JobSchedulingView), ported as is under
  components/scheduling/phase1 and wired to the app store here.

  Job view and Crew view; Day / Week / Month; Board and Hours modes; shifts,
  per-member daily hours, breaks, availability, rain days, weather, cascade
  reschedules with preview, bulk reschedule and undo.

  Every save goes through the adapter (components/scheduling/phase1/adapter.ts),
  which keeps the job's dates, shifts, crew hours and status in step for the
  rest of the app, then tells the crew-notification feature (Unsent changes).
*/
import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageShell } from '@/components/Navigation';
import { JobSchedulingView } from '@/components/scheduling/phase1/components/views/JobSchedulingView';
import { Toast } from '@/components/scheduling/phase1/components/UI';
import type { CrewMember, GlobalSettings, Job as P1Job } from '@/components/scheduling/phase1/types';
import type { ProposedChange } from '@/components/scheduling/phase1/services/scheduleEngine';
import { configFromSettings, toLocalDateKey } from '@/components/scheduling/phase1/services/scheduleEngine';
import { applyChangeToJobPinningPast } from '@/components/scheduling/phase1/services/shifts';
import { applyAvailabilityTrims, availabilityTrims } from '@/components/scheduling/phase1/services/availabilityTrim';
import { companyStandardDay } from '@/components/scheduling/phase1/services/crewAvailability';
import {
  DEFAULT_SCHEDULING, fromP1Job, fromP1Member, mockWeather, toP1Client, toP1Job, toP1Member, toP1WorkOrder,
} from '@/components/scheduling/phase1/adapter';
import { SendEmailsButton, UnsentChangesButton, UnsentJobsProvider, useScheduleSaved } from '@/components/scheduling/NotifyCrew';
import { useCollection, useLogActivity, useSingleton } from '@/lib/store';
import { useCurrentUser as useFeatureUser } from '@/features/lib/store';
import { can } from '@/features/lib/permissions';
import { useIsOn } from '@/features/lib/feature-visibility';
import type { Job } from '@/lib/types';

interface ToastState { id: number; message: string; onUndo?: () => void }

export default function JobSchedulingPage() {
  const router = useRouter();
  const { items: jobs, get, update } = useCollection('jobs');
  const { items: team, get: getMember, update: updateMember } = useCollection('team');
  const { items: customers } = useCollection('customers');
  const { items: workOrders } = useCollection('workOrders');
  const [savedScheduling, setScheduling] = useSingleton('schedulingSettings');
  const [currentUserId] = useSingleton('currentUserId');
  const featureUser = useFeatureUser();
  const log = useLogActivity();
  const scheduleSaved = useScheduleSaved();
  const crewEmailsOn = useIsOn({ featureKey: 'js' });
  const [toast, setToast] = useState<ToastState | null>(null);

  // QA D-03: only schedulers (office manager, owner) change the schedule (spec 04).
  const canReschedule = can(featureUser, 'workOrder.manageSchedule');

  const scheduling = savedScheduling ?? DEFAULT_SCHEDULING;
  const nonWorkingWeekdays = scheduling.nonWorkingWeekdays ?? [0, 6];
  const settings = useMemo(
    () => ({ scheduling: { ...scheduling, mockWeather: scheduling.mockWeather && Object.keys(scheduling.mockWeather).length ? scheduling.mockWeather : mockWeather() } }) as GlobalSettings,
    [scheduling],
  );

  const p1Jobs = useMemo(() => jobs.map((j) => toP1Job(j, workOrders, team)), [jobs, workOrders, team]);
  const p1Staff = useMemo(() => team.filter((m) => m.isCrew && m.status !== 'Inactive').map((m) => toP1Member(m)), [team]);
  const p1Clients = useMemo(() => customers.map(toP1Client), [customers]);
  const p1WorkOrders = useMemo(() => {
    const names = new Map(p1Clients.map((c) => [c.id, c.name]));
    return jobs.map((j) => toP1WorkOrder(j, workOrders, names.get(j.customerId) ?? ''));
  }, [jobs, workOrders, p1Clients]);

  const showToast = useCallback((message: string, onUndo?: () => void) => setToast({ id: Date.now(), message, onUndo }), []);
  const dismissToast = useCallback(() => setToast(null), []);

  /** Writes edited phase-1 jobs back to the app store; returns the previous records for undo. */
  const writeJobs = useCallback((edited: P1Job[], historyText?: string) => {
    const before: Job[] = [];
    for (const p1 of edited) {
      const prev = get(p1.id);
      if (!prev) continue;
      before.push(prev);
      const patch = fromP1Job(p1, prev, { team, currentUserId, nonWorkingWeekdays });
      const history = historyText ? [...prev.history, { date: new Date().toISOString(), text: historyText }] : prev.history;
      update(prev.id, { ...patch, history });
    }
    return before;
  }, [get, update, team, currentUserId, nonWorkingWeekdays]);

  const restore = useCallback((snapshots: Job[]) => {
    for (const s of snapshots) update(s.id, s);
  }, [update]);

  // Oct 14 rules (NotifyCrew): a first schedule or someone taken off a shift is emailed; anything else waits for Send Emails.
  const afterSave = useCallback((jobIds: string[], before: Job[]) => {
    if (jobIds.length && crewEmailsOn) scheduleSaved(jobIds, before);
  }, [crewEmailsOn, scheduleSaved]);

  const onUpdateJob = useCallback((updated: P1Job) => {
    const prev = p1Jobs.find((j) => j.id === updated.id);
    const scheduleChanged = !prev || JSON.stringify([prev.startDate, prev.endDate, prev.allocations, prev.dailyHours]) !== JSON.stringify([updated.startDate, updated.endDate, updated.allocations, updated.dailyHours]);
    const before = writeJobs([updated], scheduleChanged ? 'Schedule updated on the Job Scheduling board' : undefined);
    if (scheduleChanged) afterSave([updated.id], before);
  }, [p1Jobs, writeJobs, afterSave]);

  // Same as the phase-1 app: apply every change (pinning worked days), record the
  // previous records for undo, log it, and toast with Undo.
  const onApplySchedule = useCallback((changes: ProposedChange[], label: string, extraUndo?: () => void) => {
    if (!canReschedule) {
      showToast('Only the office manager or owner changes the schedule.');
      return;
    }
    const applied = changes.filter((c) => !c.skipped);
    if (applied.length === 0 && !extraUndo) return;
    const todayKey = toLocalDateKey(new Date());
    const weekendDays = configFromSettings(settings.scheduling, false).weekendDays;
    const ids = [...new Set(applied.map((c) => c.jobId))];
    const edited = ids.flatMap((id) => {
      const job = p1Jobs.find((j) => j.id === id);
      if (!job) return [];
      return [applied.filter((c) => c.jobId === id).reduce((acc, ch) => applyChangeToJobPinningPast(acc, ch, { todayKey, nonWorkingWeekdays: weekendDays }), job)];
    });
    const before = writeJobs(edited, label);
    if (ids.length) log(`${label} (${ids.length} job${ids.length === 1 ? '' : 's'})`, ids.length === 1 ? 'job' : undefined, ids.length === 1 ? ids[0] : undefined);
    afterSave(ids, before);
    showToast(label, () => {
      restore(before);
      extraUndo?.();
      log(`Undid: ${label}`);
    });
  }, [canReschedule, settings.scheduling, p1Jobs, writeJobs, log, afterSave, showToast, restore]);

  // Saving a member's schedule trims bookings that no longer fit it (phase-1 rule).
  const onEditEmployee = useCallback((emp: CrewMember) => {
    const prevMember = getMember(emp.id);
    if (!prevMember) return;
    const prev = p1Staff.find((s) => s.id === emp.id);
    updateMember(emp.id, fromP1Member(emp, prevMember));
    const trims = availabilityTrims(p1Jobs, emp, prev, scheduling.defaultBreaks ?? []);
    if (!trims.length) return;
    const affected = new Set(trims.map((t) => t.jobId));
    const trimmed = applyAvailabilityTrims(p1Jobs, trims, nonWorkingWeekdays, companyStandardDay(scheduling)).filter((j) => affected.has(j.id));
    const before = writeJobs(trimmed, `Bookings trimmed to ${emp.name}'s availability`);
    log(`Trimmed bookings to ${emp.name}'s availability`);
    afterSave([...affected], before);
    showToast(
      trims.length === 1 ? `Trimmed 1 booking to fit ${emp.name}'s availability` : `Trimmed ${trims.length} bookings to fit ${emp.name}'s availability`,
      () => restore(before),
    );
  }, [getMember, p1Staff, updateMember, p1Jobs, scheduling, nonWorkingWeekdays, writeJobs, log, afterSave, showToast, restore]);

  const onUpdateSettings = useCallback((s: GlobalSettings) => {
    if (s.scheduling) setScheduling({ ...s.scheduling, mockWeather: undefined });
  }, [setScheduling]);

  return (
    <PageShell title="Job Scheduling" noPadding>
      <UnsentJobsProvider>
        <JobSchedulingView
          jobs={p1Jobs}
          clients={p1Clients}
          workOrders={p1WorkOrders}
          allStaff={p1Staff}
          onUpdateJob={onUpdateJob}
          onEditEmployee={onEditEmployee}
          onViewJob={(id) => router.push(`/jobs/${id}`)}
          onViewWorkOrder={(id) => {
            const wo = workOrders.find((w) => w.id === id);
            const job = p1Jobs.find((j) => j.workOrderId === id);
            if (wo) router.push(`/work-orders/${wo.id}`);
            else if (job) router.push(`/jobs/${job.id}`);
          }}
          onApplySchedule={onApplySchedule}
          onToast={(m) => showToast(m)}
          settings={settings}
          onUpdateSettings={onUpdateSettings}
          canReschedule={canReschedule}
          headerActions={<UnsentChangesButton />}
          renderJobActions={(jobId) => <SendEmailsButton jobId={jobId} />}
        />
      </UnsentJobsProvider>
      {toast && <Toast key={toast.id} message={toast.message} onUndo={toast.onUndo} onDismiss={dismissToast} />}
    </PageShell>
  );
}
