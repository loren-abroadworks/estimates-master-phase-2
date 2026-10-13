'use client';

/*
  Workflow builder page (Figma screens 2–4), full screen. Header: back to
  Workflows, the name (click the pencil to rename), undo, redo and the save
  state. Changes save on their own a moment after each edit, and undo/redo
  step back through them.

  Tabs: Builder (the canvas), Settings, Enrollment history (records that
  went through) and Execution logs (every step that ran). "Test workflow"
  plays it against a past record without changing anything. Draft/Publish:
  the first Publish opens the approval (Cross-Feature Rule 4); changing a
  customer-facing step on a published workflow asks for approval again, and
  the approved version keeps running until then.
*/
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Check, CloudUpload, FlaskConical, Loader2, Pencil, Play, Redo2, Undo2 } from 'lucide-react';
import type { Automation } from '@/lib/automations/types';
import { allTemplates, applyTemplateUpdate, changesCustomerFacing, dismissTemplateUpdate, samplesUsed, updateAutomation, updateTemplate, useAuto } from '@/lib/automations/store';
import { recordHref } from '@/lib/automations/records';
import { stepDef, variablesFor, boardPlacement } from '@/lib/automations/registry';
import { validateAutomation, validateName } from '@/lib/automations/validation';
import { AppLink, useNav, useParam } from '@/features/lib/navigation';
import { toast } from '@/features/lib/toast';
import { Badge, Banner, Button, Checkbox, Field, Input, Select, Switch } from '@/features/components/ui';
import { cn } from '@/lib/utils';
import { useLibrary, useMessageActions, usePerms } from '../hooks';
import { useAutomationActions } from '../actions';
import { DeployModal } from '../modals';
import { CARD, EmptyNote, RunBadge, relTime } from '../shared';
import { WorkflowCanvas, type CanvasValue, type Panel } from './WorkflowCanvas';
import { StatusPill, statusOf } from './shared';

type Tab = 'builder' | 'settings' | 'history' | 'logs';

const valueOf = (a: Pick<Automation, 'trigger' | 'extraTriggers' | 'conditions' | 'steps' | 'notes'>): CanvasValue =>
  JSON.parse(JSON.stringify({ trigger: a.trigger, extraTriggers: a.extraTriggers ?? [], conditions: a.conditions, steps: a.steps, notes: a.notes ?? [] }));

function BuilderHeader({ back, backLabel, name, onRename, canEdit, undo, redo, canUndo, canRedo, saving, extra }: {
  back: () => void; backLabel: string; name: string; onRename?: (n: string) => boolean; canEdit: boolean; undo?: () => void; redo?: () => void; canUndo?: boolean; canRedo?: boolean; saving?: 'saving' | 'saved' | 'idle'; extra?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 md:px-6 dark:border-gray-700 dark:bg-gray-800">
      <button type="button" onClick={back} className="flex items-center gap-2 text-[15px] font-medium text-gray-700 hover:text-gray-900 dark:text-gray-200"><ArrowLeft className="h-5 w-5" /> {backLabel}</button>
      <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
        {editing && onRename ? (
          <input autoFocus aria-label="Workflow name" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => { if (onRename(draft)) setEditing(false); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setDraft(name); setEditing(false); } }}
            className="w-80 rounded-lg border border-primary-300 px-2 py-1 text-center font-heading text-lg font-semibold outline-none" />
        ) : (
          <>
            <span className="truncate font-heading text-lg font-semibold text-gray-900 dark:text-white">{name}</span>
            {canEdit && onRename && <button type="button" onClick={() => setEditing(true)} className="text-gray-400 hover:text-gray-700" aria-label="Rename"><Pencil className="h-4 w-4" /></button>}
          </>
        )}
      </div>
      {extra}
      {undo && <button type="button" onClick={undo} disabled={!canUndo} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40" aria-label="Undo"><Undo2 className="h-4 w-4" /></button>}
      {redo && <button type="button" onClick={redo} disabled={!canRedo} className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40" aria-label="Redo"><Redo2 className="h-4 w-4" /></button>}
      {saving && saving !== 'idle' && (
        <span className="flex w-20 items-center gap-1.5 text-sm text-gray-500" role="status">
          {saving === 'saving' ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving</> : <><CloudUpload className="h-4 w-4" /> Saved</>}
        </span>
      )}
    </div>
  );
}

