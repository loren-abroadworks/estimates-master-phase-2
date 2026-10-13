'use client';

/*
  The builder canvas (Figma screens 2–4): trigger cards in a row (any of
  them starts the workflow) with "Add new trigger", the steps below joined
  by "+" dots, and END. Clicking "+" opens Add action; clicking a trigger
  slot opens Add trigger; clicking a card opens its settings in the same
  side panel. Zoom, pan (hand), fit, a minimap and sticky notes.

  The lists in the panels come from lib/automations/menu.ts (presets over
  the registry). An action that can't run after these triggers, or that
  needs something not switched on, is shown locked with the reason.
*/
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDown, ArrowUp, BarChart3, ChevronDown, ChevronLeft, ChevronRight, Copy, Expand, Hand, Lock, Maximize2, Minus, MoreHorizontal, Pencil, Plus, Search, StickyNote, Trash2, X,
} from 'lucide-react';
import * as DM from '@radix-ui/react-dropdown-menu';
import type { AutomationCondition, AutomationModule, AutomationStep, AutomationTrigger } from '@/lib/automations/types';
import { boardPlacement, pipelineOf, stepAllowedAt, stepDef, triggerDef, variablesFor } from '@/lib/automations/registry';
import { conditionPhrase, stepPhrase, triggerPhrase } from '@/lib/automations/summary';
import { fieldVisible, validateStep, validateTrigger, type Problem } from '@/lib/automations/validation';
import { blockLocked, defaultConfig, uniqueKey } from '@/lib/automations/drop-rules';
import { ACTION_GROUPS, ACTION_PRESETS, TRIGGER_GROUPS, TRIGGER_PRESETS, type ActionPreset, type TriggerPreset } from '@/lib/automations/menu';
import { newCondId, newStepId } from '@/lib/automations/store';
import { useDb as useFeatureDb } from '@/features/lib/store';
import { toast } from '@/features/lib/toast';
import { Button, Input } from '@/features/components/ui';
import { cn } from '@/lib/utils';
import { useNames } from '../hooks';
import { ConditionsEditor, RegistryInput, StepSettingsForm } from '../StepSettings';
import { MessageEditor } from '../MessageEditor';
import { useDropContext } from '../building-blocks/use-drop-rules';
import { Icon } from '../shared';
import { triggerIcon, triggerLabel } from './shared';

export interface CanvasValue {
  trigger: AutomationTrigger;
  extraTriggers?: AutomationTrigger[];
  conditions: AutomationCondition[];
  steps: AutomationStep[];
  notes?: { id: string; text: string }[];
}

export type Panel =
  | { kind: 'triggers'; index: number | 'new' }
  | { kind: 'trigger'; index: number | 'new'; draft: AutomationTrigger; conditions: AutomationCondition[] }
  | { kind: 'actions'; at: number }
  | { kind: 'action'; at: number; step: AutomationStep; isNew: boolean };

const TILE: Partial<Record<AutomationModule, string>> = {
  CUSTOMER_MESSAGE: 'bg-green-50 text-green-600', TEAM: 'bg-green-50 text-green-600',
  LEAD: 'bg-blue-50 text-blue-600', CONTACT: 'bg-blue-50 text-blue-600', CALENDAR: 'bg-purple-50 text-purple-600',
  ESTIMATE: 'bg-purple-50 text-purple-600', JOB: 'bg-purple-50 text-purple-600', SCHEDULING: 'bg-purple-50 text-purple-600', WORK_ORDER: 'bg-purple-50 text-purple-600',
  INVOICE: 'bg-amber-50 text-amber-600', TIMING: 'bg-gray-100 text-gray-600',
};

function stepIcon(st: AutomationStep): string {
  return ACTION_PRESETS.find((p) => p.type === st.type && Object.entries(p.config ?? {}).every(([k, v]) => st.config[k] === v))?.icon ?? stepDef(st.type)?.icon ?? 'Circle';
}
function stepTitle(st: AutomationStep): string {
  return ACTION_PRESETS.find((p) => p.type === st.type && p.config && Object.entries(p.config).every(([k, v]) => st.config[k] === v))?.label
    ?? ACTION_PRESETS.find((p) => p.type === st.type && !p.config)?.label ?? stepDef(st.type)?.title ?? 'Removed step';
}

const triggersOf = (v: CanvasValue) => [v.trigger, ...(v.extraTriggers ?? [])];

