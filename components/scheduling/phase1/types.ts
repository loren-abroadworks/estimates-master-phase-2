
export type Language = 'en' | 'es';

export enum UnitType {
  SQFT = 'SqFt',
  LNFT = 'LnFt',
  ITEM = 'Item'
}

export interface ProductionRate {
  id: string;
  name: string;
  category: string;
  unit: UnitType;
  scopes: string[];
  baseRate: number;
  laborRate: number;
  defaultCoats: number;
  rate2ndCoat?: number;
  rate3rdCoat?: number;
  rate4thCoat?: number;
}

export interface MaterialContainer {
  sizeLabel: string;
  gallons: number;
  price: number;
}

export interface Material {
  id: string;
  name: string;
  brand?: string;
  code?: string;
  category: string;
  coveragePerGallon: number;
  defaultCoats: number;
  sheen?: string;
  isDefault: boolean;
  containers: MaterialContainer[];
  lastUsed?: number;
  coverageCoat2?: number;
  coverageCoat3?: number;
  coverageCoat4?: number;
}

export interface TaxRegion {
  id: string;
  name: string;
  salesTaxRate: number;
  serviceTaxRate: number;
  zipCodes: string[];
}

export interface LineItemTemplate {
  id: string;
  type: 'priced' | 'descriptive';
  name: string;
  description: string;
  defaultPrice?: number;
  operationType?: 'flat' | 'percent';
}

export interface TermsTemplate {
  id: string;
  name: string;
  content: string;
}

export interface PackageDescriptionTemplate {
  id: string;
  name: string;
  description: string;
}

export interface ConfiguredScope {
  id: string;
  name: string;
  description: string;
  defaultLaborRate: number;
  profitMargin?: number;
  defaultAreaTemplateIds?: string[];
  termsTemplateId?: string;
}

export interface DifficultyTier {
  id: string;
  name: string;
  multiplier: number;
}

export interface ProductionRateCategory {
  id: string;
  name: string;
  scopeIds: string[];
}

export type ExtraColumnType = 'system' | 'hours' | 'checkbox' | 'quantity';

export interface ExtraColumn {
  id: string;
  label: string;
  type: ExtraColumnType;
  visible: boolean;
  isLocked?: boolean;
  unit?: UnitType;
}

export interface CustomBurden {
  id: string;
  name: string;
  rate: number;
}

export interface FinancialModelSettings {
  desiredAnnualIncome: number;
  profitMargin: number;
  marketingExpense: number;
  miscExpense: number;
  includeMiscExpense: boolean;
  includeMiscMaterials?: boolean;
  miscExpenseProfit?: number;
  applyProfitToMisc?: boolean;
  materialCost: number;
  avgHourlyPay: number;
  annualHoursPerEmployee: number;
  taxSocialSecurity: number;
  taxFUTA: number;
  taxSUTA: number;
  taxLiability: number;
  taxWorkmansComp: number;
  benefits: number;
  customBurdens: CustomBurden[];
  avgJobSize: number;
  closingRate: number;
  leadConversionRate: number;
  monthlySalesGoals?: number[];
  monthlyEstimateGoals?: number[];
  // Analytical Target Fields
  requiredGrossRevenue?: number;
  payrollCostPercent?: number;
  totalPayrollBudget?: number;
  avgLaborRate?: number;
  opexRate?: number;
  employeesNeeded?: number;
  totalJobsNeeded?: number;
  totalEstimatesNeeded?: number;
  totalLeadsNeeded?: number;
}

export interface PaymentSettings {
  defaultDepositPercentage: number;
  acceptCreditCards: boolean;
  acceptBankTransfer: boolean;
  paymentTerms: string;
  stripeConnected: boolean;
}

export interface BusinessProfile {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  website: string;
  licenseNumber: string;
  logoUrl?: string;
  logoInvertedUrl?: string;
  primaryColor?: string;
}

export interface UserProfile {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  photo?: string;
}

export interface GlobalSettings {
  businessProfile: BusinessProfile;
  userProfile: UserProfile;
  appLanguage: Language;     // language the contractor sees in the app UI
  clientLanguage: Language;  // language client-facing documents render in
  defaultLaborRate: number;
  laborMargin: number;
  operatingExpensePercentage: number;
  wasteEnabled: boolean;
  wastePercentage: number;
  roundingMode: 'up_to_gallon' | 'exact' | string;
  financialModel: FinancialModelSettings;
  paymentSettings: PaymentSettings;
  showFinancialModelingSection: boolean;
  scopes: ConfiguredScope[];
  areaTemplates: AreaTemplate[];
  taxRegions: TaxRegion[];
  taxRates: { id: string; name: string; rate: number }[];
  defaultTaxRateId: string;
  projectDiscounts: { id: string; name: string; type: 'percent' | 'flat'; value: number }[];
  defaultDiscountId: string | null;
  heightTiers: DifficultyTier[];
  accessTiers: DifficultyTier[];
  productionRateCategories: ProductionRateCategory[];
  extraColumns: ExtraColumn[];
  pipelineStages: PipelineStage[];
  messageTemplates: MessageTemplate[];
  estimateDefaults: ClientViewVisibility;

