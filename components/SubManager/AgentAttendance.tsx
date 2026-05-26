import React, { useMemo } from 'react';
import { SubManagerAccount, AttendanceLog } from '../../types';

interface AgentAttendanceProps {
  subManagers: SubManagerAccount[];
  attendanceLogs: AttendanceLog[];
  onViewLogs: (subManagerId: string) => void;
  onViewRoute: (subManagerId: string) => void;
  onAddManualEntry: (subManagerId: string, type: 'check-in' | 'check-out' | 'leave', date: string, reason?: string) => void;
  onUpdateLog: (logId: string, updates: Partial<AttendanceLog>) => void;
  onDeleteLog: (logId: string) => void;
}

interface DailyShift {
  date: string;
  agentId: string;
  agentName: string;
  checkIn: string | null;
  checkOut: string | null;
  totalHours: string;
  status: 'complete' | 'active' | 'leave' | 'absent';
}

const AgentAttendance: React.FC<AgentAttendanceProps> = ({
  subManagers, attendanceLogs, onViewLogs, onViewRoute, onAddManualEntry, onUpdateLog, onDeleteLog
}) => {
  const [showManualModal, setShowManualModal] = React.useState(false);
  const [selectedAgentId, setSelectedAgentId] = React.useState('');
  const [entryType, setEntryType] = React.useState<'check-in' | 'check-out' | 'leave'>('check-in');
  const [entryDateTime, setEntryDateTime] = React.useState(new Date().toISOString().slice(0, 16));
  const [entryReason, setEntryReason] = React.useState('');
  const [viewingLogsId, setViewingLogsId] = React.useState<string | null>(null);
  const [editingLog, setEditingLog] = React.useState<AttendanceLog | null>(null);
  const [reportMonth, setReportMonth] = React.useState(new Date().toISOString().slice(0, 7));
  const [activeView, setActiveView] = React.useState<'current' | 'daily-log'>('current');
  const [sortConfig, setSortConfig] = React.useState<{
    key: 'name' | 'dutyStatus' | 'lastCheckIn' | 'duration'; direction: 'asc' | 'desc' | null;
  }>({ key: 'name', direction: 'asc' });

  // ✅ Build paired daily shift log: DATE | AGENT | CLOCK-IN | CLOCK-OUT | TOTAL HOURS | STATUS
  const dailyShifts = useMemo((): DailyShift[] => {
    const shifts: DailyShift[] = [];

    subManagers.forEach(agent => {
      const agentLogs = attendanceLogs
        .filter(l => l.subManagerId === agent.id && l.timestamp.startsWith(reportMonth))
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      // Group by date
      const byDate: Record<string, AttendanceLog[]> = {};
      agentLogs.forEach(log => {
        const dateKey = new Date(log.timestamp).toISOString().split('T')[0];
        if (!byDate[dateKey]) byDate[dateKey] = [];
        byDate[dateKey].push(log);
      });

      Object.entries(byDate).forEach(([dateKey, dayLogs]) => {
        const checkInLog = dayLogs.find(l => l.type === 'check-in');
        const checkOutLog = dayLogs.find(l => l.type === 'check-out');
        const leaveLog = dayLogs.find(l => l.type === 'leave');

        let totalHours = '--';
        let status: DailyShift['status'] = 'absent';

        if (leaveLog) {
          status = 'leave';
        } else if (checkInLog && checkOutLog) {
          const diffMs = new Date(checkOutLog.timestamp).getTime() - new Date(checkInLog.timestamp).getTime();
          const h = Math.floor(diffMs / 3600000);
          const m = Math.floor((diffMs % 3600000) / 60000);
          totalHours = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
          status = 'complete';
        } else if (checkInLog && !checkOutLog) {
          // Still active
          const diffMs = Date.now() - new Date(checkInLog.timestamp).getTime();
          const h = Math.floor(diffMs / 3600000);
          const m = Math.floor((diffMs % 3600000) / 60000);
          totalHours = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} (Live)`;
          status = 'active';
        }

        shifts.push({
          date: dateKey,
          agentId: agent.id,
          agentName: agent.name,
          checkIn: checkInLog?.timestamp || null,
          checkOut: checkOutLog?.timestamp || null,
          totalHours,
          status,
        });
      });
    });

    return shifts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [subManagers, attendanceLogs, reportMonth]);

  const handleSort = (key: typeof sortConfig.key) => {
    let direction: 'asc' | 'desc' | null = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    else if (sortConfig.key === key && sortConfig.direction === 'desc') direction = null;
    setSortConfig({ key, direction });
  };

  const sortedManagers = useMemo(() => {
    if (!sortConfig.direction) return subManagers;
    return [...subManagers].sort((a, b) => {
      let valA: any = a[sortConfig.key as keyof SubManagerAccount] || '';
      let valB: any = b[sortConfig.key as keyof SubManagerAccount] || '';
      if (sortConfig.key === 'duration') {
        const ms = (mgr: SubManagerAccount) => {
          if (!mgr.lastCheckIn) return 0;
          const end = mgr.dutyStatus === 'online' ? Date.now() : (mgr.lastCheckOut ? new Date(mgr.lastCheckOut).getTime() : new Date(mgr.lastCheckIn).getTime());
          return Math.max(0, end - new Date(mgr.lastCheckIn).getTime());
        };
        valA = ms(a); valB = ms(b);
      }
      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [subManagers, sortConfig]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgentId) return;
    onAddManualEntry(selectedAgentId, entryType, new Date(entryDateTime).toISOString(), entryReason);
    setShowManualModal(false);
    setEntryReason('');
  };

  const statusBadge = (status: DailyShift['status']) => {
    const map = {
      complete: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
      active: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
      leave: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
      absent: 'bg-rose-500/10 text-rose-500',
    };
    const label = { complete: 'Complete', active: '● Live', leave: 'On Leave', absent: 'Absent' };
    return <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${map[status]}`}>{label[status]}</span>;
  };

  return (
    <div className="bg-white dark:bg-[#12162a] rounded-[2.5rem] p-6 md:p-8 shadow-sm border border-slate-200 dark:border-[#1e2436] animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Agent Attendance & Shifts</h2>
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Monitor active agents and daily field hours</p>
        </div>
        <div className="flex gap-3 flex-wrap">
          {/* View Toggle */}
          <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-xl border border-slate-200 dark:border-white/5">
            <button
              onClick={() => setActiveView('current')}
              className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${activeView === 'current' ? 'bg-white dark:bg-indigo-600 dark:text-white shadow text-slate-900' : 'text-slate-500 opacity-60 hover:opacity-100'}`}
            >Current Status</button>
            <button
              onClick={() => setActiveView('daily-log')}
              className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${activeView === 'daily-log' ? 'bg-white dark:bg-indigo-600 dark:text-white shadow text-slate-900' : 'text-slate-500 opacity-60 hover:opacity-100'}`}
            >Daily Log</button>
          </div>

          {activeView === 'daily-log' && (
            <input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)}
              className="px-4 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl text-xs font-bold outline-none ring-indigo-500 focus:ring-2"
            />
          )}

          <button
            onClick={() => setShowManualModal(true)}
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-indigo-700 transition-all flex items-center gap-2"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Add Entry
          </button>
        </div>
      </div>

      {/* Manual Entry Modal */}
      {showManualModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowManualModal(false)} />
          <div className="relative w-full max-w-md bg-white dark:bg-[#12162a] rounded-[2.5rem] shadow-2xl p-8 border border-slate-200 dark:border-white/5 animate-in zoom-in-95 duration-300">
            <h3 className="text-xl font-bold mb-1">Manual Attendance Entry</h3>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">Record or correct agent activity</p>
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Select Agent</label>
                <select required value={selectedAgentId} onChange={e => setSelectedAgentId(e.target.value)}
                  className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all">
                  <option value="">Choose an agent...</option>
                  {subManagers.map(sm => <option key={sm.id} value={sm.id}>{sm.name} (@{sm.username})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Entry Type</label>
                  <select value={entryType} onChange={e => setEntryType(e.target.value as any)}
                    className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all">
                    <option value="check-in">Check-In</option>
                    <option value="check-out">Check-Out</option>
                    <option value="leave">On Leave</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date & Time</label>
                  <input type="datetime-local" value={entryDateTime} onChange={e => setEntryDateTime(e.target.value)}
                    className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Reason (Optional)</label>
                <input type="text" placeholder="e.g. Manual correction, leave request..."
                  value={entryReason} onChange={e => setEntryReason(e.target.value)}
                  className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowManualModal(false)}
                  className="flex-1 py-4 px-6 rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-500 text-[10px] font-bold uppercase tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
                <button type="submit"
                  className="flex-[2] py-4 px-6 rounded-2xl bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-600/20 transition-all">Save Entry</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW 1: Current Status (existing table) */}
      {activeView === 'current' && (
        <div className="overflow-x-auto -mx-6 md:mx-0">
          <table className="min-w-full divide-y divide-slate-200 dark:divide-white/5">
            <thead>
              <tr>
                {(['name', 'dutyStatus', 'lastCheckIn'] as const).map(key => (
                  <th key={key} className="px-6 py-4 text-left">
                    <button onClick={() => handleSort(key as any)} className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest hover:text-indigo-500 transition-colors">
                      {key === 'name' ? 'Agent' : key === 'dutyStatus' ? 'Status' : 'Shift Start'}
                      {sortConfig.key === key && <span>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>}
                    </button>
                  </th>
                ))}
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Shift End</th>
                <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">Duration</th>
                <th className="px-6 py-4 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {sortedManagers.length > 0 ? sortedManagers.map(agent => {
                const checkIn = agent.lastCheckIn ? new Date(agent.lastCheckIn) : null;
                const checkOut = agent.lastCheckOut ? new Date(agent.lastCheckOut) : null;
                let duration = '--';
                if (checkIn) {
                  const end = agent.dutyStatus === 'online' ? new Date() : (checkOut || new Date());
                  const diffMs = Math.max(0, end.getTime() - checkIn.getTime());
                  const h = Math.floor(diffMs / 3600000);
                  const m = Math.floor((diffMs % 3600000) / 60000);
                  duration = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} hrs`;
                }
                return (
                  <tr key={agent.id} className="group hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-500/10 flex items-center justify-center">
                          <span className="text-indigo-600 dark:text-indigo-400 font-bold text-xs">{agent.name.charAt(0)}</span>
                        </div>
                        <div>
                          <div className="text-sm font-bold text-slate-900 dark:text-white">{agent.name}</div>
                          <div className="text-xs font-medium text-slate-500">@{agent.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${agent.dutyStatus === 'online' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : (agent as any).isLeave ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>
                        {agent.dutyStatus === 'online' && <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                        {(agent as any).isLeave ? 'On Leave' : agent.dutyStatus === 'online' ? 'Active' : 'Offline'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-slate-600 dark:text-slate-300">
                        {checkIn ? checkIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-slate-600 dark:text-slate-300">
                        {agent.dutyStatus === 'offline' && checkOut ? checkOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-slate-600 dark:text-slate-300">{duration}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setViewingLogsId(agent.id)} title="View Logs"
                          className="p-2 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-xl transition-all">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </button>
                        <button onClick={() => onViewRoute(agent.id)} title="Live Route"
                          className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 rounded-xl transition-all">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0112 2a8 8 0 018 8.2c0 7.3-8 11.8-8 11.8z" /><circle cx="12" cy="10" r="3" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-xs font-bold text-slate-400 opacity-30 uppercase tracking-widest">No agents found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* VIEW 2: Daily Log — DATE | LINEMAN NAME | CLOCK-IN | CLOCK-OUT | TOTAL HOURS | STATUS */}
      {activeView === 'daily-log' && (
        <div>
          <div className="mb-4 flex items-center gap-2">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Showing daily shifts for</div>
            <span className="px-3 py-1 bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 rounded-lg text-[10px] font-bold">{reportMonth}</span>
            <span className="ml-auto text-[10px] font-bold text-slate-400 uppercase tracking-widest">{dailyShifts.length} records</span>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-white/5">
            <table className="min-w-full divide-y divide-slate-200 dark:divide-white/5">
              <thead className="bg-slate-50 dark:bg-white/[0.02]">
                <tr>
                  {['Date', 'Lineman Name', 'Clock-In', 'Clock-Out', 'Total Hours', 'Status'].map(col => (
                    <th key={col} className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.03]">
                {dailyShifts.length > 0 ? dailyShifts.map((shift, i) => (
                  <tr key={`${shift.agentId}-${shift.date}-${i}`} className="hover:bg-slate-50 dark:hover:bg-white/[0.01] transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        {new Date(shift.date).toLocaleDateString([], { weekday: 'short', day: '2-digit', month: 'short' })}
                      </p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-xs">
                          {shift.agentName.charAt(0)}
                        </div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">{shift.agentName}</p>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                        {shift.checkIn ? new Date(shift.checkIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : <span className="text-slate-400">--</span>}
                      </p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-xs font-medium text-rose-500">
                        {shift.checkOut ? new Date(shift.checkOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : <span className="text-slate-400">{shift.status === 'active' ? '(Active)' : '--'}</span>}
                      </p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className={`text-xs font-black ${shift.status === 'complete' || shift.status === 'active' ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}>
                        {shift.totalHours}
                      </p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {statusBadge(shift.status)}
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-xs font-bold text-slate-400 opacity-30 uppercase tracking-widest">
                      No attendance records for {reportMonth}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* View/Edit Logs Modal */}
      {viewingLogsId && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setViewingLogsId(null)} />
          <div className="relative w-full max-w-4xl bg-white dark:bg-[#12162a] rounded-[2.5rem] shadow-2xl p-8 border border-slate-200 dark:border-white/5 animate-in zoom-in-95 duration-300 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-xl font-bold">Monthly Logs: {subManagers.find(sm => sm.id === viewingLogsId)?.name}</h3>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Review and correct agent history</p>
              </div>
              <div className="flex items-center gap-4">
                <input type="month" value={reportMonth} onChange={e => setReportMonth(e.target.value)}
                  className="px-4 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl text-xs font-bold outline-none ring-indigo-500 focus:ring-2" />
                <button onClick={() => setViewingLogsId(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/5 text-[10px] font-bold text-slate-400 uppercase tracking-widest sticky top-0">
                  <tr>
                    <th className="px-6 py-4">Date</th>
                    <th className="px-6 py-4">Event</th>
                    <th className="px-6 py-4">Time</th>
                    <th className="px-6 py-4">Notes</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-white/[0.02]">
                  {attendanceLogs
                    .filter(log => log.subManagerId === viewingLogsId && log.timestamp.startsWith(reportMonth))
                    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                    .map(log => (
                      <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.01]">
                        <td className="px-6 py-4"><p className="text-xs font-bold text-slate-700 dark:text-slate-300">{new Date(log.timestamp).toLocaleDateString([], { day: '2-digit', month: 'short' })}</p></td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase ${log.type === 'check-in' ? 'bg-emerald-500/10 text-emerald-600' : log.type === 'check-out' ? 'bg-rose-500/10 text-rose-500' : 'bg-amber-500/10 text-amber-600'}`}>
                            {log.type}
                          </span>
                        </td>
                        <td className="px-6 py-4"><p className="text-xs font-medium text-slate-500">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p></td>
                        <td className="px-6 py-4"><p className="text-xs text-slate-500 italic">{log.reason || '-'}</p></td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <button onClick={() => setEditingLog(log)} className="p-2 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-lg transition-all">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                          </button>
                          <button onClick={() => onDeleteLog(log.id)} className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-all">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                          </button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Edit Log Modal */}
      {editingLog && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-md" onClick={() => setEditingLog(null)} />
          <div className="relative w-full max-w-sm bg-white dark:bg-[#12162a] rounded-[2.5rem] p-8 border border-slate-200 dark:border-white/5 shadow-2xl animate-in zoom-in-95 duration-300">
            <h3 className="text-lg font-bold mb-6">Correct Log Entry</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Entry Type</label>
                <select value={editingLog.type} onChange={e => setEditingLog({ ...editingLog, type: e.target.value as any })}
                  className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all">
                  <option value="check-in">Check-In</option>
                  <option value="check-out">Check-Out</option>
                  <option value="leave">Leave</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Timestamp</label>
                <input type="datetime-local" value={new Date(editingLog.timestamp).toISOString().slice(0, 16)}
                  onChange={e => setEditingLog({ ...editingLog, timestamp: new Date(e.target.value).toISOString() })}
                  className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Reason / Note</label>
                <input type="text" value={editingLog.reason || ''} onChange={e => setEditingLog({ ...editingLog, reason: e.target.value })}
                  className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
              </div>
              <button onClick={() => { onUpdateLog(editingLog.id, { type: editingLog.type, timestamp: editingLog.timestamp, reason: editingLog.reason }); setEditingLog(null); }}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-indigo-600/20 active:scale-95 transition-all">
                Update Entry
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgentAttendance;
