/*
  Adapter between the app store (lib/types) and the phase-1 Job Scheduling board
  (components/scheduling/phase1, ported as is from estimates-master-phase-1).

  Read: app records -> phase-1 records (Job, CrewMember, Client, WorkOrder).
  Write: phase-1 records -> patches for the app records.

  The board's own data (allocations with per-member daily hours, skip days,
  member windows, pinned shifts; per-day windows; per-date availability) is kept
  on the app records unchanged (Job.scheduleAllocations, Job.dailyHours,
  TeamMember.daySchedule). The app's own fields (dates, times, shifts, crew,
  status) are derived from it on every save, so the job page, work orders, the
  bridge to the feature store and crew notifications keep working.
*/
import type {
  Customer, CrewAssignment, Job as AppJob, JobNote as AppJobNote, JobShift, JobStatus, TeamMember, WorkOrder as AppWorkOrder,
} from '@/lib/types';
import type {
  Client, CrewMember, CrewScheduleEntry, Job, JobCrewAllocation, JobNote, JobStage, SchedulingSettings, WeatherKind, WorkOrder,
} from './types';
import { allocCoversDay, allocWorkedDayKeys } from './services/scheduleEngine';
import { memberShiftDayHours } from './services/crewHoursGrid';

/* ---------- small date helpers (local YYYY-MM-DD) ---------- */

const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const fromKey = (k: string) => new Date(`${k}T12:00:00`);
const addDays = (k: string, n: number) => {
  const d = fromKey(k);
  d.setDate(d.getDate() + n);
  return dayKey(d);
};
const dayRange = (start: string, end: string) => {
  const out: string[] = [];
  for (let k = start; k <= end; k = addDays(k, 1)) out.push(k);
  return out;
};
const fullName = (m: { firstName?: string; lastName?: string }) => [m.firstName, m.lastName].filter(Boolean).join(' ');

/* ---------- jobs ---------- */

const STAGE_OF: Record<JobStatus, JobStage> = {
  Unscheduled: 'Confirmed',
  Confirmed: 'Confirmed',
  Scheduled: 'Scheduled',
  'In Production': 'In Production',
  'Touch Up': 'Touch Up',
  'Ready for Inspection': 'Ready for Inspection',
  Completed: 'Completed',
  Marketing: 'Marketing',
  Cancelled: 'Cancelled',
};

/** App shifts as phase-1 allocations (used when the job has no saved allocations, or they went stale). */
function allocationsFromShifts(job: AppJob): JobCrewAllocation[] {
  const hoursOf = (shiftId: string | undefined, memberIds: string[]) => {
    const map: Record<string, Record<string, number>> = {};
    for (const c of job.crew) {
      if (!c.date || !memberIds.includes(c.memberId)) continue;
      if (shiftId ? c.shiftId !== shiftId : !!c.shiftId) continue;
      (map[c.memberId] ??= {})[c.date] = (map[c.memberId]?.[c.date] ?? 0) + c.hours;
    }
    return Object.keys(map).length ? map : undefined;
  };
  if (job.shifts?.length) {
    return job.shifts.map((s) => {
      const dailyHours: Record<string, { startTime: string; endTime: string }> = {};
      const skipDays: string[] = [];
      for (const [k, w] of Object.entries(s.dailyHours ?? {})) {
        if (w) dailyHours[k] = w;
        else skipDays.push(k);
      }
      return {
        id: s.id,
        name: s.name ?? 'Shift',
        memberIds: [...s.memberIds],
        startDate: s.startDate,
        endDate: s.endDate,
        startTime: s.startTime,
        endTime: s.endTime,
        ...(Object.keys(dailyHours).length ? { dailyHours } : {}),
        ...(skipDays.length ? { skipDays: skipDays.sort() } : {}),
        ...(hoursOf(s.id, s.memberIds) ? { hoursAssignments: hoursOf(s.id, s.memberIds) } : {}),
      };
    });
  }
  if (!job.startDate) return [];
  const memberIds = [...new Set(job.crew.map((c) => c.memberId))];
  return [{
    id: `alloc-${job.id}`,
    name: 'Crew',
    memberIds,
    startDate: job.startDate,
    endDate: job.endDate ?? job.startDate,
    startTime: job.startTime ?? '08:00',
    endTime: job.endTime ?? '17:00',
    ...(hoursOf(undefined, memberIds) ? { hoursAssignments: hoursOf(undefined, memberIds) } : {}),
  }];
}

