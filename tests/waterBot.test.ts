import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectWaterIntent, parseQty, normalizeWaterText } from '../lib/waterBot/intents';
import { handleWaterText, last10, type WaterDeps, type WaterTenant } from '../lib/waterBot/handler';
import { tryHandleTenantWebhook } from '../lib/waterBot/dispatcher';
import { verifyMetaSignature, escapeUnicode, hmac } from '../lib/waterBot/signature';
import { balanceText, bottlesOutText, statusText } from '../lib/waterBot/replies';

const I = (t: string) => detectWaterIntent(t).intent;

test('intents: orders (Roman Urdu / English / Urdu script)', () => {
  assert.deepEqual(detectWaterIntent('2 bottle bhej do'), { intent: 'order', qty: 2 });
  assert.deepEqual(detectWaterIntent('teen bottle chahiye'), { intent: 'order', qty: 3 });
  assert.deepEqual(detectWaterIntent('Aaj 4 botal bhijwa dein'), { intent: 'order', qty: 4 });
  assert.deepEqual(detectWaterIntent('please send 5 bottles'), { intent: 'order', qty: 5 });
  assert.deepEqual(detectWaterIntent('\u06f3 \u0628\u0648\u062a\u0644 \u0628\u06be\u06cc\u062c \u062f\u0648'), { intent: 'order', qty: 3 });
  assert.equal(I('pani bhej do'), 'order');
});

test('intents: negations and complaints are NOT orders', () => {
  for (const t of ['order cancel', 'aaj bottle nahi chahiye', 'mat bhejna', 'rehne do', 'cancel kar do']) assert.equal(I(t), 'cancel_order', t);
  for (const t of ['bottle nahi aayi', 'pani ganda hai', 'bottle leak kar rahi thi', 'delivery late hai', 'bottle nahi mili']) assert.equal(I(t), 'complaint', t);
});

test('intents: money / stock / status / small talk', () => {
  for (const t of ['hisaab batao', 'mera bill kitna hai', 'kitne paise baqi hain', 'balance']) assert.equal(I(t), 'balance', t);
  for (const t of ['kitni bottles mere pas hain', 'khali bottle kitni hain']) assert.equal(I(t), 'bottles_out', t);
  for (const t of ['bottle kab aayegi', 'mera order kahan hai', 'aaj aayegi?']) assert.equal(I(t), 'order_status', t);
  assert.equal(I('assalam o alaikum'), 'greeting');
  assert.equal(I('shukriya'), 'thanks');
  assert.equal(I('menu'), 'menu');
  assert.equal(I('kya haal hai'), 'unknown');
  assert.equal(I(''), 'unknown');
});

test('qty parsing: limits and words', () => {
  assert.equal(parseQty('3 bottle'), 3);
  assert.equal(parseQty('paanch bottle'), 5);
  assert.equal(parseQty('500 bottle'), null);          // never auto-accept huge numbers
  assert.equal(parseQty('bottle'), null);
  assert.equal(parseQty('bottle bhej do'), null);       // "do" = send, NOT two
  assert.equal(parseQty('pani bhej do'), null);
  assert.equal(parseQty('do bottle bhej do'), 2);
  assert.equal(normalizeWaterText('\u0663 Bottle!!'), '3 bottle');
});

const tenant: WaterTenant = { manager_id: 'sup1', business_type: 'water', access_token: 'tok', bot_name: 'Pani Bot', business_name: 'Ali Water' };
const baseCtx = {
  found: true, matches: 1, customer: { id: 'c1', name: 'Ahmed Khan', status: 'active' },
  settings: { rate_per_bottle: 120, usual_bottles: 2 },
  ledger: { bottles_out: 4, billed: 600, collected_on_delivery: 100, last_delivery_date: '2026-10-03' },
  payments: 60, today_order: null, today_delivered: 0,
};
function fakeDeps(ctx: any = baseCtx) {
  const calls: Array<{ fn: string; args: any }> = []; const sent: string[] = []; const pushes: string[] = [];
  const deps: WaterDeps = {
    rpc: async (fn, args) => {
      calls.push({ fn, args });
      if (fn === 'water_bot_context') return ctx;
      if (fn === 'water_bot_set_order') return { success: true, action: 'created', qty: args.p_qty };
      if (fn === 'water_bot_cancel_order') return { success: true, cancelled: 1, already_planned: 0 };
      return { success: true };
    },
    send: async (_to, body) => { sent.push(body); },
    notify: async (_m, title) => { pushes.push(title); },
  };
  return { deps, calls, sent, pushes };
}

