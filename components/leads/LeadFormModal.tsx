'use client';

/*
  Add New Lead / Edit Lead modal, built to production
  (apps/main/src/features/(main)/leads/listings/modals/lead-form.tsx, see docs/BRANDING.md).

  Three flows, as in production:
  1. Fresh lead: type the person's details and the service address. A contact
     (type "Lead") is created and the lead links to it.
  2. Existing client + one of their saved locations: pick the location.
  3. Existing client + a new address: "Add New", then type the address. It is
     saved to the client's service locations too.

  Editing a lead that is linked to a contact shows the contact as a card; only
  the service address changes, exactly like production.

  Validation is production's leadFormSchema / existingCustomerLeadFormSchema.
*/
import React, { useEffect, useMemo, useState } from 'react';
import { Mail, MapPin, Phone, Plus, Search, UserCheck, X } from 'lucide-react';
import type { Customer, Lead, ServiceLocation } from '@/lib/types';
import { useCollection, useLogActivity, useNextNumber } from '@/lib/store';
import { Modal } from '@/components/Modals/Modal';
import { Button } from '@/components/ui/button';
import { Input, Label, Select } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { fullName, uid } from '@/lib/utils';
import { COMMON_SOURCES, EMAIL_RE, ZIP_RE, formatPhone, formatPhoneInput } from './leadHelpers';
import { useLeadActions } from './useLeadActions';

interface FormState {
  firstName: string; lastName: string; phone: string; email: string; companyName: string;
  secondaryPhone: string; secondaryEmail: string; securityCode: string; leadSource: string;
  street: string; city: string; state: string; zip: string;
}

const EMPTY: FormState = {
  firstName: '', lastName: '', phone: '', email: '', companyName: '', secondaryPhone: '', secondaryEmail: '',
  securityCode: '', leadSource: '', street: '', city: '', state: '', zip: '',
};

type Errors = Partial<Record<keyof FormState | 'serviceLocation', string>>;

const OTHER = 'OTHER_CUSTOM';
const PRIMARY = 'PRIMARY_ADDRESS';
const digitsOf = (v: string) => v.replace(/\D/g, '');

/** A client's saved addresses: the primary address, then its service locations. */
function locationsOf(c: Customer): { id: string; street: string; city: string; state: string; zip: string }[] {
  const out: { id: string; street: string; city: string; state: string; zip: string }[] = [];
  if (c.street) out.push({ id: PRIMARY, street: c.street, city: c.city, state: c.state, zip: c.zip });
  for (const l of c.serviceLocations ?? []) out.push({ id: l.id, street: l.street, city: l.city, state: l.state, zip: l.zip });
  return out;
}
const addressLabel = (l: { street: string; city: string; state: string; zip: string }) => `${l.street}, ${l.city}, ${l.state} ${l.zip}`;
const sameAddress = (a: { street: string; city: string; state: string; zip: string }, b: { street: string; city: string; state: string; zip: string }) =>
  a.street.trim().toLowerCase() === b.street.trim().toLowerCase() && a.zip.trim() === b.zip.trim();

/** Production leadFormSchema (fresh lead). */
function validateFresh(s: FormState): Errors {
  const e: Errors = {};
  if (!s.firstName.trim()) e.firstName = 'First name is required';
  if (!s.phone.trim()) e.phone = 'Phone is required';
  else if (!/^[\d\s\-()+]+$/.test(s.phone)) e.phone = 'Phone number must contain only digits';
  if (!EMAIL_RE.test(s.email.trim())) e.email = 'Invalid email address';
  if (s.secondaryEmail && !EMAIL_RE.test(s.secondaryEmail.trim())) e.secondaryEmail = 'Invalid email address';
  if (!s.leadSource.trim()) e.leadSource = 'Lead source is required';
  Object.assign(e, validateAddress(s));
  if (s.secondaryPhone && digitsOf(s.secondaryPhone) === digitsOf(s.phone)) e.secondaryPhone = 'Secondary phone must be different from primary phone';
  if (s.secondaryEmail && s.secondaryEmail.trim().toLowerCase() === s.email.trim().toLowerCase()) e.secondaryEmail = 'Secondary email must be different from primary email';
  return e;
}

