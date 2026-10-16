'use client';

/*
  Lead Pipeline toolbar menus. The live page has one toolbar row (search left,
  Board/Table right); the Phase 2 controls fold into that row as two compact
  dropdowns beside the view switch instead of adding rows:

  - PipelineMenu: Sales / Production / added pipelines, plus "Add pipeline"
    (30 Sep call, CRM-M1, CRM-C2).
  - SourceChips: multi-select sources (CRM Part 1, 4; CRM-M6). Nothing picked =
    All sources; remembered per user in this browser. "Group the board by source"
    (CRM-C1) is a switch at the foot of the same menu.
*/
import { useEffect, useState } from 'react';
import * as Popover from '@radix-ui/react-popover';
import { Check, ChevronDown, Columns3, Filter, Plus } from 'lucide-react';
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

/* ---------- Shared compact dropdown (same height and weight as the view switch) ---------- */

function ToolbarMenu({
  icon, label, value, active, children, tour, width = 'w-64',
}: {
  icon: React.ReactNode;
  /** Short uppercase name shown before the value, like the view switch labels. */
  label: string;
  value: string;
  /** Something other than the default is chosen: the trigger takes the primary tint. */
  active?: boolean;
  children: React.ReactNode;
  /** Feature-tour anchor (features/components/tour/feature-tours.ts). */
  tour?: "crm-source" | "crm-pipelines";
  width?: string;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          data-tour={tour satisfies "crm-source" | "crm-pipelines" | undefined}
          aria-label={`${label}: ${value}`}
          className={cn(
            'group flex h-[42px] min-w-0 cursor-pointer items-center gap-2 rounded-xl border px-3 transition-all',
            'focus:outline-none focus-visible:ring-4 focus-visible:ring-primary-100 data-[state=open]:border-primary-400',
            active ? 'border-primary-200 bg-primary-50 text-primary-700' : 'border-gray-200 bg-white text-gray-700 shadow-sm hover:border-gray-300 hover:bg-gray-50',
          )}
        >
          <span className={cn('shrink-0', active ? 'text-primary-600' : 'text-gray-400')}>{icon}</span>
          <span className={cn('text-[10px] font-bold uppercase', active ? 'text-primary-600' : 'text-gray-500')}>{label}</span>
          <span className="max-w-[9rem] truncate text-sm font-semibold">{value}</span>
          <ChevronDown className="size-4 shrink-0 text-gray-400 transition-transform duration-300 group-data-[state=open]:rotate-180" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} className={cn('z-[200] rounded-[0.625rem] border border-gray-200 bg-white p-2 shadow-xl', width)}>
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** One row: a check or checkbox, the label, an optional trailing node. */
function Row({ on, multi, label, onClick, trailing, close }: { on: boolean; multi?: boolean; label: React.ReactNode; onClick: () => void; trailing?: React.ReactNode; close?: boolean }) {
  const row = (
    <button
      type="button"
      role={multi ? 'menuitemcheckbox' : 'menuitemradio'}
      aria-checked={on}
      onClick={onClick}
      className={cn('flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-primary-50 hover:text-primary-800 focus:bg-primary-50 focus:outline-none', on && 'font-semibold text-gray-900')}
    >
      {multi ? (
        <span className={cn('flex size-4 shrink-0 items-center justify-center rounded border', on ? 'border-primary-600 bg-primary-600' : 'border-gray-300 bg-white')}>
          {on && <Check className="size-3.5 text-white" strokeWidth={3} />}
        </span>
      ) : (
        <Check className={cn('size-4 shrink-0 text-primary-600', !on && 'invisible')} />
      )}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </button>
  );
  return close ? <Popover.Close asChild>{row}</Popover.Close> : row;
}

const Heading = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center gap-2 px-3 pb-1 pt-1.5 text-xs font-bold uppercase tracking-wider text-gray-500">{children}</div>
);

/* ---------- Pipeline ---------- */

export function PipelineMenu({
  pipelines, value, onChange, onAdd, badge,
}: {
  pipelines: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
  /** Shown when added pipelines are on. */
  onAdd?: () => void;
  /** Version badge for the review build (shown only when NEW badges are on). */
  badge?: React.ReactNode;
}) {
  const current = pipelines.find((p) => p.id === value)?.name ?? 'Sales';
  return (
    <ToolbarMenu icon={<Columns3 className="size-4" />} label="Pipeline" value={current} tour="crm-pipelines" width="w-60">
      <div role="menu" aria-label="Pipeline">
        <Heading>Pipeline {badge}</Heading>
        {pipelines.map((p) => <Row key={p.id} on={p.id === value} label={p.name} onClick={() => onChange(p.id)} close />)}
        {onAdd && (
          <>
            <div className="my-1.5 h-px bg-gray-100" />
            <Popover.Close asChild>
              <button type="button" onClick={onAdd} className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-primary-600 hover:bg-primary-50 focus:bg-primary-50 focus:outline-none">
                <Plus className="size-4" /> Add pipeline
              </button>
            </Popover.Close>
          </>
        )}
      </div>
    </ToolbarMenu>
  );
}

/* ---------- Sources (+ group by source) ---------- */

export function SourceChips({
  sources, value, onChange, groupBySource, onGroupBySource, groupBadge,
}: {
  sources: string[];
  value: string[];
  onChange: (v: string[]) => void;
  /** CRM-C1: when given, the menu ends with a "Group the board by source" switch. */
  groupBySource?: boolean;
  onGroupBySource?: (v: boolean) => void;
  groupBadge?: React.ReactNode;
}) {
  const all = value.length === 0;
  const toggle = (s: string) => onChange(value.includes(s) ? value.filter((x) => x !== s) : [...value, s]);
  const label = all ? 'All' : value.length === 1 ? value[0]! : `${value.length} selected`;
  return (
    <ToolbarMenu icon={<Filter className="size-4" />} label="Sources" value={label} active={!all} tour="crm-source">
      <div role="menu" aria-label="Sources">
        <div className="flex items-center justify-between pr-1">
          <Heading>Sources</Heading>
          {!all && (
            <button type="button" onClick={() => onChange([])} className="cursor-pointer rounded-md px-2 py-1 text-xs font-semibold text-primary-600 hover:bg-primary-50">
              Clear
            </button>
          )}
        </div>
        <div className="max-h-64 overflow-y-auto">
          <Row multi on={all} label="All sources" onClick={() => onChange([])} />
          {sources.map((s) => <Row key={s} multi on={value.includes(s)} label={s} onClick={() => toggle(s)} />)}
        </div>
        {onGroupBySource && (
          <>
            <div className="my-1.5 h-px bg-gray-100" />
            <button
              type="button"
              role="menuitemcheckbox"
              aria-checked={!!groupBySource}
              data-tour="crm-groupby"
              onClick={() => onGroupBySource(!groupBySource)}
              className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-gray-700 hover:bg-primary-50 focus:bg-primary-50 focus:outline-none"
            >
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 font-semibold text-gray-900">Group board by source {groupBadge}</span>
                <span className="block text-xs text-gray-500">Columns become sources instead of stages.</span>
              </span>
              <span className={cn('relative inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full transition-colors', groupBySource ? 'bg-primary-700' : 'bg-gray-200')}>
                <span className={cn('block size-4 rounded-full bg-white shadow-sm transition-transform', groupBySource ? 'translate-x-[calc(100%-2px)]' : 'translate-x-px')} />
              </span>
            </button>
          </>
        )}
      </div>
    </ToolbarMenu>
  );
}
