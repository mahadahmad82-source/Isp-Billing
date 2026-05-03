import React, { useState, useMemo } from 'react';
import { UserRecord, Receipt, PaymentStatus, AppSettings } from '../types';

interface EmployeePanelProps {
  managerName: string;
  employeeName: string;
  users: UserRecord[];
  receipts: Receipt[];
  settings: AppSettings;
  onLogout: () => void;
  theme: 'light' | 'dark';
  onAddReceipt: (receipt: Receipt) => void;
}

const EmployeePanel: React.FC<EmployeePanelProps> = ({
  managerName, employeeName, users, receipts, settings, onLogout, theme, onAddReceipt
}) => {
  const isDark = theme === 'dark';
  const [activeTab, setActiveTab] = useState<'recovery' | 'receipt'>('recovery');
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'paid' | 'pending'>('all');
  const [sortConfig, setSortConfig] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Receipt form state
  const [selUser, setSelUser] = useState('');
  const [amount, setAmount] = useState('');
  const [receiptRef, setReceiptRef] = useState('');
  const [receiptNote, setReceiptNote] = useState('');
  const [receiptSuccess, setReceiptSuccess] = useState('');

  const currentMonthString = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date());

  // Recovery list
  const recoveryList = useMemo(() => {
    const monthUsers = users.filter(u => (u.activatedMonths || []).includes(currentMonthString));
    return monthUsers.map((u, idx) => {
      const ur = receipts.filter(r =>
        r.userId === u.id &&
        (r.activatedMonth === currentMonthString || r.period === currentMonthString) &&
        r.status === PaymentStatus.SUCCESS
      );
      const hasPaid = ur.length > 0;
      return {
        id: u.id, sr: idx + 1, name: u.name, username: u.username,
        phone: u.phone, plan: u.plan, hasPaid,
        paymentDate: hasPaid ? new Date(ur[0].date).toLocaleDateString() : '-',
        dateRaw: hasPaid ? new Date(ur[0].date).getTime() : 0,
      };
    });
  }, [users, receipts, currentMonthString]);

  const filtered = useMemo(() => {
    let list = recoveryList.filter(item => {
      const ms = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.phone.includes(searchTerm);
      const mf = filter === 'all' || (filter === 'paid' && item.hasPaid) || (filter === 'pending' && !item.hasPaid);
      return ms && mf;
    });
    const dir = sortConfig.dir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      if (sortConfig.key === 'name') return a.name.toLowerCase().localeCompare(b.name.toLowerCase()) * dir;
      if (sortConfig.key === 'username') return a.username.toLowerCase().localeCompare(b.username.toLowerCase()) * dir;
      if (sortConfig.key === 'status') return (Number(b.hasPaid) - Number(a.hasPaid)) * dir;
      if (sortConfig.key === 'date') return (a.dateRaw - b.dateRaw) * dir;
      return 0;
    });
    return list.map((item, idx) => ({ ...item, sr: idx + 1 }));
  }, [recoveryList, searchTerm, filter, sortConfig]);

  const handleSort = (key: string) => setSortConfig(prev => ({ key, dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc' }));
  const sortIcon = (key: string) => sortConfig.key !== key ? ' ↕' : sortConfig.dir === 'asc' ? ' ↑' : ' ↓';

  const paidCount = recoveryList.filter(r => r.hasPaid).length;
  const pendingCount = recoveryList.filter(r => !r.hasPaid).length;

  const handleGenerateReceipt = () => {
    if (!selUser || !amount) { return; }
    const user = users.find(u => u.id === selUser);
    if (!user) return;
    const prefix = settings.receiptSerialPrefix || 'MN';
    const startFrom = settings.receiptSerialStart || 1;
    const nextNum = startFrom + receipts.length;
    const padLen = Math.max(4, String(startFrom).length);
    const ref = receiptRef || `${prefix}-${nextNum.toString().padStart(padLen, '0')}`;

    const newReceipt: Receipt = {
      id: `emp_${Date.now()}`,
      userId: user.id,
      username: user.username,
      name: user.name,
      phone: user.phone,
      plan: user.plan,
      amount: parseFloat(amount),
      date: new Date().toISOString(),
      transactionRef: ref,
      activatedMonth: currentMonthString,
      period: currentMonthString,
      status: PaymentStatus.SUCCESS,
      note: receiptNote || `Payment received by ${employeeName}`,
      createdBy: employeeName,
    };

    onAddReceipt(newReceipt);
    setReceiptSuccess(`✅ Receipt generated: ${ref}`);
    setSelUser(''); setAmount(''); setReceiptRef(''); setReceiptNote('');
    setTimeout(() => setReceiptSuccess(''), 3000);
  };

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}`}>
      {/* Header */}
      <div className={`sticky top-0 z-30 ${isDark ? 'bg-slate-900 border-white/5' : 'bg-white border-slate-200'} border-b px-4 py-3`}>
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-black text-xs">{employeeName.substring(0, 2).toUpperCase()}</span>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-indigo-500">Employee Panel</p>
              <p className={`text-sm font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{employeeName}</p>
            </div>
          </div>
          <button onClick={() => setShowLogoutConfirm(true)}
            className="px-3 py-1.5 bg-rose-500/10 text-rose-500 rounded-xl text-[10px] font-black uppercase tracking-widest">
            Logout
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className={`${isDark ? 'bg-slate-900 border-white/5' : 'bg-white border-slate-200'} border-b`}>
        <div className="max-w-2xl mx-auto flex">
          {[
            { id: 'recovery', label: '📊 Recovery Ledger' },
            { id: 'receipt', label: '🧾 Generate Receipt' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 py-3 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${
                activeTab === tab.id
                  ? 'border-indigo-500 text-indigo-500'
                  : `border-transparent ${isDark ? 'text-slate-500' : 'text-slate-400'}`
              }`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">

        {/* RECOVERY TAB */}
        {activeTab === 'recovery' && (
          <>
            {/* Month Header */}
            <div className={`${isDark ? 'bg-slate-900 border-white/5' : 'bg-white border-slate-200'} border rounded-2xl p-4`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Current Month</p>
                  <h2 className="text-lg font-black mt-0.5">{currentMonthString}</h2>
                </div>
                <div className="flex gap-4">
                  <div className="text-center">
                    <div className="text-xl font-black text-emerald-500">{paidCount}</div>
                    <div className="text-[9px] font-black text-slate-400 uppercase">Paid</div>
                  </div>
                  <div className={`w-px ${isDark ? 'bg-white/10' : 'bg-slate-200'}`}></div>
                  <div className="text-center">
                    <div className="text-xl font-black text-rose-500">{pendingCount}</div>
                    <div className="text-[9px] font-black text-slate-400 uppercase">Pending</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Search + Filter */}
            <div className="flex gap-2">
              <input type="text" placeholder="Search..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className={`flex-1 px-4 py-2.5 rounded-xl text-sm border focus:outline-none focus:ring-2 focus:ring-indigo-500 ${isDark ? 'bg-slate-900 border-white/10 text-white placeholder-slate-500' : 'bg-white border-slate-200'}`} />
              <div className="flex gap-1">
                {(['all', 'paid', 'pending'] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                      filter === f
                        ? f === 'paid' ? 'bg-emerald-500 text-white' : f === 'pending' ? 'bg-rose-500 text-white' : 'bg-indigo-600 text-white'
                        : isDark ? 'bg-slate-800 text-slate-400' : 'bg-white text-slate-400 border border-slate-200'
                    }`}>{f}</button>
                ))}
              </div>
            </div>

            {/* Table */}
            <div className={`${isDark ? 'bg-slate-900 border-white/5' : 'bg-white border-slate-200'} border rounded-2xl overflow-hidden`}>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px] text-left">
                  <thead className={`${isDark ? 'bg-white/5 text-slate-400' : 'bg-slate-50 text-slate-500'} text-[9px] uppercase font-black tracking-widest border-b ${isDark ? 'border-white/5' : 'border-slate-200'}`}>
                    <tr>
                      <th className="px-4 py-3">Sr.</th>
                      <th className="px-4 py-3 cursor-pointer select-none" onClick={() => handleSort('name')}>Name{sortIcon('name')}</th>
                      <th className="px-4 py-3 cursor-pointer select-none" onClick={() => handleSort('username')}>ID{sortIcon('username')}</th>
                      <th className="px-4 py-3">Phone</th>
                      <th className="px-4 py-3 cursor-pointer select-none" onClick={() => handleSort('status')}>Status{sortIcon('status')}</th>
                      <th className="px-4 py-3 cursor-pointer select-none" onClick={() => handleSort('date')}>Date{sortIcon('date')}</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDark ? 'divide-white/5' : 'divide-slate-100'}`}>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={6} className="py-12 text-center text-xs font-black text-slate-400 uppercase tracking-widest">No customers found</td></tr>
                    ) : filtered.map(item => (
                      <tr key={item.id} className={`${isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'} transition-colors`}>
                        <td className="px-4 py-3"><span className="text-xs font-black text-slate-400">{item.sr}</span></td>
                        <td className="px-4 py-3"><span className={`text-sm font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{item.name}</span></td>
                        <td className="px-4 py-3"><span className="text-xs font-black text-indigo-500">@{item.username}</span></td>
                        <td className="px-4 py-3"><span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{item.phone}</span></td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase ${item.hasPaid ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400'}`}>
                            {item.hasPaid ? '✓ Paid' : '⏳ Pending'}
                          </span>
                        </td>
                        <td className="px-4 py-3"><span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{item.paymentDate}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* RECEIPT TAB */}
        {activeTab === 'receipt' && (
          <div className={`${isDark ? 'bg-slate-900 border-white/5' : 'bg-white border-slate-200'} border rounded-2xl p-5 space-y-4`}>
            <div>
              <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1">Generate Receipt</p>
              <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Customer ka payment receive karke receipt banao</p>
            </div>

            {receiptSuccess && (
              <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-xl px-4 py-3">
                <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">{receiptSuccess}</p>
              </div>
            )}

            {/* Customer Select */}
            <div>
              <label className={`block text-[10px] font-black uppercase tracking-widest mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Customer Select Karo</label>
              <select value={selUser} onChange={e => setSelUser(e.target.value)}
                className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}>
                <option value="">-- Customer chunein --</option>
                {users.filter(u => (u.activatedMonths || []).includes(currentMonthString)).map(u => (
                  <option key={u.id} value={u.id}>{u.name} (@{u.username})</option>
                ))}
              </select>
            </div>

            {/* Amount */}
            <div>
              <label className={`block text-[10px] font-black uppercase tracking-widest mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Amount (Rs.)</label>
              <input type="number" placeholder="e.g. 1500" value={amount} onChange={e => setAmount(e.target.value)}
                className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${isDark ? 'bg-white/5 border-white/10 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'}`} />
            </div>

            {/* Receipt Ref (optional) */}
            <div>
              <label className={`block text-[10px] font-black uppercase tracking-widest mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Receipt No. (Optional)</label>
              <input type="text" placeholder="Auto generate hoga agar khali ho" value={receiptRef} onChange={e => setReceiptRef(e.target.value)}
                className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${isDark ? 'bg-white/5 border-white/10 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'}`} />
            </div>

            {/* Note */}
            <div>
              <label className={`block text-[10px] font-black uppercase tracking-widest mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Note (Optional)</label>
              <input type="text" placeholder="Payment note..." value={receiptNote} onChange={e => setReceiptNote(e.target.value)}
                className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${isDark ? 'bg-white/5 border-white/10 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'}`} />
            </div>

            <button onClick={handleGenerateReceipt} disabled={!selUser || !amount}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-40">
              🧾 Receipt Generate Karo
            </button>

            <p className={`text-center text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-slate-700' : 'text-slate-300'}`}>
              Receipt manager ke account mein save hogi
            </p>
          </div>
        )}

        <p className={`text-center text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-slate-800' : 'text-slate-300'}`}>
          MYISP · Employee Access
        </p>
      </div>

      {/* Logout Confirm */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className={`w-full max-w-sm rounded-2xl p-6 ${isDark ? 'bg-slate-900' : 'bg-white'}`}>
            <h3 className="font-black text-lg mb-2">Logout?</h3>
            <p className={`text-sm mb-5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Kya aap logout karna chahte hain?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowLogoutConfirm(false)} className={`flex-1 py-2.5 rounded-xl text-sm font-black border ${isDark ? 'border-white/10 text-white' : 'border-slate-200 text-slate-700'}`}>Cancel</button>
              <button onClick={onLogout} className="flex-1 py-2.5 rounded-xl text-sm font-black bg-rose-500 text-white">Logout</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeePanel;
