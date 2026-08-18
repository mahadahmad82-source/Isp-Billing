import { supabase } from '../lib/supabase';
import { AppState } from '../types';
import { getActiveSession, getAccounts } from './storage';

const isRealAuthSubManagerSession = (): boolean => {
  try {
    const active = getActiveSession();
    return !!active && !!getAccounts().find(account => account.username === active && account.role === 'sub-manager' && account.authUserId);
  } catch { return false; }
};

// ─── Sync status broadcast ────────────────────────────────────────────────────
export type SyncStatus = 'idle' | 'saving' | 'saved' | 'failed' | 'retrying';
type StatusListener = (s: SyncStatus) => void;
const listeners: StatusListener[] = [];
export const onSyncStatus = (fn: StatusListener) => { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i > -1) listeners.splice(i, 1); }; };
const emit = (s: SyncStatus) => listeners.forEach(fn => fn(s));
let tierLimitAlertedThisSession = false; // debounce repeat plan-limit alerts (see upsertWithRetry)

// ─── Pending queue (survives page reload) ────────────────────────────────────
const QUEUE_KEY = '__supabase_pending_sync__';
interface PendingItem { managerId: string; stateJson: string; ts: string; }

const getQueue = (): PendingItem[] => {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
};
const setQueue = (q: PendingItem[]) => {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch {}
};
const enqueue = (managerId: string, state: AppState) => {
  const q = getQueue().filter(x => x.managerId !== managerId); // one pending per manager
  q.push({ managerId, stateJson: JSON.stringify(state), ts: new Date().toISOString() });
  setQueue(q);
  console.warn('[Supabase] Queued for retry:', managerId);
};
const dequeue = (managerId: string) => {
  setQueue(getQueue().filter(x => x.managerId !== managerId));
};

// ─── Core upsert with retries ─────────────────────────────────────────────────
const upsertWithRetry = async (managerId: string, state: AppState, maxAttempts = 3): Promise<boolean> => {
  if (isRealAuthSubManagerSession()) return false;
  const stateWithTs = { ...state, _syncedAt: new Date().toISOString() };

  // Self-heal an expired/lost session BEFORE hammering the DB. An expired
  // access token (refresh token rotated away by another tab/instance) was
  // causing every attempt below — AND the RPC fallback — to fail identically
  // with 401, filling the pending queue and burning retries for nothing.
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) await supabase.auth.refreshSession();
  } catch { /* proceed to attempts regardless — unchanged fallback behavior below */ }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      emit(attempt === 1 ? 'saving' : 'retrying');
      let { error } = await supabase
        .from('manager_data')
        .upsert(
          { manager_id: managerId, data: stateWithTs, updated_at: stateWithTs._syncedAt },
          { onConflict: 'manager_id' }
        );
      if (error) {
        // Fallback for sessions without a Supabase Auth JWT (e.g. sub-managers,
        // or the legacy local-login path) — RLS blocks the direct upsert above
        // for them, so use the scoped SECURITY DEFINER RPC instead.
        const { error: rpcErr } = await supabase.rpc('save_manager_state', {
          p_manager_id: managerId,
          p_data: stateWithTs,
        });
        error = rpcErr;
      }
      if (!error) {
        localStorage.setItem(`${managerId}_syncedAt`, stateWithTs._syncedAt);
        dequeue(managerId);
        emit('saved');
        console.log(`[Supabase] ✅ Saved (attempt ${attempt})`);
        return true;
      }
      console.error(`[Supabase] Attempt ${attempt} error:`, error.message);
      // Hard plan-limit block (see enforce_tier_limits trigger) — retrying
      // will never succeed until the manager upgrades or removes data, so
      // stop immediately instead of burning attempts/backoff, and tell the
      // person clearly instead of leaving them wondering why nothing saved.
      if (error.message?.includes('TIER_LIMIT_')) {
        const friendly = error.message.split(':').slice(1).join(':').trim() || error.message;
        if (!tierLimitAlertedThisSession) {
          tierLimitAlertedThisSession = true;
          alert(friendly);
          setTimeout(() => { tierLimitAlertedThisSession = false; }, 60000); // allow a fresh alert after 1 min, not every 45s
        }
        emit('failed');
        return false;
      }
    } catch (err) {
      console.error(`[Supabase] Attempt ${attempt} exception:`, err);
    }
    if (attempt < maxAttempts) await new Promise(r => setTimeout(r, attempt * 2000)); // 2s, 4s backoff
  }
  emit('failed');
  return false;
};

