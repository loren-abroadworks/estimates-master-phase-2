
import { PipelineStage, GlobalSettings, Material, ProductionRate, LineItemTemplate, TermsTemplate, PackageDescriptionTemplate, CrewMember, UnitType } from './types';
import { WorkingTimeConfig } from './services/scheduleEngine';

// Lightweight "logged-in user" stand-in for permission gating. In a real app
// this would come from the auth/session layer; here it is hardcoded (mock-
// consistent with how Google Calendar / reminders are simulated). Switch `role`
// to e.g. 'Painter' to verify that schedule-management entry points hide.
export type AppRole = 'Owner' | 'Admin' | 'Estimator' | 'Painter' | 'Foreman';
export const CURRENT_USER: { id: string; name: string; role: AppRole } = {
  id: 'cm-1',
  name: 'Mike Smith',
  role: 'Owner',
};

// Only Owners and Admins may run cascade reschedules, single-job moves, locks,
// and rain-day marking.
export const canManageSchedule = (role: AppRole): boolean => role === 'Owner' || role === 'Admin';

// Default working-time assumptions shared by the calendar view and the cascade
// reschedule engine. Phase 2 will source weekendDays/holidays from GlobalSettings.
export const DEFAULT_WORKING_TIME_CONFIG: WorkingTimeConfig = {
  skipNonWorkingDays: false,
  weekendDays: [0, 6],
  holidays: [],
  workDayStartHour: 8,
  workDayEndHour: 17,
};

export const INITIAL_MATERIALS: Material[] = [
  {
    id: 'mat-p1', name: 'SuperPaint', brand: 'Sherwin-Williams', category: 'Paint',
    coveragePerGallon: 350, defaultCoats: 2, isDefault: true,
    containers: [{ sizeLabel: 'Gallon', gallons: 1, price: 45.00 }, { sizeLabel: '5 Gallon', gallons: 5, price: 210.00 }]
  },
  {
    id: 'mat-p2', name: 'Emerald Urethane', brand: 'Sherwin-Williams', category: 'Paint',
    coveragePerGallon: 350, defaultCoats: 2, isDefault: true, sheen: 'Semi-Gloss',
    containers: [{ sizeLabel: 'Gallon', gallons: 1, price: 85.00 }]
  },
  {
    id: 'mat-p4', name: 'Emerald Interior', brand: 'Sherwin-Williams', category: 'Paint',
    coveragePerGallon: 350, defaultCoats: 2, isDefault: true, sheen: 'Matte',
    containers: [{ sizeLabel: 'Gallon', gallons: 1, price: 75.00 }]
  },
  {
    id: 'mat-p5', name: 'Duration Exterior', brand: 'Sherwin-Williams', category: 'Paint',
    coveragePerGallon: 300, defaultCoats: 2, isDefault: true, sheen: 'Satin',
    containers: [{ sizeLabel: 'Gallon', gallons: 1, price: 65.00 }]
  },
  {
    id: 'mat-s1', name: 'Blue Painter\'s Tape (1.5")', category: 'Consumable',
    coveragePerGallon: 0, defaultCoats: 0, isDefault: true,
    containers: [{ sizeLabel: 'Roll', gallons: 0, price: 8.50 }]
  },
  {
    id: 'mat-s2', name: 'Contractor Plastic (9x400)', category: 'Consumable',
    coveragePerGallon: 0, defaultCoats: 0, isDefault: true,
    containers: [{ sizeLabel: 'Roll', gallons: 0, price: 42.00 }]
  },
  {
    id: 'mat-s3', name: 'Painter\'s Caulk', category: 'Consumable',
    coveragePerGallon: 0, defaultCoats: 0, isDefault: true,
    containers: [{ sizeLabel: 'Tube', gallons: 0, price: 3.50 }]
  }
];

