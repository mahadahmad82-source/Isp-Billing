import React, { useState, useMemo } from 'react';
import { SystemLog } from '../types';

interface SystemLogsProps {
  logs: SystemLog[];
  onClearLogs: () => void;
}

const CATEGORY_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  user:     { label: 'Customer',  color: 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400',  dot: 'bg-indigo-500' },
  payment:  { label: 'Payment',   color: 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  recovery: { label: 'Recovery',  color: 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400',    dot: 'bg-amber-500' },
  settings: { label: 'Settings',  color: 'bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400', dot: 'bg-violet-500' },
  import:   { label: 'Import',    color: 'bg-cyan-100 dark:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400',         dot: 'bg-cyan-500' },
  system:   { label: 'System',    color: 'bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400',         dot: 'bg-rose-500' },
};

const FILTER_TABS = ['all', 'user', 'payment', 'recovery', 'settings', 'import', 'system'] as const;

const SystemLogs: React.FC<SystemLogsProps> = ({ logs, onClearLogs }) => {
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm]         = useState('');
  const [dateFilter, setDateFilter]         = useState('');
  const [showConfirm, setShowConfirm]       = useState(false);

  const filtered = useMemo(() => {
    return logs.filter(log => {
      const matchesCat  = categoryFilter === 'all' || log.category === categoryFilter;
      const matchesText = !searchTerm ||
        log.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.performedBy.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.action.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDate = !dateFilter || log.timestamp.startsWith(dateFilter);
      return matchesCat && matchesText && matchesDate;
    });
  }, [logs, categoryFilter, searchTerm, dateFilter]);

  const todayStr   = new Date().toISOString().split('T')[0];
  const todayCount = useMemo(() => logs.filter(l => l.timestamp.startsWith(todayStr)).length, [logs, todayStr]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.keys(CATEGORY_CONFIG).forEach(cat => { counts[cat] = logs.filter(l => l.category === cat).length; });
    return counts;
  }, [logs]);

  const exportCSV = () => {
    const headers = 'Timestamp,Action,Description,Performed By,Category\n';
    const rows    = filtered.map(l =>
      `"${new Date(l.timestamp).toLocaleString()}","${l.action}","${l.description.replace(/"/g, '""')}","${l.performedBy}","${l.category}"`
    ).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `system-logs-${todayStr}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const clearFilters = () => { setSearchTerm(''); setDateFilter(''); setCategoryFilter('all'); };
  const hasFilters   = searchTerm || dateFilter || categoryFilter !== 'all';

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row justify-between items-end gap-4">
        <div>
          <h2 className="text-4xl font-black text-slate-800 dark:text-white uppercase tracking-tight">System Logs</h2>
          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
            {logs.length} total events &nbsp;·&nbsp; {todayCount} today
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={exportCSV}
            disabled={filtered.length === 0}
            className="flex items-center gap-2 px-5 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-700 transition-all disabled:opacity-40"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
            </svg>
            Export CSV
          </button>
          <button
            onClick={() => setShowConfirm(true)}
            disabled={logs.length === 0}
            className="flex items-center gap-2 px-5 py-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-all disabled:opacity-40"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
            </svg>
            Clear All
          </button>
        </div>
      </div>

      {/* ── Summary Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {(Object.keys(CATEGORY_CONFIG) as Array<keyof typeof CATEGORY_CONFIG>).map(cat => {
          const cfg   = CATEGORY_CONFIG[cat];
          const count = categoryCounts[cat] || 0;
          const isActive = categoryFilter === cat;
          return (
            <button
              key={cat}
              onClick={() => setCategoryFilter(isActive ? 'all' : cat)}
              className={`bg-white dark:bg-slate-900 p-4 rounded-2xl border text-left transition-all hover:shadow-md ${
                isActive ? 'border-indigo-400 dark:border-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-800' : 'border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700'
              }`}
            >
              <p className="text-2xl font-black text-slate-800 dark:text-white mb-2">{count}</p>
              <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${cfg.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`}></span>
                {cfg.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Filter Row ── */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <input
            type="text"
            placeholder="Search logs by description, user, or action..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm font-bold outline-none focus:border-indigo-400 dark:focus:border-indigo-500 transition-all text-slate-800 dark:text-slate-200 placeholder-slate-400"
          />
          <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
        </div>
        <input
          type="date"
          value={dateFilter}
          onChange={e => setDateFilter(e.target.value)}
          className="px-4 py-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-sm font-bold outline-none focus:border-indigo-400 transition-all text-slate-800 dark:text-white"
        />
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="px-5 py-3.5 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* ── Category Pills ── */}
      <div className="flex flex-wrap gap-2">
        {FILTER_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setCategoryFilter(tab)}
            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              categoryFilter === tab
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 hover:text-indigo-600'
            }`}
          >
            {tab === 'all' ? `All Events (${logs.length})` : `${CATEGORY_CONFIG[tab]?.label || tab} (${categoryCounts[tab] || 0})`}
          </button>
        ))}
      </div>

      {/* ── Logs List ── */}
      {filtered.length === 0 ? (
        <div className="py-24 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-[2rem]">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
            </svg>
          </div>
          <p className="text-slate-400 dark:text-slate-500 font-bold">
            {logs.length === 0 ? 'No logs yet' : 'No logs match your filters'}
          </p>
          <p className="text-slate-400 dark:text-slate-600 text-xs mt-1">
            {logs.length === 0
              ? 'System activity will appear here as you use the app.'
              : 'Try adjusting your search or filters.'}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
          {/* Table Header */}
          <div className="hidden md:grid grid-cols-[auto_1fr_auto_auto] gap-4 px-6 py-4 bg-slate-50 dark:bg-white/[0.02] border-b border-slate-100 dark:border-slate-800">
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest w-24">Category</span>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Description</span>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">By</span>
            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-right">Time</span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[65vh] overflow-y-auto">
            {filtered.map((log, idx) => {
              const cfg = CATEGORY_CONFIG[log.category] || CATEGORY_CONFIG.system;
              const ts  = new Date(log.timestamp);
              const isToday = log.timestamp.startsWith(todayStr);
              return (
                <div key={log.id} className="flex items-start gap-3 px-5 py-4 hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors group">
                  {/* Category badge */}
                  <div className="shrink-0 pt-0.5">
                    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest whitespace-nowrap ${cfg.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`}></span>
                      <span className="hidden sm:inline">{cfg.label}</span>
                    </div>
                  </div>

                  {/* Main content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 dark:text-slate-200 leading-snug">
                      {log.description}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                      <span className="text-[10px] text-indigo-500 font-bold">@{log.performedBy}</span>
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{log.action}</span>
                    </div>
                  </div>

                  {/* Timestamp */}
                  <div className="shrink-0 text-right">
                    <p className={`text-[10px] font-black uppercase tracking-wider ${isToday ? 'text-emerald-500' : 'text-slate-400'}`}>
                      {isToday ? 'Today' : ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold">
                      {ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="text-[9px] text-slate-300 dark:text-slate-600 font-black mt-0.5">
                      #{(filtered.length - idx).toString().padStart(4, '0')}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-white/[0.02] flex items-center justify-between">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Showing {filtered.length} of {logs.length} logs
            </p>
            {hasFilters && (
              <button onClick={clearFilters} className="text-[10px] font-black text-indigo-500 uppercase tracking-widest hover:text-indigo-600">
                Clear Filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Clear Confirm Modal ── */}
      {showConfirm && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setShowConfirm(false)}></div>
          <div className="relative z-10 w-full max-w-sm bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-100 dark:border-white/5 shadow-2xl text-center animate-in fade-in zoom-in duration-200">
            <div className="w-16 h-16 bg-rose-100 dark:bg-rose-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6 text-rose-500">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              </svg>
            </div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-2">Clear All Logs?</h3>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
              This will permanently delete all {logs.length} log entries. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest"
              >
                Cancel
              </button>
              <button
                onClick={() => { onClearLogs(); setShowConfirm(false); }}
                className="flex-1 py-4 bg-rose-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-rose-700 transition-all active:scale-95"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemLogs;
