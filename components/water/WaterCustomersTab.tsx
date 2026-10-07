import React, { useState, useEffect } from 'react';
import type { UserRecord } from '../../types';
import type { WaterCustomer, WaterCustomerNavRequest } from './waterTypes';
import CustomersPanel from './CustomersPanel';
import LedgerPanel from './LedgerPanel';

type View = 'directory' | 'dues';

interface Props {
  managerId: string;
  customers: WaterCustomer[];
  businessName?: string;
  onAddUser: (u: UserRecord) => void;
  onBulkAddUsers: (u: UserRecord[]) => void;
  onUpdateUser: (id: string, update: Partial<UserRecord>) => void;
  /** R1: one-shot navigation request (dashboard quick actions / top dues). */
  navRequest?: WaterCustomerNavRequest | null;
  onNavRequestConsumed?: () => void;
}

/**
 * R1 redesign: Customers tab — Directory (add/edit customers) and Dues
 * (ledger + record payment) in one place. Replaces the old duplicate Ledger tab.
 */
export default function WaterCustomersTab({
  managerId, customers, businessName,
  onAddUser, onBulkAddUsers, onUpdateUser,
  navRequest, onNavRequestConsumed,
}: Props): React.JSX.Element {
  const [view, setView] = useState<View>('dues');
  const [focusCustomerId, setFocusCustomerId] = useState<string | null>(null);
  const [requestPay, setRequestPay] = useState(false);
  const [requestAddCustomer, setRequestAddCustomer] = useState(false);
  const liveCustomers = customers.filter(c => c.status !== 'deleted');

  useEffect(() => {
    if (!navRequest) return;
    if (navRequest.view) setView(navRequest.view);
    else if (navRequest.customerId || navRequest.action === 'record-payment') setView('dues');
    else if (navRequest.action === 'add-customer') setView('directory');
    setFocusCustomerId(navRequest.customerId || null);
    setRequestPay(navRequest.action === 'record-payment');
    setRequestAddCustomer(navRequest.action === 'add-customer');
    onNavRequestConsumed?.();
  }, [navRequest, onNavRequestConsumed]);

  return (
    <div className="px-4 py-4 md:px-6 max-w-6xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-black text-[#0f172a] dark:text-white">Customers</h1>
        <p className="text-sm text-[#64748b] dark:text-[#94a3b8]">Directory and dues collection</p>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-4 p-1 rounded-2xl bg-[#f1f5f9] dark:bg-white/5">
        {(['dues', 'directory'] as const).map(v => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}
            className={`min-h-[48px] rounded-xl text-base font-bold transition-colors ${view === v
              ? 'bg-white dark:bg-[#0f172a] text-[#0f172a] dark:text-white shadow'
              : 'text-[#64748b] dark:text-[#94a3b8]'}`}>
            {v === 'dues' ? 'Dues' : 'Directory'}
          </button>
        ))}
      </div>

      {view === 'directory' ? (
        <CustomersPanel
          managerId={managerId}
          customers={liveCustomers}
          onAddUser={onAddUser}
          onBulkAddUsers={onBulkAddUsers}
          onUpdateUser={onUpdateUser}
          requestAdd={requestAddCustomer}
          onRequestAddConsumed={() => setRequestAddCustomer(false)}
        />
      ) : (
        <LedgerPanel
          managerId={managerId}
          customers={liveCustomers}
          businessName={businessName}
          focusCustomerId={focusCustomerId}
          onFocusConsumed={() => setFocusCustomerId(null)}
          requestPay={requestPay}
          onRequestPayConsumed={() => setRequestPay(false)}
        />
      )}
    </div>
  );
}
