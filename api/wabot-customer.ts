// api/wabot-customer.ts — looks up a customer's current billing snapshot (plan,
// monthly fee, pending dues, expiry date, last payment) by phone number, so the
// Wabot Android app (and WABotInbox) can auto-fill Meta-approved template amounts
// instead of mahadnet typing every value in by hand.
const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!; // service role — bypasses RLS, server-only, never exposed to browser

function normPhone(p: string | undefined | null): string {
  return (p || '').replace(/\D/g, '').slice(-10);
}

function formatDate(d: string | undefined | null): string {
  if (!d) return '';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '';
  const day = String(dt.getDate()).padStart(2, '0');
  const month = dt.toLocaleString('en-US', { month: 'short' });
  return `${day}-${month}-${dt.getFullYear()}`;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'GET or POST only' });
  const src = req.method === 'GET' ? req.query : req.body || {};
  const managerId = src.managerId || 'mahadnet';
  const phone = normPhone(src.phone);
  const username = (src.username || '').toString().trim().replace(/^@/, '').toLowerCase();
  if (!phone && !username) return res.status(400).json({ error: 'phone or username is required' });

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq.${managerId}&select=data`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const rows: any[] = await r.json();
    const data = rows?.[0]?.data;
    if (!data) return res.status(404).json({ found: false });

    const users: any[] = data.users || [];
    const user = users.find((u) => {
      if (username && (u?.username || '').toLowerCase() === username) return true;
      if (phone && (normPhone(u?.phone) === phone || normPhone(u?.phone2) === phone)) return true;
      return false;
    });
    if (!user) return res.status(200).json({ found: false });

    const receipts: any[] = data.receipts || [];
    const custReceipts = receipts
      .filter((rec) => normPhone(rec?.userPhone) === phone)
      .sort((a, b) => new Date(b?.date || 0).getTime() - new Date(a?.date || 0).getTime());
    const lastReceipt = custReceipts[0];

    const netFee = Math.max(0, (user.monthlyFee || 0) - (user.persistentDiscount || 0));
    const balance = user.balance || 0;

    return res.status(200).json({
      found: true,
      name: user.name || '',
      username: user.username || '',
      phone: user.phone || '',
      plan: user.plan || '',
      monthlyFee: user.monthlyFee || 0,
      netFee,
      balance,
      creditAmount: user.creditAmount || 0,
      expiryDateFormatted: formatDate(user.expiryDate),
      lastPaymentAmount: lastReceipt?.paidAmount ?? netFee,
      lastPaymentMethod: lastReceipt?.paymentMethod || '',
      lastReceiptBalance: lastReceipt?.balanceAmount ?? (balance > 0 ? balance : 0),
      lastReceiptAdvance: lastReceipt?.advanceAmount ?? (balance < 0 ? Math.abs(balance) : 0),
    });
  } catch (e: any) {
    console.error('[wabot-customer]', e?.message);
    return res.status(500).json({ error: e?.message || 'Unknown error' });
  }
}
