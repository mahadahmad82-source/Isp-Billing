
import React, { useState, useRef, useEffect } from 'react';
import { AppSettings, ReceiptDesign, AppState, UserRecord, ManagerAccount, DefaultPlanPricing, Receipt } from '../types';
import { getAccounts, saveAccount, removeAccount } from '../utils/storage';
import * as XLSX from 'xlsx';

interface SettingsProps {
  settings: AppSettings;
  onUpdateSettings: (settings: AppSettings) => void;
  onRestoreState: (state: AppState) => void;
  onWipeData: () => void;
  fullState: AppState;
  onLogout: () => void;
  onBulkUpdateUsers: (users: UserRecord[]) => void;
}

const Settings: React.FC<SettingsProps> = ({ settings, onUpdateSettings, onRestoreState, onWipeData, fullState, onLogout, onBulkUpdateUsers }) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [isCloudLoading, setIsCloudLoading] = useState(false);
  const [modalStatus, setModalStatus] = useState<{ title: string, message: string, type: 'success' | 'error' | 'info' } | null>(null);
  const [pendingDeleteAccount, setPendingDeleteAccount] = useState(false);
  const [pendingDeletePlan, setPendingDeletePlan] = useState<string | null>(null);
  
  const [newPlanName, setNewPlanName] = useState('');
  const [newPlanPrice, setNewPlanPrice] = useState<number | ''>('');
  
  const [editingPlanName, setEditingPlanName] = useState<string | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState<number | ''>('');

  const restoreFileInputRef = useRef<HTMLInputElement>(null);
  const restoreJsonInputRef = useRef<HTMLInputElement>(null);
  const adImageInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleSave = () => {
    onUpdateSettings(localSettings);
    
    const currentUsername = fullState.currentManager;
    if (currentUsername) {
      const accounts = getAccounts();
      const account = accounts.find(a => a.username === currentUsername);
      if (account) {
        const updatedAccount: ManagerAccount = {
          ...account,
          businessName: localSettings.businessName,
          phone: localSettings.businessPhone,
          email: localSettings.businessEmail,
          username: localSettings.adminUsername || account.username,
          password: localSettings.adminPassword || account.password,
        };
        saveAccount(updatedAccount);
      }
    }

    setSaveStatus('Settings Saved! ✓');
    setTimeout(() => setSaveStatus(null), 3000);
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setModalStatus({
        title: 'File Too Large',
        message: 'Please upload a logo smaller than 2MB.',
        type: 'error'
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setLocalSettings(prev => ({ ...prev, businessLogo: base64 }));
    };
    reader.readAsDataURL(file);
  };

  const removeLogo = () => {
    setLocalSettings(prev => ({ ...prev, businessLogo: undefined }));
    if (logoInputRef.current) logoInputRef.current.value = '';
  };

  const handleAdImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setLocalSettings(prev => ({ ...prev, billAdsImage: base64 }));
    };
    reader.readAsDataURL(file);
  };

  const removeAdImage = () => {
    setLocalSettings(prev => ({ ...prev, billAdsImage: undefined }));
    if (adImageInputRef.current) adImageInputRef.current.value = '';
  };

  const handleBackupDataExcel = () => {
    try {
      const wb = XLSX.utils.book_new();
      const wsUsers = XLSX.utils.json_to_sheet(fullState.users);
      XLSX.utils.book_append_sheet(wb, wsUsers, "Subscribers");

      const wsReceipts = XLSX.utils.json_to_sheet(fullState.receipts);
      XLSX.utils.book_append_sheet(wb, wsReceipts, "Invoices");

      const { planPrices, ...otherSettings } = localSettings;
      const configData = [
        { Category: 'General', Key: 'BusinessName', Value: otherSettings.businessName },
        { Category: 'General', Key: 'BusinessPhone', Value: otherSettings.businessPhone },
        { Category: 'General', Key: 'BusinessEmail', Value: otherSettings.businessEmail },
        { Category: 'General', Key: 'BusinessAddress', Value: otherSettings.businessAddress },
        { Category: 'General', Key: 'GlobalNote', Value: otherSettings.globalNote || '' },
        { Category: 'General', Key: 'BillAds', Value: otherSettings.billAds || '' },
        { Category: 'General', Key: 'ReceiptDesign', Value: otherSettings.receiptDesign },
        { Category: 'General', Key: 'AutoReminderChannel', Value: otherSettings.autoReminderChannel || 'whatsapp' },
        { Category: 'Auth', Key: 'AdminUsername', Value: otherSettings.adminUsername || '' },
        { Category: 'Auth', Key: 'AdminPassword', Value: otherSettings.adminPassword || '' },
        ...Object.entries(planPrices).map(([name, price]) => ({
          Category: 'PlanPricing',
          Key: name,
          Value: price
        }))
      ];
      const wsConfig = XLSX.utils.json_to_sheet(configData);
      XLSX.utils.book_append_sheet(wb, wsConfig, "AppConfig");

      XLSX.writeFile(wb, `${settings.businessName}_FullBackup_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      console.error("Backup generation failed", err);
      setModalStatus({
        title: 'Backup Failed',
        message: 'Error generating backup file. Please try again.',
        type: 'error'
      });
    }
  };

  const handleBackupDataJSON = () => {
    const dataToSave = {
      ...fullState,
      version: '1.0',
      timestamp: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(dataToSave, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${settings.businessName.replace(/\s+/g, '_')}_SystemBackup_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRestoreFromJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (!json.users || !json.receipts) throw new Error("Invalid backup file format");
        
        onRestoreState({
          users: json.users,
          receipts: json.receipts,
          archives: json.archives || [],
          settings: json.settings || settings,
          theme: json.theme || fullState.theme,
          currentManager: fullState.currentManager
        });
        setModalStatus({
          title: 'System Restored',
          message: 'Database successfully recovered from JSON backup snapshot.',
          type: 'success'
        });
      } catch (err: any) {
        setModalStatus({
          title: 'Import Failed',
          message: err.message || 'The selected file is not a valid system backup.',
          type: 'error'
        });
      }
    };
    reader.readAsText(file);
    if (restoreJsonInputRef.current) restoreJsonInputRef.current.value = '';
  };

  const handleRestoreFromExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        if (!workbook.SheetNames.length) throw new Error("File appears to be empty.");

        const getSheetByAliases = (aliases: string[]) => {
          const lowerAliases = aliases.map(a => a.toLowerCase().trim());
          const actualName = workbook.SheetNames.find(sn => lowerAliases.includes(sn.toLowerCase().trim()));
          return actualName ? workbook.Sheets[actualName] : null;
        };

        const usersWs = getSheetByAliases(["Subscribers", "Customers", "Users", "Sheet1"]);
        const receiptsWs = getSheetByAliases(["Invoices", "Receipts", "Transactions", "Sheet2"]);
        const configWs = getSheetByAliases(["AppConfig", "Settings", "Config", "Sheet3"]);
        const finalUsersWs = usersWs || (workbook.SheetNames.length > 0 ? workbook.Sheets[workbook.SheetNames[0]] : null);

        if (!finalUsersWs) throw new Error("No compatible data found.");

        const users: any[] = XLSX.utils.sheet_to_json(finalUsersWs);
        const receipts: any[] = receiptsWs ? XLSX.utils.sheet_to_json(receiptsWs) : [];
        const configEntries: any[] = configWs ? XLSX.utils.sheet_to_json(configWs) : [];

        const restoredSettings: AppSettings = { ...settings, isInitialized: true };

        if (configEntries.length > 0) {
          const planPrices: Record<string, number> = { ...DefaultPlanPricing };
          configEntries.forEach(entry => {
            if (entry.Category === 'General' || entry.Category === 'Auth') {
              const key = entry.Key.charAt(0).toLowerCase() + entry.Key.slice(1);
              (restoredSettings as any)[key] = entry.Value;
            } else if (entry.Category === 'PlanPricing') {
              planPrices[entry.Key] = Number(entry.Value);
            }
          });
          restoredSettings.planPrices = planPrices;
        }

        onRestoreState({
          users: users as UserRecord[],
          receipts: receipts as Receipt[],
          settings: restoredSettings,
          theme: fullState.theme,
          currentManager: fullState.currentManager
        });
        setModalStatus({
          title: 'Batch Import Success',
          message: `Restore Completed Successfully! ${users.length} records processed.`,
          type: 'success'
        });
      } catch (err: any) {
        setModalStatus({
          title: 'Excel Import Failed',
          message: err.message || 'Could not parse the provided spreadsheet.',
          type: 'error'
        });
      }
    };
    reader.readAsArrayBuffer(file);
    if (restoreFileInputRef.current) restoreFileInputRef.current.value = '';
  };

  const handleDeleteAccount = () => {
    setPendingDeleteAccount(true);
  };

  const confirmDeleteAccount = () => {
    const currentUsername = fullState.currentManager;
    if (currentUsername) {
      removeAccount(currentUsername);
      localStorage.removeItem(`mahadnet_data_${currentUsername}`);
      setPendingDeleteAccount(false);
      onLogout();
    }
  };

  const handleAddPlanConfirm = () => {
    if (!newPlanName.trim() || newPlanPrice === '') {
      setModalStatus({
        title: 'Missing Information',
        message: 'Please enter both a Plan Name and a Monthly Price to continue.',
        type: 'info'
      });
      return;
    }

    setLocalSettings(prev => ({
      ...prev,
      planPrices: {
        ...prev.planPrices,
        [newPlanName.trim()]: Number(newPlanPrice)
      }
    }));
    setNewPlanName('');
    setNewPlanPrice('');
  };

  const startEditingPlan = (name: string, price: number) => {
    setEditingPlanName(name);
    setEditingPriceValue(price);
  };

  const saveEditedPlan = () => {
    if (editingPlanName && editingPriceValue !== '') {
      setLocalSettings(prev => ({
        ...prev,
        planPrices: {
          ...prev.planPrices,
          [editingPlanName]: Number(editingPriceValue)
        }
      }));
      setEditingPlanName(null);
      setEditingPriceValue('');
    }
  };

  const handleDeletePlan = (name: string) => {
    setPendingDeletePlan(name);
  };

  const confirmDeletePlan = () => {
    if (!pendingDeletePlan) return;
    setLocalSettings(prev => {
      const { [pendingDeletePlan]: removed, ...remainingPlanPrices } = prev.planPrices;
      return {
        ...prev,
        planPrices: remainingPlanPrices
      };
    });
    setPendingDeletePlan(null);
  };

  const planEntries = Object.entries(localSettings.planPrices) as [string, number][];
  const currentUsername = fullState.currentManager;
  const isGlobalAdmin = currentUsername === 'admin';

  const PREDEFINED_THEMES = [
    { id: 'default', name: 'ISP Classic', primary: '#4f46e5', accent: '#10b981' },
    { id: 'ocean', name: 'Deep Ocean', primary: '#0ea5e9', accent: '#38bdf8' },
    { id: 'forest', name: 'Amazon Forest', primary: '#059669', accent: '#10b981' },
    { id: 'sunset', name: 'Sunset Glow', primary: '#e11d48', accent: '#fb923c' },
    { id: 'midnight', name: 'Midnight Pro', primary: '#6366f1', accent: '#818cf8' },
    { id: 'royal', name: 'Royal Purple', primary: '#7c3aed', accent: '#a78bfa' },
  ];

  const applyTheme = (theme: typeof PREDEFINED_THEMES[0]) => {
    setLocalSettings(prev => ({
      ...prev,
      selectedThemeId: theme.id,
      themePrimaryColor: theme.primary,
      themeAccentColor: theme.accent
    }));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-10 pb-32 animate-in fade-in duration-500">
      {/* Profile Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between bg-white dark:bg-[#0f172a] p-10 rounded-[3rem] shadow-2xl border border-slate-100 dark:border-white/5 gap-6">
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 bg-white dark:bg-slate-800 rounded-[2rem] flex items-center justify-center shadow-xl border border-slate-100 dark:border-white/5 overflow-hidden group relative">
            {localSettings.businessLogo ? (
              <img src={localSettings.businessLogo} alt="Logo" className="w-full h-full object-contain p-2" referrerPolicy="no-referrer" />
            ) : (
              <img src="/logo-v3.png" alt="Logo" className="w-14 h-14 object-contain" referrerPolicy="no-referrer" />
            )}
            <button 
              onClick={() => logoInputRef.current?.click()}
              className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
            </button>
            <input type="file" ref={logoInputRef} className="hidden" accept=".png, .jpg, .jpeg, .svg" onChange={handleLogoUpload} />
          </div>
          <div>
            <h3 className="text-3xl font-black text-slate-900 dark:text-white leading-none mb-2">{localSettings.businessName}</h3>
            <div className="flex items-center gap-2">
              <p className="text-[10px] text-slate-400 dark:text-slate-400 font-black uppercase tracking-[0.2em]">Manager Profile Settings</p>
              {localSettings.businessLogo && (
                <button onClick={removeLogo} className="text-[8px] font-black text-rose-500 uppercase tracking-widest hover:text-rose-600 ml-2">Remove Logo</button>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {saveStatus && <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest animate-pulse">{saveStatus}</span>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-10">
        {/* Manager Profile Details Section */}
        <div className="bg-white dark:bg-[#0f172a] p-10 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-2xl space-y-8">
           <div className="flex items-center gap-3">
             <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
             </div>
             <h4 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Manager Profile Detail</h4>
           </div>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-widest ml-1">Business / Brand Name</label>
                <input 
                  className="w-full p-6 rounded-3xl bg-slate-50 dark:bg-[#030712] font-bold border border-slate-100 dark:border-white/5 outline-none text-slate-900 dark:text-white focus:border-indigo-500 transition-all" 
                  value={localSettings.businessName} 
                  onChange={e => setLocalSettings({...localSettings, businessName: e.target.value})} 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-widest ml-1">Contact Phone Number</label>
                <input 
                  className="w-full p-6 rounded-3xl bg-slate-50 dark:bg-[#030712] font-bold border border-slate-100 dark:border-white/5 outline-none text-slate-900 dark:text-white focus:border-indigo-500 transition-all" 
                  value={localSettings.businessPhone} 
                  onChange={e => setLocalSettings({...localSettings, businessPhone: e.target.value})} 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-widest ml-1">Business Email Address</label>
                <input 
                  className="w-full p-6 rounded-3xl bg-slate-50 dark:bg-[#030712] font-bold border border-slate-100 dark:border-white/5 outline-none text-slate-900 dark:text-white focus:border-indigo-500 transition-all" 
                  value={localSettings.businessEmail} 
                  onChange={e => setLocalSettings({...localSettings, businessEmail: e.target.value})} 
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-widest ml-1">Physical / Office Address</label>
                <input 
                  className="w-full p-6 rounded-3xl bg-slate-50 dark:bg-[#030712] font-bold border border-slate-100 dark:border-white/5 outline-none text-slate-900 dark:text-white focus:border-indigo-500 transition-all" 
                  value={localSettings.businessAddress} 
                  onChange={e => setLocalSettings({...localSettings, businessAddress: e.target.value})} 
                />
              </div>
           </div>
           <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-widest ml-1">Global Receipt Note / Disclaimer</label>
              <textarea 
                className="w-full p-6 rounded-3xl bg-slate-50 dark:bg-[#030712] font-bold border border-slate-100 dark:border-white/5 outline-none text-slate-900 dark:text-white focus:border-indigo-500 transition-all min-h-[100px]" 
                value={localSettings.globalNote || ''} 
                onChange={e => setLocalSettings({...localSettings, globalNote: e.target.value})}
              />
           </div>
        </div>

        {/* Visual Identity & Themes */}
        <div className="bg-white dark:bg-[#0f172a] p-10 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-2xl space-y-8">
           <div className="flex items-center gap-3">
             <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"></path></svg>
             </div>
             <h4 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Visual Identity & Themes</h4>
           </div>

           <div className="space-y-6">
             <label className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-widest ml-1">Select Brand Theme</label>
             <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
               {PREDEFINED_THEMES.map((theme) => (
                 <button
                   key={theme.id}
                   onClick={() => applyTheme(theme)}
                   className={`p-4 rounded-2xl border-2 transition-all text-left space-y-3 ${localSettings.selectedThemeId === theme.id ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-500/10' : 'border-transparent bg-slate-50 dark:bg-[#030712] hover:bg-slate-100'}`}
                 >
                   <div className="flex gap-1">
                     <div className="w-6 h-6 rounded-full" style={{ backgroundColor: theme.primary }}></div>
                     <div className="w-6 h-6 rounded-full" style={{ backgroundColor: theme.accent }}></div>
                   </div>
                   <p className={`text-[10px] font-black uppercase tracking-widest ${localSettings.selectedThemeId === theme.id ? 'text-indigo-600' : 'text-slate-500'}`}>{theme.name}</p>
                 </button>
               ))}
             </div>
           </div>

           <div className="pt-6 border-t border-slate-100 dark:border-white/5 space-y-6">
             <label className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-widest ml-1">Custom Brand Colors</label>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="flex items-center gap-4 bg-slate-50 dark:bg-[#030712] p-4 rounded-3xl border border-slate-100 dark:border-white/5">
                  <input 
                    type="color" 
                    className="w-12 h-12 rounded-xl cursor-pointer bg-transparent border-none"
                    value={localSettings.themePrimaryColor || '#4f46e5'}
                    onChange={e => setLocalSettings({...localSettings, themePrimaryColor: e.target.value, selectedThemeId: 'custom'})}
                  />
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Primary Brand Color</p>
                    <p className="text-xs font-bold text-slate-900 dark:text-white uppercase">{localSettings.themePrimaryColor || '#4f46e5'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 bg-slate-50 dark:bg-[#030712] p-4 rounded-3xl border border-slate-100 dark:border-white/5">
                  <input 
                    type="color" 
                    className="w-12 h-12 rounded-xl cursor-pointer bg-transparent border-none"
                    value={localSettings.themeAccentColor || '#10b981'}
                    onChange={e => setLocalSettings({...localSettings, themeAccentColor: e.target.value, selectedThemeId: 'custom'})}
                  />
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Accent / Success Color</p>
                    <p className="text-xs font-bold text-slate-900 dark:text-white uppercase">{localSettings.themeAccentColor || '#10b981'}</p>
                  </div>
                </div>
             </div>
           </div>
        </div>

        {/* Enhanced Advertisement Management */}
        <div className="bg-white dark:bg-[#0f172a] p-10 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-2xl space-y-8">
           <div className="flex items-center gap-3">
             <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
             </div>
             <h4 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Receipt Advertisements</h4>
           </div>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <label className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest ml-1">Promo Text Announcement</label>
                <textarea 
                  className="w-full p-6 rounded-3xl bg-indigo-50 dark:bg-indigo-950/20 font-bold border border-indigo-100 dark:border-indigo-500/10 outline-none text-indigo-900 dark:text-indigo-100 focus:border-indigo-500 transition-all min-h-[120px]" 
                  placeholder="Example: Get 10% off on advance 3-month payment! Call us today."
                  value={localSettings.billAds || ''} 
                  onChange={e => setLocalSettings({...localSettings, billAds: e.target.value})}
                />
              </div>

              <div className="space-y-4">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Promotional Banner Image</label>
                <div 
                  className={`relative w-full h-[120px] rounded-3xl border-2 border-dashed flex flex-col items-center justify-center transition-all overflow-hidden ${localSettings.billAdsImage ? 'border-emerald-500/50 bg-emerald-50 dark:bg-emerald-950/10' : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#030712] hover:border-indigo-500'}`}
                  onClick={() => adImageInputRef.current?.click()}
                >
                  {localSettings.billAdsImage ? (
                    <img src={localSettings.billAdsImage} className="w-full h-full object-contain" alt="Ad Preview" />
                  ) : (
                    <div className="text-center">
                      <svg className="w-8 h-8 mx-auto text-slate-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 00-2 2z"></path></svg>
                      <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Tap to Upload Photo Ad</p>
                    </div>
                  )}
                  <input type="file" ref={adImageInputRef} className="hidden" accept="image/*" onChange={handleAdImageUpload} />
                </div>
                {localSettings.billAdsImage && (
                  <button onClick={removeAdImage} className="w-full py-2 text-rose-500 font-black text-[9px] uppercase tracking-widest">Remove Ad Image</button>
                )}
              </div>
           </div>
        </div>

        {/* Receipt Serial Number Settings */}
        <div className="bg-white dark:bg-[#0f172a] p-10 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-2xl space-y-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-violet-100 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 rounded-2xl flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14"></path></svg>
            </div>
            <div>
              <h4 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Receipt Serial Number</h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">Apni marzi se serial number set karo — receipts yahan se start hongi</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Prefix */}
            <div>
              <label className="block text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Serial Prefix</label>
              <input
                type="text"
                maxLength={6}
                placeholder="MN"
                value={localSettings.receiptSerialPrefix || 'MN'}
                onChange={e => setLocalSettings({ ...localSettings, receiptSerialPrefix: e.target.value.toUpperCase() })}
                className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl px-5 py-3 text-sm font-black text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 uppercase tracking-widest"
              />
              <p className="text-[10px] text-slate-400 mt-1.5 font-medium">Receipt pe prefix: <span className="font-black text-violet-500">{(localSettings.receiptSerialPrefix || 'MN').toUpperCase()}-0001</span></p>
            </div>

            {/* Starting Number */}
            <div>
              <label className="block text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Starting Serial No.</label>
              <input
                type="number"
                min={1}
                max={999999}
                placeholder="1"
                value={localSettings.receiptSerialStart || 1}
                onChange={e => setLocalSettings({ ...localSettings, receiptSerialStart: Math.max(1, parseInt(e.target.value) || 1) })}
                className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl px-5 py-3 text-sm font-black text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
              <p className="text-[10px] text-slate-400 mt-1.5 font-medium">
                Pehli receipt: <span className="font-black text-violet-500">
                  {(localSettings.receiptSerialPrefix || 'MN').toUpperCase()}-{String(localSettings.receiptSerialStart || 1).padStart(Math.max(4, String(localSettings.receiptSerialStart || 1).length), '0')}
                </span>
              </p>
            </div>
          </div>

          {/* Preview */}
          <div className="bg-violet-50 dark:bg-violet-500/5 border border-violet-200 dark:border-violet-500/20 rounded-2xl p-5">
            <p className="text-[10px] font-black text-violet-500 uppercase tracking-widest mb-3">Serial Preview</p>
            <div className="flex flex-wrap gap-2">
              {[0, 1, 2, 3, 4].map(i => {
                const prefix = (localSettings.receiptSerialPrefix || 'MN').toUpperCase();
                const start = localSettings.receiptSerialStart || 1;
                const padLen = Math.max(4, String(start).length);
                const num = (start + i).toString().padStart(padLen, '0');
                return (
                  <span key={i} className="px-3 py-1.5 bg-white dark:bg-white/5 border border-violet-200 dark:border-violet-500/20 rounded-xl text-xs font-black text-violet-600 dark:text-violet-400">
                    {prefix}-{num}
                  </span>
                );
              })}
              <span className="px-3 py-1.5 text-xs font-black text-slate-400">...</span>
            </div>
          </div>

          <div className="bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-4">
            <p className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-1">⚠️ Note</p>
            <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">Yeh starting number save hone ke baad <strong>naye receipts</strong> pe apply hoga. Receipt generate karte waqt aap manually bhi number change kar sakte hain.</p>
          </div>
        </div>

        {/* Receipt Design Selector */}
        <div className="bg-white dark:bg-[#0f172a] p-10 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-2xl space-y-8">
           <div className="flex items-center gap-3">
             <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
             </div>
             <h4 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Receipt Design & Printing</h4>
           </div>
           <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {[
                { id: ReceiptDesign.PROFESSIONAL, label: 'Professional', icon: <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>, desc: 'Standard PDF' },
                { id: ReceiptDesign.UTILITY, label: 'Utility Bill', icon: <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>, desc: 'Grid Layout' },
                { id: ReceiptDesign.THERMAL, label: 'Thermal', icon: <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4V4m0 0l-4 4m4-4l4 4m-4 4v2m-3 6h6"></path></svg>, desc: '80mm Strip' },
                { id: ReceiptDesign.MODERN, label: 'Modern', icon: <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>, desc: 'Stylish Card' },
                { id: ReceiptDesign.COMPACT, label: 'Compact', icon: <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path></svg>, desc: 'Quick Snippet' },
              ].map((design) => (
                <button
                  key={design.id}
                  onClick={() => setLocalSettings({ ...localSettings, receiptDesign: design.id })}
                  className={`flex flex-col items-center gap-3 p-6 rounded-3xl border-2 transition-all ${
                    localSettings.receiptDesign === design.id 
                    ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-500/10' 
                    : 'border-transparent bg-slate-50 dark:bg-[#030712] hover:bg-slate-100 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <span className={`${localSettings.receiptDesign === design.id ? 'text-indigo-600' : 'text-slate-400'}`}>{design.icon}</span>
                  <div className="text-center">
                    <p className={`text-[10px] font-black uppercase tracking-widest ${localSettings.receiptDesign === design.id ? 'text-indigo-600' : 'text-slate-400'}`}>
                      {design.label}
                    </p>
                    <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 mt-1">{design.desc}</p>
                  </div>
                  {localSettings.receiptDesign === design.id && (
                    <div className="w-2 h-2 rounded-full bg-indigo-600 mt-1 animate-pulse"></div>
                  )}
                </button>
              ))}
           </div>
        </div>

        {/* Credentials */}
        {!isGlobalAdmin && (
          <div className="bg-white dark:bg-[#0f172a] p-10 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-2xl space-y-8">
             <div className="flex items-center gap-3">
               <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center">
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
               </div>
               <h4 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Manager Login Credentials</h4>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-widest ml-1">Manager Username</label>
                  <input className="w-full p-6 rounded-3xl bg-slate-50 dark:bg-[#030712] font-bold border border-slate-100 dark:border-white/5 outline-none text-slate-900 dark:text-white focus:border-indigo-500 transition-all cursor-not-allowed opacity-50" value={localSettings.adminUsername || ''} disabled />
                  <p className="text-[9px] font-bold text-slate-400 ml-1 mt-1">Username cannot be changed after registration.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-400 uppercase tracking-widest ml-1">Account Password</label>
                  <input type="password" className="w-full p-6 rounded-3xl bg-slate-50 dark:bg-[#030712] font-bold border border-slate-100 dark:border-white/5 outline-none text-slate-900 dark:text-white focus:border-indigo-500 transition-all" value={localSettings.adminPassword || ''} onChange={e => setLocalSettings({...localSettings, adminPassword: e.target.value})} />
                </div>
             </div>
          </div>
        )}

        {/* Data & Backup */}
        <div className="bg-[#0f172a] p-12 rounded-[3.5rem] border border-white/5 shadow-2xl space-y-10 text-white relative overflow-hidden group">
          <div className="flex items-start gap-8 relative z-10">
            <div className="w-20 h-20 bg-slate-800/50 rounded-3xl flex items-center justify-center border border-white/5 shadow-2xl">
              <svg className="w-10 h-10 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"></path></svg>
            </div>
            <div className="flex-1">
              <h4 className="text-3xl font-black tracking-tight mb-4 uppercase leading-none text-white">Data Management & Backup</h4>
              <p className="text-sm font-bold text-slate-400 leading-relaxed max-w-xl">
                Download your entire database as an Excel file for backup. You can restore this file on any device to recover all your subscribers, receipts, and configurations.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 relative z-10">
            <button onClick={handleBackupDataJSON} className="w-full py-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] active:scale-[0.98] transition-all border border-white/5 shadow-2xl">
              DOWNLOAD FULL SYSTEM BACKUP (.JSON)
            </button>
            <button onClick={() => restoreJsonInputRef.current?.click()} className="w-full py-6 bg-slate-800/40 hover:bg-slate-800/60 text-slate-300 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] active:scale-[0.98] transition-all border border-white/5 shadow-2xl">
              RESTORE FROM JSON FILE
            </button>
            <div className="flex gap-4">
              <button onClick={handleBackupDataExcel} className="flex-1 py-4 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 rounded-[1.5rem] font-black text-[10px] uppercase tracking-[0.2em] active:scale-[0.98] transition-all border border-white/5">
                EXPORT TO EXCEL
              </button>
              <button onClick={() => restoreFileInputRef.current?.click()} className="flex-1 py-4 bg-slate-800/40 hover:bg-slate-800/60 text-slate-400 rounded-[1.5rem] font-black text-[10px] uppercase tracking-[0.2em] active:scale-[0.98] transition-all border border-white/5">
                IMPORT EXCEL
              </button>
            </div>
            <input type="file" ref={restoreFileInputRef} className="hidden" accept=".xlsx, .xls" onChange={handleRestoreFromExcel} />
            <input type="file" ref={restoreJsonInputRef} className="hidden" accept=".json" onChange={handleRestoreFromJSON} />
          </div>
          <div className="pt-8 border-t border-white/5 flex flex-col items-center gap-4 relative z-10">
            <button onClick={onWipeData} className="inline-flex items-center gap-3 text-[11px] font-black uppercase tracking-[0.15em] text-slate-400 hover:text-white transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
              SYSTEM FACTORY RESET (WIPE LOCAL)
            </button>
            <button 
              onClick={handleDeleteAccount} 
              className="inline-flex items-center gap-3 text-[11px] font-black uppercase tracking-[0.15em] text-rose-500 hover:text-rose-400 transition-colors bg-rose-500/10 px-6 py-3 rounded-xl border border-rose-500/20 hover:bg-rose-500/20"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
              UNREGISTER ACCOUNT FROM THIS DEVICE
            </button>
          </div>
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-[100px] -mr-32 -mt-32"></div>
        </div>

        {/* Plan Catalog Management */}
        <div className="bg-white dark:bg-[#0f172a] p-10 rounded-[3rem] border border-slate-200 dark:border-white/5 shadow-2xl space-y-8">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-2xl flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            </div>
            <h4 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Manage Internet Plans</h4>
          </div>

          {/* ADD NEW PLAN INLINE FORM */}
          <div className="bg-slate-50 dark:bg-[#030712] p-6 rounded-[2.5rem] border border-slate-100 dark:border-white/5 space-y-4 shadow-inner">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Register New Subscription Plan</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
               <div className="space-y-1">
                 <input 
                   type="text" 
                   placeholder="Plan Name (e.g. Blue 20MB)" 
                   className="w-full p-4 rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/5 text-sm font-bold text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500"
                   value={newPlanName}
                   onChange={e => setNewPlanName(e.target.value)}
                 />
               </div>
               <div className="space-y-1">
                 <input 
                   type="number" 
                   placeholder="Monthly Price (Rs.)" 
                   className="w-full p-4 rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/5 text-sm font-bold text-slate-900 dark:text-slate-100 outline-none focus:border-indigo-500"
                   value={newPlanPrice}
                   onChange={e => setNewPlanPrice(e.target.value === '' ? '' : Number(e.target.value))}
                 />
               </div>
            </div>
            <button 
              onClick={handleAddPlanConfirm}
              className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-500/20 active:scale-95 transition-all"
            >
              Add Plan to Catalog
            </button>
          </div>

          {/* PLANS LIST */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {planEntries.map(([name, price]) => (
              <div key={name} className="flex flex-col bg-slate-50 dark:bg-[#030712] p-6 rounded-[2.5rem] border border-slate-100 dark:border-white/5 transition-all hover:border-indigo-500/50">
                <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1">{name}</span>
                
                {editingPlanName === name ? (
                  <div className="space-y-3 mt-2">
                    <input 
                      type="number" 
                      className="w-full p-3 rounded-xl bg-white dark:bg-[#0f172a] border border-indigo-500 text-sm font-black text-slate-900 dark:text-white outline-none"
                      value={editingPriceValue}
                      autoFocus
                      onChange={e => setEditingPriceValue(e.target.value === '' ? '' : Number(e.target.value))}
                    />
                    <div className="flex gap-2">
                      <button onClick={saveEditedPlan} className="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-[9px] font-black uppercase tracking-widest">Save</button>
                      <button onClick={() => setEditingPlanName(null)} className="flex-1 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span className="text-2xl font-black text-slate-900 dark:text-white">Rs. {(price || 0).toLocaleString()}</span>
                    <div className="flex gap-4 mt-6">
                       <button className="px-4 py-2 text-[10px] font-black uppercase text-slate-500 hover:text-indigo-600 transition-colors border border-slate-200 dark:border-white/10 rounded-lg" onClick={() => startEditingPlan(name, price)}>Edit</button>
                       <button className="px-4 py-2 text-[10px] font-black uppercase text-slate-500 hover:text-rose-600 transition-colors border border-slate-200 dark:border-white/10 rounded-lg" onClick={() => handleDeletePlan(name)}>Delete</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Action Button */}
        <button onClick={handleSave} className="w-full bg-[#5a4ff0] text-white py-8 rounded-[2.5rem] font-black text-[13px] uppercase tracking-[0.4em] shadow-2xl active:scale-95 transition-all hover:bg-indigo-600">
           SAVE ALL GLOBAL CONFIGURATION
        </button>
      </div>

      {/* Confirmation & Status Modals */}
      {modalStatus && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setModalStatus(null)}></div>
          <div className="relative z-10 w-full max-w-sm bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-100 dark:border-white/5 shadow-2xl text-center">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 ${modalStatus.type === 'success' ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-500' : modalStatus.type === 'error' ? 'bg-rose-100 dark:bg-rose-500/10 text-rose-500' : 'bg-indigo-100 dark:bg-indigo-500/10 text-indigo-500'}`}>
              {modalStatus.type === 'success' && <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"></path></svg>}
              {modalStatus.type === 'error' && <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>}
              {modalStatus.type === 'info' && <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>}
            </div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2 uppercase tracking-tight">{modalStatus.title}</h3>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">{modalStatus.message}</p>
            <button 
              onClick={() => setModalStatus(null)}
              className="w-full py-4 bg-slate-950 dark:bg-white text-white dark:text-slate-950 rounded-2xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all shadow-xl"
            >
              Understand
            </button>
          </div>
        </div>
      )}

      {pendingDeleteAccount && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setPendingDeleteAccount(false)}></div>
          <div className="relative z-10 w-full max-w-sm bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-100 dark:border-white/5 shadow-2xl text-center">
            <div className="w-16 h-16 bg-rose-100 dark:bg-rose-500/10 rounded-2xl flex items-center justify-center text-rose-500 mx-auto mb-6">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            </div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2 uppercase tracking-tight">Factory Purge?</h3>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
              This will permanently erase this account and all associated data from this browser. This action is <span className="text-rose-600">irreversible</span>.
            </p>
            <div className="flex flex-col gap-3">
              <button 
                onClick={confirmDeleteAccount}
                className="w-full py-4 bg-rose-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-rose-500/20 active:scale-95 transition-all"
              >
                Confirm Destruction
              </button>
              <button 
                onClick={() => setPendingDeleteAccount(false)}
                className="w-full py-4 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDeletePlan && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setPendingDeletePlan(null)}></div>
          <div className="relative z-10 w-full max-w-sm bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-100 dark:border-white/5 shadow-2xl text-center">
            <div className="w-16 h-16 bg-rose-100 dark:bg-rose-500/10 rounded-2xl flex items-center justify-center text-rose-500 mx-auto mb-6">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2 uppercase tracking-tight">Delete Plan?</h3>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
              Are you sure you want to remove <span className="text-rose-600 font-black">"{pendingDeletePlan}"</span> from your service catalog?
            </p>
            <div className="flex flex-col gap-3">
              <button 
                onClick={confirmDeletePlan}
                className="w-full py-4 bg-rose-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-rose-500/20 active:scale-95 transition-all"
              >
                Delete Plan
              </button>
              <button 
                onClick={() => setPendingDeletePlan(null)}
                className="w-full py-4 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
