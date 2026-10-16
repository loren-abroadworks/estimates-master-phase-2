import type { Job, WeatherKind } from '../types';
import {
  ProposedChange, WorkingTimeConfig, isNonWorkingDay, toLocalDateKey, formatDisplayDate,
  spannedDayKeys, occupiesWorkingDay,
} from './scheduleEngine';
import { detectIssues, jobsShareCrew } from './rescheduleIssues';

export interface Suggestion {
  id: string;
  jobId: string;
  label: string;
  change: ProposedChange;
}

interface SuggestionOpts {
  mockWeather: Record<string, WeatherKind>;
  capacityHours: number;
}

const BAD_WEATHER: WeatherKind[] = ['rain', 'storm', 'snow'];

/**
 * For each non-skipped staged change that currently has a detected issue,
 * propose a move to the next day that is a working day, has clear (or unknown)
 * weather, and is free of a same-day shared-member conflict in the proposed
 * world. Mock/heuristic. At most one suggestion per job.
 *
 * "Issues" include both the structural issues detected by detectIssues (weekend,
 * double-book, capacity) and bad-weather days from mockWeather, so that a job
 * landing on a rain day receives a suggestion even when no other structural
 * issue is present.
 */
export const buildSuggestions = (
  changes: ProposedChange[],
  jobs: Job[],
  config: WorkingTimeConfig,
  opts: SuggestionOpts,
): Suggestion[] => {
  const applied = changes.filter(c => !c.skipped);
  if (applied.length === 0) return [];

  // Structural issues (weekend, double-book, capacity, past-due).
  const issues = detectIssues(changes, jobs, config, opts.capacityHours);
  // past-due can't be fixed by moving FORWARD, so it alone does not flag a job.
  const flagged = new Set(issues.filter(i => i.kind !== 'past-due').map(i => i.jobId));

  // Also flag jobs landing on bad weather days (not covered by detectIssues).
  for (const c of applied) {
    const key = toLocalDateKey(new Date(c.newStart));
    if (BAD_WEATHER.includes(opts.mockWeather[key])) {
      flagged.add(c.jobId);
    }
  }

  if (flagged.size === 0) return [];

  const changeById = new Map(applied.map(c => [c.jobId, c]));
  const world: Job[] = jobs.map(j => {
    const c = changeById.get(j.id);
    return c ? { ...j, startDate: c.newStart, endDate: c.newEnd } : j;
  });
  const isBadWeather = (key: string) => BAD_WEATHER.includes(opts.mockWeather[key]);

  const suggestions: Suggestion[] = [];

  for (const c of applied) {
    if (!flagged.has(c.jobId)) continue;
    const subject = world.find(j => j.id === c.jobId);
    if (!subject) continue;
    const durMs = new Date(c.newEnd).getTime() - new Date(c.newStart).getTime();

    let candidate: Date | null = null;
    for (let i = 1; i <= 21; i++) {
      const d = new Date(c.newStart);
      d.setDate(d.getDate() + i);
      const key = toLocalDateKey(d);
      if (isNonWorkingDay(d, config)) continue;
      if (isBadWeather(key)) continue;
      // Days the job would occupy if placed here (so a multi-day job is checked
      // against every day it spans, and lands clear of multi-day jobs already there).
      const candDays = spannedDayKeys(d.toISOString(), new Date(d.getTime() + durMs).toISOString());
      const clash = world.some(other =>
        other.id !== subject.id &&
        jobsShareCrew(subject, other) &&
        candDays.some(dk => occupiesWorkingDay(other.startDate, other.endDate, dk, config)),
      );
      if (clash) continue;
      candidate = d;
      break;
    }
    if (!candidate) continue;

    candidate.setHours(config.workDayStartHour, 0, 0, 0);
    const newStart = candidate.toISOString();
    const newEnd = new Date(candidate.getTime() + durMs).toISOString();
    suggestions.push({
      id: `sugg-${c.jobId}`,
      jobId: c.jobId,
      label: `Move ${c.jobName} to ${formatDisplayDate(candidate)}`,
      change: { ...c, newStart, newEnd },
    });
    // Reflect this suggestion in the world so later suggestions avoid clashing with it.
    subject.startDate = newStart;
    subject.endDate = newEnd;
  }

  return suggestions;
};
