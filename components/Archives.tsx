import React, { useState, useRef, useMemo } from 'react';
import { UserRecord, Archive, AppSettings, PaymentMethod, PaymentStatus, Receipt } from '../types';
import UserManagement from './UserManagement';
import * as XLSX from 'xlsx';

interface ArchivesProps {
  archives: Archive[];
  currentUsers: UserRecord[];
  onCreateArchive: (name: string, users: UserRecord[], month?: string, year?: string) => void;
  onDeleteArchive: (id: string) => void;
  onBulkAddUsers: (users: UserRecord[]) => void;
  onBulkUpdateUsers: (users: UserRecord[]) => void;
  onBack: () => void;
  setLoadingMessage: (msg: string | null) => void;
  onRecordLatePayment: (archiveId: string, receipt: Receipt) => void;
  settings: AppSettings;
}

const Archives: React.FC<ArchivesProps> = ({ 
  archives, 
  currentUsers, 
  onCreateArchive, 
  onDeleteArchive, 
  onBulkAddUsers,
  onBulkUpdateUsers,
  onBack,
  setLoadingMessage,
  onRecordLatePayment,
  settings
}) => {
  const [selectedArchive, setSelectedArchive] = useState<Archive | null>(null);
  const [latePaymentUser, setLatePaymentUser] = useState<UserRecord | null>(null);
  const [latePaymentAmount, setLatePaymentAmount] = useState<number>(0);
  const [latePaymentDate, setLatePaymentDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [isCreating, setIsCreating] = useState(false);
  const [isUploadingLegacy, setIsUploadingLegacy] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{ title: string; message: string; type: 'success' | 'error' } | null>(null);
  const [newArchiveName, setNewArchiveName] = useState('');
  const [uploadMonth, setUploadMonth] = useState(new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date()));
  const [uploadYear, setUploadYear] = useState(new Date().getFullYear().toString());
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentMonthPeriod = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date());

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const years = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - 5 + i).toString());

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (newArchiveName.trim()) {
      onCreateArchive(newArchiveName.trim(), currentUsers, uploadMonth, uploadYear);
      setNewArchiveName('');
      setIsCreating(false);
    }
  };

  const handleImportArchive = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws) as any[];
        
        const importedUsers = json.map((item, index) => {
          const findVal = (possibleKeys: string[]) => {
            const normalizedPossible = possibleKeys.map(pk => pk.toLowerCase().trim().replace(/[^a-z0-9]/g, ''));
            const key = Object.keys(item).find(k => {
              const normalizedHeader = k.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
              return normalizedPossible.includes(normalizedHeader);
            });
            return key ? item[key] : null;
          };

          const username = findVal(['username', 'id', 'accountid', 'userid', 'accid', 'subscriberid', 'customerid']) || `user-${index}`;
          const name = findVal(['fullname', 'name', 'customername', 'displayname']) || 'Unknown';
          const plan = findVal(['plan', 'subscription', 'package']) || '';
          const monthlyFee = Number(findVal(['monthlyfee', 'fee', 'price', 'amount', 'cost', 'rate'])) || 0;
          const balance = Number(findVal(['balance', 'arrears', 'due', 'outstanding'])) || 0;

          return {
            id: `arch-user-${Date.now()}-${index}`,
            username: String(username),
            name: String(name),
            phone: String(findVal(['phone', 'mobile']) || ''),
            plan: String(plan),
            monthlyFee,
            balance,
            expiryDate: new Date().toISOString(),
            status: 'active' as const,
            createdAt: new Date().toISOString(),
            activatedMonths: []
          };
        }) as UserRecord[];

        const name = isUploadingLegacy ? `${uploadMonth} ${uploadYear}` : file.name.replace('.xlsx', '').replace('.csv', '').replace('.xls', '');
        onCreateArchive(name, importedUsers, uploadMonth, uploadYear);
        setIsUploadingLegacy(false);
        setAlertConfig({
          title: 'Import Success',
          message: `Successfully imported ${importedUsers.length} records into the vault.`,
          type: 'success'
        });
      } catch (err) {
        setAlertConfig({
          title: 'Vault Error',
          message: 'Failed to process the historical data file. Please ensure it follows the required format.',
          type: 'error'
        });
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleReactivateSelected = () => {
    if (!selectedArchive) return;
    const usersToImport = selectedArchive.users.filter(u => selectedUserIds.includes(u.id));
    
    const updatedUsers = [...currentUsers];
    const newUsersToAdd: UserRecord[] = [];

    usersToImport.forEach(sourceUser => {
      const existingIndex = updatedUsers.findIndex(u => u.username.toLowerCase() === sourceUser.username.toLowerCase());
      if (existingIndex > -1) {
        const existingUser = updatedUsers[existingIndex];
        const months = new Set(existingUser.activatedMonths || []);
        months.add(currentMonthPeriod);
        updatedUsers[existingIndex] = {
          ...existingUser,
          activatedMonths: Array.from(months)
        };
      } else {
        newUsersToAdd.push({
          ...sourceUser,
          id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          activatedMonths: [currentMonthPeriod],
          createdAt: new Date().toISOString()
        });
      }
    });

    if (newUsersToAdd.length > 0) onBulkAddUsers(newUsersToAdd);
    if (updatedUsers.length > 0) onBulkUpdateUsers(updatedUsers);

    setLoadingMessage(`Restoring ${usersToImport.length} Records to Active Node...`);
    
    setTimeout(() => {
      setLoadingMessage(null);
      setAlertConfig({
        title: 'Restoration Complete',
        message: `Successfully re-activated ${usersToImport.length} users for ${currentMonthPeriod}.`,
        type: 'success'
      });
      setSelectedUserIds([]);
    }, 1000);
  };

  const groupedArchives = useMemo(() => {
    const groups: Record<string, Archive[]> = {};
    archives.forEach(a => {
      const year = a.year || new Date(a.createdAt).getFullYear().toString();
      if (!groups[year]) groups[year] = [];
      groups[year].push(a);
    });
    return groups;
  }, [archives]);

  const handleRecordLatePaymentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedArchive || !latePaymentUser) return;

    const receipt: Receipt = {
      id: `late-${Date.now()}`,
      userId: latePaymentUser.id,
      username: latePaymentUser.username,
      userName: latePaymentUser.name,
      userPhone: latePaymentUser.phone,
      totalAmount: (latePaymentUser.monthlyFee || 0) + (latePaymentUser.balance || 0),
      paidAmount: latePaymentAmount,
      balanceAmount: ((latePaymentUser.monthlyFee || 0) + (latePaymentUser.balance || 0)) - latePaymentAmount,
      date: new Date().toISOString(),
      period: selectedArchive.name,
      paymentMethod: PaymentMethod.CASH,
      status: PaymentStatus.SUCCESS,
      transactionRef: `LATE-${Date.now()}`,
      isLatePayment: true,
      actualPaymentDate: latePaymentDate
    };

    onRecordLatePayment(selectedArchive.id, receipt);
    setLatePaymentUser(null);
    setLatePaymentAmount(0);
    
    setAlertConfig({
      title: 'Late Payment Recorded',
      message: `Payment of Rs. ${latePaymentAmount.toLocaleString()} has been added to ${selectedArchive.name} history.`,
      type: 'success'
    });
  };

  if (selectedArchive) {
    return (
      <div className="space-y-4 animate-in fade-in slide-in-from-right duration-300">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] shadow-sm border border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-4">
            <button onClick={() => setSelectedArchive(null)} className="p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-2xl transition-colors">
              <svg className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
            </button>
            <div>
              <h3 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tight">{selectedArchive.name}</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Legacy Vault Record • {selectedArchive.users.length} Subscribers</p>
            </div>
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <button 
              onClick={handleReactivateSelected}
              disabled={selectedUserIds.length === 0}
              className="flex-1 md:flex-none px-6 py-3 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-indigo-700 transition-all disabled:opacity-50"
            >
              Re-activate Selected ({selectedUserIds.length})
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-[2.5rem] overflow-hidden shadow-xl border border-slate-100 dark:border-slate-800">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-white/5 text-[9px] uppercase font-black tracking-widest text-slate-500 border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="px-8 py-6 w-16">
                    <input 
                      type="checkbox" 
                      className="w-5 h-5 rounded border-slate-300 dark:border-white/10 bg-transparent text-indigo-600 focus:ring-0"
                      checked={selectedUserIds.length === selectedArchive.users.length}
                      onChange={(e) => setSelectedUserIds(e.target.checked ? selectedArchive.users.map(u => u.id) : [])}
                    />
                  </th>
                  <th className="px-8 py-6">Consumer ID</th>
                  <th className="px-8 py-6">Name</th>
                  <th className="px-8 py-6">Package</th>
                  <th className="px-8 py-6">Rate</th>
                  <th className="px-8 py-6">Status</th>
                  <th className="px-8 py-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {selectedArchive.users.map(user => (
                  <tr key={user.id} className="hover:bg-indigo-500/5 transition-colors group">
                    <td className="px-8 py-6">
                      <input 
                        type="checkbox" 
                        className="w-5 h-5 rounded border-slate-300 dark:border-white/10 bg-transparent text-indigo-600 focus:ring-0"
                        checked={selectedUserIds.includes(user.id)}
                        onChange={() => setSelectedUserIds(prev => prev.includes(user.id) ? prev.filter(id => id !== user.id) : [...prev, user.id])}
                      />
                    </td>
                    <td className="px-8 py-6 text-sm font-bold text-indigo-600 dark:text-indigo-400">@{user.username}</td>
                    <td className="px-8 py-6 text-sm font-black text-slate-800 dark:text-slate-200">{user.name}</td>
                    <td className="px-8 py-6 text-[10px] font-black uppercase text-slate-500">{user.plan}</td>
                    <td className="px-8 py-6 text-sm font-black text-slate-800 dark:text-slate-200">Rs. {user.monthlyFee.toLocaleString()}</td>
                    <td className="px-8 py-6">
                      <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-full text-[9px] font-black uppercase tracking-widest">Archived</span>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <button 
                        onClick={() => {
                          setLatePaymentUser(user);
                          setLatePaymentAmount(user.monthlyFee + (user.balance || 0));
                        }}
                        className="opacity-0 group-hover:opacity-100 px-4 py-2 bg-indigo-500/10 text-indigo-600 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-indigo-500 hover:text-white transition-all shadow-sm"
                      >
                        Record Late Payment
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row justify-between items-end gap-4">
        <div>
          <h2 className="text-4xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Legacy Data Vault</h2>
          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Digitalize and Manage Historical Paperwork</p>
        </div>
        <div className="flex gap-3">
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden"
            accept=".xlsx,.xls,.csv" 
            onChange={handleImportArchive} 
          />
          <button onClick={() => setIsUploadingLegacy(true)} className="px-6 py-3 bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-sm border border-indigo-100 dark:border-indigo-500/20 hover:bg-indigo-50 transition-all">
            Upload Historical Data
          </button>
          <button onClick={() => setIsCreating(true)} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-indigo-700 transition-all">
            Archive Current Month
          </button>
        </div>
      </div>

      {isCreating && (
        <form onSubmit={handleCreate} className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-xl border border-indigo-100 dark:border-indigo-500/20 flex flex-col md:flex-row gap-6 items-end animate-in slide-in-from-top duration-300">
          <div className="flex-1 space-y-2 w-full">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Archive Name</label>
            <input 
              autoFocus
              type="text" 
              value={newArchiveName} 
              onChange={e => setNewArchiveName(e.target.value)}
              className="w-full p-5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 font-bold outline-none focus:border-indigo-500 transition-all"
              placeholder="e.g., January 2024 Records"
            />
          </div>
          <div className="flex gap-3 w-full md:w-auto">
            <button type="submit" className="flex-1 md:flex-none px-10 py-5 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg hover:bg-indigo-700 transition-all">Save Snapshot</button>
            <button type="button" onClick={() => setIsCreating(false)} className="px-10 py-5 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
          </div>
        </form>
      )}

      {isUploadingLegacy && (
        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-xl border border-indigo-100 dark:border-indigo-500/20 space-y-6 animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-4 mb-2">
            <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-500/10 rounded-xl flex items-center justify-center text-indigo-600">📁</div>
            <h4 className="text-xl font-black text-slate-800 dark:text-white uppercase tracking-tight">Historical Upload Module</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Select Month</label>
              <select 
                value={uploadMonth}
                onChange={(e) => setUploadMonth(e.target.value)}
                className="w-full p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 font-bold outline-none"
              >
                {months.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Select Year</label>
              <select 
                value={uploadYear}
                onChange={(e) => setUploadYear(e.target.value)}
                className="w-full p-4 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 font-bold outline-none"
              >
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-4 pt-4">
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 bg-indigo-600 text-white py-5 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg hover:bg-indigo-700 transition-all"
            >
              Select CSV/Excel File
            </button>
            <button 
              onClick={() => setIsUploadingLegacy(false)}
              className="px-10 bg-slate-100 dark:bg-slate-800 text-slate-500 py-5 rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-slate-200 transition-all"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="space-y-12">
        {Object.keys(groupedArchives).sort((a, b) => b.localeCompare(a)).map(year => (
          <div key={year} className="space-y-6">
            <div className="flex items-center gap-4">
              <h3 className="text-2xl font-black text-slate-800 dark:text-white uppercase tracking-tighter">{year}</h3>
              <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800"></div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {groupedArchives[year].map(archive => (
                <div key={archive.id} onClick={() => setSelectedArchive(archive)} className="group bg-white dark:bg-slate-900 p-6 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-800 cursor-pointer hover:shadow-xl hover:-translate-y-1 transition-all relative overflow-hidden">
                  <div className="relative z-10">
                    <div className="flex justify-between items-start mb-4">
                      <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path></svg>
                      </div>
                      <button 
                        onClick={(e) => { e.stopPropagation(); onDeleteArchive(archive.id); }}
                        className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-all"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                      </button>
                    </div>
                    <h3 className="text-lg font-black text-slate-800 dark:text-white mb-1">{archive.name}</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{archive.users.length} Records</p>
                    <div className="mt-4 pt-4 border-t border-slate-50 dark:border-slate-800 flex items-center gap-2 text-[10px] font-bold text-slate-400">
                      <span>Imported: {new Date(archive.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 rounded-full blur-2xl -mr-12 -mt-12 group-hover:bg-indigo-500/10 transition-colors"></div>
                </div>
              ))}
            </div>
          </div>
        ))}
        {archives.length === 0 && (
          <div className="py-20 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-[2rem]">
            <p className="text-slate-400 font-bold">Legacy Vault is empty. Upload historical data to begin.</p>
          </div>
        )}
      </div>

      {alertConfig && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setAlertConfig(null)}></div>
          <div className="relative z-10 w-full max-w-sm bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-100 dark:border-white/5 shadow-2xl text-center">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 ${alertConfig.type === 'success' ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-500' : 'bg-rose-100 dark:bg-rose-500/10 text-rose-500'}`}>
              {alertConfig.type === 'success' ? (
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"></path></svg>
              ) : (
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
              )}
            </div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2 uppercase tracking-tight">{alertConfig.title}</h3>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">{alertConfig.message}</p>
            <button 
              onClick={() => setAlertConfig(null)}
              className="w-full py-4 bg-slate-950 dark:bg-white text-white dark:text-slate-950 rounded-2xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all shadow-xl"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      {latePaymentUser && selectedArchive && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setLatePaymentUser(null)}></div>
          <div className="relative z-10 w-full max-w-md bg-white dark:bg-slate-900 rounded-[3rem] p-10 border border-slate-100 dark:border-white/5 shadow-2xl animate-in fade-in zoom-in duration-300">
            <div className="flex items-center gap-4 mb-8">
              <div className="w-14 h-14 bg-indigo-500/10 rounded-2xl flex items-center justify-center text-indigo-600">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              </div>
              <div>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Late Payment</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Entry for {selectedArchive.name}</p>
              </div>
            </div>

            <form onSubmit={handleRecordLatePaymentSubmit} className="space-y-6">
              <div className="bg-slate-50 dark:bg-slate-950 p-6 rounded-3xl border border-slate-100 dark:border-white/5">
                <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mb-1">Subscriber</p>
                <p className="text-lg font-black text-slate-900 dark:text-white">{latePaymentUser.name}</p>
                <p className="text-xs font-bold text-slate-400 mt-1">@{latePaymentUser.username}</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Payment Amount (Rs.)</label>
                  <input 
                    type="number"
                    required
                    value={latePaymentAmount}
                    onChange={(e) => setLatePaymentAmount(Number(e.target.value))}
                    className="w-full p-5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 font-bold outline-none focus:border-indigo-500 transition-all"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Actual Received Date</label>
                  <input 
                    type="date"
                    required
                    value={latePaymentDate}
                    onChange={(e) => setLatePaymentDate(e.target.value)}
                    className="w-full p-5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 font-bold outline-none focus:border-indigo-500 transition-all text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button type="submit" className="flex-1 bg-indigo-600 text-white py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-500/20 active:scale-95 transition-all">Submit Late Entry</button>
                <button type="button" onClick={() => setLatePaymentUser(null)} className="px-8 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-[1.5rem] font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-all">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Archives;
