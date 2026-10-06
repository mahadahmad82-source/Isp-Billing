// Water module shared types. Mirrors the DB CONTRACT from the prompt pack:
// RLS enforces everything, client only sends its own manager_id (= username).

/** Customer shape passed into the water module (from app state). */
export interface WaterCustomer {
  id: string;
  name: string;
  phone: string;
  address: string;
  area?: string;
  status: string;
}

export interface WaterVehicle {
  id: string;
  manager_id: string;
  name: string;
  plate: string | null;
  vehicle_type: string; /* 'bike' | 'rickshaw' | 'van' | 'truck' */
  capacity: number | null;
  is_active: boolean;
  created_at: string;
}

export interface WaterRoute {
  id: string;
  manager_id: string;
  name: string;
  area: string | null;
  days: number[]; /* 0=Sun..6=Sat */
  stops: string[]; /* ORDERED customer ids (UserRecord.id) */
  is_active: boolean;
  created_at: string;
}

export interface WaterDailyPlan {
  id: string;
  manager_id: string;
  plan_date: string; /* 'YYYY-MM-DD' */
  route_id: string;
  vehicle_id: string | null;
  rider_username: string | null;
  loaded_bottles: number;
  returned_bottles: number | null;
  status: 'planned' | 'in_progress' | 'closed';
  notes: string | null;
  created_at: string;
}

export interface WaterDelivery {
  id: string;
  manager_id: string;
  plan_id: string | null;
  delivery_date: string;
  customer_id: string;
  rider_username: string | null;
  vehicle_id: string | null;
  bottles_delivered: number;
  empties_returned: number;
  amount_collected: number;
  rate_per_bottle: number | null;
  note: string | null;
  source: 'app' | 'paper' | 'manager';
  client_ref: string | null;
  created_at: string;
  voided_at: string | null;
  void_reason: string | null;
}

export interface WaterCustomerSettings {
  id: string;
  manager_id: string;
  customer_id: string;
  rate_per_bottle: number;
  usual_bottles: number;
  deposit_amount: number;
  opening_balance: number; /* purana udhaar jab supplier ne app shuru ki (positive = customer ne dena hai) */
  billing_mode: 'daily' | 'monthly'; /* daily = har delivery par paisa/receipt, monthly = mahine ka bill */
  notes: string | null;
}

/* ── M6a: water-first navigation ── */

/** WaterHub sub-tabs (mirrors WaterHub's internal SubTab). */
export type WaterSubTab = 'today' | 'orders' | 'routes' | 'vehicles' | 'customers' | 'ledger' | 'inbox';

/** One-shot form actions a WaterNavRequest can trigger after switching sub-tab. */
export type WaterNavAction = 'add-customer' | 'new-plan' | 'add-order' | 'record-payment';

/**
 * A navigation request into WaterHub (e.g. from WaterDashboard quick actions).
 * Passed as a prop; WaterHub consumes it and notifies the parent.
 */
export interface WaterNavRequest {
  sub: WaterSubTab;
  /** Open this customer's ledger sheet after switching to the ledger sub-tab. */
  customerId?: string;
  /** Extra action once the sub-tab is open (e.g. open the add-customer form). */
  action?: WaterNavAction;
}

/* ── W3 interfaces ── */

export interface WaterOrder {
  id: string;
  manager_id: string;
  customer_id: string;
  qty: number;
  delivery_date: string;
  status: 'new' | 'planned' | 'delivered' | 'cancelled';
  source: 'whatsapp' | 'manager' | 'app';
  note: string | null;
  created_at: string;
}

export interface WaterPayment {
  id: string;
  manager_id: string;
  customer_id: string;
  pay_date: string;
  amount: number;
  method: 'cash' | 'jazzcash' | 'easypaisa' | 'bank' | 'other';
  note: string | null;
  client_ref: string | null;
  created_at: string;
  voided_at: string | null;
  void_reason: string | null;
}

export interface WaterInboxItem {
  id: string;
  manager_id: string;
  customer_id: string | null;
  phone: string;
  kind: 'complaint' | 'message' | 'unknown_customer';
  body: string;
  handled: boolean;
  created_at: string;
}

export interface WaterLedgerRow {
  manager_id: string;
  customer_id: string;
  bottles_out: number;
  billed: number;
  collected_on_delivery: number;
  payments: number;
  balance_due: number;
  opening_balance: number;
  last_delivery_date: string | null;
  last_payment_date: string | null;
}

export interface WaterPeriodRow {
  customer_id: string;
  bottles_delivered: number;
  empties_returned: number;
  billed: number;
  collected: number;
  payments: number;
  delivery_days: number;
}

export const VEHICLE_TYPES = ['bike', 'rickshaw', 'van', 'truck'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  bike: 'Bike',
  rickshaw: 'Rickshaw',
  van: 'Van',
  truck: 'Truck',
};

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Mon Wed Fri" summary, or "Daily" / "No days". */
export function daysSummary(days: number[] | null | undefined): string {
  const ds = (days || []).filter(d => d >= 0 && d <= 6).sort((a, b) => a - b);
  if (ds.length === 0) return 'No days';
  if (ds.length === 7) return 'Daily';
  return ds.map(d => DAY_SHORT[d]).join(' ');
}

/* ── water_route_sheet RPC result (W2) ── */

export interface WaterRouteSheetStop {
  position: number;
  customer_id: string;
  name: string | null;
  phone: string | null;
  address: string | null;
  area: string | null;
  usual_bottles: number;
  rate_per_bottle: number;
  bottles_out: number;
  delivered_today: number;
  done: boolean;
  pending_order_qty: number | null;
}

export interface WaterRouteSheet {
  plan: {
    id: string;
    date: string;
    status: string;
    loaded_bottles: number;
    returned_bottles: number | null;
    rider: string | null;
  };
  route: { id: string; name: string; area: string | null };
  vehicle: { id: string; name: string; plate: string | null; type: string } | null;
  stops: WaterRouteSheetStop[];
}

/** 'YYYY-MM-DD' in local timezone (for DB plan_date). */
export function toISODate(d: Date): string {
  return d.toLocaleDateString('en-CA');
}

/** en-PK display for a 'YYYY-MM-DD' date, e.g. "Sat, 4 Oct". */
export function formatDayPK(iso: string): string {
  const d = new Date(iso + 'T00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-PK', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** Today's date in Pakistan time (Asia/Karachi) as 'YYYY-MM-DD'. */
export function todayKarachi(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' });
}

/** "Rs. 1,250,000" — thousands separators. Negative => caller decides (see formatDue). */
export function formatRs(n: number | null | undefined): string {
  const v = Number.isFinite(n) ? Math.trunc(n as number) : 0;
  return 'Rs. ' + Math.abs(v).toLocaleString('en-US');
}

/** Balance display: positive => "Rs. X", negative => "Advance Rs. X", zero => "Rs. 0". */
export function formatDue(balanceDue: number | null | undefined): string {
  const v = Number.isFinite(balanceDue) ? Math.trunc(balanceDue as number) : 0;
  if (v < 0) return 'Advance Rs. ' + Math.abs(v).toLocaleString('en-US');
  return 'Rs. ' + v.toLocaleString('en-US');
}

/** Digits only, no leading +. */
export function digitsOnly(phone: string | null | undefined): string {
  return (phone || '').replace(/\D/g, '');
}

/** wa.me number: last 10 digits + 92 prefix (Pakistan mobiles). */
export function waNumber92(phone: string | null | undefined): string {
  const d = digitsOnly(phone);
  if (!d) return '';
  return '92' + d.slice(-10);
}
