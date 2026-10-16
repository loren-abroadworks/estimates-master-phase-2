/*
  Admin Portal numbers, computed live from the store (spec: "EMTS Admin
  Dashboard — UI & Functionality Spec", 16 Oct 2026). Nothing is cached:
  every widget re-reads the records, so the dashboard changes as soon as an
  admin edits a subscriber, lead, task or message, as soon as the
  organization using this replica changes its plan (Settings › Subscription),
  and when someone sends a request from Help & Support.

  Definitions (the spec's open questions, answered here):
  - Leads and Presentations count what falls in the date range: leads
    created, presentations held or booked.
  - Pending = leads waiting on a decision now; the tier tiles count active
    subscribers now. Growth = Growth on annual billing; Growth (Month to
    Month) = Growth billed monthly.
  - Active Subscribers: New = accounts opened in that day, week, month or
    year; Active = paying accounts; Actual = Active plus accounts on trial.
  - Yearly Sales and Monthly Revenue are payments (refunds subtract) in the
    calendar year and month; Commission = payments in the date range times
    the rep's commission rate.
  - Goal and monthly target are set in Admin Portal › Settings.
*/
import type {
  Database, PlatformEvent, PlatformLayout, PlatformLead, PlatformPayment, PlatformSubscriber, PlatformTier, PlatformWidgetKey, Subscription,
} from './types';
import { inRange, parseDate, periodRange, type PeriodValue } from '@/components/dashboard/metrics';

/* ---------- The organization using this replica ---------- */

/** Settings › Subscription plan name → Admin Portal tier. */
export function tierOfPlan(planName: string): PlatformTier {
  if (/enterprise|platinum/i.test(planName)) return 'Enterprise';
  if (/starter|founder/i.test(planName)) return 'Starter';
  return 'Growth';
}

export function statusOfSubscription(status: Subscription['status']): PlatformSubscriber['status'] {
  if (status === 'Trialing') return 'Trial';
  if (status === 'Suspended' || status === 'Cancelled') return 'Cancelled';
  return 'Active';
}

/** Subscribers and payments, with the linked organization read live from its subscription. */
export function platformRecords(db: Database): { subscribers: PlatformSubscriber[]; payments: PlatformPayment[] } {
  const c = db.collections;
  const sub = db.singletons.subscription;
  const company = db.singletons.businessProfile.companyName;
  const linked = c.platformSubscribers.find((s) => s.linked);
  const subscribers = c.platformSubscribers.map((s) =>
    s.linked
      ? { ...s, company: company || s.company, tier: tierOfPlan(sub.planName), billing: sub.interval === 'year' ? 'annual' as const : 'monthly' as const, status: statusOfSubscription(sub.status), price: sub.price }
      : s,
  );
  const billed: PlatformPayment[] = linked
    ? sub.billingHistory
        .filter((b) => b.status === 'Paid')
        .map((b) => ({ id: `bill_${b.id}`, subscriberId: linked.id, date: b.date, amount: b.type === 'refund' ? -b.amount : b.amount, description: b.description }))
    : [];
  return { subscribers, payments: [...c.platformPayments.filter((p) => p.subscriberId !== linked?.id), ...billed] };
}

/* ---------- Dashboard ---------- */

export type TileTone = 'blue' | 'indigo' | 'teal' | 'slate' | 'amber' | 'emerald';
export interface PipelineTile { key: string; label: string; value: number; tone: TileTone }

const isPaying = (s: PlatformSubscriber) => s.status === 'Active';

