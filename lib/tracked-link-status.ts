/*
  Server side: which tracked links (CRM-M5) are paused, so the public website
  form refuses a paused link on the server, not only in the visitor's browser
  (QA C-04; spec 02: "Given a paused link, When a visitor opens it, Then the
  form does not show and no lead is created").

  With Supabase the shared copy of the app's data is the source. Without it,
  each browser keeps its own data, so signed-in staff browsers report the
  paused links to the server (PUT /api/website-form/links).
*/
/*
  CRM Part 1 (1, 2): deleted links and unknown ids are "gone" (the form says
  it is no longer available). Without Supabase the staff browsers also report
  the deleted links and every link id they know.
*/
import { appStateConfig } from './app-state-server';

const REPLICA_KEY = 'emts-replica-db-v2';
const memoryPaused = new Set<string>();
const memoryDeleted = new Set<string>();
/** Every link id a staff browser reported; undefined until one has. */
let memoryKnown: Set<string> | undefined;

export type LinkStatus = 'open' | 'paused' | 'gone';

export function setPausedLinks(ids: string[], report: { deleted?: string[]; known?: string[] } = {}) {
  memoryPaused.clear();
  for (const id of ids) memoryPaused.add(id);
  if (report.deleted) {
    memoryDeleted.clear();
    for (const id of report.deleted) memoryDeleted.add(id);
  }
  if (report.known) memoryKnown = new Set(report.known);
}

type BlobLink = { id?: unknown; status?: unknown; deletedAt?: unknown };
function linksIn(raw: string | null | undefined): BlobLink[] {
  try {
    const db = JSON.parse(raw ?? '') as { collections?: { trackedLinks?: BlobLink[] } };
    return Array.isArray(db.collections?.trackedLinks) ? db.collections!.trackedLinks! : [];
  } catch {
    return [];
  }
}

/**
 * A link's status for the public form. `known` is false when the server has
 * no list to check against (no staff browser has reported yet): the form then
 * relies on the visitor's own copy.
 */
export async function linkStatus(id: string | undefined): Promise<{ status: LinkStatus; known: boolean }> {
  if (!id) return { status: 'open', known: false };
  const cfg = appStateConfig();
  if (!cfg) {
    if (memoryDeleted.has(id)) return { status: 'gone', known: true };
    if (memoryPaused.has(id)) return { status: 'paused', known: true };
    if (memoryKnown) return { status: memoryKnown.has(id) ? 'open' : 'gone', known: true };
    return { status: 'open', known: false };
  }
  const res = await fetch(`${cfg.table}?select=value&key=eq.${REPLICA_KEY}`, { headers: cfg.headers, cache: 'no-store' });
  if (!res.ok) return { status: 'open', known: false };
  const [row] = (await res.json()) as { value: string }[];
  const link = linksIn(row?.value).find((l) => l.id === id);
  if (!link || link.deletedAt) return { status: 'gone', known: true };
  return { status: link.status === 'paused' ? 'paused' : 'open', known: true };
}

/** Paused link ids inside the replica data blob ({ collections: { trackedLinks } }). */
export function pausedIn(raw: string | null | undefined): Set<string> {
  try {
    const db = JSON.parse(raw ?? '') as { collections?: { trackedLinks?: { id?: unknown; status?: unknown }[] } };
    const links = Array.isArray(db.collections?.trackedLinks) ? db.collections!.trackedLinks! : [];
    return new Set(links.filter((l) => l.status === 'paused' && typeof l.id === 'string').map((l) => l.id as string));
  } catch {
    return new Set();
  }
}

export async function isLinkPaused(id: string | undefined): Promise<boolean> {
  if (!id) return false;
  const cfg = appStateConfig();
  if (!cfg) return memoryPaused.has(id);
  const res = await fetch(`${cfg.table}?select=value&key=eq.${REPLICA_KEY}`, { headers: cfg.headers, cache: 'no-store' });
  if (!res.ok) return false;
  const [row] = (await res.json()) as { value: string }[];
  return pausedIn(row?.value).has(id);
}
