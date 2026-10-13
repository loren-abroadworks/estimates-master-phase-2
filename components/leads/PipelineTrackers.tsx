'use client';

/*
  Stacked stage trackers (CRM Part 2, 10) on lead details and the contact
  page: one card per pipeline, stacked in Settings order, never side by side.
  Heading = pipeline name; right = current stage, or "Not started".

  - Clicking a later stage moves the lead forward, an earlier one moves it
    back; a toast says "{Name} moved to {Stage}" and the move is logged.
  - Sales: Lost takes Sold's place at the end once the lead is lost. "Mark as
    lost" sits on the card while it is not. Marking a lead Sold starts
    Production at its first stage when it has no Production stage yet
    (CrmSync makes the card; job creation is unchanged).
  - Production follows the lead's Production card; before the sale it reads
    "Not started" and can't be clicked.
  - Custom pipelines (dynamicPipelines on): clicking a stage puts the lead on it.
  - A lead driven by an open repaint follow-up can't be moved (NEW, 29).
  A long pipeline scrolls sideways inside its own card.
*/
import { useState } from 'react';
import type { Lead, PipelineStage } from '@/lib/types';
import { NativeSelect } from '@/components/ui/form';
import { useFollowUpLocks } from './leadFeatures';
import { useCollection } from '@/lib/store';
import { cn, fullName } from '@/lib/utils';
import { StageTracker } from '@/components/ui/StageTracker';
import { customColumnFor, pipelineColumns, salesColumnFor } from '@/features/lib/rules/lead-pipeline';
import { useVisiblePipelines } from './usePipelines';
import { useLeadActions } from './useLeadActions';

const steps = (cols: PipelineStage[]) => cols.map((s) => ({ id: s.id, label: s.displayName, color: s.color }));

/**
 * The contact page: the trackers of the contact's most recent lead, with a
 * picker when the contact has more than one.
 */
export function ContactPipelineTrackers({ leads, className }: { leads: Lead[]; className?: string }) {
  const sorted = [...leads].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const [picked, setPicked] = useState<string>();
  const lead = sorted.find((l) => l.id === picked) ?? sorted.find((l) => l.status !== 'Archived') ?? sorted[0];
  const lockOf = useFollowUpLocks();
  if (!lead) return null;
  return (
    <div className={className}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Pipelines · {lead.leadNumber}</h2>
        {sorted.length > 1 && (
          <NativeSelect value={lead.id} onChange={(e) => setPicked(e.target.value)} aria-label="Lead" className="h-9 w-56">
            {sorted.map((l) => <option key={l.id} value={l.id}>{l.leadNumber} · {l.status}</option>)}
          </NativeSelect>
        )}
      </div>
      <PipelineTrackers lead={lead} locked={!!lockOf(lead.id)} />
    </div>
  );
}

export function PipelineTrackers({ lead, locked, className }: { lead: Lead; locked?: boolean; className?: string }) {
  const pipelines = useVisiblePipelines();
  const { items: stages } = useCollection('pipelineStages');
  const { items: cards } = useCollection('productionCards');
  const actions = useLeadActions();
  const card = cards.find((c) => !c.removedAt && (c.leadId === lead.id || (!!lead.estimateId && c.estimateId === lead.estimateId)));
  const archived = lead.status === 'Archived';
  const name = fullName(lead);

  return (
    <div className={cn('space-y-4', className)} data-tour="crm-journey">
      {pipelines.map((p) => {
        const cols = pipelineColumns(stages, p.id);
        let shown = cols;
        let current: PipelineStage | undefined;
        let onSelect: ((stage: PipelineStage) => void) | undefined;
        let extra: React.ReactNode = null;
        if (p.kind === 'sales') {
          const lost = lead.status === 'Lost';
          // Lost replaces Sold at the end of the tracker once the lead is lost.
          shown = cols.filter((s) => (lost ? s.leadStatus !== 'Sold' : s.leadStatus !== 'Lost'));
          current = salesColumnFor(lead, cols);
          onSelect = (s) => {
            const message = `${name} moved to ${s.displayName}`;
            if (s.leadStatus && s.leadStatus !== lead.status) actions.changeStatus(lead, s.leadStatus, { message });
            else actions.moveToStage(lead, s);
          };
          const lostStage = cols.find((s) => s.leadStatus === 'Lost');
          if (!lost && lead.status !== 'Sold' && lostStage && !locked && !archived) {
            extra = (
              <button type="button" onClick={() => actions.changeStatus(lead, 'Lost', { message: `${name} moved to ${lostStage.displayName}` })} className="text-xs font-semibold text-gray-500 underline-offset-2 hover:text-red-600 hover:underline">
                Mark as {lostStage.displayName.toLowerCase()}
              </button>
            );
          }
        } else if (p.kind === 'production') {
          current = card ? cols.find((s) => s.id === card.stageId) : undefined;
          onSelect = card ? (s) => actions.moveProduction(lead, card, s) : undefined;
        } else {
          current = customColumnFor(lead, cols, p.id);
          onSelect = (s) => actions.moveInPipeline(lead, p.id, s);
        }
        const select = onSelect;
        return (
          <section key={p.id} className="min-w-0 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm" aria-label={`${p.name} pipeline`}>
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="font-heading text-sm font-bold uppercase tracking-wider text-gray-900">{p.name}</h3>
              <span className="flex items-center gap-3">
                {extra}
                <span className="text-sm font-semibold" style={current ? { color: current.color } : undefined}>
                  {current ? current.displayName : <span className="text-gray-500">Not started</span>}
                </span>
              </span>
            </div>
            {shown.length ? (
              <StageTracker
                steps={steps(shown)}
                current={current?.id}
                label={`${p.name} stages`}
                disabled={locked || archived || !select}
                onSelect={select ? (step) => { const s = cols.find((c) => c.id === step.id); if (s && s.id !== current?.id) select(s); } : undefined}
              />
            ) : (
              <p className="text-sm text-gray-500">No stages yet.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