/* ---------- Panels ---------- */

function PanelShell({ title, subtitle, onClose, onBack, children, footer }: { title: string; subtitle: string; onClose: () => void; onBack?: () => void; children: ReactNode; footer?: ReactNode }) {
  const [wide, setWide] = useState(false);
  return (
    <aside className={cn('flex h-full shrink-0 flex-col border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800', wide ? 'w-[min(720px,100%)]' : 'w-full sm:w-[420px]')} aria-label={title}>
      <div className="flex items-start gap-2 px-5 pb-3 pt-5">
        {onBack && <button type="button" onClick={onBack} className="mt-0.5 rounded-lg p-1 text-gray-500 hover:bg-gray-100" aria-label="Back"><ChevronLeft className="h-5 w-5" /></button>}
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-xl font-bold text-gray-900 dark:text-white">{title}</h2>
          <p className="text-sm text-gray-500">{subtitle}</p>
        </div>
        <button type="button" onClick={() => setWide((w) => !w)} className="hidden rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 sm:block" aria-label={wide ? 'Narrow panel' : 'Widen panel'}><Expand className="h-4 w-4" /></button>
        <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100" aria-label="Close panel"><X className="h-4 w-4" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer && <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3 dark:border-gray-700">{footer}</div>}
    </aside>
  );
}

