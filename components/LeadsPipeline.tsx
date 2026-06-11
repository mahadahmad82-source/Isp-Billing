import React, { useState, useMemo } from 'react';
import { useIsDark } from '../hooks/useIsDark';
import { LeadRecord, LeadStatus, UserRecord } from '../types';

interface Props {
  leads: LeadRecord[];
  users: UserRecord[];
  subManagers: { id: string; username: string; name: string }[];
  settings: { monthlyFee?: number; availablePlans?: { name: string; price: number }[] };
  onAdd: (lead: LeadRecord) => void;
  onUpdate: (id: string, updates: Partial<LeadRecord>) => void;
  onDelete: (id: string) => void;
  onConvertToCustomer: (lead: LeadRecord) => void;
}

const STATUS_CONFIG: Record<LeadStatus, { label: string; emoji: string; color: string; bg: string; next?: LeadStatus }> = {
  new:             { label: 'New Inquiry',      emoji: '🆕', color: 'text-slate-300',   bg: 'bg-slate-500/15 border-slate-500/30',   next: 'contacted' },
  contacted:       { label: 'Contacted',        emoji: '📞', color: 'text-blue-400',    bg: 'bg-blue-500/15 border-blue-500/30',      next: 'survey_done' },
  survey_done:     { label: 'Survey Done',      emoji: '📍', color: 'text-yellow-400',  bg: 'bg-yellow-500/15 border-yellow-500/30',  next: 'install_pending' },
  install_pending: { label: 'Install Pending',  emoji: '🔧', color: 'text-orange-400',  bg: 'bg-orange-500/15 border-orange-500/30',  next: 'converted' },
  converted:       { label: 'Converted ✅',     emoji: '🎉', color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30' },
  lost:            { label: 'Lost / No Deal',   emoji: '❌', color: 'text-red-400',     bg: 'bg-red-500/15 border-red-500/30' },
};

const SOURCES = ['Walk-in', 'Referral', 'Social Media', 'Flyer', 'Phone Call', 'Other'];
const genId = () => `LEAD-${Date.now()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
const emptyForm = (): Partial<LeadRecord> => ({
  name: '', phone: '', address: '', area: '', interestedPlan: '',
  status: 'new', assignedTo: '', note: '', source: 'Walk-in', referredBy: '', followUpDate: '',
});

const LeadsPipeline: React.FC<Props> = ({ leads, users, subManagers, settings, onAdd, onUpdate, onDelete, onConvertToCustomer }) => {
  const isDark = useIsDark();
  const [view, setView] = useState<'list' | 'add' | 'edit' | 'detail'>('list');
  const [form, setForm] = useState<Partial<LeadRecord>>(emptyForm());
  const [editId, setEditId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LeadRecord | null>(null);
  const [filterStatus, setFilterStatus] = useState<LeadStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmConvert, setConfirmConvert] = useState<LeadRecord | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const plans = settings.availablePlans?.map(p => p.name) || [];

  // Stats
  const stats = useMemo(() => {
    const counts: Record<LeadStatus, number> = { new: 0, contacted: 0, survey_done: 0, install_pending: 0, converted: 0, lost: 0 };
    leads.forEach(l => { if (counts[l.status] !== undefined) counts[l.status]++; });
    return counts;
  }, [leads]);

  const conversionRate = leads.length > 0
    ? Math.round((stats.converted / leads.length) * 100)
    : 0;

  // Filtered
  const filtered = useMemo(() => {
    let list = [...leads];
    if (filterStatus !== 'all') list = list.filter(l => l.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(l =>
        l.name.toLowerCase().includes(q) ||
        l.phone.includes(q) ||
        l.address.toLowerCase().includes(q) ||
        (l.area || '').toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [leads, filterStatus, search]);

  // Today's follow-ups
  const todayFollowUps = leads.filter(l => {
    if (!l.followUpDate || l.status === 'converted' || l.status === 'lost') return false;
    return l.followUpDate === new Date().toISOString().split('T')[0];
  });

  const handleSave = () => {
    if (!form.name?.trim() || !form.phone?.trim()) { showToast('Naam aur phone zaroori hain!'); return; }
    const now = new Date().toISOString();
    if (editId) {
      onUpdate(editId, { ...form, updatedAt: now });
      showToast('Lead updated!');
    } else {
      onAdd({ ...form, id: genId(), createdAt: now, updatedAt: now } as LeadRecord);
      showToast('Lead add ho gaya!');
    }
    setForm(emptyForm()); setEditId(null); setView('list');
  };

  const moveNext = (lead: LeadRecord) => {
    const cfg = STATUS_CONFIG[lead.status];
    if (!cfg.next) return;
    if (cfg.next === 'converted') { setConfirmConvert(lead); return; }
    onUpdate(lead.id, { status: cfg.next, updatedAt: new Date().toISOString() });
    showToast(`Status updated → ${STATUS_CONFIG[cfg.next].label}`);
    if (detail?.id === lead.id) setDetail({ ...lead, status: cfg.next });
  };

  const markLost = (lead: LeadRecord) => {
    onUpdate(lead.id, { status: 'lost', updatedAt: new Date().toISOString() });
    showToast('Lead lost mark ho gaya.');
    if (detail?.id === lead.id) setDetail({ ...lead, status: 'lost' });
  };

  // ── ADD / EDIT FORM ─────────────────────────────────────────
  if (view === 'add' || view === 'edit') return (
    <div className={`min-h-screen ${isDark ? 'bg-[#0b0f1a] text-white' : 'bg-slate-50 text-slate-900'} p-4 pb-24`}>
      <button onClick={() => { setView('list'); setForm(emptyForm()); setEditId(null); }}
        className={`flex items-center gap-2 ${isDark ? 'text-white/50' : 'text-slate-500'} hover:${isDark ? 'text-white' : 'text-slate-900'} mb-6 text-sm`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        Back
      </button>
      <h2 className="text-2xl font-black mb-6">{editId ? 'Lead Edit Karo' : 'Naya Lead Add Karo'}</h2>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={`text-xs font-bold ${isDark ? 'text-white/50' : 'text-slate-500'} uppercase tracking-wider block mb-2`}>Naam *</label>
            <input value={form.name||''} onChange={e => setForm(p=>({...p,name:e.target.value}))}
              placeholder="Customer naam" className={`w-full ${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-xl px-3 py-3 ${isDark ? 'text-white' : 'text-slate-900'} text-sm focus:outline-none focus:border-indigo-500`}/>
          </div>
          <div>
            <label className={`text-xs font-bold ${isDark ? 'text-white/50' : 'text-slate-500'} uppercase tracking-wider block mb-2`}>Phone *</label>
            <input value={form.phone||''} onChange={e => setForm(p=>({...p,phone:e.target.value}))}
              placeholder="03xxxxxxxxx" className={`w-full ${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-xl px-3 py-3 ${isDark ? 'text-white' : 'text-slate-900'} text-sm focus:outline-none focus:border-indigo-500`}/>
          </div>
        </div>

        <div>
          <label className={`text-xs font-bold ${isDark ? 'text-white/50' : 'text-slate-500'} uppercase tracking-wider block mb-2`}>Address</label>
          <input value={form.address||''} onChange={e => setForm(p=>({...p,address:e.target.value}))}
            placeholder="Ghar ka address" className={`w-full ${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-2xl px-4 py-3 ${isDark ? 'text-white' : 'text-slate-900'} text-sm focus:outline-none focus:border-indigo-500`}/>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={`text-xs font-bold ${isDark ? 'text-white/50' : 'text-slate-500'} uppercase tracking-wider block mb-2`}>Area</label>
            <input value={form.area||''} onChange={e => setForm(p=>({...p,area:e.target.value}))}
              placeholder="Mohalla / Colony" className={`w-full ${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-xl px-3 py-3 ${isDark ? 'text-white' : 'text-slate-900'} text-sm focus:outline-none focus:border-indigo-500`}/>
          </div>
          <div>
            <label className={`text-xs font-bold ${isDark ? 'text-white/50' : 'text-slate-500'} uppercase tracking-wider block mb-2`}>Interested Plan</label>
            <select value={form.interestedPlan||''} onChange={e => setForm(p=>({...p,interestedPlan:e.target.value}))}
              className={`w-full ${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-xl px-3 py-3 ${isDark ? 'text-white' : 'text-slate-900'} text-sm focus:outline-none focus:border-indigo-500`}>
              <option value="">Select Plan</option>
              {plans.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={`text-xs font-bold ${isDark ? 'text-white/50' : 'text-slate-500'} uppercase tracking-wider block mb-2`}>Source</label>
            <select value={form.source||'Walk-in'} onChange={e => setForm(p=>({...p,source:e.target.value}))}
              className={`w-full ${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-xl px-3 py-3 ${isDark ? 'text-white' : 'text-slate-900'} text-sm focus:outline-none focus:border-indigo-500`}>
              {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={`text-xs font-bold ${isDark ? 'text-white/50' : 'text-slate-500'} uppercase tracking-wider block mb-2`}>Assign To Agent</label>
            <select value={form.assignedTo||''} onChange={e => setForm(p=>({...p,assignedTo:e.target.value}))}
              className={`w-full ${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-xl px-3 py-3 ${isDark ? 'text-white' : 'text-slate-900'} text-sm focus:outline-none focus:border-indigo-500`}>
              <option value="">— None —</option>
              {subManagers.map(sm => <option key={sm.id} value={sm.username}>{sm.name||sm.username}</option>)}
            </select>
          </div>
        </div>

        {form.source === 'Referral' && (
          <div>
            <label className={`text-xs font-bold ${isDark ? 'text-white/50' : 'text-slate-500'} uppercase tracking-wider block mb-2`}>Referred By</label>
            <input value={form.referredBy||''} onChange={e => setForm(p=>({...p,referredBy:e.target.value}))}
              placeholder="Customer naam jo refer kiya" className={`w-full ${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-xl px-3 py-3 ${isDark ? 'text-white' : 'text-slate-900'} text-sm focus:outline-none focus:border-indigo-500`}/>
          </div>
        )}

        <div>
          <label className={`text-xs font-bold ${isDark ? 'text-white/50' : 'text-slate-500'} uppercase tracking-wider block mb-2`}>Follow-up Date</label>
          <input type="date" value={form.followUpDate||''} onChange={e => setForm(p=>({...p,followUpDate:e.target.value}))}
            className={`w-full ${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-2xl px-4 py-3 ${isDark ? 'text-white' : 'text-slate-900'} text-sm focus:outline-none focus:border-indigo-500`}/>
        </div>

        <div>
          <label className={`text-xs font-bold ${isDark ? 'text-white/50' : 'text-slate-500'} uppercase tracking-wider block mb-2`}>Note</label>
          <textarea value={form.note||''} onChange={e => setForm(p=>({...p,note:e.target.value}))}
            placeholder="Koi baat jo yaad rakhni ho..." rows={3}
            className={`w-full ${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-2xl px-4 py-3 ${isDark ? 'text-white' : 'text-slate-900'} text-sm focus:outline-none focus:border-indigo-500 resize-none`}/>
        </div>

        <button onClick={handleSave}
          className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-95">
          {editId ? '💾 Save Changes' : '➕ Add Lead'}
        </button>
      </div>
    </div>
  );

  // ── DETAIL VIEW ─────────────────────────────────────────────
  if (view === 'detail' && detail) {
    const cfg = STATUS_CONFIG[detail.status];
    const nextCfg = cfg.next ? STATUS_CONFIG[cfg.next] : null;
    return (
      <div className={`min-h-screen ${isDark ? 'bg-[#0b0f1a] text-white' : 'bg-slate-50 text-slate-900'} p-4 pb-24`}>
        <button onClick={() => setView('list')} className={`flex items-center gap-2 ${isDark ? 'text-white/50' : 'text-slate-500'} hover:${isDark ? 'text-white' : 'text-slate-900'} mb-6 text-sm`}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back
        </button>

        <div className={`${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-3xl p-6 mb-4`}>
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-2xl font-black">{detail.name}</p>
              <a href={`tel:${detail.phone}`} className="text-indigo-400 font-semibold text-sm">{detail.phone}</a>
            </div>
            <span className={`px-3 py-1.5 rounded-full text-xs font-black border ${cfg.bg} ${cfg.color}`}>
              {cfg.emoji} {cfg.label}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            {detail.address && (
              <div className={`col-span-2 ${isDark ? 'bg-white/5' : 'bg-white'} rounded-xl p-3`}>
                <p className={`${isDark ? 'text-white/40' : 'text-slate-500'} text-xs uppercase tracking-wider`}>Address</p>
                <p className="font-semibold mt-1">{detail.address}</p>
              </div>
            )}
            {detail.area && <div className={`${isDark ? 'bg-white/5' : 'bg-white'} rounded-xl p-3`}><p className={`${isDark ? 'text-white/40' : 'text-slate-500'} text-xs`}>Area</p><p className="font-semibold mt-1">{detail.area}</p></div>}
            {detail.interestedPlan && <div className={`${isDark ? 'bg-white/5' : 'bg-white'} rounded-xl p-3`}><p className={`${isDark ? 'text-white/40' : 'text-slate-500'} text-xs`}>Plan</p><p className="font-semibold mt-1">{detail.interestedPlan}</p></div>}
            {detail.source && <div className={`${isDark ? 'bg-white/5' : 'bg-white'} rounded-xl p-3`}><p className={`${isDark ? 'text-white/40' : 'text-slate-500'} text-xs`}>Source</p><p className="font-semibold mt-1">{detail.source}</p></div>}
            {detail.assignedTo && <div className={`${isDark ? 'bg-white/5' : 'bg-white'} rounded-xl p-3`}><p className={`${isDark ? 'text-white/40' : 'text-slate-500'} text-xs`}>Agent</p><p className="font-semibold mt-1">{detail.assignedTo}</p></div>}
            {detail.referredBy && <div className={`col-span-2 ${isDark ? 'bg-white/5' : 'bg-white'} rounded-xl p-3`}><p className={`${isDark ? 'text-white/40' : 'text-slate-500'} text-xs`}>Referred By</p><p className="font-semibold mt-1">{detail.referredBy}</p></div>}
            {detail.followUpDate && (
              <div className="col-span-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3">
                <p className="text-yellow-400 text-xs font-bold uppercase tracking-wider">⏰ Follow-up Date</p>
                <p className="font-semibold mt-1">{new Date(detail.followUpDate).toLocaleDateString('en-PK', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}</p>
              </div>
            )}
          </div>
          {detail.note && <div className={`mt-3 ${isDark ? 'bg-white/5' : 'bg-white'} rounded-xl p-3 text-sm ${isDark ? 'text-white/60' : 'text-slate-500'} italic`}>"{detail.note}"</div>}
        </div>

        {/* WhatsApp quick contact */}
        <a href={`https://wa.me/92${detail.phone.replace(/^0/, '')}`} target="_blank" rel="noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3.5 bg-green-600 hover:bg-green-500 rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-95 mb-3">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.553 4.126 1.52 5.874L0 24l6.296-1.496A11.933 11.933 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.797 9.797 0 01-4.988-1.366l-.358-.213-3.713.882.939-3.63-.234-.373A9.797 9.797 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182c5.43 0 9.818 4.388 9.818 9.818 0 5.43-4.388 9.818-9.818 9.818z"/></svg>
          WhatsApp Contact
        </a>

        {/* Move to next stage */}
        {nextCfg && detail.status !== 'converted' && detail.status !== 'lost' && (
          <button onClick={() => moveNext(detail)}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-95 mb-3">
            {nextCfg.emoji} Move → {nextCfg.label}
          </button>
        )}

        {detail.status !== 'lost' && detail.status !== 'converted' && (
          <button onClick={() => markLost(detail)}
            className="w-full py-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl font-bold text-sm transition-all mb-3">
            ❌ Mark as Lost
          </button>
        )}

        <div className="flex gap-3 mt-1">
          <button onClick={() => { setForm({...detail}); setEditId(detail.id); setView('edit'); }}
            className={`flex-1 py-3 ${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-2xl font-bold text-sm`}>✏️ Edit</button>
          <button onClick={() => setConfirmDelete(detail.id)}
            className="flex-1 py-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl font-bold text-sm">🗑️ Delete</button>
        </div>
      </div>
    );
  }

  // ── MAIN LIST ────────────────────────────────────────────────
  return (
    <div className={`min-h-screen ${isDark ? 'bg-[#0b0f1a] text-white' : 'bg-slate-50 text-slate-900'} p-4 pb-24`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-black">Leads Pipeline</h1>
          <p className={`${isDark ? 'text-white/40' : 'text-slate-500'} text-xs mt-0.5`}>New connection inquiries track karo</p>
        </div>
        <button onClick={() => { setForm(emptyForm()); setEditId(null); setView('add'); }}
          className="bg-indigo-600 hover:bg-indigo-500 px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 flex items-center gap-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14"/></svg>
          Add
        </button>
      </div>

      {/* Today's Follow-ups Alert */}
      {todayFollowUps.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4 mb-4">
          <p className="text-yellow-400 font-black text-sm mb-2">⏰ Aaj ke Follow-ups ({todayFollowUps.length})</p>
          {todayFollowUps.map(l => (
            <button key={l.id} onClick={() => { setDetail(l); setView('detail'); }}
              className="w-full text-left bg-yellow-500/10 rounded-xl px-3 py-2 mb-1 last:mb-0 text-sm font-semibold hover:bg-yellow-500/20 transition-all">
              {l.name} — {l.phone} <span className={`${isDark ? 'text-white/40' : 'text-slate-500'} text-xs ml-1`}>({STATUS_CONFIG[l.status].label})</span>
            </button>
          ))}
        </div>
      )}

      {/* Pipeline Stage Cards */}
      <div className="grid grid-cols-3 gap-2 mb-5">
        {(['new','contacted','survey_done','install_pending','converted','lost'] as LeadStatus[]).map(s => {
          const cfg = STATUS_CONFIG[s];
          return (
            <button key={s} onClick={() => setFilterStatus(filterStatus === s ? 'all' : s)}
              className={`rounded-2xl p-3 text-center border transition-all active:scale-95 ${filterStatus === s ? 'ring-2 ring-indigo-500' : ''} ${cfg.bg}`}>
              <p className={`text-xl font-black ${cfg.color}`}>{stats[s]}</p>
              <p className={`text-[9px] font-bold ${isDark ? 'text-white/50' : 'text-slate-500'} uppercase tracking-wider mt-0.5 leading-tight`}>{cfg.label.replace(' ✅','')}</p>
            </button>
          );
        })}
      </div>

      {/* Conversion Rate */}
      {leads.length > 0 && (
        <div className="bg-gradient-to-r from-emerald-600/20 to-teal-600/20 border border-emerald-500/20 rounded-2xl px-5 py-3 mb-4 flex items-center justify-between">
          <span className={`text-xs font-bold ${isDark ? 'text-white/50' : 'text-slate-500'} uppercase tracking-wider`}>Conversion Rate</span>
          <span className="text-lg font-black text-emerald-400">{conversionRate}%</span>
        </div>
      )}

      {/* Search */}
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search naam, phone, area..."
        className={`w-full ${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-2xl px-4 py-3 ${isDark ? 'text-white' : 'text-slate-900'} text-sm focus:outline-none focus:border-indigo-500 ${isDark ? 'placeholder-white/30' : 'placeholder-slate-400'} mb-4`}/>

      {/* Lead Cards */}
      {filtered.length === 0 ? (
        <div className={`text-center py-20 ${isDark ? 'text-white/30' : 'text-slate-400'}`}>
          <div className="text-5xl mb-4">🎯</div>
          <p className="font-bold text-lg">Koi lead nahi</p>
          <p className="text-sm mt-1">Pehla inquiry add karo</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(lead => {
            const cfg = STATUS_CONFIG[lead.status];
            const isFollowUpToday = lead.followUpDate === new Date().toISOString().split('T')[0];
            return (
              <button key={lead.id} onClick={() => { setDetail(lead); setView('detail'); }}
                className={`w-full ${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} hover:${isDark ? 'bg-white/8' : 'bg-slate-50'} rounded-2xl p-4 text-left transition-all active:scale-[0.98]`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-black text-base">{lead.name}</p>
                      {isFollowUpToday && <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full font-bold">Follow-up Today</span>}
                    </div>
                    <p className={`${isDark ? 'text-white/50' : 'text-slate-500'} text-sm`}>{lead.phone}</p>
                    {lead.area && <p className={`${isDark ? 'text-white/30' : 'text-slate-400'} text-xs mt-1`}>📍 {lead.area}</p>}
                    {lead.interestedPlan && <p className="text-indigo-400 text-xs mt-1">📦 {lead.interestedPlan}</p>}
                  </div>
                  <span className={`ml-3 px-2.5 py-1 rounded-full text-[10px] font-black border whitespace-nowrap ${cfg.bg} ${cfg.color}`}>
                    {cfg.emoji} {cfg.label.replace(' ✅','')}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Convert Confirm Modal */}
      {confirmConvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setConfirmConvert(null)}/>
          <div className={`relative z-10 ${isDark ? 'bg-slate-900' : 'bg-slate-50'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-3xl p-8 w-full max-w-sm text-center`}>
            <p className="text-4xl mb-3">🎉</p>
            <p className="text-lg font-black mb-2">Customer mein Convert Karo?</p>
            <p className={`${isDark ? 'text-white/40' : 'text-slate-500'} text-sm mb-6`}>{confirmConvert.name} ko active customer mein add kiya jayega.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmConvert(null)} className={`flex-1 py-3 ${isDark ? 'bg-white/5' : 'bg-white'} rounded-2xl font-bold text-sm`}>Cancel</button>
              <button onClick={() => {
                onConvertToCustomer(confirmConvert);
                onUpdate(confirmConvert.id, { status: 'converted', updatedAt: new Date().toISOString() });
                setConfirmConvert(null); setView('list');
                showToast(`${confirmConvert.name} customer mein convert ho gaya!`);
              }} className="flex-1 py-3 bg-emerald-600 rounded-2xl font-bold text-sm">Convert ✅</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setConfirmDelete(null)}/>
          <div className={`relative z-10 ${isDark ? 'bg-slate-900' : 'bg-slate-50'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-3xl p-8 w-full max-w-sm text-center`}>
            <p className="text-lg font-black mb-2">Delete Lead?</p>
            <p className={`${isDark ? 'text-white/40' : 'text-slate-500'} text-sm mb-6`}>Yeh action undo nahi ho sakti.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className={`flex-1 py-3 ${isDark ? 'bg-white/5' : 'bg-white'} rounded-2xl font-bold text-sm`}>Cancel</button>
              <button onClick={() => { onDelete(confirmDelete); setConfirmDelete(null); setView('list'); showToast('Deleted!'); }}
                className="flex-1 py-3 bg-red-600 rounded-2xl font-bold text-sm">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
          <div className={`bg-emerald-600 ${isDark ? 'text-white' : 'text-slate-900'} px-6 py-3 rounded-2xl shadow-2xl text-sm font-bold`}>{toast}</div>
        </div>
      )}
    </div>
  );
};

export default LeadsPipeline;