/** Phase-1 allocations as app shifts: skip days become null day overrides. */
export function shiftsFromAllocations(allocations: JobCrewAllocation[]): JobShift[] {
  return allocations.map((a) => {
    const daily: Record<string, { startTime: string; endTime: string } | null> = { ...(a.dailyHours ?? {}) };
    for (const k of a.skipDays ?? []) daily[k] = null;
    return {
      id: a.id,
      name: a.name,
      startDate: a.startDate,
      endDate: a.endDate,
      startTime: a.startTime,
      endTime: a.endTime,
      memberIds: [...a.memberIds],
      ...(Object.keys(daily).length ? { dailyHours: daily } : {}),
    };
  });
}

/** The saved allocations still describe the job when they produce exactly its current shifts and dates. */
function savedAllocationsCurrent(job: AppJob): boolean {
  const saved = job.scheduleAllocations;
  if (!saved?.length || !job.startDate) return false;
  return JSON.stringify(shiftsFromAllocations(saved)) === JSON.stringify(job.shifts ?? []);
}

function notesToP1(job: AppJob, team: TeamMember[]): JobNote[] {
  return job.notes
    .filter((n) => n.type === 'note')
    .map((n) => {
      const author = team.find((t) => t.id === n.authorId);
      return { id: n.id, text: n.text, createdAt: n.date, ...(author ? { author: fullName(author) } : {}) };
    });
}

export function toP1Job(job: AppJob, workOrders: AppWorkOrder[], team: TeamMember[]): Job {
  const allocations = savedAllocationsCurrent(job) ? job.scheduleAllocations! : allocationsFromShifts(job);
  const wo = workOrders.find((w) => w.jobId === job.id);
  return {
    id: job.id,
    jobNumber: job.jobNumber,
    name: job.title || job.jobNumber,
    clientId: job.customerId,
    estimateId: job.estimateId ?? '',
    workOrderId: wo?.id ?? `wo-${job.id}`,
    address: job.address,
    stage: STAGE_OF[job.status] ?? 'Confirmed',
    startDate: job.startDate,
    endDate: job.endDate ?? job.startDate,
    is_locked: job.scheduleProtected || undefined,
    priority: job.priority,
    notes: notesToP1(job, team),
    crewMemberIds: [...new Set(job.crew.map((c) => c.memberId))],
    allocations,
    dailyHours: job.dailyHours,
    dateCreated: job.createdAt,
    dateCompleted: job.completedAt,
  };
}

/** Crew assignments for the app: one per member, shift and worked day, keeping each member's role. */
function crewFromAllocations(allocations: JobCrewAllocation[], prev: CrewAssignment[], nonWorkingWeekdays: number[]): CrewAssignment[] {
  const roleOf = (memberId: string) => prev.find((c) => c.memberId === memberId)?.role;
  const crew: CrewAssignment[] = [];
  let leadGiven = prev.some((c) => c.role === 'Crew Lead');
  for (const a of allocations) {
    for (const memberId of a.memberIds) {
      let role = roleOf(memberId);
      if (!role) {
        role = leadGiven ? 'Painter' : 'Crew Lead';
        leadGiven = true;
      }
      const days = a.hoursAssignments?.[memberId]
        ? Object.keys(a.hoursAssignments[memberId]!).filter((k) => allocCoversDay(a, k))
        : allocWorkedDayKeys(a, nonWorkingWeekdays);
      for (const date of days.sort()) {
        const hours = memberShiftDayHours(a, memberId, date);
        if (hours > 0) crew.push({ memberId, role, hours: Math.round(hours * 100) / 100, date, shiftId: a.id });
      }
    }
  }
  // Members on the job but on no shift keep their entry, so the crew list is not lost.
  for (const c of prev) if (!c.shiftId && !c.date && !crew.some((x) => x.memberId === c.memberId)) crew.push(c);
  return crew;
}

