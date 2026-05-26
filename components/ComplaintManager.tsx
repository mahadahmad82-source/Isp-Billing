import React, { useState, useMemo } from 'react';
import { ComplaintTicket, SubManagerAccount, UserRecord } from '../types';

interface ComplaintManagerProps {
  tickets: ComplaintTicket[];
  subManagers: SubManagerAccount[];
  users: UserRecord[];
  managerId: string;
  onAddTicket: (t: Omit<ComplaintTicket, 'id' | 'createdAt'>) => void;
  onUpdateTicket: (id: string, updates: Partial<ComplaintTicket>) => void;
  onDeleteTicket: (id: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  open:     'bg-rose-500/10 text-rose-500',
  assigned: 'bg-amber-500/10 text-amber-500',
  resolved: 'bg-emerald-500/10 text-emerald-500',
  closed:   'bg-slate-200 dark:bg-white/5 text-slate-500',
};

const PRIORITY_COLORS: Record<string, string> = {
  high:   'bg-rose-500/10 text-rose-500 border-rose-500/20',
  medium: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  low:    'bg-slate-100 dark:bg-white/5 text-slate-500 border-slate-200 dark:border-white/5',
};

const blank = (): Omit<ComplaintTicket, 'id' | 'createdAt'> => ({
  customerId: '', customerName: '', customerPhone: '',
  title: '', description: '',
  status: 'open', priority: 'medium',
  assignedTo: '', commissionOnResolve: 0,
  createdBy: '',
});

const ComplaintManager: React.FC<ComplaintManagerProps> = ({
  tickets, subManagers, users, managerId,
  onAddTicket, onUpdateTicket, onDeleteTicket,
}) => {
  const [filter, setFilter] = useState<'all' | 'open' | 'assigned' | 'resolved' | 'closed'>('all');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank);
  const [viewTicket, setViewTicket] = useState<ComplaintTicket | null>(null);
  const [search, setSearch] = useState('');

  const visible = useMemo(() => {
    return tickets
      .filter(t => filter === 'all' || t.status === filter)
      .filter(t => !search || t.title.toLowerCase().includes(search.toLowerCase()) ||
        t.customerName.toLowerCase().includes(search.toLowerCase()));
  }, [tickets, filter, search]);

  const stats = useMemo(() => ({
    open:     tickets.filter(t => t.status === 'open').length,
    assigned: tickets.filter(t => t.status === 'assigned').length,
    resolved: tickets.filter(t => t.status === 'resolved').length,
  }), [tickets]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAddTicket({ ...form, createdBy: managerId });
    setForm(blank());
    setShowForm(false);
  };

  const assignAgent = (ticket: ComplaintTicket, agentId: string) => {
    onUpdateTicket(ticket.id, {
      assignedTo: agentId,
      assignedAt: new Date().toISOString(),
      status: 'assigned',
    });
  };

  const resolveTicket = (ticket: ComplaintTicket) => {
    onUpdateTicket(ticket.id, {
      status: 'resolved',
      resolvedAt: new Date().toISOString(),
    });
    setViewTicket(null);
  };

