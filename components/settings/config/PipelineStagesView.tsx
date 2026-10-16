'use client';

/*
  Settings > Pipeline Stages ("Pipeline Configuration"). CRM Part 2 (7).

  Left: the pipelines in Settings order, each with its stage count. Sales and
  Production carry a "System" badge: they can be renamed, never deleted.
  With dynamicPipelines on (Option B) pipelines also move up and down, a
  custom pipeline can be deleted (its leads leave that pipeline only; their
  Sales and Production progress stays), and "Add pipeline" makes one with
  Not Started and Done. Option A hides all three. Names: required, at most
  40 characters, unique. Each row shows its stage colours; the chosen one is
  renamed (and a custom one deleted) from the stages panel header.
  Lead sources have their own page (Settings › Lead Sources).

  Right: the chosen pipeline's stages. Each row: drag handle, colour (preset palette), name (saved
  when the field loses focus), lead count, up/down, and a lock or Delete.
  Locked stages (Sales: New, Sold, Lost; Production: Confirmed, Closed) can
  be renamed and recoloured, never moved or deleted. New stages go before
  Sold (Sales), before Closed (Production), or last (custom pipelines). A
  pipeline keeps at least one stage. Deleting a stage that has leads asks
  where to move them first. Every change is saved straight away and logged.
  The rules are in features/lib/rules/lead-pipeline.ts.
*/
import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Check, GripVertical, Lock, Pencil, Plus, Trash2, X } from 'lucide-react';
import { SettingsPage } from '@/components/settings/SettingsSidebar';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { useCollection, useCurrentUser, useLogActivity } from '@/lib/store';
import type { Pipeline, PipelineStage } from '@/lib/types';
import { createPipeline, move } from '@/lib/crm';
import { cn, fullName, uid } from '@/lib/utils';
import { Field as FField, Input as FInput, Modal, VersionBadge } from '@/features/components/ui';
import { useDynamicPipelines } from '@/features/lib/feature-visibility';
import { useCurrentUser as useFeatureUser } from '@/features/lib/store';
import { can } from '@/features/lib/permissions';
import { useVisiblePipelines } from '@/components/leads/usePipelines';
import {
  MAX_STAGES, NAME_MAX, canStep, customColumnFor, deleteStageProblem, insertStage, moveStage, pipelineColumns, pipelineNameProblem, salesColumnFor,
  stageCounts, stageNameProblem, stagePipeline,
} from '@/features/lib/rules/lead-pipeline';

/** Preset palette: stage colours come only from here. */
export const STAGE_COLORS = ['#3B82F6', '#A855F7', '#14B8A6', '#F59E0B', '#EC4899', '#0EA5E9', '#8B5CF6', '#22C55E', '#EF4444', '#6B7280'];