/** Production existingCustomerLeadFormSchema (address only). */
function validateAddress(s: FormState): Errors {
  const e: Errors = {};
  if (!s.street.trim()) e.street = 'Street is required';
  if (!s.city.trim()) e.city = 'City is required';
  if (!s.state.trim()) e.state = 'State is required';
  else if (s.state.trim().length > 2) e.state = 'State must be 2 characters';
  if (!s.zip.trim()) e.zip = 'Zip is required';
  else if (!ZIP_RE.test(s.zip.trim())) e.zip = 'ZIP code must be in format 12345 or 12345-6789';
  return e;
}

export function LeadFormModal({
  open, onOpenChange, lead, onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pass a lead to edit it; leave empty to add a new one. */
  lead?: Lead | null;
  onSaved?: (lead: Lead) => void;
}) {
  const mode = lead ? 'edit' : 'add';
  const leads = useCollection('leads');
  const customers = useCollection('customers');
  const nextNumber = useNextNumber();
  const log = useLogActivity();
  const { toast } = useToast();
  const { sendStageMessages } = useLeadActions();

  const [s, setS] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [customSource, setCustomSource] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [showNewAddress, setShowNewAddress] = useState(false);
  const [picking, setPicking] = useState(false);

  const locations = useMemo(() => (selected ? locationsOf(selected) : []), [selected]);

  // Reset the form each time the modal opens; in edit mode, load the lead (and its contact).
  useEffect(() => {
    if (!open) return;
    setErrors({});
    setPicking(false);
    setShowNewAddress(false);
    if (!lead) {
      setS(EMPTY);
      setCustomSource(false);
      setSelected(null);
      setLocationId(null);
      return;
    }
    setS({
      firstName: lead.firstName, lastName: lead.lastName, phone: digitsOf(lead.phone), email: lead.email,
      companyName: lead.companyName ?? '', secondaryPhone: digitsOf(lead.secondaryPhone ?? ''), secondaryEmail: lead.secondaryEmail ?? '',
      securityCode: lead.securityCode ?? '', leadSource: lead.leadSource,
      street: lead.street, city: lead.city, state: lead.state, zip: lead.zip,
    });
    setCustomSource(!!lead.leadSource && !COMMON_SOURCES.includes(lead.leadSource) && lead.leadSource !== 'Existing Client');
    const c = lead.customerId ? customers.get(lead.customerId) ?? null : null;
    setSelected(c);
    setLocationId(c ? locationsOf(c).find((l) => sameAddress(l, lead))?.id ?? null : null);
  }, [open, lead, customers]);

  const set = (k: keyof FormState, v: string) => {
    setS((p) => ({ ...p, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const pickClient = (c: Customer) => {
    setSelected(c);
    setPicking(false);
    setCustomSource(false);
    setLocationId(null);
    setShowNewAddress(false);
    setErrors({});
    setS({
      ...EMPTY,
      firstName: c.firstName, lastName: c.lastName, phone: digitsOf(c.phone), email: c.email,
      secondaryPhone: digitsOf(c.secondaryPhone ?? ''), secondaryEmail: c.secondaryEmail ?? '', leadSource: 'Existing Client',
    });
  };

  const clearClient = () => {
    setSelected(null);
    setLocationId(null);
    setShowNewAddress(false);
    setS(EMPTY);
    setCustomSource(false);
    setErrors({});
  };

  const chooseLocation = (id: string) => {
    setLocationId(id);
    setShowNewAddress(false);
    const l = locations.find((x) => x.id === id);
    if (l) setS((p) => ({ ...p, street: l.street, city: l.city, state: l.state, zip: l.zip }));
    setErrors((e) => ({ ...e, street: undefined, city: undefined, state: undefined, zip: undefined, serviceLocation: undefined }));
  };

  const toggleNewAddress = () => {
    setShowNewAddress((v) => !v);
    if (!showNewAddress) {
      setLocationId(null);
      setS((p) => ({ ...p, street: '', city: '', state: '', zip: '' }));
    }
  };

  const submit = () => {
    const now = new Date().toISOString();
    let address: { street: string; city: string; state: string; zip: string };
    let customer: Customer;

    if (selected) {
      if (locationId) {
        const l = locations.find((x) => x.id === locationId)!;
        address = { street: l.street, city: l.city, state: l.state, zip: l.zip };
      } else if (showNewAddress) {
        const e = validateAddress(s);
        if (Object.keys(e).length) { setErrors(e); return; }
        address = { street: s.street.trim(), city: s.city.trim(), state: s.state.trim().toUpperCase(), zip: s.zip.trim() };
        // The new address joins the client's service locations (production creates it with the lead).
        const loc: ServiceLocation = { id: uid('loc'), ...address, createdAt: now };
        customers.update(selected.id, { serviceLocations: [...(selected.serviceLocations ?? []), loc] });
      } else {
        setErrors({ serviceLocation: 'Please select a service location' });
        return;
      }
      customer = selected;
    } else {
      const e = validateFresh(s);
      if (Object.keys(e).length) { setErrors(e); return; }
      address = { street: s.street.trim(), city: s.city.trim(), state: s.state.trim().toUpperCase(), zip: s.zip.trim() };
      const contact = {
        firstName: s.firstName.trim(), lastName: s.lastName.trim(), companyName: s.companyName.trim() || undefined,
        phone: formatPhone(digitsOf(s.phone)), email: s.email.trim(),
        secondaryPhone: s.secondaryPhone ? formatPhone(digitsOf(s.secondaryPhone)) : undefined,
        secondaryEmail: s.secondaryEmail.trim() || undefined,
      };
      if (lead) {
        // Edit of a lead with no linked contact: update the lead's own details.
        const patch: Partial<Lead> = { ...contact, ...address, securityCode: s.securityCode.trim() || undefined, leadSource: s.leadSource.trim(), updatedAt: now };
        leads.update(lead.id, patch);
        log(`Lead ${lead.leadNumber} updated`, 'lead', lead.id);
        toast('Lead updated successfully');
        onSaved?.({ ...lead, ...patch });
        onOpenChange(false);
        return;
      }
      customer = customers.add({ ...contact, ...address, type: 'Lead', source: s.leadSource.trim(), createdAt: now }, { atStart: true });
    }

    const contactFields = {
      firstName: customer.firstName, lastName: customer.lastName, companyName: customer.companyName,
      phone: customer.phone, email: customer.email, secondaryPhone: customer.secondaryPhone, secondaryEmail: customer.secondaryEmail,
    };

    if (lead) {
      const patch: Partial<Lead> = { ...contactFields, ...address, customerId: customer.id, updatedAt: now };
      leads.update(lead.id, patch);
      log(`Lead ${lead.leadNumber} updated`, 'lead', lead.id);
      toast('Lead updated successfully');
      onSaved?.({ ...lead, ...patch });
    } else {
      const leadNumber = nextNumber('LEAD');
      const created = leads.add(
        {
          id: leadNumber,
          leadNumber,
          ...contactFields,
          ...address,
          securityCode: s.securityCode.trim() || undefined,
          leadSource: selected ? 'Existing Client' : s.leadSource.trim(),
          serviceType: 'Interior',
          estimatedValue: 0,
          status: 'New', date: now, createdAt: now, updatedAt: now,
          customerId: customer.id,
          contactType: selected ? 'CONTACT' : 'LEAD',
          appointment: null,
        },
        { atStart: true },
      );
      log(`New lead ${created.leadNumber} added for ${fullName(created)}`, 'lead', created.id);
      toast('Lead created successfully');
      // The "New Leads" stage message (Settings > Automated Messages), once per lead.
      sendStageMessages(created, 'New');
      onSaved?.(created);
    }
    onOpenChange(false);
  };

  const sourceOptions = [
    ...COMMON_SOURCES.map((x) => ({ label: x, value: x })),
    { label: 'Existing Client', value: 'Existing Client' },
    { label: 'Other (Type...)', value: OTHER },
  ];
  const sourceValue = COMMON_SOURCES.includes(s.leadSource) || s.leadSource === 'Existing Client' ? s.leadSource : s.leadSource ? OTHER : '';

  const field = (k: keyof FormState, label: string, opts: { required?: boolean; placeholder: string; type?: string; phone?: boolean; maxLength?: number; upper?: boolean; id?: string } ) => (
    <div>
      <Label htmlFor={opts.id ?? k} required={opts.required}>{label}</Label>
      <Input
        id={opts.id ?? k}
        type={opts.type}
        value={opts.phone ? formatPhoneInput(s[k]) : s[k]}
        onChange={(e) => {
          const v = e.target.value;
          set(k, opts.phone ? digitsOf(v).slice(0, 10) : opts.upper ? v.toUpperCase() : v);
        }}
        placeholder={opts.placeholder}
        maxLength={opts.maxLength}
        inputMode={opts.phone ? 'tel' : undefined}
        invalid={!!errors[k]}
        onClear={() => set(k, '')}
      />
      {errors[k] && <p className="ml-3 mt-1 text-sm text-red-600">{errors[k]}</p>}
    </div>
  );

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="lg" title={mode === 'add' ? 'Add New Lead' : 'Edit Lead'}>
      <div className="flex flex-col gap-6">
        {/* Select Existing Client (add mode only) */}
        {mode === 'add' && !selected && (
          <button
            type="button"
            onClick={() => setPicking(true)}
            className="group flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-white py-3 font-bold text-gray-500 shadow-sm transition-all hover:border-primary-300 hover:bg-primary-50 hover:text-primary-600"
          >
            <Search className="h-4 w-4 text-gray-400 group-hover:text-primary-500" />
            Select Existing Client
          </button>
        )}

        {/* Selected client card */}
        {selected && (
          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-primary-100 bg-primary-50 px-4 py-2.5">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-primary-600" />
                <span className="text-sm font-bold text-primary-700">Existing Client</span>
              </div>
              {mode === 'add' && (
                <button type="button" onClick={clearClient} title="Clear selection" aria-label="Clear selection" className="cursor-pointer rounded-lg p-1 text-primary-500 transition-colors hover:bg-primary-100">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-100 text-lg font-bold text-primary-700">
                  {selected.firstName.charAt(0)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-gray-900">{selected.firstName} {selected.lastName}</p>
                  <span className="text-xs text-gray-400">Lead Source: Existing Client</span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <div className="flex items-center gap-1.5 text-sm text-gray-600">
                    <Phone className="h-3.5 w-3.5 text-gray-400" />
                    <span>{selected.phone ? formatPhone(selected.phone) : '-'}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-gray-600">
                    <Mail className="h-3.5 w-3.5 text-gray-400" />
                    <span className="max-w-45 truncate">{selected.email || '-'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Name, contact and lead source (only when no existing client) */}
        {!selected && (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {field('firstName', 'First Name', { required: true, placeholder: 'Jane' })}
              {field('lastName', 'Last Name', { placeholder: 'Doe' })}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {field('phone', 'Phone', { required: true, placeholder: '(555) 123-4567', phone: true })}
              {field('email', 'Email', { required: true, placeholder: 'jane@example.com', type: 'email' })}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {field('secondaryPhone', 'Secondary Phone', { placeholder: '(555) 987-6543', phone: true })}
              {field('secondaryEmail', 'Secondary Email', { placeholder: 'john.alt@example.com', type: 'email' })}
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {field('securityCode', 'Security Code', { placeholder: '1234#' })}
              <div>
                <Label required>Lead Source</Label>
                {customSource ? (
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Input autoFocus value={s.leadSource} onChange={(e) => set('leadSource', e.target.value)} placeholder="Type source (e.g. Billboard)..." invalid={!!errors.leadSource} />
                    </div>
                    <button
                      type="button"
                      onClick={() => { setCustomSource(false); set('leadSource', ''); }}
                      title="Cancel custom input"
                      aria-label="Cancel custom input"
                      className="cursor-pointer rounded-xl bg-gray-100 px-3 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                ) : (
                  <Select
                    ariaLabel="Lead Source"
                    value={sourceValue}
                    onChange={(v) => {
                      if (v === OTHER) { setCustomSource(true); set('leadSource', ''); } else set('leadSource', v);
                    }}
                    options={sourceOptions}
                    placeholder="Select Source..."
                    invalid={!!errors.leadSource}
                  />
                )}
                {errors.leadSource && <p className="ml-3 mt-1 text-sm text-red-600">{errors.leadSource}</p>}
              </div>
            </div>
            {field('companyName', 'Company Name', { placeholder: 'Acme Painting Co.' })}
          </>
        )}

        {/* Service address */}
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-widest text-gray-500">SERVICE ADDRESS</h3>
            {selected && (
              <button type="button" onClick={toggleNewAddress} className="flex cursor-pointer items-center gap-1 text-xs font-semibold text-primary-600 transition-colors hover:text-primary-700">
                {showNewAddress ? <><X className="h-3.5 w-3.5" /> Cancel</> : <><Plus className="h-3.5 w-3.5" /> Add New</>}
              </button>
            )}
          </div>
          <div className="space-y-4">
            {selected && locations.length > 0 && !showNewAddress && (
              <div>
                <Label required>Select Existing Location</Label>
                <Select
                  ariaLabel="Select Existing Location"
                  value={locationId ?? ''}
                  onChange={chooseLocation}
                  options={locations.map((l) => ({ label: addressLabel(l), value: l.id }))}
                  placeholder="Select a location..."
                  invalid={!!errors.serviceLocation}
                  icon={<MapPin className="h-4 w-4 text-gray-400" />}
                />
                {errors.serviceLocation && <p className="ml-3 mt-1 text-sm text-red-600">{errors.serviceLocation}</p>}
              </div>
            )}

            {(!selected || showNewAddress) && (
              <>
                {field('street', 'Street Address', { required: true, placeholder: '123 Main St' })}
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  {field('city', 'City', { required: true, placeholder: 'City' })}
                  {field('state', 'State', { required: true, placeholder: 'ST', maxLength: 2, upper: true, id: 'leadState' })}
                  {field('zip', 'Zip', { required: true, placeholder: '12345' })}
                </div>
              </>
            )}

            {selected && !locationId && !showNewAddress && locations.length === 0 && (
              <p className="py-2 text-center text-sm text-gray-400">No existing locations. Click &quot;Add New&quot; to enter an address.</p>
            )}
          </div>
        </div>

        {/* Footer buttons */}
        <div className="grid grid-cols-2 gap-3 pt-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit}>{mode === 'add' ? 'Create Lead' : 'Save Changes'}</Button>
        </div>
      </div>

      <ClientPicker open={picking} onOpenChange={setPicking} customers={customers.items} onSelect={pickClient} />
    </Modal>
  );
}

/** "Select Client" search list (production: modals/contact-selection.tsx). */
function ClientPicker({
  open, onOpenChange, customers, onSelect,
}: { open: boolean; onOpenChange: (o: boolean) => void; customers: Customer[]; onSelect: (c: Customer) => void }) {
  const [q, setQ] = useState('');
  useEffect(() => { if (open) setQ(''); }, [open]);
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    const digits = t.replace(/\D/g, '');
    return customers.filter((c) =>
      !t ||
      `${c.firstName} ${c.lastName}`.toLowerCase().includes(t) ||
      c.email.toLowerCase().includes(t) ||
      (digits.length > 0 && c.phone.replace(/\D/g, '').includes(digits)),
    );
  }, [customers, q]);

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Select Client" size="lg">
      <div className="flex flex-col gap-4">
        <Input autoFocus leftIcon={<Search className="h-4 w-4" />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, email, or phone..." />
        <div className="max-h-[55vh] space-y-3 overflow-y-auto">
          {list.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-500">{q ? `No clients found matching "${q}".` : 'No clients found.'}</p>
          ) : (
            list.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onSelect(c)}
                className="group block w-full rounded-xl border border-gray-200 bg-white p-4 text-left transition-all hover:border-primary-400 hover:shadow-md"
              >
                <div className="mb-2 flex items-center gap-2">
                  <h4 className="text-lg font-bold text-gray-900 group-hover:text-primary-700">{c.firstName} {c.lastName}</h4>
                  <span className="rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-xxs font-bold uppercase text-blue-700">{c.type}</span>
                </div>
                <div className="space-y-1.5 text-sm text-gray-600">
                  <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5 shrink-0 text-gray-400" /><span className="truncate">{c.street}, {c.city}, {c.state} {c.zip}</span></div>
                  <div className="flex flex-wrap justify-between gap-4">
                    <span className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-gray-400" />{c.email}</span>
                    <span className="flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-gray-400" />{formatPhone(c.phone)}</span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </Modal>
  );
}
