import React, { useState, useMemo } from 'react';
import { UserRecord, Receipt } from '../types';

interface GracePeriodAlertProps {
  users: UserRecord[];
  receipts: Receipt[];
  onActivateUser: (userId: string, month: string) => void; // opens receipt tab with pre-select
  companyId: string;
}

const GracePeriodAlert: React.FC<GracePeriodAlertProps> = ({
  users,
  receipts,
  onActivateUser,
  companyId,
}) => {
  const [dismissed, setDismissed] = useState(false);

  const { isGracePeriod, prevMonthLabel, pendingUsers } = useMemo(() => {
    const today = new Date();
    const day = today.getDate();
    const isGrace = day >= 1 && day <= 3;

    // Previous month calculation
    const prevDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const prevMonthName = prevDate.toLocaleString('en-US', { month: 'long' });
    const prevYear = prevDate.getFullYear();
    const label = `${prevMonthName} ${prevYear}`;

    // Find active/expired users who don't have a receipt for previous month
    const pending = users.filter(u => {
      if (u.status === 'deleted') return false;
      if (u.companyId && u.companyId !== companyId) return false;
      const hasReceipt = receipts.some(
        r => r.userId === u.id && r.period === label
      );
      return !hasReceipt;
    });

    return { isGracePeriod: isGrace, prevMonthLabel: label, pendingUsers: pending };
  }, [users, receipts, companyId]);

  if (!isGracePeriod || dismissed) return null;

  return (
    <div className="mx-4 mt-4 mb-0 rounded-3xl border-2 border-amber-300 dark:border-amber-500 bg-amber-50 dark:bg-amber-950/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 bg-amber-100 dark:bg-amber-900/40 border-b border-amber-200 dark:border-amber-700">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-amber-400 dark:bg-amber-500 flex items-center justify-center text-lg shadow">
            ⏳
          </div>
          <div>
            <p className="text-[11px] font-black text-amber-700 dark:text-amber-300 uppercase tracking-widest">
              Grace Period Active
            </p>
            <p className="text-sm font-black text-amber-900 dark:text-amber-100">
              {pendingUsers.length} customer{pendingUsers.length !== 1 ? 's' : ''} ka <span className="text-amber-600 dark:text-amber-400">{prevMonthLabel}</span> activation baqi hai
            </p>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="w-8 h-8 rounded-full bg-amber-200 dark:bg-amber-800 flex items-center justify-center text-amber-700 dark:text-amber-300 hover:bg-amber-300 dark:hover:bg-amber-700 transition-colors text-sm font-black"
        >
          ✕
        </button>
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        {pendingUsers.length === 0 ? (
          <div className="text-center py-4">
            <p className="text-2xl mb-1">🎉</p>
            <p className="text-sm font-black text-amber-700 dark:text-amber-300">
              {prevMonthLabel} ke sab customers activate ho chuke hain!
            </p>
          </div>
        ) : (
          <>
            <p className="text-[10px] font-black text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-3">
              Pending Customers — {prevMonthLabel}
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {pendingUsers.map(u => (
                <div
                  key={u.id}
                  className="flex items-center justify-between bg-white dark:bg-slate-900 rounded-2xl px-4 py-3 border border-amber-100 dark:border-amber-800/50"
                >
                  <div>
                    <p className="text-sm font-black text-slate-900 dark:text-slate-100">{u.name}</p>
                    <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                      @{u.username} · {u.plan} · Rs. {(u.monthlyFee || 0).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => onActivateUser(u.id, prevMonthLabel)}
                    className="px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-500 dark:bg-amber-500 dark:hover:bg-amber-400 text-white dark:text-slate-900 text-[11px] font-black uppercase tracking-wide transition-colors shadow-sm"
                  >
                    Activate
                  </button>
                </div>
              ))}
            </div>

            {/* Info note */}
            <p className="mt-3 text-[10px] font-bold text-amber-600 dark:text-amber-500 text-center">
              💡 Activate button Receipt Generator mein le jayega — {prevMonthLabel} pre-selected hoga
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default GracePeriodAlert;
