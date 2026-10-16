import type { Job, WorkOrder } from '../types';

export interface JobStats {
  workOrderNumber: string;
  estHours: number;
  assignedHours: number;
  renderedHours: number;
}

// Total hours assigned across a job's crew allocations: for each allocation,
// (days spanned) × (daily hours) × (member count). Mirrors WorkOrderView.
const assignedHoursOf = (job: Job): number =>
  (job.allocations || []).reduce((total, alloc) => {
    if (!alloc.startDate || !alloc.endDate) return total;
    const [sy, sm, sd] = alloc.startDate.split('-').map(Number);
    const [ey, em, ed] = alloc.endDate.split('-').map(Number);
    const start = new Date(sy, sm - 1, sd, 12, 0, 0);
    const end = new Date(ey, em - 1, ed, 12, 0, 0);
    const days = Math.round(Math.abs(end.getTime() - start.getTime()) / 86400000) + 1;
    const [startH, startM] = (alloc.startTime || '08:00').split(':').map(Number);
    const [endH, endM] = (alloc.endTime || '17:00').split(':').map(Number);
    const dailyHours = Math.max(0, (endH + endM / 60) - (startH + startM / 60));
    return total + days * dailyHours * (alloc.memberIds?.length || 0);
  }, 0);

// Work-order-derived stats for a job, shown in the reschedule sidebar.
// Falls back gracefully when the job has no linked work order.
export const computeJobStats = (job: Job, workOrders: WorkOrder[]): JobStats => {
  const wo = workOrders.find(w => w.id === job.workOrderId);
  return {
    workOrderNumber: wo?.id ?? '—',
    estHours: wo?.totalProductionHours ?? 0,
    assignedHours: assignedHoursOf(job),
    renderedHours: (wo?.tasks || []).reduce((sum, t) => sum + (t.actualHours || 0), 0),
  };
};
