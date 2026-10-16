import { describe, it, expect } from 'vitest';
import {
  previewReducer, initialPreviewState, summarizeStaged, StagedReschedule,
} from './reschedulePreview';
import type { ProposedChange } from './scheduleEngine';

const change = (over: Partial<ProposedChange>): ProposedChange => ({
  jobId: 'j1', jobName: 'Job 1', jobNumber: 'J-1',
  oldStart: '2026-06-02T08:00:00', oldEnd: '2026-06-02T17:00:00',
  newStart: '2026-06-03T08:00:00', newEnd: '2026-06-03T17:00:00',
  ...over,
});

const staged = (changes: ProposedChange[]): StagedReschedule => ({
  changes, label: 'Test', commit: () => {}, mode: 'bulk',
});

describe('previewReducer', () => {
  it('STAGE stores the staged reschedule', () => {
    const s = previewReducer(initialPreviewState, { type: 'STAGE', payload: staged([change({})]) });
    expect(s.staged?.changes).toHaveLength(1);
  });
  it('CLEAR removes it', () => {
    const s1 = previewReducer(initialPreviewState, { type: 'STAGE', payload: staged([change({})]) });
    const s2 = previewReducer(s1, { type: 'CLEAR' });
    expect(s2.staged).toBeNull();
  });
});

describe('summarizeStaged', () => {
  it('counts changed vs skipped rows', () => {
    const sum = summarizeStaged([change({}), change({ jobId: 'j2', skipped: 'locked' })]);
    expect(sum).toEqual({ changedCount: 1, skippedCount: 1 });
  });
});

describe('previewReducer SET_CHANGES', () => {
  it('replaces the staged changes, preserving label and commit', () => {
    const c0 = change({});
    const c1 = change({ jobId: 'j2', jobName: 'Job 2' });
    const commit = () => {};
    const s1 = previewReducer(initialPreviewState, { type: 'STAGE', payload: { changes: [c0], label: 'L', commit, mode: 'edit' } });
    const s2 = previewReducer(s1, { type: 'SET_CHANGES', payload: [c0, c1] });
    expect(s2.staged?.changes).toHaveLength(2);
    expect(s2.staged?.label).toBe('L');
    expect(s2.staged?.commit).toBe(commit);
  });
  it('SET_CHANGES is a no-op when nothing is staged', () => {
    const s = previewReducer(initialPreviewState, { type: 'SET_CHANGES', payload: [change({})] });
    expect(s.staged).toBeNull();
  });
});

describe('previewReducer mode field', () => {
  const stagedWithMode: StagedReschedule = {
    changes: [], label: 'X', commit: () => {}, mode: 'edit',
  };

  it('STAGE stores the payload including its mode', () => {
    const s = previewReducer(initialPreviewState, { type: 'STAGE', payload: stagedWithMode });
    expect(s.staged?.mode).toBe('edit');
  });

  it('SET_CHANGES preserves the existing mode', () => {
    const stagedState = previewReducer(initialPreviewState, { type: 'STAGE', payload: stagedWithMode });
    const next = previewReducer(stagedState, { type: 'SET_CHANGES', payload: [] });
    expect(next.staged?.mode).toBe('edit');
  });
});

describe('previewReducer SET_DRAFT', () => {
  const stg: StagedReschedule = { changes: [], label: 'Edit', commit: () => {}, mode: 'edit', primaryJobId: 'j1' };
  const job = { id: 'j1', name: 'J' } as any;
  it('sets draftJob on the staged reschedule', () => {
    const s = previewReducer({ staged: stg }, { type: 'SET_DRAFT', payload: job });
    expect(s.staged!.draftJob).toBe(job);
  });
  it('is a no-op when nothing is staged', () => {
    expect(previewReducer(initialPreviewState, { type: 'SET_DRAFT', payload: job })).toEqual(initialPreviewState);
  });
});
