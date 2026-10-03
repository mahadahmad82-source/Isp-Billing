import React, { useState, useMemo } from 'react';
import { OutageIncidentType, OutageLog, OutageSeverity, OutageConnectionScope } from '../types';
import { CheckIcon, DotIcon, GlobeIcon, MapPinIcon, UsersIcon } from './icons/UiIcons';

interface Props {
  outageLogs: OutageLog[];
  currentUser: string;
  totalUsers: number;
  onAdd: (log: OutageLog) => void;
  onUpdate: (id: string, updates: Partial<OutageLog>) => void;
  onDelete: (id: string) => void;
}

// ── Silk: severity chips use the warning/danger semantic tokens ──
const SEVERITY: Record<OutageSeverity, { label: string; iconColor: 'yellow' | 'orange' | 'red'; color: string; bg: string }> = {
  degraded: { label: 'Degraded',     iconColor: 'yellow', color: 'text-[var(--nb-warning)]', bg: 'bg-[var(--nb-surface-2)] border-[var(--nb-warning)]' },
  partial:  { label: 'Partial Down', iconColor: 'orange', color: 'text-[var(--nb-warning)]', bg: 'bg-[var(--nb-surface-2)] border-[var(--nb-warning)]' },
  full:     { label: 'Full Outage',  iconColor: 'red',    color: 'text-[var(--nb-danger)]',  bg: 'bg-[var(--nb-surface-2)] border-[var(--nb-danger)]' },
};

const INCIDENT_TYPES: Record<OutageIncidentType, string> = {
  outage: 'Internet Outage',
  slow: 'Slow Speed',
  maintenance: 'Maintenance',
  'fiber-cut': 'Fiber Cut',
  power: 'Power Issue',
  equipment: 'Equipment Fault (ISP Premises)',
  backend: 'Backend / Upstream Provider Issue',
  other: 'Other Network Issue',
};

const CONNECTION_TYPES: Record<OutageConnectionScope, string> = {
  all: 'All Connections (Fiber + Local)',
  fiber: 'Fiber Optic',
  local: 'Local Area (UTP/LAN/Ethernet)',
};

const CONNECTION_TYPE_LABEL: Record<OutageConnectionScope, string> = {
  all: 'All Connections',
  fiber: 'Fiber Only',
  local: 'Local Area Only',
};

;

const genId = () => `OUT-${Date.now()}-${Math.random().toString(36).slice(2,5).toUpperCase()}`;
const nowLocal = () => new Date().toISOString().slice(0,16);

