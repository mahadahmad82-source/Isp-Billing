import React, { useState, useMemo } from 'react';
import { SubManagerAccount, AttendanceLog, Receipt, UserRecord, SalaryPayment } from '../../types';
import { getAccounts } from '../../utils/storage';
import RecruitAgentModal from './RecruitAgentModal';
import AgentAttendance from './AgentAttendance';
import ActivityLogs from './ActivityLogs';
import LiveTracking from './LiveTracking';
import AgentPerformanceReport from './AgentPerformanceReport';

interface SubManagerManagementProps {
  subManagers: SubManagerAccount[];
  recentReceipts: Receipt[];
  managerId: string;
  onVoidReceipt: (receiptId: string) => void;
  onEditReceiptAmount: (receiptId: string, newAmount: number) => void;
  onViewLogs: (subManagerId: string) => void;
  onAgentRecruited: (agent: any) => void;
  onEditAgent: (agentId: string, updates: any) => void;
  onDeleteAgent: (agentId: string) => void;
  onAddAttendanceLog: (log: Omit<AttendanceLog, 'id'>) => void;
  onUpdateAttendanceLog: (logId: string, updates: Partial<AttendanceLog>) => void;
  onDeleteAttendanceLog: (logId: string) => void;
  attendanceLogs: AttendanceLog[];
}

