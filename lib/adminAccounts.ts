// Admin-only manager account creation (backend). Called from api/admin-maintenance.ts?action=admin-create-manager
// AFTER the caller was verified as an admin session. All privileged work happens here with the service role.
import type { SupabaseClient } from '@supabase/supabase-js';

export type CreateManagerInput = {
  username?: unknown; password?: unknown; business_name?: unknown; phone?: unknown;
  email?: unknown; cnic?: unknown; business_type?: unknown;
};

export interface CreateManagerResult { status: number; body: Record<string, unknown> }

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,39}$/;       // 3-40 chars; same charset as existing usernames (phones, "mahadnet")
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TYPES = ['isp', 'water'];

export function validateCreateManager(input: CreateManagerInput):
  { ok: true; v: { username: string; password: string; businessName: string; phone: string | null; email: string | null; cnic: string | null; businessType: 'isp' | 'water' } }
  | { ok: false; error: string } {
  const username = String(input.username ?? '').trim().toLowerCase();
  const password = String(input.password ?? '');
  const businessName = String(input.business_name ?? '').trim();
  const phoneRaw = String(input.phone ?? '').trim();
  const email = String(input.email ?? '').trim().toLowerCase();
  const cnic = String(input.cnic ?? '').replace(/\D/g, '');
  const businessType = String(input.business_type ?? '').trim();

  if (!USERNAME_RE.test(username)) return { ok: false, error: 'Username must be 3-40 characters: letters, digits, dot, dash or underscore (no spaces).' };
  if (password.length < 6 || password.length > 72) return { ok: false, error: 'Password must be 6-72 characters.' };
  if (businessName.length < 2 || businessName.length > 100) return { ok: false, error: 'Business name must be 2-100 characters.' };
  if (!TYPES.includes(businessType)) return { ok: false, error: 'Business type must be isp or water.' };
  if (phoneRaw && !/^[0-9+\-\s]{7,20}$/.test(phoneRaw)) return { ok: false, error: 'Phone number looks invalid.' };
  if (email && (!EMAIL_RE.test(email) || email.endsWith('@myisp.local'))) return { ok: false, error: 'Enter a valid real email address (or leave it empty).' };
  if (cnic && cnic.length !== 13) return { ok: false, error: 'CNIC must be 13 digits (or leave it empty).' };
  return { ok: true, v: { username, password, businessName, phone: phoneRaw || null, email: email || null, cnic: cnic || null, businessType: businessType as 'isp' | 'water' } };
}

export async function createManagerAccount(db: SupabaseClient, adminUserId: string, input: CreateManagerInput): Promise<CreateManagerResult> {
  const parsed = validateCreateManager(input);
  if ('error' in parsed) return { status: 400, body: { success: false, error: parsed.error } };
  const v = parsed.v;

  // Uniqueness (username, CNIC) before touching Auth
  const { data: taken } = await db.from('profiles').select('id').eq('username', v.username).limit(1);
  if (taken && taken.length) return { status: 409, body: { success: false, error: 'This username is already taken.' } };
  const { data: mdTaken } = await db.from('manager_data').select('manager_id').eq('manager_id', v.username).limit(1);
  if (mdTaken && mdTaken.length) return { status: 409, body: { success: false, error: 'This username is already in use by an existing account.' } };
  if (v.cnic) {
    const { data: cn } = await db.from('profiles').select('id').eq('cnic', v.cnic).limit(1);
    if (cn && cn.length) return { status: 409, body: { success: false, error: 'This CNIC is already registered.' } };
  }

  // Same identity rule as self-signup: real email if given, else the synthetic <username>@myisp.local
  const authEmail = v.email ?? `${v.username}@myisp.local`;
  const created = await db.auth.admin.createUser({
    email: authEmail, password: v.password, email_confirm: true,
    user_metadata: { full_name: v.businessName, phone: v.phone ?? v.username },
  });
  if (created.error || !created.data?.user) {
    const msg = created.error?.message || 'Could not create the login.';
    return { status: /already|registered|exists/i.test(msg) ? 409 : 500, body: { success: false, error: /already|registered|exists/i.test(msg) ? 'This email is already registered.' : msg } };
  }
  const userId = created.data.user.id;

  // The signup trigger creates the profile row; finish it. If anything fails, remove the login so nothing is half-created.
  const rollback = async (why: string, status = 500): Promise<CreateManagerResult> => {
    await db.auth.admin.deleteUser(userId).catch(() => null);
    return { status, body: { success: false, error: why } };
  };
  const { data: upd, error: upErr } = await db.from('profiles').update({
    username: v.username, full_name: v.businessName, phone: v.phone ?? v.username, cnic: v.cnic,
    role: 'manager', is_active: true, business_type: v.businessType, business_type_set: true,
  }).eq('id', userId).select('id');
  if (upErr) return rollback(/cnic|unique|duplicate/i.test(upErr.message) ? 'This CNIC or username is already registered.' : `Profile setup failed: ${upErr.message}`, /unique|duplicate/i.test(upErr.message) ? 409 : 500);
  if (!upd || !upd.length) return rollback('Profile row was not created by the signup trigger. Nothing was saved.');

  await db.from('admin_action_logs').insert({ admin_id: adminUserId, admin_username: null, action: `create_manager:${v.businessType}`, target_username: v.username }).then(() => null, () => null);
  return { status: 200, body: { success: true, username: v.username, user_id: userId, business_type: v.businessType, login_email: authEmail, uses_synthetic_email: !v.email } };
}
