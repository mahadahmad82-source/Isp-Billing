import React, { useEffect, useState } from 'react';
import { verifyBiometric } from '../utils/webauthn';
import { logoBase64 } from '../utils/logoBase64';

interface BiometricLockScreenProps {
  username: string;
  onUnlock: () => void;
  onUsePassword: () => void;
}

const FingerprintIcon: React.FC<{ className?: string }> = ({ className = 'w-8 h-8' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 11c0 3.517-1.009 6.799-2.753 9.571M17 13.5c0 2.4-.5 4.5-1.5 6.5M4.5 16.5c.5-2 .5-3.5.5-5.5a7 7 0 0114 0c0 .5 0 1-.1 1.9M9 11a3 3 0 116 0c0 1.5-.2 3-.6 4.5M6.5 20c1-1.7 1.5-3.3 1.9-5" />
  </svg>
);

// App-open gate: shown whenever a session is already active (auto-login) but
// the account has fingerprint login enabled. Dashboard only renders once
// verifyBiometric() succeeds here.
const BiometricLockScreen: React.FC<BiometricLockScreenProps> = ({ username, onUnlock, onUsePassword }) => {
  const [status, setStatus] = useState<'idle' | 'checking' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const attempt = async () => {
    setStatus('checking');
    setErrorMsg('');
    const ok = await verifyBiometric(username);
    if (ok) { onUnlock(); return; }
    setStatus('error');
    setErrorMsg('Fingerprint verify nahi hua. Dobara try karein.');
  };

  useEffect(() => {
    attempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#020617' }}>
      <div className="w-full max-w-sm rounded-[2rem] p-8 text-center"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(28px)' }}>
        {logoBase64 && <img src={logoBase64} alt="Bill Collector" className="w-[100px] h-auto object-contain mx-auto mb-6" />}
        <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-5 ${status === 'checking' ? 'animate-pulse' : ''}`}
          style={{ background: 'rgba(99,102,241,0.15)' }}>
          <FingerprintIcon className="w-10 h-10 text-indigo-400" />
        </div>
        <h2 className="text-xl font-black text-white mb-1">App Locked</h2>
        <p className="text-xs text-slate-400 font-medium mb-6">@{username} — fingerprint se unlock karein</p>
        {errorMsg && <p className="text-rose-400 text-[11px] font-bold mb-4">{errorMsg}</p>}
        <button onClick={attempt} disabled={status === 'checking'}
          className="w-full py-4 rounded-2xl font-black text-sm uppercase tracking-[0.2em] text-white transition-all active:scale-95 mb-3 disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #06b6d4 100%)' }}>
          {status === 'checking' ? 'Verifying…' : 'Unlock with Fingerprint'}
        </button>
        <button onClick={onUsePassword} className="text-[10px] font-bold text-slate-500 hover:text-indigo-400 uppercase tracking-widest transition-colors">
          Use Password Instead
        </button>
      </div>
    </div>
  );
};

export default BiometricLockScreen;
