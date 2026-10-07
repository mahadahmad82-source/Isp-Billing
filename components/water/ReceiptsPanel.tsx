import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import type { WaterDelivery, WaterPayment, WaterCustomer, WaterCustomerSettings, WaterVehicle, WaterLedgerRow } from './waterTypes';
import { todayKarachi, formatDayPK, formatRs } from './waterTypes';
import ReceiptView, { type ReceiptEntry } from './ReceiptView';

interface Props {
  managerId: string;
  customers: WaterCustomer[];
  businessName: string;
  businessPhone: string;
}

type Filter = 'all' | 'delivery' | 'payment' | 'daily';

interface Row {
  key: string;
  entry: ReceiptEntry;
  receiptNo: string;
  customerId: string;
  customerName: string;
  time: string;
  bottles: number;
  rate: number;
  amount: number;
  paid: number;
  method?: string;
  rider?: string | null;
  voided: boolean;
  voidReason?: string | null;
}

const timeOf = (iso: string) => {
  const t = new Date(iso);
  return Number.isNaN(t.getTime()) ? '' : t.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });
};

const DAY_PRINT_CSS = `
@page { size: A4; margin: 12mm; }
@media print {
  body.water-printing * { visibility: hidden !important; }
  body.water-printing #water-print-sheet,
  body.water-printing #water-print-sheet * { visibility: visible !important; }
  body.water-printing #water-print-sheet {
    position: absolute !important; left: 0 !important; top: 0 !important;
    width: 100% !important; margin: 0 !important; padding: 0 !important;
    box-shadow: none !important; max-width: none !important;
  }
}
`;

/**
 * M6b: daily receipts — deliveries + payments of one day with DB receipt_no.
 * Filters, printable receipt (A5/80mm), WhatsApp share, day-sheet print, void.
 */
