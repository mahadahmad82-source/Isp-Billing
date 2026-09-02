import React, { useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import { UserRecord } from '../types';
import { BoltIcon, CloseIcon, ClipboardIcon, CheckboxIcon, BarChartIcon, CheckCircleIcon, WarningIcon, CheckIcon, BulbIcon } from './icons/UiIcons';

interface QuickActivateProps {
  users: UserRecord[];
  onActivateUsers: (targets: Array<{ userId: string; rechargeDate?: string }>) => void;
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
  const [rechargeDate, setRechargeDate] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [result, setResult] = useState<{ found: string[]; notFound: string[] } | null>(null);
  const [excelLoading, setExcelLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseRechargeDate = (rawDate: string, rawTime?: string): string | null => {
    const value = rawDate.trim();
    const [datePart, embeddedTime] = value.split(/[T ]+/, 2);
    const effectiveTime = rawTime || embeddedTime;
    const excelSerial = Number(datePart);
    if (/^\d+(\.\d+)?$/.test(datePart) && excelSerial > 20000) {
      const excelDate = new Date((excelSerial - (25567 + 1)) * 86400 * 1000);
      return isNaN(excelDate.getTime()) ? null : excelDate.toISOString();
    }
    const iso = datePart.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    const slash = datePart.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (!iso && !slash) {
      const fallback = new Date(value);
      return !isNaN(fallback.getTime()) && fallback.getFullYear() >= 2000 ? fallback.toISOString() : null;
    }
    let year = 0, month = 0, day = 0;
    if (iso) { year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3]); }
    else if (slash) {
      if (Number(slash[1]) > 12) { day = Number(slash[1]); month = Number(slash[2]); year = Number(slash[3]); }
      else { month = Number(slash[1]); day = Number(slash[2]); year = Number(slash[3]); }
    } else return null;
    const time = (effectiveTime || '').match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    const date = new Date(year, month - 1, day, time ? Number(time[1]) : 0, time ? Number(time[2]) : 0, time ? Number(time[3] || 0) : 0, 0);
    if (isNaN(date.getTime()) || date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date.toISOString();
  };
  const parseActivationValues = (values: string[]): { identity: string; rechargeDate?: string } => {
    const cleaned = values.map(value => String(value ?? '').trim()).filter(Boolean);
    const dateIndex = cleaned.findIndex(value => !!parseRechargeDate(value));
    const timeIndex = dateIndex >= 0 && dateIndex + 1 < cleaned.length && /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.test(cleaned[dateIndex + 1]) ? dateIndex + 1 : -1;
    const parsedDate = dateIndex >= 0 ? parseRechargeDate(cleaned[dateIndex], timeIndex >= 0 ? cleaned[timeIndex] : undefined) : null;
    const identityParts = cleaned.filter((_, index) => index !== dateIndex && index !== timeIndex);
    return { identity: identityParts.join(' ').toLowerCase(), rechargeDate: parsedDate || undefined };
  };
  const findUserForIdentity = (identity: string): UserRecord | undefined => {
    const normalized = identity.trim().toLowerCase();
    return users.find(user => user.username.toLowerCase() === normalized || user.name.toLowerCase() === normalized);
  };

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelLoading(true);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        const found: string[] = [];
        const notFound: string[] = [];
        const targets: Array<{ userId: string; rechargeDate?: string }> = [];
        rows.forEach((row: any[]) => {
          const values = row.map(value => String(value ?? '').trim()).filter(Boolean);
          if (!values.length || values.every(value => /^(username|user|id|name|recharge ?date)$/i.test(value))) return;
          const parsed = parseActivationValues(values);
          const user = findUserForIdentity(parsed.identity) || values.map(value => findUserForIdentity(value)).find(Boolean);
          if (!user) { notFound.push(parsed.identity || values.join(' ')); return; }
          found.push(user.username);
          if (!alreadyActiveIds.has(user.id)) targets.push({ userId: user.id, rechargeDate: parsed.rechargeDate });
        });
        setResult({ found, notFound });
        if (targets.length > 0) onActivateUsers(targets);
      } catch (err) {
        alert('Could not read the file — please check the Excel format');
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
    const lines = pastedUsernames.split(/\n/).map(line => line.trim()).filter(Boolean);
    const found: string[] = [];
    const notFound: string[] = [];
    const targets: Array<{ userId: string; rechargeDate?: string }> = [];
    lines.forEach(line => {
      const parsed = parseActivationValues(line.split(/[\s,;\t]+/));
      const user = findUserForIdentity(parsed.identity) || findUserForIdentity(line.trim());
      if (!user) { notFound.push(parsed.identity || line); return; }
      found.push(user.username);
      if (!alreadyActiveIds.has(user.id)) targets.push({ userId: user.id, rechargeDate: parsed.rechargeDate || (rechargeDate ? parseRechargeDate(rechargeDate) || undefined : undefined) });
    });
    setResult({ found, notFound });
    if (targets.length > 0) onActivateUsers(targets);
  };

  const handleSelectActivate = () => {
    const targets = Array.from(selectedIds).filter(id => !alreadyActiveIds.has(id)).map(userId => ({ userId, rechargeDate: rechargeDate ? parseRechargeDate(rechargeDate) || undefined : undefined }));
    if (targets.length > 0) {
      onActivateUsers(targets);
      setResult({ found: targets.map(target => users.find(user => user.id === target.userId)?.username || ''), notFound: [] });
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
              <h2 className="text-white font-bold text-lg uppercase tracking-tight flex items-center gap-2"><BoltIcon className="w-4 h-4" /> Quick Activate</h2>
              <p className="text-white/70 text-xs mt-0.5">Activate users for {currentMonth}</p>
            </div>
            <button onClick={onClose} className="text-white/60 hover:text-white"><CloseIcon className="w-5 h-5" /></button>
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
            { id: 'paste', label: 'Paste Usernames', icon: <ClipboardIcon className="w-3.5 h-3.5" /> },
            { id: 'select', label: 'Select from List', icon: <CheckboxIcon className="w-3.5 h-3.5" /> },
            { id: 'excel', label: 'Excel Upload', icon: <BarChartIcon className="w-3.5 h-3.5" /> },
          ].map(tabItem => (
            <button key={tabItem.id} onClick={() => setTab(tabItem.id as any)}
              className={`flex-1 py-3 text-xs font-black uppercase tracking-widest transition-all border-b-2 flex items-center justify-center gap-1.5 ${
                tab === tabItem.id
                  ? 'border-indigo-500 text-indigo-500'
                  : `border-transparent ${isDark ? 'text-slate-500' : 'text-slate-400'}`
              }`}>{tabItem.icon}{tabItem.label}</button>
          ))}
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-5">

          {/* Result message */}
          {result && (
            <div className={`rounded-2xl p-4 mb-4 ${result.notFound.length > 0 ? 'bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20' : 'bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20'}`}>
              {result.found.length > 0 && (
                <p className="text-sm font-black text-emerald-600 dark:text-emerald-400 mb-1 flex items-center gap-1.5">
                  <CheckCircleIcon className="w-4 h-4" /> {result.found.length} users activated!
                </p>
              )}
              {result.notFound.length > 0 && (
                <p className="text-xs font-black text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
                  <WarningIcon className="w-4 h-4 flex-shrink-0 mt-0.5" /> Not found: {result.notFound.join(', ')}
                </p>
              )}
              <button onClick={() => { setResult(null); onClose(); }}
                className="mt-2 w-full py-2 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-1.5">
                Done <CheckIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* PASTE TAB */}
          {!result && tab === 'paste' && (
            <div className="space-y-4">
              <div>
                <label className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Paste username/name + recharge date (columns either order)
                </label>
                <textarea
                  value={pastedUsernames}
                  onChange={e => setPastedUsernames(e.target.value)}
                  placeholder={`FC001 2026-09-01 14:30\nFC002, 2026-09-02\n\nOr:\n2026-09-03 08:00 FC003`}
                  rows={8}
                  className={`w-full px-4 py-3 rounded-2xl border text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none
                    ${isDark ? 'bg-white/5 border-white/10 text-white placeholder-slate-600' : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'}`}
                />
                <p className={`text-[10px] mt-1 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                  {pastedUsernames.split(/[\n]+/).filter(s => s.trim()).length} rows detected
                </p>
              </div>

              <div className={`rounded-2xl p-4 ${isDark ? 'bg-white/5' : 'bg-indigo-50'} border ${isDark ? 'border-white/10' : 'border-indigo-100'}`}>
                <p className={`text-xs font-black ${isDark ? 'text-slate-400' : 'text-indigo-700'} mb-1 flex items-center gap-1.5`}><BulbIcon className="w-3.5 h-3.5" /> What happens after activation:</p>
                <ul className={`text-xs space-y-1 ${isDark ? 'text-slate-500' : 'text-indigo-600'}`}>
                  <li>• User is added to the current month ({currentMonth})</li>
                  <li>• Previous plan, fees, and balance are carried over</li>
                  <li>• You can generate a receipt right away</li>
                </ul>
              </div>

              {/* Optional Recharge Date */}
              <div>
                <label className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Recharge Date (Optional)
                </label>
                <input
                  type="datetime-local"
                  value={rechargeDate}
                  onChange={e => setRechargeDate(e.target.value)}
                  className={`w-full px-4 py-3 rounded-2xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500
                    ${isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                />
                {rechargeDate && (
                  <p className={`text-[10px] mt-1 font-bold ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                    Recharge: {new Date(rechargeDate).toLocaleDateString('en-PK', { day: 'numeric', month: 'long', year: 'numeric' })} · Expiry auto +30 days
                  </p>
                )}
              </div>

              <button
                onClick={handlePasteActivate}
                disabled={!pastedUsernames.trim()}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-sm font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                <BoltIcon className="w-4 h-4" /> Activate
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
                    <div className={`flex justify-center ${isDark ? 'text-slate-500' : 'text-slate-400'}`}><BarChartIcon className="w-10 h-10" /></div>
                    <div>
                      <p className={`text-sm font-black ${isDark ? 'text-white' : 'text-slate-900'}`}>Upload Excel / CSV File</p>
                      <p className={`text-xs mt-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Click or drag a file here</p>
                    </div>
                    <p className={`text-[10px] font-black uppercase tracking-widest ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>.xlsx · .xls · .csv</p>
                  </div>
                )}
              </div>

              {/* Format Guide */}
              <div className={`rounded-2xl p-4 ${isDark ? 'bg-white/5 border border-white/10' : 'bg-slate-50 border border-slate-200'}`}>
                <p className={`text-[10px] font-black uppercase tracking-widest mb-3 flex items-center gap-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}><ClipboardIcon className="w-3.5 h-3.5" /> Excel Format</p>
                <div className={`rounded-xl overflow-hidden border ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                  <table className="w-full text-xs">
                    <thead className={`${isDark ? 'bg-white/10 text-slate-300' : 'bg-slate-100 text-slate-600'} font-black`}>
                      <tr>
                        <th className="px-3 py-2 text-left">Username / Name</th>
                        <th className="px-3 py-2 text-left">Recharge Date</th>
                      </tr>
                    </thead>
                    <tbody className={`${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                      <tr className={`border-t ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                        <td className="px-3 py-1.5 font-mono">FC001</td>
                        <td className="px-3 py-1.5 text-slate-400">2026-09-01 14:30</td>
                      </tr>
                      <tr className={`border-t ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                        <td className="px-3 py-1.5 font-mono">2026-09-02</td>
                        <td className="px-3 py-1.5 text-slate-400">FC002</td>
                      </tr>
                      <tr className={`border-t ${isDark ? 'border-white/5' : 'border-slate-100'}`}>
                        <td className="px-3 py-1.5 font-mono">FC003</td>
                        <td className="px-3 py-1.5 text-slate-400">2026-09-03</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <p className={`text-[10px] mt-2 flex items-start gap-1.5 ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
                  <BulbIcon className="w-3 h-3 flex-shrink-0 mt-0.5" /> Use username/name with recharge date; date can come before or after the identity. Expiry is set automatically to recharge date + 30 days.
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
                    {inactiveUsers.length === 0 ? 'All users are already active!' : 'No users found'}
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
                      {selectedIds.has(u.id) && <CheckIcon className="w-3 h-3 text-white" />}
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

              {/* Optional Recharge Date */}
              <div>
                <label className={`block text-[10px] font-black uppercase tracking-widest mb-2 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                  Recharge Date (Optional)
                </label>
                <input
                  type="datetime-local"
                  value={rechargeDate}
                  onChange={e => setRechargeDate(e.target.value)}
                  className={`w-full px-4 py-3 rounded-2xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500
                    ${isDark ? 'bg-white/5 border-white/10 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                />
                {rechargeDate && (
                  <p className={`text-[10px] mt-1 font-bold ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                    Recharge: {new Date(rechargeDate).toLocaleDateString('en-PK', { day: 'numeric', month: 'long', year: 'numeric' })} · Expiry auto +30 days
                  </p>
                )}
              </div>

              <button
                onClick={handleSelectActivate}
                disabled={selectedIds.size === 0}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-sm font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-40 flex items-center justify-center gap-1.5"
              >
                <BoltIcon className="w-4 h-4" /> Activate {selectedIds.size > 0 ? `${selectedIds.size} Users` : ''}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QuickActivate;
