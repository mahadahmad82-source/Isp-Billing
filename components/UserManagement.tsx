
import QuickActivate from './QuickActivate';
import React, { useState, useRef, useMemo } from 'react';
import { UserRecord, AppSettings, Receipt, PaymentStatus } from '../types';
import { generateId } from '../utils/storage';
import { shareToWhatsApp } from '../utils/whatsapp';
import * as XLSX from 'xlsx';

interface UserManagementProps {
  users: UserRecord[];
  receipts: Receipt[];
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
  customerStatusFilter?: 'all' | 'active' | 'expired';
  onClearCustomerStatusFilter?: () => void;
}

type SortKey = 'account_id_asc' | 'account_id_desc' | 'name_asc' | 'name_desc' | 'reg_date_desc' | 'reg_date_asc' | 'expiry_asc' | 'expiry_desc' | 'plan_asc' | 'fee_asc' | 'fee_desc' | 'balance_asc' | 'balance_desc' | 'paid_first' | 'pending_first' | 'none';

const UserManagement: React.FC<UserManagementProps> = ({ 
  users, 
  receipts = [],
  settings, 
  onAddUser, 
  onUpdateUser, 
  onDeleteUser, 
  onBulkAddUsers,
  onBulkDeleteUsers,
  onBulkUpdateUsers,
  readOnly = false,
  setLoadingMessage,
  initialFilter = 'all',
  customerStatusFilter = 'all',
  onClearCustomerStatusFilter
}) => {
  const currentMonth = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date());
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);
  // initialFilter='all' means show all months (no folder filter), 'current_month' means show current month only
  const [showMonthlyFolders, setShowMonthlyFolders] = useState(false);
  const [showQuickActivate, setShowQuickActivate] = useState(false);
  const [showAllUsers, setShowAllUsers] = useState(initialFilter === 'all');

  // ── Customer status filter from sidebar ──────────────────
  const statusFilteredUsers = React.useMemo(() => {
    if (!customerStatusFilter || customerStatusFilter === 'all') return users;

    // Active = expiryDate is today or in the future (date-based, never resets on month change)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isActive = (u: UserRecord) => {
      if (!u.expiryDate) return false;
      const exp = new Date(u.expiryDate);
      if (isNaN(exp.getTime())) return false;
      exp.setHours(0, 0, 0, 0);
      return exp >= today;
    };

    if (customerStatusFilter === 'active')  return users.filter(u =>  isActive(u));
    if (customerStatusFilter === 'expired') return users.filter(u => !isActive(u));
    return users;
  }, [users, customerStatusFilter]);

  // Sync view mode when sidebar filter changes
  React.useEffect(() => {
    if (customerStatusFilter === 'all') {
      setShowAllUsers(true);
      setShowMonthlyFolders(false);
    } else if (customerStatusFilter === 'active') {
      setShowAllUsers(true);   // show all (filtered) without folder constraint
      setShowMonthlyFolders(false);
    } else if (customerStatusFilter === 'expired') {
      setShowAllUsers(true);
      setShowMonthlyFolders(false);
    }
  }, [customerStatusFilter]);

  const [showForm, setShowForm] = useState(false);
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
  const [showBulkExpiry, setShowBulkExpiry] = useState(false);
  const [bulkExpiryText, setBulkExpiryText] = useState('');
  const [bulkExpiryResult, setBulkExpiryResult] = useState<{ updated: string[]; notFound: string[] } | null>(null);
  const [bulkExpiryActivate, setBulkExpiryActivate] = useState(true);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showColumnToggle, setShowColumnToggle] = useState(false);
  const columnToggleRef = useRef<HTMLDivElement>(null);

  const allColumns = [
    { key: 'account_id', label: 'Account ID' },
    { key: 'full_name', label: 'Full Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'phone2', label: 'Phone 2' },
    { key: 'address', label: 'Address' },
    { key: 'plan', label: 'Plan' },
    { key: 'monthly_fee', label: 'Monthly Fee' },
    { key: 'status', label: 'Payment' },
    { key: 'pay_exp', label: 'Pay + Expiry' },
    { key: 'discount', label: 'Discount' },
    { key: 'expiry', label: 'Expiry' },
  ] as const;

  type ColumnKey = typeof allColumns[number]['key'];

  const getDefaultVisibleColumns = (): Record<ColumnKey, boolean> => ({
    account_id: true, full_name: true, phone: true, phone2: false,
    address: false, plan: true, monthly_fee: true, status: false,
    pay_exp: true, discount: false, expiry: true,
  });

  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>(() => {
    try {
      const saved = localStorage.getItem('um_visible_columns');
      return saved ? JSON.parse(saved) : getDefaultVisibleColumns();
    } catch { return getDefaultVisibleColumns(); }
  });

  const toggleColumn = (key: ColumnKey) => {
    setVisibleColumns(prev => {
      const updated = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem('um_visible_columns', JSON.stringify(updated)); } catch {}
      return updated;
    });
  };

  // Close dropdown on outside click
  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (columnToggleRef.current && !columnToggleRef.current.contains(e.target as Node)) {
        setShowColumnToggle(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  
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

  const handleQuickActivate = (userIds: string[], expiryDate?: string) => {
    userIds.forEach(id => {
      const user = users.find(u => u.id === id);
      if (!user) return;
      const months = new Set(user.activatedMonths || []);
      months.add(currentMonth);
      onUpdateUser({
        ...user,
        activatedMonths: Array.from(months),
        status: 'active',
        ...(expiryDate ? { expiryDate } : {}),
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

  // Bulk Expiry handler
  const handleBulkExpiry = () => {
    if (!bulkExpiryText.trim()) return;
    const lines = bulkExpiryText.trim().split('\n');
    const updated: string[] = [];
    const notFound: string[] = [];

    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed) return;
      // Support: username,date | username date | username\tdate
      const parts = trimmed.split(/[\s,;\t]+/);
      if (parts.length < 2) return;
      const username = parts[0].trim().toLowerCase();
      const rawDate = parts[1].trim();

      // Parse date: support YYYY-MM-DD and DD/MM/YYYY and DD-MM-YYYY
      let isoDate = rawDate;
      if (/^\d{2}[\/\-]\d{2}[\/\-]\d{4}$/.test(rawDate)) {
        const [dd, mm, yyyy] = rawDate.split(/[\/\-]/);
        isoDate = `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
      }
      // Validate date
      const parsed = new Date(isoDate);
      if (isNaN(parsed.getTime())) { notFound.push(`${parts[0]} (invalid date)`); return; }

      const user = users.find(u => (u.username || '').toLowerCase() === username);
      if (!user) { notFound.push(parts[0]); return; }

      onUpdateUser({ ...user, expiryDate: isoDate, ...(bulkExpiryActivate ? { status: 'active' } : {}) });
      updated.push(parts[0]);
    });

    setBulkExpiryResult({ updated, notFound });
    setBulkExpiryText('');
  };

  const filteredUsers = useMemo(() => {
    const isArchiveMonth = selectedMonth !== currentMonth;

    let result: UserRecord[];

    if (isArchiveMonth && !showAllUsers) {
      // Archive mode: show users active in that month (ignore active/expired filter)
      result = users.filter(user =>
        (user.activatedMonths || []).includes(selectedMonth) ||
        receipts.some(r => r.userId === user.id && r.period === selectedMonth)
      );
    } else {
      // Current month or Master Directory
      const baseUsers = customerStatusFilter !== 'all' ? statusFilteredUsers : users;
      result = (customerStatusFilter !== 'all' || showAllUsers)
        ? [...baseUsers]
        : baseUsers.filter(user => (user.activatedMonths || []).includes(selectedMonth));
    }

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
  }, [users, receipts, searchTerm, sortKey, selectedMonth, showAllUsers, customerStatusFilter, statusFilteredUsers]);

  return (
    <div className="flex flex-col md:flex-row min-h-[calc(100vh-8rem)] bg-[#f8fafc] dark:bg-[#030712] rounded-3xl overflow-hidden border border-slate-200 dark:border-white/5">

      {/* Active filter badge */}
      {customerStatusFilter !== 'all' && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-2 rounded-2xl shadow-xl
          bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest">
          <span className={`w-2 h-2 rounded-full ${customerStatusFilter === 'active' ? 'bg-emerald-400' : 'bg-rose-400'}`}/>
          {customerStatusFilter === 'active' ? 'Active Customers' : 'Expired Customers'}
          <button onClick={onClearCustomerStatusFilter} className="ml-1 hover:text-white/60 transition-colors">✕</button>
        </div>
      )}
  );
};

export default UserManagement;
