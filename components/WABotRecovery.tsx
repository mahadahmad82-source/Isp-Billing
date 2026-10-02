import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getWabotAuthHeaders } from '../utils/whatsapp';

interface WABotRecoveryProps {
  managerId: string;
}

interface PendingRecovery {
  id: string;
  name: string;
  phone: string;
  address?: string;
  plan?: string;
  pendingAmount: number;
  creditDate?: string;
  reminderCount: number;
  period: string;
}

const currentPeriod = () =>
  new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date());

const periodSortValue = (period: string) => {
  const parsed = new Date(`${period} 1`);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const normalizePhone = (raw: any): string => {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.startsWith('92') && digits.length === 12) return digits.slice(2);
  if (digits.startsWith('0') && digits.length === 11) return digits.slice(1);
  return digits.length === 10 ? digits : '';
};

const daysSince = (iso?: string) => {
  if (!iso) return '—';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  return `${days}d ago`;
};

// Pending-payment recovery ledger, mirroring the Android Recovery screen:
// unpaid customers for the selected billing period, with tap-to-call and a
// one-tap WhatsApp pending-payment template.
const WABotRecovery: React.FC<WABotRecoveryProps> = ({ managerId }) => {
  const [users, setUsers] = useState<any[]>([]);
  const [receipts, setReceipts] = useState<any[]>([]);
  const [periods, setPeriods] = useState<string[]>([currentPeriod()]);
  const [selectedPeriod, setSelectedPeriod] = useState(currentPeriod());
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!managerId) { setLoading(false); return; }
    try {
      const { data } = await supabase.from('manager_data').select('data').eq('manager_id', managerId).maybeSingle();
      const state = data?.data || {};
      const nextUsers = Array.isArray(state.users) ? state.users : [];
      const nextReceipts = Array.isArray(state.receipts) ? state.receipts : [];
      const nextPeriods = new Set<string>([currentPeriod()]);
      nextUsers.forEach((u: any) => {
        (Array.isArray(u.activatedMonths) ? u.activatedMonths : []).forEach((p: string) => { if (p) nextPeriods.add(p); });
      });
      nextReceipts.forEach((r: any) => { if (r.period) nextPeriods.add(r.period); });
      const ordered = Array.from(nextPeriods).sort((a, b) => periodSortValue(b) - periodSortValue(a));
      setUsers(nextUsers);
      setReceipts(nextReceipts);
      setPeriods(ordered);
      setSelectedPeriod(prev => (ordered.includes(prev) ? prev : (ordered[0] || currentPeriod())));
    } catch (e) {
      console.error('[WABotRecovery] load', e);
    } finally {
      setLoading(false);
    }
  }, [managerId]);

  useEffect(() => { load(); }, [load]);

  const items = useMemo<PendingRecovery[]>(() => {
    const periodReceipts = receipts.filter(r => r.period === selectedPeriod);
    return users
      .filter((u: any) => {
        const activatedInPeriod = Array.isArray(u.activatedMonths) && u.activatedMonths.includes(selectedPeriod);
        const hasPeriodReceipt = periodReceipts.some(r => r.userId === u.id || r.username === u.username);
        return activatedInPeriod || hasPeriodReceipt;
      })
      .map((u: any) => {
        const userReceipts = periodReceipts.filter(r => r.userId === u.id || r.username === u.username);
        const hasPaid = userReceipts.length > 0;
        const lastReceipt = userReceipts[userReceipts.length - 1];
        return {
          id: String(u.id),
          name: u.name || u.username || 'Unnamed customer',
          phone: normalizePhone(u.phone),
          address: String(u.address || u.location || '').trim(),
          plan: u.plan,
          pendingAmount: hasPaid ? Number(lastReceipt?.balanceAmount || 0) : Number(u.balance || 0),
          creditDate: u.creditDate,
          reminderCount: Number(u.reminderCount || 0),
          period: selectedPeriod,
          hasPaid,
        };
      })
      .filter((x: any) => !x.hasPaid)
      .map(({ hasPaid: _h, ...x }: any) => x);
  }, [users, receipts, selectedPeriod]);

  const totalPending = useMemo(() => items.reduce((s, i) => s + (Number(i.pendingAmount) || 0), 0), [items]);

  const sendTemplate = async (item: PendingRecovery) => {
    if (!item.phone || sendingId) return;
    setSendingId(item.id);
    setNotice('');
    try {
      const res = await fetch('/api/wabot-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getWabotAuthHeaders()) },
        body: JSON.stringify({
          to: `92${item.phone}`,
          managerId,
          type: 'template',
          templateName: 'recharge_pending_payment',
          templateParams: [item.name, String(item.pendingAmount), String(item.pendingAmount), item.plan || ''],
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error || 'Template could not be sent');
      }
      setNotice(`Reminder sent to ${item.name}.`);
    } catch (e: any) {
      setNotice(`Could not send: ${e?.message || 'unknown error'}`);
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="flex-1 min-h-0 bg-[var(--nb-surface-1)] rounded-2xl border border-[var(--nb-border)] overflow-y-auto p-4 sm:p-6 custom-scrollbar">
      <div className="flex items-center gap-3 p-4 rounded-2xl bg-[var(--nb-accent-soft)] border border-[var(--nb-accent)] mb-4">
        <div className="w-11 h-11 rounded-xl bg-[var(--nb-accent)] flex items-center justify-center flex-shrink-0">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-[var(--nb-text-2)]">Pending recovery</p>
          <p className="text-sm font-black text-[var(--nb-text-1)]">{items.length} customers · Rs. {totalPending.toLocaleString()}</p>
        </div>
        <button
          onClick={load}
          title="Refresh"
          className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl bg-[var(--nb-surface-1)] border border-[var(--nb-border)] text-[var(--nb-text-2)] active:scale-95 transition-all"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <label className="text-[10px] font-black uppercase tracking-widest text-[var(--nb-text-2)] flex-shrink-0">Billing period</label>
        <select
          value={selectedPeriod}
          onChange={e => setSelectedPeriod(e.target.value)}
          className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-[var(--nb-header)] border border-[var(--nb-border)] text-sm font-bold outline-none text-[var(--nb-text-1)]"
        >
          {periods.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {notice && (
        <p className="text-xs font-bold text-[var(--nb-accent)] bg-[var(--nb-accent-soft)] border border-[var(--nb-accent)] rounded-xl px-3 py-2 mb-4">{notice}</p>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <span className="w-8 h-8 rounded-full border-[3px] border-[var(--nb-accent)] border-t-transparent animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-sm font-black text-[var(--nb-text-1)]">No pending recoveries for {selectedPeriod}</p>
          <p className="text-xs text-[var(--nb-text-2)] font-semibold mt-1">Choose another period to review older pending recoveries.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <div key={item.id} className="p-4 rounded-2xl border border-[var(--nb-border)] bg-[var(--nb-surface-2)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-black text-[var(--nb-text-1)] truncate">{item.name}</p>
                  {item.plan && <p className="text-[11px] font-bold text-[var(--nb-text-2)]">{item.plan}</p>}
                </div>
                <p className="text-sm font-black text-[var(--nb-text-1)] flex-shrink-0">Rs. {Number(item.pendingAmount).toLocaleString()}</p>
              </div>
              <p className="text-[11px] font-bold text-[var(--nb-text-2)] mt-1">
                {item.phone ? `+92${item.phone}` : 'No phone'} · {daysSince(item.creditDate)}
              </p>
              {item.address && <p className="text-[11px] text-[var(--nb-text-2)] font-semibold mt-0.5 truncate">{item.address}</p>}
              <p className="text-[11px] font-bold text-[var(--nb-text-2)] mt-1">
                Reminders sent: {item.reminderCount}/6{item.reminderCount >= 6 ? ' · Manual follow-up needed' : ''}
              </p>
              <div className="flex gap-2 mt-3">
                {item.phone ? (
                  <a
                    href={`tel:+92${item.phone}`}
                    className="flex-1 flex items-center justify-center gap-2 px-3 min-h-[48px] rounded-full bg-[var(--nb-surface-1)] border border-[var(--nb-border)] text-xs font-black uppercase tracking-widest text-[var(--nb-text-1)] active:scale-[0.97] transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                    Call
                  </a>
                ) : null}
                <button
                  onClick={() => sendTemplate(item)}
                  disabled={!item.phone || sendingId === item.id}
                  className="flex-1 flex items-center justify-center gap-2 px-3 min-h-[48px] rounded-full bg-[var(--nb-accent)] hover:bg-[var(--nb-accent-pressed)] disabled:opacity-45 text-white text-xs font-black uppercase tracking-widest active:scale-[0.97] transition-all"
                >
                  {sendingId === item.id ? (
                    <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                  )}
                  Pending Payment
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default WABotRecovery;
