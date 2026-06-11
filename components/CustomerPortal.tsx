import React, { useState } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient('https://mzmajmjzopmkzboizrbm.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im16bWFqbWp6b3Bta3pib2l6cmJtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc0NjUyMDcsImV4cCI6MjA5MzA0MTIwN30.YpirkCCMXoRGBpHVqv4YtIyKQMqhjWSxMf1m7hTOSjw');

const CustomerPortal: React.FC = () => {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const search = async () => {
    if (!phone.trim()) return;
    setLoading(true); setError(''); setResult(null);
    try {
      const { data, error: err } = await supabase.from('manager_data').select('data');
      if (err) throw err;
      const q = phone.trim().replace(/\s/g,'');
      for (const row of (data || [])) {
        const users: any[] = row.data?.users || [];
        const found = users.find((u:any) => {
          const p = (u.phone||'').replace(/\s/g,'');
          const p2 = (u.phone2||'').replace(/\s/g,'');
          return p === q || p2 === q || p.endsWith(q) || q.endsWith(p.slice(-7));
        });
        if (found && found.status !== 'deleted') {
          setResult({ user: found, biz: row.data?.settings || row.data?.companies?.[0]?.settings });
          setLoading(false); return;
        }
      }
      setError('Koi account nahi mila. Phone number check karein.');
    } catch { setError('Network error. Dobara try karein.'); }
    setLoading(false);
  };

  const u = result?.user;
  const biz = result?.biz;
  const today = new Date(); today.setHours(0,0,0,0);
  const exp = u?.expiryDate ? new Date(u.expiryDate) : null;
  if (exp) exp.setHours(0,0,0,0);
  const diff = exp ? Math.ceil((exp.getTime()-today.getTime())/86400000) : 0;
  const expired = diff < 0;

  return (
    <div className="min-h-screen bg-[#0b0f1a] text-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">📡</div>
          <h1 className="text-2xl font-black">Customer Portal</h1>
          <p className="text-white/50 text-sm mt-1">Apna account status check karein</p>
        </div>

        {!result ? (
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <label className="text-xs font-black uppercase tracking-widest text-white/50 block mb-2">Phone Number</label>
            <input value={phone} onChange={e=>setPhone(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&search()}
              placeholder="03XX-XXXXXXX"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-indigo-500 mb-3" />
            {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
            <button onClick={search} disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-black py-3 rounded-xl transition-all active:scale-95">
              {loading ? 'Searching...' : 'Check Status →'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-indigo-600/20 border border-indigo-500/30 rounded-xl flex items-center justify-center text-xl">👤</div>
                <div>
                  <p className="font-black text-lg">{u.name}</p>
                  <p className="text-white/50 text-xs">{u.phone}</p>
                </div>
              </div>
              <div className={`rounded-xl px-4 py-3 text-center mb-3 ${expired ? 'bg-red-500/10 border border-red-500/20' : 'bg-emerald-500/10 border border-emerald-500/20'}`}>
                <p className={`font-black text-lg ${expired ? 'text-red-400' : 'text-emerald-400'}`}>
                  {expired ? '❌ Expired' : '✅ Active'}
                </p>
                <p className="text-white/50 text-xs mt-1">
                  {expired ? `${Math.abs(diff)} din pehle expire hua` : `${diff} din baad expire hoga`}
                </p>
              </div>
              <div className="space-y-2">
                {[
                  ['Package', u.plan],
                  ['Expiry', exp?.toLocaleDateString('en-PK',{day:'2-digit',month:'short',year:'numeric'})],
                  ['Balance', u.balance > 0 ? `Rs. ${u.balance?.toLocaleString()}` : 'Clear'],
                  ['Area', u.area || '—'],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between py-1.5 border-b border-white/5 last:border-0">
                    <span className="text-white/50 text-xs">{label}</span>
                    <span className="text-white text-xs font-bold">{val}</span>
                  </div>
                ))}
              </div>
            </div>
            {biz && (
              <div className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-center">
                <p className="text-white/40 text-xs">Provider</p>
                <p className="font-black">{biz.businessName}</p>
                {biz.businessPhone && <a href={`tel:${biz.businessPhone}`} className="text-indigo-400 text-xs">{biz.businessPhone}</a>}
              </div>
            )}
            <button onClick={()=>{setResult(null);setPhone('');}}
              className="w-full bg-white/5 border border-white/10 text-white/70 font-bold py-3 rounded-xl text-sm">
              ← Wapis
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomerPortal;
