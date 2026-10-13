'use client';

/*
  Lead Review (CRM Part 1, 5), on Lead Pipeline › Website, below Form links.
  Every form lead goes through the match check (lib/lead-capture.ts):
    Strong   (same phone or email)            "Likely the same person"
    Possible (same first and last name only)  "Possible match, please review"
  Each row opens a side-by-side comparison with three actions. Nothing
  happens automatically:
  - Merge: pick which email, phone and address to keep. The new submission's
    source and notes go into the existing record's history, and the new lead
    leaves the board.
  - Retain: both records stay, and the pair is saved as "not a duplicate",
    so it is never flagged again.
  - Remove: asks inline, then deletes the new lead.
*/
import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, UserCheck } from 'lucide-react';
import type { Customer, Lead, LeadReview } from '@/lib/types';
import { useCollection, useCurrentUser, useLogActivity } from '@/lib/store';
import { fullName, shortDate, uid } from '@/lib/utils';
import { MATCH_LABEL, pairKey } from '@/lib/lead-capture';
import { appendNote, formatPhone } from './leadHelpers';
import { Badge, Button, Card, CardTitle, Modal, Table, TD, TH, THead, TR } from '@/features/components/ui';
import { toast } from '@/features/lib/toast';

type OnFile = { kind: 'lead'; lead: Lead } | { kind: 'contact'; contact: Customer };

