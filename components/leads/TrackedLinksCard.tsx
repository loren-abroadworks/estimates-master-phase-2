'use client';

/*
  Form links (CRM Part 1, 1; was "Tracked links", CRM-M5), on Lead Pipeline › Website.
  Each link opens the public lead form at /f/{linkId} (app/f/[linkId]/page.tsx).
  Columns: Link name, Source, Status, Submissions, Created, Actions.
  - Create Link / Edit: name (required, at most 60 characters, unique), source,
    and the Sales stage new leads start in (CRM Part 2, 8: not Sold or Lost).
  - Copy Link ("Link copied"), QR Code (with Download PNG), Pause / Resume.
  - Delete asks inline. A deleted link stops working (the form says it is no
    longer available); leads it already captured stay.
  Only Admin Master Data (Owner and Admin) creates, edits, pauses or deletes.
*/
import { useRef, useState } from 'react';
import { Copy, Download, Link2, Pause, Pencil, Play, Plus, QrCode, Trash2 } from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import { useCollection, useCurrentUser, useLogActivity } from '@/lib/store';
import { fullName, shortDate, uid } from '@/lib/utils';
import { formLinkPath, linkNameProblem, liveLinks, LINK_NAME_MAX } from '@/lib/lead-capture';
import { activeSourceNames } from '@/features/lib/rules/lead-sources';
import { pipelineColumns } from '@/features/lib/rules/lead-pipeline';
import { useCurrentUser as useFeatureUser } from '@/features/lib/store';
import { can } from '@/features/lib/permissions';
import type { TrackedLink } from '@/lib/types';
import { Badge, Button, Card, CardTitle, Field, Input, Modal, RowMenu, Select, Table, TD, TH, THead, TR, VersionBadge } from '@/features/components/ui';
import { toast } from '@/features/lib/toast';

export function TrackedLinksCard() {
  const links = useCollection('trackedLinks');
  const me = fullName(useCurrentUser());
  const log = useLogActivity();
  const [editing, setEditing] = useState<TrackedLink | 'new'>();
  const [confirming, setConfirming] = useState<string>();
  // Tab 2: managing lead capture links is for Admin Master Data (Owner and Admin).
  const admin = can(useFeatureUser(), 'settings.masterData');
  const [qr, setQr] = useState<TrackedLink>();
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const list = liveLinks(links.items);

  const copy = async (l: TrackedLink) => {
    try {
      await navigator.clipboard.writeText(origin + formLinkPath(l.id));
      toast.success('Link copied');
    } catch {
      toast.error('Could not copy', 'Select the link and copy it by hand.');
    }
  };
  const togglePause = (l: TrackedLink) => {
    const status = l.status === 'active' ? 'paused' : 'active';
    links.update(l.id, { status });
    log(`Form link ${l.name} ${status === 'paused' ? 'paused' : 'resumed'} by ${me}.`);
    toast.success(status === 'paused' ? `${l.name} paused` : `${l.name} resumed`, status === 'paused' ? 'The form now says it is not accepting requests.' : undefined);
  };
  const remove = (l: TrackedLink) => {
    links.update(l.id, { deletedAt: new Date().toISOString() });
    log(`Form link ${l.name} deleted by ${me}.`);
    setConfirming(undefined);
    toast.success(`${l.name} deleted`);
  };
  const save = (v: { name: string; source: string; startStageId?: string }) => {
    if (editing === 'new') {
      links.add({ id: uid('tl'), ...v, status: 'active', createdAt: new Date().toISOString(), createdBy: me, submissions: 0 });
      log(`Form link ${v.name} created with source ${v.source} by ${me}.`);
      toast.success('Link created', `${v.name} tags leads as ${v.source}.`);
    } else if (editing) {
      links.update(editing.id, v);
      toast.success('Link saved');
    }
    setEditing(undefined);
  };

  return (
    <Card className="p-5">
      <CardTitle icon={<Link2 />} badge={<VersionBadge item="CRM-M5" />} right={admin ? <Button variant="primary" size="sm" onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> Create Link</Button> : undefined}>
        Form links
      </CardTitle>
      <p className="-mt-3 mb-4 text-sm text-gray-500">Share a link or its QR code. Each lead it captures gets the link&apos;s source.</p>
      {!list.length ? (
        <p className="rounded-xl border border-dashed border-gray-200 py-8 text-center text-sm text-gray-500">No form links yet. Create one to start capturing website leads.</p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Link name</TH><TH>Source</TH><TH>Status</TH><TH className="text-right">Submissions</TH><TH>Created</TH><TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <tbody>
            {list.map((l) => (
              <TR key={l.id}>
                <TD className="font-semibold text-ink">{l.name}</TD>
                <TD><Badge tone="blue">{l.source}</Badge></TD>
                <TD><Badge tone={l.status === 'active' ? 'green' : 'gray'}>{l.status === 'active' ? 'Active' : 'Paused'}</Badge></TD>
                <TD className="text-right tabular-nums">{l.submissions ?? 0}</TD>
                <TD className="whitespace-nowrap">{shortDate(l.createdAt)}</TD>
                <TD className="text-right">
                  {confirming === l.id ? (
                    <span className="inline-flex flex-wrap items-center justify-end gap-2" role="alert">
                      <span className="text-left text-sm text-gray-700">Delete {l.name}? The link stops working. Leads already captured stay.</span>
                      <Button size="sm" variant="danger-solid" onClick={() => remove(l)}>Delete</Button>
                      <Button size="sm" variant="secondary" onClick={() => setConfirming(undefined)}>Cancel</Button>
                    </span>
                  ) : (
                    <span className="inline-flex flex-wrap items-center justify-end gap-1 lg:flex-nowrap">
                      <Button size="sm" variant="secondary" onClick={() => void copy(l)} aria-label={`Copy link for ${l.name}`}><Copy className="h-3.5 w-3.5" /> Copy Link</Button>
                      <Button size="sm" variant="secondary" onClick={() => setQr(l)} aria-label={`QR code for ${l.name}`}><QrCode className="h-3.5 w-3.5" /> QR Code</Button>
                      {admin && <>
                        <Button size="sm" variant="secondary" onClick={() => togglePause(l)} className="min-w-[5.5rem]">
                          {l.status === 'active' ? <><Pause className="h-3.5 w-3.5" /> Pause</> : <><Play className="h-3.5 w-3.5" /> Resume</>}
                        </Button>
                        <RowMenu
                          label={`More actions for ${l.name}`}
                          items={[
                            { label: 'Edit', icon: <Pencil />, onSelect: () => setEditing(l) },
                            { label: 'Delete', icon: <Trash2 />, danger: true, onSelect: () => setConfirming(l.id) },
                          ]}
                        />
                      </>}
                    </span>
                  )}
                </TD>
              </TR>
            ))}
          </tbody>
        </Table>
      )}

      {editing && <LinkModal link={editing === 'new' ? undefined : editing} onClose={() => setEditing(undefined)} onSave={save} />}
      {qr && <QrModal link={qr} url={origin + formLinkPath(qr.id)} onClose={() => setQr(undefined)} />}
    </Card>
  );
}