// ─── Public: save state ───────────────────────────────────────────────────────
export const saveStateToSupabase = async (managerId: string, state: AppState): Promise<void> => {
  if (!managerId || isRealAuthSubManagerSession()) return;

  const userCount    = state?.users?.length    || 0;
  const receiptCount = state?.receipts?.length || 0;

  // Safety: never overwrite real DB data with empty state
  if (userCount === 0 && receiptCount === 0) {
    try {
      let { data: existing, error: existingErr } = await supabase
        .from('manager_data').select('data').eq('manager_id', managerId).maybeSingle();
      if (existingErr || !existing) {
        // RLS-blocked (no-JWT session) — check via RPC instead of assuming empty.
        const { data: snapshot } = await supabase.rpc('get_manager_state_snapshot', { p_manager_id: managerId });
        if (snapshot) existing = { data: snapshot } as any;
      }
      const eu = (existing?.data as any)?.users?.length    || 0;
      const er = (existing?.data as any)?.receipts?.length || 0;
      if (eu > 0 || er > 0) {
        console.warn(`[Supabase] BLOCKED empty save — DB has ${eu} users`);
        return;
      }
    } catch { return; }
  }

  const ok = await upsertWithRetry(managerId, state, 3);
  if (!ok) enqueue(managerId, state); // queue for later retry
};

// ─── Public: flush pending queue (call every 30–60s from App.tsx) ─────────────
export const flushPendingSync = async (): Promise<void> => {
  if (isRealAuthSubManagerSession()) return;
  const q = getQueue();
  if (q.length === 0) return;
  console.log(`[Supabase] Flushing ${q.length} pending item(s)…`);

  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) await supabase.auth.refreshSession();
  } catch { /* proceed regardless */ }

  for (const item of q) {
    try {
      const staleState = JSON.parse(item.stateJson) as AppState;
      // A queued item can sit for minutes/hours — merge with whatever is on
      // Supabase NOW instead of blindly overwriting with this stale snapshot
      // (same class of bug the smartLoadAndSync merge fix addresses).
      const currentRemote = await loadStateFromSupabase(item.managerId);
      const stateToPush: AppState = currentRemote ? {
        ...currentRemote,
        users:            mergeById(staleState.users,            currentRemote.users),
        receipts:         mergeById(staleState.receipts,         currentRemote.receipts),
        archives:         mergeById(staleState.archives,         currentRemote.archives),
        companies:        mergeById(staleState.companies,        currentRemote.companies),
        subManagers:      mergeById(staleState.subManagers,      currentRemote.subManagers),
        attendanceLogs:   mergeById(staleState.attendanceLogs,   currentRemote.attendanceLogs),
        complaintTickets: mergeById(staleState.complaintTickets, currentRemote.complaintTickets),
        businessExpenses: mergeById(staleState.businessExpenses, currentRemote.businessExpenses),
      } : staleState;
      const ok = await upsertWithRetry(item.managerId, stateToPush, 2);
      if (!ok) console.warn('[Supabase] Flush failed for', item.managerId);
    } catch (e) {
      console.error('[Supabase] Flush parse error:', e);
    }
  }
};

// ─── Public: load from Supabase ───────────────────────────────────────────────
export const loadStateFromSupabase = async (managerId: string): Promise<AppState | null> => {
  if (!managerId) return null;
  try {
    // A real-auth sub-manager must never depend on a client-side managerId
    // guess or on direct RLS visibility of manager_data. Resolve the caller's
    // own parent mapping server-side and return only that parent's state.
    if (isRealAuthSubManagerSession()) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        const response = await fetch('/api/admin-maintenance?action=resolve-sub-manager-state', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const payload = await response.json().catch(() => ({}));
        if (response.ok && payload?.state) return payload.state as AppState;
        if (response.status >= 500) console.warn('[Supabase] Scoped sub-manager state resolver failed:', payload?.error);
      }
    }

    const { data, error } = await supabase
      .from('manager_data').select('data').eq('manager_id', managerId).maybeSingle();
    if (!error && data?.data) return data.data as AppState;

    // Fallback for sessions without a Supabase Auth JWT (e.g. sub-managers) —
    // RLS blocks the row-level select above for them, so use the scoped RPC instead.
    const { data: snapshot, error: rpcErr } = await supabase.rpc('get_manager_state_snapshot', {
      p_manager_id: managerId,
    });
    if (rpcErr) {
      // Admin suspended this account (see AdminDashboard.tsx suspend toggle) —
      // surface this distinctly so the caller can log the person out with a
      // clear message, instead of silently showing their last cached data
      // and leaving them confused about why nothing updates.
      if (rpcErr.message?.includes('ACCOUNT_SUSPENDED')) throw new Error('ACCOUNT_SUSPENDED');
      console.error('[Supabase] Load error:', rpcErr.message);
      return null;
    }
    return (snapshot as AppState) || null;
  } catch (err: any) {
    if (err?.message === 'ACCOUNT_SUSPENDED') throw err;
    console.error('[Supabase] Load exception:', err);
    return null;
  }
};

