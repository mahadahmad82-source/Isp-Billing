import React, { useCallback, useEffect, useState } from 'react';
import { getWabotAuthHeaders } from '../utils/whatsapp';

interface LinkedSession {
  token: string;
  browser: string;
  os: string;
  label: string;
  lastActiveAt: string;
  approvedAt?: string;
  username?: string;
}

const timeAgo = (iso?: string) => {
  if (!iso) return 'unknown';
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

// Linked-device management, mirroring Android's Linked Devices screen:
// list the web sessions logged into this account and log any of them out
// remotely. (The QR "link a device" scan lives on Android — the phone scans,
// the web session is what gets linked.)
const WABotLinkedDevices: React.FC = () => {
  const [sessions, setSessions] = useState<LinkedSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revoking, setRevoking] = useState<string | null>(null);
  // ── Silk P2: native window.confirm replaced with a Silk confirm sheet ──
  const [confirming, setConfirming] = useState<LinkedSession | null>(null);
  const [confirmError, setConfirmError] = useState('');

  const openConfirm = (s: LinkedSession) => {
    setConfirmError('');
    setConfirming(s);
  };

  // Escape dismisses the confirm sheet
  useEffect(() => {
    if (!confirming) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setConfirming(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirming]);

  const load = useCallback(async () => {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/wabot-pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getWabotAuthHeaders()) },
        body: JSON.stringify({ action: 'list' }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(d?.error || 'Could not load linked sessions.');
        setSessions([]);
        return;
      }
      setSessions(Array.isArray(d.sessions) ? d.sessions : []);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const revoke = async (token: string) => {
    setConfirmError('');
    setRevoking(token);
    try {
      const res = await fetch('/api/wabot-pair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getWabotAuthHeaders()) },
        body: JSON.stringify({ action: 'revoke', token }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error || 'Please try again.');
      setSessions(prev => prev.filter(s => s.token !== token));
      setConfirming(null);
    } catch (e: any) {
      // Sheet stays open with the error inline so the user can retry or cancel
      setConfirmError(e?.message || 'Could not log out this device.');
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="flex-1 min-h-0 bg-[var(--nb-surface-1)] rounded-2xl border border-[var(--nb-border)] overflow-y-auto p-4 sm:p-6 custom-scrollbar">
      <h4 className="text-[10px] font-black uppercase tracking-widest text-[var(--nb-text-2)]">Linked web sessions</h4>
      <p className="text-[11px] text-[var(--nb-text-2)] font-semibold mt-1 mb-4">
        These browsers are logged into NetBot Web with this account. Log one out remotely anytime.
      </p>

      {loading ? (
        <div className="flex justify-center py-16">
          <span className="w-8 h-8 rounded-full border-[3px] border-[var(--nb-accent)] border-t-transparent animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-10">
          <p className="text-sm font-bold text-[var(--nb-danger)]">{error}</p>
          <button onClick={load} className="mt-3 px-5 min-h-[44px] rounded-full bg-[var(--nb-accent)] text-white text-xs font-black uppercase tracking-widest">Retry</button>
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-center text-sm font-bold text-[var(--nb-text-2)] py-16">No other linked browsers.</p>
      ) : (
        <div className="space-y-2.5">
          {sessions.map(s => (
            <div key={s.token} className="flex items-center gap-3 p-3.5 rounded-2xl border border-[var(--nb-border)] bg-[var(--nb-surface-2)]">
              <span className="w-10 h-10 rounded-xl bg-[var(--nb-accent-soft)] flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-[var(--nb-accent)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-[var(--nb-text-1)] truncate">{s.label || `${s.browser} · ${s.os}`}</p>
                <p className="text-[11px] font-bold text-[var(--nb-text-2)]">
                  Last active {timeAgo(s.lastActiveAt)}{s.username ? ` · ${s.username}` : ''}
                </p>
              </div>
              <button
                onClick={() => openConfirm(s)}
                className="text-xs font-black uppercase tracking-widest text-[var(--nb-danger)] hover:underline flex-shrink-0 min-h-[44px] px-1"
              >
                Log out
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 mt-6 p-4 rounded-2xl bg-[var(--nb-surface-2)] border border-[var(--nb-border)]">
        <svg className="w-5 h-5 flex-shrink-0 text-[var(--nb-text-2)]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <p className="text-[11px] font-semibold text-[var(--nb-text-2)]">
          To link a new device, open NetBot Web on it and scan the login QR with the Android app's Linked Devices screen.
        </p>
      </div>

      {/* ── Silk confirm sheet (replaces window.confirm): scrim overlay,
          surface-1 card with 16px radius, Cancel / Log out actions.
          Dismisses on backdrop click or Escape. ── */}
      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--nb-scrim)]"
          onClick={() => setConfirming(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Confirm log out"
        >
          <div
            className="w-full max-w-sm bg-[var(--nb-surface-1)] rounded-2xl p-4 border border-[var(--nb-border)]"
            onClick={e => e.stopPropagation()}
          >
            <h5 className="text-[17px] font-semibold text-[var(--nb-text-1)]">Log out this session?</h5>
            <p className="mt-1 text-[15px] text-[var(--nb-text-2)]">
              Log out &ldquo;{confirming.label || 'this device'}&rdquo; from NetBot Web? It will need to scan the QR code again to sign back in.
            </p>
            {confirmError && (
              <p className="mt-2 text-[13px] font-semibold text-[var(--nb-danger)]">{confirmError}</p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className="flex-1 min-h-[48px] rounded-full bg-[var(--nb-surface-3)] text-[var(--nb-text-1)] text-[15px] font-semibold active:scale-[0.97] transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={revoking === confirming.token}
                onClick={() => revoke(confirming.token)}
                className="flex-1 min-h-[48px] rounded-full bg-[var(--nb-danger)] text-white text-[15px] font-semibold disabled:opacity-45 active:scale-[0.97] transition-all"
              >
                {revoking === confirming.token ? 'Logging out…' : 'Log out'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WABotLinkedDevices;
