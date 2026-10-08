import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { WaterDelivery, WaterPayment, WaterCustomer } from './waterTypes';
import { formatRs, formatDayPK, digitsOnly, waNumber92 } from './waterTypes';
import { SheetShell } from './VehiclesPanel';

export interface ReceiptEntry {
  kind: 'delivery' | 'payment';
  delivery?: WaterDelivery;
  payment?: WaterPayment;
}

interface Props {
  entry: ReceiptEntry;
  customer: WaterCustomer | null;
  customerName: string;
  /** Resolved rate/bottle for deliveries (delivery.rate_per_bottle ?? settings). */
  rate: number;
  vehicleName?: string | null;
  /** Customer's total balance_due from water_customer_ledger; null = hide. */
  balanceDue: number | null;
  businessName: string;
  businessPhone: string;
  onClose: () => void;
  onVoided: () => void;
}

// Print CSS is injected by this component only (removed on unmount).
// Follows the PrintRouteSheet pattern: body.water-printing hides everything
// except #water-print-sheet. Black/white only.
const printCss = (thermal: boolean) => `
@page { size: ${thermal ? '80mm auto' : 'A5 portrait'}; margin: ${thermal ? '3mm' : '8mm'}; }
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
const h1: React.CSSProperties = { fontSize: '18pt', fontWeight: 800, margin: '0 0 2px' };
const sub: React.CSSProperties = { fontSize: '10pt', margin: '0 0 1px' };
const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', fontSize: '11pt', padding: '3px 0', borderBottom: '1px dotted #999' };
const rowB: React.CSSProperties = { ...row, fontWeight: 800, borderBottom: '2px solid #000', fontSize: '12pt' };
const secT: React.CSSProperties = { fontSize: '10pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', margin: '10px 0 4px', borderBottom: '1px solid #000', paddingBottom: '2px' };

const METHOD_LABEL: Record<string, string> = { cash: 'Cash', jazzcash: 'JazzCash', easypaisa: 'EasyPaisa', bank: 'Bank', other: 'Other' };

/**
 * M6b: printable receipt sheet for one delivery or payment.
 * A5 portrait default; 80mm thermal toggle. Print + WhatsApp share (Roman Urdu).
 * Voided entries show a VOIDED stamp and cannot be printed/shared.
 */
export default function ReceiptView({
  entry, customer, customerName, rate, vehicleName, balanceDue,
  businessName, businessPhone, onClose, onVoided,
}: Props): React.JSX.Element {
  const [thermal, setThermal] = useState(false);
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const d = entry.delivery;
  const p = entry.payment;
  const voidedAt = d?.voided_at || p?.voided_at || null;
  const voidReason = d?.void_reason || p?.void_reason || null;
  const receiptNo = d?.receipt_no || p?.receipt_no || '—';
  const dateIso = d?.delivery_date || p?.pay_date || '';
  const createdAt = d?.created_at || p?.created_at || '';
  const timeStr = (() => {
    const t = new Date(createdAt);
    return Number.isNaN(t.getTime()) ? '' : t.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' });
  })();

  const bottles = d?.bottles_delivered || 0;
  const amount = bottles * rate;
  const paid = d?.amount_collected || p?.amount || 0;
  const receiptBal = amount - paid;

  const doPrint = () => {
    document.body.classList.add('water-printing');
    setTimeout(() => {
      window.print();
      setTimeout(() => document.body.classList.remove('water-printing'), 500);
    }, 50);
  };

  const waText = d
    ? `Assalam o Alaikum ${customerName}, ${businessName} - Receipt ${receiptNo} (${formatDayPK(dateIso)}): ${bottles} bottles x Rs.${rate} = Rs.${amount.toLocaleString('en-US')}, ada Rs.${paid.toLocaleString('en-US')}, is receipt ka baqaya Rs.${receiptBal.toLocaleString('en-US')}.${balanceDue != null ? ` Kul baqaya Rs.${balanceDue.toLocaleString('en-US')}.` : ''} Shukriya.`
    : `Assalam o Alaikum ${customerName}, ${businessName} - Payment received: Rs.${paid.toLocaleString('en-US')} (${METHOD_LABEL[p?.method || 'cash'] || p?.method}), receipt ${receiptNo} (${formatDayPK(dateIso)}).${balanceDue != null ? ` Baqaya Rs.${balanceDue.toLocaleString('en-US')}.` : ''} Shukriya.`;
  const waLink = voidedAt ? null : `https://wa.me/${waNumber92(customer?.phone || '')}?text=${encodeURIComponent(waText)}`;

  const doVoid = async () => {
    if (busy || !reason.trim()) { setMsg('Void reason likhna zaroori hai.'); return; }
    setBusy(true);
    setMsg(null);
    try {
      const rpc = d ? 'water_void_delivery' : 'water_void_payment';
      const id = d?.id || p?.id || '';
      const { data, error } = await supabase.rpc(rpc, { p_id: id, p_reason: reason.trim() });
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
    <SheetShell title={`Receipt ${receiptNo}`} onClose={onClose} busy={busy}>
      <style>{printCss(thermal)}</style>
      {msg && (
        <div className="no-print text-sm font-semibold px-3 py-2.5 rounded-2xl mb-3 bg-[rgba(239,68,68,0.12)] text-[#b91c1c] dark:text-[#f87171]">{msg}</div>
      )}

      {/* Layout toggle + actions (screen only) */}
      <div className="no-print flex flex-wrap items-center gap-2 mb-3">
        <div className="flex rounded-2xl overflow-hidden border border-[#e2e8f0] dark:border-white/10">
          {(['A5', '80mm'] as const).map(l => {
            const sel = (l === '80mm') === thermal;
            return (
              <button key={l} type="button" onClick={() => setThermal(l === '80mm')} aria-pressed={sel}
                className={`min-h-[44px] px-4 text-sm font-bold ${sel ? 'bg-[#1d4ed8] text-white' : 'text-[#475569] dark:text-[#94a3b8]'}`}>{l}</button>
            );
          })}
        </div>
        {!voidedAt && (
          <>
            <button type="button" onClick={doPrint}
              className="min-h-[44px] px-4 rounded-2xl bg-[#0f172a] dark:bg-white text-white dark:text-[#0f172a] text-sm font-bold">
              Print
            </button>
            {/* W5: explicit PDF action — same print dialog, user picks "Save as PDF"
                (matches the SubManager Recovery PDF labeling convention). */}
            <button type="button" onClick={doPrint}
              className="min-h-[44px] px-4 rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-[#0f172a] dark:text-white text-sm font-bold flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              PDF
            </button>
            {waLink && digitsOnly(customer?.phone || '').length >= 10 && (
              <a href={waLink} target="_blank" rel="noopener noreferrer"
                className="min-h-[44px] px-4 rounded-2xl bg-[rgba(34,197,94,0.12)] text-[#15803d] dark:text-[#4ade80] text-sm font-bold flex items-center">
                WhatsApp
              </a>
            )}
            <button type="button" onClick={() => setVoiding(v => !v)}
              className="min-h-[44px] px-4 rounded-2xl border border-[rgba(239,68,68,0.3)] text-[#b91c1c] dark:text-[#f87171] text-sm font-bold">
              Void
            </button>
          </>
        )}
      </div>

      {voiding && !voidedAt && (
        <div className="no-print rounded-2xl border border-[rgba(239,68,68,0.3)] p-3 mb-3">
          <label className="text-xs font-black uppercase tracking-widest text-[#64748b] mb-1.5 block" htmlFor="rv-reason">Void reason *</label>
          <input id="rv-reason" type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason"
            className="w-full min-h-[48px] px-4 rounded-2xl bg-[#f8fafc] dark:bg-white/[0.03] border border-[#e2e8f0] dark:border-white/10 text-base text-[#0f172a] dark:text-white outline-none mb-2" />
          <div className="flex gap-2">
            <button type="button" onClick={() => setVoiding(false)} disabled={busy}
              className="flex-1 min-h-[48px] rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-sm font-bold disabled:opacity-50">Cancel</button>
            <button type="button" onClick={doVoid} disabled={busy}
              className="flex-1 min-h-[48px] rounded-2xl bg-[#dc2626] text-white text-sm font-bold disabled:opacity-50">{busy ? 'Voiding…' : 'Confirm void'}</button>
          </div>
          <p className="text-[11px] text-[#94a3b8] mt-2">Voided entries stay in the list with a badge; they are never deleted.</p>
        </div>
      )}

      {/* Printable document */}
      <div id="water-print-sheet" style={{ ...doc, maxWidth: thermal ? '80mm' : '480px', margin: '0 auto', padding: thermal ? '4px' : '16px', border: '1px solid #000' }}>
        <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: '8px', marginBottom: '8px' }}>
          <p style={h1}>{businessName}</p>
          {businessPhone ? <p style={sub}>{businessPhone}</p> : null}
          <p style={{ ...sub, fontWeight: 800, fontSize: '13pt', marginTop: '6px' }}>{d ? 'RECEIPT' : 'PAYMENT RECEIPT'}</p>
          <p style={sub}>No: {receiptNo} &nbsp;•&nbsp; {formatDayPK(dateIso)}{timeStr ? ` ${timeStr}` : ''}</p>
        </div>

        {voidedAt && (
          <div style={{ textAlign: 'center', margin: '8px 0' }}>
            <span style={{ display: 'inline-block', border: '3px solid #000', padding: '4px 16px', fontWeight: 800, fontSize: '16pt' }}>VOIDED</span>
            {voidReason ? <p style={sub}>Reason: {voidReason}</p> : null}
          </div>
        )}

        <p style={secT}>Customer</p>
        <p style={{ ...sub, fontWeight: 700, fontSize: '12pt' }}>{customerName}</p>
        {customer?.phone ? <p style={sub}>{customer.phone}</p> : null}
        {customer?.address ? <p style={sub}>{customer.address}</p> : null}

        {d && (d.rider_username || vehicleName) && (
          <>
            <p style={secT}>Delivery</p>
            {d.rider_username ? <p style={sub}>Rider: {d.rider_username}</p> : null}
            {vehicleName ? <p style={sub}>Vehicle: {vehicleName}</p> : null}
          </>
        )}

        <p style={secT}>{d ? 'Details' : 'Payment'}</p>
        {d ? (
          <>
            <div style={row}><span>Bottles delivered {bottles} x {formatRs(rate)}</span><span>{formatRs(amount)}</span></div>
            <div style={row}><span>Empties returned</span><span>{d.empties_returned}</span></div>
            <div style={row}><span>Paid at delivery</span><span>{formatRs(paid)}</span></div>
            <div style={rowB}><span>This receipt balance</span><span>{formatRs(receiptBal)}</span></div>
            {d.note ? <p style={{ ...sub, marginTop: '6px' }}>Note: {d.note}</p> : null}
          </>
        ) : (
          <>
            <div style={row}><span>Payment received ({METHOD_LABEL[p?.method || 'cash'] || p?.method})</span><span>{formatRs(paid)}</span></div>
            {p?.note ? <p style={{ ...sub, marginTop: '6px' }}>Note: {p.note}</p> : null}
          </>
        )}

        {balanceDue != null && (
          <div style={{ ...rowB, marginTop: '8px' }}><span>Customer ka kul baqaya</span><span>{formatRs(balanceDue)}</span></div>
        )}
        <p style={{ textAlign: 'center', fontSize: '11pt', marginTop: '12px' }}>Shukriya.</p>
      </div>
    </SheetShell>
  );
}
