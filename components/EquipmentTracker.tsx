import React, { useState, useMemo } from 'react';
import { EquipmentRecord, EquipmentType, EquipmentStatus, UserRecord } from '../types';

interface Props {
  equipment: EquipmentRecord[];
  users: UserRecord[];
  onAdd: (e: EquipmentRecord) => void;
  onUpdate: (id: string, updates: Partial<EquipmentRecord>) => void;
  onDelete: (id: string) => void;
}

const EQUIPMENT_TYPE_LABELS: Record<EquipmentType, string> = {
  router: '📡 Router',
  onu_ont: '🔌 ONU / ONT',
  media_converter: '🔄 Media Converter',
  switch: '🔀 Switch',
  cable: '🪢 Cable',
  power_adapter: '⚡ Power Adapter',
  other: '📦 Other',
};

const STATUS_CONFIG: Record<EquipmentStatus, { label: string; color: string; bg: string }> = {
  available:   { label: 'Available',   color: 'text-emerald-400', bg: 'bg-emerald-500/15 border-emerald-500/30' },
  deployed:    { label: 'Deployed',    color: 'text-blue-400',    bg: 'bg-blue-500/15 border-blue-500/30' },
  damaged:     { label: 'Damaged',     color: 'text-red-400',     bg: 'bg-red-500/15 border-red-500/30' },
  lost:        { label: 'Lost',        color: 'text-rose-400',    bg: 'bg-rose-500/15 border-rose-500/30' },
  maintenance: { label: 'Maintenance', color: 'text-yellow-400',  bg: 'bg-yellow-500/15 border-yellow-500/30' },
};

const emptyForm = (): Partial<EquipmentRecord> => ({
  serialNumber: '', brand: '', model: '',
  type: 'router', status: 'available',
  purchaseDate: '', purchasePrice: undefined, notes: '',
});

