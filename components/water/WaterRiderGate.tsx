import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

interface Props {
  /** The existing ISP sub-manager UI — rendered unchanged for non-water riders. */
  fallback: React.ReactNode;
  children: React.ReactNode; // WaterRiderHome
}

/**
 * M6c: routes a logged-in sub-manager to the water rider app when their
 * manager's business type is 'water' (via my_business_type, which resolves
 * the manager's type for riders). Anything else — including RPC failure —
 * renders the existing ISP UI untouched.
 */
export default function WaterRiderGate({ fallback, children }: Props): React.JSX.Element {
  const [isWaterRider, setIsWaterRider] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.rpc('my_business_type');
        if (!cancelled) setIsWaterRider(!error && data === 'water');
      } catch {
        if (!cancelled) setIsWaterRider(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (isWaterRider === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f7fc] dark:bg-[#0b0f1a]">
        <div className="w-10 h-10 rounded-full border-[3px] border-indigo-500/25 border-t-indigo-500 animate-spin" aria-label="Loading" />
      </div>
    );
  }
  return <>{isWaterRider ? children : fallback}</>;
}
