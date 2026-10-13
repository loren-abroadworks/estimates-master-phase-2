'use client';

/*
  Automation › Overview: how the workflows are doing (published, errors,
  waiting for review, runs this week, sending), then the stage view: what
  runs at each stage of a pipeline, with drag and drop from Building blocks.
*/
import { useState } from 'react';
import type { PipelineModule } from '@/lib/automations/types';
import { healthOf, useAuto } from '@/lib/automations/store';
import { useNav, useParam } from '@/features/lib/navigation';
import { PIPELINES } from '@/lib/automations/registry';
import { BoardTab } from '../BoardTab';
import { CARD } from '../shared';
import { SendingCard } from '../ActivityTab';

export function OverviewTab() {
  const s = useAuto((x) => x);
  const nav = useNav();
  const pipelineParam = useParam('pipeline') as PipelineModule | undefined;
  const stageParam = useParam('stage');
  const [pipeline, setPipeline] = useState<PipelineModule>(pipelineParam && PIPELINES.includes(pipelineParam) ? pipelineParam : 'LEAD');
  const [journeyId, setJourneyId] = useState('');
  const h = healthOf(s);
  const week = Date.now() - 7 * 86_400_000;
  const runs = s.runs.filter((r) => Date.parse(r.startedAt) >= week).length;
  const failed = s.runs.filter((r) => r.status === 'FAILED').length;
  const sentMonth = s.sent.filter((m) => m.at.slice(0, 7) === new Date().toISOString().slice(0, 7)).length;
  const cards = [
    { label: 'Published workflows', value: h.on, href: '/automations?view=workflows' },
    { label: 'Runs in the last 7 days', value: runs },
    { label: 'Errors', value: failed, tone: failed ? 'text-red-700' : undefined },
    { label: 'Needs review', value: h.waiting, href: '/automations?view=workflows&tab=review', tone: h.waiting ? 'text-amber-700' : undefined },
    { label: 'Messages sent this month', value: sentMonth, hint: s.settings.sending.provider ? undefined : 'Sandbox: provider not set up' },
  ];
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {cards.map((c) => (
          <button key={c.label} type="button" disabled={!c.href} onClick={() => c.href && nav.push(c.href)} className={`${CARD} p-4 text-left ${c.href ? 'hover:border-primary-300' : 'cursor-default'}`}>
            <div className="text-xs font-semibold text-gray-500">{c.label}</div>
            <div className={`mt-1 font-heading text-3xl font-bold ${c.tone ?? 'text-gray-900 dark:text-white'}`}>{c.value}</div>
            {c.hint && <div className="mt-0.5 text-xs text-gray-500">{c.hint}</div>}
          </button>
        ))}
      </div>
      <SendingCard />
      <section>
        <h2 className="mb-1 font-heading text-xl font-bold text-gray-900 dark:text-white">Stage view</h2>
        <p className="mb-4 text-sm text-gray-500">What runs when a record reaches each stage. Drag building blocks onto a stage, or click one to choose where it goes.</p>
        <BoardTab pipeline={pipeline} setPipeline={setPipeline} journeyId={journeyId} setJourneyId={setJourneyId} focusStage={stageParam} />
      </section>
    </div>
  );
}
