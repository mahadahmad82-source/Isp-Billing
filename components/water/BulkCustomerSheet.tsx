import React, { useState, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import type { UserRecord } from '../../types';
import type { WaterCustomer } from './waterTypes';
import { digitsOnly } from './waterTypes';
import { generateId } from '../../utils/storage';
import { SheetShell } from './VehiclesPanel';

interface Props {
  managerId: string;
  customers: WaterCustomer[];
  onClose: () => void;
  onSaved: () => void;
  onBulkAddUsers: (u: UserRecord[]) => void;
}

interface ParsedRow {
  line: number;
  name: string;
  phone: string;
  area: string;
  rate: number;
  status: 'valid' | 'invalid' | 'duplicate';
  reason?: string;
}

const MAX_LINES = 200;

function parse(text: string, customers: WaterCustomer[]): ParsedRow[] {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0).slice(0, MAX_LINES);
  const seen = new Set<string>();
  return lines.map((line, i) => {
    const parts = line.split(/\t|,/).map(s => s.trim());
    const [name = '', phone = '', area = '', rateStr = ''] = parts;
    const digits = digitsOnly(phone);
    const last10 = digits.slice(-10);
    const base: ParsedRow = { line: i + 1, name, phone, area, rate: 0, status: 'valid' };
    if (!name) return { ...base, status: 'invalid', reason: 'Name missing' };
    if (digits.length < 10) return { ...base, status: 'invalid', reason: 'Bad phone' };
    if (last10 && customers.some(c => digitsOnly(c.phone).slice(-10) === last10))
      return { ...base, status: 'duplicate', reason: 'Phone already registered' };
    if (seen.has(last10)) return { ...base, status: 'duplicate', reason: 'Duplicate in list' };
    seen.add(last10);
    if (rateStr) {
      const r = Number(rateStr);
      if (!Number.isFinite(r) || r < 0) return { ...base, status: 'invalid', reason: 'Bad rate' };
      base.rate = Math.trunc(r);
    }
    return base;
  });
}

/**
 * M6a: paste many customers at once — one line per customer:
 * "name, phone, area, rate" (comma or tab separated). Preview, then a single
 * batch add (one App state update via onBulkAddUsers).
 */
export default function BulkCustomerSheet({ managerId, customers, onClose, onSaved, onBulkAddUsers }: Props): React.JSX.Element {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const rows = useMemo(() => parse(text, customers), [text, customers]);
  const validRows = rows.filter(r => r.status === 'valid');

  const addAll = async () => {
    if (busy || validRows.length === 0) return;
    setBusy(true);
    setMsg(null);
    try {
      const now = new Date().toISOString();
      const users: UserRecord[] = validRows.map(r => ({
        id: generateId(),
        username: r.phone.trim(),
        name: r.name.trim(),
        phone: r.phone.trim(),
        address: r.area.trim() || '—',
        area: r.area.trim(),
        plan: 'Water',
        monthlyFee: 0,
        balance: 0,
        lastPaymentDate: '',
        expiryDate: '2099-12-31',
        createdAt: now,
        status: 'active',
      }));
      onBulkAddUsers(users);
      // Water settings for the new customers (one upsert; monthly billing default).
      const settingsRows = users.map((u, i) => ({
        manager_id: managerId,
        customer_id: u.id,
        rate_per_bottle: validRows[i].rate,
        usual_bottles: 1,
        deposit_amount: 0,
        opening_balance: 0,
        billing_mode: 'monthly',
      }));
      const { error } = await supabase
        .from('water_customer_settings')
        .upsert(settingsRows, { onConflict: 'manager_id,customer_id' });
      if (error) throw new Error(`Customers added, but rates could not be saved: ${error.message}`);
      onSaved();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Bulk add failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetShell title="Paste customers" onClose={onClose} busy={busy}>
      {msg && (
        <div className="text-sm font-semibold px-3 py-2.5 rounded-2xl mb-3 bg-[rgba(239,68,68,0.12)] text-[#b91c1c] dark:text-[#f87171]">
          {msg}
        </div>
      )}
      <p className="text-xs text-[#64748b] dark:text-[#94a3b8] mb-2">
        One customer per line: <span className="font-bold text-[#0f172a] dark:text-white">name, phone, area, rate</span> (comma or tab). Max {MAX_LINES} lines. Duplicate phones are skipped.
      </p>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder={'Ahmed Khan, 03001234567, Gulberg, 150\nSara Bibi, 03007654321, Model Town, 150'}
        rows={5}
        aria-label="Paste customers"
        className="w-full min-h-[120px] p-4 rounded-2xl bg-[#f8fafc] dark:bg-white/[0.03] border border-[#e2e8f0] dark:border-white/10 text-sm text-[#0f172a] dark:text-white placeholder-[#94a3b8] outline-none focus:border-[#3b82f6] mb-3 font-mono"
      />
      {rows.length > 0 && (
        <div className="rounded-2xl border border-[#e2e8f0] dark:border-white/10 overflow-hidden mb-3 max-h-[240px] overflow-y-auto">
          {rows.map(r => (
            <div key={r.line} className="flex items-center gap-2 px-3 py-2 border-b border-[#f1f5f9] dark:border-white/5 last:border-0 text-sm">
              <span className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${r.status === 'valid'
                ? 'bg-[rgba(34,197,94,0.15)] text-[#15803d] dark:text-[#4ade80]'
                : r.status === 'duplicate'
                  ? 'bg-[rgba(245,158,11,0.15)] text-[#b45309] dark:text-[#fbbf24]'
                  : 'bg-[rgba(239,68,68,0.15)] text-[#b91c1c] dark:text-[#f87171]'}`}>
                {r.status === 'valid' ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" className="w-3 h-3" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
                )}
              </span>
              <span className="flex-1 min-w-0 truncate font-semibold text-[#0f172a] dark:text-white">
                {r.name || <span className="text-[#94a3b8]">—</span>}
                <span className="text-[#94a3b8] font-normal"> • {r.phone || 'no phone'}</span>
              </span>
              {r.reason && <span className="shrink-0 text-[11px] text-[#94a3b8]">{r.reason}</span>}
            </div>
          ))}
        </div>
      )}
      <button type="button" onClick={addAll} disabled={busy || validRows.length === 0}
        className="w-full min-h-[52px] rounded-2xl bg-[#1d4ed8] text-white text-base font-bold disabled:opacity-40">
        {busy ? 'Adding…' : `Add ${validRows.length} customer${validRows.length === 1 ? '' : 's'}`}
      </button>
    </SheetShell>
  );
}
