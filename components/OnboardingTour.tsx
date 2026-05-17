import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface TourStep {
  id: string;
  title: string;
  description: string;
  icon: string;
  color: string;
}

const TAB_TOUR_DATA: Record<string, TourStep> = {
  welcome: {
    id: 'welcome',
    icon: '👋',
    color: 'bg-indigo-600',
    title: 'Welcome to MYISP!',
    description: 'Assalam-o-Alaikum! MYISP mein khush amdeed. Yeh system aapke business ko simplify karne ke liye banaya gaya hai. (Welcome! This system is designed to simplify your ISP management business.)',
  },
  dashboard: {
    id: 'dashboard',
    icon: '📊',
    color: 'bg-blue-600',
    title: 'Dashboard — Your Control Center',
    description: 'Yahan aapke pure business ka overview ek nazar mein milta hai. Eye icon se amounts reveal karein aur alerts check karein. (View your entire business overview at a glance here. Use the eye icon to reveal amounts and check pending alerts.)',
  },
  users: {
    id: 'users',
    icon: '👥',
    color: 'bg-green-600',
    title: 'Customers — ISP Client Management',
    description: 'Apne sare internet customers yahan manage karo. Naye subscribers add karein aur search bar se kisi ko bhi turant dhunde. (Manage all your subscribers here. Add new clients and find anyone instantly using the search bar.)',
  },
  receipts: {
    id: 'receipts',
    icon: '🧾',
    color: 'bg-purple-600',
    title: 'Receipts — Digital Bill Generator',
    description: 'Professional receipts banao aur directly WhatsApp pe share karo. History se purani receipts bhi check kar sakte hain. (Create professional receipts and share them directly via WhatsApp. You can also view past receipts in history.)',
  },
  recoveries: {
    id: 'recoveries',
    icon: '💰',
    color: 'bg-orange-500',
    title: 'Recoveries — Monthly Payment Tracking',
    description: 'Is mahine kitna paisa aaya aur kitna baaki hai — poora hisaab yahan dekho. Paid aur Unpaid lists manage karein. (Track your monthly collections and pending payments here. Manage Paid and Unpaid lists effectively.)',
  },
  expiries: {
    id: 'expiries',
    icon: '⏰',
    color: 'bg-red-600',
    title: 'Expiries — Package Expiry Alerts',
    description: 'Kaun se customers ka internet khatam hone wala hai — unhe time pe remind karein. Roz subah yeh section zaroor check karein. (See whose internet is about to expire and send timely reminders. Always check this section every morning.)',
  },
  reports: {
    id: 'reports',
    icon: '🤖',
    color: 'bg-sky-500',
    title: 'AI Insights — Business Analytics',
    description: 'Aapke business ke smart charts aur trends dekho. AI aapko automatic business suggestions deta hai. (View smart charts and trends. Get automatic AI-powered business suggestions and growth insights.)',
  },
  settings: {
    id: 'settings',
    icon: '⚙️',
    color: 'bg-slate-700',
    title: 'Settings — Apna ISP Customize Karo',
    description: 'Business naam, logo, packages aur themes yahan set karein. Apna password bhi regularly update karte rahein. (Set your business name, logo, plans, and themes here. Keep your password updated for security.)',
  },
  finish: {
    id: 'finish',
    icon: '🚀',
    color: 'bg-indigo-600',
    title: 'All Set! (Taiyar Hain)',
    description: 'Aap ab MYISP use karne ke liye bilkul tayyar hain! Apna business automate karein aur grow karein. (You are now ready to use MYISP! Automate your business and watch it grow.)',
  }
};

interface OnboardingTourProps {
  onClose: () => void;
  activeTab: string;
  onSkipAll?: () => void;
}

const OnboardingTour: React.FC<OnboardingTourProps> = ({ onClose, activeTab, onSkipAll }) => {
  const current = TAB_TOUR_DATA[activeTab] || TAB_TOUR_DATA['welcome'];

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-6 bg-slate-950/40 backdrop-blur-md no-print">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="w-full max-w-md bg-white dark:bg-slate-900 rounded-[2.5rem] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
      >
        <div className="p-8">
          <div className="flex items-center justify-between mb-4">
            <button 
              onClick={onSkipAll}
              className="text-[10px] font-bold text-slate-400 hover:text-rose-500 uppercase tracking-widest transition-colors"
            >
              Skip All Tours
            </button>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
              ✕
            </button>
          </div>

          <div className="flex flex-col items-center text-center">
            <div className={`w-24 h-24 rounded-[2rem] ${current.color} flex items-center justify-center text-5xl mb-8 shadow-2xl shadow-indigo-500/20 animate-bounce`}>
              {current.icon}
            </div>
            <h3 className="text-2xl font-bold text-slate-900 dark:text-white mb-4 tracking-tight">
              {current.title}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-10 px-4">
              {current.description}
            </p>
          </div>

          <button 
            onClick={onClose}
            className={`w-full py-5 ${current.color} hover:brightness-110 text-white rounded-3xl font-bold text-xs uppercase tracking-widest shadow-xl transition-all active:scale-95`}
          >
            Samajh Gaya! ✓ (Got it)
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default OnboardingTour;
