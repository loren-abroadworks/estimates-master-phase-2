/*
  Admin Portal sample data. Names, ages and counts follow the live Admin
  Portal captured on 16 Oct 2026 (spec: "EMTS Admin Dashboard"). Technologia
  is the organization using this replica: its plan and payments come from
  Settings › Subscription, so only its rep and start date are stored here.
*/
import type {
  PlatformEvent, PlatformLead, PlatformMessage, PlatformPayment, PlatformSettings, PlatformStaff, PlatformSubscriber, PlatformTask,
} from '../types';

/** The day the sample was captured; ages ("29d") are counted back from it. */
const SEED_DAY = new Date('2026-10-16T12:00:00');
const daysBefore = (n: number, time = '12:00') => {
  const d = new Date(SEED_DAY);
  d.setDate(d.getDate() - n);
  const [h, m] = time.split(':').map(Number);
  d.setHours(h!, m!, 0, 0);
  return d.toISOString();
};

export const platformStaff: PlatformStaff[] = [
  { id: 'ps_surajit', name: 'Surajit Biswas', email: 'surajit@estimate-master.com', color: '#7A5FFF', commissionRate: 0 },
  { id: 'ps_abhay', name: 'Abhay Singh', email: 'abhay@estimate-master.com', color: '#0EA5E9', commissionRate: 0.1 },
  { id: 'ps_kevin', name: 'Kevin Soriano', email: 'kevin@estimate-master.com', color: '#2563EB', commissionRate: 0 },
  { id: 'ps_tim', name: 'Tim S', email: 'tim@estimate-master.com', color: '#F59E0B', commissionRate: 0 },
  { id: 'ps_rep', name: 'Sales Rep', email: 'sales@estimate-master.com', color: '#14B8A6', commissionRate: 0.1 },
];

export const platformSubscribers: PlatformSubscriber[] = [
  // Live from Settings › Subscription (Growth, monthly, Active in the sample).
  { id: 'psub_technologia', company: 'Technologia', contactName: 'Kevin Soriano', email: 'kevin@estimatemaster.example', tier: 'Growth', billing: 'monthly', status: 'Active', price: 129, startedAt: '2026-04-23', repId: 'ps_kevin', linked: true },
  { id: 'psub_masters', company: "Master's Touch Painting", contactName: 'Dale Hughes', email: 'dale@masterstouch.example', tier: 'Enterprise', billing: 'annual', status: 'Active', price: 4990, startedAt: '2026-02-10', presentationAt: '2026-02-03', repId: 'ps_tim' },
  { id: 'psub_emdemo', company: 'Estimate Master Demo', contactName: 'Demo Account', email: 'demo@estimate-master.com', tier: 'Enterprise', billing: 'monthly', status: 'Active', price: 499, startedAt: '2026-01-12', repId: 'ps_surajit' },
  { id: 'psub_demovcs', company: 'Demo VCS', contactName: 'Victor Castro', email: 'victor@demovcs.example', tier: 'Growth', billing: 'annual', status: 'Active', price: 1290, startedAt: '2026-03-03', presentationAt: '2026-02-24', repId: 'ps_abhay' },
  { id: 'psub_brightline', company: 'Brightline Painters', contactName: 'Hannah Ortiz', email: 'hannah@brightline.example', tier: 'Growth', billing: 'annual', status: 'Active', price: 1290, startedAt: '2026-06-18', presentationAt: '2026-06-11', repId: 'ps_rep' },
  { id: 'psub_coastal', company: 'Coastal Coatings', contactName: 'Ray Fulton', email: 'ray@coastalcoatings.example', tier: 'Starter', billing: 'monthly', status: 'Active', price: 79, startedAt: '2026-07-07', presentationAt: '2026-07-01', repId: 'ps_rep' },
  { id: 'psub_advance', company: 'advance paints', contactName: 'Amit Verma', email: 'amit@advancepaints.example', tier: 'Growth', billing: 'monthly', status: 'Trial', price: 129, startedAt: '2026-09-17', trialStartedAt: '2026-09-17', presentationAt: '2026-09-16', repId: 'ps_rep' },
  { id: 'psub_summit', company: 'Summit Finishes', contactName: 'Laura Kim', email: 'laura@summitfinishes.example', tier: 'Growth', billing: 'monthly', status: 'Cancelled', price: 129, startedAt: '2026-02-02', cancelledAt: '2026-06-30', repId: 'ps_abhay' },
  { id: 'psub_precision', company: 'Precision Pro Painting', contactName: 'Omar Haddad', email: 'omar@precisionpro.example', tier: 'Starter', billing: 'monthly', status: 'Cancelled', price: 79, startedAt: '2026-03-15', cancelledAt: '2026-08-01', repId: 'ps_tim' },
  { id: 'psub_ridgeview', company: 'Ridgeview Decor', contactName: 'Paula Stone', email: 'paula@ridgeview.example', tier: 'Growth', billing: 'monthly', status: 'Cancelled', price: 129, startedAt: '2025-11-03', cancelledAt: '2026-03-01', repId: 'ps_surajit' },
];

