
export type SubscriptionPlan = string;

export const DefaultPlanPricing: Record<string, number> = {
  'Alpha (15MB)': 1300,
  'Blue (20MB)': 1500,
  'Yellow (25MB)': 1800,
  'Orange (30MB)': 2100,
  'Red (35MB)': 2300,
  'Brown (40MB)': 2600,
  'Grey (50MB)': 3000,
  'Purple (60MB)': 3500,
  'Pink (70MB)': 4000,
  'Black (80MB)': 4500,
  'Green (100MB)': 5000,
};

export enum PaymentMethod {
  CASH = 'Cash',
  TRANSFER = 'Bank Transfer',
  MOBILE_MONEY = 'Mobile Money',
  CARD = 'Card'
}

export enum PaymentStatus {
  SUCCESS = 'Success',
  PENDING = 'Pending'
}

export enum ReceiptDesign {
  PROFESSIONAL = 'Professional',
  COMPACT = 'Compact',
  MODERN = 'Modern',
  THERMAL = 'Thermal',
  UTILITY = 'Utility',
  INVOICE = 'Invoice'
}

export interface ManagerAccount {
  username: string;
  password: string;
  businessName: string;
  email: string;
  phone: string;
  role?: 'admin' | 'manager' | 'sub-manager';
  managerUsername?: string;
  createdAt: string;
  rememberPassword?: boolean;
  agentToken?: string; // sub-manager only — server-issued session token (find_sub_manager_login), used to authorize WABot requests via check_agent_permission
  authUserId?: string; // real Supabase Auth identity for provisioned accounts
}

// A WABot support agent — lets mahadnet run 2-3 named agents (e.g. Ayesha for billing,
// Bilal for technical) each with their own persona name, specialization scope (injected
// into the AI system prompt so it strictly stays in-lane), voice, and routing keywords.
export type WABotAgentPurpose = 'billing' | 'complaint' | 'new_connection' | 'network_qa' | 'general' | 'other';
export type WABotTtsProvider = 'gemini' | 'azure' | 'edge';
export type WABotAgentGender = 'male' | 'female';

export interface WABotAgent {
  id: string;
  name: string; // persona name, e.g. "Ayesha", "Bilal"
  scope: string; // plain-language description of what this agent handles — appended to the AI's instructions
  keywords: string[]; // words/phrases in the customer's message that route to this agent
  voice: string; // Gemini TTS voice name, e.g. "Kore", "Puck" — used when ttsProvider is 'gemini'
  active: boolean;
  purpose?: WABotAgentPurpose; // label for mahadnet to organize/test agents by use-case (billing/complaint/etc) — informational, doesn't affect routing
  ttsProvider?: WABotTtsProvider; // which TTS engine this agent's voice replies use, default 'gemini'. 'azure'/'edge' speak real Urdu script (auto-transliterated) instead of Gemini's native Roman Urdu, and auto-fallback to 'edge' (free/unlimited) if 'azure' has no key configured or fails
  gender?: WABotAgentGender; // default 'female' (matches original Ayesha persona) — drives correct Urdu grammatical gender in the reply TEXT (kar sakta hoon vs kar sakti hoon), and picks the ur-PK-AsadNeural/ur-PK-UzmaNeural voice for azure/edge providers
}

