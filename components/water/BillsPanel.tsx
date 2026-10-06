import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import type { AppSettings } from '../../types';
import type { WaterBill, WaterCustomer, WaterCustomerSettings } from './waterTypes';
import { formatRs, formatDayPK, digitsOnly, waNumber92 } from './waterTypes';
import BillView from './BillView';

interface Props {
  managerId: string;
  customers: WaterCustomer[];
  settings: AppSettings;
}

type Filter = 'all' | 'due' | 'paid';

const monthEnd = (d: Date) => {
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
};
const monthLabelOf = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};
const prevMonthYm = () => {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const PRINT_ALL_CSS = `
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
  body.water-printing .bill-page { page-break-after: always; }
  body.water-printing .bill-page:last-child { page-break-after: auto; }
}
`;

/**
 * M6b: monthly bills. Generate via water_generate_bills (idempotent — the RPC
 * never duplicates), printable A4 bills, WhatsApp share, void via RPC.
 */
export default function BillsPanel({ managerId, customers, settings }: Props): React.JSX.Element {
  const [ym, setYm] = useState(() => prevMonthYm());
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [showVoided, setShowVoided] = useState(false);
  const [includeDaily, setIncludeDaily] = useState(false);
  const [bills, setBills] = useState<WaterBill[]>([]);
  const [rateMap, setRateMap] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [openBill, setOpenBill] = useState<WaterBill | null>(null);
  const [printAll, setPrintAll] = useState(false);
  const [shareAll, setShareAll] = useState(false);

  const live = useMemo(() => customers.filter(c => c.status !== 'deleted'), [customers]);
  const nameOf = (id: string) => live.find(c => c.id === id)?.name || '(deleted customer)';
  const customerOf = (id: string) => live.find(c => c.id === id) || null;

  const p_from = `${ym}-01`;
  const p_to = monthEnd(new Date(Number(ym.split('-')[0]), Number(ym.split('-')[1]) - 1, 1));
  const mLabel = monthLabelOf(ym);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [bRes, sRes] = await Promise.all([
        supabase.from('water_bills').select('*')
          .eq('manager_id', managerId).eq('period_from', p_from).eq('period_to', p_to)
          .order('created_at', { ascending: false }),
        supabase.from('water_customer_settings').select('customer_id,rate_per_bottle').eq('manager_id', managerId),
      ]);
      if (bRes.error) throw new Error(bRes.error.message);
      setBills((bRes.data as WaterBill[]) || []);
      setRateMap(new Map(((sRes.data as { customer_id: string; rate_per_bottle: number }[]) || []).map(s => [s.customer_id, s.rate_per_bottle])));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load bills.');
    } finally {
      setLoading(false);
    }
  }, [managerId, p_from, p_to]);

  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    if (generating) return;
    setGenerating(true);
    setMsg(null);
    setError(null);
    try {
      const { data, error } = await supabase.rpc('water_generate_bills', {
        p_from, p_to, p_include_daily: includeDaily,
      });
      if (error) throw new Error(error.message);
      const count = Array.isArray(data) ? data.length : 0;
      setMsg(`${count} bill${count === 1 ? '' : 's'} for ${mLabel}.`);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Bill generation failed.');
    } finally {
      setGenerating(false);
    }
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return bills.filter(b => {
      if (!showVoided && b.voided_at) return false;
      if (filter === 'due' && !(b.closing_due > 0)) return false;
      if (filter === 'paid' && !(b.closing_due === 0)) return false;
      if (q && !nameOf(b.customer_id).toLowerCase().includes(q) && !b.bill_no.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [bills, filter, search, showVoided, live]);

  const liveBills = bills.filter(b => !b.voided_at);
  const sumBilled = liveBills.reduce((s, b) => s + b.billed, 0);
  const sumPaid = liveBills.reduce((s, b) => s + b.paid, 0);
  const sumDue = liveBills.reduce((s, b) => s + b.closing_due, 0);

  const chips: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'due', label: 'Due' },
    { id: 'paid', label: 'Paid' },
  ];

  const shiftMonth = (dir: -1 | 1) => {
    const [y, m] = ym.split('-').map(Number);
    const d = new Date(y, m - 1 + dir, 1);
    setYm(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  return (
    <div>
      {msg && <div className="text-sm font-semibold px-3 py-2.5 rounded-2xl mb-3 bg-[rgba(34,197,94,0.12)] text-[#15803d] dark:text-[#4ade80]">{msg}</div>}
      {error && (
        <div className="rounded-2xl bg-[rgba(239,68,68,0.1)] p-4 mb-3">
          <p className="text-sm font-bold text-[#b91c1c] dark:text-[#f87171] mb-2">{error}</p>
          <button type="button" onClick={load} className="min-h-[44px] px-4 rounded-2xl bg-[#dc2626] text-white text-sm font-bold">Retry</button>
        </div>
      )}

      {/* Month selector + generate */}
      <div className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-4 mb-3">
        <div className="flex items-center justify-between mb-3">
          <button type="button" onClick={() => shiftMonth(-1)} aria-label="Previous month"
            className="min-h-[44px] min-w-[44px] rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-lg font-black">‹</button>
          <p className="text-base font-black text-[#0f172a] dark:text-white">{mLabel}</p>
          <button type="button" onClick={() => shiftMonth(1)} aria-label="Next month"
            className="min-h-[44px] min-w-[44px] rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-lg font-black">›</button>
        </div>
        <p className="text-xs text-[#64748b] dark:text-[#94a3b8] mb-3">{formatDayPK(p_from)} – {formatDayPK(p_to)}</p>
        <label className="flex items-center gap-2.5 mb-3 cursor-pointer">
          <input type="checkbox" checked={includeDaily} onChange={e => setIncludeDaily(e.target.checked)} className="w-5 h-5 accent-[#1d4ed8]" />
          <span className="text-sm font-semibold text-[#0f172a] dark:text-white">Include daily customers</span>
        </label>
        <button type="button" onClick={generate} disabled={generating}
          className="w-full min-h-[52px] rounded-2xl bg-[#1d4ed8] text-white text-base font-bold disabled:opacity-40">
          {generating ? 'Generating…' : 'Generate bills'}
        </button>
        <p className="text-[11px] text-[#94a3b8] mt-2">Bills generate sirf ek baar hote hain — dobara dabane par duplicate nahi bante.</p>
      </div>

      {/* Summary */}
      {liveBills.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {[
            { label: 'Billed', v: sumBilled, tone: 'text-[#0f172a] dark:text-white' },
            { label: 'Paid', v: sumPaid, tone: 'text-[#15803d] dark:text-[#4ade80]' },
            { label: 'Closing due', v: sumDue, tone: 'text-[#b91c1c] dark:text-[#f87171]' },
          ].map(s => (
            <div key={s.label} className="rounded-2xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8]">{s.label}</p>
              <p className={`text-base font-black ${s.tone}`}>{formatRs(s.v)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex gap-2" role="tablist" aria-label="Bill filters">
          {chips.map(c => (
            <button key={c.id} type="button" role="tab" aria-selected={filter === c.id} onClick={() => setFilter(c.id)}
              className={`min-h-[44px] px-4 rounded-2xl text-sm font-bold ${filter === c.id
                ? 'bg-[#1d4ed8] text-white' : 'bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 text-[#475569] dark:text-[#94a3b8]'}`}>
              {c.label}
            </button>
          ))}
        </div>
        <input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name / bill no"
          aria-label="Search bills"
          className="flex-1 min-w-[120px] min-h-[44px] px-4 rounded-2xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 text-sm text-[#0f172a] dark:text-white placeholder-[#94a3b8] outline-none" />
        <label className="flex items-center gap-2 cursor-pointer min-h-[44px] px-2">
          <input type="checkbox" checked={showVoided} onChange={e => setShowVoided(e.target.checked)} className="w-5 h-5 accent-[#1d4ed8]" />
          <span className="text-xs font-bold text-[#64748b] dark:text-[#94a3b8]">Show voided</span>
        </label>
      </div>

      {liveBills.length > 0 && (
        <div className="flex gap-2 mb-3">
          <button type="button" onClick={() => setPrintAll(true)}
            className="flex-1 min-h-[48px] rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-sm font-bold text-[#0f172a] dark:text-white">
            Print all bills
          </button>
          <button type="button" onClick={() => setShareAll(s => !s)} aria-expanded={shareAll}
            className="flex-1 min-h-[48px] rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-sm font-bold text-[#0f172a] dark:text-white">
            Share all
          </button>
        </div>
      )}

      {shareAll && liveBills.length > 0 && (
        <div className="rounded-2xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-3 mb-3 space-y-1 max-h-[240px] overflow-y-auto">
          <p className="text-[11px] text-[#94a3b8] px-1 pb-1">Har customer ke liye alag WhatsApp link — ek ek karke kholein (auto-open nahi hota).</p>
          {liveBills.map(b => {
            const c = customerOf(b.customer_id);
            const ok = digitsOnly(c?.phone || '').length >= 10;
            const text = `Assalam o Alaikum ${nameOf(b.customer_id)}, ${mLabel} ka bill ${b.bill_no}: bottles ${b.bottles_delivered}, bill Rs. ${b.billed.toLocaleString('en-US')}, ada Rs. ${b.paid.toLocaleString('en-US')}, baqaya Rs. ${b.closing_due.toLocaleString('en-US')}. Shukriya.`;
            return (
              <div key={b.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
                <span className="text-sm font-semibold text-[#0f172a] dark:text-white truncate">{nameOf(b.customer_id)}</span>
                {ok ? (
                  <a href={`https://wa.me/${waNumber92(c!.phone)}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer"
                    className="shrink-0 min-h-[40px] px-3 rounded-xl bg-[rgba(34,197,94,0.12)] text-[#15803d] dark:text-[#4ade80] text-xs font-bold flex items-center">
                    WhatsApp
                  </a>
                ) : (
                  <span className="text-[11px] text-[#94a3b8]">No phone</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {loading && <p className="text-sm text-[#94a3b8] text-center py-8">Loading…</p>}
      {!loading && visible.length === 0 && (
        <p className="text-sm text-[#94a3b8] text-center py-8">No bills for this month yet. Generate bills upar.</p>
      )}

      <div className="space-y-2">
        {visible.map(b => (
          <button key={b.id} type="button" onClick={() => !b.voided_at && setOpenBill(b)} disabled={!!b.voided_at}
            className="w-full text-left rounded-2xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-4 disabled:opacity-60">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="text-sm font-black text-[#1d4ed8] dark:text-[#93c5fd]">{b.bill_no}</span>
              {b.voided_at
                ? <span className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-lg bg-[rgba(239,68,68,0.12)] text-[#b91c1c] dark:text-[#f87171]">Voided</span>
                : <span className={`text-sm font-black ${b.closing_due > 0 ? 'text-[#b91c1c] dark:text-[#f87171]' : 'text-[#15803d] dark:text-[#4ade80]'}`}>{formatRs(b.closing_due)}</span>}
            </div>
            <p className="text-sm font-bold text-[#0f172a] dark:text-white truncate">{nameOf(b.customer_id)}</p>
            <p className="text-xs text-[#64748b] dark:text-[#94a3b8] font-semibold mt-0.5">
              {b.bottles_delivered} bottles • Billed {formatRs(b.billed)} • Paid {formatRs(b.paid)}
            </p>
          </button>
        ))}
      </div>

      {openBill && (
        <BillView
          bill={openBill}
          customer={customerOf(openBill.customer_id)}
          customerName={nameOf(openBill.customer_id)}
          rate={rateMap.get(openBill.customer_id) ?? 0}
          settings={settings}
          monthLabel={mLabel}
          onClose={() => setOpenBill(null)}
          onVoided={() => { setOpenBill(null); load(); }}
        />
      )}

      {printAll && (
        <PrintAllBills
          bills={liveBills}
          nameOf={nameOf}
          customerOf={customerOf}
          rateMap={rateMap}
          settings={settings}
          monthLabel={mLabel}
          onClose={() => setPrintAll(false)}
        />
      )}
    </div>
  );
}

/* ── Print all bills: one job, page-break per bill ── */

function PrintAllBills({ bills, nameOf, customerOf, rateMap, settings, monthLabel, onClose }: {
  bills: WaterBill[];
  nameOf: (id: string) => string;
  customerOf: (id: string) => WaterCustomer | null;
  rateMap: Map<string, number>;
  settings: AppSettings;
  monthLabel: string;
  onClose: () => void;
}): React.JSX.Element {
  const doPrint = () => {
    document.body.classList.add('water-printing');
    setTimeout(() => {
      window.print();
      setTimeout(() => document.body.classList.remove('water-printing'), 500);
    }, 50);
  };
  const cell: React.CSSProperties = { border: '1px solid #000', padding: '5px 7px', fontSize: '11pt', color: '#000', background: '#fff' };
  return (
    <div className="fixed inset-0 z-50 bg-white overflow-y-auto" role="dialog" aria-modal="true" aria-label="Print all bills">
      <style>{PRINT_ALL_CSS}</style>
      <div className="no-print sticky top-0 flex items-center gap-2 px-4 py-3 bg-white border-b border-[#e2e8f0]">
        <button type="button" onClick={onClose} aria-label="Close"
          className="min-h-[44px] min-w-[44px] rounded-2xl border border-[#e2e8f0] text-lg font-black">×</button>
        <p className="flex-1 text-sm font-black">{bills.length} bills — {monthLabel}</p>
        <button type="button" onClick={doPrint}
          className="min-h-[44px] px-5 rounded-2xl bg-[#0f172a] text-white text-sm font-bold">Print</button>
      </div>
      <div id="water-print-sheet" style={{ background: '#fff', color: '#000', fontFamily: 'Arial, sans-serif' }}>
        {bills.map(b => {
          const c = customerOf(b.customer_id);
          return (
            <div key={b.id} className="bill-page" style={{ maxWidth: '700px', margin: '0 auto', padding: '16px' }}>
              <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '8px', marginBottom: '8px' }}>
                <p style={{ fontSize: '16pt', fontWeight: 800, margin: 0 }}>{settings.businessName}</p>
                <p style={{ fontSize: '13pt', fontWeight: 800, margin: '6px 0 0' }}>MONTHLY BILL — {b.bill_no}</p>
                <p style={{ fontSize: '10pt', margin: '2px 0' }}>{monthLabel} ({formatDayPK(b.period_from)} – {formatDayPK(b.period_to)})</p>
              </div>
              <p style={{ fontSize: '12pt', fontWeight: 700, margin: '0 0 2px' }}>{nameOf(b.customer_id)}</p>
              {c?.phone ? <p style={{ fontSize: '10pt', margin: '0 0 2px' }}>{c.phone}</p> : null}
              {c?.address ? <p style={{ fontSize: '10pt', margin: '0 0 8px' }}>{c.address}</p> : null}
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  {[
                    ['Opening balance', formatRs(b.opening_due)],
                    ['Bottles delivered', String(b.bottles_delivered)],
                    ['Rate (per bottle)', formatRs(rateMap.get(b.customer_id) ?? 0)],
                    ['Billed', formatRs(b.billed)],
                    ['Paid in period', formatRs(b.paid)],
                    ['CLOSING DUE', formatRs(b.closing_due)],
                    ['Bottles with customer', String(b.bottles_out)],
                  ].map(([k, v]) => (
                    <tr key={k}>
                      <td style={{ ...cell, fontWeight: k === 'CLOSING DUE' ? 800 : 700 }}>{k}</td>
                      <td style={{ ...cell, textAlign: 'right', fontWeight: k === 'CLOSING DUE' ? 800 : 400 }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ textAlign: 'center', fontSize: '11pt', marginTop: '10px' }}>Shukriya.</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
