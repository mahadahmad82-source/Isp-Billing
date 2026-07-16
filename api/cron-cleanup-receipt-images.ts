// api/cron-cleanup-receipt-images.ts — Deletes old receipt PNGs from Supabase Storage
// (whatsapp-media bucket) to keep file storage usage bounded. Every receipt auto-stores
// a PNG (see ReceiptGenerator.tsx → generateAndStoreReceiptImage) so WABot can instantly
// share it when a customer asks — but keeping every receipt image forever would eventually
// hit Supabase's file storage limit. Receipt requests almost always happen within days/weeks
// of payment, so images older than RETENTION_DAYS are safe to delete: the customer can still
// get their receipt via WABot's text-summary fallback (see webhook.ts receipt_request →
// receipt_not_available), just not as an image.
//
// Triggered weekly by Vercel Cron (see vercel.json).

const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!; // service role — bypasses RLS, server-only
const RETENTION_DAYS = 60; // keep receipt images for 2 months; adjust as needed
const BUCKET = 'whatsapp-media';

export default async function handler(req: any, res: any) {
  const auth = req.headers?.authorization;
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/manager_data?select=manager_id,data`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    const rows: any[] = await resp.json();

    const cutoff = Date.now() - RETENTION_DAYS * 86400000;
    let totalDeleted = 0;
    let totalChecked = 0;

    for (const row of rows) {
      if (row.manager_id === '_bot_sessions') continue;
      const data = row.data || {};
      const receipts: any[] = data.receipts || [];
      const pathsToDelete: string[] = [];
      let changed = false;

      for (const r of receipts) {
        if (!r.receiptImageUrl) continue;
        totalChecked++;
        const receiptTime = r.date ? new Date(r.date).getTime() : 0;
        if (!receiptTime || receiptTime > cutoff) continue; // recent — keep

        // Extract storage path from the public URL:
        // {SUPABASE_URL}/storage/v1/object/public/{bucket}/{path}
        const marker = `/storage/v1/object/public/${BUCKET}/`;
        const idx = (r.receiptImageUrl as string).indexOf(marker);
        if (idx === -1) continue;
        const path = (r.receiptImageUrl as string).slice(idx + marker.length);
        pathsToDelete.push(path);
        r.receiptImageUrl = undefined;
        changed = true;
      }

      if (pathsToDelete.length > 0) {
        try {
          const delResp = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}`, {
            method: 'DELETE',
            headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ prefixes: pathsToDelete }),
          });
          if (delResp.ok) totalDeleted += pathsToDelete.length;
          else console.error('❌ Storage delete failed:', delResp.status, await delResp.text().catch(() => ''));
        } catch (e: any) {
          console.error('❌ Storage delete error:', e?.message);
        }
      }

      if (changed) {
        await fetch(`${SUPABASE_URL}/rest/v1/manager_data?manager_id=eq.${row.manager_id}`, {
          method: 'PATCH',
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ data: { ...data, receipts } }),
        });
      }
    }

    console.log(`✅ Receipt image cleanup: checked=${totalChecked} deleted=${totalDeleted}`);
    return res.status(200).json({ status: 'ok', checked: totalChecked, deleted: totalDeleted, retentionDays: RETENTION_DAYS });
  } catch (e: any) {
    console.error('❌ cron-cleanup-receipt-images:', e?.message);
    return res.status(500).json({ error: e?.message });
  }
}
