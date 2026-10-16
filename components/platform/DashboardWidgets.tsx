'use client';

/*
  Admin Portal dashboard cards (spec: "EMTS Admin Dashboard", Dashboard
  components). Each card reads the store through lib/platform.ts, so it
  changes the moment the records behind it do.
*/
import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Briefcase, CheckSquare, Filter, MessageSquare, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { useCollection, useDb } from '@/lib/store';
import { cn, money } from '@/lib/utils';
import { Checkbox } from '@/components/ui/form';
import type { PeriodValue } from '@/components/dashboard/metrics';
import {
  calendarItems, commissions, messageAge, monthlyRevenue, moneyAbbrev, pendingOrTrial, pipelineTiles, subscriberTable, upcomingPresentations, yearlySales,
  type CalendarView, type TileTone,
} from '@/lib/platform';

const TONES: Record<TileTone, string> = {
  blue: 'border-blue-100 bg-blue-50 text-blue-600',
  indigo: 'border-indigo-100 bg-indigo-50 text-indigo-600',
  teal: 'border-teal-100 bg-teal-50 text-teal-600',
  slate: 'border-slate-200 bg-slate-50 text-slate-600',
  amber: 'border-amber-100 bg-amber-50 text-amber-600',
  emerald: 'border-emerald-100 bg-emerald-50 text-emerald-600',
};

const label = 'text-[11px] font-bold uppercase tracking-widest';
const countBadge = 'rounded px-2 py-0.5 text-xs font-bold';

/* ---------- Pipeline Performance ---------- */

