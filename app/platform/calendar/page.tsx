'use client';

/*
  Admin Portal › Calendar: presentations (from Leads) and staff events, by
  salesman, for the day, week or month. Events added here also show on the
  dashboard's Calendar card.
*/
import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { PlatformShell } from '@/components/platform/PlatformShell';
import { EventModal, useStaff } from '@/components/platform/AdminParts';
import { CalendarCard } from '@/components/platform/DashboardWidgets';
import { EmptyState, PageHeader } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { useCollection } from '@/lib/store';

export default function PlatformCalendarPage() {
  return <PlatformShell title="Calendar"><Calendar /></PlatformShell>;
}

function Calendar() {
  const events = useCollection('platformEvents');
  const { nameOf } = useStaff();
  const [adding, setAdding] = useState(false);
  const upcoming = [...events.items].filter((e) => new Date(e.start) >= new Date(new Date().toDateString())).sort((a, b) => a.start.localeCompare(b.start));
  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle="Presentations and staff events."
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)} className="w-full shadow-xl shadow-primary-500/20 md:w-auto">Add event</Button>}
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-sm"><CalendarCard now={new Date()} /></div>
        <div>
          <h2 className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-500">Upcoming events</h2>
          {upcoming.length === 0 ? (
            <EmptyState title="No events" message="Add a call, demo or onboarding session." />
          ) : (
            <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white shadow-sm">
              {upcoming.map((e) => (
                <li key={e.id} className="flex items-center gap-4 px-4 py-3">
                  <span className="w-28 shrink-0 text-xs font-bold text-gray-500">{new Date(e.start).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-gray-900">{e.title}{e.org ? ` · ${e.org}` : ''}</span>
                    <span className="text-xs text-gray-500">{e.kind} · {nameOf(e.repId)}</span>
                  </span>
                  <button type="button" onClick={() => events.remove(e.id)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label={`Delete ${e.title}`}><Trash2 className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {adding && <EventModal onClose={() => setAdding(false)} />}
    </>
  );
}
