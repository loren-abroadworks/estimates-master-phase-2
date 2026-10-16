import { describe, it, expect } from 'vitest';
import { computeJobStats } from './jobStats';
import type { Job, WorkOrder } from '../types';

const job = (over: Partial<Job> = {}): Job => ({
  id: 'j1', jobNumber: 'J-1', name: 'Job 1', stage: 'Scheduled',
  startDate: '2026-06-01T08:00:00', endDate: '2026-06-01T17:00:00',
  ...over,
} as Job);

const wo = (over: Partial<WorkOrder> = {}): WorkOrder => ({
  id: 'WO-100', totalProductionHours: 40, tasks: [],
  ...over,
} as WorkOrder);

describe('computeJobStats', () => {
  it('pulls work order number, est hours, and rendered hours from the linked work order', () => {
    const w = wo({ id: 'WO-100', totalProductionHours: 40, tasks: [{ actualHours: 5 } as any, { actualHours: 3 } as any] });
    const stats = computeJobStats(job({ workOrderId: 'WO-100' }), [w]);
    expect(stats.workOrderNumber).toBe('WO-100');
    expect(stats.estHours).toBe(40);
    expect(stats.renderedHours).toBe(8);
  });

  it('computes assigned hours as days × daily hours × member count across allocations', () => {
    const j = job({
      allocations: [{ id: 'a', name: 'x', startDate: '2026-06-01', endDate: '2026-06-02', startTime: '08:00', endTime: '17:00', memberIds: ['m1', 'm2'] }],
    });
    // 2 days × 9h × 2 members = 36
    expect(computeJobStats(j, []).assignedHours).toBe(36);
  });

  it('falls back gracefully when no work order is linked', () => {
    const stats = computeJobStats(job(), []);
    expect(stats.workOrderNumber).toBe('—');
    expect(stats.estHours).toBe(0);
    expect(stats.renderedHours).toBe(0);
    expect(stats.assignedHours).toBe(0);
  });
});
