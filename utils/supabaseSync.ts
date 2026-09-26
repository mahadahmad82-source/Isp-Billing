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

// ─── Circuit breaker (see saveStateToSupabaseImmediate) ───────────────────────
let consecutiveFullFailures = 0;
let circuitOpenUntil = 0; // epoch ms; 0 = closed
const CIRCUIT_TRIP_THRESHOLD = 3; // 3 separate calls each exhausting all attempts
const CIRCUIT_COOLDOWN_MS = 30000;

// ─── Pending queue (survives page reload) ────────────────────────────────────
const QUEUE_KEY = '__supabase_pending_sync__';
interface PendingItem { managerId: string; stateJson: string; ts: string; attempts?: number; }

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
        consecutiveFullFailures = 0;
        circuitOpenUntil = 0;
        emit('saved');
        console.log(`[Supabase] ✅ Saved (attempt ${attempt})`);
        // Egress migration stage 2 (Sep 2026): dual-write receipts into their
        // own indexed table via save_receipts RPC, alongside the existing
        // blob save — read paths still use state.receipts unchanged, this
        // only builds up the new table so stage 3 can switch reads off the
        // ~1MB blob. Fire-and-forget: must never block/slow the real save,
        // and a dropped dual-write here just means the next successful save
        // (or a re-run of the stage-1 backfill) catches it up.
        if (Array.isArray(stateWithTs.receipts) && stateWithTs.receipts.length > 0) {
          supabase.rpc('save_receipts', { p_manager_id: managerId, p_receipts: stateWithTs.receipts })
            .then(({ error: recErr }: { error: any }) => { if (recErr) console.error('[Supabase] receipts dual-write failed:', recErr.message); })
            .catch((err: any) => console.error('[Supabase] receipts dual-write exception:', err));
        }
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
  consecutiveFullFailures++;
  if (consecutiveFullFailures >= CIRCUIT_TRIP_THRESHOLD) {
    circuitOpenUntil = Date.now() + CIRCUIT_COOLDOWN_MS;
    console.warn(`[Supabase] Circuit breaker tripped — pausing live attempts for ${CIRCUIT_COOLDOWN_MS / 1000}s`);
  }
  emit('failed');
  return false;
};

// ─── Public: save state — IMMEDIATE (no debounce) ─────────────────────────────
// Used internally by smartLoadAndSync (login-time merge — correctness matters
// more than write-coalescing here, and it only runs once per login, not on
// every keystroke) and exported for any future caller that genuinely needs to
// know the write finished before proceeding.
export const saveStateToSupabaseImmediate = async (managerId: string, state: AppState): Promise<void> => {
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

  // Circuit breaker: if the DB has been failing repeatedly (e.g. an outage
  // like Sep 13 2026's disk-IO exhaustion), stop hammering it with fresh
  // attempts + retries for a cool-off window — every blocked attempt still
  // queues normally, so nothing is lost, it just waits instead of piling on.
  if (Date.now() < circuitOpenUntil) {
    console.warn('[Supabase] Circuit open — skipping live attempt, queuing instead');
    enqueue(managerId, state);
    return;
  }

  const ok = await upsertWithRetry(managerId, state, 3);
  if (!ok) enqueue(managerId, state); // queue for later retry
};

// ─── Debounce layer ────────────────────────────────────────────────────────────
// App.tsx calls saveStateToSupabase on ~50 different actions, fire-and-forget,
// with no debounce — a burst of quick edits was firing one full ~2MB blob
// upsert per action. This collapses rapid-fire calls per manager into a single
// write after a short quiet period, without changing behavior for any caller
// (none of them await the result or depend on write timing).
const DEBOUNCE_MS = 2000;
const pendingDebounce = new Map<string, { state: AppState; timer: ReturnType<typeof setTimeout> }>();

