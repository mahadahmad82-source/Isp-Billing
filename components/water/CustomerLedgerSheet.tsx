import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import type { WaterLedgerRow, WaterCustomer } from './waterTypes';
import { todayKarachi, formatRs, formatDue, waNumber92, toISODate } from './waterTypes';
import { SheetShell, Stepper } from './VehiclesPanel';

interface Props {
  managerId: string;
  customer: WaterCustomer | null;
  customerName: string;
  ledger: WaterLedgerRow;
  businessName?: string;
  /** M6a: open with the Record-payment form already expanded (dashboard quick action). */
  startWithPay?: boolean;
  onClose: () => void;
  onChanged: () => void;
}

type TLEntry =
  | { kind: 'delivery'; id: string; date: string; bottles: number; empties: number; cash: number; note: string | null; voided: boolean; reason: string | null }
  | { kind: 'payment'; id: string; date: string; amount: number; method: string; note: string | null; voided: boolean; reason: string | null };

const METHODS = ['cash', 'jazzcash', 'easypaisa', 'bank', 'other'] as const;
const METHOD_LABELS: Record<string, string> = {
  cash: 'Cash', jazzcash: 'JazzCash', easypaisa: 'EasyPaisa', bank: 'Bank', other: 'Other',
};

const inputCls =
  'w-full min-h-[48px] px-4 rounded-2xl bg-[#f8fafc] dark:bg-white/[0.03] border border-[#e2e8f0] dark:border-white/10 text-base text-[#0f172a] dark:text-white placeholder-[#94a3b8] outline-none focus:border-[#3b82f6]';