export const INITIAL_PRODUCTION_RATES: ProductionRate[] = [
  { id: 'pr-1', name: 'Standard Walls (8ft)', category: 'Interior Walls', unit: UnitType.SQFT, scopes: ['scope-int'], baseRate: 150, laborRate: 0, defaultCoats: 2 },
  { id: 'pr-2', name: 'Flat Ceilings', category: 'Interior Ceilings', unit: UnitType.SQFT, scopes: ['scope-int'], baseRate: 125, laborRate: 0, defaultCoats: 2 },
  { id: 'pr-3', name: 'Baseboards (Standard)', category: 'Interior Trim', unit: UnitType.LNFT, scopes: ['scope-int'], baseRate: 80, laborRate: 0, defaultCoats: 2 },
  { id: 'pr-7', name: 'Cabinet Door (Spray)', category: 'Cabinets', unit: UnitType.ITEM, scopes: ['scope-cab'], baseRate: 2, laborRate: 0, defaultCoats: 2 },
  { id: 'pr-ext-siding', name: 'Exterior Siding', category: 'Exterior', unit: UnitType.SQFT, scopes: ['scope-ext'], baseRate: 100, laborRate: 0, defaultCoats: 2 },
  { id: 'pr-ext-fascia', name: 'Exterior Fascia', category: 'Exterior', unit: UnitType.LNFT, scopes: ['scope-ext'], baseRate: 40, laborRate: 0, defaultCoats: 2 },
  { id: 'pr-ext-soffit', name: 'Exterior Soffit', category: 'Exterior', unit: UnitType.SQFT, scopes: ['scope-ext'], baseRate: 50, laborRate: 0, defaultCoats: 2 },
  { id: 'pr-ext-door', name: 'Exterior Door', category: 'Exterior', unit: UnitType.ITEM, scopes: ['scope-ext'], baseRate: 1.5, laborRate: 0, defaultCoats: 2 },
  { id: 'pr-ext-wash', name: 'Pressure Washing', category: 'Prep', unit: UnitType.SQFT, scopes: ['scope-ext'], baseRate: 500, laborRate: 0, defaultCoats: 1 },
];

export const INITIAL_LINE_ITEM_TEMPLATES: LineItemTemplate[] = [
  { id: 'lit-1', type: 'descriptive', name: 'Cover & Protect', description: 'Cover all furniture and floors with plastic and drop cloths.' },
  { id: 'lit-2', type: 'priced', name: 'Wallpaper Removal', description: 'Removal of existing wallpaper and adhesive.', defaultPrice: 450, operationType: 'flat' },
  { id: 'lit-3', type: 'priced', name: 'Setup Fee', description: 'Daily setup and cleanup fee.', defaultPrice: 50, operationType: 'flat' }
];

export const INITIAL_TERMS_TEMPLATES: TermsTemplate[] = [
  { id: 'tt-1', name: 'Standard Residential', content: '1. Payment is due upon completion.\n2. 25% deposit required to schedule.\n3. Colors must be selected 1 week prior to start.' },
  { id: 'tt-2', name: 'Commercial Net 30', content: '1. Payment due Net 30.\n2. Work performed after hours.' }
];

export const INITIAL_PACKAGE_DESCRIPTION_TEMPLATES: PackageDescriptionTemplate[] = [
  { id: 'pdt-1', name: 'Standard Interior', description: 'Complete interior repaint using quality paint. Two coats on walls and ceilings, all trim and doors included, with full surface prep and patching of minor cracks.' },
  { id: 'pdt-2', name: 'Premium Interior', description: 'Premium interior repaint with low-VOC paint. Two coats throughout, trim, doors, and closets included, plus drywall repair and caulking of all gaps.' },
  { id: 'pdt-3', name: 'Exterior Repaint', description: 'Full exterior repaint including pressure wash, scrape and sand of failing areas, priming of bare wood, and two finish coats on all sided surfaces and trim.' },
];

