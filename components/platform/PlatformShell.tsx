'use client';

/*
  Admin Portal frame (/platform): a white top bar with the menu button,
  back/forward and the page pill, and a dark navy menu that slides in from
  the left over a dimmed, blurred page. Spec: "EMTS Admin Dashboard", Layout
  & navigation. The contractor sidebar is hidden on these pages
  (components/auth/AuthGate.tsx).

  Only Estimate Master staff use the portal; in this replica that is the
  owner account. Everyone else sees a short notice.
*/
import React, { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowLeft, ArrowRight, BadgeDollarSign, Briefcase, Calendar, CheckSquare, Layers, LayoutGrid, LogOut, Menu, MessageSquare,
  PackageCheck, PackagePlus, Settings, Shield, ShieldCheck, TicketPercent, Users, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSession, useSignOut } from '@/components/auth/AuthGate';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { useCollection } from '@/lib/store';

export const PLATFORM_NAV = [
  { href: '/platform/dashboard', label: 'Dashboard', icon: LayoutGrid },
  { href: '/platform/subscribers', label: 'Subscribers', icon: Users },
  { href: '/platform/leads', label: 'Leads', icon: Briefcase },
  { href: '/platform/messages', label: 'Messages', icon: MessageSquare },
  { href: '/platform/tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/platform/calendar', label: 'Calendar', icon: Calendar },
  { href: '/platform/tier-management', label: 'Tier Management', icon: Layers },
  { href: '/platform/add-on-plans', label: 'Add-on Plans', icon: PackagePlus },
  { href: '/platform/fulfillment', label: 'Fulfillment', icon: PackageCheck },
  { href: '/platform/coupons', label: 'Coupons', icon: TicketPercent },
  { href: '/platform/commissions', label: 'Commissions', icon: BadgeDollarSign },
  { href: '/platform/team-access', label: 'Team Access', icon: ShieldCheck },
] as const;

/** Roles that may open the Admin Portal. */
const PLATFORM_ROLES = ['owner'];

export function usePlatformAdmin() {
  const { session, ready } = useSession();
  return { session, ready, allowed: !!session && PLATFORM_ROLES.includes(session.role) };
}

export function PlatformShell({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { session, ready, allowed } = usePlatformAdmin();

  useEffect(() => {
    document.title = `${title} | Admin Portal`;
  }, [title]);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-gray-50">
      <TopBar title={title} onMenu={() => setOpen(true)} name={session?.name} />
      <main className="flex-1 overflow-auto">
        <div className="px-4 py-8 md:px-8">
          {!ready ? null : allowed ? <Suspense fallback={null}>{children}</Suspense> : (
            <div className="mx-auto mt-16 max-w-md rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-50 text-primary-600"><Shield className="h-8 w-8" /></div>
              <h1 className="font-heading text-xl font-bold text-gray-900">Admin Portal</h1>
              <p className="mt-2 text-sm text-gray-500">The Admin Portal is for Estimate Master staff. Sign in with the owner account to open it.</p>
              <Link href="/dashboard" className="mt-6 inline-block text-sm font-bold text-primary-600 hover:underline">Back to your dashboard</Link>
            </div>
          )}
        </div>
      </main>
      <Drawer open={open} onClose={() => setOpen(false)} />
      {allowed && <FeedbackTab />}
    </div>
  );
}