export default function CustomerLedgerSheet({ managerId, customer, customerName, ledger, businessName, startWithPay, onClose, onChanged }: Props): React.JSX.Element {
  const [entries, setEntries] = useState<TLEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [allTime, setAllTime] = useState(false);
  const [showPay, setShowPay] = useState(!!startWithPay);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [voidTarget, setVoidTarget] = useState<TLEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let dQuery = supabase
        .from('water_deliveries')
        .select('id,delivery_date,bottles_delivered,empties_returned,amount_collected,note,voided_at,void_reason')
        .eq('manager_id', managerId)
        .eq('customer_id', ledger.customer_id)
        .order('delivery_date', { ascending: false });
      let pQuery = supabase
        .from('water_payments')
        .select('id,pay_date,amount,method,note,voided_at,void_reason')
        .eq('manager_id', managerId)
        .eq('customer_id', ledger.customer_id)
        .order('pay_date', { ascending: false });
      if (!allTime) {
        const d = new Date();
        d.setDate(d.getDate() - 60);
        const cutoff = toISODate(d);
        dQuery = dQuery.gte('delivery_date', cutoff);
        pQuery = pQuery.gte('pay_date', cutoff);
      }
      const [dRes, pRes] = await Promise.all([dQuery, pQuery]);
      if (dRes.error) throw new Error(dRes.error.message);
      if (pRes.error) throw new Error(pRes.error.message);
      const list: TLEntry[] = [
        ...((dRes.data as any[]) || []).map(r => ({
          kind: 'delivery' as const, id: r.id, date: r.delivery_date,
          bottles: r.bottles_delivered, empties: r.empties_returned, cash: r.amount_collected,
          note: r.note, voided: !!r.voided_at, reason: r.void_reason,
        })),
        ...((pRes.data as any[]) || []).map(r => ({
          kind: 'payment' as const, id: r.id, date: r.pay_date,
          amount: r.amount, method: r.method, note: r.note,
          voided: !!r.voided_at, reason: r.void_reason,
        })),
      ];
      list.sort((a, b) => b.date.localeCompare(a.date));
      setEntries(list);
    } catch {
      /* timeline is secondary; ledger numbers already shown */
    } finally {
      setLoading(false);
    }
  }, [managerId, ledger.customer_id, allTime]);

  useEffect(() => { load(); }, [load]);

  const voidEntry = async (reason: string) => {
    const t = voidTarget;
    if (!t || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const rpc = t.kind === 'delivery' ? 'water_void_delivery' : 'water_void_payment';
      const { data, error } = await supabase.rpc(rpc, { p_id: t.id, p_reason: reason });
      if (error || (data && !data.success)) {
        const transport = (error as { message?: string } | null)?.message;
        const payload = data && typeof data === 'object' && 'error' in data ? String((data as { error?: unknown }).error || '') : '';
        throw new Error(transport || payload || 'Void failed.');
      }
      setVoidTarget(null);
      await load();
      onChanged();
    } catch (e: unknown) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Void failed.' });
    } finally {
      setBusy(false);
    }
  };

  const waLink = useMemo(() => {
    const num = waNumber92(customer?.phone);
    if (!num || ledger.balance_due <= 0) return null;
    const business = businessName || managerId;
    const text = `Assalam o Alaikum ${customerName}, ${business} ka hisaab: baqaya Rs. ${ledger.balance_due.toLocaleString('en-US')}. Barah-e-meherbani jald ada kar dein. Shukriya.`;
    return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
  }, [customer?.phone, ledger.balance_due, businessName, managerId, customerName]);

  return (
    <SheetShell title={customerName} onClose={onClose} busy={busy}>
      {msg && (
        <div className={`text-sm font-semibold px-3 py-2.5 rounded-2xl mb-3 ${msg.ok
          ? 'bg-[rgba(34,197,94,0.12)] text-[#15803d] dark:text-[#4ade80]'
          : 'bg-[rgba(239,68,68,0.12)] text-[#b91c1c] dark:text-[#f87171]'}`}>
          {msg.text}
        </div>
      )}

      {/* Balance */}
      <div className="rounded-2xl bg-[#f8fafc] dark:bg-white/[0.03] border border-[#e2e8f0] dark:border-white/10 p-4 mb-3 text-center">
        <div className={`text-3xl font-black ${ledger.balance_due > 0
          ? 'text-[#b91c1c] dark:text-[#f87171]'
          : ledger.balance_due < 0 ? 'text-[#15803d] dark:text-[#4ade80]' : 'text-[#0f172a] dark:text-white'}`}>
          {formatDue(ledger.balance_due)}
        </div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mt-1">Balance due</div>
        <div className="text-xs text-[#64748b] dark:text-[#94a3b8] mt-2 space-y-0.5">
          <div>Opening: {formatRs(ledger.opening_balance)} + Billed: {formatRs(ledger.billed)}</div>
          <div>− Collected: {formatRs(ledger.collected_on_delivery)} − Payments: {formatRs(ledger.payments)}</div>
        </div>
        {ledger.bottles_out > 0 && (
          <div className="text-xs font-bold text-[#0f172a] dark:text-white mt-1">{ledger.bottles_out} bottles out</div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <button type="button" onClick={() => setShowPay(s => !s)} aria-expanded={showPay}
          className="min-h-[48px] rounded-2xl bg-[#1d4ed8] text-white text-base font-bold">
          Record payment
        </button>
        {waLink ? (
          <a href={waLink} target="_blank" rel="noopener noreferrer"
            className="min-h-[48px] rounded-2xl bg-[rgba(34,197,94,0.12)] text-[#15803d] dark:text-[#4ade80] text-base font-bold flex items-center justify-center text-center px-2">
            Send reminder
          </a>
        ) : (
          <button type="button" disabled title="No due balance"
            className="min-h-[48px] rounded-2xl bg-[#f1f5f9] dark:bg-white/5 text-[#94a3b8] text-base font-bold opacity-50">
            Send reminder
          </button>
        )}
      </div>

      {showPay && (
        <PaymentForm
          managerId={managerId}
          customerId={ledger.customer_id}
          busy={busy}
          setBusy={setBusy}
          onDone={async () => { setShowPay(false); await load(); onChanged(); }}
          onError={text => setMsg({ ok: false, text })}
        />
      )}

      {/* Timeline */}
      <h3 className="text-[11px] font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-2">
        History {allTime ? '' : '(last 60 days)'}
      </h3>
      {loading && <p className="text-sm text-[#64748b] dark:text-[#94a3b8] text-center py-4">Loading…</p>}
      {!loading && entries.length === 0 && (
        <p className="text-sm text-[#94a3b8] text-center py-4">No entries yet.</p>
      )}
      <div className="flex flex-col gap-2 mb-3">
        {entries.map(e => (
          <div key={`${e.kind}-${e.id}`}
            className={`rounded-2xl border border-[#e2e8f0] dark:border-white/10 p-3 ${e.voided ? 'opacity-50 bg-[#f8fafc] dark:bg-white/[0.02]' : 'bg-white dark:bg-[#0f172a]'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className={`text-sm font-black ${e.voided ? 'line-through text-[#64748b] dark:text-[#94a3b8]' : 'text-[#0f172a] dark:text-white'}`}>
                  {e.kind === 'delivery'
                    ? `${e.bottles} bottles • ${e.empties} empty • Rs. ${e.cash.toLocaleString('en-US')}`
                    : `${METHOD_LABELS[e.method] || e.method} • Rs. ${e.amount.toLocaleString('en-US')}`}
                </div>
                <div className="text-xs text-[#94a3b8]">
                  {e.kind === 'delivery' ? 'Delivery' : 'Payment'} • {e.date}
                  {e.note ? ` • ${e.note}` : ''}
                </div>
                {e.voided && e.reason && (
                  <div className="text-xs font-semibold text-[#b91c1c] dark:text-[#f87171]">voided: {e.reason}</div>
                )}
              </div>
              {!e.voided && (
                <button type="button" onClick={() => setVoidTarget(e)} disabled={busy}
                  className="min-h-[44px] px-3 rounded-xl border border-[rgba(239,68,68,0.25)] text-[#b91c1c] dark:text-[#f87171] text-xs font-bold disabled:opacity-40 shrink-0">
                  Void
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
      {!allTime && entries.length > 0 && (
        <button type="button" onClick={() => setAllTime(true)}
          className="w-full min-h-[48px] rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-base font-bold text-[#0f172a] dark:text-white">
          Load more
        </button>
      )}

      {voidTarget && (
        <VoidModal
          label={voidTarget.kind === 'delivery' ? 'Void delivery' : 'Void payment'}
          busy={busy}
          onClose={() => setVoidTarget(null)}
          onConfirm={voidEntry}
        />
      )}
    </SheetShell>
  );
}

/* ── Record payment form ── */
function PaymentForm({ managerId, customerId, busy, setBusy, onDone, onError }: {
  managerId: string;
  customerId: string;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onDone: () => void;
  onError: (text: string) => void;
}) {
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<string>('cash');
  const [date, setDate] = useState(() => todayKarachi());
  const [note, setNote] = useState('');
  const refKey = useRef<string>(crypto.randomUUID()); // same key on retry => DB ignores a duplicate if the first save actually went through

  const save = async () => {
    if (busy || amount <= 0) return;
    setBusy(true);
    try {
      const { error } = await supabase.from('water_payments').upsert(
        {
          manager_id: managerId,
          customer_id: customerId,
          pay_date: date,
          amount,
          method,
          note: note.trim() || null,
          client_ref: refKey.current,
        },
        { onConflict: 'manager_id,client_ref', ignoreDuplicates: true }
      );
      if (error) throw new Error(error.message);
      onDone();
    } catch (e: unknown) {
      onError(e instanceof Error ? e.message : 'Could not save payment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-2xl bg-[#f8fafc] dark:bg-white/[0.03] border border-[#e2e8f0] dark:border-white/10 p-4 mb-4">
      <span className="block text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-1.5">Amount (Rs.)</span>
      <div className="mb-3"><Stepper value={amount} onChange={setAmount} min={0} max={10000000} label="Payment amount" /></div>
      <span className="block text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-1.5">Method</span>
      <div className="flex flex-wrap gap-2 mb-3" role="radiogroup" aria-label="Payment method">
        {METHODS.map(m => (
          <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => setMethod(m)}
            className={`min-h-[48px] px-4 rounded-2xl border text-sm font-bold ${method === m
              ? 'border-[#3b82f6] bg-[#dbeafe] text-[#1e40af] dark:bg-[rgba(59,130,246,0.18)] dark:text-[#93c5fd]'
              : 'border-[#e2e8f0] dark:border-white/10 text-[#475569] dark:text-[#94a3b8]'}`}>
            {METHOD_LABELS[m]}
          </button>
        ))}
      </div>
      <label className="block text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-1.5" htmlFor="pay-date">
        Date
      </label>
      <input id="pay-date" type="date" value={date} onChange={e => setDate(e.target.value)}
        className={`${inputCls} mb-3`} />
      <label className="block text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-1.5" htmlFor="pay-note">
        Note
      </label>
      <input id="pay-note" type="text" value={note} onChange={e => setNote(e.target.value)}
        placeholder="Note (optional)" className={`${inputCls} mb-3`} />
      <button type="button" onClick={save} disabled={busy || amount <= 0}
        className="w-full min-h-[48px] rounded-2xl bg-[#15803d] text-white text-base font-bold disabled:opacity-40">
        {busy ? 'Saving…' : 'Save payment'}
      </button>
    </div>
  );
}

/* ── Void reason modal ── */
function VoidModal({ label, busy, onClose, onConfirm }: {
  label: string;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');
  const valid = reason.trim().length > 0;
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label={label}>
      <div className="absolute inset-0 bg-black/70" onClick={() => !busy && onClose()} />
      <div className="relative z-10 w-full sm:max-w-sm bg-white dark:bg-[#0f172a] rounded-t-[2rem] sm:rounded-[2rem] border border-[#e2e8f0] dark:border-white/10 p-5 pb-6">
        <h2 className="text-base font-black text-[#0f172a] dark:text-white mb-3">{label}</h2>
        <input
          type="text"
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Reason (required)"
          aria-label="Void reason"
          className="w-full min-h-[48px] px-4 rounded-2xl bg-[#f8fafc] dark:bg-white/[0.03] border border-[#e2e8f0] dark:border-white/10 text-base text-[#0f172a] dark:text-white placeholder-[#94a3b8] outline-none focus:border-[#ef4444] mb-3"
        />
        <div className="flex gap-2">
          <button type="button" onClick={onClose} disabled={busy}
            className="flex-1 min-h-[48px] rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-base font-bold text-[#0f172a] dark:text-white disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={() => onConfirm(reason.trim())} disabled={busy || !valid}
            className="flex-1 min-h-[48px] rounded-2xl bg-[#dc2626] text-white text-base font-bold disabled:opacity-40">
            {busy ? 'Voiding…' : 'Void'}
          </button>
        </div>
      </div>
    </div>
  );
}
