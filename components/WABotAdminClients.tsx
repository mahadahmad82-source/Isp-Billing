// components/WABotAdminClients.tsx
// Admin-only panel to onboard/monitor ISP clients on the Ayesha WhatsApp bot SaaS.
// Rendered inside AdminDashboard when tab === 'wabot-saas'.
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import {
  Plus, RefreshCcw, CheckCircle2, XCircle, AlertTriangle, Clock,
  MessageSquare, Shield, X, Loader2
} from 'lucide-react';

interface WABotClient {
  id: string;
  manager_id: string;
  phone_number_id: string | null;
  waba_id: string | null;
  token_status: 'active' | 'expired' | 'invalid' | 'not_set';
  plan_type: 'basic' | 'pro' | 'unlimited' | 'text_only';
  message_quota: number;
  messages_used_this_cycle: number;
  cycle_start_date: string | null;
  cycle_end_date: string | null;
  service_status: 'trial' | 'active' | 'suspended' | 'cancelled';
  last_token_check: string | null;
  business_verified: boolean;
}

interface ManagerOption { username: string; business_name: string; }

interface Props {
  managers: ManagerOption[];
}

const PLAN_LABELS: Record<string, string> = {
  basic: 'Basic — Rs.2,000', pro: 'Pro — Rs.4,000', unlimited: 'Unlimited — Rs.8,000', text_only: 'Text-Only — Rs.1,500',
};