function statusFromP1(p1: Job, prev: AppJob): JobStatus {
  const scheduled = !!p1.startDate;
  const stage = p1.stage as JobStatus;
  if (!scheduled && (stage === 'Confirmed' || stage === 'Scheduled')) return 'Unscheduled';
  if (scheduled && stage === 'Confirmed' && (prev.status === 'Unscheduled' || prev.status === 'Confirmed')) return 'Scheduled';
  return stage;
}

function notesFromP1(p1: Job, prev: AppJob, team: TeamMember[], currentUserId: string): AppJobNote[] {
  const logs = prev.notes.filter((n) => n.type !== 'note');
  const notes = (p1.notes ?? []).map((n) => {
    const old = prev.notes.find((o) => o.id === n.id);
    const author = old?.authorId ?? team.find((t) => fullName(t) === n.author)?.id ?? currentUserId;
    return { id: n.id, date: n.createdAt, authorId: author, text: n.text, type: 'note' as const };
  });
  return [...notes, ...logs];
}

/** Patch for the app job from an edited phase-1 job. */
export function fromP1Job(p1: Job, prev: AppJob, opts: { team: TeamMember[]; currentUserId: string; nonWorkingWeekdays: number[] }): Partial<AppJob> {
  const allocations = (p1.allocations ?? []).filter((a) => a.startDate && a.endDate);
  const scheduled = !!p1.startDate && allocations.length > 0;
  const first = [...allocations].sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  const firstDay = p1.startDate?.split('T')[0];
  const firstWindow = firstDay ? p1.dailyHours?.[firstDay] ?? first?.dailyHours?.[firstDay] : undefined;
  return {
    startDate: scheduled ? p1.startDate!.split('T')[0] : undefined,
    endDate: scheduled ? (p1.endDate ?? p1.startDate)!.split('T')[0] : undefined,
    startTime: scheduled ? firstWindow?.startTime ?? first?.startTime : undefined,
    endTime: scheduled ? firstWindow?.endTime ?? first?.endTime : undefined,
    shifts: scheduled ? shiftsFromAllocations(allocations) : [],
    crew: scheduled ? crewFromAllocations(allocations, prev.crew, opts.nonWorkingWeekdays) : prev.crew.filter((c) => !c.date),
    scheduleAllocations: scheduled ? allocations : undefined,
    dailyHours: scheduled && p1.dailyHours && Object.keys(p1.dailyHours).length ? p1.dailyHours : undefined,
    status: statusFromP1(p1, prev),
    scheduleProtected: !!p1.is_locked,
    priority: p1.priority,
    notes: notesFromP1(p1, prev, opts.team, opts.currentUserId),
  };
}

/* ---------- crew members ---------- */

const WINDOW_BACK = 60;
const WINDOW_AHEAD = 240;

/** Per-date entries implied by the member's weekly schedule, working days and time off. */
function derivedSchedule(m: TeamMember, today: string): Record<string, CrewScheduleEntry> {
  const out: Record<string, CrewScheduleEntry> = {};
  const from = addDays(today, -WINDOW_BACK);
  const to = addDays(today, WINDOW_AHEAD);
  if (m.workingDays) {
    for (const k of dayRange(from, to)) {
      if (!m.workingDays.includes(fromKey(k).getDay())) out[k] = { date: k, startTime: '', endTime: '', isOff: true, reason: 'Not a working day' };
    }
  }
  for (const [weekStart, days] of Object.entries(m.schedule ?? {})) {
    days.forEach((d, i) => {
      const k = addDays(weekStart, i);
      out[k] = d.working
        ? { date: k, startTime: d.start, endTime: d.end, isOff: false }
        : { date: k, startTime: '', endTime: '', isOff: true, reason: 'Not a working day' };
    });
  }
  for (const off of m.timeOff ?? []) {
    for (const k of dayRange(off.startDate, off.endDate || off.startDate)) {
      out[k] = { date: k, startTime: '', endTime: '', isOff: true, reason: off.reason };
    }
  }
  return out;
}

