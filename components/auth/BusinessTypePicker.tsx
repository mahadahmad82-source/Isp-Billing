import React from 'react';
import type { BusinessType } from '../../types';

interface BusinessTypePickerProps {
  value: BusinessType | null;
  onChange: (t: BusinessType) => void;
  onContinue: () => void;
  onBack?: () => void;
  continueLabel?: string;
  /** Disables the continue button while a save is in flight (double-submit protection). */
  busy?: boolean;
}

// ── Inline SVG icons only (no emoji, no icon fonts, no images) ──
const WifiIcon = () => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M5 13a10 10 0 0 1 14 0" /><path d="M8.5 16.5a5 5 0 0 1 7 0" /><path d="M2 8.82a15 15 0 0 1 20 0" /><line x1="12" y1="20" x2="12.01" y2="20" />
  </svg>
);
const DropIcon = () => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2.7 6.7 8.6a7 7 0 1 0 10.6 0Z" />
  </svg>
);
const CheckIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

const OPTIONS: { type: BusinessType; title: string; desc: string; icon: React.ReactNode; accent: 'isp' | 'water' }[] = [
  {
    type: 'isp',
    title: 'ISP / Internet Provider',
    desc: 'Broadband & cable internet: packages, expiry, recharge, outages, equipment.',
    icon: <WifiIcon />,
    accent: 'isp',
  },
  {
    type: 'water',
    title: 'Water / RO Supplier',
    desc: '19L bottle & water delivery: routes, riders, deliveries, bottle balance, ledger.',
    icon: <DropIcon />,
    accent: 'water',
  },
];

/**
 * Two big selectable business-type cards (radio behaviour). Used by the signup
 * flow (Login.tsx) and the post-signup gate (BusinessTypeGate.tsx).
 */
export default function BusinessTypePicker({ value, onChange, onContinue, onBack, continueLabel, busy }: BusinessTypePickerProps): React.JSX.Element {
  const canContinue = !!value && !busy;
  return (
    <div>
      {onBack && (
        <button type="button" onClick={onBack}
          className="mb-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 hover:text-indigo-400 transition-colors min-h-[44px]">
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
          Back
        </button>
      )}
      <div className="grid grid-cols-1 gap-3" role="radiogroup" aria-label="Business type">
        {OPTIONS.map(opt => {
          const selected = value === opt.type;
          const isIsp = opt.accent === 'isp';
          return (
            <button key={opt.type} type="button" role="radio" aria-checked={selected}
              onClick={() => onChange(opt.type)}
              className={`relative w-full text-left p-5 rounded-2xl border-2 transition-all min-h-[88px] flex items-center gap-4 active:scale-[0.99] ${selected
                ? isIsp
                  ? 'border-[#3b82f6] bg-[#dbeafe] dark:bg-[rgba(59,130,246,0.15)]'
                  : 'border-[#14b8a6] bg-[#ccfbf1] dark:bg-[rgba(45,212,191,0.12)]'
                : 'border-[#e2e8f0] dark:border-white/10 bg-white dark:bg-[#0f172a] hover:border-[#a5b4fc] dark:hover:border-white/25'}`}>
              <span className={`flex-shrink-0 ${selected ? (isIsp ? 'text-[#1d4ed8] dark:text-[#93c5fd]' : 'text-[#0f766e] dark:text-[#5eead4]') : 'text-[#94a3b8]'}`}>
                {opt.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-black text-[#0f172a] dark:text-white">{opt.title}</span>
                <span className="block text-[11px] text-[#64748b] dark:text-[#94a3b8] font-medium mt-0.5">{opt.desc}</span>
              </span>
              {selected && (
                <span className={`absolute top-3 right-3 w-6 h-6 rounded-full flex items-center justify-center text-white ${isIsp ? 'bg-[#3b82f6]' : 'bg-[#14b8a6]'}`}>
                  <CheckIcon />
                </span>
              )}
            </button>
          );
        })}
      </div>
      <button type="button" onClick={onContinue} disabled={!canContinue}
        className="w-full mt-4 py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.25em] text-white transition-all active:scale-95 hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0 min-h-[52px]"
        style={{ background: 'linear-gradient(135deg, #4f46e5, #7c3aed, #06b6d4)', boxShadow: '0 8px 32px rgba(99,102,241,0.4)' }}>
        {busy ? 'Saving…' : (continueLabel || 'Continue')}
      </button>
    </div>
  );
}
