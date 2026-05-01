import React, { useState, useEffect } from 'react';

interface HintData {
  title: string;
  description: string;
  steps: string[];
  icon: string;
  color: string;
}

const HINTS: Record<string, HintData> = {
  dashboard: {
    icon: '📊',
    color: 'from-blue-500 to-indigo-600',
    title: 'Dashboard — Aapka Control Center',
    description: 'Yahan aapke pure business ka overview ek nazar mein milta hai.',
    steps: [
      '👁️ Revenue/Balance cards pe "eye" icon dabao — amount reveal hoga',
      '📋 "View Details" se customer-wise breakdown dekho',
      '⏰ Expiring Soon section pe nazar rakhna — daily check karo',
      '🔔 Top mein bell icon se pending reminders dekho',
    ],
  },
  users: {
    icon: '👥',
    color: 'from-emerald-500 to-teal-600',
    title: 'Customers — ISP Client Management',
    description: 'Apne sare internet customers yahan manage karo.',
    steps: [
      '➕ "Add Customer" button se naya client add karo',
      '🔍 Search bar se kisi bhi customer ko turant dhundo',
      '✏️ Customer card pe click karo — edit, suspend, ya delete karo',
      '🧾 Customer ke naam pe click karo — receipt generate hogi',
      '🔴 Red badge wale customers ka balance outstanding hai',
    ],
  },
  receipts: {
    icon: '🧾',
    color: 'from-purple-500 to-violet-600',
    title: 'Receipts — Digital Bill Generator',
    description: 'Professional receipts banao aur directly share karo.',
    steps: [
      '📝 Customer select karo, amount likho, "Generate" dabao',
      '📱 Receipt banne ke baad WhatsApp share button aayega',
      '🖨️ Print button se paper receipt bhi nikal sakte ho',
      '📂 Purani saari receipts yahan history mein milti hain',
      '⚙️ Settings mein apna logo aur business name add karo',
    ],
  },
  recoveries: {
    icon: '💰',
    color: 'from-amber-500 to-orange-600',
    title: 'Recoveries — Monthly Payment Tracking',
    description: 'Is mahine kitna paisa aaya aur kitna baaki hai — poora hisaab.',
    steps: [
      '📅 Month selector se koi bhi mahina check karo',
      '✅ "Paid" list mein jo customers ne payment ki hai',
      '❌ "Unpaid" list mein jo baaki hain — remind karo',
      '📊 Summary card mein collection percentage dikhi hogi',
      '💡 Green = collected, Red = outstanding balance',
    ],
  },
  expiries: {
    icon: '⏰',
    color: 'from-rose-500 to-red-600',
    title: 'Expiries — Package Expiry Alerts',
    description: 'Kaun se customers ka internet khatam hone wala hai — time pe remind karo.',
    steps: [
      '🔴 "Today" tab — aaj expire hone wale customers',
      '🟡 "3 Days" tab — 3 din mein expire hone wale',
      '🟢 "This Month" tab — is mahine ke sare expiries',
      '📲 Customer card pe tap karo — WhatsApp pe reminder bhejo',
      '💡 Roz subah yeh section zaroor check karo!',
    ],
  },
  reports: {
    icon: '📈',
    color: 'from-cyan-500 to-blue-600',
    title: 'AI Insights — Business Analytics',
    description: 'Aapke business ke smart charts aur trends dekho.',
    steps: [
      '📊 Revenue chart — month-wise income ka graph',
      '👥 Customer growth — naye clients ka trend',
      '🥧 Plan distribution — kaun sa package popular hai',
      '🤖 AI analysis — business suggestions automatically milti hain',
      '📥 Export button se report PDF mein download karo',
    ],
  },
  settings: {
    icon: '⚙️',
    color: 'from-slate-500 to-slate-700',
    title: 'Settings — Apna ISP Customize Karo',
    description: 'Business naam, logo, plans, aur sab kuch yahan set karo.',
    steps: [
      '🏢 Business Name — apna ISP ka naam yahan dale',
      '🖼️ Logo upload karo — receipt pe print hoga',
      '💵 Plans & Prices — apne internet packages set karo',
      '🌙 Dark/Light mode — apni pasand ka theme choose karo',
      '🔑 Password change — security ke liye regularly update karo',
    ],
  },
};

interface FeatureHintProps {
  activeTab: string;
  managerName: string;
  theme: 'light' | 'dark';
}

const FeatureHint: React.FC<FeatureHintProps> = ({ activeTab, managerName, theme }) => {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const isDark = theme === 'dark';
  const hint = HINTS[activeTab];

  useEffect(() => {
    if (!hint || !managerName) return;

    // Check if this tab hint was already seen
    const key = `hint_seen_${managerName}_${activeTab}`;
    const alreadySeen = localStorage.getItem(key);

    if (!alreadySeen) {
      // Small delay so page content loads first
      const timer = setTimeout(() => {
        setVisible(true);
        setDismissed(false);
      }, 600);
      return () => clearTimeout(timer);
    }
  }, [activeTab, managerName]);

  const dismiss = () => {
    const key = `hint_seen_${managerName}_${activeTab}`;
    localStorage.setItem(key, 'true');
    setVisible(false);
    setDismissed(true);
  };

  if (!hint || !visible || dismissed) return null;

  return (
    <div
      className="fixed bottom-24 left-0 right-0 z-40 flex justify-center px-4"
      style={{ animation: 'slideUp 0.3s ease-out' }}
    >
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className={`w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden border ${
        isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
      }`}>
        {/* Colored header */}
        <div className={`bg-gradient-to-r ${hint.color} px-4 py-3 flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            <span className="text-xl">{hint.icon}</span>
            <span className="text-white font-black text-sm">{hint.title}</span>
          </div>
          <button
            onClick={dismiss}
            className="text-white/70 hover:text-white text-lg leading-none font-bold"
          >✕</button>
        </div>

        {/* Content */}
        <div className="px-4 pt-3 pb-2">
          <p className={`text-xs mb-3 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
            {hint.description}
          </p>

          <div className="space-y-1.5 mb-3">
            {hint.steps.map((step, i) => (
              <div key={i} className={`text-xs rounded-lg px-3 py-1.5 ${
                isDark ? 'bg-slate-700/60 text-slate-300' : 'bg-slate-50 text-slate-700'
              }`}>
                {step}
              </div>
            ))}
          </div>

          <button
            onClick={dismiss}
            className={`w-full py-2 rounded-xl text-xs font-bold bg-gradient-to-r ${hint.color} text-white mb-1`}
          >
            Samajh Gaya! ✓
          </button>
          <p className={`text-center text-xs ${isDark ? 'text-slate-600' : 'text-slate-400'}`}>
            Yeh hint dobara nahi dikhega
          </p>
        </div>
      </div>
    </div>
  );
};

export default FeatureHint;
