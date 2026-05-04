import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { UserRecord } from '../types';

interface QuickActivateProps {
  users: UserRecord[];
  onActivateUsers: (userIds: string[]) => void;
  onClose: () => void;
  theme: 'light' | 'dark';
  currentMonth: string;
}

const QuickActivate: React.FC<QuickActivateProps> = ({
  users, onActivateUsers, onClose, theme, currentMonth
}) => {
  const isDark = theme === 'dark';
  const [tab, setTab] = useState<'paste' | 'select' | 'excel'>('paste');
  const [pastedUsernames, setPastedUsernames] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [result, setResult] = useState<{ found: string[]; notFound: string[] } | null>(null);
  const [excelLoading, setExcelLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelLoading(true);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        // Extract all cell values, flatten, clean
        const allValues = rows
          .flat()
          .map((v: any) => String(v || '').trim().toLowerCase())
          .filter(v => v && v !== 'username' && v !== 'user' && v !== 'id' && v !== 'name');

        // Match against users
        const found: string[] = [];
        const notFound: string[] = [];
        const toActivate: string[] = [];

        allValues.forEach(val => {
          const user = users.find(u =>
            u.username.toLowerCase() === val ||
            u.name.toLowerCase() === val
          );
          if (user) {
            found.push(user.username);
            if (!alreadyActiveIds.has(user.id)) toActivate.push(user.id);
          } else {
            notFound.push(val);
          }
        });

        setResult({ found, notFound });
        if (toActivate.length > 0) onActivateUsers(toActivate);
      } catch (err) {
        alert('File read nahi hoi — Excel format check karein');
      } finally {
        setExcelLoading(false);
        // Reset file input
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  // Already active this month
  const alreadyActiveIds = useMemo(() =>
    new Set(users.filter(u => (u.activatedMonths || []).includes(currentMonth)).map(u => u.id)),
    [users, currentMonth]
  );

  // Not yet active this month
  const inactiveUsers = useMemo(() =>
    users.filter(u => !alreadyActiveIds.has(u.id)),
    [users, alreadyActiveIds]
  );

  const filteredInactive = useMemo(() =>
    inactiveUsers.filter(u =>
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.phone.includes(searchTerm)
    ),
    [inactiveUsers, searchTerm]
  );

  const handlePasteActivate = () => {
    const lines = pastedUsernames.split(/[\n,;]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
    const found: string[] = [];
    const notFound: string[] = [];
    const toActivate: string[] = [];

    lines.forEach(uname => {
      const user = users.find(u =>
        u.username.toLowerCase() === uname ||
        u.name.toLowerCase() === uname
      );
      if (user) {
        found.push(user.username);
        if (!alreadyActiveIds.has(user.id)) toActivate.push(user.id);
      } else {
        notFound.push(uname);
      }
    });

    setResult({ found, notFound });
    if (toActivate.length > 0) onActivateUsers(toActivate);
  };

  const handleSelectActivate = () => {
    const toActivate = Array.from(selectedIds).filter(id => !alreadyActiveIds.has(id));
    if (toActivate.length > 0) {
      onActivateUsers(toActivate);
      setResult({ found: toActivate.map(id => users.find(u => u.id === id)?.username || ''), notFound: [] });
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(filteredInactive.map(u => u.id)));
  const clearAll = () => setSelectedIds(new Set());

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 sm:p-6"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}>
      <div className={`w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden border max-h-[90vh] flex flex-col
        ${isDark ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-200'}`}>

        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-white font-black text-lg uppercase tracking-tight">⚡ Quick Activate</h2>
              <p className="text-white/70 text-xs mt-0.5">{currentMonth} ke liye users activate karo</p>
            </div>
            <button onClick={onClose} className="text-white/60 hover:text-white text-xl">✕</button>
          </div>

          {/* Stats */}
          <div className="flex gap-4 mt-4">
            <div className="bg-white/10 rounded-xl px-3 py-2 text-center">
              <div className="text-white font-black text-lg">{users.length}</div>
              <div className="text-white/60 text-[9px] uppercase font-black tracking-widest">Total Users</div>
            </div>
            <div className="bg-white/10 rounded-xl px-3 py-2 text-center">
              <div className="text-emerald-300 font-black text-lg">{alreadyActiveIds.size}</div>
              <div className="text-white/60 text-[9px] uppercase font-black tracking-widest">Already Active</div>
            </div>
            <div className="bg-white/10 rounded-xl px-3 py-2 text-center">
              <div className="text-amber-300 font-black text-lg">{inactiveUsers.length}</div>
              <div className="text-white/60 text-[9px] uppercase font-black tracking-widest">Pending</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className={`flex border-b ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
          {[
            { id: 'paste', label: '📋 Username Paste Karo' },
            { id: 'select', label: '☑️ List se Select Karo' },
          { id: 'excel', label: '📊 Excel Upload' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id as any)}
              className={`flex-1 py-3 text-xs font-black uppercase tracking-widest transition-all border-b-2 ${
                tab === t.id
                  ? 'border-indigo-500 text-indigo-500'
                  : `border-transparent ${isDark ? 'text-slate-500' : 'text-slate-400'}`
              }`}>{t.label}</button>
          ))}
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-5">

          {/* Result message */}
          {result && (
            <div className={`rounded-2xl p-4 mb-4 ${result.notFound.length > 0 ? 'bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20' : 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20'}`}>
              {result.found.length > 0 && (
                <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 mb-1">
                  ✅ {result.found.length} users activate ho gaye!
                </p>
              )}
              {result.notFound.length > 0 && (
                <p className="text-xs font-black text-amber-600 dark:text-amber-400">
                  ⚠️ Nahi mile: {result.notFound.join(', ')}
                </p>
              )}
              <button onClick={() => { setResult(null); onClose(); }}
                className="mt-2 w-full py-2 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest">
                Done ✓
              </button>
            </div>
          )}

          {/* PASTE TAB */}
          {!result && tab === 'paste' && (
            <div className="space-y-4">
              <div>
                <label className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Usernames paste karo (har line mein ek, ya comma se separate)
                </label>
                <textarea
                  value={pastedUsernames}
                  onChange={e => setPastedUsernames(e.target.value)}
                  placeholder={`FC001\nFC002\nFC003\n\nYa:\nFC001, FC002, FC003`}
                  rows={8}
                  className={`w-full px-4 py-3 rounded-2xl border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none
                    ${isDark ? 'bg-white/5 border-white/10 text-white placeholder-slate-600' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'}`}
                />
                <p className={`text-[10px] mt-1 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                  {pastedUsernames.split(/[\n,;]+/).filter(s => s.trim()).length} usernames detected
                </p>
              </div>

              <div className={`rounded-2xl p-4 ${isDark ? 'bg-white/5' : 'bg-indigo-50'} border ${isDark ? 'border-white/10' : 'border-indigo-100'}`}>
                <p className={`text-xs font-black ${isDark ? 'text-slate-400' : 'text-indigo-700'} mb-1`}>💡 Kya hoga activate karne ke baad:</p>
                <ul className={`text-xs space-y-1 ${isDark ? 'text-slate-500' : 'text-indigo-600'}`}>
                  <li>• User current month ({currentMonth}) mein add ho jayega</li>
                  <li>• Purana plan, fees, aur balance copy hoga</li>
                  <li>• Aap directly receipt generate kar sakte ho</li>
                </ul>
              </div>

              <button
                onClick={handlePasteActivate}
                disabled={!pastedUsernames.trim()}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-sm font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-40"
              >
                ⚡ Activate Karo
              </button>
            </div>
          )}

          {/* EXCEL TAB */}
          {!result && tab === 'excel' && (
            <div className="space-y-4">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleExcelUpload}
                className="hidden"
              />

              {/* Upload Area */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all
                  ${isDark ? 'border-white/20 hover:border-indigo-500 hover:bg-indigo-500/5' : 'border-slate-300 hover:border-indigo-400 hover:bg-indigo-50'}`}
              >
                {excelLoading ? (
                  <div className="space-y-2">
                    <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p className={`text-xs font-black uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Processing...</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="text-4xl">📊</div>
                    <div>
                      <p className={`text-sm font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>Excel / CSV File Upload Karo</p>
                      <p className={`text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Click karein ya file drag karein</p>
                    </div>
                    <p className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>.xlsx · .xls · .csv</p>
                  </div>
                )}
              </div>

              {/* Format Guide */}
              <div className={`rounded-2xl p-4 ${isDark ? 'bg-white/5 border border-white/10' : 'bg-slate-50 border border-slate-200'}`}>
                <p className={`text-[10px] font-black uppercase tracking-widest mb-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>📋 Excel Format</p>
                <div className={`rounded-xl overflow-hidden border ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                  <table className="w-full text-xs">
                    <thead className={`${isDark ? 'bg-white/10 text-slate-300' : 'bg-slate-100 text-slate-600'} font-black`}>
                      <tr>
                        <th className="px-3 py-2 text-left">A (Username)</th>
                        <th className="px-3 py-2 text-left">B (Optional)</th>
                      </tr>
                    </thead>
                    <tbody className={`${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      <tr className={`border-t ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                        <td className="px-3 py-1.5 font-mono">FC001</td>
                        <td className="px-3 py-1.5 text-slate-400">Ali Hassan</td>
                      </tr>
                      <tr className={`border-t ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                        <td className="px-3 py-1.5 font-mono">FC002</td>
                        <td className="px-3 py-1.5 text-slate-400">Sara Khan</td>
                      </tr>
                      <tr className={`border-t ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                        <td className="px-3 py-1.5 font-mono">FC003</td>
                        <td className="px-3 py-1.5 text-slate-400">Ahmed Ali</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className={`text-[10px] mt-2 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                  💡 Sirf usernames hone chahiye — koi extra info zaroori nahi. System automatically match karega!
                </p>
              </div>
            </div>
          )}

          {/* SELECT TAB */}
          {!result && tab === 'select' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <input type="text" placeholder="Search users..." value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className={`flex-1 px-3 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500
                    ${isDark ? 'bg-white/5 border-white/10 text-white placeholder-slate-600' : 'bg-slate-50 border-slate-200'}`} />
                <button onClick={selectAll} className="px-3 py-2 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-xl text-xs font-black">All</button>
                <button onClick={clearAll} className="px-3 py-2 bg-slate-100 dark:bg-white/5 text-slate-500 rounded-xl text-xs font-black">Clear</button>
              </div>

              {selectedIds.size > 0 && (
                <div className="bg-indigo-50 dark:bg-indigo-500/10 rounded-xl px-3 py-2">
                  <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">{selectedIds.size} users selected</span>
                </div>
              )}

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {filteredInactive.length === 0 ? (
                  <p className={`text-center py-8 text-xs font-black uppercase tracking-widest ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                    {inactiveUsers.length === 0 ? 'Sab users already active hain! ✅' : 'Koi user nahi mila'}
                  </p>
                ) : filteredInactive.map(u => (
                  <div key={u.id}
                    onClick={() => toggleSelect(u.id)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all border ${
                      selectedIds.has(u.id)
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10'
                        : isDark ? 'border-white/5 bg-white/5 hover:bg-white/10' : 'border-slate-100 bg-slate-50 hover:bg-slate-100'
                    }`}>
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                      selectedIds.has(u.id) ? 'bg-indigo-600 border-indigo-600' : isDark ? 'border-slate-600' : 'border-slate-300'
                    }`}>
                      {selectedIds.has(u.id) && <span className="text-white text-[10px] font-black">✓</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-black truncate ${isDark ? 'text-white' : 'text-slate-900'}`}>{u.name}</p>
                      <p className="text-xs text-indigo-500 font-black">@{u.username} · Rs. {u.monthlyFee?.toLocaleString()}</p>
                    </div>
                    {u.balance > 0 && (
                      <span className="text-[9px] font-black text-rose-500 bg-rose-50 dark:bg-rose-500/10 px-2 py-0.5 rounded-full">
                        Due: {u.balance}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <button
                onClick={handleSelectActivate}
                disabled={selectedIds.size === 0}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-sm font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-40"
              >
                ⚡ {selectedIds.size > 0 ? `${selectedIds.size} Users` : ''} Activate Karo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuickActivate;
