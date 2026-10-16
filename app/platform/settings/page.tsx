'use client';

/*
  Admin Portal › Settings: the yearly sales goal and monthly revenue target
  behind the dashboard's Yearly Sales and Monthly Revenue cards.
*/
import React, { useState } from 'react';
import { PlatformShell } from '@/components/platform/PlatformShell';
import { PageHeader } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { useSingleton } from '@/lib/store';

export default function PlatformSettingsPage() {
  return <PlatformShell title="Settings"><Settings /></PlatformShell>;
}

function Settings() {
  const [settings, setSettings] = useSingleton('platformSettings');
  const { toast } = useToast();
  const [goal, setGoal] = useState(String(settings.yearlySalesGoal));
  const [target, setTarget] = useState(String(settings.monthlyRevenueTarget));
  const bad = (v: string) => v.trim() === '' || !(Number(v) >= 0);
  const save = () => {
    if (bad(goal) || bad(target)) return;
    setSettings({ yearlySalesGoal: Number(goal), monthlyRevenueTarget: Number(target) });
    toast('Goals saved');
  };
  return (
    <>
      <PageHeader title="Settings" subtitle="Goals shown on the Admin Portal dashboard." />
      <div className="max-w-2xl rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Yearly sales goal ($)" error={bad(goal) ? 'Enter 0 or more' : undefined} hint="Yearly Sales card">
            <Input type="number" min={0} value={goal} onChange={(e) => setGoal(e.target.value)} invalid={bad(goal)} />
          </Field>
          <Field label="Monthly revenue target ($)" error={bad(target) ? 'Enter 0 or more' : undefined} hint="Monthly Revenue card">
            <Input type="number" min={0} value={target} onChange={(e) => setTarget(e.target.value)} invalid={bad(target)} />
          </Field>
        </div>
        <div className="mt-6 flex justify-end"><Button onClick={save} disabled={bad(goal) || bad(target)}>Save goals</Button></div>
      </div>
    </>
  );
}