export interface AppSettings {
  businessName: string;
  businessPhone: string;
  businessEmail: string;
  businessAddress: string;
  globalNote?: string;
  billAds?: string;
  billAdsImage?: string; // Base64 string for the promotional image
  planPrices: Record<string, number>;
  planCompanyPrices?: Record<string, number>; // Wholesale price per plan charged to the dealer by the internet company (used for gross profit)
  receiptDesign: ReceiptDesign;
  adminUsername?: string;
  adminPassword?: string;
  isInitialized?: boolean;
  lastSystemCheck?: string;
  autoReminderChannel?: 'sms' | 'whatsapp';
  receiptTemplate?: string;
  reminderTemplate?: string;
  oneDriveClientId?: string;
  oneDriveLastBackup?: string;
  themePrimaryColor?: string;
  themeAccentColor?: string;
  selectedThemeId?: string;
  businessLogo?: string; // Base64 string for the logo
  showBusinessNameOnReceipt?: boolean; // Default true
  receiptSerialStart?: number; // Starting serial number for receipts (e.g. 1, 900, 5000)
  receiptSerialPrefix?: string; // Prefix for serial like MN, ISP, etc.
  ayeshaBotName?: string; // Editable display name for the WhatsApp bot persona, default "Ayesha"
  ttsVoice?: string; // Selected Gemini TTS voice name for the default persona (e.g. "Kore"), falls back to GEMINI_TTS_VOICE env var
  wabotAgents?: WABotAgent[]; // Multi-agent WABot config — each agent has its own name, scope, voice, routing keywords
  routerCatalog?: RouterCatalog; // Admin-editable WhatsApp bot router catalog (models/specs/prices/images)
  botTemplates?: Record<string, BotTemplate>; // Admin-editable WhatsApp bot reply templates (wording of every canned reply)
  messageTemplates?: Record<string, MessageTemplate>; // Admin-editable manual-send templates (Customer Directory, Recovery Ledger, Receipt Share, Expiry Reminder, Bulk Reminder)
  areas?: string[]; // Manager-defined list of service areas (Area Dashboard) — used to populate area select in Customer Directory
  autoSendPaymentConfirmation?: boolean; // Toggle for automatic WhatsApp payment confirmation template sending
}

// Connection category — how the subscriber is physically connected (Customer Directory column + filter)
export const CONNECTION_TYPES = ['Fiber', 'Local/Panel', 'Bandwidth', 'Sharing', 'Wireless', 'Other'] as const;
export type ConnectionType = typeof CONNECTION_TYPES[number];

export interface MessageTemplate {
  category: string; // 'reminder' | 'recovery' | 'receipt' | 'expiry' | 'bulk' | 'other'
  label: string;
  text: string; // may contain {placeholder} tokens substituted at send time
}

export interface BotTemplate {
  category: string;
  label: string;
  text: string; // may contain {placeholder} tokens substituted by the bot at send time
}

export interface RouterCatalogItem {
  id: string;
  model: string;
  company: string;
  band: string; // display label, e.g. "2.4GHz Single Band"
  price: number;
  image: string; // image URL shown to the customer
  specs: string; // full specs text sent by the WhatsApp bot
}

export interface RouterCatalog {
  '2.4g': RouterCatalogItem[];
  '5g': RouterCatalogItem[];
}

export interface UserRecord {
  id: string;
  username: string;
  name: string;
  phone: string;
  phone2?: string;
  address: string;
  description?: string;
  plan: string;
  monthlyFee: number;
  balance: number;
  persistentDiscount?: number;
  lastPaymentDate: string;
  expiryDate: string;
  createdAt: string;
  lastReminderSentAt?: string;
  activatedMonths?: string[]; // Array of strings like "January 2024"
  status: 'active' | 'expired' | 'pending' | 'deleted';
  companyId?: string;
  area?: string;
  connectionType?: string; // Fiber / Local-Panel / Bandwidth / Sharing / Wireless / Other — see CONNECTION_TYPES
  // Ayesha bot — reactivation targeting: true once customer has physically moved out
  // of the coverage area (excludes them from "disconnected 90+ days" reactivation campaigns).
  movedOut?: boolean;
  // Ayesha bot — credit/advance recovery tracking. Auto-cleared when a receipt/payment
  // is recorded against this customer.
  creditRecharge?: boolean;
  creditAmount?: number;
  creditDate?: string;
  creditLastReminderSent?: string;
  creditReminderCount?: number; // capped at 5-6, then surfaced for manual follow-up
  // Ayesha bot — overdue payment reminders (package already expired AND balance > 0).
  overdueLastReminderSent?: string;
  overdueReminderCount?: number; // capped, then surfaced for manual follow-up
  // Ayesha bot — reactivation campaign (disconnected 90+ days, see movedOut above).
  reactivationLastSent?: string;
  reactivationReminderCount?: number;
  // Ayesha bot — 6-hour/1-hour-before-midnight-expiry + just-expired pings.
  // Stores the expiryDate value the reminder was already sent for for, so a renewal
  // (which changes expiryDate) naturally re-arms the reminder for the new date.
  expiry6hNotifiedFor?: string;
  expiry1hNotifiedFor?: string;
  expiryJustNotifiedFor?: string;
}

