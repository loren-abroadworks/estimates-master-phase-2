/*
  CRM Part 1: Website Lead Capture. Pure rules, shared by the screens and the tests.

  - Form links: name required, at most 60 characters, unique in the company.
  - Public form (/f/[linkId]): the manual lead form's fields and required
    fields (components/leads/LeadFormModal.tsx). Email must be a valid format;
    phone needs 10 to 15 digits once symbols are removed.
  - Double click: the same email or phone on the same link within 10 minutes
    is ignored.
  - Thank-you email: {FirstName}, {BusinessName}, {BusinessPhone}.
  - Match check, run every time a form creates a lead. Values are cleaned
    first: phone digits only, email lowercased and trimmed, names trimmed and
    case-insensitive.
      Strong:   same phone or same email as an existing lead or contact.
      Possible: same first and last name, different phone and email.
    Pairs marked "not a duplicate" are never flagged again. Nothing is merged
    or removed automatically.
*/
import type { Customer, Lead, LeadReview, NotDuplicatePair, TrackedLink } from './types';
import { EMAIL_RE, ZIP_RE } from '@/components/leads/leadHelpers';

export const WEB_THANKS_ID = 'am_web_thanks';
export const LINK_NAME_MAX = 60;
export const DOUBLE_SUBMIT_MS = 10 * 60_000;
export const THANKS_COPY = "Thanks, we've received your request. We'll be in touch soon.";
export const PAUSED_COPY = 'This form is not accepting requests right now.';
export const GONE_COPY = 'This form is no longer available.';
export const LINK_SOURCES = ['Website', 'Facebook', 'Instagram', 'Google', 'Other'] as const;

/* ---------- Form links ---------- */

/** Links still on the list (deleted ones are kept only so the form can say so). */
export const liveLinks = (links: TrackedLink[]) => links.filter((l) => !l.deletedAt);

export function linkNameProblem(name: string, links: Pick<TrackedLink, 'id' | 'name' | 'deletedAt'>[], exceptId?: string): string | undefined {
  const n = name.trim();
  if (!n) return 'Enter a link name.';
  if (n.length > LINK_NAME_MAX) return `Keep the name to ${LINK_NAME_MAX} characters or fewer.`;
  if (links.some((l) => !l.deletedAt && l.id !== exceptId && l.name.trim().toLowerCase() === n.toLowerCase())) return 'Another link already has this name.';
  return undefined;
}

export const formLinkPath = (id: string) => `/f/${encodeURIComponent(id)}`;

/** What the public form shows for a link id. */
export function linkState(link: TrackedLink | undefined): 'open' | 'paused' | 'gone' {
  if (!link || link.deletedAt) return 'gone';
  return link.status === 'paused' ? 'paused' : 'open';
}

/* ---------- Public form ---------- */

export interface FormLeadInput {
  firstName: string;
  lastName: string;
  companyName: string;
  phone: string;
  email: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  serviceType: string;
  notes: string;
}

export const EMPTY_FORM_LEAD: FormLeadInput = { firstName: '', lastName: '', companyName: '', phone: '', email: '', street: '', city: '', state: '', zip: '', serviceType: '', notes: '' };

export const phoneDigits = (v: string) => v.replace(/\D/g, '');
export const cleanEmail = (v: string) => v.trim().toLowerCase();
export const cleanName = (v: string) => v.trim().replace(/\s+/g, ' ').toLowerCase();

/** Inline errors by field. Empty object = the form can be sent. */
export function formLeadErrors(f: FormLeadInput): Partial<Record<keyof FormLeadInput, string>> {
  const e: Partial<Record<keyof FormLeadInput, string>> = {};
  if (!f.firstName.trim()) e.firstName = 'First name is required';
  const digits = phoneDigits(f.phone);
  if (!f.phone.trim()) e.phone = 'Phone is required';
  else if (digits.length < 10 || digits.length > 15) e.phone = 'Enter a phone number with 10 to 15 digits';
  if (!f.email.trim()) e.email = 'Email is required';
  else if (!EMAIL_RE.test(f.email.trim())) e.email = 'Enter a valid email address';
  if (!f.street.trim()) e.street = 'Street is required';
  if (!f.city.trim()) e.city = 'City is required';
  if (!f.state.trim()) e.state = 'State is required';
  else if (f.state.trim().length !== 2) e.state = 'State must be 2 characters';
  if (!f.zip.trim()) e.zip = 'Zip is required';
  else if (!ZIP_RE.test(f.zip.trim())) e.zip = 'ZIP code must be in format 12345 or 12345-6789';
  return e;
}

