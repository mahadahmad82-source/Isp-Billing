
import React from 'react';
import { AppNotification } from '../types';

interface NotificationCenterProps {
  notifications: AppNotification[];
  isOpen: boolean;
  onClose: () => void;
  onAction: (tab: string, userId?: string) => void;
  onDismiss: (id: string) => void;
  onClearAll: () => void;
  theme: 'light' | 'dark';
}

const NotificationCenter: React.FC<NotificationCenterProps> = ({ 
  notifications, 
  isOpen, 
  onClose, 
  onAction, 
  onDismiss,
  onClearAll,
  theme 
}) => {
  if (!isOpen) return null;

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'HIGH': return 'bg-rose-500';
      case 'MEDIUM': return 'bg-orange-500';
      default: return 'bg-indigo-500';
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'EXPIRY': return <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>;
      case 'OVERDUE': return <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>;
      case 'RECOVERY': return <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18"></path></svg>;
      default: return <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path></svg>;
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-end p-4 pointer-events-none">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm pointer-events-auto" onClick={onClose}></div>
      <div className={`relative w-full max-w-sm flex flex-col max-h-[85vh] shadow-2xl rounded-[2.5rem] border pointer-events-auto animate-in slide-in-from-right duration-300 overflow-hidden ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
        <div className="p-8 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-950/20">
          <div>
            <h4 className={`text-xl font-black uppercase tracking-tight ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>Alert Center</h4>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Recent System Notifications</p>
          </div>
          <div className="flex items-center gap-2">
            {notifications.length > 0 && (
              <button 
                onClick={onClearAll}
                className="text-[10px] font-black text-rose-500 uppercase tracking-widest hover:bg-rose-500/10 px-3 py-2 rounded-xl transition-all"
              >
                Clear All
              </button>
            )}
            <button onClick={onClose} className="p-4 bg-white dark:bg-slate-800 rounded-2xl hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-colors font-bold shadow-sm">✕</button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
          {notifications.length === 0 ? (
            <div className="py-24 text-center space-y-4 opacity-10">
              <svg className="w-24 h-24 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0a2 2 0 012 2v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4a2 2 0 012-2m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"></path></svg>
              <p className="font-black text-[10px] uppercase tracking-[0.4em]">Zero Active Alerts</p>
            </div>
          ) : (
            notifications.map((notif) => (
              <div 
                key={notif.id} 
                className={`p-6 rounded-[2rem] border transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer ${theme === 'dark' ? 'bg-slate-950 border-white/5 hover:border-white/10' : 'bg-slate-50 border-transparent hover:border-slate-200'}`}
                onClick={() => {
                  if (notif.actionTab) onAction(notif.actionTab, notif.userId);
                  onClose();
                }}
              >
                <div className="flex gap-5">
                  <div className={`w-14 h-14 shrink-0 rounded-[1.25rem] flex items-center justify-center text-slate-400 relative ${theme === 'dark' ? 'bg-slate-900 shadow-inner' : 'bg-white shadow-sm'}`}>
                    {getIcon(notif.type)}
                    <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 ${getPriorityColor(notif.priority)}`}></span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-2">
                      <h5 className={`font-black text-sm truncate pr-2 ${theme === 'dark' ? 'text-white' : 'text-slate-900 uppercase tracking-tight'}`}>{notif.title}</h5>
                      <div className="flex items-center gap-3">
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">
                          {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            onDismiss(notif.id);
                          }}
                          className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
                          title="Dismiss"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 font-bold leading-relaxed mb-4">{notif.message}</p>
                    {notif.actionLabel && (
                      <span className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest">
                        {notif.actionLabel}
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7"></path></svg>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {notifications.length > 0 && (
          <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">
              Processing {notifications.length} high priority events
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationCenter;
