import React, { useState } from 'react';
import { SubManagerAccount, AccessRights, ModuleKey, MODULE_LABELS } from '../../types';
import { ALL_MODULE_KEYS, getDefaultAccessRights } from '../../utils/accessControl';

interface EditGranularRightsProps {
  agent: SubManagerAccount;
  areas: string[];
  onClose: () => void;
  onSave: (id: string, updates: Partial<SubManagerAccount>) => void;
}

const ACTIONS: (keyof AccessRights)[] = ['view', 'create', 'edit', 'delete', 'receipt'];
const ACTION_LABELS: Record<string, string> = { view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete', receipt: 'Receipt' };
// Receipt column only makes sense for these two modules — greyed out ("—") elsewhere.
const RECEIPT_RELEVANT: ModuleKey[] = ['receipts', 'recoveries'];

const EditGranularRights: React.FC<EditGranularRightsProps> = ({ agent, areas, onClose, onSave }) => {
  const [assignedAreas, setAssignedAreas] = useState<string[]>(agent.assignedAreas || []);
  const [rights, setRights] = useState<Record<ModuleKey, AccessRights>>(
    agent.accessRights || getDefaultAccessRights(true)
  );

  const toggle = (mod: ModuleKey, action: keyof AccessRights) => {
    setRights(prev => ({
      ...prev,
      [mod]: { ...prev[mod], [action]: !prev[mod]?.[action] },
    }));
  };

  const bulkSet = (value: boolean) => {
    const next = {} as Record<ModuleKey, AccessRights>;
    ALL_MODULE_KEYS.forEach(mod => {
      next[mod] = { view: value, create: value, edit: value, delete: value, receipt: value };
    });
    setRights(next);
  };

  const viewOnly = () => {
    const next = {} as Record<ModuleKey, AccessRights>;
    ALL_MODULE_KEYS.forEach(mod => {
      next[mod] = { view: true, create: false, edit: false, delete: false, receipt: false };
    });
    setRights(next);
  };

  const toggleArea = (area: string) => {
    setAssignedAreas(prev => prev.includes(area) ? prev.filter(a => a !== area) : [...prev, area]);
  };

  const handleSave = () => {
    onSave(agent.id, { assignedAreas, accessRights: rights });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-white/10 w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
        <div className="p-6 border-b border-slate-100 dark:border-white/10 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Access Rights — {agent.name || agent.username}</h3>
            <p className="text-xs text-slate-400 mt-0.5">Control what this agent can see and do, module by module</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 rounded-xl transition-all">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {/* Assigned Areas */}
          <div>
            <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Assigned Areas</p>
            <p className="text-[11px] text-slate-400 mb-3">Leave all unchecked to allow all areas (no lock).</p>
            {areas.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No areas defined yet in Settings → Areas.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {areas.map(area => (
                  <button
                    key={area}
                    type="button"
                    onClick={() => toggleArea(area)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                      assignedAreas.includes(area)
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-300'
                    }`}
                  >
                    {area}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Access Rights Matrix */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Access Rights Matrix</p>
              <div className="flex gap-2">
                <button onClick={() => bulkSet(true)} className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold uppercase tracking-wide transition-all">Grant All</button>
                <button onClick={viewOnly} className="px-3 py-1 rounded-lg bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 text-slate-700 dark:text-white text-[10px] font-bold uppercase tracking-wide transition-all">View Only</button>
                <button onClick={() => bulkSet(false)} className="px-3 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 text-[10px] font-bold uppercase tracking-wide transition-all">Clear All</button>
              </div>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-100 dark:border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-white/[0.03] text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                  <tr>
                    <th className="px-4 py-3">Module</th>
                    {ACTIONS.map(a => (
                      <th key={a} className="px-3 py-3 text-center">{ACTION_LABELS[a]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-white/5">
                  {ALL_MODULE_KEYS.map(mod => (
                    <tr key={mod}>
                      <td className="px-4 py-2.5 font-semibold text-slate-700 dark:text-slate-200">{MODULE_LABELS[mod]}</td>
                      {ACTIONS.map(action => {
                        const notApplicable = action === 'receipt' && !RECEIPT_RELEVANT.includes(mod);
                        if (notApplicable) {
                          return <td key={action} className="px-3 py-2.5 text-center text-slate-300 dark:text-slate-600">—</td>;
                        }
                        const granted = !!rights[mod]?.[action];
                        return (
                          <td key={action} className="px-3 py-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => toggle(mod, action)}
                              className={`inline-flex items-center justify-center w-6 h-6 rounded-full border text-[10px] font-bold transition-all ${
                                granted
                                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                                  : 'bg-slate-50 dark:bg-white/5 text-slate-300 dark:text-slate-600 border-slate-200 dark:border-white/10'
                              }`}
                            >
                              {granted ? '✓' : ''}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-slate-100 dark:border-white/10 flex gap-3">
          <button onClick={onClose} className="flex-1 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-all">Cancel</button>
          <button onClick={handleSave} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-all">Save Rights</button>
        </div>
      </div>
    </div>
  );
};

export default EditGranularRights;
