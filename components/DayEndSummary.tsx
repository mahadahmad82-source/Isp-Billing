import React, { useState, useMemo } from 'react';
import { Receipt } from '../types';
import { useIsDark } from '../hooks/useIsDark';
import { BarChartIcon, InboxIcon } from './icons/UiIcons';

interface Props {
  receipts: Receipt[];
  subManagers: { id: string; username: string; name: string }[];
  businessName?: string;
}

const DayEndSummary: React.FC<Props> = ({ receipts, subManagers, businessName }) => {
  const isDark = useIsDark();
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const todayReceipts = useMemo(() => {
    return receipts.filter(r => {
      const d = r.date ? r.date.split('T')[0] : '';
      return d === selectedDate;
    });
  }, [receipts, selectedDate]);

  const totalCollected = todayReceipts.reduce((s, r) => s + (r.paidAmount || 0), 0);
  const totalAdvance  = todayReceipts.reduce((s, r) => s + Math.max(0, r.paidAmount - (r.monthlyFee || r.paidAmount)), 0);

  const byAgent = useMemo(() => {
    const map: Record<string, { name: string; count: number; total: number; receipts: Receipt[] }> = {};
    todayReceipts.forEach(r => {
      const key = r.collectedBy || 'Manager';
      if (!map[key]) {
        const sm = subManagers.find(s => s.username === key);
        map[key] = { name: sm?.name || key, count: 0, total: 0, receipts: [] };
      }
      map[key].count++;
      map[key].total += r.paidAmount || 0;
      map[key].receipts.push(r);
    });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [todayReceipts, subManagers]);

  const byPlan = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    todayReceipts.forEach(r => {
      const plan = r.plan || 'Unknown';
      if (!map[plan]) map[plan] = { count: 0, total: 0 };
      map[plan].count++;
      map[plan].total += r.paidAmount || 0;
    });
    return Object.entries(map).sort((a, b) => b[1].total - a[1].total);
  }, [todayReceipts]);

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const content = `
<!DOCTYPE html>
<html>
<head>
<title>Day End Summary - ${selectedDate}</title>
<style>
  body { font-family: Arial, sans-serif; padding: 20px; color: #000; }
  h1 { font-size: 20px; margin-bottom: 4px; }
  .sub { font-size: 12px; color: #666; margin-bottom: 20px; }
  .stat { display: inline-block; margin-right: 30px; margin-bottom: 20px; }
  .stat .label { font-size: 11px; color: #666; }
  .stat .val { font-size: 22px; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; font-size: 13px; }
  th { background: #f5f5f5; font-weight: bold; }
  .section { margin-top: 24px; }
  .section-title { font-size: 14px; font-weight: bold; margin-bottom: 8px; border-bottom: 2px solid #000; padding-bottom: 4px; }
  .total-row { font-weight: bold; background: #f9f9f9; }
  @media print { body { padding: 10px; } }
</style>
</head>
<body>
<h1>${businessName || 'MYISP'} — Day End Summary</h1>
<p class="sub">Date: ${new Date(selectedDate).toLocaleDateString('en-PK', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</p>
<div>
  <div class="stat"><div class="label">Total Collected</div><div class="val">Rs. ${totalCollected.toLocaleString()}</div></div>
  <div class="stat"><div class="label">Receipts Generated</div><div class="val">${todayReceipts.length}</div></div>
</div>

<div class="section">
  <div class="section-title">Collection by Agent</div>
  <table>
    <tr><th>Agent</th><th>Receipts</th><th>Amount</th></tr>
    ${byAgent.map(([, d]) => `<tr><td>${d.name}</td><td>${d.count}</td><td>Rs. ${d.total.toLocaleString()}</td></tr>`).join('')}
    <tr class="total-row"><td>TOTAL</td><td>${todayReceipts.length}</td><td>Rs. ${totalCollected.toLocaleString()}</td></tr>
  </table>
</div>

<div class="section">
  <div class="section-title">All Receipts Today</div>
  <table>
    <tr><th>#</th><th>Customer</th><th>Phone</th><th>Plan</th><th>Amount</th><th>Agent</th><th>Time</th></tr>
    ${todayReceipts.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${r.customerName || ''}</td>
        <td>${r.customerPhone || ''}</td>
        <td>${r.plan || ''}</td>
        <td>Rs. ${(r.paidAmount || 0).toLocaleString()}</td>
        <td>${r.collectedBy || 'Manager'}</td>
        <td>${r.date ? new Date(r.date).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }) : ''}</td>
      </tr>`).join('')}
  </table>
