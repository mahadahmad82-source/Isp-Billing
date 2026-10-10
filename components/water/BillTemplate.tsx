import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { AppSettings } from '../../types';
import type { WaterBill, WaterCustomer } from './waterTypes';
import { formatRs, formatDayPK } from './waterTypes';

interface Props {
  bill: WaterBill;
  customer: WaterCustomer | null;
  customerName: string;
  /** Rate from customer settings — display only, never used in math. */
  rate: number;
  settings: AppSettings;
  /** e.g. "September 2026". */
  monthLabel: string;
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

type Status = 'paid' | 'partial' | 'unpaid';
// Bill is a snapshot — status is derived client-side from the stored numbers only.
const statusOf = (b: WaterBill): Status =>
  b.closing_due <= 0 ? 'paid' : b.paid > 0 ? 'partial' : 'unpaid';

const STATUS_META: Record<Status, { label: string; bg: string; fg: string }> = {
  paid: { label: 'PAID', bg: '#dcfce7', fg: '#166534' },
  partial: { label: 'PARTIAL', bg: '#fef3c7', fg: '#92400e' },
  unpaid: { label: 'UNPAID', bg: '#fee2e2', fg: '#991b1b' },
};

// Inline SVG icons (hex colors only, no emoji).
const DropletIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2s6 6.6 6 11a6 6 0 0 1-12 0c0-4.4 6-11 6-11z" />
  </svg>
);
const CheckIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);
const AlertIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

/**
 * W4: modern customizable water bill template (A4). Numbers come straight
 * from the water_bills snapshot — never recomputed. QR encodes the real
 * mobile payment number from settings (or the bill ref + due amount when
 * none is set); nothing is fabricated. Business logo is shown on the print
 * header when settings.businessLogo exists, otherwise text name only.
 */
