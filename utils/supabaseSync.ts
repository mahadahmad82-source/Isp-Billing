import { supabase } from '../lib/supabase';
import { AppState } from '../types';

// ─── Sync status broadcast ────────────────────────────────────────────────────
export type SyncStatus = 'idle' | 'saving' | 'saved' | 'failed' | 'retrying';
type StatusListener = (s: SyncStatus) => void;
const listeners: StatusListener[] = [];
export const onSyncStatus = (fn: StatusListener) => { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i > -1) listeners.splice(i, 1); }; };
const emit = (s: SyncStatus) => listeners.forEach(fn => fn(s));

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
  const stateWithTs = { ...state, _syncedAt: new Date().toISOString() };
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      emit(attempt === 1 ? 'saving' : 'retrying');
      const { error } = await supabase
        .from('manager_data')
        .upsert(
          { manager_id: managerId, data: stateWithTs, updated_at: stateWithTs._syncedAt },
          { onConflict: 'manager_id' }
        );
      if (!error) {
        localStorage.setItem(`${managerId}_syncedAt`, stateWithTs._syncedAt);
        dequeue(managerId);
        emit('saved');
        console.log(`[Supabase] ✅ Saved (attempt ${attempt})`);
        return true;
      }
      console.error(`[Supabase] Attempt ${attempt} error:`, error.message);
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
  if (!managerId) return;

  const userCount    = state?.users?.length    || 0;
  const receiptCount = state?.receipts?.length || 0;

  // Safety: never overwrite real DB data with empty state
  if (userCount === 0 && receiptCount === 0) {
    try {
      const { data: existing } = await supabase
        .from('manager_data').select('data').eq('manager_id', managerId).maybeSingle();
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
  const q = getQueue();
  if (q.length === 0) return;
  console.log(`[Supabase] Flushing ${q.length} pending item(s)…`);
  for (const item of q) {
    try {
      const state = JSON.parse(item.stateJson) as AppState;
      const ok = await upsertWithRetry(item.managerId, state, 2);
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
    const { data, error } = await supabase
      .from('manager_data').select('data').eq('manager_id', managerId).maybeSingle();
    if (!error && data?.data) return data.data as AppState;

    // Fallback for sessions without a Supabase Auth JWT (e.g. sub-managers) —
    // RLS blocks the row-level select above for them, so use the scoped RPC instead.
    const { data: snapshot, error: rpcErr } = await supabase.rpc('get_manager_state_snapshot', {
      p_manager_id: managerId,
    });
    if (rpcErr) { console.error('[Supabase] Load error:', rpcErr.message); return null; }
    return (snapshot as AppState) || null;
  } catch (err) {
    console.error('[Supabase] Load exception:', err);
    return null;
  }
};

// ─── Public: smart sync on login ─────────────────────────────────────────────
export const smartLoadAndSync = async (
  managerId: string,
  localState: AppState
): Promise<AppState> => {
  const supabaseState = await loadStateFromSupabase(managerId);

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

  // Supabase is newer or equal → use Supabase
  if (remoteTs >= localTs) {
    console.log('[Sync] ✅ Using Supabase (newer)');
    return {
      ...supabaseState,
      users:                    supabaseState.users                    || [],
      receipts:                 supabaseState.receipts                 || [],
      archives:                 supabaseState.archives                 || [],
      companies:                supabaseState.companies                || [],
      subManagers:              supabaseState.subManagers              || [],
      attendanceLogs:           supabaseState.attendanceLogs           || [],
      complaintTickets:         supabaseState.complaintTickets         || [],
      businessExpenses:         supabaseState.businessExpenses         || [],
      activeCompanyId:          supabaseState.activeCompanyId          || '',
      dismissedNotificationIds: supabaseState.dismissedNotificationIds || [],
      currentManager:           managerId,
    };
  }

  // Local is newer → push to Supabase
  console.log('[Sync] ✅ Using Local (newer) — pushing to Supabase');
  await saveStateToSupabase(managerId, localState);
  return localState;
};
