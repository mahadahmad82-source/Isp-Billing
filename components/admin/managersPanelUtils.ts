import type { BusinessType } from '../../types';
import { supabase } from '../../lib/supabase';

// ── Row shape returned by supabase.rpc('get_admin_manager_stats_v2') ─────────
export interface ManagerRow {
  username: string;
  business_name: string;
  email: string;
  phone: string | null;
  role: string;
  joined_at: string;
  last_login: string;
  last_seen: string | null;
  user_count: number;
  receipt_count: number;
  active_count: number;
  expired_count: number;
  total_revenue: number;
  total_balance: number;
  data_updated_at: string | null;
  is_active: boolean;
  business_type: 'isp' | 'water';
}

export type ManagerFilter = 'all' | BusinessType;
export type SortKey = 'recent' | 'joined' | 'revenue' | 'customers';

export type Presence = 'online' | 'recent' | 'offline';

/** "Rs. 1,250,000" — thousands separators, no Intl currency symbol. */
export function formatRs(n: number | null | undefined): string {
  const v = safeInt(n);
  return 'Rs. ' + v.toLocaleString('en-US');
}

/** en-PK date/time, e.g. "3 Oct 2026, 4:31 pm". Invalid input => "—". */
export function formatEnPK(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  try {
    return d.toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return d.toLocaleString();
  }
}

/** Presence from last_seen: <5 min online, <60 min recent, otherwise offline. */
export function presenceOf(lastSeen: string | null | undefined, nowMs?: number): Presence {
  if (!lastSeen) return 'offline';
  const seen = new Date(lastSeen).getTime();
  if (Number.isNaN(seen)) return 'offline';
  const diff = (nowMs ?? Date.now()) - seen;
  if (diff < 0) return 'offline';
  if (diff < 5 * 60 * 1000) return 'online';
  if (diff < 60 * 60 * 1000) return 'recent';
  return 'offline';
}

export function presenceLabel(p: Presence): string {
  return p === 'online' ? 'Online' : p === 'recent' ? 'Recent' : 'Offline';
}

/** Never fail silently: RPC transport error first, then the { success, error } payload. */
export function extractRpcError(error: unknown, data: unknown): string {
  const transport = (error as { message?: string } | null)?.message;
  if (transport) return transport;
  if (data && typeof data === 'object' && 'error' in data) {
    const e = (data as { error?: unknown }).error;
    if (typeof e === 'string' && e) return e;
  }
  return 'Request failed. Try again.';
}

export function safeInt(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? Math.trunc(v) : 0;
}

/**
 * Destructive RPCs (delete / password reset) need a live admin session.
 * Returns an error message, or null when the session is fine.
 */
export async function checkAdminSession(): Promise<string | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return 'Admin session expired. Log out and log back in, then try again.';
    return null;
  } catch {
    return 'Could not verify admin session. Try again.';
  }
}