export default function BillTemplate({ bill, customer, customerName, rate, settings, monthLabel }: Props): React.JSX.Element {
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  // QR payment code — real data only: settings' mobile number or the bill ref.
  useEffect(() => {
    let live = true;
    const payTarget = settings.jazzcashNo
      ? `JazzCash: ${settings.jazzcashNo}`
      : settings.easypaisaNo
        ? `EasyPaisa: ${settings.easypaisaNo}`
        : '';
    const payload = [
      settings.businessName,
      `Bill ${bill.bill_no} — ${monthLabel}`,
      `Payable: Rs. ${bill.closing_due}`,
      payTarget,
    ].filter(Boolean).join('\n');
    QRCode.toDataURL(payload, { margin: 1, width: 200, errorCorrectionLevel: 'M' })
      .then(u => { if (live) setQrUrl(u); })
      .catch(() => { if (live) setQrUrl(null); });
    return () => { live = false; };
  }, [settings.businessName, settings.jazzcashNo, settings.easypaisaNo, bill.bill_no, bill.closing_due, monthLabel]);

  const status = statusOf(bill);
  const sm = STATUS_META[status];

  const payLines: string[] = [];
  if (settings.jazzcashNo) payLines.push(`JazzCash: ${settings.jazzcashNo}`);
  if (settings.easypaisaNo) payLines.push(`EasyPaisa: ${settings.easypaisaNo}`);
  if (settings.bankName || settings.bankAccountNo || settings.bankIban)
    payLines.push(`Bank: ${[settings.bankName, settings.bankAccountNo, settings.bankIban].filter(Boolean).join(' • ')}`);
  if (settings.globalNote) payLines.push(settings.globalNote);

  const card: React.CSSProperties = { background: '#fff', color: '#000', fontFamily: 'Arial, sans-serif' };
  const statCard: React.CSSProperties = {
    flex: '1 1 0', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px',
    padding: '10px 8px', textAlign: 'center', minWidth: '90px',
  };
  const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', fontSize: '11pt', padding: '7px 4px', borderBottom: '1px solid #e2e8f0' };

  return (
    <>
      <style>{PRINT_CSS}</style>
      <div id="water-print-sheet" style={{ ...card, maxWidth: '700px', margin: '0 auto', padding: '16px', border: '1px solid #000' }}>
        {/* Header band */}
        <div style={{ background: '#1d4ed8', color: '#fff', borderRadius: '10px', padding: '14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          {settings.businessLogo ? (
            <img src={settings.businessLogo} alt="Business logo" style={{ width: '56px', height: '56px', objectFit: 'contain', background: '#fff', borderRadius: '8px', padding: '4px' }} />
          ) : null}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: '16pt', fontWeight: 800, margin: 0 }}>{settings.businessName}</p>
            {settings.businessPhone ? <p style={{ fontSize: '9pt', margin: '2px 0', opacity: 0.9 }}>{settings.businessPhone}</p> : null}
            {settings.businessAddress ? <p style={{ fontSize: '9pt', margin: 0, opacity: 0.9 }}>{settings.businessAddress}</p> : null}
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: sm.bg, color: sm.fg, fontWeight: 800, fontSize: '10pt', padding: '6px 12px', borderRadius: '999px' }}>
            {status === 'paid' ? <CheckIcon /> : <AlertIcon />}{sm.label}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '10px' }}>
          <p style={{ fontSize: '14pt', fontWeight: 800, margin: 0 }}>MONTHLY BILL</p>
          <p style={{ fontSize: '10pt', margin: 0, color: '#475569' }}>{bill.bill_no}</p>
        </div>
        <p style={{ fontSize: '10pt', margin: '2px 0 0', color: '#475569' }}>
          {monthLabel} ({formatDayPK(bill.period_from)} – {formatDayPK(bill.period_to)})
        </p>

        {/* Customer */}
        <p style={{ fontSize: '10pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', margin: '12px 0 4px', color: '#475569' }}>Customer</p>
        <p style={{ fontSize: '13pt', fontWeight: 700, margin: 0 }}>{customerName}</p>
        {customer?.phone ? <p style={{ fontSize: '10pt', margin: '2px 0 0' }}>{customer.phone}</p> : null}
        {customer?.address ? <p style={{ fontSize: '10pt', margin: '2px 0 0' }}>{customer.address}</p> : null}

        {/* Consumption stats */}
        <p style={{ fontSize: '10pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', margin: '14px 0 6px', color: '#475569' }}>Consumption</p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {[
            { label: 'Bottles delivered', v: String(bill.bottles_delivered) },
            { label: 'Bottles with customer', v: String(bill.bottles_out) },
            { label: 'Empties returned', v: String(bill.empties_returned) },
          ].map(s => (
            <div key={s.label} style={statCard}>
              <div style={{ color: '#1d4ed8', marginBottom: '4px', display: 'flex', justifyContent: 'center' }}><DropletIcon /></div>
              <p style={{ fontSize: '15pt', fontWeight: 800, margin: 0 }}>{s.v}</p>
              <p style={{ fontSize: '8pt', fontWeight: 700, color: '#64748b', margin: '2px 0 0', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Charge breakdown */}
        <p style={{ fontSize: '10pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', margin: '14px 0 4px', color: '#475569' }}>Charges</p>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '4px 10px' }}>
          <div style={row}><span>Opening balance</span><span>{formatRs(bill.opening_due)}</span></div>
          <div style={row}><span>Bottles delivered × {formatRs(rate)} rate</span><span>{bill.bottles_delivered} × {formatRs(rate)}</span></div>
          <div style={row}><span>Billed</span><span>{formatRs(bill.billed)}</span></div>
          <div style={row}><span>Paid in period</span><span style={{ color: '#166534', fontWeight: 700 }}>− {formatRs(bill.paid)}</span></div>
          <div style={{ ...row, borderBottom: 'none', background: '#eff6ff', margin: '0 -10px', padding: '9px 14px', borderRadius: '0 0 9px 9px' }}>
            <span style={{ fontWeight: 800, fontSize: '13pt' }}>CLOSING DUE</span>
            <span style={{ fontWeight: 800, fontSize: '13pt', color: bill.closing_due > 0 ? '#991b1b' : '#166534' }}>{formatRs(bill.closing_due)}</span>
          </div>
        </div>

        {/* Payment + QR */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '14px' }}>
          <div style={{ flex: '1 1 220px', minWidth: '200px' }}>
            <p style={{ fontSize: '10pt', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 6px', color: '#475569' }}>How to pay</p>
            {payLines.length > 0 ? (
              payLines.map((l, i) => <p key={i} style={{ fontSize: '10pt', margin: '0 0 3px' }}>{l}</p>)
            ) : (
              <p style={{ fontSize: '10pt', margin: 0, color: '#64748b' }}>Cash on delivery ya upar diye gaye number par rabta karein.</p>
            )}
          </div>
          {qrUrl ? (
            <div style={{ textAlign: 'center' }}>
              <img src={qrUrl} alt="QR code with payment details" style={{ width: '120px', height: '120px', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
              <p style={{ fontSize: '8pt', color: '#64748b', margin: '4px 0 0' }}>Scan for payment details</p>
            </div>
          ) : null}
        </div>

        <p style={{ textAlign: 'center', fontSize: '9pt', color: '#64748b', marginTop: '16px' }}>
          Bill generated {formatDayPK(bill.created_at)}. Shukriya.
        </p>
      </div>
    </>
  );
}
