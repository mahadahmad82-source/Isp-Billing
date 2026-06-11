import React, { useMemo, useState } from 'react';
import { useIsDark } from '../hooks/useIsDark';
import { UserRecord } from '../types';

interface Props {
  users: UserRecord[];
  settings: { monthlyFee?: number; availablePlans?: { name: string; price: number }[] };
}

interface AgingEntry {
  user: UserRecord;
  daysPastDue: number;
  bucket: '0-30' | '31-60' | '61-90' | '90+';
  estimatedDue: number;
}

const BUCKET_CONFIG = {
  '0-30': { label: '0–30 Days',  color: 'text-yellow-400',  bg: 'bg-yellow-500/15 border-yellow-500/30', priority: 'Low' },
  '31-60':{ label: '31–60 Days', color: 'text-orange-400',  bg: 'bg-orange-500/15 border-orange-500/30', priority: 'Medium' },
  '61-90':{ label: '61–90 Days', color: 'text-red-400',     bg: 'bg-red-500/15 border-red-500/30',       priority: 'High' },
  '90+':  { label: '90+ Days',   color: 'text-rose-400',    bg: 'bg-rose-500/15 border-rose-500/30',     priority: 'Critical' },
};

const AgingReport: React.FC<Props> = ({ users, settings }) => {
  const isDark = useIsDark();
  const [activeBucket, setActiveBucket] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'days' | 'amount'>('days');

  const getPlanPrice = (user: UserRecord): number => {
    if (settings.availablePlans) {
      const plan = settings.availablePlans.find(p =>
        p.name.toLowerCase() === (user.plan || '').toLowerCase()
      );
      if (plan) return plan.price;
    }
    return settings.monthlyFee || 0;
  };

  const agingData = useMemo((): AgingEntry[] => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const result: AgingEntry[] = [];

    users.forEach(user => {
      if (user.status === 'deleted') return;
      if (!user.expiryDate) return;

      const expiry = new Date(user.expiryDate);
      expiry.setHours(0, 0, 0, 0);
      if (expiry >= today) return; // still active

      const daysPastDue = Math.floor((today.getTime() - expiry.getTime()) / (1000 * 60 * 60 * 24));
      const monthsPastDue = Math.max(1, Math.ceil(daysPastDue / 30));
      const planPrice = getPlanPrice(user);
      const estimatedDue = planPrice * monthsPastDue + (user.balance && user.balance < 0 ? Math.abs(user.balance) : 0);

      let bucket: AgingEntry['bucket'];
      if (daysPastDue <= 30)      bucket = '0-30';
      else if (daysPastDue <= 60) bucket = '31-60';
      else if (daysPastDue <= 90) bucket = '61-90';
      else                         bucket = '90+';

      result.push({ user, daysPastDue, bucket, estimatedDue });
    });

    return result;
  }, [users, settings]);

  const summary = useMemo(() => {
    const s = { '0-30': { count: 0, amount: 0 }, '31-60': { count: 0, amount: 0 }, '61-90': { count: 0, amount: 0 }, '90+': { count: 0, amount: 0 } };
    agingData.forEach(e => { s[e.bucket].count++; s[e.bucket].amount += e.estimatedDue; });
    return s;
  }, [agingData]);

  const totalDue = agingData.reduce((s, e) => s + e.estimatedDue, 0);

  const filtered = useMemo(() => {
    let list = activeBucket === 'all' ? agingData : agingData.filter(e => e.bucket === activeBucket);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        e.user.name.toLowerCase().includes(q) ||
        (e.user.phone||'').includes(q) ||
        (e.user.area||'').toLowerCase().includes(q)
      );
    }
    return [...list].sort((a, b) => sortBy === 'days' ? b.daysPastDue - a.daysPastDue : b.estimatedDue - a.estimatedDue);
  }, [agingData, activeBucket, search, sortBy]);

  return (
    <div className={`min-h-screen ${isDark ? 'bg-[#0b0f1a] text-white' : 'bg-slate-50 text-slate-900'} p-4 pb-24`}>
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-black">Receivable Aging</h1>
        <p className={`${isDark ? 'text-white/40' : 'text-slate-500'} text-xs mt-0.5`}>Kitna paisa kitne dino se pending hai</p>
      </div>

      {/* Total Due Banner */}
      <div className="bg-gradient-to-r from-red-600/20 to-rose-600/20 border border-red-500/30 rounded-2xl p-5 mb-5">
        <p className={`text-xs font-bold ${isDark ? 'text-white/50' : 'text-slate-500'} uppercase tracking-wider mb-1`}>Total Outstanding</p>
        <p className="text-3xl font-black text-red-400">Rs. {totalDue.toLocaleString()}</p>
        <p className={`${isDark ? 'text-white/40' : 'text-slate-500'} text-xs mt-1`}>{agingData.length} expired customers</p>
      </div>

      {/* Bucket Summary Cards */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {(Object.keys(BUCKET_CONFIG) as AgingEntry['bucket'][]).map(bucket => {
          const cfg = BUCKET_CONFIG[bucket];
          const data = summary[bucket];
          return (
            <button key={bucket} onClick={() => setActiveBucket(activeBucket === bucket ? 'all' : bucket)}
              className={`rounded-2xl p-4 border text-left transition-all active:scale-95 ${cfg.bg} ${activeBucket === bucket ? 'ring-2 ring-white/30' : ''}`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-black uppercase tracking-wider ${cfg.color}`}>{cfg.label}</span>
                <span className={`text-[9px] px-2 py-0.5 rounded-full font-black ${cfg.bg} ${cfg.color}`}>{cfg.priority}</span>
              </div>
              <p className={`text-xl font-black ${cfg.color}`}>{data.count} <span className="text-sm font-semibold">users</span></p>
              <p className={`${isDark ? 'text-white/50' : 'text-slate-500'} text-xs mt-1 font-semibold`}>Rs. {data.amount.toLocaleString()}</p>
            </button>
          );
        })}
      </div>

      {/* Search + Sort */}
      <div className="flex gap-2 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search naam, phone, area..."
          className={`flex-1 ${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-xl px-3 py-2.5 ${isDark ? 'text-white' : 'text-slate-900'} text-sm focus:outline-none focus:border-indigo-500 ${isDark ? 'placeholder-white/30' : 'placeholder-slate-400'}`}/>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
          className={`${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-xl px-3 py-2.5 ${isDark ? 'text-white' : 'text-slate-900'} text-xs focus:outline-none focus:border-indigo-500`}>
          <option value="days">By Days</option>
          <option value="amount">By Amount</option>
        </select>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className={`text-center py-20 ${isDark ? 'text-white/30' : 'text-slate-400'}`}>
          <div className="text-5xl mb-4">✅</div>
          <p className="font-bold text-lg">Sab clear hai!</p>
          <p className="text-sm mt-1">Koi overdue customer nahi</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(entry => {
            const cfg = BUCKET_CONFIG[entry.bucket];
            return (
              <div key={entry.user.id} className={`${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-2xl p-4`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-black text-base">{entry.user.name}</p>
                    <p className={`${isDark ? 'text-white/50' : 'text-slate-500'} text-sm`}>{entry.user.phone}</p>
                    {entry.user.area && <p className={`${isDark ? 'text-white/30' : 'text-slate-400'} text-xs mt-0.5`}>📍 {entry.user.area}</p>}
                  </div>
                  <div className="text-right">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${cfg.bg} ${cfg.color}`}>
                      {entry.daysPastDue} days
                    </span>
                    <p className="text-red-400 font-black text-lg mt-1">Rs. {entry.estimatedDue.toLocaleString()}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className={`flex gap-2 text-xs ${isDark ? 'text-white/40' : 'text-slate-500'}`}>
                    <span>📦 {entry.user.plan || 'No Plan'}</span>
                    {entry.user.expiryDate && (
                      <span>• Expired: {new Date(entry.user.expiryDate).toLocaleDateString('en-PK', {day:'2-digit',month:'short',year:'numeric'})}</span>
                    )}
                  </div>
                  {/* WhatsApp quick reminder */}
                  <a href={`https://wa.me/92${(entry.user.phone||'').replace(/^0/,'')}?text=${encodeURIComponent(
                    `Assalam o Alaikum ${entry.user.name} bhai, aap ka internet package expire ho gaya hai. Meherbani karke Rs. ${entry.estimatedDue.toLocaleString()} jald jama karwayein. Shukriya.`
                  )}`} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600/20 border border-green-500/30 text-green-400 rounded-xl text-xs font-bold transition-all hover:bg-green-600/30"
                    onClick={e => e.stopPropagation()}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.553 4.126 1.52 5.874L0 24l6.296-1.496A11.933 11.933 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.797 9.797 0 01-4.988-1.366l-.358-.213-3.713.882.939-3.63-.234-.373A9.797 9.797 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182c5.43 0 9.818 4.388 9.818 9.818 0 5.43-4.388 9.818-9.818 9.818z"/></svg>
                    Remind
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AgingReport;
