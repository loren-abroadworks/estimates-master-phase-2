'use client';

/*
  Small pieces of the Workflows screens (Figma: EMTS Automation (Workflows)):
  the status pill, the workflow icon tile and trigger labels.
*/
import type { Automation, AutomationTrigger } from '@/lib/automations/types';
import { triggerDef } from '@/lib/automations/registry';
import { TRIGGER_PRESETS } from '@/lib/automations/menu';
import { triggerPhrase } from '@/lib/automations/summary';
import { cn } from '@/lib/utils';

export type WorkflowStatus = 'Published' | 'Draft' | 'Error' | 'Archived';

/** Published = deployed and on. Error = on, with failed runs. Draft = off or never published. */
export function statusOf(a: Automation, failedRuns: number): WorkflowStatus {
  if (a.isArchived) return 'Archived';
  if (a.isEnabled && a.deployedAt) return failedRuns > 0 ? 'Error' : 'Published';
  return 'Draft';
}

export function StatusPill({ status }: { status: WorkflowStatus }) {
  const tone = { Published: 'bg-green-50 text-green-700', Error: 'bg-red-50 text-red-700', Draft: 'bg-gray-100 text-gray-600', Archived: 'bg-gray-100 text-gray-500' }[status];
  const dot = { Published: 'bg-green-600', Error: 'bg-red-600', Draft: 'bg-gray-500', Archived: 'bg-gray-400' }[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold', tone)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', dot)} aria-hidden />{status}
    </span>
  );
}

/** The trigger's name as the Add trigger panel shows it. */
export function triggerLabel(t?: AutomationTrigger): string {
  if (!t?.type) return 'No trigger yet';
  const preset = TRIGGER_PRESETS.find((p) => p.type === t.type && p.module === t.module && Object.entries(p.config ?? {}).every(([k, v]) => ['days', 'amount', 'months', 'unit', 'direction'].includes(k) || t.config[k] === v));
  if (preset) return preset.label;
  // No preset for this exact setting: read it out ("Estimate reaches Accepted").
  return triggerPhrase(t).replace(/^When (a|an|the) /, '').replace(/^./, (x) => x.toUpperCase()) || triggerDef(t.type)?.title || t.type;
}

export function triggerIcon(t?: AutomationTrigger): string {
  if (!t?.type) return 'Zap';
  return TRIGGER_PRESETS.find((p) => p.type === t.type && p.module === t.module)?.icon ?? 'Zap';
}

export const longDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