// ─── Merge helper: union arrays by id ─────────────────────────────────────────
// A stale tab/session pushing an old snapshot must NEVER be able to silently
// delete records (users/receipts/etc.) that already exist in the fresher copy.
// So instead of picking one side wholesale by timestamp, we union both sides
// by `id`. Real deletions still work fine through normal delete handlers
// (which save right after removing locally); this only protects against a
// stale background save clobbering newer records.
export const mergeById = <T extends { id?: string }>(a: T[] = [], b: T[] = []): T[] => {
  const map = new Map<string, T>();
  [...(a || []), ...(b || [])].forEach((item) => {
    if (item && (item as any).id) map.set((item as any).id, item);
  });
  return Array.from(map.values());
};

// ─── Public: smart sync on login ─────────────────────────────────────────────
export const smartLoadAndSync = async (
  managerId: string,
  localState: AppState,
  options?: { forceRemote?: boolean }
): Promise<AppState> => {
  const supabaseState = await loadStateFromSupabase(managerId);

  // BUG FIX: manager_data is ONE shared blob per manager, read by the manager
  // AND every one of their sub-managers, each from their own device with
  // their own local cache. The merge-by-id + "newer local wins" logic below
  // is correct for a single owner syncing their own device across sessions,
  // but for a shared blob it means any one agent's stale/offline local cache
  // gets merged back into — and even pushed onto — the data everyone else
  // reads. That's the "sub-managers see cached data instead of real-time
  // records" bug. Callers for shared-blob sessions (sub-managers) should
  // pass forceRemote: true to skip all merge/push-back and get the exact
  // current Supabase state, full stop. Local is only used as a last-resort
  // fallback if Supabase is unreachable, and is never written back in that
  // case.
  if (options?.forceRemote) {
    if (supabaseState) return supabaseState;
    console.warn('[Sync] forceRemote: Supabase unreachable, showing local cache read-only (not pushed back)');
    return localState;
  }

  const localUsers     = localState?.users?.length     || 0;
  const localReceipts  = localState?.receipts?.length  || 0;
  const remoteUsers    = supabaseState?.users?.length    || 0;
  const remoteReceipts = supabaseState?.receipts?.length || 0;
  const localScore     = localUsers  + localReceipts;
  const remoteScore    = remoteUsers + remoteReceipts;

  // Timestamp comparison — newer device wins
  const localTs  = new Date((localState as any)?._syncedAt || localStorage.getItem(`${managerId}_syncedAt`) || 0).getTime();
  const remoteTs = new Date((supabaseState as any)?._syncedAt || 0).getTime();

  console.log(`[Sync] Local: ${localUsers}u ${localReceipts}r ts=${new Date(localTs).toISOString()}`);
  console.log(`[Sync] Supabase: ${remoteUsers}u ${remoteReceipts}r ts=${new Date(remoteTs).toISOString()}`);

  // No Supabase data → use local and push
  if (!supabaseState || remoteScore === 0) {
    if (localScore > 0) await saveStateToSupabase(managerId, localState);
    return localState;
  }

  // ── Merge instead of blind overwrite ──────────────────────────────────────
  // Scalar/settings fields still follow "newer timestamp wins", but every
  // record array is unioned by id so neither side can silently erase records
  // the other side already has (this is what caused receipts to vanish).
  const base = remoteTs >= localTs ? supabaseState : localState;
  const merged: AppState = {
    ...base,
    users:                    mergeById(localState?.users,            supabaseState.users),
    receipts:                 mergeById(localState?.receipts,         supabaseState.receipts),
    archives:                 mergeById(localState?.archives,         supabaseState.archives),
    companies:                mergeById(localState?.companies,        supabaseState.companies),
    subManagers:              mergeById(localState?.subManagers,      supabaseState.subManagers),
    attendanceLogs:           mergeById(localState?.attendanceLogs,   supabaseState.attendanceLogs),
    complaintTickets:         mergeById(localState?.complaintTickets, supabaseState.complaintTickets),
    businessExpenses:         mergeById(localState?.businessExpenses, supabaseState.businessExpenses),
    activeCompanyId:          base.activeCompanyId || '',
    dismissedNotificationIds: Array.from(new Set([...(localState?.dismissedNotificationIds || []), ...(supabaseState.dismissedNotificationIds || [])])),
    currentManager:           managerId,
  };

  const mergedUsers = merged.users?.length || 0;
  const mergedReceipts = merged.receipts?.length || 0;
  const recovered = mergedUsers !== remoteUsers || mergedReceipts !== remoteReceipts;

  if (recovered) {
    console.log(`[Sync] 🔧 Merge recovered records — Supabase had ${remoteUsers}u/${remoteReceipts}r, merged has ${mergedUsers}u/${mergedReceipts}r`);
  } else {
    console.log(remoteTs >= localTs ? '[Sync] ✅ Using Supabase (newer)' : '[Sync] ✅ Using Local (newer)');
  }

  // Push merged state back if it differs from what Supabase currently has, or
  // if local was newer — this keeps both sides converged instead of drifting.
  if (recovered || localTs > remoteTs) {
    await saveStateToSupabase(managerId, merged);
  }
  return merged;
};
