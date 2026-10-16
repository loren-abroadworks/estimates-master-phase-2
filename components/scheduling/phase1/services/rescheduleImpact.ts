import type { Job, CrewMember, Client, WeatherKind } from '../types';
import type { ProposedChange } from './scheduleEngine';
import { toLocalDateKey, formatDisplayDate } from './scheduleEngine';

const MS_PER_DAY = 86_400_000;

export interface WeatherHit { dateKey: string; kind: WeatherKind; jobCount: number; }
export interface CustomerUpdate {
  clientId: string; clientName: string; jobName: string;
  oldStart: string | null; newStart: string;
}
export interface RescheduleImpact {
  jobsAffected: number;
  crewsAffected: number;
  /** Names of the jobs that move (for hover detail). */
  affectedJobNames: string[];
  /** Names of the crew members on the moving jobs (for hover detail). */
  affectedCrewNames: string[];
  totalDelayDays: number;
  newEndDate: string | null;
  lockedCount: number;
  weatherHits: WeatherHit[];
  customerUpdates: CustomerUpdate[];
}

const memberIdsOf = (job: Job | undefined): string[] => {
  if (!job) return [];
  const ids = new Set<string>(job.crewMemberIds || []);
  job.allocations?.forEach(a => a.memberIds?.forEach(m => ids.add(m)));
  return [...ids];
};

export const computeImpact = (
  changes: ProposedChange[],
  jobs: Job[],
  staff: CrewMember[],
  clients: Client[],
  mockWeather: Record<string, WeatherKind>,
): RescheduleImpact => {
  const changed = changes.filter(c => !c.skipped);
  const lockedCount = changes.filter(c => c.skipped === 'locked').length;
  const jobById = new Map(jobs.map(j => [j.id, j]));
  const clientById = new Map(clients.map(cl => [cl.id, cl]));

  const staffById = new Map(staff.map(s => [s.id, s]));
  let newEndDate: string | null = null;
  let totalDelayDays = 0;
  const crewSet = new Set<string>();
  const affectedJobNames: string[] = [];

  for (const c of changed) {
    if (c.newEnd && (!newEndDate || c.newEnd > newEndDate)) newEndDate = c.newEnd;

    if (c.oldStart && c.newStart) {
      const deltaDays = Math.round(
        (new Date(c.newStart).getTime() - new Date(c.oldStart).getTime()) / MS_PER_DAY,
      );
      if (deltaDays > totalDelayDays) totalDelayDays = deltaDays;
    }

    affectedJobNames.push(c.jobName);
    memberIdsOf(jobById.get(c.jobId)).forEach(id => crewSet.add(id));
  }

  const affectedCrewNames = [...crewSet].map(id => staffById.get(id)?.name ?? 'Crew');

  // Bad-weather days that changed jobs land on.
  const badWeather = new Set<WeatherKind>(['rain', 'storm', 'snow']);
  const hitCounts = new Map<string, { kind: WeatherKind; jobCount: number }>();
  for (const c of changed) {
    if (!c.newStart) continue;
    const key = toLocalDateKey(new Date(c.newStart));
    const kind = mockWeather[key];
    if (!kind || !badWeather.has(kind)) continue;
    const prev = hitCounts.get(key);
    hitCounts.set(key, { kind, jobCount: (prev?.jobCount ?? 0) + 1 });
  }
  const weatherHits: WeatherHit[] = [...hitCounts.entries()]
    .map(([dateKey, v]) => ({ dateKey, kind: v.kind, jobCount: v.jobCount }))
    .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  const customerUpdates: CustomerUpdate[] = changed.map(c => {
    const job = jobById.get(c.jobId);
    const client = job ? clientById.get(job.clientId) : undefined;
    return {
      clientId: job?.clientId ?? '',
      clientName: client?.name ?? 'Customer',
      jobName: c.jobName,
      oldStart: c.oldStart,
      newStart: c.newStart,
    };
  });

  return {
    jobsAffected: changed.length,
    crewsAffected: crewSet.size,
    affectedJobNames,
    affectedCrewNames,
    totalDelayDays,
    newEndDate,
    lockedCount,
    weatherHits,
    customerUpdates,
  };
};

const fmtDay = (iso: string | null) => (iso ? formatDisplayDate(iso) : 'TBD');

export const buildCustomerMessages = (
  updates: CustomerUpdate[],
): { clientName: string; message: string }[] =>
  updates.map(u => ({
    clientName: u.clientName,
    message: `Hi ${u.clientName}, your job "${u.jobName}" has been rescheduled from ${fmtDay(u.oldStart)} to ${fmtDay(u.newStart)}.`,
  }));