/**
 * True when this submission repeats one the same link took in the last 10
 * minutes (same email or phone): a double click, so no second lead.
 */
export function isDoubleSubmit(f: Pick<FormLeadInput, 'email' | 'phone'>, linkId: string, leads: Pick<Lead, 'trackedLinkId' | 'email' | 'phone' | 'createdAt' | 'webRef'>[], now: number): boolean {
  const email = cleanEmail(f.email);
  const phone = phoneDigits(f.phone);
  return leads.some(
    (l) =>
      l.webRef && l.trackedLinkId === linkId && now - Date.parse(l.createdAt) < DOUBLE_SUBMIT_MS &&
      ((email && cleanEmail(l.email) === email) || (phone && phoneDigits(l.phone) === phone)),
  );
}

/* ---------- Thank-you email ---------- */

export function thanksVars(lead: Pick<Lead, 'firstName'>, business: { companyName?: string; phone?: string }) {
  return { FirstName: lead.firstName || 'there', BusinessName: business.companyName || 'our team', BusinessPhone: business.phone || '' };
}

export const fillThanks = (template: string, vars: Record<string, string>) => template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? vars[k]! : m));

/* ---------- Match check ---------- */

export const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);

export interface Match {
  matchKind: LeadReview['matchKind'];
  matchId: string;
  level: LeadReview['level'];
  on: LeadReview['on'];
}

type Person = { id: string; firstName: string; lastName: string; phone: string; email: string; secondaryPhone?: string; secondaryEmail?: string };

function compare(a: Person, b: Person): Pick<Match, 'level' | 'on'> | undefined {
  const phones = (p: Person) => [p.phone, p.secondaryPhone].map((v) => phoneDigits(v ?? '')).filter((v) => v.length >= 7);
  const emails = (p: Person) => [p.email, p.secondaryEmail].map((v) => cleanEmail(v ?? '')).filter(Boolean);
  const bp = phones(b);
  const be = emails(b);
  if (phones(a).some((p) => bp.includes(p))) return { level: 'strong', on: 'phone' };
  if (emails(a).some((e) => be.includes(e))) return { level: 'strong', on: 'email' };
  const first = cleanName(a.firstName);
  const last = cleanName(a.lastName);
  if (first && last && first === cleanName(b.firstName) && last === cleanName(b.lastName)) return { level: 'possible', on: 'name' };
  return undefined;
}

/**
 * The best match for a new form lead, or undefined. Leads are checked before
 * contacts (a lead shows the last estimate or job), Strong before Possible.
 * Skipped: the lead's own contact, pairs marked "not a duplicate", and leads
 * that are themselves waiting on review.
 */
export function findMatch(
  lead: Lead,
  leads: Lead[],
  customers: Customer[],
  pairs: Pick<NotDuplicatePair, 'a' | 'b'>[],
  openReviews: Pick<LeadReview, 'leadId' | 'status'>[] = [],
): Match | undefined {
  const ignored = new Set(pairs.map((p) => pairKey(p.a, p.b)));
  const waiting = new Set(openReviews.filter((r) => r.status === 'open').map((r) => r.leadId));
  const found: Match[] = [];
  for (const other of leads) {
    if (other.id === lead.id || waiting.has(other.id) || ignored.has(pairKey(lead.id, other.id))) continue;
    const m = compare(lead, other);
    if (m) found.push({ matchKind: 'lead', matchId: other.id, ...m });
  }
  const leadCustomers = new Set(leads.filter((l) => l.id !== lead.id).map((l) => l.customerId));
  for (const c of customers) {
    // A contact with a lead was checked through that lead; the new lead's own contact is not a match.
    if (c.id === lead.customerId || leadCustomers.has(c.id) || ignored.has(pairKey(lead.id, c.id))) continue;
    const m = compare(lead, c);
    if (m) found.push({ matchKind: 'contact', matchId: c.id, ...m });
  }
  return found.find((m) => m.level === 'strong') ?? found[0];
}

export const MATCH_LABEL: Record<LeadReview['level'], string> = {
  strong: 'Likely the same person',
  possible: 'Possible match, please review',
};