export function toP1Member(m: TeamMember, today = dayKey(new Date())): CrewMember {
  return {
    id: m.id,
    name: fullName(m) || m.email,
    role: m.role,
    photo: m.photoUrl,
    email: m.email,
    phone: m.phone,
    status: m.status === 'Inactive' ? 'Inactive' : 'Active',
    color: m.color,
    schedule: { ...derivedSchedule(m, today), ...(m.daySchedule ?? {}) },
  };
}

/** Patch for the app member: keeps only the per-date entries that differ from what the member's settings imply. */
export function fromP1Member(emp: CrewMember, prev: TeamMember, today = dayKey(new Date())): Partial<TeamMember> {
  const base = derivedSchedule(prev, today);
  const daySchedule: Record<string, CrewScheduleEntry> = {};
  for (const [k, e] of Object.entries(emp.schedule ?? {})) {
    if (JSON.stringify(base[k] ?? null) !== JSON.stringify(e)) daySchedule[k] = e;
  }
  return { daySchedule: Object.keys(daySchedule).length ? daySchedule : undefined };
}

/* ---------- clients and work orders ---------- */

export function toP1Client(c: Customer): Client {
  return {
    id: c.id,
    name: fullName(c) || c.companyName || c.email,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
    address: [c.street, c.city, c.state, c.zip].filter(Boolean).join(', '),
    properties: [],
  };
}

/** The board reads a work order's hours only: the job's estimated production hours. */
export function toP1WorkOrder(job: AppJob, workOrders: AppWorkOrder[], customerName: string): WorkOrder {
  const wo = workOrders.find((w) => w.jobId === job.id);
  return {
    id: wo?.id ?? `wo-${job.id}`,
    estimateId: job.estimateId ?? '',
    clientId: job.customerId,
    version: 1,
    status: job.startDate ? 'Scheduled' : 'Unscheduled',
    jobName: job.title,
    customerName,
    customerPhone: '',
    customerEmail: '',
    jobAddress: job.address,
    accessCode: '',
    startDate: job.startDate ?? '',
    endDate: job.endDate ?? '',
    crewLeaderId: null,
    crewMemberIds: [],
    totalProductionHours: job.estimatedHours,
    tasks: [],
    paintSchedule: [],
    areasExcluded: '',
    existingConditions: '',
    toolsNeeded: '',
    materialsNeeded: '',
    fieldNotes: '',
  };
}

/* ---------- settings ---------- */

const WEATHER_CYCLE: WeatherKind[] = ['clear', 'clear', 'rain', 'clear', 'storm', 'clear', 'snow', 'rain', 'clear'];
const NEAR_TERM: WeatherKind[] = ['clear', 'rain', 'clear', 'storm', 'clear', 'clear', 'snow'];

/** Phase-1 mock forecast (no weather provider yet): a fixed pattern for the next 7 days, a cycle around it. */
export function mockWeather(today = dayKey(new Date())): Record<string, WeatherKind> {
  const out: Record<string, WeatherKind> = {};
  for (let off = -45; off <= 21; off++) {
    out[addDays(today, off)] = off >= 0 && off < NEAR_TERM.length
      ? NEAR_TERM[off]!
      : WEATHER_CYCLE[((off % WEATHER_CYCLE.length) + WEATHER_CYCLE.length) % WEATHER_CYCLE.length]!;
  }
  return out;
}

export const DEFAULT_SCHEDULING: SchedulingSettings = {
  nonWorkingWeekdays: [0, 6],
  holidays: [],
  rainDays: [],
  workDayStartHour: 8,
  workDayEndHour: 17,
  crewDailyCapacityHours: 9,
};
