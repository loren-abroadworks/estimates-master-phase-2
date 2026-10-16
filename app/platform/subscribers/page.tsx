'use client';

/*
  Admin Portal › Subscribers. Every organization on Estimate Master, with
  tier, billing, status and rep. Add, edit or remove; the dashboard's tier
  tiles, Active Subscribers and Pending / On Trial follow. The organization
  using this app is read live from its Settings › Subscription.
  ?status=Trial filters, ?open=<id> opens a subscriber.
*/
import React, { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { PlatformShell } from '@/components/platform/PlatformShell';
import { StatusBadge, SubscriberModal, SUB_STATUSES, TableCard, td, th, useStaff } from '@/components/platform/AdminParts';
import { EmptyState, PageHeader, PillFilter, SearchInput } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/Modals/Modal';
import { useToast } from '@/components/ui/toast';
import { useCollection, useDb } from '@/lib/store';
import { longDate, money } from '@/lib/utils';
import { platformRecords } from '@/lib/platform';
import type { PlatformSubscriber } from '@/lib/types';

export default function SubscribersPage() {
  return <PlatformShell title="Subscribers"><Subscribers /></PlatformShell>;
}

function Subscribers() {
  const params = useSearchParams();
  const router = useRouter();
  const db = useDb();
  const subs = useCollection('platformSubscribers');
  const payments = useCollection('platformPayments');
  const { nameOf } = useStaff();
  const { toast } = useToast();
  const { subscribers } = platformRecords(db);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<string>(params.get('status') ?? 'all');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<PlatformSubscriber>();
  const openId = params.get('open');
  const editing = subscribers.find((s) => s.id === openId);
  const close = () => router.replace('/platform/subscribers');

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return subscribers.filter((s) => (status === 'all' || s.status === status) && (!t || `${s.company} ${s.contactName} ${s.email}`.toLowerCase().includes(t)));
  }, [subscribers, q, status]);

  return (
    <>
      <PageHeader
        title="Subscribers"
        subtitle="Every organization on Estimate Master."
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)} className="w-full shadow-xl shadow-primary-500/20 md:w-auto">Add subscriber</Button>}
      />
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <SearchInput value={q} onChange={setQ} placeholder="Search company, contact or email" className="lg:max-w-md" />
        <PillFilter options={[{ value: 'all', label: 'All' }, ...SUB_STATUSES.map((s) => ({ value: s, label: s }))]} value={status} onChange={setStatus} />
      </div>
      {shown.length === 0 ? (
        <EmptyState title="No subscribers" message="Nothing matches this search or filter." />
      ) : (
        <TableCard>
          <thead className="border-b border-gray-100 bg-gray-50">
            <tr><th className={th}>Company</th><th className={th}>Tier</th><th className={th}>Status</th><th className={th}>Price</th><th className={th}>Started</th><th className={th}>Rep</th><th className={th}><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            {shown.map((s) => (
              <tr key={s.id} onClick={() => router.push(`/platform/subscribers?open=${s.id}`)} className="cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50">
                <td className={td}>
                  <span className="block font-bold text-gray-900">{s.company}{s.linked && <span className="ml-2 rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-bold uppercase text-primary-700">This app</span>}</span>
                  <span className="text-xs text-gray-500">{s.contactName}{s.email ? ` · ${s.email}` : ''}</span>
                </td>
                <td className={td}>{s.tier}<span className="block text-xs text-gray-400">{s.billing === 'annual' ? 'Annual' : 'Month to month'}</span></td>
                <td className={td}><StatusBadge status={s.status} /></td>
                <td className={td}>{money(s.price, { cents: false })}<span className="text-xs text-gray-400">/{s.billing === 'annual' ? 'yr' : 'mo'}</span></td>
                <td className={td}>{longDate(s.startedAt)}</td>
                <td className={td}>{nameOf(s.repId)}</td>
                <td className={td}>
                  {!s.linked && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); setRemoving(s); }} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove ${s.company}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </TableCard>
      )}
      {(adding || editing) && <SubscriberModal key={editing?.id ?? 'new'} subscriber={editing} onClose={() => { setAdding(false); if (editing) close(); }} />}
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(v) => !v && setRemoving(undefined)}
        title={`Remove ${removing?.company}?`}
        message="The subscriber and its payments are removed from the Admin Portal."
        confirmLabel="Remove"
        onConfirm={() => {
          if (!removing) return;
          subs.remove(removing.id);
          payments.setAll(payments.items.filter((p) => p.subscriberId !== removing.id));
          toast(`${removing.company} removed`);
        }}
      />
    </>
  );
}