export function pipelineTiles(db: Database, period: PeriodValue, now = new Date()): PipelineTile[] {
  const r = periodRange(period, now);
  const leads = db.collections.platformLeads;
  const subs = platformRecords(db).subscribers.filter(isPaying);
  return [
    { key: 'leads', label: 'Leads', value: leads.filter((l) => inRange(l.createdAt, r)).length, tone: 'blue' },
    { key: 'presentations', label: 'Presentations', value: leads.filter((l) => l.stage !== 'Lost' && inRange(l.presentationAt, r)).length, tone: 'indigo' },
    { key: 'pending', label: 'Pending', value: leads.filter((l) => l.stage === 'Pending').length, tone: 'teal' },
    { key: 'growth', label: 'Growth', value: subs.filter((s) => s.tier === 'Growth' && s.billing === 'annual').length, tone: 'slate' },
    { key: 'enterprise', label: 'Enterprise', value: subs.filter((s) => s.tier === 'Enterprise').length, tone: 'amber' },
    { key: 'trial', label: 'Trial Run', value: platformRecords(db).subscribers.filter((s) => s.status === 'Trial').length, tone: 'emerald' },
    { key: 'growth_m2m', label: 'Growth (Month to Month)', value: subs.filter((s) => s.tier === 'Growth' && s.billing === 'monthly').length, tone: 'slate' },
  ];
}

export interface SubscriberRow { period: 'Day' | 'Week' | 'Month' | 'Year'; added: number; active: number; actual: number }

export function subscriberTable(db: Database, now = new Date()): SubscriberRow[] {
  const subs = platformRecords(db).subscribers;
  const active = subs.filter(isPaying).length;
  const actual = active + subs.filter((s) => s.status === 'Trial').length;
  const presets = { Day: 'today', Week: 'this_week', Month: 'this_month', Year: 'this_year' } as const;
  return (Object.keys(presets) as SubscriberRow['period'][]).map((period) => {
    const r = presets[period] === 'today'
      ? { start: new Date(now.getFullYear(), now.getMonth(), now.getDate()), end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999) }
      : periodRange({ preset: presets[period] as 'this_week' | 'this_month' | 'this_year' }, now);
    return { period, added: subs.filter((s) => inRange(s.startedAt, r)).length, active, actual };
  });
}

const sum = (ps: PlatformPayment[]) => Math.round(ps.reduce((t, p) => t + p.amount, 0) * 100) / 100;

export function yearlySales(db: Database, now = new Date()) {
  const r = periodRange({ preset: 'this_year' }, now);
  const sales = sum(platformRecords(db).payments.filter((p) => inRange(p.date, r)));
  const goal = db.singletons.platformSettings.yearlySalesGoal;
  return { sales, goal, pct: goal > 0 ? Math.round((sales / goal) * 100) : 0 };
}

export function monthlyRevenue(db: Database, now = new Date()) {
  const { payments } = platformRecords(db);
  const revenue = sum(payments.filter((p) => inRange(p.date, periodRange({ preset: 'this_month' }, now))));
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  const previous = sum(payments.filter((p) => inRange(p.date, periodRange({ preset: 'this_month' }, lastMonth))));
  const change = previous > 0 ? ((revenue - previous) / previous) * 100 : 0;
  return { revenue, previous, target: db.singletons.platformSettings.monthlyRevenueTarget, change: Math.round(change * 10) / 10 };
}

/** Commission earned on payments in the range, total and per rep. */
export function commissions(db: Database, period: PeriodValue, now = new Date()) {
  const r = periodRange(period, now);
  const { subscribers, payments } = platformRecords(db);
  const repOf = new Map(subscribers.map((s) => [s.id, s.repId]));
  const byRep = db.collections.platformStaff.map((staff) => {
    const paid = sum(payments.filter((p) => repOf.get(p.subscriberId) === staff.id && inRange(p.date, r)));
    return { staff, paid, commission: Math.round(paid * staff.commissionRate * 100) / 100 };
  });
  return { total: Math.round(byRep.reduce((t, x) => t + x.commission, 0) * 100) / 100, byRep };
}

/** Presentations still to come (not lost), soonest first. */
export function upcomingPresentations(db: Database, now = new Date()): PlatformLead[] {
  return db.collections.platformLeads
    .filter((l) => l.presentationAt && l.stage !== 'Lost' && l.stage !== 'Won' && parseDate(l.presentationAt).getTime() >= now.getTime())
    .sort((a, b) => a.presentationAt!.localeCompare(b.presentationAt!));
}

