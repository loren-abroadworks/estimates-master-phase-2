'use client';

/*
  Admin Portal › Dashboard (/platform/dashboard). Spec: "EMTS Admin
  Dashboard — UI & Functionality Spec" (16 Oct 2026).

  Header (Customize, date range), the Pipeline Performance strip and nine
  cards. Every number is computed from the store (lib/platform.ts), so it
  follows edits on the admin pages, the organization's own Settings ›
  Subscription and Help & Support requests, in this tab and in any other
  open tab.

  Customize: drag a card onto another to swap places (or use its arrows),
  expand or shrink it, then Done. Each admin's layout is saved for them.
  The date range drives Leads, Presentations and Commission; the other cards
  have their own periods.
*/
import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Maximize2, Minimize2, SlidersHorizontal } from 'lucide-react';
import { PlatformShell, usePlatformAdmin } from '@/components/platform/PlatformShell';
import {
  ActionNeededCard, ActiveSubscribersCard, CalendarCard, CommissionCard, MessagesCard, MonthlyRevenueCard, PendingTrialCard, PipelineStrip,
  PresentationsCard, YearlySalesCard,
} from '@/components/platform/DashboardWidgets';
import { PeriodFilter } from '@/components/dashboard/HeaderControls';
import { PERIOD_OPTIONS, type PeriodValue } from '@/components/dashboard/metrics';
import { PageHeader } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { useSingleton } from '@/lib/store';
import { cn } from '@/lib/utils';
import { layoutFor, reorder } from '@/lib/platform';
import type { PlatformLayout, PlatformWidgetKey } from '@/lib/types';

const PERIODS = PERIOD_OPTIONS.filter((o) => o.key !== 'this_week');

/** Grid spans on large screens (12 columns): normal and expanded. */
const SIZE: Record<PlatformWidgetKey, { span: string; wide: string; rows?: string; name: string }> = {
  presentations: { span: 'lg:col-span-4', wide: 'lg:col-span-8', name: 'Presentations' },
  actions: { span: 'lg:col-span-4', wide: 'lg:col-span-8', name: 'Action Needed' },
  messages: { span: 'lg:col-span-4', wide: 'lg:col-span-8', name: 'Messages' },
  calendar: { span: 'lg:col-span-3', wide: 'lg:col-span-6', rows: 'lg:row-span-2', name: 'Calendar' },
  subscribers: { span: 'lg:col-span-6', wide: 'lg:col-span-12', name: 'Active Subscribers' },
  pending: { span: 'lg:col-span-3', wide: 'lg:col-span-6', name: 'Pending / On Trial' },
  yearly: { span: 'lg:col-span-3', wide: 'lg:col-span-6', name: 'Yearly Sales' },
  monthly: { span: 'lg:col-span-3', wide: 'lg:col-span-6', name: 'Monthly Revenue' },
  commission: { span: 'lg:col-span-3', wide: 'lg:col-span-6', name: 'Commission' },
};

/** The current time, refreshed every minute so ages and "today" stay right. */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

export default function PlatformDashboardPage() {
  return (
    <PlatformShell title="Dashboard">
      <Dashboard />
    </PlatformShell>
  );
}

function Dashboard() {
  const now = useNow();
  const { session } = usePlatformAdmin();
  const [settings, setSettings] = useSingleton('platformSettings');
  const [period, setPeriod] = useState<PeriodValue>({ preset: 'this_month' });
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState<PlatformWidgetKey>();
  const userId = session?.userId ?? 'admin';
  const layout = layoutFor(settings.layouts[userId]);
  const save = (next: PlatformLayout) => setSettings({ layouts: { ...settings.layouts, [userId]: next } });

  const periodLabel = PERIODS.find((p) => p.key === period.preset)?.label ?? 'Custom range';
  const move = (key: PlatformWidgetKey, dir: -1 | 1) => {
    const i = layout.order.indexOf(key);
    const target = layout.order[i + dir];
    if (target) save({ ...layout, order: reorder(layout.order, key, target) });
  };
  const toggleWide = (key: PlatformWidgetKey) =>
    save({ ...layout, wide: layout.wide.includes(key) ? layout.wide.filter((k) => k !== key) : [...layout.wide, key] });

  const render = (key: PlatformWidgetKey) => {
    switch (key) {
      case 'presentations': return <PresentationsCard now={now} />;
      case 'actions': return <ActionNeededCard />;
      case 'messages': return <MessagesCard now={now} />;
      case 'calendar': return <CalendarCard now={now} />;
      case 'subscribers': return <ActiveSubscribersCard now={now} />;
      case 'pending': return <PendingTrialCard now={now} />;
      case 'yearly': return <YearlySalesCard now={now} />;
      case 'monthly': return <MonthlyRevenueCard now={now} />;
      case 'commission': return <CommissionCard period={period} now={now} periodLabel={periodLabel} />;
    }
  };

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Welcome back, here is your daily overview."
        className="mb-8"
        subtitleClassName="text-base"
        actions={
          <>
            <Button variant={editing ? 'primary' : 'secondary'} icon={<SlidersHorizontal className="h-4 w-4" />} onClick={() => setEditing((v) => !v)} className="h-11 rounded-xl md:h-12">
              {editing ? 'Done' : 'Customize'}
            </Button>
            <PeriodFilter value={period} onChange={setPeriod} options={PERIODS} />
          </>
        }
      />

      <PipelineStrip period={period} now={now} />

      <div className="grid grid-flow-row-dense grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-12">
        {layout.order.map((key, i) => {
          const size = SIZE[key];
          const wide = layout.wide.includes(key);
          const dark = key === 'yearly';
          return (
            <section
              key={key}
              aria-label={size.name}
              draggable={editing}
              onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDragging(key); }}
              onDragEnd={() => setDragging(undefined)}
              onDragOver={(e) => editing && dragging && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragging) save({ ...layout, order: reorder(layout.order, dragging, key) });
                setDragging(undefined);
              }}
              className={cn(
                'group relative min-w-0 overflow-hidden rounded-2xl shadow-sm transition',
                dark ? 'border border-slate-900' : 'border border-gray-200 bg-white hover:border-primary-300',
                wide ? cn(size.wide, 'md:col-span-2') : size.span,
                size.rows,
                editing && 'cursor-grab border-primary-400 ring-2 ring-primary-100',
                dragging === key && 'opacity-50',
              )}
            >
              {render(key)}
              {editing && (
                <div className="absolute bottom-2 right-2 flex gap-1 rounded-lg border border-gray-200 bg-white/95 p-0.5 shadow-sm">
                  <EditButton label={`Move ${size.name} earlier`} disabled={i === 0} onClick={() => move(key, -1)}><ArrowLeft className="h-3.5 w-3.5" /></EditButton>
                  <EditButton label={`Move ${size.name} later`} disabled={i === layout.order.length - 1} onClick={() => move(key, 1)}><ArrowRight className="h-3.5 w-3.5" /></EditButton>
                  <EditButton label={wide ? `Shrink ${size.name}` : `Expand ${size.name}`} onClick={() => toggleWide(key)}>
                    {wide ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                  </EditButton>
                </div>
              )}
            </section>
          );
        })}
      </div>

      {editing && (
        <p className="mt-6 text-center text-sm text-gray-500" role="status">
          Drag widgets to reorder. Use the expand/shrink button to resize. Click “Done” when finished.
          <button type="button" onClick={() => save({ order: [], wide: [] })} className="ml-3 font-semibold text-primary-600 hover:underline">Reset layout</button>
        </p>
      )}
    </>
  );
}

function EditButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-30">
      {children}
    </button>
  );
}
