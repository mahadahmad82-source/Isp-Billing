import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import type { WaterCustomer, WaterNavRequest } from './waterTypes';
import TodayPanel from './TodayPanel';
import OrdersPanel from './OrdersPanel';
import InboxPanel from './InboxPanel';

// R1 redesign: Deliveries tab — Today, Orders, Inbox only.
// Customers/Ledger -> Customers tab; Routes/Vehicles -> More tab.
type SubTab = 'today' | 'orders' | 'inbox';

interface Props {
  managerId: string;
  customers: WaterCustomer[];
  /** M6a: navigation request from WaterDashboard quick actions / top dues. Consumed once. */
  navRequest?: WaterNavRequest | null;
  onNavRequestConsumed?: () => void;
}

export default function WaterHub({ managerId, customers, navRequest, onNavRequestConsumed }: Props): React.JSX.Element {
  const [sub, setSub] = useState<SubTab>('today');
  const [inboxTick, setInboxTick] = useState(0);
  const [unhandled, setUnhandled] = useState(0);
  const [requestNewPlan, setRequestNewPlan] = useState(false);
  const [requestAddOrder, setRequestAddOrder] = useState(false);
  const liveCustomers = customers.filter(c => c.status !== 'deleted');

  // M6a: consume one-shot navigation requests (dashboard quick actions).
  // R1: only today/orders/inbox subs remain; other requests are ignored safely.
  useEffect(() => {
    if (!navRequest) return;
    if (navRequest.sub === 'today' || navRequest.sub === 'orders' || navRequest.sub === 'inbox') {
      setSub(navRequest.sub);
    }
    setRequestNewPlan(navRequest.action === 'new-plan');
    setRequestAddOrder(navRequest.action === 'add-order');
    onNavRequestConsumed?.();
  }, [navRequest, onNavRequestConsumed]);

  const loadUnhandled = useCallback(async () => {
    try {
      const { count, error } = await supabase
        .from('water_inbox')
        .select('id', { count: 'exact', head: true })
        .eq('manager_id', managerId)
        .eq('handled', false);
      if (!error) setUnhandled(count || 0);
    } catch {
      /* badge stays as-is; harmless */
    }
  }, [managerId]);

  useEffect(() => { loadUnhandled(); }, [loadUnhandled, inboxTick, sub]);

  const chip = (key: SubTab, label: string, badge?: number) => {
    const active = sub === key;
    return (
      <button
        key={key}
        type="button"
        aria-pressed={active}
        onClick={() => setSub(key)}
        className={`min-h-[48px] px-5 rounded-full text-base font-bold border whitespace-nowrap transition-colors flex items-center gap-2 ${active
          ? 'bg-[#0f172a] text-white border-[#0f172a] dark:bg-[#e2e8f0] dark:text-[#0f172a] dark:border-[#e2e8f0]'
          : 'bg-white text-[#475569] border-[#e2e8f0] dark:bg-[#0f172a] dark:text-[#94a3b8] dark:border-white/10'}`}
      >
        {label}
        {badge != null && badge > 0 && (
          <span className={`text-xs font-black px-2 py-0.5 rounded-full ${active
            ? 'bg-white/20 text-white dark:bg-[#0f172a]/10 dark:text-[#0f172a]'
            : 'bg-[#dc2626] text-white'}`}>
            {badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="px-4 py-4 md:px-6 max-w-6xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-black text-[#0f172a] dark:text-white">Deliveries</h1>
        <p className="text-sm text-[#64748b] dark:text-[#94a3b8]">Today's plans, orders and inbox</p>
      </div>
      <div className="flex gap-2 mb-4 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0" role="tablist" aria-label="Delivery sections">
        {chip('today', 'Today')}
        {chip('orders', 'Orders')}
        {chip('inbox', 'Inbox', unhandled)}
      </div>
      {sub === 'today' && (
        <TodayPanel
          managerId={managerId}
          requestAdd={requestNewPlan}
          onRequestAddConsumed={() => setRequestNewPlan(false)}
        />
      )}
      {sub === 'orders' && (
        <OrdersPanel
          managerId={managerId}
          customers={liveCustomers}
          requestAdd={requestAddOrder}
          onRequestAddConsumed={() => setRequestAddOrder(false)}
        />
      )}
      {sub === 'inbox' && (
        <InboxPanel managerId={managerId} customers={liveCustomers} onUpdate={() => setInboxTick(t => t + 1)} />
      )}
    </div>
  );
}
