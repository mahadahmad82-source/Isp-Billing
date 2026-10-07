import React, { useState, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import type { UserRecord } from '../../types';
import type { WaterCustomer, WaterCustomerSettings } from './waterTypes';
import { todayKarachi, digitsOnly } from './waterTypes';
import { generateId } from '../../utils/storage';
import { SheetShell, Stepper } from './VehiclesPanel';

interface Props {
  managerId: string;
  /** Edit mode when set; add mode when null. */
  customer?: WaterCustomer | null;
  existingSettings?: WaterCustomerSettings | null;
  /** All live customers — for the last-10-digit duplicate phone check. */
  customers: WaterCustomer[];
  onClose: () => void;
  onSaved: () => void;
  onAddUser: (u: UserRecord) => void;
  onUpdateUser: (id: string, update: Partial<UserRecord>) => void;
}

const inputCls =
  'w-full min-h-[48px] px-4 rounded-2xl bg-[#f8fafc] dark:bg-white/[0.03] border border-[#e2e8f0] dark:border-white/10 text-base text-[#0f172a] dark:text-white placeholder-[#94a3b8] outline-none focus:border-[#3b82f6]';
const labelCls = 'text-xs font-black uppercase tracking-widest text-[#64748b] dark:text-[#94a3b8] mb-1.5 block';
const errCls = 'text-xs font-bold text-[#b91c1c] dark:text-[#f87171] mt-1';

/**
 * M6a: single add/edit form for water customers. Add mode creates the
 * UserRecord via handleAddUser (dual-save stays in App), then upserts
 * water_customer_settings (rate/usual/deposit/opening/billing_mode) and
 * optional opening bottles. Edit mode updates profile fields via
 * handleUpdateUser plus the same settings. Never duplicates on retry.
 */
export default function CustomerFormSheet({
  managerId, customer, existingSettings, customers, onClose, onSaved, onAddUser, onUpdateUser,
}: Props): React.JSX.Element {
  const isEdit = !!customer;
  const [name, setName] = useState(customer?.name || '');
  const [phone, setPhone] = useState(customer?.phone || '');
  const [address, setAddress] = useState(customer?.address || '');
  const [area, setArea] = useState(customer?.area || '');
  const [rate, setRate] = useState(existingSettings?.rate_per_bottle ?? 0);
  const [usual, setUsual] = useState(existingSettings?.usual_bottles ?? 1);
  const [billingMode, setBillingMode] = useState<'daily' | 'monthly'>(existingSettings?.billing_mode ?? 'monthly');
  const [deposit, setDeposit] = useState(existingSettings?.deposit_amount ?? 0);
  const [opening, setOpening] = useState(existingSettings?.opening_balance ?? 0);
  const [openingBottles, setOpeningBottles] = useState(0);
  const [notes, setNotes] = useState(existingSettings?.notes || '');
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [retryState, setRetryState] = useState<{ customerId: string } | null>(null);
  const [confirmOpening, setConfirmOpening] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const openingRef = useRef<string | null>(null);

  const openingChanged = existingSettings != null && existingSettings.opening_balance !== opening;

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Name is required.';
    const digits = digitsOnly(phone);
    if (digits.length < 10) e.phone = 'Enter a valid phone number (03xx…).';
    else {
      const last10 = digits.slice(-10);
      const dupe = customers.some(c =>
        (!customer || c.id !== customer.id) && digitsOnly(c.phone).slice(-10) === last10 && last10.length > 0);
      if (dupe) e.phone = 'This phone number is already registered.';
    }
    if (!address.trim()) e.address = 'Address is required.';
    if (rate <= 0) e.rate = 'Rate per bottle must be more than 0.';
    return e;
  };

  const upsertSettings = async (customerId: string) => {
    const { error } = await supabase.from('water_customer_settings').upsert(
      {
        manager_id: managerId,
        customer_id: customerId,
        rate_per_bottle: rate,
        usual_bottles: usual,
        deposit_amount: deposit,
        opening_balance: opening,
        billing_mode: billingMode,
        notes: notes.trim() || null,
      },
      { onConflict: 'manager_id,customer_id' }
    );
    if (error) throw new Error(error.message);
  };

  const addOpeningBottles = async (customerId: string, customerName: string) => {
    if (openingBottles <= 0) return;
    if (!openingRef.current) openingRef.current = crypto.randomUUID();
    const { error } = await supabase.from('water_deliveries').upsert({
      manager_id: managerId,
      customer_id: customerId,
      delivery_date: todayKarachi(),
      bottles_delivered: openingBottles,
      empties_returned: 0,
      amount_collected: 0,
      rate_per_bottle: null,
      source: 'manager',
      note: 'Opening balance',
      client_ref: openingRef.current,
    }, { onConflict: 'manager_id,client_ref', ignoreDuplicates: true });
    if (error) throw new Error(error.message);
    openingRef.current = null;
  };

  const saveSettingsAndBottles = async (customerId: string, customerName: string) => {
    await upsertSettings(customerId);
    await addOpeningBottles(customerId, customerName);
  };

  const save = async () => {
    if (busy) return;
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setBusy(true);
    setMsg(null);
    try {
      if (isEdit && customer) {
        onUpdateUser(customer.id, {
          name: name.trim(), phone: phone.trim(), address: address.trim(), area: area.trim(),
        });
        await saveSettingsAndBottles(customer.id, name.trim());
        onSaved();
      } else {
        // (1) App state first — handleAddUser owns the dual-save.
        const user: UserRecord = {
          id: generateId(),
          username: phone.trim(),
          name: name.trim(),
          phone: phone.trim(),
          address: address.trim(),
          area: area.trim(),
          plan: 'Water',
          monthlyFee: 0,
          balance: 0,
          lastPaymentDate: '',
          // Far-future so ISP auto-expiry logic never expires a water customer.
          expiryDate: '2099-12-31',
          createdAt: new Date().toISOString(),
          status: 'active',
        };
        onAddUser(user);
        // (2)+(3) water settings + opening bottles. If these fail, the customer
        // exists — tell the user and offer Retry (never a duplicate customer).
        try {
          await saveSettingsAndBottles(user.id, user.name);
          onSaved();
        } catch (stepErr: unknown) {
          setRetryState({ customerId: user.id });
          throw new Error(`Customer "${user.name}" was created, but the rate/settings could not be saved. ${stepErr instanceof Error ? stepErr.message : ''}`);
        }
      }
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  const retrySettings = async () => {
    if (busy || !retryState) return;
    setBusy(true);
    setMsg(null);
    try {
      await saveSettingsAndBottles(retryState.customerId, name.trim());
      setRetryState(null);
      onSaved();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Retry failed.');
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async () => {
    if (busy || !customer) return;
    setBusy(true);
    setMsg(null);
    try {
      const { data, error } = await supabase
        .from('water_customer_ledger')
        .select('balance_due')
        .eq('manager_id', managerId)
        .eq('customer_id', customer.id)
        .maybeSingle();
      if (error) throw new Error(error.message);
      const due = Number((data as { balance_due?: number } | null)?.balance_due || 0);
      if (due !== 0) {
        setMsg(`Cannot deactivate: this customer still has a balance of Rs. ${Math.abs(due).toLocaleString('en-US')}. Settle it first.`);
        setConfirmDeactivate(false);
        return;
      }
      onUpdateUser(customer.id, { status: 'deleted' });
      onSaved();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Deactivate failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SheetShell title={isEdit ? customer!.name : 'Add customer'} onClose={onClose} busy={busy}>
      {msg && (
        <div className="text-sm font-semibold px-3 py-2.5 rounded-2xl mb-3 bg-[rgba(239,68,68,0.12)] text-[#b91c1c] dark:text-[#f87171]">
          {msg}
        </div>
      )}
      {retryState && (
        <button type="button" onClick={retrySettings} disabled={busy}
          className="w-full min-h-[48px] rounded-2xl bg-[#b45309] text-white text-base font-bold disabled:opacity-40 mb-3">
          {busy ? 'Retrying…' : 'Retry saving rate/settings'}
        </button>
      )}

      <label className={labelCls} htmlFor="cf-name">Name *</label>
      <input id="cf-name" type="text" value={name} onChange={e => setName(e.target.value)}
        placeholder="Customer name" autoComplete="off" className={`${inputCls} mb-1`} />
      {errors.name && <p className={`${errCls} mb-2`}>{errors.name}</p>}

      <label className={labelCls} htmlFor="cf-phone">Phone *</label>
      <input id="cf-phone" type="tel" value={phone} onChange={e => setPhone(e.target.value)}
        placeholder="03xx…" inputMode="tel" autoComplete="off" className={`${inputCls} mb-1`} />
      {errors.phone && <p className={`${errCls} mb-2`}>{errors.phone}</p>}

      <label className={labelCls} htmlFor="cf-address">Address *</label>
      <input id="cf-address" type="text" value={address} onChange={e => setAddress(e.target.value)}
        placeholder="House, street" autoComplete="off" className={`${inputCls} mb-3`} />
      {errors.address && <p className={`${errCls} mb-2`}>{errors.address}</p>}

      <label className={labelCls} htmlFor="cf-area">Area</label>
      <input id="cf-area" type="text" value={area} onChange={e => setArea(e.target.value)}
        placeholder="Area / mohalla" autoComplete="off" className={`${inputCls} mb-3`} />

      <span className={labelCls}>Rate per bottle (Rs.) *</span>
      <div className="mb-1"><Stepper value={rate} onChange={setRate} min={0} max={100000} label="Rate per bottle" /></div>
      {errors.rate && <p className={`${errCls} mb-2`}>{errors.rate}</p>}

      <span className={labelCls}>Usual bottles / day</span>
      <div className="mb-4"><Stepper value={usual} onChange={setUsual} min={0} max={1000} label="Usual bottles per day" /></div>

      <span className={labelCls}>Billing</span>
      <div className="grid grid-cols-2 gap-2 mb-1">
        {(['daily', 'monthly'] as const).map(m => {
          const sel = billingMode === m;
          return (
            <button key={m} type="button" aria-pressed={sel} onClick={() => setBillingMode(m)}
              className={`min-h-[52px] rounded-2xl border text-sm font-bold transition-colors ${sel
                ? 'border-[#1d4ed8] bg-[#dbeafe] text-[#1e40af] dark:bg-[rgba(59,130,246,0.18)] dark:text-[#93c5fd]'
                : 'border-[#e2e8f0] dark:border-white/10 text-[#475569] dark:text-[#94a3b8]'}`}>
              {m === 'daily' ? 'Daily' : 'Monthly'}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-[#94a3b8] mb-4 ml-1">
        {billingMode === 'daily' ? 'Pays at every delivery, receipt each time.' : 'Monthly bill.'}
      </p>

      <span className={labelCls}>Deposit (Rs.)</span>
      <div className="mb-4"><Stepper value={deposit} onChange={setDeposit} min={0} max={10000000} label="Deposit amount" /></div>

      <span className={labelCls}>Opening balance (Rs.)</span>
      <div className="mb-1"><Stepper value={opening} onChange={setOpening} min={0} max={10000000} label="Opening balance" /></div>
      {openingChanged && (
        <p className="text-xs font-bold text-[#92400e] dark:text-[#fbbf24] bg-[rgba(245,158,11,0.12)] rounded-2xl px-3 py-2 mb-3">
          Changing this will change the customer&apos;s balance.
        </p>
      )}
      <div className="mb-4" />

      <label className={labelCls} htmlFor="cf-notes">Notes</label>
      <input id="cf-notes" type="text" value={notes} onChange={e => setNotes(e.target.value)}
        placeholder="Notes" className={`${inputCls} mb-4`} />

      {!isEdit && (
        <div className="rounded-2xl bg-[#f8fafc] dark:bg-white/[0.03] border border-[#e2e8f0] dark:border-white/10 p-4 mb-4">
          <p className="text-sm font-black text-[#0f172a] dark:text-white mb-1">Opening bottles</p>
          <p className="text-xs text-[#64748b] dark:text-[#94a3b8] mb-2">How many bottles does the customer already have?</p>
          <div className="mb-2"><Stepper value={openingBottles} onChange={setOpeningBottles} min={0} max={10000} label="Opening bottles" /></div>
        </div>
      )}

      <button type="button" onClick={save} disabled={busy}
        className="w-full min-h-[52px] rounded-2xl bg-[#1d4ed8] text-white text-base font-bold disabled:opacity-40 mb-3">
        {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Add customer'}
      </button>

      {isEdit && (
        <>
          <div className="rounded-2xl bg-[#f8fafc] dark:bg-white/[0.03] border border-[#e2e8f0] dark:border-white/10 p-4 mb-3">
            <p className="text-sm font-black text-[#0f172a] dark:text-white mb-1">Opening bottles</p>
            <p className="text-xs text-[#64748b] dark:text-[#94a3b8] mb-2">How many bottles does the customer already have?</p>
            <div className="mb-2"><Stepper value={openingBottles} onChange={setOpeningBottles} min={0} max={10000} label="Opening bottles" /></div>
            <button type="button" onClick={() => setConfirmOpening(true)} disabled={busy || openingBottles <= 0}
              className="w-full min-h-[48px] rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-base font-bold text-[#0f172a] dark:text-white disabled:opacity-40">
              Add
            </button>
          </div>
          <button type="button" onClick={() => setConfirmDeactivate(true)} disabled={busy}
            className="w-full min-h-[48px] rounded-2xl bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.25)] text-[#b91c1c] dark:text-[#f87171] text-base font-bold disabled:opacity-40">
            Deactivate customer
          </button>
        </>
      )}

      {confirmOpening && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Confirm opening bottles">
          <div className="absolute inset-0 bg-black/70" onClick={() => !busy && setConfirmOpening(false)} />
          <div className="relative z-10 w-full sm:max-w-sm bg-white dark:bg-[#0f172a] rounded-t-[2rem] sm:rounded-[2rem] border border-[#e2e8f0] dark:border-white/10 p-5 pb-6">
            <p className="text-base font-bold text-[#0f172a] dark:text-white mb-5">
              Add {openingBottles} opening {openingBottles === 1 ? 'bottle' : 'bottles'} for {name.trim() || 'this customer'}?
              This entry cannot be edited later, it can only be voided.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmOpening(false)} disabled={busy}
                className="flex-1 min-h-[48px] rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-base font-bold text-[#0f172a] dark:text-white disabled:opacity-50">
                Cancel
              </button>
              <button type="button" onClick={async () => {
                if (busy || !customer) return;
                setBusy(true); setMsg(null);
                try { await addOpeningBottles(customer.id, name.trim()); setConfirmOpening(false); setOpeningBottles(0); onSaved(); }
                catch (e: unknown) { setMsg(e instanceof Error ? e.message : 'Could not add opening bottles.'); }
                finally { setBusy(false); }
              }} disabled={busy}
                className="flex-1 min-h-[48px] rounded-2xl bg-[#1d4ed8] text-white text-base font-bold disabled:opacity-50">
                {busy ? 'Adding…' : 'Add'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDeactivate && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" role="dialog" aria-modal="true" aria-label="Confirm deactivate">
          <div className="absolute inset-0 bg-black/70" onClick={() => !busy && setConfirmDeactivate(false)} />
          <div className="relative z-10 w-full sm:max-w-sm bg-white dark:bg-[#0f172a] rounded-t-[2rem] sm:rounded-[2rem] border border-[#e2e8f0] dark:border-white/10 p-5 pb-6">
            <p className="text-base font-bold text-[#0f172a] dark:text-white mb-2">
              Deactivate {name.trim() || 'this customer'}?
            </p>
            <p className="text-sm text-[#64748b] dark:text-[#94a3b8] mb-5">
              The customer will be hidden from lists, but all history (deliveries, payments, ledger) is kept.
            </p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setConfirmDeactivate(false)} disabled={busy}
                className="flex-1 min-h-[48px] rounded-2xl border border-[#e2e8f0] dark:border-white/10 text-base font-bold text-[#0f172a] dark:text-white disabled:opacity-50">
                Cancel
              </button>
              <button type="button" onClick={deactivate} disabled={busy}
                className="flex-1 min-h-[48px] rounded-2xl bg-[#dc2626] text-white text-base font-bold disabled:opacity-50">
                {busy ? 'Working…' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </SheetShell>
  );
}
