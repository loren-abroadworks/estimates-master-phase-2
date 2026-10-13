/*
  Tracked link status for the public website form (QA C-04).

  GET ?l=<linkId>   public: { paused, gone, known } so the form says it isn't taking
                    requests, or that it is no longer available (CRM Part 1).
  PUT { paused, deleted?, known? }  staff only, without Supabase: the signed-in app
                    reports its paused and deleted links, and every link id it has.
*/
import { appStateConfig } from '@/lib/app-state-server';
import { sessionFrom } from '@/lib/auth/server';
import { linkStatus, setPausedLinks } from '@/lib/tracked-link-status';

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('l') ?? undefined;
  const { status, known } = await linkStatus(id);
  return Response.json({ paused: status === 'paused', gone: status === 'gone', known }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PUT(req: Request) {
  if (!sessionFrom(req)) return Response.json({ error: 'Sign in first.' }, { status: 401 });
  // With shared data the server reads the links itself; nothing to store.
  if (appStateConfig()) return new Response(null, { status: 204 });
  let body: { paused?: unknown; deleted?: unknown; known?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, 500) : undefined);
  setPausedLinks(list(body.paused) ?? [], { deleted: list(body.deleted), known: list(body.known) });
  return new Response(null, { status: 204 });
}