function TopBar({ title, onMenu, name }: { title: string; onMenu: () => void; name?: string }) {
  const router = useRouter();
  const [hasHistory, setHasHistory] = useState(false);
  useEffect(() => setHasHistory(window.history.length > 1), []);
  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between border-b border-gray-200 bg-white px-4 shadow-sm md:h-20 md:px-6 print:hidden">
      <div className="flex min-w-0 items-center gap-3 md:gap-4">
        <button type="button" onClick={onMenu} className="-ml-2 rounded-lg p-2 text-gray-500 hover:bg-gray-100" aria-label="Open menu">
          <Menu className="h-6 w-6" />
        </button>
        <div className="flex items-center gap-1 md:gap-2">
          <button type="button" onClick={() => router.back()} disabled={!hasHistory} className={cn('rounded-full p-2', hasHistory ? 'text-gray-600 hover:bg-gray-100' : 'pointer-events-none text-gray-200')} aria-label="Go back">
            <ArrowLeft className="h-6 w-6" />
          </button>
          <button type="button" onClick={() => router.forward()} className="hidden rounded-full p-2 text-gray-300 hover:bg-gray-100 hover:text-gray-600 md:block" aria-label="Go forward">
            <ArrowRight className="h-6 w-6" />
          </button>
        </div>
        <div className="h-6 w-px bg-gray-200 md:h-8" />
        <span className="truncate rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm font-bold text-gray-900 shadow-sm md:px-3 md:text-base">{title}</span>
      </div>
      {name && <span className="hidden text-sm font-semibold text-gray-600 md:block">{name}</span>}
    </header>
  );
}

function Drawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname() || '';
  const signOut = useSignOut();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  // Close after following a link.
  useEffect(() => onClose(), [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const item = (href: string, label: string, Icon: React.ElementType) => {
    const active = pathname === href || pathname.startsWith(href + '/');
    return (
      <Link
        key={href}
        href={href}
        aria-current={active ? 'page' : undefined}
        className={cn('flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors', active ? 'bg-blue-600 font-bold text-white' : 'font-medium text-slate-400 hover:bg-slate-800 hover:text-white')}
      >
        <Icon className="h-5 w-5 shrink-0" /> {label}
      </Link>
    );
  };

  return (
    <div className={cn('fixed inset-0 z-[90] print:hidden', !open && 'pointer-events-none')} aria-hidden={!open}>
      <div onClick={onClose} className={cn('absolute inset-0 bg-gray-900/50 backdrop-blur-sm transition-opacity', open ? 'opacity-100' : 'opacity-0')} />
      <nav
        aria-label="Admin Portal"
        className={cn('absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col bg-slate-900 shadow-2xl transition-transform duration-300', open ? 'translate-x-0' : '-translate-x-full')}
      >
        <div className="flex items-center justify-between px-5 py-5">
          <span className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white"><Shield className="h-5 w-5" /></span>
            <span className="font-heading text-lg font-bold text-white">Admin</span>
          </span>
          <button ref={closeRef} type="button" onClick={onClose} tabIndex={open ? 0 : -1} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
          {PLATFORM_NAV.map((n) => item(n.href, n.label, n.icon))}
        </div>
        <div className="space-y-1 border-t border-slate-800 px-3 py-4">
          {item('/platform/settings', 'Settings', Settings)}
          <button type="button" onClick={signOut} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-red-400 hover:bg-slate-800 hover:text-red-300">
            <LogOut className="h-5 w-5" /> Logout
          </button>
        </div>
      </nav>
    </div>
  );
}

/** "Provide feedback" tab on the right edge: notes go to the admin task list. */
function FeedbackTab() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const tasks = useCollection('platformTasks');
  const { toast } = useToast();
  const send = () => {
    if (!text.trim()) return;
    tasks.add({ title: `Feedback: ${text.trim()}`, done: false, createdAt: new Date().toISOString() }, { atStart: true });
    setText('');
    setOpen(false);
    toast('Thanks. Your feedback was added to Tasks.');
  };
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed right-0 top-1/2 z-30 -translate-y-1/2 rotate-180 rounded-r-lg bg-primary-600 px-1.5 py-3 text-xs font-bold text-white shadow-lg [writing-mode:vertical-rl] hover:bg-primary-700 print:hidden"
      >
        Provide feedback
      </button>
      {open && (
        <div className="fixed bottom-4 right-4 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl" role="dialog" aria-label="Provide feedback">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-heading text-base font-bold text-gray-900">Provide feedback</h2>
            <button type="button" onClick={() => setOpen(false)} className="rounded-full p-1 text-gray-400 hover:bg-gray-100" aria-label="Close"><X className="h-5 w-5" /></button>
          </div>
          <Textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="What should we improve?" aria-label="Feedback" />
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={send} disabled={!text.trim()}>Send</Button>
          </div>
        </div>
      )}
    </>
  );
}