function QrModal({ link, url, onClose }: { link: TrackedLink; url: string; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  const download = () => {
    const canvas = box.current?.querySelector('canvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `${link.name.replace(/[^\w-]+/g, '_')}_QR.png`;
    a.click();
  };
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title={link.name}
      description={`Leads from this code get the source ${link.source}.`}
      size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button variant="primary" onClick={download}><Download className="h-4 w-4" /> Download PNG</Button></>}
    >
      <div className="flex flex-col items-center gap-3 py-2">
        {/* White box so the code scans in dark mode too. */}
        <div ref={box} className="rounded-xl bg-[#fff] p-3"><QRCodeCanvas value={url} size={200} marginSize={1} /></div>
        <code className="break-all text-center text-xs text-gray-500">{url}</code>
      </div>
    </Modal>
  );
}

function LinkModal({ link, onClose, onSave }: { link?: TrackedLink; onClose: () => void; onSave: (v: { name: string; source: string; startStageId?: string }) => void }) {
  const { items: links } = useCollection('trackedLinks');
  // D6 (2 Oct 2026): links pick from the organisation's active lead sources (Settings › Pipeline Stages › Lead sources).
  const sources = activeSourceNames(useCollection('leadSources').items);
  // CRM Part 2 (8): a link can start its leads on any Sales stage except Sold and Lost.
  const stages = pipelineColumns(useCollection('pipelineStages').items, 'sales').filter((s) => s.leadStatus !== 'Sold' && s.leadStatus !== 'Lost');
  const [name, setName] = useState(link?.name ?? '');
  const [source, setSource] = useState(link?.source ?? '');
  const [startStageId, setStart] = useState(link?.startStageId && stages.some((s) => s.id === link.startStageId) ? link.startStageId : stages[0]?.id ?? '');
  const [touched, setTouched] = useState(false);
  const nameError = linkNameProblem(name, links, link?.id);
  const sourceError = source ? undefined : 'Choose a source.';
  const submit = () => {
    setTouched(true);
    if (nameError || sourceError) return;
    onSave({ name: name.trim(), source, startStageId: startStageId === stages[0]?.id ? undefined : startStageId });
  };
  return (
    <Modal
      open
      onOpenChange={(v) => !v && onClose()}
      title={link ? 'Edit Link' : 'Create Link'}
      size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>{link ? 'Save' : 'Create'}</Button></>}
    >
      <div className="space-y-4">
        <Field label="Link name" required htmlFor="link-name" error={touched ? nameError : undefined} hint={`${name.trim().length}/${LINK_NAME_MAX}`}>
          <Input id="link-name" value={name} maxLength={LINK_NAME_MAX + 10} onChange={(e) => setName(e.target.value)} invalid={touched && !!nameError} placeholder="Instagram bio link" autoFocus />
        </Field>
        <Field label="Source" required htmlFor="link-source" error={touched ? sourceError : undefined}>
          <Select id="link-source" value={source} onChange={(e) => setSource(e.target.value)} invalid={touched && !!sourceError}>
            <option value="">Choose a source…</option>
            {sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Starting stage" htmlFor="link-stage" hint="New leads from this link start here.">
          <Select id="link-stage" value={startStageId} onChange={(e) => setStart(e.target.value)}>
            {stages.map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
