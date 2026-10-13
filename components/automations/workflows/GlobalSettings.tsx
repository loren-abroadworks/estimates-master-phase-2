'use client';

/*
  Automation › Global Workflow Settings: settings every workflow shares.
    - General: sending provider plan, texting release, working days, job scheduling.
    - Stuck alerts: how long a record may sit in each stage before someone is told.
    - Customer messages: the email and text library (shared with Settings › Automated Messages and SMS Templates).
    - Templates: ready-made and saved workflows.
*/
import { useState } from 'react';
import { AlarmClock, LayoutTemplate, Mail, Settings2 } from 'lucide-react';
import type { PipelineModule } from '@/lib/automations/types';
import { MODULE_LABEL, PIPELINES, stagesOf } from '@/lib/automations/registry';
import { stuckSettingFor } from '@/lib/automations/engine';
import { useAuto } from '@/lib/automations/store';
import { useNav, useParam } from '@/features/lib/navigation';
import { Badge, Button } from '@/features/components/ui';
import { cn } from '@/lib/utils';
import { usePerms } from '../hooks';
import { ModuleSettingsForm } from '../modals';
import { StuckAlertModal } from '../BoardTab';
import { MessagesTab } from '../MessagesTab';
import { TemplatesTab } from '../TemplatesTab';
import { CARD } from '../shared';

type Section = 'general' | 'stuck' | 'messages' | 'templates';

function hours(h: number) {
  return h % 24 === 0 ? `${h / 24} ${h / 24 === 1 ? 'day' : 'days'}` : `${h} ${h === 1 ? 'hour' : 'hours'}`;
}

function StuckAlerts() {
  const s = useAuto((x) => x);
  const { manage } = usePerms();
  const [edit, setEdit] = useState<{ pipeline: PipelineModule; stage: string }>();
  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600 dark:text-gray-300">If a record sits in a stage longer than this, its assigned person is told (or the business owner if nobody is assigned), once a day, up to 3 times. Folders made from the Commercial template double these times.</p>
      {PIPELINES.map((p) => (
        <div key={p}>
          <h3 className="mb-2 font-bold text-gray-900 dark:text-white">{MODULE_LABEL[p]}</h3>
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
            {stagesOf(p).filter((st) => !st.terminal).map((st) => {
              const set = stuckSettingFor(s, p, st.value);
              return (
                <li key={st.value} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: st.colour }} aria-hidden />
                  <span className="flex-1 font-semibold">{st.label}</span>
                  {set?.enabled ? <span className="flex items-center gap-1 text-amber-800"><AlarmClock className="h-3.5 w-3.5" />After {hours(set.hours)}{set.from !== 'STAGE_ENTRY' ? ` past the ${set.from === 'appointmentAt' ? 'appointment' : set.from === 'startDate' ? 'start date' : 'planned end'}` : ''}</span> : <Badge tone="gray">Off</Badge>}
                  {manage && <Button size="xs" onClick={() => setEdit({ pipeline: p, stage: st.value })}>Change</Button>}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {edit && <StuckAlertModal pipeline={edit.pipeline} stage={edit.stage} onClose={() => setEdit(undefined)} />}
    </div>
  );
}

export function GlobalSettings() {
  const nav = useNav();
  const section = (useParam('section') as Section | undefined) ?? 'general';
  const items: { value: Section; label: string; icon: React.ReactNode }[] = [
    { value: 'general', label: 'General', icon: <Settings2 className="h-4 w-4" /> },
    { value: 'stuck', label: 'Stuck alerts', icon: <AlarmClock className="h-4 w-4" /> },
    { value: 'messages', label: 'Customer messages', icon: <Mail className="h-4 w-4" /> },
    { value: 'templates', label: 'Templates', icon: <LayoutTemplate className="h-4 w-4" /> },
  ];
  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <nav className="flex shrink-0 gap-1 overflow-x-auto lg:w-56 lg:flex-col" aria-label="Workflow settings">
        {items.map((i) => (
          <button key={i.value} type="button" aria-current={section === i.value ? 'page' : undefined} onClick={() => nav.push(`/automations?view=settings&section=${i.value}`)}
            className={cn('flex shrink-0 items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm font-semibold', section === i.value ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300')}>
            {i.icon}{i.label}
          </button>
        ))}
      </nav>
      <div className="min-w-0 flex-1">
        <h1 className="mb-4 font-heading text-2xl font-bold text-gray-900 dark:text-white">{items.find((i) => i.value === section)?.label}</h1>
        {section === 'general' ? <div className={`${CARD} p-6`}><ModuleSettingsForm /></div>
          : section === 'stuck' ? <StuckAlerts />
          : section === 'messages' ? <MessagesTab />
          : <TemplatesTab />}
      </div>
    </div>
  );
}
