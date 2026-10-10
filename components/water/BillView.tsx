import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { AppSettings } from '../../types';
import type { WaterBill, WaterCustomer } from './waterTypes';
import { formatRs, formatDayPK, waNumber92, digitsOnly } from './waterTypes';
import { SheetShell } from './VehiclesPanel';
import BillTemplate from './BillTemplate';

interface Props {
  bill: WaterBill;
  customer: WaterCustomer | null;
  customerName: string;
  /** Rate from customer settings — display only, never used in math. */
  rate: number;
  settings: AppSettings;
  /** e.g. "September 2026". */
  monthLabel: string;
  onClose: () => void;
  onVoided: () => void;
  /** W4: opt-in modern bill template. Default 'classic' keeps the current design exactly. */
  template?: 'classic' | 'modern';
}

const PRINT_CSS = `
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

const doc: React.CSSProperties = { background: '#fff', color: '#000', fontFamily: 'Arial, sans-serif' };
const cell: React.CSSProperties = { border: '1px solid #000', padding: '6px 8px', fontSize: '11pt', color: '#000', background: '#fff' };
const th: React.CSSProperties = { ...cell, fontWeight: 800, textAlign: 'left' };
const secT: React.CSSProperties = { fontSize: '10pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', margin: '12px 0 4px', borderBottom: '1px solid #000', paddingBottom: '2px' };

/**
 * M6b: printable monthly bill (A4, black/white). Bill is a snapshot —
 * numbers come straight from the water_bills row, never recomputed.
 */
export default function BillView({ bill, customer, customerName, rate, settings, monthLabel, onClose, onVoided, template }: Props): React.JSX.Element {
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // W4: Classic/Modern template selector, persisted. Defaults to 'classic'
  // so the current design renders exactly as before unless changed.
  const [variant, setVariant] = useState<'classic' | 'modern'>(() => {
    try {
      const saved = localStorage.getItem('bc_water_bill_template');
      if (saved === 'classic' || saved === 'modern') return saved;
    } catch { /* storage unavailable — use the default */ }
    return template ?? 'classic';
  });
  const pickVariant = (v: 'classic' | 'modern') => {
    setVariant(v);
    try { localStorage.setItem('bc_water_bill_template', v); } catch { /* storage unavailable — ignore */ }
  };

  const doPrint = () => {
    document.body.classList.add('water-printing');
    setTimeout(() => {
      window.print();
      setTimeout(() => document.body.classList.remove('water-printing'), 500);
    }, 50);
  };

  const waText = `Assalam o Alaikum ${customerName}, ${monthLabel} ka bill ${bill.bill_no}: bottles ${bill.bottles_delivered}, bill Rs. ${bill.billed.toLocaleString('en-US')}, ada Rs. ${bill.paid.toLocaleString('en-US')}, baqaya Rs. ${bill.closing_due.toLocaleString('en-US')}. Shukriya.`;
  const waLink = `https://wa.me/${waNumber92(customer?.phone || '')}?text=${encodeURIComponent(waText)}`;

  const payLines: string[] = [];
  if (settings.jazzcashNo) payLines.push(`JazzCash: ${settings.jazzcashNo}`);
  if (settings.easypaisaNo) payLines.push(`EasyPaisa: ${settings.easypaisaNo}`);
  if (settings.bankName || settings.bankAccountNo || settings.bankIban)
    payLines.push(`Bank: ${[settings.bankName, settings.bankAccountNo, settings.bankIban].filter(Boolean).join(' • ')}`);
  if (settings.globalNote) payLines.push(settings.globalNote);

  const doVoid = async () => {
    if (busy || !reason.trim()) { setMsg('Void reason likhna zaroori hai.'); return; }
    setBusy(true);
    setMsg(null);
    try {
      const { data, error } = await supabase.rpc('water_void_bill', { p_id: bill.id, p_reason: reason.trim() });
      if (error || (data && !data.success)) {
        const transport = (error as { message?: string } | null)?.message;
        const payload = data && typeof data === 'object' && 'error' in data ? String((data as { error?: unknown }).error || '') : '';
        throw new Error(transport || payload || 'Void failed.');
      }
      onVoided();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Void failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetShell title={`Bill ${bill.bill_no}`} onClose={onClose} busy={busy}>
      <style>{PRINT_CSS}</style>
      {msg && (
        <div className="no-print text-sm font-semibold px-3 py-2.5 rounded-2xl mb-3 bg-[rgba(239,68,68,0.12)] text-[#b91c1c] dark:text-[#f87171]">{msg}</div>
      )}

      <div className="no-print flex flex-wrap items-center gap-2 mb-3">
        {/* W4: template selector */}
        <div className="flex rounded-2xl overflow-hidden border border-[#e2e8f0] dark:border-white/10">
          {(['classic', 'modern'] as const).map(v => (
            <button key={v} type="button" onClick={() => pickVariant(v)} aria-pressed={variant === v}
              className={`min-h-[44px] px-3 text-xs font-bold uppercase tracking-widest ${variant === v
                ? 'bg-[#1d4ed8] text-white' : 'text-[#475569] dark:text-[#94a3b8]'}`}>{v}</button>
          ))}
        </div>
        <button type="button" onClick={doPrint}
          className="min-h-[44px] px-4 rounded-2xl bg-[#0f172a] dark:bg-white text-white dark:text-[#0f172a] text-sm font-bold">
          Print
        </button>
        {digitsOnly(customer?.phone || '').length >= 10 && (
          <a href={waLink} target="_blank" rel="noopener noreferrer"
            className="min-h-[44px] px-4 rounded-2xl bg-[rgba(34,197,94,0.12)] text-[#15803d] dark:text-[#4ade80] text-sm font-bold flex items-center">
            WhatsApp
          </a>
        )}
        <button type="button" onClick={() => setVoiding(v => !v)}
          className="min-h-[44px] px-4 rounded-2xl border border-[rgba(239,68,68,0.3)] text-[#b91c1c] dark:text-[#f87171] text-sm font-bold">
          Void bill
        </button>
      </div>

      {voiding && (
        <div className="no-print rounded-2xl border border-[rgba(239,68,68,0.3)] p-3 mb-3">
          <label className="text-xs font-black uppercase tracking-widest text-[#64748b] mb-1.5 block" htmlFor="bv-reason">Void reason *</label>
          <input id="bv-reason" type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason"
            className="w-full min-h-[48px] px-4 rounded-2xl bg-[#f8fafc] dark:bg-white/[0.03] border border-[#e2e8f0] dark:border-white/10 text-base text-[#0f172a] dark:text-white outline-none mb-2" />
          <div className="flex gap-2">
            <button type="button" onClick={() => setVoiding(false)} disabled={busy}
              className="flex-1 min-h-[48px] rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-sm font-bold disabled:opacity-50">Cancel</button>
            <button type="button" onClick={doVoid} disabled={busy}
              className="flex-1 min-h-[48px] rounded-2xl bg-[#dc2626] text-white text-sm font-bold disabled:opacity-50">{busy ? 'Voiding…' : 'Confirm void'}</button>
          </div>
          <p className="text-[11px] text-[#94a3b8] mt-2">Void ke baad dobara generate karne par naya bill number banta hai.</p>
        </div>
      )}

      {variant === 'modern' ? (
        <BillTemplate bill={bill} customer={customer} customerName={customerName} rate={rate} settings={settings} monthLabel={monthLabel} />
      ) : (
      <div id="water-print-sheet" style={{ ...doc, maxWidth: '700px', margin: '0 auto', padding: '16px', border: '1px solid #000' }}>
        <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '8px', marginBottom: '8px' }}>
          <p style={{ fontSize: '18pt', fontWeight: 800, margin: 0 }}>{settings.businessName}</p>
          {settings.businessPhone ? <p style={{ fontSize: '10pt', margin: '2px 0' }}>{settings.businessPhone}</p> : null}
          {settings.businessAddress ? <p style={{ fontSize: '10pt', margin: 0 }}>{settings.businessAddress}</p> : null}
          <p style={{ fontSize: '14pt', fontWeight: 800, margin: '8px 0 0' }}>MONTHLY BILL</p>
          <p style={{ fontSize: '10pt', margin: '2px 0' }}>Bill No: {bill.bill_no} &nbsp;•&nbsp; {monthLabel} ({formatDayPK(bill.period_from)} – {formatDayPK(bill.period_to)})</p>
        </div>

        <p style={secT}>Customer</p>
        <p style={{ fontSize: '12pt', fontWeight: 700, margin: '0 0 2px' }}>{customerName}</p>
        {customer?.phone ? <p style={{ fontSize: '10pt', margin: '0 0 2px' }}>{customer.phone}</p> : null}
        {customer?.address ? <p style={{ fontSize: '10pt', margin: 0 }}>{customer.address}</p> : null}

        <p style={secT}>Bill details</p>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr><td style={th}>Opening balance</td><td style={{ ...cell, textAlign: 'right' }}>{formatRs(bill.opening_due)}</td></tr>
            <tr><td style={th}>Bottles delivered</td><td style={{ ...cell, textAlign: 'right' }}>{bill.bottles_delivered}</td></tr>
            <tr><td style={th}>Rate (per bottle)</td><td style={{ ...cell, textAlign: 'right' }}>{formatRs(rate)}</td></tr>
            <tr><td style={th}>Billed</td><td style={{ ...cell, textAlign: 'right' }}>{formatRs(bill.billed)}</td></tr>
            <tr><td style={th}>Paid in period</td><td style={{ ...cell, textAlign: 'right' }}>{formatRs(bill.paid)}</td></tr>
            <tr>
              <td style={{ ...th, fontSize: '13pt' }}>CLOSING DUE</td>
              <td style={{ ...cell, textAlign: 'right', fontWeight: 800, fontSize: '13pt' }}>{formatRs(bill.closing_due)}</td>
            </tr>
            <tr><td style={th}>Bottles with customer</td><td style={{ ...cell, textAlign: 'right' }}>{bill.bottles_out}</td></tr>
          </tbody>
        </table>

        {payLines.length > 0 && (
          <>
            <p style={secT}>Payment instructions</p>
            {payLines.map((l, i) => <p key={i} style={{ fontSize: '10pt', margin: '0 0 2px' }}>{l}</p>)}
          </>
        )}
        <p style={{ textAlign: 'center', fontSize: '11pt', marginTop: '14px' }}>Shukriya.</p>
      </div>
      )}
    </SheetShell>
  );
}
