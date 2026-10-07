import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { BusinessType } from '../types';
import { DEFAULT_BUSINESS_TYPE, normalizeBusinessType } from '../utils/businessType';

// Reads profiles.business_type for the logged-in MANAGER. Everyone else (admin, sub-manager,
// logged out) and any failure => 'isp', i.e. exactly today's behaviour. The value is cached per
// manager so the first paint (and offline use) already has the right answer.
// Clients cannot change business_type (column is not updatable); only admin_set_business_type can.

const cacheKey = (manager: string) => `bc_business_type_${manager}`;

const readCacheRaw = (manager?: string | null): string | null => {
  if (!manager) return null;
  try { return localStorage.getItem(cacheKey(manager)); } catch { return null; }
};

const readCache = (manager?: string | null): BusinessType => {
  const raw = readCacheRaw(manager);
  return raw == null ? DEFAULT_BUSINESS_TYPE : normalizeBusinessType(raw);
};

export interface BusinessTypeState {
  type: BusinessType;
  /**
   * Final Sweep B2: true only while this manager+role's type is not yet
   * resolved AND no cache exists. While true, App shows a bare spinner
   * instead of flashing the ISP nav. Cache hits resolve instantly (loading
   * stays false), so ISP managers are never slowed down.
   */
  loading: boolean;
}

export function useBusinessType(activeManager: string | null | undefined, userRole: string): BusinessTypeState {
  const [state, setState] = useState<BusinessTypeState>(() => {
    const raw = readCacheRaw(activeManager);
    const needsResolve = !!activeManager && userRole === 'manager' && raw == null;
    return { type: raw == null ? DEFAULT_BUSINESS_TYPE : normalizeBusinessType(raw), loading: needsResolve };
  });

  useEffect(() => {
    const raw = readCacheRaw(activeManager);
    if (!activeManager || userRole !== 'manager') { setState({ type: DEFAULT_BUSINESS_TYPE, loading: false }); return; }
    // Cache hit: instant and correct — never show the spinner for these.
    setState({ type: raw == null ? DEFAULT_BUSINESS_TYPE : normalizeBusinessType(raw), loading: raw == null });
    let cancelled = false;
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const uid = sess?.session?.user?.id;
        if (!uid) { if (!cancelled) setState(s => ({ ...s, loading: false })); return; }
        const { data: row, error } = await supabase.from('profiles').select('business_type').eq('id', uid).maybeSingle();
        if (cancelled) return;
        if (error || !row) { setState(s => ({ ...s, loading: false })); return; }
        const t = normalizeBusinessType((row as { business_type?: unknown }).business_type);
        setState({ type: t, loading: false });
        try { localStorage.setItem(cacheKey(activeManager), t); } catch { /* ignore */ }
      } catch { if (!cancelled) setState(s => ({ ...s, loading: false })); }
    })();
    return () => { cancelled = true; };
  }, [activeManager, userRole]);

  // M5: re-read the cache when the gate (or signup) saves a new type, so the
  // app's tabs switch immediately without a reload.
  useEffect(() => {
    const refresh = () => setState({ type: readCache(activeManager), loading: false });
    window.addEventListener('bc-business-type-changed', refresh);
    return () => window.removeEventListener('bc-business-type-changed', refresh);
  }, [activeManager]);

  return state;
}
