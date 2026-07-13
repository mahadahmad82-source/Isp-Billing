import React, { useEffect, useState } from 'react';
import { verifyBiometric } from '../utils/webauthn';
import { logoBase64 } from '../utils/logoBase64';

interface BiometricLockScreenProps {
  username: string;
  businessName?: string;
  // Called once the fingerprint itself is verified. Return `false` to show a
  // "login failed" error and let the person retry; return true/void to treat
  // it as fully successful (the parent is expected to swap this screen out).
  onUnlock: () => void | boolean | Promise<void | boolean>;
  onUsePassword: () => void;
  usePasswordLabel?: string;
}

const FingerprintIcon: React.FC<{ className?: string }> = ({ className = 'w-8 h-8' }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 11c0 3.517-1.009 6.799-2.753 9.571M17 13.5c0 2.4-.5 4.5-1.5 6.5M4.5 16.5c.5-2 .5-3.5.5-5.5a7 7 0 0114 0c0 .5 0 1-.1 1.9M9 11a3 3 0 116 0c0 1.5-.2 3-.6 4.5M6.5 20c1-1.7 1.5-3.3 1.9-5" />
  </svg>
);

// Dedicated, full-screen biometric gate — modelled on how banking apps greet
// you: the app opens straight into this (no login form flashes first), the
// OS fingerprint prompt fires immediately, and only on failure/decline does
// a fallback to manual login appear.
const BiometricLockScreen: React.FC<BiometricLockScreenProps> = ({ username, businessName, onUnlock, onUsePassword, usePasswordLabel = 'Use Password Instead' }) => {
  const [status, setStatus] = useState<'idle' | 'checking' | 'signing-in' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const attempt = async () => {
    setStatus('checking');
    setErrorMsg('');
    const verified = await verifyBiometric(username);
    if (!verified) {
      setStatus('error');
      setErrorMsg('Fingerprint verification failed. Please try again.');
      return;
    }
    setStatus('signing-in');
    const result = await onUnlock();
    if (result === false) {
      setStatus('error');
      setErrorMsg('There was a problem logging in. Please try again.');
    }
    // result === true/undefined → parent is expected to navigate away; stay
    // on "signing-in" so there's no flicker back to the unlock button.
  };

  useEffect(() => {
    attempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy = status === 'checking' || status === 'signing-in';

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#020617' }}>
      <div className="w-full max-w-sm rounded-[2rem] p-8 text-center"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', backdropFilter: 'blur(28px)' }}>
        {logoBase64 && <img src={logoBase64} alt="Bill Collector" className="w-[100px] h-auto object-contain mx-auto mb-6" />}
        <div className={`w-24 h-24 mx-auto rounded-full flex items-center justify-center mb-5 transition-all ${busy ? 'animate-pulse' : ''}`}
          style={{ background: 'rgba(99,102,241,0.15)', boxShadow: busy ? '0 0 0 8px rgba(99,102,241,0.08)' : 'none' }}>
          <FingerprintIcon className="w-12 h-12 text-indigo-400" />
        </div>
        <h2 className="text-xl font-black text-white mb-1">{businessName || username}</h2>
        <p className="text-xs text-slate-400 font-medium mb-6">
          {status === 'signing-in' ? 'Signing in…' : `@${username} — unlock with fingerprint`}
        </p>
        {errorMsg && <p className="text-rose-400 text-[11px] font-bold mb-4">{errorMsg}</p>}
        <button onClick={attempt} disabled={busy}
          className="w-full py-4 rounded-2xl font-black text-sm uppercase tracking-[0.2em] text-white transition-all active:scale-95 mb-3 disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #06b6d4 100%)' }}>
          {status === 'checking' ? 'Verifying…' : status === 'signing-in' ? 'Signing in…' : 'Unlock with Fingerprint'}
        </button>
        <button onClick={onUsePassword} disabled={status === 'signing-in'}
          className="text-[10px] font-bold text-slate-500 hover:text-indigo-400 uppercase tracking-widest transition-colors disabled:opacity-40">
          {usePasswordLabel}
        </button>
      </div>
    </div>
  );
};

export default BiometricLockScreen;
