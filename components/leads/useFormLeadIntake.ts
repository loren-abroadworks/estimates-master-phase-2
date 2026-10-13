'use client';

/*
  CRM Part 1 (2, 3, 5): turns a website form submission into a lead. Called by
  WebsiteInboxSync for each submission waiting at /api/website-form.

  - Ignored: a deleted or paused link, a reference already recorded, and a
    double click (same email or phone on the same link within 10 minutes).
  - The lead gets the next lead number, the link's source and the link's
    starting stage (New Leads unless the link says otherwise), plus a contact
    of type Lead, like the manual Add Lead form.
  - Thank-you email (Settings › Automated Messages): when it is On, a
    simulated send is recorded on the lead, in the activity log and as a
    toast. Off: nothing is sent or logged.
  - The match check runs; a match goes on Lead Review. Nothing is merged or
    removed automatically, and no other automation runs on the lead.
*/
import { useCallback, useRef } from 'react';
import type { Lead, LeadMessageLog } from '@/lib/types';
import { useCollection, useDb, useLogActivity, useNextNumber, useSingleton } from '@/lib/store';
import type { InboxSubmission } from '@/lib/website-form';
import { EMPTY_FORM_LEAD, WEB_THANKS_ID, fillThanks, findMatch, isDoubleSubmit, linkState, thanksVars, type FormLeadInput } from '@/lib/lead-capture';
import { move } from '@/lib/crm';
import { pipelineColumns } from '@/features/lib/rules/lead-pipeline';
import { leadSourceFor, resolveSource } from '@/features/lib/rules/lead-sources';
import { toast } from '@/features/lib/toast';
import { fullName, uid } from '@/lib/utils';
import { appendNote, formatPhone } from './leadHelpers';
import { SERVICE_TYPES } from '@/lib/constants';

export type IntakeOutcome = { kind: 'created'; leadId: string; review: boolean } | { kind: 'ignored'; reason: 'recorded' | 'double' | 'link' };

/** Older /website-form submissions (one name, one address line) in the form-link shape. */
function asFormLead(s: InboxSubmission): FormLeadInput {
  if (s.lead) return s.lead;
  const [firstName = '', ...rest] = s.name.trim().split(/\s+/);
  return { ...EMPTY_FORM_LEAD, firstName, lastName: rest.join(' '), phone: s.phone, email: s.email, street: s.address ?? '', city: s.town, serviceType: s.paintType ?? '', notes: s.message };
}

export function useFormLeadIntake() {
  const db = useDb();
  const dbRef = useRef(db);
  dbRef.current = db;
  const leads = useCollection('leads');
  const customers = useCollection('customers');
  const links = useCollection('trackedLinks');
  const reviews = useCollection('leadReviews');
  const nextNumber = useNextNumber();
  const [bp] = useSingleton('businessProfile');
  const log = useLogActivity();
  // Leads made earlier in this same batch, before the store re-renders.
  const batch = useRef<Lead[]>([]);

  return useCallback(
    (s: InboxSubmission): IntakeOutcome => {
      const c = dbRef.current.collections;
      const known = [...batch.current.filter((b) => !c.leads.some((l) => l.id === b.id)), ...c.leads];
      if (known.some((l) => l.webRef === s.ref)) return { kind: 'ignored', reason: 'recorded' };
      const link = s.trackedLinkId ? c.trackedLinks.find((l) => l.id === s.trackedLinkId) : undefined;
      if (s.trackedLinkId && linkState(link) !== 'open') return { kind: 'ignored', reason: 'link' };
      const f = asFormLead(s);
      const at = new Date(Date.parse(s.receivedAt) || Date.now()).toISOString();
      if (link && isDoubleSubmit(f, link.id, known, Date.parse(at))) return { kind: 'ignored', reason: 'double' };

      const columns = pipelineColumns(c.pipelineStages, 'sales');
      const stage = columns.find((x) => x.id === link?.startStageId) ?? columns[0];
      const status = stage?.leadStatus ?? 'New';
      const source = link ? resolveSource(link.source, c.leadSources) : leadSourceFor({ src: s.srcTag, referrer: s.referrer }, c.leadSources);
      const contact = {
        firstName: f.firstName.trim(), lastName: f.lastName.trim(), companyName: f.companyName.trim() || undefined,
        phone: formatPhone(f.phone.replace(/\D/g, '')), email: f.email.trim(),
        street: f.street.trim(), city: f.city.trim(), state: f.state.trim().toUpperCase(), zip: f.zip.trim(),
      };
      const customer = customers.add({ ...contact, type: 'Lead', source, createdAt: at }, { atStart: true });
      const leadNumber = nextNumber('LEAD');
      const lead: Lead = {
        id: leadNumber, leadNumber, ...contact, leadSource: source,
        serviceType: SERVICE_TYPES.includes(f.serviceType) ? f.serviceType : 'Interior',
        status, estimatedValue: 0, date: at, createdAt: at, updatedAt: at,
        notes: f.notes.trim() ? appendNote(undefined, f.notes) : undefined,
        customerId: customer.id, contactType: 'LEAD', appointment: null,
        trackedLinkId: link?.id, webRef: s.ref,
        ...(stage && !stage.leadStatus ? { stageId: stage.id, stageStatus: status } : {}),
        stageHistory: stage ? [move('sales', stage, 'Website form', at)] : [],
      };

      // Thank-you email (simulated): only when it is switched On.
      const thanks = c.automatedMessages.find((m) => m.id === WEB_THANKS_ID);
      if (thanks?.isActive && lead.email) {
        const vars = thanksVars(lead, { companyName: bp.companyName, phone: bp.phone ? formatPhone(bp.phone) : '' });
        const sent: LeadMessageLog = {
          messageId: thanks.id, name: fillThanks(thanks.subject ?? thanks.name, vars), stage: status, channel: 'EMAIL', to: lead.email, at, ok: true, sandbox: true,
        };
        lead.sentMessages = [sent];
      }
      leads.add(lead, { atStart: true });
      batch.current = [lead, ...batch.current].slice(0, 50);
      if (link) links.update(link.id, { submissions: (link.submissions ?? 0) + 1 });
      log(link ? `Lead ${leadNumber} created from form link ${link.name} (${source}).` : `Lead ${leadNumber} created from the website form (${source}).`, 'lead', lead.id);
      if (lead.sentMessages?.length) log(`Thank-you email sent to ${lead.email} for lead ${leadNumber}.`, 'lead', lead.id);

      // Match check (Lead Review). The new contact is the lead's own, so it is not a match.
      const match = findMatch(lead, [lead, ...known], c.customers, c.notDuplicatePairs, c.leadReviews);
      if (match) reviews.add({ id: uid('lr'), leadId: lead.id, ...match, createdAt: at, status: 'open' }, { atStart: true });

      toast.success(`New website lead: ${fullName(lead)} (${leadNumber})`, `${source}${stage ? ` · ${stage.displayName}` : ''}${match ? ' · added to Lead Review' : ''}`);
      if (lead.sentMessages?.length) toast.info(`Thank-you email sent to ${lead.email}`, 'Simulated: no email service is connected.');
      return { kind: 'created', leadId: lead.id, review: !!match };
    },
    [customers, leads, links, reviews, nextNumber, bp.companyName, bp.phone, log],
  );
}
