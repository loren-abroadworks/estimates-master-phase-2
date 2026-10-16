'use client';

/*
  Admin Portal › Tasks: the full list behind the dashboard's Action Needed
  card. Add, assign, tick off or delete; open tasks show on the dashboard.
*/
import React, { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { PlatformShell } from '@/components/platform/PlatformShell';
import { useStaff } from '@/components/platform/AdminParts';
import { EmptyState, PageHeader, PillFilter } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { Checkbox, Input, NativeSelect } from '@/components/ui/form';
import { useCollection } from '@/lib/store';
import { cn, longDate } from '@/lib/utils';

type Show = 'open' | 'done' | 'all';

export default function PlatformTasksPage() {
  return <PlatformShell title="Tasks"><Tasks /></PlatformShell>;
}

function Tasks() {
  const tasks = useCollection('platformTasks');
  const { staff, nameOf } = useStaff();
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('');
  const [due, setDue] = useState('');
  const [show, setShow] = useState<Show>('open');
  const [error, setError] = useState('');

  const add = () => {
    if (!title.trim()) return setError('Enter a task');
    tasks.add({ title: title.trim(), done: false, assigneeId: assignee || undefined, dueDate: due || undefined, createdAt: new Date().toISOString() }, { atStart: true });
    setTitle('');
    setDue('');
    setError('');
  };
  const shown = tasks.items.filter((t) => (show === 'all' ? true : show === 'done' ? t.done : !t.done));

  return (
    <>
      <PageHeader title="Tasks" subtitle="Open tasks show under Action Needed on the dashboard." />
      <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_12rem_10rem_auto]">
          <Input value={title} onChange={(e) => { setTitle(e.target.value); setError(''); }} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="New task" aria-label="New task" invalid={!!error} />
          <NativeSelect value={assignee} onChange={(e) => setAssignee(e.target.value)} aria-label="Assign to">
            <option value="">Unassigned</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </NativeSelect>
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
          <Button icon={<Plus className="h-4 w-4" />} onClick={add} className="h-12">Add task</Button>
        </div>
        {error && <p className="ml-3 mt-1 text-sm text-red-600">{error}</p>}
      </div>
      <div className="mb-4"><PillFilter options={[{ value: 'open', label: 'Open' }, { value: 'done', label: 'Done' }, { value: 'all', label: 'All' }]} value={show} onChange={setShow} /></div>
      {shown.length === 0 ? (
        <EmptyState title={show === 'done' ? 'Nothing done yet' : 'All clear'} message={show === 'done' ? 'Ticked-off tasks show here.' : 'No open tasks. Add one above.'} />
      ) : (
        <ul className="divide-y divide-gray-100 rounded-2xl border border-gray-200 bg-white shadow-sm">
          {shown.map((t) => (
            <li key={t.id} className="flex items-center gap-3 px-4 py-3">
              <Checkbox checked={t.done} onChange={(v) => tasks.update(t.id, { done: v, doneAt: v ? new Date().toISOString() : undefined })} ariaLabel={`Mark "${t.title}" ${t.done ? 'open' : 'done'}`} />
              <span className="min-w-0 flex-1">
                <span className={cn('block text-sm font-semibold', t.done ? 'text-gray-400 line-through' : 'text-gray-900')}>{t.title}</span>
                <span className="text-xs text-gray-500">
                  {t.assigneeId ? nameOf(t.assigneeId) : 'Unassigned'}
                  {t.dueDate && ` · Due ${longDate(t.dueDate)}`}
                  {t.done && t.doneAt && ` · Done ${longDate(t.doneAt)}`}
                </span>
              </span>
              <button type="button" onClick={() => tasks.remove(t.id)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" aria-label={`Delete "${t.title}"`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
