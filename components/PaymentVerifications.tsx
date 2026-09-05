import React, { useState, useMemo } from 'react';
import { useIsDark } from '../hooks/useIsDark';
import { PendingPaymentRecord, PendingPaymentStatus, UserRecord } from '../types';

interface Props {
  payments: PendingPaymentRecord[];
  users: UserRecord[];
  onApprove: (id: string) => void;
  onDismiss: (id: string) => void;
  onDelete: (id: string) => void;
  onGenerateReceipt: (payment: PendingPaymentRecord) => void;
}

const STATUS_CONFIG: Record<PendingPaymentStatus, { label: string; emoji: string; color: string; bg: string }> = {
  pending:   { label: 'Pending Review', emoji: '🕒', color: 'text-yellow-400',  bg: 'bg-yellow-500/15 border-yellow-500/30' },
  approved:  { label: 'Approved',       emoji: '✅', color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30' },
  dismissed: { label: 'Dismissed',      emoji: '🚫', color: 'text-red-400',     bg: 'bg-red-500/15 border-red-500/30' },
};

const PaymentVerifications: React.FC<Props> = ({ payments, users, onApprove, onDismiss, onDelete, onGenerateReceipt }) => {
  const isDark = useIsDark();
  const [filterStatus, setFilterStatus] = useState<PendingPaymentStatus | 'all'>('pending');
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmDismiss, setConfirmDismiss] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  const stats = useMemo(() => {
    const counts: Record<PendingPaymentStatus, number> = { pending: 0, approved: 0, dismissed: 0 };
    payments.forEach(p => { if (counts[p.status] !== undefined) counts[p.status]++; });
    return counts;
  }, [payments]);

  const filtered = useMemo(() => {
    let list = [...payments];
    if (filterStatus !== 'all') list = list.filter(p => p.status === filterStatus);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        (p.customerName || '').toLowerCase().includes(q) ||
        (p.phone || '').includes(q) ||
        (p.trxId || '').toLowerCase().includes(q) ||
        (p.bank || '').toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [payments, filterStatus, search]);

  const matchedUser = (p: PendingPaymentRecord) => p.customerId ? users.find(u => u.id === p.customerId) : undefined;

  return (
    <div className={`min-h-screen ${isDark ? 'bg-[#0b0f1a] text-white' : 'bg-slate-50 text-slate-900'} p-4 pb-24`}>
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-black">Payment Verifications</h1>
        <p className={`${isDark ? 'text-white/40' : 'text-slate-500'} text-xs mt-0.5`}>WhatsApp par aaye payment screenshots verify karo</p>
      </div>

      {/* Status Filter Cards */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {(['pending', 'approved', 'dismissed'] as PendingPaymentStatus[]).map(s => {
          const cfg = STATUS_CONFIG[s];
          return (
            <button key={s} onClick={() => setFilterStatus(filterStatus === s ? 'all' : s)}
              className={`rounded-2xl p-3 text-center border transition-all active:scale-95 ${filterStatus === s ? 'ring-2 ring-indigo-500' : ''} ${cfg.bg}`}>
              <p className={`text-xl font-black ${cfg.color}`}>{stats[s]}</p>
              <p className={`text-[9px] font-bold ${isDark ? 'text-white/50' : 'text-slate-500'} uppercase tracking-wider mt-0.5 leading-tight`}>{cfg.label}</p>
            </button>
          );
        })}
      </div>

      {/* Search */}
      <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search naam, phone, bank, TRX ID..."
        className={`w-full ${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-2xl px-4 py-3 ${isDark ? 'text-white' : 'text-slate-900'} text-sm focus:outline-none focus:border-indigo-500 ${isDark ? 'placeholder-white/30' : 'placeholder-slate-400'} mb-4`}/>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className={`text-center py-20 ${isDark ? 'text-white/30' : 'text-slate-400'}`}>
          <div className="text-5xl mb-4">🧾</div>
          <p className="font-bold text-lg">Koi payment screenshot nahi mila.</p>
          <p className="text-sm mt-1">Jab customer WhatsApp par payment screenshot bhejega, yahan dikhega.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => {
            const cfg = STATUS_CONFIG[p.status];
            const user = matchedUser(p);
            return (
              <div key={p.id} className={`${isDark ? 'bg-white/5' : 'bg-white'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-3xl p-4`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-lg font-black">{p.customerName || user?.name || 'Unknown Number'}</p>
                    <a href={`tel:${p.phone}`} className="text-indigo-400 font-semibold text-sm">{p.phone}</a>
                  </div>
                  <span className={`px-3 py-1.5 rounded-full text-xs font-black border shrink-0 ${cfg.bg} ${cfg.color}`}>
                    {cfg.emoji} {cfg.label}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                  <div className={`${isDark ? 'bg-white/5' : 'bg-slate-50'} rounded-xl p-2.5`}>
                    <p className={`${isDark ? 'text-white/40' : 'text-slate-500'} text-[10px] uppercase tracking-wider`}>Amount</p>
                    <p className="font-black mt-0.5">{p.amount ? `Rs. ${p.amount}` : 'N/A'}</p>
                  </div>
                  <div className={`${isDark ? 'bg-white/5' : 'bg-slate-50'} rounded-xl p-2.5`}>
                    <p className={`${isDark ? 'text-white/40' : 'text-slate-500'} text-[10px] uppercase tracking-wider`}>Bank</p>
                    <p className="font-semibold mt-0.5">{p.bank || 'N/A'}</p>
                  </div>
                  {p.trxId && (
                    <div className={`${isDark ? 'bg-white/5' : 'bg-slate-50'} rounded-xl p-2.5`}>
                      <p className={`${isDark ? 'text-white/40' : 'text-slate-500'} text-[10px] uppercase tracking-wider`}>TRX ID</p>
                      <p className="font-semibold mt-0.5 break-all">{p.trxId}</p>
                    </div>
                  )}
                  {p.dateTime && (
                    <div className={`${isDark ? 'bg-white/5' : 'bg-slate-50'} rounded-xl p-2.5`}>
                      <p className={`${isDark ? 'text-white/40' : 'text-slate-500'} text-[10px] uppercase tracking-wider`}>Date/Time</p>
                      <p className="font-semibold mt-0.5">{p.dateTime}</p>
                    </div>
                  )}
                  {p.senderName && (
                    <div className={`col-span-2 ${isDark ? 'bg-white/5' : 'bg-slate-50'} rounded-xl p-2.5`}>
                      <p className={`${isDark ? 'text-white/40' : 'text-slate-500'} text-[10px] uppercase tracking-wider`}>Sender (on slip)</p>
                      <p className="font-semibold mt-0.5">{p.senderName}</p>
                    </div>
                  )}
                </div>

                {p.caption && <p className={`text-sm italic mb-3 ${isDark ? 'text-white/60' : 'text-slate-500'}`}>"{p.caption}"</p>}

                {p.mediaUrl && (
                  <a href={p.mediaUrl} target="_blank" rel="noreferrer" className="block mb-3">
                    <img src={p.mediaUrl} alt="Payment screenshot" className="w-full max-h-56 object-contain rounded-2xl border border-white/10" />
                  </a>
                )}

                <div className="flex flex-wrap gap-2">
                  {p.status === 'pending' && (
                    <button onClick={() => { onApprove(p.id); showToast('Payment approved.'); }}
                      className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95">
                      ✅ Approve
                    </button>
                  )}
                  <button onClick={() => onGenerateReceipt(p)}
                    className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95">
                    🧾 Generate Receipt
                  </button>
                  {p.status === 'pending' && (
                    <button onClick={() => setConfirmDismiss(p.id)}
                      className="py-3 px-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl font-bold text-xs">
                      🚫 Dismiss
                    </button>
                  )}
                  <button onClick={() => setConfirmDelete(p.id)}
                    className={`py-3 px-4 ${isDark ? 'bg-white/5' : 'bg-slate-100'} border ${isDark ? 'border-white/10' : 'border-slate-200'} rounded-2xl font-bold text-xs`}>
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirm Dismiss Modal */}
      {confirmDismiss && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`${isDark ? 'bg-slate-800' : 'bg-white'} rounded-2xl border ${isDark ? 'border-white/10' : 'border-slate-200'} w-full max-w-md p-6 shadow-2xl`}>
            <p className="font-black text-lg mb-2">Dismiss karein?</p>
            <p className={`${isDark ? 'text-white/50' : 'text-slate-500'} text-sm mb-5`}>Ye payment record dismissed list mein chala jayega, delete nahi hoga.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDismiss(null)} className={`flex-1 py-3 ${isDark ? 'bg-white/5' : 'bg-slate-100'} rounded-xl font-bold text-sm`}>Cancel</button>
              <button onClick={() => { onDismiss(confirmDismiss); setConfirmDismiss(null); showToast('Dismissed.'); }} className="flex-1 py-3 bg-red-500 hover:bg-red-600 rounded-xl font-bold text-sm text-white">Dismiss</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className={`${isDark ? 'bg-slate-800' : 'bg-white'} rounded-2xl border ${isDark ? 'border-white/10' : 'border-slate-200'} w-full max-w-md p-6 shadow-2xl`}>
            <p className="font-black text-lg mb-2">Permanently delete karein?</p>
            <p className={`${isDark ? 'text-white/50' : 'text-slate-500'} text-sm mb-5`}>Ye record hamesha ke liye delete ho jayega.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className={`flex-1 py-3 ${isDark ? 'bg-white/5' : 'bg-slate-100'} rounded-xl font-bold text-sm`}>Cancel</button>
              <button onClick={() => { onDelete(confirmDelete); setConfirmDelete(null); showToast('Deleted.'); }} className="flex-1 py-3 bg-red-500 hover:bg-red-600 rounded-xl font-bold text-sm text-white">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl font-bold text-sm z-50">
          {toast}
        </div>
      )}
    </div>
  );
};

export default PaymentVerifications;