const OutageTracker: React.FC<Props> = ({ outageLogs, currentUser, totalUsers, onAdd, onUpdate, onDelete }) => {
  const [view, setView] = useState<'list' | 'add' | 'detail'>('list');
  const [detail, setDetail] = useState<OutageLog | null>(null);
  const [form, setForm] = useState({ title: '', description: '', incidentType: 'outage' as OutageIncidentType, severity: 'full' as OutageSeverity, connectionType: 'all' as OutageConnectionScope, areasAffected: '', cause: '', estimatedResolution: '', backendProvider: '', customerMessage: '', exactCustomerMessage: false, affectedCount: '', startTime: nowLocal(), expiryHours: '2', notifyBot: true });
  const [resolveNote, setResolveNote] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string|null>(null);
  const [toast, setToast] = useState<string|null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const isExpired = (log: OutageLog) => !log.endTime && !!log.expiresAt && Date.parse(log.expiresAt) <= Date.now();
  const ongoing = useMemo(() => outageLogs.filter(o => !o.endTime && !isExpired(o)), [outageLogs]);
  const resolved = useMemo(() => outageLogs.filter(o => !!o.endTime || isExpired(o)).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [outageLogs]);

  const duration = (start: string, end?: string) => {
    const ms = new Date(end || new Date()).getTime() - new Date(start).getTime();
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const handleAdd = () => {
    if (!form.title.trim()) { showToast('Title is required.'); return; }
    if (form.exactCustomerMessage && !form.customerMessage.trim() && !form.description.trim()) { showToast('Exact message on hai — Customer Update ya Description mein message likhein.'); return; }
    const startMs = new Date(form.startTime).getTime();
    const expiryHours = Number(form.expiryHours);
    const expiresAt = Number.isFinite(startMs) && Number.isFinite(expiryHours) && expiryHours > 0
      ? new Date(startMs + expiryHours * 60 * 60 * 1000).toISOString()
      : undefined;
    const log: OutageLog = {
      id: genId(),
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      incidentType: form.incidentType,
      severity: form.severity,
      connectionType: form.connectionType,
      areasAffected: form.areasAffected.split(',').map(a => a.trim()).filter(Boolean),
      cause: form.cause.trim() || undefined,
      estimatedResolution: form.estimatedResolution.trim() || undefined,
      backendProvider: form.incidentType === 'backend' ? (form.backendProvider.trim() || undefined) : undefined,
      customerMessage: form.customerMessage.trim() || undefined,
      exactCustomerMessage: form.exactCustomerMessage || undefined,
      notifyBot: form.notifyBot,
      affectedCount: form.affectedCount ? Number(form.affectedCount) : undefined,
      startTime: new Date(form.startTime).toISOString(),
      expiresAt,
      createdAt: new Date().toISOString(),
      createdBy: currentUser,
    };
    onAdd(log);
    setForm({ title:'', description:'', incidentType:'outage', severity:'full', connectionType:'all', areasAffected:'', cause:'', estimatedResolution:'', backendProvider:'', customerMessage:'', exactCustomerMessage:false, affectedCount:'', startTime: nowLocal(), expiryHours:'2', notifyBot:true });
    showToast('Outage logged!');
    setView('list');
  };

  const handleResolve = (log: OutageLog) => {
    onUpdate(log.id, { endTime: new Date().toISOString(), resolvedBy: currentUser, resolutionNote: resolveNote.trim() || undefined, updatedAt: new Date().toISOString() });
    showToast('Outage resolved.');
    setResolveNote('');
    setDetail(null); setView('list');
  };

  // ── ADD FORM ───────────────────────────────────────────────
  if (view === 'add') return (
    <div className="bg-[var(--nb-bg)] text-[var(--nb-text-1)] p-4">
      <button onClick={() => setView('list')} className="flex items-center gap-2 text-[var(--nb-text-2)] hover:text-[var(--nb-text-1)] mb-6 text-sm min-h-[44px]">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        Back
      </button>
      <h2 className="text-[17px] font-semibold mb-6">Log New Outage</h2>

      <div className="space-y-4">
        <div>
          <label className={'text-xs font-bold text-[var(--nb-text-2)] uppercase tracking-wider block mb-2'}>Title *</label>
          <input value={form.title} onChange={e => setForm(p=>({...p,title:e.target.value}))}
            placeholder="e.g. Main Fiber Cut — Gulshan Area"
            className={'w-full bg-[var(--nb-surface-1)] border border-[var(--nb-border)] rounded-2xl px-4 py-3 text-[var(--nb-text-1)] text-sm focus:outline-none focus:border-[var(--nb-danger)]'}/>
        </div>






        <div>
          <label className={'text-xs font-bold text-[var(--nb-text-2)] uppercase tracking-wider block mb-2'}>Update Type</label>
          <select value={form.incidentType} onChange={e => setForm(p=>({...p,incidentType:e.target.value as OutageIncidentType}))}
            className={'w-full bg-[var(--nb-surface-1)] border border-[var(--nb-border)] rounded-xl px-3 py-3 text-[var(--nb-text-1)] text-sm focus:outline-none focus:border-[var(--nb-danger)]'}>
            {Object.entries(INCIDENT_TYPES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        {form.incidentType === 'backend' && (
          <div>
            <label className={'text-xs font-bold text-[var(--nb-text-2)] uppercase tracking-wider block mb-2'}>Backend Company Name</label>
            <input value={form.backendProvider} onChange={e => setForm(p=>({...p,backendProvider:e.target.value}))}
              placeholder="e.g. PTCL, Transworld, Multinet"
              className={'w-full bg-[var(--nb-surface-1)] border border-[var(--nb-border)] rounded-2xl px-4 py-3 text-[var(--nb-text-1)] text-sm focus:outline-none focus:border-[var(--nb-danger)]'}/>
            <p className={'text-[11px] mt-1 text-[var(--nb-text-3)]'}>NetBot customer ko batayega ke masla yahan se hai, local network ka nahi — complaint already lodge ho chuki hai.</p>
          </div>
        )}
        <div>
          <label className={'text-xs font-bold text-[var(--nb-text-2)] uppercase tracking-wider block mb-2'}>Connection Type</label>
          <select value={form.connectionType} onChange={e => setForm(p=>({...p,connectionType:e.target.value as OutageConnectionScope}))}
            className={'w-full bg-[var(--nb-surface-1)] border border-[var(--nb-border)] rounded-xl px-3 py-3 text-[var(--nb-text-1)] text-sm focus:outline-none focus:border-[var(--nb-danger)]'}>
            {Object.entries(CONNECTION_TYPES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <p className={'text-[11px] mt-1 text-[var(--nb-text-3)]'}>Kis connection type ko ye asar kar raha hai — NetBot isi se decide karta hai kisay ye notice bhejni hai.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={'text-xs font-bold text-[var(--nb-text-2)] uppercase tracking-wider block mb-2'}>Severity</label>
            <select value={form.severity} onChange={e => setForm(p=>({...p,severity:e.target.value as OutageSeverity}))}
              className={'w-full bg-[var(--nb-surface-1)] border border-[var(--nb-border)] rounded-xl px-3 py-3 text-[var(--nb-text-1)] text-sm focus:outline-none focus:border-[var(--nb-danger)]'}>
              {Object.entries(SEVERITY).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div>
            <label className={'text-xs font-bold text-[var(--nb-text-2)] uppercase tracking-wider block mb-2'}>Users Affected</label>
            <input type="number" value={form.affectedCount} onChange={e => setForm(p=>({...p,affectedCount:e.target.value}))}
              placeholder={`Max ${totalUsers}`}
              className={'w-full bg-[var(--nb-surface-1)] border border-[var(--nb-border)] rounded-xl px-3 py-3 text-[var(--nb-text-1)] text-sm focus:outline-none focus:border-[var(--nb-danger)]'}/>
          </div>
        </div>

        <div>
          <label className={'text-xs font-bold text-[var(--nb-text-2)] uppercase tracking-wider block mb-2'}>Areas Affected (comma separated)</label>
          <input value={form.areasAffected} onChange={e => setForm(p=>({...p,areasAffected:e.target.value}))}
            placeholder="Gulshan, DHA, Clifton — leave blank if not area-specific"
            className={'w-full bg-[var(--nb-surface-1)] border border-[var(--nb-border)] rounded-2xl px-4 py-3 text-[var(--nb-text-1)] text-sm focus:outline-none focus:border-[var(--nb-danger)]'}/>
          <p className={'text-[11px] mt-1 text-[var(--nb-text-3)]'}>Sirf asal jagah/zone ke naam yahan likhein (jaise Gulshan, DHA). Connection type (Fiber/Local) upar wale box se select karein.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={'text-xs font-bold text-[var(--nb-text-2)] uppercase tracking-wider block mb-2'}>{form.incidentType === 'backend' ? 'Backend Company ka ETA' : 'Expected Update / ETA'}</label>
            <input value={form.estimatedResolution} onChange={e => setForm(p=>({...p,estimatedResolution:e.target.value}))}
              placeholder="e.g. Aaj 8 baje tak"
              className={'w-full bg-[var(--nb-surface-1)] border border-[var(--nb-border)] rounded-xl px-3 py-3 text-[var(--nb-text-1)] text-sm focus:outline-none focus:border-[var(--nb-danger)]'}/>
          </div>
          <div>
            <label className={'text-xs font-bold text-[var(--nb-text-2)] uppercase tracking-wider block mb-2'}>Start Time</label>
          <input type="datetime-local" value={form.startTime} onChange={e => setForm(p=>({...p,startTime:e.target.value}))}
            className={'w-full bg-[var(--nb-surface-1)] border border-[var(--nb-border)] rounded-xl px-4 py-3 text-[var(--nb-text-1)] text-sm focus:outline-none focus:border-[var(--nb-danger)]'}/>
          </div>
        </div>

        <div>
          <label className={'text-xs font-bold text-[var(--nb-text-2)] uppercase tracking-wider block mb-2'}>NetBot Auto-Expiry (hours)</label>
          <input type="number" min="0.25" step="0.25" value={form.expiryHours} onChange={e => setForm(p=>({...p,expiryHours:e.target.value}))}
            placeholder="2"
            className={'w-full bg-[var(--nb-surface-1)] border border-[var(--nb-border)] rounded-xl px-3 py-3 text-[var(--nb-text-1)] text-sm focus:outline-none focus:border-[var(--nb-danger)]'}/>
          <p className={'text-[11px] mt-1 text-[var(--nb-text-3)]'}>Expiry ke baad NetBot complaints normally process karega.</p>
        </div>

        <div>
          <label className={'text-xs font-bold text-[var(--nb-text-2)] uppercase tracking-wider block mb-2'}>Cause / Description</label>
          <textarea value={form.description} onChange={e => setForm(p=>({...p,description:e.target.value}))} rows={3}
            placeholder="Kya hua tha..."
            className={'w-full bg-[var(--nb-surface-1)] border border-[var(--nb-border)] rounded-2xl px-4 py-3 text-[var(--nb-text-1)] text-sm focus:outline-none focus:border-[var(--nb-danger)] resize-none'}/>
        </div>

        <div>
          <label className={'text-xs font-bold text-[var(--nb-text-2)] uppercase tracking-wider block mb-2'}>Customer Update (optional)</label>
          <textarea value={form.customerMessage} onChange={e => setForm(p=>({...p,customerMessage:e.target.value}))} rows={3}
            placeholder="Customer ko jo exact Roman Urdu update dena ho..."
            className={'w-full bg-[var(--nb-surface-1)] border border-[var(--nb-border)] rounded-2xl px-4 py-3 text-[var(--nb-text-1)] text-sm focus:outline-none focus:border-[var(--nb-danger)] resize-none'}/>
        </div>

        <label className={'flex items-center gap-3 bg-[var(--nb-surface-1)] border border-[var(--nb-border)] rounded-2xl px-4 py-3 text-sm'}>
          <input type="checkbox" checked={form.exactCustomerMessage} onChange={e => setForm(p=>({...p,exactCustomerMessage:e.target.checked}))} className="w-4 h-4 accent-[var(--nb-danger)]" />
          <span><strong>Send my message exactly as written</strong><span className={'block text-xs mt-0.5 text-[var(--nb-text-2)]'}>On: NetBot customers ko aap ka apna message (Customer Update, khali ho to Description) bilkul waisa hi bhejega — template ya AI rewrite nahi.</span></span>
        </label>

        <label className={'flex items-center gap-3 bg-[var(--nb-surface-1)] border border-[var(--nb-border)] rounded-2xl px-4 py-3 text-sm'}>
          <input type="checkbox" checked={form.notifyBot} onChange={e => setForm(p=>({...p,notifyBot:e.target.checked}))} className="w-4 h-4 accent-[var(--nb-danger)]" />
          <span><strong>Use this update in NetBot</strong><span className={'block text-xs mt-0.5 text-[var(--nb-text-2)]'}>Off karne par record history mein rahega, bot isay use nahi karega.</span></span>
        </label>

        <button onClick={handleAdd}
          className="w-full py-4 min-h-[48px] bg-[var(--nb-danger)] text-white rounded-full font-black text-sm uppercase tracking-widest transition-all active:scale-[0.97]">
          Log Outage
        </button>
      </div>
    </div>
  );

  // ── DETAIL VIEW ────────────────────────────────────────────
  if (view === 'detail' && detail) {
    const cfg = SEVERITY[detail.severity];
    const isOngoing = !detail.endTime && !isExpired(detail);
    return (
      <div className="bg-[var(--nb-bg)] text-[var(--nb-text-1)] p-4">
        <button onClick={() => { setView('list'); setDetail(null); }}
          className="flex items-center gap-2 text-[var(--nb-text-2)] hover:text-[var(--nb-text-1)] mb-6 text-sm min-h-[44px]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back
        </button>

        {isOngoing && (
          <div className="bg-[var(--nb-surface-2)] border border-[var(--nb-danger)] rounded-2xl px-4 py-2 mb-4 flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--nb-danger)] animate-pulse"/>
            <span className="text-[var(--nb-danger)] font-black text-xs uppercase tracking-wider">Live Outage — {duration(detail.startTime)} ago</span>
          </div>
        )}

        <div className={'bg-[var(--nb-surface-1)] border border-[var(--nb-border)] rounded-2xl p-6 mb-4'}>
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1 mr-3">
              <h2 className="text-[17px] font-semibold">{detail.title}</h2>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className={'text-xs text-[var(--nb-text-2)]'}>{INCIDENT_TYPES[detail.incidentType || 'outage']}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${(detail.connectionType || 'all') === 'all' ? 'bg-[var(--nb-surface-2)] border-[var(--nb-border)] text-[var(--nb-text-2)]' : 'bg-[var(--nb-surface-2)] border-[var(--nb-info)] text-[var(--nb-info)]'}`}>
                  {CONNECTION_TYPE_LABEL[detail.connectionType || 'all']}
                </span>
              </div>
            </div>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black border ${cfg.bg} ${cfg.color}`}><DotIcon color={cfg.iconColor} />{cfg.label}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className={'bg-[var(--nb-surface-1)] rounded-xl p-3'}>
              <p className={'text-[var(--nb-text-2)] text-xs'}>Start Time</p>
              <p className="font-semibold mt-1 text-xs">{new Date(detail.startTime).toLocaleString('en-PK')}</p>
            </div>
            {detail.endTime ? (
              <div className="bg-[var(--nb-surface-2)] rounded-xl p-3">
                <p className="text-[var(--nb-success)] text-xs">Resolved At</p>
                <p className="font-semibold mt-1 text-xs">{new Date(detail.endTime).toLocaleString('en-PK')}</p>
              </div>
            ) : (
              <div className="bg-[var(--nb-surface-2)] rounded-xl p-3">
                <p className="text-[var(--nb-danger)] text-xs">Duration</p>
                <p className="font-black mt-1 text-[var(--nb-danger)]">{duration(detail.startTime)}</p>
              </div>
            )}
            {detail.expiresAt && !detail.endTime && (
              <div className={'bg-[var(--nb-surface-2)] rounded-xl p-3'}>
                <p className={'text-[var(--nb-warning)] text-xs'}>NetBot Auto-Expiry</p>
                <p className={'font-semibold mt-1 text-xs text-[var(--nb-text-1)]'}>{new Date(detail.expiresAt).toLocaleString('en-PK')}{isExpired(detail) ? ' — expired' : ''}</p>
              </div>
            )}
            {detail.affectedCount && (
              <div className={'bg-[var(--nb-surface-1)] rounded-xl p-3'}>
                <p className={'text-[var(--nb-text-2)] text-xs'}>Users Affected</p>
                <p className="font-black mt-1 text-[var(--nb-warning)]">{detail.affectedCount}</p>
              </div>
            )}
            {detail.estimatedResolution && !detail.endTime && (
              <div className="bg-[var(--nb-surface-2)] rounded-xl p-3">
                <p className="text-[var(--nb-warning)] text-xs">Expected Update</p>
                <p className="font-semibold mt-1 text-xs">{detail.estimatedResolution}</p>
              </div>
            )}
            <div className={'bg-[var(--nb-surface-1)] rounded-xl p-3'}>
              <p className={'text-[var(--nb-text-2)] text-xs'}>NetBot</p>
              <p className={'font-semibold mt-1 text-xs ' + (detail.notifyBot === false ? 'text-[var(--nb-text-3)]' : 'text-[var(--nb-success)]')}>{detail.notifyBot === false ? 'Not using update' : 'Using update'}</p>
            </div>
            {detail.estimatedResolution && !detail.endTime && (
              <div className="bg-[var(--nb-surface-2)] rounded-xl p-3">
                <p className="text-[var(--nb-warning)] text-xs">{detail.incidentType === 'backend' ? 'Backend Company ka ETA' : 'Expected Update'}</p>
                <p className="font-semibold mt-1 text-xs">{detail.estimatedResolution}</p>
              </div>
            )}
            {detail.incidentType === 'backend' && detail.backendProvider && (
              <div className="bg-sky-500/10 rounded-xl p-3">
                <p className="text-sky-400 text-xs">Backend Company</p>
                <p className="font-semibold mt-1 text-xs">{detail.backendProvider}</p>
              </div>
            )}
            <div className={'bg-[var(--nb-surface-1)] rounded-xl p-3'}>
              <p className={'text-[var(--nb-text-2)] text-xs'}>NetBot</p>
              <p className={'font-semibold mt-1 text-xs ' + (detail.notifyBot === false ? 'text-[var(--nb-text-3)]' : 'text-[var(--nb-success)]')}>{detail.notifyBot === false ? 'Not using update' : 'Using update'}</p>
            </div>
            {detail.resolvedBy && (
              <div className={'bg-[var(--nb-surface-1)] rounded-xl p-3'}>
                <p className={'text-[var(--nb-text-2)] text-xs'}>Resolved By</p>
                <p className="font-semibold mt-1">{detail.resolvedBy}</p>
              </div>
            )}
            {detail.areasAffected.length > 0 && (
              <div className={'col-span-2 bg-[var(--nb-surface-1)] rounded-xl p-3'}>
                <p className={'text-[var(--nb-text-2)] text-xs mb-2'}>Areas Affected</p>
                <div className="flex flex-wrap gap-2">
                  {detail.areasAffected.map(a => (
                    <span key={a} className="px-2 py-1 bg-[var(--nb-surface-2)] border border-[var(--nb-warning)] text-[var(--nb-warning)] rounded-lg text-xs font-bold">{a}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
          {detail.description && <p className={'mt-3 text-sm text-[var(--nb-text-2)] bg-[var(--nb-surface-1)] rounded-xl p-3'}>{detail.description}</p>}
          {detail.exactCustomerMessage && <p className={'mt-3 text-xs font-bold uppercase tracking-wider text-[var(--nb-warning)]'}>NetBot sends your message exactly as written</p>}
          {detail.customerMessage && <div className={'mt-3 text-sm text-[var(--nb-success)] bg-[var(--nb-surface-2)] rounded-xl p-3'}><p className="text-xs font-bold uppercase tracking-wider mb-1 opacity-70">Customer Message</p>{detail.customerMessage}</div>}
          {detail.resolutionNote && <div className={'mt-3 text-sm text-[var(--nb-text-2)] bg-[var(--nb-surface-1)] rounded-xl p-3'}><p className="text-xs font-bold uppercase tracking-wider mb-1 opacity-70">Resolution Note</p>{detail.resolutionNote}</div>}
        </div>

        {isOngoing && (
          <div className={'bg-[var(--nb-surface-1)] border border-[var(--nb-border)] rounded-2xl p-4 mb-4'}>
            <p className={'text-xs font-bold text-[var(--nb-text-2)] uppercase tracking-wider mb-3'}>Resolve Outage</p>
            <textarea value={resolveNote} onChange={e => setResolveNote(e.target.value)} rows={2}
              placeholder="Resolution details / cause..."
              className={'w-full bg-[var(--nb-surface-1)] border border-[var(--nb-border)] rounded-xl px-3 py-2.5 text-[var(--nb-text-1)] text-sm focus:outline-none focus:border-[var(--nb-success)] resize-none mb-3'}/>
            <button onClick={() => handleResolve(detail)}
              className="w-full py-3.5 min-h-[48px] bg-[var(--nb-success)] text-white rounded-full font-black text-sm uppercase tracking-widest transition-all active:scale-[0.97]">
              Mark Resolved
            </button>
          </div>
        )}

        <button onClick={() => setConfirmDelete(detail.id)}
          className="w-full py-3 min-h-[44px] bg-[var(--nb-surface-2)] border border-[var(--nb-danger)] text-[var(--nb-danger)] rounded-2xl font-bold text-sm">
          Delete Log
        </button>

        {confirmDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-[var(--nb-scrim)]" onClick={() => setConfirmDelete(null)}/>
            <div className={'relative z-10 bg-[var(--nb-surface-1)] border border-[var(--nb-border)] rounded-2xl p-8 w-full max-w-sm text-center'}>
              <p className="text-[17px] font-semibold mb-4">Delete Outage Log?</p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmDelete(null)} className={'flex-1 py-3 min-h-[44px] bg-[var(--nb-surface-3)] rounded-2xl font-bold text-sm'}>Cancel</button>
                <button onClick={() => { onDelete(confirmDelete); setConfirmDelete(null); setView('list'); }} className="flex-1 py-3 min-h-[44px] bg-[var(--nb-danger)] text-white rounded-2xl font-bold text-sm">Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── MAIN LIST ──────────────────────────────────────────────
  return (
    <div className="bg-[var(--nb-bg)] text-[var(--nb-text-1)] p-4">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-[17px] font-semibold">Outage Tracker</h1>
          <p className={'text-[var(--nb-text-2)] text-xs mt-0.5'}>Network downtime ka record</p>
        </div>
        <button onClick={() => setView('add')}
          className="bg-[var(--nb-danger)] text-white px-4 py-3 min-h-[44px] rounded-full font-black text-xs uppercase tracking-widest transition-all active:scale-[0.97]">
          + Log
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className={'rounded-2xl p-4 text-center border ' + (ongoing.length > 0 ? 'bg-[var(--nb-surface-2)] border-[var(--nb-danger)]' : 'bg-[var(--nb-surface-1)] border-[var(--nb-border)]')}>
          <p className={'text-2xl font-black ' + (ongoing.length > 0 ? 'text-[var(--nb-danger)]' : 'text-[var(--nb-text-1)]')}>{ongoing.length}</p>
          <p className={'text-[10px] text-[var(--nb-text-2)] font-bold uppercase tracking-wider mt-1'}>Ongoing</p>
        </div>
        <div className={'bg-[var(--nb-surface-1)] border border-[var(--nb-border)] rounded-2xl p-4 text-center'}>
          <p className="text-2xl font-black">{outageLogs.length}</p>
          <p className={'text-[10px] text-[var(--nb-text-2)] font-bold uppercase tracking-wider mt-1'}>Total Logged</p>
        </div>
        <div className={'bg-[var(--nb-surface-1)] border border-[var(--nb-border)] rounded-2xl p-4 text-center'}>
          <p className="text-2xl font-black text-[var(--nb-success)]">{resolved.length}</p>
          <p className={'text-[10px] text-[var(--nb-text-2)] font-bold uppercase tracking-wider mt-1'}>Resolved</p>
        </div>
      </div>

      {/* Ongoing outages */}
      {ongoing.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-black text-[var(--nb-danger)] uppercase tracking-wider mb-3 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--nb-danger)] animate-pulse"/>
            Live Outages
          </p>
          {ongoing.map(o => {
            const cfg = SEVERITY[o.severity];
            return (
              <button key={o.id} onClick={() => { setDetail(o); setView('detail'); }}
                className="w-full bg-[var(--nb-surface-2)] border border-[var(--nb-danger)] rounded-2xl p-4 text-left mb-3 hover:bg-[var(--nb-surface-3)] transition-all active:scale-[0.98]">
                <div className="flex items-start justify-between mb-2">
                  <p className="font-black text-base flex-1 mr-2">{o.title}</p>
                  <span className={`px-2 py-1 rounded-full text-[10px] font-black border ${cfg.bg} ${cfg.color}`}><span className="inline-flex items-center gap-1.5"><DotIcon color={cfg.iconColor} />{cfg.label}</span></span>
                </div>
                <div className={'flex gap-3 text-xs text-[var(--nb-text-2)] flex-wrap'}>
                  <span className="inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[var(--nb-text-3)]" />{duration(o.startTime)}</span>
                  <span>{INCIDENT_TYPES[o.incidentType || 'outage']}</span>
                  {(o.connectionType && o.connectionType !== 'all') && <span className="inline-flex items-center gap-1 text-[var(--nb-info)]">{CONNECTION_TYPE_LABEL[o.connectionType]}</span>}
                  {o.affectedCount && <span className="inline-flex items-center gap-1"><UsersIcon className="w-3 h-3" />{o.affectedCount} users</span>}
                  {o.areasAffected.length > 0 && <span className="inline-flex items-center gap-1"><MapPinIcon className="w-3 h-3" />{o.areasAffected.slice(0,2).join(', ')}{o.areasAffected.length > 2 ? '...' : ''}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Resolved history */}
      {resolved.length > 0 && (
        <div>
          <p className={'text-xs font-black text-[var(--nb-text-2)] uppercase tracking-wider mb-3'}>Resolved History</p>
          <div className="space-y-3">
            {resolved.map(o => {
              const cfg = SEVERITY[o.severity];
              return (
                <button key={o.id} onClick={() => { setDetail(o); setView('detail'); }}
                  className={'w-full bg-[var(--nb-surface-1)] border border-[var(--nb-border)] rounded-2xl p-4 text-left hover:bg-[var(--nb-surface-2)] transition-all active:scale-[0.98]'}>
                  <div className="flex items-start justify-between mb-2">
                    <p className={'font-bold text-sm flex-1 mr-2 text-[var(--nb-text-1)]'}>{o.title}</p>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${cfg.bg} ${cfg.color}`}><DotIcon color={cfg.iconColor} /></span>
                  </div>
                  <div className={'flex gap-3 text-xs text-[var(--nb-text-3)] flex-wrap'}>
                    <span className="inline-flex items-center gap-1"><CheckIcon className="w-3 h-3 text-[var(--nb-success)]" />{duration(o.startTime, o.endTime || o.expiresAt)}</span>
                    <span>• {new Date(o.startTime).toLocaleDateString('en-PK', {day:'2-digit',month:'short'})}</span>
                    {o.affectedCount && <span>• {o.affectedCount} users</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {outageLogs.length === 0 && (
        <div className={'text-center py-20 text-[var(--nb-text-3)]'}>
          <div className="text-[var(--nb-text-3)] mb-4"><GlobeIcon className="w-12 h-12 mx-auto" /></div>
          <p className="font-bold text-lg">No outages reported.</p>
          <p className="text-sm mt-1">Everything is working normally.</p>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
          <div className={'bg-[var(--nb-surface-3)] border border-[var(--nb-border)] text-[var(--nb-text-1)] px-6 py-3 rounded-2xl shadow-2xl text-sm font-bold'}>{toast}</div>
        </div>
      )}
    </div>
  );
};

export default OutageTracker;
