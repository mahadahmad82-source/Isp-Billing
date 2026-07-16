
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
  routerCatalog?: RouterCatalog; // Admin-editable WhatsApp bot router catalog (models/specs/prices/images)
  botTemplates?: Record<string, BotTemplate>; // Admin-editable WhatsApp bot reply templates (wording of every canned reply)
  messageTemplates?: Record<string, MessageTemplate>; // Admin-editable manual-send templates (Customer Directory, Recovery Ledger, Receipt Share, Expiry Reminder, Bulk Reminder)
  areas?: string[]; // Manager-defined list of service areas (Area Dashboard) — used to populate area select in Customer Directory
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
  type: 'EXPIRY' | 'OVERDUE' | 'SYSTEM' | 'RECOVERY' | 'PAYMENT' | 'ATTENDANCE_IN' | 'ATTENDANCE_OUT' | 'COMPLAINT_RESOLVED' | 'COMPLAINT_ASSIGNED';
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
export interface ComplaintTicket {
  id: string;
  customerId: string;       // UserRecord.id
  customerName: string;
  customerPhone?: string;
  title: string;            // Short issue title
  description: string;
  status: 'open' | 'assigned' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high';
  assignedTo?: string;      // SubManagerAccount.id or username
  assignedAt?: string;
  resolvedAt?: string;
  commissionOnResolve?: number;  // Fixed Rs. amount paid on resolution
  createdAt: string;
  createdBy: string;        // manager username
  notes?: string;
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
}

export interface AttendanceLog {
  id: string;
  subManagerId: string;
  type: 'check-in' | 'check-out' | 'leave';
  timestamp: string;
  reason?: string;
  location?: {
    lat: number;
    lng: number;
  };
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

export interface OutageLog {
  id: string;
  title: string;
  description?: string;
  severity: OutageSeverity;
  areasAffected: string[];
  startTime: string;
  endTime?: string;
  resolvedBy?: string;
  cause?: string;
  affectedCount?: number;
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
  leads?: LeadRecord[];
  suspensionLogs?: SuspensionLog[];
  outageLogs?: OutageLog[];
  planHistory?: PlanChange[];
  pendingManagerNotifications?: AppNotification[];
  shownManagerNotificationIds?: string[];
  agentPendingNotifications?: Record<string, AppNotification[]>;
}
