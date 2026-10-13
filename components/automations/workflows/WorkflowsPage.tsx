'use client';

/*
  Automation › Workflows (Figma screen 1). Top tabs: Workflows, Overview,
  Global Workflow Settings. The list has folders (a folder is a journey: it
  turns on and off as one), All workflows / Needs review / Deleted tabs,
  smart lists, search, and the table. "Create workflow" starts from scratch,
  from a template, or from a copy of another workflow.
*/
import { useMemo, useState } from 'react';
import * as DM from '@radix-ui/react-dropdown-menu';
import {
  Archive, ArchiveRestore, ChevronRight, Copy, Files, FlaskConical, Folder, FolderInput, FolderPlus, LayoutTemplate, Pencil, Plus, Rocket, Search, Trash2, Workflow, X,
} from 'lucide-react';
import type { Automation } from '@/lib/automations/types';
import { allTemplates, archiveAutomations, createAutomation, deleteJourney, duplicateAutomation, moveToJourney, restoreAutomations, setEnabled, useAuto } from '@/lib/automations/store';
import { useNav, useParam } from '@/features/lib/navigation';
import { toast } from '@/features/lib/toast';
import { Screen } from '@/features/components/layout/screen';
import { Badge, Banner, Button, Field, Input, Modal, RowMenu, Select, Switch } from '@/features/components/ui';
import { cn } from '@/lib/utils';
import { usePerms } from '../hooks';
import { useAutomationActions } from '../actions';
import { JourneyModal } from '../modals';
import { UseTemplateModal } from '../TemplatesTab';
import { ReviewTab } from '../ReviewTab';
import { useConfirm } from '../shared';
import { StatusPill, longDate, statusOf, triggerLabel } from './shared';
import { OverviewTab } from './OverviewTab';
import { GlobalSettings } from './GlobalSettings';

type View = 'workflows' | 'overview' | 'settings';
type ListTab = 'all' | 'review' | 'deleted' | `smart:${string}`;

interface SmartList { id: string; name: string; status: string; group: string }
const SMART_KEY = 'emts-workflow-smart-lists';
function loadSmart(): SmartList[] {
  try { return JSON.parse(localStorage.getItem(SMART_KEY) ?? '[]') as SmartList[]; } catch { return []; }
}
function saveSmart(list: SmartList[]) {
  try { localStorage.setItem(SMART_KEY, JSON.stringify(list)); } catch { /* private mode: lists last for this visit */ }
}

export function newWorkflowName(names: string[]) {
  let n = 1;
  let name = 'Untitled workflow';
  while (names.some((x) => x.toLowerCase() === name.toLowerCase())) name = `Untitled workflow ${++n}`;
  return name;
}

