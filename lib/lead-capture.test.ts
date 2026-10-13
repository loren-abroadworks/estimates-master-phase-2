import { describe, expect, it } from 'vitest';
import type { Customer, Lead, TrackedLink } from './types';
import {
  DOUBLE_SUBMIT_MS, EMPTY_FORM_LEAD, fillThanks, findMatch, formLeadErrors, isDoubleSubmit, linkNameProblem, linkState, pairKey, thanksVars,
} from './lead-capture';

const lead = (id: string, x: Partial<Lead> = {}): Lead => ({
  id, leadNumber: id, firstName: 'Ann', lastName: 'Lee', phone: '', email: '', street: '', city: '', state: '', zip: '', leadSource: 'Website',
  serviceType: 'Interior', status: 'New', estimatedValue: 0, date: '2026-10-01', createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01', contactType: 'LEAD', ...x,
});
const customer = (id: string, x: Partial<Customer> = {}): Customer => ({
  id, firstName: 'Cal', lastName: 'Ray', email: '', phone: '', street: '', city: '', state: '', zip: '', type: 'Contact', source: 'Referral', createdAt: '2026-01-01', ...x,
});
const link = (x: Partial<TrackedLink> = {}): TrackedLink => ({ id: 'tl_1', name: 'Instagram bio', source: 'Instagram', status: 'active', createdAt: '', createdBy: '', ...x });

describe('form links', () => {
  it('needs a unique name of at most 60 characters', () => {
    const links = [link()];
    expect(linkNameProblem('  ', links)).toBe('Enter a link name.');
    expect(linkNameProblem('x'.repeat(61), links)).toMatch(/60 characters/);
    expect(linkNameProblem('instagram BIO', links)).toBe('Another link already has this name.');
    expect(linkNameProblem('Instagram bio', links, 'tl_1')).toBeUndefined();
    // A deleted link frees its name.
    expect(linkNameProblem('Instagram bio', [link({ deletedAt: '2026-10-01' })])).toBeUndefined();
  });

  it('tells the form whether it is open, paused or gone', () => {
    expect(linkState(link())).toBe('open');
    expect(linkState(link({ status: 'paused' }))).toBe('paused');
    expect(linkState(link({ deletedAt: '2026-10-01' }))).toBe('gone');
    expect(linkState(undefined)).toBe('gone');
  });
});

describe('public form', () => {
  const ok = { ...EMPTY_FORM_LEAD, firstName: 'Ann', phone: '(214) 555-0101', email: 'ann@example.com', street: '1 Elm St', city: 'Dallas', state: 'TX', zip: '75201' };
  it('accepts the manual form required fields', () => {
    expect(formLeadErrors(ok)).toEqual({});
  });
  it('shows an inline error for each required field left empty', () => {
    expect(Object.keys(formLeadErrors(EMPTY_FORM_LEAD)).sort()).toEqual(['city', 'email', 'firstName', 'phone', 'state', 'street', 'zip']);
  });
  it('checks email format and 10 to 15 phone digits', () => {
    expect(formLeadErrors({ ...ok, email: 'ann@' }).email).toBe('Enter a valid email address');
    expect(formLeadErrors({ ...ok, phone: '555-0101' }).phone).toMatch(/10 to 15/);
    expect(formLeadErrors({ ...ok, phone: '+44 20 7946 0958 12' }).phone).toBeUndefined();
    expect(formLeadErrors({ ...ok, phone: '1234567890123456' }).phone).toMatch(/10 to 15/);
  });
  it('ignores the same email or phone on the same link within 10 minutes', () => {
    const at = Date.parse('2026-10-01T10:00:00.000Z');
    const prior = [lead('L1', { webRef: 'r1', trackedLinkId: 'tl_1', email: 'Ann@Example.com', phone: '214-555-0101' })];
    expect(isDoubleSubmit({ email: ' ann@example.com', phone: '' }, 'tl_1', prior, at + 60_000)).toBe(true);
    expect(isDoubleSubmit({ email: '', phone: '(214) 555-0101' }, 'tl_1', prior, at + 60_000)).toBe(true);
    expect(isDoubleSubmit({ email: 'ann@example.com', phone: '' }, 'tl_2', prior, at + 60_000)).toBe(false);
    expect(isDoubleSubmit({ email: 'ann@example.com', phone: '' }, 'tl_1', prior, at + DOUBLE_SUBMIT_MS + 1)).toBe(false);
  });
});

describe('thank-you email', () => {
  it('fills the placeholders', () => {
    const v = thanksVars({ firstName: 'Ann' }, { companyName: "Master's Touch Painting", phone: '(214) 555-0100' });
    expect(fillThanks('Hi {FirstName}, call {BusinessName} on {BusinessPhone}. {Unknown}', v)).toBe("Hi Ann, call Master's Touch Painting on (214) 555-0100. {Unknown}");
  });
});

describe('match check', () => {
  const fresh = lead('NEW', { firstName: ' john ', lastName: 'SMITH', phone: '(214) 555-0188', email: 'js@example.com', customerId: 'C-NEW' });

  it('same phone or email is Strong, cleaned first', () => {
    const byPhone = lead('L1', { phone: '214.555.0188', email: 'x@example.com' });
    expect(findMatch(fresh, [fresh, byPhone], [], [])).toEqual({ matchKind: 'lead', matchId: 'L1', level: 'strong', on: 'phone' });
    const byEmail = lead('L2', { email: ' JS@Example.COM ' });
    expect(findMatch(fresh, [fresh, byEmail], [], [])).toMatchObject({ matchId: 'L2', level: 'strong', on: 'email' });
  });

  it('same first and last name with different phone and email is Possible', () => {
    const other = lead('L3', { firstName: 'John', lastName: 'Smith', phone: '469-555-0123', email: 'john@example.com' });
    expect(findMatch(fresh, [fresh, other], [], [])).toMatchObject({ matchId: 'L3', level: 'possible', on: 'name' });
  });

  it('prefers the phone match when one record shares the email and another the phone', () => {
    const byEmail = lead('L1', { email: 'js@example.com' });
    const byPhone = lead('L2', { phone: '2145550188' });
    expect(findMatch(fresh, [fresh, byEmail, byPhone], [], [])).toMatchObject({ matchId: 'L2', on: 'phone' });
  });

  it('prefers a Strong match and checks contacts with no lead', () => {
    const name = lead('L3', { firstName: 'John', lastName: 'Smith' });
    const contact = customer('C-9', { phone: '2145550188' });
    expect(findMatch(fresh, [fresh, name], [contact], [])).toMatchObject({ matchKind: 'contact', matchId: 'C-9', level: 'strong' });
  });

  it("skips the lead's own contact and pairs marked not a duplicate", () => {
    const own = customer('C-NEW', { phone: '2145550188' });
    expect(findMatch(fresh, [fresh], [own], [])).toBeUndefined();
    const other = lead('L3', { firstName: 'John', lastName: 'Smith' });
    expect(findMatch(fresh, [fresh, other], [], [{ a: 'L3', b: 'NEW' }])).toBeUndefined();
    expect(pairKey('NEW', 'L3')).toBe(pairKey('L3', 'NEW'));
  });
});
