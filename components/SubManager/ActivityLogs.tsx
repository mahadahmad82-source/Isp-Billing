import React, { useState, useMemo } from 'react';
import { SubManagerAccount, Receipt } from '../../types';

interface ActivityLogsProps {
  subManagers: SubManagerAccount[];
  recentReceipts: Receipt[];
  onViewPerformance?: () => void;
}

const ActivityLogs: React.FC<ActivityLogsProps> = ({ subManagers, recentReceipts, onViewPerformance }) => {
  const [filterType, setFilterType] = useState<string>('all');

  const performanceSummary = useMemo(() => {
    const total = recentReceipts.reduce((sum, r) => sum + (r.paidAmount || 0), 0);
    const count = recentReceipts.length;
    return { total, count };
  }, [recentReceipts]);

  // ✅ Build rich audit trail — READS existing data, zero writes to payment logic
  const logs = useMemo(() => {
    const result: {
      id: string;
      agentName: string;
      type: string;
      timestamp: string;
      description: string; // Format: "[Timestamp] - [Agent] collected Rs. X from [Customer]"
    }[] = [];

    // 1. Agent check-ins / check-outs
    subManagers.forEach(sm => {
      if (sm.lastCheckIn) {
        const ts = new Date(sm.lastCheckIn);
        result.push({
          id: `ci-${sm.id}`,
          agentName: sm.name,
          type: 'check_in',
          timestamp: sm.lastCheckIn,
          description: `[${ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • ${ts.toLocaleDateString()}] — ${sm.name} started shift & checked in`,
        });
      }
      if (sm.lastCheckOut) {
        const ts = new Date(sm.lastCheckOut);
        result.push({
          id: `co-${sm.id}`,
          agentName: sm.name,
          type: 'check_out',
          timestamp: sm.lastCheckOut,
          description: `[${ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • ${ts.toLocaleDateString()}] — ${sm.name} ended shift & checked out`,
        });
      }
    });

    // 2. ✅ Collection audit trail — reads receipt records, DOES NOT modify payment logic
    // Format: "[Timestamp] - [Lineman Name] collected Rs. X from [Customer Name]"
    recentReceipts.forEach(r => {
      if (!r.collectedBy) return;
      const agent = subManagers.find(sm => sm.id === r.collectedBy || sm.username === r.collectedBy);
      if (!agent) return;

      const ts = new Date(r.date);
      const timeStr = `${ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • ${ts.toLocaleDateString()}`;

      result.push({
        id: `rec-${r.id}`,
        agentName: agent.name,
        type: 'collection',
        timestamp: r.date,
        description: `[${timeStr}] — ${agent.name} collected Rs. ${(r.paidAmount || 0).toLocaleString()} from ${r.userName}`,
      });
    });

    return result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [subManagers, recentReceipts]);

  const filteredLogs = useMemo(
    () => logs.filter(log => filterType === 'all' || log.type === filterType),
    [logs, filterType]
  );

  return (
    <div className="bg-white dark:bg-[#12162a] rounded-[2.5rem] p-6 md:p-8 shadow-sm border border-slate-200 dark:border-[#1e2436] animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Activity Stream</h2>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Real-time audit log of all agent actions</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {onViewPerformance && (
            <button
              onClick={onViewPerformance}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600/5 text-indigo-600 dark:text-indigo-400 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all border border-indigo-600/10"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20V10M18 20V4M6 20v-4" />
              </svg>
              Performance Report
            </button>
          )}
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value)}
            className="bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-[10px] font-bold uppercase tracking-widest text-slate-600 dark:text-slate-300 outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Events</option>
            <option value="check_in">Check-Ins</option>
            <option value="check_out">Check-Outs</option>
            <option value="collection">Collections</option>
          </select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
        <div className="bg-emerald-500/5 border border-emerald-500/10 p-4 rounded-2xl flex items-center justify-between">
          <div>
            <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest mb-1">Total Collected (Stream)</p>
            <p className="text-lg font-black text-emerald-600 dark:text-emerald-400">Rs. {performanceSummary.total.toLocaleString()}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
        </div>
        <div className="bg-indigo-500/5 border border-indigo-500/10 p-4 rounded-2xl flex items-center justify-between">
          <div>
            <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-widest mb-1">Total Audit Events</p>
            <p className="text-lg font-black text-indigo-600 dark:text-indigo-400">{filteredLogs.length}</p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-500">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
        </div>
      </div>

      {/* Timeline */}
      <div className="space-y-4 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 dark:before:via-white/10 before:to-transparent">
        {filteredLogs.length > 0 ? (
          filteredLogs.map(log => {
            let icon = null;
            let bg = '';
            let color = '';

            if (log.type === 'check_in') {
              bg = 'bg-emerald-100 dark:bg-emerald-500/20'; color = 'text-emerald-500';
              icon = <path d="M20 6L9 17l-5-5" />;
            } else if (log.type === 'check_out') {
              bg = 'bg-rose-100 dark:bg-rose-500/20'; color = 'text-rose-500';
              icon = <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />;
            } else if (log.type === 'collection') {
              bg = 'bg-indigo-100 dark:bg-indigo-500/20'; color = 'text-indigo-500';
              icon = <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />;
            }

            return (
              <div key={log.id} className="relative flex items-start gap-4 pl-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 mt-0.5 ${bg} ${color}`}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    {icon}
                  </svg>
                </div>
                <div className="flex-1 bg-slate-50 dark:bg-white/[0.02] border border-slate-100 dark:border-white/5 rounded-2xl px-5 py-3">
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 font-mono leading-relaxed">
                    {log.description}
                  </p>
                </div>
              </div>
            );
          })
        ) : (
          <div className="py-12 text-center text-slate-500 font-bold opacity-30">No activity logs found.</div>
        )}
      </div>
    </div>
  );
};

export default ActivityLogs;
