import React from 'react';
import { Language, t } from '../utils/i18n';

// Inline SVG globe icon — per project rule, never use emoji/icon fonts/images for UI icons.
const GlobeIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3.6 9h16.8M3.6 15h16.8M12 3a15.3 15.3 0 010 18M12 3a15.3 15.3 0 000 18" />
  </svg>
);

interface LanguageToggleProps {
  language: Language;
  onChange: (language: Language) => void;
  variant?: 'pill' | 'menuItem';
  isDark?: boolean;
}

// A small EN / UR switch. Two visual variants:
//  - 'pill'     → compact rounded switch, used on the Login page (floating, dark bg)
//  - 'menuItem' → full-width row matching the profile dropdown's other menu buttons
const LanguageToggle: React.FC<LanguageToggleProps> = ({ language, onChange, variant = 'pill', isDark = false }) => {
  const next: Language = language === 'en' ? 'ur' : 'en';

  if (variant === 'menuItem') {
    return (
      <button
        onClick={() => onChange(next)}
        title={t('lang.switchTo', language)}
        className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-sm font-bold transition-colors text-left ${isDark ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-50'}`}
      >
        <span className="flex items-center gap-3">
          <span className="text-indigo-500"><GlobeIcon /></span>
          {t('header.language', language)}
        </span>
        <span className={`flex items-center rounded-full border overflow-hidden text-[10px] font-black tracking-wide ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
          <span className={`px-2 py-1 ${language === 'en' ? 'bg-indigo-600 text-white' : (isDark ? 'text-slate-400' : 'text-slate-500')}`}>EN</span>
          <span className={`px-2 py-1 ${language === 'ur' ? 'bg-indigo-600 text-white' : (isDark ? 'text-slate-400' : 'text-slate-500')}`}>UR</span>
        </span>
      </button>
    );
  }

  return (
    <button
      onClick={() => onChange(next)}
      title={t('lang.switchTo', language)}
      className="flex items-center gap-1.5 rounded-full border overflow-hidden text-[10px] font-black tracking-wide"
      style={{ borderColor: 'rgba(99,102,241,0.25)', background: 'rgba(255,255,255,0.04)' }}
    >
      <span className="pl-2.5 text-indigo-400"><GlobeIcon className="w-3.5 h-3.5" /></span>
      <span className={`px-2 py-1.5 transition-colors ${language === 'en' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>EN</span>
      <span className={`px-2 py-1.5 transition-colors ${language === 'ur' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>UR</span>
    </button>
  );
};

export default LanguageToggle;
