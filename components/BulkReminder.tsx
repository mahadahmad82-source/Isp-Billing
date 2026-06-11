import React, { useState, useMemo } from 'react';
import { UserRecord } from '../types';
import { useIsDark } from '../hooks/useIsDark';

interface Props {
  users: UserRecord[];
  settings: { businessName?: string; businessPhone?: string; reminderTemplate?: string };
}

const DEFAULT_TEMPLATE = `Assalam o Alaikum {name} bhai,\n\nAap ka internet package {status}. Meherbani karke jald payment karwayein.\n\nBalance: Rs. {amount}\nExpiry: {expiry}\n\n{businessName}\n{phone}`;

const BulkReminder: React.FC<Props> = ({ users, settings }) => {
  const isDark = useIsDark();
  const [daysFilter, setDaysFilter] = useState<number>(3);
  const [filterType, setFilterType] = useState<'expiring' | 'expired' | 'both'>('both');
  const [template, setTemplate] = useState(settings.reminderTemplate || DEFAULT_TEMPLATE);
  const [editTemplate, setEditTemplate] = useState(false);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const targetUsers = useMemo(() => {
    return users.filter(u => {
      if (u.status === 'deleted') return false;
      if (!u.phone) return false;
      if (!u.expiryDate) return false;
      const exp = new Date(u.expiryDate);
      exp.setHours(0, 0, 0, 0);
      const diffDays = Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (filterType === 'expiring') return diffDays >= 0 && diffDays <= daysFilter;
      if (filterType === 'expired')  return diffDays < 0 && diffDays >= -daysFilter;
      return diffDays >= -daysFilter && diffDays <= daysFilter;
    }).filter(u => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return u.name.toLowerCase().includes(q) || (u.phone || '').includes(q) || (u.area || '').toLowerCase().includes(q);
    });
  }, [users, daysFilter, filterType, search]);

  const buildMsg = (u: UserRecord) => {
    const exp = u.expiryDate ? new Date(u.expiryDate) : null;
    const expStr = exp ? exp.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';
    const diffDays = exp ? Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : 0;
    const statusStr = diffDays >= 0 ? `${diffDays} din mein expire hone wala hai` : `${Math.abs(diffDays)} din pehle expire ho gaya`;
    const balance = u.balance && u.balance > 0 ? u.balance : u.monthlyFee || 0;
    return template
      .replace('{name}', u.name)
      .replace('{status}', statusStr)
      .replace('{amount}', balance.toLocaleString())
      .replace('{expiry}', expStr)
      .replace('{businessName}', settings.businessName || 'MYISP')
      .replace('{phone}', settings.businessPhone || '');
  };

  const waLink = (u: UserRecord) => {
    const phone = (u.phone || '').replace(/^0/, '92').replace(/\D/g, '');
    return `https://wa.me/${phone}?text=${encodeURIComponent(buildMsg(u))}`;
  };

  const markSent = (id: string) => setSent(prev => new Set([...prev, id]));

  const blastAll = () => {
    targetUsers.forEach((u, i) => {
      setTimeout(() => {
        window.open(waLink(u), '_blank');
        markSent(u.id);
      }, i * 800);
    });
  };

  const card = isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200';
  const text = isDark ? 'text-white' : 'text-slate-900';
  const muted = isDark ? 'text-white/50' : 'text-slate-500';
  const inputCls = `w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 ${isDark ? 'bg-white/5 border-white/10 text-white placeholder-white/30' : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'}`;
  const pageBg = isDark ? 'bg-[#0b0f1a] text-white' : 'bg-slate-50 text-slate-900';

  return (
    <div className={`min-h-screen p-4 pb-24 ${pageBg}`}>
      {/* Header */}
      <div className="mb-5">
        <h1 className={`text-2xl font-black ${text}`}>📲 Bulk Reminder Blast</h1>
        <p className={`text-xs mt-0.5 ${muted}`}>WhatsApp ya SMS se sab customers ko ek saath remind karo</p>
      </div>

      {/* Filters */}
      <div className={`border rounded-2xl p-4 mb-4 ${card}`}>
        <p className={`text-[10px] font-black uppercase tracking-widest mb-3 ${muted}`}>Filter Settings</p>
        <div className="flex gap-2 mb-3 flex-wrap">
          {(['expiring','expired','both'] as const).map(t => (
            <button key={t} onClick={() => setFilterType(t)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${filterType === t ? 'bg-indigo-600 text-white' : isDark ? 'bg-white/10 text-white/70' : 'bg-slate-100 text-slate-600'}`}>
              {t === 'expiring' ? '⏳ Expiring Soon' : t === 'expired' ? '❌ Expired' : '📋 Both'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-bold ${muted}`}>Days range:</span>
          {[1, 3, 7, 15, 30].map(d => (
            <button key={d} onClick={() => setDaysFilter(d)}
              className={`w-9 h-9 rounded-xl text-xs font-black transition-all ${daysFilter === d ? 'bg-indigo-600 text-white' : isDark ? 'bg-white/10 text-white/70' : 'bg-slate-100 text-slate-600'}`}>
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Message Template */}
      <div className={`border rounded-2xl p-4 mb-4 ${card}`}>
        <div className="flex items-center justify-between mb-3">
          <p className={`text-[10px] font-black uppercase tracking-widest ${muted}`}>Message Template</p>
          <button onClick={() => setEditTemplate(!editTemplate)}
            className={`text-xs font-bold px-3 py-1 rounded-lg transition-all ${isDark ? 'bg-white/10 text-white/70 hover:bg-white/20' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
            {editTemplate ? '✅ Done' : '✏️ Edit'}
          </button>
        </div>
        {editTemplate ? (
          <textarea value={template} onChange={e => setTemplate(e.target.value)} rows={6}
            className={`${inputCls} resize-none font-mono text-xs`} />
        ) : (
          <pre className={`text-xs font-mono whitespace-pre-wrap leading-relaxed ${muted}`}>{template}</pre>
        )}
        <p className={`text-[10px] mt-2 ${muted}`}>Variables: {'{name}'} {'{status}'} {'{amount}'} {'{expiry}'} {'{businessName}'} {'{phone}'}</p>
      </div>

      {/* Search */}
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search naam, phone, area..."
        className={`${inputCls} mb-4`} />

      {/* Stats + Blast Button */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className={`text-lg font-black ${text}`}>{targetUsers.length}</span>
          <span className={`text-xs ml-1 ${muted}`}>customers found</span>
          {sent.size > 0 && <span className="ml-2 text-xs text-emerald-400 font-bold">{sent.size} sent ✅</span>}
        </div>
        <button onClick={blastAll} disabled={targetUsers.length === 0}
          className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white rounded-xl font-black text-sm transition-all active:scale-95">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/></svg>
          Blast All WhatsApp
        </button>
      </div>

      {/* Customer List */}
      {targetUsers.length === 0 ? (
        <div className={`text-center py-16 ${muted}`}>
          <div className="text-4xl mb-3">🎉</div>
          <p className="font-bold">Koi customer is range mein nahi</p>
          <p className="text-xs mt-1">Filter change karo</p>
        </div>
      ) : (
        <div className="space-y-3">
          {targetUsers.map(u => {
            const exp = u.expiryDate ? new Date(u.expiryDate) : null;
            const diffDays = exp ? Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) : 0;
            const isExpired = diffDays < 0;
            const isSent = sent.has(u.id);
            return (
              <div key={u.id} className={`border rounded-2xl p-4 transition-all ${card} ${isSent ? 'opacity-60' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className={`font-black text-sm truncate ${text}`}>{u.name}</p>
                    <p className={`text-xs ${muted}`}>{u.phone} {u.area ? `• 📍${u.area}` : ''}</p>
                    <p className={`text-xs mt-0.5 font-bold ${isExpired ? 'text-red-400' : 'text-yellow-400'}`}>
                      {isExpired ? `${Math.abs(diffDays)} din pehle expire hua` : `${diffDays} din mein expire hoga`}
                    </p>
                  </div>
                  <div className="flex gap-2 ml-3">
                    <a href={waLink(u)} target="_blank" rel="noreferrer" onClick={() => markSent(u.id)}
                      className={`flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-bold transition-all ${isSent ? 'bg-emerald-500/20 text-emerald-400' : 'bg-green-600/20 border border-green-500/30 text-green-400 hover:bg-green-600/30'}`}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z"/></svg>
                      {isSent ? 'Sent ✅' : 'Send'}
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default BulkReminder;