export interface Receipt {
  id: string;
  userId: string;
  username: string;
  userName: string;
  userPhone: string;
  userAddress?: string;
  totalAmount: number; 
  paidAmount: number;  
  balanceAmount: number; 
  advanceAmount?: number;
  discount?: number;
  monthlyFee?: number;
  plan?: string;
  activatedMonth?: string;
  date: string;
  period: string;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  transactionRef: string;
  description?: string; 
  companyId?: string;
  isLatePayment?: boolean;
  actualPaymentDate?: string;
  collectedBy?: string;
  expiryDate?: string;
  rechargeDate?: string;
  receiptImageUrl?: string; // Auto-generated PNG URL — used by WABot for instant receipt sharing on request
}

export interface AppNotification {
  id: string;
  type: 'EXPIRY' | 'OVERDUE' | 'SYSTEM' | 'RECOVERY' | 'PAYMENT' | 'ATTENDANCE_IN' | 'ATTENDANCE_OUT' | 'COMPLAINT_RESOLVED' | 'COMPLAINT_ASSIGNED' | 'COMPLAINT_REVIEW_REQUIRED' | 'COMPLAINT_FEEDBACK_SKIPPED';
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  message: string;
  timestamp: string;
  userId?: string;
  actionLabel?: string;
  actionTab?: string;
}

export interface Archive {
  id: string;
  name: string;
  month?: string;
  year?: string;
  createdAt: string;
  users: UserRecord[];
}

export interface SalaryPayment {
  month: string;        // e.g. "May 2026"
  paidAt: string;       // ISO timestamp when manager marked as paid
  baseSalary: number;   // Fixed salary paid
  commission: number;   // Commission paid
  total: number;        // Total paid
}

// ─── COMPLAINT TICKET ───────────────────────────────────────
export type ComplaintStatus = 'open' | 'assigned' | 'pending_manager_review' | 'revision_required' | 'resolved' | 'closed';
export type ComplaintFeedbackStatus = 'pending' | 'sent' | 'skipped_window' | 'not_configured' | 'failed';

export interface ComplaintTicket {
  id: string;
  customerId: string;       // UserRecord.id
  customerName: string;
  customerPhone?: string;
  title: string;            // Short issue title
  description: string;
  status: ComplaintStatus;
  priority: 'low' | 'medium' | 'high';
  assignedTo?: string;      // SubManagerAccount.id or username
  assignedAt?: string;
  assignmentNote?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  resolutionDetails?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
  commissionOnResolve?: number;  // Fixed Rs. amount paid on resolution
  createdAt: string;
  createdBy: string;        // manager username
  customerLastInboundAt?: string; // Used for a fail-closed 24-hour NetBot window check
  feedbackStatus?: ComplaintFeedbackStatus;
  feedbackSentAt?: string;
  feedbackError?: string;
  notes?: string;
}

export interface TeamMessage {
  id: string;
  managerUsername: string;
  senderUsername: string;
  senderRole: 'manager' | 'sub-manager';
  recipientUsername: string;
  text?: string;
  voiceUrl?: string;
  voiceMimeType?: string;
  createdAt: string;
  readAt?: string;
}

// ─── BUSINESS EXPENSE ────────────────────────────────────────
export interface BusinessExpense {
  id: string;
  title: string;
  amount: number;
  category: 'salary' | 'equipment' | 'rent' | 'utilities' | 'marketing' | 'other';
  date: string;             // ISO date
  notes?: string;
  createdAt: string;
}

// ─── ACCESS RIGHTS MATRIX (Feature A — Granular Access Rights + Area Lock) ───
// Module keys map 1:1 to Layout.tsx nav tab ids so nav gating stays a simple lookup.
export type ModuleKey =
  | 'dashboard' | 'users' | 'receipts' | 'recoveries' | 'expiries'
  | 'reports' | 'systemlogs' | 'settings' | 'team' | 'expenses'
  | 'analytics' | 'outage' | 'area' | 'equipment' | 'leads'
  | 'reminders' | 'templates' | 'wabot';

export interface AccessRights {
  view: boolean;
  create: boolean;
  edit: boolean;
  delete: boolean;
  receipt?: boolean; // only relevant for receipts/recoveries modules
}