const generateId = () => `EQ-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

const EquipmentTracker: React.FC<Props> = ({ equipment, users, onAdd, onUpdate, onDelete }) => {
  const [view, setView] = useState<'list' | 'add' | 'edit' | 'assign' | 'detail'>('list');
  const [formData, setFormData] = useState<Partial<EquipmentRecord>>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailItem, setDetailItem] = useState<EquipmentRecord | null>(null);
  const [assignItem, setAssignItem] = useState<EquipmentRecord | null>(null);
  const [assignUserId, setAssignUserId] = useState('');
  const [assignDate, setAssignDate] = useState(new Date().toISOString().split('T')[0]);
  const [filterStatus, setFilterStatus] = useState<EquipmentStatus | 'all'>('all');
  const [filterType, setFilterType] = useState<EquipmentType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // ─── Stats ───────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:       equipment.length,
    available:   equipment.filter(e => e.status === 'available').length,
    deployed:    equipment.filter(e => e.status === 'deployed').length,
    damaged:     equipment.filter(e => e.status === 'damaged').length,
    lost:        equipment.filter(e => e.status === 'lost').length,
    maintenance: equipment.filter(e => e.status === 'maintenance').length,
    totalValue:  equipment.reduce((s, e) => s + (e.purchasePrice || 0), 0),
  }), [equipment]);

  // ─── Filtered list ───────────────────────────────────────
  const filtered = useMemo(() => {
    let list = [...equipment];
    if (filterStatus !== 'all') list = list.filter(e => e.status === filterStatus);
    if (filterType   !== 'all') list = list.filter(e => e.type   === filterType);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(e =>
        e.serialNumber.toLowerCase().includes(q) ||
        e.brand.toLowerCase().includes(q) ||
        e.model.toLowerCase().includes(q) ||
        (e.assignedToUserName || '').toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [equipment, filterStatus, filterType, search]);

  // ─── Save handlers ───────────────────────────────────────
  const handleSave = () => {
    if (!formData.serialNumber?.trim() || !formData.brand?.trim() || !formData.model?.trim()) {
      showToast('Serial number, brand aur model zaroori hain!'); return;
    }
    if (editingId) {
      onUpdate(editingId, formData);
      showToast('Equipment updated!');
    } else {
      onAdd({ ...formData, id: generateId(), createdAt: new Date().toISOString() } as EquipmentRecord);
      showToast('Equipment added!');
    }
    setFormData(emptyForm()); setEditingId(null); setView('list');
  };

  const handleAssign = () => {
    if (!assignItem || !assignUserId) { showToast('Customer select karo!'); return; }
    const user = users.find(u => u.id === assignUserId);
    onUpdate(assignItem.id, {
      status: 'deployed',
      assignedToUserId: assignUserId,
      assignedToUserName: user?.name || '',
      assignedDate: assignDate,
      returnDate: undefined,
    });
    showToast(`${assignItem.brand} ${assignItem.model} — ${user?.name} ko assign ho gaya!`);
    setAssignItem(null); setAssignUserId(''); setView('list');
  };

  const handleReturn = (item: EquipmentRecord) => {
    onUpdate(item.id, {
      status: 'available',
      assignedToUserId: undefined,
      assignedToUserName: undefined,
      returnDate: new Date().toISOString().split('T')[0],
    });
    showToast(`${item.brand} ${item.model} wapas available!`);
    if (detailItem?.id === item.id) setDetailItem({ ...item, status: 'available', assignedToUserId: undefined, assignedToUserName: undefined });
  };

  const StatCard = ({ label, value, color, onClick }: { label: string; value: number; color: string; onClick?: () => void }) => (
    <button onClick={onClick}
      className={`flex-1 min-w-[80px] bg-white/5 border border-white/10 rounded-2xl p-4 text-center hover:bg-white/10 transition-all active:scale-95 ${onClick ? 'cursor-pointer' : ''}`}>
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      <p className="text-[10px] font-bold text-white/50 uppercase tracking-wider mt-1">{label}</p>
    </button>
  );

  // ─── ASSIGN MODAL ─────────────────────────────────────────
  if (view === 'assign' && assignItem) return (
    <div className="min-h-screen bg-[#0b0f1a] text-white p-4 pb-24">
      <button onClick={() => setView('list')} className="flex items-center gap-2 text-white/50 hover:text-white mb-6 text-sm">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        Back
      </button>
      <h2 className="text-2xl font-black mb-1">Assign Equipment</h2>
      <p className="text-white/40 text-sm mb-6">{assignItem.brand} {assignItem.model} — {assignItem.serialNumber}</p>

      <div className="space-y-4">
        <div>
          <label className="text-xs font-bold text-white/50 uppercase tracking-wider block mb-2">Customer Select Karo</label>
          <select value={assignUserId} onChange={e => setAssignUserId(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500">
            <option value="">— Customer chunein —</option>
            {users.filter(u => u.status !== 'deleted').map(u => (
              <option key={u.id} value={u.id}>{u.name} — {u.phone}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-bold text-white/50 uppercase tracking-wider block mb-2">Assignment Date</label>
          <input type="date" value={assignDate} onChange={e => setAssignDate(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500" />
        </div>
        <button onClick={handleAssign}
          className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-95">
          ✅ Assign Karo
        </button>
      </div>
    </div>
  );

  // ─── ADD / EDIT FORM ─────────────────────────────────────
  if (view === 'add' || view === 'edit') return (
    <div className="min-h-screen bg-[#0b0f1a] text-white p-4 pb-24">
      <button onClick={() => { setView('list'); setFormData(emptyForm()); setEditingId(null); }}
        className="flex items-center gap-2 text-white/50 hover:text-white mb-6 text-sm">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        Back
      </button>
      <h2 className="text-2xl font-black mb-6">{editingId ? 'Equipment Edit Karo' : 'Naya Equipment Add Karo'}</h2>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-white/50 uppercase tracking-wider block mb-2">Brand *</label>
            <input value={formData.brand || ''} onChange={e => setFormData(p => ({ ...p, brand: e.target.value }))}
              placeholder="TP-Link, Huawei..." className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="text-xs font-bold text-white/50 uppercase tracking-wider block mb-2">Model *</label>
            <input value={formData.model || ''} onChange={e => setFormData(p => ({ ...p, model: e.target.value }))}
              placeholder="TL-WR840N..." className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm focus:outline-none focus:border-indigo-500" />
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-white/50 uppercase tracking-wider block mb-2">Serial Number *</label>
          <input value={formData.serialNumber || ''} onChange={e => setFormData(p => ({ ...p, serialNumber: e.target.value }))}
            placeholder="SN-XXXX-XXXX" className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500 font-mono" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-white/50 uppercase tracking-wider block mb-2">Type</label>
            <select value={formData.type} onChange={e => setFormData(p => ({ ...p, type: e.target.value as EquipmentType }))}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm focus:outline-none focus:border-indigo-500">
              {Object.entries(EQUIPMENT_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-bold text-white/50 uppercase tracking-wider block mb-2">Status</label>
            <select value={formData.status} onChange={e => setFormData(p => ({ ...p, status: e.target.value as EquipmentStatus }))}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm focus:outline-none focus:border-indigo-500">
              {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-bold text-white/50 uppercase tracking-wider block mb-2">Purchase Date</label>
            <input type="date" value={formData.purchaseDate || ''} onChange={e => setFormData(p => ({ ...p, purchaseDate: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="text-xs font-bold text-white/50 uppercase tracking-wider block mb-2">Price (Rs.)</label>
            <input type="number" value={formData.purchasePrice || ''} onChange={e => setFormData(p => ({ ...p, purchasePrice: Number(e.target.value) }))}
              placeholder="2500" className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-white text-sm focus:outline-none focus:border-indigo-500" />
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-white/50 uppercase tracking-wider block mb-2">Notes</label>
          <textarea value={formData.notes || ''} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))}
            placeholder="Koi khaas note..." rows={3}
            className="w-full bg-white/5 border border-white/10 rounded-2xl px-4 py-3 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none" />
        </div>

        <button onClick={handleSave}
          className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-95">
          {editingId ? '💾 Save Changes' : '➕ Add Equipment'}
        </button>
      </div>
    </div>
  );

  // ─── DETAIL VIEW ─────────────────────────────────────────
  if (view === 'detail' && detailItem) {
    const cfg = STATUS_CONFIG[detailItem.status];
    const customer = users.find(u => u.id === detailItem.assignedToUserId);
    return (
      <div className="min-h-screen bg-[#0b0f1a] text-white p-4 pb-24">
        <button onClick={() => setView('list')} className="flex items-center gap-2 text-white/50 hover:text-white mb-6 text-sm">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Back
        </button>

        <div className="bg-white/5 border border-white/10 rounded-3xl p-6 mb-4">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-3xl font-black">{detailItem.brand}</p>
              <p className="text-white/60 text-lg font-semibold">{detailItem.model}</p>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-black border ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-white/5 rounded-xl p-3">
              <p className="text-white/40 text-xs uppercase tracking-wider">Serial</p>
              <p className="font-mono font-bold mt-1">{detailItem.serialNumber}</p>
            </div>
            <div className="bg-white/5 rounded-xl p-3">
              <p className="text-white/40 text-xs uppercase tracking-wider">Type</p>
              <p className="font-bold mt-1">{EQUIPMENT_TYPE_LABELS[detailItem.type]}</p>
            </div>
            {detailItem.purchasePrice && (
              <div className="bg-white/5 rounded-xl p-3">
                <p className="text-white/40 text-xs uppercase tracking-wider">Purchase Price</p>
                <p className="font-bold mt-1 text-emerald-400">Rs. {detailItem.purchasePrice.toLocaleString()}</p>
              </div>
            )}
            {detailItem.purchaseDate && (
              <div className="bg-white/5 rounded-xl p-3">
                <p className="text-white/40 text-xs uppercase tracking-wider">Purchase Date</p>
                <p className="font-bold mt-1">{new Date(detailItem.purchaseDate).toLocaleDateString('en-PK')}</p>
              </div>
            )}
          </div>
          {detailItem.notes && (
            <div className="mt-3 bg-white/5 rounded-xl p-3 text-sm text-white/60">{detailItem.notes}</div>
          )}
        </div>

        {detailItem.status === 'deployed' && customer && (
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-3xl p-5 mb-4">
            <p className="text-xs font-black text-blue-400 uppercase tracking-wider mb-3">Assigned To</p>
            <p className="text-lg font-black">{customer.name}</p>
            <p className="text-white/50 text-sm">{customer.phone} • {customer.plan}</p>
            {detailItem.assignedDate && (
              <p className="text-white/40 text-xs mt-2">Since: {new Date(detailItem.assignedDate).toLocaleDateString('en-PK')}</p>
            )}
            <button onClick={() => handleReturn(detailItem)}
              className="mt-4 w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95">
              ↩️ Return / Wapas Lo
            </button>
          </div>
        )}

        {detailItem.status === 'available' && (
          <button onClick={() => { setAssignItem(detailItem); setView('assign'); }}
            className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-95 mb-3">
            📲 Customer Ko Assign Karo
          </button>
        )}

        <div className="flex gap-3 mt-2">
          <button onClick={() => {
            setFormData({ ...detailItem }); setEditingId(detailItem.id); setView('edit');
          }} className="flex-1 py-3 bg-white/5 border border-white/10 hover:bg-white/10 rounded-2xl font-bold text-sm transition-all">
            ✏️ Edit
          </button>
          <button onClick={() => setConfirmDelete(detailItem.id)}
            className="flex-1 py-3 bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 rounded-2xl font-bold text-sm transition-all">
            🗑️ Delete
          </button>
        </div>
      </div>
    );
  }

  // ─── MAIN LIST ───────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0b0f1a] text-white p-4 pb-24">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black">Equipment Tracker</h1>
          <p className="text-white/40 text-xs mt-0.5">Devices aur hardware ka record</p>
        </div>
        <button onClick={() => { setFormData(emptyForm()); setEditingId(null); setView('add'); }}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M12 5v14M5 12h14"/></svg>
          Add
        </button>
      </div>

      {/* Stats */}
      <div className="flex gap-3 mb-6 overflow-x-auto pb-2 scrollbar-hide">
        <StatCard label="Total"       value={stats.total}       color="text-white"        onClick={() => setFilterStatus('all')} />
        <StatCard label="Available"   value={stats.available}   color="text-emerald-400"  onClick={() => setFilterStatus('available')} />
        <StatCard label="Deployed"    value={stats.deployed}    color="text-blue-400"     onClick={() => setFilterStatus('deployed')} />
        <StatCard label="Damaged"     value={stats.damaged}     color="text-red-400"      onClick={() => setFilterStatus('damaged')} />
        <StatCard label="Lost"        value={stats.lost}        color="text-rose-400"     onClick={() => setFilterStatus('lost')} />
      </div>

      {/* Total Value */}
      {stats.totalValue > 0 && (
        <div className="bg-gradient-to-r from-indigo-600/20 to-purple-600/20 border border-indigo-500/20 rounded-2xl px-5 py-3 mb-4 flex items-center justify-between">
          <span className="text-xs font-bold text-white/50 uppercase tracking-wider">Total Inventory Value</span>
          <span className="text-lg font-black text-indigo-300">Rs. {stats.totalValue.toLocaleString()}</span>
        </div>
      )}

      {/* Search + Filters */}
      <div className="flex gap-2 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search serial, brand, customer..."
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500 placeholder-white/30" />
        <select value={filterType} onChange={e => setFilterType(e.target.value as any)}
          className="bg-white/5 border border-white/10 rounded-xl px-2 py-2.5 text-white text-xs focus:outline-none focus:border-indigo-500">
          <option value="all">All Types</option>
          {Object.entries(EQUIPMENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v.replace(/^.+? /, '')}</option>)}
        </select>
      </div>

      {/* Status filter pills */}
      <div className="flex gap-2 mb-5 overflow-x-auto pb-1 scrollbar-hide">
        {(['all', 'available', 'deployed', 'damaged', 'lost', 'maintenance'] as const).map(s => (
          <button key={s} onClick={() => setFilterStatus(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all border ${
              filterStatus === s
                ? 'bg-indigo-600 border-indigo-500 text-white'
                : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
            }`}>
            {s === 'all' ? 'All' : STATUS_CONFIG[s].label}
          </button>
        ))}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 text-white/30">
          <div className="text-5xl mb-4">📦</div>
          <p className="font-bold text-lg">Koi equipment nahi</p>
          <p className="text-sm mt-1">Pehla device add karo</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(item => {
            const cfg = STATUS_CONFIG[item.status];
            return (
              <button key={item.id} onClick={() => { setDetailItem(item); setView('detail'); }}
                className="w-full bg-white/5 border border-white/10 hover:bg-white/8 rounded-2xl p-4 text-left transition-all active:scale-[0.98]">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-white font-black text-base">{item.brand} {item.model}</span>
                    </div>
                    <p className="font-mono text-xs text-white/40 mb-2">{item.serialNumber}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-white/40">{EQUIPMENT_TYPE_LABELS[item.type]}</span>
                      {item.assignedToUserName && (
                        <span className="text-xs text-blue-300 bg-blue-500/10 px-2 py-0.5 rounded-full">
                          👤 {item.assignedToUserName}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 ml-3">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${cfg.bg} ${cfg.color}`}>
                      {cfg.label}
                    </span>
                    {item.purchasePrice && (
                      <span className="text-xs text-white/30">Rs. {item.purchasePrice.toLocaleString()}</span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Confirm Delete Modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setConfirmDelete(null)} />
          <div className="relative z-10 bg-slate-900 border border-white/10 rounded-3xl p-8 w-full max-w-sm text-center">
            <p className="text-lg font-black mb-2">Delete Equipment?</p>
            <p className="text-white/40 text-sm mb-6">Yeh action undo nahi ho sakti.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 py-3 bg-white/5 rounded-2xl font-bold text-sm">Cancel</button>
              <button onClick={() => { onDelete(confirmDelete); setConfirmDelete(null); setView('list'); showToast('Deleted!'); }}
                className="flex-1 py-3 bg-red-600 rounded-2xl font-bold text-sm text-white">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50">
          <div className="bg-emerald-600 text-white px-6 py-3 rounded-2xl shadow-2xl text-sm font-bold">{toast}</div>
        </div>
      )}
    </div>
  );
};

export default EquipmentTracker;
