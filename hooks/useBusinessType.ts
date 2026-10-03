import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { BusinessType } from '../types';
import { DEFAULT_BUSINESS_TYPE, normalizeBusinessType } from '../utils/businessType';

// Reads profiles.business_type for the logged-in MANAGER. Everyone else (admin, sub-manager,
// logged out) and any failure => 'isp', i.e. exactly today's behaviour. The value is cached per
// manager so the first paint (and offline use) already has the right answer.
// Clients cannot change business_type (column is not updatable); only admin_set_business_type can.

const cacheKey = (manager: string) => `bc_business_type_${manager}`;

const readCache = (manager?: string | null): BusinessType => {
  if (!manager) return DEFAULT_BUSINESS_TYPE;
  try { return normalizeBusinessType(localStorage.getItem(cacheKey(manager))); } catch { return DEFAULT_BUSINESS_TYPE; }
};

export function useBusinessType(activeManager: string | null | undefined, userRole: string): BusinessType {
  const [type, setType] = useState<BusinessType>(() => readCache(activeManager));

  useEffect(() => {
    if (!activeManager || userRole !== 'manager') { setType(DEFAULT_BUSINESS_TYPE); return; }
    setType(readCache(activeManager));
    let cancelled = false;
    (async () => {
      try {
        const { data: sess } = await supabase.auth.getSession();
        const uid = sess?.session?.user?.id;
        if (!uid) return;
        const { data: row, error } = await supabase.from('profiles').select('business_type').eq('id', uid).maybeSingle();
        if (cancelled || error || !row) return;
        const t = normalizeBusinessType((row as { business_type?: unknown }).business_type);
        setType(t);
        try { localStorage.setItem(cacheKey(activeManager), t); } catch { /* ignore */ }
      } catch { /* keep cached/default */ }
    })();
    return () => { cancelled = true; };
  }, [activeManager, userRole]);

  return type;
}
