
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { UserRecord, Receipt, AppSettings, PaymentStatus, PaymentMethod, ReceiptDesign } from '../types';
import { shareToWhatsApp } from '../utils/whatsapp';
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';

interface RecoverySummaryProps {
  users: UserRecord[];
  receipts: Receipt[];
  settings: AppSettings;
  onImportReceipts: (receipts: Receipt[]) => void;
  onBulkAddUsers: (users: UserRecord[]) => void;
  onBulkUpdateUsers: (users: UserRecord[]) => void;
  onDeletePeriod: (period: string) => void;
  onRenamePeriod: (oldPeriod: string, newPeriod: string) => void;
}

interface SummaryItem {
  period: string;
  totalPaid: number;
  totalAdvance: number;
  totalBalance: number;
  paidCount: number;
  activatedCount: number;
}

const RecoverySummary: React.FC<RecoverySummaryProps> = ({ 
  users, 
  receipts, 
  settings, 
  onImportReceipts, 
  onBulkAddUsers,
  onBulkUpdateUsers, 
  onDeletePeriod, 
  onRenamePeriod 
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [detailSearchTerm, setDetailSearchTerm] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [editingPeriod, setEditingPeriod] = useState<string | null>(null);
  const [newPeriodName, setNewPeriodName] = useState('');
  const [isImportingLegacy, setIsImportingLegacy] = useState(false);
  const [legacyMonth, setLegacyMonth] = useState(new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date()));
  const [legacyYear, setLegacyYear] = useState(new Date().getFullYear().toString());
  const [viewingReceipt, setViewingReceipt] = useState<Receipt | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const years = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - 5 + i).toString());

  const handleRenameClick = (e: React.MouseEvent, currentPeriod: string) => {
    e.stopPropagation();
    setEditingPeriod(currentPeriod);
    setNewPeriodName(currentPeriod);
  };

  const confirmRename = () => {
    if (editingPeriod && newPeriodName && newPeriodName.trim() !== "" && newPeriodName !== editingPeriod) {
      onRenamePeriod(editingPeriod, newPeriodName.trim());
      setEditingPeriod(null);
      setNewPeriodName('');
    } else {
      setEditingPeriod(null);
    }
  };

  // Group receipts by month for the main list and ALWAYS include the current month
  const monthlyData = useMemo(() => {
    const summaries: Record<string, SummaryItem> = {};
    
    // Auto-generate current month entry so ledger is always "Updated"
    const now = new Date();
    const currentPeriod = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(now);
    summaries[currentPeriod] = { period: currentPeriod, totalPaid: 0, totalAdvance: 0, totalBalance: 0, paidCount: 0, activatedCount: 0 };

    // Count activated users for each month
    (users || []).forEach(u => {
      (u.activatedMonths || []).forEach(m => {
        if (!summaries[m]) {
          summaries[m] = { period: m, totalPaid: 0, totalAdvance: 0, totalBalance: 0, paidCount: 0, activatedCount: 0 };
        }
        summaries[m].activatedCount += 1;
      });
    });

    (receipts || []).forEach(r => {
      const period = r.period;
      if (!summaries[period]) {
        summaries[period] = { period, totalPaid: 0, totalAdvance: 0, totalBalance: 0, paidCount: 0, activatedCount: 0 };
      }
      summaries[period].totalPaid += (r.paidAmount || 0);
      summaries[period].totalAdvance += (r.advanceAmount || 0);
      summaries[period].totalBalance += (r.balanceAmount || 0);
      summaries[period].paidCount += 1;
    });
    
    return Object.values(summaries).sort((a, b) => new Date(b.period).getTime() - new Date(a.period).getTime());
  }, [receipts, users]);

  const detailedList = useMemo(() => {
    if (!selectedMonth) return [];
    
    const filteredReceipts = (receipts || []).filter(r => r.period === selectedMonth);

    // Only show users who are either activated for this month OR have a receipt for this month
    let list = (users || []).filter(u => 
      (u.activatedMonths || []).includes(selectedMonth) || 
      filteredReceipts.some(r => r.userId === u.id)
    ).map(u => {
      const userReceipts = filteredReceipts.filter(r => r.userId === u.id);
      const hasPaid = userReceipts.length > 0;
      
      const paidSum = userReceipts.reduce((sum, r) => sum + (r.paidAmount - (r.advanceAmount || 0)), 0);
      const advanceSum = userReceipts.reduce((sum, r) => sum + (r.advanceAmount || 0), 0);
      
      const balanceSum = hasPaid ? userReceipts[userReceipts.length - 1].balanceAmount : u.balance;

      return {
        id: u.id,
        username: u.username,
        name: u.name,
        phone: u.phone,
        plan: u.plan,
        hasPaid,
        paidAmount: paidSum,
        advanceAmount: advanceSum,
        balance: balanceSum,
        expiryDate: u.expiryDate,
        ref: hasPaid ? userReceipts.map(r => r.transactionRef).join(', ') : '-',
        date: hasPaid ? new Date(userReceipts[0].date).toLocaleDateString() : '-'
      };
    }).filter(item => 
      !detailSearchTerm || 
      item.name.toLowerCase().includes(detailSearchTerm.toLowerCase()) ||
      item.username.toLowerCase().includes(detailSearchTerm.toLowerCase())
    );

    if (sortConfig !== null) {
      list.sort((a: any, b: any) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
      });
    }

    return list;
  }, [selectedMonth, receipts, users, detailSearchTerm, sortConfig]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };



  const stats = useMemo(() => {
    return detailedList.reduce((acc, curr) => ({
      paid: acc.paid + curr.paidAmount + curr.advanceAmount,
      advance: acc.advance + curr.advanceAmount,
      balance: acc.balance + curr.balance,
      count: acc.count + (curr.hasPaid ? 1 : 0)
    }), { paid: 0, advance: 0, balance: 0, count: 0 });
  }, [detailedList]);

  const handleSendReminder = (item: any, type: 'sms' | 'wa') => {
    const msg = `${settings.businessName} Recovery: Dear ${item.name}, your payment for ${selectedMonth} (Dues: Rs. ${(item.balance || 0).toLocaleString()}) is pending. Please clear it today. Thank you!`;
    if (type === 'sms') {
      window.location.href = `sms:${item.phone}?body=${encodeURIComponent(msg)}`;
    } else {
      shareToWhatsApp(item.phone, msg);
    }
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet) as any[];

        if (json.length === 0) {
          alert('The uploaded file appears to be empty or has no recognizable data.');
          return;
        }

        const newReceipts: Receipt[] = [];
        const updatedUsersMap = new Map<string, UserRecord>();
        const newUsersToAdd: UserRecord[] = [];
        let matchedCount = 0;
        let createdCount = 0;

        json.forEach((row, index) => {
          const findVal = (possibleKeys: string[]) => {
            const normalizedPossible = possibleKeys.map(pk => pk.toLowerCase().trim().replace(/[^a-z0-9]/g, ''));
            const key = Object.keys(row).find(k => {
              const normalizedHeader = k.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
              return normalizedPossible.includes(normalizedHeader);
            });
            return key ? row[key] : null;
          };

          const username = findVal(['username', 'user', 'accountid', 'userid', 'id', 'subscriber', 'consumerid']);
          let period = findVal(['month', 'period', 'billingmonth', 'billmonth']);
          const paidAmount = Number(findVal(['paidamount', 'paid', 'amount', 'received', 'recieved', 'payment'])) || 0;
          const balanceAmount = Number(findVal(['balanceamount', 'balance', 'due', 'arrears', 'pending'])) || 0;
          const advanceAmount = Number(findVal(['advanceamount', 'advance', 'overpaid'])) || 0;
          const dateVal = findVal(['paymentdate', 'payment date', 'lastdate', 'date', 'paidon', 'timestamp']);
          const refVal = findVal(['refs', 'ref', 'reference', 'transactionid', 'tid', 'receiptno']);
          const name = findVal(['name', 'fullname', 'customername', 'displayname']) || 'Unknown';
          const plan = findVal(['plan', 'package', 'subscription']) || 'Standard';
          const monthlyFee = Number(findVal(['monthlyfee', 'fee', 'rate', 'price'])) || paidAmount + balanceAmount;

          if (!username && !name) return;

          let periodStr = '';
          if (isImportingLegacy) {
            periodStr = `${legacyMonth} ${legacyYear}`;
          } else if (period) {
            if (typeof period === 'number') {
              const excelDate = new Date((period - (25567 + 1)) * 86400 * 1000);
              periodStr = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(excelDate);
            } else if (period instanceof Date) {
              periodStr = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(period);
            } else {
              periodStr = String(period).trim();
            }
          } else {
            periodStr = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date());
          }

          const cleanUsername = String(username || name).trim().toLowerCase();
          let user = users.find(u => u.username.toLowerCase().trim() === cleanUsername);

          let receiptDate = new Date();
          if (dateVal) {
            if (typeof dateVal === 'number') {
              receiptDate = new Date((dateVal - (25567 + 1)) * 86400 * 1000);
            } else if (dateVal instanceof Date) {
              receiptDate = dateVal;
            } else {
              const parsed = new Date(dateVal);
              if (!isNaN(parsed.getTime())) receiptDate = parsed;
            }
          }

          if (!user) {
            // Create new user for legacy data
            user = {
              id: `user-${Date.now()}-${index}-${Math.random().toString(36).substr(2, 9)}`,
              username: String(username || cleanUsername),
              name: String(name),
              phone: String(findVal(['phone', 'mobile']) || ''),
              address: String(findVal(['address', 'location']) || ''),
              plan: String(plan || 'Standard'),
              monthlyFee: monthlyFee,
              balance: balanceAmount,
              lastPaymentDate: receiptDate.toISOString(),
              expiryDate: new Date().toISOString(),
              createdAt: new Date().toISOString(),
              status: 'active',
              activatedMonths: [periodStr]
            };
            newUsersToAdd.push(user);
            createdCount++;
          } else {
            matchedCount++;
            let currentUser = updatedUsersMap.get(user.id) || user;
            const currentMonths = new Set(currentUser.activatedMonths || []);
            currentMonths.add(periodStr);
            
            // Update plan if provided
            const updatedPlan = plan ? String(plan) : currentUser.plan;
            
            currentUser = { 
              ...currentUser, 
              activatedMonths: Array.from(currentMonths),
              plan: updatedPlan,
              lastPaymentDate: receiptDate.toISOString()
            };
            updatedUsersMap.set(user.id, currentUser);
          }

          if (paidAmount > 0 || balanceAmount > 0) {
            const receipt: Receipt = {
              id: `import-${Date.now()}-${index}`,
              userId: user.id,
              username: user.username,
              userName: user.name,
              userPhone: user.phone,
              totalAmount: paidAmount + balanceAmount,
              paidAmount: paidAmount,
              balanceAmount: balanceAmount,
              advanceAmount: advanceAmount,
              date: receiptDate.toISOString(),
              period: periodStr,
              paymentMethod: PaymentMethod.CASH,
              status: paidAmount > 0 ? PaymentStatus.SUCCESS : PaymentStatus.PENDING,
              transactionRef: refVal ? String(refVal) : `IMP-${Date.now()}-${index}`
            };
            newReceipts.push(receipt);
          }
        });

        if (newUsersToAdd.length > 0) onBulkAddUsers(newUsersToAdd);
        if (updatedUsersMap.size > 0) onBulkUpdateUsers(Array.from(updatedUsersMap.values()));
        if (newReceipts.length > 0) onImportReceipts(newReceipts);

        alert(`Import Successful!\n- Ledger Created for: ${isImportingLegacy ? `${legacyMonth} ${legacyYear}` : 'Multiple Periods'}\n- New Users Added: ${createdCount}\n- Existing Users Updated: ${matchedCount}\n- Receipts Generated: ${newReceipts.length}`);
        setIsImportingLegacy(false);
      } catch (err) {
        console.error(err);
        alert('Failed to import file. Please check format.');
      } finally {
        if (importInputRef.current) importInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const downloadTemplate = () => {
    // Generate template based on existing users to make it easier for the user
    const template = users.map(u => ({
      'Username': u.username,
      'Name': u.name,
      'Plan': u.plan,
      'Current Expiry Date': u.expiryDate ? new Date(u.expiryDate).toLocaleDateString() : '-',
      'Month': new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date()),
      'Paid Amount': 0,
      'Payment Date': '', // User to fill
      'Balance Amount': u.balance || 0,
      'Advance Amount': 0,
      'New Expiry Date': '', // Optional: User can fill to update expiry
      'Status': 'PENDING',
      'Refs': '-'
    }));

    if (template.length === 0) {
      // Fallback if no users exist
      template.push({
        'Username': 'john_doe',
        'Name': 'John Doe',
        'Plan': 'Alpha (15MB)',
        'Current Expiry Date': '2024-01-15',
        'Month': 'January 2024',
        'Paid Amount': 1500,
        'Payment Date': '2024-01-15',
        'Balance Amount': 0,
        'Advance Amount': 0,
        'New Expiry Date': '2024-02-15',
        'Status': 'PAID',
        'Refs': 'CASH-123'
      });
    }

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Recovery Template");
    XLSX.writeFile(wb, "Recovery_Import_Template.xlsx");
  };

  const exportToExcel = () => {
    if (!selectedMonth) return;
    const worksheet = XLSX.utils.json_to_sheet(detailedList.map(item => ({
      'Month': selectedMonth,
      'Username': item.username,
      'Full Name': item.name,
      'Expiry Date': item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : '-',
      'Status': item.hasPaid ? 'PAID' : 'PENDING',
      'Paid Amount': item.paidAmount,
      'Advance Amount': item.advanceAmount,
      'Balance Amount': item.balance,
      'Payment Date': item.date,
      'Refs': item.ref
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Monthly_Ledger");
    XLSX.writeFile(workbook, `Ledger_${selectedMonth.replace(' ', '_')}.xlsx`);
  };

  const closeSheet = () => {
    setSelectedMonth(null);
    setDetailSearchTerm('');
  };

  const handleDownloadReceipt = async (receipt: Receipt) => {
    setIsDownloading(true);
    await new Promise(r => setTimeout(r, 500));
    
    const element = document.getElementById('receipt-view-area');
    if (!element) {
      setIsDownloading(false);
      return;
    }

    try {
      const canvas = await html2canvas(element, { 
        scale: 3, 
        backgroundColor: '#ffffff',
        useCORS: true,
        allowTaint: true,
        logging: false,
        windowWidth: element.scrollWidth,
        width: element.scrollWidth,
      });
      
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = url;
      link.download = `${settings.businessName}_Receipt_${receipt.transactionRef}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Download Error:', error);
    } finally {
      setIsDownloading(false);
    }
  };

  const renderReceiptPreview = () => {
    if (!viewingReceipt) return null;
    
    const currentSelectedUser = users.find(u => u.id === viewingReceipt.userId);
    const storedMonthlyFee = viewingReceipt.monthlyFee || (currentSelectedUser ? (settings.planPrices[currentSelectedUser.plan] || 0) : 0);
    const arrears = Math.max(0, (viewingReceipt.totalAmount || 0) + (viewingReceipt.discount || 0) - (storedMonthlyFee || 0));
    const nextMonthDue = (viewingReceipt.balanceAmount || 0) + (storedMonthlyFee - (viewingReceipt.discount || 0));

    const AdsSection = ({ design }: { design: ReceiptDesign }) => {
      const hasImage = !!settings.billAdsImage;
      const hasText = !!settings.billAds;
      if (!hasImage && !hasText) return null;

      if (design === ReceiptDesign.THERMAL) {
        return (
          <div className="w-full text-center border-t border-dashed border-slate-300 pt-3 mt-3">
             {hasImage && <img src={settings.billAdsImage} className="max-w-full h-auto mx-auto mb-2 opacity-90 grayscale" alt="Ad" />}
             {hasText && <p className="text-[10px] font-bold leading-tight px-2">{settings.billAds}</p>}
          </div>
        );
      }

      return (
        <div className="mt-8 pt-8 border-t-4 border-dashed border-slate-100">
          <div className="bg-indigo-50/40 p-6 rounded-[2rem] border-2 border-indigo-100/50 flex flex-col items-center text-center gap-4">
             {hasImage && (
               <div className="w-full max-h-[160px] overflow-hidden rounded-2xl shadow-sm border border-white">
                  <img src={settings.billAdsImage} className="w-full h-full object-contain" alt="Promotional Banner" />
               </div>
             )}
             {hasText && (
               <div>
                 <p className="text-[9px] font-black text-indigo-600 uppercase tracking-[0.2em] mb-1">Exclusive Subscriber Offer</p>
                 <p className="text-xs font-bold text-slate-700 leading-relaxed italic">"{settings.billAds}"</p>
               </div>
             )}
          </div>
        </div>
      );
    };

    switch (settings.receiptDesign) {
      case ReceiptDesign.UTILITY:
        return (
          <div className="bg-white p-4 md:p-10 text-black font-sans border-[4px] md:border-[6px] border-slate-900 w-full relative overflow-hidden shadow-2xl">
            <div className="flex flex-col sm:flex-row justify-between items-start border-b-[4px] border-slate-900 pb-6 mb-6 gap-6 sm:gap-0">
              <div className="flex-1 w-full">
                <div className="flex items-center gap-4 mb-4">
                   <div className="h-[40px] md:h-[50px] w-auto bg-white border-2 border-slate-900 rounded-xl flex items-center justify-center overflow-hidden p-1">
                     {settings.businessLogo ? (
                       <img src={settings.businessLogo} alt="Logo" className="h-full w-auto object-contain" referrerPolicy="no-referrer" />
                     ) : (
                       <img src="/logo-v3.png" alt="Logo" className="h-full w-auto object-contain" referrerPolicy="no-referrer" />
                     )}
                   </div>
                   <div>
                     <h1 className="text-xl md:text-3xl font-black uppercase tracking-tighter leading-none break-all">{settings.businessName}</h1>
                     <p className="text-[8px] md:text-[10px] font-black uppercase text-indigo-600 tracking-[0.2em] md:tracking-[0.3em] mt-1">Digital Utility Infrastructure</p>
                   </div>
                </div>
                <div className="mt-4 md:mt-6 flex flex-col sm:grid sm:grid-cols-2 gap-2 text-[10px] md:text-[11px] font-bold text-slate-700">
                  <p>📞 {settings.businessPhone}</p>
                  <p>✉️ {settings.businessEmail}</p>
                </div>
              </div>
              <div className="sm:text-right w-full sm:w-auto">
                <div className="bg-slate-50 p-4 rounded-[1.5rem] border-[3px] border-slate-900">
                   <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Instrument Serial</p>
                   <p className="text-lg md:text-xl font-black tracking-tighter break-all">{viewingReceipt.transactionRef}</p>
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:grid sm:grid-cols-6 gap-0 border-[3px] border-slate-900 mb-6 rounded-[1.5rem] overflow-hidden">
               <div className="p-4 md:p-6 border-b-[3px] sm:border-b-0 sm:border-r-[3px] border-slate-900 bg-slate-50 sm:col-span-2">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Account Holder</p>
                  <p className="text-lg md:text-xl font-black uppercase leading-tight break-words">{viewingReceipt.userName}</p>
                  <p className="text-[10px] font-black text-indigo-700 mt-1 break-words">@{viewingReceipt.username}</p>
               </div>
               <div className="p-4 md:p-6 sm:col-span-4">
                  <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Installation Address</p>
                  <p className="text-xs md:text-sm font-bold uppercase text-slate-800 break-words">{viewingReceipt.userAddress || 'ADDRESS RECORD NOT PROVIDED'}</p>
               </div>
            </div>
            <div className="overflow-x-auto w-full mb-6 relative rounded-[1.5rem] border-[3px] border-slate-900">
              <table className="w-full text-left border-collapse min-w-[300px]">
                <thead className="bg-slate-900 text-white text-[10px] md:text-[11px] uppercase font-black tracking-[0.1em]">
                  <tr><th className="p-3 md:p-4">Billing Component</th><th className="p-3 md:p-4 text-right">Amount</th></tr>
                </thead>
                <tbody className="text-[11px] md:text-[13px] font-black">
                  <tr className="border-b-[2px] border-slate-900">
                    <td className="p-3 md:p-4 uppercase">Monthly Subscription ({viewingReceipt.period})</td>
                    <td className="p-3 md:p-4 text-right">{(storedMonthlyFee || 0).toLocaleString()}</td>
                  </tr>
                  {arrears > 0 && (
                    <tr className="border-b-[2px] border-slate-900 bg-rose-50 text-rose-700">
                      <td className="p-3 md:p-4 uppercase">Previous Arrears</td>
                      <td className="p-3 md:p-4 text-right">{(arrears || 0).toLocaleString()}</td>
                    </tr>
                  )}
                  {viewingReceipt.discount && viewingReceipt.discount > 0 && (
                    <tr className="border-[2px] border-slate-900 bg-emerald-50 text-emerald-700">
                      <td className="p-3 md:p-4 uppercase">Discount Applied</td>
                      <td className="p-3 md:p-4 text-right">-{(viewingReceipt.discount || 0).toLocaleString()}</td>
                    </tr>
                  ) || null}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-end gap-4 md:gap-6">
               <div className="flex-1 p-4 md:p-6 bg-slate-50 rounded-[2rem] border-[2px] border-slate-900 border-dashed">
                  <p className="text-[9px] md:text-[10px] leading-relaxed text-slate-700 font-bold">
                    • Verified proof of connectivity payment.<br/>
                    • Technical support: {settings.businessPhone}
                  </p>
               </div>
               <div className="w-full sm:w-64 bg-indigo-600 text-white p-4 md:p-6 rounded-[2rem] border-[3px] border-slate-900 text-center">
                  <p className="text-[9px] font-black uppercase tracking-widest opacity-70 mb-1">Received</p>
                  <span className="text-2xl md:text-3xl font-black break-words">Rs. {(viewingReceipt.paidAmount || 0).toLocaleString()}</span>
               </div>
            </div>
            <AdsSection design={ReceiptDesign.UTILITY} />
          </div>
        );
      case ReceiptDesign.THERMAL:
        return (
          <div className="flex flex-col items-center text-center p-4 text-black leading-tight bg-white w-full max-w-[300px] mx-auto">
            {settings.businessLogo ? (
              <img src={settings.businessLogo} alt="Logo" className="h-[40px] w-auto object-contain mb-2 grayscale" referrerPolicy="no-referrer" />
            ) : (
              <img src="/logo-v3.png" alt="Logo" className="h-[40px] w-auto object-contain mb-2 grayscale" referrerPolicy="no-referrer" />
            )}
            <h2 className="text-lg font-black uppercase mb-1">{settings.businessName}</h2>
            <p className="text-[9px] font-bold mb-2">{viewingReceipt.isLatePayment ? 'LATE PAYMENT RECEIPT' : 'ISP RECEIPT'}</p>
            {viewingReceipt.isLatePayment && (
              <p className="text-[8px] font-black bg-black text-white px-2 py-0.5 mb-2 uppercase">RCVD: {new Date(viewingReceipt.actualPaymentDate || viewingReceipt.date).toLocaleDateString()}</p>
            )}
            <div className="w-full text-left space-y-1 text-[10px] border-y border-dashed border-slate-300 py-2 mb-2">
              <div className="flex justify-between"><span className="font-bold">SERIAL:</span><span>{viewingReceipt.transactionRef}</span></div>
              <div className="flex justify-between"><span className="font-bold">DATE:</span><span>{new Date(viewingReceipt.date).toLocaleDateString()}</span></div>
              <div className="flex justify-between"><span className="font-bold">NAME:</span><span className="font-black truncate ml-2">{viewingReceipt.userName}</span></div>
              <div className="flex justify-between"><span className="font-bold">PERIOD:</span><span>{viewingReceipt.period}</span></div>
            </div>
            <div className="w-full text-left space-y-1 text-[10px] mb-4">
              <div className="flex justify-between"><span>Monthly Bill:</span><span>Rs. {storedMonthlyFee.toLocaleString()}</span></div>
              {arrears > 0 && <div className="flex justify-between text-red-600"><span>Arrears:</span><span>Rs. {arrears.toLocaleString()}</span></div>}
              <div className="flex justify-between font-black border-t border-slate-100 pt-1"><span>Total:</span><span>Rs. {viewingReceipt.totalAmount.toLocaleString()}</span></div>
              <div className="flex justify-between text-indigo-700 font-bold pt-1"><span>Paid:</span><span>Rs. {viewingReceipt.paidAmount.toLocaleString()}</span></div>
              <div className="flex justify-between font-black pt-1 border-t border-dashed border-slate-200"><span>Next Due:</span><span>Rs. {nextMonthDue.toLocaleString()}</span></div>
            </div>
            <AdsSection design={ReceiptDesign.THERMAL} />
          </div>
        );
      case ReceiptDesign.MODERN:
        return (
          <div className="bg-white p-5 md:p-6 rounded-[1.5rem] text-slate-900 border border-slate-100 w-full relative overflow-hidden">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 bg-indigo-600 p-4 md:p-5 rounded-[1.5rem] text-white gap-4 sm:gap-0">
              <div className="flex items-center gap-3">
                <div className="h-[40px] w-auto bg-white rounded-lg p-1">
                  {settings.businessLogo ? (
                    <img src={settings.businessLogo} alt="Logo" className="h-full w-auto object-contain" referrerPolicy="no-referrer" />
                  ) : (
                    <img src="/logo-v3.png" alt="Logo" className="h-full w-auto object-contain" referrerPolicy="no-referrer" />
                  )}
                </div>
                <div>
                  <h2 className="font-black text-sm break-words">{settings.businessName}</h2>
                  {viewingReceipt.isLatePayment && <p className="text-[8px] font-black opacity-70 uppercase tracking-widest mt-0.5">Late Payment History</p>}
                </div>
              </div>
              <div className="sm:text-right text-xs">
                <p className="text-[9px] font-black opacity-60">SN: {viewingReceipt.transactionRef}</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end border-b border-slate-50 pb-4 gap-4 sm:gap-0">
                <div className="w-full">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Customer</p>
                  <p className="text-lg font-black break-words">{viewingReceipt.userName}</p>
                  <p className="text-xs font-bold text-indigo-600 break-words">@{viewingReceipt.username}</p>
                </div>
                <div className="sm:text-right w-full sm:w-auto">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Period</p>
                  <p className="text-xs font-black bg-slate-50 p-2 sm:p-0 rounded sm:bg-transparent">{viewingReceipt.period}</p>
                </div>
              </div>
              <div className="space-y-2 text-sm w-full">
                <div className="flex justify-between"><span>Subscription</span><span className="font-black text-right pl-2">Rs. {storedMonthlyFee.toLocaleString()}</span></div>
                {arrears > 0 && <div className="flex justify-between text-rose-500"><span>Arrears</span><span className="font-black text-right pl-2">Rs. {arrears.toLocaleString()}</span></div>}
                <div className="flex justify-between bg-slate-50 p-4 rounded-xl mt-4 max-w-full">
                  <span className="text-[10px] font-black text-slate-400 uppercase">Paid</span>
                  <span className="text-lg md:text-xl font-black text-indigo-600 text-right pl-2 break-words">Rs. {viewingReceipt.paidAmount.toLocaleString()}</span>
                </div>
              </div>
              <AdsSection design={ReceiptDesign.MODERN} />
            </div>
          </div>
        );
      case ReceiptDesign.PROFESSIONAL:
      default:
        return (
          <div className="text-black bg-white p-4 md:p-6 w-full relative overflow-hidden">
            <div className="flex flex-col sm:flex-row justify-between items-start mb-6 md:mb-8 border-b-2 border-slate-50 pb-6 gap-6 sm:gap-0">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full">
                <div className="h-[40px] md:h-[50px] w-auto bg-white border border-slate-100 rounded-xl p-1">
                  {settings.businessLogo ? (
                    <img src={settings.businessLogo} alt="Logo" className="h-full w-auto object-contain" referrerPolicy="no-referrer" />
                  ) : (
                    <img src="/logo-v3.png" alt="Logo" className="h-full w-auto object-contain" referrerPolicy="no-referrer" />
                  )}
                </div>
                <div className="w-full">
                  <h2 className="text-xl md:text-2xl font-black text-indigo-950 uppercase break-words">{settings.businessName}</h2>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{settings.businessPhone}</p>
                    {viewingReceipt.isLatePayment && (
                      <span className="text-[8px] bg-rose-500 text-white px-2 py-0.5 rounded font-black uppercase">Late Record</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="sm:text-right w-full sm:w-auto p-3 sm:p-0 bg-slate-50 sm:bg-transparent rounded-lg">
                <p className="text-[10px] font-black text-indigo-600 uppercase break-all">SN: {viewingReceipt.transactionRef}</p>
                <p className="text-[9px] font-bold text-slate-400">{new Date(viewingReceipt.date).toLocaleDateString()}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-8 mb-6">
              <div>
                <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Bill To</p>
                <p className="text-lg font-black">{viewingReceipt.userName}</p>
                <p className="text-xs font-black text-indigo-600">@{viewingReceipt.username}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Billing Period</p>
                <p className="text-sm font-bold">{viewingReceipt.period}</p>
              </div>
            </div>
            <div className="bg-slate-50 rounded-2xl p-6 mb-6">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-200"><th className="text-left pb-2 text-[9px] uppercase font-black">Description</th><th className="text-right pb-2 text-[9px] uppercase font-black">Amount</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  <tr><td className="py-3 font-bold">Monthly Subscription</td><td className="py-3 text-right font-black">Rs. {storedMonthlyFee.toLocaleString()}</td></tr>
                  {arrears > 0 && <tr><td className="py-2 text-slate-500 italic">Previous Arrears</td><td className="py-2 text-right font-bold text-red-500">Rs. {arrears.toLocaleString()}</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="space-y-2 text-right">
              <div className="flex justify-between items-center border-t border-slate-100 pt-2"><span className="text-[10px] font-black text-slate-400 uppercase">Amount Received</span><span className="text-2xl font-black text-indigo-600">Rs. {viewingReceipt.paidAmount.toLocaleString()}</span></div>
              <div className="flex justify-between items-center pt-2 border-t border-dashed border-slate-200"><span className="text-[10px] font-black text-slate-400 uppercase">Next Due</span><span className="text-lg font-black">Rs. {nextMonthDue.toLocaleString()}</span></div>
            </div>
            <AdsSection design={ReceiptDesign.PROFESSIONAL} />
          </div>
        );
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {!selectedMonth ? (
        <div className="space-y-4">
          <div className="mb-6 flex justify-between items-end px-2">
            <div>
              <h3 className="text-2xl font-black text-black dark:text-white uppercase tracking-tight">Recovery Catalog</h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-black uppercase tracking-widest">Select month to view ledger</p>
            </div>
            <div>
               <div className="flex gap-2">
                 <button onClick={downloadTemplate} className="px-4 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                    Template
                 </button>
                 <button onClick={() => setIsImportingLegacy(true)} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-500/20 active:scale-95 transition-all flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                    Upload Past Record
                 </button>
               </div>
               <input 
                 type="file" 
                 ref={importInputRef} 
                 style={{ display: 'none' }} 
                 accept=".xlsx, .xls, .csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel, text/csv"
                 onClick={(e) => (e.target as HTMLInputElement).value = ''}
                 onChange={handleImportExcel} 
               />
            </div>
          </div>
          
          {monthlyData.map((summary) => (
            <div 
              key={summary.period} 
              className="relative bg-white dark:bg-[#0f172a] p-8 rounded-[3rem] shadow-sm border border-slate-100 dark:border-white/5 flex justify-between items-center group transition-all cursor-pointer hover:shadow-xl hover:-translate-y-1" 
              onClick={() => setSelectedMonth(summary.period)}
            >
              <div className="absolute top-8 right-8 z-10 flex gap-2">
                <button 
                  onClick={(e) => handleRenameClick(e, summary.period)}
                  className="p-2 text-slate-300 hover:text-indigo-500 transition-colors"
                  title="Rename Period"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); onDeletePeriod(summary.period); }}
                  className="p-2 text-slate-300 hover:text-rose-500 transition-colors"
                  title="Delete Period"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
              </div>

              <div>
                <h4 className="text-[9px] font-black uppercase tracking-widest text-indigo-500 mb-2">COLLECTION PERIOD</h4>
                <p className="text-3xl font-black text-slate-800 dark:text-white tracking-tight leading-none mb-4">{summary.period}</p>
                <div className="flex flex-wrap items-center gap-6">
                   <div className="flex flex-col">
                      <span className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Recovery</span>
                      <span className="text-lg font-black text-emerald-600 dark:text-emerald-500">Rs. {(summary.totalPaid || 0).toLocaleString()}</span>
                   </div>
                   <div className="flex flex-col border-l border-slate-100 dark:border-white/5 pl-6">
                      <span className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Subscribers</span>
                      <span className="text-lg font-black text-indigo-600 dark:text-indigo-400">{summary.activatedCount} Active</span>
                   </div>
                   <div className="flex flex-col border-l border-slate-100 dark:border-white/5 pl-6">
                      <span className="text-[8px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">Payments</span>
                      <span className="text-lg font-black text-slate-600 dark:text-slate-200">{summary.paidCount} Collected</span>
                   </div>
                </div>
              </div>
              <div className="hidden sm:flex flex-col items-end gap-4 mt-12">
                <div className="w-16 h-16 bg-slate-50 dark:bg-slate-900 rounded-[1.5rem] flex items-center justify-center text-slate-300 transition-all group-hover:bg-indigo-600 group-hover:text-white">
                   <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7"></path></svg>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-[#0f172a] rounded-[2.5rem] shadow-2xl border border-slate-100 dark:border-white/5 overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-500">
          <div className="p-8 border-b border-slate-100 dark:border-white/5 bg-slate-50 dark:bg-slate-950/20">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-indigo-600 rounded-[1.25rem] flex items-center justify-center text-white text-2xl shadow-xl shadow-indigo-500/20">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                </div>
                <div>
                  <h4 className="text-[10px] font-black text-indigo-500 dark:text-indigo-400 uppercase tracking-widest leading-none mb-1">Monthly Recovery Record</h4>
                  <p className="text-3xl font-black text-slate-800 dark:text-white leading-none tracking-tight">{selectedMonth}</p>
                </div>
              </div>
              <button onClick={closeSheet} className="p-4 bg-white dark:bg-slate-800 rounded-2xl text-slate-400 dark:text-slate-500 hover:text-rose-500 transition-colors shadow-sm">✕</button>
            </div>

            <div className="flex flex-col md:flex-row gap-3 mb-10">
              <div className="relative flex-1">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                <input type="text" placeholder="Search customer records..." className="w-full pl-12 pr-4 py-4 bg-white dark:bg-slate-950 rounded-2xl font-bold text-sm border border-slate-200 dark:border-0 outline-none text-slate-900 dark:text-white shadow-sm" value={detailSearchTerm} onChange={e => setDetailSearchTerm(e.target.value)} />
              </div>
              <button onClick={exportToExcel} className="px-8 py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-500/20 whitespace-nowrap active:scale-95 transition-all">Export To Excel</button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-slate-950 p-5 rounded-[1.5rem] border border-slate-100 dark:border-slate-800 shadow-sm">
                <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Total Received</p>
                <p className="text-xl font-black text-indigo-600 dark:text-indigo-400">Rs. {(stats.paid || 0).toLocaleString()}</p>
              </div>
              <div className="bg-white dark:bg-slate-950 p-5 rounded-[1.5rem] border border-slate-100 dark:border-slate-800 shadow-sm">
                <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Advance Amount</p>
                <p className="text-xl font-black text-emerald-600 dark:text-emerald-500">Rs. {(stats.advance || 0).toLocaleString()}</p>
              </div>
              <div className="bg-white dark:bg-slate-950 p-5 rounded-[1.5rem] border border-slate-100 dark:border-slate-800 shadow-sm">
                <p className="text-[9px] font-black text-rose-600 dark:text-rose-500 uppercase tracking-widest mb-1">Total Arrears</p>
                <p className="text-xl font-black text-rose-600 dark:text-rose-400">Rs. {(stats.balance || 0).toLocaleString()}</p>
              </div>
              <div className="bg-slate-800 dark:bg-indigo-600 p-5 rounded-[1.5rem] text-white shadow-xl">
                <p className="text-[9px] font-black text-slate-300 dark:text-indigo-100/60 uppercase tracking-widest mb-1">Forecast Revenue</p>
                <p className="text-xl font-black">Rs. {((stats.paid || 0) + (stats.balance || 0)).toLocaleString()}</p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left min-w-[1200px]">
              <thead className="bg-slate-50 dark:bg-slate-950 text-[10px] uppercase font-black text-slate-500 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="px-8 py-5 cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => handleSort('username')}>
                    Sub ID {sortConfig?.key === 'username' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-8 py-5 cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => handleSort('name')}>
                    Subscriber {sortConfig?.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-8 py-5 cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => handleSort('hasPaid')}>
                    Status {sortConfig?.key === 'hasPaid' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-8 py-5 cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => handleSort('paidAmount')}>
                    Paid Amount {sortConfig?.key === 'paidAmount' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-8 py-5 cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => handleSort('advanceAmount')}>
                    Advance Amount {sortConfig?.key === 'advanceAmount' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-8 py-5 cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => handleSort('balance')}>
                    Balance Amount {sortConfig?.key === 'balance' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-8 py-5 cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => handleSort('expiryDate')}>
                    Expiry Date {sortConfig?.key === 'expiryDate' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-8 py-5">Actions</th>
                  <th className="px-8 py-5 cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => handleSort('date')}>
                    Payment Date {sortConfig?.key === 'date' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-8 py-5 cursor-pointer hover:text-indigo-600 transition-colors" onClick={() => handleSort('ref')}>
                    Reference {sortConfig?.key === 'ref' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {detailedList.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-8 py-5"><span className="text-xs font-black text-indigo-600 dark:text-indigo-400">@{item.username}</span></td>
                    <td className="px-8 py-5">
                       <div className="flex flex-col">
                          <span className="text-sm font-bold text-slate-800 dark:text-slate-200">{item.name}</span>
                          <span className="text-[9px] font-black text-slate-500 dark:text-slate-500 uppercase tracking-tighter">{item.plan}</span>
                       </div>
                    </td>
                    <td className="px-8 py-5">
                      <span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${
                        item.hasPaid ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400'
                      }`}>
                        {item.hasPaid ? 'PAID' : 'PENDING'}
                      </span>
                    </td>
                    <td className="px-8 py-5">
                       <span className="text-sm font-black text-slate-800 dark:text-slate-100">Rs. {(item.paidAmount || 0).toLocaleString()}</span>
                    </td>
                    <td className="px-8 py-5">
                       <span className={`text-sm font-black ${(item.advanceAmount || 0) > 0 ? 'text-emerald-600 dark:text-emerald-500' : 'text-slate-400 dark:text-slate-700'}`}>Rs. {(item.advanceAmount || 0).toLocaleString()}</span>
                    </td>
                    <td className="px-8 py-5">
                       <span className={`text-sm font-black ${(item.balance || 0) > 0 ? 'text-rose-600' : 'text-slate-400 dark:text-slate-700'}`}>Rs. {(item.balance || 0).toLocaleString()}</span>
                    </td>
                    <td className="px-8 py-5">
                       <span className="text-xs font-black text-orange-600 dark:text-orange-400">{item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : '-'}</span>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex items-center gap-2">
                        {!item.hasPaid ? (
                          <>
                             <button onClick={() => handleSendReminder(item, 'sms')} title="Send SMS" className="p-2 text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all">💬</button>
                             <button onClick={() => handleSendReminder(item, 'wa')} title="Send WhatsApp" className="p-2 text-slate-400 dark:text-slate-500 hover:text-emerald-500 dark:hover:text-emerald-400 transition-all">📱</button>
                          </>
                        ) : (
                          <div className="flex items-center gap-3">
                             <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-500">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7"></path></svg>
                                <span className="text-[9px] font-black uppercase">Cleared</span>
                             </div>
                             <button 
                               onClick={() => {
                                 const r = receipts.find(rec => rec.userId === item.id && rec.period === selectedMonth);
                                 if (r) setViewingReceipt(r);
                               }}
                               className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-lg text-[9px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all"
                             >
                               View Receipt
                             </button>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-8 py-5">
                       <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">{item.date}</span>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-tighter truncate max-w-[120px]">{item.ref}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="p-10 bg-slate-50 dark:bg-slate-950 flex flex-col md:flex-row justify-between items-center border-t border-slate-100 dark:border-slate-800 gap-6">
            <div className="flex gap-16">
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] mb-2">Total Arrears</span>
                <span className="text-3xl font-black text-rose-600 dark:text-rose-400">Rs. {(stats.balance || 0).toLocaleString()}</span>
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] mb-2">Total Collected</span>
                <span className="text-3xl font-black text-indigo-600 dark:text-indigo-400">Rs. {(stats.paid || 0).toLocaleString()}</span>
              </div>
            </div>
            <div className="text-right">
               <div className="bg-white dark:bg-slate-900 px-8 py-6 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-xl">
                  <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-1">Monthly Forecast</p>
                  <p className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Rs. {((stats.paid || 0) + (stats.balance || 0)).toLocaleString()}</p>
               </div>
            </div>
          </div>
        </div>
      )}
      {isImportingLegacy && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setIsImportingLegacy(false)}></div>
          <div className="relative z-10 w-full max-w-md bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-200">
            <h2 className="text-xl font-black text-slate-800 dark:text-white mb-2 text-center">Historical Upload</h2>
            <p className="text-xs text-slate-500 mb-6 text-center">Select the month and year for this historical record.</p>
            
            <div className="space-y-4 mb-8">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Select Month</label>
                <select 
                  value={legacyMonth}
                  onChange={(e) => setLegacyMonth(e.target.value)}
                  className="w-full p-4 bg-slate-50 dark:bg-slate-950 rounded-xl font-bold outline-none border-2 border-transparent focus:border-indigo-500 transition-all"
                >
                  {months.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">Select Year</label>
                <select 
                  value={legacyYear}
                  onChange={(e) => setLegacyYear(e.target.value)}
                  className="w-full p-4 bg-slate-50 dark:bg-slate-950 rounded-xl font-bold outline-none border-2 border-transparent focus:border-indigo-500 transition-all"
                >
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => importInputRef.current?.click()} 
                className="flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
              >
                Select File
              </button>
              <button 
                onClick={() => setIsImportingLegacy(false)} 
                className="flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {editingPeriod && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setEditingPeriod(null)}></div>
          <div className="relative z-10 w-full max-w-md bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl border border-slate-100 dark:border-slate-800 text-center animate-in zoom-in-95 duration-200">
            <h2 className="text-xl font-black text-slate-800 dark:text-white mb-2">Rename Period</h2>
            <p className="text-xs text-slate-500 mb-6">Enter a new name for this collection period.</p>
            
            <input 
              type="text" 
              value={newPeriodName}
              onChange={(e) => setNewPeriodName(e.target.value)}
              className="w-full p-4 bg-slate-50 dark:bg-slate-950 rounded-xl font-bold text-center text-lg outline-none border-2 border-transparent focus:border-indigo-500 transition-all mb-6"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && confirmRename()}
            />

            <div className="flex gap-3">
              <button onClick={confirmRename} className="flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">Save Changes</button>
              <button onClick={() => setEditingPeriod(null)} className="flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
      {viewingReceipt && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 overflow-y-auto">
          <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xl" onClick={() => setViewingReceipt(null)}></div>
          <div className="relative z-10 w-full max-w-2xl my-8 animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center mb-4 px-2">
              <h3 className="text-white font-black uppercase tracking-widest text-xs">Receipt Preview</h3>
              <button onClick={() => setViewingReceipt(null)} className="w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-colors">✕</button>
            </div>
            
            <div className="bg-white rounded-[1.5rem] shadow-2xl overflow-x-auto mb-6 custom-scrollbar">
               <div id="receipt-view-area" className="min-w-fit w-full inline-block bg-white pb-1">
                 {renderReceiptPreview()}
               </div>
            </div>

            <div className="grid grid-cols-2 gap-4 px-2">
               <button 
                 onClick={() => handleDownloadReceipt(viewingReceipt)} 
                 disabled={isDownloading}
                 className="flex-1 py-5 rounded-2xl font-black text-xs uppercase tracking-widest bg-emerald-600 text-white hover:bg-emerald-700 transition-all shadow-xl shadow-emerald-900/20 flex items-center justify-center gap-2"
               >
                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                 {isDownloading ? 'Capturing...' : 'Download PNG'}
               </button>
               <button 
                 onClick={() => {
                   const nextDue = (viewingReceipt.balanceAmount || 0) + (viewingReceipt.monthlyFee - (viewingReceipt.discount || 0));
                   const msg = `*${settings.businessName} RECEIPT*\n--------------------------\n*Ref:* ${viewingReceipt.transactionRef}\n*Date:* ${new Date(viewingReceipt.date).toLocaleDateString()}\n*Customer:* ${viewingReceipt.userName}\n*Period:* ${viewingReceipt.period}\n*Amount Paid:* Rs. ${(viewingReceipt.paidAmount || 0).toLocaleString()}\n*Next Due:* Rs. ${nextDue.toLocaleString()}\n--------------------------\nThank you!`;
                   shareToWhatsApp(viewingReceipt.userPhone, msg);
                 }}
                 className="flex-1 py-5 rounded-2xl font-black text-xs uppercase tracking-widest bg-indigo-600 text-white hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-900/20 flex items-center justify-center gap-2"
               >
                 <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.246 2.248 3.484 5.232 3.484 8.412-.003 6.557-5.338 11.892-11.893 11.892-1.997-.001-3.951-.5-5.688-1.448l-6.309 1.656zm6.224-3.62c1.566.933 3.46 1.441 5.519 1.442 5.457 0 9.894-4.437 9.897-9.895.002-2.646-1.03-5.132-2.903-7.005s-4.359-2.906-7.004-2.907c-5.456 0-9.892 4.437-9.894 9.895-.001 2.045.508 4.045 1.486 5.856l-.991 3.616 3.9-.996zm11.087-7.468c-.301-.15-1.784-.879-2.059-.98-.275-.1-.475-.15-.675.15s-.775.98-.95 1.18-.35.225-.65.075c-.301-.15-1.267-.467-2.414-1.491-.892-.796-1.493-1.778-1.668-2.079-.175-.301-.019-.463.131-.612.135-.133.301-.35.45-.525.15-.175.2-.3.3-.5s.05-.375-.025-.525c-.075-.15-.675-1.625-.925-2.225-.244-.588-.491-.508-.675-.517-.175-.008-.375-.01-.575-.01s-.525.075-.8.375c-.275.3-1.05 1.025-1.05 2.5s1.075 2.9 1.225 3.1c.15.2 2.116 3.231 5.126 4.532.715.311 1.273.497 1.707.635.719.227 1.373.195 1.89.118.577-.085 1.784-.73 2.034-1.435.25-.705.25-1.31.175-1.435-.075-.125-.275-.2-.575-.35z"/></svg>
                 Share WhatsApp
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RecoverySummary;