test('handler: order creates exactly one RPC order with idempotency key and notifies supplier', async () => {
  const f = fakeDeps();
  const r = await handleWaterText(f.deps, tenant, '923001234567', '3 bottle bhej do', 'wamid.1');
  assert.equal(r.intent, 'order');
  const o = f.calls.find(c => c.fn === 'water_bot_set_order')!;
  assert.deepEqual(o.args, { p_manager: 'sup1', p_customer: 'c1', p_qty: 3, p_wamid: 'wamid.1' });
  assert.match(f.sent[0], /3 bottle ka order/);
  assert.deepEqual(f.pushes, ['New water order']);
  assert.equal(f.calls.find(c => c.fn === 'water_bot_context')!.args.p_phone10, '3001234567');
});

test('handler: order without qty asks (never guesses); "roz ki tarah" uses usual qty; 500 is refused', async () => {
  let f = fakeDeps();
  await handleWaterText(f.deps, tenant, '923001234567', 'pani bhej do', 'w2');
  assert.equal(f.calls.some(c => c.fn === 'water_bot_set_order'), false);
  assert.match(f.sent[0], /Kitni bottles/);
  f = fakeDeps();
  await handleWaterText(f.deps, tenant, '923001234567', 'roz ki tarah bottle bhej do', 'w3');
  assert.equal(f.calls.find(c => c.fn === 'water_bot_set_order')!.args.p_qty, 2);
  f = fakeDeps();
  await handleWaterText(f.deps, tenant, '923001234567', '500 bottle bhej do', 'w4');
  assert.equal(f.calls.some(c => c.fn === 'water_bot_set_order'), false);
  assert.match(f.sent[0], /zyada bottles/);
});

test('handler: balance/bottles/status come only from DB numbers', async () => {
  const f = fakeDeps();
  await handleWaterText(f.deps, tenant, '923001234567', 'hisaab', 'w5');
  assert.match(f.sent[0], /Total bill: Rs\. 600/); assert.match(f.sent[0], /Ada kiya: Rs\. 160/); assert.match(f.sent[0], /Baqaya: Rs\. 440/);
  assert.match(bottlesOutText(baseCtx as any), /4 bottles/);
  assert.match(statusText({ ...baseCtx, today_order: { id: 'o', qty: 3, status: 'planned' } } as any), /route par lag chuka/);
  assert.match(balanceText({ found: true, ledger: null, payments: 0 } as any, 'X'), /koi delivery ya payment darj nahi/);
});

test('balance includes opening balance', async () => {
  const f = fakeDeps({ ...baseCtx, settings: { rate_per_bottle: 120, usual_bottles: 2, opening_balance: 1000 } });
  await handleWaterText(f.deps, tenant, '923001234567', 'hisaab', 'wo1');
  assert.match(f.sent[0], /Pichla baqaya: Rs\. 1,000/); assert.match(f.sent[0], /Baqaya: Rs\. 1,440/);
  assert.match(balanceText({ found: true, ledger: { bottles_out: 0, billed: 0, collected_on_delivery: 0, last_delivery_date: null }, settings: { rate_per_bottle: 0, usual_bottles: 1, opening_balance: 500 }, payments: 0 } as any, 'X'), /Baqaya: Rs\. 500/);
});

test('handler: unknown number is logged, never creates an order, supplier notified', async () => {
  const f = fakeDeps({ found: false });
  const r = await handleWaterText(f.deps, tenant, '923009999999', '2 bottle bhej do', 'w6');
  assert.equal(r.intent, 'unknown_customer');
  assert.equal(f.calls.some(c => c.fn === 'water_bot_set_order'), false);
  assert.equal(f.calls.find(c => c.fn === 'water_bot_log_message')!.args.p_kind, 'unknown_customer');
});

test('handler: complaint and unknown text are forwarded to supplier inbox, no LLM', async () => {
  let f = fakeDeps();
  await handleWaterText(f.deps, tenant, '923001234567', 'bottle leak thi', 'w7');
  assert.equal(f.calls.find(c => c.fn === 'water_bot_log_message')!.args.p_kind, 'complaint');
  f = fakeDeps();
  await handleWaterText(f.deps, tenant, '923001234567', 'kya haal hai', 'w8');
  assert.equal(f.calls.find(c => c.fn === 'water_bot_log_message')!.args.p_kind, 'message');
});

test('handler: DB failure replies politely and does not throw', async () => {
  const deps: WaterDeps = { rpc: async () => { throw new Error('db down'); }, send: async () => {}, notify: async () => {} };
  const r = await handleWaterText(deps, tenant, '923001234567', 'hisaab', 'w9');
  assert.equal(r.intent, 'error');
});

test('phone rule: last 10 digits', () => { assert.equal(last10('+92 300-1234567'), '3001234567'); assert.equal(last10('03001234567'), '3001234567'); });

test('signature: plain, unicode-escaped and wrong', () => {
  const body = { a: 'hello', b: '\u0627\u0631\u062f\u0648' };
  const secret = 's3cret';
  assert.equal(verifyMetaSignature(body, hmac(secret, JSON.stringify(body)), secret), true);
  assert.equal(verifyMetaSignature(body, hmac(secret, escapeUnicode(JSON.stringify(body))), secret), true);
  assert.equal(verifyMetaSignature(body, hmac('other', JSON.stringify(body)), secret), false);
  assert.equal(verifyMetaSignature(body, undefined, secret), false);
});