export const MODULE_LABELS: Record<ModuleKey, string> = {
  dashboard: 'Dashboard', users: 'Customers', receipts: 'Receipts',
  recoveries: 'Recoveries', expiries: 'Expiries', reports: 'AI Insights',
  systemlogs: 'Sys Logs', settings: 'Settings', team: 'Team Hub',
  expenses: 'Expenses', analytics: 'Analytics', outage: 'Outage',
  area: 'Area', equipment: 'Equipment', leads: 'Leads',
  reminders: 'Reminders', templates: 'Message Templates', wabot: 'WABot',
};

export interface SubManagerAccount {
  id: string;
  username: string;
  name: string;
  managerUsername: string;
  dutyStatus: 'online' | 'offline';
  lastCheckIn?: string;
  lastCheckOut?: string;
  lastLocation?: {
    lat: number;
    lng: number;
    timestamp: string;
  };
  area?: string;
  isLeave?: boolean;
  baseSalary?: number;         // Fixed monthly salary in Rs.
  commissionPercent?: number;  // Commission % on collections (e.g. 5 = 5%)
  complaintCommission?: number; // Fixed Rs. earned per complaint resolved
  salaryPayments?: SalaryPayment[]; // History of months marked as paid
  // ── Feature A: Granular Access Rights Matrix + Area Lock ──
  assignedAreas?: string[];    // empty/undefined = all areas (no lock)
  accessRights?: Record<ModuleKey, AccessRights>; // undefined = unrestricted (legacy behavior, unaffected)
  active?: boolean;            // false = suspended (reserved for future login block, not yet enforced)
  shiftStart?: string;          // Local time in HH:mm, configured by the manager
  shiftEnd?: string;            // Local time in HH:mm, configured by the manager
}

export interface AttendanceLog {
  id: string;
  subManagerId: string;
  type: 'check-in' | 'check-out' | 'leave';
  timestamp: string;
  reason?: string;
  overtimeMinutes?: number;
  overtimeReason?: string;
  location?: {
    lat: number;
    lng: number;
  };
}

export function calculateOvertimeMinutes(checkIn: string, checkOut: string, shiftStart?: string, shiftEnd?: string): number {
  if (!checkIn || !checkOut || !shiftStart || !shiftEnd) return 0;
  const start = new Date(checkIn);
  const end = new Date(checkOut);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return 0;
  const [startHour, startMinute] = shiftStart.split(':').map(Number);
  const [endHour, endMinute] = shiftEnd.split(':').map(Number);
  if (![startHour, startMinute, endHour, endMinute].every(Number.isFinite)) return 0;
  const shiftStartDate = new Date(start);
  shiftStartDate.setHours(startHour, startMinute, 0, 0);
  const shiftEndDate = new Date(start);
  shiftEndDate.setHours(endHour, endMinute, 0, 0);
  if (shiftEndDate <= shiftStartDate) shiftEndDate.setDate(shiftEndDate.getDate() + 1);
  let overtime = 0;
  if (start < shiftStartDate) overtime += Math.max(0, Math.round((Math.min(end.getTime(), shiftStartDate.getTime()) - start.getTime()) / 60000));
  if (end > shiftEndDate) overtime += Math.max(0, Math.round((end.getTime() - Math.max(start.getTime(), shiftEndDate.getTime())) / 60000));
  return overtime;
}

export interface Company {
  id: string;
  name: string;
  settings: AppSettings;
}

export interface SystemLog {
  id: string;
  timestamp: string;
  action: string;
  description: string;
  performedBy: string;
  category: 'user' | 'payment' | 'recovery' | 'system' | 'settings' | 'import';
}

// ─── LEADS / NEW CONNECTION PIPELINE ─────────────────────────
export type LeadStatus = 'new' | 'contacted' | 'survey_done' | 'install_pending' | 'converted' | 'lost';

export interface LeadRecord {
  id: string;
  name: string;
  phone: string;
  address: string;
  area?: string;
  interestedPlan?: string;
  status: LeadStatus;
  assignedTo?: string;       // agent username
  note?: string;
  followUpDate?: string;     // ISO date
  source?: string;           // walk-in, referral, social media, etc.
  referredBy?: string;       // customer name who referred
  createdAt: string;
  updatedAt: string;
}

// ─── EQUIPMENT / DEVICE TRACKER ─────────────────────────────
export type EquipmentType = 'router' | 'onu_ont' | 'media_converter' | 'switch' | 'cable' | 'power_adapter' | 'other';
export type EquipmentStatus = 'available' | 'deployed' | 'damaged' | 'lost' | 'maintenance' | 'sold';

