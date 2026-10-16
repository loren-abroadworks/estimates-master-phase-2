/*
  Admin Portal (/platform) records: Estimate Master's own sales pipeline,
  subscribers, payments, support inbox, tasks and calendar, across every
  contractor organization. Spec: "EMTS Admin Dashboard — UI & Functionality
  Spec" (16 Oct 2026). The dashboard is computed from these in lib/platform.ts.
*/
import type { ID } from './core';

export type PlatformTier = 'Starter' | 'Growth' | 'Enterprise';
export type PlatformBilling = 'monthly' | 'annual';
export type PlatformSubStatus = 'Active' | 'Trial' | 'Pending' | 'Cancelled';

export interface PlatformSubscriber {
  id: ID;
  company: string;
  contactName: string;
  email: string;
  tier: PlatformTier;
  billing: PlatformBilling;
  status: PlatformSubStatus;
  /** Price per billing period. */
  price: number;
  /** Day the account was opened (YYYY-MM-DD). */
  startedAt: string;
  trialStartedAt?: string;
  /** Day of the sales presentation (YYYY-MM-DD). */
  presentationAt?: string;
  cancelledAt?: string;
  /** Platform staff member credited with the sale. */
  repId: ID;
  /**
   * The organization using this replica: tier, billing, status, price and
   * payments come live from its Settings › Subscription (lib/platform.ts).
   */
  linked?: boolean;
}

export interface PlatformPayment {
  id: ID;
  subscriberId: ID;
  date: string;
  /** Negative for a refund. */
  amount: number;
  description: string;
}

export type PlatformLeadStage = 'New' | 'Presentation' | 'Pending' | 'Won' | 'Lost';

export interface PlatformLead {
  id: ID;
  company: string;
  contactName: string;
  email: string;
  phone?: string;
  stage: PlatformLeadStage;
  createdAt: string;
  /** Presentation date and time (ISO). */
  presentationAt?: string;
  repId: ID;
  notes?: string;
  /** Set when the lead became a subscriber. */
  subscriberId?: ID;
}

export interface PlatformTask {
  id: ID;
  title: string;
  done: boolean;
  dueDate?: string;
  assigneeId?: ID;
  createdAt: string;
  doneAt?: string;
}

export interface PlatformMessage {
  id: ID;
  /** Organization the conversation is with. */
  org: string;
  /** Who wrote it: a customer's name, or the staff member replying. */
  from: string;
  body: string;
  at: string;
  direction: 'in' | 'out';
  read: boolean;
  /** "support-form": sent from Help & Support inside the app. */
  source?: 'support-form' | 'email';
}

export type PlatformEventKind = 'Follow-up' | 'Onboarding' | 'Call' | 'Demo';

export interface PlatformEvent {
  id: ID;
  title: string;
  /** Start date and time (ISO). */
  start: string;
  kind: PlatformEventKind;
  repId: ID;
  org?: string;
}

export interface PlatformStaff {
  id: ID;
  name: string;
  email: string;
  color: string;
  /** Share of each payment from this rep's subscribers (0.1 = 10%). */
  commissionRate: number;
}

export type PlatformWidgetKey =
  | 'presentations' | 'actions' | 'messages' | 'calendar' | 'subscribers' | 'pending' | 'yearly' | 'monthly' | 'commission';

export interface PlatformLayout {
  order: PlatformWidgetKey[];
  /** Widgets shown at double width. */
  wide: PlatformWidgetKey[];
}

export interface PlatformSettings {
  yearlySalesGoal: number;
  monthlyRevenueTarget: number;
  /** Customize: each admin's own widget order and sizes, by user id. */
  layouts: Record<ID, PlatformLayout>;
}
