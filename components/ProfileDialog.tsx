import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

interface ProfileDialogProps {
  isOpen: boolean;
  onClose: () => void;
  businessName: string;
  username: string;
  onLogout: () => void;
  theme: 'light' | 'dark';
}

const ProfileDialog: React.FC<ProfileDialogProps> = ({
  isOpen, onClose, businessName, username, onLogout, theme
}) => {
  const [tab, setTab] = useState<'profile' | 'security' | 'session'>('profile');
  const [profile, setProfile] = useState<{ email: string; role: string; created_at: string } | null>(null);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Load profile on open
  useEffect(() => {
    if (!isOpen) return;
    setTab('profile');
    setPwdError(''); setPwdSuccess('');
    setOldPwd(''); setNewPwd(''); setConfirmPwd('');
    loadProfile();
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setProfile({
          email: user.email || '',
          role: user.email === 'admin@myisp.local' ? 'Admin' : 'Manager',
          created_at: user.created_at,
        });
      }
    } catch {}
  };

  const handleChangePassword = async () => {
    setPwdError(''); setPwdSuccess('');

    if (!oldPwd.trim() || !newPwd.trim() || !confirmPwd.trim()) {
      setPwdError('Sab fields fill karein.'); return;
    }
    if (newPwd !== confirmPwd) {
      setPwdError('New aur Confirm password match nahi karte!'); return;
    }
    if (newPwd.length < 6) {
      setPwdError('Password kam az kam 6 characters ka hona chahiye.'); return;
    }
    if (oldPwd === newPwd) {
      setPwdError('New password purane se alag hona chahiye.'); return;
    }

    setLoading(true);
    try {
      // Step 1: Verify current password by attempting sign-in
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('Session expired. Please login again.');

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: oldPwd,
      });
      if (signInError) {
        setPwdError('Current password galat hai!');
        setLoading(false);
        return;
      }

      // Step 2: Update to new password
      const { error: updateError } = await supabase.auth.updateUser({ password: newPwd });
      if (updateError) throw updateError;

      setPwdSuccess('Password successfully update ho gaya! ✅');
      setOldPwd(''); setNewPwd(''); setConfirmPwd('');
    } catch (err: any) {
      setPwdError(err.message || 'Password update fail hua.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const isDark = theme === 'dark';

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-md" />

      {/* Dialog */}
      <div className={`relative z-10 w-full max-w-md rounded-3xl shadow-2xl border overflow-hidden ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}>

        {/* Header */}
        <div className={`px-6 pt-6 pb-4 ${isDark ? 'bg-slate-800' : 'bg-indigo-600'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center font-black text-white text-xl">
                {businessName?.charAt(0)?.toUpperCase() || 'M'}
              </div>
              <div>
                <p className="font-black text-white text-base leading-tight">{businessName}</p>
                <p className="text-white/60 text-xs">@{username}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4 bg-white/10 rounded-xl p-1">
            {(['profile', 'security', 'session'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${tab === t ? 'bg-white text-indigo-600 shadow' : 'text-white/70 hover:text-white'}`}>
                {t === 'profile' ? '👤 Profile' : t === 'security' ? '🔐 Security' : '🚪 Session'}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="p-6">

          {/* PROFILE TAB */}
          {tab === 'profile' && (
            <div className="space-y-4">
              {[
                { label: 'Business Name', value: businessName, icon: '🏢' },
                { label: 'Username', value: `@${username}`, icon: '👤' },
                { label: 'Email', value: profile?.email || '...', icon: '📧' },
                { label: 'Role', value: profile?.role || '...', icon: '🎯' },
                { label: 'Member Since', value: profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-PK', { dateStyle: 'long' }) : '...', icon: '📅' },
              ].map(item => (
                <div key={item.label} className={`flex items-center gap-3 p-3 rounded-2xl ${isDark ? 'bg-slate-800' : 'bg-slate-50'}`}>
                  <span className="text-lg flex-shrink-0">{item.icon}</span>
                  <div className="min-w-0">
                    <p className={`text-[9px] font-black uppercase tracking-widest ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>{item.label}</p>
                    <p className={`text-sm font-bold truncate ${isDark ? 'text-white' : 'text-slate-800'}`}>{item.value}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* SECURITY TAB */}
          {tab === 'security' && (
            <div className="space-y-4">
              <p className={`text-xs font-bold ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                Password change karne ke liye pehle current password verify hoga.
              </p>

              {[
                { label: 'Current Password', value: oldPwd, setter: setOldPwd, placeholder: 'Purana password' },
                { label: 'New Password', value: newPwd, setter: setNewPwd, placeholder: 'Naya password (min 6 chars)' },
                { label: 'Confirm New Password', value: confirmPwd, setter: setConfirmPwd, placeholder: 'Naya password dobara likhein' },
              ].map(field => (
                <div key={field.label}>
                  <label className={`text-[9px] font-black uppercase tracking-widest block mb-1.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    {field.label}
                  </label>
                  <input
                    type="password"
                    placeholder={field.placeholder}
                    value={field.value}
                    onChange={e => { field.setter(e.target.value); setPwdError(''); setPwdSuccess(''); }}
                    className={`w-full px-4 py-3 rounded-2xl border text-sm outline-none focus:ring-2 focus:ring-indigo-400 ${isDark ? 'bg-slate-800 border-slate-600 text-white placeholder-slate-500' : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400'}`}
                  />
                </div>
              ))}

              {pwdError && (
                <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-2xl">
                  <svg className="w-4 h-4 text-rose-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  <p className="text-xs font-bold text-rose-600">{pwdError}</p>
                </div>
              )}
              {pwdSuccess && (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl">
                  <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"/></svg>
                  <p className="text-xs font-bold text-emerald-600">{pwdSuccess}</p>
                </div>
              )}

              <button onClick={handleChangePassword} disabled={loading}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2">
                {loading ? (
                  <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> Verifying...</>
                ) : (
                  <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg> Update Password</>
                )}
              </button>
            </div>
          )}

          {/* SESSION TAB */}
          {tab === 'session' && (
            <div className="space-y-4">
              <div className={`p-4 rounded-2xl ${isDark ? 'bg-slate-800' : 'bg-slate-50'}`}>
                <p className={`text-xs font-black uppercase tracking-widest mb-1 ${isDark ? 'text-slate-400' : 'text-slate-400'}`}>Active Session</p>
                <p className={`font-bold text-sm ${isDark ? 'text-white' : 'text-slate-800'}`}>@{username}</p>
                <p className={`text-xs mt-0.5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{profile?.email}</p>
                <div className="flex items-center gap-1.5 mt-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"/>
                  <span className="text-xs font-bold text-emerald-500">Session Active</span>
                </div>
              </div>

              <div className={`p-4 rounded-2xl border ${isDark ? 'bg-rose-900/10 border-rose-800' : 'bg-rose-50 border-rose-200'}`}>
                <p className={`text-xs font-bold mb-1 ${isDark ? 'text-rose-400' : 'text-rose-600'}`}>⚠️ Logout karne se session end ho jayega</p>
                <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Wapas login karna hoga. Aapka data safe rahega.</p>
              </div>

              <button
                onClick={() => { onClose(); setTimeout(onLogout, 200); }}
                className="w-full py-3.5 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                Logout
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

export default ProfileDialog;