const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return iso; }
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const map: Record<string, string> = {
    active: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    trial: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    suspended: 'bg-red-500/10 text-red-400 border-red-500/20',
    cancelled: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    expired: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    invalid: 'bg-red-500/10 text-red-400 border-red-500/20',
    not_set: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  };
  return (
    <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-black uppercase tracking-wider ${map[status] || map.not_set}`}>
      {status.replace('_', ' ')}
    </span>
  );
};

const TokenIcon: React.FC<{ status: string }> = ({ status }) => {
  if (status === 'active') return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
  if (status === 'expired' || status === 'invalid') return <XCircle className="w-4 h-4 text-red-400" />;
  return <AlertTriangle className="w-4 h-4 text-slate-500" />;
};

const WABotAdminClients: React.FC<Props> = ({ managers }) => {
  const [clients, setClients] = useState<WABotClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const [form, setForm] = useState({
    manager_id: '', waba_id: '', phone_number_id: '', access_token: '', plan_type: 'basic',
  });

  const loadClients = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('whatsapp_configs')
      .select('id,manager_id,phone_number_id,waba_id,token_status,plan_type,message_quota,messages_used_this_cycle,cycle_start_date,cycle_end_date,service_status,last_token_check,business_verified')
      .order('manager_id');
    if (!error && data) setClients(data as WABotClient[]);
    setLoading(false);
  }, []);

  useEffect(() => { loadClients(); }, [loadClients]);

  const resetForm = () => {
    setForm({ manager_id: '', waba_id: '', phone_number_id: '', access_token: '', plan_type: 'basic' });
    setTestResult(null);
  };

  const handleSubmit = async () => {
    if (!form.manager_id || !form.waba_id || !form.phone_number_id || !form.access_token) {
      setTestResult({ ok: false, msg: 'Sab fields required hain.' });
      return;
    }
    setSaving(true);
    setTestResult(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        setTestResult({ ok: false, msg: 'Session expired — dobara login karo.' });
        setSaving(false);
        return;
      }

      const res = await fetch('/api/admin-maintenance?action=add-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(form),
      });
      const result = await res.json();

      if (!res.ok) {
        setTestResult({ ok: false, msg: result?.error || 'Save fail hui.' });
      } else if (result.token_status === 'active') {
        setTestResult({ ok: true, msg: `✅ Token active hai (Meta ID: ${result.meta_user_id}). Client onboard ho gaya.` });
        await loadClients();
        setTimeout(() => { setShowAddModal(false); resetForm(); }, 1800);
      } else {
        setTestResult({ ok: false, msg: '⚠️ Token save ho gaya lekin Meta verify nahi hua — token check karo.' });
        await loadClients();
      }
    } catch (e: any) {
      setTestResult({ ok: false, msg: 'Network error: ' + e?.message });
    }
    setSaving(false);
  };

  const totalClients = clients.length;
  const activeClients = clients.filter(c => c.service_status === 'active').length;
  const tokenIssues = clients.filter(c => c.token_status === 'invalid' || c.token_status === 'expired').length;
  const nearQuota = clients.filter(c => c.message_quota > 0 && c.messages_used_this_cycle / c.message_quota >= 0.8).length;

  return (
    <div className="space-y-5">
      {/* Overview cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Total Clients', value: totalClients, icon: <MessageSquare className="w-4 h-4" />, color: 'text-indigo-400' },
          { label: 'Active', value: activeClients, icon: <CheckCircle2 className="w-4 h-4" />, color: 'text-emerald-400' },
          { label: 'Token Issues', value: tokenIssues, icon: <Shield className="w-4 h-4" />, color: 'text-red-400' },
          { label: 'Near Quota (80%+)', value: nearQuota, icon: <AlertTriangle className="w-4 h-4" />, color: 'text-amber-400' },
        ].map(c => (
          <div key={c.label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
            <div className={`flex items-center gap-2 ${c.color} mb-2`}>{c.icon}<span className="text-[10px] font-black uppercase tracking-wider">{c.label}</span></div>
            <div className="text-2xl font-black text-white">{c.value}</div>
          </div>
        ))}
      </div>

      {/* Actions row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <button onClick={() => { resetForm(); setShowAddModal(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-[11px] font-black uppercase tracking-wider hover:bg-indigo-500 transition-all active:scale-95 shadow-lg shadow-indigo-500/20">
          <Plus className="w-3.5 h-3.5" /> Add New Client
        </button>
        <button onClick={loadClients}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.05] border border-white/[0.08] text-slate-300 text-[11px] font-black uppercase tracking-wider hover:bg-white/[0.08] transition-all active:scale-95">
          <RefreshCcw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Clients table */}
      {loading ? (
        <div className="flex items-center justify-center py-24 gap-3">
          <div className="w-7 h-7 border-[3px] border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-slate-400 font-bold text-sm">Loading clients...</span>
        </div>
      ) : clients.length === 0 ? (
        <div className="text-center py-16 text-slate-500 font-bold">Koi client onboard nahi hua abhi. "Add New Client" se shuru karo.</div>
      ) : (
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06] text-slate-500 text-[10px] uppercase tracking-wider font-black">
                <th className="text-left px-4 py-3">Manager</th>
                <th className="text-left px-4 py-3">Plan</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Token</th>
                <th className="text-left px-4 py-3">Quota Used</th>
                <th className="text-left px-4 py-3">Cycle Ends</th>
                <th className="text-left px-4 py-3">Verified</th>
              </tr>
            </thead>
            <tbody>
              {clients.map(c => {
                const pct = c.message_quota > 0 ? Math.min(100, Math.round((c.messages_used_this_cycle / c.message_quota) * 100)) : 0;
                const mgr = managers.find(m => m.username === c.manager_id);
                return (
                  <tr key={c.id} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="font-bold text-white">{mgr?.business_name || c.manager_id}</div>
                      <div className="text-[10px] text-slate-500">@{c.manager_id}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-xs font-bold">{PLAN_LABELS[c.plan_type] || c.plan_type}</td>
                    <td className="px-4 py-3"><StatusBadge status={c.service_status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <TokenIcon status={c.token_status} />
                        <span className="text-[10px] font-bold text-slate-400 uppercase">{c.token_status.replace('_', ' ')}</span>
                      </div>
                      {c.last_token_check && <div className="text-[9px] text-slate-600 mt-0.5">checked {fmtDate(c.last_token_check)}</div>}
                    </td>
                    <td className="px-4 py-3 min-w-[140px]">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">{c.messages_used_this_cycle}/{c.message_quota}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" />{fmtDate(c.cycle_end_date)}</td>
                    <td className="px-4 py-3">
                      {c.business_verified
                        ? <span className="text-emerald-400 text-[10px] font-black">✓ Verified</span>
                        : <span className="text-amber-400 text-[10px] font-black">Not verified</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Client Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/[0.08] rounded-2xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-white">Add New WABot Client</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-500 hover:text-white"><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1 block">Manager</label>
                <select value={form.manager_id} onChange={e => setForm(f => ({ ...f, manager_id: e.target.value }))}
                  className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-indigo-500">
                  <option value="">-- Select Manager --</option>
                  {managers.map(m => <option key={m.username} value={m.username}>{m.business_name} (@{m.username})</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1 block">WABA ID</label>
                <input value={form.waba_id} onChange={e => setForm(f => ({ ...f, waba_id: e.target.value }))} placeholder="WhatsApp Business Account ID"
                  className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1 block">Phone Number ID</label>
                <input value={form.phone_number_id} onChange={e => setForm(f => ({ ...f, phone_number_id: e.target.value }))} placeholder="Meta Phone Number ID"
                  className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1 block">Access Token (System User)</label>
                <input type="password" value={form.access_token} onChange={e => setForm(f => ({ ...f, access_token: e.target.value }))} placeholder="Meta permanent access token"
                  className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-1 block">Plan</label>
                <select value={form.plan_type} onChange={e => setForm(f => ({ ...f, plan_type: e.target.value }))}
                  className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-indigo-500">
                  {Object.entries(PLAN_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>

            {testResult && (
              <div className={`text-xs font-bold p-3 rounded-xl ${testResult.ok ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                {testResult.msg}
              </div>
            )}

            <button onClick={handleSubmit} disabled={saving}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 text-white text-[11px] font-black uppercase tracking-wider hover:bg-indigo-500 transition-all active:scale-95 disabled:opacity-50">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Testing & Saving...</> : 'Test Connection & Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default WABotAdminClients;
