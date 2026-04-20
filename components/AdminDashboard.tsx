
import React, { useState, useEffect } from 'react';
import { getAccounts, removeAccount, loadState } from '../utils/storage';
import { ManagerAccount, AppState } from '../types';

const AdminDashboard: React.FC = () => {
  const [managers, setManagers] = useState<ManagerAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewingManager, setViewingManager] = useState<{ username: string, state: AppState } | null>(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  const loadManagers = () => {
    setIsLoading(true);
    const data = getAccounts();
    setManagers(data);
    setIsLoading(false);
  };

  useEffect(() => {
    loadManagers();
  }, []);

  const handleViewData = (username: string) => {
    const state = loadState(username);
    setViewingManager({ username, state });
  };

  const handleDelete = (username: string) => {
    removeAccount(username);
    // Also potentially clear their state data
    localStorage.removeItem(`mahadnet_data_${username}`);
    setManagers(prev => prev.filter(m => m.username !== username));
    setShowDeleteConfirm(null);
  };

  if (isLoading && !viewingManager) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (viewingManager) {
    return (
      <div className="space-y-6 animate-in fade-in zoom-in duration-300">
        <div className="flex items-center justify-between bg-white dark:bg-[#0f172a] p-6 rounded-[2rem] border border-slate-100 dark:border-white/5">
          <div className="flex items-center gap-4">
            <button onClick={() => setViewingManager(null)} className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">
              <svg className="w-5 h-5 text-slate-600 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7"></path>
              </svg>
            </button>
            <div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white">Viewing Node: {viewingManager.username}</h3>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">Local database snapshot</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-indigo-600 p-8 rounded-[2.5rem] text-white shadow-xl shadow-indigo-500/20">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-2">Total Customers</p>
            <h4 className="text-4xl font-black">{viewingManager.state.users?.length || 0}</h4>
          </div>
          <div className="bg-emerald-600 p-8 rounded-[2.5rem] text-white shadow-xl shadow-emerald-500/20">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-2">Total Receipts</p>
            <h4 className="text-4xl font-black">{viewingManager.state.receipts?.length || 0}</h4>
          </div>
          <div className="bg-amber-600 p-8 rounded-[2.5rem] text-white shadow-xl shadow-amber-500/20">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-80 mb-2">Archives</p>
            <h4 className="text-4xl font-black">{viewingManager.state.archives?.length || 0}</h4>
          </div>
        </div>

        <div className="bg-white dark:bg-[#0f172a] p-8 rounded-[3rem] border border-slate-100 dark:border-white/5">
          <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-6">Customer Records</h4>
          <div className="space-y-4">
            {viewingManager.state.users?.slice(0, 15).map((user: any) => (
              <div key={user.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/5 rounded-2xl">
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">{user.name}</p>
                  <p className="text-[10px] text-slate-500 font-medium">@{user.username}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-slate-400 uppercase tracking-widest">{user.plan}</p>
                  <p className="text-xs font-bold text-indigo-600 dark:text-indigo-400">Rs. {user.monthlyFee}</p>
                </div>
              </div>
            ))}
            {(!viewingManager.state.users || viewingManager.state.users.length === 0) && (
              <p className="text-center py-10 text-slate-400 font-bold italic text-sm">No customers found in this node.</p>
            )}
            {viewingManager.state.users && viewingManager.state.users.length > 15 && (
              <p className="text-center text-[10px] font-black uppercase tracking-widest text-slate-400 mt-4">+ {viewingManager.state.users.length - 15} more records</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-32 animate-in fade-in duration-500">
      <div className="bg-white dark:bg-[#0f172a] p-10 rounded-[3rem] shadow-2xl border border-slate-100 dark:border-white/5">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-500/20">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
            </svg>
          </div>
          <div>
            <h2 className="text-3xl font-black text-slate-900 dark:text-white leading-none">Local Admin Panel</h2>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-2">Manage all manager nodes stored in this browser</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left border-b border-slate-100 dark:border-white/5">
                <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">Manager ID / Business</th>
                <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">Registration</th>
                <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-white/5">
              {managers.map((manager) => (
                <tr key={manager.username} className="group hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                  <td className="py-6 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-indigo-600 font-black text-xs">
                        {manager.username.substring(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 dark:text-white block leading-none">{manager.businessName}</span>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">@{manager.username}</span>
                      </div>
                    </div>
                  </td>
                  <td className="py-6 px-4">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                      {manager.createdAt ? new Date(manager.createdAt).toLocaleDateString() : 'Unknown'}
                    </span>
                  </td>
                  <td className="py-6 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button 
                        onClick={() => handleViewData(manager.username)}
                        className="px-4 py-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95"
                      >
                        Inspect Node
                      </button>
                      <button 
                        onClick={() => setShowDeleteConfirm(manager.username)}
                        className="px-4 py-2 bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95"
                      >
                        Delete Node
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {managers.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-20 text-center">
                    <p className="text-slate-400 font-black uppercase tracking-[0.2em] text-xs">No manager nodes registered on this browser</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setShowDeleteConfirm(null)}></div>
          <div className="relative z-10 w-full max-w-md bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-100 dark:border-white/5 shadow-2xl text-center">
            <div className="w-16 h-16 bg-rose-100 dark:bg-rose-500/10 rounded-2xl flex items-center justify-center text-rose-500 mx-auto mb-6">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2 uppercase tracking-tight">Erase Node?</h3>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
              Are you sure you want to delete manager <span className="text-rose-500">"{showDeleteConfirm}"</span>? 
              This will permanently erase all local data for this node on this browser.
            </p>
            <div className="flex flex-col gap-3">
              <button 
                onClick={() => handleDelete(showDeleteConfirm)}
                className="w-full py-4 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-rose-500/20 transition-all active:scale-95"
              >
                Confirm Deletion
              </button>
              <button 
                onClick={() => setShowDeleteConfirm(null)}
                className="w-full py-4 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