const runDebouncedFlush = (managerId: string) => {
  const entry = pendingDebounce.get(managerId);
  if (!entry) return;
  pendingDebounce.delete(managerId);
  void saveStateToSupabaseImmediate(managerId, entry.state);
};

// Force-flush anything still pending — called on tab hide / page unload so a
// quick action-then-navigate-away doesn't lose the debounce window. The state
// is already safe in localStorage via saveState() at the call site either way;
// this only affects how fresh the *remote* copy is.
export const flushAllDebouncedSaves = (): void => {
  for (const managerId of Array.from(pendingDebounce.keys())) runDebouncedFlush(managerId);
};

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', flushAllDebouncedSaves);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAllDebouncedSaves();
  });
}

// ─── Public: save state (debounced) ────────────────────────────────────────────
export const saveStateToSupabase = async (managerId: string, state: AppState): Promise<void> => {
  if (!managerId || isRealAuthSubManagerSession()) return;
  const existing = pendingDebounce.get(managerId);
  if (existing) clearTimeout(existing.timer);
  const timer = setTimeout(() => runDebouncedFlush(managerId), DEBOUNCE_MS);
  pendingDebounce.set(managerId, { state, timer });
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

  // A queue item that still can't save after this many flush cycles is
  // permanently stuck — e.g. leftover from a manager_id this session/device
  // doesn't own (switched accounts on a shared device, old test login, etc.),
  // which RLS will block forever. Retrying it every 45s indefinitely was
  // burning a full GET+POST cycle on a doomed request forever. Bound it.
  const MAX_FLUSH_ATTEMPTS = 10;
  for (const item of q) {
    try {
      const staleState = JSON.parse(item.stateJson) as AppState;
      // A queued item can sit for minutes/hours — merge with whatever is on
      // Supabase NOW instead of blindly overwriting with this stale snapshot
      // (same class of bug the smartLoadAndSync merge fix addresses).
      const currentRemote = await loadStateFromSupabase(item.managerId);
      const deletedUserIds = Array.from(new Set([...(staleState.deletedUserIds || []), ...(currentRemote?.deletedUserIds || [])]));
      const deletedReceiptIds = Array.from(new Set([...(staleState.deletedReceiptIds || []), ...(currentRemote?.deletedReceiptIds || [])]));
      const stateToPush: AppState = currentRemote ? {
        ...currentRemote,
        users:            mergeById(staleState.users,            currentRemote.users).filter(u => !deletedUserIds.includes(u.id!)),
        receipts:         mergeById(staleState.receipts,         currentRemote.receipts).filter(r => !deletedReceiptIds.includes(r.id!)),
        archives:         mergeById(staleState.archives,         currentRemote.archives),
        companies:        mergeById(staleState.companies,        currentRemote.companies),
        subManagers:      mergeById(staleState.subManagers,      currentRemote.subManagers),
        attendanceLogs:   mergeById(staleState.attendanceLogs,   currentRemote.attendanceLogs),
        complaintTickets: mergeById(staleState.complaintTickets, currentRemote.complaintTickets),
        teamMessages: mergeById(staleState.teamMessages, currentRemote.teamMessages),
        businessExpenses: mergeById(staleState.businessExpenses, currentRemote.businessExpenses),
        deletedUserIds,
        deletedReceiptIds,
      } : staleState;
      const ok = await upsertWithRetry(item.managerId, stateToPush, 2);
      if (!ok) {
        const attempts = (item.attempts || 0) + 1;
        if (attempts >= MAX_FLUSH_ATTEMPTS) {
          console.error(`[Supabase] Giving up on stuck queue item for ${item.managerId} after ${attempts} failed flushes — dropping (this session likely doesn't own that manager_id)`);
          dequeue(item.managerId);
        } else {
          setQueue(getQueue().map(x => x.managerId === item.managerId ? { ...x, attempts } : x));
          console.warn('[Supabase] Flush failed for', item.managerId, `(attempt ${attempts}/${MAX_FLUSH_ATTEMPTS})`);
        }
      }
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
    //
    // Deliberately NOT gated on isRealAuthSubManagerSession() (a local flag
    // read from localStorage) — that flag can be true/false out of sync with
    // reality across devices/browsers/timing, and when it's wrong this whole
    // scoped path silently gets skipped with no error, producing an empty
    // dataset. auth.uid() on the server is the only authoritative source of
    // "is this actually a sub-manager". So: if a Supabase session exists at
    // all, always ask the server first. For a real manager session this
    // costs one cheap 403 (caller.role !== 'sub-manager') before falling
    // through to the normal path below — negligible.
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        const response = await fetch('/api/admin-maintenance?action=resolve-sub-manager-state', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (response.status !== 403) {
          const payload = await response.json().catch(() => ({}));
          if (response.ok && payload?.state) return payload.state as AppState;
          if (response.status >= 500) console.warn('[Supabase] Scoped sub-manager state resolver failed:', payload?.error);
        }
      }
    } catch (e) {
      console.warn('[Supabase] Scoped sub-manager state resolver threw:', e);
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

// ─── Public: cheap remote-changed check ───────────────────────────────────────
// Egress fix: the periodic tab-visibility/focus/90s pull in App.tsx used to call
// smartLoadAndSync unconditionally, which pulls the ENTIRE manager_data JSONB
// blob (900KB-2MB+ for an active manager) every single time, even when nothing
// changed remotely. This reads only the tiny `updated_at` scalar column first
// so the caller can skip the full pull entirely on the (very common) no-op case.
// Returns null if the row doesn't exist yet or the check fails — callers should
// treat null as "unknown, proceed with the full pull" to preserve old behavior.
export const getRemoteUpdatedAt = async (managerId: string): Promise<string | null> => {
  if (!managerId) return null;
  try {
    const { data, error } = await supabase
      .from('manager_data').select('updated_at').eq('manager_id', managerId).maybeSingle();
    if (error || !data?.updated_at) return null;
    return data.updated_at as string;
  } catch {
    return null;
  }
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
    if (localScore > 0) await saveStateToSupabaseImmediate(managerId, localState);
    return localState;
  }

  // ── Merge instead of blind overwrite ──────────────────────────────────────
  // Scalar/settings fields still follow "newer timestamp wins", but every
  // record array is unioned by id so neither side can silently erase records
  // the other side already has (this is what caused receipts to vanish).
  const base = remoteTs >= localTs ? supabaseState : localState;
  const deletedUserIds = Array.from(new Set([...(localState?.deletedUserIds || []), ...(supabaseState.deletedUserIds || [])]));
  const deletedReceiptIds = Array.from(new Set([...(localState?.deletedReceiptIds || []), ...(supabaseState.deletedReceiptIds || [])]));
  const merged: AppState = {
    ...base,
    users:                    mergeById(localState?.users,            supabaseState.users).filter(u => !deletedUserIds.includes(u.id!)),
    receipts:                 mergeById(localState?.receipts,         supabaseState.receipts).filter(r => !deletedReceiptIds.includes(r.id!)),
    archives:                 mergeById(localState?.archives,         supabaseState.archives),
    companies:                mergeById(localState?.companies,        supabaseState.companies),
    subManagers:              mergeById(localState?.subManagers,      supabaseState.subManagers),
    attendanceLogs:           mergeById(localState?.attendanceLogs,   supabaseState.attendanceLogs),
    complaintTickets:         mergeById(localState?.complaintTickets, supabaseState.complaintTickets),
    teamMessages:             mergeById(localState?.teamMessages, supabaseState.teamMessages),
    businessExpenses:         mergeById(localState?.businessExpenses, supabaseState.businessExpenses),
    deletedUserIds,
    deletedReceiptIds,
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
    await saveStateToSupabaseImmediate(managerId, merged);
  }
  return merged;
};

