import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { uploadMediaToR2 } from '../utils/whatsapp';
import { DEFAULT_ISP_PLANS, fetchPricingPlans, PricingPlan } from '../utils/pricing';

/**
 * Settings -> "Plan & Billing".
 * Shows the manager's current plan/status/usage and every other plan with an
 * Upgrade option.
 *
 * Upgrade paths (decided by what the server allows):
 *  - Free (active) or pending_payment managers: select_signup_tier(tier) ->
 *    payment details -> proof upload -> submit_signup_payment_proof. The plan
 *    stays at Free limits until an admin verifies the payment.
 *  - Paid-active, legacy trial and locked managers: the RPCs refuse plan
 *    changes by design, so Upgrade opens a WhatsApp request to support
 *    (no state is changed).
 */

interface SubRow {
  ok?: boolean;
  success?: boolean;
  error?: string;
  exists?: boolean;
  plan?: string;
  status?: string;
  plan_expires_at?: string | null;
  customer_limit?: number | null;
  submanager_limit?: number | null;
  payment_proof_submitted?: boolean;
}

interface Props {
  managerId: string;
  /** Length of manager_data.users (the server counts exactly this array). */
  customerCount: number;
  subManagerCount: number;
}

const SUPPORT_WA = '923042773453'; // plan-change requests (same number UpgradeGate uses)
const RECEIPT_WA = '923477136214'; // payment receipts (same number the signup flow uses)

const rpcMsg = (data: any, error: any): string | null => {
  if (error) return error.message || 'Server error';
  if (data && typeof data === 'object' && (data.ok === false || data.success === false)) return data.error || 'Server error';
  return null;
};

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const Check: React.FC = () => (
  <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
  </svg>
);

const UsageBar: React.FC<{ label: string; used: number; limit: number | null | undefined }> = ({ label, used, limit }) => {
  const unlimited = limit == null;
  const pct = unlimited || !limit ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const bar = pct >= 100 ? 'bg-rose-500' : pct >= 80 ? 'bg-amber-500' : 'bg-indigo-500';
  return (
    <div>
      <div className="flex justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400 mb-1">
        <span>{label}</span>
        <span className="text-slate-900 dark:text-white">{used} / {unlimited ? 'Unlimited' : limit}</span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
        <div className={`h-full ${bar} transition-all`} style={{ width: unlimited ? '8%' : `${pct}%` }} />
      </div>
    </div>
  );
};

