import React, { useState, useMemo } from 'react';
import { UserRecord, Receipt, PaymentStatus } from '../types';

interface EmployeePanelProps {
  managerName: string;
  employeeName: string;
  users: UserRecord[];
  receipts: Receipt[];
  onLogout: () => void;
  theme: 'light' | 'dark';
}

const EmployeePanel: React.FC<EmployeePanelProps> = ({
  managerName,
  employeeName,
  users,
  receipts,
  onLogout,
  theme,
}) => {
  const isDark = theme === 'dark';
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'paid' | 'pending'>('all');
  const [sortConfig, setSortConfig] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'name', dir: 'asc' });
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Current month
  const currentMonthString = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date());

  // Build recovery list - same as RecoverySummary but NO totals
  const recoveryList = useMemo(() => {
    const monthUsers = users.filter(u => (u.activatedMonths || []).includes(currentMonthString));
    return monthUsers.map((u, idx) => {
      const userReceipts = receipts.filter(r =>
        r.userId === u.id &&
        (r.activatedMonth === currentMonthString || r.period === currentMonthString) &&
        r.status === PaymentStatus.SUCCESS
      );
      const hasPaid = userReceipts.length > 0;
      return {
        id: u.id,
        sr: idx + 1,
        name: u.name,
        username: u.username,
        phone: u.phone,
        plan: u.plan,
        hasPaid,
        paymentDate: hasPaid ? new Date(userReceipts[0].date).toLocaleDateString() : '-',
        dateRaw: hasPaid ? new Date(userReceipts[0].date).getTime() : 0,
      };
    });
  }, [users, receipts, currentMonthString]);

  // Filter + search + sort
  const filtered = useMemo(() => {
    let list = recoveryList.filter(item => {
      const matchSearch =
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.phone.includes(searchTerm);
      const matchFilter =
        filter === 'all' ||
        (filter === 'paid' && item.hasPaid) ||
        (filter === 'pending' && !item.hasPaid);
      return matchSearch && matchFilter;
    });

    list.sort((a, b) => {
      const dir = sortConfig.dir === 'asc' ? 1 : -1;
      if (sortConfig.key === 'name') return a.name.toLowerCase().localeCompare(b.name.toLowerCase()) * dir;
      if (sortConfig.key === 'username') return a.username.toLowerCase().localeCompare(b.username.toLowerCase()) * dir;
      if (sortConfig.key === 'status') return (Number(b.hasPaid) - Number(a.hasPaid)) * dir;
      if (sortConfig.key === 'date') return (a.dateRaw - b.dateRaw) * dir;
      return 0;
    });

    return list.map((item, idx) => ({ ...item, sr: idx + 1 }));
  }, [recoveryList, searchTerm, filter, sortConfig]);

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      dir: prev.key === key && prev.dir === 'asc' ? 'desc' : 'asc',
    }));
  };

  const sortIcon = (key: string) => {
    if (sortConfig.key !== key) return ' ↕';
    return sortConfig.dir === 'asc' ? ' ↑' : ' ↓';
  };

  const paidCount = recoveryList.filter(r => r.hasPaid).length;
  const pendingCount = recoveryList.filter(r => !r.hasPaid).length;

  return (
    <div className={`min-h-screen ${isDark ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}`}>

      {/* Header */}
      <div className={`sticky top-0 z-30 ${isDark ? 'bg-slate-900 border-white/5' : 'bg-white border-slate-200'} border-b px-4 py-3`}>
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-xl flex items-center justify-center">
              <span className="text-white font-black text-xs">{employeeName.substring(0, 2).toUpperCase()}</span>
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-indigo-500">Employee Panel</p>
              <p className={`text-sm font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{employeeName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              @{managerName}
            </span>
            <button
              onClick={() => setShowLogoutConfirm(true)}
              className="px-3 py-1.5 bg-rose-500/10 text-rose-500 rounded-xl text-[10px] font-black uppercase tracking-widest"
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-4">

        {/* Month Header */}
        <div className={`${isDark ? 'bg-slate-900 border-white/5' : 'bg-white border-slate-200'} border rounded-2xl p-5`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Recovery Ledger</p>
              <h2 className="text-xl font-black mt-0.5">{currentMonthString}</h2>
            </div>
            <div className="flex gap-3">
              <div className="text-center">
                <div className="text-lg font-black text-emerald-500">{paidCount}</div>
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Paid</div>
              </div>
              <div className={`w-px ${isDark ? 'bg-white/10' : 'bg-slate-200'}`}></div>
              <div className="text-center">
                <div className="text-lg font-black text-rose-500">{pendingCount}</div>
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Pending</div>
              </div>
            </div>
          </div>
        </div>

        {/* Search + Filter */}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search customer..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-medium border ${isDark ? 'bg-slate-900 border-white/10 text-white placeholder-slate-500' : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'} focus:outline-none focus:ring-2 focus:ring-indigo-500`}
          />
          <div className="flex gap-1">
            {(['all', 'paid', 'pending'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  filter === f
                    ? f === 'paid' ? 'bg-emerald-500 text-white' : f === 'pending' ? 'bg-rose-500 text-white' : 'bg-indigo-600 text-white'
                    : isDark ? 'bg-slate-800 text-slate-400' : 'bg-white text-slate-400 border border-slate-200'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className={`${isDark ? 'bg-slate-900 border-white/5' : 'bg-white border-slate-200'} border rounded-2xl overflow-hidden`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] text-left">
              <thead className={`${isDark ? 'bg-white/5 text-slate-400' : 'bg-slate-50 text-slate-500'} text-[9px] uppercase font-black tracking-widest border-b ${isDark ? 'border-white/5' : 'border-slate-200'}`}>
                <tr>
                  <th className="px-4 py-4">Sr.</th>
                  <th className="px-4 py-4 cursor-pointer select-none" onClick={() => handleSort('name')}>
                    Name{sortIcon('name')}
                  </th>
                  <th className="px-4 py-4 cursor-pointer select-none" onClick={() => handleSort('username')}>
                    ID{sortIcon('username')}
                  </th>
                  <th className="px-4 py-4">Phone</th>
                  <th className="px-4 py-4 cursor-pointer select-none" onClick={() => handleSort('status')}>
                    Status{sortIcon('status')}
                  </th>
                  <th className="px-4 py-4 cursor-pointer select-none" onClick={() => handleSort('date')}>
                    Date{sortIcon('date')}
                  </th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-white/5' : 'divide-slate-100'}`}>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-16 text-center">
                      <p className={`text-xs font-black uppercase tracking-widest ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                        No customers found
                      </p>
                    </td>
                  </tr>
                ) : filtered.map(item => (
                  <tr key={item.id} className={`${isDark ? 'hover:bg-white/5' : 'hover:bg-slate-50'} transition-colors`}>
                    <td className="px-4 py-4">
                      <span className={`text-xs font-black ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{item.sr}</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`text-sm font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>{item.name}</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-xs font-black text-indigo-500">@{item.username}</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>{item.phone}</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                        item.hasPaid
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                          : 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400'
                      }`}>
                        {item.hasPaid ? '✓ Paid' : '⏳ Pending'}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`text-xs font-medium ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{item.paymentDate}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className={`text-center text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-slate-700' : 'text-slate-300'}`}>
          MYISP · Employee Access · Read Only
        </p>
      </div>

      {/* Logout Confirm */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className={`w-full max-w-sm rounded-2xl p-6 ${isDark ? 'bg-slate-900' : 'bg-white'}`}>
            <h3 className="font-black text-lg mb-2">Logout?</h3>
            <p className={`text-sm mb-5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Kya aap logout karna chahte hain?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowLogoutConfirm(false)} className={`flex-1 py-2.5 rounded-xl text-sm font-black border ${isDark ? 'border-white/10 text-white' : 'border-slate-200 text-slate-700'}`}>
                Cancel
              </button>
              <button onClick={onLogout} className="flex-1 py-2.5 rounded-xl text-sm font-black bg-rose-500 text-white">
                Logout
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmployeePanel;