export function PipelineStrip({ period, now }: { period: PeriodValue; now: Date }) {
  const tiles = pipelineTiles(useDb(), period, now);
  return (
    <section aria-labelledby="pp-heading" className="mb-8">
      <h2 id="pp-heading" className="mb-4 font-heading text-lg font-bold text-gray-900">Pipeline Performance</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        {tiles.map((t) => (
          <div key={t.key} className={cn('flex flex-col justify-between rounded-2xl border p-4', TONES[t.tone])}>
            <span className="font-heading text-3xl font-black tracking-tight">{t.value}</span>
            <span className={cn(label, 'mt-2 text-[11px] leading-tight tracking-wider text-gray-500')}>{t.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------- Row A ---------- */

export function PresentationsCard({ now }: { now: Date }) {
  const db = useDb();
  const list = upcomingPresentations(db, now);
  const staff = db.collections.platformStaff;
  return (
    <WidgetBody>
      <header className="mb-4 flex items-center justify-between gap-2">
        <span className={cn(label, 'flex items-center gap-2 text-indigo-700')}><Briefcase className="h-4 w-4" /> Presentations</span>
        <span className={cn(countBadge, 'bg-indigo-100 text-indigo-700')}>{list.length} Total</span>
      </header>
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm italic text-gray-400">No upcoming presentations.</p>
      ) : (
        <ul className="-mx-2 max-h-56 space-y-1 overflow-y-auto">
          {list.map((l) => (
            <li key={l.id}>
              <Link href={`/platform/leads?open=${l.id}`} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2 hover:bg-gray-50">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-gray-900">{l.company}</span>
                  <span className="block text-xs text-gray-500">Rep: {staff.find((s) => s.id === l.repId)?.name ?? '—'}</span>
                </span>
                <span className="shrink-0 text-right text-xs font-semibold text-indigo-700">{when(l.presentationAt!)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetBody>
  );
}

export function ActionNeededCard() {
  const tasks = useCollection('platformTasks');
  const open = tasks.items.filter((t) => !t.done);
  return (
    <WidgetBody>
      <header className="mb-4 flex items-center justify-between gap-2">
        <Link href="/platform/tasks" className={cn(label, 'flex items-center gap-2 text-gray-700 hover:text-primary-700')}><CheckSquare className="h-4 w-4" /> Action Needed</Link>
        <span className={cn(countBadge, 'bg-blue-100 text-blue-700')}>{open.length} Items</span>
      </header>
      {open.length === 0 ? (
        <p className="py-6 text-center text-sm italic text-gray-400">Nothing needs action.</p>
      ) : (
        <ul className="max-h-48 space-y-3 overflow-y-auto">
          {open.slice(0, 6).map((t) => (
            <li key={t.id}>
              <Checkbox
                checked={false}
                onChange={() => tasks.update(t.id, { done: true, doneAt: new Date().toISOString() })}
                label={<span className="text-sm font-medium text-gray-800">{t.title}</span>}
                ariaLabel={`Mark "${t.title}" done`}
              />
            </li>
          ))}
        </ul>
      )}
      <Link href="/platform/tasks" className="mt-4 block text-xs font-semibold text-gray-500 hover:text-primary-600">Click to view full list</Link>
    </WidgetBody>
  );
}

export function MessagesCard({ now }: { now: Date }) {
  const msgs = [...useCollection('platformMessages').items].sort((a, b) => b.at.localeCompare(a.at));
  const unread = msgs.filter((m) => !m.read && m.direction === 'in').length;
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between gap-2 border-b border-green-100 bg-green-50 px-5 py-3">
        <Link href="/platform/messages" className={cn(label, 'flex items-center gap-2 text-green-700 hover:text-green-800')}><MessageSquare className="h-4 w-4" /> Messages</Link>
        {unread > 0 && <span className={cn(countBadge, 'bg-green-100 text-green-700')}>{unread} New</span>}
      </header>
      {msgs.length === 0 ? (
        <p className="py-8 text-center text-sm italic text-gray-400">No messages yet.</p>
      ) : (
        <ul className="max-h-64 flex-1 divide-y divide-gray-100 overflow-y-auto">
          {msgs.map((m) => (
            <li key={m.id}>
              <Link href={`/platform/messages?open=${m.id}`} className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-100 text-sm font-bold text-teal-700">{m.org.charAt(0).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={cn('truncate text-sm text-gray-900', !m.read && m.direction === 'in' ? 'font-black' : 'font-bold')}>{m.org}</span>
                    <span className="shrink-0 text-xs text-gray-400">{messageAge(m.at, now)}</span>
                  </span>
                  <span className="block truncate text-xs text-gray-500">{m.direction === 'out' ? 'You: ' : ''}{m.body.split('\n')[0]}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ---------- Row B ---------- */

export function CalendarCard({ now }: { now: Date }) {
  const db = useDb();
  const [rep, setRep] = useState<string>('all');
  const [view, setView] = useState<CalendarView>('day');
  const items = calendarItems(db, view, rep, now);
  const staff = db.collections.platformStaff;
  const days = groupByDay(items.map((i) => ({ ...i, day: i.start.slice(0, 10) })));
  return (
    <WidgetBody className="flex h-full flex-col">
      <header className="mb-3 flex items-center justify-between gap-2">
        <Link href="/platform/calendar" className={cn(label, 'text-gray-700 hover:text-primary-700')}>Calendar</Link>
      </header>
      <label className="mb-3 flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-600">
        <Filter className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-hidden />
        <span className="shrink-0">Salesman:</span>
        <select value={rep} onChange={(e) => setRep(e.target.value)} className="h-9 min-w-0 flex-1 cursor-pointer bg-transparent font-bold text-gray-800 outline-none" aria-label="Filter: Salesman">
          <option value="all">All Staff</option>
          {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl border border-gray-200 bg-gray-100 p-1" role="group" aria-label="Calendar view">
        {(['day', 'week', 'month'] as const).map((v) => (
          <button key={v} type="button" onClick={() => setView(v)} aria-pressed={view === v} className={cn('rounded-lg py-1.5 text-xs font-bold uppercase tracking-wider', view === v ? 'bg-slate-900 text-white shadow-sm' : 'text-gray-500 hover:text-gray-800')}>
            {v}
          </button>
        ))}
      </div>
      <div className="min-h-40 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <p className="border-t border-dashed border-gray-200 py-8 text-center text-sm italic text-gray-400">No items for selected filter.</p>
        ) : (
          days.map(([day, list]) => (
            <div key={day} className="border-t border-dashed border-gray-200 py-2">
              {view !== 'day' && <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">{new Date(day + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>}
              {list.map((i) => (
                <div key={i.id} className="flex gap-3 py-1.5">
                  <span className="w-14 shrink-0 text-xs font-bold text-gray-500">{new Date(i.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-gray-900">{i.title}</span>
                    <span className="block truncate text-xs text-gray-500">{i.kind}{i.org && !i.title.includes(i.org) ? ` · ${i.org}` : ''} · {staff.find((s) => s.id === i.repId)?.name ?? '—'}</span>
                  </span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </WidgetBody>
  );
}

export function ActiveSubscribersCard({ now }: { now: Date }) {
  const rows = subscriberTable(useDb(), now);
  const router = useRouter();
  return (
    <WidgetBody>
      <header className="mb-3 flex items-center justify-between">
        <Link href="/platform/subscribers" className={cn(label, 'text-gray-700 hover:text-primary-700')}>Active Subscribers</Link>
      </header>
      <div className="max-h-56 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white">
            <tr className="border-b border-gray-100 text-left text-[11px] font-bold uppercase tracking-wider text-gray-400">
              <th className="py-2 font-bold">Period</th>
              <th className="py-2 text-right font-bold">New</th>
              <th className="py-2 text-right font-bold">Active</th>
              <th className="py-2 text-right font-bold text-blue-600">Actual</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.period} onClick={() => router.push('/platform/subscribers')} className="cursor-pointer border-b border-gray-50 last:border-0 hover:bg-gray-50">
                <td className="py-2.5 font-semibold text-gray-700">{r.period}</td>
                <td className="py-2.5 text-right text-gray-600">{r.added}</td>
                <td className="py-2.5 text-right text-gray-600">{r.active}</td>
                <td className="py-2.5 text-right font-heading text-base font-black text-blue-600">{r.actual}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </WidgetBody>
  );
}

export function PendingTrialCard({ now }: { now: Date }) {
  const db = useDb();
  const list = pendingOrTrial(db, now);
  const staff = db.collections.platformStaff;
  return (
    <WidgetBody>
      <header className="mb-3 flex items-center justify-between">
        <Link href="/platform/subscribers?status=Trial" className={cn(label, 'text-gray-700 hover:text-primary-700')}>Pending / On Trial</Link>
        <span className={cn(countBadge, 'bg-teal-100 text-teal-700')}>{list.length}</span>
      </header>
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm italic text-gray-400">No accounts on trial.</p>
      ) : (
        <ul className="max-h-56 space-y-2 overflow-y-auto">
          {list.map(({ subscriber: s, days }) => (
            <li key={s.id}>
              <Link href={`/platform/subscribers?open=${s.id}`} className="block rounded-xl border border-gray-100 p-3 hover:bg-gray-50">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-bold text-gray-900">{s.company}</span>
                  <span className="shrink-0 text-xs font-bold text-teal-700">{s.status === 'Pending' ? 'Pending' : `${days} ${days === 1 ? 'Day' : 'Days'}`}</span>
                </span>
                <span className="mt-1 flex justify-between gap-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  <span>Pres: {s.presentationAt ? new Date(s.presentationAt + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</span>
                  <span className="normal-case tracking-normal">Rep: {staff.find((x) => x.id === s.repId)?.name ?? '—'}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WidgetBody>
  );
}

/* ---------- Row C ---------- */

export function YearlySalesCard({ now }: { now: Date }) {
  const { sales, goal, pct } = yearlySales(useDb(), now);
  return (
    <div className="relative h-full overflow-hidden rounded-2xl bg-slate-900 p-5 text-white">
      <Target className="absolute -right-3 -top-3 h-20 w-20 text-white/5" aria-hidden />
      <div className={cn(label, 'text-slate-400')}>Yearly Sales</div>
      <div className="mt-2 font-heading text-3xl font-black tracking-tight">{moneyAbbrev(sales)}</div>
      <Link href="/platform/settings" className="mt-1 inline-block text-xs font-bold text-green-400 hover:underline">Goal: {goal > 0 ? moneyAbbrev(goal) : 'Not set'}</Link>
      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Yearly sales goal">
        <div className="h-full rounded-full bg-green-400" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className="mt-1.5 text-xs text-slate-400">{pct}% of Goal</div>
    </div>
  );
}

export function MonthlyRevenueCard({ now }: { now: Date }) {
  const { revenue, target, change } = monthlyRevenue(useDb(), now);
  const down = change < 0;
  return (
    <WidgetBody>
      <div className={cn(label, 'text-gray-500')}>Monthly Revenue</div>
      <div className="mt-2 flex flex-wrap items-baseline gap-1">
        <span className="font-heading text-3xl font-black tracking-tight text-gray-900">{money(revenue, { cents: false })}</span>
        <Link href="/platform/settings" className="text-sm font-semibold text-gray-400 hover:text-primary-600" title="Set the monthly target">/ {money(target, { cents: false })}</Link>
      </div>
      <span className={cn('mt-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold', down ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600')}>
        {down ? <TrendingDown className="h-3.5 w-3.5" /> : <TrendingUp className="h-3.5 w-3.5" />}
        {change.toFixed(1)}% vs last mo
      </span>
    </WidgetBody>
  );
}

export function CommissionCard({ period, now, periodLabel }: { period: PeriodValue; now: Date; periodLabel: string }) {
  const { total } = commissions(useDb(), period, now);
  return (
    <Link href="/platform/commissions" className="block h-full rounded-2xl p-5">
      <div className={cn(label, 'text-gray-500')}>Commission</div>
      <div className="mt-2 font-heading text-3xl font-black tracking-tight text-green-600">{money(total, { cents: total % 1 !== 0 })}</div>
      <div className="mt-1 text-xs font-medium text-gray-400">{periodLabel}</div>
    </Link>
  );
}

/* ---------- helpers ---------- */

function WidgetBody({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('h-full p-5', className)}>{children}</div>;
}

function when(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

function groupByDay<T extends { day: string }>(items: T[]): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const i of items) map.set(i.day, [...(map.get(i.day) ?? []), i]);
  return [...map.entries()];
}
