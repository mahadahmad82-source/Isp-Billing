import { detectWaterIntent, normalizeWaterText, type WaterIntent } from './intents.js';
import {
  type WaterCtx, menuText, unknownCustomerText, askQtyText, tooManyText, thanksText, complaintText,
  unknownText, orderText, cancelText, balanceText, bottlesOutText, statusText,
} from './replies.js';

export interface WaterTenant {
  manager_id: string;
  business_type: string;
  access_token: string;
  app_secret?: string | null;
  bot_name: string;
  business_name: string;
}

export interface WaterDeps {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<any>;
  send: (to: string, body: string) => Promise<void>;
  notify: (managerId: string, title: string, body: string) => Promise<void>;
}

// Phone matching rule (project-wide): compare the LAST 10 digits.
export const last10 = (p: string): string => (p || '').replace(/\D/g, '').slice(-10);

const USUAL_WORDS = ['hamesha', 'roz', 'aam', 'usual', 'always', 'daily', 'routine', 'wohi', 'wahi'];

export interface WaterResult { intent: WaterIntent | 'unknown_customer' | 'error'; reply: string }

export async function handleWaterText(deps: WaterDeps, tenant: WaterTenant, from: string, text: string, wamid: string | null): Promise<WaterResult> {
  const mgr = tenant.manager_id;
  const biz = tenant.business_name;
  const bot = tenant.bot_name;
  const log = (customerId: string | null, kind: 'complaint' | 'message' | 'unknown_customer') =>
    deps.rpc('water_bot_log_message', { p_manager: mgr, p_customer: customerId, p_phone: from, p_kind: kind, p_body: text, p_wamid: wamid })
      .catch(() => null);

  let ctx: WaterCtx;
  try {
    ctx = await deps.rpc('water_bot_context', { p_manager: mgr, p_phone10: last10(from) });
  } catch (e) {
    const reply = 'Abhi system mein masla hai, thori der baad dobara koshish karein.';
    await deps.send(from, reply);
    return { intent: 'error', reply };
  }

  if (!ctx?.found || !ctx.customer) {
    await log(null, 'unknown_customer');
    await deps.notify(mgr, 'Unknown number messaged', `+${from}: ${text.slice(0, 80)}`).catch(() => null);
    const reply = unknownCustomerText(biz);
    await deps.send(from, reply);
    return { intent: 'unknown_customer', reply };
  }

  const cust = ctx.customer;
  const parsed = detectWaterIntent(text);
  let reply: string;

  switch (parsed.intent) {
    case 'order': {
      const norm = normalizeWaterText(text);
      let qty = parsed.qty;
      if (qty === null && USUAL_WORDS.some(w => norm.split(' ').includes(w)) && (ctx.settings?.usual_bottles || 0) > 0) {
        qty = ctx.settings!.usual_bottles;
      }
      if (qty === null && /(?:^|\s)\d{3,4}(?:\s|$)/.test(norm)) {      // e.g. "500 bottle" -> never auto-accept
        await log(cust.id, 'message');
        await deps.notify(mgr, 'Large order request', `${cust.name || from}: ${text.slice(0, 80)}`).catch(() => null);
        reply = tooManyText();
        break;
      }
      if (qty === null) {
        const usual = ctx.settings?.usual_bottles || 0;
        reply = usual > 0 ? `${askQtyText()} (Aap ki aam tadad: ${usual})` : askQtyText();
        break;
      }
      const r = await deps.rpc('water_bot_set_order', { p_manager: mgr, p_customer: cust.id, p_qty: qty, p_wamid: wamid });
      if (!r?.success) {
        await log(cust.id, 'message');
        reply = 'Abhi order note nahi ho saka. Aap ka paigham supplier tak pohancha diya gaya hai, woh rabta karenge.';
        break;
      }
      reply = orderText(cust, r.action, r.qty ?? qty, r.previous_qty);
      if (r.action !== 'duplicate') {
        await deps.notify(mgr, 'New water order', `${cust.name || from}: ${r.qty ?? qty} bottle (aaj)`).catch(() => null);
      }
      break;
    }
    case 'cancel_order': {
      const r = await deps.rpc('water_bot_cancel_order', { p_manager: mgr, p_customer: cust.id });
      reply = cancelText({ cancelled: Number(r?.cancelled || 0), already_planned: Number(r?.already_planned || 0) });
      if (Number(r?.cancelled || 0) > 0) await deps.notify(mgr, 'Order cancelled', `${cust.name || from} ne aaj ka order cancel kiya`).catch(() => null);
      break;
    }
    case 'balance': reply = balanceText(ctx, biz); break;
    case 'bottles_out': reply = bottlesOutText(ctx); break;
    case 'order_status': reply = statusText(ctx); break;
    case 'complaint':
      await log(cust.id, 'complaint');
      await deps.notify(mgr, 'Customer complaint', `${cust.name || from}: ${text.slice(0, 100)}`).catch(() => null);
      reply = complaintText();
      break;
    case 'thanks': reply = thanksText(); break;
    case 'greeting':
    case 'menu': reply = menuText(biz, bot, (cust.name || '').trim().split(/\s+/)[0] || undefined); break;
    default:
      await log(cust.id, 'message');
      await deps.notify(mgr, 'Customer message', `${cust.name || from}: ${text.slice(0, 100)}`).catch(() => null);
      reply = unknownText(biz, bot);
  }

  await deps.send(from, reply);
  return { intent: parsed.intent, reply };
}