// ---- dispatcher: the isolation guarantees ----
const payload = (pnid: string, text = '2 bottle bhej do') => ({ entry: [{ changes: [{ value: { metadata: { phone_number_id: pnid }, messages: [{ from: '923001234567', id: 'wamid.X', type: 'text', text: { body: text } }] } }] }] });
const mkRes = () => { const r: any = { code: 0, body: null }; r.status = (c: number) => { r.code = c; return r; }; r.json = (b: any) => { r.body = b; return r; }; return r; };
const memCache = () => { const m = new Map<string, any>(); return { get: async (k: string) => m.get(k) ?? null, set: async (k: string, v: any) => { m.set(k, v); } }; };

test('dispatcher: ISP own number is never touched (returns false, no RPC)', async () => {
  let rpcCalls = 0;
  const handled = await tryHandleTenantWebhook({ body: payload('MAIN'), headers: {} }, mkRes(), { supabaseUrl: 'x', serviceKey: 'y', mainPhoneNumberId: 'MAIN', rpc: async () => { rpcCalls++; return null; }, cache: memCache() });
  assert.equal(handled, false); assert.equal(rpcCalls, 0);
});

test('dispatcher: ISP tenant / unknown number / resolve error all fall through to ISP flow', async () => {
  for (const rpc of [async () => ({ business_type: 'isp' }), async () => null, async () => { throw new Error('boom'); }]) {
    const res = mkRes();
    const handled = await tryHandleTenantWebhook({ body: payload('OTHER'), headers: {} }, res, { supabaseUrl: 'x', serviceKey: 'y', mainPhoneNumberId: 'MAIN', rpc: rpc as any, cache: memCache() });
    assert.equal(handled, false); assert.equal(res.code, 0);
  }
  assert.equal(await tryHandleTenantWebhook({ body: {}, headers: {} }, mkRes(), { supabaseUrl: 'x', serviceKey: 'y', mainPhoneNumberId: 'MAIN' }), false);
});

test('dispatcher: water tenant message is handled once, 200 returned, Meta retry deduped', async () => {
  const sent: string[] = []; const fns: string[] = [];
  const rpc = async (fn: string, args: any) => {
    fns.push(fn);
    if (fn === 'water_bot_resolve_tenant') return tenant;
    if (fn === 'water_bot_context') return baseCtx;
    if (fn === 'water_bot_set_order') return { success: true, action: 'created', qty: args.p_qty };
    return { success: true };
  };
  const cache = memCache();
  const opts = { supabaseUrl: 'x', serviceKey: 'y', mainPhoneNumberId: 'MAIN', rpc: rpc as any, cache, enforceSignature: false, sendWith: async (_t: any, _p: string, _to: string, b: string) => { sent.push(b); }, notify: async () => {} };
  const res = mkRes();
  assert.equal(await tryHandleTenantWebhook({ body: payload('WATER1'), headers: {} }, res, opts), true);
  assert.equal(res.code, 200); assert.equal(sent.length, 1); assert.equal(fns.filter(f => f === 'water_bot_set_order').length, 1);
  const res2 = mkRes();
  assert.equal(await tryHandleTenantWebhook({ body: payload('WATER1'), headers: {} }, res2, opts), true);
  assert.equal(sent.length, 1, 'same wamid must not be answered twice');
});

test('dispatcher: enforced signature rejects forged water traffic; never leaks to ISP flow', async () => {
  const rpc = async (fn: string) => (fn === 'water_bot_resolve_tenant' ? { ...tenant, app_secret: 'sec' } : { success: true });
  const res = mkRes(); const sent: string[] = [];
  const handled = await tryHandleTenantWebhook({ body: payload('WATER1'), headers: { 'x-hub-signature-256': 'sha256=bad' } }, res,
    { supabaseUrl: 'x', serviceKey: 'y', mainPhoneNumberId: 'MAIN', rpc: rpc as any, cache: memCache(), enforceSignature: true, sendWith: async (_t, _p, _to, b) => { sent.push(b); } });
  assert.equal(handled, true); assert.equal(res.code, 401); assert.equal(sent.length, 0);
});

test('dispatcher: handler crash after routing still returns true + 200 (never falls into ISP bot)', async () => {
  const rpc = async (fn: string) => { if (fn === 'water_bot_resolve_tenant') return tenant; throw new Error('db down'); };
  const res = mkRes();
  const handled = await tryHandleTenantWebhook({ body: payload('WATER1'), headers: {} }, res, { supabaseUrl: 'x', serviceKey: 'y', mainPhoneNumberId: 'MAIN', rpc: rpc as any, cache: memCache(), sendWith: async () => {}, notify: async () => {} });
  assert.equal(handled, true); assert.equal(res.code, 200);
});
