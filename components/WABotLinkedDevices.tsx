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

  const revoke = async (token: string, label: string) => {
    if (!window.confirm(`Log out "${label}" from NetBot Web?`)) return;
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
    } catch (e: any) {
      setError(e?.message || 'Could not log out this device.');
    } finally {
      setRevoking(null);
    }
  };

  return (
    <div className="flex-1 min-h-0 bg-white dark:bg-[#111B21] rounded-2xl border border-[#E9EDEF] dark:border-[#222D34] overflow-y-auto p-4 sm:p-6 custom-scrollbar">
      <h4 className="text-[10px] font-black uppercase tracking-widest text-[#667781] dark:text-[#8696A0]">Linked web sessions</h4>
      <p className="text-[11px] text-[#667781] dark:text-[#8696A0] font-semibold mt-1 mb-4">
        These browsers are logged into NetBot Web with this account. Log one out remotely anytime.
      </p>

      {loading ? (
        <div className="flex justify-center py-16">
          <span className="w-8 h-8 rounded-full border-[3px] border-[#00A884] border-t-transparent animate-spin" />
        </div>
      ) : error ? (
        <div className="text-center py-10">
          <p className="text-sm font-bold text-rose-500">{error}</p>
          <button onClick={load} className="mt-3 px-4 py-2 rounded-xl bg-[#00A884] text-white text-xs font-black uppercase tracking-widest">Retry</button>
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-center text-sm font-bold text-[#667781] dark:text-[#8696A0] py-16">No other linked browsers.</p>
      ) : (
        <div className="space-y-2.5">
          {sessions.map(s => (
            <div key={s.token} className="flex items-center gap-3 p-3.5 rounded-2xl border border-[#E9EDEF] dark:border-[#222D34] bg-[#F0F2F5]/60 dark:bg-[#202C33]/40">
              <span className="w-10 h-10 rounded-xl bg-[#00A884]/15 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-[#00A884]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-black text-[#111B21] dark:text-[#E9EDEF] truncate">{s.label || `${s.browser} · ${s.os}`}</p>
                <p className="text-[11px] font-bold text-[#667781] dark:text-[#8696A0]">
                  Last active {timeAgo(s.lastActiveAt)}{s.username ? ` · ${s.username}` : ''}
                </p>
              </div>
              <button
                onClick={() => revoke(s.token, s.label || 'this device')}
                disabled={revoking === s.token}
                className="text-xs font-black uppercase tracking-widest text-rose-500 hover:underline disabled:opacity-50 flex-shrink-0"
              >
                {revoking === s.token ? 'Working…' : 'Log out'}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 mt-6 p-4 rounded-2xl bg-[#F0F2F5]/60 dark:bg-[#202C33]/40 border border-[#E9EDEF] dark:border-[#222D34]">
        <svg className="w-5 h-5 flex-shrink-0 text-[#667781] dark:text-[#8696A0]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        <p className="text-[11px] font-semibold text-[#667781] dark:text-[#8696A0]">
          To link a new device, open NetBot Web on it and scan the login QR with the Android app's Linked Devices screen.
        </p>
      </div>
    </div>
  );
};

export default WABotLinkedDevices;