export default function ReceiptsPanel({ managerId, customers, businessName, businessPhone }: Props): React.JSX.Element {
  const [date, setDate] = useState(() => todayKarachi());
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [deliveries, setDeliveries] = useState<WaterDelivery[]>([]);
  const [payments, setPayments] = useState<WaterPayment[]>([]);
  const [settings, setSettings] = useState<Map<string, WaterCustomerSettings>>(new Map());
  const [vehicles, setVehicles] = useState<Map<string, string>>(new Map());
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openEntry, setOpenEntry] = useState<Row | null>(null);
  const [daySheetOpen, setDaySheetOpen] = useState(false);

  const live = useMemo(() => customers.filter(c => c.status !== 'deleted'), [customers]);
  const nameOf = (id: string) => live.find(c => c.id === id)?.name || '(deleted customer)';
  const customerOf = (id: string) => live.find(c => c.id === id) || null;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dRes, pRes, sRes, vRes, lRes] = await Promise.all([
        supabase.from('water_deliveries')
          .select('id,customer_id,delivery_date,bottles_delivered,empties_returned,amount_collected,rate_per_bottle,rider_username,vehicle_id,note,created_at,voided_at,void_reason,receipt_no')
          .eq('manager_id', managerId).eq('delivery_date', date).order('created_at', { ascending: false }),
        supabase.from('water_payments')
          .select('id,customer_id,pay_date,amount,method,note,created_at,voided_at,void_reason,receipt_no')
          .eq('manager_id', managerId).eq('pay_date', date).order('created_at', { ascending: false }),
        supabase.from('water_customer_settings').select('*').eq('manager_id', managerId),
        supabase.from('water_vehicles').select('id,name,plate').eq('manager_id', managerId).eq('is_active', true),
        supabase.from('water_customer_ledger').select('customer_id,balance_due').eq('manager_id', managerId),
      ]);
      if (dRes.error) throw new Error(dRes.error.message);
      if (pRes.error) throw new Error(pRes.error.message);
      setDeliveries((dRes.data as WaterDelivery[]) || []);
      setPayments((pRes.data as WaterPayment[]) || []);
      setSettings(new Map(((sRes.data as WaterCustomerSettings[]) || []).map(s => [s.customer_id, s])));
      setVehicles(new Map(((vRes.data as WaterVehicle[]) || []).map(v => [v.id, v.plate ? `${v.name} (${v.plate})` : v.name])));
      setBalances(new Map(((lRes.data as WaterLedgerRow[]) || []).map(l => [l.customer_id, Number(l.balance_due) || 0])));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load receipts.');
    } finally {
      setLoading(false);
    }
  }, [managerId, date]);

  useEffect(() => { load(); }, [load]);

  const rows: Row[] = useMemo(() => {
    const list: Row[] = [];
    for (const d of deliveries) {
      const rate = d.rate_per_bottle ?? settings.get(d.customer_id)?.rate_per_bottle ?? 0;
      const amt = d.bottles_delivered * rate;
      list.push({
        key: `d-${d.id}`, entry: { kind: 'delivery', delivery: d },
        receiptNo: d.receipt_no || '—', customerId: d.customer_id, customerName: nameOf(d.customer_id),
        time: timeOf(d.created_at), bottles: d.bottles_delivered, rate, amount: amt,
        paid: d.amount_collected, rider: d.rider_username, voided: !!d.voided_at, voidReason: d.void_reason,
      });
    }
    for (const p of payments) {
      list.push({
        key: `p-${p.id}`, entry: { kind: 'payment', payment: p },
        receiptNo: p.receipt_no || '—', customerId: p.customer_id, customerName: nameOf(p.customer_id),
        time: timeOf(p.created_at), bottles: 0, rate: 0, amount: p.amount,
        paid: p.amount, method: p.method, voided: !!p.voided_at, voidReason: p.void_reason,
      });
    }
    return list;
  }, [deliveries, payments, settings, live]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(r => {
      if (filter === 'delivery' && r.entry.kind !== 'delivery') return false;
      if (filter === 'payment' && r.entry.kind !== 'payment') return false;
      if (filter === 'daily' && settings.get(r.customerId)?.billing_mode !== 'daily') return false;
      if (q && !r.customerName.toLowerCase().includes(q) && !r.receiptNo.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, filter, search, settings]);

  const chips: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'delivery', label: 'Deliveries' },
    { id: 'payment', label: 'Payments' },
    { id: 'daily', label: 'Daily customers' },
  ];

  const active = rows.filter(r => !r.voided);
  const totalBottles = active.reduce((s, r) => s + (r.entry.kind === 'delivery' ? r.bottles : 0), 0);
  const totalCash = active.reduce((s, r) => s + r.paid, 0);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input type="date" value={date} max={todayKarachi()} onChange={e => e.target.value && setDate(e.target.value)}
          aria-label="Receipt date"
          className="min-h-[48px] px-4 rounded-2xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 text-sm font-bold text-[#0f172a] dark:text-white outline-none" />
        <div className="flex-1 min-w-[140px]">
          <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name / receipt no"
            aria-label="Search receipts"
            className="w-full min-h-[48px] px-4 rounded-2xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 text-sm text-[#0f172a] dark:text-white placeholder-[#94a3b8] outline-none" />
        </div>
        <button type="button" onClick={() => setDaySheetOpen(true)} disabled={rows.length === 0}
          className="min-h-[48px] px-4 rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-sm font-bold text-[#0f172a] dark:text-white disabled:opacity-40">
          Day sheet
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-3" role="tablist" aria-label="Receipt filters">
        {chips.map(c => (
          <button key={c.id} type="button" role="tab" aria-selected={filter === c.id} onClick={() => setFilter(c.id)}
            className={`shrink-0 min-h-[44px] px-4 rounded-2xl text-sm font-bold ${filter === c.id
              ? 'bg-[#1d4ed8] text-white' : 'bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 text-[#475569] dark:text-[#94a3b8]'}`}>
            {c.label}
          </button>
        ))}
      </div>

      <p className="text-xs font-bold text-[#64748b] dark:text-[#94a3b8] mb-3">
        {formatDayPK(date)} • {visible.length} receipt{visible.length === 1 ? '' : 's'} • {totalBottles} bottles • {formatRs(totalCash)} cash
      </p>

      {loading && <p className="text-sm text-[#94a3b8] text-center py-8">Loading…</p>}
      {error && (
        <div className="rounded-2xl bg-[rgba(239,68,68,0.1)] p-4 mb-3">
          <p className="text-sm font-bold text-[#b91c1c] dark:text-[#f87171] mb-2">{error}</p>
          <button type="button" onClick={load} className="min-h-[44px] px-4 rounded-2xl bg-[#dc2626] text-white text-sm font-bold">Retry</button>
        </div>
      )}

      {!loading && !error && visible.length === 0 && (
        <p className="text-sm text-[#94a3b8] text-center py-8">No receipts for this day.</p>
      )}

      <div className="space-y-2">
        {visible.map(r => (
          <button key={r.key} type="button" onClick={() => setOpenEntry(r)}
            className="w-full text-left rounded-2xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-4 active:scale-[0.99] transition-transform">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-sm font-black text-[#1d4ed8] dark:text-[#93c5fd]">{r.receiptNo}</span>
              <span className="flex items-center gap-2">
                {r.voided && (
                  <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg bg-[rgba(239,68,68,0.12)] text-[#b91c1c] dark:text-[#f87171]">
                    Voided
                  </span>
                )}
                <span className="text-xs text-[#94a3b8] font-semibold">{r.time}</span>
              </span>
            </div>
            <p className="text-sm font-bold text-[#0f172a] dark:text-white truncate">{r.customerName}</p>
            <p className="text-xs text-[#64748b] dark:text-[#94a3b8] font-semibold mt-0.5">
              {r.entry.kind === 'delivery'
                ? `${r.bottles} bottles x ${formatRs(r.rate)} = ${formatRs(r.amount)} • Paid ${formatRs(r.paid)}`
                : `Payment ${formatRs(r.paid)} (${r.method})`}
            </p>
            {r.voided && r.voidReason && <p className="text-[11px] text-[#94a3b8] mt-0.5">Reason: {r.voidReason}</p>}
          </button>
        ))}
      </div>

      {openEntry && (
        <ReceiptView
          entry={openEntry.entry}
          customer={customerOf(openEntry.customerId)}
          customerName={openEntry.customerName}
          rate={openEntry.rate}
          vehicleName={openEntry.entry.delivery?.vehicle_id ? vehicles.get(openEntry.entry.delivery.vehicle_id) || null : null}
          balanceDue={balances.has(openEntry.customerId) ? balances.get(openEntry.customerId)! : null}
          businessName={businessName}
          businessPhone={businessPhone}
          onClose={() => setOpenEntry(null)}
          onVoided={() => { setOpenEntry(null); load(); }}
        />
      )}

      {daySheetOpen && (
        <DaySheet
          date={date}
          businessName={businessName}
          rows={active}
          onClose={() => setDaySheetOpen(false)}
        />
      )}
    </div>
  );
}

