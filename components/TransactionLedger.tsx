import React, { useState, useMemo } from 'react';
import { Transaction, UserRecord, BusinessExpense } from '../types';
import { calcProfitSummary } from '../utils/profitCalc';
import RecordTransaction from './RecordTransaction';

interface TransactionLedgerProps {
  transactions: Transaction[];
  expenses: BusinessExpense[];
  users: UserRecord[];
  companyId?: string;
  createdBy?: string;
  onAdd: (t: Omit<Transaction, 'id' | 'createdAt'>) => void;
  onDelete: (id: string) => void;
}

const TYPE_META: Record<Transaction['type'], { label: string; badge: string; amountClass: string }> = {
  recovery:      { label: 'Recovery',         badge: 'bg-emerald-500/10 text-emerald-500', amountClass: 'text-emerald-500' },
  vendorPayment: { label: 'Vendor Payment',   badge: 'bg-indigo-500/10 text-indigo-500',   amountClass: 'text-indigo-500' },
  ispPayment:    { label: 'ISP Payment',      badge: 'bg-violet-500/10 text-violet-500',   amountClass: 'text-violet-500' },
};

// Generate last 12 months + current + next month options (Android-safe: no input type="month")
const generateMonthOptions = () => {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  for (let i = 12; i >= -1; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(d);
    options.push({ value, label });
  }
  return options;
};
const MONTH_OPTIONS = generateMonthOptions();

const TransactionLedger: React.FC<TransactionLedgerProps> = ({ transactions, expenses, users, companyId, createdBy, onAdd, onDelete }) => {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [showForm, setShowForm] = useState(false);
  const [filterType, setFilterType] = useState<'all' | Transaction['type']>('all');

  const period = useMemo(() => {
    const [yr, mo] = month.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(yr, mo - 1, 1));
  }, [month]);

  const summary = useMemo(
    () => calcProfitSummary(transactions || [], expenses || [], period, month),
    [transactions, expenses, period, month]
  );

  const monthTransactions = useMemo(() => {
    return (transactions || [])
      .filter(t => t.period === period && (filterType === 'all' || t.type === filterType))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, period, filterType]);

  const userNameById = useMemo(() => {
    const map: Record<string, string> = {};
    (users || []).forEach(u => { map[u.id] = u.name; });
    return map;
  }, [users]);

  const describeCounterparty = (t: Transaction): string => {
    if (t.type === 'recovery') return (t.customerId && userNameById[t.customerId]) || 'Unknown customer';
    if (t.type === 'vendorPayment') return t.vendorId || 'Unknown vendor';
    return t.ispProviderId || 'Unknown provider';
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 p-6 rounded-3xl shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Transaction Ledger</h2>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mt-1">Recovery · Vendor Payments · ISP Payments</p>
        </div>
        <div className="flex gap-3">
          <select value={month} onChange={e => setMonth(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500">
            {MONTH_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
          <button onClick={() => setShowForm(true)}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Transaction
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-emerald-600 to-teal-600 text-white p-6 rounded-[2rem] shadow-xl shadow-emerald-600/20">
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-1">Cash Recovered</p>
          <p className="text-2xl font-black">Rs. {summary.cashRecovered.toLocaleString()}</p>
        </div>
        <div className="bg-gradient-to-br from-indigo-600 to-purple-700 text-white p-6 rounded-[2rem] shadow-xl shadow-indigo-600/20">
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-1">Vendor Payments</p>
          <p className="text-2xl font-black">Rs. {summary.vendorOutflow.toLocaleString()}</p>
        </div>
        <div className="bg-gradient-to-br from-rose-600 to-orange-700 text-white p-6 rounded-[2rem] shadow-xl shadow-rose-600/20">
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-1">ISP Payments</p>
          <p className="text-2xl font-black">Rs. {summary.ispOutflow.toLocaleString()}</p>
        </div>
        <div className="bg-gradient-to-br from-slate-600 to-blue-800 text-white p-6 rounded-[2rem] shadow-xl shadow-slate-600/20">
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-1">Profit Ratio</p>
          <p className="text-2xl font-black">{summary.profitRatioPct.toFixed(1)}%</p>
          <p className="text-[9px] font-bold uppercase tracking-widest opacity-50 mt-1">Net: Rs. {summary.netProfit.toLocaleString()}</p>
        </div>
      </div>

      {/* Type filter */}
      <div className="flex gap-2">
        {(['all', 'recovery', 'vendorPayment', 'ispPayment'] as const).map(t => (
          <button key={t} onClick={() => setFilterType(t)}
            className={`px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${
              filterType === t ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-500 hover:bg-slate-200 dark:hover:bg-white/10'
            }`}>
            {t === 'all' ? 'All' : TYPE_META[t].label}
          </button>
        ))}
      </div>

      {/* Transaction list */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-3xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-white/5">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Ledger — {period}</p>
        </div>
        {monthTransactions.length > 0 ? (
          <div className="divide-y divide-slate-100 dark:divide-white/[0.03]">
            {monthTransactions.map(t => (
              <div key={t.id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 dark:hover:bg-white/[0.01] group">
                <div className="flex items-center gap-4">
                  <span className={`px-2.5 py-1 rounded-xl text-[9px] font-bold uppercase ${TYPE_META[t.type].badge}`}>{TYPE_META[t.type].label}</span>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{describeCounterparty(t)}</p>
                    <p className="text-[10px] text-slate-400">{new Date(t.date).toLocaleDateString()} · {t.paymentMode}{t.refInfo ? ` · ${t.refInfo}` : ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <p className={`text-sm font-black ${TYPE_META[t.type].amountClass}`}>Rs. {(Number(t.amount) || 0).toLocaleString()}</p>
                  <button onClick={() => onDelete(t.id)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-all">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-16 text-center opacity-30 text-xs font-bold uppercase tracking-widest">No transactions for {period}</div>
        )}
      </div>

      {showForm && (
        <RecordTransaction
          users={users}
          companyId={companyId}
          createdBy={createdBy}
          defaultPeriod={period}
          onSave={(t) => { onAdd(t); setShowForm(false); }}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  );
};

export default TransactionLedger;