export function WorkflowsPage() {
  const nav = useNav();
  const view = (useParam('view') as View | undefined) ?? 'workflows';
  const perms = usePerms();
  if (!perms.view) {
    return <Screen crumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Automation' }]}><Banner tone="warn" title="No access">Your role can't see Automation. Ask the business owner for access.</Banner></Screen>;
  }
  const tabs: { value: View; label: string }[] = [{ value: 'workflows', label: 'Workflows' }, { value: 'overview', label: 'Overview' }, { value: 'settings', label: 'Global Workflow Settings' }];
  return (
    <Screen crumbs={[{ label: 'Home', href: '/dashboard' }, { label: 'Automation' }]} bare>
      <nav className="flex gap-7 border-b border-gray-200 bg-white px-4 md:px-10 dark:border-gray-700 dark:bg-gray-800" aria-label="Automation">
        {tabs.map((t) => (
          <button key={t.value} type="button" aria-current={view === t.value ? 'page' : undefined} onClick={() => nav.push(`/automations?view=${t.value}`)}
            className={cn('-mb-px border-b-2 py-4 text-lg font-medium', view === t.value ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-300')}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="mx-auto w-full max-w-[1440px] px-4 py-8 md:px-10">
        {view === 'overview' ? <OverviewTab /> : view === 'settings' ? <GlobalSettings /> : <WorkflowList />}
      </div>
    </Screen>
  );
}

function WorkflowList() {
  const nav = useNav();
  const perms = usePerms();
  const automations = useAuto((s) => s.automations);
  const journeys = useAuto((s) => s.journeys);
  const runs = useAuto((s) => s.runs);
  const reviews = useAuto((s) => s.reviews);
  const templates = useAuto((s) => s.templates);
  const actions = useAutomationActions();
  const { confirm, dialog } = useConfirm();
  const tabParam = (useParam('tab') as ListTab | undefined) ?? 'all';
  const folderId = useParam('folder');
  const itemParam = useParam('item');
  const [q, setQ] = useState('');
  const [smart, setSmart] = useState<SmartList[]>(() => loadSmart());
  const [smartModal, setSmartModal] = useState(false);
  const [smartDraft, setSmartDraft] = useState<SmartList>({ id: '', name: '', status: '', group: '' });
  const [folderModal, setFolderModal] = useState<{ id?: string }>();
  const [pickTemplate, setPickTemplate] = useState(false);
  const [useTpl, setUseTpl] = useState<string>();
  const [pickCopy, setPickCopy] = useState(false);
  const [moveFor, setMoveFor] = useState<Automation>();
  const [moveTo, setMoveTo] = useState('');
  const tab: ListTab = tabParam === 'review' && !perms.review ? 'all' : tabParam;
  const go = (t: ListTab, folder?: string) => nav.push(`/automations?view=workflows&tab=${t}${folder ? `&folder=${folder}` : ''}`);

  const counts = useMemo(() => {
    const total = new Map<string, number>();
    const failed = new Map<string, number>();
    for (const r of runs) {
      total.set(r.automationId, (total.get(r.automationId) ?? 0) + 1);
      if (r.status === 'FAILED') failed.set(r.automationId, (failed.get(r.automationId) ?? 0) + 1);
    }
    return { total, failed };
  }, [runs]);
  const waiting = reviews.filter((r) => r.status === 'WAITING').length;
  const live = automations.filter((a) => !a.isDeleted);
  const folder = journeys.find((j) => j.id === folderId);
  const smartList = tab.startsWith('smart:') ? smart.find((x) => `smart:${x.id}` === tab) : undefined;

  const rows = (tab === 'deleted' ? automations.filter((a) => a.isDeleted) : live)
    // In All workflows, a folder's workflows sit inside the folder (search and smart lists show everything).
    .filter((a) => (folder ? a.journeyId === folder.id : tab !== 'all' || !!q || !a.journeyId || !journeys.some((j) => j.id === a.journeyId)))
    .filter((a) => !q || `${a.name} ${triggerLabel(a.trigger)}`.toLowerCase().includes(q.toLowerCase()))
    .filter((a) => !smartList || ((!smartList.status || statusOf(a, counts.failed.get(a.id) ?? 0) === smartList.status) && (!smartList.group || a.trigger.module === smartList.group)))
    .sort((x, y) => Number(x.isArchived) - Number(y.isArchived) || y.updatedAt.localeCompare(x.updatedAt));
  const folderRows = tab === 'all' && !folder && !q ? journeys : [];

  const startScratch = () => {
    const r = createAutomation({ name: newWorkflowName(live.map((a) => a.name)), trigger: { type: '', module: 'LEAD', config: {} }, conditions: [], steps: [], journeyId: folder?.id });
    if (!r.ok) return toast.error('Not created', r.error);
    nav.push(`/automations/${r.value}?panel=trigger`);
  };

  const togglePublish = (a: Automation, on: boolean) => actions.toggle(a, on);

  const menu = (a: Automation) => {
    if (a.isDeleted) return [{ label: 'View execution logs', icon: <Files />, onSelect: () => nav.push(`/automations/${a.id}?tab=logs`) }];
    return [
      { label: perms.manage ? 'Edit' : 'Open', icon: <Pencil />, onSelect: () => nav.push(`/automations/${a.id}`) },
      ...(perms.manage ? [
        { label: 'Duplicate', icon: <Copy />, onSelect: () => { const r = duplicateAutomation(a.id); if (r.ok) toast.success('Duplicated', 'The copy is a draft.'); } },
        { label: 'Move to folder', icon: <FolderInput />, onSelect: () => { setMoveFor(a); setMoveTo(a.journeyId ?? ''); } },
        { label: 'Save as template', icon: <LayoutTemplate />, onSelect: () => actions.openSaveTemplate([a.id]) },
      ] : []),
      { label: 'Test workflow', icon: <FlaskConical />, onSelect: () => actions.openTest([a.id]) },
      ...(perms.manage ? [
        a.isEnabled ? { label: 'Unpublish', icon: <Rocket />, onSelect: () => togglePublish(a, false) } : { label: 'Publish', icon: <Rocket />, onSelect: () => togglePublish(a, true) },
        a.isArchived
          ? { label: 'Restore', icon: <ArchiveRestore />, onSelect: () => { restoreAutomations([a.id]); toast.success('Restored', 'It is a draft.'); } }
          : { label: 'Archive', icon: <Archive />, onSelect: () => { archiveAutomations([a.id]); toast.success('Archived'); } },
      ] : []),
      ...(perms.del ? [{ label: 'Delete', icon: <Trash2 />, danger: true, onSelect: () => actions.openDelete([a.id]) }] : []),
    ];
  };

  const folderToggle = (id: string, on: boolean) => {
    const j = journeys.find((x) => x.id === id)!;
    const list = j.automationIds.map((x) => automations.find((a) => a.id === x)).filter((a): a is Automation => !!a && !a.isDeleted && !a.isArchived);
    if (!list.length) return toast.info('This folder is empty', 'Move workflows into it first.');
    if (!on) return actions.openTurnOff(list.map((a) => a.id), id);
    if (list.some((a) => !a.deployedAt || a.needsReapproval)) return actions.openDeploy(list.map((a) => a.id), id);
    const r = setEnabled(list.map((a) => a.id), true);
    if (r.ok) toast.success(`${j.name}: every workflow published`); else toast.error('Not published', r.error);
  };

  const listTabs: { value: ListTab; label: string }[] = [
    { value: 'all', label: 'All workflows' },
    ...(perms.review ? [{ value: 'review' as ListTab, label: `Needs review (${waiting})` }] : []),
    { value: 'deleted', label: 'Deleted' },
    ...smart.map((x) => ({ value: `smart:${x.id}` as ListTab, label: x.name })),
  ];

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold text-gray-900 md:text-4xl dark:text-white">Workflows</h1>
          <p className="mt-1.5 text-base text-gray-500">Automate follow-ups, assignments and reminders across leads, estimates, jobs and invoices.</p>
        </div>
        {perms.manage && (
          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={() => setFolderModal({})}><FolderPlus className="h-4 w-4" /> Create folder</Button>
            <DM.Root>
              <DM.Trigger asChild><Button size="lg" variant="primary"><Plus className="h-4 w-4" /> Create workflow</Button></DM.Trigger>
              <DM.Portal>
                <DM.Content align="end" sideOffset={6} className="z-50 w-80 rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl dark:border-gray-700 dark:bg-gray-800">
                  {[
                    { icon: <Plus className="h-4 w-4" />, title: 'Start from scratch', body: 'Blank canvas. Pick a trigger, then add steps.', on: startScratch },
                    { icon: <LayoutTemplate className="h-4 w-4" />, title: 'Select from template', body: 'Ready-made painting workflows like follow-ups and reviews.', on: () => setPickTemplate(true) },
                    { icon: <Copy className="h-4 w-4" />, title: 'Duplicate a workflow', body: 'Copy an existing workflow as a starting point.', on: () => setPickCopy(true) },
                  ].map((o) => (
                    <DM.Item key={o.title} onSelect={o.on} className="flex cursor-pointer gap-3 rounded-lg px-3 py-2.5 outline-none data-[highlighted]:bg-gray-100 dark:data-[highlighted]:bg-gray-700">
                      <span className="mt-0.5 text-gray-600 dark:text-gray-300">{o.icon}</span>
                      <span><span className="block text-sm font-semibold text-gray-900 dark:text-white">{o.title}</span><span className="block text-xs text-gray-500">{o.body}</span></span>
                    </DM.Item>
                  ))}
                </DM.Content>
              </DM.Portal>
            </DM.Root>
          </div>
        )}
      </div>

      <div className="mb-5 flex flex-col gap-3 border-b border-gray-200 md:flex-row md:items-end md:justify-between dark:border-gray-700">
        <div className="-mb-px flex gap-6 overflow-x-auto no-scrollbar" role="tablist">
          {listTabs.map((t) => (
            <button key={t.value} role="tab" aria-selected={tab === t.value} onClick={() => go(t.value)}
              className={cn('shrink-0 border-b-2 pb-3 text-[15px] font-medium', tab === t.value ? 'border-primary-600 text-primary-700' : 'border-transparent text-gray-600 hover:text-gray-900 dark:text-gray-300')}>
              {t.label}
            </button>
          ))}
          <button type="button" onClick={() => { setSmartDraft({ id: '', name: '', status: '', group: '' }); setSmartModal(true); }} className="flex shrink-0 items-center gap-1.5 border-b-2 border-transparent pb-3 text-[15px] font-medium text-gray-600 hover:text-gray-900 dark:text-gray-300">
            <Plus className="h-4 w-4" /> New smart list
          </button>
        </div>
        {tab !== 'review' && (
          <div className="relative mb-3 w-full md:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <Input aria-label="Search workflows" placeholder="Search workflows" value={q} onChange={(e) => setQ(e.target.value)} className="h-10 pl-9" />
          </div>
        )}
      </div>

      {smartList && (
        <div className="mb-3 flex items-center gap-2 text-sm text-gray-600">
          Smart list: {smartList.status || 'any status'}, {smartList.group ? `${smartList.group.toLowerCase().replace('_', ' ')} triggers` : 'any trigger'}
          <button className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:underline" onClick={() => { const next = smart.filter((x) => x.id !== smartList.id); setSmart(next); saveSmart(next); go('all'); }}><X className="h-3 w-3" /> Delete list</button>
        </div>
      )}

      {folder && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button className="text-sm font-semibold text-primary-700 hover:underline" onClick={() => go('all')}>All workflows</button>
          <ChevronRight className="h-4 w-4 text-gray-400" />
          <span className="flex items-center gap-2 font-bold"><Folder className="h-4 w-4 text-gray-500" />{folder.name}</span>
          {perms.manage && <Switch checked={folder.isEnabled} onCheckedChange={(v) => folderToggle(folder.id, v)} label={<span className="text-sm text-gray-600">{folder.isEnabled ? 'Published' : 'Draft'}</span>} />}
          <RowMenu label={`Actions for ${folder.name}`} items={[
            { label: 'Rename folder', icon: <Pencil />, onSelect: () => setFolderModal({ id: folder.id }) },
            { label: 'Test the folder', icon: <FlaskConical />, onSelect: () => actions.openTest(folder.automationIds) },
            { label: 'Save folder as template', icon: <LayoutTemplate />, onSelect: () => actions.openSaveTemplate(folder.automationIds, folder.id) },
            ...(perms.del ? [{ label: 'Delete folder', icon: <Trash2 />, danger: true, onSelect: () => confirm({ title: `Delete "${folder.name}"?`, body: 'Its workflows are kept and move out of the folder.', label: 'Delete', onConfirm: () => { deleteJourney(folder.id); go('all'); } }) }] : []),
          ]} />
        </div>
      )}

      {tab === 'review' ? <ReviewTab initialItem={itemParam} /> : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:border-gray-700">
                  <th className="px-6 py-4">Workflow name</th><th className="px-4 py-4">Trigger</th><th className="px-4 py-4">Status</th><th className="px-4 py-4">Enrolled</th><th className="px-4 py-4">Last updated</th><th className="w-12 px-4 py-4"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {folderRows.map((j) => {
                  const list = j.automationIds.map((x) => automations.find((a) => a.id === x)).filter((a): a is Automation => !!a && !a.isDeleted);
                  return (
                    <tr key={j.id} className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40" onClick={() => go('all', j.id)}>
                      <td className="px-6 py-4"><span className="flex items-center gap-3 font-semibold text-gray-900 dark:text-white"><Folder className="h-5 w-5 text-amber-500" />{j.name}<span className="text-xs font-normal text-gray-500">{list.length} workflows</span></span></td>
                      <td className="px-4 py-4 text-gray-600">Folder</td>
                      <td className="px-4 py-4"><StatusPill status={j.isEnabled ? 'Published' : 'Draft'} /></td>
                      <td className="px-4 py-4">{list.reduce((n, a) => n + (counts.total.get(a.id) ?? 0), 0)}</td>
                      <td className="px-4 py-4 text-gray-600">{longDate(j.createdAt)}</td>
                      <td className="px-4 py-4"><ChevronRight className="h-4 w-4 text-gray-400" /></td>
                    </tr>
                  );
                })}
                {rows.map((a) => (
                  <tr key={a.id} className={cn('hover:bg-gray-50 dark:hover:bg-gray-700/40', !a.isDeleted && 'cursor-pointer')} onClick={() => !a.isDeleted && nav.push(`/automations/${a.id}`)}>
                    <td className="px-6 py-4">
                      <span className="flex items-center gap-3 font-semibold text-gray-900 dark:text-white">
                        <Workflow className="h-5 w-5 shrink-0 text-primary-600" />
                        {a.name}{a.isDeleted ? ' (deleted)' : ''}
                        {a.needsReapproval && <Badge tone="amber">Changes waiting for approval</Badge>}
                        {a.templateUpdated && <Badge tone="blue">Template updated</Badge>}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-gray-600 dark:text-gray-300">{triggerLabel(a.trigger)}{a.extraTriggers?.length ? ` +${a.extraTriggers.length}` : ''}</td>
                    <td className="px-4 py-4">{a.isDeleted ? <span className="text-xs text-gray-500">Deleted</span> : <StatusPill status={statusOf(a, counts.failed.get(a.id) ?? 0)} />}</td>
                    <td className="px-4 py-4 text-gray-700 dark:text-gray-200">{counts.total.get(a.id) ?? 0}</td>
                    <td className="px-4 py-4 text-gray-600 dark:text-gray-300">{longDate(a.updatedAt)}</td>
                    <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}><RowMenu label={`Actions for ${a.name}`} items={menu(a)} /></td>
                  </tr>
                ))}
                {rows.length === 0 && folderRows.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    {tab === 'deleted' ? 'No deleted workflows.' : q ? 'No workflows match.' : (
                      <span className="flex flex-col items-center gap-3">
                        <span className="font-semibold text-gray-800 dark:text-gray-100">Let the app handle the next steps</span>
                        <span>Start from a ready-made painting workflow, or build one from scratch.</span>
                        {perms.manage && <span className="flex gap-2"><Button onClick={() => setPickTemplate(true)}><LayoutTemplate className="h-4 w-4" /> Select from template</Button><Button variant="primary" onClick={startScratch}><Plus className="h-4 w-4" /> Start from scratch</Button></span>}
                      </span>
                    )}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="border-t border-gray-100 px-6 py-3 text-xs text-gray-500 dark:border-gray-700">Showing {rows.length} of {tab === 'deleted' ? automations.filter((a) => a.isDeleted).length : live.length} workflows</div>
        </div>
      )}

      {folderModal && <JourneyModal open journeyId={folderModal.id} onClose={() => setFolderModal(undefined)} />}
      <Modal open={pickTemplate} onOpenChange={setPickTemplate} size="lg" title="Select from template" description="Ready-made painting workflows. Everything starts as a draft.">
        <TemplatePicker templates={allTemplates({ templates } as never)} onPick={(id) => { setPickTemplate(false); setUseTpl(id); }} />
      </Modal>
      {useTpl && <UseTemplateModal templateId={useTpl} onClose={() => setUseTpl(undefined)} />}
      <Modal open={pickCopy} onOpenChange={setPickCopy} title="Duplicate a workflow" description="The copy starts as a draft.">
        <ul className="max-h-[60vh] divide-y divide-gray-100 overflow-y-auto">
          {live.map((a) => (
            <li key={a.id}><button className="flex w-full items-center gap-3 px-2 py-2.5 text-left hover:bg-gray-50" onClick={() => {
              const r = duplicateAutomation(a.id);
              setPickCopy(false);
              if (r.ok) nav.push(`/automations/${r.value}`); else toast.error('Not duplicated', r.error);
            }}><Workflow className="h-4 w-4 text-primary-600" /><span className="min-w-0"><span className="block font-semibold">{a.name}</span><span className="block text-xs text-gray-500">{triggerLabel(a.trigger)}</span></span></button></li>
          ))}
          {!live.length && <li className="py-6 text-center text-sm text-gray-500">No workflows to copy yet.</li>}
        </ul>
      </Modal>
      <Modal open={!!moveFor} onOpenChange={(o) => !o && setMoveFor(undefined)} title={`Move "${moveFor?.name}" to a folder`}
        footer={<><Button onClick={() => setMoveFor(undefined)}>Cancel</Button><Button variant="primary" onClick={() => { moveToJourney([moveFor!.id], moveTo || undefined); toast.success('Moved'); setMoveFor(undefined); }}>Move</Button></>}>
        <Select aria-label="Folder" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
          <option value="">No folder</option>{journeys.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
        </Select>
      </Modal>
      <Modal open={smartModal} onOpenChange={setSmartModal} title="New smart list" description="A saved filter, shown as a tab. Kept in this browser."
        footer={<><Button onClick={() => setSmartModal(false)}>Cancel</Button><Button variant="primary" onClick={() => {
          if (smartDraft.name.trim().length < 2) return toast.error('Name needed');
          const next = [...smart, { ...smartDraft, id: Date.now().toString(36), name: smartDraft.name.trim() }];
          setSmart(next); saveSmart(next); setSmartModal(false); go(`smart:${next[next.length - 1]!.id}`);
        }}>Create</Button></>}>
        <div className="space-y-3">
          <Field label="Name" htmlFor="sl-name" required><Input id="sl-name" value={smartDraft.name} onChange={(e) => setSmartDraft({ ...smartDraft, name: e.target.value })} placeholder="Invoice workflows with errors" /></Field>
          <Field label="Status" htmlFor="sl-status"><Select id="sl-status" value={smartDraft.status} onChange={(e) => setSmartDraft({ ...smartDraft, status: e.target.value })}><option value="">Any status</option><option>Published</option><option>Draft</option><option>Error</option><option>Archived</option></Select></Field>
          <Field label="Trigger on" htmlFor="sl-group"><Select id="sl-group" value={smartDraft.group} onChange={(e) => setSmartDraft({ ...smartDraft, group: e.target.value })}><option value="">Any record</option><option value="LEAD">Leads</option><option value="ESTIMATE">Estimates</option><option value="JOB">Jobs</option><option value="WORK_ORDER">Work orders</option><option value="INVOICE">Invoices</option><option value="CALENDAR">Appointments</option></Select></Field>
        </div>
      </Modal>
      {actions.modals}
      {dialog}
    </div>
  );
}

function TemplatePicker({ templates, onPick }: { templates: ReturnType<typeof allTemplates>; onPick: (id: string) => void }) {
  const [kind, setKind] = useState<'JOURNEY' | 'AUTOMATION'>('JOURNEY');
  return (
    <div>
      <div className="mb-3 inline-flex rounded-xl bg-gray-100 p-1">
        {(['JOURNEY', 'AUTOMATION'] as const).map((k) => (
          <button key={k} onClick={() => setKind(k)} className={cn('h-8 rounded-lg px-3 text-sm font-semibold', kind === k ? 'bg-white shadow-sm' : 'text-gray-600')}>{k === 'JOURNEY' ? 'Full journeys (folders)' : 'Single workflows'}</button>
        ))}
      </div>
      <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
        {templates.filter((t) => t.kind === kind).map((t) => (
          <li key={t.id}>
            <button onClick={() => onPick(t.id)} className="flex w-full items-start gap-3 rounded-xl border border-gray-200 p-3 text-left hover:border-primary-300 hover:bg-primary-50/40">
              <LayoutTemplate className="mt-0.5 h-4 w-4 text-gray-500" />
              <span className="min-w-0">
                <span className="flex items-center gap-2 font-semibold">{t.name}{t.source === 'SYSTEM' ? <Badge tone="gray">From Estimate Master</Badge> : <Badge tone="blue">Yours</Badge>}</span>
                <span className="block text-sm text-gray-600">{t.description}</span>
                {t.kind === 'JOURNEY' && <span className="block text-xs text-gray-500">{t.automations.length} workflows in one folder</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