  // Scheduling / cascade-reschedule configuration
  scheduling?: SchedulingSettings;
}

export type WeatherKind = 'clear' | 'rain' | 'storm' | 'snow';

export interface CalendarDayMark {
  date: string;   // local 'YYYY-MM-DD'
  type: 'rain' | 'holiday';
  label?: string;
}

/** A single break on a crew member's day. Stores only primitives — the paid flag
 *  and duration; numbers (capacity, paid hours) are derived elsewhere, never a
 *  hardcoded policy. `startTime` present = fixed/anchored; omitted = flexible. */
export interface CrewBreak {
  id: string;
  label?: string;            // 'Lunch', 'Coffee' — optional
  durationMinutes: number;   // 15, 30, 60, …
  paid: boolean;
  startTime?: string;        // 'HH:mm' = fixed (anchored block); omitted = flexible (floating chip)
}

export interface SchedulingSettings {
  /** JS getDay() values treated as non-working (e.g. [0,6] = Sun, Sat). */
  nonWorkingWeekdays: number[];
  /** Recurring/observed holidays as local 'YYYY-MM-DD'. */
  holidays: CalendarDayMark[];
  /** Dates marked as rain days (cascade origins), persisted for reporting. */
  rainDays: CalendarDayMark[];
  workDayStartHour: number;
  workDayEndHour: number;
  /** Per-crew daily capacity in hours; defaults to the workday length when unset. */
  crewDailyCapacityHours?: number;
  /** Company-default break(s) applied to every scheduled member-day unless overridden. */
  defaultBreaks?: CrewBreak[];
  /** Mock forecast: local 'YYYY-MM-DD' -> weather kind. No external API. */
  mockWeather?: Record<string, WeatherKind>;
}

export interface PaymentRecord {
  id: string;
  date: string;
  amount: number;
  method: 'Credit Card' | 'Check' | 'Cash' | 'Bank Transfer' | 'Other';
  reference?: string;
  notes?: string;
  recordedBy: string;
}

export interface InvoiceItem {
  id?: string;
  description: string;
  amount: number;
  areaName?: string;
  quantity?: number;
  unit?: string;
  coats?: number;
  product?: string;
  productDetails?: string;
  unitPrice?: number;
}

export interface Attachment {
  id: string;
  type: 'image' | 'file';
  url?: string;
  name: string;
  size?: string;
  date: string;
}

export interface Invoice {
  id: string;
  number: string;
  createdDate: string;
  dueDate: string;
  estimateId: string;
  workOrderId?: string;
  clientId: string;
  clientName: string;
  clientAddress?: string;
  clientEmail?: string;
  clientPhone?: string;
  projectName: string;
  jobAddress?: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  depositRequired: number;
  depositPaid: boolean;
  amountPaid: number;
  balanceDue: number;
  status: 'Draft' | 'Sent' | 'Partially Paid' | 'Paid' | 'Overdue' | 'Void';
  payments: PaymentRecord[];
  items: InvoiceItem[];
  sundries?: InvoiceItem[];
  files?: Attachment[];
  scopeOfWork?: { title: string; description: string }[];
  terms?: string;
}

export interface AreaTemplate {
  id: string;
  name: string; 
  scopeId: string; 
  scopeIds?: string[]; 
  defaultRateIds: string[]; 
  columnOrder?: string[]; 
}

export interface PipelineStage {
  id: string;
  label: string;
  color: string;
  border: string;
}

export interface MessageTemplate {
  id: string;
  type: 'estimate_send' | 'invoice_send' | 'thank_you' | 'follow_up' | 'estimate_reminder';
  label: string;
  subject: string;
  body: string;
  availableVariables: string[];
}

export interface ClientViewVisibility {
  showAreaLabel?: boolean;
  showAreaPrice?: boolean;
  showColLabels?: boolean;
  showColQuantities?: boolean;
  showColCoats?: boolean;
  showColPrices?: boolean;
  showColProducts?: boolean;
  showLabel?: boolean; 
  showQuantity?: boolean; 
  showCoats?: boolean; 
  showPrice?: boolean; 
  isHidden?: boolean;
}

export interface EstimateRow {
  id: string;
  item: string;
  productionRateId: string;
  unit: UnitType;
  amount: number;
  coats: number;
  hours: number;
  colorNum: string;
  customValues: Record<string, any>;
  isOptional: boolean;
  isHoursOverridden?: boolean;
  visibility?: ClientViewVisibility;
  coatQuantities?: number[]; // [Coat 1 Qty, Coat 2 Qty, ...]
}

