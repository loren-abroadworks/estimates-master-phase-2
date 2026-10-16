/** QA C-01, C-02, C-04: the public website form API (memory mode, as the demo runs without Supabase). */
import { describe, expect, it } from 'vitest';
import { DELETE, GET, POST } from '@/app/api/website-form/route';
import { GET as getLink, PUT as putLinks } from '@/app/api/website-form/links/route';
import { sessionCookie } from '@/lib/auth/server';
import { CAPTCHA_DEMO_TOKEN, CAPTCHA_REQUIRED, DEMO_SITE_KEY } from '@/lib/website-form';

const staff = { cookie: sessionCookie('U-OWNER').header.split(';')[0]! };
let ip = 0;
const post = (body: Record<string, unknown>) => POST(new Request('http://local/api/website-form', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `10.1.1.${++ip}` },
  body: JSON.stringify({ siteKey: DEMO_SITE_KEY, phone: '2145550100', startedAt: Date.now() - 20_000, ...body }),
}));
const inbox = async () => ((await (await GET(new Request('http://local/api/website-form', { headers: staff }))).json()) as { submissions: { ref: string; name: string }[] }).submissions;

describe('website form API', () => {
  it('C-01: reading and clearing the inbox need a staff session', async () => {
    expect((await GET(new Request('http://local/api/website-form'))).status).toBe(401);
    expect((await DELETE(new Request('http://local/api/website-form?ref=WEB-X', { method: 'DELETE' }))).status).toBe(401);
  });

  it('C-01: a reused reference never overwrites the waiting submission', async () => {
    expect((await post({ name: 'Ann Original', ref: 'T-REUSE' })).status).toBe(201);
    expect((await post({ name: 'Mallory Overwrite', ref: 'T-REUSE' })).status).toBe(201);
    expect((await inbox()).filter((s) => s.ref === 'WEB-T-REUSE').map((s) => s.name)).toEqual(['Ann Original']);
  });

  it('C-02: without shared data a recorded submission stays for the other staff browsers', async () => {
    await post({ name: 'Kept For Everyone', ref: 'T-KEEP' });
    expect((await DELETE(new Request('http://local/api/website-form?ref=WEB-T-KEEP', { method: 'DELETE', headers: staff }))).status).toBe(204);
    expect((await inbox()).some((s) => s.ref === 'WEB-T-KEEP')).toBe(true);
  });

  it('C-04: a paused tracked link takes no requests', async () => {
    const pause = (ids: string[]) => putLinks(new Request('http://local/api/website-form/links', { method: 'PUT', headers: { ...staff, 'Content-Type': 'application/json' }, body: JSON.stringify({ paused: ids }) }));
    expect((await pause(['tl_paused'])).status).toBe(204);
    const res = await post({ name: 'Paused Visitor', l: 'tl_paused' });
    expect(res.status).toBe(403);
    expect((await post({ name: 'Live Visitor', l: 'tl_live' })).status).toBe(201);
    await pause([]);
  });

  it('CRM Part 1: the form-link form checks the manual lead form fields', async () => {
    const lead = { form: 'lead', firstName: 'Ann', phone: '(214) 555-0101', email: 'ann@example.com', street: '1 Elm St', city: 'Dallas', state: 'TX', zip: '75201', captcha: CAPTCHA_DEMO_TOKEN };
    const missing = await post({ ...lead, city: '' });
    expect(missing.status).toBe(422);
    expect(await missing.json()).toMatchObject({ field: 'city', error: 'City is required' });
    // Oct 14 call: Google reCAPTCHA on the public form.
    const robot = await post({ ...lead, captcha: '' });
    expect(robot.status).toBe(422);
    expect(await robot.json()).toMatchObject({ field: 'captcha', error: CAPTCHA_REQUIRED });
    expect((await post({ ...lead, ref: 'T-LEAD' })).status).toBe(201);
    const waiting = (await inbox()).find((s) => s.ref === 'WEB-T-LEAD') as unknown as { name: string; lead?: { street: string } };
    expect(waiting).toMatchObject({ name: 'Ann', lead: { street: '1 Elm St' } });
  });

  it('CRM Part 1: a deleted or unknown link is gone; a known open link takes requests', async () => {
    const report = (body: object) => putLinks(new Request('http://local/api/website-form/links', { method: 'PUT', headers: { ...staff, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
    const status = async (l: string) => (await getLink(new Request(`http://local/api/website-form/links?l=${l}`))).json();
    await report({ paused: ['tl_p'], deleted: ['tl_gone'], known: ['tl_open', 'tl_p', 'tl_gone'] });
    expect(await status('tl_open')).toEqual({ paused: false, gone: false, known: true });
    expect(await status('tl_p')).toMatchObject({ paused: true, gone: false });
    expect(await status('tl_gone')).toMatchObject({ gone: true });
    expect(await status('tl_never')).toMatchObject({ gone: true });
    expect((await post({ name: 'Late Visitor', l: 'tl_gone' })).status).toBe(410);
    await report({ paused: [], deleted: [], known: [] });
  });
});