const PlanUpgradeCard: React.FC<Props> = ({ managerId, customerCount, subManagerCount }) => {
  const [sub, setSub] = useState<SubRow | null>(null);
  const [plans, setPlans] = useState<PricingPlan[]>(DEFAULT_ISP_PLANS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmTier, setConfirmTier] = useState<PricingPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const loadSub = useCallback(async () => {
    setLoadError(null);
    try {
      const { data, error } = await supabase.rpc('get_my_subscription');
      const m = rpcMsg(data, error);
      if (m) throw new Error(m);
      setSub(data as SubRow);
    } catch (e: any) {
      const m: string = e?.message || '';
      setLoadError(/not logged in/i.test(m) ? 'Plan details are available to the manager account only.' : m || 'Could not load your plan.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSub();
    fetchPricingPlans()
      .then(p => { if (p && p.length) setPlans(p); })
      .catch(() => { /* keep defaults */ });
  }, [loadSub]);

  const tiers = useMemo(
    () => plans.filter(p => !p.name.trim().toLowerCase().startsWith('netbot')),
    [plans]
  );
  const rank = (name: string) => tiers.findIndex(p => p.name.trim().toLowerCase() === name.trim().toLowerCase());

  const status = sub?.status || 'active';
  const plan = (sub?.plan || 'free').toLowerCase();
  const pending = status === 'pending_payment';
  const legacyTrial = status === 'trial';
  const locked = status === 'locked' || status === 'expired';
  // Server only lets Free/pending accounts pick a plan themselves.
  const selfServe = pending || (status === 'active' && plan === 'free');
  // While pending, limits are the Free ones (server-enforced) until payment is verified.
  const effectivePlanName = pending ? 'free' : plan;
  const currentRank = rank(effectivePlanName);

  const openWhatsApp = (wa: string, text: string) => {
    window.open(`https://wa.me/${wa}?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
  };

  const requestUpgrade = (p: PricingPlan) => {
    const t = p.name.trim().toLowerCase();
    if (t === 'custom' || !selfServe) {
      openWhatsApp(
        SUPPORT_WA,
        `I want to upgrade my plan to ${p.name} — manager: ${managerId} (current: ${cap(plan)}${legacyTrial ? ', legacy trial' : ''})`
      );
      return;
    }
    setMsg(null);
    setConfirmTier(p);
  };

  const confirmSelect = async () => {
    if (!confirmTier || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const { data, error } = await supabase.rpc('select_signup_tier', { p_tier: confirmTier.name.trim().toLowerCase() });
      const m = rpcMsg(data, error);
      if (m) {
        setMsg({ ok: false, text: `Couldn't select the plan (${m}). If this keeps happening, contact support on WhatsApp.` });
      } else {
        setConfirmTier(null);
        setProofFile(null);
        await loadSub();
      }
    } catch (e: any) {
      setMsg({ ok: false, text: e?.message || 'Could not select the plan, please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const submitProof = async () => {
    if (!proofFile || uploading) return;
    setUploading(true);
    setMsg(null);
    try {
      const ext = (proofFile.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `signup-proofs/${managerId.replace(/[^a-zA-Z0-9_-]/g, '')}-${Date.now()}.${ext}`;
      let url: string;
      try {
        url = await uploadMediaToR2(path, proofFile, proofFile.type || 'image/jpeg');
      } catch (err: any) {
        const m = err?.message || '';
        setMsg({
          ok: false,
          text: /failed to fetch/i.test(m)
            ? 'Upload could not reach the server. Please send your payment receipt on WhatsApp instead.'
            : m || 'Proof upload failed, please try again.',
        });
        return;
      }
      const { data, error } = await supabase.rpc('submit_signup_payment_proof', { p_proof_url: url });
      const m = rpcMsg(data, error);
      if (m) {
        setMsg({ ok: false, text: `Proof uploaded but couldn't be recorded (${m}). Please contact support.` });
        return;
      }
      setProofFile(null);
      setMsg({ ok: true, text: 'Payment proof submitted. Your plan activates once it is verified.' });
      await loadSub();
    } finally {
      setUploading(false);
    }
  };

  const cardCls = 'bg-white dark:bg-[#0f172a] p-6 lg:p-8 rounded-2xl border border-slate-200 dark:border-white/5 shadow-sm';

  if (loading) {
    return <div className={cardCls}><p className="text-sm font-bold text-slate-400">Loading plan details...</p></div>;
  }
  if (loadError || !sub) {
    return (
      <div className={`${cardCls} space-y-3`}>
        <p className="text-sm font-bold text-slate-500 dark:text-slate-400">{loadError || 'Plan details are available to the manager account only.'}</p>
        <button onClick={() => { setLoading(true); loadSub(); }} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest">Retry</button>
      </div>
    );
  }

  const statusBadge = pending
    ? { t: 'Payment pending', c: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' }
    : locked
      ? { t: status === 'expired' ? 'Expired' : 'Locked', c: 'bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400' }
      : legacyTrial
        ? { t: 'Legacy trial', c: 'bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400' }
        : { t: 'Active', c: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' };

  const expires = sub.plan_expires_at ? new Date(sub.plan_expires_at) : null;
  const expiresText = expires && !isNaN(expires.getTime())
    ? new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'long', year: 'numeric' }).format(expires)
    : null;

  return (
    <div className="space-y-6">
      {/* Current plan */}
      <div className={`${cardCls} space-y-5`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Your current plan</p>
            <h4 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              {pending ? 'Free' : cap(plan)}
            </h4>
            {pending && (
              <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 mt-1">
                {cap(plan)} requested — Free limits apply until payment is verified.
              </p>
            )}
            {legacyTrial && (
              <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 mt-1">
                Trial plans are discontinued. Choose a plan below to continue.
              </p>
            )}
            {locked && (
              <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400 mt-1">
                Your account is {status}. Contact support to restore access.
              </p>
            )}
            {expiresText && !pending && <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-1">Renews / expires: {expiresText}</p>}
          </div>
          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${statusBadge.c}`}>{statusBadge.t}</span>
        </div>
        <div className="space-y-3">
          <UsageBar label="Customers" used={customerCount} limit={sub.customer_limit} />
          <UsageBar label="Sub-manager accounts" used={subManagerCount} limit={sub.submanager_limit} />
        </div>
      </div>

      {/* Payment panel: pending plan */}
      {pending && (
        <div className={`${cardCls} space-y-4`}>
          <div>
            <h4 className="text-lg font-black text-slate-900 dark:text-white">Complete payment for {cap(plan)}</h4>
            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-1">
              Pay using any option below, then upload the receipt screenshot. Your plan activates once it is verified.
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 space-y-2 text-[12px]">
            <p className="font-black text-indigo-600 dark:text-indigo-400 text-[10px] uppercase tracking-wider">Meezan Bank</p>
            <div className="flex justify-between gap-3"><span className="text-slate-500">Title</span><span className="font-bold text-slate-900 dark:text-white text-right">MAHAD AHMAD KHAN LODHI</span></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">Account</span><span className="font-bold text-slate-900 dark:text-white">00300112164874</span></div>
            <div className="flex justify-between gap-3"><span className="text-slate-500">IBAN</span><span className="font-bold text-slate-900 dark:text-white text-[10px] break-all text-right">PK82MEZN0000300112164874</span></div>
            <div className="border-t border-slate-200 dark:border-white/10 my-2" />
            <p className="font-black text-indigo-600 dark:text-indigo-400 text-[10px] uppercase tracking-wider">EasyPaisa / JazzCash</p>
            <div className="flex justify-between gap-3"><span className="text-slate-500">Number</span><span className="font-bold text-slate-900 dark:text-white">0304-2773453</span></div>
          </div>
          {sub.payment_proof_submitted && (
            <p className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[12px] font-bold">
              Payment proof received — waiting for verification. You can upload a new screenshot if needed.
            </p>
          )}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Upload payment proof (screenshot)</label>
            <input
              type="file"
              accept="image/*"
              onChange={e => setProofFile(e.target.files?.[0] || null)}
              className="w-full text-[11px] text-slate-600 dark:text-slate-300 file:mr-3 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-[10px] file:font-black file:uppercase file:tracking-wider file:bg-indigo-50 file:text-indigo-600"
            />
          </div>
          <button
            type="button"
            onClick={submitProof}
            disabled={uploading || !proofFile}
            className="w-full py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[10px] uppercase tracking-widest disabled:opacity-40"
          >
            {uploading ? 'Uploading...' : 'Submit payment proof'}
          </button>
          <button
            type="button"
            onClick={() => openWhatsApp(RECEIPT_WA, `Payment receipt for ${cap(plan)} plan — manager: ${managerId}`)}
            className="w-full py-2 text-[11px] font-bold text-emerald-700 dark:text-emerald-400"
          >
            Also send the receipt on WhatsApp (optional)
          </button>
        </div>
      )}

      {msg && (
        <p className={`p-3 rounded-xl text-[12px] font-bold ${msg.ok ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400' : 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400'}`}>
          {msg.text}
        </p>
      )}

      {/* All plans */}
      <div className={`${cardCls} space-y-4`}>
        <div>
          <h4 className="text-lg font-black text-slate-900 dark:text-white">{pending ? 'Change requested plan' : 'Upgrade your plan'}</h4>
          <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 mt-1">
            {selfServe
              ? 'Pick a plan, pay, and upload the receipt. Free limits apply until payment is verified.'
              : 'Tap Upgrade to send a plan-change request to support on WhatsApp.'}
          </p>
        </div>
        <div className="space-y-3">
          {tiers.map(p => {
            const name = p.name.trim().toLowerCase();
            const r = rank(p.name);
            const isCurrent = r === currentRank && !pending && !legacyTrial;
            const isRequested = pending && name === plan;
            const isHigher = r > currentRank || legacyTrial || locked;
            const price = p.period ? `${p.price}/mo` : p.price === 'Custom' ? 'Contact us' : p.price;
            return (
              <div key={p.name} className={`p-4 rounded-2xl border ${isCurrent || isRequested ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-500/10' : 'border-slate-200 dark:border-white/10'}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-black text-slate-900 dark:text-white">{p.name}</p>
                    <p className="text-[12px] font-bold text-indigo-600 dark:text-indigo-400">{price}</p>
                  </div>
                  {isCurrent ? (
                    <span className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-wider">Current</span>
                  ) : isRequested ? (
                    <span className="px-3 py-1.5 rounded-xl bg-amber-500 text-white text-[10px] font-black uppercase tracking-wider">Requested</span>
                  ) : isHigher ? (
                    <button
                      type="button"
                      onClick={() => requestUpgrade(p)}
                      disabled={busy}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-black uppercase tracking-wider disabled:opacity-40"
                    >
                      {name === 'custom' ? 'Contact us' : 'Upgrade'}
                    </button>
                  ) : null}
                </div>
                <ul className="mt-3 space-y-1.5">
                  {p.features.slice(0, 4).map(f => (
                    <li key={f} className="flex gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400"><Check /><span>{f}</span></li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <p className="text-[10px] font-bold text-slate-400">To downgrade or change a paid plan, contact support on WhatsApp: 0304-2773453.</p>
      </div>

      {/* Confirm dialog (self-serve tier select) */}
      {confirmTier && (
        <div className="fixed inset-0 z-[300] bg-black/60 flex items-center justify-center p-6" onClick={() => !busy && setConfirmTier(null)}>
          <div className="bg-white dark:bg-[#0f172a] rounded-3xl p-6 max-w-sm w-full space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-black text-slate-900 dark:text-white">Upgrade to {confirmTier.name}?</h3>
            <p className="text-[12px] font-bold text-slate-500 dark:text-slate-400">
              You will get payment details next. Your account stays on Free limits (50 customers) until the payment is verified.
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setConfirmTier(null)} disabled={busy} className="flex-1 py-3 rounded-2xl bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-white font-black text-[10px] uppercase tracking-widest">Cancel</button>
              <button type="button" onClick={confirmSelect} disabled={busy} className="flex-1 py-3 rounded-2xl bg-indigo-600 text-white font-black text-[10px] uppercase tracking-widest disabled:opacity-50">{busy ? 'Please wait...' : 'Continue'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PlanUpgradeCard;
