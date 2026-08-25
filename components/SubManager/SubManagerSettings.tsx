import React, { useEffect, useState } from 'react';
import { SubManagerAccount } from '../../types';

interface Props {
  agent?: SubManagerAccount;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onSave: (updates: Partial<SubManagerAccount>) => void | Promise<void>;
  onBack: () => void;
  onLogout: () => void;
}

export default function SubManagerSettings({ agent, theme, onToggleTheme, onSave, onBack, onLogout }: Props) {
  const [name, setName] = useState(agent?.name || '');
  const [phone, setPhone] = useState(agent?.phone || '');
  const [email, setEmail] = useState(agent?.email || '');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setName(agent?.name || ''); setPhone(agent?.phone || ''); setEmail(agent?.email || ''); }, [agent?.id, agent?.name, agent?.phone, agent?.email]);
  const save = async () => { if (!name.trim()) return; setSaving(true); try { await onSave({ name: name.trim(), phone: phone.trim(), email: email.trim() }); } finally { setSaving(false); } };
  const dark = theme === 'dark';
  return <div className={`min-h-screen px-4 py-6 sm:px-8 ${dark ? 'bg-[#0b0f1a] text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.25em] text-indigo-500">Account workspace</p><h1 className="mt-1 text-2xl font-black uppercase tracking-tight">Sub-Manager Settings</h1><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Update your account profile and app preferences.</p></div><button onClick={onBack} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black uppercase tracking-widest text-slate-500 dark:border-white/10 dark:text-slate-300">Back</button></div>
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-slate-900 sm:p-7"><h2 className="text-sm font-black uppercase tracking-widest">Account profile</h2><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-xs font-bold text-slate-500">Username<input value={agent?.username || ''} readOnly className="mt-2 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-3 text-sm font-bold text-slate-500 dark:border-white/10 dark:bg-white/5" /></label><label className="text-xs font-bold text-slate-500">Display name<input value={name} onChange={e => setName(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold dark:border-white/10 dark:bg-slate-950" /></label><label className="text-xs font-bold text-slate-500">Phone number<input value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold dark:border-white/10 dark:bg-slate-950" /></label><label className="text-xs font-bold text-slate-500">Email address<input value={email} onChange={e => setEmail(e.target.value)} inputMode="email" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold dark:border-white/10 dark:bg-slate-950" /></label></div><button onClick={() => void save()} disabled={saving || !name.trim()} className="mt-5 rounded-xl bg-indigo-600 px-5 py-3 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save profile'}</button></section>
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-slate-900 sm:p-7"><div className="flex items-center justify-between gap-4"><div><h2 className="text-sm font-black uppercase tracking-widest">Appearance</h2><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Light and dark mode is retained across sessions.</p></div><button onClick={onToggleTheme} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black uppercase tracking-widest dark:border-white/10">{dark ? 'Dark mode' : 'Light mode'}</button></div></section>
      <button onClick={onLogout} className="w-full rounded-2xl border border-rose-200 px-4 py-3 text-xs font-black uppercase tracking-widest text-rose-500 dark:border-rose-500/20">Log out</button>
    </div>
  </div>;
}