export interface EquipmentRecord {
  id: string;
  serialNumber: string;
  brand: string;
  model: string;
  type: EquipmentType;
  status: EquipmentStatus;
  assignedToUserId?: string;
  assignedToUserName?: string;
  assignedDate?: string;
  returnDate?: string;
  purchaseDate?: string;
  purchasePrice?: number;
  notes?: string;
  createdAt: string;
  // ── Sale to customer (owner sells device, issues a receipt, keeps a sales record) ──
  soldToUserId?: string;
  soldToUserName?: string;
  soldToUserPhone?: string;
  soldPrice?: number;
  soldDate?: string;
  saleReceiptNo?: string;
  saleNotes?: string;
}

// ─── SERVICE SUSPENSION LOG ──────────────────────────────────
export type SuspensionReason = 'non_payment' | 'customer_request' | 'abuse' | 'maintenance' | 'other';

export interface SuspensionLog {
  id: string;
  userId: string;
  userName: string;
  userPhone?: string;
  action: 'suspended' | 'restored';
  reason: SuspensionReason;
  note?: string;
  performedBy: string;
  createdAt: string;
}

// ─── NETWORK OUTAGE LOG ───────────────────────────────────────
export type OutageSeverity = 'partial' | 'full' | 'degraded';
export type OutageIncidentType = 'outage' | 'slow' | 'maintenance' | 'fiber-cut' | 'power' | 'other';

export interface OutageLog {
  id: string;
  title: string;
  description?: string;
  incidentType?: OutageIncidentType;
  severity: OutageSeverity;
  areasAffected: string[];
  startTime: string;
  endTime?: string;
  resolvedBy?: string;
  resolutionNote?: string;
  cause?: string;
  estimatedResolution?: string;
  customerMessage?: string;
  notifyBot?: boolean;
  affectedCount?: number;
  updatedAt?: string;
  createdAt: string;
  createdBy: string;
}

export interface PlanChange {
  id: string;
  userId: string;
  userName: string;
  oldPlan: string;
  newPlan: string;
  oldFee: number;
  newFee: number;
  changedAt: string;
  changedBy: string;
  reason?: string;
}

// ─── DEALER SALES & PROFIT (bulk resale ledger; separate from Equipment Tracker) ──
export type DealerProductCategory = 'Device' | 'ONU/ONT' | 'Fiber' | 'Internet Wire' | 'Accessories' | 'Other';

export interface DealerProduct {
  id: string;
  name: string;
  category: DealerProductCategory;
  unit: string;
  defaultSalePrice: number;
  notes?: string;
  active?: boolean;
  createdAt: string;
}

export interface DealerPurchase {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
  totalCost: number;
  supplier?: string;
  invoiceNo?: string;
  date: string;
  notes?: string;
  createdAt: string;
}

export interface DealerSale {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
  saleUnitPrice: number;
  totalRevenue: number;
  totalCost: number;
  profit: number;
  customerId?: string;
  customerName?: string;
  customerPhone?: string;
  date: string;
  paymentStatus: 'paid' | 'partial' | 'credit';
  notes?: string;
  createdAt: string;
}

export interface AppState {
  users: UserRecord[];
  receipts: Receipt[];
  archives: Archive[];
  subManagers?: SubManagerAccount[];
  attendanceLogs?: AttendanceLog[];
  companies?: Company[];
  activeCompanyId?: string;
  theme?: 'light' | 'dark';
  language?: 'en' | 'ur'; // UI display language preference — synced per account like theme
  settings?: AppSettings;
  currentManager?: string;
  dismissedNotificationIds?: string[];
  complaintTickets?: ComplaintTicket[];
  businessExpenses?: BusinessExpense[];
  systemLogs?: SystemLog[];
  equipmentRecords?: EquipmentRecord[];
  dealerProducts?: DealerProduct[];
  dealerPurchases?: DealerPurchase[];
  dealerSales?: DealerSale[];
  leads?: LeadRecord[];
  suspensionLogs?: SuspensionLog[];
  outageLogs?: OutageLog[];
  planHistory?: PlanChange[];
  pendingManagerNotifications?: AppNotification[];
  shownManagerNotificationIds?: string[];
  agentPendingNotifications?: Record<string, AppNotification[]>;
  teamMessages?: TeamMessage[];
}

