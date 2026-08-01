import React, { useState, useMemo } from 'react';
import { Transaction, UserRecord, PaymentMethod } from '../types';

interface RecordTransactionProps {
  users: UserRecord[];
  companyId?: string;
  createdBy?: string;
  defaultPeriod: string;       // "Month Year" — current period, matches Receipt period format
  onSave: (t: Omit<Transaction, 'id' | 'createdAt'>) => void;
  onClose: () => void;
}

type TxType = Transaction['type'];

const TAB_CONFIG: Record<TxType, { label: string; activeClass: string; amountClass: string }> = {
  recovery:      { label: 'Recovery',            activeClass: 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30', amountClass: 'text-emerald-500' },
  vendorPayment: { label: 'Payment to Vendor',    activeClass: 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30',  amountClass: 'text-indigo-500' },
  ispPayment:    { label: 'Payment to ISP',       activeClass: 'bg-violet-600 text-white shadow-lg shadow-violet-600/30', amountClass: 'text-violet-500' },
};

const inputClass = 'w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all';
const labelClass = 'text-[10px] font-bold text-slate-400 uppercase tracking-widest';

const RecordTransaction: React.FC<RecordTransactionProps> = ({ users, companyId, createdBy, defaultPeriod, onSave, onClose }) => {
  const [tab, setTab] = useState<TxType>('recovery');
  const [amount, setAmount] = useState<number | ''>('');
  const [discount, setDiscount] = useState<number | ''>('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMode, setPaymentMode] = useState<string>(PaymentMethod.CASH);
  const [refInfo, setRefInfo] = useState('');
  const [notes, setNotes] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [ispProviderId, setIspProviderId] = useState('');

  const activeCustomers = useMemo(
    () => (users || []).filter(u => u.status !== 'deleted').sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [users]
  );

  const period = useMemo(() => {
    const d = new Date(date);
    if (isNaN(d.getTime())) return defaultPeriod;
    return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(d);
  }, [date, defaultPeriod]);

  const canSubmit = Number(amount) > 0
    && (tab !== 'recovery' || customerId)
    && (tab !== 'vendorPayment' || vendorId.trim())
    && (tab !== 'ispPayment' || ispProviderId.trim());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const base: Omit<Transaction, 'id' | 'createdAt'> = {
      type: tab,
      date,
      period,
      amount: Number(amount) || 0,
      paymentMode,
      refInfo: refInfo.trim() || undefined,
      notes: notes.trim() || undefined,
      companyId,
      createdBy,
    };
    if (tab === 'recovery') {
      onSave({ ...base, customerId, discount: Number(discount) || undefined });
    } else if (tab === 'vendorPayment') {
      onSave({ ...base, vendorId: vendorId.trim() });
    } else {
      onSave({ ...base, ispProviderId: ispProviderId.trim() });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white dark:bg-[#12162a] rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-white/5 overflow-hidden animate-in zoom-in-95 duration-300 max-h-[90vh] overflow-y-auto">
        <div className="px-8 pt-8 pb-5 border-b border-slate-100 dark:border-white/5">
          <h3 className="text-xl font-bold text-slate-900 dark:text-white">New Transaction</h3>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">3-Way Ledger — Recovery / Vendor / ISP</p>
        </div>

        {/* Tab switcher */}
        <div className="px-8 pt-5 flex gap-2">
          {(Object.keys(TAB_CONFIG) as TxType[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 py-3 rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all ${
                tab === t ? TAB_CONFIG[t].activeClass : 'bg-slate-100 dark:bg-white/5 text-slate-500 hover:bg-slate-200 dark:hover:bg-white/10'
              }`}
            >
              {TAB_CONFIG[t].label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-4">
          {/* Tab-specific field */}
          {tab === 'recovery' && (
            <div className="space-y-2">
              <label className={labelClass}>Customer</label>
              <select required value={customerId} onChange={e => setCustomerId(e.target.value)} className={inputClass}>
                <option value="">Select customer...</option>
                {activeCustomers.map(u => <option key={u.id} value={u.id}>{u.name}{u.area ? ` — ${u.area}` : ''}</option>)}
              </select>
            </div>
          )}
          {tab === 'vendorPayment' && (
            <div className="space-y-2">
              <label className={labelClass}>Vendor Name</label>
              <input required type="text" placeholder="e.g. Router supplier" value={vendorId}
                onChange={e => setVendorId(e.target.value)} className={inputClass} />
            </div>
          )}
          {tab === 'ispPayment' && (
            <div className="space-y-2">
              <label className={labelClass}>ISP / Bandwidth Provider</label>
              <input required type="text" placeholder="e.g. Upstream bandwidth provider" value={ispProviderId}
                onChange={e => setIspProviderId(e.target.value)} className={inputClass} />
            </div>
          )}

          {/* Shared fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className={labelClass}>Amount (Rs.)</label>
              <input required type="number" min="0" placeholder="0" value={amount}
                onChange={e => setAmount(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                className={`${inputClass} font-bold ${TAB_CONFIG[tab].amountClass}`} />
            </div>
            {tab === 'recovery' ? (
              <div className="space-y-2">
                <label className={labelClass}>Discount (Optional)</label>
                <input type="number" min="0" placeholder="0" value={discount}
                  onChange={e => setDiscount(e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                  className={inputClass} />
              </div>
            ) : (
              <div className="space-y-2">
                <label className={labelClass}>Payment Mode</label>
                <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)} className={inputClass}>
                  {Object.values(PaymentMethod).map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}
          </div>

          {tab === 'recovery' && (
            <div className="space-y-2">
              <label className={labelClass}>Payment Mode</label>
              <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)} className={inputClass}>
                {Object.values(PaymentMethod).map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          )}

          <div className="space-y-2">
            <label className={labelClass}>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputClass} />
          </div>

          <div className="space-y-2">
            <label className={labelClass}>Reference / TRX ID (Optional)</label>
            <input type="text" placeholder="e.g. TRX-00123" value={refInfo}
              onChange={e => setRefInfo(e.target.value)} className={inputClass} />
          </div>

          <div className="space-y-2">
            <label className={labelClass}>Notes (Optional)</label>
            <input type="text" placeholder="Any additional notes..." value={notes}
              onChange={e => setNotes(e.target.value)} className={inputClass} />
          </div>

          <div className="flex gap-4 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 py-4 rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-500 text-[10px] font-bold uppercase tracking-widest hover:bg-slate-200 transition-all">
              Cancel
            </button>
            <button type="submit" disabled={!canSubmit}
              className="flex-[2] py-4 rounded-2xl bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-600/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
              Save Transaction
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RecordTransaction;
