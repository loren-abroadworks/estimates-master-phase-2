/*
  The builder's "Add trigger" and "Add action" panels (Figma: EMTS
  Automation (Workflows), 8 Oct 2026). Each item is a preset over the
  registry: a registry trigger or step type with some settings already
  chosen. Items the backend can't support yet are listed but locked, with
  the reason, so the design and the build stay in step.

  The Figma notes say these lists are a proposal to confirm with the
  developers.
*/
import type { AutomationCondition, AutomationModule } from './types';

export interface TriggerPreset {
  id: string;
  group: string;
  label: string;
  description: string;
  icon: string;
  /** Registry trigger type. Missing = locked. */
  type?: string;
  module: AutomationModule;
  config?: Record<string, unknown>;
  /** Filters the preset adds (e.g. website leads only). */
  conditions?: Omit<AutomationCondition, 'id'>[];
  locked?: string;
}

export interface ActionPreset {
  id: string;
  group: string;
  label: string;
  description: string;
  icon: string;
  /** Registry step type. Missing = locked. */
  type?: string;
  config?: Record<string, unknown>;
  locked?: string;
}

const NO_TAGS = 'Leads have no tags in EMTS yet. Needs the backend.';

export const TRIGGER_GROUPS = ['Leads', 'Estimates', 'Jobs & work orders', 'Invoices & payments', 'Appointments', 'Customers', 'Forms & events'];

