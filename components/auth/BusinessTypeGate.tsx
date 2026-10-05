import React, { useState } from 'react';
import type { BusinessType } from '../../types';
import type { BusinessTypeGateState } from '../../hooks/useBusinessTypeGate';
import BusinessTypePicker from './BusinessTypePicker';

/**
 * M5: full-screen gate for logged-in managers whose business type was never
 * chosen (incomplete signup / failed save). One tap confirms — no confirm
 * dialog. Shown instead of the whole app until a type is saved.
 */
export default function BusinessTypeGate({ gate }: { gate: BusinessTypeGateState }): React.JSX.Element {
  const [type, setType] = useState<BusinessType | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const confirm = async () => {
    if (!type || busy) return;
    setBusy(true);
    setError('');
    const r = await gate.choose(type);
    setBusy(false);
    if (!r.ok) setError(r.error || 'Could not save. Try again.');
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#f4f7fc] dark:bg-[#0b0f1a]">
      <div className="w-full max-w-md rounded-[2rem] bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-6 shadow-2xl">
        <h1 className="text-xl font-black text-[#0f172a] dark:text-white text-center mb-1">
          One more step: choose your business type
        </h1>
        <p className="text-xs text-[#64748b] dark:text-[#94a3b8] font-medium text-center mb-5">
          This can only be changed later by the admin.
        </p>
        {gate.error && (
          <div className="text-xs font-semibold px-3 py-2.5 rounded-2xl mb-4 bg-[rgba(239,68,68,0.12)] text-[#b91c1c] dark:text-[#f87171]">
            {gate.error}
          </div>
        )}
        <BusinessTypePicker
          value={type}
          onChange={setType}
          onContinue={confirm}
          continueLabel="Confirm & continue"
          busy={busy}
        />
        {error && (
          <div className="mt-4">
            <div className="text-xs font-semibold px-3 py-2.5 rounded-2xl mb-3 bg-[rgba(239,68,68,0.12)] text-[#b91c1c] dark:text-[#f87171]">
              {error}
            </div>
            <button type="button" onClick={confirm} disabled={busy}
              className="w-full min-h-[44px] rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-sm font-bold text-[#0f172a] dark:text-white disabled:opacity-50">
              {busy ? 'Saving…' : 'Retry'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
