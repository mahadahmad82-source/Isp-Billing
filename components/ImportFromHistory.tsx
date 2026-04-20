
import React, { useState, useMemo } from 'react';
import { UserRecord, Archive, AppSettings } from '../types';

interface ImportFromHistoryProps {
  isOpen: boolean;
  onClose: () => void;
  archives: Archive[];
  currentUsers: UserRecord[];
  onImport: (usersToImport: UserRecord[]) => void;
  currentMonth: string;
}

const ImportFromHistory: React.FC<ImportFromHistoryProps> = ({
  isOpen,
  onClose,
  archives,
  currentUsers,
  onImport,
  currentMonth
}) => {
  const [selectedArchiveId, setSelectedArchiveId] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

  const availableArchives = useMemo(() => {
    const list = [...archives];
    
    // Also derive "Virtual Archives" from users' activatedMonths
    const monthsWithData = new Set<string>();
    currentUsers.forEach(u => {
      (u.activatedMonths || []).forEach(m => {
        if (m !== currentMonth) monthsWithData.add(m);
      });
    });

    monthsWithData.forEach(month => {
      const alreadyHasArchive = archives.some(a => (a.month && a.year ? `${a.month} ${a.year}` : a.name) === month);
      if (!alreadyHasArchive) {
        list.push({
          id: `virtual-${month}`,
          name: month,
          createdAt: new Date(month).toISOString(),
          users: currentUsers.filter(u => (u.activatedMonths || []).includes(month))
        });
      }
    });

    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [archives, currentUsers, currentMonth]);

  // Set initial archive if available
  useMemo(() => {
    if (!selectedArchiveId && availableArchives.length > 0) {
      setSelectedArchiveId(availableArchives[0].id);
    }
  }, [availableArchives, selectedArchiveId]);

  const selectedArchive = useMemo(() => {
    return availableArchives.find(a => a.id === selectedArchiveId);
  }, [availableArchives, selectedArchiveId]);

  const filteredSourceUsers = useMemo(() => {
    if (!selectedArchive) return [];
    
    return selectedArchive.users.filter(u => {
      const matchesSearch = 
        u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        u.username.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Duplicate check: Is this user already in the current users list for the current month?
      const isAlreadyInCurrentMonth = currentUsers.some(curr => 
        curr.username.toLowerCase() === u.username.toLowerCase() && 
        (curr.activatedMonths || []).includes(currentMonth)
      );

      return matchesSearch && !isAlreadyInCurrentMonth;
    });
  }, [selectedArchive, searchTerm, currentUsers, currentMonth]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedUserIds(new Set(filteredSourceUsers.map(u => u.id)));
    } else {
      setSelectedUserIds(new Set());
    }
  };

  const toggleUserSelection = (id: string) => {
    const newSelection = new Set(selectedUserIds);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedUserIds(newSelection);
  };

  const handleImportClick = () => {
    const usersToImport = filteredSourceUsers.filter(u => selectedUserIds.has(u.id));
    onImport(usersToImport);
    onClose();
    setSelectedUserIds(new Set());
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={onClose}></div>
      <div className="bg-white dark:bg-[#0f172a] w-full max-w-4xl rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-white/10 relative z-10 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300">
        
        {/* Header */}
        <div className="p-8 border-b border-slate-100 dark:border-white/5 flex justify-between items-center bg-slate-50 dark:bg-white/5 rounded-t-[2.5rem]">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">📥</div>
            <div>
              <h4 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Import from History</h4>
              <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Bring back users from previous months</p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 bg-white dark:bg-slate-800 rounded-xl shadow-sm text-slate-400 font-bold hover:bg-rose-50 hover:text-rose-500 transition-colors">✕</button>
        </div>

        {/* Filters */}
        <div className="p-8 space-y-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 block ml-2">Select Previous Month (Archive)</label>
              <select 
                value={selectedArchiveId}
                onChange={(e) => setSelectedArchiveId(e.target.value)}
                className="w-full p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-white/5 font-bold text-slate-900 dark:text-white outline-none shadow-sm"
              >
                {availableArchives.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.month && a.year ? `${a.month} ${a.year}` : a.name}
                  </option>
                ))}
                {availableArchives.length === 0 && <option value="">No Archives Found</option>}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2 block ml-2">Search Users</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                <input 
                  type="text" 
                  placeholder="Name or Consumer ID..." 
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-white/5 font-bold text-sm outline-none text-slate-900 dark:text-white shadow-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-8 pb-8">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-white/5 overflow-hidden shadow-sm">
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-white/5 text-[9px] uppercase font-black tracking-widest text-slate-500 border-b border-slate-100 dark:border-white/5">
                <tr>
                  <th className="px-6 py-4 w-12">
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-slate-300 dark:border-white/10 bg-transparent text-indigo-600 focus:ring-0"
                      checked={filteredSourceUsers.length > 0 && selectedUserIds.size === filteredSourceUsers.length}
                      onChange={handleSelectAll}
                    />
                  </th>
                  <th className="px-6 py-4">Consumer ID</th>
                  <th className="px-6 py-4">Name</th>
                  <th className="px-6 py-4">Package</th>
                  <th className="px-6 py-4">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {filteredSourceUsers.length > 0 ? (
                  filteredSourceUsers.map(user => (
                    <tr key={user.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4">
                        <input 
                          type="checkbox" 
                          className="w-4 h-4 rounded border-slate-300 dark:border-white/10 bg-transparent text-indigo-600 focus:ring-0"
                          checked={selectedUserIds.has(user.id)}
                          onChange={() => toggleUserSelection(user.id)}
                        />
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-indigo-600 dark:text-indigo-400">
                        @{user.username}
                      </td>
                      <td className="px-6 py-4 text-sm font-black text-slate-800 dark:text-slate-200">
                        {user.name}
                      </td>
                      <td className="px-6 py-4 text-[10px] font-black uppercase text-slate-500">
                        {user.plan}
                      </td>
                      <td className="px-6 py-4 text-xs font-black text-slate-900 dark:text-white">
                        Rs. {user.monthlyFee.toLocaleString()}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-12 text-center text-slate-400 text-xs font-bold">
                      {availableArchives.length === 0 ? 'No archives available to import from.' : 'No users found matching your search or all users are already imported.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Footer */}
        <div className="p-8 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/5 rounded-b-[2.5rem] flex justify-between items-center">
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
            {selectedUserIds.size} Users Selected
          </p>
          <div className="flex gap-4">
            <button onClick={onClose} className="px-8 py-3 bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-xl font-black text-xs uppercase tracking-widest shadow-sm border border-slate-200 dark:border-slate-700 hover:bg-slate-50 transition-all">
              Cancel
            </button>
            <button 
              onClick={handleImportClick}
              disabled={selectedUserIds.size === 0}
              className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Import to Current Month
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ImportFromHistory;