/* ── Day sheet: one-page printable summary ── */

function DaySheet({ date, businessName, rows, onClose }: {
  date: string; businessName: string; rows: Row[]; onClose: () => void;
}): React.JSX.Element {
  const bottles = rows.reduce((s, r) => s + (r.entry.kind === 'delivery' ? r.bottles : 0), 0);
  const cash = rows.reduce((s, r) => s + r.paid, 0);
  const byRider = useMemo(() => {
    const map = new Map<string, { bottles: number; cash: number; n: number }>();
    for (const r of rows) {
      const rider = r.rider || '—';
      const cur = map.get(rider) || { bottles: 0, cash: 0, n: 0 };
      cur.bottles += r.entry.kind === 'delivery' ? r.bottles : 0;
      cur.cash += r.paid;
      cur.n += 1;
      map.set(rider, cur);
    }
    return [...map.entries()];
  }, [rows]);

  const doPrint = () => {
    document.body.classList.add('water-printing');
    setTimeout(() => {
      window.print();
      setTimeout(() => document.body.classList.remove('water-printing'), 500);
    }, 50);
  };

  const cell: React.CSSProperties = { border: '1px solid #000', padding: '4px 6px', fontSize: '10pt', color: '#000', background: '#fff' };

  return (
    <div className="fixed inset-0 z-50 bg-white overflow-y-auto" role="dialog" aria-modal="true" aria-label="Day sheet">
      <style>{DAY_PRINT_CSS}</style>
      <div className="no-print sticky top-0 flex items-center gap-2 px-4 py-3 bg-white border-b border-[#e2e8f0]">
        <button type="button" onClick={onClose} aria-label="Close day sheet"
          className="min-h-[44px] min-w-[44px] rounded-2xl border border-[#e2e8f0] text-lg font-black">×</button>
        <p className="flex-1 text-sm font-black">Day sheet — {formatDayPK(date)}</p>
        <button type="button" onClick={doPrint}
          className="min-h-[44px] px-5 rounded-2xl bg-[#0f172a] text-white text-sm font-bold">Print</button>
      </div>
      <div id="water-print-sheet" style={{ background: '#fff', color: '#000', maxWidth: '700px', margin: '0 auto', padding: '16px', fontFamily: 'Arial, sans-serif' }}>
        <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '8px', marginBottom: '12px' }}>
          <p style={{ fontSize: '16pt', fontWeight: 800, margin: 0 }}>{businessName}</p>
          <p style={{ fontSize: '12pt', fontWeight: 700, margin: '4px 0 0' }}>Day sheet — {formatDayPK(date)}</p>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px' }}>
          <tbody>
            <tr><td style={cell}>Total bottles</td><td style={{ ...cell, fontWeight: 800 }}>{bottles}</td></tr>
            <tr><td style={cell}>Total cash</td><td style={{ ...cell, fontWeight: 800 }}>{formatRs(cash)}</td></tr>
            <tr><td style={cell}>Receipts</td><td style={cell}>{rows.length}</td></tr>
          </tbody>
        </table>
        <p style={{ fontSize: '11pt', fontWeight: 700, margin: '0 0 6px' }}>Rider-wise</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '12px' }}>
          <thead><tr>
            {['Rider', 'Receipts', 'Bottles', 'Cash'].map(h => (
              <th key={h} style={{ ...cell, fontWeight: 800, textAlign: 'left' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {byRider.map(([rider, s]) => (
              <tr key={rider}><td style={cell}>{rider}</td><td style={cell}>{s.n}</td><td style={cell}>{s.bottles}</td><td style={cell}>{formatRs(s.cash)}</td></tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: '11pt', fontWeight: 700, margin: '0 0 6px' }}>Receipts</p>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>
            {['No', 'Customer', 'Bottles', 'Amount', 'Paid'].map(h => (
              <th key={h} style={{ ...cell, fontWeight: 800, textAlign: 'left' }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key}>
                <td style={cell}>{r.receiptNo}</td><td style={cell}>{r.customerName}</td>
                <td style={cell}>{r.entry.kind === 'delivery' ? r.bottles : '—'}</td>
                <td style={cell}>{formatRs(r.amount)}</td><td style={cell}>{formatRs(r.paid)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
