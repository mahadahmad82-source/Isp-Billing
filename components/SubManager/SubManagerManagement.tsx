import React, { useState, useMemo, Suspense, lazy } from 'react';
import { SubManagerAccount, AttendanceLog, Receipt, UserRecord, ComplaintTicket, TeamMessage, PayrollRecord } from '../../types';
import { supabase } from '../../lib/supabase';
import { getAccounts } from '../../utils/storage';
import RecruitAgentModal from './RecruitAgentModal';
import AgentAttendance from './AgentAttendance';
import ActivityLogs from './ActivityLogs';
import AgentPerformanceReport from './AgentPerformanceReport';
import EditGranularRights from './EditGranularRights';
import TeamCommunication from './TeamCommunication';

// Lazy load LiveTracking so map issues don't crash the whole Team Hub
const LiveTracking = lazy(() => import('./LiveTracking'));
const ComplaintManager = lazy(() => import('../ComplaintManager'));

interface SubManagerManagementProps {
  subManagers: SubManagerAccount[];
  recentReceipts: Receipt[];
  managerId: string;
  onVoidReceipt: (receiptId: string) => void;
  onEditReceiptAmount: (receiptId: string, newAmount: number) => void;
  onAgentRecruited: (agent: any) => void;
  onEditAgent: (agentId: string, updates: any) => void;
  onDeleteAgent: (agentId: string) => void;
  onAddAttendanceLog: (log: Omit<AttendanceLog, 'id'>) => void;
  onUpdateAttendanceLog: (logId: string, updates: Partial<AttendanceLog>) => void;
  onDeleteAttendanceLog: (logId: string) => void;
  attendanceLogs: AttendanceLog[];
  complaintTickets?: ComplaintTicket[];
  onResolveComplaint?: (ticketId: string) => void;
  users?: UserRecord[];
  onAddComplaint?: (t: Omit<ComplaintTicket, 'id' | 'createdAt'>) => void;
  onUpdateComplaint?: (id: string, updates: Partial<ComplaintTicket>) => void;
  onDeleteComplaint?: (id: string) => void;
  teamMessages?: TeamMessage[];
  onSendTeamMessage?: (message: TeamMessage) => void;
  onRefreshTeamMessages?: () => Promise<void>;
  areas?: string[]; // Feature A — Access Rights: service areas list for the area-lock picker
}

