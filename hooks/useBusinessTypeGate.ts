import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { BusinessType } from '../types';
import { normalizeBusinessType } from '../utils/businessType';

const GATE_WAIT_MS = 2500;

export interface BusinessTypeGateState {
  needsSelection: boolean;
  loading: boolean;
  error: string;
  choose: (t: BusinessType) => Promise<{ ok: boolean; error?: string }>;
}

/**
 * M5: catches accounts whose business type was never chosen (abandoned signup,
 * OTP path, or a failed set_my_business_type RPC). Only ever applies to
 * role === 'manager' — any error, anonymous session, admin or sub-manager
 * resolves to needsSelection=false so nobody can ever be wrongly locked out.
 */
export function useBusinessTypeGate(
  activeManager: string | null | undefined,
  userRole: string,
): BusinessTypeGateState {
  // Launch speed: once an account is known to be settled on this device ('1' cached) the app opens
  // immediately and the check only re-verifies in the background. Without a cache (first launch on
  // this device) we wait for the profile, but never longer than GATE_WAIT_MS: slow/offline networks
  // fail OPEN (no lock-out); if the answer arrives later and says "not chosen", the gate appears then.
  const setKey = activeManager ? `bc_business_type_set_${activeManager}` : '';
  const isCachedSet = (): boolean => { try { return !!setKey && localStorage.getItem(setKey) === '1'; } catch { return false; } };
  const [needsSelection, setNeedsSelection] = useState(false);
  const [loading, setLoading] = useState<boolean>(() => !!activeManager && userRole === 'manager' && !isCachedSet());
  const [error, setError] = useState('');

  useEffect(() => {
    if (!activeManager || userRole !== 'manager') {
      setNeedsSelection(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const cached = isCachedSet();
    setLoading(!cached);
    setError('');
    const failOpen = cached ? null : setTimeout(() => { if (!cancelled) setLoading(false); }, GATE_WAIT_MS);
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const uid = sess?.session?.user?.id;
        if (!uid || cancelled) {
          if (!cancelled) setLoading(false);
          return;
        }
        const { data: row, error: qErr } = await supabase
          .from('profiles')
          .select('business_type_set')
          .eq('id', uid)
          .maybeSingle();
        if (cancelled) return;
        if (qErr) {
          setError(qErr.message);
          setNeedsSelection(false);
        } else {
          const notChosen = (row as { business_type_set?: boolean } | null)?.business_type_set === false;
          setNeedsSelection(notChosen);
          if (!notChosen && setKey) { try { localStorage.setItem(setKey, '1'); } catch { /* ignore */ } }
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not check account status.');
          setNeedsSelection(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; if (failOpen) clearTimeout(failOpen); };
  }, [activeManager, userRole]);

  const choose = useCallback(async (t: BusinessType) => {
    try {
      const { data, error: rpcErr } = await supabase.rpc('set_my_business_type', { p_type: t });
      if (rpcErr) return { ok: false, error: rpcErr.message };
      const ok = (data as { success?: boolean } | null)?.success === true;
      if (!ok) {
        return { ok: false, error: (data as { error?: string } | null)?.error || 'Could not save. Try again.' };
      }
      // Keep the per-manager cache in sync, then tell useBusinessType to re-read
      // so the app's tabs switch immediately without a reload.
      try {
        if (activeManager) {
          localStorage.setItem(`bc_business_type_${activeManager}`, normalizeBusinessType(t));
          localStorage.setItem(`bc_business_type_set_${activeManager}`, '1');
        }
      } catch { /* ignore */ }
      window.dispatchEvent(new Event('bc-business-type-changed'));
      setNeedsSelection(false);
      return { ok: true };
    } catch (e: unknown) {
      return { ok: false, error: e instanceof Error ? e.message : 'Could not save. Try again.' };
    }
  }, [activeManager]);

  return { needsSelection, loading, error, choose };
}
