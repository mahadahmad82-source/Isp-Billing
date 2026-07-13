import React, { useState, useMemo } from 'react';
import { UserRecord } from '../types';
import { useIsDark } from '../hooks/useIsDark';
import { MapIcon, MapPinIcon, ClipboardIcon, CrossCircleIcon, CalendarIcon, CheckCircleIcon } from './icons/UiIcons';

interface Props {
  users: UserRecord[];
  businessName?: string;
}

const RouteSheet: React.FC<Props> = ({ users, businessName }) => {
  const isDark = useIsDark();
  const [groupBy, setGroupBy] = useState<'area' | 'status'>('area');
  const [showExpired, setShowExpired] = useState(true);
  const [showExpiring, setShowExpiring] = useState(true);
  const [daysAhead, setDaysAhead] = useState(7);

  const today = new Date();
  today.setHours(0,0,0,0);

  const targetUsers = useMemo(() => {
    return users.filter(u => {
      if (u.status === 'deleted') return false;
      if (!u.phone) return false;
      const exp = u.expiryDate ? new Date(u.expiryDate) : null;
      if (!exp) return false;
      exp.setHours(0,0,0,0);
      const diff = Math.ceil((exp.getTime() - today.getTime()) / 86400000);
      if (showExpired && diff < 0) return true;
      if (showExpiring && diff >= 0 && diff <= daysAhead) return true;
      return false;
    });
  }, [users, showExpired, showExpiring, daysAhead]);

  const grouped = useMemo(() => {
    const map: Record<string, UserRecord[]> = {};
    targetUsers.forEach(u => {
      const key = groupBy === 'area'
        ? (u.area?.trim() || 'No Area')
        : (u.status === 'expired' ? 'Expired' : 'Expiring Soon');
      if (!map[key]) map[key] = [];
      map[key].push(u);
    });
    return Object.entries(map).sort((a,b) => a[0].localeCompare(b[0]));
  }, [targetUsers, groupBy]);

  const handlePrint = () => {
    const win = window.open('', '_blank');
    if (!win) return;
    const rows = grouped.map(([group, list]) => `
      <div style="margin-bottom:20px">
        <div style="font-weight:bold;font-size:14px;border-bottom:2px solid #000;padding:4px 0;margin-bottom:8px">
          ${group} (${list.length})
        </div>
        <table width="100%" style="border-collapse:collapse;font-size:12px">
          <tr style="background:#f0f0f0"><th style="text-align:left;padding:4px">#</th><th style="text-align:left;padding:4px">Name</th><th style="text-align:left;padding:4px">Phone</th><th style="text-align:left;padding:4px">Expiry</th><th style="text-align:left;padding:4px">Balance</th><th style="text-align:left;padding:4px">Status</th><th style="text-align:left;padding:4px">✓</th></tr>
          ${list.map((u,i) => {
            const exp = u.expiryDate ? new Date(u.expiryDate) : null;
            const diff = exp ? Math.ceil((exp.getTime()-today.getTime())/86400000) : 0;
            const expStr = exp ? exp.toLocaleDateString('en-PK',{day:'2-digit',month:'short'}) : '-';
            const statusStr = diff < 0 ? `Expired ${Math.abs(diff)}d ago` : `Expires in ${diff}d`;
            return `<tr style="border-bottom:1px solid #eee">
              <td style="padding:4px">${i+1}</td>
              <td style="padding:4px;font-weight:bold">${u.name}</td>
              <td style="padding:4px">${u.phone}</td>
              <td style="padding:4px">${expStr}</td>
              <td style="padding:4px">Rs.${(u.balance||0) > 0 ? (u.balance||0).toLocaleString() : u.monthlyFee?.toLocaleString()||'-'}</td>
              <td style="padding:4px;color:${diff<0?'red':'orange'}">${statusStr}</td>
              <td style="padding:4px;width:30px;border:1px solid #ccc">&nbsp;</td>
            </tr>`;
          }).join('')}
        </table>
      </div>
    `).join('');

    win.document.write(`<!DOCTYPE html><html><head>
      <title>Collection Route Sheet - ${new Date().toLocaleDateString('en-PK')}</title>
      <style>body{font-family:Arial,sans-serif;padding:15px;color:#000}@media print{body{padding:5px}}</style>
    </head><body>
      <h2 style="margin:0">${businessName||'MYISP'} — Collection Route Sheet</h2>
      <p style="font-size:12px;color:#666;margin:4px 0 16px">Date: ${new Date().toLocaleDateString('en-PK',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})} | Total: ${targetUsers.length} customers</p>
      ${rows}
      <p style="font-size:10px;color:#999;margin-top:20px">Agent: _____________ | Signature: _____________</p>
    </body></html>`);
    win.document.close();
    win.print();
  };

  const card = isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200';
  const text = isDark ? 'text-white' : 'text-slate-900';
  const muted = isDark ? 'text-white/50' : 'text-slate-500';
  const pageBg = isDark ? 'bg-[#0b0f1a] text-white' : 'bg-slate-50 text-slate-900';
  const btn = (active: boolean) => `px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${active ? 'bg-indigo-600 text-white' : isDark ? 'bg-white/10 text-white/70' : 'bg-slate-100 text-slate-600'}`;

  return (
    <div className={`min-h-screen p-4 pb-24 ${pageBg}`}>
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className={`text-2xl font-black ${text} flex items-center gap-2`}><MapIcon className="w-5 h-5" /> Collection Route Sheet</h1>
          <p className={`text-xs mt-0.5 ${muted}`}>Printable collection list for the field agent</p>
        </div>
        <button onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all active:scale-95">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>
          Print Sheet
        </button>
      </div>

      {/* Filters */}
      <div className={`border rounded-2xl p-4 mb-4 ${card}`}>
        <p className={`text-[10px] font-black uppercase tracking-widest mb-3 ${muted}`}>Filter Options</p>
        <div className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold ${muted}`}>Group by:</span>
            <button onClick={() => setGroupBy('area')} className={`${btn(groupBy==='area')} inline-flex items-center gap-1`}><MapPinIcon className="w-3.5 h-3.5" /> Area</button>
            <button onClick={() => setGroupBy('status')} className={`${btn(groupBy==='status')} inline-flex items-center gap-1`}><ClipboardIcon className="w-3.5 h-3.5" /> Status</button>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold ${muted}`}>Include:</span>
            <button onClick={() => setShowExpired(!showExpired)} className={`${btn(showExpired)} inline-flex items-center gap-1`}><CrossCircleIcon className="w-3.5 h-3.5" /> Expired</button>
            <button onClick={() => setShowExpiring(!showExpiring)} className={`${btn(showExpiring)} inline-flex items-center gap-1`}><CalendarIcon className="w-3.5 h-3.5" /> Expiring</button>
          </div>
          {showExpiring && (
            <div className="flex items-center gap-2">
              <span className={`text-xs font-bold ${muted}`}>Expiring within:</span>
              {[3, 7, 15, 30].map(d => (
                <button key={d} onClick={() => setDaysAhead(d)} className={btn(daysAhead===d)}>{d}d</button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div style={{background:'linear-gradient(135deg,#4f46e5,#7c3aed)'}} className="rounded-2xl p-3 text-white">
          <p className="text-[10px] font-black uppercase text-white/60">Total</p>
          <p className="text-xl font-black">{targetUsers.length}</p>
        </div>
        <div style={{background:'linear-gradient(135deg,#ef4444,#f97316)'}} className="rounded-2xl p-3 text-white">
          <p className="text-[10px] font-black uppercase text-white/60">Expired</p>
          <p className="text-xl font-black">{targetUsers.filter(u => {
            const exp = u.expiryDate ? new Date(u.expiryDate) : null;
            return exp && exp < today;
          }).length}</p>
        </div>
        <div style={{background:'linear-gradient(135deg,#f59e0b,#10b981)'}} className="rounded-2xl p-3 text-white">
          <p className="text-[10px] font-black uppercase text-white/60">Areas</p>
          <p className="text-xl font-black">{grouped.length}</p>
        </div>
      </div>

      {/* Grouped List */}
      {targetUsers.length === 0 ? (
        <div className={`text-center py-16 ${muted}`}>
          <div className="flex justify-center mb-3"><CheckCircleIcon className="w-9 h-9" /></div>
          <p className="font-bold">No customers found</p>
          <p className="text-xs mt-1">Try adjusting the filters</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([group, list]) => (
            <div key={group} className={`border rounded-2xl overflow-hidden ${card}`}>
              <div className={`px-4 py-3 flex items-center justify-between ${isDark ? 'bg-white/8' : 'bg-slate-50'}`}>
                <span className={`font-black text-sm ${text} inline-flex items-center gap-1`}><MapPinIcon className="w-3.5 h-3.5" /> {group}</span>
                <span className={`text-xs px-2 py-1 rounded-full font-bold ${isDark ? 'bg-indigo-500/20 text-indigo-400' : 'bg-indigo-100 text-indigo-700'}`}>{list.length} customers</span>
              </div>
              <div className="divide-y divide-white/5">
                {list.map((u, i) => {
                  const exp = u.expiryDate ? new Date(u.expiryDate) : null;
                  const diff = exp ? Math.ceil((exp.getTime()-today.getTime())/86400000) : 0;
                  const isExp = diff < 0;
                  return (
                    <div key={u.id} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`text-xs font-black w-5 text-center ${muted}`}>{i+1}</span>
                        <div className="min-w-0">
                          <p className={`font-black text-sm truncate ${text}`}>{u.name}</p>
                          <p className={`text-xs ${muted}`}>{u.phone}</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className={`text-xs font-bold ${isExp ? 'text-red-400' : 'text-yellow-400'}`}>
                          {isExp ? `${Math.abs(diff)}d overdue` : `${diff}d left`}
                        </p>
                        <p className={`text-xs ${muted}`}>Rs.{(u.balance||u.monthlyFee||0).toLocaleString()}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default RouteSheet;
