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
  notes: string | null;
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
