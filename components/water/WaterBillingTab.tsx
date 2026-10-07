import React, { useState } from 'react';
import type { AppSettings } from '../../types';
import type { WaterCustomer } from './waterTypes';
import ReceiptsPanel from './ReceiptsPanel';
import BillsPanel from './BillsPanel';

interface Props {
  managerId: string;
  customers: WaterCustomer[];
  settings: AppSettings;
}

/** M6b: tab 'water-billing' — Receipts (daily) | Bills (monthly) toggle. */
export default function WaterBillingTab({ managerId, customers, settings }: Props): React.JSX.Element {
  const [tab, setTab] = useState<'receipts' | 'bills'>('receipts');

  return (
    <div className="px-4 py-4 md:px-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-black text-[#0f172a] dark:text-white">Billing</h1>
        <div className="flex rounded-2xl overflow-hidden border border-[#e2e8f0] dark:border-white/10" role="tablist" aria-label="Billing views">
          {(['receipts', 'bills'] as const).map(t => (
            <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
              className={`min-h-[44px] px-5 text-sm font-bold capitalize ${tab === t ? 'bg-[#1d4ed8] text-white' : 'text-[#475569] dark:text-[#94a3b8]'}`}>
              {t}
            </button>
          ))}
        </div>
      </div>
      {tab === 'receipts' ? (
        <ReceiptsPanel managerId={managerId} customers={customers} businessName={settings.businessName} businessPhone={settings.businessPhone} />
      ) : (
        <BillsPanel managerId={managerId} customers={customers} settings={settings} />
      )}
    </div>
  );
}
