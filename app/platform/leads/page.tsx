'use client';

/*
  Admin Portal › Leads. Contractors Estimate Master is selling to: stage,
  presentation and rep. New leads, presentations and Pending feed the
  dashboard's Pipeline Performance strip, the Presentations card and the
  calendar. "Start a trial" opens a Trial subscriber. ?open=<id> opens one.
*/
import React, { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { PlatformShell } from '@/components/platform/PlatformShell';
import { LEAD_STAGES, LeadModal, StatusBadge, TableCard, td, th, useStaff } from '@/components/platform/AdminParts';
import { EmptyState, PageHeader, PillFilter, SearchInput } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/Modals/Modal';
import { useToast } from '@/components/ui/toast';
import { useCollection } from '@/lib/store';
import { longDate } from '@/lib/utils';
import type { PlatformLead } from '@/lib/types';

export default function PlatformLeadsPage() {
  return <PlatformShell title="Leads"><Leads /></PlatformShell>;
}

function Leads() {
  const params = useSearchParams();
  const router = useRouter();
  const leads = useCollection('platformLeads');
  const { nameOf } = useStaff();
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('all');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<PlatformLead>();
  const editing = leads.items.find((l) => l.id === params.get('open'));

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return [...leads.items]
      .filter((l) => (stage === 'all' || l.stage === stage) && (!t || `${l.company} ${l.contactName} ${l.email}`.toLowerCase().includes(t)))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [leads.items, q, stage]);

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle="Painting businesses in the sales pipeline."
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)} className="w-full shadow-xl shadow-primary-500/20 md:w-auto">Add lead</Button>}
      />
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SearchInput value={q} onChange={setQ} placeholder="Search company, contact or email" className="lg:max-w-md" />
        <PillFilter options={[{ value: 'all', label: 'All' }, ...LEAD_STAGES.map((s) => ({ value: s, label: s }))]} value={stage} onChange={setStage} />
      </div>
      {shown.length === 0 ? (
        <EmptyState title="No leads" message="Add a lead, or change the search or filter." />
      ) : (
        <TableCard>
          <thead className="border-b border-gray-100 bg-gray-50">
            <tr><th className={th}>Company</th><th className={th}>Stage</th><th className={th}>Presentation</th><th className={th}>Created</th><th className={th}>Rep</th><th className={th}><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            {shown.map((l) => (
              <tr key={l.id} onClick={() => router.push(`/platform/leads?open=${l.id}`)} className="cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50">
                <td className={td}><span className="block font-bold text-gray-900">{l.company}</span><span className="text-xs text-gray-500">{l.contactName}{l.email ? ` · ${l.email}` : ''}</span></td>
                <td className={td}><StatusBadge status={l.stage} /></td>
                <td className={td}>{l.presentationAt ? new Date(l.presentationAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—'}</td>
                <td className={td}>{longDate(l.createdAt)}</td>
                <td className={td}>{nameOf(l.repId)}</td>
                <td className={td}>
                  <button type="button" onClick={(e) => { e.stopPropagation(); setRemoving(l); }} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${l.company}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}
      {(adding || editing) && <LeadModal key={editing?.id ?? 'new'} lead={editing} onClose={() => { setAdding(false); if (editing) router.replace('/platform/leads'); }} />}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(v) => !v && setRemoving(undefined)}
        title={`Delete ${removing?.company}?`}
        message="The lead is removed. A subscriber made from it stays."
        onConfirm={() => { if (removing) { leads.remove(removing.id); toast(`${removing.company} deleted`); } }}
      />
    </>
  );
}
