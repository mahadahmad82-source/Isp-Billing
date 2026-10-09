// Printable pending-recovery documents for the Copilot. Plain HTML + inline CSS
// (no oklch, no emoji, no external assets) printed through a hidden iframe so
// the browser's print dialog can print or "Save as PDF".
import type { LedgerRow } from '../recoveryCalc';
import type { Receipt } from '../../types';

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const money = (n: number) => `Rs. ${Math.round(n).toLocaleString('en-PK')}`;
const day = (iso?: string) => {
  if (!iso) return '-';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

const CSS = `
  *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px;font-size:12px}
  h1{font-size:18px;margin:0 0 2px} .sub{color:#555;margin:0 0 14px;font-size:11px}
  table{width:100%;border-collapse:collapse} th,td{border:1px solid #bbb;padding:5px 6px;text-align:left;vertical-align:top}
  th{background:#eee;font-size:11px} td.n,th.n{text-align:right;white-space:nowrap}
  tfoot td{font-weight:bold;background:#f6f6f6} .meta td{border:none;padding:2px 8px 2px 0}
  .tag{display:inline-block;padding:1px 6px;border:1px solid #888;border-radius:3px;font-size:10px}
  @media print{body{margin:10mm} tr{page-break-inside:avoid}}`;

export function buildPendingListHtml(rows: LedgerRow[], period: string, managerName: string, scopeLabel: string): string {
  const sorted = [...rows].sort((a, b) => b.toCollect - a.toCollect || a.name.localeCompare(b.name));
  const total = sorted.reduce((s, r) => s + r.toCollect, 0);
  const body = sorted.map((r, i) => `<tr><td>${i + 1}</td><td>${esc(r.name)}<br><span style="color:#666">@${esc(r.username)}</span></td>
    <td>${esc(r.phone)}</td><td>${esc(r.plan)}</td><td class="n">${money(r.netFee)}</td><td class="n">${money(Math.max(0, r.balance))}</td><td class="n"><b>${money(r.toCollect)}</b></td><td>${day(r.expiryDate)}</td></tr>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Pending Recovery - ${esc(period)}</title><style>${CSS}</style></head><body>
    <h1>Pending Recovery List - ${esc(period)}</h1>
    <p class="sub">${esc(scopeLabel)} | ${esc(managerName)} | Generated ${day(new Date().toISOString())}</p>
    <table><thead><tr><th>#</th><th>Customer</th><th>Phone</th><th>Plan</th><th class="n">This Month Fee</th><th class="n">Previous Dues</th><th class="n">To Collect</th><th>Expiry</th></tr></thead>
    <tbody>${body}</tbody>
    <tfoot><tr><td colspan="6">Total to collect (${sorted.length} customers)</td><td class="n">${money(total)}</td><td></td></tr></tfoot></table></body></html>`;
}

export function buildCustomerStatementHtml(row: LedgerRow, receipts: Receipt[], period: string, managerName: string): string {
  const recent = [...receipts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 6);
  const statusText = row.status === 'paid' ? 'Paid' : row.status === 'advance' ? 'Advance (covered)' : 'Pending';
  const rec = recent.length
    ? recent.map(r => `<tr><td>${esc(r.period)}</td><td>${day(r.date)}</td><td class="n">${money(r.paidAmount)}</td><td class="n">${money(r.balanceAmount ?? 0)}</td></tr>`).join('')
    : '<tr><td colspan="4">No receipts on record.</td></tr>';
  return `<!doctype html><html><head><meta charset="utf-8"><title>Recovery Statement - ${esc(row.name)}</title><style>${CSS}</style></head><body>
    <h1>Recovery Statement - ${esc(row.name)}</h1>
    <p class="sub">${esc(period)} | ${esc(managerName)} | Generated ${day(new Date().toISOString())}</p>
    <table class="meta"><tr><td>Username</td><td>@${esc(row.username)}</td><td>Phone</td><td>${esc(row.phone) || '-'}</td></tr>
    <tr><td>Plan</td><td>${esc(row.plan) || '-'}</td><td>Monthly fee</td><td>${money(row.monthlyFee)}</td></tr>
    <tr><td>Address</td><td>${esc(row.address) || '-'}</td><td>Expiry</td><td>${day(row.expiryDate)}</td></tr>
    <tr><td>${esc(period)} status</td><td><span class="tag">${statusText}</span></td><td>To collect now</td><td><b>${money(row.toCollect)}</b></td></tr>
    <tr><td>Previous dues</td><td>${money(Math.max(0, row.balance))}</td><td>This month fee</td><td>${money(row.netFee)}</td></tr></table>
    <h3 style="margin:16px 0 6px;font-size:13px">Recent payments</h3>
    <table><thead><tr><th>Period</th><th>Date</th><th class="n">Paid</th><th class="n">Balance after</th></tr></thead><tbody>${rec}</tbody></table></body></html>`;
}

/** Print an HTML document via a hidden iframe (print dialog / Save as PDF). */
export function printHtml(html: string): void {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(frame);
  const doc = frame.contentWindow?.document;
  if (!doc || !frame.contentWindow) { frame.remove(); return; }
  doc.open(); doc.write(html); doc.close();
  const win = frame.contentWindow;
  const go = () => { try { win.focus(); win.print(); } finally { setTimeout(() => frame.remove(), 60000); } };
  if (doc.readyState === 'complete') setTimeout(go, 150); else frame.onload = () => setTimeout(go, 150);
}
