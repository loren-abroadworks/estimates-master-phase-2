'use client';

/*
  Admin Portal › Messages: support conversations with each organization.
  Requests sent from Help & Support inside the app land here (and on the
  dashboard's Messages card). Opening a conversation marks it read; a reply
  is added to it. ?open=<message id> opens that message's conversation.
*/
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Send } from 'lucide-react';
import { PlatformShell, usePlatformAdmin } from '@/components/platform/PlatformShell';
import { EmptyState, PageHeader, SearchInput } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/form';
import { useCollection } from '@/lib/store';
import { cn } from '@/lib/utils';
import { messageAge } from '@/lib/platform';

export default function PlatformMessagesPage() {
  return <PlatformShell title="Messages"><Messages /></PlatformShell>;
}

function Messages() {
  const params = useSearchParams();
  const msgs = useCollection('platformMessages');
  const { session } = usePlatformAdmin();
  const [q, setQ] = useState('');
  const [reply, setReply] = useState('');
  const fromLink = msgs.items.find((m) => m.id === params.get('open'))?.org;
  const [org, setOrg] = useState<string | undefined>(fromLink);
  useEffect(() => { if (fromLink) setOrg(fromLink); }, [fromLink]);

  const threads = useMemo(() => {
    const byOrg = new Map<string, typeof msgs.items>();
    for (const m of msgs.items) byOrg.set(m.org, [...(byOrg.get(m.org) ?? []), m]);
    const t = q.trim().toLowerCase();
    return [...byOrg.entries()]
      .map(([name, list]) => {
        const sorted = [...list].sort((a, b) => a.at.localeCompare(b.at));
        return { org: name, list: sorted, last: sorted.at(-1)!, unread: list.filter((m) => m.direction === 'in' && !m.read).length };
      })
      .filter((x) => !t || x.org.toLowerCase().includes(t) || x.list.some((m) => m.body.toLowerCase().includes(t)))
      .sort((a, b) => b.last.at.localeCompare(a.last.at));
  }, [msgs.items, q]);
  const thread = threads.find((t) => t.org === org);

  // Reading a conversation marks its requests read.
  useEffect(() => {
    if (!thread?.unread) return;
    msgs.setAll(msgs.items.map((m) => (m.org === thread.org && m.direction === 'in' && !m.read ? { ...m, read: true } : m)));
  }, [thread?.org, thread?.unread]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = () => {
    if (!thread || !reply.trim()) return;
    msgs.add({ org: thread.org, from: session?.name ?? 'Estimate Master Support', body: reply.trim(), at: new Date().toISOString(), direction: 'out', read: true, source: 'email' });
    setReply('');
  };

  return (
    <>
      <PageHeader title="Messages" subtitle="Support conversations with every organization." className="mb-6" />
      <div className="grid min-h-[60vh] grid-cols-1 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className={cn('border-gray-100 lg:border-r', thread && 'hidden lg:block')}>
          <div className="border-b border-gray-100 p-3"><SearchInput value={q} onChange={setQ} placeholder="Search messages" className="md:w-full" /></div>
          {threads.length === 0 ? (
            <p className="p-6 text-center text-sm italic text-gray-400">No conversations.</p>
          ) : (
            <ul className="max-h-[65vh] divide-y divide-gray-100 overflow-y-auto">
              {threads.map((t) => (
                <li key={t.org}>
                  <button type="button" onClick={() => setOrg(t.org)} className={cn('flex w-full items-start gap-3 px-4 py-3 text-left', org === t.org ? 'bg-primary-50' : 'hover:bg-gray-50')}>
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-100 text-sm font-bold text-teal-700">{t.org.charAt(0).toUpperCase()}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className={cn('truncate text-sm text-gray-900', t.unread ? 'font-black' : 'font-bold')}>{t.org}</span>
                        <span className="shrink-0 text-xs text-gray-400">{messageAge(t.last.at)}</span>
                      </span>
                      <span className="block truncate text-xs text-gray-500">{t.last.direction === 'out' ? 'You: ' : ''}{t.last.body.split('\n')[0]}</span>
                    </span>
                    {t.unread > 0 && <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary-600" aria-label={`${t.unread} unread`} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
        <section className={cn('flex min-w-0 flex-col', !thread && 'hidden lg:flex')}>
          {!thread ? (
            <EmptyState className="m-6 flex-1" title="Pick a conversation" message="Choose an organization on the left to read and reply." />
          ) : (
            <>
              <header className="flex items-center gap-3 border-b border-gray-100 px-5 py-4">
                <button type="button" onClick={() => setOrg(undefined)} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 lg:hidden" aria-label="Back to conversations"><ArrowLeft className="h-5 w-5" /></button>
                <h2 className="font-heading text-lg font-bold text-gray-900">{thread.org}</h2>
              </header>
              <ol className="max-h-[50vh] flex-1 space-y-3 overflow-y-auto bg-gray-50 p-5">
                {thread.list.map((m) => (
                  <li key={m.id} className={cn('max-w-[85%] rounded-2xl border p-3 text-sm', m.direction === 'out' ? 'ml-auto border-primary-100 bg-primary-50 text-gray-800' : 'border-gray-200 bg-white text-gray-700')}>
                    <div className="mb-1 flex justify-between gap-3 text-xs">
                      <span className="font-bold text-gray-900">{m.from}{m.source === 'support-form' && <span className="ml-2 font-semibold text-teal-700">via the app</span>}</span>
                      <time className="text-gray-400" dateTime={m.at}>{new Date(m.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>
                    </div>
                    <p className="whitespace-pre-line">{m.body}</p>
                  </li>
                ))}
              </ol>
              <div className="flex items-end gap-3 border-t border-gray-100 p-4">
                <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder={`Reply to ${thread.org}`} aria-label="Reply" className="min-h-[56px]" />
                <Button icon={<Send className="h-4 w-4" />} onClick={send} disabled={!reply.trim()} className="h-12">Send</Button>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
