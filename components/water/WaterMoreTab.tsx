import React, { useState } from 'react';
import type { WaterCustomer } from './waterTypes';
import RoutesPanel from './RoutesPanel';
import VehiclesPanel from './VehiclesPanel';

interface Props {
  managerId: string;
  customers: WaterCustomer[];
  /** Navigate to another top-level tab (expenses, reports, analytics, team, settings). */
  onNavigateTab: (tab: string) => void;
}

type SubView = null | 'routes' | 'vehicles';

interface Item {
  label: string;
  sub: string;
  icon: React.ReactNode;
  go: () => void;
  badge?: string;
}

/**
 * R1 redesign: More tab — everything that isn't daily work lives here.
 * Money and team/settings navigate to their tabs; routes/vehicles open inline.
 */
export default function WaterMoreTab({ managerId, customers, onNavigateTab }: Props): React.JSX.Element {
  const [sub, setSub] = useState<SubView>(null);
  const liveCustomers = customers.filter(c => c.status !== 'deleted');

  const ic = (d: React.ReactNode) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5" aria-hidden="true">{d}</svg>
  );

  const sections: { title: string; items: Item[] }[] = [
    {
      title: 'Money',
      items: [
        { label: 'Expenses', sub: 'Track business spending', icon: ic(<path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />), go: () => onNavigateTab('expenses') },
        { label: 'Reports', sub: 'Period summaries and CSV', icon: ic(<path d="M3 3v18h18M8 17V9m5 8V5m5 12v-6" />), go: () => onNavigateTab('water-reports') },
        { label: 'Analytics', sub: 'Trends, debtors, performance', icon: ic(<path d="M3 17l6-6 4 4 8-8M15 7h6v6" />), go: () => onNavigateTab('water-analytics') },
      ],
    },
    {
      title: 'Setup',
      items: [
        { label: 'Routes', sub: 'Delivery routes and order', icon: ic(<path d="M9 20l-5.5-2.5v-13L9 7l6-2.5L20.5 7v13L15 17.5 9 20zM9 7v13M15 4.5v13" />), go: () => setSub('routes') },
        { label: 'Vehicles', sub: 'Bikes, loaders and vans', icon: ic(<path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11m-14 0h14a2 2 0 0 1 2 2v4h-2.5m-13.5 0H3v-4a2 2 0 0 1 2-2zm2.5 6a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm11 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />), go: () => setSub('vehicles') },
      ],
    },
    {
      title: 'Team',
      items: [
        { label: 'Riders', sub: 'Delivery team management', icon: ic(<><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" /></>), go: () => onNavigateTab('team') },
        { label: 'Settings', sub: 'Business profile and app', icon: ic(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>), go: () => onNavigateTab('settings') },
      ],
    },
  ];

  if (sub) {
    return (
      <div className="px-4 py-4 md:px-6 max-w-6xl mx-auto">
        <button type="button" onClick={() => setSub(null)}
          className="min-h-[44px] px-4 rounded-2xl bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 text-sm font-bold text-[#0f172a] dark:text-white flex items-center gap-2 mb-4">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7" /></svg>
          Back
        </button>
        {sub === 'routes' && <RoutesPanel managerId={managerId} customers={liveCustomers} />}
        {sub === 'vehicles' && <VehiclesPanel managerId={managerId} />}
      </div>
    );
  }

  return (
    <div className="px-4 py-4 md:px-6 max-w-6xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-black text-[#0f172a] dark:text-white">More</h1>
        <p className="text-sm text-[#64748b] dark:text-[#94a3b8]">Money, setup, team and settings</p>
      </div>
      {sections.map(sec => (
        <div key={sec.title} className="mb-5">
          <p className="text-[11px] font-black uppercase tracking-[0.15em] text-[#64748b] dark:text-[#94a3b8] mb-2">{sec.title}</p>
          <div className="rounded-[1.6rem] bg-white dark:bg-[#0f172a] border border-[#e2e8f0] dark:border-white/10 shadow-sm overflow-hidden">
            {sec.items.map((it, i) => (
              <button key={it.label} type="button" onClick={it.go}
                className={`w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-[#f8fafc] dark:active:bg-white/5 transition-colors ${i > 0 ? 'border-t border-[#f1f5f9] dark:border-white/5' : ''}`}>
                <span className="w-10 h-10 rounded-2xl bg-[#f1f5f9] dark:bg-white/5 text-[#1d4ed8] dark:text-[#93c5fd] flex items-center justify-center shrink-0">
                  {it.icon}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-bold text-[#0f172a] dark:text-white">{it.label}</span>
                  <span className="block text-xs text-[#94a3b8] font-medium">{it.sub}</span>
                </span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-[#cbd5e1] dark:text-[#475569] shrink-0" aria-hidden="true"><path d="m9 18 6-6-6-6" /></svg>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