export interface EstimateArea {
  id: string;
  name: string;
  length: number;
  width: number;
  height: number;
  rows: EstimateRow[];
  isOptional: boolean;
  columnOrder?: string[];
  note?: string;
  visibility?: ClientViewVisibility;
}

export interface MiscLineItem {
  id: string;
  itemType: 'priced' | 'descriptive';
  description: string;
  details: string;
  quantity: number;
  unitPrice: number;
  total: number;
  isOptional: boolean;
  placeholder?: string;
  operationType?: 'flat' | 'percent';
  visibility?: ClientViewVisibility;
}

export interface PaintColorEntry {
  id: string;
  colorCode: string;
  colorName: string;
  productId: string;
  finish: string;
  brand: string;
  area: string;
  surfaces: string[];
}

export interface LineItem {
    measurement: {
        unit: UnitType;
        length: number;
        width?: number;
        height?: number;
        count?: number;
    };
    productionRate: ProductionRate;
    coats: number;
    difficultyHeight: number;
    difficultyAccess: number;
    material: Material | null;
    coatQuantities?: number[];
    
    calculatedQuantity?: number;
    baseLaborHours?: number;
    totalLaborHours?: number;
    laborCost?: number;
    materialRequiredGallons?: number;
    materialRequiredWithWaste?: number;
    containersUsed?: any[];
    materialCost?: number;
    totalCost?: number;
}

export interface CrewScheduleEntry {
  date: string; // ISO Date YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
  isOff: boolean;
  reason?: string; // Reason for being off
  /** Per-day break override. Absent = use company default; [] = explicitly no breaks;
   *  non-empty = exactly these breaks. */
  breaksOverride?: CrewBreak[];
}

export interface CrewMember {
  id: string;
  name: string;
  role: string;
  photo?: string;
  email?: string;
  phone?: string;
  status?: 'Active' | 'Inactive';
  permissions?: string[];
  color?: string;
  schedule?: Record<string, CrewScheduleEntry>; // Map of DateString -> Schedule
}

// NEW: Job Crew Allocation (Detailed Assignment)
export interface JobCrewAllocation {
  id: string;
  name: string; // e.g. "Prep Crew", "Finish Team"
  memberIds: string[];
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  startTime: string; // HH:mm — shift default window
  endTime: string;   // HH:mm
  color?: string;
  /** Per-day window overrides within the shift, keyed by local 'YYYY-MM-DD'.
   *  A day absent here uses the shift's default startTime/endTime. */
  dailyHours?: Record<string, { startTime: string; endTime: string }>;
  /** Days inside [startDate, endDate] the shift does NOT work, as local 'YYYY-MM-DD'.
   *  Absent or empty means every day in the range is worked (the pre-skip behaviour).
   *  A skipped day keeps any `dailyHours` / `hoursAssignments` entries it has — they are
   *  made inert by `allocCoversDay`, not deleted — so re-including the day restores them. */
  skipDays?: string[];
  /** This shift is history: its days have elapsed and were worked. Never moved, never
   *  re-keyed, read-only in the editor. Set once when a reschedule splits a shift at
   *  today's boundary; never recomputed against the calendar afterwards. */
  pinned?: true;
  // Granular daily hours: Map<MemberId, Map<DateStr, Hours>>
  hoursAssignments?: Record<string, Record<string, number>>;
  /** Per-member, per-day working-window overrides ('memberId' -> 'YYYY-MM-DD' -> window),
   *  set from the Assign Hours modal. A day absent here uses the shift's day window. */
  memberDailyWindows?: Record<string, Record<string, { startTime: string; endTime: string }>>;
}

export interface WorkOrderTask {
  id: string;
  areaName: string;
  description: string;
  quantity: number;
  uom: string;
  coats: number;
  estimatedHours: number;
  actualHours?: number;
  prepWash: boolean;
  prepScrape: boolean;
  prepCaulk: boolean;
  prepPrime: boolean;
  paintColorCode: string;
  paintProduct: string;
  paintSheen: string;
}

export interface WorkOrderNote {
  id: string;
  author: string;
  text: string;
  date: string;
}

export interface WorkOrder {
  id: string;
  estimateId: string;
  clientId?: string;
  version: number;
  status: 'Pending Deposit' | 'Unscheduled' | 'Scheduled' | 'In Progress' | 'Completed';
  jobName: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  jobAddress: string;
  accessCode: string;
  startDate: string;
  endDate: string;
  
  // Deprecated flat crew structure kept for compatibility if needed, but allocations preferred
  crewLeaderId: string | null;
  crewMemberIds: string[];

