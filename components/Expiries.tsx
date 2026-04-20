
import React, { useState } from 'react';
import { UserRecord, AppSettings } from '../types';
import { generateProfessionalMessage } from '../services/geminiService';
import { shareToWhatsApp } from '../utils/whatsapp';

interface ExpiriesProps {
  users: UserRecord[];
  settings: AppSettings;
  onMarkReminded: (userId: string) => void;
  setLoadingMessage: (msg: string | null) => void;
}

const Expiries: React.FC<ExpiriesProps> = ({ users, settings, onMarkReminded, setLoadingMessage }) => {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [isProcessingPriority, setIsProcessingPriority] = useState(false);
  const [isProcessingUpcoming, setIsProcessingUpcoming] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{ title: string; message: string; type: 'info' | 'success' } | null>(null);

  const getDaysUntilExpiry = (dateStr: string) => {
    const exp = new Date(dateStr);
    exp.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((exp.getTime() - today.getTime()) / (1000 * 3600 * 24));
  };

  const isRemindedToday = (lastSent?: string) => {
    if (!lastSent) return false;
    const last = new Date(lastSent).toDateString();
    const now = new Date().toDateString();
    return last === now;
  };

  const priorityUsers = users.filter(u => getDaysUntilExpiry(u.expiryDate) === 3);
  const upcomingUsers = users.filter(u => {
    const days = getDaysUntilExpiry(u.expiryDate);
    return days >= 0 && days <= 7 && days !== 3;
  }).sort((a, b) => getDaysUntilExpiry(a.expiryDate) - getDaysUntilExpiry(b.expiryDate));

  const handleSendMessage = async (user: UserRecord, channel: 'sms' | 'whatsapp') => {
    setLoadingId(`${user.id}-${channel}`);
    
    const currentPrice = settings.planPrices[user.plan] || user.monthlyFee || 0;
    const discount = user.persistentDiscount || 0;
    const totalDue = (currentPrice - discount) + (user.balance || 0);
    
    const message = await generateProfessionalMessage(
      user.name,
      totalDue,
      new Date(user.expiryDate).toLocaleDateString(),
      'REMINDER',
      settings
    );
    
    setLoadingId(null);
    onMarkReminded(user.id);

    if (channel === 'sms') {
      window.location.href = `sms:${user.phone}?body=${encodeURIComponent(message)}`;
    } else {
      await shareToWhatsApp(user.phone, message);
    }

    if (user.phone2 && user.phone2.trim()) {
      setTimeout(async () => {
        if (channel === 'sms') {
          window.open(`sms:${user.phone2}?body=${encodeURIComponent(message)}`, '_blank');
        } else {
          await shareToWhatsApp(user.phone2!, message);
        }
      }, 1500);
    }
  };

  const runAutomationCycle = async (targetUsers: UserRecord[], type: 'priority' | 'upcoming') => {
    const pendingUsers = targetUsers.filter(u => !isRemindedToday(u.lastReminderSentAt));
    if (pendingUsers.length === 0) {
      setAlertConfig({
        title: 'Batch Complete',
        message: 'All eligible subscribers in this group have already been reminded today. ✓',
        type: 'success'
      });
      return;
    }
    
    if (type === 'priority') setIsProcessingPriority(true);
    else setIsProcessingUpcoming(true);
    
    setLoadingMessage(`Initializing ${type} Automation Sequence...`);
    
    const channel = settings.autoReminderChannel || 'whatsapp';
    
    setAlertConfig({
      title: 'Automation Sequence',
      message: `Initiating ${pendingUsers.length} reminders via ${channel.toUpperCase()}. Your messaging app will open for each customer. Simply tap send and return to the app.`,
      type: 'info'
    });

    for (let i = 0; i < pendingUsers.length; i++) {
      const user = pendingUsers[i];
      const currentPrice = settings.planPrices[user.plan] || user.monthlyFee || 0;
      const discount = user.persistentDiscount || 0;
      const totalDue = (currentPrice - discount) + (user.balance || 0);
      
      const message = await generateProfessionalMessage(
        user.name,
        totalDue,
        new Date(user.expiryDate).toLocaleDateString(),
        'REMINDER',
        settings
      );

      onMarkReminded(user.id);
      
      setLoadingMessage(`Deploying Reminder ${i + 1}/${pendingUsers.length}: ${user.name}`);

      if (channel === 'sms') {
        window.open(`sms:${user.phone}?body=${encodeURIComponent(message)}`, '_blank');
      } else {
        await shareToWhatsApp(user.phone, message);
      }
      
      if (user.phone2 && user.phone2.trim()) {
        await new Promise(resolve => setTimeout(resolve, 1500));
        if (channel === 'sms') {
          window.open(`sms:${user.phone2}?body=${encodeURIComponent(message)}`, '_blank');
        } else {
          await shareToWhatsApp(user.phone2, message);
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    if (type === 'priority') setIsProcessingPriority(false);
    else setIsProcessingUpcoming(false);
    
    setLoadingMessage(null);
    
    setAlertConfig({
      title: 'Sequence Finished',
      message: 'Automation Cycle Completed. All pending reminders have been processed for today.',
      type: 'success'
    });
  };

  const UserCard: React.FC<{ user: UserRecord; isPriority?: boolean }> = ({ user, isPriority }) => {
    const days = getDaysUntilExpiry(user.expiryDate);
    const currentPrice = settings.planPrices[user.plan] || user.monthlyFee || 0;
    const discount = user.persistentDiscount || 0;
    const reminded = isRemindedToday(user.lastReminderSentAt);
    
    return (
      <div className={`bg-white dark:bg-slate-900 p-6 rounded-[2rem] border transition-all hover:shadow-xl group relative overflow-hidden ${isPriority ? 'border-orange-200 dark:border-orange-500/20 shadow-sm' : 'border-slate-100 dark:border-slate-800'}`}>
        {reminded && (
          <div className="absolute top-0 right-0 bg-emerald-500 text-white text-[8px] font-black uppercase tracking-widest px-4 py-1.5 rounded-bl-2xl z-10">
            ✓ Reminded Today
          </div>
        )}
        
        <div className="flex justify-between items-start mb-4">
          <div>
            <h4 className="font-black text-slate-800 dark:text-white text-lg leading-tight tracking-tight">{user.name}</h4>
            <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.2em] mt-1">{user.plan}</p>
          </div>
          <div className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${days === 3 ? 'bg-orange-100 text-orange-600 dark:bg-orange-500/10 dark:text-orange-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
            {days === 0 ? 'Today' : days < 0 ? 'Expired' : `${days} Days`}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-inner">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Due Amount</p>
            <p className="text-sm font-black text-slate-700 dark:text-slate-300">Rs. {((currentPrice - discount) + (user.balance || 0)).toLocaleString()}</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-950 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-inner">
            <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Username</p>
            <p className="text-[10px] font-black text-indigo-500 truncate">@{user.username || 'n/a'}</p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button 
              disabled={!!loadingId || isProcessingPriority || isProcessingUpcoming}
              onClick={() => handleSendMessage(user, 'sms')}
              className={`flex-1 ${reminded ? 'bg-slate-200 dark:bg-slate-800 text-slate-400' : 'bg-slate-900 dark:bg-indigo-600 text-white'} py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:opacity-90 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm`}
            >
              {loadingId === `${user.id}-sms` ? (
                <span className="animate-pulse">Loading...</span>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                  {reminded ? 'Resend' : 'SMS'}
                </>
              )}
            </button>
            <button 
              disabled={!!loadingId || isProcessingPriority || isProcessingUpcoming}
              onClick={() => handleSendMessage(user, 'whatsapp')}
              className={`flex-1 ${reminded ? 'bg-emerald-50 text-emerald-300 dark:bg-emerald-500/5 dark:text-emerald-900' : 'bg-green-600 text-white shadow-lg shadow-green-100 dark:shadow-none'} py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-green-700 active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-50`}
            >
              {loadingId === `${user.id}-whatsapp` ? (
                <span className="animate-pulse">Loading...</span>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.246 2.248 3.484 5.232 3.484 8.412-.003 6.557-5.338 11.892-11.893 11.892-1.997-.001-3.951-.5-5.688-1.448l-6.309 1.656zm6.224-3.62c1.566.933 3.46 1.441 5.519 1.442 5.457 0 9.894-4.437 9.897-9.895.002-2.646-1.03-5.132-2.903-7.005s-4.359-2.906-7.004-2.907c-5.456 0-9.892 4.437-9.894 9.895-.001 2.045.508 4.045 1.486 5.856l-.991 3.616 3.9-.996zm11.087-7.468c-.301-.15-1.784-.879-2.059-.98-.275-.1-.475-.15-.675.15s-.775.98-.95 1.18-.35.225-.65.075c-.301-.15-1.267-.467-2.414-1.491-.892-.796-1.493-1.778-1.668-2.079-.175-.301-.019-.463.131-.612.135-.133.301-.35.45-.525.15-.175.2-.3.3-.5s.05-.375-.025-.525c-.075-.15-.675-1.625-.925-2.225-.244-.588-.491-.508-.675-.517-.175-.008-.375-.01-.575-.01s-.525.075-.8.375c-.275.3-1.05 1.025-1.05 2.5s1.075 2.9 1.225 3.1c.15.2 2.116 3.231 5.126 4.532.715.311 1.273.497 1.707.635.719.227 1.373.195 1.89.118.577-.085 1.784-.73 2.034-1.435.25-.705.25-1.31.175-1.435-.075-.125-.275-.2-.575-.35z"/></svg>
                  {reminded ? 'Resend' : 'Direct'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-12 animate-in fade-in duration-700 pb-10">
      <section className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-orange-600 text-white rounded-2xl shadow-xl shadow-orange-500/20">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight uppercase">Priority Reminders</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">3 Days until service interruption</p>
            </div>
          </div>
          {priorityUsers.length > 0 && (
            <button 
              onClick={() => runAutomationCycle(priorityUsers, 'priority')}
              disabled={isProcessingPriority || isProcessingUpcoming}
              className={`px-8 py-4 ${isProcessingPriority ? 'bg-slate-400' : 'bg-orange-600'} text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-orange-500/20 active:scale-95 transition-all flex items-center gap-3`}
            >
              {isProcessingPriority ? (
                <span className="animate-pulse">Processing...</span>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                  Automated Blast ({priorityUsers.filter(u => !isRemindedToday(u.lastReminderSentAt)).length} New)
                </>
              )}
            </button>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {priorityUsers.map(u => <UserCard key={u.id} user={u} isPriority />)}
          {priorityUsers.length === 0 && (
            <div className="col-span-full py-16 bg-white dark:bg-slate-900 rounded-[3rem] border-2 border-dashed border-slate-100 dark:border-slate-800 flex flex-col items-center justify-center text-slate-300 dark:text-slate-700">
              <svg className="w-20 h-20 opacity-10 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
              <p className="font-black uppercase tracking-[0.3em] text-[10px]">All clear for priority today</p>
            </div>
          )}
        </div>
      </section>

      <section className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-2xl">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
            </div>
            <div>
              <h3 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight uppercase">Upcoming Expiries</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Next 7 days schedule</p>
            </div>
          </div>
          {upcomingUsers.length > 0 && (
            <button 
              onClick={() => runAutomationCycle(upcomingUsers, 'upcoming')}
              disabled={isProcessingPriority || isProcessingUpcoming}
              className={`px-8 py-4 ${isProcessingUpcoming ? 'bg-slate-400' : 'bg-indigo-600'} text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-500/20 active:scale-95 transition-all flex items-center gap-3`}
            >
              {isProcessingUpcoming ? (
                <span className="animate-pulse">Processing...</span>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                  Blast Upcoming ({upcomingUsers.filter(u => !isRemindedToday(u.lastReminderSentAt)).length} New)
                </>
              )}
            </button>
          )}
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {upcomingUsers.map(u => <UserCard key={u.id} user={u} />)}
          {upcomingUsers.length === 0 && (
            <div className="col-span-full py-10 text-center">
              <p className="text-slate-400 dark:text-slate-500 font-black text-[10px] uppercase tracking-widest italic">No other upcoming expiries found this week.</p>
            </div>
          )}
        </div>
      </section>

      {alertConfig && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setAlertConfig(null)}></div>
          <div className="relative z-10 w-full max-w-sm bg-white dark:bg-slate-900 rounded-[2.5rem] p-8 border border-slate-100 dark:border-white/5 shadow-2xl text-center">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 ${alertConfig.type === 'success' ? 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-500' : 'bg-indigo-100 dark:bg-indigo-500/10 text-indigo-500'}`}>
              {alertConfig.type === 'success' ? (
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"></path></svg>
              ) : (
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
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
    </div>
  );
};

export default Expiries;
