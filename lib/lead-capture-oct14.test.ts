import { describe, expect, it } from 'vitest';
import type { Customer, Lead } from './types';
import { EMPTY_FORM_LEAD, checkFormSubmission, customerCode, findByCustomerCode, isOnFile } from './lead-capture';

/* Oct 14 call, CRM Part 1: duplicates are rejected; existing customers use their Customer ID. */

const lead = (x: Partial<Lead>): Lead => ({
  id: 'L1', leadNumber: 'L1', firstName: 'Ann', lastName: 'Lee', phone: '', email: '', street: '', city: '', state: '', zip: '', leadSource: 'Website',
  serviceType: 'Interior', status: 'New', estimatedValue: 0, date: '2026-10-01', createdAt: '2026-10-01', updatedAt: '2026-10-01', contactType: 'LEAD', ...x,
});
const customer = (x: Partial<Customer>): Customer => ({
  id: 'c1', firstName: 'Cal', lastName: 'Ray', email: '', phone: '', street: '', city: '', state: '', zip: '', type: 'Client', source: 'Referral', createdAt: '2026-01-01', ...x,
});
const form = (x: Partial<typeof EMPTY_FORM_LEAD>) => ({ ...EMPTY_FORM_LEAD, firstName: 'Ann', ...x });

describe('form duplicates and Customer ID', () => {
  it('Customer ID is stable, CUST- plus six characters, and found case-insensitively without the prefix', () => {
    const c = customer({ id: 'c42' });
    const code = customerCode(c);
    expect(code).toMatch(/^CUST-[0-9A-Z]{6}$/);
    expect(customerCode({ id: 'c42' })).toBe(code);
    expect(customerCode({ id: 'c43' })).not.toBe(code);
    expect(findByCustomerCode(code.toLowerCase(), [c])).toBe(c);
    expect(findByCustomerCode(code.slice(5), [c])).toBe(c);
  });

  it('an email or phone on a lead or contact is on file; same name with different details is not', () => {
    const leads = [lead({ email: 'Ann@Example.com', phone: '(214) 555-0101' })];
    const customers = [customer({ secondaryPhone: '972-555-0199' })];
    expect(isOnFile({ email: ' ann@example.com', phone: '' }, leads, customers)).toBe(true);
    expect(isOnFile({ email: '', phone: '2145550101' }, leads, customers)).toBe(true);
    expect(isOnFile({ email: '', phone: '(972) 555-0199' }, leads, customers)).toBe(true);
    expect(isOnFile({ email: 'new@example.com', phone: '2145550000' }, leads, customers)).toBe(false);
  });

  it('rejects a duplicate, lets a valid Customer ID through, and rejects an unknown ID', () => {
    const c = customer({ id: 'c7', email: 'cal@example.com' });
    expect(checkFormSubmission(form({ email: 'cal@example.com' }), [], [c])).toEqual({ ok: false, reason: 'duplicate' });
    expect(checkFormSubmission(form({ email: 'cal@example.com', customerCode: customerCode(c) }), [], [c])).toEqual({ ok: true, customer: c });
    expect(checkFormSubmission(form({ email: 'cal@example.com', customerCode: 'CUST-ZZZZZZ' }), [], [c])).toEqual({ ok: false, reason: 'unknownId' });
    expect(checkFormSubmission(form({ email: 'someone@new.com' }), [], [c])).toEqual({ ok: true });
  });
});
