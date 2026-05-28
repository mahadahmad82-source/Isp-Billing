import React, { useState, useMemo } from 'react';
import { BusinessExpense } from '../types';

interface BusinessExpensesProps {
  expenses: BusinessExpense[];
  monthlyRevenue: number;
  onAdd: (e: Omit<BusinessExpense, 'id' | 'createdAt'>) => void;
  onDelete: (id: string) => void;
}

const CATEGORIES = ['salary','equipment','rent','utilities','bandwidth','marketing','other'] as const;
const CAT_COLORS: Record<string, string> = {
  salary:    'bg-indigo-500/10 text-indigo-500',
  equipment: 'bg-amber-500/10 text-amber-500',
  rent:      'bg-rose-500/10 text-rose-500',
  utilities: 'bg-sky-500/10 text-sky-500',
  marketing: 'bg-violet-500/10 text-violet-500',
  bandwidth: 'bg-cyan-500/10 text-cyan-500',
  other:     'bg-slate-200 dark:bg-white/5 text-slate-500',
};

const blankForm = () => ({ title: '', amount: 0, category: 'other' as const, date: new Date().toISOString().split('T')[0], notes: '' });

const BusinessExpenses: React.FC<BusinessExpensesProps> = ({ expenses, monthlyRevenue, onAdd, onDelete }) => {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blankForm);

  const monthExpenses = useMemo(() =>
    expenses.filter(e => e.date.startsWith(month))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [expenses, month]);

  const totalExpenses = monthExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const grossProfit = (Number(monthlyRevenue) || 0) - (Number(totalExpenses) || 0);

  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    monthExpenses.forEach(e => { map[e.category] = (map[e.category] || 0) + e.amount; });
    return map;
  }, [monthExpenses]);

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    onAdd({ ...form, amount: parseFloat(String(form.amount)) || 0 });
    setForm(blankForm());
    setShowForm(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 p-6 rounded-3xl shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Business Expenses</h2>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mt-1">Monthly expenses · Gross profit tracker</p>
        </div>
        <div className="flex gap-3">
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="px-4 py-2.5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500" />
          <button onClick={() => setShowForm(true)}
            className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add Expense
          </button>
        </div>
      </div>

      {/* P&L Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-indigo-600 text-white p-6 rounded-[2rem] shadow-xl shadow-indigo-600/20">
          <p className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-1">Total Revenue</p>
          <p className="text-3xl font-black">Rs. {(Number(monthlyRevenue) || 0).toLocaleString()}</p>
          <p className="text-[9px] font-bold uppercase tracking-widest opacity-50 mt-2">Collections this month</p>
        </div>
        <div className="bg-rose-500/5 border border-rose-500/10 p-6 rounded-[2rem]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-rose-500/60 mb-1">Total Expenses</p>
          <p className="text-3xl font-black text-rose-500">Rs. {(Number(totalExpenses) || 0).toLocaleString()}</p>
          <p className="text-[9px] font-bold uppercase tracking-widest text-rose-400/50 mt-2">{monthExpenses.length} entries</p>
        </div>
        <div className={`p-6 rounded-[2rem] border ${grossProfit >= 0 ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-rose-500/5 border-rose-500/20'}`}>
          <p className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${grossProfit >= 0 ? 'text-emerald-500/60' : 'text-rose-500/60'}`}>Gross Profit</p>
          <p className={`text-3xl font-black ${grossProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>Rs. {Math.abs(Number(grossProfit) || 0).toLocaleString()}</p>
          <p className={`text-[9px] font-bold uppercase tracking-widest mt-2 ${grossProfit >= 0 ? 'text-emerald-500/50' : 'text-rose-500/50'}`}>
            {grossProfit >= 0 ? '▲ Profit' : '▼ Loss'}
          </p>
        </div>
      </div>

      {/* Category breakdown */}
      {Object.keys(byCategory).length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-sm">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Breakdown by Category</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(byCategory).map(([cat, amt]) => (
              <div key={cat} className="flex items-center justify-between bg-slate-50 dark:bg-white/[0.02] rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase ${CAT_COLORS[cat]}`}>{cat}</span>
                </div>
                <p className="text-xs font-black text-slate-900 dark:text-white">Rs. {(Number(amt) || 0).toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Expense list */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-3xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-white/5">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Expense Log — {month}</p>
        </div>
        {monthExpenses.length > 0 ? (
          <div className="divide-y divide-slate-100 dark:divide-white/[0.03]">
            {monthExpenses.map(exp => (
              <div key={exp.id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 dark:hover:bg-white/[0.01] group">
                <div className="flex items-center gap-4">
                  <span className={`px-2.5 py-1 rounded-xl text-[9px] font-bold uppercase ${CAT_COLORS[exp.category]}`}>{exp.category}</span>
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">{exp.title}</p>
                    <p className="text-[10px] text-slate-400">{new Date(exp.date).toLocaleDateString()} {exp.notes ? `· ${exp.notes}` : ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <p className="text-sm font-black text-rose-500">Rs. {(Number(exp.amount) || 0).toLocaleString()}</p>
                  <button onClick={() => onDelete(exp.id)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-all">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-16 text-center opacity-30 text-xs font-bold uppercase tracking-widest">No expenses for {month}</div>
        )}
      </div>

      {/* Add Expense Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative w-full max-w-md bg-white dark:bg-[#12162a] rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-white/5 overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="px-8 pt-8 pb-5 border-b border-slate-100 dark:border-white/5">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">Add Expense</h3>
            </div>
            <form onSubmit={handleSubmit} className="p-8 space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Title</label>
                <input required type="text" placeholder="e.g. Office rent" value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Amount (Rs.)</label>
                  <input required type="number" min="0" placeholder="0" value={form.amount || ''}
                    onChange={e => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
                    className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm font-bold text-rose-500 outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Category</label>
                  <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value as any })}
                    className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all">
                    {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date</label>
                <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })}
                  className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Notes (Optional)</label>
                <input type="text" placeholder="Any additional notes..." value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
              </div>
              <div className="flex gap-4 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-4 rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-500 text-[10px] font-bold uppercase tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
                <button type="submit"
                  className="flex-[2] py-4 rounded-2xl bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-600/20 transition-all">Save Expense</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BusinessExpenses;
