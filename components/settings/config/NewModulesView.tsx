'use client';

/*
  Settings › New Modules (prototype only). One switch per new module, so a
  presentation shows only the modules chosen for it.

  - "Show new modules": the master switch. Off hides every module and the
    prototype looks like the live app; the module switches keep their state.
  - Each module: a switch for the module, plus "Include the Complete version"
    when it has one (client-call modules).
  - Show all / Hide all / Reset.

  The switches are the same ones as the dashboard's New Features panel
  (features/lib/feature-visibility.ts): changing one here changes it there.
  Hiding is display only: nothing is deleted. Saved in this browser.
*/
import React from 'react';
import Link from 'next/link';
import { Eye, EyeOff, Layers, RotateCcw, Sparkles } from 'lucide-react';
import { SettingsPage } from '@/components/settings/SettingsSidebar';
import { SettingsCard } from '@/components/settings/config/ui';
import { Button } from '@/components/ui/button';
import { Checkbox, Switch } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { FEATURES, type FeatureDef } from '@/features/lib/feature-registry';
import { useVisibility } from '@/features/lib/feature-visibility';
import { cn } from '@/lib/utils';

const GROUPS: { id: FeatureDef['group']; title: string; subtitle: string; icon: React.ReactNode }[] = [
  { id: 'sep30', title: 'From the client calls', subtitle: 'Each has a Minimal version, and most also have a Complete version.', icon: <Sparkles /> },
  { id: 'built', title: 'Core modules', subtitle: 'Built and delivered as one package each.', icon: <Layers /> },
];

export function NewModulesView() {
  const v = useVisibility();
  const { toast } = useToast();
  const showing = v.showNew ? FEATURES.filter((f) => v.rows[f.key]?.minimal).length : 0;

  const setModule = (f: FeatureDef, on: boolean) => {
    v.setMinimal(f.key, on);
    toast(`${f.name} ${on ? 'shown' : 'hidden'}.`);
  };

  return (
    <SettingsPage
      title="New Modules"
      subtitle="Choose which new modules show in the prototype, so a presentation shows only what you want to present. Hidden modules are not deleted."
      actions={
        <>
          <Button variant="secondary" icon={<Eye className="h-4 w-4" />} disabled={!v.showNew} onClick={() => { v.setEvery(true); toast('Every module shown.'); }}>Show all</Button>
          <Button variant="secondary" icon={<EyeOff className="h-4 w-4" />} disabled={!v.showNew} onClick={() => { v.setEvery(false); toast('Every module hidden.'); }}>Hide all</Button>
          <Button variant="secondary" icon={<RotateCcw className="h-4 w-4" />} onClick={() => { v.reset(); toast('Modules reset to the defaults.'); }}>Reset</Button>
        </>
      }
    >
      <div className="space-y-8">
        <SettingsCard>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-heading text-lg font-bold text-gray-900">Show new modules</p>
              <p className="mt-1 text-sm text-gray-500">
                {v.showNew
                  ? `${showing} of ${FEATURES.length} modules showing.`
                  : 'Every new module is hidden. The prototype looks like the live app.'}
              </p>
            </div>
            <Switch checked={v.showNew} onChange={v.setShowNew} label="Show new modules" />
          </div>
        </SettingsCard>

        {GROUPS.map((g) => {
          const list = FEATURES.filter((f) => f.group === g.id);
          const on = v.showNew ? list.filter((f) => v.rows[f.key]?.minimal).length : 0;
          return (
            <SettingsCard
              key={g.id}
              icon={g.icon}
              title={g.title}
              subtitle={`${g.subtitle} ${on} of ${list.length} showing.`}
              className={cn(!v.showNew && 'opacity-60')}
            >
              <ul className="divide-y divide-gray-100" aria-disabled={!v.showNew}>
                {list.map((f) => (
                  <ModuleRow key={f.key} f={f} disabled={!v.showNew || !f.built} onModule={(on) => setModule(f, on)} />
                ))}
              </ul>
            </SettingsCard>
          );
        })}

        <p className="text-sm text-gray-500">
          The same switches are in the <Link href="/dashboard#new-features" className="font-semibold text-primary-600 hover:text-primary-700 hover:underline">New Features panel</Link> on the dashboard, with a tour for each module.
        </p>
      </div>
    </SettingsPage>
  );
}

function ModuleRow({ f, disabled, onModule }: { f: FeatureDef; disabled: boolean; onModule: (on: boolean) => void }) {
  const v = useVisibility();
  const row = v.rows[f.key];
  const on = !!row?.minimal;
  return (
    <li className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className={cn('text-sm font-bold', on ? 'text-gray-900' : 'text-gray-500')}>{f.name}</p>
        <p className="mt-0.5 text-sm text-gray-500">{f.breakdown}</p>
        {f.where.length > 0 && (
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {f.where.map((w) => (
              <Link key={w.href + w.label} href={w.href} className="font-semibold text-primary-600 hover:text-primary-700 hover:underline">{w.label}</Link>
            ))}
          </p>
        )}
        {f.parts.complete.length > 0 && (
          <div className="mt-2">
            <Checkbox
              checked={!!row?.complete}
              disabled={disabled || !on}
              onChange={(c) => v.setComplete(f.key, c)}
              label={<span className="text-xs font-medium text-gray-600">Include the Complete version</span>}
            />
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2 pt-0.5">
        <span className={cn('text-xs font-bold', on ? 'text-primary-700' : 'text-gray-400')} aria-hidden>{on ? 'Shown' : 'Hidden'}</span>
        <Switch checked={on} disabled={disabled} onChange={onModule} label={`Show ${f.name}`} />
      </div>
    </li>
  );
}
