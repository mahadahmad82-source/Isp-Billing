
import React, { useState, useEffect, useRef, useCallback } from 'react';
import html2canvas from 'html2canvas';
import { UserRecord, Receipt, PaymentMethod, PaymentStatus, AppSettings, ReceiptDesign } from '../types';
import { generateId } from '../utils/storage';
import { generateProfessionalMessage } from '../services/geminiService';
import { shareToWhatsApp } from '../utils/whatsapp';

interface ReceiptGeneratorProps {
  users: UserRecord[];
  receipts: Receipt[];
  settings: AppSettings;
  onAddReceipt: (receipt: Receipt) => void;
  onUpdateReceipt: (receipt: Receipt) => void;
  onUpdateUser: (userId: string, update: Partial<UserRecord>) => void;
  onDeleteReceipt: (id: string) => void;
  setLoadingMessage: (msg: string | null) => void;
}

type ViewMode = 'list' | 'create' | 'view';

const ReceiptGenerator: React.FC<ReceiptGeneratorProps> = ({ 
  users, 
  receipts, 
  settings,
  onAddReceipt, 
  onUpdateReceipt,
  onUpdateUser,
  onDeleteReceipt,
  setLoadingMessage
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [monthlyFee, setMonthlyFee] = useState(0);
  const [previousBalance, setPreviousBalance] = useState(0);
  const [amountPaid, setAmountPaid] = useState(0); 
  const [advanceAmount, setAdvanceAmount] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [description, setDescription] = useState('');
  const [paymentMethod, setPaymentMethod] = useState(PaymentMethod.CASH);
  const [paymentStatus, setPaymentStatus] = useState(PaymentStatus.SUCCESS);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [transactionRef, setTransactionRef] = useState('');
  const [activeReceipt, setActiveReceipt] = useState<Receipt | null>(null);
  const [editingReceiptId, setEditingReceiptId] = useState<string | null>(null);
  const [smsTemplate, setSmsTemplate] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [shareMessage, setShareMessage] = useState('');
  
  const [filterMonth, setFilterMonth] = useState<string>(new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date()));
  const [filterYear, setFilterYear] = useState<string>(new Date().getFullYear().toString());
  
  const [billingMonth, setBillingMonth] = useState<string>(filterMonth);
  const [billingYear, setBillingYear] = useState<string>(filterYear);

  const syncUserAmounts = useCallback((userId: string) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;

    // 1. Detect Plan Price from Settings (Automatic Detection)
    const fee = settings.planPrices[user.plan] !== undefined 
      ? settings.planPrices[user.plan] 
      : (user.monthlyFee || 0);
    
    // 2. Detect Arrears from Past Records (Latest Receipt Balance)
    const userReceipts = receipts.filter(r => r.userId === user.id);
    const latestReceipt = userReceipts.length > 0 
      ? [...userReceipts].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0]
      : null;
    
    const balance = latestReceipt ? latestReceipt.balanceAmount : (user.balance || 0);
    const persistentDisc = user.persistentDiscount || 0;
    
    setMonthlyFee(fee);
    setPreviousBalance(balance);
    setDiscount(persistentDisc);
    setAmountPaid((fee + balance) - persistentDisc);
    setAdvanceAmount(0);
    setDescription(user.description || settings.globalNote || '');
  }, [users, receipts, settings.planPrices, settings.globalNote]);

  useEffect(() => {
    if (viewMode === 'create') {
      if (editingReceiptId) {
        const receipt = receipts.find(r => r.id === editingReceiptId);
        setTransactionRef(receipt?.transactionRef || getNextSerial());
      } else {
        setTransactionRef(getNextSerial());
      }
    }
  }, [viewMode, editingReceiptId, receipts]);

  // Validation: Ensure selected user is still valid for the new month/year
  useEffect(() => {
    if (selectedUserId) {
      const user = users.find(u => u.id === selectedUserId);
      const alreadyBilled = receipts.some(r => r.userId === selectedUserId && r.period === `${billingMonth} ${billingYear}`);
      
      // If user is already billed for this period, or is no longer active, or is "deleted"
      if (alreadyBilled || !user || user.status === 'deleted' || user.status !== 'active') {
        setSelectedUserId('');
        setCustomerSearchQuery('');
      } else if (viewMode === 'create' && !editingReceiptId) {
        // Automatic Detection: Keep fee and arrears in sync when period or settings change
        syncUserAmounts(selectedUserId);
      }
    }
  }, [billingMonth, billingYear, selectedUserId, users, receipts, settings.planPrices, viewMode, editingReceiptId, syncUserAmounts]);
  
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [isSearchDropdownOpen, setIsSearchDropdownOpen] = useState(false);
  const searchDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchDropdownRef.current && !searchDropdownRef.current.contains(event.target as Node)) {
        setIsSearchDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleUserSelect = (id: string) => {
    setSelectedUserId(id);
    setIsSearchDropdownOpen(false);
    const user = users.find(u => u.id === id);
    if (user) {
      setCustomerSearchQuery(`${user.name} (@${user.username})`);
      syncUserAmounts(id);
    }
  };

  const subTotal = (monthlyFee || 0) + (previousBalance || 0);
  const totalPayable = subTotal - (discount || 0);
  const calculatedBalance = totalPayable - ((amountPaid || 0) + (advanceAmount || 0));
  
  const nextMonthDuePreview = calculatedBalance + (monthlyFee - discount);

  const getNextSerial = () => {
    const prefix = settings.receiptSerialPrefix || 'MN';
    const startFrom = settings.receiptSerialStart || 1;
    // Count existing receipts and add to starting number
    const nextNum = startFrom + receipts.length;
    // Determine padding based on starting number digits
    const padLength = Math.max(4, String(settings.receiptSerialStart || 1).length);
    const num = nextNum.toString().padStart(padLength, '0');
    return `${prefix}-${num}`;
  };

  const captureAndDownload = async (receipt: Receipt) => {
    setIsDownloading(true);
    setLoadingMessage('Capturing High-Resolution Digital Copy...');
    await new Promise(r => setTimeout(r, 1000));
    
    const element = document.getElementById('receipt-download-area');
    if (!element) {
      setIsDownloading(false);
      return;
    }

    try {
      const canvas = await html2canvas(element, { 
        scale: 4, 
        backgroundColor: '#ffffff',
        useCORS: true,
        allowTaint: true,
        logging: false,
        onclone: (clonedDoc) => {
          // Additional safety for Android Gallery Export errors (oklch)
          const area = clonedDoc.getElementById('receipt-download-area');
          if (area) {
            area.style.boxShadow = 'none';
            // Ensure any modern color mix or oklch isn't tripping the legacy parser
            const allElements = area.getElementsByTagName('*');
            for (let i = 0; i < allElements.length; i++) {
              const el = allElements[i] as HTMLElement;
              const style = window.getComputedStyle(el);
              // Clean up properties that often cause oklch errors in older html2canvas builds
              if (style.color.includes('oklch')) el.style.color = '#000000';
              if (style.backgroundColor.includes('oklch')) el.style.backgroundColor = 'transparent';
              if (style.borderColor.includes('oklch')) el.style.borderColor = '#000000';
            }
          }
        }
      });
      
      canvas.toBlob((blob: Blob | null) => {
        if (!blob) throw new Error("Capture Failed");
        
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        const filename = `${settings.businessName}_Receipt_${receipt.transactionRef}.png`.replace(/\s+/g, '_');
        
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        setTimeout(() => URL.revokeObjectURL(url), 200);
        setShowSaveSuccess(true);
        setTimeout(() => setShowSaveSuccess(false), 4000);
      }, 'image/png', 1.0);
    } catch (error) {
      console.error('Android Gallery Export Error:', error);
    } finally {
      setIsDownloading(false);
      setLoadingMessage(null);
    }
  };

  const generateReceipt = async () => {
    const user = users.find(u => u.id === selectedUserId);
    if (!user) return;

    setIsGenerating(true);

    try {
      const receiptDate = new Date(paymentDate);
      const newReceipt: Receipt = {
        id: editingReceiptId || generateId(),
        userId: user.id,
        username: user.username,
        userName: user.name,
        userPhone: user.phone,
        userAddress: user.address,
        totalAmount: totalPayable || 0,
        paidAmount: (amountPaid || 0) + (advanceAmount || 0),
        balanceAmount: calculatedBalance || 0,
        advanceAmount: advanceAmount || 0,
        discount: discount || 0,
        monthlyFee: monthlyFee || 0,
        date: receiptDate.toISOString(),
        period: `${billingMonth} ${billingYear}`,
        paymentMethod: paymentMethod,
        status: paymentStatus,
        transactionRef: transactionRef,
        description: description
      };

      if (editingReceiptId) {
        onUpdateReceipt(newReceipt);
      } else {
        onAddReceipt(newReceipt);
      }
      
      setActiveReceipt(newReceipt);

      const currentExpiry = new Date(user.expiryDate || new Date());
      const safeDate = isNaN(currentExpiry.getTime()) ? new Date() : currentExpiry;
      const newExpiry = new Date(safeDate);
      
      if (paymentStatus === PaymentStatus.SUCCESS && ((amountPaid || 0) + (advanceAmount || 0)) >= (monthlyFee - discount)) {
          newExpiry.setMonth(newExpiry.getMonth() + 1);
      }

      onUpdateUser(user.id, {
        lastPaymentDate: receiptDate.toISOString(),
        expiryDate: isNaN(newExpiry.getTime()) ? new Date().toISOString() : newExpiry.toISOString(),
        status: 'active',
        balance: calculatedBalance || 0 
      });

      setViewMode('view');
      setEditingReceiptId(null);
      
      captureAndDownload(newReceipt);

    } catch (error) {
      console.error("Critical System Failure:", error);
      alert("Database error. Record not saved.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleViewReceipt = (receipt: Receipt) => {
    setActiveReceipt(receipt);
    setViewMode('view');
  };

  const handlePrint = () => {
    if (!activeReceipt) return;
    window.print();
  };

  const handleSaveAsImageManual = () => {
    if (activeReceipt) captureAndDownload(activeReceipt);
  };

  useEffect(() => {
    if (activeReceipt) {
      const nextDue = (activeReceipt.balanceAmount || 0) + (activeReceipt.monthlyFee - (activeReceipt.discount || 0));
      const textMessage = `*${settings.businessName} RECEIPT*\n--------------------------\n*Ref:* ${activeReceipt.transactionRef}\n*Date:* ${new Date(activeReceipt.date).toLocaleDateString()}\n*Customer:* ${activeReceipt.userName}\n*Method:* ${activeReceipt.paymentMethod}\n*Period:* ${activeReceipt.period}\n\n*Amount Paid:* Rs. ${(activeReceipt.paidAmount || 0).toLocaleString()}\n*Next Month's Due:* Rs. ${nextDue.toLocaleString()}\n--------------------------\nThank you for your payment!`;
      setShareMessage(textMessage);
      setSmsTemplate(textMessage.replace(/\*/g, ''));
    }
  }, [activeReceipt, settings.businessName]);

  const handleWhatsAppShare = async () => {
    if (!activeReceipt) return;
    setIsSharing(true);
    setLoadingMessage('Preparing Encrypted Transfer Package...');
    
    try {
      const element = document.getElementById('receipt-download-area');
      if (!element) return;
      const canvas = await html2canvas(element, { scale: 2, backgroundColor: '#ffffff' });
      
      canvas.toBlob(async (blob: Blob | null) => {
        if (blob && navigator.share) {
          try {
            const file = new File([blob], `Receipt_${activeReceipt.transactionRef}.png`, { type: 'image/png' });
            await navigator.share({
              title: 'Receipt',
              text: shareMessage,
              files: [file],
            });
          } catch (err: any) {
            shareToWhatsApp(activeReceipt.userPhone, shareMessage);
          }
        } else {
          shareToWhatsApp(activeReceipt.userPhone, shareMessage);
        }
        setIsSharing(false);
        setLoadingMessage(null);
      }, 'png');
    } catch (error) {
      shareToWhatsApp(activeReceipt.userPhone, shareMessage);
      setIsSharing(false);
      setLoadingMessage(null);
    }
  };

  const filteredReceipts = receipts.filter(r => {
    const matchesSearch = (r.userName || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
      (r.username || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.transactionRef || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.userPhone || '').includes(searchTerm);
    
    const matchesMonth = !filterMonth || r.period.includes(filterMonth);
    const matchesYear = !filterYear || r.period.includes(filterYear);
    
    return matchesSearch && matchesMonth && matchesYear;
  });

  const creationFilteredUsers = users.filter(u => {
    const matchesSearch = (u.name || '').toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
      (u.username || '').toLowerCase().includes(customerSearchQuery.toLowerCase()) ||
      (u.phone || '').includes(customerSearchQuery);
    
    // Check if user already has a receipt for the selected billing period
    const alreadyBilled = receipts.some(r => r.userId === u.id && r.period === `${billingMonth} ${billingYear}`);
    
    // Soft Delete & Status Handling: Exclude deleted or non-active users
    const isDeleted = u.status === 'deleted';
    const isActive = u.status === 'active';
    
    // Billing Cycle Check: Only show users who are active and not already billed for this period
    return matchesSearch && !alreadyBilled && !isDeleted && isActive;
  });

  const renderReceiptBody = () => {
    if (!activeReceipt) return null;
    const currentSelectedUser = users.find(u => u.id === activeReceipt.userId);
    const storedMonthlyFee = activeReceipt.monthlyFee || (currentSelectedUser ? (settings.planPrices[currentSelectedUser.plan] || 0) : 0);
    const arrears = Math.max(0, (activeReceipt.totalAmount || 0) + (activeReceipt.discount || 0) - (storedMonthlyFee || 0));
    const nextMonthDue = (activeReceipt.balanceAmount || 0) + (storedMonthlyFee - (activeReceipt.discount || 0));

    // Common Ads component for all designs
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
        <div className={`mt-8 pt-8 border-t-4 border-dashed border-slate-100`}>
          <div className="bg-indigo-50-op40 p-6 rounded-[2rem] border-2 border-indigo-100-op50 flex flex-col items-center text-center gap-4">
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
          <div className="bg-white p-12 text-black font-sans border-[6px] border-slate-900 w-full relative overflow-hidden shadow-2xl">
            {/* Aesthetic Background Watermark */}
            <div className="absolute top-0 right-0 opacity-[0.03] pointer-events-none transform -rotate-12 translate-x-1/4 -translate-y-1/4">
               <svg className="w-[600px] h-[600px]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
            </div>

            {/* Top Corporate Header */}
            <div className="flex justify-between items-start border-b-[4px] border-slate-900 pb-10 mb-10">
              <div className="flex-1">
                <div className="flex items-center gap-4 mb-4">
                   <div className="h-[60px] w-auto bg-white border-2 border-slate-900 rounded-2xl flex items-center justify-center overflow-hidden shadow-lg p-2">
                     {settings.businessLogo ? (
                       <img src={settings.businessLogo} alt="Logo" className="h-full w-auto object-contain" referrerPolicy="no-referrer" />
                     ) : (
                       <img src="/logo-v3.png" alt="Logo" className="h-full w-auto object-contain" referrerPolicy="no-referrer" />
                     )}
                   </div>
                   <div>
                     <h1 className="text-5xl font-black uppercase tracking-tighter leading-none">{settings.businessName}</h1>
                     <p className="text-xs font-black uppercase text-indigo-600 tracking-[0.3em] mt-2">Digital Utility Infrastructure</p>
                   </div>
                </div>
                <div className="mt-8 grid grid-cols-2 gap-4 text-[13px] font-bold text-slate-700">
                  <p className="flex items-center gap-3"><span className="text-lg">📞</span> {settings.businessPhone}</p>
                  <p className="flex items-center gap-3"><span className="text-lg">✉️</span> {settings.businessEmail}</p>
                  <p className="flex items-center gap-3 col-span-2"><span className="text-lg">📍</span> {settings.businessAddress}</p>
                </div>
              </div>
              <div className="text-right flex flex-col justify-between items-end h-full min-h-[160px]">
                <div className="bg-slate-50 p-6 rounded-[2rem] border-[3px] border-slate-900 shadow-[6px_6px_0px_rgba(0,0,0,1)]">
                   <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest leading-none mb-2">Instrument Serial</p>
                   <p className="text-3xl font-black tracking-tighter">{activeReceipt.transactionRef}</p>
                </div>
                <div className="bg-slate-900 text-white px-5 py-2 rounded-xl mt-4">
                   <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-60">Cycle: {activeReceipt.period}</p>
                </div>
                {activeReceipt.isLatePayment && (
                  <div className="bg-rose-600 text-white px-5 py-2 rounded-xl mt-2 flex items-center gap-2">
                     <span className="text-lg">⏰</span>
                     <p className="text-[9px] font-black uppercase tracking-[0.2em]">Late Payment Received: {new Date(activeReceipt.actualPaymentDate || activeReceipt.date).toLocaleDateString()}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Subscriber & Account Overview */}
            <div className="grid grid-cols-6 gap-0 border-[3px] border-slate-900 mb-10 rounded-[2.5rem] overflow-hidden shadow-[8px_8px_0px_rgba(0,0,0,1)]">
               <div className="p-8 border-r-[3px] border-slate-900 bg-slate-50 col-span-3">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Account Holder</p>
                  <p className="text-2xl font-black uppercase leading-tight tracking-tight break-words">{activeReceipt.userName}</p>
                  <p className="text-sm font-black text-indigo-700 mt-2 px-3 py-1.5 bg-indigo-100 rounded-full inline-block break-all">NODE: @{activeReceipt.username}</p>
                  <div className="mt-6 pt-6 border-t border-slate-200">
                     <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Authorized Contact</p>
                     <p className="text-sm font-black text-slate-800">{activeReceipt.userPhone}</p>
                  </div>
               </div>
               <div className="p-8 col-span-3 flex flex-col justify-between">
                  <div>
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Physical Installation Address</p>
                    <p className="text-lg font-bold uppercase leading-relaxed text-slate-800 max-w-md">{activeReceipt.userAddress || 'ADDRESS RECORD NOT PROVIDED'}</p>
                  </div>
                  <div className="flex gap-10 mt-8">
                     <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Revenue Status</p>
                        <p className="text-sm font-black text-emerald-600 uppercase">Paid / Confirmed</p>
                     </div>
                     <div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Entry Date</p>
                        <p className="text-sm font-black uppercase">{new Date(activeReceipt.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
                     </div>
                  </div>
               </div>
            </div>

            {/* Financial Detail Table */}
            <div className="mb-12">
               <table className="w-full text-left border-collapse border-[3px] border-slate-900 rounded-[2rem] overflow-hidden">
                  <thead className="bg-slate-900 text-white text-[13px] uppercase font-black tracking-[0.2em]">
                    <tr>
                      <th className="p-6 border-r-[2px] border-white-op10">Consolidated Billing Component</th>
                      <th className="p-6 text-right w-64">Net PKR</th>
                    </tr>
                  </thead>
                  <tbody className="text-[15px] font-black">
                    <tr className="border-b-[3px] border-slate-900">
                      <td className="p-6 uppercase text-slate-600">Monthly High-Speed Bandwidth ({activeReceipt.period})</td>
                      <td className="p-6 text-right">{(storedMonthlyFee || 0).toLocaleString()}.00</td>
                    </tr>
                    {arrears > 0 && (
                      <tr className="border-b-[3px] border-slate-900 bg-rose-50 text-rose-700">
                        <td className="p-6 uppercase">Unpaid Outstanding Arrears (Previous Ledger)</td>
                        <td className="p-6 text-right">{(arrears || 0).toLocaleString()}.00</td>
                      </tr>
                    )}
                    {activeReceipt.advanceAmount > 0 ? (
                      <tr className="border-b-[3px] border-slate-900 bg-indigo-50 text-indigo-700">
                        <td className="p-6 uppercase">Advance Payment / Credit Applied</td>
                        <td className="p-6 text-right">{(activeReceipt.advanceAmount || 0).toLocaleString()}.00</td>
                      </tr>
                    ) : null}
                    {activeReceipt.discount && activeReceipt.discount > 0 && (
                      <tr className="border-b-[3px] border-slate-900 bg-emerald-50 text-emerald-700 italic">
                        <td className="p-6 uppercase">Applied Account Rebate / Loyalty Reward</td>
                        <td className="p-6 text-right">-{(activeReceipt.discount || 0).toLocaleString()}.00</td>
                      </tr>
                    )}
                    <tr className="bg-slate-100">
                       <td className="p-6 text-right uppercase text-slate-500 font-black text-[12px]">Gross Net Amount Payable:</td>
                       <td className="p-6 text-right text-lg">{(activeReceipt.totalAmount || 0).toLocaleString()}.00</td>
                    </tr>
                  </tbody>
               </table>
            </div>

            {/* Summary & Promotion Block */}
            <div className="flex flex-col md:flex-row justify-between items-stretch gap-10">
               <div className="flex-1 flex flex-col gap-6">
                  <div className="p-8 bg-slate-50 rounded-[2.5rem] border-[3px] border-slate-900 border-dashed relative">
                     <p className="text-[11px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-3">
                        <span className="w-3 h-3 rounded-full bg-indigo-500"></span> 
                        Legal Statement & Terms
                     </p>
                     <p className="text-[12px] leading-relaxed text-slate-700 font-bold">
                       • This instrument is a digitally verified proof of connectivity payment.<br/>
                       • Service activation is subject to the clearing of the mentioned net amount.<br/>
                       • Technical support is available via the office contact listed above.<br/>
                       {settings.globalNote && <span className="block mt-3 text-indigo-700 font-black">• {settings.globalNote}</span>}
                     </p>
                  </div>
                  
                  {/* Visual Advertisement for Utility Design */}
                  {(settings.billAds || settings.billAdsImage) && (
                    <div className="p-8 bg-yellow-50 rounded-[2.5rem] border-[3px] border-yellow-400 border-dashed flex flex-col gap-4">
                       <div className="flex items-center gap-3">
                          <span className="text-2xl">📢</span>
                          <p className="text-[11px] font-black text-yellow-800 uppercase tracking-[0.2em]">Network Promotional Update</p>
                       </div>
                       {settings.billAdsImage && (
                         <div className="w-full rounded-2xl overflow-hidden shadow-md border border-white">
                           <img src={settings.billAdsImage} className="w-full h-auto" alt="Promotion" />
                         </div>
                       )}
                       {settings.billAds && (
                         <p className="text-sm font-black text-slate-900 leading-tight italic">"{settings.billAds}"</p>
                       )}
                    </div>
                  )}
               </div>

               <div className="w-full md:w-96 flex flex-col gap-5">
                  <div className="bg-indigo-600 text-white p-8 rounded-[3rem] shadow-[8px_8px_0px_rgba(0,0,0,1)] border-[4px] border-slate-900 flex flex-col items-center text-center">
                     <p className="text-[11px] font-black uppercase tracking-[0.4em] opacity-70 mb-3">Amount Received</p>
                     <span className="text-5xl font-black tracking-tighter">Rs. {(activeReceipt.paidAmount || 0).toLocaleString()}</span>
                     <p className="text-[10px] font-black uppercase tracking-[0.2em] mt-4 py-1.5 px-6 bg-white-op20 rounded-full">Transaction Success</p>
                  </div>
                  
                  <div className={`p-8 rounded-[2.5rem] border-[3px] border-slate-900 flex justify-between items-center ${nextMonthDue > 0 ? 'bg-rose-50' : 'bg-emerald-50'}`}>
                     <div>
                        <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-1">Next Cycle Status</p>
                        <p className="text-xl font-black uppercase tracking-tight">{nextMonthDue > 0 ? 'Outstanding Due' : 'Account Credit'}</p>
                     </div>
                     <span className={`text-2xl font-black ${nextMonthDue > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        Rs. {Math.abs(nextMonthDue).toLocaleString()}
                     </span>
                  </div>
               </div>
            </div>

            {/* Bottom Detachable Marker */}
            <div className="mt-16 border-t-[4px] border-dashed border-slate-300 pt-10 text-center relative">
               <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-8 py-2 bg-white border-[3px] border-slate-300 rounded-full text-[11px] font-black uppercase text-slate-300 tracking-[0.5em]">
                  Detach Office Copy
               </div>
               <p className="text-[13px] font-black uppercase text-slate-400 tracking-[0.3em] mb-2">Verified System Instrument • Generated via ISP Manager Node v2.6</p>
               <p className="text-[10px] font-bold text-slate-300 uppercase italic">Digital signature not required • Valid for audit and reconciliation</p>
            </div>
          </div>
        );

      case ReceiptDesign.THERMAL:
        return (
          <div className="flex flex-col items-center text-center p-1 text-black leading-tight bg-white">
            {settings.businessLogo ? (
              <img src={settings.businessLogo} alt="Logo" className="h-[50px] w-auto object-contain mb-2 grayscale" referrerPolicy="no-referrer" />
            ) : (
              <img src="/logo-v3.png" alt="Logo" className="h-[50px] w-auto object-contain mb-2 grayscale" referrerPolicy="no-referrer" />
            )}
            <h2 className="text-xl font-black uppercase mb-1">{settings.businessName}</h2>
            <p className="text-[10px] font-bold">{activeReceipt.isLatePayment ? 'LATE PAYMENT RECEIPT' : 'ISP SUBSCRIPTION RECEIPT'}</p>
            {activeReceipt.isLatePayment && (
              <p className="text-[9px] font-black bg-black text-white px-2 py-0.5 mt-1">RCVD: {new Date(activeReceipt.actualPaymentDate || activeReceipt.date).toLocaleDateString()}</p>
            )}
            <p className="text-[10px] mb-2">{settings.businessPhone}</p>
            <p className="text-[9px] border-y border-dashed border-slate-300 w-full py-1 mb-3 font-mono">-------------------------------------</p>
            <div className="w-full text-left space-y-1.5 mb-3">
              <div className="flex justify-between text-[11px]"><span className="font-bold">SERIAL:</span><span>{activeReceipt.transactionRef}</span></div>
              <div className="flex justify-between text-[11px]"><span className="font-bold">DATE:</span><span>{new Date(activeReceipt.date).toLocaleDateString()}</span></div>
              <div className="flex justify-between text-[11px]"><span className="font-bold">PAYMENT:</span><span className="font-black uppercase">{activeReceipt.paymentMethod}</span></div>
              <div className="flex justify-between text-[11px]"><span className="font-bold">NAME:</span><span className="font-black whitespace-normal text-right flex-1 ml-2">{activeReceipt.userName}</span></div>
              <div className="flex justify-between text-[11px]"><span className="font-bold">ADDR:</span><span className="font-bold text-[9px] whitespace-normal text-right flex-1 ml-2">{activeReceipt.userAddress || 'N/A'}</span></div>
              <div className="flex justify-between text-[11px]"><span className="font-bold">PERIOD:</span><span>{activeReceipt.period}</span></div>
            </div>
            <p className="text-[9px] border-b border-dashed border-slate-300 w-full pb-1 mb-3 font-mono">-------------------------------------</p>
            <div className="w-full text-left space-y-1 mb-4 text-[11px]">
              <div className="flex justify-between"><span>Monthly Bill:</span><span>Rs. {(storedMonthlyFee || 0).toLocaleString()}</span></div>
              {arrears > 0 && <div className="flex justify-between text-red-600"><span>Previous Dues:</span><span>Rs. {(arrears || 0).toLocaleString()}</span></div>}
              {activeReceipt.advanceAmount > 0 ? <div className="flex justify-between text-indigo-600 font-bold"><span>Advance:</span><span>Rs. {(activeReceipt.advanceAmount || 0).toLocaleString()}</span></div> : null}
              {activeReceipt.discount && activeReceipt.discount > 0 ? <div className="flex justify-between text-emerald-600 font-bold"><span>Discount Applied:</span><span>-Rs. {(activeReceipt.discount || 0).toLocaleString()}</span></div> : null}
              <div className="flex justify-between font-black border-t border-slate-100 pt-1"><span>Total Payable:</span><span>Rs. {(activeReceipt.totalAmount || 0).toLocaleString()}</span></div>
              <div className="pt-2"></div>
              <div className="flex justify-between text-indigo-700 font-bold"><span>Amount Paid:</span><span>Rs. {(activeReceipt.paidAmount || 0).toLocaleString()}</span></div>
              <div className="flex justify-between font-black pt-1 mt-1 border-t border-dashed border-slate-200"><span>Next Month Due:</span><span>Rs. {nextMonthDue.toLocaleString()}</span></div>
            </div>
            <AdsSection design={ReceiptDesign.THERMAL} />
            <p className="text-[9px] font-bold uppercase tracking-wider mt-2">Thank you!</p>
          </div>
        );

      case ReceiptDesign.MODERN:
        return (
          <div className="bg-white p-6 rounded-[2rem] text-slate-900 font-sans shadow-sm border border-slate-100">
            <div className="flex justify-between items-center mb-8 bg-indigo-600 p-6 rounded-[1.5rem] text-white">
              <div className="flex items-center gap-3">
                <div className="h-[60px] w-auto bg-white rounded-xl flex items-center justify-center overflow-hidden shadow-sm p-1">
                  {settings.businessLogo ? (
                    <img src={settings.businessLogo} alt="Logo" className="h-full w-auto object-contain" referrerPolicy="no-referrer" />
                  ) : (
                    <img src="/logo-v3.png" alt="Logo" className="h-full w-auto object-contain" referrerPolicy="no-referrer" />
                  )}
                </div>
                <div>
                  <h2 className="font-black text-lg leading-none">{settings.businessName}</h2>
                  <p className="text-[9px] opacity-70 font-bold tracking-widest uppercase mt-1">
                    {activeReceipt.isLatePayment ? 'Late Payment Entry' : 'Transaction Success'}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black opacity-60">SN: {activeReceipt.transactionRef}</p>
                <p className="text-[9px] font-bold mt-1 opacity-80">{new Date(activeReceipt.date).toLocaleDateString()}</p>
              </div>
            </div>
            
            <div className="space-y-6 px-2">
              <div className="flex justify-between items-end border-b border-slate-50 pb-4">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Customer</p>
                  <p className="text-lg font-black">{activeReceipt.userName}</p>
                  <p className="text-xs font-bold text-indigo-600">@{activeReceipt.username}</p>
                  <p className="text-[10px] font-medium text-slate-500 mt-1">{activeReceipt.userAddress}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Payment Method</p>
                  <p className="text-xs font-black text-slate-700 uppercase tracking-tight">{activeReceipt.paymentMethod}</p>
                </div>
              </div>

              <div className="space-y-2 py-2">
                <div className="flex justify-between text-sm"><span className="text-slate-500 font-medium">Monthly Plan ({activeReceipt.period})</span><span className="font-black">Rs. {storedMonthlyFee.toLocaleString()}</span></div>
                {arrears > 0 && <div className="flex justify-between text-sm"><span className="text-slate-500 font-medium">Previous Arrears</span><span className="font-black text-rose-500">Rs. {arrears.toLocaleString()}</span></div>}
                {activeReceipt.advanceAmount > 0 ? <div className="flex justify-between text-sm"><span className="text-indigo-600 font-bold">Advance Payment</span><span className="font-black text-indigo-600">Rs. {activeReceipt.advanceAmount.toLocaleString()}</span></div> : null}
                {activeReceipt.discount && activeReceipt.discount > 0 ? <div className="flex justify-between text-sm"><span className="text-emerald-600 font-bold">Discount Applied</span><span className="font-black text-emerald-600">-Rs. {activeReceipt.discount.toLocaleString()}</span></div> : null}
              </div>

              <div className="bg-slate-50 p-6 rounded-[1.5rem] flex flex-col items-center gap-1 border border-slate-100 shadow-inner">
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Amount Received</p>
                 <p className="text-3xl font-black text-indigo-600">Rs. {(activeReceipt.paidAmount || 0).toLocaleString()}</p>
              </div>

              <div className="flex justify-between items-center pt-2">
                 <div className="text-left">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Next Month Due</p>
                    <p className="text-sm font-black text-slate-900">Rs. {nextMonthDue.toLocaleString()}</p>
                 </div>
                 <div className="px-4 py-2 bg-emerald-100 text-emerald-700 rounded-full text-[9px] font-black uppercase tracking-widest">Paid</div>
              </div>
              <AdsSection design={ReceiptDesign.MODERN} />
            </div>
            <div className="mt-8 text-center"><p className="text-[9px] text-slate-300 font-bold uppercase tracking-widest italic">{settings.globalNote || 'Thank you for your business!'}</p></div>
          </div>
        );

      case ReceiptDesign.COMPACT:
        return (
          <div className="bg-white p-5 border-2 border-slate-100 text-slate-900 max-w-[300px] mx-auto rounded-none">
            <div className="flex justify-center mb-4">
              {settings.businessLogo ? (
                <img src={settings.businessLogo} alt="Logo" className="h-[40px] w-auto object-contain" referrerPolicy="no-referrer" />
              ) : (
                <img src="/logo-v3.png" alt="Logo" className="h-[40px] w-auto object-contain" referrerPolicy="no-referrer" />
              )}
            </div>
            <div className="text-center border-b border-dashed border-slate-200 pb-3 mb-4">
              <h3 className="font-black text-sm uppercase leading-none">{settings.businessName}</h3>
              <p className="text-[8px] font-bold text-slate-400 mt-1 uppercase">{activeReceipt.isLatePayment ? 'Late Payment History' : 'Instant Payment Proof'}</p>
            </div>
            <div className="space-y-1.5 text-[11px] mb-4">
              <div className="flex justify-between"><span className="text-slate-400 font-bold uppercase">Ref:</span><span className="font-black">{activeReceipt.transactionRef}</span></div>
              <div className="flex justify-between"><span className="text-slate-400 font-bold uppercase">Date:</span><span>{new Date(activeReceipt.date).toLocaleDateString()}</span></div>
              <div className="flex justify-between"><span className="text-slate-400 font-bold uppercase">Mode:</span><span className="font-black uppercase">{activeReceipt.paymentMethod}</span></div>
              <div className="flex justify-between border-t border-slate-50 pt-1.5"><span className="text-slate-400 font-bold uppercase">User:</span><span className="font-black whitespace-normal text-right flex-1 ml-4">{activeReceipt.userName}</span></div>
              {activeReceipt.userAddress && <div className="flex justify-between"><span className="text-slate-400 font-bold uppercase">Addr:</span><span className="font-medium text-[9px] whitespace-normal text-right flex-1 ml-4">{activeReceipt.userAddress}</span></div>}
              {activeReceipt.advanceAmount > 0 ? <div className="flex justify-between"><span className="text-slate-400 font-bold uppercase">Adv:</span><span className="font-black text-indigo-600">Rs. {(activeReceipt.advanceAmount || 0).toLocaleString()}</span></div> : null}
              <div className="flex justify-between"><span className="text-slate-400 font-bold uppercase">Paid:</span><span className="font-black text-indigo-600">Rs. {(activeReceipt.paidAmount || 0).toLocaleString()}</span></div>
              <div className="flex justify-between border-t border-dashed border-slate-100 pt-1.5"><span className="text-slate-400 font-bold uppercase">Next Due:</span><span className="font-black">Rs. {nextMonthDue.toLocaleString()}</span></div>
            </div>
            {(settings.billAds || settings.billAdsImage) && (
              <div className="text-center border-t border-slate-100 pt-2 mb-3">
                 {settings.billAdsImage && <img src={settings.billAdsImage} className="max-w-[100px] h-auto mx-auto mb-1 rounded" alt="Ad" />}
                 {settings.billAds && <p className="text-[9px] text-indigo-600 font-bold">"{settings.billAds}"</p>}
              </div>
            )}
            <div className="text-[8px] text-center font-black text-slate-300 uppercase tracking-widest">Verified Digital Receipt</div>
          </div>
        );

      case ReceiptDesign.PROFESSIONAL:
      default:
        return (
          <div className="text-black bg-white p-2">
            <div className="flex justify-between items-start mb-10 border-b-2 border-slate-50 pb-8">
              <div className="flex items-center gap-4">
                <div className="h-[60px] w-auto bg-white border border-slate-100 rounded-2xl flex items-center justify-center overflow-hidden shadow-sm p-1">
                  {settings.businessLogo ? (
                    <img src={settings.businessLogo} alt="Logo" className="h-full w-auto object-contain" referrerPolicy="no-referrer" />
                  ) : (
                    <img src="/logo-v3.png" alt="Logo" className="h-full w-auto object-contain" referrerPolicy="no-referrer" />
                  )}
                </div>
                <div>
                  <h2 className="text-4xl font-black text-indigo-950 uppercase">{settings.businessName}</h2>
                  <div className="flex items-center gap-2 mt-2">
                    <p className="text-[10px] text-indigo-50 font-black uppercase tracking-[0.15em] bg-indigo-600 px-2 py-1 inline-block rounded">{settings.businessPhone}</p>
                    {activeReceipt.isLatePayment && (
                      <p className="text-[10px] text-white font-black uppercase tracking-[0.15em] bg-rose-500 px-2 py-1 inline-block rounded">Late Payment Received</p>
                    )}
                  </div>
                </div>
              </div>
              <div className="text-right"><p className="text-xs font-black text-indigo-600 uppercase tracking-widest mb-1">SN: {activeReceipt.transactionRef}</p><p className="text-[10px] font-bold text-slate-400">{new Date(activeReceipt.date).toLocaleDateString()}</p></div>
            </div>
            <div className="grid grid-cols-2 gap-10 mb-8">
              <div className="space-y-2">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Bill To</p>
                <div>
                  <p className="text-xl font-black text-black leading-none">{activeReceipt.userName}</p>
                  <p className="text-xs font-black text-indigo-600 uppercase tracking-tight mt-1">@{activeReceipt.username}</p>
                </div>
                <p className="text-xs text-slate-500 font-bold">{activeReceipt.userPhone}</p>
                <p className="text-xs text-slate-500 font-medium">{activeReceipt.userAddress}</p>
              </div>
              <div className="text-right space-y-4">
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Billing Period</p>
                  <p className="text-sm font-bold text-black">{activeReceipt.period}</p>
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Payment Method</p>
                  <p className="text-sm font-black text-indigo-600 uppercase tracking-tight">{activeReceipt.paymentMethod}</p>
                </div>
              </div>
            </div>
            <div className="bg-slate-50 rounded-[2rem] p-8 mb-6 border border-slate-100">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-slate-200 text-black"><th className="text-left pb-4 font-bold uppercase text-[10px] tracking-widest">Description</th><th className="text-right pb-4 font-bold uppercase text-[10px] tracking-widest">Amount</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  <tr><td className="py-4 font-black text-black">Monthly Subscription - {activeReceipt.period}</td><td className="py-4 text-right font-black text-black">Rs. {(storedMonthlyFee || 0).toLocaleString()}</td></tr>
                  {arrears > 0 && <tr><td className="py-2 text-slate-500 italic">Previous Arrears</td><td className="py-2 text-right font-bold text-red-500">Rs. {(arrears || 0).toLocaleString()}</td></tr>}
                  {activeReceipt.advanceAmount && activeReceipt.advanceAmount > 0 ? (
                    <tr><td className="py-2 text-indigo-600 italic">Advance Payment</td><td className="py-2 text-right font-bold text-indigo-600">Rs. {(activeReceipt.advanceAmount || 0).toLocaleString()}</td></tr>
                  ) : null}
                  {activeReceipt.discount && activeReceipt.discount > 0 ? (
                    <tr><td className="py-4 font-bold text-emerald-600 italic">Persistent Discount</td><td className="py-4 text-right font-black text-emerald-600">-Rs. {(activeReceipt.discount || 0).toLocaleString()}</td></tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            <div className="space-y-2 px-6 text-right">
              <div className="flex justify-between items-center"><span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Net Payable</span><span className="text-lg font-black text-slate-800">Rs. {(activeReceipt.totalAmount || 0).toLocaleString()}</span></div>
              <div className="flex justify-between items-center border-t border-slate-100 pt-2 mt-2"><span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Amount Received</span><span className="text-2xl font-black text-indigo-600">Rs. {(activeReceipt.paidAmount || 0).toLocaleString()}</span></div>
              <div className="flex justify-between items-center pt-2 mt-2 border-t border-dashed border-slate-200"><span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Next Month's Due</span><span className="text-xl font-black text-slate-900">Rs. {nextMonthDue.toLocaleString()}</span></div>
            </div>
            <AdsSection design={ReceiptDesign.PROFESSIONAL} />
            <div className="mt-12 pt-8 border-t border-slate-50 text-center">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">{settings.globalNote || 'Thank you for choosing MahadNet!'}</p>
            </div>
          </div>
        );
    }
  };

  if (viewMode === 'list') {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-3xl font-black text-black dark:text-white uppercase tracking-tight">Billing History</h3>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-black uppercase tracking-[0.2em]">Transaction Logs (Stored Offline)</p>
          </div>
          <button onClick={() => { setViewMode('create'); setActiveReceipt(null); setEditingReceiptId(null); setSelectedUserId(''); setCustomerSearchQuery(''); }} className="px-6 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg text-xs uppercase tracking-widest flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"></path></svg>
            New Invoice
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </span>
            <input type="text" placeholder="Search invoices..." className="w-full pl-12 pr-4 py-4 border rounded-2xl text-sm font-bold bg-white dark:bg-[#0a1120] border-slate-200 dark:border-white-op5 text-slate-900 dark:text-slate-100 outline-none" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          
          <div className="flex gap-2">
            <select 
              className="flex-1 p-4 rounded-2xl border bg-white dark:bg-[#0a1120] border-slate-200 dark:border-white-op5 text-sm font-bold text-slate-900 dark:text-slate-100 outline-none"
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
            >
              <option value="">All Months</option>
              {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <select 
              className="flex-1 p-4 rounded-2xl border bg-white dark:bg-[#0a1120] border-slate-200 dark:border-white-op5 text-sm font-bold text-slate-900 dark:text-slate-100 outline-none"
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
            >
              <option value="">All Years</option>
              {Array.from({ length: 5 }, (_, i) => (new Date().getFullYear() - i).toString()).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
                <div className="bg-white dark:bg-[#0a1120] rounded-[2.5rem] shadow-2xl border border-slate-100 dark:border-white-op5 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50 dark:bg-[#0a1120] text-[9px] uppercase font-black tracking-widest text-slate-400 border-b dark:border-white-op5">
                        <tr><th className="px-8 py-6">Serial</th><th className="px-8 py-6">Customer</th><th className="px-8 py-6">Paid</th><th className="px-8 py-6 text-right">Actions</th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-white-op5">
                        {[...filteredReceipts].reverse().map((r) => (
                          <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-indigo-500-op5 transition-colors group">
                            <td className="px-8 py-5"><p className="text-xs font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">{r.transactionRef}</p><p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold">{new Date(r.date || new Date()).toLocaleDateString()}</p></td>
                            <td className="px-8 py-5"><p className="text-sm font-black text-slate-900 dark:text-slate-100">{r.userName}</p></td>
                            <td className="px-8 py-5"><p className="text-sm font-black text-slate-900 dark:text-slate-100">Rs. {(r.paidAmount || 0).toLocaleString()}</p></td>
                            <td className="px-8 py-5 text-right"><button onClick={() => handleViewReceipt(r)} className="px-4 py-2 text-indigo-600 font-black text-[10px] uppercase bg-indigo-50 dark:bg-indigo-500-op10 rounded-xl transition-all hover:bg-indigo-600 hover:text-white">View Details</button></td>
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
    <div className="space-y-6 animate-in fade-in duration-300">
        <div className="flex items-center justify-between no-print">
          <div className="flex items-center gap-4">
            <button onClick={() => setViewMode('list')} className="p-3 bg-white dark:bg-[#0a1120] border border-slate-200 dark:border-white-op5 rounded-2xl shadow-sm text-slate-400 transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
            </button>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight">New Invoice</h3>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {viewMode === 'create' && (
            <div className="bg-white dark:bg-[#0a1120] p-8 rounded-[2.5rem] shadow-2xl border border-slate-100 dark:border-white-op5 space-y-6 no-print">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">Receipt ID</label>
                  <input 
                    type="text" 
                    className="w-full p-4 rounded-2xl border bg-slate-50 dark:bg-[#030712] border-slate-200 dark:border-white-op10 text-sm font-bold text-slate-900 dark:text-slate-100 outline-none" 
                    value={transactionRef} 
                    onChange={e => setTransactionRef(e.target.value)} 
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">Billing Month</label>
                  <select 
                    className="w-full p-4 rounded-2xl border bg-slate-50 dark:bg-[#030712] border-slate-200 dark:border-white-op10 text-sm font-bold text-slate-900 dark:text-slate-100 outline-none"
                    value={billingMonth}
                    onChange={(e) => setBillingMonth(e.target.value)}
                  >
                    {["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">Billing Year</label>
                  <select 
                    className="w-full p-4 rounded-2xl border bg-slate-50 dark:bg-[#030712] border-slate-200 dark:border-white-op10 text-sm font-bold text-slate-900 dark:text-slate-100 outline-none"
                    value={billingYear}
                    onChange={(e) => setBillingYear(e.target.value)}
                  >
                    {Array.from({ length: 5 }, (_, i) => (new Date().getFullYear() - i).toString()).map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1 relative" ref={searchDropdownRef}>
                <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">Select Customer</label>
                <input type="text" className="w-full p-5 rounded-2xl border bg-slate-50 dark:bg-[#030712] text-slate-900 dark:text-slate-100 border-slate-200 dark:border-white-op10 outline-none text-sm font-bold shadow-inner placeholder-slate-300 dark:placeholder-slate-600" placeholder="Search subscriber..." value={customerSearchQuery} onChange={(e) => { setCustomerSearchQuery(e.target.value); if (!selectedUserId) setIsSearchDropdownOpen(true); }} onFocus={() => { if (!selectedUserId) setIsSearchDropdownOpen(true); }} />
                {isSearchDropdownOpen && !selectedUserId && (<div className="absolute z-50 w-full mt-2 bg-white dark:bg-[#0a1120] rounded-2xl shadow-2xl border border-slate-100 dark:border-white-op10 overflow-hidden max-h-64 overflow-y-auto">{creationFilteredUsers.map(u => (<button key={u.id} onClick={() => handleUserSelect(u.id)} className="w-full text-left p-4 hover:bg-indigo-50 dark:hover:bg-indigo-500-op10 border-b border-slate-50 dark:border-white-op10 transition-colors flex justify-between items-center text-slate-900 dark:text-slate-100"><div><p className="text-sm font-black">{u.name}</p><p className="text-[10px] text-slate-500 dark:text-slate-400 font-black">@{u.username}</p></div></button>))}</div>)}
              </div>
            {selectedUserId && (
              <div className="space-y-6 animate-in slide-in-from-top-4">
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-1">
                     <label className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest ml-1">Monthly Bill</label>
                     <input 
                       type="number" 
                       className="w-full p-5 rounded-2xl border bg-slate-50 dark:bg-[#030712] text-slate-900 dark:text-slate-100 border-slate-200 dark:border-white-op10 outline-none text-xl font-black shadow-inner" 
                       value={monthlyFee || ''} 
                       onChange={e => {
                         const val = parseInt(e.target.value) || 0;
                         setMonthlyFee(val);
                         setAmountPaid((val + previousBalance) - discount);
                       }} 
                     />
                   </div>
                   <div className="space-y-1">
                     <label className="text-[10px] font-black text-rose-600 uppercase tracking-widest ml-1">Total Arrears</label>
                     <input 
                       type="number" 
                       className="w-full p-5 rounded-2xl border bg-slate-50 dark:bg-[#030712] text-rose-600 border-slate-200 dark:border-white-op10 outline-none text-xl font-black shadow-inner" 
                       value={previousBalance || ''} 
                       onChange={e => {
                         const val = parseInt(e.target.value) || 0;
                         setPreviousBalance(val);
                         setAmountPaid((monthlyFee + val) - discount);
                       }} 
                     />
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest ml-1">Payment Method</label>
                    <select 
                      className="w-full p-5 rounded-2xl border-2 border-slate-200 dark:border-white-op10 bg-slate-50 dark:bg-[#030712] font-black text-sm text-slate-900 dark:text-white outline-none appearance-none cursor-pointer shadow-inner"
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    >
                      {Object.values(PaymentMethod).map(method => (
                        <option key={method} value={method} className="dark:bg-slate-900">{method}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest ml-1">Payment Date</label>
                    <input 
                      type="date" 
                      className="w-full p-5 rounded-2xl border-2 border-slate-200 dark:border-white-op10 bg-slate-50 dark:bg-[#030712] font-black text-sm text-slate-900 dark:text-white outline-none shadow-inner"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest ml-1">Current Discount</label>
                    <input 
                      type="number" 
                      className="w-full p-5 rounded-2xl border-2 border-emerald-500-op10 bg-emerald-500-op5 outline-none font-black text-xl text-emerald-600 shadow-inner placeholder-slate-300" 
                      placeholder="0" 
                      value={discount || ''} 
                      onChange={e => { 
                        const val = parseInt(e.target.value) || 0; 
                        setDiscount(val); 
                        setAmountPaid((monthlyFee + previousBalance) - val); 
                      }} 
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest ml-1">Advance Amount (Optional)</label>
                    <input 
                      type="number" 
                      className="w-full p-5 rounded-2xl border-2 border-indigo-500-op10 bg-indigo-50 dark:bg-indigo-950-op20 outline-none font-black text-xl text-indigo-600 shadow-inner placeholder-slate-300" 
                      placeholder="0" 
                      value={advanceAmount || ''} 
                      onChange={e => setAdvanceAmount(parseInt(e.target.value) || 0)} 
                    />
                  </div>
                </div>

                <div className="space-y-1"><label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest ml-1">Amount to be Paid</label><input type="number" className="w-full p-5 rounded-2xl border-2 border-indigo-500-op10 bg-indigo-500-op5 dark:bg-indigo-950-op20 outline-none font-black text-slate-900 dark:text-white text-2xl shadow-xl" value={amountPaid || ''} onChange={e => setAmountPaid(parseInt(e.target.value) || 0)} /></div>
                
                <div className="bg-slate-900 dark:bg-[#030712] p-8 rounded-[2rem] text-white border border-slate-700 dark:border-white-op5 shadow-2xl relative overflow-hidden">
                  <div className="relative z-10 flex justify-between items-center"><span className="text-[10px] font-black uppercase tracking-widest opacity-60">Total Payable</span><span className="text-2xl font-black">Rs. {totalPayable.toLocaleString()}</span></div>
                  <div className="relative z-10 flex justify-between items-center border-t border-white-op10 pt-4 mt-4"><span className="text-[10px] font-black uppercase tracking-widest opacity-60">Next Month Due</span><span className={`text-xl font-black ${nextMonthDuePreview > 0 ? 'text-orange-400' : 'text-emerald-400'}`}>Rs. {Math.abs(nextMonthDuePreview).toLocaleString()}</span></div>
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-600-op10 rounded-full blur-3xl -mr-16 -mt-16"></div>
                </div>
                
                <button onClick={generateReceipt} disabled={!selectedUserId || isGenerating} className="w-full bg-[#5a4ff0] text-white py-6 rounded-2xl font-black shadow-2xl active:scale-95 transition-all uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-indigo-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                  {isGenerating ? 'Preparing Download...' : 'Generate & Download'}
                </button>
              </div>
            )}
          </div>
        )}
        <div className={`space-y-6 ${viewMode === 'view' ? 'lg:col-span-2 flex flex-col items-center' : ''}`}>
          {activeReceipt ? (
            <div className="flex flex-col gap-6 max-w-2xl w-full">
                {showSaveSuccess && (
                  <div className="bg-emerald-500 text-white p-4 rounded-2xl font-black text-[10px] uppercase tracking-widest text-center shadow-lg animate-in fade-in slide-in-from-top-4">
                    ✓ Receipt Downloaded Successfully
                  </div>
                )}
                {isDownloading && (
                  <div className="bg-indigo-600 text-white p-4 rounded-2xl font-black text-[10px] uppercase tracking-widest text-center shadow-lg animate-pulse">
                    ⚡ Preparing Download...
                  </div>
                )}
                <div id="receipt-download-area" className={`bg-white p-10 rounded-[3rem] shadow-2xl border border-slate-200 ${settings.receiptDesign === ReceiptDesign.THERMAL ? 'max-w-[350px] mx-auto rounded-none border-0' : ''}`}>
                    {renderReceiptBody()}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 no-print px-4">
                    <button onClick={handlePrint} className="bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all flex flex-col items-center gap-1.5">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 00-2 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path></svg>
                      Print
                    </button>
                    <button onClick={handleSaveAsImageManual} disabled={isDownloading} className="bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all flex flex-col items-center gap-1.5 disabled:opacity-50">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                      {isDownloading ? 'Downloading...' : 'Download Receipt'}
                    </button>
                    <button onClick={handleWhatsAppShare} disabled={isSharing} className="bg-green-600 hover:bg-green-700 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all flex flex-col items-center gap-1.5">
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.246 2.248 3.484 5.232 3.484 8.412-.003 6.557-5.338 11.892-11.893 11.892-1.997-.001-3.951-.5-5.688-1.448l-6.309 1.656zm6.224-3.62c1.566.933 3.46 1.441 5.519 1.442 5.457 0 9.894-4.437 9.897-9.895.002-2.646-1.03-5.132-2.903-7.005s-4.359-2.906-7.004-2.907c-5.456 0-9.892 4.437-9.894 9.895-.001 2.045.508 4.045 1.486 5.856l-.991 3.616 3.9-.996zm11.087-7.468c-.301-.15-1.784-.879-2.059-.98-.275-.1-.475-.15-.675.15s-.775.98-.95 1.18-.35.225-.65.075c-.301-.15-1.267-.467-2.414-1.491-.892-.796-1.493-1.778-1.668-2.079-.175-.301-.019-.463.131-.612.135-.133.301-.35.45-.525.15-.175.2-.3.3-.5s.05-.375-.025-.525c-.075-.15-.675-1.625-.925-2.225-.244-.588-.491-.508-.675-.517-.175-.008-.375-.01-.575-.01s-.525.075-.8.375c-.275.3-1.05 1.025-1.05 2.5s1.075 2.9 1.225 3.1c.15.2 2.116 3.231 5.126 4.532.715.311 1.273.497 1.707.635.719.227 1.373.195 1.89.118.577-.085 1.784-.73 2.034-1.435.25-.705.25-1.31.175-1.435-.075-.125-.275-.2-.575-.35z"/></svg>
                      WhatsApp
                    </button>
                    <button onClick={() => window.location.href = `sms:${activeReceipt.userPhone}?body=${encodeURIComponent(shareMessage.replace(/\*/g, ''))}`} className="bg-slate-900 hover:bg-slate-800 text-white py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all flex flex-col items-center gap-1.5">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                      Send SMS
                    </button>
                </div>

                <div className="bg-white dark:bg-[#0a1120] p-6 rounded-[2rem] shadow-xl border border-slate-100 dark:border-white-op5 no-print w-full">
                  <div className="flex justify-between items-center mb-4">
                    <h4 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-widest">Message Preview</h4>
                    <span className="text-[9px] font-black text-indigo-600 uppercase bg-indigo-50 dark:bg-indigo-500-op10 px-2 py-1 rounded">Editable</span>
                  </div>
                  <textarea 
                    className="w-full p-4 bg-slate-50 dark:bg-[#030712] border border-slate-200 dark:border-white-op10 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 outline-none focus:border-indigo-500 transition-all min-h-[150px] resize-none"
                    value={shareMessage}
                    onChange={(e) => setShareMessage(e.target.value)}
                  />
                  <div className="mt-4 flex gap-2">
                    <button onClick={handleWhatsAppShare} className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all">Quick WhatsApp</button>
                    <button onClick={() => window.location.href = `sms:${activeReceipt.userPhone}?body=${encodeURIComponent(shareMessage.replace(/\*/g, ''))}`} className="flex-1 bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all">Quick SMS</button>
                  </div>
                </div>
            </div>
          ) : (
            <div className="h-full min-h-[500px] flex flex-col items-center justify-center bg-slate-100 dark:bg-[#030712] rounded-[3rem] border-4 border-dashed border-slate-200 dark:border-white-op5 text-slate-400 dark:text-slate-700">
              <svg className="w-32 h-32 opacity-20 mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
              <p className="font-black uppercase tracking-[0.3em] text-[10px]">Invoice Preview Room</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ReceiptGenerator;