export const INITIAL_EMPLOYEES: CrewMember[] = [
  { id: 'cm-1', name: 'Mike Smith', role: 'Owner', email: 'mike@precisionpaint.com', phone: '(555) 123-4567', status: 'Active', photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Mike', color: '#3b82f6' },
  { id: 'cm-2', name: 'Jessica Miller', role: 'Estimator', email: 'jessica@precisionpaint.com', phone: '(555) 987-6543', status: 'Active', photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Jessica', color: '#ec4899' },
  { id: 'cm-3', name: 'David Chen', role: 'Estimator', email: 'david@precisionpaint.com', phone: '(555) 456-7890', status: 'Active', photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=David', color: '#10b981' },
  { id: 'cm-4', name: 'Sarah Jones', role: 'Painter', email: 'sarah@precisionpaint.com', phone: '(555) 222-3333', status: 'Active', photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah', color: '#f59e0b' },
  { id: 'cm-5', name: 'Tom Holland', role: 'Painter', email: 'tom@precisionpaint.com', phone: '(555) 333-4444', status: 'Active', photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Tom', color: '#ef4444' },
  { id: 'cm-6', name: 'Robert Jr', role: 'Foreman', email: 'rob@precisionpaint.com', phone: '(555) 444-5555', status: 'Active', photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Robert', color: '#8b5cf6' }
];

// UPDATED PIPELINE STAGES
export const DEFAULT_PIPELINE_STAGES: PipelineStage[] = [
    { id: 'New', label: 'New Lead', color: 'bg-blue-50 text-blue-700', border: 'border-blue-200' },
    { id: 'Contacted', label: 'Contacted', color: 'bg-purple-50 text-purple-700', border: 'border-purple-200' },
    { id: 'Scheduled', label: 'Estimate Scheduled', color: 'bg-orange-50 text-orange-700', border: 'border-orange-200' },
    { id: 'Pending', label: 'Pending', color: 'bg-amber-50 text-amber-700', border: 'border-amber-200' },
    { id: 'Sold', label: 'Sold', color: 'bg-emerald-50 text-emerald-700', border: 'border-emerald-200' },
    { id: 'Lost', label: 'Lost', color: 'bg-red-50 text-red-700', border: 'border-red-200' },
    { id: 'Archived', label: 'Archived', color: 'bg-gray-50 text-gray-600', border: 'border-gray-200' }
];

export const DEFAULT_MESSAGE_TEMPLATES: any[] = [
  {
    id: 'msg-est',
    type: 'estimate_send',
    label: 'Send Estimate',
    subject: 'Estimate for {{projectName}}',
    body: "Hi {{clientName}},\n\nPlease find the attached estimate for your review.\n\nClick the link below to view the details, sign, and approve the project.\n\nLet me know if you have any questions!\n\nBest regards,\nPrecision Paintworks",
    availableVariables: ['{{clientName}}', '{{projectName}}', '{{estimateNumber}}', '{{totalAmount}}']
  },
  {
    id: 'msg-inv',
    type: 'invoice_send',
    label: 'Send Invoice',
    subject: 'Invoice {{invoiceNumber}} from Precision Paintworks',
    body: "Hi {{clientName}},\n\nPlease find attached invoice {{invoiceNumber}} for {{projectName}}.\n\nYou can view and pay the invoice securely online at the link below.\n\nThank you for your business!\n\nBest regards,\nPrecision Paintworks",
    availableVariables: ['{{clientName}}', '{{projectName}}', '{{invoiceNumber}}', '{{totalAmount}}', '{{balanceDue}}']
  },
  {
    id: 'msg-thx',
    type: 'thank_you',
    label: 'Project Acceptance',
    subject: 'Thank you for choosing Precision Paintworks!',
    body: "Hi {{clientName}},\n\nWe are thrilled that you've chosen us for your project!\n\nWe have received your approval. The next step is to process the deposit invoice (attached/linked below) to lock in your spot on our schedule.\n\nOnce the deposit is received, we will confirm your start date.\n\nBest regards,\nPrecision Paintworks",
    availableVariables: ['{{clientName}}', '{{projectName}}']
  },
  {
    id: 'msg-follow',
    type: 'follow_up',
    label: 'General Follow Up',
    subject: 'Regarding your project',
    body: "Hi {{clientName}},\n\nI wanted to follow up on the estimate we sent over. Do you have any questions I can answer?\n\nBest,\nPrecision Paintworks",
    availableVariables: ['{{clientName}}', '{{projectName}}']
  },
  {
    id: 'msg-est-reminder',
    type: 'estimate_reminder',
    label: 'Estimate Day Reminder',
    subject: 'See you soon: Estimate Appointment',
    body: "Hi {{clientName}},\n\nJust a quick reminder that we are scheduled to meet today at {{appointmentTime}} for your estimate.\n\nOur estimator looks forward to discussing your project at {{jobAddress}}.\n\nSee you soon!\n\nBest regards,\nPrecision Paintworks",
    availableVariables: ['{{clientName}}', '{{appointmentTime}}', '{{jobAddress}}']
  }
];

export const DEFAULT_SETTINGS: GlobalSettings = {
  businessProfile: {
    name: 'Precision Paintworks',
    address: '123 Painter\'s Lane',
    city: 'Color City',
    state: 'NY',
    zip: '10001',
    phone: '(555) 123-4567',
    email: 'hello@precisionpaint.com',
    website: 'www.precisionpaint.com',
    licenseNumber: 'LC-12345678',
    primaryColor: '#2563eb'
  },
  userProfile: {
    firstName: 'Tim',
    lastName: 'Skelly',
    email: 'tim@precisionpaint.com',
    phone: '(555) 987-6543',
    photo: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Tim'
  },
  appLanguage: 'en',
  clientLanguage: 'en',
  defaultLaborRate: 70.32, 
  laborMargin: 0.20, 
  operatingExpensePercentage: 0.70,
  wasteEnabled: true,
  wastePercentage: 0.10, 
  roundingMode: 'up_to_gallon',
  
  financialModel: {
    desiredAnnualIncome: 100000,
    profitMargin: 35, 
    marketingExpense: 0, 
    miscExpense: 8, 
    includeMiscExpense: true, 
    includeMiscMaterials: true,
    miscExpenseProfit: 10, 
    applyProfitToMisc: false, 
    materialCost: 13, 
    avgHourlyPay: 25,
    annualHoursPerEmployee: 2000,
    taxSocialSecurity: 7.65,
    taxFUTA: 0.1,
    taxSUTA: 5,
    taxLiability: 1, 
    taxWorkmansComp: 10,
    benefits: 0,
    customBurdens: [], 
    avgJobSize: 3500,
    closingRate: 35, 
    leadConversionRate: 25,
    monthlySalesGoals: [],
    monthlyEstimateGoals: []
  },
  
  paymentSettings: {
    defaultDepositPercentage: 25,
    acceptCreditCards: true,
    acceptBankTransfer: true,
    paymentTerms: 'Due on Receipt',
    stripeConnected: true
  },

  showFinancialModelingSection: false, 
  
  pipelineStages: DEFAULT_PIPELINE_STAGES,
  
  messageTemplates: DEFAULT_MESSAGE_TEMPLATES,

  scopes: [
    {
        id: 'scope-int',
        name: 'Interior',
        description: 'Standard interior painting (walls, ceilings, trim)',
        defaultLaborRate: 65,
        defaultAreaTemplateIds: ['temp-room-1', 'temp-hall-1'],
        termsTemplateId: 'tt-1',
        profitMargin: 35
    },
    {
        id: 'scope-ext',
        name: 'Exterior',
        description: 'Exterior painting, staining, and pressure washing',
        defaultLaborRate: 70,
        defaultAreaTemplateIds: [],
        termsTemplateId: 'tt-1',
        profitMargin: 40
    },
    {
        id: 'scope-cab',
        name: 'Cabinets',
        description: 'Kitchen and vanity cabinet refinishing',
        defaultLaborRate: 85,
        defaultAreaTemplateIds: [],
        termsTemplateId: 'tt-1',
        profitMargin: 45
    }
  ],
  
  areaTemplates: [
      { id: 'temp-room-1', name: 'Bedroom / Office', scopeId: 'scope-int', defaultRateIds: ['pr-1', 'pr-2', 'pr-3', 'pr-4'] },
      { id: 'temp-hall-1', name: 'Hallway / Foyer', scopeId: 'scope-int', defaultRateIds: ['pr-1', 'pr-3', 'pr-4'] },
      { id: 'temp-bath-1', name: 'Bathroom', scopeId: 'scope-int', defaultRateIds: ['pr-1', 'pr-2', 'pr-3', 'pr-4'] }
  ],
  
  taxRegions: [
      { id: 'tr-1', name: 'County A', salesTaxRate: 0.08, serviceTaxRate: 0, zipCodes: ['10001', '10002'] }
  ],
  taxRates: [{ id: 'tax-0', name: 'No Tax', rate: 0 }, { id: 'tax-1', name: 'Standard Sales Tax', rate: 0.0825 }],
  defaultTaxRateId: 'tax-0',
  
  projectDiscounts: [
      { id: 'disc-1', name: 'Senior Discount', type: 'percent', value: 0.05 },
      { id: 'disc-2', name: 'Winter Special', type: 'percent', value: 0.10 },
      { id: 'disc-3', name: 'Referral Credit', type: 'flat', value: 100 }
  ],
  defaultDiscountId: null,
  
  heightTiers: [
      { id: 'ht-1', name: 'Standard (8-9ft)', multiplier: 1.0 },
      { id: 'ht-2', name: 'High (10-12ft)', multiplier: 1.2 },
      { id: 'ht-3', name: 'Vaulted / 2-Story', multiplier: 1.5 }
  ],
  
  accessTiers: [
      { id: 'at-1', name: 'Empty / Easy', multiplier: 1.0 },
      { id: 'at-2', name: 'Furnished / Standard', multiplier: 1.1 },
      { id: 'at-3', name: 'Occupied / Heavy Furniture', multiplier: 1.25 }
  ],
  
  productionRateCategories: [
      { id: 'cat-1', name: 'Interior Walls', scopeIds: ['scope-int'] },
      { id: 'cat-2', name: 'Interior Ceilings', scopeIds: ['scope-int'] },
      { id: 'cat-3', name: 'Interior Trim', scopeIds: ['scope-int'] },
      { id: 'cat-4', name: 'Exterior', scopeIds: ['scope-ext'] },
      { id: 'cat-5', name: 'Prep', scopeIds: ['scope-int', 'scope-ext'] },
      { id: 'cat-6', name: 'Cabinets', scopeIds: ['scope-cab'] }
  ],
  
  extraColumns: [
      // Standard System Columns (for ordering)
      { id: 'sys-item', label: 'Item', type: 'system', visible: true, isLocked: true },
      { id: 'sys-amount', label: 'Amount', type: 'system', visible: true, isLocked: true },
      { id: 'sys-coats', label: 'Coats', type: 'system', visible: true, isLocked: true },
      { id: 'sys-color', label: 'Color', type: 'system', visible: true, isLocked: true },
      { id: 'sys-hours', label: 'Hours', type: 'system', visible: true, isLocked: true },
      { id: 'sys-gallons', label: 'Est. Gal', type: 'system', visible: true, isLocked: true },

      // Custom Columns
      { id: 'col-prep', label: 'Prep (Hrs)', type: 'hours', visible: true },
      { id: 'col-patch', label: 'Patching', type: 'checkbox', visible: true },
      
      // Exterior Specific
      { id: 'col-wash', label: 'Wash', type: 'checkbox', visible: false }, 
      { id: 'col-prime', label: 'Prime', type: 'checkbox', visible: false },
      { id: 'col-caulk', label: 'Caulk', type: 'checkbox', visible: false },
      { id: 'col-plastic', label: 'Masking', type: 'checkbox', visible: false },
      
      // Exterior Quantity Columns
      { id: 'col-coat1', label: '1st Coat', type: 'hours', visible: false, unit: UnitType.SQFT }, 
      { id: 'col-coat2', label: '2nd Coat', type: 'hours', visible: false, unit: UnitType.SQFT },
      { id: 'col-coat3', label: '3rd Coat', type: 'hours', visible: false, unit: UnitType.SQFT },
  ],
  
  estimateDefaults: {
    showAreaLabel: true,
    showAreaPrice: true,
    showColLabels: true,
    showColQuantities: true,
    showColCoats: true,
    showColPrices: true,
    showColProducts: true,
    showLabel: true,
    showQuantity: true,
    showCoats: true,
    showPrice: true,
    isHidden: false
  },
  scheduling: {
    nonWorkingWeekdays: [0, 6],
    holidays: [],
    rainDays: [],
    workDayStartHour: 8,
    workDayEndHour: 17,
    crewDailyCapacityHours: 9,
    mockWeather: {},
  }
};