  const FILTERS = ['all','open','assigned','resolved','closed'] as const;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 p-6 rounded-3xl shadow-sm">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Complaint Tickets</h2>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] mt-1">Assign to agents · Track resolution · Auto commission</p>
        </div>
        <button onClick={() => setShowForm(true)}
          className="px-6 py-3 bg-indigo-600 text-white rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 flex items-center gap-2">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Ticket
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Open', count: stats.open, color: 'text-rose-500', bg: 'bg-rose-500/5 border-rose-500/10' },
          { label: 'Assigned', count: stats.assigned, color: 'text-amber-500', bg: 'bg-amber-500/5 border-amber-500/10' },
          { label: 'Resolved', count: stats.resolved, color: 'text-emerald-500', bg: 'bg-emerald-500/5 border-emerald-500/10' },
        ].map(s => (
          <div key={s.label} className={`${s.bg} border rounded-2xl p-4 text-center`}>
            <p className={`text-2xl font-black ${s.color}`}>{s.count}</p>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filter + Search */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex bg-slate-100 dark:bg-white/5 p-1 rounded-xl border border-slate-200 dark:border-white/5">
          {FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${filter === f ? 'bg-white dark:bg-indigo-600 dark:text-white shadow text-slate-900' : 'text-slate-500 opacity-60 hover:opacity-100'}`}>
              {f}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          </span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tickets..."
            className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 font-medium" />
        </div>
      </div>

      {/* Ticket list */}
      <div className="space-y-3">
        {visible.length > 0 ? visible.map(ticket => {
          const agent = subManagers.find(sm => sm.id === ticket.assignedTo || sm.username === ticket.assignedTo);
          return (
            <div key={ticket.id} onClick={() => setViewTicket(ticket)}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-2xl p-5 flex flex-col md:flex-row md:items-center gap-4 cursor-pointer hover:border-indigo-500/40 hover:shadow-md transition-all group">
              <div className="flex items-start gap-4 flex-1">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${PRIORITY_COLORS[ticket.priority]}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-slate-900 dark:text-white text-sm">{ticket.title}</p>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${STATUS_COLORS[ticket.status]}`}>{ticket.status}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${PRIORITY_COLORS[ticket.priority]}`}>{ticket.priority}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{ticket.customerName} · {new Date(ticket.createdAt).toLocaleDateString()}</p>
                  {agent && <p className="text-[10px] font-bold text-indigo-500 mt-1">👤 Assigned to {agent.name}</p>}
                </div>
              </div>
              {ticket.commissionOnResolve ? (
                <div className="bg-amber-500/5 border border-amber-500/10 rounded-xl px-4 py-2 text-center shrink-0">
                  <p className="text-[9px] font-bold text-amber-500/60 uppercase tracking-widest">Commission</p>
                  <p className="text-sm font-black text-amber-500">Rs. {ticket.commissionOnResolve.toLocaleString()}</p>
                </div>
              ) : null}
              <button onClick={e => { e.stopPropagation(); onDeleteTicket(ticket.id); }}
                className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-xl transition-all opacity-0 group-hover:opacity-100">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
              </button>
            </div>
          );
        }) : (
          <div className="py-20 text-center opacity-30">
            <p className="text-sm font-bold uppercase tracking-widest">No tickets found</p>
          </div>
        )}
      </div>

      {/* New Ticket Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowForm(false)} />
          <div className="relative w-full max-w-lg bg-white dark:bg-[#12162a] rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-white/5 overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="px-8 pt-8 pb-5 border-b border-slate-100 dark:border-white/5">
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">New Complaint Ticket</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Create & assign to agent</p>
            </div>
            <form onSubmit={handleSubmit} className="p-8 space-y-4 overflow-y-auto max-h-[70vh]">
              {/* Customer select */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Customer</label>
                <select required value={form.customerId}
                  onChange={e => {
                    const u = users.find(u => u.id === e.target.value);
                    setForm({ ...form, customerId: e.target.value, customerName: u?.name || '', customerPhone: u?.phone || '' });
                  }}
                  className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all">
                  <option value="">Select customer...</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name} (@{u.username})</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Complaint Title</label>
                <input required type="text" placeholder="e.g. Internet not working" value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Description</label>
                <textarea rows={3} placeholder="Describe the issue..." value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Priority</label>
                  <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value as any })}
                    className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Assign To Agent</label>
                  <select value={form.assignedTo} onChange={e => setForm({ ...form, assignedTo: e.target.value, status: e.target.value ? 'assigned' : 'open' })}
                    className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all">
                    <option value="">Unassigned</option>
                    {subManagers.map(sm => <option key={sm.id} value={sm.id}>{sm.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Commission on Resolve (Rs.)</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">Rs.</span>
                  <input type="number" min="0" placeholder="0" value={form.commissionOnResolve || ''}
                    onChange={e => setForm({ ...form, commissionOnResolve: parseFloat(e.target.value) || 0 })}
                    className="w-full pl-10 pr-4 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm font-bold text-amber-500 outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
                </div>
                <p className="text-[9px] text-slate-400 ml-1">Automatically credited to agent when ticket is resolved</p>
              </div>
              <div className="flex gap-4 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 py-4 rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-500 text-[10px] font-bold uppercase tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
                <button type="submit"
                  className="flex-[2] py-4 rounded-2xl bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-600/20 transition-all">
                  Create Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Ticket Modal */}
      {viewTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setViewTicket(null)} />
          <div className="relative w-full max-w-lg bg-white dark:bg-[#12162a] rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-white/5 overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="px-8 pt-8 pb-5 border-b border-slate-100 dark:border-white/5 flex justify-between items-start">
              <div>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${STATUS_COLORS[viewTicket.status]}`}>{viewTicket.status}</span>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-2">{viewTicket.title}</h3>
                <p className="text-xs text-slate-500">{viewTicket.customerName} · {new Date(viewTicket.createdAt).toLocaleDateString()}</p>
              </div>
              <button onClick={() => setViewTicket(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-full">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <div className="p-8 space-y-5">
              <p className="text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-white/[0.02] rounded-2xl p-4">{viewTicket.description || 'No description provided.'}</p>
              {/* Assign agent */}
              {viewTicket.status !== 'resolved' && viewTicket.status !== 'closed' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Assign / Reassign Agent</label>
                  <select value={viewTicket.assignedTo || ''}
                    onChange={e => { assignAgent(viewTicket, e.target.value); setViewTicket({ ...viewTicket, assignedTo: e.target.value, status: 'assigned' }); }}
                    className="w-full px-5 py-3.5 rounded-2xl bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 transition-all">
                    <option value="">Unassigned</option>
                    {subManagers.map(sm => <option key={sm.id} value={sm.id}>{sm.name} (@{sm.username})</option>)}
                  </select>
                </div>
              )}
              {viewTicket.commissionOnResolve ? (
                <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-4 flex items-center justify-between">
                  <p className="text-[10px] font-bold text-amber-500/70 uppercase tracking-widest">Agent Commission on Resolve</p>
                  <p className="text-lg font-black text-amber-500">Rs. {viewTicket.commissionOnResolve.toLocaleString()}</p>
                </div>
              ) : null}
              <div className="flex gap-3 pt-2">
                {viewTicket.status === 'assigned' && (
                  <button onClick={() => resolveTicket(viewTicket)}
                    className="flex-1 py-4 rounded-2xl bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 transition-all">
                    ✓ Mark Resolved
                  </button>
                )}
                {viewTicket.status === 'resolved' && (
                  <button onClick={() => { onUpdateTicket(viewTicket.id, { status: 'closed' }); setViewTicket(null); }}
                    className="flex-1 py-4 rounded-2xl bg-slate-600 text-white text-[10px] font-bold uppercase tracking-widest hover:bg-slate-700 transition-all">
                    Close Ticket
                  </button>
                )}
                <button onClick={() => setViewTicket(null)}
                  className="flex-1 py-4 rounded-2xl bg-slate-100 dark:bg-white/5 text-slate-500 text-[10px] font-bold uppercase tracking-widest hover:bg-slate-200 transition-all">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ComplaintManager;