/** Renewals up to the sample day: monthly plans each month, annual plans once. Technologia's come from its billing history. */
function renewals(): PlatformPayment[] {
  const out: PlatformPayment[] = [];
  for (const s of platformSubscribers) {
    if (s.linked || s.status === 'Trial') continue;
    const end = s.cancelledAt ? new Date(s.cancelledAt + 'T12:00:00') : SEED_DAY;
    const d = new Date(s.startedAt + 'T12:00:00');
    let n = 0;
    while (d <= end) {
      const date = d.toISOString().slice(0, 10);
      out.push({ id: `pp_${s.id.slice(5)}_${n}`, subscriberId: s.id, date, amount: s.price, description: `${s.tier.toUpperCase()} Plan — ${s.billing === 'annual' ? 'Annual' : n ? 'Monthly renewal' : 'First month'}` });
      if (s.billing === 'annual') break;
      d.setMonth(d.getMonth() + 1);
      n++;
    }
  }
  return out;
}

export const platformPayments: PlatformPayment[] = [
  ...renewals(),
  { id: 'pp_masters_setup', subscriberId: 'psub_masters', date: '2026-10-05', amount: 499, description: 'Master Acceleration Setup (Lifetime)' },
];

export const platformLeads: PlatformLead[] = [
  { id: 'pl_advance', company: 'advance paints', contactName: 'Amit Verma', email: 'amit@advancepaints.example', phone: '(469) 555-0142', stage: 'Pending', createdAt: '2026-09-08', presentationAt: '2026-09-16T15:00:00', repId: 'ps_rep', notes: 'On a Growth trial. Wants QuickBooks sync before deciding.', subscriberId: 'psub_advance' },
  { id: 'pl_lonestar', company: 'Lone Star Coatings', contactName: 'Jake Morrow', email: 'jake@lonestarcoatings.example', phone: '(214) 555-0119', stage: 'Presentation', createdAt: '2026-10-01', presentationAt: '2026-10-21T14:00:00', repId: 'ps_tim' },
  { id: 'pl_hue', company: 'Hue & Co Painting', contactName: 'Sara Lin', email: 'sara@hueandco.example', stage: 'New', createdAt: '2026-10-09', repId: 'ps_abhay', notes: 'Came in from the pricing page.' },
  { id: 'pl_brightline', company: 'Brightline Painters', contactName: 'Hannah Ortiz', email: 'hannah@brightline.example', stage: 'Won', createdAt: '2026-06-02', presentationAt: '2026-06-11T13:00:00', repId: 'ps_rep', subscriberId: 'psub_brightline' },
  { id: 'pl_coastal', company: 'Coastal Coatings', contactName: 'Ray Fulton', email: 'ray@coastalcoatings.example', stage: 'Won', createdAt: '2026-06-24', presentationAt: '2026-07-01T10:00:00', repId: 'ps_rep', subscriberId: 'psub_coastal' },
  { id: 'pl_metro', company: 'Metro Painting Co', contactName: 'Dev Patel', email: 'dev@metropainting.example', stage: 'Lost', createdAt: '2026-08-20', presentationAt: '2026-08-27T16:00:00', repId: 'ps_abhay', notes: 'Chose a cheaper tool.' },
];

