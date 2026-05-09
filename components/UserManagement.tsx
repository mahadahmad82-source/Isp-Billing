
import QuickActivate from './QuickActivate';
import React, { useState, useRef, useMemo } from 'react';
import { UserRecord, AppSettings, Receipt, PaymentStatus, Archive } from '../types';
import { generateId } from '../utils/storage';
import { shareToWhatsApp } from '../utils/whatsapp';
import * as XLSX from 'xlsx';
import ImportFromHistory from './ImportFromHistory';

interface UserManagementProps {
  users: UserRecord[];
  receipts: Receipt[];
  archives: Archive[];
  settings: AppSettings;
  onAddUser: (user: UserRecord) => void;
  onUpdateUser: (user: UserRecord) => void;
  onDeleteUser: (id: string) => void;
  onBulkAddUsers: (users: UserRecord[]) => void;
  onBulkDeleteUsers: (ids: string[]) => void;
  onBulkUpdateUsers: (users: UserRecord[]) => void;
  readOnly?: boolean;
  setLoadingMessage: (msg: string | null) => void;
  initialFilter?: 'all' | 'current_month';
}

type SortKey = 'account_id_asc' | 'account_id_desc' | 'name_asc' | 'name_desc' | 'reg_date_desc' | 'reg_date_asc' | 'expiry_asc' | 'expiry_desc' | 'plan_asc' | 'fee_asc' | 'fee_desc' | 'balance_asc' | 'balance_desc' | 'paid_first' | 'pending_first' | 'none';

