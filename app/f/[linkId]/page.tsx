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

  Oct 14 call (CRM Part 1):
  - An email or phone number already on file is rejected with a message to
    contact the company directly (Lead Review is dropped).
  - "I'm an existing customer" + a valid Customer ID lets the same email or
    phone through; the lead joins that customer. A hint says where to find it.
  - Google reCAPTCHA (prototype: a demo widget; the server checks its token).
*/
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { CheckCircle2, PauseCircle, ShieldCheck, XCircle } from 'lucide-react';
import { useCollection, useSingleton } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Checkbox, Field, Input, NativeSelect, Textarea } from '@/components/ui/form';
import { SERVICE_TYPES } from '@/lib/constants';
import { CAPTCHA_DEMO_TOKEN, CAPTCHA_REQUIRED, DEMO_SITE_KEY, HONEYPOT_FIELD, MESSAGE_MAX } from '@/lib/website-form';
import {
  CUSTOMER_ID_HINT, EMPTY_FORM_LEAD, GONE_COPY, PAUSED_COPY, THANKS_COPY, UNKNOWN_ID_COPY, checkFormSubmission, duplicateCopy, formLeadErrors, linkState, type FormLeadInput,
} from '@/lib/lead-capture';
import { formatPhone } from '@/components/leads/leadHelpers';

type Errors = Partial<Record<keyof FormLeadInput, string>>;
type Status = 'idle' | 'sending' | 'sent' | 'paused' | 'gone';

export default function PublicLeadForm() {
  const { linkId = '' } = useParams<{ linkId: string }>();
  const { items: links } = useCollection('trackedLinks');
  const { items: leads } = useCollection('leads');
  const { items: customers } = useCollection('customers');
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
  const [existing, setExisting] = useState(false);
  const [captcha, setCaptcha] = useState<'idle' | 'checking' | 'done'>('idle');
  const [duplicate, setDuplicate] = useState(false);
  useEffect(() => setStartedAt(Date.now()), []);
  const set = (k: keyof FormLeadInput, v: string) => {
    setF((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFailure('');
    setDuplicate(false);
    const sent = { ...f, customerCode: existing ? f.customerCode.trim() : '' };
    const found = formLeadErrors(sent);
    if (existing && !sent.customerCode) found.customerCode = 'Enter your Customer ID';
    setErrors(found);
    if (Object.keys(found).length) return;
    if (captcha !== 'done') return setFailure(CAPTCHA_REQUIRED);
    // Same email or phone already on file: rejected unless a valid Customer ID was given.
    const check = checkFormSubmission(sent, leads, customers);
    if (!check.ok) {
      if (check.reason === 'unknownId') setErrors({ customerCode: UNKNOWN_ID_COPY });
      else setDuplicate(true);
      return;
    }
    setStatus('sending');
    const honeypot = new FormData(e.currentTarget).get(HONEYPOT_FIELD);
    try {
      const res = await fetch('/api/website-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...sent, form: 'lead', l: linkId, siteKey: DEMO_SITE_KEY, captcha: CAPTCHA_DEMO_TOKEN, startedAt, [HONEYPOT_FIELD]: honeypot ?? '' }),
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
              {/* Existing customer: their Customer ID lets an email or phone already on file through. */}
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <Checkbox
                  checked={existing}
                  onChange={(v) => { setExisting(v); setDuplicate(false); if (!v) set('customerCode', ''); }}
                  label={<span className="font-semibold text-gray-800">I&apos;m an existing customer</span>}
                />
                {existing && (
                  <Field label="Customer ID" required error={errors.customerCode} hint={CUSTOMER_ID_HINT} className="mt-3">
                    <Input value={f.customerCode} onChange={(e) => set('customerCode', e.target.value.toUpperCase())} placeholder="CUST-XXXXXX" invalid={!!errors.customerCode} aria-label="Customer ID" />
                  </Field>
                )}
              </div>

              <Recaptcha state={captcha} onCheck={() => { setCaptcha('checking'); setFailure(''); setTimeout(() => setCaptcha('done'), 700); }} />

              {duplicate && (
                <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  {duplicateCopy({ companyName: bp.companyName, phone: bp.phone ? formatPhone(bp.phone) : '' })}
                </div>
              )}
              {failure && <p role="alert" className="text-sm font-medium text-red-600">{failure}</p>}
              <Button type="submit" className="w-full" disabled={status === 'sending'}>{status === 'sending' ? 'Sending…' : 'Send request'}</Button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}

/**
 * Google reCAPTCHA v2 checkbox, as it appears on the form. Prototype: ticking it
 * passes after a short check; a real build loads Google's widget and verifies its token.
 */
function Recaptcha({ state, onCheck }: { state: 'idle' | 'checking' | 'done'; onCheck: () => void }) {
  return (
    <div className="flex w-full max-w-[304px] items-center justify-between rounded-[3px] border border-[#d3d3d3] bg-[#f9f9f9] py-2.5 pl-3 pr-2 shadow-[0_0_4px_1px_rgba(0,0,0,0.08)]">
      <button
        type="button"
        role="checkbox"
        aria-checked={state === 'done'}
        aria-label="I'm not a robot"
        disabled={state !== 'idle'}
        onClick={onCheck}
        className="flex items-center gap-3 text-left"
      >
        <span className="flex size-7 items-center justify-center rounded-[2px] border-2 border-[#c1c1c1] bg-white">
          {state === 'checking' && <span className="size-5 animate-spin rounded-full border-[3px] border-[#4a90e2] border-t-transparent" />}
          {state === 'done' && <CheckCircle2 className="size-7 text-[#009688]" />}
        </span>
        <span className="text-sm text-gray-800">I&apos;m not a robot</span>
      </button>
      <span className="flex flex-col items-center text-[10px] leading-tight text-[#555]">
        <ShieldCheck className="mb-0.5 size-7 text-[#4a90e2]" aria-hidden />
        reCAPTCHA
        <span className="text-[8px]">Privacy · Terms</span>
      </span>
    </div>
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
