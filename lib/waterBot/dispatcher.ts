// Isolated multi-tenant dispatcher for non-ISP WhatsApp numbers.
// api/webhook.ts calls tryHandleTenantWebhook() once, early. It returns true ONLY when the inbound
// message belongs to a WATER tenant's own WhatsApp number (and the response has been sent).
// In every other case (this bot's own number, ISP tenant, unknown number, any error before the decision)
// it returns false and the existing ISP flow runs exactly as before.
import { handleWaterText, type WaterDeps, type WaterTenant } from './handler.js';
import { unsupportedMediaText } from './replies.js';
import { verifyMetaSignature } from './signature.js';

export interface DispatchOpts {
  supabaseUrl: string;
  serviceKey: string;
  mainPhoneNumberId?: string;
  enforceSignature?: boolean;
  rpc?: WaterDeps['rpc'];
  sendWith?: (tenant: WaterTenant, pnid: string, to: string, body: string) => Promise<void>;
  notify?: WaterDeps['notify'];
  cache?: { get: (k: string) => Promise<any>; set: (k: string, v: any, ttl: number) => Promise<void> };
}

async function defaultCache() {
  const r = await import('../redis.js');
  return { get: (k: string) => r.redisGetJSON(k), set: (k: string, v: any, ttl: number) => r.redisSetJSON(k, v, ttl) };
}

export async function tryHandleTenantWebhook(req: any, res: any, opts: DispatchOpts): Promise<boolean> {
  const value = req?.body?.entry?.[0]?.changes?.[0]?.value;
  const pnid: string | undefined = value?.metadata?.phone_number_id;
  if (!pnid) return false;
  const main = opts.mainPhoneNumberId ?? process.env.PHONE_NUMBER_ID;
  if (main && pnid === main) return false;                       // ISP's own number: zero overhead, untouched

  const rpc: WaterDeps['rpc'] = opts.rpc ?? (async (fn, args) => {
    const r = await fetch(`${opts.supabaseUrl}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: opts.serviceKey, Authorization: `Bearer ${opts.serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!r.ok) throw new Error(`rpc ${fn} ${r.status}`);
    return r.json();
  });

  // ---- 1) routing decision (fail-safe: any problem => ISP flow) ----
  let tenant: WaterTenant | null = null;
  try {
    const cache = opts.cache ?? await defaultCache().catch(() => null);
    const cacheKey = `tenant_type:${pnid}`;
    const cached = cache ? await cache.get(cacheKey).catch(() => null) : null;
    if (cached === 'other') return false;                        // known non-water number
    const t = await rpc('water_bot_resolve_tenant', { p_phone_number_id: pnid });
    if (!t || t.business_type !== 'water') {
      if (cache) await cache.set(cacheKey, 'other', 120).catch(() => null);
      return false;
    }
    tenant = t as WaterTenant;
  } catch (e: any) {
    console.error('[tenant-dispatch] resolve failed -> ISP flow:', e?.message);
    return false;
  }

  // ---- 2) from here on this request belongs to the water bot: ALWAYS return true ----
  try {
    const secret = tenant.app_secret || process.env.META_APP_SECRET;
    const sigOk = verifyMetaSignature(req.body, req.headers?.['x-hub-signature-256'], secret);
    if (!sigOk) {
      console.warn('[water-bot] signature mismatch/missing for', tenant.manager_id);
      if (opts.enforceSignature ?? process.env.WATER_ENFORCE_SIGNATURE === '1') {
        res.status(401).json({ error: 'Invalid signature' });
        return true;
      }
    }

    const sendWith = opts.sendWith ?? (async (t: WaterTenant, id: string, to: string, body: string) => {
      const r = await fetch(`https://graph.facebook.com/v20.0/${id}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } }),
      });
      if (!r.ok) console.error('[water-bot] send failed', r.status, (await r.text()).slice(0, 200));
    });
    const notifyFn: WaterDeps['notify'] = opts.notify ?? (async (managerId, title, body) => {
      await fetch(`${opts.supabaseUrl}/functions/v1/send-push-notification`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manager_id: managerId, title, body, tag: 'water' }),
      }).catch(() => null);
    });
    const deps: WaterDeps = { rpc, notify: notifyFn, send: (to, body) => sendWith(tenant!, pnid, to, body) };

    const cache = opts.cache ?? await defaultCache().catch(() => null);
    const messages: any[] = value?.messages || [];
    for (const m of messages) {
      const from: string = m?.from;
      const wamid: string | null = m?.id || null;
      if (!from) continue;
      if (wamid && cache) {                                      // Meta retries: handle each message once
        const seen = await cache.get(`water_wamid:${wamid}`).catch(() => null);
        if (seen) continue;
        await cache.set(`water_wamid:${wamid}`, 1, 86400).catch(() => null);
      }
      if (m.type === 'text' && m.text?.body) {
        await handleWaterText(deps, tenant, from, String(m.text.body), wamid);
      } else {
        await deps.send(from, unsupportedMediaText());
      }
    }
  } catch (e: any) {
    console.error('[water-bot] handler error:', e?.message);
  }
  res.status(200).json({ status: 'water_handled' });             // 200 so Meta never retry-storms
  return true;
}
