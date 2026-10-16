'use client';

/*
  Shared Admin Portal parts: status badges and the add/edit forms for
  subscribers, leads and calendar events. Every save goes to the store, so
  the dashboard picks it up straight away.
*/
import React, { useState } from 'react';
import { Badge } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { Field, Input, NativeSelect, Textarea } from '@/components/ui/form';
import { Modal } from '@/components/Modals/Modal';
import { useToast } from '@/components/ui/toast';
import { useCollection } from '@/lib/store';
import { toISODate, uid } from '@/lib/utils';
import type {
  PlatformEvent, PlatformEventKind, PlatformLead, PlatformLeadStage, PlatformSubscriber, PlatformSubStatus, PlatformTier,
} from '@/lib/types';

export const TIERS: PlatformTier[] = ['Starter', 'Growth', 'Enterprise'];
export const SUB_STATUSES: PlatformSubStatus[] = ['Active', 'Trial', 'Pending', 'Cancelled'];
export const LEAD_STAGES: PlatformLeadStage[] = ['New', 'Presentation', 'Pending', 'Won', 'Lost'];
export const EVENT_KINDS: PlatformEventKind[] = ['Demo', 'Call', 'Follow-up', 'Onboarding'];

const STATUS_TONE: Record<string, string> = {
  Active: 'border-green-200 bg-green-100 text-green-700',
  Won: 'border-green-200 bg-green-100 text-green-700',
  Trial: 'border-teal-200 bg-teal-100 text-teal-700',
  Pending: 'border-amber-200 bg-amber-100 text-amber-700',
  Presentation: 'border-purple-200 bg-purple-100 text-purple-700',
  New: 'border-blue-200 bg-blue-100 text-blue-700',
  Cancelled: 'border-gray-200 bg-gray-100 text-gray-600',
  Lost: 'border-red-200 bg-red-100 text-red-700',
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge className={STATUS_TONE[status] ?? STATUS_TONE.Cancelled}>{status}</Badge>;
}

export function useStaff() {
  const { items } = useCollection('platformStaff');
  return { staff: items, nameOf: (id?: string) => items.find((s) => s.id === id)?.name ?? '—' };
}

function StaffSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { staff } = useStaff();
  return (
    <NativeSelect value={value} onChange={(e) => onChange(e.target.value)}>
      {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </NativeSelect>
  );
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function FormButtons({ onCancel, onSave, label }: { onCancel: () => void; onSave: () => void; label: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 pt-2">
      <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      <Button onClick={onSave}>{label}</Button>
    </div>
  );
}

/* ---------- Subscriber ---------- */

export function SubscriberModal({ subscriber, onClose }: { subscriber?: PlatformSubscriber; onClose: () => void }) {
  const subs = useCollection('platformSubscribers');
  const { staff } = useStaff();
  const { toast } = useToast();
  const [f, setF] = useState<PlatformSubscriber>(() => subscriber ?? {
    id: uid('psub'), company: '', contactName: '', email: '', tier: 'Growth', billing: 'monthly', status: 'Trial', price: 129,
    startedAt: toISODate(new Date()), trialStartedAt: toISODate(new Date()), repId: staff[0]?.id ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof PlatformSubscriber>(k: K, v: PlatformSubscriber[K]) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };
  const linked = !!subscriber?.linked;

  const save = () => {
    const e: Record<string, string> = {};
    if (!linked) {
      if (!f.company.trim()) e.company = 'Company is required';
      if (f.email && !EMAIL.test(f.email)) e.email = 'Invalid email address';
      if (!(f.price >= 0)) e.price = 'Enter a price of 0 or more';
    }
    if (!f.startedAt) e.startedAt = 'Start date is required';
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    const next: PlatformSubscriber = {
      ...f,
      company: f.company.trim(),
      trialStartedAt: f.status === 'Trial' ? f.trialStartedAt || toISODate(new Date()) : f.trialStartedAt,
      cancelledAt: f.status === 'Cancelled' ? f.cancelledAt || toISODate(new Date()) : undefined,
    };
    if (subscriber) subs.update(subscriber.id, linked ? { repId: next.repId, startedAt: next.startedAt, contactName: next.contactName } : next);
    else subs.add(next, { atStart: true });
    toast(subscriber ? `${next.company} saved` : `${next.company} added`);
    onClose();
  };

  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title={subscriber ? subscriber.company : 'Add subscriber'} size="lg">
      {linked && (
        <p className="mb-5 rounded-xl border border-primary-100 bg-primary-50 p-3 text-sm text-primary-900">
          This is the organization using this app. Its plan, billing, status and payments come from its Settings › Subscription page.
        </p>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Company" required error={errors.company}><Input value={f.company} disabled={linked} onChange={(e) => set('company', e.target.value)} invalid={!!errors.company} /></Field>
        <Field label="Contact name"><Input value={f.contactName} onChange={(e) => set('contactName', e.target.value)} /></Field>
        <Field label="Email" error={errors.email}><Input type="email" value={f.email} disabled={linked} onChange={(e) => set('email', e.target.value)} invalid={!!errors.email} /></Field>
        <Field label="Sales rep"><StaffSelect value={f.repId} onChange={(v) => set('repId', v)} /></Field>
        <Field label="Tier">
          <NativeSelect value={f.tier} disabled={linked} onChange={(e) => set('tier', e.target.value as PlatformTier)}>{TIERS.map((t) => <option key={t}>{t}</option>)}</NativeSelect>
        </Field>
        <Field label="Billing">
          <NativeSelect value={f.billing} disabled={linked} onChange={(e) => set('billing', e.target.value as PlatformSubscriber['billing'])}>
            <option value="monthly">Month to month</option>
            <option value="annual">Annual</option>
          </NativeSelect>
        </Field>
        <Field label="Status">
          <NativeSelect value={f.status} disabled={linked} onChange={(e) => set('status', e.target.value as PlatformSubStatus)}>{SUB_STATUSES.map((s) => <option key={s}>{s}</option>)}</NativeSelect>
        </Field>
        <Field label={`Price per ${f.billing === 'annual' ? 'year' : 'month'} ($)`} error={errors.price}>
          <Input type="number" min={0} value={f.price} disabled={linked} onChange={(e) => set('price', Number(e.target.value))} invalid={!!errors.price} />
        </Field>
        <Field label="Started" required error={errors.startedAt}><Input type="date" value={f.startedAt} onChange={(e) => set('startedAt', e.target.value)} invalid={!!errors.startedAt} /></Field>
        <Field label="Presentation date"><Input type="date" value={f.presentationAt ?? ''} disabled={linked} onChange={(e) => set('presentationAt', e.target.value || undefined)} /></Field>
        {f.status === 'Trial' && !linked && (
          <Field label="Trial started"><Input type="date" value={f.trialStartedAt ?? ''} onChange={(e) => set('trialStartedAt', e.target.value || undefined)} /></Field>
        )}
      </div>
      <div className="mt-6"><FormButtons onCancel={onClose} onSave={save} label={subscriber ? 'Save' : 'Add subscriber'} /></div>
    </Modal>
  );
}

/* ---------- Lead ---------- */

export function LeadModal({ lead, onClose }: { lead?: PlatformLead; onClose: () => void }) {
  const leads = useCollection('platformLeads');
  const subs = useCollection('platformSubscribers');
  const { staff } = useStaff();
  const { toast } = useToast();
  const [f, setF] = useState<PlatformLead>(() => lead ?? {
    id: uid('pl'), company: '', contactName: '', email: '', stage: 'New', createdAt: toISODate(new Date()), repId: staff[0]?.id ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof PlatformLead>(k: K, v: PlatformLead[K]) => { setF((x) => ({ ...x, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };

  const valid = () => {
    const e: Record<string, string> = {};
    if (!f.company.trim()) e.company = 'Company is required';
    if (f.email && !EMAIL.test(f.email)) e.email = 'Invalid email address';
    if (f.stage === 'Presentation' && !f.presentationAt) e.presentationAt = 'Pick the presentation date and time';
    setErrors(e);
    return !Object.values(e).some(Boolean);
  };
  const save = () => {
    if (!valid()) return;
    const next = { ...f, company: f.company.trim() };
    if (lead) leads.update(lead.id, next);
    else leads.add(next, { atStart: true });
    toast(lead ? `${next.company} saved` : `${next.company} added`);
    onClose();
  };
  /** Opens a trial account for the lead; the lead waits on the decision. */
  const startTrial = () => {
    if (!valid()) return;
    const today = toISODate(new Date());
    const sub = subs.add({
      company: f.company.trim(), contactName: f.contactName, email: f.email, tier: 'Growth', billing: 'monthly', status: 'Trial', price: 129,
      startedAt: today, trialStartedAt: today, presentationAt: f.presentationAt?.slice(0, 10), repId: f.repId,
    }, { atStart: true });
    const next = { ...f, company: f.company.trim(), stage: 'Pending' as const, subscriberId: sub.id };
    if (lead) leads.update(lead.id, next);
    else leads.add(next, { atStart: true });
    toast(`${next.company} started a trial`);
    onClose();
  };

  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title={lead ? lead.company : 'Add lead'} size="lg">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Company" required error={errors.company}><Input value={f.company} onChange={(e) => set('company', e.target.value)} invalid={!!errors.company} /></Field>
        <Field label="Contact name"><Input value={f.contactName} onChange={(e) => set('contactName', e.target.value)} /></Field>
        <Field label="Email" error={errors.email}><Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} invalid={!!errors.email} /></Field>
        <Field label="Phone"><Input value={f.phone ?? ''} onChange={(e) => set('phone', e.target.value || undefined)} /></Field>
        <Field label="Stage">
          <NativeSelect value={f.stage} onChange={(e) => set('stage', e.target.value as PlatformLeadStage)}>{LEAD_STAGES.map((s) => <option key={s}>{s}</option>)}</NativeSelect>
        </Field>
        <Field label="Sales rep"><StaffSelect value={f.repId} onChange={(v) => set('repId', v)} /></Field>
        <Field label="Presentation" error={errors.presentationAt}>
          <Input type="datetime-local" value={f.presentationAt?.slice(0, 16) ?? ''} onChange={(e) => set('presentationAt', e.target.value ? `${e.target.value}:00` : undefined)} invalid={!!errors.presentationAt} />
        </Field>
        <Field label="Created"><Input type="date" value={f.createdAt.slice(0, 10)} onChange={(e) => set('createdAt', e.target.value)} /></Field>
        <Field label="Notes" className="md:col-span-2"><Textarea value={f.notes ?? ''} onChange={(e) => set('notes', e.target.value || undefined)} /></Field>
      </div>
      {!f.subscriberId && f.stage !== 'Lost' && (
        <button type="button" onClick={startTrial} className="mt-5 w-full rounded-xl border-2 border-dashed border-gray-300 py-3 text-sm font-bold text-gray-500 hover:border-primary-400 hover:text-primary-600">
          Start a trial for this lead
        </button>
      )}
      <div className="mt-6"><FormButtons onCancel={onClose} onSave={save} label={lead ? 'Save' : 'Add lead'} /></div>
    </Modal>
  );
}

/* ---------- Calendar event ---------- */

export function EventModal({ onClose }: { onClose: () => void }) {
  const events = useCollection('platformEvents');
  const { staff } = useStaff();
  const { toast } = useToast();
  const [f, setF] = useState<PlatformEvent>(() => ({ id: uid('pe'), title: '', start: `${toISODate(new Date())}T09:00:00`, kind: 'Call', repId: staff[0]?.id ?? '' }));
  const [error, setError] = useState('');
  const save = () => {
    if (!f.title.trim()) return setError('Title is required');
    events.add({ ...f, title: f.title.trim(), org: f.org?.trim() || undefined });
    toast('Event added');
    onClose();
  };
  return (
    <Modal open onOpenChange={(v) => !v && onClose()} title="Add event" size="md">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Field label="Title" required error={error} className="md:col-span-2"><Input value={f.title} onChange={(e) => { setF({ ...f, title: e.target.value }); setError(''); }} invalid={!!error} /></Field>
        <Field label="When"><Input type="datetime-local" value={f.start.slice(0, 16)} onChange={(e) => e.target.value && setF({ ...f, start: `${e.target.value}:00` })} /></Field>
        <Field label="Type"><NativeSelect value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as PlatformEventKind })}>{EVENT_KINDS.map((k) => <option key={k}>{k}</option>)}</NativeSelect></Field>
        <Field label="Salesman"><StaffSelect value={f.repId} onChange={(v) => setF({ ...f, repId: v })} /></Field>
        <Field label="Organization"><Input value={f.org ?? ''} onChange={(e) => setF({ ...f, org: e.target.value })} /></Field>
      </div>
      <div className="mt-6"><FormButtons onCancel={onClose} onSave={save} label="Add event" /></div>
    </Modal>
  );
}

/* ---------- Table ---------- */

export const th = 'px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-500';
export const td = 'px-4 py-3 text-sm text-gray-600';

export function TableCard({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm"><table className="w-full min-w-[640px]">{children}</table></div>;
}
