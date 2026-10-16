import { describe, it, expect } from 'vitest';
import { computeImpact, buildCustomerMessages } from './rescheduleImpact';
import { toLocalDateKey } from './scheduleEngine';
import type { ProposedChange } from './scheduleEngine';
import type { Job, Client, WeatherKind } from '../types';

const change = (over: Partial<ProposedChange>): ProposedChange => ({
  jobId: 'j1', jobName: 'Job 1', jobNumber: '0001',
  oldStart: '2026-06-02T08:00:00.000Z', oldEnd: '2026-06-02T16:00:00.000Z',
  newStart: '2026-06-04T08:00:00.000Z', newEnd: '2026-06-04T16:00:00.000Z',
  ...over,
});

const toKey = (iso: string) => toLocalDateKey(new Date(iso));

describe('computeImpact', () => {
  it('counts non-skipped changes and locked rows, and finds the latest new end date', () => {
    const changes: ProposedChange[] = [
      change({ jobId: 'a', newEnd: '2026-06-04T16:00:00.000Z' }),
      change({ jobId: 'b', newEnd: '2026-06-09T16:00:00.000Z' }),
      change({ jobId: 'c', skipped: 'locked', newStart: '', newEnd: '' }),
    ];
    const impact = computeImpact(changes, [], [], [], {});
    expect(impact.jobsAffected).toBe(2);
    expect(impact.lockedCount).toBe(1);
    expect(impact.newEndDate).toBe('2026-06-09T16:00:00.000Z');
  });

  it('reports the largest calendar-day delay across changed jobs', () => {
    const changes: ProposedChange[] = [
      change({ jobId: 'a', oldStart: '2026-06-02T08:00:00.000Z', newStart: '2026-06-04T08:00:00.000Z' }), // +2
      change({ jobId: 'b', oldStart: '2026-06-02T08:00:00.000Z', newStart: '2026-06-07T08:00:00.000Z' }), // +5
    ];
    expect(computeImpact(changes, [], [], [], {}).totalDelayDays).toBe(5);
  });

  it('treats a missing oldStart as zero delay', () => {
    const changes: ProposedChange[] = [change({ jobId: 'a', oldStart: null })];
    expect(computeImpact(changes, [], [], [], {}).totalDelayDays).toBe(0);
  });

  it('counts distinct crew members among changed jobs', () => {
    const jobs = [
      { id: 'a', crewMemberIds: ['m1'] },
      { id: 'b', crewMemberIds: ['m1', 'm2'] },
      { id: 'c', crewMemberIds: ['m3'] },
    ] as unknown as Job[];
    const changes: ProposedChange[] = [
      change({ jobId: 'a' }), change({ jobId: 'b' }), change({ jobId: 'c' }),
    ];
    expect(computeImpact(changes, jobs, [], [], {}).crewsAffected).toBe(3);
  });

  it('lists affected job names and resolves crew member names for hover detail', () => {
    const jobs = [
      { id: 'a', crewMemberIds: ['m1'] },
      { id: 'b', crewMemberIds: ['m2'] },
    ] as unknown as Job[];
    const staff = [
      { id: 'm1', name: 'Sarah Jones' },
      { id: 'm2', name: 'David Chen' },
    ] as unknown as Parameters<typeof computeImpact>[2];
    const changes: ProposedChange[] = [
      change({ jobId: 'a', jobName: 'Repaint Deck' }),
      change({ jobId: 'b', jobName: 'Trim Work' }),
    ];
    const impact = computeImpact(changes, jobs, staff, [], {});
    expect(impact.affectedJobNames).toEqual(['Repaint Deck', 'Trim Work']);
    expect(impact.affectedCrewNames).toEqual(['Sarah Jones', 'David Chen']);
  });

  it('reports rain/storm/snow days that changed jobs land on, with job counts', () => {
    const changes: ProposedChange[] = [
      change({ jobId: 'a', newStart: '2026-06-04T08:00:00.000Z' }),
      change({ jobId: 'b', newStart: '2026-06-04T08:00:00.000Z' }),
      change({ jobId: 'c', newStart: '2026-06-05T08:00:00.000Z' }),
    ];
    const keyA = toKey(changes[0].newStart);
    const keyC = toKey(changes[2].newStart);
    const weather = { [keyA]: 'rain' as WeatherKind, [keyC]: 'clear' as WeatherKind };
    const hits = computeImpact(changes, [], [], [], weather).weatherHits;
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ dateKey: keyA, kind: 'rain', jobCount: 2 });
  });

  it('builds one customer update per changed job, resolving client names', () => {
    const jobs = [
      { id: 'a', name: 'Exterior Repaint', clientId: 'cl1' },
      { id: 'b', name: 'Deck Stain', clientId: 'cl2' },
    ] as unknown as Job[];
    const clients = [
      { id: 'cl1', name: 'Acme Co' }, { id: 'cl2', name: 'Beta LLC' },
    ] as unknown as Client[];
    const changes: ProposedChange[] = [
      change({ jobId: 'a', jobName: 'Exterior Repaint' }),
      change({ jobId: 'b', jobName: 'Deck Stain' }),
    ];
    const updates = computeImpact(changes, jobs, [], clients, {}).customerUpdates;
    expect(updates).toHaveLength(2);
    expect(updates[0]).toMatchObject({ clientId: 'cl1', clientName: 'Acme Co', jobName: 'Exterior Repaint' });
  });
});

describe('buildCustomerMessages', () => {
  it('renders a message string per update', () => {
    const messages = buildCustomerMessages([
      { clientId: 'cl1', clientName: 'Acme Co', jobName: 'Exterior Repaint',
        oldStart: '2026-06-02T08:00:00.000Z', newStart: '2026-06-04T08:00:00.000Z' },
    ]);
    expect(messages).toHaveLength(1);
    expect(messages[0].clientName).toBe('Acme Co');
    expect(messages[0].message).toContain('Exterior Repaint');
  });
});
