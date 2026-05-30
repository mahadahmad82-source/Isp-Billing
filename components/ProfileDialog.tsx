import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

interface ProfileDialogProps {
  isOpen: boolean;
  onClose: () => void;
  businessName: string;
  username: string;
  onLogout: () => void;
  theme: 'light' | 'dark';
  initialTab?: 'profile' | 'security';
  onUpdateProfile: (updates: { businessPhone?: string; businessAddress?: string; businessEmail?: string }) => void;
  currentPhone?: string;
  currentAddress?: string;
  currentEmail?: string;
}

const ProfileDialog: React.FC<ProfileDialogProps> = ({
  isOpen, onClose, businessName, username, onLogout, theme,
  initialTab = 'profile', onUpdateProfile,
  currentPhone = '', currentAddress = '', currentEmail = ''
}) => {
  const [tab, setTab] = useState<'profile' | 'security'>('profile');
  const [profile, setProfile] = useState<{ email: string; role: string; created_at: string } | null>(null);
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editSuccess, setEditSuccess] = useState('');
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdError, setPwdError] = useState('');
  const [pwdSuccess, setPwdSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTab((initialTab === 'session' ? 'profile' : initialTab) || 'profile');
    setPwdError(''); setPwdSuccess('');
    setOldPwd(''); setNewPwd(''); setConfirmPwd('');
    setEditSuccess('');
    loadProfile();
  }, [isOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const loadProfile = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      setProfile({
        email: user?.email || currentEmail || `${username}@myisp.local`,
        role: user?.email === 'admin@myisp.local' ? 'Admin' : 'Manager',
        created_at: user?.created_at || new Date().toISOString(),
      });
      setEditEmail(currentEmail || user?.email || `${username}@myisp.local`);
    } catch {
      // fallback for localStorage-only mode
      setProfile({
        email: currentEmail || `${username}@myisp.local`,
        role: username === 'admin' ? 'Admin' : 'Manager',
        created_at: new Date().toISOString(),
      });
      setEditEmail(currentEmail || `${username}@myisp.local`);
    }
    setEditPhone(currentPhone);
    setEditAddress(currentAddress);
  };

  const handleSaveProfile = async () => {
    setEditSaving(true);
    try {
      onUpdateProfile({
        businessPhone: editPhone,
        businessAddress: editAddress,
        businessEmail: editEmail,
      });
      setEditSuccess('Profile saved successfully!');
      setTimeout(() => setEditSuccess(''), 3000);
    } catch (e: any) {
      alert('Error: ' + e.message);
    } finally {
      setEditSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setPwdError(''); setPwdSuccess('');
    if (!oldPwd.trim() || !newPwd.trim() || !confirmPwd.trim()) { setPwdError('Please fill all fields.'); return; }
    if (newPwd !== confirmPwd) { setPwdError('New and confirm passwords do not match!'); return; }
    if (newPwd.length < 6) { setPwdError('Password must be at least 6 characters.'); return; }
    if (oldPwd === newPwd) { setPwdError('New password must be different from current.'); return; }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) throw new Error('Session expired. Please login again.');
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: user.email, password: oldPwd });
      if (signInError) { setPwdError('Current password is incorrect!'); setLoading(false); return; }
      const { error: updateError } = await supabase.auth.updateUser({ password: newPwd });
      if (updateError) throw updateError;
      setPwdSuccess('Password updated successfully!');
      setOldPwd(''); setNewPwd(''); setConfirmPwd('');
    } catch (err: any) {
      setPwdError(err.message || 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const isDark = theme === 'dark';

  const readOnlyFields = [
    { label: 'Business Name', value: businessName, icon: <svg className='w-4 h-4 text-indigo-400' fill='none' stroke='currentColor' viewBox='0 0 24 24'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-2 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4'/></svg> },
    { label: 'Username', value: `@${username}`, icon: <svg className='w-4 h-4 text-indigo-400' fill='none' stroke='currentColor' viewBox='0 0 24 24'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z'/></svg> },
    { label: 'Role', value: profile?.role || 'Manager', icon: <svg className='w-4 h-4 text-indigo-400' fill='none' stroke='currentColor' viewBox='0 0 24 24'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z'/></svg> },
    { label: 'Member Since', value: profile?.created_at ? new Date(profile.created_at).toLocaleDateString('en-PK', { dateStyle: 'medium' }) : '—', icon: <svg className='w-4 h-4 text-indigo-400' fill='none' stroke='currentColor' viewBox='0 0 24 24'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2' d='M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z'/></svg> },
  ];

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[999] flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-md" onClick={onClose} />

      {/* Dialog — slides up on mobile, centered on desktop */}
      <div className={`relative z-10 w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl border overflow-hidden flex flex-col
        ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}
        max-h-[92vh] sm:max-h-[88vh]`}>

        {/* ── Header ── */}
        <div className={`flex-shrink-0 px-5 pt-5 pb-4 ${isDark ? 'bg-slate-800' : 'bg-indigo-600'}`}>
          {/* Drag handle (mobile) */}
          <div className="w-10 h-1 rounded-full bg-white/30 mx-auto mb-4 sm:hidden" />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center font-bold text-white text-lg flex-shrink-0">
                {businessName?.charAt(0)?.toUpperCase() || 'M'}
              </div>
              <div>
                <p className="font-black text-white text-sm leading-tight truncate max-w-[180px]">{businessName}</p>
                <p className="text-white/60 text-xs">@{username}</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors flex-shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>

          {/* Tabs — only 2 now */}
          <div className="flex gap-1 mt-4 bg-white/10 rounded-xl p-1">
            {([
              { id: 'profile', label: 'Profile', icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg> },
              { id: 'security', label: 'Security', icon: <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg> },
            ] as const).map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex-1 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-1.5
                  ${tab === t.id ? 'bg-white text-indigo-600 shadow' : 'text-white/70 hover:text-white'}`}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── Scrollable Content ── */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* ── PROFILE TAB ── */}
          {tab === 'profile' && (
            <div className="space-y-3">

              {/* Read-only info — 2 col grid */}
              <div className="grid grid-cols-2 gap-2">
                {readOnlyFields.map((item, idx) => (
                  <div key={idx} className={`flex items-center gap-2 p-3 rounded-2xl border
                    ${isDark ? 'bg-slate-800/60 border-slate-700/50' : 'bg-slate-50 border-slate-100'}`}>
                    <div className={`p-1.5 rounded-xl flex-shrink-0 ${isDark ? 'bg-slate-900' : 'bg-white shadow-sm'}`}>
                      {item.icon}
                    </div>
                    <div className="min-w-0">
                      <p className={`text-[9px] font-black uppercase tracking-wider ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>{item.label}</p>
                      <p className={`text-[11px] font-bold truncate ${isDark ? 'text-white' : 'text-slate-800'}`}>{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Success message */}
              {editSuccess && (
                <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 text-xs font-bold text-center rounded-2xl">
                  ✓ {editSuccess}
                </div>
              )}

              {/* Editable fields */}
              <div className="space-y-2.5">
                {[
                  { label: 'Email', value: editEmail, setter: setEditEmail, placeholder: 'you@example.com', icon: <svg className='w-4 h-4 text-indigo-500' fill='none' stroke='currentColor' viewBox='0 0 24 24'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2.5' d='M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z'/></svg> },
                  { label: 'Phone', value: editPhone, setter: setEditPhone, placeholder: '+92 300 1234567', icon: <svg className='w-4 h-4 text-indigo-500' fill='none' stroke='currentColor' viewBox='0 0 24 24'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2.5' d='M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z'/></svg> },
                  { label: 'Address', value: editAddress, setter: setEditAddress, placeholder: 'Office address', icon: <svg className='w-4 h-4 text-indigo-500' fill='none' stroke='currentColor' viewBox='0 0 24 24'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2.5' d='M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z'/><path strokeLinecap='round' strokeLinejoin='round' strokeWidth='2.5' d='M15 11a3 3 0 11-6 0 3 3 0 016 0z'/></svg> },
                ].map((field, idx) => (
                  <div key={idx} className={`relative rounded-2xl border group overflow-hidden
                    ${isDark ? 'bg-slate-800 border-slate-700 focus-within:border-indigo-500/60' : 'bg-white border-slate-200 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100'}
                    transition-all`}>
                    <div className="absolute left-3.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/30">
                      {field.icon}
                    </div>
                    <label className={`absolute left-14 top-2 text-[9px] font-black uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      {field.label}
                    </label>
                    <input
                      value={field.value}
                      onChange={e => field.setter(e.target.value)}
                      placeholder={field.placeholder}
                      className={`w-full pl-14 pr-4 pt-6 pb-2.5 text-sm font-bold bg-transparent outline-none
                        ${isDark ? 'text-white placeholder-slate-600' : 'text-slate-900 placeholder-slate-400'}`}
                    />
                  </div>
                ))}
              </div>

              <button onClick={handleSaveProfile} disabled={editSaving}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-md shadow-indigo-600/20">
                {editSaving
                  ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>
                  : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"/></svg>
                }
                Save Profile
              </button>
            </div>
          )}

          {/* ── SECURITY TAB ── */}
          {tab === 'security' && (
            <div className="space-y-3">
              <div className={`p-3 rounded-xl border-l-4 ${isDark ? 'bg-sky-900/10 border-sky-500' : 'bg-sky-50 border-sky-400'}`}>
                <p className={`text-[11px] font-bold leading-relaxed ${isDark ? 'text-sky-300' : 'text-sky-700'}`}>
                  Verify your current password to update security credentials.
                </p>
              </div>

              <div className="space-y-2.5">
                {[
                  { label: 'Current Password', value: oldPwd, setter: setOldPwd },
                  { label: 'New Password', value: newPwd, setter: setNewPwd },
                  { label: 'Confirm New Password', value: confirmPwd, setter: setConfirmPwd },
                ].map((field, idx) => (
                  <div key={idx} className={`relative rounded-2xl border transition-all
                    ${isDark ? 'bg-slate-800 border-slate-700 focus-within:border-indigo-500/50' : 'bg-white border-slate-200 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100'}`}>
                    <label className={`absolute left-5 top-2.5 text-[9px] font-black uppercase tracking-widest ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                      {field.label}
                    </label>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={field.value}
                      onChange={e => { field.setter(e.target.value); setPwdError(''); setPwdSuccess(''); }}
                      className={`w-full px-5 pt-7 pb-3 text-sm font-bold bg-transparent outline-none
                        ${isDark ? 'text-white placeholder-slate-600' : 'text-slate-900 placeholder-slate-400'}`}
                    />
                  </div>
                ))}
              </div>

              {pwdError && (
                <div className="flex items-center gap-2 p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 rounded-2xl">
                  <svg className="w-4 h-4 text-rose-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  <p className="text-xs font-bold text-rose-600 dark:text-rose-400">{pwdError}</p>
                </div>
              )}
              {pwdSuccess && (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl">
                  <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 13l4 4L19 7"/></svg>
                  <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">{pwdSuccess}</p>
                </div>
              )}

              <button onClick={handleChangePassword} disabled={loading}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20">
                {loading
                  ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> Verifying...</>
                  : <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/></svg> Update Password</>
                }
              </button>

              {/* Quick logout button at bottom of security tab */}
              <div className={`pt-2 border-t ${isDark ? 'border-slate-800' : 'border-slate-100'}`}>
                <button
                  onClick={() => { onClose(); setTimeout(onLogout, 150); }}
                  className="w-full py-3 rounded-2xl border border-rose-500/30 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 font-black text-xs uppercase tracking-widest transition-all flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfileDialog;