</div>

<p style="margin-top:30px;font-size:11px;color:#999;">Generated: ${new Date().toLocaleString('en-PK')} | MYISP</p>
</body>
</html>`;
    printWindow.document.write(content);
    printWindow.document.close();
    printWindow.print();
  };

  const card = isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200';
  const text = isDark ? 'text-white' : 'text-slate-900';
  const muted = isDark ? 'text-white/50' : 'text-slate-500';
  const pageBg = isDark ? 'bg-[#0b0f1a] text-white' : 'bg-slate-50 text-slate-900';

  return (
    <div className={`min-h-screen p-4 pb-24 ${pageBg}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className={`text-2xl font-black ${text} flex items-center gap-2`}><BarChartIcon className="w-5 h-5" /> Day-End Summary</h1>
          <p className={`text-xs mt-0.5 ${muted}`}>Today's complete collection summary</p>
        </div>
        <button onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all active:scale-95">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
          Print Report
        </button>
      </div>

      {/* Date Picker */}
      <div className={`border rounded-2xl p-4 mb-4 ${card}`}>
        <p className={`text-[10px] font-black uppercase tracking-widest mb-2 ${muted}`}>Select Date</p>
        <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
          className={`border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 ${isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-slate-200 text-slate-900'}`} />
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed)' }} className="rounded-2xl p-4 text-white">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/60 mb-1">Total</p>
          <p className="text-xl font-black">Rs. {totalCollected.toLocaleString()}</p>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #10b981, #0891b2)' }} className="rounded-2xl p-4 text-white">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/60 mb-1">Receipts</p>
          <p className="text-xl font-black">{todayReceipts.length}</p>
        </div>
        <div style={{ background: 'linear-gradient(135deg, #f43f5e, #fb923c)' }} className="rounded-2xl p-4 text-white">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/60 mb-1">Agents</p>
          <p className="text-xl font-black">{byAgent.length}</p>
        </div>
      </div>

      {todayReceipts.length === 0 ? (
        <div className={`text-center py-20 ${muted}`}>
          <div className="flex justify-center mb-4"><InboxIcon className="w-12 h-12" /></div>
          <p className="font-bold text-lg">No receipts on this date</p>
          <p className="text-xs mt-1">Try selecting a different date</p>
        </div>
      ) : (
        <>
          {/* By Agent */}
          <div className={`border rounded-2xl p-4 mb-4 ${card}`}>
            <p className={`text-[10px] font-black uppercase tracking-widest mb-3 ${muted}`}>Agent-wise Collection</p>
            <div className="space-y-3">
              {byAgent.map(([key, d]) => (
                <div key={key} className="flex items-center justify-between">
                  <div>
                    <p className={`font-bold text-sm ${text}`}>{d.name}</p>
                    <p className={`text-xs ${muted}`}>{d.count} receipts</p>
                  </div>
                  <div className="text-right">
                    <p className="font-black text-indigo-400">Rs. {d.total.toLocaleString()}</p>
                    <p className={`text-[10px] ${muted}`}>{Math.round((d.total / totalCollected) * 100)}%</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* By Plan */}
          {byPlan.length > 1 && (
            <div className={`border rounded-2xl p-4 mb-4 ${card}`}>
              <p className={`text-[10px] font-black uppercase tracking-widest mb-3 ${muted}`}>Plan-wise Breakdown</p>
              <div className="space-y-2">
                {byPlan.map(([plan, d]) => (
                  <div key={plan} className="flex items-center justify-between">
                    <span className={`text-sm font-bold ${text}`}>{plan}</span>
                    <div className="flex gap-4 text-right">
                      <span className={`text-xs ${muted}`}>{d.count}x</span>
                      <span className="font-bold text-emerald-400 text-sm">Rs. {d.total.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Receipt List */}
          <div className={`border rounded-2xl p-4 ${card}`}>
            <p className={`text-[10px] font-black uppercase tracking-widest mb-3 ${muted}`}>All Receipts ({todayReceipts.length})</p>
            <div className="space-y-2">
              {todayReceipts.map((r, i) => (
                <div key={r.id || i} className={`flex items-center justify-between py-2 border-b last:border-0 ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                  <div>
                    <p className={`font-bold text-sm ${text}`}>{r.customerName}</p>
                    <p className={`text-xs ${muted}`}>{r.plan} • {r.collectedBy || 'Manager'}</p>
                  </div>
                  <p className="font-black text-emerald-400">Rs. {(r.paidAmount || 0).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default DayEndSummary;