export function PipelineStagesView() {
  const stages = useCollection('pipelineStages');
  const pipelines = useCollection('pipelines');
  const leads = useCollection('leads');
  const cards = useCollection('productionCards');
  const { toast } = useToast();
  const log = useLogActivity();
  const me = fullName(useCurrentUser());
  const dynamic = useDynamicPipelines();
  // Tab 2: only Admin Master Data (Owner and Admin) changes stages; everyone else sees them read-only, with no edit controls.
  const admin = can(useFeatureUser(), 'settings.masterData');
  const visible = useVisiblePipelines();
  const [tabState, setTab] = useState(visible[0]?.id ?? 'sales');
  const tab = visible.some((p) => p.id === tabState) ? tabState : visible[0]?.id ?? 'sales';
  const pipeline = visible.find((p) => p.id === tab);
  const liveCards = useMemo(() => cards.items.filter((c) => !c.removedAt), [cards.items]);
  const counts = useMemo(() => stageCounts(stages.items, pipelines.items, leads.items, liveCards), [stages.items, pipelines.items, leads.items, liveCards]);

  /** Replaces one pipeline's visible stages (hidden ones, like Archived, stay). */
  const setColumns = (pipelineId: string, cols: PipelineStage[]) =>
    stages.setAll([...stages.items.filter((s) => stagePipeline(s) !== pipelineId || s.hidden), ...cols]);

  /* ---------- pipelines ---------- */

  const renamePipeline = (p: Pipeline, name: string) => {
    const problem = pipelineNameProblem(name, pipelines.items.filter((x) => x.id !== p.id).map((x) => x.name));
    if (problem) return problem;
    if (name.trim() === p.name) return undefined;
    pipelines.update(p.id, { name: name.trim() });
    log(`Pipeline ${name.trim()} renamed by ${me}. It was ${p.name}.`);
    toast('Pipeline renamed');
    return undefined;
  };
  const addPipeline = (name: string) => {
    const problem = pipelineNameProblem(name, pipelines.items.map((x) => x.name));
    if (problem) return problem;
    const made = createPipeline(name.trim(), Math.max(0, ...pipelines.items.map((p) => p.sortOrder)) + 1, uid);
    pipelines.setAll([...pipelines.items, made.pipeline]);
    stages.setAll([...stages.items, ...made.stages]);
    setTab(made.pipeline.id);
    log(`Pipeline ${made.pipeline.name} created by ${me}.`);
    toast(`${made.pipeline.name} pipeline added`);
    return undefined;
  };
  const stepPipeline = (p: Pipeline, dir: -1 | 1) => {
    const list = [...pipelines.items].sort((a, b) => a.sortOrder - b.sortOrder);
    const i = list.findIndex((x) => x.id === p.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j]!, list[i]!];
    pipelines.setAll(list.map((x, k) => ({ ...x, sortOrder: k + 1 })));
  };
  const deletePipeline = (p: Pipeline) => {
    const members = leads.items.filter((l) => l.pipelineStages?.[p.id]).length;
    pipelines.setAll(pipelines.items.filter((x) => x.id !== p.id));
    stages.setAll(stages.items.filter((s) => stagePipeline(s) !== p.id));
    leads.setAll(leads.items.map((l) => {
      if (!l.pipelineStages?.[p.id]) return l;
      const { [p.id]: _gone, ...rest } = l.pipelineStages;
      return { ...l, pipelineStages: rest };
    }));
    log(`Pipeline ${p.name} deleted by ${me}. ${members} ${members === 1 ? 'lead was' : 'leads were'} removed from it.`);
    toast(`${p.name} deleted`);
    setTab('sales');
  };

  /* ---------- stages ---------- */

  const columns = pipeline ? pipelineColumns(stages.items, pipeline.id) : [];
  const editStage = (s: PipelineStage, patch: Partial<PipelineStage>) => {
    stages.update(s.id, patch);
    log(`Stage ${patch.displayName ?? s.displayName} edited in ${pipeline?.name} by ${me}.`);
  };
  const addStage = (name: string) => {
    if (!pipeline) return 'No pipeline.';
    const problem = stageNameProblem(name, columns.map((c) => c.displayName));
    if (problem) return problem;
    const id = uid('ps');
    const used = new Set(columns.map((c) => c.color));
    const color = STAGE_COLORS.find((c) => !used.has(c)) ?? STAGE_COLORS[columns.length % STAGE_COLORS.length]!;
    const r = insertStage(columns, { id, stageId: id.toUpperCase(), displayName: name.trim(), color, sortOrder: 0, pipelineId: pipeline.id });
    if (!r.ok) return r.error;
    setColumns(pipeline.id, r.columns);
    log(`Stage ${name.trim()} added to ${pipeline.name} by ${me}.`);
    toast(`${name.trim()} added`);
    return undefined;
  };
  const stepStage = (s: PipelineStage, dir: -1 | 1) => {
    if (!pipeline) return;
    const r = moveStage(columns, s.id, columns.findIndex((c) => c.id === s.id) + dir);
    if (!r.ok) return toast(r.error, 'error');
    setColumns(pipeline.id, r.columns);
  };
  const dropOn = (dragId: string, targetId: string) => {
    if (!pipeline || dragId === targetId) return;
    const r = moveStage(columns, dragId, columns.findIndex((s) => s.id === targetId));
    if (!r.ok) return toast(r.error, 'error');
    setColumns(pipeline.id, r.columns);
  };
  /** Deletes a stage after moving its leads or cards to `target`. */
  const deleteStage = (s: PipelineStage, target?: PipelineStage) => {
    if (!pipeline) return;
    const at = new Date().toISOString();
    let moved = 0;
    if (target && pipeline.kind === 'sales') {
      const updated = leads.items.map((l) => {
        if (l.status === 'Archived' || salesColumnFor(l, columns)?.id !== s.id) return l;
        moved++;
        return { ...l, stageId: target.id, stageStatus: l.status, updatedAt: at, stageHistory: [...(l.stageHistory ?? []), move('sales', target, me, at)] };
      });
      if (moved) leads.setAll(updated);
    } else if (target && pipeline.kind === 'custom') {
      const updated = leads.items.map((l) => {
        if (customColumnFor(l, columns, pipeline.id)?.id !== s.id) return l;
        moved++;
        return { ...l, pipelineStages: { ...l.pipelineStages, [pipeline.id]: target.id }, stageHistory: [...(l.stageHistory ?? []), move(pipeline.id, target, me, at)] };
      });
      if (moved) leads.setAll(updated);
    } else if (target) {
      const updated = cards.items.map((c) => {
        if (c.removedAt || c.stageId !== s.id) return c;
        moved++;
        return { ...c, stageId: target.id, history: [...c.history, move('production', target, me, at)] };
      });
      if (moved) cards.setAll(updated);
    }
    setColumns(pipeline.id, columns.filter((x) => x.id !== s.id).map((x, i) => ({ ...x, sortOrder: i + 1 })));
    log(`Stage ${s.displayName} deleted from ${pipeline.name} by ${me}.${moved && target ? ` ${moved} moved to ${target.displayName}.` : ''}`);
    toast(moved && target ? `${s.displayName} deleted. ${moved} moved to ${target.displayName}.` : `${s.displayName} deleted`);
  };


  return (
    <SettingsPage wide title="Pipeline Configuration" subtitle="Your pipelines and their stages. Changes save as you make them.">
      {!admin && <p className="mb-4 text-sm text-gray-500">Only the owner or an admin changes pipelines, stages and lead sources.</p>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        {/* Pipelines */}
        <div className="min-w-0 space-y-3">
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm" data-tour="crm-pipelines-settings">
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">
              <span>Pipelines</span>
              <VersionBadge item="CRM-M1" />
            </div>
            <ul role="tablist" aria-label="Pipelines" aria-orientation="vertical">
              {visible.map((p, i) => (
                <PipelineRow
                  key={p.id}
                  pipeline={p}
                  selected={tab === p.id}
                  colors={pipelineColumns(stages.items, p.id).map((x) => x.color)}
                  admin={admin}
                  dynamic={dynamic}
                  first={i === 0}
                  last={i === visible.length - 1}
                  onSelect={() => setTab(p.id)}
                  onStep={(dir) => stepPipeline(p, dir)}
                />
              ))}
            </ul>
            {admin && dynamic && <AddByName label="Add pipeline" placeholder="New pipeline name" onAdd={addPipeline} />}
          </div>
        </div>

        {/* Stages */}
        <div className="min-w-0">
          {pipeline && (
            <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm" data-tour="crm-stages">
              <PipelineHeader
                key={pipeline.id}
                pipeline={pipeline}
                stageCount={columns.length}
                memberCount={leads.items.filter((l) => l.pipelineStages?.[pipeline.id]).length}
                admin={admin}
                dynamic={dynamic}
                onRename={(name) => renamePipeline(pipeline, name)}
                onDelete={() => deletePipeline(pipeline)}
              />
              {columns.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-gray-500">No stages yet. Add the first one below.</p>
              ) : (
                <StageList
                  columns={columns}
                  counts={counts}
                  admin={admin}
                  kind={pipeline.kind}
                  onEdit={editStage}
                  onStep={stepStage}
                  onDrop={dropOn}
                  onDelete={deleteStage}
                />
              )}
              {admin && columns.length < MAX_STAGES && <AddByName label="Add stage" placeholder="New stage name" onAdd={addStage} />}
            </div>
          )}
        </div>
      </div>
    </SettingsPage>
  );
}