const SubManagerManagement: React.FC<SubManagerManagementProps> = ({
  subManagers, recentReceipts, managerId,
  onVoidReceipt, onEditReceiptAmount, onViewLogs,
  onAgentRecruited, onEditAgent, onDeleteAgent,
  onAddAttendanceLog, onUpdateAttendanceLog, onDeleteAttendanceLog, attendanceLogs,
}) => {
  const [activeTab, setActiveTab] = useState<'team' | 'payroll' | 'overrides' | 'attendance' | 'logs' | 'tracking' | 'performance'>('team');
  const [showRecruitModal, setShowRecruitModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<any>(null);
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);
  const [performanceAgentId, setPerformanceAgentId] = useState<string | null>(null);

  const selectedAgentForPerformance = subManagers.find(sm => sm.id === performanceAgentId || sm.username === performanceAgentId);
  const agentReceipts = recentReceipts.filter(r =>
    r.collectedBy === performanceAgentId || r.collectedBy === selectedAgentForPerformance?.username
  );

  // ✅ Compute current-month receipts per agent for payroll
  const currentMonthKey = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date());

  const agentPayroll = useMemo(() => {
    return subManagers.map(sm => {
      const myReceipts = recentReceipts.filter(r =>
        r.collectedBy === sm.id || r.collectedBy === sm.username
      );
      const totalCollected = myReceipts.reduce((s, r) => s + (r.paidAmount || 0), 0);
      const commissionPct = sm.commissionPercent || 0;
      const commissionEarned = Math.round((totalCollected * commissionPct) / 100);
      const baseSalary = sm.baseSalary || 0;
      const totalPayable = baseSalary + commissionEarned;

      const alreadyPaid = (sm.salaryPayments || []).some(p => p.month === currentMonthKey);

      return { sm, totalCollected, commissionEarned, baseSalary, totalPayable, alreadyPaid };
    });
  }, [subManagers, recentReceipts, currentMonthKey]);

  // ✅ Commission for performance modal
  const perfCommission = useMemo(() => {
    if (!selectedAgentForPerformance) return 0;
    const total = agentReceipts.reduce((s, r) => s + (r.paidAmount || 0), 0);
    return Math.round((total * (selectedAgentForPerformance.commissionPercent || 0)) / 100);
  }, [agentReceipts, selectedAgentForPerformance]);

  const handleMarkSalaryPaid = (sm: SubManagerAccount) => {
    const entry = agentPayroll.find(p => p.sm.id === sm.id);
    if (!entry) return;
    const payment: SalaryPayment = {
      month: currentMonthKey,
      paidAt: new Date().toISOString(),
      baseSalary: entry.baseSalary,
      commission: entry.commissionEarned,
      total: entry.totalPayable,
    };
    const existing = sm.salaryPayments || [];
    onEditAgent(sm.id, { salaryPayments: [...existing, payment] });
  };

  const tabs = [
    { id: 'team', label: 'Directory' },
    { id: 'payroll', label: 'Payroll' },
    { id: 'attendance', label: 'Attendance' },
    { id: 'logs', label: 'Activity Logs' },
    { id: 'performance', label: 'Performance' },
    { id: 'tracking', label: 'Live Tracking' },
    { id: 'overrides', label: 'Field Ops' },
  ] as const;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <RecruitAgentModal isOpen={showRecruitModal} onClose={() => setShowRecruitModal(false)} managerId={managerId}
        onSuccess={agent => { onAgentRecruited(agent); }} />

      {/* ── EDIT AGENT MODAL ── */}
      {editingAgent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setEditingAgent(null)} />
          <div className="relative w-full max-w-lg bg-white dark:bg-[#12162a] rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-white/5 overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="px-8 pt-8 pb-6 border-b border-slate-100 dark:border-white/5">
              <h3 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Edit Field Agent</h3>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Update Agent Profile</p>
            </div>
            <form onSubmit={e => {
              e.preventDefault();
              onEditAgent(editingAgent.id, {
                name: editingAgent.name,
                username: editingAgent.username,
                area: editingAgent.area,
                email: editingAgent.email,
                phone: editingAgent.phone,
                password: editingAgent.password,
                baseSalary: parseFloat(editingAgent.baseSalary) || 0,
                commissionPercent: parseFloat(editingAgent.commissionPercent) || 0,
              });
              setEditingAgent(null);
            }} className="p-8 space-y-5 overflow-y-auto max-h-[70vh]">
              <div className="grid grid-cols-2 gap-5">
                <div className="col-span-2 space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Full Name</label>
                  <input required type="text" value={editingAgent.name}
                    onChange={e => setEditingAgent({ ...editingAgent, name: e.target.value })}
                    className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                </div>
                <div className="col-span-2 space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Username</label>
                  <input required type="text" value={editingAgent.username}
                    onChange={e => setEditingAgent({ ...editingAgent, username: e.target.value.toLowerCase().trim() })}
                    className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Phone</label>
                  <input required type="tel" value={editingAgent.phone}
                    onChange={e => setEditingAgent({ ...editingAgent, phone: e.target.value })}
                    className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Email</label>
                  <input required type="email" value={editingAgent.email}
                    onChange={e => setEditingAgent({ ...editingAgent, email: e.target.value })}
                    className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Password</label>
                  <input required type="password" value={editingAgent.password}
                    onChange={e => setEditingAgent({ ...editingAgent, password: e.target.value })}
                    className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Area / Zone</label>
                  <input type="text" value={editingAgent.area || ''}
                    onChange={e => setEditingAgent({ ...editingAgent, area: e.target.value })}
                    className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                </div>

                {/* ✅ NEW: Base Salary */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Base Salary (Rs.)</label>
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">Rs.</span>
                    <input type="number" min="0" placeholder="0"
                      value={editingAgent.baseSalary || ''}
                      onChange={e => setEditingAgent({ ...editingAgent, baseSalary: e.target.value })}
                      className="w-full pl-10 pr-4 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm font-bold text-emerald-500 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                  </div>
                </div>

                {/* ✅ NEW: Commission % */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Commission %</label>
                  <div className="relative">
                    <input type="number" min="0" max="100" step="0.5" placeholder="0"
                      value={editingAgent.commissionPercent || ''}
                      onChange={e => setEditingAgent({ ...editingAgent, commissionPercent: e.target.value })}
                      className="w-full pl-4 pr-10 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm font-bold text-indigo-500 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">%</span>
                  </div>
                  <p className="text-[9px] text-slate-400 ml-1">Applied on total collections</p>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setEditingAgent(null)}
                  className="flex-1 py-4 rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-500 text-[10px] font-bold uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-white/10 transition-all">
                  Cancel
                </button>
                <button type="submit"
                  className="flex-[2] py-4 rounded-2xl bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-600/20 transition-all flex items-center justify-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                  Update Agent
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── HEADER + TAB BAR ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 p-6 rounded-3xl shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Team Hub</h2>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mt-1">Sub-Manager Control & Field Operations</p>
        </div>
        <div className="flex flex-wrap bg-slate-100 dark:bg-white/5 p-1.5 rounded-2xl border border-slate-200 dark:border-white/5">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${activeTab === tab.id ? 'bg-white dark:bg-indigo-600 dark:text-white shadow-md text-slate-900' : 'text-slate-500 opacity-60 hover:opacity-100'}`}>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── ATTENDANCE TAB ── */}
      {activeTab === 'attendance' && (
        <AgentAttendance subManagers={subManagers} attendanceLogs={attendanceLogs}
          onViewLogs={() => setActiveTab('logs')} onViewRoute={() => setActiveTab('tracking')}
          onAddManualEntry={(id, type, date) => {
            onAddAttendanceLog({ subManagerId: id, type: type as any, timestamp: date });
            if (type === 'check-in') onEditAgent(id, { dutyStatus: 'online', lastCheckIn: date, isLeave: false });
            else if (type === 'check-out') onEditAgent(id, { dutyStatus: 'offline', lastCheckOut: date });
            else if (type === 'leave') onEditAgent(id, { dutyStatus: 'offline', isLeave: true, lastCheckOut: date });
          }}
          onUpdateLog={onUpdateAttendanceLog} onDeleteLog={onDeleteAttendanceLog} />
      )}

      {activeTab === 'logs' && (
        <ActivityLogs subManagers={subManagers} recentReceipts={recentReceipts}
          onViewPerformance={() => setActiveTab('performance')} />
      )}
      {activeTab === 'performance' && (
        <AgentPerformanceReport subManagers={subManagers} recentReceipts={recentReceipts} attendanceLogs={attendanceLogs} />
      )}
      {activeTab === 'tracking' && <LiveTracking subManagers={subManagers} />}

      {/* ── PAYROLL TAB ── */}
      {activeTab === 'payroll' && (
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Payroll Summary</h3>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-6">{currentMonthKey} — Base + Commission Breakdown</p>
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-6">
              {agentPayroll.map(({ sm, totalCollected, commissionEarned, baseSalary, totalPayable, alreadyPaid }) => (
                <div key={sm.id} className="bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 rounded-[2rem] p-6 space-y-4">
                  {/* Agent header */}
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-600/10 flex items-center justify-center font-bold text-indigo-600 dark:text-indigo-400 text-lg">
                      {sm.name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white text-sm">{sm.name}</p>
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">@{sm.username}</p>
                    </div>
                    {alreadyPaid && (
                      <span className="ml-auto px-2.5 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9px] font-black uppercase rounded-full border border-emerald-500/20">
                        ✓ Paid
                      </span>
                    )}
                  </div>

                  {/* Payroll rows */}
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-center py-2 border-b border-slate-200 dark:border-white/5">
                      <span className="text-slate-500 font-medium">Base Salary</span>
                      <span className="font-bold text-slate-900 dark:text-white">Rs. {baseSalary.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-200 dark:border-white/5">
                      <span className="text-slate-500 font-medium">Total Collected</span>
                      <span className="font-bold text-indigo-600 dark:text-indigo-400">Rs. {totalCollected.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-200 dark:border-white/5">
                      <span className="text-slate-500 font-medium">Commission ({sm.commissionPercent || 0}%)</span>
                      <span className="font-bold text-amber-500">Rs. {commissionEarned.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center py-3 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 px-3 mt-2">
                      <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Total Payable</span>
                      <span className="text-base font-black text-emerald-600 dark:text-emerald-400">Rs. {totalPayable.toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Mark Salary Paid */}
                  <button
                    disabled={alreadyPaid}
                    onClick={() => handleMarkSalaryPaid(sm)}
                    className={`w-full py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${alreadyPaid
                      ? 'bg-slate-100 dark:bg-white/5 text-slate-400 cursor-not-allowed'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-600/20'}`}
                  >
                    {alreadyPaid ? `✓ Paid on ${new Date((sm.salaryPayments || []).find(p => p.month === currentMonthKey)?.paidAt || '').toLocaleDateString()}` : 'Mark Salary Paid'}
                  </button>
                </div>
              ))}

              {subManagers.length === 0 && (
                <div className="col-span-3 py-16 text-center opacity-30 text-xs font-bold uppercase tracking-widest">
                  No agents — recruit agents first
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TEAM DIRECTORY TAB ── */}
      {activeTab === 'team' && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {subManagers.map(sm => {
            const payroll = agentPayroll.find(p => p.sm.id === sm.id);
            return (
              <div key={sm.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-sm hover:shadow-xl transition-all group overflow-hidden relative">
                <div className={`absolute pointer-events-none -top-24 -right-24 w-48 h-48 rounded-full blur-[64px] opacity-10 transition-colors ${sm.dutyStatus === 'online' ? 'bg-emerald-500' : 'bg-slate-500'}`} />
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center font-bold text-2xl text-slate-400 group-hover:text-indigo-500 transition-colors">
                      {sm.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white">{sm.name}</h3>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${sm.dutyStatus === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                          {sm.dutyStatus === 'online' ? 'Active Duty' : 'Offline'}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={e => {
                      e.stopPropagation();
                      const accounts = getAccounts();
                      const acc = accounts.find(a => a.username === sm.username);
                      setEditingAgent({
                        ...sm,
                        email: acc?.email || '',
                        phone: acc?.phone || '',
                        password: acc?.password || '',
                        baseSalary: sm.baseSalary || '',
                        commissionPercent: sm.commissionPercent || '',
                      });
                    }} className="p-3 bg-slate-50 dark:bg-white/5 rounded-xl text-slate-400 hover:text-indigo-500 transition-all hover:scale-110">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                    </button>
                    <button onClick={e => { e.stopPropagation(); setDeletingAgentId(sm.id || sm.username); }}
                      className="p-3 bg-slate-50 dark:bg-white/5 rounded-xl text-slate-400 hover:text-rose-500 transition-all hover:scale-110">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                    </button>
                    <button onClick={e => { e.stopPropagation(); setPerformanceAgentId(sm.id || sm.username); }}
                      className="p-3 bg-slate-50 dark:bg-white/5 rounded-xl text-slate-400 hover:text-emerald-500 transition-all hover:scale-110">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
                    </button>
                  </div>
                </div>

                {/* Quick payroll preview */}
                {payroll && (sm.baseSalary || sm.commissionPercent) ? (
                  <div className="mt-2 grid grid-cols-2 gap-2 mb-4">
                    <div className="bg-slate-50 dark:bg-white/[0.02] rounded-2xl px-4 py-2.5">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Commission</p>
                      <p className="text-xs font-black text-amber-500">Rs. {payroll.commissionEarned.toLocaleString()}</p>
                    </div>
                    <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl px-4 py-2.5">
                      <p className="text-[9px] font-bold text-emerald-500/60 uppercase tracking-widest">Total Due</p>
                      <p className="text-xs font-black text-emerald-600 dark:text-emerald-400">Rs. {payroll.totalPayable.toLocaleString()}</p>
                    </div>
                  </div>
                ) : null}

                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-slate-50 dark:border-white/5">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Check-In</p>
                    <p className="text-xs font-bold dark:text-slate-200">{sm.lastCheckIn ? new Date(sm.lastCheckIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</p>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-slate-50 dark:border-white/5">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Last Sync</p>
                    <p className="text-xs font-bold dark:text-slate-200">{sm.lastLocation ? new Date(sm.lastLocation.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</p>
                  </div>
                </div>
              </div>
            );
          })}

          <button onClick={() => setShowRecruitModal(true)}
            className="border-2 border-dashed border-slate-200 dark:border-white/5 rounded-3xl p-6 flex flex-col items-center justify-center gap-4 hover:border-indigo-500 transition-all opacity-40 hover:opacity-100 hover:bg-slate-50 dark:hover:bg-white/[0.01]">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            </div>
            <p className="text-xs font-bold uppercase tracking-widest">Recruit Agent</p>
          </button>
        </div>
      )}

      {/* ── PERFORMANCE MODAL (with EARNED COMMISSION card) ── */}
      {performanceAgentId && selectedAgentForPerformance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setPerformanceAgentId(null)} />
          <div className="relative w-full max-w-4xl bg-white dark:bg-[#0f172a] rounded-[3rem] shadow-2xl border border-slate-200 dark:border-white/5 overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[85vh]">
            <div className="px-10 py-8 border-b border-slate-100 dark:border-white/5 flex items-center justify-between bg-slate-50/50 dark:bg-white/[0.02]">
              <div className="flex items-center gap-5">
                <div className="w-14 h-14 bg-emerald-500/10 text-emerald-500 rounded-2xl flex items-center justify-center font-bold text-2xl">
                  {selectedAgentForPerformance.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight uppercase">{selectedAgentForPerformance.name}</h3>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mt-0.5">Performance & Receipt History</p>
                </div>
              </div>
              <button onClick={() => setPerformanceAgentId(null)}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 dark:bg-white/5 text-slate-400 hover:text-rose-500 transition-all hover:rotate-90">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            <div className="p-10 flex-1 overflow-y-auto space-y-8">
              {/* ✅ Stats: 4 cards including EARNED COMMISSION */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-50 dark:bg-white/5 p-5 rounded-[2rem] border border-slate-100 dark:border-white/5">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Collections</p>
                  <p className="text-xl font-black text-emerald-500">Rs. {agentReceipts.reduce((s, r) => s + (r.paidAmount || 0), 0).toLocaleString()}</p>
                </div>
                <div className="bg-slate-50 dark:bg-white/5 p-5 rounded-[2rem] border border-slate-100 dark:border-white/5">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Bills Issued</p>
                  <p className="text-xl font-black text-indigo-500">{agentReceipts.length}</p>
                </div>
                {/* ✅ EARNED COMMISSION CARD */}
                <div className="bg-amber-500/5 border border-amber-500/15 p-5 rounded-[2rem]">
                  <p className="text-[9px] font-bold text-amber-500/70 uppercase tracking-widest mb-1">Earned Commission</p>
                  <p className="text-xl font-black text-amber-500">Rs. {perfCommission.toLocaleString()}</p>
                  <p className="text-[9px] text-amber-500/50 mt-1">{selectedAgentForPerformance.commissionPercent || 0}% of collections</p>
                </div>
                <div className="bg-slate-50 dark:bg-white/5 p-5 rounded-[2rem] border border-slate-100 dark:border-white/5">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Agent Status</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className={`w-2 h-2 rounded-full ${selectedAgentForPerformance.dutyStatus === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                    <p className="text-lg font-black uppercase text-slate-700 dark:text-slate-200">{selectedAgentForPerformance.dutyStatus}</p>
                  </div>
                </div>
              </div>

              {/* Receipt History Table */}
              <div className="bg-white dark:bg-[#12162a] rounded-[2.5rem] border border-slate-200 dark:border-white/5 overflow-hidden shadow-sm">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-white/5 bg-slate-50/30 dark:bg-white/[0.01]">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">Full Transaction Checklist</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 dark:bg-white/[0.02] text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] border-b border-slate-100 dark:border-white/5">
                      <tr>
                        <th className="px-6 py-4">Client</th>
                        <th className="px-6 py-4">Date</th>
                        <th className="px-6 py-4">Period</th>
                        <th className="px-6 py-4">Amount</th>
                        <th className="px-6 py-4 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-white/[0.02]">
                      {agentReceipts.length > 0 ? (
                        [...agentReceipts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map(rec => (
                          <tr key={rec.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.01] transition-all">
                            <td className="px-6 py-4">
                              <p className="text-xs font-bold text-slate-900 dark:text-white uppercase">{rec.userName}</p>
                              <p className="text-[9px] text-slate-500">@{rec.username}</p>
                            </td>
                            <td className="px-6 py-4"><p className="text-xs font-medium text-slate-500">{new Date(rec.date).toLocaleDateString()}</p></td>
                            <td className="px-6 py-4"><p className="text-xs font-bold text-indigo-600 dark:text-indigo-400 opacity-80">{rec.period}</p></td>
                            <td className="px-6 py-4"><p className="text-sm font-black text-slate-700 dark:text-slate-300">Rs. {(rec.paidAmount || 0).toLocaleString()}</p></td>
                            <td className="px-6 py-4 text-right">
                              <span className="px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-500 text-[9px] font-black uppercase tracking-widest border border-emerald-500/20">Success</span>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr><td colSpan={5} className="px-6 py-12 text-center opacity-30 text-xs font-bold uppercase tracking-widest italic">No receipts found</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="px-10 py-6 bg-slate-50 dark:bg-white/[0.02] border-t border-slate-100 dark:border-white/5 flex justify-end">
              <button onClick={() => setPerformanceAgentId(null)}
                className="px-8 py-3 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-600/20 active:scale-95">
                Close Terminal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── FIELD OPS TAB ── */}
      {activeTab === 'overrides' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-3xl overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-white/5 flex justify-between items-center">
            <h3 className="font-bold text-slate-900 dark:text-white">Recent Stream</h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Latest field transactions</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-white/[0.02] border-b border-slate-200 dark:border-white/5">
                <tr>
                  {['Agent', 'Customer', 'Amount', 'Reference', 'Overrides'].map(h => (
                    <th key={h} className={`px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest ${h === 'Overrides' ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/[0.03]">
                {recentReceipts.length > 0 ? recentReceipts.map(rec => {
                  const agent = subManagers.find(sm => sm.id === rec.collectedBy || sm.username === rec.collectedBy);
                  return (
                    <tr key={rec.id} className="hover:bg-slate-50 dark:hover:bg-white/[0.01]">
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-900 dark:text-white">{agent?.name || 'Field Agent'}</p>
                        <p className="text-[10px] text-slate-400">@{rec.collectedBy || 'unknown'}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-900 dark:text-white">{rec.userName}</p>
                        <p className="text-[10px] text-slate-400">@{rec.username}</p>
                      </td>
                      <td className="px-6 py-4"><p className="font-bold text-emerald-500 text-base">Rs. {rec.paidAmount.toLocaleString()}</p></td>
                      <td className="px-6 py-4">
                        <p className="text-[11px] font-mono font-bold text-slate-500 bg-slate-100 dark:bg-white/5 inline-block px-2 py-1 rounded">{rec.transactionRef}</p>
                      </td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button onClick={() => { const amt = prompt('New amount:', String(rec.paidAmount)); if (amt) onEditReceiptAmount(rec.id, parseFloat(amt)); }}
                          className="p-2.5 rounded-xl bg-indigo-600/5 text-indigo-600 hover:bg-indigo-600 hover:text-white transition-all">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                        </button>
                        <button onClick={() => onVoidReceipt(rec.id)}
                          className="p-2.5 rounded-xl bg-rose-500/5 text-rose-500 hover:bg-rose-500 hover:text-white transition-all">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                        </button>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr><td colSpan={5} className="px-6 py-12 text-center opacity-30 text-xs font-bold uppercase tracking-widest">No field receipts found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRM MODAL ── */}
      {deletingAgentId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setDeletingAgentId(null)} />
          <div className="relative w-full max-w-sm bg-white dark:bg-[#12162a] rounded-[2.5rem] shadow-2xl border border-rose-500/20 overflow-hidden animate-in zoom-in-95 duration-300 p-8 text-center">
            <div className="mx-auto w-16 h-16 bg-rose-100 dark:bg-rose-500/10 text-rose-500 rounded-full flex items-center justify-center mb-6">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Delete Agent?</h3>
            <p className="text-sm text-slate-500 mb-8">This action cannot be undone. All logs may become orphaned.</p>
            <div className="flex gap-4">
              <button onClick={() => setDeletingAgentId(null)}
                className="flex-1 py-3.5 rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-500 text-xs font-bold uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-white/10 transition-all">Cancel</button>
              <button onClick={() => { onDeleteAgent(deletingAgentId); setDeletingAgentId(null); }}
                className="flex-1 py-3.5 rounded-2xl bg-rose-500 text-white text-xs font-bold uppercase tracking-widest hover:bg-rose-600 shadow-xl shadow-rose-500/20 transition-all">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubManagerManagement;
