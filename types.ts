
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
  UTILITY = 'Utility'
}

export interface ManagerAccount {
  username: string;
  password: string;
  businessName: string;
  email: string;
  phone: string;
  createdAt: string;
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
  date: string;
  period: string;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  transactionRef: string;
  description?: string; 
  companyId?: string;
}

export interface AppNotification {
  id: string;
  type: 'EXPIRY' | 'OVERDUE' | 'SYSTEM' | 'RECOVERY';
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

export interface Company {
  id: string;
  name: string;
  settings: AppSettings;
}

export interface AppState {
  users: UserRecord[];
  receipts: Receipt[];
  archives: Archive[];
  companies?: Company[];
  activeCompanyId?: string;
  theme?: 'light' | 'dark';
  settings?: AppSettings;
  currentManager?: string;
  dismissedNotificationIds?: string[];
}