const address = (x: { street: string; city: string; state: string; zip: string }) => [x.street, [x.city, [x.state, x.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')].filter(Boolean).join(', ');
const personOf = (f: OnFile) => (f.kind === 'lead' ? f.lead : f.contact);
const numberOf = (f: OnFile) => (f.kind === 'lead' ? f.lead.leadNumber : fullName(f.contact));

/** Open reviews whose leads are still there, newest first. */
export function useOpenReviews() {
  const { items: reviews } = useCollection('leadReviews');
  const { items: leads } = useCollection('leads');
  const { items: customers } = useCollection('customers');
  return reviews
    .filter((r) => r.status === 'open')
    .flatMap((r) => {
      const lead = leads.find((l) => l.id === r.leadId);
      const match = r.matchKind === 'lead' ? leads.find((l) => l.id === r.matchId) : customers.find((c) => c.id === r.matchId);
      if (!lead || !match) return [];
      const onFile: OnFile = r.matchKind === 'lead' ? { kind: 'lead', lead: match as Lead } : { kind: 'contact', contact: match as Customer };
      return [{ review: r, lead, onFile }];
    })
    .sort((a, b) => b.review.createdAt.localeCompare(a.review.createdAt));
}

export function LeadReviewPanel() {
  const rows = useOpenReviews();
  const [open, setOpen] = useState<string>();
  const current = rows.find((r) => r.review.id === open);
  return (
    <Card className="p-5" data-tour="crm-review">
      <CardTitle icon={<UserCheck />} badge={<Badge tone={rows.length ? 'amber' : 'gray'}>{rows.length}</Badge>}>Lead Review</CardTitle>
      <p className="-mt-3 mb-4 text-sm text-gray-500">New website leads that look like someone already on file. Nothing is merged or removed until you choose.</p>
      {!rows.length ? (
        <p className="rounded-xl border border-dashed border-gray-200 py-8 text-center text-sm text-gray-500">No leads to review.</p>
      ) : (
        <Table>
          <THead>
            <TR><TH>New lead</TH><TH>Matches</TH><TH>Match</TH><TH>Received</TH><TH className="text-right">Action</TH></TR>
          </THead>
          <tbody>
            {rows.map(({ review, lead, onFile }) => (
              <TR key={review.id}>
                <TD>
                  <span className="font-semibold text-ink">{fullName(lead)}</span>
                  <span className="block text-xs text-gray-500">{lead.leadNumber} · {lead.leadSource}</span>
                </TD>
                <TD>
                  <span className="font-medium text-gray-900">{fullName(personOf(onFile))}</span>
                  <span className="block text-xs text-gray-500">{onFile.kind === 'lead' ? onFile.lead.leadNumber : 'Contact'}</span>
                </TD>
                <TD><Badge tone={review.level === 'strong' ? 'red' : 'amber'}>{MATCH_LABEL[review.level]}</Badge></TD>
                <TD className="whitespace-nowrap">{shortDate(lead.createdAt)}</TD>
                <TD className="text-right"><Button size="sm" variant="primary" onClick={() => setOpen(review.id)}>Review <ArrowRight className="h-3.5 w-3.5" /></Button></TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}
      {current && <CompareModal review={current.review} lead={current.lead} onFile={current.onFile} onClose={() => setOpen(undefined)} />}
    </Card>
  );
}

/** Last estimate or job for the comparison. */
function useHistoryLine(f: OnFile | { kind: 'new'; lead: Lead }) {
  const { items: estimates } = useCollection('estimates');
  const { items: jobs } = useCollection('jobs');
  const leadId = f.kind === 'contact' ? undefined : f.lead.id;
  const customerId = f.kind === 'contact' ? f.contact.id : f.lead.customerId;
  const job = [...jobs].filter((j) => (leadId && j.leadId === leadId) || (customerId && j.customerId === customerId)).sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''))[0];
  const est = [...estimates].filter((e) => (leadId && e.leadId === leadId) || (customerId && e.customerId === customerId)).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (job) return { text: `${job.jobNumber} · ${job.title}`, href: `/jobs/${job.id}` };
  if (est) return { text: `${est.estimateNumber} · ${est.title}`, href: `/estimates/${est.id}` };
  return undefined;
}

function CompareModal({ review, lead, onFile, onClose }: { review: LeadReview; lead: Lead; onFile: OnFile; onClose: () => void }) {
  const leads = useCollection('leads');
  const customers = useCollection('customers');
  const reviews = useCollection('leadReviews');
  const pairs = useCollection('notDuplicatePairs');
  const events = useCollection('events');
  const me = fullName(useCurrentUser());
  const log = useLogActivity();
  const [merging, setMerging] = useState(false);
  const [removing, setRemoving] = useState(false);
  const other = personOf(onFile);
  const otherNo = numberOf(onFile);
  const newHistory = useHistoryLine({ kind: 'new', lead });
  const fileHistory = useHistoryLine(onFile);
  const fileCreated = onFile.kind === 'lead' ? onFile.lead.createdAt : onFile.contact.createdAt;
  const fileSource = onFile.kind === 'lead' ? onFile.lead.leadSource : onFile.contact.source;

  const resolve = (status: LeadReview['status']) => reviews.update(review.id, { status, resolvedBy: me, resolvedAt: new Date().toISOString() });
  /** The new lead leaves the board, with its own contact when nothing else uses it. */
  const dropNewLead = () => {
    leads.remove(lead.id);
    events.items.filter((e) => e.leadId === lead.id).forEach((e) => events.remove(e.id));
    const c = lead.customerId ? customers.get(lead.customerId) : undefined;
    if (c && c.type === 'Lead' && !leads.items.some((l) => l.id !== lead.id && l.customerId === c.id)) customers.remove(c.id);
  };

  const retain = () => {
    const [a, b] = pairKey(lead.id, other.id).split('|') as [string, string];
    pairs.add({ id: uid('ndp'), a, b, by: me, at: new Date().toISOString() });
    resolve('retained');
    log(`Leads ${lead.leadNumber} and ${otherNo} marked as different people by ${me}.`, 'lead', lead.id);
    toast.success('Kept both records', 'This pair will not be flagged again.');
    onClose();
  };
  const remove = () => {
    dropNewLead();
    resolve('removed');
    log(`Lead ${lead.leadNumber} removed as a duplicate of ${otherNo} by ${me}.`);
    toast.success(`${lead.leadNumber} removed`);
    onClose();
  };
  const merge = (keep: { email: string; phone: string; address: { street: string; city: string; state: string; zip: string } }) => {
    const note = `Merged website request ${lead.leadNumber} (source ${lead.leadSource}, ${shortDate(lead.createdAt)})${lead.notes ? `: ${lead.notes.replace(/^\[[^\]]+\]\s*/, '')}` : '.'}`;
    const patch = { email: keep.email, phone: keep.phone, ...keep.address };
    if (onFile.kind === 'lead') {
      leads.update(onFile.lead.id, { ...patch, notes: appendNote(onFile.lead.notes, note), updatedAt: new Date().toISOString() });
      if (onFile.lead.customerId && customers.get(onFile.lead.customerId)) customers.update(onFile.lead.customerId, patch);
    } else {
      customers.update(onFile.contact.id, { ...patch, notes: appendNote(onFile.contact.notes, note) });
    }
    dropNewLead();
    resolve('merged');
    log(`Lead ${lead.leadNumber} merged into ${otherNo} by ${me}. Kept email ${keep.email || 'none'}, phone ${keep.phone || 'none'}.`, onFile.kind === 'lead' ? 'lead' : undefined, onFile.kind === 'lead' ? onFile.lead.id : undefined);
    toast.success(`${lead.leadNumber} merged into ${otherNo}`);
    onClose();
  };

  const rows: [string, React.ReactNode, React.ReactNode][] = [
    ['Name', fullName(lead), fullName(other)],
    ['Phone', formatPhone(lead.phone) || '—', formatPhone(other.phone) || '—'],
    ['Email', lead.email || '—', other.email || '—'],
    ['Property address', address(lead) || '—', address(other) || '—'],
    ['Source', lead.leadSource || '—', fileSource || '—'],
    ['Last estimate or job', newHistory ? <Link href={newHistory.href} className="text-primary-700 hover:underline">{newHistory.text}</Link> : '—', fileHistory ? <Link href={fileHistory.href} className="text-primary-700 hover:underline">{fileHistory.text}</Link> : '—'],
    ['Created', shortDate(lead.createdAt), shortDate(fileCreated)],
  ];

  return (
    <>
      <Modal
        open={!merging}
        onOpenChange={(v) => !v && onClose()}
        title="Compare records"
        description={MATCH_LABEL[review.level]}
        size="lg"
        footer={removing ? (
          <div className="flex w-full flex-wrap items-center justify-end gap-2" role="alert">
            <span className="mr-auto text-sm text-gray-700">Remove {lead.leadNumber}? The new lead is deleted. {otherNo} stays.</span>
            <Button variant="danger-solid" onClick={remove}>Remove</Button>
            <Button variant="secondary" onClick={() => setRemoving(false)}>Cancel</Button>
          </div>
        ) : (
          <div className="flex w-full flex-wrap justify-end gap-2">
            <Button variant="danger" onClick={() => setRemoving(true)}>Remove</Button>
            <Button variant="secondary" onClick={retain}>Retain</Button>
            <Button variant="primary" onClick={() => setMerging(true)}>Merge</Button>
          </div>
        )}
      >
        <dl className="divide-y divide-gray-100 text-sm">
          <div className="hidden grid-cols-[9rem_1fr_1fr] gap-3 pb-2 text-xs font-bold uppercase tracking-wide text-gray-500 sm:grid">
            <span />
            <span>New submission · {lead.leadNumber}</span>
            <span>On file · {onFile.kind === 'lead' ? otherNo : 'Contact'}</span>
          </div>
          {rows.map(([label, a, b]) => (
            <div key={label} className="grid grid-cols-1 gap-1 py-2.5 sm:grid-cols-[9rem_1fr_1fr] sm:gap-3">
              <dt className="text-xs font-semibold text-gray-500">{label}</dt>
              <dd className="min-w-0 break-words text-gray-900"><span className="mr-1 text-xs text-gray-500 sm:hidden">New:</span>{a}</dd>
              <dd className="min-w-0 break-words text-gray-900"><span className="mr-1 text-xs text-gray-500 sm:hidden">On file:</span>{b}</dd>
            </div>
          ))}
        </dl>
      </Modal>
      {merging && <MergeModal lead={lead} other={other} otherNo={otherNo} onCancel={() => setMerging(false)} onMerge={merge} />}
    </>
  );
}

type Addr = { street: string; city: string; state: string; zip: string };
const pick = (x: Addr): Addr => ({ street: x.street, city: x.city, state: x.state, zip: x.zip });

function MergeModal({ lead, other, otherNo, onCancel, onMerge }: {
  lead: Lead; other: Lead | Customer; otherNo: string; onCancel: () => void;
  onMerge: (keep: { email: string; phone: string; address: Addr }) => void;
}) {
  const [email, setEmail] = useState<'new' | 'file'>('file');
  const [phone, setPhone] = useState<'new' | 'file'>('file');
  const [addr, setAddr] = useState<'new' | 'file'>('file');
  const choice = (label: string, value: 'new' | 'file', set: (v: 'new' | 'file') => void, a: string, b: string) => (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-xs font-bold uppercase tracking-wide text-gray-500">{label}</legend>
      {([['file', `On file: ${b || '—'}`], ['new', `New: ${a || '—'}`]] as const).map(([v, text]) => (
        <label key={v} className="flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm hover:bg-gray-50">
          <input type="radio" name={label} checked={value === v} onChange={() => set(v)} className="mt-0.5 accent-primary-600" />
          <span className="min-w-0 break-words text-gray-900">{text}</span>
        </label>
      ))}
    </fieldset>
  );
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onCancel()}
      title={`Merge ${lead.leadNumber} into ${otherNo}`}
      description="Choose what to keep. The new submission's source and notes are added to the record on file."
      size="md"
      footer={<><Button variant="secondary" onClick={onCancel}>Cancel</Button><Button variant="primary" onClick={() => onMerge({
        email: email === 'new' ? lead.email : other.email,
        phone: phone === 'new' ? lead.phone : other.phone,
        address: pick(addr === 'new' ? lead : other),
      })}>Merge</Button></>}
    >
      <div className="space-y-5">
        {choice('Email', email, setEmail, lead.email, other.email)}
        {choice('Phone', phone, setPhone, formatPhone(lead.phone), formatPhone(other.phone))}
        {choice('Address', addr, setAddr, address(lead), address(other))}
      </div>
    </Modal>
  );
}