const SubManagerManagement: React.FC<SubManagerManagementProps> = ({
  subManagers, recentReceipts, managerId,
  onVoidReceipt, onEditReceiptAmount,
  onAgentRecruited, onEditAgent, onDeleteAgent,
  onAddAttendanceLog, onUpdateAttendanceLog, onDeleteAttendanceLog, attendanceLogs,
  complaintTickets = [], onResolveComplaint, users = [],
  onAddComplaint, onUpdateComplaint, onDeleteComplaint, teamMessages = [], onSendTeamMessage, onRefreshTeamMessages, areas = [],
}) => {
  const [activeTab, setActiveTab] = useState<'team' | 'payroll' | 'overrides' | 'attendance' | 'logs' | 'tracking' | 'performance' | 'complaints' | 'communication'>('team');
  const [showRecruitModal, setShowRecruitModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<any>(null);
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);
  const [performanceAgentId, setPerformanceAgentId] = useState<string | null>(null);
  const [rightsAgentId, setRightsAgentId] = useState<string | null>(null);

  const handleAgentRecruited = async (agent: any) => {
    const normalizedAgent = { ...agent, username: String(agent.username || '').trim().toLowerCase() };
    let enrichedAgent = normalizedAgent;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Manager session expired.');
      const response = await fetch('/api/admin-maintenance?action=create-sub-manager-auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          manager_username: managerId,
          sub_manager_username: normalizedAgent.username,
          email: normalizedAgent.email,
          password: normalizedAgent.password,
          name: normalizedAgent.name,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) throw new Error(result.error || 'Real login provisioning failed.');
      enrichedAgent = { ...normalizedAgent, authUserId: result.auth_user_id };
    } catch (error: any) {
      console.error('[RecruitAgent] real-auth provisioning failed:', error?.message);
      alert(`Agent local profile save ho jayega, lekin real login account create nahi hua: ${error?.message || 'Unknown error'}`);
    }
    // Existing manager_data JSONB + localStorage dual-save remains in App.tsx.
    onAgentRecruited(enrichedAgent);
  };

  const selectedAgentForPerformance = subManagers.find(sm => sm.id === performanceAgentId || sm.username === performanceAgentId);
  const performanceMonthKey = new Date().toISOString().slice(0, 7);
  const performanceMonthLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date());
  const agentReceipts = recentReceipts.filter(r => {
    const isAgent = r.collectedBy === performanceAgentId || r.collectedBy === selectedAgentForPerformance?.username;
    return isAgent && new Date(r.date).toISOString().slice(0, 7) === performanceMonthKey;
  });
  const performanceAttendance = useMemo(() => {
    if (!selectedAgentForPerformance) return { presentDays: 0, leaveDays: 0 };
    const logs = attendanceLogs.filter(log =>
      (log.subManagerId === selectedAgentForPerformance.id || log.subManagerId === selectedAgentForPerformance.username) &&
      log.timestamp && log.timestamp.startsWith(performanceMonthKey)
    );
    return {
      presentDays: new Set(logs.filter(log => log.type === 'check-in').map(log => log.timestamp.slice(0, 10))).size,
      leaveDays: new Set(logs.filter(log => log.type === 'leave').map(log => log.timestamp.slice(0, 10))).size,
    };
  }, [attendanceLogs, performanceMonthKey, selectedAgentForPerformance]);

  const [payrollPeriodStart, setPayrollPeriodStart] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10));
  const [payrollPeriodEnd, setPayrollPeriodEnd] = useState(new Date().toISOString().slice(0, 10));
  const [payrollAgentId, setPayrollAgentId] = useState('');
  const [payrollForm, setPayrollForm] = useState({
    presentDays: '0',
    workingDays: '0',
    basicSalary: '0',
    collectionAmount: '0',
    commissionAmount: '0',
    complaintBonusAmount: '0',
  });
  const [payrollIncludeComplaintBonus, setPayrollIncludeComplaintBonus] = useState(false);
  const [payrollDeductions, setPayrollDeductions] = useState<{ reason: string; amount: string }[]>([]);
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>([]);
  const [payrollLoading, setPayrollLoading] = useState(false);
  const [payrollSaving, setPayrollSaving] = useState(false);
  const [payrollError, setPayrollError] = useState<string | null>(null);

  const selectedPayrollAgent = subManagers.find(sm => sm.id === payrollAgentId);
  const payrollSuggestion = useMemo(() => {
    if (!selectedPayrollAgent) return { presentDays: 0, workingDays: 0, basicSalary: 0, collectionAmount: 0, commissionAmount: 0, complaintBonusAmount: 0 };
    const start = new Date(`${payrollPeriodStart}T00:00:00`).getTime();
    const end = new Date(`${payrollPeriodEnd}T23:59:59.999`).getTime();
    const inRange = (value: string) => {
      const time = new Date(value).getTime();
      return Number.isFinite(time) && time >= start && time <= end;
    };
    const logs = attendanceLogs.filter(log =>
      (log.subManagerId === selectedPayrollAgent.id || log.subManagerId === selectedPayrollAgent.username) && inRange(log.timestamp)
    );
    const presentDays = new Set(logs.filter(log => log.type === 'check-in').map(log => log.timestamp.slice(0, 10))).size;
    const workingDays = start <= end ? Math.floor((new Date(`${payrollPeriodEnd}T00:00:00`).getTime() - new Date(`${payrollPeriodStart}T00:00:00`).getTime()) / 86400000) + 1 : 0;
    const receipts = recentReceipts.filter(receipt =>
      (receipt.collectedBy === selectedPayrollAgent.id || receipt.collectedBy === selectedPayrollAgent.username) && inRange(receipt.actualPaymentDate || receipt.date)
    );
    const collectionAmount = receipts.reduce((sum, receipt) => sum + (Number(receipt.paidAmount) || 0), 0);
    const commissionAmount = Math.round(collectionAmount * (selectedPayrollAgent.commissionPercent || 0) / 100);
    const complaintBonusCount = complaintTickets.filter(ticket =>
      (ticket.status === 'resolved' || ticket.status === 'closed') &&
      (ticket.resolvedBy === selectedPayrollAgent.id || ticket.resolvedBy === selectedPayrollAgent.username) &&
      !!ticket.resolvedAt && inRange(ticket.resolvedAt)
    ).length;
    const complaintBonusAmount = complaintBonusCount * (selectedPayrollAgent.complaintBonusRate || 0);
    const basicSalary = workingDays > 0 ? Math.round((selectedPayrollAgent.baseSalary || 0) * presentDays / workingDays) : 0;
    return { presentDays, workingDays, basicSalary, collectionAmount, commissionAmount, complaintBonusAmount };
  }, [attendanceLogs, complaintTickets, payrollPeriodEnd, payrollPeriodStart, recentReceipts, selectedPayrollAgent]);

  React.useEffect(() => {
    if (!payrollAgentId && subManagers[0]) setPayrollAgentId(subManagers[0].id);
  }, [payrollAgentId, subManagers]);
  React.useEffect(() => {
    setPayrollForm({
      presentDays: String(payrollSuggestion.presentDays),
      workingDays: String(payrollSuggestion.workingDays),
      basicSalary: String(payrollSuggestion.basicSalary),
      collectionAmount: String(payrollSuggestion.collectionAmount),
      commissionAmount: String(payrollSuggestion.commissionAmount),
      complaintBonusAmount: String(payrollIncludeComplaintBonus ? payrollSuggestion.complaintBonusAmount : 0),
    });
    setPayrollDeductions([]);
    setPayrollError(null);
  }, [payrollAgentId, payrollIncludeComplaintBonus, payrollPeriodEnd, payrollPeriodStart, payrollSuggestion]);

  const loadPayrollRecords = async (agentId = payrollAgentId) => {
    if (!managerId || !agentId) return;
    setPayrollLoading(true);
    const { data, error } = await supabase
      .from('payroll_records')
      .select('*')
      .eq('manager_id', managerId)
      .eq('sub_manager_id', agentId)
      .order('created_at', { ascending: false });
    if (error) setPayrollError(error.message);
    else setPayrollRecords((data || []) as PayrollRecord[]);
    setPayrollLoading(false);
  };
  React.useEffect(() => {
    if (activeTab === 'payroll') void loadPayrollRecords();
  }, [activeTab, managerId, payrollAgentId]);

  const submitPayroll = async (markPaid: boolean) => {
    if (!selectedPayrollAgent || !managerId) return;
    if (!payrollPeriodStart || !payrollPeriodEnd || payrollPeriodStart > payrollPeriodEnd) {
      setPayrollError('Choose a valid payroll date range.');
      return;
    }
    const deductions = payrollDeductions
      .map(item => ({ reason: item.reason.trim(), amount: Number(item.amount) || 0 }))
      .filter(item => item.reason && item.amount > 0);
    setPayrollSaving(true);
    setPayrollError(null);
    const { error } = await supabase.rpc('finalize_payroll_record', {
      p_manager_id: managerId,
      p_sub_manager_id: selectedPayrollAgent.id,
      p_period_start: payrollPeriodStart,
      p_period_end: payrollPeriodEnd,
      p_present_days: Number(payrollForm.presentDays) || 0,
      p_working_days: Number(payrollForm.workingDays) || 0,
      p_basic_salary: Number(payrollForm.basicSalary) || 0,
      p_collection_amount: Number(payrollForm.collectionAmount) || 0,
      p_commission_amount: Number(payrollForm.commissionAmount) || 0,
      p_complaint_bonus_included: payrollIncludeComplaintBonus,
      p_complaint_bonus_amount: payrollIncludeComplaintBonus ? Number(payrollForm.complaintBonusAmount) || 0 : 0,
      p_deductions: deductions,
      p_mark_paid: markPaid,
    });
    setPayrollSaving(false);
    if (error) setPayrollError(error.message);
    else await loadPayrollRecords(selectedPayrollAgent.id);
  };

  const markPayrollPaid = async (record: PayrollRecord) => {
    if (!managerId || record.status === 'paid') return;
    setPayrollSaving(true);
    setPayrollError(null);
    const { error } = await supabase.rpc('mark_payroll_paid', { p_manager_id: managerId, p_record_id: record.id });
    setPayrollSaving(false);
    if (error) setPayrollError(error.message);
    else await loadPayrollRecords(record.sub_manager_id);
  };

  // ✅ Commission for performance modal
  const perfCommission = useMemo(() => {
    if (!selectedAgentForPerformance) return 0;
    const total = agentReceipts.reduce((s, r) => s + (r.paidAmount || 0), 0);
    return Math.round((total * (selectedAgentForPerformance.commissionPercent || 0)) / 100);
  }, [agentReceipts, selectedAgentForPerformance]);

  const tabs = [
    { id: 'team', label: 'Directory' },
    { id: 'payroll', label: 'Payroll' },
    { id: 'attendance', label: 'Attendance' },
    { id: 'logs', label: 'Activity Logs' },
    { id: 'performance', label: 'Performance' },
    { id: 'tracking', label: 'Live Tracking' },
    { id: 'overrides', label: 'Field Ops' },
    { id: 'complaints', label: 'Complaints' },
    { id: 'communication', label: 'Communication' },
  ] as const;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <RecruitAgentModal isOpen={showRecruitModal} onClose={() => setShowRecruitModal(false)} managerId={managerId}
        onSuccess={handleAgentRecruited} />

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
                complaintBonusRate: parseFloat(editingAgent.complaintBonusRate) || 0,
                shiftStart: editingAgent.shiftStart || '',
                shiftEnd: editingAgent.shiftEnd || '',
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

                <div className="col-span-2 pt-3 border-t border-slate-100 dark:border-white/5">
                  <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-3">Shift Configuration</p>
                  <div className="grid grid-cols-2 gap-5">
                    <div className="space-y-2"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Shift Start</label><input type="time" value={editingAgent.shiftStart || ''} onChange={e => setEditingAgent({ ...editingAgent, shiftStart: e.target.value })} className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" /></div>
                    <div className="space-y-2"><label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Shift End</label><input type="time" value={editingAgent.shiftEnd || ''} onChange={e => setEditingAgent({ ...editingAgent, shiftEnd: e.target.value })} className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm font-bold focus:ring-2 focus:ring-indigo-500 outline-none" /></div>
                  </div>
                  <p className="text-[9px] text-slate-400 mt-2">Overtime is calculated only from manual clock-in/out records outside this window.</p>
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
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Complaint Bonus (Rs.)</label>
                  <input type="number" min="0" step="1" placeholder="0"
                    value={editingAgent.complaintBonusRate || ''}
                    onChange={e => setEditingAgent({ ...editingAgent, complaintBonusRate: e.target.value })}
                    className="w-full px-4 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm font-bold text-amber-500 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                  <p className="text-[9px] text-slate-400 ml-1">Optional per resolved complaint</p>
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
        <ActivityLogs subManagers={subManagers} recentReceipts={recentReceipts} attendanceLogs={attendanceLogs}
          onViewPerformance={() => setActiveTab('performance')} />
      )}
      {activeTab === 'performance' && (
        <AgentPerformanceReport subManagers={subManagers} recentReceipts={recentReceipts} attendanceLogs={attendanceLogs} />
      )}
      {activeTab === 'tracking' && (
        <Suspense fallback={<div className="flex items-center justify-center h-64 text-slate-400 text-sm font-bold uppercase tracking-widest">Loading Map...</div>}>
          <LiveTracking subManagers={subManagers} />
        </Suspense>
      )}

      {/* ── PAYROLL TAB ── */}
      {activeTab === 'payroll' && (
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Payroll Workspace</h3>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1">Manager review · server-calculated payable total</p>
              </div>
              <div className="flex flex-wrap items-end gap-3">
                <label className="space-y-1"><span className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest">Agent</span><select value={payrollAgentId} onChange={e => setPayrollAgentId(e.target.value)} className="px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"><option value="">Select agent</option>{subManagers.map(sm => <option key={sm.id} value={sm.id}>{sm.name || sm.username}</option>)}</select></label>
                <label className="space-y-1"><span className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest">Period start</span><input type="date" value={payrollPeriodStart} onChange={e => setPayrollPeriodStart(e.target.value)} className="px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500" /></label>
                <label className="space-y-1"><span className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest">Period end</span><input type="date" value={payrollPeriodEnd} onChange={e => setPayrollPeriodEnd(e.target.value)} className="px-3 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500" /></label>
              </div>
            </div>

            {payrollError && <div className="mb-5 rounded-2xl border border-rose-500/20 bg-rose-500/5 px-4 py-3 text-xs font-bold text-rose-500">{payrollError}</div>}
            <div className="grid xl:grid-cols-[1.15fr_0.85fr] gap-6">
              <div className="bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 rounded-[2rem] p-6 space-y-5">
                <div className="flex items-center justify-between"><div><p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Editable review figures</p><p className="text-xs text-slate-500 mt-1">Suggestions are pre-filled from attendance, receipts, and resolved complaints.</p></div><span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">No JSONB write</span></div>
                <div className="grid sm:grid-cols-2 gap-4">
                  {[['presentDays', 'Present days'], ['workingDays', 'Working days'], ['basicSalary', 'Basic salary (Rs.)'], ['collectionAmount', 'Collections (Rs.)'], ['commissionAmount', 'Commission (Rs.)']].map(([key, label]) => <label key={key} className="space-y-1"><span className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest">{label}</span><input type="number" min="0" value={payrollForm[key as keyof typeof payrollForm]} onChange={e => setPayrollForm(prev => ({ ...prev, [key]: e.target.value }))} className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" /></label>)}
                </div>
                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-white/5 bg-white dark:bg-white/[0.02] px-4 py-3 cursor-pointer"><input type="checkbox" checked={payrollIncludeComplaintBonus} onChange={e => setPayrollIncludeComplaintBonus(e.target.checked)} className="h-4 w-4 accent-indigo-600" /><span><span className="block text-xs font-bold text-slate-800 dark:text-slate-200">Include complaint bonus</span><span className="block text-[9px] text-slate-400 mt-0.5">Suggested: Rs. {payrollSuggestion.complaintBonusAmount.toLocaleString()} from the configured per-complaint rate.</span></span></label>
                {payrollIncludeComplaintBonus && <label className="space-y-1"><span className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest">Complaint bonus (Rs.)</span><input type="number" min="0" value={payrollForm.complaintBonusAmount} onChange={e => setPayrollForm(prev => ({ ...prev, complaintBonusAmount: e.target.value }))} className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500" /></label>}
                <div className="space-y-2"><div className="flex items-center justify-between"><p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Manual deductions</p><button type="button" onClick={() => setPayrollDeductions(prev => [...prev, { reason: '', amount: '' }])} className="text-[9px] font-black text-indigo-500 uppercase tracking-widest">+ Add deduction</button></div>{payrollDeductions.length === 0 && <p className="text-xs text-slate-400">No deductions added.</p>}{payrollDeductions.map((item, index) => <div key={index} className="flex gap-2"><input type="text" placeholder="Reason" value={item.reason} onChange={e => setPayrollDeductions(prev => prev.map((row, i) => i === index ? { ...row, reason: e.target.value } : row))} className="min-w-0 flex-1 px-3 py-2.5 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-xs outline-none focus:ring-2 focus:ring-indigo-500" /><input type="number" min="0" placeholder="Amount" value={item.amount} onChange={e => setPayrollDeductions(prev => prev.map((row, i) => i === index ? { ...row, amount: e.target.value } : row))} className="w-28 px-3 py-2.5 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-xs outline-none focus:ring-2 focus:ring-indigo-500" /><button type="button" onClick={() => setPayrollDeductions(prev => prev.filter((_, i) => i !== index))} className="px-2 text-slate-400 hover:text-rose-500" aria-label="Remove deduction"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 6l12 12M18 6L6 18" /></svg></button></div>)}</div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 dark:border-white/5 pt-5"><div><p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Client preview only</p><p className="text-xl font-black text-emerald-500">Rs. {(Number(payrollForm.basicSalary) + Number(payrollForm.collectionAmount) + (payrollIncludeComplaintBonus ? Number(payrollForm.complaintBonusAmount) : 0) + Number(payrollForm.commissionAmount) - payrollDeductions.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)).toLocaleString()}</p></div><div className="flex gap-2"><button type="button" disabled={!selectedPayrollAgent || payrollSaving} onClick={() => submitPayroll(false)} className="px-4 py-3 rounded-xl bg-slate-200 dark:bg-white/10 text-slate-700 dark:text-slate-200 text-[10px] font-black uppercase tracking-widest disabled:opacity-40">{payrollSaving ? 'Saving…' : 'Save Draft'}</button><button type="button" disabled={!selectedPayrollAgent || payrollSaving} onClick={() => submitPayroll(true)} className="px-4 py-3 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-600/20 disabled:opacity-40">Finalize & Mark Paid</button></div></div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-[2rem] p-6"><div className="flex items-center justify-between mb-5"><div><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Payroll history</p><p className="text-xs text-slate-500 mt-1">{selectedPayrollAgent?.name || 'Select an agent'}</p></div>{payrollLoading && <span className="text-[9px] font-bold text-slate-400 uppercase">Loading…</span>}</div>{payrollRecords.length === 0 && !payrollLoading ? <p className="py-10 text-center text-xs font-bold text-slate-400 uppercase tracking-widest">No payroll records</p> : <div className="space-y-3">{payrollRecords.map(record => <div key={record.id} className="rounded-2xl border border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-white/[0.03] p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-slate-900 dark:text-white">{record.period_start} → {record.period_end}</p><p className="text-[9px] text-slate-400 uppercase tracking-widest mt-1">{record.present_days}/{record.working_days} present · {record.deductions?.length || 0} deductions</p></div><span className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${record.status === 'paid' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>{record.status}</span></div><div className="flex items-center justify-between mt-4"><p className="text-lg font-black text-emerald-500">Rs. {Number(record.payable_amount || 0).toLocaleString()}</p>{record.status === 'draft' && <button type="button" disabled={payrollSaving} onClick={() => markPayrollPaid(record)} className="text-[9px] font-black text-indigo-500 uppercase tracking-widest disabled:opacity-40">Mark paid</button>}</div></div>)}</div>}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── TEAM DIRECTORY TAB ── */}
      {activeTab === 'team' && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {subManagers.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-24 text-center">
              <div className="w-20 h-20 rounded-3xl bg-indigo-500/10 flex items-center justify-center mb-6">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-indigo-400"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2 uppercase tracking-tight">No Agents Yet</h3>
              <p className="text-sm text-slate-500 mb-8 max-w-xs">Recruit your first field agent to start managing your team and tracking collections.</p>
              <button onClick={() => setShowRecruitModal(true)}
                className="px-8 py-4 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-600/20 hover:bg-indigo-700 transition-all active:scale-95 flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Recruit First Agent
              </button>
            </div>
          )}
          {subManagers.map(sm => {
            const locationTimestamp = sm.lastLocationAt || sm.lastLocation?.timestamp;
            const locationAge = locationTimestamp ? Date.now() - new Date(locationTimestamp).getTime() : Number.POSITIVE_INFINITY;
            const locationStale = sm.dutyStatus === 'online' && (!locationTimestamp || !Number.isFinite(locationAge) || locationAge > 10 * 60 * 1000);
            return (
              <div key={sm.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-3xl p-6 shadow-sm hover:shadow-xl transition-all group overflow-hidden relative">
                <div className={`absolute pointer-events-none -top-24 -right-24 w-48 h-48 rounded-full blur-[64px] opacity-10 transition-colors ${sm.dutyStatus === 'online' ? 'bg-emerald-500' : 'bg-slate-500'}`} />
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center font-bold text-2xl text-slate-400 group-hover:text-indigo-500 transition-colors">
                      {(sm.name || sm.username || '?').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 dark:text-white">{(sm.name || sm.username || "Unknown")}</h3>
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
                        complaintBonusRate: sm.complaintBonusRate || '',
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
                    <button onClick={e => { e.stopPropagation(); setRightsAgentId(sm.id); }}
                      title="Access Rights"
                      className="p-3 bg-slate-50 dark:bg-white/5 rounded-xl text-slate-400 hover:text-indigo-500 transition-all hover:scale-110">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-slate-50 dark:border-white/5">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Check-In</p>
                    <p className="text-xs font-bold dark:text-slate-200">{sm.lastCheckIn ? new Date(sm.lastCheckIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</p>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-slate-50 dark:border-white/5">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Last Sync</p>
                    <p className={`text-xs font-bold ${locationStale ? 'text-amber-500' : 'dark:text-slate-200'}`}>
                      {locationTimestamp ? `${new Date(locationTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · ${locationStale ? 'Stale' : 'Live'}` : sm.dutyStatus === 'online' ? 'No location' : 'Cleared'}
                    </p>
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
                  {(selectedAgentForPerformance.name || selectedAgentForPerformance.username || '?').charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight uppercase">{selectedAgentForPerformance.name || selectedAgentForPerformance.username || 'Unknown'}</h3>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mt-0.5">Performance & Receipt History · {performanceMonthLabel}</p>
                </div>
              </div>
              <button onClick={() => setPerformanceAgentId(null)}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-slate-100 dark:bg-white/5 text-slate-400 hover:text-rose-500 transition-all hover:rotate-90">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            <div className="p-10 flex-1 overflow-y-auto space-y-8">
              {/* ✅ Stats: 4 cards including EARNED COMMISSION */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-slate-50 dark:bg-white/5 p-5 rounded-[2rem] border border-slate-100 dark:border-white/5">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Collections</p>
                  <p className="text-xl font-black text-emerald-500">Rs. {agentReceipts.reduce((s, r) => s + (r.paidAmount || 0), 0).toLocaleString()}</p>
                </div>
                <div className="bg-slate-50 dark:bg-white/5 p-5 rounded-[2rem] border border-slate-100 dark:border-white/5">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Bills Issued</p>
                  <p className="text-xl font-black text-indigo-500">{agentReceipts.length}</p>
                </div>
                <div className="bg-sky-500/5 border border-sky-500/15 p-5 rounded-[2rem]">
                  <p className="text-[9px] font-bold text-sky-500/70 uppercase tracking-widest mb-1">Attendance</p>
                  <p className="text-xl font-black text-sky-500">{performanceAttendance.presentDays} present</p>
                  <p className="text-[9px] text-sky-500/60 mt-1">{performanceAttendance.leaveDays} leave days</p>
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

      {/* ── COMMUNICATION TAB ── */}
      {activeTab === 'communication' && (
        <TeamCommunication managerId={managerId} managerUsername={managerId} currentUsername={managerId} currentRole="manager" subManagers={subManagers} messages={teamMessages} onSend={message => onSendTeamMessage?.(message)} onRefresh={onRefreshTeamMessages} />
      )}
      {/* ── COMPLAINTS TAB ── */}
      {activeTab === 'complaints' && (
        <Suspense fallback={<div className="text-center py-12 text-slate-400 text-sm">Loading...</div>}>
          <ComplaintManager
            tickets={complaintTickets}
            subManagers={subManagers}
            users={users}
            managerId={managerId}
            onAddTicket={(t) => onAddComplaint?.(t)}
            onUpdateTicket={(id, updates) => onUpdateComplaint?.(id, updates)}
            onDeleteTicket={(id) => onDeleteComplaint?.(id)}
          />
        </Suspense>
      )}

      {/* ── ACCESS RIGHTS MODAL (Feature A) ── */}
      {rightsAgentId && (() => {
        const rightsAgent = subManagers.find(sm => sm.id === rightsAgentId);
        if (!rightsAgent) return null;
        return (
          <EditGranularRights
            agent={rightsAgent}
            areas={areas}
            onClose={() => setRightsAgentId(null)}
            onSave={onEditAgent}
          />
        );
      })()}

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
