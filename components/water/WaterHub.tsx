import React, { useState } from 'react';
import type { WaterCustomer } from './waterTypes';
import VehiclesPanel from './VehiclesPanel';
import RoutesPanel from './RoutesPanel';

type SubTab = 'routes' | 'vehicles' | 'today';

interface Props {
  managerId: string;
  customers: WaterCustomer[];
}

export default function WaterHub({ managerId, customers }: Props): JSX.Element {
  const [sub, setSub] = useState<SubTab>('routes');
  const liveCustomers = customers.filter(c => c.status !== 'deleted');

  const chip = (key: SubTab, label: string) => {
    const active = sub === key;
    return (
      <button
        key={key}
        type="button"
        aria-pressed={active}
        onClick={() => setSub(key)}
        className={`min-h-[48px] px-5 rounded-full text-base font-bold border whitespace-nowrap transition-colors ${active
          ? 'bg-[#0f172a] text-white border-[#0f172a] dark:bg-[#e2e8f0] dark:text-[#0f172a] dark:border-[#e2e8f0]'
          : 'bg-white text-[#475569] border-[#e2e8f0] dark:bg-[#0f172a] dark:text-[#94a3b8] dark:border-white/10'}`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="px-4 py-4 md:px-6 max-w-3xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-black text-[#0f172a] dark:text-white">Water</h1>
        <p className="text-sm text-[#64748b] dark:text-[#94a3b8]">Daily delivery, bottles and cash</p>
      </div>
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0" role="tablist" aria-label="Water sections">
        {chip('today', 'Today')}
        {chip('routes', 'Routes')}
        {chip('vehicles', 'Vehicles')}
      </div>
      {sub === 'routes' && <RoutesPanel managerId={managerId} customers={liveCustomers} />}
      {sub === 'vehicles' && <VehiclesPanel managerId={managerId} />}
      {sub === 'today' && (
        <div className="rounded-3xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 p-8 text-center">
          <p className="text-lg font-black text-[#0f172a] dark:text-white mb-1">Today</p>
          <p className="text-sm text-[#64748b] dark:text-[#94a3b8]">Coming next</p>
        </div>
      )}
    </div>
  );
}
