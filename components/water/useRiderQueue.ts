import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

export interface QueuedDelivery {
  client_ref: string;
  payload: Record<string, unknown>;
  queuedAt: string;
}

/**
 * M6c: offline queue for rider delivery entries. Entries persist in
 * localStorage (survive refresh), retry on `online`, on tab visibility and
 * every 45s. An entry leaves the queue only after a successful upsert.
 * The upsert uses onConflict manager_id,client_ref + ignoreDuplicates, so a
 * retried entry can never double-enter.
 */
export function useRiderQueue(riderUsername: string) {
  const key = `bc_water_rider_queue_${riderUsername}`;

  const read = useCallback((): QueuedDelivery[] => {
    try {
      const raw = localStorage.getItem(key);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }, [key]);

  const [queue, setQueue] = useState<QueuedDelivery[]>(() => {
    try {
      const raw = localStorage.getItem(key);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  });

  const persist = useCallback((q: QueuedDelivery[]) => {
    try {
      localStorage.setItem(key, JSON.stringify(q));
    } catch {
      /* storage full/blocked — keep in memory */
    }
    setQueue(q);
  }, [key]);

  const enqueue = useCallback((entry: QueuedDelivery) => {
    const q = read();
    if (q.some(e => e.client_ref === entry.client_ref)) return; // already queued
    persist([...q, entry]);
  }, [read, persist]);

  const remove = useCallback((clientRef: string) => {
    persist(read().filter(e => e.client_ref !== clientRef));
  }, [read, persist]);

  const flush = useCallback(async () => {
    const q = read();
    for (const e of q) {
      try {
        const { error } = await supabase
          .from('water_deliveries')
          .upsert(e.payload, { onConflict: 'manager_id,client_ref', ignoreDuplicates: true });
        if (error) throw error;
        // Only after a confirmed save.
        const rest = read().filter(x => x.client_ref !== e.client_ref);
        persist(rest);
      } catch {
        break; // stop at first failure; retry later
      }
    }
  }, [read, persist]);

  useEffect(() => {
    flush();
    const onOnline = () => flush();
    const onVisible = () => {
      if (document.visibilityState === 'visible') flush();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(flush, 45000);
    return () => {
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }, [flush]);

  return { queue, enqueue, remove, flush, pending: queue.length };
}