const UserManagement: React.FC<UserManagementProps> = ({ 
  users, 
  receipts = [],
  archives = [],
  settings, 
  onAddUser, 
  onUpdateUser, 
  onDeleteUser, 
  onBulkAddUsers,
  onBulkDeleteUsers,
  onBulkUpdateUsers,
  readOnly = false,
  setLoadingMessage,
  initialFilter = 'all'
}) => {
  const currentMonth = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date());
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);
  // initialFilter='all' means show all months (no folder filter), 'current_month' means show current month only
  const [showMonthlyFolders, setShowMonthlyFolders] = useState(initialFilter !== 'all');
  const [showQuickActivate, setShowQuickActivate] = useState(false);
  const [showAllUsers, setShowAllUsers] = useState(initialFilter === 'all');
  const [showForm, setShowForm] = useState(false);
  const [showImportHistory, setShowImportHistory] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRecord | null>(null);
  const [viewingLedgerUser, setViewingLedgerUser] = useState<UserRecord | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('none');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [alertConfig, setAlertConfig] = useState<{ title: string; message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [contextMenu, setContextMenu] = useState<{ user: UserRecord; x: number; y: number } | null>(null);
  const [showBulkChangePlan, setShowBulkChangePlan] = useState(false);
  const [bulkNewPlan, setBulkNewPlan] = useState('');
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const availableMonths = useMemo(() => {
    const months = new Set<string>();
    months.add(currentMonth);
    users.forEach(u => (u.activatedMonths || []).forEach(m => months.add(m)));
    return Array.from(months).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  }, [users, currentMonth]);

  const isCurrentMonth = selectedMonth === currentMonth;

  const availablePlans = Object.keys(settings.planPrices || {});
  const firstAvailablePlan = availablePlans[0] || 'Standard';

  const getDefaultExpiryString = () => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().split('T')[0];
  };

  const [formData, setFormData] = useState<Partial<UserRecord>>({
    username: '',
    name: '',
    phone: '',
    phone2: '',
    address: '',
    description: '',
    plan: firstAvailablePlan,
    monthlyFee: settings.planPrices?.[firstAvailablePlan] || 0,
    balance: 0,
    persistentDiscount: 0,
    status: 'active',
    expiryDate: getDefaultExpiryString()
  });

  const resetForm = () => {
    setFormData({
      username: '',
      name: '',
      phone: '',
      phone2: '',
      address: '',
      description: '',
      plan: firstAvailablePlan,
      monthlyFee: settings.planPrices?.[firstAvailablePlan] || 0,
      balance: 0,
      persistentDiscount: 0,
      status: 'active',
      expiryDate: getDefaultExpiryString()
    });
    setEditingUser(null);
    setShowForm(false);
  };

  const handleEditClick = (user: UserRecord) => {
    if (!isCurrentMonth) return;
    setEditingUser(user);
    setFormData({
      ...user,
      expiryDate: new Date(user.expiryDate || new Date()).toISOString().split('T')[0]
    });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isCurrentMonth) return;

    const expiryObj = formData.expiryDate ? new Date(formData.expiryDate) : new Date();
    const finalExpiryDate = isNaN(expiryObj.getTime()) ? new Date().toISOString() : expiryObj.toISOString();
    const currentPrice = settings.planPrices?.[formData.plan || ''] || formData.monthlyFee || 0;

    if (editingUser) {
      // Ensure current month is preserved in activatedMonths
      const currentActivated = new Set(editingUser.activatedMonths || []);
      // Don't auto-add current month on edit - only Quick Activate should do this

      onUpdateUser({ 
        ...editingUser, 
        ...formData, 
        monthlyFee: currentPrice, 
        expiryDate: finalExpiryDate,
        activatedMonths: Array.from(currentActivated) // Preserved as-is
      } as UserRecord);
    } else {
      const user: UserRecord = {
        ...(formData as Omit<UserRecord, 'id' | 'lastPaymentDate' | 'expiryDate' | 'createdAt'>),
        id: generateId(),
        monthlyFee: currentPrice,
        lastPaymentDate: new Date().toISOString(),
        expiryDate: finalExpiryDate,
        createdAt: new Date().toISOString(),
        activatedMonths: [currentMonth]
      } as UserRecord;
      onAddUser(user);
    }
    resetForm();
  };



  const handleExportExcel = () => {
    if (filteredUsers.length === 0) {
      setAlertConfig({
        title: 'Export Rejected',
        message: `${selectedMonth} mein koi customer nahi mila export karne ke liye.`,
        type: 'info'
      });
      return;
    }
    const dataToExport = filteredUsers.map(u => ({
      'Account ID': u.username,
      'Full Name': u.name,
      'Phone': u.phone,
      'Phone 2': u.phone2 || '',
      'Address': u.address || '',
      'Plan': u.plan,
      'Monthly Fee': u.monthlyFee,
      'Balance': u.balance,
      'Discount': u.persistentDiscount || 0,
      'Expiry': new Date(u.expiryDate).toLocaleDateString(),
      'Registration Date': u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A',
      'Month': selectedMonth,
    }));
    
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, selectedMonth);
    XLSX.writeFile(workbook, `MYISP_${selectedMonth.replace(' ', '_')}_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const downloadCustomerTemplate = () => {
    setLoadingMessage('Generating Subscriber Template...');
    
    setTimeout(() => {
      const template = [
        {
          'Account ID': 'user123',
          'Full Name': 'John Doe',
          'Phone': '03001234567',
          'Phone 2': '03007654321',
          'Address': 'House 1, Street 2, City',
          'Plan': firstAvailablePlan,
          'Monthly Fee': settings.planPrices[firstAvailablePlan] || 0,
          'Balance': 0,
          'Discount': 0,
          'Expiry': getDefaultExpiryString()
        }
      ];

      const worksheet = XLSX.utils.json_to_sheet(template);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Customer Template");
      XLSX.writeFile(workbook, "Customer_Import_Template.xlsx");
      setLoadingMessage(null);
    }, 600);
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws) as any[];
        
        const imported = json.map(item => {
          const findVal = (possibleKeys: string[]) => {
            const normalizedPossible = possibleKeys.map(pk => pk.toLowerCase().trim().replace(/[^a-z0-9]/g, ''));
            const key = Object.keys(item).find(k => {
              const normalizedHeader = k.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
              return normalizedPossible.includes(normalizedHeader);
            });
            return key ? item[key] : null;
          };

          const username = findVal(['username', 'id', 'accountid', 'userid', 'accid', 'subscriberid', 'customerid']) || generateId();
          let fullName = findVal(['fullname', 'name', 'customername', 'displayname', 'subscribername', 'userfullname']);
          if (!fullName) {
            const first = findVal(['firstname', 'fname', 'first', 'givenname', 'fname']) || '';
            const last = findVal(['lastname', 'lname', 'last', 'surname', 'familyname', 'lname']) || '';
            fullName = `${first} ${last}`.trim();
          }
          if (!fullName) fullName = 'New User';

          const phoneVal = findVal(['phone', 'phonenumber', 'contact', 'mobile', 'cell', 'phoneno', 'tel', 'contactno', 'msisdn', 'mobilephone', 'phno', 'ph']);
          const phone = phoneVal !== null && phoneVal !== undefined ? String(phoneVal).trim() : '';
          
          const phone2Val = findVal(['phone2', 'secondaryphone', 'altphone', 'whatsapp', 'mobile2', 'contact2', 'alternativephone', 'alternatecontact']);
          const phone2 = phone2Val !== null && phone2Val !== undefined ? String(phone2Val).trim() : '';
          const address = findVal(['address', 'installationaddress', 'homeaddress', 'location', 'siteaddress', 'subscriberaddress', 'physicaladdress', 'instaddr', 'houseaddress', 'billingaddress']) || '';
          const plan = findVal(['plan', 'subscription', 'package', 'internetplan', 'internetpackage', 'serviceplan', 'subplan', 'currentplan']) || firstAvailablePlan;
          const monthlyFee = Number(findVal(['monthlyfee', 'fee', 'price', 'amount', 'cost', 'rate', 'monthlybill', 'billamount', 'charges'])) || settings.planPrices[plan] || 0;
          const balance = Number(findVal(['balance', 'arrears', 'due', 'outstanding', 'debt', 'totaldue', 'pendingpayment', 'remainingbalance'])) || 0;
          const discount = Number(findVal(['discount', 'monthlydiscount', 'persistentdiscount', 'off', 'rebate', 'less', 'promo'])) || 0;
          
          const expiryRaw = findVal(['expiry', 'expirydate', 'validuntil', 'expdate', 'duedate', 'enddate', 'subscriptionexpiry', 'renewaldate', 'nextpaymentdate', 'expiredon']);
          let expiryIso = getDefaultExpiryString();
          if (expiryRaw) {
            if (typeof expiryRaw === 'number') {
                const excelDate = new Date((expiryRaw - (25567 + 1)) * 86400 * 1000);
                if (!isNaN(excelDate.getTime())) expiryIso = excelDate.toISOString();
            } else {
                const d = new Date(expiryRaw);
                if (!isNaN(d.getTime())) {
                    expiryIso = d.toISOString();
                }
            }
          }

          return {
            id: generateId(),
            username: String(username),
            name: String(fullName),
            phone,
            phone2,
            address: String(address),
            plan: String(plan),
            monthlyFee,
            balance,
            persistentDiscount: discount,
            expiryDate: expiryIso,
            createdAt: new Date().toISOString(),
            lastPaymentDate: new Date().toISOString(),
            status: 'active',
            activatedMonths: [] // Master Directory - no month assigned yet
          };
        }) as UserRecord[];
        
        if (imported.length > 0) {
          onBulkAddUsers(imported);
          setAlertConfig({
            title: 'Batch Import Success',
            message: `Detected and processed ${imported.length} subscribers from the provided file.`,
            type: 'success'
          });
        }
      } catch (err) { 
        console.error("Import Error:", err);
        setAlertConfig({
          title: 'Import Failed',
          message: 'The system could not parse the file. Please ensure it is a valid CSV or Excel document.',
          type: 'error'
        });
      }
    };
    reader.readAsArrayBuffer(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClearBalance = (user: UserRecord) => {
    onUpdateUser({ ...user, balance: 0 });
  };

  const handleSendReminder = (user: UserRecord, type: 'sms' | 'whatsapp') => {
    const monthlyNet = user.monthlyFee - (user.persistentDiscount || 0);
    const totalDue = monthlyNet + (user.balance || 0);
    const expiryStr = new Date(user.expiryDate).toLocaleDateString();
    
    const msg = `*${settings.businessName} BILLING*\n\n` +
                `Dear *${user.name}* (@${user.username}),\n` +
                `This is a reminder regarding your *${user.plan}* subscription.\n\n` +
                `• Monthly Fee: Rs. ${(monthlyNet || 0).toLocaleString()}\n` +
                `• Prev. Arrears: Rs. ${(user.balance || 0).toLocaleString()}\n` +
                `--------------------------\n` +
                `*TOTAL PAYABLE: Rs. ${(totalDue || 0).toLocaleString()}*\n` +
                `--------------------------\n` +
                `Valid Until: ${expiryStr}\n\n` +
                `Please clear your dues today to ensure uninterrupted service. If already paid, kindly ignore.\n\n` +
                `Thank you for choosing ${settings.businessName}!`;
    
    if (type === 'sms') {
      window.location.href = `sms:${user.phone}?body=${encodeURIComponent(msg.replace(/\*/g, ''))}`;
    } else {
      shareToWhatsApp(user.phone, msg);
    }
  };

  const handleQuickActivate = (userIds: string[]) => {
    userIds.forEach(id => {
      const user = users.find(u => u.id === id);
      if (!user) return;
      const months = new Set(user.activatedMonths || []);
      months.add(currentMonth);
      onUpdateUser({
        ...user,
        activatedMonths: Array.from(months),
        status: 'active',
      });
    });
    // Switch to active customers view after activation
    setShowAllUsers(false);
    setSelectedMonth(currentMonth);
    setShowMonthlyFolders(false);
    setShowQuickActivate(false);
  };

  // Long press handlers for context menu
  const handleLongPressStart = (e: React.TouchEvent | React.MouseEvent, user: UserRecord) => {
    if (readOnly) return;
    longPressTimer.current = setTimeout(() => {
      const touch = 'touches' in e ? e.touches[0] : e as React.MouseEvent;
      setContextMenu({ user, x: touch.clientX, y: touch.clientY });
    }, 500);
  };
  const handleLongPressEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  // Bulk change plan handler
  const handleBulkChangePlan = () => {
    if (!bulkNewPlan || selectedIds.length === 0) return;
    const price = settings.planPrices?.[bulkNewPlan] || 0;
    selectedIds.forEach(id => {
      const user = users.find(u => u.id === id);
      if (user) onUpdateUser({ ...user, plan: bulkNewPlan, monthlyFee: price });
    });
    setShowBulkChangePlan(false);
    setBulkNewPlan('');
    setSelectedIds([]);
    setAlertConfig({ title: 'Plan Updated', message: `${selectedIds.length} users ka plan "${bulkNewPlan}" ho gaya — Rs. ${price}/mo.`, type: 'success' });
  };

  const filteredUsers = useMemo(() => {
    // If showAllUsers: show all users (for Total Users card)
    // Otherwise: filter by selected month (activatedMonths)
    let result = showAllUsers
      ? [...users]
      : users.filter(user => (user.activatedMonths || []).includes(selectedMonth));

    // Then apply search
    result = result.filter(user => 
      (user.name || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
      (user.username || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (user.phone || '').includes(searchTerm)
    );
    
    const hasPaid = (u: UserRecord) => receipts.some(r => r.userId === u.id && r.period && r.period.includes(selectedMonth.split(' ')[0]));
    if (sortKey === 'account_id_asc') result.sort((a,b) => (a.username||'').localeCompare(b.username||''));
    else if (sortKey === 'account_id_desc') result.sort((a,b) => (b.username||'').localeCompare(a.username||''));
    else if (sortKey === 'name_asc') result.sort((a,b) => (a.name||'').localeCompare(b.name||''));
    else if (sortKey === 'name_desc') result.sort((a,b) => (b.name||'').localeCompare(a.name||''));
    else if (sortKey === 'reg_date_desc') result.sort((a,b) => new Date(b.createdAt||0).getTime() - new Date(a.createdAt||0).getTime());
    else if (sortKey === 'reg_date_asc') result.sort((a,b) => new Date(a.createdAt||0).getTime() - new Date(b.createdAt||0).getTime());
    else if (sortKey === 'expiry_asc') result.sort((a,b) => new Date(a.expiryDate||0).getTime() - new Date(b.expiryDate||0).getTime());
    else if (sortKey === 'expiry_desc') result.sort((a,b) => new Date(b.expiryDate||0).getTime() - new Date(a.expiryDate||0).getTime());
    else if (sortKey === 'plan_asc') result.sort((a,b) => (a.plan||'').localeCompare(b.plan||''));
    else if (sortKey === 'fee_asc') result.sort((a,b) => (a.monthlyFee||0) - (b.monthlyFee||0));
    else if (sortKey === 'fee_desc') result.sort((a,b) => (b.monthlyFee||0) - (a.monthlyFee||0));
    else if (sortKey === 'balance_asc') result.sort((a,b) => (a.balance||0) - (b.balance||0));
    else if (sortKey === 'balance_desc') result.sort((a,b) => (b.balance||0) - (a.balance||0));
    else if (sortKey === 'paid_first') result.sort((a,b) => (hasPaid(b)?1:0) - (hasPaid(a)?1:0));
    else if (sortKey === 'pending_first') result.sort((a,b) => (hasPaid(a)?1:0) - (hasPaid(b)?1:0));
    
    return result;
  }, [users, searchTerm, sortKey, selectedMonth, showAllUsers]);

  return (
    <div className="flex flex-col md:flex-row min-h-[calc(100vh-8rem)] bg-[#f8fafc] dark:bg-[#030712] rounded-3xl overflow-hidden border border-slate-200 dark:border-white/5">
      {/* Sidebar for Desktop */}
      <div className={`hidden md:flex flex-col transition-all duration-500 border-r border-slate-200 dark:border-white/5 bg-white dark:bg-[#0f172a] overflow-hidden ${showMonthlyFolders ? 'w-72 p-6' : 'w-0 p-0 border-r-0'}`}>
        <div className="mb-8 flex justify-between items-start min-w-[240px]">
          <div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Monthly Folders</h3>
            <p className="text-[10px] text-slate-600 dark:text-slate-400 font-black uppercase tracking-widest mt-1">Select Period to View</p>
          </div>
          <button 
            onClick={() => setShowMonthlyFolders(false)}
            className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl text-slate-500 transition-colors"
            title="Hide Folders"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"></path></svg>
          </button>
        </div>
        <div className="space-y-2 overflow-y-auto custom-scrollbar flex-1 min-w-[240px]">
          {availableMonths.map(month => (
            <button
              key={month}
              onClick={() => setSelectedMonth(month)}
              className={`w-full text-left px-5 py-4 rounded-2xl font-bold text-xs uppercase tracking-widest transition-all ${
                selectedMonth === month 
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' 
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5'
              }`}
            >
              {month} {month === currentMonth && <span className="ml-2 text-[9px] bg-white/20 px-2 py-0.5 rounded-full">ACTIVE</span>}
            </button>
          ))}
          {availableMonths.length === 0 && (
            <div className="text-center py-10 text-slate-400 text-xs">No records found</div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-6 transition-all overflow-x-hidden">
        {/* Mobile Month Selector */}
        <div className="md:hidden mb-6">
          <label className="text-[10px] font-black text-slate-600 dark:text-slate-300 uppercase tracking-widest mb-2 block">Select Month</label>
          <select 
            value={selectedMonth} 
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="w-full p-4 bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-white/5 font-bold text-slate-900 dark:text-white outline-none shadow-sm"
          >
            {availableMonths.map(m => <option key={m} value={m} className="bg-white dark:bg-[#0f172a]">{m}</option>)}
          </select>
        </div>

        <div className="space-y-6 pb-24">
          <div className="space-y-1 flex justify-between items-start">
            <div>
              <h3 className="text-3xl font-black text-black dark:text-white uppercase leading-none">
                {showAllUsers ? 'Master Directory' : selectedMonth === currentMonth ? 'Active Customers' : `Archive: ${selectedMonth}`}
              </h3>
              <p className="text-[10px] text-slate-600 dark:text-slate-400 font-black uppercase tracking-[0.2em]">
                {showAllUsers ? `${users.length} Total Registered Users — Profiles Only` : selectedMonth === currentMonth ? 'Current Month Active Subscribers' : 'Read-Only Historical Data'}
              </p>
            </div>
            {/* Master Directory mode mein Quick Activate button show karo */}
            {showAllUsers && (
              <button
                onClick={() => setShowQuickActivate(true)}
                className="flex px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest items-center gap-2 transition-all active:scale-95"
              >
                ⚡ Activate
              </button>
            )}
            {!showAllUsers && !showMonthlyFolders && (
              <button 
                onClick={() => setShowMonthlyFolders(true)}
                className="hidden md:flex px-4 py-2 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/5 rounded-xl shadow-sm text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 hover:bg-slate-50 transition-all items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"></path></svg>
                View Folders
              </button>
            )}
          </div>

          <div className="relative group">
            <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl text-slate-400 group-focus-within:text-indigo-500 transition-colors">🔍</span>
            <input 
              type="text" 
              placeholder="Search directory..." 
              className="w-full pl-16 pr-8 py-5 bg-white dark:bg-[#0f172a] text-slate-900 dark:text-slate-100 rounded-[2.5rem] font-bold text-lg outline-none shadow-xl border border-slate-200 dark:border-white/5 focus:border-indigo-500/50 transition-all placeholder-slate-300 dark:placeholder-slate-600"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px] flex items-center gap-3 bg-white dark:bg-[#0f172a] px-5 py-4 rounded-2xl border border-slate-200 dark:border-white/5 shadow-lg">
              <span className="text-slate-600 dark:text-slate-300 text-xs font-black">🔃 SORT BY</span>
              <select 
                className="bg-transparent text-slate-900 dark:text-slate-100 font-black text-[10px] uppercase tracking-widest outline-none w-full appearance-none cursor-pointer"
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
              >
                <option value="none">DEFAULT</option>
                <option value="account_id_asc">ID (A→Z)</option>
                <option value="account_id_desc">ID (Z→A)</option>
                <option value="name_asc">NAME (A→Z)</option>
                <option value="name_desc">NAME (Z→A)</option>
                <option value="paid_first">PAID FIRST</option>
                <option value="pending_first">PENDING FIRST</option>
                <option value="plan_asc">PLAN (A→Z)</option>
                <option value="fee_desc">FEE (HIGH→LOW)</option>
                <option value="fee_asc">FEE (LOW→HIGH)</option>
                <option value="balance_desc">BALANCE (HIGH→LOW)</option>
                <option value="expiry_asc">EXPIRY (EARLIEST)</option>
                <option value="expiry_desc">EXPIRY (LATEST)</option>
                <option value="reg_date_desc">REG DATE (NEWEST)</option>
              </select>
            </div>
            
            {isCurrentMonth && (
              <>
                <button onClick={downloadCustomerTemplate} className="p-5 bg-white dark:bg-[#0f172a] text-slate-700 dark:text-slate-200 rounded-2xl border border-slate-200 dark:border-white/5 shadow-lg active:scale-95 transition-all hover:bg-slate-50 dark:hover:bg-slate-800" title="Download Template">📋</button>
                <button onClick={() => fileInputRef.current?.click()} className="p-5 bg-white dark:bg-[#0f172a] text-slate-700 dark:text-slate-200 rounded-2xl border border-slate-200 dark:border-white/5 shadow-lg active:scale-95 transition-all hover:bg-slate-50 dark:hover:bg-slate-800" title="Import Excel">
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
</button>
                <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx, .xls, .csv" onChange={handleImportExcel} />
              </>
            )}
            <button onClick={handleExportExcel} className="p-5 bg-white dark:bg-[#0f172a] text-slate-700 dark:text-slate-200 rounded-2xl border border-slate-200 dark:border-white/5 shadow-lg active:scale-95 transition-all hover:bg-slate-50 dark:hover:bg-slate-800" title="Export Excel">
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {!readOnly && isCurrentMonth && (
              <>
                <button onClick={() => { resetForm(); setShowForm(true); }} className="bg-[#5a4ff0] text-white py-5 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-2xl flex items-center justify-center gap-2 hover:bg-[#4a3fdf] transition-colors active:scale-95 duration-200">➕ NEW CUSTOMER</button>
                <button onClick={() => setShowQuickActivate(true)} className="bg-violet-600 hover:bg-violet-700 text-white py-5 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-2xl flex items-center justify-center gap-2 transition-colors active:scale-95 duration-200">⚡ QUICK ACTIVATE</button>
                <button onClick={() => setShowImportHistory(true)} className="bg-white dark:bg-[#0f172a] text-indigo-600 dark:text-indigo-400 py-5 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg border border-indigo-100 dark:border-indigo-500/20 hover:bg-indigo-50 dark:hover:bg-indigo-500/5 transition-colors flex items-center justify-center gap-2 active:scale-95 duration-200"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg> IMPORT FROM HISTORY</button>
                <button onClick={() => onBulkDeleteUsers(selectedIds)} disabled={selectedIds.length === 0} className="bg-slate-100 dark:bg-[#0f172a] text-slate-900 dark:text-white py-5 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg disabled:opacity-30 border border-slate-200 dark:border-white/5 hover:bg-slate-200 dark:hover:bg-[#1e293b] active:scale-95 duration-200">DELETE ALL</button>
                <button onClick={() => { if(selectedIds.length === 0){ setAlertConfig({title:'No Selection',message:'Pehle users select karein phir plan change karein.',type:'info'}); return; } setBulkNewPlan(availablePlans[0]||''); setShowBulkChangePlan(true); }} className="bg-amber-500 hover:bg-amber-600 text-white py-5 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg border border-amber-400 active:scale-95 duration-200 flex items-center justify-center gap-2"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> CHANGE PLAN {selectedIds.length > 0 && <span className="bg-white/20 px-2 py-0.5 rounded-full text-[9px]">{selectedIds.length}</span>}</button>
              </>
            )}
          </div>

          <div className="bg-white dark:bg-[#0f172a] rounded-[2.5rem] overflow-hidden shadow-2xl border border-slate-200 dark:border-white/5 mt-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[900px]">
                <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-white/5 text-[9px] uppercase font-black tracking-widest text-slate-600 dark:text-slate-400">
                  <tr>
                    <th className="px-6 py-6 w-16">
                       {!readOnly && isCurrentMonth && (
                         <input type="checkbox" className="w-5 h-5 rounded border-slate-300 dark:border-white/10 bg-transparent text-indigo-600 focus:ring-0"
                          checked={selectedIds.length > 0 && selectedIds.length === filteredUsers.length}
                          onChange={() => setSelectedIds(selectedIds.length === filteredUsers.length ? [] : filteredUsers.map(u => u.id))}
                         />
                       )}
                    </th>
                    {([
                      { label: 'ACCOUNT ID', asc: 'account_id_asc', desc: 'account_id_desc' },
                      { label: 'FULL NAME', asc: 'name_asc', desc: 'name_desc' },
                      { label: 'PHONE', asc: null, desc: null },
                      { label: 'PHONE 2', asc: null, desc: null },
                      { label: 'ADDRESS', asc: null, desc: null },
                      { label: 'PLAN', asc: 'plan_asc', desc: 'plan_asc' },
                      { label: 'MONTHLY FEE', asc: 'fee_asc', desc: 'fee_desc' },
                      { label: 'STATUS', asc: 'paid_first', desc: 'pending_first', center: true },
                      { label: 'DISCOUNT', asc: null, desc: null, center: true },
                      { label: 'EXPIRY', asc: 'expiry_asc', desc: 'expiry_desc' },
                    ] as { label: string; asc: SortKey | null; desc: SortKey | null; center?: boolean }[]).map(col => (
                      <th key={col.label} className={`px-6 py-6 ${col.center ? 'text-center' : ''} ${col.asc ? 'cursor-pointer select-none group' : ''}`}
                        onClick={() => {
                          if (!col.asc) return;
                          setSortKey(prev => prev === col.asc ? (col.desc || 'none') : (col.asc || 'none'));
                        }}
                      >
                        <span className="flex items-center gap-1 whitespace-nowrap">
                          {col.label}
                          {col.asc && (
                            <span className="text-[10px] opacity-40 group-hover:opacity-100 transition-opacity">
                              {sortKey === col.asc ? '▲' : sortKey === col.desc ? '▼' : '⇅'}
                            </span>
                          )}
                        </span>
                      </th>
                    ))}
                    {!readOnly && <th className="px-6 py-6 text-center">ACTION</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                  {filteredUsers.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="px-8 py-12 text-center text-slate-500 dark:text-slate-400 text-sm font-bold">
                        No customers found for {selectedMonth}.
                        {isCurrentMonth && <p className="text-xs mt-2 text-indigo-500">Add or Import users to get started.</p>}
                      </td>
                    </tr>
                  ) : (
                    filteredUsers.map((user) => {
                      return (
                        <tr key={user.id}
                          className="hover:bg-indigo-500/5 transition-colors group select-none"
                          onTouchStart={(e) => handleLongPressStart(e, user)}
                          onTouchEnd={handleLongPressEnd}
                          onTouchMove={handleLongPressEnd}
                          onMouseDown={(e) => { if(e.button === 2) return; handleLongPressStart(e, user); }}
                          onMouseUp={handleLongPressEnd}
                          onMouseLeave={handleLongPressEnd}
                          onContextMenu={(e) => { e.preventDefault(); setContextMenu({ user, x: e.clientX, y: e.clientY }); }}
                        >
                          <td className="px-6 py-6">
                            {!readOnly && isCurrentMonth && <input type="checkbox" className="w-5 h-5 rounded border-slate-300 dark:border-white/10 bg-transparent text-indigo-600 focus:ring-0" checked={selectedIds.includes(user.id)} onChange={() => setSelectedIds(prev => prev.includes(user.id) ? prev.filter(i => i !== user.id) : [...prev, user.id])} />}
                          </td>
                          <td className="px-6 py-6">
                             <span
                               className="text-sm font-bold text-indigo-600 dark:text-indigo-400 cursor-pointer hover:underline hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors"
                               onClick={() => isCurrentMonth && !readOnly ? handleEditClick(user) : undefined}
                               title={isCurrentMonth && !readOnly ? "Click to edit profile" : user.username}
                             >@{user.username}</span>
                          </td>
                          <td className="px-6 py-6">
                             <span className="text-sm font-black text-slate-900 dark:text-slate-100">{user.name}</span>
                          </td>
                          <td className="px-6 py-6">
                             <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{user.phone}</span>
                          </td>
                          <td className="px-6 py-6">
                             <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{user.phone2 || '-'}</span>
                          </td>
                          <td className="px-6 py-6">
                             <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 line-clamp-1 max-w-[150px]" title={user.address}>{user.address || '-'}</span>
                          </td>
                          <td className="px-6 py-6">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 uppercase">{user.plan}</span>
                            </div>
                          </td>
                          <td className="px-6 py-6">
                             <span className="text-xs font-black text-slate-900 dark:text-slate-100">Rs. {(user.monthlyFee || 0).toLocaleString()}</span>
                          </td>
                          <td className="px-6 py-6 text-center">
                            {(() => {
                              const hasReceipt = receipts.some(r => r.userId === user.id && r.period && r.period.includes(selectedMonth.split(' ')[0]));
                              const bal = user.balance || 0;
                              if (hasReceipt) {
                                return (
                                  <div className="flex flex-col items-center gap-1">
                                    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">Paid</span>
                                    {bal > 0 && <span className="text-[10px] font-black text-rose-500">+Rs.{bal.toLocaleString()}</span>}
                                  </div>
                                );
                              }
                              return (
                                <div className="flex flex-col items-center gap-1">
                                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-rose-100 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">Pending</span>
                                  {bal > 0 && <span className="text-[10px] font-black text-rose-500">Rs.{bal.toLocaleString()}</span>}
                                </div>
                              );
                            })()}
                          </td>
                          <td className="px-6 py-6 text-center">
                             <span className="text-xs font-black text-emerald-600">Rs. {(user.persistentDiscount || 0).toLocaleString()}</span>
                          </td>
                          <td className="px-6 py-6">
                             <span className="text-[10px] font-black uppercase text-slate-600 dark:text-slate-300 tracking-wider">
                               {new Date(user.expiryDate).toLocaleDateString()}
                             </span>
                          </td>
                          {!readOnly && (
                            <td className="px-6 py-6">
                              <div className="flex items-center justify-center gap-1.5 flex-nowrap min-w-max">
                                {/* Clear Balance */}
                                <button onClick={() => handleClearBalance(user)} title="Clear Balance" className="px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase text-slate-400 hover:text-white hover:bg-indigo-600 border border-slate-200 dark:border-white/10 transition-all">CLR</button>

                                {/* SMS */}
                                <button onClick={() => handleSendReminder(user, 'sms')} title="SMS Reminder" className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 hover:text-blue-600 transition-all">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg>
                                </button>

                                {/* WhatsApp */}
                                <button onClick={() => handleSendReminder(user, 'whatsapp')} title="WhatsApp" className="p-2 rounded-xl hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-all">
                                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" style={{color:'#25D366'}}>
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                                  </svg>
                                </button>

                                {/* Ledger */}
                                <button onClick={() => setViewingLedgerUser(user)} title="View Ledger" className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-700 dark:hover:text-white transition-all">
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/></svg>
                                </button>

                                {isCurrentMonth && (
                                  <>
                                    {/* Edit */}
                                    <button onClick={() => handleEditClick(user)} title="Edit Profile" className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                                    </button>
                                    {/* Delete */}
                                    <button onClick={() => onDeleteUser(user.id)} title="Delete User" className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-600 transition-all">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>   {showForm && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={resetForm}></div>
          <div className="bg-white dark:bg-[#0f172a] w-full max-w-2xl rounded-t-[3.5rem] shadow-2xl border-x border-t border-slate-200 dark:border-white/10 relative z-10 flex flex-col max-h-[92vh] animate-in slide-in-from-bottom duration-500">
            <div className="p-10 border-b border-slate-100 dark:border-white/5 flex items-center gap-4">
               <div className="w-14 h-14 bg-[#5a4ff0] rounded-3xl flex items-center justify-center text-white text-3xl shadow-2xl">👤</div>
               <h4 className="text-3xl font-black text-black dark:text-white leading-tight">{editingUser ? 'Update Profile' : 'Register New Subscriber'}</h4>
            </div>
            <form onSubmit={handleSubmit} className="p-10 overflow-y-auto custom-scrollbar space-y-10 pb-20">
              <div className="space-y-8">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest ml-2">ACCOUNT ID / USERNAME</label>
                  <input required className="w-full p-6 rounded-3xl bg-slate-50 dark:bg-[#030712] border border-slate-200 dark:border-white/5 font-bold outline-none text-slate-900 dark:text-white text-xl focus:border-indigo-500 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-700" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest ml-2">FULL NAME</label>
                  <input required className="w-full p-6 rounded-3xl bg-slate-50 dark:bg-[#030712] border border-slate-200 dark:border-white/5 font-bold outline-none text-slate-900 dark:text-white text-xl focus:border-indigo-500 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-700" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest ml-2">PHONE NUMBER</label>
                    <input required className="w-full p-6 rounded-3xl bg-slate-50 dark:bg-[#030712] border border-slate-200 dark:border-white/5 font-bold outline-none text-slate-900 dark:text-white text-xl focus:border-indigo-500 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-700" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest ml-2">PHONE NUMBER 2 (OPTIONAL)</label>
                    <input className="w-full p-6 rounded-3xl bg-slate-50 dark:bg-[#030712] border border-slate-200 dark:border-white/5 font-bold outline-none text-slate-900 dark:text-white text-xl focus:border-indigo-500 transition-all placeholder:text-slate-300 dark:placeholder:text-slate-700" value={formData.phone2} onChange={e => setFormData({...formData, phone2: e.target.value})} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest ml-2">PLAN</label>
                    <select className="w-full p-6 rounded-3xl bg-slate-50 dark:bg-[#030712] border border-slate-200 dark:border-white/5 font-black text-slate-900 dark:text-white text-lg outline-none appearance-none cursor-pointer" value={formData.plan} onChange={e => setFormData({...formData, plan: e.target.value, monthlyFee: settings.planPrices?.[e.target.value] || 0})}>
                      {availablePlans.map(p => <option key={p} value={p} className="bg-white dark:bg-[#0f172a]">{p} (Rs. {settings.planPrices?.[p]})</option>)}
                    </select>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest ml-2">EXPIRY DATE</label>
                    <input type="date" className="w-full p-6 rounded-3xl bg-slate-50 dark:bg-[#030712] border border-slate-200 dark:border-white/5 font-bold outline-none text-slate-900 dark:text-white text-xl focus:border-indigo-500 transition-all" value={formData.expiryDate} onChange={e => setFormData({...formData, expiryDate: e.target.value})} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-rose-600 dark:text-rose-500 uppercase tracking-widest ml-2">ARREARS / BALANCE</label>
                    <input type="number" className="w-full p-6 rounded-3xl bg-slate-50 dark:bg-[#030712] border border-rose-500/10 font-bold outline-none text-rose-600 dark:text-rose-500 text-2xl focus:border-rose-500/50 transition-all" value={formData.balance || 0} onChange={e => setFormData({...formData, balance: Number(e.target.value)})} />
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-emerald-600 dark:text-emerald-500 uppercase tracking-widest ml-1">MONTHLY DISCOUNT</label>
                    <input type="number" className="w-full p-6 rounded-3xl bg-slate-50 dark:bg-[#030712] border border-emerald-500/10 font-bold outline-none text-emerald-600 dark:text-emerald-500 text-2xl focus:border-emerald-500/50 transition-all" value={formData.persistentDiscount || 0} onChange={e => setFormData({...formData, persistentDiscount: Number(e.target.value)})} placeholder="0" />
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest ml-2">INSTALLATION ADDRESS</label>
                  <input className="w-full p-6 rounded-3xl bg-slate-50 dark:bg-[#030712] border border-slate-200 dark:border-white/5 font-bold outline-none text-slate-900 dark:text-white text-lg focus:border-indigo-500 transition-all" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest ml-2">NOTES / DESCRIPTION</label>
                  <textarea className="w-full p-6 rounded-3xl bg-slate-50 dark:bg-[#030712] border border-slate-200 dark:border-white/5 font-bold outline-none text-slate-900 dark:text-white text-lg min-h-[120px] focus:border-indigo-500 transition-all" placeholder="Specific instructions for this subscriber..." value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
                </div>
              </div>
              <div className="flex gap-4">
                <button type="submit" className="flex-1 bg-indigo-600 text-white py-6 rounded-3xl font-black text-[12px] uppercase tracking-[0.2em] shadow-2xl active:scale-95 active:translate-y-1 transition-all">SAVE RECORD</button>
                <button type="button" onClick={resetForm} className="px-10 bg-slate-100 dark:bg-[#1e293b] text-slate-500 dark:text-slate-400 py-6 rounded-3xl font-black text-[12px] uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all border border-slate-200 dark:border-white/5">CANCEL</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {viewingLedgerUser && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setViewingLedgerUser(null)}></div>
          <div className="bg-white dark:bg-[#0f172a] w-full max-w-4xl rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-white/10 relative z-10 flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-slate-100 dark:border-white/5 flex justify-between items-center bg-slate-50 dark:bg-white/5 rounded-t-[2.5rem]">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-2xl shadow-lg">📜</div>
                <div>
                  <h4 className="text-2xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight">Subscriber Ledger</h4>
                  <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Transaction History & Plan Details</p>
                </div>
              </div>
              <button onClick={() => setViewingLedgerUser(null)} className="p-3 bg-white dark:bg-slate-800 rounded-xl shadow-sm text-slate-500 dark:text-slate-400 font-bold hover:bg-rose-50 hover:text-rose-500 transition-colors">✕</button>
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-slate-50 dark:bg-white/5 p-6 rounded-3xl border border-slate-100 dark:border-white/5 text-slate-900 dark:text-slate-100">
                  <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Subscriber</p>
                  <p className="text-lg font-black text-slate-900 dark:text-white">{viewingLedgerUser.name}</p>
                  <p className="text-xs font-bold text-indigo-500 dark:text-indigo-400">@{viewingLedgerUser.username}</p>
                </div>
                <div className="bg-slate-50 dark:bg-white/5 p-6 rounded-3xl border border-slate-100 dark:border-white/5 text-slate-900 dark:text-slate-100">
                  <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Current Plan</p>
                  <p className="text-lg font-black text-slate-900 dark:text-white">{viewingLedgerUser.plan}</p>
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-400">Rs. {(viewingLedgerUser.monthlyFee || 0).toLocaleString()}/mo</p>
                </div>
                <div className="bg-slate-50 dark:bg-white/5 p-6 rounded-3xl border border-slate-100 dark:border-white/5 text-slate-900 dark:text-slate-100">
                  <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Outstanding Balance</p>
                  <p className={`text-2xl font-black ${(viewingLedgerUser.balance || 0) > 0 ? 'text-rose-600' : 'text-emerald-500 dark:text-emerald-400'}`}>
                    Rs. {(viewingLedgerUser.balance || 0).toLocaleString()}
                  </p>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <h5 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                    Active Periods
                  </h5>
                  <div className="flex flex-wrap gap-2">
                    {(viewingLedgerUser.activatedMonths || []).length > 0 ? (
                      (viewingLedgerUser.activatedMonths || []).map(month => (
                        <span key={month} className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-lg text-[10px] font-black uppercase tracking-wider border border-indigo-100 dark:border-indigo-500/20">
                          {month}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-slate-400 italic">No active periods recorded.</span>
                    )}
                  </div>
                </div>

                <div>
                  <h5 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-widest mb-4 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    Payment History
                  </h5>
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-white/5 overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[420px]">
                      <thead className="bg-slate-50 dark:bg-white/5 text-[9px] uppercase font-black tracking-widest text-slate-500">
                        <tr>
                          <th className="px-6 py-4">Date</th>
                          <th className="px-6 py-4">Ref #</th>
                          <th className="px-6 py-4">Period</th>
                          <th className="px-6 py-4 text-right">Amount</th>
                          <th className="px-6 py-4 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                        {receipts.filter(r => r.userId === viewingLedgerUser.id).length > 0 ? (
                          receipts
                            .filter(r => r.userId === viewingLedgerUser.id)
                            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                            .map(r => (
                              <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                                <td className="px-6 py-4 text-xs font-bold text-slate-700 dark:text-slate-300">
                                  {new Date(r.date).toLocaleDateString()}
                                </td>
                                <td className="px-6 py-4 text-[10px] font-mono text-slate-500 max-w-[100px]">
                                  <span className="block truncate" title={r.transactionRef}>{r.transactionRef}</span>
                                </td>
                                <td className="px-6 py-4 text-[10px] font-black uppercase text-indigo-600 dark:text-indigo-400">
                                  {r.period}
                                </td>
                                <td className="px-6 py-4 text-right text-xs font-black text-slate-900 dark:text-white">
                                  Rs. {r.paidAmount.toLocaleString()}
                                </td>
                                <td className="px-6 py-4 text-center">
                                  <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                                    r.status === PaymentStatus.SUCCESS 
                                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' 
                                      : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400'
                                  }`}>
                                    {r.status}
                                  </span>
                                </td>
                              </tr>
                            ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="px-6 py-8 text-center text-slate-400 text-xs">No transaction history found.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-6 border-t border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-white/5 rounded-b-[2.5rem] flex justify-end">
              <button onClick={() => setViewingLedgerUser(null)} className="px-8 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg hover:scale-105 transition-transform">
                Close Ledger
              </button>
            </div>
          </div>
        </div>
      )}
      {showImportHistory && (
        <ImportFromHistory 
          isOpen={showImportHistory}
          onClose={() => setShowImportHistory(false)}
          archives={archives}
          currentUsers={users}
          currentMonth={currentMonth}
          onImport={(usersToImport) => {
            setLoadingMessage(`Importing ${usersToImport.length} Records to ${currentMonth}...`);
            
            setTimeout(() => {
              const updatedUsers = [...users];
              const newUsersToAdd: UserRecord[] = [];

              usersToImport.forEach(sourceUser => {
                const existingIndex = updatedUsers.findIndex(u => u.username.toLowerCase() === sourceUser.username.toLowerCase());
                if (existingIndex > -1) {
                  const existingUser = updatedUsers[existingIndex];
                  const months = new Set(existingUser.activatedMonths || []);
                  months.add(currentMonth);
                  updatedUsers[existingIndex] = {
                    ...existingUser,
                    activatedMonths: Array.from(months)
                  };
                } else {
                  newUsersToAdd.push({
                    ...sourceUser,
                    id: generateId(),
                    activatedMonths: [], // Master Directory - no month assigned yet
                    createdAt: new Date().toISOString()
                  });
                }
              });

              if (newUsersToAdd.length > 0) {
                onBulkAddUsers(newUsersToAdd);
              }
              if (updatedUsers.length > 0) {
                onBulkUpdateUsers(updatedUsers);
              }
              setLoadingMessage(null);
              setAlertConfig({
                title: 'Data Migration Success',
                message: `Successfully imported ${usersToImport.length} users to ${currentMonth}.`,
                type: 'success'
              });
            }, 800);
          }}
        />
      )}
      {/* Modals */}
      {alertConfig && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setAlertConfig(null)}></div>
          <div className="relative z-10 w-full max-w-sm bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-100 dark:border-white/5 shadow-2xl text-center">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 ${alertConfig.type === 'success' ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-500' : alertConfig.type === 'error' ? 'bg-rose-100 dark:bg-rose-500/10 text-rose-500' : 'bg-indigo-100 dark:bg-indigo-500/10 text-indigo-500'}`}>
              {alertConfig.type === 'success' && <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"></path></svg>}
              {alertConfig.type === 'error' && <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>}
              {alertConfig.type === 'info' && <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>}
            </div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2 uppercase tracking-tight">{alertConfig.title}</h3>
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">{alertConfig.message}</p>
            <button 
              onClick={() => setAlertConfig(null)}
              className="w-full py-4 bg-slate-950 dark:bg-white text-white dark:text-slate-950 rounded-2xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-all shadow-xl"
            >
              Understand
            </button>
          </div>
        </div>
      )}
      {/* Context Menu (Long Press / Right Click) */}
      {contextMenu && (
        <div className="fixed inset-0 z-[300]" onClick={() => setContextMenu(null)}>
          <div
            className="absolute bg-white dark:bg-[#0f172a] rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden min-w-[220px]"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 230),
              top: Math.min(contextMenu.y, window.innerHeight - 280),
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-5 py-4 bg-indigo-600 text-white">
              <p className="text-xs font-black uppercase tracking-widest truncate">{contextMenu.user.name}</p>
              <p className="text-[10px] text-indigo-200">@{contextMenu.user.username}</p>
            </div>
            <div className="py-2">
              {isCurrentMonth && !readOnly && (
                <button
                  onClick={() => { handleEditClick(contextMenu.user); setContextMenu(null); }}
                  className="w-full text-left px-5 py-3.5 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 flex items-center gap-3 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg> <span>Edit Profile</span>
                </button>
              )}
              <button
                onClick={() => {
                  const u = contextMenu.user;
                  const months = new Set(u.activatedMonths || []);
                  months.add(currentMonth);
                  onUpdateUser({ ...u, activatedMonths: Array.from(months), status: 'active' });
                  setContextMenu(null);
                  setAlertConfig({ title: 'Activated!', message: `${u.name} ko ${currentMonth} ke liye activate kar diya gaya.`, type: 'success' });
                }}
                className="w-full text-left px-5 py-3.5 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 flex items-center gap-3 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg> <span>Activate User</span>
              </button>
              {isCurrentMonth && !readOnly && (
                <div className="px-5 py-3.5 border-t border-slate-100 dark:border-white/5">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Change Plan</p>
                  <div className="flex gap-2">
                    <select
                      defaultValue={contextMenu.user.plan}
                      onChange={e => {
                        const newPlan = e.target.value;
                        const price = settings.planPrices?.[newPlan] || 0;
                        onUpdateUser({ ...contextMenu.user, plan: newPlan, monthlyFee: price });
                        setContextMenu(null);
                        setAlertConfig({ title: 'Plan Changed!', message: `${contextMenu.user.name} ka plan "${newPlan}" — Rs. ${price}/mo.`, type: 'success' });
                      }}
                      className="flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-800 text-xs font-black text-slate-800 dark:text-white outline-none"
                    >
                      {availablePlans.map(p => (
                        <option key={p} value={p}>{p} — Rs.{settings.planPrices?.[p]}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
              <button
                onClick={() => { setViewingLedgerUser(contextMenu.user); setContextMenu(null); }}
                className="w-full text-left px-5 py-3.5 text-sm font-black text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/5 flex items-center gap-3 transition-colors border-t border-slate-100 dark:border-white/5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg> <span>View Ledger</span>
              </button>
              {isCurrentMonth && !readOnly && (
                <button
                  onClick={() => { onDeleteUser(contextMenu.user.id); setContextMenu(null); }}
                  className="w-full text-left px-5 py-3.5 text-sm font-black text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 flex items-center gap-3 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg> <span>Delete User</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bulk Change Plan Modal */}
      {showBulkChangePlan && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setShowBulkChangePlan(false)}></div>
          <div className="relative z-10 w-full max-w-sm bg-white dark:bg-[#0f172a] rounded-[2.5rem] p-8 border border-slate-100 dark:border-white/5 shadow-2xl">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-amber-100 dark:bg-amber-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl"></div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Bulk Change Plan</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{selectedIds.length} users selected</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest block mb-2">New Plan Select Karein</label>
                <select
                  value={bulkNewPlan}
                  onChange={e => setBulkNewPlan(e.target.value)}
                  className="w-full p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-800 text-sm font-black text-slate-800 dark:text-white outline-none"
                >
                  {availablePlans.map(p => (
                    <option key={p} value={p}>{p} — Rs. {settings.planPrices?.[p]?.toLocaleString()}/mo</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowBulkChangePlan(false)}
                  className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl font-black text-[11px] uppercase tracking-widest"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkChangePlan}
                  className="flex-1 py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg active:scale-95 transition-all"
                >
                  ✅ Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showQuickActivate && (
        <QuickActivate
          users={users}
          onActivateUsers={handleQuickActivate}
          onClose={() => setShowQuickActivate(false)}
          theme={settings.theme || 'light'}
          currentMonth={currentMonth}
        />
      )}
    </div>
  );
};

export default UserManagement;