function PresetList<T extends { id: string; group: string; label: string; icon: string }>({ groups, items, lockedReason, onPick, searchLabel, tabs }: {
  groups: string[]; items: T[]; lockedReason: (p: T) => string | undefined; onPick: (p: T) => void; searchLabel: string; tabs: [string, string];
}) {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState(0);
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const match = items.filter((p) => !q || `${p.label} ${p.group}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <div className="px-5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input aria-label={searchLabel} placeholder={searchLabel} value={q} onChange={(e) => setQ(e.target.value)} className="h-10 pl-9" />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 border-b border-gray-200 px-5 dark:border-gray-700" role="tablist">
        {tabs.map((t, i) => (
          <button key={t} role="tab" aria-selected={tab === i} onClick={() => setTab(i)} className={cn('-mb-px border-b-2 pb-2.5 text-sm font-semibold', tab === i ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-500')}>{t}</button>
        ))}
      </div>
      {tab === 1 ? (
        <p className="px-5 py-10 text-center text-sm text-gray-500">No integrations are connected yet. QuickBooks and Meta connect from Settings; workflow integrations need the backend.</p>
      ) : (
        <div className="px-3 pb-4">
          {groups.map((g) => {
            const list = match.filter((p) => p.group === g);
            if (!list.length) return null;
            return (
              <div key={g} className="border-b border-gray-100 py-2 last:border-0 dark:border-gray-700">
                <button type="button" onClick={() => setClosed((c) => ({ ...c, [g]: !c[g] }))} aria-expanded={!closed[g]} className="flex w-full items-center justify-between px-2 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-500">
                  {g}{closed[g] ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                {!closed[g] && list.map((p) => {
                  const locked = lockedReason(p);
                  return (
                    <button key={p.id} type="button" disabled={!!locked} onClick={() => onPick(p)} title={locked}
                      className={cn('flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left text-[15px]', locked ? 'cursor-not-allowed text-gray-400' : 'text-gray-800 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-gray-700')}>
                      <Icon name={p.icon} className={cn('h-5 w-5 shrink-0', locked ? 'text-gray-300' : 'text-primary-600')} />
                      <span className="min-w-0 flex-1">
                        <span className="block">{p.label}</span>
                        {locked && <span className="block text-xs text-gray-500">{locked}</span>}
                      </span>
                      {locked ? <Lock className="h-3.5 w-3.5" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                    </button>
                  );
                })}
              </div>
            );
          })}
          {!match.length && <p className="px-2 py-6 text-center text-sm text-gray-500">Nothing matches.</p>}
        </div>
      )}
    </div>
  );
}

/* ---------- The canvas ---------- */

export function WorkflowCanvas({ value, onChange, readOnly, initialPanel, stats, onStats, problems = [] }: {
  value: CanvasValue;
  onChange: (v: CanvasValue) => void;
  readOnly?: boolean;
  initialPanel?: Panel;
  /** Runs per trigger card's "Stats" link. */
  stats?: number;
  onStats?: () => void;
  problems?: Problem[];
}) {
  const names = useNames();
  const fdb = useFeatureDb((d) => d);
  const ctx = useDropContext();
  const [panel, setPanel] = useState<Panel | undefined>(initialPanel);
  const [zoom, setZoom] = useState(1);
  const [hand, setHand] = useState(false);
  const [tried, setTried] = useState(false);
  useEffect(() => setTried(false), [panel?.kind]);
  const [msgEditor, setMsgEditor] = useState<{ channel: 'EMAIL' | 'SMS'; cb: (id: string) => void }>();
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; l: number; t: number } | undefined>(undefined);
  const triggers = triggersOf(value);
  const hasTrigger = !!value.trigger.type;
  const mainPlace = boardPlacement(value.trigger);
  const vars = variablesFor(mainPlace.pipeline, mainPlace.stage);
  useEffect(() => { if (initialPanel) setPanel(initialPanel); }, [initialPanel]);

  const set = (patch: Partial<CanvasValue>) => onChange({ ...value, ...patch });
  const setSteps = (steps: AutomationStep[]) => set({ steps: steps.map((s, i) => ({ ...s, order: i })) });

  /* ---- triggers ---- */
  const openTrigger = (index: number | 'new') => {
    if (readOnly) return;
    if (index === 'new') return setPanel({ kind: 'triggers', index });
    const t = triggers[index]!;
    if (!t.type) return setPanel({ kind: 'triggers', index });
    setPanel({ kind: 'trigger', index, draft: JSON.parse(JSON.stringify(t)), conditions: value.conditions });
  };
  const pickTrigger = (p: TriggerPreset, index: number | 'new') => {
    const d = triggerDef(p.type!)!;
    const config: Record<string, unknown> = {};
    for (const f of d.fields) if (f.defaultValue !== undefined) config[f.key] = f.defaultValue;
    const extra = (p.conditions ?? []).filter((c) => !value.conditions.some((x) => x.field === c.field)).map((c) => ({ ...c, id: newCondId() }));
    setPanel({ kind: 'trigger', index, draft: { type: p.type!, module: p.module, config: { ...config, ...(p.config ?? {}) } }, conditions: [...value.conditions, ...extra] });
  };
  const saveTrigger = (p: Extract<Panel, { kind: 'trigger' }>) => {
    const errs = validateTrigger(p.draft);
    if (errs.length) return toast.error('Finish the trigger', errs[0]!.message);
    const list = [...triggers];
    if (p.index === 'new') { if (!hasTrigger) list[0] = p.draft; else list.push(p.draft); }
    else list[p.index] = p.draft;
    onChange({ ...value, trigger: list[0]!, extraTriggers: list.slice(1), conditions: p.conditions });
    setPanel(undefined);
  };
  const deleteTrigger = (index: number) => {
    const list = triggers.filter((_, i) => i !== index);
    onChange({ ...value, trigger: list[0] ?? { type: '', module: value.trigger.module, config: {} }, extraTriggers: list.slice(1) });
    setPanel(undefined);
  };
  const copyTrigger = (index: number) => set({ extraTriggers: [...(value.extraTriggers ?? []), JSON.parse(JSON.stringify(triggers[index]))] });

  /* ---- actions ---- */
  const actionLocked = (p: ActionPreset): string | undefined => {
    if (p.locked) return p.locked;
    const def = stepDef(p.type!);
    if (!def) return 'Not available.';
    const lock = blockLocked({ kind: 'step', type: p.type! }, ctx);
    if (lock) return lock;
    if (hasTrigger) {
      const results = triggers.filter((t) => t.type).map((t) => { const pl = boardPlacement(t); return stepAllowedAt(def, pl.pipeline, pl.stage); });
      const bad = results.find((r) => !r.ok);
      if (bad && !bad.ok && results.every((r) => !r.ok)) return bad.reason;
    }
    const key = uniqueKey(p.type!, { ...defaultConfig(p.type!), ...(p.config ?? {}) });
    if (key && value.steps.some((s) => uniqueKey(s.type, s.config) === key)) return 'This workflow already has this step.';
    if (value.steps.length >= 15) return 'A workflow can have up to 15 steps.';
    return undefined;
  };
  const pickAction = (p: ActionPreset, at: number) => {
    const step: AutomationStep = { id: newStepId(), order: 0, type: p.type!, mode: stepDef(p.type!)?.mode === 'ASK_BY_DEFAULT' ? 'ASK' : 'AUTO', conditions: [], config: { ...defaultConfig(p.type!, { financialSettings: fdb.financialSettings }), ...(p.config ?? {}) } };
    setPanel({ kind: 'action', at, step, isNew: true });
  };
  const saveAction = (p: Extract<Panel, { kind: 'action' }>) => {
    const errs = validateStep(p.step, vars);
    if (errs.length) { setTried(true); return toast.error('Finish this step', errs[0]!.message); }
    const steps = [...value.steps];
    if (p.isNew) steps.splice(p.at, 0, p.step);
    else steps[p.at] = p.step;
    setSteps(steps);
    setPanel(undefined);
  };
  const move = (i: number, d: -1 | 1) => { const s = [...value.steps]; const [x] = s.splice(i, 1); s.splice(i + d, 0, x!); setSteps(s); };
  const duplicateStep = (i: number) => { const s = [...value.steps]; s.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(s[i])), id: newStepId() }); setSteps(s); };
  const removeStep = (i: number) => { setSteps(value.steps.filter((_, n) => n !== i)); setPanel(undefined); };

  /* ---- notes ---- */
  const notes = value.notes ?? [];

  /* ---- pan ---- */
  const onDown = (e: React.MouseEvent) => {
    if (!hand || !scroller.current) return;
    drag.current = { x: e.clientX, y: e.clientY, l: scroller.current.scrollLeft, t: scroller.current.scrollTop };
  };
  const onMove = (e: React.MouseEvent) => {
    if (!drag.current || !scroller.current) return;
    scroller.current.scrollLeft = drag.current.l - (e.clientX - drag.current.x);
    scroller.current.scrollTop = drag.current.t - (e.clientY - drag.current.y);
  };

  const activeAt = panel?.kind === 'actions' || (panel?.kind === 'action' && panel.isNew) ? panel.at : undefined;
  const AddDot = ({ at }: { at: number }) => (
    <div className="relative flex flex-col items-center">
      <span className="h-3 w-px bg-gray-300" />
      <button type="button" disabled={readOnly} onClick={() => setPanel({ kind: 'actions', at })} aria-label={`Add a step at position ${at + 1}`}
        className={cn('flex h-6 w-6 items-center justify-center rounded-full border transition-colors', activeAt === at ? 'border-primary-600 bg-primary-600 text-white' : 'border-gray-300 bg-white text-gray-500 hover:border-primary-400 hover:text-primary-600 dark:bg-gray-800', readOnly && 'cursor-default opacity-60')}>
        <Plus className="h-3.5 w-3.5" />
      </button>
      {activeAt === at && <span className="absolute left-[calc(50%+22px)] top-1.5 whitespace-nowrap rounded-md bg-gray-900 px-2.5 py-1 text-xs font-semibold text-white">Adding step {at + 1}</span>}
      <span className="h-3 w-px bg-gray-300" />
    </div>
  );

  const stepProblems = (id: string) => problems.filter((p) => p.where === id);

  return (
    <div className="flex min-h-0 flex-1">
      <div className="relative min-w-0 flex-1">
        <div ref={scroller} onMouseDown={onDown} onMouseMove={onMove} onMouseUp={() => (drag.current = undefined)} onMouseLeave={() => (drag.current = undefined)}
          className={cn('absolute inset-0 overflow-auto', hand && 'cursor-grab active:cursor-grabbing select-none')}
          style={{ backgroundImage: 'radial-gradient(circle, rgba(148,163,184,0.35) 1px, transparent 1px)', backgroundSize: '22px 22px' }}>
          <div className="flex min-h-full min-w-full justify-center px-10 pb-40 pt-16" style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}>
            <div className="flex flex-col items-center">
              {/* Triggers */}
              {!hasTrigger && !value.extraTriggers?.length ? (
                <button type="button" disabled={readOnly} onClick={() => openTrigger('new')} className="flex h-[52px] w-[240px] items-center justify-center gap-2 rounded-xl border-2 border-primary-600 bg-primary-50 font-semibold text-primary-700 hover:bg-primary-100">
                  <Plus className="h-4 w-4" /> New trigger
                </button>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="flex items-start gap-6">
                    {triggers.map((t, i) => (
                      <div key={i} className="w-[260px] rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
                        <button type="button" onClick={() => openTrigger(i)} className="flex w-full items-start gap-3 p-3 text-left">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Icon name={triggerIcon(t)} /></span>
                          <span className="min-w-0">
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-primary-700">Trigger</span>
                            <span className="block font-semibold text-primary-700">{triggerLabel(t)}</span>
                            <span className="block text-xs text-gray-500">{t.type ? triggerPhrase(t).replace(/^When /, '').replace(/^./, (x) => x.toUpperCase()) : 'Pick the event that starts this workflow'}</span>
                          </span>
                        </button>
                        {i === 0 && value.conditions.length > 0 && <div className="border-t border-gray-100 px-3 py-2 text-xs text-gray-600 dark:border-gray-700">Filter: {value.conditions.map((c) => conditionPhrase(c, names)).join(' and ').replace(/^./, (x) => x.toUpperCase())}</div>}
                        <div className="flex items-center gap-2 border-t border-gray-100 px-3 py-2 dark:border-gray-700">
                          {!readOnly && <button type="button" onClick={() => copyTrigger(i)} className="rounded p-0.5 text-gray-400 hover:text-gray-700" aria-label="Copy trigger"><Copy className="h-4 w-4" /></button>}
                          {!readOnly && <button type="button" onClick={() => deleteTrigger(i)} className="rounded p-0.5 text-gray-400 hover:text-red-600" aria-label="Delete trigger"><Trash2 className="h-4 w-4" /></button>}
                          <button type="button" onClick={onStats} className="ml-auto inline-flex items-center gap-1 text-sm font-semibold text-primary-700 hover:underline"><BarChart3 className="h-4 w-4" /> Stats{stats !== undefined ? ` (${stats})` : ''}</button>
                        </div>
                      </div>
                    ))}
                    {!readOnly && (
                      <button type="button" onClick={() => openTrigger('new')} className="mt-9 flex h-16 w-[240px] items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary-400 bg-primary-50/60 font-semibold text-primary-700 hover:bg-primary-50">
                        <Plus className="h-4 w-4" /> Add new trigger
                      </button>
                    )}
                  </div>
                  {/* Connector: joins every trigger to the first step. */}
                  {(triggers.length + (readOnly ? 0 : 1)) > 1 ? (
                    <div className="h-9 border-x border-b border-gray-300" style={{ width: `calc(100% - ${triggers.length > 1 || !readOnly ? 250 : 0}px)` }} />
                  ) : <span className="h-6 w-px bg-gray-300" />}
                </div>
              )}

              {/* Steps */}
              <AddDot at={0} />
              {value.steps.map((st, i) => {
                const def = stepDef(st.type);
                const setup = validateStep(st, vars).length > 0 || stepProblems(st.id).length > 0;
                return (
                  <div key={st.id} className="flex flex-col items-center">
                    <div className="relative w-[300px]">
                      {setup && <span className="absolute -top-2.5 right-4 z-10 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Needs setup</span>}
                      <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm hover:border-primary-300 dark:border-gray-700 dark:bg-gray-800">
                        <button type="button" onClick={() => !readOnly && setPanel({ kind: 'action', at: i, step: JSON.parse(JSON.stringify(st)), isNew: false })} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', TILE[def?.module ?? 'TIMING'] ?? 'bg-gray-100 text-gray-600')}><Icon name={stepIcon(st)} /></span>
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-gray-900 dark:text-white">{stepTitle(st)}</span>
                            <span className="block truncate text-xs text-gray-500">{stepPhrase(st, names).replace(/^./, (x) => x.toUpperCase())}{st.delay?.amount ? ` · after ${st.delay.amount} ${st.delay.unit === 'HOURS' ? 'h' : 'd'}` : ''}{st.mode === 'ASK' ? ' · asks first' : ''}</span>
                          </span>
                        </button>
                        {!readOnly && (
                          <DM.Root>
                            <DM.Trigger className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label={`Actions for step ${i + 1}`}><MoreHorizontal className="h-4 w-4" /></DM.Trigger>
                            <DM.Portal>
                              <DM.Content align="end" sideOffset={4} className="z-50 min-w-44 rounded-xl border border-gray-200 bg-white p-1 shadow-xl dark:bg-gray-800">
                                {[
                                  { l: 'Edit', i: <Pencil className="h-3.5 w-3.5" />, f: () => setPanel({ kind: 'action', at: i, step: JSON.parse(JSON.stringify(st)), isNew: false }) },
                                  ...(i > 0 ? [{ l: 'Move up', i: <ArrowUp className="h-3.5 w-3.5" />, f: () => move(i, -1) }] : []),
                                  ...(i < value.steps.length - 1 ? [{ l: 'Move down', i: <ArrowDown className="h-3.5 w-3.5" />, f: () => move(i, 1) }] : []),
                                  ...(uniqueKey(st.type, st.config) ? [] : [{ l: 'Duplicate', i: <Copy className="h-3.5 w-3.5" />, f: () => duplicateStep(i) }]),
                                  { l: 'Delete', i: <Trash2 className="h-3.5 w-3.5" />, f: () => removeStep(i), danger: true },
                                ].map((o) => (
                                  <DM.Item key={o.l} onSelect={o.f} className={cn('flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm outline-none data-[highlighted]:bg-gray-100', 'danger' in o && o.danger ? 'text-red-600' : 'text-gray-700 dark:text-gray-200')}>{o.i}{o.l}</DM.Item>
                                ))}
                              </DM.Content>
                            </DM.Portal>
                          </DM.Root>
                        )}
                      </div>
                    </div>
                    <AddDot at={i + 1} />
                  </div>
                );
              })}
              <span className="rounded-full bg-gray-200 px-3 py-0.5 text-[11px] font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">END</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="pointer-events-none absolute right-5 top-5 z-10 flex w-64 flex-col items-end gap-2">
          {!readOnly && <Button className="pointer-events-auto" onClick={() => set({ notes: [...notes, { id: newCondId(), text: '' }] })}><Plus className="h-4 w-4" /> Add note</Button>}
          {notes.map((n) => (
            <div key={n.id} className="pointer-events-auto w-full rounded-xl border border-amber-200 bg-amber-50 p-2 shadow-sm">
              <div className="mb-1 flex items-center justify-between text-[11px] font-semibold text-amber-800"><span className="flex items-center gap-1"><StickyNote className="h-3 w-3" /> Note</span>
                {!readOnly && <button type="button" onClick={() => set({ notes: notes.filter((x) => x.id !== n.id) })} aria-label="Delete note"><X className="h-3.5 w-3.5" /></button>}</div>
              <textarea aria-label="Note" value={n.text} readOnly={readOnly} onChange={(e) => set({ notes: notes.map((x) => (x.id === n.id ? { ...x, text: e.target.value } : x)) })} rows={3} placeholder="Write a note for your team"
                className="w-full resize-none bg-transparent text-sm text-amber-950 outline-none placeholder:text-amber-700/60" />
            </div>
          ))}
        </div>

        {/* Canvas controls */}
        <div className="absolute bottom-24 left-5 z-10 flex flex-col gap-2">
          <button type="button" onClick={() => setHand((h) => !h)} aria-pressed={hand} aria-label="Pan the canvas" className={cn('flex h-9 w-9 items-center justify-center rounded-lg border bg-white shadow-sm dark:bg-gray-800', hand ? 'border-primary-400 text-primary-700' : 'border-gray-200 text-gray-600')}><Hand className="h-4 w-4" /></button>
          <div className="flex flex-col items-center rounded-lg border border-gray-200 bg-white py-1 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <button type="button" onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(1)))} className="p-2 text-gray-600" aria-label="Zoom in"><Plus className="h-4 w-4" /></button>
            <span className="text-[11px] font-semibold text-gray-600">{Math.round(zoom * 100)}%</span>
            <button type="button" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(1)))} className="p-2 text-gray-600" aria-label="Zoom out"><Minus className="h-4 w-4" /></button>
          </div>
          <button type="button" onClick={() => { setZoom(1); scroller.current?.scrollTo({ top: 0, left: (scroller.current.scrollWidth - scroller.current.clientWidth) / 2, behavior: 'smooth' }); }} aria-label="Fit to screen" className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 shadow-sm dark:bg-gray-800"><Maximize2 className="h-4 w-4" /></button>
        </div>

        {/* Minimap */}
        <div className="absolute bottom-5 right-5 z-10 hidden h-28 w-36 rounded-xl border border-gray-200 bg-white p-3 shadow-sm md:block dark:border-gray-700 dark:bg-gray-800" aria-hidden>
          <div className="flex h-full flex-col items-center justify-start gap-1.5 rounded-md border-2 border-primary-500 p-2">
            <span className="flex gap-1">{triggers.map((_, i) => <span key={i} className="h-1.5 w-6 rounded bg-blue-300" />)}</span>
            {value.steps.slice(0, 7).map((s) => <span key={s.id} className="h-1.5 w-8 rounded bg-gray-300" />)}
          </div>
        </div>
      </div>

      {/* Side panels */}
      {panel?.kind === 'triggers' && (
        <PanelShell title="Add trigger" subtitle="Pick the event that starts this workflow." onClose={() => setPanel(undefined)}>
          <PresetList groups={TRIGGER_GROUPS} items={TRIGGER_PRESETS} lockedReason={(p) => p.locked} onPick={(p) => pickTrigger(p, panel.index)} searchLabel="Search triggers" tabs={['Triggers', 'Integrations']} />
        </PanelShell>
      )}
      {panel?.kind === 'trigger' && (() => {
        const d = triggerDef(panel.draft.type);
        const pipeline = pipelineOf(panel.draft.module);
        return (
          <PanelShell title={triggerLabel(panel.draft)} subtitle={d?.title ?? 'Trigger'} onClose={() => setPanel(undefined)} onBack={() => setPanel({ kind: 'triggers', index: panel.index })}
            footer={<>
              {panel.index !== 'new' && <Button variant="danger" className="mr-auto" onClick={() => deleteTrigger(panel.index as number)}><Trash2 className="h-4 w-4" /> Delete</Button>}
              <Button onClick={() => setPanel(undefined)}>Cancel</Button>
              <Button variant="primary" onClick={() => saveTrigger(panel)}>Save trigger</Button>
            </>}>
            <div className="space-y-4 px-5 pb-5">
              {d?.backendGap && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">{d.backendGap}</p>}
              {d?.fields.filter((f) => fieldVisible(f, panel.draft.config)).map((f) => (
                <RegistryInput key={f.key} field={f} value={panel.draft.config[f.key]} config={panel.draft.config} idPrefix="tp" ctx={{ pipeline }}
                  onChange={(v) => setPanel({ ...panel, draft: { ...panel.draft, config: { ...panel.draft.config, [f.key]: v } } })} />
              ))}
              {!d?.fields.length && <p className="text-sm text-gray-500">This trigger has no settings.</p>}
              <div className="border-t border-gray-100 pt-4 dark:border-gray-700">
                <h3 className="mb-1 font-semibold">Filters</h3>
                <p className="mb-2 text-xs text-gray-500">Only records that match every filter start the workflow. Filters apply to all triggers.</p>
                <ConditionsEditor conditions={panel.conditions} onChange={(c) => setPanel({ ...panel, conditions: c })} pipeline={pipeline} stage={boardPlacement(panel.draft).stage} idPrefix="tp-c" />
              </div>
            </div>
          </PanelShell>
        );
      })()}
      {panel?.kind === 'actions' && (
        <PanelShell title="Add action" subtitle="Choose what happens next in this workflow." onClose={() => setPanel(undefined)}>
          <PresetList groups={ACTION_GROUPS} items={ACTION_PRESETS} lockedReason={actionLocked} onPick={(p) => pickAction(p, panel.at)} searchLabel="Search actions" tabs={['Actions', 'Integrations']} />
        </PanelShell>
      )}
      {panel?.kind === 'action' && (
        <PanelShell title={stepTitle(panel.step)} subtitle={panel.isNew ? `Step ${panel.at + 1}` : `Step ${panel.at + 1} settings`} onClose={() => setPanel(undefined)}
          onBack={panel.isNew ? () => setPanel({ kind: 'actions', at: panel.at }) : undefined}
          footer={<>
            {!panel.isNew && <Button variant="danger" className="mr-auto" onClick={() => removeStep(panel.at)}><Trash2 className="h-4 w-4" /> Delete</Button>}
            <Button onClick={() => setPanel(undefined)}>Cancel</Button>
            <Button variant="primary" onClick={() => saveAction(panel)}>{panel.isNew ? 'Save action' : 'Save'}</Button>
          </>}>
          <div className="px-5 pb-5">
            <StepSettingsForm step={panel.step} onChange={(s) => setPanel({ ...panel, step: s })} problems={tried ? validateStep(panel.step, vars) : []}
              ctx={{ pipeline: mainPlace.pipeline, stage: mainPlace.stage, onNewMessage: (channel, cb) => setMsgEditor({ channel, cb }) }} />
          </div>
        </PanelShell>
      )}
      <MessageEditor open={!!msgEditor} channel={msgEditor?.channel} onClose={() => setMsgEditor(undefined)} onSaved={(id) => msgEditor?.cb(id)} />
    </div>
  );
}