/* ---------- pipeline row ---------- */

function PipelineRow({ pipeline: p, selected, colors, admin, dynamic, first, last, onSelect, onStep }: {
  pipeline: Pipeline; selected: boolean; colors: string[]; admin: boolean; dynamic: boolean; first: boolean; last: boolean;
  onSelect: () => void; onStep: (dir: -1 | 1) => void;
}) {
  const system = p.kind !== 'custom';
  return (
    <li className={cn('relative border-b border-gray-100 last:border-0', selected ? 'bg-primary-50' : 'hover:bg-gray-50')}>
      {/* The chosen pipeline is marked by a blue edge, like the active item in the main menu. */}
      {selected && <span aria-hidden className="absolute inset-y-0 left-0 w-1 rounded-r bg-primary-600" />}
      <div className="flex items-center gap-2 px-4 py-3.5">
        <button type="button" role="tab" aria-selected={selected} onClick={onSelect} className="min-w-0 flex-1 cursor-pointer text-left">
          <span className="flex items-center gap-2">
            <span className={cn('truncate text-sm font-bold', selected ? 'text-primary-700' : 'text-gray-900')}>{p.name}</span>
            {system && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xxs font-bold uppercase tracking-wide text-gray-600">System</span>}
          </span>
          <span className="mt-1.5 flex items-center gap-2">
            {/* The stage colours in order: tells the pipelines apart at a glance. */}
            <span aria-hidden className="flex h-1.5 w-24 overflow-hidden rounded-full bg-gray-100">
              {colors.map((c, k) => <span key={k} className="h-full flex-1" style={{ backgroundColor: c }} />)}
            </span>
            <span className="text-xs text-gray-500">{colors.length} {colors.length === 1 ? 'stage' : 'stages'}</span>
          </span>
        </button>
        {admin && dynamic && (
          <span className="flex shrink-0 gap-0.5">
            <IconButton label={`Move ${p.name} up`} disabled={first} onClick={() => onStep(-1)}><ArrowUp className="h-4 w-4" /></IconButton>
            <IconButton label={`Move ${p.name} down`} disabled={last} onClick={() => onStep(1)}><ArrowDown className="h-4 w-4" /></IconButton>
          </span>
        )}
      </div>
    </li>
  );
}

/* ---------- stages panel header: rename (and delete a custom pipeline) ---------- */

function PipelineHeader({ pipeline: p, stageCount, memberCount, admin, dynamic, onRename, onDelete }: {
  pipeline: Pipeline; stageCount: number; memberCount: number; admin: boolean; dynamic: boolean;
  onRename: (name: string) => string | undefined; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(p.name);
  const [error, setError] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const custom = p.kind === 'custom';
  const save = () => {
    const problem = onRename(name);
    setError(problem);
    if (!problem) setEditing(false);
  };
  const cancel = () => { setName(p.name); setError(undefined); setEditing(false); };
  return (
    <div className="border-b border-gray-100 px-5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {editing ? (
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="min-w-0 flex-1 sm:max-w-xs">
              <Input
                autoFocus
                aria-label={`${p.name} pipeline name`}
                value={name}
                maxLength={NAME_MAX + 10}
                invalid={!!error}
                onChange={(e) => { setName(e.target.value); setError(undefined); }}
                onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
                className="h-10"
              />
            </div>
            <IconButton label="Save name" onClick={save}><Check className="h-4 w-4" /></IconButton>
            <IconButton label="Cancel" onClick={cancel}><X className="h-4 w-4" /></IconButton>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate font-heading text-base font-bold text-gray-900">{p.name} stages</h2>
            {admin && (
              <button type="button" onClick={() => setEditing(true)} className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold text-primary-600 hover:bg-primary-50">
                <Pencil className="h-3.5 w-3.5" /> Rename
              </button>
            )}
          </div>
        )}
        <span className="flex items-center gap-3">
          {admin && dynamic && custom && !confirming && (
            <button type="button" onClick={() => setConfirming(true)} className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold text-gray-500 hover:bg-red-50 hover:text-red-600">
              <Trash2 className="h-3.5 w-3.5" /> Delete pipeline
            </button>
          )}
          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">{stageCount} of {MAX_STAGES}</span>
        </span>
      </div>
      {error && <p className="ml-3 mt-1 text-sm text-red-600">{error}</p>}
      {confirming && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">
          <p>Delete {p.name}? {memberCount} {memberCount === 1 ? 'lead' : 'leads'} will be removed from this pipeline only.</p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="danger" onClick={onDelete}>Delete</Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- stage list ---------- */

function StageList({ columns, counts, admin, kind, onEdit, onStep, onDrop, onDelete }: {
  columns: PipelineStage[]; counts: Record<string, number>; admin: boolean; kind: Pipeline['kind'];
  onEdit: (s: PipelineStage, patch: Partial<PipelineStage>) => void; onStep: (s: PipelineStage, dir: -1 | 1) => void;
  onDrop: (dragId: string, targetId: string) => void; onDelete: (s: PipelineStage, target?: PipelineStage) => void;
}) {
  const [dragId, setDragId] = useState<string>();
  return (
    <ul>
      {columns.map((s) => (
        <StageRow
          key={s.id}
          stage={s}
          columns={columns}
          count={counts[s.id] ?? 0}
          admin={admin}
          kind={kind}
          dragging={dragId === s.id}
          onDragStart={() => setDragId(s.id)}
          onDragEnd={() => setDragId(undefined)}
          onDropHere={() => { if (dragId) onDrop(dragId, s.id); setDragId(undefined); }}
          onEdit={(patch) => onEdit(s, patch)}
          onStep={(dir) => onStep(s, dir)}
          onDelete={(target) => onDelete(s, target)}
        />
      ))}
    </ul>
  );
}

function StageRow({ stage: s, columns, count, admin, kind, dragging, onDragStart, onDragEnd, onDropHere, onEdit, onStep, onDelete }: {
  stage: PipelineStage; columns: PipelineStage[]; count: number; admin: boolean; kind: Pipeline['kind']; dragging: boolean;
  onDragStart: () => void; onDragEnd: () => void; onDropHere: () => void;
  onEdit: (patch: Partial<PipelineStage>) => void; onStep: (dir: -1 | 1) => void; onDelete: (target?: PipelineStage) => void;
}) {
  const [name, setName] = useState(s.displayName);
  const [error, setError] = useState<string>();
  const [palette, setPalette] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const others = columns.filter((o) => o.id !== s.id);
  const [target, setTarget] = useState(others[0]?.id ?? '');
  const blocked = deleteStageProblem(s, 0, columns.length);
  const saveName = () => {
    if (name.trim() === s.displayName) return setError(undefined);
    const problem = stageNameProblem(name, others.map((o) => o.displayName));
    setError(problem);
    if (!problem) onEdit({ displayName: name.trim() });
  };
  const askDelete = () => {
    if (count === 0) onDelete();
    else setDeleting(true);
  };
  const noun = kind === 'production' ? (count === 1 ? 'card is' : 'cards are') : count === 1 ? 'lead is' : 'leads are';
  return (
    <li
      draggable={admin && !s.system}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); onDropHere(); }}
      onDragEnd={onDragEnd}
      className={cn('border-b border-gray-100 px-5 py-3 last:border-0', dragging && 'opacity-50')}
    >
      <div className="flex flex-wrap items-center gap-3">
        {admin && (
          <span className={cn('text-gray-400', s.system ? 'cursor-not-allowed opacity-40' : 'cursor-grab')} aria-hidden title={s.system ? undefined : 'Drag to reorder'}>
            <GripVertical className="h-4 w-4" />
          </span>
        )}
        {admin ? (
          <button
            type="button"
            onClick={() => setPalette((v) => !v)}
            aria-expanded={palette}
            aria-label={`${s.displayName} colour`}
            title="Change colour"
            className="h-7 w-7 shrink-0 rounded-lg border border-gray-200"
            style={{ backgroundColor: s.color }}
          />
        ) : <span className="h-7 w-7 shrink-0 rounded-lg border border-gray-200" style={{ backgroundColor: s.color }} aria-hidden />}
        <div className="min-w-[10rem] flex-1">
          {admin ? (
            <Input
              aria-label={`${s.displayName} name`}
              value={name}
              maxLength={NAME_MAX + 10}
              invalid={!!error}
              onChange={(e) => { setName(e.target.value); setError(undefined); }}
              onBlur={saveName}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          ) : <span className="text-sm font-semibold text-gray-900">{s.displayName}</span>}
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
        <span className="w-20 text-right text-xs text-gray-500">{count} {kind === 'production' ? (count === 1 ? 'card' : 'cards') : count === 1 ? 'lead' : 'leads'}</span>
        {admin && (
          <span className="flex shrink-0 gap-0.5">
            <IconButton label={`Move ${s.displayName} up`} disabled={!canStep(columns, s.id, -1)} onClick={() => onStep(-1)}><ArrowUp className="h-4 w-4" /></IconButton>
            <IconButton label={`Move ${s.displayName} down`} disabled={!canStep(columns, s.id, 1)} onClick={() => onStep(1)}><ArrowDown className="h-4 w-4" /></IconButton>
          </span>
        )}
        {s.system ? (
          <span className="flex w-9 justify-center text-gray-500" title="Locked: rename and recolour only"><Lock className="h-4 w-4" aria-label="Locked stage" /></span>
        ) : admin && (
          <IconButton label={`Delete ${s.displayName}`} disabled={!!blocked} title={blocked} danger onClick={askDelete}><Trash2 className="h-4 w-4" /></IconButton>
        )}
        {kind !== 'custom' && <AutomateLink stage={s} kind={kind} />}
      </div>
      {palette && admin && (
        <div className="mt-2 flex flex-wrap gap-2 pl-7" role="radiogroup" aria-label={`${s.displayName} colour`}>
          {STAGE_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={s.color.toUpperCase() === c}
              aria-label={c}
              onClick={() => { onEdit({ color: c }); setPalette(false); }}
              className={cn('h-7 w-7 rounded-full border-2', s.color.toUpperCase() === c ? 'border-gray-900' : 'border-transparent')}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      )}
      {deleting && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="alert">
          <span>{count} {noun} in {s.displayName}. Move them to</span>
          <NativeSelect value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Move them to" className="h-9 w-48">
            {others.map((o) => <option key={o.id} value={o.id}>{o.displayName}</option>)}
          </NativeSelect>
          <span>then delete.</span>
          <span className="flex gap-2">
            <Button size="sm" variant="danger" onClick={() => onDelete(others.find((o) => o.id === target))} disabled={!target}>Move and delete</Button>
            <Button size="sm" variant="secondary" onClick={() => setDeleting(false)}>Cancel</Button>
          </span>
        </div>
      )}
    </li>
  );
}

