import React from 'react';

/** M6a shell: placeholder for water-billing / water-reports until M6b fills them. */
export default function WaterPlaceholder({ title, text }: { title: string; text: string }): React.JSX.Element {
  return (
    <div className="px-4 py-4 md:px-6 max-w-3xl mx-auto">
      <div className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-10 text-center">
        <div className="mx-auto w-12 h-12 rounded-2xl flex items-center justify-center mb-3 bg-[rgba(59,130,246,0.12)] text-[#3b82f6]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6" aria-hidden="true">
            <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" />
          </svg>
        </div>
        <p className="text-lg font-black text-[#0f172a] dark:text-white mb-1">{title}</p>
        <p className="text-sm text-[#64748b] dark:text-[#94a3b8]">Coming in next update</p>
        <p className="text-xs text-[#94a3b8] mt-1">{text}</p>
      </div>
    </div>
  );
}