export const platformTasks: PlatformTask[] = [
  { id: 'pt_coupons', title: 'Coupons need to work', done: false, assigneeId: 'ps_surajit', createdAt: daysBefore(12) },
  { id: 'pt_onboard', title: 'Send the onboarding pack to Brightline Painters', done: true, assigneeId: 'ps_rep', createdAt: daysBefore(40), doneAt: daysBefore(38) },
];

const SUPPORT = 'You have received a new support request via the app. ';

export const platformMessages: PlatformMessage[] = [
  { id: 'pm_1', org: 'Estimate Master Demo', from: 'Demo Account', at: daysBefore(29, '09:14'), direction: 'in', read: true, source: 'support-form', body: `${SUPPORT}Subject: Estimate PDF logo\nThe logo on the estimate PDF looks stretched on phones.` },
  { id: 'pm_2', org: 'Technologia', from: 'Kevin Soriano', at: daysBefore(63, '15:40'), direction: 'in', read: true, source: 'support-form', body: `${SUPPORT}Subject: Crew schedule\nCan crew leads see next week's schedule before it is published?` },
  { id: 'pm_3', org: 'Technologia', from: 'Kevin Soriano', at: daysBefore(139, '11:02'), direction: 'in', read: true, source: 'email', body: 'receive it' },
  { id: 'pm_4', org: 'Demo VCS', from: 'Victor Castro', at: daysBefore(140, '16:25'), direction: 'in', read: true, source: 'support-form', body: `${SUPPORT}Subject: Invoice numbering\nOur invoice numbers restarted at 1 after the update.` },
  { id: 'pm_5', org: "Master's Touch Painting", from: 'Dale Hughes', at: daysBefore(140, '10:08'), direction: 'in', read: true, source: 'support-form', body: `${SUPPORT}Subject: Paint library\nPlease add the Sherwin-Williams Emerald line to our library.` },
  { id: 'pm_6', org: 'abhay singh', from: 'abhay singh', at: daysBefore(146, '13:30'), direction: 'in', read: true, source: 'email', body: 'test support email' },
  { id: 'pm_7', org: 'Technologia', from: 'Kevin Soriano', at: daysBefore(153, '08:47'), direction: 'in', read: true, source: 'email', body: 'test On Sat, 16 May 2026, Estimate Master Support wrote: Thanks for reaching out.' },
  { id: 'pm_8', org: "Master's Touch Painting", from: 'Tim S', at: daysBefore(177, '14:15'), direction: 'out', read: true, source: 'email', body: 'Are things working well?' },
];

export const platformEvents: PlatformEvent[] = [
  { id: 'pe_1', title: 'Onboarding call', start: '2026-10-16T10:00:00', kind: 'Onboarding', repId: 'ps_rep', org: 'Brightline Painters' },
  { id: 'pe_2', title: 'Trial check-in', start: '2026-10-17T11:00:00', kind: 'Follow-up', repId: 'ps_rep', org: 'advance paints' },
  { id: 'pe_3', title: 'Intro call', start: '2026-10-20T09:30:00', kind: 'Call', repId: 'ps_abhay', org: 'Hue & Co Painting' },
];

export const platformSettings: PlatformSettings = {
  yearlySalesGoal: 67000,
  // Not set yet on the live portal ("/ $0").
  monthlyRevenueTarget: 0,
  layouts: {},
};
