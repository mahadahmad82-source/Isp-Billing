import React, { useState, useEffect } from 'react';

interface TourStep {
  title: string;
  description: string;
  icon: string;
  tab?: string;
  tip: string;
}

interface OnboardingTourProps {
  managerName: string;
  onComplete: () => void;
  onNavigate: (tab: string) => void;
  theme: 'light' | 'dark';
}

const TOUR_STEPS: TourStep[] = [
  {
    title: 'MYISP mein Khush Amdeed! 🎉',
    description: 'Yeh aapka ISP management panel hai. Hum aapko 2 minute mein sab kuch dikhayenge!',
    icon: '🚀',
    tip: 'Yeh tour sirf ek baar dikhega. Aap kabhi bhi Settings se dobara dekh sakte hain.',
  },
  {
    title: 'Dashboard 📊',
    description: 'Yahan aapka poora business ek nazar mein dikhta hai — total customers, monthly revenue, pending balance, aur expiring accounts.',
    icon: '📊',
    tab: 'dashboard',
    tip: '💡 Tip: Dashboard pe "Total Balance" card dabao — aapko har customer ka outstanding balance milega!',
  },
  {
    title: 'Customers 👥',
    description: 'Apne ISP clients yahan add karo. Naam, phone, plan, monthly fee, aur expiry date — sab kuch ek jagah.',
    icon: '👥',
    tab: 'users',
    tip: '💡 Tip: Customer add karne ke baad uske naam pe click karo — receipt generate ho jayegi!',
  },
  {
    title: 'Receipt Generator 🧾',
    description: 'Professional digital receipts banao aur WhatsApp pe share karo. Customer ko payment proof milega, aapko record.',
    icon: '🧾',
    tab: 'receipts',
    tip: '💡 Tip: Settings mein apna business naam aur logo add karo — receipt pe print hoga!',
  },
  {
    title: 'Expiries ⏰',
    description: 'Kaun se customers ka package khatam hone wala hai? Yeh section 3, 7, aur 30 din mein expire hone wale sab dikhata hai.',
    icon: '⏰',
    tab: 'expiries',
    tip: '💡 Tip: Roz subah Expiries check karo — time pe remind karo, payment pehle milegi!',
  },
  {
    title: 'Recovery Summary 💰',
    description: 'Is mahine kitna paisa aaya, kitna baaki hai — monthly recovery tracking yahan hoti hai.',
    icon: '💰',
    tab: 'recovery',
    tip: '💡 Tip: Month end pe Recovery Summary check karo — business performance clear hogi!',
  },
  {
    title: 'Insights 📈',
    description: 'Aapke business ke charts aur graphs — revenue trends, customer growth, aur plan distribution.',
    icon: '📈',
    tab: 'insights',
    tip: '💡 Tip: Insights se pata chalega kaun sa plan sabse zyada popular hai!',
  },
  {
    title: 'Settings ⚙️',
    description: 'Business naam, logo, plan prices, aur receipt design yahan customize karo. Apna ISP brand banao!',
    icon: '⚙️',
    tab: 'settings',
    tip: '💡 Tip: Pehle Settings mein jaake apna business naam aur plan prices set karo!',
  },
  {
    title: 'Sab Ready Hai! ✅',
    description: 'Ab aap MYISP ke expert hain! Shuru karein — pehla customer add karo aur pehli receipt banao!',
    icon: '🎊',
    tab: 'users',
    tip: '🌟 Best of luck aapke ISP business ke liye!',
  },
];

const OnboardingTour: React.FC<OnboardingTourProps> = ({ managerName, onComplete, onNavigate, theme }) => {
  const [step, setStep] = useState(0);
  const [animating, setAnimating] = useState(false);

  const isDark = theme === 'dark';
  const current = TOUR_STEPS[step];
  const isLast = step === TOUR_STEPS.length - 1;
  const isFirst = step === 0;

  const goNext = () => {
    if (animating) return;
    setAnimating(true);
    setTimeout(() => {
      const nextStep = step + 1;
      if (nextStep < TOUR_STEPS.length) {
        setStep(nextStep);
        if (TOUR_STEPS[nextStep].tab) onNavigate(TOUR_STEPS[nextStep].tab!);
      }
      setAnimating(false);
    }, 200);
  };

  const goPrev = () => {
    if (animating || isFirst) return;
    setAnimating(true);
    setTimeout(() => {
      const prevStep = step - 1;
      setStep(prevStep);
      if (TOUR_STEPS[prevStep].tab) onNavigate(TOUR_STEPS[prevStep].tab!);
      setAnimating(false);
    }, 200);
  };

  const handleComplete = () => {
    onNavigate('users');
    onComplete();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>

      <div className={`w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 ${isDark ? 'bg-slate-800' : 'bg-white'}`}
        style={{ opacity: animating ? 0 : 1, transform: animating ? 'scale(0.97)' : 'scale(1)', transition: 'opacity 0.2s, transform 0.2s' }}>

        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 p-5 text-white">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold uppercase tracking-widest opacity-80">
              Getting Started Guide
            </span>
            <button onClick={onComplete}
              className="text-white opacity-60 hover:opacity-100 text-xl leading-none">✕</button>
          </div>
          <div className="text-4xl mb-2">{current.icon}</div>
          <h2 className="text-xl font-black">{current.title}</h2>
          {step === 0 && (
            <p className="text-sm opacity-80 mt-1">Assalam o Alaikum, <strong>{managerName}</strong>!</p>
          )}
        </div>

        {/* Content */}
        <div className="p-5">
          <p className={`text-sm leading-relaxed mb-4 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
            {current.description}
          </p>

          {/* Tip box */}
          <div className={`rounded-xl p-3 text-sm mb-5 ${isDark ? 'bg-indigo-900/40 text-indigo-300' : 'bg-indigo-50 text-indigo-700'}`}>
            {current.tip}
          </div>

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-1.5 mb-5">
            {TOUR_STEPS.map((_, i) => (
              <div key={i} onClick={() => { setStep(i); if (TOUR_STEPS[i].tab) onNavigate(TOUR_STEPS[i].tab!); }}
                className="rounded-full cursor-pointer transition-all duration-300"
                style={{
                  width: i === step ? 20 : 8,
                  height: 8,
                  background: i === step ? '#6366f1' : i < step ? '#a5b4fc' : (isDark ? '#334155' : '#e2e8f0')
                }} />
            ))}
          </div>

          {/* Step counter */}
          <p className={`text-center text-xs mb-4 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
            Step {step + 1} of {TOUR_STEPS.length}
          </p>

          {/* Buttons */}
          <div className="flex gap-3">
            {!isFirst && (
              <button onClick={goPrev}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all ${isDark ? 'border-slate-600 text-slate-300 hover:bg-slate-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                ← Pichla
              </button>
            )}
            {isLast ? (
              <button onClick={handleComplete}
                className="flex-1 py-2.5 rounded-xl text-sm font-black text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90 transition-all">
                Shuru Karein! 🚀
              </button>
            ) : (
              <button onClick={goNext}
                className="flex-1 py-2.5 rounded-xl text-sm font-black text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90 transition-all">
                Agla →
              </button>
            )}
          </div>

          {/* Skip */}
          {!isLast && (
            <button onClick={onComplete}
              className={`w-full mt-3 text-xs text-center ${isDark ? 'text-slate-600 hover:text-slate-400' : 'text-slate-400 hover:text-slate-600'}`}>
              Skip tour
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default OnboardingTour;
