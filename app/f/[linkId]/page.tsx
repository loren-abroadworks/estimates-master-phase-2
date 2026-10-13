'use client';

/*
  Public lead form for a form link (CRM Part 1, 2): /f/{linkId}.
  Shows the business name and logo from Business Profile and the manual Add
  Lead form's fields and required fields (lib/lead-capture.ts formLeadErrors).
  A required field left empty shows an inline error and nothing is sent.
  It posts to /api/website-form; a signed-in app turns the submission into a
  lead in the link's starting stage with the link's source
  (components/leads/useFormLeadIntake.ts).
  A paused link says it is not accepting requests; a deleted or unknown link
  says it is no longer available. The server checks both again on submit.
*/
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, PauseCircle, XCircle } from 'lucide-react';
import { useCollection, useSingleton } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Field, Input, NativeSelect, Textarea } from '@/components/ui/form';
import { SERVICE_TYPES } from '@/lib/constants';
import { DEMO_SITE_KEY, HONEYPOT_FIELD, MESSAGE_MAX } from '@/lib/website-form';
import { EMPTY_FORM_LEAD, GONE_COPY, PAUSED_COPY, THANKS_COPY, formLeadErrors, linkState, type FormLeadInput } from '@/lib/lead-capture';

type Errors = Partial<Record<keyof FormLeadInput, string>>;
type Status = 'idle' | 'sending' | 'sent' | 'paused' | 'gone';

