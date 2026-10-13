'use client';

/*
  Turns website form submissions waiting at /api/website-form into leads.
  Runs while someone is signed in: on load, every 8 seconds and when the tab
  regains focus. Each submission is recorded once per reference, so two open
  browsers draining the same inbox still create one lead.

  CRM Part 1: leads are made by useFormLeadIntake (form link source and
  starting stage, thank-you email, match check). Older /website-form
  submissions go the same way.
*/
import { useEffect, useRef } from 'react';
import { useCollection } from '@/lib/store';
import { getSession } from '@/features/lib/auth/client-session';
import { useStore } from '@/features/lib/store';
import type { InboxSubmission } from '@/lib/website-form';
import { useFormLeadIntake, type IntakeOutcome } from '@/components/leads/useFormLeadIntake';

// Spec 02: a new lead shows within 10 seconds.
const POLL_MS = 8_000;
let draining = false;

/*
  References this browser has already recorded. The inbox keeps submissions
  for a week when there is no shared data (so every staff browser gets them),
  so a reference is recorded once per browser: no log line on every poll, and
  a lead someone deleted is not recreated.
*/
const SEEN_KEY = 'emts-website-inbox-seen';
const SEEN_MAX = 500;
function readSeen(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function markSeen(seen: string[], ref: string) {
  seen.push(ref);
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen.slice(-SEEN_MAX)));
  } catch {
    /* storage blocked: the reference check in the intake still prevents a second lead */
  }
}

async function drain(intake: (s: InboxSubmission) => IntakeOutcome) {
  if (draining || !getSession() || !useStore.getState().currentUserId) return;
  draining = true;
  try {
    const res = await fetch('/api/website-form', { cache: 'no-store' });
    if (!res.ok) return;
    const { submissions } = (await res.json()) as { submissions?: InboxSubmission[] };
    const seen = readSeen();
    for (const s of submissions ?? []) {
      if (seen.includes(s.ref)) continue;
      intake(s);
      markSeen(seen, s.ref);
      await fetch(`/api/website-form?ref=${encodeURIComponent(s.ref)}`, { method: 'DELETE' });
    }
  } catch {
    /* offline: try again on the next tick */
  } finally {
    draining = false;
  }
}

export function WebsiteInboxSync() {
  const { items: links } = useCollection('trackedLinks');
  const intake = useFormLeadIntake();
  const intakeRef = useRef(intake);
  intakeRef.current = intake;
  // QA C-04 and CRM Part 1: without shared data the server learns the paused and deleted links, and every link id, from signed-in browsers.
  const report = JSON.stringify({
    paused: links.filter((l) => l.status === 'paused' && !l.deletedAt).map((l) => l.id),
    deleted: links.filter((l) => l.deletedAt).map((l) => l.id),
    known: links.map((l) => l.id),
  });
  useEffect(() => {
    if (!getSession()) return;
    void fetch('/api/website-form/links', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: report }).catch(() => {});
  }, [report]);
  useEffect(() => {
    const run = () => void drain((s) => intakeRef.current(s));
    run();
    const t = setInterval(run, POLL_MS);
    window.addEventListener('focus', run);
    return () => {
      clearInterval(t);
      window.removeEventListener('focus', run);
    };
  }, []);
  return null;
}