export function BuilderPage({ id }: { id: string }) {
  const a = useAuto((s) => s.automations.find((x) => x.id === id));
  const all = useAuto((s) => s.automations);
  const journeys = useAuto((s) => s.journeys);
  const runs = useAuto((s) => s.runs);
  const templates = useAuto((s) => s.templates);
  const perms = usePerms();
  const nav = useNav();
  const actions = useAutomationActions();
  const library = useLibrary();
  const msg = useMessageActions();
  const tabParam = useParam('tab');
  const panelParam = useParam('panel');
  const [tab, setTab] = useState<Tab>(tabParam === 'logs' ? 'logs' : tabParam === 'history' ? 'history' : tabParam === 'settings' ? 'settings' : 'builder');
  const [value, setValue] = useState<CanvasValue | undefined>(a ? valueOf(a) : undefined);
  const [past, setPast] = useState<CanvasValue[]>([]);
  const [future, setFuture] = useState<CanvasValue[]>([]);
  const [saving, setSaving] = useState<'saving' | 'saved' | 'idle'>('idle');
  const [approve, setApprove] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef<CanvasValue | undefined>(undefined);
  const initialPanel = useMemo<Panel | undefined>(() => (panelParam === 'trigger' ? { kind: 'triggers', index: 'new' } : undefined), [panelParam]);

  useEffect(() => { if (a && !value) setValue(valueOf(a)); }, [a, value]);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    const v = pending.current;
    if (!v || !a) return;
    pending.current = undefined;
    const before = a;
    const r = updateAutomation(a.id, v);
    if (!r.ok) { toast.error('Not saved', r.error); setSaving('idle'); return; }
    setSaving('saved');
    if (r.value?.needsApproval && before.deployedAt && changesCustomerFacing(before, v)) toast.info('Approval needed', 'A customer-facing step changed. The published version keeps running until someone approves.');
  }, [a]);
  useEffect(() => () => flush(), [flush]);

  const change = (v: CanvasValue) => {
    if (!value) return;
    setPast((p) => [...p.slice(-49), value]);
    setFuture([]);
    setValue(v);
    pending.current = v;
    setSaving('saving');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 600);
  };
  const undo = () => { if (!past.length || !value) return; const prev = past[past.length - 1]!; setPast(past.slice(0, -1)); setFuture([value, ...future]); setValue(prev); pending.current = prev; setSaving('saving'); timer.current = setTimeout(flush, 300); };
  const redo = () => { if (!future.length || !value) return; const next = future[0]!; setFuture(future.slice(1)); setPast([...past, value]); setValue(next); pending.current = next; setSaving('saving'); timer.current = setTimeout(flush, 300); };

  if (!a || !value) {
    return <div className="flex h-full items-center justify-center"><div className={cn(CARD, 'p-8 text-center')}><p className="mb-3 font-semibold">Workflow not found.</p><AppLink href="/automations" className="text-primary-700 hover:underline">Back to workflows</AppLink></div></div>;
  }
  if (a.isDeleted) {
    return <div className="flex h-full items-center justify-center"><div className={cn(CARD, 'p-8 text-center')}><p className="mb-3 font-semibold">This workflow was deleted. Its past runs stay in the execution logs.</p><AppLink href="/automations?view=workflows&tab=deleted" className="text-primary-700 hover:underline">Back to workflows</AppLink></div></div>;
  }
  const myRuns = runs.filter((r) => r.automationId === a.id);
  const failed = myRuns.filter((r) => r.status === 'FAILED').length;
  const template = allTemplates({ templates } as never).find((t) => t.id === a.templateId);
  const place = boardPlacement(value.trigger);
  const problems = validateAutomation({ name: a.name, trigger: value.trigger.type ? value.trigger : { ...value.trigger, type: 'STAGE_ENTERED', config: { stage: 'NEW' } }, conditions: value.conditions, steps: value.steps }, { otherNames: [], variables: variablesFor(place.pipeline, place.stage) });
  const rename = (n: string) => {
    const err = validateName(n, all.filter((x) => !x.isDeleted && x.id !== a.id).map((x) => x.name), 'workflow name');
    if (err) { toast.error('Not renamed', err); return false; }
    if (n.trim() !== a.name) updateAutomation(a.id, { name: n });
    return true;
  };
  const publish = (on: boolean) => { flush(); actions.toggle({ ...a, ...value } as Automation, on); };
  const readOnly = !perms.manage;
  const tabs: { value: Tab; label: string }[] = [{ value: 'builder', label: 'Builder' }, { value: 'settings', label: 'Settings' }, { value: 'history', label: 'Enrollment history' }, { value: 'logs', label: 'Execution logs' }];

  return (
    <div className="flex h-screen flex-col bg-gray-50 dark:bg-gray-900">
      <BuilderHeader back={() => { flush(); nav.push('/automations'); }} backLabel="Workflows" name={a.name} onRename={rename} canEdit={!readOnly} undo={readOnly ? undefined : undo} redo={readOnly ? undefined : redo} canUndo={past.length > 0} canRedo={future.length > 0} saving={saving} />
      <div className="flex h-14 shrink-0 items-center gap-4 border-b border-gray-200 bg-white px-4 md:px-6 dark:border-gray-700 dark:bg-gray-800">
        <Select aria-label="Builder" className="hidden w-44 md:block" value="standard" onChange={() => undefined}><option value="standard">Standard builder</option></Select>
        <nav className="flex flex-1 justify-center gap-6 overflow-x-auto no-scrollbar" role="tablist">
          {tabs.map((t) => (
            <button key={t.value} role="tab" aria-selected={tab === t.value} onClick={() => setTab(t.value)} className={cn('-mb-px shrink-0 border-b-2 py-4 text-[15px] font-medium', tab === t.value ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-300')}>{t.label}</button>
          ))}
        </nav>
        <button type="button" onClick={() => { flush(); actions.openTest([a.id]); }} className="hidden items-center gap-2 rounded-lg bg-primary-50 px-4 py-2 font-semibold text-primary-700 hover:bg-primary-100 sm:flex"><Play className="h-4 w-4" /> Test workflow</button>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <span className={a.isEnabled ? 'text-gray-400' : 'text-gray-900 dark:text-white'}>Draft</span>
          <Switch checked={a.isEnabled} disabled={readOnly} onCheckedChange={publish} label={<span className={a.isEnabled ? 'text-gray-900 dark:text-white' : 'text-gray-500'}>Publish</span>} />
        </div>
      </div>
      {a.needsReapproval && (
        <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-900">
          A customer-facing step or message changed. The published version keeps running until it is approved.
          {perms.deploy && <Button size="sm" variant="primary" className="ml-auto" onClick={() => { flush(); setApprove(true); }}>Review and approve</Button>}
        </div>
      )}
      {a.templateUpdated && template && perms.manage && (
        <div className="flex items-center gap-3 border-b border-blue-200 bg-blue-50 px-6 py-2 text-sm text-blue-900">
          "{template.name}" was updated to version {template.version}. Nothing changes until you apply it.
          <Button size="sm" className="ml-auto" onClick={() => dismissTemplateUpdate(a.id)}>Ignore</Button>
          <Button size="sm" variant="primary" onClick={() => { const map = msg.copySamples(samplesUsed(template), library); const r = applyTemplateUpdate(a.id, map); if (r.ok) { setValue(undefined); toast.success('Template changes applied'); } }}>Apply</Button>
        </div>
      )}

      {tab === 'builder' ? (
        <WorkflowCanvas value={value} onChange={change} readOnly={readOnly} initialPanel={initialPanel} stats={myRuns.length} onStats={() => setTab('history')} problems={problems} />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
            {tab === 'settings' && (
              <div className={cn(CARD, 'space-y-5 p-6')}>
                <div className="flex items-center gap-3"><h2 className="font-heading text-xl font-bold">Workflow settings</h2><StatusPill status={statusOf(a, failed)} /></div>
                <Field label="Folder" htmlFor="ws-folder" hint="A folder is turned on and off as one, like a journey from first lead to final payment.">
                  <Select id="ws-folder" value={a.journeyId ?? ''} disabled={readOnly} onChange={(e) => updateAutomation(a.id, { journeyId: e.target.value })}>
                    <option value="">No folder</option>{journeys.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
                  </Select>
                </Field>
                <div>
                  <Checkbox checked={!!a.keepGoingIfStageChanges} disabled={readOnly} onCheckedChange={(v) => updateAutomation(a.id, { keepGoingIfStageChanges: v })} label="Keep going even if the stage changes" />
                  <p className="ml-6 text-xs text-gray-500">Without this, a record waiting in this workflow is stopped (Skipped) when it leaves the stage that started it.</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-4 text-sm dark:bg-gray-900">
                  <div><span className="font-semibold">Summary:</span> {a.summary}</div>
                  <div className="mt-1 text-gray-600">{a.deployedAt ? `First published ${relTime(a.deployedAt)}.` : 'Never published.'} {template ? `Made from "${template.name}".` : ''}</div>
                  {problems.length > 0 && <div className="mt-1 text-amber-800">{problems.length} {problems.length === 1 ? 'thing needs' : 'things need'} setup before publishing: {problems[0]!.message}</div>}
                </div>
                <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-4">
                  {perms.manage && <Button onClick={() => actions.openSaveTemplate([a.id])}>Save as template</Button>}
                  <Button onClick={() => actions.openTest([a.id])}><FlaskConical className="h-4 w-4" /> Test workflow</Button>
                  {perms.del && <Button variant="danger" className="ml-auto" onClick={() => actions.openDelete([a.id])}>Delete workflow</Button>}
                </div>
              </div>
            )}
            {tab === 'history' && (
              <div className={CARD}>
                <div className="border-b border-gray-100 px-5 py-3 font-bold">Enrollment history <span className="font-normal text-gray-500">({myRuns.length})</span></div>
                {myRuns.length === 0 ? <div className="p-5"><EmptyNote>No record has gone through this workflow yet.</EmptyNote></div> : (
                  <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                    {myRuns.map((r) => (
                      <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                        <AppLink href={recordHref(r.recordType, r.recordId)} className="font-semibold text-primary-700 hover:underline">{r.recordLabel}</AppLink>
                        <span className="text-gray-500">enrolled {relTime(r.startedAt)}</span>
                        <span className="ml-auto text-gray-600">{r.status === 'DONE' ? 'Finished' : r.steps[r.cursor] ? `At step ${r.cursor + 1}: ${r.steps[r.cursor]!.title}` : ''}{r.waitingFor && r.status !== 'DONE' ? ` · ${r.waitingFor}` : ''}</span>
                        <RunBadge status={r.status} paused={!!r.pausedAt} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {tab === 'logs' && (
              <div className={CARD}>
                <div className="border-b border-gray-100 px-5 py-3 font-bold">Execution logs</div>
                {myRuns.length === 0 ? <div className="p-5"><EmptyNote>Nothing has run yet.</EmptyNote></div> : (
                  <table className="w-full text-left text-sm">
                    <thead><tr className="border-b border-gray-100 text-[11px] font-bold uppercase tracking-wider text-gray-500"><th className="px-5 py-2">Time</th><th className="px-3 py-2">Record</th><th className="px-3 py-2">Step</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Result</th></tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {myRuns.flatMap((r) => r.steps.filter((st) => st.status !== 'PENDING').map((st) => ({ r, st }))).sort((x, y) => (y.st.at ?? y.r.updatedAt).localeCompare(x.st.at ?? x.r.updatedAt)).slice(0, 300).map(({ r, st }, i) => (
                        <tr key={`${r.id}-${st.stepId}-${i}`}>
                          <td className="whitespace-nowrap px-5 py-2 text-gray-500">{relTime(st.at ?? r.updatedAt)}</td>
                          <td className="px-3 py-2"><AppLink href={recordHref(r.recordType, r.recordId)} className="text-primary-700 hover:underline">{r.recordId}</AppLink></td>
                          <td className="px-3 py-2 font-semibold">{st.title}</td>
                          <td className="px-3 py-2"><RunBadge status={st.status} /></td>
                          <td className={cn('px-3 py-2', st.status === 'FAILED' ? 'text-red-700' : 'text-gray-600')}>{st.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      )}
      <DeployModal open={approve} ids={[a.id]} onClose={() => setApprove(false)} />
      {actions.modals}
    </div>
  );
}

/* ---------- Template editor: the same canvas, saved with a button ---------- */

export function TemplateBuilderPage({ id }: { id: string }) {
  const t = useAuto((s) => s.templates.find((x) => x.id === id && !x.isDeleted));
  const nav = useNav();
  const perms = usePerms();
  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState(() => t?.automations.map((a) => ({ name: a.name, value: valueOf({ ...a, notes: [] }) })));
  const [name, setName] = useState(t?.name ?? '');
  if (!t || !drafts) {
    return <div className="flex h-full items-center justify-center"><div className={cn(CARD, 'p-8 text-center')}><p className="mb-3 font-semibold">Template not found. System templates can't be edited; duplicate one to make your own copy.</p><AppLink href="/automations?view=settings&section=templates" className="text-primary-700 hover:underline">Back to templates</AppLink></div></div>;
  }
  const save = () => {
    if (name.trim().length < 3) return toast.error('Name needed', 'Use at least 3 characters.');
    const r = updateTemplate(t.id, { name: name.trim(), automations: drafts.map((d) => ({ name: d.name, trigger: d.value.trigger, extraTriggers: d.value.extraTriggers, conditions: d.value.conditions, steps: d.value.steps })) });
    if (!r.ok) return toast.error('Not saved', r.error);
    toast.success('Template saved', 'Workflows made from it show "Template updated" and change only if someone presses Apply.');
    nav.push('/automations?view=settings&section=templates');
  };
  return (
    <div className="flex h-screen flex-col bg-gray-50 dark:bg-gray-900">
      <BuilderHeader back={() => nav.push('/automations?view=settings&section=templates')} backLabel="Templates" name={name} onRename={(n) => { setName(n); return true; }} canEdit={perms.manage}
        extra={perms.manage ? <Button variant="primary" onClick={save}><Check className="h-4 w-4" /> Save template</Button> : undefined} />
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-gray-100 px-6 py-2 text-sm text-gray-700 dark:border-gray-700 dark:bg-gray-800">
        <Badge tone="gray">Template</Badge> You are editing a template. Changes do not affect anything that is running.
        {drafts.length > 1 && <span className="ml-auto flex flex-wrap gap-1">{drafts.map((d, i) => <button key={i} onClick={() => setIndex(i)} className={cn('rounded-full border px-2.5 py-0.5 text-xs font-semibold', i === index ? 'border-primary-300 bg-white text-primary-700' : 'border-gray-300 text-gray-600')}>{d.name}</button>)}</span>}
      </div>
      <WorkflowCanvas key={index} value={drafts[index]!.value} onChange={(v) => setDrafts(drafts.map((d, i) => (i === index ? { ...d, value: v } : d)))} readOnly={!perms.manage} />
    </div>
  );
}