/** Accounts on trial or waiting to start, with days since the trial began. */
export function pendingOrTrial(db: Database, now = new Date()) {
  return platformRecords(db).subscribers
    .filter((s) => s.status === 'Trial' || s.status === 'Pending')
    .map((s) => ({ subscriber: s, days: s.trialStartedAt ? daysBetween(s.trialStartedAt, now) : 0 }))
    .sort((a, b) => b.days - a.days);
}

export function daysBetween(fromIso: string, now = new Date()) {
  const from = parseDate(fromIso);
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

/** "29d": whole days since the message; "Today" for today's. */
export function messageAge(iso: string, now = new Date()) {
  const d = daysBetween(iso, now);
  return d === 0 ? 'Today' : `${d}d`;
}

/* ---------- Calendar ---------- */

export type CalendarView = 'day' | 'week' | 'month';
export interface PlatformCalendarItem { id: string; title: string; start: string; kind: PlatformEvent['kind'] | 'Presentation'; repId: string; org?: string }

export function calendarWindow(view: CalendarView, now = new Date()) {
  if (view === 'day') return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate()), end: new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999) };
  return periodRange({ preset: view === 'week' ? 'this_week' : 'this_month' }, now) as { start: Date; end: Date };
}

/** Presentations (from leads) and events in the view, for one rep or everyone. */
export function calendarItems(db: Database, view: CalendarView, repId: string | 'all', now = new Date()): PlatformCalendarItem[] {
  const r = calendarWindow(view, now);
  const presentations: PlatformCalendarItem[] = db.collections.platformLeads
    .filter((l) => l.presentationAt && l.stage !== 'Lost')
    .map((l) => ({ id: `pres_${l.id}`, title: `Presentation: ${l.company}`, start: l.presentationAt!, kind: 'Presentation', repId: l.repId, org: l.company }));
  const events: PlatformCalendarItem[] = db.collections.platformEvents.map((e) => ({ id: e.id, title: e.title, start: e.start, kind: e.kind, repId: e.repId, org: e.org }));
  return [...presentations, ...events]
    .filter((i) => (repId === 'all' || i.repId === repId) && inRange(i.start, r))
    .sort((a, b) => a.start.localeCompare(b.start));
}

/* ---------- Customize ---------- */

export const PLATFORM_WIDGETS: PlatformWidgetKey[] = ['presentations', 'actions', 'messages', 'calendar', 'subscribers', 'pending', 'yearly', 'monthly', 'commission'];
export const DEFAULT_LAYOUT: PlatformLayout = { order: PLATFORM_WIDGETS, wide: [] };

/** A saved layout, with widgets added since it was saved put at the end. */
export function layoutFor(saved: PlatformLayout | undefined): PlatformLayout {
  if (!saved) return DEFAULT_LAYOUT;
  const order = saved.order.filter((k) => PLATFORM_WIDGETS.includes(k));
  return { order: [...order, ...PLATFORM_WIDGETS.filter((k) => !order.includes(k))], wide: saved.wide.filter((k) => PLATFORM_WIDGETS.includes(k)) };
}

/** Moves `key` to where `target` is. */
export function reorder(order: PlatformWidgetKey[], key: PlatformWidgetKey, target: PlatformWidgetKey): PlatformWidgetKey[] {
  if (key === target) return order;
  const next = order.filter((k) => k !== key);
  next.splice(next.indexOf(target) + (order.indexOf(key) < order.indexOf(target) ? 1 : 0), 0, key);
  return next;
}

/** "$1k", "$67k", "$1.2M" for the Yearly Sales card. */
export function moneyAbbrev(n: number) {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `$${+(n / 1_000_000).toFixed(1)}M`;
  if (a >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}