export const TRIGGER_PRESETS: TriggerPreset[] = [
  { id: 'lead_created', group: 'Leads', label: 'Lead created', description: 'A new lead is added to EMTS', icon: 'UserPlus', type: 'RECORD_CREATED', module: 'LEAD' },
  { id: 'lead_status', group: 'Leads', label: 'Lead status changed', description: 'A lead moves to a status', icon: 'Repeat', type: 'STAGE_ENTERED', module: 'LEAD', config: { stage: 'CONTACTED' } },
  { id: 'lead_stage', group: 'Leads', label: 'Pipeline stage changed', description: 'A lead reaches a pipeline stage', icon: 'Kanban', type: 'STAGE_ENTERED', module: 'LEAD', config: { stage: 'SCHEDULED' } },
  { id: 'lead_tag', group: 'Leads', label: 'Lead tag added', description: 'A tag is added to a lead', icon: 'Tag', module: 'LEAD', locked: NO_TAGS },
  { id: 'lead_assigned', group: 'Leads', label: 'Lead assigned to user', description: 'The lead owner changes', icon: 'UserCheck', type: 'FIELD_CHANGED', module: 'LEAD', config: { field: 'assignedUserId' } },
  { id: 'lead_stale', group: 'Leads', label: 'Stale lead (no activity)', description: 'A lead sits in a status for a set time', icon: 'Clock', type: 'STAGE_DURATION', module: 'LEAD', config: { stage: 'CONTACTED', days: 3 } },

  { id: 'est_created', group: 'Estimates', label: 'Estimate created', description: 'A draft estimate is made', icon: 'FileText', type: 'RECORD_CREATED', module: 'ESTIMATE' },
  { id: 'est_ready', group: 'Estimates', label: 'Estimate marked ready', description: 'The estimator marks it ready to send', icon: 'FileCheck', type: 'ESTIMATE_READY', module: 'ESTIMATE' },
  { id: 'est_sent', group: 'Estimates', label: 'Estimate sent', description: 'The estimate goes to the customer', icon: 'Send', type: 'STAGE_ENTERED', module: 'ESTIMATE', config: { stage: 'SENT' } },
  { id: 'est_viewed', group: 'Estimates', label: 'Estimate viewed by customer', description: 'The customer opens the estimate link', icon: 'Monitor', type: 'ESTIMATE_VIEWED', module: 'ESTIMATE' },
  { id: 'est_signed', group: 'Estimates', label: 'Estimate accepted / signed', description: 'The customer signs the estimate', icon: 'SquareCheck', type: 'ESTIMATE_SIGNED', module: 'ESTIMATE' },
  { id: 'est_declined', group: 'Estimates', label: 'Estimate declined', description: 'The customer declines', icon: 'X', type: 'STAGE_ENTERED', module: 'ESTIMATE', config: { stage: 'DECLINED' } },
  { id: 'est_expiring', group: 'Estimates', label: 'Estimate expiring soon', description: 'Days before the estimate expires', icon: 'Clock', type: 'DATE_RELATIVE', module: 'ESTIMATE', config: { dateField: 'validUntil', direction: 'BEFORE', amount: 3, unit: 'DAYS' } },
  { id: 'est_amended', group: 'Estimates', label: 'Estimate amended', description: 'A signed estimate is amended', icon: 'Pencil', type: 'STAGE_ENTERED', module: 'ESTIMATE', config: { stage: 'AMENDED_DRAFT' } },
  { id: 'est_unsigned', group: 'Estimates', label: 'Estimate not signed', description: 'Sent and not signed for a set time', icon: 'Hourglass', type: 'STAGE_DURATION', module: 'ESTIMATE', config: { stage: 'SENT', days: 3 } },

  { id: 'job_status', group: 'Jobs & work orders', label: 'Job status changed', description: 'A job moves to a stage', icon: 'Briefcase', type: 'STAGE_ENTERED', module: 'JOB', config: { stage: 'SCHEDULED' } },
  { id: 'job_completed', group: 'Jobs & work orders', label: 'Job completed', description: 'The closeout finishes the job', icon: 'BadgeCheck', type: 'STAGE_ENTERED', module: 'JOB', config: { stage: 'COMPLETED' } },
  { id: 'job_start', group: 'Jobs & work orders', label: 'Job start date coming up', description: 'Days before the scheduled start', icon: 'CalendarClock', type: 'DATE_RELATIVE', module: 'JOB', config: { dateField: 'startDate', direction: 'BEFORE', amount: 2, unit: 'DAYS' } },
  { id: 'wo_status', group: 'Jobs & work orders', label: 'Work order status changed', description: 'A work order moves to a status', icon: 'ClipboardList', type: 'STAGE_ENTERED', module: 'WORK_ORDER', config: { stage: 'UNSCHEDULED' } },
  { id: 'wo_start', group: 'Jobs & work orders', label: 'Work order start day', description: 'On the work order start date', icon: 'Play', type: 'DATE_RELATIVE', module: 'WORK_ORDER', config: { dateField: 'startDate', direction: 'BEFORE', amount: 0, unit: 'DAYS' } },
  { id: 'job_stuck', group: 'Jobs & work orders', label: 'Job stuck in a stage', description: 'A job sits in a stage for a set time', icon: 'Clock', type: 'STAGE_DURATION', module: 'JOB', config: { stage: 'READY_FOR_INSPECTION', days: 2 } },
  { id: 'touch_up', group: 'Jobs & work orders', label: 'Touch-up request submitted', description: 'A customer asks for a touch-up', icon: 'Paintbrush', type: 'TOUCH_UP_SUBMITTED', module: 'JOB' },
  { id: 'crew_event', group: 'Jobs & work orders', label: 'Crew marks an event', description: 'Weather confirmed, weather delay, touch-up visit', icon: 'HardHat', type: 'PENDING_EVENT', module: 'JOB', config: { event: 'WEATHER_DELAY' } },

  { id: 'inv_created', group: 'Invoices & payments', label: 'Invoice created', description: 'A new invoice is made', icon: 'FilePlus', type: 'RECORD_CREATED', module: 'INVOICE' },
  { id: 'inv_sent', group: 'Invoices & payments', label: 'Invoice sent', description: 'The invoice goes to the customer', icon: 'Send', type: 'STAGE_ENTERED', module: 'INVOICE', config: { stage: 'SENT' } },
  { id: 'inv_overdue', group: 'Invoices & payments', label: 'Invoice overdue', description: 'The due date passes unpaid', icon: 'AlertTriangle', type: 'STAGE_ENTERED', module: 'INVOICE', config: { stage: 'OVERDUE' } },
  { id: 'inv_due', group: 'Invoices & payments', label: 'Invoice due date', description: 'Days before or after the due date', icon: 'CalendarClock', type: 'DATE_RELATIVE', module: 'INVOICE', config: { dateField: 'dueDate', direction: 'AFTER', amount: 1, unit: 'DAYS' } },
  { id: 'pay_any', group: 'Invoices & payments', label: 'Payment received', description: 'Any payment is recorded', icon: 'DollarSign', type: 'PAYMENT_RECORDED', module: 'INVOICE', config: { which: 'ANY' } },
  { id: 'pay_deposit', group: 'Invoices & payments', label: 'Deposit paid', description: 'The deposit is paid in full', icon: 'BadgeDollarSign', type: 'PAYMENT_RECORDED', module: 'INVOICE', config: { which: 'DEPOSIT' } },
  { id: 'pay_full', group: 'Invoices & payments', label: 'Invoice paid in full', description: 'Nothing is left to pay', icon: 'CircleCheck', type: 'PAYMENT_RECORDED', module: 'INVOICE', config: { which: 'FULL' } },

  { id: 'appt_booked', group: 'Appointments', label: 'Appointment booked', description: 'An estimate appointment is booked', icon: 'CalendarPlus', type: 'APPOINTMENT_BOOKED', module: 'CALENDAR', config: { change: 'BOOKED' } },
  { id: 'appt_changed', group: 'Appointments', label: 'Appointment rescheduled', description: 'The appointment date changes', icon: 'CalendarSync', type: 'APPOINTMENT_BOOKED', module: 'CALENDAR', config: { change: 'CHANGED' } },
  { id: 'appt_soon', group: 'Appointments', label: 'Appointment coming up', description: 'Hours or days before the appointment', icon: 'AlarmClock', type: 'DATE_RELATIVE', module: 'LEAD', config: { dateField: 'appointmentAt', direction: 'BEFORE', amount: 24, unit: 'HOURS' } },

  { id: 'repaint_due', group: 'Customers', label: 'Repaint interval due', description: 'Years after the job was completed', icon: 'PaintRoller', type: 'TIME_SINCE_COMPLETION', module: 'JOB', config: { months: 36 } },
  { id: 'returning', group: 'Customers', label: 'Returning customer lead', description: 'A lead from a customer you have worked for', icon: 'UserRoundCheck', type: 'RECORD_CREATED', module: 'LEAD', conditions: [{ field: 'customer.returning', operator: 'IS', value: 'true' }] },

  { id: 'website_form', group: 'Forms & events', label: 'Website form submitted', description: 'A lead comes in from the website form', icon: 'Globe', type: 'RECORD_CREATED', module: 'LEAD', conditions: [{ field: 'lead.source', operator: 'IS', value: 'website' }] },
  { id: 'field_changed', group: 'Forms & events', label: 'Field changed', description: 'A watched field changes on a record', icon: 'PenLine', type: 'FIELD_CHANGED', module: 'JOB', config: { field: 'startDate' } },
];

