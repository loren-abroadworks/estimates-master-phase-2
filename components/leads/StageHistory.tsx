'use client';

/*
  Lead detail additions (30 Sep call).
  - StageHistoryCard (CRM-M7): every stage the lead was in: stage, pipeline,
    who moved it, and when. Newest first. Production moves come from the
    lead's Production card.
  The Journey bar (CRM-C7) became the stacked trackers (PipelineTrackers.tsx).
*/
import { History } from 'lucide-react';
import type { Lead } from '@/lib/types';
import { useCollection } from '@/lib/store';
import { VersionBadge } from '@/features/components/ui';

const card = 'rounded-3xl border border-gray-200 bg-white p-6 shadow-sm';

function useLeadCard(lead: Lead) {
  const { items: cards } = useCollection('productionCards');
  return cards.find((c) => !c.removedAt && (c.leadId === lead.id || (!!lead.estimateId && c.estimateId === lead.estimateId)));
}

export function StageHistoryCard({ lead }: { lead: Lead }) {
  const { items: pipelines } = useCollection('pipelines');
  const prod = useLeadCard(lead);
  const nameOf = (id: string) => pipelines.find((p) => p.id === id)?.name ?? id;
  const rows = [...(lead.stageHistory ?? []), ...(prod?.history ?? [])].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div className={card} data-tour="crm-history">
      <div className="mb-5 flex items-center gap-2 text-gray-500">
        <History className="h-4 w-4" />
        <span className="text-xs font-bold uppercase tracking-widest">Stage history</span>
        <VersionBadge item="CRM-M7" />
      </div>
      {rows.length === 0 ? (
        <p className="text-sm italic text-gray-500">No stage changes yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs font-bold uppercase tracking-wider text-gray-500">
                <th className="py-2 pr-4">Stage</th><th className="py-2 pr-4">Pipeline</th><th className="py-2 pr-4">Moved by</th><th className="py-2">When</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((m, i) => (
                <tr key={`${m.at}-${i}`}>
                  <td className="py-2 pr-4 font-semibold text-gray-900">{m.stageName}</td>
                  <td className="py-2 pr-4 text-gray-600">{nameOf(m.pipelineId)}</td>
                  <td className="py-2 pr-4 text-gray-600">{m.by}</td>
                  <td className="whitespace-nowrap py-2 text-gray-500">{new Date(m.at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