  // NEW: Detailed Allocations
  allocations?: JobCrewAllocation[];

  totalProductionHours: number;
  tasks: WorkOrderTask[];
  paintSchedule: PaintColorEntry[];
  areasExcluded: string;
  existingConditions: string;
  toolsNeeded: string;
  materialsNeeded: string;
  fieldNotes: string;
  notes?: WorkOrderNote[];
}

export type JobStage = 'Confirmed' | 'Scheduled' | 'In Production' | 'Touch Up' | 'Ready for Inspection' | 'Completed' | 'Marketing' | 'Cancelled';

export type JobPriority = 'Low' | 'Normal' | 'High' | 'Urgent';

export interface JobNote {
  id: string;
  text: string;
  createdAt: string; // ISO timestamp
  author?: string;
}

export interface Job {
  id: string;
  jobNumber: string;
  name: string;
  clientId: string;
  estimateId: string;
  workOrderId?: string;
  invoiceId?: string;
  address: string;
  stage: JobStage;
  startDate?: string;
  endDate?: string;

  // Excluded from cascade reschedule operations when true.
  is_locked?: boolean;
  // Work-type category (e.g. Interior / Exterior / Commercial) used for cascade scope filtering.
  category?: string;
  // Scheduling priority. Defaults to 'Normal' when unset.
  priority?: JobPriority;
  // Free-form scheduling notes shown in the job detail panel/view.
  notes?: JobNote[];
  // Optional customer scheduling window (mock; powers due-date issues & suggestions).
  customerWindow?: { preferredStart?: string; dueDate?: string };

  // Flattened view of who is working
  crewMemberIds?: string[];
  
  // New: Detailed allocations for this job
  allocations?: JobCrewAllocation[];

  /** Optional per-day working hours, keyed by local 'YYYY-MM-DD'. */
  dailyHours?: Record<string, { startTime: string; endTime: string }>;

  dateCreated: string;
  dateCompleted?: string;
}

// A single audit-log record for schedule changes, undos, locks, and notifications.
export interface ActivityLogEntry {
  id: string;
  timestamp: string;
  user: string;
  role: string;
  action: string;
  affectedJobIds: string[];
  details?: string;
}

export interface ClientProperty {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  accessCode?: string;
}

export interface Client {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone: string;
  address: string;
  properties: ClientProperty[];
  starred?: boolean;
  qualityRating?: number;
  notes?: string;
}

// Updated Lead Status Type
export type LeadStatus = 'New' | 'Contacted' | 'Scheduled' | 'Pending' | 'Sold' | 'Lost' | 'Archived' | 'Converted';

export interface Lead {
  id: string;
  date: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  source: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  status: LeadStatus;
  generatedJobId?: string;
  notes?: string;
  qualityRating?: number;
  clientId?: string; // NEW: Link to existing client
}

export type AppointmentStatus = 'Scheduled' | 'Completed' | 'Cancelled';

export interface Appointment {
  id: string;
  title: string;
  date: string;
  durationMinutes: number; 
  estimatorId: string;
  leadId?: string;
  clientId?: string;
  address: string;
  notes?: string;
  status: AppointmentStatus;
  googleCalendarEventId?: string;
  remindersSent: boolean;
}

export interface EstimateFinancials {
  selectedAccessTierId: string;
  selectedHeightTierId: string;
  taxId: string;
  baseGrandTotal: number;
  baseTaxAmount: number;
  baseDiscountAmount: number;
  discountId?: string;
  burdenRate?: number;
  opexRate?: number;
  baseSubtotal?: number;
  includeMiscExpense?: boolean;
}

export interface Package {
  id: string;
  name: string;
  isRecommended: boolean;
  scopeId: string;
  pricingMethod: 'hourly' | 'labor';
  estimateAreas: EstimateArea[];
  lineItems: Record<string, MiscLineItem>;
  formLayout: string[];
  paintColors: PaintColorEntry[];
  sundries: any[];
  financials: EstimateFinancials;
  customerNotes: string;
  description: string;
  finalize: { deposit: string; terms: string };
}

export interface Estimate {
  id: string;
  projectName: string;
  status: 'Draft' | 'Sent' | 'Approved' | 'Paid' | 'Archived' | 'Lost';

  customer: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    billingAddress: string;
    city: string;
    state: string;
    zip: string;
  };

  jobAddress: {
    address: string;
    city: string;
    state: string;
    zip: string;
    accessCode: string;
  };

  projectInfo: {
    name: string;
    number: string;
    date: string;
    validUntil: string;
  };

  salesman: any;

  internalNotes: string;
  packages: Package[];
  activePackageId: string;
  selectedPackageId: string | null;
  // When false, the estimate behaves as a single normal estimate (no package UI/comparison).
  packagesEnabled: boolean;
}
