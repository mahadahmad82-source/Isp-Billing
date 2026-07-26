// api/cron-monthly-quota-reset.ts
// Runs daily. Finds whatsapp_configs whose cycle_end_date has passed,
// resets messages_used_this_cycle to 0, and rolls the cycle window forward by 30 days.
// Vercel cron: "0 0 * * *" (midnight UTC)

const SUPABASE_URL = 'https://mzmajmjzopmkzboizrbm.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(req: any, res: any) {
  // Vercel cron calls with Authorization header containing CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers['authorization'] !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

  // Find all active/trial configs whose cycle has ended
  let rows: any[] = [];
  try {
    const fetchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/whatsapp_configs?cycle_end_date=lte.${today}&service_status=in.(active,trial)&select=manager_id,cycle_end_date,messages_used_this_cycle,message_quota`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    rows = await fetchRes.json();
  } catch (e: any) {
    console.error('[quota-reset] fetch failed:', e?.message);
    return res.status(500).json({ error: e?.message });
  }

  if (!rows.length) {
    return res.status(200).json({ reset: 0, message: 'No configs due for reset today' });
  }

  let reset = 0;
  const details: any[] = [];

  for (const row of rows) {
    // Roll cycle forward 30 days from the day AFTER current cycle_end_date
    const prevEnd  = new Date(row.cycle_end_date);
    const newStart = new Date(prevEnd);
    newStart.setDate(newStart.getDate() + 1);
    const newEnd = new Date(newStart);
    newEnd.setDate(newEnd.getDate() + 29); // 30-day window

    const newStartStr = newStart.toISOString().split('T')[0];
    const newEndStr   = newEnd.toISOString().split('T')[0];

    try {
      const patchRes = await fetch(
        `${SUPABASE_URL}/rest/v1/whatsapp_configs?manager_id=eq.${row.manager_id}`,
        {
          method: 'PATCH',
          headers: {
            apikey:         SUPABASE_KEY,
            Authorization: `Bearer ${SUPABASE_KEY}`,
            'Content-Type': 'application/json',
            Prefer:         'return=minimal',
          },
          body: JSON.stringify({
            messages_used_this_cycle: 0,
            cycle_start_date:         newStartStr,
            cycle_end_date:           newEndStr,
          }),
        }
      );

      if (patchRes.ok) {
        reset++;
        console.log(`[quota-reset] ✅ manager=${row.manager_id} was ${row.messages_used_this_cycle}/${row.message_quota} → reset. New cycle ${newStartStr}→${newEndStr}`);
        details.push({ manager_id: row.manager_id, prev_used: row.messages_used_this_cycle, new_cycle_start: newStartStr, new_cycle_end: newEndStr });
      } else {
        const err = await patchRes.text();
        console.error(`[quota-reset] ❌ manager=${row.manager_id}:`, err);
        details.push({ manager_id: row.manager_id, error: err });
      }
    } catch (e: any) {
      console.error(`[quota-reset] ❌ manager=${row.manager_id}:`, e?.message);
      details.push({ manager_id: row.manager_id, error: e?.message });
    }
  }

  return res.status(200).json({ reset, total: rows.length, details });
}
