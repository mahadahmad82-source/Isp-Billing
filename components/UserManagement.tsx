
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

type SortKey = 'account_id_asc' | 'reg_date_desc' | 'expiry_asc' | 'none';

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
      currentActivated.add(currentMonth);

      onUpdateUser({ 
        ...editingUser, 
        ...formData, 
        monthlyFee: currentPrice, 
        expiryDate: finalExpiryDate,
        activatedMonths: Array.from(currentActivated)
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
    if (users.length === 0) {
      setAlertConfig({
        title: 'Export Rejected',
        message: 'There are no customer records available to export at this time.',
        type: 'info'
      });
      return;
    }
    const dataToExport = users.map(u => ({
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
      'Registration Date': u.createdAt ? new Date(u.createdAt).toLocaleDateString() : 'N/A'
    }));
    
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Customers");
    XLSX.writeFile(workbook, `MahadNet_Export_${new Date().toISOString().split('T')[0]}.xlsx`);
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
            activatedMonths: [currentMonth]
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
    
    if (sortKey === 'account_id_asc') {
      result.sort((a, b) => (a.username || '').localeCompare(b.username || ''));
    } else if (sortKey === 'reg_date_desc') {
      result.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    } else if (sortKey === 'expiry_asc') {
      result.sort((a, b) => new Date(a.expiryDate || 0).getTime() - new Date(b.expiryDate || 0).getTime());
    }
    
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
                {selectedMonth === currentMonth ? 'Active Customers' : `Archive: ${selectedMonth}`}
              </h3>
              <p className="text-[10px] text-slate-600 dark:text-slate-400 font-black uppercase tracking-[0.2em]">
                {selectedMonth === currentMonth ? 'Manage Current Month Subscribers' : 'Read-Only Historical Data'}
              </p>
            </div>
            {!showMonthlyFolders && (
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
                <option value="none" className="bg-white dark:bg-[#0f172a]">DEFAULT VIEW</option>
                <option value="account_id_asc" className="bg-white dark:bg-[#0f172a]">ACCOUNT ID (A-Z)</option>
                <option value="reg_date_desc" className="bg-white dark:bg-[#0f172a]">REGISTRATION (NEWEST)</option>
                <option value="expiry_asc" className="bg-white dark:bg-[#0f172a]">EXPIRY (EARLIEST)</option>
              </select>
            </div>
            
            {isCurrentMonth && (
              <>
                <button onClick={downloadCustomerTemplate} className="p-5 bg-white dark:bg-[#0f172a] text-slate-700 dark:text-slate-200 rounded-2xl border border-slate-200 dark:border-white/5 shadow-lg active:scale-95 transition-all hover:bg-slate-50 dark:hover:bg-slate-800" title="Download Template">📋</button>
                <button onClick={() => fileInputRef.current?.click()} className="p-5 bg-white dark:bg-[#0f172a] text-slate-700 dark:text-slate-200 rounded-2xl border border-slate-200 dark:border-white/5 shadow-lg active:scale-95 transition-all hover:bg-slate-50 dark:hover:bg-slate-800" title="Import Excel">📥</button>
                <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx, .xls, .csv" onChange={handleImportExcel} />
              </>
            )}
            <button onClick={handleExportExcel} className="p-5 bg-white dark:bg-[#0f172a] text-slate-700 dark:text-slate-200 rounded-2xl border border-slate-200 dark:border-white/5 shadow-lg active:scale-95 transition-all hover:bg-slate-50 dark:hover:bg-slate-800" title="Export Excel">📤</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {!readOnly && isCurrentMonth && (
              <>
                <button onClick={() => { resetForm(); setShowForm(true); }} className="bg-[#5a4ff0] text-white py-5 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-2xl flex items-center justify-center gap-2 hover:bg-[#4a3fdf] transition-colors active:scale-95 duration-200">➕ NEW CUSTOMER</button>
                <button onClick={() => setShowImportHistory(true)} className="bg-white dark:bg-[#0f172a] text-indigo-600 dark:text-indigo-400 py-5 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg border border-indigo-100 dark:border-indigo-500/20 hover:bg-indigo-50 dark:hover:bg-indigo-500/5 transition-colors flex items-center justify-center gap-2 active:scale-95 duration-200">📥 IMPORT FROM HISTORY</button>
                <button onClick={() => onBulkDeleteUsers(selectedIds)} disabled={selectedIds.length === 0} className="bg-slate-100 dark:bg-[#0f172a] text-slate-900 dark:text-white py-5 rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg disabled:opacity-30 border border-slate-200 dark:border-white/5 hover:bg-slate-200 dark:hover:bg-[#1e293b] active:scale-95 duration-200">DELETE ALL</button>
              </>
            )}
          </div>

          <div className="bg-white dark:bg-[#0f172a] rounded-[2.5rem] overflow-hidden shadow-2xl border border-slate-200 dark:border-white/5 mt-4">
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[1000px]">
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
                    <th className="px-6 py-6">ACCOUNT ID</th>
                    <th className="px-6 py-6 font-black">FULL NAME</th>
                    <th className="px-6 py-6">PHONE</th>
                    <th className="px-6 py-6">PHONE 2</th>
                    <th className="px-6 py-6">ADDRESS</th>
                    <th className="px-6 py-6">PLAN</th>
                    <th className="px-6 py-6">MONTHLY FEE</th>
                    <th className="px-6 py-6 text-center">BALANCE</th>
                    <th className="px-6 py-6 text-center">DISCOUNT</th>
                    <th className="px-6 py-6">EXPIRY</th>
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
                        <tr key={user.id} className="hover:bg-indigo-500/5 transition-colors group">
                          <td className="px-6 py-6">
                            {!readOnly && isCurrentMonth && <input type="checkbox" className="w-5 h-5 rounded border-slate-300 dark:border-white/10 bg-transparent text-indigo-600 focus:ring-0" checked={selectedIds.includes(user.id)} onChange={() => setSelectedIds(prev => prev.includes(user.id) ? prev.filter(i => i !== user.id) : [...prev, user.id])} />}
                          </td>
                          <td className="px-6 py-6">
                             <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">@{user.username}</span>
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
                            <span className={`text-xs font-black ${(user.balance || 0) > 0 ? 'text-rose-600' : 'text-slate-500 dark:text-slate-400'}`}>
                              {(user.balance || 0) > 0 ? `Rs. ${(user.balance || 0).toLocaleString()}` : '0'}
                            </span>
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
                              <div className="flex items-center justify-center gap-3">
                                <button onClick={() => handleClearBalance(user)} className="text-[9px] font-black uppercase text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-white transition-colors">CLEAR</button>
                                <button className="text-lg hover:scale-125 transition-transform" title="SMS Reminder" onClick={() => handleSendReminder(user, 'sms')}>💬</button>
                                <button className="text-xl hover:scale-125 transition-transform text-emerald-600 drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]" title="Direct WhatsApp Inbox" onClick={() => handleSendReminder(user, 'whatsapp')}>📱</button>
                                <button onClick={() => setViewingLedgerUser(user)} className="text-lg hover:scale-125 transition-transform" title="View Ledger">📜</button>
                                {isCurrentMonth && (
                                  <>
                                    <button onClick={() => handleEditClick(user)} className="text-lg hover:scale-125 transition-transform">✏️</button>
                                    <button onClick={() => onDeleteUser(user.id)} className="text-lg hover:scale-125 transition-transform">🗑️</button>
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
                    <table className="w-full text-left">
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
                                <td className="px-6 py-4 text-[10px] font-mono text-slate-500">
                                  {r.transactionRef}
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
                    activatedMonths: [currentMonth],
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
    </div>
  );
};

export default UserManagement;