export const ACTION_GROUPS = ['Communication', 'Leads & pipeline', 'Estimates & jobs', 'Invoices & payments', 'Flow control', 'Advanced'];

export const ACTION_PRESETS: ActionPreset[] = [
  { id: 'send_email', group: 'Communication', label: 'Send email', description: 'Email the customer a message', icon: 'Mail', type: 'SEND_EMAIL' },
  { id: 'send_sms', group: 'Communication', label: 'Send SMS', description: 'Text the customer a message', icon: 'MessageSquare', type: 'SEND_TEXT' },
  { id: 'notify', group: 'Communication', label: 'Send internal notification', description: 'Tell a team member, in-app or by email', icon: 'Bell', type: 'NOTIFY_TEAM' },
  { id: 'est_reminder', group: 'Communication', label: 'Send estimate reminder', description: 'Email the customer about their estimate', icon: 'Send', type: 'SEND_EMAIL' },

  { id: 'round_robin', group: 'Leads & pipeline', label: 'Assign via round robin', description: 'Share leads out in turn', icon: 'Repeat', type: 'ASSIGN_LEAD_OWNER', config: { how: 'ROUND_ROBIN', role: 'estimators' } },
  { id: 'assign_user', group: 'Leads & pipeline', label: 'Assign to user', description: 'Give the lead to one person', icon: 'UserCheck', type: 'ASSIGN_LEAD_OWNER', config: { how: 'USER' } },
  { id: 'lead_stage', group: 'Leads & pipeline', label: 'Update pipeline stage', description: 'Move the lead to a stage', icon: 'Kanban', type: 'MOVE_LEAD_STAGE' },
  { id: 'add_tag', group: 'Leads & pipeline', label: 'Add tag', description: 'Tag the lead', icon: 'Tag', locked: NO_TAGS },
  { id: 'remove_tag', group: 'Leads & pipeline', label: 'Remove tag', description: 'Remove a tag from the lead', icon: 'Tag', locked: NO_TAGS },
  { id: 'lead_field', group: 'Leads & pipeline', label: 'Update lead field', description: 'Set the source or add to the notes', icon: 'PenLine', type: 'SET_LEAD_FIELD' },
  { id: 'create_lead', group: 'Leads & pipeline', label: 'Create a lead', description: 'A new lead for the same customer', icon: 'UserPlus', type: 'CREATE_LEAD' },

  { id: 'task', group: 'Estimates & jobs', label: 'Create task', description: 'A to-do for a team member', icon: 'SquareCheck', type: 'CREATE_TASK' },
  { id: 'appointment', group: 'Estimates & jobs', label: 'Book appointment', description: 'First free slot with the estimator', icon: 'Calendar', type: 'CREATE_APPOINTMENT' },
  { id: 'job_from_est', group: 'Estimates & jobs', label: 'Create job from estimate', description: 'Done by EMTS when the estimate is accepted', icon: 'Briefcase', locked: 'EMTS already creates the job, work order and draft invoice when an estimate is accepted.' },
  { id: 'est_template', group: 'Estimates & jobs', label: 'Create estimate from template', description: 'A draft estimate for a Scheduled lead', icon: 'FilePlus2', type: 'CREATE_ESTIMATE_FROM_TEMPLATE' },
  { id: 'est_last', group: 'Estimates & jobs', label: 'Create estimate from last job', description: "From the customer's last estimate here", icon: 'History', type: 'CREATE_ESTIMATE_FROM_LAST_JOB' },
  { id: 'estimator', group: 'Estimates & jobs', label: 'Assign estimator', description: 'Set the estimator on the estimate', icon: 'UserCog', type: 'ASSIGN_ESTIMATOR' },
  { id: 'send_est', group: 'Estimates & jobs', label: 'Send estimate', description: 'Send it with the normal send flow', icon: 'Send', type: 'SEND_ESTIMATE' },
  { id: 'job_stage', group: 'Estimates & jobs', label: 'Update job stage', description: 'Move the job to a stage', icon: 'Briefcase', type: 'MOVE_JOB_STAGE' },
  { id: 'crew_lead', group: 'Estimates & jobs', label: 'Assign crew lead', description: 'Set the crew lead on the job', icon: 'HardHat', type: 'ASSIGN_CREW_LEAD' },
  { id: 'book', group: 'Estimates & jobs', label: 'Book the schedule', description: 'First dates a crew is free', icon: 'CalendarCheck', type: 'BOOK_SCHEDULE' },
  { id: 'deposit_ok', group: 'Estimates & jobs', label: 'Confirm deposit', description: 'Pending Deposit to Unscheduled', icon: 'BadgeDollarSign', type: 'CONFIRM_DEPOSIT' },
  { id: 'start_job', group: 'Estimates & jobs', label: 'Start job', description: 'Scheduled to In Progress', icon: 'Play', type: 'START_JOB' },

  { id: 'create_inv', group: 'Invoices & payments', label: 'Create invoice', description: 'Deposit, progress or final', icon: 'FilePlus', type: 'CREATE_INVOICE' },
  { id: 'send_inv', group: 'Invoices & payments', label: 'Send invoice', description: 'Send it with the normal send flow', icon: 'Send', type: 'SEND_INVOICE' },
  { id: 'check_pay', group: 'Invoices & payments', label: 'Check payment', description: 'Stop if any balance is left', icon: 'ShieldCheck', type: 'CHECK_PAYMENT' },

  { id: 'wait', group: 'Flow control', label: 'Wait', description: 'Pause for hours or days', icon: 'Hourglass', type: 'WAIT' },
  { id: 'wait_date', group: 'Flow control', label: 'Wait until a date', description: 'Pause until a date on the record', icon: 'CalendarClock', type: 'WAIT_UNTIL_DATE' },
  { id: 'wait_event', group: 'Flow control', label: 'Wait for event', description: 'Pause until something happens', icon: 'Timer', type: 'WAIT_FOR_CONDITION' },
  { id: 'if_else', group: 'Flow control', label: 'If / else', description: 'Split into two paths', icon: 'Split', locked: 'Not in version 1. Use "Only if" on a step to skip it when a condition is false.' },
  { id: 'go_to', group: 'Flow control', label: 'Go to step', description: 'Jump to another step', icon: 'CornerDownRight', locked: 'Not in version 1.' },
  { id: 'end', group: 'Flow control', label: 'End workflow', description: 'Stop here for this record', icon: 'OctagonX', type: 'END_WORKFLOW' },

  { id: 'note', group: 'Advanced', label: 'Add note', description: "Add to the record's activity log", icon: 'NotebookPen', type: 'ADD_NOTE' },
  { id: 'contact_note', group: 'Advanced', label: 'Add contact note', description: "Add to the contact's activity log", icon: 'StickyNote', type: 'ADD_CONTACT_NOTE' },
  { id: 'webhook', group: 'Advanced', label: 'Webhook', description: 'Send data to another system', icon: 'Webhook', locked: 'Needs the backend.' },
];