export default function PublicLeadForm() {
  const { linkId = '' } = useParams<{ linkId: string }>();
  const { items: links } = useCollection('trackedLinks');
  const [bp] = useSingleton('businessProfile');
  const local = linkState(links.find((l) => l.id === linkId));
  // The server knows what staff browsers changed; this browser's own copy may be out of date (QA C-04).
  const [server, setServer] = useState<{ paused: boolean; gone: boolean; known: boolean }>();
  useEffect(() => {
    fetch(`/api/website-form/links?l=${encodeURIComponent(linkId)}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : undefined))
      .then((b) => b && setServer(b))
      .catch(() => {});
  }, [linkId]);
  const linkNow = server?.known ? (server.gone ? 'gone' : server.paused ? 'paused' : 'open') : server?.paused ? 'paused' : local;

  const [f, setF] = useState<FormLeadInput>(EMPTY_FORM_LEAD);
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<Status>('idle');
  const [failure, setFailure] = useState('');
  const [startedAt, setStartedAt] = useState(0);
  useEffect(() => setStartedAt(Date.now()), []);
  const set = (k: keyof FormLeadInput, v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFailure('');
    const found = formLeadErrors(f);
    setErrors(found);
    if (Object.keys(found).length) return;
    setStatus('sending');
    const honeypot = new FormData(e.currentTarget).get(HONEYPOT_FIELD);
    try {
      const res = await fetch('/api/website-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, form: 'lead', l: linkId, siteKey: DEMO_SITE_KEY, startedAt, [HONEYPOT_FIELD]: honeypot ?? '' }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string; field?: keyof FormLeadInput; paused?: boolean; gone?: boolean };
      if (json.paused) return setStatus('paused');
      if (json.gone) return setStatus('gone');
      if (!res.ok) {
        setStatus('idle');
        if (json.field && json.field in EMPTY_FORM_LEAD) setErrors({ [json.field]: json.error });
        else setFailure(json.error ?? 'Something went wrong. Please call us.');
        return;
      }
      setStatus('sent');
    } catch {
      setStatus('idle');
      setFailure('No connection. Please try again.');
    }
  };

  const shown: Status = status === 'idle' || status === 'sending' ? (linkNow === 'open' ? status : linkNow) : status;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8 sm:py-12">
      <div className="mx-auto w-full max-w-xl">
        <header className="mb-6 flex items-center gap-3">
          {bp.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={bp.logoUrl} alt="" className="h-12 w-12 shrink-0 rounded-xl object-contain" />
          ) : (
            <span aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-lg font-black text-white">{(bp.companyName || 'B').slice(0, 1)}</span>
          )}
          <div className="min-w-0">
            <h1 className="truncate font-heading text-xl font-extrabold text-gray-900">{bp.companyName || 'Request a free estimate'}</h1>
            <p className="text-sm text-gray-500">Tell us about your project and we&apos;ll get back to you.</p>
          </div>
        </header>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
          {shown === 'sent' ? (
            <Notice icon={<CheckCircle2 className="h-10 w-10 text-green-600" />} text={THANKS_COPY} />
          ) : shown === 'paused' ? (
            <Notice icon={<PauseCircle className="h-10 w-10 text-gray-400" />} text={PAUSED_COPY} />
          ) : shown === 'gone' ? (
            <Notice icon={<XCircle className="h-10 w-10 text-gray-400" />} text={GONE_COPY} />
          ) : (
            <form noValidate onSubmit={submit} className="space-y-4">
              {/* Hidden from people; bots that fill it in are ignored. */}
              <input type="text" name={HONEYPOT_FIELD} tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="First Name" required error={errors.firstName}>
                  <Input value={f.firstName} onChange={(e) => set('firstName', e.target.value)} autoComplete="given-name" invalid={!!errors.firstName} aria-label="First Name" />
                </Field>
                <Field label="Last Name">
                  <Input value={f.lastName} onChange={(e) => set('lastName', e.target.value)} autoComplete="family-name" aria-label="Last Name" />
                </Field>
                <Field label="Phone" required error={errors.phone}>
                  <Input type="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" placeholder="(214) 555-0100" invalid={!!errors.phone} aria-label="Phone" />
                </Field>
                <Field label="Email" required error={errors.email}>
                  <Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" placeholder="you@example.com" invalid={!!errors.email} aria-label="Email" />
                </Field>
              </div>
              <Field label="Company Name">
                <Input value={f.companyName} onChange={(e) => set('companyName', e.target.value)} autoComplete="organization" aria-label="Company Name" />
              </Field>
              <Field label="Street Address" required error={errors.street}>
                <Input value={f.street} onChange={(e) => set('street', e.target.value)} autoComplete="street-address" placeholder="123 Main St" invalid={!!errors.street} aria-label="Street Address" />
              </Field>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="City" required error={errors.city}>
                  <Input value={f.city} onChange={(e) => set('city', e.target.value)} autoComplete="address-level2" invalid={!!errors.city} aria-label="City" />
                </Field>
                <Field label="State" required error={errors.state}>
                  <Input value={f.state} maxLength={2} onChange={(e) => set('state', e.target.value.toUpperCase())} autoComplete="address-level1" placeholder="ST" invalid={!!errors.state} aria-label="State" />
                </Field>
                <Field label="Zip" required error={errors.zip}>
                  <Input value={f.zip} onChange={(e) => set('zip', e.target.value)} autoComplete="postal-code" placeholder="12345" invalid={!!errors.zip} aria-label="Zip" />
                </Field>
              </div>
              <Field label="Service Type">
                <NativeSelect value={f.serviceType} onChange={(e) => set('serviceType', e.target.value)} aria-label="Service Type">
                  <option value="">Choose one…</option>
                  {SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </NativeSelect>
              </Field>
              <Field label="Notes" hint="What would you like painted? Anything we should know?">
                <Textarea rows={4} maxLength={MESSAGE_MAX} value={f.notes} onChange={(e) => set('notes', e.target.value)} aria-label="Notes" />
              </Field>
              {failure && <p role="alert" className="text-sm font-medium text-red-600">{failure}</p>}
              <Button type="submit" className="w-full" disabled={status === 'sending'}>{status === 'sending' ? 'Sending…' : 'Send request'}</Button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

function Notice({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 py-8 text-center">
      {icon}
      <p className="max-w-sm text-base font-semibold text-gray-900">{text}</p>
    </div>
  );
}