/* ---------- small parts ---------- */

function IconButton({ label, title, disabled, danger, onClick, children }: { label: string; title?: string; disabled?: boolean; danger?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={title ?? label}
      className={cn(
        'rounded-lg p-2 text-gray-500 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent',
        danger ? 'hover:bg-red-50 hover:text-red-600' : 'hover:bg-gray-100 hover:text-gray-900',
      )}
    >
      {children}
    </button>
  );
}

/** A name field and an Add button ("Add pipeline", "Add stage"). Shows the rule it breaks. */
function AddByName({ label, placeholder, onAdd }: { label: string; placeholder: string; onAdd: (name: string) => string | undefined }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string>();
  const add = () => {
    const problem = onAdd(name);
    setError(problem);
    if (!problem) setName('');
  };
  return (
    <div className="border-t border-gray-100 px-4 py-3">
      <div className="flex gap-2">
        <Input value={name} placeholder={placeholder} aria-label={placeholder} maxLength={NAME_MAX + 10} invalid={!!error} onChange={(e) => { setName(e.target.value); setError(undefined); }} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={add} className="shrink-0">{label}</Button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

/** "Add pipeline" from the Lead Pipeline board (Option B). Starts with Not Started and Done. */
export function AddPipelineModal({ onClose, onAdd, taken }: { onClose: () => void; onAdd: (name: string) => void; taken: string[] }) {
  const [name, setName] = useState('');
  const problem = pipelineNameProblem(name, taken);
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title="Add pipeline"
      description="Starts with a Not Started stage and a Done stage."
      size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!!problem} onClick={() => onAdd(name.trim())}>Add pipeline</Button></>}
    >
      <FField label="Name" error={name ? problem : undefined}>
        <FInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Training" autoFocus />
      </FField>
    </Modal>
  );
}

/** Automations: "Automate this stage" opens the Automations board for this pipeline, at this stage. */
function AutomateLink({ stage, kind }: { stage: { leadStatus?: string; displayName: string }; kind?: string }) {
  const pipeline = kind === 'sales' ? 'LEAD' : 'JOB';
  const key = (stage.leadStatus ?? stage.displayName).toUpperCase().replace(/[^A-Z]+/g, '_');
  return (
    <a href={`/automations?view=overview&pipeline=${pipeline}&stage=${key}`} className="inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:underline">
      Automate this stage
    </a>
  );
}
