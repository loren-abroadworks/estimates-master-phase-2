'use client';

/*
  Sources filter on the Lead Pipeline toolbar (CRM Part 1, 4; was a single
  dropdown, CRM-M6). Multi-select chips: "All sources", plus every source that
  has leads, in the organisation's list order. Nothing picked = All sources.
  The choice is remembered per user in this browser.
*/
import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export function useSourceFilter(userId: string) {
  const key = `emts-lead-source-filter:${userId}`;
  const [value, setValue] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      // Older saves kept one source as plain text.
      const v: unknown = raw ? (raw.startsWith('[') ? JSON.parse(raw) : [raw]) : [];
      setValue(Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    } catch {
      setValue([]);
    }
  }, [key]);
  const set = (v: string[]) => {
    setValue(v);
    try {
      if (v.length) localStorage.setItem(key, JSON.stringify(v));
      else localStorage.removeItem(key);
    } catch {
      /* private window: the filter just isn't remembered */
    }
  };
  return [value, set] as const;
}

const chip = (on: boolean) =>
  cn(
    'inline-flex min-h-8 items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold transition-colors',
    on ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-900',
  );

export function SourceChips({ sources, value, onChange }: { sources: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const all = value.length === 0;
  const toggle = (s: string) => onChange(value.includes(s) ? value.filter((x) => x !== s) : [...value, s]);
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2" role="group" aria-label="Sources" data-tour="crm-source">
      <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Sources</span>
      <button type="button" aria-pressed={all} onClick={() => onChange([])} className={chip(all)}>
        {all && <Check className="h-3 w-3" />} All sources
      </button>
      {sources.map((s) => {
        const on = value.includes(s);
        return (
          <button key={s} type="button" aria-pressed={on} onClick={() => toggle(s)} className={chip(on)}>
            {on && <Check className="h-3 w-3" />} {s}
          </button>
        );
      })}
    </div>
  );
}
