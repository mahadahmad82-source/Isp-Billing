// api/admin-add-client-token.ts
// Admin-only endpoint: receive ISP manager's Meta token → test connection → encrypt → upsert whatsapp_configs
// Auth: Authorization: Bearer <CRON_SECRET>  (same secret as all other admin crons)

import { encryptToken } from '../lib/whatsappCrypto';

const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const QUOTA_MAP: Record<string, number> = {
  basic:     1000,
  pro:       5000,
  unlimited: 15000,
  text_only: 1000,
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Admin auth guard
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers['authorization'] || '';
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { manager_id, waba_id, phone_number_id, access_token, plan_type } = req.body || {};

  if (!manager_id || !waba_id || !phone_number_id || !access_token) {
    return res.status(400).json({
      error: 'Missing required fields',
      required: ['manager_id', 'waba_id', 'phone_number_id', 'access_token'],
    });
  }

  // ── 1. Test token against Meta /me ───────────────────────────────────────
  let tokenStatus: 'active' | 'invalid' = 'invalid';
  let metaUserId: string | null = null;
  try {
    const metaRes  = await fetch(
      `https://graph.facebook.com/v20.0/me?access_token=${access_token}&fields=id,name`
    );
    const metaData = await metaRes.json();
    if (metaRes.ok && metaData?.id) {
      tokenStatus = 'active';
      metaUserId  = metaData.id;
      console.log(`[add-client-token] Meta OK manager=${manager_id} fb_id=${metaData.id} name=${metaData.name}`);
    } else {
      console.error('[add-client-token] Meta test failed:', JSON.stringify(metaData).slice(0, 200));
    }
  } catch (e: any) {
    console.error('[add-client-token] Meta fetch error:', e?.message);
  }

  // ── 2. Encrypt token ─────────────────────────────────────────────────────
  let encryptedToken: string;
  try {
    encryptedToken = encryptToken(access_token);
  } catch (e: any) {
    return res.status(500).json({ error: 'Encryption failed: ' + e?.message });
  }

  // ── 3. Compute quota + cycle dates ───────────────────────────────────────
  const resolvedPlan   = plan_type || 'basic';
  const message_quota  = QUOTA_MAP[resolvedPlan] ?? 1000;
  const now            = new Date();
  const cycleStart     = now.toISOString().split('T')[0];
  const cycleEndDate   = new Date(now);
  cycleEndDate.setDate(cycleEndDate.getDate() + 29); // 30-day cycle
  const cycleEnd       = cycleEndDate.toISOString().split('T')[0];

  // ── 4. Upsert to whatsapp_configs ────────────────────────────────────────
  try {
    const upsertRes = await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_configs`, {
      method: 'POST',
      headers: {
        apikey:         SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer:         'resolution=merge-duplicates,return=representation',
      },
      body: JSON.stringify({
        manager_id,
        waba_id,
        phone_number_id,
        access_token:             encryptedToken,
        token_status:             tokenStatus,
        plan_type:                resolvedPlan,
        message_quota,
        messages_used_this_cycle: 0,
        cycle_start_date:         cycleStart,
        cycle_end_date:           cycleEnd,
        service_status:           'trial',
        last_token_check:         now.toISOString(),
      }),
    });

    if (!upsertRes.ok) {
      const err = await upsertRes.text();
      console.error('[add-client-token] Supabase upsert failed:', err);
      return res.status(500).json({ error: 'DB upsert failed', detail: err });
    }

    return res.status(200).json({
      success:          true,
      manager_id,
      token_status:     tokenStatus,
      meta_user_id:     metaUserId,
      plan_type:        resolvedPlan,
      message_quota,
      cycle_start_date: cycleStart,
      cycle_end_date:   cycleEnd,
    });
  } catch (e: any) {
    return res.status(500).json({ error: 'Unexpected error: ' + e?.message });
  }
}
