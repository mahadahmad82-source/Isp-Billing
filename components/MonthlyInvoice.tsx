import React, { useState, useMemo } from 'react';
import { UserRecord, Receipt, AppSettings, PlanChange } from '../types';
import { useIsDark } from '../hooks/useIsDark';
import { ReceiptIcon, ClipboardIcon } from './icons/UiIcons';

interface Props {
  users: UserRecord[];
  receipts: Receipt[];
  settings: AppSettings;
  planHistory: PlanChange[];
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const MonthlyInvoice: React.FC<Props> = ({ users, receipts, settings, planHistory }) => {
  const isDark = useIsDark();
  const now = new Date();
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<number>(now.getMonth());
  const [selectedYear, setSelectedYear] = useState<number>(now.getFullYear());
  const [taxRate, setTaxRate] = useState<number>(0);
  const [search, setSearch] = useState('');
  const [invoiceNum, setInvoiceNum] = useState(`INV-${Date.now().toString().slice(-6)}`);

  const activeUsers = useMemo(() => users.filter(u => u.status !== 'deleted'), [users]);
  const filteredUsers = useMemo(() => {
    if (!search.trim()) return activeUsers;
    const q = search.toLowerCase();
    return activeUsers.filter(u => u.name.toLowerCase().includes(q) || u.phone?.includes(q));
  }, [activeUsers, search]);

  const user = useMemo(() => users.find(u => u.id === selectedUser), [users, selectedUser]);

  const monthReceipts = useMemo(() => {
    if (!user) return [];
    return receipts.filter(r => {
      if (r.customerId !== user.id && r.customerName !== user.name) return false;
      const d = new Date(r.date);
      return d.getMonth() === selectedMonth && d.getFullYear() === selectedYear;
    });
  }, [receipts, user, selectedMonth, selectedYear]);

  const totalPaid = monthReceipts.reduce((s, r) => s + (r.paidAmount || 0), 0);
  const fee = user?.monthlyFee || 0;
  const tax = Math.round(fee * taxRate / 100);
  const total = fee + tax;
  const balance = total - totalPaid;

  const handlePrint = () => {
    if (!user) return;
    const win = window.open('', '_blank');
    if (!win) return;
    const monthLabel = `${MONTHS[selectedMonth]} ${selectedYear}`;
    win.document.write(`<!DOCTYPE html><html><head>
<title>Invoice ${invoiceNum}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; padding: 30px; color: #111; background: #fff; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:30px; padding-bottom:20px; border-bottom:2px solid #4f46e5; }
  .biz-name { font-size:22px; font-weight:900; color:#4f46e5; }
  .biz-sub { font-size:12px; color:#666; margin-top:4px; }
  .inv-label { text-align:right; }
  .inv-label h2 { font-size:28px; font-weight:900; color:#4f46e5; letter-spacing:2px; }
  .inv-label p { font-size:12px; color:#666; margin-top:2px; }
  .parties { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-bottom:24px; }
  .party h4 { font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:#999; margin-bottom:8px; }
  .party p { font-size:13px; margin-bottom:2px; }
  .party .name { font-weight:700; font-size:15px; }
  table { width:100%; border-collapse:collapse; margin-bottom:20px; }
  th { background:#f5f4ff; color:#4f46e5; font-size:11px; text-transform:uppercase; padding:10px 12px; text-align:left; }
  td { padding:10px 12px; font-size:13px; border-bottom:1px solid #eee; }
  .totals { display:flex; justify-content:flex-end; }
  .totals-box { width:260px; }
  .totals-row { display:flex; justify-content:space-between; padding:6px 0; font-size:13px; border-bottom:1px solid #eee; }
  .totals-row.total { font-weight:900; font-size:15px; color:#4f46e5; border-bottom:none; padding-top:10px; }
  .totals-row.balance { font-weight:700; color:${balance > 0 ? '#ef4444' : '#10b981'}; }
  .receipts { margin-top:24px; }
  .receipts h4 { font-size:12px; text-transform:uppercase; color:#999; letter-spacing:.05em; margin-bottom:8px; }
  .footer { margin-top:40px; padding-top:16px; border-top:1px solid #eee; font-size:11px; color:#999; text-align:center; }
  @media print { body { padding:15px } }
</style>
</head><body>
<div class="header">
  <div>
    <div class="biz-name">${settings.businessName || 'MYISP'}</div>
    <div class="biz-sub">${settings.businessPhone || ''} ${settings.businessEmail ? '| '+settings.businessEmail : ''}<br>${settings.businessAddress || ''}</div>
  </div>
  <div class="inv-label">
    <h2>INVOICE</h2>
    <p># ${invoiceNum}</p>
    <p>Date: ${new Date().toLocaleDateString('en-PK')}</p>
    <p>Period: ${monthLabel}</p>
  </div>
</div>
<div class="parties">
  <div class="party">
    <h4>Bill To</h4>
    <p class="name">${user.name}</p>
    <p>${user.phone}</p>
    <p>${user.address || ''}</p>
    ${user.area ? `<p>Area: ${user.area}</p>` : ''}
  </div>
  <div class="party" style="text-align:right">
    <h4>Service Info</h4>
    <p class="name">${user.plan}</p>
    <p>Expiry: ${user.expiryDate ? new Date(user.expiryDate).toLocaleDateString('en-PK') : 'N/A'}</p>
  </div>
</div>
<table>
  <thead><tr><th>Description</th><th>Period</th><th>Amount</th></tr></thead>
  <tbody>
    <tr><td>Internet Service (${user.plan})</td><td>${monthLabel}</td><td>Rs. ${fee.toLocaleString()}</td></tr>
    ${taxRate > 0 ? `<tr><td>Tax (${taxRate}%)</td><td></td><td>Rs. ${tax.toLocaleString()}</td></tr>` : ''}
  </tbody>
</table>
<div class="totals">
  <div class="totals-box">
    <div class="totals-row"><span>Subtotal</span><span>Rs. ${fee.toLocaleString()}</span></div>
    ${taxRate > 0 ? `<div class="totals-row"><span>Tax (${taxRate}%)</span><span>Rs. ${tax.toLocaleString()}</span></div>` : ''}
    <div class="totals-row"><span>Paid</span><span>Rs. ${totalPaid.toLocaleString()}</span></div>
    <div class="totals-row total"><span>TOTAL</span><span>Rs. ${total.toLocaleString()}</span></div>
    <div class="totals-row balance"><span>${balance > 0 ? 'Balance Due' : 'Advance'}</span><span>Rs. ${Math.abs(balance).toLocaleString()}</span></div>
  </div>
</div>
${monthReceipts.length > 0 ? `
<div class="receipts">
  <h4>Payment History (${monthLabel})</h4>
  <table><thead><tr><th>Date</th><th>Amount</th><th>Collected By</th></tr></thead><tbody>
    ${monthReceipts.map(r => `<tr><td>${new Date(r.date).toLocaleDateString('en-PK')}</td><td>Rs. ${r.paidAmount?.toLocaleString()}</td><td>${r.collectedBy||'Manager'}</td></tr>`).join('')}
  </tbody></table>
</div>` : ''}
<div class="footer">${settings.globalNote || 'Thank you for choosing us.'} | Generated by MYISP</div>
</body></html>`);
    win.document.close();
    win.print();
  };

  const card = isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200';
  const text = isDark ? 'text-white' : 'text-slate-900';
  const muted = isDark ? 'text-white/50' : 'text-slate-500';
  const inputCls = `border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 ${isDark ? 'bg-white/5 border-white/10 text-white placeholder-white/30' : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'}`;
  const pageBg = isDark ? 'bg-[#0b0f1a] text-white' : 'bg-slate-50 text-slate-900';

  return (
    <div className={`min-h-screen p-4 pb-24 ${pageBg}`}>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className={`text-2xl font-black ${text} flex items-center gap-2`}><ReceiptIcon className="w-5 h-5" /> Monthly Invoice</h1>
          <p className={`text-xs mt-0.5 ${muted}`}>Generate a professional invoice for the customer</p>
        </div>
        <button onClick={handlePrint} disabled={!user}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all active:scale-95">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
          Print Invoice
        </button>
      </div>

      <div className={`border rounded-2xl p-4 mb-4 space-y-3 ${card}`}>
        <p className={`text-[10px] font-black uppercase tracking-widest ${muted}`}>Invoice Settings</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={`text-xs font-bold ${muted} block mb-1`}>Invoice #</label>
            <input value={invoiceNum} onChange={e => setInvoiceNum(e.target.value)} className={`w-full ${inputCls}`} />
          </div>
          <div>
            <label className={`text-xs font-bold ${muted} block mb-1`}>Tax % (GST)</label>
            <input type="number" value={taxRate} onChange={e => setTaxRate(Number(e.target.value))} min="0" max="100" className={`w-full ${inputCls}`} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={`text-xs font-bold ${muted} block mb-1`}>Month</label>
            <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className={`w-full ${inputCls}`}>
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className={`text-xs font-bold ${muted} block mb-1`}>Year</label>
            <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className={`w-full ${inputCls}`}>
              {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className={`border rounded-2xl p-4 mb-4 ${card}`}>
        <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${muted}`}>Select Customer</p>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search naam ya phone..." className={`w-full ${inputCls} mb-3`} />
        <div className="max-h-52 overflow-y-auto space-y-1">
          {filteredUsers.map(u => (
            <button key={u.id} onClick={() => { setSelectedUser(u.id); setSearch(''); }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm text-left transition-all ${selectedUser === u.id ? 'bg-indigo-600 text-white' : isDark ? 'hover:bg-white/10 text-white' : 'hover:bg-slate-100 text-slate-900'}`}>
              <span className="font-bold">{u.name}</span>
              <span className={`text-xs ${selectedUser === u.id ? 'text-white/70' : muted}`}>{u.plan} • {u.phone}</span>
            </button>
          ))}
        </div>
      </div>

      {user && (
        <div className={`border rounded-2xl p-5 ${card}`}>
          <p className={`text-[10px] font-black uppercase tracking-widest mb-4 ${muted}`}>Invoice Preview</p>
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className={`text-lg font-black ${text}`}>{user.name}</p>
              <p className={`text-xs ${muted}`}>{user.phone} • {user.area || ''}</p>
            </div>
            <div className="text-right">
              <p className={`text-xs font-bold ${muted}`}>{invoiceNum}</p>
              <p className={`text-xs ${muted}`}>{MONTHS[selectedMonth]} {selectedYear}</p>
            </div>
          </div>
          <div className={`rounded-xl p-3 mb-3 ${isDark ? 'bg-white/5' : 'bg-slate-50'}`}>
            <div className="flex justify-between text-sm mb-2">
              <span className={muted}>Internet Service ({user.plan})</span>
              <span className={`font-bold ${text}`}>Rs. {fee.toLocaleString()}</span>
            </div>
            {taxRate > 0 && (
              <div className="flex justify-between text-sm mb-2">
                <span className={muted}>Tax ({taxRate}%)</span>
                <span className={`font-bold ${text}`}>Rs. {tax.toLocaleString()}</span>
              </div>
            )}
            <div className={`flex justify-between text-sm font-black pt-2 border-t ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
              <span className={text}>Total</span>
              <span className="text-indigo-400">Rs. {total.toLocaleString()}</span>
            </div>
          </div>
          <div className="flex justify-between text-sm">
            <span className={muted}>Paid this month</span>
            <span className="font-bold text-emerald-400">Rs. {totalPaid.toLocaleString()}</span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className={muted}>{balance > 0 ? 'Balance Due' : 'Advance'}</span>
            <span className={`font-black ${balance > 0 ? 'text-red-400' : 'text-emerald-400'}`}>Rs. {Math.abs(balance).toLocaleString()}</span>
          </div>
          {monthReceipts.length > 0 && (
            <div className={`mt-3 pt-3 border-t ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
              <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${muted}`}>{monthReceipts.length} Payment(s)</p>
              {monthReceipts.map((r, i) => (
                <div key={i} className="flex justify-between text-xs mb-1">
                  <span className={muted}>{new Date(r.date).toLocaleDateString('en-PK')}</span>
                  <span className={`font-bold ${text}`}>Rs. {r.paidAmount?.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {planHistory.length > 0 && (
        <div className={`border rounded-2xl p-4 mt-4 ${card}`}>
          <p className={`text-[10px] font-black uppercase tracking-widest mb-3 ${muted} flex items-center gap-1.5`}><ClipboardIcon className="w-3.5 h-3.5" /> Plan Change History</p>
          <div className="space-y-2">
            {planHistory.filter(p => !selectedUser || p.userId === selectedUser).slice(-10).reverse().map(p => (
              <div key={p.id} className={`flex items-center justify-between py-2 border-b last:border-0 ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                <div>
                  <p className={`font-bold text-sm ${text}`}>{p.userName}</p>
                  <p className={`text-xs ${muted}`}>{p.oldPlan} → {p.newPlan} {p.reason ? `• ${p.reason}` : ''}</p>
                </div>
                <p className={`text-xs ${muted}`}>{new Date(p.changedAt).toLocaleDateString('en-PK')}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MonthlyInvoice;
