
import QuickActivate from './QuickActivate';
import React, { useState, useRef, useMemo } from 'react';
import { UserRecord, AppSettings, Receipt, PaymentStatus, CONNECTION_TYPES } from '../types';
import { generateId } from '../utils/storage';
import { shareToWhatsApp, sendWhatsAppDirect } from '../utils/whatsapp';
import { renderMessageTemplate } from '../utils/messageTemplates';
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

    // Active = activatedMonths includes current month OR expiryDate is today or future (matches Dashboard logic)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentMonth = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(today);
    const isActive = (u: UserRecord) => {
      if (u.status === 'pending' || u.status === 'deleted') return false;
      if (u.activatedMonths && u.activatedMonths.includes(currentMonth)) return true;
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
  const [showBulkSetArea, setShowBulkSetArea] = useState(false);
  const [bulkNewArea, setBulkNewArea] = useState('');
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
    { key: 'connection_type', label: 'Connection Type' },
    { key: 'area', label: 'Area' },
    { key: 'expiry', label: 'Expiry' },
  ] as const;

  type ColumnKey = typeof allColumns[number]['key'];

  const getDefaultVisibleColumns = (): Record<ColumnKey, boolean> => ({
    account_id: true, full_name: true, phone: true, phone2: false,
    address: false, plan: true, monthly_fee: true, status: false,
    pay_exp: true, discount: false, connection_type: true, area: false, expiry: true,
  });

  const [visibleColumns, setVisibleColumns] = useState<Record<ColumnKey, boolean>>(() => {
    try {
      const saved = localStorage.getItem('um_visible_columns');
      // Merge with defaults so newly-added columns (e.g. connection_type, area) show up
      // even for managers whose column preferences were saved before these existed.
      return saved ? { ...getDefaultVisibleColumns(), ...JSON.parse(saved) } : getDefaultVisibleColumns();
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
    d.setHours(23, 59, 0, 0);
    // Format: YYYY-MM-DDTHH:MM for datetime-local input
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
    connectionType: '',
    area: '',
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
      connectionType: '',
      area: '',
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
      expiryDate: (() => {
        const d = new Date(user.expiryDate || new Date());
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      })()
    });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isCurrentMonth) return;

    // Parse datetime-local value as local time (format: YYYY-MM-DDTHH:MM)
    let finalExpiryDate = new Date().toISOString();
    if (formData.expiryDate) {
      const parts = String(formData.expiryDate).match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
      if (parts) {
        const local = new Date(+parts[1], +parts[2]-1, +parts[3], +parts[4], +parts[5], 0, 0);
        if (!isNaN(local.getTime())) finalExpiryDate = local.toISOString();
      }
    }
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
      'Connection Type': u.connectionType || '',
      'Area': u.area || '',
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

  const handleSendReminder = async (user: UserRecord, type: 'sms' | 'whatsapp') => {
    const monthlyNet = user.monthlyFee - (user.persistentDiscount || 0);
    const totalDue = monthlyNet + (user.balance || 0);
    const expiryStr = new Date(user.expiryDate).toLocaleDateString();

    const msg = renderMessageTemplate(settings, 'billing_reminder', {
      businessName: settings.businessName,
      name: user.name,
      username: user.username,
      plan: user.plan,
      monthlyFee: monthlyNet || 0,
      balance: user.balance || 0,
      totalDue: totalDue || 0,
      expiryDate: expiryStr
    });
    
    if (type === 'sms') {
      window.location.href = `sms:${user.phone}?body=${encodeURIComponent(msg.replace(/\*/g, ''))}`;
    } else {
      // Sends directly through Ayesha's WhatsApp number — works even after the
      // number is fully migrated to Meta Cloud API (wa.me deep links need a regular
      // WhatsApp app logged into that number on this device, which won't be true
      // post-migration). Falls back to the old deep link only if the API send fails.
      const result = await sendWhatsAppDirect(user.phone, msg);
      if (!result.success) {
        console.error('[UserManagement] direct send failed, falling back to wa.me', result.error);
        shareToWhatsApp(user.phone, msg);
      }
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

  // Bulk set area handler
  const handleBulkSetArea = () => {
    if (!bulkNewArea.trim() || selectedIds.length === 0) return;
    const count = selectedIds.length;
    selectedIds.forEach(id => {
      const user = users.find(u => u.id === id);
      if (user) onUpdateUser({ ...user, area: bulkNewArea.trim() });
    });
    setShowBulkSetArea(false);
    setBulkNewArea('');
    setSelectedIds([]);
    setAlertConfig({ title: 'Area Updated', message: `${count} users ka area "${bulkNewArea.trim()}" set ho gaya.`, type: 'success' });
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
      // Support: username,date | username date HH:MM (time optional, default 23:59)
      const parts = trimmed.split(/[\s,;\t]+/);
      if (parts.length < 2) return;
      const username = parts[0].trim().toLowerCase();
      const rawDate = parts[1].trim();
      const rawTime = parts[2]?.trim() || '23:59';

      // Parse time HH:MM
      const timeParts = rawTime.match(/^(\d{1,2}):(\d{2})$/);
      const hh = timeParts ? +timeParts[1] : 23;
      const mn = timeParts ? +timeParts[2] : 59;

      // Parse date — support multiple formats
      let yr = 0, mo = 0, dy = 0;
      const isoMatch = rawDate.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      const slashDash = rawDate.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (isoMatch) {
        yr = +isoMatch[1]; mo = +isoMatch[2]; dy = +isoMatch[3];
      } else if (slashDash) {
        // if first part > 12 → DD/MM/YYYY, else treat as M/DD/YYYY (US format)
        if (+slashDash[1] > 12) {
          dy = +slashDash[1]; mo = +slashDash[2]; yr = +slashDash[3];
        } else {
          mo = +slashDash[1]; dy = +slashDash[2]; yr = +slashDash[3];
        }
      } else {
        notFound.push(`${parts[0]} (invalid date)`); return;
      }
      const local = new Date(yr, mo - 1, dy, hh, mn, 0, 0);
      if (isNaN(local.getTime())) { notFound.push(`${parts[0]} (invalid date)`); return; }
      const isoDate = local.toISOString();

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

      {/* Main Content */}
      <div className="flex-1 p-6 transition-all overflow-x-hidden">
        <div className="space-y-6 pb-24">
          <div className="space-y-1 flex justify-between items-start">
            <div>
              <h3 className="text-3xl font-black text-black dark:text-white uppercase leading-none">
                {customerStatusFilter === 'active' ? 'Active Customers' : customerStatusFilter === 'expired' ? 'Expired Customers' : showAllUsers ? 'Master Directory' : selectedMonth === currentMonth ? 'Active Customers' : `Archive: ${selectedMonth}`}
              </h3>
              <p className="text-[10px] text-slate-600 dark:text-slate-400 font-black uppercase tracking-[0.2em]">
                {customerStatusFilter === 'active' ? `${statusFilteredUsers.length} Active Subscribers` : customerStatusFilter === 'expired' ? `${statusFilteredUsers.length} Expired / Inactive Users` : showAllUsers ? `${users.length} Total Registered Users — Profiles Only` : selectedMonth === currentMonth ? 'Current Month Active Subscribers' : 'Read-Only Historical Data'}
              </p>
            </div>

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

          {!readOnly && isCurrentMonth && (
            <div className="rounded-2xl bg-white/5 dark:bg-white/3 backdrop-blur-xl border border-white/8 dark:border-white/5 p-2 shadow-xl overflow-x-auto custom-scrollbar">
              <div className="flex gap-2 min-w-max">
                {/* New Customer */}
                <button
                  onClick={() => { resetForm(); setShowForm(true); }}
                  className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#1e3a5f] hover:bg-[#1e4a7a] border border-[#2a5080] active:scale-95 transition-all whitespace-nowrap"
                >
                  <svg className="w-4 h-4 text-[#5b9bd5] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
                  <span className="text-[10px] font-black text-[#5b9bd5] uppercase tracking-wide">New</span>
                </button>

                {/* Quick Activate */}
                <button
                  onClick={() => setShowQuickActivate(true)}
                  className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#1a3d2e] hover:bg-[#1f4d38] border border-[#255c3e] active:scale-95 transition-all whitespace-nowrap"
                >
                  <svg className="w-4 h-4 text-[#4caf82] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                  <span className="text-[10px] font-black text-[#4caf82] uppercase tracking-wide">Activate</span>
                </button>

                {/* Change Plan */}
                <button
                  onClick={() => { if(selectedIds.length===0){setAlertConfig({title:'No Selection',message:'Pehle users select karein.',type:'info'});return;} setBulkNewPlan(availablePlans[0]||'');setShowBulkChangePlan(true); }}
                  className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#3d2f10] hover:bg-[#4d3b14] border border-[#5c4418] active:scale-95 transition-all whitespace-nowrap relative"
                >
                  <svg className="w-4 h-4 text-[#c9922a] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                  <span className="text-[10px] font-black text-[#c9922a] uppercase tracking-wide">
                    Plan {selectedIds.length > 0 && <span className="ml-0.5 bg-amber-400/30 px-1 py-0.5 rounded-full text-[8px]">{selectedIds.length}</span>}
                  </span>
                </button>

                {/* Delete All */}
                <button
                  onClick={() => onBulkDeleteUsers(selectedIds)}
                  disabled={selectedIds.length === 0}
                  className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#3d1a1a] hover:bg-[#4d2020] border border-[#5c2424] active:scale-95 transition-all disabled:opacity-25 whitespace-nowrap"
                >
                  <svg className="w-4 h-4 text-[#c94a4a] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                  <span className="text-[10px] font-black text-[#c94a4a] uppercase tracking-wide">Delete</span>
                </button>

                {/* Template */}
                <button
                  onClick={downloadCustomerTemplate}
                  className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#1e2530] hover:bg-[#262f3d] border border-[#2e3a4a] active:scale-95 transition-all whitespace-nowrap"
                >
                  <svg className="w-4 h-4 text-[#7a8fa6] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/></svg>
                  <span className="text-[10px] font-black text-[#7a8fa6] uppercase tracking-wide">Template</span>
                </button>

                {/* Import Excel */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#0f2e38] hover:bg-[#143847] border border-[#1a4a5c] active:scale-95 transition-all whitespace-nowrap"
                >
                  <svg className="w-4 h-4 text-[#3aaccc] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
                  <span className="text-[10px] font-black text-[#3aaccc] uppercase tracking-wide">Import</span>
                </button>

                {/* Export Excel */}
                <button
                  onClick={handleExportExcel}
                  className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#0f2e2a] hover:bg-[#143830] border border-[#1a4a42] active:scale-95 transition-all whitespace-nowrap"
                >
                  <svg className="w-4 h-4 text-[#3aaa96] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                  <span className="text-[10px] font-black text-[#3aaa96] uppercase tracking-wide">Export</span>
                </button>

                {/* Bulk Expiry */}
                <button
                  onClick={() => { setBulkExpiryText(''); setBulkExpiryResult(null); setShowBulkExpiry(true); }}
                  className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#1e1a3d] hover:bg-[#2a2550] border border-[#302880] active:scale-95 transition-all whitespace-nowrap"
                >
                  <svg className="w-4 h-4 text-[#8b7fde] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                  <span className="text-[10px] font-black text-[#8b7fde] uppercase tracking-wide">Expiry</span>
                </button>

                {/* Bulk Set Area */}
                <button
                  onClick={() => { if(selectedIds.length===0){setAlertConfig({title:'No Selection',message:'Pehle users select karein.',type:'info'});return;} setBulkNewArea(''); setShowBulkSetArea(true); }}
                  className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#0f2a3d] hover:bg-[#153650] border border-[#1a4560] active:scale-95 transition-all whitespace-nowrap relative"
                >
                  <svg className="w-4 h-4 text-[#4aa8e0] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                  <span className="text-[10px] font-black text-[#4aa8e0] uppercase tracking-wide">
                    Area {selectedIds.length > 0 && <span className="ml-0.5 bg-sky-400/30 px-1 py-0.5 rounded-full text-[8px]">{selectedIds.length}</span>}
                  </span>
                </button>

                <input type="file" ref={fileInputRef} className="hidden" accept=".xlsx,.xls,.csv" onChange={handleImportExcel} />
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-[#0f172a] rounded-[2.5rem] overflow-hidden shadow-2xl border border-slate-200 dark:border-white/5 mt-4">
            {/* Column Toggle Button */}
            <div className="flex justify-end px-6 pt-4 pb-2">
              <div className="flex items-center gap-3">
                {/* Total count badge */}
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-500/20">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${customerStatusFilter === 'active' ? 'bg-emerald-400' : customerStatusFilter === 'expired' ? 'bg-rose-400' : 'bg-indigo-400'}`}/>
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">
                    {filteredUsers.length}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    {customerStatusFilter === 'active' ? 'Active' : customerStatusFilter === 'expired' ? 'Expired' : showAllUsers ? 'Total' : 'Users'}
                  </span>
                </div>

                <div className="relative" ref={columnToggleRef}>
                <button
                  onClick={() => setShowColumnToggle(prev => !prev)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase tracking-widest transition-all"
                  title="Toggle Columns"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
                  </svg>
                  Columns
                </button>
                {showColumnToggle && (
                  <div className="absolute right-0 top-full mt-2 z-50 w-52 bg-white dark:bg-[#0f172a] rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                      <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Show / Hide</span>
                      <button
                        onClick={() => {
                          const all = getDefaultVisibleColumns();
                          const allVisible = Object.fromEntries(allColumns.map(c => [c.key, true])) as Record<ColumnKey, boolean>;
                          const anyHidden = Object.values(visibleColumns).some(v => !v);
                          const updated = anyHidden ? allVisible : all;
                          setVisibleColumns(updated);
                          try { localStorage.setItem('um_visible_columns', JSON.stringify(updated)); } catch {}
                        }}
                        className="text-[9px] font-black text-indigo-500 hover:text-indigo-700 uppercase tracking-widest"
                      >
                        {Object.values(visibleColumns).some(v => !v) ? 'All' : 'Default'}
                      </button>
                    </div>
                    <div className="py-2 max-h-72 overflow-y-auto">
                      {allColumns.map(col => (
                        <label key={col.key} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer transition-colors">
                          <input
                            type="checkbox"
                            checked={visibleColumns[col.key]}
                            onChange={() => toggleColumn(col.key)}
                            className="w-4 h-4 rounded border-slate-300 dark:border-white/20 text-blue-500 accent-blue-500 cursor-pointer"
                          />
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{col.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              </div>
            </div>
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
                      { key: 'account_id', label: 'ACCOUNT ID', asc: 'account_id_asc', desc: 'account_id_desc' },
                      { key: 'full_name', label: 'FULL NAME', asc: 'name_asc', desc: 'name_desc' },
                      { key: 'phone', label: 'PHONE', asc: null, desc: null },
                      { key: 'phone2', label: 'PHONE 2', asc: null, desc: null },
                      { key: 'address', label: 'ADDRESS', asc: null, desc: null },
                      { key: 'plan', label: 'PLAN', asc: 'plan_asc', desc: 'plan_asc' },
                      { key: 'monthly_fee', label: 'MONTHLY FEE', asc: 'fee_asc', desc: 'fee_desc' },
                      { key: 'status', label: 'PAYMENT', asc: 'paid_first', desc: 'pending_first', center: true },
                      { key: 'pay_exp', label: 'STATUS', asc: null, desc: null, center: true },
                      { key: 'discount', label: 'DISCOUNT', asc: null, desc: null, center: true },
                      { key: 'connection_type', label: 'CONNECTION TYPE', asc: null, desc: null, center: true },
                      { key: 'area', label: 'AREA', asc: null, desc: null },
                      { key: 'expiry', label: 'EXPIRY', asc: 'expiry_asc', desc: 'expiry_desc' },
                    ] as { key: ColumnKey; label: string; asc: SortKey | null; desc: SortKey | null; center?: boolean }[])
                    .filter(col => visibleColumns[col.key])
                    .map(col => (
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
                      <td colSpan={14} className="px-8 py-12 text-center text-slate-500 dark:text-slate-400 text-sm font-bold">
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
                          {visibleColumns.account_id && (
                          <td className="px-6 py-6">
                             <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400 cursor-pointer hover:underline hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors"
                               onClick={() => isCurrentMonth && !readOnly ? handleEditClick(user) : undefined}
                               title={isCurrentMonth && !readOnly ? "Click to edit profile" : user.username}
                             >@{user.username}</span>
                          </td>)}
                          {visibleColumns.full_name && (
                          <td className="px-6 py-6">
                             <span className="text-sm font-black text-slate-900 dark:text-slate-100">{user.name}</span>
                          </td>)}
                          {visibleColumns.phone && (
                          <td className="px-6 py-6">
                             <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{user.phone}</span>
                          </td>)}
                          {visibleColumns.phone2 && (
                          <td className="px-6 py-6">
                             <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{user.phone2 || '-'}</span>
                          </td>)}
                          {visibleColumns.address && (
                          <td className="px-6 py-6">
                             <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 line-clamp-1 max-w-[150px]" title={user.address}>{user.address || '-'}</span>
                          </td>)}
                          {visibleColumns.plan && (
                          <td className="px-6 py-6">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 uppercase">{user.plan}</span>
                            </div>
                          </td>)}
                          {visibleColumns.monthly_fee && (
                          <td className="px-6 py-6">
                             <span className="text-xs font-black text-slate-900 dark:text-slate-100">Rs. {(user.monthlyFee || 0).toLocaleString()}</span>
                          </td>)}
                          {visibleColumns.status && (
                          <td className="px-6 py-6 text-center">
                            {(() => {
                              const hasReceipt = receipts.some(r => r.userId === user.id && r.period && r.period.includes(selectedMonth.split(' ')[0]));
                              const bal = user.balance || 0;
                              if (hasReceipt) return (
                                <div className="flex flex-col items-center gap-1">
                                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">Paid</span>
                                  {bal > 0 && <span className="text-[10px] font-black text-rose-500">+Rs.{bal.toLocaleString()}</span>}
                                </div>
                              );
                              return (
                                <div className="flex flex-col items-center gap-1">
                                  <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-rose-100 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400">Pending</span>
                                  {bal > 0 && <span className="text-[10px] font-black text-rose-500">Rs.{bal.toLocaleString()}</span>}
                                </div>
                              );
                            })()}
                          </td>)}
                          {visibleColumns.pay_exp && (
                          <td className="px-6 py-4 text-center">
                            {(() => {
                              const hasReceipt = receipts.some(r => r.userId === user.id && r.period && r.period.includes(selectedMonth.split(' ')[0]));
                              const today = new Date(); today.setHours(0,0,0,0);
                              const expDate = user.expiryDate ? new Date(user.expiryDate) : null;
                              const isExpired = !expDate || expDate < today;
                              return (
                                <div className="flex flex-col items-center gap-1">
                                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${hasReceipt ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-rose-100 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400'}`}>
                                    {hasReceipt ? '✓ Paid' : '⏳ Pending'}
                                  </span>
                                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${!isExpired ? 'bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400' : 'bg-slate-100 text-slate-500 dark:bg-white/5 dark:text-slate-500'}`}>
                                    {!isExpired ? '🟢 Active' : '🔴 Expired'}
                                  </span>
                                </div>
                              );
                            })()}
                          </td>)}
                          {visibleColumns.discount && (
                          <td className="px-6 py-6 text-center">
                             <span className="text-xs font-black text-emerald-600">Rs. {(user.persistentDiscount || 0).toLocaleString()}</span>
                          </td>)}
                          {visibleColumns.connection_type && (
                          <td className="px-6 py-6 text-center">
                            {user.connectionType ? (
                              <span className="px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-400">{user.connectionType}</span>
                            ) : (
                              <span className="text-[10px] text-slate-400">—</span>
                            )}
                          </td>)}
                          {visibleColumns.area && (
                          <td className="px-6 py-6">
                             <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{user.area || '—'}</span>
                          </td>)}
                          {visibleColumns.expiry && (
                          <td className="px-6 py-6">
                             <span className="text-[10px] font-black uppercase text-slate-600 dark:text-slate-300 tracking-wider">
                               {new Date(user.expiryDate).toLocaleDateString()}<br/>
                               <span className="text-indigo-400">{new Date(user.expiryDate).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', hour12:false})}</span>
                             </span>
                          </td>)}
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

                                {customerStatusFilter === 'active' && (
                                  /* Remove from Active List — undo an accidental activation, user stays in directory */
                                  <button
                                    onClick={() => {
                                      if (window.confirm(`${user.name} ko active list se hatayen? Directory mein rahega, sirf is mahine ki activation hatengi.`)) {
                                        onUpdateUser({ ...user, activatedMonths: (user.activatedMonths || []).filter(m => m !== currentMonth), expiryDate: '' });
                                      }
                                    }}
                                    title="Remove from Active List (Directory mein rahega)"
                                    className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 hover:text-amber-600 dark:hover:text-amber-400 transition-all"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                  </button>
                                )}

                                {isCurrentMonth && (
                                  <>
                                    {/* Edit */}
                                    <button onClick={() => handleEditClick(user)} title="Edit Profile" className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
                                    </button>
                                    {/* Delete — hidden in Active Customers view, the dedicated amber dustbin above already covers removing a mistaken activation */}
                                    {customerStatusFilter !== 'active' && (
                                      <button onClick={() => onDeleteUser(user.id)} title="Delete User" className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-600 transition-all">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                                      </button>
                                    )}
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
                    <input type="datetime-local" className="w-full p-6 rounded-3xl bg-slate-50 dark:bg-[#030712] border border-slate-200 dark:border-white/5 font-bold outline-none text-slate-900 dark:text-white text-xl focus:border-indigo-500 transition-all" value={formData.expiryDate} onChange={e => setFormData({...formData, expiryDate: e.target.value})} />
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest ml-2">CONNECTION TYPE</label>
                    <select className="w-full p-6 rounded-3xl bg-slate-50 dark:bg-[#030712] border border-slate-200 dark:border-white/5 font-black text-slate-900 dark:text-white text-lg outline-none appearance-none cursor-pointer" value={formData.connectionType || ''} onChange={e => setFormData({...formData, connectionType: e.target.value})}>
                      <option value="" className="bg-white dark:bg-[#0f172a]">— Select —</option>
                      {CONNECTION_TYPES.map(ct => <option key={ct} value={ct} className="bg-white dark:bg-[#0f172a]">{ct}</option>)}
                    </select>
                  </div>
                  <div className="space-y-3">
                    <label className="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest ml-2">AREA</label>
                    <input list="um-area-options" className="w-full p-6 rounded-3xl bg-slate-50 dark:bg-[#030712] border border-slate-200 dark:border-white/5 font-bold outline-none text-slate-900 dark:text-white text-lg focus:border-indigo-500 transition-all" placeholder="Area select ya naya likhein..." value={formData.area || ''} onChange={e => setFormData({...formData, area: e.target.value})} />
                    <datalist id="um-area-options">
                      {Array.from(new Set([...(settings.areas || []), ...users.map(u => u.area).filter(Boolean) as string[]])).map(a => (
                        <option key={a} value={a} />
                      ))}
                    </datalist>
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

      {/* Bulk Set Area Modal */}
      {showBulkSetArea && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setShowBulkSetArea(false)}></div>
          <div className="relative z-10 w-full max-w-sm bg-white dark:bg-[#0f172a] rounded-[2.5rem] p-8 border border-slate-100 dark:border-white/5 shadow-2xl">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-sky-100 dark:bg-sky-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl"></div>
              <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Bulk Set Area</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{selectedIds.length} users selected</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest block mb-2">Area Select Karein</label>
                <input
                  list="um-bulk-area-options"
                  value={bulkNewArea}
                  onChange={e => setBulkNewArea(e.target.value)}
                  placeholder="Area select ya naya likhein..."
                  className="w-full p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-800 text-sm font-black text-slate-800 dark:text-white outline-none"
                />
                <datalist id="um-bulk-area-options">
                  {Array.from(new Set([...(settings.areas || []), ...users.map(u => u.area).filter(Boolean) as string[]])).map(a => (
                    <option key={a} value={a} />
                  ))}
                </datalist>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowBulkSetArea(false)}
                  className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl font-black text-[11px] uppercase tracking-widest"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkSetArea}
                  disabled={!bulkNewArea.trim()}
                  className="flex-1 py-4 bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg active:scale-95 transition-all"
                >
                  ✅ Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showBulkExpiry && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => { setShowBulkExpiry(false); setBulkExpiryResult(null); }}></div>
          <div className="relative z-10 w-full max-w-md bg-white dark:bg-[#0f172a] rounded-[2.5rem] p-8 border border-slate-100 dark:border-white/5 shadow-2xl">
            {!bulkExpiryResult ? (
              <>
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-violet-100 dark:bg-violet-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">📅</div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Bulk Expiry Set</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Username aur expiry date paste karein — system automatically active kar dega</p>
                </div>
                <div className="space-y-4">
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-3 text-[10px] text-slate-500 dark:text-slate-400 font-mono leading-relaxed">
                    <div className="font-black text-slate-700 dark:text-slate-300 mb-1 text-[9px] uppercase tracking-widest">Format (ek line mein ek user):</div>
                    <div>username 2025-02-28 21:40</div>
                    <div>username,28/02/2025 23:59</div>
                    <div>username 28-02-2025 (time optional)</div>
                  </div>
                  <label className="flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-white/10 cursor-pointer select-none">
                    <div
                      onClick={() => setBulkExpiryActivate(v => !v)}
                      className={`w-10 h-6 rounded-full transition-all flex-shrink-0 relative ${bulkExpiryActivate ? 'bg-violet-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${bulkExpiryActivate ? 'left-5' : 'left-1'}`}/>
                    </div>
                    <div>
                      <div className="text-[11px] font-black text-slate-800 dark:text-white uppercase tracking-widest">Status bhi Active karo</div>
                      <div className="text-[10px] text-slate-400 dark:text-slate-500">{bulkExpiryActivate ? 'ON — expiry + status: active' : 'OFF — sirf expiry update hogi'}</div>
                    </div>
                  </label>
                  <textarea
                    value={bulkExpiryText}
                    onChange={e => setBulkExpiryText(e.target.value)}
                    placeholder={"ali123 2025-02-28 21:40\nbilal456 2025-03-31 23:59\nahmed789,28-02-2025 08:00"}
                    rows={8}
                    className="w-full p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-800 text-sm font-mono text-slate-800 dark:text-white outline-none resize-none focus:border-violet-500/50 transition-all placeholder-slate-300 dark:placeholder-slate-600"
                  />
                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setShowBulkExpiry(false)}
                      className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-2xl font-black text-[11px] uppercase tracking-widest"
                    >Cancel</button>
                    <button
                      onClick={handleBulkExpiry}
                      disabled={!bulkExpiryText.trim()}
                      className="flex-1 py-4 bg-violet-600 hover:bg-violet-700 disabled:opacity-30 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg active:scale-95 transition-all"
                    >✅ Apply</button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">✅</div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">Done!</h3>
                </div>
                <div className="space-y-4">
                  {bulkExpiryResult.updated.length > 0 && (
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-2xl p-4 border border-emerald-100 dark:border-emerald-500/20">
                      <div className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest mb-2">✅ Updated ({bulkExpiryResult.updated.length})</div>
                      <div className="text-xs text-emerald-800 dark:text-emerald-300 font-mono leading-relaxed max-h-32 overflow-y-auto">{bulkExpiryResult.updated.join(', ')}</div>
                    </div>
                  )}
                  {bulkExpiryResult.notFound.length > 0 && (
                    <div className="bg-rose-50 dark:bg-rose-900/20 rounded-2xl p-4 border border-rose-100 dark:border-rose-500/20">
                      <div className="text-[10px] font-black text-rose-700 dark:text-rose-400 uppercase tracking-widest mb-2">❌ Not Found / Error ({bulkExpiryResult.notFound.length})</div>
                      <div className="text-xs text-rose-800 dark:text-rose-300 font-mono leading-relaxed max-h-32 overflow-y-auto">{bulkExpiryResult.notFound.join(', ')}</div>
                    </div>
                  )}
                  <button
                    onClick={() => { setShowBulkExpiry(false); setBulkExpiryResult(null); }}
                    className="w-full py-4 bg-violet-600 hover:bg-violet-700 text-white rounded-2xl font-black text-[11px] uppercase tracking-widest shadow-lg active:scale-95 transition-all"
                  >Close</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showQuickActivate && (
        <QuickActivate
          users={users}
          onActivateUsers={handleQuickActivate}
          onClose={() => setShowQuickActivate(false)}
          theme={document.documentElement.classList.contains('dark') ? 'dark' : 'light'}
          currentMonth={currentMonth}
        />
      )}
    </div>
  );
};

export default UserManagement;
